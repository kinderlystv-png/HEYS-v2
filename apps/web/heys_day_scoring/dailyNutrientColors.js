// heys_day_scoring/dailyNutrientColors.js — Daily nutrient colors & tooltips
// Extracted from heys_day_v12.js (lines 902-1060) for Phase 2 refactoring

;(function(global){
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayScoring = HEYS.dayScoring || {};
  
  // Import constants
  const scoring = HEYS.dayScoring || {};
  const NUTRIENT_COLORS = scoring.NUTRIENT_COLORS || {
    good: '#16a34a',
    medium: '#ca8a04',
    bad: '#dc2626'
  };
  
  /**
   * Получить цвет для СУТОЧНОГО значения (сравнение факта с нормой)
   * @param {string} nutrient - тип нутриента
   * @param {number} fact - фактическое значение
   * @param {number} norm - норма
   * @returns {string|null} - цвет или null
   */
  function getDailyNutrientColor(nutrient, fact, norm) {
    if (!norm || norm <= 0) return null;
    const pct = fact / norm; // процент выполнения
    
    switch (nutrient) {
      // === КАЛОРИИ — ключевой параметр ===
      case 'kcal':
        if (pct >= 0.90 && pct <= 1.10) return NUTRIENT_COLORS.good;  // 90-110% — идеально
        if (pct >= 0.75 && pct <= 1.20) return NUTRIENT_COLORS.medium; // 75-120% — терпимо
        return NUTRIENT_COLORS.bad;                                     // <75% или >120%
      
      // === БЕЛОК — чем больше, тем лучше (до 150%) ===
      case 'prot':
        if (pct >= 0.90 && pct <= 1.30) return NUTRIENT_COLORS.good;  // 90-130% — отлично
        if (pct >= 0.70) return NUTRIENT_COLORS.medium;                // 70-90% — маловато
        return NUTRIENT_COLORS.bad;                                     // <70% — критично мало
      
      // === УГЛЕВОДЫ — близко к норме ===
      case 'carbs':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ПРОСТЫЕ — чем меньше, тем лучше ===
      case 'simple':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;                  // <80% нормы — отлично
        if (pct <= 1.10) return null;                                   // 80-110% — норма
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;                // 110-130% — многовато
        return NUTRIENT_COLORS.bad;                                     // >130% — плохо
      
      // === СЛОЖНЫЕ — чем больше, тем лучше ===
      case 'complex':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;                  // ≥100% — отлично
        if (pct >= 0.70) return null;                                   // 70-100% — норма
        return NUTRIENT_COLORS.medium;                                  // <70% — маловато
      
      // === ЖИРЫ — близко к норме ===
      case 'fat':
        if (pct >= 0.85 && pct <= 1.15) return NUTRIENT_COLORS.good;
        if (pct >= 0.60 && pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНЫЕ ЖИРЫ — чем меньше, тем лучше ===
      case 'bad':
        if (pct <= 0.70) return NUTRIENT_COLORS.good;                  // <70% — отлично
        if (pct <= 1.00) return null;                                   // 70-100% — норма
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;                // 100-130% — многовато
        return NUTRIENT_COLORS.bad;                                     // >130%
      
      // === ПОЛЕЗНЫЕ ЖИРЫ — чем больше, тем лучше ===
      case 'good':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;
        if (pct >= 0.70) return null;
        return NUTRIENT_COLORS.medium;
      
      // === ТРАНС-ЖИРЫ — чем меньше, тем лучше (особо вредные) ===
      case 'trans':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;                  // <50% — отлично
        if (pct <= 1.00) return NUTRIENT_COLORS.medium;                // 50-100%
        return NUTRIENT_COLORS.bad;                                     // >100%
      
      // === КЛЕТЧАТКА — чем больше, тем лучше ===
      case 'fiber':
        if (pct >= 1.00) return NUTRIENT_COLORS.good;                  // ≥100% — отлично
        if (pct >= 0.70) return null;                                   // 70-100% — норма
        if (pct >= 0.40) return NUTRIENT_COLORS.medium;                // 40-70% — маловато
        return NUTRIENT_COLORS.bad;                                     // <40%
      
      // === ГИ — чем ниже, тем лучше ===
      case 'gi':
        if (pct <= 0.80) return NUTRIENT_COLORS.good;                  // <80% от целевого
        if (pct <= 1.10) return null;                                   // 80-110%
        if (pct <= 1.30) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      // === ВРЕДНОСТЬ — чем меньше, тем лучше ===
      case 'harm':
        if (pct <= 0.50) return NUTRIENT_COLORS.good;                  // <50% — отлично
        if (pct <= 1.00) return null;                                   // 50-100% — норма
        if (pct <= 1.50) return NUTRIENT_COLORS.medium;
        return NUTRIENT_COLORS.bad;
      
      default:
        return null;
    }
  }

  /**
   * Получить tooltip для СУТОЧНОГО значения
   */
  function getDailyNutrientTooltip(nutrient, fact, norm) {
    if (!norm || norm <= 0) return 'Норма не задана';
    const pct = Math.round((fact / norm) * 100);
    const diff = fact - norm;
    const diffStr = diff >= 0 ? '+' + Math.round(diff) : Math.round(diff);
    
    const baseInfo = `${Math.round(fact)} из ${Math.round(norm)} (${pct}%)`;
    
    switch (nutrient) {
      case 'kcal':
        if (pct >= 90 && pct <= 110) return `✅ Калории в норме: ${baseInfo}`;
        if (pct < 90) return `⚠️ Недобор калорий: ${baseInfo}`;
        return `❌ Перебор калорий: ${baseInfo}`;
      
      case 'prot':
        if (pct >= 90) return `✅ Белок в норме: ${baseInfo}`;
        if (pct >= 70) return `⚠️ Маловато белка: ${baseInfo}`;
        return `❌ Мало белка: ${baseInfo}`;
      
      case 'carbs':
        if (pct >= 85 && pct <= 115) return `✅ Углеводы в норме: ${baseInfo}`;
        if (pct < 85) return `⚠️ Мало углеводов: ${baseInfo}`;
        return `⚠️ Много углеводов: ${baseInfo}`;
      
      case 'simple':
        if (pct <= 80) return `✅ Мало простых — отлично: ${baseInfo}`;
        if (pct <= 110) return `Простые углеводы: ${baseInfo}`;
        return `❌ Много простых углеводов: ${baseInfo}`;
      
      case 'complex':
        if (pct >= 100) return `✅ Достаточно сложных: ${baseInfo}`;
        return `Сложные углеводы: ${baseInfo}`;
      
      case 'fat':
        if (pct >= 85 && pct <= 115) return `✅ Жиры в норме: ${baseInfo}`;
        return `Жиры: ${baseInfo}`;
      
      case 'bad':
        if (pct <= 70) return `✅ Мало вредных жиров: ${baseInfo}`;
        if (pct <= 100) return `Вредные жиры: ${baseInfo}`;
        return `❌ Много вредных жиров: ${baseInfo}`;
      
      case 'good':
        if (pct >= 100) return `✅ Достаточно полезных жиров: ${baseInfo}`;
        return `Полезные жиры: ${baseInfo}`;
      
      case 'trans':
        if (pct <= 50) return `✅ Минимум транс-жиров: ${baseInfo}`;
        return `❌ Транс-жиры: ${baseInfo}`;
      
      case 'fiber':
        if (pct >= 100) return `✅ Достаточно клетчатки: ${baseInfo}`;
        if (pct >= 70) return `Клетчатка: ${baseInfo}`;
        return `⚠️ Мало клетчатки: ${baseInfo}`;
      
      case 'gi':
        if (pct <= 80) return `✅ Низкий средний ГИ: ${baseInfo}`;
        if (pct <= 110) return `Средний ГИ: ${baseInfo}`;
        return `⚠️ Высокий средний ГИ: ${baseInfo}`;
      
      case 'harm':
        if (pct <= 50) return `✅ Минимальный вред: ${baseInfo}`;
        if (pct <= 100) return `Вредность: ${baseInfo}`;
        return `❌ Высокая вредность: ${baseInfo}`;
      
      default:
        return baseInfo;
    }
  }
  
  // === EXPORT ===
  HEYS.dayScoring.getDailyNutrientColor = getDailyNutrientColor;
  HEYS.dayScoring.getDailyNutrientTooltip = getDailyNutrientTooltip;
  
  console.log('✅ heys_day_scoring/dailyNutrientColors.js loaded');
  
})(typeof window !== 'undefined' ? window : global);
