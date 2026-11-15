/**
 * Демонстрационный справочник. Демо-режим обозначен явно;
 * данные не являются реальными замерами.
 */
import { DEFAULT_METHODOLOGY } from '@svyaz-est/domain';
import type { CatalogResponse, ModerationReason, OperatorRef } from '@svyaz-est/contracts';

export const DEMO_OPERATORS: OperatorRef[] = [
  { id: 'operator-mts', name: 'МТС' },
  { id: 'operator-beeline', name: 'Билайн' },
  { id: 'operator-megafon', name: 'Мегафон' },
];

/** Справочник причин модерации (US-09): причина выбирается, не набирается. */
export const DEMO_MODERATION_REASONS: ModerationReason[] = [
  { code: 'SUSPECTED_MANIPULATION', label: 'Подозрение на накрутку' },
  { code: 'DATA_ERROR', label: 'Ошибка данных замера' },
  { code: 'IMPOSSIBLE_VALUES', label: 'Нереалистичные значения' },
  { code: 'USER_COMPLAINT', label: 'Жалоба пользователя' },
];

export function moderationReasonLabel(code: string): string {
  return DEMO_MODERATION_REASONS.find((reason) => reason.code === code)?.label ?? code;
}

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
    moderationReasons: DEMO_MODERATION_REASONS,
    methodologyVersion: DEFAULT_METHODOLOGY.methodologyVersion,
    gridVersion,
  };
}
