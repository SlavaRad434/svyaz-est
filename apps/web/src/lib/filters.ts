/**
 * Фильтры карты и карточки в параметрах URL: состояние переживает
 * возврат с теста и методики (docs/wireframes/README.md).
 */
import type { CellFilters, Environment, NetworkType, ProfileCode } from '@svyaz-est/contracts';

export const PERIOD_PRESETS = [7, 14, 30] as const;
export type PeriodDays = (typeof PERIOD_PRESETS)[number];

export interface ParsedQuery {
  filters: CellFilters;
  periodDays: PeriodDays;
  selectedCellId: string | null;
}

export function defaultFilters(now: Date = new Date()): CellFilters {
  return {
    operatorId: 'operator-mts',
    networkType: '4g',
    environment: 'outdoor',
    periodFrom: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
    periodTo: now.toISOString(),
    profileCode: 'basic',
  };
}

function readEnum<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseQuery(query: URLSearchParams, now: Date = new Date()): ParsedQuery {
  const daysRaw = Number(query.get('days'));
  const periodDays = (PERIOD_PRESETS as readonly number[]).includes(daysRaw)
    ? (daysRaw as PeriodDays)
    : 30;
  const filters: CellFilters = {
    operatorId: query.get('op') ?? 'operator-mts',
    networkType: readEnum<NetworkType>(
      query.get('net'),
      ['2g', '3g', '4g', '5g', 'unknown'],
      '4g',
    ),
    environment: readEnum<Environment>(
      query.get('env'),
      ['indoor', 'outdoor', 'unknown'],
      'outdoor',
    ),
    periodFrom: new Date(now.getTime() - periodDays * 86_400_000).toISOString(),
    periodTo: now.toISOString(),
    profileCode: readEnum<ProfileCode>(query.get('prof'), ['basic', 'video-call'], 'basic'),
  };
  return {
    filters,
    periodDays,
    selectedCellId: query.get('cell'),
  };
}

export function filtersToQuery(
  filters: CellFilters,
  periodDays: PeriodDays,
  selectedCellId: string | null,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('op', filters.operatorId);
  params.set('net', filters.networkType);
  params.set('env', filters.environment);
  params.set('prof', filters.profileCode);
  params.set('days', String(periodDays));
  if (selectedCellId) {
    params.set('cell', selectedCellId);
  }
  return params;
}
