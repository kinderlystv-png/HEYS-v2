import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;

function loadPlanningModule() {
    const filePath = path.resolve(__dirname, '../heys_planning_v1.js');
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
        // Context tab был удалён в коммите 30c35b62 — теперь 'context' резолвится
        // в DEFAULT (как любой неизвестный экран), что и тестируем заодно.
        expect(window.HEYS.Planning.resolveHomeScreen('tasks')).toBe('tasks');
        expect(window.HEYS.Planning.resolveHomeScreen('goals')).toBe('goals');
        expect(window.HEYS.Planning.resolveHomeScreen('games')).toBe('games');
        expect(window.HEYS.Planning.resolveHomeScreen('gantt')).toBe('calendar');
        expect(window.HEYS.Planning.resolveHomeScreen('context')).toBe('calendar'); // removed → fallback
        expect(window.HEYS.Planning.resolveHomeScreen('something-else')).toBe('calendar');

        expect(window.HEYS.Planning.getInitialHomeScreen()).toBe('calendar');
        expect(window.HEYS.Planning.getInitialHomeScreen('tasks')).toBe('tasks');
        expect(window.HEYS.Planning.getInitialHomeScreen('goals')).toBe('goals');
        expect(window.HEYS.Planning.getInitialHomeScreen('checklists')).toBe('checklists');
        expect(window.HEYS.Planning.getInitialHomeScreen('reading')).toBe('reading');
        expect(window.HEYS.Planning.getInitialHomeScreen('games')).toBe('games');
        expect(window.HEYS.Planning.getInitialHomeScreen('unknown')).toBe('calendar');
        expect(window.HEYS.Planning.SUBNAV_ITEMS.map((item) => item.id)).toEqual(['tasks', 'goals', 'calendar', 'chrono', 'checklists', 'reading', 'games']);
    });

    it('hides the games subtab until access is confirmed for the client or the curator', async () => {
        const Planning = window.HEYS.Planning;

        expect(Planning.getVisibleSubnavItems(false).map((item) => item.id)).not.toContain('games');
        expect(Planning.getVisibleSubnavItems(true).map((item) => item.id)).toContain('games');

        // Клиент без облачного признака и без API не получает вкладку.
        window.HEYS.currentClientId = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
        await expect(Planning.loadGamesAccess()).resolves.toBe(false);

        const getKV = vi.fn(async () => ({ data: { enabled: true } }));
        window.HEYS.YandexAPI = { getKV };
        await expect(Planning.loadGamesAccess()).resolves.toBe(true);
        expect(getKV).toHaveBeenCalledWith('ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', Planning.GAMES_ACCESS_KEY);

        window.HEYS.YandexAPI = { getKV: vi.fn(async () => ({ data: { enabled: false } })) };
        await expect(Planning.loadGamesAccess()).resolves.toBe(false);

        // Куратор видит вкладку без обращения к KV.
        const unusedGetKV = vi.fn();
        window.HEYS.YandexAPI = { getKV: unusedGetKV };
        window.HEYS.auth = { isCuratorSession: () => true };
        await expect(Planning.loadGamesAccess()).resolves.toBe(true);
        expect(unusedGetKV).not.toHaveBeenCalled();
    });

    it('auto-syncs to home screen only when at DEFAULT fallback, never when already on a real screen', () => {
        // At DEFAULT fallback ('calendar'), not navigated → apply requested home
        expect(window.HEYS.Planning.resolveNextHomeScreen('calendar', 'gantt', false)).toBe('calendar');
        expect(window.HEYS.Planning.resolveNextHomeScreen('calendar', 'tasks', false)).toBe('tasks');
        // NOT at default, not navigated → stay (prevents jump from profile-updated events)
        expect(window.HEYS.Planning.resolveNextHomeScreen('gantt', 'tasks', false)).toBe('tasks');
        expect(window.HEYS.Planning.resolveNextHomeScreen('tasks', 'gantt', false)).toBe('tasks');
        // Navigated → always stay regardless of current screen
        expect(window.HEYS.Planning.resolveNextHomeScreen('gantt', 'tasks', true)).toBe('calendar');
        expect(window.HEYS.Planning.resolveNextHomeScreen('calendar', 'gantt', true)).toBe('calendar');
        // Invalid screens resolve to DEFAULT
        expect(window.HEYS.Planning.resolveNextHomeScreen('unknown', 'tasks', true)).toBe('calendar');
        expect(window.HEYS.Planning.resolveNextHomeScreen('tasks', 'unknown', false)).toBe('tasks');
    });
});
