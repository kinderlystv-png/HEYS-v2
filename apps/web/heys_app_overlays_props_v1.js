// heys_app_overlays_props_v1.js — AppOverlays props builder

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppOverlaysProps = HEYS.AppOverlaysProps || {};

    HEYS.AppOverlaysProps.buildOverlaysProps = function ({
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
        dismissNotification,
        widgetsEditMode,
        tab,
        AppShell,
        appShellProps,
    }) {
        return {
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
            dismissNotification,
            widgetsEditMode,
            tab,
            AppShell,
            appShellProps,
        };
    };
})();
