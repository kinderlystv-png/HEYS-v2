// Стенды зоны checkin-morning: настоящий утренний чек-ин (StepModal с планом
// продукта) в состоянии каждого кадра. Состояние задаётся только данными дней и
// профиля, дальше стенд проходит шаги теми же кнопками, что и человек.
//
// Часы стенда — дата самого кадра: разбор «вчера» и пачка считают дни от
// «сегодня», а серия и «−0,8 кг за неделю» — от календаря.

const CLIENT = 'demo-client-female';

function clock(iso) {
  return Object.freeze({ iso, day: iso.slice(0, 10), epochMs: Date.parse(iso) });
}

// Калорийность продуктов снимка (PRODUCTS в ui-v4-visual-fixture.mjs). Кладём
// её прямо в позицию приёма: счёт серии берёт kcal100 у продукта каталога, а
// при промахе — у самой позиции, и стенд не должен зависеть от того, успел ли
// каталог доехать до страницы.
const KCAL100 = {
  'visual-oats': 102,
  'visual-berries': 46,
  'visual-chicken': 165,
  'visual-rice': 128,
};

/** Приём из продуктов фикстуры (см. PRODUCTS в ui-v4-visual-fixture.mjs). */
function meal(id, name, time, items) {
  return {
    id,
    name,
    time,
    items: items.map(([productId, grams]) => ({
      id: `${id}-${productId}`,
      product_id: productId,
      productId,
      name: productId,
      grams,
      kcal100: KCAL100[productId],
    })),
  };
}

// ≈1 708 ккал: овсянка 400 (408) + грудка 400 (660) + рис 500 (640). День
// засчитывается в серию, когда съеденное попадает в 75–110 % нормы дня; норма
// этого профиля ≈1 920, поэтому дни серии должны быть именно такими сытными.
const FULL_DAY_MEALS = [
  meal('m-b', 'Завтрак', '08:30', [['visual-oats', 400]]),
  meal('m-l', 'Обед', '13:20', [['visual-chicken', 400], ['visual-rice', 500]]),
];
// ≈640 ккал одним приёмом: овсянка 300 (306) + ягоды 200 (92) + рис 190 (243).
const ONE_MEAL_640 = (name, time) => [
  meal('m-one', name, time, [['visual-oats', 300], ['visual-berries', 200], ['visual-rice', 190]]),
];

function addDays(day, delta) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Серия из N закрытых дней до «сегодня», с шагами и опциональными полями. */
function streakDays(today, count, extra = () => ({})) {
  const days = {};
  for (let i = 1; i <= count; i += 1) {
    const date = addDays(today, -i);
    days[date] = {
      meals: FULL_DAY_MEALS,
      steps: 10000,
      stepsUpdatedAt: 1,
      ...extra(date, i),
    };
  }
  return days;
}

const PROFILE_ALEXANDRA = {
  name: 'Александра',
  firstName: 'Александра',
  displayName: 'Александра',
  weight: 74.2,
  sleepHours: 7,
  stepsGoal: 10000,
  cycleTrackingEnabled: false,
  supplementsTrackingEnabled: true,
  measurementsTrackingEnabled: true,
  plannedSupplements: ['vitD', 'magnesium'],
};

const SUPPLEMENT_SETTINGS = {
  vitD: { dose: 5000, unit: 'МЕ', timing: 'morning' },
  magnesium: { dose: 400, unit: 'мг', timing: 'evening' },
  omega3: { dose: 1000, unit: 'мг', timing: 'withFood' },
};

const VIEWPORT = { width: 375, height: 812 };
const CANVAS_FILE = 'checkin-morning.v4.dc.html';

