// heys_perf_main_thread_v1.js — sampled main-thread timing for smoothness diagnostics
// Enable: localStorage.setItem('heys_debug_perf', 'true') — logs all slow spans
// Otherwise: ~1/150 slow operations (>12ms) log once to avoid noise
(function (global) {
  'use strict';
  const HEYS = (global.HEYS = global.HEYS || {});
  let _sampleCounter = 0;

  function isDebugPerf() {
    try {
      return global.localStorage && global.localStorage.getItem('heys_debug_perf') === 'true';
    } catch (_) {
      return false;
    }
  }

  function shouldSampleSlow(ms, threshold) {
    if (isDebugPerf()) return true;
    if (ms < (threshold || 12)) return false;
    _sampleCounter += 1;
    return _sampleCounter % 150 === 0;
  }

  /**
   * @param {string} label
   * @param {() => void} fn
   * @param {{ threshold?: number }} [opts]
   */
  function measureSync(label, fn, opts) {
    const t0 = global.performance && typeof global.performance.now === 'function'
      ? global.performance.now()
      : Date.now();
    try {
      fn();
    } finally {
      const dt = (global.performance && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now()) - t0;
      if (shouldSampleSlow(dt, opts && opts.threshold)) {
        try {
          (global.console || console).info('[HEYS.perf]', label, Math.round(dt) + 'ms');
        } catch (_) { /* noop */ }
      }
    }
  }

  HEYS.perfMainThread = {
    isDebugPerf,
    measureSync,
  };
})(typeof window !== 'undefined' ? window : globalThis);
