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

    const useConsentCheck = ({ React, clientId, cloudUser, setNeedsConsent, setCheckingConsent }) => {
        React.useEffect(() => {
            if (!clientId) {
                setNeedsConsent(false);
                setCheckingConsent(false);
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
            if (HEYS.Consents?.api?.checkRequired) {
                setCheckingConsent(true);
                HEYS.Consents.api.checkRequired(clientId).then((result) => {
                    setNeedsConsent(!result.valid);
                    setCheckingConsent(false);
                    HEYS._consentsChecked = true;
                    HEYS._consentsValid = result.valid;
                    if (!result.valid) {
                        console.log('[CONSENTS] Client needs to accept consents:', result.missing);
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
            }
        }, [clientId, cloudUser, setNeedsConsent, setCheckingConsent]);
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
            const handleCycleUpdate = (e) => {
                const source = e.detail?.source;
                const field = e.detail?.field;

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

            window.addEventListener('heys:day-updated', handleCycleUpdate);
            window.addEventListener('heysSyncCompleted', handleSyncComplete);
            return () => {
                window.removeEventListener('heys:day-updated', handleCycleUpdate);
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
