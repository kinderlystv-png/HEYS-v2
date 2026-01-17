// heys_app_root_v1.js — App component extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppRoot = HEYS.AppRoot || {};

    HEYS.AppRoot.createApp = function createApp({ React }) {
        const AppRootComponent = HEYS.AppRootComponent || {};
        const createComponent = AppRootComponent.createApp
            || (({ React: HookReact }) => function AppFallback() {
                return HookReact.createElement('div', null);
            });
        return createComponent({ React });
    };
})();
