// Стенды зоны nutrition-tab — вкладка «Питание» в состояниях кадров
// canvas/nutrition-tab.v4.dc.html. Экран настоящий: демо-режим открывает
// вкладку, данные дня лежат в хранилище стенда, переходы в состояния — тапами
// по продуктовым узлам (строка дневника, «Добавить приём», «Удалить приём»).

const CANVAS = 'nutrition-tab.v4.dc.html';
const DAY = '2025-08-20'; // среда, «ср, 20 авг» кадров
const PAST = '2025-08-19'; // вторник, «Вчера, 19 августа»

function clock(iso) {
  return { iso, day: iso.slice(0, 10), epochMs: Date.parse(iso) };
}

// Бюджет дня продукт считает сам: Mifflin-St Jeor + шаги.
// 64 кг · 168 см · 30 лет · женский = 1 379 ккал покоя, 13 970 шагов = 552 ккал,
// дефицит 0 % → 1 931 ккал — то же число, что во всех кадрах этой зоны.
const BUDGET_STEPS = 13970;

const NUTRITION_PROFILE = {
  weight: 64,
  height: 168,
  weightGoal: 60,
  deficitPctTarget: 0,
  insulinWaveHours: 3,
  cycleTrackingEnabled: false,
  supplementsTrackingEnabled: false,
  plannedSupplements: [],
};

// Калорийность продукт выводит из макросов (3·Б + 4·У + 9·Ж), поле kcal100 он
// не читает вовсе. Поэтому числа кадров набираются макросами: 25 г углеводов на
// 100 г дают ровно 100 ккал, и граммы позиции совпадают с её калориями.
let itemSeq = 0;
function food(name, kcal, macros) {
  itemSeq += 1;
  const m = macros || {};
  const grams = m.grams != null ? m.grams : Math.max(1, Math.round(kcal));
  // Доля макроса в 100 г подбирается так, чтобы сумма дня совпала с кадром.
  const protein100 = m.protein100 || 0;
  const fat100 = m.fat100 || 0;
  const carbs100 = m.carbs100 != null ? m.carbs100 : (100 - 3 * protein100 - 9 * fat100) / 4;
  return {
    id: `nt-item-${itemSeq}`,
    name,
    grams,
    protein100,
    fat100,
    carbs100,
    simple100: 0,
    complex100: carbs100,
    badFat100: 0,
    goodFat100: fat100,
    trans100: 0,
    fiber100: m.fiber100 || 0,
    harm: m.harm != null ? m.harm : 2,
    gi: m.gi != null ? m.gi : 40,
  };
}

function meal(id, name, time, items) {
  return { id, name, mealTypePinned: true, time, items };
}

function day(date, meals, extra) {
  return {
    date,
    weightMorning: 0,
    steps: BUDGET_STEPS,
    waterMl: 1700,
    meals,
    trainings: [],
    ...extra,
  };
}

function base(id, label, options) {
  return {
    id,
    zone: 'nutrition-tab',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-tab',
    tab: 'diary',
    themeId: 'sand',
    stubGamificationMerge: true,
    clock: clock(`${DAY}T15:10:00+03:00`),
    fixtureProfile: NUTRITION_PROFILE,
    rootSelector: '.nutrition-v4',
    viewport: { width: 375, height: 812 },
    ...options,
    canvasFrame: {
      file: CANVAS,
      label,
      oid: id.toUpperCase(),
      palette: 'sand',
      ...(options && options.canvasCrop ? { captureSelector: options.canvasCrop } : {}),
    },
  };
}

// === Герой · зоны перебора ==========================================
// Три кадра рисуют один блок при 105 / 113 / 138 % бюджета. Сумма дня набрана
// одним приёмом: в кадре виден только герой.
function heroZone(id, label, eatenKcal) {
  return base(id, label, {
    canvasCrop: '.hero',
    captureSelector: '.nutrition-v4-hero',
    // Снимок — одна карточка, кадр рисует её внутри целого экрана: шапка,
    // капсула даты и нижняя навигация к этой паре не относятся и сверяются
    // своими кадрами.
    frameTextFrom: 'Осталось на сегодня',
    frameTextUntilWhy: 'снимок и кадр обрезаны до карточки .hero — остальное экран вокруг неё',
    fixtureDay: day(DAY, [
      meal('nt-hero-1', 'Завтрак', '08:20', [food('Овсянка с ягодами', Math.round(eatenKcal * 0.3), { protein100: 3, fat100: 3 })]),
      meal('nt-hero-2', 'Обед', '13:05', [food('Курица с рисом', Math.round(eatenKcal * 0.4), { protein100: 8, fat100: 2 })]),
      meal('nt-hero-3', 'Ужин', '19:10', [food('Лосось с овощами', eatenKcal - Math.round(eatenKcal * 0.3) - Math.round(eatenKcal * 0.4), { protein100: 7, fat100: 4 })]),
    ]),
  });
}

