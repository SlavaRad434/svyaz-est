/**
 * Демонстрационный справочник. Демо-режим обозначен явно;
 * данные не являются реальными замерами.
 */
import { DEFAULT_METHODOLOGY } from '@svyaz-est/domain';
import type { CatalogResponse, OperatorRef } from '@svyaz-est/contracts';

export const DEMO_OPERATORS: OperatorRef[] = [
  { id: 'operator-mts', name: 'МТС' },
  { id: 'operator-beeline', name: 'Билайн' },
  { id: 'operator-megafon', name: 'Мегафон' },
];

export function buildDemoCatalog(gridVersion: string): CatalogResponse {
  return {
    operators: DEMO_OPERATORS,
    profiles: [
      {
        code: 'basic',
        name: DEFAULT_METHODOLOGY.profiles.basic.name,
        minDownloadMbps: DEFAULT_METHODOLOGY.profiles.basic.minDownloadMbps,
        minUploadMbps: DEFAULT_METHODOLOGY.profiles.basic.minUploadMbps,
        maxRttMs: DEFAULT_METHODOLOGY.profiles.basic.maxRttMs,
      },
      {
        code: 'video-call',
        name: DEFAULT_METHODOLOGY.profiles['video-call'].name,
        minDownloadMbps: DEFAULT_METHODOLOGY.profiles['video-call'].minDownloadMbps,
        minUploadMbps: DEFAULT_METHODOLOGY.profiles['video-call'].minUploadMbps,
        maxRttMs: DEFAULT_METHODOLOGY.profiles['video-call'].maxRttMs,
      },
    ],
    methodologyVersion: DEFAULT_METHODOLOGY.methodologyVersion,
    gridVersion,
  };
}
