/**
 * heys_widgets_data_v1.js
 * Централизованный Data Provider для всех виджетов
 * Version: 1.0.0
 * Created: 2026-02-15
 * 
 * Паттерн: Factory для получения данных виджетов из разных источников
 */
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.Widgets = HEYS.Widgets || {};

    // --- Relapse Risk ---
    // Data gathering and calculation delegated to HEYS.RelapseRisk.getCurrentSnapshot()
    // (single source of truth in heys_relapse_risk_v1.js)

    function normalizeRelapseRecommendation(rec) {
        if (!rec) return null;
        if (typeof rec === 'string') return rec;
        if (typeof rec?.text === 'string' && rec.text.trim()) return rec.text.trim();
        if (typeof rec?.label === 'string' && rec.label.trim()) return rec.label.trim();
        if (typeof rec?.title === 'string' && rec.title.trim()) return rec.title.trim();
        return null;
    }

    function getRelapseRiskData(widget, options) {
        // Delegate to the shared RRS snapshot — single source of truth
        if (HEYS.RelapseRisk?.getCurrentSnapshot) {
            const snap = HEYS.RelapseRisk.getCurrentSnapshot(options || {});
            if (!snap.hasData) {
                return { hasData: false, message: snap.message || 'Relapse engine не загружен' };
            }
            return {
                hasData: true,
                score: snap.score,
                target: 100,
                pct: snap.score,
                remaining: Math.max(0, 100 - snap.score),
                level: snap.level,
                confidence: snap.confidence,
                topWindowLabel: typeof snap.topWindowLabel === 'string' ? snap.topWindowLabel : 'сейчас',
                topWindowScore: Number.isFinite(Number(snap.topWindowScore)) ? Number(snap.topWindowScore) : Number(snap.score || 0),
                primaryDriver: snap.primaryDriver,
                primaryDrivers: snap.primaryDrivers,
                protectiveFactors: snap.protectiveFactors,
                recommendation: normalizeRelapseRecommendation(snap.recommendation),
                windows: snap.windows,
                raw: snap.raw,
            };
        }

        // Fallback: engine not loaded yet
        console.warn('[HEYS.Widgets.data] relapseRisk engine not loaded');
        return { hasData: false, message: 'Relapse engine не загружен' };
    }

    /**
     * Получить данные для конкретного виджета
     * @param {Object} widget - конфигурация виджета
     * @returns {Object} - данные для рендеринга виджета
     */
    function getDataForWidget(widget) {
        if (!widget || !widget.type) {
            console.warn('[HEYS.Widgets.data] Invalid widget:', widget);
            return {};
        }

        const type = widget.type;
        const U = HEYS.utils || {};

        try {
            switch (type) {
                case 'dayScore': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});
                    const dayTot = HEYS.DayData?.getDayTot?.(dayData) || {};
                    const normAbs = HEYS.norms?.getNormAbs?.(profile, profile?.pIndex || 0) || {};
                    const waterGoal = HEYS.utils?.calculateWaterGoal?.(profile.weight) || 2000;
                    const pIndex = profile?.pIndex || 0;

                    const result = HEYS.DayScore?.calculateDayScore?.({
                        dayData, profile, dayTot, normAbs, waterGoal, pIndex
                    });

                    return {
                        score: result?.score ?? 0,
                        level: result?.level ?? 'none',
                        factorScore: result?.factorScore ?? 0,
                        subjectiveScore: result?.subjectiveScore ?? 0,
                        momentumScore: result?.momentumScore ?? 0,
                        breakdown: result?.breakdown ?? {},
                        hasData: !!result
                    };
                }

                case 'riskRadar': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});
                    const dayTot = HEYS.DayData?.getDayTot?.(dayData) || {};
                    const normAbs = HEYS.norms?.getNormAbs?.(profile, profile?.pIndex || 0) || {};
                    const pIndex = profile?.pIndex || 0;

                    const result = HEYS.RiskRadar?.calculate?.({
                        dayData, profile, dayTot, normAbs, pIndex
                    });

                    return {
                        score: result?.score ?? 0,
                        level: result?.level ?? 'low',
                        source: result?.source ?? 'none',
                        drivers: result?.drivers ?? [],
                        actions: result?.actions ?? [],
                        hasData: !!result
                    };
                }

                case 'crashRisk': {
                    // ✅ Используем специализированный data provider
                    const provider = HEYS.Widgets.DataProviders?.crashRisk;
                    if (!provider) {
                        console.warn('[HEYS.Widgets.data] crashRisk provider not loaded');
                        return { hasData: false, message: 'Data provider не загружен' };
                    }

                    const days = widget.settings?.periodDays || 7;
                    return provider.getData({ days });
                }

                case 'relapseRisk': {
                    return getRelapseRiskData(widget, U);
                }

                case 'status': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});
                    const dayTot = HEYS.DayData?.getDayTot?.(dayData) || {};
                    const normAbs = HEYS.norms?.getNormAbs?.(profile, profile?.pIndex || 0) || {};
                    const waterGoal = HEYS.utils?.calculateWaterGoal?.(profile.weight) || 2000;

                    return {
                        dayData,
                        profile,
                        dayTot,
                        normAbs,
                        waterGoal,
                        status: HEYS.Status?.calculateStatus?.({ dayData, profile, dayTot, normAbs, waterGoal })
                    };
                }

                case 'calories': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const dayTot = HEYS.DayData?.getDayTot?.(dayData) || {};
                    const profile = U.lsGet('heys_profile', {});
                    const optimum = profile?.optimum || 2000;

                    return {
                        current: dayTot.kcal || 0,
                        target: optimum,
                        pct: optimum > 0 ? Math.round((dayTot.kcal / optimum) * 100) : 0,
                        remaining: Math.max(0, optimum - (dayTot.kcal || 0))
                    };
                }

                case 'water': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});
                    const waterGoal = HEYS.utils?.calculateWaterGoal?.(profile.weight) || 2000;
                    const drunk = dayData.waterMl || 0;

                    return {
                        drunk,
                        target: waterGoal,
                        pct: waterGoal > 0 ? Math.round((drunk / waterGoal) * 100) : 0,
                        remaining: Math.max(0, waterGoal - drunk)
                    };
                }

                case 'sleep': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});
                    const targetHours = profile?.sleepHours || 8;

                    return {
                        hours: dayData.sleepHours || 0,
                        quality: dayData.sleepQuality || null,
                        target: targetHours,
                        pct: targetHours > 0 ? Math.round((dayData.sleepHours / targetHours) * 100) : 0
                    };
                }

                case 'weight': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});
                    const periodDays = widget.settings?.periodDays || 7;

                    // Используем модуль weight trends если доступен
                    let trend = null;
                    if (HEYS.DayData?.getWeightTrend) {
                        trend = HEYS.DayData.getWeightTrend(periodDays);
                    }

                    return {
                        current: dayData.weightMorning || profile?.weight || 0,
                        goal: profile?.weightGoal || 0,
                        trend: trend?.slope || 0,
                        weekChange: trend?.weekChange || 0,
                        monthChange: trend?.monthChange || 0,
                        progressPct: trend?.progressPct || 0,
                        weeksToGoal: trend?.weeksToGoal || null,
                        sparkline: trend?.sparkline || [],
                        bmi: trend?.bmi || null,
                        bmiCategory: trend?.bmiCategory || null,
                        hasCleanTrend: trend?.hasCleanTrend || false
                    };
                }

                case 'steps': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});
                    const stepsGoal = profile?.stepsGoal || 10000;
                    const steps = dayData.steps || 0;

                    return {
                        steps,
                        goal: stepsGoal,
                        pct: stepsGoal > 0 ? Math.round((steps / stepsGoal) * 100) : 0,
                        remaining: Math.max(0, stepsGoal - steps)
                    };
                }

                case 'macros': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const dayTot = HEYS.DayData?.getDayTot?.(dayData) || {};
                    const profile = U.lsGet('heys_profile', {});
                    const pIndex = profile?.pIndex || 0;
                    const normAbs = HEYS.norms?.getNormAbs?.(profile, pIndex) || {};

                    return {
                        prot: dayTot.prot || 0,
                        fat: dayTot.fat || 0,
                        carbs: dayTot.carbs || 0,
                        targetProt: normAbs.prot || 0,
                        targetFat: normAbs.fat || 0,
                        targetCarbs: normAbs.carbs || 0,
                        protPct: normAbs.prot > 0 ? Math.round((dayTot.prot / normAbs.prot) * 100) : 0,
                        fatPct: normAbs.fat > 0 ? Math.round((dayTot.fat / normAbs.fat) * 100) : 0,
                        carbsPct: normAbs.carbs > 0 ? Math.round((dayTot.carbs / normAbs.carbs) * 100) : 0
                    };
                }

                case 'insulin': {
                    // Данные инсулиновой волны
                    const waveData = HEYS.insulinWave?.getCurrentWave?.() || null;

                    return {
                        waveData,
                        phase: waveData?.phase || null,
                        minutesRemaining: waveData?.minutesRemaining || 0,
                        recommendation: waveData?.recommendation || null
                    };
                }

                case 'streak': {
                    const currentStreak = HEYS.gamification?.getCurrentStreak?.() || 0;
                    const maxStreak = HEYS.gamification?.getMaxStreak?.() || 0;

                    return {
                        current: currentStreak,
                        max: maxStreak,
                        isNewRecord: currentStreak > 0 && currentStreak === maxStreak,
                        history: HEYS.gamification?.getStreakHistory?.(7) || []
                    };
                }

                case 'heatmap': {
                    const requestedPeriod = widget.settings?.period || 'week';
                    const period = requestedPeriod === 'month' ? 'week' : requestedPeriod;
                    const days = period === 'week' ? 7 : 30;

                    // Получаем историю активности
                    const history = HEYS.gamification?.getActivityHistory?.(days) || [];

                    return {
                        period,
                        days,
                        history
                    };
                }

                case 'cycle': {
                    const dayData = HEYS.DayData?.getCurrentDay?.() || {};
                    const profile = U.lsGet('heys_profile', {});

                    // Только для женщин с включенным tracking
                    if (profile.gender !== 'Женский' || !profile.cycleTrackingEnabled) {
                        return { day: null };
                    }

                    const cycleDay = dayData.cycleDay || null;
                    const cyclePhase = HEYS.cycle?.getPhase?.(cycleDay) || null;
                    const recommendation = HEYS.cycle?.getRecommendation?.(cyclePhase) || null;

                    return {
                        day: cycleDay,
                        phase: cyclePhase,
                        cycleLength: profile.cycleLength || 28,
                        recommendation
                    };
                }

                default:
                    console.warn(`[HEYS.Widgets.data] Unknown widget type: ${type}`);
                    return {};
            }
        } catch (error) {
            console.error(`[HEYS.Widgets.data] Error loading data for ${type}:`, error);
            return { hasData: false, _error: error?.message || 'unknown_error' };
        }
    }

    // === Exports ===
    HEYS.Widgets.data = {
        getDataForWidget,
        getRelapseRiskData
    };

    console.info('[HEYS.Widgets.data] ✅ Data provider v1.0.0 loaded');

})(window);
