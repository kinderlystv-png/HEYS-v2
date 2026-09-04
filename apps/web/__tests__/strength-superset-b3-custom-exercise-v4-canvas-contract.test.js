import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const PALETTES = Object.freeze({
  sand: {
    bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
    ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
    ink56: 'rgba(0, 0, 0, .56)', ink55: 'rgba(0, 0, 0, .55)', ink62: 'rgba(0, 0, 0, .62)',
    br: 'rgba(0, 0, 0, 0.1)',
  },
  blue: {
    bg: '#ffffff', c1: '#eef3f9', c2: '#e2ecf6', tx: '#101826',
    ac: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff',
    ink56: 'rgba(16, 24, 38, .56)', ink55: 'rgba(16, 24, 38, .55)', ink62: 'rgba(16, 24, 38, .62)',
    br: 'rgba(16, 24, 38, 0.1)',
  },
});

function compileCss(paletteName) {
  const palette = PALETTES[paletteName];
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  return `:root{
    --v4-ink-rgb:${inkRgb};
    --v4-ink-prose:${palette.ink62};
    --v4-act-text:${palette.ac};
    --v4-act:${palette.acs};
    --v4-btn-on-act:${palette.onAcs};
    --v4-c1:${palette.c1};
    --v4-bg:${palette.bg};
    --v4-ink:${palette.tx};
    --v4-ink-data:${palette.ink56};
    --v4-hero:${palette.c2};
  }\n${CSS
    .replaceAll('var(--sb-card)', palette.c1)
    .replaceAll('var(--sb-bg)', palette.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-mut)', palette.ink56)
    .replaceAll('var(--sb-br)', palette.br)
    .replaceAll('var(--sb-soft)', palette.c2)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--v4-btn-on-act, #fff5ef)', palette.onAcs)
    .replaceAll('var(--v4-bg, #fffaf3)', palette.bg)
    .replaceAll('var(--v4-c1, #f7efe2)', palette.c1)
    .replaceAll('var(--v4-hero, #efe3cf)', palette.c2)
    .replaceAll('var(--v4-ink, #201e1d)', palette.tx)
    .replaceAll('var(--v4-act-text, #8a4a20)', palette.ac)
    .replaceAll('var(--v4-act, #c67139)', palette.acs)
    .replaceAll('var(--v4-ink-prose, rgba(var(--v4-ink-rgb, 0, 0, 0), 0.62))', palette.ink62)
    .replaceAll('var(--bg)', palette.bg)
    .replaceAll('var(--c1)', palette.c1)
    .replaceAll('var(--c2)', palette.c2)
    .replaceAll('var(--tx)', palette.tx)
    .replaceAll('var(--ac)', palette.ac)
    .replaceAll('var(--acs)', palette.acs)
    .replaceAll('var(--on-acs)', palette.onAcs)
    .replaceAll('var(--ink, 0, 0, 0)', inkRgb)
    .replaceAll('var(--ink)', inkRgb)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px')}`;
}

function loadParts() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  return window.HEYS.StrengthBuilderParts;
}

function expectStyle(node, expected, label) {
  const actual = getComputedStyle(node);
  Object.entries(expected).forEach(([property, value]) => {
    expect(actual[property], `${label} · ${property}`).toBe(value);
  });
}

function renderCustomExercise(paletteName = 'sand', initialName = 'Тяга Т-грифа') {
  const Parts = loadParts();
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  const style = document.createElement('style');
  style.textContent = `${BASE_CSS}\n${compileCss(paletteName)}`;
  document.head.appendChild(style);
  render(React.createElement(Parts.CustomExerciseScreen, {
    initialName,
    onDone: () => {},
    onCancel: () => {},
  }));
  const injected = document.querySelector('.sb-custom-exercise-screen style');
  if (injected) {
    injected.textContent = injected.textContent.replaceAll('var(--ink)', inkRgb);
  }
  fireEvent.click(screen.getByRole('button', { name: 'вес × повторы' }));
  fireEvent.click(screen.getByRole('button', { name: 'спина' }));
  return { style, palette: PALETTES[paletteName] };
}

