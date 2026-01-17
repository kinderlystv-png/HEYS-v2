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

        const useConsentCheck = AppRuntimeEffects?.useConsentCheck
            || (({ React: HookReact }) => HookReact.useEffect(() => { }, []));
        useConsentCheck({ React, clientId, cloudUser, setNeedsConsent, setCheckingConsent });

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
        };
    };
})();
