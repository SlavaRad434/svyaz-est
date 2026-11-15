/**
 * Демонстрационные наборы данных.
 *
 * Две группы:
 * 1. Сценарные ячейки у центра пилота — каждая демонстрирует правило методики
 *    (architecture.md §7.2): пустая, один замер, зелёная/жёлтая/красная,
 *    повторы автора, старые, скрытые, только ошибки, исключённые метаданные,
 *    гостевые, другой оператор.
 * 2. Сеяное «облако» по всему городу и округе — детерминированный PRNG
 *    (mulberry32), ~1200 ячеек в радиусе ~15 км; плотность и качество связи
 *    тают от центра (ядро густое и хорошее, округа редкая и плохая).
 *
 * Время всех записей задаётся относительно переданного now, поэтому демо не
 * стареет. Значения не являются реальными замерами.
 */
import type { EvaluationObservation } from '@svyaz-est/domain';

const MIN = 60_000;
const DAY = 86_400_000;

export interface DemoCellScenario {
  cellId: string;
  title: string;
  checks: string;
}

export const DEMO_SCENARIOS: DemoCellScenario[] = [
  { cellId: 'demo-izh-v1:0:0', title: 'Пустая ячейка', checks: 'сюда попадает демо-тест' },
  { cellId: 'demo-izh-v1:1:0', title: 'Один замер', checks: 'нет уверенной оценки' },
  { cellId: 'demo-izh-v1:2:0', title: 'Зелёная зона', checks: 'достаточная выборка' },
  { cellId: 'demo-izh-v1:3:0', title: 'Жёлтая зона', checks: 'смешанные результаты' },
  { cellId: 'demo-izh-v1:4:0', title: 'Красная зона', checks: 'профиль провален' },
  { cellId: 'demo-izh-v1:5:0', title: 'Околограничная', checks: 'доля рядом с порогом' },
  { cellId: 'demo-izh-v1:6:0', title: 'Повторы автора', checks: 'один вклад в сутки' },
  { cellId: 'demo-izh-v1:7:0', title: 'Старые записи', checks: 'вне окна 30 дней' },
  { cellId: 'demo-izh-v1:0:1', title: 'Скрытая запись', checks: 'модерация меняет выборку' },
  { cellId: 'demo-izh-v1:1:1', title: 'Только события ошибок', checks: 'без нулевых скоростей' },
  { cellId: 'demo-izh-v1:2:1', title: 'Исключённые метаданные', checks: 'wifi, VPN, unknown' },
  { cellId: 'demo-izh-v1:3:1', title: 'Гостевые замеры', checks: 'гости влияют на цвет' },
  { cellId: 'demo-izh-v1:4:1', title: 'Мегафон', checks: 'группа не смешивается' },
];

/** Центральная «сценарная» зона: случайное облако её не заполняет. */
const SCENARIO_KEYS = new Set(
  DEMO_SCENARIOS.map((scenario) => {
    const [, column, row] = scenario.cellId.split(':');
    return `${column}:${row}`;
  }),
);