function checkinCase({ id, label, oid, at, profile, days, today: todayExtra, ls, yesterdayVerify, walk, expectStep, notes, tab = 'diary', themeId = 'sand' }) {
  const today = at.slice(0, 10);
  return {
    id,
    zone: 'checkin-morning',
    status: 'automated',
    gate: 'diagnostic',
    kind: 'demo-checkin-flow',
    tab,
    themeId,
    clock: clock(at),
    stubGamificationMerge: true,
    fixtureProfile: { ...PROFILE_ALEXANDRA, ...(profile || {}) },
    // Сегодняшний день пустой: чек-ин заполняет его сам по ходу шагов.
    // Кадр иногда рисует уже отвеченный пункт (например, время кофе) — такие
    // ответы кейс докладывает в сегодняшний день полем `today`.
    fixtureDay: { date: today, meals: [], trainings: [], ...(todayExtra || {}) },
    rootSelector: `[data-heys-step-modal][data-heys-step-id="${expectStep}"]`,
    // Кадр рисует телефон целиком: день под слоем, затемнение и карточку шага
    // поверх. Поэтому снимаем корень приложения, а не одну карточку.
    captureSelector: 'body',
    viewport: VIEWPORT,
    frameLabel: label,
    // Кадр — телефон целиком: день под слоем, затемнение и карточка шага.
    // Поэтому captureSelector не задаём: снимок берётся по всему окну 375×812.
    canvasFrame: { file: CANVAS_FILE, label, oid, palette: themeId },
    checkin: {
      today,
      days: days || {},
      ls: ls || {},
      supplementSettings: SUPPLEMENT_SETTINGS,
      yesterdayVerify: !!yesterdayVerify,
      walk: walk || [],
      expectStep,
      probe: `(() => { const lsGet = HEYS.utils.lsGet; const prof = lsGet('heys_profile', {}); const all = HEYS.products.getAll(); const day = lsGet('heys_dayv2_2026-08-15', null); let kcal = 0; (day && day.meals || []).forEach((m) => (m.items || []).forEach((it) => { kcal += (+it.kcal100 || 0) * (+it.grams || 0) / 100; })); return { products: all.length, sample: all[0] || null, kcal15: Math.round(kcal), norm15: HEYS.dayNorm.kcal(day || {}, prof, {}), streak: HEYS.utils?.safeGetStreak?.(), metrics: HEYS.dayCalendarMetrics?.getCurrentStreak?.() }; })()`,
    },
    ...(notes ? { notes } : {}),
  };
}

// ── Вес · сон · как вы сегодня · шаги ─────────────────────────────────────
// Воскресенье 16 августа, серия 5 дней, взвешивания 13–15 августа.
const AT_WEIGHT = '2026-08-16T08:10:00+03:00';
const WEIGHT_DAYS = {
  ...streakDays('2026-08-16', 5, (date, i) => {
    const weights = { 1: 73.4, 2: 73.5, 3: 73.9 };
    return {
      ...(weights[i] ? { weightMorning: weights[i], weightMorningSource: 'measured' } : {}),
      // Сон и самочувствие вчера — стартовые значения шагов «Сон» и «Как вы сегодня».
      ...(i === 1 ? {
        sleepStart: '23:40', sleepEnd: '06:10', sleepHours: 6.5, sleepQuality: 4,
        moodMorning: 8, wellbeingMorning: 7, stressMorning: 4,
      } : {}),
    };
  }),
  // Неделю назад — 74,2: даёт «−0,8 кг за неделю». Еды в этих двух днях нет
  // намеренно: серия обрывается на первом дне без приёмов, и кадр «Чек-ин ·
  // вес» получает ровно свои пять дней подряд, а не семь.
  '2026-08-09': { meals: [], weightMorning: 74.2, weightMorningSource: 'measured', steps: 10000, stepsUpdatedAt: 1 },
  '2026-08-10': { meals: [], steps: 10000, stepsUpdatedAt: 1 },
};


// ── Остальное · замеры · записано ─────────────────────────────────────────
// Тот же день, что и у веса: 16 августа. К серии добавлены прохладный душ
// четыре дня подряд (кадр называет серию), замеры девятидневной давности и
// курс добавок из профиля.
const REST_DAYS = {
  ...WEIGHT_DAYS,
  // Душ 12–15 августа — «4 дня подряд» на шаге «Остальное».
  ...Object.fromEntries(['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15'].map((date) => [
    date,
    { ...WEIGHT_DAYS[date], coldExposure: { type: 'coldShower', time: '07:20', answeredAt: 1 } },
  ])),
  // Замеры девять дней назад — строка «Прошло 9 дней с прошлых» и значения
  // кадра в шаге «Замеры».
  '2026-08-07': {
    meals: FULL_DAY_MEALS,
    steps: 10000,
    stepsUpdatedAt: 1,
    measurements: { waist: 78, hips: 99.5, thigh: 56, biceps: 28.5, measuredAt: Date.parse('2026-08-07T08:00:00+03:00') },
  },
};

// Утренняя рутина «2 дня подряд» — счётчик живёт в статистике игры.
const REST_LS = {
  heys_game: { morningActivationStreak: { current: 2, best: 4, lastDate: '2026-08-15' } },
};

