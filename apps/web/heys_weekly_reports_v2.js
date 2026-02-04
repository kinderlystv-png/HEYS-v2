// heys_weekly_reports_v2.js — Weekly reports v2 + Weekly Wrap popup

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    const U = HEYS.utils || {};
    const Sparklines = HEYS.SparklinesShared || {};

    const WEEKLY_WRAP_MIN_DAYS = 3;
    const WEEKLY_WRAP_MAX_WEEKS = 26;

    function getLsGet() {
        return (k, d) => {
            try {
                if (HEYS.store?.get) return HEYS.store.get(k, d);
                if (U.lsGet) return U.lsGet(k, d);
                const raw = localStorage.getItem(k);
                return raw ? JSON.parse(raw) : d;
            } catch (e) {
                return d;
            }
        };
    }

    function getLsSet() {
        return (k, v) => {
            try {
                if (HEYS.store?.set) {
                    HEYS.store.set(k, v);
                    return;
                }
                if (U.lsSet) {
                    U.lsSet(k, v);
                    return;
                }
                localStorage.setItem(k, JSON.stringify(v));
            } catch (e) { }
        };
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function getWeekKey(date) {
        const d = new Date(date);
        const week = getWeekNumber(d);
        return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
    }

    function getLastWeekAnchorDate(now = new Date()) {
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        return lastWeek.toISOString().split('T')[0];
    }

    function getAvailableWeeklyWraps({ lsGet, profile, pIndex, now, minDays = WEEKLY_WRAP_MIN_DAYS, maxWeeks = WEEKLY_WRAP_MAX_WEEKS } = {}) {
        const getter = lsGet || getLsGet();
        const prof = profile || getter('heys_profile', {});
        const index = pIndex || HEYS.products?.buildIndex?.();
        const baseDate = now ? new Date(now) : new Date();
        const available = [];

        const todayStr = baseDate.toISOString().split('T')[0];
        const currentReport = buildWeekReport({
            dateStr: todayStr,
            endDateStr: todayStr,
            lsGet: getter,
            profile: prof,
            pIndex: index,
            filterEmptyDays: true
        });
        available.push({ anchorDate: todayStr, report: currentReport, isCurrent: true });

        for (let i = 0; i < maxWeeks; i += 1) {
            const anchor = new Date(baseDate);
            anchor.setDate(anchor.getDate() - 7 - i * 7);
            const anchorDate = anchor.toISOString().split('T')[0];
            const report = buildWeekReport({ dateStr: anchorDate, lsGet: getter, profile: prof, pIndex: index });
            if (report?.daysWithData >= minDays) {
                available.push({ anchorDate, report, isPrevious: i === 0 });
            }
        }

        return available;
    }

    function getDayTotals(day, pIndex) {
        if (HEYS.dayCalculations?.calculateDayTotals) {
            return HEYS.dayCalculations.calculateDayTotals(day, pIndex);
        }
        return day?.dayTot || { kcal: 0, carbs: 0, prot: 0, fat: 0 };
    }

    function getDayOptimum(day, profile, lsGet, pIndex) {
        if (HEYS.TDEE?.calculate) {
            const result = HEYS.TDEE.calculate(day, profile, { lsGet, pIndex }) || {};
            return result.optimum || 0;
        }
        return 0;
    }

    function buildWeekReport({ dateStr, lsGet, profile, pIndex, endDateStr, filterEmptyDays = false }) {
        const anchor = dateStr ? new Date(dateStr) : new Date();
        const allDates = Sparklines.getWeekDates ? Sparklines.getWeekDates(anchor) : [];
        const dates = endDateStr ? allDates.filter((d) => d <= endDateStr) : allDates;
        const todayStr = new Date().toISOString().split('T')[0];
        const dayUtils = HEYS.dayUtils || {};
        const products = HEYS.products?.getAll?.() || [];
        const normPerc = lsGet('heys_norms', {});

        const days = dates.map((dstr) => {
            const day = lsGet('heys_dayv2_' + dstr, null) || { date: dstr };
            const hasMeals = Array.isArray(day.meals) && day.meals.some((m) => (m.items || []).length > 0);
            const totals = getDayTotals(day, pIndex);
            const optimum = getDayOptimum(day, profile, lsGet, pIndex);
            let goalOptimum = day?.savedDisplayOptimum > 0 ? day.savedDisplayOptimum : optimum;
            if (day?.isRefeedDay && HEYS.Refeed && !(day?.savedDisplayOptimum > 0)) {
                goalOptimum = HEYS.Refeed.getRefeedOptimum(optimum, true);
            }
            const normAbs = HEYS.dayCalculations?.computeDailyNorms
                ? HEYS.dayCalculations.computeDailyNorms(goalOptimum, normPerc)
                : { carbs: 0, prot: 0, fat: 0 };
            const ratio = goalOptimum ? (totals?.kcal || 0) / goalOptimum : 0;
            const isToday = dstr === todayStr;

            return {
                dateStr: dstr,
                hasMeals,
                totals,
                optimum,
                goalOptimum,
                normAbs,
                ratio,
                isToday,
                deficitPct: day.deficitPct,
                steps: day.steps || 0,
                sleepHours: day.sleepHours || 0,
                trainings: Array.isArray(day.trainings) ? day.trainings : []
            };
        });

        const todayDay = days.find((d) => d.isToday) || null;
        const todayExcluded = !!(filterEmptyDays && todayDay && todayDay.ratio < 0.5);
        const visibleDays = filterEmptyDays
            ? days.filter((d) => d.hasMeals && (!d.isToday || d.ratio >= 0.5))
            : days;
        const daysWithData = filterEmptyDays ? visibleDays.length : days.filter((d) => d.hasMeals).length;
        const totalKcal = visibleDays.reduce((s, d) => s + (d.totals?.kcal || 0), 0);
        const totalTarget = visibleDays.reduce((s, d) => s + (d.goalOptimum || 0), 0);
        const avgKcal = daysWithData ? Math.round(totalKcal / daysWithData) : 0;
        const avgOptimum = daysWithData ? Math.round(totalTarget / daysWithData) : 0;
        let avgTarget = avgOptimum;
        const avgSteps = daysWithData ? Math.round(visibleDays.reduce((s, d) => s + (d.steps || 0), 0) / daysWithData) : 0;
        const avgSleep = daysWithData
            ? Math.round((visibleDays.reduce((s, d) => s + (d.sleepHours || 0), 0) / daysWithData) * 10) / 10
            : 0;
        const trainingDays = visibleDays.filter((d) => d.trainings?.length > 0).length;

        const totalDeltaKcal = visibleDays.reduce((s, d) => s + ((d.totals?.kcal || 0) - (d.optimum || 0)), 0);
        const avgDeltaKcal = daysWithData ? Math.round(totalDeltaKcal / daysWithData) : 0;

        const totalProt = visibleDays.reduce((s, d) => s + (d.totals?.prot || 0), 0);
        const totalFat = visibleDays.reduce((s, d) => s + (d.totals?.fat || 0), 0);
        const totalCarbs = visibleDays.reduce((s, d) => s + (d.totals?.carbs || 0), 0);

        const totalProtNorm = visibleDays.reduce((s, d) => s + (d.normAbs?.prot || 0), 0);
        const totalFatNorm = visibleDays.reduce((s, d) => s + (d.normAbs?.fat || 0), 0);
        const totalCarbsNorm = visibleDays.reduce((s, d) => s + (d.normAbs?.carbs || 0), 0);

        const avgProt = daysWithData ? Math.round(totalProt / daysWithData) : 0;
        const avgFat = daysWithData ? Math.round(totalFat / daysWithData) : 0;
        const avgCarbs = daysWithData ? Math.round(totalCarbs / daysWithData) : 0;

        const avgNormProt = daysWithData ? Math.round(totalProtNorm / daysWithData) : 0;
        const avgNormFat = daysWithData ? Math.round(totalFatNorm / daysWithData) : 0;
        const avgNormCarbs = daysWithData ? Math.round(totalCarbsNorm / daysWithData) : 0;

        let totalBurned = 0;
        let totalTargetDeficit = 0;
        let daysWithBurned = 0;

        visibleDays.forEach((d) => {
            if (!d.hasMeals) return;
            const dayData = lsGet('heys_dayv2_' + d.dateStr, null) || { date: d.dateStr };
            const tdeeInfo = dayUtils.getDayTdee
                ? dayUtils.getDayTdee(d.dateStr, profile, { includeNDTE: true, dayData, pIndex, products })
                : (HEYS.TDEE?.calculate ? (HEYS.TDEE.calculate(dayData, profile, { lsGet, includeNDTE: true, pIndex }) || {}) : null);
            const burned = tdeeInfo?.tdee || d.optimum || 0;
            d.burned = burned;
            if (burned > 0) {
                totalBurned += burned;
                const goal = d.goalOptimum || 0;
                const targetPctFromGoal = goal > 0 ? ((goal - burned) / burned) * 100 : null;
                totalTargetDeficit += (Number.isFinite(targetPctFromGoal)
                    ? targetPctFromGoal
                    : (tdeeInfo?.deficitPct != null
                        ? tdeeInfo.deficitPct
                        : (d.deficitPct != null ? d.deficitPct : (profile?.deficitPctTarget || 0))));
                daysWithBurned += 1;
            }
        });

        if (daysWithBurned > 0) {
            avgTarget = Math.round(totalBurned / daysWithBurned);
        }

        const avgDeltaPct = totalBurned ? Math.round(((totalKcal - totalBurned) / totalBurned) * 100) : 0;
        const targetDeficitPct = daysWithBurned
            ? Math.round(totalTargetDeficit / daysWithBurned)
            : (profile?.deficitPctTarget ?? 0);

        const ratios = visibleDays.map((d) => (d.goalOptimum ? (d.totals?.kcal || 0) / d.goalOptimum : 0));
        let bestDay = null;
        let minDelta = Infinity;
        visibleDays.forEach((d, idx) => {
            if (!d.hasMeals || !d.goalOptimum) return;
            const delta = Math.abs(ratios[idx] - 1);
            if (delta < minDelta) {
                minDelta = delta;
                bestDay = d;
            }
        });

        const series = {
            values: visibleDays.map((d) => d.totals?.kcal || 0),
            targets: visibleDays.map((d) => d.goalOptimum || 0),
            labels: filterEmptyDays ? visibleDays.map((d) => d.dateStr) : dates
        };

        // Debug snapshot: Weekly Wrap totals vs burned (без логов)
        try {
            HEYS.debugData = HEYS.debugData || {};
            HEYS.debugData.weeklyWrapData = {
                dateStr,
                endDateStr: endDateStr || null,
                filterEmptyDays: !!filterEmptyDays,
                todayExcluded,
                daysWithData,
                totalKcal,
                totalTarget,
                totalBurned,
                avgDeltaPct,
                targetDeficitPct,
                visibleDays: visibleDays.map((d) => ({
                    dateStr: d.dateStr,
                    kcal: d.totals?.kcal || 0,
                    optimum: d.goalOptimum || 0,
                    ratio: d.ratio,
                    isToday: d.isToday,
                    hasMeals: d.hasMeals
                }))
            };
        } catch (e) { }

        return {
            dates,
            rangeLabel: Sparklines.formatDateRange ? Sparklines.formatDateRange(dates) : '',
            days,
            daysWithData,
            totalKcal,
            totalTarget,
            avgKcal,
            avgOptimum,
            avgTarget,
            avgSteps,
            avgSleep,
            trainingDays,
            avgDeltaKcal,
            avgDeltaPct,
            targetDeficitPct,
            avgProt,
            avgFat,
            avgCarbs,
            avgNormProt,
            avgNormFat,
            avgNormCarbs,
            todayExcluded,
            series,
            bestDay
        };
    }

    function shouldShowWeeklyWrapPopup({ now = new Date(), lsGet, dateStr, minDays = WEEKLY_WRAP_MIN_DAYS }) {
        const dayOfWeek = now.getDay();
        const hour = now.getHours();

        if (dayOfWeek !== 1 || hour < 9) {
            return false;
        }

        const lastShownKey = 'heys_weekly_wrap_last_shown_v2';
        const lastShown = lsGet(lastShownKey, null);
        const key = getWeekKey(now);

        if (lastShown === key) {
            return false;
        }

        if (dateStr) {
            const report = buildWeekReport({ dateStr, lsGet, profile: lsGet('heys_profile', {}), pIndex: HEYS.products?.buildIndex?.() });
            if (report.daysWithData < minDays) return false;
        }

        return true;
    }

    function markWeeklyWrapShown({ lsSet, date } = {}) {
        const setter = lsSet || getLsSet();
        const key = getWeekKey(date || new Date());
        setter('heys_weekly_wrap_last_shown_v2', key);
    }

    function WeeklyReportCard({ lsGet, profile, pIndex, anchorDate }) {
        const React = global.React;
        if (!React) return null;

        const { createElement: h, useMemo } = React;

        const report = useMemo(() => {
            const getter = lsGet || getLsGet();
            const prof = profile || getter('heys_profile', {});
            const index = pIndex || HEYS.products?.buildIndex?.();
            return buildWeekReport({ dateStr: anchorDate, lsGet: getter, profile: prof, pIndex: index });
        }, [lsGet, profile, pIndex, anchorDate]);

        if (!report || report.daysWithData === 0) {
            return h('div', { className: 'weekly-report-card weekly-report-card--empty' },
                h('div', { className: 'weekly-report-card__title' }, 'Неделя без данных'),
                h('div', { className: 'weekly-report-card__subtitle' }, 'Добавьте 3+ дня, чтобы увидеть итоги')
            );
        }

        return h('div', { className: 'weekly-report-card' },
            h('div', { className: 'weekly-report-card__header' },
                h('div', { className: 'weekly-report-card__title' }, 'Итоги недели'),
                h('div', { className: 'weekly-report-card__range' }, report.rangeLabel)
            ),
            h('div', { className: 'weekly-report-card__stats' },
                h('div', { className: 'weekly-report-card__stat' },
                    h('div', { className: 'weekly-report-card__stat-value' }, report.daysWithData),
                    h('div', { className: 'weekly-report-card__stat-label' }, 'дней с едой')
                ),
                h('div', { className: 'weekly-report-card__stat' },
                    h('div', { className: 'weekly-report-card__stat-value' }, report.avgKcal),
                    h('div', { className: 'weekly-report-card__stat-label' }, 'ккал/день')
                ),
                h('div', { className: 'weekly-report-card__stat' },
                    h('div', { className: 'weekly-report-card__stat-value' }, Math.round(report.avgTarget || 0)),
                    h('div', { className: 'weekly-report-card__stat-label' }, 'затраты')
                )
            ),
            h('div', { className: 'weekly-report-card__sparkline' },
                Sparklines.renderMiniSparkline?.({
                    React,
                    values: report.series.values,
                    targets: report.series.targets,
                    width: 240,
                    height: 54,
                    className: 'weekly-report-card__sparkline-svg'
                })
            ),
            h('div', { className: 'weekly-report-card__meta' },
                h('div', { className: 'weekly-report-card__meta-item' }, '👣 ', report.avgSteps, ' шагов'),
                h('div', { className: 'weekly-report-card__meta-item' }, '😴 ', report.avgSleep, ' ч сна'),
                h('div', { className: 'weekly-report-card__meta-item' }, '💪 ', report.trainingDays, ' тренировок')
            )
        );
    }

    function WeeklyWrapStep({ data }) {
        const React = global.React;
        if (!React) return null;
        const { createElement: h, useMemo, useState } = React;
        const { PopupWithBackdrop, PopupCloseButton } = HEYS.dayPopups || {};
        const haptic = HEYS.dayUtils?.haptic || (() => { });
        const formatDateDisplay = HEYS.dayUtils?.formatDateDisplay;

        const availableWeeks = useMemo(() => {
            const getter = getLsGet();
            const profile = getter('heys_profile', {});
            const pIndex = HEYS.products?.buildIndex?.();
            return getAvailableWeeklyWraps({ lsGet: getter, profile, pIndex });
        }, []);

        const [weekIndex, setWeekIndex] = useState(0);
        const [weekBreakdownPopup, setWeekBreakdownPopup] = useState(false);
        const currentWeek = availableWeeks[weekIndex] || null;
        const report = currentWeek?.report || null;
        const isCurrent = !!currentWeek?.isCurrent;
        const isPrevious = !!currentWeek?.isPrevious;
        const minDaysForView = isCurrent ? 1 : WEEKLY_WRAP_MIN_DAYS;
        const hintText = isCurrent
            ? 'Текущая неделя: показываем дни с приёмами (пн–сегодня). Сегодня учитываем после 50% нормы.'
            : 'Завершённая неделя (пн–вс)';

        const canGoPrev = weekIndex < availableWeeks.length - 1;
        const canGoNext = weekIndex > 0;
        const handlePrevWeek = () => setWeekIndex((prev) => (prev < availableWeeks.length - 1 ? prev + 1 : prev));
        const handleNextWeek = () => setWeekIndex((prev) => (prev > 0 ? prev - 1 : prev));

        const deltaPct = report?.avgDeltaPct ?? 0;
        const targetPct = report?.targetDeficitPct ?? 0;
        const avgOptimum = report?.avgOptimum ?? 0;
        const avgTargetRounded = Math.round(report?.avgTarget ?? 0);
        // Реальный дефицит от затрат = (затраты - съедено) / затраты * 100
        const realDeficitPct = avgTargetRounded && report?.avgKcal != null
            ? Math.round(((avgTargetRounded - report.avgKcal) / avgTargetRounded) * 100)
            : 0;
        const realDeficitLabel = realDeficitPct === 0
            ? 'баланс'
            : (realDeficitPct > 0 ? 'дефицит' : 'профицит') + ' ' + Math.abs(realDeficitPct) + '%';

        const includedDays = useMemo(() => {
            if (!report?.days) return [];
            return report.days.filter((d) => d.hasMeals && (!d.isToday || d.ratio >= 0.5));
        }, [report]);

        const breakdownTotals = useMemo(() => {
            const totals = includedDays.reduce((acc, d) => {
                const eaten = d.totals?.kcal || 0;
                const goal = d.goalOptimum || 0;
                const burned = d.burned || 0;
                const deficit = eaten - burned;
                acc.eaten += eaten;
                acc.goal += goal;
                acc.burned += burned;
                acc.deficit += deficit;
                return acc;
            }, {
                eaten: 0,
                goal: 0,
                burned: 0,
                deficit: 0
            });
            const count = includedDays.length || 1;
            return {
                ...totals,
                count,
                avgEaten: totals.eaten / count,
                avgGoal: Math.round(totals.goal / count),
                avgBurned: totals.burned / count,
                avgDeficit: totals.deficit / count
            };
        }, [includedDays]);

        const openWeekBreakdown = (e) => {
            if (!PopupWithBackdrop || includedDays.length === 0) return;
            e.stopPropagation();
            haptic('light');
            setWeekBreakdownPopup(true);
        };

        const handleBreakdownKey = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openWeekBreakdown(e);
            }
        };

        const getDayLabels = (dateStr) => {
            if (formatDateDisplay) {
                const meta = formatDateDisplay(dateStr);
                return { primary: meta?.label || dateStr, secondary: meta?.sub || '' };
            }
            return { primary: dateStr, secondary: '' };
        };

        const getDeltaPctClass = (delta, target) => {
            if (!Number.isFinite(delta) || !Number.isFinite(target)) {
                return 'weekly-wrap-step__delta-pct--equal';
            }

            const targetAbs = Math.abs(target);
            const hasTarget = targetAbs >= 1;

            if (!hasTarget) {
                if (delta === 0) return 'weekly-wrap-step__delta-pct--equal';
                return delta > 0
                    ? 'weekly-wrap-step__delta-pct--above'
                    : 'weekly-wrap-step__delta-pct--below';
            }

            if (delta === 0) return 'weekly-wrap-step__delta-pct--warn';

            if (Math.sign(delta) !== Math.sign(target)) {
                return 'weekly-wrap-step__delta-pct--above';
            }

            const deltaAbs = Math.abs(delta);
            const greenMin = targetAbs * 0.55;
            const greenMax = targetAbs * 1.25;

            if (deltaAbs >= greenMin && deltaAbs <= greenMax) {
                return 'weekly-wrap-step__delta-pct--below';
            }

            return 'weekly-wrap-step__delta-pct--warn';
        };

        const deltaPctClass = getDeltaPctClass(deltaPct, targetPct);

        const getTargetToneClass = (value, target) => {
            if (!Number.isFinite(value)) return 'weekly-wrap-step__delta-value--neutral';
            if (value === 0) return 'weekly-wrap-step__delta-value--neutral';
            if (target > 0) {
                return value > 0
                    ? 'weekly-wrap-step__delta-value--good'
                    : 'weekly-wrap-step__delta-value--bad';
            }
            if (target < 0) {
                return value < 0
                    ? 'weekly-wrap-step__delta-value--good'
                    : 'weekly-wrap-step__delta-value--bad';
            }
            return value < 0
                ? 'weekly-wrap-step__delta-value--good'
                : 'weekly-wrap-step__delta-value--bad';
        };

        const deltaToneClass = getTargetToneClass(deltaPct, targetPct);
        const targetToneClass = getTargetToneClass(targetPct, targetPct);
        const avgGoalPct = breakdownTotals.avgBurned
            ? ((breakdownTotals.avgGoal - breakdownTotals.avgBurned) / breakdownTotals.avgBurned) * 100
            : 0;
        const avgGoalPctClass = getTargetToneClass(avgGoalPct, targetPct);

        const formatSignedValue = (value, suffix = '') => {
            const rounded = Math.round(value);
            const sign = rounded > 0 ? '+' : '';
            return sign + rounded + suffix;
        };

        const formatDeficitWithPct = (deficitValue, burnedValue) => {
            const pct = burnedValue ? (deficitValue / burnedValue) * 100 : 0;
            return formatSignedValue(deficitValue) + ' / ' + formatSignedValue(pct, '%');
        };

        const getDeltaToneClass = (value, target) => {
            if (!Number.isFinite(value)) return 'weekly-wrap-breakdown__value--neutral';
            if (value === 0) return 'weekly-wrap-breakdown__value--neutral';
            if (target > 0) {
                return value > 0
                    ? 'weekly-wrap-breakdown__value--good'
                    : 'weekly-wrap-breakdown__value--bad';
            }
            if (target < 0) {
                return value < 0
                    ? 'weekly-wrap-breakdown__value--good'
                    : 'weekly-wrap-breakdown__value--bad';
            }
            return value < 0
                ? 'weekly-wrap-breakdown__value--good'
                : 'weekly-wrap-breakdown__value--bad';
        };

        const avgProt = report?.avgProt ?? 0;
        const avgFat = report?.avgFat ?? 0;
        const avgCarbs = report?.avgCarbs ?? 0;
        const avgNormProt = report?.avgNormProt ?? 0;
        const avgNormFat = report?.avgNormFat ?? 0;
        const avgNormCarbs = report?.avgNormCarbs ?? 0;

        const buildMacroRing = (label, value, norm, toneClass) => {
            const ratio = norm > 0 ? value / norm : 0;
            // Основная дуга: от 0 до min(100%, ratio)
            const basePct = Math.min(100, Math.round(ratio * 100));
            // Перебор: от 100% до ratio (если ratio > 1)
            const hasOver = ratio > 1;
            const overPct = hasOver ? Math.min(50, Math.round((ratio - 1) * 100)) : 0; // max 150% визуально

            return h('div', { className: 'macro-ring-item' },
                h('div', { className: 'macro-ring ' + toneClass + (hasOver ? ' macro-ring--over' : '') },
                    h('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                        // Фоновый трек
                        h('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                        // Основная дуга (до 100%)
                        h('circle', {
                            className: 'macro-ring-fill',
                            cx: 18, cy: 18, r: 15.9,
                            style: { strokeDasharray: basePct + ' 100' }
                        }),
                        // Красная дуга перебора (от 100% дальше)
                        hasOver && h('circle', {
                            className: 'macro-ring-fill--over',
                            cx: 18, cy: 18, r: 15.9,
                            style: {
                                strokeDasharray: overPct + ' ' + (100 - overPct),
                                strokeDashoffset: -100,  // начинается с позиции 100%
                                stroke: '#ef4444'
                            }
                        }),
                        // Чёрная линия-маркер на позиции 100% (норма)
                        hasOver && h('line', {
                            className: 'macro-ring-norm-marker',
                            x1: 18, y1: 2,   // верх круга (после rotate -90deg = позиция 100%)
                            x2: 18, y2: 6
                        })
                    ),
                    h('span', { className: 'macro-ring-value' }, Math.round(value || 0))
                ),
                h('span', { className: 'macro-ring-label' }, label),
                h('span', { className: 'macro-ring-target' }, '/ ' + Math.round(norm || 0) + 'г')
            );
        };

        return h('div', { className: 'weekly-wrap-step' },
            h('div', { className: 'weekly-wrap-step__title' }, '📊 Итоги недели'),
            h('div', { className: 'weekly-wrap-step__nav' },
                h('button', {
                    className: 'weekly-wrap-step__nav-btn' + (canGoPrev ? '' : ' is-disabled'),
                    onClick: handlePrevWeek,
                    disabled: !canGoPrev,
                    title: 'Прошлая неделя'
                }, '←'),
                h('div', { className: 'weekly-wrap-step__nav-range' },
                    isPrevious ? h('div', { className: 'weekly-wrap-step__nav-subtitle' }, 'Прошлая неделя') : null,
                    h('div', { className: 'weekly-wrap-step__nav-range-line' },
                        h('span', { className: 'weekly-wrap-step__range-text' }, report?.rangeLabel || 'Неделя'),
                        isCurrent ? h('span', { className: 'weekly-wrap-step__badge weekly-wrap-step__badge--current' }, 'ТЕКУЩАЯ') : null,
                        isCurrent && report?.todayExcluded
                            ? h('span', { className: 'weekly-wrap-step__badge weekly-wrap-step__badge--excluded' }, 'СЕГОДНЯ НЕ УЧТЁН')
                            : null
                    )
                ),
                h('button', {
                    className: 'weekly-wrap-step__nav-btn' + (canGoNext ? '' : ' is-disabled'),
                    onClick: handleNextWeek,
                    disabled: !canGoNext,
                    title: 'Следующая неделя'
                }, '→')
            ),
            h('div', { className: 'weekly-wrap-step__hint' }, hintText),
            report && report.daysWithData >= minDaysForView
                ? h('div', { className: 'weekly-wrap-step__content' },
                    h('div', { className: 'weekly-wrap-step__stats' },
                        h('div', {
                            className: 'weekly-wrap-step__stat weekly-wrap-step__stat--goal weekly-wrap-step__stat--clickable',
                            role: 'button',
                            tabIndex: 0,
                            onClick: openWeekBreakdown,
                            onKeyDown: handleBreakdownKey,
                            title: 'Показать дни в расчёте'
                        },
                            h('div', { className: 'weekly-wrap-step__stat-value' }, avgTargetRounded),
                            h('div', { className: 'weekly-wrap-step__stat-label' }, 'потрачено')
                        ),
                        h('div', {
                            className: 'weekly-wrap-step__stat weekly-wrap-step__stat--fact weekly-wrap-step__stat--clickable',
                            role: 'button',
                            tabIndex: 0,
                            onClick: openWeekBreakdown,
                            onKeyDown: handleBreakdownKey,
                            title: 'Показать дни в расчёте'
                        },
                            h('div', { className: 'weekly-wrap-step__stat-value' }, report.avgKcal),
                            h('div', { className: 'weekly-wrap-step__stat-label' }, 'съедено')
                        ),
                        h('div', {
                            className: 'weekly-wrap-step__stat weekly-wrap-step__stat--plan weekly-wrap-step__stat--clickable',
                            role: 'button',
                            tabIndex: 0,
                            onClick: openWeekBreakdown,
                            onKeyDown: handleBreakdownKey,
                            title: 'Показать дни в расчёте'
                        },
                            h('div', { className: 'weekly-wrap-step__stat-value' }, avgOptimum),
                            h('div', { className: 'weekly-wrap-step__stat-label' }, 'цель')
                        ),
                        h('div', { className: 'weekly-wrap-step__stat weekly-wrap-step__stat--days' },
                            h('div', { className: 'weekly-wrap-step__stat-value' }, report.daysWithData),
                            h('div', { className: 'weekly-wrap-step__stat-label weekly-wrap-step__stat-label--days' }, 'дней с едой')
                        ),
                        h('div', { className: 'weekly-wrap-step__stat weekly-wrap-step__stat--delta' },
                            h('div', { className: 'weekly-wrap-step__stat-label weekly-wrap-step__stat-label--delta' },
                                deltaPct > 0
                                    ? 'Фактический профицит составил'
                                    : deltaPct < 0
                                        ? 'Фактический дефицит составил'
                                        : 'Фактический баланс'
                            ),
                            h('div', {
                                className: 'weekly-wrap-step__stat-value weekly-wrap-step__delta-value ' + deltaToneClass
                            }, (deltaPct > 0 ? '+' : '') + deltaPct + '%'),
                            h('div', { className: 'weekly-wrap-step__stat-sub' },
                                h('span', { className: 'weekly-wrap-step__delta-target' },
                                    '(цель средняя ',
                                    h('span', { className: 'weekly-wrap-step__delta-target-value ' + targetToneClass },
                                        (targetPct > 0 ? '+' : '') + targetPct + '%'
                                    ),
                                    ')'
                                )
                            )
                        )
                    ),
                    h('div', { className: 'weekly-wrap-step__macros' },
                        h('div', { className: 'weekly-wrap-step__macros-header' },
                            h('span', { className: 'weekly-wrap-step__macros-title' }, 'Средние БЖУ'),
                            h('span', { className: 'weekly-wrap-step__macros-subtitle' }, 'г/день')
                        ),
                        h('div', { className: 'weekly-wrap-step__macros-rings macro-rings' },
                            buildMacroRing('Белки', avgProt, avgNormProt, 'protein'),
                            buildMacroRing('Жиры', avgFat, avgNormFat, 'fat'),
                            buildMacroRing('Углеводы', avgCarbs, avgNormCarbs, 'carbs')
                        )
                    ),
                    h('div', { className: 'weekly-wrap-step__sparkline' },
                        Sparklines.renderMiniSparkline?.({
                            React,
                            values: report.series.values,
                            targets: report.series.targets,
                            width: 260,
                            height: 64,
                            padding: 6,
                            className: 'weekly-wrap-step__sparkline-svg',
                            useTargetGradient: true,
                            fillTargetGradient: true,
                            showPeakDots: true
                        })
                    ),
                    h('div', { className: 'weekly-wrap-step__meta' },
                        h('div', { className: 'weekly-wrap-step__meta-item' }, '👣 ', report.avgSteps, ' шагов'),
                        h('div', { className: 'weekly-wrap-step__meta-item' }, '😴 ', report.avgSleep, ' ч сна'),
                        h('div', { className: 'weekly-wrap-step__meta-item' }, '💪 ', report.trainingDays, ' тренировок')
                    )
                )
                : h('div', { className: 'weekly-wrap-step__empty' },
                    h('div', { className: 'weekly-wrap-step__subtitle' }, 'Собираем данные недели'),
                    h('div', { className: 'weekly-wrap-step__meta-item' },
                        isCurrent
                            ? 'Сегодня учитываем после 50% нормы, добавьте ещё еды — и появятся итоги'
                            : 'Добавьте 3 дня с едой — и итоги появятся автоматически'
                    )
                ),
            weekBreakdownPopup && PopupWithBackdrop && PopupWithBackdrop({
                onClose: () => setWeekBreakdownPopup(false),
                children: h('div', {
                    className: 'weekly-wrap-breakdown',
                    role: 'dialog',
                    'aria-modal': 'true',
                    'aria-label': 'Дни, участвующие в расчёте',
                    onClick: (e) => e.stopPropagation()
                },
                    h('div', { className: 'weekly-wrap-breakdown__header' },
                        h('div', { className: 'weekly-wrap-breakdown__title' }, '🧾 Дни в расчёте'),
                        h('div', { className: 'weekly-wrap-breakdown__subtitle' }, includedDays.length + ' дн.')
                    ),
                    report?.todayExcluded && h('div', { className: 'weekly-wrap-breakdown__note' },
                        'Сегодня не учтён: менее 50% нормы'
                    ),
                    h('div', { className: 'weekly-wrap-breakdown__table' },
                        h('div', { className: 'weekly-wrap-breakdown__row weekly-wrap-breakdown__row--head' },
                            h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--day' }, 'День'),
                            h('span', { className: 'weekly-wrap-breakdown__cell' }, 'Затраты'),
                            h('span', { className: 'weekly-wrap-breakdown__cell' }, 'Съедено'),
                            h('span', { className: 'weekly-wrap-breakdown__cell' }, 'Цель'),
                            h('span', { className: 'weekly-wrap-breakdown__cell' }, 'Дефицит', h('br'), 'от потрач.')
                        ),
                        includedDays.map((d, i) => {
                            const labels = getDayLabels(d.dateStr);
                            const dayText = labels.secondary ? labels.primary + ' · ' + labels.secondary : labels.primary;
                            const eaten = d.totals?.kcal || 0;
                            const goal = d.goalOptimum || 0;
                            const burned = d.burned || 0;
                            const deficit = eaten - burned;
                            const goalPct = burned ? ((goal - burned) / burned) * 100 : 0;
                            const goalPctClass = getTargetToneClass(goalPct, targetPct);
                            const toneClass = getDeltaToneClass(deficit, targetPct);
                            return h('div', { key: i, className: 'weekly-wrap-breakdown__row' },
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--day' }, dayText),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(burned)),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(eaten)),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--goal' },
                                    Math.round(goal),
                                    ' ',
                                    h('span', { className: 'weekly-wrap-breakdown__goal-pct ' + goalPctClass },
                                        '(' + (goalPct > 0 ? '+' : '') + Math.round(goalPct) + '%)'
                                    )
                                ),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--delta ' + toneClass }, formatDeficitWithPct(deficit, burned))
                            );
                        }),
                        h('div', { className: 'weekly-wrap-breakdown__row weekly-wrap-breakdown__row--total' },
                            h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--day' }, 'Итого в среднем'),
                            h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(breakdownTotals.avgBurned)),
                            h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(breakdownTotals.avgEaten)),
                            h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--goal' },
                                Math.round(breakdownTotals.avgGoal),
                                ' ',
                                h('span', {
                                    className: 'weekly-wrap-breakdown__goal-pct ' + avgGoalPctClass
                                },
                                    '(' + (avgGoalPct > 0 ? '+' : '') + Math.round(avgGoalPct) + '%)'
                                )
                            ),
                            h('span', {
                                className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--delta ' + getDeltaToneClass(breakdownTotals.avgDeficit, targetPct)
                            }, formatDeficitWithPct(breakdownTotals.avgDeficit, breakdownTotals.avgBurned))
                        )
                    ),
                    PopupCloseButton
                        ? h(PopupCloseButton, { onClose: () => setWeekBreakdownPopup(false), className: 'weekly-wrap-breakdown__close' })
                        : h('button', {
                            className: 'weekly-wrap-breakdown__close',
                            onClick: (e) => {
                                e.stopPropagation();
                                setWeekBreakdownPopup(false);
                            }
                        }, '✕')
                )
            })
        );
    }

    function registerWeeklyWrapStep() {
        if (!HEYS.StepModal?.registerStep || !global.React) return false;

        HEYS.StepModal.registerStep('weekly_wrap_v2', {
            title: 'Итоги недели',
            subtitle: 'Сводка за последние 7 дней',
            nextLabel: 'Закрыть',
            hideHeaderNext: false,
            component: WeeklyWrapStep,
            getInitialData: () => {
                const lsGet = getLsGet();
                const profile = lsGet('heys_profile', {});
                const pIndex = HEYS.products?.buildIndex?.();
                const availableWeeks = getAvailableWeeklyWraps({ lsGet, profile, pIndex });
                const report = availableWeeks[0]?.report || null;
                return { report };
            }
        });

        return true;
    }

    function maybeShowWeeklyWrap({ lsGet, profile, pIndex, date } = {}) {
        const getter = lsGet || getLsGet();
        const now = new Date();
        const anchorDate = date || getLastWeekAnchorDate(now);
        const baseNow = date ? new Date(date) : now;

        if (!shouldShowWeeklyWrapPopup({ now, lsGet: getter, dateStr: anchorDate })) {
            return false;
        }

        if (!registerWeeklyWrapStep()) {
            setTimeout(() => registerWeeklyWrapStep(), 200);
        }

        const availableWeeks = getAvailableWeeklyWraps({
            lsGet: getter,
            profile: profile || getter('heys_profile', {}),
            pIndex: pIndex || HEYS.products?.buildIndex?.(),
            now: baseNow
        });

        const report = availableWeeks[0]?.report || null;

        if (!report) {
            return false;
        }

        if (HEYS.StepModal?.show) {
            HEYS.StepModal.show({
                steps: ['weekly_wrap_v2'],
                showProgress: false,
                showGreeting: false,
                showTip: false,
                allowSwipe: false,
                context: { report }
            });
            markWeeklyWrapShown({ lsSet: getLsSet(), date: now });
            return true;
        }

        return false;
    }

    function openWeeklyWrap({ lsGet, profile, pIndex, date } = {}) {
        const getter = lsGet || getLsGet();
        const now = new Date();
        const baseNow = date ? new Date(date) : now;

        if (!registerWeeklyWrapStep()) {
            setTimeout(() => registerWeeklyWrapStep(), 200);
        }

        const availableWeeks = getAvailableWeeklyWraps({
            lsGet: getter,
            profile: profile || getter('heys_profile', {}),
            pIndex: pIndex || HEYS.products?.buildIndex?.(),
            now: baseNow
        });

        const reportForPopup = availableWeeks[0]?.report || null;

        if (HEYS.StepModal?.show) {
            HEYS.StepModal.show({
                steps: ['weekly_wrap_v2'],
                showProgress: false,
                showGreeting: false,
                showTip: false,
                allowSwipe: false,
                context: { report: reportForPopup }
            });
            return true;
        }

        return false;
    }

    HEYS.weeklyReports = {
        buildWeekReport,
        WeeklyReportCard,
        maybeShowWeeklyWrap,
        openWeeklyWrap,
        shouldShowWeeklyWrapPopup,
        markWeeklyWrapShown
    };
})(window);
