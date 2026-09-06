import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  createStyleHost,
  loadStrengthModuleSet,
  readWebFile,
  substituteV4InkRolesAfterInk,
  substituteV4InkRolesBeforeInk,
} from './helpers/strength-canvas-contract-harness.js';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = readWebFile(WEB_DIR, 'strength/heys_strength_catalog_ui_v1.js');
const CSS = readWebFile(WEB_DIR, 'styles/modules/750-strength-builder.css');

const PALETTES = Object.freeze({
  sand: {
    bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
    ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
    ink55: 'rgba(0, 0, 0, 0.55)',
    ink56: 'rgba(0, 0, 0, 0.56)',
  },
  blue: {
    bg: '#ffffff', c1: '#eef3f9', c2: '#e2ecf6', tx: '#101826',
    ac: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff',
    ink55: 'rgba(16, 24, 38, 0.55)',
    ink56: 'rgba(16, 24, 38, 0.56)',
  },
});

function compileCss(paletteName) {
  const palette = PALETTES[paletteName];
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  const roles = { ink55: palette.ink55, ink55Blue: PALETTES.blue.ink55 };
  const body = substituteV4InkRolesAfterInk(substituteV4InkRolesBeforeInk(CSS, roles)
    .replaceAll('var(--sb-card)', palette.c1)
    .replaceAll('var(--sb-bg)', palette.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-soft)', palette.c2)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--v4-btn-on-act, #2b1608)', palette.onAcs)
    .replaceAll('var(--v4-bg, #fffaf3)', palette.bg)
    .replaceAll('var(--v4-c1, #f7efe2)', palette.c1)
    .replaceAll('var(--v4-hero, #efe3cf)', palette.c2)
    .replaceAll('var(--v4-ink, #201e1d)', palette.tx)
    .replaceAll('var(--v4-act-text, #8a4a20)', palette.ac)
    .replaceAll('var(--v4-act, #c67139)', palette.acs)
    .replaceAll('var(--bg)', palette.bg)
    .replaceAll('var(--c1)', palette.c1)
    .replaceAll('var(--c2)', palette.c2)
    .replaceAll('var(--tx)', palette.tx)
    /* var(--ac) не трогаем: replaceAll ломает var(--ac, fallback) в 750-strength-builder.css. */
    .replaceAll('var(--acs)', palette.acs)
    .replaceAll('var(--on-acs)', palette.onAcs)
    .replaceAll('var(--ink, 32, 30, 29)', inkRgb)
    .replaceAll('var(--ink)', inkRgb)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px'), roles);
  return `:root{
    --v4-ink-rgb:${inkRgb};
    --v4-act-text:${palette.ac};
    --v4-act:${palette.acs};
    --v4-btn-on-act:${palette.onAcs};
    --v4-c1:${palette.c1};
    --v4-bg:${palette.bg};
    --v4-ink:${palette.tx};
    --v4-hero:${palette.c2};
  }\n${body}`;
}

const COMPILED_CSS = {
  sand: compileCss('sand'),
  blue: compileCss('blue'),
};
const heysBoot = loadStrengthModuleSet(WEB_DIR, 'catalogNewExercise', React);
const NewExerciseScreen = heysBoot.StrengthCatalogUI.NewExerciseScreen;
let styleHost;

function expectStyle(node, expected, label) {
  const actual = getComputedStyle(node);
  Object.entries(expected).forEach(([property, value]) => {
    expect(actual[property], `${label} · ${property}`).toBe(value);
  });
}

function renderNewExercise(paletteName = 'sand') {
  const palette = PALETTES[paletteName];
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  styleHost.set(COMPILED_CSS[paletteName]);
  render(React.createElement(NewExerciseScreen, {
    onDone: () => {},
    onCancel: () => {},
  }));
  const root = document.querySelector('.sb-root.sb-screen');
  Object.assign(root.style, {
    '--ac': palette.ac,
    '--acs': palette.acs,
    '--on-acs': palette.onAcs,
    '--ink': inkRgb,
    '--tx': palette.tx,
    '--c1': palette.c1,
  });
  fireEvent.click(screen.getByRole('button', { name: 'вес × повторы' }));
  return { palette };
}

function renderNewExerciseWithMuscles(paletteName = 'sand') {
  const result = renderNewExercise(paletteName);
  fireEvent.click(screen.getByRole('button', { name: 'спина' }));
  fireEvent.click(screen.getByRole('button', { name: 'бицепс' }));
  fireEvent.click(screen.getByRole('button', { name: 'плечи' }));
  return result;
}

