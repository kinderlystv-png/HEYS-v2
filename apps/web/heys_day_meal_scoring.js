// heys_day_meal_scoring.js — legacy shim (moved to day/_meal_quality.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Meals] Meal scoring moved to day/_meal_quality.js'), {
      source: 'heys_day_meal_scoring.js',
      type: 'legacy_shim',
    });
  }
  return;
})(window);
