/**
 * Модульные тесты локальной очереди US-12: сохранение до доставки,
 * удаление после успеха, счётчик попыток и причина при ошибке,
 * восстановление из хранилища после «перезагрузки приложения».
 */
import { describe, expect, it } from 'vitest';
import { InMemoryAdapter, PendingQueue, type PendingDelivery } from './queue';

function makeEntry(overrides: Partial<PendingDelivery> = {}) {
  return {
    input: { attemptId: 'a', cellId: 'demo-izh-v1:0:0' },
    attemptToken: 'token-1',
    idempotencyKey: 'key-1',
    enqueuedAt: new Date('2026-11-15T12:00:00Z').toISOString(),
    ...overrides,
  };
}

describe('PendingQueue (US-12)', () => {
  it('сохраняет запись до доставки и отдаёт её в списке', () => {
    const adapter = new InMemoryAdapter();
    const queue = new PendingQueue(adapter);
    const item = queue.enqueue(makeEntry());
    expect(queue.list()).toHaveLength(1);
    expect(queue.list()[0]).toMatchObject({
      id: item.id,
      attemptToken: 'token-1',
      idempotencyKey: 'key-1',
      attempts: 0,
    });
    // Запись прошла через адаптер хранилища — «переживёт» перезагрузку.
    expect(adapter.read()).toContain('key-1');
  });

  it('восстанавливает очередь из хранилища в новом экземпляре', () => {
    const adapter = new InMemoryAdapter();
    const first = new PendingQueue(adapter);
    first.enqueue(makeEntry());
    first.enqueue(makeEntry({ idempotencyKey: 'key-2', attemptToken: 'token-2' }));

    // «Перезагрузка приложения»: новый экземпляр на том же хранилище.
    const restored = new PendingQueue(adapter);
    expect(restored.list()).toHaveLength(2);
    expect(restored.list().map((item) => item.idempotencyKey)).toEqual(['key-1', 'key-2']);
  });

  it('успешная доставка удаляет запись и возвращает число доставленных', async () => {
    const queue = new PendingQueue(new InMemoryAdapter());
    queue.enqueue(makeEntry());
    queue.enqueue(makeEntry({ idempotencyKey: 'key-2', attemptToken: 'token-2' }));

    const deliveredKeys: string[] = [];
    const count = await queue.deliverAll(async (_input, _token, key) => {
      deliveredKeys.push(key);
    });

    expect(count).toBe(2);
    expect(deliveredKeys).toEqual(['key-1', 'key-2']);
    expect(queue.list()).toHaveLength(0);
  });

  it('неудачная доставка сохраняет запись, растит попытки и фиксирует причину', async () => {
    const queue = new PendingQueue(new InMemoryAdapter());
    const item = queue.enqueue(makeEntry());

    const count = await queue.deliverAll(async () => {
      throw new Error('DEMO_NETWORK_DOWN: соединение потеряно');
    });

    expect(count).toBe(0);
    expect(queue.list()).toHaveLength(1);
    expect(queue.list()[0]).toMatchObject({
      id: item.id,
      attempts: 1,
      lastError: expect.stringContaining('DEMO_NETWORK_DOWN'),
    });
  });

  it('передаёт в доставку неизменные токен и ключ идемпотентности', async () => {
    const queue = new PendingQueue(new InMemoryAdapter());
    queue.enqueue(makeEntry({ attemptToken: 'token-fixed', idempotencyKey: 'key-fixed' }));

    const seen: { token: string; key: string }[] = [];
    await queue.deliverAll(async (_input, token, key) => {
      seen.push({ token, key });
    });

    expect(seen).toEqual([{ token: 'token-fixed', key: 'key-fixed' }]);
  });
});
