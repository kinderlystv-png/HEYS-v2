// Task 38 — canvas-conflict-feature rows owned by builder_ui (behavior only).
import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');

function loadModules() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_proposal_ui_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS;
}

const work = (weightKg, reps, done) => ({
  weightKg: String(weightKg), reps, done: !!done
});

function planTraining() {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    plan: { status: 'started', dayLabel: 'День B', assignedBy: 'Артём', assignedAt: Date.now() - 86400000 },
    planSnapshot: {
      exercises: [
        { name: 'Жим лёжа', approaches: [work(70, 8, false), work(70, 8, false)] }
      ]
    },
    workoutLog: {
      startedAt: Date.now() - 20 * 60 * 1000,
      exercises: [{
        name: 'Жим лёжа',
        approaches: [work(75, 8, true), work(75, 8, true)]
      }]
    }
  };
}

function canvasPlanVsDoneTraining() {
  return {
    plan: { dayLabel: 'пн, 8 авг', weekRange: 'недели 1–2' },
    planSnapshot: {
      exercises: [
        { name: 'Жим лёжа', approaches: [work(70, 8, false), work(70, 8, false)] },
        { name: 'Разведение гантелей', approaches: [work(10, 15, false), work(10, 15, false)] }
      ]
    },
    workoutLog: {
      exercises: [
        { name: 'Жим лёжа', approaches: [work(75, 8, true), work(75, 8, true)] }
      ]
    }
  };
}

describe('task38 · builder_ui canvas-conflict-feature', () => {
  let HEYS;

  beforeEach(() => {
    HEYS = loadModules();
  });

  afterEach(() => cleanup());

  it('И1 mid-session: pills «Начать по плану» и «Своя» в полоске куратора', () => {
    render(React.createElement(HEYS.StrengthBuilder.BuilderScreen, {
      training: planTraining(),
      dateKey: '2026-08-03',
      profile: {},
      onPatch: () => {},
      onClose: () => {}
    }));
    expect(screen.getByText('Начать по плану')).toBeTruthy();
    expect(screen.getByText('Своя')).toBeTruthy();
    expect(document.querySelector('.sb-cur-plan-actions')).toBeTruthy();
  });

  it('Г2 «отчёт по циклу»: полноэкранный CycleReportScreen, не in-session plan-vs-done', () => {
    const Parts = HEYS.StrengthBuilderParts;
    const program = { weekRange: 'недели 1–2' };
    const days = [{ date: '2026-08-08', status: 'done' }];
    const snapshot = Parts.buildCycleReportSnapshot(program, days, function () {
      return { trainings: [canvasPlanVsDoneTraining()] };
    });
    render(React.createElement(Parts.CycleReportScreen, {
      snapshot,
      onClose: () => {},
    }));
    expect(screen.getByText('Отчёт по циклу')).toBeTruthy();
    expect(screen.getByText(/План выполнен на \d+ %/)).toBeTruthy();
    expect(document.querySelector('.sb-cycle-report.sb-plan-vs-done')).toBeTruthy();
    expect(screen.queryByText('Назначено против сделано')).toBeNull();
  });
});
