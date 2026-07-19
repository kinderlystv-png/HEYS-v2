// heys_app_morning_checkin_v1.js — Morning check-in gate logic
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    // Inline дубликат readProfileForceRawScoped из heys_morning_checkin_v1.js.
    // Тот файл загружается лениво (postboot-3-ui-lazy), а handler ниже фаирится
    // с раннего boot-event'а. Когда handler срабатывает, lazy-helper может ещё
    // не существовать → handler упадёт на stale cache. Эта inline-копия гарантирует
    // что helper всегда доступен в boot-app фазе.
    function readProfileForceRawScopedInline(clientId) {
        if (!clientId) return null;
        const tryDecompress = (raw) => {
            if (!raw) return null;
            const fn = window.HEYS?.store?.decompress;
            try { return fn ? fn(raw) : JSON.parse(raw); } catch (_) { return null; }
        };
        // Subscription-only профиль (4 поля без personal) — это в процессе sync.
        // Ждём полного профиля: считаем валидным только при наличии personal полей.
        const isProfileShape = (p) => p && typeof p === 'object' &&
            (p.age || p.weight || p.height || p.firstName || p.profileCompleted === true);
        const scopedParsed = tryDecompress(localStorage.getItem(`heys_${clientId}_profile`));
        if (isProfileShape(scopedParsed)) return scopedParsed;
        // Strict ownership (2026-06-01, tightened): legacy heys_profile принимаем
        // только при явном _sourceClientId === clientId. Без маркера → null
        // (cloud re-fetch подтянет правильный профиль). Mirror lazy-helper в
        // heys_morning_checkin_v1.js:60-70.
        const legacyParsed = tryDecompress(localStorage.getItem('heys_profile'));
        if (!isProfileShape(legacyParsed)) return null;
        return legacyParsed._sourceClientId === clientId ? legacyParsed : null;
    }

    function isYesterdayVerifyReady() {
        return HEYS.YesterdayVerifyReady === true
            && HEYS.YesterdayVerify
            && HEYS.YesterdayVerify.stepRegistered === true
            && typeof HEYS.YesterdayVerify.shouldShow === 'function';
    }

    function evaluateMorningCheckinWhenReady(setShowMorningCheckin, meta) {
        const missing = [];
        if (typeof HEYS.shouldShowMorningCheckin !== 'function') missing.push('morning-checkin');
        if (!isYesterdayVerifyReady()) missing.push('yesterday-verify');
        if (missing.length > 0) {
            // A required check-in is no longer an idle-only feature: on a busy
            // device requestIdleCallback may not run before the shell is hidden.
            // Force the exact chunks whose readiness events we await below.
            if (missing.includes('morning-checkin')) {
                Promise.resolve(HEYS.__loadPostboot3Ui?.()).catch(() => null);
            }
            if (missing.includes('yesterday-verify')) {
                Promise.resolve(HEYS.__loadPostboot1Game?.()).catch(() => null);
            }
            console.info('[MorningCheckin] ℹ️ required modules deferred — ожидаем загрузку', {
                missing,
                source: meta?.source || 'unknown',
            });
            const retry = () => evaluateMorningCheckinWhenReady(setShowMorningCheckin, {
                ...(meta || {}),
                source: 'module-ready-retry',
            });
            if (missing.includes('morning-checkin')) {
                window.addEventListener('heys-morning-checkin-ready', retry, { once: true });
            }
            if (missing.includes('yesterday-verify')) {
                window.addEventListener('heys-yesterday-verify-ready', retry, { once: true });
            }
            return false;
        }

        if (meta?.resumeExistingOnly) {
            const localStatus = HEYS.MorningCheckinUtils?.getMorningCheckinStatus?.(undefined, meta.clientId);
            const resumableStates = ['open', 'in_progress', 'failed', 'closed'];
            if (!localStatus?.flowId || !resumableStates.includes(localStatus.state)) {
                console.info('[MorningCheckin] ℹ️ offline resume skipped — no unfinished local flow');
                return false;
            }
        }

        const shouldShow = HEYS.shouldShowMorningCheckin();
        console.info('[MorningCheckin] 🔍 shouldShow результат:', shouldShow, {
            clientId: meta?.clientId ? String(meta.clientId).slice(0, 8) : undefined,
            isInitializing: meta?.isInitializing,
            suppressFlag: !!window.HEYS?.ui?.suppressMorningCheckin,
        });

        if (window.HEYS?.ui?.suppressMorningCheckin) {
            console.warn('[MorningCheckin] 🛑 suppressMorningCheckin=true — подавляем');
            return true;
        }

        setShowMorningCheckin((prev) => (prev === shouldShow ? prev : shouldShow));
        return true;
    }

    const useMorningCheckinSync = ({ React, isInitializing, clientId }) => {
        const [showMorningCheckin, setShowMorningCheckin] = React.useState(false);

        // Ref для актуального clientId (избегаем проблемы closure)
        const clientIdRef = React.useRef(clientId);
        // Consent state может стать valid уже на Phase A. Исторические дни в этот
        // момент ещё не загружены, поэтому YesterdayVerify даст ложное `false` и
        // обязательный шаг появится только после преждевременного flow_complete.
        // Запоминаем именно полный download активного клиента.
        const fullSyncReadyClientRef = React.useRef(null);
        React.useEffect(() => {
            clientIdRef.current = clientId;
            if (fullSyncReadyClientRef.current && fullSyncReadyClientRef.current !== clientId) {
                fullSyncReadyClientRef.current = null;
            }
        }, [clientId]);

        // Проверяем ТОЛЬКО после события heysSyncCompleted (когда данные точно загружены)
        React.useEffect(() => {
            // Слушаем событие завершения синхронизации
            const handleSyncCompleted = (e) => {
                const eventClientId = e?.detail?.clientId;

                // Пропускаем если нет clientId в событии
                if (!eventClientId) {
                    // Defensive skip — race-window между sync-completed event'ом и
                    // установкой clientId. Норма, не warning.
                    console.debug('[MorningCheckin] heysSyncCompleted без clientId — пропускаем');
                    return;
                }

                // 🛡️ FIX v1.9.4: Пропускаем Phase A (неполная загрузка 5 критичных ключей).
                // В фазе A профиль клиента может быть ещё не записан в localStorage —
                // isProfileIncomplete вернёт true и модалка мелькнёт на долю секунды.
                // Ждём полного sync (без флага phaseA).
                if (e?.detail?.phaseA) {
                    console.info('[MorningCheckin] ℹ️ Phase A sync — ждём полного sync для чек-ина');
                    return;
                }
                fullSyncReadyClientRef.current = eventClientId;

                // Задержка чтобы React state (setClientId) успел обновиться
                // и localStorage точно содержал данные нового клиента
                setTimeout(() => {
                    // 🛡️ FIX v1.9.3: clientIdRef может быть пустым при первом switchClient —
                    // heysSyncCompleted стреляет ДО того как React state обновит clientId.
                    // Если ref пустой — принимаем eventClientId (первичный выбор клиента).
                    // Если ref заполнен и отличается — это событие от другого клиента, пропускаем.
                    if (clientIdRef.current && clientIdRef.current !== eventClientId) {
                        console.warn('[MorningCheckin] ⚠️ clientIdRef.current !== eventClientId — пропускаем (другой клиент)', {
                            ref: clientIdRef.current?.slice(0, 8),
                            event: eventClientId?.slice(0, 8),
                        });
                        return;
                    }
                    if (!clientIdRef.current) {
                        console.info('[MorningCheckin] ℹ️ clientIdRef пустой (первый switchClient), используем eventClientId:', eventClientId?.slice(0, 8));
                    }

                    // 🔄 ВАЖНО: Для новых пользователей с незаполненным профилем
                    // показываем чек-ин ДАЖЕ во время инициализации!
                    // Force-raw read минуя Store.get memory cache — закрывает race
                    // под VPN когда «третий» heysSyncCompleted срабатывает с устаревшим cache.
                    // Используем inline-копию (lazy postboot ещё может быть не загружен).
                    const U = HEYS.utils || {};
                    const cidForRead = clientIdRef.current || eventClientId || (window.HEYS && window.HEYS.currentClientId) || '';
                    const profile = readProfileForceRawScopedInline(cidForRead)
                        || (HEYS.MorningCheckinUtils?.readProfileForceRawScoped?.(cidForRead))
                        || (U.lsGet ? U.lsGet('heys_profile', {}) : {})
                        || {};
                    const isProfileIncomplete = HEYS.ProfileSteps?.isProfileIncomplete?.(profile);

                    // 🆕 v1.9.2 FIX: isInitializing=true у куратора означает ожидание getClients() —
                    // сетевой запрос завершается ПОСЛЕ heysSyncCompleted и НЕ должен блокировать чекин.
                    // Блокируем только если: isInitializing И профиль не заполнен (новый пользователь,
                    // у которого данные ещё не загружены).
                    // Если профиль ЗАПОЛНЕН — пользователь давно активен, isInitializing здесь не критичен.
                    if (isInitializing && isProfileIncomplete) {
                        // Новый пользователь, ещё загружается — ждём следующего события
                        console.warn('[MorningCheckin] ⚠️ isInitializing=true & new user (no profile) — ждём следующего события');
                        return;
                    }
                    if (isInitializing && !isProfileIncomplete) {
                        // Уже знакомый пользователь — isInitializing = просто ожидание getClients()
                        // Продолжаем показывать чекин как обычно
                        console.info('[MorningCheckin] ℹ️ isInitializing=true но профиль заполнен — продолжаем');
                    }

                    // Проверяем что clientId из события совпадает с текущим в localStorage
                    const lsClientId = HEYS.utils?.getCurrentClientId?.() || '';
                    if (lsClientId && eventClientId !== lsClientId) {
                        // Реальное расхождение: ls указывает на другого клиента (cross-session leak risk).
                        console.warn('[MorningCheckin] ⚠️ eventClientId !== lsClientId — пропускаем (другой клиент в LS)', {
                            event: eventClientId?.slice(0, 8),
                            ls: lsClientId?.slice(0, 8),
                        });
                        return;
                    }
                    if (!lsClientId) {
                        // PIN-сессия: heysSyncCompleted приходит ДО записи heys_client_current в LS
                        // (race ~200-400ms на медленных устройствах). Принимаем eventClientId — он
                        // авторитетный источник для свежепереключённого клиента, как и в clientIdRef
                        // fallback выше. Backward compat: то же поведение что для clientIdRef пустого.
                        console.info('[MorningCheckin] ℹ️ lsClientId пуст (PIN race) — принимаем eventClientId:', eventClientId?.slice(0, 8));
                    }

                    evaluateMorningCheckinWhenReady(setShowMorningCheckin, {
                        source: 'sync-completed',
                        clientId: lsClientId || eventClientId,
                        isInitializing,
                    });
                }, 200);
            };

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);
            return () => window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
        }, [isInitializing]); // clientId убран из зависимостей — используем ref

        React.useEffect(() => {
            const handleConsentsStateChanged = (event) => {
                if (HEYS._consentsValid !== true) {
                    // Consent gate owns legal blocking. A background re-check
                    // may temporarily unset this flag; closing an already open
                    // flow here leaves both shell and overlay hidden.
                    console.info('[MorningCheckin] ℹ️ consents re-check in progress — preserve current check-in state');
                    return;
                }
                const activeClientId = clientIdRef.current || clientId || HEYS.utils?.getCurrentClientId?.() || '';
                if (event?.detail?.source === 'offline-consent-cache' && activeClientId) {
                    setTimeout(() => {
                        evaluateMorningCheckinWhenReady(setShowMorningCheckin, {
                            source: 'offline-consent-cache',
                            clientId: activeClientId,
                            isInitializing,
                            resumeExistingOnly: true,
                        });
                    }, 0);
                    return;
                }
                if (!activeClientId || fullSyncReadyClientRef.current !== activeClientId) {
                    console.info('[MorningCheckin] ℹ️ consents готовы — ждём полный sync перед планом', {
                        clientId: activeClientId ? String(activeClientId).slice(0, 8) : null,
                    });
                    return;
                }
                setTimeout(() => {
                    evaluateMorningCheckinWhenReady(setShowMorningCheckin, {
                        source: 'consents-state-changed',
                        clientId: activeClientId,
                        isInitializing,
                    });
                }, 0);
            };

            window.addEventListener('heys:consents-state-changed', handleConsentsStateChanged);
            return () => window.removeEventListener('heys:consents-state-changed', handleConsentsStateChanged);
        }, []);

        return { showMorningCheckin, setShowMorningCheckin };
    };

    HEYS.AppMorningCheckin = {
        useMorningCheckinSync,
    };
})();
