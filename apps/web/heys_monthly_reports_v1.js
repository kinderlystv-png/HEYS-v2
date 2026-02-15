// heys_monthly_reports_v1.js — Monthly reports (weekly cards)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    function WeekCard({ week, prevWeek, weightGoal }) {
        const h = React.createElement;
        const { useMemo, useState } = React;
        const { report, rangeLabel, isCurrent } = week;
        const daysWithData = Number.isFinite(report?.daysWithData) ? report.daysWithData : 0;
        const daysLabel = daysWithData > 0 ? ` (учтено ${daysWithData} дней)` : '';

        const formatMacroDiff = (value, norm) => {
            if (!Number.isFinite(value) || !Number.isFinite(norm) || norm === 0) return '—';
            const diff = Math.round(value - norm);
            const sign = diff > 0 ? '+' : '';
            return sign + diff;
        };

        const getMacroDiffTone = (value, norm, preferHigher) => {
            if (!Number.isFinite(value) || !Number.isFinite(norm) || norm === 0) return 'monthly-macro-diff-value--neutral';
            const diff = value - norm;
            if (diff === 0) return 'monthly-macro-diff-value--neutral';
            if (preferHigher) {
                return diff > 0 ? 'monthly-macro-diff-value--good' : 'monthly-macro-diff-value--bad';
            }
            return diff < 0 ? 'monthly-macro-diff-value--good' : 'monthly-macro-diff-value--bad';
        };

        const deficitPctClass = report.avgDeltaPct > 0
            ? 'monthly-metric-value--surplus'
            : report.avgDeltaPct < 0
                ? 'monthly-metric-value--deficit'
                : 'monthly-metric-value--neutral';

        const targetPctClass = report.targetDeficitPct > 0
            ? 'monthly-metric-value--surplus'
            : report.targetDeficitPct < 0
                ? 'monthly-metric-value--deficit'
                : 'monthly-metric-value--neutral';

        const getWeightTrend = () => {
            const currentWeight = Number.isFinite(report?.avgWeight) ? report.avgWeight : 0;
            const prevWeight = Number.isFinite(prevWeek?.report?.avgWeight) ? prevWeek.report.avgWeight : 0;

            if (!currentWeight || !prevWeight) return null;

            const diff = currentWeight - prevWeight;
            if (Math.abs(diff) < 0.05) {
                return { symbol: '→', tone: 'monthly-weight-trend--neutral', diff: 0 };
            }

            const symbol = diff > 0 ? '↑' : '↓';
            const goal = Number.isFinite(weightGoal) && weightGoal > 0 ? weightGoal : 0;
            if (!goal) {
                return { symbol, tone: 'monthly-weight-trend--neutral', diff };
            }

            const needDown = currentWeight - goal > 0.2;
            const needUp = currentWeight - goal < -0.2;
            if (needDown) {
                return { symbol, tone: diff < 0 ? 'monthly-weight-trend--good' : 'monthly-weight-trend--bad', diff };
            }
            if (needUp) {
                return { symbol, tone: diff > 0 ? 'monthly-weight-trend--good' : 'monthly-weight-trend--bad', diff };
            }

            return { symbol, tone: 'monthly-weight-trend--neutral', diff };
        };

        const weightValue = Number.isFinite(report?.avgWeight) && report.avgWeight > 0
            ? report.avgWeight
            : '—';
        const weightTrend = getWeightTrend();
        const canExpandDays = Array.isArray(report?.days) && report.days.length > 0;
        const [isExpanded, setIsExpanded] = useState(false);

        const dayRows = useMemo(() => {
            if (!Array.isArray(report?.days)) return [];

            return report.days.map((d) => {
                const date = new Date(d.dateStr);
                const dayLabel = Number.isNaN(date.getTime())
                    ? d.dateStr
                    : date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

                const burned = Number.isFinite(d.burned) && d.burned > 0
                    ? d.burned
                    : (Number.isFinite(d.optimum) ? d.optimum : 0);
                const eaten = d.totals?.kcal || 0;
                const goal = d.goalOptimum || 0;
                const targetPct = burned > 0 ? Math.round(((goal - burned) / burned) * 100) : 0;
                const factPct = burned > 0 ? Math.round(((eaten - burned) / burned) * 100) : 0;
                const hasMeals = !!d.hasMeals;
                const isIncluded = hasMeals && !(d.isToday && (d.ratio || 0) < 0.5);
                const weightMorning = Number.isFinite(d.weightMorning) && d.weightMorning > 0
                    ? Math.round(d.weightMorning * 10) / 10
                    : '—';
                const deficit = eaten - burned;

                return {
                    dateStr: d.dateStr,
                    dayLabel,
                    isToday: !!d.isToday,
                    hasMeals,
                    isIncluded,
                    burned,
                    eaten,
                    goal,
                    deficit,
                    targetPct,
                    factPct,
                    prot: d.totals?.prot || 0,
                    fat: d.totals?.fat || 0,
                    carbs: d.totals?.carbs || 0,
                    normProt: d.normAbs?.prot || 0,
                    normFat: d.normAbs?.fat || 0,
                    normCarbs: d.normAbs?.carbs || 0,
                    weightMorning
                };
            });
        }, [report]);

        const includedDayRows = useMemo(() => dayRows.filter((d) => d.isIncluded), [dayRows]);

        const breakdownTotals = useMemo(() => {
            const totals = includedDayRows.reduce((acc, d) => {
                acc.burned += d.burned || 0;
                acc.eaten += d.eaten || 0;
                acc.goal += d.goal || 0;
                acc.deficit += d.deficit || 0;
                return acc;
            }, {
                burned: 0,
                eaten: 0,
                goal: 0,
                deficit: 0
            });
            const count = includedDayRows.length || 1;
            return {
                ...totals,
                count,
                avgBurned: totals.burned / count,
                avgEaten: totals.eaten / count,
                avgGoal: totals.goal / count,
                avgDeficit: totals.deficit / count
            };
        }, [includedDayRows]);

        const getTargetToneClass = (value, target) => {
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

        const formatSignedValue = (value, suffix = '') => {
            const rounded = Math.round(value);
            const sign = rounded > 0 ? '+' : '';
            return sign + rounded + suffix;
        };

        const formatDeficitWithPct = (deficitValue, burnedValue) => {
            const pct = burnedValue ? (deficitValue / burnedValue) * 100 : 0;
            return formatSignedValue(deficitValue) + ' / ' + formatSignedValue(pct, '%');
        };

        const targetPct = report?.targetDeficitPct ?? 0;
        const avgGoalPct = breakdownTotals.avgBurned
            ? ((breakdownTotals.avgGoal - breakdownTotals.avgBurned) / breakdownTotals.avgBurned) * 100
            : 0;

        const toggleExpanded = () => {
            setIsExpanded((prev) => {
                const next = !prev;
                console.info('[HEYS.monthlyReports] ✅ Week days toggled:', {
                    week: rangeLabel,
                    expanded: next,
                    dayRows: includedDayRows.length
                });
                return next;
            });
        };

        return h('div', { className: 'monthly-week-card' + (isCurrent ? ' monthly-week-card--current' : '') },
            h('div', { className: 'monthly-week-card__header' },
                h('div', { className: 'monthly-week-card__title' }, rangeLabel + daysLabel),
                h('div', { className: 'monthly-week-card__header-actions' },
                    isCurrent && h('span', { className: 'monthly-week-card__badge' }, 'текущая'),
                    canExpandDays && h('button', {
                        type: 'button',
                        className: 'monthly-week-card__expand-btn' + (isExpanded ? ' monthly-week-card__expand-btn--open' : ''),
                        onClick: toggleExpanded,
                        'aria-expanded': isExpanded,
                        'aria-label': isExpanded ? 'Скрыть дни недели' : 'Показать дни недели'
                    },
                        h('span', { className: 'monthly-week-card__expand-btn-label' }, 'дни'),
                        h('span', { className: 'monthly-week-card__expand-btn-icon' }, isExpanded ? '▴' : '▾')
                    )
                )
            ),
            h('div', { className: 'monthly-week-card__metrics' },
                h('div', { className: 'monthly-metric-block' },
                    h('div', { className: 'monthly-metric-icon' }, '🔥'),
                    h('div', { className: 'monthly-metric-value' }, Math.round(report.avgTarget || 0)),
                    h('div', { className: 'monthly-metric-label' }, 'затраты')
                ),
                h('div', { className: 'monthly-metric-block' },
                    h('div', { className: 'monthly-metric-icon' }, '🍽️'),
                    h('div', { className: 'monthly-metric-value' }, Math.round(report.avgKcal || 0)),
                    h('div', { className: 'monthly-metric-label' }, 'съедено')
                ),
                h('div', { className: 'monthly-metric-block' },
                    h('div', { className: 'monthly-metric-icon' }, '🎯'),
                    h('div', { className: 'monthly-metric-value ' + targetPctClass },
                        (report.targetDeficitPct > 0 ? '+' : '') + report.targetDeficitPct + '%'
                    ),
                    h('div', { className: 'monthly-metric-label' }, 'цель')
                ),
                h('div', { className: 'monthly-metric-block' },
                    h('div', { className: 'monthly-metric-icon' }, '📊'),
                    h('div', { className: 'monthly-metric-value ' + deficitPctClass },
                        (report.avgDeltaPct > 0 ? '+' : '') + report.avgDeltaPct + '%'
                    ),
                    h('div', { className: 'monthly-metric-label' }, 'факт')
                ),
                h('div', { className: 'monthly-metric-block monthly-metric-block--macros' },
                    h('div', { className: 'monthly-macro-diffs' },
                        h('div', { className: 'monthly-macro-diff' },
                            h('span', { className: 'monthly-macro-diff-label' }, 'Б'),
                            h('span', { className: 'monthly-macro-diff-value ' + getMacroDiffTone(report.avgProt, report.avgNormProt, true) },
                                formatMacroDiff(report.avgProt, report.avgNormProt)
                            )
                        ),
                        h('div', { className: 'monthly-macro-diff' },
                            h('span', { className: 'monthly-macro-diff-label' }, 'Ж'),
                            h('span', { className: 'monthly-macro-diff-value ' + getMacroDiffTone(report.avgFat, report.avgNormFat, false) },
                                formatMacroDiff(report.avgFat, report.avgNormFat)
                            )
                        ),
                        h('div', { className: 'monthly-macro-diff' },
                            h('span', { className: 'monthly-macro-diff-label' }, 'У'),
                            h('span', { className: 'monthly-macro-diff-value ' + getMacroDiffTone(report.avgCarbs, report.avgNormCarbs, false) },
                                formatMacroDiff(report.avgCarbs, report.avgNormCarbs)
                            )
                        )
                    )
                ),
                h('div', { className: 'monthly-metric-block' },
                    h('div', { className: 'monthly-metric-icon' }, '⚖️'),
                    h('div', { className: 'monthly-metric-value' }, weightValue),
                    weightTrend && weightTrend.diff != null
                        ? h('div', { className: 'monthly-weight-trend-sub ' + weightTrend.tone },
                            weightTrend.symbol,
                            Math.abs(weightTrend.diff).toFixed(1)
                        )
                        : null,
                    h('div', { className: 'monthly-metric-label' }, 'средний вес')
                )
            ),
            canExpandDays && isExpanded
                ? h('div', { className: 'monthly-week-days' },
                    h('div', { className: 'weekly-wrap-breakdown monthly-week-breakdown', onClick: (e) => e.stopPropagation() },
                        h('div', { className: 'weekly-wrap-breakdown__header' },
                            h('div', { className: 'weekly-wrap-breakdown__title' }, '🧾 Дни в расчёте'),
                            h('div', { className: 'weekly-wrap-breakdown__subtitle' }, includedDayRows.length + ' дн.')
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
                            ...includedDayRows.map((day, i) => {
                                const goalPct = day.burned ? ((day.goal - day.burned) / day.burned) * 100 : 0;
                                const goalPctClass = getTargetToneClass(goalPct, targetPct);
                                const toneClass = getDeltaToneClass(day.deficit, targetPct);
                                return h('div', { key: day.dateStr || i, className: 'weekly-wrap-breakdown__row' },
                                    h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--day' }, day.dayLabel),
                                    h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(day.burned)),
                                    h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(day.eaten)),
                                    h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--goal' },
                                        Math.round(day.goal),
                                        ' ',
                                        h('span', { className: 'weekly-wrap-breakdown__goal-pct ' + goalPctClass },
                                            '(' + (goalPct > 0 ? '+' : '') + Math.round(goalPct) + '%)'
                                        )
                                    ),
                                    h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--delta ' + toneClass },
                                        formatDeficitWithPct(day.deficit, day.burned)
                                    )
                                );
                            }),
                            h('div', { className: 'weekly-wrap-breakdown__row weekly-wrap-breakdown__row--total' },
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--day' }, 'Итого в среднем'),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(breakdownTotals.avgBurned)),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(breakdownTotals.avgEaten)),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--goal' },
                                    Math.round(breakdownTotals.avgGoal),
                                    ' ',
                                    h('span', { className: 'weekly-wrap-breakdown__goal-pct ' + getTargetToneClass(avgGoalPct, targetPct) },
                                        '(' + (avgGoalPct > 0 ? '+' : '') + Math.round(avgGoalPct) + '%)'
                                    )
                                ),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--delta ' + getDeltaToneClass(breakdownTotals.avgDeficit, targetPct) },
                                    formatDeficitWithPct(breakdownTotals.avgDeficit, breakdownTotals.avgBurned)
                                )
                            )
                        )
                    )
                )
                : null
        );
    }

    function MonthlyReportsContent() {
        const { useState } = React;
        const monthlyReportsService = HEYS.monthlyReportsService;
        const monthlyWeeks = monthlyReportsService && monthlyReportsService.buildMonthlyWeeks
            ? monthlyReportsService.buildMonthlyWeeks({ weeksCount: 16, useCache: true })
            : [];
        const monthlyMonths = monthlyReportsService && monthlyReportsService.buildMonthlyMonths
            ? monthlyReportsService.buildMonthlyMonths({ weeksCount: 16, useCache: true })
            : [];
        const profile = HEYS.store?.get
            ? HEYS.store.get('heys_profile', {})
            : (HEYS.utils?.lsGet ? HEYS.utils.lsGet('heys_profile', {}) : {});
        const weightGoal = +profile.weightGoal || 0;
        const [mode, setMode] = useState('weeks');

        if (!monthlyReportsService || !monthlyReportsService.buildMonthlyWeeks) {
            return React.createElement('div', { className: 'muted' }, 'Загружаем сервис месячных отчётов...');
        }

        if (monthlyWeeks.length === 0) {
            return React.createElement('div', { className: 'muted' }, 'Добавьте минимум 2 дня с едой в неделю — и появятся отчёты');
        }

        const cards = mode === 'months' ? monthlyMonths : monthlyWeeks;
        const emptyMonths = mode === 'months' && cards.length === 0;

        return React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'monthly-reports-tabs' },
                React.createElement('button', {
                    className: 'monthly-reports-tab' + (mode === 'weeks' ? ' monthly-reports-tab--active' : ''),
                    onClick: () => setMode('weeks')
                }, 'Неделя'),
                React.createElement('button', {
                    className: 'monthly-reports-tab' + (mode === 'months' ? ' monthly-reports-tab--active' : ''),
                    onClick: () => setMode('months')
                }, 'Месяц')
            ),
            emptyMonths
                ? React.createElement('div', { className: 'muted' }, 'Для месячных отчётов нужно минимум 4 недели данных')
                : React.createElement('div', { className: 'monthly-reports-grid' },
                    ...cards.map((week, i) => React.createElement(WeekCard, {
                        key: i,
                        week,
                        prevWeek: cards[i + 1],
                        weightGoal
                    }))
                )
        );
    }

    HEYS.monthlyReports = {
        MonthlyReportsContent
    };
})(window);
