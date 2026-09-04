import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const PALETTES = Object.freeze({
  sand: {
    bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
    ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
    gr: '#5c6a45', grBg: '#eaefe0',
    ink56: 'rgba(0, 0, 0, .56)', ink22: 'rgba(0, 0, 0, .22)',
    br: 'rgba(0, 0, 0, 0.1)',
  },
  blue: {
    bg: '#ffffff', c1: '#eef3f9', c2: '#e2ecf6', tx: '#101826',
    ac: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff',
    gr: '#5c6a45', grBg: '#eaefe0',
    ink56: 'rgba(16, 24, 38, 0.64)', ink22: 'rgba(16, 24, 38, 0.22)',
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
    .replaceAll('var(--sb-okbg)', palette.grBg)
    .replaceAll('var(--sb-okTx)', palette.gr)
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
    .replaceAll('var(--gr)', palette.gr)
    .replaceAll('var(--gr-bg)', palette.grBg)
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

function blankWork() {
  return { weightKg: '', reps: 0, done: false };
}

function warmup(weightKg, reps, done) {
  return { type: 'warmup', weightKg: String(weightKg), reps, done: !!done };
}

function canvasExercises() {
  return [
    {
      name: 'Жим лёжа', ssGroup: 1, restSec: 90,
      approaches: [
        warmup(40, 12, true),
        work(75, 8, true), work(75, 8, true), work(75, 8, false), work(75, 8, false),
      ],
    },
    {
      name: 'Тяга блока', ssGroup: 1, restSec: 120,
      approaches: [
        work(55, 10, true), work(55, 10, true), blankWork(), blankWork(),
      ],
    },
    {
      name: 'Планка', ssGroup: 1, restSec: 60, unit: 'time',
      approaches: [
        { durationSec: 45, done: true },
        { durationSec: 45, done: true },
        blankWork(),
        blankWork(),
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

function renderRoundsBlock(paletteName) {
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

describe('strength builder · В1 superset rounds v4 canvas contract', { timeout: 45_000 }, () => {
  let style;
  let palette;

  afterEach(() => {
    cleanup();
    style?.remove();
    delete window.HEYS;
  });

  it('renders SupersetBlock copy and round structure from superset_ui', () => {
    expect(SUPERSET).toContain('SupersetBlock');
    expect(SUPERSET).toContain('Разминка связки');
    expect(SUPERSET).toContain('Отдых после раунда');
    expect(SUPERSET).toContain('Раунды строятся, только когда подходов у участников равно');
    ({ style } = renderRoundsBlock('sand'));
    expect(screen.getByText('Связка · 3 упражнения')).toBeTruthy();
    expect(screen.getByText('по 4 подхода · 4 раунда')).toBeTruthy();
    expect(screen.getByText('связка')).toBeTruthy();
    expect(screen.getByText('Жим лёжа')).toBeTruthy();
    expect(screen.getByText('Тяга блока')).toBeTruthy();
    expect(screen.getByText('Планка')).toBeTruthy();
    expect(screen.getByText('Р1')).toBeTruthy();
    expect(screen.getByText('Р3')).toBeTruthy();
    expect(screen.getAllByText('75 × 8').length).toBeGreaterThan(0);
    expect(screen.getAllByText('55 × 10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('45 с').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '—' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Разминка связки')).toBeTruthy();
    expect(screen.getByText('одной строкой, вне объёма')).toBeTruthy();
    expect(screen.getByText('2:00')).toBeTruthy();
    expect(screen.getByText(/Раунды строятся, только когда подходов у участников равно/)).toBeTruthy();
  });

  it('доказывает построчный computed-style контракт «Связка · раунды» на песочном наборе', () => {
    ({ style, palette } = renderRoundsBlock('sand'));

    const top = document.querySelector('.sb-ss-top');
    const titleCol = document.querySelector('.sb-ss-title-col');
    const badge = document.querySelector('.sb-ss-badge:not(.sb-ss-badge--history)');
    const scroll = document.querySelector('.sb-ss-scroll');
    const grp = document.querySelector('.sb-ss-grp');
    const memberRow = document.querySelector('.sb-ss-member-row');
    const memberCard = document.querySelector('.sb-ss-member-card');
    const letter = memberCard.querySelector('i');
    const memberName = memberCard.querySelector('span');
    const firstRound = document.querySelector('.sb-round--first');
    const roundNum = firstRound.querySelector('.sb-round-num');
    const spacedRound = document.querySelector('.sb-round--spaced');
    const round3 = screen.getByText('Р3').closest('.sb-round');
    const currentRound = round3.querySelector('.sb-round-num.is-current');
    const currentCell = round3.querySelector('.sb-cell.is-current');
    const cell = round3.querySelector('.sb-cell.is-current:not(.is-blank)');
    const blankCell = document.querySelector('.sb-cell.is-blank');
    const detail = document.querySelector('.sb-ss-detail');
    const detailRow = document.querySelector('.sb-ss-detail-row');
    const detailNote = document.querySelector('.sb-ss-detail-note');
    const detailLast = document.querySelector('.sb-ss-detail-row--last');
    const restValue = document.querySelector('.sb-ss-detail-row--last b');
    const footnote = document.querySelector('.sb-ss-footnote');

    expectStyle(top, {
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px',
      paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px',
    }, '01');
    expectStyle(titleCol, { display: 'flex', flexDirection: 'column', gap: '3px' }, '02');
    expectStyle(badge, {
      backgroundColor: palette.acs, color: palette.onAcs,
      fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
    }, '05');
    expectStyle(scroll, {
      display: 'flex', flexDirection: 'column',
      paddingTop: '6px', paddingRight: '18px', paddingLeft: '18px',
    }, '06');
    expectStyle(grp, { marginTop: '12px' }, '07');
    expectStyle(memberRow, { display: 'flex', gap: '6px' }, '08');
    expectStyle(memberCard, {
      flex: '1 1 0%', flexDirection: 'column', gap: '2px',
      paddingTop: '8px', paddingRight: '9px', paddingBottom: '8px', paddingLeft: '9px',
      borderRadius: '12px', backgroundColor: palette.c2,
    }, '09');
    expectStyle(letter, { fontSize: '10px', fontWeight: '700', lineHeight: '1', color: palette.ac }, '10');
    expectStyle(memberName, { fontSize: '11px', fontWeight: '600', lineHeight: '1.2', color: palette.tx }, '11');
    expectStyle(firstRound, { marginTop: '12px', borderBottomStyle: 'none' }, '12');
    expectStyle(roundNum, {
      flex: '0 0 auto', width: '36px', fontSize: '10.5px', fontWeight: '700',
      lineHeight: '1', textTransform: 'uppercase', color: palette.ink56,
    }, '13');
    expectStyle(cell, {
      flex: '1 1 0%', alignItems: 'center', justifyContent: 'center', minHeight: '44px',
      borderRadius: '999px', backgroundColor: palette.bg, color: palette.tx,
    }, '14');
    expect(cell.style.boxShadow || getComputedStyle(cell).boxShadow).toContain('inset');
    expectStyle(spacedRound, { marginTop: '6px', borderBottomStyle: 'none' }, '15');
    expectStyle(currentRound, { color: palette.ac }, '16');
    expectStyle(currentCell, { boxShadow: `inset 0 0 0 2px ${palette.acs}` }, '17');
    expectStyle(blankCell, {
      flex: '1 1 0%', alignItems: 'center', justifyContent: 'center', minHeight: '44px',
      borderRadius: '999px', borderTopWidth: '1.5px', borderTopStyle: 'dashed',
    }, '18');
    expectStyle(detail, { marginTop: '10px' }, '19');
    expectStyle(detailRow, {
      display: 'flex', justifyContent: 'space-between',
      paddingTop: '13px', paddingBottom: '13px',
    }, '20');
    expectStyle(detailNote, { fontSize: '11px', fontWeight: '600', lineHeight: '1', color: palette.ink56 }, '22');
    expectStyle(detailLast, { borderBottomStyle: 'none' }, '23');
    expectStyle(restValue, { fontSize: '12.5px', fontWeight: '700', lineHeight: '1', color: palette.tx }, '24');
    expect(footnote.textContent).toMatch(/Раунды строятся, только когда подходов у участников равно/);
    expectStyle(footnote, { marginTop: '10px', fontSize: '11px', fontWeight: '500', lineHeight: '1.55', color: palette.ink56 }, '25');
  });

  it('держит роли чернил «Связка · раунды» на синем наборе', () => {
    ({ style, palette } = renderRoundsBlock('blue'));
    expectStyle(document.querySelector('.sb-ss-member-card i'), { color: palette.ac }, '10 blue');
    expectStyle(document.querySelector('.sb-ss-member-card span'), { color: palette.tx }, '11 blue');
    expectStyle(document.querySelector('.sb-round-num.is-current'), { color: palette.ac }, '16 blue');
    expectStyle(document.querySelector('.sb-cell.is-current'), {
      boxShadow: `inset 0 0 0 2px ${palette.acs}`,
    }, '17 blue');
    expectStyle(document.querySelector('.sb-ss-badge:not(.sb-ss-badge--history)'), {
      backgroundColor: palette.acs, color: palette.onAcs,
    }, '05 blue');
  });
});
