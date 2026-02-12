// insights/patterns/lifestyle.js — Modular lifestyle analyzers (v6.9.0)
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
        WELLBEING_CORRELATION: 'wellbeing_correlation',
        HYDRATION: 'hydration',
        BODY_COMPOSITION: 'body_composition',
        CYCLE_IMPACT: 'cycle_impact',
        WEEKEND_EFFECT: 'weekend_effect'
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
        const prod = pIndex?.byId?.get?.(item?.product_id);
        if (!prod) return 0;
        return (prod.kcal100 || 0) * (item.grams || 0) / 100;
    };

    const calculateDayKcal = piCalculations.calculateDayKcal || function (day, pIndex) {
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
     * Вычислить часы сна из времён.
     * @param {string} start
     * @param {string} end
     * @returns {number|null}
     */
    function calculateSleepHours(start, end) {
        if (!start || !end) return null;

        const [startH, startM] = String(start).split(':').map(Number);
        const [endH, endM] = String(end).split(':').map(Number);

        let startMin = (startH || 0) * 60 + (startM || 0);
        let endMin = (endH || 0) * 60 + (endM || 0);

        if (startMin > endMin) {
            endMin += 24 * 60;
        }

        return (endMin - startMin) / 60;
    }

    /**
     * B2: Wellbeing Correlation — что влияет на самочувствие.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeWellbeing(days, pIndex) {
        const correlations = {
            sleepQuality: { pairs: [] },
            sleepHours: { pairs: [] },
            steps: { pairs: [] },
            protein: { pairs: [] },
            kcal: { pairs: [] }
        };

        for (const day of days) {
            const wellbeing = day.wellbeingAvg;
            if (!wellbeing) continue;

            if (day.sleepQuality) {
                correlations.sleepQuality.pairs.push({ wellbeing, value: day.sleepQuality });
            }

            const sleepHours = day.sleepHours || (day.sleepStart && day.sleepEnd
                ? calculateSleepHours(day.sleepStart, day.sleepEnd)
                : null);
            if (sleepHours) {
                correlations.sleepHours.pairs.push({ wellbeing, value: sleepHours });
            }

            if (day.steps) {
                correlations.steps.pairs.push({ wellbeing, value: day.steps });
            }

            if (day.meals && day.meals.length > 0) {
                let dayProtein = 0;
                const dayKcal = calculateDayKcal(day, pIndex);

                for (const meal of day.meals) {
                    if (!meal.items) continue;
                    for (const item of meal.items) {
                        const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
                        if (prod && item.grams) {
                            dayProtein += (prod.protein100 || 0) * item.grams / 100;
                        }
                    }
                }

                if (dayProtein > 0) {
                    correlations.protein.pairs.push({ wellbeing, value: dayProtein });
                }
                if (dayKcal > 0) {
                    correlations.kcal.pairs.push({ wellbeing, value: dayKcal });
                }
            }
        }

        const results = {};
        let maxAbsCorr = 0;
        let keyFactor = null;

        for (const [factor, data] of Object.entries(correlations)) {
            if (data.pairs.length < 7) continue;

            const wellbeingArr = data.pairs.map(p => p.wellbeing);
            const valueArr = data.pairs.map(p => p.value);
            const corr = pearsonCorrelation(wellbeingArr, valueArr);

            results[factor] = {
                correlation: corr,
                dataPoints: data.pairs.length,
                avgWellbeing: average(wellbeingArr),
                avgValue: average(valueArr)
            };

            if (Math.abs(corr) > maxAbsCorr && Math.abs(corr) >= CONFIG.MIN_CORRELATION_DISPLAY) {
                maxAbsCorr = Math.abs(corr);
                keyFactor = factor;
            }
        }

        if (Object.keys(results).length === 0) {
            return {
                pattern: PATTERNS.WELLBEING_CORRELATION,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных о самочувствии'
            };
        }

        if (!keyFactor) {
            return {
                pattern: PATTERNS.WELLBEING_CORRELATION,
                available: true,
                correlations: results,
                dataPoints: Object.values(results)[0]?.dataPoints || 0,
                score: 50,
                confidence: 0.3,
                insight: 'Ключевые факторы самочувствия пока не выявлены'
            };
        }

        const keyData = results[keyFactor];
        const baseConfidence = keyData.dataPoints < 14 ? 0.25 : 0.5;
        const confidence = baseConfidence * (1 + maxAbsCorr);

        const score = maxAbsCorr >= 0.5 ? 90 : maxAbsCorr >= 0.4 ? 75 : 60;

        const factorNames = {
            sleepQuality: 'качество сна',
            sleepHours: 'длительность сна',
            steps: 'шаги',
            protein: 'белок',
            kcal: 'калории'
        };

        const insight = keyData.correlation > 0.4
            ? `😊 ${factorNames[keyFactor]} ↑ → самочувствие ↑ (r=${keyData.correlation.toFixed(2)})`
            : `🔍 ${factorNames[keyFactor]} влияет на самочувствие (r=${keyData.correlation.toFixed(2)})`;

        return {
            pattern: PATTERNS.WELLBEING_CORRELATION,
            available: true,
            keyFactor,
            correlations: results,
            dataPoints: keyData.dataPoints,
            score,
            confidence,
            insight
        };
    }

    /**
     * B3: Hydration — достаточность гидратации (30ml/kg ВОЗ).
     * @param {Array} days
     * @returns {object}
     */
    function analyzeHydration(days) {
        const hydrationData = [];
        const exponentialMovingAverage = piStats.exponentialMovingAverage || function (arr) { return arr; };

        for (const day of days) {
            const weight = day.weightMorning || day.weightEvening;
            const waterMl = day.waterMl;

            if (weight && waterMl != null) {
                const goal = weight * 30;
                const achievement = (waterMl / goal) * 100;
                hydrationData.push({
                    date: day.date,
                    waterMl,
                    goal,
                    achievement: Math.round(achievement)
                });
            }
        }

        if (hydrationData.length < 3) {
            return {
                pattern: PATTERNS.HYDRATION,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных о гидратации'
            };
        }

        const avgAchievement = average(hydrationData.map(d => d.achievement));
        const avgWater = average(hydrationData.map(d => d.waterMl));
        const avgGoal = average(hydrationData.map(d => d.goal));

        let trend = 'stable';
        if (hydrationData.length >= 7) {
            const waterValues = hydrationData.map(d => d.waterMl);
            const emaValues = exponentialMovingAverage(waterValues, 7);
            if (emaValues.length >= 2) {
                const firstEma = emaValues[0];
                const lastEma = emaValues[emaValues.length - 1];
                const slope = lastEma - firstEma;
                if (slope > avgGoal * 0.05) trend = 'up';
                else if (slope < -avgGoal * 0.05) trend = 'down';
            }
        }

        let score;
        let insight;
        if (avgAchievement >= 90) {
            score = 100;
            insight = `💧 Отлично! ${Math.round(avgWater)}мл (${Math.round(avgAchievement)}% нормы)`;
        } else if (avgAchievement >= 70) {
            score = 75;
            insight = `✅ Норма. ${Math.round(avgWater)}мл (${Math.round(avgAchievement)}%). Можно чуть больше`;
        } else {
            score = 50;
            insight = `⚠️ Маловато. ${Math.round(avgWater)}мл (${Math.round(avgAchievement)}%). Цель: ${Math.round(avgGoal)}мл`;
        }

        const confidence = hydrationData.length >= 7 ? 0.8 : 0.5;

        return {
            pattern: PATTERNS.HYDRATION,
            available: true,
            avgWater: Math.round(avgWater),
            avgGoal: Math.round(avgGoal),
            achievement: Math.round(avgAchievement),
            trend,
            dataPoints: hydrationData.length,
            score,
            confidence,
            insight
        };
    }

    /**
     * B4: Body Composition — WHR (waist-hip ratio) с трендом.
     * @param {Array} days
     * @param {object} profile
     * @returns {object}
     */
    function analyzeBodyComposition(days, profile) {
        const measurements = [];

        for (const day of days) {
            if (day.measurements && day.measurements.waist && day.measurements.hip) {
                const whr = day.measurements.waist / day.measurements.hip;
                measurements.push({
                    date: day.date,
                    waist: day.measurements.waist,
                    hip: day.measurements.hip,
                    whr: Math.round(whr * 100) / 100
                });
            }
        }

        if (measurements.length < 10) {
            return {
                pattern: PATTERNS.BODY_COMPOSITION,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно замеров обхватов (нужно 10+)'
            };
        }

        const avgWHR = average(measurements.map(m => m.whr));
        const whrArr = measurements.map(m => m.whr);
        const trend = calculateTrend(whrArr);

        const gender = profile?.gender || 'female';
        const threshold = gender === 'male' ? 0.9 : 0.85;

        let score;
        let insight;
        if (avgWHR < threshold) {
            score = 90;
            const trendText = trend < -0.001 ? ' 📉 Улучшается!' : trend > 0.001 ? ' ⚠️ Растёт' : ' Стабильно';
            insight = `✅ WHR ${avgWHR.toFixed(2)} < ${threshold} (норма).${trendText}`;
        } else {
            score = 60;
            const trendText = trend < -0.001 ? ' 📉 Снижается — продолжай!' : trend > 0.001 ? ' ⚠️ Растёт' : '';
            insight = `⚠️ WHR ${avgWHR.toFixed(2)} > ${threshold}. Висцеральный жир.${trendText}`;
        }

        const confidence = measurements.length >= 30 ? 0.9 : measurements.length >= 20 ? 0.7 : 0.5;

        return {
            pattern: PATTERNS.BODY_COMPOSITION,
            available: true,
            avgWHR: Math.round(avgWHR * 100) / 100,
            threshold,
            trend: trend > 0.001 ? 'up' : trend < -0.001 ? 'down' : 'stable',
            dataPoints: measurements.length,
            score,
            confidence,
            insight
        };
    }

    /**
     * B5: Cycle Impact — влияние менструального цикла (динамическая фазировка).
     * @param {Array} days
     * @param {object} pIndex
     * @param {object} profile
     * @returns {object}
     */
    function analyzeCyclePatterns(days, pIndex, profile) {
        if (profile?.gender === 'male' || !profile?.cycleTrackingEnabled) {
            return {
                pattern: PATTERNS.CYCLE_IMPACT,
                available: false,
                confidence: 0,
                insight: 'Трекинг цикла не активирован'
            };
        }

        const cycleDays = days.filter(d => d.cycleDay != null);
        if (cycleDays.length < 14) {
            return {
                pattern: PATTERNS.CYCLE_IMPACT,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных о цикле (нужно 14+ дней)'
            };
        }

        const cycleDayNumbers = cycleDays.map(d => d.cycleDay);
        const maxCycleDay = Math.max(...cycleDayNumbers);
        const ovulationDay = maxCycleDay >= 28 ? 14 : Math.round(maxCycleDay / 2);

        const follicular = [];
        const luteal = [];

        for (const day of cycleDays) {
            const phaseData = {
                date: day.date,
                cycleDay: day.cycleDay,
                kcal: calculateDayKcal(day, pIndex),
                weight: day.weightMorning,
                mood: day.moodAvg || (day.meals ? average(day.meals.filter(m => m.mood).map(m => m.mood)) : null),
                steps: day.steps
            };

            if (day.cycleDay <= ovulationDay) {
                follicular.push(phaseData);
            } else {
                luteal.push(phaseData);
            }
        }

        if (follicular.length < 5 || luteal.length < 5) {
            return {
                pattern: PATTERNS.CYCLE_IMPACT,
                available: false,
                confidence: 0.3,
                insight: 'Недостаточно данных для сравнения фаз'
            };
        }

        const follicularKcal = average(follicular.filter(d => d.kcal > 0).map(d => d.kcal));
        const lutealKcal = average(luteal.filter(d => d.kcal > 0).map(d => d.kcal));
        const kcalDiff = lutealKcal - follicularKcal;

        const follicularMood = average(follicular.filter(d => d.mood).map(d => d.mood));
        const lutealMood = average(luteal.filter(d => d.mood).map(d => d.mood));
        const moodDiff = lutealMood - follicularMood;

        let insight;
        if (kcalDiff > 150 && moodDiff < -0.3) {
            insight = `🌙 Лютеиновая фаза: +${Math.round(kcalDiff)}ккал, настроение хуже. Это норма (прогестерон↑)`;
        } else if (kcalDiff > 150) {
            insight = `🌙 Лютеиновая фаза: +${Math.round(kcalDiff)}ккал (прогестерон↑ BMR на 5-10%)`;
        } else if (moodDiff < -0.5) {
            insight = '😔 Настроение падает во 2-й фазе. ПМС? Цикл влияет';
        } else {
            insight = '✅ Цикл влияет умеренно. Различия в норме';
        }

        const score = Math.abs(kcalDiff) < 200 && Math.abs(moodDiff) < 0.5 ? 90 : 70;
        const confidence = cycleDays.length >= 21 ? 0.8 : 0.6;

        return {
            pattern: PATTERNS.CYCLE_IMPACT,
            available: true,
            ovulationDay,
            follicularDays: follicular.length,
            lutealDays: luteal.length,
            kcalDiff: Math.round(kcalDiff),
            moodDiff: Math.round(moodDiff * 10) / 10,
            dataPoints: cycleDays.length,
            score,
            confidence,
            insight
        };
    }

    /**
     * B6: Weekend Effect — паттерн пт-вс vs пн-чт.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeWeekendEffect(days, pIndex) {
        const weekdays = [];
        const weekends = [];

        for (const day of days) {
            if (!day.date) continue;
            const date = new Date(day.date);
            const dayOfWeek = date.getDay();

            const dayData = {
                date: day.date,
                kcal: calculateDayKcal(day, pIndex),
                sleep: day.sleepHours || (day.sleepStart && day.sleepEnd ? calculateSleepHours(day.sleepStart, day.sleepEnd) : null),
                steps: day.steps
            };

            if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
                weekends.push(dayData);
            } else if (dayOfWeek >= 1 && dayOfWeek <= 4) {
                weekdays.push(dayData);
            }
        }

        if (weekdays.length < 4 || weekends.length < 3) {
            return {
                pattern: PATTERNS.WEEKEND_EFFECT,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных для сравнения будней и выходных'
            };
        }

        const weekdayKcal = average(weekdays.filter(d => d.kcal > 0).map(d => d.kcal));
        const weekendKcal = average(weekends.filter(d => d.kcal > 0).map(d => d.kcal));
        const kcalDiffPct = ((weekendKcal - weekdayKcal) / weekdayKcal) * 100;

        const weekdaySleep = average(weekdays.filter(d => d.sleep).map(d => d.sleep));
        const weekendSleep = average(weekends.filter(d => d.sleep).map(d => d.sleep));
        const sleepDiff = weekendSleep - weekdaySleep;

        const weekdaySteps = average(weekdays.filter(d => d.steps).map(d => d.steps));
        const weekendSteps = average(weekends.filter(d => d.steps).map(d => d.steps));
        const stepsDiffPct = ((weekendSteps - weekdaySteps) / weekdaySteps) * 100;

        let score;
        let insight;
        if (kcalDiffPct > 30) {
            score = 50;
            insight = `⚠️ В выходные +${Math.round(kcalDiffPct)}% калорий! Дефицит улетает`;
        } else if (kcalDiffPct > 10 && kcalDiffPct <= 30) {
            score = 70;
            insight = `🟡 Выходные +${Math.round(kcalDiffPct)}% ккал. Норма, но следи`;
        } else {
            score = 90;
            insight = `✅ Стабильный режим! Выходные ${kcalDiffPct > 0 ? '+' : ''}${Math.round(kcalDiffPct)}% ккал`;
        }

        const confidence = weekdays.length >= 8 && weekends.length >= 6 ? 0.8 : 0.6;

        return {
            pattern: PATTERNS.WEEKEND_EFFECT,
            available: true,
            weekdayKcal: Math.round(weekdayKcal),
            weekendKcal: Math.round(weekendKcal),
            kcalDiffPct: Math.round(kcalDiffPct),
            weekdaySleep: Math.round(weekdaySleep * 10) / 10,
            weekendSleep: Math.round(weekendSleep * 10) / 10,
            sleepDiff: Math.round(sleepDiff * 10) / 10,
            weekdaySteps: Math.round(weekdaySteps),
            weekendSteps: Math.round(weekendSteps),
            stepsDiffPct: Math.round(stepsDiffPct),
            dataPoints: weekdays.length + weekends.length,
            score,
            confidence,
            insight
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeWellbeing = analyzeWellbeing;
    HEYS.InsightsPI.patternModules.analyzeHydration = analyzeHydration;
    HEYS.InsightsPI.patternModules.analyzeBodyComposition = analyzeBodyComposition;
    HEYS.InsightsPI.patternModules.analyzeCyclePatterns = analyzeCyclePatterns;
    HEYS.InsightsPI.patternModules.analyzeWeekendEffect = analyzeWeekendEffect;
})(typeof window !== 'undefined' ? window : global);
