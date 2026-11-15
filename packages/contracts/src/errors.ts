/**
 * Коды ошибок API. Источник: docs/interfaces.md §7.
 * 4xx кроме 409/422 не повторяются автоматически; 429 и 5xx — повторяются очередью.
 */

export const ERROR_CODES = [
  'INVALID_JSON',
  'MISSING_IDEMPOTENCY_KEY',
  'AUTH_REQUIRED',
  'INVALID_TEST_TOKEN',
  'FORBIDDEN',
  'CELL_NOT_FOUND',
  'OBSERVATION_NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'ATTEMPT_ALREADY_FINALIZED',
  'GRID_VERSION_MISMATCH',
  'DELIVERY_EXPIRED',
  'TEST_SESSION_EXPIRED',
  'TRAFFIC_LIMIT_EXCEEDED',
  'VALIDATION_ERROR',
  'FILTER_GROUP_REQUIRED',
  'RATE_LIMITED',
  'TEMPORARILY_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}
