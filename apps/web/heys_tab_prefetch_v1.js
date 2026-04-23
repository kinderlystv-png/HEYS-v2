// heys_tab_prefetch_v1.js — idle background prefetch (light data + warm paths) after postboot
(function (global) {
  'use strict';
  const HEYS = (global.HEYS = global.HEYS || {});

  let _started = false;
  let _userBusyUntil = 0;

  function markUserBusy(ms) {
    _userBusyUntil = Date.now() + (ms || 0);
  }

  function isUserBusy() {
    return Date.now() < _userBusyUntil;
  }

  function shouldPrefetchNetwork() {
    if (!global.navigator || !global.navigator.onLine) return false;
    try {
      const c = global.navigator.connection;
      if (c && c.saveData) return false;
    } catch (_) { /* noop */ }
    return true;
  }

  function scheduleIdle(fn, opts) {
    const timeout = (opts && opts.timeout) || 12000;
    if (typeof global.requestIdleCallback === 'function') {
      return global.requestIdleCallback(fn, { timeout });
    }
    return global.setTimeout(function () {
      fn({ timeRemaining: function () { return 12; }, didTimeout: false });
    }, 1800);
  }

  function stageSharedProductsLight() {
    const cloud = HEYS.cloud;
    if (!cloud || typeof cloud.getAllSharedProducts !== 'function') return;
    let cachedLen = 0;
    try {
      const cached = typeof cloud.getCachedSharedProducts === 'function' ? cloud.getCachedSharedProducts() : null;
      cachedLen = Array.isArray(cached) ? cached.length : 0;
    } catch (_) { /* noop */ }
    if (cachedLen > 40) return;
    cloud.getAllSharedProducts({ limit: 400 }).catch(function () { /* offline / RPC */ });
  }

  function stageDayCacheWarm() {
    try {
      const dc = HEYS.dayCache;
      if (dc && typeof dc.getDayCount === 'function') {
        dc.getDayCount();
      }
    } catch (_) { /* noop */ }
  }

  function runStages() {
    if (!shouldPrefetchNetwork() || isUserBusy()) return;
    const perf = HEYS.perfMainThread;
    const wrap = function (label, fn) {
      if (perf && typeof perf.measureSync === 'function') {
        perf.measureSync(label, fn, { threshold: 16 });
      } else {
        fn();
      }
    };
    wrap('tabPrefetch:sharedProducts', stageSharedProductsLight);
    wrap('tabPrefetch:dayCache', stageDayCacheWarm);
  }

  function attachInteractionGuards() {
    if (global.__heysTabPrefetchGuards) return;
    global.__heysTabPrefetchGuards = true;
    var onBusy = function () { markUserBusy(900); };
    try {
      global.addEventListener('touchstart', onBusy, { passive: true });
      global.addEventListener('wheel', onBusy, { passive: true });
      global.addEventListener('keydown', onBusy, { passive: true });
    } catch (_) { /* noop */ }
  }

  HEYS.TabPrefetch = {
    /** Вызывать после window.__heysPostbootDone (или из idle если postboot пропущен) */
    scheduleAfterPostboot: function () {
      if (_started) return;
      _started = true;
      attachInteractionGuards();
      scheduleIdle(function (deadline) {
        if (isUserBusy()) return;
        if (deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() < 6) return;
        runStages();
      }, { timeout: 14000 });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
