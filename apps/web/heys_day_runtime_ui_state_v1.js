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

        const normalizeThemePreference = (value) => {
            let rawValue = value;
            if (typeof rawValue === 'string' && rawValue.startsWith('"')) {
                try { rawValue = JSON.parse(rawValue); } catch { }
            }
            if (rawValue === 'light' || rawValue === 'dark') return rawValue;
            if (rawValue === 'auto') {
                try {
                    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                } catch {
                    return 'light';
                }
            }
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
            const saved = readStoredValue('heys_theme', 'light');
            return normalizeThemePreference(saved);
        });

        const resolvedTheme = React.useMemo(() => theme, [theme]);

        // Применяем тему
        dayEffects.useDayThemeEffect({ theme, resolvedTheme });

        // Cycle: light ↔ dark
        const cycleTheme = React.useCallback(() => {
            setTheme(prev => prev === 'dark' ? 'light' : 'dark');
        }, []);

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
