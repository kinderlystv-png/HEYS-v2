// heys_monthly_reports_service_v1.js — Monthly reports data builder + cache

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function pad2(n) { return String(n).padStart(2, '0'); }
    function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

    // Расчётный вес — не замер: подставляется, когда человек не взвесился.
    // Правило одно на неделю и на месяц, поэтому живёт одной функцией.
    function isMeasuredWeight(src) {
        return !!src
            && src.weightMorningEstimated !== true
            && src.weightMorningSource !== 'estimated_avg'
            && src.weightMorningSource !== 'estimated_profile';
    }

    function averageOf(values) {
        return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
    }

    // HEYS.store.getCurrentProfile не существует — здесь всегда получался 'guest',
    // и подпись кэша читала несуществующие ключи. Канонический источник id —
    // HEYS.utils.getCurrentClientId (heys_core_v12.js), см. также HEYS.cloud.
    function getClientId() {
        return HEYS.utils?.getCurrentClientId?.()
            || HEYS.cloud?.getCurrentClientId?.()
            || HEYS.currentClientId
            || '';
    }

    // Формат client-scoped ключа: heys_<clientId>_<suffix> (см. scoped()
    // в heys_storage_layer_v1.js). Порядок частей важен: heys_dayv2_<дата>_<cid>
    // не существует в localStorage.
    function getStorageKey(key) {
        const clientId = getClientId();
        if (!clientId || key.includes(clientId)) return key;
        return key.startsWith('heys_')
            ? 'heys_' + clientId + '_' + key.slice('heys_'.length)
            : `heys_${clientId}_${key}`;
    }

    function getLsGet() {
        return (key, fallback) => {
            try {
                if (HEYS.store?.get) return HEYS.store.get(key, fallback);
                if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(key, fallback);

                const storageKey = getStorageKey(key);
                const stored = localStorage.getItem(storageKey) || localStorage.getItem(key);
                if (!stored) return fallback;
                if (storageKey !== key && HEYS.StorageLayer?.decrypt) {
                    try {
                        const decrypted = HEYS.StorageLayer.decrypt(stored);
                        return JSON.parse(decrypted);
                    } catch (e) {
                        return fallback;
                    }
                }
                return JSON.parse(stored);
            } catch (e) {
                return fallback;
            }
        };
    }

    // HEYS.products.buildIndex не существует; индекс строит HEYS.models.buildProductIndex
    // и ему нужен список продуктов — вызов без аргумента вернул бы пустой индекс,
    // из-за чего ГИ и вредность в отчётах считались по нулям.
    function buildProductIndex() {
        const products = HEYS.products?.getAll?.();
        if (!Array.isArray(products) || !products.length) return null;
        return HEYS.models?.buildProductIndex?.(products)
            || HEYS.dayUtils?.buildProductIndex?.(products)
            || null;
    }

    function getSignature({ weeksCount, profile, dateKeys, productsCount = 0 }) {
        const parts = [
            getClientId(),
            JSON.stringify(profile || {}),
            `products:${productsCount}`
        ];

        dateKeys.forEach((dateStr) => {
            const key = getStorageKey(`heys_dayv2_${dateStr}`);
            const raw = localStorage.getItem(key) || localStorage.getItem(`heys_dayv2_${dateStr}`) || '';
            parts.push(`${dateStr}:${raw.length}`);
        });

        parts.push(`weeks:${weeksCount}`);
        return parts.join('|');
    }

    function buildDateKeys({ weeksCount, now }) {
        const keys = [];
        for (let weekOffset = 0; weekOffset < weeksCount; weekOffset++) {
            const anchorDate = new Date(now);
            anchorDate.setDate(anchorDate.getDate() - (7 * weekOffset));

            const dayOfWeek = anchorDate.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(anchorDate);
            monday.setDate(anchorDate.getDate() + diff);

            for (let i = 0; i < 7; i++) {
                const dayDate = new Date(monday);
                dayDate.setDate(monday.getDate() + i);
                keys.push(fmtDate(dayDate));
            }
        }
        return keys;
    }

    function buildMonthlyWeeks({ weeksCount = 8, useCache = true } = {}) {
        const lsGet = getLsGet();
        const profile = lsGet('heys_profile', {});
        const pIndex = buildProductIndex();

        if (!HEYS.weeklyReports?.buildWeekReport) return [];

        const now = new Date();
        const nowDateStr = fmtDate(now);
        const dateKeys = buildDateKeys({ weeksCount, now });
        // Число продуктов входит в подпись: без него отчёт, построенный до загрузки
        // каталога (pIndex === null), навсегда залипал бы в кэше с нулевыми ГИ.
        const signature = getSignature({
            weeksCount,
            profile,
            dateKeys,
            productsCount: pIndex?.byId?.size || 0
        });

        const cache = HEYS.monthlyReportsService?.cache;
        if (useCache && cache && cache.signature === signature && Array.isArray(cache.weeks)) {
            return cache.weeks;
        }

        const weeks = [];

        for (let weekOffset = 0; weekOffset < weeksCount; weekOffset++) {
            const anchorDate = new Date(now);
            anchorDate.setDate(anchorDate.getDate() - (7 * weekOffset));

            const dayOfWeek = anchorDate.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(anchorDate);
            monday.setDate(anchorDate.getDate() + diff);

            const mondayStr = fmtDate(monday);
            const sundayDate = new Date(monday);
            sundayDate.setDate(monday.getDate() + 6);
            const sundayStr = fmtDate(sundayDate);

            const days = [];
            for (let i = 0; i < 7; i++) {
                const dayDate = new Date(monday);
                dayDate.setDate(monday.getDate() + i);
                const dateStr = fmtDate(dayDate);
                const dayData = lsGet(`heys_dayv2_${dateStr}`, null);
                if (dayData) {
                    days.push({ ...dayData, dateStr });
                }
            }

            const report = HEYS.weeklyReports.buildWeekReport({
                dateStr: mondayStr,
                endDateStr: sundayStr,
                lsGet,
                profile,
                pIndex,
                filterEmptyDays: true
            });

            // Порог включения недели — по дням с записями, общим счётчиком зоны.
            if ((report.daysWithRecords ?? report.daysWithData) >= 2) {
                const dayMap = new Map(days.map((d) => [d.dateStr, d]));
                const visibleDays = (report.days || []).filter((d) => {
                    const hasMeals = d.hasMeals;
                    const isToday = d.dateStr === nowDateStr;
                    const ratio = d.ratio || 0;
                    return hasMeals && !(isToday && ratio < 0.5);
                });

                // Расчётный вес — не замер: он подставляется, когда человек не
                // взвесился (среднее трёх последних взвешиваний либо вес
                // профиля). Все графики веса такие точки выбрасывают, здесь они
                // шли в среднее наравне с измеренными и двигали стрелку.
                // Вес не зависит от еды: сторона веса и сторона съеденного
                // считаются по своим выборкам, и одна другую не отсекает. День,
                // когда человек взвесился, но не записал питание, в средний вес
                // попадает — раньше он выпадал вместе с едой.
                const weights = (report.days || [])
                    .filter((d) => d.isEligible)
                    .map((d) => dayMap.get(d.dateStr))
                    .filter(isMeasuredWeight)
                    .map((src) => src.weightMorning)
                    .filter((w) => w && w > 0);

                // Ни одного взвешивания — честный ноль: карточка покажет прочерк
                // и не нарисует стрелку. Прежний фолбэк на вес из профиля
                // сравнивал соседний период с константой и выдавал это за
                // динамику.
                const avgWeight = weights.length > 0
                    ? Math.round(weights.reduce((s, w) => s + w, 0) / weights.length * 10) / 10
                    : 0;

                const reportDays = (report.days || []).map((d) => {
                    const sourceDay = dayMap.get(d.dateStr);
                    return {
                        ...d,
                        weightMorning: Number.isFinite(sourceDay?.weightMorning) ? sourceDay.weightMorning : 0,
                        // Метку измеренности несём дальше: месяц собирается по
                        // этим же дням и обязан фильтровать так же, как неделя.
                        weightMeasured: isMeasuredWeight(sourceDay)
                    };
                });

                const mondayLabel = monday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                const sundayLabel = sundayDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                const rangeLabel = `${mondayLabel} – ${sundayLabel}`;

                weeks.push({
                    rangeLabel,
                    monday: mondayStr,
                    sunday: sundayStr,
                    report: { ...report, avgWeight, days: reportDays },
                    isCurrent: weekOffset === 0
                });
            }
        }

        HEYS.monthlyReportsService.cache = {
            signature,
            weeks,
            ts: Date.now()
        };

        return weeks;
    }

    // Месяц считается по дням, а не по неделям. Прежняя раскладка складывала
    // недели по их понедельнику при календарном знаменателе, и получалось два
    // перекоса сразу: дни начала месяца, попавшие в неделю с прошлым
    // понедельником, в числитель не шли никогда (у месяца, начинающегося с
    // воскресенья, потолок доли был около 80 % — порог «>=86 %» недостижим), а
    // средние считались по неделям невзвешенно, и неделя из двух дней весила
    // столько же, сколько неделя из семи. Оба уходят одним решением: и
    // числитель, и знаменатель календарные, неделя-стык делится по дням.
    function buildMonthlyMonths({ weeksCount = 16, useCache = true } = {}) {
        const weeks = buildMonthlyWeeks({ weeksCount, useCache });
        if (!weeks.length) return [];

        const now = new Date();
        const currentMonthKey = now.getFullYear() + '-' + pad2(now.getMonth() + 1);

        // Дни всех недель, каждый — ровно один раз: неделя-стык раскладывается
        // между двумя месяцами по датам самих дней.
        const byMonth = new Map();
        const seen = new Set();
        weeks.forEach((week) => {
            (week?.report?.days || []).forEach((day) => {
                const dateStr = day?.dateStr;
                if (!dateStr || seen.has(dateStr)) return;
                seen.add(dateStr);
                const key = dateStr.slice(0, 7);
                if (!byMonth.has(key)) byMonth.set(key, []);
                byMonth.get(key).push(day);
            });
        });

        const months = [];
        byMonth.forEach((allDays, key) => {
            const isCurrentMonth = key === currentMonthKey;

            const [yearStr, monthStr] = String(key).split('-');
            const year = Number(yearStr);
            const monthIndex = Number(monthStr) - 1;
            const daysInMonth = Number.isFinite(year) && Number.isFinite(monthIndex)
                ? new Date(year, monthIndex + 1, 0).getDate()
                : 0;
            const totalDaysPossible = isCurrentMonth
                ? Math.min(daysInMonth || 0, now.getDate())
                : daysInMonth;

            // Учтённые дни отмечены там, где живут правила включения
            // (heys_weekly_reports_v2.js): пометка «не заполнял», будущее и
            // неполный сегодня уже отсеяны.
            const counted = allDays.filter((d) => d.isCounted);
            const foodDays = counted.filter((d) => d.hasMeals);
            const recordDays = counted.filter((d) => d.hasAnyRecord);

            // Месяц без порога недель, но не из воздуха: два дня с едой — тот
            // же минимум, что у недели.
            if (!isCurrentMonth && foodDays.length < 2) return;
            if (foodDays.length === 0) return;

            const burnedDays = counted.filter((d) => (d.burned || 0) > 0);
            const totalBurned = burnedDays.reduce((s, d) => s + d.burned, 0);
            const totalKcal = foodDays.reduce((s, d) => s + (d.totals?.kcal || 0), 0);

            // Вес по годным дням, а не по учтённым: учтённые при
            // filterEmptyDays — это дни с едой, а взвешивание от еды не зависит.
            const weights = allDays
                .filter((d) => d.isEligible && d.weightMeasured && (d.weightMorning || 0) > 0)
                .map((d) => d.weightMorning);

            const targets = burnedDays
                .map((d) => d.targetDeficitPct)
                .filter((v) => Number.isFinite(v));

            months.push({
                rangeLabel: new Date(year, monthIndex, 1)
                    .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
                monthKey: key,
                report: {
                    avgTarget: burnedDays.length ? Math.round(totalBurned / burnedDays.length) : 0,
                    avgKcal: Math.round(averageOf(foodDays.map((d) => d.totals?.kcal || 0))),
                    targetDeficitPct: targets.length ? Math.round(averageOf(targets)) : 0,
                    avgDeltaPct: totalBurned
                        ? Math.round(((totalKcal - totalBurned) / totalBurned) * 100)
                        : 0,
                    avgProt: averageOf(foodDays.map((d) => d.totals?.prot || 0)),
                    avgNormProt: averageOf(foodDays.map((d) => d.normAbs?.prot || 0)),
                    avgFat: averageOf(foodDays.map((d) => d.totals?.fat || 0)),
                    avgNormFat: averageOf(foodDays.map((d) => d.normAbs?.fat || 0)),
                    avgCarbs: averageOf(foodDays.map((d) => d.totals?.carbs || 0)),
                    avgNormCarbs: averageOf(foodDays.map((d) => d.normAbs?.carbs || 0)),
                    // Ни одного измеренного взвешивания — прочерк, не вес из профиля.
                    avgWeight: weights.length ? Math.round(averageOf(weights) * 10) / 10 : 0,
                    daysWithData: foodDays.length,
                    daysWithRecords: recordDays.length,
                    totalDaysPossible,
                    completenessRatio: totalDaysPossible > 0
                        ? recordDays.length / totalDaysPossible
                        : 0,
                    periodType: 'month',
                    days: allDays.slice().sort((a, b) => (a.dateStr < b.dateStr ? -1 : 1))
                },
                isCurrent: isCurrentMonth
            });
        });

        months.sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
        return months;
    }

    HEYS.monthlyReportsService = {
        buildMonthlyWeeks,
        buildMonthlyMonths,
        cache: HEYS.monthlyReportsService?.cache || null
    };
})(window);
