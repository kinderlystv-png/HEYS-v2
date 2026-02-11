// heys_monthly_reports_v1.js — Monthly reports (weekly cards)

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    function WeekCard({ week, prevWeek, weightGoal }) {
        const h = React.createElement;
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

        return h('div', { className: 'monthly-week-card' + (isCurrent ? ' monthly-week-card--current' : '') },
            h('div', { className: 'monthly-week-card__header' },
                h('div', { className: 'monthly-week-card__title' }, rangeLabel + daysLabel),
                isCurrent && h('span', { className: 'monthly-week-card__badge' }, 'текущая')
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
            )
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
