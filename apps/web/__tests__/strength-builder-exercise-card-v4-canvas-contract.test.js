import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const SAND = Object.freeze({
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', tx: '#201e1d', c1: '#f7efe2', c2: '#efe3cf', bg: '#fffaf1'
});
const BLUE = Object.freeze({
  ac: '#2a5490', acs: '#3d7cc9', onAcs: '#f5f8fc', tx: '#1a2332', c1: '#eef3fa', c2: '#dce8f5', bg: '#eef3fa'
});

function paletteCss(palette) {
  const p = palette || SAND;
  return `${BASE_CSS}\n${CSS}`
    .replaceAll('var(--c1)', p.c1)
    .replaceAll('var(--c2)', p.c2)
    .replaceAll('var(--bg)', p.bg)
    .replaceAll('var(--tx)', p.tx)
    .replaceAll('var(--ac)', p.ac)
    .replaceAll('var(--acs)', p.acs)
    .replaceAll('var(--on-acs)', p.onAcs)
    .replaceAll('var(--v4-act, #c67139)', p.acs)
    .replaceAll('var(--v4-btn-on-act, #2b1608)', p.onAcs)
    .replaceAll('var(--ink)', '0, 0, 0');
}

function cssRule(selector) {
  const marker = `${selector} {`;
  const start = CSS.indexOf(marker);
  expect(start, `missing CSS rule ${selector}`).toBeGreaterThan(-1);
  const end = CSS.indexOf('}', start);
  return CSS.slice(start, end + 1);
}

function loadExerciseCardScreen() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return window.HEYS.StrengthBuilder.ExerciseCardScreen;
}

describe('М1 · Упражнение · карточка · canvas contract', () => {
  let ExerciseCardScreen;

  beforeEach(() => { ExerciseCardScreen = loadExerciseCardScreen(); });
  afterEach(() => { cleanup(); delete window.HEYS; });

  it('держит ExerciseCardScreen, ключ шапки и тексты кадра', () => {
    expect(BUILDER).toContain('function ExerciseCardScreen');
    expect(BUILDER).toContain("'своё, не из каталога'");
    expect(BUILDER).toContain("'Чем меряется'");
    expect(BUILDER).toContain("'кг × повт'");
    expect(BUILDER).toContain("'Какие мышцы'");
    expect(BUILDER).toContain("'берёт полный объём'");
    expect(BUILDER).toContain("'сменить'");
    expect(BUILDER).toContain("'берут ' + shareLabel");
    expect(BUILDER).toContain("'выбрать'");
    expect(BUILDER).toContain("'Коэффициент своего веса'");
    expect(BUILDER).toContain("'Не спрашиваем'");
    expect(BUILDER).toContain("'единица не «свой вес» — поля нет'");
    expect(BUILDER).toContain("'Сохранить упражнение'");
    expect(BUILDER).toContain('Единица решает две вещи сразу');
    expect(BUILDER).toContain('Ничего из этого не заполняется за человека молча');
    expect(BUILDER).toContain("view === 'new'");
    expect(BUILDER).toContain('h(ExerciseCardScreen');
  });

  it('использует геометрию шапки, поля имени, пилюль и списка .cd', () => {
    expect(cssRule('.sb-exercise-card-screen .sb-ex-card-head-title')).toContain('flex-direction: column;');
    expect(cssRule('.sb-exercise-card-screen .sb-ex-card-head-title')).toContain('gap: 3px;');
    expect(cssRule('.sb-ex-card-name')).toContain('min-height: 48px;');
    expect(cssRule('.sb-ex-card-name')).toContain('border-radius: 14px;');
    expect(cssRule('.sb-ex-card-name')).toContain('background: var(--v4-bg, var(--sb-bg));');
    expect(cssRule('.sb-ex-card-name')).toContain('box-shadow: inset 0 0 0 1.5px var(--acs);');
    expect(cssRule('.sb-ex-card-name')).toContain('padding: 0 14px;');
    expect(cssRule('.sb-ex-card-name')).toContain('margin-top: 12px;');
    expect(cssRule('.sb-ex-card-name')).toContain('font: 600 13.5px/1 Figtree');
    expect(cssRule('.sb-ex-card-name')).toContain('color: var(--tx);');
    expect(cssRule('.sb-ex-card-units')).toContain('gap: 6px;');
    expect(cssRule('.sb-ex-card-pill')).toContain('flex: 1;');
    expect(cssRule('.sb-ex-card-pill.is-on')).toContain('background: var(--acs);');
    expect(cssRule('.sb-ex-card-pill.is-on')).toContain('color: var(--on-acs);');
    expect(cssRule('.sb-ex-card-cd')).toContain('background: var(--c1);');
    expect(cssRule('.sb-ex-card-row.is-last')).toContain('border-bottom: 0;');
    expect(cssRule('.sb-ex-card-row-copy b')).toContain('color: var(--tx);');
    expect(cssRule('.sb-ex-card-row-copy span')).toContain('font: 500 11px/1.3 Figtree');
    expect(cssRule('.sb-ex-card-row-copy span')).toContain('rgba(var(--ink), .56)');
    expect(cssRule('.sb-ex-card-action')).toContain('font: 700 11.5px/1 Figtree');
    expect(cssRule('.sb-ex-card-action')).toContain('color: var(--ac);');
    expect(cssRule('.sb-ex-card-muted')).toContain('rgba(var(--ink), .42)');
    expect(cssRule('.sb-ex-card-save')).toContain('margin-top: 12px;');
  });

  it('рендерит тексты и выбранную пилюлю на песочной и синей палитрах', () => {
    const style = document.createElement('style');
    style.textContent = paletteCss(SAND);
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(ExerciseCardScreen, {
        initialName: 'Тяга саней',
        onDone: () => {},
        onCancel: () => {}
      }));
      expect(screen.getByText('Новое упражнение')).toBeTruthy();
      expect(screen.getByText('своё, не из каталога')).toBeTruthy();
      expect(screen.getByDisplayValue('Тяга саней')).toBeTruthy();
      expect(screen.getByText('кг × повт')).toBeTruthy();
      expect(screen.getByText('метры')).toBeTruthy();
      expect(screen.getByText('Чем меряется')).toBeTruthy();
      expect(screen.getByText('Какие мышцы')).toBeTruthy();
      expect(screen.getByText('Не спрашиваем')).toBeTruthy();
      expect(screen.getByText('Сохранить упражнение')).toBeTruthy();

      fireEvent.click(screen.getByText('метры'));
      const onPill = container.querySelector('.sb-ex-card-pill.is-on');
      expect(onPill).toBeTruthy();
      expect(onPill.textContent).toBe('метры');
      expect(getComputedStyle(onPill).backgroundColor).toBe(SAND.acs);

      style.textContent = paletteCss(BLUE);
      fireEvent.click(screen.getByText('кг × повт'));
      fireEvent.click(screen.getByText('метры'));
      const bluePill = container.querySelector('.sb-ex-card-pill.is-on');
      expect(getComputedStyle(bluePill).backgroundColor).toBe(BLUE.acs);
    } finally {
      style.remove();
    }
  });
});
