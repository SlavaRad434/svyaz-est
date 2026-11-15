import { describe, expect, it } from 'vitest';
import type { CellFilters } from '@svyaz-est/contracts';
import { evaluateCell, localDateString, type EvaluationInput, type EvaluationObservation } from './evaluate';
import { DEFAULT_METHODOLOGY, REASON_CODES } from './methodology';

const NOW = '2026-11-11T12:00:00.000Z';
const MIN = 60_000;
const DAY = 86_400_000;
const CELL = 'demo-izh-v1:0:0';
// Замеры происходят строго раньше periodTo = now: по умолчанию минуту назад.
const DEFAULT_OCCURRED = new Date(Date.parse(NOW) - MIN).toISOString();

const DEFAULT_FILTERS: CellFilters = {
  operatorId: 'operator-mts',
  networkType: '4g',
  environment: 'outdoor',
  periodFrom: new Date(Date.parse(NOW) - 30 * DAY).toISOString(),
  periodTo: NOW,
  profileCode: 'basic',
};

let seq = 0;

function measurement(overrides: Partial<EvaluationObservation> = {}): EvaluationObservation {
  seq += 1;
  return {
    id: `obs-${String(seq).padStart(4, '0')}`,
    kind: 'measurement',
    attemptId: `attempt-${seq}`,
    testSessionId: `session-${seq}`,
    authorId: `member-${seq}`,
    cellId: CELL,
    occurredAt: DEFAULT_OCCURRED,
    status: 'active',
    operatorId: 'operator-mts',
    networkType: '4g',
    transport: 'cellular',
    vpn: 'not-detected',
    environment: 'outdoor',
    metrics: { downloadMbps: 20, uploadMbps: 8, rttMs: 60 },
    ...overrides,
  };
}

function failureEvent(overrides: Partial<EvaluationObservation> = {}): EvaluationObservation {
  seq += 1;
  return {
    id: `obs-${String(seq).padStart(4, '0')}`,
    kind: 'failure-event',
    attemptId: `attempt-${seq}`,
    testSessionId: `session-${seq}`,
    authorId: null,
    cellId: CELL,
    occurredAt: DEFAULT_OCCURRED,
    status: 'active',
    operatorId: 'operator-mts',
    networkType: '4g',
    transport: 'cellular',
    vpn: 'not-detected',
    environment: 'outdoor',
    ...overrides,
  };
}

function evaluate(observations: EvaluationObservation[], overrides: Partial<EvaluationInput> = {}) {
  return evaluateCell({
    cellId: CELL,
    gridVersion: 'demo-izh-v1',
    observations,
    filters: DEFAULT_FILTERS,
    now: NOW,
    ...overrides,
  });
}

/** 5 замеров за 2 даты от разных авторов: минимально достаточная выборка. */
function sufficientSet(count = 5): EvaluationObservation[] {
  return Array.from({ length: count }, (_, i) =>
    measurement({
      authorId: `author-s${i}`,
      occurredAt: new Date(Date.parse(NOW) - (i % 2) * DAY - MIN).toISOString(),
    }),
  );
}

describe('evaluateCell — достаточность', () => {
  it('пустая выборка: серый статус, метрики null, INSUFFICIENT_SAMPLES и INSUFFICIENT_DATES', () => {
    const summary = evaluate([]);
    expect(summary.status).toBe('insufficient_data');
    expect(summary.sampleCount).toBe(0);
    expect(summary.metrics).toEqual({ downloadMbps: null, uploadMbps: null, rttMs: null });
    expect(summary.lastMeasurementDate).toBeNull();
    expect(summary.reasonCodes).toContain(REASON_CODES.INSUFFICIENT_SAMPLES);
    expect(summary.reasonCodes).toContain(REASON_CODES.INSUFFICIENT_DATES);
  });

  it('один замер: нет уверенной оценки, но дата и счётчик видны', () => {
    const summary = evaluate([measurement()]);
    expect(summary.status).toBe('insufficient_data');
    expect(summary.sampleCount).toBe(1);
    expect(summary.lastMeasurementDate).toBe('2026-11-11');
    expect(summary.metrics.downloadMbps).toBeNull();
  });

  it('минимально достаточная выборка: 5 замеров за 2 даты дают цвет', () => {
    const summary = evaluate(sufficientSet());
    expect(summary.status).toBe('green');
    expect(summary.sampleCount).toBe(5);
    expect(summary.reasonCodes).toContain(REASON_CODES.PROFILE_PASSED);
  });

  it('5 замеров за одну дату: INSUFFICIENT_DATES', () => {
    const summary = evaluate(sufficientSet().map((o) => ({ ...o, occurredAt: DEFAULT_OCCURRED })));
    expect(summary.status).toBe('insufficient_data');
    expect(summary.reasonCodes).toContain(REASON_CODES.INSUFFICIENT_DATES);
  });

  it('4 замера за 2 даты: INSUFFICIENT_SAMPLES без INSUFFICIENT_DATES', () => {
    const summary = evaluate(sufficientSet(4));
    expect(summary.status).toBe('insufficient_data');
    expect(summary.reasonCodes).toContain(REASON_CODES.INSUFFICIENT_SAMPLES);
    expect(summary.reasonCodes).not.toContain(REASON_CODES.INSUFFICIENT_DATES);
  });
});

