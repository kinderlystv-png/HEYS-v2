// Стенды зоны reports-insights: вкладки «Отчёты» и «Инсайты» открываются
// настоящими компонентами продукта (демо-режим + снимок хранилища), состояние
// кадра задаётся только данными дней в хранилище и часами стенда.
//
// Часы стенда общие — 28 августа 2026, 9:30 (UI_V4_VISUAL_CLOCK). Дни
// считаются от них назад: «18 дней данных из 30» = 18 подряд заполненных дней.

const FIXED_DAY = '2026-08-28';

// Продукты снимка (PRODUCTS в ui-v4-visual-fixture.mjs) — по id, чтобы приёмы
// считались тем же каталогом, что и остальные стенды.
// Питательность кладётся в саму позицию приёма: продукты снимка доезжают до
// страницы заготовками без нутриентов, и счёт дня по каталогу выходил нулевым.
// Отсюда весь ноль зоны — «Дней в норме 0 из 0», «Питание не ведётся»,
// «0 / 2 дней» на графике и вечный недобор в «Сделай сегодня».
const OATS = { id: 'visual-oats', name: 'Овсяная каша', kcal100: 102, protein100: 3.5, carbs100: 15.7, fat100: 3.2 };
const BERRIES = { id: 'visual-berries', name: 'Ягоды', kcal100: 46, protein100: 0.8, carbs100: 8.3, fat100: 0.4 };
const CHICKEN = { id: 'visual-chicken', name: 'Куриная грудка', kcal100: 165, protein100: 31, carbs100: 0, fat100: 3.6 };
const RICE = { id: 'visual-rice', name: 'Рис', kcal100: 128, protein100: 3.1, carbs100: 24.5, fat100: 2.1 };

function mealItem(product, grams) {
  return {
    id: `item-${product.id}`,
    product_id: product.id,
    productId: product.id,
    name: product.name,
    grams,
    kcal100: product.kcal100,
    protein100: product.protein100,
    carbs100: product.carbs100,
    fat100: product.fat100,
  };
}

