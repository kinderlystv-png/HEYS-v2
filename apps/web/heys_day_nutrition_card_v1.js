// heys_day_nutrition_card_v1.js — nutrition tab wrapper (ctx/actions)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildNutritionCard(params) {
        const {
            React,
            day,
            prof,
            pIndex,
            date,
            eatenKcal,
            displayOptimum,
            displayRemainingKcal,
            dayTot,
            normAbs,
            insulinWaveData,
            dailyWaveOverview,
            legacyMealsUI,
            waterMl,
            waterGoal,
            addMeal,
            addWater,
            haptic
        } = params || {};

        if (!React) return null;

        const nutritionCtx = {
            day,
            prof,
            pIndex,
            date,
            eatenKcal,
            displayOptimum,
            displayRemainingKcal,
            dayTot,
            normAbs,
            insulinWaveData,
            dailyWaveOverview,
            legacyMealsUI,
            waterMl,
            waterGoal
        };

        const nutritionActions = {
            addMeal,
            addWater,
            haptic
        };

        return HEYS.dayNutrition?.render?.({ React, ctx: nutritionCtx, actions: nutritionActions })
            || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Nutrition module not loaded');
    }

    HEYS.dayNutritionCard = {
        buildNutritionCard
    };
})(window);