/** Детерминированный PRNG: демо стабильно между перезагрузками. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let seq = 0;

function uuid(seed: string): string {
  seq += 1;
  const tail = String(seq).padStart(6, '0');
  return `00000000-0000-4000-8000-${seed.slice(0, 5).padEnd(5, '0')}${tail}`.slice(0, 36);
}

interface ObservationOptions {
  authorId?: string | null;
  occurredAt: string;
  operatorId?: string | null;
  networkType?: '4g' | '3g' | '5g';
  transport?: 'cellular' | 'wifi' | 'unknown';
  vpn?: 'not-detected' | 'detected' | 'unknown';
  environment?: 'outdoor' | 'indoor';
  status?: 'active' | 'hidden';
  kind?: 'measurement' | 'failure-event';
  errorCode?: 'NETWORK_ERROR' | 'TIMEOUT' | 'SERVER_ERROR';
  metrics?: { downloadMbps: number; uploadMbps: number; rttMs: number };
}

function buildObservation(cellId: string, options: ObservationOptions): EvaluationObservation {
  const kind = options.kind ?? 'measurement';
  const id = uuid(kind === 'measurement' ? 'dm' : 'df');
  return {
    id,
    kind,
    attemptId: uuid('dat'),
    testSessionId: uuid('dts'),
    authorId: options.authorId === undefined ? 'demo-member-1' : options.authorId,
    cellId,
    occurredAt: options.occurredAt,
    status: options.status ?? 'active',
    operatorId: options.operatorId === undefined ? 'operator-mts' : options.operatorId,
    networkType: options.networkType ?? '4g',
    transport: options.transport ?? 'cellular',
    vpn: options.vpn ?? 'not-detected',
    environment: options.environment ?? 'outdoor',
    ...(kind === 'measurement'
      ? { metrics: options.metrics ?? { downloadMbps: 20, uploadMbps: 8, rttMs: 60 } }
      : {}),
  };
}

const good = { downloadMbps: 24, uploadMbps: 9, rttMs: 55 };
const bad = { downloadMbps: 0.4, uploadMbps: 0.2, rttMs: 420 };

/** Сценарные ячейки у центра. */
function scenarioObservations(now: Date): EvaluationObservation[] {
  const iso = (shiftMs: number) => new Date(now.getTime() + shiftMs).toISOString();
  const minutesAgo = (m: number) => iso(-m * MIN);
  const daysAgo = (d: number, m = 30) => iso(-(d * DAY + m * MIN));
  const observations: EvaluationObservation[] = [];

  // 1:0 — один замер.
  observations.push(buildObservation('demo-izh-v1:1:0', { occurredAt: daysAgo(1), metrics: good }));

  // 2:0 — зелёная: 8 замеров за 3 даты.
  for (let i = 0; i < 8; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:2:0', {
        authorId: `demo-green-${i}`,
        occurredAt: daysAgo(i % 3, 60 + i),
        metrics: good,
      }),
    );
  }

  // 3:0 — жёлтая: 3 провала «вчера», 3 успеха «сегодня». Веса вчерашних
  // замеров чуть ниже, поэтому доля прошедших ≈ 0.51 — устойчиво жёлтая.
  for (let i = 0; i < 3; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:3:0', {
        authorId: `demo-yellow-fail-${i}`,
        occurredAt: daysAgo(1, 40 + i),
        metrics: bad,
      }),
    );
  }
  for (let i = 0; i < 3; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:3:0', {
        authorId: `demo-yellow-pass-${i}`,
        occurredAt: minutesAgo(40 + i),
        metrics: good,
      }),
    );
  }

  // 4:0 — красная: 6 замеров, 5 провальных.
  for (let i = 0; i < 6; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:4:0', {
        authorId: `demo-red-${i}`,
        occurredAt: daysAgo(i % 2, 50 + i),
        metrics: i < 5 ? bad : good,
      }),
    );
  }

  // 5:0 — жёлтая рядом с зелёной границей: 10 успехов (5 сегодня + 5 вчера)
  // и 3 провала (2 сегодня + 1 вчера) дают взвешенную долю ≈ 0.77 —
  // жёлтый, но близко к порогу 0.8.
  for (let i = 0; i < 5; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:5:0', {
        authorId: `demo-edge-today-${i}`,
        occurredAt: minutesAgo(10 + i),
        metrics: good,
      }),
    );
  }
  for (let i = 0; i < 5; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:5:0', {
        authorId: `demo-edge-yest-${i}`,
        occurredAt: daysAgo(1, 10 + i),
        metrics: good,
      }),
    );
  }
  for (let i = 0; i < 2; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:5:0', {
        authorId: `demo-edge-fail-today-${i}`,
        occurredAt: minutesAgo(20 + i),
        metrics: bad,
      }),
    );
  }
  observations.push(
    buildObservation('demo-izh-v1:5:0', {
      authorId: 'demo-edge-fail-yest',
      occurredAt: daysAgo(1, 20),
      metrics: bad,
    }),
  );

  // 6:0 — повторы одного автора в сутки.
  for (let i = 0; i < 6; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:6:0', {
        authorId: 'demo-member-repeat',
        occurredAt: minutesAgo(60 + i),
        metrics: good,
      }),
    );
  }

  // 7:0 — старые записи.
  for (let i = 0; i < 6; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:7:0', {
        authorId: `demo-ancient-${i}`,
        occurredAt: daysAgo(35, i),
        metrics: good,
      }),
    );
  }

  // 0:1 — скрытая запись: 6 замеров, 2 скрыты → 4 недостаточно.
  for (let i = 0; i < 6; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:0:1', {
        authorId: `demo-hidden-${i}`,
        occurredAt: daysAgo(i % 2, 70 + i),
        metrics: good,
        status: i < 2 ? 'hidden' : 'active',
      }),
    );
  }

  // 1:1 — только события ошибок.
  for (let i = 0; i < 4; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:1:1', {
        kind: 'failure-event',
        authorId: null,
        occurredAt: daysAgo(i, 80 + i),
      }),
    );
  }

  // 2:1 — исключаемые метаданные.
  const excluded: Partial<ObservationOptions>[] = [
    { transport: 'wifi' },
    { transport: 'unknown' },
    { vpn: 'detected' },
    { vpn: 'unknown' },
    { operatorId: null },
    { transport: 'wifi', vpn: 'not-detected' },
  ];
  excluded.forEach((options, i) => {
    observations.push(
      buildObservation('demo-izh-v1:2:1', {
        ...options,
        authorId: `demo-meta-${i}`,
        occurredAt: daysAgo(i % 2, 90 + i),
        metrics: good,
      }),
    );
  });

  // 3:1 — гостевые замеры.
  for (let i = 0; i < 6; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:3:1', {
        authorId: null,
        occurredAt: daysAgo(i % 3, 100 + i),
        metrics: good,
      }),
    );
  }

  // 4:1 — Мегафон: группа не смешивается с МТС.
  for (let i = 0; i < 6; i += 1) {
    observations.push(
      buildObservation('demo-izh-v1:4:1', {
        authorId: `demo-megafon-${i}`,
        operatorId: 'operator-megafon',
        occurredAt: daysAgo(i % 2, 110 + i),
        metrics: good,
      }),
    );
  }

  return observations;
}

