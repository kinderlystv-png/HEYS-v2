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
  ac: '#8a4a20', ac2: '#a1471c', gr: '#5c6a45', grBg: '#eaefe0',
  acs: '#c67139', onAcs: '#2b1608', tint: '#f6e6dd',
  ink56: 'rgba(0, 0, 0, .56)', ink06: 'rgba(0, 0, 0, .06)', ink42: 'rgba(0, 0, 0, .42)'
});

const BLUE = Object.freeze({
  gr: '#5c6a45', grBg: '#eaefe0', acs: '#c67139', onAcs: '#2b1608',
  ac: '#8a4a20', ac2: '#a1471c', tint: '#f6e6dd', tx: '#201e1d',
  ink56: 'rgba(0, 0, 0, .56)', ink06: 'rgba(0, 0, 0, .06)'
});

function computedCss(palette) {
  return CSS
    .replaceAll('var(--sb-card)', CANVAS.c1)
    .replaceAll('var(--sb-bg)', CANVAS.bg)
    .replaceAll('var(--sb-tx)', palette.tx)
    .replaceAll('var(--sb-mut)', palette.ink56)
    .replaceAll('var(--sb-soft)', CANVAS.c2)
    .replaceAll('var(--sb-acc)', palette.ac)
    .replaceAll('var(--sb-accTx)', palette.ac2)
    .replaceAll('var(--sb-accbg)', palette.tint)
    .replaceAll('var(--sb-acc-strong)', palette.acs)
    .replaceAll('var(--sb-okTx)', palette.gr)
    .replaceAll('var(--sb-okbg)', palette.grBg)
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

describe('Ж2 · типы подходов · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит каноничные строки и геометрию экрана', () => {
    expect(SUPERSET).toContain('ApproachTypesScreen');
    expect(SUPERSET).toContain('Применить');
    expect(SUPERSET).toContain('Рабочий тоннаж');
    expect(SUPERSET).toContain('дроп внутри · разминка нет');
    expect(SUPERSET).toContain('Не всё меряется килограммами');
    expect(SUPERSET).toContain('на сторону:');
    expect(CSS).toMatch(/\.sb-approach-types-screen \.sb-aps-head,\s*\n\.sb-approach-types-screen \.sb-ap,\s*\n\.sb-approach-types-screen \.sb-drop[\s\S]*grid-template-columns: 56px 1fr 1fr 44px;/);
    expect(CSS).toMatch(/\.sb-approach-types-screen \.sb-ap-num\.is-warmup[\s\S]*height: 44px;/);
    expect(CSS).toMatch(/\.sb-at-unit\.is-active[\s\S]*background: var\(--sb-acc-strong\)/);
  });

  it('доказывает кадр на песочной и синей палитрах', () => {
    const Parts = loadParts();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${computedCss(CANVAS)}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(Parts.ApproachTypesScreen, {
        ex: canvasExercise(),
        index: 0,
        bodyWeightKg: 80,
        onBack: () => {},
        onOpenSheet: () => {},
        onPatchApproach: () => {},
        onToggleType: () => {},
        onAddDrop: () => {},
        onAddApproach: () => {},
        onApplyWeight: () => {},
        onOpenDropSet: () => {},
        readOnly: true
      }));

      const sandRows = [
        ['04', '.sb-approach-types-screen .sb-head-title > b', 'Жим лёжа · 4 × 8–12 · 75 кг', { color: CANVAS.tx }],
        ['05', '.sb-approach-types-screen .sb-head-sub', 'дроп вложен в строку', { color: CANVAS.ink56 }],
        ['09', '.sb-at-grp .sb-aps-head', null, { gridTemplateColumns: '56px 1fr 1fr 44px' }],
        ['10', '.sb-at-grp .sb-aps-head > span:nth-child(2)', 'Вес, кг', { textAlign: 'center' }],
        ['11', '.sb-at-grp .sb-aps-head > span:last-child', '✓', { color: CANVAS.gr }],
        ['12', '.sb-at-aps .sb-ap-num.is-warmup', 'разм.', { fontSize: '10px', color: CANVAS.ink56, height: '44px' }],
        ['15', '.sb-at-aps .sb-ap-num.is-work', '1', { backgroundColor: CANVAS.grBg, color: CANVAS.gr }],
        ['17', '.sb-at-aps .sb-at-drop-tag', 'дроп', { backgroundColor: CANVAS.tint, color: CANVAS.ac2 }],
        ['22', '.sb-at-tonnage-copy b', 'Рабочий тоннаж', { color: CANVAS.tx }],
        ['24', '.sb-at-tonnage-row > .n', '2\u00a0980 кг', { color: CANVAS.tx }],
        ['27', '.sb-at-unit.is-active', 'кг × повт', { backgroundColor: CANVAS.acs, color: CANVAS.bg }],
        ['30', '.sb-at-plates b', '75 кг · гриф 20', { color: CANVAS.tx }],
        ['31', '.sb-at-plates span', 'на сторону: 25 + 2,5', { color: CANVAS.ink56 }]
      ];

      let mismatches = assertRows(sandRows, 'sand');

      style.textContent = `${BASE_CSS}\n${computedCss(BLUE)}`;
      const colorRows = [
        ['15', '.sb-at-aps .sb-ap-num.is-work', '1', { backgroundColor: BLUE.grBg, color: BLUE.gr }],
        ['17', '.sb-at-aps .sb-at-drop-tag', 'дроп', { backgroundColor: BLUE.tint, color: BLUE.ac2 }],
        ['27', '.sb-at-unit.is-active', 'кг × повт', { backgroundColor: BLUE.acs, color: CANVAS.bg }]
      ];
      mismatches = mismatches.concat(assertRows(colorRows, 'blue'));

      const composite = [
        document.querySelector('.sb-approach-types-screen .sb-head-title > b')?.textContent || '',
        document.querySelector('.sb-approach-types-screen .sb-head-sub')?.textContent || '',
        document.querySelector('.sb-at-tonnage-row > .n')?.textContent || '',
        document.querySelector('.sb-at-plates span')?.textContent || ''
      ].join(' › ');
      if (!composite.includes('Жим лёжа · 4 × 8–12 · 75 кг › дроп вложен в строку › 2\u00a0980 кг › на сторону: 25 + 2,5')) {
        mismatches.push({ id: 'текст', field: 'composite', expected: 'Ж2 composite', actual: composite });
      }

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
