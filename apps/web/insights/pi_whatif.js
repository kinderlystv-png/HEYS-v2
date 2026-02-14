/**
 * HEYS Predictive Insights — What-If Scenarios v1.0
 * 
 * Action-level simulations: predict pattern changes from specific actions.
 * 
 * Сценарии:
 * 1. Изменить protein в завтраке → predict satiety, meal_timing scores
 * 2. Изменить meal gap → predict wave_overlap, training_kcal scores
 * 3. Изменить bedtime → predict sleep_weight, recovery scores
 * 4. Добавить тренировку → predict steps_weight, training_kcal scores
 * 
 * Dependencies: pi_patterns.js, pi_calculations.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    /**
     * Available action types
     */
    const ACTION_TYPES = {
        // Meal composition
        ADD_PROTEIN: 'add_protein',
        ADD_FIBER: 'add_fiber',
        REDUCE_CARBS: 'reduce_carbs',

        // Meal timing
        INCREASE_MEAL_GAP: 'increase_meal_gap',
        SHIFT_MEAL_TIME: 'shift_meal_time',
        SKIP_LATE_MEAL: 'skip_late_meal',

        // Sleep
        INCREASE_SLEEP: 'increase_sleep',
        ADJUST_BEDTIME: 'adjust_bedtime',

        // Activity
        ADD_TRAINING: 'add_training',
        INCREASE_STEPS: 'increase_steps'
    };

    /**
     * Pattern impact matrix: which patterns are affected by which actions
     */
    const IMPACT_MATRIX = {
        [ACTION_TYPES.ADD_PROTEIN]: {
            primary: ['protein_satiety', 'meal_quality_trend'],
            secondary: ['meal_timing', 'training_recovery']
        },
        [ACTION_TYPES.ADD_FIBER]: {
            primary: ['fiber_regularity', 'meal_quality_trend'],
            secondary: ['protein_satiety']
        },
        [ACTION_TYPES.REDUCE_CARBS]: {
            primary: ['insulin_wave', 'late_eating'],
            secondary: ['sleep_weight', 'meal_quality_trend']
        },
        [ACTION_TYPES.INCREASE_MEAL_GAP]: {
            primary: ['wave_overlap', 'meal_timing'],
            secondary: ['training_kcal', 'insulin_wave']
        },
        [ACTION_TYPES.SHIFT_MEAL_TIME]: {
            primary: ['meal_timing', 'late_eating'],
            secondary: ['sleep_quality', 'training_kcal']
        },
        [ACTION_TYPES.SKIP_LATE_MEAL]: {
            primary: ['late_eating', 'sleep_weight'],
            secondary: ['sleep_quality', 'insulin_wave']
        },
        [ACTION_TYPES.INCREASE_SLEEP]: {
            primary: ['sleep_weight', 'sleep_quality'],
            secondary: ['training_recovery', 'meal_quality_trend']
        },
        [ACTION_TYPES.ADJUST_BEDTIME]: {
            primary: ['sleep_quality', 'sleep_weight'],
            secondary: ['late_eating', 'training_recovery']
        },
        [ACTION_TYPES.ADD_TRAINING]: {
            primary: ['training_kcal', 'training_recovery'],
            secondary: ['steps_weight', 'sleep_quality']
        },
        [ACTION_TYPES.INCREASE_STEPS]: {
            primary: ['steps_weight', 'training_kcal'],
            secondary: ['sleep_quality']
        }
    };

    /**
     * Simulate an action and predict pattern changes
     * @param {string} actionType - One of ACTION_TYPES
     * @param {object} actionParams - Action parameters (e.g., { proteinGrams: 30, mealIndex: 0 })
     * @param {object[]} days - Historical days
     * @param {object} profile
     * @param {object} pIndex
     * @returns {object} - Simulation result with predictions
     */
    function simulateAction(actionType, actionParams, days, profile, pIndex) {
        console.log('[WhatIf] 🔮 simulateAction called:', {
            actionType,
            actionParams,
            daysCount: days?.length || 0,
            profileId: profile?.id
        });

        // Validate action type (check if actionType is a valid ACTION_TYPES value)
        const validActionTypes = Object.values(ACTION_TYPES);
        if (!validActionTypes.includes(actionType)) {
            console.warn('[WhatIf] ❌ Unknown action type:', actionType);
            return { available: false, error: 'Unknown action type' };
        }

        if (days.length < 7) {
            return { available: false, error: 'Need at least 7 days of data' };
        }

        // Get current pattern scores (baseline)
        const baseline = calculateBaselineScores(days, profile, pIndex);

        // Apply action to create modified day
        const modifiedDay = applyAction(days[days.length - 1], actionType, actionParams, profile, pIndex);

        // Predict new pattern scores
        const predicted = predictScoresAfterAction(modifiedDay, days, profile, pIndex, actionType);

        // Calculate impact
        const impact = calculateImpact(baseline, predicted, actionType);

        const result = {
            available: true,
            actionType,
            actionParams,
            baseline: baseline.scores,
            predicted: predicted.scores,
            impact,
            sideBenefits: identifySideBenefits(impact),
            healthScoreChange: calculateHealthScoreChange(impact),
            practicalTips: generatePracticalTips(actionType, actionParams, impact)
        };

        console.log('[WhatIf] ✅ Simulation complete:', {
            actionType,
            impactCount: impact.length,
            sideBenefitsCount: result.sideBenefits.length,
            healthScoreDelta: result.healthScoreChange.delta
        });

        return result;
    }

    /**
     * Calculate baseline pattern scores from recent days
     * @private
     */
    function calculateBaselineScores(days, profile, pIndex) {
        const patterns = HEYS.InsightsPI?.patterns;
        if (!patterns) {
            console.warn('[WhatIf] Patterns module not available');
            return { scores: {} };
        }

        const recentDays = days.slice(-14);
        const scores = {};

        // Calculate scores for key patterns
        try {
            const proteinSatiety = patterns.lifestyle?.analyzeProteinSatiety?.(recentDays, profile, pIndex);
            scores.protein_satiety = proteinSatiety?.correlation || 0;

            const mealTiming = patterns.timing?.analyzeMealTiming?.(recentDays, profile, pIndex);
            scores.meal_timing = mealTiming?.score || 0;

            const waveOverlap = patterns.timing?.analyzeWaveOverlap?.(recentDays, profile, pIndex);
            scores.wave_overlap = waveOverlap?.score || 0;

            const lateEating = patterns.timing?.analyzeLateEating?.(recentDays, profile, pIndex);
            scores.late_eating = lateEating?.score || 0;

            const sleepWeight = patterns.lifestyle?.analyzeSleepWeight?.(recentDays, profile, pIndex);
            scores.sleep_weight = sleepWeight?.correlation || 0;

            const sleepQuality = patterns.quality?.analyzeSleepQuality?.(recentDays, profile, pIndex);
            scores.sleep_quality = sleepQuality?.overall || 0;

            const stepsWeight = patterns.activity?.analyzeStepsWeight?.(recentDays, profile, pIndex);
            scores.steps_weight = stepsWeight?.correlation || 0;
        } catch (e) {
            console.warn('[WhatIf] Error calculating baseline:', e.message);
        }

        return { scores };
    }

    /**
     * Apply action to a day (create modified copy)
     * @private
     */
    function applyAction(day, actionType, actionParams, profile, pIndex) {
        const modified = JSON.parse(JSON.stringify(day)); // Deep clone

        switch (actionType) {
            case ACTION_TYPES.ADD_PROTEIN:
                modified.meals = modified.meals || [];
                const mealIndex = actionParams.mealIndex || 0;
                if (modified.meals[mealIndex]) {
                    modified.meals[mealIndex].protein_added = actionParams.proteinGrams || 30;
                }
                break;

            case ACTION_TYPES.ADD_FIBER:
                modified.fiber_added = actionParams.fiberGrams || 10;
                break;

            case ACTION_TYPES.REDUCE_CARBS:
                modified.carbs_reduced = actionParams.carbReduction || 50;
                break;

            case ACTION_TYPES.INCREASE_MEAL_GAP:
                modified.meal_gap_increased = actionParams.gapIncrease || 1; // hours
                break;

            case ACTION_TYPES.SKIP_LATE_MEAL:
                modified.meals = modified.meals || [];
                if (modified.meals.length > 0) {
                    const lastMeal = modified.meals[modified.meals.length - 1];
                    if (lastMeal.time && parseTime(lastMeal.time) > 20) {
                        modified.meals.pop(); // Remove last meal
                        modified.late_meal_skipped = true;
                    }
                }
                break;

            case ACTION_TYPES.INCREASE_SLEEP:
                modified.sleepHours = (modified.sleepHours || 7) + (actionParams.sleepIncrease || 1);
                break;

            case ACTION_TYPES.ADJUST_BEDTIME:
                modified.bedtime_adjusted = actionParams.bedtimeShift || -1; // hours (negative = earlier)
                break;

            case ACTION_TYPES.ADD_TRAINING:
                modified.training_added = {
                    duration: actionParams.trainingDuration || 60,
                    intensity: actionParams.trainingIntensity || 'medium'
                };
                break;

            case ACTION_TYPES.INCREASE_STEPS:
                modified.steps = (modified.steps || 5000) + (actionParams.stepsIncrease || 3000);
                break;
        }

        return modified;
    }

    /**
     * Predict pattern scores after applying action
     * @private
     */
    function predictScoresAfterAction(modifiedDay, days, profile, pIndex, actionType) {
        const scores = {};
        const affectedPatterns = IMPACT_MATRIX[actionType];

        if (!affectedPatterns) {
            return { scores };
        }

        // Predict primary impacts
        affectedPatterns.primary.forEach(patternKey => {
            scores[patternKey] = predictPatternScore(patternKey, modifiedDay, days, profile, pIndex);
        });

        // Predict secondary impacts (smaller effect)
        affectedPatterns.secondary.forEach(patternKey => {
            scores[patternKey] = predictPatternScore(patternKey, modifiedDay, days, profile, pIndex, 0.5);
        });

        return { scores };
    }

    /**
     * Predict single pattern score
     * @private
     */
    function predictPatternScore(patternKey, modifiedDay, days, profile, pIndex, multiplier = 1.0) {
        // Simplified prediction logic (placeholder for ML-based prediction)
        const baseline = getPatternBaseline(patternKey, days, profile, pIndex);

        // Heuristic adjustments based on pattern type
        let predicted = baseline;

        switch (patternKey) {
            case 'protein_satiety':
                if (modifiedDay.meals?.[0]?.protein_added) {
                    predicted += 0.15 * multiplier; // +15% correlation
                }
                break;

            case 'meal_timing':
                if (modifiedDay.meal_gap_increased) {
                    predicted += 0.1 * multiplier; // +10% score
                }
                break;

            case 'late_eating':
                if (modifiedDay.late_meal_skipped) {
                    predicted += 0.2 * multiplier; // +20% score
                }
                break;

            case 'sleep_weight':
                if (modifiedDay.sleepHours > 7.5) {
                    predicted += 0.1 * multiplier; // +10% correlation
                }
                break;

            case 'steps_weight':
                if (modifiedDay.steps > 8000) {
                    predicted += 0.12 * multiplier; // +12% correlation
                }
                break;
        }

        return Math.min(1.0, Math.max(-1.0, predicted));
    }

    /**
     * Get baseline pattern score
     * @private
     */
    function getPatternBaseline(patternKey, days, profile, pIndex) {
        const patterns = HEYS.InsightsPI?.patterns;
        if (!patterns) return 0;

        const recentDays = days.slice(-14);

        try {
            switch (patternKey) {
                case 'protein_satiety':
                    const ps = patterns.lifestyle?.analyzeProteinSatiety?.(recentDays, profile, pIndex);
                    return ps?.correlation || 0;

                case 'meal_timing':
                    const mt = patterns.timing?.analyzeMealTiming?.(recentDays, profile, pIndex);
                    return mt?.score || 0;

                case 'late_eating':
                    const le = patterns.timing?.analyzeLateEating?.(recentDays, profile, pIndex);
                    return le?.score || 0;

                case 'sleep_weight':
                    const sw = patterns.lifestyle?.analyzeSleepWeight?.(recentDays, profile, pIndex);
                    return sw?.correlation || 0;

                case 'steps_weight':
                    const stw = patterns.activity?.analyzeStepsWeight?.(recentDays, profile, pIndex);
                    return stw?.correlation || 0;

                default:
                    return 0;
            }
        } catch (e) {
            return 0;
        }
    }

    /**
     * Calculate impact metrics
     * @private
     */
    function calculateImpact(baseline, predicted, actionType) {
        const impacts = [];

        for (const [patternKey, predictedScore] of Object.entries(predicted.scores)) {
            const baselineScore = baseline.scores[patternKey] || 0;
            const delta = predictedScore - baselineScore;
            const percentChange = baselineScore !== 0 ? (delta / Math.abs(baselineScore)) * 100 : 0;

            if (Math.abs(delta) > 0.05) { // Significant change threshold
                impacts.push({
                    pattern: patternKey,
                    baseline: Math.round(baselineScore * 100) / 100,
                    predicted: Math.round(predictedScore * 100) / 100,
                    delta: Math.round(delta * 100) / 100,
                    percentChange: Math.round(percentChange),
                    significance: Math.abs(delta) > 0.15 ? 'high' : 'medium'
                });
            }
        }

        return impacts;
    }

    /**
     * Identify side benefits (positive impacts on secondary patterns)
     * @private
     */
    function identifySideBenefits(impact) {
        return impact.filter(i => i.delta > 0.05).map(i => ({
            pattern: i.pattern,
            improvement: `+${i.percentChange}%`
        }));
    }

    /**
     * Calculate overall Health Score change
     * @private
     */
    function calculateHealthScoreChange(impact) {
        const totalDelta = impact.reduce((sum, i) => sum + i.delta, 0);
        const avgDelta = impact.length > 0 ? totalDelta / impact.length : 0;
        return {
            delta: Math.round(avgDelta * 100) / 100,
            percent: Math.round(avgDelta * 100)
        };
    }

    /**
     * Generate practical tips for action
     * @private
     */
    function generatePracticalTips(actionType, actionParams, impact) {
        const tips = [];

        switch (actionType) {
            case ACTION_TYPES.ADD_PROTEIN:
                tips.push('Добавьте яйца, творог или протеиновый коктейль');
                tips.push(`Цель: ${actionParams.proteinGrams || 30}г белка в ${getMealName(actionParams.mealIndex || 0)}`);
                break;

            case ACTION_TYPES.INCREASE_MEAL_GAP:
                tips.push(`Увеличьте промежуток между приёмами до ${actionParams.gapIncrease + 3}ч`);
                tips.push('Пейте воду или чай между приёмами');
                break;

            case ACTION_TYPES.SKIP_LATE_MEAL:
                tips.push('Последний приём пищи — не позже 20:00');
                tips.push('Если голодны вечером — кефир или лёгкий овощной салат');
                break;

            case ACTION_TYPES.INCREASE_SLEEP:
                tips.push(`Ложитесь спать на ${actionParams.sleepIncrease || 1}ч раньше`);
                tips.push('Установите напоминание за 30 мин до сна');
                break;

            case ACTION_TYPES.INCREASE_STEPS:
                tips.push(`Цель: ${actionParams.stepsIncrease + 5000} шагов/день`);
                tips.push('Прогулка после обеда или вечером');
                break;
        }

        return tips;
    }

    /**
     * Helper: parse time string to hours
     * @private
     */
    function parseTime(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours + (minutes || 0) / 60;
    }

    /**
     * Helper: get meal name by index
     * @private
     */
    function getMealName(index) {
        const names = ['завтрак', 'обед', 'ужин', 'перекус'];
        return names[index] || 'приём пищи';
    }

    // Export API
    HEYS.InsightsPI.whatif = {
        ACTION_TYPES,
        simulate: simulateAction
    };

    console.info('[HEYS.InsightsPI.whatif] ✅ What-If Scenarios v1.0 initialized');

})(typeof window !== 'undefined' ? window : global);
