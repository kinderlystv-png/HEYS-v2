// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_planning_store_v1.js'), 'utf8');
const storageSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_storage_supabase_v1.js'),
  'utf8',
);
const rpcSource = fs.readFileSync(
  path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/index.js'),
  'utf8',
);

function scoped(key) {
  return `heys_client-1_${String(key).replace(/^heys_/, '')}`;
}

function installStore() {
  let writeCount = 0;
  let failAt = null;
  const saveClientKey = vi.fn();
  const lsSet = vi.fn((key, value) => {
    writeCount += 1;
    if (writeCount === failAt) throw new Error(`fault_after_write_${failAt - 1}`);
    window.localStorage.setItem(scoped(key), JSON.stringify(value));
  });
  window.React = {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
    useEffect: () => undefined,
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  };
  window.HEYS = {
    currentClientId: 'client-1',
    utils: {
      lsGet: (key, fallback) => {
        const raw = window.localStorage.getItem(scoped(key));
        return raw == null ? fallback : JSON.parse(raw);
      },
      lsSet,
    },
    cloud: {
      getClientId: () => 'client-1',
      getSyncStatus: () => 'synced',
      saveClientKey,
      writeLocalKvWithoutMirror: (key, value) =>
        window.localStorage.setItem(key, JSON.stringify(value)),
    },
  };
  // eslint-disable-next-line no-eval
  (0, eval)(source);
  return {
    Store: window.HEYS.Planning.Store,
    saveClientKey,
    armFault(step) {
      writeCount = 0;
      failAt = step;
    },
    clearFault() {
      writeCount = 0;
      failAt = null;
    },
  };
}

function seedCascade(Store) {
  const at = '2026-07-18T10:00:00.000Z';
  Store.saveProjects(
    [
      { id: 'project-delete', name: 'Delete', order: 0, createdAt: at, updatedAt: at },
      { id: 'project-keep', name: 'Keep', order: 1, createdAt: at, updatedAt: at },
    ],
    { sync: false },
  );
  Store.saveTasks(
    [
      {
        id: 'task-delete',
        title: 'Delete',
        projectId: 'project-delete',
        blockedByTaskIds: [],
        order: 0,
        createdAt: at,
        updatedAt: at,
      },
      {
        id: 'task-history',
        title: 'History',
        projectId: 'project-delete',
        blockedByTaskIds: ['task-delete'],
        order: 1,
        createdAt: at,
        updatedAt: at,
      },
      {
        id: 'task-child',
        title: 'Child',
        projectId: 'project-keep',
        parentTaskId: 'task-delete',
        blockedByTaskIds: [],
        order: 2,
        createdAt: at,
        updatedAt: at,
      },
    ],
    { sync: false },
  );
  Store.saveSlots(
    [
      {
        id: 'slot-delete',
        taskId: 'task-delete',
        date: '2026-07-18',
        order: 0,
        createdAt: at,
        updatedAt: at,
      },
      {
        id: 'slot-keep',
        taskId: 'task-child',
        date: '2026-07-19',
        order: 1,
        createdAt: at,
        updatedAt: at,
      },
    ],
    { sync: false },
  );
  Store.saveLinks(
    [
      {
        id: 'link-delete',
        fromId: 'task-delete',
        toId: 'task-child',
        relation: 'related',
        createdAt: at,
        updatedAt: at,
      },
    ],
    { sync: false },
  );
}

function expectCascadeComplete(Store) {
  expect(Store.getProjects().map((item) => item.id)).toEqual(['project-keep']);
  expect(Store.getTasks().map((item) => item.id)).toEqual(['task-history', 'task-child']);
  expect(Store.getTasks().find((item) => item.id === 'task-history')).not.toHaveProperty(
    'projectId',
  );
  expect(Store.getTasks().find((item) => item.id === 'task-history')?.blockedByTaskIds).toEqual([]);
  expect(Store.getTasks().find((item) => item.id === 'task-child')).not.toHaveProperty(
    'parentTaskId',
  );
  expect(Store.getSlots().map((item) => item.id)).toEqual(['slot-keep']);
  expect(Store.getLinks()).toEqual([]);
  expect(Store.getPlanningEntityTombstones()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ entityType: 'task', entityId: 'task-delete' }),
      expect.objectContaining({ entityType: 'slot', entityId: 'slot-delete' }),
      expect.objectContaining({ entityType: 'link', entityId: 'link-delete' }),
      expect.objectContaining({ entityType: 'project', entityId: 'project-delete' }),
    ]),
  );
}

