// heys_app_runtime_state_v1.js — runtime widgets/consent/swipe/badge/calendar state

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppRuntimeState = HEYS.AppRuntimeState || {};

    HEYS.AppRuntimeState.useRuntimeState = function ({
        React,
        AppRuntimeEffects,
        AppSwipeNav,
        tab,
        setTab,
        clientId,
        cloudUser,
        setNeedsConsent,
        setCheckingConsent,
        setCalendarVer,
    }) {
        const useWidgetsEditMode = AppRuntimeEffects?.useWidgetsEditMode
            || (({ React: HookReact }) => ({
                widgetsEditMode: HookReact.useState(false)[0],
                setWidgetsEditMode: () => { },
            }));
        const widgetsEditState = useWidgetsEditMode({ React });

        // Compliance overhaul 2026-05-20 — локальное расширение state для re-consent grace,
        // outdated types, must-block, age-gate. Передаём setters в useConsentCheck и
        // возвращаем через complianceState — root_impl пробросит в buildConsentGate.
        const [outdatedTypes, setOutdatedTypes] = React.useState([]);
        const [graceExpiresAt, setGraceExpiresAt] = React.useState(null);
        const [mustBlockReconsent, setMustBlockReconsent] = React.useState(false);
        const [needsAgeGate, setNeedsAgeGate] = React.useState(false);
        const [consentCheckError, setConsentCheckError] = React.useState(null);

        const useConsentCheck = AppRuntimeEffects?.useConsentCheck
            || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
        useConsentCheck({
            React, clientId, cloudUser, setNeedsConsent, setCheckingConsent,
            setOutdatedTypes, setGraceExpiresAt, setMustBlockReconsent, setNeedsAgeGate,
            setConsentCheckError,
        });

        const swipeState = AppSwipeNav?.useSwipeNavigation
            ? AppSwipeNav.useSwipeNavigation({ React, tab, setTab })
            : {
                slideDirection: null,
                edgeBounce: null,
                onTouchStart: () => { },
                onTouchEnd: () => { },
            };

        const useBadgeSync = AppRuntimeEffects?.useBadgeSync
            || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
        useBadgeSync({ React });

        const useCalendarSync = AppRuntimeEffects?.useCalendarSync
            || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
        useCalendarSync({ React, setCalendarVer });

        return {
            ...widgetsEditState,
            swipeState,
            // 2026-05-20 compliance overhaul — extras для buildConsentGate
            complianceState: {
                outdatedTypes,
                graceExpiresAt,
                mustBlockReconsent,
                needsAgeGate,
                consentCheckError,
                setOutdatedTypes,
                setGraceExpiresAt,
                setMustBlockReconsent,
                setNeedsAgeGate,
                setConsentCheckError,
            },
        };
    };
})();
