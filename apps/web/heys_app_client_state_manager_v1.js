// heys_app_client_state_manager_v1.js — client state manager extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppClientStateManager = HEYS.AppClientStateManager || {};

    HEYS.AppClientStateManager.useClientStateManager = function ({
        React,
        clientId,
        setTab,
        setTabImmediate,
        defaultTab,
        setProducts,
        setSyncVer,
    }) {
        const { useEffect, useRef } = React;
        const skipTabSwitchRef = useRef(false);
        const prevClientIdRef = useRef(clientId || null);

        // Автопереключение на домашнюю вкладку при выборе клиента
        // (пропускаем если это PWA shortcut action)
        // ⚡ FIX: используем setTabImmediate (rawSetTab) вместо setTab (startTransition).
        // setTab оборачивает rawSetTab в React.startTransition, что делает обновление
        // низкоприоритетным. При client switch десятки urgent обновлений (setProducts,
        // setSyncVer, sync events) прерывают transition, откладывая переключение
        // вкладки на секунды. setTabImmediate обходит startTransition → мгновенный switch.
        const immediateSetTab = setTabImmediate || setTab;
        useEffect(() => {
            const previousClientId = prevClientIdRef.current;
            const didClientChange = clientId && clientId !== previousClientId;
            prevClientIdRef.current = clientId || null;

            if (didClientChange && !skipTabSwitchRef.current) {
                immediateSetTab(defaultTab);
            }
        }, [clientId, defaultTab, immediateSetTab]);

        // Обновление products при смене clientId (без bootstrap — его делают wrapper'ы)
        useEffect(() => {
            if (clientId) {
                const loadedProducts = window.HEYS?.products?.getAll?.() || [];
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
            }
        }, [clientId, setProducts, setSyncVer]);

        return { skipTabSwitchRef };
    };
})();
