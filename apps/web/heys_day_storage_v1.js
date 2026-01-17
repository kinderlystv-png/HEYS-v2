// heys_day_storage_v1.js — DayTab storage helpers (dynamic HEYS.utils)
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    let warnedGet = false;
    let warnedSet = false;

    function trackOnce(message, context) {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(message, context);
        }
    }

    function fallbackGet(key, defaultValue) {
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw == null ? null : JSON.parse(raw);
            return parsed == null ? defaultValue : parsed;
        } catch (e) {
            return defaultValue;
        }
    }

    function fallbackSet(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // ignore storage errors
        }
    }

    function lsGet(key, defaultValue) {
        const utils = HEYS.utils || {};
        if (typeof utils.lsGet === 'function') {
            return utils.lsGet(key, defaultValue);
        }
        if (!warnedGet) {
            warnedGet = true;
            trackOnce('[heys_day_storage] HEYS.utils.lsGet not available', { key });
        }
        return fallbackGet(key, defaultValue);
    }

    function lsSet(key, value) {
        const utils = HEYS.utils || {};
        if (typeof utils.lsSet === 'function') {
            utils.lsSet(key, value);
            return;
        }
        if (!warnedSet) {
            warnedSet = true;
            trackOnce('[heys_day_storage] HEYS.utils.lsSet not available', { key });
        }
        fallbackSet(key, value);
    }

    HEYS.dayStorage = {
        lsGet,
        lsSet
    };
})(window);
