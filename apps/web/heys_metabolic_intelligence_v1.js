// heys_metabolic_intelligence_v1.js — Metabolic Intelligence Module v1.0.1
// META-версия: полная научная аналитика метаболического здоровья
// Зависимости: HEYS.InsulinWave, HEYS.PredictiveInsights, HEYS.ratioZones, U.lsGet/lsSet
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};
  
  // === HELPER: localStorage с поддержкой clientId namespace ===
  // ВАЖНО: Данные хранятся с clientId prefix: heys_${clientId}_dayv2_2025-12-15
  function getScopedLsGet() {
    // Если U.lsGet доступен — он уже умеет работать с clientId
    if (U.lsGet) return U.lsGet;
    
    // Fallback с поддержкой clientId
    return function(key, defaultVal) {
      try {
        // Пробуем через HEYS.store.get который учитывает clientId
        if (window.HEYS?.store?.get) {
          return window.HEYS.store.get(key, defaultVal);
        }
        // Fallback: пробуем с clientId prefix для client-specific ключей
        const clientId = localStorage.getItem('heys_client_current');
        const isClientKey = key.includes('dayv2_') || key === 'heys_profile' || 
                           key === 'heys_products' || key === 'heys_norms';
        if (clientId && isClientKey) {
          const scopedKey = `heys_${clientId}_${key.replace('heys_', '')}`;
          const val = localStorage.getItem(scopedKey);
          if (val) return JSON.parse(val);
        }
        // Last resort: без prefix
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : defaultVal;
      } catch (e) {
        return defaultVal;
      }
    };
  }
  
  // === КОНСТАНТЫ ===
  const CONFIG = {
    VERSION: '1.0.1',
    CACHE_TTL_MS: 2 * 60 * 1000, // 2 минуты
    MAX_HISTORY_DAYS: 90,
    MIN_DATA_FOR_PHENOTYPE: 30,
    FEATURE_FLAG_KEY: 'heys_feature_metabolic_intelligence',
    SMOOTHING_ALPHA: 0.3, // EMA сглаживание
    MAX_SCORE_CHANGE_PER_UPDATE: 15, // Максимальное изменение score за раз
    
    // Пороги риска (с гистерезисом)
    RISK_THRESHOLDS: {
      low: { enter: 30, exit: 25 },
      medium: { enter: 60, exit: 55 },
      high: { enter: 85, exit: 80 }
    }
  };
  
  // === НАУЧНЫЕ БАЗОВЫЕ ЗНАЧЕНИЯ ===
  const BASELINE = {
    // Базовый период инсулиновой волны (часы)
    WAVE_DURATION: 3,
    
    // Пороги для оценки
    PROTEIN_MIN_G_PER_KG: 0.8,
    FIBER_MIN_G_PER_1000_KCAL: 14,
    SLEEP_OPTIMAL_HOURS: 8,
    WATER_MIN_ML_PER_KG: 30,
    STEPS_MIN: 8000,
    
    // Фазы метаболизма (часы от последнего приёма)
    PHASES: {
      ANABOLIC: { from: 0, to: 3, label: 'Анаболическая', emoji: '📈' },
      TRANSITIONAL: { from: 3, to: 5, label: 'Переходная', emoji: '⚖️' },
      CATABOLIC: { from: 5, to: 24, label: 'Катаболическая', emoji: '🔥' }
    }
  };
  
  // Кэш для расчётов
  let _cache = {
    status: null,
    timestamp: 0,
    clientId: null,
    smoothedScore: null,
    lastRiskLevel: 'low'
  };
  
  // === PHASE 0: DATA INVENTORY ===
  
  /**
   * Инвентаризация данных — проверка доступности полей
   * @param {string} dateStr - дата в формате YYYY-MM-DD
   * @returns {Object} объект с флагами доступности данных
   */
  function inventoryData(dateStr) {
    const lsGet = getScopedLsGet();
    
    const day = lsGet(`heys_dayv2_${dateStr}`, {});
    const profile = lsGet('heys_profile', {});
    
    return {
      // День
      hasMeals: Boolean(day.meals && day.meals.length > 0),
      hasSleep: Boolean(day.sleepHours || (day.sleepStart && day.sleepEnd)),
      hasWeight: Boolean(day.weightMorning),
      hasWater: Boolean(day.waterMl),
      hasSteps: Boolean(day.steps),
      hasTrainings: Boolean(day.trainings && day.trainings.length > 0),
      hasStress: Boolean(day.stressAvg || (day.meals && day.meals.some(m => m.stress))),
      hasMood: Boolean(day.moodAvg || (day.meals && day.meals.some(m => m.mood))),
      
      // Специальные поля
      hasDeficitPct: Boolean(typeof day.deficitPct === 'number'),
      hasCaloricDebt: Boolean(typeof day.caloricDebt === 'number'),
      hasRefeedDay: Boolean(day.isRefeedDay),
      
      // Профиль
      hasProfile: Boolean(profile && profile.weight),
      hasGoal: Boolean(profile && profile.goal),
      
      // Метаданные
      date: dateStr,
      completeness: 0 // Будет рассчитано ниже
    };
  }
  
  /**
   * Рассчитать полноту данных (0-100%)
   */
  function calculateDataCompleteness(inventory) {
    const weights = {
      hasMeals: 30,
      hasSleep: 15,
      hasWeight: 10,
      hasWater: 5,
      hasSteps: 10,
      hasTrainings: 5,
      hasStress: 5,
      hasMood: 5,
      hasProfile: 15
    };
    
    let score = 0;
    let maxScore = 0;
    
    for (const [key, weight] of Object.entries(weights)) {
      maxScore += weight;
      if (inventory[key]) score += weight;
    }
    
    return Math.round((score / maxScore) * 100);
  }
  
  // === PHASE 0: PLAN ADHERENCE ===
  
  /**
   * Рассчитать adherence к плану (выполнение нормы по калориям и макросам)
   * @returns {Object} { score, reasons[], details }
   */
  function calculatePlanAdherence(dateStr, pIndex, profile) {
    const lsGet = getScopedLsGet();
    
    const day = lsGet(`heys_dayv2_${dateStr}`, {});
    const optimum = profile?.optimum || 2000;
    
    // Получаем dayTot и normAbs
    const dayTot = calculateDayTotals(day, pIndex);
    const normAbs = calculateNormAbs(profile, optimum);
    
    const reasons = [];
    let totalScore = 100;
    
    // 1. Калории (вес: 30%)
    const ratio = dayTot.kcal / optimum;
    const ratioZone = HEYS.ratioZones?.getZone?.(ratio) || {};
    
    // Refeed Day — не штрафуем
    if (day.isRefeedDay && ratio >= 0.9 && ratio <= 1.3) {
      reasons.push({
        id: 'refeed_day',
        pillar: 'nutrition',
        impact: 0,
        label: 'Refeed Day',
        short: 'Осознанный выбор',
        details: `Refeed day — калории в норме рефида (${Math.round(ratio * 100)}% от обычной нормы)`,
        scientificBasis: 'Периодический рефид помогает поддерживать метаболизм при длительном дефиците'
      });
    } else {
      const caloriesPenalty = ratio < 0.75 ? 30 : ratio > 1.3 ? 25 : ratio < 0.85 ? 15 : ratio > 1.15 ? 15 : 0;
      if (caloriesPenalty > 0) {
        totalScore -= caloriesPenalty;
        reasons.push({
          id: 'calories_off',
          pillar: 'nutrition',
          impact: caloriesPenalty,
          label: ratio < 1 ? 'Недобор калорий' : 'Перебор калорий',
          short: `${Math.round(ratio * 100)}% от нормы`,
          details: `Съедено ${Math.round(dayTot.kcal)} из ${optimum} ккал`,
          scientificBasis: ratio < 0.75 
            ? 'Глубокий дефицит может замедлить метаболизм (Rosenbaum & Leibel, 2010)'
            : 'Большой профицит может снизить чувствительность к инсулину'
        });
      }
    }
    
    // 2. Белок (вес: 25%)
    const proteinMinG = (profile?.weight || 70) * BASELINE.PROTEIN_MIN_G_PER_KG;
    if (dayTot.prot < proteinMinG) {
      const proteinPenalty = dayTot.prot < proteinMinG * 0.5 ? 25 : 15;
      totalScore -= proteinPenalty;
      reasons.push({
        id: 'protein_low',
        pillar: 'nutrition',
        impact: proteinPenalty,
        label: 'Мало белка',
        short: `${Math.round(dayTot.prot)}г из ${Math.round(proteinMinG)}г`,
        details: `Белок: ${Math.round(dayTot.prot)}г, норма: ≥${Math.round(proteinMinG)}г`,
        scientificBasis: 'Белок поддерживает мышечную массу и насыщение (Westerterp-Plantenga, 2008)'
      });
    }
    
    // 3. Клетчатка (вес: 15%)
    const fiberMinG = (dayTot.kcal / 1000) * BASELINE.FIBER_MIN_G_PER_1000_KCAL;
    if (dayTot.fiber < fiberMinG) {
      const fiberPenalty = 10;
      totalScore -= fiberPenalty;
      reasons.push({
        id: 'fiber_low',
        pillar: 'nutrition',
        impact: fiberPenalty,
        label: 'Мало клетчатки',
        short: `${Math.round(dayTot.fiber)}г из ${Math.round(fiberMinG)}г`,
        details: `Клетчатка: ${Math.round(dayTot.fiber)}г, норма: ≥${Math.round(fiberMinG)}г`,
        scientificBasis: 'Клетчатка улучшает насыщение и здоровье ЖКТ (Makki et al., 2018)'
      });
    }
    
    // 4. Сон (вес: 15%)
    const sleepHours = day.sleepHours || 0;
    const sleepNorm = profile?.sleepHours || BASELINE.SLEEP_OPTIMAL_HOURS;
    if (sleepHours < sleepNorm - 1) {
      const sleepPenalty = sleepHours < sleepNorm - 2 ? 20 : 10;
      totalScore -= sleepPenalty;
      reasons.push({
        id: 'sleep_debt',
        pillar: 'recovery',
        impact: sleepPenalty,
        label: 'Недосып',
        short: `${sleepHours}ч из ${sleepNorm}ч`,
        details: `Спал ${sleepHours}ч, норма: ${sleepNorm}ч`,
        scientificBasis: 'Недосып повышает грелин (голод) на 15-28% (Spiegel et al., 2004)'
      });
    }
    
    // 5. Активность (вес: 15%)
    if (day.steps < BASELINE.STEPS_MIN && (!day.trainings || day.trainings.length === 0)) {
      const activityPenalty = 10;
      totalScore -= activityPenalty;
      reasons.push({
        id: 'low_activity',
        pillar: 'activity',
        impact: activityPenalty,
        label: 'Низкая активность',
        short: `${day.steps || 0} шагов`,
        details: `Шаги: ${day.steps || 0}, норма: ≥${BASELINE.STEPS_MIN}`,
        scientificBasis: 'Низкая активность снижает расход энергии и NEAT (Levine, 2004)'
      });
    }
    
    return {
      score: Math.max(0, Math.min(100, totalScore)),
      reasons,
      details: {
        calories: { actual: dayTot.kcal, target: optimum, ratio },
        protein: { actual: dayTot.prot, target: proteinMinG },
        fiber: { actual: dayTot.fiber, target: fiberMinG },
        sleep: { actual: sleepHours, target: sleepNorm }
      }
    };
  }
  
  // === PHASE 0: CRASH RISK ===
  
  /**
   * Рассчитать риск срыва (0-100)
   * Факторы: недосып, стресс, дефицит >3 дней, триггеры
   */
  function calculateCrashRisk(dateStr, profile, history) {
    const lsGet = getScopedLsGet();
    
    const day = lsGet(`heys_dayv2_${dateStr}`, {});
    let riskScore = 0;
    const factors = [];
    
    // 1. Недосып (+20-40)
    const sleepHours = day.sleepHours || 0;
    const sleepNorm = profile?.sleepHours || 8;
    const sleepDebt = sleepNorm - sleepHours;
    if (sleepDebt >= 3) {
      riskScore += 40;
      factors.push({
        id: 'sleep_debt_high',
        label: 'Сильный недосып',
        impact: 40,
        details: `Недосып ${sleepDebt}ч — повышен риск переедания`
      });
    } else if (sleepDebt >= 2) {
      riskScore += 25;
      factors.push({
        id: 'sleep_debt_moderate',
        label: 'Недосып',
        impact: 25,
        details: `Недосып ${sleepDebt}ч`
      });
    } else if (sleepDebt >= 1) {
      riskScore += 15;
      factors.push({
        id: 'sleep_debt_mild',
        label: 'Лёгкий недосып',
        impact: 15,
        details: `Недосып ${sleepDebt}ч`
      });
    }
    
    // 2. Стресс (+15-30)
    const stress = day.stressAvg || 0;
    if (stress >= 7) {
      riskScore += 30;
      factors.push({
        id: 'stress_high',
        label: 'Высокий стресс',
        impact: 30,
        details: `Стресс ${stress}/10 — риск эмоционального переедания`
      });
    } else if (stress >= 5) {
      riskScore += 15;
      factors.push({
        id: 'stress_moderate',
        label: 'Средний стресс',
        impact: 15,
        details: `Стресс ${stress}/10`
      });
    }
    
    // 3. Хронический дефицит (+20-35)
    const consecutiveDeficitDays = countConsecutiveDeficitDays(history);
    if (consecutiveDeficitDays >= 5) {
      riskScore += 35;
      factors.push({
        id: 'chronic_deficit',
        label: 'Хронический дефицит',
        impact: 35,
        details: `${consecutiveDeficitDays} дней подряд в дефиците — высок риск срыва`
      });
    } else if (consecutiveDeficitDays >= 3) {
      riskScore += 20;
      factors.push({
        id: 'moderate_deficit',
        label: 'Длительный дефицит',
        impact: 20,
        details: `${consecutiveDeficitDays} дней подряд в дефиците`
      });
    }
    
    // 4. Соц-триггеры (+10-20)
    const dayOfWeek = new Date(dateStr).getDay();
    const isFridayOrWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0;
    if (isFridayOrWeekend) {
      riskScore += 15;
      factors.push({
        id: 'weekend_trigger',
        label: 'Выходные',
        impact: 15,
        details: 'Выходные — повышен риск срыва'
      });
    }
    
    return {
      risk: Math.min(100, riskScore),
      factors,
      level: riskScore < 30 ? 'low' : riskScore < 60 ? 'medium' : 'high'
    };
  }
  
  /**
   * Подсчитать количество дней подряд в дефиците
   */
  function countConsecutiveDeficitDays(history) {
    if (!history || history.length === 0) return 0;
    
    let count = 0;
    for (const day of history) {
      if (day.ratio && day.ratio < 0.85) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }
  
  // === PHASE 0: METABOLIC PHASE ===
  
  /**
   * Определить текущую метаболическую фазу
   * @returns {Object} { phase, hoursInPhase, nextPhase, timeToLipolysis }
   */
  function calculateMetabolicPhase(dateStr) {
    const lsGet = getScopedLsGet();
    
    const day = lsGet(`heys_dayv2_${dateStr}`, {});
    const profile = lsGet('heys_profile', {});
    
    // Используем HEYS.InsulinWave.calculate() если доступно
    if (HEYS.InsulinWave && HEYS.InsulinWave.calculate && day.meals && day.meals.length > 0) {
      try {
        // Получаем pIndex и getProductFromItem из HEYS.products
        const pIndex = HEYS.products?.buildIndex?.() || { byId: new Map() };
        const getProductFromItem = (item, idx) => {
          if (!item) return null;
          // Пробуем найти по product_id
          if (item.product_id && idx?.byId?.get) {
            return idx.byId.get(item.product_id) || idx.byId.get(String(item.product_id));
          }
          // Fallback: данные внутри item (штамп)
          return item;
        };
        
        const waveData = HEYS.InsulinWave.calculate({
          meals: day.meals,
          pIndex,
          getProductFromItem,
          baseWaveHours: profile.insulinWaveHours || 3,
          trainings: day.trainings || [],
          dayData: {
            ...day,
            profile,
            date: dateStr,
            lsGet
          },
          now: new Date()
        });
        
        if (waveData && waveData.status === 'lipolysis') {
          return {
            phase: 'catabolic',
            label: BASELINE.PHASES.CATABOLIC.label,
            emoji: BASELINE.PHASES.CATABOLIC.emoji,
            hoursInPhase: (waveData.lipolysisMinutes || 0) / 60,
            nextPhase: null,
            timeToLipolysis: 0,
            isLipolysis: true,
            details: 'Липолиз активен — жиросжигание'
          };
        } else if (waveData) {
          const hoursRemaining = (waveData.remaining || 0) / 60;
          const phase = hoursRemaining > 2 ? 'anabolic' : 'transitional';
          
          return {
            phase,
            label: BASELINE.PHASES[phase.toUpperCase()].label,
            emoji: BASELINE.PHASES[phase.toUpperCase()].emoji,
            hoursInPhase: ((waveData.duration || 180) - (waveData.remaining || 0)) / 60,
            nextPhase: phase === 'anabolic' ? 'transitional' : 'catabolic',
            timeToLipolysis: Math.max(0, hoursRemaining),
            isLipolysis: false,
            details: `До липолиза: ${Math.round(waveData.remaining || 0)} мин`
          };
        }
      } catch (e) {
        HEYS.analytics?.trackError?.('metabolic_phase_calculation_error', e);
      }
    }
    
    // Fallback: простая логика по времени последнего приёма
    const lastMeal = getLastMealTime(day);
    if (!lastMeal) {
      return {
        phase: 'unknown',
        label: 'Нет данных',
        emoji: '❓',
        hoursInPhase: 0,
        nextPhase: null,
        timeToLipolysis: null,
        isLipolysis: false,
        details: 'Нет приёмов пищи'
      };
    }
    
    const now = new Date();
    const lastMealTime = new Date(lastMeal);
    const hoursSinceLastMeal = (now - lastMealTime) / (1000 * 60 * 60);
    
    let phase, nextPhase;
    if (hoursSinceLastMeal < 3) {
      phase = 'anabolic';
      nextPhase = 'transitional';
    } else if (hoursSinceLastMeal < 5) {
      phase = 'transitional';
      nextPhase = 'catabolic';
    } else {
      phase = 'catabolic';
      nextPhase = null;
    }
    
    const timeToLipolysis = Math.max(0, 5 - hoursSinceLastMeal);
    
    return {
      phase,
      label: BASELINE.PHASES[phase.toUpperCase()].label,
      emoji: BASELINE.PHASES[phase.toUpperCase()].emoji,
      hoursInPhase: hoursSinceLastMeal,
      nextPhase,
      timeToLipolysis,
      isLipolysis: hoursSinceLastMeal >= 5,
      details: hoursSinceLastMeal >= 5 
        ? 'Липолиз активен'
        : `До липолиза: ${Math.round(timeToLipolysis * 60)} мин`
    };
  }
  
  /**
   * Получить время последнего приёма пищи
   */
  function getLastMealTime(day) {
    if (!day.meals || day.meals.length === 0) return null;
    
    const sortedMeals = [...day.meals]
      .filter(m => m.time)
      .sort((a, b) => b.time.localeCompare(a.time));
    
    if (sortedMeals.length === 0) return null;
    
    const dateStr = day.date || new Date().toISOString().split('T')[0];
    return new Date(`${dateStr}T${sortedMeals[0].time}:00`);
  }
  
  // === PHASE 0: SMOOTHING & HYSTERESIS ===
  
  /**
   * Сгладить score с помощью EMA
   */
  function smoothScore(newScore, prevScore) {
    if (prevScore === null) return newScore;
    
    const alpha = CONFIG.SMOOTHING_ALPHA;
    let smoothed = alpha * newScore + (1 - alpha) * prevScore;
    
    // Ограничение max изменения
    const maxChange = CONFIG.MAX_SCORE_CHANGE_PER_UPDATE;
    const diff = smoothed - prevScore;
    if (Math.abs(diff) > maxChange) {
      smoothed = prevScore + Math.sign(diff) * maxChange;
    }
    
    return Math.round(smoothed);
  }
  
  /**
   * Применить гистерезис к уровню риска
   */
  function applyRiskHysteresis(riskScore, prevLevel) {
    const thresholds = CONFIG.RISK_THRESHOLDS;
    
    // Если нет предыдущего уровня, определяем новый
    if (!prevLevel) {
      if (riskScore < thresholds.low.enter) return 'low';
      if (riskScore < thresholds.medium.enter) return 'medium';
      return 'high';
    }
    
    // Применяем гистерезис
    switch (prevLevel) {
      case 'low':
        return riskScore >= thresholds.low.enter ? 'medium' : 'low';
      case 'medium':
        if (riskScore < thresholds.low.exit) return 'low';
        if (riskScore >= thresholds.medium.enter) return 'high';
        return 'medium';
      case 'high':
        return riskScore < thresholds.medium.exit ? 'medium' : 'high';
      default:
        return 'low';
    }
  }
  
  // === UTILITIES ===
  
  /**
   * Рассчитать dayTot из приёмов пищи
   */
  function calculateDayTotals(day, pIndex) {
    const totals = {
      kcal: 0,
      prot: 0,
      carbs: 0,
      fat: 0,
      fiber: 0
    };
    
    if (!day.meals || !pIndex) return totals;
    
    for (const meal of day.meals) {
      if (!meal.items) continue;
      
      for (const item of meal.items) {
        const prod = pIndex?.byId?.get?.(String(item.product_id || item.id)?.toLowerCase());
        if (!prod || !item.grams) continue;
        
        const g = item.grams / 100;
        totals.prot += (prod.protein100 || 0) * g;
        totals.carbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g;
        totals.fat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g;
        totals.fiber += (prod.fiber100 || 0) * g;
      }
    }
    
    totals.kcal = totals.prot * 4 + totals.carbs * 4 + totals.fat * 9;
    
    return totals;
  }
  
  /**
   * Рассчитать normAbs (абсолютные нормы в граммах)
   */
  function calculateNormAbs(profile, optimum) {
    const protPct = profile?.protPct || 0.25;
    const carbsPct = profile?.carbsPct || 0.45;
    const fatPct = profile?.fatPct || 0.30;
    
    return {
      prot: (optimum * protPct) / 4,
      carbs: (optimum * carbsPct) / 4,
      fat: (optimum * fatPct) / 9
    };
  }
  
  /**
   * Получить историю дней с вычисленными макро-процентами
   */
  function getDaysHistory(daysBack) {
    const lsGet = getScopedLsGet();
    
    const days = [];
    const today = new Date();
    const pIndex = HEYS.products?.buildIndex?.() || { byId: new Map() };
    
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const day = lsGet(`heys_dayv2_${dateStr}`, null);
      
      if (day && day.meals && day.meals.length > 0) {
        // Вычисляем dayTot для расчёта процентов макросов
        const dayTot = calculateDayTotals(day, pIndex);
        const totalKcal = dayTot.kcal || 0;
        
        // Вычисляем проценты макросов от калорий (как в нормах)
        // Белок 4 ккал/г, углеводы 4 ккал/г, жиры 9 ккал/г
        const enrichedDay = {
          ...day,
          dateStr,
          daysAgo: i,
          dayTot, // Добавляем dayTot для прочих анализов
          // Проценты макросов (доля калорий от данного нутриента)
          carbsPct: totalKcal > 0 ? (dayTot.carbs * 4) / totalKcal : 0,
          protPct: totalKcal > 0 ? (dayTot.prot * 4) / totalKcal : 0,
          fatPct: totalKcal > 0 ? (dayTot.fat * 9) / totalKcal : 0
        };
        
        days.push(enrichedDay);
      }
    }
    
    return days;
  }
  
  // === MAIN API: getStatus() ===
  
  /**
   * Главная функция: получить полный статус метаболического здоровья
   * @param {Object} options - { dateStr, pIndex, profile, forceRefresh }
   * @returns {Object} полная структура статуса
   */
  function getStatus(options = {}) {
    const lsGet = getScopedLsGet();
    
    const {
      dateStr = new Date().toISOString().split('T')[0],
      pIndex = HEYS.products?.buildIndex?.(),
      profile = lsGet('heys_profile', {}),
      forceRefresh = false
    } = options;
    
    // Kill-switch check
    const featureEnabled = lsGet(CONFIG.FEATURE_FLAG_KEY, 1) === 1;
    if (!featureEnabled) {
      return {
        available: false,
        reason: 'feature_disabled',
        message: 'Metabolic Intelligence отключён'
      };
    }
    
    // Проверка кэша
    const clientId = lsGet('heys_client_current', 'default');
    const now = Date.now();
    
    if (!forceRefresh && 
        _cache.status && 
        _cache.clientId === clientId && 
        (now - _cache.timestamp) < CONFIG.CACHE_TTL_MS) {
      return _cache.status;
    }
    
    // Инвентаризация данных
    const inventory = inventoryData(dateStr);
    inventory.completeness = calculateDataCompleteness(inventory);
    
    // Confidence уровень
    const confidence = inventory.completeness >= 80 ? 'high' 
      : inventory.completeness >= 50 ? 'medium' 
      : 'low';
    
    // Минимальные данные для расчёта
    if (!inventory.hasMeals && !inventory.hasSleep && !inventory.hasWeight) {
      return {
        available: false,
        reason: 'insufficient_data',
        message: 'Недостаточно данных для анализа',
        inventory,
        confidence: 'low'
      };
    }
    
    // История для предиктивной логики
    const history = getDaysHistory(30);
    
    // === Расчёты ===
    
    // 1. Plan Adherence
    const adherence = calculatePlanAdherence(dateStr, pIndex, profile);
    
    // 2. Crash Risk
    const crash = calculateCrashRisk(dateStr, profile, history);
    
    // 3. Metabolic Phase
    const metabolicPhase = calculateMetabolicPhase(dateStr);
    
    // 4. Сглаживание score
    const rawScore = adherence.score;
    const smoothedScore = smoothScore(rawScore, _cache.smoothedScore);
    _cache.smoothedScore = smoothedScore;
    
    // 5. Risk Level с гистерезисом
    const riskLevel = applyRiskHysteresis(crash.risk, _cache.lastRiskLevel);
    _cache.lastRiskLevel = riskLevel;
    
    // 6. Next Steps (приоритезированные действия)
    const nextSteps = generateNextSteps(adherence, crash, metabolicPhase, inventory);
    
    // Финальная структура
    const result = {
      available: true,
      version: CONFIG.VERSION,
      generatedAt: new Date().toISOString(),
      
      // Главный score (0-100)
      score: smoothedScore,
      rawScore,
      
      // Причины снижения score
      reasons: adherence.reasons,
      
      // Приоритизированные действия
      nextSteps,
      
      // Риск срыва
      risk: crash.risk,
      riskLevel,
      riskFactors: crash.factors,
      
      // Метаболическая фаза
      metabolicPhase,
      
      // Уверенность
      confidence,
      
      // Debug инфо
      debug: {
        inventory,
        adherenceDetails: adherence.details,
        crashRiskFactors: crash.factors,
        smoothedScore,
        rawScore,
        riskLevel,
        prevRiskLevel: _cache.lastRiskLevel
      }
    };
    
    // Кэшируем
    _cache = {
      status: result,
      timestamp: now,
      clientId,
      smoothedScore,
      lastRiskLevel: riskLevel
    };
    
    // Analytics
    if (HEYS.analytics?.trackEvent) {
      HEYS.analytics.trackEvent('metabolic_status_calculated', {
        score: smoothedScore,
        riskLevel,
        confidence,
        hasData: inventory.completeness
      });
    }
    
    return result;
  }
  
  /**
   * Генерация приоритизированных шагов
   */
  function generateNextSteps(adherence, crash, metabolicPhase, inventory) {
    const steps = [];
    
    // Топ-3 причины по impact
    const topReasons = [...adherence.reasons]
      .sort((a, b) => (b.impact || 0) - (a.impact || 0))
      .slice(0, 3);
    
    for (const reason of topReasons) {
      if (reason.id === 'protein_low') {
        steps.push({
          id: 'add_protein',
          label: 'Добавь белка',
          etaMin: 10,
          expectedEffect: '+10-15 к статусу',
          why: 'Белок повышает насыщение и поддерживает мышцы',
          priority: 1
        });
      } else if (reason.id === 'fiber_low') {
        steps.push({
          id: 'add_fiber',
          label: 'Больше овощей',
          etaMin: 5,
          expectedEffect: '+5-10 к статусу',
          why: 'Клетчатка улучшает пищеварение',
          priority: 2
        });
      } else if (reason.id === 'sleep_debt') {
        steps.push({
          id: 'improve_sleep',
          label: 'Высыпайся',
          etaMin: 480, // 8 часов
          expectedEffect: '+15-20 к статусу',
          why: 'Недосып повышает голод',
          priority: 1
        });
      } else if (reason.id === 'calories_off') {
        steps.push({
          id: 'adjust_calories',
          label: 'Скорректируй калории',
          etaMin: 15,
          expectedEffect: '+10-20 к статусу',
          why: 'Соблюдение плана = стабильный прогресс',
          priority: 1
        });
      } else if (reason.id === 'low_activity') {
        steps.push({
          id: 'add_activity',
          label: 'Больше движения',
          etaMin: 30,
          expectedEffect: '+5-10 к статусу',
          why: 'Активность повышает расход энергии',
          priority: 2
        });
      }
    }
    
    // Риск срыва
    if (crash.risk >= 60) {
      steps.unshift({
        id: 'prevent_crash',
        label: 'Профилактика срыва',
        etaMin: 60,
        expectedEffect: 'Снизить риск до 30%',
        why: 'Высок риск переедания — планируй приёмы заранее',
        priority: 0
      });
    }
    
    // Метаболическая фаза
    if (metabolicPhase.isLipolysis) {
      steps.push({
        id: 'extend_lipolysis',
        label: 'Продли липолиз',
        etaMin: null,
        expectedEffect: 'Максимум жиросжигания',
        why: 'Каждая минута без еды = сжигание жира',
        priority: 3
      });
    }
    
    // Сортировка по priority
    return steps.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  }
  
  /**
   * Очистить кэш
   */
  function clearCache() {
    _cache = {
      status: null,
      timestamp: 0,
      clientId: null,
      smoothedScore: null,
      lastRiskLevel: 'low'
    };
  }
  
  // === PHASE 2: PREDICTIVE LAYER ===
  
  /**
   * Предсказание срыва на 24-48 часов
   * Учёт: стресс, сон, триггеры, метаболический стресс
   * @returns {Object} { risk, primaryTrigger, preventionStrategy, timeframe }
   */
  function calculateCrashRisk24h(dateStr, profile, history) {
    const lsGet = getScopedLsGet();
    
    const tomorrow = new Date(dateStr);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const dayOfWeek = tomorrow.getDay();
    
    let risk = 0;
    let triggers = [];
    
    // 1. Текущий риск (базовый)
    const currentRisk = calculateCrashRisk(dateStr, profile, history);
    risk += currentRisk.risk * 0.6; // 60% от текущего
    
    // 2. Недосып (прогноз на завтра)
    const day = lsGet(`heys_dayv2_${dateStr}`, {});
    const sleepHours = day.sleepHours || 0;
    if (sleepHours < 6) {
      risk += 25;
      triggers.push({
        id: 'sleep_debt_tomorrow',
        label: 'Риск переедания после недосыпа',
        impact: 25,
        confidence: 0.8
      });
    }
    
    // 3. Выходные / Пятница
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
      risk += 20;
      triggers.push({
        id: 'weekend',
        label: 'Выходные — повышен риск',
        impact: 20,
        confidence: 0.7
      });
    }
    
    // 4. Хронический дефицит (накопленный стресс)
    const consecutiveDays = countConsecutiveDeficitDays(history);
    if (consecutiveDays >= 4) {
      risk += 30;
      triggers.push({
        id: 'metabolic_stress',
        label: 'Метаболический стресс от дефицита',
        impact: 30,
        confidence: 0.85
      });
    }
    
    // 5. Паттерн из истории (если есть срывы в похожий день недели)
    const historicalPattern = findHistoricalPattern(history, dayOfWeek);
    if (historicalPattern.hasCrashPattern) {
      risk += 15;
      triggers.push({
        id: 'historical_pattern',
        label: 'В прошлом были срывы в такие дни',
        impact: 15,
        confidence: 0.6
      });
    }
    
    // Определяем главный триггер
    const primaryTrigger = triggers.length > 0 
      ? triggers.reduce((max, t) => t.impact > max.impact ? t : max, triggers[0])
      : null;
    
    // Стратегия профилактики
    const preventionStrategy = generatePreventionStrategy(triggers, risk);
    
    return {
      risk: Math.min(100, Math.round(risk)),
      riskLevel: risk < 30 ? 'low' : risk < 60 ? 'medium' : 'high',
      primaryTrigger,
      triggers,
      preventionStrategy,
      timeframe: '24-48 часов',
      confidence: triggers.length > 0 ? 0.75 : 0.5
    };
  }
  
  /**
   * Поиск исторических паттернов срывов
   */
  function findHistoricalPattern(history, targetDayOfWeek) {
    if (!history || history.length < 14) {
      return { hasCrashPattern: false };
    }
    
    let crashCount = 0;
    let totalDays = 0;
    
    for (const day of history) {
      const dayOfWeek = new Date(day.dateStr).getDay();
      if (dayOfWeek === targetDayOfWeek) {
        totalDays++;
        if (day.ratio && day.ratio > 1.3) { // Переедание
          crashCount++;
        }
      }
    }
    
    return {
      hasCrashPattern: crashCount >= 2 && crashCount / totalDays >= 0.5,
      crashCount,
      totalDays
    };
  }
  
  /**
   * Генерация стратегии профилактики
   */
  function generatePreventionStrategy(triggers, risk) {
    const strategies = [];
    
    for (const trigger of triggers) {
      if (trigger.id === 'sleep_debt_tomorrow') {
        strategies.push({
          action: 'Высыпайся сегодня',
          reason: 'Недосып повышает голод на 15-28%',
          priority: 1
        });
      } else if (trigger.id === 'weekend') {
        strategies.push({
          action: 'Запланируй приёмы заранее',
          reason: 'Спонтанность в выходные = риск срыва',
          priority: 2
        });
      } else if (trigger.id === 'metabolic_stress') {
        strategies.push({
          action: 'Рассмотри Refeed Day',
          reason: 'Перерыв от дефицита восстановит метаболизм',
          priority: 1
        });
      }
    }
    
    // Общая стратегия для высокого риска
    if (risk >= 60) {
      strategies.unshift({
        action: 'Будь внимателен к сигналам голода',
        reason: 'Высокий риск — различай физический и эмоциональный голод',
        priority: 0
      });
    }
    
    return strategies.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * Прогноз энергии и фокуса на завтра
   * @returns {Object} { energyWindows[], trainingWindow, optimalMeals[] }
   */
  function calculatePerformanceForecast(dateStr, profile, history) {
    const lsGet = getScopedLsGet();
    
    const day = lsGet(`heys_dayv2_${dateStr}`, {});
    
    // Прогноз на основе сна
    const sleepQuality = day.sleepQuality || (day.sleepHours >= 7 ? 7 : 5);
    const sleepHours = day.sleepHours || 7;
    
    const energyWindows = [];
    
    // Утро (7-11) — зависит от сна
    if (sleepHours >= 7) {
      energyWindows.push({
        period: '7:00-11:00',
        label: 'Утро',
        energy: 'high',
        focus: 'high',
        optimal: true,
        recommendation: 'Идеально для сложных задач и тренировок'
      });
    } else {
      energyWindows.push({
        period: '7:00-11:00',
        label: 'Утро',
        energy: 'medium',
        focus: 'medium',
        optimal: false,
        recommendation: 'Недосып снизит продуктивность'
      });
    }
    
    // День (12-15) — обеденный спад
    energyWindows.push({
      period: '12:00-15:00',
      label: 'Обед',
      energy: 'medium',
      focus: 'medium',
      optimal: false,
      recommendation: 'Лёгкая активность, избегай тяжёлых приёмов'
    });
    
    // Вторая половина дня (16-19)
    energyWindows.push({
      period: '16:00-19:00',
      label: 'Вечер',
      energy: 'high',
      focus: 'high',
      optimal: true,
      recommendation: 'Второй пик продуктивности, хорошо для тренировок'
    });
    
    // Ночь (20-23)
    energyWindows.push({
      period: '20:00-23:00',
      label: 'Ночь',
      energy: 'low',
      focus: 'low',
      optimal: false,
      recommendation: 'Готовься ко сну, избегай тяжёлой еды'
    });
    
    // Оптимальное окно для тренировки
    const trainingWindow = sleepHours >= 7 
      ? { time: '16:00-19:00', reason: 'Пик силы и выносливости' }
      : { time: '10:00-12:00', reason: 'После недосыпа — лучше утром' };
    
    // Оптимальные приёмы пищи
    const optimalMeals = [
      {
        time: '8:00-9:00',
        name: 'Завтрак',
        priority: 'high',
        focus: 'Белок + углеводы для энергии',
        caloriesPct: 30
      },
      {
        time: '13:00-14:00',
        name: 'Обед',
        priority: 'high',
        focus: 'Сбалансированный приём',
        caloriesPct: 35
      },
      {
        time: '18:00-19:00',
        name: 'Ужин',
        priority: 'medium',
        focus: 'Лёгкий, не позже 19:00',
        caloriesPct: 25
      },
      {
        time: '11:00',
        name: 'Перекус (опционально)',
        priority: 'low',
        focus: 'Если голод — фрукт или орехи',
        caloriesPct: 10
      }
    ];
    
    return {
      energyWindows,
      trainingWindow,
      optimalMeals,
      sleepImpact: sleepHours < 7 ? 'negative' : 'positive',
      confidence: 0.7
    };
  }
  
  // === PHASE 3: PERSONALIZATION ===
  
  /**
   * Определение метаболического фенотипа
   * Требует ≥30 дней данных
   * @returns {Object} { phenotype, tolerances, recommendations }
   */
  function identifyPhenotype(history, profile) {
    if (!history || history.length < CONFIG.MIN_DATA_FOR_PHENOTYPE) {
      return {
        available: false,
        reason: 'insufficient_data',
        daysRequired: CONFIG.MIN_DATA_FOR_PHENOTYPE,
        daysAvailable: history?.length || 0
      };
    }
    
    // Анализ толерантности к макросам
    const carbTolerance = analyzeCarbTolerance(history);
    const fatTolerance = analyzeFatTolerance(history);
    const proteinResponse = analyzeProteinResponse(history);
    
    // Циркадная сила
    const circadianStrength = analyzeCircadianPattern(history);
    
    // Стресс-ответ
    const stressResponse = analyzeStressResponse(history);
    
    // Определение типа
    let phenotype = 'balanced';
    if (carbTolerance.score > 75 && fatTolerance.score < 60) {
      phenotype = 'carb_preferring';
    } else if (fatTolerance.score > 75 && carbTolerance.score < 60) {
      phenotype = 'fat_preferring';
    } else if (proteinResponse.score > 80) {
      phenotype = 'protein_efficient';
    }
    
    const phenotypeLabels = {
      balanced: 'Сбалансированный',
      carb_preferring: 'Углеводный тип',
      fat_preferring: 'Жировой тип',
      protein_efficient: 'Белковый тип'
    };
    
    const recommendations = generatePhenotypeRecommendations(
      phenotype, 
      carbTolerance, 
      fatTolerance, 
      circadianStrength
    );
    
    return {
      available: true,
      phenotype,
      label: phenotypeLabels[phenotype],
      tolerances: {
        carbs: carbTolerance,
        fat: fatTolerance,
        protein: proteinResponse
      },
      circadianStrength,
      stressResponse,
      recommendations,
      confidence: 0.75,
      dataPoints: history.length
    };
  }
  
  /**
   * Анализ толерантности к углеводам
   */
  function analyzeCarbTolerance(history) {
    // Упрощённый анализ: корреляция углеводов и progress
    let highCarbDays = [];
    let lowCarbDays = [];
    
    for (const day of history) {
      if (!day.carbsPct) continue;
      
      if (day.carbsPct > 0.45) {
        highCarbDays.push(day);
      } else if (day.carbsPct < 0.35) {
        lowCarbDays.push(day);
      }
    }
    
    const highCarbAvgRatio = highCarbDays.length > 0
      ? highCarbDays.reduce((sum, d) => sum + (d.ratio || 1), 0) / highCarbDays.length
      : 1;
    
    const lowCarbAvgRatio = lowCarbDays.length > 0
      ? lowCarbDays.reduce((sum, d) => sum + (d.ratio || 1), 0) / lowCarbDays.length
      : 1;
    
    // Если на высоких углеводах ratio ближе к 1 = хорошая толерантность
    const score = Math.round((1 - Math.abs(1 - highCarbAvgRatio)) * 100);
    
    return {
      score: Math.max(0, Math.min(100, score)),
      label: score > 75 ? 'Высокая' : score > 50 ? 'Средняя' : 'Низкая',
      details: `На высоких углеводах (>45%): ratio ${highCarbAvgRatio.toFixed(2)}`
    };
  }
  
  /**
   * Анализ толерантности к жирам
   */
  function analyzeFatTolerance(history) {
    let highFatDays = [];
    
    for (const day of history) {
      if (!day.fatPct) continue;
      
      if (day.fatPct > 0.35) {
        highFatDays.push(day);
      }
    }
    
    const avgRatio = highFatDays.length > 0
      ? highFatDays.reduce((sum, d) => sum + (d.ratio || 1), 0) / highFatDays.length
      : 1;
    
    const score = Math.round((1 - Math.abs(1 - avgRatio)) * 100);
    
    return {
      score: Math.max(0, Math.min(100, score)),
      label: score > 75 ? 'Высокая' : score > 50 ? 'Средняя' : 'Низкая',
      details: `На высоких жирах (>35%): ratio ${avgRatio.toFixed(2)}`
    };
  }
  
  /**
   * Анализ белкового ответа
   */
  function analyzeProteinResponse(history) {
    let highProteinDays = [];
    
    for (const day of history) {
      if (!day.protPct) continue;
      
      if (day.protPct > 0.25) {
        highProteinDays.push(day);
      }
    }
    
    const avgRatio = highProteinDays.length > 0
      ? highProteinDays.reduce((sum, d) => sum + (d.ratio || 1), 0) / highProteinDays.length
      : 1;
    
    const score = Math.round((1 - Math.abs(1 - avgRatio)) * 100);
    
    return {
      score: Math.max(0, Math.min(100, score)),
      label: score > 80 ? 'Отлично' : score > 60 ? 'Хорошо' : 'Норма',
      details: `На высоком белке (>25%): ratio ${avgRatio.toFixed(2)}`
    };
  }
  
  /**
   * Анализ циркадного паттерна
   */
  function analyzeCircadianPattern(history) {
    // Используем уже рассчитанные данные из PredictiveInsights если доступны
    if (HEYS.PredictiveInsights?.analyzeCircadianTiming) {
      try {
        const analysis = HEYS.PredictiveInsights.analyzeCircadianTiming(history);
        if (analysis.available) {
          return {
            score: analysis.score,
            label: analysis.score >= 85 ? 'Сильный' : analysis.score >= 70 ? 'Средний' : 'Слабый',
            pattern: 'morning_focused'
          };
        }
      } catch (e) {
        // Fallback
      }
    }
    
    return {
      score: 70,
      label: 'Средний',
      pattern: 'balanced'
    };
  }
  
  /**
   * Анализ стресс-ответа
   */
  function analyzeStressResponse(history) {
    let highStressDays = [];
    let lowStressDays = [];
    
    for (const day of history) {
      if (!day.stressAvg) continue;
      
      if (day.stressAvg >= 6) {
        highStressDays.push(day);
      } else if (day.stressAvg <= 3) {
        lowStressDays.push(day);
      }
    }
    
    const highStressAvgRatio = highStressDays.length > 0
      ? highStressDays.reduce((sum, d) => sum + (d.ratio || 1), 0) / highStressDays.length
      : 1;
    
    const lowStressAvgRatio = lowStressDays.length > 0
      ? lowStressDays.reduce((sum, d) => sum + (d.ratio || 1), 0) / lowStressDays.length
      : 1;
    
    // Если при стрессе ratio сильно выше = стресс-едок
    const diff = highStressAvgRatio - lowStressAvgRatio;
    
    return {
      type: diff > 0.15 ? 'stress_eater' : diff < -0.1 ? 'stress_suppressed' : 'resilient',
      label: diff > 0.15 ? 'Стресс-едок' : diff < -0.1 ? 'Подавленный аппетит' : 'Устойчивый',
      impact: Math.abs(diff),
      details: `При стрессе: ratio ${highStressAvgRatio.toFixed(2)} vs норма ${lowStressAvgRatio.toFixed(2)}`
    };
  }
  
  /**
   * Генерация рекомендаций по фенотипу
   */
  function generatePhenotypeRecommendations(phenotype, carbTol, fatTol, circadian) {
    const recs = [];
    
    if (phenotype === 'carb_preferring') {
      recs.push({
        category: 'macros',
        text: 'Углеводы 45-50%, приоритет на сложные углеводы утром'
      });
      recs.push({
        category: 'timing',
        text: 'Большую часть углеводов съедай до 15:00'
      });
    } else if (phenotype === 'fat_preferring') {
      recs.push({
        category: 'macros',
        text: 'Жиры 35-40%, полезные источники: орехи, авокадо, рыба'
      });
      recs.push({
        category: 'timing',
        text: 'Жиры лучше во второй половине дня'
      });
    } else if (phenotype === 'protein_efficient') {
      recs.push({
        category: 'macros',
        text: 'Белок 25-30%, распредели равномерно по приёмам'
      });
    }
    
    if (circadian.score < 70) {
      recs.push({
        category: 'circadian',
        text: 'Улучши циркадный ритм: 60% калорий до 15:00'
      });
    }
    
    return recs;
  }
  
  /**
   * Рассчитать персональные пороги
   * @returns {Object} персональные зоны streak, дефицита, crash/binge
   */
  function calculatePersonalThresholds(history, profile) {
    if (!history || history.length < 14) {
      return {
        available: false,
        reason: 'insufficient_data',
        daysRequired: 14,
        daysAvailable: history?.length || 0
      };
    }
    
    // Анализ исторических данных
    const ratios = history.map(d => d.ratio).filter(r => r);
    const avgRatio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    const stdDevRatio = Math.sqrt(
      ratios.reduce((sum, r) => sum + Math.pow(r - avgRatio, 2), 0) / ratios.length
    );
    
    // Персональные зоны (±1 стандартное отклонение)
    const streakRange = {
      min: Math.max(0.75, avgRatio - stdDevRatio * 0.5),
      max: Math.min(1.25, avgRatio + stdDevRatio * 0.5),
      label: 'Персональная зона streak'
    };
    
    // Порог crash (когда начинаются срывы)
    const crashThreshold = history
      .filter(d => d.ratio && d.ratio > 1.3)
      .map(d => d.ratio)
      .sort((a, b) => a - b)[0] || 1.3;
    
    // Порог deficit (комфортный дефицит)
    const deficitThreshold = history
      .filter(d => d.ratio && d.ratio < 0.85 && d.ratio > 0.5)
      .map(d => d.ratio)
      .sort((a, b) => b - a)[0] || 0.85;
    
    return {
      available: true,
      streakRange,
      crashThreshold: {
        value: crashThreshold,
        label: 'Порог срыва (переедание)'
      },
      deficitThreshold: {
        value: deficitThreshold,
        label: 'Комфортный дефицит'
      },
      personalWave: {
        duration: profile?.insulinWaveHours || BASELINE.WAVE_DURATION,
        label: 'Персональная инсулиновая волна'
      },
      confidence: 0.7,
      dataPoints: history.length
    };
  }
  
  /**
   * Feedback система — сохранение отклика пользователя
   */
  function submitFeedback(predictionId, correct, details = {}) {
    const lsGet = getScopedLsGet();
    const lsSet = U.lsSet || ((k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { }
    });
    
    const feedbackKey = 'heys_metabolic_feedback';
    const feedback = lsGet(feedbackKey, []);
    
    feedback.push({
      predictionId,
      correct,
      timestamp: Date.now(),
      details
    });
    
    lsSet(feedbackKey, feedback);
    
    // Analytics
    if (HEYS.analytics?.trackEvent) {
      HEYS.analytics.trackEvent('metabolic_feedback', {
        predictionId,
        correct,
        hasDetails: Object.keys(details).length > 0
      });
    }
    
    return { success: true };
  }
  
  /**
   * Получить статистику по feedback
   */
  function getFeedbackStats() {
    const lsGet = getScopedLsGet();
    
    const feedbackKey = 'heys_metabolic_feedback';
    const feedback = lsGet(feedbackKey, []);
    
    const total = feedback.length;
    const correct = feedback.filter(f => f.correct).length;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    
    return {
      total,
      correct,
      incorrect: total - correct,
      accuracy: Math.round(accuracy)
    };
  }
  
  // === PHASE 4: INTEGRATION & REPORTING ===
  
  /**
   * Генерация отчёта за период
   * @param {string} period - 'week' | 'month'
   * @returns {Object} структурированный отчёт
   */
  function generateReport(period = 'week') {
    const lsGet = getScopedLsGet();
    
    const daysBack = period === 'week' ? 7 : 30;
    const history = getDaysHistory(daysBack);
    
    if (history.length === 0) {
      return {
        available: false,
        reason: 'no_data',
        period
      };
    }
    
    const profile = lsGet('heys_profile', {});
    const pIndex = HEYS.products?.buildIndex?.();
    
    // Собираем статусы за каждый день
    const dailyStatuses = [];
    for (const day of history) {
      const status = getStatus({
        dateStr: day.dateStr,
        pIndex,
        profile,
        forceRefresh: false
      });
      
      if (status.available) {
        dailyStatuses.push({
          date: day.dateStr,
          score: status.score,
          risk: status.risk,
          riskLevel: status.riskLevel
        });
      }
    }
    
    // Агрегированные метрики
    const avgScore = dailyStatuses.length > 0
      ? Math.round(dailyStatuses.reduce((sum, d) => sum + d.score, 0) / dailyStatuses.length)
      : 0;
    
    const avgRisk = dailyStatuses.length > 0
      ? Math.round(dailyStatuses.reduce((sum, d) => sum + d.risk, 0) / dailyStatuses.length)
      : 0;
    
    const highRiskDays = dailyStatuses.filter(d => d.riskLevel === 'high').length;
    
    // Лучший и худший день
    const bestDay = dailyStatuses.length > 0
      ? dailyStatuses.reduce((max, d) => d.score > max.score ? d : max, dailyStatuses[0])
      : null;
    
    const worstDay = dailyStatuses.length > 0
      ? dailyStatuses.reduce((min, d) => d.score < min.score ? d : min, dailyStatuses[0])
      : null;
    
    // Тренды
    const scoreTrend = calculateTrend(dailyStatuses.map(d => d.score));
    const riskTrend = calculateTrend(dailyStatuses.map(d => d.risk));
    
    return {
      available: true,
      period,
      periodLabel: period === 'week' ? 'Неделя' : 'Месяц',
      daysAnalyzed: dailyStatuses.length,
      
      summary: {
        avgScore,
        avgRisk,
        highRiskDays,
        bestDay,
        worstDay
      },
      
      trends: {
        score: {
          direction: scoreTrend > 0.5 ? 'up' : scoreTrend < -0.5 ? 'down' : 'stable',
          slope: Math.round(scoreTrend * 100) / 100
        },
        risk: {
          direction: riskTrend > 0.5 ? 'up' : riskTrend < -0.5 ? 'down' : 'stable',
          slope: Math.round(riskTrend * 100) / 100
        }
      },
      
      dailyStatuses,
      
      generatedAt: new Date().toISOString()
    };
  }
  
  /**
   * Рассчитать тренд (slope)
   */
  function calculateTrend(values) {
    if (!values || values.length < 2) return 0;
    
    const n = values.length;
    const x = values.map((_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
    const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }
  
  // === EXPORT ===
  HEYS.Metabolic = {
    VERSION: CONFIG.VERSION,
    
    // Main API
    getStatus,
    clearCache,
    
    // Phase 0: Foundation
    inventoryData,
    calculateDataCompleteness,
    calculatePlanAdherence,
    calculateCrashRisk,
    calculateMetabolicPhase,
    
    // Phase 2: Predictive
    calculateCrashRisk24h,
    calculatePerformanceForecast,
    
    // Phase 3: Personalization
    identifyPhenotype,
    calculatePersonalThresholds,
    submitFeedback,
    getFeedbackStats,
    
    // Phase 4: Integration
    generateReport,
    
    // Utils
    getDaysHistory, // Экспортируем для использования в UI
    
    // Config
    CONFIG,
    BASELINE
  };
  
})(typeof window !== 'undefined' ? window : global);
