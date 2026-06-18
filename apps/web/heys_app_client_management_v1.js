// heys_app_client_management_v1.js — client list management
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

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
        React.useEffect(() => {
            const handleClientsUpdated = (e) => {
                if (e.detail && e.detail.clients) {
                    setClients(e.detail.clients);
                }
            };
            window.addEventListener('heys:clients-updated', handleClientsUpdated);
            return () => window.removeEventListener('heys:clients-updated', handleClientsUpdated);
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
        createTestClients,
    };
})();