// Вчерашний день неполон по еде: один приём на 640 ккал в 09:40 при норме дня
// около 1 900 — ровно та развилка, которую рисует кадр.
const YESTERDAY_DAYS = {
  ...streakDays('2026-08-16', 5, (date, i) => (i === 1
    ? { meals: ONE_MEAL_640('Завтрак', '09:40') }
    : {})),
};

// Кофе на шаге «Остальное» кадр рисует уже отвеченным: средняя пилюля несёт
// само время «14:30» и залита акцентом (строка контракта «подпись средней
// пилюли»: до ответа — «своё время», после — время).
const TODAY_COFFEE = { lastCoffee: { choice: 'exact', time: '14:30', answeredAt: 1 } };

const NEXT = { next: true };

export const CHECKIN_MORNING_VISUAL_CASES = [
  checkinCase({
    id: 'checkin-weight-streak-sand',
    label: 'Чек-ин · вес',
    oid: 'CM-W1',
    at: AT_WEIGHT,
    days: WEIGHT_DAYS,
    expectStep: 'weight',
  }),
  checkinCase({
    id: 'checkin-weight-estimated-sand',
    label: 'Чек-ин · расчётный вес',
    oid: 'CM-W2',
    at: AT_WEIGHT,
    days: WEIGHT_DAYS,
    walk: [{ secondary: true }],
    expectStep: 'weight',
  }),
  checkinCase({
    id: 'checkin-weight-estimated-no-history-sand',
    label: 'Чек-ин · расчётный вес без истории',
    oid: 'CM-W3',
    at: '2026-08-21T08:10:00+03:00',
    days: {},
    walk: [{ secondary: true }],
    expectStep: 'weight',
  }),
  checkinCase({
    id: 'checkin-sleep-sand',
    label: 'Чек-ин · сон',
    oid: 'CM-S1',
    at: AT_WEIGHT,
    days: WEIGHT_DAYS,
    walk: [NEXT],
    expectStep: 'sleep',
  }),
  checkinCase({
    id: 'checkin-mood-sand',
    label: 'Чек-ин · как вы сегодня',
    oid: 'CM-M1',
    at: AT_WEIGHT,
    days: WEIGHT_DAYS,
    walk: [NEXT, NEXT],
    expectStep: 'morning_mood',
  }),
  checkinCase({
    id: 'checkin-steps-goal-sand',
    label: 'Чек-ин · цель по шагам',
    oid: 'CM-G1',
    at: AT_WEIGHT,
    days: WEIGHT_DAYS,
    profile: { allowManualRefeed: true },
    walk: [NEXT, NEXT, NEXT],
    expectStep: 'stepsGoal',
  }),

  checkinCase({
    id: 'checkin-rest-sand',
    label: 'Чек-ин · остальное',
    oid: 'CM-R1',
    at: AT_WEIGHT,
    days: REST_DAYS,
    // Кадр рисует уже выбранное время кофе — «14:30» заливкой акцента.
    today: TODAY_COFFEE,
    ls: REST_LS,
    walk: [NEXT, NEXT, NEXT, NEXT],
    expectStep: 'morningRest',
  }),
  checkinCase({
    id: 'checkin-measurements-sand',
    label: 'Чек-ин · замеры',
    oid: 'CM-R2',
    at: AT_WEIGHT,
    days: REST_DAYS,
    today: TODAY_COFFEE,
    ls: REST_LS,
    // Строку «Замеры» открывает человек — стенд нажимает ту же строку.
    walk: [NEXT, NEXT, NEXT, NEXT, { selector: '.mc-rest-row' }],
    expectStep: 'morningRest',
  }),
  checkinCase({
    id: 'checkin-recorded-sand',
    label: 'Чек-ин · записано',
    oid: 'CM-D1',
    at: AT_WEIGHT,
    days: REST_DAYS,
    ls: REST_LS,
    walk: [NEXT, NEXT, NEXT, NEXT, NEXT],
    expectStep: 'checkinRecorded',
  }),
  checkinCase({
    id: 'checkin-yesterday-sand',
    label: 'Чек-ин · вчерашний день',
    oid: 'CM-Y1',
    at: AT_WEIGHT,
    days: YESTERDAY_DAYS,
    yesterdayVerify: true,
    expectStep: 'yesterdayVerify',
  }),
];
