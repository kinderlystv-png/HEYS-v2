import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const RAW_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SOURCE = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_catalog_ui_v1.js'), 'utf8');

const PALETTES = Object.freeze({
  sand: {
    bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
    ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
    ink56: 'rgba(0, 0, 0, 0.56)', ink62: 'rgba(0, 0, 0, 0.62)',
    br: 'rgba(0, 0, 0, 0.1)',
  },
  blue: {
    bg: '#ffffff', c1: '#eef3f9', c2: '#e2ecf6', tx: '#101826',
    ac: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff',
    ink56: 'rgba(16, 24, 38, 0.64)', ink62: 'rgba(16, 24, 38, 0.62)',
    br: 'rgba(16, 24, 38, 0.1)',
  },
});

function compileCss(palette, paletteName) {
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  return `:root{--v4-ink-prose:${palette.ink62};--v4-ink-rgb:${inkRgb};}\n${RAW_CSS
    .replaceAll('var(--sb-card)', palette.c1)
    .replaceAll('var(--sb-bg)', palette.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-mut)', palette.ink56)
    .replaceAll('var(--sb-br)', palette.br)
    .replaceAll('var(--sb-soft)', palette.c2)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-accbg)', 'rgba(198, 113, 57, 0.12)')
    .replaceAll('var(--sb-accTx)', palette.ac)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--v4-btn-on-act, #fff5ef)', palette.onAcs)
    .replaceAll('var(--v4-bg, #fffaf3)', palette.bg)
    .replaceAll('var(--v4-c1, #f7efe2)', palette.c1)
    .replaceAll('var(--v4-hero, #efe3cf)', palette.c2)
    .replaceAll('var(--v4-ink, #201e1d)', palette.tx)
    .replaceAll('var(--v4-act-text, #8a4a20)', palette.ac)
    .replaceAll('var(--v4-act, #c67139)', palette.acs)
    .replaceAll('var(--v4-ink-data, rgba(32, 30, 29, 0.56))', palette.ink56)
    .replaceAll('var(--v4-ink-prose, rgba(var(--v4-ink-rgb, 0, 0, 0), 0.62))', palette.ink62)
    .replaceAll('var(--ink, 35, 31, 26)', '0, 0, 0')
    .replaceAll('var(--ink)', '0, 0, 0')
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px')}`;
}

function loadCatalog() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  return globalThis.HEYS.StrengthCatalogUI;
}

function canvasExercises() {
  const work = (weightKg, reps) => ({ weightKg: String(weightKg), reps, done: false });
  return [
    { name: 'Жим лёжа', restSec: 90, approaches: [work(75, 8)] },
    { name: 'Тяга', restSec: 120, approaches: [work(60, 10)] },
    { name: 'Жим гантелей', restSec: 90, approaches: [work(24, 12)] },
    { name: 'Разведение', restSec: 60, approaches: [work(20, 12)] },
  ];
}

function renderTrisetScreen(Cat, paletteName = 'sand') {
  const style = document.createElement('style');
  style.textContent = `${BASE_CSS}\n${compileCss(PALETTES[paletteName], paletteName)}`;
  document.head.appendChild(style);
  render(React.createElement(Cat.SupersetScreen, {
    exercises: canvasExercises(),
    startIndex: 0,
    onCreate: () => {},
    onCancel: () => {},
  }));
  fireEvent.click(screen.getByRole('button', { name: /Трисет/ }));
  return style;
}

function expectStyle(node, expected, label) {
  const actual = getComputedStyle(node);
  Object.entries(expected).forEach(([property, value]) => {
    expect(actual[property], `${label} · ${property}`).toBe(value);
  });
}

