// insights/patterns/quality.js — Modular quality analyzers (v6.1.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};
    const piCalculations = HEYS.InsightsPI?.calculations || global.piCalculations || {};

    const PATTERNS = piConst.PATTERNS || {
        NUTRIENT_DENSITY: 'nutrient_density'
    };

    const calculateItemKcal = piCalculations.calculateItemKcal || function (item, pIndex) {
        const prod = pIndex?.byId?.get?.(item?.product_id);
        if (!prod) return 0;
        return (Number(prod.kcal100) || 0) * (Number(item?.grams) || 0) / 100;
    };

    /**
     * C21: Nutrient Density Score.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна нутриентной плотности.
     */
    function analyzeNutrientDensity(days, pIndex) {
        const pattern = PATTERNS.NUTRIENT_DENSITY || 'nutrient_density';
        const minDays = 7;

        if (!Array.isArray(days) || days.length < minDays) {
            return {
                pattern,
                available: false,
                reason: 'min_days_required',
                minDaysRequired: minDays,
                daysProvided: Array.isArray(days) ? days.length : 0
            };
        }

        let totalKcal = 0;
        let protein = 0;
        let fiber = 0;
        let vitC = 0;
        let iron = 0;
        let magnesium = 0;
        let potassium = 0;
        let calcium = 0;
        let addedSugar = 0;
        let sodium = 0;

        for (const day of days) {
            for (const meal of (day.meals || [])) {
                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;

                    const grams = Number(item.grams) || 0;
                    if (grams <= 0) continue;
                    const factor = grams / 100;

                    totalKcal += calculateItemKcal(item, pIndex);
                    protein += (Number(prod.protein100) || 0) * factor;
                    fiber += (Number(prod.fiber100) || 0) * factor;
                    vitC += (Number(prod.vitamin_c) || 0) * factor;
                    iron += (Number(prod.iron) || 0) * factor;
                    magnesium += (Number(prod.magnesium) || 0) * factor;
                    potassium += (Number(prod.potassium) || 0) * factor;
                    calcium += (Number(prod.calcium) || 0) * factor;
                    sodium += (Number(prod.sodium100) || Number(prod.sodium) || 0) * factor;

                    const simple = (Number(prod.simple100) || 0) * factor;
                    const sugar100 = Number(prod.sugar100);
                    if (Number.isFinite(sugar100) && sugar100 > 0) {
                        addedSugar += sugar100 * factor;
                    } else if (Number(prod.nova_group) === 4 && simple > 0) {
                        addedSugar += simple * 0.7;
                    } else if (simple > 0) {
                        addedSugar += simple * 0.3;
                    }
                }
            }
        }

        if (totalKcal < 500) {
            return { pattern, available: false, reason: 'insufficient_energy_data' };
        }

        const per1000 = (value) => (value / totalKcal) * 1000;

        const density = {
            protein: per1000(protein),
            fiber: per1000(fiber),
            vitamin_c: per1000(vitC),
            iron: per1000(iron),
            magnesium: per1000(magnesium),
            potassium: per1000(potassium),
            calcium: per1000(calcium),
            sugar: per1000(addedSugar),
            sodium: per1000(sodium)
        };

        const targets = {
            protein: 35,
            fiber: 14,
            vitamin_c: 45,
            iron: 6,
            magnesium: 200,
            potassium: 1750,
            calcium: 500
        };

        const positives =
            Math.min(1, density.protein / targets.protein) * 20 +
            Math.min(1, density.fiber / targets.fiber) * 20 +
            Math.min(1, density.vitamin_c / targets.vitamin_c) * 15 +
            Math.min(1, density.iron / targets.iron) * 10 +
            Math.min(1, density.magnesium / targets.magnesium) * 10 +
            Math.min(1, density.potassium / targets.potassium) * 15 +
            Math.min(1, density.calcium / targets.calcium) * 10;

        const sugarPenalty = density.sugar > 25 ? Math.min(15, (density.sugar - 25) * 0.4) : 0;
        const sodiumPenalty = density.sodium > 1000 ? Math.min(15, (density.sodium - 1000) * 0.01) : 0;

        const score = Math.max(0, Math.min(100, Math.round(positives - sugarPenalty - sodiumPenalty)));

        let insight = '';
        if (score >= 80) insight = `✅ Высокая нутриентная плотность (${score}/100).`;
        else if (score >= 60) insight = `🟡 Средняя нутриентная плотность (${score}/100).`;
        else insight = `🔴 Низкая нутриентная плотность (${score}/100): «пустые калории».`;

        if (density.fiber < targets.fiber) insight += ' Клетчатка на 1000 ккал ниже цели.';
        if (density.sugar > 25) insight += ` Добавленный сахар ${density.sugar.toFixed(1)}г/1000ккал.`;
        if (density.sodium > 1000) insight += ` Натрий ${Math.round(density.sodium)}мг/1000ккал.`;

        const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
        const confidence = piStats.applySmallSamplePenalty
            ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
            : baseConfidence;

        return {
            pattern,
            available: true,
            kcalAnalyzed: Math.round(totalKcal),
            density: {
                protein: Math.round(density.protein * 10) / 10,
                fiber: Math.round(density.fiber * 10) / 10,
                vitamin_c: Math.round(density.vitamin_c * 10) / 10,
                iron: Math.round(density.iron * 10) / 10,
                magnesium: Math.round(density.magnesium),
                potassium: Math.round(density.potassium),
                calcium: Math.round(density.calcium),
                sugar: Math.round(density.sugar * 10) / 10,
                sodium: Math.round(density.sodium)
            },
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeNutrientDensity = analyzeNutrientDensity;
})(typeof window !== 'undefined' ? window : global);
