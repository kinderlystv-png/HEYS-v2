// Task 43 — functional smoke: catalog ↔ ExerciseCardScreen ↔ exerciseMeta ↔ constructor.
import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');

const PICK_NAME = 'Тяга саней';
const CREATE_NAME = 'моё уникальное task43';
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

function renderBuilderWithCatalog(SB, profile) {
  globalThis.HEYS.getExerciseSuggestions = () => [PICK_SUGGESTION];
  return render(React.createElement(SB.BuilderScreen, {
    training: training([{ name: 'Жим лёжа', approaches: [work(75, 8, false)] }]),
    dateKey: '2026-08-09',
    profile: profile || { weight: 80 },
    historyFor: () => ({ last: null, record: null }),
    onPatch: () => {},
    onClose: () => {},
  }));
}

function openCatalogFromBuilder() {
  fireEvent.click(screen.getByLabelText('Добавить упражнение'));
  expect(document.querySelector('.sb-catalog-screen')).toBeTruthy();
}

function pickExerciseFromCatalog(name) {
  const titleBold = Array.from(document.querySelectorAll('.sb-cat-title b'))
    .find((el) => String(el.textContent || '').trim() === name);
  expect(titleBold).toBeTruthy();
  fireEvent.click(titleBold.closest('.sb-cat-title'));
}

function openMuscleGroupsFromCard() {
  const pickBtn = Array.from(document.querySelectorAll('.sb-ex-card-action'))
    .find((el) => String(el.textContent || '').trim() === 'выбрать');
  expect(pickBtn).toBeTruthy();
  fireEvent.click(pickBtn);
  expect(document.querySelector('.sb-ex-muscle-screen')).toBeTruthy();
}

function pickFirstPrimaryMuscle() {
  const primaryChips = document.querySelector('.sb-ex-muscle-primary');
  expect(primaryChips).toBeTruthy();
  const firstPrimary = primaryChips.querySelector('button');
  const pickedLabel = String(firstPrimary.textContent || '').trim();
  fireEvent.click(firstPrimary);
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить группы' }));
  return pickedLabel;
}

function openSimilarFromCard() {
  const row = screen.getByText('Не выбрано').closest('.sb-ex-card-row');
  const actionBtn = row.querySelector('.sb-ex-card-action');
  expect(actionBtn).toBeTruthy();
  fireEvent.click(actionBtn);
}

function completeCreateExerciseViaM2() {
  fireEvent.click(screen.getByRole('button', { name: 'вес × повторы' }));
  const firstMuscleBadge = document.querySelector('.sb-ex-muscle-badge');
  expect(firstMuscleBadge).toBeTruthy();
  fireEvent.click(firstMuscleBadge);
  const createBtn = screen.getByRole('button', { name: 'Создать упражнение' });
  expect(createBtn.disabled).toBe(false);
  fireEvent.click(createBtn);
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

describe('Task 43 · M2/M3 from ExerciseCardScreen', () => {
  it('карточка → M2 ExerciseMuscleGroupsScreen → назад с выбором', () => {
    renderBuilderWithCatalog(SB);
    openCatalogFromBuilder();
    pickExerciseFromCatalog(PICK_NAME);

    openMuscleGroupsFromCard();
    const pickedLabel = pickFirstPrimaryMuscle();

    expect(document.querySelector('.sb-ex-muscle-screen')).toBeNull();
    expect(document.querySelector('.sb-exercise-card-screen')).toBeTruthy();
    expect(screen.getByText('Основная · ' + pickedLabel)).toBeTruthy();
  });

  it('карточка → свой вес → M3 ExerciseSimilarScreen → выбор', () => {
    renderBuilderWithCatalog(SB);
    openCatalogFromBuilder();
    pickExerciseFromCatalog(PICK_NAME);

    fireEvent.click(screen.getByText('свой вес'));
    openMuscleGroupsFromCard();
    pickFirstPrimaryMuscle();

    openSimilarFromCard();

    expect(document.querySelector('.sb-ex-similar-screen')).toBeTruthy();
    fireEvent.click(screen.getByText('Как подтягивания'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(document.querySelector('.sb-ex-similar-screen')).toBeNull();
    expect(screen.getByText('Как подтягивания')).toBeTruthy();
  });
});

describe('Task 43 · Path A — catalog card edit persists exerciseMeta', () => {
  it('каталог → карточка → единица/группы/коэффициент → сохранить → каталог с обновлёнными данными', () => {
    renderBuilderWithCatalog(SB);
    openCatalogFromBuilder();
    pickExerciseFromCatalog(PICK_NAME);

    fireEvent.click(screen.getByText('свой вес'));
    openMuscleGroupsFromCard();
    const pickedLabel = pickFirstPrimaryMuscle();

    openSimilarFromCard();
    fireEvent.click(screen.getByText('Как отжимания от пола'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить упражнение' }));

    const meta = globalThis.HEYS.exerciseMeta.get(PICK_NAME);
    expect(meta).toBeTruthy();
    expect(meta.unit).toBe('bodyweight');
    expect(meta.primaryGroup).toBeTruthy();
    expect(meta.bodyweightFactor).toBe(0.64);

    expect(document.querySelector('.sb-catalog-screen')).toBeTruthy();
    const rowSubtitle = document.querySelector('.sb-cat-title span');
    expect(rowSubtitle?.textContent).toContain(apiGroupLabelSnippet(pickedLabel));
  });
});

describe('Task 43 · Path B — create flow reaches constructor list', () => {
  it('каталог → «Создать…» → NewExerciseScreen → конструктор со сохранённым упражнением', () => {
    globalThis.HEYS.getExerciseSuggestions = () => [];
    renderBuilderWithCatalog(SB);

    openCatalogFromBuilder();
    fireEvent.change(screen.getByLabelText('Поиск по названию'), {
      target: { value: CREATE_NAME },
    });
    fireEvent.click(screen.getByText(new RegExp('Создать «' + CREATE_NAME + '»')));

    expect(screen.getByText('1 · Что меряем')).toBeTruthy();
    completeCreateExerciseViaM2();

    expect(document.querySelector('.sb-catalog-screen')).toBeNull();
    expect(document.querySelector('.sb-exercise-card-screen')).toBeNull();
    expect(screen.getByText(CREATE_NAME)).toBeTruthy();

    const meta = globalThis.HEYS.exerciseMeta.get(CREATE_NAME);
    expect(meta).toBeTruthy();
    expect(meta.unit).toBe('weight_reps');
    expect(meta.primaryGroup).toBeTruthy();
  });
});

function apiGroupLabelSnippet(pickedChipLabel) {
  const api = globalThis.HEYS.exerciseMeta;
  const match = api.groups.find((g) => pickedChipLabel.indexOf(g.label.toLowerCase()) >= 0);
  return match ? match.label : pickedChipLabel;
}
