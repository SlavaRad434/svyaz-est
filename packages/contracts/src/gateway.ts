/**
 * DataGateway — интерфейс адаптера данных (docs/interfaces.md §8).
 * Демо- и HTTP-реализации соблюдают один контракт.
 */
import type {
  AdminObservation,
  Bbox,
  CatalogResponse,
  CellFilters,
  CellSummary,
  CreateTestSessionInput,
  FailureEventInput,
  GridConfig,
  MapCellsResponse,
  MeasurementInput,
  ModerationActionEntry,
  ObservationReceipt,
  OwnObservation,
  TestSession,
  UUID,
} from './types';

export type ModerationAction = 'hide' | 'restore';

export interface ModerationResult {
  id: UUID;
  status: 'active' | 'hidden';
  recalculation: 'pending';
}

export interface DataGateway {
  getGrid(signal?: AbortSignal): Promise<GridConfig>;
  getCatalog(signal?: AbortSignal): Promise<CatalogResponse>;
  getMapCells(
    filters: CellFilters,
    bbox?: Bbox,
    signal?: AbortSignal,
  ): Promise<MapCellsResponse>;
  getCellSummary(
    cellId: string,
    filters: CellFilters,
    bbox?: Bbox,
    signal?: AbortSignal,
  ): Promise<CellSummary>;
  createTestSession(
    input: CreateTestSessionInput,
    token: string,
    idempotencyKey: UUID,
  ): Promise<TestSession>;
  submitObservation(
    input: MeasurementInput | FailureEventInput,
    token: string,
    idempotencyKey: UUID,
  ): Promise<ObservationReceipt>;
  /** US-09: список записей для модерации (только администратор). */
  getAdminObservations(signal?: AbortSignal): Promise<AdminObservation[]>;
  /** US-09: скрыть/восстановить запись с обязательной причиной из справочника. */
  moderateObservation(
    observationId: UUID,
    action: ModerationAction,
    reasonCode: string,
    signal?: AbortSignal,
  ): Promise<ModerationResult>;
  /** US-09 / NFR-09: журнал решений модерации. */
  getModerationJournal(signal?: AbortSignal): Promise<ModerationActionEntry[]>;
  /** US-10: собственные записи участника (гость — пусто, вход требуется). */
  getMyObservations(signal?: AbortSignal): Promise<OwnObservation[]>;
  /** US-10: удалить свой вклад (чужое удаление запрещено). */
  deleteObservation(observationId: UUID, signal?: AbortSignal): Promise<void>;
  /** US-10: удалить аккаунт со всеми своими записями; завершает сессию. */
  deleteAccount(signal?: AbortSignal): Promise<{ requestId: UUID; status: 'accepted' }>;
}
