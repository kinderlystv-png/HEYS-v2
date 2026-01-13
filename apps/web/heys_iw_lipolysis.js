// heys_iw_lipolysis.js — Lipolysis Records & Streak Module
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Модуль управления рекордами липолиза, историей и streak'ами.
// Выделен из heys_insulin_wave_v1.js для улучшения модульности.
//
// ФУНКЦИИ:
// - getLipolysisRecord() — получить личный рекорд
// - updateLipolysisRecord() — обновить рекорд если побит
// - getLipolysisHistory() — получить историю за 30 дней
// - saveDayLipolysis() — сохранить липолиз за день
// - calculateLipolysisStreak() — рассчитать текущий и лучший streak
// - calculateLipolysisKcal() — примерный расход ккал за время липолиза

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === ИМПОРТ КОНСТАНТ ===
  const I = HEYS.InsulinWave?.__internals;
  const LIPOLYSIS_RECORD_KEY = I?.LIPOLYSIS_RECORD_KEY;
  const LIPOLYSIS_HISTORY_KEY = I?.LIPOLYSIS_HISTORY_KEY;
  const MIN_LIPOLYSIS_FOR_STREAK = I?.MIN_LIPOLYSIS_FOR_STREAK;
  const KCAL_PER_MIN_BASE = I?.KCAL_PER_MIN_BASE;
  
  // === ИМПОРТ УТИЛИТ ===
  const utils = HEYS.InsulinWave?.utils;
  
  // === РЕКОРДЫ И STREAK ЛИПОЛИЗА ===
  
  /**
   * Получить рекорд липолиза
   */
  const getLipolysisRecord = () => {
    try {
      const record = localStorage.getItem(LIPOLYSIS_RECORD_KEY);
      return record ? JSON.parse(record) : { minutes: 0, date: null };
    } catch (e) {
      return { minutes: 0, date: null };
    }
  };
  
  /**
   * Обновить рекорд липолиза (если побит)
   * @returns {boolean} true если рекорд побит
   */
  const updateLipolysisRecord = (minutes) => {
    const current = getLipolysisRecord();
    if (minutes > current.minutes) {
      const newRecord = { 
        minutes, 
        date: utils.getDateKey(),
        previousRecord: current.minutes > 0 ? current.minutes : null
      };
      try {
        localStorage.setItem(LIPOLYSIS_RECORD_KEY, JSON.stringify(newRecord));
      } catch (e) {}
      return true;
    }
    return false;
  };
  
  /**
   * Получить историю липолиза по дням
   */
  const getLipolysisHistory = () => {
    try {
      const history = localStorage.getItem(LIPOLYSIS_HISTORY_KEY);
      return history ? JSON.parse(history) : [];
    } catch (e) {
      return [];
    }
  };
  
  /**
   * Сохранить липолиз за день (вызывается при закрытии дня или в полночь)
   */
  const saveDayLipolysis = (date, minutes) => {
    const history = getLipolysisHistory();
    const existing = history.findIndex(h => h.date === date);
    
    if (existing >= 0) {
      history[existing].minutes = Math.max(history[existing].minutes, minutes);
    } else {
      history.push({ date, minutes });
    }
    
    // Храним последние 30 дней
    const sorted = history.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    
    try {
      localStorage.setItem(LIPOLYSIS_HISTORY_KEY, JSON.stringify(sorted));
    } catch (e) {}
    
    return sorted;
  };
  
  /**
   * Рассчитать streak липолиза (дни подряд с 4+ часами)
   */
  const calculateLipolysisStreak = () => {
    const history = getLipolysisHistory();
    if (history.length === 0) return { current: 0, best: 0 };
    
    // Сортируем по дате (новые первые)
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
    
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;
    
    const today = utils.getDateKey();
    const yesterday = utils.getDateKey(new Date(Date.now() - 86400000));
    
    // Проверяем непрерывность
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const prevEntry = sorted[i - 1];
      
      // Проверяем достаточно ли липолиза
      if (entry.minutes >= MIN_LIPOLYSIS_FOR_STREAK) {
        if (i === 0) {
          // Первый день (сегодня или вчера)
          if (entry.date === today || entry.date === yesterday) {
            tempStreak = 1;
            currentStreak = 1;
          } else {
            tempStreak = 1;
          }
        } else {
          // Проверяем последовательность дней
          const prevDate = new Date(prevEntry.date);
          const currDate = new Date(entry.date);
          const diffDays = Math.round((prevDate - currDate) / 86400000);
          
          if (diffDays === 1) {
            tempStreak++;
            if (sorted[0].date === today || sorted[0].date === yesterday) {
              currentStreak = tempStreak;
            }
          } else {
            bestStreak = Math.max(bestStreak, tempStreak);
            tempStreak = 1;
          }
        }
      } else {
        bestStreak = Math.max(bestStreak, tempStreak);
        tempStreak = 0;
        if (i === 0) currentStreak = 0;
      }
    }
    
    bestStreak = Math.max(bestStreak, tempStreak);
    
    return { current: currentStreak, best: bestStreak };
  };
  
  /**
   * Рассчитать примерно сожжённые калории за время липолиза
   * @param {number} minutes - минуты липолиза
   * @param {number} weight - вес в кг (опционально)
   */
  const calculateLipolysisKcal = (minutes, weight = 70) => {
    // Базовый расход в покое ≈ 1 ккал/мин для 70кг человека
    // Корректируем по весу: weight/70
    // Липолиз увеличивает расход примерно на 10-15%
    const baseRate = KCAL_PER_MIN_BASE * (weight / 70);
    const lipolysisBonus = 1.12; // +12% при липолизе
    
    return Math.round(minutes * baseRate * lipolysisBonus);
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.Lipolysis = {
    getLipolysisRecord,
    updateLipolysisRecord,
    getLipolysisHistory,
    saveDayLipolysis,
    calculateLipolysisStreak,
    calculateLipolysisKcal
  };
  
})(typeof window !== 'undefined' ? window : global);
