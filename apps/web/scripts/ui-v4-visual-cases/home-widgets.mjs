// Стенды Главной (home-widgets) для пар «макет — приложение».
//
// Все кейсы — один сценарий `demo-home-widget` в ui-v4-visual-capture.mjs:
// настоящая вкладка «Главная» демо-режима, данные плиток подменяются через
// `Widgets.data.getDataForWidget` (как у стенда пустого дня), раскладка
// собирается штатным `state.addWidget`, а состояния (лист видов, разбор,
// быстрые действия, расстановка) открываются тем же путём, что и пальцем.
//
// Кадры-экраны и листы снимаются целым окном 375×812 и в плане пары
// (tmp/pairs/plan.home-widgets.json) сводятся с кадром; кадры-плитки идут
// через `canvasFrame` — кадр и узел плитки снимаются самим стендом.

const CANVAS_FILE = 'home-widgets.v4.dc.html';
const VIEWPORT = { width: 375, height: 812 };

// Тема стенда для палитровых копий кадров («· тёмная» и т. д.) — id из HEYS.Theme.
const PALETTES = Object.freeze({
  '': 'sand',
  ' · тёмная': 'sand-dark',
  ' · синяя': 'blue',
  ' · сине-тёмная': 'blue-dark',
});
const PALETTE_SUFFIX = Object.freeze({ sand: '', 'sand-dark': '-dark', blue: '-blue', 'blue-dark': '-blue-dark' });

