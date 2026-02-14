/**
 * HEYS Predictive Insights — Next Meal Recommender v2.4
 * 
 * Context-aware meal guidance with 8 scenarios:
 * - GOAL_REACHED: day target met (<50 kcal remaining)
 * - LIGHT_SNACK: low budget (50-150 kcal) or late hour
 * - LATE_EVENING: after adaptive late_eating_hour threshold
 * - PRE_WORKOUT: training in 1-2h
 * - POST_WORKOUT: training was 0-2h ago
 * - PROTEIN_DEFICIT: protein <50% target
 * - STRESS_EATING: stress >3 OR mood <3
 * - BALANCED: default scenario
 * 
 * v2.4 Features:
 * - Adaptive thresholds integration (late_eating_hour, meal_gap_hours)
 * - Scenario-specific macro strategies
 * - Context-aware reasoning
 * - Enhanced verification logging
 * 
 * Dependencies: pi_thresholds.js, pi_phenotype.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    // Scenario constants (priority order)
    const SCENARIOS = {
        GOAL_REACHED: 'GOAL_REACHED',
        LIGHT_SNACK: 'LIGHT_SNACK',
        LATE_EVENING: 'LATE_EVENING',
        PRE_WORKOUT: 'PRE_WORKOUT',
        POST_WORKOUT: 'POST_WORKOUT',
        PROTEIN_DEFICIT: 'PROTEIN_DEFICIT',
        STRESS_EATING: 'STRESS_EATING',
        BALANCED: 'BALANCED'
    };

    // Scenario icons for UI
    const SCENARIO_ICONS = {
        [SCENARIOS.GOAL_REACHED]: '🎯',
        [SCENARIOS.LIGHT_SNACK]: '☕',
        [SCENARIOS.LATE_EVENING]: '🌙',
        [SCENARIOS.PRE_WORKOUT]: '⚡',
        [SCENARIOS.POST_WORKOUT]: '💪',
        [SCENARIOS.PROTEIN_DEFICIT]: '🥩',
        [SCENARIOS.STRESS_EATING]: '🧘',
        [SCENARIOS.BALANCED]: '🍽️'
    };

    /**
     * Analyze current context to determine meal scenario
     * @param {object} context - Current day context
     * @param {object} dayTarget - Day nutrient targets
     * @param {object} dayEaten - Already consumed nutrients
     * @param {object} profile - User profile
     * @param {number} currentTime - Current time (decimal hours)
     * @param {object} thresholds - Adaptive thresholds (optional)
     * @returns {object} - Scenario + metadata
     * @private
     */
    function analyzeCurrentContext(context, dayTarget, dayEaten, profile, currentTime, thresholds) {
        const targetKcal = dayTarget.kcal || profile.optimum || 2000;
        const targetProtein = dayTarget.protein || profile.norm?.prot || 120;
        const eatenKcal = dayEaten.kcal || 0;
        const eatenProtein = dayEaten.protein || 0;

        const remainingKcal = Math.max(0, targetKcal - eatenKcal);
        const remainingProtein = Math.max(0, targetProtein - eatenProtein);
        const proteinProgress = eatenProtein / targetProtein;

        // Adaptive thresholds (fallback to defaults)
        const lateEatingHour = thresholds?.lateEatingHour || 21;
        const currentHour = Math.floor(currentTime);

        // Training context
        const training = context.training;
        let hoursToTraining = null;
        if (training && training.time) {
            const trainingTime = parseTime(training.time);
            hoursToTraining = trainingTime - currentTime;
        }

        // Mood/stress context (try context first, then lastMeal)
        const lastMeal = context.lastMeal || {};
        const mood = context.mood || lastMeal.mood || 3; // 1-5 scale
        const stress = context.stress || lastMeal.stress || 3; // 1-5 scale

        console.info('[MealRec] 🎯 Context analysis:', {
            remainingKcal,
            proteinProgress: Math.round(proteinProgress * 100) + '%',
            currentHour,
            lateEatingHour,
            hoursToTraining,
            mood,
            stress
        });

        // Scenario decision tree (priority order)

        // 1. GOAL_REACHED (highest priority)
        if (remainingKcal < 50) {
            return {
                scenario: SCENARIOS.GOAL_REACHED,
                reason: 'Дневная цель достигнута',
                icon: SCENARIO_ICONS[SCENARIOS.GOAL_REACHED],
                metadata: { remainingKcal }
            };
        }

        // 2. LIGHT_SNACK
        if (remainingKcal >= 50 && remainingKcal < 150) {
            return {
                scenario: SCENARIOS.LIGHT_SNACK,
                reason: 'Мало калорий до цели',
                icon: SCENARIO_ICONS[SCENARIOS.LIGHT_SNACK],
                metadata: { remainingKcal }
            };
        }

        // 3. PRE_WORKOUT (within 1-2h)
        if (hoursToTraining !== null && hoursToTraining > 0 && hoursToTraining <= 2) {
            return {
                scenario: SCENARIOS.PRE_WORKOUT,
                reason: `Тренировка через ${Math.round(hoursToTraining * 60)} мин`,
                icon: SCENARIO_ICONS[SCENARIOS.PRE_WORKOUT],
                metadata: { hoursToTraining, trainingTime: training.time }
            };
        }

        // 4. POST_WORKOUT (within 0-2h after)
        if (hoursToTraining !== null && hoursToTraining < 0 && hoursToTraining > -2) {
            return {
                scenario: SCENARIOS.POST_WORKOUT,
                reason: 'После тренировки — восстановление',
                icon: SCENARIO_ICONS[SCENARIOS.POST_WORKOUT],
                metadata: { hoursSinceTraining: Math.abs(hoursToTraining) }
            };
        }

        // 5. LATE_EVENING
        if (currentHour >= lateEatingHour && remainingKcal > 150) {
            return {
                scenario: SCENARIOS.LATE_EVENING,
                reason: 'Поздний вечер — лёгкий приём',
                icon: SCENARIO_ICONS[SCENARIOS.LATE_EVENING],
                metadata: { currentHour, lateEatingHour, remainingKcal }
            };
        }

        // 6. STRESS_EATING (higher priority than PROTEIN_DEFICIT)
        if (stress >= 4 || mood <= 2) {
            return {
                scenario: SCENARIOS.STRESS_EATING,
                reason: stress >= 4 ? 'Высокий стресс' : 'Низкое настроение',
                icon: SCENARIO_ICONS[SCENARIOS.STRESS_EATING],
                metadata: { stress, mood }
            };
        }

        // 7. PROTEIN_DEFICIT (< 50% of daily target)
        if (proteinProgress < 0.5 && remainingProtein > 10) {
            return {
                scenario: SCENARIOS.PROTEIN_DEFICIT,
                reason: `Белок ${Math.round(proteinProgress * 100)}% от цели`,
                icon: SCENARIO_ICONS[SCENARIOS.PROTEIN_DEFICIT],
                metadata: { proteinProgress, remainingProtein }
            };
        }

        // 8. BALANCED (default)
        return {
            scenario: SCENARIOS.BALANCED,
            reason: 'Стандартный приём пищи',
            icon: SCENARIO_ICONS[SCENARIOS.BALANCED],
            metadata: { remainingKcal }
        };
    }

    /**
     * Recommend next meal timing and macros
     * @param {object} context - Current day context
     * @param {object} profile - User profile
     * @param {object} pIndex - Product index
     * @param {object[]} days - Historical days (for ML in future)
     * @returns {object} - Recommendation result
     */
    function recommendNextMeal(context, profile, pIndex, days = []) {
        console.log('[MealRec] 🍽️ recommendNextMeal v2.4 called:', {
            contextTime: context?.currentTime,
            lastMealTime: context?.lastMeal?.time,
            hasTraining: !!context?.training,
            profileId: profile?.id,
            daysCount: days?.length || 0
        });

        if (!context || !profile) {
            console.warn('[MealRec] ❌ Missing context or profile');
            return { available: false, error: 'Missing context or profile' };
        }

        // Extract context
        const currentTime = parseTime(context.currentTime || getCurrentTime());
        const lastMeal = context.lastMeal || {};
        const dayTarget = context.dayTarget || profile.norm || {};
        const dayEaten = context.dayEaten || {};
        const training = context.training;
        const sleepTarget = parseTime(context.sleepTarget || '23:00');

        // Load adaptive thresholds (v2.4 feature)
        let thresholds = null;
        if (HEYS.InsightsPI?.thresholds?.getAdaptiveThresholds && days.length > 0) {
            try {
                thresholds = HEYS.InsightsPI.thresholds.getAdaptiveThresholds(days.length, profile, pIndex);
                console.info('[MealRec] 📊 Adaptive thresholds loaded:', {
                    lateEatingHour: thresholds.lateEatingHour,
                    mealGapHours: thresholds.idealMealGapMin / 60,
                    source: thresholds.source
                });
            } catch (err) {
                console.warn('[MealRec] ⚠️ Failed to load thresholds, using defaults:', err.message);
            }
        }

        // Analyze context → determine scenario (v2.4 feature)
        const contextAnalysis = analyzeCurrentContext(context, dayTarget, dayEaten, profile, currentTime, thresholds);
        console.info('[MealRec] 🎯 Scenario detected:', {
            scenario: contextAnalysis.scenario,
            reason: contextAnalysis.reason,
            metadata: contextAnalysis.metadata
        });

        // Calculate timing recommendation
        const timingRec = calculateOptimalTiming(currentTime, lastMeal, training, sleepTarget, thresholds);

        // Calculate macros recommendation (scenario-aware v2.4)
        const macrosRec = calculateOptimalMacros(contextAnalysis, dayTarget, dayEaten, training, profile, timingRec);

        // Generate meal suggestions (Smart Product Picker v2.5)
        const suggestions = generateSmartMealSuggestions(contextAnalysis, macrosRec, context, profile, pIndex);

        // Generate reasoning (scenario-aware v2.4)
        const reasoning = generateReasoning(contextAnalysis, timingRec, macrosRec, dayTarget, dayEaten, training);

        const result = {
            available: true,
            scenario: contextAnalysis.scenario,
            scenarioIcon: contextAnalysis.icon,
            scenarioReason: contextAnalysis.reason,
            timing: timingRec,
            macros: macrosRec,
            suggestions,
            reasoning,
            confidence: 0.75, // Will be dynamic in R2.6
            method: 'context_engine', // v2.4 identifier
            version: '2.4'
        };

        console.info('[MealRec] ✅ Recommendation generated:', {
            scenario: result.scenario,
            timingIdeal: result.timing?.ideal,
            macrosKcal: result.macros?.kcal,
            suggestionsCount: result.suggestions.length,
            confidence: result.confidence
        });

        return result;
    }

    /**
     * Calculate optimal meal timing (threshold-aware v2.4)
     * @private
     */
    function calculateOptimalTiming(currentTime, lastMeal, training, sleepTarget, thresholds) {
        const lastMealTime = parseTime(lastMeal.time || '00:00');
        const hoursSinceLastMeal = lastMealTime > 0 ? currentTime - lastMealTime : 0;

        // Adaptive meal gap (v2.4)
        const idealGapMin = thresholds?.idealMealGapMin || 240; // fallback 4h
        const idealGapHours = idealGapMin / 60;
        const minGap = idealGapHours * 0.75; // 75% of ideal
        const maxGap = idealGapHours * 1.25; // 125% of ideal

        let idealStart, idealEnd, reason;

        // Case 1: Training soon (within 2h)
        if (training && training.time) {
            const trainingTime = parseTime(training.time);
            const hoursToTraining = trainingTime - currentTime;

            if (hoursToTraining > 0 && hoursToTraining <= 2) {
                // Pre-workout meal
                idealStart = Math.max(currentTime, trainingTime - 1.5);
                idealEnd = trainingTime - 1;
                reason = `Pre-workout за 1-1.5ч до тренировки`;
            } else if (hoursToTraining < 0 && hoursToTraining > -2) {
                // Post-workout meal
                idealStart = currentTime;
                idealEnd = currentTime + 0.5;
                reason = `Post-workout сразу после тренировки`;
            } else {
                // Regular meal timing
                idealStart = lastMealTime + idealGapHours;
                idealEnd = lastMealTime + maxGap;
                reason = `Оптимальный gap ${Math.round(idealGapMin)}мин после последнего приёма`;
            }
        } else {
            // No training nearby — standard meal timing
            idealStart = lastMealTime + idealGapHours;
            idealEnd = lastMealTime + maxGap;
            reason = `Оптимальный gap ${Math.round(idealGapMin)}мин`;
        }

        // Adjust for sleep target (no eating 3h before sleep)
        const mealDeadline = sleepTarget - 3;
        if (idealStart > mealDeadline) {
            if (currentTime >= mealDeadline) {
                // Already past ideal meal window — suggest eating now with short window
                idealStart = currentTime;
                idealEnd = Math.min(currentTime + 0.5, sleepTarget);
                reason = `⚠️ Поздний приём — постарайся до ${formatTime(sleepTarget)}`;
            } else {
                idealStart = Math.max(currentTime, mealDeadline - 1);
                idealEnd = mealDeadline;
                reason = `Последний приём — за 3ч до сна`;
            }
        }

        return {
            ideal: `${formatTime(idealStart)}-${formatTime(idealEnd)}`,
            idealStart,
            idealEnd,
            currentTime,
            hoursSinceLastMeal: Math.round(hoursSinceLastMeal * 10) / 10,
            reason
        };
    }

    /**
     * Calculate optimal macros (scenario-aware v2.4)
     * @private
     */
    function calculateOptimalMacros(contextAnalysis, dayTarget, dayEaten, training, profile, timingRec) {
        const scenario = contextAnalysis.scenario;
        const targetKcal = dayTarget.kcal || profile.optimum || 2000;
        const targetProtein = dayTarget.protein || profile.norm?.prot || 120;
        const targetCarbs = dayTarget.carbs || profile.norm?.carb || 200;

        const eatenKcal = dayEaten.kcal || 0;
        const eatenProtein = dayEaten.protein || 0;
        const eatenCarbs = dayEaten.carbs || 0;

        const remainingKcal = Math.max(0, targetKcal - eatenKcal);
        const remainingProtein = Math.max(0, targetProtein - eatenProtein);
        const remainingCarbs = Math.max(0, targetCarbs - eatenCarbs);

        console.info('[MealRec] 📊 Remaining today:', {
            kcal: remainingKcal,
            protein: remainingProtein,
            carbs: remainingCarbs,
            scenario
        });

        // Estimate meals remaining today
        const hoursUntilSleep = timingRec.idealStart ? (parseTime('23:00') - timingRec.idealStart) : 8;
        const mealsRemaining = Math.max(1, Math.floor(hoursUntilSleep / 4));

        let mealKcal, mealProtein, mealCarbs, mealFat;

        // Scenario-specific macro strategies (v2.4)
        switch (scenario) {
            case SCENARIOS.GOAL_REACHED:
                // No meal recommended
                mealKcal = 0;
                mealProtein = 0;
                mealCarbs = 0;
                mealFat = 0;
                break;

            case SCENARIOS.LIGHT_SNACK:
                // Small snack: 50-150 kcal
                mealKcal = Math.min(remainingKcal, 150);
                mealProtein = Math.round(mealKcal * 0.3 / 3); // 30% from protein
                mealCarbs = Math.round(mealKcal * 0.4 / 4); // 40% from carbs
                mealFat = Math.round(mealKcal * 0.3 / 9); // 30% from fat
                break;

            case SCENARIOS.LATE_EVENING:
                // Light evening meal: max 200 kcal, high protein (slow digestion)
                mealKcal = Math.min(remainingKcal, 200);
                mealProtein = Math.round(mealKcal * 0.6 / 3); // 60% from protein (casein)
                mealCarbs = Math.round(mealKcal * 0.2 / 4); // 20% from carbs
                mealFat = Math.round(mealKcal * 0.2 / 9); // 20% from fat
                break;

            case SCENARIOS.PRE_WORKOUT:
                // Pre-workout: max 300 kcal, high carbs for energy
                mealKcal = Math.min(remainingKcal, 300);
                mealProtein = Math.round(mealKcal * 0.25 / 3); // 25% from protein
                mealCarbs = Math.round(mealKcal * 0.60 / 4); // 60% from carbs (fast)
                mealFat = Math.round(mealKcal * 0.15 / 9); // 15% from fat
                break;

            case SCENARIOS.POST_WORKOUT:
                // Post-workout: max 400 kcal, high protein + carbs
                mealKcal = Math.min(remainingKcal, 400);
                mealProtein = Math.round(mealKcal * 0.40 / 3); // 40% from protein (recovery)
                mealCarbs = Math.round(mealKcal * 0.45 / 4); // 45% from carbs (glycogen)
                mealFat = Math.round(mealKcal * 0.15 / 9); // 15% from fat
                break;

            case SCENARIOS.PROTEIN_DEFICIT:
                // High protein meal: max 300 kcal
                mealKcal = Math.min(remainingKcal, 300);
                mealProtein = Math.round(mealKcal * 0.50 / 3); // 50% from protein
                mealCarbs = Math.round(mealKcal * 0.30 / 4); // 30% from carbs
                mealFat = Math.round(mealKcal * 0.20 / 9); // 20% from fat
                break;

            case SCENARIOS.STRESS_EATING:
                // Comfort food (healthy): max 250 kcal, balanced with omega-3
                mealKcal = Math.min(remainingKcal, 250);
                mealProtein = Math.round(mealKcal * 0.30 / 3); // 30% from protein
                mealCarbs = Math.round(mealKcal * 0.40 / 4); // 40% from carbs (serotonin)
                mealFat = Math.round(mealKcal * 0.30 / 9); // 30% from fat (omega-3)
                break;

            case SCENARIOS.BALANCED:
            default:
                // Standard balanced meal
                mealKcal = Math.round(remainingKcal / mealsRemaining);
                mealProtein = Math.round(remainingProtein / mealsRemaining);
                mealCarbs = Math.round(remainingCarbs / mealsRemaining);
                mealFat = Math.max(0, Math.round((mealKcal - mealProtein * 3 - mealCarbs * 4) / 9));
                break;
        }

        // Apply phenotype multipliers (if available, but stay within budget)
        if (profile.phenotype && scenario === SCENARIOS.BALANCED) {
            const phenotype = profile.phenotype;
            if (phenotype.satiety === 'low_satiety') {
                mealProtein = Math.round(mealProtein * 1.15);
            }
            if (phenotype.metabolic === 'insulin_resistant') {
                mealCarbs = Math.round(mealCarbs * 0.85);
                mealProtein = Math.round(mealProtein * 1.1);
            }
        }

        // FINAL SAFETY: Never exceed remaining kcal
        const estimatedKcal = mealProtein * 3 + mealCarbs * 4 + mealFat * 9;
        if (estimatedKcal > remainingKcal) {
            const scale = remainingKcal / estimatedKcal;
            mealProtein = Math.round(mealProtein * scale);
            mealCarbs = Math.round(mealCarbs * scale);
            mealFat = Math.round(mealFat * scale);
            mealKcal = remainingKcal;
            console.warn('[MealRec] ⚠️ Scaled down to fit remaining kcal:', {
                scale: Math.round(scale * 100) + '%',
                finalKcal: mealKcal
            });
        }

        console.info('[MealRec] ✅ Final meal macros:', {
            scenario,
            kcal: mealKcal,
            protein: mealProtein,
            carbs: mealCarbs,
            fat: mealFat
        });

        return {
            protein: mealProtein,
            carbs: mealCarbs,
            fat: mealFat,
            kcal: mealKcal,
            proteinRange: `${Math.max(0, mealProtein - 5)}-${mealProtein + 5}`,
            carbsRange: `${Math.max(0, mealCarbs - 10)}-${mealCarbs + 10}`,
            kcalRange: `${Math.max(0, mealKcal - 50)}-${mealKcal + 50}`,
            remainingMeals: mealsRemaining,
            remainingKcal: remainingKcal
        };
    }

    /**
     * Generate smart meal suggestions using Product Picker v2.5
     * Falls back to rule-based suggestions if Product Picker unavailable
     * @private
     */
    function generateSmartMealSuggestions(contextAnalysis, macrosRec, context, profile, pIndex) {
        const scenario = contextAnalysis.scenario;

        // Special case: GOAL_REACHED - no computation needed
        if (scenario === SCENARIOS.GOAL_REACHED) {
            return [{
                product: 'Вода',
                grams: 250,
                reason: 'Гидратация — цель дня достигнута'
            }];
        }

        // Check if Product Picker v2.5 is available
        if (!global.HEYS?.InsightsPI?.productPicker?.generateProductSuggestions) {
            console.warn('[MealRec] ⚠️ Product Picker unavailable, falling back to rule-based suggestions');
            return generateMealSuggestions(contextAnalysis, macrosRec, profile, pIndex);
        }

        try {
            // Determine ideal GI based on scenario
            let idealGI = 50; // Medium by default
            if (scenario === SCENARIOS.PRE_WORKOUT) {
                idealGI = 70; // High GI for quick energy
            } else if (scenario === SCENARIOS.LATE_EVENING || scenario === SCENARIOS.POST_WORKOUT) {
                idealGI = 30; // Low GI for sustained release
            }

            const resolvedLsGet =
                (typeof context?.lsGet === 'function' && context.lsGet) ||
                (typeof global.U?.lsGet === 'function' && global.U.lsGet.bind(global.U)) ||
                (typeof global.HEYS?.utils?.lsGet === 'function' && global.HEYS.utils.lsGet.bind(global.HEYS.utils));

            // Get shared products (from context or global)
            const sharedProducts = context.sharedProducts || global.HEYS?.products?.getAll?.() || [];

            console.info('[MealRec] 🔍 Product Picker deps:', {
                hasLsGet: typeof resolvedLsGet === 'function',
                sharedProductsCount: sharedProducts.length,
            });

            // Call Product Picker
            const suggestions = global.HEYS.InsightsPI.productPicker.generateProductSuggestions({
                scenario,
                remainingKcal: macrosRec.remainingKcal,
                targetProteinG: macrosRec.protein,
                targetCarbsG: macrosRec.carbs,
                targetFatG: macrosRec.fat,
                idealGI,
                lsGet: resolvedLsGet,
                sharedProducts,
                limit: 3,
            });

            // If insufficient suggestions, fallback
            if (!suggestions || suggestions.length === 0) {
                console.warn('[MealRec] ⚠️ Product Picker returned no results, falling back');
                return generateMealSuggestions(contextAnalysis, macrosRec, profile, pIndex);
            }

            console.info('[MealRec] ✅ Smart suggestions via Product Picker v2.5:', {
                scenario,
                count: suggestions.length,
                sources: suggestions.map(s => s.source),
            });

            return suggestions;

        } catch (error) {
            console.error('[MealRec] ❌ Product Picker error:', error);
            return generateMealSuggestions(contextAnalysis, macrosRec, profile, pIndex);
        }
    }

    /**
     * Generate meal suggestions (scenario-aware v2.4 — FALLBACK)
     * Used when Product Picker v2.5 is unavailable or returns insufficient results
     * @private
     */
    function generateMealSuggestions(contextAnalysis, macrosRec, profile, pIndex) {
        const scenario = contextAnalysis.scenario;
        const suggestions = [];

        const proteinTarget = macrosRec.protein;
        const carbsTarget = macrosRec.carbs;
        const kcalTarget = macrosRec.kcal;

        console.info('[MealRec] 🥘 Generating suggestions for:', {
            scenario,
            protein: proteinTarget,
            carbs: carbsTarget,
            kcal: kcalTarget
        });

        // Scenario-specific suggestions (v2.4)
        switch (scenario) {
            case SCENARIOS.GOAL_REACHED:
                // No food, just hydration
                suggestions.push({
                    product: 'Вода',
                    grams: 250,
                    reason: 'Гидратация — цель дня достигнута'
                });
                return suggestions;

            case SCENARIOS.LIGHT_SNACK:
                // Light snacks: kefir, yogurt, fruit
                if (proteinTarget > 5) {
                    const gramsNeeded = Math.round((proteinTarget / 3.2) * 100); // kefir 3.2g per 100ml
                    suggestions.push({
                        product: 'Кефир',
                        grams: Math.min(gramsNeeded, 200),
                        reason: 'Легкоусвояемый белок, пробиотики'
                    });
                }
                if (carbsTarget > 10) {
                    suggestions.push({
                        product: 'Яблоко',
                        grams: 100,
                        reason: 'Клетчатка, низкая калорийность'
                    });
                }
                break;

            case SCENARIOS.LATE_EVENING:
                // Light evening protein: cottage cheese case in, kefir
                if (proteinTarget > 10) {
                    const gramsNeeded = Math.round((proteinTarget / 18) * 100); // cottage cheese 18g/100g
                    suggestions.push({
                        product: 'Творог',
                        grams: Math.min(gramsNeeded, 150),
                        reason: 'Казеин — медленный белок на ночь'
                    });
                }
                if (carbsTarget > 5) {
                    suggestions.push({
                        product: 'Огурцы',
                        grams: 100,
                        reason: 'Минимум калорий, гидратация'
                    });
                }
                break;

            case SCENARIOS.PRE_WORKOUT:
                // Fast carbs + some protein
                if (carbsTarget >= 30) {
                    suggestions.push({
                        product: 'Банан',
                        grams: Math.round((carbsTarget / 23) * 100),
                        reason: 'Быстрые углеводы для энергии'
                    });
                }
                if (proteinTarget >= 15) {
                    const gramsNeeded = Math.round((proteinTarget / 13) * 100);
                    suggestions.push({
                        product: 'Яйца',
                        grams: Math.min(gramsNeeded, 100),
                        reason: 'Легкоусвояемый белок'
                    });
                }
                break;

            case SCENARIOS.POST_WORKOUT:
                // High protein + carbs for recovery
                if (proteinTarget >= 25) {
                    const gramsNeeded = Math.round((proteinTarget / 23) * 100);
                    suggestions.push({
                        product: 'Куриная грудка',
                        grams: gramsNeeded,
                        reason: 'Высокий белок для восстановления'
                    });
                }
                if (carbsTarget >= 40) {
                    const gramsNeeded = Math.round((carbsTarget / 23) * 100);
                    suggestions.push({
                        product: 'Бурый рис (готовый)',
                        grams: gramsNeeded,
                        reason: 'Восполнение гликогена'
                    });
                }
                break;

            case SCENARIOS.PROTEIN_DEFICIT:
                // High-protein foods
                if (proteinTarget >= 25) {
                    const gramsNeeded = Math.round((proteinTarget / 23) * 100);
                    suggestions.push({
                        product: 'Куриная грудка',
                        grams: gramsNeeded,
                        reason: 'Высокое содержание белка'
                    });
                } else if (proteinTarget >= 15) {
                    const gramsNeeded = Math.round((proteinTarget / 18) * 100);
                    suggestions.push({
                        product: 'Творог',
                        grams: gramsNeeded,
                        reason: 'Полноценный белок'
                    });
                }
                break;

            case SCENARIOS.STRESS_EATING:
                // Comfort foods with nutrients: dark chocolate, nuts, berries
                suggestions.push({
                    product: 'Тёмный шоколад (70%)',
                    grams: 20,
                    reason: 'Магний, антиоксиданты, серотонин'
                });
                if (proteinTarget > 10) {
                    suggestions.push({
                        product: 'Грецкие орехи',
                        grams: 30,
                        reason: 'Omega-3, магний, белок'
                    });
                }
                break;

            case SCENARIOS.BALANCED:
            default:
                // Standard suggestions
                if (proteinTarget >= 25) {
                    const gramsNeeded = Math.round((proteinTarget / 23) * 100);
                    suggestions.push({
                        product: 'Куриная грудка',
                        grams: gramsNeeded,
                        reason: 'Высокое содержание белка'
                    });
                } else if (proteinTarget >= 15) {
                    const gramsNeeded = Math.round((proteinTarget / 13) * 100);
                    suggestions.push({
                        product: 'Яйца',
                        grams: gramsNeeded,
                        reason: 'Полноценный белок'
                    });
                }

                if (carbsTarget >= 40) {
                    const gramsNeeded = Math.round((carbsTarget / 23) * 100);
                    suggestions.push({
                        product: 'Бурый рис (готовый)',
                        grams: gramsNeeded,
                        reason: 'Медленные углеводы'
                    });
                } else if (carbsTarget >= 20) {
                    const gramsNeeded = Math.round((carbsTarget / 20) * 100);
                    suggestions.push({
                        product: 'Батат',
                        grams: gramsNeeded,
                        reason: 'Сложные углеводы, витамин A'
                    });
                }
                break;
        }

        return suggestions;
    }

    /**
     * Generate reasoning (scenario-aware v2.4)
     * @private
     */
    function generateReasoning(contextAnalysis, timingRec, macrosRec, dayTarget, dayEaten, training) {
        const scenario = contextAnalysis.scenario;
        const reasoning = [];

        // Scenario-specific reasoning (v2.4)
        switch (scenario) {
            case SCENARIOS.GOAL_REACHED:
                reasoning.push('🎯 Дневная цель достигнута — попей воды 💧');
                reasoning.push('✅ Отличный контроль калорий сегодня!');
                break;

            case SCENARIOS.LIGHT_SNACK:
                reasoning.push(`☕ Осталось всего ${Math.round(macrosRec.remainingKcal)} ккал — лёгкий перекус`);
                reasoning.push('✨ Выбирай лёгкие продукты: кефир, фрукты, йогурт');
                break;

            case SCENARIOS.LATE_EVENING:
                reasoning.push(`🌙 Поздний вечер (${Math.floor(timingRec.currentTime)}:00)`);
                reasoning.push('🥛 Лёгкий белок (творог, кефир) — лучше для сна');
                reasoning.push('⚠️ Избегай углеводов и больших порций');
                break;

            case SCENARIOS.PRE_WORKOUT:
                reasoning.push(`⚡ Тренировка через ${Math.round(contextAnalysis.metadata.hoursToTraining * 60)} мин`);
                reasoning.push('🍌 Быстрые углеводы для энергии');
                reasoning.push('🥚 Немного белка для поддержки мышц');
                break;

            case SCENARIOS.POST_WORKOUT:
                reasoning.push('💪 Восстановление после тренировки');
                reasoning.push('🥩 Высокий белок для восстановления мышц');
                reasoning.push('🍚 Углеводы для восполнения гликогена');
                break;

            case SCENARIOS.PROTEIN_DEFICIT:
                const proteinProgress = ((dayEaten.protein || 0) / (dayTarget.protein || 120)) * 100;
                reasoning.push(`🥩 Белок: ${Math.round(proteinProgress)}% от цели`);
                reasoning.push('🐟 Удели внимание белковым продуктам');
                reasoning.push(`🎯 Нужно добрать ${macrosRec.protein}г белка`);
                break;

            case SCENARIOS.STRESS_EATING:
                reasoning.push('‍🧘 Высокий уровень стресса');
                reasoning.push('🍫 Здоровые comfort foods: тёмный шоколад, орехи, магний');
                reasoning.push('☕ Или теплый чай с мёдом для расслабления');
                break;

            case SCENARIOS.BALANCED:
            default:
                // Standard reasoning
                if (timingRec.reason) {
                    reasoning.push(`⏰ ${timingRec.reason}`);
                }

                const remainingKcal = macrosRec.remainingKcal || 0;
                if (remainingKcal < 200) {
                    reasoning.push(`⚠️ Осталось ${Math.round(remainingKcal)} ккал`);
                } else {
                    reasoning.push(`ℹ️ Осталось ${Math.round(remainingKcal)} ккал (${macrosRec.remainingMeals} приём(а) до сна)`);
                }

                const proteinPercent = ((dayEaten.protein || 0) / (dayTarget.protein || 120)) * 100;
                if (proteinPercent < 80) {
                    reasoning.push(`🥩 Белок: ${Math.round(proteinPercent)}% от цели`);
                }

                if (training && training.time) {
                    reasoning.push(`🏋️ Тренировка в ${training.time}`);
                }
                break;
        }

        return reasoning;
    }

    /**
     * Helper: parse time string to hours (decimal)
     * @private
     */
    function parseTime(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours + (minutes || 0) / 60;
    }

    /**
     * Helper: format decimal hours to HH:MM string
     * @private
     */
    function formatTime(decimalHours) {
        const hours = Math.floor(decimalHours);
        const minutes = Math.round((decimalHours - hours) * 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /**
     * Helper: get current time
     * @private
     */
    function getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    // Export API
    HEYS.InsightsPI.mealRecommender = {
        recommend: recommendNextMeal
    };

    console.info('[HEYS.InsightsPI.mealRecommender] ✅ Smart Meal Recommender v2.5 initialized (8 scenarios + history-based products)');

})(typeof window !== 'undefined' ? window : global);
