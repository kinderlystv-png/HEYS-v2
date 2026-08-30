// heys_app_gate_state_v1.js — gate/desktop/consent state builder

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppGateState = HEYS.AppGateState || {};

    HEYS.AppGateState.useGateState = function ({
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
        editClient,
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
        setCheckingConsent,
        setShowMorningCheckin,
        showMorningCheckin,
        isInitializing,
        tab,
        // 2026-05-20 compliance overhaul — optional state из useRuntimeState
        complianceState,
    }) {
        // 💬 Force re-render when MessengerAPI updates inbox cache. buildGate
        // reads HEYS.MessengerAPI.getInboxCache() synchronously — без этого тика
        // badges не появятся пока что-то ещё не триггернёт rerender.
        const [, _setMessengerInboxTick] = React.useState(0);
        const [subscriptionState, setSubscriptionState] = React.useState(() => {
            const details = HEYS.Subscription?.getCachedDetails?.();
            return {
                status: details?.status || HEYS.Subscription?.getCachedStatus?.() || 'none',
                details: details || null,
                isLoading: !details,
            };
        });
        React.useEffect(() => {
            const onUpdate = () => _setMessengerInboxTick((t) => t + 1);
            window.addEventListener('heys:messenger-inbox-updated', onUpdate);
            return () => window.removeEventListener('heys:messenger-inbox-updated', onUpdate);
        }, []);

        // 📊 Сводка дня по всем клиентам — серверная, в отличие от getClientStats,
        // который видит только клиентов, открытых на этом устройстве.
        const [daySummary, setDaySummary] = React.useState(null);
        const clientsCount = clients?.length || 0;
        React.useEffect(() => {
            // Только кураторский контекст и только экран выбора клиента: внутри
            // клиента сводка не видна, а из PIN-сессии этот RPC вернёт 401.
            if (clientId || !cloudUser || !clientsCount || !HEYS.YandexAPI?.getClientsDaySummary) return undefined;
            let cancelled = false;
            const load = () => {
                HEYS.YandexAPI.getClientsDaySummary().then(({ data, error }) => {
                    if (cancelled || error || !data) return;
                    const byClient = {};
                    data.forEach((row) => { if (row?.client_id) byClient[row.client_id] = row; });
                    setDaySummary(byClient);
                }).catch(() => { /* сводка необязательна — карточка живёт и без неё */ });
            };
            load();
            // День меняется у клиентов в течение сессии куратора, поэтому обновляем.
            const timer = setInterval(load, 5 * 60 * 1000);
            return () => { cancelled = true; clearInterval(timer); };
        }, [clientId, clientsCount, cloudUser]);

        // 🎯 Цели клиента: по ним метка дня становится отклонением, а не просто
        // «запись есть». Отдельным запросом от сводки, потому что цели не
        // зависят от даты: возвращать их вместе с каждым днём значит слать одно
        // и то же при каждом обновлении сводки, а она обновляется раз в пять
        // минут. Тот же RPC читает панель — второго источника целей нет.
        const [normContext, setNormContext] = React.useState(null);
        React.useEffect(() => {
            if (clientId || !cloudUser || !clientsCount || !HEYS.YandexAPI?.getClientsNormContext) return undefined;
            let cancelled = false;
            HEYS.YandexAPI.getClientsNormContext().then(({ data, error }) => {
                if (cancelled || error || !data) return;
                const byClient = {};
                data.forEach((row) => { if (row?.client_id) byClient[row.client_id] = row; });
                setNormContext(byClient);
            }).catch(() => { /* цели необязательны — метка останется «есть запись» */ });
            return () => { cancelled = true; };
        }, [clientId, clientsCount, cloudUser]);

        React.useEffect(() => {
            let cancelled = false;
            const applyDetails = (value) => {
                if (cancelled) return;
                const details = HEYS.Subscription?.normalizeDetails?.(value) || value || { status: 'none' };
                setSubscriptionState({
                    status: details.status || 'none',
                    details,
                    isLoading: false,
                });
            };
            const onChanged = (event) => applyDetails(event?.detail);
            const onProfileConfirmed = () => setSubscriptionState((current) => ({ ...current }));
            window.addEventListener('heys:subscription-changed', onChanged);
            window.addEventListener('heys:profile-sync-confirmed', onProfileConfirmed);

            if (!clientId || !HEYS.Subscription?.getStatusDetails) {
                applyDetails({ status: HEYS.Subscription?.getLocalStatus?.() || 'none' });
            } else {
                setSubscriptionState((current) => ({ ...current, isLoading: true }));
                HEYS.Subscription.getStatusDetails(true).then(applyDetails).catch(() => {
                    applyDetails({ status: HEYS.Subscription?.getLocalStatus?.() || 'none' });
                });
            }

            return () => {
                cancelled = true;
                window.removeEventListener('heys:subscription-changed', onChanged);
                window.removeEventListener('heys:profile-sync-confirmed', onProfileConfirmed);
            };
        }, [clientId]);

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
            daySummary,
            normContext,
            formatLastActive,
            getAvatarColor,
            getClientInitials,
            renameClient,
            editClient,
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
        const profile = U?.lsGet ? U.lsGet('heys_profile', {}) : {};
        const desktopAllowed = profile?.desktopAllowed === true;

        // Desktop Gate: если клиент на десктопе и десктоп НЕ разрешён
        // tab передаётся для bypass: tasks таб работает на десктопе
        const desktopGate = AppGateFlow.buildDesktopGate ? AppGateFlow.buildDesktopGate({
            gate,
            isDesktop,
            isCurator,
            desktopAllowed,
            DesktopGateScreen,
            setClientId,
            tab: typeof tab !== 'undefined' ? tab : undefined,
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
            setCheckingConsent,
            setShowMorningCheckin,
            showMorningCheckin,
            // Compliance overhaul 2026-05-20 — re-consent + age gate state
            outdatedTypes: complianceState?.outdatedTypes,
            graceExpiresAt: complianceState?.graceExpiresAt,
            mustBlockReconsent: complianceState?.mustBlockReconsent,
            needsAgeGate: complianceState?.needsAgeGate,
            consentCheckError: complianceState?.consentCheckError,
            setOutdatedTypes: complianceState?.setOutdatedTypes,
            setMustBlockReconsent: complianceState?.setMustBlockReconsent,
            setNeedsAgeGate: complianceState?.setNeedsAgeGate,
            setConsentCheckError: complianceState?.setConsentCheckError,
            subscriptionState,
        }) : null;

        return {
            gate,
            desktopGate,
            consentGate,
            isDesktop,
            isCurator,
            desktopAllowed,
        };
    };
})();
