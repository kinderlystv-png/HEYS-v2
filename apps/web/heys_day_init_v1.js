// heys_day_init_v1.js — DayTab initial day state factory
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getInitialDay(params) {
        const {
            date,
            prof,
            lsGet,
            ensureDay,
            normalizeTrainings,
            cleanEmptyTrainings
        } = params || {};

        const safeNormalize = typeof normalizeTrainings === 'function' ? normalizeTrainings : (t = []) => t;
        const safeClean = typeof cleanEmptyTrainings === 'function' ? cleanEmptyTrainings : (t = []) => t;

        const key = 'heys_dayv2_' + date;
        const v = lsGet(key, null);

        if (v && v.date) {
            const normalizedTrainings = safeNormalize(v.trainings);
            const cleanedTrainings = safeClean(normalizedTrainings);
            const migratedDay = { ...v, trainings: cleanedTrainings };
            return ensureDay(migratedDay, prof);
        }

        return ensureDay({
            date: date,
            meals: [],
            trainings: [],
            sleepStart: '',
            sleepEnd: '',
            sleepQuality: '',
            sleepNote: '',
            dayScore: '',
            moodAvg: '',
            wellbeingAvg: '',
            stressAvg: '',
            dayComment: ''
        }, prof);
    }

    HEYS.dayInit = {
        getInitialDay
    };
})(window);
