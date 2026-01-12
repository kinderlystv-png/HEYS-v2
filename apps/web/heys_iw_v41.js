// heys_iw_v41.js — InsulinWave v4.1 Features Module
// Версия: 1.0.0 | Дата: 2026-01-12
//
// ОПИСАНИЕ:
// Модуль продвинутых фичей v4.1: метаболическая гибкость, модель сытости, 
// адаптивный дефицит.
// Выделен из heys_insulin_wave_v1.js для улучшения модульности.
//
// ФИЧИ v4.1:
// 1. Metabolic Flexibility Index — способность переключаться между жирами и углеводами
// 2. Satiety Model — расчёт насыщения от приёма пищи (Holt Index)
// 3. Adaptive Deficit Optimizer — оптимизация дефицита с учётом адаптации метаболизма
//
// Научная база: Kelley & Mandarino 2000, Holt 1995, Trexler 2014

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // ========================================================================
  // 🧬 METABOLIC FLEXIBILITY INDEX — v4.1.0
  // ========================================================================
  // Научное обоснование: Kelley & Mandarino 2000 (PMID: 10783862)
  // Метаболическая гибкость — способность переключаться между окислением
  // жиров и углеводов в зависимости от доступности субстратов
  // ========================================================================
  
  const METABOLIC_FLEXIBILITY_CONFIG = {
    // Факторы влияющие на гибкость
    factors: {
      // Тренировки улучшают гибкость (Goodpaster 2003)
      trainingFrequency: {
        weight: 0.25,
        tiers: [
          { min: 5, value: 1.0, label: 'Отличная база' },     // 5+ тренировок/неделю
          { min: 3, value: 0.75, label: 'Хорошая база' },     // 3-4/неделю
          { min: 1, value: 0.5, label: 'Минимальная база' },  // 1-2/неделю
          { min: 0, value: 0.25, label: 'Низкая база' }       // Нет тренировок
        ]
      },
      // Качество сна влияет на метаболизм (Spiegel 2005)
      sleepQuality: {
        weight: 0.20,
        tiers: [
          { min: 4, value: 1.0 },    // Отличный сон (4-5)
          { min: 3, value: 0.7 },    // Хороший (3)
          { min: 2, value: 0.4 },    // Плохой (2)
          { min: 0, value: 0.2 }     // Очень плохой (1)
        ]
      },
      // Стресс снижает гибкость (Kuo 2015)
      stressLevel: {
        weight: 0.15,
        inverted: true, // Меньше стресс = лучше
        tiers: [
          { max: 3, value: 1.0 },    // Низкий стресс
          { max: 5, value: 0.7 },    // Умеренный
          { max: 7, value: 0.4 },    // Высокий
          { max: 10, value: 0.2 }    // Очень высокий
        ]
      },
      // BMI влияет на инсулиновую чувствительность
      bmiScore: {
        weight: 0.20,
        tiers: [
          { range: [18.5, 24.9], value: 1.0 },   // Норма
          { range: [25, 29.9], value: 0.65 },    // Избыточный вес
          { range: [30, 34.9], value: 0.4 },     // Ожирение I
          { range: [0, 18.5], value: 0.7 },      // Недовес
          { range: [35, 100], value: 0.25 }      // Ожирение II+
        ]
      },
      // Вариативность питания
      dietVariety: {
        weight: 0.20,
        description: 'Разнообразие макросов за 7 дней'
      }
    },
    // Результирующие уровни
    levels: [
      { min: 0.8, id: 'excellent', name: 'Отличная', icon: '🌟', color: '#10b981' },
      { min: 0.6, id: 'good', name: 'Хорошая', icon: '✅', color: '#22c55e' },
      { min: 0.4, id: 'moderate', name: 'Умеренная', icon: '➖', color: '#eab308' },
      { min: 0.2, id: 'low', name: 'Низкая', icon: '⚠️', color: '#f97316' },
      { min: 0, id: 'poor', name: 'Плохая', icon: '❌', color: '#ef4444' }
    ]
  };
  
  /**
   * Расчёт индекса метаболической гибкости
   * @param {Object} options - параметры
   * @returns {Object} { score, level, factors, recommendations }
   */
  const calculateMetabolicFlexibility = ({ 
    recentDays = [], 
    profile = {},
    trainings7d = []
  }) => {
    const factorScores = {};
    const cfg = METABOLIC_FLEXIBILITY_CONFIG.factors;
    
    // 1. Training frequency (за 7 дней)
    const trainingCount = trainings7d.length || recentDays.filter(d => d.trainings?.length > 0).length;
    const trainingTier = cfg.trainingFrequency.tiers.find(t => trainingCount >= t.min) 
      || cfg.trainingFrequency.tiers[cfg.trainingFrequency.tiers.length - 1];
    factorScores.training = {
      value: trainingTier.value,
      weight: cfg.trainingFrequency.weight,
      count: trainingCount,
      label: trainingTier.label
    };
    
    // 2. Sleep quality (среднее за период)
    const sleepScores = recentDays.filter(d => d.sleepQuality > 0).map(d => d.sleepQuality);
    const avgSleep = sleepScores.length > 0 
      ? sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length 
      : 3;
    const sleepTier = cfg.sleepQuality.tiers.find(t => avgSleep >= t.min);
    factorScores.sleep = {
      value: sleepTier?.value || 0.5,
      weight: cfg.sleepQuality.weight,
      avg: avgSleep
    };
    
    // 3. Stress level (среднее)
    const stressScores = recentDays.filter(d => d.stressAvg > 0).map(d => d.stressAvg);
    const avgStress = stressScores.length > 0
      ? stressScores.reduce((a, b) => a + b, 0) / stressScores.length
      : 5;
    const stressTier = cfg.stressLevel.tiers.find(t => avgStress <= t.max);
    factorScores.stress = {
      value: stressTier?.value || 0.5,
      weight: cfg.stressLevel.weight,
      avg: avgStress
    };
    
    // 4. BMI score
    const bmi = profile.weight && profile.height 
      ? profile.weight / Math.pow(profile.height / 100, 2)
      : 22;
    const bmiTier = cfg.bmiScore.tiers.find(t => bmi >= t.range[0] && bmi < t.range[1]);
    factorScores.bmi = {
      value: bmiTier?.value || 0.5,
      weight: cfg.bmiScore.weight,
      bmi: Math.round(bmi * 10) / 10
    };
    
    // 5. Diet variety (стандартное отклонение макросов)
    // Высокая вариативность = лучшая адаптация
    let varietyScore = 0.5;
    if (recentDays.length >= 3) {
      const carbPcts = recentDays.map(d => {
        const tot = (d.dayTot?.carbs || 0) + (d.dayTot?.prot || 0) + (d.dayTot?.fat || 0);
        return tot > 0 ? (d.dayTot?.carbs || 0) / tot : 0.5;
      });
      const mean = carbPcts.reduce((a, b) => a + b, 0) / carbPcts.length;
      const variance = carbPcts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / carbPcts.length;
      const std = Math.sqrt(variance);
      // Умеренная вариативность (std 0.05-0.15) = хорошо
      varietyScore = std < 0.05 ? 0.4 : std < 0.1 ? 0.8 : std < 0.15 ? 1.0 : 0.6;
    }
    factorScores.variety = {
      value: varietyScore,
      weight: cfg.dietVariety.weight
    };
    
    // Итоговый score (взвешенное среднее)
    const totalWeight = Object.values(factorScores).reduce((sum, f) => sum + f.weight, 0);
    const score = Object.values(factorScores).reduce((sum, f) => sum + f.value * f.weight, 0) / totalWeight;
    
    // Определяем уровень
    const level = METABOLIC_FLEXIBILITY_CONFIG.levels.find(l => score >= l.min) 
      || METABOLIC_FLEXIBILITY_CONFIG.levels[METABOLIC_FLEXIBILITY_CONFIG.levels.length - 1];
    
    // Рекомендации
    const recommendations = [];
    if (factorScores.training.value < 0.6) {
      recommendations.push({ icon: '🏃', text: 'Добавь 1-2 тренировки в неделю для улучшения гибкости' });
    }
    if (factorScores.sleep.value < 0.6) {
      recommendations.push({ icon: '😴', text: 'Улучши качество сна — это критично для метаболизма' });
    }
    if (factorScores.stress.value < 0.6) {
      recommendations.push({ icon: '🧘', text: 'Снизь уровень стресса — кортизол блокирует гибкость' });
    }
    if (factorScores.variety.value < 0.6) {
      recommendations.push({ icon: '🥗', text: 'Добавь вариативности в питание (разные соотношения БЖУ)' });
    }
    
    return {
      score: Math.round(score * 100) / 100,
      level,
      factors: factorScores,
      recommendations,
      // Влияние на инсулиновую волну
      waveMultiplier: 0.85 + (1 - score) * 0.3, // 0.85-1.15
      description: `Метаболическая гибкость: ${level.name}`
    };
  };
  
  // ========================================================================
  // 🍽️ SATIETY MODEL — v4.1.0  
  // ========================================================================
  // Научное обоснование: 
  // - Holt Satiety Index 1995 (PMID: 7498104)
  // - Rolls Volumetrics 2000
  // - Blundell appetite cascade 1987
  // ========================================================================
  
  const SATIETY_MODEL_CONFIG = {
    // Базовые коэффициенты насыщения (на 100 ккал)
    macroFactors: {
      protein: 1.5,    // Белок самый сытный (термогенез + глюкагон)
      fiber: 1.4,      // Клетчатка (объём + замедление)
      complexCarbs: 0.8, // Сложные углеводы
      simpleCarbs: 0.3,  // Простые — быстрый голод
      fat: 0.7,        // Жиры — медленное насыщение
      water: 0.2       // Вода в еде увеличивает объём
    },
    // Модификаторы формы пищи
    foodFormFactors: {
      liquid: 0.5,     // Жидкое насыщает меньше
      soft: 0.8,       // Мягкое
      solid: 1.0,      // Твёрдое — максимум
      fibrous: 1.2     // Волокнистое — требует жевания
    },
    // Временное затухание насыщения (часы → множитель)
    decayCurve: {
      baseHours: 4,    // Базовая длительность насыщения
      halfLife: 2      // Период полураспада
    },
    // Уровни насыщения
    levels: [
      { min: 0.8, id: 'full', name: 'Сытость', icon: '😊', color: '#22c55e' },
      { min: 0.5, id: 'satisfied', name: 'Удовлетворён', icon: '🙂', color: '#84cc16' },
      { min: 0.3, id: 'neutral', name: 'Нейтрально', icon: '😐', color: '#eab308' },
      { min: 0.1, id: 'hungry', name: 'Голоден', icon: '😕', color: '#f97316' },
      { min: 0, id: 'starving', name: 'Очень голоден', icon: '😫', color: '#ef4444' }
    ]
  };
  
  /**
   * Расчёт уровня насыщения
   * @param {Object} mealData - данные приёма { kcal, prot, carbs, simple, fat, fiber }
   * @param {number} hoursSinceMeal - часов с приёма
   * @param {Object} options - дополнительные параметры
   * @returns {Object} { score, level, duration, nextHungerTime }
   */
  const calculateSatietyScore = (mealData, hoursSinceMeal = 0, options = {}) => {
    const cfg = SATIETY_MODEL_CONFIG;
    const { kcal = 0, prot = 0, carbs = 0, simple = 0, fat = 0, fiber = 0 } = mealData;
    
    if (kcal <= 0) {
      return {
        score: 0,
        level: cfg.levels[cfg.levels.length - 1],
        duration: 0,
        nextHungerTime: 'сейчас'
      };
    }
    
    // 1. Базовый индекс насыщения (на основе макросов)
    const complexCarbs = Math.max(0, carbs - simple);
    const proteinContribution = (prot * 4 / kcal) * cfg.macroFactors.protein;
    const fiberContribution = (fiber * 2 / kcal) * cfg.macroFactors.fiber;
    const complexCarbsContribution = (complexCarbs * 4 / kcal) * cfg.macroFactors.complexCarbs;
    const simpleCarbsContribution = (simple * 4 / kcal) * cfg.macroFactors.simpleCarbs;
    const fatContribution = (fat * 9 / kcal) * cfg.macroFactors.fat;
    
    // Сырой индекс (0-2+)
    const rawSatietyIndex = proteinContribution + fiberContribution + 
      complexCarbsContribution + simpleCarbsContribution + fatContribution;
    
    // 2. Модификатор объёма (больше ккал = дольше сытость, но с diminishing returns)
    const volumeMultiplier = Math.min(1.5, 0.5 + Math.log10(kcal / 100 + 1) * 0.5);
    
    // 3. Модификатор формы пищи
    const formMultiplier = options.foodForm 
      ? (cfg.foodFormFactors[options.foodForm] || 1.0)
      : 1.0;
    
    // 4. Расчёт длительности насыщения (часы)
    const baseDuration = cfg.decayCurve.baseHours * rawSatietyIndex * volumeMultiplier * formMultiplier;
    const durationHours = Math.min(8, Math.max(1, baseDuration));
    
    // 5. Текущий уровень с учётом времени
    const decayFactor = Math.exp(-hoursSinceMeal / cfg.decayCurve.halfLife);
    const currentScore = Math.min(1, rawSatietyIndex * volumeMultiplier * formMultiplier * decayFactor);
    
    // 6. Определяем уровень
    const level = cfg.levels.find(l => currentScore >= l.min) || cfg.levels[cfg.levels.length - 1];
    
    // 7. Время до голода
    const hoursUntilHungry = Math.max(0, durationHours - hoursSinceMeal);
    const nextHungerTime = hoursUntilHungry > 0
      ? `через ${Math.round(hoursUntilHungry * 60)} мин`
      : 'скоро';
    
    return {
      score: Math.round(currentScore * 100) / 100,
      rawIndex: Math.round(rawSatietyIndex * 100) / 100,
      level,
      duration: Math.round(durationHours * 10) / 10,
      hoursRemaining: Math.round(hoursUntilHungry * 10) / 10,
      nextHungerTime,
      breakdown: {
        protein: Math.round(proteinContribution * 100),
        fiber: Math.round(fiberContribution * 100),
        complexCarbs: Math.round(complexCarbsContribution * 100),
        simpleCarbs: Math.round(simpleCarbsContribution * 100),
        fat: Math.round(fatContribution * 100)
      }
    };
  };
  
  // ========================================================================
  // 📉 ADAPTIVE DEFICIT OPTIMIZER — v4.1.0
  // ========================================================================
  // Научное обоснование:
  // - Trexler 2014: Diet breaks improve adherence (PMID: 24864135)
  // - Byrne 2018: Intermittent energy restriction (PMID: 28925405)
  // - Dulloo 2015: Adaptive thermogenesis (PMID: 22535969)
  // ========================================================================
  
  const ADAPTIVE_DEFICIT_CONFIG = {
    // Минимальный калораж (защита метаболизма)
    minimumKcal: {
      female: 1200,
      male: 1500
    },
    // Диапазоны дефицита
    deficitTiers: [
      { pct: 10, label: 'Лёгкий', sustainable: true, weeklyLoss: '0.25-0.5 кг' },
      { pct: 20, label: 'Умеренный', sustainable: true, weeklyLoss: '0.5-0.75 кг' },
      { pct: 25, label: 'Агрессивный', sustainable: false, weeklyLoss: '0.75-1 кг', maxWeeks: 4 },
      { pct: 30, label: 'Экстремальный', sustainable: false, weeklyLoss: '1+ кг', maxWeeks: 2 }
    ],
    // Diet break (перерыв на поддержание)
    dietBreak: {
      afterWeeks: 4,        // После скольких недель дефицита
      durationDays: 7,      // Длительность перерыва
      kcalBoost: 0.15       // +15% к норме
    },
    // Refeed day (углеводная загрузка)
    refeedDay: {
      frequency: 7,         // Каждые N дней в дефиците
      carbBoost: 0.5,       // +50% углеводов
      kcalBoost: 0.2        // +20% калорий
    },
    // Адаптивный множитель (замедление метаболизма)
    adaptiveMultiplier: {
      perWeekInDeficit: 0.02,  // -2% в неделю
      maxReduction: 0.15       // Максимум -15%
    }
  };
  
  /**
   * Расчёт оптимального адаптивного дефицита
   * @param {Object} options - параметры
   * @returns {Object} { recommendedDeficit, adaptiveKcal, needsDietBreak, recommendations }
   */
  const calculateAdaptiveDeficit = ({
    tdee,
    targetDeficitPct = 15,
    weeksInDeficit = 0,
    gender = 'male',
    recentRatios = [],   // ratio за последние 7 дней
    hasRefeedThisWeek = false
  }) => {
    const cfg = ADAPTIVE_DEFICIT_CONFIG;
    
    // 1. Базовый дефицит
    const targetKcal = tdee * (1 - targetDeficitPct / 100);
    
    // 2. Адаптивное замедление метаболизма
    const adaptiveReduction = Math.min(
      cfg.adaptiveMultiplier.maxReduction,
      weeksInDeficit * cfg.adaptiveMultiplier.perWeekInDeficit
    );
    const adaptedTdee = tdee * (1 - adaptiveReduction);
    
    // 3. Пересчёт дефицита с учётом адаптации
    const effectiveDeficitPct = targetDeficitPct * (1 - adaptiveReduction);
    const adaptiveKcal = adaptedTdee * (1 - effectiveDeficitPct / 100);
    
    // 4. Проверка минимума
    const minKcal = cfg.minimumKcal[gender] || cfg.minimumKcal.male;
    const safeKcal = Math.max(minKcal, adaptiveKcal);
    
    // 5. Проверка необходимости diet break
    const needsDietBreak = weeksInDeficit >= cfg.dietBreak.afterWeeks;
    const dietBreakKcal = needsDietBreak ? tdee * (1 + cfg.dietBreak.kcalBoost) : null;
    
    // 6. Проверка необходимости refeed
    const avgRatio = recentRatios.length > 0
      ? recentRatios.reduce((a, b) => a + b, 0) / recentRatios.length
      : 1;
    const needsRefeed = !hasRefeedThisWeek && 
      recentRatios.length >= 5 && 
      avgRatio < 0.9 &&
      weeksInDeficit >= 1;
    
    // 7. Tier текущего дефицита
    const actualDeficitPct = Math.round((1 - safeKcal / tdee) * 100);
    const tier = cfg.deficitTiers.find(t => actualDeficitPct <= t.pct) || cfg.deficitTiers[cfg.deficitTiers.length - 1];
    
    // 8. Рекомендации
    const recommendations = [];
    
    if (needsDietBreak) {
      recommendations.push({
        priority: 'high',
        icon: '🛑',
        text: `Diet break рекомендован! ${cfg.dietBreak.durationDays} дней на поддержании (${Math.round(dietBreakKcal)} ккал)`
      });
    }
    
    if (needsRefeed) {
      recommendations.push({
        priority: 'medium',
        icon: '🍝',
        text: 'Refeed day поможет восстановить лептин и гликоген'
      });
    }
    
    if (adaptiveReduction > 0.05) {
      recommendations.push({
        priority: 'info',
        icon: '📉',
        text: `Метаболизм адаптировался на ${Math.round(adaptiveReduction * 100)}%`
      });
    }
    
    if (!tier.sustainable) {
      recommendations.push({
        priority: 'warning',
        icon: '⚠️',
        text: `${tier.label} дефицит — не более ${tier.maxWeeks} недель!`
      });
    }
    
    return {
      originalTdee: tdee,
      adaptedTdee: Math.round(adaptedTdee),
      recommendedKcal: Math.round(safeKcal),
      originalDeficitPct: targetDeficitPct,
      effectiveDeficitPct: Math.round(effectiveDeficitPct),
      actualDeficitPct,
      tier,
      adaptiveReduction: Math.round(adaptiveReduction * 100),
      weeksInDeficit,
      needsDietBreak,
      dietBreakKcal: dietBreakKcal ? Math.round(dietBreakKcal) : null,
      needsRefeed,
      minKcal,
      recommendations
    };
  };
  
  // === ЭКСПОРТ ===
  HEYS.InsulinWave = HEYS.InsulinWave || {};
  HEYS.InsulinWave.V41 = {
    // Config
    METABOLIC_FLEXIBILITY_CONFIG,
    SATIETY_MODEL_CONFIG,
    ADAPTIVE_DEFICIT_CONFIG,
    // Functions
    calculateMetabolicFlexibility,
    calculateSatietyScore,
    calculateAdaptiveDeficit
  };
  
})(typeof window !== 'undefined' ? window : global);