describe('evaluateCell — пороги цвета', () => {
  // Точная проверка границ: одинаковый timestamp у всех замеров — равные веса;
  // достаточность ослаблена, чтобы проверять именно порог доли.
  const THRESHOLD_CONFIG = { ...DEFAULT_METHODOLOGY, minSamples: 1, minDates: 1 };

  function setWithFailed(failedCount: number, total = 5): EvaluationObservation[] {
    return Array.from({ length: total }, (_, i) =>
      measurement({
        authorId: `author-thr${i}`,
        metrics:
          i < failedCount
            ? { downloadMbps: 0.5, uploadMbps: 0.2, rttMs: 400 } // не проходит basic
            : { downloadMbps: 20, uploadMbps: 8, rttMs: 60 },
      }),
    );
  }

  it('доля ровно 80% — зелёный (граница включается)', () => {
    expect(evaluate(setWithFailed(1), { config: THRESHOLD_CONFIG }).status).toBe('green');
  });

  it('доля 60% — жёлтый', () => {
    expect(evaluate(setWithFailed(2), { config: THRESHOLD_CONFIG }).status).toBe('yellow');
  });

  it('доля ровно 50% (3 из 6) — жёлтый, граница включается', () => {
    const yellow = evaluate(setWithFailed(3, 6), { config: THRESHOLD_CONFIG });
    expect(yellow.status).toBe('yellow');
    expect(yellow.reasonCodes).toContain(REASON_CODES.PROFILE_PARTIALLY_PASSED);
  });

  it('доля ниже 50% — красный', () => {
    const red = evaluate(setWithFailed(3), { config: THRESHOLD_CONFIG });
    expect(red.status).toBe('red');
    expect(red.reasonCodes).toContain(REASON_CODES.PROFILE_FAILED);
  });

  it('порог профиля video-call строже basic: те же метрики падают в красный', () => {
    const borderline = Array.from({ length: 5 }, (_, i) =>
      measurement({
        authorId: `author-video${i}`,
        occurredAt: new Date(Date.parse(NOW) - (i % 2) * DAY - MIN).toISOString(),
        // Проходит basic, но не video-call (download < 5).
        metrics: { downloadMbps: 3, uploadMbps: 3.5, rttMs: 100 },
      }),
    );
    expect(evaluate(borderline).status).toBe('green');
    expect(
      evaluate(borderline, { filters: { ...DEFAULT_FILTERS, profileCode: 'video-call' } }).status,
    ).toBe('red');
  });
});

