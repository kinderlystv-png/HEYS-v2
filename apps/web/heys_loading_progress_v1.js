/**
 * heys_loading_progress_v1.js
 *
 * Loading progress UI (P1-R, 2026-05-22). Pure DOM, no React — потому что
 * React сам субъект ожидания и не может быть UI прогресс-бара. Показывает
 * monotonic % от 0 до 100 через цикл загрузки: bundles → CSS → auth →
 * cloud sync → React mount → ready.
 *
 * Слушает существующие события:
 *   - heysMainCSSLoaded  (index.html main.css preload onload)
 *   - heys-auth-ready    (index.html после auth)
 *   - heysSyncCompleted  (heys_storage_supabase_v1.js после cloud snapshot)
 *   - heys:progress      (custom — для тонкого прогресса синка)
 *   - online/offline     (navigator)
 *
 * UI: 3px gradient bar сверху viewport + pill chip снизу с текстом и dot
 * статуса сети. Скрывается после commit реального React-экрана
 * (`heys:app-content-ready`). Suppressed в DEMO mode.
 */
(function (global) {
    'use strict';

    if (global.__heysLoadingProgress) return; // idempotent

    // ─── Config ──────────────────────────────────────────────────────────────
    const BOOT_BUNDLES_COUNT = 6; // react + 5 boot-*
    const POLL_INTERVAL_MS = 250;
    const DEDUPE_MS = 55;
    const SLOW_WARN_AT_MS = 25000;   // показать "это занимает дольше" на 25s
    const HIDE_FADE_MS = 220;
    const Z_INDEX_BAR = 10001;
    const Z_INDEX_CHIP = 10001;

    // ─── DEMO mode / Recovery — skip entirely ───────────────────────────────
    if (global.__HEYS_DEMO_MODE__ && global.__HEYS_DEMO_MODE__.enabled === true) {
        return;
    }

    // ─── State machine ───────────────────────────────────────────────────────
    let state = {
        percent: 0,
        phase: 'html-parse',
        message: 'Запускаем приложение...',
        detail: '',
        hidden: false,
        destroyed: false,
        startedAt: Date.now(),
        lastDispatchAt: 0,
        slowWarnFired: false,
    };

    // ─── DOM refs ────────────────────────────────────────────────────────────
    let barEl = null;
    let fillEl = null;
    let chipEl = null;
    let chipMessageEl = null;
    let chipDetailEl = null;
    let chipDotEl = null;
    let pollTimer = null;
    let slowWarnTimer = null;

    // ─── Helpers ─────────────────────────────────────────────────────────────
    function detectNetwork() {
        if (typeof navigator === 'undefined') return 'fast';
        if (navigator.onLine === false) return 'offline';
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn || !conn.effectiveType) return 'fast';
        if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return 'slow-2g';
        if (conn.effectiveType === '3g') return '3g';
        return 'fast';
    }

    function isReturningUser() {
        try {
            const swController = typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller;
            const navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
            const notReload = !navEntry || navEntry.type !== 'reload';
            const hasClient = typeof localStorage !== 'undefined' && (
                localStorage.getItem('heys_pin_auth_client') ||
                localStorage.getItem('heys_client_current')
            );
            return !!(swController && notReload && hasClient);
        } catch (_) { return false; }
    }

    // ─── DOM creation ────────────────────────────────────────────────────────
    function buildDom() {
        if (typeof document === 'undefined' || !document.body) return false;

        barEl = document.createElement('div');
        barEl.id = 'heys-loading-progress-bar';
        barEl.setAttribute('data-percent', '0');
        barEl.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0',
            'height:3px', 'background:rgba(0,0,0,0.04)',
            'z-index:' + Z_INDEX_BAR, 'pointer-events:none',
            'transition:opacity ' + HIDE_FADE_MS + 'ms ease-out',
        ].join(';');

        fillEl = document.createElement('div');
        fillEl.style.cssText = [
            'height:100%', 'width:0%',
            'background:linear-gradient(90deg,#3b82f6,#10b981)',
            'transition:width 320ms cubic-bezier(0.4,0,0.2,1)',
            'box-shadow:0 0 6px rgba(59,130,246,0.5)',
        ].join(';');
        barEl.appendChild(fillEl);

        chipEl = document.createElement('div');
        chipEl.id = 'heys-loading-progress-chip';
        chipEl.style.cssText = [
            'position:fixed', 'left:50%', 'bottom:calc(76px + env(safe-area-inset-bottom, 0px))',
            'transform:translateX(-50%)',
            'background:rgba(255,255,255,0.94)',
            'color:#0f172a',
            'padding:8px 14px 8px 12px',
            'border-radius:9999px',
            'box-shadow:0 4px 14px rgba(0,0,0,0.10),0 1px 3px rgba(0,0,0,0.06)',
            'font:13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
            'display:flex', 'align-items:center', 'gap:8px',
            'max-width:min(86vw,320px)',
            'z-index:' + Z_INDEX_CHIP, 'pointer-events:none',
            'transition:opacity ' + HIDE_FADE_MS + 'ms ease-out',
            'backdrop-filter:blur(8px)',
            '-webkit-backdrop-filter:blur(8px)',
        ].join(';');

        chipDotEl = document.createElement('span');
        chipDotEl.style.cssText = [
            'width:8px', 'height:8px', 'border-radius:50%',
            'background:#10b981', 'flex-shrink:0',
            'transition:background 200ms ease-out',
        ].join(';');

        const textWrap = document.createElement('span');
        textWrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;line-height:1.25';

        chipMessageEl = document.createElement('span');
        chipMessageEl.style.cssText = 'font-weight:500;color:#0f172a';

        chipDetailEl = document.createElement('span');
        chipDetailEl.style.cssText = 'font-size:11px;color:#64748b;display:none';

        textWrap.appendChild(chipMessageEl);
        textWrap.appendChild(chipDetailEl);

        chipEl.appendChild(chipDotEl);
        chipEl.appendChild(textWrap);

        // Dark theme overrides (mirror skeleton pattern from index.html:1512+)
        const styleEl = document.createElement('style');
        styleEl.textContent = [
            '[data-theme="dark"] #heys-loading-progress-chip {',
            '  background:rgba(30,41,59,0.94);',
            '  color:#e2e8f0;',
            '  box-shadow:0 4px 14px rgba(0,0,0,0.4);',
            '}',
            '[data-theme="dark"] #heys-loading-progress-chip > span:last-child > span:first-child {',
            '  color:#e2e8f0;',
            '}',
            '[data-theme="dark"] #heys-loading-progress-chip > span:last-child > span:last-child {',
            '  color:#94a3b8;',
            '}',
            '@keyframes heys-loading-pulse {',
            '  0%,100% { opacity: 1; }',
            '  50% { opacity: 0.45; }',
            '}',
        ].join('\n');
        document.head && document.head.appendChild(styleEl);

        document.body.appendChild(barEl);
        document.body.appendChild(chipEl);

        chipMessageEl.textContent = state.message;
        applyNetworkDot();
        return true;
    }

    function applyNetworkDot() {
        if (!chipDotEl) return;
        const net = detectNetwork();
        const colors = { fast: '#10b981', '3g': '#f59e0b', 'slow-2g': '#ef4444', offline: '#94a3b8' };
        chipDotEl.style.background = colors[net] || '#10b981';
        chipDotEl.style.animation = net === 'offline' ? 'heys-loading-pulse 1.4s ease-in-out infinite' : 'none';
    }

    // ─── State update ────────────────────────────────────────────────────────
    function updateProgress(next) {
        if (state.destroyed) return;
        const now = Date.now();
        if (now - state.lastDispatchAt < DEDUPE_MS && next.percent === state.percent && next.phase === state.phase) {
            return;
        }
        state.lastDispatchAt = now;

        // Monotonic — never go backwards
        if (typeof next.percent === 'number' && next.percent > state.percent) {
            state.percent = Math.min(100, Math.round(next.percent));
        }
        if (next.phase) state.phase = next.phase;
        if (typeof next.message === 'string') state.message = next.message;
        if (typeof next.detail === 'string') state.detail = next.detail;

        renderState();

        if (state.percent >= 100) {
            scheduleHide();
        }
    }

    function renderState() {
        if (!fillEl) return;
        fillEl.style.width = state.percent + '%';
        if (barEl) barEl.setAttribute('data-percent', String(state.percent));
        if (chipMessageEl) chipMessageEl.textContent = state.message;
        if (chipDetailEl) {
            if (state.detail) {
                chipDetailEl.textContent = state.detail;
                chipDetailEl.style.display = 'block';
            } else {
                chipDetailEl.style.display = 'none';
            }
        }
    }

    function scheduleHide() {
        if (state.hidden) return;
        state.hidden = true;
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (slowWarnTimer) { clearTimeout(slowWarnTimer); slowWarnTimer = null; }
        setTimeout(() => {
            if (barEl) barEl.style.opacity = '0';
            if (chipEl) chipEl.style.opacity = '0';
            setTimeout(() => destroy(), HIDE_FADE_MS + 50);
        }, 180);
    }

    function destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        try { barEl && barEl.parentNode && barEl.parentNode.removeChild(barEl); } catch (_) {}
        try { chipEl && chipEl.parentNode && chipEl.parentNode.removeChild(chipEl); } catch (_) {}
    }

    // ─── Bundle progress polling ─────────────────────────────────────────────
    function pollBundles() {
        if (state.destroyed || state.phase !== 'bundles-loading' && state.phase !== 'html-parse') return;
        if (typeof performance === 'undefined' || !performance.getEntriesByType) return;
        try {
            const resources = performance.getEntriesByType('resource');
            let loaded = 0;
            for (const r of resources) {
                const name = r.name || '';
                if (/\/(react-bundle|boot-(init|core|calc|day|app)\.bundle\.)/.test(name)) {
                    loaded++;
                }
            }
            const pct = Math.min(25, 5 + Math.round((loaded / BOOT_BUNDLES_COUNT) * 20));
            if (pct > state.percent) {
                updateProgress({ phase: 'bundles-loading', percent: pct, message: 'Загружаем модули...' });
            }
            if (loaded >= BOOT_BUNDLES_COUNT) {
                // Stop polling once all critical bundles arrived
                if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            }
        } catch (_) { /* polling errors are non-fatal */ }
    }

    // ─── Event handlers ──────────────────────────────────────────────────────
    function onCssLoaded() {
        updateProgress({ phase: 'css-loading', percent: 35, message: 'Готовим оформление...' });
    }

    function onAuthReady() {
        updateProgress({ phase: 'auth-check', percent: 45, message: 'Проверяем доступ...' });
        // After auth, the next phase is cloud sync. Show optimistic 50% to
        // bridge silence until first sync event arrives.
        setTimeout(() => {
            if (state.percent < 50 && !state.destroyed) {
                const returningUser = isReturningUser();
                updateProgress({
                    phase: 'sync-fetch',
                    percent: 50,
                    message: returningUser ? 'Загружаем последние изменения...' : 'Загружаем продукты и историю...',
                });
            }
        }, 400);
    }

    function onSyncStarting() {
        if (state.percent < 50) {
            const returningUser = isReturningUser();
            updateProgress({
                phase: 'sync-fetch',
                percent: 50,
                message: returningUser ? 'Загружаем последние изменения...' : 'Загружаем продукты и историю...',
            });
        }
    }

    function onSyncCompleted(ev) {
        const detail = (ev && ev.detail) || {};
        const phase = detail.phase || (detail.phaseA ? 'phaseA' : null);
        if (phase === 'phaseA') {
            updateProgress({ phase: 'sync-fetch', percent: 75, message: 'Почти готово...' });
            return;
        }
        // Full sync complete — race with react-mount; just push to 95.
        if (state.percent < 95) {
            updateProgress({ phase: 'react-mount', percent: 95, message: 'Готовим интерфейс...' });
        }
        // Final ready will come from __heysAppReady watcher or explicit
        // heys:progress phase:'ready' dispatch.
    }

    function onCustomProgress(ev) {
        const d = (ev && ev.detail) || {};
        const next = {};
        if (typeof d.phase === 'string') next.phase = d.phase;
        if (typeof d.percent === 'number') {
            // `root.render()` is scheduled, not committed. Reserve 100% for the
            // content-ready event so the loader cannot reveal a white frame.
            next.percent = d.phase === 'ready' ? Math.min(99, d.percent) : d.percent;
        }
        if (typeof d.message === 'string') next.message = d.message;
        if (typeof d.detail === 'string') next.detail = d.detail;
        updateProgress(next);
    }

    function onAppContentReady() {
        updateProgress({ phase: 'ready', percent: 100, message: 'Готово' });
    }

    function onNetworkChange() {
        applyNetworkDot();
    }

    function watchAppReady() {
        if (state.destroyed) return;
        if (global.__heysAppReady === true) {
            updateProgress({ phase: 'react-mount', percent: 99, message: 'Готовим интерфейс...' });
        } else {
            setTimeout(watchAppReady, 350);
        }
    }

    function fireSlowWarning() {
        if (state.destroyed || state.percent >= 90) return;
        state.slowWarnFired = true;
        chipDetailEl && (chipDetailEl.style.color = '#b45309');
        updateProgress({ detail: 'Это занимает дольше обычного, проверьте соединение' });
    }

    // ─── Recovery UI detection ───────────────────────────────────────────────
    // If the boot watchdog shows recovery UI, hide the progress bar — recovery
    // owns the screen.
    function watchRecovery() {
        if (state.destroyed) return;
        if (global.__heysRecoveryBusy === true) {
            destroy();
            return;
        }
        setTimeout(watchRecovery, 500);
    }

    // ─── Boot ────────────────────────────────────────────────────────────────
    function boot() {
        if (!buildDom()) {
            // Body not ready yet — retry on DOMContentLoaded
            global.addEventListener('DOMContentLoaded', boot, { once: true });
            return;
        }

        // Initial render
        renderState();

        // Bundles polling (only meaningful on cold start)
        if (!isReturningUser()) {
            pollTimer = setInterval(pollBundles, POLL_INTERVAL_MS);
            // Fire one immediate check in case bundles already loaded
            setTimeout(pollBundles, 50);
        } else {
            // Returning user: bundles come from SW cache, skip to 25% immediately
            updateProgress({ phase: 'bundles-loading', percent: 25, message: 'Загружаем модули...' });
        }

        // Wire listeners
        global.addEventListener('heysMainCSSLoaded', onCssLoaded, { once: true });
        global.addEventListener('heys-auth-ready', onAuthReady, { once: true });
        global.addEventListener('heysSyncStarting', onSyncStarting);
        global.addEventListener('heysSyncCompleted', onSyncCompleted);
        global.addEventListener('heys:progress', onCustomProgress);
        global.addEventListener('heys:app-content-ready', onAppContentReady, { once: true });
        global.addEventListener('online', onNetworkChange);
        global.addEventListener('offline', onNetworkChange);

        // Already-fired check (e.g. CSS preload finished before this loaded)
        if (global.__heysMainCSSLoaded === true && state.percent < 35) {
            onCssLoaded();
        }
        if (global.__heysContentReady === true) {
            onAppContentReady();
        }

        // Force-logout aborts progress
        global.addEventListener('heys:force-logout', () => destroy(), { once: true });

        // Watch for app-ready flag set by AppInitializer
        watchAppReady();
        // Watch for recovery overlay
        watchRecovery();

        // Slow warning timer
        slowWarnTimer = setTimeout(fireSlowWarning, SLOW_WARN_AT_MS);

        // Safety: hard cap at 60s, force-hide so we never block forever
        setTimeout(() => {
            if (!state.destroyed) {
                updateProgress({ phase: 'ready', percent: 100, message: 'Готово' });
                scheduleHide();
            }
        }, 60000);
    }

    // Expose minimal API for diagnostics + tests
    global.__heysLoadingProgress = {
        getState: () => ({ ...state }),
        forceHide: () => scheduleHide(),
        forceDestroy: () => destroy(),
    };

    boot();
})(typeof window !== 'undefined' ? window : globalThis);
