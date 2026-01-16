// heys_day_advice_card.js — legacy shim (moved to day/_advice.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (!HEYS.dayComponents?.AdviceCard && HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Advice] AdviceCard moved to day/_advice.js'), {
      source: 'heys_day_advice_card.js',
      type: 'legacy_shim',
    });
  }
})(window);
