// heys_kernel_stats_v1.js — ОБЩЕЕ ЯДРО: робастная статистика для readiness/трендов.
//
// Single source числовой математики, которую дублировали readiness-модули режимов:
// median, MAD-сигма (×1.4826 с полом), robust z-score. Доменное (какие сигналы,
// пороги band, advisory-тексты, окна истории) остаётся в доменных readiness.
//
// Public API (HEYS.TrainingKernel.stats):
//   MAD_SCALE                      — 1.4826 (MAD → σ для нормального распределения)
//   median(arr)                    — медиана (0 для пустого)
//   madSigma(arr, floor=0)         — robust σ = median(|v−med|)·1.4826, не ниже floor
//   robustZ(value, center, sigma)  — (value−center)/sigma; null если sigma falsy/невалидно
//   zFromArray(value, arr, floor)  — robust z по массиву (center=median, σ=madSigma)

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.stats && TK.stats.__registered) return; // idempotent

  const MAD_SCALE = 1.4826;

  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }

  function median(arr) {
    if (!arr || !arr.length) return 0;
    const sorted = arr.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function madSigma(arr, floor) {
    const f = num(floor) || 0;
    if (!arr || !arr.length) return Math.max(1, f); // пусто → 1 (как у пальцев)
    const med = median(arr);
    const deviations = arr.map(function (v) { return Math.abs(v - med); });
    const sigma = median(deviations) * MAD_SCALE;
    return Math.max(sigma, f);
  }

  function robustZ(value, center, sigma) {
    const v = num(value), c = num(center), s = num(sigma);
    if (v === null || c === null || !s) return null;
    return (v - c) / s;
  }

  function zFromArray(value, arr, floor) {
    return robustZ(value, median(arr), madSigma(arr, floor));
  }

  TK.stats = {
    __registered: true,
    MAD_SCALE: MAD_SCALE,
    median: median,
    madSigma: madSigma,
    robustZ: robustZ,
    zFromArray: zFromArray
  };
})(typeof window !== 'undefined' ? window : globalThis);
