// heys_iw_lipolysis.js — deprecated compatibility surface
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.InsulinWave = HEYS.InsulinWave || {};

  // v5 no longer infers metabolic substrate use from elapsed time after a meal.
  // Keep the namespace temporarily so older callers fail neutral while migrating.
  HEYS.InsulinWave.Lipolysis = Object.freeze({
    deprecated: true,
    getLipolysisRecord: () => ({ minutes: 0, date: null }),
    updateLipolysisRecord: () => false,
    getLipolysisHistory: () => [],
    saveDayLipolysis: () => [],
    calculateLipolysisStreak: () => ({ current: 0, best: 0 }),
  });
})(typeof window !== 'undefined' ? window : globalThis);
