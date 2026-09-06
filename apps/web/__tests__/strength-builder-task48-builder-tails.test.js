// Task 48 — builder_ui tails: sheet ⋯ → canonical plan-vs-done (BuilderPlanVsDoneScreen).
import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const BUILDER_SRC = fs.readFileSync(
  path.join(WEB_DIR, 'strength/heys_strength_builder_ui_v1.js'),
  'utf8'
);

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
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS.StrengthBuilder;
}

const work = (weightKg, reps, done) => ({
  weightKg: String(weightKg), reps, done: !!done
});

function planSessionTraining() {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    plan: { status: 'started', dayLabel: 'День B', assignedBy: 'Артём' },
    planSnapshot: {
      exercises: [
        { name: 'Жим лёжа', approaches: [work(70, 8, false), work(70, 8, false)] },
        { name: 'Разведение', approaches: [work(10, 15, false)] }
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

describe('task48 · builder_ui sheet tails', () => {
  let SB;

  beforeEach(() => {
    SB = loadModules();
  });

  afterEach(() => cleanup());

  it('шторка ⋯ не содержит «Назначено против сделано» (снято из кадра 5 сентября)', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: planSessionTraining(),
      dateKey: '2026-08-03',
      profile: {},
      onPatch: () => {},
      onClose: () => {}
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));
    expect(screen.queryByText('Назначено против сделано')).toBeNull();
    expect(screen.getByText('Порядок упражнений')).toBeTruthy();
    expect(screen.getByText('Круговой режим')).toBeTruthy();
  });

  it('view plan-vs-done не делегирует в Parts.PlanVsDoneScreen', () => {
    expect(BUILDER_SRC).not.toMatch(/Parts\.PlanVsDoneScreen/);
    expect(BUILDER_SRC).toMatch(/if \(view === 'plan-vs-done' && Parts\.buildPlanVsDoneSnapshot\)/);
    expect(BUILDER_SRC).toMatch(/return h\(BuilderPlanVsDoneScreen,/);
    expect(BUILDER_SRC).toMatch(/function BuilderPlanVsDoneScreen\(/);
  });
});
