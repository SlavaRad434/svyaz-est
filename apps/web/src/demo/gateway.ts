/**
 * Демонстрационная реализация DataGateway.
 *
 * Карта динамическая: getMapCells нарезает видимую область (bbox) на квадраты —
 * около TARGET_COLUMNS колонок по ширине, ряды добиваются покрытие высоты.
 * Ребро квадрата подбирается из окна и меняется при зумировании; данные
 * демо сидят на базовой решётке 250 м и перегруппировываются по геометрии.
 * Оценки пересчитываются по текущему хранилищу — новые замеры перекрашивают
 * ячейки без перезагрузки. Расчёт — чистое ядро packages/domain.
 */
import {
  cellCenter,
  cellIndexAt,
  cellPolygon,
  DEFAULT_METHODOLOGY,
  DEMO_GRID,
  evaluateCell,
  formatCellId,
  lonSpanMeters,
  parseCellId,
  withCellSize,
  type EvaluationObservation,
} from '@svyaz-est/domain';
import {
  failureEventInputSchema,
  measurementInputSchema,
  type AdminObservation,
  type Bbox,
  type CatalogResponse,
  type CellFilters,
  type CellSummary,
  type CreateTestSessionInput,
  type DataGateway,
  type FailureEventInput,
  type GridConfig,
  type MapCellsResponse,
  type MeasurementInput,
  type ModerationAction,
  type ModerationActionEntry,
  type ModerationResult,
  type ObservationReceipt,
  type TestSession,
  type UUID,
} from '@svyaz-est/contracts';
import { buildDemoCatalog, moderationReasonLabel } from './catalog';
import { buildDemoObservations } from './datasets';
import { DemoStore } from './DemoStore';

/** Демо-лимиты тестовой сессии. */
export const DEMO_TRAFFIC_LIMIT_BYTES = 10 * 1024 * 1024;
export const DEMO_DURATION_LIMIT_MS = 30_000;
export const DEMO_METHOD_VERSION = '1';

/** Желаемое число колонок сетки по ширине экрана. */
const TARGET_COLUMNS = 10;

/** Ребро округляется до 10 м: стабильные индексы при микро-изменениях окна. */
const EDGE_STEP_METERS = 10;

/** Минимальное ребро: на сильном зуме не мельчим бесконечно. */
const MIN_EDGE_METERS = 100;

interface DemoTestSession {
  session: TestSession;
  authorId: string | null;
  token: string;
}

export class DemoGateway implements DataGateway {
  readonly store: DemoStore;
  private readonly sessions = new Map<UUID, DemoTestSession>();
  private readonly sessionByKey = new Map<string, DemoTestSession>();
  private readonly receipts = new Map<string, ObservationReceipt>();
  /** Имитация разрыва сети: следующая отправка упадёт (демонстрация US-12). */
  failNextSubmit = false;
  /** Кэш группировки: пересбор нужен только при смене ребра или данных. */
  private groupCache: {
    edgeMeters: number;
    storeVersion: number;
    byCell: Map<string, EvaluationObservation[]>;
  } | null = null;

  constructor(now: Date = new Date()) {
    this.store = new DemoStore();
    this.store.addAll(buildDemoObservations(now));
  }

  async getGrid(): Promise<GridConfig> {
    return DEMO_GRID;
  }

  async getCatalog(): Promise<CatalogResponse> {
    return buildDemoCatalog(DEMO_GRID.gridVersion);
  }

