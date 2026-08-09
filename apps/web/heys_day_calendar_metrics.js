// heys_day_calendar_metrics.js — activeDays & streak calculations

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function computeActiveDays(params) {
        const { date, prof, products } = params || {};
        const getActiveDaysForMonth = HEYS.dayUtils?.getActiveDaysForMonth || (() => new Map());
        const d = new Date(date);
        return getActiveDaysForMonth(d.getFullYear(), d.getMonth(), prof, products);
    }

    function computeCurrentStreak(params) {
        const { optimum, pIndex, fmtDate, lsGet, includeToday } = params || {};

        try {
            let count = 0;
            let checkDate = new Date();
            checkDate.setHours(12);

            // По умолчанию НЕ учитываем сегодня (день ещё может измениться)
            if (!includeToday) {
                checkDate.setDate(checkDate.getDate() - 1);
            }

            for (let i = 0; i < 30; i++) {
                const dateStr = fmtDate(checkDate);
                const dayData = lsGet('heys_dayv2_' + dateStr, null);

                if (dayData && dayData.meals && dayData.meals.length > 0) {
                    let totalKcal = 0;
                    (dayData.meals || []).forEach(meal => {
                        (meal.items || []).forEach(item => {
                            const grams = +item.grams || 0;
                            if (grams <= 0) return;
                            const nameKey = (item.name || '').trim().toLowerCase();
                            const product = nameKey && pIndex?.byName?.get(nameKey)
                                || (item.product_id != null ? pIndex?.byId?.get(String(item.product_id).toLowerCase()) : null);
                            const src = product || item;
                            if (src.kcal100 != null) {
                                totalKcal += ((+src.kcal100 || 0) * grams / 100);
                            }
                        });
                    });

                    // 🔧 FIX v2.6: Используем savedDisplayOptimum дня (TDEE того дня),
                    // а не текущий optimum (сегодняшний TDEE без активности).
                    // Каждый день имеет свой TDEE в зависимости от тренировок, шагов и т.д.
                    const dayOptimum = (+dayData.savedDisplayOptimum > 0)
                        ? +dayData.savedDisplayOptimum
                        : (optimum || 1);
                    const ratio = totalKcal / dayOptimum;
                    const rz = HEYS.ratioZones;
                    const isRefeedDay = !!dayData?.isRefeedDay;
                    const isStreakDay = rz?.isStreakDayWithRefeed
                        ? rz.isStreakDayWithRefeed(ratio, dayData)
                        : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10));

                    // Рефид-день: не добавляет к стрику и не обрывает его
                    if (!isRefeedDay) {
                        if (isStreakDay) {
                            count++;
                        } else if (i > 0) break;
                    }
                } else if (i > 0) break;

                checkDate.setDate(checkDate.getDate() - 1);
            }
            return count;
        } catch (e) {
            return 0;
        }
    }

    // Единая точка входа для всех, кому нужна «серия», но неоткуда взять
    // аргументы. Раньше её роль играл HEYS.Day.getStreak — замыкание DayTab,
    // которое удаляется при размонтировании вкладки: на виджетах, в шапке и в
    // геймификации серия молча становилась нулём.
    //
    // Аргументы резолвятся в момент вызова, а не при инициализации: модуль
    // лежит в boot-day и грузится раньше продуктов и профиля.
    let streakCache = { key: '', at: 0, value: 0 };
    const STREAK_CACHE_MS = 15000;

    function getCurrentStreak(options) {
        const includeToday = !!(options && options.includeToday);
        const dayUtils = HEYS.dayUtils || {};
        const fmtDate = dayUtils.fmtDate;
        const lsGet = HEYS.utils?.lsGet;
        if (typeof fmtDate !== 'function' || typeof lsGet !== 'function') return 0;

        // computeCurrentStreak читает до 30 ключей localStorage, а шапка
        // геймификации опрашивает серию раз в 30 секунд — держим короткий кэш.
        const cacheKey = `${fmtDate(new Date())}|${includeToday ? 1 : 0}`;
        const now = Date.now();
        if (streakCache.key === cacheKey && now - streakCache.at < STREAK_CACHE_MS) {
            return streakCache.value;
        }

        const products = HEYS.products?.getAll?.() || [];
        const pIndex = typeof dayUtils.buildProductIndex === 'function'
            ? dayUtils.buildProductIndex(products)
            : null;
        // Для каждого дня приоритет у его собственного savedDisplayOptimum;
        // это значение — только фолбэк для старых записей без него.
        // HEYS.dayUtils.getOptimumForDay намеренно не зовём: такого метода нет
        // ни в одном исходнике, все его вызовы в проекте молча падают в фолбэк.
        const profile = lsGet('heys_profile', {}) || {};
        const optimum = HEYS.TDEE?.calculate?.({}, profile, {})?.optimum || 0;

        const value = computeCurrentStreak({ optimum, pIndex, fmtDate, lsGet, includeToday }) || 0;
        streakCache = { key: cacheKey, at: now, value };
        return value;
    }

    function invalidateStreakCache() {
        streakCache = { key: '', at: 0, value: 0 };
    }

    // Вкладка Дня шлёт это событие, когда пересчитала серию
    // (heys_day_effects.js) — сбрасываем кэш, чтобы шапка и виджеты не
    // показывали устаревшее значение до истечения TTL.
    if (typeof global.addEventListener === 'function') {
        global.addEventListener('heysDayStreakUpdated', invalidateStreakCache);
    }

    HEYS.dayCalendarMetrics = {
        computeActiveDays,
        computeCurrentStreak,
        getCurrentStreak,
        invalidateStreakCache
    };
})(window);