function isoDaysAgo(offset) {
  const d = new Date(`${FIXED_DAY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

/** Полный день: три приёма (кадр «Ярус Питание»: 8:40 / 13:05 / 16:40), сон, вес, шаги, вода. */
function fullDay(offset, overrides = {}) {
  return {
    date: isoDaysAgo(offset),
    weightMorning: Math.round((64.2 + offset * 0.07) * 10) / 10,
    sleepStart: '23:30',
    sleepEnd: '07:30',
    sleepHours: 8,
    sleepQuality: 4,
    moodMorning: 4,
    wellbeing: 4,
    stress: 2,
    steps: 7200 + (offset % 4) * 600,
    waterMl: 1800,
    meals: [
      { id: `m-${offset}-1`, name: 'Завтрак', time: '08:40', items: [mealItem(OATS, 250), mealItem(BERRIES, 100), mealItem(CHICKEN, 60)] },
      { id: `m-${offset}-2`, name: 'Обед', time: '13:05', items: [mealItem(CHICKEN, 160), mealItem(RICE, 200)] },
      { id: `m-${offset}-3`, name: 'Перекус', time: '16:40', items: [mealItem(BERRIES, 150), mealItem(OATS, 120)] },
    ],
    trainings: [],
    ...overrides,
  };
}

/** Три дня новичка: сегодня — только два приёма, без веса и сна. */
function newUserDays() {
  return [
    fullDay(0, {
      weightMorning: 0,
      sleepStart: '',
      sleepEnd: '',
      sleepHours: 0,
      meals: [
        { id: 'm-0-1', name: 'Завтрак', time: '08:40', items: [mealItem(OATS, 250), mealItem(BERRIES, 100)] },
        { id: 'm-0-2', name: 'Обед', time: '13:05', items: [mealItem(CHICKEN, 160), mealItem(RICE, 200)] },
      ],
    }),
    fullDay(1),
    fullDay(2),
  ];
}

/** 18 дней: последние три — мало белка, две последние ночи — короткий сон. */
function richDays() {
  const days = [];
  for (let offset = 0; offset < 18; offset += 1) {
    const lowProtein = offset < 3;
    const shortSleep = offset < 2;
    days.push(fullDay(offset, {
      ...(lowProtein
        ? {
            meals: [
              { id: `m-${offset}-1`, name: 'Завтрак', time: '08:40', items: [mealItem(OATS, 250), mealItem(BERRIES, 100)] },
              { id: `m-${offset}-2`, name: 'Обед', time: '13:05', items: [mealItem(RICE, 220), mealItem(BERRIES, 80)] },
              { id: `m-${offset}-3`, name: 'Перекус', time: '16:40', items: [mealItem(BERRIES, 150)] },
            ],
          }
        : {}),
      ...(shortSleep ? { sleepStart: '01:10', sleepEnd: '06:40', sleepHours: 5.5, sleepQuality: 2 } : {}),
    }));
  }
  return days;
}

/** 18 спокойных дней: всё в норме, отклонений нет. */
function calmDays() {
  // Кадр «день без заданий» показывает пустое «Сделай сегодня», а задания
  // рождаются из предупреждений: при обычных порциях день недобирает около
  // восьмисот килокалорий, и движок всегда просит не пропускать приёмы.
  // Здесь дни съедены по норме — около 2 000.
  const fedMeals = (offset) => [
    { id: `m-${offset}-1`, name: 'Завтрак', time: '08:40', items: [mealItem(OATS, 400), mealItem(CHICKEN, 150)] },
    { id: `m-${offset}-2`, name: 'Обед', time: '13:05', items: [mealItem(CHICKEN, 250), mealItem(RICE, 400)] },
    { id: `m-${offset}-3`, name: 'Ужин', time: '18:40', items: [mealItem(OATS, 200), mealItem(BERRIES, 200), mealItem(CHICKEN, 100)] },
  ];
  return Array.from({ length: 18 }, (_, offset) => fullDay(offset, { meals: fedMeals(offset) }));
}

/** 18 дней с накопленным напряжением: короткий сон, низкое самочувствие, недобор. */
function riskDays() {
  const days = [];
  for (let offset = 0; offset < 18; offset += 1) {
    // Кадр «Инсайты · риск срыва» рисует карточку риска, а она выходит только
    // при уровне «высокий» — порог 60, движок считает по сегодняшнему дню и
    // двум неделям истории. Четырёх тяжёлых дней из восемнадцати на это не
    // хватало: напряжение должно копиться всю историю.
    const stressed = true;
    days.push(fullDay(offset, {
      ...(stressed
        ? {
            sleepStart: '01:30', sleepEnd: '06:20', sleepHours: 4.8, sleepQuality: 1,
            moodMorning: 2, wellbeing: 2, stress: 8,
            meals: [
              { id: `m-${offset}-1`, name: 'Завтрак', time: '10:40', items: [mealItem(OATS, 120)] },
              { id: `m-${offset}-2`, name: 'Обед', time: '15:05', items: [mealItem(RICE, 150)] },
            ],
          }
        : {}),
    }));
  }
  return days;
}

/** Три дня для «Отчёты · мало данных»: лента есть, взвешиваний три. */
function reportsFewDays() {
  return [fullDay(0), fullDay(1), fullDay(2)];
}

/** Девять дней без единого взвешивания — «Отчёты · нет веса». */
function reportsNoWeightDays() {
  return Array.from({ length: 9 }, (_, offset) => fullDay(offset, { weightMorning: 0 }));
}

/**
 * Тридцать дней — порог фенотипа. Кадр «Инсайты · метаболизм» рисует пять
 * осей, а движок считает их строго на тридцати днях: на восемнадцати ярус
 * показывает «откроется через N дней», а не фенотип.
 */
function phenotypeDays() {
  return Array.from({ length: 30 }, (_, offset) => fullDay(offset));
}

/**
 * Девять дней для кадра «Неделя к неделе · одна закрытая»: закрылась одна
 * полная неделя и одна неполная — ровно две строки таблицы.
 */
function nineDays() {
  return Array.from({ length: 9 }, (_, offset) => fullDay(offset));
}

/**
 * Тридцать дней, где вода не дотягивает до нормы ни разу. Кадр «Отчёты ·
 * нулевая строка матрицы» показывает такую строку заштрихованной полосой и
 * средней долей вместо Δ; вес профиля берём из кадра (91,5 кг → норма
 * 2 745 мл), иначе число в строке «Норма воды» будет не тем, что нарисовано.
 */
function zeroWaterDays() {
  return Array.from({ length: 30 }, (_, offset) => fullDay(offset, {
    waterMl: 2480 + (offset % 5) * 30,
    steps: 4200 + (offset % 3) * 200,
  }));
}

/**
 * Вечер: последний приём давно, до сна меньше трёх часов, норма дня закрыта.
 * Кадр «Ярус Питание · после последнего приёма» — состояние «день закрыт»,
 * и оно наступает только по часам, а не по данным.
 */
function closedEveningDays() {
  const eveningMeals = (offset) => [
    { id: `m-${offset}-1`, name: 'Завтрак', time: '08:10', items: [mealItem(OATS, 380), mealItem(CHICKEN, 120)] },
    { id: `m-${offset}-2`, name: 'Обед', time: '13:20', items: [mealItem(CHICKEN, 240), mealItem(RICE, 380)] },
    { id: `m-${offset}-3`, name: 'Перекус', time: '16:30', items: [mealItem(BERRIES, 200), mealItem(OATS, 150)] },
    { id: `m-${offset}-4`, name: 'Ужин', time: '19:40', items: [mealItem(CHICKEN, 200), mealItem(RICE, 200), mealItem(BERRIES, 150)] },
  ];
  return Array.from({ length: 18 }, (_, offset) => fullDay(offset, { meals: eveningMeals(offset) }));
}

/** Приёмы вчерашнего дня на 45 % нормы — кадры «День под порогом» и «Мало калорий · подтверждение». */
function belowThresholdMeals() {
  return [
    { id: 'm-low-1', name: 'Завтрак', time: '09:10', items: [mealItem(OATS, 200)] },
    { id: 'm-low-2', name: 'Обед', time: '14:30', items: [mealItem(RICE, 160)] },
    { id: 'm-low-3', name: 'Перекус', time: '18:10', items: [mealItem(BERRIES, 180)] },
  ];
}

/** Восемнадцать дней, где вчерашний — ниже порога 70 % и без ответа. */
function belowThresholdDays() {
  const days = richDays();
  days[1] = fullDay(1, { meals: belowThresholdMeals() });
  return days;
}

/** Восемнадцать дней, где вчерашний — вовсе без записей еды. */
function emptyYesterdayDays() {
  const days = richDays();
  days[1] = fullDay(1, { meals: [] });
  return days;
}

/**
 * Вчерашний день без приёмов, но с сохранённым итогом дня: кадр «Мало
 * калорий · рекомендуем очистить» рисует ровно это — «приёмов нет» рядом с
 * числом съеденного.
 */
function savedOnlyYesterdayDays() {
  const days = richDays();
  days[1] = fullDay(1, { meals: [], savedEatenKcal: 210 });
  return days;
}

const CANVAS_FILE = 'reports-insights.v4.dc.html';
// Кадры зоны — длинный телефон: «Инсайты» рисуют пять ярусов подряд. При окне
// 706 снимок обрывался после «Решений сегодня», и пара выглядела так, будто у
// продукта нет «Стоит внимания» и «Что заметили».
const VIEWPORT = { width: 375, height: 1420 };

// Кадр — целый телефон (шапка приложения, вкладка, нижняя навигация), стенд
// снимает корень оболочки приложения того же размера.
const SCREEN_CAPTURE = '#root';

function tabCase({ id, tab, label, oid, days, themeId = 'sand', uiStep = null, captureSelector = SCREEN_CAPTURE, rootSelector = null, viewport = VIEWPORT, profile = null, extra = {} }) {
  return {
    id,
    zone: 'reports-insights',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-reports-insights-tab',
    tab,
    themeId,
    viewport,
    stubGamificationMerge: true,
    // Стартовая вкладка берётся из профиля клиента (heys_app_tab_state_v1):
    // ?defaultTab демо-режима до scoped-профиля не доходит.
    fixtureProfile: { defaultTab: tab, ...(profile || {}) },
    fixtureDays: days,
    uiStep,
    rootSelector: rootSelector || (tab === 'insights' ? '.insights-tab.insights-v4' : '.reports-v4-meta'),
    captureSelector,
    canvasFrame: { file: CANVAS_FILE, label, oid, palette: themeId },
    ...extra,
  };
}

export const REPORTS_INSIGHTS_VISUAL_CASES = [
  tabCase({ id: 'reports-insights-main-sand', tab: 'insights', label: 'Инсайты', oid: 'RI-INS1', days: richDays() }),
  tabCase({ id: 'reports-insights-detail-sand', tab: 'insights', label: 'Инсайты · подробно', oid: 'RI-INS2', days: richDays(), uiStep: 'detail' }),
  // Панель «Ещё N» блока наблюдений: та же поверхность, что у «Стоит
  // внимания», шапка называет блок и считает его сигналы.
  tabCase({ id: 'reports-patterns-more-sand', tab: 'insights', label: 'Стоит внимания · панель Ещё', oid: 'RI-MORE', days: richDays(), uiStep: 'patterns-more' }),
  tabCase({ id: 'reports-few-days-sand', tab: 'stats', label: 'Отчёты · мало данных', oid: 'RI-REP1', days: reportsFewDays() }),
  tabCase({ id: 'reports-insights-new-user-sand', tab: 'insights', label: 'Инсайты · новый пользователь', oid: 'RI-INS3', days: newUserDays() }),
  tabCase({ id: 'reports-insights-no-tasks-sand', tab: 'insights', label: 'Инсайты · день без заданий', oid: 'RI-INS4', days: calmDays() }),
  tabCase({ id: 'reports-insights-relapse-risk-sand', tab: 'insights', label: 'Инсайты · риск срыва', oid: 'RI-INS5', days: riskDays() }),
  tabCase({ id: 'reports-no-weight-sand', tab: 'stats', label: 'Отчёты · нет веса', oid: 'RI-REP2', days: reportsNoWeightDays() }),

  // Ярус «Питание» кадр рисует без шапки телефона — снимаем сам ярус.
  tabCase({
    id: 'reports-nutrition-tier-sand', tab: 'insights', label: 'Инсайты · ярус Питание', oid: 'RI-NUT1',
    days: richDays(), captureSelector: '.insights-v4-nutrition',
    // Кадр снят вечером: «до сна 3,2 ч» при отбое 23:30 — это 20:20. На часах
    // стенда 9:30 планер молчит (обед и перекус дня ещё впереди), и ярус
    // начинался сразу с «Ритма приёмов».
    extra: {
      uiScroll: '.insights-v4-nutrition',
      uiWait: '.meal-rec-card--v4, .meal-rec-done, .meal-rec-card__goal-hero',
      clock: { iso: '2026-08-28T20:20:00+03:00', day: '2026-08-28', epochMs: Date.parse('2026-08-28T20:20:00+03:00') },
    },
  }),
  // «День закрыт» наступает по часам: до сна меньше трёх часов.
  tabCase({
    id: 'reports-nutrition-closed-sand', tab: 'insights', label: 'Ярус Питание · после последнего приёма', oid: 'RI-NUT2',
    days: closedEveningDays(), viewport: { width: 375, height: 706 },
    extra: {
      uiScroll: '.insights-v4-nutrition',
      uiWait: '.meal-rec-done, .meal-rec-card--v4, .meal-rec-card__goal-hero',
      clock: { iso: '2026-08-28T21:40:00+03:00', day: '2026-08-28', epochMs: Date.parse('2026-08-28T21:40:00+03:00') },
    },
  }),
  tabCase({
    id: 'reports-debt-sheet-sand', tab: 'insights', label: 'Раскрывашка · Как считается долг', oid: 'RI-SH1',
    days: richDays(), uiStep: 'debt-sheet', viewport: { width: 375, height: 706 },
  }),
  tabCase({
    id: 'reports-howcalc-sheet-sand', tab: 'insights', label: 'Раскрывашка · Как посчитано', oid: 'RI-SH2',
    days: richDays(), uiStep: 'howcalc-sheet', viewport: { width: 375, height: 706 },
    extra: { uiWait: '.meal-rec-card--v4', clock: { iso: '2026-08-28T20:20:00+03:00', day: '2026-08-28', epochMs: Date.parse('2026-08-28T20:20:00+03:00') } },
  }),
  // Фенотип считается строго на тридцати днях — восемнадцати мало.
  tabCase({
    id: 'reports-metabolism-sand', tab: 'insights', label: 'Инсайты · метаболизм', oid: 'RI-MET1',
    days: phenotypeDays(), uiStep: 'detail-metabolism', viewport: { width: 375, height: 706 },
    extra: { uiScroll: '.insights-v4-pheno' },
  }),
  tabCase({
    id: 'reports-thresholds-sand', tab: 'insights', label: 'Инсайты · персональные пороги', oid: 'RI-THR1',
    days: richDays(), uiStep: 'detail-thresholds', viewport: { width: 375, height: 847 },
    extra: { uiScroll: '.insights-v4-thresh' },
  }),
  tabCase({
    id: 'reports-insights-fail-sand', tab: 'insights', label: 'Инсайты · не посчиталось', oid: 'RI-FAIL',
    days: richDays(), uiStep: 'render-fail', viewport: { width: 375, height: 706 },
  }),
  tabCase({
    id: 'reports-attention-voice-sand', tab: 'insights', label: 'Стоит внимания · голос куратора', oid: 'RI-ATT1',
    days: richDays(), viewport: { width: 375, height: 845 },
    extra: { uiScroll: '.insights-v4-attention' },
  }),
  // Норма воды считается от веса профиля: 91,5 кг × 30 мл = 2 745 мл кадра.
  tabCase({
    id: 'reports-matrix-zero-sand', tab: 'stats', label: 'Отчёты · нулевая строка матрицы', oid: 'RI-MTX0',
    days: zeroWaterDays(), viewport: { width: 375, height: 706 },
    profile: { weight: 91.5 },
    extra: { uiPeriod: 30, uiScroll: '.reports-v4-tier--discipline' },
  }),
  tabCase({
    id: 'reports-weeks-one-sand', tab: 'stats', label: 'Неделя к неделе · одна закрытая', oid: 'RI-WK1',
    days: nineDays(), viewport: { width: 375, height: 706 },
    extra: { uiScroll: '.reports-v4-tier--weeks' },
  }),
  tabCase({
    id: 'reports-day-below-sand', tab: 'stats', label: 'День под порогом · выбор', oid: 'RI-DAY1',
    days: belowThresholdDays(), viewport: { width: 375, height: 706 },
    extra: { uiDate: '2026-08-27', uiScroll: '.low-cal-banner' },
  }),
  tabCase({
    id: 'reports-day-empty-sand', tab: 'stats', label: 'День пустой · выбор', oid: 'RI-DAY2',
    days: emptyYesterdayDays(), viewport: { width: 375, height: 706 },
    extra: { uiDate: '2026-08-27', uiScroll: '.low-cal-banner' },
  }),
  tabCase({
    id: 'reports-lowcal-confirm-sand', tab: 'stats', label: 'Мало калорий · подтверждение', oid: 'RI-LOW1',
    days: belowThresholdDays(), viewport: { width: 375, height: 706 },
    extra: { uiDate: '2026-08-27', uiScroll: '.kcal-realdata-card' },
  }),
  tabCase({
    id: 'reports-lowcal-clear-sand', tab: 'stats', label: 'Мало калорий · рекомендуем очистить', oid: 'RI-LOW2',
    days: savedOnlyYesterdayDays(), viewport: { width: 375, height: 706 },
    extra: { uiDate: '2026-08-27', uiScroll: '.kcal-realdata-card' },
  }),
  tabCase({
    id: 'reports-periods-sheet-sand', tab: 'stats', label: 'Лист периодов', oid: 'RI-PER1',
    days: richDays(), uiStep: 'periods-sheet', viewport: { width: 375, height: 783 },
  }),
];
