// heys_app_root_impl_v1.js — App component implementation extracted from heys_app_root_component_v1.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppRootImpl = HEYS.AppRootImpl || {};

    HEYS.AppRootImpl.createApp = function createApp({ React }) {
        const AppGateFlow = HEYS.AppGateFlow || {};
        const AppBackup = HEYS.AppBackup || {};
        const AppShortcuts = HEYS.AppShortcuts || {};
        const AppAuthInit = HEYS.AppAuthInit || {};
        const AppClientHelpers = HEYS.AppClientHelpers || {};
        const AppDesktopGate = HEYS.AppDesktopGate || {};
        const AppMorningCheckin = HEYS.AppMorningCheckin || {};
        const AppSwipeNav = HEYS.AppSwipeNav || {};
        const AppRuntimeEffects = HEYS.AppRuntimeEffects || {};
        const AppSyncEffects = HEYS.AppSyncEffects || {};
        const AppTabState = HEYS.AppTabState || {};
        const AppClientManagement = HEYS.AppClientManagement || {};
        const AppBackupActions = HEYS.AppBackupActions || {};
        const AppUpdateNotifications = HEYS.AppUpdateNotifications || {};
        const AppUIState = HEYS.AppUIState || {};
        const AppClientStateManager = HEYS.AppClientStateManager || {};
        const AppDateState = HEYS.AppDateState || {};
        const AppDerivedState = HEYS.AppDerivedState || {};
        const AppShellProps = HEYS.AppShellProps || {};
        const AppOverlaysProps = HEYS.AppOverlaysProps || {};
        const AppGateState = HEYS.AppGateState || {};
        const AppGlobalBindings = HEYS.AppGlobalBindings || {};
        const AppBackupState = HEYS.AppBackupState || {};
        const AppBannerState = HEYS.AppBannerState || {};
        const AppClientInit = HEYS.AppClientInit || {};
        const AppTwemojiEffect = HEYS.AppTwemojiEffect || {};
        const AppRuntimeState = HEYS.AppRuntimeState || {};
        const AppCoreState = HEYS.AppCoreState || {};
        const DesktopGateScreen = HEYS.DesktopGateScreen;
        const GamificationBar = HEYS.GamificationBar;
        const AppShell = HEYS.AppShell && HEYS.AppShell.AppShell;
        const AppOverlays = HEYS.AppOverlays && HEYS.AppOverlays.AppOverlays;
        const AppTabs = HEYS.AppTabs || {};
        const {
            DayTabWithCloudSync,
            RationTabWithCloudSync,
            UserTabWithCloudSync,
            AnalyticsTab,
        } = AppTabs;

        const AppHooks = HEYS.AppHooks || {};
        const {
            useThemePreference,
            usePwaPrompts,
            useWakeLock,
            useCloudSyncStatus,
            useClientState,
            useCloudClients,
        } = AppHooks;

        function App() {
            const getStableHook = (primaryHook, fallbackHook) => {
                const hookRef = React.useRef(primaryHook || fallbackHook);
                return hookRef.current;
            };

            const fallbackUseTabState = ({ React: HookReact }) => ({
                tab: HookReact.useState('stats')[0],
                setTab: () => { },
                defaultTab: 'stats',
                setDefaultTab: () => { },
            });
            const useTabState = getStableHook(AppTabState.useTabState, fallbackUseTabState);
            const tabState = useTabState({ React });
            const { tab, setTab, defaultTab, setDefaultTab } = tabState;

            const { theme, resolvedTheme, cycleTheme } = useThemePreference();
            React.useEffect(() => {
                HEYS.cycleTheme = cycleTheme;
            }, [cycleTheme]);

            const fallbackUseTwemojiEffect = ({ React: HookReact }) => HookReact.useEffect(() => { }, []);
            const useTwemojiEffect = getStableHook(AppTwemojiEffect.useTwemojiEffect, fallbackUseTwemojiEffect);
            useTwemojiEffect({ React, tab });

            const U = HEYS.utils || { lsGet: (k, d) => d, lsSet: () => { } };
            const cloud = HEYS.cloud || {};

            const fallbackUseAppCoreState = ({ React: HookReact, AppHooks: HookAppHooks, cloud: hookCloud, U: hookU }) => {
                const { useClientState: hookUseClientState, useCloudClients: hookUseCloudClients } = HookAppHooks || {};
                const [loginError, setLoginError] = HookReact.useState('');
                const clientState = hookUseClientState ? hookUseClientState(hookCloud, hookU) : {
                    status: 'offline', setStatus: () => { },
                    syncVer: 0, setSyncVer: () => { },
                    calendarVer: 0, setCalendarVer: () => { },
                    clients: [], setClients: () => { },
                    clientsSource: 'local', setClientsSource: () => { },
                    clientId: null, setClientId: () => { },
                    newName: '', setNewName: () => { },
                    cloudUser: null, setCloudUser: () => { },
                    isInitializing: false, setIsInitializing: () => { },
                    products: [], setProducts: () => { },
                    backupMeta: null, setBackupMeta: () => { },
                    backupBusy: false, setBackupBusy: () => { },
                    needsConsent: false, setNeedsConsent: () => { },
                    checkingConsent: false, setCheckingConsent: () => { },
                    curatorTab: 'clients', setCuratorTab: () => { },
                };
                const {
                    clients,
                    setClients,
                    clientsSource,
                    setClientsSource,
                    clientId,
                    setClientId,
                    cloudUser,
                    setCloudUser,
                    setProducts,
                    setStatus,
                    setSyncVer,
                } = clientState;
                const cloudClients = hookUseCloudClients
                    ? hookUseCloudClients(hookCloud, hookU, {
                        clients,
                        setClients,
                        clientsSource,
                        setClientsSource,
                        clientId,
                        setClientId,
                        cloudUser,
                        setCloudUser,
                        setProducts,
                        setStatus,
                        setSyncVer,
                        setLoginError,
                    })
                    : {
                        ONE_CURATOR_MODE: false,
                        fetchClientsFromCloud: async () => [],
                        addClientToCloud: async () => ({}),
                        renameClient: async () => ({}),
                        removeClient: async () => ({}),
                        cloudSignIn: async () => ({}),
                        cloudSignOut: async () => ({}),
                    };
                return { clientState, cloudClients, loginError, setLoginError };
            };
            const useAppCoreState = getStableHook(AppCoreState.useAppCoreState, fallbackUseAppCoreState);
            const coreState = useAppCoreState({ React, AppHooks, cloud, U });
            const { clientState, cloudClients, loginError, setLoginError } = coreState;
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
                curatorTab, setCuratorTab,
            } = clientState;
            const {
                ONE_CURATOR_MODE,
                fetchClientsFromCloud,
                addClientToCloud,
                renameClient,
                removeClient,
                cloudSignIn,
                cloudSignOut,
            } = cloudClients;

            const fallbackUseRuntimeState = ({ React: HookReact }) => ({
                widgetsEditMode: HookReact.useState(false)[0],
                setWidgetsEditMode: () => { },
                swipeState: {
                    slideDirection: null,
                    edgeBounce: null,
                    onTouchStart: () => { },
                    onTouchEnd: () => { },
                },
            });
            const useRuntimeState = getStableHook(AppRuntimeState.useRuntimeState, fallbackUseRuntimeState);
            const runtimeState = useRuntimeState({
                React,
                AppRuntimeEffects,
                AppSwipeNav,
                tab,
                setTab,
                clientId,
                cloudUser,
                setNeedsConsent,
                setCheckingConsent,
                setCalendarVer,
            });
            const { widgetsEditMode } = runtimeState;
            const { slideDirection, edgeBounce, onTouchStart, onTouchEnd } = runtimeState.swipeState;

            const fallbackUseDateSelectionState = ({ React: HookReact }) => {
                const todayISO = () => {
                    const d = new Date();
                    const hour = d.getHours();
                    if (hour < 3) {
                        d.setDate(d.getDate() - 1);
                    }
                    return d.getFullYear()
                        + '-' + String(d.getMonth() + 1).padStart(2, '0')
                        + '-' + String(d.getDate()).padStart(2, '0');
                };
                const [selectedDate, setSelectedDate] = HookReact.useState(todayISO());
                return { todayISO, selectedDate, setSelectedDate };
            };
            const useDateSelectionState = getStableHook(AppDateState.useDateSelectionState, fallbackUseDateSelectionState);
            const dateSelectionState = useDateSelectionState({ React });
            const { todayISO, selectedDate, setSelectedDate } = dateSelectionState;

            const fallbackUseUpdateNotifications = ({ React: HookReact }) => {
                const [showUpdateToast, setShowUpdateToast] = HookReact.useState(false);
                const [notification, setNotification] = HookReact.useState(null);
                HookReact.useEffect(() => { }, []);
                const handleUpdate = HookReact.useCallback(() => { }, []);
                const dismissUpdateToast = HookReact.useCallback(() => { }, []);
                return { showUpdateToast, notification, setNotification, handleUpdate, dismissUpdateToast };
            };
            const useUpdateNotifications = getStableHook(
                AppUpdateNotifications.useUpdateNotifications,
                fallbackUseUpdateNotifications,
            );

            const fallbackUseBannerState = ({ React: HookReact, usePwaPrompts: fallbackPwa, useCloudSyncStatus: fallbackCloud, useUpdateNotifications: fallbackUpdates }) => {
                const pwa = fallbackPwa ? fallbackPwa() : {
                    showPwaBanner: false,
                    showIosPwaBanner: false,
                    handlePwaInstall: () => { },
                    dismissPwaBanner: () => { },
                    dismissIosPwaBanner: () => { },
                };
                const cloudSync = fallbackCloud ? fallbackCloud() : {
                    cloudStatus: 'offline',
                    pendingCount: 0,
                    pendingDetails: { days: 0, products: 0, profile: 0, other: 0 },
                    showOfflineBanner: false,
                    showOnlineBanner: false,
                    syncProgress: null,
                    retryCountdown: 0,
                    handleRetrySync: () => { },
                    offlineDuration: 0,
                };
                const updates = fallbackUpdates ? fallbackUpdates({ React: HookReact }) : {
                    showUpdateToast: false,
                    notification: null,
                    setNotification: () => { },
                    handleUpdate: () => { },
                    dismissUpdateToast: () => { },
                };
                return { ...pwa, ...cloudSync, ...updates };
            };
            const useBannerState = getStableHook(AppBannerState.useBannerState, fallbackUseBannerState);
            const bannerState = useBannerState({
                React,
                usePwaPrompts,
                useCloudSyncStatus,
                useUpdateNotifications,
            });
            const {
                showPwaBanner,
                showIosPwaBanner,
                handlePwaInstall,
                dismissPwaBanner,
                dismissIosPwaBanner,
                cloudStatus,
                pendingCount,
                pendingDetails,
                showOfflineBanner,
                showOnlineBanner,
                syncProgress,
                retryCountdown,
                handleRetrySync,
                offlineDuration,
                showUpdateToast,
                notification,
                setNotification,
                handleUpdate,
                dismissUpdateToast,
            } = bannerState;

            const fallbackUseDatePickerActiveDays = ({ React: HookReact }) => HookReact.useMemo(() => new Map(), []);
            const useDatePickerActiveDays = getStableHook(AppDateState.useDatePickerActiveDays, fallbackUseDatePickerActiveDays);
            const datePickerActiveDays = useDatePickerActiveDays({
                React,
                selectedDate,
                clientId,
                products,
                isInitializing,
                calendarVer,
                U,
            });

            const fallbackUseBackupState = ({ React: HookReact }) => ({
                backupAllKeys: () => ({ ok: false, reason: 'no-backup-helpers' }),
                restoreFromBackup: () => ({ ok: false, reason: 'no-backup-helpers' }),
                formatBackupTime: () => '—',
                backupActions: {
                    handleManualBackup: () => { },
                    handleExportBackup: () => { },
                    handleRestoreProducts: () => { },
                    handleRestoreAll: () => { },
                },
            });
            const useBackupState = getStableHook(AppBackupState.useBackupState, fallbackUseBackupState);
            const backupState = useBackupState({
                React,
                AppBackup,
                AppBackupActions,
                U,
                clientId,
                setProducts,
                setSyncVer,
                setBackupMeta,
                backupBusy,
                setBackupBusy,
            });
            const {
                backupAllKeys,
                restoreFromBackup,
                formatBackupTime,
                backupActions,
            } = backupState;

            const fallbackUseClientStateManager = ({ React: HookReact }) => ({
                skipTabSwitchRef: HookReact.useRef(false),
            });
            const useClientStateManager = getStableHook(
                AppClientStateManager.useClientStateManager,
                fallbackUseClientStateManager,
            );
            const { skipTabSwitchRef } = useClientStateManager({
                React,
                clientId,
                setTab,
                defaultTab,
                setProducts,
                setSyncVer,
            });

            const fallbackUseSyncEffects = ({ React: HookReact }) => HookReact.useEffect(() => { }, []);
            const useSyncEffects = getStableHook(AppSyncEffects.useSyncEffects, fallbackUseSyncEffects);
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

            const fallbackUseGlobalBindings = ({ React: HookReact }) => HookReact.useEffect(() => { }, []);
            const useGlobalBindings = getStableHook(AppGlobalBindings.useGlobalBindings, fallbackUseGlobalBindings);
            useGlobalBindings({
                React,
                cloud,
                clientId,
                backupAllKeys,
                restoreFromBackup,
                backupMeta,
            });

            const {
                handleManualBackup,
                handleExportBackup,
                handleRestoreProducts,
                handleRestoreAll,
            } = backupActions;

            const fallbackAppUIState = ({
                React: HookReact,
                setTab: fallbackSetTab,
                setNotification: fallbackSetNotification,
                skipTabSwitchRef: fallbackSkipRef,
            }) => {
                HookReact.useEffect(() => {
                    const shortcuts = HEYS?.AppShortcuts?.handleShortcuts;
                    if (!shortcuts) return;
                    return shortcuts({
                        setTab: fallbackSetTab,
                        setNotification: fallbackSetNotification,
                        skipTabSwitchRef: fallbackSkipRef,
                    });
                }, [fallbackSetTab, fallbackSetNotification, fallbackSkipRef]);
                return {
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
                };
            };
            const useAppUIState = getStableHook(AppUIState.useAppUIState, fallbackAppUIState);
            const uiState = useAppUIState({
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
            } = uiState;

            const fallbackUseMorningCheckinSync = ({ React: HookReact }) => {
                return { showMorningCheckin: false, setShowMorningCheckin: () => { } };
            };
            const useMorningCheckinSync = getStableHook(
                AppMorningCheckin.useMorningCheckinSync,
                fallbackUseMorningCheckinSync,
            );
            const morningCheckinState = useMorningCheckinSync({ React, isInitializing, clientId });
            const { showMorningCheckin, setShowMorningCheckin } = morningCheckinState;

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

            const fallbackUseGateState = ({ React: HookReact }) => ({
                gate: null,
                desktopGate: null,
                consentGate: null,
                isDesktop: window.innerWidth > 768,
                isCurator: false,
                desktopAllowed: false,
            });
            const useGateState = getStableHook(AppGateState.useGateState, fallbackUseGateState);
            const gateState = useGateState({
                React,
                AppGateFlow,
                AppDesktopGate,
                DesktopGateScreen,
                U,
                cloudUser,
                clientId,
                clients,
                clientsSource,
                clientSearch,
                setClientSearch,
                setClientId,
                cloudSignIn,
                handleSignOut,
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
                needsConsent,
                checkingConsent,
                setNeedsConsent,
                setShowMorningCheckin,
                isInitializing,
            });
            const { gate, desktopGate, consentGate } = gateState;

            const fallbackUseClientInitState = ({ React: HookReact }) => HookReact.useEffect(() => { }, []);
            const useClientInitState = getStableHook(AppClientInit.useClientInitState, fallbackUseClientInitState);
            useClientInitState({
                React,
                AppAuthInit,
                AppClientManagement,
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
                cloudUser,
                clientsSource,
                fetchClientsFromCloud,
                clientId,
            });

            const createTestClients = AppClientManagement.createTestClients
                || (async () => { });

            const fallbackUseAppDerivedState = ({ React: HookReact, pendingDetails: fallbackPendingDetails, clients: fallbackClients, clientId: fallbackClientId, needsConsent: fallbackNeedsConsent, checkingConsent: fallbackCheckingConsent, showMorningCheckin: fallbackShowMorningCheckin, U: fallbackU, cloud: fallbackCloud }) => {
                const pendingText = HookReact.useMemo(() => {
                    if (!fallbackPendingDetails) return '';
                    const parts = [];
                    if (fallbackPendingDetails.days > 0) parts.push(`${fallbackPendingDetails.days} дн.`);
                    if (fallbackPendingDetails.products > 0) parts.push(`${fallbackPendingDetails.products} прод.`);
                    if (fallbackPendingDetails.profile > 0) parts.push('профиль');
                    if (fallbackPendingDetails.other > 0) parts.push(`${fallbackPendingDetails.other} др.`);
                    return parts.length > 0 ? parts.join(', ') : '';
                }, [fallbackPendingDetails]);

                const cachedProfile = HookReact.useMemo(() => {
                    const utils = fallbackU || HEYS?.utils;
                    return utils && utils.lsGet ? utils.lsGet('heys_profile', {}) : {};
                }, [fallbackU]);

                const isRpcMode = fallbackCloud?.isPinAuthClient?.() || false;
                const currentClientName = HookReact.useMemo(() => {
                    if (isRpcMode) {
                        const fullName = cachedProfile.name
                            || [cachedProfile.firstName, cachedProfile.lastName].filter(Boolean).join(' ');
                        if (fullName) return fullName;
                        try {
                            const pendingRaw = localStorage.getItem('heys_pending_client_name');
                            if (pendingRaw) {
                                const pendingName = JSON.parse(pendingRaw);
                                if (pendingName) return pendingName;
                            }
                        } catch (e) { }
                        return 'Мой профиль';
                    }
                    return Array.isArray(fallbackClients)
                        ? (fallbackClients.find((c) => c.id === fallbackClientId)?.name || 'Выберите клиента')
                        : 'Выберите клиента';
                }, [isRpcMode, cachedProfile, fallbackClients, fallbackClientId]);

                const isMorningCheckinBlocking = fallbackShowMorningCheckin === true && HEYS?.MorningCheckin;
                const isConsentBlocking = fallbackNeedsConsent || fallbackCheckingConsent;

                return {
                    pendingText,
                    cachedProfile,
                    isRpcMode,
                    currentClientName,
                    isMorningCheckinBlocking,
                    isConsentBlocking,
                };
            };
            const useAppDerivedState = getStableHook(AppDerivedState.useAppDerivedState, fallbackUseAppDerivedState);
            const derivedState = useAppDerivedState({
                React,
                pendingDetails,
                clients,
                clientId,
                needsConsent,
                checkingConsent,
                showMorningCheckin,
                U,
                cloud,
            });
            const {
                pendingText,
                cachedProfile,
                isRpcMode,
                currentClientName,
                isMorningCheckinBlocking,
                isConsentBlocking,
            } = derivedState;
            const getPendingText = () => pendingText;

            const buildAppShellProps = AppShellProps.buildAppShellProps
                || ((params) => ({
                    hideContent: (params.isConsentBlocking || params.isMorningCheckinBlocking || !params.clientId),
                    clientId: params.clientId,
                    clientIdValue: params.clientId,
                    tab: params.tab,
                    setTab: params.setTab,
                    selectedDate: params.selectedDate,
                    setSelectedDate: params.setSelectedDate,
                    todayISO: params.todayISO,
                    datePickerActiveDays: params.datePickerActiveDays,
                    products: params.products,
                    setProducts: params.setProducts,
                    cachedProfile: params.cachedProfile,
                    currentClientName: params.currentClientName,
                    getAvatarColor: params.getAvatarColor,
                    getClientInitials: params.getClientInitials,
                    getClientStats: params.getClientStats,
                    formatLastActive: params.formatLastActive,
                    clients: params.clients,
                    setClientId: params.setClientId,
                    showClientDropdown: params.showClientDropdown,
                    setShowClientDropdown: params.setShowClientDropdown,
                    isRpcMode: params.isRpcMode,
                    cloudUser: params.cloudUser,
                    handleSignOut: params.handleSignOut,
                    U: params.U,
                    cloudStatus: params.cloudStatus,
                    syncProgress: params.syncProgress,
                    pendingCount: params.pendingCount,
                    retryCountdown: params.retryCountdown,
                    GamificationBar: params.GamificationBar,
                    widgetsEditMode: params.widgetsEditMode,
                    defaultTab: params.defaultTab,
                    setDefaultTab: params.setDefaultTab,
                    slideDirection: params.slideDirection,
                    edgeBounce: params.edgeBounce,
                    onTouchStart: params.onTouchStart,
                    onTouchEnd: params.onTouchEnd,
                    syncVer: params.syncVer,
                    DayTabWithCloudSync: params.DayTabWithCloudSync,
                    RationTabWithCloudSync: params.RationTabWithCloudSync,
                    UserTabWithCloudSync: params.UserTabWithCloudSync,
                }));
            const appShellProps = buildAppShellProps({
                isConsentBlocking,
                isMorningCheckinBlocking,
                clientId,
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
            });

            const buildOverlaysProps = AppOverlaysProps.buildOverlaysProps
                || ((params) => ({
                    gate: params.gate,
                    desktopGate: params.desktopGate,
                    consentGate: params.consentGate,
                    isConsentBlocking: params.isConsentBlocking,
                    isMorningCheckinBlocking: params.isMorningCheckinBlocking,
                    showMorningCheckin: params.showMorningCheckin,
                    setShowMorningCheckin: params.setShowMorningCheckin,
                    showOfflineBanner: params.showOfflineBanner,
                    showOnlineBanner: params.showOnlineBanner,
                    offlineDuration: params.offlineDuration,
                    pendingCount: params.pendingCount,
                    showPwaBanner: params.showPwaBanner,
                    showIosPwaBanner: params.showIosPwaBanner,
                    handlePwaInstall: params.handlePwaInstall,
                    dismissPwaBanner: params.dismissPwaBanner,
                    dismissIosPwaBanner: params.dismissIosPwaBanner,
                    showUpdateToast: params.showUpdateToast,
                    handleUpdate: params.handleUpdate,
                    dismissUpdateToast: params.dismissUpdateToast,
                    notification: params.notification,
                    dismissNotification: params.dismissNotification,
                    widgetsEditMode: params.widgetsEditMode,
                    tab: params.tab,
                    AppShell: params.AppShell,
                    appShellProps: params.appShellProps,
                }));
            const overlaysProps = buildOverlaysProps({
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
                appShellProps,
            });
            return React.createElement(AppOverlays, overlaysProps);
        }

        return App;
    };
})();
