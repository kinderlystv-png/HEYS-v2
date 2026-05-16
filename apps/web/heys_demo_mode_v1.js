/**
 * HEYS Demo Mode v1.0
 *
 * Activates only on try.heyslab.ru subdomain (gated by inline script in
 * index.html that sets window.__HEYS_DEMO_MODE__). On the production app
 * domain this module's loadSnapshot() is never called.
 *
 * Responsibilities:
 *   - fetch the per-gender snapshot.json from the public S3 bucket
 *   - write each key from snapshot.lsKeys into localStorage
 *   - feed snapshot.products into HEYS.OverlayStore.applyCloudSnapshot() so
 *     the products catalog renders correctly without a live cloud sync
 *
 * Snapshot source: https://storage.yandexcloud.net/heys-public-snapshot/snapshot-<gender>.json
 * For local dev (try.heyslab.local) override via window.__HEYS_DEMO_SNAPSHOT_URL__.
 */

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  HEYS.demoMode = HEYS.demoMode || {};

  // Suppress morning check-in modal in demo — visitors shouldn't see "enter your weight".
  HEYS.ui = HEYS.ui || {};
  HEYS.ui.suppressMorningCheckin = true;

  const DEFAULT_BASE = 'https://storage.yandexcloud.net/heys-public-snapshot';

  // --- Perf tracking ---
  // T0 is set as early as possible by the inline script in index.html; we fall
  // back to "now" if for some reason it wasn't set.
  const T0 = global.__HEYS_DEMO_T0__ || (global.__HEYS_DEMO_T0__ = Date.now());
  function markPerf(label) {
    const ms = Date.now() - T0;
    try { console.info('[DEMO_PERF] +' + String(ms).padStart(5, ' ') + 'ms — ' + label); } catch (_) {}
    // Keep a structured log so the user can dump the timeline later.
    (global.__HEYS_DEMO_PERF__ = global.__HEYS_DEMO_PERF__ || []).push({ ms, label });
  }
  HEYS.demoMode.markPerf = markPerf;
  HEYS.demoMode.getPerfLog = function () { return (global.__HEYS_DEMO_PERF__ || []).slice(); };

  // Watch React mount events fired by the lazy chunks so the user sees the
  // critical-path timeline without us having to instrument every component.
  global.addEventListener('heys:postboot-lazy-ready', function (e) {
    markPerf('lazy-bundle ready: ' + (e.detail && e.detail.bundle ? e.detail.bundle : '?'));
  });
  global.addEventListener('heysSyncCompleted', function () { markPerf('event: heysSyncCompleted'); });
  global.addEventListener('heys:data-uploaded', function () { markPerf('event: heys:data-uploaded'); });
  global.addEventListener('heys:diary-rendered', function () { markPerf('event: diary-rendered (FULLY LOADED)'); });

  HEYS.demoMode.loadSnapshot = async function loadSnapshot(gender) {
    const safeGender = gender === 'female' ? 'female' : 'male';
    const base = global.__HEYS_DEMO_SNAPSHOT_URL__ || DEFAULT_BASE;
    const url = `${base}/snapshot-${safeGender}.json`;

    markPerf('loadSnapshot() start — gender=' + safeGender);

    // Yandex storage occasionally returns ERR_SOCKET_NOT_CONNECTED on cold
    // connections — retry a few times with backoff before giving up.
    let snapshot;
    let lastErr = null;
    const attempts = [0, 600, 1500, 3000]; // ms wait before each attempt
    for (let i = 0; i < attempts.length; i++) {
      if (attempts[i] > 0) await new Promise((r) => setTimeout(r, attempts[i]));
      try {
        const res = await fetch(url, { cache: 'default' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        snapshot = await res.json();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn('[DEMO_MODE] snapshot fetch attempt ' + (i + 1) + '/' + attempts.length + ' failed:', err && err.message ? err.message : err);
      }
    }
    if (lastErr) {
      console.error('[DEMO_MODE] failed to fetch snapshot after retries:', url, lastErr);
      throw lastErr;
    }
    markPerf('snapshot fetched (' + (snapshot.lsKeys ? Object.keys(snapshot.lsKeys).length : 0) + ' keys, ' + (snapshot.products ? snapshot.products.length : 0) + ' products)');

    // 1) Push each LS key from snapshot. We let localStorage.setItem
    //    go through the regular path — the storage interceptor is already
    //    no-op'd by heys_storage_supabase_v1.js DEMO_MODE branch.
    const ls = snapshot.lsKeys || {};
    const demoClientId = 'demo-client-' + safeGender;
    // dayv2 keys are scoped by clientId in this version of HEYS:
    // heys_<clientId>_dayv2_YYYY-MM-DD. Write both forms so all read
    // paths (scoped via _scopedDayKey + any legacy unscoped reads) work.
    const DAY_KEY_RE = /^heys_dayv2_(\d{4}-\d{2}-\d{2})$/;
    let writeCount = 0;
    for (const key of Object.keys(ls)) {
      try {
        const value = ls[key];
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        const dayMatch = key.match(DAY_KEY_RE);
        if (dayMatch) {
          // Write scoped key (primary path HEYS reads)
          localStorage.setItem('heys_' + demoClientId + '_dayv2_' + dayMatch[1], serialized);
          // Also keep unscoped for legacy/fallback reads
          localStorage.setItem(key, serialized);
          writeCount += 2;
        } else {
          localStorage.setItem(key, serialized);
          writeCount++;
        }
      } catch (err) {
        // Quota / disabled storage / Safari ITP — bail loudly so the caller
        // can show a fallback "open in full screen" UI.
        console.error('[DEMO_MODE] localStorage.setItem failed for', key, err);
        throw err;
      }
    }
    markPerf('lsKeys written (' + writeCount + ' entries)');

    // 1b) Seed default heys_advice_settings so the cold-start guard takes the
    //     "normal" 1.5s path instead of waiting up to 5s for a sync event.
    try {
      if (localStorage.getItem('heys_advice_settings') === null) {
        localStorage.setItem('heys_advice_settings', JSON.stringify({
          toastsEnabled: false, soundEnabled: false, demoSeeded: true,
        }));
      }
    } catch (_) {}

    // 2) Feed products into the overlay store. This is the same entry point
    //    cloud bootstrap uses, so the UI behaves identically.
    const products = Array.isArray(snapshot.products) ? snapshot.products : [];
    if (HEYS.OverlayStore && typeof HEYS.OverlayStore.applyCloudSnapshot === 'function') {
      HEYS.OverlayStore.applyCloudSnapshot(products, { source: 'demo-snapshot' });
      markPerf('products applied via OverlayStore (' + products.length + ')');
    } else {
      // OverlayStore not loaded yet — fall back to the legacy LS key. The
      // overlay module will pick it up on init.
      try {
        localStorage.setItem('heys_products_overlay_v2', JSON.stringify(products));
        markPerf('products seeded to LS (OverlayStore not ready, ' + products.length + ')');
      } catch (err) {
        console.error('[DEMO_MODE] failed to seed products overlay:', err);
      }
    }

    // 3) Ensure today has content so the demo diary isn't empty on first open.
    // The cron snapshot only includes days up to the last completed day. We
    // copy the most recent snapshot day as the current demo "today" so the
    // user immediately sees a real diary instead of "Начните вести дневник".
    (function seedToday() {
      try {
        // Compute today's date string the same way HEYS does (<3am = yesterday).
        const now = new Date();
        if (now.getHours() < 3) now.setDate(now.getDate() - 1);
        const todayStr = now.getFullYear() + '-'
          + String(now.getMonth() + 1).padStart(2, '0') + '-'
          + String(now.getDate()).padStart(2, '0');

        // Skip if the snapshot already has today's data.
        if (ls['heys_dayv2_' + todayStr]) return;

        // Find the most recent day key from snapshot.
        const sortedDayKeys = Object.keys(ls)
          .filter(function (k) { return DAY_KEY_RE.test(k); })
          .sort();
        const latestKey = sortedDayKeys[sortedDayKeys.length - 1];
        if (!latestKey) return;

        const rawValue = ls[latestKey];
        let serialized;
        try {
          // Update the stored date to today so HEYS date-checks pass.
          const parsed = typeof rawValue === 'object' ? rawValue : JSON.parse(rawValue);
          if (parsed && typeof parsed === 'object') parsed.date = todayStr;
          serialized = JSON.stringify(parsed);
        } catch (_) {
          serialized = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
        }

        localStorage.setItem('heys_' + demoClientId + '_dayv2_' + todayStr, serialized);
        localStorage.setItem('heys_dayv2_' + todayStr, serialized);
      } catch (e) {
        console.warn('[DEMO_MODE] seedToday failed:', e);
      }
    })();

    console.info('[DEMO_MODE] snapshot applied:',
      `${writeCount} ls keys, ${products.length} products,`,
      `pseudonym=${snapshot.pseudonym}, generatedAt=${snapshot.generatedAt}`);

    // 4) Fire sync-completion events so downstream listeners (advice cold-start
    //    guard, meal recommender, cascade, dayv2 cache, etc.) don't wait for a
    //    real cloud sync that will never happen in demo. Without this they fall
    //    back to slow 5-8s timers, making the demo feel sluggish.
    //
    // CRITICAL: fire MULTIPLE times with delays. The first dispatch happens
    // during boot before React has mounted listeners — those would miss it.
    // Repeated dispatches at increasing delays guarantee that all listeners
    // (whenever they register) catch at least one event.
    const fireSyncEvents = () => {
      const detail = {
        clientId: demoClientId,
        loaded: writeCount,
        viaYandex: true,
        phase: 'full',
        demoMode: true,
      };
      try {
        global.dispatchEvent(new CustomEvent('heysSyncCompleted', {
          detail: { ...detail, phaseA: true, phase: 'bootstrap' },
        }));
        global.dispatchEvent(new CustomEvent('heysSyncCompleted', { detail }));
        global.dispatchEvent(new CustomEvent('heys:data-uploaded', { detail }));
      } catch (e) {
        console.warn('[DEMO_MODE] sync-event dispatch failed:', e);
      }
    };
    fireSyncEvents();
    // Re-dispatch at 100ms, 500ms, 1500ms so late-mounting React listeners
    // (advice cold-start guard, cascade, meal recommender) catch one.
    setTimeout(fireSyncEvents, 100);
    setTimeout(fireSyncEvents, 500);
    setTimeout(() => { fireSyncEvents(); markPerf('sync events broadcast (final replay)'); }, 1500);

    return { writeCount, productCount: products.length };
  };
})(window);
