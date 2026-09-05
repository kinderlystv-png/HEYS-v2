// M2/M3 — runtime reachability from catalog create flow (NewExerciseScreen sub-routes).
import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');

const CREATE_NAME = 'моё уникальное для M2M3';

function loadCatalog() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  return globalThis.HEYS.StrengthCatalogUI;
}

function openNewExerciseFromCatalog(Cat) {
  globalThis.HEYS.getExerciseSuggestions = () => [];
  render(React.createElement(Cat.CatalogScreen, {
    onPick: () => {},
    onBack: () => {},
    historyFor: () => ({ last: null, record: null }),
  }));
  fireEvent.change(screen.getByLabelText('Поиск по названию'), {
    target: { value: CREATE_NAME },
  });
  fireEvent.click(screen.getByText(new RegExp('Создать «' + CREATE_NAME + '»')));
  expect(screen.getByText('1 · Что меряем')).toBeTruthy();
}

let Cat;

beforeEach(() => {
  Cat = loadCatalog();
});

afterEach(() => {
  cleanup();
  delete globalThis.HEYS;
});

describe('M2/M3 · catalog create flow · reachability', () => {
  it('каталог → создание → M2 ExerciseMuscleGroupsScreen → назад', () => {
    openNewExerciseFromCatalog(Cat);
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать группы мышц' }));

    expect(document.querySelector('.sb-ex-muscle-screen')).toBeTruthy();
    expect(screen.getByText('одна основная, синергисты по желанию')).toBeTruthy();
    expect(screen.getByText('Основная — одна')).toBeTruthy();

    const primaryChips = document.querySelector('.sb-ex-muscle-primary');
    expect(primaryChips).toBeTruthy();
    const firstPrimary = primaryChips.querySelector('button');
    const pickedLabel = String(firstPrimary.textContent || '').trim();
    fireEvent.click(firstPrimary);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить группы' }));

    expect(document.querySelector('.sb-ex-muscle-screen')).toBeNull();
    expect(screen.getByText(pickedLabel)).toBeTruthy();
  });

  it('каталог → создание → свой вес → M3 ExerciseSimilarScreen → выбор', () => {
    openNewExerciseFromCatalog(Cat);
    const firstMuscleBadge = document.querySelector('.sb-ex-muscle-badge');
    expect(firstMuscleBadge).toBeTruthy();
    fireEvent.click(firstMuscleBadge);
    fireEvent.click(screen.getByRole('button', { name: 'свой вес' }));
    const similarRow = screen.getByText('Не выбрано').closest('.sb-ex-card-row');
    expect(similarRow).toBeTruthy();
    fireEvent.click(similarRow.querySelector('.sb-ex-card-action'));

    expect(document.querySelector('.sb-ex-similar-screen')).toBeTruthy();
    expect(screen.getByText('сколько тела поднимается')).toBeTruthy();
    expect(screen.getByText('Как подтягивания')).toBeTruthy();

    fireEvent.click(screen.getByText('Как подтягивания'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(document.querySelector('.sb-ex-similar-screen')).toBeNull();
    expect(screen.getByText('Как подтягивания')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Создать упражнение' }).disabled).toBe(false);
  });
});
