// heys_app_auth_ui_state_v1.js — auth-related UI state extracted from heys_app_v12.js

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppAuthUIState = HEYS.AppAuthUIState || {};

    HEYS.AppAuthUIState.useAuthUIState = function ({ React, cloudSignIn, cloudSignOut }) {
        const { useState, useEffect, useCallback } = React;

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

        return {
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
    };
})();