describe('strength builder · З1 superset create v4 canvas contract', () => {
  let Cat;
  let style;

  beforeEach(() => {
    Cat = loadCatalog();
  });

  afterEach(() => {
    cleanup();
    style?.remove();
  });

  it('keeps the kind rows inside the canvas card inset', () => {
    expect(RAW_CSS).toMatch(/\.sb-superset-kinds\s*\{[\s\S]*padding: 2px 16px 1\.5px;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-list\s*\{[\s\S]*padding: 19\.5px 18px 18px;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-radio\s*\{[\s\S]*min-height: 0;[\s\S]*gap: 10px;[\s\S]*padding: 13\.5px 0;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-radio\.is-on\s*\{[\s\S]*padding: 13\.5px 8px;/);
  });

  it('uses the canvas control, result and note typography', () => {
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-head\s*\{[\s\S]*align-items: flex-start;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-head-sub\s*\{[\s\S]*font: 600 10\.5px\/1 Figtree, sans-serif;[\s\S]*letter-spacing: 0\.04em;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-step span\s*\{[\s\S]*font: inherit;[\s\S]*letter-spacing: inherit;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-radio \.sb-ex-num\s*\{[\s\S]*border-radius: 9px;[\s\S]*background: var\(--sb-soft\);[\s\S]*font: 700 11px\/1 Figtree, sans-serif;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-control\s*\{[\s\S]*padding: 12px;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-controls\s*\{[\s\S]*margin-bottom: 21px;/);
    expect(RAW_CSS).toMatch(/\.sb-control-label\s*\{[\s\S]*font: 600 10\.5px\/1 Figtree, sans-serif;[\s\S]*letter-spacing: 0\.04em;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-stepper \.sb-btn\s*\{[\s\S]*background: var\(--sb-soft\);/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-block\s*\{[\s\S]*padding: 16px;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-create-screen \.sb-tile span\s*\{[\s\S]*font: 600 10\.5px\/1 Figtree, sans-serif;[\s\S]*text-transform: none;/);
    expect(RAW_CSS).toMatch(/\.sb-superset-note\s*\{[\s\S]*font: 500 11px\/1\.55 Figtree, sans-serif;/);
  });

  it('matches the canvas copy without changing the superset calculation', () => {
    expect(SOURCE).toContain("d: 'два упражнения подряд без паузы'");
    expect(SOURCE).toContain("d: 'три подряд — плотнее и тяжелее'");
    expect(SOURCE).toContain("d: 'четыре и больше, круг за кругом'");
    expect(SOURCE).toContain('const totalApproaches = count * rounds;');
    expect(SOURCE).toContain("'Суперсет, трисет и круговая — один объект с разным числом участников");
  });

  it('доказывает построчный DOM/computed-style контракт кадра З1 на песочном наборе', { timeout: 15000 }, () => {
    style = renderTrisetScreen(Cat, 'sand');
    const palette = PALETTES.sand;

    expect(screen.getByText('Новая связка')).toBeTruthy();
    expect(screen.getByText('упражнения подряд, отдых — после круга')).toBeTruthy();
    expect(screen.getByText('Сколько упражнений')).toBeTruthy();
    expect(screen.getByText('два упражнения подряд без паузы')).toBeTruthy();
    expect(screen.getByText('три подряд — плотнее и тяжелее')).toBeTruthy();
    expect(screen.getByText('четыре и больше, круг за кругом')).toBeTruthy();
    expect(screen.getByText('2:00')).toBeTruthy();
    expect(screen.getByText('максимум из значений участников')).toBeTruthy();
    expect(screen.getByText('3 упражнения подряд без паузы, затем отдых 2:00. Так 3 раза.')).toBeTruthy();
    expect(screen.getByText('13 мин')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Собрать связку · 9 подходов' })).toBeTruthy();

    const head = document.querySelector('.sb-superset-create-screen .sb-head');
    const title = document.querySelector('.sb-superset-create-screen .sb-head-title');
    const list = document.querySelector('.sb-superset-create-screen .sb-list');
    const kinds = document.querySelector('.sb-superset-kinds');
    const radios = document.querySelectorAll('.sb-superset-create-screen .sb-radio');
    const selected = document.querySelector('.sb-superset-create-screen .sb-radio.is-on');
    const controls = document.querySelector('.sb-superset-controls');
    const control = document.querySelector('.sb-superset-control');
    const stepper = document.querySelector('.sb-superset-create-screen .sb-stepper');
    const minus = document.querySelector('.sb-superset-create-screen .sb-stepper .sb-btn');
    const plus = document.querySelector('.sb-superset-create-screen .sb-stepper .sb-btn.is-accent');
    const rounds = document.querySelector('.sb-superset-create-screen .sb-stepper b');
    const rest = document.querySelector('.sb-rest-preview');
    const hint = document.querySelector('.sb-control-hint');
    const result = document.querySelector('.sb-superset-result');
    const tiles = document.querySelector('.sb-superset-create-screen .sb-tiles');
    const tile = document.querySelector('.sb-superset-create-screen .sb-tile');
    const approaches = document.querySelector('.sb-superset-create-screen .sb-tile b');
    const finish = document.querySelector('.sb-superset-create-screen .sb-finish');
    const note = document.querySelector('.sb-superset-note');
    const idleNum = document.querySelector('.sb-superset-create-screen .sb-radio:not(.is-on) .sb-ex-num');
    const selectedNum = document.querySelector('.sb-superset-create-screen .sb-radio.is-on .sb-ex-num');
    const selectedHint = document.querySelector('.sb-superset-create-screen .sb-radio.is-on .sb-cat-title span');
    const check = document.querySelector('.sb-radio-check');

    expectStyle(head, {
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px',
    }, '01');
    expectStyle(title, { display: 'flex', flexDirection: 'column', gap: '3px' }, '02');
    expect(title.querySelector('b')?.textContent).toBe('Новая связка');
    expect(document.querySelector('.sb-head-sub')?.textContent).toBe('упражнения подряд, отдых — после круга');
    expectStyle(list, { flex: '1 1 auto', overflowY: 'auto' }, '05');
    expectStyle(kinds, {
      marginBottom: '10px', paddingTop: '2px', paddingRight: '16px', paddingBottom: '1.5px', paddingLeft: '16px',
      borderRadius: '20px', backgroundColor: palette.c1,
    }, '07');
    expectStyle(radios[0], { display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '13.5px', paddingBottom: '13.5px' }, '08');
    expectStyle(idleNum, { color: palette.ink62 }, '10');
    expectStyle(radios[0].querySelector('.sb-cat-title b'), { color: palette.tx }, '11');
    expectStyle(radios[0].querySelector('.sb-cat-title span'), {
      fontSize: '11px', fontWeight: '500', lineHeight: '1.3', color: palette.ink56,
    }, '12');
    expectStyle(selected, {
      borderRadius: '12px', boxShadow: `inset 0 0 0 2px ${palette.acs}`,
    }, '13');
    expectStyle(selectedNum, { backgroundColor: palette.acs, color: palette.onAcs }, '14');
    expectStyle(selectedHint, { color: palette.ac }, '15');
    expectStyle(check, { fontSize: '12px', fontWeight: '700', lineHeight: '1', color: palette.ac }, '16');
    expectStyle(radios[2], { boxShadow: 'none' }, '17');
    expectStyle(controls, { display: 'flex', gap: '8px', marginBottom: '21px' }, '18');
    expectStyle(control, { flex: '1 1 0%', borderRadius: '16px', paddingTop: '12px', backgroundColor: palette.c1 }, '19');
    expectStyle(stepper, { display: 'flex', alignItems: 'center', gap: '7px', marginTop: '8px' }, '20');
    expectStyle(minus, { fontSize: '18px', fontWeight: '700', lineHeight: '1' }, '21');
    expectStyle(rounds, { flex: '1 1 0%', textAlign: 'center', fontSize: '19px', fontWeight: '800', lineHeight: '1', color: palette.tx }, '22');
    expectStyle(plus, { backgroundColor: palette.acs, color: palette.onAcs, fontSize: '18px', fontWeight: '700', lineHeight: '1' }, '23');
    expectStyle(rest, {
      display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px',
      marginTop: '8px', borderRadius: '12px', backgroundColor: palette.bg,
      boxShadow: `inset 0 0 0 1px ${palette.br}`, fontSize: '15px', fontWeight: '700', color: palette.tx,
    }, '24');
    expectStyle(hint, { marginTop: '6px', fontSize: '10px', fontWeight: '500', color: palette.ink56 }, '25');
    expectStyle(result, { paddingTop: '16px', paddingRight: '16px', paddingBottom: '16px', paddingLeft: '16px', borderRadius: '20px', backgroundColor: palette.c1 }, '26');
    expectStyle(document.querySelector('.sb-step-hint'), { fontSize: '12.5px', fontWeight: '600', color: palette.tx }, '27');
    expectStyle(tiles, { display: 'grid', gap: '6px', marginTop: '10px' }, '28');
    expectStyle(tile, {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      paddingTop: '9px', paddingRight: '4px', paddingBottom: '9px', paddingLeft: '4px',
      borderRadius: '12px', backgroundColor: palette.bg,
    }, '29');
    expectStyle(approaches, { fontSize: '16px', fontWeight: '800', color: palette.tx }, '30');
    expectStyle(finish, { marginTop: '12px', minHeight: '48px', borderRadius: '999px', backgroundColor: palette.acs, color: palette.onAcs }, '31');
    expectStyle(note, { marginTop: '12px', fontSize: '11px', fontWeight: '500', lineHeight: '1.55' }, '32');
  });

  it('держит цветовые строки З1 на синем наборе через роли v4', { timeout: 15000 }, () => {
    style = renderTrisetScreen(Cat, 'blue');
    const palette = PALETTES.blue;
    const idleNum = document.querySelector('.sb-superset-create-screen .sb-radio:not(.is-on) .sb-ex-num');
    const selectedHint = document.querySelector('.sb-superset-create-screen .sb-radio.is-on .sb-cat-title span');
    const check = document.querySelector('.sb-radio-check');
    const rest = document.querySelector('.sb-rest-preview');

    expectStyle(idleNum, { color: palette.ink62 }, '10 blue');
    expectStyle(document.querySelector('.sb-superset-create-screen .sb-radio .sb-cat-title b'), { color: palette.tx }, '11 blue');
    expectStyle(document.querySelector('.sb-superset-create-screen .sb-radio:not(.is-on) .sb-cat-title span'), { color: palette.ink56 }, '12 blue');
    expectStyle(document.querySelector('.sb-superset-create-screen .sb-radio.is-on .sb-ex-num'), { backgroundColor: palette.acs, color: palette.onAcs }, '14 blue');
    expectStyle(selectedHint, { color: palette.ac }, '15 blue');
    expectStyle(check, { color: palette.ac }, '16 blue');
    expectStyle(rest, { color: palette.tx, backgroundColor: palette.bg }, '24 blue');
    expect(palette.tx).not.toBe(PALETTES.sand.tx);
    expect(palette.ac).not.toBe(PALETTES.sand.ac);
  });
});
