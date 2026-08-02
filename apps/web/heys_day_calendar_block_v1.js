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
            // РЕГРЕСС 2026-08-02: раньше здесь стоял localStorage.removeItem(_calKey)
            // ДО setDay. Штамповщик мутаций (heys_sync_merge_v1.js,
            // guardExplicitMutationGroups) на следующей автосохранённой записи
            // ищет предыдущую версию дня в LS по этому же ключу; удалённый ключ
            // делал её недоступной, и очистка уходила с нулевыми stepsUpdatedAt/
            // sleepNoteUpdatedAt/dayCommentUpdatedAt/dayScoreUpdatedAt. У облачной
            // версии эти штампы ненулевые, поэтому при следующем merge все четыре
            // группы приходили обратно из облака — "удалённый" день воскресал.
            // Не стираем ключ вручную: обычный autosave-путь сам перепишет LS
            // новым, уже проштампованным пустым днём.
            let prevRaw = null;
            try { prevRaw = JSON.parse(localStorage.getItem(_calKey) || 'null'); } catch (_) { /* noop */ }
            const nowMs = Date.now();
            const bump = (field) => Math.max(nowMs, (Number(prevRaw && prevRaw[field]) || 0) + 1);
            const profNow = getProfile();
            const cleaned = ensureDay({
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
            }, profNow);
            setDay({
                ...cleaned,
                updatedAt: nowMs,
                // ensureDay собирает день перечислением полей без спреда и не
                // переносит *UpdatedAt-штампы — проставляем их поверх, иначе тот
                // же обрыв повторится на следующей гидрации дня.
                stepsUpdatedAt: bump('stepsUpdatedAt'),
                sleepNoteUpdatedAt: bump('sleepNoteUpdatedAt'),
                dayCommentUpdatedAt: bump('dayCommentUpdatedAt'),
                dayScoreUpdatedAt: bump('dayScoreUpdatedAt'),
            });
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