describe('evaluateCell — веса', () => {
  it('свежие замеры весят больше: старый провал не топит зелёный', () => {
    const observations = [
      ...Array.from({ length: 5 }, (_, i) =>
        measurement({
          authorId: `author-fresh${i}`,
          occurredAt: new Date(Date.parse(NOW) - DAY - MIN).toISOString(),
          metrics: { downloadMbps: 20, uploadMbps: 8, rttMs: 60 },
        }),
      ),
      measurement({
        authorId: 'author-old-fail',
        occurredAt: new Date(Date.parse(NOW) - 28 * DAY).toISOString(),
        metrics: { downloadMbps: 0.5, uploadMbps: 0.2, rttMs: 400 },
      }),
    ];
    expect(evaluate(observations).status).toBe('green');
  });

  it('взвешенные средние считаются отдельно от цвета и ближе к свежим значениям', () => {
    const observations = [
      measurement({ authorId: 'a1', metrics: { downloadMbps: 10, uploadMbps: 4, rttMs: 100 } }),
      measurement({
        authorId: 'a2',
        occurredAt: new Date(Date.parse(NOW) - DAY).toISOString(),
        metrics: { downloadMbps: 20, uploadMbps: 8, rttMs: 60 },
      }),
      measurement({
        authorId: 'a3',
        occurredAt: new Date(Date.parse(NOW) - 2 * DAY).toISOString(),
        metrics: { downloadMbps: 30, uploadMbps: 12, rttMs: 20 },
      }),
      measurement({
        authorId: 'a4',
        occurredAt: new Date(Date.parse(NOW) - 3 * DAY).toISOString(),
        metrics: { downloadMbps: 40, uploadMbps: 16, rttMs: 40 },
      }),
      measurement({
        authorId: 'a5',
        occurredAt: new Date(Date.parse(NOW) - 4 * DAY).toISOString(),
        metrics: { downloadMbps: 50, uploadMbps: 20, rttMs: 80 },
      }),
    ];
    const summary = evaluate(observations);
    expect(summary.status).toBe('green');
    // Простое среднее = 30; веса смещают к свежим низким значениям.
    expect(summary.metrics.downloadMbps).toBeGreaterThan(25);
    expect(summary.metrics.downloadMbps).toBeLessThan(30);
    expect(summary.metrics.rttMs).toBeGreaterThan(0);
  });
});

describe('evaluateCell — дедупликация', () => {
  it('повтор автора в сутки: учитывается один вклад', () => {
    const summary = evaluate(
      Array.from({ length: 5 }, (_, i) => measurement({ authorId: 'author-repeat', id: `obs-r${i}` })),
    );
    expect(summary.sampleCount).toBe(1);
    expect(summary.status).toBe('insufficient_data');
  });

  it('один автор за два дня плюс четыре других: 5 вкладов', () => {
    const summary = evaluate([
      measurement({ authorId: 'author-two-days' }),
      measurement({
        authorId: 'author-two-days',
        occurredAt: new Date(Date.parse(NOW) - DAY - MIN).toISOString(),
      }),
      ...Array.from({ length: 3 }, (_, i) => measurement({ authorId: `author-b${i}` })),
    ]);
    expect(summary.sampleCount).toBe(5);
    expect(summary.status).toBe('green');
  });

  it('при равном времени берётся запись с большим id', () => {
    const summary = evaluate([
      measurement({ authorId: 'author-tie', id: 'obs-0001', metrics: { downloadMbps: 30, uploadMbps: 8, rttMs: 60 } }),
      measurement({ authorId: 'author-tie', id: 'obs-0002', metrics: { downloadMbps: 10, uploadMbps: 8, rttMs: 60 } }),
      // Вторая дата — иначе выборка недостаточна и метрики не считаются.
      ...Array.from({ length: 2 }, (_, i) => measurement({ authorId: `author-c${i}` })),
      ...Array.from({ length: 2 }, (_, i) =>
        measurement({
          authorId: `author-c2-${i}`,
          occurredAt: new Date(Date.parse(NOW) - DAY - MIN).toISOString(),
        }),
      ),
    ]);
    expect(summary.sampleCount).toBe(5);
    // Вчерашние замеры весят чуть меньше: считаем ожидание по формуле веса.
    const wToday = 1;
    const wYesterday = Math.pow(2, -1 / 14);
    const expected =
      ((10 + 20 + 20) * wToday + (20 + 20) * wYesterday) /
      (3 * wToday + 2 * wYesterday);
    expect(summary.metrics.downloadMbps).toBeCloseTo(expected, 6);
  });

  it('граница суток в часовом поясе пилота: 20:59:59Z и 21:00:00Z — разные дни (UTC+3)', () => {
    expect(localDateString('2026-11-10T20:59:59.999Z', 180)).toBe('2026-11-10');
    expect(localDateString('2026-11-10T21:00:00.000Z', 180)).toBe('2026-11-11');
    const utcPlus3 = { ...DEFAULT_METHODOLOGY, pilotUtcOffsetMinutes: 180 };
    const summary = evaluate(
      [
        measurement({ authorId: 'author-boundary', occurredAt: '2026-11-10T20:59:59.999Z' }),
        measurement({ authorId: 'author-boundary', occurredAt: '2026-11-10T21:00:00.000Z' }),
        ...Array.from({ length: 4 }, (_, i) => measurement({ authorId: `author-d${i}` })),
      ],
      { config: utcPlus3 },
    );
    expect(summary.sampleCount).toBe(6);
  });

  it('гость: один итог на тестовую сессию, повторы той же сессии не считаются', () => {
    const summary = evaluate([
      measurement({ authorId: null, testSessionId: 'session-g1', attemptId: 'a-g1' }),
      measurement({ authorId: null, testSessionId: 'session-g1', attemptId: 'a-g1-r' }),
      measurement({ authorId: null, testSessionId: 'session-g2', attemptId: 'a-g2' }),
      measurement({ authorId: null, testSessionId: 'session-g3', attemptId: 'a-g3' }),
      measurement({
        authorId: null,
        testSessionId: 'session-g4',
        attemptId: 'a-g4',
        occurredAt: new Date(Date.parse(NOW) - DAY - MIN).toISOString(),
      }),
      measurement({
        authorId: null,
        testSessionId: 'session-g5',
        attemptId: 'a-g5',
        occurredAt: new Date(Date.parse(NOW) - DAY - MIN).toISOString(),
      }),
    ]);
    expect(summary.sampleCount).toBe(5);
    expect(summary.status).toBe('green');
    expect(summary.reasonCodes).toContain(REASON_CODES.GUEST_AUTHOR_INDEPENDENCE_UNVERIFIED);
  });

  it('гостевые замеры влияют на цвет наравне с участниками', () => {
    const guestSet = Array.from({ length: 5 }, (_, i) =>
      measurement({
        authorId: null,
        testSessionId: `session-guest-${i}`,
        occurredAt: new Date(Date.parse(NOW) - (i % 2) * DAY - MIN).toISOString(),
      }),
    );
    expect(evaluate(guestSet).status).toBe('green');
  });
});

