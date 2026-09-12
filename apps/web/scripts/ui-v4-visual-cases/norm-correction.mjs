// Стенды зоны norm-correction: понедельничная шторка сверки нормы в состоянии
// каждого кадра. Шторка — настоящий шаг weekly_wrap_v2 продукта; подменяется
// только сбор данных сверки (HEYS.NormCorrection.gather), потому что числа
// кадров — сквозной пример канваса, а не результат 21 реального дня.

const VIEWPORT = { width: 375, height: 812 };

// Цепочка канваса: 1 520 + 610 + 270 = 2 400 расход · факт 2 210 · дефицит −12 %
// · норма 2 112 → 2 049 (−63) · рост 2 175 (+63).
const CHAIN = { expenditure: 2400, deficitPct: -12, basalMetabolism: 1520 };
const RANGE = '24–30 авг';
// Воскресенье 30 августа: текущая неделя шторки — 24–30 авг, как в кадрах.
const AT = '2026-08-30T21:00:00+03:00';

function meal(id, name, time, items) {
  return {
    id,
    name,
    time,
    items: items.map(([productId, grams]) => ({
      id: `${id}-${productId}`, product_id: productId, productId, name: productId, grams,
    })),
  };
}

/** Семь записанных дней недели 24–30 августа — отчёт недели строит сам продукт. */
const WEEK_DAYS = Object.fromEntries(Array.from({ length: 7 }, (_, i) => {
  const date = `2026-08-${24 + i}`;
  return [date, {
    meals: [
      meal('m-b', 'Завтрак', '08:30', [['visual-oats', 300]]),
      meal('m-l', 'Обед', '13:20', [['visual-chicken', 300], ['visual-rice', 320]]),
    ],
    weightMorning: 73.4,
    weightMorningSource: 'measured',
    steps: 9000,
    stepsUpdatedAt: 1,
  }];
}));

function clock(iso) {
  return Object.freeze({ iso, day: iso.slice(0, 10), epochMs: Date.parse(iso) });
}

/** Окно расчёта: 21 день, съедено ровно столько, чтобы факт вышел в factPerDay. */
function computeInput({ eatenPerDay, deltaKg, currentFactor = 1, historyDays = 60, measuredDays = 21 }) {
  return {
    days: Array.from({ length: 21 }, () => ({ kcal: eatenPerDay, isLogged: true, isIncomplete: false })),
    formulaPerDay: CHAIN.expenditure,
    trend: { deltaKg, measuredDays, windowDays: 21 },
    currentFactor,
    historyDays,
  };
}

// Факт 2 210 при съеденных 2 112 и тренде −0,267 кг/21 день (7 700 ккал/кг).
const LOWERED_RESULT = computeInput({ eatenPerDay: 2112, deltaKg: -0.267 });
// Ели 2 240, вес −0,4 кг за неделю (−1,2 за окно): расход выходит выше формулы.
const RAISED_RESULT = computeInput({ eatenPerDay: 2240, deltaKg: -1.2 });
// Ели 2 095, вес −0,3 кг за неделю (−0,9 за окно): расхождение внутри 2 %.
const MATCHED_RESULT = computeInput({ eatenPerDay: 2095, deltaKg: -0.9 });

const LOWERED_DECISION = (evidence) => ({
  schemaVersion: 2,
  what: 'applied',
  by: 'curator',
  periodEnd: '2026-08-30',
  effectiveAt: '2026-08-31',
  previousFactor: 1,
  factor: 0.97,
  normBefore: 2112,
  normAfter: 2049,
  deficitPct: -12,
  evidence,
});

function syncCase({ id, label, tariff, compute, card, notes, themeId = 'sand' }) {
  return {
    id,
    zone: 'norm-correction',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-norm-correction-sync',
    tab: 'diary',
    themeId,
    clock: clock(AT),
    stubGamificationMerge: true,
    fixtureProfile: { name: 'Марина', firstName: 'Марина', tariff, normCorrectionFactor: 1 },
    fixtureDay: { date: AT.slice(0, 10), ...WEEK_DAYS[AT.slice(0, 10)] },
    syncDays: WEEK_DAYS,
    viewport: VIEWPORT,
    rootSelector: '.mc-modal--weekly-wrap-v4',
    frameLabel: label,
    sync: { tariff, compute, card: { ...CHAIN, ...card }, rangeLabel: RANGE },
    ...(notes ? { notes } : {}),
  };
}

