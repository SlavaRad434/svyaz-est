/**
 * Симулятор встроенного теста связи (демо).
 * Реальные измерения — этап 8 плана; демо воспроизводит этапы, исходы
 * и автоматическое формирование записи без редактируемых полей.
 *
 * Исходы соответствуют MeasurementOutcome из docs/interfaces.md §8:
 * publishable / failure / local-only / cancelled.
 */
import type {
  FailureEventInput,
  MeasurementInput,
  TestSession,
} from '@svyaz-est/contracts';
import { DEMO_METHOD_VERSION } from './gateway';

export type DemoTestOutcomePreset =
  | 'success'
  | 'failure'
  | 'location-denied'
  | 'mixed'
  | 'unknown-metadata';

export interface DemoTestRequest {
  outcome: DemoTestOutcomePreset;
  /** Ячейка «текущей позиции» в демо: центр пилота. */
  cellId: string;
  gridVersion: string;
  signal: AbortSignal;
  onStage: (stage: DemoTestStage) => void;
}

export type DemoTestStage =
  | { phase: 'preparation'; label: string; progress: number }
  | { phase: 'probe'; label: string; progress: number; rttMs: number | null }
  | { phase: 'download'; label: string; progress: number }
  | { phase: 'upload'; label: string; progress: number }
  | { phase: 'finishing'; label: string; progress: number };

export type DemoTestResult =
  | { kind: 'publishable'; input: MeasurementInput }
  | { kind: 'failure'; input: FailureEventInput }
  | {
      kind: 'local-only';
      reason: 'LOCATION_UNAVAILABLE';
      metrics: { downloadMbps: number; uploadMbps: number; rttMs: number };
    }
  | { kind: 'cancelled' };

const STAGE_STEP_MS = 120;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Метаданные теста. Реальные браузерные API отдают unknown — такие записи
 * по методике исключаются из мобильного рейтинга. Демо симулирует
 * подтверждённые платформой метаданные (пресет unknown-metadata показывает
 * честный браузерный случай).
 */
function buildMetadata(outcome: DemoTestOutcomePreset) {
  if (outcome === 'unknown-metadata') {
    return {
      operatorId: null,
      networkType: 'unknown' as const,
      transport: 'unknown' as const,
      vpn: 'unknown' as const,
      environment: 'unknown' as const,
      metadataProvenance: {
        operatorId: 'unavailable',
        networkType: 'unavailable',
        transport: 'unavailable',
        vpn: 'unavailable',
        environment: 'unavailable',
      },
    };
  }
  return {
    operatorId: 'operator-mts',
    networkType: '4g' as const,
    transport: 'cellular' as const,
    vpn: 'not-detected' as const,
    environment: 'outdoor' as const,
    metadataProvenance: {
      operatorId: 'demo-simulated',
      networkType: 'demo-simulated',
      transport: 'demo-simulated',
      vpn: 'demo-simulated',
      environment: 'demo-simulated',
    },
  };
}

/**
 * Прогоняет симулированный тест. Отмена через AbortSignal даёт kind: cancelled
 * и не создаёт события сетевой ошибки (docs/architecture.md §3.4).
 */
export async function runDemoTest(
  session: TestSession,
  request: DemoTestRequest,
): Promise<DemoTestResult> {
  const { signal, onStage } = request;

  const runProgress = async (
    phase: DemoTestStage['phase'],
    label: string,
    steps: number,
    extra?: (progress: number) => Partial<DemoTestStage>,
  ) => {
    for (let i = 1; i <= steps; i += 1) {
      await sleep(STAGE_STEP_MS, signal);
      const progress = i / steps;
      onStage({ phase, label, progress, ...extra?.(progress) } as DemoTestStage);
    }
  };

  try {
    onStage({ phase: 'preparation', label: 'Подготовка теста', progress: 0 });
    await runProgress('preparation', 'Запрос геолокации', 4);
    await runProgress('probe', 'Проверка отклика', 5, (p) => ({ rttMs: Math.round(40 + p * 60) }));
    await runProgress('download', 'Загрузка', 10);
    await runProgress('upload', 'Отправка', 8);
    onStage({ phase: 'finishing', label: 'Расчёт результата', progress: 1 });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { kind: 'cancelled' };
    }
    throw error;
  }

  const metrics = {
    downloadMbps: Number(randomBetween(8, 40).toFixed(1)),
    uploadMbps: Number(randomBetween(3, 15).toFixed(1)),
    rttMs: Math.round(randomBetween(40, 180)),
  };
  const occurredAt = new Date().toISOString();

  // Запланированный провал: mixed падает на download примерно в половине случаев.
  const shouldFail =
    request.outcome === 'failure' ||
    (request.outcome === 'mixed' && Math.random() < 0.5);

  if (shouldFail) {
    return {
      kind: 'failure',
      input: {
        ...buildMetadata(request.outcome),
        attemptId: session.attemptId,
        testSessionId: session.id,
        gridVersion: request.gridVersion,
        cellId: request.cellId,
        occurredAt,
        stage: 'download',
        errorCode: 'TIMEOUT',
        source: 'builtin-speed-test',
        methodVersion: DEMO_METHOD_VERSION,
      },
    };
  }

  if (request.outcome === 'location-denied') {
    // Геолокация недоступна: локальный результат, без публикации на карте.
    return { kind: 'local-only', reason: 'LOCATION_UNAVAILABLE', metrics };
  }

  return {
    kind: 'publishable',
    input: {
      ...buildMetadata(request.outcome),
      attemptId: session.attemptId,
      testSessionId: session.id,
      gridVersion: request.gridVersion,
      cellId: request.cellId,
      occurredAt,
      downloadMbps: metrics.downloadMbps,
      uploadMbps: metrics.uploadMbps,
      rttMs: metrics.rttMs,
      source: 'builtin-speed-test',
      inputMethod: 'automatic',
      methodVersion: DEMO_METHOD_VERSION,
    },
  };
}
