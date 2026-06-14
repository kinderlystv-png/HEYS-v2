// heys_kernel_progression_v1.js — ОБЩЕЕ ЯДРО: progression primitives.
//
// Не общий "движок прогрессии": критерии и оси остаются доменными. Здесь только
// безопасные кирпичи: relative plateau по time-series, range plateau по values и
// переход к следующей оси в переданном policy.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.progression && TK.progression.__registered) return;

  function num(x) {
    return typeof x === 'number' && isFinite(x) ? x : null;
  }

  function relativePlateau(opts) {
    const o = opts || {};
    const series = Array.isArray(o.series) ? o.series : [];
    const win = Math.max(2, num(o.windowSessions) || 3);
    const threshold = num(o.improvementThreshold);
    const thr = threshold !== null ? threshold : 0;

    if (series.length < win) {
      return {
        hasPlateau: false,
        sessionsCount: series.length,
        deltaPct: null,
        reason: 'недостаточно данных (<' + win + ' сессий)'
      };
    }

    const window = series.slice(-win);
    const first = num(window[0] && window[0].value);
    const last = num(window[window.length - 1] && window[window.length - 1].value);

    if (first === null || first <= 0 || last === null) {
      return {
        hasPlateau: false,
        sessionsCount: window.length,
        deltaPct: null,
        reason: 'невалидные значения метрики в окне'
      };
    }

    const delta = (last - first) / first;
    const hasPlateau = delta <= thr;
    return {
      hasPlateau: hasPlateau,
      sessionsCount: window.length,
      deltaPct: delta * 100,
      reason: hasPlateau
        ? 'нет прироста за ' + window.length + ' сессий (' + (delta * 100).toFixed(1) + '%)'
        : 'прирост ' + (delta * 100).toFixed(1) + '% за ' + window.length + ' сессий'
    };
  }

  function rangePlateau(values, opts) {
    const o = opts || {};
    const list = Array.isArray(values) ? values : [];
    const win = Math.max(2, num(o.windowSize) || 3);
    const threshold = num(o.rangeThreshold);
    const thr = threshold !== null ? threshold : 0;
    if (list.length < win) {
      return { hasPlateau: false, count: list.length, range: null, reason: 'insufficient_data' };
    }
    const last = list.slice(-win).map(function (v) { return Number(v); }).filter(function (v) { return isFinite(v); });
    if (last.length < win) return { hasPlateau: false, count: last.length, range: null, reason: 'invalid_values' };
    const range = Math.max.apply(null, last) - Math.min.apply(null, last);
    return {
      hasPlateau: range < thr,
      count: last.length,
      range: range,
      reason: range < thr ? 'range_below_threshold' : 'range_above_threshold'
    };
  }

  function nextAxis(policy, currentAxis) {
    const list = Array.isArray(policy) && policy.length ? policy.slice() : ['volume'];
    if (!currentAxis) return { nextAxis: list[0], exhausted: false, policy: list };
    const idx = list.indexOf(currentAxis);
    if (idx < 0) return { nextAxis: list[0], exhausted: false, policy: list };
    if (idx + 1 >= list.length) return { nextAxis: null, exhausted: true, policy: list };
    return { nextAxis: list[idx + 1], exhausted: false, policy: list };
  }

  TK.progression = {
    __registered: true,
    relativePlateau: relativePlateau,
    rangePlateau: rangePlateau,
    nextAxis: nextAxis
  };
})(typeof window !== 'undefined' ? window : globalThis);
