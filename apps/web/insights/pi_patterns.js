/* eslint-disable jsdoc/require-param-type, jsdoc/require-returns, jsdoc/require-param */
// pi_patterns.js — Pattern Analysis Functions v4.0.0
// Extracted from heys_predictive_insights_v1.js (Phase 3)
// 22 analyze* функций для анализа паттернов питания, сна, активности, цикла
if (typeof window !== 'undefined') window.__heysLoadingHeartbeat = Date.now();
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsightsPI = HEYS.InsightsPI || {};
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };

  // Зависимости
  const piConst = HEYS.InsightsPI?.constants || window.piConst || {};
  function getPatternModules() {
    return HEYS.InsightsPI?.patternModules || {};
  }
  let _thresholdsCtxCache = { key: null, thresholds: null };

  /**
   * Get adaptive thresholds for current context
   * Теперь использует cache-first cascade strategy из pi_thresholds.js
   * In-memory кэш удален — pi_thresholds.js сам управляет кэшированием через localStorage
   */
  function getThresholdsContext(days, profile, pIndex) {
    const firstDate = days?.[0]?.date || '';
    const lastDate = days?.[days.length - 1]?.date || '';
    const pIndexSize = pIndex?.byId?.size || 0;
    const cacheKey = [
      days?.length || 0,
      firstDate,
      lastDate,
      profile?.id || '',
      profile?.weight || '',
      profile?.goal || '',
      pIndexSize
    ].join('|');

    if (_thresholdsCtxCache.key === cacheKey && _thresholdsCtxCache.thresholds) {
      return _thresholdsCtxCache.thresholds;
    }

    console.log('[pi_patterns] 🎯 getThresholdsContext called:', {
      daysCount: days?.length,
      profileId: profile?.id,
      hasPIndex: !!pIndex
    });

    if (!HEYS.InsightsPI.thresholds || !days || days.length === 0) {
      console.warn('[pi_patterns] ⚠️ Missing thresholds module or days');
      return {};
    }

    console.log('[pi_patterns] 🔄 Fetching thresholds (may use cache)...');
    const computed = HEYS.InsightsPI.thresholds.get(days, profile, pIndex);
    console.log('[pi_patterns] ✅ Received thresholds:', {
      confidence: computed.confidence,
      count: Object.keys(computed.thresholds || {}).length,
      meta: computed.meta
    });

    _thresholdsCtxCache = {
      key: cacheKey,
      thresholds: computed.thresholds || {}
    };

    return _thresholdsCtxCache.thresholds;
  }

  // Импорт констант (полный список из pi_constants.js)
  const PATTERNS = piConst.PATTERNS || {
    MEAL_TIMING: 'meal_timing',
    WAVE_OVERLAP: 'wave_overlap',
    LATE_EATING: 'late_eating',
    MEAL_QUALITY_TREND: 'meal_quality',
    SLEEP_WEIGHT: 'sleep_weight',
    SLEEP_HUNGER: 'sleep_hunger',
    TRAINING_KCAL: 'training_kcal',
    STEPS_WEIGHT: 'steps_weight',
    PROTEIN_SATIETY: 'protein_satiety',
    FIBER_REGULARITY: 'fiber_regularity',
    STRESS_EATING: 'stress_eating',
    MOOD_FOOD: 'mood_food',
    CIRCADIAN: 'circadian',
    NUTRIENT_TIMING: 'nutrient_timing',
    INSULIN_SENSITIVITY: 'insulin_sensitivity',
    GUT_HEALTH: 'gut_health',
    NUTRITION_QUALITY: 'nutrition_quality',
    NEAT_ACTIVITY: 'neat_activity',
    MOOD_TRAJECTORY: 'mood_trajectory',
    // v4.0 patterns (B1-B6)
    SLEEP_QUALITY: 'sleep_quality',
    WELLBEING_CORRELATION: 'wellbeing_correlation',
    HYDRATION: 'hydration',
    BODY_COMPOSITION: 'body_composition',
    CYCLE_IMPACT: 'cycle_impact',
    WEEKEND_EFFECT: 'weekend_effect',
    // v5.0 patterns (C7-C12)
    MICRONUTRIENT_RADAR: 'micronutrient_radar',
    OMEGA_BALANCER: 'omega_balancer',
    HEART_HEALTH: 'heart_health',
    NOVA_QUALITY: 'nova_quality',
    TRAINING_RECOVERY: 'training_recovery',
    HYPERTROPHY: 'hypertrophy',
    GLYCEMIC_LOAD: 'glycemic_load',
    PROTEIN_DISTRIBUTION: 'protein_distribution',
    ANTIOXIDANT_DEFENSE: 'antioxidant_defense',
    ADDED_SUGAR_DEPENDENCY: 'added_sugar_dependency',
    BONE_HEALTH: 'bone_health',
    TRAINING_TYPE_MATCH: 'training_type_match',
    ELECTROLYTE_HOMEOSTASIS: 'electrolyte_homeostasis',
    NUTRIENT_DENSITY: 'nutrient_density',
    VITAMIN_DEFENSE: 'vitamin_defense',
    B_COMPLEX_ANEMIA: 'b_complex_anemia'
  };

  // === АНАЛИЗ ПАТТЕРНОВ ===

  /**
   * Анализ тайминга приёмов пищи и инсулиновых волн
   * @param days
   * @param profile
   * @param pIndex
   */
  function analyzeMealTiming(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeMealTiming === 'function') {
      const thresholds = getThresholdsContext(days, profile, pIndex);
      return patternModules.analyzeMealTiming(days, profile, thresholds);
    }

    return {
      pattern: PATTERNS.MEAL_TIMING || 'meal_timing',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Анализ перехлёста инсулиновых волн
   * @param days
   * @param profile
   */
  function analyzeWaveOverlap(days, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeWaveOverlap === 'function') {
      return patternModules.analyzeWaveOverlap(days, profile);
    }

    return {
      pattern: PATTERNS.WAVE_OVERLAP || 'wave_overlap',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Анализ поздних приёмов пищи
   * @param days
   * @param profile
   * @param pIndex
   */
  function analyzeLateEating(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeLateEating === 'function') {
      const thresholds = getThresholdsContext(days, profile, pIndex);
      return patternModules.analyzeLateEating(days, thresholds);
    }

    return {
      pattern: PATTERNS.LATE_EATING || 'late_eating',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Анализ тренда качества приёмов (MealQualityScore)
   * @param days
   * @param pIndex
   * @param optimum
   */
  function analyzeMealQualityTrend(days, pIndex, optimum) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeMealQualityTrend === 'function') {
      return patternModules.analyzeMealQualityTrend(days, pIndex, optimum);
    }

    return {
      pattern: PATTERNS.MEAL_QUALITY_TREND || 'meal_quality',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C2: Nutrition Quality — качество питания (макро + клетчатка + категории)
   * @param days
   * @param pIndex
   * @param profile
   */
  function analyzeNutritionQuality(days, pIndex, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeNutritionQuality === 'function') {
      const thresholds = getThresholdsContext(days, profile, pIndex);
      return patternModules.analyzeNutritionQuality(days, pIndex, thresholds);
    }

    return {
      pattern: PATTERNS.NUTRITION_QUALITY || 'nutrition_quality',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Корреляция сна и веса
   * @param days
   */
  function analyzeSleepWeight(days) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeSleepWeight === 'function') {
      return patternModules.analyzeSleepWeight(days);
    }

    return {
      pattern: PATTERNS.SLEEP_WEIGHT || 'sleep_weight',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Корреляция недосыпа и переедания
   * FIX v2.0: Используем calculateDayKcal через pIndex
   * @param days
   * @param profile
   * @param pIndex
   */
  function analyzeSleepHunger(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeSleepHunger === 'function') {
      return patternModules.analyzeSleepHunger(days, profile, pIndex);
    }

    return {
      pattern: PATTERNS.SLEEP_HUNGER || 'sleep_hunger',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Корреляция тренировок и калорий
   * FIX v2.0: Используем calculateDayKcal через pIndex
   * @param days
   * @param pIndex
   */
  function analyzeTrainingKcal(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeTrainingKcal === 'function') {
      return patternModules.analyzeTrainingKcal(days, pIndex);
    }

    return {
      pattern: PATTERNS.TRAINING_KCAL || 'training_kcal',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Корреляция шагов и веса
   * @param days
   */
  function analyzeStepsWeight(days) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeStepsWeight === 'function') {
      return patternModules.analyzeStepsWeight(days);
    }

    return {
      pattern: PATTERNS.STEPS_WEIGHT || 'steps_weight',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C4: NEAT Trend — бытовая активность и тренд
   * @param days
   */
  function analyzeNEATTrend(days) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeNEATTrend === 'function') {
      return patternModules.analyzeNEATTrend(days);
    }

    return {
      pattern: PATTERNS.NEAT_ACTIVITY || 'neat_activity',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Корреляция белка и сытости
   * FIX v2.0: Используем pIndex для расчёта макросов
   * @param days
   * @param profile
   * @param pIndex
   */
  function analyzeProteinSatiety(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeProteinSatiety === 'function') {
      return patternModules.analyzeProteinSatiety(days, profile, pIndex);
    }

    return {
      pattern: PATTERNS.PROTEIN_SATIETY || 'protein_satiety',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Анализ клетчатки
   * FIX v2.0: Используем pIndex для расчёта клетчатки
   * @param days
   * @param pIndex
   */
  function analyzeFiberRegularity(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeFiberRegularity === 'function') {
      return patternModules.analyzeFiberRegularity(days, pIndex);
    }

    return {
      pattern: PATTERNS.FIBER_REGULARITY || 'fiber_regularity',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Корреляция стресса и переедания
   * FIX v2.0: Используем calculateDayKcal через pIndex
   * @param days
   * @param pIndex
   */
  function analyzeStressEating(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeStressEating === 'function') {
      return patternModules.analyzeStressEating(days, pIndex);
    }

    return {
      pattern: PATTERNS.STRESS_EATING || 'stress_eating',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * Корреляция настроения и качества еды
   * @param days
   * @param pIndex
   * @param optimum
   */
  function analyzeMoodFood(days, pIndex, optimum) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeMoodFood === 'function') {
      return patternModules.analyzeMoodFood(days, pIndex, optimum);
    }

    return {
      pattern: PATTERNS.MOOD_FOOD || 'mood_food',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C6: Mood Trajectory — настроение vs состав каждого приёма
   * @param days
   * @param pIndex
   */
  function analyzeMoodTrajectory(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeMoodTrajectory === 'function') {
      return patternModules.analyzeMoodTrajectory(days, pIndex);
    }

    return {
      pattern: PATTERNS.MOOD_TRAJECTORY || 'mood_trajectory',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === НОВЫЕ НАУЧНЫЕ АНАЛИЗАТОРЫ v2.0 ===

  /**
   * 🌅 Циркадный анализ — распределение калорий по времени суток
   * PMID: 23512957 (Garaulet), 24154571 (Jakubowicz)
   * @param days
   * @param pIndex
   * @param profile
   */
  function analyzeCircadianTiming(days, pIndex, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeCircadianTiming === 'function') {
      const thresholds = getThresholdsContext(days, profile, pIndex);
      return patternModules.analyzeCircadianTiming(days, pIndex, thresholds);
    }

    return {
      pattern: PATTERNS.CIRCADIAN || 'circadian',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * 🥩 Тайминг нутриентов — когда съедены белок/углеводы/жиры
   * PMID: 24477298 (Areta), 23360586 (Aragon & Schoenfeld)
   * @param days
   * @param pIndex
   * @param profile
   */
  function analyzeNutrientTiming(days, pIndex, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeNutrientTiming === 'function') {
      const thresholds = getThresholdsContext(days, profile, pIndex);
      return patternModules.analyzeNutrientTiming(days, pIndex, profile, thresholds);
    }

    return {
      pattern: PATTERNS.NUTRIENT_TIMING || 'nutrient_timing',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * 🩺 Прокси инсулиновой чувствительности
   * Косвенная оценка на основе GI, клетчатки, тайминга углеводов
   * PMID: 12936919 (Brand-Miller), 8198048 (Wolever)
   * @param days
   * @param pIndex
   * @param profile
   */
  function analyzeInsulinSensitivity(days, pIndex, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeInsulinSensitivity === 'function') {
      const thresholds = getThresholdsContext(days, profile, pIndex);
      return patternModules.analyzeInsulinSensitivity(days, pIndex, profile, thresholds);
    }

    return {
      pattern: PATTERNS.INSULIN_SENSITIVITY || 'insulin_sensitivity',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * 🦠 Здоровье кишечника / микробиом
   * PMID: 24336217 (Sonnenburg), 29902436 (Makki)
   * @param days
   * @param pIndex
   */
  function analyzeGutHealth(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeGutHealth === 'function') {
      return patternModules.analyzeGutHealth(days, pIndex);
    }

    return {
      pattern: PATTERNS.GUT_HEALTH || 'gut_health',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === NEW v4.0 PATTERNS (B1-B6) ===

  /**
   * B1: Sleep Quality → Next Day Metrics (time-lagged correlation)
   * Научный подход: качество сна влияет на метрики СЛЕДУЮЩЕГО дня
   * @param days
   * @param pIndex
   */
  function analyzeSleepQuality(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeSleepQuality === 'function') {
      return patternModules.analyzeSleepQuality(days, pIndex);
    }

    return {
      pattern: PATTERNS.SLEEP_QUALITY || 'sleep_quality',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * B2: Wellbeing Correlation — что влияет на самочувствие
   * @param days
   * @param pIndex
   */
  function analyzeWellbeing(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeWellbeing === 'function') {
      return patternModules.analyzeWellbeing(days, pIndex);
    }

    return {
      pattern: PATTERNS.WELLBEING_CORRELATION || 'wellbeing_correlation',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * B3: Hydration — достаточность гидратации (30ml/kg ВОЗ)
   * @param days
   */
  function analyzeHydration(days) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeHydration === 'function') {
      return patternModules.analyzeHydration(days);
    }

    return {
      pattern: PATTERNS.HYDRATION || 'hydration',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * B4: Body Composition — WHR (waist-hip ratio) с трендом
   * @param days
   * @param profile
   */
  function analyzeBodyComposition(days, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeBodyComposition === 'function') {
      return patternModules.analyzeBodyComposition(days, profile);
    }

    return {
      pattern: PATTERNS.BODY_COMPOSITION || 'body_composition',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * B5: Cycle Impact — влияние менструального цикла (динамическая фазировка)
   * @param days
   * @param pIndex
   * @param profile
   */
  function analyzeCyclePatterns(days, pIndex, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeCyclePatterns === 'function') {
      return patternModules.analyzeCyclePatterns(days, pIndex, profile);
    }

    return {
      pattern: PATTERNS.CYCLE_IMPACT || 'cycle_impact',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * B6: Weekend Effect — паттерн пт-вс vs пн-чт
   * @param days
   * @param pIndex
   */
  function analyzeWeekendEffect(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeWeekendEffect === 'function') {
      return patternModules.analyzeWeekendEffect(days, pIndex);
    }

    return {
      pattern: PATTERNS.WEEKEND_EFFECT || 'weekend_effect',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === C10: NOVA QUALITY SCORE ===
  /**
   * Анализ качества питания по классификации NOVA
   * @param days
   * @param pIndex
   * @returns {object} - { pattern, available, novaDistribution, ultraProcessedPct, livingFoodsBonus, score, insight, confidence }
   */
  function analyzeNOVAQuality(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeNOVAQuality === 'function') {
      return patternModules.analyzeNOVAQuality(days, pIndex);
    }

    return {
      pattern: PATTERNS.NOVA_QUALITY || 'nova_quality',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === C11: TRAINING INTENSITY & RECOVERY ===
  /**
   * Анализ интенсивности тренировок и качества восстановления
   * @param days
   * @returns {object} - { pattern, available, highIntensityDays, avgRecovery, overtrainingRisk, score, insight, confidence }
   */
  function analyzeTrainingRecovery(days) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeTrainingRecovery === 'function') {
      return patternModules.analyzeTrainingRecovery(days);
    }

    return {
      pattern: PATTERNS.TRAINING_RECOVERY || 'training_recovery',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === C12: HYPERTROPHY & BODY COMPOSITION ===
  /**
   * Анализ изменений композиции тела (мышечная масса vs жировая)
   * @param days
   * @param profile
   * @returns {object} - { pattern, available, bicepsTrend, thighTrend, weightChange, compositionQuality, score, insight, confidence }
   */
  function analyzeHypertrophy(days, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeHypertrophy === 'function') {
      return patternModules.analyzeHypertrophy(days, profile);
    }

    return {
      pattern: PATTERNS.HYPERTROPHY || 'hypertrophy',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === C7: MICRONUTRIENT RADAR ("Hidden Hunger") ===
  /**
   * Анализ достаточности микронутриентов (железо, магний, цинк, кальций)
   * @param days
   * @param pIndex
   * @param profile
   * @returns {object} - { pattern, available, deficits, avgIntake, score, insight, confidence }
   */
  function analyzeMicronutrients(days, pIndex, profile) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeMicronutrients === 'function') {
      return patternModules.analyzeMicronutrients(days, pIndex, profile);
    }

    return {
      pattern: PATTERNS.MICRONUTRIENT_RADAR || 'micronutrient_radar',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === C9: HEART & METABOLIC HEALTH ===
  /**
   * Анализ сердечно-сосудистых рисков (Na/K соотношение, холестерин)
   * @param days
   * @param pIndex
   * @returns {object} - { pattern, available, naKRatio, sodiumLoad, cholesterolAvg, score, insight, confidence }
   */
  function analyzeHeartHealth(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeHeartHealth === 'function') {
      return patternModules.analyzeHeartHealth(days, pIndex);
    }

    return {
      pattern: PATTERNS.HEART_HEALTH || 'heart_health',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === C8: OMEGA BALANCE & INFLAMMATION ===
  /**
   * Анализ балансаомега-3/омега-6 и воспалительной нагрузки
   * @param days
   * @param pIndex
   * @returns {object} - { pattern, available, omega6to3Ratio, inflammatoryLoad, score, insight, confidence }
   */
  function analyzeOmegaBalance(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeOmegaBalance === 'function') {
      return patternModules.analyzeOmegaBalance(days, pIndex);
    }

    return {
      pattern: PATTERNS.OMEGA_BALANCER || 'omega_balancer',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  // === C13: VITAMIN DEFENSE RADAR (v6.3 modular) ===
  /**
   *
   * @param days
   * @param profile
   * @param pIndex
   */
  function analyzeVitaminDefense(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeVitaminDefense === 'function') {
      return patternModules.analyzeVitaminDefense(days, profile, pIndex);
    }

    return {
      pattern: PATTERNS.VITAMIN_DEFENSE || 'vitamin_defense',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C22: B-Complex Energy & Anemia Risk
   * Анализирует 6 витаминов группы B (energy quartet + blood pair) + железо для оценки
   * энергетического метаболизма и риска анемии (iron-deficiency, pernicious, megaloblastic).
   * Кластеры: energyBscore (B1/B2/B3/B6) и bloodBscore (B9/B12).
   * Gender-adjusted: железо 18mg (female) vs 8mg (male).
   * @param {Array} days — массив дней с meals
   * @param {object} profile — {gender}
   * @param pIndex
   * @returns {object} — {pattern, available, energyBscore, bloodBscore, anemiaRisk, score, confidence, insight}
   */
  function analyzeBComplexAnemia(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeBComplexAnemia === 'function') {
      return patternModules.analyzeBComplexAnemia(days, profile, pIndex);
    }

    return {
      pattern: PATTERNS.B_COMPLEX_ANEMIA || 'b_complex_anemia',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C14: Glycemic Load Optimizer
   * Отслеживает гликемическую нагрузку per meal и per day (GI × количество углеводов).
   * MinDays: 5, MinMeals: 3/day average
   * @param {Array} days
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeGlycemicLoad(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeGlycemicLoad === 'function') {
      return patternModules.analyzeGlycemicLoad(days, pIndex);
    }

    return {
      pattern: PATTERNS.GLYCEMIC_LOAD || 'glycemic_load',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C15: Protein Distribution (Leucine Threshold)
   * Оценивает распределение белка по приёмам: цель 20-40г/приём.
   * MinDays: 7, MinMeals: 2/day average
   * @param {Array} days
   * @param {object} profile
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeProteinDistribution(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeProteinDistribution === 'function') {
      const thresholds = getThresholdsContext(days, profile, pIndex);
      return patternModules.analyzeProteinDistribution(days, profile, pIndex, thresholds);
    }

    return {
      pattern: PATTERNS.PROTEIN_DISTRIBUTION || 'protein_distribution',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C16: Antioxidant Defense Score
   * Индекс антиоксидантной защиты: A/C/E + Se + Zn с учётом тренировочной нагрузки.
   * @param {Array} days
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeAntioxidantDefense(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeAntioxidantDefense === 'function') {
      return patternModules.analyzeAntioxidantDefense(days, pIndex);
    }

    return {
      pattern: PATTERNS.ANTIOXIDANT_DEFENSE || 'antioxidant_defense',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C18: Added Sugar & Dependency Patterns
   * Tier-aware оценка добавленного сахара (A/B/C) + dependency flags.
   * @param {Array} days
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeAddedSugarDependency(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeAddedSugarDependency === 'function') {
      return patternModules.analyzeAddedSugarDependency(days, pIndex);
    }

    return {
      pattern: PATTERNS.ADDED_SUGAR_DEPENDENCY || 'added_sugar_dependency',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C17: Bone Health Index
   * Комплекс: Ca + D + K + P + Ca:P ratio + strength stimulus.
   * @param {Array} days
   * @param {object} profile
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeBoneHealth(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeBoneHealth === 'function') {
      return patternModules.analyzeBoneHealth(days, profile, pIndex);
    }

    return {
      pattern: PATTERNS.BONE_HEALTH || 'bone_health',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C19: Training-Type Nutrition Match
   * Проверяет соответствие питания преобладающему типу нагрузки.
   * @param {Array} days
   * @param {object} profile
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeTrainingTypeMatch(days, profile, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeTrainingTypeMatch === 'function') {
      return patternModules.analyzeTrainingTypeMatch(days, profile, pIndex);
    }

    return {
      pattern: PATTERNS.TRAINING_TYPE_MATCH || 'training_type_match',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C20: Electrolyte Homeostasis
   * Оценка электролитного баланса Na/K/Mg/Ca с учётом тренировочного потоотделения.
   * @param {Array} days
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeElectrolyteHomeostasis(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeElectrolyteHomeostasis === 'function') {
      return patternModules.analyzeElectrolyteHomeostasis(days, pIndex);
    }

    return {
      pattern: PATTERNS.ELECTROLYTE_HOMEOSTASIS || 'electrolyte_homeostasis',
      available: false,
      reason: 'module_not_loaded'
    };
  }

  /**
   * C21: Nutrient Density Score
   * Оценка нутриентной плотности на 1000 ккал (NRF-подобная логика).
   * @param {Array} days
   * @param {object} pIndex
   * @returns {object}
   */
  function analyzeNutrientDensity(days, pIndex) {
    const patternModules = getPatternModules();
    if (typeof patternModules.analyzeNutrientDensity === 'function') {
      return patternModules.analyzeNutrientDensity(days, pIndex);
    }

    return {
      pattern: PATTERNS.NUTRIENT_DENSITY || 'nutrient_density',
      available: false,
      reason: 'module_not_loaded'
    };
  }


  // === ЭКСПОРТ ===
  HEYS.InsightsPI.patterns = {
    analyzeMealTiming,
    analyzeWaveOverlap,
    analyzeLateEating,
    analyzeMealQualityTrend,
    analyzeSleepWeight,
    analyzeSleepHunger,
    analyzeTrainingKcal,
    analyzeStepsWeight,
    analyzeProteinSatiety,
    analyzeFiberRegularity,
    analyzeNutritionQuality,
    analyzeStressEating,
    analyzeMoodFood,
    analyzeMoodTrajectory,
    analyzeCircadianTiming,
    analyzeNutrientTiming,
    analyzeInsulinSensitivity,
    analyzeGutHealth,
    analyzeNEATTrend,
    // v4.0 (B1-B6)
    analyzeSleepQuality,
    analyzeWellbeing,
    analyzeHydration,
    analyzeBodyComposition,
    analyzeCyclePatterns,
    analyzeWeekendEffect,
    // v5.0 (C7-C12)
    analyzeNOVAQuality,
    analyzeTrainingRecovery,
    analyzeHypertrophy,
    analyzeMicronutrients,
    analyzeHeartHealth,
    analyzeOmegaBalance,
    analyzeVitaminDefense,
    analyzeBComplexAnemia,
    analyzeGlycemicLoad,
    analyzeProteinDistribution,
    analyzeAntioxidantDefense,
    analyzeAddedSugarDependency,
    analyzeBoneHealth,
    analyzeTrainingTypeMatch,
    analyzeElectrolyteHomeostasis,
    analyzeNutrientDensity
  };

  // Fallback для прямого доступа
  global.piPatterns = HEYS.InsightsPI.patterns;

  devLog('[PI Patterns] v6.3.0 loaded — 40 pattern analyzers (modular-router for C8/C9/C13/C14/C15/C16/C17/C18/C19/C20/C21/C22)');

})(typeof window !== 'undefined' ? window : global);
