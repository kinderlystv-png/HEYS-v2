import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_game_robot_route_v1.js'), 'utf8');
const originalHEYS = window.HEYS;
const originalReact = window.React;

function loadModule() {
    window.HEYS = {};
    window.React = React;
    // Root game files are copied as classic scripts in production.
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    return window.HEYS.PlanningGames.modules['robot-route'];
}

describe('planning game: robot route', () => {
    let game;

    beforeEach(() => {
        game = loadModule();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
        window.HEYS = originalHEYS;
        window.React = originalReact;
    });

    it('registers the frozen runtime contract and validates every static level with BFS', () => {
        expect(game.Component).toBeTypeOf('function');
        expect(game.api.version).toBe(1);
        expect(game.api.validateLevels).toBeTypeOf('function');
        expect(game.api.createSession).toBeTypeOf('function');
        expect(game.api.bfsShortestPath).toBeTypeOf('function');
        expect(game.api.executeProgram).toBeTypeOf('function');

        const validation = game.api.validateLevels();
        expect(validation).toEqual({ valid: true, errors: [], levelsCount: 12 });
    });

    it('creates a deterministic five-level session with the required tier mix and no repeats', () => {
        const first = game.api.createSession({ seed: 2468 });
        const repeated = game.api.createSession({ seed: 2468 });

        expect(first.levels.map((level) => level.id)).toEqual(repeated.levels.map((level) => level.id));
        expect(first.levels).toHaveLength(5);
        expect(new Set(first.levels.map((level) => level.id)).size).toBe(5);
        expect(first.levels.map((level) => level.tier).sort()).toEqual([1, 2, 2, 3, 3]);
    });

    it('blocks field edges and obstacles, and resets the result position to start', () => {
        const edgeLevel = {
            size: 4,
            start: { row: 0, col: 0 },
            goal: { row: 3, col: 3 },
            obstacles: [],
        };
        const obstacleLevel = {
            size: 4,
            start: { row: 0, col: 0 },
            goal: { row: 3, col: 3 },
            obstacles: [{ row: 0, col: 1 }],
        };

        const outside = game.api.executeProgram(edgeLevel, ['up']);
        expect(outside.success).toBe(false);
        expect(outside.error).toBe('OUT_OF_BOUNDS');
        expect(outside.position).toEqual(edgeLevel.start);
        expect(outside.visited).toEqual([edgeLevel.start]);

        const blocked = game.api.executeProgram(obstacleLevel, ['right']);
        expect(blocked.success).toBe(false);
        expect(blocked.error).toBe('OBSTACLE');
        expect(blocked.position).toEqual(obstacleLevel.start);
        expect(blocked.visited).toEqual([obstacleLevel.start]);
    });

    it('stops immediately at the goal and does not execute extra commands', () => {
        const level = {
            size: 4,
            start: { row: 0, col: 0 },
            goal: { row: 0, col: 2 },
            obstacles: [],
        };
        const result = game.api.executeProgram(level, ['right', 'right', 'down', 'down']);

        expect(result.success).toBe(true);
        expect(result.position).toEqual(level.goal);
        expect(result.executedCommands).toEqual(['right', 'right']);
        expect(result.visited).toHaveLength(3);
    });

    it('rejects a program longer than twelve commands', () => {
        const level = {
            size: 5,
            start: { row: 0, col: 0 },
            goal: { row: 4, col: 4 },
            obstacles: [],
        };
        const result = game.api.executeProgram(level, Array(13).fill('right'));

        expect(result.success).toBe(false);
        expect(result.error).toBe('PROGRAM_LIMIT');
        expect(result.executedCommands).toEqual([]);
    });

    it('supports mouse and scoped keyboard commands, then completes a route', () => {
        render(React.createElement(game.Component, { reducedMotion: true, seed: 42, onExit: vi.fn() }));

        const root = screen.getByRole('region', { name: 'Составь путь до цели' });
        root.focus();
        fireEvent.keyDown(root, { key: 'ArrowRight' });
        fireEvent.click(screen.getByRole('button', { name: 'Добавить ход вправо' }));
        fireEvent.click(screen.getByRole('button', { name: 'Добавить ход вправо' }));
        expect(screen.getByLabelText('Команды маршрута').textContent).toContain('→→→');

        fireEvent.click(screen.getByRole('button', { name: 'Запустить' }));

        expect(screen.getByText('Маршрут готов.')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Следующий маршрут' })).toBeTruthy();
    });

    it('keeps the program after errors and reveals only the first-move hint after two attempts', () => {
        render(React.createElement(game.Component, { reducedMotion: true, seed: 42 }));

        fireEvent.click(screen.getByRole('button', { name: 'Добавить ход вверх' }));
        fireEvent.click(screen.getByRole('button', { name: 'Запустить' }));
        expect(screen.getByLabelText('Команды маршрута').textContent).toContain('↑');
        expect(screen.queryByText(/Подсказка:/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Запустить' }));
        expect(screen.getByText('Подсказка: начни с →')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Добавить ход вправо' }).className).toContain('planning-robot-route__direction--hint');
    });

    it('clears every animation timeout when the component unmounts', () => {
        vi.useFakeTimers();
        const view = render(React.createElement(game.Component, { reducedMotion: false, seed: 42 }));

        fireEvent.click(screen.getByRole('button', { name: 'Добавить ход вправо' }));
        fireEvent.click(screen.getByRole('button', { name: 'Добавить ход вправо' }));
        fireEvent.click(screen.getByRole('button', { name: 'Добавить ход вправо' }));
        fireEvent.click(screen.getByRole('button', { name: 'Запустить' }));
        expect(vi.getTimerCount()).toBeGreaterThan(0);

        view.unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('does not use canvas, animation frames, network, or browser storage', () => {
        expect(source).not.toMatch(/\bcanvas\b/i);
        expect(source).not.toMatch(/requestAnimationFrame|cancelAnimationFrame/);
        expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\s*\(|XMLHttpRequest/);
    });
});
