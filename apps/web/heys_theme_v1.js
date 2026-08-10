// heys_theme_v1.js — canonical theme ids, palette/mode, DOM + storage (UI v4 stage 0)
(function (global) {
    'use strict';

    if (global.HEYS && global.HEYS.Theme && global.HEYS.Theme.__initialized) {
        return;
    }

    const THEME_CHANGE_EVENT = 'heys:theme-change';
    const ROLE_PREFIX = 'v4-';

    const THEME_IDS = Object.freeze([
        'sand',
        'sand-dark',
        'blue',
        'blue-dark',
    ]);

    const PALETTES = Object.freeze(['sand', 'blue']);
    const MODES = Object.freeze(['light', 'dark']);
    // Предпочтение режима шире самого режима: 'auto' означает «спросить систему».
    // Конечный режим всё равно light или dark — auto живёт только в хранилище и
    // в шторке выбора, в data-атрибут попадает уже вычисленный id.
    const MODE_PREFERENCES = Object.freeze(['light', 'dark', 'auto']);

    const THEME_ID_KEY = 'heys_theme_id';
    const THEME_PREF_KEY = 'heys_theme_pref';
    const THEME_EXPLICIT_KEY = 'heys_theme_explicit';
    const LEGACY_THEME_KEY = 'heys_theme';
    const MODE_PREF_KEY = 'heys_theme_mode_pref';

    const DEFAULT_THEME_ID = 'sand';

    const THEME_COLOR_META = Object.freeze({
        sand: '#c67139',
        'sand-dark': '#141210',
        blue: '#2e7cc0',
        'blue-dark': '#0d1a26',
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

    function getSystemMode() {
        try {
            return global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } catch (_) {
            return 'light';
        }
    }

    function isModePreference(value) {
        return MODE_PREFERENCES.includes(value);
    }

    function getModePreference() {
        const stored = lsGet(MODE_PREF_KEY, null);
        if (isModePreference(stored)) return stored;
        // Значения до появления ключа: сохранённый id уже несёт явный режим,
        // а legacy 'auto' в heys_theme_pref означал ровно системный режим.
        if (lsGet(THEME_PREF_KEY, null) === 'auto') return 'auto';
        return getMode(lsGet(THEME_ID_KEY, null));
    }

    function isThemeId(value) {
        return THEME_IDS.includes(value);
    }

    function migrateClassicThemeId(value) {
        if (value === 'classic') return 'sand';
        if (value === 'classic-dark') return 'sand-dark';
        return value;
    }

    function migrateStoredThemeKeys() {
        const storedId = lsGet(THEME_ID_KEY, null);
        if (storedId === 'classic' || storedId === 'classic-dark') {
            const migrated = migrateClassicThemeId(storedId);
            lsSet(THEME_ID_KEY, migrated);
            lsSet(THEME_PREF_KEY, getMode(migrated));
            lsSet(LEGACY_THEME_KEY, resolveDomTheme(migrated));
        }
    }

    function parseThemeId(value) {
        const migrated = migrateClassicThemeId(value);
        if (isThemeId(migrated)) return migrated;
        if (value === 'light') return 'sand';
        if (value === 'dark') return 'sand-dark';
        return DEFAULT_THEME_ID;
    }

    function getPalette(themeId) {
        const id = parseThemeId(themeId);
        if (id.startsWith('sand')) return 'sand';
        if (id.startsWith('blue')) return 'blue';
        return 'sand';
    }

    function getMode(themeId) {
        const id = parseThemeId(themeId);
        return id.endsWith('-dark') ? 'dark' : 'light';
    }

    function buildThemeId(palette, mode) {
        const safePalette = PALETTES.includes(palette) ? palette : 'sand';
        const safeMode = MODES.includes(mode) ? mode : 'light';
        return safeMode === 'dark' ? `${safePalette}-dark` : safePalette;
    }

    function toggleMode(themeId) {
        const palette = getPalette(themeId);
        const mode = getMode(themeId);
        return buildThemeId(palette, mode === 'dark' ? 'light' : 'dark');
    }

    function resolveDomTheme(themeId) {
        return parseThemeId(themeId);
    }

    function resolveResolvedMode(themeId) {
        return getMode(themeId) === 'dark' ? 'dark' : 'light';
    }

    function readLegacyThemeId() {
        const pref = lsGet(THEME_PREF_KEY, null);
        const explicit = lsGet(THEME_EXPLICIT_KEY, null);
        const legacy = lsGet(LEGACY_THEME_KEY, null);
        if (pref === 'auto') return buildThemeId('sand', getSystemMode());
        const hasExplicit = isExplicitThemeFlag(explicit);
        const rawThemePreference = pref === 'dark' || pref === 'light'
            ? pref
            : (hasExplicit ? legacy : null);
        if (rawThemePreference === 'dark') return 'sand-dark';
        if (rawThemePreference === 'light') return 'sand';
        return DEFAULT_THEME_ID;
    }

    function readStoredThemeId() {
        migrateStoredThemeKeys();
        const stored = lsGet(THEME_ID_KEY, null);
        const base = stored != null ? parseThemeId(stored) : readLegacyThemeId();
        if (getModePreference() === 'auto') {
            return buildThemeId(getPalette(base), getSystemMode());
        }
        return base;
    }

    function writeStoredThemeId(themeId) {
        const id = parseThemeId(themeId);
        const mode = resolveResolvedMode(id);
        const domTheme = resolveDomTheme(id);
        lsSet(THEME_ID_KEY, id);
        lsSet(THEME_PREF_KEY, mode);
        lsSet(THEME_EXPLICIT_KEY, '1');
        lsSet(LEGACY_THEME_KEY, domTheme);
        // Предпочтение здесь не трогаем: при 'auto' сюда приходит уже
        // вычисленный id, и запись режима выбила бы слежение за системой.
        // Менять предпочтение можно только через setModePreference.
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

    function readStoredPalette() {
        migrateStoredThemeKeys();
        const stored = lsGet(THEME_ID_KEY, null);
        return stored != null ? parseThemeId(stored) : readLegacyThemeId();
    }

    function setModePreference(modePref) {
        const pref = isModePreference(modePref) ? modePref : 'light';
        lsSet(MODE_PREF_KEY, pref);
        const palette = getPalette(readStoredPalette());
        const mode = pref === 'auto' ? getSystemMode() : pref;
        return setThemeId(buildThemeId(palette, mode));
    }

    function setPalette(palette) {
        const pref = getModePreference();
        const mode = pref === 'auto' ? getSystemMode() : pref;
        return setThemeId(buildThemeId(palette, mode));
    }

    // Тумблер в шапке остаётся двухпозиционным: нажатие при 'auto' означает
    // «хочу вот этот режим руками», поэтому слежение снимается.
    function toggleModePreference() {
        const current = resolveResolvedMode(readStoredThemeId());
        return setModePreference(current === 'dark' ? 'light' : 'dark');
    }

    let systemModeWatch = null;

    function startSystemModeWatch() {
        if (systemModeWatch) return systemModeWatch;
        let media;
        try {
            media = global.matchMedia('(prefers-color-scheme: dark)');
        } catch (_) {
            return null;
        }
        const onChange = () => {
            if (getModePreference() !== 'auto') return;
            const palette = getPalette(readStoredPalette());
            const id = buildThemeId(palette, getSystemMode());
            writeStoredThemeId(id);
            emitThemeChange(applyThemeToDocument(id));
        };
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onChange);
            systemModeWatch = () => media.removeEventListener('change', onChange);
        } else if (typeof media.addListener === 'function') {
            media.addListener(onChange);
            systemModeWatch = () => media.removeListener(onChange);
        } else {
            return null;
        }
        return systemModeWatch;
    }

    function applyBootGlobalTheme() {
        migrateStoredThemeKeys();
        const themeId = readStoredThemeId();
        const applied = applyThemeToDocument(themeId);
        startSystemModeWatch();
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
        MODE_PREFERENCES,
        THEME_ID_KEY,
        MODE_PREF_KEY,
        THEME_PREF_KEY,
        THEME_EXPLICIT_KEY,
        LEGACY_THEME_KEY,
        DEFAULT_THEME_ID,
        THEME_COLOR_META,
        isThemeId,
        parseThemeId,
        migrateClassicThemeId,
        migrateStoredThemeKeys,
        getPalette,
        getMode,
        buildThemeId,
        toggleMode,
        toggleModePreference,
        getSystemMode,
        isModePreference,
        getModePreference,
        setModePreference,
        setPalette,
        startSystemModeWatch,
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
