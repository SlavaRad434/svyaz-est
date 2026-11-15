/**
 * Экран теста связи: подготовка → измерение → автоматический результат.
 * Все данные заполняются автоматически; редактируемых полей нет.
 * Отмена не создаёт события сетевой ошибки; сбой — отдельное событие.
 * US-12: запись сначала сохраняется в локальной очереди, затем доставляется;
 * при разрыве сети остаётся в очереди и доставляется повторно.
 */
import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, Group, Loader, Progress, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { ObservationReceipt } from '@svyaz-est/contracts';
import { demoGateway, demoStore } from '../lib/demo';
import { DEMO_TRAFFIC_LIMIT_BYTES, DEMO_DURATION_LIMIT_MS } from '../demo/gateway';
import {
  runDemoTest,
  type DemoTestOutcomePreset,
  type DemoTestResult,
  type DemoTestStage,
} from '../demo/simulator';
import { pendingQueue } from '../lib/queue';
import { flushPendingQueue } from '../lib/delivery';
import { useSyncExternalStore } from 'react';

type Phase =
  | { name: 'idle' }
  | { name: 'creating' }
  | { name: 'running'; stage: DemoTestStage }
  | { name: 'submitting' }
  | {
      name: 'done';
      result: DemoTestResult;
      receipt: ObservationReceipt | null;
      submitError: string | null;
      /** Записи, оставшиеся в локальной очереди (US-12). */
      pending: number;
    };

const OUTCOME_PRESETS = [
  { value: 'success', label: 'Успешный замер' },
  { value: 'mixed', label: 'Случайный исход' },
  { value: 'failure', label: 'Сбой сети (событие ошибки)' },
  { value: 'location-denied', label: 'Геолокация недоступна' },
  { value: 'unknown-metadata', label: 'Метаданные недоступны' },
];