describe('evaluateCell — период и старение', () => {
  it('период — полуинтервал: замер в точке periodFrom включён, в точке periodTo — нет', () => {
    // periodFrom внутри окна методики, чтобы проверять именно границу периода.
    const fromFilters = {
      ...DEFAULT_FILTERS,
      periodFrom: new Date(Date.parse(NOW) - 10 * DAY).toISOString(),
    };
    const from = evaluate(
      [
        measurement({ authorId: 'author-edge-from', occurredAt: fromFilters.periodFrom }),
        ...Array.from({ length: 4 }, (_, i) => measurement({ authorId: `author-from-other${i}` })),
      ],
      { filters: fromFilters },
    );
    expect(from.sampleCount).toBe(5);

    const to = evaluate([
      measurement({ authorId: 'author-edge-to', occurredAt: NOW }),
      ...Array.from({ length: 4 }, (_, i) => measurement({ authorId: `author-to-other${i}` })),
    ]);
    expect(to.sampleCount).toBe(4);
  });

  it('запись старше окна исключается с причиной OLD_RECORD', () => {
    const summary = evaluate([
      measurement({ authorId: 'author-ancient', occurredAt: new Date(Date.parse(NOW) - 35 * DAY).toISOString() }),
      ...Array.from({ length: 4 }, (_, i) => measurement({ authorId: `author-x${i}` })),
    ]);
    expect(summary.sampleCount).toBe(4);
    expect(summary.status).toBe('insufficient_data');
    expect(summary.reasonCodes).toContain(REASON_CODES.OLD_RECORD);
  });
});

