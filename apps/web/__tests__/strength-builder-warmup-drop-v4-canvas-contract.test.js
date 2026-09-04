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
  ac: '#8a4a20', gr: '#5c6a45', grBg: '#eaefe0',
  ink56: 'rgba(0, 0, 0, .56)'
});

const COMPUTED_CSS = CSS
  .replaceAll('var(--sb-card)', CANVAS.c1)
  .replaceAll('var(--sb-bg)', CANVAS.bg)
  .replaceAll('var(--sb-tx)', CANVAS.tx)
  .replaceAll('var(--sb-mut)', CANVAS.ink56)
  .replaceAll('var(--sb-soft)', CANVAS.c2)
  .replaceAll('var(--sb-acc)', CANVAS.ac)
  .replaceAll('var(--sb-okTx)', CANVAS.gr)
  .replaceAll('var(--sb-accbg)', 'rgba(198, 113, 57, .12)')
  .replaceAll('var(--bg)', CANVAS.bg)
  .replaceAll('var(--c1)', CANVAS.c1)
  .replaceAll('var(--c2)', CANVAS.c2)
  .replaceAll('var(--tx)', CANVAS.tx)
  .replaceAll('var(--ac)', CANVAS.ac)
  .replaceAll('var(--gr)', CANVAS.gr)
  .replaceAll('var(--gr-bg)', CANVAS.grBg)
  .replaceAll('var(--ink)', '0, 0, 0')
  .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');

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
    name: 'Приседания',
    unit: 'weight_reps',
    approaches: [
      { weightKg: '40', reps: 10, done: true, type: 'warmup' },
      { weightKg: '80', reps: 8, done: true },
      { weightKg: '80', reps: 8, done: true },
      { weightKg: '80', reps: 8, done: true },
      { weightKg: '80', reps: 8, done: true },
      { weightKg: '80', reps: 8, done: true },
      {
        weightKg: '80',
        reps: 6,
        done: true,
        drops: [
          { weightKg: '60', reps: 8, done: true },
          { weightKg: '40', reps: 10, done: true }
        ]
      }
    ]
  };
}

describe('А3 · разминка и дроп-сет · canvas contract', { timeout: 45_000 }, () => {
  afterEach(() => cleanup());

  it('держит каноничные строки и геометрию экрана', () => {
    expect(SUPERSET).toContain("'разм.'");
    expect(SUPERSET).toContain('WarmupDropScreen');
    expect(SUPERSET).toContain('Объём упражнения');
    expect(SUPERSET).toContain('Разминка в объём');
    expect(SUPERSET).toContain('Ступени дроп-сета');
    expect(SUPERSET).toContain('не идёт');
    expect(SUPERSET).toContain('идут все');
    expect(CSS).toMatch(/\.sb-warmup-drop-screen \.sb-aps-head,\s*\n\.sb-warmup-drop-screen \.sb-ap,\s*\n\.sb-warmup-drop-screen \.sb-drop[\s\S]*grid-template-columns: 56px 1fr 1fr 44px;/);
    expect(CSS).toMatch(/\.sb-warmup-drop-screen \.sb-drop[\s\S]*padding-left: 34px;/);
    expect(CSS).toMatch(/\.sb-wd-drop-tag[\s\S]*background: var\(--sb-soft\)/);
  });

  it('доказывает numbered rows и составную строку кадра', () => {
    const Parts = loadParts();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(Parts.WarmupDropScreen, {
        ex: canvasExercise(),
        index: 0,
        exercises: [canvasExercise()],
        bodyWeightKg: 80,
        onBack: () => {},
        onOpenSheet: () => {},
        onPatchApproach: () => {},
        onToggleType: () => {},
        onAddDrop: () => {},
        onAddApproach: () => {},
        readOnly: true
      }));

      const rows = [
        ['02', '.sb-warmup-drop-screen > .sb-head > .sb-icon-btn:first-child', '✕', {
          width: '36px', height: '36px', backgroundColor: CANVAS.c1
        }],
        ['04', '.sb-warmup-drop-screen .sb-head-title > b', 'Приседания', { color: CANVAS.tx }],
        ['05', '.sb-warmup-drop-screen .sb-head-sub', '7 подходов · 1 разминочный', { color: CANVAS.ink56 }],
        ['09', '.sb-wd-grp .sb-aps-head', null, { gridTemplateColumns: '56px 1fr 1fr 44px' }],
        ['10', '.sb-wd-grp .sb-aps-head > span:nth-child(2)', 'Вес, кг', { textAlign: 'center' }],
        ['12', '.sb-wd-aps .sb-ap-num.is-warmup', 'разм.', { fontSize: '10px', color: CANVAS.ink56 }],
        ['15', '.sb-wd-aps .sb-wd-drop-tag', 'дроп', { backgroundColor: CANVAS.c2, color: CANVAS.ac }],
        ['19', '.sb-wd-volume-row:first-child > span', 'Объём упражнения', { color: CANVAS.tx }],
        ['21', '.sb-wd-volume-row:nth-child(2) .sb-wd-muted', 'не идёт', { color: CANVAS.ink56 }],
        ['23', '.sb-wd-volume-row.is-last .sb-wd-ok', 'идут все', { color: CANVAS.gr }]
      ];

      const mismatches = [];
      const normalizeCss = (value) => String(value == null ? '' : value).replace(/0\.(\d+)/g, '.$1');
      rows.forEach(([id, selector, text, expectedStyle]) => {
        const node = document.querySelector(selector);
        if (!node) {
          mismatches.push({ id, selector, field: 'selector', expected: 'present', actual: 'missing' });
          return;
        }
        if (text != null && node.textContent !== text) {
          mismatches.push({ id, selector, field: 'text', expected: text, actual: node.textContent });
        }
        const actualStyle = getComputedStyle(node);
        Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
          if (normalizeCss(actualStyle[property]) !== normalizeCss(expected)) {
            mismatches.push({ id, selector, field: property, expected, actual: actualStyle[property] });
          }
        });
      });

      const composite = [
        document.querySelector('.sb-warmup-drop-screen .sb-head-title > b')?.textContent || '',
        document.querySelector('.sb-warmup-drop-screen .sb-head-sub')?.textContent || '',
        document.querySelector('.sb-wd-aps-head > span:first-child')?.textContent || '',
        document.querySelector('.sb-wd-aps .sb-ap-num.is-warmup')?.textContent || '',
        document.querySelector('.sb-wd-aps .sb-wd-drop-tag')?.textContent || '',
        document.querySelector('.sb-wd-volume-row:first-child > span')?.textContent || '',
        document.querySelector('.sb-wd-volume-row:first-child > b')?.textContent || '',
        document.querySelector('.sb-wd-footnote')?.textContent?.slice(0, 40) || ''
      ].join(' › ');
      if (!composite.includes('Приседания › 7 подходов · 1 разминочный › № / тип › разм. › дроп › Объём упражнения')) {
        mismatches.push({ id: 'текст', field: 'composite', expected: 'A3 composite prefix', actual: composite });
      }

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
