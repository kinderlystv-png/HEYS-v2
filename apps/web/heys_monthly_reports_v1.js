// heys_monthly_reports_v1.js — Monthly reports (weekly cards)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    const COMPLETE_RATIO_THRESHOLD = 6 / 7;
    const PARTIAL_RATIO_THRESHOLD = 4 / 7;
    const UNRELIABLE_DAYS_THRESHOLD = 4;

    function formatInt(value) {
        const n = Math.round(Number(value));
        if (!Number.isFinite(n)) return '—';
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    function formatSignedPct(value) {
        if (!Number.isFinite(value)) return '—';
        const rounded = Math.round(value);
        if (rounded > 0) return '+' + rounded + ' %';
        if (rounded < 0) return '−' + Math.abs(rounded) + ' %';
        return '0 %';
    }

    function formatWeight(value) {
        if (!Number.isFinite(value) || value <= 0) return '—';
        return value.toFixed(1).replace('.', ',');
    }

    function getCompletenessMeta(report) {
        const daysWithData = Number.isFinite(report?.daysWithRecords)
            ? report.daysWithRecords
            : (Number.isFinite(report?.daysWithData) ? report.daysWithData : 0);
        const totalDaysPossible = Number.isFinite(report?.totalDaysPossible) ? report.totalDaysPossible : 0;
        const isMonthPeriod = report?.periodType === 'month' || totalDaysPossible > 0;

        if (isMonthPeriod && totalDaysPossible > 0) {
            const ratio = daysWithData / totalDaysPossible;
            if (ratio >= COMPLETE_RATIO_THRESHOLD) {
                return { tone: 'complete', daysWithData, totalDaysPossible, isMonthPeriod };
            }
            if (ratio >= PARTIAL_RATIO_THRESHOLD) {
                return { tone: 'partial', daysWithData, totalDaysPossible, isMonthPeriod };
            }
            return { tone: 'incomplete', daysWithData, totalDaysPossible, isMonthPeriod };
        }

        if (daysWithData >= 6) {
            return { tone: 'complete', daysWithData, totalDaysPossible: 7, isMonthPeriod: false };
        }
        if (daysWithData >= 4) {
            return { tone: 'partial', daysWithData, totalDaysPossible: 7, isMonthPeriod: false };
        }
        return { tone: 'incomplete', daysWithData, totalDaysPossible: 7, isMonthPeriod: false };
    }

    function buildReliabilityText(meta) {
        const count = meta.daysWithData;
        const total = meta.totalDaysPossible || 7;
        let text = 'учтено ' + count + ' из ' + total + ' дней';
        if (meta.tone === 'partial') text += ' · оценка примерная';
        if (meta.tone === 'incomplete') text += ' · данных мало';
        return text;
    }

    function MonthlyReportsLegend({ mode = 'weeks' } = {}) {
        void mode;
        const items = [
            { tone: 'complete', text: 'можно доверять' },
            { tone: 'partial', text: 'оценка примерная' },
            { tone: 'incomplete', text: 'данных мало' }
        ];

        return React.createElement('div', {
            className: 'reports-v4-periods-sheet__legend',
            role: 'note',
            'aria-label': 'Легенда полноты данных'
        },
            ...items.map((item) => React.createElement('span', {
                key: item.tone,
                className: 'reports-v4-periods-sheet__legend-item'
            },
                React.createElement('span', {
                    className: 'reports-v4-periods-sheet__dot is-' + item.tone,
                    'aria-hidden': 'true'
                }),
                item.text
            ))
        );
    }

    function WeekCard({ week, prevWeek }) {
        const h = React.createElement;
        const { useMemo, useState } = React;
        const { report, rangeLabel, isCurrent } = week;
        const completenessMeta = getCompletenessMeta(report);
        const isUnreliable = completenessMeta.daysWithData < UNRELIABLE_DAYS_THRESHOLD;
        const reliabilityText = buildReliabilityText(completenessMeta);

        const getWeightTrend = () => {
            const currentWeight = Number.isFinite(report?.avgWeight) ? report.avgWeight : 0;
            const prevWeight = Number.isFinite(prevWeek?.report?.avgWeight) ? prevWeek.report.avgWeight : 0;
            if (!currentWeight || !prevWeight) return null;

            const periodShort = report?.periodType === 'month' ? 'месяцу' : 'неделе';
            const periodTiny = report?.periodType === 'month' ? 'месяц' : 'неделе';
            const diff = currentWeight - prevWeight;
            if (Math.abs(diff) < 0.05) {
                return {
                    header: '—',
                    footnote: 'без изменений к прошлой ' + periodShort
                };
            }

            const sign = diff > 0 ? '+' : '−';
            const abs = Math.abs(diff).toFixed(1).replace('.', ',');
            return {
                header: sign + abs + ' кг к прошлой',
                footnote: sign + abs + ' кг к прошлой ' + periodTiny
            };
        };

        const weightTrend = getWeightTrend();
        const canExpandDays = !isUnreliable && Array.isArray(report?.days) && report.days.length > 0;
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
                const targetDeficitPct = Number.isFinite(d.targetDeficitPct)
                    ? Math.round(d.targetDeficitPct)
                    : null;
                const hasMeals = !!d.hasMeals;
                const isIncluded = hasMeals
                    && !d.isIncomplete
                    && !(d.isToday && (d.ratio || 0) < 0.5);
                const deficit = eaten - burned;

                return {
                    dateStr: d.dateStr,
                    dayLabel,
                    isIncluded,
                    burned,
                    eaten,
                    goal,
                    deficit,
                    targetDeficitPct
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
            }, { burned: 0, eaten: 0, goal: 0, deficit: 0 });
            const count = includedDayRows.length || 1;
            return {
                avgBurned: totals.burned / count,
                avgEaten: totals.eaten / count,
                avgGoal: totals.goal / count,
                avgDeficit: totals.deficit / count
            };
        }, [includedDayRows]);

        const targetPct = report?.targetDeficitPct ?? 0;
        const avgDeltaPct = report?.avgDeltaPct;
        const avgWeight = report?.avgWeight;
        const macrosText = [
            Math.round(report?.avgProt || 0),
            Math.round(report?.avgFat || 0),
            Math.round(report?.avgCarbs || 0)
        ].join(' / ');

        const planValue = isUnreliable ? '—' : formatSignedPct(targetPct);
        const deltaValue = isUnreliable ? '—' : formatSignedPct(avgDeltaPct);
        const weightValue = isUnreliable ? '—' : formatWeight(avgWeight);
        const deltaIsGood = !isUnreliable && Number.isFinite(avgDeltaPct) && avgDeltaPct < 0;

        return h('article', { className: 'reports-v4-periods-card' },
            h('div', { className: 'reports-v4-periods-card__head' },
                h('span', { className: 'reports-v4-periods-card__date' }, rangeLabel),
                isCurrent
                    ? h('span', { className: 'reports-v4-periods-card__badge' }, 'текущая')
                    : weightTrend && weightTrend.header
                        ? h('span', {
                            className: 'reports-v4-periods-card__delta' +
                                (weightTrend.header === '—' ? ' is-muted' : '')
                        }, weightTrend.header)
                        : null
            ),
            h('div', { className: 'reports-v4-periods-card__reliability' },
                h('span', {
                    className: 'reports-v4-periods-sheet__dot is-' + completenessMeta.tone,
                    'aria-hidden': 'true'
                }),
                h('span', { className: 'reports-v4-periods-card__reliability-text' }, reliabilityText)
            ),
            h('div', { className: 'reports-v4-periods-card__metrics' },
                h('div', { className: 'reports-v4-periods-card__metric' },
                    h('span', { className: 'reports-v4-periods-card__metric-value' },
                        formatInt(report?.avgTarget || 0)),
                    h('span', { className: 'reports-v4-periods-card__metric-label' }, 'затраты')
                ),
                h('div', { className: 'reports-v4-periods-card__metric' },
                    h('span', { className: 'reports-v4-periods-card__metric-value' },
                        formatInt(report?.avgKcal || 0)),
                    h('span', { className: 'reports-v4-periods-card__metric-label' }, 'съедено')
                ),
                h('div', { className: 'reports-v4-periods-card__metric' },
                    h('span', {
                        className: 'reports-v4-periods-card__metric-value' +
                            (isUnreliable ? ' is-muted' : '')
                    }, planValue),
                    h('span', { className: 'reports-v4-periods-card__metric-label' }, 'план')
                ),
                h('div', { className: 'reports-v4-periods-card__metric' },
                    h('span', {
                        className: 'reports-v4-periods-card__metric-value' +
                            (deltaIsGood ? ' is-good' : '') +
                            (isUnreliable ? ' is-muted' : '')
                    }, deltaValue),
                    h('span', { className: 'reports-v4-periods-card__metric-label' }, 'вышло')
                ),
                h('div', { className: 'reports-v4-periods-card__metric' },
                    h('span', {
                        className: 'reports-v4-periods-card__metric-value' +
                            (isUnreliable ? ' is-muted' : '')
                    }, weightValue),
                    h('span', { className: 'reports-v4-periods-card__metric-label' }, 'средний вес')
                ),
                h('div', { className: 'reports-v4-periods-card__metric' },
                    h('span', { className: 'reports-v4-periods-card__metric-value' }, macrosText),
                    h('span', { className: 'reports-v4-periods-card__metric-label' }, 'Б / Ж / У, г')
                )
            ),
            isCurrent && weightTrend && weightTrend.footnote && weightTrend.footnote !== '—'
                ? h('div', { className: 'reports-v4-periods-card__weight-note' }, weightTrend.footnote)
                : null,
            isUnreliable
                ? h('div', { className: 'reports-v4-periods-card__footnote' },
                    'Меньше четырёх дней с записями: «план», «вышло» и вес стоят прочерками — среднее по трём дням не период.')
                : null,
            canExpandDays && h('button', {
                type: 'button',
                className: 'reports-v4-periods-card__days',
                onClick: () => setIsExpanded((prev) => !prev),
                'aria-expanded': isExpanded
            },
                h('span', { className: 'reports-v4-periods-card__days-label' }, 'Дни недели'),
                h('span', { className: 'reports-v4-periods-card__days-chevron' }, '›')
            ),
            canExpandDays && isExpanded
                ? h('div', { className: 'reports-v4-periods-card__breakdown' },
                    h('div', { className: 'weekly-wrap-breakdown monthly-week-breakdown', onClick: (e) => e.stopPropagation() },
                        h('div', { className: 'weekly-wrap-breakdown__header' },
                            h('div', { className: 'weekly-wrap-breakdown__title' }, 'Дни в расчёте'),
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
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, 'План'),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, 'Дефицит', h('br'), 'от потрач.')
                            ),
                            ...includedDayRows.map((day, i) => h('div', { key: day.dateStr || i, className: 'weekly-wrap-breakdown__row' },
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--day' }, day.dayLabel),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(day.burned)),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(day.eaten)),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--goal' },
                                    Math.round(day.goal),
                                    day.targetDeficitPct == null
                                        ? null
                                        : ' (' + (day.targetDeficitPct > 0 ? '+' : '') + day.targetDeficitPct + '%)'
                                ),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--delta' },
                                    (day.deficit > 0 ? '+' : '') + Math.round(day.deficit)
                                )
                            )),
                            h('div', { className: 'weekly-wrap-breakdown__row weekly-wrap-breakdown__row--total' },
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--day' }, 'Итого в среднем'),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(breakdownTotals.avgBurned)),
                                h('span', { className: 'weekly-wrap-breakdown__cell' }, Math.round(breakdownTotals.avgEaten)),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--goal' }, Math.round(breakdownTotals.avgGoal)),
                                h('span', { className: 'weekly-wrap-breakdown__cell weekly-wrap-breakdown__cell--delta' },
                                    (breakdownTotals.avgDeficit > 0 ? '+' : '') + Math.round(breakdownTotals.avgDeficit)
                                )
                            )
                        )
                    )
                )
                : null
        );
    }

    function MonthlyReportsContent(props = {}) {
        const { useState } = React;
        const monthlyReportsService = HEYS.monthlyReportsService;
        const monthlyWeeks = monthlyReportsService && monthlyReportsService.buildMonthlyWeeks
            ? monthlyReportsService.buildMonthlyWeeks({ weeksCount: 16, useCache: true })
            : [];
        const monthlyMonths = monthlyReportsService && monthlyReportsService.buildMonthlyMonths
            ? monthlyReportsService.buildMonthlyMonths({ weeksCount: 16, useCache: true })
            : [];
        const [localMode, setLocalMode] = useState('weeks');
        const [localWeekFilter, setLocalWeekFilter] = useState('all');
        const [localMonthFilter, setLocalMonthFilter] = useState('all');
        const weekFilter = props.weekFilter || localWeekFilter;
        const setWeekFilter = props.setWeekFilter || setLocalWeekFilter;
        const monthFilter = props.monthFilter || localMonthFilter;
        const setMonthFilter = props.setMonthFilter || setLocalMonthFilter;
        const mode = props.mode || localMode;
        const setMode = props.setMode || setLocalMode;

        if (!monthlyReportsService || !monthlyReportsService.buildMonthlyWeeks) {
            return React.createElement('div', { className: 'reports-v4-periods-sheet__empty' },
                'Загружаем сервис месячных отчётов...');
        }

        if (monthlyWeeks.length === 0) {
            return React.createElement('div', { className: 'reports-v4-periods-sheet__empty' },
                'Добавьте минимум 2 дня с едой в неделю — и появятся отчёты');
        }

        const sourceCards = mode === 'months' ? monthlyMonths : monthlyWeeks;
        const isWeeksMode = mode === 'weeks';
        const isMonthsMode = mode === 'months';
        const trustedWeeksCount = monthlyWeeks.filter((week) =>
            (week?.report?.daysWithRecords ?? week?.report?.daysWithData ?? 0) >= 6).length;
        const trustedMonthsCount = monthlyMonths.filter((month) =>
            (month?.report?.completenessRatio || 0) >= COMPLETE_RATIO_THRESHOLD).length;
        const trustedCount = isMonthsMode ? trustedMonthsCount : trustedWeeksCount;
        const filterActive = isWeeksMode ? weekFilter === 'trusted' : monthFilter === 'trusted';

        const visibleEntries = sourceCards
            .map((week, index) => ({ week, index }))
            .filter(({ week }) => {
                if (isWeeksMode && weekFilter === 'trusted') {
                    return (week?.report?.daysWithRecords ?? week?.report?.daysWithData ?? 0) >= 6;
                }
                if (isMonthsMode && monthFilter === 'trusted') {
                    return (week?.report?.completenessRatio || 0) >= COMPLETE_RATIO_THRESHOLD;
                }
                return true;
            });

        const emptyMonths = mode === 'months' && sourceCards.length === 0;
        const emptyTrustedWeeks = isWeeksMode && weekFilter === 'trusted' && visibleEntries.length === 0;
        const emptyTrustedMonths = isMonthsMode && monthFilter === 'trusted' && visibleEntries.length === 0;

        const toggleFilter = () => {
            if (isWeeksMode) {
                setWeekFilter(filterActive ? 'all' : 'trusted');
            } else {
                setMonthFilter(filterActive ? 'all' : 'trusted');
            }
        };

        return React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'reports-v4-periods-sheet__chips', role: 'tablist', 'aria-label': 'Режим листа периодов' },
                React.createElement('button', {
                    type: 'button',
                    role: 'tab',
                    className: 'reports-v4-periods-sheet__chip' + (mode === 'weeks' ? ' is-active' : ''),
                    onClick: () => setMode('weeks')
                }, 'Неделя'),
                React.createElement('button', {
                    type: 'button',
                    role: 'tab',
                    className: 'reports-v4-periods-sheet__chip' + (mode === 'months' ? ' is-active' : ''),
                    onClick: () => setMode('months')
                }, 'Месяц'),
                React.createElement('button', {
                    type: 'button',
                    className: 'reports-v4-periods-sheet__chip is-filter' + (filterActive ? ' is-active' : ''),
                    onClick: toggleFilter,
                    'aria-pressed': filterActive
                }, 'Только надёжные · ' + trustedCount)
            ),
            React.createElement(MonthlyReportsLegend, { mode }),
            emptyMonths
                ? React.createElement('div', { className: 'reports-v4-periods-sheet__empty' },
                    'Для месячных отчётов нужно минимум 4 недели данных')
                : emptyTrustedWeeks
                    ? React.createElement('div', { className: 'reports-v4-periods-sheet__empty' },
                        'Пока нет недель, где выводам можно доверять')
                    : emptyTrustedMonths
                        ? React.createElement('div', { className: 'reports-v4-periods-sheet__empty' },
                            'Пока нет месяцев, где выводам можно доверять')
                        : React.createElement('div', { className: 'reports-v4-periods-sheet__list' },
                            ...visibleEntries.map(({ week, index }) => React.createElement(WeekCard, {
                                key: week.rangeLabel || index,
                                week,
                                prevWeek: sourceCards[index + 1]
                            }))
                        )
        );
    }

    HEYS.monthlyReports = {
        MonthlyReportsContent,
        MonthlyReportsLegend
    };
})(window);