interface CellClass {
  /** Базовый уровень качества ячейки, Мбит/с на download. */
  base: number;
  spread: number;
  rtt: number;
}

/**
 * ~1200 «обжитых» ячеек по всему городу и округе, без сценарных.
 * Кандидаты — решётка ±60 ячеек (радиус ~15 км от центра Ижевска);
 * вероятность занятости и качество связи тают с удалением от центра:
 * ядро города густое и скорее хорошее, округа редкая и скорее плохая.
 */
function occupiedCells(rand: () => number): { column: number; row: number; cellClass: CellClass }[] {
  const cells: { column: number; row: number; cellClass: CellClass }[] = [];
  const candidates: { column: number; row: number }[] = [];
  for (let column = -60; column <= 60; column += 1) {
    for (let row = -60; row <= 60; row += 1) {
      if (!SCENARIO_KEYS.has(`${column}:${row}`)) {
        candidates.push({ column, row });
      }
    }
  }
  // Детерминированное «перемешивание» порядка обхода кандидатов.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = tmp;
  }
  for (const { column, row } of candidates) {
    const distanceM = Math.hypot(column, row) * 250;
    // Доля занятых ячеек на удалении от центра города.
    const density =
      distanceM < 5000 ? 0.28 : distanceM < 10000 ? 0.12 : distanceM < 15000 ? 0.07 : 0.02;
    if (rand() >= density) {
      continue;
    }
    const roll = rand();
    // Сдвиг порогов качества: в ядре — к «хорошо», на окраинах — к «плохо».
    const urbanBias = distanceM < 5000 ? 0.12 : distanceM < 10000 ? 0.03 : -0.08;
    const quality = roll + urbanBias;
    const cellClass: CellClass =
      quality < 0.42
        ? { base: 30, spread: 12, rtt: 70 } // хорошая связь
        : quality < 0.72
          ? { base: 9, spread: 6, rtt: 130 } // средняя
          : { base: 1.5, spread: 1.2, rtt: 320 }; // плохая
    cells.push({ column, row, cellClass });
  }
  return cells;
}

