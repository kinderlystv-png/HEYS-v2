// heys_app_runtime_effects_v1.js — runtime UI effects
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useWidgetsEditMode = ({ React }) => {
        const [widgetsEditMode, setWidgetsEditMode] = React.useState(false);

        React.useEffect(() => {
            const handleEditEnter = () => setWidgetsEditMode(true);
            const handleEditExit = () => setWidgetsEditMode(false);

            const unsubEnter = window.HEYS?.Widgets?.on?.('editmode:enter', handleEditEnter);
            const unsubExit = window.HEYS?.Widgets?.on?.('editmode:exit', handleEditExit);

            setWidgetsEditMode(window.HEYS?.Widgets?.state?.isEditMode?.() || false);

            return () => {
                unsubEnter?.();
                unsubExit?.();
            };
        }, []);

        return { widgetsEditMode, setWidgetsEditMode };
    };

    const useConsentCheck = ({
        React, clientId, cloudUser,
        setNeedsConsent, setCheckingConsent,
        // Compliance overhaul 2026-05-20 — optional setters. Если родитель их не
        // передал — расширенная логика skip'ается, legacy flow остаётся.
        setOutdatedTypes,
        setGraceExpiresAt,
        setMustBlockReconsent,
        setNeedsAgeGate,
    }) => {
        React.useEffect(() => {
            if (!clientId) {
                setNeedsConsent(false);
                setCheckingConsent(false);
                setOutdatedTypes && setOutdatedTypes([]);
                setMustBlockReconsent && setMustBlockReconsent(false);
                setNeedsAgeGate && setNeedsAgeGate(false);
                HEYS._consentsChecked = false;
                HEYS._consentsValid = false;
                return;
            }
            if (cloudUser) {
                setNeedsConsent(false);
                setCheckingConsent(false);
                HEYS._consentsChecked = true;
                HEYS._consentsValid = true;
                return;
            }

            const versioned = HEYS.Consents?.api?.checkRequiredVersioned;
            const legacy = HEYS.Consents?.api?.checkRequired;

            setCheckingConsent(true);

            // Утилита: нормализовать legacy-ответ в shape v2.
            const legacyAsV2 = (clientIdArg) => legacy(clientIdArg).then(r => ({
                valid: r.valid, missing: r.missing || [],
                outdated: [], graceExpiresAt: null, graceStatus: 'none',
                mustBlock: false, ageConfirmed: true,
            }));

            // versioned() требует session-токен; при login токен появляется ПОЗЖЕ
            // чем clientId. Поэтому если versioned вернул error (No session token /
            // network) — fallback на legacy (clientId-based, без токена).
            const promise = versioned
                ? versioned().then(r => {
                    if (r?.error && legacy) {
                        console.log('[CONSENTS] versioned failed (' + r.error + ') — fallback to legacy');
                        return legacyAsV2(clientId);
                    }
                    return r;
                  })
                : legacy
                    ? legacyAsV2(clientId)
                    : Promise.resolve({ valid: true, missing: [], outdated: [], mustBlock: false, ageConfirmed: true });

            promise.then((r) => {
                const needs = !r.valid;
                setNeedsConsent(needs);
                setCheckingConsent(false);
                setOutdatedTypes && setOutdatedTypes(r.outdated || []);
                setGraceExpiresAt && setGraceExpiresAt(r.graceExpiresAt || null);
                setMustBlockReconsent && setMustBlockReconsent(!!r.mustBlock);
                // Age-gate показываем только когда основные согласия в порядке —
                // иначе сначала ConsentScreen, потом age.
                setNeedsAgeGate && setNeedsAgeGate(!r.ageConfirmed && !needs);
                HEYS._consentsChecked = true;
                HEYS._consentsValid = r.valid;
                if (needs) {
                    console.log('[CONSENTS] Client needs to accept consents:', r.missing, 'outdated:', r.outdated);
                } else if ((r.outdated || []).length) {
                    console.log('[CONSENTS] ⚠ Outdated docs, grace until:', r.graceExpiresAt);
                } else {
                    console.log('[CONSENTS] ✅ All consents are valid');
                }
            }).catch((err) => {
                console.error('[CONSENTS] Error checking consents:', err);
                setCheckingConsent(false);
                setNeedsConsent(false);
                HEYS._consentsChecked = true;
                HEYS._consentsValid = true;
            });
        }, [clientId, cloudUser, setNeedsConsent, setCheckingConsent,
            setOutdatedTypes, setGraceExpiresAt, setMustBlockReconsent, setNeedsAgeGate]);
    };

    const useBadgeSync = ({ React }) => {
        React.useEffect(() => {
            const initialUpdate = setTimeout(() => {
                window.HEYS?.badge?.updateFromStreak();
            }, 2000);

            const handleDataChange = () => {
                setTimeout(() => {
                    window.HEYS?.badge?.updateFromStreak();
                }, 500);
            };

            window.addEventListener('heysSyncCompleted', handleDataChange);
            window.addEventListener('heys:data-saved', handleDataChange);

            return () => {
                clearTimeout(initialUpdate);
                window.removeEventListener('heysSyncCompleted', handleDataChange);
                window.removeEventListener('heys:data-saved', handleDataChange);
            };
        }, []);
    };

    const useCalendarSync = ({ React, setCalendarVer }) => {
        const calendarDebounceRef = React.useRef(null);
        // 🛡️ v64 FIX: Трекинг последнего calendarVer increment timestamp
        // Предотвращает двойной increment от двух heysSyncCompleted событий
        const lastIncrementRef = React.useRef(0);

        React.useEffect(() => {
            const handleCycleUpdate = (detail) => {
                const source = detail?.source;
                const field = detail?.field;

                // Обновляем календарь при: cycleDay changes ИЛИ cloud-sync/force-sync/merge
                const isCycleUpdate = field === 'cycleDay' || (source && source.startsWith('cycle'));
                const isSyncUpdate = source === 'cloud-sync' || source === 'force-sync' || source === 'merge';
                if (!isCycleUpdate && !isSyncUpdate) return;

                if (calendarDebounceRef.current) {
                    clearTimeout(calendarDebounceRef.current);
                }
                calendarDebounceRef.current = setTimeout(() => {
                    setCalendarVer((v) => v + 1);
                    calendarDebounceRef.current = null;
                }, isSyncUpdate ? 800 : 500); // Sync — дольше ждём (много событий подряд)
            };

            // Также слушаем heysSyncCompleted для гарантированного обновления после sync
            const handleSyncComplete = (e) => {
                const now = Date.now();
                const sinceLastIncrement = now - lastIncrementRef.current;
                window.console.info('[HEYS.calendar] 🔔 heysSyncCompleted получен, clientId=', e?.detail?.clientId?.slice(0, 8), 'sinceLastIncrement=' + sinceLastIncrement + 'ms');

                // 🛡️ v64 FIX: Игнорируем дублирующееся событие (< 2 сек после предыдущего increment)
                // Два sync path (syncClientViaRPC + bootstrapClientSync) могут оба стрелять heysSyncCompleted
                if (sinceLastIncrement < 2000) {
                    window.console.info('[HEYS.calendar] ⏭️ SKIP duplicate heysSyncCompleted (debounce=' + sinceLastIncrement + 'ms < 2000ms)');
                    return;
                }

                if (calendarDebounceRef.current) {
                    clearTimeout(calendarDebounceRef.current);
                }
                calendarDebounceRef.current = setTimeout(() => {
                    lastIncrementRef.current = Date.now();
                    setCalendarVer((v) => {
                        window.console.info('[HEYS.calendar] 📈 calendarVer', v, '→', v + 1);
                        return v + 1;
                    });
                    calendarDebounceRef.current = null;
                }, 500); // 🛡️ v64: Увеличен с 300 до 500ms для лучшего debounce
            };

            // PERF NEW-1: миграция handleCycleUpdate на dispatcher next-frame lane.
            // Calendar update уже debounced 500-800мс внутри — defer на frame дешёво.
            // heysSyncCompleted остаётся на window (отдельный event, не часть dispatcher).
            const dispatcher = window.HEYS?.events?.dayUpdated;
            let unsubDayUpdated;
            if (dispatcher && typeof dispatcher.subscribe === 'function') {
                unsubDayUpdated = dispatcher.subscribe(handleCycleUpdate, { priority: 'next-frame' });
            } else {
                const wrap = (e) => handleCycleUpdate(e?.detail || {});
                window.addEventListener('heys:day-updated', wrap);
                unsubDayUpdated = () => window.removeEventListener('heys:day-updated', wrap);
            }
            window.addEventListener('heysSyncCompleted', handleSyncComplete);
            return () => {
                if (unsubDayUpdated) unsubDayUpdated();
                window.removeEventListener('heysSyncCompleted', handleSyncComplete);
                if (calendarDebounceRef.current) {
                    clearTimeout(calendarDebounceRef.current);
                }
            };
        }, [setCalendarVer]);

        return { calendarDebounceRef };
    };

    HEYS.AppRuntimeEffects = {
        useWidgetsEditMode,
        useConsentCheck,
        useBadgeSync,
        useCalendarSync,
    };
})();
