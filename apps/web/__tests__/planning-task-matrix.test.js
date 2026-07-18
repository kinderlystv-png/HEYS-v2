import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;
const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_tasks_v1.js'), 'utf8');

function installTasksModule() {
    // eslint-disable-next-line no-eval
    eval(source);
    return window.HEYS.PlanningTasks;
}

describe('Planning task matrix helpers', () => {
    beforeEach(() => {
        window.HEYS = {
            Planning: {
                Constants: {
                    PRIORITY_CONFIG: {
                        'p!': { label: 'P!' },
                        p1: { label: 'P1' },
                        p2: { label: 'P2' },
                        p3: { label: 'P3' },
                    },
                    STATUS_CONFIG: {},
                    DUE_BUCKETS: {},
                    PROJECT_COLORS: ['#94a3b8'],
                },
                Store: {},
                Utils: {
                    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
                    dateStr: () => '2026-07-07',
                    getDueBucket: () => 'all',
                    getTaskDurationMinutes: () => 0,
                    minutesToTime: (minutes) => {
                        const safe = Math.max(0, Math.round(Number(minutes) || 0));
                        return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0');
                    },
                    sortByOrder: (items) => items.slice().sort((left, right) => (left.order || 0) - (right.order || 0)),
                    timeToMinutes: (value) => {
                        const [hours, minutes] = String(value || '00:00').split(':').map(Number);
                        return ((hours || 0) * 60) + (minutes || 0);
                    },
                    uid: () => 'repeat-group',
                },
            },
            PlanningQuickTarget: {
                buildResolvedTaskProjectMap: () => new Map(),
                getResolvedTaskProjectId: () => '',
                createQuickTargetValue: () => '',
                resolveQuickTargetValue: () => ({}),
                PlanningQuickTargetField: () => null,
            },
        };
        window.React = {
            createElement: () => null,
            Fragment: 'fragment',
            useMemo: (fn) => fn(),
            useRef: () => ({ current: null }),
            useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => undefined],
            useEffect: () => undefined,
        };
        window.ReactDOM = {};
    });

    afterEach(() => {
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ReactDOM = originalReactDOM;
    });

    it('places active tasks into Eisenhower quadrants from priority and due date', () => {
        const Matrix = installTasksModule();

        expect(Matrix.resolveTaskMatrixQuadrant({ priority: 'p!', dueDate: '2026-08-01' }, '2026-07-07')).toBe('urgent-important');
        expect(Matrix.resolveTaskMatrixQuadrant({ priority: 'p1', dueDate: '2026-08-01' }, '2026-07-07')).toBe('later-important');
        expect(Matrix.resolveTaskMatrixQuadrant({ priority: 'p2', dueDate: '2026-07-07' }, '2026-07-07')).toBe('urgent-optional');
        expect(Matrix.resolveTaskMatrixQuadrant({ priority: 'p3' }, '2026-07-07')).toBe('later-optional');
    });

    it('uses manual matrix fields before priority fallback and ignores terminal tasks in groups', () => {
        const Matrix = installTasksModule();
        const tasks = [
            { id: 'manual', title: 'Manual', priority: 'p3', matrixUrgency: 'urgent', matrixImportance: 'important', order: 2 },
            { id: 'done', title: 'Done', priority: 'p!', status: 'done', order: 1 },
            { id: 'completed-at', title: 'Completed at', priority: 'p!', completedAt: '2026-07-07T08:00:00.000Z', order: 3 },
            { id: 'fallback', title: 'Fallback', priority: 'p1', dueDate: '2026-08-01', order: 0 },
        ];
        const groups = Matrix.buildTaskMatrixGroups(tasks, '2026-07-07');

        expect(groups['urgent-important'].map((task) => task.id)).toEqual(['manual']);
        expect(groups['later-important'].map((task) => task.id)).toEqual(['fallback']);
        expect(Object.values(groups).flat().map((task) => task.id)).not.toContain('done');
        expect(Object.values(groups).flat().map((task) => task.id)).not.toContain('completed-at');
        expect(Matrix.getTaskMatrixPatchForQuadrant('urgent-optional')).toEqual({
            matrixUrgency: 'urgent',
            matrixImportance: 'optional',
        });
    });

    it('builds one linked calendar slot per selected repeat date', () => {
        const Tasks = installTasksModule();

        expect(Tasks.buildRepeatedTaskSlotOptions(new Set([
            '2026-08-15',
            '2026-07-21',
            '2026-08-15',
        ]), {
            taskId: 'task-1',
            startTime: '11:30',
            endTime: '12:45',
            isBackground: true,
            bgColor: '#3b82f6',
        })).toEqual([
            {
                taskId: 'task-1', title: '', date: '2026-07-21',
                startTime: '11:30', endTime: '12:45', source: 'user',
                recurrenceGroupId: 'repeat-group', isBackground: true, bgColor: '#3b82f6',
            },
            {
                taskId: 'task-1', title: '', date: '2026-08-15',
                startTime: '11:30', endTime: '12:45', source: 'user',
                recurrenceGroupId: 'repeat-group', isBackground: true, bgColor: '#3b82f6',
            },
        ]);
    });
});
