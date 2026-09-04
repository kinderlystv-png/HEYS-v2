import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const PALETTES = Object.freeze({
  sand: {
    bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
    ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
    ink56: 'rgba(0, 0, 0, .56)', ink62: 'rgba(0, 0, 0, .62)',
    br: 'rgba(0, 0, 0, 0.1)',
  },
  blue: {
    bg: '#ffffff', c1: '#eef3f9', c2: '#e2ecf6', tx: '#101826',
    ac: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff',
    ink56: 'rgba(16, 24, 38, .56)', ink62: 'rgba(16, 24, 38, .62)',
    br: 'rgba(16, 24, 38, 0.1)',
  },
});

function compileCss(paletteName) {
  const palette = PALETTES[paletteName];
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  return `:root{--v4-ink-rgb:${inkRgb};}\n${CSS
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
  ev('strength/heys_strength_superset_ui_v1.js');
  return window.HEYS.StrengthBuilderParts;
}

function work(weightKg, reps, done) {
  return { weightKg: String(weightKg), reps, done: !!done };
}

function canvasExercises() {
  return [
    {
      name: 'Жим лёжа', ssGroup: 1,
      approaches: [
        work(75, 8, true), work(75, 8, true), work(70, 9, true), work(70, 8, true),
      ],
    },
    {
      name: 'Тяга блока', ssGroup: 1,
      approaches: [
        work(55, 10, true), work(55, 10, true), work(50, 12, true),
      ],
    },
  ];
}

function canvasGroup(exercises) {
  const SK = window.HEYS.TrainingKernel.strength;
  return SK.supersetGroups(exercises).find((g) => g.groupId === 1);
}

function expectStyle(node, expected, label) {
  const actual = getComputedStyle(node);
  Object.entries(expected).forEach(([property, value]) => {
    expect(actual[property], `${label} · ${property}`).toBe(value);
  });
}

function renderFlatBlock(paletteName) {
  const Parts = loadParts();
  const exercises = canvasExercises();
  const group = canvasGroup(exercises);
  const style = document.createElement('style');
  style.textContent = `${BASE_CSS}\n${compileCss(paletteName)}`;
  document.head.appendChild(style);
  render(React.createElement(Parts.SupersetBlock, {
    group,
    exercises,
    dateKey: '2026-07-12',
    onToggleCell: () => {},
    onAddRound: () => {},
    onSwap: () => {},
  }));
  return { style, palette: PALETTES[paletteName] };
}

describe('strength builder · В2 superset flat v4 canvas contract', () => {
  let style;
  let palette;

  afterEach(() => {
    cleanup();
    style?.remove();
    delete window.HEYS;
  });

  it('renders flat SupersetBlock copy from superset_ui', () => {
    expect(SUPERSET).toContain('sb-ss--flat');
    expect(SUPERSET).toContain('flatApproachKey');
    ({ style } = renderFlatBlock('sand'));
    expect(screen.getByText('Связка · 12 июля')).toBeTruthy();
    expect(screen.getByText('4 и 3 подхода')).toBeTruthy();
    expect(screen.getByText('история')).toBeTruthy();
    expect(screen.getByText('Жим лёжа')).toBeTruthy();
    expect(screen.getByText('Тяга блока')).toBeTruthy();
    expect(screen.getByText('4 подхода')).toBeTruthy();
    expect(screen.getByText('3 подхода')).toBeTruthy();
    expect(screen.getAllByText('75 × 8').length).toBeGreaterThan(0);
    expect(screen.getByText('70 × 9')).toBeTruthy();
    expect(screen.getAllByText('55 × 10').length).toBeGreaterThan(0);
    expect(screen.getByText('50 × 12')).toBeTruthy();
    expect(screen.queryByText('Р1')).toBeNull();
    expect(screen.getByText(/Историю не переписываем/)).toBeTruthy();
  });

  it('доказывает построчный computed-style контракт «Связка · старая, без раундов» на песочном наборе', () => {
    ({ style, palette } = renderFlatBlock('sand'));

    const top = document.querySelector('.sb-ss-top');
    const titleCol = document.querySelector('.sb-ss-title-col');
    const badge = document.querySelector('.sb-ss-badge--history');
    const scroll = document.querySelector('.sb-ss-scroll');
    const grp = document.querySelector('.sb-ss-grp');
    const headA = document.querySelector('.sb-ss-flat-head');
    const letter = document.querySelector('.sb-ss-flat-letter');
    const name = document.querySelector('.sb-ss-flat-name');
    const count = document.querySelector('.sb-ss-flat-count');
    const chips = document.querySelector('.sb-ss-flat-chips');
    const chip = document.querySelector('.sb-ss-flat-chip');
    const memberB = document.querySelector('.sb-ss-flat-member--spaced');
    const footnote = document.querySelector('.sb-ss-footnote');

    expectStyle(top, {
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px',
      paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px',
    }, '01');
    expectStyle(titleCol, { display: 'flex', flexDirection: 'column', gap: '3px' }, '02');
    expectStyle(badge, {
      backgroundColor: 'transparent', fontSize: '9px', fontWeight: '700',
      color: palette.ink62,
    }, '05');
    expectStyle(scroll, {
      display: 'flex', flexDirection: 'column',
      paddingTop: '6px', paddingRight: '18px', paddingLeft: '18px',
    }, '06');
    expectStyle(grp, { marginTop: '12px' }, '07');
    expectStyle(headA, { display: 'flex', alignItems: 'center', gap: '8px' }, '08');
    expectStyle(letter, { fontSize: '10.5px', fontWeight: '700', lineHeight: '1', color: palette.ink56 }, '09');
    expectStyle(name, { flex: '1 1 0%', fontSize: '12.5px', fontWeight: '700', lineHeight: '1.2', color: palette.tx }, '10');
    expectStyle(count, { fontSize: '11px', fontWeight: '600', lineHeight: '1', color: palette.ink56 }, '11');
    expectStyle(chips, { display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }, '12');
    expectStyle(chip, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      height: '32px', paddingTop: '0px', paddingRight: '12px', paddingBottom: '0px', paddingLeft: '12px',
      borderRadius: '10px', backgroundColor: palette.bg, color: palette.tx,
    }, '13');
    expect(chip.style.boxShadow || getComputedStyle(chip).boxShadow).toContain('inset');
    expectStyle(memberB, { marginTop: '14px' }, '14');
    expect(footnote.textContent).toMatch(/Историю не переписываем/);
    expectStyle(footnote, { marginTop: '10px', fontSize: '11px', fontWeight: '500', lineHeight: '1.55', color: palette.ink56 }, '15');
  });

  it('держит роли чернил «Связка · старая, без раундов» на синем наборе', () => {
    ({ style, palette } = renderFlatBlock('blue'));
    expectStyle(document.querySelector('.sb-ss-flat-letter'), { color: palette.ink56 }, '09 blue');
    expectStyle(document.querySelector('.sb-ss-flat-name'), { color: palette.tx }, '10 blue');
    expectStyle(document.querySelector('.sb-ss-flat-count'), { color: palette.ink56 }, '11 blue');
    expectStyle(document.querySelector('.sb-ss-flat-chip'), { backgroundColor: palette.bg, color: palette.tx }, '13 blue');
    expectStyle(document.querySelector('.sb-ss-badge--history'), { color: palette.ink62 }, '05 blue');
  });
});
