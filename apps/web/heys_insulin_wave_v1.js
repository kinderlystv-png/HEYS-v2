// heys_insulin_wave_v1.js — Модуль инсулиновой волны
// Версия: 1.1.0 | Дата: 2025-12-05
// Вся логика расчёта и отображения инсулиновой волны
// Фичи: GI-based, protein/fiber bonus, workout acceleration, circadian rhythm
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === КОНСТАНТЫ ===
  const GI_CATEGORIES = {
    low: { min: 0, max: 35, multiplier: 1.2, color: '#22c55e', text: 'Низкий ГИ', desc: 'медленное усвоение' },
    medium: { min: 36, max: 55, multiplier: 1.0, color: '#eab308', text: 'Средний ГИ', desc: 'нормальное' },
    high: { min: 56, max: 70, multiplier: 0.85, color: '#f97316', text: 'Высокий ГИ', desc: 'быстрее' },
    veryHigh: { min: 71, max: 999, multiplier: 0.7, color: '#ef4444', text: 'Очень высокий', desc: 'очень быстро' }
  };
  
  const STATUS_CONFIG = {
    // Липолиз — жиросжигание активно! Каждая минута без еды = сжигание жира
    lipolysis: { emoji: '🔥', color: '#22c55e', label: 'Липолиз!' },
    // Почти закончилась волна — скоро липолиз
    almost: { emoji: '⏳', color: '#f97316', label: null },
    // Скоро закончится
    soon: { emoji: '🌊', color: '#eab308', label: null },
    // Волна активна — инсулин высокий, жир запасается
    active: { emoji: '📈', color: '#3b82f6', label: null }
  };
  
  const PROTEIN_BONUS = { high: { threshold: 40, bonus: 0.15 }, medium: { threshold: 25, bonus: 0.08 } };
  const FIBER_BONUS = { high: { threshold: 10, bonus: 0.12 }, medium: { threshold: 5, bonus: 0.05 } };
  
  // 🏃 WORKOUT ACCELERATION — тренировка ускоряет метаболизм
  const WORKOUT_BONUS = {
    // Минуты тренировки → бонус к скорости волны (уменьшение длительности)
    high: { threshold: 45, bonus: -0.15 },   // 45+ мин → волна на 15% короче
    medium: { threshold: 20, bonus: -0.08 }, // 20+ мин → волна на 8% короче
    // Интенсивные зоны (z3, z4) дают больший бонус
    intensityMultiplier: 1.5 // Интенсивные минуты считаются x1.5
  };
  
  // 🌅 CIRCADIAN RHYTHM — метаболизм меняется в течение дня
  const CIRCADIAN_MULTIPLIERS = {
    // Часы → множитель длины волны
    // Утром метаболизм быстрее, вечером — медленнее
    morning: { from: 6, to: 10, multiplier: 0.9, desc: 'Утренний метаболизм 🌅' },
    midday: { from: 10, to: 14, multiplier: 0.95, desc: 'Обеденный пик 🌞' },
    afternoon: { from: 14, to: 18, multiplier: 1.0, desc: 'Дневной баланс ☀️' },
    evening: { from: 18, to: 22, multiplier: 1.1, desc: 'Вечерний спад 🌆' },
    night: { from: 22, to: 6, multiplier: 1.2, desc: 'Ночной режим 🌙' }
  };
  
  const GAP_HISTORY_KEY = 'heys_meal_gaps_history';
  const GAP_HISTORY_DAYS = 14;
  
  // 🏆 LIPOLYSIS RECORDS & STREAKS
  const LIPOLYSIS_RECORD_KEY = 'heys_lipolysis_record';
  const LIPOLYSIS_STREAK_KEY = 'heys_lipolysis_streak';
  const LIPOLYSIS_HISTORY_KEY = 'heys_lipolysis_history';
  const MIN_LIPOLYSIS_FOR_STREAK = 4 * 60; // 4 часа минимум для streak
  const KCAL_PER_MIN_BASE = 1.0; // ~1 ккал/мин базовый расход в покое
  
  // === УТИЛИТЫ ===
  const utils = {
    // Время в минуты с полуночи (поддерживает 24:xx, 25:xx формат)
    timeToMinutes: (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      // 24:20 → 0*60 + 20 = 20, но для сортировки сохраняем как есть
      return (h || 0) * 60 + (m || 0);
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
    }
  };
  
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
  
  // === РАСЧЁТ ДАННЫХ ВОЛНЫ ===
  
  /**
   * Рассчитать нутриенты приёма пищи
   * @param {Object} meal - приём пищи
   * @param {Object} pIndex - индекс продуктов
   * @param {Function} getProductFromItem - функция получения продукта
   * @returns {Object} { avgGI, totalProtein, totalFiber, totalGrams, totalCarbs, totalSimple }
   */
  const calculateMealNutrients = (meal, pIndex, getProductFromItem) => {
    let totalGrams = 0;
    let weightedGI = 0;
    let totalProtein = 0;
    let totalFiber = 0;
    let totalCarbs = 0;
    let totalSimple = 0;
    
    const items = meal?.items || [];
    
    for (const item of items) {
      const grams = item.grams || 100;
      const prod = getProductFromItem(item, pIndex);
      
      const gi = prod?.gi || prod?.gi100 || prod?.GI || 50;
      weightedGI += gi * grams;
      totalGrams += grams;
      
      totalProtein += (prod?.protein100 || 0) * grams / 100;
      totalFiber += (prod?.fiber100 || 0) * grams / 100;
      
      // Углеводы для расчёта силы инсулиновой реакции
      const simple = prod?.simple100 || 0;
      const complex = prod?.complex100 || 0;
      totalSimple += simple * grams / 100;
      totalCarbs += (simple + complex) * grams / 100;
    }
    
    const avgGI = totalGrams > 0 ? Math.round(weightedGI / totalGrams) : 50;
    
    return {
      avgGI,
      totalProtein: Math.round(totalProtein),
      totalFiber: Math.round(totalFiber),
      totalGrams,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalSimple: Math.round(totalSimple * 10) / 10
    };
  };
  
  // === CARBS SCALING — длина волны зависит от количества углеводов ===
  // Меньше углеводов = короче волна (инсулиновый отклик пропорционален углеводам)
  const CARBS_SCALING = {
    // Минимальный порог — ниже этого инсулиновая реакция минимальна
    minThreshold: 5,     // < 5г углеводов = почти нет реакции
    // Порог для полной волны
    fullWaveThreshold: 30, // >= 30г = полная волна (100%)
    // Минимальный множитель волны при малых углеводах
    minMultiplier: 0.25   // 25% от базовой волны для минимальных углеводов
  };

  /**
   * Рассчитать множитель длины волны на основе количества углеводов
   * @param {number} carbs - общее количество углеводов в граммах
   * @returns {number} множитель 0.25-1.0
   */
  const calculateCarbsMultiplier = (carbs) => {
    if (carbs < CARBS_SCALING.minThreshold) {
      return CARBS_SCALING.minMultiplier;
    }
    if (carbs >= CARBS_SCALING.fullWaveThreshold) {
      return 1.0;
    }
    // Линейная интерполяция между minThreshold и fullWaveThreshold
    const range = CARBS_SCALING.fullWaveThreshold - CARBS_SCALING.minThreshold;
    const carbsAboveMin = carbs - CARBS_SCALING.minThreshold;
    const ratio = carbsAboveMin / range;
    return CARBS_SCALING.minMultiplier + ratio * (1 - CARBS_SCALING.minMultiplier);
  };

  /**
   * Рассчитать множитель длины волны
   * @param {number} gi - ГИ
   * @param {number} protein - белок в граммах
   * @param {number} fiber - клетчатка в граммах
   * @param {number} carbs - углеводы в граммах (опционально)
   * @returns {Object} { total, gi, protein, fiber, carbs }
   */
  const calculateMultiplier = (gi, protein, fiber, carbs = null) => {
    const giCat = utils.getGICategory(gi);
    let giMult = giCat.multiplier;
    
    let proteinBonus = 0;
    if (protein >= PROTEIN_BONUS.high.threshold) proteinBonus = PROTEIN_BONUS.high.bonus;
    else if (protein >= PROTEIN_BONUS.medium.threshold) proteinBonus = PROTEIN_BONUS.medium.bonus;
    
    let fiberBonus = 0;
    if (fiber >= FIBER_BONUS.high.threshold) fiberBonus = FIBER_BONUS.high.bonus;
    else if (fiber >= FIBER_BONUS.medium.threshold) fiberBonus = FIBER_BONUS.medium.bonus;
    
    // Базовый множитель от GI, белка и клетчатки
    const baseMult = giMult + proteinBonus + fiberBonus;
    
    // Множитель от количества углеводов (если переданы)
    const carbsMult = carbs !== null ? calculateCarbsMultiplier(carbs) : 1.0;
    
    return {
      total: baseMult * carbsMult,
      gi: giMult,
      protein: proteinBonus,
      fiber: fiberBonus,
      carbs: carbsMult,
      category: giCat
    };
  };
  
  /**
   * Рассчитать workout бонус (ускорение волны от тренировки)
   * @param {Array} trainings - массив тренировок дня
   * @returns {Object} { bonus, totalMinutes, intensityMinutes, desc }
   */
  const calculateWorkoutBonus = (trainings) => {
    if (!trainings || trainings.length === 0) {
      return { bonus: 0, totalMinutes: 0, intensityMinutes: 0, desc: null };
    }
    
    let totalMinutes = 0;
    let intensityMinutes = 0;
    
    for (const t of trainings) {
      const zones = t.z || [0, 0, 0, 0];
      // z[0], z[1] — низкая интенсивность, z[2], z[3] — высокая
      const lowIntensity = (zones[0] || 0) + (zones[1] || 0);
      const highIntensity = (zones[2] || 0) + (zones[3] || 0);
      
      totalMinutes += lowIntensity + highIntensity;
      // Интенсивные минуты с множителем
      intensityMinutes += lowIntensity + highIntensity * WORKOUT_BONUS.intensityMultiplier;
    }
    
    // Определяем бонус
    let bonus = 0;
    let desc = null;
    
    if (intensityMinutes >= WORKOUT_BONUS.high.threshold) {
      bonus = WORKOUT_BONUS.high.bonus;
      desc = `🏃 Тренировка ${Math.round(totalMinutes)} мин → волна ${Math.abs(Math.round(bonus * 100))}% короче`;
    } else if (intensityMinutes >= WORKOUT_BONUS.medium.threshold) {
      bonus = WORKOUT_BONUS.medium.bonus;
      desc = `🏃 Тренировка ${Math.round(totalMinutes)} мин → ускорение`;
    }
    
    return { bonus, totalMinutes: Math.round(totalMinutes), intensityMinutes: Math.round(intensityMinutes), desc };
  };
  
  /**
   * Рассчитать circadian множитель по времени суток
   * @param {number} hour - текущий час (0-23)
   * @returns {Object} { multiplier, period, desc }
   */
  const calculateCircadianMultiplier = (hour) => {
    // Находим период дня
    for (const [period, config] of Object.entries(CIRCADIAN_MULTIPLIERS)) {
      if (period === 'night') {
        // Ночь: 22-6 (переход через полночь)
        if (hour >= config.from || hour < config.to) {
          return { multiplier: config.multiplier, period, desc: config.desc };
        }
      } else {
        if (hour >= config.from && hour < config.to) {
          return { multiplier: config.multiplier, period, desc: config.desc };
        }
      }
    }
    
    // Fallback — дневной баланс
    return { multiplier: 1.0, period: 'afternoon', desc: CIRCADIAN_MULTIPLIERS.afternoon.desc };
  };
  
  /**
   * Главная функция расчёта данных инсулиновой волны
   * @param {Object} params
   * @returns {Object|null}
   */
  const calculateInsulinWaveData = ({ 
    meals, 
    pIndex, 
    getProductFromItem, 
    baseWaveHours = 3,
    trainings = [],
    now = new Date()
  }) => {
    if (!meals || meals.length === 0) return null;
    
    // Фильтруем приёмы с временем
    const mealsWithTime = meals.filter(m => m.time);
    if (mealsWithTime.length === 0) return null;
    
    // Сортируем по времени (последний первый)
    const sorted = [...mealsWithTime].sort((a, b) => {
      const timeA = (a.time || '').replace(':', '');
      const timeB = (b.time || '').replace(':', '');
      return timeB.localeCompare(timeA);
    });
    
    const lastMeal = sorted[0];
    const lastMealTime = lastMeal?.time;
    if (!lastMealTime) return null;
    
    // Расчёт нутриентов последнего приёма
    const nutrients = calculateMealNutrients(lastMeal, pIndex, getProductFromItem);
    const multipliers = calculateMultiplier(nutrients.avgGI, nutrients.totalProtein, nutrients.totalFiber, nutrients.totalCarbs);
    
    // 🏃 Workout бонус
    const workoutBonus = calculateWorkoutBonus(trainings);
    
    // 🌅 Circadian ритм (по времени приёма пищи)
    const mealHour = parseInt(lastMealTime.split(':')[0]) || 12;
    const circadian = calculateCircadianMultiplier(mealHour);
    
    // Финальный множитель: GI + protein/fiber + workout + circadian
    // multipliers.total уже включает GI + protein + fiber
    // workoutBonus.bonus отрицательный (ускоряет)
    // circadian.multiplier: утром < 1 (быстрее), вечером > 1 (медленнее)
    const finalMultiplier = (multipliers.total + workoutBonus.bonus) * circadian.multiplier;
    
    // Скорректированная длина волны
    const adjustedWaveHours = baseWaveHours * finalMultiplier;
    const waveMinutes = adjustedWaveHours * 60;
    
    // Время
    // mealMinutes может быть 24:xx (1440+) для ночных приёмов "сегодня до 3 ночи"
    const mealMinutes = utils.timeToMinutes(lastMealTime);
    let nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Корректировка для перехода через полночь:
    // 1) Приём в 24:xx формате (ночной), сейчас 00:xx-02:xx → добавляем 24ч к now
    // 2) Приём вечером (после 18:00), сейчас ночью (00:xx-05:xx) → добавляем 24ч к now
    const mealHourCalc = Math.floor(mealMinutes / 60);
    const nowHour = now.getHours();
    if (mealMinutes >= 24 * 60 && nowMinutes < 3 * 60) {
      // Случай 1: приём записан как 24:xx
      nowMinutes += 24 * 60;
    } else if (mealHourCalc >= 18 && nowHour < 6) {
      // Случай 2: приём вечером, сейчас ночь (перешли через полночь)
      nowMinutes += 24 * 60;
    }
    
    let diffMinutes = nowMinutes - mealMinutes;
    if (diffMinutes < 0) diffMinutes = 0;
    
    const remainingMinutes = Math.max(0, waveMinutes - diffMinutes);
    const progressPct = Math.min(100, (diffMinutes / waveMinutes) * 100);
    
    // Время окончания
    const endMinutes = mealMinutes + Math.round(waveMinutes);
    const endTime = utils.minutesToTime(endMinutes);
    
    // === История волн за день ===
    const waveHistory = sorted.map((meal, idx) => {
      const t = meal.time;
      if (!t) return null;
      
      const startMin = utils.timeToMinutes(t);
      const mealNutrients = calculateMealNutrients(meal, pIndex, getProductFromItem);
      const mealMult = calculateMultiplier(mealNutrients.avgGI, mealNutrients.totalProtein, mealNutrients.totalFiber, mealNutrients.totalCarbs);
      
      const duration = Math.round(baseWaveHours * mealMult.total * 60);
      const endMin = startMin + duration;
      
      return {
        time: t,
        timeDisplay: utils.normalizeTimeForDisplay(t),
        startMin,
        endMin,
        endTimeDisplay: utils.minutesToTime(endMin),
        duration,
        gi: mealNutrients.avgGI,
        protein: mealNutrients.totalProtein,
        fiber: mealNutrients.totalFiber,
        carbs: mealNutrients.totalCarbs,
        carbsMultiplier: mealMult.carbs,
        isActive: idx === 0 && remainingMinutes > 0
      };
    }).filter(Boolean).reverse();
    
    // === Анализ перекрытия волн ===
    const overlaps = [];
    for (let i = 0; i < waveHistory.length - 1; i++) {
      const current = waveHistory[i];
      const next = waveHistory[i + 1];
      if (current.endMin > next.startMin) {
        const overlapMin = current.endMin - next.startMin;
        overlaps.push({
          from: current.time,
          fromDisplay: current.timeDisplay,
          to: next.time,
          toDisplay: next.timeDisplay,
          overlapMinutes: overlapMin,
          severity: overlapMin > 60 ? 'high' : overlapMin > 30 ? 'medium' : 'low'
        });
      }
    }
    
    // === Персональная статистика ===
    const gaps = [];
    for (let i = 0; i < waveHistory.length - 1; i++) {
      gaps.push(waveHistory[i + 1].startMin - waveHistory[i].startMin);
    }
    const avgGapToday = gaps.length > 0 
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) 
      : 0;
    
    // История gaps
    let gapHistory = [];
    try {
      gapHistory = JSON.parse(localStorage.getItem(GAP_HISTORY_KEY) || '[]');
    } catch (e) {}
    
    const today = now.toISOString().slice(0, 10);
    const todayEntry = gapHistory.find(g => g.date === today);
    if (avgGapToday > 0) {
      if (todayEntry) {
        todayEntry.avgGap = avgGapToday;
        todayEntry.count = gaps.length;
      } else {
        gapHistory.push({ date: today, avgGap: avgGapToday, count: gaps.length });
      }
      gapHistory = gapHistory.slice(-GAP_HISTORY_DAYS);
      try {
        localStorage.setItem(GAP_HISTORY_KEY, JSON.stringify(gapHistory));
      } catch (e) {}
    }
    
    const personalAvgGap = gapHistory.length > 0
      ? Math.round(gapHistory.reduce((sum, g) => sum + g.avgGap, 0) / gapHistory.length)
      : 0;
    
    const recommendedGap = Math.round(baseWaveHours * 60);
    
    let gapQuality = 'unknown';
    if (personalAvgGap > 0) {
      if (personalAvgGap >= recommendedGap * 0.9) gapQuality = 'excellent';
      else if (personalAvgGap >= recommendedGap * 0.75) gapQuality = 'good';
      else if (personalAvgGap >= recommendedGap * 0.5) gapQuality = 'moderate';
      else gapQuality = 'needs-work';
    }
    
    // === Статус ===
    const currentHour = now.getHours();
    const isNight = utils.isNightTime(currentHour);
    
    let status, emoji, text, color, subtext;
    
    if (remainingMinutes <= 0) {
      status = 'lipolysis';
      emoji = STATUS_CONFIG.lipolysis.emoji;
      text = STATUS_CONFIG.lipolysis.label;
      color = STATUS_CONFIG.lipolysis.color;
      
      // Липолиз активен! Поощряем продлить это состояние
      if (isNight) {
        subtext = '🌙 Идеально! Ночной липолиз до утра';
      } else {
        subtext = '💪 Жиросжигание идёт! Продержись подольше';
      }
    } else if (remainingMinutes <= 15) {
      status = 'almost';
      emoji = STATUS_CONFIG.almost.emoji;
      text = `${Math.ceil(remainingMinutes)} мин`;
      color = STATUS_CONFIG.almost.color;
      subtext = '⏳ Скоро начнётся липолиз!';
    } else if (remainingMinutes <= 30) {
      status = 'soon';
      emoji = STATUS_CONFIG.soon.emoji;
      text = `${Math.ceil(remainingMinutes)} мин`;
      color = STATUS_CONFIG.soon.color;
      subtext = '🍵 Вода не прерывает липолиз';
    } else {
      status = 'active';
      emoji = STATUS_CONFIG.active.emoji;
      text = utils.formatDuration(remainingMinutes);
      color = STATUS_CONFIG.active.color;
      subtext = '📈 Инсулин высокий, жир запасается';
    }
    
    // 🔥 Время липолиза (сколько прошло с конца волны)
    // diffMinutes - время с последнего приёма
    // waveMinutes - длина волны
    // lipolysisMinutes = diffMinutes - waveMinutes (время ПОСЛЕ окончания волны)
    const lipolysisMinutes = diffMinutes > waveMinutes ? Math.round(diffMinutes - waveMinutes) : 0;
    
    return {
      // Статус
      status, emoji, text, color, subtext,
      
      // Прогресс
      progress: progressPct,
      remaining: remainingMinutes,
      lipolysisMinutes,
      
      // Время (для сортировки храним как есть, для отображения нормализуем)
      lastMealTime,
      lastMealTimeDisplay: utils.normalizeTimeForDisplay(lastMealTime),
      endTime,
      endTimeDisplay: utils.normalizeTimeForDisplay(endTime),
      
      // Волна
      insulinWaveHours: adjustedWaveHours,
      baseWaveHours,
      
      // Флаги
      isNightTime: isNight,
      
      // ГИ данные
      avgGI: nutrients.avgGI,
      giCategory: multipliers.category,
      giMultiplier: multipliers.gi,
      
      // Нутриенты
      totalProtein: nutrients.totalProtein,
      totalFiber: nutrients.totalFiber,
      totalCarbs: nutrients.totalCarbs,
      totalSimple: nutrients.totalSimple,
      proteinBonus: multipliers.protein,
      fiberBonus: multipliers.fiber,
      carbsMultiplier: multipliers.carbs,
      
      // 🏃 Workout данные
      workoutBonus: workoutBonus.bonus,
      workoutMinutes: workoutBonus.totalMinutes,
      workoutDesc: workoutBonus.desc,
      hasWorkoutBonus: workoutBonus.bonus < 0,
      
      // 🌅 Circadian данные
      circadianMultiplier: circadian.multiplier,
      circadianPeriod: circadian.period,
      circadianDesc: circadian.desc,
      
      // История
      waveHistory,
      
      // Перекрытия
      overlaps,
      hasOverlaps: overlaps.length > 0,
      worstOverlap: overlaps.reduce((max, o) => 
        o.overlapMinutes > (max?.overlapMinutes || 0) ? o : max, null),
      
      // Персональная статистика
      avgGapToday,
      personalAvgGap,
      recommendedGap,
      gapQuality,
      gapHistory: gapHistory.slice(-7),
      
      // === НОВЫЕ КОНТЕКСТНЫЕ ДАННЫЕ ===
      
      // 💡 Рекомендации по еде (если волна активна)
      foodAdvice: remainingMinutes > 0 ? {
        good: ['белок', 'овощи', 'орехи', 'яйца'],
        avoid: ['сладкое', 'белый хлеб', 'сок', 'фрукты'],
        reason: nutrients.avgGI > 60 
          ? 'Последний приём был с высоким ГИ — дай инсулину успокоиться'
          : 'Поддерживай стабильный сахар'
      } : null,
      
      // ⏰ Оптимальное время следующего приёма
      nextMealTime: (() => {
        const endMin = utils.timeToMinutes(lastMealTime) + Math.round(waveMinutes);
        // Если ночь — рекомендуем утро
        if (isNight || endMin >= 22 * 60) {
          return { time: '08:00', isNextDay: true, label: 'завтра в 8:00' };
        }
        const time = utils.minutesToTime(endMin);
        return { time, isNextDay: false, label: `в ${time}` };
      })(),
      
      // 💧 Hydration совет
      hydrationAdvice: remainingMinutes > 15 
        ? '💧 Вода ускоряет переваривание — выпей стакан'
        : null,
      
      // 😴 Sleep impact (поздний ужин)
      sleepImpact: (() => {
        const hour = parseInt(lastMealTime.split(':')[0]) || 0;
        if (hour >= 21) {
          return { 
            warning: true, 
            text: '😴 Поздний ужин замедляет волну на ~20%',
            penalty: 0.2
          };
        }
        if (hour >= 20) {
          return { 
            warning: false, 
            text: '🌙 Вечерний приём — волна чуть медленнее',
            penalty: 0.1
          };
        }
        return null;
      })(),
      
      // 🎯 Краткий совет для подсказки
      quickTip: (() => {
        if (remainingMinutes <= 0) return '🔥 Липолиз! Держись!';
        if (remainingMinutes <= 15) return '⏳ Скоро липолиз!';
        if (nutrients.avgGI > 70) return '⚠️ Был высокий ГИ — лучше подождать';
        if (remainingMinutes > 60) return '🍵 Выпей воды или чая';
        return '⏳ Дай организму переварить';
      })(),
      
      // 🏆 Рекорд липолиза
      lipolysisRecord: getLipolysisRecord(),
      
      // 🔥 Streak липолиза
      lipolysisStreak: calculateLipolysisStreak(),
      
      // 💪 Примерно сожжённые калории (если липолиз активен)
      lipolysisKcal: lipolysisMinutes > 0 ? calculateLipolysisKcal(lipolysisMinutes) : 0,
      
      // Проверка на новый рекорд
      isNewRecord: lipolysisMinutes > 0 && lipolysisMinutes > getLipolysisRecord().minutes
    };
  };
  
  // === UI КОМПОНЕНТЫ ===
  
  /**
   * Форматирование времени липолиза
   */
  const formatLipolysisTime = (minutes) => {
    if (minutes < 60) return `${minutes} мин`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h}ч`;
    return `${h}ч ${m}м`;
  };
  
  /**
   * Рендер прогресс-бара волны
   */
  const renderProgressBar = (data) => {
    const progress = data.progress || 0;
    const isLipolysis = data.status === 'lipolysis';
    const lipolysisMinutes = data.lipolysisMinutes || 0;
    
    const getGradient = (pct) => {
      if (pct < 50) return `linear-gradient(90deg, #0ea5e9 0%, #3b82f6 ${pct * 2}%)`;
      if (pct < 80) return `linear-gradient(90deg, #0ea5e9 0%, #3b82f6 50%, #8b5cf6 ${pct}%)`;
      if (pct < 95) return `linear-gradient(90deg, #3b82f6 0%, #8b5cf6 60%, #f97316 ${pct}%)`;
      return `linear-gradient(90deg, #8b5cf6 0%, #f97316 70%, #22c55e 100%)`;
    };
    
    // При липолизе — зелёный градиент
    const lipolysisGradient = 'linear-gradient(90deg, #22c55e 0%, #10b981 50%, #059669 100%)';
    
    return React.createElement('div', {
      className: 'insulin-wave-progress',
      style: { position: 'relative', marginTop: '8px' }
    },
      React.createElement('div', {
        style: {
          height: isLipolysis ? '28px' : '12px',
          background: '#e5e7eb',
          borderRadius: isLipolysis ? '8px' : '6px',
          overflow: 'hidden',
          position: 'relative',
          transition: 'height 0.3s ease'
        }
      },
        React.createElement('div', {
          className: isLipolysis ? 'lipolysis-progress-fill' : 'insulin-progress-fill',
          style: {
            position: 'absolute',
            left: 0, top: 0, height: '100%',
            width: '100%',
            background: isLipolysis ? lipolysisGradient : getGradient(progress),
            borderRadius: isLipolysis ? '8px' : '6px',
            transition: 'width 0.5s ease-out'
          }
        }),
        // При липолизе: крупный таймер "🔥 Xч Yм"
        isLipolysis ? React.createElement('div', {
          className: 'lipolysis-timer-display',
          style: {
            position: 'absolute',
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '14px',
            fontWeight: '800',
            color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap'
          }
        },
          React.createElement('span', { 
            className: 'lipolysis-fire-icon',
            style: { fontSize: '16px' } 
          }, '🔥'),
          React.createElement('span', null, formatLipolysisTime(lipolysisMinutes)),
          React.createElement('span', { 
            style: { fontSize: '11px', opacity: 0.9, fontWeight: '600' } 
          }, 'жиросжигание')
        )
        // При активной волне: процент
        : React.createElement('div', {
          style: {
            position: 'absolute',
            left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '10px',
            fontWeight: '700',
            color: progress > 50 ? '#fff' : '#64748b',
            textShadow: progress > 50 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none'
          }
        }, `${Math.round(progress)}%`)
      )
    );
  };
  
  /**
   * Рендер истории волн (мини-график)
   */
  const renderWaveHistory = (data) => {
    const history = data.waveHistory || [];
    if (history.length === 0) return null;
    
    const firstMealMin = Math.min(...history.map(w => w.startMin));
    const lastMealEnd = Math.max(...history.map(w => w.endMin));
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    
    const rangeStart = firstMealMin - 15;
    const rangeEnd = Math.max(nowMin, lastMealEnd) + 15;
    const totalRange = rangeEnd - rangeStart;
    
    const w = 320;
    const h = 60;
    const padding = 4;
    const barY = 20;
    const barH = 18;
    
    const minToX = (min) => padding + ((min - rangeStart) / totalRange) * (w - 2 * padding);
    
    return React.createElement('div', { 
      className: 'insulin-history', 
      style: { marginTop: '12px', margin: '12px -8px 0 -8px' } 
    },
      React.createElement('div', { 
        style: { fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: '600', paddingLeft: '8px' } 
      }, '📊 Волны сегодня'),
      
      React.createElement('svg', { 
        width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, style: { display: 'block' }
      },
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'activeWaveGrad2', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            React.createElement('stop', { offset: '0%', stopColor: '#3b82f6' }),
            React.createElement('stop', { offset: '100%', stopColor: '#8b5cf6' })
          )
        ),
        
        // Фоновая линия
        React.createElement('line', {
          x1: padding, y1: barY + barH / 2, x2: w - padding, y2: barY + barH / 2,
          stroke: '#e5e7eb', strokeWidth: 2, strokeLinecap: 'round'
        }),
        
        // Волны
        history.map((wave, i) => {
          const x1 = minToX(wave.startMin);
          const x2 = minToX(wave.endMin);
          const barW = Math.max(8, x2 - x1);
          const giColor = wave.gi <= 35 ? '#22c55e' : wave.gi <= 55 ? '#eab308' : wave.gi <= 70 ? '#f97316' : '#ef4444';
          
          return React.createElement('g', { key: 'wave-' + i },
            React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: wave.isActive ? 'url(#activeWaveGrad2)' : giColor,
              opacity: wave.isActive ? 1 : 0.6,
              rx: 4
            }),
            wave.isActive && React.createElement('rect', {
              x: x1, y: barY, width: barW, height: barH,
              fill: 'none', stroke: '#3b82f6', strokeWidth: 2, rx: 4,
              className: 'wave-active-pulse'
            })
          );
        }),
        
        // Точки приёмов
        history.map((wave, i) => {
          const x = minToX(wave.startMin);
          return React.createElement('g', { key: 'meal-' + i },
            React.createElement('circle', { cx: x, cy: barY + barH / 2, r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }),
            React.createElement('text', { x, y: barY + barH / 2 + 1, fontSize: 8, textAnchor: 'middle', dominantBaseline: 'middle' }, '🍽'),
            React.createElement('text', { x, y: h - 2, fontSize: 8, fill: '#64748b', textAnchor: 'middle', fontWeight: '500' }, 
              utils.minutesToTime(wave.startMin))
          );
        }),
        
        // Текущее время
        (() => {
          const x = minToX(nowMin);
          if (x < padding || x > w - padding) return null;
          return React.createElement('g', null,
            React.createElement('line', { x1: x, y1: barY - 5, x2: x, y2: barY + barH + 5, stroke: '#ef4444', strokeWidth: 2, strokeLinecap: 'round' }),
            React.createElement('polygon', { points: `${x-4},${barY-5} ${x+4},${barY-5} ${x},${barY}`, fill: '#ef4444' }),
            React.createElement('text', { x, y: barY - 8, fontSize: 8, fill: '#ef4444', textAnchor: 'middle', fontWeight: '600' }, 'Сейчас')
          );
        })()
      ),
      
      // Легенда
      React.createElement('div', { 
        className: 'insulin-history-legend',
        style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px', fontSize: '10px', color: '#64748b', paddingLeft: '8px' }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #3b82f6', background: '#fff' } }),
          'Приём'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '16px', height: '8px', borderRadius: '2px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' } }),
          'Активная'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#22c55e' } }),
          'Низкий ГИ'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '8px', height: '8px', borderRadius: '2px', background: '#eab308' } }),
          'Средний'
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '3px' } },
          React.createElement('span', { style: { width: '12px', height: '2px', background: '#ef4444' } }),
          'Сейчас'
        )
      )
    );
  };
  
  /**
   * Рендер expanded секции с детальной информацией
   */
  const renderExpandedSection = (data) => {
    const giCat = data.giCategory;
    
    return React.createElement('div', { 
      className: 'insulin-wave-expanded'
      // Клик на expanded также сворачивает (не блокируем propagation)
    },
      // ГИ информация
      React.createElement('div', { className: 'insulin-gi-info' },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: giCat.color } }),
          React.createElement('span', { style: { fontWeight: '600' } }, giCat.text),
          React.createElement('span', { style: { color: '#64748b', fontSize: '12px' } }, '— ' + giCat.desc)
        ),
        React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } },
          `Базовая волна: ${data.baseWaveHours}ч → Скорректированная: ${Math.round(data.insulinWaveHours * 10) / 10}ч`
        ),
        // Формула расчёта (если есть модификаторы)
        (data.carbsMultiplier < 1 || data.proteinBonus > 0 || data.fiberBonus > 0 || data.hasWorkoutBonus || (data.circadianMultiplier && data.circadianMultiplier !== 1.0)) &&
          React.createElement('div', { 
            style: { fontSize: '10px', color: '#94a3b8', marginTop: '6px', padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: '4px', fontFamily: 'monospace' } 
          },
            (() => {
              const parts = [];
              // Carbs factor (если малое количество углеводов)
              if (data.carbsMultiplier && data.carbsMultiplier < 1) {
                parts.push(`углев.${data.totalCarbs}г×${Math.round(data.carbsMultiplier * 100) / 100}`);
              }
              // GI factor
              const giFactor = data.giMultiplier || 1.0;
              parts.push(`ГИ×${Math.round(giFactor * 100) / 100}`);
              // Protein
              if (data.proteinBonus > 0) parts.push(`+${Math.round(data.proteinBonus * 100)}%🥩`);
              // Fiber
              if (data.fiberBonus > 0) parts.push(`+${Math.round(data.fiberBonus * 100)}%🌾`);
              // Workout
              if (data.hasWorkoutBonus) parts.push(`${Math.round(data.workoutBonus * 100)}%🏃`);
              // Circadian
              if (data.circadianMultiplier && data.circadianMultiplier !== 1.0) {
                parts.push(`×${data.circadianMultiplier}${data.circadianMultiplier < 1.0 ? '☀️' : '🌙'}`);
              }
              return `📐 ${parts.join(' ')} = ${Math.round(data.insulinWaveHours * 10) / 10}ч`;
            })()
          ),
        // Углеводы (если мало = короче волна)
        data.carbsMultiplier && data.carbsMultiplier < 1 && React.createElement('div', { 
          style: { fontSize: '11px', color: '#3b82f6', marginTop: '2px' } 
        }, `🍬 Углеводов ${data.totalCarbs}г — волна ${Math.round((1 - data.carbsMultiplier) * 100)}% короче`),
        // Модификаторы
        (data.proteinBonus > 0 || data.fiberBonus > 0) && 
          React.createElement('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            data.totalProtein > 0 && React.createElement('span', null, 
              `🥩 Белок: ${data.totalProtein}г${data.proteinBonus > 0 ? ` (+${Math.round(data.proteinBonus * 100)}%)` : ''}`
            ),
            data.totalFiber > 0 && React.createElement('span', null, 
              `🌾 Клетчатка: ${data.totalFiber}г${data.fiberBonus > 0 ? ` (+${Math.round(data.fiberBonus * 100)}%)` : ''}`
            )
          ),
        // Workout bonus
        data.hasWorkoutBonus && React.createElement('div', { 
          style: { fontSize: '11px', color: '#10b981', marginTop: '2px' } 
        }, `🏃 Тренировка ${data.workoutMinutes} мин → волна ${Math.abs(Math.round(data.workoutBonus * 100))}% короче`),
        // Circadian rhythm
        data.circadianMultiplier && data.circadianMultiplier !== 1.0 && React.createElement('div', { 
          style: { 
            fontSize: '11px', 
            color: data.circadianMultiplier < 1.0 ? '#10b981' : '#f59e0b', 
            marginTop: '2px' 
          } 
        }, data.circadianDesc)
      ),
      
      // Предупреждение о перекрытии
      data.hasOverlaps && React.createElement('div', { 
        className: 'insulin-overlap-warning',
        style: { 
          marginTop: '8px', padding: '8px', 
          background: data.worstOverlap?.severity === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
          borderRadius: '8px', fontSize: '12px',
          border: `1px solid ${data.worstOverlap?.severity === 'high' ? '#fca5a5' : '#fcd34d'}`
        }
      },
        React.createElement('div', { style: { fontWeight: '600', color: data.worstOverlap?.severity === 'high' ? '#dc2626' : '#d97706' } },
          '⚠️ Волны пересеклись!'
        ),
        React.createElement('div', { style: { marginTop: '2px', color: '#64748b' } },
          data.overlaps.map((o, i) => 
            React.createElement('div', { key: i }, `${o.fromDisplay || o.from} → ${o.toDisplay || o.to}: перекрытие ${o.overlapMinutes} мин`)
          )
        ),
        React.createElement('div', { style: { marginTop: '4px', fontSize: '11px', fontStyle: 'italic' } },
          `💡 Совет: подожди минимум ${Math.round(data.baseWaveHours * 60)} мин между приёмами`
        )
      ),
      
      // Персональная статистика
      data.personalAvgGap > 0 && React.createElement('div', { 
        className: 'insulin-personal-stats',
        style: { marginTop: '8px', padding: '8px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', fontSize: '12px' }
      },
        React.createElement('div', { style: { fontWeight: '600', color: '#3b82f6', marginBottom: '4px' } }, '📊 Твои паттерны'),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b' } },
          React.createElement('span', null, 'Сегодня между приёмами:'),
          React.createElement('span', { style: { fontWeight: '600' } }, 
            data.avgGapToday > 0 ? utils.formatDuration(data.avgGapToday) : '—'
          )
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
          React.createElement('span', null, 'Твой средний gap:'),
          React.createElement('span', { style: { fontWeight: '600' } }, utils.formatDuration(data.personalAvgGap))
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '2px' } },
          React.createElement('span', null, 'Рекомендуемый:'),
          React.createElement('span', { style: { fontWeight: '600' } }, utils.formatDuration(data.recommendedGap))
        ),
        // Оценка
        React.createElement('div', { 
          style: { 
            marginTop: '6px', padding: '4px 8px', borderRadius: '4px', textAlign: 'center', fontWeight: '600',
            background: data.gapQuality === 'excellent' ? '#dcfce7' : data.gapQuality === 'good' ? '#fef9c3' : data.gapQuality === 'moderate' ? '#fed7aa' : '#fecaca',
            color: data.gapQuality === 'excellent' ? '#166534' : data.gapQuality === 'good' ? '#854d0e' : data.gapQuality === 'moderate' ? '#c2410c' : '#dc2626'
          }
        },
          data.gapQuality === 'excellent' ? '🌟 Отлично! Выдерживаешь оптимальные промежутки' :
          data.gapQuality === 'good' ? '👍 Хорошо! Почти идеальные промежутки' :
          data.gapQuality === 'moderate' ? '😐 Можно лучше. Попробуй увеличить gap' :
          '⚠️ Ешь слишком часто. Дай организму переварить'
        )
      ),
      
      // === КОНТЕКСТНЫЕ СОВЕТЫ ===
      
      // 🔥 Липолиз активен — поощряем продержаться
      data.status === 'lipolysis' && React.createElement('div', {
        style: { 
          marginTop: '8px', padding: '10px', 
          background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(16,185,129,0.15))',
          borderRadius: '8px', fontSize: '12px',
          border: '1px solid rgba(34,197,94,0.3)'
        }
      },
        React.createElement('div', { style: { fontWeight: '600', color: '#16a34a', marginBottom: '4px' } }, 
          '🔥 Жиросжигание активно!'
        ),
        React.createElement('div', { style: { color: '#15803d', fontSize: '11px' } }, 
          'Каждая минута без еды = сжигание жира. Продержись как можно дольше!'
        ),
        React.createElement('div', { style: { color: '#64748b', fontSize: '10px', marginTop: '4px' } }, 
          '💧 Вода, чай, кофе без сахара — не прерывают липолиз'
        )
      ),
      
      // 📈 Волна активна — объясняем что происходит
      data.status === 'active' && React.createElement('div', {
        style: { 
          marginTop: '8px', padding: '8px', 
          background: 'rgba(59,130,246,0.1)',
          borderRadius: '8px', fontSize: '12px',
          border: '1px solid rgba(59,130,246,0.2)'
        }
      },
        React.createElement('div', { style: { fontWeight: '600', color: '#3b82f6', marginBottom: '4px' } }, 
          '📈 Инсулин высокий'
        ),
        React.createElement('div', { style: { color: '#64748b', fontSize: '11px' } }, 
          'Организм в режиме запасания. Если поешь сейчас — волна продлится ещё дольше.'
        )
      ),
      
      // 💡 Рекомендации по еде (если волна активна, но очень хочется)
      data.foodAdvice && React.createElement('div', {
        style: { 
          marginTop: '8px', padding: '8px', 
          background: 'rgba(251,191,36,0.1)',
          borderRadius: '8px', fontSize: '12px',
          border: '1px solid rgba(251,191,36,0.2)'
        }
      },
        React.createElement('div', { style: { fontWeight: '600', color: '#d97706', marginBottom: '4px' } }, 
          '💡 Если очень хочется есть:'
        ),
        React.createElement('div', { style: { color: '#16a34a', fontSize: '11px' } }, 
          '✅ Лучше: ' + data.foodAdvice.good.join(', ')
        ),
        React.createElement('div', { style: { color: '#dc2626', fontSize: '11px', marginTop: '2px' } }, 
          '❌ Избегай: ' + data.foodAdvice.avoid.join(', ')
        ),
        React.createElement('div', { style: { color: '#64748b', fontSize: '10px', marginTop: '4px', fontStyle: 'italic' } }, 
          data.foodAdvice.reason
        )
      ),
      
      // 💧 Hydration совет
      data.hydrationAdvice && React.createElement('div', {
        style: { 
          marginTop: '8px', padding: '6px 8px', 
          background: 'rgba(59,130,246,0.1)',
          borderRadius: '6px', fontSize: '11px',
          color: '#3b82f6'
        }
      }, data.hydrationAdvice),
      
      // 😴 Sleep impact
      data.sleepImpact && React.createElement('div', {
        style: { 
          marginTop: '8px', padding: '6px 8px', 
          background: data.sleepImpact.warning ? 'rgba(239,68,68,0.1)' : 'rgba(148,163,184,0.1)',
          borderRadius: '6px', fontSize: '11px',
          color: data.sleepImpact.warning ? '#dc2626' : '#64748b'
        }
      }, data.sleepImpact.text),
      
      // История волн
      renderWaveHistory(data)
    );
  };
  
  // === Hook для использования в компоненте ===
  const useInsulinWave = ({ meals, pIndex, getProductFromItem, baseWaveHours = 3 }) => {
    const [expanded, setExpanded] = React.useState(false);
    const [isShaking, setIsShaking] = React.useState(false);
    
    // Текущая минута для авто-обновления
    const [currentMinute, setCurrentMinute] = React.useState(() => {
      const now = new Date();
      return now.getHours() * 60 + now.getMinutes();
    });
    
    // Обновление каждую минуту
    React.useEffect(() => {
      const interval = setInterval(() => {
        const now = new Date();
        setCurrentMinute(now.getHours() * 60 + now.getMinutes());
      }, 60000);
      return () => clearInterval(interval);
    }, []);
    
    // Расчёт данных
    const data = React.useMemo(() => {
      return calculateInsulinWaveData({
        meals,
        pIndex,
        getProductFromItem,
        baseWaveHours
      });
    }, [meals, pIndex, baseWaveHours, currentMinute]);
    
    // Shake при almost
    React.useEffect(() => {
      if (data?.status === 'almost' && !isShaking) {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 500);
      }
    }, [data?.status]);
    
    const toggle = React.useCallback(() => setExpanded(prev => !prev), []);
    
    return {
      data,
      expanded,
      setExpanded,
      toggle,
      isShaking,
      renderProgressBar: () => data ? renderProgressBar(data) : null,
      renderWaveHistory: () => data ? renderWaveHistory(data) : null,
      renderExpandedSection: () => data ? renderExpandedSection(data) : null
    };
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = {
    // Главная функция расчёта
    calculate: calculateInsulinWaveData,
    
    // Hook
    useInsulinWave,
    
    // UI компоненты
    renderProgressBar,
    renderWaveHistory,
    renderExpandedSection,
    
    // Утилиты
    utils,
    calculateMealNutrients,
    calculateMultiplier,
    calculateWorkoutBonus,
    calculateCircadianMultiplier,
    
    // 🏆 Рекорды и streak
    getLipolysisRecord,
    updateLipolysisRecord,
    saveDayLipolysis,
    calculateLipolysisStreak,
    calculateLipolysisKcal,
    
    // Константы
    GI_CATEGORIES,
    STATUS_CONFIG,
    PROTEIN_BONUS,
    FIBER_BONUS,
    WORKOUT_BONUS,
    CIRCADIAN_MULTIPLIERS,
    MIN_LIPOLYSIS_FOR_STREAK,
    
    // Версия
    VERSION: '1.2.0'
  };
  
  // Алиас
  HEYS.IW = HEYS.InsulinWave;
  
  console.log('[HEYS] InsulinWave v1.2.0 loaded (lipolysis records + streak)');
  
})(typeof window !== 'undefined' ? window : global);
