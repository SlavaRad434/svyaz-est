/**
 * Интеграционные тесты ЛР 3: сквозные сценарии демо-шлюза и очереди.
 * Проверяют требования ЛР 1 на уровне «модули работают вместе»:
 * NFR-07 (повтор без дубля), US-05 (авторство гостя зафиксировано при
 * создании сессии), US-08/NFR-08 (скрытие записи меняет агрегат),
 * US-12 (очередь: разрыв сети → повторная доставка без дубля).
 */
import { describe, expect, it } from 'vitest';
import type { MeasurementInput, UUID } from '@svyaz-est/contracts';
import { DemoGateway } from './gateway';
import { InMemoryAdapter, PendingQueue } from '../lib/queue';

const NOW = '2026-11-15T12:00:00.000Z';

const FILTERS = {
  operatorId: 'operator-mts',
  networkType: '4g' as const,
  environment: 'outdoor' as const,
  profileCode: 'basic' as const,
  periodFrom: '2026-01-01T00:00:00Z',
  periodTo: '2027-01-01T00:00:00Z',
};

function buildMeasurement(attemptId: UUID, testSessionId: UUID, cellId: string): MeasurementInput {
  return {
    operatorId: 'operator-mts',
    networkType: '4g',
    transport: 'cellular',
    vpn: 'not-detected',
    environment: 'outdoor',
    metadataProvenance: {
      operatorId: 'demo',
      networkType: 'demo',
      transport: 'demo',
      vpn: 'demo',
      environment: 'demo',
    },
    attemptId,
    testSessionId,
    gridVersion: 'demo-izh-v1',
    cellId,
    occurredAt: NOW,
    downloadMbps: 25,
    uploadMbps: 10,
    rttMs: 50,
    source: 'builtin-speed-test',
    inputMethod: 'automatic',
    methodVersion: '1',
  };
}

describe('DemoGateway — интеграция', () => {
  it('повтор отправки с тем же ключом не создаёт дубль (NFR-07)', async () => {
    const gateway = new DemoGateway(new Date(NOW));
    const attemptId = crypto.randomUUID();
    const session = await gateway.createTestSession(
      { attemptId, trafficLimitBytes: 1024 },
      'token',
      'key-1',
    );
    const input = buildMeasurement(attemptId, session.id, 'demo-izh-v1:15:15');

    const first = await gateway.submitObservation(input, 'token', 'key-1');
    const second = await gateway.submitObservation(input, 'token', 'key-1');

    expect(second).toEqual(first);
    const byAttempt = gateway.store.list().filter((o) => o.attemptId === attemptId);
    expect(byAttempt).toHaveLength(1);
  });

  it('авторство гостя зафиксировано при создании сессии и не меняется после входа (US-05)', async () => {
    const gateway = new DemoGateway(new Date(NOW));
    // Гость создаёт тестовую сессию…
    const attemptId = crypto.randomUUID();
    const session = await gateway.createTestSession(
      { attemptId, trafficLimitBytes: 1024 },
      'token',
      'key-guest',
    );
    expect(session.authorKind).toBe('guest');
    // …и только потом «входит» в аккаунт.
    gateway.store.setRole('member');

    await gateway.submitObservation(buildMeasurement(attemptId, session.id, 'demo-izh-v1:15:15'), 'token', 'key-guest');

    const observation = gateway.store.list().find((o) => o.attemptId === attemptId);
    expect(observation).toBeDefined();
    expect(observation!.authorId).toBeNull();
  });

  it('скрытие записи модератором уменьшает выборку ячейки (US-08, NFR-08)', async () => {
    const gateway = new DemoGateway(new Date(NOW));
    const cellId = 'demo-izh-v1:15:15'; // за пределами сеяного облака и сценарных ячеек
    for (let i = 0; i < 2; i += 1) {
      const attemptId = crypto.randomUUID();
      const session = await gateway.createTestSession(
        { attemptId, trafficLimitBytes: 1024 },
        `token-${i}`,
        `key-${i}`,
      );
      await gateway.submitObservation(buildMeasurement(attemptId, session.id, cellId), `token-${i}`, `key-${i}`);
    }

    // Окно с ребром 250 м покрывает целевую ячейку (индексы 12–22 по обеим осям).
    const metersPerDegLon = 60854;
    const metersPerDegLat = 111194.9;
    const lon0 = 53.2115;
    const lat0 = 56.8519;
    const bbox = [
      lon0 + 3000 / metersPerDegLon,
      lat0 + 3000 / metersPerDegLat,
      lon0 + 5500 / metersPerDegLon,
      lat0 + 5500 / metersPerDegLat,
    ] as [number, number, number, number];

    const before = await gateway.getCellSummary(cellId, FILTERS, bbox);
    expect(before.sampleCount).toBe(2);

    // Модератор скрывает одну из двух записей.
    const target = gateway.store.list().find((o) => o.cellId === cellId && o.status === 'active');
    expect(target).toBeDefined();
    expect(gateway.store.setStatus(target!.id, 'hidden')).toBe(true);

    const after = await gateway.getCellSummary(cellId, FILTERS, bbox);
    expect(after.sampleCount).toBe(1);
  });

  it('очередь: разрыв сети сохраняет запись, повторная доставка не создаёт дубль (US-12)', async () => {
    const gateway = new DemoGateway(new Date(NOW));
    const queue = new PendingQueue(new InMemoryAdapter());
    const attemptId = crypto.randomUUID();
    const session = await gateway.createTestSession(
      { attemptId, trafficLimitBytes: 1024 },
      'attempt-token',
      'idem-key',
    );
    const input = buildMeasurement(attemptId, session.id, 'demo-izh-v1:15:15');

    // Разрыв сети: доставка падает, запись остаётся сохранённой в очереди.
    gateway.failNextSubmit = true;
    queue.enqueue({ input, attemptToken: 'attempt-token', idempotencyKey: 'idem-key', enqueuedAt: NOW });
    const deliveredOnFailure = await queue.deliverAll(async (value, token, key) => {
      await gateway.submitObservation(value as MeasurementInput, token, key);
    });
    expect(deliveredOnFailure).toBe(0);
    expect(queue.list()).toHaveLength(1);
    expect(queue.list()[0]!.attempts).toBe(1);

    // Сеть восстановилась: повторная доставка с теми же токеном и ключом.
    gateway.failNextSubmit = false;
    const deliveredOnRetry = await queue.deliverAll(async (value, token, key) => {
      await gateway.submitObservation(value as MeasurementInput, token, key);
    });
    expect(deliveredOnRetry).toBe(1);
    expect(queue.list()).toHaveLength(0);

    const byAttempt = gateway.store.list().filter((o) => o.attemptId === attemptId);
    expect(byAttempt).toHaveLength(1);
  });
});
