// heys_app_tab_state_v1.js — tab state helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};

    const useTabState = ({ React }) => {
        const getDefaultTabFromProfile = () => {
            const U = window.HEYS?.utils;
            const profile = U?.lsGet?.('heys_profile', {}) || {};
            const validTabs = ['widgets', 'stats', 'diary', 'insights', 'month'];
            const savedTab = validTabs.includes(profile.defaultTab) ? profile.defaultTab : 'stats';
            return savedTab;
        };

        const [defaultTab, setDefaultTabState] = React.useState('stats');
        const [tab, setTab] = React.useState('stats');
        const [initialTabLoaded, setInitialTabLoaded] = React.useState(false);

        React.useEffect(() => {
            if (!window.HEYS) window.HEYS = {};
            if (!window.HEYS.ui) window.HEYS.ui = {};
            window.HEYS.ui.switchTab = (newTab) => {
                console.log(`[App] 🔄 Switching tab to: ${newTab}`);
                setTab(newTab);
            };
        }, [setTab]);

        React.useEffect(() => {
            if (initialTabLoaded) return;

            const tryLoadDefaultTab = () => {
                const U = window.HEYS?.utils;
                if (!U?.lsGet) return false;

                const savedTab = getDefaultTabFromProfile();
                console.log(`[App] 🏠 Loading default tab from profile: ${savedTab}`);
                setDefaultTabState(savedTab);
                setTab(savedTab);
                setInitialTabLoaded(true);
                return true;
            };

            if (tryLoadDefaultTab()) return;

            const handleReady = () => tryLoadDefaultTab();
            window.addEventListener('heysReady', handleReady);

            const interval = setInterval(() => {
                if (tryLoadDefaultTab()) clearInterval(interval);
            }, 100);

            const timeout = setTimeout(() => {
                clearInterval(interval);
                if (!initialTabLoaded) {
                    tryLoadDefaultTab();
                    setInitialTabLoaded(true);
                }
            }, 2000);

            return () => {
                window.removeEventListener('heysReady', handleReady);
                clearInterval(interval);
                clearTimeout(timeout);
            };
        }, [initialTabLoaded]);

        const setDefaultTab = React.useCallback((newDefaultTab) => {
            const validTabs = ['widgets', 'stats', 'diary', 'insights', 'month'];
            if (!validTabs.includes(newDefaultTab)) return;

            const U = window.HEYS?.utils;
            const profile = U?.lsGet?.('heys_profile', {}) || {};
            const updatedProfile = { ...profile, defaultTab: newDefaultTab };
            U?.lsSet?.('heys_profile', updatedProfile);
            setDefaultTabState(newDefaultTab);

            console.log(`[App] 🏠 Default tab changed to: ${newDefaultTab}`);
        }, []);

        React.useEffect(() => {
            window.HEYS = window.HEYS || {};
            window.HEYS.App = window.HEYS.App || {};
            window.HEYS.App.setTab = setTab;
            window.HEYS.App.getTab = () => tab;
            window.HEYS.App.getDefaultTab = () => defaultTab;
            window.HEYS.App.setDefaultTab = setDefaultTab;
            return () => {
                if (window.HEYS?.App) {
                    delete window.HEYS.App.setTab;
                    delete window.HEYS.App.getTab;
                    delete window.HEYS.App.getDefaultTab;
                    delete window.HEYS.App.setDefaultTab;
                }
            };
        }, [tab, setTab, defaultTab, setDefaultTab]);

        return {
            tab,
            setTab,
            defaultTab,
            setDefaultTab,
        };
    };

    HEYS.AppTabState = {
        useTabState,
    };
})();
