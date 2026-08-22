// heys_day_calendar_metrics.js — activeDays & streak calculations

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function computeActiveDays(params) {
        const { date, prof, products } = params || {};
        const getActiveDaysForMonth = HEYS.dayUtils?.getActiveDaysForMonth || (() => new Map());
        const d = new Date(date);
        return getActiveDaysForMonth(d.getFullYear(), d.getMonth(), prof, products);
    }

    // computeStreakDetails — тот же цикл по дням, что и раньше в
    // computeCurrentStreak, но дополнительно сообщает, был ли использован
    // «прощённый» пропуск: i===0 (по умолчанию это вчера, includeToday=false)
    // неуспешен или пуст, но серия не оборвалась (условие `i > 0` в break).
    // Второй такой пропуск подряд (i===1) серию уже обрывает — это НЕ второе
    // прощение, а конец действия первого.
    function computeStreakDetails(params) {
        const { optimum, pIndex, fmtDate, lsGet, includeToday } = params || {};

        try {
            let count = 0;
            let yesterdayForgiven = false;
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
                    const resolved = (HEYS.dayNorm && typeof HEYS.dayNorm.kcal === 'function')
                      ? HEYS.dayNorm.kcal(dayData, lsGet('heys_profile', {}) || {}, {})
                      : 0;
                    const dayOptimum = resolved > 0
                      ? resolved
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
                        } else if (i > 0) {
                            break;
                        } else {
                            yesterdayForgiven = true;
                        }
                    }
                } else if (i > 0) {
                    break;
                } else {
                    yesterdayForgiven = true;
                }

                checkDate.setDate(checkDate.getDate() - 1);
            }
            return { count, yesterdayForgiven };
        } catch (e) {
            return { count: 0, yesterdayForgiven: false };
        }
    }

    // computeCurrentStreak — существующий контракт (число), сохранён ради
    // обратной совместимости: у него много потребителей, которые используют
    // возврат в арифметике/сравнениях (heys_day_tab_impl_v1.js, виджеты,
    // тесты). Новые вызовы, которым нужен флаг прощённого дня, должны звать
    // computeStreakDetails/getStreakDetails.
    function computeCurrentStreak(params) {
        return computeStreakDetails(params).count;
    }

    // Единая точка входа для всех, кому нужна «серия», но неоткуда взять
    // аргументы. Раньше её роль играл HEYS.Day.getStreak — замыкание DayTab,
    // которое удаляется при размонтировании вкладки: на виджетах, в шапке и в
    // геймификации серия молча становилась нулём.
    //
    // Аргументы резолвятся в момент вызова, а не при инициализации: модуль
    // лежит в boot-day и грузится раньше продуктов и профиля.
    let streakCache = { key: '', at: 0, value: 0, details: null };
    const STREAK_CACHE_MS = 15000;

    // Считает (или берёт из кэша) детальный результат серии — {count,
    // yesterdayForgiven} — и обновляет общий кэш, которым пользуются и
    // getCurrentStreak, и getStreakDetails, чтобы не сканировать LS дважды.
    // Кэш-ключ проверяется ДО чтения профиля/продуктов — иначе кэш перестаёт
    // экономить localStorage-чтения на каждый повторный вызов.
    function resolveStreakDetails(options) {
        const includeToday = !!(options && options.includeToday);
        const dayUtils = HEYS.dayUtils || {};
        const fmtDate = dayUtils.fmtDate;
        const lsGet = HEYS.utils?.lsGet;
        if (typeof fmtDate !== 'function' || typeof lsGet !== 'function') {
            return { count: 0, yesterdayForgiven: false };
        }

        // computeStreakDetails читает до 30 ключей localStorage, а шапка
        // геймификации опрашивает серию раз в 30 секунд — держим короткий кэш.
        const cacheKey = `${fmtDate(new Date())}|${includeToday ? 1 : 0}`;
        const now = Date.now();
        if (streakCache.key === cacheKey && now - streakCache.at < STREAK_CACHE_MS && streakCache.details) {
            return streakCache.details;
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

        const details = computeStreakDetails({ optimum, pIndex, fmtDate, lsGet, includeToday })
            || { count: 0, yesterdayForgiven: false };
        streakCache = { key: cacheKey, at: now, value: details.count, details };
        return details;
    }

    function getCurrentStreak(options) {
        return resolveStreakDetails(options).count;
    }

    // getStreakDetails — как getCurrentStreak, но отдаёт ещё yesterdayForgiven:
    // true, если вчера серия не прервалась несмотря на пустой/неуспешный день
    // (использован единственный «прощённый» пропуск). Новый экспорт — старые
    // потребители getCurrentStreak/computeCurrentStreak продолжают получать
    // число, как раньше.
    function getStreakDetails(options) {
        const details = resolveStreakDetails(options);
        return { count: details.count, yesterdayForgiven: !!details.yesterdayForgiven };
    }

    function invalidateStreakCache() {
        streakCache = { key: '', at: 0, value: 0, details: null };
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
        computeStreakDetails,
        getCurrentStreak,
        getStreakDetails,
        invalidateStreakCache
    };
})(window);
