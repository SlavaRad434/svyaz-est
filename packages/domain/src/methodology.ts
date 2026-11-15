/**
 * Конфигурация методики оценки «2-guest-draft».
 * Источник: docs/interfaces.md §8, docs/implementation-plan.md §5.
 * Стартовые параметры — гипотезы до полевой калибровки.
 */
import type { ProfileCode } from '@svyaz-est/contracts';

export interface TaskProfileThresholds {
  name: string;
  minDownloadMbps: number;
  minUploadMbps: number;
  maxRttMs: number;
}

export interface MethodologyConfig {
  methodologyVersion: string;
  /** Окно учёта замеров, дней. */
  windowDays: number;
  /** Полураспад веса замера, дней: вес = 2^(−возраст/полураспад). */
  halfLifeDays: number;
  /** Минимум учтённых замеров из разных тестовых сессий. */
  minSamples: number;
  /** Минимум разных дат среди учтённых замеров. */
  minDates: number;
  /** Доля прошедших профиль для зелёного статуса (включительно). */
  greenShare: number;
  /** Доля для жёлтого статуса (включительно), ниже — красный. */
  yellowShare: number;
  /**
   * Доверять ли vpn: unknown. По умолчанию нет: запись исключается
   * с UNVERIFIED_METADATA (docs/interfaces.md §5).
   */
  trustUnknownVpn: boolean;
  /** Фиксированный сдвиг часового пояса пилота для границ суток, минут. */
  pilotUtcOffsetMinutes: number;
  profiles: Record<ProfileCode, TaskProfileThresholds>;
}

export const METHODOLOGY_VERSION = '2-guest-draft';

export const DEFAULT_METHODOLOGY: MethodologyConfig = {
  methodologyVersion: METHODOLOGY_VERSION,
  windowDays: 30,
  halfLifeDays: 14,
  minSamples: 5,
  minDates: 2,
  greenShare: 0.8,
  yellowShare: 0.5,
  trustUnknownVpn: false,
  // Ижевск, фиксированный сдвиг без перехода на летнее время.
  pilotUtcOffsetMinutes: 240,
  profiles: {
    basic: {
      name: 'Базовые задачи',
      minDownloadMbps: 1,
      minUploadMbps: 0.5,
      maxRttMs: 300,
    },
    'video-call': {
      name: 'Видеозвонок',
      minDownloadMbps: 5,
      minUploadMbps: 3,
      maxRttMs: 150,
    },
  },
};

/** Коды причин в CellSummary.reasonCodes. */
export const REASON_CODES = {
  INSUFFICIENT_SAMPLES: 'INSUFFICIENT_SAMPLES',
  INSUFFICIENT_DATES: 'INSUFFICIENT_DATES',
  EXCLUDED_TRANSPORT: 'EXCLUDED_TRANSPORT',
  UNKNOWN_OPERATOR: 'UNKNOWN_OPERATOR',
  VPN_DETECTED: 'VPN_DETECTED',
  UNVERIFIED_METADATA: 'UNVERIFIED_METADATA',
  OLD_RECORD: 'OLD_RECORD',
  PROFILE_PASSED: 'PROFILE_PASSED',
  PROFILE_PARTIALLY_PASSED: 'PROFILE_PARTIALLY_PASSED',
  PROFILE_FAILED: 'PROFILE_FAILED',
  GUEST_AUTHOR_INDEPENDENCE_UNVERIFIED: 'GUEST_AUTHOR_INDEPENDENCE_UNVERIFIED',
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];
