/**
 * heys_widgets_data_crash_risk_v1.js
 * Data Provider для Crash Risk виджета (детекция >5%/нед потери веса + EWS)
 * Version: 1.0.0
 * Created: 2026-02-15
 * 
 * Интеграция:
 * - Weight data: heys_day_weight_trends_v1.js
 * - EWS backend: insights/pi_early_warning.js
 * 
 * Формула риска: weeklyLossPercent = |slope × 7 / currentWeight| × 100
 * Thresholds: >5% warning (medium), >7% high severity
 */
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.Widgets = HEYS.Widgets || {};
    HEYS.Widgets.DataProviders = HEYS.Widgets.DataProviders || {};

    // ============================================================================
    // CONSTANTS
    // ============================================================================

    const THRESHOLDS = {
        WARNING: 5,      // >5% loss/week → medium severity
        HIGH: 7,         // >7% loss/week → high severity
        MIN_DAYS: 7,     // Minimum days for reliable trend
        MAX_DAYS: 14     // Maximum lookback period
    };

    const SEVERITY_LEVELS = {
        NONE: 'none',
        MEDIUM: 'medium',
        HIGH: 'high'
    };

    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Получить вес из day data с учетом retention days
     * @param {Object} dayData - данные дня
     * @returns {number|null} - вес в кг или null
     */
    function getWeightFromDay(dayData) {
        if (!dayData) return null;

        // Проверка retention day (вес может быть от предыдущего дня)
        if (dayData.weightMorning && dayData.weightMorning > 0) {
            return dayData.weightMorning;
        }

        return null;
    }

    /**
     * Загрузить weight data за N последних дней
     * @param {number} days - количество дней
     * @returns {Array<{date: string, weight: number}>}
     */
    function loadWeightData(days) {
        const U = HEYS.utils || {};
        const result = [];
        const today = new Date();

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const dayData = U.lsGet(`heys_dayv2_${dateStr}`, null);
            const weight = getWeightFromDay(dayData);

            if (weight !== null && weight > 0) {
                result.push({ date: dateStr, weight });
            }
        }

        return result.reverse(); // Oldest first для регрессии
    }

    /**
     * Linear regression для расчета slope (кг/день)
     * @param {Array<{date: string, weight: number}>} data
     * @returns {{slope: number, intercept: number, r2: number}|null}
     */
    function calculateLinearRegression(data) {
        if (!data || data.length < 3) return null;

        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        data.forEach((point, i) => {
            const x = i; // Day index
            const y = point.weight;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // R² calculation
        const yMean = sumY / n;
        let ssTotal = 0, ssResidual = 0;
        data.forEach((point, i) => {
            const yPred = slope * i + intercept;
            ssTotal += Math.pow(point.weight - yMean, 2);
            ssResidual += Math.pow(point.weight - yPred, 2);
        });
        const r2 = 1 - (ssResidual / ssTotal);

        return { slope, intercept, r2 };
    }

    /**
     * Вычислить weekly loss percentage
     * @param {number} slope - наклон кг/день (может быть отрицательным)
     * @param {number} currentWeight - текущий вес в кг
     * @returns {number} - процент потери веса за неделю (всегда положительный)
     */
    function calculateWeeklyLossPercent(slope, currentWeight) {
        if (!currentWeight || currentWeight <= 0) return 0;

        // |slope × 7 / currentWeight| × 100
        // Если slope < 0 (потеря веса), abs делает число положительным
        const weeklyLoss = Math.abs(slope * 7);
        const percent = (weeklyLoss / currentWeight) * 100;

        return percent;
    }

    /**
     * Определить severity level по проценту потери
     * @param {number} weeklyLossPercent
     * @returns {string} - 'none'|'medium'|'high'
     */
    function getSeverity(weeklyLossPercent) {
        if (weeklyLossPercent >= THRESHOLDS.HIGH) return SEVERITY_LEVELS.HIGH;
        if (weeklyLossPercent >= THRESHOLDS.WARNING) return SEVERITY_LEVELS.MEDIUM;
        return SEVERITY_LEVELS.NONE;
    }

    // ============================================================================
    // MAIN DATA PROVIDER
    // ============================================================================

    /**
     * Получить данные для Crash Risk виджета
     * @param {Object} options
     * @param {number} [options.days=7] - период для анализа (7-14)
     * @returns {Object|null}
     */
    function getCrashRiskData(options = {}) {
        const days = Math.max(THRESHOLDS.MIN_DAYS, Math.min(options.days || 7, THRESHOLDS.MAX_DAYS));
        const U = HEYS.utils || {};
        const profile = U.lsGet('heys_profile', {});
        const pIndex = profile?.pIndex || 0;

        try {
            // 1. Load weight data
            const weightData = loadWeightData(days);

            if (weightData.length < 3) {
                console.info('[HEYS.widgets.crashRisk] ⚠️ Insufficient data:', {
                    dataPoints: weightData.length,
                    minRequired: 3
                });
                return {
                    hasData: false,
                    weeklyLossPercent: 0,
                    isWarning: false,
                    severity: SEVERITY_LEVELS.NONE,
                    message: 'Недостаточно данных (минимум 3 дня с весом)',
                    ewsCount: 0,
                    ewsData: null
                };
            }

            // 2. Calculate linear regression
            const regression = calculateLinearRegression(weightData);

            if (!regression) {
                console.warn('[HEYS.widgets.crashRisk] ❌ Regression calculation failed');
                return null;
            }

            const currentWeight = weightData[weightData.length - 1].weight;
            const weeklyLossPercent = calculateWeeklyLossPercent(regression.slope, currentWeight);
            const severity = getSeverity(weeklyLossPercent);
            const isWarning = severity !== SEVERITY_LEVELS.NONE;

            // 3. Fetch EWS data (Early Warning System)
            let ewsData = null;
            let ewsCount = 0;

            if (HEYS.InsightsPI && HEYS.InsightsPI.earlyWarning) {
                try {
                    ewsData = HEYS.InsightsPI.earlyWarning.detect(days, profile, pIndex, {
                        includeDetails: true
                    });
                    ewsCount = ewsData?.count || 0;
                } catch (ewsError) {
                    console.warn('[HEYS.widgets.crashRisk] ⚠️ EWS detection failed:', ewsError);
                }
            }

            // 4. Construct result
            const result = {
                hasData: true,
                weeklyLossPercent,
                isWarning,
                severity,
                currentWeight,
                weightData,
                regression: {
                    slope: regression.slope,
                    r2: regression.r2,
                    slopePerWeek: regression.slope * 7
                },
                ewsCount,
                ewsData,
                dataPoints: weightData.length,
                periodDays: days
            };

            // 5. Verification logging
            console.info('[HEYS.widgets.crashRisk] ✅ Data computed:', {
                weeklyLossPercent: weeklyLossPercent.toFixed(2) + '%',
                severity,
                isWarning,
                currentWeight: currentWeight.toFixed(1) + 'kg',
                dataPoints: weightData.length,
                periodDays: days,
                slope: (regression.slope * 7).toFixed(3) + 'kg/week',
                r2: regression.r2.toFixed(3),
                ewsCount
            });

            return result;

        } catch (error) {
            console.error('[HEYS.widgets.crashRisk] ❌ Fatal error:', error);
            return null;
        }
    }

    // ============================================================================
    // EXPORT
    // ============================================================================

    HEYS.Widgets.DataProviders.crashRisk = {
        getData: getCrashRiskData,
        THRESHOLDS,
        SEVERITY_LEVELS
    };

    console.info('[HEYS.widgets.crashRisk] ✅ Data provider v1.0.0 loaded');

})(window);
