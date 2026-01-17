// heys_app_auth_init_v1.js — App auth/session initialization
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const runAuthInit = ({
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
    }) => {
        // 🔧 cloud reference for initialization
        const cloudRef = cloud || (window.HEYS && window.HEYS.cloud);

        const utils = U || { lsGet: () => null };

        // Минимальная инициализация — только загрузка из localStorage
        // opts.skipClientRestore: не восстанавливать выбранного клиента из heys_client_current
        // opts.skipPinAuthRestore: не восстанавливать PIN-auth клиента
        const initLocalData = (opts = {}) => {
            const skipClientRestore = opts.skipClientRestore === true;
            const skipPinAuthRestore = opts.skipPinAuthRestore === true;
            // Загружаем продукты из localStorage
            const storedProducts = utils.lsGet('heys_products', []);
            if (Array.isArray(storedProducts)) {
                setProducts(storedProducts);
            }

            // Загружаем клиентов из localStorage (без создания тестовых!)
            const storedClients = utils.lsGet('heys_clients', []);
            if (Array.isArray(storedClients) && storedClients.length > 0) {
                // Фильтруем тестовых клиентов
                const realClients = storedClients.filter(c => !c.id?.startsWith('local-user'));
                if (realClients.length > 0) {
                    setClients(realClients);
                    setClientsSource('cache'); // Помечаем что это из кэша
                }
            }

            // Проверяем есть ли сохраненный клиент
            const currentClient = utils.lsGet('heys_client_current');
            const storedClientsArray = utils.lsGet('heys_clients', []);

            // 🔐 PIN auth: проверяем также heys_pin_auth_client (клиент вошедший по PIN)
            const pinAuthClient = localStorage.getItem('heys_pin_auth_client');

            if (!skipClientRestore && currentClient && storedClientsArray.some((c) => c.id === currentClient)) {
                // Куратор выбрал клиента из списка
                setClientId(currentClient);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = currentClient;
            } else if (!skipPinAuthRestore && pinAuthClient) {
                // 🔐 PIN auth: клиент вошёл по телефону+PIN — устанавливаем его clientId
                setClientId(pinAuthClient);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = pinAuthClient;
            }

            setSyncVer((v) => v + 1);
        };

        // Проверка сети
        if (!navigator.onLine) {
            // Нет сети — загружаем локальные данные и показываем предупреждение
            initLocalData();
            setIsInitializing(false);
            setStatus('offline');
            // Показываем предупреждение только если нет сохранённых данных
            if (!utils.lsGet('heys_client_current')) {
                setTimeout(() => {
                    HEYS.Toast?.warning('Нет подключения к интернету. Для первого входа нужна сеть.') || alert('Нет подключения к интернету. Для первого входа нужна сеть.');
                }, 100);
            }
            return undefined;
        }

        // 🔐 Проверяем expires_at — если токен РЕАЛЬНО истёк, не восстанавливаем сессию
        // ✅ FIX 2025-12-25: НЕ удаляем токен если он ещё не истёк!
        // ensureValidToken() может продлить его через серверную проверку
        const readStoredAuthUser = () => {
            try {
                const stored = localStorage.getItem('heys_supabase_auth_token');
                if (!stored) return null;
                const parsed = JSON.parse(stored);

                // 🚨 Проверяем expires_at — но НЕ удаляем токен преждевременно!
                const expiresAt = parsed?.expires_at;
                if (expiresAt) {
                    const now = Date.now();
                    const expiresAtMs = expiresAt * 1000;
                    // ✅ FIX: Только если токен РЕАЛЬНО истёк (не "скоро истечёт")
                    // Раньше здесь был буфер 5 минут который вызывал ложные логауты
                    if (expiresAtMs < now) {
                        console.log('[AUTH] Token expired at', new Date(expiresAtMs).toISOString());
                        // Очищаем только РЕАЛЬНО истёкший Supabase токен
                        try { localStorage.removeItem('heys_supabase_auth_token'); } catch (_) { }
                        // 🔧 v58 FIX: НЕ удаляем session_token если есть PIN auth сессия!
                        // session_token нужен для PIN auth клиентов (не используют Supabase)
                        // Удалять только если НЕТ PIN-сессии (куратор)
                        const hasPinAuth = localStorage.getItem('heys_pin_auth_client');
                        if (!hasPinAuth) {
                            console.log('[AUTH] No PIN auth, clearing session_token');
                            try { localStorage.removeItem('heys_session_token'); } catch (_) { }
                        } else {
                            console.log('[AUTH] PIN auth present, keeping session_token');
                        }
                        return null;
                    }
                    // Если токен скоро истекает — это ОК, ensureValidToken() обновит его
                    const minutesLeft = Math.round((expiresAtMs - now) / 60000);
                    console.log('[AUTH] Token valid, expires in', minutesLeft, 'min');
                }

                return parsed?.user || null;
            } catch (e) {
                return null;
            }
        };

        const storedUser = readStoredAuthUser();
        const savedEmail = storedUser?.email || localStorage.getItem('heys_remember_email') || localStorage.getItem('heys_saved_email');

        // 🔐 FIX v52: PIN auth имеет ПРИОРИТЕТ над куратором!
        // Если есть PIN-сессия — НЕ восстанавливаем куратора (предотвращает ререндер)
        const pinAuthClient = localStorage.getItem('heys_pin_auth_client');
        const hasPinSession = !!pinAuthClient;

        if (storedUser && cloudRef && !hasPinSession) {
            // Есть сохранённая сессия куратора (и нет PIN-сессии) — восстанавливаем.
            // Важно: ставим cloudUser ДО любых восстановлений clientId, чтобы не запускался consent-flow как для клиента.
            if (savedEmail) setEmail(savedEmail);
            setCloudUser(storedUser);
            setStatus('online');

            // ✅ FIX 2025-12-25: Восстанавливаем выбранного клиента из localStorage!
            // Ранее skipClientRestore: true мешало куратору видеть данные после рефреша
            // Теперь восстанавливаем clientId, но не PIN auth (куратор не использует PIN)
            initLocalData({ skipClientRestore: false, skipPinAuthRestore: true });

            // 🔄 Тестируем доступ через YandexAPI вместо Supabase
            HEYS.YandexAPI.getClients(storedUser.id)
                .then((clients) => {
                    if (!clients || clients.error) {
                        // Сессия невалидна — требуется вход
                    }
                })
                .catch(() => {
                    // Сессия невалидна — требуется вход
                })
                .finally(() => {
                    setIsInitializing(false);
                });
        } else if (hasPinSession && cloudRef) {
            // 🔐 PIN auth — приоритет над куратором (клиент вошёл по телефону+PIN)
            console.log('[App] 🔐 Восстановление PIN-сессии:', pinAuthClient.substring(0, 8) + '...');

            // Восстанавливаем RPC-режим
            if (cloudRef.setPinAuthClient) {
                cloudRef.setPinAuthClient(pinAuthClient);
            }

            // Загружаем локальные данные
            initLocalData();
            setStatus('online');

            // Синхронизируем с сервером
            // Событие heysSyncCompleted отправляется ВНУТРИ syncClientViaRPC после загрузки данных
            cloudRef.syncClient(pinAuthClient)
                .then(() => {
                    console.log('[App] ✅ PIN-сессия восстановлена');
                    // НЕ отправляем heysSyncCompleted здесь — оно уже отправлено внутри syncClient
                    // после фактической записи данных в localStorage
                })
                .catch((err) => {
                    console.error('[App] ❌ Ошибка восстановления PIN-сессии:', err);
                    // При ошибке показываем экран логина
                    localStorage.removeItem('heys_pin_auth_client');
                    setClientId(null);
                })
                .finally(() => {
                    setIsInitializing(false);
                });
        } else {
            // Нет сохранённой сессии — показываем экран логина
            initLocalData();
            setStatus('offline');
            setIsInitializing(false);
        }

        return undefined;
    };

    HEYS.AppAuthInit = {
        runAuthInit,
    };
})();
