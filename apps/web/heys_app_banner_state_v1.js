// heys_app_banner_state_v1.js — PWA/Update banner state

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppBannerState = HEYS.AppBannerState || {};

    HEYS.AppBannerState.useBannerState = function ({
        React,
        usePwaPrompts,
        useCloudSyncStatus,
        useUpdateNotifications,
    }) {
        const pwa = usePwaPrompts ? usePwaPrompts() : {
            showPwaBanner: false,
            showIosPwaBanner: false,
            handlePwaInstall: () => { },
            dismissPwaBanner: () => { },
            dismissIosPwaBanner: () => { },
        };

        const cloudSync = useCloudSyncStatus ? useCloudSyncStatus() : {
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

        const updates = useUpdateNotifications ? useUpdateNotifications({ React }) : {
            showUpdateToast: false,
            notification: null,
            setNotification: () => { },
            handleUpdate: () => { },
            dismissUpdateToast: () => { },
        };

        return {
            ...pwa,
            ...cloudSync,
            ...updates,
        };
    };
})();
