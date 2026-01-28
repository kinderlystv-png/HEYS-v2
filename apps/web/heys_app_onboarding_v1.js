// heys_app_onboarding_v1.js — Onboarding tour helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const trackOnboardingEvent = (event, data) => {
        if (HEYS.analytics?.trackEvent) {
            HEYS.analytics.trackEvent(event, data);
        }
    };

    const trackOnboardingError = (error, context) => {
        if (HEYS.analytics?.trackError) {
            HEYS.analytics.trackError(error, context);
        }
    };

    const tryParseStoredValue = (raw, fallback) => {
        if (raw === null || raw === undefined) return fallback;
        if (typeof raw === 'string') {
            let str = raw;
            if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
                try { str = HEYS.store.decompress(str); } catch (_) { }
            }
            try { return JSON.parse(str); } catch (_) { return str; }
        }
        return raw;
    };

    const readStoredValue = (key, fallback = null) => {
        let value;
        if (HEYS.store?.get) {
            value = HEYS.store.get(key, null);
        } else if (HEYS.utils?.lsGet) {
            value = HEYS.utils.lsGet(key, fallback);
        } else {
            try {
                value = localStorage.getItem(key);
            } catch (e) {
                return fallback;
            }
        }

        if (value == null) return fallback;
        return tryParseStoredValue(value, fallback);
    };

    const getStoredFlag = (key, fallback = false) => {
        const scoped = readStoredValue(key, null);
        if (scoped === true || scoped === 'true') return true;
        if (scoped === false || scoped === 'false') return false;
        return fallback;
    };

    // 🎓 ONBOARDING TOUR — функция проверки и запуска
    // Отдельная функция чтобы можно было вызвать и при загрузке, и после checkin-complete
    const tryStartOnboardingTour = () => {
        const hasSeenTour = getStoredFlag('heys_tour_completed', false);

        // 🆕 v1.7: Используем централизованную проверку авторизации
        const isClient = isClientAuthorized();

        // 🆕 Проверяем, не показывается ли сейчас MorningCheckin с регистрационными шагами
        const profile = HEYS.store?.get?.('heys_profile', {}) || {};
        const profileIncomplete = HEYS.ProfileSteps?.isProfileIncomplete?.(profile);

        // 🆕 v1.14: Проверяем что согласия уже приняты (флаг устанавливается в React после проверки)
        // HEYS._consentsChecked = проверка завершена, HEYS._consentsValid = согласия приняты
        const consentsNotReady = isClient && (!HEYS._consentsChecked || !HEYS._consentsValid);

        // Запускаем только если: авторизован как клиент, еще не видел тур, профиль заполнен, согласия приняты
        if (isClient && !hasSeenTour && !profileIncomplete && !consentsNotReady && window.HEYS.OnboardingTour) {
            trackOnboardingEvent('onboarding_tour_triggered', {
                reason: 'eligible',
                consentsChecked: HEYS._consentsChecked,
                consentsValid: HEYS._consentsValid,
            });
            window.HEYS.OnboardingTour.start();
            return true;
        } else if (!isClient) {
            trackOnboardingEvent('onboarding_tour_skipped', { reason: 'not_client' });
        } else if (profileIncomplete) {
            trackOnboardingEvent('onboarding_tour_deferred', { reason: 'profile_incomplete' });
        } else if (consentsNotReady) {
            trackOnboardingEvent('onboarding_tour_deferred', {
                reason: 'consents_not_ready',
                consentsChecked: HEYS._consentsChecked,
                consentsValid: HEYS._consentsValid,
            });
        }
        return false;
    };

    // 🎓 v1.7: Tour ONLY for PIN-authenticated clients, NOT for curators
    // Централизованные проверки авторизации (выносим в HEYS для переиспользования)
    const isCuratorSession = () => {
        const isCuratorSessionFn = HEYS.auth?.isCuratorSession;
        if (typeof isCuratorSessionFn === 'function') return isCuratorSessionFn();
        const curatorSession = readStoredValue('heys_curator_session', null);
        const supabaseToken = readStoredValue('heys_supabase_auth_token', null);
        return !!(curatorSession || supabaseToken || HEYS.cloud?.getUser?.());
    };

    // 🆕 v1.7: Проверка что пользователь авторизован как КЛИЕНТ (не куратор, не гость)
    const isClientAuthorized = () => {
        // 🔧 v1.11: Проверяем ОБА ключа — heys_client_current И heys_pin_auth_client
        let clientId = null;

        // 1. Сначала пробуем heys_pin_auth_client (для PIN auth)
        const pinAuthClient = readStoredValue('heys_pin_auth_client', null);
        if (pinAuthClient && pinAuthClient.length > 10) {
            clientId = pinAuthClient;
            trackOnboardingEvent('onboarding_auth_pin_client', { clientId });
        }

        // 2. Потом heys_client_current (для curator-managed clients)
        if (!clientId) {
            try {
                const raw = readStoredValue('heys_client_current', null);
                trackOnboardingEvent('onboarding_auth_client_current_raw', { raw });
                if (raw) clientId = raw;
                trackOnboardingEvent('onboarding_auth_client_current_parsed', { clientId });
            } catch (e) {
                // fallback — если вдруг сохранено без JSON
                clientId = readStoredValue('heys_client_current', null);
                trackOnboardingEvent('onboarding_auth_client_current_fallback', { clientId });
                trackOnboardingError(e, { scope: 'onboarding_auth_client_current_parse' });
            }
        }

        const isCurator = isCuratorSession();
        const result = clientId && clientId.length > 10 && !isCurator;
        trackOnboardingEvent('onboarding_auth_check', {
            clientId,
            length: clientId?.length,
            isCurator,
            result,
        });
        // clientId должен быть непустой строкой (UUID)
        return result;
    };

    // Экспортируем для использования в других компонентах
    window.HEYS._tour = window.HEYS._tour || {};
    window.HEYS._tour.isCuratorSession = isCuratorSession;
    window.HEYS._tour.isClientAuthorized = isClientAuthorized;
    window.HEYS._tour.tryStart = tryStartOnboardingTour; // 🆕 v1.9: экспорт для вызова после пропуска чекина

    // Первая попытка через 2 сек после загрузки (только для клиентов)
    setTimeout(() => {
        if (!isCuratorSession()) tryStartOnboardingTour();
    }, 2000);

    // 🆕 Слушатель: после завершения checkin (регистрации) — пробуем показать тур
    window.addEventListener('heys:checkin-complete', () => {
        if (isCuratorSession()) return; // Пропускаем для кураторов
        trackOnboardingEvent('onboarding_checkin_complete', {});
        // Небольшая задержка чтобы UI обновился после checkin
        setTimeout(tryStartOnboardingTour, 500);
    }); // 🆕 v1.9: убрали once:true — можем слушать многократно

    HEYS.AppOnboarding = {
        tryStartOnboardingTour,
        isCuratorSession,
        isClientAuthorized,
    };
})();
