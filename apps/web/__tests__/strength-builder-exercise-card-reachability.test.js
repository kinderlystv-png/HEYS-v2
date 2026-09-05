// M1 ExerciseCardScreen — runtime reachability from catalog, not markup-only.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');

const PICK_NAME = 'Тяга саней';
const PICK_SUGGESTION = Object.freeze({
  name: PICK_NAME,
  norm: 'тяга саней',
  rank: 1,
});

const metaScopedStore = new Map();

function installExerciseMetaUtils() {
  globalThis.HEYS.utils = {
    lsGet: (k, d) => (metaScopedStore.has(k) ? metaScopedStore.get(k) : d),
    lsSet: (k, v) => { metaScopedStore.set(k, v); return true; },
  };
}

function loadBuilder() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  installExerciseMetaUtils();
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

function training(exercises) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { exercises },
  };
}

function renderBuilderWithCatalog(SB) {
  globalThis.HEYS.getExerciseSuggestions = () => [PICK_SUGGESTION];
  return render(React.createElement(SB.BuilderScreen, {
    training: training([{ name: 'Жим лёжа', approaches: [work(75, 8, false)] }]),
    dateKey: '2026-08-09',
    profile: {},
    historyFor: () => ({ last: null, record: null }),
    onPatch: () => {},
    onClose: () => {},
  }));
}

function openCatalogFromBuilder() {
  fireEvent.click(screen.getByLabelText('Добавить упражнение'));
  expect(document.querySelector('.sb-catalog-screen')).toBeTruthy();
  expect(screen.getByText('Каталог упражнений')).toBeTruthy();
}

function pickExerciseFromCatalog(name) {
  const titleBold = Array.from(document.querySelectorAll('.sb-cat-title b'))
    .find((el) => String(el.textContent || '').trim() === name);
  expect(titleBold).toBeTruthy();
  fireEvent.click(titleBold.closest('.sb-cat-title'));
}

let SB;

beforeEach(() => {
  metaScopedStore.clear();
  SB = loadBuilder();
});

afterEach(() => {
  cleanup();
  delete globalThis.HEYS;
  metaScopedStore.clear();
});

describe('M1 · Упражнение · карточка · reachability', () => {
  it('каталог → тап по названию → ExerciseCardScreen → отмена → каталог', () => {
    renderBuilderWithCatalog(SB);
    openCatalogFromBuilder();
    pickExerciseFromCatalog(PICK_NAME);

    expect(document.querySelector('.sb-exercise-card-screen')).toBeTruthy();
    expect(screen.getByText('Новое упражнение')).toBeTruthy();
    expect(screen.getByText('своё, не из каталога')).toBeTruthy();
    expect(screen.getByText('Чем меряется')).toBeTruthy();
    expect(screen.getByText('Сохранить упражнение')).toBeTruthy();
    expect(screen.getByDisplayValue(PICK_NAME)).toBeTruthy();
    expect(screen.queryByText('1 · Что меряем')).toBeNull();

    fireEvent.click(screen.getByLabelText('Отменить'));

    expect(document.querySelector('.sb-catalog-screen')).toBeTruthy();
    expect(screen.getByText('Каталог упражнений')).toBeTruthy();
    expect(document.querySelector('.sb-exercise-card-screen')).toBeNull();
  });

  it('не добавляет упражнение в конструктор, пока карточка не сохранена', () => {
    renderBuilderWithCatalog(SB);
    openCatalogFromBuilder();
    pickExerciseFromCatalog(PICK_NAME);

    expect(document.querySelector('.sb-exercise-card-screen')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Тяга саней/ })).toBeNull();
  });

  it('карточка → «выбрать» открывает M2 ExerciseMuscleGroupsScreen', () => {
    renderBuilderWithCatalog(SB);
    openCatalogFromBuilder();
    pickExerciseFromCatalog(PICK_NAME);

    const pickBtn = Array.from(document.querySelectorAll('.sb-ex-card-action'))
      .find((el) => String(el.textContent || '').trim() === 'выбрать');
    fireEvent.click(pickBtn);

    expect(document.querySelector('.sb-ex-muscle-screen')).toBeTruthy();
    expect(screen.getByText('одна основная, синергисты по желанию')).toBeTruthy();
  });
});
