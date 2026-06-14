// heys_mobility_readiness_v1.js — мягкий readiness-сигнал для мобильности.
//
// Не блокирует сессию; возвращает advisory для mode_engine/UI.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__readinessRegistered) return;
  Mobility.__readinessRegistered = true;

  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function clamp(x, min, max) { return Math.max(min, Math.min(max, x)); }
  // robust z — из ОБЩЕГО ЯДРА (HEYS.TrainingKernel.stats); фолбэк локальный.
  function hrvZ(today, baseline, mad) {
    const t = num(today), b = num(baseline), m = num(mad);
    if (t === null || b === null || !m) return null;
    const ks = HEYS.TrainingKernel && HEYS.TrainingKernel.stats;
    const scale = ks && ks.MAD_SCALE ? ks.MAD_SCALE : 1.4826;
    const sigma = m * scale;
    return ks && ks.robustZ ? ks.robustZ(t, b, sigma) : (t - b) / sigma;
  }
  function score(input) {
    const x = input || {};
    let s = 100;
    const stiffness = num(x.stiffness);
    const soreness = num(x.soreness);
    const sleep = num(x.sleepQuality);
    const stress = num(x.stress);
    if (stiffness !== null) s -= clamp(stiffness, 0, 10) * 3;
    if (soreness !== null) s -= clamp(soreness, 0, 10) * 4;
    if (sleep !== null) s += (clamp(sleep, 0, 10) - 7) * 3;
    if (stress !== null) s -= clamp(stress, 0, 10) * 2;
    const z = hrvZ(x.hrvToday, x.hrvBaseline, x.hrvMad);
    if (z !== null && z < -1) s -= Math.min(20, Math.abs(z) * 8);
    s = Math.round(clamp(s, 0, 100));
    const band = s >= 75 ? 'green' : s >= 50 ? 'yellow' : 'red';
    return {
      score: s,
      band: band,
      hrvZ: z,
      blocksSession: false,
      advisory: band === 'red'
        ? 'снизить интенсивность: CARs, дыхание, лёгкое восстановление'
        : band === 'yellow'
          ? 'оставить мягкий объём, без форсирования end-range'
          : 'готовность нормальная'
    };
  }

  Mobility.readiness = {
    __registered: true,
    score: score,
    hrvZ: hrvZ
  };
})(typeof window !== 'undefined' ? window : globalThis);
