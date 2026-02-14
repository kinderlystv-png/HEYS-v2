// insights/patterns/sleep.js — Modular sleep analyzers (v6.7.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};
    const piCalculations = HEYS.InsightsPI?.calculations || global.piCalculations || {};
    const SCIENCE_INFO = piConst.SCIENCE_INFO || HEYS.InsightsPI?.science || global.piScience || {};

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

    const pearsonWithSignificance = piStats.pearsonWithSignificance || function (x, y, alpha = 0.05) {
        // Fallback if piStats not loaded
        const r = pearsonCorrelation(x, y);
        return {
            r,
            pValue: 1,
            isSignificant: false,
            n: x.length,
            df: x.length - 2,
            tStat: 0,
            effectSize: 'unknown',
            interpretation: 'pearsonWithSignificance not available',
            warning: 'fallback_mode'
        };
    };

    const bayesianCorrelation = piStats.bayesianCorrelation || function (x, y, priorR = 0, priorN = 10) {
        // Fallback: return observed correlation without shrinkage
        const r = pearsonCorrelation(x, y);
        return {
            posteriorR: r,
            observedR: r,
            shrinkage: 0,
            effectiveN: x.length,
            confidence: 0.5,
            interpretation: 'bayesianCorrelation not available'
        };
    };

    const confidenceIntervalForCorrelation = piStats.confidenceIntervalForCorrelation || function (r, n, confidenceLevel = 0.95) {
        // Fallback: wide interval
        return {
            lower: Math.max(-1, r - 0.5),
            upper: Math.min(1, r + 0.5),
            margin: 0.5,
            width: 1.0,
            r,
            n
        };
    };

    const detectOutliers = piStats.detectOutliers || function (arr, iqrMultiplier = 1.5) {
        // Fallback: no outlier detection
        return {
            outliers: [],
            cleaned: arr.slice(),
            indices: [],
            stats: null,
            warning: 'detectOutliers not available'
        };
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

        // v3.5.0: Detect and remove outliers before correlation
        const sleepOutlierCheck = detectOutliers(sleepArr);
        const weightOutlierCheck = detectOutliers(weightArr);

        // Combine outlier indices from both arrays
        const outlierIndices = new Set([
            ...sleepOutlierCheck.indices,
            ...weightOutlierCheck.indices
        ]);

        // Filter out outliers from both arrays (aligned by original index)
        const cleanSleep = [];
        const cleanWeight = [];
        for (let i = 0; i < sleepArr.length; i++) {
            if (!outlierIndices.has(i)) {
                cleanSleep.push(sleepArr[i]);
                cleanWeight.push(weightArr[i]);
            }
        }

        // Re-check minimum N after outlier removal
        if (cleanSleep.length < 7) {
            return {
                pattern: PATTERNS.SLEEP_WEIGHT,
                available: false,
                confidence: 0.2,
                insight: `Недостаточно данных после фильтрации выбросов (${cleanSleep.length}/7)`
            };
        }

        // Statistical significance
        const corrResult = pearsonWithSignificance(cleanSleep, cleanWeight);

        // v3.5.0: Bayesian correlation with null-effect prior (r=0, priorN=10)
        const bayesResult = bayesianCorrelation(cleanSleep, cleanWeight, 0, 10);

        // v3.5.0: Confidence interval for correlation
        const ci = confidenceIntervalForCorrelation(corrResult.r, cleanSleep.length);

        const score = Math.round(50 + bayesResult.posteriorR * -50);
        let insight;

        // Use Bayesian posteriorR for interpretation (stabilized for small N)
        const r = bayesResult.posteriorR;

        if (!corrResult.isSignificant) {
            insight = `Связь сна и веса пока не выявлена (N=${corrResult.n}, p=${corrResult.pValue.toFixed(3)}, 95% CI [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}])`;
        } else if (r < -0.3) {
            insight = `💤 Больше сна → меньше вес (r=${r.toFixed(2)}, p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${corrResult.n}, shrinkage=${(bayesResult.shrinkage * 100).toFixed(0)}%)`;
        } else if (r > 0.3) {
            insight = `⚠️ Недосып коррелирует с набором веса (r=${r.toFixed(2)}, p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${corrResult.n}, shrinkage=${(bayesResult.shrinkage * 100).toFixed(0)}%)`;
        } else {
            insight = `Умеренная связь сна и веса (r=${r.toFixed(2)}, p=${corrResult.pValue.toFixed(3)}, N=${corrResult.n})`;
        }

        // Calculate confidence based on effect size, significance, and CI width
        let confidence = 0.5; // base confidence
        if (corrResult.isSignificant) {
            if (corrResult.effectSize === 'large') confidence = 0.9;
            else if (corrResult.effectSize === 'medium') confidence = 0.75;
            else if (corrResult.effectSize === 'small') confidence = 0.6;
        } else {
            confidence = 0.3; // low confidence for non-significant results
        }

        // Adjust confidence based on CI width (narrower CI → higher confidence)
        const ciPenalty = Math.min(0.1, ci.width / 2 * 0.1);
        confidence = Math.max(0.2, confidence - ciPenalty);

        return {
            pattern: PATTERNS.SLEEP_WEIGHT,
            available: true,
            correlation: Math.round(corrResult.r * 100) / 100,
            bayesianR: Math.round(bayesResult.posteriorR * 100) / 100, // v3.5.0: Bayesian estimate
            pValue: corrResult.pValue,
            isSignificant: corrResult.isSignificant,
            effectSize: corrResult.effectSize,
            confidenceInterval: { // v3.5.0: Uncertainty quantification
                lower: Math.round(ci.lower * 100) / 100,
                upper: Math.round(ci.upper * 100) / 100,
                width: Math.round(ci.width * 100) / 100
            },
            outlierStats: { // v3.5.0: Outlier detection results
                sleepOutliers: sleepOutlierCheck.outliers.length,
                weightOutliers: weightOutlierCheck.outliers.length,
                cleanedN: cleanSleep.length,
                rawN: pairs.length
            },
            dataPoints: pairs.length,
            avgSleep: Math.round(average(cleanSleep) * 10) / 10,
            score,
            confidence: Math.round(confidence * 100) / 100,
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

        // v3.5.0 rollout: detect outliers and align arrays
        const deficitOutlierCheck = detectOutliers(deficitArr);
        const kcalOutlierCheck = detectOutliers(kcalArr);
        const outlierIndices = new Set([
            ...deficitOutlierCheck.indices,
            ...kcalOutlierCheck.indices
        ]);

        const cleanDeficit = [];
        const cleanKcal = [];
        for (let i = 0; i < deficitArr.length; i++) {
            if (!outlierIndices.has(i)) {
                cleanDeficit.push(deficitArr[i]);
                cleanKcal.push(kcalArr[i]);
            }
        }

        if (cleanDeficit.length < 7) {
            return {
                pattern: PATTERNS.SLEEP_HUNGER,
                available: false,
                confidence: 0.2,
                insight: `Недостаточно данных после фильтрации выбросов (${cleanDeficit.length}/7)`,
                formula: SCIENCE_INFO?.CORRELATION?.formula || 'r = pearson(x, y)'
            };
        }

        const corrResult = pearsonWithSignificance(cleanDeficit, cleanKcal);
        const bayesResult = bayesianCorrelation(cleanDeficit, cleanKcal, 0, 8);
        const ci = confidenceIntervalForCorrelation(corrResult.r, cleanDeficit.length);

        const score = Math.round(50 - bayesResult.posteriorR * 50);
        let insight;
        const r = bayesResult.posteriorR;

        // Use statistical significance instead of arbitrary threshold
        if (!corrResult.isSignificant) {
            insight = `Связь недосыпа и аппетита пока не выявлена (N=${corrResult.n}, p=${corrResult.pValue.toFixed(3)}, 95% CI [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}])`;
        } else if (r > 0.3) {
            insight = `😴 Недосып → +калории! При -1ч сна ≈ +${Math.round(r * 200)} ккал (r=${r.toFixed(2)}, p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${corrResult.n})`;
        } else if (r < -0.3) {
            insight = `💪 Отлично контролируешь аппетит даже при недосыпе (r=${r.toFixed(2)}, p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'})`;
        } else {
            insight = `Умеренная связь сна и аппетита (r=${r.toFixed(2)}, p=${corrResult.pValue.toFixed(3)}, N=${corrResult.n})`;
        }

        // Calculate confidence based on effect size and significance
        let confidence = 0.5;
        if (corrResult.isSignificant) {
            if (corrResult.effectSize === 'large') confidence = 0.9;
            else if (corrResult.effectSize === 'medium') confidence = 0.75;
            else if (corrResult.effectSize === 'small') confidence = 0.6;
        } else {
            confidence = 0.3;
        }

        const ciPenalty = Math.min(0.1, ci.width / 2 * 0.1);
        confidence = Math.max(0.2, confidence - ciPenalty);

        return {
            pattern: PATTERNS.SLEEP_HUNGER,
            available: true,
            correlation: Math.round(corrResult.r * 100) / 100,
            bayesianR: Math.round(bayesResult.posteriorR * 100) / 100,
            pValue: corrResult.pValue,
            isSignificant: corrResult.isSignificant,
            effectSize: corrResult.effectSize,
            confidenceInterval: {
                lower: Math.round(ci.lower * 100) / 100,
                upper: Math.round(ci.upper * 100) / 100,
                width: Math.round(ci.width * 100) / 100
            },
            outlierStats: {
                deficitOutliers: deficitOutlierCheck.outliers.length,
                kcalOutliers: kcalOutlierCheck.outliers.length,
                cleanedN: cleanDeficit.length,
                rawN: pairs.length
            },
            dataPoints: pairs.length,
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight,
            formula: `r = pearson(sleepDeficit[], kcal[])\nsleepDeficit = ${sleepNorm}ч (норма) - actualSleep`,
            debug: {
                avgSleepDeficit: Math.round(average(cleanDeficit) * 10) / 10,
                avgKcal: Math.round(average(cleanKcal)),
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
        if (!Array.isArray(days) || days.length === 0) {
            return {
                pattern: PATTERNS.SLEEP_QUALITY,
                available: false,
                reason: 'no_sleep_quality',
                confidence: 0.2,
                insight: 'Недостаточно данных о качестве сна'
            };
        }

        const robustPairsRequired = days.length >= 14 ? 7 : 4;
        const sleepQualityDays = days.filter(d => Number(d?.sleepQuality) > 0).length;

        if (sleepQualityDays === 0) {
            return {
                pattern: PATTERNS.SLEEP_QUALITY,
                available: false,
                reason: 'no_sleep_quality',
                confidence: 0.2,
                insight: 'Недостаточно данных о качестве сна'
            };
        }

        const timeLaggedPairs = {
            weight: [],
            steps: [],
            kcal: [],
            mood: []
        };

        for (let i = 0; i < days.length - 1; i++) {
            const today = days[i];
            const tomorrow = days[i + 1];

            const sleepQuality = today.sleepQuality;
            if (!sleepQuality) continue;

            if (tomorrow.weightMorning) {
                timeLaggedPairs.weight.push({ quality: sleepQuality, value: tomorrow.weightMorning });
            }
            if (tomorrow.moodAvg) {
                timeLaggedPairs.mood.push({ quality: sleepQuality, value: tomorrow.moodAvg });
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
        let keyPValue = 1;
        let keyIsSignificant = false;
        let keyEffectSize = null;

        for (const [metric, pairs] of Object.entries(timeLaggedPairs)) {
            if (pairs.length < 1) continue;

            const qualityArr = pairs.map(p => p.quality);
            const valueArr = pairs.map(p => p.value);

            // v3.5.0 rollout: detect outliers and align pairs
            const qualityOutlierCheck = detectOutliers(qualityArr);
            const valueOutlierCheck = detectOutliers(valueArr);
            const outlierIndices = new Set([
                ...qualityOutlierCheck.indices,
                ...valueOutlierCheck.indices
            ]);

            const cleanQuality = [];
            const cleanValues = [];
            for (let i = 0; i < qualityArr.length; i++) {
                if (!outlierIndices.has(i)) {
                    cleanQuality.push(qualityArr[i]);
                    cleanValues.push(valueArr[i]);
                }
            }

            const corrResult = cleanQuality.length >= 2
                ? pearsonWithSignificance(cleanQuality, cleanValues)
                : { r: 0, pValue: 1, isSignificant: false, effectSize: 'insufficient_data', n: cleanQuality.length };
            const bayesResult = cleanQuality.length >= 2
                ? bayesianCorrelation(cleanQuality, cleanValues, 0, 8)
                : { posteriorR: corrResult.r, observedR: corrResult.r, shrinkage: 0 };
            const ci = cleanQuality.length >= 4
                ? confidenceIntervalForCorrelation(corrResult.r, cleanQuality.length)
                : { lower: -1, upper: 1, width: 2 };

            correlations[metric] = {
                correlation: corrResult.r,
                bayesianR: bayesResult.posteriorR,
                pValue: corrResult.pValue,
                isSignificant: corrResult.isSignificant,
                effectSize: corrResult.effectSize,
                confidenceInterval: {
                    lower: Math.round(ci.lower * 100) / 100,
                    upper: Math.round(ci.upper * 100) / 100,
                    width: Math.round(ci.width * 100) / 100
                },
                outlierStats: {
                    qualityOutliers: qualityOutlierCheck.outliers.length,
                    valueOutliers: valueOutlierCheck.outliers.length,
                    cleanedN: cleanQuality.length,
                    rawN: pairs.length
                },
                dataPoints: cleanQuality.length,
                avgQuality: average(cleanQuality),
                avgValue: average(cleanValues)
            };

            // Choose most significant metric (lowest p-value + highest |r|)
            if (corrResult.isSignificant && Math.abs(bayesResult.posteriorR) >= 0.3) {
                if (!keyMetric || corrResult.pValue < keyPValue ||
                    (corrResult.pValue === keyPValue && Math.abs(bayesResult.posteriorR) > maxAbsCorr)) {
                    maxAbsCorr = Math.abs(bayesResult.posteriorR);
                    keyMetric = metric;
                    keyPValue = corrResult.pValue;
                    keyIsSignificant = true;
                    keyEffectSize = corrResult.effectSize;
                }
            }
        }

        const bestDataPoints = Object.values(correlations).reduce((max, item) => {
            return Math.max(max, Number(item?.dataPoints) || 0);
        }, 0);

        if (!keyMetric) {
            const hasLagData = bestDataPoints > 0;
            return {
                pattern: PATTERNS.SLEEP_QUALITY,
                available: true,
                correlations,
                dataPoints: hasLagData ? bestDataPoints : sleepQualityDays,
                score: 50,
                confidence: hasLagData ? 0.3 : 0.25,
                isPreliminary: hasLagData ? bestDataPoints < robustPairsRequired : true,
                requiredDataPoints: robustPairsRequired,
                insight: hasLagData
                    ? 'Связь качества сна с метриками следующего дня пока не выявлена (недостаточно статистически значимых связей)'
                    : `🌙 Есть оценки сна (${sleepQualityDays} дн.), но пока мало метрик следующего дня для надёжной связи`
            };
        }

        const keyData = correlations[keyMetric];

        // Calculate confidence based on effect size and significance
        let confidence = 0.5;
        if (keyIsSignificant) {
            if (keyEffectSize === 'large') confidence = 0.9;
            else if (keyEffectSize === 'medium') confidence = 0.75;
            else if (keyEffectSize === 'small') confidence = 0.6;
        } else {
            confidence = keyData.dataPoints >= 14 ? 0.4 : 0.3;
        }

        const score = maxAbsCorr >= 0.5 ? 90 : maxAbsCorr >= 0.4 ? 75 : 60;

        const metricNames = {
            weight: 'вес',
            mood: 'настроение',
            steps: 'шаги',
            kcal: 'калории'
        };

        let insight;
        if (keyData.isSignificant && keyData.bayesianR < -0.4) {
            insight = `💤 Хороший сон → ниже ${metricNames[keyMetric]} на след. день (r=${keyData.bayesianR.toFixed(2)}, p<${keyData.pValue < 0.01 ? '0.01' : '0.05'}, N=${keyData.dataPoints})`;
        } else if (keyData.isSignificant && keyData.bayesianR > 0.4) {
            insight = `⚠️ Плохой сон → выше ${metricNames[keyMetric]} на след. день (r=${keyData.bayesianR.toFixed(2)}, p<${keyData.pValue < 0.01 ? '0.01' : '0.05'}, N=${keyData.dataPoints})`;
        } else {
            insight = `Умеренная связь сна с ${metricNames[keyMetric]} (r=${keyData.bayesianR.toFixed(2)}, p=${keyData.pValue.toFixed(3)}, N=${keyData.dataPoints})`;
        }

        const ciPenalty = Math.min(0.1, (Number(keyData?.confidenceInterval?.width) || 2) / 2 * 0.1);
        confidence = Math.max(0.2, confidence - ciPenalty);

        return {
            pattern: PATTERNS.SLEEP_QUALITY,
            available: true,
            keyMetric,
            correlation: keyData.correlation,
            bayesianR: Math.round(keyData.bayesianR * 100) / 100,
            pValue: keyData.pValue,
            isSignificant: keyData.isSignificant,
            effectSize: keyData.effectSize,
            confidenceInterval: keyData.confidenceInterval,
            outlierStats: keyData.outlierStats,
            correlations,
            dataPoints: keyData.dataPoints,
            score,
            confidence: Math.round(confidence * 100) / 100,
            isPreliminary: keyData.dataPoints < robustPairsRequired,
            requiredDataPoints: robustPairsRequired,
            insight: keyData.dataPoints < robustPairsRequired
                ? `${insight}. Предварительно: ${keyData.dataPoints}/${robustPairsRequired} пар`
                : insight
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeSleepWeight = analyzeSleepWeight;
    HEYS.InsightsPI.patternModules.analyzeSleepHunger = analyzeSleepHunger;
    HEYS.InsightsPI.patternModules.analyzeSleepQuality = analyzeSleepQuality;
})(typeof window !== 'undefined' ? window : global);
