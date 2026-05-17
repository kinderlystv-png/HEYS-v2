/**
 * heys_day_live_refresh_v1.js — Polling-based live refresh for the open day.
 *
 * Why this exists:
 *   Server-side merge (Phase 3) eliminates lost-update at the data layer.
 *   But it doesn't push changes to the OTHER client's open UI. Without this
 *   module, a curator's edits stay invisible to the client (and vice versa)
 *   until next bootstrap/pull-refresh.
 *
 * Strategy (no WebSocket / no LISTEN-NOTIFY needed):
 *   - When the day tab is visible AND a clientId+date are active,
 *     poll for the day blob every POLL_INTERVAL_MS.
 *   - If cloud.updatedAt > local.updatedAt, merge cloud into local using
 *     the same HEYS.sync.mergeDayData and dispatch heys:day-updated so UI re-renders.
 *   - Stop when tab hidden or component unmounts.
 *
 * Cost: 1 RPC per 30s × visible-tab time × open day. Negligible.
 */
(function (global) {
  'use strict';

  const POLL_INTERVAL_MS = 30000;

  const HEYS = (global.HEYS = global.HEYS || {});

  let timerId = null;
  let currentDate = null;
  let currentClientId = null;
  let isPolling = false;

  function shouldPoll() {
    if (!currentDate || !currentClientId) return false;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
    if (global.__HEYS_DEMO_MODE__ && global.__HEYS_DEMO_MODE__.enabled) return false;
    if (HEYS.cloud && HEYS.cloud._switchClientInProgress) return false;
    return true;
  }

  async function fetchCloudDay(clientId, key) {
    const YandexAPI = HEYS.YandexAPI;
    if (!YandexAPI) return null;
    try {
      // 🛡️ CRITICAL FIX (2026-05-17): curator path FIRST.
      // Without this, stale PIN session token from a previous client made polling
      // return the WRONG client's day, and mergeDayData wrote it into LS scoped
      // under the "correct" client_id — direct LS corruption.
      const isCurator = HEYS.auth && typeof HEYS.auth.isCuratorSession === 'function'
        ? HEYS.auth.isCuratorSession() === true
        : false;
      if (isCurator && typeof YandexAPI.getKVBatchByCurator === 'function') {
        const batch = await YandexAPI.getKVBatchByCurator(clientId, [key]);
        if (batch && Array.isArray(batch.data) && batch.data.length > 0) {
          return batch.data[0].v;
        }
        // Curator mode but row not found / error — do NOT fall back to session
        // (would risk reading wrong client). Just return null and try again next tick.
        return null;
      }
      // PIN-only path
      const res = await YandexAPI.getKV(clientId, key);
      if (res && res.data) return res.data;
      return null;
    } catch (e) {
      console.warn('[HEYS.live] fetchCloudDay error:', e.message);
      return null;
    }
  }

  async function pollOnce() {
    if (isPolling) return;
    if (!shouldPoll()) return;
    isPolling = true;
    try {
      const date = currentDate;
      const clientId = currentClientId;
      const key = `heys_dayv2_${date}`;
      const scopedKey = `heys_${clientId}_dayv2_${date}`;

      // Read local (try scoped key first, fall back to unscoped)
      const utils = HEYS.utils || {};
      const localScoped = utils.lsGet ? utils.lsGet(scopedKey, null) : null;
      const local = localScoped || (utils.lsGet ? utils.lsGet(key, null) : null);
      if (!local) return;

      const cloudBlob = await fetchCloudDay(clientId, key);
      if (!cloudBlob) return;

      const cloudTs = Number(cloudBlob.updatedAt) || 0;
      const localTs = Number(local.updatedAt) || 0;
      if (cloudTs <= localTs) return; // local is already fresh (or equal)

      const sync = HEYS.sync;
      if (!sync || typeof sync.mergeDayData !== 'function') {
        console.warn('[HEYS.live] HEYS.sync.mergeDayData unavailable — skipping merge');
        return;
      }

      const merged = sync.mergeDayData(local, cloudBlob);
      if (!merged) return; // identical content (mergeDayData returns null when same)

      // Write merged back to LS via the standard helper. The interceptor will
      // not re-trigger upload because content hash equals cloud's.
      if (utils.lsSet) {
        if (localScoped) utils.lsSet(scopedKey, merged);
        else utils.lsSet(key, merged);
      }

      // Notify UI to re-render
      try {
        global.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date, source: 'live-refresh' }
        }));
      } catch (_) { /* noop */ }
    } finally {
      isPolling = false;
    }
  }

  function start(opts) {
    opts = opts || {};
    stop();
    currentDate = opts.date || null;
    currentClientId = opts.clientId || null;
    if (!currentDate || !currentClientId) return;
    timerId = setInterval(pollOnce, POLL_INTERVAL_MS);
    if (typeof document !== 'undefined') {
      // When tab becomes visible after being hidden, poll immediately so user
      // doesn't wait up to 30s for the first refresh.
      document.addEventListener('visibilitychange', pollOnce);
    }
  }

  function stop() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', pollOnce);
    }
    currentDate = null;
    currentClientId = null;
  }

  HEYS.dayLiveRefresh = {
    start,
    stop,
    _pollNow: pollOnce, // exposed for tests / manual trigger
  };
})(typeof window !== 'undefined' ? window : globalThis);
