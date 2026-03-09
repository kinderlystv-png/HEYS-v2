// heys_day_nutrition_state_v1.js — nutrition totals + norms + daily table state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function withSavedTotalsFallback(dayTot, day) {
        const result = { ...(dayTot || {}) };
        const saved = day || {};

        if ((+result.kcal || 0) <= 0 && (+saved.savedEatenKcal || 0) > 0) {
            result.kcal = +saved.savedEatenKcal || 0;
        }
        if ((+result.prot || 0) <= 0 && (+saved.savedEatenProt || 0) > 0) {
            result.prot = +saved.savedEatenProt || 0;
        }
        if ((+result.carbs || 0) <= 0 && (+saved.savedEatenCarbs || 0) > 0) {
            result.carbs = +saved.savedEatenCarbs || 0;
        }
        if ((+result.fat || 0) <= 0 && (+saved.savedEatenFat || 0) > 0) {
            result.fat = +saved.savedEatenFat || 0;
        }
        if ((+result.fiber || 0) <= 0 && (+saved.savedEatenFiber || 0) > 0) {
            result.fiber = +saved.savedEatenFiber || 0;
        }

        return result;
    }

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

        const calculatedDayTot = ctx.dayCalculations?.calculateDayTotals?.(day, pIndex) || { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };
        const dayTot = withSavedTotalsFallback(calculatedDayTot, day);
        const normPerc = (ctx.utils && ctx.utils.lsGet ? ctx.utils.lsGet('heys_norms', {}) : {}) || {};
        const normAbs = ctx.dayCalculations?.computeDailyNorms?.(optimum, normPerc) || { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 };

        const dailyTableState = ctx.dayDailyTable?.buildDailyTableState
            ? ctx.dayDailyTable.buildDailyTableState({
                React,
                day,
                pIndex,
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
