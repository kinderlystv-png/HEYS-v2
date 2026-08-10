// heys_day_calendar_block_v1.js — DayTab calendar block renderer

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    /**
     * Очистка содержимого дня (раньше кнопка «Очистить» в месячной сетке).
     * Экспорт для тестов и будущего dev-only входа; из UI v4 убрано.
     */
    function clearDayForDate(params) {
        const {
            date,
            getProfile,
            ensureDay,
            setDay
        } = params || {};

        if (!date || typeof setDay !== 'function' || typeof ensureDay !== 'function') return;

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
        const profNow = typeof getProfile === 'function' ? getProfile() : {};
        const cleaned = ensureDay({
            date: date,
            meals: [],
            steps: 0,
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
        }, profNow);
        setDay({
            ...cleaned,
            updatedAt: nowMs,
            stepsUpdatedAt: bump('stepsUpdatedAt'),
            sleepNoteUpdatedAt: bump('sleepNoteUpdatedAt'),
            dayCommentUpdatedAt: bump('dayCommentUpdatedAt'),
            dayScoreUpdatedAt: bump('dayScoreUpdatedAt'),
        });
    }

    function renderCalendarBlock() {
        // UI v4: месячная сетка только в шторке DatePicker в шапке.
        return null;
    }

    HEYS.dayCalendarBlock = {
        renderCalendarBlock,
        clearDayForDate
    };
})(window);
