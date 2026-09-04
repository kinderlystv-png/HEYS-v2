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
  bg: '#fffaf1', c1: '#f7efe2', tx: '#201e1d',
  ac: '#8a4a20', ac2: '#a1471c', acs: '#c67139', onAcs: '#2b1608', tint: '#f6e6dd',
  ink56: 'rgba(0, 0, 0, .56)', ink62: 'rgba(0, 0, 0, .62)'
});

const BLUE = Object.freeze({
  ac: '#8a4a20', ac2: '#a1471c', acs: '#c67139', onAcs: '#2b1608', tint: '#f6e6dd', tx: '#201e1d',
  ink56: 'rgba(0, 0, 0, .56)', ink62: 'rgba(0, 0, 0, .62)'
});

function computedCss(palette) {
  return CSS
    .replaceAll('var(--sb-card)', CANVAS.c1)
    .replaceAll('var(--sb-bg)', CANVAS.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-mut)', palette.ink56)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--sb-accTx)', palette.ac2)
    .replaceAll('var(--sb-accbg)', palette.tint)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-br)', '#e2e8f0')
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');
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

function canvasExercise() {
  return {
    name: 'Жим лёжа',
    unit: 'weight_reps',
    approaches: [
      { weightKg: '40', reps: 12, done: true, type: 'warmup' },
      { weightKg: '55', reps: 10, done: true, type: 'warmup' },
      { weightKg: '60', reps: 12, done: true },
      { weightKg: '70', reps: 10, done: true },
      { weightKg: '75', reps: 8, done: true },
      {
        weightKg: '75',
        reps: 8,
        done: true,
        drops: [{ weightKg: '60', reps: 6, done: true }]
      }
    ]
  };
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

describe('Ж3 · дроп-сет · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит каноничные строки и геометрию экрана', () => {
    expect(SUPERSET).toContain('DropSetScreen');
    expect(SUPERSET).toContain('+ Ещё сброс · вес автоматически ниже');
    expect(SUPERSET).toContain('со сбросом');
    expect(SUPERSET).toContain('один подход в счётчике');
    expect(SUPERSET).toContain('Почему не отдельный подход');
    expect(CSS).toMatch(/\.sb-drop-set-screen \.sb-ap\.is-ds-main[\s\S]*box-shadow: inset 0 0 0 2px var\(--sb-acc-strong\)/);
    expect(CSS).toMatch(/\.sb-ds-drop-tag[\s\S]*background: var\(--sb-accbg\)/);
  });

  it('доказывает кадр на песочной и синей палитрах', () => {
    const Parts = loadParts();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${computedCss(CANVAS)}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(Parts.DropSetScreen, {
        ex: canvasExercise(),
        apIdx: 5,
        bodyWeightKg: 80,
        onBack: () => {},
        onOpenSheet: () => {},
        onPatchApproach: () => {},
        onAddDrop: () => {},
        readOnly: true
      }));

      const sandRows = [
        ['04', '.sb-drop-set-screen .sb-head-title > b', 'Жим лёжа · подход 4', { color: CANVAS.tx }],
        ['05', '.sb-drop-set-screen .sb-head-sub', 'до отказа', { color: CANVAS.ink56 }],
        ['09', '.sb-ds-grp .sb-ap.is-ds-main', null, { borderRadius: '12px' }],
        ['10', '.sb-ds-grp .sb-ap.is-ds-main .sb-ap-num.is-work', '4', { backgroundColor: CANVAS.acs, color: CANVAS.bg }],
        ['11', '.sb-ds-grp .sb-ap.is-ds-main .sb-ap-value', '75', { fontSize: '18px' }],
        ['13', '.sb-ds-grp .sb-ds-drop-tag', 'дроп', { backgroundColor: CANVAS.tint, color: CANVAS.ac2 }],
        ['17', '.sb-ds-volume-copy b', 'Подход 4 со сбросом', { color: CANVAS.tx }],
        ['19', '.sb-ds-volume-row > .n', '960 кг', { color: CANVAS.tx }],
        ['24', '.sb-ds-rule-num', '1', { color: CANVAS.ac }],
        ['27', '.sb-ds-why b', 'Почему не отдельный подход', { color: CANVAS.ac2 }]
      ];

      let mismatches = assertRows(sandRows, 'sand');

      style.textContent = `${BASE_CSS}\n${computedCss(BLUE)}`;
      const colorRows = [
        ['10', '.sb-ds-grp .sb-ap.is-ds-main .sb-ap-num.is-work', '4', { backgroundColor: BLUE.acs, color: CANVAS.bg }],
        ['13', '.sb-ds-grp .sb-ds-drop-tag', 'дроп', { backgroundColor: BLUE.tint, color: BLUE.ac2 }],
        ['27', '.sb-ds-why b', 'Почему не отдельный подход', { color: BLUE.ac2 }]
      ];
      mismatches = mismatches.concat(assertRows(colorRows, 'blue'));

      const rules = document.querySelectorAll('.sb-ds-rule-copy').length;
      if (rules !== 7) {
        mismatches.push({ id: 'rules', field: 'count', expected: 7, actual: rules });
      }

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
