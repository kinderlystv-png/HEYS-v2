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
        isInitializing,
        tab,
        // 2026-05-20 compliance overhaul — optional state из useRuntimeState
        complianceState,
    }) {
        // 💬 Force re-render when MessengerAPI updates inbox cache. buildGate
        // reads HEYS.MessengerAPI.getInboxCache() synchronously — без этого тика
        // badges не появятся пока что-то ещё не триггернёт rerender.
        const [, _setMessengerInboxTick] = React.useState(0);
        React.useEffect(() => {
            const onUpdate = () => _setMessengerInboxTick((t) => t + 1);
            window.addEventListener('heys:messenger-inbox-updated', onUpdate);
            return () => window.removeEventListener('heys:messenger-inbox-updated', onUpdate);
        }, []);

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
