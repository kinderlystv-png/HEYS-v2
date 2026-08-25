// heys_app_update_notifications_v1.js — обычный тост приложения
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    // Тост «Доступна новая версия» удалён 25 августа 2026: решение владельца
    // 19.08, подтверждённое шестнадцатой сборкой — pwa-update.v4.dc.html,
    // строка «мягкие уведомления» перечисляет toast среди того, что не
    // рисуется, а лестница слоёв прямо говорит «вестника версии среди ролей
    // тоста нет». Функция HEYS.showUpdateToast не вызывалась ниоткуда:
    // обновление ставится само, и спрашивать разрешения не у кого.
    //
    // Обычный тост приложения (notification) остаётся — он живой.
    const useUpdateNotifications = ({ React }) => {
        const [notification, setNotification] = React.useState(null);

        React.useEffect(() => {
            if (!notification) return;
            const duration = Number(notification.duration) || 3000;
            const timer = setTimeout(() => setNotification(null), duration);
            return () => clearTimeout(timer);
        }, [notification]);

        return {
            notification,
            setNotification,
        };
    };

    HEYS.AppUpdateNotifications = {
        useUpdateNotifications,
    };
})();
