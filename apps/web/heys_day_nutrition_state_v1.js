// heys_day_nutrition_state_v1.js — nutrition totals + norms + daily table state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildNutritionState(params) {
        const {
            React,
            day,
            pIndex,
            optimum,
            getDailyNutrientColor,
            getDailyNutrientTooltip,
            HEYS: HEYSRef
        } = params || {};

        if (!React) return {
            dayTot: { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            normPerc: {},
            normAbs: { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 },
            dailyTableState: {}
        };

        const ctx = HEYSRef || HEYS;

        const dayTot = ctx.dayCalculations?.calculateDayTotals?.(day, pIndex) || { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };
        const normPerc = (ctx.utils && ctx.utils.lsGet ? ctx.utils.lsGet('heys_norms', {}) : {}) || {};
        const normAbs = ctx.dayCalculations?.computeDailyNorms?.(optimum, normPerc) || { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };

        const dailyTableState = ctx.dayDailyTable?.buildDailyTableState
            ? ctx.dayDailyTable.buildDailyTableState({
                React,
                dayTot,
                normAbs,
                getDailyNutrientColor,
                getDailyNutrientTooltip
            }) || {}
            : {};

        return { dayTot, normPerc, normAbs, dailyTableState };
    }

    HEYS.dayNutritionState = {
        buildNutritionState
    };
})(window);