// Числа кадра «Главная · дефолтная раскладка» — те же, что у стенда
// home-widgets-default: остальные кадры зоны нарисованы на этом же дне.
export const HOME_BASE_DATA = Object.freeze({
  calories: { hasData: true, eaten: 1289, target: 1931 },
  insulinWave: {
    hasData: true,
    status: 'active',
    isLipolysis: false,
    v4: {
      hasMeals: true,
      isOvernight: false,
      mealCount: 3,
      mealCountLabel: '3 приёма',
      overlapCount: 0,
      overlapCountLabel: null,
      jointCountLabel: null,
      underWaveLabel: 'под волной 6:20',
      calmWindowMinutes: 200,
      scheme: {
        figures: [
          { id: 'm1', d: 'M4,46 C15.4,46 12.9,22 24.3,22 C35.7,22 33.3,46 44.7,46 Z', opacity: 0.45 },
          { id: 'm2', d: 'M44.7,46 C56.1,46 53.6,16 65,16 C76.4,16 73.9,46 85.3,46 Z', opacity: 0.45 },
          { id: 'm3', d: 'M85.3,46 C96.7,46 94.3,26 105.7,26 C117.1,26 114.6,46 126,46 Z', opacity: 0.8 },
        ],
        dividers: [44.7, 85.3],
        joints: [],
        overlaps: [],
      },
    },
  },
  macros: {
    hasData: true,
    protein: 96,
    proteinTarget: 150,
    fat: 48,
    fatTarget: 62,
    carbs: 198,
    carbsTarget: 180,
  },
  sleep: { hours: 6.4, target: 7.5 },
  water: { drunk: 1700, target: 2700 },
  steps: {
    hasData: true,
    steps: 9655,
    goal: 10000,
    avgWeek: 8940,
    daysWithData: 7,
    week: [9298, 7510, 10728, 6080, 10370, 8940, 9655].map((value, index) => ({
      iso: `2026-08-${String(22 + index).padStart(2, '0')}`,
      value,
      hasData: true,
      isToday: index === 6,
    })),
  },
  heatmap: {
    days: [
      { date: '2026-08-22', status: 'good' },
      { date: '2026-08-23', status: 'good' },
      { date: '2026-08-24', status: 'empty' },
      { date: '2026-08-25', status: 'good' },
      { date: '2026-08-26', status: 'warn' },
      { date: '2026-08-27', status: 'good' },
      { date: '2026-08-28', status: 'good' },
    ],
  },
  relapseRisk: {
    level: 'low',
    primaryDrivers: [
      { label: 'недосып', text: '2 дня' },
      { label: 'вода', text: 'ниже нормы' },
    ],
  },
  healthTrend: {
    hasData: true,
    delta: 8,
    periodDays: 14,
    sparkline: { values: [40, 42, 41, 46, 49, 52, 54], strokeWidth: 2.5 },
  },
  weight: {
    current: 91.1,
    weekChange: -0.9,
    windowDeltaKg: -0.9,
    sparkline: [92, 91.85, 91.925, 91.55, 91.625, 91.25, 91.1].map((weight, index) => ({
      date: `2026-08-${String(22 + index).padStart(2, '0')}`,
      weight,
    })),
  },
  crashRisk: {
    hasData: true,
    dynamicsV4: {
      hasDynamics: true,
      window: { label: 'Вес за месяц' },
      deltaKg: -1.8,
      delta: { sign: '−', text: '1,8' },
      deltaState: 'good',
      goalWeight: 87.5,
      goalReached: false,
      remainderLabel: 'до цели 3,6',
      // Лист «Смена вида · лист выбора» рисует превью всех видов «Динамики
      // веса» настоящим кодом плитки, и каждый вид читает своё поле. Без них
      // «До цели» показывал дельту вместо остатка, «Недели» — пустое место, а
      // «График» — плитку без кривой: это была дыра стенда, а не продукта.
      remainderShort: 'осталось 3,6',
      toGoalKg: 3.6,
      goalProgressPct: 45,
      monthRateKg: -1.8,
      weighDayCount: 28,
      weeklyBars: [
        { heightPct: 100, isLast: false, state: 'neutral' },
        { heightPct: 73, isLast: false, state: 'neutral' },
        { heightPct: 47, isLast: false, state: 'neutral' },
        { heightPct: 20, isLast: true, state: 'good' },
      ],
      sparkline: {
        points: '2,6 11,9 20,7 29,13 38,12 47,17 56,19',
        last: { x: 56, y: 19 },
      },
      // Кривая вида «График» в системе координат самого продукта
      // (CHART_VIEW 121×54, поля 2, полоса 9…38) — те же семь точек окна.
      chart: {
        points: '2,9 21.2,17.3 40.3,13.1 59.5,33.9 78.7,29.8 97.8,38 117,38',
        area: 'M2 9 L21.2 17.3 L40.3 13.1 L59.5 33.9 L78.7 29.8 L97.8 38 L117 38 V54 H2 Z',
        last: { x: 117, y: 38 },
        days: 7,
      },
    },
  },
  protein: { hasData: true, protein: 115, target: 160, pct: 72, remaining: 45 },
  fiber: { hasData: true, fiber: 5, norm: 30, pct: 17, remaining: 25 },
});

// Раскладка кадров «Смена вида · …»: калории, вес, вода, динамика веса, шаги.
const VARIANT_SCENE_LAYOUT = [
  { type: 'calories', size: '2x2' },
  { type: 'weight', size: '2x1' },
  { type: 'water', size: '2x1' },
  { type: 'crashRisk', size: '2x1', variant: 'curve' },
  { type: 'steps', size: '2x1' },
];

// Кадры «Расстановка · …» рисуют схему потока (flow) на шести плитках; здесь
// те же типы и форматы, порядок чтения задаёт укладку сам.
const ARRANGE_BEFORE = [
  { type: 'calories', size: '2x2' },
  { type: 'weight', size: '2x1' },
  { type: 'water', size: '2x1', variant: 'by_hour' },
  { type: 'sleep', size: '1x1' },
  { type: 'steps', size: '1x1' },
  { type: 'macros', size: '2x1', variant: 'bars' },
];

