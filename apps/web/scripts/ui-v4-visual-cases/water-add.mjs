// Стенды зоны water-add: плитка воды на Главной (ветка В₃ канваса) и карточка
// «Кольцо» на вкладке «Питание» в состояниях кадров canvas/water-add.v4.dc.html.
// Норма воды считается продуктом из веса и шагов: 74 кг × 30 + лето 300 +
// шаги 10 000 (два бонуса по 250) = 3 020 → 3,0 л, как в кадрах «норма» и в
// строке «из 3,0 · осталось 1,3» кадра «Кольцо». Коэффициент 30, а не 28:
// продукт берёт женский 28 только при profile.sex === 'female', а стенд, как и
// приложение, хранит пол словом в profile.gender.

const CANVAS = 'water-add.v4.dc.html';
const DAY = '2025-08-20';

function clock(iso) {
  return { iso, day: iso.slice(0, 10), epochMs: Date.parse(iso) };
}

const WATER_PROFILE = {
  weight: 74,
  weightGoal: 70,
  deficitPctTarget: 0,
  cycleTrackingEnabled: false,
  supplementsTrackingEnabled: false,
  plannedSupplements: [],
};

function waterDay(waterMl, extra) {
  return {
    date: DAY,
    weightMorning: 0,
    steps: 10000,
    waterMl,
    meals: [],
    trainings: [],
    ...extra,
  };
}

// Плитка 1×1 на Главной: единственный узел плитки воды в сетке виджетов.
function tileCase(id, label, waterMl) {
  return {
    id,
    zone: 'water-add',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'widgets',
    themeId: 'sand',
    stubGamificationMerge: true,
    clock: clock(`${DAY}T14:00:00+03:00`),
    fixtureProfile: WATER_PROFILE,
    fixtureDay: waterDay(waterMl, { lastWaterTime: Date.parse(`${DAY}T13:20:00+03:00`) }),
    rootSelector: '.widgets-grid .widget',
    captureSelector: '.widgets-grid [data-widget-type="water"]',
    viewport: { width: 375, height: 812 },
    canvasFrame: { file: CANVAS, label, oid: id.toUpperCase(), palette: 'sand' },
  };
}

// Неделя воды для строки «в среднем»: шесть прошлых дней плюс сегодняшние
// 1,7 л дают 14,7 л / 7 = 2,1 л, как в кадре «Кольцо».
const WEEK_BEFORE = [['2025-08-14', 2400], ['2025-08-15', 2000], ['2025-08-16', 2300], ['2025-08-17', 1900], ['2025-08-18', 2200], ['2025-08-19', 2200]]
  .map(([date, waterMl]) => ({ date, waterMl, steps: 10000, meals: [], trainings: [] }));

// Плавающая кнопка воды выключена в настройках — только тогда карточка воды
// показывает ряд объёмов (при кнопке она компактная). Ключ видимости продукт
// читает через HEYS.utils.lsGet, а тот добавляет клиента (nsKey).
const FAB_OFF = { 'heys_demo-client-female_fab_visibility_v1': { water: false, hunger: true, message: true, activity: true, meal: true } };

// Ряд объёмов карточки воды — то, что рисуют кадры «Чипы объёма».
function chipsCase(id, label, waterMl, extra = {}) {
  return {
    id,
    zone: 'water-add',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'diary',
    themeId: 'sand',
    stubGamificationMerge: true,
    clock: clock(`${DAY}T14:00:00+03:00`),
    fixtureProfile: WATER_PROFILE,
    fixtureDay: waterDay(waterMl, waterMl > 0 ? { lastWaterTime: Date.parse(`${DAY}T11:37:00+03:00`) } : {}),
    fixtureLsKeys: FAB_OFF,
    rootSelector: '.nutrition-v4',
    captureSelector: '#water-card .water-review__quick',
    viewport: { width: 375, height: 812 },
    uiSteps: [
      { waitFor: '#water-card .water-review__quick' },
      // Ряд стоит внизу вкладки, и его перекрывала нижняя навигация.
      { reveal: '#water-card' },
    ],
    ...extra,
    canvasFrame: { file: CANVAS, label, oid: id.toUpperCase(), palette: 'sand' },
  };
}

