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

        for (let i = 0; i < maxWeeks; i += 1) {
            const anchor = new Date(baseDate);
            anchor.setDate(anchor.getDate() - 7 - i * 7);
            const anchorDate = anchor.toISOString().split('T')[0];
            const report = buildWeekReport({ dateStr: anchorDate, lsGet: getter, profile: prof, pIndex: index });
            if (report?.daysWithData >= minDays) {
                available.push({ anchorDate, report });
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

    function buildWeekReport({ dateStr, lsGet, profile, pIndex }) {
        const anchor = dateStr ? new Date(dateStr) : new Date();
        const dates = Sparklines.getWeekDates ? Sparklines.getWeekDates(anchor) : [];

        const days = dates.map((dstr) => {
            const day = lsGet('heys_dayv2_' + dstr, null) || { date: dstr };
            const hasMeals = Array.isArray(day.meals) && day.meals.some((m) => (m.items || []).length > 0);
            const totals = getDayTotals(day, pIndex);
            const optimum = getDayOptimum(day, profile, lsGet, pIndex);

            return {
                dateStr: dstr,
                hasMeals,
                totals,
                optimum,
                steps: day.steps || 0,
                sleepHours: day.sleepHours || 0,
                trainings: Array.isArray(day.trainings) ? day.trainings : []
            };
        });

        const daysWithData = days.filter((d) => d.hasMeals).length;
        const totalKcal = days.reduce((s, d) => s + (d.totals?.kcal || 0), 0);
        const totalTarget = days.reduce((s, d) => s + (d.optimum || 0), 0);
        const avgKcal = daysWithData ? Math.round(totalKcal / daysWithData) : 0;
        const avgTarget = daysWithData ? Math.round(totalTarget / daysWithData) : 0;
        const avgSteps = daysWithData ? Math.round(days.reduce((s, d) => s + (d.steps || 0), 0) / daysWithData) : 0;
        const avgSleep = daysWithData
            ? Math.round((days.reduce((s, d) => s + (d.sleepHours || 0), 0) / daysWithData) * 10) / 10
            : 0;
        const trainingDays = days.filter((d) => d.trainings?.length > 0).length;

        const ratios = days.map((d) => (d.optimum ? (d.totals?.kcal || 0) / d.optimum : 0));
        let bestDay = null;
        let minDelta = Infinity;
        days.forEach((d, idx) => {
            if (!d.hasMeals || !d.optimum) return;
            const delta = Math.abs(ratios[idx] - 1);
            if (delta < minDelta) {
                minDelta = delta;
                bestDay = d;
            }
        });

        const series = {
            values: days.map((d) => d.totals?.kcal || 0),
            targets: days.map((d) => d.optimum || 0),
            labels: dates
        };

        return {
            dates,
            rangeLabel: Sparklines.formatDateRange ? Sparklines.formatDateRange(dates) : '',
            days,
            daysWithData,
            totalKcal,
            totalTarget,
            avgKcal,
            avgTarget,
            avgSteps,
            avgSleep,
            trainingDays,
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
                    h('div', { className: 'weekly-report-card__stat-value' }, report.avgTarget),
                    h('div', { className: 'weekly-report-card__stat-label' }, 'цель')
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

        const availableWeeks = useMemo(() => {
            const getter = getLsGet();
            const profile = getter('heys_profile', {});
            const pIndex = HEYS.products?.buildIndex?.();
            return getAvailableWeeklyWraps({ lsGet: getter, profile, pIndex });
        }, []);

        const [weekIndex, setWeekIndex] = useState(0);
        const currentWeek = availableWeeks[weekIndex] || null;
        const report = currentWeek?.report || null;

        const canGoPrev = weekIndex < availableWeeks.length - 1;
        const canGoNext = weekIndex > 0;
        const handlePrevWeek = () => setWeekIndex((prev) => (prev < availableWeeks.length - 1 ? prev + 1 : prev));
        const handleNextWeek = () => setWeekIndex((prev) => (prev > 0 ? prev - 1 : prev));

        return h('div', { className: 'weekly-wrap-step' },
            h('div', { className: 'weekly-wrap-step__title' }, '📊 Итоги недели'),
            h('div', { className: 'weekly-wrap-step__nav' },
                h('button', {
                    className: 'weekly-wrap-step__nav-btn' + (canGoPrev ? '' : ' is-disabled'),
                    onClick: handlePrevWeek,
                    disabled: !canGoPrev,
                    title: 'Прошлая неделя'
                }, '←'),
                h('div', { className: 'weekly-wrap-step__nav-range' }, report?.rangeLabel || 'Неделя'),
                h('button', {
                    className: 'weekly-wrap-step__nav-btn' + (canGoNext ? '' : ' is-disabled'),
                    onClick: handleNextWeek,
                    disabled: !canGoNext,
                    title: 'Следующая неделя'
                }, '→')
            ),
            h('div', { className: 'weekly-wrap-step__hint' }, 'Всегда показываем завершённые недели'),
            report && report.daysWithData >= WEEKLY_WRAP_MIN_DAYS
                ? h('div', { className: 'weekly-wrap-step__content' },
                    h('div', { className: 'weekly-wrap-step__stats' },
                        h('div', { className: 'weekly-wrap-step__stat' },
                            h('div', { className: 'weekly-wrap-step__stat-value' }, report.daysWithData),
                            h('div', { className: 'weekly-wrap-step__stat-label' }, 'дней с едой')
                        ),
                        h('div', { className: 'weekly-wrap-step__stat' },
                            h('div', { className: 'weekly-wrap-step__stat-value' }, report.avgKcal),
                            h('div', { className: 'weekly-wrap-step__stat-label' }, 'ккал/день')
                        ),
                        h('div', { className: 'weekly-wrap-step__stat' },
                            h('div', { className: 'weekly-wrap-step__stat-value' }, report.avgTarget),
                            h('div', { className: 'weekly-wrap-step__stat-label' }, 'цель')
                        )
                    ),
                    h('div', { className: 'weekly-wrap-step__sparkline' },
                        Sparklines.renderMiniSparkline?.({
                            React,
                            values: report.series.values,
                            targets: report.series.targets,
                            width: 260,
                            height: 60,
                            className: 'weekly-wrap-step__sparkline-svg'
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
                    h('div', { className: 'weekly-wrap-step__meta-item' }, 'Добавьте 3 дня с едой — и итоги появятся автоматически')
                )
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
