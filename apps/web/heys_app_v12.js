// heys_app_v12.js — Main app entry, React root, tab navigation, Supabase integration

(function () {
  // 🔍 PWA Boot logging
  const bootLog = (msg) => window.__heysLog && window.__heysLog('[APP] ' + msg);
  bootLog('heys_app_v12.js started');

  // 🔍 EARLY DEBUG: Проверяем auth token ДО любого кода
  try {
    const _earlyToken = localStorage.getItem('heys_supabase_auth_token');
    bootLog('auth token: ' + (_earlyToken ? 'YES' : 'NO'));
  } catch (e) {
    bootLog('auth check error: ' + e.message);
  }

  const HEYS = window.HEYS = window.HEYS || {};

  // Onboarding tour helpers moved to heys_app_onboarding_v1.js
  // Update checks moved to heys_app_update_checks_v1.js
  // Full backup export moved to heys_app_backup_export_v1.js
  // Debug panel + badge API moved to heys_app_gates_v1.js

  function initializeApp() {
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
    if (window.HEYS.cloud && typeof HEYS.cloud.init === 'function') {
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

    function App() {
      const useTabState = AppTabState.useTabState
        || (({ React: HookReact }) => ({
          tab: HookReact.useState('stats')[0],
          setTab: () => { },
          defaultTab: 'stats',
          setDefaultTab: () => { },
        }));
      const tabState = useTabState({ React });
      const { tab, setTab, defaultTab, setDefaultTab } = tabState;

      const { theme, resolvedTheme, cycleTheme } = useThemePreference();
      useEffect(() => {
        HEYS.cycleTheme = cycleTheme;
      }, [cycleTheme]);

      // Twemoji: reparse emoji on mount and tab change
      useEffect(() => {
        // console.log('[App] 🎨 Twemoji effect triggered', {...});
        if (window.applyTwemoji) {
          // Immediate + delayed to catch React render
          window.applyTwemoji();
          setTimeout(() => {
            // console.log('[App] 🎨 Twemoji delayed parse (50ms)');
            window.applyTwemoji();
          }, 50);
          setTimeout(() => {
            // console.log('[App] 🎨 Twemoji delayed parse (150ms)');
            window.applyTwemoji();
          }, 150);
        } else {
          console.warn('[App] ⚠️ applyTwemoji not available');
        }
      }, [tab]);

      const U = window.HEYS.utils || { lsGet: (k, d) => d, lsSet: () => { } };
      const cloud = window.HEYS.cloud || {};
      const {
        status, setStatus,
        syncVer, setSyncVer,
        calendarVer, setCalendarVer,
        clients, setClients,
        clientsSource, setClientsSource,
        clientId, setClientId,
        newName, setNewName,
        cloudUser, setCloudUser,
        isInitializing, setIsInitializing,
        products, setProducts,
        backupMeta, setBackupMeta,
        backupBusy, setBackupBusy,
        needsConsent, setNeedsConsent,
        checkingConsent, setCheckingConsent,
        curatorTab, setCuratorTab, // 🆕
      } = useClientState(cloud, U);
      const [loginError, setLoginError] = useState('');
      const {
        ONE_CURATOR_MODE,
        fetchClientsFromCloud,
        addClientToCloud,
        renameClient,
        removeClient,
        cloudSignIn,
        cloudSignOut,
      } = useCloudClients(cloud, U, {
        clients, setClients,
        clientsSource, setClientsSource,
        clientId, setClientId,
        cloudUser, setCloudUser,
        setProducts,
        setStatus,
        setSyncVer,
        setLoginError,
      });
      // ...все остальные useState...
      // useEffect автосмены клиента — ниже всех useState!

      const useWidgetsEditMode = AppRuntimeEffects.useWidgetsEditMode
        || (({ React: HookReact }) => ({
          widgetsEditMode: HookReact.useState(false)[0],
          setWidgetsEditMode: () => { },
        }));
      const widgetsEditState = useWidgetsEditMode({ React });
      const { widgetsEditMode } = widgetsEditState;

      const useConsentCheck = AppRuntimeEffects.useConsentCheck
        || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
      useConsentCheck({
        React,
        clientId,
        cloudUser,
        setNeedsConsent,
        setCheckingConsent,
      });

      const swipeState = AppSwipeNav.useSwipeNavigation
        ? AppSwipeNav.useSwipeNavigation({ React, tab, setTab })
        : {
          slideDirection: null,
          edgeBounce: null,
          onTouchStart: () => { },
          onTouchEnd: () => { },
        };
      const { slideDirection, edgeBounce, onTouchStart, onTouchEnd } = swipeState;
      // Дата для DayTab (поднятый state для DatePicker в шапке)
      // До 3:00 — "сегодня" = вчера (день ещё не закончился)
      const todayISO = () => {
        const d = new Date();
        const hour = d.getHours();
        if (hour < 3) {
          d.setDate(d.getDate() - 1);
        }
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      };
      const [selectedDate, setSelectedDate] = useState(todayISO());

      // === PWA Install Banner ===
      const {
        showPwaBanner,
        showIosPwaBanner,
        handlePwaInstall,
        dismissPwaBanner,
        dismissIosPwaBanner,
      } = usePwaPrompts();
      const {
        cloudStatus,
        pendingCount,
        pendingDetails,
        showOfflineBanner,
        showOnlineBanner,
        syncProgress,
        retryCountdown,
        handleRetrySync,
        offlineDuration, // 🆕 Время офлайн в секундах
      } = useCloudSyncStatus();

      const useUpdateNotifications = AppUpdateNotifications.useUpdateNotifications
        || (({ React: HookReact }) => {
          const [showUpdateToast, setShowUpdateToast] = HookReact.useState(false);
          const [notification, setNotification] = HookReact.useState(null);
          HookReact.useEffect(() => { }, []);
          const handleUpdate = HookReact.useCallback(() => { }, []);
          const dismissUpdateToast = HookReact.useCallback(() => { }, []);
          return { showUpdateToast, notification, setNotification, handleUpdate, dismissUpdateToast };
        });
      const updateNotifications = useUpdateNotifications({ React });
      const {
        showUpdateToast,
        notification,
        setNotification,
        handleUpdate,
        dismissUpdateToast,
      } = updateNotifications;

      const useBadgeSync = AppRuntimeEffects.useBadgeSync
        || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
      useBadgeSync({ React });

      const useCalendarSync = AppRuntimeEffects.useCalendarSync
        || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
      useCalendarSync({ React, setCalendarVer });

      // Вычисляем activeDays для DatePicker (после объявления clientId и products)
      // 🔒 ОПТИМИЗАЦИЯ: Используем calendarVer вместо syncVer — он меняется только при cycleDay
      // Пересчитывается когда: меняется месяц, клиент, продукты, или cycleDay (через calendarVer)
      const datePickerActiveDays = React.useMemo(() => {
        // Fallback chain для products: props → HEYS.products.getAll() → localStorage
        const effectiveProducts = (products && products.length > 0) ? products
          : (window.HEYS.products?.getAll?.() || [])
            .length > 0 ? window.HEYS.products.getAll()
            : (U.lsGet?.('heys_products', []) || []);

        // Не вычисляем пока идёт инициализация или нет продуктов
        if (isInitializing || effectiveProducts.length === 0) {
          return new Map();
        }

        const getActiveDaysForMonth = window.HEYS.dayUtils && window.HEYS.dayUtils.getActiveDaysForMonth;
        if (!getActiveDaysForMonth || !clientId) {
          return new Map();
        }

        // Получаем profile из localStorage
        const profile = U && U.lsGet ? U.lsGet('heys_profile', {}) : {};

        // Парсим selectedDate для определения месяца
        const parts = selectedDate.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed

        try {
          // Передаём effectiveProducts (с fallback) в функцию
          return getActiveDaysForMonth(year, month, profile, effectiveProducts);
        } catch (e) {
          // Тихий fallback — activeDays для календаря не критичны
          return new Map();
        }
      }, [selectedDate, clientId, products, isInitializing, calendarVer]);

      const backupHelpers = useMemo(() => {
        if (!AppBackup.createBackupHelpers) return null;
        return AppBackup.createBackupHelpers({
          U,
          clientId,
          setProducts,
          setSyncVer,
          setBackupMeta,
        });
      }, [U, clientId, setProducts, setSyncVer, setBackupMeta]);

      const backupAllKeys = backupHelpers?.backupAllKeys || ((options = {}) => ({ ok: false, reason: 'no-backup-helpers', options }));
      const restoreFromBackup = backupHelpers?.restoreFromBackup || ((target = 'heys_products', options = {}) => ({ ok: false, reason: 'no-backup-helpers', target, options }));
      const formatBackupTime = backupHelpers?.formatBackupTime || (() => '—');

      // Автопереключение на домашнюю вкладку при выборе клиента
      // (пропускаем если это PWA shortcut action)
      const skipTabSwitchRef = useRef(false);
      useEffect(() => {
        if (clientId && !skipTabSwitchRef.current) {
          // Используем сохранённую домашнюю вкладку вместо захардкоженной 'stats'
          setTab(defaultTab);
        }
      }, [clientId, defaultTab]);

      const useSyncEffects = AppSyncEffects.useSyncEffects
        || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
      useSyncEffects({
        React,
        U,
        cloud,
        clientId,
        products,
        setProducts,
        setSyncVer,
        setBackupMeta,
      });

      // Обертка для сохранения данных клиента в облако
      // ВАЖНО: Поддерживает ДВА формата вызова:
      //   - saveClientKey(key, value) — старый формат, 2 аргумента
      //   - saveClientKey(clientId, key, value) — новый формат, 3 аргумента (из Store.set)
      window.HEYS = window.HEYS || {};
      window.HEYS.saveClientKey = function (...args) {
        if (cloud && typeof cloud.saveClientKey === 'function') {
          if (args.length === 3) {
            // Новый формат: (clientId, key, value)
            const [cid, k, v] = args;
            cloud.saveClientKey(cid, k, v);
          } else if (args.length === 2) {
            // Старый формат: (key, value) — используем clientId из замыкания
            const [k, v] = args;
            if (clientId) {
              cloud.saveClientKey(clientId, k, v);
            }
          }
        }
      };
      useEffect(() => {
        window.HEYS = window.HEYS || {};
        window.HEYS.backupManager = window.HEYS.backupManager || {};
        window.HEYS.backupManager.backupAll = backupAllKeys;
        window.HEYS.backupManager.restore = restoreFromBackup;
        window.HEYS.backupManager.getLastBackupMeta = () => backupMeta;
      }, [backupAllKeys, restoreFromBackup, backupMeta]);
      // overlay (no early return, to keep hooks order stable)

      const useBackupActions = AppBackupActions.useBackupActions
        || (({ React: HookReact }) => ({
          handleManualBackup: HookReact.useCallback(() => { }, []),
          handleExportBackup: HookReact.useCallback(() => { }, []),
          handleRestoreProducts: HookReact.useCallback(() => { }, []),
          handleRestoreAll: HookReact.useCallback(() => { }, []),
        }));
      const backupActions = useBackupActions({
        React,
        clientId,
        backupBusy,
        setBackupBusy,
        backupAllKeys,
        restoreFromBackup,
      });
      const {
        handleManualBackup,
        handleExportBackup,
        handleRestoreProducts,
        handleRestoreAll,
      } = backupActions;

      const useAppUIState = AppUIState.useAppUIState
        || (({ React: HookReact }) => ({
          email: HookReact.useState('')[0],
          setEmail: () => { },
          pwd: HookReact.useState('')[0],
          setPwd: () => { },
          rememberMe: false,
          setRememberMe: () => { },
          handleSignIn: () => Promise.resolve(),
          handleSignOut: () => { },
          clientSearch: '',
          setClientSearch: () => { },
          showClientDropdown: false,
          setShowClientDropdown: () => { },
          newPhone: '',
          setNewPhone: () => { },
          newPin: '',
          setNewPin: () => { },
        }));
      const authUiState = useAppUIState({
        React,
        cloudSignIn,
        cloudSignOut,
        setTab,
        setNotification,
        skipTabSwitchRef,
      });
      const {
        email,
        setEmail,
        pwd,
        setPwd,
        rememberMe,
        setRememberMe,
        handleSignIn,
        handleSignOut,
        clientSearch,
        setClientSearch,
        showClientDropdown,
        setShowClientDropdown,
        newPhone,
        setNewPhone,
        newPin,
        setNewPin,
      } = authUiState;

      // Morning Check-in — логика вынесена в heys_app_morning_checkin_v1.js
      const morningCheckinState = AppMorningCheckin.useMorningCheckinSync
        ? AppMorningCheckin.useMorningCheckinSync({ React, isInitializing, clientId })
        : { showMorningCheckin: false, setShowMorningCheckin: () => { } };
      const { showMorningCheckin, setShowMorningCheckin } = morningCheckinState;

      // Helpers вынесены в heys_app_client_helpers_v1.js
      const getClientInitials = AppClientHelpers.getClientInitials || ((name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
          return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
      });

      const getAvatarColor = AppClientHelpers.getAvatarColor || ((name) => {
        if (!name) return 'linear-gradient(135deg, #4285f4 0%, #2563eb 100%)';
        return 'linear-gradient(135deg, #4285f4 0%, #2563eb 100%)';
      });

      const getClientStats = AppClientHelpers.getClientStats || (() => ({ lastActiveDate: null, streak: 0 }));
      const formatLastActive = AppClientHelpers.formatLastActive || (() => '');

      const gate = AppGateFlow.buildGate ? AppGateFlow.buildGate({
        clientId,
        isInitializing,
        cloudUser,
        clients,
        clientsSource,
        clientSearch,
        setClientSearch,
        setClientId,
        cloudSignIn,
        handleSignOut,
        U,
        getClientStats,
        formatLastActive,
        getAvatarColor,
        getClientInitials,
        renameClient,
        removeClient,
        addClientToCloud,
        newName,
        setNewName,
        newPhone,
        setNewPhone,
        newPin,
        setNewPin,
        curatorTab,
        setCuratorTab,
      }) : null;

      // 🖥️ Desktop Gate — заглушка для клиентов на широких экранах
      // Определяем куратор ли это (есть user object после curator login)
      const desktopGateState = AppDesktopGate.useDesktopGateState
        ? AppDesktopGate.useDesktopGateState({ React })
        : { isDesktop: window.innerWidth > 768, isCurator: false };
      const { isDesktop, isCurator } = desktopGateState;

      // Читаем desktopAllowed из профиля
      const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
      const desktopAllowed = profile.desktopAllowed === true;

      // Desktop Gate: если клиент на десктопе и десктоп НЕ разрешён
      const desktopGate = AppGateFlow.buildDesktopGate ? AppGateFlow.buildDesktopGate({
        gate,
        isDesktop,
        isCurator,
        desktopAllowed,
        DesktopGateScreen,
        setClientId,
      }) : null;

      // 📜 Consent Gate: если клиенту нужно подписать согласия
      // Показывается после логина, но ДО основного приложения
      const consentGate = AppGateFlow.buildConsentGate ? AppGateFlow.buildConsentGate({
        gate,
        desktopGate,
        cloudUser,
        clientId,
        needsConsent,
        checkingConsent,
        setNeedsConsent,
        setShowMorningCheckin,
      }) : null;

      useEffect(() => {
        if (!AppAuthInit.runAuthInit) return;
        return AppAuthInit.runAuthInit({
          U,
          cloud,
          setProducts,
          setClients,
          setClientsSource,
          setClientId,
          setSyncVer,
          setEmail,
          setCloudUser,
          setStatus,
          setIsInitializing,
        });
      }, []);

      // Обновление products при смене clientId (без bootstrap — его делают wrapper'ы)
      useEffect(() => {
        if (clientId) {
          const loadedProducts = Array.isArray(window.HEYS.utils.lsGet('heys_products', []))
            ? window.HEYS.utils.lsGet('heys_products', [])
            : [];
          setProducts(loadedProducts);
          setSyncVer((v) => v + 1);
        }
      }, [clientId]);

      const useClientListSync = AppClientManagement.useClientListSync
        || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
      useClientListSync({
        React,
        cloudUser,
        clientsSource,
        fetchClientsFromCloud,
        setClients,
        setClientId,
        clientId,
      });

      const useClientsUpdatedListener = AppClientManagement.useClientsUpdatedListener
        || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
      useClientsUpdatedListener({ React, setClients });

      const createTestClients = AppClientManagement.createTestClients
        || (async () => { });

      // Автологин отключён: показываем пользователю стартовый экран входа.

      // Формируем текст для pending details
      const getPendingText = () => {
        const parts = [];
        if (pendingDetails.days > 0) parts.push(`${pendingDetails.days} дн.`);
        if (pendingDetails.products > 0) parts.push(`${pendingDetails.products} прод.`);
        if (pendingDetails.profile > 0) parts.push('профиль');
        if (pendingDetails.other > 0) parts.push(`${pendingDetails.other} др.`);
        return parts.length > 0 ? parts.join(', ') : '';
      };

      // === Кэшированные переменные для производительности ===
      // isPinAuthClient: true = вход по PIN (клиент), false = куратор
      const isRpcMode = HEYS.cloud?.isPinAuthClient?.() || false;
      const cachedProfile = (() => {
        const U = window.HEYS && window.HEYS.utils;
        return U && U.lsGet ? U.lsGet('heys_profile', {}) : {};
      })();

      // Имя клиента: в RPC режиме из профиля, иначе из списка clients
      const currentClientName = (() => {
        if (isRpcMode) {
          // Поддерживаем оба формата: name (от куратора) и firstName+lastName (от регистрации)
          const fullName = cachedProfile.name ||
            [cachedProfile.firstName, cachedProfile.lastName].filter(Boolean).join(' ');
          if (fullName) return fullName;

          // 💡 Для новых клиентов до заполнения профиля — используем имя от куратора
          try {
            const pendingRaw = localStorage.getItem('heys_pending_client_name');
            if (pendingRaw) {
              const pendingName = JSON.parse(pendingRaw);
              if (pendingName) return pendingName;
            }
          } catch (e) { }

          return 'Мой профиль';
        }
        return Array.isArray(clients)
          ? (clients.find((c) => c.id === clientId)?.name || 'Выберите клиента')
          : 'Выберите клиента';
      })();

      // Morning Check-in блокирует основной контент (показывается ДО загрузки)
      const isMorningCheckinBlocking = showMorningCheckin === true && HEYS.MorningCheckin;

      // Проверка согласий блокирует всё (показывается ДО morning checkin)
      const isConsentBlocking = needsConsent || checkingConsent;

      return React.createElement(AppOverlays, {
        gate,
        desktopGate,
        consentGate,
        isConsentBlocking,
        isMorningCheckinBlocking,
        showMorningCheckin,
        setShowMorningCheckin,
        showOfflineBanner,
        showOnlineBanner,
        offlineDuration,
        pendingCount,
        showPwaBanner,
        showIosPwaBanner,
        handlePwaInstall,
        dismissPwaBanner,
        dismissIosPwaBanner,
        showUpdateToast,
        handleUpdate,
        dismissUpdateToast,
        notification,
        dismissNotification: () => setNotification(null),
        widgetsEditMode,
        tab,
        AppShell,
        appShellProps: {
          hideContent: (isConsentBlocking || isMorningCheckinBlocking || !clientId),
          clientId,
          clientIdValue: clientId,
          tab,
          setTab,
          selectedDate,
          setSelectedDate,
          todayISO,
          datePickerActiveDays,
          products,
          setProducts,
          cachedProfile,
          currentClientName,
          getAvatarColor,
          getClientInitials,
          getClientStats,
          formatLastActive,
          clients,
          setClientId,
          showClientDropdown,
          setShowClientDropdown,
          isRpcMode,
          cloudUser,
          handleSignOut,
          U,
          cloudStatus,
          syncProgress,
          pendingCount,
          retryCountdown,
          GamificationBar,
          widgetsEditMode,
          defaultTab,
          setDefaultTab,
          slideDirection,
          edgeBounce,
          onTouchStart,
          onTouchEnd,
          syncVer,
          DayTabWithCloudSync,
          RationTabWithCloudSync,
          UserTabWithCloudSync,
        }
      });
    }
    renderRoot(App);
  }

  // Start initialization
  const startDependencyLoader = HEYS.AppDependencyLoader?.start;
  if (startDependencyLoader) {
    startDependencyLoader({ initializeApp });
  } else {
    setTimeout(() => {
      const retryStart = HEYS.AppDependencyLoader?.start;
      if (retryStart) {
        retryStart({ initializeApp });
        return;
      }
      window.__heysLog && window.__heysLog('[DEPS] dependency loader missing, fallback start');
      initializeApp();
    }, 100);
  }
})();
