// heys_day_advice_state_v1.js — legacy shim (moved to day/_advice.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (!HEYS.dayAdviceState?.useAdviceState && HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Advice] state moved to day/_advice.js'), {
      source: 'heys_day_advice_state_v1.js',
      type: 'legacy_shim',
    });
  }
})(window);
