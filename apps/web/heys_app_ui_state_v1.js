// heys_app_ui_state_v1.js — consolidated UI state (auth + dropdown + shortcuts)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppUIState = HEYS.AppUIState || {};

    const U = HEYS.utils || {};

    const readGlobalValue = (key, fallback) => {
        try {
            if (HEYS.store?.get) {
                const stored = HEYS.store.get(key, null);
                if (stored !== null && stored !== undefined) return stored;
            }
            const raw = localStorage.getItem(key);
            if (raw !== null && raw !== undefined) return raw;
            if (U.lsGet) return U.lsGet(key, fallback);
            return fallback;
        } catch {
            return fallback;
        }
    };

    const getModule = HEYS._getModule || function (name, fallback) {
        return HEYS[name] || fallback || {};
    };

    HEYS.AppUIState.useAppUIState = function ({
        React,
        cloudSignIn,
        cloudSignOut,
        setTab,
        setNotification,
        skipTabSwitchRef,
    }) {
        const { useState, useEffect, useCallback } = React;
        const shortcutsModule = getModule('AppShortcuts');

        // Login form state (нужно до gate!)
        const [email, setEmail] = useState('');
        const [pwd, setPwd] = useState('');
        const [rememberMe, setRememberMe] = useState(() => {
            // Восстанавливаем checkbox из localStorage
            return readGlobalValue('heys_remember_me', 'false') === 'true';
        });

        const handleSignIn = useCallback(() => {
            return cloudSignIn(email, pwd, { rememberMe });
        }, [cloudSignIn, email, pwd, rememberMe]);

        const handleSignOut = useCallback(async () => {
            try {
                if (window.HEYS) {
                    window.HEYS._isLoggingOut = true;
                }
                if (window.HEYS?.cloud?.isPinAuthClient?.() && window.HEYS?.auth?.logout) {
                    await window.HEYS.auth.logout();
                }
            } catch (e) {
                console.warn('[HEYS] Logout failed:', e);
            } finally {
                try {
                    await cloudSignOut();
                } catch (e) {
                    console.warn('[HEYS] Cloud signOut failed:', e);
                }
                if (window.HEYS) {
                    window.HEYS._isLoggingOut = false;
                }
            }
        }, [cloudSignOut]);

        const [clientSearch, setClientSearch] = useState(''); // Поиск клиентов
        const [showClientDropdown, setShowClientDropdown] = useState(false); // Dropdown в шапке
        const [newPhone, setNewPhone] = useState('');
        const [newPin, setNewPin] = useState('');

        // Закрытие dropdown по Escape
        useEffect(() => {
            const handleEscape = (e) => {
                if (e.key === 'Escape' && showClientDropdown) {
                    setShowClientDropdown(false);
                }
            };
            if (showClientDropdown) {
                document.addEventListener('keydown', handleEscape);
                return () => document.removeEventListener('keydown', handleEscape);
            }
        }, [showClientDropdown]);

        useEffect(() => {
            if (!shortcutsModule.handleShortcuts) return;
            return shortcutsModule.handleShortcuts({
                setTab,
                setNotification,
                skipTabSwitchRef,
            });
        }, [setTab, setNotification, skipTabSwitchRef, shortcutsModule]);

        const uiState = {
            email,
            setEmail,
            pwd,
            setPwd,
            rememberMe,
            setRememberMe,
            handleSignIn,
            handleSignOut,
            clientSearch,
            setClientSearch,
            showClientDropdown,
            setShowClientDropdown,
            newPhone,
            setNewPhone,
            newPin,
            setNewPin,
        };

        return uiState;
    };
})();
