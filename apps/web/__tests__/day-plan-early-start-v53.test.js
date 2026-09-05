import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const DAY_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8');
const SUPERSET_SRC = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');

const TODAY = '2026-09-05';
const FUTURE = '2026-09-08';

function loadDayApi() {
  window.React = React;
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(DAY_SRC);
  return window.HEYS.dayTrainings;
}

function loadParts() {
  window.React = React;
  window.HEYS = window.HEYS || {};
  // eslint-disable-next-line no-eval
  (0, eval)(SUPERSET_SRC);
  return window.HEYS.StrengthBuilderParts;
}

function planTraining(overrides = {}) {
  return {
    id: 'tr_source',
    workoutLog: { exercises: [] },
    planSnapshot: {
      exercises: [{ id: 'ex1', name: 'Жим', approaches: [{ reps: 8, weightKg: '60' }] }],
    },
    plan: {
      id: 'pl_53',
      status: 'assigned',
      dayLabel: 'День B',
      assignedBy: 'Артём',
      assignedAt: 1000,
      ...overrides,
    },
    updatedAt: 5000,
  };
}

describe('Owner #53 — early start from future assigned day', () => {
  let api;
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 12, 0, 0));
    api = loadDayApi();
    store = {};
    window.HEYS.utils = {
      lsGet: (key, fallback) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback),
      lsSet: (key, value) => { store[key] = value; },
    };
    store[`heys_dayv2_${FUTURE}`] = {
      date: FUTURE,
      trainings: [planTraining()],
      updatedAt: 1,
    };
    store[`heys_dayv2_${TODAY}`] = {
      date: TODAY,
      trainings: [],
      updatedAt: 1,
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('moves assignment to today and writes started fact on today', async () => {
    const result = await api.earlyStartAssignedPlan({
      fromDate: FUTURE,
      toDate: TODAY,
      sourceIndex: 0,
      expectedPlan: planTraining().plan,
      expectedUpdatedAt: 5000,
    });

    expect(result.ok).toBe(true);
    const today = store[`heys_dayv2_${TODAY}`].trainings[0];
    expect(today.plan.status).toBe('started');
    expect(today.plan.movedFrom).toBe(FUTURE);
    expect(today.workoutLog.exercises).toHaveLength(1);
    expect(today.workoutLog.startedAt).toBeGreaterThan(0);

    const future = store[`heys_dayv2_${FUTURE}`].trainings[0];
    expect(future.plan.status).toBe('moved');
    expect(future.plan.movedTo).toBe(TODAY);
    expect(future.plan.transferId).toBe(result.transferId);
  });

  it('leaves visible transfer trace on source and target dates', async () => {
    await api.earlyStartAssignedPlan({
      fromDate: FUTURE,
      toDate: TODAY,
      sourceIndex: 0,
      expectedPlan: planTraining().plan,
      expectedUpdatedAt: 5000,
    });

    const future = store[`heys_dayv2_${FUTURE}`].trainings[0];
    const today = store[`heys_dayv2_${TODAY}`].trainings[0];
    expect(future.plan.movedTo).toBe(TODAY);
    expect(today.plan.movedFrom).toBe(FUTURE);
    expect(future.plan.transferId).toBe(today.plan.transferId);
  });

  it('re-entry is idempotent by transferId and does not duplicate target rows', async () => {
    const first = await api.earlyStartAssignedPlan({
      fromDate: FUTURE,
      toDate: TODAY,
      sourceIndex: 0,
      expectedPlan: planTraining().plan,
      expectedUpdatedAt: 5000,
    });
    expect(first.ok).toBe(true);

    const second = await api.earlyStartAssignedPlan({
      fromDate: FUTURE,
      toDate: TODAY,
      sourceIndex: 0,
      expectedPlan: planTraining().plan,
      expectedUpdatedAt: 5000,
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('stale_revision');
    expect(store[`heys_dayv2_${TODAY}`].trainings).toHaveLength(1);
  });

  it('refuses start when today slot is cold-cache (unknown day)', async () => {
    delete store[`heys_dayv2_${TODAY}`];
    const slot = api.planSlotForDate(TODAY);
    expect(slot.unknown).toBe(true);

    const result = await api.earlyStartAssignedPlan({
      fromDate: FUTURE,
      toDate: TODAY,
      sourceIndex: 0,
      expectedPlan: planTraining().plan,
      expectedUpdatedAt: 5000,
    });
    expect(result).toEqual({ ok: false, reason: 'cold_cache' });
    expect(store[`heys_dayv2_${TODAY}`]).toBeUndefined();
    expect(store[`heys_dayv2_${FUTURE}`].trainings[0].plan.status).toBe('assigned');
  });
});

describe('PlanCard UI — future day early start button', () => {
  afterEach(() => cleanup());

  it('shows «Начать сейчас» when canStartNow and calls onStart with plan revision', async () => {
    const Parts = loadParts();
    const onStart = vi.fn(() => Promise.resolve({ ok: true }));
    render(React.createElement(Parts.PlanCard, {
      training: planTraining(),
      dateKey: FUTURE,
      isFutureDay: true,
      canStartNow: true,
      moveOptions: [{ date: '2026-09-09', busy: false }],
      onStart,
      onSkip: () => {},
      onMove: () => {},
    }));

    const startBtn = screen.getByText('Начать сейчас');
    expect(startBtn).toBeTruthy();
    expect(startBtn.disabled).toBe(false);
    fireEvent.click(startBtn);
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(onStart.mock.calls[0][1]).toMatchObject({ id: 'pl_53', status: 'assigned' });
  });

  it('disables «Начать сейчас» when canStartNow is false (cold-cache guard)', () => {
    const Parts = loadParts();
    render(React.createElement(Parts.PlanCard, {
      training: planTraining(),
      dateKey: FUTURE,
      isFutureDay: true,
      canStartNow: false,
      moveOptions: [{ date: '2026-09-09', busy: false }],
      onStart: () => {},
      onSkip: () => {},
      onMove: () => {},
    }));
    expect(screen.getByText('Начать сейчас').disabled).toBe(true);
  });
});
