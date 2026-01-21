// heys_app_ui_state_v1.js — consolidated UI state (auth + dropdown + shortcuts)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppUIState = HEYS.AppUIState || {};

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
            return localStorage.getItem('heys_remember_me') === 'true';
        });

        const handleSignIn = useCallback(() => {
            return cloudSignIn(email, pwd, { rememberMe });
        }, [cloudSignIn, email, pwd, rememberMe]);

        const handleSignOut = cloudSignOut;

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
