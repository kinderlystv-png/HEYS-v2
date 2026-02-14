// pi_science_info.js — Compatibility bridge for SCIENCE_INFO
// v4.0.0: Source of truth moved to pi_constants.js (HEYS.InsightsPI.constants.SCIENCE_INFO)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.InsightsPI = HEYS.InsightsPI || {};

    const constants = HEYS.InsightsPI.constants || global.piConst || {};
    const SCIENCE_INFO = constants.SCIENCE_INFO || {};

    // Backward-compatible exports for legacy modules
    HEYS.InsightsPI.science = SCIENCE_INFO;
    global.piScience = SCIENCE_INFO;
})(typeof window !== 'undefined' ? window : global);
