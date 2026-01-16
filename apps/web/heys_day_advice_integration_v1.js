// heys_day_advice_integration_v1.js — Advice UI state + useAdviceState wiring

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    HEYS.dayAdviceIntegration = HEYS.dayAdviceIntegration || {};

    HEYS.dayAdviceIntegration.useAdviceIntegration = function useAdviceIntegration(ctx) {
        const React = ctx.React || global.React;
        const heysRef = ctx.HEYS || HEYS;

        const uiState = React.useMemo(() => ({
            modalOpen: false, // TODO: отслеживать состояние модалок
            searchOpen: false, // В DayTab нет глобального поиска, он внутри MealAddProduct
            showTimePicker: ctx.showTimePicker,
            showWeightPicker: ctx.showWeightPicker,
            showDeficitPicker: ctx.showDeficitPicker,
            showZonePicker: ctx.showZonePicker,
            showSleepQualityPicker: ctx.showSleepQualityPicker,
            showDayScorePicker: ctx.showDayScorePicker
        }), [
            ctx.showTimePicker,
            ctx.showWeightPicker,
            ctx.showDeficitPicker,
            ctx.showZonePicker,
            ctx.showSleepQualityPicker,
            ctx.showDayScorePicker
        ]);

        const adviceState = heysRef.dayAdviceState?.useAdviceState?.({
            React,
            day: ctx.day,
            date: ctx.date,
            prof: ctx.prof,
            pIndex: ctx.pIndex,
            dayTot: ctx.dayTot,
            normAbs: ctx.normAbs,
            optimum: ctx.optimum,
            waterGoal: ctx.waterGoal,
            uiState,
            haptic: ctx.haptic,
            U: ctx.U,
            lsGet: ctx.lsGet,
            currentStreak: ctx.currentStreak,
            setShowConfetti: ctx.setShowConfetti,
            HEYS: heysRef
        }) || {};

        return { uiState, adviceState };
    };
})(window);
