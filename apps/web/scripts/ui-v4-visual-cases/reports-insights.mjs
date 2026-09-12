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

const CANVAS_FILE = 'reports-insights.v4.dc.html';
// Кадры зоны — длинный телефон: «Инсайты» рисуют пять ярусов подряд. При окне
// 706 снимок обрывался после «Решений сегодня», и пара выглядела так, будто у
// продукта нет «Стоит внимания» и «Что заметили».
const VIEWPORT = { width: 375, height: 1420 };

// Кадр — целый телефон (шапка приложения, вкладка, нижняя навигация), стенд
// снимает корень оболочки приложения того же размера.
const SCREEN_CAPTURE = '#root';

function tabCase({ id, tab, label, oid, days, themeId = 'sand', uiStep = null, captureSelector = SCREEN_CAPTURE, rootSelector = null, extra = {} }) {
  return {
    id,
    zone: 'reports-insights',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-reports-insights-tab',
    tab,
    themeId,
    viewport: VIEWPORT,
    stubGamificationMerge: true,
    // Стартовая вкладка берётся из профиля клиента (heys_app_tab_state_v1):
    // ?defaultTab демо-режима до scoped-профиля не доходит.
    fixtureProfile: { defaultTab: tab },
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
];
