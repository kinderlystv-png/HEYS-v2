import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', ac2: '#a1471c', acs: '#c67139', onAcs: '#2b1608', tint: '#f6e6dd',
  ink56: 'rgba(0, 0, 0, .56)', ink55: 'rgba(0, 0, 0, .55)', ink42: 'rgba(0, 0, 0, .42)',
  ink06: 'rgba(0, 0, 0, .06)', ink58: 'rgba(0, 0, 0, .58)'
});

const BLUE = Object.freeze({
  ac: '#1d5e96', ac2: '#1d5e96', acs: '#2e7cc0', onAcs: '#ffffff', tint: '#e2ecf6',
  tx: '#101826', c1: '#eef3f9', c2: '#e2ecf6', bg: '#ffffff',
  ink56: 'rgba(16, 24, 38, 0.64)', ink55: 'rgba(16, 24, 38, 0.55)', ink42: 'rgba(16, 24, 38, 0.42)',
  ink06: 'rgba(16, 24, 38, 0.06)', ink58: 'rgba(16, 24, 38, 0.58)', br: 'rgba(16, 24, 38, 0.1)'
});

function computedCss(paletteName) {
  const palette = paletteName === 'blue' ? BLUE : CANVAS;
  const inkRgb = paletteName === 'blue' ? '16, 24, 38' : '0, 0, 0';
  return `:root{--v4-ink-rgb:${inkRgb};--v4-ink-prose:${palette.ink56};}\n${CSS
    .replaceAll('var(--sb-card)', palette.c1 || CANVAS.c1)
    .replaceAll('var(--sb-bg)', palette.bg || CANVAS.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-mut)', palette.ink56)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--sb-accTx)', palette.ac2)
    .replaceAll('var(--sb-accbg)', palette.tint)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-soft)', palette.c2 || CANVAS.c2)
    .replaceAll('var(--sb-br)', palette.br || '#e2e8f0')
    .replaceAll('var(--ink)', inkRgb)
    .replaceAll('var(--v4-btn-on-act, #fff5ef)', palette.onAcs)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px')}`;
}

function loadParts() {
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
  return globalThis.HEYS.StrengthBuilderParts;
}

function canvasExercises() {
  const work = (weightKg, reps, done) => ({ weightKg: String(weightKg), reps, done: !!done });
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

function canvasGroup(exercises) {
  const SK = globalThis.HEYS.TrainingKernel.strength;
  const groups = SK.supersetGroups(exercises);
  return groups.filter(function (g) { return g.groupId === 2; })[0];
}

function assertRows(rows, paletteLabel) {
  const mismatches = [];
  const normalizeCss = (value) => String(value == null ? '' : value).replace(/0\.(\d+)/g, '.$1');
  rows.forEach(([id, selector, text, expectedStyle]) => {
    const node = document.querySelector(selector);
    if (!node) {
      mismatches.push({ id, paletteLabel, selector, field: 'selector', expected: 'present', actual: 'missing' });
      return;
    }
    if (text != null && node.textContent !== text) {
      mismatches.push({ id, paletteLabel, selector, field: 'text', expected: text, actual: node.textContent });
    }
    const actualStyle = getComputedStyle(node);
    Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
      if (normalizeCss(actualStyle[property]) !== normalizeCss(expected)) {
        mismatches.push({ id, paletteLabel, selector, field: property, expected, actual: actualStyle[property] });
      }
    });
  });
  return mismatches;
}

