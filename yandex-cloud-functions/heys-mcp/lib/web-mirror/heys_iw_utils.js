// heys_iw_utils.js — Insulin Wave Utils Module
// Version: 1.0.0 | Date: 2026-01-11
//
// PURPOSE: Utility functions for time, formatting, and calculations

(function(global) {
  'use strict';
  
  const IW = global.HEYS?.InsulinWave;
  const I = IW?.__internals;
  
  if (!I) {
    console.error('[IW utils] Shim required');
    return;
  }
  
  if (!I._loaded.shim) {
    console.error('[IW utils] Shim must be loaded first');
    return;
  }
  
  // Guard: constants needed for GI_CATEGORIES reference
  if (!I._loaded.constants) {
    console.error('[IW utils] Constants module required');
    return;
  }
  
  // Get constants we need
  const GI_CATEGORIES = I.GI_CATEGORIES;
  
  // === UTILS OBJECT ===
  // Build the utils object and store in I._utils
  // This will be exported to public API by finalize module
  
  I._utils = {
    // Время в минуты с полуночи (поддерживает 24:xx, 25:xx формат)
    timeToMinutes: (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      // 24:20 → 0*60 + 20 = 20, но для сортировки сохраняем как есть
      return (h || 0) * 60 + (m || 0);
    },
    
    // 🆕 v3.7.7: Расчёт ккал тренировки через MET-значения зон пульса
    // Научная формула: MET × 3.5 × вес / 200 = ккал/мин
    // Источник: Ainsworth 2011, Compendium of Physical Activities
    calculateTrainingKcal: (training, weight = 70) => {
      if (!training || !training.z) return 0;
      const zones = training.z || [0, 0, 0, 0];
      const totalMinutes = zones.reduce((a, b) => a + (+b || 0), 0);
      if (totalMinutes === 0) return 0;
      
      // MET значения по зонам (из heys_hr_zones или дефолтные)
      // Zone 1: 2.5 MET (восстановление, 50-60% HRmax)
      // Zone 2: 6 MET (жиросжигание, 60-70% HRmax)
      // Zone 3: 8 MET (аэробная, 70-80% HRmax)
      // Zone 4: 10 MET (анаэробная, 80-90% HRmax)
      let mets = [2.5, 6, 8, 10];
      try {
        const lsGet = global.HEYS?.utils?.lsGet;
        const hrZones = (typeof lsGet === 'function') ? lsGet('heys_hr_zones', []) : [];
        if (hrZones.length >= 4) {
          mets = [2.5, 6, 8, 10].map((def, i) => +hrZones[i]?.MET || def);
        }
      } catch (e) { /* fallback to defaults */ }
      
      // ккал/мин = MET × 3.5 × вес(кг) / 200
      const kcalPerMin = (met, w) => (met * 3.5 * w / 200);
      
      const kcal = zones.reduce((sum, min, i) => sum + (+min || 0) * kcalPerMin(mets[i], weight), 0);
      return Math.round(kcal);
    },
    
    // Минуты в HH:MM (нормализует 24+ часов)
    minutesToTime: (minutes) => {
      const h = Math.floor(minutes / 60) % 24;
      const m = minutes % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },
    
    // Нормализация времени для отображения (24:20 → 00:20)
    normalizeTimeForDisplay: (timeStr) => {
      if (!timeStr) return '';
      const [h, m] = timeStr.split(':').map(Number);
      if (isNaN(h)) return timeStr;
      const normalH = h % 24;
      return String(normalH).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0');
    },
    
    // Форматирование длительности
    formatDuration: (minutes) => {
      if (minutes <= 0) return '0 мин';
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h === 0) return `${m} мин`;
      if (m === 0) return `${h}ч`;
      return `${h}ч ${m}м`;
    },
    
    // Получить категорию ГИ
    getGICategory: (gi) => {
      if (gi <= 35) return GI_CATEGORIES.low;
      if (gi <= 55) return GI_CATEGORIES.medium;
      if (gi <= 70) return GI_CATEGORIES.high;
      return GI_CATEGORIES.veryHigh;
    },
    
    // Ночное время?
    isNightTime: (hour) => hour >= 22 || hour < 6,
    
    // Получить дату в формате YYYY-MM-DD
    getDateKey: (date = new Date()) => date.toISOString().slice(0, 10),
    
    // Рекомендуемый приём по времени
    getNextMealSuggestion: (hour) => {
      if (hour >= 22 || hour < 6) return null;
      if (hour < 10) return { type: 'breakfast', icon: '🍳', name: 'Завтрак' };
      if (hour < 12) return { type: 'snack', icon: '🍎', name: 'Перекус' };
      if (hour < 14) return { type: 'lunch', icon: '🍲', name: 'Обед' };
      if (hour < 17) return { type: 'snack', icon: '🥜', name: 'Перекус' };
      if (hour < 20) return { type: 'dinner', icon: '🍽️', name: 'Ужин' };
      return { type: 'light', icon: '🥛', name: 'Лёгкий перекус' };
    },
    
    // Нормализация времени к суткам HEYS (день = 03:00 → 03:00)
    normalizeToHeysDay: (timeMin) => {
      const HEYS_DAY_START = 3 * 60; // 03:00 = 180 минут
      const totalMinutes = timeMin % (24 * 60);
      if (totalMinutes >= HEYS_DAY_START) {
        return totalMinutes - HEYS_DAY_START; // 03:00 → 0, 04:00 → 60
      }
      return totalMinutes + (24 * 60 - HEYS_DAY_START); // 00:00 → 1260, 02:59 → 1439
    }
  };
  
  // === EXPORT TO PUBLIC API ===
  const IW_NS = global.HEYS.InsulinWave;
  IW_NS.utils = I._utils;
  
  // Mark utils as loaded
  I._loaded.utils = true;
  
})(typeof window !== 'undefined' ? window : global);
