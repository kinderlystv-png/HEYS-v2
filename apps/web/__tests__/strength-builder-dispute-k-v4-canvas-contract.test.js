// K1–K12 · спорные состояния · canvas contract + smoke behavior

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tint: '#f6e6dd', tx: '#201e1d',
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', ac2: '#b4442a',
  gr: '#5c6a45', grBg: '#eaefe0', valBad: '#a83c22',
  ink06: 'rgba(0, 0, 0, 0.06)', ink12: 'rgba(0, 0, 0, 0.12)',
  ink24: 'rgba(0, 0, 0, 0.24)', ink55: 'rgba(0, 0, 0, 0.55)',
  ink56: 'rgba(0, 0, 0, 0.56)', ink58: 'rgba(0, 0, 0, 0.58)', ink62: 'rgba(0, 0, 0, 0.62)',
});

const BLUE = Object.freeze({
  bg: '#f4f8ff', c1: '#e8eef8', c2: '#dce6f4', tint: '#e3ecf8', tx: '#1a2332',
  ac: '#2a5490', acs: '#3d6eb5', onAcs: '#f4f8ff', ac2: '#a1471c',
  gr: '#4a6640', grBg: '#e5ece0', valBad: '#a83c22',
});

function computedCss(palette) {
  return CSS
    .replaceAll('var(--sb-card)', palette.c1)
    .replaceAll('var(--sb-bg)', palette.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-mut)', palette.ink56)
    .replaceAll('var(--sb-br)', 'rgba(0, 0, 0, .1)')
    .replaceAll('var(--sb-soft)', palette.c2)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-accbg)', palette.tint)
    .replaceAll('var(--sb-accTx)', palette.ac)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--sb-okbg)', palette.grBg)
    .replaceAll('var(--sb-okTx)', palette.gr)
    .replaceAll('var(--v4-btn-on-act, #fff5ef)', palette.onAcs)
    .replaceAll('var(--val-bad, var(--v4-bad-text, #a83c22))', palette.valBad)
    .replaceAll('var(--val-bad)', palette.valBad)
    .replaceAll('var(--tint)', palette.tint)
    .replaceAll('var(--bg)', palette.bg)
    .replaceAll('var(--c1)', palette.c1)
    .replaceAll('var(--c2)', palette.c2)
    .replaceAll('var(--tx)', palette.tx)
    .replaceAll('var(--ac)', palette.ac)
    .replaceAll('var(--acs)', palette.acs)
    .replaceAll('var(--on-acs)', palette.onAcs)
    .replaceAll('var(--ac2)', palette.ac2)
    .replaceAll('var(--gr)', palette.gr)
    .replaceAll('var(--gr-bg)', palette.grBg)
    .replaceAll('var(--ink)', '0, 0, 0')
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');
}

