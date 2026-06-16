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

describe('chrono radial bubble layout', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    function makeActivities(count) {
        return Array.from({ length: count }, (_, i) => ({
            id: `activity-${i}`,
            name: `Activity ${i}`,
            emoji: '●',
            hue: (i * 47) % 360,
        }));
    }

    function makeMinutes(activities) {
        return activities.reduce((acc, activity, i) => {
            acc[activity.id] = Math.max(15, 360 - i * 24);
            return acc;
        }, {});
    }

    it('keeps resting bubbles separated across compact activity counts', () => {
        [4, 6, 8, 10, 12].forEach((count) => {
            const activities = makeActivities(count);
            const minutes = makeMinutes(activities);
            const sizeScale = Chrono.sizeScaleForCount(count, 195);
            const layout = Chrono.computeRadialLayout(activities, minutes, 360, 195, sizeScale);

            expect(Chrono.hasBubbleOverlap(layout.positioned, 10)).toBe(false);
            expect(layout.positioned[0].x).toBeCloseTo(0, 5);
            expect(layout.positioned[0].y).toBeCloseTo(0, 5);
        });
    });

    it('keeps extra air around dragged bubbles during reflow', () => {
        const activities = makeActivities(8);
        const minutes = makeMinutes(activities);
        const layout = Chrono.computeRadialLayout(activities, minutes, 360, 195, 0.86);
        const dragged = layout.positioned[3];
        // Тащим в реалистичную off-center точку. (0,0) больше не валиден: с
        // concentric-пакингом самый большой кружок всегда пришпилен в центре, и
        // посадить второй крупный кружок ровно поверх него геометрически нельзя —
        // двум большим в одной точке места нет (это был артефакт старой раскладки).
        const reflowed = Chrono.reflowAroundOverrides(
            layout.positioned,
            { [dragged.activity.id]: { x: 90, y: 120 } },
            195,
            (layout.cloudHeight + 112) / 2,
            { [dragged.activity.id]: true },
            22
        );

        expect(Chrono.hasBubbleOverlap(reflowed, 22)).toBe(false);
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

describe('Store — chrono tombstones', () => {
    let Store;
    let Utils;
    beforeEach(() => { ({ Store, Utils } = loadModules()); });

    it('keeps deleted activities from resurrecting when an old cloud array is saved', () => {
        const activity = Store.addChronoActivity({ name: 'Programming', emoji: '💻' });
        Store.deleteChronoActivity(activity.id);

        Store.saveChronoActivities([activity]);

        expect(Store.getChronoActivities()).toEqual([]);
        expect(Store.getChronoTombstones()).toEqual([
            expect.objectContaining({ type: 'activity', id: activity.id }),
        ]);
    });

    it('filters entries and snapshots belonging to a deleted activity', () => {
        const activity = Store.addChronoActivity({ name: 'Reading', emoji: '📚' });
        const entry = Store.addChronoEntry({ activityId: activity.id, date: '2026-06-03', minutes: 30 });

        Store.deleteChronoActivity(activity.id);
        Store.saveChronoEntries([entry]);
        Store.saveChronoSnapshots([{ date: '2026-06-03', activityId: activity.id, totalMinutes: 30 }]);

        expect(Store.getChronoEntries()).toEqual([]);
        expect(Store.getChronoSnapshots()).toEqual([]);
    });

    it('keeps deleted entries from resurrecting independently of activity deletion', () => {
        const activity = Store.addChronoActivity({ name: 'Sport', emoji: '🏃' });
        const entry = Store.addChronoEntry({ activityId: activity.id, date: '2026-06-03', minutes: 45 });

        Store.deleteChronoEntry(entry.id);
        Store.saveChronoEntries([entry]);

        expect(Store.getChronoActivities()).toHaveLength(1);
        expect(Store.getChronoEntries()).toEqual([]);
        expect(Store.getChronoTombstones()).toEqual([
            expect.objectContaining({ type: 'entry', id: entry.id }),
        ]);
    });

    it('activity newer than its tombstone survives (re-add overrides old delete)', () => {
        const a = Store.addChronoActivity({ name: 'Reading', emoji: '📚' });
        // старое удаление (час назад) — занятие создано только что → переживает
        Store.saveChronoTombstones([{ type: 'activity', id: a.id, deletedAt: Date.now() - 3600_000 }]);
        expect(Store.getChronoActivities().map((x) => x.id)).toContain(a.id);
    });

    it('activity older than its tombstone stays deleted (stale array cannot resurrect)', () => {
        const a = { id: 'stale-1', name: 'Old', createdAt: new Date(Date.now() - 3600_000).toISOString() };
        Store.saveChronoTombstones([{ type: 'activity', id: 'stale-1', deletedAt: Date.now() }]);
        Store.saveChronoActivities([a]);
        expect(Store.getChronoActivities()).toEqual([]);
    });

    it('entries/snapshots of a resurrected activity are kept', () => {
        const a = Store.addChronoActivity({ name: 'Sport' });
        const e = Store.addChronoEntry({ activityId: a.id, date: '2026-06-06', minutes: 30 });
        Store.saveChronoSnapshots([{ date: '2026-06-05', activityId: a.id, totalMinutes: 10 }]);
        // старое удаление этого же занятия — занятие новее → воскрешено, записи остаются
        Store.saveChronoTombstones([{ type: 'activity', id: a.id, deletedAt: Date.now() - 3600_000 }]);
        expect(Store.getChronoActivities().map((x) => x.id)).toContain(a.id);
        expect(Store.getChronoEntries().map((x) => x.id)).toContain(e.id);
        expect(Store.getChronoSnapshots()).toHaveLength(1);
    });

    it('reorderChronoRows rewrites real entry intervals for every row entry', () => {
        const a = Store.addChronoActivity({ name: 'Code' });
        const b = Store.addChronoActivity({ name: 'Podcast' });
        const e1 = Store.addChronoEntry({ activityId: a.id, date: '2026-06-02', minutes: 30 });
        const e2 = Store.addChronoEntry({ activityId: b.id, date: '2026-06-02', minutes: 30, parallelGroupId: 'g1' });
        const startMs = new Date('2026-06-02T07:00:00').getTime();
        const endMs = new Date('2026-06-02T08:30:00').getTime();

        const updated = Store.reorderChronoRows([{
            entryIds: [e1.id, e2.id],
            date: '2026-06-02',
            startMs,
            endMs,
            minutes: 90,
        }]);

        expect(updated).toHaveLength(2);
        Store.getChronoEntries().forEach((entry) => {
            expect(entry.minutes).toBe(90);
            expect(entry.date).toBe('2026-06-02');
            expect(entry.at).toBe(new Date(startMs).toISOString());
            expect(entry.createdAt).toBe(new Date(endMs).toISOString());
        });
    });

    it('addChronoEntry preserves explicit at and createdAt for pre-scheduled chrono segments', () => {
        const a = Store.addChronoActivity({ name: 'Code' });
        const entry = Store.addChronoEntry({
            activityId: a.id,
            date: '2026-06-02',
            minutes: 22,
            at: '2026-06-02T10:35:00.000Z',
            createdAt: '2026-06-02T10:57:00.000Z',
        });

        expect(entry.at).toBe('2026-06-02T10:35:00.000Z');
        expect(entry.createdAt).toBe('2026-06-02T10:57:00.000Z');
        expect(Store.getChronoEntries()[0]).toMatchObject({
            at: '2026-06-02T10:35:00.000Z',
            createdAt: '2026-06-02T10:57:00.000Z',
            minutes: 22,
        });
    });

    it('chronoDateStr treats 00:00-02:59 as the previous chrono day', () => {
        expect(Utils.chronoDateStr(new Date(2026, 5, 2, 2, 30))).toBe('2026-06-01');
        expect(Utils.chronoDateStr(new Date(2026, 5, 2, 3, 0))).toBe('2026-06-02');
    });

    it('addChronoEntry assigns date by chrono day when explicit date is omitted', () => {
        const a = Store.addChronoActivity({ name: 'Code' });
        const beforeBoundary = new Date(2026, 5, 2, 2, 30).toISOString();
        const afterBoundary = new Date(2026, 5, 2, 3, 0).toISOString();

        const early = Store.addChronoEntry({
            activityId: a.id,
            minutes: 20,
            at: beforeBoundary,
            createdAt: beforeBoundary,
        });
        const current = Store.addChronoEntry({
            activityId: a.id,
            minutes: 30,
            at: afterBoundary,
            createdAt: afterBoundary,
        });

        expect(early.date).toBe('2026-06-01');
        expect(current.date).toBe('2026-06-02');
    });

    it('merges incoming tombstones instead of replacing local delete history', () => {
        const localActivity = Store.addChronoActivity({ name: 'Local delete' });
        Store.deleteChronoActivity(localActivity.id);

        Store.saveChronoTombstones([{ type: 'activity', id: 'remote-delete', deletedAt: Date.now() }]);

        expect(Store.getChronoTombstones()).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'activity', id: localActivity.id }),
            expect.objectContaining({ type: 'activity', id: 'remote-delete' }),
        ]));
    });
});

