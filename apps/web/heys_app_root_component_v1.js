// heys_app_root_component_v1.js — App component proxy (delegates to AppRootImpl)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppRootComponent = HEYS.AppRootComponent || {};

    HEYS.AppRootComponent.createApp = function createApp({ React }) {
        const AppRootImpl = HEYS.AppRootImpl;
        if (!AppRootImpl || typeof AppRootImpl.createApp !== 'function') {
            return function MissingAppRootImpl() {
                return React.createElement('div', null, '');
            };
        }
        return AppRootImpl.createApp({ React });
    };
})();
