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

        const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

        const stressArr = pairs.map(p => p.stress);
        const kcalArr = pairs.map(p => p.kcal);
        const correlation = pearsonCorrelation(stressArr, kcalArr);

        const avgStress = average(stressArr);
        const score = Math.round(50 - correlation * 50);
        const confidence = Math.abs(correlation) >= CONFIG.MIN_CORRELATION_DISPLAY ? baseConfidence * (1 + Math.abs(correlation)) : baseConfidence;

        let insight;
        if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
            insight = 'Связь стресса и еды пока не выявлена';
        } else if (correlation > 0.3) {
            insight = `😰 Стресс → переедание! При стрессе ≈ +${Math.round(correlation * 300)} ккал`;
        } else if (correlation < -0.3) {
            insight = '💪 Стресс не влияет на аппетит — отлично!';
        } else {
            insight = 'Умеренная связь стресса и аппетита';
        }

        return {
            pattern: PATTERNS.STRESS_EATING,
            available: true,
            correlation: Math.round(correlation * 100) / 100,
            avgStress: Math.round(avgStress * 10) / 10,
            dataPoints: pairs.length,
            score,
            confidence,
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

        const baseConfidence = pairs.length < 14 ? 0.25 : 0.5;

        const moodArr = pairs.map(p => p.mood);
        const qualityArr = pairs.map(p => p.quality);
        const correlation = pearsonCorrelation(moodArr, qualityArr);

        const avgMood = average(moodArr);
        const avgQuality = average(qualityArr);
        const score = Math.round(avgQuality);

        let insight;
        if (Math.abs(correlation) < CONFIG.MIN_CORRELATION_DISPLAY) {
            insight = 'Связь настроения и качества еды пока не выявлена';
        } else if (correlation > 0.3) {
            insight = '😊 Хорошее настроение → качественнее еда! Береги себя';
        } else if (correlation < -0.3) {
            insight = '🤔 При плохом настроении ешь лучше — это способ заботы?';
        } else {
            insight = 'Умеренная связь настроения и питания';
        }

        const confidence = Math.abs(correlation) > CONFIG.MIN_CORRELATION_DISPLAY
            ? baseConfidence * (1 + Math.abs(correlation))
            : baseConfidence;

        return {
            pattern: PATTERNS.MOOD_FOOD,
            available: true,
            correlation: Math.round(correlation * 100) / 100,
            avgMood: Math.round(avgMood * 10) / 10,
            avgQuality: Math.round(avgQuality),
            dataPoints: pairs.length,
            score,
            confidence,
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

                moodArr.push(meal.mood);
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

        const simpleCorr = pearsonCorrelation(simpleArr, moodArr);
        const proteinCorr = pearsonCorrelation(proteinArr, moodArr);

        let insight;
        let score = 60;

        if (simpleCorr < -CONFIG.MIN_CORRELATION_DISPLAY) {
            insight = '😕 Настроение падает после простых углеводов — попробуй снизить быстрые';
            score = 40;
        } else if (proteinCorr > CONFIG.MIN_CORRELATION_DISPLAY) {
            insight = '😊 Белок улучшает настроение — держи высокий белок в приёмах';
            score = 80;
        } else {
            insight = 'Настроение стабильнее при сбалансированных приёмах';
        }

        return {
            pattern: PATTERNS.MOOD_TRAJECTORY,
            available: true,
            score,
            dataPoints: moodArr.length,
            simpleCorr: Math.round(simpleCorr * 100) / 100,
            proteinCorr: Math.round(proteinCorr * 100) / 100,
            confidence: moodArr.length >= 14 ? 0.8 : 0.5,
            insight,
            debug: {
                formula: 'corr(mood, simple%) vs corr(mood, protein%)'
            }
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeStressEating = analyzeStressEating;
    HEYS.InsightsPI.patternModules.analyzeMoodFood = analyzeMoodFood;
    HEYS.InsightsPI.patternModules.analyzeMoodTrajectory = analyzeMoodTrajectory;
})(typeof window !== 'undefined' ? window : global);
