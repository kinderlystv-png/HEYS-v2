import fs from 'fs';
import path from 'path';

import { cleanup, render } from '@testing-library/react';
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
});
