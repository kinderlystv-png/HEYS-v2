import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const planningStoreSource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_store_v1.js'), 'utf8');
const storageSource = fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8');
const rpcSource = fs.readFileSync(path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/index.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalReact = window.React;

function installReactStub() {
    window.React = {
        useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
        useEffect: () => undefined,
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
    };
}

function installHeys({ syncStatus = 'synced', mirrorLsSet = false } = {}) {
    const saveClientKey = vi.fn();
    const writeLocalKvWithoutMirror = vi.fn((key, value) => {
        window.localStorage.setItem(key, JSON.stringify(value));
    });
    window.HEYS = {
        currentClientId: 'client-1',
        utils: {
            lsGet: (key, fallback) => {
                const raw = window.localStorage.getItem(key);
                return raw == null ? fallback : JSON.parse(raw);
            },
            lsSet: (key, value) => {
                window.localStorage.setItem(key, JSON.stringify(value));
                if (mirrorLsSet) saveClientKey(key, value);
            },
        },
        cloud: {
            getClientId: () => 'client-1',
            getSyncStatus: vi.fn(() => syncStatus),
            saveClientKey,
            writeLocalKvWithoutMirror,
        },
    };
    return { saveClientKey, writeLocalKvWithoutMirror };
}

function loadPlanningStore() {
    // eslint-disable-next-line no-eval
    (0, eval)(planningStoreSource);
    return window.HEYS.Planning.Store;
}

describe('planning sync-aware persistence', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        window.localStorage.clear();
        window.localStorage.setItem('heys_client_current', 'client-1');
        installReactStub();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        window.localStorage.clear();
        window.HEYS = originalHEYS;
        window.React = originalReact;
    });

    it('explicitly enqueues completed chrono entries while keeping active timer local-only', () => {
        const { saveClientKey } = installHeys();
        const Store = loadPlanningStore();

        const activity = Store.addChronoActivity({ name: 'Reading', emoji: 'R' });
        saveClientKey.mockClear();

        const entry = Store.addChronoEntry({ activityId: activity.id, minutes: 25 });
        expect(entry).toBeTruthy();
        expect(saveClientKey).toHaveBeenCalledWith(
            'heys_planning_chrono_entries',
            expect.arrayContaining([expect.objectContaining({ id: entry.id, minutes: 25 })]),
        );

        saveClientKey.mockClear();
        const timer = Store.startChronoTimer({ activityId: activity.id, plannedMinutes: 20 });
        expect(timer).toBeTruthy();
        expect(saveClientKey).not.toHaveBeenCalled();

        const parity = Store.getPlanningSyncParitySnapshot();
        const timerRow = parity.keys.find((row) => row.key === 'heys_planning_chrono_timer');
        expect(timerRow.class).toBe('localOnly');
        expect(window.HEYS.Planning.Constants.STORAGE_CLASSES).toMatchObject({
            criticalClientKeys: expect.arrayContaining(['heys_planning_chrono_entries']),
            localOnlyKeys: expect.arrayContaining(['heys_planning_chrono_timer']),
            mergeableArrayKeys: expect.arrayContaining(['heys_planning_chrono_entries']),
        });
    });

    it('can enqueue a merge rescue when local-only planning records survive cloud merge', () => {
        const { saveClientKey } = installHeys({ syncStatus: 'synced' });
        const Store = loadPlanningStore();
        const merged = [{ id: 'local-entry', activityId: 'a1', minutes: 10, date: '2026-06-27' }];

        const didQueue = Store.enqueuePlanningMergeRescue('heys_planning_chrono_entries', merged, {
            reason: 'test-rescue',
        });

        expect(didQueue).toBe(true);
        expect(saveClientKey).toHaveBeenCalledWith('heys_planning_chrono_entries', merged);
    });

    it('enqueues calendar slots and exposes slot parity drift in debug snapshot', () => {
        const { saveClientKey } = installHeys({ syncStatus: 'synced' });
        const Store = loadPlanningStore();

        Store.notePlanningCloudValue('heys_planning_slots', [], { source: 'test-cloud' });
        const slot = Store.addSlot({
            taskId: 'task-1',
            date: '2026-07-09',
            startTime: '13:15',
            endTime: '14:15',
        });

        expect(saveClientKey).toHaveBeenCalledWith(
            'heys_planning_slots',
            expect.arrayContaining([expect.objectContaining({ id: slot.id, taskId: 'task-1' })]),
        );

        const parity = Store.getPlanningSyncParitySnapshot();
        const slotsRow = parity.keys.find((row) => row.key === 'heys_planning_slots');
        expect(slotsRow.class).toBe('criticalClientKey+mergeableArray');
        expect(slotsRow.localOnlyIds).toContain(slot.id);
        expect(slotsRow.confirmStatus).toBe('pending-readback');
        expect(slotsRow.lastPersist).toEqual(expect.objectContaining({
            key: 'heys_planning_slots',
            reason: 'slots-save:add',
            status: 'queued',
            sync: true,
            summary: expect.objectContaining({ length: 1 }),
        }));
    });

    it('does not mirror cloud-refresh planning writes back into upload queue', () => {
        const { saveClientKey, writeLocalKvWithoutMirror } = installHeys({ mirrorLsSet: true });
        const Store = loadPlanningStore();
        const cloudEntries = [{ id: 'cloud-entry', activityId: 'a1', minutes: 10, date: '2026-07-01' }];

        Store.saveChronoEntries(cloudEntries, { sync: false, reason: 'cloud-refresh' });

        expect(writeLocalKvWithoutMirror).toHaveBeenCalledWith(
            'heys_client-1_planning_chrono_entries',
            cloudEntries,
        );
        expect(saveClientKey).not.toHaveBeenCalled();
        expect(JSON.parse(window.localStorage.getItem('heys_client-1_planning_chrono_entries'))).toEqual(cloudEntries);
    });

    it('stores goals as sync-backed mergeable planning records', () => {
        const { saveClientKey } = installHeys();
        const Store = loadPlanningStore();

        const goal = Store.addGoal({
            title: 'Стабильный режим',
            metricLabel: 'тренировки',
            targetValue: 12,
            dueDate: '2026-08-01',
        });

        expect(goal).toMatchObject({
            title: 'Стабильный режим',
            metricLabel: 'тренировки',
            targetValue: 12,
            status: 'active',
        });
        expect(saveClientKey).toHaveBeenCalledWith(
            'heys_planning_goals_v1',
            expect.arrayContaining([expect.objectContaining({ id: goal.id })]),
        );
        expect(window.HEYS.Planning.Constants.STORAGE_CLASSES).toMatchObject({
            criticalClientKeys: expect.arrayContaining(['heys_planning_goals_v1']),
            mergeableArrayKeys: expect.arrayContaining(['heys_planning_goals_v1']),
        });

        saveClientKey.mockClear();
        const updated = Store.updateGoal(goal.id, {
            keyResults: [{ text: '3 тренировки в неделю', done: true }],
            baselineValue: 2,
            currentValue: 4,
            reviewChange: 'стало проще держать режим',
            reviewCurrent: '4',
            reviewNextStep: 'поставить тренировку в календарь',
            reviewHistory: [{
                id: 'review-1',
                at: '2026-07-09T12:00:00.000Z',
                current: '4',
                change: 'стало проще держать режим',
                nextStep: 'поставить тренировку в календарь',
            }],
        });

        expect(updated.keyResults).toEqual([
            expect.objectContaining({ text: '3 тренировки в неделю', done: true }),
        ]);
        expect(updated).toMatchObject({
            baselineValue: 2,
            reviewChange: 'стало проще держать режим',
            reviewCurrent: '4',
            reviewNextStep: 'поставить тренировку в календарь',
            reviewHistory: [expect.objectContaining({
                id: 'review-1',
                current: '4',
            })],
        });
        expect(saveClientKey).toHaveBeenCalledWith(
            'heys_planning_goals_v1',
            expect.arrayContaining([expect.objectContaining({ id: goal.id, currentValue: 4 })]),
        );

        const mergeableRouteLine = storageSource.split('\n').find((line) => line.includes('const MERGEABLE_KEY_RE'));
        const mergeKeyBlockStart = rpcSource.indexOf('const PLANNING_RECORD_MERGE_KEYS');
        const mergeKeyBlock = rpcSource.slice(mergeKeyBlockStart, rpcSource.indexOf(']);', mergeKeyBlockStart));
        expect(mergeableRouteLine).toContain('heys_planning_goals_v1');
        expect(mergeKeyBlock).toContain("'heys_planning_goals_v1'");

        const archived = Store.archiveGoal(goal.id);
        expect(archived.status).toBe('archived');

        const completed = Store.updateGoal(goal.id, { status: 'done' });
        expect(completed).toMatchObject({ status: 'done' });
        expect(completed.completedAt).toBeTruthy();
    });

    it('allows only one active goal per execution project', () => {
        installHeys();
        const Store = loadPlanningStore();
        const project = Store.addProject('Запуск');
        const first = Store.addGoal({ title: 'Запустить HEYS', projectId: project.id, metricLabel: 'готовность' });

        expect(first.projectId).toBe(project.id);
        expect(Store.addGoal({ title: 'Другая цель', projectId: project.id })).toBeNull();

        Store.archiveGoal(first.id);
        expect(Store.addGoal({ title: 'Следующая цель', projectId: project.id })).toMatchObject({
            projectId: project.id,
            status: 'active',
        });
    });

    it('infers the project for a legacy goal from its focused task', () => {
        installHeys();
        const Store = loadPlanningStore();
        const project = Store.addProject('Сон');
        const task = Store.addTask('Поставить вечерний будильник', { projectId: project.id });
        const goal = Store.addGoal({ title: 'Ложиться вовремя', nextTaskId: task.id, metricLabel: 'дни в режиме' });

        expect(goal.projectId).toBeUndefined();
        expect(Store.getGoals().find((item) => item.id === goal.id)).toMatchObject({ projectId: project.id });
    });

    it('merges goal arrays by id without dropping local-only goals', () => {
        installHeys();
        const Store = loadPlanningStore();

        const merged = Store.mergeCloudPlanningArray('heys_planning_goals_v1', [
            { id: 'shared', title: 'Local title', updatedAt: '2026-07-04T12:00:00Z', createdAt: '2026-07-04T10:00:00Z' },
            { id: 'local-only', title: 'Local only', updatedAt: '2026-07-04T12:01:00Z' },
        ], [
            { id: 'shared', title: 'Remote old', updatedAt: '2026-07-04T11:00:00Z' },
            { id: 'remote-only', title: 'Remote only', updatedAt: '2026-07-04T12:02:00Z' },
        ]);

        expect(merged).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'shared', title: 'Local title' }),
            expect.objectContaining({ id: 'local-only', title: 'Local only' }),
            expect.objectContaining({ id: 'remote-only', title: 'Remote only' }),
        ]));
        expect(merged).toHaveLength(3);
    });

    it('decompresses compressed planning cloud rows before refresh writes', async () => {
        const { saveClientKey } = installHeys({ mirrorLsSet: true });
        const Store = loadPlanningStore();
        const cloudEntries = [{ id: 'cloud-compressed', activityId: 'a1', minutes: 15, date: '2026-07-02' }];
        window.HEYS.store = {
            decompress: vi.fn(() => cloudEntries),
        };
        window.HEYS.YandexAPI = {
            getKVBatch: vi.fn().mockResolvedValue({
                data: [
                    {
                        k: 'heys_planning_chrono_entries',
                        v: '¤Z¤compressed-planning-entries',
                        revision: 17,
                    },
                ],
            }),
        };

        const result = await window.HEYS.Planning.refreshPlanningFromCloud();

        expect(result).toMatchObject({ ok: true });
        expect(window.HEYS.store.decompress).toHaveBeenCalledWith('¤Z¤compressed-planning-entries');
        expect(JSON.parse(window.localStorage.getItem('heys_client-1_planning_chrono_entries'))).toEqual(cloudEntries);
        expect(saveClientKey).not.toHaveBeenCalled();
    });

    it('bulk-deletes tasks with slots, links, and dependency references', () => {
        installHeys();
        const Store = loadPlanningStore();

        const emptyingProject = Store.addProject('Emptying project');
        const historyOnlyProject = Store.addProject('History only project');
        const keptProject = Store.addProject('Kept project');
        const parent = Store.addTask('Parent', { status: 'in_progress' });
        const child = Store.addTask('Child', { parentTaskId: parent.id, status: 'in_progress' });
        const projectTask = Store.addTask('Project task', { projectId: emptyingProject.id, status: 'in_progress' });
        const history = Store.addTask('History', { projectId: historyOnlyProject.id, status: 'done', blockedByTaskIds: [parent.id, child.id] });
        const keep = Store.addTask('Keep', { projectId: keptProject.id, status: 'in_progress' });
        Store.addSlot({ taskId: parent.id, title: 'Parent slot' });
        Store.addSlot({ taskId: projectTask.id, title: 'Project slot' });
        Store.addSlot({ taskId: history.id, title: 'History slot' });
        Store.addSlot({ taskId: keep.id, title: 'Keep slot' });
        Store.addLink(parent.id, history.id, { relation: 'related', fromType: 'task', toType: 'task' });
        Store.addLink(keep.id, child.id, { relation: 'related', fromType: 'task', toType: 'task' });

        const count = Store.deleteTasks([parent.id, child.id, projectTask.id], {
            deleteProjectIds: [emptyingProject.id, historyOnlyProject.id],
        });

        expect(count).toBe(3);
        expect(Store.getProjects()).toEqual([
            expect.objectContaining({ id: keptProject.id, name: 'Kept project' }),
        ]);
        const remainingTasks = Store.getTasks();
        const remainingHistory = remainingTasks.find((task) => task.id === history.id);
        expect(remainingTasks).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: history.id, blockedByTaskIds: [] }),
            expect.objectContaining({ id: keep.id, projectId: keptProject.id }),
        ]));
        expect(remainingHistory).not.toHaveProperty('projectId');
        expect(remainingTasks).toHaveLength(2);
        expect(Store.getSlots()).toEqual(expect.arrayContaining([
            expect.objectContaining({ taskId: history.id, title: 'History slot' }),
            expect.objectContaining({ taskId: keep.id, title: 'Keep slot' }),
        ]));
        expect(Store.getSlots()).toHaveLength(2);
        expect(Store.getLinks()).toEqual([]);
    });

    it('can delete empty task groups without deleting history tasks', () => {
        installHeys();
        const Store = loadPlanningStore();

        const historyOnlyProject = Store.addProject('History only project');
        const history = Store.addTask('History', { projectId: historyOnlyProject.id, status: 'done' });
        Store.addSlot({ taskId: history.id, title: 'History slot' });

        const count = Store.deleteTasks([], { deleteProjectIds: [historyOnlyProject.id] });

        expect(count).toBe(1);
        expect(Store.getProjects()).toEqual([]);
        const remainingHistory = Store.getTasks()[0];
        expect(remainingHistory).toEqual(expect.objectContaining({ id: history.id, status: 'done' }));
        expect(remainingHistory).not.toHaveProperty('projectId');
        expect(Store.getSlots()).toEqual([
            expect.objectContaining({ taskId: history.id, title: 'History slot' }),
        ]);
    });

    it('does not classify terminal tasks as overdue due-filter items', () => {
        installHeys();
        const Store = loadPlanningStore();
        const { getDueBucket } = window.HEYS.Planning.Utils;

        const done = Store.addTask('Done old task', {
            status: 'done',
            dueDate: '2026-06-01',
        });
        const cancelled = Store.addTask('Cancelled old task', {
            status: 'cancelled',
            dueDate: '2026-06-01',
        });
        const active = Store.addTask('Active old task', {
            status: 'in_progress',
            dueDate: '2026-06-01',
        });

        expect(getDueBucket(done, '2026-07-07', [])).toBe('all');
        expect(getDueBucket(cancelled, '2026-07-07', [])).toBe('all');
        expect(getDueBucket(active, '2026-07-07', [])).toBe('overdue');
    });

    it('keeps the storage hot-sync merge rescue wired before idempotent return', () => {
        const rescueIdx = storageSource.indexOf('enqueuePlanningMergeRescue(baseKey, mergedArr');
        const idempotentIdx = storageSource.indexOf('if (currentRaw === reserialized) return false; // idempotent no-op; rescue above handles local-only parity');

        expect(rescueIdx).toBeGreaterThan(0);
        expect(idempotentIdx).toBeGreaterThan(rescueIdx);
    });
});
