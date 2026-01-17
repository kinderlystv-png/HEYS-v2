// heys_app_update_notifications_v1.js — update toast & notifications
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useUpdateNotifications = ({ React }) => {
        const [showUpdateToast, setShowUpdateToast] = React.useState(false);
        const [notification, setNotification] = React.useState(null);

        React.useEffect(() => {
            if (!notification) return;
            const duration = Number(notification.duration) || 3000;
            const timer = setTimeout(() => setNotification(null), duration);
            return () => clearTimeout(timer);
        }, [notification]);

        React.useEffect(() => {
            window.HEYS = window.HEYS || {};
            window.HEYS.showUpdateToast = () => {
                setShowUpdateToast(true);
            };
            return () => {
                if (window.HEYS) delete window.HEYS.showUpdateToast;
            };
        }, []);

        const handleUpdate = React.useCallback(() => {
            HEYS.PlatformAPIs.triggerSkipWaiting({
                fallbackMs: 5000,
                showModal: false,
                source: 'UpdateToast.handleUpdate'
            });
        }, []);

        const dismissUpdateToast = React.useCallback(() => {
            setShowUpdateToast(false);
            localStorage.setItem('heys_update_dismissed', Date.now().toString());
        }, []);

        return {
            showUpdateToast,
            notification,
            setNotification,
            handleUpdate,
            dismissUpdateToast,
        };
    };

    HEYS.AppUpdateNotifications = {
        useUpdateNotifications,
    };
})();