/** Сеяное облако измерений по всему пилоту. */
function spreadObservations(now: Date): EvaluationObservation[] {
  const rand = mulberry32(20261111);
  const observations: EvaluationObservation[] = [];

  for (const { column, row, cellClass } of occupiedCells(rand)) {
    const cellId = `demo-izh-v1:${column}:${row}`;
    const count = 8 + Math.floor(rand() * 17); // 8–24 замера
    const operatorRoll = rand();
    const dominantOperator =
      operatorRoll < 0.45
        ? 'operator-mts'
        : operatorRoll < 0.75
          ? 'operator-beeline'
          : 'operator-megafon';
    const dominantNetwork = rand() < 0.82 ? '4g' : rand() < 0.5 ? '5g' : '3g';

    for (let i = 0; i < count; i += 1) {
      // Время: смещено к свежим датам, но в пределах окна 30 дней.
      const ageDays = Math.pow(rand(), 1.8) * 29 + 0.01;
      const occurredAt = new Date(now.getTime() - ageDays * DAY - Math.floor(rand() * 12) * MIN).toISOString();

      // ~5% попыток завершаются событием ошибки вместо замера.
      if (rand() < 0.05) {
        observations.push(
          buildObservation(cellId, {
            kind: 'failure-event',
            authorId: rand() < 0.3 ? null : `author-${cellId}-${i}`,
            occurredAt,
            operatorId: dominantOperator,
            networkType: dominantNetwork,
            errorCode: rand() < 0.6 ? 'NETWORK_ERROR' : 'TIMEOUT',
          }),
        );
        continue;
      }

      const deviation = (rand() - 0.5) * 2;
      const download = Math.max(0.2, cellClass.base + deviation * cellClass.spread);
      const upload = Math.max(0.1, download * (0.25 + rand() * 0.2));
      const rtt = Math.max(15, Math.round(cellClass.rtt + deviation * cellClass.rtt * 0.3));

      const transportRoll = rand();
      const transport = transportRoll < 0.06 ? 'wifi' : transportRoll < 0.08 ? 'unknown' : 'cellular';
      const vpnRoll = rand();
      const vpn = vpnRoll < 0.02 ? 'detected' : vpnRoll < 0.04 ? 'unknown' : 'not-detected';
      const operatorRoll = rand();
      const operatorId = operatorRoll < 0.02 ? null : dominantOperator;
      const networkType = dominantNetwork;
      const environment = rand() < 0.25 ? 'indoor' : 'outdoor';

      observations.push(
        buildObservation(cellId, {
          authorId: rand() < 0.12 ? null : `author-${column}-${row}-${Math.floor(rand() * 40)}`,
          occurredAt,
          operatorId,
          networkType,
          transport,
          vpn,
          environment,
          status: rand() < 0.02 ? 'hidden' : 'active',
          metrics: {
            downloadMbps: Number(download.toFixed(1)),
            uploadMbps: Number(upload.toFixed(1)),
            rttMs: rtt,
          },
        }),
      );
    }
  }

  return observations;
}

/** Строит все демо-наборы относительно now. */
export function buildDemoObservations(now: Date): EvaluationObservation[] {
  return [...scenarioObservations(now), ...spreadObservations(now)];
}
