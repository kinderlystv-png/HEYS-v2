/**
 * HEYS Predictive Insights — Adaptive Personalized Thresholds v2.0
 * Version: 2.0.0
 * 
 * Вычисляет персональные пороги для pattern analyzers на основе 14-21 дней данных пользователя.
 * Заменяет hardcoded константы адаптивными значениями (percentile-based + EMA smoothing).
 * 
 * v2.0 improvements:
 * - Adaptive TTL (12-72h based on behavior stability)
 * - Per-threshold confidence tracking
 * - Incremental updates (rolling window)
 * - Event-based invalidation (smart cache reset)
 * - Bayesian priors (population-informed defaults)
 * 
 * Dependencies: pi_stats.js, pi_cache.js, HEYS.dayUtils (localStorage)
 * @param global
 */

(function (global) {
    'use strict';

    const STORAGE_KEY = 'heys_adaptive_thresholds';
    const STORAGE_KEY_POPULATION = 'heys_population_priors';
    const STORAGE_KEY_ROLLING = 'heys_thresholds_rolling_stats'; // For incremental updates
    const MIN_DAYS_FULL_COMPUTE = 14;  // Полный расчет всех 7 порогов
    const MIN_DAYS_PARTIAL = 7;        // Частичный расчет (3 порога + 5 дефолтов)
    const OPTIMAL_DAYS = 21;
    const BASE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours base
    const MAX_CACHE_TTL_MS = 72 * 60 * 60 * 1000;  // 72 hours max
    const POPULATION_SAMPLE_SIZE = 1000; // Minimum users for population priors

    function trustedDayKcal(d) {
        const has = global.HEYS?.dayMealsIntegrity?.hasAnyMealLines?.(d);
        if (!has) return Number(d?.dayTot?.kcal) || 0;
        return Number(d?.savedEatenKcal) || Number(d?.dayTot?.kcal) || 0;
    }

    // Population priors (научные рекомендации + observed means)
    const POPULATION_PRIORS = {
        lateEatingHour: { mean: 21.2, std: 1.8, source: 'meta-analysis' },
        idealMealGapMin: { mean: 260, std: 45, source: 'observed' },
        giOptimal: { mean: 56, std: 8.5, source: 'glycemic-research' },
        morningProteinG: { mean: 22, std: 8.3, source: 'observed' },
        fiberTarget: { mean: 28, std: 6.2, source: 'DRI-guidelines' },
        proteinPerMealG: { mean: 28, std: 9.1, source: 'calculated' }
    };

    // Event invalidation triggers
    const INVALIDATION_EVENTS = {
        GOAL_CHANGE: { weight: 1.0, reason: 'Protein targets changed' },
        WEIGHT_DROP_5KG: { weight: 0.8, reason: 'Significant composition change' },
        TRAINING_PATTERN_SHIFT: { weight: 0.7, reason: 'Activity pattern changed' },
        DIET_PATTERN_BREAK: { weight: 0.6, reason: '3+ days anomalous eating' }
    };

    // Физиологические границы (guard rails)
    const LIMITS = {
        lateEatingHour: { min: 20, max: 24 },
        idealMealGapMin: { min: 120, max: 360 },
        giOptimal: { min: 40, max: 70 },
        morningProteinG: { min: 15, max: 50 },
        fiberTarget: { min: 20, max: 50 },
        proteinPerMealG: { min: 15, max: 60 }
    };

    /**
     * Clamp значения в физиологические границы
     * @param value
     * @param key
     */
    function clamp(value, key) {
        const limit = LIMITS[key];
        if (!limit) return value;
        return Math.max(limit.min, Math.min(limit.max, value));
    }

    /**
     * Извлечь час последнего приёма пищи из дня
     * @param day
     */
    function getLastMealHour(day) {
        if (!day.meals || day.meals.length === 0) return null;
        const lastMeal = day.meals[day.meals.length - 1];
        if (!lastMeal.time) return null;
        const [hours] = lastMeal.time.split(':').map(Number);
        return hours;
    }

    /**
     * Извлечь все inter-meal gaps в минутах
     * @param days
     */
    function extractAllGaps(days) {
        const gaps = [];
        days.forEach(day => {
            if (!day.meals || day.meals.length < 2) return;
            for (let i = 1; i < day.meals.length; i++) {
                const prevTime = day.meals[i - 1].time;
                const currTime = day.meals[i].time;
                if (!prevTime || !currTime) continue;

                const [h1, m1] = prevTime.split(':').map(Number);
                const [h2, m2] = currTime.split(':').map(Number);
                const gapMin = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (gapMin > 0 && gapMin < 720) gaps.push(gapMin); // макс 12ч
            }
        });
        return gaps;
    }

    /**
     * Вычислить дневной средний GI
     * @param day
     * @param pIndex
     */
    function computeDayAvgGI(day, pIndex) {
        if (!day.meals || !pIndex) return null;
        let totalGI = 0, totalCarbs = 0;

        day.meals.forEach(meal => {
            if (!meal.items) return;
            meal.items.forEach(item => {
                const product = pIndex.byId.get(item.product_id);
                if (!product || !product.gi || !product.carb) return;
                const carbG = (product.carb * item.grams) / 100;
                totalGI += product.gi * carbG;
                totalCarbs += carbG;
            });
        });

        return totalCarbs > 0 ? totalGI / totalCarbs : null;
    }

    /**
     * Вычислить средний белок утром (до 12:00)
     * @param days
     * @param pIndex
     */
    function extractMorningProtein(days, pIndex) {
        const values = [];
        days.forEach(day => {
            if (!day.meals || !pIndex) return;
            let morningProt = 0;

            day.meals.forEach(meal => {
                const [hours] = (meal.time || '').split(':').map(Number);
                if (hours >= 12) return;

                if (!meal.items) return;
                meal.items.forEach(item => {
                    const product = pIndex.byId.get(String(item.product_id || item.productId || item.id).toLowerCase());
                    if (!product) return;
                    const prot = Number(product.protein100 || product.prot) || 0;
                    morningProt += (prot * item.grams) / 100;
                });
            });

            if (morningProt > 0) values.push(morningProt);
        });
        return values;
    }

    /**
     * Вычислить среднее потребление клетчатки за день
     * @param days
     * @param pIndex
     */
    function extractDailyFiber(days, pIndex) {
        const values = [];
        days.forEach(day => {
            if (!day.meals || !pIndex) return;
            let fiber = 0;

            day.meals.forEach(meal => {
                if (!meal.items) return;
                meal.items.forEach(item => {
                    const product = pIndex.byId.get(String(item.product_id || item.productId || item.id).toLowerCase());
                    if (!product) return;
                    const fiberVal = Number(product.fiber100 || product.fiber) || 0;
                    fiber += (fiberVal * item.grams) / 100;
                });
            });

            if (fiber > 0) values.push(fiber);
        });
        return values;
    }

    /**
     * Проверяет, покрывает ли кэш текущий запрашиваемый период
     * @param cacheRange - диапазон дат кэша {from, to}
     * @param requestedDays - запрошенные дни
     */
    function isCurrentPeriodCovered(cacheRange, requestedDays, cachedDaysUsed) {
        if (!requestedDays?.length) return false;

        // 🆕 CASCADE fast-path: если кэш содержит >= запрошенных дней,
        // он по определению покрывает запрос (все запросы идут от "сегодня" назад)
        if (cachedDaysUsed && cachedDaysUsed >= requestedDays.length) {
            return true;
        }

        if (!cacheRange) return false;

        const cacheFrom = new Date(cacheRange.from);
        const cacheTo = new Date(cacheRange.to);

        // Если запрошенные дни входят в диапазон кэша → кэш валиден
        const requestedDates = requestedDays.map(d => d.date).filter(Boolean);
        if (requestedDates.length === 0) return false;

        const sortedDates = requestedDates.sort();
        const oldestRequested = new Date(sortedDates[0]);
        const newestRequested = new Date(sortedDates[sortedDates.length - 1]);

        return oldestRequested >= cacheFrom && newestRequested <= cacheTo;
    }

    /**
     * 🆕 v2.0: Calculate behavior variance (for Adaptive TTL)
     * Измеряет стабильность поведения пользователя по ключевым метрикам
     * @param days - последние N дней
     * @returns {number} - stabilityScore (0-1, где 1 = очень стабильный)
     */
    function calculateBehaviorStability(days) {
        if (!days || days.length < 7) return 0.3; // Default low stability

        const stats = global.HEYS.InsightsPI.stats;

        // Метрики для оценки стабильности
        // ✅ FIX: dayTot не хранится в localStorage — используем savedEatenKcal только при непустом дневнике
        const kcals = days.map((d) => trustedDayKcal(d)).filter((k) => k > 0);
        const mealCounts = days.map(d => d.meals?.length || 0).filter(c => c > 0);
        const lastMealHours = days.map(getLastMealHour).filter(Boolean);

        if (kcals.length < 5) return 0.3;

        // Coefficient of variation (CV) для каждой метрики
        const cvKcal = stats.coefficientOfVariation(kcals);
        const cvMeals = stats.coefficientOfVariation(mealCounts);
        const cvTiming = lastMealHours.length >= 3 ? stats.coefficientOfVariation(lastMealHours) : 0.15;

        // Нормализация: CV < 0.15 = stable, CV > 0.35 = volatile
        const stabilityKcal = Math.max(0, 1 - cvKcal / 0.35);
        const stabilityMeals = Math.max(0, 1 - cvMeals / 0.3);
        const stabilityTiming = Math.max(0, 1 - cvTiming / 0.2);

        // Weighted average (без protein — нет savedEatenProt в day data)
        const overallStability = (
            stabilityKcal * 0.45 +
            stabilityMeals * 0.25 +
            stabilityTiming * 0.30
        );

        console.log('[HEYS.thresholds.stability] 📊 Behavior stability:', {
            cvKcal: cvKcal.toFixed(3),
            cvMeals: cvMeals.toFixed(3),
            cvTiming: cvTiming.toFixed(3),
            kcalSamples: kcals.length,
            overallScore: overallStability.toFixed(2)
        });

        return Math.max(0, Math.min(1, overallStability));
    }

    /**
     * 🆕 v2.0: Calculate adaptive TTL based on stability
     * @param stabilityScore (0-1)
     * @returns {number} - TTL in milliseconds
     */
    function calculateAdaptiveTTL(stabilityScore) {
        // Formula: 12h (volatile) to 72h (stable)
        const ttlHours = BASE_CACHE_TTL_MS / (60 * 60 * 1000) + (stabilityScore * 60);
        const ttlMs = Math.min(ttlHours * 60 * 60 * 1000, MAX_CACHE_TTL_MS);

        console.log('[HEYS.thresholds.ttl] ⏰ Adaptive TTL:', {
            stability: stabilityScore.toFixed(2),
            ttlHours: (ttlMs / (60 * 60 * 1000)).toFixed(1),
            ttlMs
        });

        return ttlMs;
    }

    /**
     * 🆕 v2.0: Detect significant lifecycle events (for event-based invalidation)
     * @param profile - current profile
     * @param cachedMeta - metadata from cached thresholds
     * @param recentDays - последние 7 дней
     * @returns {object|null} - {event, reason} или null
     */
    function detectSignificantChange(profile, cachedMeta, recentDays) {
        if (!cachedMeta || !cachedMeta.snapshot) return null;
        if (!profile) return null; // ✅ Защита от undefined profile

        const snapshot = cachedMeta.snapshot;
        const events = [];

        // 1. Goal change (deficit → bulk или наоборот)
        if (profile.goal && snapshot.goal && profile.goal !== snapshot.goal) {
            events.push({
                type: 'GOAL_CHANGE',
                weight: INVALIDATION_EVENTS.GOAL_CHANGE.weight,
                reason: `Goal changed: ${snapshot.goal} → ${profile.goal}`
            });
        }

        // 2. Weight drop >= 5kg
        if (profile.weight && snapshot.weight) {
            const weightDelta = snapshot.weight - profile.weight;
            if (Math.abs(weightDelta) >= 5) {
                events.push({
                    type: 'WEIGHT_DROP_5KG',
                    weight: INVALIDATION_EVENTS.WEIGHT_DROP_5KG.weight,
                    reason: `Weight change: ${weightDelta > 0 ? '-' : '+'}${Math.abs(weightDelta).toFixed(1)}kg`
                });
            }
        }

        // 3. Diet pattern break (3+ consecutive anomalous days)
        if (recentDays && recentDays.length >= 3) {
            // ✅ FIX: используем savedEatenKcal (dayTot нет в raw localStorage data)
            const daysWithKcal = recentDays.filter((d) => trustedDayKcal(d) > 0);
            // ✅ FIX v2: snapshot.avgKcal >= 200 — защита от stale cache с нулевыми/мизерными значениями
            // (старый баг записывал avgKcal≈0 из-за dayTot?.kcal)
            if (daysWithKcal.length >= 3 && snapshot.avgKcal >= 200) {
                const avgKcal = daysWithKcal.reduce((sum, d) => sum + trustedDayKcal(d), 0) / daysWithKcal.length;
                const snapshotKcal = snapshot.avgKcal;

                const kcalDeviation = Math.abs((avgKcal - snapshotKcal) / snapshotKcal);
                if (kcalDeviation > 0.3) { // 30%+ deviation
                    events.push({
                        type: 'DIET_PATTERN_BREAK',
                        weight: INVALIDATION_EVENTS.DIET_PATTERN_BREAK.weight,
                        reason: `Calorie pattern changed ${(kcalDeviation * 100).toFixed(0)}%`
                    });
                }
            }
        }

        // Возвращаем самый значимый event
        if (events.length === 0) return null;
        events.sort((a, b) => b.weight - a.weight);

        console.log('[HEYS.thresholds.events] 🚨 Significant change detected:', events[0]);
        return events[0];
    }

    /**
     * 🆕 v2.0: Bayesian blend of prior + observed data
     * Используется для новых users (0-13 дней) чтобы дать reasonable defaults
     * @param userDays - количество дней данных пользователя
     * @param observedValue - значение из данных пользователя (может быть null)
     * @param prior - {mean, std} из POPULATION_PRIORS
     * @returns {number} - blended value
     */
    function bayesianBlend(userDays, observedValue, prior) {
        if (!prior) return observedValue;

        // Weight: 0 (all prior) → 1 (all observed) по мере накопления данных
        // Используем sigmoid для smooth transition
        const rawWeight = Math.min(userDays / 14, 1); // 14 дней = full observed
        const weight = 1 / (1 + Math.exp(-10 * (rawWeight - 0.5))); // Sigmoid smoothing

        if (observedValue === null || observedValue === undefined) {
            return prior.mean; // No data yet, use prior
        }

        const blended = (1 - weight) * prior.mean + weight * observedValue;

        console.log('[HEYS.thresholds.bayesian] 🎲 Blend:', {
            userDays,
            weight: weight.toFixed(2),
            prior: prior.mean,
            observed: observedValue,
            blended: blended.toFixed(1)
        });

        return blended;
    }

    /**
     * 🆕 v2.0: Calculate per-threshold confidence
     * Возвращает confidence для каждого порога на основе variance и sample size
     * @param values - массив наблюдений
     * @param sampleSize - количество дней
     * @returns {object} - {confidence, variance, reliable}
     */
    function calculateThresholdConfidence(values, sampleSize) {
        if (!values || values.length < 3) {
            return { confidence: 0, variance: 999, reliable: false };
        }

        const stats = global.HEYS.InsightsPI.stats;
        const cv = stats.coefficientOfVariation(values);

        // Confidence formula: учитывает sample size и stability
        // High CV = low confidence, Large N = high confidence
        const sampleFactor = Math.min(sampleSize / OPTIMAL_DAYS, 1);
        const stabilityFactor = Math.max(0, 1 - cv / 0.4); // CV > 0.4 = unreliable

        const confidence = sampleFactor * stabilityFactor;
        const reliable = confidence > 0.7;

        return {
            confidence: Math.max(0, Math.min(1, confidence)),
            variance: cv,
            reliable,
            samples: values.length
        };
    }

    /**
     * Дефолтные пороги (универсальные, не персонализированные)
     * 🆕 v2.0: теперь использует Bayesian priors из population data
     * @param profile
     */
    function getDefaultThresholds(profile) {
        const goal = profile?.goal || 'maintenance';
        const weight = profile?.weight || 70;
        const coefficients = { cut: 1.8, maintenance: 1.4, bulk: 1.6 };
        const dailyProtein = weight * (coefficients[goal] || 1.4);

        // Use population priors instead of hardcoded values
        const thresholds = {
            lateEatingHour: POPULATION_PRIORS.lateEatingHour.mean,
            idealMealGapMin: POPULATION_PRIORS.idealMealGapMin.mean,
            giOptimal: POPULATION_PRIORS.giOptimal.mean,
            morningProteinG: POPULATION_PRIORS.morningProteinG.mean,
            fiberTarget: POPULATION_PRIORS.fiberTarget.mean,
            proteinPerMealG: Math.round(dailyProtein / 4),
            chronotype: 'neutral',
            circadianShift: 0
        };

        // 🆕 v2.0: Per-threshold confidence (all defaults have low confidence)
        const thresholdsWithConfidence = {};
        Object.keys(thresholds).forEach(key => {
            thresholdsWithConfidence[key] = {
                value: thresholds[key],
                confidence: 0.3, // Default priors have moderate confidence
                variance: POPULATION_PRIORS[key]?.std || 1,
                reliable: false,
                source: 'population_prior'
            };
        });

        return {
            thresholds,
            thresholdsWithConfidence,
            confidence: 0,
            daysUsed: 0,
            meta: {
                computedAt: new Date().toISOString(),
                default: true,
                version: '2.0.0'
            }
        };
    }

    /**
     * Вычислить частичные пороги для 7-13 дней
     * 🆕 v2.0: теперь использует Bayesian blend и per-threshold confidence
     * @param days
     * @param profile
     * @param pIndex
     */
    function computePartialThresholds(days, profile, pIndex) {
        const stats = global.HEYS.InsightsPI.stats;
        const thresholds = {};
        const thresholdsWithConfidence = {};
        let computedCount = 0;

        console.log('[HEYS.thresholds.partial] ⚠️ Partial computation:', {
            daysUsed: days.length,
            hasPIndex: !!pIndex
        });

        // 1. lateEatingHour — работает на любых данных
        const lateHours = days.map(d => getLastMealHour(d)).filter(h => h !== null);
        if (lateHours.length > 0) {
            const p90 = stats.calculatePercentile(lateHours, 90);
            const blended = bayesianBlend(days.length, p90, POPULATION_PRIORS.lateEatingHour);
            thresholds.lateEatingHour = Math.round(clamp(blended, 'lateEatingHour'));

            const conf = calculateThresholdConfidence(lateHours, days.length);
            thresholdsWithConfidence.lateEatingHour = {
                value: thresholds.lateEatingHour,
                ...conf,
                source: 'bayesian_blend'
            };
            computedCount++;
        }

        // 2. idealMealGapMin — работает на любых данных
        const gaps = extractAllGaps(days);
        if (gaps.length > 0) {
            const median = stats.calculatePercentile(gaps, 50);
            const blended = bayesianBlend(days.length, median, POPULATION_PRIORS.idealMealGapMin);
            thresholds.idealMealGapMin = Math.round(clamp(blended, 'idealMealGapMin'));

            const conf = calculateThresholdConfidence(gaps, days.length);
            thresholdsWithConfidence.idealMealGapMin = {
                value: thresholds.idealMealGapMin,
                ...conf,
                source: 'bayesian_blend'
            };
            computedCount++;
        }

        // 3. proteinPerMealG — из профиля (не требует истории)
        const goal = profile.goal || 'maintenance';
        const coefficients = { cut: 1.8, maintenance: 1.4, bulk: 1.6 };
        const dailyProtein = profile.weight * (coefficients[goal] || 1.4);
        const avgMeals = days.reduce((sum, d) => sum + (d.meals?.length || 0), 0) / days.length;
        thresholds.proteinPerMealG = Math.round(clamp(dailyProtein / (avgMeals || 4), 'proteinPerMealG'));

        thresholdsWithConfidence.proteinPerMealG = {
            value: thresholds.proteinPerMealG,
            confidence: 0.8, // High confidence from profile data
            variance: 0.1,
            reliable: true,
            samples: days.length,
            source: 'calculated_from_profile'
        };
        computedCount++;

        // 4-8. Остальные — population priors (нужно 14+ дней для персонализации)
        const defaults = getDefaultThresholds(profile);
        const defaultKeys = ['giOptimal', 'morningProteinG', 'fiberTarget', 'chronotype', 'circadianShift'];

        defaultKeys.forEach(key => {
            if (!thresholds[key]) {
                thresholds[key] = defaults.thresholds[key];
                thresholdsWithConfidence[key] = defaults.thresholdsWithConfidence?.[key] || {
                    value: defaults.thresholds[key],
                    confidence: 0.3,
                    variance: 1,
                    reliable: false,
                    source: 'population_prior'
                };
            }
        });

        const confidence = computedCount / 8; // 3/8 = 0.375

        console.log('[HEYS.thresholds.partial] ✅ Result:', {
            computed: computedCount,
            defaults: 8 - computedCount,
            confidence: confidence.toFixed(2)
        });

        // dateRange для кэша (oldest to newest)
        const dates = days.map(d => d.date).filter(Boolean).sort();
        const dateRange = dates.length > 0 ? {
            from: dates[0],
            to: dates[dates.length - 1]
        } : null;

        // Profile snapshot для event detection (используем savedEatenKcal)
        const daysWithMeals = days.filter((d) => trustedDayKcal(d) > 0);
        const avgKcal = daysWithMeals.length > 0
            ? daysWithMeals.reduce((sum, d) => sum + trustedDayKcal(d), 0) / daysWithMeals.length
            : 0;

        return {
            thresholds,
            thresholdsWithConfidence,
            confidence,
            daysUsed: days.length,
            meta: {
                computedAt: new Date().toISOString(),
                partial: true,
                dateRange,
                snapshot: {
                    goal: profile?.goal,
                    weight: profile?.weight,
                    avgKcal: Math.round(avgKcal)
                },
                thresholdsComputed: computedCount,
                thresholdsDefault: 8 - computedCount,
                version: '2.0.0'
            }
        };
    }

    /**
     * Определить хронотип из времени первого и последнего приёма
     * @param days
     */
    function detectChronotype(days) {
        const firstMealHours = [];
        const lastMealHours = [];

        days.forEach(day => {
            if (!day.meals || day.meals.length === 0) return;
            const first = day.meals[0].time;
            const last = day.meals[day.meals.length - 1].time;

            if (first) {
                const [h] = first.split(':').map(Number);
                firstMealHours.push(h);
            }
            if (last) {
                const [h] = last.split(':').map(Number);
                lastMealHours.push(h);
            }
        });

        if (firstMealHours.length === 0) return 'neutral';

        const stats = global.HEYS.InsightsPI.stats;
        const avgFirst = stats.average(firstMealHours);
        const avgLast = stats.average(lastMealHours);

        // Жаворонок: просыпается до 7, последний приём до 21
        if (avgFirst < 7 && avgLast < 21) return 'lark';
        // Сова: просыпается после 9, последний приём после 22
        if (avgFirst > 9 && avgLast > 22) return 'owl';
        return 'neutral';
    }

    /**
     * Основная функция вычисления адаптивных порогов
     * 🆕 v2.0: теперь с per-threshold confidence tracking
     * @param days
     * @param profile
     * @param pIndex
     */
    function computeAdaptiveThresholds(days, profile, pIndex) {
        console.group('[HEYS.thresholds.compute] 🔬 Starting computation v2.0');
        console.log('Input:', {
            daysCount: days?.length,
            profileWeight: profile?.weight,
            hasPIndex: !!pIndex
        });

        const N = days.length;

        // Недостаточно данных — возвращаем пустой объект (fallback на дефолты)
        if (N < MIN_DAYS_FULL_COMPUTE) {
            console.warn('⚠️ Insufficient data:', {
                daysCount: N,
                minRequired: MIN_DAYS_FULL_COMPUTE
            });
            console.groupEnd();
            return {
                confidence: 0,
                daysUsed: N,
                thresholds: {},
                thresholdsWithConfidence: {},
                meta: { reason: 'insufficient_data', minRequired: MIN_DAYS_FULL_COMPUTE, version: '2.0.0' }
            };
        }

        const stats = global.HEYS.InsightsPI.stats;
        const confidence = Math.min(1, N / OPTIMAL_DAYS);
        const thresholds = {};
        const thresholdsWithConfidence = {}; // 🆕 v2.0

        // 1. Late Eating Hour — P75 последнего приёма
        const lastMealHours = days.map(getLastMealHour).filter(Boolean);
        if (lastMealHours.length >= 10) {
            const p75 = stats.calculatePercentile(lastMealHours, 75);
            thresholds.lateEatingHour = clamp(Math.round(p75), 'lateEatingHour');

            const conf = calculateThresholdConfidence(lastMealHours, N);
            thresholdsWithConfidence.lateEatingHour = {
                value: thresholds.lateEatingHour,
                ...conf,
                source: 'computed_p75'
            };

            console.log('🕐 lateEatingHour:', {
                raw: p75,
                clamped: thresholds.lateEatingHour,
                samples: lastMealHours.length,
                confidence: conf.confidence.toFixed(2)
            });
        }

        // 2. Ideal Meal Gap — медиана gaps с EMA smoothing
        const gaps = extractAllGaps(days);
        if (gaps.length >= 10) {
            const smoothed = stats.exponentialMovingAverage(gaps, 7);
            const median = stats.calculatePercentile(smoothed, 50);
            thresholds.idealMealGapMin = clamp(Math.round(median), 'idealMealGapMin');

            const conf = calculateThresholdConfidence(gaps, N);
            thresholdsWithConfidence.idealMealGapMin = {
                value: thresholds.idealMealGapMin,
                ...conf,
                source: 'computed_median_ema'
            };

            console.log('⏱️ idealMealGapMin:', {
                raw: median,
                clamped: thresholds.idealMealGapMin,
                samples: gaps.length,
                confidence: conf.confidence.toFixed(2)
            });
        }

        // 3. GI Optimal — P25 хороших дней
        if (pIndex) {
            const avgGIs = days.map(d => computeDayAvgGI(d, pIndex)).filter(Boolean);
            if (avgGIs.length >= 10) {
                const p25 = stats.calculatePercentile(avgGIs, 25);
                thresholds.giOptimal = clamp(Math.round(p25), 'giOptimal');

                const conf = calculateThresholdConfidence(avgGIs, N);
                thresholdsWithConfidence.giOptimal = {
                    value: thresholds.giOptimal,
                    ...conf,
                    source: 'computed_p25'
                };

                console.log('📊 giOptimal:', {
                    raw: p25,
                    clamped: thresholds.giOptimal,
                    samples: avgGIs.length,
                    confidence: conf.confidence.toFixed(2)
                });
            }
        }

        // 4. Morning Protein — P75 * 0.85 (target чуть ниже лучших дней)
        if (pIndex) {
            const morningProt = extractMorningProtein(days, pIndex);
            if (morningProt.length >= 10) {
                const p75 = stats.calculatePercentile(morningProt, 75);
                thresholds.morningProteinG = clamp(Math.round(p75 * 0.85), 'morningProteinG');

                const conf = calculateThresholdConfidence(morningProt, N);
                thresholdsWithConfidence.morningProteinG = {
                    value: thresholds.morningProteinG,
                    ...conf,
                    source: 'computed_p75_adjusted'
                };

                console.log('🥩 morningProteinG:', {
                    raw: p75 * 0.85,
                    clamped: thresholds.morningProteinG,
                    samples: morningProt.length,
                    confidence: conf.confidence.toFixed(2)
                });
            }
        }

        // 5. Fiber Target — max(P75 текущего, 25г минимум)
        if (pIndex) {
            const fiberValues = extractDailyFiber(days, pIndex);
            if (fiberValues.length >= 10) {
                const p75 = stats.calculatePercentile(fiberValues, 75);
                thresholds.fiberTarget = clamp(Math.max(p75, 25), 'fiberTarget');

                const conf = calculateThresholdConfidence(fiberValues, N);
                thresholdsWithConfidence.fiberTarget = {
                    value: thresholds.fiberTarget,
                    ...conf,
                    source: 'computed_p75_floor'
                };

                console.log('🌾 fiberTarget:', {
                    raw: p75,
                    withMin: Math.max(p75, 25),
                    clamped: thresholds.fiberTarget,
                    samples: fiberValues.length,
                    confidence: conf.confidence.toFixed(2)
                });
            }
        }

        // 6. Protein Per Meal — вычисляется из веса и цели
        if (profile && profile.weight) {
            const weight = profile.weight;
            const goal = profile.goal || 'maintenance';
            const coef = goal === 'deficit' ? 1.6 : goal === 'bulk' ? 2.0 : 1.4;
            const dailyProtein = weight * coef;

            // Среднее количество приёмов пищи
            const mealsPerDay = days
                .map(d => d.meals ? d.meals.length : 0)
                .filter(n => n > 0);
            const avgMeals = mealsPerDay.length > 0 ? stats.calculatePercentile(mealsPerDay, 50) : 4;

            thresholds.proteinPerMealG = clamp(Math.round(dailyProtein / avgMeals), 'proteinPerMealG');

            thresholdsWithConfidence.proteinPerMealG = {
                value: thresholds.proteinPerMealG,
                confidence: 0.9, // High confidence from profile
                variance: 0.1,
                reliable: true,
                samples: N,
                source: 'calculated_from_profile'
            };

            console.log('💪 proteinPerMealG:', {
                weight,
                goal,
                coef,
                dailyProtein,
                avgMeals,
                perMeal: thresholds.proteinPerMealG
            });
        }

        // 7. Chronotype-based adjustments
        const chronotype = detectChronotype(days);
        thresholds.chronotype = chronotype;
        thresholdsWithConfidence.chronotype = {
            value: chronotype,
            confidence: 0.8,
            variance: 0,
            reliable: true,
            samples: N,
            source: 'computed_pattern'
        };
        console.log('🦉 chronotype:', chronotype);

        // Adjust circadian boundaries based on chronotype
        if (chronotype === 'owl') {
            thresholds.circadianShift = 2; // shift +2 hours
        } else if (chronotype === 'lark') {
            thresholds.circadianShift = -1; // shift -1 hour
        } else {
            thresholds.circadianShift = 0;
        }
        thresholdsWithConfidence.circadianShift = {
            value: thresholds.circadianShift,
            confidence: 0.7,
            variance: 0.5,
            reliable: true,
            samples: N,
            source: 'derived_from_chronotype'
        };

        console.log('✅ Final result:', {
            thresholds,
            confidence,
            daysUsed: N,
            thresholdCount: Object.keys(thresholds).length,
            reliableCount: Object.values(thresholdsWithConfidence).filter(t => t.reliable).length
        });
        console.groupEnd();

        // Формируем dateRange для кэша (oldest to newest)
        const dates = days.map(d => d.date).filter(Boolean).sort();
        const dateRange = dates.length > 0 ? {
            from: dates[0],
            to: dates[dates.length - 1]
        } : null;

        // 🆕 v2.0: Profile snapshot для event detection
        // ✅ FIX: используем savedEatenKcal (dayTot не хранится в localStorage raw data)
        const daysWithMeals = days.filter((d) => trustedDayKcal(d) > 0);
        const avgKcal = daysWithMeals.length > 0
            ? daysWithMeals.reduce((sum, d) => sum + trustedDayKcal(d), 0) / daysWithMeals.length
            : 0;
        const profileSnapshot = {
            goal: profile?.goal,
            weight: profile?.weight,
            avgKcal: Math.round(avgKcal)
        };

        return {
            confidence,
            daysUsed: N,
            thresholds,
            thresholdsWithConfidence, // 🆕 v2.0
            meta: {
                computedAt: new Date().toISOString(),
                dateRange,
                snapshot: profileSnapshot, // 🆕 v2.0: for event detection
                version: '2.0.0'
            }
        };
    }

    /**
     * Загрузить из localStorage или вычислить заново
     * @param days
     * @param profile
     * @param pIndex
     */
    function getAdaptiveThresholds(days, profile, pIndex) {
        const U = global.HEYS.dayUtils;
        console.log('[HEYS.thresholds] 🔍 getAdaptiveThresholds called:', {
            daysCount: days?.length || 0,
            profileId: profile?.id,
            profileWeight: profile?.weight,
            profileGoal: profile?.goal,
            hasPIndex: !!pIndex,
            daysIsArray: Array.isArray(days),
            profileKeys: profile ? Object.keys(profile).slice(0, 10) : [],
            pIndexSize: pIndex?.byId?.size || 0,
            hasU: !!U,
            version: '2.0.0'
        });

        // 🎯 v2.0: CACHE-FIRST STRATEGY + ADAPTIVE TTL + EVENT INVALIDATION
        if (U) {
            const cached = U.lsGet(STORAGE_KEY);
            if (cached?.meta) {
                const age = Date.now() - new Date(cached.meta.computedAt).getTime();
                const covered = isCurrentPeriodCovered(cached.meta.dateRange, days, cached.daysUsed);

                // 🆕 v2.0: Calculate adaptive TTL instead of fixed CACHE_TTL_MS
                const stability = calculateBehaviorStability(days);
                const adaptiveTTL = calculateAdaptiveTTL(stability);

                // 🆕 v2.0: Check for significant changes (event-based invalidation)
                const recentDays = days.slice(-7); // Last 7 days for change detection
                const significantChange = detectSignificantChange(profile, cached.meta, recentDays);

                if (significantChange) {
                    console.log('[HEYS.thresholds] 🚨 Event-based invalidation triggered:', {
                        event: significantChange.type,
                        reason: significantChange.reason,
                        weight: significantChange.weight
                    });
                    // Invalidate cache, will compute from scratch
                } else if (age < adaptiveTTL && covered) {
                    console.log(`[HEYS.thresholds] ♻️ Using cached (from ${cached.daysUsed}d) for ${days.length}d request:`, {
                        cacheAge: Math.round(age / 1000 / 60) + 'min',
                        adaptiveTTL: Math.round(adaptiveTTL / 1000 / 60) + 'min',
                        stability: stability.toFixed(2),
                        cacheRange: cached.meta.dateRange,
                        confidence: cached.confidence,
                        thresholds: Object.keys(cached.thresholds).length
                    });

                    // 🆕 v2.1: Apply phenotype multipliers to cached thresholds
                    let result = cached;
                    if (profile?.phenotype && global.HEYS.InsightsPI?.phenotype?.applyMultipliers) {
                        const baseThresholds = { ...cached.thresholds };
                        const adjustedThresholds = global.HEYS.InsightsPI.phenotype.applyMultipliers(
                            baseThresholds,
                            profile.phenotype
                        );
                        result = { ...cached, thresholds: adjustedThresholds, phenotypeApplied: true };
                        console.log('[HEYS.thresholds] 🧬 Applied phenotype multipliers to cache:', {
                            phenotype: profile.phenotype
                        });
                    }

                    return result;
                } else {
                    console.log('[HEYS.thresholds] 🔄 Cache miss:', {
                        age: Math.round(age / 1000 / 60) + 'min',
                        adaptiveTTL: Math.round(adaptiveTTL / 1000 / 60) + 'min',
                        stability: stability.toFixed(2),
                        covered,
                        cachedDays: cached.daysUsed,
                        requestedDays: days.length,
                        reason: age >= adaptiveTTL ? 'expired' : 'not_covered'
                    });

                    // 🚀 v5.1: Stale-While-Revalidate (SWR)
                    // Если есть старый кэш, мгновенно возвращаем его, а пересчёт запускаем в фоне
                    if (cached && Object.keys(cached.thresholds || {}).length > 0) {
                        console.log('[HEYS.thresholds] ⚡ SWR: Returning stale cache immediately, computing in background');

                        // Запускаем фоновый пересчёт
                        setTimeout(() => {
                            try {
                                console.log('[HEYS.thresholds] ⚡ SWR: Background compute started');
                                const fresh = _computeAndCache(days, profile, pIndex, U);
                                // Диспатчим событие, чтобы UI (MealRecommenderCard) обновился
                                if (typeof window !== 'undefined' && window.dispatchEvent) {
                                    window.dispatchEvent(new CustomEvent('heysThresholdsUpdated', { detail: fresh }));
                                }
                            } catch (e) {
                                console.error('[HEYS.thresholds] ⚡ SWR: Background compute failed', e);
                            }
                        }, 0);

                        // Возвращаем stale данные (с применением фенотипа если нужно)
                        let result = cached;
                        if (profile?.phenotype && global.HEYS.InsightsPI?.phenotype?.applyMultipliers) {
                            const baseThresholds = { ...cached.thresholds };
                            const adjustedThresholds = global.HEYS.InsightsPI.phenotype.applyMultipliers(
                                baseThresholds,
                                profile.phenotype
                            );
                            result = { ...cached, thresholds: adjustedThresholds, phenotypeApplied: true };
                        }
                        return result;
                    }
                }
            }
        }

        // Валидация входных данных.
        // Dedup: getAdaptiveThresholds вызывается ~100+ раз за boot (React
        // re-renders с разными deps до того как days/profile полные). Без
        // дедупа консоль завалена одинаковыми сообщениями. Один раз сообщить
        // достаточно — состояние не меняется между близкими вызовами.
        if (!getAdaptiveThresholds._warnedDedup) {
            getAdaptiveThresholds._warnedDedup = new Set();
        }
        const _warnOnce = (key, level, msg) => {
            if (getAdaptiveThresholds._warnedDedup.has(key)) return;
            getAdaptiveThresholds._warnedDedup.add(key);
            (level === 'info' ? console.info : console.warn)(msg);
        };

        if (!U) {
            _warnOnce('missing-U', 'warn', '[HEYS.thresholds] ⚠️ Missing HEYS.dayUtils utility');
            return getDefaultThresholds(profile);
        }

        if (!days || !Array.isArray(days) || days.length === 0) {
            _warnOnce('missing-days', 'warn', '[HEYS.thresholds] ⚠️ Missing or empty days array');
            return getDefaultThresholds(profile);
        }

        if (!profile) {
            _warnOnce('missing-profile', 'warn', '[HEYS.thresholds] ⚠️ Missing profile — continue with partial profile (proteinPerMeal may be defaulted)');
            profile = {};
        }

        // Weight/goal не обязательны: без них считаем остальные пороги,
        // а proteinPerMealG будет рассчитан через fallback defaults.
        // Эмодзи ℹ️ — это info-уровень по смыслу, не warning.
        if (!profile.weight && !profile.goal) {
            _warnOnce('no-weight-goal', 'info', '[HEYS.thresholds] ℹ️ Profile has no weight/goal — computing thresholds without profile-based protein target');
        }

        // pIndex не критичен, но без него несколько порогов не посчитаются
        if (!pIndex) {
            _warnOnce('missing-pIndex', 'info', '[HEYS.thresholds] ℹ️ Missing pIndex (some thresholds will be skipped)');
        }

        return _computeAndCache(days, profile, pIndex, U);
    }

    /**
     * Внутренняя функция для вычисления и кэширования (используется синхронно и в SWR)
     */
    function _computeAndCache(days, profile, pIndex, U) {
        // 🔬 Вычислить на основе доступных данных (3-tier cascade)
        let result;

        if (days.length >= MIN_DAYS_FULL_COMPUTE) {
            // Tier 1: Полный расчет (14-30 дней) → 5-8 порогов, confidence=1.0
            const computed = computeAdaptiveThresholds(days, profile, pIndex);
            console.log('[HEYS.thresholds] ✨ Computed FULL thresholds:', {
                thresholds: computed.thresholds,
                thresholdsWithConfidence: Object.keys(computed.thresholdsWithConfidence || {}).length,
                confidence: computed.confidence,
                daysUsed: computed.daysUsed
            });

            // Сохранить в localStorage (only if changed — avoids scroll-cascade)
            if (computed.confidence > 0) {
                const existingForDiff = U.lsGet(STORAGE_KEY);
                const thresholdsChanged = !existingForDiff
                    || existingForDiff.daysUsed !== computed.daysUsed
                    || existingForDiff.confidence !== computed.confidence
                    || JSON.stringify(existingForDiff.thresholds) !== JSON.stringify(computed.thresholds);
                if (thresholdsChanged) {
                    U.lsSet(STORAGE_KEY, computed);
                    console.info(
                        `[HEYS.thresholds] ✅ Computed ${Object.keys(computed.thresholds).length} thresholds ` +
                        `(${computed.daysUsed}d, conf=${computed.confidence.toFixed(2)}, version=2.0.0)`
                    );
                }
            }

            result = computed;
        }
        else if (days.length >= MIN_DAYS_PARTIAL) {
            // Tier 2: Частичный расчет (7-13 дней) → 3 порога + 5 Bayesian, confidence=0.375
            console.log('[HEYS.thresholds] ⚠️ Partial compute mode:', { days: days.length });
            const partial = computePartialThresholds(days, profile, pIndex);

            // ✅ FIX: Кэшируем partial — но НЕ затираем более качественный кэш (full > partial)
            if (partial.confidence > 0 && U) {
                const existingCache = U.lsGet(STORAGE_KEY);
                const existingDays = existingCache?.daysUsed || 0;
                const existingThresholds = Object.keys(existingCache?.thresholds || {}).length;
                const partialThresholds = Object.keys(partial.thresholds || {}).length;
                // Перезаписываем только если partial лучше или кэш пуст/хуже
                if (!existingCache || existingDays < partial.daysUsed ||
                    (existingDays === partial.daysUsed && existingThresholds <= partialThresholds)) {
                    U.lsSet(STORAGE_KEY, partial);
                }
            }

            result = partial;
        }
        else {
            // Tier 3: Дефолтные пороги (<7 дней) → Bayesian priors, confidence=0
            console.log('[HEYS.thresholds] 🔧 Using defaults (Bayesian priors):', { days: days.length });
            result = getDefaultThresholds(profile);
        }

        // 🆕 v2.1: Apply phenotype multipliers if phenotype is defined
        if (profile?.phenotype && global.HEYS.InsightsPI?.phenotype?.applyMultipliers) {
            const baseThresholds = { ...result.thresholds };
            const adjustedThresholds = global.HEYS.InsightsPI.phenotype.applyMultipliers(
                baseThresholds,
                profile.phenotype
            );

            console.log('[HEYS.thresholds] 🧬 Applied phenotype multipliers:', {
                phenotype: profile.phenotype,
                before: Object.keys(baseThresholds).length,
                after: Object.keys(adjustedThresholds).length,
                changed: Object.keys(adjustedThresholds).filter(k =>
                    adjustedThresholds[k] !== baseThresholds[k]
                ).length
            });

            result.thresholds = adjustedThresholds;
            result.phenotypeApplied = true;
        }

        return result;
    }

    /**
     * Invalidate cache (при добавлении нового дня или по запросу)
     * 🆕 v2.0: теперь можно вызывать вручную при profile changes
     */
    function invalidateCache() {
        const U = global.HEYS.dayUtils;
        if (U) {
            U.lsSet(STORAGE_KEY, null);
            console.log('[HEYS.thresholds] 🗑️ Cache invalidated manually');
        }
    }

    // Export
    global.HEYS = global.HEYS || {};
    global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};
    global.HEYS.InsightsPI.thresholds = {
        compute: computeAdaptiveThresholds,
        get: getAdaptiveThresholds,
        invalidate: invalidateCache,
        version: '2.0.0' // 🆕 Updated from 1.0.0
    };

})(window);
