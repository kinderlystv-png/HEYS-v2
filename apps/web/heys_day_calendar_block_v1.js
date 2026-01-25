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

        const handleSelect = (d) => {
            // persist current day explicitly before switching date
            try { flush(); } catch (e) { }
            setDate(d);
            const profNow = getProfile();
            const applyDayData = (dayData) => {
                if (dayData && dayData.date) {
                    const migratedTrainings = normalizeTrainings(dayData.trainings);
                    const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
                    const migratedDay = { ...dayData, trainings: cleanedTrainings };
                    // Сохраняем миграцию, чтобы не возвращались legacy поля при дальнейших загрузках
                    lsSet('heys_dayv2_' + d, migratedDay);
                    setDay(ensureDay(migratedDay, profNow));
                    return true;
                }
                return false;
            };

            const v = lsGet('heys_dayv2_' + d, null);
            if (applyDayData(v)) return;

            const cloud = HEYS?.cloud;
            if (cloud && typeof cloud.fetchDays === 'function') {
                cloud.fetchDays([d])
                    .then(() => {
                        const fetched = lsGet('heys_dayv2_' + d, null);
                        if (applyDayData(fetched)) return;
                        setDay(ensureDay({
                            date: d,
                            meals: (loadMealsForDate(d) || []),
                            trainings: [],
                            // Явно устанавливаем пустые значения для всех полей
                            weightMorning: '',
                            deficitPct: '',
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
                    })
                    .catch((err) => {
                        if (HEYS?.analytics?.trackError) {
                            HEYS.analytics.trackError(err, {
                                where: 'dayCalendarBlock.fetchDays',
                                date: d
                            });
                        }
                        setDay(ensureDay({
                            date: d,
                            meals: (loadMealsForDate(d) || []),
                            trainings: [],
                            // Явно устанавливаем пустые значения для всех полей
                            weightMorning: '',
                            deficitPct: '',
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
                    });
                return;
            }

            setDay(ensureDay({
                date: d,
                meals: (loadMealsForDate(d) || []),
                trainings: [],
                // Явно устанавливаем пустые значения для всех полей
                weightMorning: '',
                deficitPct: '',
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

        const handleRemove = () => {
            localStorage.removeItem('heys_dayv2_' + date);
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
