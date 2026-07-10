import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_store_v1.js'), 'utf8');
const require = createRequire(import.meta.url);
const { mergePlanningRecords } = require('../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');

function scoped(baseKey) {
    const id = window.HEYS.currentClientId;
    return id && baseKey.startsWith('heys_') ? `heys_${id}_${baseKey.slice(5)}` : baseKey;
}

function installStore() {
    window.React = {
        useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
        useEffect: () => undefined,
        useCallback: (fn) => fn,
        useMemo: (fn) => fn(),
    };
    window.HEYS = {
        currentClientId: 'client-a',
        utils: {
            lsGet: (key, fallback) => {
                const raw = localStorage.getItem(scoped(key));
                return raw == null ? fallback : JSON.parse(raw);
            },
            lsSet: (key, value) => localStorage.setItem(scoped(key), JSON.stringify(value)),
        },
        cloud: {
            getClientId: () => window.HEYS.currentClientId,
            getSyncStatus: () => 'synced',
            saveClientKey: vi.fn(),
            writeLocalKvWithoutMirror: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        },
    };
    // eslint-disable-next-line no-eval
    (0, eval)(source);
    return window.HEYS.Planning.Store;
}

describe('goal map store and tombstones', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-10T09:00:00.000Z'));
        localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('merges parallel map additions and lets a newer position win', () => {
        const Store = installStore();
        const local = [
            { id: 'node:a', schemaVersion: 1, recordType: 'node', goalId: 'g1', nodeKind: 'note', entityType: 'map', title: 'A', x: 10, y: 20, updatedAt: '2026-07-10T09:02:00.000Z' },
            { id: 'node:shared', schemaVersion: 1, recordType: 'node', goalId: 'g1', nodeKind: 'task', entityType: 'task', entityId: 't1', x: 100, y: 100, updatedAt: '2026-07-10T09:03:00.000Z' },
        ];
        const remote = [
            { id: 'node:b', schemaVersion: 1, recordType: 'node', goalId: 'g1', nodeKind: 'decision', entityType: 'map', title: 'B', x: -10, y: 20, updatedAt: '2026-07-10T09:02:30.000Z' },
            { id: 'node:shared', schemaVersion: 1, recordType: 'node', goalId: 'g1', nodeKind: 'task', entityType: 'task', entityId: 't1', x: 50, y: 50, updatedAt: '2026-07-10T09:01:00.000Z' },
        ];

        const merged = Store.mergeCloudPlanningArray('heys_planning_goal_map_records_v1', local, remote);

        expect(merged.map((record) => record.id)).toEqual(['node:a', 'node:b', 'node:shared']);
        expect(merged.find((record) => record.id === 'node:shared')).toMatchObject({ x: 100, y: 100 });
    });

    it('atomically merges planning records in the cloud helper', () => {
        const merged = mergePlanningRecords(
            [
                { id: 'local', updatedAt: '2026-07-10T09:02:00.000Z' },
                { id: 'shared', x: 20, updatedAt: '2026-07-10T09:03:00.000Z' },
            ],
            [
                { id: 'remote', updatedAt: '2026-07-10T09:01:00.000Z' },
                { id: 'shared', x: 10, updatedAt: '2026-07-10T09:02:00.000Z' },
            ],
        );

        expect(merged.map((record) => record.id)).toEqual(['local', 'remote', 'shared']);
        expect(merged.find((record) => record.id === 'shared').x).toBe(20);
    });

    it('keeps map tombstones authoritative and supports a newer undo record', () => {
        const Store = installStore();
        const node = Store.upsertGoalMapRecord({
            id: 'node:a', schemaVersion: 1, recordType: 'node', goalId: 'g1', nodeKind: 'note', entityType: 'map', title: 'A', x: 10, y: 20,
        });
        Store.deleteGoalMapRecord(node.id, 'g1');

        expect(Store.getGoalMapRecords('g1')).toEqual([]);
        const merged = Store.mergeCloudPlanningArray('heys_planning_goal_map_records_v1', Store.getAllGoalMapRecords({ includeTombstones: true }), [node]);
        expect(merged).toEqual([expect.objectContaining({ id: node.id, recordType: 'tombstone' })]);

        const restored = Store.upsertGoalMapRecord(node);
        expect(restored.recordType).toBe('node');
        expect(Store.getGoalMapRecords('g1')).toEqual([expect.objectContaining({ id: node.id, title: 'A' })]);
    });

    it('cascades task deletion to slots and links without resurrecting old cloud rows', () => {
        const Store = installStore();
        const task = Store.addTask('Удаляемая задача');
        const survivor = Store.addTask('Остаётся', { blockedByTaskIds: [task.id] });
        const slot = Store.addSlot({ taskId: task.id, date: '2026-07-10' });
        const link = Store.addLink(task.id, survivor.id, { relation: 'related' });

        Store.deleteTask(task.id);

        expect(Store.getTasks().map((item) => item.id)).toEqual([survivor.id]);
        expect(Store.getTasks()[0].blockedByTaskIds).toEqual([]);
        expect(Store.getSlots()).toEqual([]);
        expect(Store.getLinks()).toEqual([]);
        expect(Store.getPlanningEntityTombstones()).toEqual(expect.arrayContaining([
            expect.objectContaining({ entityType: 'task', entityId: task.id }),
            expect.objectContaining({ entityType: 'slot', entityId: slot.id }),
            expect.objectContaining({ entityType: 'link', entityId: link.id }),
        ]));

        const mergedTasks = Store.mergeCloudPlanningArray('heys_planning_tasks', Store.getTasks(), [task]);
        Store.saveTasks(mergedTasks, { sync: false, reason: 'test-cloud-refresh' });
        expect(Store.getTasks()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id })]));
        expect(Store.restorePlanningEntity('task', task)).toMatchObject({ id: task.id });
        expect(Store.getTasks().map((item) => item.id)).toContain(task.id);
    });

    it('keeps goal maps isolated by client scope', () => {
        const Store = installStore();
        Store.upsertGoalMapRecord({ id: 'node:a', schemaVersion: 1, recordType: 'node', goalId: 'g1', nodeKind: 'note', entityType: 'map', title: 'Client A', x: 0, y: 0 });

        window.HEYS.currentClientId = 'client-b';
        expect(Store.getGoalMapRecords('g1')).toEqual([]);
        Store.upsertGoalMapRecord({ id: 'node:b', schemaVersion: 1, recordType: 'node', goalId: 'g1', nodeKind: 'note', entityType: 'map', title: 'Client B', x: 0, y: 0 });

        window.HEYS.currentClientId = 'client-a';
        expect(Store.getGoalMapRecords('g1')).toEqual([expect.objectContaining({ title: 'Client A' })]);
    });
});
