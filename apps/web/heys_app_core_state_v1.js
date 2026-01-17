// heys_app_core_state_v1.js — core client/cloud state

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppCoreState = HEYS.AppCoreState || {};

    HEYS.AppCoreState.useAppCoreState = function ({ React, AppHooks, cloud, U }) {
        const { useClientState, useCloudClients } = AppHooks || {};
        const [loginError, setLoginError] = React.useState('');

        const clientState = useClientState
            ? useClientState(cloud, U)
            : {
                status: 'offline', setStatus: () => { },
                syncVer: 0, setSyncVer: () => { },
                calendarVer: 0, setCalendarVer: () => { },
                clients: [], setClients: () => { },
                clientsSource: 'local', setClientsSource: () => { },
                clientId: null, setClientId: () => { },
                newName: '', setNewName: () => { },
                cloudUser: null, setCloudUser: () => { },
                isInitializing: false, setIsInitializing: () => { },
                products: [], setProducts: () => { },
                backupMeta: null, setBackupMeta: () => { },
                backupBusy: false, setBackupBusy: () => { },
                needsConsent: false, setNeedsConsent: () => { },
                checkingConsent: false, setCheckingConsent: () => { },
                curatorTab: 'clients', setCuratorTab: () => { },
            };

        const {
            clients,
            setClients,
            clientsSource,
            setClientsSource,
            clientId,
            setClientId,
            cloudUser,
            setCloudUser,
            setProducts,
            setStatus,
            setSyncVer,
        } = clientState;

        const cloudClients = useCloudClients
            ? useCloudClients(cloud, U, {
                clients,
                setClients,
                clientsSource,
                setClientsSource,
                clientId,
                setClientId,
                cloudUser,
                setCloudUser,
                setProducts,
                setStatus,
                setSyncVer,
                setLoginError,
            })
            : {
                ONE_CURATOR_MODE: false,
                fetchClientsFromCloud: async () => [],
                addClientToCloud: async () => ({}),
                renameClient: async () => ({}),
                removeClient: async () => ({}),
                cloudSignIn: async () => ({}),
                cloudSignOut: async () => ({}),
            };

        return {
            clientState,
            cloudClients,
            loginError,
            setLoginError,
        };
    };
})();
