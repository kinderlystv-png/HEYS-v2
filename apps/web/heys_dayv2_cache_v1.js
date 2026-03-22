// heys_dayv2_cache_v1.js — Day data index & in-memory cache for heavy clients
// Part of boot-core bundle. Provides:
//   - HEYS.dayCache.getDay(dateStr)       → parsed dayv2 from memory cache
//   - HEYS.dayCache.getDayCount()         → fast count without localStorage scan
//   - HEYS.dayCache.getDayDates()         → sorted date list
//   - HEYS.dayCache.getPreviousDays(n)    → array of parsed dayv2 objects
//   - HEYS.dayCache.invalidate(dateStr)   → drop single date from cache
//   - HEYS.dayCache.invalidateAll()       → rebuild index on next access
; (function (global) {
    'use strict';
    var HEYS = global.HEYS = global.HEYS || {};
    var TAG = '[HEYS.dayCache]';

    // ── Config ──
    var MAX_CACHE_SIZE = 90;     // LRU entries
    var INDEX_KEY = 'heys_dayv2_index_v1';
    var INDEX_TTL_MS = 5 * 60 * 1000; // rebuild interval cap

    // ── State ──
    var _parsed = new Map();       // dateStr -> parsed dayv2
    var _accessOrder = [];         // LRU tracking (dateStr list, most-recent last)
    var _index = null;             // { dates: string[], count: number, builtAt: number }
    var _indexDirty = true;        // force rebuild on first access

    // ── Helpers ──
    function getStore() { return HEYS.store || null; }
    function getLsGet() { return (HEYS.utils && HEYS.utils.lsGet) || null; }

    function getClientId() {
        var U = HEYS.utils || {};
        return (U.getCurrentClientId && U.getCurrentClientId()) || HEYS.currentClientId || '';
    }

    function dayKeyForDate(dateStr) {
        return 'heys_dayv2_' + dateStr;
    }

    /** Read raw day from store/localStorage (namespace-aware through Store.get) */
    function readRawDay(dateStr) {
        var key = dayKeyForDate(dateStr);
        var store = getStore();
        if (store && store.get) {
            return store.get(key, null);
        }
        var lsGet = getLsGet();
        if (lsGet) {
            return lsGet(key, null);
        }
        return null;
    }

    // ── LRU helpers ──
    function touchLru(dateStr) {
        var idx = _accessOrder.indexOf(dateStr);
        if (idx !== -1) _accessOrder.splice(idx, 1);
        _accessOrder.push(dateStr);
        // Evict oldest if over limit
        while (_accessOrder.length > MAX_CACHE_SIZE) {
            var evicted = _accessOrder.shift();
            _parsed.delete(evicted);
        }
    }

    // ── Index builder ──
    // Scans localStorage ONCE to build index of all dayv2 date keys
    function buildIndex() {
        var dates = [];
        var clientId = getClientId();
        var prefix = clientId ? ('heys_' + clientId + '_dayv2_') : 'heys_dayv2_';
        var prefixLen = prefix.length;
        // Also check unscoped keys (legacy)
        var legacyPrefix = 'heys_dayv2_';
        var legacyPrefixLen = legacyPrefix.length;

        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!k) continue;
                var dateStr = null;
                if (k.indexOf(prefix) === 0 && k.length === prefixLen + 10) {
                    dateStr = k.substring(prefixLen);
                } else if (clientId && k.indexOf(legacyPrefix) === 0 && k.length === legacyPrefixLen + 10 && k.indexOf('_heys_') === -1) {
                    // Legacy unscoped key like heys_dayv2_2025-12-07, only if no client prefix collision
                    dateStr = k.substring(legacyPrefixLen);
                }
                if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    dates.push(dateStr);
                }
            }
        } catch (e) {
            console.warn(TAG, '⚠️ buildIndex error:', e && e.message);
        }

        dates.sort();
        _index = { dates: dates, count: dates.length, builtAt: Date.now() };
        _indexDirty = false;
        console.info(TAG, '📊 Index built:', dates.length, 'days');
        return _index;
    }

    function ensureIndex() {
        if (_indexDirty || !_index) return buildIndex();
        // Stale check
        if (Date.now() - _index.builtAt > INDEX_TTL_MS) {
            _indexDirty = true;
            return buildIndex();
        }
        return _index;
    }

    // ── Public API ──

    /** Get parsed dayv2 for a date, using in-memory cache */
    function getDay(dateStr) {
        if (_parsed.has(dateStr)) {
            touchLru(dateStr);
            return _parsed.get(dateStr);
        }
        var raw = readRawDay(dateStr);
        if (raw && typeof raw === 'object') {
            _parsed.set(dateStr, raw);
            touchLru(dateStr);
            return raw;
        }
        return null;
    }

    /** Fast day count without full localStorage scan */
    function getDayCount() {
        var idx = ensureIndex();
        return idx.count;
    }

    /** Sorted date list */
    function getDayDates() {
        var idx = ensureIndex();
        return idx.dates.slice(); // defensive copy
    }

    /**
     * Get N previous days (yesterday = index 0). Uses cache.
     * Returns array[0] = yesterday, array[n-1] = n days ago
     */
    function getPreviousDays(n) {
        var result = [];
        var today = new Date();
        for (var i = 1; i <= n; i++) {
            var d = new Date(today);
            d.setDate(d.getDate() - i);
            var ds = d.toISOString().slice(0, 10);
            result.push(getDay(ds));
        }
        return result;
    }

    /** Invalidate a single date from cache (e.g. after day save) */
    function invalidateDate(dateStr) {
        _parsed.delete(dateStr);
        var idx = _accessOrder.indexOf(dateStr);
        if (idx !== -1) _accessOrder.splice(idx, 1);
        // Also invalidate Store memory cache so next read gets fresh data
        var store = getStore();
        if (store && store.invalidate) {
            store.invalidate(dayKeyForDate(dateStr));
        }
    }

    /** Mark index as dirty — will rebuild on next getDayCount/getDayDates */
    function invalidateAll() {
        _indexDirty = true;
        _parsed.clear();
        _accessOrder.length = 0;
    }

    /**
     * Notify that a date was added/updated.
     * Updates index incrementally without full rebuild.
     */
    function notifyDateUpdated(dateStr) {
        if (!dateStr) return;
        invalidateDate(dateStr); // drop stale parsed cache
        if (_index && !_indexDirty) {
            // Incremental index update
            if (_index.dates.indexOf(dateStr) === -1) {
                _index.dates.push(dateStr);
                _index.dates.sort();
                _index.count = _index.dates.length;
            }
        }
    }

    // ── Event listeners for auto-invalidation ──
    function onDayUpdated(e) {
        var detail = e && e.detail;
        // ⚡ Handle batch events (cloud-sync dispatches dates[] array)
        if (detail && detail.batch && Array.isArray(detail.dates)) {
            console.info(TAG, '🔄 Batch invalidation:', detail.dates.length, 'dates');
            invalidateAll();
            return;
        }
        var dateStr = detail && detail.date;
        if (dateStr) {
            notifyDateUpdated(dateStr);
        } else {
            // If no specific date, invalidate all
            invalidateAll();
        }
    }

    function onSyncComplete() {
        // After full sync, rebuild index
        console.info(TAG, '🔄 Sync complete → invalidateAll');
        invalidateAll();
    }

    // Subscribe to events (safe: listeners are additive)
    if (typeof global.addEventListener === 'function') {
        global.addEventListener('heys:day-updated', onDayUpdated);
        global.addEventListener('day-updated', onDayUpdated);
        global.addEventListener('heysSyncCompleted', onSyncComplete);
        global.addEventListener('day-saved', function (e) {
            var dateStr = e && e.detail && e.detail.date;
            if (dateStr) notifyDateUpdated(dateStr);
        });
    }

    // ── Export ──
    HEYS.dayCache = {
        getDay: getDay,
        getDayCount: getDayCount,
        getDayDates: getDayDates,
        getPreviousDays: getPreviousDays,
        invalidate: invalidateDate,
        invalidateAll: invalidateAll,
        notifyDateUpdated: notifyDateUpdated,
        // Diagnostic
        _getCacheSize: function () { return _parsed.size; },
        _getIndex: function () { return _index; }
    };

    console.info(TAG, '✅ dayv2 cache module loaded (LRU=' + MAX_CACHE_SIZE + ')');
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
