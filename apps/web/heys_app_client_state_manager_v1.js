// heys_app_client_state_manager_v1.js — client state manager extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppClientStateManager = HEYS.AppClientStateManager || {};

    HEYS.AppClientStateManager.useClientStateManager = function ({
        React,
        clientId,
        setTab,
        defaultTab,
        setProducts,
        setSyncVer,
    }) {
        const { useEffect, useRef } = React;
        const skipTabSwitchRef = useRef(false);

        // Автопереключение на домашнюю вкладку при выборе клиента
        // (пропускаем если это PWA shortcut action)
        useEffect(() => {
            if (clientId && !skipTabSwitchRef.current) {
                // Используем сохранённую домашнюю вкладку вместо захардкоженной 'stats'
                setTab(defaultTab);
            }
        }, [clientId, defaultTab, setTab]);

        // Обновление products при смене clientId (без bootstrap — его делают wrapper'ы)
        useEffect(() => {
            if (clientId) {
                const loadedProducts = Array.isArray(window.HEYS?.utils?.lsGet?.('heys_products', []))
                    ? window.HEYS.utils.lsGet('heys_products', [])
                    : [];
                setProducts(loadedProducts);
                setSyncVer((v) => v + 1);
            }
        }, [clientId, setProducts, setSyncVer]);

        return { skipTabSwitchRef };
    };
})();
