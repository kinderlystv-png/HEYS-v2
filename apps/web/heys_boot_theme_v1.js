// heys_boot_theme_v1.js — apply global + board nav theme before first paint
(function (global) {
    'use strict';

    const BOARD_CLIENT_ID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
    const BOARD_THEME_KEY = 'heys_board_theme_v1';
    const THEME_PREF_KEY = 'heys_theme_pref';
    const THEME_EXPLICIT_KEY = 'heys_theme_explicit';
    const LEGACY_THEME_KEY = 'heys_theme';

    function tryParse(raw, fallback) {
        if (raw == null) return fallback;
        if (typeof raw !== 'string') return raw;
        try { return JSON.parse(raw); } catch (_) { return raw; }
    }

    function lsGet(key, fallback) {
        try {
            return tryParse(global.localStorage.getItem(key), fallback);
        } catch (_) {
            return fallback;
        }
    }

    function readBootClientId() {
        return String(lsGet('heys_client_current', '') || lsGet('heys_pin_auth_client', '') || '');
    }

    function isBoardClient(clientId) {
        return String(clientId || '').toLowerCase() === BOARD_CLIENT_ID;
    }

    function isExplicitThemeFlag(value) {
        return value === '1' || value === 1 || value === true || value === 'true';
    }

    function readGlobalTheme() {
        const pref = lsGet(THEME_PREF_KEY, null);
        const explicit = lsGet(THEME_EXPLICIT_KEY, null);
        const legacy = lsGet(LEGACY_THEME_KEY, null);
        const hasExplicit = isExplicitThemeFlag(explicit);
        const rawThemePreference = pref === 'dark' || pref === 'light'
            ? pref
            : (hasExplicit ? legacy : null);
        return rawThemePreference === 'dark' ? 'dark' : 'light';
    }

    function readBoardTheme() {
        const saved = lsGet(BOARD_THEME_KEY, null);
        return saved === 'light' ? 'light' : 'dark';
    }

    function readProfile(clientId) {
        const scoped = clientId ? lsGet(`heys_${clientId}_profile`, null) : null;
        if (scoped && typeof scoped === 'object') return scoped;
        const profile = lsGet('heys_profile', {});
        return profile && typeof profile === 'object' ? profile : {};
    }

    function readBootTab(clientId) {
        const demo = global.__HEYS_DEMO_MODE__;
        if (demo && demo.enabled === true && demo.defaultTab) {
            return String(demo.defaultTab);
        }

        try {
            const params = new global.URLSearchParams(global.location.search);
            const urlTab = params.get('tab') || params.get('view') || params.get('defaultTab');
            if (urlTab === 'day') return 'stats';
            if (urlTab) return String(urlTab);
        } catch (_) { /* noop */ }

        const profile = readProfile(clientId);
        return profile.defaultTab ? String(profile.defaultTab) : 'diary';
    }

    function setBoardDarkNav(enabled) {
        const doc = global.document;
        if (!doc || !doc.documentElement) return;
        doc.documentElement.classList.toggle('board-dark-nav', enabled);
        if (doc.body) doc.body.classList.toggle('board-dark-nav', enabled);
    }

    function applyBootTheme() {
        const clientId = readBootClientId();
        const globalTheme = readGlobalTheme();
        const bootTab = readBootTab(clientId);
        const boardTheme = readBoardTheme();
        const boardTabActive = isBoardClient(clientId) && bootTab === 'board';
        const boardDarkNav = boardTabActive && boardTheme === 'dark';

        const doc = global.document;
        if (doc && doc.documentElement) {
            doc.documentElement.setAttribute('data-theme', globalTheme);
            setBoardDarkNav(boardDarkNav);
        }

        const result = {
            globalTheme,
            bootTab,
            boardTheme,
            boardTabActive,
            boardDarkNav,
        };
        global.__HEYS_BOOT_THEME__ = result;
        if (global.__heysLog) {
            global.__heysLog('Theme applied: ' + globalTheme + (boardDarkNav ? ' + board-dark-nav' : ''));
        }
        return result;
    }

    function syncBodyBoardNav() {
        const boot = global.__HEYS_BOOT_THEME__;
        if (!boot || !boot.boardDarkNav) return;
        if (global.document && global.document.body) {
            global.document.body.classList.add('board-dark-nav');
        }
    }

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.BootTheme = {
        BOARD_CLIENT_ID,
        BOARD_THEME_KEY,
        readBootClientId,
        isBoardClient,
        readGlobalTheme,
        readBoardTheme,
        readBootTab,
        applyBootTheme,
        syncBodyBoardNav,
        setBoardDarkNav,
    };

    applyBootTheme();
}(typeof window !== 'undefined' ? window : globalThis));
