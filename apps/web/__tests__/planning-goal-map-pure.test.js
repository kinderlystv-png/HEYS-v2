import fs from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_goal_map_v1.js'), 'utf8');

let GoalMap;

beforeAll(() => {
    window.HEYS = {};
    window.React = { createElement: () => null };
    window.ReactDOM = {};
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    GoalMap = window.HEYS.PlanningGoalMap;
});

describe('goal map pure model', () => {
    it('builds a deterministic legacy radial layout without persisting anything', () => {
        const goal = {
            id: 'g1',
            title: 'Запуск',
            projectId: 'p1',
            obstacle: 'Нет времени',
            keyResults: [{ id: 'kr1', text: 'Оплата готова' }, { id: 'kr2', text: 'Онбординг готов' }],
        };
        const tasks = [{ id: 't1', projectId: 'p1' }, { id: 't2', projectId: 'p1' }];

        const first = GoalMap.deterministicRadialLayout(goal, tasks, []);
        const second = GoalMap.deterministicRadialLayout(goal, tasks, []);

        expect(Array.from(first.entries())).toEqual(Array.from(second.entries()));
        expect(first.get('goal:g1')).toEqual({ x: 0, y: 0 });
        expect(first.get('keyResult:kr1').y).toBeLessThan(0);
        expect(first.get('task:t1').x).toBeGreaterThan(0);
        expect(first.get('goalObstacle:g1').x).toBeLessThan(0);
    });

    it('uses canonical entities and hides dangling map edges', () => {
        const model = GoalMap.buildGoalMapModel({
            goal: { id: 'g1', title: 'Запуск', projectId: 'p1', keyResults: [{ id: 'kr1', text: 'Готово' }] },
            tasks: [
                { id: 't1', projectId: 'p1', title: 'Первый шаг', status: 'in_progress' },
                { id: 't2', projectId: 'other', title: 'Чужая задача', status: 'in_progress' },
            ],
            records: [
                { id: 'map:n1', recordType: 'node', goalId: 'g1', nodeKind: 'note', entityType: 'map', title: 'Контекст', x: -100, y: 100 },
                { id: 'edge:ok', recordType: 'edge', goalId: 'g1', fromNodeId: 'map:n1', toNodeId: 'task:t1', relation: 'related' },
                { id: 'edge:dangling', recordType: 'edge', goalId: 'g1', fromNodeId: 'missing', toNodeId: 'task:t1', relation: 'related' },
            ],
        });

        expect(model.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['goal:g1', 'keyResult:kr1', 'task:t1', 'map:n1']));
        expect(model.nodes.map((node) => node.id)).not.toContain('task:t2');
        expect(model.edges.map((edge) => edge.id)).toContain('edge:ok');
        expect(model.edges.map((edge) => edge.id)).not.toContain('edge:dangling');
    });

    it('selects semantic relation defaults', () => {
        expect(GoalMap.defaultRelation('task', 'task')).toBe('precedes');
        expect(GoalMap.defaultRelation('task', 'result')).toBe('contributes');
        expect(GoalMap.defaultRelation('obstacle', 'result')).toBe('blocks');
        expect(GoalMap.defaultRelation('decision', 'note')).toBe('option');
        expect(GoalMap.defaultRelation('note', 'goal')).toBe('related');
    });

    it('rejects self links, duplicates, and task dependency cycles', () => {
        const taskA = { id: 'task:A', kind: 'task', entityId: 'A' };
        const taskB = { id: 'task:B', kind: 'task', entityId: 'B' };
        const taskC = { id: 'task:C', kind: 'task', entityId: 'C' };
        const tasks = [
            { id: 'A' },
            { id: 'B', blockedByTaskIds: ['A'] },
            { id: 'C', blockedByTaskIds: ['B'] },
        ];

        expect(GoalMap.validateConnection(taskA, taskA, [], tasks).ok).toBe(false);
        expect(GoalMap.validateConnection(taskA, taskB, [{ fromNodeId: 'task:A', toNodeId: 'task:B' }], tasks).ok).toBe(false);
        expect(GoalMap.validateConnection(taskC, taskA, [], tasks)).toMatchObject({ ok: false, reason: expect.stringContaining('цикл') });
        expect(GoalMap.validateConnection(taskA, taskC, [], tasks).ok).toBe(true);
    });

    it('calculates finite boundary points for SVG edges', () => {
        const points = GoalMap.calculateEdgeEndpoints(
            { x: 0, y: 0, kind: 'goal' },
            { x: 400, y: 180, kind: 'task' },
        );

        expect(Number.isFinite(points.from.x)).toBe(true);
        expect(Number.isFinite(points.to.y)).toBe(true);
        expect(points.from.x).toBeGreaterThan(0);
        expect(points.to.x).toBeLessThan(400);
    });
});
