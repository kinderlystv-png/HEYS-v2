// Lane 3 Task 40 PIECE 2 — functional smoke via superset_ui + proposal_ui helpers.
// Closes GAPs from scripts/.sb-strength-functional-smoke-inventory.json without
// duplicating strength-builder-ui.test.js (builder_ui) coverage.

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');

function loadModules() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_proposal_ui_v1.js');
  return {
    ks: window.HEYS.TrainingKernel.strength,
    Parts: window.HEYS.StrengthBuilderParts,
  };
}

const work = (w, r, done, extra) => Object.assign({
  weightKg: String(w), reps: r, done: !!done,
}, extra || {});

function training(exercises, extra) {
  return Object.assign({
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { exercises },
  }, extra || {});
}

let ks;
let Parts;

beforeEach(() => {
  ({ ks, Parts } = loadModules());
});

afterEach(() => {
  cleanup();
  delete window.HEYS;
  vi.useRealTimers();
});

describe('superset_ui · tonnage helpers (GAP 3d, 6c)', () => {
  it('exerciseVolumeKg совпадает с kernel trainingTonnage для смешанной сессии', () => {
    const exercises = [
      {
        name: 'Жим',
        approaches: [
          { type: 'warmup', weightKg: '40', reps: 10, done: true },
          work(75, 8, true),
          work(75, 8, true, { drops: [{ weightKg: '60', reps: 6, done: true }] }),
        ],
      },
      {
        name: 'Планка', unit: 'time',
        approaches: [{ durationSec: 60, done: true }],
      },
      {
        name: 'Подтягивания', unit: 'bodyweight', bodyweightFactor: 1.0,
        approaches: [{ weightKg: '', reps: 10, done: true, extraWeightKg: 10 }],
      },
    ];
    const t = training(exercises);
    const kernelVol = ks.trainingTonnage(t, { bodyWeightKg: 70 }).totalVolume;
    const uiVol = exercises.reduce((sum, ex) => sum + Parts.exerciseVolumeKg(ex, 70), 0);
    expect(uiVol).toBe(kernelVol);
    expect(uiVol).toBe(75 * 8 + 75 * 8 + 60 * 6 + (70 + 10) * 10);
  });

  it('approachVolumeKg считает дроп-ступени, разминку не включает', () => {
    const ex = {
      name: 'Жим',
      approaches: [
        { type: 'warmup', weightKg: '40', reps: 10, done: true },
        work(80, 5, true, { drops: [{ weightKg: '64', reps: 5, done: true }] }),
      ],
    };
    expect(Parts.approachVolumeKg(ex, 0, 70)).toBe(0);
    expect(Parts.approachVolumeKg(ex, 1, 70)).toBe(80 * 5 + 64 * 5);
  });

  it('time/distance не попадают в exerciseVolumeKg', () => {
    const ex = {
      name: 'Бег', unit: 'distance',
      approaches: [{ weightKg: '10', distanceM: 100, done: true }],
    };
    expect(Parts.exerciseVolumeKg(ex, 70)).toBe(0);
    expect(ks.trainingTonnage(training([ex])).totalVolume).toBe(0);
  });
});

