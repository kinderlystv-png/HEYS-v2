/**
 * Tests for chrono pure functions:
 *  - radiusForMinutes (from heys_planning_chrono_v1.js)
 *  - getChronoMinutesByActivity (from heys_planning_store_v1.js, Planning.Utils)
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const STORE_SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_planning_store_v1.js'),
    'utf8'
);
const CHRONO_SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_planning_chrono_v1.js'),
    'utf8'
);

function loadModules() {
    const lsStore = {};
    // Minimal React shim — store/chrono early-return without React.
    // Hooks/createElement aren't exercised by the pure-function tests.
    window.React = {
        createElement: () => null,
        useState: (init) => [typeof init === 'function' ? init() : init, () => { }],
        useEffect: () => { },
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
        useRef: (init) => ({ current: init }),
    };
    window.HEYS = {
        utils: {
            lsGet: (k, fallback) => (k in lsStore ? lsStore[k] : fallback),
            lsSet: (k, v) => { lsStore[k] = v; },
        },
    };

    // eslint-disable-next-line no-new-func
    new Function(STORE_SRC)();
    // eslint-disable-next-line no-new-func
    new Function(CHRONO_SRC)();

    return {
        Chrono: window.HEYS.PlanningChrono,
        Utils: window.HEYS.Planning.Utils,
        Store: window.HEYS.Planning.Store,
    };
}

describe('chrono.radiusForMinutes', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('returns r_min when minutes=0', () => {
        expect(Chrono.radiusForMinutes(0, 120)).toBe(Chrono.r_min);
    });

    it('returns r_min when maxMin=0 (no scale)', () => {
        expect(Chrono.radiusForMinutes(60, 0)).toBe(Chrono.r_min);
    });

    it('returns r_max when minutes=maxMin', () => {
        expect(Chrono.radiusForMinutes(120, 120)).toBe(Chrono.r_max);
    });

    it('uses sqrt scaling — minutes=25% of max → 50% of span', () => {
        const r = Chrono.radiusForMinutes(30, 120);
        const expected = Chrono.r_min + (Chrono.r_max - Chrono.r_min) * 0.5;
        expect(r).toBeCloseTo(expected, 5);
    });

    it('clamps at r_max when minutes > maxMin', () => {
        expect(Chrono.radiusForMinutes(300, 120)).toBe(Chrono.r_max);
    });

    it('handles non-finite inputs gracefully', () => {
        expect(Chrono.radiusForMinutes(NaN, 120)).toBe(Chrono.r_min);
        expect(Chrono.radiusForMinutes(60, NaN)).toBe(Chrono.r_min);
    });
});

describe('chrono.colorForActivity', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('produces dusty pastel hsl when minutes=0 (low saturation, high lightness)', () => {
        const color = Chrono.colorForActivity(200, 0, 120);
        // saturation 24, lightness 88
        expect(color).toBe('hsl(200, 24%, 88%)');
    });

    it('produces deeper-but-still-calm hsl when minutes=maxMin', () => {
        const color = Chrono.colorForActivity(200, 120, 120);
        // saturation 24 + 14 = 38, lightness 88 - 30 = 58
        expect(color).toBe('hsl(200, 38%, 58%)');
    });

    it('normalizes hue to 0..360', () => {
        expect(Chrono.colorForActivity(-30, 0, 0)).toBe('hsl(330, 24%, 88%)');
        expect(Chrono.colorForActivity(400, 0, 0)).toBe('hsl(40, 24%, 88%)');
    });
});

describe('chrono.getProgress', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('returns null when activity has no goal', () => {
        expect(Chrono.getProgress({}, 60, 'day')).toBe(null);
        expect(Chrono.getProgress(null, 60, 'day')).toBe(null);
        expect(Chrono.getProgress({ targetMinutesPerDay: 0 }, 60, 'day')).toBe(null);
    });

    it('target — day scope, 0..1 value with clamp', () => {
        const a = { targetMinutesPerDay: 60 };
        expect(Chrono.getProgress(a, 0, 'day')).toMatchObject({ kind: 'target', value: 0, over: false });
        expect(Chrono.getProgress(a, 30, 'day')).toMatchObject({ kind: 'target', value: 0.5 });
        expect(Chrono.getProgress(a, 60, 'day')).toMatchObject({ kind: 'target', value: 1 });
        expect(Chrono.getProgress(a, 120, 'day')).toMatchObject({ kind: 'target', value: 1, over: false });
    });

    it('strict scope-match: daily target → null in week scope and vice versa', () => {
        expect(Chrono.getProgress({ targetMinutesPerDay: 30 }, 100, 'week')).toBe(null);
        expect(Chrono.getProgress({ targetMinutesPerWeek: 210 }, 30, 'day')).toBe(null);
    });

    it('budget — kind=budget with raw and over flag when exceeded', () => {
        const a = { budgetMinutesPerDay: 60 };
        expect(Chrono.getProgress(a, 30, 'day')).toMatchObject({ kind: 'budget', value: 0.5, over: false });
        expect(Chrono.getProgress(a, 60, 'day')).toMatchObject({ kind: 'budget', value: 1, over: false });
        expect(Chrono.getProgress(a, 90, 'day')).toMatchObject({ kind: 'budget', value: 1, over: true, raw: 1.5 });
    });

    it('both targets independent: scope picks its own', () => {
        const a = { targetMinutesPerDay: 60, targetMinutesPerWeek: 200 };
        expect(Chrono.getProgress(a, 30, 'day')).toMatchObject({ kind: 'target', value: 0.5 });
        expect(Chrono.getProgress(a, 100, 'week')).toMatchObject({ kind: 'target', value: 0.5 });
    });
});

describe('chrono.ringColorForProgress', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('returns transparent when no progress', () => {
        expect(Chrono.ringColorForProgress(null, 200)).toBe('transparent');
    });

    it('target — saturated hue', () => {
        expect(Chrono.ringColorForProgress({ kind: 'target', value: 0.5, raw: 0.5 }, 200))
            .toBe('hsl(200, 50%, 50%)');
    });

    it('budget — green / orange / red zones', () => {
        expect(Chrono.ringColorForProgress({ kind: 'budget', value: 0.4, raw: 0.4 }, 200))
            .toBe('hsl(142, 60%, 45%)');
        expect(Chrono.ringColorForProgress({ kind: 'budget', value: 0.9, raw: 0.9 }, 200))
            .toBe('hsl(28, 85%, 52%)');
        expect(Chrono.ringColorForProgress({ kind: 'budget', value: 1, raw: 1.5, over: true }, 200))
            .toBe('hsl(0, 80%, 52%)');
    });
});

describe('Store — target/budget mutex within period', () => {
    let Store;
    beforeEach(() => { ({ Store } = loadModules()); });

    it('setting daily target clears daily budget (and vice versa)', () => {
        const a = Store.addChronoActivity({ name: 'Sport' });
        Store.updateChronoActivity(a.id, { budgetMinutesPerDay: 30 });
        let cur = Store.getChronoActivities().find((x) => x.id === a.id);
        expect(cur.budgetMinutesPerDay).toBe(30);
        expect(cur.targetMinutesPerDay).toBeUndefined();

        Store.updateChronoActivity(a.id, { targetMinutesPerDay: 60 });
        cur = Store.getChronoActivities().find((x) => x.id === a.id);
        expect(cur.targetMinutesPerDay).toBe(60);
        expect(cur.budgetMinutesPerDay).toBeUndefined();
    });

    it('day and week are independent of each other', () => {
        const a = Store.addChronoActivity({ name: 'Read' });
        Store.updateChronoActivity(a.id, { targetMinutesPerDay: 30 });
        Store.updateChronoActivity(a.id, { budgetMinutesPerWeek: 200 });
        const cur = Store.getChronoActivities().find((x) => x.id === a.id);
        expect(cur.targetMinutesPerDay).toBe(30);
        expect(cur.budgetMinutesPerWeek).toBe(200);
        expect(cur.targetMinutesPerWeek).toBeUndefined();
        expect(cur.budgetMinutesPerDay).toBeUndefined();
    });
});

describe('Store — chrono timer', () => {
    let Store;
    beforeEach(() => { ({ Store } = loadModules()); });
    afterEach(() => { vi.useRealTimers(); });

    it('rejects start without activity / minutes', () => {
        expect(Store.startChronoTimer({})).toBe(null);
        expect(Store.startChronoTimer({ activityId: 'x', plannedMinutes: 0 })).toBe(null);
        // unknown activity
        expect(Store.startChronoTimer({ activityId: 'unknown', plannedMinutes: 25 })).toBe(null);
    });

    it('starts and clears a timer', () => {
        const a = Store.addChronoActivity({ name: 'Focus' });
        const t = Store.startChronoTimer({ activityId: a.id, plannedMinutes: 25 });
        expect(t).toBeTruthy();
        expect(t.activityId).toBe(a.id);
        expect(t.plannedMinutes).toBe(25);
        expect(typeof t.startMs).toBe('number');
        expect(Store.getChronoTimer()).toEqual(t);

        Store.clearChronoTimer();
        expect(Store.getChronoTimer()).toBe(null);
    });

    it('pauses and resumes a timer, tracking accumulated pause time', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-02T10:00:00Z'));
        const a = Store.addChronoActivity({ name: 'Focus' });
        const t = Store.startChronoTimer({ activityId: a.id, plannedMinutes: 25 });
        expect(t.accumulatedPausedMs).toBe(0);
        expect(t.pausedAt).toBe(null);

        vi.setSystemTime(new Date('2026-06-02T10:05:00Z'));
        const paused = Store.pauseChronoTimer();
        expect(paused.pausedAt).toBe(Date.parse('2026-06-02T10:05:00Z'));

        vi.setSystemTime(new Date('2026-06-02T10:08:00Z'));
        const resumed = Store.resumeChronoTimer();
        expect(resumed.pausedAt).toBe(null);
        expect(resumed.accumulatedPausedMs).toBe(3 * 60 * 1000);
    });
});

describe('chrono timer pure helpers', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('excludes accumulated and current pause time from elapsed', () => {
        const timer = {
            startMs: 1000,
            plannedMinutes: 10,
            accumulatedPausedMs: 2000,
            pausedAt: 8000,
        };
        expect(Chrono.getTimerElapsedMs(timer, 20000)).toBe(5000);
        expect(Chrono.getTimerRemainingMs(timer, 20000)).toBe((10 * 60 * 1000) - 5000);
    });
});

describe('chrono.buildDailySeries (heatmap source)', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('fills every date in window — even days with 0 entries', () => {
        const series = Chrono.buildDailySeries(
            [{ activityId: 'a', date: '2026-06-02', minutes: 30 }],
            [],
            'a',
            '2026-06-01',
            '2026-06-03',
        );
        expect(series).toEqual([
            { date: '2026-06-01', minutes: 0 },
            { date: '2026-06-02', minutes: 30 },
            { date: '2026-06-03', minutes: 0 },
        ]);
    });

    it('merges entries+snapshots, filters by activityId, ignores outside window', () => {
        const series = Chrono.buildDailySeries(
            [
                { activityId: 'a', date: '2026-06-02', minutes: 30 },
                { activityId: 'b', date: '2026-06-02', minutes: 99 }, // другая активность
                { activityId: 'a', date: '2025-12-01', minutes: 999 }, // вне окна
            ],
            [
                { activityId: 'a', date: '2026-06-02', totalMinutes: 60 },
                { activityId: 'a', date: '2026-06-03', totalMinutes: 15 },
            ],
            'a',
            '2026-06-01',
            '2026-06-03',
        );
        expect(series.find((s) => s.date === '2026-06-02').minutes).toBe(90); // 30 + 60
        expect(series.find((s) => s.date === '2026-06-03').minutes).toBe(15);
        expect(series.find((s) => s.date === '2026-06-01').minutes).toBe(0);
    });
});

describe('chrono.buildWeekBreakdown (stacked-bar source)', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('groups by date+activityId, with __total per day', () => {
        const breakdown = Chrono.buildWeekBreakdown(
            [
                { activityId: 'a', date: '2026-06-01', minutes: 30 },
                { activityId: 'b', date: '2026-06-01', minutes: 15 },
                { activityId: 'a', date: '2026-06-02', minutes: 60 },
            ],
            [
                { activityId: 'a', date: '2026-06-02', totalMinutes: 30 },
            ],
            ['2026-06-01', '2026-06-02', '2026-06-03'],
        );
        expect(breakdown['2026-06-01']).toEqual({ a: 30, b: 15, __total: 45 });
        expect(breakdown['2026-06-02']).toEqual({ a: 90, __total: 90 });
        expect(breakdown['2026-06-03']).toEqual({ __total: 0 });
    });

    it('ignores entries with date outside week window', () => {
        const breakdown = Chrono.buildWeekBreakdown(
            [{ activityId: 'a', date: '2026-05-01', minutes: 999 }],
            [],
            ['2026-06-01'],
        );
        expect(breakdown['2026-06-01']).toEqual({ __total: 0 });
    });
});

describe('Planning.Utils.getChronoMinutesByActivity', () => {
    let Utils;
    beforeEach(() => { ({ Utils } = loadModules()); });

    const sample = {
        entries: [
            { activityId: 'a', date: '2026-06-02', minutes: 30 },
            { activityId: 'a', date: '2026-06-02', minutes: 45 },
            { activityId: 'b', date: '2026-06-02', minutes: 60 },
            { activityId: 'a', date: '2026-06-03', minutes: 15 },
            { activityId: 'a', date: '2026-05-01', minutes: 999 }, // outside any tested window
        ],
        snapshots: [
            { activityId: 'a', date: '2026-06-02', totalMinutes: 100 },
            { activityId: 'c', date: '2026-06-04', totalMinutes: 200 },
        ],
    };

    it('day scope: only entries+snapshots matching the single date', () => {
        const out = Utils.getChronoMinutesByActivity(sample.entries, sample.snapshots, ['2026-06-02']);
        // a: 30+45 (entries) + 100 (snapshot) = 175; b: 60
        expect(out).toEqual({ a: 175, b: 60 });
    });

    it('week scope: sums across multiple dates', () => {
        const dates = ['2026-06-02', '2026-06-03', '2026-06-04'];
        const out = Utils.getChronoMinutesByActivity(sample.entries, sample.snapshots, dates);
        // a: 30+45+15 (entries) + 100 (snap) = 190; b: 60; c: 200 (snap only)
        expect(out).toEqual({ a: 190, b: 60, c: 200 });
    });

    it('entries-only (no snapshots) works', () => {
        const out = Utils.getChronoMinutesByActivity(sample.entries, [], ['2026-06-02']);
        expect(out).toEqual({ a: 75, b: 60 });
    });

    it('snapshots-only (no entries) works', () => {
        const out = Utils.getChronoMinutesByActivity([], sample.snapshots, ['2026-06-04']);
        expect(out).toEqual({ c: 200 });
    });

    it('returns empty object when no dates match', () => {
        const out = Utils.getChronoMinutesByActivity(sample.entries, sample.snapshots, ['1999-01-01']);
        expect(out).toEqual({});
    });

    it('handles invalid inputs safely', () => {
        expect(Utils.getChronoMinutesByActivity(null, null, ['2026-06-02'])).toEqual({});
        expect(Utils.getChronoMinutesByActivity([], [], null)).toEqual({});
    });
});

describe('Planning.Store chrono helpers — addChronoEntry + compaction', () => {
    let Store;
    beforeEach(() => { ({ Store } = loadModules()); });

    it('addChronoActivity assigns a hue and persists', () => {
        const a = Store.addChronoActivity({ name: 'Test', emoji: '🧠' });
        expect(a).toBeTruthy();
        expect(typeof a.hue).toBe('number');
        expect(a.hue).toBeGreaterThanOrEqual(0);
        expect(a.hue).toBeLessThan(360);
        expect(Store.getChronoActivities().length).toBe(1);
    });

    it('addChronoEntry rejects unknown activityId', () => {
        const e = Store.addChronoEntry({ activityId: 'nope', date: '2026-06-02', minutes: 10 });
        expect(e).toBe(null);
    });

    it('updates and adjusts chrono entries without recreating them', () => {
        const a = Store.addChronoActivity({ name: 'Edit' });
        const e = Store.addChronoEntry({ activityId: a.id, date: '2026-06-02', minutes: 30 });

        const updated = Store.updateChronoEntry(e.id, { minutes: 45 });
        expect(updated.id).toBe(e.id);
        expect(updated.minutes).toBe(45);

        const adjusted = Store.adjustChronoEntryMinutes(e.id, -10);
        expect(adjusted.minutes).toBe(35);
        expect(Store.getChronoEntries()[0].id).toBe(e.id);
    });

    it('archives and restores activities without deleting history', () => {
        const a = Store.addChronoActivity({ name: 'Archive' });
        const e = Store.addChronoEntry({ activityId: a.id, date: '2026-06-02', minutes: 30 });

        Store.archiveChronoActivity(a.id);
        let cur = Store.getChronoActivities().find((x) => x.id === a.id);
        expect(cur.archived).toBe(true);
        expect(Store.getChronoEntries().find((x) => x.id === e.id)).toBeTruthy();

        Store.restoreChronoActivity(a.id);
        cur = Store.getChronoActivities().find((x) => x.id === a.id);
        expect(cur.archived).toBe(false);
    });

    it('mergeChronoActivities reassigns entries + sums snapshots', () => {
        const from = Store.addChronoActivity({ name: 'From' });
        const to = Store.addChronoActivity({ name: 'To' });
        Store.addChronoEntry({ activityId: from.id, date: '2026-06-02', minutes: 30 });
        Store.saveChronoSnapshots([
            { activityId: from.id, date: '2025-01-01', totalMinutes: 100 },
            { activityId: to.id, date: '2025-01-01', totalMinutes: 50 },
        ]);

        const ok = Store.mergeChronoActivities(from.id, to.id);
        expect(ok).toBe(true);

        const acts = Store.getChronoActivities();
        expect(acts.find((a) => a.id === from.id)).toBeUndefined();

        const entries = Store.getChronoEntries();
        expect(entries.every((e) => e.activityId === to.id)).toBe(true);

        const snaps = Store.getChronoSnapshots();
        const merged = snaps.find((s) => s.date === '2025-01-01' && s.activityId === to.id);
        expect(merged.totalMinutes).toBe(150);
    });

    it('compactChronoOlderThan90Once moves old entries into snapshots and is idempotent', () => {
        const a = Store.addChronoActivity({ name: 'Old' });
        // 100 days ago — should be compacted
        const oldDate = Store.getChronoActivities && (function () {
            const d = new Date();
            d.setDate(d.getDate() - 100);
            return d.toISOString().slice(0, 10);
        })();

        Store.saveChronoEntries([
            { id: 'e1', activityId: a.id, date: oldDate, minutes: 30, createdAt: '' },
            { id: 'e2', activityId: a.id, date: oldDate, minutes: 45, createdAt: '' },
        ]);

        const moved = Store.compactChronoOlderThan90Once();
        expect(moved).toBe(2);
        expect(Store.getChronoEntries().length).toBe(0);

        const snaps = Store.getChronoSnapshots();
        const snap = snaps.find((s) => s.date === oldDate && s.activityId === a.id);
        expect(snap.totalMinutes).toBe(75);

        // idempotent: second call is a no-op
        const movedAgain = Store.compactChronoOlderThan90Once();
        expect(movedAgain).toBe(0);
    });
});

describe('chrono analytics helpers', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('buildChronoPlanFacts compares linked task plan with tracked time', () => {
        const facts = Chrono.buildChronoPlanFacts(
            [{ id: 'a', name: 'Code', emoji: '💻', taskId: 't1' }],
            [{ id: 't1', title: 'Feature', plannedMinutes: 120 }],
            { a: 90 },
        );
        expect(facts).toEqual([
            expect.objectContaining({ activityId: 'a', planned: 120, actual: 90, delta: -30 }),
        ]);
    });

    it('buildChronoWeekInsights reports top activity, budget overrun and target underrun', () => {
        const insights = Chrono.buildChronoWeekInsights(
            [
                { id: 'a', name: 'Phone', budgetMinutesPerDay: 30 },
                { id: 'b', name: 'Read', targetMinutesPerDay: 60 },
            ],
            { a: 45, b: 20 },
            65,
            'day',
        );
        expect(insights.map((item) => item.kind)).toContain('top');
        expect(insights.map((item) => item.kind)).toContain('over');
        expect(insights.map((item) => item.kind)).toContain('under');
    });
});
