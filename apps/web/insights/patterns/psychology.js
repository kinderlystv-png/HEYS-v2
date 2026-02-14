// insights/patterns/psychology.js — Modular psychology analyzers (v6.6.0)
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
        STRESS_EATING: 'stress_eating',
        MOOD_FOOD: 'mood_food',
        MOOD_TRAJECTORY: 'mood_trajectory'
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
        const r = pearsonCorrelation(x, y);
        return { posteriorR: r, observedR: r, shrinkage: 0, effectiveN: x.length, confidence: 0.5 };
    };

    const confidenceIntervalForCorrelation = piStats.confidenceIntervalForCorrelation || function (r, n, confidenceLevel = 0.95) {
        return { lower: Math.max(-1, r - 0.5), upper: Math.min(1, r + 0.5), margin: 0.5, width: 1.0, r, n };
    };

    const detectOutliers = piStats.detectOutliers || function (arr, iqrMultiplier = 1.5) {
        return { outliers: [], cleaned: arr.slice(), indices: [], stats: null };
    };

    const calculateDayKcal = piCalculations.calculateDayKcal || function (day, pIndex) {
        const savedKcal = Number(day?.savedEatenKcal);
        if (Number.isFinite(savedKcal) && savedKcal > 0) return savedKcal;
        if (!day?.meals?.length) return 0;
        let total = 0;
        for (const meal of day.meals) {
            for (const item of (meal.items || [])) {
                const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
                if (!prod || !item.grams) continue;
                const p = prod.protein100 || 0;
                const c = (prod.simple100 || 0) + (prod.complex100 || 0);
                const f = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);
                total += (p * 3 + c * 4 + f * 9) * item.grams / 100;
            }
        }
        return total;
    };

    /**
     * Корреляция стресса и переедания.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeStressEating(days, pIndex) {
        const pairs = [];

        for (const day of days) {
            const stress = day.stressAvg || (day.meals && average(day.meals.filter(m => m.stress).map(m => m.stress)));
            const dayKcal = calculateDayKcal(day, pIndex);

            if (stress && dayKcal > 0) {
                pairs.push({ stress, kcal: dayKcal, date: day.date });
            }
        }

        if (pairs.length < 7) {
            return {
                pattern: PATTERNS.STRESS_EATING,
                available: false,
                reason: 'no_stress_data',
                confidence: 0.2,
                insight: 'Недостаточно данных о стрессе'
            };
        }

        const stressArr = pairs.map(p => p.stress);
        const kcalArr = pairs.map(p => p.kcal);
        const stressOutlierCheck = detectOutliers(stressArr);
        const kcalOutlierCheck = detectOutliers(kcalArr);
        const outlierIndices = new Set([
            ...stressOutlierCheck.indices,
            ...kcalOutlierCheck.indices
        ]);

        const cleanStress = [];
        const cleanKcal = [];
        for (let i = 0; i < stressArr.length; i++) {
            if (!outlierIndices.has(i)) {
                cleanStress.push(stressArr[i]);
                cleanKcal.push(kcalArr[i]);
            }
        }

        if (cleanStress.length < 7) {
            return {
                pattern: PATTERNS.STRESS_EATING,
                available: false,
                reason: 'insufficient_after_outliers',
                confidence: 0.2,
                insight: `Недостаточно данных после фильтрации выбросов (${cleanStress.length}/7)`
            };
        }

        const corrResult = pearsonWithSignificance(cleanStress, cleanKcal);
        const bayesResult = bayesianCorrelation(cleanStress, cleanKcal, 0.1, 6);
        const ci = confidenceIntervalForCorrelation(corrResult.r, cleanStress.length);

        const avgStress = average(cleanStress);
        const score = Math.round(50 - bayesResult.posteriorR * 50);

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

        let insight;
        const r = bayesResult.posteriorR;
        if (!corrResult.isSignificant) {
            insight = `Связь стресса и еды пока не выявлена (N=${corrResult.n}, p=${corrResult.pValue.toFixed(3)}, 95% CI [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}])`;
        } else if (r > 0.3) {
            insight = `😰 Стресс → переедание! При стрессе ≈ +${Math.round(r * 300)} ккал (p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${corrResult.n})`;
        } else if (r < -0.3) {
            insight = `💪 Стресс не влияет на аппетит — отлично! (r=${r.toFixed(2)}, p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'})`;
        } else {
            insight = `Умеренная связь стресса и аппетита (r=${r.toFixed(2)}, p=${corrResult.pValue.toFixed(3)}, N=${corrResult.n})`;
        }

        return {
            pattern: PATTERNS.STRESS_EATING,
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
                stressOutliers: stressOutlierCheck.outliers.length,
                kcalOutliers: kcalOutlierCheck.outliers.length,
                cleanedN: cleanStress.length,
                rawN: pairs.length
            },
            avgStress: Math.round(avgStress * 10) / 10,
            dataPoints: cleanStress.length,
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    /**
     * Корреляция настроения и качества еды.
     * @param {Array} days
     * @param {object} pIndex
     * @param {object} optimum
     * @returns {object}
     */
    function analyzeMoodFood(days, pIndex, optimum) {
        const getMealQualityScore = HEYS.getMealQualityScore
            || HEYS.mealScoring?.getMealQualityScore;
        if (!getMealQualityScore) {
            return {
                pattern: PATTERNS.MOOD_FOOD,
                available: false,
                reason: 'no_quality_function',
                insight: 'Оценка качества приёмов недоступна'
            };
        }

        const pairs = [];

        for (const day of days) {
            const mood = day.moodAvg || (day.meals && average(day.meals.filter(m => m.mood).map(m => m.mood)));

            if (!mood || !day.meals || day.meals.length === 0) continue;

            const scores = day.meals.map(meal => {
                try {
                    const quality = getMealQualityScore(meal, meal.name || 'Приём', optimum, pIndex);
                    return quality?.score || 0;
                } catch (_error) {
                    return 0;
                }
            }).filter(s => s > 0);

            if (scores.length > 0) {
                pairs.push({ mood, quality: average(scores), date: day.date });
            }
        }

        if (pairs.length < 7) {
            return {
                pattern: PATTERNS.MOOD_FOOD,
                available: false,
                reason: 'no_mood_data',
                confidence: 0.2,
                insight: 'Недостаточно данных о настроении'
            };
        }

        const moodArr = pairs.map(p => p.mood);
        const qualityArr = pairs.map(p => p.quality);
        const moodOutlierCheck = detectOutliers(moodArr);
        const qualityOutlierCheck = detectOutliers(qualityArr);
        const outlierIndices = new Set([
            ...moodOutlierCheck.indices,
            ...qualityOutlierCheck.indices
        ]);

        const cleanMood = [];
        const cleanQuality = [];
        for (let i = 0; i < moodArr.length; i++) {
            if (!outlierIndices.has(i)) {
                cleanMood.push(moodArr[i]);
                cleanQuality.push(qualityArr[i]);
            }
        }

        if (cleanMood.length < 7) {
            return {
                pattern: PATTERNS.MOOD_FOOD,
                available: false,
                reason: 'insufficient_after_outliers',
                confidence: 0.2,
                insight: `Недостаточно данных после фильтрации выбросов (${cleanMood.length}/7)`
            };
        }

        const corrResult = pearsonWithSignificance(cleanMood, cleanQuality);
        const bayesResult = bayesianCorrelation(cleanMood, cleanQuality, 0.1, 6);
        const ci = confidenceIntervalForCorrelation(corrResult.r, cleanMood.length);

        const avgMood = average(cleanMood);
        const avgQuality = average(cleanQuality);
        const score = Math.round(avgQuality);

        let insight;
        const r = bayesResult.posteriorR;
        if (!corrResult.isSignificant) {
            insight = `Связь настроения и качества еды пока не выявлена (N=${corrResult.n}, p=${corrResult.pValue.toFixed(3)}, 95% CI [${ci.lower.toFixed(2)}, ${ci.upper.toFixed(2)}])`;
        } else if (r > 0.3) {
            insight = `😊 Хорошее настроение → качественнее еда! Береги себя (p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${corrResult.n})`;
        } else if (r < -0.3) {
            insight = `🤔 При плохом настроении ешь лучше — это способ заботы? (p<${corrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${corrResult.n})`;
        } else {
            insight = `Умеренная связь настроения и питания (r=${r.toFixed(2)}, p=${corrResult.pValue.toFixed(3)}, N=${corrResult.n})`;
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
            pattern: PATTERNS.MOOD_FOOD,
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
                moodOutliers: moodOutlierCheck.outliers.length,
                qualityOutliers: qualityOutlierCheck.outliers.length,
                cleanedN: cleanMood.length,
                rawN: pairs.length
            },
            avgMood: Math.round(avgMood * 10) / 10,
            avgQuality: Math.round(avgQuality),
            dataPoints: cleanMood.length,
            score,
            confidence: Math.round(confidence * 100) / 100,
            insight
        };
    }

    /**
     * C6: Mood Trajectory — настроение vs состав каждого приёма.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeMoodTrajectory(days, pIndex) {
        const moodArr = [];
        const simpleArr = [];
        const proteinArr = [];

        for (const day of days) {
            if (!day.meals) continue;

            for (const meal of day.meals) {
                if (meal.mood == null || !meal.items) continue;
                const moodValue = Number(meal.mood);
                if (!Number.isFinite(moodValue)) continue;

                let mealProtein = 0;
                let mealCarbs = 0;
                let mealSimple = 0;
                let mealKcal = 0;

                for (const item of meal.items) {
                    const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
                    if (!prod || !item.grams) continue;

                    const p = prod.protein100 || 0;
                    const simple = prod.simple100 || 0;
                    const complex = prod.complex100 || 0;
                    const carbs = simple + complex;
                    const fat = (prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0);

                    mealProtein += p * item.grams / 100;
                    mealCarbs += carbs * item.grams / 100;
                    mealSimple += simple * item.grams / 100;
                    mealKcal += (p * 3 + carbs * 4 + fat * 9) * item.grams / 100;
                }

                if (mealKcal <= 0) continue;

                const simplePct = mealCarbs > 0 ? (mealSimple / mealCarbs) * 100 : 0;
                const proteinPct = (mealProtein * 3 / mealKcal) * 100;

                moodArr.push(moodValue);
                simpleArr.push(simplePct);
                proteinArr.push(proteinPct);
            }
        }

        if (moodArr.length < 7) {
            return {
                pattern: PATTERNS.MOOD_TRAJECTORY,
                available: false,
                insight: 'Недостаточно данных для анализа настроения по приёмам'
            };
        }

        const simpleOutlierCheck = detectOutliers(simpleArr);
        const proteinOutlierCheck = detectOutliers(proteinArr);
        const moodOutlierCheck = detectOutliers(moodArr);

        const outlierIndicesSimple = new Set([
            ...simpleOutlierCheck.indices,
            ...moodOutlierCheck.indices
        ]);
        const outlierIndicesProtein = new Set([
            ...proteinOutlierCheck.indices,
            ...moodOutlierCheck.indices
        ]);

        const cleanSimple = [];
        const cleanMoodForSimple = [];
        const cleanProtein = [];
        const cleanMoodForProtein = [];

        for (let i = 0; i < moodArr.length; i++) {
            if (!outlierIndicesSimple.has(i)) {
                cleanSimple.push(simpleArr[i]);
                cleanMoodForSimple.push(moodArr[i]);
            }
            if (!outlierIndicesProtein.has(i)) {
                cleanProtein.push(proteinArr[i]);
                cleanMoodForProtein.push(moodArr[i]);
            }
        }

        if (cleanSimple.length < 7 && cleanProtein.length < 7) {
            return {
                pattern: PATTERNS.MOOD_TRAJECTORY,
                available: false,
                insight: `Недостаточно данных после фильтрации выбросов (simple=${cleanSimple.length}, protein=${cleanProtein.length})`
            };
        }

        const simpleCorrResult = cleanSimple.length >= 7
            ? pearsonWithSignificance(cleanSimple, cleanMoodForSimple)
            : { r: 0, pValue: 1, isSignificant: false, effectSize: 'insufficient_data', n: cleanSimple.length };
        const proteinCorrResult = cleanProtein.length >= 7
            ? pearsonWithSignificance(cleanProtein, cleanMoodForProtein)
            : { r: 0, pValue: 1, isSignificant: false, effectSize: 'insufficient_data', n: cleanProtein.length };
        const simpleBayes = cleanSimple.length >= 7
            ? bayesianCorrelation(cleanSimple, cleanMoodForSimple, -0.1, 6)
            : { posteriorR: simpleCorrResult.r };
        const proteinBayes = cleanProtein.length >= 7
            ? bayesianCorrelation(cleanProtein, cleanMoodForProtein, 0.1, 6)
            : { posteriorR: proteinCorrResult.r };
        const simpleCI = cleanSimple.length >= 7
            ? confidenceIntervalForCorrelation(simpleCorrResult.r, cleanSimple.length)
            : { lower: -1, upper: 1, width: 2 };
        const proteinCI = cleanProtein.length >= 7
            ? confidenceIntervalForCorrelation(proteinCorrResult.r, cleanProtein.length)
            : { lower: -1, upper: 1, width: 2 };

        const safeR = (v) => Number.isFinite(v) ? v : 0;
        const safeP = (v) => Number.isFinite(v) ? v : 1;

        let insight;
        let score = 60;
        let primaryCorr = null;
        let primaryPValue = null;
        let primaryIsSignificant = false;
        let primaryEffectSize = null;

        if (simpleCorrResult.isSignificant && simpleBayes.posteriorR < -0.3) {
            insight = `😕 Настроение падает после простых углеводов (r=${simpleBayes.posteriorR.toFixed(2)}, p<${simpleCorrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${simpleCorrResult.n})`;
            score = 40;
            primaryCorr = simpleBayes.posteriorR;
            primaryPValue = simpleCorrResult.pValue;
            primaryIsSignificant = true;
            primaryEffectSize = simpleCorrResult.effectSize;
        } else if (proteinCorrResult.isSignificant && proteinBayes.posteriorR > 0.3) {
            insight = `😊 Белок улучшает настроение (r=${proteinBayes.posteriorR.toFixed(2)}, p<${proteinCorrResult.pValue < 0.01 ? '0.01' : '0.05'}, N=${proteinCorrResult.n})`;
            score = 80;
            primaryCorr = proteinBayes.posteriorR;
            primaryPValue = proteinCorrResult.pValue;
            primaryIsSignificant = true;
            primaryEffectSize = proteinCorrResult.effectSize;
        } else {
            insight = `Настроение стабильнее при сбалансированных приёмах (simple: r=${safeR(simpleBayes.posteriorR).toFixed(2)}, p=${safeP(simpleCorrResult.pValue).toFixed(3)}; protein: r=${safeR(proteinBayes.posteriorR).toFixed(2)}, p=${safeP(proteinCorrResult.pValue).toFixed(3)})`;
            // Take the more significant one as primary
            if (simpleCorrResult.pValue < proteinCorrResult.pValue) {
                primaryCorr = simpleBayes.posteriorR;
                primaryPValue = simpleCorrResult.pValue;
                primaryIsSignificant = simpleCorrResult.isSignificant;
                primaryEffectSize = simpleCorrResult.effectSize;
            } else {
                primaryCorr = proteinBayes.posteriorR;
                primaryPValue = proteinCorrResult.pValue;
                primaryIsSignificant = proteinCorrResult.isSignificant;
                primaryEffectSize = proteinCorrResult.effectSize;
            }
        }

        // Calculate confidence based on primary correlation's effect size
        let confidence = 0.5;
        if (primaryIsSignificant) {
            if (primaryEffectSize === 'large') confidence = 0.9;
            else if (primaryEffectSize === 'medium') confidence = 0.75;
            else if (primaryEffectSize === 'small') confidence = 0.6;
        } else {
            confidence = moodArr.length >= 14 ? 0.4 : 0.3;
        }

        const primaryCIWidth = simpleCorrResult.pValue <= proteinCorrResult.pValue
            ? simpleCI.width
            : proteinCI.width;
        const ciPenalty = Math.min(0.1, (Number(primaryCIWidth) || 2) / 2 * 0.1);
        confidence = Math.max(0.2, confidence - ciPenalty);

        return {
            pattern: PATTERNS.MOOD_TRAJECTORY,
            available: true,
            score,
            dataPoints: Math.max(cleanSimple.length, cleanProtein.length),
            correlation: primaryCorr,
            pValue: primaryPValue,
            isSignificant: primaryIsSignificant,
            effectSize: primaryEffectSize,
            confidenceInterval: {
                simple: {
                    lower: Math.round(simpleCI.lower * 100) / 100,
                    upper: Math.round(simpleCI.upper * 100) / 100,
                    width: Math.round(simpleCI.width * 100) / 100
                },
                protein: {
                    lower: Math.round(proteinCI.lower * 100) / 100,
                    upper: Math.round(proteinCI.upper * 100) / 100,
                    width: Math.round(proteinCI.width * 100) / 100
                }
            },
            outlierStats: {
                moodOutliers: moodOutlierCheck.outliers.length,
                simpleOutliers: simpleOutlierCheck.outliers.length,
                proteinOutliers: proteinOutlierCheck.outliers.length,
                cleanedSimpleN: cleanSimple.length,
                cleanedProteinN: cleanProtein.length,
                rawN: moodArr.length
            },
            simpleCorr: Math.round(simpleCorrResult.r * 100) / 100,
            proteinCorr: Math.round(proteinCorrResult.r * 100) / 100,
            simpleBayesianR: Math.round(simpleBayes.posteriorR * 100) / 100,
            proteinBayesianR: Math.round(proteinBayes.posteriorR * 100) / 100,
            confidence: Math.round(confidence * 100) / 100,
            insight,
            debug: {
                formula: 'corr(mood, simple%) vs corr(mood, protein%)',
                simplePValue: simpleCorrResult.pValue,
                proteinPValue: proteinCorrResult.pValue
            }
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeStressEating = analyzeStressEating;
    HEYS.InsightsPI.patternModules.analyzeMoodFood = analyzeMoodFood;
    HEYS.InsightsPI.patternModules.analyzeMoodTrajectory = analyzeMoodTrajectory;
})(typeof window !== 'undefined' ? window : global);