describe('planning durable delete commands', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'));
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('queues the command before every affected planning collection', () => {
    const { Store, saveClientKey } = installStore();
    seedCascade(Store);
    saveClientKey.mockClear();

    Store.deleteTasks(['task-delete'], { deleteProjectIds: ['project-delete'] });

    expect(saveClientKey.mock.calls.map((call) => call[0])).toEqual([
      'heys_planning_commands_v1',
      'heys_planning_entity_tombstones_v1',
      'heys_planning_projects',
      'heys_planning_tasks',
      'heys_planning_slots',
      'heys_planning_links_v1',
    ]);
    expectCascadeComplete(Store);
  });

  it('routes direct project deletion through the same durable command', () => {
    const { Store } = installStore();
    seedCascade(Store);

    Store.deleteProject('project-delete');

    expect(Store.getProjects().map((item) => item.id)).toEqual(['project-keep']);
    expect(Store.getTasks().find((item) => item.id === 'task-delete')).not.toHaveProperty(
      'projectId',
    );
    expect(Store.getTasks().find((item) => item.id === 'task-history')).not.toHaveProperty(
      'projectId',
    );
    expect(Store.getPlanningCommands()).toEqual([
      expect.objectContaining({
        type: 'delete_tasks_cascade',
        payload: { taskIds: [], projectIds: ['project-delete'] },
      }),
    ]);
  });

  it('routes commands through record-merge on both client and server', () => {
    const mergeRoute = storageSource
      .split('\n')
      .find((line) => line.includes('const MERGEABLE_KEY_RE'));
    const serverSetStart = rpcSource.indexOf('const PLANNING_RECORD_MERGE_KEYS');
    const serverSet = rpcSource.slice(serverSetStart, rpcSource.indexOf(']);', serverSetStart));

    expect(mergeRoute).toContain('heys_planning_commands_v1');
    expect(serverSet).toContain("'heys_planning_commands_v1'");
    expect(source).toContain("COMMANDS: 'heys_planning_commands_v1'");
    expect(source).toContain("replayPlanningCommands({ reason: 'cloud-refresh-command-replay' })");
  });

  it.each([2, 3, 4, 5, 6])('recovers idempotently when local write %i fails', (failAt) => {
    const harness = installStore();
    seedCascade(harness.Store);
    harness.armFault(failAt);

    expect(() =>
      harness.Store.deleteTasks(['task-delete'], { deleteProjectIds: ['project-delete'] }),
    ).toThrow(`fault_after_write_${failAt - 1}`);
    expect(harness.Store.getPlanningCommands()).toHaveLength(1);

    harness.clearFault();
    harness.Store.replayPlanningCommands({ reason: 'fault-recovery' });
    expectCascadeComplete(harness.Store);

    harness.saveClientKey.mockClear();
    const repeated = harness.Store.replayPlanningCommands({ reason: 'idempotency-check' });
    expect(repeated.changedKeys).toEqual([]);
    expect(harness.saveClientKey).not.toHaveBeenCalled();
    expect(harness.Store.getPlanningCommands()).toHaveLength(1);
  });

  it('retries the durable command when its first cloud enqueue fails', () => {
    const harness = installStore();
    seedCascade(harness.Store);
    harness.saveClientKey.mockClear();
    harness.saveClientKey.mockImplementationOnce(() => {
      throw new Error('offline_queue_unavailable');
    });

    harness.Store.deleteTasks(['task-delete'], { deleteProjectIds: ['project-delete'] });
    expectCascadeComplete(harness.Store);
    expect(harness.Store.getPlanningCommands()).toHaveLength(1);

    harness.saveClientKey.mockClear();
    harness.Store.replayPlanningCommands({ reason: 'queue-recovery' });
    expect(harness.saveClientKey).toHaveBeenCalledTimes(1);
    expect(harness.saveClientKey).toHaveBeenCalledWith(
      'heys_planning_commands_v1',
      harness.Store.getPlanningCommands(),
    );
  });

  it('replays a merged command on another device without resurrecting related rows', () => {
    const first = installStore();
    seedCascade(first.Store);
    first.Store.deleteTasks(['task-delete'], { deleteProjectIds: ['project-delete'] });
    const cloudCommands = first.Store.getPlanningCommands();

    window.localStorage.clear();
    const second = installStore();
    seedCascade(second.Store);
    second.Store.savePlanningCommands(cloudCommands, { sync: false, reason: 'cloud-command' });
    second.Store.replayPlanningCommands({ reason: 'other-device-replay' });

    expectCascadeComplete(second.Store);
    const mergedTasks = second.Store.mergeCloudPlanningArray(
      'heys_planning_tasks',
      second.Store.getTasks(),
      [{ id: 'task-delete', title: 'Stale cloud task', updatedAt: '2026-07-18T11:00:00.000Z' }],
    );
    second.Store.saveTasks(mergedTasks, { sync: false, reason: 'stale-cloud-refresh' });
    expect(second.Store.getTasks()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'task-delete' })]),
    );
  });
});
