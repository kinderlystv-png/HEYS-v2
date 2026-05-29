// heys_day_caloric_display_state.js — displayOptimum + ratio status helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useCaloricDisplayState(params) {
        const {
            React,
            day,
            setDay,
            optimum,
            eatenKcal,
            caloricDebt,
            r0
        } = params || {};

        const displayOptimum = React.useMemo(() => {
            if (day?.isRefeedDay && HEYS.Refeed) {
                return HEYS.Refeed.getRefeedOptimum(optimum, true);
            }
            if (caloricDebt && caloricDebt.dailyBoost > 0) {
                return optimum + caloricDebt.dailyBoost;
            }
            if (caloricDebt && caloricDebt.dailyReduction > 0 && !caloricDebt.hasDebt) {
                return optimum - caloricDebt.dailyReduction;
            }
            return optimum;
        }, [optimum, caloricDebt, day?.isRefeedDay]);

        const lastWroteRef = React.useRef({ at: 0, dispOpt: null, eaten: null });
        React.useEffect(() => {
            if (!displayOptimum || displayOptimum <= 0) return;
            const roundedEaten = r0(eatenKcal);
            // 2026-05-29 anti-loop deadband + throttle: drift <5 ккал ignored
            // (rounding noise); plus throttle 2s на same (displayOptimum, eaten) pair.
            // Без guard: setDay → energyCtx invalidates → caloricDebt recomputes →
            // displayOptimum ±1 → setDay → infinite loop. Раньше маскировалось
            // React.startTransition (батчил cascade). После sweep'а wrap'ов
            // (c3defb09, 9edbdc58) loop стал visible — pollый dayv2 каждые 300мс.
            // Структурный fix — docs/REFACTOR_REACT_MEMO_DAY_TAB.md.
            const prevOptimum = +(day.savedDisplayOptimum || 0);
            const prevEaten = +(day.savedEatenKcal || 0);
            const diffOptimum = Math.abs(prevOptimum - displayOptimum);
            const diffEaten = Math.abs(prevEaten - roundedEaten);
            if (diffOptimum < 5 && diffEaten < 5) return;

            // Anti-loop throttle: если за последние 2с уже писали ровно те же значения — skip
            const now = Date.now();
            const lw = lastWroteRef.current;
            if (lw.dispOpt === displayOptimum && lw.eaten === roundedEaten && (now - lw.at) < 2000) {
                console.debug('[caloric-display] throttle skip', { displayOptimum, roundedEaten, sinceLast: now - lw.at });
                return;
            }
            lastWroteRef.current = { at: now, dispOpt: displayOptimum, eaten: roundedEaten };
            console.debug('[caloric-display] write', { prev: { prevOptimum, prevEaten }, next: { displayOptimum, roundedEaten } });

            setDay(prev => ({
                ...prev,
                savedDisplayOptimum: displayOptimum,
                savedEatenKcal: roundedEaten,
                updatedAt: now,
            }));
        }, [displayOptimum, eatenKcal, day.savedDisplayOptimum, day.savedEatenKcal, setDay, r0]);

        const displayRemainingKcal = React.useMemo(() => {
            return r0(displayOptimum - eatenKcal);
        }, [displayOptimum, eatenKcal, r0]);

        const displayCurrentRatio = React.useMemo(() => {
            return eatenKcal / (displayOptimum || optimum || 1);
        }, [eatenKcal, displayOptimum, optimum]);

        const displayRatioStatus = React.useMemo(() => {
            if (eatenKcal === 0) {
                return { emoji: '👋', text: 'Хорошего дня!', color: '#64748b' };
            }

            const ratio = displayCurrentRatio;

            if (ratio >= 1.3) {
                return { emoji: '🚨', text: 'Перебор!', color: '#ef4444' };
            }
            if (ratio >= 1.1) {
                return { emoji: '😅', text: 'Чуть больше', color: '#eab308' };
            }

            const now = new Date();
            const currentHour = now.getHours();

            let expectedProgress;
            if (currentHour < 6) {
                expectedProgress = 0;
            } else if (currentHour <= 9) {
                expectedProgress = (currentHour - 6) * 0.08;
            } else if (currentHour <= 14) {
                expectedProgress = 0.24 + (currentHour - 9) * 0.10;
            } else if (currentHour <= 20) {
                expectedProgress = 0.74 + (currentHour - 14) * 0.04;
            } else {
                expectedProgress = 0.98;
            }

            const progressDiff = ratio - expectedProgress;

            if (currentHour < 12) {
                if (progressDiff >= -0.15) return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
                if (progressDiff >= -0.25) return { emoji: '🍽️', text: 'Пора кушать', color: '#eab308' };
                return { emoji: '⚠️', text: 'Маловато', color: '#f97316' };
            }

            if (currentHour < 15) {
                if (progressDiff >= -0.1) return { emoji: '👍', text: 'Так держать!', color: '#22c55e' };
                if (progressDiff >= -0.25) return { emoji: '🍽️', text: 'Время обеда', color: '#eab308' };
                return { emoji: '⚠️', text: 'Мало для обеда', color: '#f97316' };
            }

            if (currentHour < 19) {
                if (progressDiff >= -0.1) return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
                if (progressDiff >= -0.2) return { emoji: '🍽️', text: 'Пора перекусить', color: '#eab308' };
                return { emoji: '⚠️', text: 'Маловато', color: '#f97316' };
            }

            if (ratio >= 0.75) return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
            if (ratio >= 0.6) return { emoji: '🍽️', text: 'Нужен ужин', color: '#eab308' };
            if (ratio >= 0.4) return { emoji: '⚠️', text: 'Мало калорий', color: '#f97316' };
            return { emoji: '💀', text: 'Критически мало!', color: '#ef4444' };
        }, [eatenKcal, displayCurrentRatio]);

        return {
            displayOptimum,
            displayRemainingKcal,
            displayCurrentRatio,
            displayRatioStatus
        };
    }

    HEYS.dayCaloricDisplayState = {
        useCaloricDisplayState
    };
})(window);