describe('evaluateCell — скрытые записи и события ошибок', () => {
  it('скрытая запись не увеличивает выборку', () => {
    const observations = [
      ...sufficientSet(),
      measurement({ authorId: 'author-hidden', status: 'hidden' }),
    ];
    expect(evaluate(observations).sampleCount).toBe(5);
    // Скрываем ещё одну — выборка становится недостаточной.
    observations[0]!.status = 'hidden';
    const after = evaluate(observations);
    expect(after.sampleCount).toBe(4);
    expect(after.status).toBe('insufficient_data');
  });

  it('только события ошибок: отдельный счётчик, нулевых скоростей не появляется', () => {
    const summary = evaluate([
      failureEvent(),
      failureEvent({ status: 'hidden' }),
      failureEvent({ occurredAt: new Date(Date.parse(NOW) - 3 * DAY).toISOString() }),
    ]);
    expect(summary.complaintCount).toBe(2);
    expect(summary.sampleCount).toBe(0);
    expect(summary.status).toBe('insufficient_data');
    expect(summary.metrics.downloadMbps).toBeNull();
    expect(summary.reasonCodes).not.toContain(REASON_CODES.PROFILE_PASSED);
  });

  it('события ошибок не входят в скоростные показатели достаточной выборки', () => {
    const summary = evaluate([...sufficientSet(), failureEvent()]);
    expect(summary.status).toBe('green');
    expect(summary.sampleCount).toBe(5);
    expect(summary.complaintCount).toBe(1);
  });
});

describe('evaluateCell — метаданные и группы', () => {
  it('неизвестный и wifi-транспорт исключают запись из мобильного рейтинга', () => {
    const summary = evaluate(
      Array.from({ length: 5 }, (_, i) =>
        measurement({
          authorId: `author-wifi${i}`,
          transport: i % 2 === 0 ? 'wifi' : 'unknown',
        }),
      ),
    );
    expect(summary.sampleCount).toBe(0);
    expect(summary.reasonCodes).toContain(REASON_CODES.EXCLUDED_TRANSPORT);
  });

  it('обнаруженный VPN исключает запись', () => {
    const summary = evaluate(
      Array.from({ length: 5 }, (_, i) => measurement({ authorId: `author-vpn${i}`, vpn: 'detected' })),
    );
    expect(summary.sampleCount).toBe(0);
    expect(summary.reasonCodes).toContain(REASON_CODES.VPN_DETECTED);
  });

  it('vpn: unknown исключается с UNVERIFIED_METADATA, но допускается настройкой методики', () => {
    const unknownVpn = Array.from({ length: 5 }, (_, i) =>
      measurement({
        authorId: `author-uvpn${i}`,
        vpn: 'unknown',
        occurredAt: new Date(Date.parse(NOW) - (i % 2) * DAY - MIN).toISOString(),
      }),
    );
    expect(evaluate(unknownVpn).reasonCodes).toContain(REASON_CODES.UNVERIFIED_METADATA);
    const trusted = evaluate(unknownVpn, {
      config: { ...DEFAULT_METHODOLOGY, trustUnknownVpn: true },
    });
    expect(trusted.sampleCount).toBe(5);
    expect(trusted.status).toBe('green');
  });

  it('группа оператора unknown не даёт мобильного рейтинга: UNKNOWN_OPERATOR', () => {
    const summary = evaluate(
      Array.from({ length: 5 }, (_, i) =>
        measurement({ authorId: `author-unknown-op${i}`, operatorId: null }),
      ),
      { filters: { ...DEFAULT_FILTERS, operatorId: 'unknown' } },
    );
    expect(summary.sampleCount).toBe(0);
    expect(summary.reasonCodes).toContain(REASON_CODES.UNKNOWN_OPERATOR);
  });

  it('другие группы (оператор/сеть/условия) не смешиваются с текущей', () => {
    const summary = evaluate([
      ...sufficientSet(),
      measurement({ authorId: 'author-other-op', operatorId: 'operator-beeline' }),
      measurement({ authorId: 'author-indoor', environment: 'indoor' }),
      measurement({ authorId: 'author-3g', networkType: '3g' }),
    ]);
    expect(summary.sampleCount).toBe(5);
  });

  it('фильтр по 5g при данных только в 4g: пустая группа', () => {
    const summary = evaluate(sufficientSet(), {
      filters: { ...DEFAULT_FILTERS, networkType: '5g' },
    });
    expect(summary.sampleCount).toBe(0);
    expect(summary.status).toBe('insufficient_data');
  });
});

describe('evaluateCell — публичные поля', () => {
  it('публичная карточка не содержит точного времени и авторов', () => {
    const summary = evaluate([...sufficientSet(), failureEvent()]);
    const json = JSON.stringify(summary);
    expect(json).not.toContain('authorId');
    expect(summary.lastMeasurementDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.methodologyVersion).toBe('2-guest-draft');
    expect(summary.calculatedAt).toBe(NOW);
    expect(summary.filters).toEqual(DEFAULT_FILTERS);
  });
});
