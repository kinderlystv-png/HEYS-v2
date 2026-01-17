// heys_day_sleep_effects_v1.js — DayTab sleep-related effects
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function useSleepHoursEffect(deps) {
        const { React, day, setDay, sleepHours } = deps || {};
        const sleepStart = day ? day.sleepStart : '';
        const sleepEnd = day ? day.sleepEnd : '';

        React.useEffect(() => {
            if (!day) return;
            const calculatedSleepH = sleepHours(sleepStart, sleepEnd);
            if (calculatedSleepH !== day.sleepHours) {
                setDay(prevDay => ({
                    ...prevDay,
                    sleepHours: calculatedSleepH,
                    updatedAt: Date.now()
                }));
            }
        }, [sleepStart, sleepEnd]);
    }

    HEYS.daySleepEffects = {
        useSleepHoursEffect
    };
})(window);
