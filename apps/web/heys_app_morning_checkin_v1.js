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
        // Scoped → legacy fallback. Считаем валидным только профиль с хотя бы
        // одним полем. Пустой объект {} в scoped LS встречается у клиентов
        // унаследовавших stale state от прошлых багов; в этом случае legacy
        // heys_profile содержит реальные данные (cloud audit подтвердил).
        let parsed = tryDecompress(localStorage.getItem(`heys_${clientId}_profile`));
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            return parsed;
        }
        parsed = tryDecompress(localStorage.getItem('heys_profile'));
        return (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) ? parsed : null;
    }

    const useMorningCheckinSync = ({ React, isInitializing, clientId }) => {
        const [showMorningCheckin, setShowMorningCheckin] = React.useState(false);

        // Ref для актуального clientId (избегаем проблемы closure)
        const clientIdRef = React.useRef(clientId);
        React.useEffect(() => { clientIdRef.current = clientId; }, [clientId]);

        // Проверяем ТОЛЬКО после события heysSyncCompleted (когда данные точно загружены)
        React.useEffect(() => {
            // Слушаем событие завершения синхронизации
            const handleSyncCompleted = (e) => {
                const eventClientId = e?.detail?.clientId;

                // Пропускаем если нет clientId в событии
                if (!eventClientId) {
                    console.warn('[MorningCheckin] ⚠️ heysSyncCompleted без clientId — пропускаем');
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
                    if (eventClientId !== lsClientId) {
                        console.warn('[MorningCheckin] ⚠️ eventClientId !== lsClientId — пропускаем', {
                            event: eventClientId?.slice(0, 8),
                            ls: lsClientId?.slice(0, 8),
                        });
                        return;
                    }

                    if (HEYS.shouldShowMorningCheckin) {
                        const shouldShow = HEYS.shouldShowMorningCheckin();
                        console.info('[MorningCheckin] 🔍 shouldShow результат:', shouldShow, {
                            clientId: lsClientId?.slice(0, 8),
                            isInitializing,
                            suppressFlag: !!window.HEYS?.ui?.suppressMorningCheckin,
                        });

                        // 🛑 Если активен флаг подавления (Onboarding Tour), не показываем чек-ин
                        if (window.HEYS?.ui?.suppressMorningCheckin) {
                            console.warn('[MorningCheckin] 🛑 suppressMorningCheckin=true — подавляем');
                            return;
                        }

                        // 🔒 Не обновляем если значение то же (предотвращает ре-рендер)
                        setShowMorningCheckin((prev) => (prev === shouldShow ? prev : shouldShow));
                    } else {
                        // PERF v7.1: module deferred after boot chain — wait for ready event
                        console.info('[MorningCheckin] ℹ️ shouldShowMorningCheckin deferred — ожидаем загрузку модуля');
                        const onModuleReady = () => {
                            if (HEYS.shouldShowMorningCheckin) {
                                const shouldShow = HEYS.shouldShowMorningCheckin();
                                if (window.HEYS?.ui?.suppressMorningCheckin) return;
                                // shouldShowMorningCheckin уже использует readProfileForceRawScoped
                                // внутри, поэтому дополнительная проверка по firstName/birthDate/weight
                                // была не нужна и ломала ежедневный флоу для completed-профилей
                                // (например, когда профиль полный, но утренний вес не введён).
                                setShowMorningCheckin((prev) => (prev === shouldShow ? prev : shouldShow));
                            }
                        };
                        window.addEventListener('heys-morning-checkin-ready', onModuleReady, { once: true });
                    }
                }, 200);
            };

            window.addEventListener('heysSyncCompleted', handleSyncCompleted);
            return () => window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
        }, [isInitializing]); // clientId убран из зависимостей — используем ref

        return { showMorningCheckin, setShowMorningCheckin };
    };

    HEYS.AppMorningCheckin = {
        useMorningCheckinSync,
    };
})();
