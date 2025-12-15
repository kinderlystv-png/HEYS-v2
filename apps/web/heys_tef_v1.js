// heys_tef_v1.js — Thermic Effect of Food (TEF) Module v1.0.0
// Единый источник правды для расчёта TEF во всём приложении
// Научное обоснование: Westerterp 2004, Tappy 1996
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};

  // === КОНСТАНТЫ ===
  
  /**
   * Коэффициенты TEF по макронутриентам
   * Научные диапазоны: Protein 20-30%, Carbs 5-10%, Fat 0-3%
   * Используем средние значения для точности
   */
  const TEF_COEFFICIENTS = {
    protein: 0.25,    // 25% калорий белка уходит на переваривание
    carbs: 0.075,     // 7.5% калорий углеводов
    fat: 0.015        // 1.5% калорий жиров
  };
  
  /**
   * Atwater факторы (ккал на грамм)
   */
  const ATWATER = {
    protein: 4,
    carbs: 4,
    fat: 9
  };
  
  /**
   * Научная информация для UI
   */
  const SCIENCE_INFO = {
    name: 'Thermic Effect of Food',
    nameRu: 'Термический эффект пищи',
    abbrev: 'TEF',
    description: 'Энергия, затрачиваемая на переваривание, всасывание и метаболизм пищи',
    formula: 'TEF = Белок×4×0.25 + Углеводы×4×0.075 + Жиры×9×0.015',
    sources: [
      { author: 'Westerterp', year: 2004, pmid: '15507147' },
      { author: 'Tappy', year: 1996, pmid: '8696422' }
    ],
    ranges: {
      protein: { min: 0.20, max: 0.30, used: 0.25, label: '20-30%' },
      carbs: { min: 0.05, max: 0.10, used: 0.075, label: '5-10%' },
      fat: { min: 0.00, max: 0.03, used: 0.015, label: '0-3%' }
    }
  };

  // === ФУНКЦИИ ===
  
  /**
   * Рассчитать TEF из макронутриентов (в граммах)
   * @param {number} proteinG - граммы белка
   * @param {number} carbsG - граммы углеводов  
   * @param {number} fatG - граммы жиров
   * @returns {Object} { total, breakdown: { protein, carbs, fat } }
   */
  function calculate(proteinG, carbsG, fatG) {
    proteinG = proteinG || 0;
    carbsG = carbsG || 0;
    fatG = fatG || 0;
    
    const proteinTEF = proteinG * ATWATER.protein * TEF_COEFFICIENTS.protein;
    const carbsTEF = carbsG * ATWATER.carbs * TEF_COEFFICIENTS.carbs;
    const fatTEF = fatG * ATWATER.fat * TEF_COEFFICIENTS.fat;
    
    return {
      total: Math.round(proteinTEF + carbsTEF + fatTEF),
      breakdown: {
        protein: Math.round(proteinTEF),
        carbs: Math.round(carbsTEF),
        fat: Math.round(fatTEF)
      }
    };
  }
  
  /**
   * Рассчитать TEF из объекта с макросами
   * @param {Object} macros - { prot, carbs, fat } или { protein, carbs, fat }
   * @returns {Object} { total, breakdown }
   */
  function calculateFromMacros(macros) {
    if (!macros) return { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    
    const prot = macros.prot || macros.protein || 0;
    const carbs = macros.carbs || macros.carbohydrates || 0;
    const fat = macros.fat || macros.fats || 0;
    
    return calculate(prot, carbs, fat);
  }
  
  /**
   * Рассчитать TEF из dayTot (суммы дня)
   * @param {Object} dayTot - { prot, carbs, fat, ... }
   * @returns {Object} { total, breakdown }
   */
  function calculateFromDayTot(dayTot) {
    if (!dayTot) return { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    return calculate(dayTot.prot || 0, dayTot.carbs || 0, dayTot.fat || 0);
  }
  
  /**
   * Рассчитать TEF из meals через pIndex
   * @param {Array} meals - массив приёмов пищи
   * @param {Object} pIndex - индекс продуктов { byId: Map }
   * @param {Function} getProductFromItem - функция получения продукта из item
   * @returns {Object} { total, breakdown }
   */
  function calculateFromMeals(meals, pIndex, getProductFromItem) {
    if (!meals || !meals.length) {
      return { total: 0, breakdown: { protein: 0, carbs: 0, fat: 0 } };
    }
    
    let totalProt = 0, totalCarbs = 0, totalFat = 0;
    
    for (const meal of meals) {
      if (!meal.items) continue;
      for (const item of meal.items) {
        const product = getProductFromItem ? getProductFromItem(item, pIndex) : pIndex?.byId?.get(item.product_id);
        if (!product) continue;
        
        const g = item.grams || 0;
        totalProt += (product.protein100 || 0) * g / 100;
        totalCarbs += ((product.simple100 || 0) + (product.complex100 || 0)) * g / 100;
        totalFat += ((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0)) * g / 100;
      }
    }
    
    return calculate(totalProt, totalCarbs, totalFat);
  }
  
  /**
   * Получить только число TEF (для простых случаев)
   * @param {number} proteinG
   * @param {number} carbsG
   * @param {number} fatG
   * @returns {number}
   */
  function getTotal(proteinG, carbsG, fatG) {
    return calculate(proteinG, carbsG, fatG).total;
  }
  
  /**
   * Форматировать TEF для отображения в UI
   * @param {Object} tefData - результат calculate()
   * @returns {Object} { label, value, details, tooltip }
   */
  function format(tefData) {
    if (!tefData || !tefData.total) {
      return { label: 'TEF', value: '0', details: '', tooltip: '' };
    }
    
    const { total, breakdown } = tefData;
    
    return {
      label: '🔥 Переваривание пищи (TEF)',
      value: `${total}`,
      details: `Б: ${breakdown.protein} | У: ${breakdown.carbs} | Ж: ${breakdown.fat}`,
      tooltip: `Термический эффект пищи:\n• Белок (25%): ${breakdown.protein} ккал\n• Углеводы (7.5%): ${breakdown.carbs} ккал\n• Жиры (1.5%): ${breakdown.fat} ккал`
    };
  }
  
  /**
   * Проверить, значим ли TEF (> 50 ккал)
   * @param {number} tefTotal
   * @returns {boolean}
   */
  function isSignificant(tefTotal) {
    return tefTotal > 50;
  }

  // === ЭКСПОРТ ===
  
  HEYS.TEF = {
    // Константы
    COEFFICIENTS: TEF_COEFFICIENTS,
    ATWATER: ATWATER,
    SCIENCE_INFO: SCIENCE_INFO,
    
    // Функции расчёта
    calculate,
    calculateFromMacros,
    calculateFromDayTot,
    calculateFromMeals,
    getTotal,
    
    // UI хелперы
    format,
    isSignificant,
    
    // Версия
    VERSION: '1.0.0'
  };

  // Debug
  if (typeof window !== 'undefined') {
    window.debugTEF = (prot, carbs, fat) => {
      const result = calculate(prot, carbs, fat);
      console.log('TEF Calculation:');
      console.log(`  Input: ${prot}g prot, ${carbs}g carbs, ${fat}g fat`);
      console.log(`  Breakdown: Б ${result.breakdown.protein} | У ${result.breakdown.carbs} | Ж ${result.breakdown.fat}`);
      console.log(`  Total: ${result.total} kcal`);
      return result;
    };
  }

})(typeof window !== 'undefined' ? window : global);
