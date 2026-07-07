import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_quick_target_v1.js'), 'utf8');

function loadQuickTargetModule() {
    eval(source);
    return window.HEYS.PlanningQuickTarget;
}

describe('PlanningQuickTarget', () => {
    beforeEach(() => {
        window.HEYS = {
            Planning: {
                Utils: {
                    sortByOrder: (items) => items.slice().sort((left, right) => (left.order || 0) - (right.order || 0)),
                },
            },
        };
        window.React = {
            createElement: () => null,
            useEffect: () => undefined,
            useMemo: (fn) => fn(),
            useRef: () => ({ current: null }),
            useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => undefined],
        };
    });

    afterEach(() => {
        window.HEYS = originalHEYS;
        window.React = originalReact;
    });

    it('excludes terminal tasks from quick target parent options', () => {
        const QuickTarget = loadQuickTargetModule();
        const projects = [{ id: 'project-1', name: 'Project', color: '#3b82f6' }];
        const tasks = [
            { id: 'active-parent', title: 'Active parent', projectId: 'project-1', status: 'in_progress', order: 0 },
            { id: 'done-parent', title: 'Done parent', projectId: 'project-1', status: 'done', order: 1 },
            { id: 'cancelled-parent', title: 'Cancelled parent', projectId: 'project-1', status: 'cancelled', order: 2 },
        ];
        const resolvedTaskProjectIds = QuickTarget.buildResolvedTaskProjectMap(tasks, projects);

        const values = QuickTarget
            .buildQuickTargetOptions(projects, tasks, resolvedTaskProjectIds)
            .map((option) => option.value);

        expect(values).toContain('task:active-parent');
        expect(values).not.toContain('task:done-parent');
        expect(values).not.toContain('task:cancelled-parent');
    });
});
