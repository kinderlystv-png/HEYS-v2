import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_day_trainings_v1.js'), 'utf8');

function loadModule() {
  window.React = React;
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(source);
  return window.HEYS.dayTrainings;
}

describe('web plan outcome safety helpers', () => {
  let api;
  let store;

  beforeEach(() => {
    api = loadModule();
    store = {};
    window.HEYS.utils = {
      lsGet: (key, fallback) => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback,
      lsSet: (key, value) => { store[key] = value; },
    };
  });

  it('reuses a stable transfer after orphan retry instead of appending a duplicate', () => {
    const plan = { id: 'plan/7', assignedAt: 1234, status: 'assigned' };
    const transferId = api.stableMoveTransferId('2026-08-12', '2026-08-13', plan);
    const target = {
      id: 'tr_' + transferId,
      plan: { ...plan, transferId, movedFrom: '2026-08-12', movedSourceId: 'source-1' },
    };

    expect(api.appendTrainingToDay('2026-08-13', target, transferId))
      .toEqual({ ok: true, inserted: true, trainingId: target.id });
    expect(api.appendTrainingToDay('2026-08-13', { ...target, id: 'retry-id' }, transferId))
      .toEqual({ ok: true, inserted: false, trainingId: target.id });
    expect(store['heys_dayv2_2026-08-13'].trainings).toHaveLength(1);
    expect(api.stableMoveTransferId('2026-08-12', '2026-08-13', plan)).toBe(transferId);
    expect(api.stableMoveTransferId('2026-08-12', '2026-08-14', plan)).not.toBe(transferId);
    expect(api.stableMoveTransferId('2026-08-12', '2026-08-13', {})).toBeNull();
  });

  it('rolls back a pre-existing orphan by exact id and plan.transferId only', () => {
    store['heys_dayv2_2026-08-13'] = {
      date: '2026-08-13',
      deletedTrainings: [{ tombstoneId: 'old', signature: 'id:old', deletedAt: 1, index: 0 }],
      trainings: [
        { id: 'keep', plan: { status: 'assigned', transferId: 'other' } },
        { id: 'tr_move', plan: { status: 'assigned', transferId: 'move-1' } },
        { id: 'tail', type: 'cardio', z: [20, 0, 0, 0] },
      ],
    };

    expect(api.removeTrainingFromDayById('2026-08-13', 'tr_move', 'move-1'))
      .toEqual({ ok: true, removed: true });
    const saved = store['heys_dayv2_2026-08-13'];
    expect(saved.trainings).toHaveLength(3);
    expect(saved.trainings.map((training) => training.id || null)).toEqual(['keep', 'tail', null]);
    expect(saved.trainings[0].updatedAt).toBe(saved.updatedAt);
    expect(saved.trainings[1]).toMatchObject({ id: 'tail', type: 'cardio', z: [20, 0, 0, 0], updatedAt: saved.updatedAt });
    expect(saved.trainings[2]).toEqual({ z: [0, 0, 0, 0], time: '', type: '' });
    expect(saved.deletedTrainings[0].signature).toBe('id:tr_move');
    expect(saved.deletedTrainings[1].tombstoneId).toBe('old');
  });

  it('fails closed when another revision already orphaned the same source into the target day', () => {
    store['heys_dayv2_2026-08-13'] = {
      date: '2026-08-13',
      trainings: [{
        id: 'old-target',
        plan: { transferId: 'old-transfer', movedFrom: '2026-08-12', movedSourceId: 'source-1' },
      }],
    };
    const revised = {
      id: 'new-target',
      plan: { transferId: 'new-transfer', movedFrom: '2026-08-12', movedSourceId: 'source-1' },
    };

    expect(api.appendTrainingToDay('2026-08-13', revised, 'new-transfer'))
      .toEqual({ ok: false, inserted: false, reason: 'stale_transfer' });
    expect(store['heys_dayv2_2026-08-13'].trainings).toHaveLength(1);
  });

  it('does not roll back a target that another tab already started', () => {
    store['heys_dayv2_2026-08-13'] = {
      date: '2026-08-13',
      trainings: [{
        id: 'target-1',
        workoutLog: { firstMarkAt: 10, zoneMinutes: [0, 0, 0, 0], exercises: [] },
        plan: { status: 'started', transferId: 'move-1' },
      }],
    };

    expect(api.removeTrainingFromDayById('2026-08-13', 'target-1', 'move-1'))
      .toEqual({ ok: false, removed: false, reason: 'target_changed' });
    expect(store['heys_dayv2_2026-08-13'].trainings).toHaveLength(1);
  });

  it('blocks destructive outcome for live facts but accepts a legacy zero draft', () => {
    const legacyDraft = {
      z: [0, 0, 0, 0],
      workoutLog: { zoneMinutes: [0, 0, 0, 0], exercises: [{ approaches: [{ done: false }] }] },
    };
    expect(api.hasMeaningfulLiveWorkout(legacyDraft)).toBe(false);
    expect(api.hasMeaningfulLiveWorkout({ z: [0, 1, 0, 0] })).toBe(true);
    expect(api.hasMeaningfulLiveWorkout({
      ...legacyDraft,
      workoutLog: { ...legacyDraft.workoutLog, firstMarkAt: 10 },
    })).toBe(true);
    expect(api.hasMeaningfulLiveWorkout({ ...legacyDraft, z: [0, 1, 0, 0] })).toBe(true);
    expect(api.hasMeaningfulLiveWorkout({
      ...legacyDraft,
      workoutLog: { zoneMinutes: [0, 0, 0, 0], exercises: [{ approaches: [{ done: true }] }] },
    })).toBe(true);
    expect(api.hasMeaningfulLiveWorkout({
      ...legacyDraft,
      workoutLog: {
        zoneMinutes: [0, 0, 0, 0],
        exercises: [{ approaches: [{ done: false, drops: [{ done: true }, { done: false }] }] }],
      },
    })).toBe(true);
  });
});
