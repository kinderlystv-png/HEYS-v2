import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_v1.js'), 'utf8');
const goalMapSource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_goal_map_v1.js'), 'utf8');
const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;

function StubScreen() {
    return null;
}

function createPlanningState({
    goals = [], tasks = [], projects = [], slots = [], chronoActivities = [], chronoEntries = [], chronoSnapshots = [],
} = {}) {
    const state = {
        projects,
        slots,
        links: [],
        checklists: [],
        goals,
        tasks,
        chronoActivities,
        chronoEntries,
        chronoSnapshots,
        chronoTimer: null,
        goalMapRecords: [],
        addProject: vi.fn((name) => {
            const project = { id: 'project-new', name, status: 'active' };
            state.projects = state.projects.concat(project);
            return project;
        }),
        addGoal: vi.fn((input) => {
            const goal = { id: 'goal-new', status: 'active', ...input };
            state.goals = state.goals.concat(goal);
            return goal;
        }),
        addTask: vi.fn((title, input) => {
            const task = { id: 'task-new', title, ...input };
            state.tasks = state.tasks.concat(task);
            return task;
        }),
        addSlot: vi.fn((input) => {
            const slot = { id: 'slot-new', ...input };
            state.slots = state.slots.concat(slot);
            return slot;
        }),
        updateTask: vi.fn((id, patch) => {
            let updated = null;
            state.tasks = state.tasks.map((task) => task.id === id ? (updated = { ...task, ...patch }) : task);
            return updated;
        }),
        addChronoActivity: vi.fn((input) => {
            const activity = { id: 'activity-new', ...input };
            state.chronoActivities = state.chronoActivities.concat(activity);
            return activity;
        }),
        startChronoTimer: vi.fn((input) => {
            state.chronoTimer = input;
            return input;
        }),
        updateGoal: vi.fn((id, patch) => {
            let updated = null;
            state.goals = state.goals.map((goal) => {
                if (goal.id !== id) return goal;
                updated = { ...goal, ...patch };
                return updated;
            });
            return updated;
        }),
        archiveGoal: vi.fn((id) => {
            let archived = null;
            state.goals = state.goals.map((goal) => {
                if (goal.id !== id) return goal;
                archived = { ...goal, status: 'archived' };
                return archived;
            });
            return archived;
        }),
        upsertGoalMapRecord: vi.fn((record) => {
            const next = { ...record, updatedAt: new Date().toISOString() };
            state.goalMapRecords = state.goalMapRecords.filter((item) => item.id !== record.id).concat(next);
            return next;
        }),
        saveGoalMapRecords: vi.fn((records) => {
            records.forEach((record) => state.upsertGoalMapRecord(record));
            return state.goalMapRecords;
        }),
        deleteGoalMapRecord: vi.fn((id) => {
            state.goalMapRecords = state.goalMapRecords.filter((item) => item.id !== id);
        }),
        deleteTask: vi.fn((id) => {
            state.tasks = state.tasks.filter((task) => task.id !== id);
            state.slots = state.slots.filter((slot) => slot.taskId !== id);
        }),
        restorePlanningEntity: vi.fn(),
    };
    return state;
}

function renderGoals(state) {
    window.HEYS = {
        App: { getDefaultTasksSubtab: () => 'goals' },
        Planning: {
            Hooks: { usePlanningState: () => state },
            Store: {},
            Utils: { dateStr: () => '2026-07-09' },
        },
        PlanningTasks: {
            TasksScreen: StubScreen,
            TaskMatrixModal: StubScreen,
            buildResolvedTaskProjectMap: () => new Map(),
        },
        PlanningSchedule: { CalendarScreen: StubScreen, GanttScreen: StubScreen },
        PlanningChrono: { ChronoScreen: StubScreen },
        featureFlags: { isEnabled: () => false },
    };
    window.React = React;
    window.ReactDOM = {};
    // eslint-disable-next-line no-eval
    (0, eval)(goalMapSource);
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    return render(React.createElement(window.HEYS.PlanningTab, { defaultHomeScreen: 'goals' }));
}

