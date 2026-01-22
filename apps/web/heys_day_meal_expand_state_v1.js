// heys_day_meal_expand_state_v1.js — legacy shim (moved to day/_meals.js)
; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    if (HEYS.dayMealExpandState?.useMealExpandState) return;
    if (HEYS.analytics?.trackError) {
        HEYS.analytics.trackError(new Error('[HEYS Day Meals] Meal expand state shim loaded'), {
            source: 'heys_day_meal_expand_state_v1.js',
            type: 'legacy_shim'
        });
    }
})(window);