describe('strength builder · B3 своё упражнение ·08–12 badge-row v4 canvas contract', () => {
  beforeAll(() => {
    styleHost = createStyleHost();
    styleHost.set(COMPILED_CSS.sand);
  });

  afterEach(() => cleanup());

  afterAll(() => {
    styleHost?.remove();
    delete window.HEYS;
  });

  it('uses badge-row markup instead of vertical sb-radio for units', () => {
    expect(CATALOG).toContain('sb-ex-unit-badge');
    expect(CATALOG).toContain('sb-ex-unit-badges');
    expect(CATALOG).toContain('sb-ex-cd-row');
    expect(CATALOG).toContain("weight_reps: 'вес × повторы'");
    expect(CATALOG).not.toMatch(/api\.units\.map[\s\S]{0,220}sb-radio/);
    expect(CSS).toMatch(/\.sb-root\.sb-screen:has\(\.sb-ex-name\) \.sb-ex-unit-badges[\s\S]*gap: 6px;/);
    expect(CSS).toMatch(/\.sb-root\.sb-screen:has\(\.sb-ex-name\) \.sb-ex-cd-row[\s\S]*padding: 9px 0;/);
    expect(CSS).toMatch(/\.sb-ex-unit-badge\.is-on[\s\S]*var\(--acs/);
  });

  it('доказывает computed-style badge-row на песочном наборе', { timeout: 20000 }, () => {
    renderNewExercise('sand');
    const palette = PALETTES.sand;
    const row = document.querySelector('.sb-ex-cd-row');
    const badges = document.querySelector('.sb-ex-unit-badges');
    const unitOn = screen.getByRole('button', { name: 'вес × повторы' });
    const unitOff = screen.getByRole('button', { name: 'свой вес' });

    expectStyle(row, { paddingTop: '9px', paddingBottom: '9px' }, '09 sand');
    expectStyle(badges, { display: 'flex', flexWrap: 'wrap', gap: '6px' }, '10 sand');
    expectStyle(unitOn, { backgroundColor: palette.acs, color: palette.onAcs }, '11 sand');
    expectStyle(unitOff, { color: palette.ink55 }, '12 sand');
  });

  it('держит роли выбранной пилюли на синем наборе', { timeout: 20000 }, () => {
    renderNewExercise('blue');
    const palette = PALETTES.blue;
    expectStyle(screen.getByRole('button', { name: 'вес × повторы' }), {
      backgroundColor: palette.acs,
      color: palette.onAcs,
    }, '11 blue');
    expectStyle(screen.getByRole('button', { name: 'метры' }), {
      color: palette.ink55,
    }, '12 blue');
  });

  it('uses muscle badge-row and summary .cd rows instead of large sb-chip', () => {
    expect(CATALOG).toContain('sb-ex-muscle-badges');
    expect(CATALOG).toContain('sb-ex-muscle-badge');
    expect(CATALOG).toContain('sb-ex-muscle-key');
    expect(CATALOG).toContain('sb-ex-muscle-val');
    expect(CATALOG).toContain("'Основная'");
    expect(CATALOG).toContain("'Помогают'");
    const newExBlock = CATALOG.match(/function NewExerciseScreen[\s\S]*?function ExerciseMuscleGroupsScreen/)[0];
    expect(newExBlock).not.toContain("className: 'sb-chips'");
    expect(newExBlock).toContain('sb-ex-muscle-cd');
    expect(CSS).toMatch(/\.sb-root\.sb-screen:has\(\.sb-ex-name\) \.sb-ex-muscle-badges[\s\S]*gap: 6px;/);
    expect(CSS).toMatch(/\.sb-ex-muscle-key[\s\S]*var\(--tx/);
    expect(CSS).toMatch(/\.sb-ex-muscle-val\.is-primary[\s\S]*var\(--ac/);
    expect(CSS).toMatch(/\.sb-ex-muscle-row[\s\S]*border-bottom: none;/);
    expect(CSS).toMatch(/\.sb-ex-muscle-val:not\(\.is-primary\)[\s\S]*rgba\(var\(--ink\), 0\.56\)/);
  });

  it('доказывает computed-style muscle rows ·14–17 на песочном наборе', { timeout: 20000 }, () => {
    renderNewExerciseWithMuscles('sand');
    const palette = PALETTES.sand;
    const primaryRow = screen.getByText('Основная').closest('.sb-ex-muscle-row');
    const secondaryRow = screen.getByText('Помогают').closest('.sb-ex-muscle-row');
    const primaryValue = primaryRow.querySelector('.sb-ex-muscle-val');
    const secondaryValue = secondaryRow.querySelector('.sb-ex-muscle-val');

    expectStyle(screen.getByText('Основная'), { color: palette.tx }, '14 sand');
    expectStyle(primaryValue, {
      fontSize: '11.5px',
      fontWeight: '700',
      lineHeight: '1',
      color: palette.ac,
    }, '15 sand');
    expectStyle(primaryRow, {
      paddingTop: '9px',
      paddingBottom: '9px',
      borderBottomStyle: 'none',
    }, '16 sand');
    expectStyle(secondaryValue, {
      fontSize: '11.5px',
      fontWeight: '600',
      lineHeight: '1',
      color: palette.ink56,
    }, '17 sand');
    expect(secondaryValue.textContent).toBe('бицепс, плечи');
  });

  it('держит роли muscle rows ·14–17 на синем наборе', { timeout: 20000 }, () => {
    renderNewExerciseWithMuscles('blue');
    const palette = PALETTES.blue;
    const primaryValue = screen.getByText('Основная')
      .closest('.sb-ex-muscle-row')
      .querySelector('.sb-ex-muscle-val');
    const secondaryValue = screen.getByText('Помогают')
      .closest('.sb-ex-muscle-row')
      .querySelector('.sb-ex-muscle-val');

    expectStyle(screen.getByText('Основная'), { color: palette.tx }, '14 blue');
    expectStyle(primaryValue, { color: palette.ac }, '15 blue');
    expectStyle(secondaryValue, { color: palette.ink56 }, '17 blue');
  });
});
