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

        React.useEffect(() => {
            const handleCycleUpdate = (e) => {
                const source = e.detail?.source;
                const field = e.detail?.field;

                if (field !== 'cycleDay' && !source?.startsWith('cycle')) return;

                if (calendarDebounceRef.current) {
                    clearTimeout(calendarDebounceRef.current);
                }
                calendarDebounceRef.current = setTimeout(() => {
                    setCalendarVer((v) => v + 1);
                    calendarDebounceRef.current = null;
                }, 500);
            };

            window.addEventListener('heys:day-updated', handleCycleUpdate);
            return () => {
                window.removeEventListener('heys:day-updated', handleCycleUpdate);
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
