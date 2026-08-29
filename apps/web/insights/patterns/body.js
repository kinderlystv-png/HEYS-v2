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

    // Вес «стоит» — тот же порог, что у остальных веток классификации ниже.
    const WEIGHT_STABLE = 0.05;
    // Талия должна уйти заметно: лента шумит на сантиметр-полтора, а ложная
    // «перестройка» опаснее пропущенной — она оправдывает застой.
    const WAIST_DROP = -0.1;
    // Назначенный план без отметки о выполнении — не тренировка.
    const TRAINING_NOT_PERFORMED = new Set(['assigned', 'skipped', 'moved']);

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
            .filter(d => d.measurements?.biceps || d.measurements?.thigh || d.measurements?.waist)
            .map(d => ({
                date: d.date,
                biceps: d.measurements?.biceps || 0,
                thigh: d.measurements?.thigh || 0,
                waist: d.measurements?.waist || 0,
                weight: d.weightMorning || profile?.weight || 0
            }));

        if (measurements.length < 5) {
            return { pattern: PATTERNS.HYPERTROPHY, available: false, reason: 'no_measurements' };
        }

        const bicepsValues = measurements.map(m => m.biceps).filter(v => v > 0);
        const thighValues = measurements.map(m => m.thigh).filter(v => v > 0);
        const waistValues = measurements.map(m => m.waist).filter(v => v > 0);
        const weightValues = measurements.map(m => m.weight).filter(v => v > 0);

        if (bicepsValues.length < 3 && thighValues.length < 3 && waistValues.length < 3) {
            return { pattern: PATTERNS.HYPERTROPHY, available: false, reason: 'no_measurements' };
        }

        const bicepsTrend = bicepsValues.length >= 3 ? calculateTrend(bicepsValues) : 0;
        const thighTrend = thighValues.length >= 3 ? calculateTrend(thighValues) : 0;
        // Талия — прямой признак жира, и без неё «вес стоит» не отличить от застоя.
        const waistTrend = waistValues.length >= 3 ? calculateTrend(waistValues) : 0;
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

        const strengthDays = days.filter(d => (d.trainings || []).some(
            t => String(t?.type) === 'strength'
                && !TRAINING_NOT_PERFORMED.has(String(t?.plan?.status || ''))
        )).length;

        const waistFalling = waistTrend < WAIST_DROP;
        const girthGrowing = bicepsTrend > 0.01 || thighTrend > 0.02;

        let compositionQuality = 'unknown';
        if (weightTrend > 0.05 && (bicepsTrend > 0.01 || thighTrend > 0.02)) {
            compositionQuality = 'muscle_gain';
        } else if (weightTrend > 0.05 && bicepsTrend <= 0 && thighTrend <= 0) {
            compositionQuality = 'fat_gain';
        } else if (weightTrend < -0.05 && (bicepsTrend > -0.01 || thighTrend > -0.02)) {
            compositionQuality = 'fat_loss';
        } else if (Math.abs(weightTrend) <= WEIGHT_STABLE && (waistFalling || girthGrowing)) {
            // Случай, который справка называет рекомпозицией: вес стоит, а тело
            // меняется. Раньше он безусловно попадал в «стабильно» — движок
            // молчал ровно там, где обещал говорить.
            compositionQuality = 'recomposition';
        } else {
            compositionQuality = 'maintenance';
        }

        let score = 70;
        if (compositionQuality === 'muscle_gain' && proteinAdequacy >= 70) {
            score = 95;
        } else if (compositionQuality === 'fat_loss' && proteinAdequacy >= 70) {
            score = 90;
        } else if (compositionQuality === 'recomposition' && proteinAdequacy >= 70) {
            score = 92;
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
        } else if (compositionQuality === 'recomposition') {
            const evidence = waistFalling ? 'талия уходит' : 'обхваты растут';
            const support = strengthDays > 0
                ? `Белок ${Math.round(proteinAdequacy)}% дней >= 1.6г/кг, силовых за период: ${strengthDays}`
                : `Белок ${Math.round(proteinAdequacy)}% дней >= 1.6г/кг`;
            insight = `🔄 Вес стоит, а ${evidence} — похоже на перестройку состава. ${support}`;
        } else {
            insight = `📊 Композиция стабильна. Белок ${Math.round(proteinAdequacy)}% дней >= 1.6г/кг`;
        }

        const confidence = measurements.length >= 7 ? 0.80 : 0.65;

        return {
            pattern: PATTERNS.HYPERTROPHY,
            available: true,
            bicepsTrend: Math.round(bicepsTrend * 1000) / 1000,
            thighTrend: Math.round(thighTrend * 1000) / 1000,
            waistTrend: Math.round(waistTrend * 1000) / 1000,
            weightTrend: Math.round(weightTrend * 1000) / 1000,
            compositionQuality,
            proteinAdequacy: Math.round(proteinAdequacy),
            strengthDays,
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
