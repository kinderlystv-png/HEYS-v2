/**
 * Pure-function tests for heys_planning_gantt_critical_path_v1.js (Phase 4b).
 * CPM: forward/backward pass, cycle detection, conflict detection, progress slack.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_planning_gantt_critical_path_v1.js'),
    'utf8'
);

let CP;
let Utils;

beforeAll(() => {
    Utils = {
        dateStr: () => '2026-04-15',
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
    };
    window.HEYS = { Planning: { Utils } };
    // eslint-disable-next-line no-new-func
    new Function(SRC)();
    CP = window.HEYS.PlanningGanttCriticalPath;
});

describe('PlanningGanttCriticalPath.buildDependencyGraph', () => {
    it('links predecessors/successors via blockedByTaskIds', () => {
        const tasks = [
            { id: 'A' },
            { id: 'B', blockedByTaskIds: ['A'] },
            { id: 'C', blockedByTaskIds: ['B'] },
        ];
        const g = CP.buildDependencyGraph(tasks);
        expect(g.size).toBe(3);
        expect(Array.from(g.get('A').successors)).toEqual(['B']);
        expect(Array.from(g.get('B').predecessors)).toEqual(['A']);
        expect(Array.from(g.get('B').successors)).toEqual(['C']);
        expect(Array.from(g.get('C').predecessors)).toEqual(['B']);
    });

    it('ignores self-loops and dangling references', () => {
        const tasks = [
            { id: 'A', blockedByTaskIds: ['A'] },           // self-loop
            { id: 'B', blockedByTaskIds: ['ghost-id'] },    // dangling
        ];
        const g = CP.buildDependencyGraph(tasks);
        expect(g.get('A').predecessors.size).toBe(0);
        expect(g.get('B').predecessors.size).toBe(0);
    });
});

describe('PlanningGanttCriticalPath.topologicalSort', () => {
    it('returns ordered ids and hasCycle=false for a DAG', () => {
        const tasks = [
            { id: 'A' },
            { id: 'B', blockedByTaskIds: ['A'] },
            { id: 'C', blockedByTaskIds: ['B'] },
        ];
        const g = CP.buildDependencyGraph(tasks);
        const { order, hasCycle } = CP.topologicalSort(g);
        expect(hasCycle).toBe(false);
        expect(order).toEqual(['A', 'B', 'C']);
    });

    it('detects cycles', () => {
        const tasks = [
            { id: 'A', blockedByTaskIds: ['B'] },
            { id: 'B', blockedByTaskIds: ['C'] },
            { id: 'C', blockedByTaskIds: ['A'] },
        ];
        const g = CP.buildDependencyGraph(tasks);
        const { hasCycle } = CP.topologicalSort(g);
        expect(hasCycle).toBe(true);
    });
});

describe('PlanningGanttCriticalPath.computeCriticalPath', () => {
    it('returns empty set + hasCycle=true on cycle', () => {
        const tasks = [
            { id: 'A', startDate: '2026-04-10', dueDate: '2026-04-12', blockedByTaskIds: ['B'] },
            { id: 'B', startDate: '2026-04-13', dueDate: '2026-04-15', blockedByTaskIds: ['A'] },
        ];
        const { criticalIds, hasCycle } = CP.computeCriticalPath(tasks, Utils);
        expect(hasCycle).toBe(true);
        expect(criticalIds.size).toBe(0);
    });

    it('marks the longest-duration path as critical', () => {
        // Two parallel paths to a common finish:
        //   A(3d) → B(5d) → D(2d)   total 10
        //   A(3d) → C(2d) → D(2d)   total 7
        // Critical = {A, B, D}, slack on C.
        const tasks = [
            { id: 'A', startDate: '2026-04-01', dueDate: '2026-04-03' }, // 3 days
            { id: 'B', startDate: '2026-04-04', dueDate: '2026-04-08', blockedByTaskIds: ['A'] }, // 5 days
            { id: 'C', startDate: '2026-04-04', dueDate: '2026-04-05', blockedByTaskIds: ['A'] }, // 2 days
            { id: 'D', startDate: '2026-04-09', dueDate: '2026-04-10', blockedByTaskIds: ['B', 'C'] }, // 2 days
        ];
        const { criticalIds, hasCycle } = CP.computeCriticalPath(tasks, Utils);
        expect(hasCycle).toBe(false);
        expect(criticalIds.has('A')).toBe(true);
        expect(criticalIds.has('B')).toBe(true);
        expect(criticalIds.has('D')).toBe(true);
        expect(criticalIds.has('C')).toBe(false); // slack > 0 on shorter branch
    });
});

describe('PlanningGanttCriticalPath.detectConflicts', () => {
    it('flags overlapping tasks within the same project', () => {
        const tasks = [
            { id: 'A', projectId: 'P1', startDate: '2026-04-01', dueDate: '2026-04-10' },
            { id: 'B', projectId: 'P1', startDate: '2026-04-05', dueDate: '2026-04-15' },
            { id: 'C', projectId: 'P1', startDate: '2026-04-20', dueDate: '2026-04-22' },
        ];
        const out = CP.detectConflicts(tasks);
        expect(out.has('A')).toBe(true);
        expect(out.has('B')).toBe(true);
        expect(out.has('C')).toBe(false);
    });

    it('does not flag tasks across different projects', () => {
        const tasks = [
            { id: 'A', projectId: 'P1', startDate: '2026-04-01', dueDate: '2026-04-10' },
            { id: 'B', projectId: 'P2', startDate: '2026-04-05', dueDate: '2026-04-15' },
        ];
        expect(CP.detectConflicts(tasks).size).toBe(0);
    });

    it('skips milestones and undated tasks', () => {
        const tasks = [
            { id: 'M', projectId: 'P1', startDate: '2026-04-05', dueDate: '2026-04-05', isMilestone: true },
            { id: 'U', projectId: 'P1' },
            { id: 'A', projectId: 'P1', startDate: '2026-04-01', dueDate: '2026-04-10' },
        ];
        expect(CP.detectConflicts(tasks).size).toBe(0);
    });
});

describe('PlanningGanttCriticalPath.computeProgressSlack', () => {
    it('returns 0 when task has no dates or is a milestone', () => {
        expect(CP.computeProgressSlack({}, '2026-04-15', Utils)).toBe(0);
        expect(CP.computeProgressSlack({ isMilestone: true, startDate: '2026-04-01', dueDate: '2026-04-10' }, '2026-04-15', Utils)).toBe(0);
    });

    it('returns positive value when actual progress lags expected', () => {
        // 10-day span, today midway (day 5), expected ~50%, actual 20% → slack ~30
        const task = { startDate: '2026-04-01', dueDate: '2026-04-10', progress: 20 };
        const s = CP.computeProgressSlack(task, '2026-04-05', Utils);
        expect(s).toBeGreaterThan(20);
        expect(s).toBeLessThan(40);
    });

    it('returns negative value when actual progress is ahead', () => {
        const task = { startDate: '2026-04-01', dueDate: '2026-04-10', progress: 80 };
        const s = CP.computeProgressSlack(task, '2026-04-05', Utils);
        expect(s).toBeLessThan(0);
    });
});
