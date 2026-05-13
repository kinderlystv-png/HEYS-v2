// heys_cycle_v1.js — Утилиты для менструального цикла (особого периода)
// Версия: 1.0.0 | Дата: 2025-12-08
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const readStoredValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  };

  const writeStoredValue = (key, value) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(key, value);
        return;
      }
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch { }
  };

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
      // Повышенные энергозатраты (спазмы, терморегуляция)
      kcalMultiplier: 1.05,     // +5% к норме (компенсация дискомфорта)
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
    },

    // v4.3 (2026-05-13): Лютеиновая фаза (дни 15-28) добавлена.
    // ПРЕЖДЕ половина цикла шла с insulinWaveMultiplier=1.0 несмотря на реальное
    // падение Si. Valdes/Elkind-Hirsch 1991: Si падает 6.20 → 3.20 (≈48%) между
    // фолликулярной и лютеиновой фазами. Bonen 1991, Yeung 2010 (BioCycle)
    // подтверждают. В отсутствии явного маркера овуляции (юзер не вводит)
    // считаем лютеиновую как «оценочную» — применяется только если cycleDay
    // явно ≥15. UI должен предупредить о грубой оценке без LH-теста.
    luteal: {
      name: 'Лютеиновая',
      shortName: 'После овуляции',
      days: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
      icon: '🌙',
      color: '#a78bfa', // violet-400
      // Si падает на 20-30% (Valdes 1991, консервативно — литература до 48%)
      kcalMultiplier: 1.08,     // +8% (BMR ↑ при прогестероне)
      waterMultiplier: 1.05,
      insulinWaveMultiplier: 1.12, // +12% к волне (Si ↓ — Valdes 1991, консервативно)
      advice: {
        carbAware: true, // Меньше быстрых углеводов вечером
        ironOmega3: true // PMS-симптомы — нужны магний/омега-3
      }
    }
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
   * Получить правильный ключ localStorage с учётом clientId
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {string} Полный ключ
   */
  function getDayKey(dateStr) {
    const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
    if (clientId) {
      return 'heys_' + clientId + '_dayv2_' + dateStr;
    }
    return 'heys_dayv2_' + dateStr;
  }

  function readDayData(dateStr, lsGet) {
    const baseKey = 'heys_dayv2_' + dateStr;
    const scopedKey = getDayKey(dateStr);

    if (HEYS.store?.get) {
      return readStoredValue(scopedKey, null);
    }

    if (lsGet) {
      try {
        const v = lsGet(baseKey, null);
        if (v !== null && v !== undefined) return v;
      } catch (e) { }
    }

    return readStoredValue(scopedKey, null);
  }

  function writeDayData(dateStr, value, lsSet) {
    const baseKey = 'heys_dayv2_' + dateStr;
    const scopedKey = getDayKey(dateStr);

    if (HEYS.store?.set) {
      writeStoredValue(scopedKey, value);
      return;
    }

    if (lsSet) {
      try {
        lsSet(baseKey, value);
        return;
      } catch (e) { }
    }

    writeStoredValue(scopedKey, value);
  }

  /**
   * Проставить дни цикла автоматически
   * При указании дня X на дате D:
   * - Дни 1 до X-1 проставляются в прошлое
   * - Дни X+1 до 7 проставляются в будущее
   * 
   * @param {string} startDate - YYYY-MM-DD (дата где указан день)
   * @param {number} dayNumber - Какой день указан (1-7)
   * @param {function} lsGet - Функция чтения из localStorage (IGNORED, используется getDayKey)
   * @param {function} lsSet - Функция записи в localStorage (IGNORED, используется getDayKey)
   * @returns {Object} { updated: number, dates: string[] }
   */
  function setCycleDaysAuto(startDate, dayNumber, lsGet, lsSet) {
    if (!startDate || !dayNumber || dayNumber < 1 || dayNumber > 7) {
      return { updated: 0, dates: [] };
    }

    const updatedDates = [];

    // Проставляем 7 дней
    for (let d = 1; d <= 7; d++) {
      const offset = d - dayNumber; // Смещение от startDate
      const targetDate = addDays(startDate, offset);

      try {
        // Читаем store-first с правильным ключом
        let dayData = readDayData(targetDate, lsGet) || {};

        // Обновляем cycleDay
        const updated = {
          ...dayData,
          date: targetDate,
          cycleDay: d,
          updatedAt: Date.now()
        };

        // Пишем store-first с правильным ключом
        writeDayData(targetDate, updated, lsSet);
        updatedDates.push(targetDate);

        // console.log('[Cycle] Set cycleDay=' + d + ' for ' + targetDate + ' (key: ' + key + ')');
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
        // Триггер облачной синхронизации
        window.dispatchEvent(new CustomEvent('heys:data-saved', {
          detail: { key: `day:${date}`, type: 'cycle' }
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
   * @param {function} lsGet - Функция чтения из localStorage (IGNORED, используется getDayKey)
   * @param {function} lsSet - Функция записи в localStorage (IGNORED, используется getDayKey)
   * @returns {Object} { cleared: number, dates: string[] }
   */
  function clearCycleDays(anyDateInCycle, lsGet, lsSet) {
    try {
      // Читаем store-first
      const dayData = readDayData(anyDateInCycle, lsGet);

      if (!dayData || !dayData.cycleDay) {
        return { cleared: 0, dates: [] };
      }

      const currentDay = dayData.cycleDay;
      const clearedDates = [];

      // Вычисляем диапазон и очищаем
      for (let d = 1; d <= 7; d++) {
        const offset = d - currentDay;
        const targetDate = addDays(anyDateInCycle, offset);

        const targetData = readDayData(targetDate, lsGet);

        if (targetData && targetData.cycleDay) {
          const updated = { ...targetData, cycleDay: null, updatedAt: Date.now() };
          writeDayData(targetDate, updated, lsSet);
          clearedDates.push(targetDate);
          // console.log('[Cycle] Cleared cycleDay for ' + targetDate);
        }
      }

      // Диспатчим события для обновления UI — для каждой даты отдельно
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        // Отдельное событие для каждой даты — чтобы DatePicker обновился
        clearedDates.forEach(date => {
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { date, field: 'cycleDay', value: null, source: 'cycle-clear' }
          }));
          // Триггер облачной синхронизации
          window.dispatchEvent(new CustomEvent('heys:data-saved', {
            detail: { key: `day:${date}`, type: 'cycle' }
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

  // ============================================================
  // ЗАДЕРЖКА ВОДЫ И ВЕС
  // ============================================================

  /**
   * Информация о задержке воды по фазе цикла
   * 
   * Научное обоснование:
   * - Stachenfeld et al. 2008: "Estrogen influences body water regulation"
   * - White et al. 2011: "Menstrual cycle phase and fluid retention"
   * - Повышение прогестерона в лютеиновой фазе → задержка Na+ и воды
   * - Пик задержки: 1-3 дня до и 1-3 дня после начала менструации
   * - Типичная задержка: 0.5-3 кг (зависит от индивидуальных особенностей)
   * 
   * @param {number|null} cycleDay 
   * @returns {Object} { hasRetention, severity, kgEstimate, advice }
   */
  function getWaterRetentionInfo(cycleDay) {
    if (!cycleDay || typeof cycleDay !== 'number' || cycleDay < 1) {
      return {
        hasRetention: false,
        severity: 'none',
        kgEstimate: 0,
        advice: null,
        excludeFromTrend: false
      };
    }

    // Дни 1-5: Менструальная фаза — максимальная задержка
    if (cycleDay >= 1 && cycleDay <= 5) {
      return {
        hasRetention: true,
        severity: cycleDay <= 3 ? 'high' : 'medium', // Пик в первые 3 дня
        kgEstimate: cycleDay <= 3 ? 2.0 : 1.0, // Средняя оценка
        advice: 'Вес может быть выше на 1-3 кг из-за задержки воды. Это НЕ жир!',
        excludeFromTrend: true,
        phaseColor: '#ec4899' // pink
      };
    }

    // Дни 6-7: Переходная фаза — остаточная задержка
    if (cycleDay >= 6 && cycleDay <= 7) {
      return {
        hasRetention: true,
        severity: 'low',
        kgEstimate: 0.5,
        advice: 'Вода уходит, вес постепенно нормализуется',
        excludeFromTrend: true, // Всё ещё лучше исключить
        phaseColor: '#f9a8d4' // pink-300 (светлее)
      };
    }

    // Дни 8-14: Фолликулярная/Овуляция — нет задержки
    return {
      hasRetention: false,
      severity: 'none',
      kgEstimate: 0,
      advice: null,
      excludeFromTrend: false
    };
  }

  /**
   * Проверить, нужно ли исключать день из тренда веса
   * @param {number|null} cycleDay 
   * @returns {boolean}
   */
  function shouldExcludeFromWeightTrend(cycleDay) {
    const info = getWaterRetentionInfo(cycleDay);
    return info.excludeFromTrend;
  }

  /**
   * Найти дату "День 1" цикла по любой дате в цикле
   * @param {string} dateStr - YYYY-MM-DD
   * @param {function} lsGet - Функция чтения (IGNORED, используется getDayKey)
   * @returns {string|null} Дата дня 1 или null
   */
  function findCycleStartDate(dateStr, lsGet) {
    try {
      const dayData = readDayData(dateStr, lsGet);

      if (!dayData || !dayData.cycleDay) return null;

      const offset = 1 - dayData.cycleDay;
      return addDays(dateStr, offset);
    } catch (e) {
      return null;
    }
  }

  // ============================================================
  // ИСТОРИЧЕСКИЙ АНАЛИЗ ЦИКЛОВ
  // ============================================================

  /**
   * Найти все циклы за указанный период
   * @param {number} monthsBack - Сколько месяцев назад искать (по умолчанию 6)
   * @param {function} lsGet - Функция чтения из localStorage
   * @returns {Array} Массив циклов [{ startDate, endDate, days: [...] }]
   */
  function findAllCycles(monthsBack = 6, lsGet) {
    const cycles = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - monthsBack);

    let currentCycle = null;

    // Проходим по всем дням
    for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);

      try {
        const dayData = readDayData(dateStr, lsGet);

        if (dayData && dayData.cycleDay) {
          // Нашли день цикла
          if (dayData.cycleDay === 1) {
            // Начало нового цикла
            if (currentCycle) {
              cycles.push(currentCycle);
            }
            currentCycle = {
              startDate: dateStr,
              endDate: dateStr,
              days: [{
                date: dateStr,
                cycleDay: dayData.cycleDay,
                weight: dayData.weightMorning || null
              }]
            };
          } else if (currentCycle) {
            // Продолжение цикла
            currentCycle.endDate = dateStr;
            currentCycle.days.push({
              date: dateStr,
              cycleDay: dayData.cycleDay,
              weight: dayData.weightMorning || null
            });
          }
        }
      } catch (e) {
        // Игнорируем ошибки чтения
      }
    }

    // Добавляем последний цикл
    if (currentCycle) {
      cycles.push(currentCycle);
    }

    return cycles;
  }

  /**
   * Анализ задержки воды по историческим данным
   * @param {number} monthsBack - Период анализа в месяцах
   * @param {function} lsGet - Функция чтения
   * @returns {Object} Статистика по циклам
   */
  function analyzeWaterRetentionHistory(monthsBack = 6, lsGet) {
    const cycles = findAllCycles(monthsBack, lsGet);

    if (cycles.length === 0) {
      return {
        hasSufficientData: false,
        cyclesAnalyzed: 0,
        message: 'Недостаточно данных для анализа'
      };
    }

    const retentionData = [];

    for (const cycle of cycles) {
      // Для анализа нужен вес в дни 1-5 и "нормальный" вес после (дни 8-14)
      const retentionDays = cycle.days.filter(d => d.cycleDay >= 1 && d.cycleDay <= 5 && d.weight > 0);
      const normalDays = cycle.days.filter(d => d.cycleDay >= 8 && d.weight > 0);

      if (retentionDays.length >= 2 && normalDays.length >= 1) {
        const avgRetentionWeight = retentionDays.reduce((s, d) => s + d.weight, 0) / retentionDays.length;
        const avgNormalWeight = normalDays.reduce((s, d) => s + d.weight, 0) / normalDays.length;
        const retention = avgRetentionWeight - avgNormalWeight;

        if (retention > 0) {
          retentionData.push({
            cycleStart: cycle.startDate,
            retentionKg: retention,
            peakDay: retentionDays.reduce((max, d) => d.weight > (max?.weight || 0) ? d : max, null)?.cycleDay || 2,
            avgRetentionWeight,
            avgNormalWeight,
            daysTracked: cycle.days.length
          });
        }
      }
    }

    if (retentionData.length === 0) {
      return {
        hasSufficientData: false,
        cyclesAnalyzed: cycles.length,
        message: 'Нет данных о весе для анализа задержки воды'
      };
    }

    // Статистика
    const avgRetention = retentionData.reduce((s, d) => s + d.retentionKg, 0) / retentionData.length;
    const maxRetention = Math.max(...retentionData.map(d => d.retentionKg));
    const minRetention = Math.min(...retentionData.map(d => d.retentionKg));
    const lastCycle = retentionData[retentionData.length - 1];
    const prevCycle = retentionData.length >= 2 ? retentionData[retentionData.length - 2] : null;

    // Тренд (улучшается/ухудшается)
    let trend = 'stable';
    if (retentionData.length >= 3) {
      const firstHalf = retentionData.slice(0, Math.floor(retentionData.length / 2));
      const secondHalf = retentionData.slice(Math.floor(retentionData.length / 2));
      const avgFirst = firstHalf.reduce((s, d) => s + d.retentionKg, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, d) => s + d.retentionKg, 0) / secondHalf.length;

      if (avgSecond < avgFirst - 0.3) trend = 'improving';
      else if (avgSecond > avgFirst + 0.3) trend = 'worsening';
    }

    return {
      hasSufficientData: true,
      cyclesAnalyzed: retentionData.length,
      totalCyclesFound: cycles.length,

      // Средние значения
      avgRetentionKg: Math.round(avgRetention * 10) / 10,
      maxRetentionKg: Math.round(maxRetention * 10) / 10,
      minRetentionKg: Math.round(minRetention * 10) / 10,

      // Последний цикл
      lastCycle: lastCycle ? {
        date: lastCycle.cycleStart,
        retentionKg: Math.round(lastCycle.retentionKg * 10) / 10,
        peakDay: lastCycle.peakDay
      } : null,

      // Сравнение с предыдущим
      comparison: prevCycle ? {
        diff: Math.round((lastCycle.retentionKg - prevCycle.retentionKg) * 10) / 10,
        improved: lastCycle.retentionKg < prevCycle.retentionKg
      } : null,

      // Тренд
      trend,
      trendText: trend === 'improving' ? 'Задержка воды уменьшается! 🎉' :
        trend === 'worsening' ? 'Задержка воды увеличивается' :
          'Стабильно',

      // Персональный инсайт
      insight: generateRetentionInsight(avgRetention, lastCycle, prevCycle, trend)
    };
  }

  /**
   * Генерация персонального инсайта
   */
  function generateRetentionInsight(avgRetention, lastCycle, prevCycle, trend) {
    const insights = [];

    // Средняя задержка
    if (avgRetention <= 1.0) {
      insights.push('У тебя небольшая задержка воды (~' + avgRetention.toFixed(1) + ' кг), это отлично!');
    } else if (avgRetention <= 2.0) {
      insights.push('Твоя типичная задержка воды: ~' + avgRetention.toFixed(1) + ' кг — это норма.');
    } else {
      insights.push('Задержка воды выше среднего (~' + avgRetention.toFixed(1) + ' кг). Попробуй снизить соль в эти дни.');
    }

    // Сравнение с прошлым циклом
    if (prevCycle && lastCycle) {
      const diff = lastCycle.retentionKg - prevCycle.retentionKg;
      if (Math.abs(diff) >= 0.5) {
        if (diff < 0) {
          insights.push('В прошлый раз задержка была меньше на ' + Math.abs(diff).toFixed(1) + ' кг! 💪');
        } else {
          insights.push('В этот раз задержка на ' + diff.toFixed(1) + ' кг больше — это может быть из-за питания.');
        }
      }
    }

    // Тренд
    if (trend === 'improving') {
      insights.push('За последние циклы задержка воды уменьшается — отличная динамика!');
    }

    return insights.length > 0 ? insights[0] : 'Вес после цикла всегда возвращается к норме.';
  }

  /**
   * Получить прогноз нормализации веса
   * @param {number} currentCycleDay - Текущий день цикла
   * @returns {Object} { daysUntilNormal, message }
   */
  function getWeightNormalizationForecast(currentCycleDay) {
    if (!currentCycleDay || currentCycleDay < 1) {
      return { daysUntilNormal: null, message: null };
    }

    // Вес нормализуется примерно к дню 8
    const targetDay = 8;
    const daysUntilNormal = Math.max(0, targetDay - currentCycleDay);

    if (currentCycleDay >= 8) {
      return {
        daysUntilNormal: 0,
        message: 'Вес уже должен быть в норме'
      };
    }

    if (daysUntilNormal === 0) {
      return {
        daysUntilNormal: 0,
        message: 'Вес нормализуется уже завтра!'
      };
    }

    if (daysUntilNormal === 1) {
      return {
        daysUntilNormal: 1,
        message: 'Ещё ~1 день до нормализации веса'
      };
    }

    return {
      daysUntilNormal,
      message: 'Вес нормализуется примерно через ' + daysUntilNormal + ' дней'
    };
  }

  // ============================================================
  // DEBUG: Показать дни с cycleDay за последние N дней
  // ============================================================

  /**
   * Вывести в консоль все дни с cycleDay за последние N дней
   * Вызов: HEYS.Cycle.debugCycleDays(14)
   * @param {number} daysBack - Сколько дней назад проверять (по умолчанию 14)
   */
  function debugCycleDays(daysBack = 14) {
    const today = new Date();
    const results = [];

    console.group('🌸 Cycle Days Debug (последние ' + daysBack + ' дней)');
    console.log('ClientId:', (window.HEYS && window.HEYS.currentClientId) || '(none)');

    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayNum = d.getDate();

      const key = getDayKey(dateStr);

      const dayData = readStoredValue(key, null);

      const cycleDay = dayData?.cycleDay || null;
      const weight = dayData?.weightMorning || null;
      const retentionInfo = getWaterRetentionInfo(cycleDay);

      results.push({
        date: dateStr,
        dayNum,
        cycleDay,
        hasRetention: retentionInfo.hasRetention,
        severity: retentionInfo.severity,
        weight,
        key // для дебага показываем ключ
      });

      // Логируем только дни с cycleDay или весом
      if (cycleDay || weight) {
        const icon = retentionInfo.hasRetention ? '🔴' : '⚪';
        console.log(
          `${icon} ${dateStr} (${dayNum}): cycleDay=${cycleDay || 'null'}, weight=${weight || '-'}, retention=${retentionInfo.hasRetention ? retentionInfo.severity : 'none'}`
        );
      }
    }

    console.groupEnd();
    console.table(results.filter(r => r.cycleDay || r.weight));

    return results;
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

    // Задержка воды и вес
    getWaterRetentionInfo,
    shouldExcludeFromWeightTrend,

    // Исторический анализ
    findAllCycles,
    analyzeWaterRetentionHistory,
    getWeightNormalizationForecast,

    // UI helpers
    getCycleDisplay,
    getCycleDescription,
    getCycleAdviceFlags,

    // Автоматическое проставление
    setCycleDaysAuto,
    clearCycleDays,
    findCycleStartDate,
    addDays,
    getDayKey, // для дебага и внешнего использования

    // Debug
    debugCycleDays
  };

  // console.log('[HEYS] Cycle module loaded v1.4.0 (fixed clientId in keys)');

})(typeof window !== 'undefined' ? window : global);
