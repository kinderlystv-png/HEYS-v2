// heys_app_tab_state_v1.js — tab state helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const DEV = window.DEV || {};
    const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
    const HOME_TABS = ['widgets', 'stats', 'diary', 'insights', 'month', 'tasks'];

    function resolveHomeTab(candidate) {
        return HOME_TABS.includes(candidate) ? candidate : 'diary';
    }

    function getChangedProfileFields(detail) {
        if (!detail || typeof detail !== 'object') return [];

        if (Array.isArray(detail.fields)) {
            return detail.fields.filter((field) => typeof field === 'string' && field.length > 0);
        }

        if (typeof detail.field === 'string' && detail.field.length > 0) {
            return [detail.field];
        }

        return [];
    }

    function markPendingDefaultTabSync(nextTab) {
        if (!window.HEYS) window.HEYS = {};
        if (!window.HEYS._pendingProfileSyncFlags) window.HEYS._pendingProfileSyncFlags = {};

        window.HEYS._pendingProfileSyncFlags.defaultTab = {
            requestedTab: nextTab,
            createdAt: Date.now(),
        };
    }

    const useTabState = ({ React }) => {
        const getDefaultTabFromProfile = () => {
            const U = window.HEYS?.utils;
            const profile = U?.lsGet?.('heys_profile', {}) || {};
            return resolveHomeTab(profile.defaultTab);
        };

        const [defaultTab, setDefaultTabState] = React.useState('diary');
        const [tab, rawSetTab] = React.useState('diary');
        const [initialTabLoaded, setInitialTabLoaded] = React.useState(false);
        const defaultTabRef = React.useRef(defaultTab);
        const tabRef = React.useRef(tab);

        const applyDefaultTabState = React.useCallback((nextDefaultTab) => {
            defaultTabRef.current = nextDefaultTab;
            setDefaultTabState(nextDefaultTab);
        }, []);

        const setTabImmediate = React.useCallback((newTab) => {
            tabRef.current = newTab;
            rawSetTab(newTab);
        }, []);

        // Wrap setTab in startTransition so heavy tab mount/unmount
        // doesn't block the main thread (was causing 400-450ms click violations)
        const setTab = React.useCallback((newTab) => {
            React.startTransition(() => {
                tabRef.current = newTab;
                rawSetTab(newTab);
            });
        }, []);

        React.useEffect(() => {
            defaultTabRef.current = defaultTab;
        }, [defaultTab]);

        React.useEffect(() => {
            tabRef.current = tab;
        }, [tab]);

        React.useEffect(() => {
            if (!window.HEYS) window.HEYS = {};
            if (!window.HEYS.ui) window.HEYS.ui = {};
            window.HEYS.ui.switchTab = (newTab) => {
                devLog(`[App] 🔄 Switching tab to: ${newTab}`);
                setTab(newTab);
            };
        }, [setTab]);

        React.useEffect(() => {
            if (initialTabLoaded) return;

            const tryLoadDefaultTab = () => {
                const U = window.HEYS?.utils;
                if (!U?.lsGet) return false;

                const savedTab = getDefaultTabFromProfile();
                devLog(`[App] 🏠 Loading default tab from profile: ${savedTab}`);
                applyDefaultTabState(savedTab);
                setTabImmediate(savedTab);
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

        const syncDefaultTabFromProfile = React.useCallback((reason, options = {}) => {
            const U = window.HEYS?.utils;
            if (!U?.lsGet) return false;

            const freshTab = getDefaultTabFromProfile();
            const currentTab = tabRef.current;
            const previousDefaultTab = defaultTabRef.current;
            const shouldFollowSyncedDefault = options.followCurrentTab === true && currentTab === previousDefaultTab && freshTab !== currentTab;
            const didDefaultChange = freshTab !== previousDefaultTab;

            if (!didDefaultChange && !shouldFollowSyncedDefault) {
                return false;
            }

            if (didDefaultChange) {
                devLog(`[App] 🏠 Re-read default tab after ${reason}: ${freshTab}`);
                applyDefaultTabState(freshTab);
            }

            if (shouldFollowSyncedDefault) {
                devLog(`[App] 🧭 Following synced default tab after ${reason}: ${freshTab}`);
                setTabImmediate(freshTab);
            }

            return true;
        }, [applyDefaultTabState, setTabImmediate]);

        // Re-read profile when client ID becomes available (fixes namespace mismatch on boot)
        React.useEffect(() => {
            const handleClientChanged = (e) => {
                const cid = e?.detail?.clientId;
                if (!cid) return;
                syncDefaultTabFromProfile('client change');
            };
            window.addEventListener('heys:client-changed', handleClientChanged);
            return () => window.removeEventListener('heys:client-changed', handleClientChanged);
        }, [syncDefaultTabFromProfile]);

        React.useEffect(() => {
            const handleProfileUpdated = (event) => {
                const changedFields = getChangedProfileFields(event?.detail);
                if (changedFields.length > 0 && !changedFields.includes('defaultTab')) return;

                syncDefaultTabFromProfile('profile update', { followCurrentTab: true });
            };

            const handleStorage = (event) => {
                const key = String(event?.key || '');
                if (!key || (key !== 'heys_profile' && !key.endsWith('_profile'))) return;

                syncDefaultTabFromProfile('storage event', { followCurrentTab: true });
            };

            window.addEventListener('heys:profile-updated', handleProfileUpdated);
            window.addEventListener('storage', handleStorage);

            return () => {
                window.removeEventListener('heys:profile-updated', handleProfileUpdated);
                window.removeEventListener('storage', handleStorage);
            };
        }, [syncDefaultTabFromProfile]);

        const setDefaultTab = React.useCallback((newDefaultTab) => {
            if (!HOME_TABS.includes(newDefaultTab)) return;

            const U = window.HEYS?.utils;
            const profile = U?.lsGet?.('heys_profile', {}) || {};
            const updatedProfile = { ...profile, defaultTab: newDefaultTab };
            markPendingDefaultTabSync(newDefaultTab);
            U?.lsSet?.('heys_profile', updatedProfile);
            applyDefaultTabState(newDefaultTab);

            try {
                window.dispatchEvent(new CustomEvent('heys:default-tab-changed', {
                    detail: { defaultTab: newDefaultTab }
                }));
                window.dispatchEvent(new CustomEvent('heys:profile-updated', {
                    detail: {
                        field: 'defaultTab',
                        fields: ['defaultTab'],
                        source: 'local-default-tab',
                    }
                }));
            } catch (e) {
                // silent
            }

            devLog(`[App] 🏠 Default tab changed to: ${newDefaultTab}`);
        }, [applyDefaultTabState]);

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
            setTabImmediate,
            defaultTab,
            setDefaultTab,
        };
    };

    HEYS.AppTabState = {
        useTabState,
    };
})();
