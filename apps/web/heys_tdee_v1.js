// heys_tdee_v1.js — Модуль расчёта затрат калорий (TDEE)
// Единый источник правды для всех компонентов: hero, статистика, недельный отчёт
// v1.0.0

(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};
  
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
    const age = +profile.age || 30;
    const height = +profile.height || 170;
    const isMale = profile.gender !== 'Женский';
    // Mifflin-St Jeor: 10×вес + 6.25×рост − 5×возраст + (5 муж / −161 жен)
    return r0(10 * weight + 6.25 * height - 5 * age + (isMale ? 5 : -161));
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
    const lsGet = options.lsGet || U.lsGet || ((k, d) => {
      try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
    });
    
    // Вес: из дня или из профиля
    const weight = +day.weightMorning || +profile.weight || 70;
    
    // MET зоны
    const hrZones = options.hrZones || lsGet('heys_hr_zones', []);
    const zoneMets = hrZones.map(x => +x.MET || 0);
    const mets = [2.5, 6, 8, 10].map((def, i) => zoneMets[i] || def);
    
    // BMR
    const bmr = calcBMR(weight, profile);
    
    // Тренировки
    const trainings = (day.trainings && Array.isArray(day.trainings)) ? day.trainings : [];
    const train1k = trainingKcal(trainings[0], weight, mets);
    const train2k = trainingKcal(trainings[1], weight, mets);
    const train3k = trainingKcal(trainings[2], weight, mets);
    const trainingsKcal = train1k + train2k + train3k;
    
    // Шаги
    const stepsK = stepsKcal(day.steps || 0, weight, profile.gender);
    
    // Бытовая активность
    const householdActivities = day.householdActivities || 
      (day.householdMin > 0 ? [{ minutes: day.householdMin }] : []);
    const totalHouseholdMin = householdActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
    const householdKcal = r0(totalHouseholdMin * kcalPerMin(2.5, weight));
    
    // Общая активность
    const actTotal = r0(trainingsKcal + stepsK + householdKcal);
    
    // NDTE (Next-Day Training Effect) — буст от вчерашней тренировки
    let ndteBoost = 0;
    if (options.includeNDTE !== false && HEYS.InsulinWave?.calculateNDTE && HEYS.InsulinWave?.getPreviousDayTrainings && day.date) {
      const prevTrainings = HEYS.InsulinWave.getPreviousDayTrainings(day.date, lsGet);
      if (prevTrainings.totalKcal >= 200) {
        const heightM = (+profile.height || 170) / 100;
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
    
    // TDEE = BMR + активность + NDTE буст
    const tdee = r0(bmr + actTotal + ndteBoost);
    
    // Целевой дефицит
    const profileTargetDef = +profile.deficitPctTarget || 0;
    const dayTargetDef = (day.deficitPct !== '' && day.deficitPct != null) 
      ? +day.deficitPct 
      : profileTargetDef;
    
    // Коррекция на менструальный цикл
    const cycleKcalMultiplier = HEYS.Cycle?.getKcalMultiplier?.(day.cycleDay) || 1;
    const baseOptimum = r0(tdee * (1 + dayTargetDef / 100));
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
      ndteBoost,
      tdee,
      optimum,
      weight,
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
    const lsGet = options.lsGet || U.lsGet || ((k, d) => {
      try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
    });
    
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
    VERSION: '1.0.0',
    
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
      const prof = (HEYS.utils?.lsGet || U.lsGet)('heys_profile', {});
      const day = (HEYS.utils?.lsGet || U.lsGet)('heys_dayv2_' + date, {});
      console.table(calculateTDEE(day, prof));
    };
  }
  
})(typeof window !== 'undefined' ? window : global);