function loadBuilder() {
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

const work = (weightKg, reps, done, extra) => ({
  weightKg: String(weightKg), reps, done: !!done, ...(extra || {}),
});

function mountBuilder(props, palette = CANVAS) {
  const style = document.createElement('style');
  style.textContent = `${BASE_CSS}\n${computedCss(palette)}`;
  document.head.appendChild(style);
  const SB = loadBuilder();
  render(React.createElement(SB.BuilderScreen, props));
  return () => { cleanup(); style.remove(); };
}

const HEX_RGB = {
  [CANVAS.ac]: 'rgb(138, 74, 32)',
  [BLUE.ac]: 'rgb(42, 84, 144)',
};

function expectColor(node, property, expected) {
  const actual = getComputedStyle(node)[property];
  if (property === 'fontSize') {
    expect(parseFloat(actual)).toBeCloseTo(parseFloat(expected), 0);
    return;
  }
  if (property === 'color' && HEX_RGB[expected]) {
    expect(actual.replace(/\s/g, '')).toBe(HEX_RGB[expected].replace(/\s/g, ''));
    return;
  }
  expect(actual === expected || actual.replace(/\s/g, '') === expected.replace(/\s/g, '')).toBe(true);
}

describe('K · спорные состояния · canvas contract', { timeout: 45_000 }, () => {
  afterEach(() => cleanup());

  it('K1 · rest collapsed on closed exercise tap — geometry sand+blue', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T18:40:00Z'));
    const startedAt = Date.now() - 12000;
    const teardown = mountBuilder({
      training: {
        type: 'strength', strengthEntryMode: 'workout_builder',
        workoutLog: {
          exercises: [
            { name: 'Жим', restSec: 90, approaches: [work(75, 8, true), work(75, 8, true)] },
            { name: 'Тяга', restSec: 90, approaches: [work(60, 10, false)] },
          ],
          activeRest: {
            startedAt, total: 90, owner: 'Жим', exName: 'Жим', collapsed: false,
            nextLabel: 'Следующий подход',
          },
        },
      },
      dateKey: '2026-08-09', profile: {}, onPatch: vi.fn(), onPatchSession: vi.fn(), onClose: vi.fn(),
    });

    try {
      const head = document.querySelector('.sb-builder-screen > .sb-head');
      expect(getComputedStyle(head).display).toBe('flex');
      expect(getComputedStyle(document.querySelector('.sb-head-title')).flexDirection).toBe('column');

      fireEvent.click(screen.getByRole('button', { name: /Тяга/ }));

      expect(document.querySelector('.sb-rest--collapsed')).toBeTruthy();
      const editing = document.querySelector('.sb-ex--collapsed.is-rest-editing .sb-ex-state.is-editing');
      expect(editing?.textContent).toBe('правится');
      const title = document.querySelector('.sb-ex--collapsed.is-rest-editing .sb-ex-title b');
      expect(title?.textContent).toContain('Жим · закрыт');
      expectColor(title, 'fontSize', '12.5px');
      expect(editing?.className).toContain('is-editing');

      act(() => { vi.advanceTimersByTime(5000); });
      expect(document.querySelector('.sb-rest--collapsed')?.textContent).toMatch(/1:1[0-3]/);
      expect(CSS).toMatch(/\.sb-ex--collapsed\.is-complete \.sb-ex-state\.is-editing[\s\S]*var\(--ac/);
    } finally {
      teardown();
      vi.useRealTimers();
    }
  });

  it('K2 · approach added to closed exercise — reopen label + finish', () => {
    const sessionPatches = [];
    const exercisePatches = [];
    const closed = {
      type: 'strength', strengthEntryMode: 'workout_builder',
      workoutLog: {
        exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }],
        completedAt: 123456,
      },
    };
    const props = {
      training: closed,
      dateKey: '2026-08-09', profile: {},
      onPatch: (next) => exercisePatches.push(next),
      onPatchSession: (p) => sessionPatches.push(p),
      onClose: vi.fn(),
    };
    const teardown = mountBuilder(props);
    fireEvent.click(screen.getByRole('button', { name: '+ подход' }));
    expect(sessionPatches).toContainEqual({ completedAt: null });
    expect(exercisePatches.at(-1)[0].approaches).toHaveLength(2);
    expect(exercisePatches.at(-1)[0].reopened).toBe(true);
    cleanup();
    teardown();

    const teardown2 = mountBuilder({
      ...props,
      training: {
        ...closed,
        workoutLog: {
          ...closed.workoutLog,
          completedAt: undefined,
          exercises: exercisePatches.at(-1),
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Жим/ }));
    expect(screen.getByText('было 1 из 1 · стало 1 из 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Завершить.*1 не закрыто/i })).toBeTruthy();
    expect(CSS).toMatch(/\.sb-builder-screen \.sb-finish[\s\S]*margin-top:\s*9px/);
    teardown2();
  });

  it('K3 · warmup toggle opens renumber screen with delta colors', () => {
    const Parts = (() => {
      loadBuilder();
      return globalThis.HEYS.StrengthBuilderParts;
    })();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${computedCss(CANVAS)}`;
    document.head.appendChild(style);
    render(React.createElement(Parts.RenumberScreen, {
      ex: {
        name: 'Жим', approaches: [
          { weightKg: '40', reps: 10, done: true, type: 'warmup' },
          work(75, 8, true), work(75, 8, true),
        ],
      },
      beforeEx: {
        name: 'Жим', approaches: [
          work(75, 8, true), work(75, 8, true), work(75, 8, true),
        ],
      },
      bodyWeightKg: 80,
      onBack: vi.fn(),
      onOpenSheet: vi.fn(),
    }));
    expect(document.querySelector('.sb-renumber-delta')).toBeTruthy();
    expectColor(document.querySelector('.sb-renumber-tonnage b'), 'color', CANVAS.tx);
    expect(document.querySelector('.sb-renumber-num.is-warmup')?.textContent).toMatch(/Р|разм/i);
    cleanup();
    style.remove();
  });

  it('K5 · superset has no drop button', () => {
    const superset = {
      type: 'strength', strengthEntryMode: 'workout_builder',
      workoutLog: {
        exercises: [
          { name: 'Подтягивания', ssGroup: 1, restSec: 60, approaches: [work(0, 10, true), work(0, 10, false)] },
          { name: 'Тяга блока', ssGroup: 1, restSec: 120, approaches: [work(50, 12, true), work(50, 12, false)] },
        ],
      },
    };
    const teardown = mountBuilder({
      training: superset, dateKey: '2026-08-09', profile: {}, onPatch: vi.fn(), onClose: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: '+ Сброс' })).toBeNull();
    expect(document.querySelector('.sb-round')).toBeTruthy();
    teardown();
  });

  it('K8 · equal rounds in new superset — no per-member add, +Раунд only', () => {
    const teardown = mountBuilder({
      training: {
        type: 'strength', strengthEntryMode: 'workout_builder',
        workoutLog: {
          exercises: [
            { name: 'Подтягивания', ssGroup: 1, approaches: [work(0, 10, true), work(0, 10, false)] },
            { name: 'Тяга блока', ssGroup: 1, approaches: [work(50, 12, true), work(50, 12, false)] },
          ],
        },
      },
      dateKey: '2026-08-09', profile: {}, onPatch: vi.fn(), onClose: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: /\+ подход/i })).toBeNull();
    expect(screen.getByRole('button', { name: '+ Раунд' })).toBeTruthy();
    expect(screen.getByText('Р1')).toBeTruthy();
    expect(screen.getByText('Р2')).toBeTruthy();
    teardown();
  });

  it('K10 · legacy uneven superset — flat lists, no round grid', () => {
    const teardown = mountBuilder({
      training: {
        type: 'strength', strengthEntryMode: 'workout_builder',
        workoutLog: {
          exercises: [
            { name: 'Жим лёжа', ssGroup: 1, approaches: [work(75, 8, true), work(75, 8, true), work(70, 9, true), work(70, 8, true)] },
            { name: 'Тяга блока', ssGroup: 1, approaches: [work(55, 10, true), work(55, 10, true), work(50, 12, true)] },
          ],
        },
      },
      dateKey: '2026-07-12', profile: {}, onPatch: vi.fn(), onClose: vi.fn(),
    });
    expect(screen.queryByText('Р1')).toBeNull();
    expect(screen.getByText('история')).toBeTruthy();
    expect(screen.getByText('4 и 3 подхода')).toBeTruthy();
    expect(screen.getByText(/Историю не переписываем/)).toBeTruthy();
    const chip = document.querySelector('.sb-ss-flat-chip');
    expect(getComputedStyle(chip).height).toBe('32px');
    expect(getComputedStyle(chip).borderRadius).toBe('10px');
    teardown();
  });

  it('K6 · empty reps blocks check — CSS gates', () => {
    expect(CSS).toMatch(/\.sb-ap-field\.is-reps-missing[\s\S]*1\.5px var\(--val-bad/);
    expect(CSS).toMatch(/\.sb-ap-check\.is-blocked:not\(\.is-done\)/);
  });

  it('K9 · default rest when RPE not marked', () => {
    const teardown = mountBuilder({
      training: {
        type: 'strength', strengthEntryMode: 'workout_builder',
        workoutLog: {
          exercises: [{ name: 'Жим', restSec: 90, approaches: [work(75, 8, false)] }],
        },
      },
      dateKey: '2026-08-09', profile: {}, onPatch: vi.fn(), onClose: vi.fn(),
    });
    fireEvent.click(screen.getByLabelText('Отметить выполненным'));
    const restCopy = document.querySelector('.sb-rest-line .sb-rest-copy');
    expect(restCopy?.textContent).toMatch(/по умолчанию · 1:30|1:30/);
    teardown();
  });

  it('K11 · dash cell not closable', () => {
    const superset = {
      type: 'strength', strengthEntryMode: 'workout_builder',
      workoutLog: {
        exercises: [
          { name: 'A', ssGroup: 1, approaches: [work(20, 10, true), { blank: true, done: false }] },
          { name: 'B', ssGroup: 1, approaches: [work(30, 10, true), work(30, 10, false)] },
        ],
      },
    };
    const teardown = mountBuilder({
      training: superset, dateKey: '2026-08-09', profile: {}, onPatch: vi.fn(), onClose: vi.fn(),
    });
    const dash = screen.getByText('—');
    const btn = dash.closest('button') || dash;
    expect(btn.disabled || btn.getAttribute('aria-disabled') === 'true').toBeTruthy();
    expect(getComputedStyle(dash.closest('.sb-cell.is-blank') || dash).borderTopStyle).toBe('dashed');
    teardown();
  });

  it('K12 · bodyweight without factor → unmeasured stat', () => {
    const teardown = mountBuilder({
      training: {
        type: 'strength', strengthEntryMode: 'workout_builder',
        workoutLog: {
          exercises: [{
            name: 'Подтягивания', unit: 'bodyweight', bodyweightFactor: null,
            approaches: [work(0, 10, true)],
          }],
        },
      },
      dateKey: '2026-08-09', profile: { weight: 70 }, onPatch: vi.fn(), onClose: vi.fn(),
    });
    expect(screen.getByText(/1 без тоннажа|без тоннажа/)).toBeTruthy();
    teardown();
  });
});
