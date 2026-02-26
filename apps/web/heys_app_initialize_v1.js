// heys_app_initialize_v1.js — initializeApp extracted from heys_app_entry_v1.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppInitializer = HEYS.AppInitializer || {};

    const getModule = HEYS._getModule || function (name, fallback) {
        return HEYS[name] || fallback || {};
    };

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
        const AppLoader = window.HEYS.AppLoader;
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

        // init cloud (safe if no cloud module)
        // 🇷🇺 Основной трафик идёт через Yandex Cloud API (api.heyslab.ru)
        // Legacy cloud модуль оставлен для обратной совместимости
        if (AppCloudInit.initCloud) {
            AppCloudInit.initCloud();
        } else if (window.HEYS.cloud && typeof HEYS.cloud.init === 'function') {
            // 🔥 Warm-up ping — прогреваем Yandex Cloud Functions
            fetch('https://api.heyslab.ru/health', { method: 'GET' })
                .catch(() => { }); // Warm-up ping

            // 🆕 v2025-12-22: На production используем ТОЛЬКО Yandex Cloud API
            // Supabase SDK инициализируется для совместимости cloud.signIn/signOut,
            // но основной трафик идёт через HEYS.YandexAPI
            const supabaseUrl = 'https://api.heyslab.ru';  // Yandex Cloud API для всех сред

            HEYS.cloud.init({
                url: supabaseUrl,
                anonKey:
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrcW9sY3ppcWN1cGxxZmdybXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNTE1NDUsImV4cCI6MjA3MDgyNzU0NX0.Nzd8--PyGMJvIHqFoCQKNUOwpxnrAZuslQHtAjcE1Ds',
                // localhost fallback больше не нужен — используем Yandex API везде
                localhostProxyUrl: undefined
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
                // 🦴 Log skeleton replacement
                if (window.__heysSkelVisible) {
                    var skelDur = window.__heysSkelStart ? (Date.now() - window.__heysSkelStart) : 0;
                    window.__heysSkelReplacedAt = Date.now();
                    window.__heysSkelVisible = false;
                    window.__heysPerfMark && window.__heysPerfMark('Skeleton: replaced after ' + skelDur + 'ms visible');
                    console.info('[HEYS.skeleton] 🦴 Skeleton was visible for ' + (skelDur / 1000).toFixed(1) + 's → React takes over');
                }
                window.__heysPerfMark && window.__heysPerfMark('ReactDOM.createRoot: begin');
                const root = ReactDOM.createRoot(rootElement);
                root.render(React.createElement(ErrorBoundary, null, React.createElement(AppComponent)));
                window.__heysPerfMark && window.__heysPerfMark('root.render: called → __heysAppReady');

                // 🆕 Уведомляем SW об успешной загрузке (сбрасывает счётчик boot failures)
                if (navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'BOOT_SUCCESS' });
                    window.__heysLog && window.__heysLog('SW notified: BOOT_SUCCESS');
                }

                // Флаг для watchdog
                window.__heysAppReady = true;
            };

            // CSS gate: wait for main.css before destroying skeleton
            // v9.9: styleSheets fallback — detect CSS even if onload event was missed
            if (!window.__heysMainCSSLoaded) {
                try {
                    for (var si = 0; si < document.styleSheets.length; si++) {
                        if (document.styleSheets[si].href && document.styleSheets[si].href.indexOf('main.css') !== -1) {
                            window.__heysMainCSSLoaded = true;
                            console.info('[HEYS.init] ✅ main.css detected via styleSheets (onload missed)');
                            break;
                        }
                    }
                } catch (e) { /* SecurityError on CORS sheets — skip */ }
            }

            if (window.__heysMainCSSLoaded) {
                console.info('[HEYS.init] ✅ main.css already loaded — mounting React immediately');
                doRender();
            } else {
                console.info('[HEYS.init] ⏳ Waiting for main.css before React mount (skeleton stays visible)');
                var cssTimer = null;
                var onCSS = function () {
                    clearTimeout(cssTimer);
                    console.info('[HEYS.init] ✅ main.css loaded — mounting React');
                    doRender();
                };
                window.addEventListener('heysMainCSSLoaded', onCSS, { once: true });
                // v9.9: Reduced from 10s to 3s — index.html has polling fallback,
                // and CSS Gate #2 in DayTab was removed (no cumulative penalty)
                cssTimer = setTimeout(function () {
                    window.removeEventListener('heysMainCSSLoaded', onCSS);
                    console.warn('[HEYS.init] ⚠️ CSS timeout (3s) — mounting React without main.css');
                    doRender();
                }, 3000);
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
