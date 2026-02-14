/**
 * HEYS Predictive Insights — Next Meal Recommender v1.0
 * 
 * AI-powered meal guidance based on current context:
 * - Time since last meal
 * - Day progress (eaten vs targets)
 * - Upcoming events (training, sleep)
 * - Personal preferences & phenotype
 * 
 * Dependencies: pi_patterns.js, pi_phenotype.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    /**
     * Recommend next meal timing and macros
     * @param {object} context - Current day context
     * @param {object} profile - User profile
     * @param {object} pIndex - Product index
     * @param {object[]} days - Historical days (for ML in future)
     * @returns {object} - Recommendation result
     */
    function recommendNextMeal(context, profile, pIndex, days = []) {
        console.log('[MealRec] 🍽️ recommendNextMeal called:', {
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

        // Calculate timing recommendation
        const timingRec = calculateOptimalTiming(currentTime, lastMeal, training, sleepTarget);

        // Calculate macros recommendation
        const macrosRec = calculateOptimalMacros(dayTarget, dayEaten, training, profile, timingRec);

        // Generate meal suggestions (rule-based, can be replaced with ML)
        const suggestions = generateMealSuggestions(macrosRec, profile, pIndex);

        // Generate reasoning
        const reasoning = generateReasoning(timingRec, macrosRec, dayTarget, dayEaten, training);

        const result = {
            available: true,
            timing: timingRec,
            macros: macrosRec,
            suggestions,
            reasoning,
            confidence: 0.75, // Rule-based confidence (ML will be higher)
            method: 'rule_based' // Will be 'ml' when ML is implemented
        };

        console.log('[MealRec] ✅ Recommendation generated:', {
            timingIdeal: result.timing.ideal,
            macrosProtein: result.macros.protein,
            macrosKcal: result.macros.kcal,
            suggestionsCount: result.suggestions.length,
            method: result.method
        });

        return result;
    }

    /**
     * Calculate optimal meal timing
     * @private
     */
    function calculateOptimalTiming(currentTime, lastMeal, training, sleepTarget) {
        const lastMealTime = parseTime(lastMeal.time || '00:00');
        const hoursSinceLastMeal = lastMealTime > 0 ? currentTime - lastMealTime : 0;

        // Default meal gap: 3-5 hours
        const minGap = 3;
        const maxGap = 5;
        const idealGap = 4;

        let idealStart, idealEnd, reason;

        // Case 1: Training soon (within 2h)
        if (training && training.time) {
            const trainingTime = parseTime(training.time);
            const hoursToTraining = trainingTime - currentTime;

            if (hoursToTraining > 0 && hoursToTraining <= 2) {
                // Pre-workout meal
                idealStart = Math.max(currentTime, trainingTime - 1.5);
                idealEnd = trainingTime - 1;
                reason = `Pre-workout meal за 1-1.5ч до тренировки (${training.time})`;
            } else if (hoursToTraining < 0 && hoursToTraining > -2) {
                // Post-workout meal
                idealStart = currentTime;
                idealEnd = currentTime + 0.5;
                reason = `Post-workout meal сразу после тренировки (${training.time})`;
            } else {
                // Regular meal timing
                idealStart = lastMealTime + idealGap;
                idealEnd = lastMealTime + maxGap;
                reason = `Оптимальный gap ${idealGap}ч после последнего приёма (${lastMeal.time})`;
            }
        } else {
            // No training nearby — standard meal timing
            idealStart = lastMealTime + idealGap;
            idealEnd = lastMealTime + maxGap;
            reason = `Оптимальный gap ${idealGap}ч после последнего приёма (${lastMeal.time || 'неизвестно'})`;
        }

        // Adjust for sleep target (no eating 3h before sleep)
        const mealDeadline = sleepTarget - 3;
        if (idealStart > mealDeadline) {
            idealStart = Math.max(currentTime, mealDeadline - 1);
            idealEnd = mealDeadline;
            reason = `Последний приём — не позже чем за 3ч до сна (${formatTime(sleepTarget)})`;
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
     * Calculate optimal macros for next meal
     * @private
     */
    function calculateOptimalMacros(dayTarget, dayEaten, training, profile, timingRec) {
        const targetKcal = dayTarget.kcal || profile.optimum || 2000;
        const targetProtein = dayTarget.protein || profile.norm?.prot || 120;
        const targetCarbs = dayTarget.carbs || profile.norm?.carb || 200;

        const eatenKcal = dayEaten.kcal || 0;
        const eatenProtein = dayEaten.protein || 0;
        const eatenCarbs = dayEaten.carbs || 0;

        const remainingKcal = Math.max(0, targetKcal - eatenKcal);
        const remainingProtein = Math.max(0, targetProtein - eatenProtein);
        const remainingCarbs = Math.max(0, targetCarbs - eatenCarbs);

        // Estimate meals remaining today
        const hoursUntilSleep = timingRec.idealStart ? (parseTime('23:00') - timingRec.idealStart) : 8;
        const mealsRemaining = Math.max(1, Math.floor(hoursUntilSleep / 4));

        // Calculate per-meal targets
        let mealKcal = Math.round(remainingKcal / mealsRemaining);
        let mealProtein = Math.round(remainingProtein / mealsRemaining);
        let mealCarbs = Math.round(remainingCarbs / mealsRemaining);

        // Adjust for training context
        if (training && training.time) {
            const trainingTime = parseTime(training.time);
            const hoursToTraining = trainingTime - (timingRec.currentTime || 0);

            if (hoursToTraining > 0 && hoursToTraining <= 2) {
                // Pre-workout: increase protein + moderate carbs
                mealProtein = Math.max(mealProtein, 30);
                mealCarbs = Math.max(mealCarbs, 40);
                mealKcal = mealProtein * 3 + mealCarbs * 4; // TEF-adjusted
            } else if (hoursToTraining < 0 && hoursToTraining > -2) {
                // Post-workout: high protein + high carbs
                mealProtein = Math.max(mealProtein, 40);
                mealCarbs = Math.max(mealCarbs, 60);
                mealKcal = mealProtein * 3 + mealCarbs * 4;
            }
        }

        // Apply phenotype multipliers (if available)
        if (profile.phenotype) {
            const phenotype = profile.phenotype;
            if (phenotype.satiety === 'low_satiety') {
                mealProtein = Math.round(mealProtein * 1.15); // More protein for satiety
            }
            if (phenotype.metabolic === 'insulin_resistant') {
                mealCarbs = Math.round(mealCarbs * 0.85); // Reduce carbs
                mealProtein = Math.round(mealProtein * 1.1); // Compensate with protein
            }
        }

        return {
            protein: mealProtein,
            carbs: mealCarbs,
            kcal: mealKcal,
            proteinRange: `${mealProtein - 5}-${mealProtein + 5}`,
            carbsRange: `${mealCarbs - 10}-${mealCarbs + 10}`,
            kcalRange: `${mealKcal - 50}-${mealKcal + 50}`,
            remainingMeals: mealsRemaining
        };
    }

    /**
     * Generate meal suggestions (rule-based, placeholder for ML)
     * @private
     */
    function generateMealSuggestions(macrosRec, profile, pIndex) {
        const suggestions = [];

        // Simple rule-based suggestions (can be replaced with ML collaborative filtering)
        const proteinTarget = macrosRec.protein;
        const carbsTarget = macrosRec.carbs;

        // Protein source
        if (proteinTarget >= 30) {
            suggestions.push({
                product: 'Куриная грудка',
                grams: Math.round((proteinTarget / 0.23) * 10) / 10, // 23% protein
                reason: 'Высокое содержание белка, низкая калорийность'
            });
        } else {
            suggestions.push({
                product: 'Яйца',
                grams: Math.round((proteinTarget / 0.13) * 10) / 10, // 13% protein
                reason: 'Полноценный белок с витаминами'
            });
        }

        // Carb source
        if (carbsTarget >= 50) {
            suggestions.push({
                product: 'Бурый рис',
                grams: Math.round((carbsTarget / 0.23) * 10) / 10, // 23% carbs
                reason: 'Медленные углеводы, клетчатка'
            });
        } else {
            suggestions.push({
                product: 'Овощной салат',
                grams: 150,
                reason: 'Клетчатка и витамины, мало калорий'
            });
        }

        return suggestions;
    }

    /**
     * Generate reasoning for recommendation
     * @private
     */
    function generateReasoning(timingRec, macrosRec, dayTarget, dayEaten, training) {
        const reasoning = [];

        // Timing reasoning
        if (timingRec.reason) {
            reasoning.push(`⏰ ${timingRec.reason}`);
        }

        // Protein reasoning
        const proteinProgress = ((dayEaten.protein || 0) / (dayTarget.protein || 120)) * 100;
        if (proteinProgress < 50 && timingRec.hoursSinceLastMeal > 4) {
            reasoning.push(`✅ Белок: ${macrosRec.protein}г для достижения дневной нормы`);
        }

        // Training reasoning
        if (training && training.time) {
            reasoning.push(`🏋️ Тренировка в ${training.time} (${training.type || 'unknown'})`);
        }

        // Meals remaining
        if (macrosRec.remainingMeals <= 1) {
            reasoning.push(`⚠️ После этого останется ${macrosRec.remainingMeals} приём до сна`);
        } else {
            reasoning.push(`ℹ️ Запланировано ещё ${macrosRec.remainingMeals} приём(а) до сна`);
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

    console.info('[HEYS.InsightsPI.mealRecommender] ✅ Next Meal Recommender v1.0 initialized (rule-based)');

})(typeof window !== 'undefined' ? window : global);
