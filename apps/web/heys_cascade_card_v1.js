// heys_cascade_card_v1.js — Cascade Card — «Ваш позитивный каскад»
// Standalone компонент. Визуализация цепочки здоровых решений в реальном времени.
// v2.2.0 | 2026-02-19 — Soft chain degradation + score-driven states
// Фильтр в консоли: [HEYS.cascade]
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // ─────────────────────────────────────────────────────
  // КОНСТАНТЫ
  // ─────────────────────────────────────────────────────

  const STATES = {
    EMPTY: 'EMPTY',
    BUILDING: 'BUILDING',
    GROWING: 'GROWING',
    STRONG: 'STRONG',
    BROKEN: 'BROKEN',
    RECOVERY: 'RECOVERY'
  };

  const STATE_CONFIG = {
    EMPTY: { icon: '🌅', color: '#94a3b8', label: 'Начни день' },
    BUILDING: { icon: '🔗', color: '#3b82f6', label: 'Начало' },
    GROWING: { icon: '⚡', color: '#22c55e', label: 'Каскад растёт' },
    STRONG: { icon: '🔥', color: '#eab308', label: 'Мощный день' },
    BROKEN: { icon: '💪', color: '#f59e0b', label: 'Пауза' },
    RECOVERY: { icon: '🌱', color: '#0ea5e9', label: 'Возвращение' }
  };

  const MESSAGES = {
    BUILDING: [
      { short: 'Хорошее начало. Первый шаг уже сделан.' },
      { short: 'Начало положено — проще всего продолжить, когда уже начал.' }
    ],
    GROWING: [
      { short: 'Три решения подряд — ты набираешь ход.' },
      { short: 'Хороший ритм. Следующий шаг даётся легче.' },
      { short: 'Когда всё складывается, правильный выбор становится проще.' }
    ],
    STRONG: [
      { short: 'Мощный день. Когда столько сделано — остановиться сложно.' },
      { short: 'Сегодня всё работает. Такие дни строят привычки.' },
      { short: 'Пять+ решений — это уже система. Тебе проще делать правильный выбор.' }
    ],
    BROKEN: [
      { short: 'Один шаг в сторону — не конец пути. Следующее решение уже может быть хорошим.' },
      { short: 'Не всё или ничего. Даже 70% хороших решений — отличный день.' },
      { short: 'Цепочка прервалась? Начни новую. Каждая цепочка из 2+ звеньев работает.' }
    ],
    RECOVERY: [
      { short: 'Новая цепочка начинается. Это важнее, чем быть идеальным.' },
      { short: 'Ты вернулся в ритм. Первый шаг после паузы — самый важный.' },
      { short: 'После перерыва каждое решение имеет значение. Ты уже на пути.' }
    ],
    ANTI_LICENSING: [
      { short: 'Тренировка — сама по себе победа. Не «награждай» себя едой.' },
      { short: 'После нагрузки организм лучше всего усвоит белок и овощи.' },
      { short: 'Классная тренировка! Выбери качество, а не количество.' }
    ]
  };

  const EVENT_ICONS = {
    meal: '🥗',
    training: '💪',
    household: '🏠',
    sleep: '😴',
    checkin: '⚖️',
    measurements: '📏',
    steps: '🚶',
    supplements: '💊',
    insulin: '⚡'
  };

  // ─────────────────────────────────────────────────────
  // СИСТЕМА СКОРИНГА v2.1.0 — Continuous Scientific Scoring
  // 10 факторов с непрерывными функциями + 3 метасистемы.
  // Personalized baselines (14-day median), confidence layer,
  // day-type awareness, cross-factor synergies.
  // Хороший день: meals(3.0) + training(2.5) + sleep(2.5) + steps(1.0) + synergies(0.9) ≈ 9.9
  // Отличный: meals(4.5) + training(3.0) + sleep(3.0) + steps(1.3) + synergies(1.3) ≈ 13.1
  // ─────────────────────────────────────────────────────

  // [LEGACY FALLBACK] — v2.0.0 step-function weights, used only in meal quality fallback
  const EVENT_WEIGHTS = {
    // Еда: вес через getMealQualityScore (0–100)
    meal_positive: 1.0,   // Фолбэк при недоступном getMealQualityScore
    meal_negative: -1.0,  // Жёсткое нарушение
    // Бытовая активность (householdMin)
    household_high: 1.0,  // ≥ 60 мин
    household_mid: 0.5,   // 30-59 мин
    household_low: 0.2,   // 10-29 мин
    // Тренировка (по длительности)
    training_60plus: 2.5, // ≥ 60 мин
    training_45: 2.0,     // 45-59 мин
    training_30: 1.5,     // 30-44 мин
    training_15: 1.0,     // 15-29 мин
    training_short: 0.5,  // 1-14 мин
    // Сон (время отбоя)
    sleep_onset_good: 1.0,   // ≤ 22:00
    sleep_onset_ok: 0.5,     // 22:01-23:00
    sleep_onset_neutral: 0.0, // 23:01-00:00
    sleep_onset_bad: -1.0,   // 00:01-01:00
    sleep_onset_worse: -1.5, // 01:01-02:00
    sleep_onset_worst: -2.0, // > 02:00
    // Сон (длительность)
    sleep_dur_ideal: 1.0,  // 7.0-8.5 ч
    sleep_dur_ok: 0.3,     // 6.0-6.9 / 8.6-9.5 ч
    sleep_dur_low: -0.5,   // 5.0-5.9 ч
    sleep_dur_over: -0.3,  // 9.6-10.5 ч
    sleep_dur_very_low: -1.5, // < 5.0 ч
    sleep_dur_too_long: -0.5, // > 10.5 ч
    // Чекин
    checkin: 0.5,
    // Измерения
    measurements_today: 1.0,
    measurements_old: -0.1,       // 8-14 дней назад
    measurements_very_old: -0.3,  // > 14 дней назад
    // Шаги
    steps_great: 1.0,   // ≥ 120%
    steps_full: 0.7,    // 100-119%
    steps_partial: 0.3, // 70-99%
    steps_half: 0.0,    // 50-69%
    steps_low: -0.3,    // < 50% (не 0)
    // Витамины/добавки
    supplements_all: 0.5,
    supplements_half: 0.2,
    supplements_poor: -0.2,
    // Инсулиновые волны
    insulin_gap_great: 1.0,   // avgGap ≥ 240 мин
    insulin_gap_good: 0.5,    // 180-239 мин
    insulin_gap_ok: 0.2,      // 120-179 мин
    insulin_night_long: 0.5,  // ночной пост ≥ 14 ч
    insulin_night_mid: 0.3,   // 12-13 ч
    insulin_night_short: 0.1, // 10-11 ч
    insulin_overlap_high: -0.5,
    insulin_overlap_med: -0.3,
    insulin_overlap_low: -0.1
  };

  // ─────────────────────────────────────────────────────
  // v2.1.0 SCORING CONSTANTS
  // ─────────────────────────────────────────────────────

  const INTENSITY_MULTIPLIERS = {
    hiit: 1.8, strength: 1.5, cardio: 1.2,
    yoga: 0.8, stretching: 0.6, walk: 0.5
  };

  const CIRCADIAN_MEAL_MODIFIERS = [
    { start: 360, end: 600, mult: 1.3 },    // 06:00–10:00 breakfast
    { start: 600, end: 840, mult: 1.0 },    // 10:00–14:00 lunch
    { start: 840, end: 1080, mult: 0.9 },   // 14:00–18:00 snack
    { start: 1080, end: 1260, mult: 0.85 }, // 18:00–21:00 dinner
    { start: 1260, end: 1380, mult: 0.7 }   // 21:00–23:00 late dinner
  ];

  const POPULATION_DEFAULTS = {
    householdMin: 30,
    sleepOnsetMins: 1380, // 23:00
    sleepHours: 7.5,
    steps: 7000,
    weeklyTrainingLoad: 200
  };

  const SCORE_THRESHOLDS = {
    STRONG: 8.0,    // Мощный день
    GROWING: 4.5,   // Каскад растёт
    BUILDING: 1.5   // Начало
  };

  const MOMENTUM_TARGET = 12.0; // score при 100% прогресс-бара

  // v2.2.0: Soft chain — penalty tiers by event severity
  // Minor (weight ≥ -0.5): -1 link, Medium (-1.5 ≤ w < -0.5): -2 links, Severe (w < -1.5): -3 links
  const CHAIN_PENALTY = { MINOR: 1, MEDIUM: 2, SEVERE: 3 };
  const CHAIN_PENALTY_THRESHOLDS = { MEDIUM: -0.5, SEVERE: -1.5 };

  function getChainPenalty(weight) {
    if (weight < CHAIN_PENALTY_THRESHOLDS.SEVERE) return CHAIN_PENALTY.SEVERE;
    if (weight < CHAIN_PENALTY_THRESHOLDS.MEDIUM) return CHAIN_PENALTY.MEDIUM;
    return CHAIN_PENALTY.MINOR;
  }

  // ─────────────────────────────────────────────────────
  // УТИЛИТЫ
  // ─────────────────────────────────────────────────────

  function parseTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return null;
    return parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }

  function formatTimeShort(timeStr) {
    if (!timeStr) return '—';
    const parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return '—';
    return `${parts[1].padStart(2, '0')}:${parts[2]}`;
  }

  function pickMessage(pool, poolKey) {
    if (!pool || !pool.length) return { short: '' };
    const hour = new Date().getHours();
    const idx = hour % pool.length;
    const msg = pool[idx];
    console.info('[HEYS.cascade] 💬 Message selected:', {
      pool: poolKey || 'UNKNOWN',
      index: idx,
      poolSize: pool.length,
      message: msg.short
    });
    return msg;
  }

  function isWithinHours(timeStr, hours) {
    const mins = parseTime(timeStr);
    if (mins === null) return false;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const diff = nowMins - mins;
    return diff >= 0 && diff <= hours * 60;
  }

  function getMealLabel(meal, index) {
    const time = parseTime(meal && meal.time);
    if (time !== null) {
      if (time < 600) return 'Ранний приём';
      if (time < 660) return 'Завтрак';
      if (time < 720) return 'Поздний завтрак';
      if (time < 840) return 'Обед';
      if (time < 1020) return 'Перекус';
      if (time < 1200) return 'Ужин';
      return 'Поздний приём';
    }
    const labels = ['Завтрак', 'Обед', 'Перекус', 'Ужин'];
    return labels[index] || ('Приём ' + (index + 1));
  }

  function checkMealHarm(meal, pIndex) {
    if (!meal || !meal.items || !pIndex) return false;
    for (var i = 0; i < meal.items.length; i++) {
      var item = meal.items[i];
      var product = (HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(item, pIndex))
        || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(item, pIndex));
      if (product && (product.harm || 0) >= 7) return true;
    }
    return false;
  }

  // Загружает N предыдущих дней из localStorage (для стрик-штрафов и истории измерений)
  function getPreviousDays(n) {
    var result = [];
    var U = HEYS.utils;
    var clientId = (U && U.getCurrentClientId && U.getCurrentClientId()) || HEYS.currentClientId || '';
    for (var i = 1; i <= n; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var ds = d.toISOString().slice(0, 10);
      var key = clientId ? 'heys_' + clientId + '_dayv2_' + ds : 'heys_dayv2_' + ds;
      try {
        var raw = (HEYS.store && HEYS.store.get) ? HEYS.store.get(key, null) : localStorage.getItem(key);
        if (raw) {
          result.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } else {
          result.push(null);
        }
      } catch (e) {
        result.push(null);
      }
    }
    return result; // array[0] = yesterday, array[n-1] = n days ago
  }

  // ─────────────────────────────────────────────────────
  // v2.1.0 MATH UTILITIES
  // ─────────────────────────────────────────────────────

  function clamp(val, lo, hi) {
    return val < lo ? lo : val > hi ? hi : val;
  }

  function median(arr) {
    if (!arr.length) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function stdev(arr) {
    if (arr.length < 2) return 0;
    var m = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    var variance = arr.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / arr.length;
    return Math.sqrt(variance);
  }

  function getPersonalBaseline(prevDays, extractor, defaultVal) {
    var values = [];
    for (var i = 0; i < prevDays.length; i++) {
      if (!prevDays[i]) continue;
      var val = extractor(prevDays[i]);
      if (val != null && val > 0) values.push(val);
    }
    return values.length >= 3 ? median(values) : defaultVal;
  }

  function getFactorConfidence(prevDays, extractor) {
    var count = 0;
    for (var i = 0; i < prevDays.length; i++) {
      if (!prevDays[i]) continue;
      var val = extractor(prevDays[i]);
      if (val != null && val > 0) count++;
    }
    if (count >= 10) return 1.0;
    if (count >= 7) return 0.8;
    if (count >= 3) return 0.5;
    if (count >= 1) return 0.3;
    return 0.1;
  }

  function countConsecutive(prevDays, predicate) {
    var count = 0;
    for (var i = 0; i < prevDays.length; i++) {
      if (predicate(prevDays[i])) count++;
      else break;
    }
    return count;
  }

  function getCircadianMultiplier(timeMins) {
    if (timeMins === null || timeMins === undefined) return 1.0;
    for (var i = 0; i < CIRCADIAN_MEAL_MODIFIERS.length; i++) {
      var mod = CIRCADIAN_MEAL_MODIFIERS[i];
      if (timeMins >= mod.start && timeMins < mod.end) return mod.mult;
    }
    return 1.0;
  }

  function getTrainingDuration(tr) {
    var dur = 0;
    if (tr && tr.z && Array.isArray(tr.z)) {
      dur = tr.z.reduce(function (a, b) { return a + (b || 0); }, 0);
    }
    if (!dur && tr && tr.duration) dur = tr.duration;
    if (!dur && tr && tr.type) {
      var typeDefaults = { cardio: 40, strength: 50, hiit: 30, yoga: 60, stretching: 30 };
      dur = typeDefaults[tr.type] || 40;
    }
    return dur || 40;
  }

  function getTrainingLoad(tr) {
    var dur = getTrainingDuration(tr);
    var type = (tr && tr.type) || '';
    var mult = INTENSITY_MULTIPLIERS[type] || 1.0;
    return dur * mult;
  }

  function buildInputSignature(day, normAbs, prof) {
    var meals = (day && day.meals) || [];
    var trainings = (day && day.trainings) || [];

    var mealsSig = meals.map(function (m) {
      var items = (m && m.items) || [];
      var gramsSum = items.reduce(function (acc, it) {
        return acc + (it.grams || it.g || 0);
      }, 0);
      // v5.0.2: Включаем kcal100 (× 10, округлённое) чтобы инвалидировать кэш
      // когда cascade batch обновляет нутриенты в localStorage
      var kcal100Sum = items.reduce(function (acc, it) {
        return acc + Math.round((it.kcal100 || 0) * 10);
      }, 0);
      return [m && m.time || '-', items.length, gramsSum, kcal100Sum].join('|');
    }).join(';');

    var trainingsSig = trainings.map(function (t) {
      return [t && t.time || '-', t && t.duration || 0].join('|');
    }).join(';');

    return [
      meals.length,
      mealsSig,
      trainings.length,
      trainingsSig,
      (day && day.water) || 0,
      (day && day.steps) || 0,
      (normAbs && normAbs.kcal) || 0,
      (prof && prof.water_norm) || 2000,
      (prof && (prof.stepsGoal || prof.steps_goal)) || 8000,
      // v2.0.0: новые факторы
      (day && day.householdMin) || 0,
      (day && day.sleepStart) || '',
      (day && day.sleepHours) || 0,
      (day && (day.weightMorning > 0 ? 1 : 0)) || 0,
      (day && day.measurements) ? JSON.stringify(day.measurements) : '',
      (day && day.supplementsTaken) ? day.supplementsTaken.length : 0
    ].join('::');
  }

  // ─────────────────────────────────────────────────────
  // ДВИЖОК: computeCascadeState
  // ─────────────────────────────────────────────────────

  function computeCascadeState(day, dayTot, normAbs, prof, pIndex) {
    var t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

    console.info('[HEYS.cascade] ─── computeCascadeState v2.2.0 START ────────');
    console.info('[HEYS.cascade] 🧬 v2.2.0 features: soft chain degradation | score-driven states | continuous scoring | personal baselines | circadian awareness | confidence layer | day-type detection | cross-factor synergies');
    console.info('[HEYS.cascade] 📥 Input data:', {
      hasMeals: !!(day && day.meals && day.meals.length),
      mealsCount: (day && day.meals && day.meals.length) || 0,
      hasTrainings: !!(day && day.trainings && day.trainings.length),
      trainingsCount: (day && day.trainings && day.trainings.length) || 0,
      water: (day && day.water) || 0,
      steps: (day && day.steps) || 0,
      sleepStart: (day && day.sleepStart) || null,
      sleepHours: (day && day.sleepHours) || 0,
      householdMin: (day && day.householdMin) || 0,
      weightMorning: (day && day.weightMorning) || 0,
      hasMeasurements: !!(day && day.measurements),
      hasSupplements: !!(day && day.supplementsTaken),
      hasNormAbs: !!normAbs,
      kcalNorm: normAbs ? normAbs.kcal : null,
      hasProf: !!prof,
      hasPIndex: !!pIndex
    });

    var events = [];
    var meals = (day && day.meals) || [];
    var trainings = (day && day.trainings) || [];
    var water = (day && day.water) || 0;
    var steps = (day && day.steps) || 0;
    var now = new Date();
    var currentHour = now.getHours();
    var currentMinutes = now.getHours() * 60 + now.getMinutes();

    var score = 0;

    // v2.1.0: Load 14-day history ONCE for all baseline/confidence/streak calculations
    var prevDays14 = getPreviousDays(14);
    var confidenceMap = {};
    var rawWeights = {};
    var iwAvgGap = 0; // hoisted for synergy access

    // ── ШАГ 1: Бытовая активность (adaptive baseline + log2) ──
    var householdMin = (day && day.householdMin) || 0;
    var baselineNEAT = getPersonalBaseline(prevDays14, function (d) { return d.householdMin; }, POPULATION_DEFAULTS.householdMin);
    var neatConfidence = getFactorConfidence(prevDays14, function (d) { return d.householdMin; });
    confidenceMap.household = neatConfidence;

    if (householdMin > 0) {
      var neatRatio = householdMin / baselineNEAT;
      var householdWeight = clamp(Math.log2(neatRatio + 0.5) * 0.8, -0.5, 1.2);
      var rawHousehold = householdWeight;
      householdWeight *= neatConfidence;
      rawWeights.household = rawHousehold;
      score += householdWeight;
      events.push({
        type: 'household',
        time: null,
        positive: true,
        icon: EVENT_ICONS.household,
        label: 'Бытовая активность ' + householdMin + ' мин',
        sortKey: 599,
        weight: householdWeight
      });
      console.info('[HEYS.cascade] 🏠 [EVENT] household (v2.1.0 log2 adaptive):', {
        householdMin: householdMin, baseline: Math.round(baselineNEAT),
        ratio: +neatRatio.toFixed(2), formula: 'log2(' + +neatRatio.toFixed(2) + '+0.5)×0.8',
        rawWeight: +rawHousehold.toFixed(2),
        confidence: neatConfidence, adjustedWeight: +householdWeight.toFixed(2)
      });
    } else {
      var houseStreak = countConsecutive(prevDays14, function (d) { return !d || !(d.householdMin > 9); });
      if (houseStreak > 2) {
        var hPenalty = Math.max(-0.5, -0.08 * Math.pow(houseStreak - 2, 0.7));
        hPenalty *= neatConfidence;
        rawWeights.household = hPenalty / (neatConfidence || 1);
        score += hPenalty;
        console.info('[HEYS.cascade] 🏠 Household streak penalty:', { streakDays: houseStreak, penalty: +hPenalty.toFixed(2), confidence: neatConfidence });
      } else {
        rawWeights.household = 0;
        console.info('[HEYS.cascade] 🏠 No household data today, streak=' + houseStreak + ' (no penalty yet)');
      }
    }

    // ── ШАГ 2: Приёмы пищи ──────────────────────────────
    var cumulativeKcal = 0;
    console.info('[HEYS.cascade] 🥗 Processing', meals.length, 'meals...');

    meals.forEach(function (meal, i) {
      var items = (meal && meal.items) || [];
      var mealKcal = items.reduce(function (sum, it) {
        var g = it.grams || it.g || 100;
        var p = pIndex
          ? ((HEYS.dayUtils && HEYS.dayUtils.getProductFromItem && HEYS.dayUtils.getProductFromItem(it, pIndex))
            || (HEYS.models && HEYS.models.getProductFromItem && HEYS.models.getProductFromItem(it, pIndex)))
          : null;
        if (p) {
          var kcal100 = p.kcal || p.kcal100 || 0;
          return sum + (kcal100 * g / 100);
        }
        return sum + (it.kcal || 0);
      }, 0);

      cumulativeKcal += mealKcal;
      var normKcal = (normAbs && normAbs.kcal) || 0;
      var cumulativeRatio = normKcal ? (cumulativeKcal / normKcal) : 0;
      var overNorm = normKcal ? cumulativeRatio > 1.2 : false;
      var hasHarm = checkMealHarm(meal, pIndex);
      var timeMins = parseTime(meal && meal.time);
      var isLate = timeMins !== null && timeMins >= 1380;

      // ─ v2.1.0: Hard violations (harm ≥ 7, late > 23:00) ─
      var hasHardViolation = hasHarm || isLate;
      var positive = !hasHardViolation;
      var breakReason = hasHarm ? 'Вредный продукт' : (isLate ? 'Поздний приём' : null);

      // ─ Quality scoring via getMealQualityScore (0–100) ─
      var mealQS = null;
      var mealScoringFn = (HEYS.mealScoring && typeof HEYS.mealScoring.getMealQualityScore === 'function')
        ? HEYS.mealScoring.getMealQualityScore.bind(HEYS.mealScoring)
        : (typeof HEYS.getMealQualityScore === 'function' ? HEYS.getMealQualityScore : null);

      if (mealScoringFn && pIndex) {
        try {
          mealQS = mealScoringFn(meal, null, normKcal || 2000, pIndex, null);
        } catch (err) {
          // Non-blocking — continue with fallback
        }
      }

      // ─ v2.1.0: Continuous scoring (linear interpolation) ─
      // 0→-1.0, 20→-0.5, 40→0.0, 60→+0.5, 80→+1.0, 100→+1.5
      var mealWeight;
      var qualityGrade = null;

      if (mealQS && mealQS.score != null) {
        var qs = mealQS.score; // 0–100
        mealWeight = clamp((qs - 40) / 40, -1.0, 1.5);
        qualityGrade = qs >= 80 ? 'excellent' : qs >= 60 ? 'good' : qs >= 40 ? 'ok' : qs >= 20 ? 'poor' : 'bad';

        // Poor/bad quality → break chain
        if (qs < 20 && positive) {
          positive = false;
          breakReason = breakReason || 'Низкое качество';
        } else if (qs < 40 && positive) {
          positive = false;
          breakReason = breakReason || 'Слабый приём';
        }
      } else {
        // Fallback binary
        mealWeight = positive ? EVENT_WEIGHTS.meal_positive : EVENT_WEIGHTS.meal_negative;
      }

      // Circadian modifier: breakfast ×1.3, late dinner ×0.7
      if (timeMins !== null && timeMins < 1380 && !hasHardViolation) {
        var circMult = getCircadianMultiplier(timeMins);
        mealWeight *= circMult;
      }

      // Progressive cumulative penalty (sigmoid, replaces binary 120% cutoff)
      if (normKcal > 0 && cumulativeRatio > 1.0 && !hasHardViolation) {
        var cumulPenalty = -Math.tanh((cumulativeRatio - 1.0) / 0.2) * 1.5;
        mealWeight = Math.min(mealWeight, cumulPenalty);
        positive = false;
        breakReason = breakReason || 'Перебор ккал (' + Math.round(cumulativeRatio * 100) + '%)';
      }

      // Hard violations always force -1.0
      if (hasHardViolation) {
        mealWeight = -1.0;
      }

      score += mealWeight;

      events.push({
        type: 'meal',
        time: (meal && meal.time) || null,
        positive: positive,
        icon: EVENT_ICONS.meal,
        label: getMealLabel(meal, i),
        sortKey: timeMins !== null ? timeMins : (500 + i * 120),
        breakReason: breakReason,
        weight: mealWeight,
        qualityScore: mealQS ? mealQS.score : null,
        qualityGrade: qualityGrade,
        qualityColor: mealQS ? mealQS.color : null
      });

      // Явная строка — всегда читается без разворачивания объекта
      if (mealQS && mealQS.score != null) {
        console.info('[HEYS.cascade] 🎯 Meal quality (' + getMealLabel(meal, i) + '): score=' + mealQS.score + ' grade=' + qualityGrade + ' weight=' + (+mealWeight).toFixed(2) + ' color=' + mealQS.color + ' scoring=v2.1.0-continuous');
      } else {
        console.warn('[HEYS.cascade] ⚠️ getMealQualityScore недоступен (' + getMealLabel(meal, i) + ') → fallback weight=' + mealWeight + ' | HEYS.mealScoring=' + (typeof (HEYS.mealScoring && HEYS.mealScoring.getMealQualityScore)) + ' pIndex=' + (!!pIndex));
      }

      console.info('[HEYS.cascade] 🍽️ [MEAL ' + (i + 1) + '/' + meals.length + '] ' + getMealLabel(meal, i) + ' (v2.1.0 continuous + circadian):', {
        time: (meal && meal.time) || null,
        mealKcal: Math.round(mealKcal),
        cumulativeKcal: Math.round(cumulativeKcal),
        normKcal: Math.round(normKcal),
        cumulativeRatio: +cumulativeRatio.toFixed(2),
        circadianModifier: (timeMins !== null && timeMins < 1380 && !hasHardViolation) ? +getCircadianMultiplier(timeMins).toFixed(2) : 'N/A',
        hasHarm: hasHarm,
        isLate: isLate,
        positive: positive,
        breakReason: breakReason,
        quality: mealQS
          ? { score: mealQS.score, grade: qualityGrade, formula: 'clamp((' + mealQS.score + '-40)/40)' }
          : '(getMealQualityScore недоступен)',
        weight: +(mealWeight).toFixed(2)
      });
    });

    // ── ШАГ 3: Тренировки (load × intensity, diminishing returns, recovery-aware) ──
    console.info('[HEYS.cascade] 💪 Processing', trainings.length, 'trainings...');
    var todayTotalLoad = 0;
    var trainingConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.trainings && d.trainings.length; });
    confidenceMap.training = trainingConfidence;

    if (trainings.length > 0) {
      var sessionWeights = [];
      trainings.forEach(function (tr, ti) {
        var timeMins = parseTime(tr && tr.time);
        var dur = getTrainingDuration(tr);
        var load = getTrainingLoad(tr);
        todayTotalLoad += load;
        // sqrt-curve: diminishing returns on load
        var sessionWeight = clamp(Math.sqrt(load / 30) * 1.2, 0.3, 3.0);
        sessionWeights.push(sessionWeight);
        var trainingWeight;
        if (ti === 0) {
          trainingWeight = sessionWeight;
        } else if (ti === 1) {
          trainingWeight = sessionWeight * 0.5; // 2nd session: half credit
        } else {
          trainingWeight = sessionWeight * 0.25; // 3rd+: quarter credit
        }
        trainingWeight *= trainingConfidence;
        rawWeights['training_' + ti] = sessionWeight;
        score += trainingWeight;
        var trType = (tr && tr.type) || '';
        events.push({
          type: 'training',
          time: (tr && tr.time) || null,
          positive: true,
          icon: EVENT_ICONS.training,
          label: 'Тренировка ' + dur + ' мин' + (trType ? ' (' + trType + ')' : ''),
          sortKey: timeMins !== null ? timeMins : 700,
          weight: trainingWeight
        });
        console.info('[HEYS.cascade] 💪 [TRAINING ' + (ti + 1) + '/' + trainings.length + '] (v2.1.0 load×intensity + sqrt curve):', {
          time: (tr && tr.time) || null, duration: dur, type: trType || 'unknown',
          load: Math.round(load), formula: 'sqrt(' + Math.round(load) + '/30)×1.2',
          sessionWeight: +sessionWeight.toFixed(2),
          diminishingFactor: ti === 0 ? '1.0 (full)' : ti === 1 ? '0.5 (2nd session)' : '0.25 (3rd+)',
          confidence: trainingConfidence, adjustedWeight: +trainingWeight.toFixed(2)
        });
      });
    } else {
      // Recovery-aware: check if yesterday had intense training
      var yesterdayLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yesterdayLoad += getTrainingLoad(t); });
      }
      var isPlannedRecovery = yesterdayLoad > 60;
      if (isPlannedRecovery) {
        // Planned recovery after heavy training: small bonus instead of penalty
        var recoveryBonus = 0.2 * trainingConfidence;
        rawWeights.training_recovery = 0.2;
        score += recoveryBonus;
        console.info('[HEYS.cascade] 💪 Planned recovery day (yesterday load=' + Math.round(yesterdayLoad) + '):', { bonus: +recoveryBonus.toFixed(2) });
      } else {
        var trainStreak = countConsecutive(prevDays14, function (d) { return !d || !(d.trainings && d.trainings.length > 0); });
        if (trainStreak > 2) {
          var weeklyLoad = 0;
          for (var wl = 0; wl < Math.min(7, prevDays14.length); wl++) {
            if (prevDays14[wl] && prevDays14[wl].trainings) {
              prevDays14[wl].trainings.forEach(function (t) { weeklyLoad += getTrainingLoad(t); });
            }
          }
          var weeklyTarget = POPULATION_DEFAULTS.weeklyTrainingLoad;
          var weeklyRatio = weeklyTarget > 0 ? weeklyLoad / weeklyTarget : 0;
          if (weeklyRatio < 0.8) {
            var tPenalty = Math.max(-0.5, -0.15 * (trainStreak - 2));
            tPenalty *= trainingConfidence;
            rawWeights.training_penalty = tPenalty / (trainingConfidence || 1);
            score += tPenalty;
            console.info('[HEYS.cascade] 💪 Training streak penalty:', {
              streakDays: trainStreak, weeklyLoad: Math.round(weeklyLoad),
              weeklyTarget: Math.round(weeklyTarget), weeklyRatio: +weeklyRatio.toFixed(2),
              penalty: +tPenalty.toFixed(2), confidence: trainingConfidence
            });
          } else {
            rawWeights.training_penalty = 0;
            console.info('[HEYS.cascade] 💪 No trainings today, streak=' + trainStreak + ' but weekly load OK (' + weeklyRatio.toFixed(2) + ')');
          }
        } else {
          rawWeights.training_penalty = 0;
          console.info('[HEYS.cascade] 💪 No trainings today, streak=' + trainStreak + ' (no penalty yet)');
        }
      }
    }

    // ── ШАГ 4: Засыпание (chronotype-adaptive sigmoid + consistency) ──
    var sleepStart = (day && day.sleepStart) || '';
    var sleepOnsetConfidence = getFactorConfidence(prevDays14, function (d) {
      return d && d.sleepStart ? parseTime(d.sleepStart) : null;
    });
    confidenceMap.sleepOnset = sleepOnsetConfidence;

    if (sleepStart) {
      var sleepMins = parseTime(sleepStart);
      if (sleepMins !== null && sleepMins < 360) sleepMins += 1440; // after midnight
      if (sleepMins !== null) {
        // v2.1.0: Chronotype-adaptive baseline from 14-day history
        var sleepOnsetValues = [];
        for (var si = 0; si < prevDays14.length; si++) {
          if (!prevDays14[si] || !prevDays14[si].sleepStart) continue;
          var soVal = parseTime(prevDays14[si].sleepStart);
          if (soVal !== null) {
            if (soVal < 360) soVal += 1440;
            sleepOnsetValues.push(soVal);
          }
        }
        var personalOnset = sleepOnsetValues.length >= 3 ? median(sleepOnsetValues) : POPULATION_DEFAULTS.sleepOnsetMins;
        var optimalOnset = Math.max(1290, Math.min(personalOnset, 1470)); // clamp 21:30–00:30

        // Sigmoid scoring: deviation from personal optimal
        var onsetDeviation = sleepMins - optimalOnset; // minutes (positive = later)
        var rawSleepOnset = -Math.tanh(onsetDeviation / 45) * 2.0 + 0.5;
        rawSleepOnset = clamp(rawSleepOnset, -2.5, 1.5);

        // Consistency bonus (low variance in sleep onset → stable circadian rhythm)
        var consistencyBonus = 0;
        if (sleepOnsetValues.length >= 5) {
          var onsetVariance = stdev(sleepOnsetValues);
          if (onsetVariance < 30) consistencyBonus = 0.3;
          else if (onsetVariance < 45) consistencyBonus = 0.15;
        }

        // Hard floor: after 03:00 = circadian catastrophe
        if (sleepMins > 1620) { rawSleepOnset = -2.5; consistencyBonus = 0; }

        var sleepOnsetWeightFinal = (rawSleepOnset + consistencyBonus) * sleepOnsetConfidence;
        rawWeights.sleepOnset = rawSleepOnset + consistencyBonus;
        score += sleepOnsetWeightFinal;

        var sleepOnsetLabel = sleepMins <= 1320 ? 'Ранний сон' : sleepMins <= 1380 ? 'Сон до 23:00'
          : sleepMins <= 1440 ? 'Сон до полуночи' : sleepMins <= 1500 ? 'Поздний сон' : 'Очень поздний сон';
        events.push({
          type: 'sleep',
          time: sleepStart,
          positive: rawSleepOnset >= 0,
          icon: EVENT_ICONS.sleep,
          label: sleepOnsetLabel,
          sortKey: 1300,
          weight: sleepOnsetWeightFinal
        });
        console.info('[HEYS.cascade] 😴 Sleep onset (v2.1.0 chronotype-adaptive sigmoid):', {
          sleepStart: sleepStart, sleepMins: sleepMins,
          personalOnset: Math.round(personalOnset), optimalOnset: Math.round(optimalOnset),
          deviationMin: Math.round(onsetDeviation),
          formula: '-tanh(' + Math.round(onsetDeviation) + '/45)×2.0+0.5',
          rawWeight: +rawSleepOnset.toFixed(2), consistencyBonus: +consistencyBonus.toFixed(2),
          onsetVariance: sleepOnsetValues.length >= 5 ? Math.round(stdev(sleepOnsetValues)) : 'N/A (need 5+ days)',
          confidence: sleepOnsetConfidence, adjustedWeight: +sleepOnsetWeightFinal.toFixed(2)
        });
      }
    } else {
      console.info('[HEYS.cascade] 😴 No sleepStart data — ШАГ 4 skipped');
    }

    // ── ШАГ 5: Длительность сна (personalized bell-curve + training recovery) ──
    var sleepHours = (day && day.sleepHours) || 0;
    if (!sleepHours && (day && day.sleepStart) && (day && day.sleepEnd)) {
      var sdm = parseTime(day.sleepStart); var edm = parseTime(day.sleepEnd);
      if (sdm !== null && edm !== null) {
        if (edm < sdm) edm += 1440;
        sleepHours = (edm - sdm) / 60;
      }
    }
    var sleepDurConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.sleepHours; });
    confidenceMap.sleepDur = sleepDurConfidence;

    if (sleepHours > 0) {
      // Personal optimal from 14-day median
      var personalSleepOpt = getPersonalBaseline(prevDays14, function (d) { return d.sleepHours; }, POPULATION_DEFAULTS.sleepHours);
      personalSleepOpt = clamp(personalSleepOpt, 6.0, 9.0);

      // Training recovery: need +0.5h after intense training yesterday
      var yesterdayTrainLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yesterdayTrainLoad += getTrainingLoad(t); });
      }
      if (yesterdayTrainLoad > 60) personalSleepOpt += 0.5;

      // Bell-curve scoring: Gaussian around personal optimal
      var sleepDev = Math.abs(sleepHours - personalSleepOpt);
      var rawSleepDur = 1.5 * Math.exp(-(sleepDev * sleepDev) / (2 * 0.8 * 0.8)) - 0.5;

      // Asymmetry: undersleep penalized 1.3x more than oversleep
      if (sleepHours < personalSleepOpt) rawSleepDur *= 1.3;

      // Hard limits
      if (sleepHours < 4.0) rawSleepDur = -2.0;
      else if (sleepHours > 12.0) rawSleepDur = -0.5;

      rawSleepDur = clamp(rawSleepDur, -2.0, 1.5);
      var sleepDurWeight = rawSleepDur * sleepDurConfidence;
      rawWeights.sleepDur = rawSleepDur;
      score += sleepDurWeight;
      console.info('[HEYS.cascade] 😴 Sleep duration (v2.1.0 Gaussian bell-curve):', {
        sleepHours: +sleepHours.toFixed(1), personalOptimal: +personalSleepOpt.toFixed(1),
        deviation: +sleepDev.toFixed(1), formula: '1.5×exp(-' + sleepDev.toFixed(1) + '²/(2×0.8²))-0.5',
        asymmetry: sleepHours < personalSleepOpt ? '×1.3 (undersleep penalty)' : 'none',
        yesterdayTrainLoad: Math.round(yesterdayTrainLoad),
        trainingRecovery: yesterdayTrainLoad > 60 ? '+0.5h optimal shift' : 'none',
        rawWeight: +rawSleepDur.toFixed(2), confidence: sleepDurConfidence,
        adjustedWeight: +sleepDurWeight.toFixed(2)
      });
    } else {
      console.info('[HEYS.cascade] 😴 No sleepHours data — ШАГ 5 skipped');
    }

    // ── ШАГ 6: Шаги (rolling adaptive goal + tanh continuous) ──
    var stepsConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.steps; });
    confidenceMap.steps = stepsConfidence;
    var stepsWeight = 0;

    if (steps > 0) {
      // Adaptive goal: 14-day median × 1.05 (progressive overload)
      var rollingStepsAvg = getPersonalBaseline(prevDays14, function (d) { return d.steps; },
        (prof && (prof.stepsGoal || prof.steps_goal)) || POPULATION_DEFAULTS.steps);
      var adaptiveGoal = Math.max(5000, rollingStepsAvg * 1.05);
      var stepsRatio = steps / adaptiveGoal;

      // Continuous tanh scoring
      var rawSteps = clamp(Math.tanh((stepsRatio - 0.6) * 2.5) * 1.0 + 0.15, -0.5, 1.3);
      stepsWeight = rawSteps * stepsConfidence;
      rawWeights.steps = rawSteps;
      score += stepsWeight;

      var stepsLabel = stepsRatio >= 1.2
        ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (отлично!)')
        : stepsRatio >= 1.0
          ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (цель)')
          : ('Шаги — ' + Math.round(stepsRatio * 100) + '%');
      events.push({
        type: 'steps',
        time: null,
        positive: rawSteps > 0,
        icon: EVENT_ICONS.steps,
        label: stepsLabel,
        sortKey: 1100,
        weight: stepsWeight
      });
      console.info('[HEYS.cascade] 🚶 Steps (v2.1.0 rolling adaptive + tanh):', {
        steps: steps, adaptiveGoal: Math.round(adaptiveGoal),
        ratio: +stepsRatio.toFixed(2), formula: 'tanh((' + stepsRatio.toFixed(2) + '-0.6)×2.5)×1.0+0.15',
        rawWeight: +rawSteps.toFixed(2),
        confidence: stepsConfidence, adjustedWeight: +stepsWeight.toFixed(2)
      });
    } else {
      rawWeights.steps = 0;
      console.info('[HEYS.cascade] 🚶 No steps data — ШАГ 6 skipped');
    }

    // ── ШАГ 7: Чекин веса (streak bonus + trend awareness) ──
    var weightMorning = (day && day.weightMorning) || 0;
    var checkinConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.weightMorning; });
    confidenceMap.checkin = checkinConfidence;

    if (weightMorning > 0) {
      var checkinBase = 0.3;
      // Streak bonus: consecutive check-ins (+0.05/day, max +0.5)
      var checkinStreak = countConsecutive(prevDays14, function (d) { return d && d.weightMorning > 0; });
      var streakBonus = Math.min(0.5, checkinStreak * 0.05);

      // Trend awareness: stability bonus if weight is stable ±50g/day
      var trendBonus = 0;
      var recentWeights = [];
      for (var cw = 0; cw < Math.min(7, prevDays14.length); cw++) {
        if (prevDays14[cw] && prevDays14[cw].weightMorning > 0) recentWeights.push(prevDays14[cw].weightMorning);
      }
      if (recentWeights.length >= 3) {
        var wFirst = recentWeights[recentWeights.length - 1];
        var wLast = recentWeights[0];
        var slope = (wLast - wFirst) / recentWeights.length;
        if (Math.abs(slope) < 0.05) trendBonus = 0.05; // stable weight
      }

      var rawCheckin = clamp(checkinBase + streakBonus + trendBonus, 0, 0.8);
      var checkinWeight = rawCheckin * checkinConfidence;
      rawWeights.checkin = rawCheckin;
      score += checkinWeight;
      events.push({
        type: 'checkin',
        time: null,
        positive: true,
        icon: EVENT_ICONS.checkin,
        label: 'Чекин веса: ' + weightMorning + ' кг' + (checkinStreak > 2 ? ' (' + (checkinStreak + 1) + ' д.)' : ''),
        sortKey: 540,
        weight: checkinWeight
      });
      console.info('[HEYS.cascade] ⚖️ Weight checkin (v2.1.0 streak + trend):', {
        weight: weightMorning, base: checkinBase,
        streak: checkinStreak, streakBonus: +streakBonus.toFixed(2),
        trendBonus: +trendBonus.toFixed(2),
        formula: 'base(' + checkinBase + ') + streak(' + streakBonus.toFixed(2) + ') + trend(' + trendBonus.toFixed(2) + ')',
        rawWeight: +rawCheckin.toFixed(2),
        confidence: checkinConfidence, adjustedWeight: +checkinWeight.toFixed(2)
      });
    } else {
      // Mild habit-break penalty if streak was active
      var brokenStreak = countConsecutive(prevDays14, function (d) { return d && d.weightMorning > 0; });
      if (brokenStreak >= 3) {
        var breakPenalty = -0.1 * checkinConfidence;
        rawWeights.checkin = -0.1;
        score += breakPenalty;
        console.info('[HEYS.cascade] ⚖️ Checkin streak broken (was ' + brokenStreak + ' days):', { penalty: +breakPenalty.toFixed(2) });
      } else {
        rawWeights.checkin = 0;
        console.info('[HEYS.cascade] ⚖️ No weight checkin today — ШАГ 7 skipped');
      }
    }

    // ── ШАГ 8: Замеры (smart cadence + completeness score) ──
    var measurements = (day && day.measurements) || null;
    var measKeys = measurements ? Object.keys(measurements).filter(function (k) { return measurements[k] > 0; }) : [];
    var hasMeasToday = measKeys.length > 0;
    var measConfidence = getFactorConfidence(prevDays14, function (d) {
      return d && d.measurements && Object.keys(d.measurements).some(function (k) { return d.measurements[k] > 0; }) ? 1 : 0;
    });
    confidenceMap.measurements = measConfidence;

    if (hasMeasToday) {
      var totalPossible = 4; // waist, hips, thigh, biceps
      var completeness = measKeys.length / totalPossible;
      var rawMeas = 0.5 + completeness * 0.7; // 1 part → +0.67, all 4 → +1.2

      // Diminishing returns if measured yesterday too (weekly cadence is optimal)
      var lastMeasDayIdx = -1;
      for (var lm = 0; lm < prevDays14.length; lm++) {
        var plm = prevDays14[lm];
        if (plm && plm.measurements && Object.keys(plm.measurements).some(function (k) { return plm.measurements[k] > 0; })) {
          lastMeasDayIdx = lm + 1; break;
        }
      }
      if (lastMeasDayIdx !== -1 && lastMeasDayIdx <= 2) rawMeas *= 0.5;

      rawMeas = clamp(rawMeas, 0, 1.2);
      var measWeight = rawMeas * measConfidence;
      rawWeights.measurements = rawMeas;
      score += measWeight;
      events.push({
        type: 'measurements',
        time: null,
        positive: true,
        icon: EVENT_ICONS.measurements,
        label: 'Замеры тела (' + measKeys.length + '/' + totalPossible + ')',
        sortKey: 545,
        weight: measWeight
      });
      console.info('[HEYS.cascade] 📏 Measurements (v2.1.0 completeness + cadence):', {
        count: measKeys.length, completeness: +completeness.toFixed(2),
        formula: '0.5 + ' + completeness.toFixed(2) + '×0.7',
        lastMeasDay: lastMeasDayIdx, diminishing: lastMeasDayIdx !== -1 && lastMeasDayIdx <= 2 ? '×0.5 (recent)' : 'none',
        rawWeight: +rawMeas.toFixed(2),
        confidence: measConfidence, adjustedWeight: +measWeight.toFixed(2)
      });
    } else {
      // Penalty if too long since last measurement
      var lastMeasSearch = -1;
      for (var pms = 0; pms < prevDays14.length; pms++) {
        var pds = prevDays14[pms];
        if (pds && pds.measurements && Object.keys(pds.measurements).some(function (k) { return pds.measurements[k] > 0; })) {
          lastMeasSearch = pms + 1; break;
        }
      }
      if (lastMeasSearch > 7) {
        var measPenalty = clamp(-0.05 * (lastMeasSearch - 7), -0.3, 0);
        measPenalty *= measConfidence;
        rawWeights.measurements = measPenalty / (measConfidence || 1);
        score += measPenalty;
        console.info('[HEYS.cascade] 📏 Measurements penalty:', { lastMeasDay: lastMeasSearch, penalty: +measPenalty.toFixed(2) });
      } else {
        rawWeights.measurements = 0;
      }
    }

    // ── ШАГ 9: Витамины (continuous + streak bonus) ─────
    var suppTaken = (day && day.supplementsTaken) ? day.supplementsTaken.length : 0;
    var suppPlanned = (day && day.supplementsPlanned) || (prof && prof.plannedSupplements) || 0;
    var suppConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.supplementsTaken && d.supplementsTaken.length; });
    confidenceMap.supplements = suppConfidence;

    if (suppPlanned > 0) {
      var suppRatio = suppTaken / suppPlanned;
      // Continuous scoring: ratio × 0.7 - 0.1
      var rawSupp = clamp(suppRatio * 0.7 - 0.1, -0.3, 0.5);

      // Streak bonus
      var suppStreak = countConsecutive(prevDays14, function (d) {
        if (!d || !d.supplementsTaken) return false;
        var st = d.supplementsTaken.length || 0;
        var sp = d.supplementsPlanned || (d.plannedSupplements || suppPlanned);
        return sp > 0 && (st / sp) >= 0.8;
      });
      var suppStreakBonus = suppStreak >= 7 ? 0.2 : suppStreak >= 3 ? 0.1 : 0;

      // Habit break penalty
      if (suppTaken === 0 && suppStreak >= 3) {
        rawSupp = -0.3;
        suppStreakBonus = 0;
      }

      rawSupp = clamp(rawSupp + suppStreakBonus, -0.3, 0.7);
      var suppWeight = rawSupp * suppConfidence;
      rawWeights.supplements = rawSupp;
      score += suppWeight;
      events.push({
        type: 'supplements',
        time: null,
        positive: rawSupp > 0,
        icon: EVENT_ICONS.supplements,
        label: suppRatio >= 1 ? 'Добавки: всё' : ('Добавки: ' + suppTaken + '/' + suppPlanned),
        sortKey: 550,
        weight: suppWeight
      });
      console.info('[HEYS.cascade] 💊 Supplements (v2.1.0 continuous + streak):', {
        taken: suppTaken, planned: suppPlanned, ratio: +suppRatio.toFixed(2),
        formula: 'clamp(' + suppRatio.toFixed(2) + '×0.7-0.1)',
        streak: suppStreak, streakBonus: +suppStreakBonus.toFixed(2),
        rawWeight: +rawSupp.toFixed(2), confidence: suppConfidence,
        adjustedWeight: +suppWeight.toFixed(2)
      });
    } else {
      rawWeights.supplements = 0;
      console.info('[HEYS.cascade] 💊 No supplement plan configured — ШАГ 9 skipped');
    }

    // ── ШАГ 10: Инсулиновые волны (sigmoid overlap + log2 gap + post-training + night fasting) ──
    var insulinConfidence = getFactorConfidence(prevDays14, function (d) { return d && d.meals && d.meals.length >= 2 ? 1 : 0; });
    confidenceMap.insulin = insulinConfidence;

    if (meals.length >= 2 && HEYS.InsulinWave && typeof HEYS.InsulinWave.calculate === 'function') {
      try {
        var iw = HEYS.InsulinWave.calculate({
          meals: meals, pIndex: pIndex,
          getProductFromItem: (HEYS.getProductFromItem || function () { return {}; }),
          trainings: trainings, dayData: { profile: prof }
        });
        var overlaps = (iw && iw.overlaps) || [];
        var gaps = (iw && iw.gaps) || [];
        iwAvgGap = (iw && iw.avgGapToday) || 0;
        var iwScore = 0;

        // Sigmoid overlap penalty (severity-weighted, continuous)
        overlaps.forEach(function (ov) {
          var overlapMins = ov.overlapMinutes || (ov.severity === 'high' ? 60 : ov.severity === 'medium' ? 40 : 15);
          var ovPenalty = -(1 / (1 + Math.exp(-overlapMins / 30))) * 0.6;
          iwScore += ovPenalty;
        });
        iwScore = Math.max(-2.0, iwScore); // cap overlap penalty

        // Log2 gap scoring (continuous)
        if (gaps.length > 0) {
          gaps.forEach(function (g) {
            var gapMins = g.gapMinutes || g.gap || 0;
            if (gapMins > 120) {
              var gapBonus = clamp(Math.log2(gapMins / 120), 0, 1.0) * 0.4;
              iwScore += gapBonus;
            }
          });
        } else if (iwAvgGap > 0) {
          // Fallback to avgGap if individual gaps not available
          if (iwAvgGap > 120) iwScore += clamp(Math.log2(iwAvgGap / 120), 0, 1.0) * 0.4;
        }

        // Post-training meal timing bonus (anabolic window)
        if (trainings.length > 0) {
          trainings.forEach(function (tr) {
            var trEnd = parseTime(tr && tr.time);
            if (trEnd === null) return;
            var trDur = getTrainingDuration(tr);
            trEnd += trDur; // approximate end time
            meals.forEach(function (m) {
              var mTime = parseTime(m && m.time);
              if (mTime === null) return;
              var diff = mTime - trEnd;
              if (diff >= 30 && diff <= 120) iwScore += 0.3; // anabolic window
              else if (diff >= 0 && diff < 30) iwScore += 0.15; // too soon but ok
            });
          });
        }

        // Night fasting bonus (continuous)
        var longestGap = 0;
        if (gaps.length > 0) {
          gaps.forEach(function (g) { longestGap = Math.max(longestGap, g.gapMinutes || g.gap || 0); });
        }
        if (longestGap > 0) {
          var nightGapHours = longestGap / 60;
          var nightBonus = clamp((nightGapHours - 10) * 0.15, 0, 0.5);
          iwScore += nightBonus;
        }

        iwScore = clamp(iwScore, -2.0, 2.0);
        var iwAdjusted = iwScore * insulinConfidence;
        rawWeights.insulin = iwScore;
        if (iwAdjusted !== 0) {
          score += iwAdjusted;
          events.push({
            type: 'insulin',
            time: null,
            positive: iwScore > 0,
            icon: EVENT_ICONS.insulin,
            label: iwScore > 0 ? 'Инсулиновые промежутки ✓' : 'Наложение инсулиновых волн',
            sortKey: 1200,
            weight: iwAdjusted
          });
          console.info('[HEYS.cascade] ⚡ InsulinWave (v2.1.0 sigmoid overlap + log2 gap + night fasting):', {
            overlaps: overlaps.length, avgGap: Math.round(iwAvgGap),
            longestGap: Math.round(longestGap),
            nightFasting: longestGap > 0 ? +(longestGap / 60).toFixed(1) + 'h' : 'N/A',
            postTrainingMealBonus: trainings.length > 0 ? 'checked' : 'no training',
            rawScore: +iwScore.toFixed(2), confidence: insulinConfidence,
            adjustedScore: +iwAdjusted.toFixed(2)
          });
        }
      } catch (e) {
        console.warn('[HEYS.cascade] ⚡ InsulinWave error (non-fatal):', e && e.message);
      }
    } else {
      rawWeights.insulin = 0;
      console.info('[HEYS.cascade] ⚡ InsulinWave skipped:', { meals: meals.length, hasModule: !!(HEYS.InsulinWave && HEYS.InsulinWave.calculate) });
    }

    // ── ШАГ 11: Scoring summary + Confidence ────────────
    console.info('[HEYS.cascade] 📊 v2.2.0 Scoring summary (before synergies):', {
      factorScores: rawWeights,
      totalScore: +score.toFixed(2),
      activeFactors: Object.keys(rawWeights).filter(function (k) { return rawWeights[k] !== 0; }).length,
      skippedFactors: Object.keys(rawWeights).filter(function (k) { return rawWeights[k] === 0; }).length,
      scoringMethod: 'v2.2.0 continuous (sigmoid/bell-curve/log2/tanh)'
    });

    var avgConfidence = 0;
    var confKeys = Object.keys(confidenceMap);
    if (confKeys.length > 0) {
      var confSum = 0;
      confKeys.forEach(function (k) { confSum += confidenceMap[k]; });
      avgConfidence = confSum / confKeys.length;
    }
    console.info('[HEYS.cascade] 🎯 Confidence layer (v2.2.0):', {
      factors: confidenceMap,
      avgConfidence: +avgConfidence.toFixed(2),
      dataQuality: avgConfidence >= 0.8 ? 'HIGH' : avgConfidence >= 0.5 ? 'MEDIUM' : 'LOW',
      effect: 'weights × confidence = noise reduction with sparse data'
    });

    // ── ШАГ 12: Day-Type detection ──────────────────────
    var dayType = 'normal';
    if (todayTotalLoad > 60) {
      dayType = 'training_day';
    } else if (todayTotalLoad > 0 && todayTotalLoad <= 30) {
      dayType = 'active_rest';
    } else {
      var yLoad = 0;
      if (prevDays14[0] && prevDays14[0].trainings) {
        prevDays14[0].trainings.forEach(function (t) { yLoad += getTrainingLoad(t); });
      }
      if (yLoad > 60 && todayTotalLoad === 0) {
        dayType = 'rest_day';
      }
    }

    // Day-type adjustments to score
    if (dayType === 'training_day') {
      // Training days: meal timing matters more, sleep recovery more important
      // (already handled by per-factor logic, but add small bonus for high-effort days)
      if (score > 0) score *= 1.05;
    } else if (dayType === 'rest_day') {
      // Rest days: no training penalty (already handled), sleep is king
    }

    console.info('[HEYS.cascade] 📅 Day-type (v2.1.0 context-aware):', {
      dayType: dayType, todayTrainingLoad: Math.round(todayTotalLoad),
      modifier: dayType === 'training_day' ? '×1.05 score bonus' : 'none',
      effect: dayType === 'rest_day' ? 'no training penalty, recovery focus'
        : dayType === 'active_rest' ? 'low-intensity encouraged'
          : dayType === 'training_day' ? 'higher calorie tolerance, sleep importance'
            : 'standard expectations'
    });

    // ── ШАГ 13: Cross-factor synergies ──────────────────
    var synergies = [];

    // 1. Sleep + Training Recovery: good sleep after training day
    if (dayType === 'rest_day' && sleepHours >= 7.5 && rawWeights.sleepDur > 0) {
      synergies.push({ name: 'sleep_training_recovery', bonus: 0.3, reason: 'Восстановительный сон после тренировки' });
    }

    // 2. NEAT + Steps: household activity pairs well with steps
    if (rawWeights.household > 0 && rawWeights.steps > 0) {
      synergies.push({ name: 'neat_steps', bonus: 0.2, reason: 'Высокая бытовая + шаговая активность' });
    }

    // 3. Meals + Insulin: quality meals with good insulin spacing
    if (rawWeights.insulin > 0.2) {
      var avgMealWeight = 0;
      var mealCount = 0;
      events.forEach(function (e) { if (e.type === 'meal') { avgMealWeight += e.weight; mealCount++; } });
      if (mealCount > 0) avgMealWeight /= mealCount;
      if (avgMealWeight > 0.3) {
        synergies.push({ name: 'meals_insulin', bonus: 0.25, reason: 'Качественные приёмы + правильные промежутки' });
      }
    }

    // 4. Morning Ritual: checkin + early meal/training before 10:00
    var hasEarlyAction = events.some(function (e) {
      return (e.type === 'meal' || e.type === 'training') && e.sortKey < 600;
    });
    if (rawWeights.checkin > 0 && hasEarlyAction) {
      synergies.push({ name: 'morning_ritual', bonus: 0.2, reason: 'Утренний ритуал: чекин + ранняя активность' });
    }

    // 5. Full Recovery Day: rest day + good sleep + no overeating
    if (dayType === 'rest_day' && rawWeights.sleepOnset > 0 && rawWeights.sleepDur > 0) {
      var noOvereating = !events.some(function (e) { return e.type === 'meal' && !e.positive; });
      if (noOvereating) {
        synergies.push({ name: 'full_recovery', bonus: 0.35, reason: 'Полный день восстановления' });
      }
    }

    // Apply synergy bonuses (max +1.3 total)
    var totalSynergyBonus = 0;
    synergies.forEach(function (s) { totalSynergyBonus += s.bonus; });
    totalSynergyBonus = Math.min(1.3, totalSynergyBonus);
    score += totalSynergyBonus;

    if (synergies.length > 0) {
      console.info('[HEYS.cascade] 🔗 Cross-factor synergies:', {
        count: synergies.length,
        synergies: synergies.map(function (s) { return s.name + ' (+' + s.bonus + ')'; }),
        totalBonus: +totalSynergyBonus.toFixed(2),
        capped: totalSynergyBonus === 1.3
      });
    }

    // ── ШАГ 14: Сортировка ───────────────────────────────
    events.sort(function (a, b) { return (a.sortKey || 0) - (b.sortKey || 0); });

    console.info('[HEYS.cascade] 📋 Events sorted (' + events.length + ' total):', events.map(function (e) {
      return { type: e.type, time: e.time, positive: e.positive, label: e.label, sortKey: e.sortKey };
    }));

    // ── ШАГ 15: Алгоритм цепочки (v2.2.0 soft chain) ────
    // v2.2.0: негативное событие уменьшает цепочку пропорционально тяжести,
    // а не обнуляет. Одна ошибка не перечёркивает весь прогресс.
    var chain = 0;
    var maxChain = 0;
    var warnings = [];
    var totalPenalty = 0;
    var chainLog = [];

    for (var ei = 0; ei < events.length; ei++) {
      var ev = events[ei];
      var prevChain = chain;
      if (ev.positive) {
        chain++;
        if (chain > maxChain) maxChain = chain;
        chainLog.push({
          type: ev.type, label: ev.label, positive: true,
          chainBefore: prevChain, chainAfter: chain,
          delta: '+1 → ' + chain
        });
      } else {
        var penalty = getChainPenalty(ev.weight || 0);
        var chainBefore = chain;
        chain = Math.max(0, chain - penalty);
        totalPenalty += penalty;
        warnings.push({
          time: ev.time,
          reason: ev.breakReason || 'Отклонение',
          label: ev.label,
          chainBefore: chainBefore,
          chainAfter: chain,
          penalty: penalty,
          weight: +(ev.weight || 0).toFixed(2)
        });
        chainLog.push({
          type: ev.type, label: ev.label, positive: false,
          chainBefore: chainBefore, chainAfter: chain,
          delta: '-' + penalty + ' → ' + chain + ' (weight=' + (ev.weight || 0).toFixed(2) + ', severity=' + (penalty === 3 ? 'SEVERE' : penalty === 2 ? 'MEDIUM' : 'MINOR') + ')'
        });
      }
    }

    console.info('[HEYS.cascade] ⛓️ Chain algorithm (v2.2.0 soft degradation):', chainLog);
    console.info('[HEYS.cascade] 🔗 Chain result:', {
      finalChainLength: chain,
      maxChainToday: maxChain,
      warningsCount: warnings.length,
      totalPenalty: totalPenalty,
      model: 'v2.2.0 soft chain (penalty 1/2/3 by severity)',
      warnings: warnings.map(function (w) { return { time: w.time, reason: w.reason, penalty: w.penalty, chain: w.chainBefore + '→' + w.chainAfter }; })
    });

    // ── ШАГ 16: Определение состояния (v2.2.0 score-driven) ───
    // v2.2.0: состояние определяется ТОЛЬКО по score. warnings влияют на score
    // (негативные веса уже учтены), но НЕ форсируют RECOVERY/BROKEN.
    // RECOVERY = слабый импульс (0 < score < BUILDING)
    // BROKEN = негативы перевесили (score ≤ 0)
    var state = STATES.EMPTY;

    if (events.length === 0) {
      state = STATES.EMPTY;
    } else if (score >= SCORE_THRESHOLDS.STRONG) {
      state = STATES.STRONG;
    } else if (score >= SCORE_THRESHOLDS.GROWING) {
      state = STATES.GROWING;
    } else if (score >= SCORE_THRESHOLDS.BUILDING) {
      state = STATES.BUILDING;
    } else if (score > 0) {
      state = STATES.RECOVERY;
    } else {
      state = STATES.BROKEN;
    }

    console.info('[HEYS.cascade] 🏷️ State determination (v2.2.0 score-driven):', {
      eventsLength: events.length,
      warningsCount: warnings.length,
      chain: chain,
      score: +score.toFixed(2),
      thresholds: { STRONG: SCORE_THRESHOLDS.STRONG, GROWING: SCORE_THRESHOLDS.GROWING, BUILDING: SCORE_THRESHOLDS.BUILDING },
      model: 'score-only (no hasBreak override)',
      detectedState: state
    });

    // ── ШАГ 17: Post-training window ──────────────────────
    var lastTraining = trainings.length > 0 ? trainings[trainings.length - 1] : null;
    var postTrainingWindow = lastTraining && lastTraining.time ? isWithinHours(lastTraining.time, 2) : false;

    console.info('[HEYS.cascade] ⏰ Post-training window:', {
      lastTrainingTime: (lastTraining && lastTraining.time) || null,
      windowActive: postTrainingWindow,
      windowDuration: '2ч после последней тренировки',
      effect: postTrainingWindow ? 'Пул: ANTI_LICENSING' : 'Обычный пул состояния'
    });

    // ── ШАГ 18: Выбор сообщения ──────────────────────────
    var messagePoolKey;
    if (postTrainingWindow && state !== STATES.BROKEN && state !== STATES.EMPTY) {
      messagePoolKey = 'ANTI_LICENSING';
    } else {
      messagePoolKey = state;
    }
    var messagePool = MESSAGES[messagePoolKey] || MESSAGES.BUILDING;
    var message = pickMessage(messagePool, messagePoolKey);

    // ── ШАГ 19: Momentum score (по score) ───────────────
    // v2.1.0: прогресс-бар = взвешенный score / MOMENTUM_TARGET (12.0)
    var momentumScore = Math.min(1, Math.max(0, score) / MOMENTUM_TARGET);

    console.info('[HEYS.cascade] 📊 Momentum score:', {
      formula: 'min(1, max(0, score) / ' + MOMENTUM_TARGET + ')',
      score: +score.toFixed(2),
      target: MOMENTUM_TARGET,
      momentumScore: +momentumScore.toFixed(3),
      progressBarPercent: Math.round(momentumScore * 100) + '%'
    });

    // ── ШАГ 20: Next step hint ────────────────────────────
    var nextStepHint = null;
    if (state !== STATES.EMPTY) {
      var hasMeal = events.some(function (e) { return e.type === 'meal'; });
      var hasTraining = events.some(function (e) { return e.type === 'training'; });
      var hasSleepEv = events.some(function (e) { return e.type === 'sleep'; });
      var hasCheckinEv = events.some(function (e) { return e.type === 'checkin'; });
      var hasMeasEv = events.some(function (e) { return e.type === 'measurements'; });

      if (!hasMeal && currentHour < 20) {
        nextStepHint = 'Добавь первый приём пищи';
      } else if (!hasTraining && currentHour >= 6 && currentHour < 20) {
        nextStepHint = 'Тренировка или прогулка добавят звено в цепочку';
      } else if (!hasCheckinEv && currentHour < 11) {
        nextStepHint = 'Взвесься утром — это поможет отслеживать прогресс';
      } else if (!hasMeasEv && currentHour < 11) {
        nextStepHint = 'Сними замеры — это повысит точность анализа';
      } else if (!hasSleepEv) {
        nextStepHint = 'Зафиксируй время засыпания для анализа сна';
      } else if (currentHour < 21 && chain > 0) {
        nextStepHint = 'Продолжай — следующее решение усилит цепочку';
      }

      console.info('[HEYS.cascade] 💡 Next step hint:', {
        hasMeal: hasMeal, hasTraining: hasTraining, hasSleep: hasSleepEv,
        hasCheckin: hasCheckinEv, hasMeasurements: hasMeasEv,
        currentHour: currentHour, hint: nextStepHint
      });
    }

    // ── ИТОГОВЫЙ РЕЗУЛЬТАТ ────────────────────────────────
    var elapsed = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0;

    console.info('[HEYS.cascade] ✅ computeCascadeState v2.2.0 DONE:', {
      state: state,
      score: +score.toFixed(2),
      chainLength: chain,
      maxChainToday: maxChain,
      momentumScore: +momentumScore.toFixed(2),
      progressPercent: Math.round(momentumScore * 100) + '%',
      eventsCount: events.length,
      warningsCount: warnings.length,
      totalPenalty: totalPenalty,
      chainModel: 'soft (penalty 1/2/3)',
      stateModel: 'score-driven',
      postTrainingWindow: postTrainingWindow,
      message: message.short,
      nextStepHint: nextStepHint,
      elapsed: elapsed.toFixed(2) + 'ms'
    });
    console.info('[HEYS.cascade] 🧬 v2.2.0 subsystems:', {
      dayType: dayType,
      synergies: synergies.length > 0
        ? synergies.map(function (s) { return s.name + ' (+' + s.bonus + ': ' + s.reason + ')'; })
        : '(none)',
      synergiesBonus: +synergies.reduce(function (s, x) { return s + x.bonus; }, 0).toFixed(2),
      confidenceLayer: {
        avg: +avgConfidence.toFixed(2),
        quality: avgConfidence >= 0.8 ? 'HIGH' : avgConfidence >= 0.5 ? 'MEDIUM' : 'LOW',
        perFactor: confidenceMap
      },
      chainModel: {
        type: 'soft degradation',
        penalties: { MINOR: CHAIN_PENALTY.MINOR, MEDIUM: CHAIN_PENALTY.MEDIUM, SEVERE: CHAIN_PENALTY.SEVERE },
        thresholds: CHAIN_PENALTY_THRESHOLDS,
        totalPenalty: totalPenalty,
        warningsCount: warnings.length
      },
      stateModel: 'score-only (STRONG≥8, GROWING≥4.5, BUILDING≥1.5, RECOVERY>0, BROKEN≤0)',
      scoringMethod: 'continuous (sigmoid/bell-curve/log2/tanh)',
      personalBaselines: '14-day rolling median',
      thresholds: { STRONG: SCORE_THRESHOLDS.STRONG, GROWING: SCORE_THRESHOLDS.GROWING, BUILDING: SCORE_THRESHOLDS.BUILDING, MOMENTUM_TARGET: MOMENTUM_TARGET }
    });
    console.info('[HEYS.cascade] ─────────────────────────────────────────────');

    return {
      events: events,
      chainLength: chain,
      maxChainToday: maxChain,
      score: +score.toFixed(2),
      warnings: warnings,
      state: state,
      momentumScore: momentumScore,
      postTrainingWindow: postTrainingWindow,
      message: message,
      nextStepHint: nextStepHint,
      dayType: dayType,
      synergies: synergies,
      confidence: confidenceMap,
      avgConfidence: +avgConfidence.toFixed(2),
      rawWeights: rawWeights
    };
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: ChainDots
  // ─────────────────────────────────────────────────────

  function ChainDots(props) {
    var events = props.events;
    if (!events || events.length === 0) return null;

    var children = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var isLast = i === events.length - 1;
      var dotClass = [
        'cascade-dot',
        'cascade-dot--' + ev.type,
        !ev.positive ? 'cascade-dot--warning' : null,
        (isLast && ev.positive) ? 'cascade-dot--latest' : null
      ].filter(Boolean).join(' ');

      if (i > 0) {
        children.push(React.createElement('div', {
          key: 'conn-' + i,
          className: 'cascade-dot-connector' + (!ev.positive ? ' cascade-dot-connector--warning' : '')
        }));
      }
      children.push(React.createElement('div', {
        key: 'dot-' + i,
        className: dotClass,
        title: (ev.time ? formatTimeShort(ev.time) + ' · ' : '') + ev.label
      }));
    }

    return React.createElement('div', { className: 'cascade-chain-dots' }, children);
  }

  // ─────────────────────────────────────────────────────
  // SUB-КОМПОНЕНТ: CascadeTimeline
  // ─────────────────────────────────────────────────────

  function CascadeTimeline(props) {
    var events = props.events;
    var nextStepHint = props.nextStepHint;

    var rows = events.map(function (ev, i) {
      return React.createElement('div', {
        key: i,
        className: 'cascade-timeline-row cascade-timeline-row--' + (ev.positive ? 'positive' : 'warning')
      },
        React.createElement('span', { className: 'cascade-timeline-icon' }, ev.icon),
        React.createElement('span', { className: 'cascade-timeline-time' },
          ev.time ? formatTimeShort(ev.time) : '—'
        ),
        React.createElement('span', { className: 'cascade-timeline-label' }, ev.label),
        React.createElement('span', { className: 'cascade-timeline-badge' },
          ev.positive ? '✓' : (ev.breakReason || '⚠')
        )
      );
    });

    if (nextStepHint) {
      rows.push(React.createElement('div', { key: 'next', className: 'cascade-next-step' },
        React.createElement('span', { className: 'cascade-next-step-icon' }, '💡'),
        React.createElement('span', null, nextStepHint)
      ));
    }

    return React.createElement('div', { className: 'cascade-timeline' }, rows);
  }

  // ─────────────────────────────────────────────────────
  // ГЛАВНЫЙ КОМПОНЕНТ: CascadeCard (standalone, no deps)
  // Полностью независим от HEYS.ExpandableCard.
  // Управляет expanded через React.useState.
  // ─────────────────────────────────────────────────────

  function CascadeCard(props) {
    var events = props.events;
    var chainLength = props.chainLength;
    var maxChainToday = props.maxChainToday;
    var state = props.state;
    var momentumScore = props.momentumScore;
    var postTrainingWindow = props.postTrainingWindow;
    var message = props.message;
    var nextStepHint = props.nextStepHint;
    var warnings = props.warnings;

    var expandedState = React.useState(false);
    var expanded = expandedState[0];
    var setExpanded = expandedState[1];

    var config = STATE_CONFIG[state] || STATE_CONFIG.EMPTY;
    var badgeText = chainLength > 0 ? (chainLength + ' ⚡') : '—';
    var progressPct = Math.round(momentumScore * 100);

    // Throttle render log — once per session (same strategy as MealRec P1 fix)
    if (!window.__heysLoggedCascadeRender) {
      window.__heysLoggedCascadeRender = true;
      console.info('[HEYS.cascade] ✅ CascadeCard rendered:', {
        state: state,
        chainLength: chainLength,
        maxChainToday: maxChainToday,
        progressPct: progressPct + '%',
        eventsCount: events.length
      });
    }

    return React.createElement('div', {
      className: 'cascade-card cascade-card--' + state.toLowerCase(),
      style: { borderLeft: '3px solid ' + config.color }
    },

      // ── Header (кликабельный toggle) ─────────────────
      React.createElement('button', {
        className: 'cascade-card__header',
        onClick: function () {
          var next = !expanded;
          setExpanded(next);
          console.info('[HEYS.cascade] 🔄 Toggle expanded:', next, '| state:', state);
        },
        'aria-expanded': expanded,
        'aria-label': 'Развернуть позитивный каскад'
      },

        // Заголовок
        React.createElement('div', { className: 'cascade-card__title-row' },
          React.createElement('span', { className: 'cascade-card__icon' }, config.icon),
          React.createElement('span', { className: 'cascade-card__title' }, 'Ваш позитивный каскад'),
          chainLength > 0 && React.createElement('span', {
            className: 'cascade-card__badge',
            style: { background: config.color }
          }, badgeText)
        ),

        // Подзаголовок / сообщение
        React.createElement('div', { className: 'cascade-card__subtitle' },
          (message && message.short) || config.label
        ),

        // Хинт anti-licensing (2ч после тренировки)
        postTrainingWindow && React.createElement('div', {
          className: 'cascade-card__hint cascade-card__hint--training'
        }, '⏰ Окно после тренировки — выбери качество, а не количество'),

        // Цепочка точек (свёрнутое)
        !expanded && React.createElement(ChainDots, { events: events }),

        // Прогресс-бар
        React.createElement('div', { className: 'cascade-card__progress-track' },
          React.createElement('div', {
            className: 'cascade-card__progress-bar',
            style: { width: progressPct + '%', background: config.color }
          })
        ),

        // Chevron
        React.createElement('span', {
          className: 'cascade-card__chevron' + (expanded ? ' cascade-card__chevron--open' : '')
        }, '›')
      ),

      // ── Развёрнутый контент ──────────────────────────
      expanded && React.createElement('div', { className: 'cascade-card__body' },
        React.createElement(ChainDots, { events: events }),
        React.createElement(CascadeTimeline, {
          events: events,
          nextStepHint: nextStepHint
        }),
        warnings && warnings.length > 0 && React.createElement('div', { className: 'cascade-card__breaks-info' },
          React.createElement('span', { className: 'cascade-card__breaks-label' },
            '⚠️ Отклонений: ' + warnings.length + ' (−' + warnings.reduce(function (s, w) { return s + w.penalty; }, 0) + ' к цепочке)'
          )
        ),
        React.createElement('div', { className: 'cascade-card__stats' },
          React.createElement('span', { className: 'cascade-card__stat' },
            '🏆 Макс. цепочка: ', React.createElement('strong', null, maxChainToday)
          ),
          React.createElement('span', { className: 'cascade-card__stat' },
            '⚡ Импульс: ', React.createElement('strong', null, progressPct + '%')
          )
        )
      )
    );
  }

  // ─────────────────────────────────────────────────────
  // ТОЧКА ВХОДА: renderCard
  // ─────────────────────────────────────────────────────

  // P2-cascade fix: React.memo to skip re-render when cascade data hasn't changed
  var MemoizedCascadeCard = React.memo(CascadeCard, function (prev, next) {
    return prev.state === next.state &&
      prev.score === next.score &&
      prev.chainLength === next.chainLength &&
      prev.maxChainToday === next.maxChainToday &&
      prev.momentumScore === next.momentumScore &&
      prev.nextStepHint === next.nextStepHint &&
      prev.postTrainingWindow === next.postTrainingWindow &&
      (prev.events && prev.events.length) === (next.events && next.events.length);
  });

  // P1-cascade fix: throttle renderCard log to once per session (mirrors mealRec P1)
  var _cascadeRenderCount = 0;
  var _cascadeCache = {
    signature: null,
    result: null,
    hits: 0,
    misses: 0
  };

  function renderCard(params) {
    var day = params && params.day;
    var dayTot = params && params.dayTot;
    var normAbs = params && params.normAbs;
    var prof = params && params.prof;
    var pIndex = params && params.pIndex;

    _cascadeRenderCount++;
    // v5.0.2: log on 1st call only; suppress counter capped at 1 summary (at 50).
    // 40-50 calls per sync is architectural (multiple setProducts listeners) — all cache HITs, no DOM updates.
    if (_cascadeRenderCount === 1) {
      console.info('[HEYS.cascade] 📌 renderCard called:', {
        hasDay: !!day,
        hasMeals: !!(day && day.meals && day.meals.length),
        hasTrainings: !!(day && day.trainings && day.trainings.length),
        water: (day && day.water) || null,
        steps: (day && day.steps) || null
      });
    } else if (_cascadeRenderCount === 50) {
      console.info('[HEYS.cascade] 📌 renderCard hot-path: ' + _cascadeRenderCount + ' calls (cache active, no recompute)');
    }

    if (!day) {
      console.warn('[HEYS.cascade] ⚠️ No day data — skipping render');
      return null;
    }

    var hasMeals = day.meals && day.meals.length > 0;
    var hasTrainings = day.trainings && day.trainings.length > 0;
    var hasSteps = (day.steps || 0) > 0;
    var hasHousehold = (day.householdMin || 0) > 0;
    var hasWeightCheckin = (day.weightMorning || 0) > 0;
    var hasSleepData = !!(day.sleepStart);
    var hasMeasData = !!(day.measurements && Object.keys(day.measurements).some(function (k) { return day.measurements[k] > 0; }));
    var hasSupplements = !!(day.supplementsTaken && day.supplementsTaken.length > 0);

    if (!hasMeals && !hasTrainings && !hasSteps && !hasHousehold && !hasWeightCheckin && !hasSleepData && !hasMeasData && !hasSupplements) {
      console.info('[HEYS.cascade] ⏭️ No activity data yet — card not shown');
      return null;
    }

    var signature = buildInputSignature(day, normAbs, prof);
    var cascadeState;

    if (_cascadeCache.signature === signature && _cascadeCache.result) {
      _cascadeCache.hits++;
      cascadeState = _cascadeCache.result;
      if (_cascadeCache.hits === 1 || _cascadeCache.hits % 25 === 0) {
        console.info('[HEYS.cascade] ⚡ Cache HIT (compute skipped):', {
          hits: _cascadeCache.hits,
          misses: _cascadeCache.misses,
          state: cascadeState.state,
          chainLength: cascadeState.chainLength
        });
      }
    } else {
      _cascadeCache.misses++;
      cascadeState = computeCascadeState(day, dayTot, normAbs, prof, pIndex);
      _cascadeCache.signature = signature;
      _cascadeCache.result = cascadeState;
      console.info('[HEYS.cascade] 🧠 Cache MISS (recompute):', {
        hits: _cascadeCache.hits,
        misses: _cascadeCache.misses,
        state: cascadeState.state,
        chainLength: cascadeState.chainLength
      });
    }

    if (cascadeState.state === STATES.EMPTY) {
      console.info('[HEYS.cascade] ⏭️ State = EMPTY — card not shown');
      return null;
    }

    var renderKey = [cascadeState.state, cascadeState.chainLength, cascadeState.maxChainToday, cascadeState.momentumScore].join('|');
    if (window.__heysCascadeLastRenderKey !== renderKey) {
      window.__heysCascadeLastRenderKey = renderKey;
      console.info('[HEYS.cascade] 🚀 Rendering CascadeCard, state:', cascadeState.state);
    }
    return React.createElement(MemoizedCascadeCard, cascadeState);
  }

  // ─────────────────────────────────────────────────────
  // ЭКСПОРТ
  // ─────────────────────────────────────────────────────

  // v5.0.2: Инвалидировать кэш при cascade batch update (нутриенты изменились)
  if (typeof window !== 'undefined' && !window.__heysCascadeCacheInvalidator) {
    window.__heysCascadeCacheInvalidator = true;
    window.addEventListener('heys:mealitems-cascaded', function () {
      _cascadeCache.signature = null;
      console.info('[HEYS.cascade] 🔄 Cache invalidated by cascade-batch (nutrients updated)');
    });
  }

  HEYS.CascadeCard = {
    computeCascadeState: computeCascadeState,
    renderCard: renderCard,
    STATES: STATES,
    STATE_CONFIG: STATE_CONFIG,
    MESSAGES: MESSAGES,
    VERSION: '2.2.0'
  };

  console.info('[HEYS.cascade] ✅ Module loaded v2.2.0 | Soft chain degradation + score-driven states | Scientific scoring: continuous functions, personal baselines, cross-factor synergies | Filter: [HEYS.cascade]');

})(typeof window !== 'undefined' ? window : global);
