// heys_app_tab_state_v1.js — tab state helpers
(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    const DEV = window.DEV || {};
    const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
    const HOME_TABS = ['widgets', 'stats', 'diary', 'insights', 'month', 'tasks'];
    const TASKS_HOME_SUBTABS = ['tasks', 'calendar', 'gantt', 'chrono'];
    const DEFAULT_TASKS_SUBTAB = 'calendar';

    function resolveHomeTab(candidate) {
        return HOME_TABS.includes(candidate) ? candidate : 'diary';
    }

    function resolveHomeTasksSubtab(candidate) {
        return TASKS_HOME_SUBTABS.includes(candidate) ? candidate : DEFAULT_TASKS_SUBTAB;
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

    function markPendingDefaultTabSync(nextTab, nextTasksSubtab) {
        if (!window.HEYS) window.HEYS = {};
        if (!window.HEYS._pendingProfileSyncFlags) window.HEYS._pendingProfileSyncFlags = {};

        const pendingState = {
            requestedTab: nextTab,
            createdAt: Date.now(),
        };

        if (typeof nextTasksSubtab === 'string' && nextTasksSubtab.length > 0) {
            pendingState.requestedTasksSubtab = resolveHomeTasksSubtab(nextTasksSubtab);
        }

        window.HEYS._pendingProfileSyncFlags.defaultTab = pendingState;
    }

    const useTabState = ({ React }) => {
        const getDefaultTabFromProfile = () => {
            const U = window.HEYS?.utils;
            const profile = U?.lsGet?.('heys_profile', {}) || {};
            return resolveHomeTab(profile.defaultTab);
        };

        const getDefaultTasksSubtabFromProfile = () => {
            const U = window.HEYS?.utils;
            const profile = U?.lsGet?.('heys_profile', {}) || {};
            return resolveHomeTasksSubtab(profile.defaultTasksSubtab);
        };

        const [defaultTab, setDefaultTabState] = React.useState('diary');
        const [defaultTasksSubtab, setDefaultTasksSubtabState] = React.useState(DEFAULT_TASKS_SUBTAB);
        const [tab, rawSetTab] = React.useState('diary');
        const [initialTabLoaded, setInitialTabLoaded] = React.useState(false);
        const defaultTabRef = React.useRef(defaultTab);
        const defaultTasksSubtabRef = React.useRef(defaultTasksSubtab);
        const tabRef = React.useRef(tab);

        const applyDefaultTabState = React.useCallback((nextDefaultTab) => {
            defaultTabRef.current = nextDefaultTab;
            setDefaultTabState(nextDefaultTab);
        }, []);

        const applyDefaultTasksSubtabState = React.useCallback((nextDefaultTasksSubtab) => {
            defaultTasksSubtabRef.current = nextDefaultTasksSubtab;
            setDefaultTasksSubtabState(nextDefaultTasksSubtab);
        }, []);

        const setTabImmediate = React.useCallback((newTab) => {
            tabRef.current = newTab;
            rawSetTab(newTab);
        }, []);

        // Keep tab switches at normal priority. startTransition can starve here
        // because the tasks screen emits frequent sync updates while it is mounted.
        const setTab = React.useCallback((newTab) => {
            tabRef.current = newTab;
            rawSetTab(newTab);
        }, []);

        React.useEffect(() => {
            defaultTabRef.current = defaultTab;
        }, [defaultTab]);

        React.useEffect(() => {
            defaultTasksSubtabRef.current = defaultTasksSubtab;
        }, [defaultTasksSubtab]);

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
                const savedTasksSubtab = getDefaultTasksSubtabFromProfile();
                devLog(`[App] 🏠 Loading default tab from profile: ${savedTab}` + (savedTab === 'tasks' ? ` · ${savedTasksSubtab}` : ''));
                applyDefaultTabState(savedTab);
                applyDefaultTasksSubtabState(savedTasksSubtab);
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
        }, [initialTabLoaded, applyDefaultTabState, applyDefaultTasksSubtabState, setTabImmediate]);

        const syncDefaultTabFromProfile = React.useCallback((reason, options = {}) => {
            const U = window.HEYS?.utils;
            if (!U?.lsGet) return false;

            const freshTab = getDefaultTabFromProfile();
            const freshTasksSubtab = getDefaultTasksSubtabFromProfile();
            const currentTab = tabRef.current;
            const previousDefaultTab = defaultTabRef.current;
            const previousDefaultTasksSubtab = defaultTasksSubtabRef.current;
            const shouldFollowSyncedDefault = options.followCurrentTab === true && currentTab === previousDefaultTab && freshTab !== currentTab;
            const didDefaultChange = freshTab !== previousDefaultTab;
            const didTasksSubtabChange = freshTasksSubtab !== previousDefaultTasksSubtab;

            if (!didDefaultChange && !didTasksSubtabChange && !shouldFollowSyncedDefault) {
                return false;
            }

            if (didDefaultChange) {
                devLog(`[App] 🏠 Re-read default tab after ${reason}: ${freshTab}`);
                applyDefaultTabState(freshTab);
            }

            if (didTasksSubtabChange) {
                devLog(`[App] 🧭 Re-read default tasks subtab after ${reason}: ${freshTasksSubtab}`);
                applyDefaultTasksSubtabState(freshTasksSubtab);
            }

            if (shouldFollowSyncedDefault) {
                devLog(`[App] 🧭 Following synced default tab after ${reason}: ${freshTab}`);
                setTabImmediate(freshTab);
            }

            return true;
        }, [applyDefaultTabState, applyDefaultTasksSubtabState, setTabImmediate]);

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
                if (changedFields.length > 0 && !changedFields.includes('defaultTab') && !changedFields.includes('defaultTasksSubtab')) return;

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

        const setDefaultTab = React.useCallback((newDefaultTab, options = {}) => {
            if (!HOME_TABS.includes(newDefaultTab)) return;

            const U = window.HEYS?.utils;
            const profile = U?.lsGet?.('heys_profile', {}) || {};
            const currentDefaultTab = resolveHomeTab(profile.defaultTab);
            const currentTasksSubtab = resolveHomeTasksSubtab(profile.defaultTasksSubtab ?? defaultTasksSubtabRef.current);
            const requestedTasksSubtab = Object.prototype.hasOwnProperty.call(options, 'tasksSubtab')
                ? options.tasksSubtab
                : currentTasksSubtab;
            const nextTasksSubtab = resolveHomeTasksSubtab(requestedTasksSubtab);

            if (currentDefaultTab === newDefaultTab && currentTasksSubtab === nextTasksSubtab) {
                applyDefaultTabState(newDefaultTab);
                applyDefaultTasksSubtabState(nextTasksSubtab);
                return;
            }

            const updatedProfile = {
                ...profile,
                defaultTab: newDefaultTab,
                defaultTasksSubtab: nextTasksSubtab,
            };
            markPendingDefaultTabSync(newDefaultTab, nextTasksSubtab);
            U?.lsSet?.('heys_profile', updatedProfile);
            applyDefaultTabState(newDefaultTab);
            applyDefaultTasksSubtabState(nextTasksSubtab);

            try {
                window.dispatchEvent(new CustomEvent('heys:default-tab-changed', {
                    detail: {
                        defaultTab: newDefaultTab,
                        defaultTasksSubtab: nextTasksSubtab,
                    }
                }));
                window.dispatchEvent(new CustomEvent('heys:profile-updated', {
                    detail: {
                        field: 'defaultTab',
                        fields: currentTasksSubtab === nextTasksSubtab
                            ? ['defaultTab']
                            : ['defaultTab', 'defaultTasksSubtab'],
                        source: 'local-default-tab',
                    }
                }));
            } catch (e) {
                // silent
            }

            devLog(`[App] 🏠 Default tab changed to: ${newDefaultTab}` + (newDefaultTab === 'tasks' ? ` · ${nextTasksSubtab}` : ''));
        }, [applyDefaultTabState, applyDefaultTasksSubtabState]);

        React.useEffect(() => {
            window.HEYS = window.HEYS || {};
            window.HEYS.App = window.HEYS.App || {};
            window.HEYS.App.setTab = setTab;
            window.HEYS.App.getTab = () => tab;
            window.HEYS.App.getDefaultTab = () => defaultTab;
            window.HEYS.App.getDefaultTasksSubtab = () => defaultTasksSubtab;
            window.HEYS.App.setDefaultTab = setDefaultTab;
            return () => {
                if (window.HEYS?.App) {
                    delete window.HEYS.App.setTab;
                    delete window.HEYS.App.getTab;
                    delete window.HEYS.App.getDefaultTab;
                    delete window.HEYS.App.getDefaultTasksSubtab;
                    delete window.HEYS.App.setDefaultTab;
                }
            };
        }, [tab, setTab, defaultTab, defaultTasksSubtab, setDefaultTab]);

        return {
            tab,
            setTab,
            setTabImmediate,
            defaultTab,
            defaultTasksSubtab,
            setDefaultTab,
        };
    };

    HEYS.AppTabState = {
        useTabState,
    };
})();
