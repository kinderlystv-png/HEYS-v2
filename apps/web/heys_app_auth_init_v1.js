// heys_app_auth_init_v1.js — App auth/session initialization
(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const DEV = window.DEV || {};
    const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
    const devWarn = typeof DEV.warn === 'function' ? DEV.warn.bind(DEV) : function () { };
    const U = HEYS.utils || {};
    const trackError = (error, context) => {
        if (!HEYS?.analytics?.trackError) return;
        try {
            const err = error instanceof Error ? error : new Error(String(error || 'Auth init error'));
            HEYS.analytics.trackError(err, context);
        } catch (_) { }
    };

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

        const tryParseStoredValue = (raw, fallback) => {
            if (raw === null || raw === undefined) return fallback;
            if (typeof raw === 'string') {
                let str = raw;
                if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
                    try { str = HEYS.store.decompress(str); } catch (_) { }
                }
                try { return JSON.parse(str); } catch (_) { return str; }
            }
            return raw;
        };

        const readStoredValue = (key, fallback) => {
            try {
                if (HEYS.store?.get) {
                    const stored = HEYS.store.get(key, null);
                    if (stored !== null && stored !== undefined) {
                        return tryParseStoredValue(stored, fallback);
                    }
                }
                if (utils.lsGet) {
                    const legacy = utils.lsGet(key, fallback);
                    if (legacy !== null && legacy !== undefined) return legacy;
                }
                const raw = localStorage.getItem(key);
                return tryParseStoredValue(raw, fallback);
            } catch {
                return fallback;
            }
        };

        const readGlobalValue = (key, fallback) => {
            try {
                if (HEYS.store?.get) {
                    const stored = HEYS.store.get(key, null);
                    if (stored !== null && stored !== undefined) {
                        return tryParseStoredValue(stored, fallback);
                    }
                }
                const raw = localStorage.getItem(key);
                if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
                if (utils.lsGet) return utils.lsGet(key, fallback);
                return fallback;
            } catch {
                return fallback;
            }
        };

        const removeGlobalValue = (key) => {
            try {
                if (HEYS.store?.set) HEYS.store.set(key, null);
            } catch (_) { }
            try { localStorage.removeItem(key); } catch (_) { }
        };

        // Минимальная инициализация — только загрузка из localStorage
        // opts.skipClientRestore: не восстанавливать выбранного клиента из heys_client_current
        // opts.skipPinAuthRestore: не восстанавливать PIN-auth клиента
        const initLocalData = (opts = {}) => {
            const skipClientRestore = opts.skipClientRestore === true;
            const skipPinAuthRestore = opts.skipPinAuthRestore === true;
            // Загружаем продукты из localStorage
            const storedProducts = readStoredValue('heys_products', []);
            if (Array.isArray(storedProducts)) {
                setProducts(storedProducts);
            }

            // Загружаем клиентов из localStorage (без создания тестовых!)
            const storedClients = readStoredValue('heys_clients', []);
            if (Array.isArray(storedClients) && storedClients.length > 0) {
                // Фильтруем тестовых клиентов
                const realClients = storedClients.filter(c => !c.id?.startsWith('local-user'));
                if (realClients.length > 0) {
                    setClients(realClients);
                    setClientsSource('cache'); // Помечаем что это из кэша
                }
            }

            // Проверяем есть ли сохраненный клиент
            const currentClient = readStoredValue('heys_client_current');
            const storedClientsArray = readStoredValue('heys_clients', []);

            // 🔐 PIN auth: проверяем также heys_pin_auth_client (клиент вошедший по PIN)
            const pinAuthClient = readGlobalValue('heys_pin_auth_client', null);

            if (!skipClientRestore && currentClient && storedClientsArray.some((c) => c.id === currentClient)) {
                // Куратор выбрал клиента из списка
                setClientId(currentClient);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = currentClient;
                console.warn('[AuthInit] restored curator currentClientId', currentClient?.slice(0, 8));
            } else if (!skipPinAuthRestore && pinAuthClient) {
                // 🔐 PIN auth: клиент вошёл по телефону+PIN — устанавливаем его clientId
                setClientId(pinAuthClient);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = pinAuthClient;
                console.warn('[AuthInit] restored PIN currentClientId', pinAuthClient?.slice(0, 8));

                // 🛠️ Миграция legacy ключей без clientId → scoped (PIN flow)
                try {
                    const clientId = pinAuthClient;
                    const keysToMigrate = ['heys_profile', 'heys_products', 'heys_norms', 'heys_hr_zones', 'heys_game'];
                    keysToMigrate.forEach((baseKey) => {
                        const scopedKey = `heys_${clientId}_${baseKey.replace(/^heys_/, '')}`;
                        const hasScoped = !!localStorage.getItem(scopedKey);
                        if (hasScoped) return;
                        const rawLegacy = localStorage.getItem(baseKey);
                        if (!rawLegacy) return;
                        localStorage.setItem(scopedKey, rawLegacy);
                        if (window.HEYS?.store?.invalidate) {
                            window.HEYS.store.invalidate(baseKey);
                            window.HEYS.store.invalidate(scopedKey);
                        }
                        console.warn('[AuthInit] migrated legacy key to scoped', { baseKey, scopedKey });
                    });

                    // Если профиль мигрирован — очищаем флаг регистрации
                    const scopedProfileKey = `heys_${clientId}_profile`;
                    const rawProfile = localStorage.getItem(scopedProfileKey);
                    if (rawProfile) {
                        const prof = tryParseStoredValue(rawProfile, null);
                        if (prof?.profileCompleted || prof?.firstName || prof?.birthDate) {
                            localStorage.removeItem('heys_registration_in_progress');
                            console.warn('[AuthInit] registrationInProgress cleared (migrated profile)');
                        }
                    }
                } catch (_) { }
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
            if (!readStoredValue('heys_client_current')) {
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
                const stored = readGlobalValue('heys_supabase_auth_token', null);
                if (!stored) return null;
                const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;

                // 🚨 Проверяем expires_at — но НЕ удаляем токен преждевременно!
                const expiresAt = parsed?.expires_at;
                if (expiresAt) {
                    const now = Date.now();
                    const expiresAtMs = expiresAt * 1000;
                    // ✅ FIX: Только если токен РЕАЛЬНО истёк (не "скоро истечёт")
                    // Раньше здесь был буфер 5 минут который вызывал ложные логауты
                    if (expiresAtMs < now) {
                        devLog('[AUTH] Token expired at', new Date(expiresAtMs).toISOString());
                        // Очищаем только РЕАЛЬНО истёкший Supabase токен
                        removeGlobalValue('heys_supabase_auth_token');
                        // 🔧 v58 FIX: НЕ удаляем session_token если есть PIN auth сессия!
                        // session_token нужен для PIN auth клиентов (не используют Supabase)
                        // Удалять только если НЕТ PIN-сессии (куратор)
                        const hasPinAuth = readGlobalValue('heys_pin_auth_client', null);
                        if (!hasPinAuth) {
                            devLog('[AUTH] No PIN auth, clearing session_token');
                            removeGlobalValue('heys_session_token');
                        } else {
                            devLog('[AUTH] PIN auth present, keeping session_token');
                        }
                        return null;
                    }
                    // Если токен скоро истекает — это ОК, ensureValidToken() обновит его
                    const minutesLeft = Math.round((expiresAtMs - now) / 60000);
                    devLog('[AUTH] Token valid, expires in', minutesLeft, 'min');
                }

                return parsed?.user || null;
            } catch (e) {
                return null;
            }
        };

        const storedUser = readStoredAuthUser();
        const savedEmail = storedUser?.email || readGlobalValue('heys_remember_email', null) || readGlobalValue('heys_saved_email', null);

        // 🔐 FIX v52: PIN auth имеет ПРИОРИТЕТ над куратором!
        // Если есть PIN-сессия — НЕ восстанавливаем куратора (предотвращает ререндер)
        const pinAuthClient = readGlobalValue('heys_pin_auth_client', null);
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
            devLog('[App] 🔐 Восстановление PIN-сессии:', pinAuthClient.substring(0, 8) + '...');

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
                    devLog('[App] ✅ PIN-сессия восстановлена');
                    // НЕ отправляем heysSyncCompleted здесь — оно уже отправлено внутри syncClient
                    // после фактической записи данных в localStorage
                })
                .catch((err) => {
                    devWarn('[App] ❌ Ошибка восстановления PIN-сессии:', err);
                    trackError(err, { scope: 'AppAuthInit', action: 'restore_pin_session' });
                    // При ошибке показываем экран логина
                    removeGlobalValue('heys_pin_auth_client');
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