// === Перебор · вкладка целиком ======================================
// 2 190 ккал при бюджете 1 931 — 113 %. Макросы подобраны так, чтобы итоги дня
// совпали с кадром: Б 118 · У 164 · Кл 24. Жиры кадра (81 г) с его же
// калорийностью не сходятся ни по какой формуле — берём 131 г, при которых
// сумма даёт 2 190 (см. tmp/pairs/notes.nutrition-tab.json).
const OVER_MACROS = { protein100: 5.4, fat100: 6, fiber100: 1.1 };
const OVER_MEALS = [
  meal('nt-over-1', 'Завтрак', '08:00', [food('Овсянка с ягодами', 380, OVER_MACROS)]),
  meal('nt-over-2', 'Перекус', '08:50', [food('Творог с орехами', 260, OVER_MACROS)]),
  meal('nt-over-3', 'Обед', '13:00', [food('Курица, рис, салат', 620, OVER_MACROS)]),
  meal('nt-over-4', 'Перекус', '17:00', [food('Хлебцы с сыром', 330, OVER_MACROS)]),
  meal('nt-over-5', 'Ужин', '21:00', [food('Лосось с гречкой', 600, OVER_MACROS)]),
];

// === Прошлый день ===================================================
// Промежутки больше длительности волны — нахлёста нет, строка окна говорит
// «день закрыт», как в кадре.
const PAST_MEALS = [
  meal('nt-past-1', 'Завтрак', '08:05', [food('Яйца', 180, { protein100: 12, fat100: 6 }), food('Тост', 130, { protein100: 4, fat100: 2 }), food('Кофе', 92, { protein100: 3, fat100: 3 })]),
  meal('nt-past-2', 'Обед', '12:50', [food('Суп', 210, { protein100: 5, fat100: 3 }), food('Индейка', 260, { protein100: 14, fat100: 3 }), food('Гречка', 178, { protein100: 4, fat100: 1 })]),
  meal('nt-past-3', 'Перекус', '17:30', [food('Творог', 150, { protein100: 15, fat100: 2 })]),
  meal('nt-past-4', 'Ужин', '21:40', [food('Лосось', 320, { protein100: 11, fat100: 8 }), food('Овощи', 116, { protein100: 2, fat100: 1, fiber100: 3 }), food('Рис', 150, { protein100: 3, fat100: 1 })]),
];

// === Дневник с номерами =============================================
// Кадр показывает седьмой приём дня, пустой третий и строку серии. Приёмы дня
// строятся целиком: продукт нумерует их по возрастанию времени.
const DIARY_MEALS = [
  meal('nt-d-1', 'Завтрак', '08:20', [food('Овсянка', 260, { protein100: 4, fat100: 3 }), food('Банан', 90, { protein100: 1, fat100: 0 }), food('Кофе с молоком', 68, { protein100: 3, fat100: 3 })]),
  meal('nt-d-2', 'Перекус', '10:30', [food('Йогурт', 120, { protein100: 10, fat100: 3 })]),
  meal('nt-d-3', 'Перекус', '11:15', []),
  meal('nt-d-4', 'Обед', '13:05', [food('Курица', 280, { protein100: 20, fat100: 4 }), food('Рис', 180, { protein100: 3, fat100: 1 }), food('Салат', 102, { protein100: 2, fat100: 3, fiber100: 4 })]),
  meal('nt-d-5', 'Ужин', '18:00', [food('Гречка', 220, { protein100: 5, fat100: 1 }), food('Лосось', 230, { protein100: 12, fat100: 8 }), food('Перец', 55, { protein100: 1, fat100: 0, fiber100: 3 }), food('Масло оливковое', 60, { protein100: 0, fat100: 11, carbs100: 0 })]),
  meal('nt-d-6', 'Перекус', '19:30', [food('Творог', 120, { protein100: 15, fat100: 2 }), food('Орехи', 61, { protein100: 5, fat100: 9 })]),
  meal('nt-d-7', 'Кофе-брейк', '21:00', [food('Кофе с молоком', 3, { protein100: 3, fat100: 1 })]),
];

