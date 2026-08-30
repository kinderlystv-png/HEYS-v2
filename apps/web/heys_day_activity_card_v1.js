// heys_day_activity_card_v1.js — activity card wrapper (ctx/actions)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildActivityCard(params) {
        const {
            React,
            day,
            prof,
            stepsValue,
            stepsGoal,
            stepsPercent,
            stepsColor,
            stepsK,
            stepsEstimated,
            stepsMissing,
            bmr,
            householdK,
            totalHouseholdMin,
            householdActivities,
            train1k,
            train2k,
            train3k,
            visibleTrainings,
            trainingTypes,
            regularTrainingsBlock,
            programTrainingsBlock,
            ndteData,
            ndteBoostKcal,
            tefData,
            tefKcal,
            dayTargetDef,
            displayOptimum,
            optimum,
            cycleKcalMultiplier,
            tdee,
            caloricDebt,
            monthTrainingsRows,
            workingWeights,
            morningActivationCalendarBlock,
            r0,
            setDay,
            haptic,
            setMetricPopup,
            setTefInfoPopup,
            openStepsGoalPicker,
            handleStepsDrag,
            openHouseholdPicker,
            openTrainingPicker
        } = params || {};

        if (!React) return null;

        const activityCtx = {
            day, prof,
            // Steps
            stepsValue, stepsGoal, stepsPercent, stepsColor, stepsK, stepsEstimated, stepsMissing,
            // Household & Training
            bmr, householdK, totalHouseholdMin, householdActivities,
            train1k, train2k, train3k, visibleTrainings, trainingTypes, regularTrainingsBlock, programTrainingsBlock,
            // Metabolism (NDTE, TEF)
            ndteData, ndteBoostKcal, tefData, tefKcal,
            // Caloric calculations
            dayTargetDef, displayOptimum, optimum, cycleKcalMultiplier, tdee, caloricDebt,
            monthTrainingsRows,
            workingWeights,
            morningActivationCalendarBlock,
            r0
        };

        const activityActions = {
            setDay, haptic,
            setMetricPopup, setTefInfoPopup,
            openStepsGoalPicker, handleStepsDrag,
            openHouseholdPicker, openTrainingPicker
        };

        return HEYS.dayActivity?.render?.({ React, ctx: activityCtx, actions: activityActions })
            || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Activity module not loaded');
    }

    HEYS.dayActivityCard = {
        buildActivityCard
    };
})(window);
