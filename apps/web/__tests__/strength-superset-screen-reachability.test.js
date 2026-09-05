// Lane 3 · superset_ui screens — runtime reachability, not markup-only.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadModules(extra) {
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
  if (extra) extra.forEach(ev);
  return globalThis.HEYS.StrengthBuilderParts;
}

const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });
const blankWork = () => ({ weightKg: '', reps: 0, done: false, blank: true });

function trisetExercises() {
  return [
    {
      name: 'Жим гантелей', ssGroup: 2, restSec: 90,
      approaches: [
        { type: 'warmup', weightKg: '15', reps: 12, done: true },
        { type: 'warmup', weightKg: '18', reps: 10, done: true },
        work(22, 10, true), work(22, 10, true), work(20, 10, false)
      ]
    },
    {
      name: 'Разведение', ssGroup: 2, restSec: 90,
      approaches: [work(10, 15, true), work(10, 12, false), work(10, 12, false)]
    },
    {
      name: 'Тяга к подбор.', ssGroup: 2, restSec: 120,
      approaches: [work(25, 12, true), work(25, 10, false), work(25, 10, false)]
    }
  ];
}

function trisetGroup(exercises) {
  const SK = globalThis.HEYS.TrainingKernel.strength;
  return SK.supersetGroups(exercises).find(function (g) { return g.groupId === 2; });
}

function training(exercises) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { exercises },
  };
}

function mountFullscreen() {
  globalThis.HEYS.TrainingKernel.fullscreen = {
    mount: function ({ render: renderScreen }) {
      render(renderScreen({ close: vi.fn() }));
      return true;
    },
    unmount: vi.fn()
  };
}

let Parts;

beforeEach(() => {
  Parts = loadModules();
});

afterEach(() => {
  cleanup();
  delete globalThis.HEYS;
});

describe('superset_ui · screen reachability', () => {
  it('SupersetBlock (3 участника) → «Трисет в работе» → TriSetWorkScreen → назад', () => {
    const exercises = trisetExercises();
    const group = trisetGroup(exercises);
    render(React.createElement(Parts.SupersetBlock, {
      group,
      exercises,
      dateKey: '2026-08-09',
      onToggleCell: () => {},
      onAddRound: () => {},
      onSwap: () => {},
    }));

    expect(document.querySelector('.sb-ss')).toBeTruthy();
    expect(screen.queryByText('местами')).toBeNull();

    fireEvent.click(screen.getByLabelText('Трисет в работе'));

    expect(document.querySelector('.sb-triset-work-screen')).toBeTruthy();
    expect(screen.getByText('местами')).toBeTruthy();
    expect(screen.getByText('разъединить')).toBeTruthy();
    expect(screen.getByText('общая для связки · 2 подхода')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Назад'));

    expect(document.querySelector('.sb-triset-work-screen')).toBeNull();
    expect(document.querySelector('.sb-ss')).toBeTruthy();
  });

  it('SupersetBoundariesBody → «на весь экран» → SupersetBoundariesScreen → закрыть', () => {
    render(React.createElement(Parts.SupersetBoundariesBody, {
      who: 'Артём',
      replacements: [{
        key: 'связка не начата',
        beforeLines: ['A1 Подтягивания', '3 раунда'],
        afterLines: ['A1 Тяга блока', '3 раунда'],
      }],
      frozen: [],
    }));

    expect(screen.getByText('было')).toBeTruthy();
    expect(document.querySelector('.sb-ss-bound-screen')).toBeNull();

    fireEvent.click(screen.getByText('на весь экран ›'));

    expect(document.querySelector('.sb-ss-bound-screen')).toBeTruthy();
    expect(screen.getByText('Артём заменил связку')).toBeTruthy();
    expect(screen.getByText('связка не начата')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Закрыть'));

    expect(document.querySelector('.sb-ss-bound-screen')).toBeNull();
    expect(screen.getByText('было')).toBeTruthy();
  });

  it('шторка ⋯ → «Своё упражнение» → CustomExerciseScreen → отмена', () => {
    Parts = loadModules([
      'strength/heys_strength_catalog_ui_v1.js',
      'strength/heys_strength_finish_ui_v1.js',
      'strength/heys_strength_builder_ui_v1.js',
    ]);
    const closeOverlay = vi.fn();
    globalThis.HEYS.TrainingKernel.fullscreen = {
      mount: function ({ render: renderScreen }) {
        render(renderScreen({ close: closeOverlay }));
        return true;
      },
      unmount: vi.fn()
    };
    const SB = globalThis.HEYS.StrengthBuilder;
    globalThis.HEYS.getExerciseSuggestions = () => [];

    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим лёжа', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      historyFor: () => ({ last: null, record: null }),
      onPatch: () => {},
      onClose: () => {},
    }));

    fireEvent.click(screen.getByLabelText('Ещё'));
    fireEvent.click(screen.getByText('Своё упражнение'));

    expect(document.querySelector('.sb-custom-exercise-screen')).toBeTruthy();
    expect(screen.getByText('1 · Что меряем')).toBeTruthy();
    expect(screen.getByText('три поля, третье — только иногда')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Отменить'));

    expect(closeOverlay).toHaveBeenCalledTimes(1);
  });

  it('renderBuilderSubview отдаёт все три экрана по контрактным view-ключам', () => {
    const exercises = trisetExercises();
    const group = trisetGroup(exercises);
    const keys = Parts.STRENGTH_SUBVIEW_VIEW_KEYS;

    const custom = Parts.renderBuilderSubview({
      view: keys.CUSTOM_EXERCISE,
      props: { initialName: 'Тест', onDone: () => {}, onCancel: () => {} }
    });
    render(custom);
    expect(document.querySelector('.sb-custom-exercise-screen')).toBeTruthy();
    cleanup();

    const boundaries = Parts.renderBuilderSubview({
      view: keys.SUPERSET_BOUNDARIES,
      props: {
        who: 'Куратор',
        replacements: [{ key: 'k', beforeLines: ['a'], afterLines: ['b'] }],
        frozen: [],
        onClose: () => {}
      }
    });
    render(boundaries);
    expect(document.querySelector('.sb-ss-bound-screen')).toBeTruthy();
    cleanup();

    const triset = Parts.renderBuilderSubview({
      view: keys.TRISET_WORK,
      props: {
        group,
        exercises,
        onBack: () => {},
        onToggleCell: () => {},
        onAddRound: () => {},
        onSwap: () => {},
        readOnly: true
      }
    });
    render(triset);
    expect(document.querySelector('.sb-triset-work-screen')).toBeTruthy();
  });
});
