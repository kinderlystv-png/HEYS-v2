// heys_day_nutrition_state_v1.js — nutrition totals + norms + daily table state

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function dayHasAnyMealLines(day) {
        const meals = (day && Array.isArray(day.meals)) ? day.meals : [];
        return meals.some((m) => Array.isArray(m?.items) && m.items.length > 0);
    }

    function withSavedTotalsFallback(dayTot, day) {
        const result = { ...(dayTot || {}) };
        const saved = day || {};
        if (!dayHasAnyMealLines(saved)) {
            return result;
        }

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

    const EMPTY_TOTALS = () => ({ kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, gi: 0, harm: 0 });

    /**
     * Абсолютные нормы дня от бюджета экрана.
     *
     * budgetKcal — это displayOptimum (норма с учётом рефида и долга), а не
     * исходный optimum: контракт «бюджет дня» требует одно число на весь
     * экран. Раньше сюда уходил optimum под именем displayOptimum, и в
     * рефид-день герой и строка «норма» в итогах расходились.
     */
    function computeNormAbs(params) {
        const { budgetKcal, normPerc, day, HEYS: HEYSRef } = params || {};
        const ctx = HEYSRef || HEYS;
        const lsGet = ctx.utils?.lsGet;
        return ctx.dayCalculations?.computeDisplayNorms?.({
            displayOptimum: budgetKcal,
            normPerc,
            profile: (lsGet ? lsGet('heys_profile', {}) : {}),
            day,
            lsGet
        })?.normAbs
            || ctx.dayCalculations?.computeDailyNorms?.(budgetKcal, normPerc, { day, lsGet })
            || EMPTY_TOTALS();
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
        const normAbs = computeNormAbs({ budgetKcal: optimum, normPerc, day, HEYS: ctx });

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
        buildNutritionState,
        computeNormAbs
    };
})(window);
