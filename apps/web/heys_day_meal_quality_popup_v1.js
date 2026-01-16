// heys_day_meal_quality_popup_v1.js — legacy shim (moved to day/_meal_quality.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Meals] Meal quality popup moved to day/_meal_quality.js'), {
      source: 'heys_day_meal_quality_popup_v1.js',
      type: 'legacy_shim',
    });
  }
  return;
})(window);
