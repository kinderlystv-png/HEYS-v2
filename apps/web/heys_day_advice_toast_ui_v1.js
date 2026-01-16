// heys_day_advice_toast_ui_v1.js — legacy shim (moved to day/_advice.js)
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  if (!HEYS.dayAdviceToastUI?.renderAutoAdviceToast && HEYS.analytics?.trackError) {
    HEYS.analytics.trackError(new Error('[HEYS Day Advice] toast UI moved to day/_advice.js'), {
      source: 'heys_day_advice_toast_ui_v1.js',
      type: 'legacy_shim',
    });
  }
})(window);
