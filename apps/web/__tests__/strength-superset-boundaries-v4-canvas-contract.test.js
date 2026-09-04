import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
  gr: '#5c6a45', grBg: '#eaefe0',
  ink56: 'rgba(0, 0, 0, .56)', ink35: 'rgba(0, 0, 0, .35)',
  ink45: 'rgba(0, 0, 0, .45)', ink10: 'rgba(0, 0, 0, .1)',
});

function compileCss() {
  return `${BASE_CSS}\n${CSS
    .replaceAll('var(--sb-card)', CANVAS.c1)
    .replaceAll('var(--sb-bg)', CANVAS.bg)
    .replaceAll('var(--sb-tx)', CANVAS.tx)
    .replaceAll('var(--sb-mut)', CANVAS.ink56)
    .replaceAll('var(--sb-br)', CANVAS.ink10)
    .replaceAll('var(--sb-soft)', CANVAS.c2)
    .replaceAll('var(--sb-acc-strong)', CANVAS.acs)
    .replaceAll('var(--sb-acc)', CANVAS.ac)
    .replaceAll('var(--sb-okbg)', CANVAS.grBg)
    .replaceAll('var(--sb-okTx)', CANVAS.gr)
    .replaceAll('var(--v4-btn-on-act, #fff5ef)', CANVAS.onAcs)
    .replaceAll('var(--ink, 0, 0, 0)', '0, 0, 0')
    .replaceAll('var(--ink)', '0, 0, 0')
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
  ev('strength/heys_strength_proposal_ui_v1.js');
  return window.HEYS.StrengthBuilderParts;
}

function canvasDemo() {
  return {
    who: 'Артём',
    replacements: [{
      key: 'связка не начата',
      beforeLines: ['A1 Подтягивания', 'A2 Тяга блока', '3 раунда'],
      afterLines: ['A1 Тяга блока', 'A2 Тяга гантели', '3 раунда'],
    }],
    frozen: [{
      title: 'Связка A · раунд 2 из 3',
      subtitle: 'состав заморожен до конца',
      badge: 'закрыта',
    }],
  };
}

function expectStyle(node, expected, label) {
  const actual = getComputedStyle(node);
  Object.entries(expected).forEach(([property, value]) => {
    expect(actual[property], `${label} · ${property}`).toBe(value);
  });
}

describe('strength builder · D3 superset boundaries v4 canvas contract', () => {
  let Parts;
  let style;

  beforeEach(() => {
    Parts = loadParts();
    style = document.createElement('style');
    style.textContent = compileCss();
    document.head.appendChild(style);
  });

  afterEach(() => {
    cleanup();
    style?.remove();
    delete window.HEYS;
  });

  it('renders the canvas copy for replacement and frozen blocks', () => {
    const demo = canvasDemo();
    render(React.createElement(Parts.SupersetBoundariesScreen, demo));
    expect(screen.getByText('Артём заменил связку')).toBeTruthy();
    expect(screen.getByText('связка не начата')).toBeTruthy();
    expect(screen.getByText('было')).toBeTruthy();
    expect(screen.getByText('станет')).toBeTruthy();
    expect(screen.getByText(/A1 Подтягивания/)).toBeTruthy();
    expect(screen.getByText(/A2 Тяга гантели/)).toBeTruthy();
    expect(screen.getByText('Связка начата')).toBeTruthy();
    expect(screen.getByText('Связка A · раунд 2 из 3')).toBeTruthy();
    expect(screen.getByText('состав заморожен до конца')).toBeTruthy();
    expect(screen.getByText('закрыта')).toBeTruthy();
  });

  it('keeps the D3 geometry and role colors on sand palette', () => {
    const demo = canvasDemo();
    const { container } = render(React.createElement(Parts.SupersetBoundariesScreen, demo));
    const head = container.querySelector('.sb-ss-bound-head');
    const was = container.querySelector('.sb-ss-bound-col--was');
    const will = container.querySelector('.sb-ss-bound-col--will');
    const arrow = container.querySelector('.sb-ss-bound-arrow');
    const badge = container.querySelector('.sb-ss-bound-badge');
    expect(head).toBeTruthy();
    expectStyle(head, { display: 'flex', flexDirection: 'column', gap: '3px' }, 'row 02 head column');
    expectStyle(was, {
      flex: '1 1 0%', padding: '10px', borderRadius: '12px', backgroundColor: CANVAS.bg,
    }, 'row 08 was column');
    expectStyle(was.querySelector('.sb-ss-bound-label--was'), {
      fontWeight: '700', fontSize: '10px', textTransform: 'uppercase',
      color: CANVAS.ink56,
    }, 'row 09 was label');
    expectStyle(was.querySelector('.sb-ss-bound-lines'), {
      fontWeight: '600', fontSize: '11.5px', lineHeight: '1.5', color: CANVAS.ink56,
    }, 'row 10 was lines');
    expectStyle(arrow, {
      fontWeight: '700', fontSize: '14px', lineHeight: '1', color: CANVAS.ink35,
    }, 'row 11 arrow');
    expectStyle(will, {
      flex: '1 1 0%', padding: '10px', borderRadius: '12px', backgroundColor: CANVAS.c2,
    }, 'row 12 will column');
    expectStyle(will.querySelector('.sb-ss-bound-label--will'), {
      color: CANVAS.ac,
    }, 'row 13 will label');
    expectStyle(will.querySelector('.sb-ss-bound-lines'), {
      color: CANVAS.tx,
    }, 'row 14 will lines');
    expectStyle(badge, {
      backgroundColor: CANVAS.grBg, color: CANVAS.gr,
    }, 'row 21 closed badge');
  });

  it('detects not-started replacement and started frozen composition from plan edit', () => {
    const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });
    const ex = (id, name, approaches, ssGroup) => ({ id, name, approaches, ssGroup: ssGroup || 0 });
    const live = [
      ex('ex1', 'Подтягивания', [ap('a1', 0, 10, false), ap('a2', 0, 8, false)], 1),
      ex('ex2', 'Тяга блока', [ap('a3', 55, 12, false), ap('a4', 55, 12, false)], 1),
      ex('ex3', 'Подтягивания', [ap('b1', 0, 10, true), ap('b2', 0, 8, false), ap('b3', 0, 8, false)], 2),
      ex('ex4', 'Тяга блока', [ap('b4', 55, 12, true), ap('b5', 55, 12, false), ap('b6', 55, 12, false)], 2),
    ];
    const proposed = [
      ex('ex1', 'Тяга блока', [ap('a1', 55, 12, false), ap('a2', 55, 12, false)], 1),
      ex('exN', 'Тяга гантели', [ap('n1', 30, 12, false), ap('n2', 30, 12, false)], 1),
      ex('ex3', 'Подтягивания', [ap('b1', 0, 10, false), ap('b2', 0, 8, false), ap('b3', 0, 8, false)], 2),
      ex('exNew', 'Тяга гантели', [ap('x1', 30, 12, false), ap('x2', 30, 12, false), ap('x3', 30, 12, false)], 2),
    ];
    const boundaries = Parts.describeSupersetBoundaries(live, proposed);
    expect(boundaries.replacements).toHaveLength(1);
    expect(boundaries.replacements[0].beforeLines[0]).toContain('Подтягивания');
    expect(boundaries.replacements[0].afterLines[1]).toContain('Тяга гантели');
    expect(boundaries.frozen).toHaveLength(1);
    expect(boundaries.frozen[0].title).toMatch(/Связка B · раунд 2 из 3/);
  });
});
