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

        if (!dayEffects?.useDayCurrentMinuteEffect) {
            throw new Error('[heys_day_runtime_ui_state] HEYS.dayEffects.useDayCurrentMinuteEffect not loaded');
        }
        if (!dayEffects?.useDayThemeEffect) {
            throw new Error('[heys_day_runtime_ui_state] HEYS.dayEffects.useDayThemeEffect not loaded');
        }
        if (!ctx.AppHooks?.useThemePreference) {
            throw new Error('[heys_day_runtime_ui_state] HEYS.AppHooks.useThemePreference not loaded');
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

        // === Theme: consumer of global HEYS.Theme via AppHooks (not a second owner) ===
        const {
            theme,
            resolvedTheme,
            cycleTheme,
            setModePreference,
        } = ctx.AppHooks.useThemePreference();
        const setTheme = typeof setModePreference === 'function'
            ? setModePreference
            : () => { };

        // Keep the effect hook for API compatibility; it must not write DOM/storage.
        dayEffects.useDayThemeEffect({ theme, resolvedTheme });

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