describe('З2 · трисет в работе · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит каноничные строки и геометрию экрана', () => {
    expect(SUPERSET).toContain('TriSetWorkScreen');
    expect(SUPERSET).toContain('местами');
    expect(SUPERSET).toContain('разъединить');
    expect(SUPERSET).toContain('общая для связки');
    expect(SUPERSET).toContain('круг закрыт · отдых');
    expect(SUPERSET).toContain('Раунд — строка, а не три карточки');
    expect(CSS).toMatch(/\.sb-tw-round\.is-current[\s\S]*box-shadow: inset 0 0 0 2px var\(--sb-acc-strong\)/);
    expect(CSS).toMatch(/\.sb-tw-member-card[\s\S]*padding: 8px 9px;/);
    expect(CSS).toMatch(/\.sb-tw-warmup-tag[\s\S]*width: 44px;[\s\S]*height: 26px;/);
  });

  it('доказывает кадр на песочной и синей палитрах', () => {
    const Parts = loadParts();
    const exercises = canvasExercises();
    const group = canvasGroup(exercises);
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${computedCss('sand')}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(Parts.TriSetWorkScreen, {
        group,
        exercises,
        muscleLabel: 'плечи',
        onBack: () => {},
        onOpenSheet: () => {},
        onToggleCell: () => {},
        onAddRound: () => {},
        onSwap: () => {},
        onDissolve: () => {},
        readOnly: true
      }));

      const sandRows = [
        ['04', '.sb-triset-work-screen .sb-head-title > b', 'Трисет B · плечи', { color: CANVAS.tx }],
        ['05', '.sb-triset-work-screen .sb-tw-head-key', 'раунд 2 из 3 · 9 подходов', { color: CANVAS.ink56 }],
        ['06', '.sb-tw-badge', 'связка', { color: CANVAS.ac, backgroundColor: CANVAS.c2 }],
        ['10', '.sb-tw-actions .sb-tw-pill.is-accent', 'местами', { backgroundColor: CANVAS.tint, color: CANVAS.ac }],
        ['14', '.sb-tw-member-card i', 'A1', { color: CANVAS.ac }],
        ['16', '.sb-tw-member-card span', 'Жим гантелей', { color: CANVAS.tx }],
        ['18', '.sb-tw-warmup-tag', 'разм.', { backgroundColor: CANVAS.ink06, color: CANVAS.ink56 }],
        ['19', '.sb-tw-warmup-copy', 'общая для связки · 2 подхода', { color: CANVAS.ink56 }],
        ['21', '.sb-tw-grp > .sb-tw-round .sb-tw-round-num', 'Р1', { color: CANVAS.ink56 }],
        ['22', '.sb-tw-grp > .sb-tw-round .sb-tw-cell.is-done', '22 × 10 ✓', { color: CANVAS.ink55 }],
        ['25', '.sb-tw-round-closed', 'круг закрыт · отдых 2:00', { color: CANVAS.ac }],
        ['27', '.sb-tw-round.is-current .sb-tw-round-num', 'Р2', { color: CANVAS.ac }],
        ['28', '.sb-tw-round.is-current .sb-tw-cell.is-active', '10 × 12', { color: CANVAS.tx }],
        ['29', '.sb-tw-grp > .sb-tw-round:last-of-type .sb-tw-cell.is-pending', '20 × 10', { color: CANVAS.ink56 }],
        ['30', '.sb-tw-add-round', '+ Раунд · добавит 3 подхода', { backgroundColor: CANVAS.tint, color: CANVAS.ac }]
      ];

      let mismatches = assertRows(sandRows, 'sand');

      style.textContent = `${BASE_CSS}\n${computedCss('blue')}`;
      const colorRows = [
        ['06', '.sb-tw-badge', 'связка', { color: BLUE.ac, backgroundColor: BLUE.c2 }],
        ['10', '.sb-tw-actions .sb-tw-pill.is-accent', 'местами', { color: BLUE.ac }],
        ['14', '.sb-tw-member-card i', 'A1', { color: BLUE.ac }],
        ['25', '.sb-tw-round-closed', 'круг закрыт · отдых 2:00', { color: BLUE.ac }],
        ['27', '.sb-tw-round.is-current .sb-tw-round-num', 'Р2', { color: BLUE.ac }]
      ];
      mismatches = mismatches.concat(assertRows(colorRows, 'blue'));

      const composite = [
        document.querySelector('.sb-triset-work-screen .sb-head-title > b')?.textContent || '',
        document.querySelector('.sb-tw-head-key')?.textContent || '',
        document.querySelector('.sb-tw-badge')?.textContent || '',
        document.querySelector('.sb-tw-member-card i')?.textContent || '',
        document.querySelector('.sb-tw-round-closed')?.textContent || '',
        document.querySelector('.sb-tw-add-round')?.textContent || ''
      ].join(' › ');
      const expectedComposite = 'Трисет B · плечи › раунд 2 из 3 · 9 подходов › связка › A1 › круг закрыт · отдых 2:00 › + Раунд · добавит 3 подхода';
      if (composite !== expectedComposite) {
        mismatches.push({ id: 'текст', field: 'composite', expected: expectedComposite, actual: composite });
      }

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
