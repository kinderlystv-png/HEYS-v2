/**
 * HEYS Predictive Insights — Next Meal Recommender v3.7.0
 * 
 * Context-aware meal guidance with 9 scenarios + 12 Pattern Integration (Phase A/B/C).
 * 
 * Scenarios:
 * - GOAL_REACHED: day target met (<50 kcal remaining)
 * - LIGHT_SNACK: low budget (50-150 kcal) or late hour
 * - LATE_EVENING: after adaptive late_eating_hour threshold
 * - PRE_SLEEP: last meal 4-5h before sleep (from planner) — v3.3.1
 * - PRE_WORKOUT: training in 1-2h
 * - POST_WORKOUT: training was 0-2h ago
 * - PROTEIN_DEFICIT: protein <50% target (only when meals already eaten)
 * - STRESS_EATING: stress >3 OR mood <3
 * - BALANCED: default scenario
 *
 * v3.7.0 (20.02.2026):
 * - FIX: "First meal of day" — when eatenKcal < 100, PROTEIN_DEFICIT no longer fires
 *   (every nutrient is at 0% when no meals eaten — this is NOT a protein deficit)
 *   Falls through to BALANCED: proper kcal split (remainingKcal / mealsRemaining)
 * - FIX: Planner now called even without lastMeal.time — enables multi-meal day planning
 *   when opening app with 0 meals eaten (was: single 300 kcal "Добираем белок")
 * - LOG: [MEALREC] noMealsEatenToday flag in scenario evaluation
 *
 * v3.6.0 (19.02.2026):
 * - FIX: calculateOptimalTiming() now respects active insulin wave (v4.0.6)
 *   Before: timing was purely gap-based (lastMeal + 4h gap), completely ignoring wave
 *   After: idealStart = max(gap-based, waveEnd + 30min fat burn)
 *   — uses HEYS.InsulinWave.calculate() with last meal nutrients
 * - FIX: After planner runs, timing sync — if planner first meal is later than recommender
 *   timing, update timingRec with planner's computed start so card shows correct time
 *   (was: card showed 22:44-23:00 naive gap time; now: card shows planner's 23:35-24:35)
 * - LOG: [MEALREC / timing] 🌊 Insulin wave constraint: logs waveEnd, remaining, fatBurnEnd
 * - LOG: [MEALREC.planner] 🔄 Timing sync: logs before/after when sync applied
 *
 * v3.3.1 (20.02.2026):
 * - NEW: PRE_SLEEP scenario added to SCENARIOS constant + SCENARIO_ICONS
 * - NEW: idealGI=25 for PRE_SLEEP (was defaulting to 50)
 *        (Halson 2014: low-GI pre-sleep → sustains deep sleep architecture)
 * - CONNECTS: pi_meal_planner.js v1.9.1 (PRE_SLEEP threshold 5h)
 *           + pi_product_picker.js v3.3.0 (PRE_SLEEP category override)
 *
 * v3.3.0 (18.02.2026):
 * - NEW: Per-meal product generation for multi-meal plans
 * - ISSUE: When planner returns 2+ meals, products were generated only for meal[0]
 *   using wrong (scenario-overridden) macros, so 2nd meal had no products
 * - SOLUTION: For mealsPlan.meals.length > 1, loop through all meals and call
 *   generateSmartMealSuggestions for each with that meal's actual macros budget
 * - IMPACT: Each planned meal now has correct products matching its real kcal/BJU
 * 
 * v3.2.0 CRITICAL FIX (17.02.2026):
 * - NEW: "Last meal override" — if mealsRemaining === 1 && remainingKcal > 300, use 90% of remainder
 * - ISSUE: LATE_EVENING caps at 200 kcal even when it's the LAST meal with 764 kcal remaining
 * - SOLUTION: Detect last meal context, override scenario cap with actual budget (90% to leave buffer)
 * - EXAMPLE: LATE_EVENING 21:49, 764 kcal left, 1 meal remaining → 688 kcal (not 200)
 * - IMPACT: All scenarios with caps (LATE_EVENING, LIGHT_SNACK, etc.) now adapt to last meal reality
 * 
 * v3.1.1 Bugfix (17.02.2026):
 * - FIXED: Product Picker now receives target meal kcal instead of day remaining kcal
 * - ISSUE: LATE_EVENING recommended 200 kcal but generated products for 764 kcal (full day remainder)
 * - SOLUTION: Pass macrosRec.kcal (meal target) instead of macrosRec.remainingKcal (day remainder)
 * - IMPACT: Product selection now matches recommended meal size for all scenarios with kcal limits
 * 
 * v3.0 Features (R2.7 Full Pattern Integration):
 * - Phase A (Core): 6 patterns (C01, C02, C15, C34, C35, C37)
 *   → Timing shifts, macro tuning, GI moderation, sugar filtering
 * - Phase B (Context): 4 patterns (C06, C14, C10, C12)
 *   → Sleep recovery, nutrient timing, fiber boost, mood-food
 * - Phase C (Micronutrients): 2 patterns (C26, C29)
 *   → Mineral boosts (Fe/Mg/Zn/Ca), NOVA quality filtering
 * - 11-factor Product Picker scoring system
 * - Pattern impact tracking + observability logging
 * 
 * Dependencies: pi_thresholds.js, pi_phenotype.js, pi_meal_rec_patterns.js, pi_patterns.js, pi_product_picker.js
 * @param global
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};
    const LOG_FILTER = 'MEALREC';
    const LOG_PREFIX = `[${LOG_FILTER}][MealRec]`;

    // Scenario constants (priority order)
    const SCENARIOS = {
        GOAL_REACHED: 'GOAL_REACHED',
        LIGHT_SNACK: 'LIGHT_SNACK',
        LATE_EVENING: 'LATE_EVENING',
        PRE_SLEEP: 'PRE_SLEEP',      // v3.3: from planner when hoursToSleep < 5h
        PRE_WORKOUT: 'PRE_WORKOUT',
        POST_WORKOUT: 'POST_WORKOUT',
        PROTEIN_DEFICIT: 'PROTEIN_DEFICIT',
        MICRONUTRIENT_FOCUS: 'MICRONUTRIENT_FOCUS', // R4-4: при 2+ серьёзных дефицитах
        MOOD_SUPPORT_BREAKFAST: 'MOOD_SUPPORT_BREAKFAST', // R4-5: low mood + morning
        SUGAR_RESET: 'SUGAR_RESET', // R12-B: после сладкого приёма у юзера с sugar dependency
        STRESS_EATING: 'STRESS_EATING',
        BALANCED: 'BALANCED'
    };

    // Scenario icons for UI
    const SCENARIO_ICONS = {
        [SCENARIOS.GOAL_REACHED]: '🎯',
        [SCENARIOS.LIGHT_SNACK]: '☕',
        [SCENARIOS.LATE_EVENING]: '🌙',
        [SCENARIOS.PRE_SLEEP]: '💤',   // v3.3
        [SCENARIOS.PRE_WORKOUT]: '⚡',
        [SCENARIOS.POST_WORKOUT]: '💪',
        [SCENARIOS.PROTEIN_DEFICIT]: '🥩',
        [SCENARIOS.MICRONUTRIENT_FOCUS]: '🥬', // R4-4
        [SCENARIOS.MOOD_SUPPORT_BREAKFAST]: '🌅', // R4-5
        [SCENARIOS.SUGAR_RESET]: '🚫🍬', // R12-B
        [SCENARIOS.STRESS_EATING]: '🧘',
        [SCENARIOS.BALANCED]: '🍽️'
    };

    function snapshotStablePlan(mealsPlan) {
        if (!mealsPlan?.available) return null;
        return {
            meals: (mealsPlan.meals || []).map((meal) => ({
                stableId: meal?.stableId || null,
                index: meal?.index,
                timeStart: meal?.timeStart,
                timeEnd: meal?.timeEnd,
                macros: meal?.macros,
                scenario: meal?.scenario,
                locked: !!meal?.locked,
                // R8-C: сохраняем остальные поля meal чтобы restore возвращал
                // полноценный объект, а не «scenario:? hoursToSleep:? wave end:?»
                scenarioSource: meal?.scenarioSource || null,
                scenarioBaseline: meal?.scenarioBaseline || null,
                hoursToSleep: meal?.hoursToSleep,
                targetGL: meal?.targetGL,
                sleepFriendlyCategories: meal?.sleepFriendlyCategories || null,
                estimatedWaveEnd: meal?.estimatedWaveEnd,
                fatBurnWindow: meal?.fatBurnWindow ? { ...meal.fatBurnWindow } : null,
                isActionable: !!meal?.isActionable,
                isLast: !!meal?.isLast,
                presleepCapped: !!meal?.presleepCapped
            })),
            summary: mealsPlan.summary || null
        };
    }

    function restoreStablePlanSnapshot(snapshot, reason = 'RESTORED_LAST_STABLE_PLAN') {
        if (!snapshot || !Array.isArray(snapshot.meals)) return null;
        return {
            available: true,
            meals: snapshot.meals.map((meal, index) => ({
                ...meal,
                index: typeof meal?.index === 'number' ? meal.index : index
            })),
            summary: {
                ...(snapshot.summary || {}),
                replanMeta: {
                    incremental: false,
                    restoredFromSnapshot: true,
                    reason,
                    generatedAt: Date.now()
                }
            }
        };
    }

    function buildAdaptivePlanState(mealsPlan, previousPlanState, replanReason, plannerMeta = {}) {
        if (!mealsPlan?.available && !previousPlanState) return null;
        const prevVersion = previousPlanState?.planVersion || 0;
        const meals = mealsPlan?.meals || [];
        const lockedMeals = meals
            .filter((meal) => meal?.locked)
            .map((meal) => ({
                stableId: meal.stableId || null,
                index: meal.index,
                timeStart: meal.timeStart,
                timeEnd: meal.timeEnd,
                macros: meal.macros,
                scenario: meal.scenario
            }));

        return {
            planVersion: prevVersion + 1,
            generatedAt: Date.now(),
            replanReason: replanReason || 'INITIAL_LOAD',
            lockedMeals,
            remainingBudget: mealsPlan?.summary?.totalMacros || previousPlanState?.remainingBudget || null,
            fallbackUsed: !!plannerMeta.fallbackUsed,
            plannerMode: plannerMeta.mode || null,
            lastStablePlan: mealsPlan?.available ? snapshotStablePlan(mealsPlan) : (previousPlanState?.lastStablePlan || null)
        };
    }

    function buildReplanExplain(replanReason, previousPlanState, mealsPlan, plannerMeta = {}) {
        if (!replanReason || replanReason === 'INITIAL_LOAD') return null;
        const changedMeals = mealsPlan?.meals?.length || 0;
        return {
            whyChanged: `План обновлён: ${replanReason.toLowerCase().replace(/_/g, ' ')}`,
            whatChanged: `Пересчитано приёмов: ${changedMeals}`,
            whatStayedLocked: `Зафиксировано: ${previousPlanState?.lockedMeals?.length || 0}`,
            fallbackUsed: plannerMeta.fallbackUsed ? 'Да, применён fallback-путь' : 'Нет'
        };
    }

    function isPlanValid(mealsPlan, dayTarget, dayEaten) {
        if (!mealsPlan?.available) return false;
        if (!Array.isArray(mealsPlan.meals)) return false;
        if (!mealsPlan.summary?.totalMacros) return false;
        const remainingBudget = Math.max(0, (dayTarget?.kcal || 0) - (dayEaten?.kcal || 0));
        if (remainingBudget > 120 && mealsPlan.meals.length === 0) return false;
        return true;
    }

    function hashStringToPercent(value) {
        const str = String(value || '');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash) % 100;
    }

    function getAdaptiveReplanControls(profile) {
        const ff = HEYS.featureFlags || HEYS.flags;
        const isFlagEnabled = (flagName) => {
            try {
                return typeof ff?.isEnabled === 'function' ? !!ff.isEnabled(flagName) : false;
            } catch (_) {
                return false;
            }
        };

        const clientId = profile?.id || profile?.clientId || HEYS.currentClientId || 'anonymous';
        const rolloutPctRaw = Number(global.localStorage?.getItem?.('heys_adaptive_replan_rollout_pct') || '0');
        const rolloutPct = Math.max(0, Math.min(100, Number.isFinite(rolloutPctRaw) ? rolloutPctRaw : 0));
        const bucket = hashStringToPercent(clientId);
        const bucketAllowed = rolloutPct >= 100 ? true : bucket < rolloutPct;

        return {
            adaptiveReplanEnabled: isFlagEnabled('adaptiveReplanEnabled'),
            incrementalReplanEnabled: isFlagEnabled('incrementalReplanEnabled'),
            shadowCompareEnabled: isFlagEnabled('shadowCompareEnabled'),
            killSwitchEnabled: isFlagEnabled('adaptiveReplanKillSwitch'),
            rolloutPct,
            bucket,
            bucketAllowed
        };
    }

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
    function analyzeCurrentContext(context, dayTarget, dayEaten, profile, currentTime, thresholds, patternHints = null) {
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

        console.info(`${LOG_PREFIX} 🎯 Context analysis:`, {
            remainingKcal,
            proteinProgress: Math.round(proteinProgress * 100) + '%',
            currentHour,
            lateEatingHour,
            hoursToTraining,
            mood,
            stress
        });

        // Scenario decision tree (priority order)
        // Collect all scenario evaluations for debugging
        const scenarioCandidates = [];

        // 1. GOAL_REACHED (highest priority)
        const goalReachedApplicable = remainingKcal < 50;
        scenarioCandidates.push({
            priority: 1,
            scenario: SCENARIOS.GOAL_REACHED,
            applicable: goalReachedApplicable,
            reason: goalReachedApplicable ? 'Дневная цель достигнута' : `Остаток ${remainingKcal} ккал > 50`,
            metadata: { remainingKcal }
        });
        if (goalReachedApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true; // Mark as winner
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.GOAL_REACHED} (priority 1)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.GOAL_REACHED,
                reason: 'Дневная цель достигнута',
                icon: SCENARIO_ICONS[SCENARIOS.GOAL_REACHED],
                metadata: { remainingKcal }
            };
        }

        // 2. LIGHT_SNACK
        const lightSnackApplicable = remainingKcal >= 50 && remainingKcal < 150;
        scenarioCandidates.push({
            priority: 2,
            scenario: SCENARIOS.LIGHT_SNACK,
            applicable: lightSnackApplicable,
            reason: lightSnackApplicable ? 'Мало калорий до цели' : `Остаток ${remainingKcal} ккал вне диапазона 50-150`,
            metadata: { remainingKcal }
        });
        if (lightSnackApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.LIGHT_SNACK} (priority 2)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.LIGHT_SNACK,
                reason: 'Мало калорий до цели',
                icon: SCENARIO_ICONS[SCENARIOS.LIGHT_SNACK],
                metadata: { remainingKcal }
            };
        }

        // 3. PRE_WORKOUT (within 1-2h)
        const preWorkoutApplicable = hoursToTraining !== null && hoursToTraining > 0 && hoursToTraining <= 2;
        scenarioCandidates.push({
            priority: 3,
            scenario: SCENARIOS.PRE_WORKOUT,
            applicable: preWorkoutApplicable,
            reason: preWorkoutApplicable ? `Тренировка через ${Math.round(hoursToTraining * 60)} мин` : (hoursToTraining === null ? 'Нет тренировки сегодня' : `Тренировка через ${Math.round(hoursToTraining * 60)} мин (не в окне 1-2h)`),
            metadata: { hoursToTraining, trainingTime: training?.time }
        });
        if (preWorkoutApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.PRE_WORKOUT} (priority 3)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.PRE_WORKOUT,
                reason: `Тренировка через ${Math.round(hoursToTraining * 60)} мин`,
                icon: SCENARIO_ICONS[SCENARIOS.PRE_WORKOUT],
                metadata: { hoursToTraining, trainingTime: training.time }
            };
        }

        // 4. POST_WORKOUT (within 0-2h after)
        const postWorkoutApplicable = hoursToTraining !== null && hoursToTraining < 0 && hoursToTraining > -2;
        scenarioCandidates.push({
            priority: 4,
            scenario: SCENARIOS.POST_WORKOUT,
            applicable: postWorkoutApplicable,
            reason: postWorkoutApplicable ? 'После тренировки — восстановление' : (hoursToTraining === null ? 'Нет тренировки сегодня' : `Тренировка ${hoursToTraining < 0 ? 'была давно' : 'еще не началась'}`),
            metadata: { hoursToTraining, hoursSinceTraining: hoursToTraining ? Math.abs(hoursToTraining) : null }
        });
        if (postWorkoutApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.POST_WORKOUT} (priority 4)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.POST_WORKOUT,
                reason: 'После тренировки — восстановление',
                icon: SCENARIO_ICONS[SCENARIOS.POST_WORKOUT],
                metadata: { hoursSinceTraining: Math.abs(hoursToTraining) }
            };
        }

        // 5. LATE_EVENING (checked before PROTEIN_DEFICIT by design)
        // Priority: Sleep quality > Protein goal completion
        // Rationale: After lateEatingHour, even with protein deficit,
        // recommend light meal to avoid heavy digestion before sleep
        const lateEveningApplicable = currentHour >= lateEatingHour && remainingKcal > 150;
        scenarioCandidates.push({
            priority: 5,
            scenario: SCENARIOS.LATE_EVENING,
            applicable: lateEveningApplicable,
            reason: lateEveningApplicable ? 'Поздний вечер — лёгкий приём' : (currentHour < lateEatingHour ? `Еще рано (${currentHour}:00 < ${lateEatingHour}:00)` : `Остаток ${remainingKcal} ккал <= 150`),
            metadata: { currentHour, lateEatingHour, remainingKcal }
        });
        if (lateEveningApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.LATE_EVENING} (priority 5)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.LATE_EVENING,
                reason: 'Поздний вечер — лёгкий приём',
                icon: SCENARIO_ICONS[SCENARIOS.LATE_EVENING],
                metadata: { currentHour, lateEatingHour, remainingKcal }
            };
        }

        // R4-5: MOOD_SUPPORT_BREAKFAST (priority 5.5) — low mood + morning.
        // Идёт ВЫШЕ STRESS_EATING потому что для утра нет смысла в anti-stress,
        // нужны триптофановые продукты для серотонина (молочное, бананы, орехи).
        const moodSupportBreakfastApplicable = mood <= 2 && currentHour < 11 && remainingKcal > 200;
        scenarioCandidates.push({
            priority: 5.5,
            scenario: SCENARIOS.MOOD_SUPPORT_BREAKFAST,
            applicable: moodSupportBreakfastApplicable,
            reason: moodSupportBreakfastApplicable ? `Утро + низкое настроение (mood ${mood}/5)` : `mood ${mood}/5, час ${currentHour}`,
            metadata: { mood, currentHour }
        });
        if (moodSupportBreakfastApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation: Winner: ${SCENARIOS.MOOD_SUPPORT_BREAKFAST} (priority 5.5)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.MOOD_SUPPORT_BREAKFAST,
                reason: `Утро + поддержка настроения`,
                icon: SCENARIO_ICONS[SCENARIOS.MOOD_SUPPORT_BREAKFAST],
                metadata: { mood, currentHour, hint: 'триптофан: молочное, бананы, орехи' }
            };
        }

        // 6. STRESS_EATING (higher priority than PROTEIN_DEFICIT)
        // R4-5: остаётся бинарным (stress≥4 OR mood≤2 после морнинга). Градация
        // moderate-stress применяется в planner для сдвига deadline (R4-5 ниже).
        const stressEatingApplicable = stress >= 4 || mood <= 2;
        scenarioCandidates.push({
            priority: 6,
            scenario: SCENARIOS.STRESS_EATING,
            applicable: stressEatingApplicable,
            reason: stressEatingApplicable ? (stress >= 4 ? 'Высокий стресс' : 'Низкое настроение') : `Стресс ${stress}/5, настроение ${mood}/5 в норме`,
            metadata: { stress, mood }
        });
        if (stressEatingApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.STRESS_EATING} (priority 6)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.STRESS_EATING,
                reason: stress >= 4 ? 'Высокий стресс' : 'Низкое настроение',
                icon: SCENARIO_ICONS[SCENARIOS.STRESS_EATING],
                metadata: { stress, mood }
            };
        }

        // R4-4: MICRONUTRIENT_FOCUS — 2+ серьёзных дефицита из истории
        // (iron/magnesium/zinc/calcium < 50%). Активен для не-последних приёмов.
        // R5-X: при low-carb профиле (dayTarget.carbs = 0) этот сценарий
        // ставит 200г углеводов, которые safety net потом скейлит вниз и
        // planner перезатирает на floor 40г. Чтобы не плодить путаницу — отключаем.
        const micronutrientDeficits = patternHints?.micronutrients?.deficits || [];
        const seriousDeficits = micronutrientDeficits.filter((d) => Number(d?.avgPct) < 50);
        const isLikelyLastMeal = remainingKcal < 700 && currentHour >= 19;
        const isLowCarbProfile = (Number(dayTarget?.carbs) || Number(dayTarget?.carb) || 0) < 30;
        const micronutrientFocusApplicable = seriousDeficits.length >= 2 && remainingKcal > 200 && !isLikelyLastMeal && !isLowCarbProfile;
        scenarioCandidates.push({
            priority: 6.5,
            scenario: SCENARIOS.MICRONUTRIENT_FOCUS,
            applicable: micronutrientFocusApplicable,
            reason: micronutrientFocusApplicable
                ? `${seriousDeficits.length} дефицита: ${seriousDeficits.map((d) => `${d.nutrient} ${Math.round(d.avgPct)}%`).join(', ')}`
                : (seriousDeficits.length < 2 ? `только ${seriousDeficits.length} серьёзных дефицит(ов)` : (isLikelyLastMeal ? 'последний приём дня — отложено' : 'мало бюджета')),
            metadata: { seriousDeficits: seriousDeficits.map((d) => d.nutrient), deficitsCount: seriousDeficits.length }
        });
        if (micronutrientFocusApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation: Winner: ${SCENARIOS.MICRONUTRIENT_FOCUS} (priority 6.5)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.MICRONUTRIENT_FOCUS,
                reason: `Дефицит: ${seriousDeficits.map((d) => d.nutrient).join(', ')}`,
                icon: SCENARIO_ICONS[SCENARIOS.MICRONUTRIENT_FOCUS],
                metadata: { targetMicronutrients: seriousDeficits.map((d) => d.nutrient) }
            };
        }

        // R12-B: SUGAR_RESET — после сладкого приёма у юзера с sugar dependency risk
        // Активируется если: (a) есть зависимость по истории, (b) последний приём содержал
        // >15г простых углеводов. Цель — следующий приём со низким GL (<10) и без added sugar.
        const sugarDependencyRisk = !!patternHints?.addedSugarDependency?.dependencyRisk;
        const lastMealSimpleSugar = Number(context?.lastMeal?.totals?.simple) || 0;
        const sugarResetApplicable = sugarDependencyRisk && lastMealSimpleSugar > 15 && remainingKcal > 150;
        scenarioCandidates.push({
            priority: 6.7,
            scenario: SCENARIOS.SUGAR_RESET,
            applicable: sugarResetApplicable,
            reason: sugarResetApplicable
                ? `Сладкий приём (${Math.round(lastMealSimpleSugar)}г сахара) + sugar dependency risk`
                : (!sugarDependencyRisk ? 'нет sugar dependency' : `simple sugar в последнем приёме ${Math.round(lastMealSimpleSugar)}г ≤ 15`),
            metadata: { sugarDependencyRisk, lastMealSimpleSugar }
        });
        if (sugarResetApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation: Winner: ${SCENARIOS.SUGAR_RESET} (priority 6.7)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.SUGAR_RESET,
                reason: `Reset после сладкого (${Math.round(lastMealSimpleSugar)}г сахара)`,
                icon: SCENARIO_ICONS[SCENARIOS.SUGAR_RESET],
                metadata: { hint: 'низкий GL (<10), без added sugar, белок + клетчатка', lastMealSimpleSugar }
            };
        }

        // 7. PROTEIN_DEFICIT (< 50% of daily target)
        // v3.7.0: When no meals eaten today (eatenKcal < 100), this is NOT a "protein deficit" —
        // every nutrient is at 0%. Use BALANCED instead for proper meal sizing.
        const noMealsEatenToday = eatenKcal < 100;
        const proteinDeficitApplicable = proteinProgress < 0.5 && remainingProtein > 10 && !noMealsEatenToday;
        scenarioCandidates.push({
            priority: 7,
            scenario: SCENARIOS.PROTEIN_DEFICIT,
            applicable: proteinDeficitApplicable,
            reason: proteinDeficitApplicable ? `Белок ${Math.round(proteinProgress * 100)}% от цели` : (noMealsEatenToday ? `Нет приёмов сегодня (${Math.round(eatenKcal)} kcal) — используем BALANCED` : (proteinProgress >= 0.5 ? `Белок ${Math.round(proteinProgress * 100)}% >= 50%` : `Остаток белка ${remainingProtein}г <= 10г`)),
            metadata: { proteinProgress, remainingProtein, noMealsEatenToday }
        });
        if (proteinDeficitApplicable) {
            scenarioCandidates[scenarioCandidates.length - 1].winner = true;
            console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.PROTEIN_DEFICIT} (priority 7)`);
            console.table(scenarioCandidates);
            console.groupEnd();
            return {
                scenario: SCENARIOS.PROTEIN_DEFICIT,
                reason: `Белок ${Math.round(proteinProgress * 100)}% от цели`,
                icon: SCENARIO_ICONS[SCENARIOS.PROTEIN_DEFICIT],
                metadata: { proteinProgress, remainingProtein }
            };
        }

        // 8. BALANCED (default)
        scenarioCandidates.push({
            priority: 8,
            scenario: SCENARIOS.BALANCED,
            applicable: true,
            reason: 'Стандартный приём пищи (fallback)',
            metadata: { remainingKcal },
            winner: true // Always wins if we get here
        });
        console.group(`${LOG_PREFIX} 🏆 Scenario evaluation (ALL 8): Winner: ${SCENARIOS.BALANCED} (priority 8 - fallback)`);
        console.table(scenarioCandidates);
        console.groupEnd();
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
        console.info(`${LOG_PREFIX} 🍽️ recommendNextMeal v3.6.0 called:`, {
            contextTime: context?.currentTime,
            lastMealTime: context?.lastMeal?.time,
            hasTraining: !!context?.training,
            profileId: profile?.id || profile?.clientId || global.HEYS?.currentClientId || 'n/a',
            daysCount: days?.length || 0,
            hasPatternsModule: !!HEYS.InsightsPI?.mealRecPatterns
        });

        if (!context || !profile) {
            console.warn(`${LOG_PREFIX} ❌ Missing context or profile`);
            return { available: false, error: 'Missing context or profile' };
        }

        // S9 (v3.5.0): Auto-detect phenotype if missing and sufficient data
        // Phenotype enriches Phase A macro modifiers with metabolic/circadian/satiety adjustments
        if (!profile.phenotype && days.length >= 30 && HEYS.InsightsPI?.phenotype?.autoDetect) {
            try {
                const detected = HEYS.InsightsPI.phenotype.autoDetect(days, profile, pIndex);
                if (detected) {
                    profile.phenotype = detected;
                    console.info(`${LOG_PREFIX} 🧬 S9: Auto-detected phenotype:`, {
                        metabolic: detected.metabolic,
                        circadian: detected.circadian,
                        satiety: detected.satiety,
                        stress: detected.stress,
                        confidence: detected.confidence
                    });
                }
            } catch (e) {
                console.warn(`${LOG_PREFIX} ⚠️ S9: Phenotype auto-detect failed:`, e.message);
            }
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
                thresholds = HEYS.InsightsPI.thresholds.getAdaptiveThresholds(days, profile, pIndex);
                console.info(`${LOG_PREFIX} 📊 Adaptive thresholds loaded:`, {
                    lateEatingHour: thresholds.lateEatingHour,
                    mealGapHours: thresholds.idealMealGapMin / 60,
                    source: thresholds.source
                });
            } catch (err) {
                console.warn(`${LOG_PREFIX} ⚠️ Failed to load thresholds, using defaults:`, err.message);
            }
        }

        // Phase A/B (v3.1): Load pattern hints for timing/macros/picker modifiers
        const patternHints = loadPatternHints(days, profile, pIndex);

        // Analyze context → determine scenario (v2.4 feature)
        const contextAnalysis = analyzeCurrentContext(context, dayTarget, dayEaten, profile, currentTime, thresholds, patternHints);
        console.info(`${LOG_PREFIX} 🎯 Scenario detected:`, {
            scenario: contextAnalysis.scenario,
            reason: contextAnalysis.reason,
            metadata: contextAnalysis.metadata
        });

        // Track applied pattern impacts for MEALREC observability
        const patternImpact = [];

        // Calculate timing recommendation
        const timingRec = calculateOptimalTiming(currentTime, lastMeal, training, sleepTarget, thresholds, patternHints, patternImpact);

        // Calculate macros recommendation (scenario-aware v2.4)
        const macrosRec = calculateOptimalMacros(contextAnalysis, dayTarget, dayEaten, training, profile, timingRec, patternHints, patternImpact);

        // Generate meal suggestions (Smart Product Picker v2.5)
        const suggestionsResult = generateSmartMealSuggestions(contextAnalysis, macrosRec, context, profile, pIndex, patternHints, patternImpact);

        // v3.1: Handle both grouped and flat modes
        let suggestions, mode, groups;
        if (suggestionsResult && typeof suggestionsResult === 'object' && suggestionsResult.mode) {
            // v3.1: Structured response from Product Picker
            mode = suggestionsResult.mode;
            if (mode === 'grouped') {
                groups = suggestionsResult.groups;
                suggestions = undefined; // No flat array in grouped mode
            } else {
                suggestions = suggestionsResult.suggestions || [];
                groups = undefined;
            }
        } else {
            // Legacy: direct array
            mode = 'flat';
            suggestions = Array.isArray(suggestionsResult) ? suggestionsResult : [];
            groups = undefined;
        }

        console.info(`${LOG_PREFIX} [MEALREC.suggestions] 📦 Suggestions mode:`, {
            mode,
            hasSuggestions: !!suggestions,
            suggestionsCount: suggestions?.length || 0,
            hasGroups: !!groups,
            groupsCount: groups?.length || 0,
        });

        // Generate reasoning (scenario-aware v2.4)
        const reasoning = generateReasoning(contextAnalysis, timingRec, macrosRec, dayTarget, dayEaten, training);

        // 🆕 v3.1: Multi-Meal Planning (Phase 1)
        // Вызываем планировщик для расчёта всех оставшихся приёмов до сна
        let mealsPlan = null;

        console.info(`${LOG_PREFIX} [MEALREC.planner] 🔍 Checking multi-meal conditions:`, {
            hasPlanner: !!HEYS.InsightsPI?.mealPlanner?.planRemainingMeals,
            hasLastMealTime: !!lastMeal?.time,
            daysCount: days.length,
            dayTarget: dayTarget,
            dayEaten: dayEaten,
            remainingKcal: (dayTarget?.kcal || 0) - (dayEaten?.kcal || 0)
        });

        // v3.7.0: Allow planner without lastMeal — "first meal of day" scenario
        // When no meals eaten today, planner can still plan 3-4 meals from now to sleep
        const hasEnoughHistory = days.length >= 3;
        const hasPlanner = !!HEYS.InsightsPI?.mealPlanner?.planRemainingMeals;
        const hasIncrementalPlanner = !!HEYS.InsightsPI?.mealPlanner?.replanRemainingMeals;
        const hasLastMealTime = !!lastMeal?.time;
        const replanReason = context?.replanReason || null;
        const previousPlanState = context?.planState || null;
        const replanControls = getAdaptiveReplanControls(profile);
        const incrementalAllowed = replanControls.adaptiveReplanEnabled
            && replanControls.incrementalReplanEnabled
            && !replanControls.killSwitchEnabled
            && replanControls.bucketAllowed;
        const isIncrementalReplan = !!(replanReason && hasIncrementalPlanner && incrementalAllowed);
        let plannerMeta = {
            mode: isIncrementalReplan ? 'incremental' : 'full',
            fallbackUsed: false,
            fallbackType: null,
            rollout: {
                adaptiveReplanEnabled: replanControls.adaptiveReplanEnabled,
                incrementalReplanEnabled: replanControls.incrementalReplanEnabled,
                killSwitchEnabled: replanControls.killSwitchEnabled,
                rolloutPct: replanControls.rolloutPct,
                bucket: replanControls.bucket,
                bucketAllowed: replanControls.bucketAllowed
            }
        };

        if (hasPlanner && hasEnoughHistory) {
            console.info(`${LOG_PREFIX} [MEALREC.planner] ✅ Calling planRemainingMeals...`, {
                mode: hasLastMealTime ? 'wave-aware' : 'first-meal-of-day'
            });
            try {
                // R4-5: gradient stress/mood для сдвига deadline в planner.
                // moderate stress (≥3) + late evening + low mood ухудшает качество сна.
                const _stress = Number(context.lastMeal?.stress) || Number(context?.stress) || 3;
                const _mood = Number(context.lastMeal?.mood) || Number(context?.mood) || 3;
                const stressMoodSignals = {
                    stressLevel: _stress >= 4 ? 'high' : _stress >= 3 ? 'moderate' : 'low',
                    moodLevel: _mood <= 2 ? 'low' : _mood >= 4 ? 'high' : 'neutral'
                };
                // R4-6: передать waveOverlap в planner для advisory
                const _waveOverlap = patternHints?.waveOverlap?.avgOverlapPct;

                const plannerInput = {
                    currentTime: context.currentTime || getCurrentTime(),
                    lastMeal: lastMeal,
                    dayTarget: dayTarget,
                    dayEaten: dayEaten,
                    profile: profile,
                    days: days,
                    pIndex: pIndex,
                    // R1-14: явный sleepStart дня имеет приоритет над усреднением истории
                    daySleepStart: context.daySleepStart || null,
                    isRefeedDay: !!context.isRefeedDay,
                    // R4-5: gradient stress/mood signals
                    stressMoodSignals,
                    // R4-6: waveOverlap для adaptive gap и advisory
                    waveOverlapPct: Number.isFinite(_waveOverlap) ? _waveOverlap : null,
                    // R5-D: передаём scenario от recommender чтобы planner мог сохранить
                    // специфичные сценарии (MICRONUTRIENT_FOCUS, MOOD_SUPPORT_BREAKFAST)
                    // для первого meal вместо generic PRE_SLEEP от detectMealScenario.
                    scenarioHint: contextAnalysis?.scenario || null,
                    // R12-A: currentDay (тренировки + контекст дня) для R4-8 recovery factor
                    // и POST_WORKOUT scenario. Без этого вся работа Раунда 4-8 по recovery
                    // была неактивна в production (R4-8 ищет params.currentDay?.workouts).
                    currentDay: context.currentDay || null,
                    // R12-B: glycemicLoad history для GL_TARGET_DAY override и SUGAR_RESET
                    glycemicLoadHistory: patternHints?.glycemicLoad || null,
                    addedSugarHistory: patternHints?.addedSugarDependency || null,
                    fiberRegularityScore: patternHints?.fiberRegularity?.score ?? null,
                    // R12-C: patternImpact + phenotype чтобы planner мог объяснить решения
                    patternImpactHints: Array.isArray(patternImpact)
                        ? patternImpact.filter((p) => ['C15', 'C35', 'C06', 'C14'].includes(p.pattern))
                        : null,
                    phenotypeApplied: profile?.phenotype || null,
                    replanReason,
                    previousPlanState,
                    lockedMeals: previousPlanState?.lockedMeals || []
                };

                if (isIncrementalReplan) {
                    mealsPlan = HEYS.InsightsPI.mealPlanner.replanRemainingMeals(plannerInput);
                    if (!isPlanValid(mealsPlan, dayTarget, dayEaten)) {
                        plannerMeta = { ...plannerMeta, fallbackUsed: true, fallbackType: 'incremental_to_full', mode: 'full' };
                        mealsPlan = HEYS.InsightsPI.mealPlanner.planRemainingMeals(plannerInput);
                    }
                } else {
                    mealsPlan = HEYS.InsightsPI.mealPlanner.planRemainingMeals(plannerInput);
                }

                // R8-A: НЕ восстанавливать stable snapshot если текущий scenario
                // — терминальный (GOAL_REACHED). Юзер достиг цели → старый план
                // (от момента когда цель была не выполнена) неактуален. Иначе
                // карточка покажет «🎯 Цель достигнута» + meal с макросами поверх.
                const isTerminalScenario = contextAnalysis?.scenario === SCENARIOS.GOAL_REACHED;
                if (!isPlanValid(mealsPlan, dayTarget, dayEaten) && previousPlanState?.lastStablePlan && !isTerminalScenario) {
                    const restored = restoreStablePlanSnapshot(previousPlanState.lastStablePlan, 'FULL_PLAN_INVALID_RESTORED');
                    if (restored) {
                        plannerMeta = { ...plannerMeta, fallbackUsed: true, fallbackType: 'restore_last_stable' };
                        mealsPlan = restored;
                    }
                } else if (isTerminalScenario && previousPlanState?.lastStablePlan) {
                    console.info(`${LOG_PREFIX} [MEALREC.planner] 🎯 GOAL_REACHED — stable snapshot НЕ восстанавливается (терминальный сценарий)`);
                }

                if (isIncrementalReplan && replanControls.shadowCompareEnabled) {
                    try {
                        const shadowFullPlan = HEYS.InsightsPI.mealPlanner.planRemainingMeals(plannerInput);
                        if (isPlanValid(shadowFullPlan, dayTarget, dayEaten) && isPlanValid(mealsPlan, dayTarget, dayEaten)) {
                            const inc = mealsPlan.summary?.totalMacros || {};
                            const full = shadowFullPlan.summary?.totalMacros || {};
                            const drift = {
                                mealsCountDiff: (mealsPlan.meals?.length || 0) - (shadowFullPlan.meals?.length || 0),
                                kcalDiff: Math.round((inc.kcal || 0) - (full.kcal || 0)),
                                protDiff: Math.round((inc.prot || 0) - (full.prot || 0)),
                                carbsDiff: Math.round((inc.carbs || 0) - (full.carbs || 0))
                            };
                            plannerMeta.shadowDrift = drift;
                            console.info(`${LOG_PREFIX} [MEALREC.shadow] 🪞 incremental/full drift:`, drift);
                        }
                    } catch (shadowErr) {
                        console.warn(`${LOG_PREFIX} [MEALREC.shadow] ⚠️ shadow compare failed:`, shadowErr?.message);
                    }
                }

                if (mealsPlan?.available && mealsPlan.meals?.length > 0) {
                    console.info(`${LOG_PREFIX} [MEALREC.planner] 🍽️ Multi-meal plan generated:`, {
                        totalMeals: mealsPlan.meals.length,
                        timeline: mealsPlan.meals.map(m => m.timeStart).join(' → '),
                        totalKcal: Math.round(mealsPlan.summary?.totalMacros?.kcal || 0),
                        firstMealMacros: mealsPlan.meals[0]?.macros
                    });

                    if (mealsPlan.meals.length > 1) {
                        // 🆕 v3.3: Multi-meal mode — генерируем продукты для КАЖДОГО приёма отдельно
                        // Это позволяет учесть реальный бюджет ккал/БЖУ каждого приёма
                        console.info(`${LOG_PREFIX} [MEALREC.planner] 🔄 Generating per-meal products for ${mealsPlan.meals.length} meals...`);

                        // P3 fix: accumulate used product IDs to prevent identical products across meals
                        const crossMealExcludeIds = new Set();

                        for (let mealIdx = 0; mealIdx < mealsPlan.meals.length; mealIdx++) {
                            const plannedMeal = mealsPlan.meals[mealIdx];
                            // Строим macrosRec из бюджета этого приёма (prot→protein, остальное совпадает)
                            const mealMacrosRec = {
                                ...macrosRec,
                                protein: plannedMeal.macros.prot,
                                carbs: plannedMeal.macros.carbs,
                                fat: plannedMeal.macros.fat,
                                kcal: plannedMeal.macros.kcal,
                                remainingKcal: plannedMeal.macros.kcal,
                                remainingMeals: mealsPlan.meals.length - mealIdx,
                                // Переопределяем isLastMeal — только последний приём легче
                                isLastMeal: mealIdx === mealsPlan.meals.length - 1,
                                // v3.4: F2 — GL target from planner (20=day, 10=PRE_SLEEP, Ludwig 2002)
                                targetGL: plannedMeal.targetGL ?? null,
                            };
                            // contextAnalysis для этого приёма — берём сценарий из планировщика
                            const mealContextAnalysis = {
                                ...contextAnalysis,
                                scenario: plannedMeal.scenario || contextAnalysis.scenario
                            };

                            try {
                                const mealProducts = generateSmartMealSuggestions(
                                    mealContextAnalysis,
                                    mealMacrosRec,
                                    context,
                                    profile,
                                    pIndex,
                                    patternHints || [],
                                    undefined, // patternImpact
                                    crossMealExcludeIds // P3: pass exclusion set
                                );

                                if (mealProducts?.mode === 'grouped' && mealProducts.groups) {
                                    plannedMeal.groups = mealProducts.groups;
                                    plannedMeal.productMode = 'grouped';
                                    // P3: collect product IDs to exclude from next meal
                                    mealProducts.groups.forEach(g =>
                                        g.products.forEach(p => { if (p.productId) crossMealExcludeIds.add(p.productId); })
                                    );
                                    console.info(`${LOG_PREFIX} [MEALREC.planner] 📋 Meal ${mealIdx + 1}: assigned ${mealProducts.groups.length} groups (${Math.round(mealMacrosRec.kcal)} kcal, scenario=${plannedMeal.scenario}, targetGL=${plannedMeal.targetGL ?? 'n/a'}), excluded=${crossMealExcludeIds.size}`);
                                } else if (mealProducts?.mode === 'flat' && mealProducts.suggestions?.length > 0) {
                                    // flat mode object { mode, suggestions }
                                    plannedMeal.suggestions = mealProducts.suggestions;
                                    plannedMeal.productMode = 'flat';
                                    mealProducts.suggestions.forEach(s => { if (s.productId) crossMealExcludeIds.add(s.productId); });
                                    console.info(`${LOG_PREFIX} [MEALREC.planner] 📋 Meal ${mealIdx + 1}: assigned ${mealProducts.suggestions.length} flat suggestions (${Math.round(mealMacrosRec.kcal)} kcal), excluded=${crossMealExcludeIds.size}`);
                                } else if (mealProducts?.suggestions) {
                                    plannedMeal.suggestions = mealProducts.suggestions;
                                    plannedMeal.productMode = 'flat';
                                    // P3: collect product IDs from flat suggestions
                                    mealProducts.suggestions.forEach(s => { if (s.productId) crossMealExcludeIds.add(s.productId); });
                                    console.info(`${LOG_PREFIX} [MEALREC.planner] 📋 Meal ${mealIdx + 1}: assigned ${mealProducts.suggestions.length} suggestions (${Math.round(mealMacrosRec.kcal)} kcal), excluded=${crossMealExcludeIds.size}`);
                                } else if (Array.isArray(mealProducts) && mealProducts.length > 0) {
                                    // legacy plain array return
                                    plannedMeal.suggestions = mealProducts;
                                    plannedMeal.productMode = 'flat';
                                    mealProducts.forEach(s => { if (s.productId) crossMealExcludeIds.add(s.productId); });
                                    console.info(`${LOG_PREFIX} [MEALREC.planner] 📋 Meal ${mealIdx + 1}: assigned ${mealProducts.length} legacy suggestions (${Math.round(mealMacrosRec.kcal)} kcal), excluded=${crossMealExcludeIds.size}`);
                                } else {
                                    console.warn(`${LOG_PREFIX} [MEALREC.planner] ⚠️ Meal ${mealIdx + 1}: no products generated`);
                                }
                            } catch (mealErr) {
                                console.warn(`${LOG_PREFIX} [MEALREC.planner] ⚠️ Meal ${mealIdx + 1}: product generation failed:`, mealErr.message);
                            }
                        }

                        console.info(`${LOG_PREFIX} [MEALREC.planner] ✅ Per-meal products generated:`, {
                            meals: mealsPlan.meals.map((m, i) => ({
                                meal: i + 1,
                                kcal: Math.round(m.macros.kcal),
                                scenario: m.scenario,
                                hasGroups: !!m.groups,
                                hasSuggestions: !!m.suggestions
                            }))
                        });

                    } else if (mealsPlan.meals[0]) {
                        // Single meal from planner — используем уже сгенерированные продукты
                        if (mode === 'grouped' && groups) {
                            mealsPlan.meals[0].groups = groups;
                            console.info(`${LOG_PREFIX} [MEALREC.planner] 📋 Assigned ${groups.length} groups to single planned meal`);
                        } else if (suggestions) {
                            mealsPlan.meals[0].suggestions = suggestions;
                            console.info(`${LOG_PREFIX} [MEALREC.planner] 📋 Assigned ${suggestions.length} suggestions to single planned meal`);
                        }
                    }
                } else {
                    console.info(`${LOG_PREFIX} [MEALREC.planner] ℹ️ Planner returned no meals:`, mealsPlan);
                }
            } catch (err) {
                console.warn(`${LOG_PREFIX} [MEALREC.planner] ⚠️ Failed to generate meal plan:`, err.message);
                // R8-A: тот же guard для exception path
                const isTerminalScenarioErr = contextAnalysis?.scenario === SCENARIOS.GOAL_REACHED;
                const restored = isTerminalScenarioErr ? null : restoreStablePlanSnapshot(previousPlanState?.lastStablePlan, 'PLANNER_EXCEPTION_RESTORED');
                if (restored) {
                    plannerMeta = { ...plannerMeta, fallbackUsed: true, fallbackType: 'planner_exception_restore' };
                    mealsPlan = restored;
                } else {
                    mealsPlan = null;
                }
            }
        } else {
            console.info(`${LOG_PREFIX} [MEALREC.planner] ❌ Conditions NOT met for multi-meal planning`);
        }

        // R10-B: planner вернул пустой план (`meals: []` с reason типа
        // "Недостаточно времени до сна") — но recommender уже посчитал свои
        // macros (например 904 ккал). Без sync header показал бы 904 ккал
        // и противоречил пустому таймлайну. Обнуляем макросы и помечаем.
        if (mealsPlan?.available && Array.isArray(mealsPlan.meals) && mealsPlan.meals.length === 0) {
            const noPlanReason = mealsPlan.summary?.reason || 'planner returned no meals';
            console.info(`${LOG_PREFIX} [MEALREC.planner] ⚠️ Empty plan from planner — zeroing header macros to avoid contradiction:`, {
                reason: noPlanReason,
                wasMacros: { protein: macrosRec.protein, carbs: macrosRec.carbs, fat: macrosRec.fat, kcal: macrosRec.kcal }
            });
            macrosRec.protein = 0;
            macrosRec.carbs = 0;
            macrosRec.fat = 0;
            macrosRec.kcal = 0;
            macrosRec.proteinRange = '0-0';
            macrosRec.carbsRange = '0-0';
            macrosRec.kcalRange = '0-0';
            macrosRec.plannerSynced = true;
            macrosRec.plannerEmptyPlan = true;
            macrosRec.plannerEmptyReason = noPlanReason;
        }

        // R1-15: двусторонний timing sync. Раньше обновляли только если planner вернул
        // ПОЗЖЕ recommender'а — но planner всегда авторитетен (он учёл волну, жиросжигание,
        // deadline до сна). Если он вернул раньше — это тоже его решение.
        if (mealsPlan?.available && mealsPlan.meals?.length > 0) {
            const firstPlannedMeal = mealsPlan.meals[0];
            if (firstPlannedMeal.timeStart) {
                const plannerStartHours = parseTime(firstPlannedMeal.timeStart);
                const plannerEndHours = firstPlannedMeal.timeEnd ? parseTime(firstPlannedMeal.timeEnd) : plannerStartHours + 1;
                const driftHours = plannerStartHours - (timingRec.idealStart || plannerStartHours);
                if (Math.abs(driftHours) > 0.01) {
                    console.info(`${LOG_PREFIX} [MEALREC.planner] 🔄 Timing sync (bidirectional):`, {
                        recommenderTiming: timingRec.ideal,
                        plannerStart: firstPlannedMeal.timeStart,
                        plannerEnd: firstPlannedMeal.timeEnd,
                        driftHours: driftHours.toFixed(2),
                        direction: driftHours > 0 ? 'planner_later' : 'planner_earlier'
                    });
                }
                timingRec.idealStart = plannerStartHours;
                timingRec.idealEnd = plannerEndHours;
                timingRec.ideal = `${formatTime(plannerStartHours)}-${formatTime(plannerEndHours)}`;
                timingRec.reason = `Планировщик: после инсулиновой волны + жиросжигание`;
                timingRec.plannerSynced = true;
            }

            // R4-1: macros sync. Раньше header показывал recommender.macros (618 kcal от
            // LAST MEAL OVERRIDE = 90% бюджета), а planner возвращал 686 kcal после
            // MPS-буста. Юзер видел разные цифры. Planner — авторитетный источник
            // физиологии (учёл MPS, POST_WORKOUT, distributeBudget). Синхронизируем.
            const m0 = firstPlannedMeal.macros;
            if (m0 && Number.isFinite(m0.kcal)) {
                const before = { protein: macrosRec.protein, carbs: macrosRec.carbs, fat: macrosRec.fat, kcal: macrosRec.kcal };
                macrosRec.protein = Math.round(m0.prot || 0);
                macrosRec.carbs = Math.round(m0.carbs || 0);
                macrosRec.fat = Math.round(m0.fat || 0);
                macrosRec.kcal = Math.round(m0.kcal || 0);
                // Перерасчёт ranges от синхронизированных макросов
                macrosRec.proteinRange = `${Math.max(0, macrosRec.protein - 5)}-${macrosRec.protein + 5}`;
                macrosRec.carbsRange = `${Math.max(0, macrosRec.carbs - 10)}-${macrosRec.carbs + 10}`;
                macrosRec.kcalRange = `${Math.max(0, macrosRec.kcal - 50)}-${macrosRec.kcal + 50}`;
                macrosRec.plannerSynced = true;
                console.info(`${LOG_PREFIX} [MEALREC.planner] 🔄 Macros sync (planner = source of truth):`, {
                    before, after: { protein: macrosRec.protein, carbs: macrosRec.carbs, fat: macrosRec.fat, kcal: macrosRec.kcal }
                });
            }

            // R6-B / R11: scenario sync. Если planner сохранил specific scenario
            // от recommender (MICRONUTRIENT_FOCUS, MOOD_SUPPORT_BREAKFAST) —
            // header уже совпадает с meal. Если planner выбрал свой baseline
            // (PRE_SLEEP, BALANCED) ИЛИ применил R1-8 light fallback —
            // header тоже должен показывать его, иначе рассинхрон с timeline.
            const plannerScenario = firstPlannedMeal.scenario;
            const plannerScenarioSource = firstPlannedMeal.scenarioSource;
            const plannerOwnsScenario = plannerScenarioSource === 'planner' || plannerScenarioSource === 'planner_light';
            if (plannerScenario && plannerOwnsScenario && plannerScenario !== contextAnalysis.scenario) {
                console.info(`${LOG_PREFIX} [MEALREC.planner] 🔄 Scenario sync: header ${contextAnalysis.scenario} → ${plannerScenario} (source: ${plannerScenarioSource}, planner авторитетен для конкретного meal)`);
                contextAnalysis.scenario = plannerScenario;
                contextAnalysis.icon = SCENARIO_ICONS[plannerScenario] || contextAnalysis.icon;
                contextAnalysis.scenarioSyncedToPlanner = true;
            }
        }

        const result = {
            available: true,
            scenario: contextAnalysis.scenario,
            scenarioIcon: contextAnalysis.icon,
            scenarioReason: contextAnalysis.reason,
            timing: timingRec,
            macros: macrosRec,
            // v3.1: Support both grouped and flat modes
            mode,
            suggestions,
            groups,
            reasoning,
            confidence: 0.75, // Base confidence, will be enhanced below
            method: 'context_engine', // Context-aware pipeline
            version: '3.6', // v3.6.0: wave-aware timing + timing sync after planner
            // 🆕 Multi-meal plan
            mealsPlan: mealsPlan?.available ? mealsPlan : null
        };

        result.planState = buildAdaptivePlanState(mealsPlan, previousPlanState, replanReason, plannerMeta);
        result.explain = buildReplanExplain(replanReason, previousPlanState, mealsPlan, plannerMeta);
        result.replanMeta = plannerMeta;

        // MEALREC / impact: show what pattern modifiers were actually applied in this recommendation
        if (patternImpact.length > 0) {
            console.group(`${LOG_PREFIX} [MEALREC / impact] ✅ Pattern → recommendation impact (${patternImpact.length})`);
            console.table(patternImpact);
            console.groupEnd();

            // Compact summary string for quick scanning (without expanding tables)
            const impactSummary = patternImpact.map(i => {
                if (i.area === 'timing') return `⏰ ${i.before} → ${i.after}`;
                if (i.area === 'macros') return `🍽️ ${i.before} → ${i.after}`;
                if (i.area === 'productPicker') return `🛒 ${i.before} → ${i.after}`;
                return `${i.pattern}: ${i.before} → ${i.after}`;
            }).join(' | ');
            console.info(`${LOG_PREFIX} [MEALREC / impact] 📋 Summary: ${impactSummary}`);
        } else {
            console.info(`${LOG_PREFIX} [MEALREC / impact] ⚠️ No pattern modifiers applied (insufficient data or neutral scores)`);
        }

        // Attach pattern impact to result for downstream UI display
        result.insights = result.insights || {};
        result.insights.patternImpact = patternImpact;

        // R2.6: Deep Insights Integration (pattern scores + phenotype + dynamic confidence)
        let enhanced = result;
        if (HEYS.InsightsPI?.mealRecPatterns && days.length >= 7) {
            try {
                enhanced = HEYS.InsightsPI.mealRecPatterns.enhanceRecommendation(
                    contextAnalysis,
                    result,
                    days,
                    profile,
                    pIndex,
                    thresholds
                );
                console.info(`${LOG_PREFIX} ✅ Enhanced with Deep Insights:`, {
                    confidenceBase: result.confidence,
                    confidenceEnhanced: enhanced.confidence,
                    patternsUsed: enhanced.insights?.patternScores ? Object.keys(enhanced.insights.patternScores).length : 0,
                    phenotypeApplied: enhanced.insights?.phenotypeApplied || false
                });

                // Preserve direct phase-A impact trace in insights
                enhanced.insights = {
                    ...(enhanced.insights || {}),
                    patternImpact,
                };
            } catch (err) {
                console.warn(`${LOG_PREFIX} ⚠️ Failed to enhance with patterns:`, err.message);
                // Fallback to base result
            }
        }

        if (!enhanced.insights) enhanced.insights = {};
        if (!enhanced.insights.patternImpact) enhanced.insights.patternImpact = patternImpact;

        // R2.7: ML Feedback Adjustment (user feedback learning)
        if (HEYS.InsightsPI?.mealRecFeedback) {
            try {
                const adjustmentFactor = HEYS.InsightsPI.mealRecFeedback.calculateAdjustmentFactor(
                    enhanced.scenario
                );
                if (adjustmentFactor !== 1.0) {
                    const confidenceBefore = enhanced.confidence;
                    enhanced.confidence = Math.max(0.3, Math.min(1.0, enhanced.confidence * adjustmentFactor));
                    console.info(`${LOG_PREFIX} ✅ Applied ML Feedback adjustment:`, {
                        scenario: enhanced.scenario,
                        adjustmentFactor: adjustmentFactor.toFixed(2),
                        confidenceBefore: confidenceBefore.toFixed(2),
                        confidenceAfter: enhanced.confidence.toFixed(2)
                    });
                }
            } catch (err) {
                console.warn(`${LOG_PREFIX} ⚠️ Failed to apply feedback adjustment:`, err.message);
            }
        }

        console.info(`${LOG_PREFIX} ✅ Recommendation generated:`, {
            scenario: enhanced.scenario,
            timingIdeal: enhanced.timing?.ideal,
            macrosKcal: enhanced.macros?.kcal,
            mode: enhanced.mode,
            suggestionsCount: enhanced.suggestions?.length || 0,
            groupsCount: enhanced.groups?.length || 0,
            confidence: enhanced.confidence
        });

        return enhanced;
    }

    /**
     * Load pattern hints (Phase A + B: 10 patterns total)
     * Phase A (Core): C01, C02, C15, C34, C35, C37
     * Phase B (Context): C06, C14, C10, C12
     * @private
     */
    function loadPatternHints(days, profile, pIndex) {
        if (!Array.isArray(days) || days.length < 7 || !HEYS.InsightsPI?.patterns) {
            return null;
        }

        const patterns = HEYS.InsightsPI.patterns;
        const hints = {};

        const normalize = (score) => {
            const s = Number(score);
            if (!Number.isFinite(s)) return 0.5;
            return s > 1 ? Math.max(0, Math.min(1, s / 100)) : Math.max(0, Math.min(1, s));
        };

        try {
            const mealTiming = patterns.analyzeMealTiming?.(days, profile, pIndex);
            if (mealTiming?.available) {
                hints.mealTiming = {
                    score: normalize(mealTiming.score),
                    avgGapMinutes: mealTiming.avgGapMinutes,
                    idealGapMinutes: mealTiming.idealGapMinutes,
                    overlapCount: mealTiming.overlapCount || 0,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase A hint failed: mealTiming`, err.message);
        }

        try {
            const waveOverlap = patterns.analyzeWaveOverlap?.(days, profile);
            if (waveOverlap?.available) {
                hints.waveOverlap = {
                    score: normalize(waveOverlap.score),
                    overlapCount: waveOverlap.overlapCount || 0,
                    avgOverlapPct: waveOverlap.avgOverlapPct || 0,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase A hint failed: waveOverlap`, err.message);
        }

        try {
            const insulinSensitivity = patterns.analyzeInsulinSensitivity?.(days, pIndex, profile);
            if (insulinSensitivity?.available) {
                hints.insulinSensitivity = {
                    score: normalize(insulinSensitivity.score),
                    avgGI: insulinSensitivity.avgGI,
                    avgFiberPer1000: insulinSensitivity.avgFiberPer1000,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase A hint failed: insulinSensitivity`, err.message);
        }

        try {
            const glycemicLoad = patterns.analyzeGlycemicLoad?.(days, pIndex);
            if (glycemicLoad?.available) {
                hints.glycemicLoad = {
                    score: normalize(glycemicLoad.score),
                    avgDailyGL: glycemicLoad.avgDailyGL,
                    avgEveningRatio: glycemicLoad.avgEveningRatio,
                    dailyClass: glycemicLoad.dailyClass,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase A hint failed: glycemicLoad`, err.message);
        }

        try {
            const proteinDistribution = patterns.analyzeProteinDistribution?.(days, profile, pIndex);
            if (proteinDistribution?.available) {
                hints.proteinDistribution = {
                    score: normalize(proteinDistribution.score),
                    distributionScore: proteinDistribution.distributionScore,
                    subthresholdMeals: proteinDistribution.subthresholdMeals,
                    excessMeals: proteinDistribution.excessMeals,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase A hint failed: proteinDistribution`, err.message);
        }

        try {
            const addedSugar = patterns.analyzeAddedSugarDependency?.(days, pIndex);
            if (addedSugar?.available) {
                hints.addedSugarDependency = {
                    score: normalize(addedSugar.score),
                    avgDailySugar: addedSugar.avgDailySugar,
                    maxStreak: addedSugar.maxStreak,
                    dependencyRisk: !!addedSugar.dependencyRisk,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase A hint failed: addedSugarDependency`, err.message);
        }

        // === PHASE B: CONTEXT MODIFIERS (4 patterns) ===

        // C06: Sleep → Hunger (poor sleep recovery modifier)
        try {
            const sleepHunger = patterns.analyzeSleepHunger?.(days, profile, pIndex);
            if (sleepHunger?.available) {
                hints.sleepHunger = {
                    score: normalize(sleepHunger.score),
                    correlation: sleepHunger.correlation || 0,
                    poorSleepDays: sleepHunger.poorSleepDays || 0,
                    lagEffect: sleepHunger.lagEffect || 0,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase B hint failed: sleepHunger`, err.message);
        }

        // C14: Nutrient Timing (PRE/POST workout fine-tuning)
        try {
            const nutrientTiming = patterns.analyzeNutrientTiming?.(days, pIndex, profile);
            if (nutrientTiming?.available) {
                hints.nutrientTiming = {
                    score: normalize(nutrientTiming.score),
                    carbTimingScore: nutrientTiming.carbTimingScore || 0,
                    proteinTimingScore: nutrientTiming.proteinTimingScore || 0,
                    optimalWindow: nutrientTiming.optimalWindow || 'N/A',
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase B hint failed: nutrientTiming`, err.message);
        }

        // C10: Fiber Regularity (product picker fiber boost)
        try {
            const fiberRegularity = patterns.analyzeFiberRegularity?.(days, pIndex);
            if (fiberRegularity?.available) {
                hints.fiberRegularity = {
                    score: normalize(fiberRegularity.score),
                    avgFiberG: fiberRegularity.avgFiberG || 0,
                    targetFiberG: fiberRegularity.targetFiberG || 25,
                    fiberPer1000: fiberRegularity.fiberPer1000 || 0,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase B hint failed: fiberRegularity`, err.message);
        }

        // C12: Mood ↔ Food (STRESS_EATING enhancement)
        try {
            const optimum = profile?.optimum || 2000;
            const moodFood = patterns.analyzeMoodFood?.(days, pIndex, optimum);
            if (moodFood?.available) {
                hints.moodFood = {
                    score: normalize(moodFood.score),
                    correlation: moodFood.correlation || 0,
                    bestFoods: moodFood.bestFoods || [],
                    worstFoods: moodFood.worstFoods || [],
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase B hint failed: moodFood`, err.message);
        }

        // === PHASE C: MICRONUTRIENT INTELLIGENCE (2 patterns) ===

        // C26: Micronutrient Radar (product boost for Fe/Mg/Zn/Ca deficit)
        try {
            const micronutrients = patterns.analyzeMicronutrients?.(days, pIndex, profile);
            if (micronutrients?.available) {
                hints.micronutrients = {
                    score: normalize(micronutrients.score),
                    deficits: micronutrients.deficits || [],
                    avgIntake: micronutrients.avgIntake || {},
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase C hint failed: micronutrients`, err.message);
        }

        // C29: NOVA Quality (penalty for ultra-processed)
        try {
            const novaQuality = patterns.analyzeNOVAQuality?.(days, pIndex);
            if (novaQuality?.available) {
                hints.novaQuality = {
                    score: normalize(novaQuality.score),
                    nova4SharePct: novaQuality.nova4SharePct || 0,
                    avgNOVA: novaQuality.avgNOVA || 2.5,
                };
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Phase C hint failed: novaQuality`, err.message);
        }

        const keys = Object.keys(hints);
        if (keys.length > 0) {
            const phaseACount = ['mealTiming', 'waveOverlap', 'insulinSensitivity', 'glycemicLoad', 'proteinDistribution', 'addedSugarDependency'].filter(k => hints[k]).length;
            const phaseBCount = ['sleepHunger', 'nutrientTiming', 'fiberRegularity', 'moodFood'].filter(k => hints[k]).length;
            const phaseCCount = ['micronutrients', 'novaQuality'].filter(k => hints[k]).length;
            console.group(`${LOG_PREFIX} [MEALREC / patterns] ✅ Pattern hints loaded: ${keys.length} (A:${phaseACount}, B:${phaseBCount}, C:${phaseCCount})`);
            console.table(keys.map((k) => ({ pattern: k, score: hints[k].score, ...hints[k] })));
            console.groupEnd();
            return hints;
        }

        return null;
    }

    /**
     * Calculate optimal meal timing (threshold-aware v2.4, wave-aware v4.0.6)
     * @private
     */
    function calculateOptimalTiming(currentTime, lastMeal, training, sleepTarget, thresholds, patternHints, patternImpact = []) {
        // P0 Fix: Check if lastMeal actually exists (not empty object)
        const hasLastMeal = lastMeal && lastMeal.time;
        const lastMealTime = hasLastMeal ? parseTime(lastMeal.time) : 0;
        const hoursSinceLastMeal = hasLastMeal ? Math.max(0, currentTime - lastMealTime) : 0;

        // v4.0.6: Calculate insulin wave end time for timing constraint
        let waveEndHours = null;
        const FAT_BURN_WINDOW_HOURS = 0.5; // 30 min fat burn after wave ends
        if (hasLastMeal && HEYS.InsulinWave?.calculate) {
            try {
                const waveData = HEYS.InsulinWave.calculate({
                    lastMealTime: lastMeal.time,
                    nutrients: {
                        kcal: lastMeal.totals?.kcal || 0,
                        protein: lastMeal.totals?.prot || lastMeal.totals?.protein || 0,
                        carbs: lastMeal.totals?.carbs || 0,
                        fat: lastMeal.totals?.fat || 0,
                        glycemicLoad: lastMeal.totals?.glycemicLoad || 0
                    },
                    profile: null, // minimal call — profile not always available here
                    baseWaveHours: 3
                });
                if (waveData?.duration) {
                    waveEndHours = lastMealTime + waveData.duration / 60;
                    console.info(`${LOG_PREFIX} [MEALREC / timing] 🌊 Insulin wave constraint:`, {
                        lastMeal: lastMeal.time,
                        waveDuration: waveData.duration + 'min',
                        waveEnd: formatTime(waveEndHours),
                        waveRemaining: waveData.remaining + 'min',
                        fatBurnEnd: formatTime(waveEndHours + FAT_BURN_WINDOW_HOURS)
                    });
                }
            } catch (err) {
                console.warn(`${LOG_PREFIX} [MEALREC / timing] ⚠️ InsulinWave calc failed:`, err.message);
            }
        }

        // Adaptive meal gap (v2.4)
        const idealGapMin = thresholds?.idealMealGapMin || 240; // fallback 4h
        const idealGapHours = idealGapMin / 60;
        const minGap = idealGapHours * 0.75; // 75% of ideal
        const maxGap = idealGapHours * 1.25; // 125% of ideal

        // Base time for calculations (currentTime if first meal, lastMealTime otherwise)
        const baseTime = hasLastMeal ? lastMealTime : currentTime;

        let idealStart, idealEnd, reason;

        // Special case: First meal of day
        if (!hasLastMeal) {
            idealStart = currentTime;
            idealEnd = currentTime + 1;
            reason = `Первый прием дня — можешь начать сейчас`;
            console.info(`[${LOG_FILTER}] ⏰ First meal timing:`, { idealStart, idealEnd, currentTime });
            return {
                ideal: `${formatTime(idealStart)}-${formatTime(idealEnd)}`,
                idealStart,
                idealEnd,
                currentTime,
                hoursSinceLastMeal: 0,
                reason
            };
        }

        // Phase A: C01/C02 timing adjustments (small, safe deltas)
        let phaseATimingShiftMin = 0;
        if (patternHints?.mealTiming?.score !== undefined && patternHints.mealTiming.score < 0.45) {
            phaseATimingShiftMin += 20;
        }
        if (patternHints?.waveOverlap?.avgOverlapPct !== undefined && patternHints.waveOverlap.avgOverlapPct > 25) {
            phaseATimingShiftMin += 20;
        }
        if (phaseATimingShiftMin > 0) {
            console.info(`${LOG_PREFIX} [MEALREC / timing] 🧮 Phase A timing modifier:`, {
                shiftMinutes: phaseATimingShiftMin,
                mealTimingScore: patternHints?.mealTiming?.score,
                waveOverlapPct: patternHints?.waveOverlap?.avgOverlapPct,
            });
        }

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
                idealStart = baseTime + idealGapHours;
                idealEnd = baseTime + maxGap;
                reason = `Оптимальный gap ${Math.round(idealGapMin)}мин после последнего приёма`;
            }
        } else {
            // No training nearby — standard meal timing
            idealStart = baseTime + idealGapHours;
            idealEnd = baseTime + maxGap;
            reason = `Оптимальный gap ${Math.round(idealGapMin)}мин`;
        }

        if (phaseATimingShiftMin > 0) {
            idealStart += phaseATimingShiftMin / 60;
            idealEnd += phaseATimingShiftMin / 60;
            reason += ` (Phase A: +${phaseATimingShiftMin}мин из C01/C02)`;
            patternImpact.push({
                pattern: 'C01/C02',
                area: 'timing',
                before: `${formatTime(idealStart - phaseATimingShiftMin / 60)}-${formatTime(idealEnd - phaseATimingShiftMin / 60)}`,
                after: `${formatTime(idealStart)}-${formatTime(idealEnd)}`,
                reason: `Shift +${phaseATimingShiftMin}min (mealTiming/waveOverlap)`
            });
        }

        // v4.0.6: Enforce insulin wave constraint — don't suggest eating during active wave
        if (waveEndHours !== null) {
            const waveConstraintEnd = waveEndHours + FAT_BURN_WINDOW_HOURS;
            if (idealStart < waveConstraintEnd) {
                const prevStart = idealStart;
                idealStart = waveConstraintEnd;
                idealEnd = Math.max(idealEnd, idealStart + 0.5);
                reason = `Ждём конец инсулиновой волны + жиросжигание (${formatTime(waveEndHours)})`;
                console.info(`${LOG_PREFIX} [MEALREC / timing] 🌊 Wave constraint applied:`, {
                    prevStart: formatTime(prevStart),
                    waveEnd: formatTime(waveEndHours),
                    fatBurnEnd: formatTime(waveConstraintEnd),
                    newIdealStart: formatTime(idealStart),
                    newIdealEnd: formatTime(idealEnd)
                });
                patternImpact.push({
                    pattern: 'InsulinWave',
                    area: 'timing',
                    before: formatTime(prevStart),
                    after: formatTime(idealStart),
                    reason: `Wave ends ${formatTime(waveEndHours)} + 30min fat burn`
                });
            }
        }

        // P0 Fix: Ensure timing never in past
        if (idealStart < currentTime) {
            const phaseAOverridden = phaseATimingShiftMin > 0;
            console.warn(`[${LOG_FILTER}] ⚠️ Adjusted timing to current time (was in past):`, {
                originalStart: formatTime(idealStart),
                adjustedStart: formatTime(currentTime),
                hoursSinceLastMeal: hoursSinceLastMeal.toFixed(1),
                phaseAShiftWastedMin: phaseAOverridden ? phaseATimingShiftMin : 0,
                note: phaseAOverridden ? 'Phase A shift был применён но затёрся currentTime guard — пользователь зашёл позже optimal' : undefined
            });
            idealStart = currentTime;
            idealEnd = Math.max(idealEnd, currentTime + 0.5);
            reason = `Сейчас — оптимальное время (прошло ${hoursSinceLastMeal.toFixed(1)}ч)`;
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
    function calculateOptimalMacros(contextAnalysis, dayTarget, dayEaten, training, profile, timingRec, patternHints, patternImpact = []) {
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

        console.info(`${LOG_PREFIX} 📊 Remaining today:`, {
            kcal: remainingKcal,
            protein: remainingProtein,
            carbs: remainingCarbs,
            scenario
        });

        // Estimate meals remaining today
        const hoursUntilSleep = timingRec.idealStart ? (parseTime('23:00') - timingRec.idealStart) : 8;
        const mealsRemaining = Math.max(1, Math.floor(hoursUntilSleep / 4));
        console.info(`${LOG_PREFIX} ⏱️ Meals remaining estimate:`, {
            hoursUntilSleep: Math.round(hoursUntilSleep * 10) / 10,
            mealsRemaining,
            avgKcalPerMeal: mealsRemaining > 0 ? Math.round(remainingKcal / mealsRemaining) : 0
        });

        // v3.2.0: Last meal override — if this is the LAST meal with substantial budget remaining,
        // ignore scenario caps and use actual remaining budget (with 10% buffer for flexibility)
        const isLastMeal = mealsRemaining === 1 && remainingKcal > 300;
        const lastMealKcalTarget = isLastMeal ? Math.round(remainingKcal * 0.90) : null;
        if (isLastMeal) {
            console.info(`${LOG_PREFIX} 🎯 LAST MEAL OVERRIDE detected:`, {
                remainingKcal,
                targetKcal: lastMealKcalTarget,
                reason: `Last meal of day with ${remainingKcal} kcal remaining — using 90% of budget instead of scenario cap`
            });
        }

        let mealKcal, mealProtein, mealCarbs, mealFat;
        let macroStrategy = ''; // For detailed logging

        // Scenario-specific macro strategies (v3.2.0: with last meal override)
        switch (scenario) {
            case SCENARIOS.GOAL_REACHED:
                // No meal recommended
                mealKcal = 0;
                mealProtein = 0;
                mealCarbs = 0;
                mealFat = 0;
                macroStrategy = 'Goal reached - no meal recommended';
                break;

            case SCENARIOS.LIGHT_SNACK:
                // Small snack: 50-150 kcal (or last meal override)
                mealKcal = lastMealKcalTarget || Math.min(remainingKcal, 150);
                if (isLastMeal) {
                    // R4: use actual remaining protein need — avoids P5-cap trigger
                    mealProtein = Math.round(Math.min(remainingProtein, 100));
                    const _protKcalLS = mealProtein * 3;
                    const _restKcalLS = Math.max(0, mealKcal - _protKcalLS);
                    mealCarbs = Math.round(_restKcalLS * 0.57 / 4); // 57% of rest (original 40:30 carbs:fat)
                    mealFat = Math.max(5, Math.round((_restKcalLS - mealCarbs * 4) / 9));
                    macroStrategy = `Last meal: ${mealKcal} kcal (90% of ${remainingKcal} remaining), protein=${mealProtein}g (actual need from ${Math.round(remainingProtein)}g deficit), carbs+fat fill rest`;
                } else {
                    mealProtein = Math.round(mealKcal * 0.3 / 3); // 30% from protein
                    mealCarbs = Math.round(mealKcal * 0.4 / 4); // 40% from carbs
                    mealFat = Math.round(mealKcal * 0.3 / 9); // 30% from fat
                    macroStrategy = 'Light snack: max 150 kcal, 30% protein, 40% carbs, 30% fat';
                }
                break;

            case SCENARIOS.LATE_EVENING:
                // Light evening meal: max 200 kcal, high protein (slow digestion) — OR last meal override
                mealKcal = lastMealKcalTarget || Math.min(remainingKcal, 200);
                if (isLastMeal) {
                    // R4: use actual remaining protein need — avoids P5-cap trigger
                    mealProtein = Math.round(Math.min(remainingProtein, 100));
                    const _protKcalLE = mealProtein * 3;
                    const _restKcalLE = Math.max(0, mealKcal - _protKcalLE);
                    // Evening: low carbs, moderate fat for slow digestion (original 20:20 = 1:1)
                    mealCarbs = Math.round(_restKcalLE * 0.50 / 4); // 50% of rest
                    mealFat = Math.max(5, Math.round((_restKcalLE - mealCarbs * 4) / 9));
                    macroStrategy = `Last meal: ${mealKcal} kcal (90% of ${remainingKcal} remaining), protein=${mealProtein}g (actual need from ${Math.round(remainingProtein)}g deficit), evening carbs+fat fill rest`;
                } else {
                    mealProtein = Math.round(mealKcal * 0.6 / 3); // 60% from protein (casein)
                    mealCarbs = Math.round(mealKcal * 0.2 / 4); // 20% from carbs
                    mealFat = Math.round(mealKcal * 0.2 / 9); // 20% from fat
                    macroStrategy = 'Late evening: max 200 kcal (sleep quality), 60% protein (casein), 20% carbs, 20% fat';
                }
                break;

            case SCENARIOS.PRE_WORKOUT:
                // Pre-workout: max 300 kcal, high carbs for energy (or last meal override)
                mealKcal = lastMealKcalTarget || Math.min(remainingKcal, 300);
                if (isLastMeal) {
                    // R4: use actual remaining protein need — avoids P5-cap trigger
                    mealProtein = Math.round(Math.min(remainingProtein, 100));
                    const _protKcalPre = mealProtein * 3;
                    const _restKcalPre = Math.max(0, mealKcal - _protKcalPre);
                    // Pre-workout: carbs dominant for glycogen (original 60:15 = 4:1)
                    mealCarbs = Math.round(_restKcalPre * 0.80 / 4); // 80% of rest
                    mealFat = Math.max(5, Math.round((_restKcalPre - mealCarbs * 4) / 9));
                    macroStrategy = `Last meal: ${mealKcal} kcal (90% of ${remainingKcal} remaining), protein=${mealProtein}g (actual need from ${Math.round(remainingProtein)}g deficit), glycogen carbs fill rest`;
                } else {
                    mealProtein = Math.round(mealKcal * 0.25 / 3); // 25% from protein
                    mealCarbs = Math.round(mealKcal * 0.60 / 4); // 60% from carbs (fast)
                    mealFat = Math.round(mealKcal * 0.15 / 9); // 15% from fat
                    macroStrategy = 'Pre-workout: max 300 kcal, 60% fast carbs, 25% protein, 15% fat';
                }
                break;

            case SCENARIOS.POST_WORKOUT:
                // Post-workout: max 400 kcal, high protein + carbs (or last meal override)
                mealKcal = lastMealKcalTarget || Math.min(remainingKcal, 400);
                if (isLastMeal) {
                    // R1 fix (Sprint 6): use actual remaining protein need — avoids P5-cap trigger
                    // Physiological ceiling: Areta et al., 2013 — ~100g absorbed per meal
                    mealProtein = Math.round(Math.min(remainingProtein, 100));
                    const _protKcalPW = mealProtein * 3;
                    const _restKcalPW = Math.max(0, mealKcal - _protKcalPW);
                    mealCarbs = Math.round(_restKcalPW * 0.75 / 4); // 75% of rest (glycogen priority, original 45:15 = 3:1 ratio)
                    mealFat = Math.max(5, Math.round((_restKcalPW - mealCarbs * 4) / 9));
                    macroStrategy = `Last meal: ${mealKcal} kcal (90% of ${remainingKcal} remaining), protein=${mealProtein}g (actual need from ${Math.round(remainingProtein)}g deficit), glycogen carbs fill rest`;
                } else {
                    mealProtein = Math.round(mealKcal * 0.40 / 3); // 40% from protein (recovery)
                    mealCarbs = Math.round(mealKcal * 0.45 / 4); // 45% from carbs (glycogen)
                    mealFat = Math.round(mealKcal * 0.15 / 9); // 15% from fat
                    macroStrategy = 'Post-workout: max 400 kcal, 40% protein (recovery), 45% carbs (glycogen), 15% fat';
                }
                break;

            case SCENARIOS.PROTEIN_DEFICIT:
                // High protein meal: max 300 kcal (or last meal override)
                mealKcal = lastMealKcalTarget || Math.min(remainingKcal, 300);
                if (isLastMeal) {
                    // R1 fix (Sprint 6): use actual remaining protein need — avoids P5-cap trigger
                    // Physiological ceiling: Areta et al., 2013 — ~100g absorbed per meal
                    mealProtein = Math.round(Math.min(remainingProtein, 100));
                    const _protKcalPD = mealProtein * 3;
                    const _restKcalPD = Math.max(0, mealKcal - _protKcalPD);
                    mealCarbs = Math.round(_restKcalPD * 0.60 / 4); // 60% of rest (original 30:20 carbs:fat ratio)
                    mealFat = Math.max(5, Math.round((_restKcalPD - mealCarbs * 4) / 9));
                    macroStrategy = `Last meal: ${mealKcal} kcal (90% of ${remainingKcal} remaining), protein=${mealProtein}g (actual need from ${Math.round(remainingProtein)}g deficit), carbs+fat fill rest`;
                } else {
                    mealProtein = Math.round(mealKcal * 0.50 / 3); // 50% from protein
                    mealCarbs = Math.round(mealKcal * 0.30 / 4); // 30% from carbs
                    mealFat = Math.round(mealKcal * 0.20 / 9); // 20% from fat
                    macroStrategy = 'Protein deficit: max 300 kcal, 50% protein, 30% carbs, 20% fat';
                }
                break;

            case SCENARIOS.STRESS_EATING:
                // Comfort food (healthy): max 250 kcal, balanced with omega-3 (or last meal override)
                mealKcal = lastMealKcalTarget || Math.min(remainingKcal, 250);
                if (isLastMeal) {
                    // R1 fix (Sprint 6): use actual remaining protein need — avoids P5-cap trigger
                    mealProtein = Math.round(Math.min(remainingProtein, 100));
                    const _protKcalSE = mealProtein * 3;
                    const _restKcalSE = Math.max(0, mealKcal - _protKcalSE);
                    mealCarbs = Math.round(_restKcalSE * 0.57 / 4); // 57% of rest (carbs:fat ≈ 4:3, original serotonin+omega3)
                    mealFat = Math.max(5, Math.round((_restKcalSE - mealCarbs * 4) / 9));
                    macroStrategy = `Last meal: ${mealKcal} kcal (90% of ${remainingKcal} remaining), protein=${mealProtein}g (actual need from ${Math.round(remainingProtein)}g deficit), serotonin+omega-3 carbs/fat fill rest`;
                } else {
                    mealProtein = Math.round(mealKcal * 0.30 / 3); // 30% from protein
                    mealCarbs = Math.round(mealKcal * 0.40 / 4); // 40% from carbs (serotonin)
                    mealFat = Math.round(mealKcal * 0.30 / 9); // 30% from fat (omega-3)
                    macroStrategy = 'Stress eating: max 250 kcal, 40% carbs (serotonin), 30% protein, 30% fat (omega-3)';
                }
                break;

            case SCENARIOS.BALANCED:
            default:
                // Standard balanced meal
                mealKcal = Math.round(remainingKcal / mealsRemaining);
                mealProtein = Math.round(remainingProtein / mealsRemaining);
                mealCarbs = Math.round(remainingCarbs / mealsRemaining);
                mealFat = Math.max(0, Math.round((mealKcal - mealProtein * 3 - mealCarbs * 4) / 9));
                macroStrategy = `Balanced: split remaining evenly across ${mealsRemaining} meal(s)`;
                break;
        }

        const beforePhenotype = {
            kcal: mealKcal,
            protein: mealProtein,
            carbs: mealCarbs,
            fat: mealFat,
            percentages: {
                proteinPct: mealKcal > 0 ? Math.round((mealProtein * 3 / mealKcal) * 100) : 0,
                carbsPct: mealKcal > 0 ? Math.round((mealCarbs * 4 / mealKcal) * 100) : 0,
                fatPct: mealKcal > 0 ? Math.round((mealFat * 9 / mealKcal) * 100) : 0
            }
        };

        console.group(`${LOG_PREFIX} 🍽️ Macro strategy: [${scenario}] ${macroStrategy}`);
        console.table([beforePhenotype]);
        console.groupEnd();

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

        // Phase B: C06 Sleep→Hunger modifier (poor sleep recovery → more protein, less simple carbs)
        if (patternHints?.sleepHunger?.score !== undefined && patternHints.sleepHunger.score < 0.5 && scenario === SCENARIOS.BALANCED) {
            const before = { protein: mealProtein, carbs: mealCarbs };
            mealProtein = Math.round(mealProtein * 1.12); // +12% protein
            mealCarbs = Math.round(mealCarbs * 0.92); // -8% carbs (reduce simple carbs craving)
            console.info(`${LOG_PREFIX} [MEALREC / macros] 🧮 Phase B C06 (poor sleep recovery):`, {
                scenario,
                sleepHungerScore: patternHints.sleepHunger.score,
                proteinBefore: before.protein,
                proteinAfter: mealProtein,
                carbsBefore: before.carbs,
                carbsAfter: mealCarbs
            });
            patternImpact.push({
                pattern: 'C06',
                area: 'macros',
                before: `P${before.protein}/C${before.carbs}`,
                after: `P${mealProtein}/C${mealCarbs}`,
                reason: `sleepHunger=${patternHints.sleepHunger.score} (poor sleep recovery)`
            });
        }

        // Phase B: C14 Nutrient Timing fine-tuning for PRE/POST WORKOUT
        if (patternHints?.nutrientTiming && (scenario === SCENARIOS.PRE_WORKOUT || scenario === SCENARIOS.POST_WORKOUT)) {
            const carbTiming = patternHints.nutrientTiming.carbTimingScore || 0;
            const proteinTiming = patternHints.nutrientTiming.proteinTimingScore || 0;
            const before = { protein: mealProtein, carbs: mealCarbs };

            // Good carb timing → can increase carbs slightly for PRE
            if (scenario === SCENARIOS.PRE_WORKOUT && carbTiming > 0.7) {
                mealCarbs = Math.round(mealCarbs * 1.08);
            }

            // Poor protein timing → increase protein for POST
            if (scenario === SCENARIOS.POST_WORKOUT && proteinTiming < 0.5) {
                mealProtein = Math.round(mealProtein * 1.1);
            }

            if (before.protein !== mealProtein || before.carbs !== mealCarbs) {
                console.info(`${LOG_PREFIX} [MEALREC / macros] 🧮 Phase B C14 (nutrient timing):`, {
                    scenario,
                    carbTimingScore: carbTiming,
                    proteinTimingScore: proteinTiming,
                    delta: `P ${before.protein}→${mealProtein}, C ${before.carbs}→${mealCarbs}`
                });
                patternImpact.push({
                    pattern: 'C14',
                    area: 'macros',
                    before: `P${before.protein}/C${before.carbs}`,
                    after: `P${mealProtein}/C${mealCarbs}`,
                    reason: `nutrientTiming: carb=${carbTiming}, protein=${proteinTiming}`
                });
            }
        }

        // Phase B: C12 Mood↔Food enhancement for STRESS_EATING
        if (patternHints?.moodFood && scenario === SCENARIOS.STRESS_EATING) {
            const moodCorr = Math.abs(patternHints.moodFood.correlation || 0);
            const before = { protein: mealProtein, carbs: mealCarbs };

            // Strong mood-food correlation → optimize for serotonin boost (complex carbs + omega-3)
            if (moodCorr > 0.4) {
                mealCarbs = Math.round(mealCarbs * 1.1); // +10% carbs (complex for serotonin)
                mealProtein = Math.round(mealProtein * 1.05); // +5% protein (amino acids)
                console.info(`${LOG_PREFIX} [MEALREC / macros] 🧮 Phase B C12 (mood-food):`, {
                    scenario,
                    moodCorrelation: moodCorr,
                    delta: `P ${before.protein}→${mealProtein}, C ${before.carbs}→${mealCarbs}`
                });
                patternImpact.push({
                    pattern: 'C12',
                    area: 'macros',
                    before: `P${before.protein}/C${before.carbs}`,
                    after: `P${mealProtein}/C${mealCarbs}`,
                    reason: `moodFood correlation=${moodCorr} (serotonin optimization)`
                });
            }
        }

        // Phase A: C15 + C35 macro tuning
        if (patternHints?.insulinSensitivity?.score !== undefined || patternHints?.proteinDistribution?.score !== undefined) {
            const before = { protein: mealProtein, carbs: mealCarbs, fat: mealFat };

            // C15: insulin sensitivity low -> lower carbs, increase protein slightly
            // Sprint 6 R3: skip protein boost for isLastMeal (protein already set from remainingProtein)
            if (patternHints?.insulinSensitivity?.score < 0.45) {
                mealCarbs = Math.round(mealCarbs * 0.9);
                if (!isLastMeal) {
                    mealProtein = Math.round(mealProtein * 1.08);
                }
            }

            // C35: poor protein distribution -> stronger scenario-aware protein push
            // Sprint 6 R3: skip protein boost for isLastMeal — protein already set from remainingProtein (R1 fix)
            const proteinDistributionScore = patternHints?.proteinDistribution?.score;
            if (proteinDistributionScore !== undefined && mealProtein > 0 && !isLastMeal) {
                let c35Multiplier = 1.0;
                if (proteinDistributionScore < 0.35) c35Multiplier = 1.20;
                else if (proteinDistributionScore < 0.5) c35Multiplier = 1.12;

                if (c35Multiplier > 1.0) {
                    if (scenario === SCENARIOS.PROTEIN_DEFICIT) c35Multiplier += 0.05;
                    if (scenario === SCENARIOS.POST_WORKOUT) c35Multiplier += 0.03;
                    if (scenario === SCENARIOS.LATE_EVENING) c35Multiplier += 0.02;

                    // Cap multiplier for safety
                    c35Multiplier = Math.min(c35Multiplier, 1.3);
                    mealProtein = Math.round(mealProtein * c35Multiplier);
                }
            } else if (isLastMeal && proteinDistributionScore !== undefined) {
                // R3: log that C35 was intentionally skipped for last meal
                console.info(`${LOG_PREFIX} [MEALREC / macros] ✅ R3: C35 protein boost skipped (isLastMeal=true, protein already from remainingProtein: ${mealProtein}g)`);
            }

            // Recompute fat to maintain kcal budget approximation
            mealFat = Math.max(0, Math.round((mealKcal - mealProtein * 3 - mealCarbs * 4) / 9));

            console.info(`${LOG_PREFIX} [MEALREC / macros] ✅ Phase A macro modifiers applied:`, {
                scenario,
                before,
                after: { protein: mealProtein, carbs: mealCarbs, fat: mealFat },
                insulinSensitivityScore: patternHints?.insulinSensitivity?.score,
                proteinDistributionScore: patternHints?.proteinDistribution?.score,
            });

            patternImpact.push({
                pattern: 'C15/C35',
                area: 'macros',
                before: `P${before.protein}/C${before.carbs}/F${before.fat}`,
                after: `P${mealProtein}/C${mealCarbs}/F${mealFat}`,
                reason: `insulin=${patternHints?.insulinSensitivity?.score ?? 'n/a'}, proteinDist=${patternHints?.proteinDistribution?.score ?? 'n/a'}`
            });
        }

        // P5 fix (v3.3.1): Physiological protein cap — max 100g absorbed per meal (Areta et al., 2013)
        const PROTEIN_CAP_PER_MEAL_G = 100;
        if (mealProtein > PROTEIN_CAP_PER_MEAL_G) {
            const cappedFrom = mealProtein;
            const protDeltaG = cappedFrom - PROTEIN_CAP_PER_MEAL_G;
            mealProtein = PROTEIN_CAP_PER_MEAL_G;
            // Transfer excess protein kcal to carbs (protein 3kcal/g → carbs 4kcal/g → 0.75 carb equivalent)
            mealCarbs = Math.round(mealCarbs + protDeltaG * 0.75);
            console.warn(`${LOG_PREFIX} ⚠️ P5-cap: Protein ${cappedFrom}g → ${PROTEIN_CAP_PER_MEAL_G}g (physiological max per meal), carbs compensated to ${mealCarbs}g`);
        }

        // FINAL SAFETY: Never exceed remaining kcal
        const estimatedKcal = mealProtein * 3 + mealCarbs * 4 + mealFat * 9;
        if (estimatedKcal > remainingKcal) {
            const scale = remainingKcal / estimatedKcal;
            mealProtein = Math.round(mealProtein * scale);
            mealCarbs = Math.round(mealCarbs * scale);
            mealFat = Math.round(mealFat * scale);
            mealKcal = remainingKcal;
            console.warn(`${LOG_PREFIX} ⚠️ Scaled down to fit remaining kcal:`, {
                scale: Math.round(scale * 100) + '%',
                finalKcal: mealKcal
            });
        }

        console.info(`${LOG_PREFIX} ✅ Final meal macros:`, {
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
    function generateSmartMealSuggestions(contextAnalysis, macrosRec, context, profile, pIndex, patternHints, patternImpact = [], excludeProductIds = null) {
        const scenario = contextAnalysis.scenario;

        // Extract currentTime from context for caffeine-awareness (v2.6)
        const currentTime = parseTime(context.currentTime || getCurrentTime());

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
            console.warn(`${LOG_PREFIX} ⚠️ Product Picker unavailable, falling back to rule-based suggestions`);
            return generateMealSuggestions(contextAnalysis, macrosRec, profile, pIndex);
        }

        try {
            // Determine ideal GI based on scenario
            let idealGI = 50; // Medium by default
            if (scenario === SCENARIOS.PRE_WORKOUT) {
                idealGI = 70; // High GI for quick energy
            } else if (scenario === SCENARIOS.POST_WORKOUT) {
                idealGI = 65; // v3.5: moderate-high GI — fast carbs for glycogen (Ivy 2004)
            } else if (scenario === SCENARIOS.LATE_EVENING) {
                idealGI = 30; // Low GI for sustained release
            } else if (scenario === SCENARIOS.PRE_SLEEP) {
                idealGI = 25; // v3.3: very low GI pre-sleep (Halson 2014: casein/dairy)
            }

            // Phase A: C34 glycemic load → dynamic GI moderation
            if (patternHints?.glycemicLoad?.score !== undefined) {
                const glScore = patternHints.glycemicLoad.score;
                const eveningRatio = patternHints.glycemicLoad.avgEveningRatio || 0;
                const idealGiBefore = idealGI;

                if (glScore < 0.45) {
                    idealGI = Math.max(20, idealGI - 15);
                } else if (glScore < 0.6) {
                    idealGI = Math.max(25, idealGI - 10);
                }

                if ((scenario === SCENARIOS.LATE_EVENING || scenario === SCENARIOS.BALANCED) && eveningRatio > 0.5) {
                    idealGI = Math.min(idealGI, 25);
                }

                if (idealGiBefore !== idealGI) {
                    console.info(`${LOG_PREFIX} [MEALREC / productPicker] 🧮 GI adjusted by C34:`, {
                        scenario,
                        idealGiBefore,
                        idealGiAfter: idealGI,
                        glycemicLoadScore: glScore,
                        eveningRatio,
                    });

                    patternImpact.push({
                        pattern: 'C34',
                        area: 'productPicker',
                        before: `idealGI=${idealGiBefore}`,
                        after: `idealGI=${idealGI}`,
                        reason: `glycemicLoad=${glScore}, eveningRatio=${eveningRatio}`
                    });
                }
            }

            const resolvedLsGet =
                (typeof context?.lsGet === 'function' && context.lsGet) ||
                (typeof global.U?.lsGet === 'function' && global.U.lsGet.bind(global.U)) ||
                (typeof global.HEYS?.utils?.lsGet === 'function' && global.HEYS.utils.lsGet.bind(global.HEYS.utils));

            // Get shared products (from context or global)
            const sharedProducts = context.sharedProducts || global.HEYS?.products?.getAll?.() || [];

            console.info(`${LOG_PREFIX} 🔍 Product Picker deps:`, {
                hasLsGet: typeof resolvedLsGet === 'function',
                sharedProductsCount: sharedProducts.length,
            });

            // Call Product Picker with full Phase A/B/C context
            // v3.1.1: Pass target meal kcal (not day remaining) for correct product selection
            const pickerResult = global.HEYS.InsightsPI.productPicker.generateProductSuggestions({
                scenario,
                remainingKcal: macrosRec.kcal, // v3.1.1: Use meal target kcal (200 for LATE_EVENING) not day remainder (764)
                targetProteinG: macrosRec.protein,
                targetCarbsG: macrosRec.carbs,
                targetFatG: macrosRec.fat,
                idealGI,
                targetGL: macrosRec.targetGL ?? null, // v3.4: F2 — GL target from planner (Ludwig 2002)
                currentTime: currentTime, // v2.6: Pass time for caffeine-awareness
                addedSugarScore: patternHints?.addedSugarDependency?.score, // Phase A: C37
                sugarDependencyRisk: patternHints?.addedSugarDependency?.dependencyRisk, // Phase A: C37
                fiberRegularityScore: patternHints?.fiberRegularity?.score, // Phase B: C10
                micronutrientDeficits: patternHints?.micronutrients?.deficits, // Phase C: C26
                novaQualityScore: patternHints?.novaQuality?.score, // Phase C: C29
                lsGet: resolvedLsGet,
                sharedProducts,
                limit: 3,
                excludeProductIds: excludeProductIds instanceof Set ? excludeProductIds : null, // P3: cross-meal dedup
                profile, // v3.6: F4 — feedback weights (ML EMA multiplier per product+scenario)
            });

            // Handle both modes: flat (legacy) vs grouped (v3.1)
            let suggestions;
            if (pickerResult.mode === 'grouped' && pickerResult.groups) {
                // v3.1: Return groups structure for UI
                console.info(`${LOG_PREFIX} ✅ Smart suggestions via Product Picker v3.1 (grouped):`, {
                    scenario,
                    groupsCount: pickerResult.groups.length,
                    totalProducts: pickerResult.totalProducts,
                    historyUsed: pickerResult.historyUsed,
                });
                return pickerResult; // Return full structure with groups
            } else if (pickerResult.mode === 'flat' && pickerResult.suggestions) {
                suggestions = pickerResult.suggestions;
            } else {
                // Legacy format (direct array) - for backward compatibility
                suggestions = Array.isArray(pickerResult) ? pickerResult : [];
            }

            // If insufficient suggestions, fallback
            if (!suggestions || suggestions.length === 0) {
                console.warn(`${LOG_PREFIX} ⚠️ Product Picker returned no results, falling back`);
                return generateMealSuggestions(contextAnalysis, macrosRec, profile, pIndex);
            }

            console.info(`${LOG_PREFIX} ✅ Smart suggestions via Product Picker (flat mode):`, {
                scenario,
                count: suggestions.length,
                sources: suggestions.map(s => s.source),
            });

            return suggestions;

        } catch (error) {
            console.error(`${LOG_PREFIX} ❌ Product Picker error:`, error);
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

        console.info(`${LOG_PREFIX} 🥘 Generating suggestions for:`, {
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

    console.info(`[${LOG_FILTER}][HEYS.InsightsPI.mealRecommender] ✅ Smart Meal Recommender v3.6.0 initialized (v3.6.0: wave-aware timing + timing sync after planner, 9 scenarios + Phase A/B/C + S9 phenotype auto-detect)`);

})(typeof window !== 'undefined' ? window : global);
