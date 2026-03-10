// heys_day_sleep_effects_v1.js — DayTab sleep-related effects
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function useSleepHoursEffect(deps) {
        const { React, day, setDay, sleepHours } = deps || {};
        const sleepStart = day ? day.sleepStart : '';
        const sleepEnd = day ? day.sleepEnd : '';
        const daySleepMinutes = day ? day.daySleepMinutes : 0;

        React.useEffect(() => {
            if (!day) return;
            const nightSleepHours = sleepHours(sleepStart, sleepEnd);
            const napHours = (HEYS.dayUtils?.normalizeDaySleepMinutes?.(daySleepMinutes) || 0) / 60;
            const calculatedSleepH = HEYS.dayUtils?.getTotalSleepHours
                ? HEYS.dayUtils.getTotalSleepHours({ ...day, sleepHours: nightSleepHours, daySleepMinutes })
                : Math.round((nightSleepHours + napHours) * 10) / 10;
            if (calculatedSleepH !== day.sleepHours) {
                setDay(prevDay => ({
                    ...prevDay,
                    sleepHours: calculatedSleepH,
                    updatedAt: Date.now()
                }));
            }
        }, [sleepStart, sleepEnd, daySleepMinutes]);
    }

    HEYS.daySleepEffects = {
        useSleepHoursEffect
    };
})(window);