export const NORM_CORRECTION_VISUAL_CASES = [
  syncCase({
    id: 'norm-correction-matched-sand',
    label: 'Сверка · сошлось',
    tariff: 'pro',
    compute: MATCHED_RESULT,
    card: { matchedStreak: 4 },
  }),
  syncCase({
    id: 'norm-correction-raised-sand',
    label: 'Сверка · норма выросла',
    tariff: 'self',
    compute: RAISED_RESULT,
    card: {},
  }),
  syncCase({
    id: 'norm-correction-lowered-waist-only-sand',
    label: 'Сверка · норма снизилась · только талия',
    tariff: 'pro',
    compute: LOWERED_RESULT,
    card: { appliedDecision: LOWERED_DECISION({ kind: 'waist_only', waistFrom: 76.5, waistTo: 76.0 }) },
  }),
  syncCase({
    id: 'norm-correction-recomposition-sand',
    label: 'Сверка · рекомпозиция',
    tariff: 'pro',
    compute: MATCHED_RESULT,
    card: {
      recomposition: {
        confirmed: true,
        dropCm: 2,
        weeks: 3,
        source: 'по замеру от 12 августа',
        chart: {
          weight: [[0, 0.97], [0.14, 0.99], [0.29, 0.98], [0.43, 1], [0.57, 0.99], [0.71, 0.98], [0.86, 0.99], [1, 0.98]],
          waist: [[0, 1], [0.14, 0.9], [0.29, 0.78], [0.43, 0.66], [0.57, 0.5], [0.71, 0.34], [0.86, 0.18], [1, 0]],
          lastWeight: '73,4 кг',
          lastWaist: '74,5 см',
        },
      },
    },
  }),
  syncCase({
    id: 'norm-correction-recomposition-unverified-sand',
    label: 'Сверка · перестройку проверить не удалось',
    tariff: 'self',
    compute: LOWERED_RESULT,
    card: { recomposition: { checkExpired: true, waitedDays: 14, workingWeights: 'no_data' } },
  }),
  syncCase({
    id: 'norm-correction-self-needs-consent-sand',
    label: 'Self · снижение ждёт согласия',
    tariff: 'self',
    compute: LOWERED_RESULT,
    card: {},
  }),
  syncCase({
    id: 'norm-correction-pro-pending-sand',
    label: 'Pro · на согласовании',
    tariff: 'pro',
    compute: LOWERED_RESULT,
    card: {},
  }),
  syncCase({
    id: 'norm-correction-self-refusal-accepted-sand',
    label: 'Self · отказ принят',
    tariff: 'self',
    compute: LOWERED_RESULT,
    card: { lastDecision: { what: 'declined', by: 'client', weekLabel: RANGE, factor: 1 } },
  }),
  syncCase({
    id: 'norm-correction-self-raised-sand',
    label: 'Self · рост применён',
    tariff: 'self',
    compute: computeInput({ eatenPerDay: 2240, deltaKg: -1.2, currentFactor: 1.03 }),
    card: { justRaised: { previousFactor: 1 } },
  }),
  syncCase({
    id: 'norm-correction-self-refused-three-times-sand',
    label: 'Self · третий отказ подряд',
    tariff: 'self',
    compute: LOWERED_RESULT,
    card: { refusalStreak: 3, weeksUnchanged: 6, recomposition: { noWaistEvidence: true, evidence: { kind: 'missing' } } },
  }),
  syncCase({
    id: 'norm-correction-pro-curator-kept-sand',
    label: 'Pro · куратор решил не менять',
    tariff: 'pro',
    compute: LOWERED_RESULT,
    card: { curatorKeptDecision: { what: 'postponed', by: 'curator', weekLabel: RANGE, factor: 1 } },
  }),
];