describe('superset_ui · ApproachRow empty-field edges (GAP 3d)', () => {
  it('unit=time блокирует галочку без секунд', () => {
    const patches = [];
    render(React.createElement(Parts.ApproachRow, {
      approach: { weightKg: '', durationSec: 0, done: false },
      index: 0,
      workNumber: 1,
      unit: 'time',
      isCurrent: true,
      onPatch: (i, p) => patches.push([i, p]),
      onToggleType: () => {},
    }));
    const check = screen.getByLabelText('Отметить выполненным');
    expect(check.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Время, сек'), { target: { value: '30' } });
    expect(patches[0][1].durationSec).toBe(30);
  });

  it('unit=bodyweight допускает пустой вес при заполненных повторах', () => {
    render(React.createElement(Parts.ApproachRow, {
      approach: { weightKg: '', reps: 8, done: false },
      index: 0,
      workNumber: 1,
      unit: 'bodyweight',
      isCurrent: true,
      onPatch: () => {},
      onToggleType: () => {},
    }));
    expect(screen.getByLabelText('Отметить выполненным').disabled).toBe(false);
    expect(screen.getByPlaceholderText('свой')).toBeTruthy();
  });
});

describe('superset_ui · RestRing events and remount (GAP 5b, 5c)', () => {
  it('вызывает onAdd/onSkip/onCollapse как события таймера', () => {
    const onAdd = vi.fn();
    const onSkip = vi.fn();
    const onCollapse = vi.fn();
    render(React.createElement(Parts.RestRing, {
      secondsLeft: 90,
      total: 120,
      owner: 'Жим',
      collapsed: false,
      onAdd,
      onSkip,
      onCollapse,
      onExpand: () => {},
    }));
    fireEvent.click(screen.getByText('+10 секунд'));
    fireEvent.click(screen.getByText('пропустить'));
    fireEvent.click(screen.getByText('свернуть'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it('после remount RestRing показывает тот же остаток из props родителя', () => {
    const props = {
      secondsLeft: 73,
      total: 90,
      owner: 'Тяга',
      collapsed: false,
      onAdd: () => {},
      onSkip: () => {},
      onCollapse: () => {},
      onExpand: () => {},
    };
    const { unmount } = render(React.createElement(Parts.RestRing, props));
    expect(document.querySelector('.sb-rest-value')?.textContent).toContain('1:13');
    unmount();
    props.secondsLeft = 68;
    render(React.createElement(Parts.RestRing, props));
    expect(document.querySelector('.sb-rest-value')?.textContent).toContain('1:08');
  });

  it('SummaryCard после remount продолжает тикать elapsed от startedAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    const startedAt = Date.now() - 125000;
    const cardTraining = training([
      { name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] },
    ], {
      workoutLog: {
        startedAt,
        lastMarkAt: startedAt + 60000,
        exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
      },
    });
    const { unmount } = render(React.createElement(Parts.SummaryCard, {
      training: cardTraining,
      dateKey: '2026-09-05',
      onOpen: () => {},
    }));
    expect(screen.getByText(/2:05/)).toBeTruthy();
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    render(React.createElement(Parts.SummaryCard, {
      training: cardTraining,
      dateKey: '2026-09-05',
      onOpen: () => {},
    }));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText(/2:1[01]/)).toBeTruthy();
  });
});

describe('superset_ui · finish day log snapshot (GAP 6b)', () => {
  it('buildPlanVsDoneSnapshot: лишнее live-упражнение не ломает строки плана', () => {
    const t = training(
      [
        { name: 'Жим', approaches: [work(75, 8, true), work(75, 8, true)] },
        { name: 'Случайное', approaches: [work(20, 12, true)] },
      ],
      {
        plan: { dayLabel: 'День A' },
        planSnapshot: {
          exercises: [
            { name: 'Жим', approaches: [work(70, 8, false), work(70, 8, false)] },
            { name: 'Тяга', approaches: [work(60, 10, false)] },
          ],
        },
      },
    );
    const snap = Parts.buildPlanVsDoneSnapshot(t);
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows.map((r) => r.name)).toEqual(['Жим', 'Тяга']);
    expect(snap.rows[0].status).toBe('progress');
    expect(snap.rows[1].status).toBe('skipped');
    expect(snap.doneVolume).toBe(ks.trainingTonnage(t).totalVolume);
    expect(snap.plannedVolume).toBe(
      ks.trainingTonnage({
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { exercises: t.planSnapshot.exercises },
      }).plannedVolume,
    );
  });

  it('doneVolume в снимке совпадает с kernel и exerciseVolumeKg (weight_reps)', () => {
    const exercises = [
      { name: 'Жим', approaches: [work(60, 10, true)] },
      { name: 'Тяга', approaches: [work(50, 8, true)] },
    ];
    const t = training(exercises, {
      planSnapshot: { exercises: [{ name: 'Жим', approaches: [work(60, 10, false)] }] },
    });
    const snap = Parts.buildPlanVsDoneSnapshot(t);
    const sumUi = exercises.reduce((s, ex) => s + Parts.exerciseVolumeKg(ex, 0), 0);
    expect(snap.doneVolume).toBe(ks.trainingTonnage(t).totalVolume);
    expect(sumUi).toBe(snap.doneVolume);
  });
});

describe('proposal_ui · superset boundary on started block (GAP 7 supplement)', () => {
  it('describeSupersetBoundaries замораживает начатую связку при смене раундов', () => {
    const live = [
      { name: 'Подтягивания', ssGroup: 1, approaches: [work(0, 10, true), work(0, 10, false)] },
      { name: 'Тяга', ssGroup: 1, approaches: [work(50, 12, false), work(50, 12, false)] },
    ];
    const proposed = [
      { name: 'Подтягивания', ssGroup: 1, approaches: [work(0, 10, false), work(0, 10, false), work(0, 10, false)] },
      { name: 'Тяга', ssGroup: 1, approaches: [work(50, 12, false), work(50, 12, false), work(50, 12, false)] },
    ];
    const boundaries = Parts.describeSupersetBoundaries(live, proposed);
    expect(boundaries.frozen).toHaveLength(1);
    expect(boundaries.frozen[0].badge).toBe('закрыта');
    expect(boundaries.replacements).toHaveLength(0);
  });
});
