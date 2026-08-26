// heys_day_cycle_state.js — cycle card state helpers

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function useCycleState(params) {
        const { React, day, date, setDay, lsGet, lsSet, prof } = params || {};

        const showCycleCard = (() => {
            const hf = HEYS.healthFeatures;
            if (hf && typeof hf.isCycleTrackingEnabled === 'function') {
                return hf.isCycleTrackingEnabled(prof);
            }
            return prof?.cycleTrackingEnabled === true && prof?.gender === 'Женский';
        })();
        const cyclePhase = HEYS.Cycle?.getCyclePhase?.(day?.cycleDay);

        const [cycleEditMode, setCycleEditMode] = React.useState(false);
        const [cycleDayInput, setCycleDayInput] = React.useState(day?.cycleDay || '');

        const saveCycleDay = React.useCallback((newDay) => {
            const validDay = newDay === null ? null : Math.min(Math.max(1, parseInt(newDay) || 1), 7);

            setDay(prev => {
                const mutationAt = Math.max(Date.now(), (Number(prev.cycleUpdatedAt) || 0) + 1);
                return { ...prev, cycleDay: validDay, cycleUpdatedAt: mutationAt, updatedAt: mutationAt };
            });
            setCycleEditMode(false);

            if (validDay && HEYS.Cycle?.setCycleDaysAuto && lsGet && lsSet) {
                HEYS.Cycle.setCycleDaysAuto(date, validDay, lsGet, lsSet);
            }
        }, [setDay, date, lsGet, lsSet]);

        const clearCycleDay = React.useCallback(() => {
            setDay(prev => {
                const mutationAt = Math.max(Date.now(), (Number(prev.cycleUpdatedAt) || 0) + 1);
                return { ...prev, cycleDay: null, cycleUpdatedAt: mutationAt, updatedAt: mutationAt };
            });
            setCycleEditMode(false);

            if (HEYS.Cycle?.clearCycleDays && lsGet && lsSet) {
                HEYS.Cycle.clearCycleDays(date, lsGet, lsSet);
            }
        }, [setDay, date, lsGet, lsSet]);

        return {
            showCycleCard,
            cyclePhase,
            cycleEditMode,
            setCycleEditMode,
            cycleDayInput,
            setCycleDayInput,
            saveCycleDay,
            clearCycleDay
        };
    }

    HEYS.dayCycleState = {
        useCycleState
    };
})(window);
