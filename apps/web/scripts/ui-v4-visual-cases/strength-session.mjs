// Стенды зоны strength-builder, часть «сессия и ввод»: кадры Е1–Е5, Ж1–Ж3, З2,
// К1–К12 и М4–М6 канваса strength-builder.v4.dc.html.
//
// Экран открывается настоящим входом продукта — HEYS.StrengthBuilder.open(),
// тем же, которым его открывает день тренировки. Состояние задаётся записью
// тренировки (workoutLog), как если бы её принесло хранилище; переходы внутри
// сессии делаются тапами по продуктовым кнопкам, а не подменой React-состояния.
//
// Часы заморожены: отдых восстанавливается из workoutLog.activeRest, и
// «осталось 1:34» получается тем, что отдых начат за 26 секунд до снимка.

const CANVAS = 'strength-builder.v4.dc.html';
const DATE_KEY = '2022-08-08';
const NOW = '2022-08-08T19:27:12+03:00';
const START = '2022-08-08T18:40:00+03:00';

/**
 * Тело стенда выполняется в странице, поэтому данные кейса вшиваются в исходник
 * функции литералом: page.evaluate передаёт только сериализуемый аргумент, а
 * замыкание модуля туда не попадает.
 */
function strengthSessionSetup(ctx) {
  const D = ctx.data;
  if (ctx.themeId) window.HEYS?.Theme?.setThemeId?.(ctx.themeId);
  const caseNow = Date.parse(D.now);
  window.Date.now = () => caseNow;
  const history = D.history || {};
  window.HEYS.StrengthBuilder.open({
    training: D.training,
    dateKey: D.dateKey,
    profile: D.profile,
    historyFor: (name) => (history[name] && history[name].record
      ? { record: history[name].record }
      : null),
    historyDetailFor: (name) => (history[name] && history[name].detail
      ? history[name].detail
      : { usages: [], record: null }),
    lastSessionFor: () => null,
    finishSummaryFor: () => null,
    onRepeatLast: null,
    syncStatusFor: D.syncStatus ? () => D.syncStatus : null,
    onPatch: () => {},
    onPatchSession: () => {},
    onClose: () => {},
  });
}

function setupFor(data) {
  // eslint-disable-next-line no-new-func
  return new Function(
    'ctx',
    `return (${strengthSessionSetup.toString()})(Object.assign({ data: ${JSON.stringify(data)} }, ctx));`,
  );
}

const ready = () =>
  !!window.React
  && !!window.ReactDOM?.createRoot
  && typeof window.HEYS?.StrengthBuilder?.open === 'function'
  && typeof window.HEYS?.StrengthBuilderParts?.ExerciseCard === 'function'
  && typeof window.HEYS?.TrainingKernel?.fullscreen?.mount === 'function'
  && typeof window.HEYS?.TrainingKernel?.strength?.trainingTonnage === 'function';

const work = (weightKg, reps, done) => ({ weightKg: String(weightKg), reps, done: !!done });
const warm = (weightKg, reps, done) => ({ weightKg: String(weightKg), reps, done: !!done, type: 'warmup' });

/** Состав сессии канваса: «Силовая · грудь, спина, плечи», 23 подхода. */
function sessionExercises() {
  return [
    { name: 'Жим лёжа', restSec: 120, approaches: [
      warm(20, 12, true), warm(30, 10, true), warm(40, 8, true),
      work(75, 8, true), work(75, 10, true), work(75, 10, true), work(75, 12, true),
    ] },
    { name: 'Тяга штанги в наклоне', restSec: 120, approaches: [
      warm(20, 12, true), warm(30, 10, true), warm(40, 8, true),
      work(60, 8, true), work(60, 10, true), work(60, 10, true), work(60, 12, true),
    ] },
    { name: 'Жим гантелей сидя', restSec: 120, rpe: 7, approaches: [
      work(22.5, 12, true), work(24, 10, true), work(24, 10, false),
    ] },
    { name: 'Разведение в тренажёре', restSec: 60, approaches: [
      warm(10, 15, false), warm(15, 12, false),
      work(20, 12, false), work(20, 12, false), work(20, 12, false),
    ] },
    { name: 'Подтягивания', restSec: 120, approaches: [work(0, 9, false), work(0, 9, false), work(0, 8, false)] },
    { name: 'Тяга блока', restSec: 90, approaches: [work(55, 10, false), work(55, 10, false), work(55, 10, false)] },
    { name: 'Французский жим', restSec: 60, approaches: [work(30, 12, false), work(30, 10, false)] },
  ];
}

