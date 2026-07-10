// heys_hunger_energy_status_v1.js - Pure Hunger & Energy Status decision engine.
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  const HARD_ACTIONS = ['doNotDelay'];
  const DELAY_ACTIONS = ['observe', 'hydratePause', 'coffeePause', 'delayWithCheck', 'planNextMeal'];
  const FOOD_ACTIONS = ['riskBrakeMeal', 'eatSnack', 'eatMeal', 'proteinFiberFirst', 'doNotDelay', 'fastCarbSafety'];

  const SAFETY_FLAGS = Object.freeze({
    bodySymptoms: 'bodySymptoms',
    dizzy: 'dizzy',
    shaky: 'shaky',
    faint: 'faint',
    confused: 'confused',
    nausea: 'nausea',
    pregnantOrBreastfeeding: 'pregnantOrBreastfeeding',
    minor: 'minor',
    activeOrPastEatingDisorder: 'activeOrPastEatingDisorder',
    repeatedLossOfControl: 'repeatedLossOfControl',
    illness: 'illness',
    possibleLowEnergyAvailability: 'possibleLowEnergyAvailability',
    hardTrainingRecovery: 'hardTrainingRecovery',
    diabetes: 'diabetes',
    hypoglycemiaRisk: 'hypoglycemiaRisk',
    glucoseAffectingMedication: 'glucoseAffectingMedication',
    medicalFastingRestriction: 'medicalFastingRestriction'
  });

  const SAFETY_OVERRIDES = Object.freeze({
    delayForbidden: 'delayForbidden',
    fastCarbSafety: 'fastCarbSafety',
    medicalBoundary: 'medicalBoundary',
    recoveryFoodFirst: 'recoveryFoodFirst',
    nutritionFloor: 'nutritionFloor',
    lossOfControl: 'lossOfControl'
  });

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function hasAny(list, values) {
    if (!Array.isArray(list)) return false;
    return values.some((value) => list.includes(value));
  }

  function pushUnique(target, value) {
    if (value && !target.includes(value)) target.push(value);
  }

  function confidenceRank(confidence) {
    return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
  }

  function minConfidence(a, b) {
    return confidenceRank(a) <= confidenceRank(b) ? a : b;
  }

  function levelFromScore(score, bands) {
    for (let i = 0; i < bands.length; i += 1) {
      if (score <= bands[i].max) return bands[i].level;
    }
    return bands[bands.length - 1].level;
  }

  function normalizeInput(input, context) {
    const src = input || {};
    const ctx = context || {};
    const safetyFlagsProvided = Array.isArray(src.safetyFlags);
    const safetyFlags = safetyFlagsProvided ? src.safetyFlags.slice() : [];
    return {
      now: src.now || ctx.now || new Date().toISOString(),
      hungerLevel: clamp(src.hungerLevel, 0, 10),
      controlLevel: src.controlLevel == null ? null : clamp(src.controlLevel, 0, 10),
      cravingLevel: src.cravingLevel == null ? null : clamp(src.cravingLevel, 0, 10),
      hungerTrend: src.hungerTrend || ctx.hungerTrend || 'unknown',
      safetyFlags,
      safetyFlagsProvided,
      hungerReasons: Array.isArray(src.hungerReasons) ? src.hungerReasons.slice() : [],
      stableHungerReasons: Array.isArray(src.stableHungerReasons) ? src.stableHungerReasons.slice() : [],
      checkpointAttemptCount: clamp(src.checkpointAttemptCount || ctx.checkpointAttemptCount || 0, 0, 10),
      dataFreshness: src.dataFreshness || ctx.dataFreshness || 'fresh',
      ctx
    };
  }

  function hasReason(state, reason) {
    return Array.isArray(state.hungerReasons) && state.hungerReasons.includes(reason);
  }

  function hasStableReason(state, reason) {
    return Array.isArray(state.stableHungerReasons) && state.stableHungerReasons.includes(reason);
  }

  function hasRecentBalancedMealContext(ctx) {
    return mealRecencyProtection(ctx) >= 0.65;
  }

  function mealRecencyProtection(ctx) {
    if (!ctx) return 0;
    if (ctx.justAte || ctx.satietyLagLikely) return 1;
    const hours = Number(ctx.hoursSinceMeal);
    if (!Number.isFinite(hours)) {
      if (ctx.recentBalancedMeal || ctx.recentFullMeal) return 1;
      return ctx.recentMeal ? 0.6 : 0;
    }
    const kcal = Math.max(0, Number(ctx.lastMealKcal) || 0);
    const protein = Math.max(0, Number(ctx.lastMealProtein) || 0);
    const fiber = Math.max(0, Number(ctx.lastMealFiber) || 0);
    let durationHours = 2.75 + Math.min(1.5, kcal / 400);
    if (protein >= 25) durationHours += 0.75;
    else if (protein >= 15) durationHours += 0.35;
    if (fiber >= 4) durationHours += 0.5;
    if (ctx.lastMealQualityTone === 'good') durationHours += 0.5;
    else if (ctx.lastMealQualityTone === 'attention') durationHours -= 0.25;
    return clamp((durationHours + 1 - hours) / 2, 0, 1);
  }

  function availableEnergyBudget(ctx) {
    if (ctx?.dayEnergyBalanceKcal != null && Number.isFinite(Number(ctx.dayEnergyBalanceKcal))) {
      return Number(ctx.dayEnergyBalanceKcal);
    }
    if (ctx?.remainingKcal != null && Number.isFinite(Number(ctx.remainingKcal))) return Number(ctx.remainingKcal);
    return null;
  }

  function fitFoodBandToEnergyBudget(band, ctx) {
    const budget = availableEnergyBudget(ctx);
    if (!Array.isArray(band) || !Number.isFinite(budget) || budget >= band[1]) return band;
    if (budget < 150) return [100, 200];
    if (budget < 300) return [150, 300];
    if (budget < 450) return [200, 400];
    return [Math.min(band[0], 300), Math.max(400, Math.min(band[1], Math.round(budget / 50) * 50))];
  }

  function collectMissingInputs(state) {
    const missing = [];
    if (!state.safetyFlagsProvided) missing.push('safetyFlags');
    if (state.controlLevel == null && state.hungerLevel >= 6) missing.push('controlLevel');
    if (state.hungerLevel >= 7 && state.hungerTrend === 'rising' && state.hungerReasons.length === 0) {
      missing.push('hungerReason');
    }
    if (!state.ctx.lastMealAt && !state.ctx.justAte) missing.push('lastMealAt');
    if (state.dataFreshness === 'stale') missing.push('freshContextData');
    return missing;
  }

  function assessSafety(input, context) {
    const state = normalizeInput(input, context);
    const flags = state.safetyFlags;
    const ctx = state.ctx;
    const drivers = [];
    const bodySignals = [
      SAFETY_FLAGS.bodySymptoms,
      SAFETY_FLAGS.dizzy,
      SAFETY_FLAGS.shaky,
      SAFETY_FLAGS.faint,
      SAFETY_FLAGS.confused,
      SAFETY_FLAGS.nausea
    ];
    const glucoseContext = hasAny(flags, [
      SAFETY_FLAGS.diabetes,
      SAFETY_FLAGS.hypoglycemiaRisk,
      SAFETY_FLAGS.glucoseAffectingMedication
    ]) || ctx.diabetes === true || ctx.hypoglycemiaRisk === true ||
      ctx.glucoseAffectingMedication === true || ctx.lowGlucoseReading === true ||
      (Number.isFinite(+ctx.glucoseMgDl) && +ctx.glucoseMgDl < 70);
    const hasBodySignal = hasAny(flags, bodySignals) || ctx.safetySymptoms === true;

    if (hasBodySignal) {
      pushUnique(drivers, 'safety_symptoms');
    }
    if (glucoseContext) {
      pushUnique(drivers, 'glucose_context');
    }

    if (hasBodySignal && glucoseContext) {
      return {
        hardOverride: SAFETY_OVERRIDES.fastCarbSafety,
        delayAllowed: false,
        copyRisk: 'foodFirstOnly',
        riskLevel: 'stop',
        confidence: 'high',
        drivers
      };
    }

    if (hasBodySignal) {
      return {
        hardOverride: SAFETY_OVERRIDES.delayForbidden,
        delayAllowed: false,
        copyRisk: 'foodFirstOnly',
        riskLevel: 'stop',
        confidence: 'high',
        drivers
      };
    }

    if (hasAny(flags, [
      SAFETY_FLAGS.activeOrPastEatingDisorder,
      SAFETY_FLAGS.pregnantOrBreastfeeding,
      SAFETY_FLAGS.minor,
      SAFETY_FLAGS.medicalFastingRestriction
    ]) || ctx.activeOrPastEatingDisorder === true || ctx.edSensitive === true ||
      ctx.pregnantOrBreastfeeding === true || ctx.minor === true || ctx.medicalFastingRestriction === true) {
      return {
        hardOverride: SAFETY_OVERRIDES.medicalBoundary,
        delayAllowed: false,
        copyRisk: 'foodFirstOnly',
        riskLevel: 'high',
        confidence: 'medium',
        drivers: drivers.concat(['medical_boundary'])
      };
    }

    if (hasAny(flags, [SAFETY_FLAGS.repeatedLossOfControl]) ||
      ctx.repeatedLossOfControl === true || ctx.lossOfControlRisk === true) {
      return {
        hardOverride: SAFETY_OVERRIDES.lossOfControl,
        delayAllowed: false,
        copyRisk: 'foodFirstOnly',
        riskLevel: 'high',
        confidence: 'medium',
        drivers: drivers.concat(['loss_of_control_risk'])
      };
    }

    if (hasAny(flags, [SAFETY_FLAGS.possibleLowEnergyAvailability]) ||
      ctx.lowEnergyAvailabilityConcern === true || ctx.possibleLowEnergyAvailability === true) {
      return {
        hardOverride: SAFETY_OVERRIDES.nutritionFloor,
        delayAllowed: false,
        copyRisk: 'avoidRestrictionLanguage',
        riskLevel: 'high',
        confidence: 'medium',
        drivers: drivers.concat(['low_energy_availability'])
      };
    }

    if (hasAny(flags, [SAFETY_FLAGS.hardTrainingRecovery]) ||
      ctx.hardTrainingRecovery === true || ctx.illness === true ||
      hasAny(flags, [SAFETY_FLAGS.illness])) {
      return {
        hardOverride: SAFETY_OVERRIDES.recoveryFoodFirst,
        delayAllowed: false,
        copyRisk: 'avoidRestrictionLanguage',
        riskLevel: 'high',
        confidence: 'medium',
        drivers: drivers.concat(['recovery_need'])
      };
    }

    if (glucoseContext) {
      return {
        hardOverride: null,
        delayAllowed: true,
        copyRisk: 'avoidRestrictionLanguage',
        riskLevel: 'medium',
        confidence: 'medium',
        drivers: drivers.concat(['medical_caution'])
      };
    }

    return {
      hardOverride: null,
      delayAllowed: true,
      copyRisk: state.safetyFlagsProvided ? 'normal' : 'avoidRestrictionLanguage',
      riskLevel: null,
      confidence: state.safetyFlagsProvided ? 'high' : 'medium',
      drivers
    };
  }

  function estimateRiskBudget(input, context) {
    const state = normalizeInput(input, context);
    const ctx = state.ctx;
    const safety = assessSafety(input, context);
    const missingInputs = collectMissingInputs(state);
    const driversUp = [];
    const driversDown = [];
    let score = state.hungerLevel * 2;
    let confidence = state.safetyFlagsProvided ? 'high' : 'medium';

    if (state.controlLevel == null && state.hungerLevel >= 6) confidence = minConfidence(confidence, 'medium');
    if (!ctx.lastMealAt && !ctx.justAte) confidence = minConfidence(confidence, 'medium');
    if (state.dataFreshness === 'stale') confidence = minConfidence(confidence, 'low');

    if (state.hungerTrend === 'rising') {
      score += 8;
      driversUp.push('hunger_rising');
    } else if (state.hungerTrend === 'falling' || state.hungerTrend === 'stable') {
      score -= 8;
      driversDown.push('hunger_stable_or_falling');
    }

    if (state.controlLevel != null && state.controlLevel <= 4) {
      score += 22;
      driversUp.push('low_control');
    } else if (state.controlLevel != null && state.controlLevel <= 6) {
      score += 10;
      driversUp.push('moderate_control');
    }

    if (state.cravingLevel >= 7 || ctx.strongCraving || ctx.specificFoodPull) {
      score += 10;
      driversUp.push('strong_craving');
    }
    if (ctx.stressLevel === 'high' || ctx.stressHigh || +ctx.stressLevel >= 7) {
      score += 10;
      driversUp.push('high_stress');
    } else if (hasReason(state, 'stress')) {
      score += 8;
      driversUp.push('reported_stress');
    }
    if (ctx.mood === 'bad' || ctx.moodDropping || +ctx.moodLevel <= 3) {
      score += 8;
      driversUp.push('mood_pressure');
    }
    if (ctx.sleepQuality === 'poor' || (Number.isFinite(+ctx.sleepHours) && +ctx.sleepHours < 6)) {
      score += 8;
      driversUp.push('poor_sleep');
    }
    if (ctx.sleepQuality === 'veryPoor' || (Number.isFinite(+ctx.sleepHours) && +ctx.sleepHours < 4.5)) {
      score += 6;
      driversUp.push('very_poor_sleep');
    }
    if (ctx.longGap || (Number.isFinite(+ctx.hoursSinceMeal) && +ctx.hoursSinceMeal >= 5)) {
      score += 8;
      driversUp.push('long_gap');
    }
    if (ctx.noIntakeToday) {
      score += 10;
      driversUp.push('no_intake_today');
    }
    if (ctx.skippedMeal || ctx.skippedPlannedMeal || hasReason(state, 'missed_meal')) {
      score += 4;
      driversUp.push('skipped_meal');
    }
    if (hasReason(state, 'meal_time_mismatch')) {
      confidence = minConfidence(confidence, 'medium');
      driversDown.push('meal_time_mismatch');
    }
    if (ctx.knownReboundPattern || ctx.lateSweetReboundPattern || ctx.highRiskTimePattern) {
      score += 12;
      driversUp.push('known_rebound_pattern');
    }
    if (ctx.failedDelayHistory) {
      score += 14;
      driversUp.push('failed_delay_history');
    } else if (state.checkpointAttemptCount >= 2) {
      score += 10;
      driversUp.push('repeated_checkpoints');
    }
    if (ctx.allOrNothingThoughts) {
      score += 18;
      driversUp.push('all_or_nothing_thoughts');
    }
    if (ctx.trainingRecovery === 'hard' || ctx.proteinDebt || ctx.hardTrainingRecovery) {
      score += 8;
      driversUp.push('recovery_or_protein_debt');
    }
    if (ctx.alcoholRecent && (ctx.sleepQuality === 'poor' || ctx.thirsty || ctx.morningSymptoms)) {
      score += 8;
      driversUp.push('alcohol_sleep_context');
      confidence = minConfidence(confidence, 'medium');
    }

    if (state.controlLevel != null && state.controlLevel >= 7) {
      score -= 8;
      driversDown.push('good_control');
      if (ctx.focus === 'stable' || ctx.goodFocus) {
        score -= 4;
        driversDown.push('stable_focus');
      }
    }
    const mealProtection = mealRecencyProtection(ctx);
    if (mealProtection > 0) {
      score -= Math.round(12 * mealProtection);
      driversDown.push('recent_meal_or_satiety_lag');
    }
    if (ctx.successfulWaitHistory) {
      score -= 8;
      driversDown.push('successful_wait_history');
    }

    if (safety.hardOverride) {
      return {
        score: safety.riskLevel === 'stop' ? 100 : Math.max(80, clamp(score, 0, 100)),
        level: safety.riskLevel || 'stop',
        confidence: safety.confidence,
        driversUp: safety.drivers.concat(driversUp),
        driversDown,
        hardOverride: safety.hardOverride,
        missingInputs
      };
    }

    if (state.controlLevel != null && state.controlLevel <= 3 && state.hungerLevel >= 6) {
      score = Math.max(score, 56);
      driversUp.push('control_hard_floor');
    }
    if (ctx.lowEnergyAvailabilityConcern || ctx.veryLowIntakeDay) {
      score = Math.max(score, 56);
      driversUp.push('nutrition_floor_risk');
    }

    if (Number(ctx.recentFailedCheckpointCount) >= 2) {
      score = Math.max(score, 56);
      driversUp.push('repeated_failed_checkpoints');
    } else if (state.checkpointAttemptCount >= 2) {
      score = Math.max(score, 26);
    } else if (state.hungerLevel >= 8) {
      score = Math.max(score, 26);
      driversUp.push('high_hunger_checkpoint_floor');
    }

    score = clamp(Math.round(score), 0, 100);
    if (!ctx.lossOfControlRisk && !ctx.allOrNothingThoughts) {
      score = Math.min(score, 79);
    }
    const level = safety.riskLevel || levelFromScore(score, [
      { max: 25, level: 'low' },
      { max: 55, level: 'medium' },
      { max: 79, level: 'high' },
      { max: 100, level: 'stop' }
    ]);
    return {
      score,
      level,
      confidence,
      driversUp,
      driversDown,
      hardOverride: null,
      missingInputs
    };
  }

  function estimateEnergyStatus(input, context) {
    const state = normalizeInput(input, context);
    const ctx = state.ctx;
    const safety = assessSafety(input, context);
    let label = 'stableBetweenMeals';
    const drivers = [];
    let confidence = state.safetyFlagsProvided ? 'high' : 'medium';
    const mealProtection = mealRecencyProtection(ctx);

    if (safety.hardOverride === SAFETY_OVERRIDES.medicalBoundary ||
      safety.hardOverride === SAFETY_OVERRIDES.fastCarbSafety ||
      ctx.diabetes || ctx.hypoglycemiaRisk || ctx.glucoseAffectingMedication) {
      label = 'medicalCaution';
      drivers.push('medical_or_sensitive_context');
    } else if (safety.hardOverride === SAFETY_OVERRIDES.nutritionFloor ||
      ctx.lowEnergyAvailabilityConcern ||
      (ctx.veryLowIntakeDay && (ctx.trainingRecovery === 'hard' || ctx.fatiguePersistent || ctx.cycleDisruption))) {
      label = 'nutritionFloorRisk';
      drivers.push('low_energy_availability');
    } else if (safety.hardOverride === SAFETY_OVERRIDES.recoveryFoodFirst ||
      ctx.trainingRecovery === 'hard' || ctx.hardTrainingRecovery || ctx.proteinDebt) {
      label = 'recoveryNeed';
      drivers.push('recovery_or_protein_need');
    } else if (ctx.insulinWaveState === 'active' || mealProtection >= 0.65) {
      label = 'fed';
      drivers.push('recent_meal_processing');
    } else if (ctx.noIntakeToday || ctx.veryLowIntakeDay || ctx.threeDayDebtKcal < -1000 || ctx.longGap ||
      (Number.isFinite(+ctx.remainingKcal) && +ctx.remainingKcal > 700)) {
      label = 'deficitPressure';
      drivers.push('low_intake_or_long_gap');
    } else if (ctx.knownReboundPattern || ctx.lateSweetMeal || ctx.lateSweetReboundPattern ||
      ctx.strongCraving || ctx.skippedMeal || ctx.highRiskTimePattern || ctx.alcoholRecent ||
      ctx.premenstrualContext || ctx.nightWakeToEatPattern) {
      label = 'reboundRisk';
      drivers.push('rebound_context');
    } else if (ctx.insulinWaveState === 'declining' || mealProtection > 0) {
      label = 'postMealDecline';
      drivers.push('meal_energy_declining');
    }

    if (state.dataFreshness === 'stale') confidence = 'low';
    else if (state.dataFreshness === 'partial' || hasReason(state, 'unclear')) confidence = minConfidence(confidence, 'medium');
    else if (!ctx.lastMealAt && !ctx.justAte && !ctx.recentMeal) confidence = minConfidence(confidence, 'medium');

    return {
      label,
      confidence,
      drivers,
      dataFreshness: state.dataFreshness
    };
  }

  function calculateFoodPriority(input, context) {
    const state = normalizeInput(input, context);
    const ctx = state.ctx;
    const safety = assessSafety(input, context);
    const risk = estimateRiskBudget(input, context);
    const energyStatus = estimateEnergyStatus(input, context);
    const missingInputs = collectMissingInputs(state);
    const driversUp = [];
    const driversDown = [];
    let score = state.hungerLevel * 4;
    let confidence = minConfidence(risk.confidence, energyStatus.confidence);
    const mealProtection = mealRecencyProtection(ctx);

    if (safety.hardOverride) {
      return {
        score: safety.hardOverride === SAFETY_OVERRIDES.fastCarbSafety ? 100 : 90,
        level: 'foodFirst',
        confidence: safety.confidence,
        driversUp: safety.drivers,
        driversDown,
        hardOverride: safety.hardOverride,
        missingInputs,
        dataFreshness: state.dataFreshness,
        userLabel: 'Food Support Need',
        displayScore: false
      };
    }

    if (state.hungerTrend === 'rising') {
      score += 8;
      driversUp.push('hunger_rising');
    } else if (state.hungerTrend === 'falling' || state.hungerTrend === 'stable') {
      score -= 8;
      driversDown.push('hunger_stable_or_falling');
    }
    if (state.controlLevel != null && state.controlLevel <= 4) {
      score += 18;
      driversUp.push('low_control');
    } else if (state.controlLevel != null && state.controlLevel <= 6) {
      score += 8;
      driversUp.push('moderate_control');
    }
    if (energyStatus.label === 'fed') {
      score -= 15;
      driversDown.push('fed_or_recent_meal');
    }
    if (energyStatus.label === 'postMealDecline') score += 5;
    if (energyStatus.label === 'deficitPressure') {
      score += 12;
      driversUp.push('deficit_pressure');
    }
    if (energyStatus.label === 'reboundRisk') {
      score += 14;
      driversUp.push('rebound_risk');
    }
    if (energyStatus.label === 'recoveryNeed') {
      score += 22;
      driversUp.push('recovery_need');
    }
    if (energyStatus.label === 'nutritionFloorRisk') {
      score += 35;
      driversUp.push('nutrition_floor_risk');
    }
    if (ctx.proteinDebt) {
      score += 8;
      driversUp.push('protein_debt');
    }
    if (ctx.veryLowIntakeDay) {
      score += 18;
      driversUp.push('very_low_intake_day');
    }
    if (ctx.noIntakeToday) {
      score += 10;
      driversUp.push('no_intake_today');
    }
    if (ctx.sleepQuality === 'poor' || +ctx.sleepHours < 6) {
      score += 6;
      driversUp.push('poor_sleep');
    }
    if (ctx.sleepQuality === 'veryPoor' || +ctx.sleepHours < 4.5) {
      score += 6;
      driversUp.push('very_poor_sleep');
    }
    if (ctx.stressLevel === 'high' || +ctx.stressLevel >= 7 || ctx.moodDropping) {
      score += 8;
      driversUp.push('stress_or_mood_pressure');
    } else if (hasReason(state, 'stress')) {
      score += 6;
      driversUp.push('reported_stress');
    }
    if (state.cravingLevel >= 7 || ctx.strongCraving) {
      score += 8;
      driversUp.push('strong_craving');
    }
    if (ctx.highRiskTimePattern) {
      score += 6;
      driversUp.push('high_risk_time_pattern');
    }
    if (ctx.knownReboundPattern) {
      score += 4;
      driversUp.push('known_rebound_pattern');
    }
    if (hasReason(state, 'missed_meal')) {
      score += 10;
      driversUp.push('reported_missed_meal');
    }
    if (mealProtection > 0) {
      score -= Math.round(18 * mealProtection);
      driversDown.push('recent_balanced_meal');
    }
    if (hasReason(state, 'meal_time_mismatch') && hasRecentBalancedMealContext(ctx)) {
      score -= 10;
      confidence = minConfidence(confidence, 'medium');
      driversDown.push('meal_time_mismatch');
    }
    if (hasStableReason(state, 'recent_food') && (hasRecentBalancedMealContext(ctx) || ctx.recentMeal)) {
      score -= 6;
      driversDown.push('stable_hunger_recent_food');
    }
    if (ctx.plannedMealMinutes != null && +ctx.plannedMealMinutes <= 60 && risk.level !== 'high') {
      score -= 8;
      driversDown.push('planned_meal_soon');
    }
    if (ctx.successfulWaitHistory) {
      score -= 8;
      driversDown.push('successful_wait_history');
    }
    if (ctx.failedDelayHistory) {
      score += 12;
      driversUp.push('failed_delay_history');
    }

    score = clamp(Math.round(score), 0, 100);

    const energyBudget = availableEnergyBudget(ctx);
    const canUseEnergyBudgetCap = Number.isFinite(energyBudget) &&
      energyStatus.label !== 'deficitPressure' &&
      energyStatus.label !== 'recoveryNeed' &&
      energyStatus.label !== 'nutritionFloorRisk';
    if (canUseEnergyBudgetCap && energyBudget < 300) {
      score = Math.min(score, 65);
      driversDown.push('day_energy_target_near');
    }

    if (hasRecentBalancedMealContext(ctx) &&
      risk.level !== 'high' && risk.level !== 'stop') {
      score = Math.min(score, 45);
    }
    if (ctx.plannedMealMinutes != null && +ctx.plannedMealMinutes <= 60 &&
      risk.level !== 'high' && risk.level !== 'stop') {
      score = Math.min(score, Math.max(35, score));
    }
    if (ctx.alcoholRecent && ctx.thirsty &&
      energyStatus.label !== 'deficitPressure' &&
      energyStatus.label !== 'recoveryNeed' &&
      energyStatus.label !== 'nutritionFloorRisk') {
      score = Math.min(score, 65);
      driversDown.push('hydration_first');
    }
    if (energyStatus.label === 'nutritionFloorRisk') score = Math.max(score, 86);
    if (energyStatus.label === 'recoveryNeed' && ctx.proteinDebt) score = Math.max(score, 66);
    if (energyStatus.label === 'deficitPressure' && state.hungerLevel >= 7) score = Math.max(score, 66);
    if (state.hungerLevel >= 4) score = Math.max(score, 21);

    const level = levelFromScore(score, [
      { max: 20, level: 'wait' },
      { max: 45, level: 'checkpoint' },
      { max: 65, level: 'snack' },
      { max: 85, level: 'meal' },
      { max: 100, level: 'foodFirst' }
    ]);

    if (state.dataFreshness === 'stale') confidence = minConfidence(confidence, 'low');
    else if (state.dataFreshness === 'partial' || hasReason(state, 'unclear')) confidence = minConfidence(confidence, 'medium');

    return {
      score,
      level,
      confidence,
      driversUp,
      driversDown,
      hardOverride: null,
      missingInputs,
      dataFreshness: state.dataFreshness,
      userLabel: 'Food Support Need',
      displayScore: false
    };
  }

  function foodBandFor(decisionSeed) {
    const ctx = decisionSeed.context || {};
    const action = decisionSeed.suggestedAction;
    const fp = decisionSeed.foodPriority;
    const risk = decisionSeed.riskBudget;
    const energy = decisionSeed.energyStatus;
    const hardOverride = decisionSeed.hardOverride;

    if (decisionSeed.dataFreshness === 'stale' || decisionSeed.missingInputs.includes('lastMealAt')) {
      return undefined;
    }
    if (hardOverride === SAFETY_OVERRIDES.fastCarbSafety) return undefined;
    if (hardOverride === SAFETY_OVERRIDES.medicalBoundary ||
      hardOverride === SAFETY_OVERRIDES.lossOfControl) return [200, 400];
    if (hardOverride === SAFETY_OVERRIDES.nutritionFloor) return [400, 700];
    if (hardOverride === SAFETY_OVERRIDES.recoveryFoodFirst) return ctx.proteinDebt ? [400, 700] : [200, 400];
    if ((ctx.activeOrPastEatingDisorder || ctx.edSensitive) && fp.level === 'foodFirst') return [200, 400];
    if (action === 'observe' || action === 'hydratePause' || action === 'coffeePause' ||
      action === 'delayWithCheck' || action === 'planNextMeal') {
      if (ctx.plannedMealMinutes != null && +ctx.plannedMealMinutes <= 60) return [100, 200];
      return undefined;
    }
    if (action === 'riskBrakeMeal') return fitFoodBandToEnergyBudget(risk.level === 'high' ? [150, 300] : [200, 400], ctx);
    if (action === 'eatSnack') return fitFoodBandToEnergyBudget([200, 400], ctx);
    if (action === 'proteinFiberFirst') {
      return energy.label === 'recoveryNeed' ? [400, 700] : fitFoodBandToEnergyBudget([200, 400], ctx);
    }
    if (action === 'eatMeal') return fitFoodBandToEnergyBudget([400, 700], ctx);
    return undefined;
  }

  function selectAction(input, context) {
    const state = normalizeInput(input, context);
    const ctx = state.ctx;
    const safety = assessSafety(input, context);
    const riskBudget = estimateRiskBudget(input, context);
    const energyStatus = estimateEnergyStatus(input, context);
    const foodPriority = calculateFoodPriority(input, context);
    const missingInputs = collectMissingInputs(state);
    let suggestedAction = 'observe';
    let delayAllowed = safety.delayAllowed;
    let recheckAfterMin;

    const lowHungerAfterRecentMeal = state.hungerLevel <= 3 &&
      energyStatus.label === 'fed' &&
      ctx.veryLowIntakeDay &&
      (state.hungerTrend === 'falling' || state.hungerTrend === 'stable') &&
      !ctx.lowEnergyAvailabilityConcern &&
      !ctx.failedDelayHistory &&
      !ctx.allOrNothingThoughts &&
      !ctx.hardTrainingRecovery &&
      !ctx.proteinDebt;

    if (safety.hardOverride === SAFETY_OVERRIDES.fastCarbSafety) {
      suggestedAction = 'fastCarbSafety';
      delayAllowed = false;
    } else if (safety.hardOverride) {
      suggestedAction = 'doNotDelay';
      delayAllowed = false;
    } else if (riskBudget.level === 'stop') {
      suggestedAction = 'doNotDelay';
      delayAllowed = false;
    } else if (energyStatus.label === 'nutritionFloorRisk') {
      suggestedAction = 'eatMeal';
      delayAllowed = false;
    } else if (energyStatus.label === 'recoveryNeed') {
      suggestedAction = ctx.proteinDebt ? 'proteinFiberFirst' : 'eatMeal';
      delayAllowed = false;
    } else if (lowHungerAfterRecentMeal) {
      suggestedAction = 'planNextMeal';
      recheckAfterMin = 45;
    } else if (riskBudget.level === 'high') {
      suggestedAction = (foodPriority.level === 'meal' || foodPriority.level === 'foodFirst') ? 'eatMeal' : 'riskBrakeMeal';
      delayAllowed = false;
    } else if (foodPriority.level === 'meal' || foodPriority.level === 'foodFirst') {
      suggestedAction = 'eatMeal';
      delayAllowed = false;
    } else if (ctx.alcoholRecent && ctx.thirsty &&
      (riskBudget.level === 'low' || riskBudget.level === 'medium')) {
      suggestedAction = 'hydratePause';
      recheckAfterMin = 20;
    } else if (foodPriority.level === 'snack') {
      suggestedAction = ctx.plannedMealMinutes != null && +ctx.plannedMealMinutes <= 60 ? 'eatSnack' : 'riskBrakeMeal';
      delayAllowed = false;
    } else if (state.hungerLevel <= 3 &&
      (ctx.noIntakeToday || (Number.isFinite(+ctx.hoursSinceMeal) && +ctx.hoursSinceMeal >= 8))) {
      suggestedAction = 'planNextMeal';
      recheckAfterMin = ctx.noIntakeToday ? 60 : 45;
    } else if (riskBudget.level === 'medium' || foodPriority.level === 'checkpoint') {
      if (ctx.alcoholRecent || ctx.thirsty || !ctx.caffeineHabitual) {
        suggestedAction = 'hydratePause';
        recheckAfterMin = 20;
      } else if (ctx.caffeineHabitual && ctx.caffeineRiskLow && !ctx.lateDay) {
        suggestedAction = 'coffeePause';
        recheckAfterMin = 20;
      } else {
        suggestedAction = 'delayWithCheck';
        recheckAfterMin = 30;
      }
    } else {
      suggestedAction = ctx.thirsty ? 'hydratePause' : 'observe';
      recheckAfterMin = suggestedAction === 'hydratePause' ? 20 : 45;
    }

    const seed = {
      context: ctx,
      suggestedAction,
      foodPriority,
      riskBudget,
      energyStatus,
      hardOverride: safety.hardOverride,
      missingInputs,
      dataFreshness: state.dataFreshness
    };
    const foodBandKcal = foodBandFor(seed);

    return {
      suggestedAction,
      delayAllowed,
      recheckAfterMin,
      foodBandKcal,
      postFoodOutcomeAfterMin: suggestedAction === 'fastCarbSafety' ? [15, 15] :
        FOOD_ACTIONS.includes(suggestedAction) ? [30, 90] : undefined
    };
  }

  function explanationFor(decision) {
    const bits = [];
    if (decision.hardOverride) {
      bits.push('Safety context overrides timing and calorie goals.');
    } else {
      bits.push('Decision uses hunger together with risk, recent food, recovery, and history.');
    }
    const riskDrivers = decision.riskBudget.driversUp.slice(0, 2);
    const foodDrivers = [];
    const foodSource = decision.foodPriority.driversUp.length
      ? decision.foodPriority.driversUp
      : decision.foodPriority.driversDown;
    ['stable_hunger_recent_food', 'meal_time_mismatch'].forEach((driver) => {
      if (foodSource.includes(driver)) pushUnique(foodDrivers, driver);
    });
    foodSource.forEach((driver) => pushUnique(foodDrivers, driver));
    if (riskDrivers.length) bits.push('Risk drivers: ' + riskDrivers.join(', ') + '.');
    if (foodDrivers.length) bits.push('Food support drivers: ' + foodDrivers.slice(0, 4).join(', ') + '.');
    return bits.join(' ');
  }

  function validateInvariants(decision) {
    const errors = [];
    if (decision.hardOverride && decision.delayAllowed !== false) {
      errors.push('hardOverride requires delayAllowed=false');
    }
    if (decision.delayAllowed === false && decision.recheckAfterMin != null) {
      errors.push('delayAllowed=false cannot return recheckAfterMin');
    }
    if (decision.hardOverride === SAFETY_OVERRIDES.delayForbidden &&
      DELAY_ACTIONS.includes(decision.suggestedAction)) {
      errors.push('delayForbidden cannot return a delay action');
    }
    if (decision.foodPriority && decision.foodPriority.displayScore !== false) {
      errors.push('Food Priority score must not be user-facing');
    }
    if ((decision.foodPriority?.level === 'meal' || decision.foodPriority?.level === 'foodFirst') &&
      decision.suggestedAction === 'riskBrakeMeal') {
      errors.push('meal-level Food Support Need cannot return snack-level action');
    }
    if ((decision.foodPriority?.level === 'meal' || decision.foodPriority?.level === 'foodFirst') &&
      Array.isArray(decision.foodBandKcal) && decision.foodBandKcal[1] < 400) {
      errors.push('meal-level Food Support Need requires meal-level food band');
    }
    if (DELAY_ACTIONS.includes(decision.suggestedAction) &&
      Array.isArray(decision.foodBandKcal) && decision.foodBandKcal[0] === 0 && decision.foodBandKcal[1] === 0) {
      errors.push('delay action must not encode no-food as [0,0]');
    }
    return errors;
  }

  function assessHungerEvent(input, context) {
    const state = normalizeInput(input, context);
    const safety = assessSafety(input, context);
    const riskBudget = estimateRiskBudget(input, context);
    const energyStatus = estimateEnergyStatus(input, context);
    const foodPriority = calculateFoodPriority(input, context);
    const action = selectAction(input, context);
    const missingInputs = collectMissingInputs(state);
    let confidence = minConfidence(riskBudget.confidence, foodPriority.confidence);
    confidence = minConfidence(confidence, energyStatus.confidence);
    if (missingInputs.length) confidence = minConfidence(confidence, missingInputs.includes('freshContextData') ? 'low' : 'medium');
    const personalModel = state.ctx.personalHungerModel || state.ctx.personalModel;
    if (!safety.hardOverride && personalModel && personalModel.learnedEnough === false &&
      Number(personalModel.sampleSize) > 0) {
      confidence = minConfidence(confidence, 'medium');
    }

    const decision = {
      version: 'hunger-energy-status-v1',
      statusLabel: energyStatus.label,
      energyStatus,
      confidence,
      delayAllowed: action.delayAllowed,
      hardOverride: safety.hardOverride,
      riskBudget,
      foodPriority,
      suggestedAction: action.suggestedAction,
      foodBandKcal: action.foodBandKcal,
      copyRisk: safety.copyRisk || 'normal',
      recheckAfterMin: action.delayAllowed ? action.recheckAfterMin : undefined,
      postFoodOutcomeAfterMin: action.postFoodOutcomeAfterMin,
      delayRiskSignals: riskBudget.driversUp.slice(0, 3),
      stopDelaySignals: action.delayAllowed ? [] : riskBudget.driversUp.slice(0, 3),
      missingInputs,
      dataFreshness: state.dataFreshness,
      requiresCuratorReview: safety.hardOverride === SAFETY_OVERRIDES.medicalBoundary ||
        safety.hardOverride === SAFETY_OVERRIDES.fastCarbSafety ||
        safety.hardOverride === SAFETY_OVERRIDES.lossOfControl ||
        safety.hardOverride === SAFETY_OVERRIDES.nutritionFloor,
      ui: {
        riskRail: {
          level: riskBudget.level,
          score: riskBudget.score,
          confidence: riskBudget.confidence
        },
        foodSupportNeed: {
          label: foodPriority.userLabel,
          level: foodPriority.level,
          displayScore: false
        }
      }
    };
    decision.explanation = explanationFor(decision);
    decision.invariantErrors = validateInvariants(decision);
    return decision;
  }

  HEYS.HungerEnergyStatus = {
    SAFETY_FLAGS,
    SAFETY_OVERRIDES,
    assessHungerEvent,
    assessSafety,
    estimateRiskBudget,
    estimateEnergyStatus,
    calculateFoodPriority,
    selectAction,
    validateInvariants
  };
})(typeof window !== 'undefined' ? window : globalThis);
