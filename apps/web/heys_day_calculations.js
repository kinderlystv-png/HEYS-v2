// heys_day_calculations.js — Helper functions for calculations and data processing
// Phase 11 of HEYS Day v12 refactoring
// Extracted calculation and utility functions
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Dependencies with fallbacks
  const U = HEYS.dayUtils || {};
  const M = HEYS.models || {};
  const warnMissing = (name) => console.warn(`[heys_day_calculations] Missing dependency: ${name}`);
  const r0 = (n) => Math.round(n) || 0;
  const r1 = (n) => Math.round(n * 10) / 10;
  
  /**
   * Calculate day totals from meals
   * @param {Object} day - Day data
   * @param {Object} pIndex - Product index
   * @returns {Object} Day totals
   */
  function calculateDayTotals(day, pIndex) {
    const t = {kcal:0, carbs:0, simple:0, complex:0, prot:0, fat:0, bad:0, good:0, trans:0, fiber:0};
    (day.meals || []).forEach(m => {
      const mt = M.mealTotals ? M.mealTotals(m, pIndex) : {};
      Object.keys(t).forEach(k => {
        t[k] += mt[k] || 0;
      });
    });
    Object.keys(t).forEach(k => t[k] = r0(t[k]));
    
    // Weighted averages для ГИ и вредности по граммам
    let gSum = 0, giSum = 0, harmSum = 0;
    (day.meals || []).forEach(m => {
      (m.items || []).forEach(it => {
        const p = getProductFromItem(it, pIndex);
        if (!p) return;
        const g = +it.grams || 0;
        if (!g) return;
        const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
        const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
        gSum += g;
        if (gi != null) giSum += gi * g;
        if (harm != null) harmSum += harm * g;
      });
    });
    t.gi = gSum ? giSum / gSum : 0;
    t.harm = gSum ? harmSum / gSum : 0;
    
    return t;
  }
  
  /**
   * Get product from item (helper function)
   */
  function getProductFromItem(item, pIndex) {
    if (!item || !pIndex) return null;
    const productId = item.product_id || item.id;
    return pIndex[productId] || null;
  }
  
  /**
   * Compute daily norms from percentages
   * @param {number} optimum - Target calories
   * @param {Object} normPerc - Norm percentages
   * @returns {Object} Absolute norms
   */
  function computeDailyNorms(optimum, normPerc = {}) {
    const K = +optimum || 0;
    const carbPct = +normPerc.carbsPct || 0;
    const protPct = +normPerc.proteinPct || 0;
    const fatPct = Math.max(0, 100 - carbPct - protPct);
    const carbs = K ? (K * carbPct / 100) / 4 : 0;
    const prot = K ? (K * protPct / 100) / 4 : 0;
    const fat = K ? (K * fatPct / 100) / 9 : 0; // 9 ккал/г
    const simplePct = +normPerc.simpleCarbPct || 0;
    const simple = carbs * simplePct / 100;
    const complex = Math.max(0, carbs - simple);
    const badPct = +normPerc.badFatPct || 0;
    const transPct = +normPerc.superbadFatPct || 0;
    const bad = fat * badPct / 100;
    const trans = fat * transPct / 100;
    const good = Math.max(0, fat - bad - trans);
    const fiberPct = +normPerc.fiberPct || 0;
    const fiber = K ? (K / 1000) * fiberPct : 0;
    const gi = +normPerc.giPct || 0;
    const harm = +normPerc.harmPct || 0;
    return {kcal: K, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi, harm};
  }
  
  /**
   * Calculate day averages (mood, wellbeing, stress, dayScore)
   * @param {Array} meals - Meals array
   * @param {Array} trainings - Trainings array
   * @param {Object} dayData - Day data with morning scores
   * @returns {Object} Averages
   */
  function calculateDayAverages(meals, trainings, dayData) {
    // Утренние оценки из чек-ина (если есть — это стартовая точка дня)
    const morningMood = dayData?.moodMorning && !isNaN(+dayData.moodMorning) ? [+dayData.moodMorning] : [];
    const morningWellbeing = dayData?.wellbeingMorning && !isNaN(+dayData.wellbeingMorning) ? [+dayData.wellbeingMorning] : [];
    const morningStress = dayData?.stressMorning && !isNaN(+dayData.stressMorning) ? [+dayData.stressMorning] : [];
    
    // Собираем все оценки из приёмов пищи
    const mealMoods = (meals || []).filter(m => m.mood && !isNaN(+m.mood)).map(m => +m.mood);
    const mealWellbeing = (meals || []).filter(m => m.wellbeing && !isNaN(+m.wellbeing)).map(m => +m.wellbeing);
    const mealStress = (meals || []).filter(m => m.stress && !isNaN(+m.stress)).map(m => +m.stress);
    
    // Собираем оценки из тренировок (фильтруем только РЕАЛЬНЫЕ тренировки)
    const realTrainings = (trainings || []).filter(t => {
      const hasTime = t.time && t.time.trim() !== '';
      const hasMinutes = t.z && Array.isArray(t.z) && t.z.some(m => m > 0);
      return hasTime || hasMinutes;
    });
    const trainingMoods = realTrainings.filter(t => t.mood && !isNaN(+t.mood)).map(t => +t.mood);
    const trainingWellbeing = realTrainings.filter(t => t.wellbeing && !isNaN(+t.wellbeing)).map(t => +t.wellbeing);
    const trainingStress = realTrainings.filter(t => t.stress && !isNaN(+t.stress)).map(t => +t.stress);
    
    // Объединяем все оценки: утро + приёмы пищи + тренировки
    const allMoods = [...morningMood, ...mealMoods, ...trainingMoods];
    const allWellbeing = [...morningWellbeing, ...mealWellbeing, ...trainingWellbeing];
    const allStress = [...morningStress, ...mealStress, ...trainingStress];
    
    const moodAvg = allMoods.length ? r1(allMoods.reduce((sum, val) => sum + val, 0) / allMoods.length) : '';
    const wellbeingAvg = allWellbeing.length ? r1(allWellbeing.reduce((sum, val) => sum + val, 0) / allWellbeing.length) : '';
    const stressAvg = allStress.length ? r1(allStress.reduce((sum, val) => sum + val, 0) / allStress.length) : '';
    
    // Автоматический расчёт dayScore
    // Формула: (mood + wellbeing + (10 - stress)) / 3, округлено до целого
    let dayScore = '';
    if (moodAvg !== '' || wellbeingAvg !== '' || stressAvg !== '') {
      const m = moodAvg !== '' ? +moodAvg : 5;
      const w = wellbeingAvg !== '' ? +wellbeingAvg : 5;
      const s = stressAvg !== '' ? +stressAvg : 5;
      // stress инвертируем: низкий стресс = хорошо
      dayScore = Math.round((m + w + (10 - s)) / 3);
    }
    
    return { moodAvg, wellbeingAvg, stressAvg, dayScore };
  }
  
  /**
   * Normalize trainings data (migrate quality/feelAfter to mood/wellbeing)
   * @param {Array} trainings - Trainings array
   * @returns {Array} Normalized trainings
   */
  function normalizeTrainings(trainings = []) {
    return trainings.map((t = {}) => {
      if (t.quality !== undefined || t.feelAfter !== undefined) {
        const { quality, feelAfter, ...rest } = t;
        return {
          ...rest,
          mood: rest.mood ?? quality ?? 5,
          wellbeing: rest.wellbeing ?? feelAfter ?? 5,
          stress: rest.stress ?? 5
        };
      }
      return t;
    });
  }
  
  /**
   * Clean empty trainings (all zones = 0)
   * @param {Array} trainings - Trainings array
   * @returns {Array} Filtered trainings
   */
  function cleanEmptyTrainings(trainings) {
    if (!Array.isArray(trainings)) return [];
    return trainings.filter(t => t && t.z && t.z.some(z => z > 0));
  }
  
  /**
   * Sort meals by time (latest first)
   * @param {Array} meals - Meals array
   * @returns {Array} Sorted meals
   */
  function sortMealsByTime(meals) {
    if (!meals || meals.length <= 1) return meals;
    
    return [...meals].sort((a, b) => {
      const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
      const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;
      
      // Если оба без времени — сохраняем порядок
      if (timeA === null && timeB === null) return 0;
      // Без времени — в конец
      if (timeA === null) return 1;
      if (timeB === null) return -1;
      
      // Обратный порядок: последние наверху
      return timeB - timeA;
    });
  }
  
  /**
   * Parse time string to minutes
   * @param {string} timeStr - Time string (HH:MM)
   * @returns {number} Minutes since midnight
   */
  function parseTimeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  
  /**
   * Format time from minutes
   * @param {number} minutes - Minutes since midnight
   * @returns {string} Time string (HH:MM)
   */
  function formatMinutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  
  // Export module
  HEYS.dayCalculations = {
    calculateDayTotals,
    computeDailyNorms,
    calculateDayAverages,
    normalizeTrainings,
    cleanEmptyTrainings,
    sortMealsByTime,
    parseTimeToMinutes,
    formatMinutesToTime,
    getProductFromItem
  };
  
})(window);
