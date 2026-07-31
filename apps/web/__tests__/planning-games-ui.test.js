import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { createPortal } from 'react-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_v1.js'), 'utf8');
const mainDeferredCss = fs.readFileSync(path.resolve(__dirname, '../styles/main-deferred.css'), 'utf8');
const shellCss = fs.readFileSync(path.resolve(__dirname, '../styles/modules/908-planning-games.css'), 'utf8');
const legacyBundleConfig = fs.readFileSync(path.resolve(__dirname, '../../../scripts/legacy-bundle-config.mjs'), 'utf8');
const assembleDaySource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_game_assemble_day_v1.js'), 'utf8');
const publicDir = path.resolve(__dirname, '../public');
const eagerLegacySource = fs.readdirSync(publicDir)
    .filter((file) => /\.bundle\.[^.]+\.js$/.test(file))
    .map((file) => fs.readFileSync(path.join(publicDir, file), 'utf8'))
    .join('\n');
const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;
let capturedResources = [];

function StubScreen() {
    return null;
}

function renderGames() {
    const appendChild = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
        if (node?.dataset?.heysGameResourceType) {
            node.__heysRemoved = false;
            node.remove = () => {
                node.__heysRemoved = true;
            };
            capturedResources.push(node);
            return node;
        }
        return appendChild(node);
    });
    window.HEYS = {
        App: { getDefaultTasksSubtab: () => 'games' },
        Planning: {
            Hooks: {
                usePlanningState: () => ({
                    projects: [],
                    tasks: [],
                    slots: [],
                    chronoActivities: [],
                }),
            },
            Store: {},
        },
        PlanningTasks: {
            TasksScreen: StubScreen,
            TaskMatrixModal: StubScreen,
            buildResolvedTaskProjectMap: () => new Map(),
        },
        PlanningSchedule: { CalendarScreen: StubScreen, GanttScreen: StubScreen },
        PlanningChrono: { ChronoScreen: StubScreen },
        PlanningReading: { ReadingScreen: StubScreen, ReadingIcon: StubScreen },
        featureFlags: { isEnabled: () => false },
        // Раздел «Игры» скрыт по умолчанию; здесь проверяется сам раздел, поэтому доступ открыт.
        auth: { isCuratorSession: () => true },
    };
    window.React = React;
    window.ReactDOM = { createPortal };
    // eslint-disable-next-line no-eval
    (0, eval)(source);

    return render(React.createElement(window.HEYS.PlanningTab, { defaultHomeScreen: 'games' }));
}

function resourceNodes(gameId, type) {
    return capturedResources.filter((node) => !node.__heysRemoved
        && node.dataset.heysGameId === gameId
        && node.dataset.heysGameResourceType === type);
}

function registerMockModule(gameId, Component) {
    const game = window.HEYS.PlanningGames.catalog.find((item) => item.id === gameId);
    const api = { version: 1 };
    game.apiMethods.forEach((method) => {
        api[method] = vi.fn();
    });
    window.HEYS.PlanningGames.modules[gameId] = {
        Component: Component || (() => React.createElement('button', null, 'Игровое действие')),
        api,
    };
}

async function completeLoad(gameId, Component) {
    registerMockModule(gameId, Component);
    const script = await waitFor(() => {
        const node = resourceNodes(gameId, 'script')[0];
        expect(node).toBeTruthy();
        return node;
    });
    const style = resourceNodes(gameId, 'style')[0];
    fireEvent.load(script);
    fireEvent.load(style);
}

