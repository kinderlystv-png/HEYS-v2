// heys_app_client_init_v1.js — auth init + client sync effects

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppClientInit = HEYS.AppClientInit || {};

    HEYS.AppClientInit.useClientInitState = function ({
        React,
        AppAuthInit,
        AppClientManagement,
        U,
        cloud,
        setProducts,
        setClients,
        setClientsSource,
        setClientId,
        setSyncVer,
        setEmail,
        setCloudUser,
        setStatus,
        setIsInitializing,
        cloudUser,
        clientsSource,
        fetchClientsFromCloud,
        clientId,
    }) {
        const { useEffect } = React;

        useEffect(() => {
            if (!AppAuthInit?.runAuthInit) return;
            return AppAuthInit.runAuthInit({
                U,
                cloud,
                setProducts,
                setClients,
                setClientsSource,
                setClientId,
                setSyncVer,
                setEmail,
                setCloudUser,
                setStatus,
                setIsInitializing,
            });
        }, [
            AppAuthInit,
            U,
            cloud,
            setProducts,
            setClients,
            setClientsSource,
            setClientId,
            setSyncVer,
            setEmail,
            setCloudUser,
            setStatus,
            setIsInitializing,
        ]);

        const useClientListSync = AppClientManagement?.useClientListSync
            || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
        useClientListSync({
            React,
            cloudUser,
            clientsSource,
            fetchClientsFromCloud,
            setClients,
            setClientId,
            clientId,
        });

        const useClientsUpdatedListener = AppClientManagement?.useClientsUpdatedListener
            || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
        useClientsUpdatedListener({ React, setClients });
    };
})();
