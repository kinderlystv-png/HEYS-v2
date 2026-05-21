/**
 * Tests for heys_planning_gantt_migration_v1.js — idempotent backfill of
 * progress / isMilestone fields on existing tasks.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_planning_gantt_migration_v1.js'),
    'utf8'
);

let Migration;
let lsStore;
let mockTasks;
let savedTasks;

function setup(initialTasks) {
    mockTasks = initialTasks.slice();
    savedTasks = null;
    lsStore = {};
    window.HEYS = {
        utils: {
            lsGet: (k, fallback) => (k in lsStore ? lsStore[k] : fallback),
            lsSet: (k, v) => { lsStore[k] = v; },
        },
        Planning: {
            Store: {
                getTasks: () => mockTasks,
                saveTasks: (next) => {
                    savedTasks = next;
                    mockTasks = next;
                },
            },
        },
    };
    // eslint-disable-next-line no-new-func
    new Function(SRC)();
    Migration = window.HEYS.PlanningGanttMigration;
}

describe('PlanningGanttMigration.run', () => {
    beforeEach(() => {
        savedTasks = null;
    });

    it('backfills progress=0 for non-done tasks and progress=100 for done', () => {
        setup([
            { id: 'a', status: 'in_progress' },
            { id: 'b', status: 'done' },
            { id: 'c', status: 'todo' },
        ]);
        const res = Migration.run();
        expect(res.ok).toBe(true);
        expect(res.migrated).toBe(3);
        expect(savedTasks[0].progress).toBe(0);
        expect(savedTasks[0].isMilestone).toBe(false);
        expect(savedTasks[1].progress).toBe(100);
        expect(savedTasks[1].isMilestone).toBe(false);
        expect(savedTasks[2].progress).toBe(0);
    });

    it('preserves explicit numeric progress, clamps out-of-range', () => {
        setup([
            { id: 'a', status: 'in_progress', progress: 42 },
            { id: 'b', status: 'in_progress', progress: 150 },
            { id: 'c', status: 'in_progress', progress: -10 },
        ]);
        Migration.run();
        // Only fields without isMilestone trigger migration; here `isMilestone` is missing
        // for all → all migrated (overwriting clamped progress).
        expect(savedTasks[0].progress).toBe(42);
        expect(savedTasks[1].progress).toBe(100);
        expect(savedTasks[2].progress).toBe(0);
    });

    it('preserves explicit isMilestone=true', () => {
        setup([
            { id: 'a', status: 'todo', isMilestone: true },
            { id: 'b', status: 'todo', isMilestone: false },
        ]);
        Migration.run();
        expect(savedTasks[0].isMilestone).toBe(true);
        expect(savedTasks[1].isMilestone).toBe(false);
    });

    it('is idempotent — second call is a no-op when flag is set', () => {
        setup([{ id: 'a', status: 'in_progress' }]);
        const r1 = Migration.run();
        expect(r1.migrated).toBe(1);
        savedTasks = null;
        const r2 = Migration.run();
        expect(r2.alreadyDone).toBe(true);
        expect(savedTasks).toBe(null); // saveTasks not called
    });

    it('force=true re-processes even when flag is set, but skips already-migrated tasks', () => {
        // First migration writes the flag.
        setup([{ id: 'a', status: 'in_progress' }]);
        Migration.run();
        savedTasks = null;
        // Add a new task that needs migration; existing one should not be re-touched.
        mockTasks.push({ id: 'b', status: 'done' });
        const r = Migration.run({ force: true });
        expect(r.ok).toBe(true);
        expect(r.migrated).toBe(1); // only task `b` needed it
        expect(savedTasks).not.toBe(null);
        expect(savedTasks.find((t) => t.id === 'b').progress).toBe(100);
        expect(savedTasks.find((t) => t.id === 'a').progress).toBe(0);
    });

    it('handles empty tasks array', () => {
        setup([]);
        const r = Migration.run();
        expect(r.ok).toBe(true);
        expect(r.migrated).toBe(0);
        expect(r.total).toBe(0);
    });

    it('returns store_unavailable when Planning.Store missing', () => {
        window.HEYS = { utils: { lsGet: () => null, lsSet: () => {} } };
        // eslint-disable-next-line no-new-func
        new Function(SRC)();
        const res = window.HEYS.PlanningGanttMigration.run();
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('store_unavailable');
    });
});
