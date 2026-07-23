// insights/patterns/timing.js — Modular timing analyzers (v6.5.0)
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

    const average = piStats.average || function (arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((sum, v) => sum + (Number(v) || 0), 0) / arr.length;
    };

    const calculateItemKcal = piCalculations.calculateItemKcal || function (item, pIndex) {
        const prod = pIndex?.byId?.get?.(item?.product_id);
        if (!prod) return 0;
        return (prod.kcal100 || 0) * (item.grams || 0) / 100;
    };

    const PATTERNS = piConst.PATTERNS || {
        MEAL_TIMING: 'meal_timing',
        WAVE_OVERLAP: 'wave_overlap',
        LATE_EATING: 'late_eating',
        CIRCADIAN: 'circadian',
        NUTRIENT_TIMING: 'nutrient_timing'
    };

    /**
     * Анализ тайминга приёмов пищи и инсулиновых волн.
     * @param {Array} days
     * @param {object} profile
     * @param {object} thresholds - Adaptive thresholds
     * @returns {object}
     */
    // ⚠ THRESHOLD JUSTIFICATION (v4.3 audit):
    //   - Trigger «wave overlap»: gapMinutes < waveMinutes — heuristic.
    //     Концепт overlap корректен (Wolever 2006 «second meal effect»),
    //     но конкретный порог «полное перекрытие = плохо» — авторская оценка.
    //   - Severity: overlapPct (доля dnей с overlap) — без научной нормативы.
    //     Используется как поведенческий ориентир, не клинический критерий.
    function analyzeMealTiming(days, profile, thresholds = {}) {
        const waveHours = profile?.insulinWaveHours || 3;
        const idealGapMin = thresholds.idealMealGapMin || (waveHours * 60);
        const gaps = [];
        const waveOverlaps = [];

        for (const day of days) {
            if (!day.meals || day.meals.length < 2) continue;

            const sortedMeals = [...day.meals]
                .filter(m => m.time)
                .sort((a, b) => a.time.localeCompare(b.time));

            for (let i = 1; i < sortedMeals.length; i++) {
                const prev = sortedMeals[i - 1];
                const curr = sortedMeals[i];

                const [prevH, prevM] = prev.time.split(':').map(Number);
                const [currH, currM] = curr.time.split(':').map(Number);

                const prevMinutes = prevH * 60 + prevM;
                const currMinutes = currH * 60 + currM;
                const gapMinutes = currMinutes - prevMinutes;

                if (gapMinutes > 0) {
                    gaps.push(gapMinutes);

                    const waveMinutes = waveHours * 60;
                    if (gapMinutes < waveMinutes) {
                        waveOverlaps.push({
                            date: day.date,
                            gap: gapMinutes,
                            overlap: waveMinutes - gapMinutes,
                            overlapPct: ((waveMinutes - gapMinutes) / waveMinutes) * 100
                        });
                    }
                }
            }
        }

        const avgGap = average(gaps);
        const idealGap = idealGapMin;
        const gapScore = Math.min(100, Math.max(0, (avgGap / idealGap) * 100));

        return {
            pattern: PATTERNS.MEAL_TIMING,
            available: gaps.length > 0,
            score: Math.round(gapScore),
            avgGapMinutes: Math.round(avgGap),
            idealGapMinutes: idealGap,
            gapScore: Math.round(gapScore),
            waveOverlaps,
            overlapCount: waveOverlaps.length,
            totalMeals: days.reduce((sum, d) => sum + (d.meals?.length || 0), 0),
            confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
            insight: avgGap < idealGap * 0.7
                ? 'Следующий приём часто добавляется до завершения оценки предыдущего. Выбирайте частоту по голоду, самочувствию, медицинским ограничениям и способности соблюдать рацион.'
                : avgGap > idealGap * 1.3
                    ? 'Большие перерывы между едой — риск переедания'
                    : `Среднее между приёмами: ${Math.round(avgGap / 60)}ч ${Math.round(avgGap % 60)}мин`
        };
    }

    /**
     * Анализ перехлёста инсулиновых волн.
     * @param {Array} days
     * @param {object} profile
     * @returns {object}
     */
    function analyzeWaveOverlap(days, profile) {
        const mealTiming = analyzeMealTiming(days, profile);
        const overlaps = mealTiming.waveOverlaps;

        if (overlaps.length === 0) {
            return {
                pattern: PATTERNS.WAVE_OVERLAP,
                available: true,
                hasOverlaps: false,
                overlapCount: 0,
                avgOverlapPct: 0,
                confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
                insight: 'Все приёмы разделены интервалами длиннее расчётной длительности.',
                score: 100
            };
        }

        const avgOverlapPct = average(overlaps.map(o => o.overlapPct));
        const score = Math.max(0, 100 - avgOverlapPct);

        return {
            pattern: PATTERNS.WAVE_OVERLAP,
            available: true,
            hasOverlaps: true,
            overlapCount: overlaps.length,
            avgOverlapPct: Math.round(avgOverlapPct),
            worstOverlaps: overlaps.slice(0, 3),
            confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
            insight: `${overlaps.length} раз следующий приём был добавлен до завершения оценки предыдущего. Это описывает частоту и состав приёмов; вывод о снижении жировой массы делайте по долгосрочному тренду.`,
            score: Math.round(score)
        };
    }

    /**
     * Анализ поздних приёмов пищи.
     * @param {Array} days
     * @param {object} thresholds - Adaptive thresholds
     * @returns {object}
     */
    function analyzeLateEating(days, thresholds = {}) {
        const lateMeals = [];
        const LATE_HOUR = thresholds.lateEatingHour || 21;

        for (const day of days) {
            if (!day.meals) continue;

            for (const meal of day.meals) {
                if (!meal.time) continue;
                const hour = parseInt(meal.time.split(':')[0], 10);

                if (hour >= LATE_HOUR) {
                    lateMeals.push({
                        date: day.date,
                        time: meal.time,
                        hour
                    });
                }
            }
        }

        const totalMeals = days.reduce((sum, d) => sum + (d.meals?.length || 0), 0);
        const latePct = totalMeals > 0 ? (lateMeals.length / totalMeals) * 100 : 0;
        const score = Math.max(0, 100 - latePct * 2);

        return {
            pattern: PATTERNS.LATE_EATING,
            available: true,
            lateCount: lateMeals.length,
            totalMeals,
            latePct: Math.round(latePct),
            score: Math.round(score),
            confidence: days.length >= CONFIG.MIN_DAYS_FOR_FULL_ANALYSIS ? 0.8 : 0.5,
            insight: lateMeals.length === 0
                ? '👍 Нет поздних приёмов — отлично для сна!'
                : `${lateMeals.length} поздних приёмов (после 21:00) — может влиять на сон и вес`
        };
    }

    /**
     * 🌅 Циркадный анализ — распределение калорий по времени суток.
     * @param {Array} days
     * @param {object} pIndex
     * @returns {object}
     */
    function analyzeCircadianTiming(days, pIndex) {
        const timeWeights = {
            morning: { from: 6, to: 12, weight: 1.1, label: 'Утро (6-12)' },
            afternoon: { from: 12, to: 18, weight: 1.0, label: 'День (12-18)' },
            evening: { from: 18, to: 22, weight: 0.9, label: 'Вечер (18-22)' },
            night: { from: 22, to: 6, weight: 0.7, label: 'Ночь (22-6)' }
        };

        const dailyData = [];

        for (const day of days) {
            if (!day.meals || day.meals.length === 0) continue;

            const periods = { morning: 0, afternoon: 0, evening: 0, night: 0 };
            let totalKcal = 0;

            for (const meal of day.meals) {
                if (!meal.time || !meal.items) continue;
                const hour = parseInt(meal.time.split(':')[0], 10);

                let mealKcal = 0;
                for (const item of meal.items) {
                    mealKcal += calculateItemKcal(item, pIndex);
                }

                totalKcal += mealKcal;

                if (hour >= 6 && hour < 12) periods.morning += mealKcal;
                else if (hour >= 12 && hour < 18) periods.afternoon += mealKcal;
                else if (hour >= 18 && hour < 22) periods.evening += mealKcal;
                else periods.night += mealKcal;
            }

            if (totalKcal > 0) {
                let weightedSum = 0;
                for (const [period, kcal] of Object.entries(periods)) {
                    weightedSum += (kcal / totalKcal) * timeWeights[period].weight;
                }
                const dayScore = weightedSum * 100;

                dailyData.push({
                    date: day.date,
                    periods,
                    totalKcal,
                    score: dayScore,
                    morningPct: Math.round((periods.morning / totalKcal) * 100),
                    eveningPct: Math.round(((periods.evening + periods.night) / totalKcal) * 100)
                });
            }
        }

        if (dailyData.length < 3) {
            return {
                pattern: PATTERNS.CIRCADIAN,
                available: false,
                insight: 'Недостаточно данных для циркадного анализа'
            };
        }

        const avgScore = average(dailyData.map(d => d.score));
        const avgMorningPct = average(dailyData.map(d => d.morningPct));
        const avgEveningPct = average(dailyData.map(d => d.eveningPct));

        let insight;
        if (avgScore >= 95) {
            insight = '🌅 Идеальное распределение! Основные калории до обеда';
        } else if (avgScore >= 85) {
            insight = `☀️ Хороший тайминг: ${Math.round(avgMorningPct)}% калорий утром`;
        } else if (avgEveningPct > 40) {
            insight = `🌙 ${Math.round(avgEveningPct)}% калорий вечером — перенеси часть на утро`;
        } else {
            insight = 'Распределение калорий по дню умеренное';
        }

        return {
            pattern: PATTERNS.CIRCADIAN,
            available: true,
            score: Math.round(avgScore),
            avgMorningPct: Math.round(avgMorningPct),
            avgEveningPct: Math.round(avgEveningPct),
            dataPoints: dailyData.length,
            confidence: dailyData.length >= 7 ? 0.8 : 0.5,
            insight,
            formula: SCIENCE_INFO?.CIRCADIAN?.formula || 'circadian score',
            debug: {
                timeWeights,
                dailyData: dailyData.slice(0, 3),
                source: SCIENCE_INFO?.CIRCADIAN?.source || 'Panda, 2016'
            }
        };
    }

    /**
     * 🥩 Тайминг нутриентов — когда съедены белок/углеводы/жиры.
     * @param {Array} days
     * @param {object} pIndex
     * @param {object} _profile
     * @returns {object}
     */
    function analyzeNutrientTiming(days, pIndex, _profile, thresholds = {}) {
        const dailyData = [];
        const MIN_MORNING_PROTEIN = thresholds.morningProteinG || 20;
        const OPT_MORNING_PROTEIN = (thresholds.morningProteinG || 20) * 1.5;

        for (const day of days) {
            if (!day.meals || day.meals.length === 0) continue;

            let morningProtein = 0, eveningProtein = 0;
            let postWorkoutCarbs = 0;
            let eveningFat = 0, totalFat = 0;

            const trainingHour = day.trainings?.[0]?.time
                ? parseInt(day.trainings[0].time.split(':')[0], 10)
                : null;

            for (const meal of day.meals) {
                if (!meal.time || !meal.items) continue;
                const hour = parseInt(meal.time.split(':')[0], 10);

                let mealProtein = 0, mealCarbs = 0, mealFat = 0;
                for (const item of meal.items) {
                    const prod = pIndex?.byId?.get?.(String(item.product_id || item.productId || item.id)?.toLowerCase());
                    if (prod && item.grams) {
                        mealProtein += (prod.protein100 || 0) * item.grams / 100;
                        mealCarbs += ((prod.simple100 || 0) + (prod.complex100 || 0)) * item.grams / 100;
                        mealFat += ((prod.badFat100 || 0) + (prod.goodFat100 || 0)) * item.grams / 100;
                    }
                }

                if (hour >= 6 && hour < 12) morningProtein += mealProtein;
                if (hour >= 18) eveningProtein += mealProtein;
                if (hour >= 18) eveningFat += mealFat;

                if (trainingHour && hour >= trainingHour && hour <= trainingHour + 2) {
                    postWorkoutCarbs += mealCarbs;
                }

                totalFat += mealFat;
            }

            const totalProtein = morningProtein + eveningProtein;

            let score = 50;
            if (morningProtein >= MIN_MORNING_PROTEIN) score += 10;
            if (morningProtein >= OPT_MORNING_PROTEIN) score += 5;

            if (trainingHour && postWorkoutCarbs >= 30) score += 15;

            const eveningFatPct = totalFat > 0 ? (eveningFat / totalFat) * 100 : 0;
            if (eveningFatPct < 30) score += 10;

            const proteinBalance = totalProtein > 0
                ? Math.min(morningProtein, eveningProtein) / Math.max(morningProtein, eveningProtein, 1)
                : 0;
            if (proteinBalance > 0.6) score += 10;

            dailyData.push({
                date: day.date,
                morningProtein: Math.round(morningProtein),
                postWorkoutCarbs: Math.round(postWorkoutCarbs),
                eveningFatPct: Math.round(eveningFatPct),
                score: Math.min(100, score)
            });
        }

        if (dailyData.length < 3) {
            return {
                pattern: PATTERNS.NUTRIENT_TIMING,
                available: false,
                insight: 'Недостаточно данных для анализа тайминга нутриентов'
            };
        }

        const avgScore = average(dailyData.map(d => d.score));
        const avgMorningProtein = average(dailyData.map(d => d.morningProtein));

        let insight;
        if (avgScore >= 80) {
            insight = '🎯 Отличный тайминг нутриентов! Белок утром, углеводы после трени';
        } else if (avgMorningProtein < 20) {
            insight = `⚠️ Мало белка утром (${Math.round(avgMorningProtein)}г). Добавь яйца/творог`;
        } else {
            insight = 'Тайминг нутриентов можно оптимизировать';
        }

        return {
            pattern: PATTERNS.NUTRIENT_TIMING,
            available: true,
            score: Math.round(avgScore),
            avgMorningProtein: Math.round(avgMorningProtein),
            dataPoints: dailyData.length,
            confidence: dailyData.length >= 7 ? 0.8 : 0.5,
            insight,
            formula: SCIENCE_INFO?.NUTRIENT_TIMING?.formula || 'nutrient timing score',
            debug: {
                dailyData: dailyData.slice(0, 3),
                // v4.3: fallback цитата исправлена. Arble 2009 (PMID 19730426) — мышиное
                // циркадное исследование, нерелевантно post-workout nutrient timing.
                // Корректные источники: Mamerow 2014 (PMID 24477298) для morning protein,
                // Kerksick 2017 ISSN (PMID 28919842) для post-workout carbs.
                source: SCIENCE_INFO?.NUTRIENT_TIMING?.source || 'Mamerow et al., 2014 (PMID 24477298); Kerksick et al., 2017 (ISSN)'
            }
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeMealTiming = analyzeMealTiming;
    HEYS.InsightsPI.patternModules.analyzeWaveOverlap = analyzeWaveOverlap;
    HEYS.InsightsPI.patternModules.analyzeLateEating = analyzeLateEating;
    HEYS.InsightsPI.patternModules.analyzeCircadianTiming = analyzeCircadianTiming;
    HEYS.InsightsPI.patternModules.analyzeNutrientTiming = analyzeNutrientTiming;
})(typeof window !== 'undefined' ? window : global);
