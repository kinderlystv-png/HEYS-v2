// insights/patterns/body.js — Modular body analyzers (v6.10.0)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const piStats = HEYS.InsightsPI?.stats || global.piStats || {};
    const piConst = HEYS.InsightsPI?.constants || global.piConst || {};

    const PATTERNS = piConst.PATTERNS || {
        HYPERTROPHY: 'hypertrophy'
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

    /**
     * C12: Hypertrophy & body composition.
     * @param {Array} days
     * @param {object} profile
     * @returns {object}
     */
    function analyzeHypertrophy(days, profile) {
        if (!days || days.length < 14) {
            return { pattern: PATTERNS.HYPERTROPHY, available: false, reason: 'no_measurements' };
        }

        const measurements = days
            .filter(d => d.measurements?.biceps || d.measurements?.thigh)
            .map(d => ({
                date: d.date,
                biceps: d.measurements?.biceps || 0,
                thigh: d.measurements?.thigh || 0,
                weight: d.weightMorning || profile?.weight || 0
            }));

        if (measurements.length < 5) {
            return { pattern: PATTERNS.HYPERTROPHY, available: false, reason: 'no_measurements' };
        }

        const bicepsValues = measurements.map(m => m.biceps).filter(v => v > 0);
        const thighValues = measurements.map(m => m.thigh).filter(v => v > 0);
        const weightValues = measurements.map(m => m.weight).filter(v => v > 0);

        if (bicepsValues.length < 3 && thighValues.length < 3) {
            return { pattern: PATTERNS.HYPERTROPHY, available: false, reason: 'no_measurements' };
        }

        const bicepsTrend = bicepsValues.length >= 3 ? calculateTrend(bicepsValues) : 0;
        const thighTrend = thighValues.length >= 3 ? calculateTrend(thighValues) : 0;
        const weightTrend = weightValues.length >= 3 ? calculateTrend(weightValues) : 0;

        const proteinDays = days.filter(d => {
            // dayTot не хранится в localStorage — вычисляем протеин из meals
            let proteinGrams = 0;
            if (d.meals) {
                for (const meal of d.meals) {
                    for (const item of (meal.items || [])) {
                        const grams = Number(item.grams) || 0;
                        const prot100 = Number(item.prot100) || 0;
                        proteinGrams += (prot100 * grams / 100);
                    }
                }
            }
            const weight = d.weightMorning || profile?.weight || 70;
            return (proteinGrams / weight) >= 1.6;
        });
        const proteinAdequacy = (proteinDays.length / days.length) * 100;

        let compositionQuality = 'unknown';
        if (weightTrend > 0.05 && (bicepsTrend > 0.01 || thighTrend > 0.02)) {
            compositionQuality = 'muscle_gain';
        } else if (weightTrend > 0.05 && bicepsTrend <= 0 && thighTrend <= 0) {
            compositionQuality = 'fat_gain';
        } else if (weightTrend < -0.05 && (bicepsTrend > -0.01 || thighTrend > -0.02)) {
            compositionQuality = 'fat_loss';
        } else {
            compositionQuality = 'maintenance';
        }

        let score = 70;
        if (compositionQuality === 'muscle_gain' && proteinAdequacy >= 70) {
            score = 95;
        } else if (compositionQuality === 'fat_loss' && proteinAdequacy >= 70) {
            score = 90;
        } else if (compositionQuality === 'fat_gain') {
            score = 50;
        } else if (proteinAdequacy < 50) {
            score = 60;
        }

        let insight = '';
        if (compositionQuality === 'muscle_gain') {
            insight = `💪 Мышечная масса растёт! Бицепс ${bicepsTrend > 0 ? '+' : ''}${(bicepsTrend * 100).toFixed(1)}см/мес, бедро ${thighTrend > 0 ? '+' : ''}${(thighTrend * 100).toFixed(1)}см/мес`;
        } else if (compositionQuality === 'fat_loss') {
            insight = `✅ Жир уходит, мышцы держатся! Белок ${Math.round(proteinAdequacy)}% дней >= 1.6г/кг`;
        } else if (compositionQuality === 'fat_gain') {
            insight = `⚠️ Вес растёт без роста мышц. Проверь белок (${Math.round(proteinAdequacy)}% дней) и силовые`;
        } else {
            insight = `📊 Композиция стабильна. Белок ${Math.round(proteinAdequacy)}% дней >= 1.6г/кг`;
        }

        const confidence = measurements.length >= 7 ? 0.80 : 0.65;

        return {
            pattern: PATTERNS.HYPERTROPHY,
            available: true,
            bicepsTrend: Math.round(bicepsTrend * 1000) / 1000,
            thighTrend: Math.round(thighTrend * 1000) / 1000,
            weightTrend: Math.round(weightTrend * 1000) / 1000,
            compositionQuality,
            proteinAdequacy: Math.round(proteinAdequacy),
            measurements: measurements.length,
            dataPoints: days.length,
            score,
            confidence,
            insight
        };
    }

    HEYS.InsightsPI.patternModules = HEYS.InsightsPI.patternModules || {};
    HEYS.InsightsPI.patternModules.analyzeHypertrophy = analyzeHypertrophy;
})(typeof window !== 'undefined' ? window : global);
