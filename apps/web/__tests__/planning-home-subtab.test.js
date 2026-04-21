import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;

function loadPlanningModule() {
    const filePath = path.resolve(process.cwd(), 'apps/web/heys_planning_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
}

describe('HEYS Planning home subtab helpers', () => {
    beforeEach(() => {
        window.HEYS = {
            App: {
                getDefaultTasksSubtab: vi.fn(() => 'gantt'),
            },
        };
        window.React = {
            createElement: () => null,
        };
        window.ReactDOM = {};

        loadPlanningModule();
    });

    afterEach(() => {
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ReactDOM = originalReactDOM;
        vi.restoreAllMocks();
    });

    it('resolves explicit and stored tasks home screens safely', () => {
        expect(window.HEYS.Planning.resolveHomeScreen('tasks')).toBe('tasks');
        expect(window.HEYS.Planning.resolveHomeScreen('context')).toBe('context');
        expect(window.HEYS.Planning.resolveHomeScreen('something-else')).toBe('calendar');

        expect(window.HEYS.Planning.getInitialHomeScreen()).toBe('gantt');
        expect(window.HEYS.Planning.getInitialHomeScreen('context')).toBe('context');
        expect(window.HEYS.Planning.getInitialHomeScreen('unknown')).toBe('calendar');
        expect(window.HEYS.Planning.SUBNAV_ITEMS.map((item) => item.id)).toEqual(['tasks', 'calendar', 'gantt', 'context']);
    });

    it('auto-syncs to home screen only when at DEFAULT fallback, never when already on a real screen', () => {
        // At DEFAULT fallback ('calendar'), not navigated → apply requested home
        expect(window.HEYS.Planning.resolveNextHomeScreen('calendar', 'gantt', false)).toBe('gantt');
        expect(window.HEYS.Planning.resolveNextHomeScreen('calendar', 'context', false)).toBe('context');
        // NOT at default, not navigated → stay (prevents jump from profile-updated events)
        expect(window.HEYS.Planning.resolveNextHomeScreen('gantt', 'context', false)).toBe('gantt');
        expect(window.HEYS.Planning.resolveNextHomeScreen('tasks', 'gantt', false)).toBe('tasks');
        // Navigated → always stay regardless of current screen
        expect(window.HEYS.Planning.resolveNextHomeScreen('gantt', 'context', true)).toBe('gantt');
        expect(window.HEYS.Planning.resolveNextHomeScreen('calendar', 'gantt', true)).toBe('calendar');
        // Invalid screens resolve to DEFAULT
        expect(window.HEYS.Planning.resolveNextHomeScreen('unknown', 'context', true)).toBe('calendar');
        expect(window.HEYS.Planning.resolveNextHomeScreen('tasks', 'unknown', false)).toBe('tasks');
    });
});