const HISTORY = {
  'Жим лёжа': { record: { maxW: 75, maxSet: 900, total: 3000 } },
  'Жим гантелей сидя': {
    record: { maxW: 26, maxSet: 260, total: 900 },
    detail: { usages: [{ approaches: [work(22, 12, true)] }], record: { maxW: 26 } },
  },
};

function training(exercises, extra) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    time: '18:40',
    workoutLog: Object.assign({
      title: 'Силовая · грудь, спина, плечи',
      startedAt: Date.parse(START),
      exercises,
    }, extra || {}),
  };
}

function sessionCase(id, label, oid, data, steps) {
  return {
    id,
    zone: 'strength-builder',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-strength-zone',
    tab: 'widgets',
    themeId: 'sand',
    rootSelector: '.sb-root',
    captureSelector: '.sb-root',
    viewport: { width: 375, height: 812 },
    sbReady: ready,
    sbSetup: setupFor(Object.assign({
      now: NOW,
      dateKey: DATE_KEY,
      profile: { weight: 78 },
      history: HISTORY,
    }, data)),
    sbSteps: steps || [],
    canvasFrame: { file: CANVAS, label, oid, palette: 'sand' },
  };
}

// ── Е1 «Подход · таблица ввода» ────────────────────────────────────────────
// Раскрытая карточка третьего упражнения: два подхода закрыты, третий в работе.
const inputTable = sessionCase(
  'strength-session-input-table',
  'Подход · таблица ввода',
  'E1-INPUT-TABLE',
  { training: training(sessionExercises()) },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(3) .sb-ex-head' },
    { text: ['.sb-ex.is-open', 'Жим гантелей сидя'] },
  ],
);

// ── Е2 / К6 «Галочка не ставится при пустых повторах» ──────────────────────
// Тот же экран, но у текущего подхода стёрты повторы: поле обведено, галочка
// приглушена. Кадр — разбор из двух таблиц, продукт показывает первую из них
// на своём месте.
function blankRepsExercises() {
  const list = sessionExercises();
  list[2] = Object.assign({}, list[2], {
    approaches: [work(22.5, 12, true), work(24, 10, true), { weightKg: '24', reps: '', done: false }],
  });
  return list;
}

const checkBlocked = sessionCase(
  'strength-session-check-blocked',
  'Таблица · галочка не ставится',
  'E2-CHECK-BLOCKED',
  { training: training(blankRepsExercises()) },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(3) .sb-ex-head' },
    { text: ['.sb-ex.is-open', 'Жим гантелей сидя'] },
  ],
);

// ── Е3 «Отдых · кольцо» ────────────────────────────────────────────────────
// Отдых начат за 26 секунд до снимка: из 2:00 остаётся 1:34, как в кадре.
const REST = {
  total: 120,
  startedAt: Date.parse(NOW) - 26_000,
  exName: 'Жим гантелей сидя',
  owner: 'связка A',
  source: 'тяжесть 8 → 2:00',
  closedLabel: 'Жим гантелей сидя закрыт',
  contextNextLabel: 'дальше связка A · раунд 1 из 3',
  nextLabel: 'Следующий раунд · A1 подтягивания',
  collapsed: false,
};

function restExercises() {
  const list = sessionExercises();
  list[2] = Object.assign({}, list[2], {
    approaches: [work(22.5, 12, true), work(24, 10, true), work(24, 10, true)],
  });
  return list;
}

const restRing = sessionCase(
  'strength-session-rest-ring',
  'Отдых · кольцо',
  'E3-REST-RING',
  { training: training(restExercises(), { activeRest: REST, lastMarkAt: Date.parse(NOW) - 26_000 }) },
  [{ wait: '.sb-rest-ring' }],
);