// === Приёмы полосами ================================================
// Один нахлёст, как в кадре: перекус в 17:00 попадает под волну обеда 16:00,
// остальные промежутки больше длительности волны.
const TIMELINE_MEALS = [
  meal('nt-t-1', 'Завтрак', '08:00', [food('Овсянка', 240, { protein100: 4, fat100: 3 })]),
  meal('nt-t-2', 'Обед', '12:00', [food('Курица с рисом', 620, { protein100: 9, fat100: 4 })]),
  meal('nt-t-3', 'Перекус', '16:00', [food('Йогурт', 140, { protein100: 10, fat100: 3 })]),
  meal('nt-t-4', 'Перекус', '17:00', [food('Хлебцы с сыром', 210, { protein100: 7, fat100: 7 })]),
  meal('nt-t-5', 'Ужин', '20:00', [food('Лосось с гречкой', 520, { protein100: 8, fat100: 6 })]),
];

// === Лист правки приёма =============================================
// Граммовки строк и Б/Ж/У приёма — из кадра: 180 · 120 · 150 · 10 г, Б 42 ·
// Ж 18 · У 54. Калорийность продукт считает из макросов, поэтому в шапке
// получается 504 ккал, а кадр пишет 562 — числа кадра между собой не сходятся.
const SHEET_MEALS = [
  meal('nt-s-1', 'Завтрак', '08:20', [food('Овсянка', 240, { protein100: 4, fat100: 3 }), food('Банан', 90, { protein100: 1, fat100: 0 }), food('Кофе с молоком', 88, { protein100: 3, fat100: 3 })]),
  meal('nt-s-2', 'Обед', '13:05', [
    food('Курица, грудка', 0, { grams: 180, protein100: 23.33, fat100: 0, carbs100: 0 }),
    food('Рис бурый', 0, { grams: 120, protein100: 0, fat100: 0, carbs100: 45 }),
    food('Салат овощной', 0, { grams: 150, protein100: 0, fat100: 5.33, carbs100: 0, fiber100: 3 }),
    food('Масло оливковое', 0, { grams: 10, protein100: 0, fat100: 100, carbs100: 0 }),
  ]),
  meal('nt-s-3', 'Ужин', '19:10', [food('Лосось с овощами', 299, { protein100: 11, fat100: 7 })]),
];

// Все семь чипов вкладки выключены — остаётся каркас и ряд чипов.
const ALL_CHIPS_OFF = {
  showDiaryHungerPanel: false,
  showDiaryFiberPanel: false,
  showDiarySupplementsPanel: false,
  showDiaryRefeedPanel: false,
  showDiaryMealsTimelinePanel: false,
  showDiaryScoreRiskTrendPanel: false,
  showDiaryInsulinWavePanel: false,
  // Чип «Добавки» рисуется только при разрешённом трекинге, в кадре он есть.
  supplementsTrackingEnabled: true,
  plannedSupplements: ['vitamin-d'],
};

// Кадр «только чтение»: три приёма, съедено 1 289, обед 13:05 на 562 ккал из
// пяти продуктов («Курица, рис, салат · ещё 2»).
const READONLY_MEALS = [
  meal('nt-ro-1', 'Завтрак', '08:20', [food('Овсянка', 418, { protein100: 4, fat100: 3 })]),
  meal('nt-ro-2', 'Обед', '13:05', [
    food('Курица', 180, { protein100: 20, fat100: 4 }),
    food('Рис', 190, { protein100: 3, fat100: 1 }),
    food('Салат', 92, { protein100: 2, fat100: 3, fiber100: 4 }),
    food('Масло', 60, { protein100: 0, fat100: 11, carbs100: 0 }),
    food('Хлебцы', 40, { protein100: 7, fat100: 2 }),
  ]),
  meal('nt-ro-3', 'Перекус', '16:40', [food('Творог с орехами', 309, { protein100: 12, fat100: 6 })]),
];

