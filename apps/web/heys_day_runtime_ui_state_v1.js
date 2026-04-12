// heys_day_runtime_ui_state_v1.js — runtime UI state (time, offline, theme, hints)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useRuntimeUiState(params) {
        const { React, HEYS: HEYSRef } = params || {};
        if (!React) {
            return {
                currentMinute: 0,
                setCurrentMinute: () => { },
                insulinExpanded: false,
                setInsulinExpanded: () => { },
                isOnline: navigator.onLine,
                pendingChanges: false,
                syncMessage: '',
                pendingQueue: [],
                theme: 'light',
                setTheme: () => { },
                resolvedTheme: 'light',
                cycleTheme: () => { },
                mealChartHintShown: false,
                setMealChartHintShown: () => { },
                showFirstPerfectAchievement: false,
                setShowFirstPerfectAchievement: () => { },
                newMealAnimatingIndex: -1,
                setNewMealAnimatingIndex: () => { }
            };
        }

        const ctx = HEYSRef || HEYS;
        const THEME_PREF_KEY = 'heys_theme_pref';
        const THEME_EXPLICIT_KEY = 'heys_theme_explicit';
        const LEGACY_THEME_KEY = 'heys_theme';
        const dayEffects = ctx.dayEffects || {};
        const readStoredValue = (key, fallback) => {
            try {
                if (ctx?.store?.get) return ctx.store.get(key, fallback);
                if (ctx?.utils?.lsGet) return ctx.utils.lsGet(key, fallback);
                const raw = localStorage.getItem(key);
                return raw == null ? fallback : raw;
            } catch {
                return fallback;
            }
        };

        const getSystemTheme = () => {
            try {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            } catch {
                return 'light';
            }
        };

        const isThemePreference = (value) => value === 'light' || value === 'dark' || value === 'auto';

        const isExplicitThemeFlag = (value) => (
            value === '1' || value === 1 || value === true || value === 'true'
        );

        const getStoredThemePreference = () => {
            let pref = null;
            let explicit = null;
            let legacyTheme = null;

            try {
                const rawPref = localStorage.getItem(THEME_PREF_KEY);
                const rawExplicit = localStorage.getItem(THEME_EXPLICIT_KEY);
                const rawLegacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
                pref = rawPref == null ? null : (rawPref.startsWith('"') ? JSON.parse(rawPref) : rawPref);
                explicit = rawExplicit == null ? null : (rawExplicit.startsWith('"') ? JSON.parse(rawExplicit) : rawExplicit);
                legacyTheme = rawLegacyTheme == null ? null : (rawLegacyTheme.startsWith('"') ? JSON.parse(rawLegacyTheme) : rawLegacyTheme);
            } catch { }

            if (explicit === null || explicit === undefined) explicit = readStoredValue(THEME_EXPLICIT_KEY, null);
            if (!isExplicitThemeFlag(explicit)) return 'light';

            if (pref === null || pref === undefined) pref = readStoredValue(THEME_PREF_KEY, null);
            if (pref === 'dark' || pref === 'light') return pref;
            if (pref === 'auto') return 'light';

            if (legacyTheme === null || legacyTheme === undefined) legacyTheme = readStoredValue(LEGACY_THEME_KEY, null);
            if (legacyTheme === 'light' || legacyTheme === 'dark') {
                return legacyTheme;
            }

            return 'light';
        };

        const normalizeThemePreference = (value) => {
            let rawValue = value;
            if (typeof rawValue === 'string' && rawValue.startsWith('"')) {
                try { rawValue = JSON.parse(rawValue); } catch { }
            }
            if (rawValue === 'light' || rawValue === 'dark') return rawValue;
            if (rawValue === 'auto') return 'light';
            return 'light';
        };

        if (!dayEffects?.useDayCurrentMinuteEffect) {
            throw new Error('[heys_day_runtime_ui_state] HEYS.dayEffects.useDayCurrentMinuteEffect not loaded');
        }
        if (!dayEffects?.useDayThemeEffect) {
            throw new Error('[heys_day_runtime_ui_state] HEYS.dayEffects.useDayThemeEffect not loaded');
        }

        // === Current time for Insulin Wave Indicator (updates every minute) ===
        const [currentMinute, setCurrentMinute] = React.useState(() => Math.floor(Date.now() / 60000));
        const [insulinExpanded, setInsulinExpanded] = React.useState(false);
        dayEffects.useDayCurrentMinuteEffect({ setCurrentMinute });

        // === Offline indicator ===
        const offlineState = ctx.dayOfflineSync?.useOfflineSyncIndicator?.({
            React,
            HEYS: ctx
        }) || { isOnline: navigator.onLine, pendingChanges: false, syncMessage: '', pendingQueue: [] };

        // === Dark Theme (2 modes: light / dark) ===
        const [theme, setTheme] = React.useState(() => {
            return getStoredThemePreference();
        });

        const [systemTheme, setSystemTheme] = React.useState(getSystemTheme);

        React.useEffect(() => {
            let media;
            try {
                media = window.matchMedia('(prefers-color-scheme: dark)');
            } catch {
                return undefined;
            }

            const updateSystemTheme = (event) => {
                const nextMatches = typeof event?.matches === 'boolean' ? event.matches : media.matches;
                setSystemTheme(nextMatches ? 'dark' : 'light');
            };

            updateSystemTheme();

            if (typeof media.addEventListener === 'function') {
                media.addEventListener('change', updateSystemTheme);
                return () => media.removeEventListener('change', updateSystemTheme);
            }

            if (typeof media.addListener === 'function') {
                media.addListener(updateSystemTheme);
                return () => media.removeListener(updateSystemTheme);
            }

            return undefined;
        }, []);

        const resolvedTheme = React.useMemo(
            () => (theme === 'auto' ? systemTheme : normalizeThemePreference(theme)),
            [systemTheme, theme],
        );

        // Применяем тему
        dayEffects.useDayThemeEffect({ theme, resolvedTheme });

        // Cycle: light ↔ dark
        const cycleTheme = React.useCallback(() => {
            setTheme((prev) => {
                const currentResolvedTheme = prev === 'auto' ? systemTheme : normalizeThemePreference(prev);
                return currentResolvedTheme === 'dark' ? 'light' : 'dark';
            });
        }, [systemTheme]);

        // === Подсказка "нажми для деталей" ===
        const [mealChartHintShown, setMealChartHintShown] = React.useState(() => {
            try {
                const saved = readStoredValue('heys_meal_hint_shown', null);
                if (saved != null) return saved === '1' || saved === 1 || saved === true;
                return false;
            } catch { return false; }
        });

        // === Ачивка "Первый идеальный приём" ===
        const [showFirstPerfectAchievement, setShowFirstPerfectAchievement] = React.useState(false);

        // === Анимация нового приёма в графике ===
        const [newMealAnimatingIndex, setNewMealAnimatingIndex] = React.useState(-1);

        return {
            currentMinute,
            setCurrentMinute,
            insulinExpanded,
            setInsulinExpanded,
            ...offlineState,
            theme,
            setTheme,
            resolvedTheme,
            cycleTheme,
            mealChartHintShown,
            setMealChartHintShown,
            showFirstPerfectAchievement,
            setShowFirstPerfectAchievement,
            newMealAnimatingIndex,
            setNewMealAnimatingIndex
        };
    }

    HEYS.dayRuntimeUiState = {
        useRuntimeUiState
    };
})(window);
