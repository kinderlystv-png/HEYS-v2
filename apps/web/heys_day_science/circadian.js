// heys_day_science/circadian.js — Circadian rhythm bonuses
// Extracted from heys_day_v12.js (lines 622-638) for Phase 2 refactoring

;(function(global){
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.dayScience = HEYS.dayScience || {};
  
  // Import constants
  const scoring = HEYS.dayScoring || {};
  const CIRCADIAN_MEAL_BONUS = scoring.CIRCADIAN_MEAL_BONUS || {};
  
  // Хелпер: получить циркадный бонус по времени
  function getCircadianBonus(hour) {
    for (const [period, config] of Object.entries(CIRCADIAN_MEAL_BONUS)) {
      if (config.from <= config.to) {
        // Обычный интервал (не пересекает полночь)
        if (hour >= config.from && hour < config.to) {
          return { bonus: config.bonus, period, desc: config.desc };
        }
      } else {
        // Интервал пересекает полночь (night: 23 → 6)
        if (hour >= config.from || hour < config.to) {
          return { bonus: config.bonus, period, desc: config.desc };
        }
      }
    }
    return { bonus: 0, period: 'afternoon', desc: 'Дневное время' };
  }
  
  // === EXPORT ===
  HEYS.dayScience.getCircadianBonus = getCircadianBonus;
  
  console.log('✅ heys_day_science/circadian.js loaded');
  
})(typeof window !== 'undefined' ? window : global);
