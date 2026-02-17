/**
 * HEYS Predictive Insights — Multi-Meal Timeline Planner v1.3.1
 * 
 * Планирует все оставшиеся приёмы пищи до сна с учётом:
 * - Инсулиновых волн (HEYS.InsulinWave.calculate)
 * - Окон жиросжигания (+30 мин после волны)
 * - Научно обоснованного времени последнего приёма (sleepTarget - 3h)
 * - Распределения макросов между приёмами
 * 
 * v1.3.1 changes (17.02.2026):
 * - Fixed: avgBudget → budgetForThisMeal (was ReferenceError in production)
 * 
 * v1.3 changes (17.02.2026):
 * - Оцениваем волну для РЕАЛЬНО рекомендуемого приёма (distributeBudget)
 * - Предполагаем 2 приёма → берём бюджет первого → оцениваем волну для него
 * - Корректная оценка времени вместо абстрактного референса
 * 
 * v1.2 changes:
 * - Снижен порог fitsAnotherMeal с 2.5h до 2.0h
 * 
 * v1.1 changes:
 * - Используем средний budget для оценки волны (не весь оставшийся)
 * - Более детальное логирование цикла планирования
 * 
 * @module pi_meal_planner
 */

(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};
    const LOG_PREFIX = '[MEALPLAN]';

    // === Constants ===
    const FAT_BURN_WINDOW_MIN = 30; // мин жиросжигания после волны
    const PRE_SLEEP_BUFFER_HOURS = 3; // не есть за 3ч до сна
    const DEFAULT_WAVE_ESTIMATE_HOURS = 3.5; // средняя длина волны для прогноза
    const MIN_MEAL_GAP_MIN = 240; // минимум 4ч между приёмами
    const MAX_MEALS_LIMIT = 4; // макс приёмов в планировании

    // === Utility functions ===

    /**
     * Parse time string to hours (decimal)
     * @param {string} time - "HH:MM" format
     * @returns {number} - hours as decimal (e.g., 18.5 = 18:30)
     */
    function parseTime(time) {
        if (!time || typeof time !== 'string') return 0;
        const [h, m] = time.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return 0;
        return h + m / 60;
    }

    /**
     * Convert decimal hours to "HH:MM" string
     * @param {number} hours - decimal hours
     * @returns {string} - "HH:MM"
     */
    function formatTime(hours) {
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    /**
     * Convert minutes to decimal hours
     * @param {number} minutes
     * @returns {number}
     */
    function minutesToHours(minutes) {
        return minutes / 60;
    }

    /**
     * Estimate wave duration for a future meal based on macros
     * @param {object} macros - { prot, carbs, fat, kcal }
     * @param {object} profile - user profile
     * @returns {number} - estimated wave duration in hours
     */
    function estimateWaveDuration(macros, profile) {
        // Базовая длина волны из профиля или дефолт
        const baseWaveHours = profile?.insulinWaveHours || DEFAULT_WAVE_ESTIMATE_HOURS;

        // Модификаторы на основе состава
        let multiplier = 1.0;

        const gi = macros.gi || 50; // средний GI
        const carbsG = macros.carbs || 0;
        const protG = macros.prot || 0;
        const fatG = macros.fat || 0;

        // Высокий GI → короче волна
        if (gi > 70) multiplier *= 0.9;
        else if (gi < 40) multiplier *= 1.1;

        // Высокие жиры → длиннее волна
        if (fatG > 20) multiplier *= 1.15;
        else if (fatG > 30) multiplier *= 1.25;

        // Высокий белок → стабилизирует
        if (protG > 30) multiplier *= 1.05;

        const estimated = baseWaveHours * multiplier;
        return Math.max(2.5, Math.min(5.0, estimated)); // clamp 2.5-5h
    }

    /**
     * Распределить оставшийся бюджет между N приёмами
     * @param {object} remainingBudget - { prot, carbs, fat, kcal }
     * @param {number} mealsCount - количество приёмов
     * @returns {Array<object>} - массив бюджетов для каждого приёма
     */
    function distributeBudget(remainingBudget, mealsCount) {
        if (mealsCount === 1) {
            return [remainingBudget];
        }

        // Ratios: первый приём побольше, последний полегче
        const ratios = {
            1: [1.0],
            2: [0.60, 0.40],
            3: [0.45, 0.35, 0.20],
            4: [0.35, 0.30, 0.20, 0.15]
        };

        const ratio = ratios[mealsCount] || ratios[4];
        const budgets = [];

        for (let i = 0; i < mealsCount; i++) {
            const r = ratio[i] || (1 / mealsCount);
            budgets.push({
                prot: Math.round(remainingBudget.prot * r),
                carbs: Math.round(remainingBudget.carbs * r),
                fat: Math.round(remainingBudget.fat * r),
                kcal: Math.round(remainingBudget.kcal * r)
            });
        }

        return budgets;
    }

    /**
     * Определить сценарий для конкретного приёма
     * @param {number} index - индекс приёма (0-based)
     * @param {number} totalMeals - всего приёмов
     * @param {object} mealBudget - бюджет этого приёма
     * @param {number} hoursToSleep - часов до сна
     * @returns {string} - scenario code
     */
    function detectMealScenario(index, totalMeals, mealBudget, hoursToSleep) {
        const isLast = (index === totalMeals - 1);
        const kcal = mealBudget.kcal || 0;
        const prot = mealBudget.prot || 0;

        // Последний приём перед сном → лёгкий
        if (isLast && hoursToSleep < 4) {
            return 'LATE_EVENING';
        }

        // Низкокалорийный → перекус
        if (kcal < 150) {
            return 'LIGHT_SNACK';
        }

        // Высокий белок в приёме
        if (prot > 30) {
            return 'PROTEIN_DEFICIT';
        }

        // Дефолт
        return 'BALANCED';
    }

    /**
     * Получить среднее время сна из исторических данных
     * @param {Array<object>} days - исторические дни
     * @param {object} profile - профиль пользователя
     * @returns {number} - среднее время сна в часах (decimal)
     */
    function estimateSleepTarget(days, profile) {
        // Попытка 1: profile.sleepHours + последний приём → время сна
        if (profile?.sleepHours && days.length >= 3) {
            const lastMealTimes = days
                .slice(-7) // последние 7 дней
                .map(d => {
                    const meals = d?.meals || [];
                    if (meals.length === 0) return null;
                    const last = meals[meals.length - 1];
                    return last?.time ? parseTime(last.time) : null;
                })
                .filter(t => t !== null && t > 0);

            if (lastMealTimes.length >= 3) {
                const avgLastMeal = lastMealTimes.reduce((a, b) => a + b) / lastMealTimes.length;
                // sleepTarget ≈ последний приём + 3ч
                const estimated = avgLastMeal + 3;
                console.info(`${LOG_PREFIX} 📊 Estimated sleep target from data:`, {
                    avgLastMeal: formatTime(avgLastMeal),
                    sleepTarget: formatTime(estimated),
                    sampleSize: lastMealTimes.length
                });
                return estimated;
            }
        }

        // Попытка 2: из profile.sleepTarget если есть
        if (profile?.sleepTarget) {
            return parseTime(profile.sleepTarget);
        }

        // Фоллбек: 23:00
        return 23.0;
    }

    /**
     * Главная функция: планирование всех оставшихся приёмов до сна
     * 
     * @param {object} params
     * @param {string} params.currentTime - текущее время "HH:MM"
     * @param {object} params.lastMeal - последний приём { time, items, totals }
     * @param {object} params.dayTarget - дневная цель { prot, carbs, fat, kcal }
     * @param {object} params.dayEaten - уже съедено { prot, carbs, fat, kcal }
     * @param {object} params.profile - профиль пользователя
     * @param {Array<object>} params.days - исторические дни для анализа
     * @param {object} params.pIndex - индекс продуктов
     * @returns {object} - { available, meals: PlannedMeal[], summary }
     */
    function planRemainingMeals(params) {
        const {
            currentTime,
            lastMeal,
            dayTarget = {},
            dayEaten = {},
            profile = {},
            days = [],
            pIndex = {}
        } = params;

        console.info(`${LOG_PREFIX} [PLANNER.entry] 🍽️ planRemainingMeals called:`, {
            currentTime,
            lastMealTime: lastMeal?.time,
            lastMealTotals: lastMeal?.totals,
            hasInsulinWave: !!HEYS.InsulinWave,
            daysCount: days.length,
            dayTarget,
            dayEaten
        });

        // Validate
        if (!currentTime || !lastMeal?.time) {
            console.warn(`${LOG_PREFIX} ❌ Missing currentTime or lastMeal`);
            return { available: false, error: 'Missing required data' };
        }

        if (!HEYS.InsulinWave?.calculate) {
            console.warn(`${LOG_PREFIX} ❌ InsulinWave module not available`);
            return { available: false, error: 'InsulinWave module missing' };
        }

        const currentTimeHours = parseTime(currentTime);
        const lastMealTimeHours = parseTime(lastMeal.time);

        // === Шаг 1: Рассчитать конец текущей инсулиновой волны ===
        let currentWaveEnd = null;
        let currentWaveData = null;

        try {
            // Подготовка нутриентов последнего приёма
            const lastMealNutrients = {
                kcal: lastMeal.totals?.kcal || 0,
                protein: lastMeal.totals?.prot || 0,
                carbs: lastMeal.totals?.carbs || 0,
                fat: lastMeal.totals?.fat || 0,
                glycemicLoad: lastMeal.totals?.glycemicLoad || 0
            };

            currentWaveData = HEYS.InsulinWave.calculate({
                lastMealTime: lastMeal.time,
                nutrients: lastMealNutrients,
                profile: profile,
                baseWaveHours: profile?.insulinWaveHours || 3
            });

            if (currentWaveData?.waveMinutes) {
                const waveEndMinutes = HEYS.utils?.timeToMinutes(lastMeal.time) + currentWaveData.waveMinutes;
                currentWaveEnd = minutesToHours(waveEndMinutes);
                console.info(`${LOG_PREFIX} [PLANNER.wave] 📊 Current insulin wave calculated:`, {
                    lastMeal: lastMeal.time,
                    waveMinutes: currentWaveData.waveMinutes,
                    waveEnd: formatTime(currentWaveEnd),
                    progress: currentWaveData.progressPct?.toFixed(1) + '%',
                    nutrients: lastMealNutrients
                });
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} ⚠️ Failed to calculate current wave:`, err.message);
        }

        // Фоллбек: если не удалось рассчитать, берём базовую длину волны
        if (!currentWaveEnd) {
            const baseWave = profile?.insulinWaveHours || 3;
            currentWaveEnd = lastMealTimeHours + baseWave;
            console.info(`${LOG_PREFIX} 📊 Using fallback wave estimate:`, {
                lastMeal: formatTime(lastMealTimeHours),
                waveEnd: formatTime(currentWaveEnd),
                baseWaveHours: baseWave
            });
        }

        // === Шаг 2: +30 мин жиросжигания ===
        const fatBurnEnd = currentWaveEnd + minutesToHours(FAT_BURN_WINDOW_MIN);
        const nextMealEarliest = Math.max(currentTimeHours, fatBurnEnd);

        console.info(`${LOG_PREFIX} [PLANNER.fatburn] 🔥 Fat burn window calculated:`, {
            waveEnd: formatTime(currentWaveEnd),
            fatBurnWindowMin: FAT_BURN_WINDOW_MIN,
            fatBurnEnd: formatTime(fatBurnEnd),
            currentTime: formatTime(currentTimeHours),
            nextMealEarliest: formatTime(nextMealEarliest)
        });

        // === Шаг 3: Определить время сна и deadline последнего приёма ===
        const sleepTarget = estimateSleepTarget(days, profile);
        const lastMealDeadline = sleepTarget - PRE_SLEEP_BUFFER_HOURS;

        console.info(`${LOG_PREFIX} [PLANNER.sleep] 🌙 Sleep planning:`, {
            sleepTarget: formatTime(sleepTarget),
            preSleepBuffer: PRE_SLEEP_BUFFER_HOURS,
            lastMealDeadline: formatTime(lastMealDeadline),
            availableWindow: `${formatTime(nextMealEarliest)} → ${formatTime(lastMealDeadline)}`
        });

        // Проверка: достаточно ли времени хотя бы для одного приёма?
        if (nextMealEarliest >= lastMealDeadline) {
            console.info(`${LOG_PREFIX} ℹ️ No time for additional meals (nextMeal >= deadline)`);
            return {
                available: true,
                meals: [],
                summary: {
                    totalMeals: 0,
                    reason: 'Недостаточно времени до сна для дополнительных приёмов'
                }
            };
        }

        // === Шаг 4: Рассчитать оставшийся бюджет ===
        const remainingBudget = {
            prot: Math.max(0, (dayTarget.prot || 0) - (dayEaten.prot || 0)),
            carbs: Math.max(0, (dayTarget.carbs || 0) - (dayEaten.carbs || 0)),
            fat: Math.max(0, (dayTarget.fat || 0) - (dayEaten.fat || 0)),
            kcal: Math.max(0, (dayTarget.kcal || 0) - (dayEaten.kcal || 0))
        };

        console.info(`${LOG_PREFIX} [PLANNER.budget] 💰 Remaining budget:`, {
            ...remainingBudget,
            percentOfTarget: {
                prot: ((remainingBudget.prot / (dayTarget.prot || 1)) * 100).toFixed(0) + '%',
                kcal: ((remainingBudget.kcal / (dayTarget.kcal || 1)) * 100).toFixed(0) + '%'
            }
        });

        // Если бюджет <50 kcal → не планируем
        if (remainingBudget.kcal < 50) {
            console.info(`${LOG_PREFIX} ℹ️ Insufficient remaining budget (< 50 kcal)`);
            return {
                available: true,
                meals: [],
                summary: {
                    totalMeals: 0,
                    reason: 'Дневная цель практически выполнена'
                }
            };
        }

        // === Шаг 5: Цикл планирования приёмов ===
        const plannedMeals = [];
        let cursor = nextMealEarliest;
        let iteration = 0;

        console.info(`${LOG_PREFIX} [PLANNER.loop] 🔄 Starting meal placement loop:`, {
            startCursor: formatTime(cursor),
            deadline: formatTime(lastMealDeadline),
            availableHours: (lastMealDeadline - cursor).toFixed(1)
        });

        while (cursor < lastMealDeadline && iteration < MAX_MEALS_LIMIT) {
            iteration++;

            // 🆕 v1.3: Оцениваем волну для реально рекомендуемого приёма
            // Предполагаем что можем запланировать ещё 2 приёма → распределяем budget на 2
            // Берём первую часть и оцениваем волну для НЕЁ
            const mealsEstimate = Math.min(2, MAX_MEALS_LIMIT - plannedMeals.length);
            const budgetsEstimate = distributeBudget(remainingBudget, mealsEstimate);
            const budgetForThisMeal = budgetsEstimate[0];

            const estimatedWave = estimateWaveDuration(budgetForThisMeal, profile);
            const waveEndTime = cursor + estimatedWave;
            const fatBurnWindowEnd = waveEndTime + minutesToHours(FAT_BURN_WINDOW_MIN);

            console.info(`${LOG_PREFIX} [PLANNER.loop.${iteration}] 🧮 Evaluating meal slot:`, {
                cursor: formatTime(cursor),
                mealsEstimate,
                thisMealKcal: Math.round(budgetForThisMeal.kcal),
                remainingKcal: Math.round(remainingBudget.kcal),
                estimatedWaveHours: estimatedWave.toFixed(1),
                waveEnd: formatTime(waveEndTime),
                fatBurnEnd: formatTime(fatBurnWindowEnd)
            });

            // Проверка: влезает ли ещё один приём после этого?
            const nextPossibleStart = fatBurnWindowEnd;
            const fitsAnotherMeal = (nextPossibleStart + 2.0 < lastMealDeadline); // минимум 2ч на следующую волну

            console.info(`${LOG_PREFIX} [PLANNER.loop.${iteration}] 🤔 Can fit another meal?`, {
                nextPossibleStart: formatTime(nextPossibleStart),
                deadline: formatTime(lastMealDeadline),
                fitsAnotherMeal
            });

            if (!fitsAnotherMeal) {
                // Это последний возможный приём
                plannedMeals.push({
                    index: plannedMeals.length,
                    timeStart: formatTime(cursor),
                    timeEnd: formatTime(cursor + 1), // окно 1ч
                    estimatedWaveEnd: formatTime(waveEndTime),
                    fatBurnWindow: {
                        start: formatTime(waveEndTime),
                        end: formatTime(fatBurnWindowEnd)
                    },
                    macros: budgetForThisMeal, // временно, будет перераспределено на шаге 6
                    isActionable: plannedMeals.length === 0, // действия только для первого
                    isLast: true,
                    scenario: 'LATE_EVENING',
                    hoursToSleep: sleepTarget - cursor
                });
                console.info(`${LOG_PREFIX} [PLANNER.loop.${iteration}] ✅ Added LAST meal (no more time)`);
                break;
            }

            // Добавляем приём
            plannedMeals.push({
                index: plannedMeals.length,
                timeStart: formatTime(cursor),
                timeEnd: formatTime(cursor + 1),
                estimatedWaveEnd: formatTime(waveEndTime),
                fatBurnWindow: {
                    start: formatTime(waveEndTime),
                    end: formatTime(fatBurnWindowEnd)
                },
                macros: budgetForThisMeal, // временно, будет перераспределено на шаге 6
                isActionable: plannedMeals.length === 0,
                isLast: false,
                scenario: 'BALANCED',
                hoursToSleep: sleepTarget - cursor
            });
            console.info(`${LOG_PREFIX} [PLANNER.loop.${iteration}] ✅ Added meal, moving cursor forward`);

            // Двигаем курсор
            cursor = fatBurnWindowEnd;
        }

        // === Шаг 6: Перераспределить бюджет между найденными приёмами ===
        const finalBudgets = distributeBudget(remainingBudget, plannedMeals.length);
        for (let i = 0; i < plannedMeals.length; i++) {
            plannedMeals[i].macros = finalBudgets[i];
            // Обновить сценарий
            plannedMeals[i].scenario = detectMealScenario(
                i,
                plannedMeals.length,
                finalBudgets[i],
                plannedMeals[i].hoursToSleep
            );
        }

        console.info(`${LOG_PREFIX} [PLANNER.result] ✅ Planned meals:`, {
            count: plannedMeals.length,
            timeline: plannedMeals.map(m => `${m.timeStart}-${m.timeEnd}`).join(' → '),
            macrosPerMeal: plannedMeals.map((m, i) => `Meal ${i + 1}: Б${Math.round(m.macros.prot)}г У${Math.round(m.macros.carbs)}г ккал${Math.round(m.macros.kcal)}`)
        });

        plannedMeals.forEach((meal, idx) => {
            console.info(`${LOG_PREFIX} [PLANNER.meal${idx + 1}] 🍽️ Meal ${meal.index + 1}:`, {
                time: `${meal.timeStart}-${meal.timeEnd}`,
                macros: meal.macros,
                waveEnd: meal.estimatedWaveEnd,
                fatBurnWindow: meal.fatBurnWindow,
                isActionable: meal.isActionable,
                scenario: meal.scenario,
                hoursToSleep: meal.hoursToSleep.toFixed(1)
            });
        });

        // === Шаг 7: Формирование summary ===
        const summary = {
            totalMeals: plannedMeals.length,
            timelineStart: plannedMeals[0]?.timeStart,
            timelineEnd: plannedMeals[plannedMeals.length - 1]?.timeEnd,
            totalMacros: {
                prot: finalBudgets.reduce((sum, b) => sum + b.prot, 0),
                carbs: finalBudgets.reduce((sum, b) => sum + b.carbs, 0),
                kcal: finalBudgets.reduce((sum, b) => sum + b.kcal, 0)
            },
            sleepTarget: formatTime(sleepTarget),
            lastMealDeadline: formatTime(lastMealDeadline)
        };

        return {
            available: true,
            meals: plannedMeals,
            summary
        };
    }

    // === Export ===
    HEYS.InsightsPI.mealPlanner = {
        planRemainingMeals,
        estimateSleepTarget,
        estimateWaveDuration,
        distributeBudget,
        // Utilities
        parseTime,
        formatTime,
        minutesToHours
    };

    console.info(`${LOG_PREFIX} 📦 Module loaded (v1.3.1 — fixed avgBudget reference error)`);

})(window);
