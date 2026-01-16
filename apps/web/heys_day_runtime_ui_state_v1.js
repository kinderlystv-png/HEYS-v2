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

        // === Dark Theme (3 modes: light / dark / auto) ===
        const [theme, setTheme] = React.useState(() => {
            const U = ctx?.utils || {};
            const saved = U.lsGet ? U.lsGet('heys_theme', 'light') : localStorage.getItem('heys_theme');
            // Валидация: только light/dark/auto, иначе light
            return ['light', 'dark', 'auto'].includes(saved) ? saved : 'light';
        });

        // Вычисляем реальную тему (для auto режима)
        const resolvedTheme = React.useMemo(() => {
            if (theme === 'auto') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return theme;
        }, [theme]);

        // Применяем тему + слушаем системные изменения
        dayEffects.useDayThemeEffect({ theme, resolvedTheme });

        // Cycle: light → dark → auto → light
        const cycleTheme = React.useCallback(() => {
            setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
        }, []);

        // === Подсказка "нажми для деталей" ===
        const [mealChartHintShown, setMealChartHintShown] = React.useState(() => {
            try {
                const U = ctx?.utils || {};
                return U.lsGet ? U.lsGet('heys_meal_hint_shown', null) === '1' : localStorage.getItem('heys_meal_hint_shown') === '1';
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
