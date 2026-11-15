/**
 * evaluateCell — чистый расчёт оценки ячейки. docs/interfaces.md §8.
 *
 * Без HTTP, React и БД. Детерминирован: время передаётся в `now`.
 * Гостевые замеры (authorId = null) участвуют в цвете наравне с
 * замерами участников после общих проверок.
 */
import type {
  CellFilters,
  CellStatus,
  CellSummary,
  Environment,
  Instant,
  NetworkType,
  Transport,
  UUID,
  VpnStatus,
} from '@svyaz-est/contracts';
import { DEFAULT_METHODOLOGY, type MethodologyConfig, REASON_CODES } from './methodology';

export interface EvaluationObservation {
  id: UUID;
  kind: 'measurement' | 'failure-event';
  attemptId: UUID;
  testSessionId: UUID | null;
  /** Гость — null. */
  authorId: UUID | null;
  cellId: string;
  occurredAt: Instant;
  /** Скрытые модерацией записи не участвуют. */
  status: 'active' | 'hidden';
  operatorId: string | null;
  networkType: NetworkType;
  transport: Transport;
  vpn: VpnStatus;
  environment: Environment;
  /** Только для kind = measurement. */
  metrics?: {
    downloadMbps: number;
    uploadMbps: number;
    rttMs: number;
  };
}

export interface EvaluationInput {
  cellId: string;
  gridVersion: string;
  observations: EvaluationObservation[];
  filters: CellFilters;
  /** Фиксированное время расчёта. */
  now: Instant;
  config?: MethodologyConfig;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;

function parseInstant(value: Instant): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`INVALID_INSTANT: ${value}`);
  }
  return ms;
}

/** Локальная дата в часовом поясе пилота: YYYY-MM-DD. */
export function localDateString(occurredAt: Instant, pilotUtcOffsetMinutes: number): string {
  const shifted = new Date(parseInstant(occurredAt) + pilotUtcOffsetMinutes * MS_PER_MINUTE);
  return shifted.toISOString().slice(0, 10);
}

function sameGroup(observation: EvaluationObservation, filters: CellFilters): boolean {
  const operatorMatches =
    filters.operatorId === 'unknown'
      ? observation.operatorId === null
      : observation.operatorId === filters.operatorId;
  return (
    operatorMatches &&
    observation.networkType === filters.networkType &&
    observation.environment === filters.environment
  );
}

interface AdmittedMeasurement extends EvaluationObservation {
  weight: number;
}

/**
 * Исключение из мобильной оценки: нужен подтверждённый мобильный транспорт,
 * известный оператор и не обнаруженный VPN (docs/interfaces.md §5).
 */
function checkAdmissibility(
  observation: EvaluationObservation,
  config: MethodologyConfig,
): string | null {
  if (observation.transport !== 'cellular') {
    return REASON_CODES.EXCLUDED_TRANSPORT;
  }
  if (observation.operatorId === null) {
    return REASON_CODES.UNKNOWN_OPERATOR;
  }
  if (observation.vpn === 'detected') {
    return REASON_CODES.VPN_DETECTED;
  }
  if (observation.vpn === 'unknown' && !config.trustUnknownVpn) {
    return REASON_CODES.UNVERIFIED_METADATA;
  }
  return null;
}

/**
 * Один учитываемый вклад: известный автор — один последний валидный замер
 * за сутки (в группе); гость — один итог на тестовую сессию.
 * При равном времени берётся запись с большим id (зафиксированное правило).
 */
