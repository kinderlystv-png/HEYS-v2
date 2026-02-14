// insights/patterns/training_nutrition.js — Modular training nutrition analyzers (v6.1.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};

    const PATTERNS = piConst.PATTERNS || {
        PROTEIN_DISTRIBUTION: 'protein_distribution',
        ANTIOXIDANT_DEFENSE: 'antioxidant_defense',
        TRAINING_TYPE_MATCH: 'training_type_match'
    };

    const average = piStats.average || ((arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((sum, value) => sum + value, 0) / arr.length;
    });

    /**
     * C15: Protein Distribution (Leucine Threshold).
     * @param {Array} days - Массив дней для анализа.
     * @param {object} profile - Профиль пользователя.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна распределения белка.
     */
    function analyzeProteinDistribution(days, profile, pIndex, thresholds = {}) {
        const pattern = PATTERNS.PROTEIN_DISTRIBUTION || 'protein_distribution';
        const minDays = 7;
        const minMealsPerDay = 2;
        const PROTEIN_PER_MEAL = thresholds.proteinPerMealG || 30;
        const PROTEIN_MIN = PROTEIN_PER_MEAL - 10;
        const PROTEIN_MAX = PROTEIN_PER_MEAL + 10;
        const PROTEIN_SUBTHRESHOLD = 10;
        const PROTEIN_EXCESS = 50;

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

        const profileWeight = Number(profile?.weight) || 70;
        const targetProtein = profileWeight * 1.6;

        let optimalMeals = 0;
        let subthresholdMeals = 0;
        let belowOptimalMeals = 0;
        let excessMeals = 0;
        const dayTotals = [];
        const spreads = [];

        for (const day of validDays) {
            let dayProtein = 0;
            const mealProteins = [];

            for (const meal of day.meals) {
                let mealProtein = 0;

                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;
                    const grams = Number(item.grams) || 0;
                    if (grams <= 0) continue;
                    mealProtein += (Number(prod.protein100) || 0) * grams / 100;
                }

                mealProteins.push(mealProtein);
                dayProtein += mealProtein;

                if (mealProtein < PROTEIN_SUBTHRESHOLD) subthresholdMeals++;
                else if (mealProtein > PROTEIN_EXCESS) excessMeals++;
                else if (mealProtein < PROTEIN_MIN || mealProtein > PROTEIN_MAX) belowOptimalMeals++;
                else optimalMeals++;
            }

            dayTotals.push(dayProtein);
            if (mealProteins.length >= 2) {
                spreads.push(Math.max(...mealProteins) - Math.min(...mealProteins));
            }
        }

        const distributionScore = totalMeals > 0 ? (optimalMeals / totalMeals) * 100 : 0;
        const avgSpread = spreads.length > 0 ? average(spreads) : 0;
        const evenBonus = avgSpread > 0 && avgSpread < 20 ? 10 : 0;
        const avgTotalProtein = dayTotals.length > 0 ? average(dayTotals) : 0;
        const targetProteinPct = Math.min(100, (avgTotalProtein / targetProtein) * 100);

        const score = Math.max(
            0,
            Math.min(
                100,
                Math.round(distributionScore * 0.7 + targetProteinPct * 0.3 + evenBonus)
            )
        );

        let insight = `Оптимальных белковых приёмов: ${optimalMeals}/${totalMeals}.`;
        if (distributionScore >= 60) {
            insight = `✅ Хорошее распределение белка: ${Math.round(distributionScore)}% приёмов в зоне 20-40г.`;
        } else if (distributionScore >= 35) {
            insight = `🟡 Частично оптимально: ${Math.round(distributionScore)}% приёмов попадают в 20-40г.`;
        } else {
            insight = `🔴 Слабое распределение белка: только ${Math.round(distributionScore)}% приёмов в целевой зоне.`;
        }

        if (evenBonus > 0) insight += ' Равномерное распределение по приёмам (+10).';
        if (targetProteinPct < 80) insight += ` Суточный белок ${Math.round(targetProteinPct)}% от цели (${Math.round(targetProtein)}г).`;

        const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
        const confidence = piStats.applySmallSamplePenalty
            ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
            : baseConfidence;

        return {
            pattern,
            available: true,
            optimalMeals,
            subthresholdMeals,
            belowOptimalMeals,
            excessMeals,
            totalMeals,
            distributionScore: Math.round(distributionScore),
            avgDailyProtein: Math.round(avgTotalProtein * 10) / 10,
            targetProtein: Math.round(targetProtein),
            targetProteinPct: Math.round(targetProteinPct),
            avgProteinSpread: Math.round(avgSpread * 10) / 10,
            evenBonus,
            daysAnalyzed: validDays.length,
            avgMealsPerDay: Math.round(avgMealsPerDay * 10) / 10,
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    /**
     * C16: Antioxidant Defense Score.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна антиоксидантной защиты.
     */
    function analyzeAntioxidantDefense(days, pIndex) {
        const pattern = PATTERNS.ANTIOXIDANT_DEFENSE || 'antioxidant_defense';
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

        const dailyIndices = [];
        let highDemandDays = 0;
        let moderateDemandDays = 0;

        for (const day of days) {
            let vitA = 0;
            let vitC = 0;
            let vitE = 0;
            let selenium = 0;
            let zinc = 0;
            let nova4Carbs = 0;

            for (const meal of (day.meals || [])) {
                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;

                    const grams = Number(item.grams) || 0;
                    if (grams <= 0) continue;
                    const factor = grams / 100;

                    vitA += (Number(prod.vitamin_a) || 0) * factor;
                    vitC += (Number(prod.vitamin_c) || 0) * factor;
                    vitE += (Number(prod.vitamin_e) || 0) * factor;
                    selenium += (Number(prod.selenium) || 0) * factor;
                    zinc += (Number(prod.zinc) || 0) * factor;

                    if (Number(prod.nova_group) === 4) {
                        nova4Carbs += ((Number(prod.simple100) || 0) + (Number(prod.complex100) || 0)) * factor;
                    }
                }
            }

            const aScore = Math.min(1, vitA / 900) * 20;
            const cScore = Math.min(1, vitC / 90) * 30;
            const eScore = Math.min(1, vitE / 15) * 20;
            const seScore = Math.min(1, selenium / 55) * 15;
            const znScore = Math.min(1, zinc / 11) * 15;
            const antioxidantIndex = aScore + cScore + eScore + seScore + znScore;

            const trainings = Array.isArray(day.trainings) ? day.trainings : [];
            const highIntensityMinutes = trainings.reduce((sum, t) => {
                const z = t?.z || [];
                const z4 = Number(z[3]) || 0;
                const z5 = Number(z[4]) || 0;
                return sum + z4 + z5;
            }, 0);

            let demand = 'low';
            if (highIntensityMinutes > 20) {
                demand = 'high';
                highDemandDays++;
            } else if (trainings.length > 0) {
                demand = 'moderate';
                moderateDemandDays++;
            }

            const demandMultiplier = demand === 'high' ? 1.3 : (demand === 'moderate' ? 1.15 : 1.0);

            dailyIndices.push({
                antioxidantIndex,
                demand,
                demandMultiplier,
                vitCPct: (vitC / (90 * demandMultiplier)) * 100,
                vitEPct: (vitE / (15 * demandMultiplier)) * 100,
                nova4High: nova4Carbs > 30
            });
        }

        if (dailyIndices.length === 0) {
            return { pattern, available: false, reason: 'insufficient_data' };
        }

        const avgAntioxidantIndex = average(dailyIndices.map(d => d.antioxidantIndex));
        const dominantDemand = highDemandDays > 0 ? 'high' : (moderateDemandDays > 0 ? 'moderate' : 'low');
        const adjustedScore = Math.round(
            avgAntioxidantIndex * (dominantDemand === 'high' ? 0.85 : 1.0)
        );

        const defenseGapDays = dailyIndices.filter(d => d.antioxidantIndex < 60).length;
        const vitCRiskDays = dailyIndices.filter(d => d.demand === 'high' && d.vitCPct < 50).length;
        const doubleStressDays = dailyIndices.filter(d => d.vitEPct < 50 && d.nova4High).length;

        let insight = '';
        if (adjustedScore >= 80) {
            insight = `✅ Хорошая антиоксидантная защита (${adjustedScore}/100).`;
        } else if (adjustedScore >= 60) {
            insight = `🟡 Умеренная антиоксидантная защита (${adjustedScore}/100).`;
        } else {
            insight = `🔴 Низкая антиоксидантная защита (${adjustedScore}/100), требуется коррекция рациона.`;
        }

        if (defenseGapDays > 0) insight += ` Defense gap: ${defenseGapDays} дн.`;
        if (vitCRiskDays > 0) insight += ` VitC risk при high-load: ${vitCRiskDays} дн.`;
        if (doubleStressDays > 0) insight += ` Double oxidative stress: ${doubleStressDays} дн.`;

        const baseConfidence = days.length >= 14 ? 0.8 : 0.7;
        const confidence = piStats.applySmallSamplePenalty
            ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
            : baseConfidence;

        return {
            pattern,
            available: true,
            antioxidantIndex: Math.round(avgAntioxidantIndex),
            dominantDemand,
            highDemandDays,
            moderateDemandDays,
            defenseGapDays,
            vitCRiskDays,
            doubleStressDays,
            score: Math.max(0, Math.min(100, adjustedScore)),
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    /**
     * C19: Training-Type Nutrition Match.
     * @param {Array} days - Массив дней для анализа.
     * @param {object} profile - Профиль пользователя.
     * @param {object} pIndex - Индекс продуктов по id.
     * @returns {object} Результат паттерна соответствия питания нагрузке.
     */
    function analyzeTrainingTypeMatch(days, profile, pIndex) {
        const pattern = PATTERNS.TRAINING_TYPE_MATCH || 'training_type_match';
        const minDays = 5;
        const minTrainings = 3;

        if (!Array.isArray(days) || days.length < minDays) {
            return {
                pattern,
                available: false,
                reason: 'min_days_required',
                minDaysRequired: minDays,
                daysProvided: Array.isArray(days) ? days.length : 0
            };
        }

        let trainingCount = 0;
        let cardioCount = 0;
        let strengthCount = 0;
        let hobbyCount = 0;

        let totalProt = 0;
        let totalCarbs = 0;
        let totalMg = 0;
        let totalVitC = 0;

        for (const day of days) {
            const trainings = Array.isArray(day?.trainings) ? day.trainings : [];
            trainingCount += trainings.length;

            trainings.forEach(t => {
                const type = t?.type;
                if (type === 'strength') strengthCount++;
                else if (type === 'cardio') cardioCount++;
                else if (type === 'hobby') hobbyCount++;
            });

            totalProt += Number(day?.tot?.prot || day?.tot?.protein || 0);
            totalCarbs += Number(day?.tot?.carbs || 0);

            for (const meal of (day.meals || [])) {
                for (const item of (meal.items || [])) {
                    const prod = pIndex?.byId?.get?.(item?.product_id);
                    if (!prod) continue;
                    const grams = Number(item.grams) || 0;
                    if (grams <= 0) continue;
                    const factor = grams / 100;
                    totalMg += (Number(prod.magnesium) || 0) * factor;
                    totalVitC += (Number(prod.vitamin_c) || 0) * factor;
                }
            }
        }

        if (trainingCount < minTrainings) {
            return {
                pattern,
                available: false,
                reason: 'min_trainings_required',
                minTrainingsRequired: minTrainings,
                trainingsProvided: trainingCount
            };
        }

        let dominantType = 'mixed';
        if (strengthCount >= cardioCount && strengthCount >= hobbyCount) dominantType = 'strength';
        else if (cardioCount >= strengthCount && cardioCount >= hobbyCount) dominantType = 'cardio';
        else if (hobbyCount > 0) dominantType = 'hobby';

        const weight = Number(profile?.weight) || 70;
        const avgProtPerKg = (totalProt / days.length) / weight;
        const avgCarbsPerKg = (totalCarbs / days.length) / weight;
        const avgMg = totalMg / days.length;
        const avgVitC = totalVitC / days.length;

        let protTargetMin = 1.0;
        let protTargetMax = 1.2;
        let carbsTargetMin = 3;
        let carbsTargetMax = 5;

        if (dominantType === 'cardio') {
            protTargetMin = 1.2;
            protTargetMax = 1.4;
            carbsTargetMin = 5;
            carbsTargetMax = 7;
        } else if (dominantType === 'strength') {
            protTargetMin = 1.6;
            protTargetMax = 2.2;
            carbsTargetMin = 3;
            carbsTargetMax = 5;
        }

        const protDeviation = avgProtPerKg < protTargetMin
            ? (protTargetMin - avgProtPerKg) / protTargetMin
            : (avgProtPerKg > protTargetMax ? (avgProtPerKg - protTargetMax) / protTargetMax : 0);

        const carbsDeviation = avgCarbsPerKg < carbsTargetMin
            ? (carbsTargetMin - avgCarbsPerKg) / carbsTargetMin
            : (avgCarbsPerKg > carbsTargetMax ? (avgCarbsPerKg - carbsTargetMax) / carbsTargetMax : 0);

        const macroMatchScore = Math.max(0, 100 - Math.round((protDeviation * 50 + carbsDeviation * 50) * 100));
        const postWorkoutScore = dominantType === 'strength'
            ? (avgProtPerKg >= 1.6 ? 90 : 60)
            : (dominantType === 'cardio' ? (avgCarbsPerKg >= 5 ? 90 : 60) : 75);
        const recoveryNutrientScore = Math.min(100, Math.round((Math.min(1, avgMg / 400) * 50) + (Math.min(1, avgVitC / 90) * 50)));

        const score = Math.max(
            0,
            Math.min(100, Math.round(macroMatchScore * 0.5 + postWorkoutScore * 0.3 + recoveryNutrientScore * 0.2))
        );

        let insight = `Тип нагрузки: ${dominantType}. Macro match: ${macroMatchScore}%.`;
        if (score >= 80) insight = `✅ Отличный match питания под ${dominantType} (${score}/100).`;
        else if (score >= 60) insight = `🟡 Частичный match под ${dominantType} (${score}/100).`;
        else insight = `🔴 Выраженный mismatch питания и нагрузки (${score}/100).`;

        if (dominantType === 'strength' && avgProtPerKg < 1.6) insight += ' Белок ниже целевого для силовых.';
        if (dominantType === 'cardio' && avgCarbsPerKg < 5) insight += ' Углеводы ниже целевого для cardio.';

        const baseConfidence = days.length >= 10 ? 0.8 : 0.7;
        const confidence = piStats.applySmallSamplePenalty
            ? piStats.applySmallSamplePenalty(baseConfidence, days.length, minDays)
            : baseConfidence;

        return {
            pattern,
            available: true,
            dominantType,
            trainingCount,
            macroMatchScore,
            postWorkoutScore,
            recoveryNutrientScore,
            avgProtPerKg: Math.round(avgProtPerKg * 100) / 100,
            avgCarbsPerKg: Math.round(avgCarbsPerKg * 100) / 100,
            avgMagnesium: Math.round(avgMg),
            avgVitC: Math.round(avgVitC),
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeProteinDistribution = analyzeProteinDistribution;
    HEYS.InsightsPI.patternModules.analyzeAntioxidantDefense = analyzeAntioxidantDefense;
    HEYS.InsightsPI.patternModules.analyzeTrainingTypeMatch = analyzeTrainingTypeMatch;
})(typeof window !== 'undefined' ? window : global);
