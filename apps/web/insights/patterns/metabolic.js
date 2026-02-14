// insights/patterns/metabolic.js — Modular metabolic analyzers (v6.2.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};
    const SCIENCE_INFO = piConst.SCIENCE_INFO || HEYS.InsightsPI?.science || global.piScience || {};
    const CONFIG = piConst.CONFIG || { MIN_DAYS_FOR_FULL_ANALYSIS: 7 };
    const average = piStats.average || function (arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((sum, v) => sum + (Number(v) || 0), 0) / arr.length;
    };

    const PATTERNS = piConst.PATTERNS || {
        GLYCEMIC_LOAD: 'glycemic_load',
        OMEGA_BALANCER: 'omega_balancer',
        HEART_HEALTH: 'heart_health',
        ELECTROLYTE_HOMEOSTASIS: 'electrolyte_homeostasis',
        INSULIN_SENSITIVITY: 'insulin_sensitivity',
        GUT_HEALTH: 'gut_health'
    };

    /**
     * C9: Heart & Metabolic Health.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeHeartHealth(days, pIndex) {
        if (!days || days.length < CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) {
            return { pattern: PATTERNS.HEART_HEALTH, available: false };
        }

        const sodiumValues = [];
        const potassiumValues = [];
        const cholesterolValues = [];

        for (const day of days) {
            if (!day.meals?.length) continue;

            let daySodium = 0;
            let dayPotassium = 0;
            let dayCholesterol = 0;

            for (const meal of day.meals) {
                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;

                    const grams = item.grams || 0;
                    const factor = grams / 100;

                    if (prod.sodium100) daySodium += prod.sodium100 * factor;
                    if (prod.potassium) dayPotassium += prod.potassium * factor;
                    if (prod.cholesterol100 || prod.cholesterol) {
                        dayCholesterol += (prod.cholesterol100 || prod.cholesterol) * factor;
                    }
                }
            }

            if (daySodium > 0) sodiumValues.push(daySodium);
            if (dayPotassium > 0) potassiumValues.push(dayPotassium);
            if (dayCholesterol > 0) cholesterolValues.push(dayCholesterol);
        }

        if (sodiumValues.length < 5 || potassiumValues.length < 5) {
            return { pattern: PATTERNS.HEART_HEALTH, available: false };
        }

        const avgSodium = average(sodiumValues);
        const avgPotassium = average(potassiumValues);
        const avgCholesterol = cholesterolValues.length > 0 ? average(cholesterolValues) : 0;
        const naKRatio = avgSodium / avgPotassium;

        let score = 100;
        if (avgSodium > 2300) score -= 20;
        if (avgSodium > 3000) score -= 20;
        if (naKRatio > 1.5) score -= 25;
        else if (naKRatio > 1.0) score -= 10;
        if (avgCholesterol > 300) score -= 15;

        score = Math.max(0, Math.round(score));

        let insight = '';
        if (naKRatio < 1.0 && avgSodium < 2000) {
            insight = `✅ Отличный Na:K баланс (${naKRatio.toFixed(2)}), натрий ${Math.round(avgSodium)}мг/день`;
        } else if (naKRatio > 1.5) {
            insight = `🔴 Na:K = ${naKRatio.toFixed(2)} (норма <1.0). Риск гипертензии! Меньше соли, больше овощей/фруктов`;
        } else if (avgSodium > 2300) {
            insight = `🟠 Натрий ${Math.round(avgSodium)}мг/день (норма <2000мг). Меньше колбас/сыров/солений`;
        } else {
            insight = `🟡 Na:K = ${naKRatio.toFixed(2)} (норма <1.0), натрий ${Math.round(avgSodium)}мг. Можно лучше`;
        }

        if (avgCholesterol > 300) {
            insight += `. Холестерин ${Math.round(avgCholesterol)}мг (много яиц/мяса)`;
        }

        const confidence = days.length >= 14 ? 0.80 : 0.65;

        return {
            pattern: PATTERNS.HEART_HEALTH,
            available: true,
            avgSodium: Math.round(avgSodium),
            avgPotassium: Math.round(avgPotassium),
            avgCholesterol: Math.round(avgCholesterol),
            naKRatio: Math.round(naKRatio * 100) / 100,
            dataPoints: days.length,
            score,
            confidence,
            insight
        };
    }

    /**
     * C8: Omega Balance & Inflammation.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeOmegaBalance(days, pIndex) {
        if (!days || days.length < CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS) {
            return { pattern: PATTERNS.OMEGA_BALANCER, available: false };
        }

        let totalOmega3 = 0;
        let totalOmega6 = 0;
        let inflammatoryLoad = 0;

        for (const day of days) {
            if (!day.meals?.length) continue;

            for (const meal of day.meals) {
                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;

                    const grams = item.grams || 0;
                    const factor = grams / 100;

                    if (prod.omega3_100 || prod.omega3) totalOmega3 += (prod.omega3_100 || prod.omega3) * factor;
                    if (prod.omega6_100 || prod.omega6) totalOmega6 += (prod.omega6_100 || prod.omega6) * factor;

                    const sugar = (prod.simple100 || 0) * factor;
                    const trans = (prod.trans100 || 0) * factor;
                    const fiber = (prod.fiber100 || 0) * factor;
                    inflammatoryLoad += (sugar * 0.5 + trans * 2) - (fiber * 0.3 + (prod.omega3_100 || 0) * factor * 1.5);
                }
            }
        }

        if (totalOmega3 < 0.1 || totalOmega6 < 0.1) {
            return { pattern: PATTERNS.OMEGA_BALANCER, available: false };
        }

        const omega6to3Ratio = totalOmega6 / totalOmega3;

        let score = 100;
        if (omega6to3Ratio > 10) score = 40;
        else if (omega6to3Ratio > 6) score = 60;
        else if (omega6to3Ratio > 4) score = 75;
        else score = 95;

        if (inflammatoryLoad > 50) score -= 10;
        score = Math.max(0, Math.round(score));

        let insight = '';
        if (omega6to3Ratio < 4) {
            insight = `✅ Отличный баланс омега-6:3 = ${omega6to3Ratio.toFixed(1)} (оптимум <4:1)`;
        } else if (omega6to3Ratio < 6) {
            insight = `🟡 Омега-6:3 = ${omega6to3Ratio.toFixed(1)} (норма <4:1). Добавь рыбу/льняное масло`;
        } else {
            insight = `🔴 Омега-6:3 = ${omega6to3Ratio.toFixed(1)} (риск воспаления!). Меньше подсолнечного масла, больше рыбы`;
        }

        if (inflammatoryLoad > 50) {
            insight += `. Высокая воспалительная нагрузка (${Math.round(inflammatoryLoad)})`;
        }

        const confidence = days.length >= 14 ? 0.75 : 0.60;

        return {
            pattern: PATTERNS.OMEGA_BALANCER,
            available: true,
            totalOmega3: Math.round(totalOmega3 * 10) / 10,
            totalOmega6: Math.round(totalOmega6 * 10) / 10,
            omega6to3Ratio: Math.round(omega6to3Ratio * 10) / 10,
            inflammatoryLoad: Math.round(inflammatoryLoad),
            dataPoints: days.length,
            score,
            confidence,
            insight
        };
    }

    /**
     * C14: Glycemic Load Optimizer.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeGlycemicLoad(days, pIndex) {
        const pattern = PATTERNS.GLYCEMIC_LOAD || 'glycemic_load';
        const minDays = 5;
        const minMealsPerDay = 3;

        if (!Array.isArray(days) || days.length < minDays) {
            return {
                pattern,
                available: false,
                reason: 'min_days_required',
                minDaysRequired: minDays,
                daysProvided: Array.isArray(days) ? days.length : 0
            };
        }

        const validDays = days.filter(d => Array.isArray(d?.meals) && d.meals.length > 0);
        if (validDays.length === 0) {
            return { pattern, available: false, reason: 'no_meals_data' };
        }

        const totalMeals = validDays.reduce((sum, d) => sum + d.meals.length, 0);
        const avgMealsPerDay = totalMeals / validDays.length;
        if (avgMealsPerDay < minMealsPerDay) {
            return {
                pattern,
                available: false,
                reason: 'min_meals_required',
                minMealsPerDay,
                avgMealsPerDay: Math.round(avgMealsPerDay * 10) / 10
            };
        }

        const dailyGLValues = [];
        const eveningRatios = [];
        let highMealGLCount = 0;
        let mediumMealGLCount = 0;
        let lowMealGLCount = 0;

        for (const day of validDays) {
            let dailyGL = 0;
            let eveningGL = 0;

            for (const meal of day.meals) {
                let mealGL = 0;

                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;

                    const gi = Number(prod.gi) || 0;
                    const carbs = (Number(prod.simple100) || 0) + (Number(prod.complex100) || 0);
                    const grams = Number(item.grams) || 0;

                    if (gi <= 0 || carbs <= 0 || grams <= 0) continue;
                    mealGL += (gi * carbs * grams) / 10000;
                }

                if (mealGL > 20) highMealGLCount++;
                else if (mealGL >= 10) mediumMealGLCount++;
                else lowMealGLCount++;

                dailyGL += mealGL;

                const hour = parseInt(String(meal.time || '00:00').split(':')[0], 10);
                if (!Number.isNaN(hour) && hour >= 18) {
                    eveningGL += mealGL;
                }
            }

            if (dailyGL > 0) {
                dailyGLValues.push(dailyGL);
                eveningRatios.push(eveningGL / dailyGL);
            }
        }

        if (dailyGLValues.length === 0) {
            return { pattern, available: false, reason: 'insufficient_gl_data' };
        }

        const avgDailyGL = average(dailyGLValues);
        const avgEveningRatio = average(eveningRatios);

        const eveningPenalty = avgEveningRatio > 0.5 ? 15 : 0;
        const glPenalty = Math.max(0, avgDailyGL - 80) * 0.5;
        const score = Math.max(0, Math.min(100, Math.round(100 - glPenalty - eveningPenalty)));

        let dailyClass = 'low';
        if (avgDailyGL > 120) dailyClass = 'high';
        else if (avgDailyGL >= 80) dailyClass = 'medium';

        let insight = '';
        if (dailyClass === 'low') {
            insight = `✅ Низкая GL нагрузка: ${Math.round(avgDailyGL)} (цель <80).`;
        } else if (dailyClass === 'medium') {
            insight = `🟡 Умеренная GL нагрузка: ${Math.round(avgDailyGL)}. Контролируй порции быстрых углеводов.`;
        } else {
            insight = `🔴 Высокая GL нагрузка: ${Math.round(avgDailyGL)} (>120). Риск сахарных качелей.`;
        }

        if (avgEveningRatio > 0.5) {
            insight += ` Вечерний GL ${(avgEveningRatio * 100).toFixed(0)}% (штраф -15).`;
        }

        const baseConfidence = days.length >= 10 ? 0.8 : 0.7;
        const confidence = piStats.applySmallSamplePenalty
            ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
            : baseConfidence;

        return {
            pattern,
            available: true,
            avgDailyGL: Math.round(avgDailyGL * 10) / 10,
            avgEveningRatio: Math.round(avgEveningRatio * 100) / 100,
            mealGLDistribution: {
                low: lowMealGLCount,
                medium: mediumMealGLCount,
                high: highMealGLCount
            },
            dailyClass,
            daysAnalyzed: validDays.length,
            avgMealsPerDay: Math.round(avgMealsPerDay * 10) / 10,
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    /**
     * C20: Electrolyte Homeostasis.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна электролитного баланса.
     */
    function analyzeElectrolyteHomeostasis(days, pIndex) {
        const pattern = PATTERNS.ELECTROLYTE_HOMEOSTASIS || 'electrolyte_homeostasis';
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

        let sodiumSum = 0;
        let potassiumSum = 0;
        let magnesiumSum = 0;
        let calciumSum = 0;
        let validDays = 0;
        let highDemandDays = 0;

        for (const day of days) {
            let dayNa = 0;
            let dayK = 0;
            let dayMg = 0;
            let dayCa = 0;

            for (const meal of (day.meals || [])) {
                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;
                    const grams = Number(item.grams) || 0;
                    if (grams <= 0) continue;
                    const factor = grams / 100;

                    dayNa += (Number(prod.sodium100) || Number(prod.sodium) || 0) * factor;
                    dayK += (Number(prod.potassium) || 0) * factor;
                    dayMg += (Number(prod.magnesium) || 0) * factor;
                    dayCa += (Number(prod.calcium) || 0) * factor;
                }
            }

            const trainings = Array.isArray(day.trainings) ? day.trainings : [];
            const sweatRateMax = trainings.reduce((max, t) => {
                const direct = Number(t?.sweatRateMlHour || t?.sweat_ml_h || t?.sweatLossMlPerHour || 0);
                if (direct > 0) return Math.max(max, direct);
                const volume = Number(t?.sweatLossMl || t?.sweat_ml || 0);
                const durationMin = Number(t?.durationMin || t?.duration || 0);
                if (volume > 0 && durationMin > 0) {
                    return Math.max(max, (volume / durationMin) * 60);
                }
                return max;
            }, 0);

            if (sweatRateMax > 800) highDemandDays++;

            if (dayNa + dayK + dayMg + dayCa > 0) {
                sodiumSum += dayNa;
                potassiumSum += dayK;
                magnesiumSum += dayMg;
                calciumSum += dayCa;
                validDays++;
            }
        }

        if (validDays === 0) {
            return { pattern, available: false, reason: 'insufficient_data' };
        }

        const avgNa = sodiumSum / validDays;
        const avgK = potassiumSum / validDays;
        const avgMg = magnesiumSum / validDays;
        const avgCa = calciumSum / validDays;
        const naKRatio = avgK > 0 ? avgNa / avgK : 0;

        const naKScore = naKRatio <= 1 ? 100 : (naKRatio <= 1.5 ? 85 : (naKRatio <= 2 ? 65 : (naKRatio <= 3 ? 40 : 20)));
        const mgScore = Math.min(100, (avgMg / 400) * 100);
        const caScore = Math.min(100, (avgCa / 1000) * 100);
        const kScore = Math.min(100, (avgK / 3500) * 100);

        const demandPenalty = highDemandDays >= 3 ? 12 : (highDemandDays > 0 ? 6 : 0);
        const adaptationBonus = (naKRatio <= 1 && mgScore >= 80) ? 5 : 0;
        const hyponatremiaFlag = highDemandDays > 0 && avgNa < 1500;
        const magnesiumLowFlag = avgMg < 300;

        const rawScore = naKScore * 0.5 + mgScore * 0.2 + caScore * 0.15 + kScore * 0.15;
        const score = Math.max(0, Math.min(100, Math.round(rawScore - demandPenalty + adaptationBonus)));

        let insight = '';
        if (score >= 80) insight = `✅ Электролитный профиль хороший (${score}/100).`;
        else if (score >= 60) insight = `🟡 Умеренный электролитный риск (${score}/100).`;
        else insight = `🔴 Выраженный электролитный дисбаланс (${score}/100).`;

        if (naKRatio > 1.5) insight += ` Na:K=${naKRatio.toFixed(2)} (цель <1.0).`;
        if (hyponatremiaFlag) insight += ' Признаки гипонатриемического паттерна при высокой нагрузке.';
        if (magnesiumLowFlag) insight += ' Магний ниже желательного уровня.';

        const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
        const confidence = piStats.applySmallSamplePenalty
            ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
            : baseConfidence;

        return {
            pattern,
            available: true,
            avgSodium: Math.round(avgNa),
            avgPotassium: Math.round(avgK),
            avgMagnesium: Math.round(avgMg),
            avgCalcium: Math.round(avgCa),
            naKRatio: Math.round(naKRatio * 100) / 100,
            highDemandDays,
            hyponatremiaFlag,
            magnesiumLowFlag,
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    /**
     * Insulin sensitivity proxy by GI/fiber/timing.
     * @param {Array} days - Массив дней.
     * @param {object} pIndex - Индекс продуктов.
     * @param {object} profile - Профиль пользователя.
     * @returns {object} Результат паттерна.
     */
    function analyzeInsulinSensitivity(days, pIndex, profile, thresholds = {}) {
        void profile;
        const pattern = PATTERNS.INSULIN_SENSITIVITY || 'insulin_sensitivity';
        const dailyData = [];
        const GI_OPTIMAL = thresholds.giOptimal || 55;
        const GI_MODERATE = (thresholds.giOptimal || 55) + 15;

        for (const day of (days || [])) {
            if (!day?.meals || day.meals.length === 0) continue;

            let totalCarbs = 0;
            let weightedGI = 0;
            let totalFiber = 0;
            let eveningCarbs = 0;
            let totalKcal = 0;

            for (const meal of day.meals) {
                if (!meal?.items) continue;
                const hour = meal.time ? parseInt(String(meal.time).split(':')[0], 10) : 12;

                for (const item of meal.items) {
                    const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id || '').toLowerCase());
                    if (!prod || !item.grams) continue;

                    const grams = Number(item.grams) || 0;
                    const carbs = ((Number(prod.simple100) || 0) + (Number(prod.complex100) || 0)) * grams / 100;
                    const gi = Number(prod.gi || prod.gi100 || prod.GI) || 50;
                    const fiber = (Number(prod.fiber100) || 0) * grams / 100;
                    const p = Number(prod.protein100) || 0;
                    const f = (Number(prod.badFat100) || 0) + (Number(prod.goodFat100) || 0);

                    totalCarbs += carbs;
                    weightedGI += carbs * gi;
                    totalFiber += fiber;
                    totalKcal += (p * 3 + carbs * 4 + f * 9) * grams / 100;

                    if (!Number.isNaN(hour) && hour >= 18) eveningCarbs += carbs;
                }
            }

            if (totalCarbs === 0 || totalKcal === 0) continue;

            const avgGI = weightedGI / totalCarbs;
            const fiberPer1000 = (totalFiber / totalKcal) * 1000;
            const eveningCarbsPct = (eveningCarbs / totalCarbs) * 100;
            const hasTraining = Array.isArray(day.trainings) && day.trainings.length > 0;
            const sleepOk = (Number(day.sleepHours) || 7) >= 7;

            let score = 0;
            if (avgGI <= GI_OPTIMAL) score += 20;
            else if (avgGI <= GI_MODERATE) score += 10;

            if (fiberPer1000 >= 14) score += 20;
            else if (fiberPer1000 >= 10) score += 10;

            if (eveningCarbsPct <= 30) score += 15;
            else if (eveningCarbsPct <= 40) score += 8;

            if (hasTraining) score += 15;
            if (sleepOk) score += 10;
            score += 20;

            dailyData.push({
                date: day.date,
                avgGI: Math.round(avgGI),
                fiberPer1000: Math.round(fiberPer1000 * 10) / 10,
                eveningCarbsPct: Math.round(eveningCarbsPct),
                hasTraining,
                sleepOk,
                score: Math.min(100, score)
            });
        }

        if (dailyData.length < 3) {
            return {
                pattern,
                available: false,
                insight: 'Недостаточно данных для оценки инсулиновой чувствительности'
            };
        }

        const avgScore = average(dailyData.map(d => d.score));
        const avgGI = average(dailyData.map(d => d.avgGI));
        const avgFiber = average(dailyData.map(d => d.fiberPer1000));

        let insight;
        if (avgScore >= 75) {
            insight = '🩺 Хорошие маркеры инсулиновой чувствительности!';
        } else if (avgGI > 65) {
            insight = `⚠️ Высокий средний GI (${Math.round(avgGI)}). Замени быстрые углеводы на медленные`;
        } else if (avgFiber < 10) {
            insight = `⚠️ Мало клетчатки (${Math.round(avgFiber)}г/1000ккал). Добавь овощи`;
        } else {
            insight = 'Инсулиновая чувствительность в норме';
        }

        return {
            pattern,
            available: true,
            score: Math.round(avgScore),
            avgGI: Math.round(avgGI),
            avgFiberPer1000: Math.round(avgFiber * 10) / 10,
            dataPoints: dailyData.length,
            confidence: dailyData.length >= 7 ? 0.8 : 0.5,
            insight,
            formula: SCIENCE_INFO?.INSULIN_SENSITIVITY?.formula || 'insulin sensitivity score',
            debug: {
                dailyData: dailyData.slice(0, 3),
                source: SCIENCE_INFO?.INSULIN_SENSITIVITY?.source || 'Ludwig, 2002'
            }
        };
    }

    /**
     * Gut health / microbiome proxy.
     * @param {Array} days - Массив дней.
     * @param {object} pIndex - Индекс продуктов.
     * @returns {object} Результат паттерна.
     */
    function analyzeGutHealth(days, pIndex) {
        const pattern = PATTERNS.GUT_HEALTH || 'gut_health';
        const dailyData = [];
        const fermentedKeywords = ['кефир', 'йогурт', 'квашен', 'кимчи', 'мисо', 'темпе', 'комбуча'];

        for (const day of (days || [])) {
            if (!day?.meals || day.meals.length === 0) continue;

            let totalFiber = 0;
            let totalKcal = 0;
            const uniqueProducts = new Set();
            const uniqueCategories = new Set();
            let hasFermented = false;

            for (const meal of day.meals) {
                if (!meal?.items) continue;

                for (const item of meal.items) {
                    const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id || '').toLowerCase());
                    if (!prod || !item.grams) continue;

                    const grams = Number(item.grams) || 0;
                    const p = Number(prod.protein100) || 0;
                    const c = (Number(prod.simple100) || 0) + (Number(prod.complex100) || 0);
                    const f = (Number(prod.badFat100) || 0) + (Number(prod.goodFat100) || 0);

                    totalFiber += (Number(prod.fiber100) || 0) * grams / 100;
                    totalKcal += (p * 3 + c * 4 + f * 9) * grams / 100;

                    uniqueProducts.add(prod.name || prod.id);

                    const category = prod.category || prod.group || prod.foodGroup || prod.type;
                    if (category) uniqueCategories.add(String(category).toLowerCase());

                    const prodName = String(prod.name || '').toLowerCase();
                    if (fermentedKeywords.some(kw => prodName.includes(kw))) {
                        hasFermented = true;
                    }
                }
            }

            if (totalKcal === 0) continue;

            const fiberTotal = totalFiber;
            const diversity = uniqueProducts.size;
            let score = 0;

            if (fiberTotal >= 30) score += 30;
            else if (fiberTotal >= 25) score += 25;
            else if (fiberTotal >= 20) score += 18;
            else if (fiberTotal >= 15) score += 10;

            const categoryDiversity = uniqueCategories.size;
            if (categoryDiversity >= 12) score += 15;
            else if (categoryDiversity >= 8) score += 10;
            else if (categoryDiversity >= 5) score += 5;

            if (diversity >= 20) score += 10;
            else if (diversity >= 15) score += 8;
            else if (diversity >= 10) score += 6;
            else if (diversity >= 5) score += 3;

            if (hasFermented) score += 15;
            score += 30;

            dailyData.push({
                date: day.date,
                fiberTotal: Math.round(fiberTotal),
                diversity,
                categoryDiversity,
                hasFermented,
                score: Math.min(100, score)
            });
        }

        if (dailyData.length < 3) {
            return {
                pattern,
                available: false,
                insight: 'Недостаточно данных для оценки здоровья кишечника'
            };
        }

        const avgScore = average(dailyData.map(d => d.score));
        const avgFiber = average(dailyData.map(d => d.fiberTotal));
        const avgDiversity = average(dailyData.map(d => d.diversity));
        const avgCategoryDiversity = average(dailyData.map(d => d.categoryDiversity));
        const fermentedDays = dailyData.filter(d => d.hasFermented).length;

        let insight;
        if (avgScore >= 75) {
            insight = '🦠 Отлично для микробиома! Много клетчатки и разнообразие';
        } else if (avgFiber < 20) {
            insight = `⚠️ Мало клетчатки (${Math.round(avgFiber)}г). Добавь овощи, бобовые, цельнозерновые`;
        } else if (avgCategoryDiversity < 8) {
            insight = `⚠️ Мало разнообразия категорий (${Math.round(avgCategoryDiversity)}). Добавь новые группы продуктов`;
        } else if (avgDiversity < 10) {
            insight = `⚠️ Мало разнообразия (${Math.round(avgDiversity)} продуктов/день). Пробуй новое!`;
        } else if (fermentedDays < dailyData.length * 0.3) {
            insight = 'Добавь ферментированные продукты: кефир, йогурт, квашеную капусту';
        } else {
            insight = 'Здоровье кишечника в норме';
        }

        return {
            pattern,
            available: true,
            score: Math.round(avgScore),
            avgFiber: Math.round(avgFiber),
            avgDiversity: Math.round(avgDiversity),
            avgCategoryDiversity: Math.round(avgCategoryDiversity),
            fermentedDaysPct: Math.round((fermentedDays / dailyData.length) * 100),
            dataPoints: dailyData.length,
            confidence: dailyData.length >= 7 ? 0.8 : 0.5,
            insight,
            formula: SCIENCE_INFO?.GUT_HEALTH?.formula || 'gut health score',
            debug: {
                dailyData: dailyData.slice(0, 3),
                fermentedKeywords,
                source: SCIENCE_INFO?.GUT_HEALTH?.source || 'Sonnenburg & Sonnenburg, 2014'
            }
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeHeartHealth = analyzeHeartHealth;
    HEYS.InsightsPI.patternModules.analyzeOmegaBalance = analyzeOmegaBalance;
    HEYS.InsightsPI.patternModules.analyzeGlycemicLoad = analyzeGlycemicLoad;
    HEYS.InsightsPI.patternModules.analyzeElectrolyteHomeostasis = analyzeElectrolyteHomeostasis;
    HEYS.InsightsPI.patternModules.analyzeInsulinSensitivity = analyzeInsulinSensitivity;
    HEYS.InsightsPI.patternModules.analyzeGutHealth = analyzeGutHealth;
})(typeof window !== 'undefined' ? window : global);
