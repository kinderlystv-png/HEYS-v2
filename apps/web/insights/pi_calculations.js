// pi_calculations.js — Helper Calculation Utilities v3.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 10)
// Вспомогательные функции для расчётов: калории, BMR, получение данных
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = HEYS.dev || global.HEYS?.dev || {};
  const devLog = DEV.log ? DEV.log.bind(DEV) : () => { };

  /**
   * Рассчитать калории из MealItem через pIndex
   * @param {Object} item - элемент еды
   * @param {Object} pIndex - индекс продуктов
   * @returns {number} калории
   */
  function calculateItemKcal(item, pIndex) {
    if (!item || !item.grams) return 0;
    const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
    if (!prod) return 0;
    const p = prod.protein100 || 0;
    const c = (prod.simple100 || 0) + (prod.complex100 || 0);
    const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
    // TEF-adjusted: protein 3 kcal/g (25% TEF), согласовано с heys_day_core_bundle_v1.js
    return (p * 3 + c * 4 + f * 9) * item.grams / 100;
  }

  /**
   * Рассчитать калории за день
   * @param {Object} day - данные дня
   * @param {Object} pIndex - индекс продуктов
   * @returns {number} общие калории
   */
  function calculateDayKcal(day, pIndex) {
    let total = 0;
    if (!day.meals) return 0;
    for (const meal of day.meals) {
      if (!meal.items) continue;
      for (const item of meal.items) {
        total += calculateItemKcal(item, pIndex);
      }
    }
    return total;
  }

  /**
   * Рассчитать BMR (Mifflin-St Jeor)
   * 🔬 TDEE v1.1.0: делегируем в HEYS.TDEE.calcBMR() если доступен
   * @param {Object} profile - профиль пользователя
   * @returns {number} BMR
   */
  function calculateBMR(profile) {
    // Если есть модуль TDEE — используем его
    if (HEYS.TDEE?.calcBMR) {
      return HEYS.TDEE.calcBMR(profile);
    }

    // Fallback: inline расчёт
    const weight = profile?.weight || 70;
    const height = profile?.height || 170;
    const age = profile?.age || 30;
    const isMale = profile?.gender !== 'Женский';

    if (isMale) {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      return 10 * weight + 6.25 * height - 5 * age - 161;
    }
  }

  /**
   * Получить данные дней из localStorage
   * @param {number} daysBack - сколько дней назад
   * @param {Function} lsGet - функция U.lsGet
   * @returns {Array} массив дней [{date, ...dayData}]
   */
  function getDaysData(daysBack, lsGet) {
    const days = [];
    const today = new Date();

    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = lsGet(`heys_dayv2_${dateStr}`, null);

      if (dayData && dayData.meals && dayData.meals.length > 0) {
        days.push({
          date: dateStr,
          daysAgo: i,
          ...dayData
        });
      }
    }

    return days;
  }

  // === ЭКСПОРТ ===
  HEYS.InsightsPI.calculations = {
    calculateItemKcal,
    calculateDayKcal,
    calculateBMR,
    getDaysData
  };

  // Fallback для прямого доступа
  global.piCalculations = HEYS.InsightsPI.calculations;

  devLog('[PI Calculations] v3.0.0 loaded — 4 calculation utilities');

})(typeof window !== 'undefined' ? window : global);
