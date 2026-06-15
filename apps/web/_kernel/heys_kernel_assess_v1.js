// heys_kernel_assess_v1.js — ОБЩЕЕ ЯДРО: математика оценки/лимитера.
//
// ФАКТ на сейчас: единым (single source) сделана ФОРМУЛА ДЕФИЦИТА (CONSTRUCTOR_SPEC
// §3.1) — её зовут доменные assessment-модули.
// Бенчмарки/нормы/levelPrior/тип-классификатор — доменные; общий слой получает
// уже посчитанные deficit/flag/prior и строит leadingLimiter/blockWeights/stimulus
// без знания спорта.
//
// Public API (HEYS.TrainingKernel.assess):
//   clamp01(x)                  — clamp в [0,1]; не-число → 0
//   deficit(benchmark, score)   — clamp01((benchmark−score)/benchmark); 0 при нет данных
//   normalize(map)              — значения объекта → доли (сумма 1); нули если сумма ≤0
//   argmaxKey(map)              — ключ с max числовым значением (null если пусто)
//   limiter(candidates, opts)   — общий assessment→limiter pipeline

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.assess && TK.assess.__registered) return; // idempotent

  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function clamp01(x) { const v = num(x); return v === null ? 0 : Math.max(0, Math.min(1, v)); }

  // deficit = clamp((benchmark − score) / benchmark, 0, 1); 0 при отсутствии данных.
  function deficit(benchmark, score) {
    const b = num(benchmark);
    if (b === null || b <= 0) return 0;
    const s = num(score);
    if (s === null) return 0;
    return clamp01((b - s) / b);
  }

  function normalize(map) {
    const out = {};
    const keys = Object.keys(map || {});
    let sum = 0;
    keys.forEach(function (k) { const v = num(map[k]) || 0; sum += v > 0 ? v : 0; });
    keys.forEach(function (k) { const v = num(map[k]) || 0; out[k] = sum > 0 ? (v > 0 ? v / sum : 0) : 0; });
    return out;
  }

  function argmaxKey(map) {
    let bestK = null, bestV = -Infinity;
    Object.keys(map || {}).forEach(function (k) {
      const v = num(map[k]);
      if (v !== null && v > bestV) { bestV = v; bestK = k; }
    });
    return bestK;
  }

  function asCandidate(raw, index, opts) {
    const o = opts || {};
    const c = raw && typeof raw === 'object' ? raw : {};
    const id = c.id || c.key || c.quality || c.testId || String(index);
    const deficitValue = clamp01(c.deficit);
    const flagValue = clamp01(c.flag);
    const prior = num(c.prior);
    const baseScore = num(c.score);
    const score = baseScore !== null
      ? baseScore
      : Math.max(deficitValue, flagValue) * (prior !== null ? prior : 1);
    return {
      id: id,
      index: index,
      deficit: deficitValue,
      flag: flagValue,
      prior: prior !== null ? prior : 1,
      score: score,
      raw: c,
      payload: c.payload || c.row || null
    };
  }

  function weightsFromScores(items, opts) {
    const o = opts || {};
    const weights = {};
    let total = 0;
    items.forEach(function (item) {
      const v = num(item.score) || 0;
      const score = v > 0 ? v : 0;
      weights[item.id] = score;
      total += score;
    });
    if (total > 0) {
      Object.keys(weights).forEach(function (id) { weights[id] = weights[id] / total; });
      return weights;
    }
    if (o.zeroTotalPolicy === 'uniform' && items.length) {
      items.forEach(function (item) { weights[item.id] = 1 / items.length; });
      return weights;
    }
    Object.keys(weights).forEach(function (id) { weights[id] = 0; });
    return weights;
  }

  function limiter(candidates, opts) {
    const o = opts || {};
    const items = (Array.isArray(candidates) ? candidates : []).map(function (c, index) {
      return asCandidate(c, index, o);
    });
    let leading = null;
    items.forEach(function (item) {
      if (!leading || item.score > leading.score) leading = item;
    });
    const limiterScores = {};
    const deficits = {};
    const flags = {};
    items.forEach(function (item) {
      limiterScores[item.id] = item.score;
      deficits[item.id] = item.deficit;
      flags[item.id] = item.flag;
    });
    const blockWeights = typeof o.blockWeights === 'function'
      ? (o.blockWeights(items, leading) || {})
      : weightsFromScores(items, o);
    const stimulus = {};
    items.forEach(function (item) {
      stimulus[item.id] = item === leading ? (o.leadingStimulus || 'develop') : (o.otherStimulus || 'maintain');
    });
    return {
      leadingLimiter: leading ? leading.id : null,
      leading: leading,
      limiterScores: limiterScores,
      deficits: deficits,
      flags: flags,
      blockWeights: blockWeights,
      stimulus: stimulus,
      maxLimiterScore: leading ? leading.score : 0,
      rows: items
    };
  }

  TK.assess = {
    __registered: true,
    clamp01: clamp01,
    deficit: deficit,
    normalize: normalize,
    argmaxKey: argmaxKey,
    limiter: limiter
  };
})(typeof window !== 'undefined' ? window : globalThis);