export function TestPage() {
  const navigate = useNavigate();
  const [preset, setPreset] = useState<DemoTestOutcomePreset>('success');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const role = useSyncExternalStore(
    (listener) => demoStore.subscribe(listener),
    () => demoStore.role,
  );

  const trafficMb = Math.round(DEMO_TRAFFIC_LIMIT_BYTES / (1024 * 1024));

  const start = useCallback(async () => {
    const attemptId = crypto.randomUUID();
    const attemptToken = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    setPhase({ name: 'creating' });
    try {
      const session = await demoGateway.createTestSession(
        { attemptId, trafficLimitBytes: DEMO_TRAFFIC_LIMIT_BYTES },
        attemptToken,
        idempotencyKey,
      );
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ name: 'running', stage: { phase: 'preparation', label: 'Подготовка', progress: 0 } });
      const result = await runDemoTest(session, {
        outcome: preset,
        cellId: 'demo-izh-v1:0:0',
        gridVersion: 'demo-izh-v1',
        signal: controller.signal,
        onStage: (stage) => setPhase({ name: 'running', stage }),
      });
      if (result.kind === 'cancelled') {
        setPhase({ name: 'done', result, receipt: null, submitError: null, pending: pendingQueue.list().length });
        return;
      }
      if (result.kind === 'local-only') {
        // Локальный результат: публикация на карте невозможна.
        setPhase({ name: 'done', result, receipt: null, submitError: null, pending: pendingQueue.list().length });
        return;
      }
      // US-12: сначала локальное сохранение, затем попытка доставки. Повтор
      // доставки идёт с теми же attemptToken и ключом — дубля не будет.
      pendingQueue.enqueue({
        input: result.input,
        attemptToken,
        idempotencyKey,
        enqueuedAt: new Date().toISOString(),
      });
      setPhase({ name: 'submitting' });
      let receipt: ObservationReceipt | null = null;
      await flushPendingQueue((value) => {
        receipt = value;
      });
      setPhase({ name: 'done', result, receipt, submitError: null, pending: pendingQueue.list().length });
    } catch (error) {
      setPhase({
        name: 'done',
        result: { kind: 'cancelled' },
        receipt: null,
        submitError: error instanceof Error ? error.message : 'Неизвестная ошибка',
        pending: pendingQueue.list().length,
      });
    } finally {
      abortRef.current = null;
    }
  }, [preset]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => setPhase({ name: 'idle' }), []);

  /** Повторная волна доставки очереди (кнопка «Доставить сейчас»). */
  const retryDelivery = useCallback(async () => {
    let receipt: ObservationReceipt | null = null;
    try {
      await flushPendingQueue((value) => {
        receipt = receipt ?? value;
      });
    } catch {
      /* ошибка доставки фиксируется в очереди, записи остаются сохранёнными */
    }
    setPhase((current) => {
      if (current.name !== 'done') {
        return current;
      }
      return {
        ...current,
        receipt: current.receipt ?? receipt,
        pending: pendingQueue.list().length,
      };
    });
  }, []);

  return (
    <Stack mih="100%" p="md" gap="md">
      <Group justify="space-between">
        <Title order={3}>Тест связи</Title>
        <Badge variant="light" color="orange">
          Демо
        </Badge>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm">
              Лимит трафика: <b>{trafficMb} МБ</b> · Длительность: не более{' '}
              <b>{Math.round(DEMO_DURATION_LIMIT_MS / 1000)} секунд</b>
            </Text>
            <Text size="sm" c={role === 'guest' ? 'orange' : 'blue'}>
              {role === 'guest' ? 'Без привязки к аккаунту' : 'От имени аккаунта участника'}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Показатели, место и метаданные заполняются автоматически. Позиция в демо —
            центр пилота, ячейка demo-izh-v1:0:0.
          </Text>

          {phase.name === 'idle' && (
            <>
              <Select
                label="Демо-исход теста"
                data={OUTCOME_PRESETS}
                value={preset}
                onChange={(value) => value && setPreset(value as DemoTestOutcomePreset)}
                allowDeselect={false}
              />
              <Button onClick={() => void start()} className="tap-target">Запустить тест</Button>
            </>
          )}

          {phase.name === 'creating' && (
            <Group gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Создаётся тестовая сессия…
              </Text>
            </Group>
          )}

          {phase.name === 'running' && (
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                {phase.stage.label}
              </Text>
              <Progress value={Math.round(phase.stage.progress * 100)} animated />
              {phase.stage.phase === 'probe' && phase.stage.rttMs !== null && (
                <Text size="xs" c="dimmed">
                  Отклик: {phase.stage.rttMs} мс
                </Text>
              )}
              <Button variant="light" color="red" onClick={cancel} className="tap-target">
                Отменить
              </Button>
            </Stack>
          )}

          {phase.name === 'submitting' && (
            <Group gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Отправляется наблюдение…
              </Text>
            </Group>
          )}

          {phase.name === 'done' && (
            <DoneView
              phase={phase}
              onMap={() => navigate('/')}
              onRepeat={reset}
              onRetryDelivery={() => void retryDelivery()}
            />
          )}
        </Stack>
      </Card>

      <Link to="/">← К карте</Link>
    </Stack>
  );
}

