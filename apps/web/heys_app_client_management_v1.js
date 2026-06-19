// heys_app_client_management_v1.js — client list management
(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const CLIENTS_UPDATED_EVENT = 'heys:clients-updated';
    const CLIENTS_UPDATED_CHANNEL = 'heys_clients_updated';

    const readClientsFromStorage = () => {
        try {
            const raw = localStorage.getItem('heys_clients');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    };

    const notifyClientsUpdated = (clients, source = 'unknown') => {
        const safeClients = Array.isArray(clients) ? clients : readClientsFromStorage();
        if (safeClients) {
            try {
                window.dispatchEvent(new CustomEvent(CLIENTS_UPDATED_EVENT, {
                    detail: { clients: safeClients, source }
                }));
            } catch (_) { /* noop */ }
        }

        const payload = { type: 'clients-updated', source, at: Date.now() };
        try {
            const bc = new BroadcastChannel(CLIENTS_UPDATED_CHANNEL);
            bc.postMessage(payload);
            setTimeout(() => { try { bc.close(); } catch (_) { /* noop */ } }, 200);
        } catch (_) { /* BroadcastChannel может отсутствовать */ }

    };

    const useClientListSync = ({
        React,
        cloudUser,
        clientsSource,
        fetchClientsFromCloud,
        setClients,
        setClientId,
        clientId,
    }) => {
        const readSavedClientId = () => {
            try {
                const raw = localStorage.getItem('heys_client_current');
                if (!raw) return '';
                try {
                    const parsed = JSON.parse(raw);
                    return typeof parsed === 'string' ? parsed : '';
                } catch (_) {
                    return raw;
                }
            } catch (_) {
                return '';
            }
        };

        React.useEffect(() => {
            if (cloudUser && cloudUser.id && (clientsSource === 'cache' || clientsSource === '')) {
                fetchClientsFromCloud(cloudUser.id).then((result) => {
                    if (result.data && result.data.length > 0) {
                        setClients(result.data);

                        const savedClientId = readSavedClientId();
                        if (savedClientId && result.data.some(c => c.id === savedClientId)) {
                            // 🔇 v4.7.1: Лог отключён
                            setClientId(savedClientId);
                            window.HEYS = window.HEYS || {};
                            window.HEYS.currentClientId = savedClientId;
                        } else if (!clientId && result.data.length === 1) {
                            // 🔇 v4.7.1: Лог отключён
                            setClientId(result.data[0].id);
                            window.HEYS = window.HEYS || {};
                            window.HEYS.currentClientId = result.data[0].id;
                        }
                    }
                }).catch((e) => {
                    console.error('[HEYS] Ошибка загрузки клиентов из облака:', e);
                });
            }
        }, [cloudUser, clientsSource, fetchClientsFromCloud, setClients, setClientId, clientId]);
    };

    const useClientsUpdatedListener = ({ React, setClients }) => {
        return React.useEffect(() => {
            const handleClientsUpdated = (e) => {
                if (e.detail && e.detail.clients) {
                    setClients(e.detail.clients);
                }
            };
            const refreshFromStorage = () => {
                const clients = readClientsFromStorage();
                if (clients) setClients(clients);
            };
            const handleStorage = (e) => {
                if (e && e.key === 'heys_clients') {
                    refreshFromStorage();
                }
            };
            let bc = null;
            try {
                bc = new BroadcastChannel(CLIENTS_UPDATED_CHANNEL);
                bc.onmessage = refreshFromStorage;
            } catch (_) { /* BroadcastChannel может отсутствовать */ }
            window.addEventListener(CLIENTS_UPDATED_EVENT, handleClientsUpdated);
            window.addEventListener('storage', handleStorage);
            return () => {
                window.removeEventListener(CLIENTS_UPDATED_EVENT, handleClientsUpdated);
                window.removeEventListener('storage', handleStorage);
                if (bc) {
                    try { bc.close(); } catch (_) { /* noop */ }
                }
            };
        }, [setClients]);
    };

    const createTestClients = async ({ cloudUser, fetchClientsFromCloud, setClients }) => {
        if (!cloudUser || !cloudUser.id) return;
        const userId = cloudUser.id;
        const testClients = [{ name: 'Иван Петров' }, { name: 'Анна Сидорова' }];

        for (const testClient of testClients) {
            try {
                await HEYS.YandexAPI.createClient(testClient.name, userId);
            } catch (error) {
                console.error('Ошибка создания тестового клиента:', error);
            }
        }

        const result = await fetchClientsFromCloud(userId);
        setClients(result.data);
    };

    HEYS.AppClientManagement = {
        useClientListSync,
        useClientsUpdatedListener,
        notifyClientsUpdated,
        readClientsFromStorage,
        createTestClients,
    };
})();
