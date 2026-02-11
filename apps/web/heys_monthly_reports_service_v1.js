// heys_monthly_reports_service_v1.js — Monthly reports data builder + cache

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    function pad2(n) { return String(n).padStart(2, '0'); }
    function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

    function getClientId() {
        return HEYS.store?.getCurrentProfile?.()?.id || 'guest';
    }

    function getStorageKey(key) {
        const clientId = getClientId();
        const encrypted = ['heys_profile', 'heys_hr_zones'].includes(key) || key.startsWith('heys_dayv2_');
        return encrypted ? `${key}_${clientId}` : key;
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

    function getSignature({ weeksCount, profile, dateKeys }) {
        const parts = [
            getClientId(),
            JSON.stringify(profile || {})
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
        const pIndex = HEYS.products?.buildIndex?.();

        if (!HEYS.weeklyReports?.buildWeekReport) return [];

        const now = new Date();
        const nowDateStr = fmtDate(now);
        const dateKeys = buildDateKeys({ weeksCount, now });
        const signature = getSignature({ weeksCount, profile, dateKeys });

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

            if (report.daysWithData >= 2) {
                const dayMap = new Map(days.map((d) => [d.dateStr, d]));
                const visibleDays = (report.days || []).filter((d) => {
                    const hasMeals = d.hasMeals;
                    const isToday = d.dateStr === nowDateStr;
                    const ratio = d.ratio || 0;
                    return hasMeals && !(isToday && ratio < 0.5);
                });

                const weights = visibleDays
                    .map((d) => dayMap.get(d.dateStr)?.weightMorning)
                    .filter((w) => w && w > 0);

                const avgWeight = weights.length > 0
                    ? Math.round(weights.reduce((s, w) => s + w, 0) / weights.length * 10) / 10
                    : (profile.weight || 0);

                const mondayLabel = monday.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                const sundayLabel = sundayDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                const rangeLabel = `${mondayLabel} – ${sundayLabel}`;

                weeks.push({
                    rangeLabel,
                    monday: mondayStr,
                    sunday: sundayStr,
                    report: { ...report, avgWeight },
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

    function buildMonthlyMonths({ weeksCount = 16, useCache = true } = {}) {
        const weeks = buildMonthlyWeeks({ weeksCount, useCache });
        if (!weeks.length) return [];

        const now = new Date();
        const currentMonthKey = now.getFullYear() + '-' + pad2(now.getMonth() + 1);
        const monthMap = new Map();

        weeks.forEach((week) => {
            if (!week?.monday) return;
            const mondayDate = new Date(week.monday);
            if (Number.isNaN(mondayDate.getTime())) return;
            const key = mondayDate.getFullYear() + '-' + pad2(mondayDate.getMonth() + 1);
            if (!monthMap.has(key)) {
                monthMap.set(key, { key, weeks: [] });
            }
            monthMap.get(key).weeks.push(week);
        });

        const months = [];
        monthMap.forEach((bucket) => {
            if (!bucket?.weeks?.length) return;
            const isCurrentMonth = bucket.key === currentMonthKey;
            if (!isCurrentMonth && bucket.weeks.length < 4) return;

            const total = bucket.weeks.length;
            const sum = bucket.weeks.reduce((acc, week) => {
                const report = week.report || {};
                acc.avgTarget += report.avgTarget || 0;
                acc.avgKcal += report.avgKcal || 0;
                acc.targetDeficitPct += report.targetDeficitPct || 0;
                acc.avgDeltaPct += report.avgDeltaPct || 0;
                acc.avgProt += report.avgProt || 0;
                acc.avgNormProt += report.avgNormProt || 0;
                acc.avgFat += report.avgFat || 0;
                acc.avgNormFat += report.avgNormFat || 0;
                acc.avgCarbs += report.avgCarbs || 0;
                acc.avgNormCarbs += report.avgNormCarbs || 0;
                acc.avgWeight += report.avgWeight || 0;
                acc.daysWithData += report.daysWithData || 0;
                return acc;
            }, {
                avgTarget: 0,
                avgKcal: 0,
                targetDeficitPct: 0,
                avgDeltaPct: 0,
                avgProt: 0,
                avgNormProt: 0,
                avgFat: 0,
                avgNormFat: 0,
                avgCarbs: 0,
                avgNormCarbs: 0,
                avgWeight: 0,
                daysWithData: 0
            });

            const monthStart = new Date(bucket.weeks[bucket.weeks.length - 1].monday);
            const monthLabel = monthStart.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

            months.push({
                rangeLabel: monthLabel,
                monthKey: bucket.key,
                report: {
                    avgTarget: Math.round(sum.avgTarget / total),
                    avgKcal: Math.round(sum.avgKcal / total),
                    targetDeficitPct: Math.round(sum.targetDeficitPct / total),
                    avgDeltaPct: Math.round(sum.avgDeltaPct / total),
                    avgProt: sum.avgProt / total,
                    avgNormProt: sum.avgNormProt / total,
                    avgFat: sum.avgFat / total,
                    avgNormFat: sum.avgNormFat / total,
                    avgCarbs: sum.avgCarbs / total,
                    avgNormCarbs: sum.avgNormCarbs / total,
                    avgWeight: Math.round(sum.avgWeight / total * 10) / 10,
                    daysWithData: sum.daysWithData
                },
                isCurrent: isCurrentMonth
            });
        });

        return months;
    }

    HEYS.monthlyReportsService = {
        buildMonthlyWeeks,
        buildMonthlyMonths,
        cache: HEYS.monthlyReportsService?.cache || null
    };
})(window);
