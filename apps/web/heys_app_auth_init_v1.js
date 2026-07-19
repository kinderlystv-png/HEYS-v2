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

        // Migrate only the non-secret session hint, then purge legacy curator
        // credentials before any online/offline branch can read them.
        const hadLegacyCuratorMarker = !!readGlobalValue('heys_curator_session', null)
            || !!readGlobalValue('heys_supabase_auth_token', null);
        removeGlobalValue('heys_curator_session');
        removeGlobalValue('heys_supabase_auth_token');
        if (hadLegacyCuratorMarker) {
            try { localStorage.setItem('heys_curator_cookie_session_hint', '1'); } catch (_) { }
        }

        const isPinRestoreAuthError = (error) => {
            const code = String(error?.code || error?.status || error?.statusCode || '').toLowerCase();
            const message = String(error?.message || error || '').toLowerCase();
            if (code === '401' || code === '403') return true;
            // 'no session token' / 'no auth token' НЕ считаем auth-error:
            // эти строки приходят ТОЛЬКО от client-side guard (когда LS
            // пустой). Сервер бы валидировал PIN-сессию через cookie
            // (heys-api-rpc/index.js:1129-1136), если бы запрос дошёл.
            // Если бутстрап здесь свалится с этой message — снос
            // heys_pin_auth_client + heys_session_token порождает цикл:
            // reload → cleanup → re-PIN → новая session → next reload снова падает.
            // Инцидент 2026-05-30: у двух активных PIN-юзеров накопилось
            // 179 и 194 client_sessions за 30 дней из-за этого цикла.
            // Legitimate server-side auth-errors остались: 401/403, invalid_session,
            // invalid token, token expired, jwt, forbidden, unauthorized, auth_required.
            return (
                message.includes('unauthorized') ||
                message.includes('auth_required') ||
                message.includes('invalid_session') ||
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
            // Загружаем продукты через canonical overlay (не legacy heys_products)
            const storedProducts = window.HEYS?.products?.getAll?.() || readStoredValue('heys_products', []);
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

            // 🔇 Dedup helper: useEffect в client_init может перезапустить runAuthInit
            // на каждом ре-рендере (нестабильные deps — setProducts/setClients/etc).
            // initLocalData идемпотентна, но лог "[AuthInit] restored ..." раньше шумел
            // 8+ раз за 90s (incident 2026-06-01). Логируем только когда меняется
            // (auth_kind:client_id) пара ИЛИ прошло >60s.
            const _logKey = (kind, cid) => `${kind}:${cid}`;
            const _shouldLogRestore = (kind, cid) => {
                try {
                    window.__heysAuthInitLastLog = window.__heysAuthInitLastLog || {};
                    const k = _logKey(kind, cid);
                    const now = Date.now();
                    const last = window.__heysAuthInitLastLog[k] || 0;
                    if (now - last < 60000) return false;
                    window.__heysAuthInitLastLog[k] = now;
                    return true;
                } catch (_) { return true; }
            };

            if (!skipClientRestore && currentClient && storedClientsArray.some((c) => c.id === currentClient)) {
                // Куратор выбрал клиента из списка
                setClientId(currentClient);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = currentClient;
                if (_shouldLogRestore('curator', currentClient)) {
                    console.info('[AuthInit] restored curator currentClientId', currentClient?.slice(0, 8));
                }
            } else if (!skipPinAuthRestore && pinAuthClient) {
                // 🔐 PIN auth: клиент вошёл по телефону+PIN — устанавливаем его clientId
                setClientId(pinAuthClient);
                window.HEYS = window.HEYS || {};
                window.HEYS.currentClientId = pinAuthClient;
                // Sync heys_client_current so nsKey resolves correctly on next reload
                try { localStorage.setItem('heys_client_current', JSON.stringify(pinAuthClient)); } catch (_) { }
                if (_shouldLogRestore('pin', pinAuthClient)) {
                    console.info('[AuthInit] restored PIN currentClientId', pinAuthClient?.slice(0, 8));
                }

                // Если у текущего PIN-клиента уже есть свой scoped профиль —
                // очищаем флаг регистрации. Нескопированные `heys_profile`/`heys_norms`/...
                // НЕ копируем в scope: они могут принадлежать куратору, который был
                // в этой же вкладке/инкогнито-сессии раньше (incident 2026-06-02:
                // имя куратора протекало в PIN-сессию клиента). Cloud sync поднимет
                // настоящий профиль клиента из облака.
                try {
                    const clientId = pinAuthClient;
                    const scopedProfileKey = `heys_${clientId}_profile`;
                    const rawProfile = localStorage.getItem(scopedProfileKey);
                    if (rawProfile) {
                        const prof = tryParseStoredValue(rawProfile, null);
                        if (prof?.profileCompleted || prof?.firstName || prof?.birthDate) {
                            localStorage.removeItem('heys_registration_in_progress');
                            console.info('[AuthInit] registrationInProgress cleared (scoped profile present)');
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

        const setRestoredCuratorUser = (restoredUser) => {
            setCloudUser(restoredUser);
            try { cloudRef?.setAuthUser?.(restoredUser); } catch (_) { }
        };

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
            if (gate) {
                gate.style.opacity = '1';
                gate.style.pointerEvents = 'auto';
                gate.setAttribute('data-visible', 'true');
            }
            var rl = document.getElementById('hlg-returning');
            if (rl) rl.remove();
            // Restore canonical single-screen state via gate's helper (handles
            // both display flags correctly). Fallback for the unlikely case
            // hlgShowScreen isn't defined yet (e.g., gate script hasn't parsed).
            if (typeof window.hlgShowScreen === 'function') {
                window.hlgShowScreen(window.__hlgCurrentScreen === 'curator' ? 'curator' : 'client');
            } else {
                var cs = document.getElementById('hlg-screen-client');
                var cu = document.getElementById('hlg-screen-curator');
                if (cs) cs.style.display = '';
                if (cu) cu.style.display = 'none';
            }
            // Сессия признана невалидной — снимаем флаг, чтобы no-session
            // fast-path в строках 438-441 сразу отдал управление React
            // LoginScreen без 2s safety-таймера и AppLoader-флэша.
            window.__heysHasSession = false;
            window.__heysReturningUser = false;
        }

        let pinAuthClient = readGlobalValue('heys_pin_auth_client', null);
        let pinRecoveredFromSession = false;

        // 🔄 Stage 1: recover PIN session from session_token + last_client_id
        // Если pin_auth_client потёрт но session_token жив — восстанавливаем clientId
        // из last_client_id (пишется при успешном логине). Это закрывает race
        // когда state-drift (logout/expiry/cleanup) убрал маркер pin_auth_client,
        // но активная сессия на сервере ещё валидна.
        if (!pinAuthClient) {
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

        const hasCookieSessionHint = (kind) => {
            try {
                if (typeof HEYS.YandexAPI?.hasCookieSessionHint === 'function') {
                    return HEYS.YandexAPI.hasCookieSessionHint(kind);
                }
                const key = kind === 'curator' ? 'heys_curator_cookie_session_hint' : 'heys_pin_cookie_session_hint';
                return !!localStorage.getItem(key);
            } catch (_) {
                return false;
            }
        };
        const setCookieSessionHint = (kind, active) => {
            try {
                if (typeof HEYS.YandexAPI?.setCookieSessionHint === 'function') {
                    HEYS.YandexAPI.setCookieSessionHint(kind, active);
                    return;
                }
                const key = kind === 'curator' ? 'heys_curator_cookie_session_hint' : 'heys_pin_cookie_session_hint';
                if (active) localStorage.setItem(key, '1');
                else localStorage.removeItem(key);
            } catch (_) { /* noop */ }
        };
        const hasReadablePinSessionToken = (() => {
            if (!pinAuthClient) return false;
            try {
                const sessionToken = readGlobalValue('heys_session_token', null);
                if (sessionToken && (typeof sessionToken !== 'string' || sessionToken.trim().length > 0)) return true;
                const namespacedRaw = localStorage.getItem(`heys_${pinAuthClient}_session_token`);
                return !!namespacedRaw;
            } catch (_) {
                return false;
            }
        })();
        const hasPinCookieSessionHint = hasCookieSessionHint('pin');
        const hasPinSession = !!pinAuthClient
            && (pinRecoveredFromSession || hasReadablePinSessionToken || hasPinCookieSessionHint);
        if (pinAuthClient && !hasPinSession) {
            removeGlobalValue('heys_pin_auth_client');
            removeGlobalValue('heys_client_current');
            pinAuthClient = null;
        }
        const finishNoSession = () => {
            console.info('[HEYS.entry] ➡️ Branch: no session (show login)');
            initLocalData();
            setStatus('offline');
            setIsInitializing(false);
        };
        const shouldProbeCookiePinSession = !hasPinSession
            && hasPinCookieSessionHint
            && !!cloudRef
            && typeof HEYS.YandexAPI?.getCurrentClientBySession === 'function';
        const shouldProbeCookieCuratorSession = !hasPinSession
            && hasCookieSessionHint('curator')
            && !!cloudRef
            && typeof HEYS.YandexAPI?.verifyCuratorToken === 'function';

        if (hasPinSession && cloudRef) {
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

            // RootWithKey intentionally remounts the app after client activation.
            // Phase A can already be applied before the new tree subscribes to its event,
            // so read the client-scoped runtime readiness marker synchronously. A persisted
            // last_sync_ts is not sufficient: it only proves an older sync happened and
            // would expose stale questions/header state before the fresh critical pull.
            const hasRuntimeCriticalData = !!cloudRef.isCriticalSyncReady?.(pinAuthClient);
            if (hasRuntimeCriticalData) {
                devLog('[App] ⚡ Stable mount (critical data already ready for client)');
                gateDismissed = true;
                initFinalized = true;
                __heysDismissGate();
                setIsInitializing(false);
            }

            // 🛡️ SOFT TIMEOUT backstop (8s):
            // Phase A normally arrives in under a second. Give the critical pull enough time
            // to produce one stable first frame; only then fall back to the local cache for a
            // degraded network instead of exposing stale data after 2.5s.
            const softTimeoutHandle = setTimeout(() => {
                if (initFinalized) return;
                initFinalized = true;
                devWarn('[App] ⏰ Critical sync timeout (8s) — using local cache, sync continues in background');
                if (!gateDismissed) {
                    gateDismissed = true;
                    __heysDismissGate();
                }
                setIsInitializing(false);
            }, 8000);

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
                        // PIN-путь не ставит cloudUser, так что после setIsInitializing(false)
                        // в .finally() React сам смонтирует LoginScreen и удалит HTML-гейт через
                        // buildGate. Восстанавливать HTML-гейт здесь не нужно — это давало лишний
                        // флэш кадра перед заменой на React-форму.
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
                    clearTimeout(softTimeoutHandle);
                    if (!initFinalized) {
                        initFinalized = true;
                        setIsInitializing(false);
                    }
                });
        } else if (shouldProbeCookiePinSession || shouldProbeCookieCuratorSession) {
            console.info('[HEYS.entry] 🔄 Branch: probing HttpOnly auth cookies');
            let initFinalized = false;
            const finishCookieProbe = () => {
                if (!initFinalized) {
                    initFinalized = true;
                    setIsInitializing(false);
                }
            };
            const clearInvalidCookiePinSession = () => {
                removeGlobalValue('heys_pin_auth_client');
                removeGlobalValue('heys_client_current');
                removeGlobalValue('heys_session_token');
                setCookieSessionHint('pin', false);
                setClientId(null);
                setStatus('offline');

                const yandexApi = window.HEYS?.YandexAPI || HEYS.YandexAPI;
                const clearCookieSession = yandexApi?.clientLogout;
                if (typeof clearCookieSession !== 'function') {
                    return Promise.resolve();
                }
                return clearCookieSession.call(yandexApi).catch((logoutErr) => {
                    devWarn('[App] Failed to clear invalid HttpOnly PIN session:', logoutErr);
                });
            };

            const restoreCookieCuratorSession = () => {
                if (!shouldProbeCookieCuratorSession) {
                    const e = new Error('cookie_curator_probe_unavailable');
                    e.code = 'NO_COOKIE_CURATOR_PROBE';
                    return Promise.reject(e);
                }
                console.info('[HEYS.entry] 🔄 Probing HttpOnly curator session cookie');
                return HEYS.YandexAPI.verifyCuratorToken()
                    .then(({ data, error }) => {
                        if (!data?.valid || !data?.user) {
                            const e = new Error(error?.message || 'cookie_curator_session_missing');
                            e.code = error?.code || error?.status || '';
                            throw e;
                        }

                        const user = data.user;
                        const email = user.email || readGlobalValue('heys_remember_email', null) || readGlobalValue('heys_saved_email', null) || '';
                        if (email) setEmail(email);
                        setCookieSessionHint('curator', true);
                        setRestoredCuratorUser(user);
                        setStatus('online');
                        initLocalData({ skipClientRestore: false, skipPinAuthRestore: true });
                        __heysDismissGate();
                    });
            };

            const restoreCookiePinSession = () => {
                if (!shouldProbeCookiePinSession) {
                    const e = new Error('cookie_pin_probe_unavailable');
                    e.code = 'NO_COOKIE_PIN_PROBE';
                    return Promise.reject(e);
                }
                console.info('[HEYS.entry] 🔄 Probing HttpOnly PIN session cookie');
                return HEYS.YandexAPI.getCurrentClientBySession()
                .then((res) => {
                    const cid = res?.data?.id;
                    if (!cid || typeof cid !== 'string') {
                        const e = new Error(res?.error?.message || 'cookie_session_missing');
                        e.code = res?.error?.code || res?.error?.status || '';
                        throw e;
                    }

                    try { localStorage.setItem('heys_pin_auth_client', cid); } catch (_) { }
                    try { localStorage.setItem('heys_client_current', JSON.stringify(cid)); } catch (_) { }
                    if (res?.data?.name) {
                        try { localStorage.setItem('heys_client_name', res.data.name); } catch (_) { }
                    }
                    setCookieSessionHint('pin', true);
                    if (cloudRef.setPinAuthClient) cloudRef.setPinAuthClient(cid);
                    initLocalData();
                    setStatus('online');
                    setClientId(cid);
                    window.HEYS = window.HEYS || {};
                    window.HEYS.currentClientId = cid;

                    return cloudRef.syncClient(cid)
                        .then(() => {
                            devLog('[App] ✅ PIN-сессия восстановлена из HttpOnly cookie');
                            __heysDismissGate();
                        })
                        .catch((err) => {
                            devWarn('[App] ❌ Ошибка восстановления cookie PIN-сессии:', err);
                            trackError(err, { scope: 'AppAuthInit', action: 'restore_cookie_pin_session' });
                            if (isPinRestoreAuthError(err)) {
                                return clearInvalidCookiePinSession().then(() => { throw err; });
                            } else {
                                initLocalData();
                                setStatus('offline');
                                __heysDismissGate();
                            }
                        });
                });
            };

            restoreCookiePinSession()
                .catch((err) => {
                    devLog('[App] HttpOnly PIN session probe did not restore:', err?.message || err);
                    const cleanup = isPinRestoreAuthError(err)
                        ? clearInvalidCookiePinSession()
                        : Promise.resolve();
                    return cleanup.then(() => restoreCookieCuratorSession())
                        .catch((curatorErr) => {
                            devLog('[App] HttpOnly curator session probe did not restore:', curatorErr?.message || curatorErr);
                            finishNoSession();
                            initFinalized = true;
                        });
                })
                .finally(finishCookieProbe);
        } else {
            // Нет сохранённой сессии — показываем экран логина. cloudUser в этой ветке не
            // ставится (нет storedUser), так что buildGate уйдёт в `!cloudUser` ветку, удалит
            // скрытый HTML-гейт и смoнтирует React LoginScreen сразу после setIsInitializing(false).
            finishNoSession();
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
                removeGlobalValue('heys_supabase_auth_token');
                removeGlobalValue('heys_curator_session');
                setCookieSessionHint('pin', true);
                setCookieSessionHint('curator', false);
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
                            // PIN-логин не ставит cloudUser; setIsInitializing(false)
                            // в .finally() приведёт к монтированию React LoginScreen, и
                            // buildGate удалит HTML-гейт. Восстановление гейта здесь
                            // создавало одноразовый флэш кадра.
                            removeGlobalValue('heys_pin_auth_client');
                            setClientId(null);
                        } else {
                            initLocalData();
                            setStatus('offline');
                            __heysDismissGate();
                        }
                    })
                    .finally(function () { setIsInitializing(false); });

            } else if (mode === 'curator') {
                // Curator auth: same logic as storedUser branch (lines 232-256)
                var user = detail.user;
                if (!user || !cloudRef) return;
                var email = user.email || readGlobalValue('heys_remember_email', null) || '';
                setCookieSessionHint('curator', true);
                setCookieSessionHint('pin', false);
                if (email) setEmail(email);
                setRestoredCuratorUser(user);
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
