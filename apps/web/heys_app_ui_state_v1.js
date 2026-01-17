// heys_app_ui_state_v1.js — consolidated UI state (auth + dropdown + shortcuts)

(function () {
    const HEYS = window.HEYS = window.HEYS || {};
    HEYS.AppUIState = HEYS.AppUIState || {};

    HEYS.AppUIState.useAppUIState = function ({
        React,
        cloudSignIn,
        cloudSignOut,
        setTab,
        setNotification,
        skipTabSwitchRef,
    }) {
        const { useState, useEffect, useCallback } = React;

        const authModule = HEYS.AppAuthUIState || {};
        const shortcutsModule = HEYS.AppShortcuts || {};

        const fallbackAuth = ({ React: HookReact, cloudSignIn: signIn, cloudSignOut: signOut }) => {
            const [email, setEmail] = HookReact.useState('');
            const [pwd, setPwd] = HookReact.useState('');
            const [rememberMe, setRememberMe] = HookReact.useState(false);
            const handleSignIn = HookReact.useCallback(() => Promise.resolve(), []);
            const handleSignOut = signOut || (() => { });
            const [clientSearch, setClientSearch] = HookReact.useState('');
            const [showClientDropdown, setShowClientDropdown] = HookReact.useState(false);
            const [newPhone, setNewPhone] = HookReact.useState('');
            const [newPin, setNewPin] = HookReact.useState('');
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

        const useAuthUIState = authModule.useAuthUIState || fallbackAuth;
        const authUiState = useAuthUIState({ React, cloudSignIn, cloudSignOut });

        useEffect(() => {
            if (!shortcutsModule.handleShortcuts) return;
            return shortcutsModule.handleShortcuts({
                setTab,
                setNotification,
                skipTabSwitchRef,
            });
        }, [setTab, setNotification, skipTabSwitchRef, shortcutsModule]);

        return authUiState;
    };
})();
