// heys_release_features_v1.js — centralized release/runtime feature switches.
//
// Temporary rollout policy: What's New stays implemented but fully dormant.
// Re-enable it by changing the single value below to `true`, then follow the
// checklist in docs/reference/systems/PWA_OFFLINE_PUSH.md.

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  HEYS.ReleaseFeatures = Object.freeze({
    whatsNewEnabled: false,
  });
})(typeof window !== 'undefined' ? window : globalThis);
