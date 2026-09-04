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
  valBad: '#a83c22',
  ink06: 'rgba(0, 0, 0, 0.06)', ink12: 'rgba(0, 0, 0, 0.12)',
  ink24: 'rgba(0, 0, 0, 0.24)', ink50: 'rgba(0, 0, 0, 0.5)'
});

const COMPUTED_CSS = CSS
  .replaceAll('var(--sb-card)', CANVAS.c1)
  .replaceAll('var(--sb-bg)', CANVAS.bg)
  .replaceAll('var(--sb-tx)', CANVAS.tx)
  .replaceAll('var(--sb-mut)', 'rgba(0, 0, 0, .56)')
  .replaceAll('var(--sb-br)', 'rgba(0, 0, 0, .1)')
  .replaceAll('var(--sb-soft)', CANVAS.c2)
  .replaceAll('var(--sb-acc-strong)', CANVAS.acs)
  .replaceAll('var(--sb-accbg)', 'rgba(198, 113, 57, .12)')
  .replaceAll('var(--sb-acc)', CANVAS.ac)
  .replaceAll('var(--sb-okbg)', CANVAS.grBg)
  .replaceAll('var(--sb-okTx)', CANVAS.gr)
  .replaceAll('var(--v4-btn-on-act, #fff5ef)', CANVAS.onAcs)
  .replaceAll('var(--val-bad, var(--v4-bad-text, #a83c22))', CANVAS.valBad)
  .replaceAll('var(--val-bad)', CANVAS.valBad)
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

function lastRule(selector) {
  const re = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*\\})`, 'g');
  let match;
  let last = '';
  while ((match = re.exec(CSS)) !== null) last = match[1];
  return last;
}

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

describe('Е2 · галочка и пустые поля · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит E2-разметку ApproachRow и CSS валидации без модалки', () => {
    expect(SUPERSET).toContain('is-reps-missing');
    expect(SUPERSET).toContain('is-blocked');
    expect(SUPERSET).toContain('ownWeightLabel');
    expect(SUPERSET).toContain('свой вес');
    expect(CSS).toMatch(/\.sb-ap-field\.is-reps-missing[\s\S]*1\.5px var\(--val-bad/);
    expect(CSS).toMatch(/\.sb-ap-check\.is-blocked:not\(\.is-done\)[\s\S]*0\.24/);
    expect(CSS).toMatch(/\.sb-ap-value\.is-bw[\s\S]*12px\/1 Figtree/);
  });

  it('доказывает пустые повторы, свой вес и приглушённую галочку в раскрытой карточке', () => {
    const SB = loadBuilder();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(SB.BuilderScreen, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            title: 'Силовая · грудь, спина, плечи',
            exercises: [{
              name: 'Подтягивания',
              approaches: [
                { weightKg: '', reps: 10, done: true },
                { weightKg: '24', reps: 0, done: false }
              ],
              restSec: 120,
              rpe: 7
            }]
          }
        },
        dateKey: '2022-08-08',
        profile: { weight: 80 },
        historyDetailFor: () => ({ usages: [], record: null }),
        onPatch: vi.fn(),
        onPatchSession: vi.fn(),
        onClose: vi.fn()
      }));

      const bw = document.querySelector('.sb-aps .sb-ap-value.is-bw');
      expect(bw?.textContent).toBe('свой вес');

      const repsField = document.querySelector('.sb-aps > .sb-ap.is-current .sb-ap-field.is-reps-missing');
      expect(repsField).toBeTruthy();
      expect(repsField?.getAttribute('aria-label')).toBe('Повторы');

      const blocked = document.querySelector('.sb-aps > .sb-ap.is-current .sb-ap-check.is-blocked');
      expect(blocked?.disabled).toBe(true);
      expect(blocked?.textContent).toBe('○');
      expect(document.querySelector('[role="dialog"]')).toBeNull();

      const rows = [
        ['12', '.sb-aps > .sb-ap.is-current .sb-ap-field.is-reps-missing', null, {
          boxShadow: `inset 0 0 0 1.5px ${CANVAS.valBad}`
        }],
        ['13', '.sb-aps > .sb-ap.is-current .sb-ap-check.is-blocked', '○', {
          backgroundColor: CANVAS.ink06,
          color: CANVAS.ink24
        }],
        ['16', '.sb-aps .sb-ap-value.is-bw', 'свой вес', {
          fontSize: '12px',
          fontWeight: '600',
          color: CANVAS.ink50
        }]
      ];

      const mismatches = [];
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
          if (actualStyle[property] !== expected) {
            mismatches.push({ id, selector, field: property, expected, actual: actualStyle[property] });
          }
        });
      });
      expect(mismatches).toEqual([]);
    } finally {
      style.remove();
    }
  });
});

describe('Е3 · кольцо отдыха · canvas contract', () => {
  afterEach(() => cleanup());

  it('повторяет контракт кольца: 168px, 38px, дорожка 9px и три пилюли 44', () => {
    expect(BUILDER).toContain("'Кольцо стоит над кнопкой «Завершить», а не поверх списка:");
    expect(SUPERSET).toContain("h('small', null, 'осталось')");
    expect(CSS).toMatch(/\.sb-rest-ring\s*\{[\s\S]*width: 168px/);
    expect(CSS).toMatch(/\.sb-rest-ring\s*\{[\s\S]*height: 168px/);
    expect(CSS).toMatch(/\.sb-rest-value\s*\{[\s\S]*font-size: 38px/);
    expect(CSS).toMatch(/\.sb-rest-value\s*\{[\s\S]*letter-spacing: -0\.03em/);
    expect(lastRule('.sb-rest-value small')).toContain('font-size: 9.5px');
    expect(CSS).toMatch(/\.sb-rest-actions\s*\{[\s\S]*gap: 7px/);
    expect(CSS).toMatch(/\.sb-rest-actions \.sb-rest-add[\s\S]*background: var\(--tint/);
  });

  it('доказывает RestRing с остатком, подписью и действиями', () => {
    const Parts = loadParts();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(Parts.RestRing, {
        secondsLeft: 94,
        total: 120,
        owner: 'связка A',
        source: 'тяжесть 8 → 2:00',
        closedLabel: 'Жим гантелей сидя закрыт',
        contextNextLabel: 'дальше связка A · раунд 1 из 3',
        nextLabel: 'Следующий раунд · A1 подтягивания',
        collapsed: false,
        onSkip: vi.fn(),
        onAdd: vi.fn(),
        onCollapse: vi.fn(),
        onExpand: vi.fn()
      }));

      expect(document.querySelector('.sb-rest-ring svg circle[stroke-width="9"]')).toBeTruthy();
      expect(document.querySelector('.sb-rest-value')?.textContent).toContain('1:34');
      expect(document.querySelector('.sb-rest-value small')?.textContent).toBe('осталось');
      expect(document.querySelector('.sb-rest-meta b')?.textContent).toContain('Отдых · связка A');
      expect(document.querySelector('.sb-rest-next')?.textContent).toBe('Следующий раунд · A1 подтягивания');
      expect(document.querySelector('.sb-rest-add')?.textContent).toBe('+10 секунд');
      expect(document.querySelector('.sb-rest-skip')?.textContent).toBe('пропустить');
      expect(document.querySelector('.sb-rest-collapse')?.textContent).toBe('свернуть');
    } finally {
      style.remove();
    }
  });
});
