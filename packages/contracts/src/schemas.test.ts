import { describe, expect, it } from 'vitest';
import {
  createTestSessionInputSchema,
  failureEventInputSchema,
  measurementInputSchema,
} from './schemas';

/** Контрольный пример: гостевой замер из docs/interfaces.md §5. */
const validGuestMeasurement = {
  attemptId: '74b81009-c326-4eb7-81af-90fb2d7b7dc1',
  testSessionId: '9c0ddfe8-8895-4dc9-9df0-8a00d8315b90',
  gridVersion: 'pilot-v1',
  cellId: 'pilot-v1:12:34',
  occurredAt: '2026-10-28T10:00:00.000Z',
  operatorId: null,
  networkType: 'unknown',
  transport: 'unknown',
  vpn: 'unknown',
  environment: 'unknown',
  downloadMbps: 12.4,
  uploadMbps: 4.8,
  rttMs: 82,
  source: 'builtin-speed-test',
  inputMethod: 'automatic',
  methodVersion: '1',
  metadataProvenance: {
    operatorId: 'unavailable',
    networkType: 'unavailable',
    transport: 'unavailable',
    vpn: 'unavailable',
    environment: 'unavailable',
  },
};

describe('measurementInputSchema', () => {
  it('принимает контрольный гостевой замер из interfaces.md', () => {
    const parsed = measurementInputSchema.safeParse(validGuestMeasurement);
    expect(parsed.success).toBe(true);
  });

  it('отклоняет переданный authorId как неизвестное поле', () => {
    const parsed = measurementInputSchema.safeParse({
      ...validGuestMeasurement,
      authorId: '00000000-0000-4000-8000-000000000001',
    });
    expect(parsed.success).toBe(false);
  });

  it('отклоняет нулевую скорость: пропуск не равен нулю', () => {
    const parsed = measurementInputSchema.safeParse({
      ...validGuestMeasurement,
      downloadMbps: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('отклоняет отрицательный RTT', () => {
    const parsed = measurementInputSchema.safeParse({ ...validGuestMeasurement, rttMs: -1 });
    expect(parsed.success).toBe(false);
  });

  it('отклоняет нестрогий instant без миллисекунд', () => {
    const parsed = measurementInputSchema.safeParse({
      ...validGuestMeasurement,
      occurredAt: '2026-10-28T10:00:00Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('отклоняет неизвестный transport', () => {
    const parsed = measurementInputSchema.safeParse({ ...validGuestMeasurement, transport: 'ethernet' });
    expect(parsed.success).toBe(false);
  });
});

describe('failureEventInputSchema', () => {
  /** Событие ошибки — отдельный DTO без скоростных полей. */
  const validFailureEvent = {
    attemptId: '74b81009-c326-4eb7-81af-90fb2d7b7dc1',
    testSessionId: null,
    gridVersion: null,
    cellId: null,
    occurredAt: '2026-10-28T10:00:00.000Z',
    operatorId: null,
    networkType: 'unknown',
    transport: 'unknown',
    vpn: 'unknown',
    environment: 'unknown',
    stage: 'session',
    errorCode: 'NETWORK_ERROR',
    source: 'builtin-speed-test',
    methodVersion: '1',
    metadataProvenance: {
      operatorId: 'unavailable',
      networkType: 'unavailable',
      transport: 'unavailable',
      vpn: 'unavailable',
      environment: 'unavailable',
    },
  };

  it('принимает событие ошибки до создания сессии с null-полями', () => {
    const parsed = failureEventInputSchema.safeParse(validFailureEvent);
    expect(parsed.success).toBe(true);
  });

  it('отклоняет скоростные поля в событии ошибки: неизвестные поля запрещены', () => {
    const parsed = failureEventInputSchema.safeParse({
      ...validFailureEvent,
      downloadMbps: 12.4,
    });
    expect(parsed.success).toBe(false);
  });

  it('отклоняет событие с кодом ошибки вне справочника', () => {
    const parsed = failureEventInputSchema.safeParse({
      ...validFailureEvent,
      stage: 'download',
      errorCode: 'USER_CANCELLED',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('createTestSessionInputSchema', () => {
  it('принимает валидный вход и отклоняет нецелевой лимит трафика', () => {
    expect(
      createTestSessionInputSchema.safeParse({
        attemptId: '74b81009-c326-4eb7-81af-90fb2d7b7dc1',
        trafficLimitBytes: 10 * 1024 * 1024,
      }).success,
    ).toBe(true);
    expect(
      createTestSessionInputSchema.safeParse({
        attemptId: '74b81009-c326-4eb7-81af-90fb2d7b7dc1',
        trafficLimitBytes: 1.5,
      }).success,
    ).toBe(false);
  });
});