// Кадр «Каталог · нет места» и «Главная · расстановка · тёмная»: занято 32 из 32,
// тепловой карты и клетчатки на экране нет — им каталог и говорит «нет места».
const FULL_LAYOUT = [
  { type: 'calories', size: '2x2' },
  { type: 'insulinWave', size: '2x2' },
  { type: 'macros', size: '3x2' },
  { type: 'sleep', size: '1x1' },
  { type: 'water', size: '1x1' },
  { type: 'steps', size: '2x1' },
  { type: 'relapseRisk', size: '2x2' },
  { type: 'healthTrend', size: '2x2' },
  { type: 'weight', size: '2x1' },
  { type: 'crashRisk', size: '2x1' },
  { type: 'protein', size: '1x1' },
  { type: 'dayScore', size: '1x1' },
];

// Кадр «Каталог · значки вместо эмодзи»: занято 18 из 32.
const HALF_LAYOUT = [
  { type: 'calories', size: '2x2' },
  { type: 'macros', size: '3x2' },
  { type: 'relapseRisk', size: '2x2' },
  { type: 'steps', size: '2x1' },
  { type: 'weight', size: '2x1' },
];

// Кадр «Замена · до/после броска»: калории, риск, вес, динамика веса; клетчатка
// приходит из каталога на место динамики.
const REPLACE_LAYOUT = [
  { type: 'calories', size: '2x2' },
  { type: 'relapseRisk', size: '2x1', variant: 'main' },
  { type: 'weight', size: '2x1' },
  { type: 'crashRisk', size: '2x1', variant: 'curve' },
];

const WIDGET_BY_LABEL = Object.freeze({
  'Калории': 'calories',
  'Кольца БЖУ': 'macros',
  'Вода': 'water',
  'Сон': 'sleep',
  'Оценка дня': 'dayScore',
  'Тепловая карта': 'heatmap',
  'Риск-радар': 'relapseRisk',
  'Тренд здоровья': 'healthTrend',
  'Инсулиновая волна': 'insulinWave',
  'Вес': 'weight',
  'Клетчатка': 'fiber',
  'Белок': 'protein',
  'Окно до сна': 'sleepWindow',
  'Качество еды': 'foodQuality',
  'Ритм приёмов': 'mealRhythm',
  'Готовность ко сну': 'sleepReady',
});

// Раскладка для листов видов и разборов: плитка нужного типа обязана стоять
// на экране, чтобы её было чем удерживать и по чему тапать.
function sheetLayoutFor(type) {
  const base = [
    { type: 'calories', size: '2x2' },
    { type: 'weight', size: '2x1' },
    { type: 'water', size: '2x1' },
  ];
  if (base.some((w) => w.type === type)) return base;
  return [...base, { type }];
}

function screenCase(id, label, home, extra = {}) {
  return {
    id,
    zone: 'home-widgets',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-home-widget',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    rootSelector: '.widgets-grid .widget',
    viewport: VIEWPORT,
    // Кадр для плана пары: экранные кадры сводятся в tmp/pairs по подписи.
    frameLabel: label,
    home,
    ...extra,
  };
}

function withPalettes(makeCase, suffixes = Object.keys(PALETTES)) {
  return suffixes.map((suffix) => {
    const themeId = PALETTES[suffix];
    return makeCase(suffix, themeId, PALETTE_SUFFIX[themeId]);
  });
}