describe('planning games catalog and lazy fullscreen shell', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ReactDOM = originalReactDOM;
        document.body.classList.remove('planning-game-reader-open');
        capturedResources = [];
        Array.from(document.body.children).forEach((node) => {
            node.inert = false;
            node.removeAttribute('aria-hidden');
        });
    });

    it('shows four catalog cards with the approved metadata and requests nothing before click', () => {
        renderGames();

        expect(screen.getByRole('heading', { name: 'Игры', level: 1 })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Открыть игру «Собери слово»' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Открыть игру «Маршрут робота»' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Открыть игру «Цветной след»' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Открыть игру «Собери день»' })).toBeTruthy();
        expect(screen.getByText('Сложи слово из слогов')).toBeTruthy();
        expect(screen.getByText('Составь путь до цели')).toBeTruthy();
        expect(screen.getByText('Замыкай контуры и расширяй территорию')).toBeTruthy();
        expect(screen.getByText('Проживи неделю решений и последствий')).toBeTruthy();
        expect(capturedResources).toHaveLength(0);
        expect(window.HEYS.PlanningGames.modules['assemble-day']).toBeUndefined();
    });

    it('keeps game engines and their styles out of eager legacy bundles', () => {
        expect(mainDeferredCss).toContain("908-planning-games.css");
        ['909-planning-game-word-builder.css', '910-planning-game-robot-route.css', '911-planning-game-color-trail.css', '912-planning-game-assemble-day.css']
            .forEach((file) => {
                expect(mainDeferredCss).not.toContain(file);
                expect(shellCss).not.toContain(file);
            });
        [
            'heys_planning_game_word_builder_v1.js',
            'heys_planning_game_robot_route_v1.js',
            'heys_planning_game_color_trail_v1.js',
            'heys_planning_game_assemble_day_v1.js',
        ].forEach((file) => {
            expect(legacyBundleConfig).not.toContain(file);
        });
        ['week-01-project-deadline', 'mon_breakfast'].forEach((marker) => {
            expect(assembleDaySource).toContain(marker);
            expect(eagerLegacySource).not.toContain(marker);
        });
    });

    it('requests the complete Assemble Day module only after its catalog card is opened', async () => {
        renderGames();

        expect(resourceNodes('assemble-day', 'script')).toHaveLength(0);
        expect(resourceNodes('assemble-day', 'style')).toHaveLength(0);
        expect(window.HEYS.PlanningGames.modules['assemble-day']).toBeUndefined();

        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Собери день»' }));

        const script = await waitFor(() => {
            expect(resourceNodes('assemble-day', 'script')).toHaveLength(1);
            return resourceNodes('assemble-day', 'script')[0];
        });
        const style = resourceNodes('assemble-day', 'style')[0];
        expect(script.getAttribute('src')).toContain('heys_planning_game_assemble_day_v1.js');
        expect(style.getAttribute('href')).toContain('912-planning-game-assemble-day.css');
        expect(capturedResources).toHaveLength(2);

        registerMockModule('assemble-day');
        fireEvent.load(script);
        expect(screen.queryByRole('button', { name: 'Игровое действие' })).toBeNull();
        fireEvent.load(style);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Игровое действие' })).toBeTruthy());
    });

    it('loads JS and CSS in parallel and mounts only after both resources are ready', async () => {
        renderGames();
        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Собери слово»' }));

        const script = await waitFor(() => {
            expect(resourceNodes('word-builder', 'script')).toHaveLength(1);
            return resourceNodes('word-builder', 'script')[0];
        });
        const style = resourceNodes('word-builder', 'style')[0];
        expect(script).toBeTruthy();
        expect(style).toBeTruthy();
        expect(script.dataset.heysGameAttempt).toBe('1');
        expect(style.dataset.heysGameAttempt).toBe('1');
        expect(screen.getByRole('status', { name: 'Загружается игра «Собери слово»' })).toBeTruthy();

        registerMockModule('word-builder');
        fireEvent.load(script);
        expect(screen.queryByRole('button', { name: 'Игровое действие' })).toBeNull();

        fireEvent.load(style);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Игровое действие' })).toBeTruthy());
    });

    it('retries only the failed resource and does not duplicate a ready resource', async () => {
        renderGames();
        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Маршрут робота»' }));

        const script = await waitFor(() => {
            expect(resourceNodes('robot-route', 'script')).toHaveLength(1);
            return resourceNodes('robot-route', 'script')[0];
        });
        const firstStyle = resourceNodes('robot-route', 'style')[0];
        registerMockModule('robot-route');
        fireEvent.load(script);
        fireEvent.error(firstStyle);

        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Не удалось загрузить игру'));
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

        const secondStyle = await waitFor(() => {
            const nodes = resourceNodes('robot-route', 'style');
            expect(nodes).toHaveLength(1);
            expect(nodes[0]).not.toBe(firstStyle);
            return nodes[0];
        });
        expect(secondStyle.dataset.heysGameAttempt).toBe('2');
        expect(resourceNodes('robot-route', 'script')).toHaveLength(1);

        fireEvent.load(secondStyle);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Игровое действие' })).toBeTruthy());
    });

    it('treats an invalid module contract as a script failure', async () => {
        renderGames();
        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Собери слово»' }));

        const firstScript = await waitFor(() => {
            expect(resourceNodes('word-builder', 'script')).toHaveLength(1);
            return resourceNodes('word-builder', 'script')[0];
        });
        const style = resourceNodes('word-builder', 'style')[0];
        fireEvent.load(firstScript);
        fireEvent.load(style);
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
        const secondScript = await waitFor(() => {
            const nodes = resourceNodes('word-builder', 'script');
            expect(nodes).toHaveLength(1);
            expect(nodes[0]).not.toBe(firstScript);
            return nodes[0];
        });
        expect(secondScript.dataset.heysGameAttempt).toBe('2');
        expect(resourceNodes('word-builder', 'style')).toEqual([style]);

        registerMockModule('word-builder');
        fireEvent.load(secondScript);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Игровое действие' })).toBeTruthy());
    });

    it('keeps resource caches independent between games', async () => {
        renderGames();
        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Собери слово»' }));
        await completeLoad('word-builder');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Игровое действие' })).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Вернуться к играм' }));
        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Собери слово»' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Игровое действие' })).toBeTruthy());
        expect(resourceNodes('word-builder', 'script')).toHaveLength(1);
        expect(resourceNodes('word-builder', 'style')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Вернуться к играм' }));

        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Цветной след»' }));
        await waitFor(() => expect(resourceNodes('color-trail', 'script')).toHaveLength(1));
        expect(resourceNodes('word-builder', 'script')).toHaveLength(1);
        expect(resourceNodes('word-builder', 'style')).toHaveLength(1);
        expect(resourceNodes('color-trail', 'style')).toHaveLength(1);
    });

    it('closes safely while resources are still loading and ignores their late completion', async () => {
        renderGames();
        fireEvent.click(screen.getByRole('button', { name: 'Открыть игру «Цветной след»' }));
        const script = await waitFor(() => {
            expect(resourceNodes('color-trail', 'script')).toHaveLength(1);
            return resourceNodes('color-trail', 'script')[0];
        });
        const style = resourceNodes('color-trail', 'style')[0];
        fireEvent.click(screen.getByRole('button', { name: 'Вернуться к играм' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        registerMockModule('color-trail');
        fireEvent.load(script);
        fireEvent.load(style);
        expect(screen.queryByRole('button', { name: 'Игровое действие' })).toBeNull();
    });

    it('supports Escape, dynamic focus wrap and returns focus to the opener', async () => {
        renderGames();
        const opener = screen.getByRole('button', { name: 'Открыть игру «Собери слово»' });
        opener.focus();
        fireEvent.click(opener);
        await completeLoad('word-builder', () => React.createElement('div', null,
            React.createElement('button', null, 'Первое действие'),
            React.createElement('button', null, 'Последнее действие'),
        ));

        const close = screen.getByRole('button', { name: 'Вернуться к играм' });
        const last = await screen.findByRole('button', { name: 'Последнее действие' });
        last.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(document.activeElement).toBe(close);
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last);

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(document.activeElement).toBe(opener);
        expect(document.body.classList.contains('planning-game-reader-open')).toBe(false);
    });
});
