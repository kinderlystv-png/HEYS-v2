// heys_app_morning_checkin_v1.js — Morning check-in gate logic
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useMorningCheckinSync = ({ React, isInitializing, clientId }) => {
        const [showMorningCheckin, setShowMorningCheckin] = React.useState(false);

        // Ref для актуального clientId (избегаем проблемы closure)
        const clientIdRef = React.useRef(clientId);
        React.useEffect(() => { clientIdRef.current = clientId; }, [clientId]);

        // Проверяем ТОЛЬКО после события heysSyncCompleted (когда данные точно загружены)
        React.useEffect(() => {
            // Слушаем событие завершения синхронизации
            const handleSyncCompleted = (e) => {
                const eventClientId = e?.detail?.clientId;

                // Пропускаем если нет clientId в событии
                if (!eventClientId) {
                    return;
                }

                // Небольшая задержка чтобы:
                // 1. React state (setClientId) успел обновиться
                // 2. localStorage точно содержит данные нового клиента
                setTimeout(() => {
                    // 🔄 ВАЖНО: Для новых пользователей с незаполненным профилем
                    // показываем чек-ин ДАЖЕ во время инициализации!
                    const U = HEYS.utils || {};
                    const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
                    const isProfileIncomplete = HEYS.ProfileSteps?.isProfileIncomplete?.(profile);

                    // Пропускаем только если:
                    // 1. Ещё идёт инициализация И
                    // 2. Профиль УЖЕ заполнен (не новый пользователь)
                    if (isInitializing && !isProfileIncomplete) return;

                    // Проверяем что clientId из события совпадает с текущим в localStorage
                    // (React state может ещё не обновиться, но localStorage уже правильный)
                    const lsClientId = HEYS.utils?.getCurrentClientId?.() || '';
                    if (eventClientId !== lsClientId) {
                        return;
                    }

                    if (HEYS.shouldShowMorningCheckin) {
                        const shouldShow = HEYS.shouldShowMorningCheckin();

                        // 🛑 Если активен флаг подавления (Onboarding Tour), не показываем чек-ин
                        if (window.HEYS?.ui?.suppressMorningCheckin) {
                            return;
                        }

                        // 🔒 Не обновляем если значение то же (предотвращает ре-рендер)
                        setShowMorningCheckin((prev) => (prev === shouldShow ? prev : shouldShow));
                    }
                }, 200);
            };

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);
            return () => window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
        }, [isInitializing]); // clientId убран из зависимостей — используем ref

        return { showMorningCheckin, setShowMorningCheckin };
    };

    HEYS.AppMorningCheckin = {
        useMorningCheckinSync,
    };
})();
