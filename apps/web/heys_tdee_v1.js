// heys_tdee_v1.js — Модуль расчёта затрат калорий (TDEE)
// Единый источник правды для всех компонентов: hero, статистика, недельный отчёт
// v1.1.2 — Добавлено totalHouseholdMin для UI

(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const storeGet = (k, def) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(k, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, def);
        }
      }
      if (U.lsGet) {
        const legacy = U.lsGet(k, def);
        if (legacy !== null && legacy !== undefined) return legacy;
      }
      const raw = localStorage.getItem(k);
      return tryParseStoredValue(raw, def);
    } catch (e) {
      return def;
    }
  };

  // === Вспомогательные функции ===
  const r0 = x => Math.round(+x || 0);

  /**
   * Калории в минуту по MET и весу
   * @param {number} met - Метаболический эквивалент
   * @param {number} weight - Вес в кг
   * @returns {number} ккал/мин
   */
  const kcalPerMin = (met, weight) => (met * 3.5 * weight) / 200;

  /**
   * BMR по формуле Mifflin-St Jeor
   * @param {number} weight - Вес в кг
   * @param {Object} profile - { age, height, gender }
   * @returns {number} ккал/день
   */
  const calcBMR = (weight, profile) => {
    // Overload: calcBMR(profileObject) — если первый аргумент объект, трактуем как профиль.
    // Оживляет делегацию day_utils (звала calcBMR({...prof, weight})) и фиксит
    // pi_calculations/pi_analytics_api/predictive_insights (звали calcBMR(profile) одним аргументом → 0).
    if (weight && typeof weight === 'object') {
      profile = weight;
      weight = +profile.weight || 0;
    }
    const p = profile || {};
    const age = +p.age || 30;
    const height = +p.height || 170;
    // Пол: gender ('Женский') ИЛИ sex ('female') — day_utils нормализует пол в .sex.
    const isFemale = (p.gender === 'Женский') || (p.sex === 'female');
    // Mifflin-St Jeor: 10×вес + 6.25×рост − 5×возраст + (5 муж / −161 жен)
    return r0(10 * (+weight || 0) + 6.25 * height - 5 * age + (isFemale ? -161 : 5));
  };

  /**
   * Калории от шагов
   * @param {number} steps - Количество шагов
   * @param {number} weight - Вес в кг
   * @param {string} sex - Пол
   * @param {number} strideMultiplier - Множитель длины шага (0.7 по умолчанию)
   * @returns {number} ккал
   */
  const stepsKcal = (steps, weight, sex, strideMultiplier = 0.7) => {
    if (!steps || steps <= 0) return 0;
    const height = 170; // Средний рост для расчёта
    const strideLength = height * strideMultiplier / 100; // в метрах
    const distanceKm = (steps * strideLength) / 1000;
    // ~0.5 ккал на кг на км при ходьбе
    return r0(distanceKm * weight * 0.5);
  };

  /**
   * Расчёт калорий от тренировки
   * @param {Object} training - { z: [min1, min2, min3, min4], type, time }
   * @param {number} weight - Вес в кг
   * @param {number[]} mets - MET для каждой зоны [zone1, zone2, zone3, zone4]
   * @returns {number} ккал
   */
  const trainingKcal = (training, weight, mets = [2.5, 6, 8, 10]) => {
    if (!training || !training.z) return 0;
    const kcalMin = mets.map(m => kcalPerMin(m, weight));
    return (training.z || [0, 0, 0, 0]).reduce((sum, min, i) =>
      sum + r0((+min || 0) * (kcalMin[i] || 0)), 0);
  };

  /**
   * Полный расчёт TDEE для дня
   * @param {Object} day - Данные дня { weightMorning, trainings, steps, householdMin, householdActivities, cycleDay, deficitPct }
   * @param {Object} profile - Профиль { weight, age, height, gender, deficitPctTarget }
   * @param {Object} options - { hrZones, includeNDTE, lsGet }
   * @returns {Object} { bmr, actTotal, trainingsKcal, stepsKcal, householdKcal, ndteBoost, tdee, optimum }
   */
  const calculateTDEE = (day, profile, options = {}) => {
    // 🛡️ Null-защита: day и profile могут быть null при инициализации
    const d = day || {};
    const prof = profile || {};

    const lsGet = options.lsGet || storeGet;

    // Вес: из дня или из профиля
    const weight = +d.weightMorning || +prof.weight || 70;

    // MET зоны
    const hrZones = options.hrZones || lsGet('heys_hr_zones', []);
    const zoneMets = hrZones.map(x => +x.MET || 0);
    const mets = [2.5, 6, 8, 10].map((def, i) => zoneMets[i] || def);

    // BMR
    const bmr = calcBMR(weight, prof);

    // Тренировки
    const trainings = (d.trainings && Array.isArray(d.trainings)) ? d.trainings : [];
    const train1k = trainingKcal(trainings[0], weight, mets);
    const train2k = trainingKcal(trainings[1], weight, mets);
    const train3k = trainingKcal(trainings[2], weight, mets);
    const trainingsKcal = train1k + train2k + train3k;

    // Шаги
    const stepsK = stepsKcal(d.steps || 0, weight, prof.gender);

    // Бытовая активность
    const householdActivities = d.householdActivities ||
      (d.householdMin > 0 ? [{ minutes: d.householdMin }] : []);
    const totalHouseholdMin = householdActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
    const householdKcal = r0(totalHouseholdMin * kcalPerMin(2.5, weight));

    // Общая активность
    const actTotal = r0(trainingsKcal + stepsK + householdKcal);

    // 🔬 TEF v1.0.0: используем единый модуль HEYS.TEF с fallback
    let tefData = { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    if (HEYS.TEF) {
      if (options.dayMacros) {
        // Если макросы переданы явно
        tefData = HEYS.TEF.calculateFromMacros(options.dayMacros);
      } else if (d.meals && Array.isArray(d.meals) && options.pIndex) {
        // Расчёт из приёмов пищи через модуль
        const getProduct = (item) => options.pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
        tefData = HEYS.TEF.calculateFromMeals(d.meals, options.pIndex, (item) => getProduct(item));
      }
    } else {
      // Fallback: inline расчёт если модуль не загружен (Westerterp 2004, Tappy 1996)
      let totalProt = 0, totalCarbs = 0, totalFat = 0;
      if (options.dayMacros) {
        totalProt = options.dayMacros.prot || options.dayMacros.protein || 0;
        totalCarbs = options.dayMacros.carbs || options.dayMacros.carbohydrates || 0;
        totalFat = options.dayMacros.fat || options.dayMacros.fats || 0;
      } else if (d.meals && Array.isArray(d.meals) && options.pIndex) {
        d.meals.forEach(meal => {
          (meal.items || []).forEach(item => {
            const g = item.grams || 0;
            const prod = options.pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
            if (prod && g > 0) {
              totalProt += (prod.protein100 || 0) * g / 100;
              totalCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
              totalFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
            }
          });
        });
      }
      const proteinTEF = 0; // NET Atwater: TEF 25% built into 3 kcal/g coefficient
      const carbsTEF = Math.round(totalCarbs * 4 * 0.075);
      const fatTEF = Math.round(totalFat * 9 * 0.015);
      tefData = {
        total: proteinTEF + carbsTEF + fatTEF,
        breakdown: { protein: proteinTEF, carbs: carbsTEF, fat: fatTEF }
      };
    }
    const tefKcal = tefData.total || 0;

    // NDTE (Next-Day Training Effect) — буст от вчерашней тренировки
    let ndteBoost = 0;
    if (options.includeNDTE !== false && HEYS.InsulinWave?.calculateNDTE && HEYS.InsulinWave?.getPreviousDayTrainings && d.date) {
      const prevTrainings = HEYS.InsulinWave.getPreviousDayTrainings(d.date, lsGet);
      if (prevTrainings.totalKcal >= 200) {
        const heightM = (+prof.height || 170) / 100;
        const bmi = weight && heightM ? r0(weight / (heightM * heightM) * 10) / 10 : 22;
        const ndteData = HEYS.InsulinWave.calculateNDTE({
          trainingKcal: prevTrainings.totalKcal,
          hoursSince: prevTrainings.hoursSince,
          bmi,
          trainingType: prevTrainings.dominantType || 'cardio',
          trainingsCount: prevTrainings.trainings.length
        });
        ndteBoost = r0(bmr * ndteData.tdeeBoost);
      }
    }

    // baseExpenditure — без TEF, для расчёта optimum (норма не должна "догонять" съеденное)
    const baseExpenditure = r0(bmr + actTotal + ndteBoost);
    // TDEE — с TEF, для отображения фактических затрат
    const tdee = r0(baseExpenditure + tefKcal);

    // Целевой дефицит
    const profileTargetDef = +prof.deficitPctTarget || 0;
    const dayTargetDef = (d.deficitPct !== '' && d.deficitPct != null)
      ? +d.deficitPct
      : profileTargetDef;

    // Коррекция на менструальный цикл
    const cycleKcalMultiplier = HEYS.Cycle?.getKcalMultiplier?.(d.cycleDay) || 1;
    // Optimum рассчитывается от baseExpenditure (без TEF)
    const baseOptimum = r0(baseExpenditure * (1 + dayTargetDef / 100));
    const optimum = r0(baseOptimum * cycleKcalMultiplier);

    return {
      bmr,
      actTotal,
      trainingsKcal,
      train1k,
      train2k,
      train3k,
      stepsKcal: stepsK,
      householdKcal,
      totalHouseholdMin,  // 🆕 v1.1.2: Минуты для UI
      ndteBoost,
      ndteData: ndteBoost > 0 ? { active: true, tdeeBoost: ndteBoost / bmr } : { active: false, tdeeBoost: 0 }, // 🆕 v1.1.0
      tefKcal,             // 🆕 v3.9.1: TEF
      tefData,             // 🆕 v1.1.1: Full TEF data with breakdown
      baseExpenditure,     // 🆕 v3.9.1: без TEF (для optimum)
      tdee,                // с TEF (для UI)
      optimum,
      weight,
      mets,                // 🆕 v1.1.0: MET зоны для UI
      kcalMin: mets.map(m => kcalPerMin(m, weight)), // 🆕 v1.1.0: ккал/мин для UI
      deficitPct: dayTargetDef,
      cycleMultiplier: cycleKcalMultiplier
    };
  };

  /**
   * Быстрый расчёт только TDEE (затрат) для дня
   * @param {Object} day - Данные дня
   * @param {Object} profile - Профиль
   * @param {Object} options - Опции
   * @returns {number} TDEE в ккал
   */
  const getTDEE = (day, profile, options = {}) => {
    return calculateTDEE(day, profile, options).tdee;
  };

  /**
   * Расчёт TDEE для массива дней (для недельной/месячной статистики)
   * @param {string[]} dates - Массив дат в формате YYYY-MM-DD
   * @param {Object} profile - Профиль
   * @param {Object} options - { lsGet }
   * @returns {Object} { totalBurned, totalTarget, days: [...] }
   */
  const calculateWeekTDEE = (dates, profile, options = {}) => {
    const lsGet = options.lsGet || storeGet;

    let totalBurned = 0;
    let totalTarget = 0;
    const days = [];

    dates.forEach(dateStr => {
      const dayData = lsGet('heys_dayv2_' + dateStr, null);
      if (dayData) {
        const result = calculateTDEE(dayData, profile, { ...options, lsGet });
        totalBurned += result.tdee;
        totalTarget += result.optimum;
        days.push({
          date: dateStr,
          ...result
        });
      }
    });

    return {
      totalBurned,
      totalTarget,
      days,
      avgTDEE: days.length > 0 ? r0(totalBurned / days.length) : 0,
      avgTarget: days.length > 0 ? r0(totalTarget / days.length) : 0
    };
  };

  // === Экспорт ===
  HEYS.TDEE = {
    VERSION: '1.1.0',

    // Основные функции
    calculate: calculateTDEE,
    getTDEE,
    calculateWeek: calculateWeekTDEE,

    // Вспомогательные (для обратной совместимости)
    calcBMR,
    stepsKcal,
    trainingKcal,
    kcalPerMin
  };

  // Для отладки
  if (typeof window !== 'undefined') {
    window.debugTDEE = (date) => {
      const prof = storeGet('heys_profile', {});
      const day = storeGet('heys_dayv2_' + date, {});
      console.table(calculateTDEE(day, prof));
    };
  }

})(typeof window !== 'undefined' ? window : global);
