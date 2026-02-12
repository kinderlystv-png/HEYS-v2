/**
 * 📊 HEYS Predictive Insights — Layer C: Data Functions
 * @file pi_data.js
 * @version 1.0.0
 * @description Функции загрузки и расчёта данных:
 *   - calculateItemKcal() — калории из MealItem через pIndex
 *   - calculateDayKcal() — сумма калорий за день
 *   - calculateBMR() — базовый метаболизм (Mifflin-St Jeor)
 *   - getDaysData() — загрузка истории дней из localStorage
 *
 * Load order: pi_constants.js → pi_math.js → pi_data.js → main
 * Export: HEYS.InsightsPI.data (SSOT) + window.piData (fallback)
 */

(function initPiData(global) {
  'use strict';

  // === NAMESPACE SETUP ===
  global.HEYS = global.HEYS || {};
  global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};

  // === DATA FUNCTIONS ===

  /**
   * Рассчитать калории из MealItem через pIndex
   * @param {Object} item - { product_id, grams, ... }
   * @param {Object} pIndex - { byId: Map<string, Product> }
   * @returns {number} ккал
   */
  function calculateItemKcal(item, pIndex) {
    if (!item || !item.grams) return 0;
    const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
    if (!prod) return 0;
    const p = prod.protein100 || 0;
    const c = (prod.simple100 || 0) + (prod.complex100 || 0);
    const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
    // TEF-adjusted: protein 3 kcal/g (25% TEF)
    return (p * 3 + c * 4 + f * 9) * item.grams / 100;
  }

  /**
   * Рассчитать калории за день
   * @param {Object} day - { meals: [...] }
   * @param {Object} pIndex - индекс продуктов
   * @returns {number} сумма ккал
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
   * @param {Object} profile - { weight, height, age, gender }
   * @returns {number} BMR в ккал
   */
  function calculateBMR(profile) {
    // Если есть модуль TDEE — используем его
    if (global.HEYS.TDEE?.calcBMR) {
      return global.HEYS.TDEE.calcBMR(profile);
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
   * @returns {Array} массив дней [{date, daysAgo, ...dayData}]
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

  // === EXPORT ===
  const DATA_EXPORTS = {
    calculateItemKcal,
    calculateDayKcal,
    calculateBMR,
    getDaysData
  };

  // SSOT: HEYS.InsightsPI.data
  global.HEYS.InsightsPI.data = DATA_EXPORTS;

  // Fallback: window.piData
  global.piData = DATA_EXPORTS;

})(typeof window !== 'undefined' ? window : globalThis);
