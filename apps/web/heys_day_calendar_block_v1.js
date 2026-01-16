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
            const v = lsGet('heys_dayv2_' + d, null);
            const profNow = getProfile();
            if (v && v.date) {
                const migratedTrainings = normalizeTrainings(v.trainings);
                const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
                const migratedDay = { ...v, trainings: cleanedTrainings };
                // Сохраняем миграцию, чтобы не возвращались legacy поля при дальнейших загрузках
                lsSet('heys_dayv2_' + d, migratedDay);
                setDay(ensureDay(migratedDay, profNow));
            } else {
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
            }
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
