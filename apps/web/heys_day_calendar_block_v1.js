// heys_day_calendar_block_v1.js — DayTab calendar block renderer

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function renderCalendarBlock(params) {
        const {
            React,
            CalendarComponent,
            date,
            activeDays,
            products,
            flush,
            setDate,
            lsGet,
            lsSet,
            getProfile,
            normalizeTrainings,
            cleanEmptyTrainings,
            loadMealsForDate,
            ensureDay,
            setDay
        } = params || {};

        if (!React || !CalendarComponent) return null;

        const haptic = HEYS?.haptic || (() => { });

        const handleSelect = (d) => {
            const nextDate = d;

            // requestFlush removed: effects.js already flushes on date change

            const applyDate = () => {
                setDate(nextDate);
                haptic('light');
            };

            if (HEYS?.cloud?.fetchDays) {
                HEYS.cloud.fetchDays([nextDate])
                    .then(() => applyDate())
                    .catch(() => applyDate());
                return;
            }

            applyDate();
        };

        const handleRemove = () => {
            const _calCid = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
            const _calKey = _calCid ? 'heys_' + _calCid + '_dayv2_' + date : 'heys_dayv2_' + date;
            localStorage.removeItem(_calKey);
            const profNow = getProfile();
            setDay(ensureDay({
                date: date,
                meals: [],
                steps: 0,
                trainings: [],
                // Очищаем поля сна и оценки дня
                sleepStart: '',
                sleepEnd: '',
                sleepQuality: '',
                sleepNote: '',
                dayScore: '',
                moodAvg: '',
                wellbeingAvg: '',
                stressAvg: '',
                dayComment: ''
            }, profNow));
        };

        return React.createElement('div', { className: 'area-cal' },
            React.createElement(CalendarComponent, {
                key: 'cal-' + activeDays.size + '-' + products.length,
                valueISO: date,
                activeDays: activeDays,
                onSelect: handleSelect,
                onRemove: handleRemove
            })
        );
    }

    HEYS.dayCalendarBlock = {
        renderCalendarBlock
    };
})(window);
