// insights/patterns/quality.js — Modular quality analyzers (v6.1.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};
    const piCalculations = HEYS.InsightsPI?.calculations || global.piCalculations || {};

    const PATTERNS = piConst.PATTERNS || {
        MEAL_QUALITY_TREND: 'meal_quality',
        NUTRITION_QUALITY: 'nutrition_quality',
        PROTEIN_SATIETY: 'protein_satiety',
        FIBER_REGULARITY: 'fiber_regularity',
        NOVA_QUALITY: 'nova_quality',
        NUTRIENT_DENSITY: 'nutrient_density'
    };

    const CONFIG = piConst.CONFIG || {
        MIN_CORRELATION_DISPLAY: 0.35
    };

    const average = piStats.average || function (arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((sum, value) => sum + (Number(value) || 0), 0) / arr.length;
    };

    const calculateTrend = piStats.calculateTrend || function (values) {
        if (!Array.isArray(values) || values.length < 2) return 0;
        const n = values.length;
        let sumX = 0;
        let sumY = 0;
        let sumXY = 0;
        let sumX2 = 0;
        for (let i = 0; i < n; i++) {
            const y = Number(values[i]) || 0;
            sumX += i;
            sumY += y;
            sumXY += i * y;
            sumX2 += i * i;
        }
        const denom = n * sumX2 - sumX * sumX;
        if (!denom) return 0;
        const slope = (n * sumXY - sumX * sumY) / denom;
        return Number.isFinite(slope) ? slope : 0;
    };

    /**
     * Meal Quality Trend: тренд качества приемов пищи.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} pIndex - Индекс продуктов по id.
     * @param {object} optimum - Целевые метрики.
     * @returns {object} Результат паттерна тренда качества.
     */
    function analyzeMealQualityTrend(days, pIndex, optimum) {
        const pattern = PATTERNS.MEAL_QUALITY_TREND || 'meal_quality';
        const getMealQualityScore = HEYS.getMealQualityScore;

        if (typeof getMealQualityScore !== 'function') {
            return {
                pattern,
                available: false,
                insight: 'Оценка качества приёмов недоступна'
            };
        }

        const dailyScores = [];

        for (const day of (days || [])) {
            if (!day?.meals || day.meals.length === 0) continue;

            const scores = day.meals.map((meal) => {
                try {
                    const quality = getMealQualityScore(meal, meal.name || 'Приём', optimum, pIndex);
                    return Number(quality?.score) || 0;
                } catch (_e) {
                    return 0;
                }
            }).filter(s => s > 0);

            if (scores.length > 0) {
                dailyScores.push({
                    date: day.date,
                    avgScore: average(scores),
                    count: scores.length
                });
            }
        }

        if (dailyScores.length < 3) {
            return {
                pattern,
                available: false,
                confidence: 0.3,
                insight: 'Недостаточно данных для анализа качества'
            };
        }

        dailyScores.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const scores = dailyScores.map(d => d.avgScore);

        const trend = calculateTrend(scores);
        const avgScore = average(scores);
        const score = Math.round(avgScore);

        let insight;
        if (trend > 0.5) {
            insight = `📈 Качество питания улучшается! +${Math.round(trend * 7)} за неделю`;
        } else if (trend < -0.5) {
            insight = '📉 Качество питания снижается. Обрати внимание на состав';
        } else {
            insight = `Стабильное качество питания: ${Math.round(avgScore)}/100`;
        }

        const minDaysForFull = piConst.CONFIG?.MIN_DAYS_FOR_FULL_ANALYSIS || 7;

        return {
            pattern,
            available: true,
            avgScore: Math.round(avgScore),
            trend: Math.round(trend * 100) / 100,
            trendDirection: trend > 0.5 ? 'up' : trend < -0.5 ? 'down' : 'stable',
            dailyScores,
            score,
            confidence: (days || []).length >= minDaysForFull ? 0.8 : 0.5,
            insight
        };
    }

    /**
     * C2: Nutrition Quality.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна качества питания.
     */
    function analyzeNutritionQuality(days, pIndex) {
        const pattern = PATTERNS.NUTRITION_QUALITY || 'nutrition_quality';
        const dailyData = [];

        for (const day of (days || [])) {
            if (!day?.meals || day.meals.length === 0) continue;

            let totalProtein = 0;
            let totalCarbs = 0;
            let totalSimple = 0;
            let totalFat = 0;
            let totalGoodFat = 0;
            let totalFiber = 0;
            let totalKcal = 0;

            const uniqueProducts = new Set();
            const uniqueCategories = new Set();

            for (const meal of day.meals) {
                if (!meal?.items) continue;

                for (const item of meal.items) {
                    const productId = String(item?.product_id || item?.productId || item?.id || '').toLowerCase();
                    const prod = pIndex?.byId?.get?.(productId);
                    if (!prod || !item?.grams) continue;

                    const p = Number(prod.protein100) || 0;
                    const simple = Number(prod.simple100) || 0;
                    const complex = Number(prod.complex100) || 0;
                    const carbs = simple + complex;
                    const goodFat = Number(prod.goodFat100) || 0;
                    const badFat = Number(prod.badFat100) || 0;
                    const trans = Number(prod.trans100) || 0;
                    const fat = goodFat + badFat + trans;
                    const fiber = Number(prod.fiber100) || 0;
                    const grams = Number(item.grams) || 0;

                    totalProtein += p * grams / 100;
                    totalCarbs += carbs * grams / 100;
                    totalSimple += simple * grams / 100;
                    totalFat += fat * grams / 100;
                    totalGoodFat += goodFat * grams / 100;
                    totalFiber += fiber * grams / 100;
                    totalKcal += (p * 3 + carbs * 4 + fat * 9) * grams / 100;

                    uniqueProducts.add(prod.name || prod.id || item.product_id);
                    const category = prod.category || prod.group || prod.foodGroup || prod.type;
                    if (category) uniqueCategories.add(String(category).toLowerCase());
                }
            }

            if (totalKcal <= 0) continue;

            const proteinPct = (totalProtein * 3 / totalKcal) * 100;
            const fiberPer1000 = (totalFiber / totalKcal) * 1000;
            const simplePct = totalCarbs > 0 ? (totalSimple / totalCarbs) * 100 : 0;
            const goodFatPct = totalFat > 0 ? (totalGoodFat / totalFat) * 100 : 0;

            let score = 0;

            if (proteinPct >= 25) score += 20;
            else if (proteinPct >= 20) score += 15;
            else if (proteinPct >= 15) score += 8;

            if (fiberPer1000 >= 14) score += 20;
            else if (fiberPer1000 >= 10) score += 12;
            else if (fiberPer1000 >= 7) score += 6;

            if (simplePct <= 30) score += 15;
            else if (simplePct <= 45) score += 8;

            if (goodFatPct >= 60) score += 15;
            else if (goodFatPct >= 40) score += 8;

            if (uniqueCategories.size >= 12) score += 15;
            else if (uniqueCategories.size >= 8) score += 10;
            else if (uniqueCategories.size >= 5) score += 5;

            if (uniqueProducts.size >= 12) score += 10;
            else if (uniqueProducts.size >= 8) score += 6;
            else if (uniqueProducts.size >= 5) score += 3;

            dailyData.push({
                date: day.date,
                score: Math.min(100, score),
                proteinPct: Math.round(proteinPct),
                fiberPer1000: Math.round(fiberPer1000 * 10) / 10,
                simplePct: Math.round(simplePct),
                goodFatPct: Math.round(goodFatPct),
                categories: uniqueCategories.size,
                products: uniqueProducts.size
            });
        }

        if (dailyData.length < 3) {
            return {
                pattern,
                available: false,
                insight: 'Недостаточно данных для оценки качества питания'
            };
        }

        const avgScore = average(dailyData.map(d => d.score));
        const avgFiber = average(dailyData.map(d => d.fiberPer1000));
        const avgProtein = average(dailyData.map(d => d.proteinPct));

        let insight;
        if (avgScore >= 80) {
            insight = '🌿 Отличное качество питания: баланс и разнообразие на высоте';
        } else if (avgFiber < 10) {
            insight = `⚠️ Мало клетчатки (${Math.round(avgFiber)}г/1000ккал) — добавь овощи`;
        } else if (avgProtein < 20) {
            insight = `⚠️ Белка маловато (${Math.round(avgProtein)}%) — добавь источник белка`;
        } else {
            insight = 'Качество питания в норме, есть потенциал улучшения';
        }

        return {
            pattern,
            available: true,
            score: Math.round(avgScore),
            avgProteinPct: Math.round(avgProtein),
            avgFiberPer1000: Math.round(avgFiber * 10) / 10,
            dataPoints: dailyData.length,
            confidence: dailyData.length >= 7 ? 0.8 : 0.5,
            insight,
            debug: {
                dailyData: dailyData.slice(0, 3)
            }
        };
    }

    /**
     * Protein Satiety: корреляция доли белка и калорийности.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} profile - Профиль пользователя.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна белка и сытости.
     */
    function analyzeProteinSatiety(days, profile, pIndex) {
        const pattern = PATTERNS.PROTEIN_SATIETY || 'protein_satiety';
        void profile;

        const pairs = [];

        for (const day of (days || [])) {
            if (!day?.meals || day.meals.length === 0) continue;

            let dayProtein = 0;
            let dayKcal = 0;

            for (const meal of day.meals) {
                if (!meal?.items) continue;

                for (const item of meal.items) {
                    const productId = String(item?.product_id || item?.productId || item?.id || '').toLowerCase();
                    const prod = pIndex?.byId?.get?.(productId);
                    if (!prod || !item?.grams) continue;

                    const p = Number(prod.protein100) || 0;
                    const c = (Number(prod.simple100) || 0) + (Number(prod.complex100) || 0);
                    const f = (Number(prod.badFat100) || 0) + (Number(prod.goodFat100) || 0) + (Number(prod.trans100) || 0);
                    const grams = Number(item.grams) || 0;

                    dayProtein += p * grams / 100;
                    dayKcal += (p * 3 + c * 4 + f * 9) * grams / 100;
                }
            }

            if (dayKcal > 0) {
                const proteinPct = (dayProtein * 3 / dayKcal) * 100;
                pairs.push({ proteinPct, protein: dayProtein, kcal: dayKcal, date: day.date });
            }
        }

        if (pairs.length < 7) {
            return {
                pattern,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных о белке'
            };
        }

        const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

        const proteinArr = pairs.map(p => p.proteinPct);
        const kcalArr = pairs.map(p => p.kcal);
        const pearsonCorrelation = piStats.pearsonCorrelation || (() => 0);
        const correlation = pearsonCorrelation(proteinArr, kcalArr);

        const avgProteinPct = average(proteinArr);
        const avgProteinG = average(pairs.map(p => p.protein));
        const score = avgProteinPct >= 25 ? 100 : avgProteinPct >= 20 ? 80 : 60;
        const calculatedConfidence = Math.abs(correlation) >= (CONFIG.MIN_CORRELATION_DISPLAY || 0.35)
            ? baseConfidence * (1 + Math.abs(correlation))
            : baseConfidence;

        let insight;
        if (correlation < -0.3) {
            insight = '🥩 Больше белка → меньше общих калорий! Белок насыщает';
        } else if (avgProteinPct >= 25) {
            insight = `💪 Отличный уровень белка: ${Math.round(avgProteinPct)}% калоража`;
        } else if (avgProteinPct < 20) {
            insight = `⚠️ Белок ${Math.round(avgProteinPct)}% — добавь для сытости`;
        } else {
            insight = `Белок в норме: ${Math.round(avgProteinPct)}%`;
        }

        return {
            pattern,
            available: true,
            avgProteinPct: Math.round(avgProteinPct),
            avgProteinG: Math.round(avgProteinG),
            correlation: Math.round(correlation * 100) / 100,
            dataPoints: pairs.length,
            score,
            confidence: pairs.length >= 10 ? 0.8 : 0.5,
            insight,
            formula: 'Белок% = (protein_g × 4 / total_kcal) × 100\nПорог сытости: ≥25% = отлично, 20-25% = норма',
            debug: {
                avgKcal: Math.round(average(kcalArr)),
                source: 'Westerterp-Plantenga, 2003 (PMID: 12724520)',
                calculatedConfidence: Math.round(calculatedConfidence * 100) / 100
            }
        };
    }

    /**
     * Fiber Regularity: клетчатка и регулярность потребления.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна клетчатки.
     */
    function analyzeFiberRegularity(days, pIndex) {
        const pattern = PATTERNS.FIBER_REGULARITY || 'fiber_regularity';
        const fiberData = [];

        for (const day of (days || [])) {
            if (!day?.meals) continue;

            let dayFiber = 0;
            let dayKcal = 0;

            for (const meal of day.meals) {
                if (!meal?.items) continue;

                for (const item of meal.items) {
                    const productId = String(item?.product_id || item?.productId || item?.id || '').toLowerCase();
                    const prod = pIndex?.byId?.get?.(productId);
                    if (!prod || !item?.grams) continue;

                    const p = Number(prod.protein100) || 0;
                    const c = (Number(prod.simple100) || 0) + (Number(prod.complex100) || 0);
                    const f = (Number(prod.badFat100) || 0) + (Number(prod.goodFat100) || 0) + (Number(prod.trans100) || 0);
                    const grams = Number(item.grams) || 0;

                    dayFiber += (Number(prod.fiber100) || 0) * grams / 100;
                    dayKcal += (p * 3 + c * 4 + f * 9) * grams / 100;
                }
            }

            if (dayKcal > 0) {
                const fiberPer1000 = (dayFiber / dayKcal) * 1000;
                fiberData.push({ fiber: dayFiber, fiberPer1000, kcal: dayKcal, date: day.date });
            }
        }

        if (fiberData.length < 7) {
            return {
                pattern,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных о клетчатке'
            };
        }

        const avgFiber = average(fiberData.map(d => d.fiber));
        const avgFiberPer1000 = average(fiberData.map(d => d.fiberPer1000));
        const stdDev = piStats.stdDev || (() => 0);
        const consistency = avgFiber > 0 ? 100 - (stdDev(fiberData.map(d => d.fiber)) / avgFiber) * 100 : 0;

        const score = avgFiberPer1000 >= 14 ? 100 : avgFiberPer1000 >= 10 ? 70 : 40;

        let insight;
        if (avgFiberPer1000 >= 14) {
            insight = `🥗 Отличный уровень клетчатки: ${Math.round(avgFiber)}г/день`;
        } else if (avgFiberPer1000 >= 10) {
            insight = `Клетчатка в норме: ${Math.round(avgFiber)}г/день. Можно чуть больше`;
        } else {
            insight = `⚠️ Мало клетчатки: ${Math.round(avgFiber)}г/день. Добавь овощи`;
        }

        return {
            pattern,
            available: true,
            avgFiber: Math.round(avgFiber),
            avgFiberPer1000: Math.round(avgFiberPer1000 * 10) / 10,
            consistency: Math.round(consistency),
            dataPoints: fiberData.length,
            score,
            confidence: fiberData.length >= 10 ? 0.8 : 0.5,
            insight,
            formula: 'Клетчатка/1000ккал = (fiber_g / total_kcal) × 1000\nНорма: ≥14г/1000ккал',
            debug: {
                avgKcal: Math.round(average(fiberData.map(d => d.kcal))),
                source: 'Sonnenburg & Sonnenburg, 2014'
            }
        };
    }
    /**
     * C10: NOVA Quality Score.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна NOVA.
     */
    function analyzeNOVAQuality(days, pIndex) {
        const pattern = PATTERNS.NOVA_QUALITY || 'nova_quality';
        const minDays = piConst.CONFIG?.MIN_DAYS_FOR_FULL_ANALYSIS || 7;

        if (!Array.isArray(days) || days.length < minDays) {
            return {
                pattern,
                available: false,
                reason: 'min_days_required',
                minDaysRequired: minDays,
                daysProvided: Array.isArray(days) ? days.length : 0
            };
        }

        const novaKcal = { 1: 0, 2: 0, 3: 0, 4: 0 };
        let totalKcal = 0;
        let fermentedKcal = 0;
        let rawKcal = 0;

        for (const day of days) {
            for (const meal of (day.meals || [])) {
                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;

                    const itemKcal = calculateItemKcal(item, pIndex);
                    totalKcal += itemKcal;

                    const novaGroup = Number(prod.nova_group || prod.novaGroup) || 3;
                    novaKcal[novaGroup] = (novaKcal[novaGroup] || 0) + itemKcal;

                    if (prod.is_fermented || prod.isFermented) fermentedKcal += itemKcal;
                    if (prod.is_raw || prod.isRaw) rawKcal += itemKcal;
                }
            }
        }

        if (totalKcal < 100) {
            return { pattern, available: false, reason: 'insufficient_energy_data' };
        }

        const novaDistribution = {
            1: Math.round((novaKcal[1] / totalKcal) * 1000) / 10,
            2: Math.round((novaKcal[2] / totalKcal) * 1000) / 10,
            3: Math.round((novaKcal[3] / totalKcal) * 1000) / 10,
            4: Math.round((novaKcal[4] / totalKcal) * 1000) / 10
        };

        const ultraProcessedPct = novaDistribution[4];
        const livingFoodsPct = Math.round(((fermentedKcal + rawKcal) / totalKcal) * 1000) / 10;

        let score = 100 - (ultraProcessedPct * 0.8);
        score += Math.min(livingFoodsPct * 0.5, 10);
        score = Math.max(0, Math.min(100, Math.round(score)));

        let insight = '';
        if (ultraProcessedPct > 50) {
            insight = `🔴 ${ultraProcessedPct}% калорий из ультрапереработки (NOVA-4). Высокий риск!`;
        } else if (ultraProcessedPct > 25) {
            insight = `🟠 ${ultraProcessedPct}% ультрапереработки. Снижай колбасы/снеки/сладости`;
        } else if (ultraProcessedPct > 10) {
            insight = `🟡 ${ultraProcessedPct}% ультрапереработки. В пределах нормы`;
        } else {
            insight = `✅ ${ultraProcessedPct}% ультрапереработки. Отличное качество рациона!`;
        }

        if (livingFoodsPct > 5) {
            insight += ` +${livingFoodsPct}% живых продуктов 🌱`;
        }

        const confidence = days.length >= 14 ? 0.85 : 0.70;

        return {
            pattern,
            available: true,
            novaDistribution,
            ultraProcessedPct,
            livingFoodsPct,
            fermentedKcal: Math.round(fermentedKcal),
            rawKcal: Math.round(rawKcal),
            totalKcal: Math.round(totalKcal),
            dataPoints: days.length,
            score,
            confidence,
            insight
        };
    }


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
    HEYS.InsightsPI.patternModules.analyzeMealQualityTrend = analyzeMealQualityTrend;
    HEYS.InsightsPI.patternModules.analyzeNutritionQuality = analyzeNutritionQuality;
    HEYS.InsightsPI.patternModules.analyzeProteinSatiety = analyzeProteinSatiety;
    HEYS.InsightsPI.patternModules.analyzeFiberRegularity = analyzeFiberRegularity;
    HEYS.InsightsPI.patternModules.analyzeNOVAQuality = analyzeNOVAQuality;
    HEYS.InsightsPI.patternModules.analyzeNutrientDensity = analyzeNutrientDensity;
})(typeof window !== 'undefined' ? window : global);
