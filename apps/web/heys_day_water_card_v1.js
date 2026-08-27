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
            waterLastDrink,
            isPastDay,
            isReadOnly,
            haptic,
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
            waterLastDrink,
            isPastDay,
            isReadOnly
        };

        const waterActions = {
            haptic,
            openExclusivePopup,
            addWater,
            removeWater
        };

        if (HEYS.dayWater?.renderPlaceholder) {
            const pending = params?.pending || !HEYS.dayWater?.render;
            if (pending) {
                return HEYS.dayWater.renderPlaceholder({
                    React,
                    isCompact: params?.isCompact
                });
            }
        }

        return HEYS.dayWater?.render?.({ React, ctx: waterCtx, actions: waterActions })
            || HEYS.dayWater?.renderPlaceholder?.({ React, isCompact: params?.isCompact })
            || React.createElement('div', { style: { padding: '12px' } }, '⚠️ Water module not loaded');
    }

    HEYS.dayWaterCard = {
        buildWaterCard
    };
})(window);
