/**
 * HEYS Predictive Insights — What-If Scenarios v2.0
 * 
 * Realistic action-level simulations: predict pattern changes from specific actions.
 * Uses actual pattern scores (0-100 scale), evidence-based impact coefficients,
 * and real baseline data from HEYS.InsightsPI analysis.
 * 
 * v2.0 changes:
 * - Score scale: 0-100 (matching real pattern scores)
 * - 15+ patterns covered in prediction engine
 * - Fixed param name mismatches with UI (targetGapHours, targetSteps, etc.)
 * - Realistic deltas: 3-15 points per action
 * - Evidence-based impact coefficients
 * - Comprehensive practical tips for all 10 action types
 * - Health score delta: weighted average across affected patterns
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
     * Impact rules: which patterns are affected by each action.
     * delta = base points change (0-100 scale) for PRIMARY patterns.
     * Secondary patterns get 40-60% of the delta.
     * Each rule has a coefficient function that scales the delta based on actionParams.
     */
    const IMPACT_RULES = {
        [ACTION_TYPES.ADD_PROTEIN]: {
            primary: [
                { pattern: 'protein_satiety', delta: 12, desc: 'Насыщение растёт с белком' },
                { pattern: 'meal_quality', delta: 8, desc: 'Качество приёма повышается' },
                { pattern: 'protein_distribution', delta: 10, desc: 'Распределение белка улучшается' },
                { pattern: 'nutrition_quality', delta: 6, desc: 'Общее качество нутриентов' }
            ],
            secondary: [
                { pattern: 'training_recovery', delta: 5, desc: 'Лучше восстановление' },
                { pattern: 'nutrient_density', delta: 4, desc: 'Плотность нутриентов' }
            ],
            coeff: (params) => {
                const grams = params.proteinGrams || 30;
                return Math.min(grams / 30, 1.5); // 30g=1x, 45g=1.5x, 15g=0.5x
            }
        },
        [ACTION_TYPES.ADD_FIBER]: {
            primary: [
                { pattern: 'fiber_regularity', delta: 14, desc: 'Клетчатка нормализует пищеварение' },
                { pattern: 'gut_health', delta: 10, desc: 'Здоровье ЖКТ улучшается' },
                { pattern: 'meal_quality', delta: 6, desc: 'Качество рациона повышается' }
            ],
            secondary: [
                { pattern: 'nutrition_quality', delta: 5, desc: 'Общее качество питания' },
                { pattern: 'glycemic_load', delta: 4, desc: 'Снижает гликемическую нагрузку' },
                { pattern: 'nutrient_density', delta: 3, desc: 'Готовая плотность нутриентов' }
            ],
            coeff: (params) => {
                const grams = params.fiberGrams || 15;
                return Math.min(grams / 15, 1.8); // 15g=1x, 30g=2x clamp 1.8
            }
        },
        [ACTION_TYPES.REDUCE_CARBS]: {
            primary: [
                { pattern: 'glycemic_load', delta: 12, desc: 'Гликемическая нагрузка снижается' },
                { pattern: 'insulin_sensitivity', delta: 8, desc: 'Чувствительность к инсулину' },
                { pattern: 'added_sugar_dependency', delta: 10, desc: 'Сахарная зависимость снижается' }
            ],
            secondary: [
                { pattern: 'meal_quality', delta: 5, desc: 'Качество рациона' },
                { pattern: 'nutrition_quality', delta: 4, desc: 'Нутритивная ценность' },
                { pattern: 'sleep_weight', delta: 3, desc: 'Сон и масса тела' }
            ],
            coeff: (params) => {
                const pct = params.carbsPercent || 25;
                return Math.min(pct / 25, 1.6); // 25%=1x, 50%=2x clamp 1.6
            }
        },
        [ACTION_TYPES.INCREASE_MEAL_GAP]: {
            primary: [
                { pattern: 'wave_overlap', delta: 10, desc: 'Меньше наложения инсулиновых волн' },
                { pattern: 'meal_timing', delta: 7, desc: 'Улучшение тайминга приёмов' },
                { pattern: 'insulin_sensitivity', delta: 6, desc: 'Чувствительность к инсулину' }
            ],
            secondary: [
                { pattern: 'circadian', delta: 4, desc: 'Циркадные ритмы' },
                { pattern: 'nutrient_timing', delta: 3, desc: 'Тайминг нутриентов' }
            ],
            coeff: (params) => {
                const targetGap = params.targetGapHours || 4;
                // Bigger gap = bigger effect, but diminishing returns
                return 0.5 + (targetGap - 3) * 0.5; // 3h=0.5x, 4h=1x, 5h=1.5x
            }
        },
        [ACTION_TYPES.SHIFT_MEAL_TIME]: {
            primary: [
                { pattern: 'meal_timing', delta: 8, desc: 'Оптимизация тайминга приёмов' },
                { pattern: 'circadian', delta: 7, desc: 'Синхронизация с циркадным ритмом' },
                { pattern: 'late_eating', delta: 6, desc: 'Уменьшение поздних приёмов' }
            ],
            secondary: [
                { pattern: 'nutrient_timing', delta: 4, desc: 'Тайминг нутриентов' },
                { pattern: 'insulin_sensitivity', delta: 3, desc: 'Инсулиновая чувствительность' }
            ],
            coeff: (params) => {
                const shiftMin = Math.abs(params.shiftMinutes || 30);
                return Math.min(shiftMin / 30, 2.0); // 30min=1x, 60min=2x
            }
        },
        [ACTION_TYPES.SKIP_LATE_MEAL]: {
            primary: [
                { pattern: 'late_eating', delta: 15, desc: 'Нет поздних приёмов' },
                { pattern: 'sleep_weight', delta: 8, desc: 'Сон без тяжести' },
                { pattern: 'circadian', delta: 7, desc: 'Циркадный ритм в норме' }
            ],
            secondary: [
                { pattern: 'sleep_quality', delta: 5, desc: 'Качество сна улучшается' },
                { pattern: 'insulin_sensitivity', delta: 4, desc: 'Инсулиновая чувствительность' },
                { pattern: 'wave_overlap', delta: 3, desc: 'Меньше наложений волн' }
            ],
            coeff: () => 1.0 // Fixed action, no params
        },
        [ACTION_TYPES.INCREASE_SLEEP]: {
            primary: [
                { pattern: 'sleep_quality', delta: 12, desc: 'Качество сна растёт' },
                { pattern: 'sleep_weight', delta: 8, desc: 'Нормализуется связь сна и веса' },
                { pattern: 'training_recovery', delta: 7, desc: 'Восстановление после тренировок' }
            ],
            secondary: [
                { pattern: 'mood_trajectory', delta: 5, desc: 'Настроение стабилизируется' },
                { pattern: 'wellbeing_correlation', delta: 4, desc: 'Самочувствие улучшается' },
                { pattern: 'insulin_sensitivity', delta: 3, desc: 'Чувствительность к инсулину' }
            ],
            coeff: (params) => {
                const target = params.targetSleepHours || 8;
                // 7h→8h = 1x, 7h→9h = 1.5x, 7h→10h = 1.8x
                return 0.5 + (target - 7) * 0.5;
            }
        },
        [ACTION_TYPES.ADJUST_BEDTIME]: {
            primary: [
                { pattern: 'sleep_quality', delta: 10, desc: 'Оптимальное время отбоя' },
                { pattern: 'circadian', delta: 9, desc: 'Синхронизация циркадного ритма' },
                { pattern: 'sleep_weight', delta: 6, desc: 'Улучшение связи сна и веса' }
            ],
            secondary: [
                { pattern: 'late_eating', delta: 4, desc: 'Ранний отбой = уменьшение поздней еды' },
                { pattern: 'training_recovery', delta: 3, desc: 'Лучше восстановление' },
                { pattern: 'mood_trajectory', delta: 3, desc: 'Стабильное настроение' }
            ],
            coeff: (params) => {
                const targetBedtime = params.targetBedtime || '22:30';
                const hour = parseTime(targetBedtime);
                // Оптимум 22-23: чем ближе к 22, тем лучше
                if (hour >= 21.5 && hour <= 23) return 1.2;
                if (hour >= 23 && hour <= 23.5) return 1.0;
                if (hour < 21.5) return 0.8; // Слишком рано
                return 0.6; // После 23:30
            }
        },
        [ACTION_TYPES.ADD_TRAINING]: {
            primary: [
                { pattern: 'training_kcal', delta: 12, desc: 'Больше сжигаемых калорий' },
                { pattern: 'training_recovery', delta: 8, desc: 'Тренировочная нагрузка' },
                { pattern: 'training_type_match', delta: 7, desc: 'Соответствие питания тренировке' }
            ],
            secondary: [
                { pattern: 'steps_weight', delta: 5, desc: 'Активность и вес' },
                { pattern: 'sleep_quality', delta: 4, desc: 'Физическая усталость улучшает сон' },
                { pattern: 'heart_health', delta: 3, desc: 'Здоровье сердца' }
            ],
            coeff: (params) => {
                const duration = params.durationMinutes || 45;
                const intensity = params.intensity || 1;
                const intensityMult = [0.7, 1.0, 1.3][intensity] || 1.0;
                return Math.min((duration / 45) * intensityMult, 2.0);
            }
        },
        [ACTION_TYPES.INCREASE_STEPS]: {
            primary: [
                { pattern: 'steps_weight', delta: 10, desc: 'NEAT-активность и вес' },
                { pattern: 'heart_health', delta: 7, desc: 'Кардио-здоровье' },
                { pattern: 'training_kcal', delta: 5, desc: 'Дополнительный расход калорий' }
            ],
            secondary: [
                { pattern: 'sleep_quality', delta: 4, desc: 'Физическая нагрузка помогает сну' },
                { pattern: 'mood_trajectory', delta: 3, desc: 'Прогулки улучшают настроение' },
                { pattern: 'wellbeing_correlation', delta: 3, desc: 'Общее самочувствие' }
            ],
            coeff: (params) => {
                const target = params.targetSteps || 10000;
                // 8000=0.8x, 10000=1x, 15000=1.5x, 20000=1.8x, 30000=2.2x
                if (target <= 15000) return Math.min(target / 10000, 1.5);
                if (target <= 20000) return 1.5 + ((target - 15000) / 5000) * 0.3;
                return Math.min(1.8 + ((target - 20000) / 10000) * 0.4, 2.2);
            }
        }
    };

    /**
     * Category weights for health score calculation (must sum to 1.0)
     */
    const CATEGORY_WEIGHTS = {
        nutrition: 0.25,
        timing: 0.2,
        recovery: 0.2,
        activity: 0.15,
        metabolism: 0.2
    };

    /**
     * Pattern → category mapping for weighted health score
     */
    const PATTERN_CATEGORY = {
        protein_satiety: 'nutrition',
        meal_quality: 'nutrition',
        nutrition_quality: 'nutrition',
        fiber_regularity: 'nutrition',
        protein_distribution: 'nutrition',
        nutrient_density: 'nutrition',
        glycemic_load: 'metabolism',
        insulin_sensitivity: 'metabolism',
        added_sugar_dependency: 'metabolism',
        meal_timing: 'timing',
        wave_overlap: 'timing',
        late_eating: 'timing',
        circadian: 'timing',
        nutrient_timing: 'timing',
        sleep_quality: 'recovery',
        sleep_weight: 'recovery',
        training_recovery: 'recovery',
        mood_trajectory: 'recovery',
        wellbeing_correlation: 'recovery',
        gut_health: 'recovery',
        steps_weight: 'activity',
        training_kcal: 'activity',
        training_type_match: 'activity',
        heart_health: 'activity'
    };

    /**
     * Simulate an action and predict pattern changes
     * @param {string} actionType - One of ACTION_TYPES
     * @param {object} actionParams - Action parameters from UI
     * @param {object[]} days - Historical days
     * @param {object} profile
     * @param {object} pIndex
     * @returns {object} - Simulation result with predictions
     */
    function simulateAction(actionType, actionParams, days, profile, pIndex) {
        console.info('[WhatIf] 🔮 simulateAction called:', {
            actionType,
            actionParams,
            daysCount: days?.length || 0,
            profileId: profile?.id
        });

        // Validate action type
        const validActionTypes = Object.values(ACTION_TYPES);
        if (!validActionTypes.includes(actionType)) {
            console.warn('[WhatIf] ❌ Unknown action type:', actionType);
            return { available: false, error: 'Unknown action type' };
        }

        if (!days || days.length < 7) {
            return { available: false, error: 'Need at least 7 days of data' };
        }

        const rules = IMPACT_RULES[actionType];
        if (!rules) {
            return { available: false, error: 'No impact rules for action' };
        }

        // 1. Get current pattern scores (baseline) — real 0-100 scores
        const baseline = collectBaselineScores(days, profile, pIndex);

        // 2. Calculate coefficient from action params
        const coeff = typeof rules.coeff === 'function' ? rules.coeff(actionParams || {}) : 1.0;

        // 3. Predict pattern score changes
        const predicted = {};
        const impact = [];

        // Process primary impacts
        rules.primary.forEach(rule => {
            const baseScore = baseline[rule.pattern];
            if (baseScore === null || baseScore === undefined) return; // Pattern not available

            const rawDelta = Math.round(rule.delta * coeff);
            const newScore = clampScore(baseScore + rawDelta);
            const actualDelta = newScore - baseScore;

            if (actualDelta !== 0) {
                predicted[rule.pattern] = newScore;
                impact.push({
                    pattern: rule.pattern,
                    baseline: baseScore,
                    predicted: newScore,
                    delta: actualDelta,
                    percentChange: baseScore > 0 ? Math.round((actualDelta / baseScore) * 100) : actualDelta,
                    significance: Math.abs(actualDelta) >= 10 ? 'high' : Math.abs(actualDelta) >= 5 ? 'medium' : 'low',
                    desc: rule.desc,
                    tier: 'primary'
                });
            }
        });

        // Process secondary impacts (reduced effect: 40-60%)
        rules.secondary.forEach(rule => {
            const baseScore = baseline[rule.pattern];
            if (baseScore === null || baseScore === undefined) return;

            const secondaryMult = 0.5; // 50% of primary effect
            const rawDelta = Math.round(rule.delta * coeff * secondaryMult);
            const newScore = clampScore(baseScore + rawDelta);
            const actualDelta = newScore - baseScore;

            if (actualDelta !== 0) {
                predicted[rule.pattern] = newScore;
                impact.push({
                    pattern: rule.pattern,
                    baseline: baseScore,
                    predicted: newScore,
                    delta: actualDelta,
                    percentChange: baseScore > 0 ? Math.round((actualDelta / baseScore) * 100) : actualDelta,
                    significance: Math.abs(actualDelta) >= 8 ? 'medium' : 'low',
                    desc: rule.desc,
                    tier: 'secondary'
                });
            }
        });

        // Sort by absolute delta descending
        impact.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

        const result = {
            available: true,
            actionType,
            actionParams,
            baseline,
            predicted,
            impact,
            sideBenefits: identifySideBenefits(impact),
            healthScoreChange: calculateHealthScoreChange(impact, baseline),
            practicalTips: generatePracticalTips(actionType, actionParams, impact)
        };

        console.info('[WhatIf] ✅ Simulation complete:', {
            actionType,
            coeff: coeff.toFixed(2),
            impactCount: impact.length,
            topImpact: impact[0] ? `${impact[0].pattern}: +${impact[0].delta}` : 'none',
            sideBenefitsCount: result.sideBenefits.length,
            healthScoreDelta: result.healthScoreChange.delta
        });

        return result;
    }

    /**
     * Collect baseline pattern scores from latest insights analysis (0-100 scale).
     * Uses cached pattern results if available, or falls back to direct analysis.
     * @private
     */
    function collectBaselineScores(days, profile, pIndex) {
        const scores = {};

        // Try to get scores from latest insights analysis (cached results)
        const cachedPatterns = HEYS.InsightsPI?._lastPatterns || HEYS.InsightsPI?._patterns;
        if (cachedPatterns && Array.isArray(cachedPatterns)) {
            cachedPatterns.forEach(p => {
                if (p.available && typeof p.score === 'number') {
                    scores[p.pattern] = p.score;
                }
            });

            if (Object.keys(scores).length >= 5) {
                console.info('[WhatIf] 📊 Baseline from cached patterns:', {
                    count: Object.keys(scores).length,
                    sample: Object.entries(scores).slice(0, 5).map(([k, v]) => `${k}:${v}`)
                });
                return scores;
            }
        }

        // Fallback: compute key patterns directly
        const patterns = HEYS.InsightsPI?.patterns;
        if (!patterns) {
            console.warn('[WhatIf] ⚠️ No patterns module, using moderate defaults');
            return getDefaultBaseline();
        }

        try {
            const recentDays = days.slice(-14);

            const runners = [
                { key: 'meal_timing', fn: () => patterns.analyzeMealTiming?.(recentDays, profile, pIndex) },
                { key: 'wave_overlap', fn: () => patterns.analyzeWaveOverlap?.(recentDays, profile) },
                { key: 'late_eating', fn: () => patterns.analyzeLateEating?.(recentDays, profile, pIndex) },
                { key: 'meal_quality', fn: () => patterns.analyzeMealQualityTrend?.(recentDays, pIndex) },
                { key: 'nutrition_quality', fn: () => patterns.analyzeNutritionQuality?.(recentDays, pIndex) },
                { key: 'protein_satiety', fn: () => patterns.analyzeProteinSatiety?.(recentDays, profile, pIndex) },
                { key: 'fiber_regularity', fn: () => patterns.analyzeFiberRegularity?.(recentDays, pIndex) },
                { key: 'sleep_weight', fn: () => patterns.analyzeSleepWeight?.(recentDays, profile, pIndex) },
                { key: 'sleep_quality', fn: () => patterns.analyzeSleepQuality?.(recentDays, pIndex) },
                { key: 'training_kcal', fn: () => patterns.analyzeTrainingKcal?.(recentDays, pIndex) },
                { key: 'training_recovery', fn: () => patterns.analyzeTrainingRecovery?.(recentDays) },
                { key: 'steps_weight', fn: () => patterns.analyzeStepsWeight?.(recentDays, profile, pIndex) },
                { key: 'circadian', fn: () => patterns.analyzeCircadianTiming?.(recentDays, profile, pIndex) },
                { key: 'nutrient_timing', fn: () => patterns.analyzeNutrientTiming?.(recentDays, pIndex) },
                { key: 'insulin_sensitivity', fn: () => patterns.analyzeInsulinSensitivity?.(recentDays, pIndex, profile) },
                { key: 'gut_health', fn: () => patterns.analyzeGutHealth?.(recentDays, pIndex) },
                { key: 'glycemic_load', fn: () => patterns.analyzeGlycemicLoad?.(recentDays, pIndex) },
                { key: 'protein_distribution', fn: () => patterns.analyzeProteinDistribution?.(recentDays, profile, pIndex) },
                { key: 'added_sugar_dependency', fn: () => patterns.analyzeAddedSugarDependency?.(recentDays, pIndex) },
                { key: 'heart_health', fn: () => patterns.analyzeHeartHealth?.(recentDays, pIndex) },
                { key: 'training_type_match', fn: () => patterns.analyzeTrainingTypeMatch?.(recentDays, profile, pIndex) },
                { key: 'nutrient_density', fn: () => patterns.analyzeNutrientDensity?.(recentDays, pIndex) },
                { key: 'mood_trajectory', fn: () => patterns.analyzeMoodTrajectory?.(recentDays, pIndex) },
                { key: 'wellbeing_correlation', fn: () => patterns.analyzeWellbeing?.(recentDays, pIndex) }
            ];

            runners.forEach(({ key, fn }) => {
                try {
                    const result = fn();
                    if (result && result.available && typeof result.score === 'number') {
                        scores[key] = result.score;
                    }
                } catch (e) {
                    // Silently skip failed pattern
                }
            });

            console.info('[WhatIf] 📊 Baseline computed:', {
                count: Object.keys(scores).length,
                sample: Object.entries(scores).slice(0, 5).map(([k, v]) => `${k}:${v}`)
            });
        } catch (e) {
            console.warn('[WhatIf] ⚠️ Error computing baseline:', e.message);
        }

        // v62: Fallback — patterns module existed but returned no usable results
        // (e.g. insufficient data, mock structure mismatch, all patterns unavailable).
        if (Object.keys(scores).length < 5) {
            console.warn('[WhatIf] ⚠️ Insufficient baseline data (' + Object.keys(scores).length + ' patterns), using defaults');
            return getDefaultBaseline();
        }

        return scores;
    }

    /**
     * Default baseline scores for common patterns (when no data available)
     * @private
     */
    function getDefaultBaseline() {
        return {
            meal_timing: 60, wave_overlap: 50, late_eating: 50,
            meal_quality: 55, nutrition_quality: 45, protein_satiety: 40,
            fiber_regularity: 40, sleep_weight: 50, sleep_quality: 50,
            training_kcal: 50, training_recovery: 55, steps_weight: 45,
            circadian: 60, nutrient_timing: 50, insulin_sensitivity: 50,
            gut_health: 50, glycemic_load: 55, protein_distribution: 45,
            added_sugar_dependency: 40, heart_health: 60, training_type_match: 40,
            nutrient_density: 50, mood_trajectory: 55, wellbeing_correlation: 50
        };
    }

    /**
     * Identify side benefits (positive impacts from secondary patterns)
     * @private
     */
    function identifySideBenefits(impact) {
        return impact
            .filter(i => i.tier === 'secondary' && i.delta > 0)
            .map(i => ({
                pattern: i.pattern,
                improvement: `+${i.delta} баллов`,
                desc: i.desc
            }));
    }

    /**
     * Calculate overall Health Score change (weighted by category importance)
     * @private
     */
    function calculateHealthScoreChange(impact, baseline) {
        if (impact.length === 0) {
            return { delta: 0, percent: 0 };
        }

        // Weighted sum by category
        let totalWeightedDelta = 0;
        let totalWeight = 0;

        impact.forEach(i => {
            const category = PATTERN_CATEGORY[i.pattern] || 'nutrition';
            const categoryWeight = CATEGORY_WEIGHTS[category] || 0.15;
            // Each pattern gets equal share within its category
            const patternWeight = categoryWeight * (i.tier === 'primary' ? 1.0 : 0.5);

            totalWeightedDelta += i.delta * patternWeight;
            totalWeight += patternWeight;
        });

        // Normalize to approximate health score delta (0-100 scale)
        const delta = totalWeight > 0 ? Math.round(totalWeightedDelta / totalWeight) : 0;
        const percent = delta; // Already on 0-100 scale

        return { delta, percent };
    }

    /**
     * Generate practical tips for action (all 10 types covered)
     * @private
     */
    function generatePracticalTips(actionType, params, impact) {
        const tips = [];
        const p = params || {};

        switch (actionType) {
            case ACTION_TYPES.ADD_PROTEIN: {
                const grams = p.proteinGrams || 30;
                const meal = getMealName(p.mealIndex || 0);
                tips.push(`Добавьте ${grams}г белка в ${meal}`);
                tips.push('🥚 Яйца, творог 5%, куриная грудка или протеиновый коктейль');
                if (grams >= 30) {
                    tips.push('Распределите белок равномерно в течение дня (25-35г на приём)');
                }
                break;
            }
            case ACTION_TYPES.ADD_FIBER: {
                const grams = p.fiberGrams || 15;
                tips.push(`Добавьте ${grams}г клетчатки в рацион`);
                tips.push('🥦 Брокколи, овёс, чечевица, ягоды, авокадо');
                tips.push('Увеличивайте клетчатку постепенно (+5г/неделю) и пейте больше воды');
                break;
            }
            case ACTION_TYPES.REDUCE_CARBS: {
                const pct = p.carbsPercent || 25;
                tips.push(`Снизить быстрые углеводы на ~${pct}%`);
                tips.push('🍞 Замените белый хлеб → цельнозерновой, сахар → стевия');
                tips.push('Сложные углеводы (гречка, бурый рис) в первой половине дня');
                break;
            }
            case ACTION_TYPES.INCREASE_MEAL_GAP: {
                const gap = p.targetGapHours || 4;
                tips.push(`Увеличьте промежуток между приёмами до ${gap}ч`);
                tips.push('☕ Между приёмами — вода, чай, чёрный кофе (без сахара)');
                tips.push('Это поможет инсулину вернуться к базальному уровню');
                break;
            }
            case ACTION_TYPES.SHIFT_MEAL_TIME: {
                const shiftMin = Math.abs(p.shiftMinutes || 30);
                const direction = (p.shiftMinutes || -30) < 0 ? 'раньше' : 'позже';
                const meal = getMealName(p.mealIndex || 0);
                tips.push(`Сдвиньте ${meal} на ${shiftMin} мин ${direction}`);
                tips.push('🕐 Оптимальное окно: завтрак 7-9, обед 12-14, ужин 18-19:30');
                tips.push('Придерживайтесь стабильного расписания каждый день');
                break;
            }
            case ACTION_TYPES.SKIP_LATE_MEAL:
                tips.push('Последний приём пищи — не позже 19:00-20:00');
                tips.push('🌙 Если голодны вечером — травяной чай или кефир 1%');
                tips.push('Пищевое окно 10-12ч (напр. 8:00-20:00) для циркадного ритма');
                break;

            case ACTION_TYPES.INCREASE_SLEEP: {
                const target = p.targetSleepHours || 8;
                tips.push(`Целевая длительность сна: ${target}ч`);
                tips.push('😴 Ложитесь на 30-60 мин раньше привычного');
                tips.push('Установите будильник-напоминание «пора спать» за 30 мин');
                if (target >= 9) {
                    tips.push('9+ часов подходит при высоких тренировочных нагрузках');
                }
                break;
            }
            case ACTION_TYPES.ADJUST_BEDTIME: {
                const bt = p.targetBedtime || '22:30';
                tips.push(`Оптимальное время отбоя: ${bt}`);
                tips.push('🛏️ За 1 час до сна: нет экранов, тёплый душ, лёгкая растяжка');
                tips.push('Фиксированное время отбоя ±15 мин, включая выходные');
                break;
            }
            case ACTION_TYPES.ADD_TRAINING: {
                const dur = p.durationMinutes || 45;
                const intensityLabels = ['лёгкая', 'средняя', 'высокая'];
                const intLabel = intensityLabels[p.intensity || 1] || 'средняя';
                tips.push(`Добавьте тренировку ${dur} мин, интенсивность: ${intLabel}`);
                tips.push('🏋️ Силовая 2-3 раза/нед + кардио 2 раза/нед = оптимум');
                tips.push('Приём белка 25-30г в течение 2ч после тренировки');
                break;
            }
            case ACTION_TYPES.INCREASE_STEPS: {
                const target = p.targetSteps || 10000;
                tips.push(`Цель: ${target.toLocaleString('ru')} шагов в день`);
                tips.push('🚶 Прогулка 20 мин после обеда = ~2000 шагов');
                tips.push('Используйте лестницу вместо лифта, паркуйтесь дальше');
                break;
            }
        }

        // Add impact-based tip if significant improvement expected
        const topImpact = impact[0];
        if (topImpact && topImpact.delta >= 8) {
            tips.push(`📈 Наибольший эффект ожидается на: ${topImpact.desc} (+${topImpact.delta} баллов)`);
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

    /**
     * Clamp score to 0-100 range
     * @private
     */
    function clampScore(score) {
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    // Export API
    HEYS.InsightsPI.whatif = {
        ACTION_TYPES,
        simulate: simulateAction
    };

    console.info('[HEYS.InsightsPI.whatif] ✅ What-If Scenarios v2.0 initialized (realistic predictions)');

})(typeof window !== 'undefined' ? window : global);
