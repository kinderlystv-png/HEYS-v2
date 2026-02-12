// insights/patterns/sleep.js — Modular sleep analyzers (v6.7.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};
    const piCalculations = HEYS.InsightsPI?.calculations || global.piCalculations || {};
    const SCIENCE_INFO = HEYS.InsightsPI?.science || global.piScience || {};

    const CONFIG = piConst.CONFIG || {
        MIN_DAYS_FOR_FULL_ANALYSIS: 7,
        MIN_CORRELATION_DISPLAY: 0.35
    };

    const PATTERNS = piConst.PATTERNS || {
        SLEEP_WEIGHT: 'sleep_weight',
        SLEEP_HUNGER: 'sleep_hunger',
        SLEEP_QUALITY: 'sleep_quality'
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

        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);

        let startMin = startH * 60 + startM;
        let endMin = endH * 60 + endM;

        if (startMin > endMin) {
            endMin += 24 * 60;
        }

        return (endMin - startMin) / 60;
    }

    /**
     * Корреляция сна и веса.
     * @param {Array} days
     * @returns {object}
     */
    function analyzeSleepWeight(days) {
        const pairs = [];

        for (const day of days) {
            const sleep = day.sleepHours || (day.sleepStart && day.sleepEnd
                ? calculateSleepHours(day.sleepStart, day.sleepEnd)
                : null);
            const weight = day.weightMorning;

            if (sleep && weight) {
                pairs.push({ sleep, weight, date: day.date });
            }
        }

        if (pairs.length < 7) {
            return {
                pattern: PATTERNS.SLEEP_WEIGHT,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных сна и веса'
            };
        }

        const sleepArr = pairs.map(p => p.sleep);
        const weightArr = pairs.map(p => p.weight);
        const correlation = pearsonCorrelation(sleepArr, weightArr);

        const score = Math.round(50 + correlation * -50);
        let insight;
        if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
            insight = 'Связь сна и веса пока не выявлена';
        } else if (correlation < -0.3) {
            insight = `💤 Больше сна → меньше вес (r=${correlation.toFixed(2)})`;
        } else if (correlation > 0.3) {
            insight = `⚠️ Недосып коррелирует с набором веса (r=${correlation.toFixed(2)})`;
        } else {
            insight = `Умеренная связь сна и веса (r=${correlation.toFixed(2)})`;
        }

        return {
            pattern: PATTERNS.SLEEP_WEIGHT,
            available: true,
            correlation: Math.round(correlation * 100) / 100,
            dataPoints: pairs.length,
            avgSleep: Math.round(average(sleepArr) * 10) / 10,
            score,
            confidence: pairs.length >= 10 ? 0.8 : 0.5,
            insight
        };
    }

    /**
     * Корреляция недосыпа и переедания.
     * @param {Array} days
     * @param {object} profile
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeSleepHunger(days, profile, pIndex) {
        const pairs = [];
        const sleepNorm = profile?.sleepHours || 8;

        for (const day of days) {
            const sleep = day.sleepHours || (day.sleepStart && day.sleepEnd
                ? calculateSleepHours(day.sleepStart, day.sleepEnd)
                : null);

            const dayKcal = calculateDayKcal(day, pIndex);

            if (sleep && dayKcal > 0) {
                const sleepDeficit = sleepNorm - sleep;
                pairs.push({ sleepDeficit, kcal: dayKcal, date: day.date });
            }
        }

        if (pairs.length < 7) {
            return {
                pattern: PATTERNS.SLEEP_HUNGER,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных для анализа связи сна и аппетита',
                formula: SCIENCE_INFO?.CORRELATION?.formula || 'r = pearson(x, y)'
            };
        }

        const deficitArr = pairs.map(p => p.sleepDeficit);
        const kcalArr = pairs.map(p => p.kcal);
        const correlation = pearsonCorrelation(deficitArr, kcalArr);

        const score = Math.round(50 - correlation * 50);
        let insight;
        if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
            insight = 'Связь недосыпа и аппетита пока не выявлена';
        } else if (correlation > 0.3) {
            insight = `😴 Недосып → +калории! При -1ч сна ≈ +${Math.round(correlation * 200)} ккал`;
        } else if (correlation < -0.3) {
            insight = '💪 Отлично контролируешь аппетит даже при недосыпе';
        } else {
            insight = 'Умеренная связь сна и аппетита';
        }

        return {
            pattern: PATTERNS.SLEEP_HUNGER,
            available: true,
            correlation: Math.round(correlation * 100) / 100,
            dataPoints: pairs.length,
            score,
            confidence: pairs.length >= 10 ? 0.8 : 0.5,
            insight,
            formula: `r = pearson(sleepDeficit[], kcal[])\nsleepDeficit = ${sleepNorm}ч (норма) - actualSleep`,
            debug: {
                avgSleepDeficit: Math.round(average(deficitArr) * 10) / 10,
                avgKcal: Math.round(average(kcalArr)),
                source: SCIENCE_INFO?.hormones?.source || 'Spiegel et al., 2004'
            }
        };
    }

    /**
     * B1: Sleep Quality → Next Day Metrics (time-lagged correlation).
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeSleepQuality(days, pIndex) {
        if (!days || days.length < 8) {
            return {
                pattern: PATTERNS.SLEEP_QUALITY,
                available: false,
                confidence: 0.2,
                insight: 'Недостаточно данных о качестве сна'
            };
        }

        const timeLaggedPairs = {
            weight: [],
            hunger: [],
            steps: [],
            kcal: []
        };

        for (let i = 0; i < days.length - 1; i++) {
            const today = days[i];
            const tomorrow = days[i + 1];

            const sleepQuality = today.sleepQuality;
            if (!sleepQuality) continue;

            if (tomorrow.weightMorning) {
                timeLaggedPairs.weight.push({ quality: sleepQuality, value: tomorrow.weightMorning });
            }
            if (tomorrow.hungerAvg) {
                timeLaggedPairs.hunger.push({ quality: sleepQuality, value: tomorrow.hungerAvg });
            }
            if (tomorrow.steps) {
                timeLaggedPairs.steps.push({ quality: sleepQuality, value: tomorrow.steps });
            }
            const tomorrowKcal = calculateDayKcal(tomorrow, pIndex);
            if (tomorrowKcal > 0) {
                timeLaggedPairs.kcal.push({ quality: sleepQuality, value: tomorrowKcal });
            }
        }

        const correlations = {};
        let maxAbsCorr = 0;
        let keyMetric = null;

        for (const [metric, pairs] of Object.entries(timeLaggedPairs)) {
            if (pairs.length < 7) continue;

            const qualityArr = pairs.map(p => p.quality);
            const valueArr = pairs.map(p => p.value);
            const corr = pearsonCorrelation(qualityArr, valueArr);

            correlations[metric] = {
                correlation: corr,
                dataPoints: pairs.length,
                avgQuality: average(qualityArr),
                avgValue: average(valueArr)
            };

            if (Math.abs(corr) > maxAbsCorr && Math.abs(corr) >= CONFIG.MIN_CORRELATION_DISPLAY) {
                maxAbsCorr = Math.abs(corr);
                keyMetric = metric;
            }
        }

        if (!keyMetric) {
            return {
                pattern: PATTERNS.SLEEP_QUALITY,
                available: true,
                correlations,
                dataPoints: Object.values(correlations)[0]?.dataPoints || 0,
                score: 50,
                confidence: 0.3,
                insight: 'Связь качества сна с метриками следующего дня пока не выявлена'
            };
        }

        const keyData = correlations[keyMetric];
        const baseConfidence = keyData.dataPoints < 14 ? 0.25 : 0.5;
        const confidence = baseConfidence * (1 + maxAbsCorr);

        const score = maxAbsCorr >= 0.5 ? 90 : maxAbsCorr >= 0.4 ? 75 : 60;

        const metricNames = {
            weight: 'вес',
            hunger: 'голод',
            steps: 'шаги',
            kcal: 'калории'
        };

        let insight;
        if (keyData.correlation < -0.4) {
            insight = `💤 Хороший сон → ниже ${metricNames[keyMetric]} на след. день (r=${keyData.correlation.toFixed(2)})`;
        } else if (keyData.correlation > 0.4) {
            insight = `⚠️ Плохой сон → выше ${metricNames[keyMetric]} на след. день (r=${keyData.correlation.toFixed(2)})`;
        } else {
            insight = `Умеренная связь сна с ${metricNames[keyMetric]} (r=${keyData.correlation.toFixed(2)})`;
        }

        return {
            pattern: PATTERNS.SLEEP_QUALITY,
            available: true,
            keyMetric,
            correlations,
            dataPoints: keyData.dataPoints,
            score,
            confidence,
            insight
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeSleepWeight = analyzeSleepWeight;
    HEYS.InsightsPI.patternModules.analyzeSleepHunger = analyzeSleepHunger;
    HEYS.InsightsPI.patternModules.analyzeSleepQuality = analyzeSleepQuality;
})(typeof window !== 'undefined' ? window : global);