function dedupe(
  admitted: AdmittedMeasurement[],
  pilotUtcOffsetMinutes: number,
): AdmittedMeasurement[] {
  const byKey = new Map<string, AdmittedMeasurement>();
  for (const item of admitted) {
    const key =
      item.authorId !== null
        ? `author:${item.authorId}:${localDateString(item.occurredAt, pilotUtcOffsetMinutes)}`
        : `session:${item.testSessionId ?? item.attemptId}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      parseInstant(item.occurredAt) > parseInstant(existing.occurredAt) ||
      (parseInstant(item.occurredAt) === parseInstant(existing.occurredAt) && item.id > existing.id)
    ) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()];
}

function passesProfile(
  observation: EvaluationObservation,
  thresholds: { minDownloadMbps: number; minUploadMbps: number; maxRttMs: number },
): boolean {
  const m = observation.metrics;
  if (!m) {
    return false;
  }
  return (
    m.downloadMbps >= thresholds.minDownloadMbps &&
    m.uploadMbps >= thresholds.minUploadMbps &&
    m.rttMs <= thresholds.maxRttMs
  );
}

export function evaluateCell(input: EvaluationInput): CellSummary {
  const config = input.config ?? DEFAULT_METHODOLOGY;
  const nowMs = parseInstant(input.now);
  const windowFromMs = nowMs - config.windowDays * MS_PER_DAY;
  const periodFromMs = parseInstant(input.filters.periodFrom);
  const periodToMs = parseInstant(input.filters.periodTo);
  const thresholds = config.profiles[input.filters.profileCode];

  /**
   * Два независимых правила включения:
   * - период фильтра — полуинтервал [periodFrom, periodTo);
   * - окно методики — (now − windowDays, now]: замер «только что» валиден,
   *   запись возрастом ровно windowDays уже исключается как старая.
   */
  const withinPeriodAndWindow = (occurredMs: number): boolean =>
    occurredMs >= periodFromMs &&
    occurredMs < periodToMs &&
    occurredMs > windowFromMs &&
    occurredMs <= nowMs;

  const inCell = input.observations.filter((o) => o.cellId === input.cellId);

  // События ошибок: отдельный счётчик, не в скоростные показатели.
  const complaintCount = inCell.filter(
    (o) =>
      o.kind === 'failure-event' &&
      o.status === 'active' &&
      sameGroup(o, input.filters) &&
      withinPeriodAndWindow(parseInstant(o.occurredAt)),
  ).length;

  const exclusionReasons = new Set<string>();
  let sawOldRecord = false;
  let sawGuest = false;

  const candidates: AdmittedMeasurement[] = [];
  for (const observation of inCell) {
    if (observation.kind !== 'measurement' || observation.status !== 'active') {
      continue;
    }
    if (!sameGroup(observation, input.filters)) {
      continue;
    }
    const occurredMs = parseInstant(observation.occurredAt);
    if (!withinPeriodAndWindow(occurredMs)) {
      if (occurredMs <= windowFromMs) {
        sawOldRecord = true;
      }
      continue;
    }
    const exclusion = checkAdmissibility(observation, config);
    if (exclusion) {
      exclusionReasons.add(exclusion);
      continue;
    }
    if (observation.authorId === null) {
      sawGuest = true;
    }
    const ageDays = (nowMs - occurredMs) / MS_PER_DAY;
    candidates.push({
      ...observation,
      weight: Math.pow(2, -ageDays / config.halfLifeDays),
    });
  }

  const counted = dedupe(candidates, config.pilotUtcOffsetMinutes);
  const distinctDates = new Set(
    counted.map((o) => localDateString(o.occurredAt, config.pilotUtcOffsetMinutes)),
  ).size;

  const sampleCount = counted.length;
  const lastOccurred = counted.reduce<number | null>(
    (max, o) => {
      const ms = parseInstant(o.occurredAt);
      return max === null || ms > max ? ms : max;
    },
    null,
  );
  const lastMeasurementDate =
    lastOccurred !== null
      ? localDateString(new Date(lastOccurred).toISOString(), config.pilotUtcOffsetMinutes)
      : null;

  if (sawOldRecord) {
    exclusionReasons.add(REASON_CODES.OLD_RECORD);
  }

  const insufficient = sampleCount < config.minSamples || distinctDates < config.minDates;

  if (insufficient) {
    const reasonCodes: string[] = [];
    if (sampleCount < config.minSamples) {
      reasonCodes.push(REASON_CODES.INSUFFICIENT_SAMPLES);
    }
    if (distinctDates < config.minDates) {
      reasonCodes.push(REASON_CODES.INSUFFICIENT_DATES);
    }
    reasonCodes.push(...exclusionReasons);
    if (sawGuest) {
      reasonCodes.push(REASON_CODES.GUEST_AUTHOR_INDEPENDENCE_UNVERIFIED);
    }
    return {
      cellId: input.cellId,
      gridVersion: input.gridVersion,
      filters: input.filters,
      methodologyVersion: config.methodologyVersion,
      calculatedAt: input.now,
      status: 'insufficient_data',
      reasonCodes,
      sampleCount,
      lastMeasurementDate,
      // Недостаточная выборка: агрегаты null, не нули.
      metrics: { downloadMbps: null, uploadMbps: null, rttMs: null },
      complaintCount,
    };
  }

  const totalWeight = counted.reduce((sum, o) => sum + o.weight, 0);
  const passedWeight = counted.reduce(
    (sum, o) => sum + (passesProfile(o, thresholds) ? o.weight : 0),
    0,
  );
  const passShare = passedWeight / totalWeight;

  let status: CellStatus;
  let profileCode: string;
  if (passShare >= config.greenShare) {
    status = 'green';
    profileCode = REASON_CODES.PROFILE_PASSED;
  } else if (passShare >= config.yellowShare) {
    status = 'yellow';
    profileCode = REASON_CODES.PROFILE_PARTIALLY_PASSED;
  } else {
    status = 'red';
    profileCode = REASON_CODES.PROFILE_FAILED;
  }

  const weightedMetric = (
    pick: (m: NonNullable<EvaluationObservation['metrics']>) => number,
  ): number => {
    const value = counted.reduce(
      (sum, o) => sum + (o.metrics ? pick(o.metrics) * o.weight : 0),
      0,
    );
    return value / totalWeight;
  };

  const reasonCodes = [profileCode, ...exclusionReasons];
  if (sawGuest) {
    reasonCodes.push(REASON_CODES.GUEST_AUTHOR_INDEPENDENCE_UNVERIFIED);
  }

  return {
    cellId: input.cellId,
    gridVersion: input.gridVersion,
    filters: input.filters,
    methodologyVersion: config.methodologyVersion,
    calculatedAt: input.now,
    status,
    reasonCodes,
    sampleCount,
    lastMeasurementDate,
    metrics: {
      downloadMbps: weightedMetric((m) => m.downloadMbps),
      uploadMbps: weightedMetric((m) => m.uploadMbps),
      rttMs: weightedMetric((m) => m.rttMs),
    },
    complaintCount,
  };
}
