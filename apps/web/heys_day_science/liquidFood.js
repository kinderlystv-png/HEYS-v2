// heys_day_science/liquidFood.js — Liquid food detection
// Extracted from heys_day_v12.js (lines 597-614) for Phase 2 refactoring

;(function(global){
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayScience = HEYS.dayScience || {};
  
  // Import constants
  const scoring = HEYS.dayScoring || {};
  const LIQUID_FOOD_PATTERNS = scoring.LIQUID_FOOD_PATTERNS || [];
  
  // Хелпер: проверка является ли продукт жидким
  function isLiquidFood(productName, category) {
    if (!productName) return false;
    const name = String(productName);
    const cat = String(category || '');
    
    // Проверяем категорию
    if (['Напитки', 'Соки', 'Молочные напитки'].includes(cat)) {
      return true;
    }
    
    // Проверяем паттерны в названии
    for (const pattern of LIQUID_FOOD_PATTERNS) {
      if (pattern.test(name)) return true;
    }
    
    return false;
  }
  
  // === EXPORT ===
  HEYS.dayScience.isLiquidFood = isLiquidFood;
  
  console.log('✅ heys_day_science/liquidFood.js loaded');
  
})(typeof window !== 'undefined' ? window : global);