function DoneView({
  phase,
  onMap,
  onRepeat,
  onRetryDelivery,
}: {
  phase: Extract<Phase, { name: 'done' }>;
  onMap: () => void;
  onRepeat: () => void;
  onRetryDelivery: () => void;
}) {
  const { result, receipt, submitError, pending } = phase;
  if (submitError) {
    return (
      <Stack gap="sm">
        <Alert color="red" title="Не удалось подтвердить отправку">
          {submitError}
        </Alert>
        <PendingNotice pending={pending} onRetryDelivery={onRetryDelivery} />
        <Group>
          <Button onClick={onRepeat} className="tap-target">Повторить тест</Button>
          <Button variant="light" onClick={onMap} className="tap-target">
            К карте
          </Button>
        </Group>
      </Stack>
    );
  }
  if (result.kind === 'cancelled') {
    return (
      <Stack gap="sm">
        <Alert color="gray" title="Тест отменён">
          Отмена не создаёт события сетевой ошибки.
        </Alert>
        <PendingNotice pending={pending} onRetryDelivery={onRetryDelivery} />
        <Group>
          <Button onClick={onRepeat} className="tap-target">Повторить тест</Button>
          <Button variant="light" onClick={onMap} className="tap-target">
            К карте
          </Button>
        </Group>
      </Stack>
    );
  }
  if (result.kind === 'local-only') {
    return (
      <Stack gap="sm">
        <Alert color="orange" title="Геолокация недоступна">
          Результат сохранён локально и показан ниже. Публикация на карте невозможна:
          место определить не удалось, поля для ручного ввода отсутствуют.
        </Alert>
        <MetricsView
          downloadMbps={result.metrics.downloadMbps}
          uploadMbps={result.metrics.uploadMbps}
          rttMs={result.metrics.rttMs}
        />
        <Group>
          <Button onClick={onRepeat} className="tap-target">Повторить тест</Button>
          <Button variant="light" onClick={onMap} className="tap-target">
            К карте
          </Button>
        </Group>
      </Stack>
    );
  }
  if (result.kind === 'failure') {
    return (
      <Stack gap="sm">
        <Alert color="red" title="Тест не завершён — зафиксировано событие ошибки">
          Этап: {result.input.stage}, код: {result.input.errorCode}. Событие хранится
          отдельно от замеров скорости и не превращается в нулевую скорость.
        </Alert>
        {receipt && (
          <Text size="sm" c="dimmed">
            Запись принята {receipt.submittedAt} — она учитывается в счётчике событий
            ошибок ячейки.
          </Text>
        )}
        <PendingNotice pending={pending} onRetryDelivery={onRetryDelivery} />
        <Group>
          <Button onClick={onRepeat} className="tap-target">Повторить тест</Button>
          <Button variant="light" onClick={onMap} className="tap-target">
            К карте
          </Button>
        </Group>
      </Stack>
    );
  }
  const excludedByMetadata =
    result.input.operatorId === null || result.input.transport === 'unknown';
  return (
    <Stack gap="sm">
      <Alert color={pending > 0 ? 'orange' : 'green'} title={pending > 0 ? 'Замер выполнен, отправка не подтверждена' : 'Замер выполнен и принят'}>
        {pending > 0
          ? 'Результат сохранён в локальной очереди и будет доставлен автоматически при восстановлении связи.'
          : excludedByMetadata
            ? 'Запись сохранена, но не входит в мобильный рейтинг: метаданные недоступны (оператор/транспорт неизвестны).'
            : 'Запись сохранена и участвует в оценке ячейки после общих проверок.'}
        {receipt && ` Квитанция ${receipt.id.slice(0, 8)}… от ${receipt.submittedAt}.`}
      </Alert>
      <MetricsView
        downloadMbps={result.input.downloadMbps}
        uploadMbps={result.input.uploadMbps}
        rttMs={result.input.rttMs}
      />
      <PendingNotice pending={pending} onRetryDelivery={onRetryDelivery} />
      <Group>
        <Button onClick={onMap} className="tap-target">К карте</Button>
        <Button variant="light" onClick={onRepeat} className="tap-target">
          Повторить тест
        </Button>
      </Group>
    </Stack>
  );
}

function PendingNotice({
  pending,
  onRetryDelivery,
}: {
  pending: number;
  onRetryDelivery: () => void;
}) {
  if (pending <= 0) {
    return null;
  }
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Text size="sm" c="orange">
        В локальной очереди: <b>{pending}</b> — доставка повторится автоматически.
      </Text>
      <Button variant="light" size="compact-sm" onClick={onRetryDelivery} style={{ flexShrink: 0 }}>
        Доставить сейчас
      </Button>
    </Group>
  );
}

function MetricsView({
  downloadMbps,
  uploadMbps,
  rttMs,
}: {
  downloadMbps: number;
  uploadMbps: number;
  rttMs: number;
}) {
  return (
    <SimpleGrid cols={3}>
      <div>
        <Text size="xs" c="dimmed">
          Загрузка
        </Text>
        <Text fw={600}>
          {downloadMbps.toFixed(1)} Мбит/с
        </Text>
      </div>
      <div>
        <Text size="xs" c="dimmed">
          Отдача
        </Text>
        <Text fw={600}>{uploadMbps.toFixed(1)} Мбит/с</Text>
      </div>
      <div>
        <Text size="xs" c="dimmed">
          Задержка
        </Text>
        <Text fw={600}>{rttMs} мс</Text>
      </div>
    </SimpleGrid>
  );
}