const UNDO_MEALS = [
  meal('nt-u-1', 'Обед', '13:05', [food('Курица с рисом', 562, { protein100: 9, fat100: 4 })]),
  meal('nt-u-2', 'Перекус', '16:40', [food('Творог с орехами', 240, { protein100: 12, fat100: 6 })]),
  meal('nt-u-3', 'Ужин', '19:10', [food('Лосось с овощами', 487, { protein100: 8, fat100: 6 })]),
];

export const NUTRITION_TAB_VISUAL_CASES = Object.freeze([
  // Герой при переборе: 105 / 113 / 138 % бюджета 1 931.
  heroZone('nutrition-hero-zone-neutral', 'Питание · зона нейтральная', 2029),
  heroZone('nutrition-hero-zone-warn', 'Питание · зона предупреждения', 2190),
  heroZone('nutrition-hero-zone-red', 'Питание · зона красная', 2665),

  // Вкладка целиком в переборе — первый экран от шапки до итогов дня.
  base('nutrition-over-day', 'Питание · перебор', {
    captureSelector: '.tab-active-viewport',
    viewport: { width: 375, height: 640 },
    fixtureDay: day(DAY, OVER_MEALS),
  }),

  // Тот же кадр «перебор», блок «Итоги дня»: разрезанные дорожки калорий и
  // жиров — в кадре они ниже первого экрана вкладки.
  base('nutrition-over-totals', 'Питание · перебор', {
    // Снимок — блок «Итоги дня», кадр рисует его внутри целого экрана.
    frameTextFrom: 'Итоги дня',
    frameTextUntilWhy: 'снимок и кадр обрезаны до блока итогов (.tot) — выше него герой и окно приёмов со своими парами',
    canvasCrop: '.tot',
    captureSelector: '.nutrition-v4-totals',
    // Вечер: пищевое окно дня закрыто, ожидаемое к этому часу равно норме —
    // метки ожидаемого нет, как в кадре, и зоны считаются от целого дня.
    clock: clock(`${DAY}T21:40:00+03:00`),
    fixtureDay: day(DAY, OVER_MEALS),
  }),

  // Прошлый день: открывается стрелкой «назад» капсулы даты.
  base('nutrition-past-day', 'Питание · прошлый день', {
    captureSelector: '.tab-active-viewport',
    viewport: { width: 375, height: 640 },
    // Промежутки шире волны (08:05 · 12:50 · 17:30 · 21:40): волны не
    // пересекаются, и строка окна говорит «день закрыт», как в кадре.
    fixtureDay: day(PAST, PAST_MEALS),
    fixtureDays: [day(DAY, [])],
    uiSteps: [{ tap: '.date-picker-day-nav', nth: 0 }, { waitFor: '.nutrition-v4-hero' }],
  }),

  // Блок «Приёмы за день»: полосы волн и красный сегмент нахлёста.
  base('nutrition-meals-timeline', 'Питание · приёмы полосами', {
    frameTextFrom: 'Приёмы за день',
    frameTextUntilWhy: 'снимок и кадр обрезаны до блока «Приёмы за день» (.blk)',
    canvasCrop: '.blk',
    captureSelector: ".nutrition-v4-block[data-block='mealsTimeline']",
    clock: clock(`${DAY}T21:40:00+03:00`),
    fixtureDay: day(DAY, TIMELINE_MEALS),
  }),

  // Дневник приёмов: номера, пустой приём и строка серии.
  base('nutrition-diary-numbers', 'Питание · дневник с номерами', {
    captureSelector: '.tab-active-viewport',
    viewport: { width: 375, height: 600 },
    clock: clock(`${DAY}T21:40:00+03:00`),
    fixtureDay: day(DAY, DIARY_MEALS),
    uiSteps: [{ scroll: '.tab-active-viewport', top: 330 }],
    preserveScroll: true,
  }),

  // Лист правки приёма открывается тапом по строке дневника.
  base('nutrition-meal-sheet', 'Питание · лист правки приёма', {
    frameTextFrom: 'Обед · 13:05',
    frameTextUntilWhy: 'снимок и кадр обрезаны до листа приёма (.md) — экран под ним сверяется своими парами',
    canvasCrop: '.md',
    captureSelector: '.nutrition-v4-sheet',
    fixtureDay: day(DAY, SHEET_MEALS),
    uiSteps: [
      { tap: '.nutrition-v4-meal-row', nth: 1 },
      { waitFor: '.nutrition-v4-sheet__delete' },
    ],
  }),

  // Ряд чипов при выключенных блоках.
  base('nutrition-blocks-off', 'Питание · блоки выключены', {
    frameTextFrom: 'Что показывать',
    frameTextUntilWhy: 'снимок и кадр обрезаны до настроек блоков (.cfg)',
    canvasCrop: '.cfg',
    captureSelector: '.nutrition-v4-config',
    fixtureProfile: { ...NUTRITION_PROFILE, ...ALL_CHIPS_OFF },
    fixtureDay: day(DAY, SHEET_MEALS),
  }),

  // Только чтение: пробный период закончился, кнопки записи погашены.
  base('nutrition-readonly', 'Питание · только чтение', {
    captureSelector: '.tab-active-viewport',
    viewport: { width: 375, height: 600 },
    fixtureProfile: { ...NUTRITION_PROFILE, subscription_status: 'read_only' },
    fixtureDay: day(DAY, READONLY_MEALS),
    fixtureLsKeys: {
      'heys_demo-client-female_subscription_status': { status: 'read_only', ts: Date.parse(`${DAY}T15:10:00+03:00`) },
    },
  }),

  // Офлайн без данных: сети нет, дня на устройстве ещё нет — продукт показывает
  // карточку вместо содержимого. Прошлые дни в хранилище есть: карточка про них
  // и говорит.
  //
  // СНИМАЕТСЯ НЕ ДО КОНЦА. Условие карточки — холодный старт: сегодня + нет
  // сети + первичная синхронизация не прошла + дня нет локально
  // (heys_day_page_shell.js, offlineColdStart). Демо-режим без сети не
  // поднимается вовсе: вход уходит в ветку «нет сети» (heys_app_auth_init_v1.js)
  // и экран остаётся на знаке ожидания, поэтому сеть гасится шагом goOffline уже
  // на собранной вкладке — а к этому моменту первичная синхронизация прошла и
  // условие холодного старта недостижимо. Стенду нужен вход без демо-снимка
  // (локальный клиент с уже сохранёнными прошлыми днями) — это отдельный kind
  // в общем capture.mjs, за пределами этой зоны.
  base('nutrition-offline', 'Питание · офлайн без данных', {
    canvasCrop: '.offc',
    // Снимок — сам слой «нет связи», кадр рисует его поверх экрана.
    frameTextFrom: 'Данные за сегодня не загрузились',
    frameTextUntilWhy: 'снимок и кадр обрезаны до слоя офлайна (.offc) — экран под ним сверяется своими парами',
    captureSelector: '.offline-nodata-overlay',
    offline: true,
    fixtureDay: day(PAST, PAST_MEALS),
    uiSteps: [{ goOffline: true }, { waitFor: '.offline-nodata-overlay' }],
  }),

  // Вопрос о дате: «Добавить приём» на прошлом дне.
  base('nutrition-date-question', 'Питание · вопрос о дате', {
    frameTextFrom: 'На какой день записать',
    frameTextUntilWhy: 'снимок и кадр обрезаны до листа вопроса (.md)',
    canvasCrop: '.md',
    captureSelector: '.nutrition-v4-date-target-sheet',
    fixtureDay: day(PAST, PAST_MEALS.slice(0, 2)),
    fixtureDays: [day(DAY, OVER_MEALS.slice(0, 3))],
    uiSteps: [
      { tap: '.date-picker-day-nav', nth: 0 },
      { waitFor: '#nutrition-v4-cta' },
      { tap: '#nutrition-v4-cta' },
      { waitFor: '.nutrition-v4-date-target-sheet' },
    ],
  }),

  // Отмена удаления: приём удалён из листа правки, внизу бар отмены.
  base('nutrition-undo-delete', 'Питание · отмена удаления', {
    captureSelector: '.tab-active-viewport',
    viewport: { width: 375, height: 420 },
    fixtureDay: day(DAY, UNDO_MEALS),
    uiSteps: [
      { tap: '.nutrition-v4-meal-row', nth: 1 },
      { waitFor: '.nutrition-v4-sheet__delete' },
      { tap: '.nutrition-v4-sheet__delete' },
      { waitFor: '.heys-undo-bar' },
    ],
  }),
]);
