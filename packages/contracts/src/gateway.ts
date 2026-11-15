/**
 * DataGateway — интерфейс адаптера данных (docs/interfaces.md §8).
 * Демо- и HTTP-реализации соблюдают один контракт.
 */
import type {
  Bbox,
  CatalogResponse,
  CellFilters,
  CellSummary,
  CreateTestSessionInput,
  FailureEventInput,
  GridConfig,
  MapCellsResponse,
  MeasurementInput,
  ObservationReceipt,
  TestSession,
  UUID,
} from './types';

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
}