// ── Е4 / К1 «Таймер вне экрана» — кольцо свёрнуто, правят другое упражнение ─
const restCollapsed = sessionCase(
  'strength-session-rest-collapsed',
  'Таймер вне экрана',
  'E4-REST-OFFSCREEN',
  {
    training: training(restExercises(), {
      activeRest: Object.assign({}, REST, { collapsed: true }),
      lastMarkAt: Date.parse(NOW) - 26_000,
    }),
  },
  [
    { wait: '.sb-rest-compact' },
    { click: '.sb-ex:nth-of-type(1) .sb-ex-head' },
    { text: ['.sb-ex.is-open', 'Жим лёжа'] },
  ],
);

// ── Е5 / К3 «Перенумерация» ────────────────────────────────────────────────
// Ярлык первого рабочего подхода переключён тапом по номеру — продукт сам
// открывает экран «было → стало».
function renumberExercises() {
  const list = sessionExercises();
  list[2] = Object.assign({}, list[2], {
    approaches: [work(22, 12, true), work(24, 10, true), work(24, 10, true)],
  });
  return list;
}

const renumber = sessionCase(
  'strength-session-renumber',
  'Перенумерация',
  'E5-RENUMBER',
  { training: training(renumberExercises()) },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(3) .sb-ex-head' },
    { text: ['.sb-ex.is-open', 'Жим гантелей сидя'] },
    { click: '.sb-ex.is-open .sb-ap:nth-of-type(1) .sb-ap-num' },
    { wait: '.sb-renumber-screen' },
  ],
);

// ── Ж1 «Порядок · режим перестановки» ──────────────────────────────────────
const order = sessionCase(
  'strength-session-order',
  'Порядок · режим перестановки',
  'J1-ORDER',
  { training: training(sessionExercises()) },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-head .sb-icon-btn[aria-label="Ещё"]' },
    { wait: '.sb-sheet-menu' },
    { click: '.sb-sheet-menu-row:has-text("Порядок упражнений")' },
    { wait: '.sb-order-screen' },
  ],
);

// ── М4 «Ввод · время под нагрузкой» ────────────────────────────────────────
function unitExercises(unit, name, approaches, extra) {
  const list = sessionExercises();
  list[2] = Object.assign({ name, unit, restSec: 60, approaches }, extra || {});
  return list;
}

const timeEntry = sessionCase(
  'strength-session-time-entry',
  'Ввод · время под нагрузкой',
  'M4-TIME',
  {
    training: training(unitExercises('time', 'Планка', [
      { durationSec: 70, done: true },
      { durationSec: 65, done: true },
      { durationSec: 45, done: false },
    ])),
  },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(3) .sb-ex-head' },
    { wait: '.sb-time-entry-block' },
  ],
);

// ── М5 «Ввод · метры» ──────────────────────────────────────────────────────
const distanceEntry = sessionCase(
  'strength-session-distance-entry',
  'Ввод · метры',
  'M5-DISTANCE',
  {
    training: training(unitExercises('distance', 'Гребной тренажёр', [
      { distanceM: 500, done: true },
      { distanceM: 500, done: true },
      { distanceM: 400, done: true },
    ])),
  },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(3) .sb-ex-head' },
    { wait: '.sb-distance-entry-block' },
  ],
);

// ── М6 «Ввод · свой вес с довесом» ─────────────────────────────────────────
const bodyweightEntry = sessionCase(
  'strength-session-bodyweight-entry',
  'Ввод · свой вес с довесом',
  'M6-BODYWEIGHT',
  {
    training: training(unitExercises('bodyweight', 'Подтягивания', [
      { weightKg: '', reps: 10, done: true },
      { weightKg: '', reps: 9, done: true },
      { weightKg: '10', reps: 7, done: true },
    ], { bodyweightFactor: 1 })),
  },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(3) .sb-ex-head' },
    { wait: '.sb-bw-entry-block' },
  ],
);

