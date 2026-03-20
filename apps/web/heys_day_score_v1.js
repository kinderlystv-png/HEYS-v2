/**
 * heys_day_score_v1.js — Unified Day Score (0-100)
 *
 * ЕДИНСТВЕННЫЙ ответ на "как у меня сегодня?".
 *
 * Формула:
 *   Day Score = Factors(70%) + Subjective(15%) + Momentum(15%)
 *
 *   - Factors: 9 факторов из Status Score (kcal, protein, timing, steps,
 *     training, household, sleep, stress, water). Nutrition-факторы обогащены
 *     средним Meal Quality если приёмы есть.
 *   - Subjective: dayScore (mood+wellbeing+stress) 1-10 → бонус/штраф ±15
 *   - Momentum: Cascade CRS (0-1) → бонус ±15 (инерция хороших/плохих дней)
 *
 * Layer 1 в Day Intelligence Stack:
 *   Layer 0 — Foundation (TDEE, InsulinWave, MealQuality, Cascade CRS)
 *   Layer 1 — Day Score (этот модуль)
 *   Layer 2 — Risk Radar (Relapse + Crash → unified risk)
 *   Layer 3 — Trend Score (бывший Health Score, 7-30 дней)
 *   Layer 4 — Watchdog (EWS)
 *
 * Version: 1.0.0
 * Created: 2026-03-20
 */
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const MODULE = '[HEYS.DayScore]';

    // === WEIGHTS ===
    const W_FACTORS = 0.70;
    const W_SUBJECTIVE = 0.15;
    const W_MOMENTUM = 0.15;

    // Smoothing: max ±15 change per update (same as Status Score)
    const MAX_CHANGE = 15;

    // === HELPERS ===

    function clamp(v, lo, hi) {
        const n = Number(v);
        if (!Number.isFinite(n)) return lo;
        return Math.max(lo, Math.min(hi, n));
    }

    function round(n) { return Math.round(n) || 0; }

    /**
     * Compute average Meal Quality Score for today's meals.
     * Uses HEYS.mealScoring.getMealQualityScore if loaded.
     * Returns null if no meals or module not ready.
     */
    function getAvgMealQuality(dayData, pIndex, optimum) {
        const meals = dayData?.meals;
        if (!Array.isArray(meals) || meals.length === 0) return null;

        const getMQ = HEYS.mealScoring?.getMealQualityScore;
        if (typeof getMQ !== 'function') return null;

        let sum = 0;
        let count = 0;

        for (const meal of meals) {
            if (!meal?.items || meal.items.length === 0) continue;
            const mealType = meal.label || meal.type || 'other';
            const q = getMQ(meal, mealType, optimum || 2000, pIndex);
            if (q && typeof q.score === 'number' && Number.isFinite(q.score)) {
                sum += q.score;
                count++;
            }
        }

        return count > 0 ? round(sum / count) : null;
    }

    /**
     * Subjective modifier: dayScore 1-10 → bonus/penalty mapped to ±15 points.
     * 5 = neutral (0), 10 = +15, 1 = -15.
     */
    function subjectiveBonus(dayScore) {
        if (dayScore == null || dayScore === '') return 0;
        const ds = Number(dayScore);
        if (!Number.isFinite(ds)) return 0;
        // Linear map: 1→-15, 5→0, 10→+15
        return round(((clamp(ds, 1, 10) - 5) / 5) * 15);
    }

    /**
     * Momentum modifier: Cascade CRS (0—~1) → ±15 points.
     * 0.5 display-equivalent = neutral (0). Higher = bonus, lower = penalty.
     * Uses raw CRS (not display-mapped).
     */
    function momentumBonus(cascadeState) {
        if (!cascadeState) return 0;
        const crs = Number(cascadeState.crs);
        if (!Number.isFinite(crs)) return 0;
        // CRS range roughly 0-0.65 after ceiling. Map to ±15.
        // 0.25 ≈ neutral, 0.50+ = strong positive, 0.05- = negative
        const normalized = clamp((crs - 0.25) / 0.40, -1, 1);
        return round(normalized * 15);
    }

    /**
     * Calculate unified Day Score (0-100).
     *
     * @param {Object} opts
     * @param {Object} opts.dayData            — day object from localStorage
     * @param {Object} opts.profile            — user profile
     * @param {Object} opts.dayTot             — pre-computed day totals {kcal, prot, ...}
     * @param {Object} opts.normAbs            — absolute norms {kcal, prot, ...}
     * @param {number} [opts.waterGoal=2000]
     * @param {Object} [opts.pIndex]           — product index
     * @param {number} [opts.optimum]          — calorie target
     * @param {Object} [opts.cascadeState]     — from HEYS.CascadeCard.computeCascadeState()
     * @param {number} [opts.previousDayScore] — previous computed Day Score (for smoothing)
     * @returns {Object} { score, rawScore, factorScore, subjectiveScore, momentumScore,
     *                      statusResult, avgMealQuality, breakdown, level }
     */
    function calculateDayScore(opts = {}) {
        const {
            dayData = {},
            profile = {},
            dayTot = {},
            normAbs = {},
            waterGoal = 2000,
            pIndex = null,
            optimum = null,
            cascadeState = null,
            previousDayScore = null
        } = opts;

        // 1. Factor score via Status Score (0-100)
        let statusResult = null;
        let factorScore = 50; // neutral default

        if (HEYS.Status?.calculateStatus) {
            statusResult = HEYS.Status.calculateStatus({
                dayData,
                profile,
                dayTot,
                normAbs,
                waterGoal
            });
            factorScore = statusResult.score;
        }

        // 2. Enrich nutrition factor with Meal Quality if available
        const avgMQ = getAvgMealQuality(dayData, pIndex, optimum || normAbs?.kcal);
        if (avgMQ !== null && statusResult) {
            // Blend: original nutrition category score + meal quality average
            // nutrition category raw score from Status
            const nutCat = statusResult.categoryScores?.nutrition;
            if (nutCat && typeof nutCat.score === 'number') {
                const originalNut = nutCat.score;
                // 60/40 blend: keep Status nutrition anchoring, add MealQuality signal
                const blendedNut = round(originalNut * 0.6 + avgMQ * 0.4);
                // Adjust factorScore: replace nutrition contribution proportionally
                // nutrition weight = 35 out of 100 total weight
                const nut_weight_frac = 0.35;
                factorScore = round(
                    factorScore * (1 - nut_weight_frac) + blendedNut * nut_weight_frac
                );
            }
        }

        // 3. Subjective bonus from dayScore (±15)
        const sBonus = subjectiveBonus(dayData?.dayScore);

        // 4. Momentum bonus from Cascade CRS (±15)
        const mBonus = momentumBonus(cascadeState);

        // 5. Composite
        const rawScore = clamp(
            round(factorScore * W_FACTORS + (50 + sBonus) * W_SUBJECTIVE + (50 + mBonus) * W_MOMENTUM),
            0,
            100
        );

        // 6. Smoothing against previous value
        let finalScore = rawScore;
        if (previousDayScore !== null && Number.isFinite(Number(previousDayScore))) {
            const diff = rawScore - Number(previousDayScore);
            if (Math.abs(diff) > MAX_CHANGE) {
                finalScore = round(Number(previousDayScore) + Math.sign(diff) * MAX_CHANGE);
            }
        }
        finalScore = clamp(finalScore, 0, 100);

        // 7. Level label
        const level = getLevel(finalScore);

        console.info(`${MODULE} ✅ Day Score: ${finalScore} (raw: ${rawScore}) | factors: ${factorScore} | subjective: ${sBonus} | momentum: ${mBonus} | avgMQ: ${avgMQ ?? '—'}`);

        return {
            score: finalScore,
            rawScore,
            factorScore,
            subjectiveScore: sBonus,
            momentumScore: mBonus,
            avgMealQuality: avgMQ,
            statusResult,
            breakdown: {
                factors: { weight: W_FACTORS, score: factorScore },
                subjective: { weight: W_SUBJECTIVE, raw: dayData?.dayScore, bonus: sBonus },
                momentum: { weight: W_MOMENTUM, crs: cascadeState?.crs ?? null, bonus: mBonus }
            },
            level,
            timestamp: Date.now()
        };
    }

    /**
     * Level thresholds (same scale as Status Score for consistency).
     */
    const LEVELS = {
        excellent: { min: 85, label: 'Отличный день!', emoji: '🌟', color: '#10b981' },
        good: { min: 70, label: 'Хороший день', emoji: '✅', color: '#22c55e' },
        okay: { min: 50, label: 'Нормальный день', emoji: '👌', color: '#eab308' },
        low: { min: 30, label: 'Слабый день', emoji: '😕', color: '#f97316' },
        critical: { min: 0, label: 'Тяжёлый день', emoji: '⚠️', color: '#ef4444' }
    };

    function getLevel(score) {
        for (const [id, lvl] of Object.entries(LEVELS)) {
            if (score >= lvl.min) return { ...lvl, id };
        }
        return { ...LEVELS.critical, id: 'critical' };
    }

    // === EXPORT ===

    HEYS.DayScore = {
        calculateDayScore,
        getAvgMealQuality,
        subjectiveBonus,
        momentumBonus,
        getLevel,
        LEVELS,
        W_FACTORS,
        W_SUBJECTIVE,
        W_MOMENTUM,
        VERSION: '1.0.0'
    };

    console.info(`${MODULE} ✅ Module loaded v1.0.0 | Formula: Factors(70%) + Subjective(15%) + Momentum(15%)`);

})(typeof window !== 'undefined' ? window : global);
