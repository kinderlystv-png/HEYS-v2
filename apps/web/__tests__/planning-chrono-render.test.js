import fs from 'fs';
import path from 'path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CHRONO_SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_planning_chrono_v1.js'),
    'utf8'
);

function loadChrono() {
    window.React = React;
    window.HEYS = {
        Planning: {
            Constants: { CALENDAR_START_HOUR: 3 },
            Store: {},
            Utils: {
                dateStr: () => '2026-06-02',
                chronoDateStr: () => '2026-06-02',
            },
        },
    };

    // eslint-disable-next-line no-new-func
    new Function(CHRONO_SRC)();
    return window.HEYS.PlanningChrono;
}

describe('chrono render stability', () => {
    let Chrono;

    beforeEach(() => {
        Chrono = loadChrono();
        localStorage.clear();
    });

    afterEach(() => {
        cleanup();
    });

    it('ChronoOverviewPanel can switch from empty to populated without changing hook order', () => {
        const baseProps = {
            insights: [],
            balance: [],
            streaks: [],
            timeOfDay: null,
            lastAdded: null,
            loggedRows: [],
            untracked: null,
            untrackedActive: false,
            onUntrackedClick: () => { },
            onLoggedRowClick: () => { },
            onLoggedRowsReorder: () => { },
        };

        const view = render(React.createElement(Chrono.ChronoOverviewPanel, baseProps));
        expect(view.container.textContent).toBe('');

        view.rerender(React.createElement(Chrono.ChronoOverviewPanel, {
            ...baseProps,
            loggedRows: [{
                id: 'entry:first',
                entryIds: ['first'],
                timeRange: '07:00-08:00',
                durationLabel: '1ч',
                name: 'Focus',
            }],
        }));

        expect(view.container.textContent).toContain('Focus');
    });

    it('ChronoOverviewPanel keeps untracked badge next to wake-to-now context with no rows', () => {
        const view = render(React.createElement(Chrono.ChronoOverviewPanel, {
            insights: [],
            balance: [],
            streaks: [],
            timeOfDay: null,
            lastAdded: null,
            loggedRows: [],
            untracked: {
                minutes: 48,
                hoursLabel: '0,8ч',
                wakeLabel: '09:54',
                sinceLabel: '09:54',
                sinceKind: 'wake',
            },
            untrackedActive: false,
            onUntrackedClick: () => { },
            onLoggedRowClick: () => { },
            onLoggedRowsReorder: () => { },
        }));

        expect(view.container.querySelector('.chrono-overview__last-context'))
            .toBeNull();
        expect(view.container.querySelector('.chrono-overview__untracked-text')?.textContent)
            .toBe('не учтено 48 мин');
        expect(view.container.querySelector('.chrono-overview__untracked-text')?.getAttribute('title'))
            .toBe('с пробуждения 09:54 → сейчас');
        expect(view.container.querySelector('.chrono-overview__untracked-action')?.textContent)
            .toBe('Записать');

        view.rerender(React.createElement(Chrono.ChronoOverviewPanel, {
            insights: [],
            balance: [],
            streaks: [],
            timeOfDay: null,
            lastAdded: null,
            loggedRows: [],
            untracked: {
                minutes: 48,
                hoursLabel: '0,8ч',
                wakeLabel: '09:54',
                sinceLabel: '09:54',
                sinceKind: 'wake',
            },
            untrackedActive: true,
            onUntrackedClick: () => { },
            onLoggedRowClick: () => { },
            onLoggedRowsReorder: () => { },
        }));

        expect(view.container.querySelector('.chrono-overview__untracked-text')?.textContent)
            .toBe('48 мин');
        expect(view.container.querySelector('.chrono-overview__untracked-action')?.textContent)
            .toBe('Выбирайте актив');
    });

    it('ChronoOverviewPanel hides last-added line when there is no untracked time', () => {
        const view = render(React.createElement(Chrono.ChronoOverviewPanel, {
            insights: [],
            balance: [],
            streaks: [],
            timeOfDay: null,
            lastAdded: {
                timeLabel: '21:40',
                nowLabel: '21:40',
                nowKind: 'now',
                detail: '+1м Programming',
                elapsedHoursLabel: '0,0ч',
            },
            loggedRows: [{
                id: 'entry:first',
                entryIds: ['first'],
                timeRange: '21:39-21:40',
                durationLabel: '1м',
                name: 'Programming',
            }],
            untracked: null,
            untrackedActive: false,
            onUntrackedClick: () => { },
            onLoggedRowClick: () => { },
            onLoggedRowsReorder: () => { },
        }));

        expect(view.container.querySelector('.chrono-overview__last')).toBeNull();
        expect(view.container.textContent).not.toContain('сейчас 21:40');
    });

    it('ChronoWeekBreakdown can switch from empty to populated without changing hook order', () => {
        const baseProps = {
            dates: ['2026-06-01'],
            breakdown: { '2026-06-01': { __total: 0 } },
            activities: [{ id: 'a', name: 'Focus' }],
            todayStr: '2026-06-02',
            activeDate: '2026-06-01',
            onPickDate: () => { },
        };

        const view = render(React.createElement(Chrono.ChronoWeekBreakdown, baseProps));
        expect(view.container.textContent).toBe('');

        view.rerender(React.createElement(Chrono.ChronoWeekBreakdown, {
            ...baseProps,
            breakdown: { '2026-06-01': { __total: 30, a: 30 } },
        }));

        expect(view.container.querySelector('.chrono-week-breakdown')).toBeTruthy();
    });

    it('ChronoCloud can switch from empty to populated without changing hook order', () => {
        const baseProps = {
            activities: [],
            minutesByActivity: {},
            maxMin: 0,
            scope: 'day',
            recentBadge: null,
            onPick: () => { },
            onLongPress: () => { },
            hasInactive: false,
            onDragDelete: () => { },
        };

        const view = render(React.createElement(Chrono.ChronoCloud, baseProps));
        expect(view.container.textContent).toContain('+ Новая');

        view.rerender(React.createElement(Chrono.ChronoCloud, {
            ...baseProps,
            activities: [{ id: 'a', name: 'Focus', emoji: 'F', hue: 210 }],
            minutesByActivity: { a: 30 },
            maxMin: 30,
        }));

        expect(view.container.textContent).toContain('Focus');
    });

    it('ChronoCloud renders linked plan and fact inside one activity ring', () => {
        const view = render(React.createElement(Chrono.ChronoCloud, {
            activities: [{ id: 'a', name: 'Focus', emoji: 'F', hue: 210 }],
            minutesByActivity: { a: 45 },
            maxMin: 45,
            scope: 'day',
            planFacts: [{ activityId: 'a', planned: 60, actual: 45 }],
            recentBadge: null,
            onPick: () => { },
            onLongPress: () => { },
            hasInactive: false,
            onDragDelete: () => { },
        }));

        const ring = view.container.querySelector('.chrono-bubble-wrap');
        const button = view.getByRole('button', { name: 'Focus · факт 45м · план 1ч' });
        expect(ring?.classList.contains('has-progress')).toBe(true);
        expect(ring?.classList.contains('is-plan')).toBe(true);
        expect(ring?.style.getPropertyValue('--progress-deg')).toBe('270deg');
        expect(button.textContent).toContain('45м');
        expect(button.textContent).toContain('план 1ч');
        expect(view.container.querySelector('.chrono-planfact')).toBeNull();
    });

    it('ChronoCloud keeps an exceeded budget visible instead of task plan progress', () => {
        const view = render(React.createElement(Chrono.ChronoCloud, {
            activities: [{ id: 'a', name: 'Phone', hue: 0, budgetMinutesPerDay: 30 }],
            minutesByActivity: { a: 45 },
            maxMin: 45,
            scope: 'day',
            planFacts: [{ activityId: 'a', planned: 120, actual: 45 }],
            recentBadge: null,
            onPick: () => { },
            onLongPress: () => { },
            hasInactive: false,
            onDragDelete: () => { },
        }));

        const ring = view.container.querySelector('.chrono-bubble-wrap');
        expect(ring?.classList.contains('is-budget')).toBe(true);
        expect(ring?.classList.contains('is-over')).toBe(true);
        expect(view.getByRole('button', { name: 'Phone · факт 45м · лимит 30м' })).toBeTruthy();
    });

    it('ChronoWeeklyReport keeps details compact and opens a selected day', () => {
        const onPickDay = vi.fn();
        const report = {
            score: 72,
            headline: 'Неделя в балансе',
            recommendation: 'Ритм держится.',
            total: 480,
            daysTracked: 4,
            focusShare: 0.62,
            drainShare: 0.08,
            goalHitRate: 0.5,
            hasGoals: true,
            top: { activity: { name: 'Focus', emoji: 'F' }, minutes: 180 },
            days: [
                { date: '2026-06-01', minutes: 60 },
                { date: '2026-06-02', minutes: 120 },
                { date: '2026-06-03', minutes: 0 },
                { date: '2026-06-04', minutes: 90 },
                { date: '2026-06-05', minutes: 0 },
                { date: '2026-06-06', minutes: 210 },
                { date: '2026-06-07', minutes: 0 },
            ],
            trend: null,
        };

        const view = render(React.createElement(Chrono.ChronoWeeklyReport, { report, onPickDay }));
        const score = view.getByRole('button', { name: /72/ });
        expect(score.getAttribute('aria-expanded')).toBe('false');
        expect(view.queryByText('4 из 7 дней')).toBeNull();

        fireEvent.click(score);
        expect(score.getAttribute('aria-expanded')).toBe('true');
        expect(view.getByText('4 из 7 дней')).toBeTruthy();
        expect(view.getByText('Фокус 62%')).toBeTruthy();

        fireEvent.click(view.getByRole('button', { name: /02\.06/ }));
        expect(onPickDay).toHaveBeenCalledWith('2026-06-02');
    });
});
