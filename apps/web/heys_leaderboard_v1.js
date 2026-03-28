// heys_leaderboard_v1.js — Cloud leaderboard service (v1.4.0)
// Глобальный opt-in лидерборд: публикация snapshot-ов + fetch рейтинга.
// v1.4.0: auto-publish accurate historical CEB via computeHistoricalCEB
// v1.3.0: server-side CEB computation — weekly scores computed from client_kv_store on the server

(function () {
    'use strict';

    var HEYS = window.HEYS = window.HEYS || {};

    var LOCAL_KEY = 'heys_leaderboard_sharing';
    var PUBLISH_DEBOUNCE_MS = 5000;
    var CACHE_TTL_MS = 30000;

    var _lastPublished = null;
    var _debounceTimer = null;
    var _leaderboardCache = null;

    function _getStore() { return HEYS.store; }
    function _getApi() { return HEYS.YandexAPI; }
    function _getCloud() { return HEYS.cloud; }
    function _getUtils() { return HEYS.utils; }
    function _getDayUtils() { return HEYS.dayUtils; }
    function _getModels() { return HEYS.models; }
    function _getCascadeCard() { return HEYS.CascadeCard; }
    function _getLastCrs() { return HEYS._lastCrs; }

    // ── Helpers ───────────────────────────────────────────

    function _getSessionToken() {
        var cloud = _getCloud();
        var raw = (cloud && cloud.getSessionToken ? cloud.getSessionToken() : null)
            || localStorage.getItem('heys_session_token');
        return raw ? String(raw).replace(/"/g, '') : null;
    }

    function _getDisplayName() {
        try {
            var store = _getStore();
            var prof = (store && store.get ? store.get('heys_profile') : null) || {};
            if (typeof prof === 'string') { try { prof = JSON.parse(prof); } catch (_) { prof = {}; } }
            var fn = (prof.firstName || '').trim();
            var ln = (prof.lastName || '').trim();
            return (fn + (ln ? ' ' + ln : '')).trim() || 'Участник';
        } catch (_) { return 'Участник'; }
    }

    function _getTodayStr() {
        try {
            var dayUtils = _getDayUtils();
            var models = _getModels();
            var utils = _getUtils();
            if (dayUtils && typeof dayUtils.todayISO === 'function') {
                return dayUtils.todayISO();
            }
            if (models && typeof models.todayISO === 'function') {
                return models.todayISO();
            }
            if (utils && typeof utils.getTodayKey === 'function') {
                return utils.getTodayKey();
            }
            if (utils && typeof utils.getTodayStr === 'function') {
                return utils.getTodayStr();
            }
        } catch (_) { /* fallback below */ }

        var d = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }



    // ── Sharing preference ────────────────────────────────

    function isSharingEnabled() {
        try {
            var store = _getStore();
            if (store && store.get) {
                var val = store.get(LOCAL_KEY, null);
                if (val !== null && val !== undefined) {
                    if (typeof val === 'boolean') return val;
                    if (typeof val === 'string') return val === 'true' || val === '1';
                    return !!val;
                }
            }
            var raw = localStorage.getItem(LOCAL_KEY);
            return raw === 'true' || raw === '1';
        } catch (_) { return false; }
    }

    function _setSharingLocal(enabled) {
        try {
            var store = _getStore();
            if (store && store.set) {
                store.set(LOCAL_KEY, enabled ? 'true' : 'false');
            } else {
                localStorage.setItem(LOCAL_KEY, enabled ? 'true' : 'false');
            }
        } catch (_) { /* offline-safe */ }
    }

    /**
     * Toggle sharing on/off (local + cloud).
     * @param {boolean} enabled
     * @param {string} [displayName] Optional display name override
     * @returns {Promise<object|null>}
     */
    function toggleSharing(enabled, displayName) {
        _setSharingLocal(enabled);

        // Invalidate cache so next dropdown open fetches fresh data
        _leaderboardCache = null;

        var token = _getSessionToken();
        if (!token) {
            console.warn('[HEYS.leaderboard] ⚠️ No session token — sharing saved locally only');
            return Promise.resolve(null);
        }
        var api = _getApi();
        if (!api || !api.rpc) {
            console.warn('[HEYS.leaderboard] ⚠️ YandexAPI not available — sharing saved locally only');
            return Promise.resolve(null);
        }

        return api.rpc('toggle_leaderboard_sharing_by_session', {
            p_session_token: token,
            p_enabled: enabled,
            p_display_name: displayName || _getDisplayName()
        }).then(function (result) {
            console.info('[HEYS.leaderboard] 🔄 Sharing toggled:', enabled, result);

            // If enabling, immediately publish current snapshot
            if (enabled) {
                _publishNow();
            }

            return result;
        }).catch(function (err) {
            console.error('[HEYS.leaderboard] ❌ Toggle sharing failed:', err && err.message);
            return null;
        });
    }

    // ── Publish ───────────────────────────────────────────

    function _publishNow() {
        if (!isSharingEnabled()) return;

        var token = _getSessionToken();
        var api = _getApi();
        if (!token || !api || !api.rpc) return;

        // Get current CEB from live cascade
        var crs = _getLastCrs();
        var events = crs && crs.events;
        if (!events || !events.length) return;

        var cascadeCard = _getCascadeCard();
        var cebMeta = cascadeCard && cascadeCard.computeCEBMetaFromEvents
            ? cascadeCard.computeCEBMetaFromEvents(events)
            : null;
        if (!cebMeta) return;

        var score = cebMeta.score;
        var pct = cebMeta.pct;
        var dateStr = _getTodayStr();

        // Dedup: skip if same data already published
        if (_lastPublished && _lastPublished.date === dateStr
            && _lastPublished.score === score && _lastPublished.pct === pct) {
            return;
        }

        api.rpc('publish_leaderboard_snapshot_by_session', {
            p_session_token: token,
            p_snapshot_date: dateStr,
            p_display_name: _getDisplayName(),
            p_day_balance: score,
            p_cascade_pct: pct
        }).then(function (result) {
            _lastPublished = { date: dateStr, score: score, pct: pct };
            _leaderboardCache = null;
            console.info('[HEYS.leaderboard] 📤 Snapshot published:', score, '(' + pct + '%)', dateStr);
        }).catch(function (err) {
            console.error('[HEYS.leaderboard] ❌ Publish failed:', err && err.message);
        });
    }

    /**
     * Debounced publish — called after cascade recompute.
     * Publishes at most once per PUBLISH_DEBOUNCE_MS.
     */
    function publishSnapshot() {
        if (!isSharingEnabled()) return;
        if (_debounceTimer) clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(_publishNow, PUBLISH_DEBOUNCE_MS);
    }

    // ── Fetch leaderboard ─────────────────────────────────

    /**
     * Fetch leaderboard from cloud for a given date.
     * Returns cached result if fresh enough (< CACHE_TTL_MS).
     * @param {string} dateStr — ISO date string (YYYY-MM-DD)
     * @returns {Promise<Array>}
     */
    function fetchLeaderboard(dateStr) {
        var date = dateStr || _getTodayStr();

        // Return cache if fresh
        if (_leaderboardCache && _leaderboardCache.date === date
            && (Date.now() - _leaderboardCache.fetchedAt) < CACHE_TTL_MS) {
            return Promise.resolve(_leaderboardCache.entries);
        }

        var token = _getSessionToken();
        var api = _getApi();
        if (!token || !api || !api.rpc) {
            return Promise.resolve([]);
        }

        return api.rpc('get_leaderboard_by_session', {
            p_session_token: token,
            p_snapshot_date: date
        }).then(function (result) {
            var raw = Array.isArray(result)
                ? result
                : (result && result.data !== undefined ? result.data : []);
            var entries = Array.isArray(raw)
                ? raw
                : (raw && typeof raw === 'object' ? [raw] : []);
            _leaderboardCache = { date: date, entries: entries, fetchedAt: Date.now() };
            console.info('[HEYS.leaderboard] 📥 Leaderboard fetched:', entries.length, 'entries for', date);
            return entries;
        }).catch(function (err) {
            console.error('[HEYS.leaderboard] ❌ Fetch failed:', err && err.message);
            return (_leaderboardCache && _leaderboardCache.entries) || [];
        });
    }

    function invalidateCache() {
        _leaderboardCache = null;
        _weeklyCache = null;
    }

    // ── Weekly leaderboard ────────────────────────────────

    var _weeklyCache = null;
    var WEEKLY_CACHE_TTL_MS = 60000;

    /**
     * Returns array of ISO date strings for the current ISO week (Mon-Sun)
     * up to and including today (HEYS day boundary).
     */
    function _getWeekDates() {
        var today = _getTodayStr();
        var d = new Date(today + 'T12:00:00');
        var dow = d.getDay(); // 0=Sun,1=Mon,...,6=Sat
        var isoDay = dow === 0 ? 7 : dow; // 1=Mon,...,7=Sun
        var mondayOffset = isoDay - 1;
        var monday = new Date(d);
        monday.setDate(monday.getDate() - mondayOffset);

        var dates = [];
        for (var i = 0; i <= mondayOffset; i++) {
            var dd = new Date(monday);
            dd.setDate(dd.getDate() + i);
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            dates.push(dd.getFullYear() + '-' + pad(dd.getMonth() + 1) + '-' + pad(dd.getDate()));
        }
        return dates;
    }

    /**
     * Fetch weekly leaderboard from cloud.
     * Returns { weekDates: string[], entries: Array<{display_name, is_self, daily_scores, avg_balance, days_count}> }
     */
    function fetchWeeklyLeaderboard() {
        var todayStr = _getTodayStr();
        var weekDates = _getWeekDates();

        // Return cache if fresh
        if (_weeklyCache && _weeklyCache.today === todayStr
            && (Date.now() - _weeklyCache.fetchedAt) < WEEKLY_CACHE_TTL_MS) {
            return Promise.resolve({ weekDates: weekDates, entries: _weeklyCache.entries });
        }

        var token = _getSessionToken();
        var api = _getApi();
        if (!token || !api || !api.rpc) {
            return Promise.resolve({ weekDates: weekDates, entries: [] });
        }

        return api.rpc('get_leaderboard_weekly_by_session', {
            p_session_token: token,
            p_today_date: todayStr
        }).then(function (result) {
            var raw = Array.isArray(result)
                ? result
                : (result && result.data !== undefined ? result.data : []);
            var entries = Array.isArray(raw)
                ? raw
                : (raw && typeof raw === 'object' ? [raw] : []);
            _weeklyCache = { today: todayStr, entries: entries, fetchedAt: Date.now() };
            console.info('[HEYS.leaderboard] 📥 Weekly leaderboard fetched:', entries.length, 'entries');

            // Auto-publish accurate historical CEB for self-entries
            try { _backfillHistoricalCEB(weekDates, entries); } catch (e) {
                console.warn('[HEYS.leaderboard] ⚠️ Backfill error:', e && e.message);
            }

            return { weekDates: weekDates, entries: entries };
        }).catch(function (err) {
            console.error('[HEYS.leaderboard] ❌ Weekly fetch failed:', err && err.message);
            var cached = _weeklyCache ? _weeklyCache.entries : [];
            return { weekDates: weekDates, entries: cached };
        });
    }

    // ── Auto-publish historical CEB ──────────────────────

    var _backfillInProgress = false;

    /**
     * After fetching weekly data, compute accurate CEB for self-entries
     * where cloud score is missing or was computed from simplified SQL fallback.
     * Publishes corrections via RPC so leaderboard shows accurate scores.
     */
    function _backfillHistoricalCEB(weekDates, entries) {
        if (_backfillInProgress) return;
        if (!isSharingEnabled()) return;

        var cascadeCard = _getCascadeCard();
        var resolveCEBForDate = cascadeCard && cascadeCard.resolveCEBForDate;
        if (!resolveCEBForDate) {
            console.info('[HEYS.leaderboard] ⚠️ resolveCEBForDate not available, skipping backfill');
            return;
        }

        var token = _getSessionToken();
        var api = _getApi();
        if (!token || !api || !api.rpc) return;

        // Find self-entry
        var selfEntry = null;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i] && entries[i].is_self) { selfEntry = entries[i]; break; }
        }

        var selfDaily = selfEntry ? selfEntry.daily_scores : {};
        if (typeof selfDaily === 'string') {
            try { selfDaily = JSON.parse(selfDaily); } catch (_) { selfDaily = {}; }
        }
        selfDaily = selfDaily || {};

        // Resolve client ID and profile
        var clientId = '';
        try {
            var utils = _getUtils();
            clientId = (utils && utils.getCurrentClientId) ? utils.getCurrentClientId() : '';
        } catch (_) { /* ignore client id fallback */ }
        var profRaw = null;
        try {
            var store = _getStore();
            var scopedProfileKey = clientId ? 'heys_' + clientId + '_profile' : 'heys_profile';
            profRaw = (store && store.get) ? store.get(scopedProfileKey, null) : localStorage.getItem(scopedProfileKey);
            if (profRaw == null) profRaw = (store && store.get) ? store.get('heys_profile', null) : localStorage.getItem('heys_profile');
        } catch (_) { /* ignore profile fallback */ }
        var prof = null;
        try {
            prof = typeof profRaw === 'string' ? JSON.parse(profRaw) : (profRaw || null);
        } catch (_) { prof = null; }

        // Collect prevDays (up to 14 days before this week for baselines)
        var prevDays = [];
        try {
            var storeForPrevDays = _getStore();
            var mondayDate = new Date(weekDates[0] + 'T12:00:00');
            for (var pd = 1; pd <= 14; pd++) {
                var prevDate = new Date(mondayDate);
                prevDate.setDate(prevDate.getDate() - pd);
                var padFn = function (n) { return n < 10 ? '0' + n : '' + n; };
                var prevDateStr = prevDate.getFullYear() + '-' + padFn(prevDate.getMonth() + 1) + '-' + padFn(prevDate.getDate());
                var dayKey = clientId ? 'heys_' + clientId + '_dayv2_' + prevDateStr : 'heys_dayv2_' + prevDateStr;
                var rawDay = (storeForPrevDays && storeForPrevDays.get) ? storeForPrevDays.get(dayKey, null) : localStorage.getItem(dayKey);
                if (rawDay) {
                    var parsedDay = typeof rawDay === 'string' ? JSON.parse(rawDay) : rawDay;
                    prevDays.push(parsedDay);
                } else {
                    prevDays.push(null);
                }
            }
        } catch (_) { /* ignore prevDays enrichment */ }

        // Compute mealBandShift from prevDays (same as computeHistoricalCEB will do internally)
        var lastCrs = _getLastCrs();
        var mealBandShift = (lastCrs && lastCrs.mealBandShift != null)
            ? lastCrs.mealBandShift : 0;

        var todayStr = _getTodayStr();
        var corrections = [];

        for (var di = 0; di < weekDates.length; di++) {
            var dateStr = weekDates[di];
            // Skip today — live cascade handles it
            if (dateStr === todayStr) continue;

            var dayKey2 = clientId ? 'heys_' + clientId + '_dayv2_' + dateStr : 'heys_dayv2_' + dateStr;
            var dayRaw = null;
            try {
                var storeForDay = _getStore();
                dayRaw = (storeForDay && storeForDay.get) ? storeForDay.get(dayKey2, null) : localStorage.getItem(dayKey2);
            } catch (_) { /* ignore exact-day lookup fallback */ }
            if (!dayRaw) continue;

            var dayData = null;
            try {
                dayData = typeof dayRaw === 'string' ? JSON.parse(dayRaw) : dayRaw;
            } catch (_) { continue; }
            if (!dayData || !dayData.meals || !dayData.meals.length) continue;

            var perDateCeb = resolveCEBForDate(dateStr, clientId, {
                day: dayData,
                profile: prof,
                prevDays: prevDays,
                mealBandShift: mealBandShift,
                includeLiveCurrent: false,
                allowSimpleFallback: false,
                silent: true
            });
            if (!perDateCeb) continue;

            var cloudScore = selfDaily[dateStr];
            // Publish if cloud has no score, or if score difference ≥ 0.3
            if (cloudScore === undefined || cloudScore === null
                || Math.abs(Number(cloudScore) - perDateCeb.score) >= 0.3) {
                corrections.push({ date: dateStr, score: perDateCeb.score });
            }
        }

        if (corrections.length === 0) {
            console.info('[HEYS.leaderboard] ✅ Historical CEB: all scores accurate, no corrections needed');
            return;
        }

        console.info('[HEYS.leaderboard] 🔄 Historical CEB corrections needed:', corrections.length, corrections.map(function (c) { return c.date + '=' + c.score; }));
        _backfillInProgress = true;

        var publishQueue = corrections.slice();
        var published = 0;

        function publishNext() {
            if (publishQueue.length === 0) {
                _backfillInProgress = false;
                _weeklyCache = null; // invalidate so next fetch gets corrected data
                console.info('[HEYS.leaderboard] ✅ Historical CEB backfill done:', published, 'corrections published');
                return;
            }
            var item = publishQueue.shift();
            var pct = Math.round((item.score / 10) * 10000) / 100;
            api.rpc('publish_leaderboard_snapshot_by_session', {
                p_session_token: token,
                p_snapshot_date: item.date,
                p_display_name: _getDisplayName(),
                p_day_balance: item.score,
                p_cascade_pct: pct
            }).then(function () {
                published++;
                console.info('[HEYS.leaderboard] 📤 Historical CEB published:', item.date, '→', item.score);
                publishNext();
            }).catch(function (err) {
                console.warn('[HEYS.leaderboard] ⚠️ Historical publish failed for', item.date, ':', err && err.message);
                publishNext();
            });
        }

        publishNext();
    }

    // ── Export ────────────────────────────────────────────

    HEYS.leaderboard = {
        isSharingEnabled: isSharingEnabled,
        toggleSharing: toggleSharing,
        publishSnapshot: publishSnapshot,
        fetchLeaderboard: fetchLeaderboard,
        fetchWeeklyLeaderboard: fetchWeeklyLeaderboard,
        invalidateCache: invalidateCache,
        VERSION: '1.4.0'
    };

    console.info('[HEYS.leaderboard] ✅ Module loaded v1.4.0 | Auto-publish historical CEB via computeHistoricalCEB');
})();
