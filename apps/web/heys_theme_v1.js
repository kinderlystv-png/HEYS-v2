// heys_theme_v1.js — canonical theme ids, palette/mode, DOM + storage (UI v4 stage 0)
(function (global) {
    'use strict';

    if (global.HEYS && global.HEYS.Theme && global.HEYS.Theme.__initialized) {
        return;
    }

    const THEME_CHANGE_EVENT = 'heys:theme-change';
    const ROLE_PREFIX = 'v4-';

    const THEME_IDS = Object.freeze([
        'classic',
        'classic-dark',
        'sand',
        'sand-dark',
        'blue',
        'blue-dark',
    ]);

    const PALETTES = Object.freeze(['classic', 'sand', 'blue']);
    const MODES = Object.freeze(['light', 'dark']);

    const THEME_ID_KEY = 'heys_theme_id';
    const THEME_PREF_KEY = 'heys_theme_pref';
    const THEME_EXPLICIT_KEY = 'heys_theme_explicit';
    const LEGACY_THEME_KEY = 'heys_theme';

    const DEFAULT_THEME_ID = 'classic';

    const THEME_COLOR_META = Object.freeze({
        classic: '#2563eb',
        'classic-dark': '#0f172a',
        sand: '#c67139',
        'sand-dark': '#141210',
        blue: '#2e7cc0',
        'blue-dark': '#0d1a26',
    });

    const DOM_THEME_COMPAT = Object.freeze({
        classic: 'light',
        'classic-dark': 'dark',
    });

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

    function lsSet(key, value) {
        try {
            global.localStorage.setItem(key, value);
        } catch (_) { /* noop */ }
    }

    function isExplicitThemeFlag(value) {
        return value === '1' || value === 1 || value === true || value === 'true';
    }

    function isThemeId(value) {
        return THEME_IDS.includes(value);
    }

    function parseThemeId(value) {
        if (isThemeId(value)) return value;
        if (value === 'light') return 'classic';
        if (value === 'dark') return 'classic-dark';
        return DEFAULT_THEME_ID;
    }

    function getPalette(themeId) {
        const id = parseThemeId(themeId);
        if (id === 'classic' || id === 'classic-dark') return 'classic';
        if (id.startsWith('sand')) return 'sand';
        if (id.startsWith('blue')) return 'blue';
        return 'classic';
    }

    function getMode(themeId) {
        const id = parseThemeId(themeId);
        return id.endsWith('-dark') ? 'dark' : 'light';
    }

    function buildThemeId(palette, mode) {
        const safePalette = PALETTES.includes(palette) ? palette : 'classic';
        const safeMode = MODES.includes(mode) ? mode : 'light';
        if (safePalette === 'classic') {
            return safeMode === 'dark' ? 'classic-dark' : 'classic';
        }
        return safeMode === 'dark' ? `${safePalette}-dark` : safePalette;
    }

    function toggleMode(themeId) {
        const palette = getPalette(themeId);
        const mode = getMode(themeId);
        return buildThemeId(palette, mode === 'dark' ? 'light' : 'dark');
    }

    function resolveDomTheme(themeId) {
        const id = parseThemeId(themeId);
        return DOM_THEME_COMPAT[id] || id;
    }

    function resolveResolvedMode(themeId) {
        return getMode(themeId) === 'dark' ? 'dark' : 'light';
    }

    function readLegacyThemeId() {
        const pref = lsGet(THEME_PREF_KEY, null);
        const explicit = lsGet(THEME_EXPLICIT_KEY, null);
        const legacy = lsGet(LEGACY_THEME_KEY, null);
        if (pref === 'auto') return DEFAULT_THEME_ID;
        const hasExplicit = isExplicitThemeFlag(explicit);
        const rawThemePreference = pref === 'dark' || pref === 'light'
            ? pref
            : (hasExplicit ? legacy : null);
        if (rawThemePreference === 'dark') return 'classic-dark';
        return DEFAULT_THEME_ID;
    }

    function readStoredThemeId() {
        const stored = lsGet(THEME_ID_KEY, null);
        if (isThemeId(stored)) return stored;
        return readLegacyThemeId();
    }

    function writeStoredThemeId(themeId) {
        const id = parseThemeId(themeId);
        const mode = resolveResolvedMode(id);
        const domTheme = resolveDomTheme(id);
        lsSet(THEME_ID_KEY, id);
        lsSet(THEME_PREF_KEY, mode);
        lsSet(THEME_EXPLICIT_KEY, '1');
        lsSet(LEGACY_THEME_KEY, domTheme);
    }

    function applyThemeColorMeta(themeId) {
        const id = parseThemeId(themeId);
        const color = THEME_COLOR_META[id] || THEME_COLOR_META[DEFAULT_THEME_ID];
        const doc = global.document;
        if (!doc) return;
        let meta = doc.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = doc.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            doc.head.appendChild(meta);
        }
        meta.setAttribute('content', color);
    }

    function applyThemeToDocument(themeId) {
        const id = parseThemeId(themeId);
        const domTheme = resolveDomTheme(id);
        const doc = global.document;
        if (doc && doc.documentElement) {
            doc.documentElement.setAttribute('data-theme', domTheme);
            doc.documentElement.setAttribute('data-theme-id', id);
            doc.documentElement.setAttribute('data-palette', getPalette(id));
        }
        applyThemeColorMeta(id);
        const applied = { themeId: id, domTheme, palette: getPalette(id), mode: getMode(id) };
        global.__HEYS_THEME__ = applied;
        return applied;
    }

    function emitThemeChange(applied) {
        try {
            global.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: applied }));
        } catch (_) { /* noop */ }
    }

    function subscribeThemeChange(listener) {
        const handler = (event) => listener(event.detail);
        global.addEventListener(THEME_CHANGE_EVENT, handler);
        return () => global.removeEventListener(THEME_CHANGE_EVENT, handler);
    }

    function setThemeId(themeId) {
        const id = parseThemeId(themeId);
        writeStoredThemeId(id);
        const applied = applyThemeToDocument(id);
        emitThemeChange(applied);
        return applied;
    }

    function applyBootGlobalTheme() {
        const themeId = readStoredThemeId();
        const applied = applyThemeToDocument(themeId);
        if (global.__heysLog) {
            global.__heysLog(`Theme applied: ${applied.themeId} → data-theme=${applied.domTheme}`);
        }
        return applied;
    }

    const HEYS = global.HEYS = global.HEYS || {};
    HEYS.Theme = {
        __initialized: true,
        THEME_CHANGE_EVENT,
        ROLE_PREFIX,
        THEME_IDS,
        PALETTES,
        MODES,
        THEME_ID_KEY,
        THEME_PREF_KEY,
        THEME_EXPLICIT_KEY,
        LEGACY_THEME_KEY,
        DEFAULT_THEME_ID,
        THEME_COLOR_META,
        isThemeId,
        parseThemeId,
        getPalette,
        getMode,
        buildThemeId,
        toggleMode,
        resolveDomTheme,
        resolveResolvedMode,
        readStoredThemeId,
        writeStoredThemeId,
        applyThemeToDocument,
        applyThemeColorMeta,
        applyBootGlobalTheme,
        setThemeId,
        subscribeThemeChange,
        emitThemeChange,
    };
}(typeof window !== 'undefined' ? window : globalThis));
