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
        let h = Math.floor(hours);
        let m = Math.round((hours - h) * 60);
        // R5-A: carry minutes→hours при rounding edge case (24.999... → 24:60 → 25:00)
        if (m >= 60) { h += 1; m = 0; }
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
            // R1-12: guard от деления на ноль (теоретически все ratio могут быть 0 при сломанных mealTimes)
            if (!Number.isFinite(chronoSum) || chronoSum <= 0) {
                console.warn(`${LOG_PREFIX} [PLANNER.split] ⚠️ chronoSum=0, skipping chrono blend (equal split)`);
                // продолжим без chrono blend — ratio останется adaptive
                // Заполним budgets ниже как обычно
                const budgets = [];
                for (let i = 0; i < mealsCount; i++) {
                    const r = ratio[i] || (1 / mealsCount);
                    budgets.push({
                        prot: Math.round(remainingBudget.prot * r),
                        carbs: Math.round(remainingBudget.carbs * r),
                        fat: Math.round(remainingBudget.fat * r),
                        kcal: Math.round(remainingBudget.kcal * r),
                        effectiveKcal: Math.round(remainingBudget.prot * r) * 3 + Math.round(remainingBudget.carbs * r) * 4 + Math.round(remainingBudget.fat * r) * 9
                    });
                }
                return budgets;
            }
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
            // R5-B: kcal должен соответствовать БЖУ. Раньше брался independent
            // remainingBudget.kcal*r → расхождение с P*4+C*4+F*9 (юзер видел разные
            // цифры). Теперь kcal = P*4+C*4+F*9 — всегда согласован с макросами.
            const mealKcalFromMacros = mealProt * 4 + mealCarbs * 4 + mealFat * 9;
            budgets.push({
                prot: mealProt,
                carbs: mealCarbs,
                fat: mealFat,
                kcal: mealKcalFromMacros,
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
     * R1-10: вес юзера в кг с fallback цепочкой.
     * Разные клиенты сохраняют его по разному (`weight`, `weightKg`, `bodyMassKg`).
     */
    function getWeightKg(profile) {
        const candidates = [profile?.weight, profile?.weightKg, profile?.bodyMassKg];
        for (const c of candidates) {
            const n = Number(c);
            if (Number.isFinite(n) && n > 20 && n < 400) return n;
        }
        return 70;
    }

    /**
     * R1-7: преобразовать sleepStart "HH:MM" в decimal hours относительно "вчера или сегодня".
     * Если час < 12 — считаем "после полуночи" (например, 01:30 → 25.5h).
     */
    function sleepStartToHours(t) {
        if (!t || typeof t !== 'string' || !t.includes(':')) return null;
        const [h, m] = t.split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return h < 12 ? (h + 24) + m / 60 : h + m / 60;
    }

    /**
     * Получить среднее время сна из исторических данных
     * @param {Array<object>} days - исторические дни
     * @param {object} profile - профиль пользователя
     * @param {object} [opts] - { explicitSleepStart, currentTimeHours }
     * @returns {number} - среднее время сна в часах (decimal)
     */
    function estimateSleepTarget(days, profile, opts) {
        const explicit = opts?.explicitSleepStart;

        // R1-3 / R1-14: явный sleepStart, заявленный пользователем СЕГОДНЯ, имеет
        // высший приоритет. Это не предсказание — это план самого юзера на этот день.
        if (explicit && typeof explicit === 'string' && explicit.includes(':')) {
            const explicitHours = sleepStartToHours(explicit);
            if (Number.isFinite(explicitHours)) {
                const clamped = Math.min(26.0, Math.max(22.0, explicitHours));
                console.info(`${LOG_PREFIX} 📊 Sleep target from EXPLICIT day.sleepStart:`, {
                    raw: explicit,
                    sleepTarget: formatTime(clamped),
                    source: 'day_sleepStart_explicit'
                });
                return clamped;
            }
        }

        // === Попытка 0 (v1.9): Среднее sleepStart из данных чек-ина (самый точный источник) ===
        // R1-7: разделяем выборку на "после полуночи" / "до полуночи" — иначе среднее
        // 23:50 + 01:10 = 12:30 → бессмыслица. Решаем кластер по большинству.
        if (days.length >= 3) {
            const sleepStarts = days
                .slice(-14) // 2 недели для надёжности
                .map(d => d.sleepStart)
                .filter(t => t && typeof t === 'string' && t.includes(':'));

            if (sleepStarts.length >= 3) {
                const afterMidnight = []; // часы < 12, прибавим 24
                const beforeMidnight = []; // часы >= 12
                sleepStarts.forEach((t) => {
                    const [h, m] = t.split(':').map(Number);
                    const minutes = h * 60 + m;
                    if (h < 12) afterMidnight.push((h + 24) * 60 + m);
                    else beforeMidnight.push(minutes);
                });
                // Берём кластер большинства. Если поровну — тот, что ближе к currentTime.
                let chosen;
                let source;
                if (afterMidnight.length > beforeMidnight.length) {
                    chosen = afterMidnight; source = 'after_midnight_cluster';
                } else if (beforeMidnight.length > afterMidnight.length) {
                    chosen = beforeMidnight; source = 'before_midnight_cluster';
                } else {
                    // Tie — выбираем кластер, к которому ближе currentTime (если задан)
                    const currentH = Number(opts?.currentTimeHours);
                    if (Number.isFinite(currentH) && currentH < 12) {
                        chosen = afterMidnight; source = 'tie_resolved_by_current_time';
                    } else {
                        chosen = beforeMidnight; source = 'tie_default_evening';
                    }
                }
                const avgMinutes = chosen.reduce((a, b) => a + b, 0) / chosen.length;
                const sleepHours = avgMinutes / 60;
                const clamped = Math.min(26.0, Math.max(22.0, sleepHours));
                console.info(`${LOG_PREFIX} 📊 Sleep target from check-in data (sleepStart):`, {
                    sampleSize: sleepStarts.length,
                    afterMidnightCount: afterMidnight.length,
                    beforeMidnightCount: beforeMidnight.length,
                    avgSleepTime: formatTime(sleepHours),
                    sleepTarget: formatTime(clamped),
                    wasClamped: Math.abs(sleepHours - clamped) > 0.01,
                    source
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
                const estimatedRaw = avgLastMeal + 3;
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

        // R3-3: при cold start (мало истории) явный profile.sleepTarget важнее дефолта.
        if (profile?.sleepTarget) {
            console.info(`${LOG_PREFIX} 📊 Sleep target from profile.sleepTarget (cold start):`, {
                value: profile.sleepTarget,
                source: 'profile_default'
            });
            return parseTime(profile.sleepTarget);
        }

        // Фоллбек: 23:00
        console.info(`${LOG_PREFIX} 📊 Sleep target fallback 23:00 (no history, no profile setting)`);
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
            dayTarget: dayTargetRaw = {},
            dayEaten = {},
            profile = {},
            days = [],
            pIndex = {},
            daySleepStart = null,
            isRefeedDay = false,
            stressMoodSignals = null,
            waveOverlapPct = null,
            scenarioHint = null // R5-D: recommender scenario (MICRONUTRIENT_FOCUS, MOOD_SUPPORT_BREAKFAST)
        } = params;

        // R2-6: нормализуем входные данные. Незаданные поля приводим к 0, а не undefined,
        // чтобы избежать NaN в дальнейших вычислениях.
        const dayTarget = {
            kcal: Number(dayTargetRaw?.kcal) || 0,
            prot: Number(dayTargetRaw?.prot) || Number(dayTargetRaw?.protein) || 0,
            carbs: Number(dayTargetRaw?.carbs) || Number(dayTargetRaw?.carb) || 0,
            fat: Number(dayTargetRaw?.fat) || 0
        };

        console.info(`${LOG_PREFIX} [PLANNER.entry] 🍽️ planRemainingMeals called:`, {
            currentTime,
            lastMealTime: lastMeal?.time,
            lastMealTotals: lastMeal?.totals,
            hasInsulinWave: !!HEYS.InsulinWave,
            daysCount: days.length,
            dayTarget,
            dayEaten,
            daySleepStart: daySleepStart || 'inherit',
            isRefeedDay
        });

        // Validate
        if (!currentTime) {
            console.warn(`${LOG_PREFIX} ❌ Missing currentTime`);
            return { available: false, error: 'Missing required data' };
        }

        // v2.3.0: Support "first meal of day" — no lastMeal means no active wave
        let hasLastMeal = !!lastMeal?.time;

        if (!HEYS.InsulinWave?.calculate) {
            console.warn(`${LOG_PREFIX} ❌ InsulinWave module not available`);
            return { available: false, error: 'InsulinWave module missing' };
        }

        // R2-6: без kcal-таргета planner не может ничего полезного сделать.
        // Возвращаем явный сигнал — UI покажет fallback на single-meal рекомендацию.
        if (!dayTarget.kcal || dayTarget.kcal < 500) {
            console.warn(`${LOG_PREFIX} ❌ dayTarget.kcal missing or implausibly low (${dayTarget.kcal}). Planner skipped.`);
            return { available: false, error: 'NO_TARGET' };
        }

        const currentTimeHours = parseTime(currentTime);
        let lastMealTimeHours = hasLastMeal ? parseTime(lastMeal.time) : null;

        // R3-1: если последний приём был вчера вечером (≥20:00), а сейчас утро (<12:00),
        // волна давно закончилась — между ними была ночь. Программа должна считать
        // это "first meal of day", а не тащить волну с прошлого вечера.
        if (hasLastMeal && lastMealTimeHours >= 20 && currentTimeHours < 12) {
            console.info(`${LOG_PREFIX} [PLANNER.wave] 🌙→☀️ Late dinner crossed night: lastMeal=${lastMeal.time}, current=${currentTime}. Wave reset (first meal of new day).`);
            hasLastMeal = false;
            lastMealTimeHours = null;
        }

        // === Шаг 1: Рассчитать конец текущей инсулиновой волны ===
        let currentWaveEnd = null;
        let currentWaveData = null;

        if (hasLastMeal) {
            try {
                // R-WAVE-API: правильный API HEYS.InsulinWave.calculate ожидает
                // { meals: [...], pIndex, baseWaveHours, trainings, dayData }, а не
                // { lastMealTime, nutrients, ... }. Раньше всегда срабатывал fallback на 3ч.
                const getProductFromItem = (item) => {
                    if (pIndex?.byId?.get) return pIndex.byId.get(item?.productId || item?.product_id) || item;
                    if (pIndex && typeof pIndex === 'object' && pIndex[item?.productId]) return pIndex[item.productId];
                    return item;
                };

                currentWaveData = HEYS.InsulinWave.calculate({
                    meals: [lastMeal],
                    pIndex,
                    getProductFromItem,
                    baseWaveHours: profile?.insulinWaveHours || 3,
                    trainings: params.currentDay?.workouts || params.currentDay?.trainings || [],
                    dayData: {
                        sleepHours: profile?.sleepHours,
                        sleepQuality: params.currentDay?.sleepQuality,
                        waterMl: params.currentDay?.waterMl,
                        stressAvg: params.currentDay?.stressAvg,
                        householdMin: params.currentDay?.householdMin,
                        steps: params.currentDay?.steps,
                        profile
                    }
                });

                if (currentWaveData?.duration) {
                    // R-WAVE-API: duration в МИНУТАХ от InsulinWave. Преобразуем
                    // в часы через locale parseTime (HEYS.utils.timeToMinutes не существует).
                    currentWaveEnd = parseTime(lastMeal.time) + currentWaveData.duration / 60;
                    console.info(`${LOG_PREFIX} [PLANNER.wave] 📊 Current insulin wave calculated:`, {
                        lastMeal: lastMeal.time,
                        waveDuration: currentWaveData.duration,
                        waveHours: (currentWaveData.duration / 60).toFixed(2),
                        waveEnd: formatTime(currentWaveEnd),
                        remaining: currentWaveData.remaining,
                        progress: typeof currentWaveData.progress === 'number' ? currentWaveData.progress.toFixed(1) + '%' : '?',
                        endTimeDisplay: currentWaveData.endTimeDisplay,
                        baseWaveHours: currentWaveData.baseWaveHours,
                        finalMultiplier: currentWaveData.finalMultiplier
                    });
                }
            } catch (err) {
                console.warn(`${LOG_PREFIX} ⚠️ Failed to calculate current wave:`, err.message);
            }

            // R2-7: явный лог fallback'а волны. Раньше "молча" использовался дефолт 3ч —
            // невозможно было понять, почему планнер ошибается с волной у конкретного юзера.
            if (!currentWaveEnd) {
                const personalWave = Number(profile?.insulinWaveHours);
                const baseWave = Number.isFinite(personalWave) && personalWave > 0 ? personalWave : 3;
                currentWaveEnd = lastMealTimeHours + baseWave;
                console.warn(`${LOG_PREFIX} ⚠️ [PLANNER.wave] InsulinWave.calculate fallback used:`, {
                    lastMeal: formatTime(lastMealTimeHours),
                    waveEnd: formatTime(currentWaveEnd),
                    baseWaveHours: baseWave,
                    sourceOfBaseWave: Number.isFinite(personalWave) ? 'profile.insulinWaveHours' : 'hardcoded_default_3h',
                    reason: 'currentWaveData?.duration was undefined or InsulinWave throw'
                });
            }
        } else {
            // v2.3.0: No last meal — first meal of day, no active insulin wave
            console.info(`${LOG_PREFIX} [PLANNER.wave] 🌅 First meal of day — no active insulin wave, starting from now`);
        }

        // === Шаг 2: +30 мин жиросжигания ===
        // v2.3.0: When no lastMeal, skip fat burn window — just start from currentTime
        const fatBurnEnd = currentWaveEnd ? currentWaveEnd + minutesToHours(FAT_BURN_WINDOW_MIN) : currentTimeHours;
        let nextMealEarliest = Math.max(currentTimeHours, fatBurnEnd);

        // R3-4: интервальное голодание. Если у юзера задан profile.fastingWindow,
        // первый приём не может быть раньше окончания окна голодания.
        // Поддерживаемые формы: { start: 'HH:MM', end: 'HH:MM' } или { eatStart, eatEnd }.
        const fw = profile?.fastingWindow || profile?.fasting;
        if (fw) {
            const eatStartStr = fw.eatStart || fw.end || fw.windowStart;
            const eatStartHours = parseTime(eatStartStr);
            // Если ещё не наступило окно еды (current до eatStart) и eatStart разумен (>currentTime, <currentTime+12h)
            if (Number.isFinite(eatStartHours) && eatStartHours > currentTimeHours && eatStartHours - currentTimeHours < 12) {
                if (eatStartHours > nextMealEarliest) {
                    console.info(`${LOG_PREFIX} [PLANNER.fasting] ⏳ IF window: eatStart=${eatStartStr}, shifting nextMealEarliest ${formatTime(nextMealEarliest)} → ${formatTime(eatStartHours)}`);
                    nextMealEarliest = eatStartHours;
                }
            }
        }

        console.info(`${LOG_PREFIX} [PLANNER.fatburn] 🔥 Fat burn window calculated:`, {
            waveEnd: formatTime(currentWaveEnd),
            fatBurnWindowMin: FAT_BURN_WINDOW_MIN,
            fatBurnEnd: formatTime(fatBurnEnd),
            currentTime: formatTime(currentTimeHours),
            nextMealEarliest: formatTime(nextMealEarliest),
            fastingApplied: !!fw
        });

        // === Шаг 3: Определить время сна и deadline последнего приёма ===
        // R1-3 / R1-14: явный daySleepStart от UI имеет высший приоритет над усреднением.
        const sleepTarget = estimateSleepTarget(days, profile, {
            explicitSleepStart: daySleepStart,
            currentTimeHours
        });
        let lastMealDeadline = sleepTarget - PRE_SLEEP_BUFFER_HOURS;
        let hungerTradeoffApplied = false;
        let effectiveBuffer = PRE_SLEEP_BUFFER_HOURS;

        // R4-5: moderate stress + late evening → сдвигаем deadline раньше на 30 мин.
        // Стресс + поздняя еда → кортизол + пик инсулина перед сном → плохой сон
        // (Halson 2014). Высокий stress уже захвачен STRESS_EATING сценарием;
        // здесь корректируем для moderate уровня.
        // R6-A: применяем shift только если после сдвига остаётся время поесть
        // (deadline > currentTime). Иначе получим availableWindow с negative
        // длиной (deadline в прошлом) — приходится откатывать через hunger
        // tradeoff. Если сдвиг ломает план — пропускаем его.
        if (stressMoodSignals?.stressLevel === 'moderate' && currentTimeHours >= 20) {
            const shiftedDeadline = lastMealDeadline - 0.5;
            if (shiftedDeadline > currentTimeHours) {
                lastMealDeadline = shiftedDeadline;
                effectiveBuffer = PRE_SLEEP_BUFFER_HOURS + 0.5;
                console.info(`${LOG_PREFIX} [PLANNER.sleep] 🧘 Moderate stress + late evening → deadline сдвинут на 30 мин раньше`);
            } else {
                console.info(`${LOG_PREFIX} [PLANNER.sleep] 🧘 Moderate stress shift пропущен: shifted deadline (${formatTime(shiftedDeadline)}) уже в прошлом от currentTime (${formatTime(currentTimeHours)})`);
            }
        }

        console.info(`${LOG_PREFIX} [PLANNER.sleep] 🌙 Sleep planning:`, {
            sleepTarget: formatTime(sleepTarget),
            preSleepBuffer: effectiveBuffer,
            lastMealDeadline: formatTime(lastMealDeadline),
            availableWindow: `${formatTime(nextMealEarliest)} → ${formatTime(lastMealDeadline)}`,
            stressLevel: stressMoodSignals?.stressLevel,
            moodLevel: stressMoodSignals?.moodLevel
        });

        // === S4: POST_WORKOUT detection (Ivy, 2004) ===
        // R4-8: расширенное окно recovery. Ivy 2004 говорит про 2ч anabolic
        // window, но Areta et al. 2013 показывает что MPS повышен до 24-48ч.
        // Делаем градиент: full POST_WORKOUT в 0-2ч, плавно снижающийся
        // recoveryFactor в 2-24ч (применяется к MPS_PROT_PER_KG в финальном
        // распределении). Также различаем strength (priority белок) vs cardio
        // (priority углеводы).
        const allWorkouts = params.currentDay?.workouts || params.currentDay?.trainings || [];
        // Найти последнюю тренировку в окне 24ч
        let lastWorkout = null;
        let hoursAfterWorkout = null;
        for (const w of allWorkouts) {
            const wTime = w.endTime || w.time;
            if (!wTime) continue;
            const wHours = parseTime(wTime);
            const delta = currentTimeHours - wHours;
            if (delta >= 0 && delta < 24) {
                if (!lastWorkout || delta < hoursAfterWorkout) {
                    lastWorkout = w;
                    hoursAfterWorkout = delta;
                }
            }
        }
        // POST_WORKOUT scenario (0-2ч) — для применения к meal[0]
        const recentWorkout = lastWorkout && hoursAfterWorkout < 2 ? lastWorkout : null;
        // Recovery factor: 1.0 в 0-2ч, плавно снижается до 0 в 24ч
        let workoutRecoveryFactor = 0;
        if (lastWorkout && hoursAfterWorkout !== null) {
            if (hoursAfterWorkout < 2) workoutRecoveryFactor = 1.0;
            else if (hoursAfterWorkout < 6) workoutRecoveryFactor = 0.15;
            else if (hoursAfterWorkout < 12) workoutRecoveryFactor = 0.10;
            else if (hoursAfterWorkout < 24) workoutRecoveryFactor = 0.05;
        }
        const workoutType = (lastWorkout?.type || 'unknown').toLowerCase();
        const isStrength = ['strength', 'силовая', 'sila', 'resistance'].some(s => workoutType.includes(s));
        const isCardio = ['cardio', 'кардио', 'run', 'cycling', 'bike'].some(s => workoutType.includes(s));
        if (lastWorkout) {
            console.info(`${LOG_PREFIX} [PLANNER.recovery] 💪 Workout recovery:`, {
                endTime: lastWorkout.endTime || lastWorkout.time,
                hoursAgo: hoursAfterWorkout.toFixed(1),
                type: workoutType,
                recoveryFactor: workoutRecoveryFactor.toFixed(2),
                scenario: recentWorkout ? 'POST_WORKOUT (full)' : 'recovery tail (gradient)',
                isStrength,
                isCardio
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
                // R1-8: малый дефицит (50-400 kcal) + остаётся ≥2ч до сна → один лёгкий
                // белковый приём вместо пустоты. Лечь с дырой в 200 kcal "под рукой" —
                // это голодная ночь без причины, а казеин/творог перед сном не вредят
                // (Kinsey & Ormsbee 2015 — pre-sleep protein, MPS overnight).
                const hoursToSleep = sleepTarget - currentTimeHours;
                if (quickBudgetKcal >= 50 && hoursToSleep >= 2.0 && hoursToSleep <= 4.0) {
                    const lightStart = Math.max(currentTimeHours + 0.25, sleepTarget - 2.5);
                    const lightEnd = Math.min(sleepTarget - 1.5, lightStart + 0.5);
                    const protTarget = Math.min(25, Math.max(15, Math.round(quickBudgetKcal * 0.6 / 4)));
                    const lightMeal = {
                        index: 0,
                        timeStart: formatTime(lightStart),
                        timeEnd: formatTime(lightEnd),
                        estimatedWaveEnd: formatTime(lightStart + 1.5),
                        fatBurnWindow: { start: formatTime(lightStart + 1.5), end: formatTime(lightStart + 2.0) },
                        macros: {
                            prot: protTarget,
                            carbs: Math.max(5, Math.round(quickBudgetKcal * 0.2 / 4)),
                            fat: Math.max(3, Math.round(quickBudgetKcal * 0.2 / 9)),
                            kcal: Math.round(quickBudgetKcal),
                            effectiveKcal: protTarget * 3 + Math.round(quickBudgetKcal * 0.2 / 4) * 4 + Math.round(quickBudgetKcal * 0.2 / 9) * 9
                        },
                        isActionable: true,
                        isLast: true,
                        scenario: 'PRE_SLEEP',
                        hoursToSleep: sleepTarget - lightStart,
                        targetGL: GL_TARGET_PRE_SLEEP,
                        sleepFriendlyCategories: SLEEP_FRIENDLY_CATEGORIES,
                        stableId: `light|${formatTime(lightStart)}|PRE_SLEEP|0`
                    };
                    console.info(`${LOG_PREFIX} [PLANNER.light] 🥛 Tiny deficit ${Math.round(quickBudgetKcal)} kcal + ${hoursToSleep.toFixed(1)}h to sleep → single light protein meal`);
                    return {
                        available: true,
                        meals: [lightMeal],
                        summary: {
                            totalMeals: 1,
                            timelineStart: lightMeal.timeStart,
                            timelineEnd: lightMeal.timeEnd,
                            totalMacros: { prot: lightMeal.macros.prot, carbs: lightMeal.macros.carbs, kcal: lightMeal.macros.kcal },
                            sleepTarget: formatTime(sleepTarget),
                            lastMealDeadline: formatTime(sleepTarget - 1.5),
                            reason: 'Лёгкий белковый приём перед сном (малый остаток)'
                        }
                    };
                }
                console.info(`${LOG_PREFIX} ℹ️ No time for additional meals (nextMeal >= deadline, deficit ${Math.round(quickBudgetKcal || 0)} kcal, hoursToSleep ${hoursToSleep.toFixed(1)}h)`);
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

        // R4-2: `estimatePersonalWaveHours` считает медиану ГЭПОВ между приёмами,
        // а не длительность инсулиновой волны. Gap = wave + пауза без еды.
        // Раньше эта медиана override-ила `profile.insulinWaveHours`, искажая
        // расчёт волны для будущих приёмов (планнер растягивал план).
        // Теперь: считаем медиану как user meal gap median (для информации в логах),
        // но НЕ переопределяем insulinWaveHours. Будущие волны считаются через
        // estimateWaveDuration → реальные модификаторы по составу.
        const userMealGapMedian = estimatePersonalWaveHours(days);
        const effectiveProfile = profile; // R4-2: больше не подменяем insulinWaveHours
        if (userMealGapMedian) {
            console.info(`${LOG_PREFIX} [wave] 🧬 User meal gap median (НЕ длительность волны):`, {
                userMealGapMedianHours: userMealGapMedian.toFixed(2),
                note: 'used for diagnostics only — wave duration comes from estimateWaveDuration per meal',
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

            // R1-9 / R3-2: Динамический gap для forceMultiMeal. Раньше был фикс 2ч,
            // что для тяжёлого приёма (большая волна) недостаточно — следующая волна
            // накладывается на предыдущую перед сном. Теперь gap = max(2ч, 75% волны).
            // Это сохраняет wave-aware физиологию, не возвращаясь к жёсткой константе.
            const MIN_FORCE_MULTI_GAP_H_FLOOR = 2.0;
            const dynamicForceGap = Math.max(MIN_FORCE_MULTI_GAP_H_FLOOR, estimatedWave * 0.75);
            const nextPossibleStart = forceMultiMeal && plannedMeals.length === 0
                ? cursor + Math.min(estimatedWave, dynamicForceGap)
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

            // Двигаем курсор — R1-9: используем тот же dynamicForceGap, что и в fitsAnotherMeal check
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
            // R5-D / R6-B: detectMealScenario может перезаписать recommender scenario.
            // Сохраняем оригинал. Для первого приёма (actionable) — приоритет scenarioHint
            // от recommender если он более специфичен (нести смысл, которого нет в
            // generic PRE_SLEEP/LIGHT_SNACK/PROTEIN_DEFICIT/BALANCED).
            const baselineScenario = detectMealScenario(
                i,
                plannedMeals.length,
                finalBudgets[i],
                plannedMeals[i].hoursToSleep
            );
            const isFirstMeal = i === 0;
            // R6-B: расширили список специфичных сценариев. Все scenario от
            // recommender кроме generic BALANCED — несут осмысленную нагрузку.
            const genericScenarios = ['BALANCED', 'PRE_SLEEP', 'LIGHT_SNACK', 'PROTEIN_DEFICIT'];
            const isSpecificHint = scenarioHint && !genericScenarios.includes(scenarioHint);
            if (isFirstMeal && isSpecificHint) {
                plannedMeals[i].scenario = scenarioHint;
                plannedMeals[i].scenarioBaseline = baselineScenario;
                plannedMeals[i].scenarioSource = 'recommender';
            } else {
                plannedMeals[i].scenario = baselineScenario;
                plannedMeals[i].scenarioSource = 'planner';
            }
        }

        // S2: Protein-per-Meal MPS Optimization (Areta et al., 2013)
        // R1-10: используем getWeightKg с fallback цепочкой вместо profile.weight || 70
        // R4-8: при recovery (>2ч после strength) повышаем target белка на 5-15%
        // для распределённого MPS (Areta 2013: повышенный MPS до 24-48ч).
        const weightKg = getWeightKg(profile);
        let mpsProtPerKgEffective = MPS_PROT_PER_KG;
        if (workoutRecoveryFactor > 0 && !recentWorkout) {
            // post-workout 0-2ч обрабатывается отдельно ниже (POST_WORKOUT override)
            // здесь — recovery tail для всех meals
            const boost = isStrength ? 0.15 : isCardio ? 0.05 : 0.10;
            mpsProtPerKgEffective = MPS_PROT_PER_KG * (1 + boost * workoutRecoveryFactor);
            console.info(`${LOG_PREFIX} [PLANNER.recovery] 💪 MPS_PROT_PER_KG boosted ${MPS_PROT_PER_KG.toFixed(2)} → ${mpsProtPerKgEffective.toFixed(2)} (recovery tail, ${isStrength ? 'strength' : isCardio ? 'cardio' : 'mixed'})`);
        }
        const optimalProtPerMeal = Math.min(MPS_PROT_MAX_G, Math.round(weightKg * mpsProtPerKgEffective));
        let mpsBoostCount = 0;
        for (const meal of plannedMeals) {
            if (meal.macros.prot < optimalProtPerMeal && meal.macros.kcal > 200) {
                const protDelta = Math.min(optimalProtPerMeal - meal.macros.prot, 15); // cap delta
                meal.macros.prot += protDelta;
                // R1-11: вычитая углеводы, мы теряли ~4 ккал/г, а добавленный белок даёт
                // +4 ккал/г → нетто 0 (углевод и белок изоэнергетичны).
                // Поправка: убираем меньше углеводов, чтобы общий kcal не падал.
                // 1 г белка = 4 ккал, 1 г углеводов = 4 ккал → 1:1 замена.
                const carbsBefore = meal.macros.carbs;
                meal.macros.carbs = Math.max(10, meal.macros.carbs - protDelta);
                const actualCarbsRemoved = carbsBefore - meal.macros.carbs;
                // Если потеряли меньше углеводов чем добавили белка (упёрлись в минимум 10г) —
                // компенсируем разницу из жиров чтобы kcal не вырос.
                if (actualCarbsRemoved < protDelta) {
                    const kcalSurplus = (protDelta - actualCarbsRemoved) * 4; // лишние ккал от белка
                    const fatToTrim = Math.min(Math.round(kcalSurplus / 9), Math.max(0, meal.macros.fat - 3));
                    if (fatToTrim > 0) {
                        meal.macros.fat -= fatToTrim;
                    }
                }
                // Пересчёт kcal из БЖУ — чтобы summary не разъезжалось с фактическими макросами
                meal.macros.kcal = meal.macros.prot * 4 + meal.macros.carbs * 4 + meal.macros.fat * 9;
                meal.macros.effectiveKcal = meal.macros.prot * 3 + meal.macros.carbs * 4 + meal.macros.fat * 9;
                mpsBoostCount++;
            }
        }
        if (mpsBoostCount > 0) {
            console.info(`${LOG_PREFIX} [mps] 💪 MPS protein boost (${optimalProtPerMeal}г/приём, weight ${weightKg}кг) applied to ${mpsBoostCount} meals; kcal preserved`);
        }

        // S4: POST_WORKOUT — override first meal if anabolic window active (Ivy, 2004)
        if (recentWorkout && plannedMeals.length > 0) {
            // R1-10: тот же getWeightKg вместо profile.weight || 70
            const postProt = Math.min(Math.round(weightKg * 0.35), Math.round(remainingBudget.prot * 0.85));
            const postCarbs = Math.min(Math.round(weightKg * 1.0), Math.round(remainingBudget.carbs * 0.85));
            plannedMeals[0].macros.prot = postProt;
            plannedMeals[0].macros.carbs = postCarbs;
            plannedMeals[0].scenario = 'POST_WORKOUT';
            console.info(`${LOG_PREFIX} [workout] 🏋️ POST_WORKOUT macros applied to meal 1:`, {
                prot: postProt, carbs: postCarbs, hoursAgo: (currentTimeHours - parseTime(recentWorkout.endTime)).toFixed(1)
            });
        }

        // R6-C: heavy meal pre-sleep cap. При hoursToSleep < PRE_SLEEP_BUFFER_HOURS
        // (3ч) hunger tradeoff может пропустить тяжёлый ужин близко к сну. Такой
        // приём даёт инсулиновую волну во время сна → плохой сон (Halson 2014).
        // Клиппинг: если kcal > 400 И hoursToSleep < 3 → урезаем kcal до 400,
        // приоритет белку (для MPS overnight), углеводы и жиры пропорционально
        // вниз. Лишний дефицит лучше тяжёлой ночи.
        const PRE_SLEEP_HEAVY_KCAL_CAP = 400;
        for (const meal of plannedMeals) {
            const hSleep = Number(meal.hoursToSleep) || 0;
            if (hSleep > 0 && hSleep < PRE_SLEEP_BUFFER_HOURS && (meal.macros.kcal || 0) > PRE_SLEEP_HEAVY_KCAL_CAP) {
                const beforeKcal = meal.macros.kcal;
                // Сохраняем белок (важен для overnight MPS), масштабируем углеводы и жиры
                const proteinKcal = (meal.macros.prot || 0) * 4;
                const remainingCapKcal = Math.max(0, PRE_SLEEP_HEAVY_KCAL_CAP - proteinKcal);
                const currentCarbsKcal = (meal.macros.carbs || 0) * 4;
                const currentFatKcal = (meal.macros.fat || 0) * 9;
                const currentNonProteinKcal = currentCarbsKcal + currentFatKcal;
                if (currentNonProteinKcal > 0) {
                    const scale = remainingCapKcal / currentNonProteinKcal;
                    meal.macros.carbs = Math.round((meal.macros.carbs || 0) * scale);
                    meal.macros.fat = Math.round((meal.macros.fat || 0) * scale);
                }
                console.info(`${LOG_PREFIX} [PLANNER.presleep] 🛌 Heavy pre-sleep cap: meal ${formatTime(parseTime(meal.timeStart))}, hoursToSleep=${hSleep.toFixed(1)}, kcal ${Math.round(beforeKcal)} → cap ${PRE_SLEEP_HEAVY_KCAL_CAP}. Белок сохранён, carbs/fat урезаны.`);
                meal.presleepCapped = true;

                // R7-A: пересчитать estimatedWaveEnd и fatBurnWindow под новый
                // (меньший) приём. Иначе UI показывает «волна до 01:17» от старого
                // тяжёлого расчёта — пугает юзера, противоречит факту cap'а.
                try {
                    const newWaveHours = estimateWaveDuration(meal.macros, effectiveProfile);
                    const mealStart = parseTime(meal.timeStart);
                    const newWaveEnd = mealStart + newWaveHours;
                    const newFatBurnEnd = newWaveEnd + minutesToHours(FAT_BURN_WINDOW_MIN);
                    meal.estimatedWaveEnd = formatTime(newWaveEnd);
                    meal.fatBurnWindow = {
                        start: formatTime(newWaveEnd),
                        end: formatTime(newFatBurnEnd)
                    };
                    console.info(`${LOG_PREFIX} [PLANNER.presleep] 🌊 Wave recomputed for capped meal: waveEnd ${meal.estimatedWaveEnd}, fatBurn ${meal.fatBurnWindow.start} → ${meal.fatBurnWindow.end} (${newWaveHours.toFixed(1)}ч)`);
                } catch (e) {
                    console.warn(`${LOG_PREFIX} [PLANNER.presleep] ⚠️ wave recompute failed: ${e.message}`);
                }
            }
        }

        // R5-B: финальный guard — после всех модификаций (POST_WORKOUT, MPS-бус,
        // R6-C presleep cap) гарантируем что meal.macros.kcal согласован с БЖУ.
        for (const meal of plannedMeals) {
            const recomputed = (meal.macros.prot || 0) * 4 + (meal.macros.carbs || 0) * 4 + (meal.macros.fat || 0) * 9;
            if (Math.abs(recomputed - (meal.macros.kcal || 0)) > 5) {
                console.info(`${LOG_PREFIX} [PLANNER.kcal] 🔧 kcal recomputed from macros: ${Math.round(meal.macros.kcal)} → ${recomputed} (P${meal.macros.prot}*4+C${meal.macros.carbs}*4+F${meal.macros.fat}*9)`);
            }
            meal.macros.kcal = recomputed;
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
        // R4-6: advisories — диагностические подсказки из истории паттернов.
        const advisories = [];
        if (Number.isFinite(waveOverlapPct) && waveOverlapPct > 40) {
            advisories.push({
                key: 'wave_overlap',
                severity: waveOverlapPct > 60 ? 'high' : 'medium',
                text: `Часто ешь до окончания волны (${Math.round(waveOverlapPct)}% дней). Попробуй держать gap ≥4ч между приёмами для жиросжигания.`
            });
        }
        if (stressMoodSignals?.stressLevel === 'high') {
            advisories.push({
                key: 'high_stress',
                severity: 'medium',
                text: 'Высокий стресс — лёгкий ужин и магний-богатые продукты улучшат сон.'
            });
        }

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
            lastMealDeadline: formatTime(lastMealDeadline),
            advisories: advisories.length > 0 ? advisories : undefined
        };

        return {
            available: true,
            meals: annotateStableIds(plannedMeals),
            summary
        };
    }

    function recalculateSummaryFromMeals(meals, summary, fallbackSleepTarget, fallbackDeadline) {
        const safeMeals = Array.isArray(meals) ? meals : [];
        if (!safeMeals.length) {
            return {
                totalMeals: 0,
                timelineStart: null,
                timelineEnd: null,
                totalMacros: { prot: 0, carbs: 0, kcal: 0 },
                sleepTarget: fallbackSleepTarget || summary?.sleepTarget,
                lastMealDeadline: fallbackDeadline || summary?.lastMealDeadline
            };
        }

        return {
            totalMeals: safeMeals.length,
            timelineStart: safeMeals[0]?.timeStart || null,
            timelineEnd: safeMeals[safeMeals.length - 1]?.timeEnd || null,
            totalMacros: {
                prot: safeMeals.reduce((sum, meal) => sum + (meal?.macros?.prot || 0), 0),
                carbs: safeMeals.reduce((sum, meal) => sum + (meal?.macros?.carbs || 0), 0),
                kcal: safeMeals.reduce((sum, meal) => sum + (meal?.macros?.kcal || 0), 0)
            },
            sleepTarget: summary?.sleepTarget || fallbackSleepTarget,
            lastMealDeadline: summary?.lastMealDeadline || fallbackDeadline
        };
    }

    function buildMealStableId(meal, index) {
        const start = meal?.timeStart || 'na';
        const end = meal?.timeEnd || 'na';
        const scenario = meal?.scenario || 'BALANCED';
        return `${start}|${end}|${scenario}|${index}`;
    }

    function annotateStableIds(meals) {
        return (meals || []).map((meal, index) => ({
            ...meal,
            stableId: meal?.stableId || buildMealStableId(meal, index)
        }));
    }

    function validateReplanResult(planResult, fallbackBudget = 0) {
        if (!planResult || planResult.available !== true) {
            return { valid: false, reason: 'Plan unavailable' };
        }
        const meals = planResult.meals || [];
        const summary = planResult.summary || {};
        const totalKcal = Number(summary?.totalMacros?.kcal || 0);
        const timelineBroken = meals.some((meal) => !meal?.timeStart || !meal?.timeEnd);
        const macrosBroken = meals.some((meal) => {
            const kcal = Number(meal?.macros?.kcal);
            const prot = Number(meal?.macros?.prot);
            const carbs = Number(meal?.macros?.carbs);
            const fat = Number(meal?.macros?.fat || 0);
            return !Number.isFinite(kcal) || !Number.isFinite(prot) || !Number.isFinite(carbs) || !Number.isFinite(fat) || kcal < 0 || prot < 0 || carbs < 0 || fat < 0;
        });

        if (timelineBroken) return { valid: false, reason: 'Invalid timeline fields' };
        if (macrosBroken) return { valid: false, reason: 'Invalid macro fields' };
        if (fallbackBudget > 120 && meals.length === 0) return { valid: false, reason: 'Empty meals with positive budget' };
        if (!Number.isFinite(totalKcal) || totalKcal < 0) return { valid: false, reason: 'Invalid summary kcal' };
        return { valid: true };
    }

    function replanRemainingMeals(params) {
        const {
            lockedMeals = [],
            previousPlanState = null,
            replanReason = 'EXTERNAL_REPLAN_REQUEST'
        } = params || {};

        const basePlan = planRemainingMeals(params);
        if (!basePlan?.available) return basePlan;

        const lockByIndex = new Map();
        const lockByStableId = new Map();
        lockedMeals.forEach((lock) => {
            if (typeof lock?.index === 'number') lockByIndex.set(lock.index, lock);
            if (typeof lock?.stableId === 'string' && lock.stableId) lockByStableId.set(lock.stableId, lock);
        });

        const annotatedMeals = annotateStableIds(basePlan.meals || []);
        const meals = annotatedMeals.map((meal, index) => {
            const locked = lockByStableId.get(meal.stableId) || lockByIndex.get(index);
            if (!locked) return meal;
            return {
                ...meal,
                timeStart: locked.timeStart || meal.timeStart,
                timeEnd: locked.timeEnd || meal.timeEnd,
                macros: locked.macros || meal.macros,
                scenario: locked.scenario || meal.scenario,
                stableId: locked.stableId || meal.stableId,
                locked: true
            };
        });

        const summary = recalculateSummaryFromMeals(
            meals,
            basePlan.summary,
            basePlan.summary?.sleepTarget,
            basePlan.summary?.lastMealDeadline
        );

        const remainingBudgetKcal = Math.max(0, (params?.dayTarget?.kcal || 0) - (params?.dayEaten?.kcal || 0));
        const validation = validateReplanResult({ available: true, meals, summary }, remainingBudgetKcal);
        summary.replanMeta = {
            incremental: true,
            reason: replanReason,
            lockedMealsCount: lockByStableId.size || lockByIndex.size,
            previousPlanVersion: previousPlanState?.planVersion || null,
            valid: validation.valid,
            validationReason: validation.reason || null,
            generatedAt: Date.now()
        };

        if (!validation.valid) {
            return {
                available: false,
                error: validation.reason || 'Invalid incremental plan',
                meals: [],
                summary
            };
        }

        return {
            ...basePlan,
            meals,
            summary
        };
    }

    // === Export ===
    HEYS.InsightsPI.mealPlanner = {
        planRemainingMeals,
        replanRemainingMeals,
        estimateSleepTarget,
        estimateWaveDuration,
        distributeBudget,
        estimatePersonalWaveHours, // S6
        getChronoRatio,            // S1
        validateReplanResult,
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
