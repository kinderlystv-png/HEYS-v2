/**
 * heys_widgets_data_crash_risk_v1.js
 * Data Provider для виджета «Динамика веса» (Weight Progress)
 * Version: 2.0.0
 * Updated: 2026-03-20
 *
 * Считает направленный темп изменения веса через линейную регрессию.
 * Классифицирует зону прогресса: stagnation / optimal / fast / too_fast / warning / danger / gaining / stable.
 * Добавляет: totalDeltaKg, goal ETA, dataCompleteness, signed pctPerWeek/slopePerWeek.
 */
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.Widgets = HEYS.Widgets || {};
    HEYS.Widgets.DataProviders = HEYS.Widgets.DataProviders || {};

    // ============================================================================
    // CONSTANTS
    // ============================================================================

    const ZONE_THRESHOLDS = {
        STAGNATION: 0.2,  // < 0.2%/нед потери = стагнация
        OPTIMAL_MAX: 1.0,  // 0.2–1.0%/нед = оптимально (рекоменд. ВОЗ / клин. диетология)
        FAST_MAX: 2.0,  // 1.0–2.0%/нед = быстро, но допустимо
        TOO_FAST_MAX: 5.0,  // 2.0–5.0%/нед = слишком быстро (риск потери мышц)
        WARNING_MAX: 7.0,  // 5.0–7.0%/нед = предупреждение
        // > 7.0%/нед = критично
        GAINING_FAST: 0.5,  // набор > 0.5%/нед = быстро
        MOVEMENT_MIN: 0.15, // ниже этого — считаем stable
    };

    // Reliability thresholds — below these the regression is too noisy or thin
    // to trust, and we override the zone classification to 'noisy' instead of
    // surfacing a misleading 'danger'/'too_fast' from a low-quality fit.
    const QUALITY_THRESHOLDS = {
        MIN_R2: 0.3,              // < 0.3 = регрессия плохо описывает данные
        MIN_COMPLETENESS: 0.5,    // < 50% дней с замером веса
    };

    const ZONE_META = {
        stagnation: { label: 'Нет прогресса', color: '#f59e0b', light: '#fef3c7', emoji: '⏸' },
        optimal: { label: 'Оптимально', color: '#10b981', light: '#d1fae5', emoji: '✅' },
        fast: { label: 'Быстро', color: '#3b82f6', light: '#dbeafe', emoji: '⚡' },
        too_fast: { label: 'Слишком быстро', color: '#f97316', light: '#ffedd5', emoji: '⚠️' },
        warning: { label: 'Предупреждение', color: '#ef4444', light: '#fee2e2', emoji: '🔴' },
        danger: { label: 'Критично', color: '#b91c1c', light: '#fee2e2', emoji: '🚨' },
        stable: { label: 'Стабильный вес', color: '#64748b', light: '#f1f5f9', emoji: '→' },
        gaining: { label: 'Набор веса', color: '#8b5cf6', light: '#ede9fe', emoji: '↑' },
        gaining_fast: { label: 'Быстрый набор', color: '#f97316', light: '#ffedd5', emoji: '⚡↑' },
        noisy: { label: 'Данные нестабильны', color: '#64748b', light: '#f1f5f9', emoji: '〰' },
    };

    const ZONE_HINT = {
        stagnation: 'Вес почти не меняется. Возможно, стоит скорректировать дефицит или добавить активность.',
        optimal: 'Идеальная скорость снижения — сохраняет мышечную массу и устойчива долгосрочно.',
        fast: 'Снижение быстрее нормы. Допустимо, но стоит следить за уровнем энергии и мышцами.',
        too_fast: 'Слишком высокий темп. Риск потери мышечной массы и метаболической адаптации.',
        warning: 'Критически высокая скорость потери. Нужно срочно увеличить калораж.',
        danger: 'Опасный темп снижения. Требует немедленного внимания куратора или врача.',
        stable: 'Вес стабилен — ни потери, ни набора.',
        gaining: 'Постепенный набор веса.',
        gaining_fast: 'Быстрый набор веса. Стоит проверить калораж.',
        noisy: 'Замеров мало или они слишком разбросаны — для надёжного вывода нужны регулярные взвешивания.',
    };

    const MIN_DAYS = 7;
    const MAX_DAYS = 30;

    // ============================================================================
    // HELPERS
    // ============================================================================

    function getWeightFromDay(dayData) {
        if (!dayData) return null;
        if (dayData.weightMorning && dayData.weightMorning > 0) return dayData.weightMorning;
        return null;
    }

    function loadWeightData(days) {
        const U = HEYS.utils || {};
        // toISOString() returns UTC date; near midnight in local TZ this is the
        // previous/next day relative to what the rest of the app stores. Use
        // the project's local-date formatter to match heys_dayv2_* keys.
        const fmtDate = HEYS.dayUtils?.fmtDate || U.fmtDate || ((d) => d.toISOString().split('T')[0]);
        const result = [];
        const today = new Date();
        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = fmtDate(date);
            const dayData = U.lsGet(`heys_dayv2_${dateStr}`, null);
            const weight = getWeightFromDay(dayData);
            if (weight !== null && weight > 0) result.push({ date: dateStr, weight });
        }
        return result.reverse(); // oldest first для регрессии
    }

    function calculateLinearRegression(data) {
        if (!data || data.length < 3) return null;
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        data.forEach((point, i) => {
            sumX += i; sumY += point.weight;
            sumXY += i * point.weight; sumX2 += i * i;
        });
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        const yMean = sumY / n;
        let ssTotal = 0, ssResidual = 0;
        data.forEach((point, i) => {
            const yPred = slope * i + intercept;
            ssTotal += Math.pow(point.weight - yMean, 2);
            ssResidual += Math.pow(point.weight - yPred, 2);
        });
        const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
        return { slope, intercept, r2 };
    }

    /**
     * Классифицировать зону прогресса по направленному темпу кг/нед
     */
    function classifyZone(slopePerWeek, currentWeight) {
        if (!currentWeight || currentWeight <= 0) return 'stable';
        const pct = (slopePerWeek / currentWeight) * 100; // signed %/week
        const abs = Math.abs(pct);

        if (pct < -ZONE_THRESHOLDS.MOVEMENT_MIN) {
            // Потеря веса
            if (abs < ZONE_THRESHOLDS.STAGNATION) return 'stagnation';
            if (abs <= ZONE_THRESHOLDS.OPTIMAL_MAX) return 'optimal';
            if (abs <= ZONE_THRESHOLDS.FAST_MAX) return 'fast';
            if (abs <= ZONE_THRESHOLDS.TOO_FAST_MAX) return 'too_fast';
            if (abs <= ZONE_THRESHOLDS.WARNING_MAX) return 'warning';
            return 'danger';
        }
        if (pct > ZONE_THRESHOLDS.MOVEMENT_MIN) {
            // Набор веса
            return abs >= ZONE_THRESHOLDS.GAINING_FAST ? 'gaining_fast' : 'gaining';
        }
        return 'stable';
    }

    // ============================================================================
    // MAIN DATA PROVIDER
    // ============================================================================

    function getCrashRiskData(options = {}) {
        const _t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const days = Math.max(MIN_DAYS, Math.min(options.days || 7, MAX_DAYS));
        const U = HEYS.utils || {};
        const profile = U.lsGet('heys_profile', {});
        // profile.pIndex doesn't exist — bug pre-2026-06-01 sent 0 here, so EWS
        // couldn't resolve product calories. Match the badge's resolver (getAll).
        const pIndex = HEYS.products?.getAll?.() || [];

        try {
            const weightData = loadWeightData(days);

            if (weightData.length < 3) {
                console.info('[HEYS.widgets.weightProgress] ⚠️ Insufficient data:', weightData.length);
                return {
                    hasData: false,
                    weeklyLossPercent: 0,
                    pctPerWeek: 0,
                    slopePerWeek: 0,
                    direction: 'stable',
                    zone: 'stable',
                    zoneMeta: ZONE_META['stable'],
                    zoneHint: ZONE_HINT['stable'],
                    isWarning: false,
                    severity: 'none',
                    message: 'Недостаточно данных (минимум 3 дня с весом)',
                    ewsCount: 0,
                    ewsData: null,
                };
            }

            const regression = calculateLinearRegression(weightData);
            if (!regression) return null;

            const currentWeight = weightData[weightData.length - 1].weight;
            const firstWeight = weightData[0].weight;
            const slopePerWeek = regression.slope * 7; // kg/week, signed
            const pctPerWeek = (slopePerWeek / currentWeight) * 100; // signed %/week
            const absPct = Math.abs(pctPerWeek);

            // Реальная дельта (первый → последний замер)
            const totalDeltaKg = currentWeight - firstWeight;
            const dataCompleteness = weightData.length / days;

            // Raw zone от классификатора (по slope), затем quality-override.
            // Если r2 < 0.3 или completeness < 0.5 — регрессии нельзя верить,
            // переключаем zone в 'noisy' чтобы UI не показывал 🚨 на шумных данных.
            const rawZone = classifyZone(slopePerWeek, currentWeight);
            const qualityReasons = [];
            if (regression.r2 < QUALITY_THRESHOLDS.MIN_R2) qualityReasons.push('low_r2');
            if (dataCompleteness < QUALITY_THRESHOLDS.MIN_COMPLETENESS) qualityReasons.push('low_completeness');
            const isReliable = qualityReasons.length === 0;
            const zone = isReliable ? rawZone : 'noisy';
            const zoneMeta = ZONE_META[zone] || ZONE_META['stable'];
            const zoneHint = ZONE_HINT[zone] || '';
            const direction = slopePerWeek < -0.1 ? 'losing' : slopePerWeek > 0.1 ? 'gaining' : 'stable';
            const isAlert = zone === 'warning' || zone === 'danger' || zone === 'too_fast';
            const severity = zone === 'danger' ? 'high'
                : (zone === 'warning' || zone === 'too_fast') ? 'medium'
                    : 'none';

            // Прогресс к цели
            const goalWeight = profile?.goalWeight || null;
            const toGoalKg = goalWeight ? currentWeight - goalWeight : null;
            const estimatedDaysToGoal = (
                toGoalKg !== null &&
                toGoalKg > 0.5 &&
                direction === 'losing' &&
                Math.abs(slopePerWeek) > 0.05
            ) ? Math.round((toGoalKg / Math.abs(slopePerWeek)) * 7) : null;

            // EWS
            let ewsData = null, ewsCount = 0;
            if (HEYS.InsightsPI?.earlyWarning) {
                try {
                    let daysArray = [];
                    if (HEYS.InsightsPI.analyticsAPI?.getRecentDays) {
                        daysArray = HEYS.InsightsPI.analyticsAPI.getRecentDays(days);
                    }
                    if (daysArray?.length >= 6) {
                        ewsData = HEYS.InsightsPI.earlyWarning.detect(daysArray, profile, pIndex, { includeDetails: true });
                        ewsCount = ewsData?.count || 0;
                    }
                } catch (err) {
                    console.warn('[HEYS.widgets.weightProgress] ⚠️ EWS failed:', err);
                }
            }

            const result = {
                hasData: true,
                // Backward compat (старые поля для модалки/виджета)
                weeklyLossPercent: absPct,
                isWarning: isAlert,
                severity,
                // Новые поля
                pctPerWeek,           // signed %/week
                slopePerWeek,         // signed kg/week
                direction,            // 'losing'|'gaining'|'stable'
                zone,
                rawZone,              // классификация ДО quality-override (для диагностики)
                quality: {
                    reliable: isReliable,
                    reasons: qualityReasons,
                    r2: regression.r2,
                    completeness: dataCompleteness,
                },
                zoneMeta,
                zoneHint,
                currentWeight,
                firstWeight,
                totalDeltaKg,
                dataCompleteness,
                goalWeight,
                toGoalKg,
                estimatedDaysToGoal,
                weightData,
                regression: {
                    slope: regression.slope,
                    r2: regression.r2,
                    slopePerWeek,
                },
                ewsCount,
                ewsData,
                dataPoints: weightData.length,
                periodDays: days,
            };

            const _t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            console.info('[HEYS.widgets.weightProgress] ✅ Data computed:', {
                duration_ms: Math.round(_t1 - _t0),
                zone,
                rawZone: rawZone !== zone ? rawZone + ' (overridden→noisy)' : rawZone,
                reliable: isReliable,
                qualityReasons: qualityReasons.length ? qualityReasons : 'ok',
                pctPerWeek: pctPerWeek.toFixed(2) + '%',
                slopePerWeek: slopePerWeek.toFixed(3) + 'кг/нед',
                direction,
                totalDeltaKg: totalDeltaKg.toFixed(2) + 'кг',
                completeness: (dataCompleteness * 100).toFixed(0) + '%',
                toGoalKg: toGoalKg?.toFixed(1) ?? 'н/д',
                estimatedDaysToGoal,
                r2: regression.r2.toFixed(3),
                ewsCount,
            });

            return result;

        } catch (error) {
            console.error('[HEYS.widgets.weightProgress] ❌ Fatal error:', error);
            return null;
        }
    }

    // ============================================================================
    // EXPORT
    // ============================================================================

    HEYS.Widgets.DataProviders.crashRisk = {
        getData: getCrashRiskData,
        ZONE_THRESHOLDS,
        QUALITY_THRESHOLDS,
        ZONE_META,
        ZONE_HINT,
    };

    console.info('[HEYS.widgets.weightProgress] ✅ Data provider v2.0.0 loaded');

})(window);
