// insights/patterns/activity.js — Modular activity analyzers (v6.8.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};
    const piCalculations = HEYS.InsightsPI?.calculations || global.piCalculations || {};

    const CONFIG = piConst.CONFIG || {
        MIN_DAYS_FOR_FULL_ANALYSIS: 7,
        MIN_CORRELATION_DISPLAY: 0.35
    };

    const PATTERNS = piConst.PATTERNS || {
        TRAINING_KCAL: 'training_kcal',
        STEPS_WEIGHT: 'steps_weight',
        NEAT_ACTIVITY: 'neat_activity',
        TRAINING_RECOVERY: 'training_recovery'
    };

    const average = piStats.average || function (arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((sum, value) => sum + (Number(value) || 0), 0) / arr.length;
    };

    const pearsonCorrelation = piStats.pearsonCorrelation || function (x, y) {
        if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 2) return 0;
        const n = x.length;
        const xMean = average(x);
        const yMean = average(y);
        let numerator = 0;
        let xDen = 0;
        let yDen = 0;
        for (let i = 0; i < n; i++) {
            const dx = (Number(x[i]) || 0) - xMean;
            const dy = (Number(y[i]) || 0) - yMean;
            numerator += dx * dy;
            xDen += dx * dx;
            yDen += dy * dy;
        }
        const denominator = Math.sqrt(xDen * yDen);
        return denominator === 0 ? 0 : numerator / denominator;
    };

    const calculateTrend = piStats.calculateTrend || function (values) {
        if (!Array.isArray(values) || values.length < 2) return 0;
        const n = values.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
            const y = Number(values[i]) || 0;
            sumX += i;
            sumY += y;
            sumXY += i * y;
            sumX2 += i * i;
        }
        const denominator = (n * sumX2 - sumX * sumX);
        if (!denominator) return 0;
        return (n * sumXY - sumX * sumY) / denominator;
    };

    const calculateItemKcal = piCalculations.calculateItemKcal || function (item, pIndex) {
        if (!item || !item.grams) return 0;
        const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
        if (!prod) return 0;
        const p = prod.protein100 || 0;
        const c = (prod.simple100 || 0) + (prod.complex100 || 0);
        const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
        return (p * 3 + c * 4 + f * 9) * item.grams / 100;
    };

    const calculateDayKcal = piCalculations.calculateDayKcal || function (day, pIndex) {
        const savedKcal = Number(day?.savedEatenKcal);
        if (Number.isFinite(savedKcal) && savedKcal > 0) return savedKcal;
        if (!day?.meals?.length) return 0;
        let total = 0;
        for (const meal of day.meals) {
            for (const item of (meal.items || [])) {
                total += calculateItemKcal(item, pIndex);
            }
        }
        return total;
    };

    /**
     * Корреляция тренировок и калорий.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeTrainingKcal(days, pIndex) {
        const trainingDays = [];
        const restDays = [];

        for (const day of days) {
            const dayKcal = calculateDayKcal(day, pIndex);
            if (dayKcal === 0) continue;

            const hasTraining = day.trainings && day.trainings.length > 0;
            if (hasTraining) {
                trainingDays.push(dayKcal);
            } else {
                restDays.push(dayKcal);
            }
        }

        if (trainingDays.length < 3 || restDays.length < 3) {
            return {
                pattern: PATTERNS.TRAINING_KCAL,
                available: false,
                reason: 'no_training',
                confidence: 0.2,
                insight: 'Недостаточно данных о тренировках'
            };
        }

        const avgTraining = average(trainingDays);
        const avgRest = average(restDays);
        const diff = avgTraining - avgRest;
        const diffPct = (diff / avgRest) * 100;

        const score = diffPct > 15 ? 60 : diffPct > 5 ? 80 : 100;

        let insight;
        if (diff > 200) {
            insight = `🏋️ В дни тренировок ешь на ${Math.round(diff)} ккал больше — это нормально!`;
        } else if (diff < -200) {
            insight = '⚠️ В дни тренировок ешь меньше — добавь белок для восстановления';
        } else {
            insight = 'Калории стабильны независимо от тренировок';
        }

        return {
            pattern: PATTERNS.TRAINING_KCAL,
            available: true,
            avgTrainingKcal: Math.round(avgTraining),
            avgRestKcal: Math.round(avgRest),
            diffKcal: Math.round(diff),
            diffPct: Math.round(diffPct),
            trainingDaysCount: trainingDays.length,
            restDaysCount: restDays.length,
            score,
            confidence: Math.min(trainingDays.length, restDays.length) >= 5 ? 0.8 : 0.5,
            insight
        };
    }

    /**
     * Корреляция шагов и веса.
     * @param {Array} days
     * @returns {object}
     */
    function analyzeStepsWeight(days) {
        const pairs = [];
        const directDataDays = [];
        const robustPairsRequired = days.length >= 14 ? 7 : 4;

        for (const day of days) {
            if (day?.steps > 0 && day?.weightMorning) {
                directDataDays.push(day);
            }
        }

        for (let i = 1; i < days.length; i++) {
            const prevDay = days[i];
            const currDay = days[i - 1];

            if (prevDay.steps > 0 && currDay.weightMorning && prevDay.weightMorning) {
                const weightDelta = currDay.weightMorning - prevDay.weightMorning;
                pairs.push({
                    steps: prevDay.steps,
                    weightDelta,
                    date: prevDay.date
                });
            }
        }

        if (pairs.length === 0 && directDataDays.length === 0) {
            return {
                pattern: PATTERNS.STEPS_WEIGHT,
                available: false,
                reason: 'no_steps_data',
                confidence: 0.2,
                insight: 'Недостаточно данных шагов и веса'
            };
        }

        if (pairs.length === 0 && directDataDays.length > 0) {
            const avgStepsDirect = average(directDataDays.map(d => Number(d.steps) || 0));
            const score = avgStepsDirect >= 8000 ? 70 : avgStepsDirect >= 5000 ? 60 : 50;

            return {
                pattern: PATTERNS.STEPS_WEIGHT,
                available: true,
                dataPoints: directDataDays.length,
                score,
                confidence: 0.25,
                isPreliminary: true,
                requiredDataPoints: 2,
                insight: `👣 Есть ${directDataDays.length} дн. с шагами и весом. Добавь ещё 1 последовательный день для связи с динамикой веса`
            };
        }

        const stepsArr = pairs.map(p => p.steps);
        const deltaArr = pairs.map(p => p.weightDelta);
        const correlation = pairs.length >= 2 ? pearsonCorrelation(stepsArr, deltaArr) : 0;

        const score = Math.round(50 + correlation * -50);
        const avgSteps = average(stepsArr);

        let insight;
        if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
            insight = 'Связь шагов и веса пока не выявлена';
        } else if (correlation < -0.3) {
            insight = `👟 Больше шагов → вес стабильнее! При ${Math.round(avgSteps)} шагов/день`;
        } else if (correlation > 0.3) {
            insight = 'Интересно: больше ходишь, но вес растёт. Проверь калории';
        } else {
            insight = 'Умеренное влияние шагов на вес';
        }

        const isPreliminary = pairs.length < robustPairsRequired;

        return {
            pattern: PATTERNS.STEPS_WEIGHT,
            available: true,
            correlation: Math.round(correlation * 100) / 100,
            avgSteps: Math.round(avgSteps),
            dataPoints: pairs.length,
            score,
            confidence: pairs.length >= 10 ? 0.8 : (isPreliminary ? 0.35 : 0.5),
            isPreliminary,
            requiredDataPoints: robustPairsRequired,
            insight: isPreliminary
                ? `${insight}. Предварительно: ${pairs.length}/${robustPairsRequired} пар, точность растёт с данными`
                : insight
        };
    }

    /**
     * C4: NEAT Trend — бытовая активность и тренд.
     * @param {Array} days
     * @returns {object}
     */
    function analyzeNEATTrend(days) {
        const neatData = [];

        for (const day of days) {
            const householdMin = Number(day.householdMin) || 0;
            const activities = Array.isArray(day.householdActivities) ? day.householdActivities : [];
            const activitiesMin = activities.reduce((sum, a) => sum + (Number(a.minutes) || 0), 0);
            const totalMin = householdMin > 0 ? householdMin : activitiesMin;

            if (totalMin > 0) {
                neatData.push({ date: day.date, minutes: totalMin });
            }
        }

        if (neatData.length < 3) {
            return {
                pattern: PATTERNS.NEAT_ACTIVITY,
                available: false,
                reason: 'no_household_data',
                insight: 'Недостаточно данных о бытовой активности'
            };
        }

        neatData.sort((a, b) => a.date.localeCompare(b.date));
        const minutesArr = neatData.map(d => d.minutes);
        const avgMinutes = average(minutesArr);
        const trend = calculateTrend(minutesArr);

        let score = avgMinutes >= 60 ? 100 : avgMinutes >= 40 ? 80 : avgMinutes >= 20 ? 60 : 40;
        if (trend > 1) score += 5;
        if (trend < -1) score -= 5;
        score = Math.max(0, Math.min(100, Math.round(score)));

        let insight;
        if (avgMinutes >= 60) {
            insight = '🏡 Отличный NEAT: бытовая активность даёт ощутимый расход';
        } else if (avgMinutes < 20) {
            insight = '⚠️ Мало бытовой активности. Добавь 20-30 минут движения';
        } else if (trend > 1) {
            insight = '📈 NEAT растёт — хорошая динамика';
        } else if (trend < -1) {
            insight = '📉 NEAT снижается — попробуй чаще вставать и двигаться';
        } else {
            insight = 'NEAT стабилен, можно чуть усилить';
        }

        return {
            pattern: PATTERNS.NEAT_ACTIVITY,
            available: true,
            score,
            avgMinutes: Math.round(avgMinutes),
            trend: Math.round(trend * 100) / 100,
            dataPoints: neatData.length,
            confidence: neatData.length >= 7 ? 0.8 : 0.5,
            insight
        };
    }

    /**
     * C11: Training Intensity & Recovery.
     * @param {Array} days
     * @returns {object}
     */
    function analyzeTrainingRecovery(days) {
        if (!days || days.length < 5) {
            return { pattern: PATTERNS.TRAINING_RECOVERY, available: false };
        }

        const daysWithZones = days.filter(d => d.trainings?.some(t => t.z?.length >= 4));
        if (daysWithZones.length < 3) {
            return { pattern: PATTERNS.TRAINING_RECOVERY, available: false };
        }

        let highIntensityDays = 0;
        let consecutiveHighIntensity = 0;
        let maxConsecutive = 0;
        const recoveryScores = [];

        for (let i = 0; i < days.length; i++) {
            const day = days[i];
            const trainings = day.trainings || [];

            let totalMin = 0;
            let highMin = 0;
            for (const training of trainings) {
                if (!training.z || training.z.length < 4) continue;
                const [z1, z2, z3, z4] = training.z;
                totalMin += (z1 + z2 + z3 + z4);
                highMin += z4;
            }

            const highIntensityPct = totalMin > 0 ? (highMin / totalMin) * 100 : 0;
            const isHighIntensity = highIntensityPct >= 40;

            if (isHighIntensity) {
                highIntensityDays++;
                consecutiveHighIntensity++;
                maxConsecutive = Math.max(maxConsecutive, consecutiveHighIntensity);
            } else {
                consecutiveHighIntensity = 0;
            }

            if (i < days.length - 1) {
                const nextDay = days[i + 1];
                const sleepHours = nextDay.sleepHours || 0;
                const mood = nextDay.moodAvg || 3;
                const recoveryScore = (sleepHours >= 7 ? 50 : sleepHours * 7) + (mood * 10);
                recoveryScores.push(recoveryScore);
            }
        }

        const avgRecovery = recoveryScores.length > 0 ? average(recoveryScores) : 0;
        const overtrainingRisk = maxConsecutive >= 3 && avgRecovery < 60;

        let score = 100;
        if (overtrainingRisk) {
            score = 40;
        } else if (maxConsecutive >= 3) {
            score = 60;
        } else if (avgRecovery < 60) {
            score = 70;
        } else {
            score = 85;
        }

        let insight = '';
        if (overtrainingRisk) {
            insight = `⚠️ Риск перетренированности! ${maxConsecutive} дней подряд высокой интенсивности + плохое восстановление`;
        } else if (maxConsecutive >= 3) {
            insight = `🟡 ${maxConsecutive} дней подряд тяжёлых тренировок. Добавь день отдыха`;
        } else if (avgRecovery < 60) {
            insight = `🟠 Восстановление слабое (${Math.round(avgRecovery)}/100). Больше сна!`;
        } else {
            insight = `✅ Баланс нагрузки и восстановления оптимален (${Math.round(avgRecovery)}/100)`;
        }

        const confidence = daysWithZones.length >= 5 ? 0.80 : 0.65;

        return {
            pattern: PATTERNS.TRAINING_RECOVERY,
            available: true,
            highIntensityDays,
            maxConsecutive,
            avgRecovery: Math.round(avgRecovery),
            overtrainingRisk,
            dataPoints: daysWithZones.length,
            score,
            confidence,
            insight
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeTrainingKcal = analyzeTrainingKcal;
    HEYS.InsightsPI.patternModules.analyzeStepsWeight = analyzeStepsWeight;
    HEYS.InsightsPI.patternModules.analyzeNEATTrend = analyzeNEATTrend;
    HEYS.InsightsPI.patternModules.analyzeTrainingRecovery = analyzeTrainingRecovery;
})(typeof window !== 'undefined' ? window : global);
