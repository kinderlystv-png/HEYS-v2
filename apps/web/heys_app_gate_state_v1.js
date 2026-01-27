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
    }) {
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
        const profile = U?.lsGet ? U.lsGet('heys_profile', {}) : {};
        const desktopAllowed = profile?.desktopAllowed === true;

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
