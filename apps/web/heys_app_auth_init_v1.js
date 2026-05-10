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

        const isPinRestoreAuthError = (error) => {
            const code = String(error?.code || error?.status || error?.statusCode || '').toLowerCase();
            const message = String(error?.message || error || '').toLowerCase();
            if (code === '401' || code === '403') return true;
            return (
                message.includes('unauthorized') ||
                message.includes('auth_required') ||
                message.includes('no session token') ||
                message.includes('no auth token') ||
                message.includes('invalid token') ||
                message.includes('token expired') ||
                message.includes('jwt') ||
                message.includes('forbidden')
            );
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
                // Sync heys_client_current so nsKey resolves correctly on next reload
                try { localStorage.setItem('heys_client_current', JSON.stringify(pinAuthClient)); } catch (_) { }
                console.warn('[AuthInit] restored PIN currentClientId', pinAuthClient?.slice(0, 8));

                // 🛠️ Миграция legacy ключей без clientId → scoped (PIN flow)
                try {
                    const clientId = pinAuthClient;
                    const keysToMigrate = ['heys_profile', 'heys_norms', 'heys_hr_zones', 'heys_game'];
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

        // v12: Helper для авто-закрытия гейта (returning user)
        function __heysDismissGate() {
            var gate = document.getElementById('heys-login-gate');
            if (!gate) return;
            // 🚀 PERF v7.1: Gate уже скрыт (skeleton mode) — просто удаляем из DOM
            if (gate.style.display === 'none') {
                console.info('[HEYS.entry] 🚪 Gate already hidden (skeleton mode) — removing');
                try { gate.remove(); } catch (_) { }
                return;
            }
            console.info('[HEYS.entry] 🚪 Auto-dismissing gate for returning user');
            gate.style.animation = 'hlg-fadeout 0.3s ease forwards';
            setTimeout(function () {
                gate.style.display = 'none';
                try { gate.remove(); } catch (_) { }
            }, 320);
        }

        // v12: Если __heysReturningUser но сессия невалидна — показываем форму логина
        function __heysShowGateLogin() {
            if (!window.__heysReturningUser) return;
            console.info('[HEYS.entry] ⚠️ Returning user session invalid — showing login form');
            // 🚀 PERF v7.1: Gate был скрыт для skeleton — восстанавливаем
            var gate = document.getElementById('heys-login-gate');
            if (gate && gate.style.display === 'none') {
                gate.style.display = 'flex';
            }
            var rl = document.getElementById('hlg-returning');
            if (rl) rl.remove();
            var cs = document.getElementById('hlg-screen-client');
            var cu = document.getElementById('hlg-screen-curator');
            if (cs) cs.style.display = '';
            if (cu) cu.style.display = '';
            window.__heysReturningUser = false;
        }

        // 🔐 FIX v52: PIN auth имеет ПРИОРИТЕТ над куратором!
        // Если есть PIN-сессия — НЕ восстанавливаем куратора (предотвращает ререндер)
        let pinAuthClient = readGlobalValue('heys_pin_auth_client', null);
        let pinRecoveredFromSession = false;

        // 🔄 Stage 1: recover PIN session from session_token + last_client_id
        // Если pin_auth_client потёрт но session_token жив — восстанавливаем clientId
        // из last_client_id (пишется при успешном логине). Это закрывает race
        // когда state-drift (logout/expiry/cleanup) убрал маркер pin_auth_client,
        // но активная сессия на сервере ещё валидна.
        if (!pinAuthClient && !storedUser) {
            const sessionTokenRaw = readGlobalValue('heys_session_token', null);
            const lastClientIdRaw = readGlobalValue('heys_last_client_id', null);
            const sessionTokenOk = sessionTokenRaw && (typeof sessionTokenRaw === 'string' ? sessionTokenRaw.trim().length > 0 : true);
            const lastClientId = typeof lastClientIdRaw === 'string' ? lastClientIdRaw : null;
            if (sessionTokenOk && lastClientId && lastClientId.length >= 8) {
                pinAuthClient = lastClientId;
                pinRecoveredFromSession = true;
                try { localStorage.setItem('heys_pin_auth_client', lastClientId); } catch (_) { }
                console.info('[HEYS.entry] 🔄 PIN session recovered from session_token + last_client_id:', lastClientId.substring(0, 8) + '...');
            }
        }

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
                        // Сессия невалидна — показываем форму логина
                        __heysShowGateLogin();
                    } else {
                        // v12: Сессия валидна — убираем гейт
                        __heysDismissGate();
                    }
                })
                .catch(() => {
                    // Сессия невалидна — показываем форму логина
                    __heysShowGateLogin();
                })
                .finally(() => {
                    setIsInitializing(false);
                });
        } else if (hasPinSession && cloudRef) {
            // 🔐 PIN auth — приоритет над куратором (клиент вошёл по телефону+PIN)
            devLog('[App] 🔐 Восстановление PIN-сессии:', pinAuthClient.substring(0, 8) + '...', pinRecoveredFromSession ? '(recovered from session_token)' : '');

            // Восстанавливаем RPC-режим
            if (cloudRef.setPinAuthClient) {
                cloudRef.setPinAuthClient(pinAuthClient);
            }

            // Загружаем локальные данные
            initLocalData();
            setStatus('online');

            // 🚀 Stage 2: dismiss gate as soon as Phase A finishes (5 critical keys, 1 RPC).
            // Под VPN полный пагинированный sync занимает 5–10с; ждать его перед показом
            // приложения — главная UX-боль. Phase A отдаёт всё нужное для рендера сегодня
            // и профиля за один запрос (~300-800мс), остальное догружается в фоне.
            // Если Phase A не сработает (delta fast-path при повторных заходах), fallback
            // в `.then()` дисмиссит гейт после полного sync.
            let gateDismissed = false;
            let initFinalized = false;
            const phaseAHandler = (e) => {
                if (gateDismissed) return;
                if (e && e.detail && e.detail.phaseA && e.detail.clientId === pinAuthClient) {
                    gateDismissed = true;
                    devLog('[App] ⚡ Gate dismiss on Phase A');
                    __heysDismissGate();
                    // Так же снимаем флаг инициализации — React начнёт рендерить
                    // приложение, имея 5 критичных ключей в LS. Полный sync продолжит
                    // обновлять данные в фоне.
                    if (!initFinalized) {
                        initFinalized = true;
                        setIsInitializing(false);
                    }
                }
            };
            window.addEventListener('heysSyncCompleted', phaseAHandler);

            // Синхронизируем с сервером
            // Событие heysSyncCompleted отправляется ВНУТРИ syncClientViaRPC после загрузки данных
            cloudRef.syncClient(pinAuthClient)
                .then(() => {
                    devLog('[App] ✅ PIN-сессия восстановлена');
                    if (!gateDismissed) {
                        // Phase A не запускалась (delta fast-path / sync skipped) —
                        // дисмиссим сейчас по результатам полного sync.
                        gateDismissed = true;
                        __heysDismissGate();
                    }
                })
                .catch((err) => {
                    devWarn('[App] ❌ Ошибка восстановления PIN-сессии:', err);
                    trackError(err, { scope: 'AppAuthInit', action: 'restore_pin_session' });
                    if (isPinRestoreAuthError(err)) {
                        // Реально невалидная auth/session — сбрасываем PIN-сессию
                        __heysShowGateLogin();
                        removeGlobalValue('heys_pin_auth_client');
                        // Stage 1: при auth-error чистим тоже session_token —
                        // он либо протух, либо отозван. Иначе следующий boot
                        // снова попробует recovery и снова упадёт.
                        if (pinRecoveredFromSession) {
                            removeGlobalValue('heys_session_token');
                        }
                        setClientId(null);
                        gateDismissed = true; // не дисмиссить гейт после reshow
                    } else {
                        // Временная сетевая/серверная ошибка — сохраняем локальную PIN-сессию
                        devWarn('[App] 🌩️ Temporary PIN restore failure — keeping local session cache');
                        initLocalData();
                        setStatus('offline');
                        if (!gateDismissed) {
                            gateDismissed = true;
                            __heysDismissGate();
                        }
                    }
                })
                .finally(() => {
                    window.removeEventListener('heysSyncCompleted', phaseAHandler);
                    if (!initFinalized) {
                        initFinalized = true;
                        setIsInitializing(false);
                    }
                });
        } else {
            console.info('[HEYS.entry] ➡️ Branch: no session (show login)');
            // Нет сохранённой сессии — показываем экран логина
            initLocalData();
            setStatus('offline');

            // v12: Если __heysReturningUser но сессия пропала — восстанавливаем форму
            __heysShowGateLogin();

            // v9.11: For users with no session, transition to React LoginScreen quickly.
            // Previous 2s safety timer caused AppLoader → LoginScreen flash that reset curator form.
            // Now: if no session detected at HTML level, skip the timer entirely.
            var _loginGate = document.getElementById('heys-login-gate');
            if (!_loginGate || _loginGate.style.display === 'none' || !window.__heysHasSession) {
                // No gate, gate hidden, or no session — mount React LoginScreen immediately
                setIsInitializing(false);
            } else {
                // Gate visible AND has session — auth completing or user logging in. Safety fallback after 2s.
                var _safetyTimer = setTimeout(function () { setIsInitializing(false); }, 2000);
                window.addEventListener('heys-auth-ready', function () { clearTimeout(_safetyTimer); }, { once: true });
            }
        }

        // ─── Static Login Handoff (v11: no-reload) ──────────────────────────────
        // Listens for 'heys-auth-ready' dispatched by hlgHideOverlay() in index.html
        // after successful static login. Handles the case where React is already
        // mounted (fast network) — re-evaluates auth state without page reload.
        // Slow network: React mounts AFTER login → runAuthInit already reads localStorage → no-op.
        var staticLoginHandler = function (e) {
            var detail = (e && e.detail) || {};
            var mode = detail.mode;
            devLog('[AuthInit] heys-auth-ready received, mode:', mode);

            if (mode === 'client') {
                // PIN auth: same logic as hasPinSession branch (lines 257-287)
                var cid = detail.clientId || readGlobalValue('heys_pin_auth_client', null);
                if (!cid || !cloudRef) return;
                if (cloudRef.setPinAuthClient) cloudRef.setPinAuthClient(cid);
                initLocalData();
                setStatus('online');
                setClientId(cid);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = cid;
                try { localStorage.setItem('heys_client_current', JSON.stringify(cid)); } catch (_) { }
                cloudRef.syncClient(cid)
                    .then(function () { devLog('[AuthInit] static client login synced'); })
                    .catch(function (err) {
                        devWarn('[AuthInit] static client login sync error:', err);
                        if (isPinRestoreAuthError(err)) {
                            removeGlobalValue('heys_pin_auth_client');
                            setClientId(null);
                            __heysShowGateLogin();
                        } else {
                            initLocalData();
                            setStatus('offline');
                            __heysDismissGate();
                        }
                    })
                    .finally(function () { setIsInitializing(false); });

            } else if (mode === 'curator') {
                // Curator auth: same logic as storedUser branch (lines 232-256)
                var user = detail.user || readStoredAuthUser();
                if (!user || !cloudRef) return;
                var email = user.email || readGlobalValue('heys_remember_email', null) || '';
                if (email) setEmail(email);
                setCloudUser(user);
                setStatus('online');
                initLocalData({ skipClientRestore: false, skipPinAuthRestore: true });
                setIsInitializing(false);
            }
        };
        window.addEventListener('heys-auth-ready', staticLoginHandler);

        return function () {
            window.removeEventListener('heys-auth-ready', staticLoginHandler);
        };
    };

    HEYS.AppAuthInit = {
        runAuthInit,
    };
})();
