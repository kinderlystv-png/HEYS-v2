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
                    const isStreakDay = rz?.isStreakDayWithRefeed
                        ? rz.isStreakDayWithRefeed(ratio, dayData)
                        : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10));
                    if (isStreakDay) {
                        count++;
                    } else if (i > 0) break;
                } else if (i > 0) break;

                checkDate.setDate(checkDate.getDate() - 1);
            }
            return count;
        } catch (e) {
            return 0;
        }
    }

    HEYS.dayCalendarMetrics = {
        computeActiveDays,
        computeCurrentStreak
    };
})(window);