const SCREEN_CASES = [
  // ─── Главная целиком: палитровые копии дефолтной раскладки и расстановки ───
  ...withPalettes((suffix, themeId, idSuffix) => screenCase(
    `home-widgets-default${idSuffix}`,
    `Главная · дефолтная раскладка${suffix}`,
    { data: HOME_BASE_DATA, hideFabs: true },
    { themeId, captureSelector: '.widgets-grid' },
  ), [' · тёмная', ' · синяя', ' · сине-тёмная']),
  ...withPalettes((suffix, themeId, idSuffix) => screenCase(
    `home-widgets-edit${idSuffix}`,
    `Главная · расстановка${suffix}`,
    { data: HOME_BASE_DATA, layout: FULL_LAYOUT, open: 'edit' },
    { themeId },
  ), [' · тёмная', ' · сине-тёмная']),

  // ─── Быстрые действия ───
  ...withPalettes((suffix, themeId, idSuffix) => screenCase(
    `home-widgets-quick-open${idSuffix}`,
    `Быстрые действия · раскрыто${suffix}`,
    { data: HOME_BASE_DATA, scrollBottom: true, open: 'quick' },
    { themeId, preserveScroll: true },
  )),
  screenCase('home-widgets-quick-sole-water', 'Быстрые действия · один пункт · вода',
    { data: HOME_BASE_DATA, scrollBottom: true, fabVisibility: { water: true, meal: false, hunger: false, activity: false, message: false } },
    { preserveScroll: true }),
  screenCase('home-widgets-quick-sole-water-open', 'Быстрые действия · один пункт · вода · раскрыто',
    { data: HOME_BASE_DATA, scrollBottom: true, open: 'quick', fabVisibility: { water: true, meal: false, hunger: false, activity: false, message: false } },
    { preserveScroll: true }),
  ...[['meal', 'еда'], ['hunger', 'голод'], ['activity', 'активность'], ['message', 'мессенджер']].map(([key, word]) => screenCase(
    `home-widgets-quick-sole-${key}`,
    `Быстрые действия · один пункт · ${word}`,
    { data: HOME_BASE_DATA, scrollBottom: true, fabVisibility: { water: false, meal: false, hunger: false, activity: false, message: false, [key]: true } },
    { preserveScroll: true },
  )),
  screenCase('home-widgets-quick-none', 'Быстрые действия · ни одного',
    { data: HOME_BASE_DATA, scrollBottom: true, fabVisibility: { water: false, meal: false, hunger: false, activity: false, message: false } },
    { preserveScroll: true, rootSelector: '.widgets-grid .widget' }),
  screenCase('home-widgets-quick-edit-pencil', 'Быстрые действия · правка · карандаш',
    { data: HOME_BASE_DATA, scrollBottom: true, open: 'quick' },
    { preserveScroll: true }),
  screenCase('home-widgets-quick-edit-mode', 'Быстрые действия · правка · режим',
    { data: HOME_BASE_DATA, scrollBottom: true, open: 'quick-edit' },
    { preserveScroll: true }),
  screenCase('home-widgets-quick-edit-hidden', 'Быстрые действия · правка · скрытые',
    { data: HOME_BASE_DATA, scrollBottom: true, open: 'quick-edit', fabVisibility: { message: false } },
    { preserveScroll: true }),

  // ─── Каталог и замена ───
  ...withPalettes((suffix, themeId, idSuffix) => screenCase(
    `home-widgets-catalog-full${idSuffix}`,
    `Каталог · нет места${suffix}`,
    { data: HOME_BASE_DATA, layout: FULL_LAYOUT, open: 'edit', scrollTo: '.widget-v4-catalog' },
    // Кадр каталога — фрагмент 300 px (шапка листа и две строки), поэтому
    // снимаем сам каталог, а не весь экран: иначе пара сводит лист с целой
    // Главной и любое расхождение тонет.
    { themeId, preserveScroll: true, captureSelector: '.widget-v4-catalog' },
  )),
  ...withPalettes((suffix, themeId, idSuffix) => screenCase(
    `home-widgets-catalog${idSuffix}`,
    `Каталог · значки вместо эмодзи${suffix}`,
    { data: HOME_BASE_DATA, layout: HALF_LAYOUT, open: 'edit', scrollTo: '.widget-v4-catalog' },
    { themeId, preserveScroll: true, captureSelector: '.widget-v4-catalog' },
  )),
  screenCase('home-widgets-replace-before', 'Замена · до броска',
    { data: HOME_BASE_DATA, layout: REPLACE_LAYOUT, open: 'edit', drag: { catalogName: 'Клетчатка', target: 'crashRisk' } }),
  screenCase('home-widgets-replace-after', 'Замена · после броска',
    { data: HOME_BASE_DATA, layout: REPLACE_LAYOUT, open: 'edit', replace: { catalogType: 'fiber', target: 'crashRisk' } }),

  // ─── Расстановка: поток плиток ───
  screenCase('home-widgets-arrange-before', 'Расстановка · до смены',
    { data: HOME_BASE_DATA, layout: ARRANGE_BEFORE, open: 'edit' }),
  screenCase('home-widgets-arrange-grow', 'Расстановка · рост',
    { data: HOME_BASE_DATA, layout: ARRANGE_BEFORE.map((w) => (w.type === 'weight' ? { type: 'crashRisk', size: '2x2', variant: 'chart' } : w)), open: 'edit' }),
  screenCase('home-widgets-arrange-shrink', 'Расстановка · сжатие',
    { data: HOME_BASE_DATA, layout: ARRANGE_BEFORE.map((w) => (w.type === 'weight' ? { type: 'weight', size: '1x1', variant: 'delta' } : w)), open: 'edit' }),
  screenCase('home-widgets-arrange-gap', 'Расстановка · дырка',
    { data: HOME_BASE_DATA, layout: ARRANGE_BEFORE.filter((w) => w.type !== 'sleep' && w.type !== 'steps').map((w) => (w.type === 'weight' ? { type: 'weight', size: '1x1', variant: 'delta' } : w)), open: 'edit' }),

  // ─── Смена вида (динамика веса) ───
  screenCase('home-widgets-variant-hold', 'Смена вида · удержание',
    { data: HOME_BASE_DATA, layout: VARIANT_SCENE_LAYOUT, open: 'hold', target: 'crashRisk', hideFabs: true }),
  ...withPalettes((suffix, themeId, idSuffix) => screenCase(
    `home-widgets-variant-sheet${idSuffix}`,
    `Смена вида · лист выбора${suffix}`,
    { data: HOME_BASE_DATA, layout: VARIANT_SCENE_LAYOUT, open: 'variant-sheet', target: 'crashRisk' },
    { themeId },
  )),
  screenCase('home-widgets-variant-saved', 'Смена вида · новый вид',
    { data: HOME_BASE_DATA, layout: VARIANT_SCENE_LAYOUT, open: 'variant-pick', target: 'crashRisk', pick: 'Остаток полосой', hideFabs: true }),

  // ─── Шторки видов по плиткам ───
  ...Object.entries(WIDGET_BY_LABEL).map(([label, type]) => {
    const isSheetFrame = ['fiber', 'protein', 'sleepWindow', 'foodQuality', 'mealRhythm', 'sleepReady'].includes(type);
    return screenCase(
      `home-widgets-variant-sheet-${type}`,
      `${isSheetFrame ? 'Смена вида' : 'Шторка'} · ${label}`,
      { data: HOME_BASE_DATA, layout: sheetLayoutFor(type), open: 'variant-sheet', target: type },
    );
  }),

  // ─── Разбор плитки ───
  ...Object.entries({
    ...WIDGET_BY_LABEL,
    'БЖУ': 'macros',
    'Шаги': 'steps',
    'Карта активности': 'heatmap',
    'Динамика веса': 'crashRisk',
  }).filter(([label]) => label !== 'Кольца БЖУ' && label !== 'Тепловая карта').map(([label, type]) => screenCase(
    `home-widgets-breakdown-${type}`,
    `Разбор · ${label}`,
    { data: HOME_BASE_DATA, layout: sheetLayoutFor(type), open: 'breakdown', target: type },
  )),
];

export const HOME_WIDGETS_VISUAL_CASES = Object.freeze(SCREEN_CASES);
