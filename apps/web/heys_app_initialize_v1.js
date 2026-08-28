// heys_app_initialize_v1.js — initializeApp extracted from heys_app_entry_v1.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppInitializer = HEYS.AppInitializer || {};

    const getModule = HEYS._getModule || function (name, fallback) {
        return HEYS[name] || fallback || {};
    };

    function resolveClientTreeKey(previousClientId, nextClientId, currentKey) {
        if (previousClientId === nextClientId) return currentKey;
        // Fresh anonymous → first-client activation is already gated by Phase A.
        if (!previousClientId && nextClientId) return currentKey;
        return nextClientId || '__no_client__';
    }

    function createBlankScreenGuard(options) {
        const opts = options || {};
        const timeoutMs = Number(opts.timeoutMs) || 60000;
        const retryTimeoutMs = Number(opts.retryTimeoutMs) || 10000;
        const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
        const schedule = typeof opts.setTimeout === 'function' ? opts.setTimeout : window.setTimeout.bind(window);
        const cancel = typeof opts.clearTimeout === 'function' ? opts.clearTimeout : window.clearTimeout.bind(window);
        const raf = typeof opts.requestAnimationFrame === 'function'
            ? opts.requestAnimationFrame
            : (window.requestAnimationFrame || ((callback) => schedule(callback, 16))).bind(window);
        let rootElement = null;
        let overlay = null;
        let skeletonTemplate = null;
        let timeoutId = null;
        let observer = null;
        let startedAt = now();
        let armed = false;
        let frameReported = false;
        let guardTriggered = false;
        let recoveryFailedReported = false;
        let attempt = 0;
        let timerGeneration = 0;
        let listenersInstalled = false;

        function emit(name, status, level, reason, screen) {
            window.HEYS?.LogTrace?.event?.(name, {
                source: 'blank-screen-guard',
                status,
                phase: 'first-visible-frame',
                reason,
                screen: screen || 'day',
                attempt,
                online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
                durationMs: Math.max(0, now() - startedAt)
            }, level);
        }

        function clearTimer() {
            timerGeneration += 1;
            if (timeoutId !== null) cancel(timeoutId);
            timeoutId = null;
        }

        function hasClientContext() {
            return Boolean(window.HEYS && window.HEYS.currentClientId);
        }

        function isPageVisible() {
            return typeof document === 'undefined' || document.visibilityState !== 'hidden';
        }

        function disconnectObserver() {
            if (observer) observer.disconnect();
            observer = null;
        }

        function removeOverlay() {
            if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
            overlay = null;
        }

        function isVisible(element) {
            if (!element || !element.isConnected) return false;
            let style = null;
            try { style = window.getComputedStyle(element); } catch (_) { /* best-effort */ }
            if (style && (
                style.display === 'none'
                || style.visibility === 'hidden'
                || (style.opacity !== '' && Number(style.opacity) === 0)
            )) return false;
            const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
            return !!rect && rect.width > 1 && rect.height > 1;
        }

        const TRANSIENT_VISIBLE_FRAMES = new Set(['subscription-loading']);

        function getVisibleFrameMarker(element) {
            if (!element) return '';
            if (element.getAttribute?.('data-heys-visible-frame')) {
                return element.getAttribute('data-heys-visible-frame') || '';
            }
            const marked = element.querySelector?.('[data-heys-visible-frame]');
            return marked?.getAttribute?.('data-heys-visible-frame') || '';
        }

        function visibleFrameElement(candidate) {
            if (candidate) {
                const marker = getVisibleFrameMarker(candidate);
                if (!marker || TRANSIENT_VISIBLE_FRAMES.has(marker)) return null;
                if (candidate.getAttribute?.('data-heys-visible-frame') && isVisible(candidate)) {
                    return candidate;
                }
                const markedInCandidate = candidate.querySelector?.('[data-heys-visible-frame]');
                if (markedInCandidate && isVisible(markedInCandidate)) return markedInCandidate;
                return null;
            }
            if (!rootElement) return null;
            const marked = rootElement.querySelector('[data-heys-visible-frame]');
            if (!marked || !isVisible(marked)) return null;
            const marker = marked.getAttribute('data-heys-visible-frame') || '';
            if (TRANSIENT_VISIBLE_FRAMES.has(marker)) return null;
            return marked;
        }

        function finishVisibleFrame(params) {
            if (frameReported) return false;
            const details = params || {};
            const element = visibleFrameElement(details.element);
            if (!element) return false;
            frameReported = true;
            clearTimer();
            disconnectObserver();
            removeLifecycleListeners();
            if (window.__heysSkelVisible) {
                window.__heysSkelReplacedAt = now();
                window.__heysSkelVisible = false;
                window.__heysPerfMark?.('Skeleton: replaced after confirmed visible frame');
            }
            removeOverlay();
            emit('first_visible_frame', 'ok', 'info', details.reason || 'visible_content_painted', details.screen || 'day');
            if (guardTriggered) {
                emit('blank_screen_recovered', 'ok', 'info', details.reason || 'visible_content_painted', details.screen || 'day');
            }
            return true;
        }

        function reportVisibleFrame(params) {
            if (frameReported) return false;
            raf(() => raf(() => finishVisibleFrame(params)));
            return true;
        }

        function scanForVisibleFrame(reason) {
            reportVisibleFrame({ reason: reason || 'visible_marker_detected', screen: 'day' });
        }

        function restoreSkeleton() {
            if (!overlay || !skeletonTemplate) return;
            overlay.replaceChildren(skeletonTemplate.cloneNode(true));
            overlay.style.pointerEvents = 'none';
        }

        function reloadApp() {
            window.location.reload();
        }

        function reportRecoveryFailed(reason) {
            if (recoveryFailedReported) return;
            recoveryFailedReported = true;
            emit('blank_screen_recovery_failed', 'failed', 'error', reason, 'day');
        }

        function showRecovery() {
            if (!overlay) return;
            overlay.style.pointerEvents = 'auto';
            if (window.__heysBootWait && typeof window.__heysBootWait.showFail === 'function') {
                window.__heysBootWait.showFail();
                return;
            }
            overlay.innerHTML = '';
            const mark = document.createElement('div');
            mark.className = 'heys-boot-mark is-fail';
            mark.setAttribute('role', 'alert');
            const disc = document.createElement('span');
            disc.className = 'heys-boot-mark__disc';
            disc.setAttribute('aria-hidden', 'true');
            const warn = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            warn.setAttribute('class', 'heys-boot-mark__warn');
            warn.setAttribute('width', '26');
            warn.setAttribute('height', '26');
            warn.setAttribute('viewBox', '0 0 24 24');
            warn.setAttribute('fill', 'none');
            warn.setAttribute('stroke', 'currentColor');
            warn.setAttribute('stroke-width', '3.4');
            warn.setAttribute('stroke-linecap', 'round');
            const warnPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            warnPath.setAttribute('d', 'M7 7l10 10M17 7L7 17');
            warn.append(warnPath);
            disc.appendChild(warn);
            const sign = document.createElement('div');
            sign.className = 'heys-boot-mark__sign';
            const fail = document.createElement('div');
            fail.className = 'heys-boot-mark__fail';
            const title = document.createElement('div');
            title.className = 'heys-boot-mark__title';
            title.textContent = 'Не удалось загрузить приложение';
            const text = document.createElement('p');
            text.className = 'heys-boot-mark__text';
            text.textContent = 'Похоже, нет связи. Ваши данные на месте — они хранятся на устройстве.';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'heys-boot-mark__btn heys-boot-mark__retry heys-boot-mark__retry--fail';
            retry.textContent = 'Повторить';
            retry.addEventListener('click', retryRecovery);
            fail.append(title, text, retry);
            sign.appendChild(fail);
            mark.append(disc, sign);
            overlay.appendChild(mark);
        }

        function onTimeout() {
            if (!armed || frameReported || !isPageVisible() || !hasClientContext()) return;
            if (!guardTriggered) {
                guardTriggered = true;
                emit('blank_screen_guard_triggered', 'degraded', 'warn', 'first_visible_frame_timeout', 'day');
            } else if (attempt > 0) {
                reportRecoveryFailed('retry_timeout');
            }
            showRecovery();
        }

        function armTimer(delay) {
            clearTimer();
            const generation = timerGeneration;
            timeoutId = schedule(() => {
                if (generation !== timerGeneration) return;
                timeoutId = null;
                onTimeout();
            }, delay);
        }

        function restartVisibleBudget() {
            if (!armed || frameReported || !isPageVisible() || !hasClientContext()) return false;
            startedAt = now();
            armTimer(timeoutMs);
            scanForVisibleFrame('visible_marker_detected');
            return true;
        }

        function handleVisibilityChange() {
            if (!armed || frameReported) return;
            if (!isPageVisible()) {
                clearTimer();
                return;
            }
            restartVisibleBudget();
        }

        function handleClientChanged(event) {
            if (!armed || frameReported) return;
            const clientId = event && event.detail && event.detail.clientId;
            if (!clientId) {
                clearTimer();
                return;
            }
            restartVisibleBudget();
        }

        function handleAppContentReady(event) {
            if (!armed || frameReported) return;
            const detail = event && event.detail || {};
            if (detail.screen === 'gate' && !detail.clientId) {
                destroy();
                return;
            }
            if (detail.clientId) restartVisibleBudget();
        }

        function installLifecycleListeners() {
            if (listenersInstalled) return;
            listenersInstalled = true;
            document.addEventListener('visibilitychange', handleVisibilityChange);
            window.addEventListener('heys:client-changed', handleClientChanged);
            window.addEventListener('heys:app-content-ready', handleAppContentReady);
        }

        function removeLifecycleListeners() {
            if (!listenersInstalled) return;
            listenersInstalled = false;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('heys:client-changed', handleClientChanged);
            window.removeEventListener('heys:app-content-ready', handleAppContentReady);
        }

        function retryRecovery() {
            if (frameReported) return;
            attempt += 1;
            restoreSkeleton();
            try {
                window.dispatchEvent(new CustomEvent('heys:blank-screen-retry', { detail: { attempt } }));
            } catch (_) { /* best-effort */ }
            armTimer(retryTimeoutMs);
            scanForVisibleFrame('retry_visible_content');
        }

        function arm(element) {
            if (armed || frameReported || !element || !window.__heysHasSession) return false;
            armed = true;
            rootElement = element;
            startedAt = now();
            const sourceSkeleton = element.querySelector('[data-heys-boot-mark], .heys-boot-mark, .heys-skeleton');
            overlay = document.createElement('div');
            overlay.id = 'heys-boot-visual-guard';
            overlay.className = 'heys-boot-visual-guard';
            overlay.setAttribute('aria-live', 'polite');
            overlay.style.pointerEvents = 'none';
            skeletonTemplate = sourceSkeleton
                ? sourceSkeleton.cloneNode(true)
                : Object.assign(document.createElement('div'), { className: 'heys-boot-mark', textContent: 'Загружаем' });
            overlay.appendChild(skeletonTemplate.cloneNode(true));
            document.body.appendChild(overlay);
            if (opts.observe !== false && typeof window.MutationObserver === 'function') {
                observer = new window.MutationObserver(() => scanForVisibleFrame('visible_marker_detected'));
                observer.observe(element, { childList: true, subtree: true, attributes: true });
            }
            installLifecycleListeners();
            if (isPageVisible() && hasClientContext()) armTimer(timeoutMs);
            return true;
        }

        function destroy() {
            armed = false;
            frameReported = true;
            clearTimer();
            disconnectObserver();
            removeLifecycleListeners();
            removeOverlay();
        }

        return {
            arm,
            destroy,
            reportVisibleFrame,
            retryRecovery,
            _test: { finishVisibleFrame, isVisible, onTimeout }
        };
    }

    HEYS.AppInitializer._test = Object.assign({}, HEYS.AppInitializer._test, {
        createBlankScreenGuard,
        resolveClientTreeKey,
    });

    HEYS.AppInitializer.initializeApp = function initializeApp() {
        // Логи инициализации отключены для чистой консоли
        const React = window.React,
            ReactDOM = window.ReactDOM;

        // Централизованная проверка day-модулей (без логов в консоль)
        if (HEYS.moduleLoader?.checkDayDeps) {
            HEYS.moduleLoader.checkDayDeps();
        }
        const { useState, useEffect, useRef, useCallback, useMemo } = React;
        HEYS.Gates?.initReactGates?.(React);
        const ErrorBoundary = window.HEYS.ErrorBoundary;
        const DesktopGateScreen = window.HEYS.DesktopGateScreen;
        const GamificationBar = window.HEYS.GamificationBar;
        const AppShellModule = getModule('AppShell');
        const AppOverlaysModule = getModule('AppOverlays');
        const AppShell = AppShellModule && AppShellModule.AppShell;
        const AppOverlays = AppOverlaysModule && AppOverlaysModule.AppOverlays;
        const AppGateFlow = getModule('AppGateFlow');
        const AppBackup = getModule('AppBackup');
        const AppShortcuts = getModule('AppShortcuts');
        const AppAuthInit = getModule('AppAuthInit');
        const AppClientHelpers = getModule('AppClientHelpers');
        const AppDesktopGate = getModule('AppDesktopGate');
        const AppMorningCheckin = getModule('AppMorningCheckin');
        const AppSwipeNav = getModule('AppSwipeNav');
        const AppRuntimeEffects = getModule('AppRuntimeEffects');
        const AppSyncEffects = getModule('AppSyncEffects');
        const AppTabState = getModule('AppTabState');
        const AppClientManagement = getModule('AppClientManagement');
        const AppBackupActions = getModule('AppBackupActions');
        const AppUpdateNotifications = getModule('AppUpdateNotifications');
        const AppUIState = getModule('AppUIState');
        const AppCloudInit = getModule('AppCloudInit');
        const AppClientStateManager = getModule('AppClientStateManager');
        const AppDateState = getModule('AppDateState');
        const AppDerivedState = getModule('AppDerivedState');
        const AppShellProps = getModule('AppShellProps');
        const AppOverlaysProps = getModule('AppOverlaysProps');
        const AppGateState = getModule('AppGateState');
        const AppGlobalBindings = getModule('AppGlobalBindings');
        const AppBackupState = getModule('AppBackupState');
        const AppBannerState = getModule('AppBannerState');
        const AppClientInit = getModule('AppClientInit');
        const AppTwemojiEffect = getModule('AppTwemojiEffect');
        const AppRuntimeState = getModule('AppRuntimeState');
        const AppCoreState = getModule('AppCoreState');
        const AppRoot = getModule('AppRoot');

        const AppHooks = getModule('AppHooks');
        const {
            useThemePreference,
            usePwaPrompts,
            useWakeLock,
            useCloudSyncStatus,
            useClientState,
            useCloudClients,
        } = AppHooks;

        // DEMO_MODE: skip cloud init + health ping. Snapshot loaded separately.
        const isDemoMode = window.__HEYS_DEMO_MODE__ && window.__HEYS_DEMO_MODE__.enabled;

        // init cloud (safe if no cloud module)
        // 🇷🇺 Основной трафик идёт через Yandex Cloud API (api.heyslab.ru)
        // Legacy cloud модуль оставлен для обратной совместимости
        if (isDemoMode) {
            // No-op: cloud is stubbed in heys_storage_supabase_v1.js,
            // snapshot is loaded by HEYS.demoMode.loadSnapshot() in bootstrap.
        } else if (AppCloudInit.initCloud) {
            AppCloudInit.initCloud();
        } else if (window.HEYS.cloud && typeof HEYS.cloud.init === 'function') {
            const isLocalBrowserDev = typeof window !== 'undefined'
                && typeof window.location !== 'undefined'
                && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                && !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || ''));
            const apiBaseUrl = isLocalBrowserDev ? 'http://localhost:4001' : 'https://api.heyslab.ru';

            if (!HEYS._heysApiHealthPingSent) {
                HEYS._heysApiHealthPingSent = true;
                fetch(`${apiBaseUrl}/health`, { method: 'GET' }).catch(() => { });
            }

            // 🆕 v2025-12-22: На production используем ТОЛЬКО Yandex Cloud API
            // Supabase SDK инициализируется для совместимости cloud.signIn/signOut,
            // Основной трафик идёт через HEYS.YandexAPI / локальный proxy в dev.
            const cloudApiUrl = apiBaseUrl;

            HEYS.cloud.init({
                url: cloudApiUrl,
                anonKey: '',
                localhostProxyUrl: isLocalBrowserDev ? apiBaseUrl : undefined
            });
        }

        const AppTabs = getModule('AppTabs');
        const {
            DayTabWithCloudSync,
            RationTabWithCloudSync,
            UserTabWithCloudSync,
            AnalyticsTab,
        } = AppTabs;

        /* ═══════════════════════════════════════════════════════════════════════════════
         * 🚀 ГЛАВНЫЙ КОМПОНЕНТ: App (строки 482-1140)
         * ───────────────────────────────────────────────────────────────────────────────
         * Корневой компонент приложения с управлением состоянием
         *
         * STATE MANAGEMENT:
         *   - tab: текущая активная вкладка ('stats'|'diary'|'insights'|'widgets'|'ration'|'user'|'overview')
         *   - products: массив продуктов для текущего клиента
         *   - clients: список клиентов куратора
         *   - clientId: ID выбранного клиента
         *   - cloudUser: авторизованный пользователь Supabase
         *   - status: состояние подключения ('online'|'offline')
         *
         * MAIN FEATURES:
         *   - Автологин в Supabase (ONE_CURATOR_MODE)
         *   - Модальное окно выбора клиента
         *   - Синхронизация данных с облаком
         *   - Локальный режим (localStorage fallback)
         *
         * DEPENDENCIES: window.HEYS.cloud, window.HEYS.utils
         * ═══════════════════════════════════════════════════════════════════════════════
         */
        // Hooks moved to apps/web/heys_app_hooks_v1.js (HEYS.AppHooks)

        function renderRoot(AppComponent) {
            const getRootElement = () => {
                const existingRoot = document.getElementById('root');
                if (existingRoot && existingRoot.nodeType === 1) {
                    return existingRoot;
                }
                if (!document.body) {
                    console.error('[HEYS.app] ❌ Root element is missing and document.body is not ready.');
                    return null;
                }
                const newRoot = document.createElement('div');
                newRoot.id = 'root';
                document.body.appendChild(newRoot);
                return newRoot;
            };

            const rootElement = getRootElement();
            if (!rootElement) {
                return;
            }

            // v10.1 FOUC fix: delay React mount until main.css loaded
            // HTML skeleton stays visible → clean transition to styled app
            const doRender = () => {
                const blankScreenGuard = HEYS.BlankScreenGuard || createBlankScreenGuard();
                HEYS.BlankScreenGuard = blankScreenGuard;
                const blankScreenGuardArmed = blankScreenGuard.arm(rootElement);
                // 🦴 Log skeleton replacement
                if (window.__heysSkelVisible && !blankScreenGuardArmed) {
                    var skelDur = window.__heysSkelStart ? (Date.now() - window.__heysSkelStart) : 0;
                    window.__heysSkelReplacedAt = Date.now();
                    window.__heysSkelVisible = false;
                    window.__heysPerfMark && window.__heysPerfMark('Skeleton: replaced after ' + skelDur + 'ms visible');
                    console.info('[HEYS.skeleton] 🦴 Skeleton was visible for ' + (skelDur / 1000).toFixed(1) + 's → React takes over');
                }
                window.__heysPerfMark && window.__heysPerfMark('ReactDOM.createRoot: begin');
                // P1-R: signal react-mount phase before createRoot blocks the thread.
                try {
                    window.dispatchEvent(new CustomEvent('heys:progress', {
                        detail: { phase: 'react-mount', percent: 92, message: 'Готовим интерфейс...' }
                    }));
                } catch (_) { /* best-effort */ }
                const root = ReactDOM.createRoot(rootElement);
                // 🛡️ Layer 1 (incident 2026-06-02 fix): RootWithKey подписан на
                // event 'heys:client-changed'. Реальная смена client↔client remount'ит
                // всё поддерево; первая anonymous→client активация остаётся in-place,
                // потому что данных другого клиента в памяти ещё нет.
                function readInitialClientIdForKey() {
                    try {
                        if (window.HEYS && window.HEYS.currentClientId) {
                            return window.HEYS.currentClientId;
                        }
                        const raw = window.localStorage && window.localStorage.getItem('heys_client_current');
                        if (!raw) return null;
                        try {
                            const parsed = JSON.parse(raw);
                            return typeof parsed === 'string' && parsed ? parsed : null;
                        } catch (_) {
                            return typeof raw === 'string' && raw ? raw : null;
                        }
                    } catch (_) {
                        return null;
                    }
                }

                function RootWithKey() {
                    const initialClientId = readInitialClientIdForKey();
                    const activeClientRef = React.useRef(initialClientId);
                    const [reactKey, setReactKey] = React.useState(initialClientId || '__no_client__');
                    React.useEffect(() => {
                        const handler = (e) => {
                            const next = (e && e.detail && e.detail.clientId)
                                || (window.HEYS && window.HEYS.currentClientId)
                                || null;
                            const previous = activeClientRef.current;
                            activeClientRef.current = next;
                            setReactKey((currentKey) => resolveClientTreeKey(previous, next, currentKey));
                        };
                        window.addEventListener('heys:client-changed', handler);
                        return () => window.removeEventListener('heys:client-changed', handler);
                    }, []);
                    return React.createElement(AppComponent, { key: reactKey });
                }
                root.render(React.createElement(ErrorBoundary, null, React.createElement(RootWithKey)));
                window.__heysPerfMark && window.__heysPerfMark('root.render: called → __heysAppReady');

                // 🆕 Уведомляем SW об успешной загрузке (сбрасывает счётчик boot failures)
                if (navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'BOOT_SUCCESS' });
                    window.__heysLog && window.__heysLog('SW notified: BOOT_SUCCESS');
                }

                // Флаг для watchdog
                window.__heysAppReady = true;
                // P1-R: progress 100% → loading UI hides itself.
                try {
                    window.dispatchEvent(new CustomEvent('heys:progress', {
                        detail: { phase: 'ready', percent: 100, message: 'Готово' }
                    }));
                } catch (_) { /* best-effort */ }
                // Сброс crash-loop counter — загрузка успешна
                try { sessionStorage.removeItem('heys_boot_crash_count'); } catch (e) { /* private browsing */ }
            };

            // CSS gate: wait for main.css before destroying skeleton
            // v9.10: styleSheets fallback — detect CSS even if onload event was missed
            // Also detects Vite production build: main.css → /assets/index-HASH.css
            if (!window.__heysMainCSSLoaded) {
                try {
                    for (var si = 0; si < document.styleSheets.length; si++) {
                        var sheetHref = document.styleSheets[si].href;
                        if (sheetHref && (sheetHref.indexOf('main.css') !== -1 ||
                            (sheetHref.indexOf('/assets/') !== -1 && sheetHref.indexOf('.css') !== -1))) {
                            window.__heysMainCSSLoaded = true;
                            console.info('[HEYS.init] ✅ main.css detected via styleSheets:', sheetHref.split('/').pop());
                            break;
                        }
                    }
                } catch (e) { /* SecurityError on CORS sheets — skip */ }
                // Also check for Vite <link> element directly
                if (!window.__heysMainCSSLoaded && document.querySelector('link[rel="stylesheet"][href*="/assets/"]')) {
                    window.__heysMainCSSLoaded = true;
                    console.info('[HEYS.init] ✅ Vite CSS detected via link element');
                }
            }

            if (window.__heysMainCSSLoaded) {
                console.info('[HEYS.init] ✅ main.css already loaded — mounting React immediately');
                doRender();
            } else {
                console.info('[HEYS.init] ⏳ Waiting for main.css before React mount (skeleton stays visible)');
                // Adaptive CSS gate timeout: short on fast networks (no regression),
                // generous on slow networks (avoids "naked DOM" flashes — black circles, etc).
                // Uses Network Information API where available, otherwise falls back to default.
                // Rationale for slow values: main.css is ~1.2MB; on 3G (~750 Kbps effective)
                // it needs ~13–25s including @import-ed modules. Better to keep app-loader
                // skeleton visible than render unstyled DOM.
                var cssTimeoutMs = 4000;
                try {
                    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                    if (conn && conn.effectiveType) {
                        if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
                            cssTimeoutMs = 90000;
                        } else if (conn.effectiveType === '3g') {
                            cssTimeoutMs = 30000;
                        }
                    }
                    if (conn && conn.saveData === true) {
                        cssTimeoutMs = Math.max(cssTimeoutMs, 15000);
                    }
                } catch (e) { /* Network Information API not supported — keep default */ }

                var cssTimer = null;
                var onCSS = function () {
                    clearTimeout(cssTimer);
                    console.info('[HEYS.init] ✅ main.css loaded — mounting React');
                    doRender();
                };
                window.addEventListener('heysMainCSSLoaded', onCSS, { once: true });
                cssTimer = setTimeout(function () {
                    window.removeEventListener('heysMainCSSLoaded', onCSS);
                    console.warn('[HEYS.init] ⚠️ CSS timeout (' + cssTimeoutMs + 'ms) — mounting React without main.css');
                    doRender();
                }, cssTimeoutMs);
            }
        }

        const createApp = AppRoot.createApp
            || (({ React: HookReact }) => function AppFallback() {
                return HookReact.createElement('div', null);
            });
        const App = createApp({ React });
        renderRoot(App);
    };
})();