describe('strength builder · В3 своё упражнение v4 canvas contract', () => {
  let style;
  let palette;

  afterEach(() => {
    cleanup();
    style?.remove();
    delete window.HEYS;
  });

  it('exports CustomExerciseScreen with canvas copy and unit-driven third question', () => {
    expect(SUPERSET).toContain('CustomExerciseScreen');
    expect(SUPERSET).toContain("'Новое упражнение'");
    expect(SUPERSET).toContain("'три поля, третье — только иногда'");
    expect(SUPERSET).toContain("'1 · Что меряем'");
    expect(SUPERSET).toContain("'2 · Какие мышцы'");
    expect(SUPERSET).toContain("'3 · Только для своего веса'");
    expect(SUPERSET).toContain("'Создать упражнение'");
    expect(SUPERSET).toContain("'Создать без объёма'");
    expect(SUPERSET).toContain("const needsFactor = unit === 'bodyweight'");
    expect(SUPERSET).toContain('Для «вес × повторы» третий вопрос не задаётся.');
    expect(SUPERSET).toContain('У упражнений на своём весе спрашиваем «на что похоже»');
    expect(SUPERSET).toContain('Без ответа на третий вопрос упражнение в объём не идёт');
    expect(SUPERSET).toContain('CUSTOM_EX_V4_BRIDGE');
    expect(SUPERSET).toContain('sb-custom-ex-badge--off');
    expect(SUPERSET).toContain('вес × повторы');
  });

  it('доказывает computed-style контракт «Своё упражнение» на песочном наборе', { timeout: 20000 }, () => {
    ({ style, palette } = renderCustomExercise('sand'));

    const headTitle = document.querySelector('.sb-custom-exercise-screen .sb-head-title');
    const nameField = document.querySelector('.sb-ex-name');
    const tier = screen.getByText('1 · Что меряем');
    const unitOn = screen.getByRole('button', { name: 'вес × повторы' });
    const unitOff = screen.getByRole('button', { name: 'свой вес' });
    const primaryRow = screen.getByText('Основная').closest('div');
    const primaryValue = primaryRow.querySelector('span:last-child');
    const finish = screen.getByRole('button', { name: 'Создать упражнение' });
    const hint = screen.getByText(/Для «вес × повторы» третий вопрос не задаётся/);
    const footnote = screen.getByText(/Без ответа на третий вопрос упражнение в объём не идёт/);

    expectStyle(headTitle, { display: 'flex', flexDirection: 'column', gap: '3px' }, '02');
    expectStyle(nameField, {
      minHeight: '44px',
      borderRadius: '14px',
      paddingTop: '0px', paddingRight: '14px', paddingBottom: '0px', paddingLeft: '14px',
      marginTop: '12px',
      fontSize: '13px', fontWeight: '700', lineHeight: '1',
      color: palette.tx,
      backgroundColor: palette.c1,
    }, '06');
    expectStyle(tier, { fontSize: '10px', fontWeight: '700', lineHeight: '1', color: palette.ac }, '07');
    expectStyle(unitOn, {
      backgroundColor: palette.acs,
      color: palette.onAcs,
    }, '11');
    expectStyle(unitOff, { color: palette.ink62 }, '12');
    expectStyle(primaryRow, { paddingTop: '9px', paddingBottom: '9px', borderBottomStyle: 'none' }, '09');
    expectStyle(screen.getByText('Основная'), { color: palette.tx }, '14');
    expectStyle(primaryValue, { fontSize: '11.5px', fontWeight: '700', lineHeight: '1', color: palette.ac }, '15');
    expectStyle(hint, { fontSize: '12.5px', fontWeight: '600', lineHeight: '1.4', color: palette.ink55 }, '19');
    expectStyle(finish, { marginTop: '12px' }, '21');
    expectStyle(footnote, { marginTop: '12px', fontSize: '11px', fontWeight: '500', lineHeight: '1.55', color: palette.ink56 }, '23');
  });

  it('держит роли чернил «Своё упражнение» на синем наборе', { timeout: 20000 }, () => {
    ({ style, palette } = renderCustomExercise('blue'));
    expectStyle(screen.getByText('1 · Что меряем'), { color: palette.ac }, '07 blue');
    expectStyle(screen.getByRole('button', { name: 'вес × повторы' }), {
      backgroundColor: palette.acs,
      color: palette.onAcs,
    }, '11 blue');
    const primaryValue = screen.getByText('Основная').parentElement.querySelector('span:last-child');
    expectStyle(primaryValue, { color: palette.ac }, '15 blue');
    expectStyle(document.querySelector('.sb-ex-name'), { backgroundColor: palette.c1, color: palette.tx }, '06 blue');
  });

  it('shows bodyweight third question and secondary create action', { timeout: 20000 }, () => {
    const Parts = loadParts();
    const localStyle = document.createElement('style');
    localStyle.textContent = `${BASE_CSS}\n${compileCss('sand')}`;
    document.head.appendChild(localStyle);
    render(React.createElement(Parts.CustomExerciseScreen, {
      initialName: 'Отжимания',
      onDone: () => {},
      onCancel: () => {},
    }));
    const injected = document.querySelector('.sb-custom-exercise-screen style');
    if (injected) injected.textContent = injected.textContent.replaceAll('var(--ink)', '0, 0, 0');
    fireEvent.click(screen.getByRole('button', { name: 'свой вес' }));
    expect(screen.getByText(/У упражнений на своём весе спрашиваем «на что похоже»/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Создать без объёма' })).toBeTruthy();
    localStyle.remove();
  });
});
