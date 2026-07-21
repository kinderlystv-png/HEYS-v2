/**
 * HEYS Predictive Insights — Multi-Meal Timeline Planner v2.3.0
 * 
 * Планирует все оставшиеся приёмы пищи до сна с учётом:
 * - Единого расчётного окна после еды (HEYS.InsulinWave.calculate)
 * - Научно обоснованного времени последнего приёма (sleepTarget - buffer)
 * - Персонального паттерна сна (sleepStart из чек-ина)
 * - Распределения макросов между приёмами
 * - Hunger trade-off: большой дефицит → лучше поесть, чем лечь голодным
 * - First meal of day: no lastMeal → no wave, start from now (v2.3.0)
 *
 * v2.3.0 changes (20.02.2026):
 * - FIX: planRemainingMeals no longer requires lastMeal.time — supports "first meal of day"
 *   When no meals are logged today, planner starts from currentTime.
 *   starts planning from currentTime. Enables 3-4 meal day plans from first meal.
 * - LOG: [PLANNER.response] first meal of day — no previous response window
 *
 * v2.2.0 changes (19.02.2026):
 * - FIX: waveMinutes → duration property name in InsulinWave.calculate() return object
 *   (legacy integration previously fell back to a fixed three-hour duration)
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
 * - Legacy note: the former extra post-window buffer is disabled in v5.
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
    const PRE_SLEEP_BUFFER_HOURS = 3; // не есть за 3ч до сна
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

    // S3: Glycemic Load targets — Atkinson 2008 (Diabetes Care, PMID 18835944):
    //   low ≤10, medium 11-19, high ≥20. v4.3 (2026-05-13): GL_TARGET_DAY снижен
    //   с 20 (= верхняя граница medium / нижняя high) до 15 (середина medium) —
    //   даёт безопасный запас до high зоны.
    // Ludwig 2002: связь high-GL с инсулинорезистентностью.
    const GL_TARGET_DAY = 15; // целимся в середину medium (10-19), не в high (≥20)
    const GL_TARGET_PRE_SLEEP = 10; // граница low/medium, эвристика для пресонного приёма
    //   (Halson 2014 говорит про GI, не про GL — прямой ссылки на «GL≤10 перед сном» нет;
    //   значение 10 = «оставаться в low зоне Atkinson 2008»)

    // S5: Sleep-friendly product categories — общая нутриент-логика
    //   (казеин, триптофан, магний). Halson 2014 GSSI SSE #116 — обзор без
    //   жёстких количественных порогов; используется как качественный ориентир.
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
        if (!Number.isFinite(hours)) return '—';
        let h = Math.floor(hours);
        let m = Math.round((hours - h) * 60);
        // R5-A: carry minutes→hours при rounding edge case (24.999... → 24:60 → 25:00)
        if (m >= 60) { h += 1; m = 0; }
        h = ((h % 24) + 24) % 24;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function parseClockHours(time) {
        if (typeof time !== 'string' || !/^\d{1,2}:\d{2}$/.test(time)) return null;
        const [hours, minutes] = time.split(':').map(Number);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
        return hours + minutes / 60;
    }

    /**
     * HEYS-день меняется в 03:00. До этой границы currentTime живёт
     * на продолженной шкале предыдущего вечера: 01:30 → 25.5.
     */
    function normalizePlanningCurrentTime(time) {
        const parsed = typeof time === 'number' ? time : parseClockHours(time);
        if (!Number.isFinite(parsed)) return null;
        return parsed < 3 ? parsed + 24 : parsed;
    }

    function clockTimeAtOrBefore(time, anchorHours) {
        const parsed = parseClockHours(time);
        if (!Number.isFinite(parsed) || !Number.isFinite(anchorHours)) return null;
        let occurrence = parsed;
        while (occurrence > anchorHours + 0.01) occurrence -= 24;
        while (occurrence + 24 <= anchorHours + 0.01) occurrence += 24;
        return occurrence;
    }

    function bedtimeClockToNightHours(time) {
        const parsed = parseClockHours(time);
        if (!Number.isFinite(parsed)) return null;
        return parsed < 12 ? parsed + 24 : parsed;
    }

    function alignBedtimeAfterCurrent(bedtimeHours, currentTimeHours) {
        if (!Number.isFinite(bedtimeHours)) return null;
        let aligned = bedtimeHours;
        if (!Number.isFinite(currentTimeHours)) return aligned;
        const graceHours = 0.05;
        while (aligned < currentTimeHours - graceHours) aligned += 24;
        while (aligned - 24 >= currentTimeHours - graceHours) aligned -= 24;
        return aligned;
    }

    function median(values) {
        const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
        if (!sorted.length) return null;
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function weightedMedian(entries) {
        const sorted = entries
            .filter((entry) => Number.isFinite(entry?.value) && Number.isFinite(entry?.weight) && entry.weight > 0)
            .slice()
            .sort((a, b) => a.value - b.value);
        if (!sorted.length) return null;
        const half = sorted.reduce((sum, entry) => sum + entry.weight, 0) / 2;
        let seen = 0;
        for (const entry of sorted) {
            seen += entry.weight;
            if (seen >= half) return entry.value;
        }
        return sorted[sorted.length - 1].value;
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
    function estimateWaveDuration(macros) {
        const model = HEYS.InsulinWave?.ResponseModel;
        if (!model?.estimate) throw new Error('Canonical postprandial ResponseModel is unavailable');
        const product = {
            name: 'Планируемый приём',
            carbs100: Number(macros?.carbs) || 0,
            protein100: Number(macros?.prot ?? macros?.protein) || 0,
            fat100: Number(macros?.fat) || 0,
            fiber100: Number(macros?.fiber) || 0,
            gi: Number.isFinite(Number(macros?.gi)) ? Number(macros.gi) : undefined,
            foodForm: macros?.foodForm,
        };
        const estimate = model.estimate({
            meal: { time: '12:00', items: [{ grams: 100, ...product }] },
            getProductFromItem: () => product,
            trainings: [],
        });
        return estimate.estimatedWindow.centralMinutes / 60;
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

    function getPracticalProteinCapG(profile) {
        const weightKg = getWeightKg(profile);
        return Math.min(60, Math.max(MPS_PROT_MAX_G, Math.round(weightKg * 0.5)));
    }

    /**
     * R13: собрать advisories для empty-plan ветки (цель выполнена, <50 ккал).
     * Не все R13 имеют смысл без приёма (skip R13-A workout boost, R13-G first-meal-only),
     * но cascade/EW/phenotype/hydration советы юзеру нужны и при выполненной цели.
     */
    function buildR13EmptyPlanAdvisories({ stressMoodSignals, phenotypeApplied, cascadeState, earlyWarnings, causalChains, params, currentTimeHours }) {
        const out = [];
        const cascadeBrokenMode = cascadeState?.state === 'BROKEN';
        // R13-B mood
        if (stressMoodSignals?.moodAvgLevel === 'low') {
            out.push({ key: 'r13b_mood_support', severity: 'low', text: 'Настроение последних дней низкое — приоритет на омега-3, триптофан (индейка, яйца, бананы).' });
        }
        // R13-D phenotype
        if (phenotypeApplied?.satiety === 'volume_eater') {
            out.push({ key: 'r13d_volume_eater', severity: 'low', text: 'Лучше насыщаешься объёмом — приоритет овощам и супам.' });
        } else if (phenotypeApplied?.satiety === 'low_satiety') {
            out.push({ key: 'r13d_low_satiety', severity: 'low', text: 'Тебе трудно насыщаться — белок + клетчатка в начале приёма.' });
        }
        // R13-I water — особенно важно при выполненной цели вечером
        const waterMl = Number(params?.currentDay?.waterMl) || 0;
        const profileWeight = Number(params?.profile?.weight) || 70;
        const waterGoalMl = profileWeight * 30;
        if (waterMl > 0 && waterMl < waterGoalMl * 0.4 && currentTimeHours >= 18) {
            out.push({ key: 'r13i_dehydration', severity: 'medium', text: `Воды сегодня мало (${waterMl}/${Math.round(waterGoalMl)} мл) — добавь стакан перед сном.` });
        }
        // R13-H NEAT
        const todaySteps = Number(params?.currentDay?.steps) || 0;
        const todayHousehold = Number(params?.currentDay?.householdMin) || 0;
        if (todaySteps >= 15000 || todayHousehold >= 60) {
            const parts = [];
            if (todaySteps >= 15000) parts.push(`${todaySteps} шагов`);
            if (todayHousehold >= 60) parts.push(`${todayHousehold} мин быта`);
            out.push({ key: 'r13h_high_neat', severity: 'low', text: `Сегодня высокая активность (${parts.join(' + ')}) — хороший день.` });
        }
        // R13-E early warnings (даже если цель выполнена — предупреждения важны)
        const ewArr = Array.isArray(earlyWarnings) ? earlyWarnings : [];
        const ewTypes = new Set(ewArr.map(w => w?.type).filter(Boolean));
        if (ewTypes.has('BINGE_RISK')) {
            out.push({ key: 'r13e_binge_risk', severity: 'medium', text: 'Растёт риск переедания — следи за импульсивными перекусами на ночь.' });
        }
        if (ewTypes.has('PROTEIN_DEFICIT')) {
            out.push({ key: 'r13e_protein_deficit', severity: 'medium', text: 'Дефицит белка по неделе — завтра приоритет белок:углеводы = 2:1.' });
        }
        // R13-F causal chains
        const cArr = Array.isArray(causalChains) ? causalChains : [];
        const chainTypes = new Set(cArr.map(c => c?.type || c?.id).filter(Boolean));
        if (chainTypes.has('SLEEP_STRESS_BINGE') || chainTypes.has('SLEEP→STRESS→BINGE')) {
            out.push({ key: 'r13f_chain_sleep_stress', severity: 'high', text: 'Цепочка: плохой сон → стресс → переедание. Закрой день на воде, не еде.' });
        }
        // R13-C cascade — самое мотивационное при выполненной цели
        if (cascadeState) {
            if (cascadeState.state === 'BROKEN') {
                out.push({ key: 'r13c_cascade_broken', severity: 'high', text: 'Каскад сломался — но цель дня выполнена. Это хороший шанс на восстановление с завтра.' });
            } else if (cascadeState.state === 'STRONG' && (cascadeState.daysAtPeak || 0) >= 7) {
                out.push({ key: 'r13c_cascade_strong', severity: 'low', text: `${cascadeState.daysAtPeak} дней на пике — отличный ритм, держи.` });
            }
            if (Number.isFinite(cascadeState.todayContrib) && cascadeState.todayContrib < -0.15) {
                out.push({ key: 'r13c_today_at_risk', severity: 'medium', text: 'Сегодня каскад под угрозой — спокойно закрой день, не сорвись на ночной перекус.' });
            }
        }
        // dedup + filter low при BROKEN + sort + cap
        const seenKeys = new Set();
        const severityRank = { high: 3, medium: 2, low: 1 };
        let final = out.filter((a) => {
            if (!a || !a.key || seenKeys.has(a.key)) return false;
            seenKeys.add(a.key);
            if (cascadeBrokenMode && a.severity === 'low') return false;
            return true;
        });
        final.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));
        if (final.length > 6) final = final.slice(0, 6);
        return final;
    }

    /**
     * Единый контракт ожидаемого сна для recommender и planner.
     * day.sleepStart — факт завершённой ночи, а не план на будущую.
     */
    function resolveSleepContext(days = [], profile = {}, opts = {}) {
        const currentTimeHours = normalizePlanningCurrentTime(opts.currentTimeHours);
        const plannedBedtime = bedtimeClockToNightHours(opts.plannedBedtime);
        if (Number.isFinite(plannedBedtime)) {
            const bedtimeHours = alignBedtimeAfterCurrent(plannedBedtime, currentTimeHours);
            return {
                bedtimeHours,
                displayTime: formatTime(bedtimeHours),
                source: 'planned_bedtime',
                confidence: 'high',
                confidenceScore: 1,
                sampleSize: 1,
                variabilityMinutes: 0,
                explanation: `Время сна задано на сегодня: ${formatTime(bedtimeHours)}`
            };
        }

        const observed = (Array.isArray(days) ? days : [])
            .filter((day) => day && Number.isFinite(bedtimeClockToNightHours(day.sleepStart)))
            .slice(-14)
            .map((day, index, arr) => ({
                value: bedtimeClockToNightHours(day.sleepStart),
                weight: arr.length <= 1 ? 1 : 1 + index / (arr.length - 1)
            }));

        if (observed.length >= 3) {
            const estimate = weightedMedian(observed);
            const variabilityMinutes = Math.round((median(observed.map((entry) => Math.abs(entry.value - estimate))) || 0) * 60);
            const confidence = observed.length >= 7 && variabilityMinutes <= 45
                ? 'high'
                : (variabilityMinutes <= 90 ? 'medium' : 'low');
            const confidenceScore = confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.7 : 0.45;
            const bedtimeHours = alignBedtimeAfterCurrent(estimate, currentTimeHours);
            return {
                bedtimeHours,
                displayTime: formatTime(bedtimeHours),
                source: 'observed_history',
                confidence,
                confidenceScore,
                sampleSize: observed.length,
                variabilityMinutes,
                explanation: `Время сна оценено по ${observed.length} последним ночам`
            };
        }

        const preferred = bedtimeClockToNightHours(profile?.sleepTarget);
        if (Number.isFinite(preferred)) {
            const bedtimeHours = alignBedtimeAfterCurrent(preferred, currentTimeHours);
            return {
                bedtimeHours,
                displayTime: formatTime(bedtimeHours),
                source: 'profile_preference',
                confidence: 'medium',
                confidenceScore: 0.65,
                sampleSize: observed.length,
                variabilityMinutes: null,
                explanation: `Время сна взято из настройки профиля: ${formatTime(bedtimeHours)}`
            };
        }

        const fallbackHours = alignBedtimeAfterCurrent(23, currentTimeHours);
        return {
            bedtimeHours: fallbackHours,
            displayTime: formatTime(fallbackHours),
            source: 'fallback',
            confidence: 'low',
            confidenceScore: 0.3,
            sampleSize: observed.length,
            variabilityMinutes: null,
            explanation: 'Истории сна недостаточно, используется ориентир 23:00'
        };
    }

    function estimateSleepTarget(days, profile, opts) {
        return resolveSleepContext(days, profile, opts).bedtimeHours;
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
            sleepContext: providedSleepContext = null,
            plannedBedtime = null,
            hungerSignal = null,
            isRefeedDay = false,
            stressMoodSignals = null,
            waveOverlapPct = null,
            scenarioHint = null, // R5-D: recommender scenario (MICRONUTRIENT_FOCUS, MOOD_SUPPORT_BREAKFAST)
            // R12-B: история GL и sugar dependency для адаптации targetGL
            glycemicLoadHistory = null,
            addedSugarHistory = null,
            // R12-D: история клетчатки для boost категорий
            fiberRegularityScore = null,
            // R12-C: pattern impact hints от recommender для advisories
            patternImpactHints = null,
            // R12-E: phenotype для timing adjustment
            phenotypeApplied = null,
            // R13-G: список названий дефицитных микронутриентов (iron/magnesium/zinc/calcium)
            micronutrientDeficits = [],
            // R13-E: список early warnings от HEYS.InsightsPI.earlyWarning.detect()
            earlyWarnings = [],
            // R13-F: причинно-следственные цепочки от earlyWarning/causalChains
            causalChains = [],
            // R13-C: snapshot состояния каскада (window.HEYS._lastCrs)
            cascadeState = null
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
            sleepContextSource: providedSleepContext?.source || 'resolve',
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

        const currentTimeRaw = parseTime(currentTime);
        const currentTimeHours = normalizePlanningCurrentTime(currentTime);
        let lastMealTimeHours = hasLastMeal ? clockTimeAtOrBefore(lastMeal.time, currentTimeHours) : null;

        // R3-1: если последний приём был вчера вечером (≥20:00), а сейчас утро (<12:00),
        // волна давно закончилась — между ними была ночь. Программа должна считать
        // это "first meal of day", а не тащить волну с прошлого вечера.
        if (hasLastMeal && parseTime(lastMeal.time) >= 20 && currentTimeRaw >= 3 && currentTimeRaw < 12) {
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
                    currentWaveEnd = lastMealTimeHours + currentWaveData.duration / 60;
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

            if (!currentWaveEnd) {
                console.warn(`${LOG_PREFIX} ⚠️ [PLANNER.response] Canonical estimate unavailable; no synthetic time constraint applied`, {
                    lastMeal: formatTime(lastMealTimeHours),
                    reason: 'currentWaveData?.duration was undefined or calculation failed'
                });
            }
        } else {
            // v2.3.0: No last meal — first meal of day, no active insulin wave
            console.info(`${LOG_PREFIX} [PLANNER.wave] 🌅 First meal of day — no active insulin wave, starting from now`);
        }

        // Расчётное завершение — ориентир планировщика, без дополнительного fasting-буфера.
        const responseWindowEnd = currentWaveEnd || currentTimeHours;
        let nextMealEarliest = Math.max(currentTimeHours, responseWindowEnd);

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

        console.info(`${LOG_PREFIX} [PLANNER.response] Post-meal estimate applied:`, {
            responseEnd: currentWaveEnd ? formatTime(currentWaveEnd) : null,
            currentTime: formatTime(currentTimeHours),
            nextMealEarliest: formatTime(nextMealEarliest),
            fastingApplied: !!fw
        });

        // === Шаг 3: Определить время сна и deadline последнего приёма ===
        // Recommender может передать уже разрешённый контекст. Иначе planner
        // строит его тем же resolver. day.sleepStart остаётся историей.
        const sleepContext = Number.isFinite(providedSleepContext?.bedtimeHours)
            ? providedSleepContext
            : resolveSleepContext(days, profile, { plannedBedtime, currentTimeHours });
        const sleepTarget = alignBedtimeAfterCurrent(sleepContext.bedtimeHours, currentTimeHours);
        // R12-E: phenotype-aware buffer. insulin_resistant → ужин раньше на 30 мин
        // (углеводы + инсулин перед сном плохо для них). metabolic_syndrome_risk —
        // ещё раньше (1ч). Не трогаем sleepTarget — меняем именно deadline.
        let phenotypeBuffer = 0;
        if (phenotypeApplied?.metabolic === 'insulin_resistant') {
            phenotypeBuffer = 0.5;
        } else if (phenotypeApplied?.metabolic === 'metabolic_syndrome_risk') {
            phenotypeBuffer = 1.0;
        }
        let lastMealDeadline = sleepTarget - PRE_SLEEP_BUFFER_HOURS - phenotypeBuffer;
        if (phenotypeBuffer > 0) {
            console.info(`${LOG_PREFIX} [PLANNER.phenotype] 🧬 Phenotype ${phenotypeApplied.metabolic} → deadline сдвинут на ${phenotypeBuffer}ч раньше`);
        }
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
        // R13-A: sentinel для anti-double-shift (R4-5 moderate stress vs R13-A poor sleep).
        // R13-D: stress_anorexic фенотип защищается от moderate-shift (риск катаболизма).
        let lastMealDeadlineShifted = false;
        const isStressAnorexicWithDeficit = (params.phenotypeApplied?.stress === 'stress_anorexic')
            && (stressMoodSignals?.stressLevel === 'high')
            && ((dayTarget.kcal || 0) - (dayEaten.kcal || 0) > 600);
        if (stressMoodSignals?.stressLevel === 'moderate' && currentTimeHours >= 20 && !isStressAnorexicWithDeficit) {
            const shiftedDeadline = lastMealDeadline - 0.5;
            // Сдвиг имеет смысл только если после него реально остаётся окно для
            // следующего приёма. Проверка от currentTime пропускала скрытую ошибку:
            // волна могла закончиться позже shiftedDeadline, и умеренный стресс
            // превращал допустимый приём за 3+ часа до сна в пустой план.
            if (shiftedDeadline > nextMealEarliest) {
                lastMealDeadline = shiftedDeadline;
                effectiveBuffer = PRE_SLEEP_BUFFER_HOURS + 0.5;
                lastMealDeadlineShifted = true;
                console.info(`${LOG_PREFIX} [PLANNER.sleep] 🧘 Moderate stress + late evening → deadline сдвинут на 30 мин раньше`);
            } else {
                console.info(`${LOG_PREFIX} [PLANNER.sleep] 🧘 Moderate stress shift пропущен: после волны не остаётся окна (${formatTime(nextMealEarliest)} → ${formatTime(shiftedDeadline)})`);
            }
        }

        // R13-A: poor sleep + late evening → ещё 15 минут раньше (но только если
        // R4-5 уже не сдвинул — anti-double-shift). Sentinel выше отслеживает.
        if (stressMoodSignals?.sleepQualityLevel === 'poor' && currentTimeHours >= 20 && !lastMealDeadlineShifted) {
            const shiftedDeadline = lastMealDeadline - 0.25;
            if (shiftedDeadline > nextMealEarliest) {
                lastMealDeadline = shiftedDeadline;
                effectiveBuffer = PRE_SLEEP_BUFFER_HOURS + 0.25;
                lastMealDeadlineShifted = true;
                console.info(`${LOG_PREFIX} [PLANNER.sleep] 😴 Poor sleep + late evening → deadline -15 мин (R13-A)`);
            }
        }

        console.info(`${LOG_PREFIX} [PLANNER.sleep] 🌙 Sleep planning:`, {
            sleepTarget: formatTime(sleepTarget),
            sleepSource: sleepContext.source,
            sleepConfidence: sleepContext.confidence,
            sleepSampleSize: sleepContext.sampleSize,
            sleepVariabilityMinutes: sleepContext.variabilityMinutes,
            preSleepBuffer: effectiveBuffer,
            lastMealDeadline: formatTime(lastMealDeadline),
            availableWindow: `${formatTime(nextMealEarliest)} → ${formatTime(lastMealDeadline)}`,
            stressLevel: stressMoodSignals?.stressLevel,
            moodLevel: stressMoodSignals?.moodLevel,
            sleepQualityLevel: stressMoodSignals?.sleepQualityLevel || 'unknown',
            moodAvgLevel: stressMoodSignals?.moodAvgLevel || 'unknown',
            deadlineShifted: lastMealDeadlineShifted
        });

        // === S4: POST_WORKOUT detection (Ivy, 2004) ===
        // R4-8: расширенное окно recovery. Ivy 2004 говорит про 2ч anabolic
        // window, но Areta et al. 2013 показывает что MPS повышен до 24-48ч.
        // Делаем градиент: full POST_WORKOUT в 0-2ч, плавно снижающийся
        // recoveryFactor в 2-24ч (применяется к MPS_PROT_PER_KG в финальном
        // распределении). Также различаем strength (priority белок) vs cardio
        // (priority углеводы).
        const allWorkouts = params.currentDay?.workouts || params.currentDay?.trainings || [];
        // Найти последнюю тренировку в окне 24ч.
        // Ночные часы (HEYS-день 03:00→03:00): после полуночи currentTimeHours
        // (например 1.25 для 01:15), но тренировка была "сегодня" утром/днём
        // (например 10.67 для 10:40) → delta=-9.42, тренировка не находилась
        // и весь R4-8 recovery factor молчал. Учитываем wraparound.
        const isAfterMidnight = currentTimeRaw < 3;
        let lastWorkout = null;
        let hoursAfterWorkout = null;
        for (const w of allWorkouts) {
            const wTime = w.endTime || w.time;
            if (!wTime) continue;
            const wHours = clockTimeAtOrBefore(wTime, currentTimeHours);
            let delta = currentTimeHours - wHours;
            // Ночной wraparound: тренировка днём предыдущего календарного дня,
            // но того же HEYS-дня (03:00→03:00) → дельта отрицательная, поправляем.
            if (delta < 0 && isAfterMidnight && wHours >= 3) {
                delta += 24;
            }
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
        // R13-A: плохой сон ухудшает MPS — компенсируем +15% recovery boost.
        //   Dattilo 2011 (Med Hypotheses, PMID 21550729) — это hypothesis paper,
        //   а не RCT; цифры 15% в оригинале нет. Гипотеза верна качественно
        //   (sleep debt → ↑cortisol, ↓testosterone/IGF-1 → catabolic shift),
        //   но магнитуда 15% — внутренняя эвристика, не из источника.
        if (workoutRecoveryFactor > 0 && stressMoodSignals?.sleepQualityLevel === 'poor') {
            workoutRecoveryFactor *= 1.15;
            console.info(`${LOG_PREFIX} [PLANNER.recovery] 😴 Poor sleep × workout → recoveryFactor +15% (R13-A)`);
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

        const hungerLevel = Number(hungerSignal?.level ?? hungerSignal?.hungerLevel);
        const hungerAgeMinutes = Number(hungerSignal?.ageMinutes ?? hungerSignal?.minutesSince);
        const hasFreshHunger = Number.isFinite(hungerLevel)
            && Number.isFinite(hungerAgeMinutes)
            && hungerAgeMinutes >= 0
            && hungerAgeMinutes <= 180;
        const hasFreshHighHunger = hasFreshHunger && hungerLevel >= 7;
        const proteinTargetG = Number(dayTarget.prot) || 0;
        const proteinEatenG = Number(dayEaten.prot ?? dayEaten.protein) || 0;
        const proteinProgress = proteinTargetG > 0 ? proteinEatenG / proteinTargetG : 1;
        const goalBlockingProteinDeficit = proteinTargetG > 0
            && proteinProgress < 0.8
            && proteinTargetG - proteinEatenG > 10;
        const practicalProteinCapG = getPracticalProteinCapG(profile);
        const proteinCatchupKcal = goalBlockingProteinDeficit
            ? Math.min(240, Math.max(100, Math.min(proteinTargetG - proteinEatenG, practicalProteinCapG) * 4))
            : 0;

        // Проверка: достаточно ли времени хотя бы для одного приёма?
        if (nextMealEarliest >= lastMealDeadline) {
            // === v1.9: Hunger trade-off (Kinsey & Ormsbee, 2015) ===
            // Лучше поесть лёгкий белковый приём за 1.5-2ч до сна, чем лечь голодным.
            // Большой дефицит → кортизол ↑, катаболизм, плохой сон.
            // Pre-sleep protein (казеин, творог) УЛУЧШАЕТ MPS без негативных метаболических эффектов.
            const rawQuickBudgetKcal = Math.max(0, (dayTarget.kcal || 0) - (dayEaten.kcal || 0));
            const quickBudgetKcal = Math.max(rawQuickBudgetKcal, proteinCatchupKcal);

            if (rawQuickBudgetKcal < 50 && !goalBlockingProteinDeficit) {
                return {
                    available: true,
                    meals: [],
                    summary: {
                        totalMeals: 0,
                        reason: 'Дневная цель практически выполнена',
                        decision: 'FINISH_DAY',
                        reasonCode: 'GOAL_REACHED',
                        topFactors: [`Остаток дня ${Math.round(rawQuickBudgetKcal)} ккал`],
                        tradeoffs: [],
                        sleepContext,
                        confidence: sleepContext.confidence,
                        alternatives: []
                    }
                };
            }

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
                // R1-8: остаётся ≥2ч до сна → один лёгкий белковый приём вместо
                // пустоты. Лечь голодным без причины плохо, казеин/творог перед
                // сном не вредят (Kinsey & Ormsbee 2015 — pre-sleep protein, MPS).
                // R9: clamp макросов чтобы приём был реально лёгким (cap 250 ккал),
                // и kcal согласован с БЖУ (раньше kcal = quickBudgetKcal давал
                // расхождение 500+ ккал когда дефицит большой).
                const hoursToSleep = sleepTarget - currentTimeHours;
                // R10-A: порог понижен с 2.0h до 1.5h. Лучше дать лёгкий
                // белковый приём за 1ч до сна (cap 250 ккал, в основном белок)
                // чем оставить юзера с пустым планом + противоречивым header.
                // 1.5h до сна = тот же буфер что в severe hunger tradeoff.
                const lightMealUseful = hasFreshHighHunger || quickBudgetKcal >= 250 || recentWorkout;
                if (quickBudgetKcal >= 50 && hoursToSleep >= 1.5 && (hoursToSleep <= 4.0 || lightMealUseful)) {
                    const lightStart = Math.max(currentTimeHours + 0.1, sleepTarget - 1.8);
                    const lightEnd = Math.min(sleepTarget - 1.0, lightStart + 0.5);
                    const LIGHT_MEAL_KCAL_CAP = 250;
                    // Целевые БЖУ: cap по белку (15-25г), углеводы и жиры скромные
                    const lightKcalTarget = Math.min(quickBudgetKcal, LIGHT_MEAL_KCAL_CAP);
                    const protTarget = Math.min(25, Math.max(15, Math.round(lightKcalTarget * 0.6 / 4)));
                    const carbsTarget = Math.max(5, Math.round(lightKcalTarget * 0.2 / 4));
                    const fatTarget = Math.max(3, Math.round(lightKcalTarget * 0.2 / 9));
                    // R9-A: kcal = P*4 + C*4 + F*9 (согласован с БЖУ)
                    const lightKcalActual = protTarget * 4 + carbsTarget * 4 + fatTarget * 9;
                    const lightMeal = {
                        index: 0,
                        timeStart: formatTime(lightStart),
                        timeEnd: formatTime(lightEnd),
                        estimatedWaveEnd: formatTime(lightStart + 1.5),
                        fatBurnWindow: { start: formatTime(lightStart + 1.5), end: formatTime(lightStart + 1.5), deprecated: true },
                        macros: {
                            prot: protTarget,
                            carbs: carbsTarget,
                            fat: fatTarget,
                            kcal: lightKcalActual,
                            effectiveKcal: protTarget * 3 + carbsTarget * 4 + fatTarget * 9
                        },
                        isActionable: true,
                        isLast: true,
                        scenario: 'PRE_SLEEP',
                        // R9-B: явно метим источник — UI/diag показывают «planner_light»
                        scenarioSource: 'planner_light',
                        scenarioBaseline: 'PRE_SLEEP',
                        hoursToSleep: sleepTarget - lightStart,
                        targetGL: GL_TARGET_PRE_SLEEP,
                        sleepFriendlyCategories: SLEEP_FRIENDLY_CATEGORIES,
                        presleepCapped: lightKcalActual >= LIGHT_MEAL_KCAL_CAP - 10, // флаг что cap применён
                        stableId: `light|${formatTime(lightStart)}|PRE_SLEEP|0`
                    };
                    const deficitLabel = quickBudgetKcal >= 400 ? 'Large deficit (capped to light meal)' :
                                         quickBudgetKcal >= 200 ? 'Moderate deficit' : 'Small deficit';
                    console.info(`${LOG_PREFIX} [PLANNER.light] 🥛 ${deficitLabel} ${Math.round(quickBudgetKcal)} kcal + ${hoursToSleep.toFixed(1)}h to sleep → single light protein meal (${lightKcalActual} kcal: P${protTarget} C${carbsTarget} F${fatTarget})`);
                    return {
                        available: true,
                        meals: [lightMeal],
                        summary: {
                            totalMeals: 1,
                            timelineStart: lightMeal.timeStart,
                            timelineEnd: lightMeal.timeEnd,
                            totalMacros: { prot: protTarget, carbs: carbsTarget, kcal: lightKcalActual },
                            sleepTarget: formatTime(sleepTarget),
                            lastMealDeadline: formatTime(sleepTarget - 1.5),
                            decision: 'LIGHT_MEAL',
                            reasonCode: goalBlockingProteinDeficit
                                ? 'PROTEIN_DEFICIT_NEAR_GOAL'
                                : (hasFreshHighHunger ? 'FRESH_HIGH_HUNGER' : (recentWorkout ? 'RECOVERY_NEAR_SLEEP' : 'DEFICIT_NEAR_SLEEP')),
                            topFactors: [
                                `Приём начнётся примерно за ${Math.max(0, lightMeal.hoursToSleep).toFixed(1)} ч до сна`,
                                goalBlockingProteinDeficit
                                    ? `Калории почти закрыты, белок ${Math.round(proteinProgress * 100)}% от цели`
                                    : `Остаток дня ${Math.round(quickBudgetKcal)} ккал`,
                                hasFreshHighHunger ? `Свежая оценка голода ${Math.round(hungerLevel)}/10` : null,
                                recentWorkout ? 'Идёт восстановление после тренировки' : null
                            ].filter(Boolean),
                            tradeoffs: ['Порция ограничена, чтобы не перегружать предсонное окно'],
                            sleepContext,
                            confidence: sleepContext.confidence,
                            alternatives: hasFreshHighHunger ? ['Если голод нарастает, не откладывай лёгкий приём'] : [],
                            reason: quickBudgetKcal >= 400
                                ? `Лёгкий белковый приём перед сном (дефицит ${Math.round(quickBudgetKcal)} ккал, но cap ${LIGHT_MEAL_KCAL_CAP} ккал — не перегружать сон)`
                                : 'Лёгкий белковый приём перед сном (малый остаток)'
                        }
                    };
                }
                console.info(`${LOG_PREFIX} ℹ️ No time for additional meals (nextMeal >= deadline, deficit ${Math.round(quickBudgetKcal || 0)} kcal, hoursToSleep ${hoursToSleep.toFixed(1)}h)`);
                return {
                    available: true,
                    meals: [],
                    summary: {
                        totalMeals: 0,
                        reason: `Ближайшее расчётное окно еды начинается около ${formatTime(nextMealEarliest)}, слишком близко ко сну.`,
                        decision: 'FINISH_DAY',
                        reasonCode: 'NO_USEFUL_MEAL_WINDOW',
                        topFactors: [
                            `До сна около ${Math.max(0, hoursToSleep).toFixed(1)} ч`,
                            `Ближайшее окно после текущей волны: ${formatTime(nextMealEarliest)}`
                        ],
                        tradeoffs: ['Планер не видит полезного окна для нового плотного приёма'],
                        sleepContext,
                        confidence: sleepContext.confidence,
                        alternatives: ['При сильном голоде выбери небольшой лёгкий приём']
                    }
                };
            }
        }

        // === Шаг 4: Рассчитать оставшийся бюджет ===
        const rawRemainingKcal = Math.max(0, (dayTarget.kcal || 0) - (dayEaten.kcal || 0));
        const proteinRecoveryOnly = rawRemainingKcal < 50 && goalBlockingProteinDeficit;
        const remainingBudget = {
            prot: Math.max(0, (dayTarget.prot || 0) - (dayEaten.prot || 0)),
            carbs: Math.max(0, (dayTarget.carbs || 0) - (dayEaten.carbs || 0)),
            fat: Math.max(0, (dayTarget.fat || 0) - (dayEaten.fat || 0)),
            kcal: Math.max(rawRemainingKcal, proteinCatchupKcal)
        };

        // Физиологический minimum: если ккал значительный, но нутриент выполнен —
        // применяем floor чтобы product picker предлагал разнообразные продукты
        if (remainingBudget.kcal >= 200 && !proteinRecoveryOnly) {
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

        // === Закрыть разрыв между ккал-целью и суммой макро ===
        // normAbs (база Миффлин-Сан Жеор) часто < optimum (учитывает NEAT + тренировки).
        // Макро-таргеты считаются от normAbs, ккал-цель от optimum → к вечеру когда
        // углевод-бюджет почти выбран, сумма (П×4 + У×4 + Ж×9) недотягивает 200-300 ккал
        // до остатка ккал. Без фикса юзер недоедает целевой optimum.
        //
        // Гасим разрыв жиром:
        //   • Mayer 1968 / Newsholme 1976: жир без углеводов не вызывает инсулинового ответа →
        //     не ломает вечернее жиросжигание.
        //   • Areta 2013: дополнительный белок выше 0.4 г/кг/приём не даёт прироста MPS →
        //     лишний белок уйдёт в глюконеогенез (Knapik 1991), что создаст задержанный
        //     инсулиновый ответ.
        //   • Pereira 2014: дополнительные углеводы поздним вечером ухудшают архитектуру сна.
        // → Жир — оптимальный «буферный» макрос для закрытия разрыва.
        //
        // Cap: суммарный жир ≤ 50% ккал-остатка (Sacks 2009: целевой % жира по дню
        // 25-35%, но утренние углеводы уже съели норму → разовый сдвиг до 50% в
        // оставшейся части дня безопасен; Westerterp 1985: разовый приём 50г жира
        // не выходит за пределы биологического окисления).
        const macroSumKcal = remainingBudget.prot * 4 + remainingBudget.carbs * 4 + remainingBudget.fat * 9;
        const kcalGap = remainingBudget.kcal - macroSumKcal;
        if (kcalGap > remainingBudget.kcal * 0.15 && remainingBudget.kcal >= 200) {
            const maxTotalFat = Math.floor(remainingBudget.kcal * 0.50 / 9);
            const extraFatRaw = Math.round(kcalGap / 9);
            const headroom = Math.max(0, maxTotalFat - remainingBudget.fat);
            const extraFat = Math.min(extraFatRaw, headroom);
            if (extraFat > 0) {
                const oldFat = remainingBudget.fat;
                remainingBudget.fat += extraFat;
                const cappedNote = extraFatRaw > extraFat ? ` (capped at 50% kcal, residue ${Math.round((extraFatRaw - extraFat) * 9)}kcal under-planned)` : '';
                console.info(`${LOG_PREFIX} [PLANNER.budget] 🪣 Kcal-macro gap filled: +${extraFat}g fat (${oldFat}→${remainingBudget.fat}g, gap=${Math.round(kcalGap)}kcal)${cappedNote}`);
            }
        }

        console.info(`${LOG_PREFIX} [PLANNER.budget] 💰 Remaining budget:`, {
            ...remainingBudget,
            percentOfTarget: {
                prot: ((remainingBudget.prot / (dayTarget.prot || 1)) * 100).toFixed(0) + '%',
                kcal: ((remainingBudget.kcal / (dayTarget.kcal || 1)) * 100).toFixed(0) + '%'
            }
        });

        // Если бюджет <50 kcal → не планируем (но R13 advisories всё равно полезны)
        if (remainingBudget.kcal < 50) {
            console.info(`${LOG_PREFIX} ℹ️ Insufficient remaining budget (< 50 kcal)`);
            const emptyPlanAdvisories = buildR13EmptyPlanAdvisories({
                stressMoodSignals,
                phenotypeApplied,
                cascadeState,
                earlyWarnings,
                causalChains,
                params,
                currentTimeHours
            });
            return {
                available: true,
                meals: [],
                summary: {
                    totalMeals: 0,
                    reason: 'Дневная цель практически выполнена',
                    decision: 'FINISH_DAY',
                    reasonCode: 'GOAL_REACHED',
                    topFactors: [`Остаток меньше ${Math.round(remainingBudget.kcal)} ккал`],
                    tradeoffs: [],
                    sleepContext,
                    confidence: sleepContext.confidence,
                    alternatives: [],
                    advisories: emptyPlanAdvisories.length > 0 ? emptyPlanAdvisories : undefined
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
            const responseWindowEnd = waveEndTime;

            console.info(`${LOG_PREFIX} [PLANNER.loop.${iteration}] 🧮 Evaluating meal slot:`, {
                cursor: formatTime(cursor),
                mealsEstimate,
                thisMealKcal: Math.round(budgetForThisMeal.kcal),
                remainingKcal: Math.round(remainingBudget.kcal),
                estimatedWaveHours: estimatedWave.toFixed(1),
                waveEnd: formatTime(waveEndTime),
                responseEnd: formatTime(responseWindowEnd)
            });

            // R1-9 / R3-2: Динамический gap для forceMultiMeal. Раньше был фикс 2ч,
            // что для тяжёлого приёма (большая волна) недостаточно — следующая волна
            // накладывается на предыдущую перед сном. Теперь gap = max(2ч, 75% волны).
            // Это сохраняет wave-aware физиологию, не возвращаясь к жёсткой константе.
            const MIN_FORCE_MULTI_GAP_H_FLOOR = 2.0;
            const dynamicForceGap = Math.max(MIN_FORCE_MULTI_GAP_H_FLOOR, estimatedWave * 0.75);
            const nextPossibleStart = forceMultiMeal && plannedMeals.length === 0
                ? cursor + Math.min(estimatedWave, dynamicForceGap)
                : responseWindowEnd;
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
                        end: formatTime(responseWindowEnd),
                        deprecated: true
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
                    end: formatTime(responseWindowEnd),
                    deprecated: true
                },
                macros: budgetForThisMeal, // временно, будет перераспределено на шаге 6
                isActionable: plannedMeals.length === 0,
                isLast: false,
                scenario: 'BALANCED',
                hoursToSleep: sleepTarget - cursor
            });
            console.info(`${LOG_PREFIX} [PLANNER.loop.${iteration}] ✅ Added meal, moving cursor forward`);

            // Двигаем курсор — R1-9: используем тот же dynamicForceGap, что и в fitsAnotherMeal check
            cursor = nextPossibleStart;
        }

        // === Шаг 6: Перераспределить бюджет между найденными приёмами ===
        // v1.5.0: S1 chrono-nutrition + S2 MPS + S3 GL + S4 POST_WORKOUT
        const hoursToSleepPerMeal = plannedMeals.map(m => m.hoursToSleep);
        const mealTimesHours = plannedMeals.map(m => parseTime(m.timeStart));
        const finalBudgets = distributeBudget(remainingBudget, plannedMeals.length, hoursToSleepPerMeal, mealTimesHours);

        for (let i = 0; i < plannedMeals.length; i++) {
            plannedMeals[i].macros = finalBudgets[i];
            // S3: Glycemic Load target (Ludwig, 2002)
            // R12-B: GL_TARGET override для юзеров с high-GL history или SUGAR_RESET сценарием.
            // - glycemicLoadHistory.score < 0.5 (юзер регулярно ест high-GL) → дневной target 15 вместо 20
            // - scenarioHint === SUGAR_RESET → жёсткий target 10 (даже для не-pre-sleep)
            let dayGLTarget = GL_TARGET_DAY;
            if (scenarioHint === 'SUGAR_RESET') {
                dayGLTarget = 10;
            } else if (glycemicLoadHistory?.score !== undefined && glycemicLoadHistory.score < 0.5) {
                dayGLTarget = 15;
            }
            plannedMeals[i].targetGL = plannedMeals[i].hoursToSleep < PRE_SLEEP_BUFFER_HOURS
                ? GL_TARGET_PRE_SLEEP
                : dayGLTarget;
            // S5: sleep-friendly categories hint
            // R12-D: при low fiber history (<0.4) boost'ить vegetables/legumes
            // даже для non-pre-sleep meals — picker увидит и отдаст приоритет.
            let cats = plannedMeals[i].hoursToSleep < PRE_SLEEP_BUFFER_HOURS
                ? SLEEP_FRIENDLY_CATEGORIES
                : null;
            const isFirstMealOfPlan = i === 0;
            if (fiberRegularityScore !== null && fiberRegularityScore < 0.4 && !plannedMeals[i].isLast && isFirstMealOfPlan) {
                cats = ['vegetables', 'legumes', ...(cats || [])];
            }
            plannedMeals[i].sleepFriendlyCategories = cats;
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

        // Не переносим весь дневной недобор белка в один приём. remainingBudget
        // описывает остаток ДНЯ, поэтому при одном оставшемся окне раньше могло
        // появиться 120–150 г белка за раз. Для практической цели приёма используем
        // персональный верхний ориентир: не меньше MPS-ориентира 40 г, до 0.5 г/кг
        // для крупного пользователя, но не выше 60 г. Срезанные граммы не
        // компенсируем углеводами/жирами автоматически: перекошенный дневной
        // недобор не нужно закрывать любой ценой поздним приёмом.
        let deferredProteinGrams = 0;
        for (const meal of plannedMeals) {
            const proteinBeforeCap = Number(meal.macros?.prot) || 0;
            if (proteinBeforeCap > practicalProteinCapG) {
                const deferredForMeal = proteinBeforeCap - practicalProteinCapG;
                meal.macros.prot = practicalProteinCapG;
                meal.macros.kcal = practicalProteinCapG * 4
                    + (Number(meal.macros.carbs) || 0) * 4
                    + (Number(meal.macros.fat) || 0) * 9;
                meal.macros.effectiveKcal = practicalProteinCapG * 3
                    + (Number(meal.macros.carbs) || 0) * 4
                    + (Number(meal.macros.fat) || 0) * 9;
                meal.proteinCapped = true;
                meal.proteinCapG = practicalProteinCapG;
                meal.deferredProteinG = deferredForMeal;
                deferredProteinGrams += deferredForMeal;
                console.info(`${LOG_PREFIX} [PLANNER.protein] 🛡️ Practical per-meal target: ${Math.round(proteinBeforeCap)}g → ${practicalProteinCapG}g; ${Math.round(deferredForMeal)}g daily deficit not forced into this meal`);
            }
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

                // R7-A: пересчитать estimatedWaveEnd под новый (меньший) приём.
                try {
                    const newWaveHours = estimateWaveDuration(meal.macros, effectiveProfile);
                    const mealStart = parseTime(meal.timeStart);
                    const newWaveEnd = mealStart + newWaveHours;
                    meal.estimatedWaveEnd = formatTime(newWaveEnd);
                    meal.fatBurnWindow = {
                        start: formatTime(newWaveEnd),
                        end: formatTime(newWaveEnd),
                        deprecated: true
                    };
                    console.info(`${LOG_PREFIX} [PLANNER.presleep] Response window recomputed for capped meal: ${meal.estimatedWaveEnd} (${newWaveHours.toFixed(1)}ч)`);
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
        // R4-6 / R12-C: advisories — подсказки из истории паттернов + объяснения
        // почему recommender применил конкретные модификаторы. Юзер видит ПОЧЕМУ
        // планнер выбрал такие БЖУ, не воспринимает как «магия».
        const advisories = [];
        if (Number.isFinite(waveOverlapPct) && waveOverlapPct > 40) {
            advisories.push({
                key: 'wave_overlap',
                severity: waveOverlapPct > 60 ? 'high' : 'medium',
                text: `Приёмы часто накладываются по расчётному времени (${Math.round(waveOverlapPct)}% дней). Используй интервал как ориентир и учитывай голод.`
            });
        }
        if (stressMoodSignals?.stressLevel === 'high') {
            advisories.push({
                key: 'high_stress',
                severity: 'medium',
                text: 'Высокий стресс — лёгкий ужин и магний-богатые продукты улучшат сон.'
            });
        }
        // R12-C: объясняем patternImpact от recommender
        if (Array.isArray(patternImpactHints)) {
            patternImpactHints.forEach((p) => {
                if (p.pattern === 'C15') {
                    advisories.push({
                        key: 'c15_insulin_sensitivity',
                        severity: 'low',
                        text: 'Снижены углеводы из-за низкой инсулиновой чувствительности (по истории).'
                    });
                } else if (p.pattern === 'C35') {
                    advisories.push({
                        key: 'c35_protein_distribution',
                        severity: 'low',
                        text: 'Повышен белок для лучшего распределения по дню (история — мало белка в утренних приёмах).'
                    });
                } else if (p.pattern === 'C06') {
                    advisories.push({
                        key: 'c06_sleep_hunger',
                        severity: 'low',
                        text: 'Учтён плохой сон последних дней — больше белка, меньше простых углеводов.'
                    });
                } else if (p.pattern === 'C14') {
                    advisories.push({
                        key: 'c14_nutrient_timing',
                        severity: 'low',
                        text: 'Углеводы/белок подстроены под окно тренировки.'
                    });
                } else if (p.pattern === 'C01') {
                    advisories.push({
                        key: 'c01_meal_timing',
                        severity: 'low',
                        text: 'Время приёма смещено по твоему обычному ритму (история).'
                    });
                } else if (p.pattern === 'C10') {
                    advisories.push({
                        key: 'c10_fiber_low',
                        severity: 'low',
                        text: 'В первый приём добавлены овощи/бобовые — за неделю клетчатки было мало.'
                    });
                } else if (p.pattern === 'C34') {
                    advisories.push({
                        key: 'c34_gl_high',
                        severity: 'low',
                        text: 'Целевой GL снижен — в среднем гликемическая нагрузка за день была высокой.'
                    });
                } else if (p.pattern === 'C37') {
                    advisories.push({
                        key: 'c37_sugar_dependency',
                        severity: 'medium',
                        text: 'Есть зависимость от добавленного сахара — выбран приём с низким GL.'
                    });
                }
            });
        }
        // R12-A + R4-8: advisory о recovery после тренировки
        if (workoutRecoveryFactor > 0 && !recentWorkout && lastWorkout) {
            const recoveryPct = Math.round(workoutRecoveryFactor * 100);
            advisories.push({
                key: 'workout_recovery',
                severity: 'low',
                text: `+${recoveryPct}% белка для восстановления после ${isStrength ? 'силовой' : isCardio ? 'кардио' : ''} тренировки (${hoursAfterWorkout.toFixed(1)}ч назад).`
            });
        }
        // R12-B: SUGAR_RESET / glycemicLoad advisories
        if (scenarioHint === 'SUGAR_RESET') {
            advisories.push({
                key: 'sugar_reset',
                severity: 'medium',
                text: 'Reset после сладкого: следующий приём — низкий GL (<10) и без добавленного сахара.'
            });
        } else if (glycemicLoadHistory?.score !== undefined && glycemicLoadHistory.score < 0.5) {
            advisories.push({
                key: 'high_gl_history',
                severity: 'low',
                text: `Средняя дневная GL у тебя ${glycemicLoadHistory.dailyClass || 'высокая'} — таргет для приёмов снижен (15 вместо 20).`
            });
        }
        // R12-D: fiber advisory
        if (fiberRegularityScore !== null && fiberRegularityScore < 0.4) {
            advisories.push({
                key: 'low_fiber_history',
                severity: 'low',
                text: 'Мало клетчатки в истории — в этом приёме в приоритете овощи и бобовые.'
            });
        }

        // === R13: Dead signals activation ===
        const isFirstMealOfDay = !hasLastMeal || (lastMealTimeHours === null);
        const phenoSatiety = params.phenotypeApplied?.satiety;
        const phenoStress = params.phenotypeApplied?.stress;

        // R13-A: poor sleep advisory
        if (stressMoodSignals?.sleepQualityLevel === 'poor') {
            const sq = stressMoodSignals.sleepQualityScore;
            const hasBoost = workoutRecoveryFactor > 0 && lastWorkout;
            advisories.push({
                key: 'r13a_poor_sleep',
                severity: 'medium',
                text: sq !== null
                    ? `Сон был плохим (${sq}/10) — ${hasBoost ? 'добавили белок для восстановления' : 'фокус на белок и сложные углеводы'}.`
                    : 'Сон был плохим — фокус на белок и сложные углеводы.'
            });
        }

        // R13-B: low moodAvg advisory + scenario hint
        if (stressMoodSignals?.moodAvgLevel === 'low') {
            advisories.push({
                key: 'r13b_mood_support',
                severity: 'low',
                text: 'Настроение последних дней низкое — приоритет на омега-3, триптофан (индейка, яйца, бананы).'
            });
        }

        // R13-D: phenotype satiety + stress advisories
        if (phenoSatiety === 'volume_eater') {
            advisories.push({
                key: 'r13d_volume_eater',
                severity: 'low',
                text: 'Лучше насыщаешься объёмом — приоритет овощам и супам в этом приёме.'
            });
        } else if (phenoSatiety === 'low_satiety') {
            advisories.push({
                key: 'r13d_low_satiety',
                severity: 'low',
                text: 'Тебе трудно насыщаться — белок + клетчатка в начале приёма.'
            });
        }
        if (phenoStress === 'stress_eater' && stressMoodSignals?.stressLevel === 'high') {
            advisories.push({
                key: 'r13d_stress_eater',
                severity: 'medium',
                text: 'Твой фенотип — стресс-едок: при высоком стрессе особенно важен лёгкий ужин.'
            });
        }
        if (isStressAnorexicWithDeficit) {
            advisories.push({
                key: 'r13d_stress_anorexic',
                severity: 'high',
                text: 'В стрессе ты обычно недоедаешь — постарайся не пропустить этот приём.'
            });
        }

        // R13-G: micronutrient deficits advisories (деструктурировано выше)
        const microDeficits = Array.isArray(micronutrientDeficits) ? micronutrientDeficits : [];
        if (microDeficits.length >= 2 && isFirstMealOfDay) {
            advisories.push({
                key: 'r13g_micronutrient_focus',
                severity: 'medium',
                text: `Дефицит ${microDeficits.slice(0, 3).join(', ')} по неделе — добавь источники: красное мясо, печень, тыквенные семечки, шпинат.`
            });
        }
        if (microDeficits.includes('iron') && microDeficits.includes('calcium')) {
            advisories.push({
                key: 'r13g_iron_calcium_timing',
                severity: 'low',
                text: 'Развести железо и кальций по разным приёмам (≥3ч gap) — кальций блокирует абсорбцию железа.'
            });
        }

        // R13-I: hydration advisory
        const waterMl = Number(params.currentDay?.waterMl) || 0;
        const profileWeight = Number(params.profile?.weight) || 70;
        const waterGoalMl = profileWeight * 30;
        if (waterMl > 0 && waterMl < waterGoalMl * 0.4 && currentTimeHours >= 18) {
            advisories.push({
                key: 'r13i_dehydration',
                severity: 'medium',
                text: `Воды сегодня мало (${waterMl}/${Math.round(waterGoalMl)} мл) — добавь стакан перед едой: меньше ложного голода, лучше насыщение.`
            });
        }

        // R13-H: high NEAT advisory
        const todaySteps = Number(params.currentDay?.steps) || 0;
        const todayHousehold = Number(params.currentDay?.householdMin) || 0;
        if (todaySteps >= 15000 || todayHousehold >= 60) {
            const neatParts = [];
            if (todaySteps >= 15000) neatParts.push(`${todaySteps} шагов`);
            if (todayHousehold >= 60) neatParts.push(`${todayHousehold} мин быта`);
            advisories.push({
                key: 'r13h_high_neat',
                severity: 'low',
                text: `Сегодня высокая активность вне тренировок (${neatParts.join(' + ')}) — допустим небольшой запас углеводов в этом приёме.`
            });
        }

        if (deferredProteinGrams > 0) {
            advisories.push({
                key: 'practical_protein_cap',
                severity: 'medium',
                text: `Белковый недобор не нужно закрывать за один раз: цель этого приёма — до ${practicalProteinCapG} г.`
            });
        }

        // R13-E: early warnings bridge (earlyWarnings уже деструктурирован выше)
        const ewList = Array.isArray(earlyWarnings) ? earlyWarnings : [];
        const ewTypes = new Set(ewList.map(w => w?.type).filter(Boolean));
        if (ewTypes.has('BINGE_RISK')) {
            advisories.push({
                key: 'r13e_binge_risk',
                severity: 'medium',
                text: 'Растёт риск переедания — этот приём стабилизирует сахар: низкий GL + белок.'
            });
        }
        if (ewTypes.has('PROTEIN_DEFICIT')) {
            advisories.push({
                key: 'r13e_protein_deficit',
                severity: 'medium',
                text: 'Дефицит белка по неделе — приоритет белок:углеводы = 2:1.'
            });
        }
        if (ewTypes.has('CALORIC_DEBT')) {
            advisories.push({
                key: 'r13e_caloric_debt',
                severity: 'medium',
                text: 'Большой накопленный дефицит — не пропускай приём.'
            });
        }
        if (ewTypes.has('STRESS_ACCUMULATION')
            && !advisories.some(a => a.key === 'high_stress' || a.key === 'r13d_stress_eater')) {
            advisories.push({
                key: 'r13e_stress_accumulation',
                severity: 'medium',
                text: 'Стресс копится за последние дни — лёгкий ужин и магний-богатые продукты.'
            });
        }

        // R13-F: causal chains (causalChains уже деструктурирован выше)
        const chainList = Array.isArray(causalChains) ? causalChains : [];
        const chainTypes = new Set(chainList.map(c => c?.type || c?.id).filter(Boolean));
        if (chainTypes.has('SLEEP_STRESS_BINGE') || chainTypes.has('SLEEP→STRESS→BINGE')) {
            advisories.push({
                key: 'r13f_chain_sleep_stress',
                severity: 'high',
                text: 'Цепочка: плохой сон → стресс → переедание. Этот приём — точка разрыва: лёгкий, белковый, без сахара.'
            });
        }

        // R13-C: cascade state (cascadeState деструктурирован выше)
        const cascade = cascadeState || null;
        const cascadeBrokenMode = cascade?.state === 'BROKEN';
        if (cascade) {
            if (cascade.state === 'BROKEN') {
                advisories.push({
                    key: 'r13c_cascade_broken',
                    severity: 'high',
                    text: 'Каскад сломался — приоритет: попадание в калории и белок (не идеал, а возврат на трек).'
                });
            } else if (cascade.state === 'STRONG' && (cascade.daysAtPeak || 0) >= 7) {
                advisories.push({
                    key: 'r13c_cascade_strong',
                    severity: 'low',
                    text: `${cascade.daysAtPeak} дней на пике каскада — придерживаемся текущей схемы.`
                });
            }
            if (Number.isFinite(cascade.todayContrib) && cascade.todayContrib < -0.15) {
                advisories.push({
                    key: 'r13c_today_at_risk',
                    severity: 'medium',
                    text: 'Сегодня каскад под угрозой — этот приём критичен для возврата на курс.'
                });
            }
        }

        // === R13 finalization: dedup + cap + BROKEN filter ===
        const seenKeys = new Set();
        const severityRank = { high: 3, medium: 2, low: 1 };
        let finalAdvisories = advisories.filter((a) => {
            if (!a || !a.key || seenKeys.has(a.key)) return false;
            seenKeys.add(a.key);
            // При BROKEN — скрываем low severity (фокус юзера на главном)
            if (cascadeBrokenMode && a.severity === 'low') return false;
            return true;
        });
        finalAdvisories.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));
        if (finalAdvisories.length > 8) finalAdvisories = finalAdvisories.slice(0, 8);
        advisories.length = 0;
        finalAdvisories.forEach((a) => advisories.push(a));

        const summary = {
            totalMeals: plannedMeals.length,
            timelineStart: plannedMeals[0]?.timeStart,
            timelineEnd: plannedMeals[plannedMeals.length - 1]?.timeEnd,
            totalMacros: {
                prot: plannedMeals.reduce((sum, meal) => sum + (Number(meal.macros?.prot) || 0), 0),
                carbs: plannedMeals.reduce((sum, meal) => sum + (Number(meal.macros?.carbs) || 0), 0),
                kcal: plannedMeals.reduce((sum, meal) => sum + (Number(meal.macros?.kcal) || 0), 0)
            },
            sleepTarget: formatTime(sleepTarget),
            lastMealDeadline: formatTime(lastMealDeadline),
            decision: 'PLAN_MEALS',
            reasonCode: plannedMeals.length > 1 ? 'MULTI_MEAL_PLAN' : 'NEXT_MEAL_PLAN',
            topFactors: [
                `До сна около ${Math.max(0, sleepTarget - currentTimeHours).toFixed(1)} ч`,
                deferredProteinGrams > 0 ? `Цель белка на этот приём — до ${practicalProteinCapG} г` : null,
                proteinRecoveryOnly
                    ? `Калории почти закрыты, белок ${Math.round(proteinProgress * 100)}% от цели`
                    : `Остаток дня ${Math.round(remainingBudget.kcal)} ккал`,
                currentWaveEnd ? `Окно после текущей волны начинается около ${formatTime(nextMealEarliest)}` : null,
                hasFreshHunger ? `Свежая оценка голода ${Math.round(hungerLevel)}/10` : null,
                recentWorkout ? 'Идёт восстановление после тренировки' : null
            ].filter(Boolean).slice(0, 4),
            tradeoffs: [
                phenotypeBuffer > 0 ? 'Метаболический профиль сдвинул последний приём раньше' : null,
                deferredProteinGrams > 0 ? 'Не переносим весь дневной недобор белка в один приём' : null
            ].filter(Boolean),
            sleepContext,
            confidence: sleepContext.confidence,
            alternatives: [],
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
        resolveSleepContext,
        estimateSleepTarget,
        estimateWaveDuration,
        distributeBudget,
        estimatePersonalWaveHours, // S6
        getChronoRatio,            // S1
        validateReplanResult,
        // Utilities
        parseTime,
        formatTime,
        normalizePlanningCurrentTime,
        clockTimeAtOrBefore,
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
        'S8-PersonalSleep': 'weighted median of observed sleepStart → continuous next-night timeline with confidence'
    });

})(window);
