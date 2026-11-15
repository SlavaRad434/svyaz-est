/**
 * Типы контрактов «СвязьЕсть».
 * Источник: docs/interfaces.md (редакция 28 октября 2026 года).
 * Публичные DTO не содержат authorId: сервер берёт автора из сессии,
 * гость публикует без автора.
 */

export type UUID = string;
/** RFC 3339 UTC, например 2026-10-28T10:00:00Z. */
export type Instant = string;

export type NetworkType = '2g' | '3g' | '4g' | '5g' | 'unknown';
export type Transport = 'cellular' | 'wifi' | 'other' | 'unknown';
export type Environment = 'indoor' | 'outdoor' | 'unknown';
export type VpnStatus = 'detected' | 'not-detected' | 'unknown';
export type ProfileCode = 'basic' | 'video-call';
export type CellStatus = 'green' | 'yellow' | 'red' | 'insufficient_data';

export type MetadataField =
  | 'operatorId'
  | 'networkType'
  | 'transport'
  | 'vpn'
  | 'environment';

/** Код источника метаданных из версионированного справочника, включая unavailable. */
export type MetadataProvenanceCode = string;

export type Actor = { kind: 'guest' } | { kind: 'member'; userId: UUID };

export interface CreateTestSessionInput {
  attemptId: UUID;
  /** Целое, положительное, не выше серверного лимита. */
  trafficLimitBytes: number;
}

export interface TestSession {
  id: UUID;
  attemptId: UUID;
  /** Без публичного userId. */
  authorKind: 'guest' | 'member';
  methodVersion: string;
  serverId: string;
  /** Конец разрешённого измерения. */
  expiresAt: Instant;
  /** Более поздний срок доставки результата. */
  acceptUntil: Instant;
  trafficLimitBytes: number;
  /** Не более 30000. */
  durationLimitMs: number;
}

export interface Metadata {
  operatorId: string | null;
  networkType: NetworkType;
  transport: Transport;
  vpn: VpnStatus;
  environment: Environment;
  metadataProvenance: Record<MetadataField, MetadataProvenanceCode>;
}

export interface MeasurementInput extends Metadata {
  attemptId: UUID;
  testSessionId: UUID;
  gridVersion: string;
  cellId: string;
  occurredAt: Instant;
  downloadMbps: number;
  uploadMbps: number;
  rttMs: number;
  source: 'builtin-speed-test';
  inputMethod: 'automatic';
  methodVersion: string;
}

export interface FailureEventInput extends Metadata {
  attemptId: UUID;
  testSessionId: UUID | null;
  gridVersion: string | null;
  cellId: string | null;
  occurredAt: Instant;
  stage: 'session' | 'probe' | 'download' | 'upload';
  errorCode: 'NETWORK_ERROR' | 'TIMEOUT' | 'SERVER_ERROR';
  source: 'builtin-speed-test';
  methodVersion: string;
}

export interface ObservationReceipt {
  id: UUID;
  attemptId: UUID;
  kind: 'measurement' | 'failure-event';
  /** Приём, а не обещание участия в рейтинге. */
  status: 'accepted';
  submittedAt: Instant;
}

export interface CellFilters {
  operatorId: string | 'unknown';
  networkType: NetworkType;
  environment: Environment;
  periodFrom: Instant;
  periodTo: Instant;
  profileCode: ProfileCode;
}

export interface CellSummaryMetrics {
  downloadMbps: number | null;
  uploadMbps: number | null;
  rttMs: number | null;
}

export interface CellSummary {
  cellId: string;
  gridVersion: string;
  filters: CellFilters;
  methodologyVersion: string;
  calculatedAt: Instant;
  status: CellStatus;
  reasonCodes: string[];
  /** После всех исключений, включая допустимые гостевые. */
  sampleCount: number;
  /** Публичная дата последнего замера YYYY-MM-DD в часовом поясе пилота. */
  lastMeasurementDate: string | null;
  metrics: CellSummaryMetrics;
  /** Историческое имя счётчика автоматических событий ошибок. */
  complaintCount: number;
}

/** [west, south, east, north] в WGS84. */
export type Bbox = [number, number, number, number];

export interface GridConfig {
  gridVersion: string;
  cellSizeMeters: number;
  crs: string;
  projectionDefinition: string;
  originEasting: number;
  originNorthing: number;
  pilotBoundary: Bbox;
  timezone: string;
  /** Параметры демо-проекции: локальная равнопромежуточная вокруг центра пилота. */
  projectionParams?: LocalEquirectangularParams;
}

export interface LocalEquirectangularParams {
  type: 'local-equirectangular';
  centerLongitude: number;
  centerLatitude: number;
}

export interface GeoPoint {
  longitude: number;
  latitude: number;
}

/** Краткая оценка ячейки для карты: GET /map/cells (docs/interfaces.md §4). */
export interface CellFeatureProperties {
  cellId: string;
  gridVersion: string;
  status: CellStatus;
  sampleCount: number;
}

export interface CellMapFeature {
  type: 'Feature';
  /** cellId + groupKey; демо использует одну группу фильтров. */
  id: string;
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  properties: CellFeatureProperties;
}

export interface MapCellsResponse {
  type: 'FeatureCollection';
  methodologyVersion: string;
  calculatedAt: Instant;
  features: CellMapFeature[];
}

/** GET /catalog: операторы, профили, версия методики. */
export interface OperatorRef {
  id: string;
  name: string;
}

export interface ProfileRef {
  code: ProfileCode;
  name: string;
  minDownloadMbps: number;
  minUploadMbps: number;
  maxRttMs: number;
}

export interface ModerationReason {
  code: string;
  label: string;
}

export interface CatalogResponse {
  operators: OperatorRef[];
  profiles: ProfileRef[];
  /** Справочник причин модерации (US-09): свободный текст исключён. */
  moderationReasons: ModerationReason[];
  methodologyVersion: string;
  gridVersion: string;
}

/** Строка списка записей для модерации (US-09, доступ администратора). */
export interface AdminObservation {
  id: UUID;
  cellId: string;
  kind: 'measurement' | 'failure-event';
  status: 'active' | 'hidden';
  occurredAt: Instant;
  authorKind: 'guest' | 'member';
  downloadMbps: number | null;
  uploadMbps: number | null;
  rttMs: number | null;
  errorCode: string | null;
}

/** Запись журнала решений модерации (NFR-09): кто, когда, что и почему. */
export interface ModerationActionEntry {
  id: UUID;
  observationId: UUID;
  moderatorId: UUID;
  action: 'hide' | 'restore';
  reasonCode: string;
  reasonLabel: string;
  createdAt: Instant;
}

/** Собственная запись участника (US-10, раздел «Мои записи»). */
export interface OwnObservation {
  id: UUID;
  cellId: string;
  kind: 'measurement' | 'failure-event';
  status: 'active' | 'hidden';
  occurredAt: Instant;
  downloadMbps: number | null;
  uploadMbps: number | null;
  rttMs: number | null;
}

/** Журнал удалений (NFR-05/09): переживает удалённые объекты для бэкапов. */
export interface DeletionEventEntry {
  id: UUID;
  targetType: 'observation' | 'account';
  targetId: UUID;
  requestedAt: Instant;
}
