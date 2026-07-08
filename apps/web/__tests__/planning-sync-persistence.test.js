import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const planningStoreSource = fs.readFileSync(path.resolve(__dirname, '../heys_planning_store_v1.js'), 'utf8');
const storageSource = fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8');

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