  async getMapCells(filters: CellFilters, bbox?: Bbox): Promise<MapCellsResponse> {
    const now = new Date().toISOString();
    const { grid, cellIds } = this.viewportWindow(bbox);
    const byCell = this.groupByGrid(grid);

    const features = cellIds.map((cellId) => {
      const summary = evaluateCell({
        cellId,
        gridVersion: grid.gridVersion,
        observations: byCell.get(cellId) ?? [],
        filters,
        now,
      });
      return {
        type: 'Feature' as const,
        id: `${cellId}|${filters.operatorId}|${filters.networkType}|${filters.environment}|${filters.profileCode}`,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [cellPolygon(cellId, grid).ring],
        },
        properties: {
          cellId,
          gridVersion: grid.gridVersion,
          status: summary.status,
          sampleCount: summary.sampleCount,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      methodologyVersion: DEFAULT_METHODOLOGY.methodologyVersion,
      calculatedAt: now,
      features,
    };
  }

  async getCellSummary(
    cellId: string,
    filters: CellFilters,
    bbox?: Bbox,
  ): Promise<CellSummary> {
    const { grid } = this.viewportWindow(bbox);
    const byCell = this.groupByGrid(grid);
    return evaluateCell({
      cellId,
      gridVersion: grid.gridVersion,
      observations: byCell.get(cellId) ?? [],
      filters,
      now: new Date().toISOString(),
    });
  }

  /** US-09: список записей для панели модерации (без авторов и координат). */
  async getAdminObservations(): Promise<AdminObservation[]> {
    return this.store.list().map((observation) => ({
      id: observation.id,
      cellId: observation.cellId,
      kind: observation.kind,
      status: observation.status,
      occurredAt: observation.occurredAt,
      authorKind: observation.authorId === null ? 'guest' : 'member',
      downloadMbps: observation.metrics?.downloadMbps ?? null,
      uploadMbps: observation.metrics?.uploadMbps ?? null,
      rttMs: observation.metrics?.rttMs ?? null,
      errorCode: null,
    }));
  }

  /** US-09: скрыть/восстановить запись. Не админ получает отказ (NFR-04). */
  async moderateObservation(
    observationId: UUID,
    action: ModerationAction,
    reasonCode: string,
  ): Promise<ModerationResult> {
    if (this.store.role !== 'admin') {
      throw new Error('DEMO_FORBIDDEN: модерация доступна только администратору');
    }
    const reasonLabel = moderationReasonLabel(reasonCode);
    const applied = this.store.moderate(observationId, action, reasonCode, reasonLabel);
    if (!applied) {
      throw new Error('DEMO_NOT_FOUND: запись не найдена');
    }
    return {
      id: observationId,
      status: action === 'hide' ? 'hidden' : 'active',
      recalculation: 'pending',
    };
  }

  /** US-09 / NFR-09: журнал решений модерации. */
  async getModerationJournal(): Promise<ModerationActionEntry[]> {
    return [...this.store.listModerationActions()];
  }

  async createTestSession(
    input: CreateTestSessionInput,
    token: string,
    idempotencyKey: UUID,
  ): Promise<TestSession> {
    // Повтор создания сессии с тем же ключом возвращает ту же сессию
    // с первоначальным авторством (docs/interfaces.md §6).
    const existingSession = this.sessionByKey.get(idempotencyKey);
    if (existingSession) {
      return existingSession.session;
    }
    const now = Date.now();
    const session: TestSession = {
      id: crypto.randomUUID(),
      attemptId: input.attemptId,
      authorKind: this.store.currentAuthorId === null ? 'guest' : 'member',
      methodVersion: DEMO_METHOD_VERSION,
      serverId: 'demo-server-1',
      expiresAt: new Date(now + DEMO_DURATION_LIMIT_MS).toISOString(),
      acceptUntil: new Date(now + 5 * 60_000).toISOString(),
      trafficLimitBytes: Math.min(input.trafficLimitBytes, DEMO_TRAFFIC_LIMIT_BYTES),
      durationLimitMs: DEMO_DURATION_LIMIT_MS,
    };
    this.sessions.set(session.id, {
      session,
      authorId: this.store.currentAuthorId,
      token,
    });
    this.sessionByKey.set(idempotencyKey, this.sessions.get(session.id)!);
    return session;
  }

  async submitObservation(
    input: MeasurementInput | FailureEventInput,
    token: string,
    idempotencyKey: UUID,
  ): Promise<ObservationReceipt> {
    if (this.failNextSubmit) {
      this.failNextSubmit = false;
      throw new Error('DEMO_NETWORK_DOWN: соединение потеряно, запись осталась в локальной очереди');
    }
    const existing = this.receipts.get(idempotencyKey);
    if (existing) {
      return existing;
    }
    const isFailure = 'stage' in input;
    const parsed = isFailure
      ? failureEventInputSchema.safeParse(input)
      : measurementInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        `DEMO_VALIDATION_ERROR: ${parsed.error.issues[0]?.message ?? 'невалидная запись'}`,
      );
    }

    const testSessionId = input.testSessionId;
    const demoSession = testSessionId ? this.sessions.get(testSessionId) : undefined;
    if (testSessionId) {
      if (!demoSession || demoSession.session.attemptId !== input.attemptId || demoSession.token !== token) {
        throw new Error('DEMO_INVALID_TEST_TOKEN');
      }
    }

    const observation: EvaluationObservation = {
      id: crypto.randomUUID(),
      kind: isFailure ? 'failure-event' : 'measurement',
      attemptId: input.attemptId,
      testSessionId: input.testSessionId,
      // Авторство фиксируется при создании сессии и не меняется после входа.
      authorId: demoSession ? demoSession.authorId : null,
      // Событие ошибки без ячейки не публикуется на карте.
      cellId: input.cellId ?? '__no_cell__',
      occurredAt: input.occurredAt,
      status: 'active',
      operatorId: input.operatorId,
      networkType: input.networkType,
      transport: input.transport,
      vpn: input.vpn,
      environment: input.environment,
      ...('downloadMbps' in input
        ? { metrics: { downloadMbps: input.downloadMbps, uploadMbps: input.uploadMbps, rttMs: input.rttMs } }
        : {}),
    };
    this.store.add(observation);

    const receipt: ObservationReceipt = {
      id: crypto.randomUUID(),
      attemptId: input.attemptId,
      kind: observation.kind,
      status: 'accepted',
      submittedAt: new Date().toISOString(),
    };
    this.receipts.set(idempotencyKey, receipt);
    return receipt;
  }

