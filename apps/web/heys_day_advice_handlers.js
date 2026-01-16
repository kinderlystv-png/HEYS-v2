// heys_day_advice_handlers.js — legacy shim (logic moved into day/_advice.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Advice] handlers moved to day/_advice.js'), {
      source: 'heys_day_advice_handlers.js',
      type: 'legacy_shim',
    });
  }
})(window);