export const WATER_ADD_VISUAL_CASES = Object.freeze([
  // Кадр рисует норму 0,65 л — продукт не опускает норму ниже 1,5 л, поэтому
  // в плитке стенда «из 3,0»; сравнивается заливка и раскладка подписей.
  tileCase('water-b3-reduced-motion', 'Вода · В3 · уменьшенное движение', 400),
  // Кадры «норма · N л» подписаны одним числом 2,4 при разной заливке —
  // стенд заливает плитку на уровень из названия кадра и пишет своё число.
  tileCase('water-norm-0-4', 'Вода · норма · 0,4 л', 400),
  tileCase('water-norm-0-8', 'Вода · норма · 0,8 л', 800),
  tileCase('water-norm-1-0', 'Вода · норма · 1,0 л', 1000),
  tileCase('water-norm-2-1', 'Вода · норма · 2,1 л', 2100),
  tileCase('water-norm-2-7', 'Вода · норма · 2,7 л', 2700),
  {
    id: 'water-card-ring',
    zone: 'water-add',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'diary',
    themeId: 'sand',
    stubGamificationMerge: true,
    clock: clock(`${DAY}T14:00:00+03:00`),
    fixtureProfile: WATER_PROFILE,
    fixtureDay: waterDay(1700, { lastWaterTime: Date.parse(`${DAY}T11:37:00+03:00`) }),
    fixtureDays: WEEK_BEFORE,
    // Кадр «Кольцо» — карточка с чипами объёма: чипы видны, когда плавающая
    // кнопка воды выключена в настройках (компактный вид карточки — при кнопке).
    // Ключ видимости кнопок продукт читает через HEYS.utils.lsGet, а тот
    // добавляет клиента (nsKey): неименованный heys_fab_visibility_v1 стенд
    // клал, но карточка его не видела и оставалась компактной.
    fixtureLsKeys: { 'heys_demo-client-female_fab_visibility_v1': { water: false, hunger: true, message: true, activity: true, meal: true } },
    rootSelector: '.nutrition-v4',
    captureSelector: '#water-card',
    viewport: { width: 375, height: 812 },
    uiSteps: [{ waitFor: '#water-card .water-review__quick' }],
    canvasFrame: { file: CANVAS, label: 'Вода · карточка · Кольцо', oid: 'WATER-CARD-RING', palette: 'sand' },
  },
  // Кадры «Чипы объёма» рисуют ряд ±объёмов на плашке рядом с круглой кнопкой
  // воды. Плавающей кнопки воды со своим рядом в продукте больше нет (27
  // августа стопка быстрых действий сведена в одну, eb51d0ed2), а живой ряд
  // объёмов с убавляющим чипом — в карточке воды на «Питании». Снимаем его:
  // именно он несёт правила кадров (заливка добавляет, обводка убавляет,
  // минус первым с увеличенным зазором, гаснет когда убавлять нечего).
  chipsCase('water-chips-normal', 'Чипы объёма · обычный вид', 1200),
  chipsCase('water-chips-nothing', 'Чипы объёма · нечего убавлять', 0),
  // Кадр «нажатие» снимается тем же рядом в покое: состояние нажатия стендом не
  // замораживается. Добавляющий чип держать нельзя — через 350 мс его долгое
  // нажатие открывает лист своего объёма (это продукт, строка «свой объём ·
  // долгое нажатие»), а удержание указателя в снимающем контексте (touch-девайс
  // без отпускания) `:active` не красит: замер на живом дереве 12 сентября дал
  // opacity 1 у всех пяти чипов и до, и во время удержания. Само правило
  // продукта проверяемо в CSS: `.water-review__chip:active { opacity: .7 }` —
  // общее «гашение до 70 % на касание»; кадр вместо него сжимает чип до .96.
  chipsCase('water-chips-press', 'Чипы объёма · нажатие', 1200),
]);