describe('goal setting progressive disclosure', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-09T12:00:00Z'));
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
        window.HEYS = originalHEYS;
        window.React = originalReact;
        window.ReactDOM = originalReactDOM;
        document.body.classList.remove('planning-goal-map-open');
        history.replaceState({}, '');
    });

    it('shows decreasing progress and overdue state on the first layer', () => {
        const state = createPlanningState({
            goals: [{
                id: 'goal-1',
                title: 'Снизить вес',
                projectId: 'project-1',
                metricLabel: 'вес',
                baselineValue: 100,
                currentValue: 90,
                targetValue: 80,
                dueDate: '2026-07-07',
                nextTaskId: 'task-1',
                status: 'active',
            }],
            projects: [{ id: 'project-1', name: 'Снизить вес', status: 'active' }],
            tasks: [{ id: 'task-1', projectId: 'project-1', title: 'Подготовить план', status: 'in_progress' }],
        });

        renderGoals(state);

        expect(screen.getByLabelText('Прогресс цели 50%')).toBeTruthy();
        expect(screen.getByText('Просрочена на 2 дн.')).toBeTruthy();
        expect(screen.getByText('Срок прошёл')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Открыть карту' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'В архив' })).toBeNull();
    });

    it('reviews the result from the goal map and appends review history', () => {
        const state = createPlanningState({
            goals: [{
                id: 'goal-1',
                title: 'Тренироваться регулярно',
                projectId: 'project-1',
                metricLabel: 'тренировки в неделю',
                metricUnit: 'раз/нед',
                baselineValue: 1,
                currentValue: 2,
                targetValue: 4,
                dueDate: '2026-08-01',
                nextTaskId: 'task-1',
                reviewHistory: [],
                reviewedAt: '2026-06-30T12:00:00.000Z',
                status: 'active',
            }],
            projects: [{ id: 'project-1', name: 'Тренировки', status: 'active' }],
            tasks: [{ id: 'task-1', projectId: 'project-1', title: 'Поставить тренировку', status: 'in_progress' }],
            slots: [{ id: 'slot-1', taskId: 'task-1', date: '2026-07-10', startTime: '18:00', endTime: '19:00' }],
        });

        renderGoals(state);
        fireEvent.click(screen.getByRole('button', { name: 'Открыть карту' }));
        fireEvent.click(screen.getByRole('button', { name: 'Проверить результат' }));

        const saveButton = screen.getByRole('button', { name: 'Сохранить проверку' });
        expect(saveButton.disabled).toBe(true);
        expect(screen.getByLabelText('Что изменилось')).toBeTruthy();
        expect(screen.getByLabelText('Следующий шаг')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Текущий результат'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('Что изменилось'), { target: { value: 'Ритм стал стабильнее' } });
        fireEvent.click(saveButton);

        expect(state.updateGoal).toHaveBeenCalledWith('goal-1', expect.objectContaining({
            currentValue: 3,
            reviewHistory: [expect.objectContaining({
                current: '3',
                change: 'Ритм стал стабильнее',
            })],
        }));
    });

    it('creates a project, goal, first task, and calendar slot in one flow', () => {
        const state = createPlanningState();
        renderGoals(state);

        fireEvent.click(screen.getByRole('button', { name: '+ Цель' }));
        fireEvent.change(screen.getByLabelText('Название новой цели'), { target: { value: 'Ложиться спать вовремя' } });
        expect(screen.getByLabelText('Срок цели').value).toBe('2026-08-08');
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
        fireEvent.click(screen.getByRole('button', { name: 'Далее' }));

        expect(screen.getByLabelText('Первый шаг по цели').value).toBe('лечь без телефона');
        expect(screen.getByLabelText('Дата первого действия').value).toBe('2026-07-09');
        fireEvent.click(screen.getByRole('button', { name: 'Создать и запланировать' }));

        expect(state.addProject).toHaveBeenCalledWith('Ложиться спать вовремя');
        expect(state.addGoal).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Ложиться спать вовремя',
            projectId: 'project-new',
            dueDate: '2026-08-08',
        }));
        expect(state.addTask).toHaveBeenCalledWith('лечь без телефона', expect.objectContaining({
            projectId: 'project-new',
            dueDate: '2026-07-09',
        }));
        expect(state.addSlot).toHaveBeenCalledWith(expect.objectContaining({
            taskId: 'task-new',
            date: '2026-07-09',
            startTime: '09:00',
        }));
    });

    it('aggregates project tasks, calendar, and chrono effort without mixing their progress', () => {
        const state = createPlanningState({
            projects: [{ id: 'project-1', name: 'Запуск', status: 'active' }],
            goals: [{
                id: 'goal-1',
                projectId: 'project-1',
                title: 'Запустить HEYS',
                metricLabel: 'готовность релиза',
                keyResults: [{ id: 'kr-1', text: 'Оплата работает', done: true }, { id: 'kr-2', text: 'Онбординг готов', done: false }],
                nextTaskId: 'task-2',
                dueDate: '2026-08-01',
                createdAt: '2026-07-09T08:00:00.000Z',
                status: 'active',
            }],
            tasks: [
                { id: 'task-1', projectId: 'project-1', title: 'Собрать оплату', status: 'done' },
                { id: 'task-2', projectId: 'project-1', title: 'Проверить онбординг', status: 'in_progress', plannedMinutes: 45 },
            ],
            slots: [{ id: 'slot-1', taskId: 'task-2', date: '2026-07-09', startTime: '15:00', endTime: '15:45' }],
            chronoActivities: [{ id: 'activity-1', taskId: 'task-2', projectId: 'project-1', name: 'Онбординг' }],
            chronoEntries: [{ id: 'entry-1', activityId: 'activity-1', date: '2026-07-09', minutes: 45 }],
        });

        renderGoals(state);

        expect(screen.getByLabelText('Прогресс цели 50%')).toBeTruthy();
        expect(screen.getByText('Проверить онбординг')).toBeTruthy();
        expect(screen.getByText('сегодня, 15:00')).toBeTruthy();
        expect(screen.getAllByText('1/2')).toHaveLength(2);
        expect(screen.getByText('45 мин')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Открыть карту' }));
        fireEvent.click(screen.getByRole('button', { name: 'Начать' }));
        expect(state.startChronoTimer).toHaveBeenCalledWith({ activityId: 'activity-1', plannedMinutes: 45 });
    });

    it('schedules the current focus from the primary action', () => {
        const state = createPlanningState({
            projects: [{ id: 'project-1', name: 'Сон', status: 'active' }],
            goals: [{
                id: 'goal-1', projectId: 'project-1', title: 'Ложиться вовремя', metricLabel: 'дни в режиме',
                nextTaskId: 'task-1', dueDate: '2026-08-01', createdAt: '2026-07-09T08:00:00.000Z', status: 'active',
            }],
            tasks: [{ id: 'task-1', projectId: 'project-1', title: 'Поставить вечерний будильник', status: 'in_progress' }],
        });

        renderGoals(state);
        fireEvent.click(screen.getByRole('button', { name: 'Открыть карту' }));
        fireEvent.click(screen.getByRole('button', { name: 'Запланировать' }));
        fireEvent.change(screen.getByLabelText('Время'), { target: { value: '21:30' } });
        fireEvent.click(screen.getByRole('button', { name: 'Поставить в календарь' }));

        expect(state.addSlot).toHaveBeenCalledWith(expect.objectContaining({
            taskId: 'task-1', date: '2026-07-09', startTime: '21:30', endTime: '22:00', source: 'goal',
        }));
        expect(state.updateTask).toHaveBeenCalledWith('task-1', expect.objectContaining({ dueDate: '2026-07-09' }));
    });

    it('does not present completed tasks as outcome progress', () => {
        const state = createPlanningState({
            projects: [{ id: 'project-1', name: 'Запуск', status: 'active' }],
            goals: [{ id: 'goal-1', projectId: 'project-1', title: 'Запустить продукт', dueDate: '2026-08-01', status: 'active' }],
            tasks: [{ id: 'task-1', projectId: 'project-1', title: 'Собрать экран', status: 'done' }],
        });

        renderGoals(state);

        expect(screen.getByText('Нужен критерий результата')).toBeTruthy();
        expect(screen.queryByLabelText(/Прогресс цели/)).toBeNull();
        expect(screen.getByText('1/1')).toBeTruthy();
    });

    it('requires a final result before completing a goal', () => {
        const state = createPlanningState({
            goals: [{
                id: 'goal-1',
                title: 'Стабильный сон',
                projectId: 'project-1',
                metricLabel: 'дни в режиме',
                dueDate: '2026-08-01',
                status: 'active',
            }],
            projects: [{ id: 'project-1', name: 'Стабильный сон', status: 'active' }],
        });

        renderGoals(state);
        fireEvent.click(screen.getByRole('button', { name: 'Открыть карту' }));
        fireEvent.click(screen.getByRole('button', { name: 'Цель: Стабильный сон' }));
        fireEvent.click(screen.getByRole('button', { name: 'Завершить цель' }));

        const completeButton = screen.getByRole('button', { name: 'Завершить цель' });
        expect(screen.getByLabelText('Текущий результат')).toBeTruthy();
        expect(completeButton.disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('Текущий результат'), { target: { value: '5 дней из 7' } });
        fireEvent.click(completeButton);

        expect(state.updateGoal).toHaveBeenCalledWith('goal-1', expect.objectContaining({
            status: 'done',
            reviewCurrent: '5 дней из 7',
            reviewHistory: [expect.objectContaining({ current: '5 дней из 7' })],
        }));
    });

    it('shows the saved result for a completed goal and restores it from settings', () => {
        const state = createPlanningState({
            goals: [{
                id: 'goal-1',
                title: 'Стабильный сон',
                metricLabel: 'дни в режиме',
                reviewCurrent: '5 дней из 7',
                completedAt: '2026-07-09T12:00:00.000Z',
                status: 'done',
            }],
        });

        renderGoals(state);

        expect(screen.getByText('Цель завершена')).toBeTruthy();
        expect(screen.getByText('Итоговый результат зафиксирован')).toBeTruthy();
        expect(screen.getByText('завершена 09.07')).toBeTruthy();
        expect(screen.getByText('5 дней из 7')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Открыть карту' }));
        fireEvent.click(screen.getByRole('button', { name: 'Вернуть в активные' }));

        expect(state.updateGoal).toHaveBeenCalledWith('goal-1', { status: 'active' });
    });

    it('archives only from settings and offers immediate and persistent restore', () => {
        const state = createPlanningState({
            goals: [{
                id: 'goal-1',
                title: 'Стабильный сон',
                projectId: 'project-1',
                metricLabel: 'дни в режиме',
                dueDate: '2026-08-01',
                nextTaskId: 'task-1',
                status: 'active',
            }],
            projects: [{ id: 'project-1', name: 'Стабильный сон', status: 'active' }],
            tasks: [{ id: 'task-1', projectId: 'project-1', title: 'Лечь вовремя', status: 'in_progress' }],
        });

        renderGoals(state);
        expect(screen.queryByRole('button', { name: 'Перенести в архив' })).toBeNull();
        expect(screen.queryByLabelText('Прогресс цели 0%')).toBeNull();
        expect(screen.queryByLabelText('Название цели')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Параметры цели' }));
        expect(screen.getByLabelText('Настройка цели')).toBeTruthy();
        expect(screen.getByRole('button', { name: '← Назад' })).toBeTruthy();
        expect(screen.getByLabelText('Название цели').value).toBe('Стабильный сон');
        expect(screen.queryByLabelText('Сейчас')).toBeNull();
        expect(screen.queryByRole('button', { name: '+ Цель' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '← Назад' }));
        expect(screen.getByRole('button', { name: '+ Цель' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Параметры цели' }));
        fireEvent.click(screen.getByRole('button', { name: 'Перенести в архив' }));

        expect(state.archiveGoal).toHaveBeenCalledWith('goal-1');
        expect(screen.getByText('«Стабильный сон» в архиве')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Архив (1)' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Вернуть' }));
        expect(state.updateGoal).toHaveBeenCalledWith('goal-1', { status: 'active' });
    });
});
