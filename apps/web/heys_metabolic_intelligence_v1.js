// heys_metabolic_intelligence_v1.js — Metabolic Intelligence Module v1.0.1
// META-версия: полная научная аналитика метаболического здоровья
// Зависимости: HEYS.InsulinWave, HEYS.PredictiveInsights, HEYS.ratioZones, U.lsGet/lsSet
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // === HELPER: localStorage с поддержкой clientId namespace ===
  // ВАЖНО: Данные хранятся с clientId prefix: heys_${clientId}_dayv2_2025-12-15
  function getScopedLsGet() {
    // ВАЖНО: Проверяем HEYS.utils.lsGet ДИНАМИЧЕСКИ, т.к. модуль может загрузиться раньше core
    const dynamicLsGet = HEYS.utils?.lsGet;
    if (dynamicLsGet) return dynamicLsGet;
    
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
    VERSION: '1.1.0', // v1.1.0 — Progressive phenotype disclosure
    CACHE_TTL_MS: 2 * 60 * 1000, // 2 минуты
    MAX_HISTORY_DAYS: 90,
    // Прогрессивные пороги для фенотипа
    PHENOTYPE_TIERS: {
      BASIC: 7,        // Базовый фенотип (предварительно)
      STANDARD: 14,    // + Пороги + Сильные/слабые стороны
      ADVANCED: 30     // + Полные рекомендации + циркадные паттерны
    },
    MIN_DATA_FOR_PHENOTYPE: 7, // Минимум для показа (было 30)
    FEATURE_FLAG_KEY: 'heys_feature_metabolic_intelligence',
    SMOOTHING_ALPHA: 0.3, // EMA сглаживание
    MAX_SCORE_CHANGE_PER_UPDATE: 15, // Максимальное изменение score за раз
    
    // Пороги риска (с гистерезисом)
    RISK_THRESHOLDS: {
      low: { enter: 30, exit: 25 },
      medium: { enter: 60, exit: 55 },
      high: { enter: 85, exit: 80 }
    },
    
    // 🆕 A/B Testing Config
    AB_TESTING: {
      enabled: true,
      variants: {
        // Вариант A: текущая формула (default)
        A: {
          id: 'A',
          name: 'Стандартная формула',
          weights: {
            currentRisk: 0.6,
            sleepDebt: 25,
            weekend: 20,
            chronicDeficit: 30,
            historical: 15
          }
        },
        // Вариант B: усиленный акцент на сне
        B: {
          id: 'B',
          name: 'Sleep-focused',
          weights: {
            currentRisk: 0.5,
            sleepDebt: 35,
            weekend: 15,
            chronicDeficit: 25,
            historical: 15
          }
        },
        // Вариант C: усиленный акцент на хроническом дефиците
        C: {
          id: 'C',
          name: 'Deficit-focused',
          weights: {
            currentRisk: 0.55,
            sleepDebt: 20,
            weekend: 20,
            chronicDeficit: 40,
            historical: 10
          }
        }
      },
      storageKey: 'heys_ab_variant',
      resultsKey: 'heys_ab_results'
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
    
    // === ПОЗИТИВНЫЕ ФАКТОРЫ (показываем что хорошо) ===
    const positiveFactors = [];
    
    // Хороший сон (если заполнен и >= норма)
    if (sleepHours > 0 && sleepHours >= sleepNorm) {
      positiveFactors.push({
        id: 'good_sleep',
        label: 'Выспался',
        impact: -10,
        positive: true,
        details: `Сон ${sleepHours}ч — отличная база для контроля`
      });
    }
    
    // Низкий стресс (если заполнен 1-3, или не заполнен = нет стресса)
    if (stress <= 3) {
      positiveFactors.push({
        id: 'low_stress',
        label: stress > 0 ? 'Низкий стресс' : 'Нет стресса',
        impact: -10,
        positive: true,
        details: stress > 0 
          ? `Стресс ${stress}/10 — хороший эмоциональный фон`
          : 'Стресс не отмечен — хороший знак!'
      });
    }
    
    // Стабильное питание (нет дефицита)
    if (consecutiveDeficitDays === 0) {
      positiveFactors.push({
        id: 'stable_eating',
        label: 'Стабильное питание',
        impact: -15,
        positive: true,
        details: 'Нет хронического дефицита — организм не в режиме стресса'
      });
    }
    
    // Будний день (меньше соц-триггеров)
    if (!isFridayOrWeekend) {
      positiveFactors.push({
        id: 'weekday',
        label: 'Будний день',
        impact: -5,
        positive: true,
        details: 'Будние дни — меньше социальных триггеров'
      });
    }
    
    return {
      risk: Math.min(100, riskScore),
      factors,
      positiveFactors,
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
      
      // День считается "с данными" если есть хотя бы один приём пищи с продуктами
      const hasMeals = day?.meals?.some?.(m => m?.items?.length > 0);
      
      if (day && hasMeals) {
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
    
    // Получаем веса из A/B варианта
    const abWeights = getABWeights();
    
    const tomorrow = new Date(dateStr);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const dayOfWeek = tomorrow.getDay();
    
    let risk = 0;
    let triggers = [];
    
    // 1. Текущий риск (базовый) — вес из A/B теста
    const currentRisk = calculateCrashRisk(dateStr, profile, history);
    // 🔧 FIX: было abWeights.current, должно быть abWeights.currentRisk
    risk += (currentRisk.risk || 0) * (abWeights.currentRisk || 0.6);
    
    // 2. Недосып (прогноз на завтра) — вес из A/B теста
    const day = lsGet(`heys_dayv2_${dateStr}`, {});
    const sleepHours = day.sleepHours || 0;
    if (sleepHours < 6) {
      risk += abWeights.sleepDebt;
      triggers.push({
        id: 'sleep_debt_tomorrow',
        label: 'Риск переедания после недосыпа',
        impact: abWeights.sleepDebt,
        confidence: 0.8
      });
    }
    
    // 3. Выходные / Пятница — вес из A/B теста
    if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
      risk += abWeights.weekend;
      triggers.push({
        id: 'weekend',
        label: 'Выходные — повышен риск',
        impact: abWeights.weekend,
        confidence: 0.7
      });
    }
    
    // 4. Хронический дефицит (накопленный стресс) — вес из A/B теста
    const consecutiveDays = countConsecutiveDeficitDays(history);
    if (consecutiveDays >= 4) {
      risk += abWeights.chronicDeficit;
      triggers.push({
        id: 'metabolic_stress',
        label: 'Метаболический стресс от дефицита',
        impact: abWeights.chronicDeficit,
        confidence: 0.85
      });
    }
    
    // 5. Паттерн из истории — вес из A/B теста
    const historicalPattern = findHistoricalPattern(history, dayOfWeek);
    if (historicalPattern.hasCrashPattern) {
      risk += abWeights.historical;
      triggers.push({
        id: 'historical_pattern',
        label: 'В прошлом были срывы в такие дни',
        impact: abWeights.historical,
        confidence: 0.6
      });
    }
    
    // Определяем главный триггер
    const primaryTrigger = triggers.length > 0 
      ? triggers.reduce((max, t) => t.impact > max.impact ? t : max, triggers[0])
      : null;
    
    // Стратегия профилактики
    const preventionStrategy = generatePreventionStrategy(triggers, risk);
    
    // 🔧 FIX: защита от NaN
    const finalRisk = Math.min(100, Math.max(0, Math.round(risk || 0)));
    if (isNaN(finalRisk)) {
      console.warn('[Metabolic] calculateCrashRisk24h returned NaN, defaulting to 0');
    }
    
    // 📊 Сохраняем предсказанный риск для A/B теста (ТОЛЬКО локально, без cloud sync)
    try {
      // Используем localStorage напрямую, чтобы избежать синхронизации с облаком
      localStorage.setItem(`heys_predicted_risk_${tomorrowStr}`, JSON.stringify(finalRisk));
    } catch (e) {
      // Тихо игнорируем ошибки localStorage
    }
    
    return {
      risk: finalRisk,
      riskLevel: finalRisk < 30 ? 'low' : finalRisk < 60 ? 'medium' : 'high',
      level: finalRisk < 30 ? 'low' : finalRisk < 60 ? 'medium' : 'high', // Алиас для совместимости
      primaryTrigger,
      triggers,
      factors: currentRisk.factors || [], // Факторы из базового расчёта
      positiveFactors: currentRisk.positiveFactors || [], // 🆕 Позитивные факторы
      preventionStrategy,
      timeframe: '24-48 часов',
      confidence: triggers.length > 0 ? 0.75 : 0.5,
      abVariant: getABVariant().id // Для отладки
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
   * v1.1.0 — Прогрессивное раскрытие:
   *   7+ дней  → Базовый фенотип (предварительно)
   *   14+ дней → + Пороги + Сильные/слабые стороны
   *   30+ дней → + Полные рекомендации + Циркадные паттерны
   * 
   * @returns {Object} { phenotype, tolerances, recommendations, tier, ... }
   */
  function identifyPhenotype(history, profile) {
    const daysAvailable = history?.length || 0;
    const tiers = CONFIG.PHENOTYPE_TIERS;
    
    // Меньше 7 дней — не показываем
    if (daysAvailable < tiers.BASIC) {
      return {
        available: false,
        reason: 'insufficient_data',
        daysRequired: tiers.BASIC,
        daysAvailable
      };
    }
    
    // Определяем tier (уровень детализации)
    let tier = 'basic';
    let tierLabel = 'Предварительно';
    let tierColor = '#f59e0b'; // yellow
    let confidence = 0.5;
    
    if (daysAvailable >= tiers.ADVANCED) {
      tier = 'advanced';
      tierLabel = 'Точный анализ';
      tierColor = '#22c55e'; // green
      confidence = 0.85;
    } else if (daysAvailable >= tiers.STANDARD) {
      tier = 'standard';
      tierLabel = 'Хороший анализ';
      tierColor = '#3b82f6'; // blue
      confidence = 0.7;
    }
    
    // === БАЗОВЫЙ АНАЛИЗ (7+ дней) ===
    // Анализ толерантности к макросам
    const carbTolerance = analyzeCarbTolerance(history);
    const fatTolerance = analyzeFatTolerance(history);
    const proteinResponse = analyzeProteinResponse(history);
    
    // Определение типа фенотипа
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
    
    const phenotypeDescriptions = {
      balanced: 'Хорошо усваиваешь все макронутриенты равномерно',
      carb_preferring: 'Организм эффективнее работает на углеводах',
      fat_preferring: 'Лучше усваиваешь и используешь жиры как топливо',
      protein_efficient: 'Высокая эффективность усвоения белка'
    };
    
    // Базовый результат
    const result = {
      available: true,
      phenotype,
      label: phenotypeLabels[phenotype],
      description: phenotypeDescriptions[phenotype],
      tier,
      tierLabel,
      tierColor,
      confidence,
      dataPoints: daysAvailable,
      nextTier: tier === 'basic' ? { 
        name: 'standard', 
        daysNeeded: tiers.STANDARD - daysAvailable,
        unlocks: ['Персональные пороги', 'Сильные/слабые стороны']
      } : tier === 'standard' ? {
        name: 'advanced',
        daysNeeded: tiers.ADVANCED - daysAvailable,
        unlocks: ['Полные рекомендации', 'Циркадные паттерны', 'Стресс-анализ']
      } : null,
      // Radar данные (доступны с 7 дней)
      radarData: {
        stability: Math.round(50 + Math.random() * 30), // TODO: реальный расчёт
        recovery: Math.round(carbTolerance.score * 0.8 + 20),
        insulinSensitivity: Math.round(70 + Math.random() * 20),
        consistency: Math.round(50 + daysAvailable * 1.5),
        chronotype: Math.round(50 + Math.random() * 30)
      },
      tolerances: {
        carbs: carbTolerance,
        fat: fatTolerance,
        protein: proteinResponse
      }
    };
    
    // === СТАНДАРТНЫЙ АНАЛИЗ (14+ дней) ===
    if (tier === 'standard' || tier === 'advanced') {
      // Стресс-ответ
      result.stressResponse = analyzeStressResponse(history);
      
      // Сильные и слабые стороны
      result.strengths = [];
      result.weaknesses = [];
      
      if (carbTolerance.score > 70) {
        result.strengths.push('Хорошая толерантность к углеводам');
      } else if (carbTolerance.score < 50) {
        result.weaknesses.push('Низкая толерантность к углеводам');
      }
      
      if (fatTolerance.score > 70) {
        result.strengths.push('Эффективное усвоение жиров');
      }
      
      if (proteinResponse.score > 75) {
        result.strengths.push('Отличный белковый метаболизм');
      }
      
      if (result.stressResponse.type === 'resilient') {
        result.strengths.push('Устойчивость к стрессу');
      } else if (result.stressResponse.type === 'stress_eater') {
        result.weaknesses.push('Склонность к перееданию при стрессе');
      }
      
      // Персональные пороги (упрощённые)
      result.thresholds = {
        optimalKcalRange: profile?.optimum 
          ? [Math.round(profile.optimum * 0.9), Math.round(profile.optimum * 1.1)]
          : [1800, 2200],
        waveHours: phenotype === 'carb_preferring' ? 3.5 : phenotype === 'fat_preferring' ? 4.0 : 3.0,
        mealGap: phenotype === 'carb_preferring' ? 3 : 4
      };
    }
    
    // === ПРОДВИНУТЫЙ АНАЛИЗ (30+ дней) ===
    if (tier === 'advanced') {
      // Циркадная сила
      result.circadianStrength = analyzeCircadianPattern(history);
      
      // Обновляем radar с реальными данными
      result.radarData.chronotype = result.circadianStrength.score;
      result.radarData.stability = Math.round(
        (carbTolerance.score + fatTolerance.score + proteinResponse.score) / 3
      );
      
      // Полные рекомендации
      result.recommendations = generatePhenotypeRecommendations(
        phenotype, 
        carbTolerance, 
        fatTolerance, 
        result.circadianStrength
      );
      
      // Порог риска срыва
      result.thresholds.crashRiskThreshold = 
        result.stressResponse?.type === 'stress_eater' ? 60 : 75;
        
      // Прогресс сбора данных
      result.dataProgress = Math.min(100, Math.round((daysAvailable / 30) * 100));
    } else {
      // Базовые рекомендации для ранних этапов
      result.recommendations = [
        {
          category: 'data',
          text: `Ещё ${result.nextTier?.daysNeeded || 0} дней для более точного анализа`
        }
      ];
      result.dataProgress = Math.round((daysAvailable / tiers.ADVANCED) * 100);
    }
    
    return result;
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
  
  // === PHASE 5: AUTO-CALIBRATION ===
  
  /**
   * Автокалибровка весов на основе feedback
   * Использует собранный feedback для корректировки коэффициентов риска
   * @returns {Object} откалиброванные веса
   */
  function getCalibratedWeights() {
    const lsGet = getScopedLsGet();
    const lsSet = U.lsSet || ((k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    });
    
    // Базовые веса
    const defaultWeights = {
      sleepDebt: { mild: 15, moderate: 25, high: 40 },
      stress: { moderate: 15, high: 30 },
      chronicDeficit: { moderate: 20, severe: 35 },
      weekend: 15
    };
    
    // Загружаем сохранённые калибровки
    const calibrationKey = 'heys_risk_calibration';
    const calibration = lsGet(calibrationKey, null);
    
    if (!calibration) {
      return defaultWeights;
    }
    
    // Анализируем feedback для корректировки
    const feedback = lsGet('heys_metabolic_feedback', []);
    if (feedback.length < 10) {
      return calibration.weights || defaultWeights;
    }
    
    // Группируем feedback по факторам
    const factorFeedback = {};
    feedback.forEach(f => {
      if (f.details?.factorId) {
        if (!factorFeedback[f.details.factorId]) {
          factorFeedback[f.details.factorId] = { correct: 0, incorrect: 0 };
        }
        if (f.correct) factorFeedback[f.details.factorId].correct++;
        else factorFeedback[f.details.factorId].incorrect++;
      }
    });
    
    // Корректируем веса на основе точности
    const weights = { ...defaultWeights };
    const adjustmentFactor = 0.1; // 10% корректировка за итерацию
    
    Object.entries(factorFeedback).forEach(([factorId, stats]) => {
      const total = stats.correct + stats.incorrect;
      if (total >= 5) {
        const accuracy = stats.correct / total;
        // Если точность низкая — уменьшаем вес, если высокая — увеличиваем
        const adjustment = (accuracy - 0.5) * adjustmentFactor;
        
        // Применяем к соответствующему весу
        if (factorId.includes('sleep')) {
          weights.sleepDebt.mild = Math.max(5, Math.min(25, defaultWeights.sleepDebt.mild * (1 + adjustment)));
          weights.sleepDebt.moderate = Math.max(10, Math.min(35, defaultWeights.sleepDebt.moderate * (1 + adjustment)));
          weights.sleepDebt.high = Math.max(20, Math.min(50, defaultWeights.sleepDebt.high * (1 + adjustment)));
        } else if (factorId.includes('stress')) {
          weights.stress.moderate = Math.max(5, Math.min(25, defaultWeights.stress.moderate * (1 + adjustment)));
          weights.stress.high = Math.max(15, Math.min(40, defaultWeights.stress.high * (1 + adjustment)));
        } else if (factorId.includes('deficit')) {
          weights.chronicDeficit.moderate = Math.max(10, Math.min(30, defaultWeights.chronicDeficit.moderate * (1 + adjustment)));
          weights.chronicDeficit.severe = Math.max(20, Math.min(45, defaultWeights.chronicDeficit.severe * (1 + adjustment)));
        }
      }
    });
    
    // Сохраняем откалиброванные веса
    lsSet(calibrationKey, {
      weights,
      updatedAt: Date.now(),
      feedbackCount: feedback.length
    });
    
    return weights;
  }
  
  /**
   * Получить персональные пороги из истории
   * Анализирует личную историю для определения индивидуальных границ
   */
  function getPersonalThresholds() {
    const lsGet = getScopedLsGet();
    
    const thresholdsKey = 'heys_personal_thresholds';
    const cached = lsGet(thresholdsKey, null);
    
    // Если есть свежие данные — возвращаем
    if (cached && cached.updatedAt && Date.now() - cached.updatedAt < 24 * 60 * 60 * 1000) {
      return cached;
    }
    
    // Анализируем историю за 30 дней
    const history = getDaysHistory(30);
    if (history.length < 14) {
      return {
        available: false,
        reason: 'need_more_data',
        daysRequired: 14,
        daysHave: history.length
      };
    }
    
    // Собираем данные о срывах и рисках
    const crashDays = history.filter(d => d.ratio && d.ratio > 1.3);
    const goodDays = history.filter(d => d.ratio && d.ratio >= 0.85 && d.ratio <= 1.15);
    
    // Анализируем условия перед срывами
    const preCrashConditions = crashDays.map(crash => {
      const idx = history.findIndex(d => d.dateStr === crash.dateStr);
      if (idx <= 0) return null;
      return history[idx - 1]; // День перед срывом
    }).filter(Boolean);
    
    // Персональные пороги
    const thresholds = {
      available: true,
      
      // Персональный порог недосыпа
      sleepThreshold: preCrashConditions.length > 0
        ? Math.round(preCrashConditions.reduce((sum, d) => sum + (d.sleepHours || 7), 0) / preCrashConditions.length)
        : 6,
      
      // Персональный порог стресса  
      stressThreshold: preCrashConditions.length > 0
        ? Math.round(preCrashConditions.reduce((sum, d) => sum + (d.stressAvg || 5), 0) / preCrashConditions.length)
        : 7,
      
      // Персональный порог дефицита (дней подряд)
      deficitDaysThreshold: crashDays.length > 0 ? 3 : 5,
      
      // Персональная "опасная зона" калорий
      dangerZoneRatio: crashDays.length > 0
        ? Math.round(crashDays.reduce((sum, d) => sum + (d.ratio || 1), 0) / crashDays.length * 100) / 100
        : 1.3,
      
      // Статистика
      crashCount: crashDays.length,
      goodDaysCount: goodDays.length,
      successRate: Math.round((goodDays.length / history.length) * 100),
      
      updatedAt: Date.now()
    };
    
    // Кэшируем
    const lsSet = U.lsSet || ((k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    });
    lsSet(thresholdsKey, thresholds);
    
    return thresholds;
  }
  
  // === PHASE 6: WEEKLY WRAP ===
  
  /**
   * Генерация Weekly Wrap — еженедельный отчёт
   * Показывается в воскресенье вечером
   * @returns {Object} структурированный отчёт недели
   */
  function generateWeeklyWrap() {
    const lsGet = getScopedLsGet();
    const profile = lsGet('heys_profile', {});
    const pIndex = HEYS.products?.buildIndex?.();
    
    // Получаем данные за неделю
    const history = getDaysHistory(7);
    
    if (history.length < 3) {
      return {
        available: false,
        reason: 'not_enough_data',
        daysTracked: history.length,
        minRequired: 3
      };
    }
    
    // Собираем статусы
    const dailyData = history.map(day => {
      const status = getStatus({
        dateStr: day.dateStr,
        pIndex,
        profile,
        forceRefresh: false
      });
      
      return {
        date: day.dateStr,
        dayName: new Date(day.dateStr).toLocaleDateString('ru-RU', { weekday: 'short' }),
        score: status?.score || 0,
        risk: status?.risk || 0,
        riskLevel: status?.riskLevel || 'low',
        ratio: day.ratio || 0,
        sleepHours: day.sleepHours || 0,
        steps: day.steps || 0,
        available: status?.available || false
      };
    }).filter(d => d.available);
    
    if (dailyData.length === 0) {
      return { available: false, reason: 'no_valid_data' };
    }
    
    // === ТРЕНДЫ ===
    const avgScore = Math.round(dailyData.reduce((sum, d) => sum + d.score, 0) / dailyData.length);
    const avgRisk = Math.round(dailyData.reduce((sum, d) => sum + d.risk, 0) / dailyData.length);
    const scoreTrend = calculateTrend(dailyData.map(d => d.score));
    const riskTrend = calculateTrend(dailyData.map(d => d.risk));
    
    // === ЛУЧШИЙ/ХУДШИЙ ДЕНЬ ===
    const bestDay = dailyData.reduce((max, d) => d.score > max.score ? d : max, dailyData[0]);
    const worstDay = dailyData.reduce((min, d) => d.score < min.score ? d : min, dailyData[0]);
    
    // === ДОСТИЖЕНИЯ ===
    const achievements = [];
    const goodDays = dailyData.filter(d => d.score >= 70).length;
    const lowRiskDays = dailyData.filter(d => d.riskLevel === 'low').length;
    const streakDays = dailyData.filter(d => d.ratio >= 0.85 && d.ratio <= 1.15).length;
    
    if (goodDays >= 5) achievements.push({ id: 'stable_week', emoji: '🏆', label: '5+ дней в норме' });
    if (lowRiskDays >= 6) achievements.push({ id: 'low_risk_master', emoji: '🛡️', label: 'Мастер контроля риска' });
    if (streakDays >= 7) achievements.push({ id: 'perfect_week', emoji: '⭐', label: 'Идеальная неделя!' });
    if (avgScore >= 80) achievements.push({ id: 'high_performer', emoji: '🚀', label: 'Высокая эффективность' });
    
    // === ИНСАЙТЫ ===
    const insights = [];
    
    // Паттерн выходных
    const weekendDays = dailyData.filter(d => {
      const dow = new Date(d.date).getDay();
      return dow === 0 || dow === 6;
    });
    const weekdayDays = dailyData.filter(d => {
      const dow = new Date(d.date).getDay();
      return dow !== 0 && dow !== 6;
    });
    
    if (weekendDays.length > 0 && weekdayDays.length > 0) {
      const weekendAvg = weekendDays.reduce((s, d) => s + d.score, 0) / weekendDays.length;
      const weekdayAvg = weekdayDays.reduce((s, d) => s + d.score, 0) / weekdayDays.length;
      
      if (weekendAvg < weekdayAvg - 15) {
        insights.push({
          id: 'weekend_drop',
          emoji: '📉',
          text: `Выходные сложнее: score ${Math.round(weekendAvg)} vs ${Math.round(weekdayAvg)} в будни`
        });
      } else if (weekendAvg > weekdayAvg + 10) {
        insights.push({
          id: 'weekend_better',
          emoji: '📈',
          text: 'В выходные лучше контроль — больше времени на себя!'
        });
      }
    }
    
    // Паттерн сна → риск
    const lowSleepDays = dailyData.filter(d => d.sleepHours < 6);
    if (lowSleepDays.length >= 2) {
      const avgRiskLowSleep = lowSleepDays.reduce((s, d) => s + d.risk, 0) / lowSleepDays.length;
      insights.push({
        id: 'sleep_risk_correlation',
        emoji: '😴',
        text: `Недосып повышает риск: ${Math.round(avgRiskLowSleep)}% в дни с <6ч сна`
      });
    }
    
    // === ПРОГНОЗ НА СЛЕДУЮЩУЮ НЕДЕЛЮ ===
    const nextWeekForecast = {
      predictedScore: Math.max(0, Math.min(100, avgScore + scoreTrend * 7)),
      predictedRisk: Math.max(0, Math.min(100, avgRisk + riskTrend * 7)),
      trend: scoreTrend > 0.5 ? 'improving' : scoreTrend < -0.5 ? 'declining' : 'stable',
      recommendation: scoreTrend < -0.5 
        ? 'Фокус на восстановлении — сон и снижение стресса' 
        : scoreTrend > 0.5 
          ? 'Отличный прогресс! Держи темп' 
          : 'Стабильный курс — продолжай в том же духе'
    };
    
    // === СРАВНЕНИЕ С ПРОШЛОЙ НЕДЕЛЕЙ ===
    const prevWeekHistory = getDaysHistory(14).slice(7);
    let comparison = null;
    
    if (prevWeekHistory.length >= 3) {
      const prevWeekData = prevWeekHistory.map(day => {
        const status = getStatus({ dateStr: day.dateStr, pIndex, profile, forceRefresh: false });
        return { score: status?.score || 0 };
      }).filter(d => d.score > 0);
      
      if (prevWeekData.length > 0) {
        const prevAvgScore = Math.round(prevWeekData.reduce((s, d) => s + d.score, 0) / prevWeekData.length);
        comparison = {
          prevAvgScore,
          currentAvgScore: avgScore,
          delta: avgScore - prevAvgScore,
          improved: avgScore > prevAvgScore
        };
      }
    }
    
    return {
      available: true,
      generatedAt: new Date().toISOString(),
      weekNumber: getWeekNumber(new Date()),
      daysTracked: dailyData.length,
      
      // Основные метрики
      summary: {
        avgScore,
        avgRisk,
        bestDay: { date: bestDay.date, dayName: bestDay.dayName, score: bestDay.score },
        worstDay: { date: worstDay.date, dayName: worstDay.dayName, score: worstDay.score },
        goodDays,
        lowRiskDays,
        streakDays
      },
      
      // Тренды
      trends: {
        score: { value: scoreTrend, direction: scoreTrend > 0.5 ? 'up' : scoreTrend < -0.5 ? 'down' : 'stable' },
        risk: { value: riskTrend, direction: riskTrend > 0.5 ? 'up' : riskTrend < -0.5 ? 'down' : 'stable' }
      },
      
      // Достижения
      achievements,
      
      // Инсайты
      insights,
      
      // Прогноз
      nextWeekForecast,
      
      // Сравнение с прошлой неделей
      comparison,
      
      // Daily breakdown для графика
      dailyData
    };
  }
  
  /**
   * Получить номер недели в году
   */
  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
  
  /**
   * Проверить, нужно ли показать Weekly Wrap
   * Показываем в воскресенье после 18:00
   */
  function shouldShowWeeklyWrap() {
    const lsGet = getScopedLsGet();
    
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = воскресенье
    const hour = now.getHours();
    
    // Воскресенье после 18:00
    if (dayOfWeek !== 0 || hour < 18) {
      return false;
    }
    
    // Проверяем, не показывали ли уже на этой неделе
    const lastShownKey = 'heys_weekly_wrap_last_shown';
    const lastShown = lsGet(lastShownKey, 0);
    const weekNumber = getWeekNumber(now);
    
    if (lastShown === weekNumber) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Отметить Weekly Wrap как показанный
   */
  function markWeeklyWrapShown() {
    const lsSet = U.lsSet || ((k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    });
    
    const weekNumber = getWeekNumber(new Date());
    lsSet('heys_weekly_wrap_last_shown', weekNumber);
  }
  
  // ========================================
  // A/B Testing для формул риска
  // ========================================
  
  // Хелперы для A/B (используют прямой localStorage без cloud sync)
  function abLsGet(key, defaultVal) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultVal;
    } catch (e) {
      return defaultVal;
    }
  }
  
  function abLsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Ignore
    }
  }
  
  /**
   * Получить текущий вариант A/B теста для пользователя
   * Вариант присваивается случайно и сохраняется
   */
  function getABVariant() {
    if (!CONFIG.AB_TESTING.enabled) {
      return CONFIG.AB_TESTING.variants.A;
    }
    
    // Проверяем сохранённый вариант (локально, без cloud sync)
    const savedVariant = abLsGet(CONFIG.AB_TESTING.storageKey, null);
    if (savedVariant && CONFIG.AB_TESTING.variants[savedVariant]) {
      return CONFIG.AB_TESTING.variants[savedVariant];
    }
    
    // Случайно выбираем вариант
    const variantKeys = Object.keys(CONFIG.AB_TESTING.variants);
    const randomIndex = Math.floor(Math.random() * variantKeys.length);
    const selectedKey = variantKeys[randomIndex];
    
    // Сохраняем выбор (локально)
    abLsSet(CONFIG.AB_TESTING.storageKey, selectedKey);
    
    return CONFIG.AB_TESTING.variants[selectedKey];
  }
  
  /**
   * Получить веса для расчёта риска из A/B варианта
   */
  function getABWeights() {
    const variant = getABVariant();
    return variant.weights;
  }
  
  /**
   * Записать результат A/B теста (после факта)
   * Вызывается когда день закончен и мы знаем был ли срыв
   */
  function recordABResult(dateStr, predictedRisk, actualRatio) {
    if (!CONFIG.AB_TESTING.enabled) return;
    
    const variant = getABVariant();
    const wasCrash = actualRatio > 1.3 || actualRatio < 0.5; // Срыв = переедание или сильный недобор
    const wasHighRisk = predictedRisk >= 60;
    
    // Точность предсказания:
    // True Positive: высокий риск был предсказан И случился срыв
    // True Negative: низкий риск был предсказан И НЕ случился срыв
    // False Positive: высокий риск был предсказан, но срыва НЕ было
    // False Negative: низкий риск был предсказан, но срыв случился
    
    const results = abLsGet(CONFIG.AB_TESTING.resultsKey, {
      A: { tp: 0, tn: 0, fp: 0, fn: 0 },
      B: { tp: 0, tn: 0, fp: 0, fn: 0 },
      C: { tp: 0, tn: 0, fp: 0, fn: 0 }
    });
    
    if (!results[variant.id]) {
      results[variant.id] = { tp: 0, tn: 0, fp: 0, fn: 0 };
    }
    
    if (wasHighRisk && wasCrash) {
      results[variant.id].tp++; // True Positive
    } else if (!wasHighRisk && !wasCrash) {
      results[variant.id].tn++; // True Negative
    } else if (wasHighRisk && !wasCrash) {
      results[variant.id].fp++; // False Positive
    } else if (!wasHighRisk && wasCrash) {
      results[variant.id].fn++; // False Negative
    }
    
    abLsSet(CONFIG.AB_TESTING.resultsKey, results);
    
    return results[variant.id];
  }
  
  /**
   * Получить статистику A/B теста
   */
  function getABStats() {
    const results = abLsGet(CONFIG.AB_TESTING.resultsKey, {});
    
    const stats = {};
    
    for (const [variantId, data] of Object.entries(results)) {
      const total = data.tp + data.tn + data.fp + data.fn;
      if (total === 0) continue;
      
      const accuracy = (data.tp + data.tn) / total;
      const precision = data.tp + data.fp > 0 ? data.tp / (data.tp + data.fp) : 0;
      const recall = data.tp + data.fn > 0 ? data.tp / (data.tp + data.fn) : 0;
      const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
      
      stats[variantId] = {
        total,
        accuracy: Math.round(accuracy * 100),
        precision: Math.round(precision * 100),
        recall: Math.round(recall * 100),
        f1: Math.round(f1 * 100),
        ...data
      };
    }
    
    return {
      currentVariant: getABVariant().id,
      variantStats: stats,
      bestVariant: Object.entries(stats).sort((a, b) => b[1].f1 - a[1].f1)[0]?.[0] || 'A'
    };
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
    
    // Phase 5: Auto-Calibration
    getCalibratedWeights,
    getPersonalThresholds,
    
    // Phase 6: Weekly Wrap
    generateWeeklyWrap,
    shouldShowWeeklyWrap,
    markWeeklyWrapShown,
    
    // Phase 7: Gamification Integration
    notifyGamification,
    
    // Phase 8: A/B Testing
    getABVariant,
    getABWeights,
    recordABResult,
    getABStats,
    
    // Utils
    getDaysHistory, // Экспортируем для использования в UI
    
    // Config
    CONFIG,
    BASELINE
  };
  
  // === DEBUG ===
  // Вызови в консоли: HEYS.Metabolic.debugDaysHistory()
  HEYS.Metabolic.debugDaysHistory = function() {
    const lsGet = getScopedLsGet();
    const today = new Date();
    const results = [];
    
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const day = lsGet(`heys_dayv2_${dateStr}`, null);
      
      const hasMeals = day?.meals?.some?.(m => m?.items?.length > 0);
      const mealsCount = day?.meals?.length || 0;
      const itemsCount = day?.meals?.reduce?.((sum, m) => sum + (m?.items?.length || 0), 0) || 0;
      
      results.push({
        date: dateStr,
        daysAgo: i,
        exists: !!day,
        hasMeals,
        mealsCount,
        itemsCount,
        steps: day?.steps || 0,
        weight: day?.weightMorning || null
      });
    }
    
    console.table(results);
    const validDays = results.filter(r => r.hasMeals).length;
    console.log(`✅ Дней с едой: ${validDays} / 14 (нужно 7 для фенотипа)`);
    return results;
  };
  
  // ========================================
  // Phase 7: Gamification Integration
  // ========================================
  
  /**
   * 🎮 Уведомление системы геймификации о метаболических событиях
   * Собирает данные и вызывает проверку достижений
   */
  function notifyGamification() {
    if (!window.HEYS?.game) return;
    
    try {
      const days = getDaysHistory(14);
      if (days.length < 7) return;
      
      // Подсчёт дней со стабильным score (≥70)
      let stableDaysCount = 0;
      for (let i = 0; i < Math.min(7, days.length); i++) {
        const dayScore = calculateDayScore(days[i]);
        if (dayScore >= 70) stableDaysCount++;
        else break; // Прерываем streak
      }
      
      // Подсчёт дней с низким риском
      let lowRiskDaysCount = 0;
      for (let i = 0; i < Math.min(14, days.length); i++) {
        const risk = calculateCrashRisk24h();
        if (risk.level === 'low') lowRiskDaysCount++;
        else break;
      }
      
      // Получаем фенотип
      const phenotype = identifyPhenotype();
      
      // Вызываем проверку достижений
      window.HEYS.game.checkMetabolicAchievements?.({
        stableDaysCount,
        lowRiskDaysCount,
        phenotype
      });
      
    } catch (e) {
      // Игнорируем ошибки
    }
  }
  
})(typeof window !== 'undefined' ? window : global);
