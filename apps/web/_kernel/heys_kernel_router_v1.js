// heys_kernel_router_v1.js — ОБЩЕЕ ЯДРО: strangler router primitives.
//
// Generic part of old/new engine routing: telemetry, contract fallback, optional
// shadow-compare and rollout gate. Domain modules keep enrichment, validation,
// diff semantics, persistence keys and engine lookup.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.router && TK.router.__registered) return;

  const DEFAULT_SOURCE_KEYS = ['old', 'new', 'fallback', 'fallback-error', 'fallback-contract'];
  const DEFAULT_ROLLOUT_GATE = Object.freeze({
    minRoutes: 50,
    minShadowCompareTotal: 8,
    maxFallbackRate: 0.05,
    maxShadowCompareErrors: 0,
    maxDurationDeltaMin: 15,
    maxExerciseDelta: 2,
    maxDangerOverBudget: 0,
    allowUiRendererRisk: false
  });

  function sourceKeys(keys) {
    return Array.isArray(keys) && keys.length ? keys.slice() : DEFAULT_SOURCE_KEYS.slice();
  }

  function emptyTelemetry(keys) {
    const bySource = {};
    sourceKeys(keys).forEach(function (k) { bySource[k] = 0; });
    return {
      total: 0,
      bySource: bySource,
      fallbackTotal: 0,
      shadowCompareTotal: 0,
      shadowCompareErrors: 0,
      lastFallbackReason: null,
      lastFallbackAt: null,
      lastShadowAt: null
    };
  }

  function copyTelemetry(t) {
    const total = Number(t && t.total) || 0;
    const fallbackTotal = Number(t && t.fallbackTotal) || 0;
    return {
      total: total,
      bySource: Object.assign({}, (t && t.bySource) || {}),
      fallbackTotal: fallbackTotal,
      fallbackRate: total > 0 ? fallbackTotal / total : 0,
      shadowCompareTotal: Number(t && t.shadowCompareTotal) || 0,
      shadowCompareErrors: Number(t && t.shadowCompareErrors) || 0,
      lastFallbackReason: t && t.lastFallbackReason || null,
      lastFallbackAt: t && t.lastFallbackAt || null,
      lastShadowAt: t && t.lastShadowAt || null
    };
  }

  function createTelemetry(opts) {
    const o = opts || {};
    const keys = sourceKeys(o.sourceKeys);
    const now = typeof o.now === 'function' ? o.now : function () { return Date.now(); };
    let state = emptyTelemetry(keys);
    let lastSource = null;
    let lastShadowDiff = null;

    function setSource(source, reason) {
      lastSource = source;
      state.total += 1;
      if (state.bySource[source] === undefined) state.bySource[source] = 0;
      state.bySource[source] += 1;
      if (String(source || '').indexOf('fallback') === 0) {
        state.fallbackTotal += 1;
        state.lastFallbackReason = reason || source;
        state.lastFallbackAt = now();
      }
    }

    function logShadow(diff) {
      lastShadowDiff = diff;
      state.shadowCompareTotal += 1;
      state.lastShadowAt = now();
    }

    function logShadowError() {
      state.shadowCompareErrors += 1;
    }

    function reset() {
      state = emptyTelemetry(keys);
      lastSource = null;
      lastShadowDiff = null;
    }

    return {
      setSource: setSource,
      logShadow: logShadow,
      logShadowError: logShadowError,
      copy: function () { return copyTelemetry(state); },
      reset: reset,
      getLastSource: function () { return lastSource; },
      getLastShadowDiff: function () { return lastShadowDiff; }
    };
  }

  function evaluateRolloutGate(input) {
    const i = input || {};
    const cfg = Object.assign({}, DEFAULT_ROLLOUT_GATE, i.thresholds || {});
    const telemetry = copyTelemetry(i.telemetry || {});
    const diff = i.lastShadowDiff || null;
    const reasons = [];

    if (telemetry.total < cfg.minRoutes) reasons.push('insufficient-routes');
    if (telemetry.shadowCompareTotal < cfg.minShadowCompareTotal) reasons.push('insufficient-shadow-samples');
    if (!diff) reasons.push('no-shadow-data');
    if (telemetry.total > 0 && telemetry.fallbackRate > cfg.maxFallbackRate) reasons.push('fallback-rate');
    if (telemetry.shadowCompareErrors > cfg.maxShadowCompareErrors) reasons.push('shadow-compare-errors');
    if (diff && diff.nonRenderableCount && diff.nonRenderableCount.uiRendererRisk && cfg.allowUiRendererRisk !== true) {
      reasons.push('ui-renderer-risk');
    }
    if (diff && diff.durationMin && typeof diff.durationMin.deltaMin === 'number') {
      if (Math.abs(diff.durationMin.deltaMin) > cfg.maxDurationDeltaMin) reasons.push('duration-delta');
    }
    if (diff && diff.exerciseCount) {
      const newCount = Number(diff.exerciseCount.new || 0);
      const oldCount = Number(diff.exerciseCount.old || 0);
      if (Math.abs(newCount - oldCount) > cfg.maxExerciseDelta) reasons.push('exercise-count-delta');
    }
    if (diff && diff.dangerBudget && diff.dangerBudget.new) {
      const overBy = Number(diff.dangerBudget.new.overBy || 0);
      if (overBy > cfg.maxDangerOverBudget) reasons.push('danger-budget');
    }

    return {
      ok: reasons.length === 0,
      reasons: reasons,
      telemetry: telemetry,
      lastShadowDiff: diff,
      thresholds: cfg
    };
  }

  function createStranglerRouter(opts) {
    const o = opts || {};
    const telemetry = o.telemetry || createTelemetry({ sourceKeys: o.sourceKeys, now: o.now });
    const oldEngine = typeof o.oldEngine === 'function' ? o.oldEngine : function () { return null; };
    const newEngine = typeof o.newEngine === 'function' ? o.newEngine : function () { return null; };
    const enrich = typeof o.enrich === 'function' ? o.enrich : function (x) { return x; };
    const validate = typeof o.validate === 'function' ? o.validate : function (x) { return !!x; };
    const useNew = typeof o.useNew === 'function' ? o.useNew : function () { return false; };
    const useShadow = typeof o.useShadow === 'function' ? o.useShadow : function () { return false; };
    const shadowDiff = typeof o.shadowDiff === 'function' ? o.shadowDiff : function () { return null; };
    const warn = typeof o.warn === 'function' ? o.warn : function () {};
    const debug = typeof o.debug === 'function' ? o.debug : function () {};

    function recommend(input) {
      const enriched = enrich(input);
      if (!useNew()) {
        telemetry.setSource('old');
        return oldEngine(enriched);
      }
      const builder = newEngine();
      if (!builder || typeof builder.recommendDay !== 'function') {
        telemetry.setSource('fallback', 'missing-builder');
        return oldEngine(enriched);
      }
      try {
        const result = builder.recommendDay(enriched);
        if (result === null || result === undefined) {
          telemetry.setSource('fallback', 'empty-builder-result');
          return oldEngine(enriched);
        }
        if (!validate(result)) {
          warn('contract', result);
          telemetry.setSource('fallback-contract', 'contract');
          return oldEngine(enriched);
        }
        telemetry.setSource('new');
        if (useShadow()) {
          try {
            const oldResult = oldEngine(input);
            const diff = shadowDiff(result, oldResult);
            telemetry.logShadow(diff);
            debug(diff);
          } catch (shadowErr) {
            telemetry.logShadowError();
            warn('shadow-error', shadowErr);
          }
        }
        return result;
      } catch (err) {
        warn('exception', err);
        telemetry.setSource('fallback-error', 'exception');
        return oldEngine(input);
      }
    }

    return {
      recommend: recommend,
      telemetry: telemetry,
      getTelemetry: telemetry.copy,
      resetTelemetry: telemetry.reset,
      get lastSource() { return telemetry.getLastSource(); },
      get lastShadowDiff() { return telemetry.getLastShadowDiff(); }
    };
  }

  TK.router = {
    __registered: true,
    DEFAULT_SOURCE_KEYS: DEFAULT_SOURCE_KEYS,
    DEFAULT_ROLLOUT_GATE: DEFAULT_ROLLOUT_GATE,
    emptyTelemetry: emptyTelemetry,
    copyTelemetry: copyTelemetry,
    createTelemetry: createTelemetry,
    evaluateRolloutGate: evaluateRolloutGate,
    createStranglerRouter: createStranglerRouter
  };
})(typeof window !== 'undefined' ? window : globalThis);
