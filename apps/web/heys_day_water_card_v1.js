// heys_day_water_card_v1.js — water card wrapper (ctx/actions)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function buildWaterCard(params) {
        const {
            React,
            day,
            prof,
            waterGoal,
            waterGoalBreakdown,
            waterPresets,
            waterMotivation,
            waterLastDrink,
            waterAddedAnim,
            showWaterDrop,
            showWaterTooltip,
            setDay,
            haptic,
            setWaterAddedAnim,
            setShowWaterDrop,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave,
            openExclusivePopup,
            addWater,
            removeWater
        } = params || {};

        if (!React) return null;

        const waterCtx = {
            day,
            prof,
            waterGoal,
            waterGoalBreakdown,
            waterPresets,
            waterMotivation,
            waterLastDrink,
            waterAddedAnim,
            showWaterDrop,
            showWaterTooltip
        };

        const waterActions = {
            setDay,
            haptic,
            setWaterAddedAnim,
            setShowWaterDrop,
            setShowWaterTooltip,
            handleWaterRingDown,
            handleWaterRingUp,
            handleWaterRingLeave,
            openExclusivePopup,
            addWater,
            removeWater
        };

        return HEYS.dayWater?.render?.({ React, ctx: waterCtx, actions: waterActions })
            || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Water module not loaded');
    }

    HEYS.dayWaterCard = {
        buildWaterCard
    };
})(window);
