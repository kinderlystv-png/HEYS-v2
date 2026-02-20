/**
 * HEYS Predictive Insights — Multi-Meal Timeline Planner v2.3.0
 * 
 * Планирует все оставшиеся приёмы пищи до сна с учётом:
 * - Инсулиновых волн (HEYS.InsulinWave.calculate)
 * - Окон жиросжигания (+30 мин после волны)
 * - Научно обоснованного времени последнего приёма (sleepTarget - buffer)
 * - Персонального паттерна сна (sleepStart из чек-ина)
 * - Распределения макросов между приёмами
 * - Hunger trade-off: большой дефицит → лучше поесть, чем лечь голодным
 * - First meal of day: no lastMeal → no wave, start from now (v2.3.0)
 *
 * v2.3.0 changes (20.02.2026):
 * - FIX: planRemainingMeals no longer requires lastMeal.time — supports "first meal of day"
 *   When no meals eaten today, planner skips insulin wave and fat burn window,
 *   starts planning from currentTime. Enables 3-4 meal day plans from first meal.
 * - LOG: [PLANNER.wave] 🌅 First meal of day — no active insulin wave
 *
 * v2.2.0 changes (19.02.2026):
 * - FIX: waveMinutes → duration property name in InsulinWave.calculate() return object
 *   (was always undefined → planner always used 3h fallback instead of real wave ~4.5h)
 *   Real fix: currentWaveData.duration (minutes), currentWaveData.remaining (remaining minutes)
 * - LOG: Added waveRemaining + endTimeDisplay to wave calculation log
 *
 * v2.1.0 changes (19.02.2026):
 * - S8: Volume-adjusted personal wave for forceMultiMeal — smaller meal → shorter wave
 *   (Louis-Sylvestre & Le Magnen, 1980: meal size correlates with insulin response duration)
 *   Personal wave scaled by sqrt(mealKcal / typicalMealKcal), clamped [0.7, 1.0]
 * - Updated estimateWaveDuration signature to accept optional totalBudgetKcal for scaling
 * 
 * v2.0.0 changes (19.02.2026):
 * - FIX: PRE_SLEEP threshold raised from 4h to 5h so meals 4-5h before sleep
 *   (e.g. 21:50 when sleep at 02:00 = 4.17h) get sleep-friendly products
 *   (connects to Sprint 5: pi_product_picker.js PRE_SLEEP category override)
 *
 * v1.9.0 changes (19.02.2026):
 * - NEW: estimateSleepTarget uses real sleepStart check-in data (top priority)
 *   → personal sleep pattern: if user sleeps at 1-2 AM, deadline extends accordingly
 * - NEW: Hunger trade-off (Kinsey & Ormsbee, 2015): when budget is large but
 *   deadline has passed, reduce pre-sleep buffer (3h→2h or 1.5h) instead of
 *   refusing to plan meals. Going to bed hungry with a deficit > starving metabolism.
 * - FIX: clamp raised from [22:00, 00:30] to [22:00, 02:00] for late sleepers
 *
 * v1.8.0 changes (19.02.2026):
 * - FIX: while-loop used `cursor < lastMealDeadline` but fitsAnotherMeal used
 *   relaxed `deadlineForCheck = lastMealDeadline + 0.5`. After meal 1 added,
 *   cursor=21:33 > deadline=21:30 → loop exited before creating meal 2.
 *   Now while-loop uses `effectiveDeadline` (relaxed when forceMultiMeal).
 *
 * v1.7.0 changes (19.02.2026):
 * - FIX: distributeBudget chrono/adaptive blend inverted from 70/30 to 30/70
 *   (chrono ratios designed for full-day distribution inverted remaining-meal split:
 *    EVENING=0.28 > SNACK=0.20 made late meal larger — wrong for remaining budget)
 * - NEW: Monotonicity guard — chrono never inverts adaptive "earlier = bigger" rule
 *   (Garaulet 2014: earlier meals → better insulin sensitivity, lower postprandial glycemia)
 *
 * v1.6.0 changes (19.02.2026):
 * - NEW: MAX_MEAL_KCAL=900 cap — force meal splitting when single meal > 900 kcal
 *   (Mifflin-St Jeor, 2003; >800-900 kcal/meal → excessive insulin spike + poor MPS)
 * - FIX: estimateWaveDuration — skip macro-composition modifiers when personalWaveHours
 *   is used (was double-counting: personal median already includes fat/protein effects)
 * - FIX: reduced FAT_BURN_WINDOW to 20min when forceMultiMeal to fit 2nd meal
 * - FIX: relaxed `fitsAnotherMeal` hoursToSleep threshold to 1.5h when forceMultiMeal
 * 
 * v1.4.0 changes (18.02.2026):
 * - Fixed: fitsAnotherMeal критерий исправлен (было: <lastMealDeadline=sleepTarget-3h,
 *   требовало 5h до сна; стало: <lastMealDeadline И >=2h до sleepTarget)
 * - Adaptive distributeBudget: для 2 приёмов сплит адаптируется по hoursToSleep второго
 *   (>=4h→60/40, >=3h→65/35, >=2.5h→70/30, >=2h→75/25)
 * - Step 6: передаём hoursToSleepPerMeal в distributeBudget для адаптивного сплита
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
    const LOG_PREFIX = '[MEALREC][HEYS.mealRec.planner]';

    // === Constants ===
    const FAT_BURN_WINDOW_MIN = 30; // мин жиросжигания после волны
    const FAT_BURN_WINDOW_MIN_TIGHT = 20; // сокращённое окно при forceMultiMeal (v1.6)
    const PRE_SLEEP_BUFFER_HOURS = 3; // не есть за 3ч до сна
    const DEFAULT_WAVE_ESTIMATE_HOURS = 3.5; // средняя длина волны для прогноза
    const MIN_MEAL_GAP_MIN = 240; // минимум 4ч между приёмами
    const MAX_MEALS_LIMIT = 4; // макс приёмов в планировании
    // v1.6: Max kcal per single meal (Mifflin-St Jeor, 2003; MPS saturation, insulin overload)
    // >800-900 kcal = diminishing returns for protein synthesis, excessive glycemic load
    const MAX_MEAL_KCAL = 900;

    // === Scientific constants (Sprint 3 / v1.5.0) ===
    // S1: Chrono-Nutrition — Garaulet & Gómez-Abellán, 2014
    const CHRONO_RATIO_MORNING = 0.33;  // 06:00–10:59 (кортизол пик, max инсулиновая чувствительность)
    const CHRONO_RATIO_LUNCH = 0.38;  // 11:00–14:59 (пик пищеварительной активности)
    const CHRONO_RATIO_SNACK = 0.20;  // 15:00–18:59 (полдник)
    const CHRONO_RATIO_EVENING = 0.28;  // 19:00+ (снижение метаболизма, подготовка ко сну)

    // S2: Muscle Protein Synthesis — Areta et al., 2013
    const MPS_PROT_PER_KG = 0.4; // г/кг на приём для оптимального MPS
    const MPS_PROT_MAX_G = 40;  // потолок эффективности (>40г не лучше)

    // S3: Glycemic Load — Ludwig, 2002
    const GL_TARGET_DAY = 20; // GL < 20 на дневной приём
    const GL_TARGET_PRE_SLEEP = 10; // GL < 10 за ≤ 3ч до сна

    // S5: Sleep-quality foods — Halson, 2014
    const SLEEP_FRIENDLY_CATEGORIES = ['dairy', 'nuts', 'legumes', 'poultry'];

    // S6: Personal wave estimation
    const PERSONAL_WAVE_MIN_SAMPLES = 5;
    const PERSONAL_WAVE_DAYS_LOOKBACK = 14;

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
     * @param {number} [totalBudgetKcal] - total remaining kcal budget (for volume scaling in forceMultiMeal)
     * @returns {number} - estimated wave duration in hours
     */
    function estimateWaveDuration(macros, profile, totalBudgetKcal) {
        // Базовая длина волны из профиля или дефолт
        const baseWaveHours = profile?.insulinWaveHours || DEFAULT_WAVE_ESTIMATE_HOURS;
        const isPersonalWave = !!profile?.insulinWaveHours;

        // v1.6: Если personalWaveHours (медиана реальных гэпов) — НЕ применяем модификаторы.
        // Медиана уже включает эффект жиров/белка в типичных приёмах — не нужно двоить.
        // Модификаторы применяем только для DEFAULT_WAVE_ESTIMATE_HOURS (когда нет истории).
        if (isPersonalWave) {
            let wave = baseWaveHours;

            // S8 (v2.1.0): Volume-adjusted wave for split meals
            // Personal wave = median of typical meal gaps. If this meal is smaller than typical,
            // wave should be proportionally shorter. Louis-Sylvestre & Le Magnen, 1980:
            // insulin response amplitude and duration correlate with meal caloric load.
            // Use sqrt scaling (sublinear — 50% calories ≈ 71% wave, not 50%)
            if (totalBudgetKcal && macros.kcal && macros.kcal < totalBudgetKcal * 0.85) {
                // Typical meal ≈ totalBudget / 2 or 3 (but personal wave was calibrated on full meals)
                // Scale: ratio = mealKcal / totalBudgetKcal, factor = sqrt(ratio), clamp [0.7, 1.0]
                const ratio = macros.kcal / totalBudgetKcal;
                const scaleFactor = Math.max(0.7, Math.min(1.0, Math.sqrt(ratio)));
                wave = baseWaveHours * scaleFactor;
                console.info(`${LOG_PREFIX} [wave] 📐 S8: Volume-scaled personal wave: ${baseWaveHours.toFixed(2)}h × ${scaleFactor.toFixed(2)} = ${wave.toFixed(2)}h (meal ${Math.round(macros.kcal)} / total ${Math.round(totalBudgetKcal)} kcal)`);
            }

            return Math.max(2.5, Math.min(5.0, wave));
        }

        // Модификаторы на основе состава (только для дефолтного значения)
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
     * S1: Chrono-Nutrition ratio by time of day (Garaulet & Gómez-Abellán, 2014)
     * @param {number} mealTimeHours - decimal hours (e.g. 13.5 = 13:30)
     * @returns {number} - energy ratio weight
     */
    function getChronoRatio(mealTimeHours) {
        if (mealTimeHours < 11) return CHRONO_RATIO_MORNING;
        if (mealTimeHours < 15) return CHRONO_RATIO_LUNCH;
        if (mealTimeHours < 19) return CHRONO_RATIO_SNACK;
        return CHRONO_RATIO_EVENING;
    }

    /**
     * S6: Estimate personal insulin wave duration from historical meal gaps
     * @param {Array<object>} days - historical days
     * @returns {number|null} - median gap in hours, or null if insufficient data
     */
    function estimatePersonalWaveHours(days) {
        const gaps = [];
        days.slice(-PERSONAL_WAVE_DAYS_LOOKBACK).forEach(d => {
            const meals = d?.meals || [];
            for (let i = 1; i < meals.length; i++) {
                const gap = parseTime(meals[i].time) - parseTime(meals[i - 1].time);
                if (gap >= 2 && gap <= 6) gaps.push(gap); // фильтр аномалий
            }
        });
        if (gaps.length < PERSONAL_WAVE_MIN_SAMPLES) return null;
        gaps.sort((a, b) => a - b);
        return gaps[Math.floor(gaps.length / 2)]; // медиана
    }

    /**
     * Распределить оставшийся бюджет между N приёмами
     * @param {object} remainingBudget - { prot, carbs, fat, kcal }
     * @param {number} mealsCount - количество приёмов
     * @param {Array<number>} [hoursToSleepPerMeal] - часов до сна у каждого приёма
     * @param {Array<number>} [mealTimes] - время приёмов в часах (S1: chrono-nutrition)
     * @returns {Array<object>} - массив бюджетов для каждого приёма
     */
    function distributeBudget(remainingBudget, mealsCount, hoursToSleepPerMeal, mealTimes) {
        if (mealsCount === 1) {
            return [remainingBudget];
        }

        // Ratios: первый приём побольше, последний полегче
        const ratios = {
            1: [1.0],
            2: [0.60, 0.40], // дефолт для 2 приёмов
            3: [0.45, 0.35, 0.20],
            4: [0.35, 0.30, 0.20, 0.15]
        };

        let ratio = ratios[mealsCount] || ratios[4];

        // 🆕 v1.4: Адаптивный сплит для 2 приёмов на основе hoursToSleep второго приёма
        // Чем ближе второй приём к сну → тем меньше его доля (нельзя есть много перед сном)
        if (mealsCount === 2 && hoursToSleepPerMeal?.length >= 2) {
            const h2 = hoursToSleepPerMeal[1]; // часов до сна у второго приёма
            if (h2 >= 4.0) {
                ratio = [0.60, 0.40]; // стандарт — оба большие
            } else if (h2 >= 3.0) {
                ratio = [0.65, 0.35]; // второй чуть меньше
            } else if (h2 >= 2.5) {
                ratio = [0.70, 0.30]; // второй лёгкий
            } else {
                ratio = [0.75, 0.25]; // второй совсем лёгкий (близко ко сну)
            }
            console.info(`${LOG_PREFIX} [PLANNER.split] ⚖️ Adaptive 2-meal split: h2Sleep=${h2.toFixed(1)}h → ${(ratio[0] * 100).toFixed(0)}/${(ratio[1] * 100).toFixed(0)}`);
        }

        // 🆕 v1.5/v1.7: S1 Chrono-Nutrition — скорректировать ratio по времени суток (Garaulet 2014)
        // v1.7: Chrono ratios designed for FULL-DAY distribution (EVENING=0.28 > SNACK=0.20).
        //   For REMAINING-meal distribution, adaptive split (hoursToSleep-based) is primary.
        //   Blend: 30% chrono + 70% adaptive (was 70/30 — caused late meal > early meal inversion)
        if (mealTimes?.length >= mealsCount) {
            const chronoRaw = mealTimes.slice(0, mealsCount).map(t => getChronoRatio(t));
            const chronoSum = chronoRaw.reduce((a, b) => a + b, 0);
            const chronoNorm = chronoRaw.map(r => r / chronoSum); // нормализация → сумма = 1.0
            const chronoMin = Math.min(...chronoNorm);
            const chronoMax = Math.max(...chronoNorm);
            if (chronoMax - chronoMin > 0.05) {
                // v1.7: 30% chrono + 70% adaptive (adaptive is primary for remaining meals)
                const adaptiveRatio = [...ratio]; // save pre-chrono adaptive ratio
                const blended = chronoNorm.map((c, i) => c * 0.3 + (ratio[i] || 1 / mealsCount) * 0.7);
                const blendedSum = blended.reduce((a, b) => a + b, 0);
                const blendedNorm = blended.map(r => r / blendedSum);

                // v1.7: Monotonicity guard — chrono must NOT invert "earlier = bigger" rule.
                // If adaptive says meal[0] > meal[last] but chrono blend reverses it → skip chrono.
                // Science: earlier meals have better insulin sensitivity (Garaulet 2014),
                //   lower postprandial glycemia, and more time for TEF.
                const adaptiveDecreasing = adaptiveRatio[0] >= adaptiveRatio[adaptiveRatio.length - 1];
                const blendedDecreasing = blendedNorm[0] >= blendedNorm[blendedNorm.length - 1];

                if (adaptiveDecreasing && !blendedDecreasing) {
                    // Chrono would invert the order → skip it, keep adaptive
                    console.info(`${LOG_PREFIX} [chrono] ⏰ Chrono-Nutrition SKIPPED (would invert early>late rule):`,
                        `chrono=[${chronoNorm.map(r => (r * 100).toFixed(0) + '%').join(',')}]`,
                        `adaptive=[${adaptiveRatio.map(r => (r * 100).toFixed(0) + '%').join(',')}]`,
                        `blended=[${blendedNorm.map(r => (r * 100).toFixed(0) + '%').join(',')}]`,
                        '→ keeping adaptive'
                    );
                } else {
                    ratio = blendedNorm;
                    console.info(`${LOG_PREFIX} [chrono] ⏰ Chrono-Nutrition ratios applied (30/70 blend):`,
                        ratio.map((r, i) => `Meal${i + 1}@${(mealTimes[i] || 0).toFixed(1)}h=${(r * 100).toFixed(0)}%`).join(', ')
                    );
                }
            }
        }

        const budgets = [];

        for (let i = 0; i < mealsCount; i++) {
            const r = ratio[i] || (1 / mealsCount);
            const mealProt = Math.round(remainingBudget.prot * r);
            const mealCarbs = Math.round(remainingBudget.carbs * r);
            const mealFat = Math.round(remainingBudget.fat * r);
            // S7 (Sprint 6): TEF-Aware effectiveKcal — protein counted at 3 kcal/g (TEF ~25%)
            // Halton & Hu, 2004: protein TEF is 20-30%; HEYS convention uses 3 kcal/g
            // effectiveKcal represents net metabolic energy available after digestion
            const effectiveKcal = mealProt * 3 + mealCarbs * 4 + mealFat * 9;
            budgets.push({
                prot: mealProt,
                carbs: mealCarbs,
                fat: mealFat,
                kcal: Math.round(remainingBudget.kcal * r),
                effectiveKcal // S7: TEF-adjusted energy (protein=3kcal/g)
            });
        }

        console.info(`${LOG_PREFIX} [PLANNER.budget] 🧠 TEF-adjusted budgets (S7):`, budgets.map((b, i) =>
            `Meal${i + 1}: ${b.kcal}kcal nominal → ${b.effectiveKcal}kcal effective (P${b.prot}g×3+C${b.carbs}g×4+F${b.fat}g×9)`
        ));

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

        // 🆕 S5: Последний приём перед сном → PRE_SLEEP (sleep-quality foods, Halson 2014)
        // v1.9.1: raised threshold 4h→5h (research: 4-5h pre-sleep = still relevant for GI/protein choice)
        if (isLast && hoursToSleep < 5) {
            return 'PRE_SLEEP';
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
        // === Попытка 0 (v1.9): Среднее sleepStart из данных чек-ина (самый точный источник) ===
        // Аналог getAverageBedtime() из advice_bundle — реальное время засыпания
        // Если пользователь ложится в 1-2 ночи, это будет правильно учтено
        if (days.length >= 3) {
            const sleepStarts = days
                .slice(-14) // 2 недели для надёжности
                .map(d => d.sleepStart)
                .filter(t => t && typeof t === 'string' && t.includes(':'));

            if (sleepStarts.length >= 3) {
                const minutesFromMidnight = sleepStarts.map(t => {
                    const [h, m] = t.split(':').map(Number);
                    // h < 12 = после полуночи (01:00 → 25ч, 02:00 → 26ч)
                    return h < 12 ? (h + 24) * 60 + m : h * 60 + m;
                });
                const avgMinutes = minutesFromMidnight.reduce((a, b) => a + b, 0) / minutesFromMidnight.length;
                const sleepHours = avgMinutes / 60; // в десятичных часах (25.0 = 01:00)
                // Clamp [22:00, 02:00] — разумные пределы даже для сов
                const clamped = Math.min(26.0, Math.max(22.0, sleepHours));
                console.info(`${LOG_PREFIX} 📊 Sleep target from check-in data (sleepStart):`, {
                    sampleSize: sleepStarts.length,
                    avgSleepTime: formatTime(sleepHours),
                    sleepTarget: formatTime(clamped),
                    wasClamped: Math.abs(sleepHours - clamped) > 0.01,
                    source: 'sleepStart_checkin'
                });
                return clamped;
            }
        }

        // === Попытка 1: profile.sleepHours + последний приём → время сна ===
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
                const estimatedRaw = avgLastMeal + 3;
                // v1.9: raised upper clamp from 00:30 to 02:00 for late sleepers
                // 26.0 = 02:00 next day (upper), 22.0 = 22:00 (lower)
                const estimated = Math.min(26.0, Math.max(22.0, estimatedRaw));
                console.info(`${LOG_PREFIX} 📊 Estimated sleep target from meal data:`, {
                    avgLastMeal: formatTime(avgLastMeal),
                    sleepTargetRaw: formatTime(estimatedRaw),
                    sleepTarget: formatTime(estimated),
                    clamped: estimatedRaw !== estimated,
                    sampleSize: lastMealTimes.length,
                    source: 'avgLastMeal+3h'
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
        if (!currentTime) {
            console.warn(`${LOG_PREFIX} ❌ Missing currentTime`);
            return { available: false, error: 'Missing required data' };
        }

        // v2.3.0: Support "first meal of day" — no lastMeal means no active wave
        const hasLastMeal = !!lastMeal?.time;

        if (!HEYS.InsulinWave?.calculate) {
            console.warn(`${LOG_PREFIX} ❌ InsulinWave module not available`);
            return { available: false, error: 'InsulinWave module missing' };
        }

        const currentTimeHours = parseTime(currentTime);
        const lastMealTimeHours = hasLastMeal ? parseTime(lastMeal.time) : null;

        // === Шаг 1: Рассчитать конец текущей инсулиновой волны ===
        let currentWaveEnd = null;
        let currentWaveData = null;

        if (hasLastMeal) {
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

                if (currentWaveData?.duration) {
                    const waveEndMinutes = HEYS.utils?.timeToMinutes(lastMeal.time) + currentWaveData.duration;
                    currentWaveEnd = minutesToHours(waveEndMinutes);
                    console.info(`${LOG_PREFIX} [PLANNER.wave] 📊 Current insulin wave calculated:`, {
                        lastMeal: lastMeal.time,
                        waveDuration: currentWaveData.duration,
                        waveEnd: formatTime(currentWaveEnd),
                        remaining: currentWaveData.remaining,
                        progress: currentWaveData.progress?.toFixed(1) + '%',
                        endTimeDisplay: currentWaveData.endTimeDisplay,
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
        } else {
            // v2.3.0: No last meal — first meal of day, no active insulin wave
            console.info(`${LOG_PREFIX} [PLANNER.wave] 🌅 First meal of day — no active insulin wave, starting from now`);
        }

        // === Шаг 2: +30 мин жиросжигания ===
        // v2.3.0: When no lastMeal, skip fat burn window — just start from currentTime
        const fatBurnEnd = currentWaveEnd ? currentWaveEnd + minutesToHours(FAT_BURN_WINDOW_MIN) : currentTimeHours;
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
        let lastMealDeadline = sleepTarget - PRE_SLEEP_BUFFER_HOURS;
        let hungerTradeoffApplied = false;
        let effectiveBuffer = PRE_SLEEP_BUFFER_HOURS;

        console.info(`${LOG_PREFIX} [PLANNER.sleep] 🌙 Sleep planning:`, {
            sleepTarget: formatTime(sleepTarget),
            preSleepBuffer: PRE_SLEEP_BUFFER_HOURS,
            lastMealDeadline: formatTime(lastMealDeadline),
            availableWindow: `${formatTime(nextMealEarliest)} → ${formatTime(lastMealDeadline)}`
        });

        // === S4: POST_WORKOUT detection (Ivy, 2004) ===
        // Анаболическое окно 2ч: 0.35 г/кг белка + 1.0 г/кг углеводов
        const recentWorkout = params.currentDay?.workouts?.find(
            w => w.endTime && (currentTimeHours - parseTime(w.endTime)) >= 0 && (currentTimeHours - parseTime(w.endTime)) < 2
        );
        if (recentWorkout) {
            console.info(`${LOG_PREFIX} [workout] 💪 Recent workout detected (anabolic window active):`, {
                endTime: recentWorkout.endTime,
                hoursAgo: (currentTimeHours - parseTime(recentWorkout.endTime)).toFixed(1),
                type: recentWorkout.type || 'unknown'
            });
        }

        // Проверка: достаточно ли времени хотя бы для одного приёма?
        if (nextMealEarliest >= lastMealDeadline) {
            // === v1.9: Hunger trade-off (Kinsey & Ormsbee, 2015) ===
            // Лучше поесть лёгкий белковый приём за 1.5-2ч до сна, чем лечь голодным.
            // Большой дефицит → кортизол ↑, катаболизм, плохой сон.
            // Pre-sleep protein (казеин, творог) УЛУЧШАЕТ MPS без негативных метаболических эффектов.
            const quickBudgetKcal = Math.max(0, (dayTarget.kcal || 0) - (dayEaten.kcal || 0));

            if (quickBudgetKcal >= 800) {
                // Серьёзный дефицит: буфер 3h → 1.5h
                const reducedDeadline = sleepTarget - 1.5;
                if (nextMealEarliest < reducedDeadline) {
                    lastMealDeadline = reducedDeadline;
                    hungerTradeoffApplied = true;
                    effectiveBuffer = 1.5;
                    console.info(`${LOG_PREFIX} [PLANNER.hunger] ⚠️ Severe deficit ${Math.round(quickBudgetKcal)} kcal → buffer 3h→1.5h (eating > starving; Kinsey & Ormsbee, 2015)`, {
                        newDeadline: formatTime(reducedDeadline),
                        sleepTarget: formatTime(sleepTarget),
                        hoursBeforeSleep: (sleepTarget - nextMealEarliest).toFixed(1)
                    });
                }
            } else if (quickBudgetKcal >= 400) {
                // Умеренный дефицит: буфер 3h → 2h
                const reducedDeadline = sleepTarget - 2.0;
                if (nextMealEarliest < reducedDeadline) {
                    lastMealDeadline = reducedDeadline;
                    hungerTradeoffApplied = true;
                    effectiveBuffer = 2.0;
                    console.info(`${LOG_PREFIX} [PLANNER.hunger] ⚠️ Moderate deficit ${Math.round(quickBudgetKcal)} kcal → buffer 3h→2h`, {
                        newDeadline: formatTime(reducedDeadline),
                        sleepTarget: formatTime(sleepTarget)
                    });
                }
            }

            if (!hungerTradeoffApplied) {
                console.info(`${LOG_PREFIX} ℹ️ No time for additional meals (nextMeal >= deadline, deficit ${Math.round(quickBudgetKcal || 0)} kcal)`);
                return {
                    available: true,
                    meals: [],
                    summary: {
                        totalMeals: 0,
                        reason: 'Недостаточно времени до сна для дополнительных приёмов'
                    }
                };
            }
        }

        // === Шаг 4: Рассчитать оставшийся бюджет ===
        const remainingBudget = {
            prot: Math.max(0, (dayTarget.prot || 0) - (dayEaten.prot || 0)),
            carbs: Math.max(0, (dayTarget.carbs || 0) - (dayEaten.carbs || 0)),
            fat: Math.max(0, (dayTarget.fat || 0) - (dayEaten.fat || 0)),
            kcal: Math.max(0, (dayTarget.kcal || 0) - (dayEaten.kcal || 0))
        };

        // Физиологический minimum: если ккал значительный, но нутриент выполнен —
        // применяем floor чтобы product picker предлагал разнообразные продукты
        if (remainingBudget.kcal >= 200) {
            // Минимум 20% ккал из углеводов (~4 ккал/г)
            const minCarbs = Math.round(remainingBudget.kcal * 0.20 / 4);
            if (remainingBudget.carbs < minCarbs) {
                console.info(`${LOG_PREFIX} [PLANNER.budget] ⚠️ Carbs floor applied: goal met, using min ${minCarbs}g for product variety (was ${remainingBudget.carbs}g)`);
                remainingBudget.carbs = minCarbs;
            }
            // Минимум 15% ккал из жиров (~9 ккал/г)
            const minFat = Math.round(remainingBudget.kcal * 0.15 / 9);
            if (remainingBudget.fat < minFat) {
                console.info(`${LOG_PREFIX} [PLANNER.budget] ⚠️ Fat floor applied: goal met, using min ${minFat}g for product variety (was ${remainingBudget.fat}g)`);
                remainingBudget.fat = minFat;
            }
        }

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

        // === S6: Adaptive wave from personal history (estimate) ===
        const personalWaveHours = estimatePersonalWaveHours(days);
        const effectiveProfile = personalWaveHours
            ? { ...profile, insulinWaveHours: personalWaveHours }
            : profile;
        if (personalWaveHours) {
            console.info(`${LOG_PREFIX} [wave] 🧬 Personal wave estimated from history:`, {
                personalWaveHours: personalWaveHours.toFixed(2),
                defaultWave: DEFAULT_WAVE_ESTIMATE_HOURS,
                sampleDays: Math.min(days.length, PERSONAL_WAVE_DAYS_LOOKBACK)
            });
        }

        // === Шаг 5: Цикл планирования приёмов ===
        const plannedMeals = [];
        let cursor = nextMealEarliest;
        let iteration = 0;

        // v1.6: Force multi-meal when total remaining budget exceeds safe single-meal threshold
        //   (Mifflin-St Jeor, 2003; MPS: Areta et al., 2013; GL: Ludwig, 2002)
        //   >900 kcal in one sitting = excessive insulin spike, poor protein synthesis distribution
        const forceMultiMeal = remainingBudget.kcal > MAX_MEAL_KCAL;
        // When forcing multi-meal, use tighter wave estimate and smaller fat burn window
        const effectiveFatBurnMin = forceMultiMeal ? FAT_BURN_WINDOW_MIN_TIGHT : FAT_BURN_WINDOW_MIN;

        // v1.8: while-loop must also use relaxed deadline when forceMultiMeal.
        // Without this, fitsAnotherMeal=true (relaxed deadline) adds meal 1 → cursor moves
        // past lastMealDeadline → while exits before creating meal 2.
        const effectiveDeadline = forceMultiMeal ? lastMealDeadline + 0.5 : lastMealDeadline;

        if (forceMultiMeal) {
            console.info(`${LOG_PREFIX} [PLANNER.split] ⚠️ Force multi-meal: remaining ${Math.round(remainingBudget.kcal)} kcal > ${MAX_MEAL_KCAL} cap, deadline relaxed ${formatTime(lastMealDeadline)} → ${formatTime(effectiveDeadline)}`);
        }

        console.info(`${LOG_PREFIX} [PLANNER.loop] 🔄 Starting meal placement loop:`, {
            startCursor: formatTime(cursor),
            deadline: formatTime(effectiveDeadline),
            availableHours: (effectiveDeadline - cursor).toFixed(1)
        });

        while (cursor < effectiveDeadline && iteration < MAX_MEALS_LIMIT) {
            iteration++;

            // 🆕 v1.3: Оцениваем волну для реально рекомендуемого приёма
            // Предполагаем что можем запланировать ещё 2 приёма → распределяем budget на 2
            // Берём первую часть и оцениваем волну для НЕЁ
            const mealsEstimate = Math.min(2, MAX_MEALS_LIMIT - plannedMeals.length);
            const budgetsEstimate = distributeBudget(remainingBudget, mealsEstimate);
            const budgetForThisMeal = budgetsEstimate[0];

            const estimatedWave = estimateWaveDuration(budgetForThisMeal, effectiveProfile, forceMultiMeal ? remainingBudget.kcal : undefined);
            const waveEndTime = cursor + estimatedWave;
            const fatBurnWindowEnd = waveEndTime + minutesToHours(effectiveFatBurnMin);

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
            // S8 (v2.1.0): When forceMultiMeal on first iteration, use a minimum fixed gap (2h)
            // instead of waiting for full wave + fat burn. Rationale:
            // - Eating 1465 kcal in one sitting → excessive insulin spike, poor MPS distribution
            // - Two meals with 2h gap → partial insulin overlap, but MUCH better protein synthesis
            //   and glycemic load distribution (Areta et al., 2013; Ludwig, 2002)
            // - Personal wave (median meal gap) INCLUDES fat burn + buffer already → double-counting
            // The min gap of 2h allows ~50% insulin decay before second meal (sufficient for physiology)
            const MIN_FORCE_MULTI_GAP_H = 2.0;
            const nextPossibleStart = forceMultiMeal && plannedMeals.length === 0
                ? cursor + Math.min(estimatedWave, MIN_FORCE_MULTI_GAP_H)  // S8: tight 2h gap
                : fatBurnWindowEnd;
            // 🆕 v1.4: Корректный критерий:
            //   1. nextPossibleStart должен быть ДО deadline (sleepTarget - 3h)
            //   2. От nextPossibleStart до sleepTarget должно быть >=2h (чтобы успела пройти хоть часть волны)
            // 🆕 v1.6: When forceMultiMeal — relax hoursToSleep to 1.5h and accept nextMealStart <= deadline + 0.5h
            //   (scientific basis: a smaller 2nd meal has shorter wave, and eating 1600 kcal at once is worse
            //    for health than a slightly late 2nd meal close to sleep)
            const hoursToSleepIfNextMeal = sleepTarget - nextPossibleStart;
            const minHoursToSleep = forceMultiMeal && plannedMeals.length === 0 ? 1.5 : 2.0;
            const deadlineForCheck = forceMultiMeal && plannedMeals.length === 0
                ? lastMealDeadline + 0.5  // relax deadline by 30min for forced split
                : lastMealDeadline;
            const fitsAnotherMeal = nextPossibleStart < deadlineForCheck && hoursToSleepIfNextMeal >= minHoursToSleep;

            console.info(`${LOG_PREFIX} [PLANNER.loop.${iteration}] 🤔 Can fit another meal?`, {
                nextPossibleStart: formatTime(nextPossibleStart),
                deadline: formatTime(lastMealDeadline),
                hoursToSleepIfNext: hoursToSleepIfNextMeal.toFixed(1),
                fitsAnotherMeal,
                forceMultiMeal
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
                    scenario: 'PRE_SLEEP',
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

            // Двигаем курсор — S8: use same tight gap as fitsAnotherMeal check
            cursor = forceMultiMeal ? nextPossibleStart : fatBurnWindowEnd;
        }

        // === Шаг 6: Перераспределить бюджет между найденными приёмами ===
        // v1.5.0: S1 chrono-nutrition + S2 MPS + S3 GL + S4 POST_WORKOUT
        const hoursToSleepPerMeal = plannedMeals.map(m => m.hoursToSleep);
        const mealTimesHours = plannedMeals.map(m => parseTime(m.timeStart));
        const finalBudgets = distributeBudget(remainingBudget, plannedMeals.length, hoursToSleepPerMeal, mealTimesHours);

        for (let i = 0; i < plannedMeals.length; i++) {
            plannedMeals[i].macros = finalBudgets[i];
            // S3: Glycemic Load target (Ludwig, 2002)
            plannedMeals[i].targetGL = plannedMeals[i].hoursToSleep < PRE_SLEEP_BUFFER_HOURS
                ? GL_TARGET_PRE_SLEEP
                : GL_TARGET_DAY;
            // S5: sleep-friendly categories hint
            plannedMeals[i].sleepFriendlyCategories = plannedMeals[i].hoursToSleep < PRE_SLEEP_BUFFER_HOURS
                ? SLEEP_FRIENDLY_CATEGORIES
                : null;
            // Обновить сценарий
            plannedMeals[i].scenario = detectMealScenario(
                i,
                plannedMeals.length,
                finalBudgets[i],
                plannedMeals[i].hoursToSleep
            );
        }

        // S2: Protein-per-Meal MPS Optimization (Areta et al., 2013)
        const optimalProtPerMeal = Math.min(MPS_PROT_MAX_G, Math.round((profile.weight || 70) * MPS_PROT_PER_KG));
        let mpsBoostCount = 0;
        for (const meal of plannedMeals) {
            if (meal.macros.prot < optimalProtPerMeal && meal.macros.kcal > 200) {
                const protDelta = Math.min(optimalProtPerMeal - meal.macros.prot, 15); // cap delta
                meal.macros.prot += protDelta;
                meal.macros.carbs = Math.max(10, meal.macros.carbs - protDelta);
                mpsBoostCount++;
            }
        }
        if (mpsBoostCount > 0) {
            console.info(`${LOG_PREFIX} [mps] 💪 MPS protein boost (${optimalProtPerMeal}г/приём) applied to ${mpsBoostCount} meals`);
        }

        // S4: POST_WORKOUT — override first meal if anabolic window active (Ivy, 2004)
        if (recentWorkout && plannedMeals.length > 0) {
            const postProt = Math.min(Math.round((profile.weight || 70) * 0.35), Math.round(remainingBudget.prot * 0.85));
            const postCarbs = Math.min(Math.round((profile.weight || 70) * 1.0), Math.round(remainingBudget.carbs * 0.85));
            plannedMeals[0].macros.prot = postProt;
            plannedMeals[0].macros.carbs = postCarbs;
            plannedMeals[0].scenario = 'POST_WORKOUT';
            console.info(`${LOG_PREFIX} [workout] 🏋️ POST_WORKOUT macros applied to meal 1:`, {
                prot: postProt, carbs: postCarbs, hoursAgo: (currentTimeHours - parseTime(recentWorkout.endTime)).toFixed(1)
            });
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
        estimatePersonalWaveHours, // S6
        getChronoRatio,            // S1
        // Utilities
        parseTime,
        formatTime,
        minutesToHours
    };

    console.info(`${LOG_PREFIX} 📦 Module loaded v2.2.0 (v2.2.0: wave.duration fix, S8: volume-scaled personal wave, S7: TEF-aware effectiveKcal, PRE_SLEEP threshold 5h, MAX_MEAL_KCAL=${MAX_MEAL_KCAL})`);
    console.info(`${LOG_PREFIX} ✅ Sprint 3 science engine active:`, {
        'S1-Chrono-Nutrition': `Garaulet & Gómez-Abellán, 2014 — MORNING=${CHRONO_RATIO_MORNING} LUNCH=${CHRONO_RATIO_LUNCH} SNACK=${CHRONO_RATIO_SNACK} EVENING=${CHRONO_RATIO_EVENING}`,
        'S2-MPS-Protein': `Areta et al., 2013 — ${MPS_PROT_PER_KG}г/кг на приём, ceiling ${MPS_PROT_MAX_G}г`,
        'S3-GlycemicLoad': `Ludwig, 2002 — GL<${GL_TARGET_DAY} (день), GL<${GL_TARGET_PRE_SLEEP} (pre-sleep)`,
        'S4-POST_WORKOUT': 'Ivy, 2004 — анаболическое окно 2ч: 0.35г/кг белок + 1.0г/кг углеводы',
        'S5-PRE_SLEEP': `Halson, 2014 — sleep-friendly foods: ${SLEEP_FRIENDLY_CATEGORIES.join(', ')}; порог ${PRE_SLEEP_BUFFER_HOURS}ч`,
        'S6-AdaptiveWave': `Персонализация — медиана gap из ${PERSONAL_WAVE_DAYS_LOOKBACK}д истории, min ${PERSONAL_WAVE_MIN_SAMPLES} замеров`,
        'S7-HungerTradeoff': 'Kinsey & Ormsbee, 2015 — deficit≥800→1.5h buffer; ≥400→2h; pre-sleep protein improves MPS',
        'S8-PersonalSleep': 'sleepStart check-in data → real bedtime (supports 1-2 AM owls, clamp [22:00, 02:00])'
    });

})(window);
