import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_schedule_v1.js'), 'utf8');

function installScheduleModule() {
    // eslint-disable-next-line no-eval
    eval(source);
    return window.HEYS.PlanningSchedule;
}

describe('Planning calendar task picker helpers', () => {
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
                    CALENDAR_START_HOUR: 3,
                    CALENDAR_END_HOUR: 26,
                    CALENDAR_HOUR_HEIGHT: 60,
                    GANTT_ZOOM_WIDTHS: {},
                },
                Utils: {
                    addDays: (iso, days) => {
                        const date = new Date(String(iso) + 'T12:00:00');
                        date.setDate(date.getDate() + days);
                        return date.toISOString().slice(0, 10);
                    },
                    dateStr: (value) => String(value || '').slice(0, 10),
                    diffDays: () => 0,
                    getTaskDurationMinutes: () => 60,
                    getTaskProjectColor: () => '#64748b',
                    timeToMinutes: (value) => {
                        const [hours, minutes] = String(value || '00:00').split(':').map(Number);
                        return ((Number(hours) || 0) * 60) + (Number(minutes) || 0);
                    },
                    uid: () => 'id',
                },
                Hooks: {
                    usePlanningViewport: () => ({ isDesktop: false }),
                },
            },
            PlanningQuickTarget: {
                buildResolvedTaskProjectMap: () => new Map(),
                buildTaskLookup: () => new Map(),
                encodePlanningFieldsToQuickValue: () => '',
                getResolvedTaskProjectId: () => '',
                PlanningQuickTargetField: () => null,
                resolveQuickTargetToFormFields: () => ({}),
                resolveQuickTargetValue: () => ({}),
            },
            PlanningTasks: {},
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

    it('shows only tasks that can be added without creating a duplicate slot', () => {
        const Schedule = installScheduleModule();
        const tasks = [
            { id: 'done', title: 'Done task', priority: 'p!', status: 'done', order: 0 },
            { id: 'parent', title: 'Parent task', priority: 'p!', status: 'in_progress', order: 0 },
            { id: 'p3', title: 'Write notes', priority: 'p3', status: 'in_progress', order: 0 },
            { id: 'p1', title: 'Write brief', priority: 'p1', status: 'todo', order: 2 },
            { id: 'urgent', title: 'Write launch', priority: 'p!', status: 'in_progress', order: 3 },
            { id: 'p2', title: 'Call client', priority: 'p2', status: 'in_progress', order: 1 },
        ];
        const slots = [
            { id: 'single', taskId: 'p1', date: '2026-07-09' },
            { id: 'repeat-1', taskId: 'p3', date: '2026-07-09', recurrenceGroupId: 'repeat' },
            { id: 'repeat-2', taskId: 'p3', date: '2026-07-16', recurrenceGroupId: 'repeat' },
        ];

        const visible = Schedule.buildCalendarTaskPickerTasks(tasks, 'write', new Set(['parent']), slots);

        expect(visible.map((task) => task.id)).toEqual(['urgent', 'p3']);
        expect(Schedule.canTaskAddCalendarSlot('urgent', slots)).toBe(true);
        expect(Schedule.canTaskAddCalendarSlot('p1', slots)).toBe(false);
        expect(Schedule.canTaskAddCalendarSlot('p3', slots)).toBe(true);
    });

    it('keeps only unfinished tasks from overdue calendar slots in today header', () => {
        const Schedule = installScheduleModule();
        const tasks = [
            { id: 'overdue', title: 'Overdue slot', priority: 'p2', status: 'in_progress', order: 2 },
            { id: 'older', title: 'Older urgent slot', priority: 'p!', status: 'todo', order: 3 },
            { id: 'past-unslotted', title: 'Past date only', priority: 'p!', status: 'in_progress', dueDate: '2026-07-01' },
            { id: 'today', title: 'Today slot', priority: 'p1', status: 'in_progress' },
            { id: 'done', title: 'Done old slot', priority: 'p!', status: 'done' },
            { id: 'cancelled', title: 'Cancelled old slot', priority: 'p!', status: 'cancelled' },
            { id: 'parent', title: 'Parent old slot', priority: 'p!', status: 'in_progress' },
        ];
        const slots = [
            { id: 'overdue-old', taskId: 'overdue', date: '2026-07-07', startTime: '10:00', endTime: '11:00' },
            { id: 'overdue-latest', taskId: 'overdue', date: '2026-07-08', startTime: '15:00', endTime: '16:00' },
            { id: 'older-slot', taskId: 'older', date: '2026-07-01', startTime: '12:00', endTime: '13:00' },
            { id: 'today-slot', taskId: 'today', date: '2026-07-09', startTime: '11:00', endTime: '12:00' },
            { id: 'done-slot', taskId: 'done', date: '2026-07-08', startTime: '11:00', endTime: '12:00' },
            { id: 'cancelled-slot', taskId: 'cancelled', date: '2026-07-08', startTime: '12:00', endTime: '13:00' },
            { id: 'parent-slot', taskId: 'parent', date: '2026-07-08', startTime: '13:00', endTime: '14:00' },
            { id: 'quick-slot', title: 'Quick slot', date: '2026-07-08', startTime: '14:00', endTime: '15:00' },
        ];
        const days = ['2026-07-09', '2026-07-10', '2026-07-11'];

        const byDay = Schedule.buildCalendarOverdueSlotItemsByDay(tasks, slots, '2026-07-09', days, new Set(['parent']));

        expect(Object.keys(byDay)).toEqual(days);
        expect(byDay['2026-07-09'].map((item) => item.task.id)).toEqual(['older', 'overdue']);
        expect(byDay['2026-07-09'].map((item) => item.slot.id)).toEqual(['older-slot', 'overdue-latest']);
        expect(byDay['2026-07-10']).toEqual([]);
        expect(byDay['2026-07-11']).toEqual([]);
    });

    it('removes only the calendar slot without changing the linked task', () => {
        const Schedule = installScheduleModule();
        const calls = [];
        const state = {
            deleteSlot: (slotId) => calls.push(['deleteSlot', slotId]),
            updateTask: (...args) => calls.push(['updateTask', ...args]),
        };

        Schedule.removeCalendarSlotKeepTask(state, { id: 'slot-1', taskId: 'task-1' });

        expect(calls).toEqual([['deleteSlot', 'slot-1']]);
    });

    it('builds a passive sleep block clipped to the visible calendar day', () => {
        const Schedule = installScheduleModule();

        expect(Schedule.buildCalendarSleepBlock({
            sleepStart: '03:45',
            sleepEnd: '09:45',
            sleepHours: 6,
        })).toEqual({
            top: 45,
            height: 360,
            startTime: '03:45',
            endTime: '09:45',
        });

        expect(Schedule.buildCalendarSleepBlock({
            sleepStart: '23:30',
            sleepEnd: '07:30',
            sleepHours: 8,
        })).toEqual({
            top: 0,
            height: 270,
            startTime: '03:00',
            endTime: '07:30',
        });

        expect(Schedule.buildCalendarSleepBlock({})).toBeNull();
    });

    it('builds passive meal and training intervals only from recorded activity', () => {
        const Schedule = installScheduleModule();

        expect(Schedule.buildCalendarDayContextBlocks({
            meals: [
                { id: 'breakfast', time: '09:15', items: [{ id: 'oats' }] },
                { id: 'empty', time: '12:00', items: [] },
            ],
            trainings: [
                { id: 'run', time: '18:00', activityLabel: 'Бег', z: [10, 20, 15, 0] },
                { id: 'no-time', z: [0, 30, 0, 0] },
            ],
        })).toEqual([
            {
                id: 'meal-breakfast',
                kind: 'meal',
                title: 'Приём пищи',
                top: 375,
                height: 30,
                startTime: '09:15',
                endTime: '09:45',
            },
            {
                id: 'training-run',
                kind: 'training',
                title: 'Бег',
                top: 900,
                height: 45,
                startTime: '18:00',
                endTime: '18:45',
            },
        ]);
    });

    it('builds non-blocking hunger and wellbeing markers for the selected day', () => {
        const Schedule = installScheduleModule();
        const markers = Schedule.buildCalendarStateMarkers({
            date: '2026-07-10',
            sleepEnd: '08:00',
            wellbeingMorning: 8,
            meals: [
                { id: 'lunch', time: '12:00', wellbeing: 6, items: [{ id: 'rice' }] },
                { id: 'empty', time: '14:00', wellbeing: 2, items: [] },
            ],
            trainings: [
                { id: 'run', time: '18:00', wellbeing: 3, z: [15, 20, 0, 0] },
            ],
        }, [
            { id: 'h1', date: '2026-07-10', recordedAt: '2026-07-10T10:30:00', hungerLevel: 7 },
            { id: 'other-day', date: '2026-07-09', recordedAt: '2026-07-09T10:30:00', hungerLevel: 9 },
        ], '2026-07-10');

        expect(markers).toEqual([
            {
                id: 'wellbeing-morning', kind: 'wellbeing', value: 8,
                label: 'Самочувствие после сна', time: '08:00', top: 300, tone: 'calm',
            },
            {
                id: 'hunger-h1', kind: 'hunger', value: 7,
                label: 'Голод', time: '10:30', top: 450, tone: 'alert',
            },
            {
                id: 'wellbeing-meal-lunch', kind: 'wellbeing', value: 6,
                label: 'Самочувствие после еды', time: '12:00', top: 540, tone: 'attention',
            },
            {
                id: 'wellbeing-training-run', kind: 'wellbeing', value: 3,
                label: 'Самочувствие после тренировки', time: '18:00', top: 900, tone: 'alert',
            },
        ]);
    });

    it('warns about overlaps and suggests the nearest free range', () => {
        const Schedule = installScheduleModule();
        const slots = [
            { id: 'a', startTime: '10:00', endTime: '11:00' },
            { id: 'b', startTime: '12:00', endTime: '13:00' },
        ];

        expect(Schedule.resolveCalendarDropConflict(slots, '10:30', 60)).toEqual({
            hasConflict: true,
            conflictCount: 1,
            suggestedStartTime: '11:00',
            suggestedEndTime: '12:00',
        });

        expect(Schedule.resolveCalendarDropConflict(slots, '10:30', 60, {
            excludeSlotId: 'a',
        }).hasConflict).toBe(false);

        expect(Schedule.resolveCalendarDropConflict([], '08:00', 60, {
            sleepBlock: { startTime: '03:00', endTime: '09:00' },
        }).suggestedStartTime).toBe('09:00');

        expect(Schedule.resolveCalendarDropConflict([], '13:15', 30, {
            contextBlocks: [
                { startTime: '13:00', endTime: '13:30' },
                { startTime: '13:45', endTime: '14:30' },
            ],
        })).toMatchObject({
            hasConflict: true,
            suggestedStartTime: '12:30',
            suggestedEndTime: '13:00',
        });
    });

    it('resolves parallel and suggested conflict choices without losing the calendar day', () => {
        const Schedule = installScheduleModule();
        const conflict = {
            displayDay: '2026-07-10',
            startTime: '23:30',
            suggestedStartTime: '01:00',
        };

        expect(Schedule.resolveCalendarConflictChoiceTarget(conflict, false)).toEqual({
            date: '2026-07-10',
            time: '23:30',
            displayHour: 23,
            subHourMinutes: 30,
        });
        expect(Schedule.resolveCalendarConflictChoiceTarget(conflict, true)).toEqual({
            date: '2026-07-11',
            time: '01:00',
            displayHour: 25,
            subHourMinutes: 0,
        });
    });

    it('builds isolated undo actions for moved and created slots', () => {
        const Schedule = installScheduleModule();
        const calls = [];
        const state = {
            updateSlot: (...args) => calls.push(['updateSlot', ...args]),
            deleteSlot: (...args) => calls.push(['deleteSlot', ...args]),
        };
        const moved = Schedule.buildCalendarSlotUndoEntry(state, {
            kind: 'move',
            slotId: 'slot-1',
            original: { date: '2026-07-10', startTime: '10:00', endTime: '11:00' },
        });
        const created = Schedule.buildCalendarSlotUndoEntry(state, {
            kind: 'create',
            slotId: 'slot-2',
        });

        moved.undo();
        created.undo();

        expect(moved.label).toBe('Слот перенесён');
        expect(created.label).toBe('Слот добавлен');
        expect(calls).toEqual([
            ['updateSlot', 'slot-1', { date: '2026-07-10', startTime: '10:00', endTime: '11:00' }],
            ['deleteSlot', 'slot-2'],
        ]);
    });
});
