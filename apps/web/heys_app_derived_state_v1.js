// heys_app_derived_state_v1.js — derived UI state helpers

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppDerivedState = HEYS.AppDerivedState || {};

    HEYS.AppDerivedState.useAppDerivedState = function ({
        React,
        pendingDetails,
        clients,
        clientId,
        needsConsent,
        checkingConsent,
        showMorningCheckin,
        U,
        cloud,
    }) {
        const { useMemo } = React;

        const pendingText = useMemo(() => {
            if (!pendingDetails) return '';
            const parts = [];
            if (pendingDetails.days > 0) parts.push(`${pendingDetails.days} дн.`);
            if (pendingDetails.products > 0) parts.push(`${pendingDetails.products} прод.`);
            if (pendingDetails.profile > 0) parts.push('профиль');
            if (pendingDetails.other > 0) parts.push(`${pendingDetails.other} др.`);
            return parts.length > 0 ? parts.join(', ') : '';
        }, [pendingDetails]);

        const cachedProfile = useMemo(() => {
            const utils = U || window.HEYS?.utils;
            return utils && utils.lsGet ? utils.lsGet('heys_profile', {}) : {};
        }, [U]);

        const isRpcMode = cloud?.isPinAuthClient?.() || false;

        const currentClientName = useMemo(() => {
            if (isRpcMode) {
                // Поддерживаем оба формата: name (от куратора) и firstName+lastName (от регистрации)
                const fullName = cachedProfile.name
                    || [cachedProfile.firstName, cachedProfile.lastName].filter(Boolean).join(' ');
                if (fullName) return fullName;

                // 💡 Для новых клиентов до заполнения профиля — используем имя от куратора
                try {
                    const pendingRaw = localStorage.getItem('heys_pending_client_name');
                    if (pendingRaw) {
                        const pendingName = JSON.parse(pendingRaw);
                        if (pendingName) return pendingName;
                    }
                } catch (e) { }

                return 'Мой профиль';
            }
            return Array.isArray(clients)
                ? (clients.find((c) => c.id === clientId)?.name || 'Выберите клиента')
                : 'Выберите клиента';
        }, [isRpcMode, cachedProfile, clients, clientId]);

        // Morning Check-in блокирует основной контент (показывается ДО загрузки)
        const isMorningCheckinBlocking = showMorningCheckin === true && window.HEYS?.MorningCheckin;

        // Проверка согласий блокирует всё (показывается ДО morning checkin)
        const isConsentBlocking = needsConsent || checkingConsent;

        return {
            pendingText,
            cachedProfile,
            isRpcMode,
            currentClientName,
            isMorningCheckinBlocking,
            isConsentBlocking,
        };
    };
})();
