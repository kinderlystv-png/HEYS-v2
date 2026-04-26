/**
 * Pure-function tests for heys_planning_gantt_layout_v1.js (Phase 1).
 * Loads the IIFE module as text and evaluates it inside a fresh window.HEYS scope.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_planning_gantt_layout_v1.js'),
    'utf8'
);

let Layout;

beforeAll(() => {
    // Reset and seed HEYS.Planning.Utils with the date helpers the module relies on.
    window.HEYS = {
        Planning: {
            Utils: {
                dateStr: (d) => {
                    const date = d ? new Date(d) : new Date();
                    return date.toISOString().slice(0, 10);
                },
                addDays: (iso, delta) => {
                    const d = new Date(iso + 'T12:00:00');
                    d.setDate(d.getDate() + Number(delta));
                    return d.toISOString().slice(0, 10);
                },
                diffDays: (from, to) => {
                    const a = new Date(from + 'T12:00:00').getTime();
                    const b = new Date(to + 'T12:00:00').getTime();
                    return Math.round((b - a) / 86400000);
                },
            },
        },
    };
    // Evaluate the IIFE — populates window.HEYS.PlanningGanttLayout.
    // eslint-disable-next-line no-new-func
    new Function(SRC)();
    Layout = window.HEYS.PlanningGanttLayout;
});

describe('PlanningGanttLayout.snapDayWidth', () => {
    it('snaps to nearest preset', () => {
        expect(Layout.snapDayWidth(28)).toBe(28);
        expect(Layout.snapDayWidth(30)).toBe(28);
        expect(Layout.snapDayWidth(36)).toBe(40);
        expect(Layout.snapDayWidth(50)).toBe(56);
    });

    it('clamps out-of-range to closest in-range preset', () => {
        expect(Layout.snapDayWidth(8)).toBe(12);    // below ZOOM_MIN
        expect(Layout.snapDayWidth(200)).toBe(120); // above ZOOM_MAX
    });

    it('falls back to default for non-numeric input', () => {
        expect(Layout.snapDayWidth(undefined)).toBe(28);
        expect(Layout.snapDayWidth(NaN)).toBe(28);
    });
});

describe('PlanningGanttLayout.clampDayWidth', () => {
    it('clamps within [12, 120] without snapping', () => {
        expect(Layout.clampDayWidth(33)).toBe(33);
        expect(Layout.clampDayWidth(8)).toBe(12);
        expect(Layout.clampDayWidth(200)).toBe(120);
    });
});

describe('PlanningGanttLayout.pinchRatioToWidth', () => {
    it('multiplies initial width by ratio with clamp', () => {
        expect(Layout.pinchRatioToWidth(28, 1)).toBe(28);
        expect(Layout.pinchRatioToWidth(28, 2)).toBe(56);
        expect(Layout.pinchRatioToWidth(28, 0.5)).toBe(14);
        expect(Layout.pinchRatioToWidth(28, 10)).toBe(120); // clamped at MAX
        expect(Layout.pinchRatioToWidth(28, 0.1)).toBe(12); // clamped at MIN
    });
});

describe('PlanningGanttLayout.computeRelevantTasks', () => {
    it('keeps tasks with at least one date and excludes cancelled', () => {
        const tasks = [
            { id: '1', startDate: '2026-01-01', status: 'in_progress' },
            { id: '2', baselineStartDate: '2026-02-01', status: 'todo' },
            { id: '3', startDate: '2026-03-01', status: 'cancelled' },
            { id: '4', status: 'in_progress' },
        ];
        const out = Layout.computeRelevantTasks(tasks);
        expect(out.map((t) => t.id)).toEqual(['1', '2']);
    });
});

describe('PlanningGanttLayout.computeTimelineBounds', () => {
    it('pads earliest start by -2 days and latest end by +4 days', () => {
        const tasks = [
            { id: '1', startDate: '2026-04-10', dueDate: '2026-04-12' },
            { id: '2', startDate: '2026-04-15', dueDate: '2026-04-20' },
        ];
        const b = Layout.computeTimelineBounds(tasks, '2026-04-12');
        expect(b.start).toBe('2026-04-08');
        expect(b.end).toBe('2026-04-24');
    });

    it('clamps far-future dates to ±2 years from today', () => {
        const tasks = [{ id: '1', startDate: '2026-04-12', dueDate: '2030-01-01' }];
        const b = Layout.computeTimelineBounds(tasks, '2026-04-12');
        // dueDate 2030-01-01 is ~3.7y away → clamped to 2028-04-12
        expect(b.end <= '2028-04-13').toBe(true);
    });

    it('returns sane fallback when no tasks have dates', () => {
        const b = Layout.computeTimelineBounds([], '2026-04-12');
        expect(b.start).toBe('2026-04-09');
        expect(b.end).toBe('2026-04-29');
    });
});

describe('PlanningGanttLayout.computeVisibleSlice', () => {
    it('returns rows whose tops intersect viewport + buffer', () => {
        const rows = Array.from({ length: 50 }, (_, i) => ({ id: 'r' + i, top: i * 44, height: 44 }));
        const out = Layout.computeVisibleSlice(rows, /*scrollTop*/ 220, /*viewport*/ 200, 44, 2);
        // Visible rows ~5..9; with buffer 2 → start=3, end=12 (exclusive).
        expect(out.startIdx).toBe(3);
        expect(out.endIdx).toBeGreaterThanOrEqual(11);
        expect(out.slice.length).toBe(out.endIdx - out.startIdx);
    });

    it('falls back to first 30 rows when viewport unknown', () => {
        const rows = Array.from({ length: 100 }, (_, i) => ({ id: 'r' + i, top: i * 44, height: 44 }));
        const out = Layout.computeVisibleSlice(rows, 0, 0, 44, 5);
        expect(out.slice.length).toBe(30);
    });

    it('returns empty for empty input', () => {
        expect(Layout.computeVisibleSlice([], 0, 500, 44, 5)).toEqual({ startIdx: 0, endIdx: 0, slice: [] });
    });
});
