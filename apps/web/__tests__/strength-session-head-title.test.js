import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS.StrengthBuilder;
}

const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });

let SB;

beforeEach(() => {
  SB = loadModules();
});

afterEach(() => {
  cleanup();
});

describe('шапка таблицы ввода weight_reps', () => {
  it('показывает упражнение и подход «N из M», а не название сессии', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: {
          title: 'Силовая · грудь',
          exercises: [{
            name: 'Жим лёжа',
            unit: 'weight_reps',
            approaches: [work(75, 8, true), work(75, 8, true), work(75, 8, false)],
          }],
        },
      },
      dateKey: '2026-08-09',
      onPatch: () => {},
      onPatchSession: () => {},
    }));

    const screenTitle = document.querySelector('.sb-head-title > b');
    expect(screenTitle?.textContent).toBe('Силовая · грудь');

    const tableHead = document.querySelector('.sb-input-table-head > b');
    expect(tableHead?.textContent).toBe('Жим лёжа · 3 из 3');
    expect(tableHead?.textContent).not.toContain('Силовая');
  });
});
