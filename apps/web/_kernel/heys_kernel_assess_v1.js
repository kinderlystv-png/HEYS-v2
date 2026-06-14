// heys_kernel_assess_v1.js — ОБЩЕЕ ЯДРО: математика оценки/лимитера.
//
// ФАКТ на сейчас: единым (single source) сделана ФОРМУЛА ДЕФИЦИТА (CONSTRUCTOR_SPEC
// §3.1) — её зовут оба домена (fingers computeDeficit / mobility scoreMeasurement).
// `normalize`/`argmaxKey` — ГОТОВЫЕ утилиты ядра, но домены ПОКА считают
// leadingLimiter/blockWeights локально (у пальцев есть нюанс: при total=0 веса
// распределяются равномерно 1/N, а не в нули) — поэтому их не вотвайрим, чтобы не
// менять поведение. Бенчмарки/нормы/levelPrior/тип-классификатор — доменные.
//
// Public API (HEYS.TrainingKernel.assess):
//   clamp01(x)                  — clamp в [0,1]; не-число → 0
//   deficit(benchmark, score)   — clamp01((benchmark−score)/benchmark); 0 при нет данных
//   normalize(map)              — значения объекта → доли (сумма 1); нули если сумма ≤0
//   argmaxKey(map)              — ключ с max числовым значением (null если пусто)

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

  TK.assess = {
    __registered: true,
    clamp01: clamp01,
    deficit: deficit,
    normalize: normalize,
    argmaxKey: argmaxKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
