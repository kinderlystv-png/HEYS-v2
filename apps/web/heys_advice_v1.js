/**
 * heys_advice_v1.js - Legacy Shim
 * 
 * ⚠️ DEPRECATED: This file is a lightweight shim for backwards compatibility.
 * The actual advice engine has been refactored into a modular system:
 * 
 * - advice/_core.js - Main aggregator and engine
 * - advice/_nutrition.js - Nutrition-specific advice
 * - advice/_timing.js - Timing and meal schedule advice
 * - advice/_training.js - Workout-related advice
 * - advice/_emotional.js - Stress and emotional patterns
 * - advice/_hydration.js - Water intake advice
 * - advice/_other.js - Miscellaneous advice (supplements, achievements, etc.)
 * 
 * This shim exists only to prevent errors if any code directly references heys_advice_v1.js.
 * All functionality is provided by the modular system loaded via index.html.
 * 
 * Migration date: 2026-01-16
 * Original size: 6857 lines → 25 lines (shim)
 * Bundle savings: ~200KB
 */

(() => {
  'use strict';

  window.HEYS = window.HEYS || {};

  // Early exit if modular system already loaded
  if (window.HEYS.adviceEngine) return;

  // Fallback: warn if modular system missing (without console usage)
  const msg =
    '[HEYS Advice v1] ⚠️ Modular advice system missing. ' +
    'Ensure heys_advice_bundle_v1.js (or advice/_*.js) is loaded in index.html';
  if (window.HEYS.analytics?.trackError) {
    window.HEYS.analytics.trackError(new Error(msg), {
      source: 'heys_advice_v1.js',
      type: 'shim_warning',
    });
  }
})();