// ── З2 «Трисет в работе» ───────────────────────────────────────────────────
// Связка из трёх участников подряд с равным числом рабочих подходов: продукт
// сам показывает раунды, а кнопка ↗ в шапке связки открывает экран трисета.
function trisetExercises() {
  const list = sessionExercises();
  list.splice(2, 3,
    { name: 'Жим гантелей', restSec: 120, ssGroup: 2, approaches: [
      warm(10, 15, true), work(22, 10, true), work(22, 10, true), work(20, 10, false),
    ] },
    { name: 'Разведение', restSec: 120, ssGroup: 2, approaches: [
      work(10, 15, true), work(10, 12, false), work(10, 12, false),
    ] },
    { name: 'Тяга к подбор.', restSec: 120, ssGroup: 2, approaches: [
      work(25, 12, true), work(25, 10, false), work(25, 10, false),
    ] },
  );
  return list;
}

const triset = sessionCase(
  'strength-session-triset',
  'Трисет в работе',
  'Z2-TRISET',
  { training: training(trisetExercises()) },
  [
    { wait: '.sb-ss-work-open' },
    { click: '.sb-ss-work-open' },
    { wait: '.sb-triset-work-screen' },
  ],
);

// ── К2 «Спорное · подход добавлен к закрытому» ─────────────────────────────
// Все подходы закрыты; к третьему упражнению добавляют подход из шторки ⋯ —
// упражнение снова незакрыто, счёт дня растёт, «Завершить» гаснет.
function allDoneExercises() {
  return sessionExercises().map((ex) => Object.assign({}, ex, {
    approaches: ex.approaches.map((ap) => Object.assign({}, ap, { done: true })),
  }));
}

const reopened = sessionCase(
  'strength-session-reopened',
  'Спорное · подход добавлен к закрытому',
  'K2-REOPENED',
  { training: training(allDoneExercises()) },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(3) .sb-ex-head' },
    { text: ['.sb-ex.is-open', 'Жим гантелей сидя'] },
    { click: '.sb-head .sb-icon-btn[aria-label="Ещё"]' },
    { wait: '.sb-sheet' },
    { click: '.sb-sheet-row:has-text("Добавить подход")' },
    { text: ['.sb-finish', 'не закрыто'] },
  ],
);

// ── К4 «Спорное · вес правят после галочки» ────────────────────────────────
// Отмеченный подход с уже сниженным весом: продукт пересчитал тоннаж и снял
// бейдж рекорда. Кадр — разбор с прозой, продукт показывает результат правки.
function loweredWeightExercises() {
  const list = sessionExercises();
  list[0] = Object.assign({}, list[0], {
    approaches: [
      warm(20, 12, true), warm(30, 10, true), warm(40, 8, true),
      work(75, 8, true), work(75, 10, true), work(75, 10, true), work(72.5, 8, true),
    ],
  });
  return list;
}

const weightAfterCheck = sessionCase(
  'strength-session-weight-after-check',
  'Спорное · вес правят после галочки',
  'K4-WEIGHT-AFTER-CHECK',
  { training: training(loweredWeightExercises()) },
  [
    { wait: '.sb-ex-head' },
    { click: '.sb-ex:nth-of-type(1) .sb-ex-head' },
    { text: ['.sb-ex.is-open', 'Жим лёжа'] },
  ],
);

// ── К12 «Спорное · свой вес без коэффициента» ──────────────────────────────
// Упражнение на своём весе без ответа «на что похоже»: в тоннаж не идёт, и об
// этом отдельный счётчик в шапке сессии.
const noFactorBodyweight = sessionCase(
  'strength-session-no-factor',
  'Спорное · свой вес без коэффициента',
  'K12-NO-FACTOR',
  {
    training: training(unitExercises('bodyweight', 'Подтягивания', [
      { weightKg: '', reps: 10, done: true },
      { weightKg: '', reps: 9, done: true },
      { weightKg: '', reps: 8, done: true },
    ])),
  },
  [
    { wait: '.sb-ex-head' },
    { text: ['.sb-stats', 'без тоннажа'] },
  ],
);

export const STRENGTH_SESSION_VISUAL_CASES = [
  inputTable,
  checkBlocked,
  restRing,
  restCollapsed,
  renumber,
  order,
  triset,
  reopened,
  weightAfterCheck,
  noFactorBodyweight,
  timeEntry,
  distanceEntry,
  bodyweightEntry,
];
