// heys_day_science/glycemicLoad.js — Glycemic Load calculations
// Extracted from heys_day_v12.js (lines 616-648) for Phase 2 refactoring

;(function(global){
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayScience = HEYS.dayScience || {};
  
  // Import constants
  const scoring = HEYS.dayScoring || {};
  const GL_QUALITY_THRESHOLDS = scoring.GL_QUALITY_THRESHOLDS || {};
  
  // Хелпер: расчёт GL для приёма
  function calculateMealGL(avgGI, totalCarbs) {
    if (!avgGI || !totalCarbs) return 0;
    return (avgGI * totalCarbs) / 100;
  }
  
  // Хелпер: получить GL бонус
  function getGLQualityBonus(gl) {
    for (const [level, config] of Object.entries(GL_QUALITY_THRESHOLDS)) {
      if (gl <= config.max) {
        return { bonus: config.bonus, level, desc: config.desc };
      }
    }
    return { bonus: -4, level: 'veryHigh', desc: 'Очень высокий ответ' };
  }
  
  // === EXPORT ===
  HEYS.dayScience.calculateMealGL = calculateMealGL;
  HEYS.dayScience.getGLQualityBonus = getGLQualityBonus;
  
  console.log('✅ heys_day_science/glycemicLoad.js loaded');
  
})(typeof window !== 'undefined' ? window : global);