  /**
   * Динамическое окно по видимой области. Ребро подбирается из ширины так,
   * чтобы по горизонтали помещалось около TARGET_COLUMNS квадратов; ряды
   * нарезаются до полного покрытия высоты. Округление ребра до 10 м держит
   * индексы стабильными при микро-изменениях окна. Без bbox — область пилота.
   * Решётка формально бесконечна: окно строится из индексов независимо от
   * пилотной границы, данные за её пределами просто отсутствуют.
   */
  private viewportWindow(bbox?: Bbox): { grid: GridConfig; cellIds: string[] } {
    const [west, south, east, north] = bbox ?? DEMO_GRID.pilotBoundary;
    const widthMeters = lonSpanMeters(east - west, DEMO_GRID);
    const rawEdge = widthMeters / TARGET_COLUMNS;
    const edge = Math.max(MIN_EDGE_METERS, Math.round(rawEdge / EDGE_STEP_METERS) * EDGE_STEP_METERS);
    const grid = withCellSize(DEMO_GRID, edge);

    // Индексы углов окна; из-за floor покрываем и частичные ряды/колонки.
    const top = cellIndexAt({ longitude: west, latitude: north }, grid);
    const bottom = cellIndexAt({ longitude: east, latitude: south }, grid);
    const cellIds: string[] = [];
    for (let column = top.column; column <= bottom.column; column += 1) {
      for (let row = bottom.row; row <= top.row; row += 1) {
        cellIds.push(formatCellId({ gridVersion: grid.gridVersion, column, row }));
      }
    }
    return { grid, cellIds };
  }

  /**
   * Перегруппировка данных на решётку окна. Демо-наблюдения сидят на базовой
   * решётке 250 м (datasets.ts); центр их базовой ячейки определяет ячейку
   * текущего ребра. Записи без ячейки и чужих версий сетки пропускаются.
   * Результат кэшируется по паре (ребро, версия хранилища): панорамирование
   * с тем же масштабом не пересобирает тысячи наблюдений на каждый шаг.
   */
  private groupByGrid(grid: GridConfig): Map<string, EvaluationObservation[]> {
    const storeVersion = this.store.snapshotVersion;
    const cached = this.groupCache;
    if (cached && cached.edgeMeters === grid.cellSizeMeters && cached.storeVersion === storeVersion) {
      return cached.byCell;
    }
    const byCell = this.buildGroups(grid);
    this.groupCache = { edgeMeters: grid.cellSizeMeters, storeVersion, byCell };
    return byCell;
  }

  private buildGroups(grid: GridConfig): Map<string, EvaluationObservation[]> {
    const byCell = new Map<string, EvaluationObservation[]>();
    for (const observation of this.store.list()) {
      let ref: { gridVersion: string; column: number; row: number };
      try {
        ref = parseCellId(observation.cellId);
      } catch {
        continue;
      }
      if (ref.gridVersion !== DEMO_GRID.gridVersion) {
        continue;
      }
      const point = cellCenter(observation.cellId, DEMO_GRID);
      const index = cellIndexAt(point, grid);
      const cellId = formatCellId({ gridVersion: grid.gridVersion, ...index });
      // evaluateCell сверяет observation.cellId с ячейкой расчёта,
      // поэтому в группу кладётся копия с переписанным идентификатором.
      const remapped: EvaluationObservation = { ...observation, cellId };
      const bucket = byCell.get(cellId);
      if (bucket) {
        bucket.push(remapped);
      } else {
        byCell.set(cellId, [remapped]);
      }
    }
    return byCell;
  }
}
