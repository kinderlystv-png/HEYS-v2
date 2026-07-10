import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_goal_map_v1.js'), 'utf8');

function createState() {
    const state = {
        tasks: [{ id: 't1', projectId: 'p1', title: 'Первый шаг', status: 'in_progress' }],
        slots: [],
        links: [],
        goalMapRecords: [],
        addTask: vi.fn((title, input) => {
            const task = { id: `t${state.tasks.length + 1}`, title, ...input };
            state.tasks = state.tasks.concat(task);
            return task;
        }),
        updateTask: vi.fn(),
        updateGoal: vi.fn(),
        addProject: vi.fn(),
        addSlot: vi.fn(),
        upsertGoalMapRecord: vi.fn((record) => {
            const next = { ...record, updatedAt: new Date().toISOString() };
            state.goalMapRecords = state.goalMapRecords.filter((item) => item.id !== next.id).concat(next);
            return next;
        }),
        saveGoalMapRecords: vi.fn(),
        deleteGoalMapRecord: vi.fn(),
        deleteTask: vi.fn(),
        restorePlanningEntity: vi.fn(),
    };
    return state;
}

function renderMap(state, goalPatch = {}) {
    window.React = React;
    window.ReactDOM = {};
    window.HEYS = { cloud: { getSyncStatus: () => 'synced' } };
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    const goal = {
        id: 'g1', title: 'Запустить продукт', projectId: 'p1', nextTaskId: 't1',
        metricLabel: 'готовность', status: 'active', keyResults: [], ...goalPatch,
    };
    const readModel = {
        course: { kind: 'moving', label: 'Движение есть' },
        focusTask: state.tasks[0],
        focusSlot: { date: '2026-07-10' },
        resultProgress: 0,
        hasResultProgress: false,
        dueState: { isOverdue: false },
    };
    return render(React.createElement(window.HEYS.PlanningGoalMap.GoalMapScreen, {
        goal, state, readModel, onBack: vi.fn(), onStartFocus: vi.fn(),
    }));
}

describe('goal map UI', () => {
    beforeEach(() => {
        history.replaceState({}, '');
    });

    afterEach(() => {
        cleanup();
        document.body.classList.remove('planning-goal-map-open');
        history.replaceState({}, '');
        vi.restoreAllMocks();
    });

    it('creates the same canonical task from the tap palette flow', () => {
        const state = createState();
        renderMap(state);

        fireEvent.pointerDown(screen.getByRole('button', { name: 'Добавить: Задача' }), { clientX: 20, clientY: 20 });
        fireEvent.pointerUp(window, { clientX: 20, clientY: 20 });
        fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Проверить оплату' } });
        fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));

        expect(state.addTask).toHaveBeenCalledWith('Проверить оплату', expect.objectContaining({ projectId: 'p1' }));
        expect(state.upsertGoalMapRecord).toHaveBeenCalledWith(expect.objectContaining({
            recordType: 'node', nodeKind: 'task', entityType: 'task', entityId: 't2',
        }));
    });

    it('persists a dragged node only after pointer release', () => {
        const state = createState();
        const view = renderMap(state);
        const node = screen.getByRole('button', { name: 'Задача: Первый шаг' });
        const canvas = view.container.querySelector('.goal-map-canvas');

        fireEvent.pointerDown(node, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 145, clientY: 140 });
        expect(state.upsertGoalMapRecord).not.toHaveBeenCalled();
        fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 145, clientY: 140 });

        expect(state.upsertGoalMapRecord).toHaveBeenCalledTimes(1);
        expect(state.upsertGoalMapRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'task:t1', recordType: 'node' }));
    });

    it('offers a keyboard-readable structure mode and keeps completed goals read-only', () => {
        const state = createState();
        const { rerender } = renderMap(state);
        fireEvent.click(screen.getByRole('button', { name: 'Структура' }));
        expect(screen.getByRole('heading', { name: 'Структура цели' })).toBeTruthy();
        expect(screen.getByText(/Все действия доступны с клавиатуры/)).toBeTruthy();

        cleanup();
        renderMap(state, { status: 'done' });
        expect(screen.queryByRole('navigation', { name: 'Добавить элемент' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Вернуть в активные' })).toBeTruthy();
        expect(rerender).toBeTypeOf('function');
    });
});