describe('Store — clearChronoScope (убрать круг из дня, не удаляя занятие)', () => {
    let Store;
    beforeEach(() => { ({ Store } = loadModules()); });

    it('removes scoped entries/snapshots but keeps the activity and other dates', () => {
        const a = Store.addChronoActivity({ name: 'Reading', emoji: '📚' });
        const today = Store.addChronoEntry({ activityId: a.id, date: '2026-06-06', minutes: 30 });
        const other = Store.addChronoEntry({ activityId: a.id, date: '2026-06-05', minutes: 20 });
        Store.saveChronoSnapshots([
            { date: '2026-06-06', activityId: a.id, totalMinutes: 15 },
            { date: '2026-06-05', activityId: a.id, totalMinutes: 10 },
        ]);

        const removed = Store.clearChronoScope(a.id, ['2026-06-06']);

        // занятие живо
        expect(Store.getChronoActivities().map((x) => x.id)).toContain(a.id);
        // время за 2026-06-06 убрано, за 2026-06-05 — на месте
        expect(Store.getChronoEntries().map((e) => e.id)).toEqual([other.id]);
        expect(Store.getChronoSnapshots()).toEqual([
            { date: '2026-06-05', activityId: a.id, totalMinutes: 10 },
        ]);
        // удалённые записи возвращены для undo
        expect(removed.entries.map((e) => e.id)).toEqual([today.id]);
        // tombstone'ы на убранную запись и snapshot (не воскреснут из облака)
        expect(Store.getChronoTombstones()).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'entry', id: today.id }),
            expect.objectContaining({ type: 'snapshot', id: `2026-06-06:${a.id}` }),
        ]));
    });

    it('does not resurrect scoped snapshots when stale cloud data is saved later', () => {
        const a = Store.addChronoActivity({ name: 'Reading' });
        Store.saveChronoSnapshots([
            { date: '2026-06-06', activityId: a.id, totalMinutes: 40 },
        ]);

        Store.clearChronoScope(a.id, ['2026-06-06']);
        Store.saveChronoSnapshots([
            { date: '2026-06-06', activityId: a.id, totalMinutes: 40 },
        ]);

        expect(Store.getChronoSnapshots()).toEqual([]);
        expect(Store.getChronoTombstones()).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'snapshot', id: `2026-06-06:${a.id}` }),
        ]));
    });

    it('does not touch entries of other activities on the same date', () => {
        const a = Store.addChronoActivity({ name: 'Reading' });
        const b = Store.addChronoActivity({ name: 'Sport' });
        Store.addChronoEntry({ activityId: a.id, date: '2026-06-06', minutes: 30 });
        const keep = Store.addChronoEntry({ activityId: b.id, date: '2026-06-06', minutes: 25 });

        Store.clearChronoScope(a.id, ['2026-06-06']);

        expect(Store.getChronoEntries().map((e) => e.id)).toEqual([keep.id]);
    });

    it('recovers activities when LS value is an array-like object (sync corruption)', () => {
        const a = Store.addChronoActivity({ name: 'Reading' });
        const b = Store.addChronoActivity({ name: 'Sport' });
        const arr = Store.getChronoActivities();
        // эмулируем порчу: cloud-sync положил массив как объект {0:..,1:..}
        Store.lsSetRaw ? Store.lsSetRaw('heys_planning_chrono_activities', { 0: arr[0], 1: arr[1] })
            : window.HEYS.utils.lsSet('heys_planning_chrono_activities', { 0: arr[0], 1: arr[1] });
        const recovered = Store.getChronoActivities();
        expect(recovered.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('is a no-op with empty dates', () => {
        const a = Store.addChronoActivity({ name: 'Reading' });
        const e = Store.addChronoEntry({ activityId: a.id, date: '2026-06-06', minutes: 30 });
        const removed = Store.clearChronoScope(a.id, []);
        expect(removed.entries).toEqual([]);
        expect(Store.getChronoEntries().map((x) => x.id)).toEqual([e.id]);
    });
});

describe('Store — cloud pull merge by record (mergeCloudPlanningArray)', () => {
    let Store;
    beforeEach(() => { ({ Store } = loadModules()); });

    const K_ENTRIES = 'heys_planning_chrono_entries';
    const K_CHECKLISTS = 'heys_planning_checklists_v1';

    it('returns null for non-merge-safe keys (caller keeps wholesale replace)', () => {
        expect(Store.mergeCloudPlanningArray('heys_planning_tasks', [], [])).toBeNull();
        expect(Store.mergeCloudPlanningArray('heys_planning_projects', [], [])).toBeNull();
        expect(Store.mergeCloudPlanningArray('heys_planning_slots', [], [])).toBeNull();
        expect(Store.mergeCloudPlanningArray('heys_planning_links_v1', [], [])).toBeNull();
        expect(Store.mergeCloudPlanningArray('heys_planning_chrono_snapshots', [], [])).toBeNull();
    });

    it('unions local-only and remote-only records — neither side is lost', () => {
        const local = [{ id: 'L', activityId: 'a', date: '2026-06-04', minutes: 30, createdAt: '2026-06-04T10:00:00Z' }];
        const remote = [{ id: 'R', activityId: 'a', date: '2026-06-04', minutes: 45, createdAt: '2026-06-04T11:00:00Z' }];
        const merged = Store.mergeCloudPlanningArray(K_ENTRIES, local, remote);
        expect(merged.map((e) => e.id).sort()).toEqual(['L', 'R']);
    });

    it('on id-collision keeps the newer updatedAt — a local edit is not lost', () => {
        const local = [{ id: 'X', minutes: 99, createdAt: '2026-06-04T10:00:00Z', updatedAt: '2026-06-04T12:00:00Z' }];
        const remote = [{ id: 'X', minutes: 10, createdAt: '2026-06-04T10:00:00Z', updatedAt: '2026-06-04T11:00:00Z' }];
        const merged = Store.mergeCloudPlanningArray(K_ENTRIES, local, remote);
        expect(merged).toHaveLength(1);
        expect(merged[0].minutes).toBe(99);
    });

    it('a newer remote edit wins over a stale local copy', () => {
        const local = [{ id: 'X', minutes: 10, updatedAt: '2026-06-04T10:00:00Z' }];
        const remote = [{ id: 'X', minutes: 77, updatedAt: '2026-06-04T13:00:00Z' }];
        const merged = Store.mergeCloudPlanningArray(K_ENTRIES, local, remote);
        expect(merged[0].minutes).toBe(77);
    });

    it('equal-recency tie keeps the LOCAL record (possibly-unsynced edit)', () => {
        const ts = '2026-06-04T10:00:00Z';
        const local = [{ id: 'X', minutes: 1, updatedAt: ts }];
        const remote = [{ id: 'X', minutes: 2, updatedAt: ts }];
        const merged = Store.mergeCloudPlanningArray(K_ENTRIES, local, remote);
        expect(merged[0].minutes).toBe(1);
    });

    it('does NOT resurrect a locally-deleted entry carried by a stale cloud array', () => {
        const a = Store.addChronoActivity({ name: 'Sport' });
        const e = Store.addChronoEntry({ activityId: a.id, date: '2026-06-04', minutes: 30 });
        Store.deleteChronoEntry(e.id); // writes an entry tombstone
        const merged = Store.mergeCloudPlanningArray(K_ENTRIES, [], [e]);
        expect(merged.find((x) => x.id === e.id)).toBeUndefined();
    });

    it('activities: unions local-only and remote-only without losing either', () => {
        const local = [{ id: 'L', name: 'Local', order: 0, createdAt: '2026-06-04T10:00:00Z' }];
        const remote = [{ id: 'R', name: 'Remote', order: 1, createdAt: '2026-06-04T11:00:00Z' }];
        const merged = Store.mergeCloudPlanningArray('heys_planning_chrono_activities', local, remote);
        expect(merged.map((x) => x.id).sort()).toEqual(['L', 'R']);
    });

    it('activities: strips a locally-deleted activity carried by a stale cloud array', () => {
        const keep = Store.addChronoActivity({ name: 'Keep' });
        const gone = Store.addChronoActivity({ name: 'Gone' });
        Store.deleteChronoActivity(gone.id); // activity tombstone + removed from list
        const merged = Store.mergeCloudPlanningArray(
            'heys_planning_chrono_activities',
            Store.getChronoActivities(),
            [keep, gone], // cloud still has the deleted one
        );
        expect(merged.map((x) => x.id)).toContain(keep.id);
        expect(merged.find((x) => x.id === gone.id)).toBeUndefined();
    });

    it('is idempotent — re-merging the merged result yields identical bytes (no echo loop)', () => {
        const local = [
            { id: 'B', minutes: 2, createdAt: '2026-06-04T11:00:00Z' },
            { id: 'A', minutes: 1, createdAt: '2026-06-04T10:00:00Z' },
        ];
        const remote = [{ id: 'C', minutes: 3, createdAt: '2026-06-04T12:00:00Z' }];
        const once = Store.mergeCloudPlanningArray(K_ENTRIES, local, remote);
        const twice = Store.mergeCloudPlanningArray(K_ENTRIES, once, remote);
        expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    });

    it('checklists: creates records with a sync-safe key and merges local plus remote', () => {
        const local = Store.addChecklist({
            title: 'Local checklist',
            presetId: 'sea-tent-camping',
            adults: 2,
            children: 2,
            childAges: [1, 7],
            items: [
                { id: 'tent', group: 'Палаточный лагерь', text: 'Палатка', quantity: '4 места' },
            ],
        });
        const remote = {
            id: 'remote-checklist',
            title: 'Remote checklist',
            items: [],
            order: 1,
            createdAt: '2026-06-04T11:00:00Z',
            updatedAt: '2026-06-04T11:00:00Z',
        };

        const merged = Store.mergeCloudPlanningArray(K_CHECKLISTS, Store.getChecklists(), [remote]);

        expect(local.title).toBe('Local checklist');
        expect(local).toMatchObject({
            presetId: 'sea-tent-camping',
            adults: 2,
            children: 2,
            childAges: [1, 7],
        });
        expect(local.items[0]).toMatchObject({
            group: 'Палаточный лагерь',
            text: 'Палатка',
            quantity: '4 места',
            done: false,
        });
        expect(merged.map((item) => item.id).sort()).toEqual([local.id, 'remote-checklist'].sort());
    });

    it('checklists: checked item state is persisted in the sync-backed checklist key', () => {
        const checklist = Store.addChecklist({
            title: 'Packing',
            items: [
                { id: 'passport', group: 'Документы', text: 'Паспорт' },
                { id: 'ticket', group: 'Документы', text: 'Билет' },
            ],
        });

        Store.updateChecklist(checklist.id, {
            items: checklist.items.map((item) => (
                item.id === 'passport' ? { ...item, done: true } : item
            )),
        });

        const saved = Store.getChecklists().find((item) => item.id === checklist.id);
        expect(saved.items.find((item) => item.id === 'passport').done).toBe(true);
        expect(saved.items.find((item) => item.id === 'ticket').done).toBe(false);
    });

    it('checklists: custom empty sections persist across item updates', () => {
        const checklist = Store.addChecklist({
            title: 'Packing',
            customGroups: ['Документы'],
            items: [],
        });

        Store.updateChecklist(checklist.id, {
            customGroups: ['Документы', 'Аптечка'],
        });
        Store.updateChecklist(checklist.id, {
            items: [{ id: 'passport', group: 'Документы', text: 'Паспорт' }],
        });

        const saved = Store.getChecklists().find((item) => item.id === checklist.id);
        expect(saved.customGroups).toEqual(['Документы', 'Аптечка']);
        expect(saved.items[0]).toMatchObject({ group: 'Документы', text: 'Паспорт' });
    });

    it('checklists: archive status persists and hard delete removes archived records', () => {
        const checklist = Store.addChecklist({ title: 'Old packing' });

        Store.updateChecklist(checklist.id, { status: 'archived' });
        expect(Store.getChecklists().find((item) => item.id === checklist.id).status).toBe('archived');

        Store.updateChecklist(checklist.id, { status: 'active' });
        expect(Store.getChecklists().find((item) => item.id === checklist.id).status).toBe('active');

        Store.deleteChecklist(checklist.id);
        expect(Store.getChecklists().find((item) => item.id === checklist.id)).toBeUndefined();
    });

    it('checklists: tombstones prevent stale cloud arrays from resurrecting deleted lists', () => {
        const keep = Store.addChecklist({ title: 'Keep' });
        const gone = Store.addChecklist({ title: 'Gone' });
        Store.deleteChecklist(gone.id);

        const merged = Store.mergeCloudPlanningArray(K_CHECKLISTS, Store.getChecklists(), [keep, gone]);

        expect(merged.map((item) => item.id)).toContain(keep.id);
        expect(merged.find((item) => item.id === gone.id)).toBeUndefined();
        expect(Store.isCloudChecklistWipeSuspicious(K_CHECKLISTS, [keep], [])).toBe(true);
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

describe('chrono.buildDisplayChronoActivities', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('keeps time-bearing bubbles visible when activity metadata is not loaded yet', () => {
        const activities = Chrono.buildDisplayChronoActivities([], { missing: 30 });

        expect(activities).toEqual([
            expect.objectContaining({
                id: 'missing',
                name: 'Занятие',
                isPlaceholder: true,
            }),
        ]);
    });

    it('does not create placeholders for zero-minute activities', () => {
        const activities = Chrono.buildDisplayChronoActivities([{ id: 'known', name: 'Known' }], {
            known: 0,
            missing: 0,
        });

        expect(activities).toEqual([{ id: 'known', name: 'Known' }]);
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

    it('represents parallel activity as two same-duration entries', () => {
        const primary = Store.addChronoActivity({ name: 'Programming' });
        const parallel = Store.addChronoActivity({ name: 'Phone calls' });

        const first = Store.addChronoEntry({ activityId: primary.id, date: '2026-06-02', minutes: 30, parallelGroupId: 'g1' });
        const second = Store.addChronoEntry({ activityId: parallel.id, date: '2026-06-02', minutes: 30, parallelGroupId: 'g1' });

        expect(first.id).not.toBe(second.id);
        expect(Store.getChronoEntries()).toEqual(expect.arrayContaining([
            expect.objectContaining({ activityId: primary.id, minutes: 30, parallelGroupId: 'g1' }),
            expect.objectContaining({ activityId: parallel.id, minutes: 30, parallelGroupId: 'g1' }),
        ]));
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

    it('persists and updates activity category', () => {
        const a = Store.addChronoActivity({ name: 'Coding', category: 'focus' });
        expect(a.category).toBe('focus');

        Store.updateChronoActivity(a.id, { category: 'growth' });
        const cur = Store.getChronoActivities().find((x) => x.id === a.id);
        expect(cur.category).toBe('growth');
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

describe('chrono parallel activity options', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('filters current and archived activities, then sorts by name', () => {
        const options = Chrono.getParallelActivityOptions([
            { id: 'coding', name: 'Programming', emoji: '💻' },
            { id: 'sport', name: 'Sport', emoji: '🏃' },
            { id: 'phone', name: 'Phone', emoji: '📱' },
            { id: 'old', name: 'Archived', archived: true },
        ], 'coding');

        expect(options.map((item) => item.id)).toEqual(['phone', 'sport']);
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
        expect(insights.map((item) => item.kind)).not.toContain('total');
    });

    it('buildCategoryBalance groups tracked time by inferred and explicit category', () => {
        const balance = Chrono.buildCategoryBalance(
            [
                { id: 'a', name: 'Programming', category: 'focus' },
                { id: 'b', name: 'Залип в телефоне' },
            ],
            { a: 90, b: 30 },
        );
        expect(balance[0]).toMatchObject({ id: 'focus', minutes: 90, pct: 75 });
        expect(balance[1]).toMatchObject({ id: 'drain', minutes: 30, pct: 25 });
    });

    it('buildDayTimeline sorts entries chronologically and attaches activity category', () => {
        const timeline = Chrono.buildDayTimeline(
            [
                { id: 'e2', activityId: 'a', date: '2026-06-02', minutes: 20, createdAt: '2026-06-02T12:00:00Z' },
                { id: 'e1', activityId: 'a', date: '2026-06-02', minutes: 10, createdAt: '2026-06-02T09:00:00Z' },
            ],
            [{ id: 'a', name: 'Read', category: 'growth' }],
            '2026-06-02',
        );
        expect(timeline.map((entry) => entry.id)).toEqual(['e1', 'e2']);
        expect(timeline[0].category).toBe('growth');
    });

    it('buildLastAddedSummary formats last entry, current time and elapsed decimal hours', () => {
        const summary = Chrono.buildLastAddedSummary(
            [
                { id: 'old', activityId: 'a', date: '2026-06-02', minutes: 15, createdAt: '2026-06-02T08:00:00' },
                { id: 'new', activityId: 'b', date: '2026-06-02', minutes: 30, createdAt: '2026-06-02T09:00:00' },
            ],
            [{ id: 'a', name: 'Read' }, { id: 'b', name: 'Programming' }],
            new Date('2026-06-02T10:30:00').getTime(),
        );

        expect(summary).toMatchObject({
            timeLabel: '09:00',
            nowLabel: '10:30',
            detail: '+30м Programming',
            elapsedHoursLabel: '1,5ч',
        });
    });

    it('buildLastAddedSummary ignores deleted activities and other dates', () => {
        const summary = Chrono.buildLastAddedSummary(
            [
                { id: 'alive', activityId: 'a', date: '2026-06-02', minutes: 15, createdAt: '2026-06-02T08:00:00' },
                { id: 'deleted-activity', activityId: 'deleted', date: '2026-06-02', minutes: 120, createdAt: '2026-06-02T09:00:00' },
                { id: 'other-day', activityId: 'b', date: '2026-06-03', minutes: 60, createdAt: '2026-06-03T11:00:00' },
            ],
            [{ id: 'a', name: 'Read' }, { id: 'b', name: 'Programming' }],
            new Date('2026-06-02T10:00:00').getTime(),
            '2026-06-02',
        );

        expect(summary).toMatchObject({
            timeLabel: '08:00',
            detail: '+15м Read',
        });
    });

    it('buildChronoLoggedRows uses wake time, previous end and parallel names', () => {
        const rows = Chrono.buildChronoLoggedRows(
            { sleepEnd: '07:00' },
            [
                { id: 'first', activityId: 'a', date: '2026-06-02', minutes: 60, createdAt: '2026-06-02T08:00:00' },
                { id: 'p1', activityId: 'b', date: '2026-06-02', minutes: 90, createdAt: '2026-06-02T10:30:00', parallelGroupId: 'g1' },
                { id: 'p2', activityId: 'c', date: '2026-06-02', minutes: 90, createdAt: '2026-06-02T10:30:00', parallelGroupId: 'g1' },
            ],
            [{ id: 'a', name: 'Read' }, { id: 'b', name: 'Code' }, { id: 'c', name: 'Podcast' }],
            '2026-06-02',
        );

        expect(rows).toMatchObject([
            { id: 'entry:first', entryIds: ['first'], timeRange: '07:00–08:00', durationLabel: '1ч', name: 'Read' },
            { id: 'parallel:g1', entryIds: ['p1', 'p2'], timeRange: '08:00–10:30', durationLabel: '2ч 30м', name: 'Code · Podcast' },
        ]);
    });

    it('buildChronoLoggedRows collapses multi-activity untracked flow into one display row', () => {
        const rows = Chrono.buildChronoLoggedRows(
            { sleepEnd: '07:00' },
            [
                {
                    id: 'u1',
                    activityId: 'a',
                    date: '2026-06-02',
                    minutes: 22,
                    at: '2026-06-02T10:35:00',
                    createdAt: '2026-06-02T11:24:00',
                    displayGroupId: 'ug1',
                    displayStartAt: '2026-06-02T10:35:00',
                    displayEndAt: '2026-06-02T11:24:00',
                },
                {
                    id: 'u2',
                    activityId: 'b',
                    date: '2026-06-02',
                    minutes: 17,
                    at: '2026-06-02T10:35:00',
                    createdAt: '2026-06-02T11:24:00',
                    displayGroupId: 'ug1',
                    displayStartAt: '2026-06-02T10:35:00',
                    displayEndAt: '2026-06-02T11:24:00',
                },
                {
                    id: 'u3',
                    activityId: 'c',
                    date: '2026-06-02',
                    minutes: 10,
                    at: '2026-06-02T10:35:00',
                    createdAt: '2026-06-02T11:24:00',
                    displayGroupId: 'ug1',
                    displayStartAt: '2026-06-02T10:35:00',
                    displayEndAt: '2026-06-02T11:24:00',
                },
            ],
            [
                { id: 'a', name: 'Morning' },
                { id: 'b', name: 'Game' },
                { id: 'c', name: 'Routine' },
            ],
            '2026-06-02',
        );

        expect(rows).toMatchObject([
            {
                id: 'display:ug1',
                entryIds: ['u1', 'u2', 'u3'],
                timeRange: '10:35–11:24',
                durationLabel: '49м',
                name: 'Morning · Game · Routine',
            },
        ]);
    });

    it('buildChronoReorderAssignments keeps durations and rewrites contiguous intervals', () => {
        const start = new Date('2026-06-02T07:00:00').getTime();
        const rows = [
            { id: 'a', entryIds: ['a1'], durationMinutes: 60 },
            { id: 'b', entryIds: ['b1', 'b2'], durationMinutes: 150 },
        ];
        const assignments = Chrono.buildChronoReorderAssignments([rows[1], rows[0]], '2026-06-02', start);

        expect(assignments).toMatchObject([
            {
                id: 'b',
                entryIds: ['b1', 'b2'],
                date: '2026-06-02',
                startMs: start,
                endMs: start + 150 * 60000,
                minutes: 150,
            },
            {
                id: 'a',
                entryIds: ['a1'],
                date: '2026-06-02',
                startMs: start + 150 * 60000,
                endMs: start + 210 * 60000,
                minutes: 60,
            },
        ]);
    });

    it('computeChronoCoveredMinutes counts parallel entries as one real period', () => {
        const covered = Chrono.computeChronoCoveredMinutes(
            [
                { id: 'a1', activityId: 'a', date: '2026-06-02', minutes: 60, parallelGroupId: 'g1' },
                { id: 'b1', activityId: 'b', date: '2026-06-02', minutes: 60, parallelGroupId: 'g1' },
                { id: 'c1', activityId: 'c', date: '2026-06-02', minutes: 30 },
            ],
            [],
            '2026-06-02',
        );

        expect(covered).toBe(90);
    });

    it('buildUntrackedChronoSummary counts from the last remaining entry', () => {
        const summary = Chrono.buildUntrackedChronoSummary(
            { sleepEnd: '07:00' },
            [
                { id: 'old', date: '2026-06-02', minutes: 60, createdAt: '2026-06-02T08:00:00' },
                { id: 'last', date: '2026-06-02', minutes: 30, createdAt: '2026-06-02T09:30:00' },
                { id: 'other-day', date: '2026-06-01', minutes: 120, createdAt: '2026-06-01T12:00:00' },
            ],
            '2026-06-02',
            new Date('2026-06-02T10:00:00').getTime(),
        );

        expect(summary).toMatchObject({
            minutes: 30,
            hoursLabel: '0,5ч',
            wakeLabel: '07:00',
            sinceLabel: '09:30',
            sinceKind: 'last-entry',
        });
    });

    it('buildUntrackedChronoSummary counts from wake time when there are no entries', () => {
        const summary = Chrono.buildUntrackedChronoSummary(
            { sleepEnd: '07:00' },
            [],
            '2026-06-02',
            new Date('2026-06-02T10:00:00').getTime(),
        );

        expect(summary).toMatchObject({
            minutes: 180,
            hoursLabel: '3,0ч',
            wakeLabel: '07:00',
            sinceLabel: '07:00',
            sinceKind: 'wake',
        });
    });

    it('buildUntrackedChronoSummary treats 00:00-02:59 as the tail of the selected chrono day', () => {
        const summary = Chrono.buildUntrackedChronoSummary(
            { sleepEnd: '02:00' },
            [],
            '2026-06-01',
            new Date(2026, 5, 2, 2, 30).getTime(),
        );

        expect(summary).toMatchObject({
            minutes: 30,
            wakeLabel: '02:00',
            sinceLabel: '02:00',
            sinceKind: 'wake',
        });
    });

    it('splitMinutesForWheel prepares untracked duration for custom picker', () => {
        expect(Chrono.splitMinutesForWheel(228)).toEqual({ hours: 3, minutes: 48 });
        expect(Chrono.splitMinutesForWheel(24 * 60 + 30)).toEqual({ hours: 23, minutes: 59 });
        expect(Chrono.splitMinutesForWheel(-10)).toEqual({ hours: 0, minutes: 0 });
    });

    it('buildSmartSuggestions returns last and yesterday presets', () => {
        const suggestions = Chrono.buildSmartSuggestions(
            { id: 'a', name: 'Focus' },
            [
                { activityId: 'a', date: '2026-06-01', minutes: 40, createdAt: '2026-06-01T10:00:00Z' },
                { activityId: 'a', date: '2026-05-31', minutes: 25, createdAt: '2026-06-02T10:00:00Z' },
            ],
            '2026-06-02',
        );
        expect(suggestions[0]).toMatchObject({ id: 'last', minutes: 25 });
        expect(suggestions[1]).toMatchObject({ id: 'yesterday', minutes: 40 });
    });

    it('buildWeeklyReport returns premium summary when week has tracked time', () => {
        const report = Chrono.buildWeeklyReport(
            [{ id: 'a', name: 'Code', category: 'focus' }],
            [{ activityId: 'a', date: '2026-06-01', minutes: 60 }],
            [],
            ['2026-06-01', '2026-06-02'],
            { a: 60 },
        );
        expect(report).toMatchObject({
            total: 60,
            headline: expect.any(String),
            recommendation: expect.any(String),
        });
        expect(report.score).toBeGreaterThan(0);
    });
});

describe('chrono.buildGoalStreaks', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    const OLD = '2026-01-01T00:00:00Z';

    it('counts consecutive target-met days from today backward', () => {
        const acts = [{ id: 'a', name: 'Sport', targetMinutesPerDay: 60, createdAt: OLD }];
        const entries = [
            { activityId: 'a', date: '2026-06-04', minutes: 60 },
            { activityId: 'a', date: '2026-06-03', minutes: 90 },
            { activityId: 'a', date: '2026-06-02', minutes: 30 }, // < 60 → breaks
        ];
        const res = Chrono.buildGoalStreaks(acts, entries, [], '2026-06-04');
        expect(res).toHaveLength(1);
        expect(res[0]).toMatchObject({ kind: 'target', streak: 2, metToday: true });
    });

    it('does not break a target streak mid-day when today is still pending', () => {
        const acts = [{ id: 'b', name: 'Read', targetMinutesPerDay: 120, createdAt: OLD }];
        const entries = [
            { activityId: 'b', date: '2026-06-04', minutes: 30 },  // not met yet today
            { activityId: 'b', date: '2026-06-03', minutes: 120 },
            { activityId: 'b', date: '2026-06-02', minutes: 130 },
        ];
        const res = Chrono.buildGoalStreaks(acts, entries, [], '2026-06-04');
        expect(res[0]).toMatchObject({ streak: 2, metToday: false });
    });

    it('counts budget clean-streak only since activity creation', () => {
        const acts = [{ id: 'c', name: 'Phone', budgetMinutesPerDay: 30, createdAt: '2026-06-01T00:00:00Z' }];
        const entries = [{ activityId: 'c', date: '2026-06-04', minutes: 10 }]; // under limit
        // 06-01..06-04, all <= 30 (empty days = 0) → streak 4, clamped to creation
        const res = Chrono.buildGoalStreaks(acts, entries, [], '2026-06-04');
        expect(res[0]).toMatchObject({ kind: 'budget', streak: 4 });
    });

    it('breaks budget streak on an over-limit day', () => {
        const acts = [{ id: 'c', name: 'Phone', budgetMinutesPerDay: 30, createdAt: '2026-06-02T00:00:00Z' }];
        const entries = [{ activityId: 'c', date: '2026-06-03', minutes: 99 }]; // over on 06-03
        const res = Chrono.buildGoalStreaks(acts, entries, [], '2026-06-04');
        // 06-04 (0, met), 06-03 (99, over → break) → streak 1, filtered out (<2)
        expect(res).toHaveLength(0);
    });

    it('ignores activities without a daily goal and archived ones', () => {
        const acts = [
            { id: 'd', name: 'No goal', createdAt: OLD },
            { id: 'e', name: 'Archived', targetMinutesPerDay: 10, archived: true, createdAt: OLD },
        ];
        const entries = [
            { activityId: 'd', date: '2026-06-04', minutes: 60 },
            { activityId: 'e', date: '2026-06-04', minutes: 60 },
        ];
        expect(Chrono.buildGoalStreaks(acts, entries, [], '2026-06-04')).toHaveLength(0);
    });
});

describe('chrono.buildWeekTrend', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    const week = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'];

    it('computes deltas and percent vs previous week', () => {
        const acts = [{ id: 'a', name: 'Code', category: 'focus' }];
        // prev week (shifted -7): 2026-05-25 has 60 min
        const entries = [{ activityId: 'a', date: '2026-05-25', minutes: 60 }];
        const trend = Chrono.buildWeekTrend(acts, entries, [], week, { a: 120 });
        expect(trend).toMatchObject({ prevTotal: 60, totalDelta: 60, totalPct: 100 });
        expect(trend.focus).toMatchObject({ now: 120, prev: 60, delta: 60 });
        expect(trend.drain.delta).toBe(0);
    });

    it('returns null percent when previous week had no data', () => {
        const acts = [{ id: 'a', name: 'Code', category: 'focus' }];
        const trend = Chrono.buildWeekTrend(acts, [], [], week, { a: 100 });
        expect(trend).toMatchObject({ prevTotal: 0, totalDelta: 100, totalPct: null });
    });
});

describe('chrono.computeWeekScore', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    it('grows monotonically with focus share', () => {
        const low = Chrono.computeWeekScore({ focusShare: 0.1, drainShare: 0, daysTracked: 7, hasGoals: false });
        const high = Chrono.computeWeekScore({ focusShare: 0.5, drainShare: 0, daysTracked: 7, hasGoals: false });
        expect(high.score).toBeGreaterThan(low.score);
    });

    it('penalizes drain share', () => {
        const clean = Chrono.computeWeekScore({ focusShare: 0.4, drainShare: 0, daysTracked: 7, hasGoals: false });
        const dirty = Chrono.computeWeekScore({ focusShare: 0.4, drainShare: 0.3, daysTracked: 7, hasGoals: false });
        expect(dirty.score).toBeLessThan(clean.score);
    });

    it('clamps to 0..100 and parts(clamped) equal score', () => {
        const r = Chrono.computeWeekScore({ focusShare: 1, drainShare: 0, daysTracked: 7, goalHitRate: 1, hasGoals: true });
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(100);
        const sum = r.parts.reduce((s, p) => s + p.points, 0);
        expect(Math.max(0, Math.min(100, sum))).toBe(r.score);
    });

    it('does not lower score when no goals are set (goal weight folds into base)', () => {
        const noGoals = Chrono.computeWeekScore({ focusShare: 0.5, drainShare: 0, daysTracked: 7, hasGoals: false });
        const withGoalsMissed = Chrono.computeWeekScore({ focusShare: 0.5, drainShare: 0, daysTracked: 7, goalHitRate: 0, hasGoals: true });
        expect(noGoals.score).toBeGreaterThan(withGoalsMissed.score);
        expect(noGoals.parts.some((p) => p.label === 'Цели')).toBe(false);
    });
});

describe('chrono.buildTimeOfDayPattern', () => {
    let Chrono;
    beforeEach(() => { ({ Chrono } = loadModules()); });

    const focusAct = { id: 'f', name: 'Code', category: 'focus' };

    it('buckets focus minutes by hour from `at` and surfaces dominant part', () => {
        const entries = [
            { activityId: 'f', date: '2026-06-04', minutes: 60, at: '2026-06-04T08:00:00' },
            { activityId: 'f', date: '2026-06-03', minutes: 50, at: '2026-06-03T09:30:00' },
            { activityId: 'f', date: '2026-06-02', minutes: 40, at: '2026-06-02T07:15:00' },
        ];
        const res = Chrono.buildTimeOfDayPattern([focusAct], entries, '2026-06-04');
        expect(res.focus).toMatchObject({ part: 'morning' });
        expect(res.headline).toMatch(/Фокус чаще утром/);
    });

    it('falls back to createdAt when `at` missing', () => {
        const entries = [
            { activityId: 'f', date: '2026-06-04', minutes: 60, createdAt: '2026-06-04T20:00:00' },
            { activityId: 'f', date: '2026-06-03', minutes: 50, createdAt: '2026-06-03T21:00:00' },
            { activityId: 'f', date: '2026-06-02', minutes: 40, createdAt: '2026-06-02T19:00:00' },
        ];
        const res = Chrono.buildTimeOfDayPattern([focusAct], entries, '2026-06-04');
        expect(res.focus).toMatchObject({ part: 'evening' });
    });

    it('returns null focus when too few focus entries', () => {
        const entries = [
            { activityId: 'f', date: '2026-06-04', minutes: 60, at: '2026-06-04T08:00:00' },
            { activityId: 'f', date: '2026-06-03', minutes: 50, at: '2026-06-03T09:00:00' },
        ];
        const res = Chrono.buildTimeOfDayPattern([focusAct], entries, '2026-06-04');
        expect(res.focus).toBeNull();
        expect(res.headline).toBeNull();
    });
});

describe('store.addChronoEntry — `at` field', () => {
    let Chrono, Store;
    beforeEach(() => { ({ Chrono, Store } = loadModules()); });

    it('persists provided `at` and defaults to a timestamp when omitted', () => {
        const activity = Store.addChronoActivity({ name: 'Code', emoji: '💻' });
        Store.addChronoEntry({ activityId: activity.id, minutes: 25, at: '2026-06-04T08:00:00.000Z' });
        Store.addChronoEntry({ activityId: activity.id, minutes: 10 });
        const entries = Store.getChronoEntries();
        expect(entries).toHaveLength(2);
        const withAt = entries.find((e) => e.minutes === 25);
        const withoutAt = entries.find((e) => e.minutes === 10);
        expect(withAt.at).toBe('2026-06-04T08:00:00.000Z');
        expect(typeof withoutAt.at).toBe('string');
        expect(withoutAt.at.length).toBeGreaterThan(0);
    });
});
