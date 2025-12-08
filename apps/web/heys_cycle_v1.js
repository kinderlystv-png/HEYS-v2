// heys_cycle_v1.js — Утилиты для менструального цикла (особого периода)
// Версия: 1.0.0 | Дата: 2025-12-08
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};

  // ============================================================
  // КОНСТАНТЫ ФАЗ ЦИКЛА
  // ============================================================
  
  /**
   * Фазы менструального цикла с научно обоснованными коррекциями
   * 
   * Источники:
   * - Barr et al. 2020 "Menstrual cycle phase and metabolic rate"
   * - McNulty et al. 2020 "The Effects of Menstrual Cycle Phase"
   * - Davidsen et al. 2007 "Insulin Sensitivity and Menstrual Cycle"
   */
  const CYCLE_PHASES = {
    // Дни 1-5: Менструальная фаза
    menstrual: {
      name: 'Менструальная',
      shortName: 'Особый период',
      days: [1, 2, 3, 4, 5],
      icon: '🌸',
      color: '#ec4899', // pink-500
      // Метаболизм снижен, повышенная инсулиновая чувствительность
      kcalMultiplier: 1.0,      // Без коррекции (естественное снижение аппетита)
      waterMultiplier: 1.1,     // +10% к норме воды (потеря жидкости)
      insulinWaveMultiplier: 1.12, // +12% к длине волны (снижение чувствительности)
      advice: {
        sweet: true,   // Тяга к сладкому — норма
        iron: true,    // Напоминание о железе
        rest: true     // Легче с нагрузками
      }
    },
    
    // Дни 6-12: Фолликулярная фаза
    follicular: {
      name: 'Фолликулярная',
      shortName: 'Восстановление',
      days: [6, 7, 8, 9, 10, 11, 12],
      icon: '🌱',
      color: '#22c55e', // green-500
      // Энергия растёт, хорошее время для тренировок
      kcalMultiplier: 1.0,
      waterMultiplier: 1.0,
      insulinWaveMultiplier: 0.95, // -5% (улучшенная чувствительность)
      advice: {
        training: true, // Хорошее время для интенсивных тренировок
        energy: true    // Энергия на подъёме
      }
    },
    
    // Дни 13-14: Овуляция
    ovulation: {
      name: 'Овуляция',
      shortName: 'Пик энергии',
      days: [13, 14],
      icon: '⭐',
      color: '#eab308', // yellow-500
      // Пик энергии и силы
      kcalMultiplier: 1.05,     // +5% (повышенный метаболизм)
      waterMultiplier: 1.0,
      insulinWaveMultiplier: 0.92, // -8% (лучшая чувствительность)
      advice: {
        peakPerformance: true // Лучшее время для рекордов
      }
    }
    
    // Примечание: Лютеиновая фаза (дни 15-28) не отслеживается,
    // так как пользователь отмечает только дни "особого периода"
  };

  // ============================================================
  // ОСНОВНЫЕ ФУНКЦИИ
  // ============================================================

  /**
   * Определить фазу цикла по дню
   * @param {number|null} cycleDay - День цикла (1-14 или null)
   * @returns {Object|null} Фаза с её параметрами или null
   */
  function getCyclePhase(cycleDay) {
    if (!cycleDay || typeof cycleDay !== 'number' || cycleDay < 1) {
      return null;
    }
    
    for (const [key, phase] of Object.entries(CYCLE_PHASES)) {
      if (phase.days.includes(cycleDay)) {
        return {
          id: key,
          day: cycleDay,
          ...phase
        };
      }
    }
    
    // День за пределами трекинга (>14)
    return null;
  }

  /**
   * Получить коррекцию калорий для дня
   * @param {number|null} cycleDay 
   * @returns {number} Множитель (1.0 = без изменений)
   */
  function getKcalMultiplier(cycleDay) {
    const phase = getCyclePhase(cycleDay);
    return phase ? phase.kcalMultiplier : 1.0;
  }

  /**
   * Получить коррекцию нормы воды
   * @param {number|null} cycleDay 
   * @returns {number} Множитель (1.0 = без изменений)
   */
  function getWaterMultiplier(cycleDay) {
    const phase = getCyclePhase(cycleDay);
    return phase ? phase.waterMultiplier : 1.0;
  }

  /**
   * Получить коррекцию инсулиновой волны
   * @param {number|null} cycleDay 
   * @returns {number} Множитель (1.0 = без изменений)
   */
  function getInsulinWaveMultiplier(cycleDay) {
    const phase = getCyclePhase(cycleDay);
    return phase ? phase.insulinWaveMultiplier : 1.0;
  }

  /**
   * Проверить, активен ли особый период (менструальная фаза)
   * @param {number|null} cycleDay 
   * @returns {boolean}
   */
  function isInMenstrualPhase(cycleDay) {
    const phase = getCyclePhase(cycleDay);
    return phase ? phase.id === 'menstrual' : false;
  }

  /**
   * Получить иконку и цвет для дня цикла (для UI)
   * @param {number|null} cycleDay 
   * @returns {Object} { icon, color, shortName }
   */
  function getCycleDisplay(cycleDay) {
    const phase = getCyclePhase(cycleDay);
    if (!phase) {
      return { icon: null, color: null, shortName: null };
    }
    return {
      icon: phase.icon,
      color: phase.color,
      shortName: phase.shortName,
      day: cycleDay
    };
  }

  /**
   * Получить advice-флаги для дня цикла
   * @param {number|null} cycleDay 
   * @returns {Object} Объект с флагами для advice модуля
   */
  function getCycleAdviceFlags(cycleDay) {
    const phase = getCyclePhase(cycleDay);
    return phase ? (phase.advice || {}) : {};
  }

  /**
   * Форматированное описание фазы для UI
   * @param {number|null} cycleDay 
   * @returns {string|null}
   */
  function getCycleDescription(cycleDay) {
    const phase = getCyclePhase(cycleDay);
    if (!phase) return null;
    
    if (phase.id === 'menstrual') {
      return `День ${cycleDay}: ${phase.shortName}`;
    }
    return `День ${cycleDay}: ${phase.name}`;
  }

  // ============================================================
  // АВТОМАТИЧЕСКОЕ ПРОСТАВЛЕНИЕ ДНЕЙ
  // ============================================================

  /**
   * Вычислить дату + N дней
   * @param {string} dateStr - YYYY-MM-DD
   * @param {number} days - Количество дней (может быть отрицательным)
   * @returns {string} YYYY-MM-DD
   */
  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Проставить дни цикла автоматически
   * При указании дня X на дате D:
   * - Дни 1 до X-1 проставляются в прошлое
   * - Дни X+1 до 7 проставляются в будущее
   * 
   * @param {string} startDate - YYYY-MM-DD (дата где указан день)
   * @param {number} dayNumber - Какой день указан (1-7)
   * @param {function} lsGet - Функция чтения из localStorage
   * @param {function} lsSet - Функция записи в localStorage
   * @returns {Object} { updated: number, dates: string[] }
   */
  function setCycleDaysAuto(startDate, dayNumber, lsGet, lsSet) {
    if (!startDate || !dayNumber || dayNumber < 1 || dayNumber > 7) {
      return { updated: 0, dates: [] };
    }

    const updatedDates = [];
    const keyPrefix = 'heys_dayv2_';

    // Проставляем 7 дней
    for (let d = 1; d <= 7; d++) {
      const offset = d - dayNumber; // Смещение от startDate
      const targetDate = addDays(startDate, offset);
      const key = keyPrefix + targetDate;
      
      try {
        const dayData = lsGet(key, null) || {};
        
        // Обновляем cycleDay
        const updated = {
          ...dayData,
          date: targetDate,
          cycleDay: d,
          updatedAt: Date.now()
        };
        
        lsSet(key, updated);
        updatedDates.push(targetDate);
      } catch (e) {
        console.warn('[Cycle] Failed to set day', targetDate, e);
      }
    }

    // Диспатчим события для обновления UI — для каждой даты отдельно
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      // Отдельное событие для каждой даты — чтобы DatePicker обновился
      updatedDates.forEach(date => {
        window.dispatchEvent(new CustomEvent('heys:day-updated', { 
          detail: { date, field: 'cycleDay', source: 'cycle-auto' }
        }));
      });
      // Общее событие для batch-операций
      window.dispatchEvent(new CustomEvent('heys:cycle-updated', { 
        detail: { dates: updatedDates, startDate, dayNumber } 
      }));
    }

    return { updated: updatedDates.length, dates: updatedDates };
  }

  /**
   * Очистить дни цикла (сбросить)
   * Убирает cycleDay у всех связанных дней
   * 
   * @param {string} anyDateInCycle - Любая дата в цикле
   * @param {function} lsGet - Функция чтения из localStorage
   * @param {function} lsSet - Функция записи в localStorage
   * @returns {Object} { cleared: number, dates: string[] }
   */
  function clearCycleDays(anyDateInCycle, lsGet, lsSet) {
    const keyPrefix = 'heys_dayv2_';
    const key = keyPrefix + anyDateInCycle;
    
    try {
      const dayData = lsGet(key, null);
      if (!dayData || !dayData.cycleDay) {
        return { cleared: 0, dates: [] };
      }
      
      const currentDay = dayData.cycleDay;
      const clearedDates = [];
      
      // Вычисляем диапазон и очищаем
      for (let d = 1; d <= 7; d++) {
        const offset = d - currentDay;
        const targetDate = addDays(anyDateInCycle, offset);
        const targetKey = keyPrefix + targetDate;
        
        const targetData = lsGet(targetKey, null);
        if (targetData && targetData.cycleDay) {
          const updated = { ...targetData, cycleDay: null, updatedAt: Date.now() };
          lsSet(targetKey, updated);
          clearedDates.push(targetDate);
        }
      }

      // Диспатчим события для обновления UI — для каждой даты отдельно
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        // Отдельное событие для каждой даты — чтобы DatePicker обновился
        clearedDates.forEach(date => {
          window.dispatchEvent(new CustomEvent('heys:day-updated', { 
            detail: { date, field: 'cycleDay', value: null, source: 'cycle-clear' }
          }));
        });
        // Общее событие для batch-операций
        window.dispatchEvent(new CustomEvent('heys:cycle-updated', { 
          detail: { dates: clearedDates, cleared: true } 
        }));
      }

      return { cleared: clearedDates.length, dates: clearedDates };
    } catch (e) {
      console.warn('[Cycle] Failed to clear cycle', e);
      return { cleared: 0, dates: [] };
    }
  }

  /**
   * Найти дату "День 1" цикла по любой дате в цикле
   * @param {string} dateStr - YYYY-MM-DD
   * @param {function} lsGet - Функция чтения
   * @returns {string|null} Дата дня 1 или null
   */
  function findCycleStartDate(dateStr, lsGet) {
    const keyPrefix = 'heys_dayv2_';
    const key = keyPrefix + dateStr;
    
    try {
      const dayData = lsGet(key, null);
      if (!dayData || !dayData.cycleDay) return null;
      
      const offset = 1 - dayData.cycleDay;
      return addDays(dateStr, offset);
    } catch (e) {
      return null;
    }
  }

  // ============================================================
  // ЭКСПОРТ
  // ============================================================

  HEYS.Cycle = {
    // Константы
    PHASES: CYCLE_PHASES,
    
    // Основные функции
    getCyclePhase,
    getKcalMultiplier,
    getWaterMultiplier,
    getInsulinWaveMultiplier,
    
    // Проверки
    isInMenstrualPhase,
    
    // UI helpers
    getCycleDisplay,
    getCycleDescription,
    getCycleAdviceFlags,
    
    // Автоматическое проставление
    setCycleDaysAuto,
    clearCycleDays,
    findCycleStartDate,
    addDays
  };

  console.log('[HEYS] Cycle module loaded v1.1.0 (+auto-fill)');

})(typeof window !== 'undefined' ? window : global);
