// heys_cascade_card_v1.js — Cascade Card — «Ваш позитивный каскад»
// Standalone компонент. Визуализация цепочки здоровых решений в реальном времени.
// v2.0.0 | 2026-02-19 — 10-factor behavioral scoring (meals, household, training, sleep, checkin, measurements, steps, vitamins, insulin)
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
  // СИСТЕМА ВЕСОВ v2.0.0 — 10 поведенческих факторов
  // Каждый фактор вносит взвешенный вклад в score.
  // score определяет состояние и прогресс-бар.
  // chain (стрик) остаётся для визуального таймлайна.
  // Хороший день: 3 хор.еды(3.0) + трен60(2.5) + сон7ч(1.0) + онтайм(1.0) + шаги100(1.0) ≈ 8.5
  // Отличный: 3 отл.еды(4.5) + трен60(2.5) + сон(2.0) + шаги(1.0) + чекин(0.5) ≈ 10.5
  // ─────────────────────────────────────────────────────

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

  const SCORE_THRESHOLDS = {
    STRONG: 7.0,    // Мощный день
    GROWING: 4.0,   // Каскад растёт
    BUILDING: 1.5   // Начало
  };

  const MOMENTUM_TARGET = 10.0; // score при 100% прогресс-бара

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

    console.info('[HEYS.cascade] ─── computeCascadeState START ───────────────');
    console.info('[HEYS.cascade] 📥 Input data:', {
      hasMeals: !!(day && day.meals && day.meals.length),
      mealsCount: (day && day.meals && day.meals.length) || 0,
      hasTrainings: !!(day && day.trainings && day.trainings.length),
      trainingsCount: (day && day.trainings && day.trainings.length) || 0,
      water: (day && day.water) || 0,
      steps: (day && day.steps) || 0,
      hasNormAbs: !!normAbs,
      kcalNorm: normAbs ? normAbs.kcal : null,
      hasProf: !!prof,
      waterNorm: prof ? prof.water_norm : null,
      stepsGoal: prof ? (prof.stepsGoal || prof.steps_goal) : null,
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

    // ── ШАГ 1: Бытовая активность (householdMin) ────────
    var householdMin = (day && day.householdMin) || 0;
    if (householdMin > 0) {
      var householdWeight = householdMin >= 60 ? EVENT_WEIGHTS.household_high
        : householdMin >= 30 ? EVENT_WEIGHTS.household_mid
          : householdMin >= 10 ? EVENT_WEIGHTS.household_low
            : 0.0;
      if (householdWeight > 0) {
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
        console.info('[HEYS.cascade] 🏠 [EVENT] household:', { householdMin: householdMin, weight: householdWeight });
      }
    } else {
      var prevDaysHH = getPreviousDays(7);
      var houseStreak = 0;
      for (var ph = 0; ph < prevDaysHH.length; ph++) {
        if (!prevDaysHH[ph] || !(prevDaysHH[ph].householdMin > 0)) houseStreak++;
        else break;
      }
      if (houseStreak > 2) {
        var hPenalty = Math.max(-0.3, -0.1 * (houseStreak - 2));
        score += hPenalty;
        console.info('[HEYS.cascade] 🏠 Household streak penalty:', { streakDays: houseStreak, penalty: hPenalty });
      } else {
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

      // ─ Жёсткие ограничения (контекстуальные нарушения) ─
      var positive = !overNorm && !hasHarm && !isLate;
      var breakReason = overNorm ? 'Перебор ккал' : (hasHarm ? 'Вредный продукт' : (isLate ? 'Поздний приём' : null));

      // ─ Качество приёма через getMealQualityScore (0–100) ─
      var mealQS = null;
      var mealScoringFn = (HEYS.mealScoring && typeof HEYS.mealScoring.getMealQualityScore === 'function')
        ? HEYS.mealScoring.getMealQualityScore.bind(HEYS.mealScoring)
        : (typeof HEYS.getMealQualityScore === 'function' ? HEYS.getMealQualityScore : null);

      if (mealScoringFn && pIndex) {
        try {
          mealQS = mealScoringFn(meal, null, normKcal || 2000, pIndex, null);
        } catch (err) {
          // Неблокирующий сбой — продолжаем с фолбэком
        }
      }

      // ─ Вес: quality score (0–100) → шкала каскада ─
      var mealWeight;
      var qualityGrade = null;

      if (mealQS && mealQS.score != null) {
        var qs = mealQS.score; // 0–100
        if (qs >= 80) { mealWeight = 1.5; qualityGrade = 'excellent'; }
        else if (qs >= 60) { mealWeight = 1.0; qualityGrade = 'good'; }
        else if (qs >= 40) { mealWeight = 0.5; qualityGrade = 'ok'; }
        else if (qs >= 20) { mealWeight = 0.0; qualityGrade = 'poor'; }
        else { mealWeight = -0.5; qualityGrade = 'bad'; }

        // Плохое качество → разрыв цепочки (визуально)
        if ((qualityGrade === 'poor' || qualityGrade === 'bad') && positive) {
          positive = false;
          breakReason = breakReason || (qualityGrade === 'bad' ? 'Низкое качество' : 'Слабый приём');
        }
        // Жёсткие нарушения всегда перекрывают quality weight (-1.0)
        if (!positive && mealWeight > EVENT_WEIGHTS.meal_negative) {
          mealWeight = EVENT_WEIGHTS.meal_negative;
        }
      } else {
        // Фолбэк — прежняя двоичная логика
        mealWeight = positive ? EVENT_WEIGHTS.meal_positive : EVENT_WEIGHTS.meal_negative;
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
        console.info('[HEYS.cascade] 🎯 Meal quality (' + getMealLabel(meal, i) + '): score=' + mealQS.score + ' grade=' + qualityGrade + ' weight=' + mealWeight + ' color=' + mealQS.color);
      } else {
        console.warn('[HEYS.cascade] ⚠️ getMealQualityScore недоступен (' + getMealLabel(meal, i) + ') → fallback weight=' + mealWeight + ' | HEYS.mealScoring=' + (typeof (HEYS.mealScoring && HEYS.mealScoring.getMealQualityScore)) + ' pIndex=' + (!!pIndex));
      }

      console.info('[HEYS.cascade] 🍽️ [MEAL ' + (i + 1) + '/' + meals.length + '] ' + getMealLabel(meal, i) + ':', {
        time: (meal && meal.time) || null,
        mealKcal: Math.round(mealKcal),
        cumulativeKcal: Math.round(cumulativeKcal),
        normKcal: Math.round(normKcal),
        cumulativeRatio: +cumulativeRatio.toFixed(2),
        overNorm: overNorm,
        hasHarm: hasHarm,
        isLate: isLate,
        positive: positive,
        breakReason: breakReason,
        quality: mealQS
          ? { score: mealQS.score, grade: qualityGrade, color: mealQS.color }
          : '(getMealQualityScore недоступен)',
        weight: mealWeight
      });
    });

    // ── ШАГ 3: Тренировки (длительность + стрик-штраф) ──
    console.info('[HEYS.cascade] 💪 Processing', trainings.length, 'trainings...');

    if (trainings.length > 0) {
      trainings.forEach(function (tr, ti) {
        var timeMins = parseTime(tr && tr.time);
        var dur = 0;
        if (tr && tr.z && Array.isArray(tr.z)) {
          dur = tr.z.reduce(function (a, b) { return a + (b || 0); }, 0);
        }
        if (!dur && tr && tr.duration) dur = tr.duration;
        if (!dur && tr && tr.type) {
          var typeDefaults = { cardio: 40, strength: 50, hiit: 30, yoga: 60, stretching: 30 };
          dur = typeDefaults[tr.type] || 40;
        }
        if (!dur) dur = 40;
        var trainingWeight = dur >= 60 ? EVENT_WEIGHTS.training_60plus
          : dur >= 45 ? EVENT_WEIGHTS.training_45
            : dur >= 30 ? EVENT_WEIGHTS.training_30
              : dur >= 15 ? EVENT_WEIGHTS.training_15
                : EVENT_WEIGHTS.training_short;
        score += trainingWeight;
        events.push({
          type: 'training',
          time: (tr && tr.time) || null,
          positive: true,
          icon: EVENT_ICONS.training,
          label: 'Тренировка ' + dur + ' мин',
          sortKey: timeMins !== null ? timeMins : 700,
          weight: trainingWeight
        });
        console.info('[HEYS.cascade] 💪 [TRAINING ' + (ti + 1) + '/' + trainings.length + ']:', {
          time: (tr && tr.time) || null, duration: dur, weight: trainingWeight
        });
      });
    } else {
      var prevDaysTR = getPreviousDays(7);
      var trainStreak = 0;
      for (var pt = 0; pt < prevDaysTR.length; pt++) {
        if (!prevDaysTR[pt] || !(prevDaysTR[pt].trainings && prevDaysTR[pt].trainings.length > 0)) trainStreak++;
        else break;
      }
      if (trainStreak > 2) {
        var tPenalty = Math.max(-0.5, -0.15 * (trainStreak - 2));
        score += tPenalty;
        console.info('[HEYS.cascade] 💪 Training streak penalty:', { streakDays: trainStreak, penalty: tPenalty });
      } else {
        console.info('[HEYS.cascade] 💪 No trainings today, streak=' + trainStreak + ' (no penalty yet)');
      }
    }

    // ── ШАГ 4: Засыпание (sleepStart) ───────────────────
    var sleepStart = (day && day.sleepStart) || '';
    if (sleepStart) {
      var sleepMins = parseTime(sleepStart);
      if (sleepMins !== null && sleepMins < 360) sleepMins += 1440; // after midnight
      var sleepOnsetWeight = 0;
      var sleepOnsetLabel = '';
      if (sleepMins !== null) {
        if (sleepMins <= 1320) { sleepOnsetWeight = EVENT_WEIGHTS.sleep_onset_good; sleepOnsetLabel = 'Засыпание до 22:00'; }
        else if (sleepMins <= 1380) { sleepOnsetWeight = EVENT_WEIGHTS.sleep_onset_ok; sleepOnsetLabel = 'Засыпание до 23:00'; }
        else if (sleepMins <= 1440) { sleepOnsetWeight = EVENT_WEIGHTS.sleep_onset_neutral; sleepOnsetLabel = 'Засыпание до 00:00'; }
        else if (sleepMins <= 1500) { sleepOnsetWeight = EVENT_WEIGHTS.sleep_onset_bad; sleepOnsetLabel = 'Засыпание до 01:00'; }
        else if (sleepMins <= 1560) { sleepOnsetWeight = EVENT_WEIGHTS.sleep_onset_worse; sleepOnsetLabel = 'Засыпание до 02:00'; }
        else { sleepOnsetWeight = EVENT_WEIGHTS.sleep_onset_worst; sleepOnsetLabel = 'Засыпание после 02:00'; }
        score += sleepOnsetWeight;
        events.push({
          type: 'sleep',
          time: sleepStart,
          positive: sleepOnsetWeight >= 0,
          icon: EVENT_ICONS.sleep,
          label: sleepOnsetLabel,
          sortKey: 1300,
          weight: sleepOnsetWeight
        });
        console.info('[HEYS.cascade] 😴 Sleep onset:', { sleepStart: sleepStart, sleepMins: sleepMins, weight: sleepOnsetWeight });
      }
    } else {
      console.info('[HEYS.cascade] 😴 No sleepStart data — ШАГ 4 skipped');
    }

    // ── ШАГ 5: Продолжительность сна (sleepHours) ───────
    var sleepHours = (day && day.sleepHours) || 0;
    if (!sleepHours && (day && day.sleepStart) && (day && day.sleepEnd)) {
      var sm = parseTime(day.sleepStart); var em = parseTime(day.sleepEnd);
      if (sm !== null && em !== null) {
        if (em < sm) em += 1440;
        sleepHours = (em - sm) / 60;
      }
    }
    if (sleepHours > 0) {
      var sleepDurWeight = 0;
      if (sleepHours >= 7 && sleepHours <= 8.5) sleepDurWeight = EVENT_WEIGHTS.sleep_dur_ideal;
      else if ((sleepHours >= 6 && sleepHours < 7) || (sleepHours > 8.5 && sleepHours <= 9.5)) sleepDurWeight = sleepHours < 7 ? EVENT_WEIGHTS.sleep_dur_ok : EVENT_WEIGHTS.sleep_dur_ok;
      else if (sleepHours >= 5 && sleepHours < 6) sleepDurWeight = EVENT_WEIGHTS.sleep_dur_low;
      else if (sleepHours > 9.5 && sleepHours <= 10.5) sleepDurWeight = EVENT_WEIGHTS.sleep_dur_over;
      else if (sleepHours < 5) sleepDurWeight = EVENT_WEIGHTS.sleep_dur_very_low;
      else sleepDurWeight = EVENT_WEIGHTS.sleep_dur_too_long;
      score += sleepDurWeight;
      console.info('[HEYS.cascade] 😴 Sleep duration:', { sleepHours: +sleepHours.toFixed(1), weight: sleepDurWeight });
    } else {
      console.info('[HEYS.cascade] 😴 No sleepHours data — ШАГ 5 skipped');
    }

    // ── ШАГ 6: Шаги (ratio-based) ───────────────────────
    var stepsGoal = (prof && (prof.stepsGoal || prof.steps_goal)) || 7000;
    var stepsRatio = steps > 0 ? steps / stepsGoal : 0;
    var stepsWeight = 0;
    if (steps > 0) {
      if (stepsRatio >= 1.2) stepsWeight = EVENT_WEIGHTS.steps_great;
      else if (stepsRatio >= 1.0) stepsWeight = EVENT_WEIGHTS.steps_full;
      else if (stepsRatio >= 0.7) stepsWeight = EVENT_WEIGHTS.steps_partial;
      else if (stepsRatio >= 0.5) stepsWeight = EVENT_WEIGHTS.steps_half;
      else stepsWeight = EVENT_WEIGHTS.steps_low;
      score += stepsWeight;
      var stepsLabel = stepsRatio >= 1.2
        ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (отлично!)')
        : stepsRatio >= 1.0
          ? ('Шаги — ' + Math.round(steps / 1000 * 10) / 10 + 'k (цель)')
          : ('Шаги — ' + Math.round(stepsRatio * 100) + '%');
      events.push({
        type: 'steps',
        time: null,
        positive: stepsWeight > 0,
        icon: EVENT_ICONS.steps,
        label: stepsLabel,
        sortKey: 1100,
        weight: stepsWeight
      });
      console.info('[HEYS.cascade] 🚶 Steps:', { steps: steps, goal: stepsGoal, ratio: +stepsRatio.toFixed(2), weight: stepsWeight });
    } else {
      console.info('[HEYS.cascade] 🚶 No steps data — ШАГ 6 skipped');
    }

    // ── ШАГ 7: Чекин веса (weightMorning) ───────────────
    var weightMorning = (day && day.weightMorning) || 0;
    if (weightMorning > 0) {
      score += EVENT_WEIGHTS.checkin;
      events.push({
        type: 'checkin',
        time: null,
        positive: true,
        icon: EVENT_ICONS.checkin,
        label: 'Чекин веса: ' + weightMorning + ' кг',
        sortKey: 540,
        weight: EVENT_WEIGHTS.checkin
      });
      console.info('[HEYS.cascade] ⚖️ Weight checkin:', { weight: weightMorning, delta: EVENT_WEIGHTS.checkin });
    } else {
      console.info('[HEYS.cascade] ⚖️ No weight checkin today — ШАГ 7 skipped');
    }

    // ── ШАГ 8: Замеры (measurements) ────────────────────
    var measurements = (day && day.measurements) || null;
    var hasMeasToday = measurements && Object.keys(measurements).some(function (k) { return measurements[k] > 0; });
    if (hasMeasToday) {
      score += EVENT_WEIGHTS.measurements_today;
      events.push({
        type: 'measurements',
        time: null,
        positive: true,
        icon: EVENT_ICONS.measurements,
        label: 'Замеры тела',
        sortKey: 545,
        weight: EVENT_WEIGHTS.measurements_today
      });
      console.info('[HEYS.cascade] 📏 Measurements taken today, delta:', EVENT_WEIGHTS.measurements_today);
    } else {
      var prevDaysMeas = getPreviousDays(30);
      var lastMeasDay = -1;
      for (var pm = 0; pm < prevDaysMeas.length; pm++) {
        var pdm = prevDaysMeas[pm];
        if (pdm && pdm.measurements && Object.keys(pdm.measurements).some(function (k) { return pdm.measurements[k] > 0; })) {
          lastMeasDay = pm + 1; break;
        }
      }
      if (lastMeasDay >= 0) {
        var measPenalty = lastMeasDay > 14 ? EVENT_WEIGHTS.measurements_very_old : lastMeasDay > 7 ? EVENT_WEIGHTS.measurements_old : 0;
        if (measPenalty !== 0) {
          score += measPenalty;
          console.info('[HEYS.cascade] 📏 Measurements penalty:', { lastMeasDay: lastMeasDay, delta: measPenalty });
        }
      }
    }

    // ── ШАГ 9: Витамины/добавки (supplements) ───────────
    var suppTaken = (day && day.supplementsTaken) ? day.supplementsTaken.length : 0;
    var suppPlanned = (day && day.supplementsPlanned) || (prof && prof.plannedSupplements) || 0;
    if (suppPlanned > 0) {
      var suppRatio = suppTaken / suppPlanned;
      var suppWeight = suppRatio >= 1 ? EVENT_WEIGHTS.supplements_all
        : suppRatio >= 0.5 ? EVENT_WEIGHTS.supplements_half
          : EVENT_WEIGHTS.supplements_poor;
      score += suppWeight;
      events.push({
        type: 'supplements',
        time: null,
        positive: suppWeight > 0,
        icon: EVENT_ICONS.supplements,
        label: suppRatio >= 1 ? 'Добавки: всё' : ('Добавки: ' + suppTaken + '/' + suppPlanned),
        sortKey: 550,
        weight: suppWeight
      });
      console.info('[HEYS.cascade] 💊 Supplements:', { taken: suppTaken, planned: suppPlanned, ratio: +suppRatio.toFixed(2), weight: suppWeight });
    } else {
      console.info('[HEYS.cascade] 💊 No supplement plan configured — ШАГ 9 skipped');
    }

    // ── ШАГ 10: Инсулиновые волны (InsulinWave) ─────────
    if (meals.length >= 2 && HEYS.InsulinWave && typeof HEYS.InsulinWave.calculate === 'function') {
      try {
        var iw = HEYS.InsulinWave.calculate({
          meals: meals, pIndex: pIndex,
          getProductFromItem: (HEYS.getProductFromItem || function () { return {}; }),
          trainings: trainings, dayData: { profile: prof }
        });
        var overlaps = (iw && iw.overlaps) || [];
        var avgGap = (iw && iw.avgGapToday) || 0;
        var iwScore = 0;
        overlaps.forEach(function (ov) {
          var ovW = ov.severity === 'high' ? EVENT_WEIGHTS.insulin_overlap_high
            : ov.severity === 'medium' ? EVENT_WEIGHTS.insulin_overlap_med
              : EVENT_WEIGHTS.insulin_overlap_low;
          iwScore += ovW;
        });
        iwScore = Math.max(-1.5, iwScore);
        if (avgGap >= 240) iwScore += EVENT_WEIGHTS.insulin_gap_great;
        else if (avgGap >= 180) iwScore += EVENT_WEIGHTS.insulin_gap_good;
        else if (avgGap >= 120) iwScore += EVENT_WEIGHTS.insulin_gap_ok;
        if (iwScore !== 0) {
          score += iwScore;
          console.info('[HEYS.cascade] ⚡ InsulinWave score:', { overlaps: overlaps.length, avgGap: avgGap, delta: iwScore });
        }
      } catch (e) {
        console.warn('[HEYS.cascade] ⚡ InsulinWave error (non-fatal):', e && e.message);
      }
    } else {
      console.info('[HEYS.cascade] ⚡ InsulinWave skipped:', { meals: meals.length, hasModule: !!(HEYS.InsulinWave && HEYS.InsulinWave.calculate) });
    }

    // ── ШАГ 11: Сортировка ───────────────────────────────
    events.sort(function (a, b) { return (a.sortKey || 0) - (b.sortKey || 0); });

    console.info('[HEYS.cascade] 📋 Events sorted (' + events.length + ' total):', events.map(function (e) {
      return { type: e.type, time: e.time, positive: e.positive, label: e.label, sortKey: e.sortKey };
    }));

    // ── ШАГ 12: Алгоритм цепочки ────────────────────────
    var chain = 0;
    var maxChain = 0;
    var breaks = [];
    var hasBreak = false;
    var chainLog = [];

    for (var ei = 0; ei < events.length; ei++) {
      var ev = events[ei];
      var prevChain = chain;
      if (ev.positive) {
        chain++;
        if (chain > maxChain) maxChain = chain;
      } else {
        if (chain > 0) {
          breaks.push({
            time: ev.time,
            reason: ev.breakReason || 'Отклонение',
            label: ev.label,
            chainBefore: chain
          });
        }
        hasBreak = true;
        chain = 0;
      }
      chainLog.push({
        type: ev.type,
        label: ev.label,
        positive: ev.positive,
        chainBefore: prevChain,
        chainAfter: chain,
        delta: ev.positive ? ('+1 → ' + chain) : ('BREAK (was ' + prevChain + ')')
      });
    }

    console.info('[HEYS.cascade] ⛓️ Chain algorithm trace:', chainLog);
    console.info('[HEYS.cascade] 🔗 Chain result:', {
      finalChainLength: chain,
      maxChainToday: maxChain,
      hasBreak: hasBreak,
      breaksCount: breaks.length,
      breaks: breaks.map(function (b) { return { time: b.time, reason: b.reason, chainBefore: b.chainBefore }; })
    });

    // ── ШАГ 13: Определение состояния (по score) ─────────
    // v1.3.0: состояние определяется взвешенным score, а не длиной стрика.
    // chain остаётся для визуального таймлайна (точки, цепочка).
    var state = STATES.EMPTY;
    var positiveScore = Math.max(0, score); // score без учёта штрафов

    if (events.length === 0) {
      state = STATES.EMPTY;
    } else if (hasBreak && positiveScore > 0) {
      state = STATES.RECOVERY;
    } else if (hasBreak && positiveScore <= 0) {
      state = STATES.BROKEN;
    } else if (score >= SCORE_THRESHOLDS.STRONG) {
      state = STATES.STRONG;
    } else if (score >= SCORE_THRESHOLDS.GROWING) {
      state = STATES.GROWING;
    } else if (score >= SCORE_THRESHOLDS.BUILDING) {
      state = STATES.BUILDING;
    }

    console.info('[HEYS.cascade] 🏷️ State determination:', {
      eventsLength: events.length,
      hasBreak: hasBreak,
      chain: chain,
      score: +score.toFixed(2),
      thresholds: { STRONG: SCORE_THRESHOLDS.STRONG, GROWING: SCORE_THRESHOLDS.GROWING, BUILDING: SCORE_THRESHOLDS.BUILDING },
      detectedState: state
    });

    // ── ШАГ 14: Post-training window ──────────────────────
    var lastTraining = trainings.length > 0 ? trainings[trainings.length - 1] : null;
    var postTrainingWindow = lastTraining && lastTraining.time ? isWithinHours(lastTraining.time, 2) : false;

    console.info('[HEYS.cascade] ⏰ Post-training window:', {
      lastTrainingTime: (lastTraining && lastTraining.time) || null,
      windowActive: postTrainingWindow,
      windowDuration: '2ч после последней тренировки',
      effect: postTrainingWindow ? 'Пул: ANTI_LICENSING' : 'Обычный пул состояния'
    });

    // ── ШАГ 15: Выбор сообщения ──────────────────────────
    var messagePoolKey;
    if (postTrainingWindow && state !== STATES.BROKEN && state !== STATES.EMPTY) {
      messagePoolKey = 'ANTI_LICENSING';
    } else {
      messagePoolKey = state;
    }
    var messagePool = MESSAGES[messagePoolKey] || MESSAGES.BUILDING;
    var message = pickMessage(messagePool, messagePoolKey);

    // ── ШАГ 16: Momentum score (по score) ───────────────
    // v1.3.0: прогресс-бар = взвешенный score / MOMENTUM_TARGET (8.0)
    var momentumScore = Math.min(1, Math.max(0, score) / MOMENTUM_TARGET);

    console.info('[HEYS.cascade] 📊 Momentum score:', {
      formula: 'min(1, max(0, score) / ' + MOMENTUM_TARGET + ')',
      score: +score.toFixed(2),
      target: MOMENTUM_TARGET,
      momentumScore: +momentumScore.toFixed(3),
      progressBarPercent: Math.round(momentumScore * 100) + '%'
    });

    // ── ШАГ 17: Next step hint ────────────────────────────
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

    console.info('[HEYS.cascade] ✅ computeCascadeState DONE:', {
      state: state,
      score: +score.toFixed(2),
      chainLength: chain,
      maxChainToday: maxChain,
      momentumScore: +momentumScore.toFixed(2),
      eventsCount: events.length,
      breaksCount: breaks.length,
      postTrainingWindow: postTrainingWindow,
      message: message.short,
      nextStepHint: nextStepHint,
      elapsed: elapsed.toFixed(2) + 'ms'
    });
    console.info('[HEYS.cascade] ─────────────────────────────────────────────');

    return {
      events: events,
      chainLength: chain,
      maxChainToday: maxChain,
      score: +score.toFixed(2),
      breaks: breaks,
      state: state,
      momentumScore: momentumScore,
      postTrainingWindow: postTrainingWindow,
      message: message,
      nextStepHint: nextStepHint
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
        !ev.positive ? 'cascade-dot--break' : null,
        (isLast && ev.positive) ? 'cascade-dot--latest' : null
      ].filter(Boolean).join(' ');

      if (i > 0) {
        children.push(React.createElement('div', {
          key: 'conn-' + i,
          className: 'cascade-dot-connector' + (!ev.positive ? ' cascade-dot-connector--broken' : '')
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
        className: 'cascade-timeline-row cascade-timeline-row--' + (ev.positive ? 'positive' : 'negative')
      },
        React.createElement('span', { className: 'cascade-timeline-icon' }, ev.icon),
        React.createElement('span', { className: 'cascade-timeline-time' },
          ev.time ? formatTimeShort(ev.time) : '—'
        ),
        React.createElement('span', { className: 'cascade-timeline-label' }, ev.label),
        React.createElement('span', { className: 'cascade-timeline-badge' },
          ev.positive ? '✓' : (ev.breakReason || '✗')
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
    var breaks = props.breaks;

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
        breaks && breaks.length > 0 && React.createElement('div', { className: 'cascade-card__breaks-info' },
          React.createElement('span', { className: 'cascade-card__breaks-label' },
            '⚠️ Разрывов цепочки сегодня: ' + breaks.length
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
    VERSION: '2.0.0'
  };

  console.info('[HEYS.cascade] ✅ Module loaded v2.0.0 | 10-factor behavioral scoring | Filter: [HEYS.cascade]');

})(typeof window !== 'undefined' ? window : global);
