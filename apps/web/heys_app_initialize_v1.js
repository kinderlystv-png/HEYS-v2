// heys_app_initialize_v1.js — initializeApp extracted from heys_app_entry_v1.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppInitializer = HEYS.AppInitializer || {};

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
        const AppShell = window.HEYS.AppShell && window.HEYS.AppShell.AppShell;
        const AppOverlays = window.HEYS.AppOverlays && window.HEYS.AppOverlays.AppOverlays;
        const AppGateFlow = window.HEYS.AppGateFlow || {};
        const AppBackup = window.HEYS.AppBackup || {};
        const AppShortcuts = window.HEYS.AppShortcuts || {};
        const AppAuthInit = window.HEYS.AppAuthInit || {};
        const AppClientHelpers = window.HEYS.AppClientHelpers || {};
        const AppDesktopGate = window.HEYS.AppDesktopGate || {};
        const AppMorningCheckin = window.HEYS.AppMorningCheckin || {};
        const AppSwipeNav = window.HEYS.AppSwipeNav || {};
        const AppRuntimeEffects = window.HEYS.AppRuntimeEffects || {};
        const AppSyncEffects = window.HEYS.AppSyncEffects || {};
        const AppTabState = window.HEYS.AppTabState || {};
        const AppClientManagement = window.HEYS.AppClientManagement || {};
        const AppBackupActions = window.HEYS.AppBackupActions || {};
        const AppUpdateNotifications = window.HEYS.AppUpdateNotifications || {};
        const AppUIState = window.HEYS.AppUIState || {};
        const AppCloudInit = window.HEYS.AppCloudInit || {};
        const AppClientStateManager = window.HEYS.AppClientStateManager || {};
        const AppDateState = window.HEYS.AppDateState || {};
        const AppDerivedState = window.HEYS.AppDerivedState || {};
        const AppShellProps = window.HEYS.AppShellProps || {};
        const AppOverlaysProps = window.HEYS.AppOverlaysProps || {};
        const AppGateState = window.HEYS.AppGateState || {};
        const AppGlobalBindings = window.HEYS.AppGlobalBindings || {};
        const AppBackupState = window.HEYS.AppBackupState || {};
        const AppBannerState = window.HEYS.AppBannerState || {};
        const AppClientInit = window.HEYS.AppClientInit || {};
        const AppTwemojiEffect = window.HEYS.AppTwemojiEffect || {};
        const AppRuntimeState = window.HEYS.AppRuntimeState || {};
        const AppCoreState = window.HEYS.AppCoreState || {};
        const AppRoot = window.HEYS.AppRoot || {};

        const AppHooks = window.HEYS.AppHooks || {};
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

        const AppTabs = window.HEYS.AppTabs || {};
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
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(React.createElement(ErrorBoundary, null, React.createElement(AppComponent)));
        }

        const createApp = AppRoot.createApp
            || (({ React: HookReact }) => function AppFallback() {
                return HookReact.createElement('div', null);
            });
        const App = createApp({ React });
        renderRoot(App);
    };
})();
