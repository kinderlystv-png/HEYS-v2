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
            optimum,
            displayOptimum,
            displayRemainingKcal,
            dayTot,
            normAbs,
            insulinWaveData,
            waterMl,
            waterGoal,
            waterGoalBreakdown,
            waterLastDrink,
            addMeal,
            addWater,
            removeWater,
            openAddProductForMeal,
            haptic,
            openExclusivePopup,
            openTimeEditor,
            openMoodEditor,
            openEditGramsModal,
            openCopyMealModal,
            openMoveMealModal,
            saveAsPreset,
            repeatYesterdayMeal,
            removeMeal,
            removeItem,
            copyItem,
            moveItem
        } = params || {};

        if (!React) return null;

        const nutritionCtx = {
            day,
            prof,
            pIndex,
            date,
            eatenKcal,
            optimum,
            displayOptimum,
            displayRemainingKcal,
            dayTot,
            normAbs,
            insulinWaveData,
            waterMl,
            waterGoal,
            waterGoalBreakdown,
            waterLastDrink
        };

        const nutritionActions = {
            addMeal,
            addWater,
            removeWater,
            openAddProductForMeal,
            haptic,
            openExclusivePopup,
            openTimeEditor,
            openMoodEditor,
            openEditGramsModal,
            openCopyMealModal,
            openMoveMealModal,
            saveAsPreset,
            repeatYesterdayMeal,
            removeMeal,
            removeItem,
            copyItem,
            moveItem
        };

        return HEYS.dayNutrition?.render?.({ React, ctx: nutritionCtx, actions: nutritionActions })
            || React.createElement('div', { style: { padding: '12px' } }, 'Модуль «Питание» не загрузился');
    }

    HEYS.dayNutritionCard = {
        buildNutritionCard
    };
})(window);
