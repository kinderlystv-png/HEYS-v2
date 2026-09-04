import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', gr: '#5c6a45', grBg: '#eaefe0',
  ink56: 'rgba(0, 0, 0, .56)', ink62: 'rgba(0, 0, 0, .62)'
});

const COMPUTED_CSS = CSS
  .replaceAll('var(--sb-card)', CANVAS.c1)
  .replaceAll('var(--sb-bg)', CANVAS.bg)
  .replaceAll('var(--sb-tx)', CANVAS.tx)
  .replaceAll('var(--sb-mut)', CANVAS.ink56)
  .replaceAll('var(--sb-br)', 'rgba(0, 0, 0, .1)')
  .replaceAll('var(--sb-soft)', CANVAS.c2)
  .replaceAll('var(--sb-acc-strong)', CANVAS.acs)
  .replaceAll('var(--sb-accbg)', 'rgba(198, 113, 57, .12)')
  .replaceAll('var(--sb-acc)', CANVAS.ac)
  .replaceAll('var(--sb-okbg)', CANVAS.grBg)
  .replaceAll('var(--sb-okTx)', CANVAS.gr)
  .replaceAll('var(--v4-btn-on-act, #fff5ef)', CANVAS.onAcs)
  .replaceAll('var(--bg)', CANVAS.bg)
  .replaceAll('var(--c1)', CANVAS.c1)
  .replaceAll('var(--c2)', CANVAS.c2)
  .replaceAll('var(--tx)', CANVAS.tx)
  .replaceAll('var(--ac)', CANVAS.ac)
  .replaceAll('var(--acs)', CANVAS.acs)
  .replaceAll('var(--gr)', CANVAS.gr)
  .replaceAll('var(--gr-bg)', CANVAS.grBg)
  .replaceAll('var(--ink)', '0, 0, 0')
  .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');

function loadBuilder() {
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
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS.StrengthBuilder;
}

describe('Е1 · таблица ввода · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит E1-разметку, пилюли и скрытые контрактные слои', () => {
    expect(SUPERSET).toContain('sb-approach-pills');
    expect(SUPERSET).toContain('sb-context-chips');
    expect(SUPERSET).toContain('sb-rest-cd');
    expect(SUPERSET).toContain('sb-ex-footnote');
    expect(SUPERSET).toContain('Вес и повторы стоят столбцами');
    expect(BUILDER).toContain("view === 'warmup-drop'");
    expect(CSS).toMatch(/\.sb-builder-screen\.is-exercise-open \.sb-approach-pills[\s\S]*display: flex;/);
    expect(CSS).toMatch(/\.sb-builder-screen\.is-exercise-open \.sb-pill\.is-accent[\s\S]*flex: 1;/);
    expect(CSS).toMatch(/\.sb-context-chip[\s\S]*border-radius: 12px;/);
  });

  it('доказывает пилюли и рабочую таблицу в раскрытой карточке', () => {
    const SB = loadBuilder();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      const approaches = [
        { weightKg: '22.5', reps: 12, done: true },
        { weightKg: '24', reps: 10, done: true },
        { weightKg: '24', reps: 10, done: false },
        { weightKg: '24', reps: 10, done: false, type: 'warmup' }
      ];
      render(React.createElement(SB.BuilderScreen, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            title: 'Силовая · грудь, спина, плечи',
            exercises: [{ name: 'Жим гантелей сидя', approaches, restSec: 120, rpe: 7 }]
          }
        },
        dateKey: '2022-08-08',
        profile: { weight: 80 },
        historyDetailFor: () => ({ usages: [{ approaches: [{ weightKg: '22.5', reps: 12, done: true }] }], record: { maxW: 26, maxSet: 208 } }),
        onPatch: vi.fn(),
        onPatchSession: vi.fn(),
        onClose: vi.fn()
      }));

      const pills = document.querySelector('.sb-approach-pills');
      expect(pills).toBeTruthy();
      expect(pills.querySelector('.sb-pill.is-accent')?.textContent).toBe('+ подход');
      expect(pills.querySelector('.sb-pill.sb-pill-time')?.textContent).toBe('2:00');

      const warmups = document.querySelectorAll('.sb-aps .sb-ap-num.is-warmup');
      expect(warmups.length).toBe(0);

      const rows = [
        ['15', '.sb-aps-head > span:nth-child(2)', 'Вес, кг', { textAlign: 'center' }],
        ['30', '.sb-approach-pills .sb-pill.is-accent', '+ подход', { flexGrow: '1', color: CANVAS.ac }],
        ['32', '.sb-approach-pills .sb-pill-time', '2:00', { flexGrow: '0' }]
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

      expect(document.querySelector('.sb-approach-pills .sb-pill:not(.is-accent):not(.sb-pill-time)')?.textContent)
        .toBe('связать');
      expect(document.querySelector('.sb-aps > .sb-ap.is-current .sb-ap-num')?.textContent).toBe('3');

      const footnote = document.querySelector('.sb-ex-footnote');
      expect(footnote?.textContent).toContain('Вес и повторы стоят столбцами');

      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});
