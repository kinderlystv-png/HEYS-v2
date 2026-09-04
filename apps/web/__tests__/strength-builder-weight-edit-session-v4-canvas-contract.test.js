import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const SAND = Object.freeze({
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', gr: '#5c6a45', grBg: '#eaefe0', tx: '#201e1d', c1: '#f7efe2', bg: '#fffaf1'
});
const BLUE = Object.freeze({
  ac: '#2a5490', acs: '#3d7cc9', onAcs: '#f5f8fc', gr: '#4a6b3a', grBg: '#e3ebe0', tx: '#1a2332', c1: '#eef3fa', bg: '#fffaf1'
});

function paletteCss(palette) {
  const p = palette || SAND;
  return `${BASE_CSS}\n${CSS}`
    .replaceAll('var(--c1)', p.c1)
    .replaceAll('var(--c2)', '#efe3cf')
    .replaceAll('var(--bg)', p.bg)
    .replaceAll('var(--tx)', p.tx)
    .replaceAll('var(--ac)', p.ac)
    .replaceAll('var(--acs)', p.acs)
    .replaceAll('var(--on-acs)', p.onAcs)
    .replaceAll('var(--gr)', p.gr)
    .replaceAll('var(--gr-bg)', p.grBg)
    .replaceAll('var(--ink)', '0, 0, 0');
}

function loadBuilder() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_proposal_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return window.HEYS.StrengthBuilder.BuilderScreen;
}

const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });
const ex = (id, name, approaches, extra) => Object.assign({
  id, name, approaches, unit: 'weight_reps'
}, extra || {});

describe('Г4 · Правка веса в сессии · canvas contract', () => {
  let BuilderScreen;

  beforeEach(() => { BuilderScreen = loadBuilder(); });
  afterEach(() => { cleanup(); delete window.HEYS; });

  it('держит is-weight-entry, ключ подхода и карточку правки', () => {
    expect(BUILDER).toContain('is-weight-entry');
    expect(BUILDER).toContain('exerciseWorkProgressKey');
    expect(BUILDER).toContain('weightEditAuthorship');
    expect(BUILDER).toContain('sb-weight-edit-cd');
    expect(BUILDER).toContain('Правка пришла');
    expect(CSS).toMatch(/\.is-weight-entry\.is-exercise-open \.sb-ap\.is-done \.sb-ap-num[\s\S]*var\(--gr-bg\)/);
    expect(CSS).toMatch(/\.is-weight-entry\.is-exercise-open \.sb-ap\.is-current \.sb-ap-num[\s\S]*var\(--acs\)/);
    expect(CSS).toMatch(/\.sb-authorship-pill[\s\S]*gap:\s*7px/);
    expect(CSS).toMatch(/\.sb-weight-edit-cd[\s\S]*margin-top:\s*10px/);
    expect(CSS).toMatch(/\.is-weight-entry\.is-exercise-open \.sb-ex\.is-open \.sb-ex-body[\s\S]*margin-top:\s*12px/);
    expect(CSS).toMatch(/\.is-weight-entry\.is-exercise-open \.sb-ex\.is-open \.sb-ex-body[\s\S]*border-radius:\s*14px/);
  });

  it('показывает имя, ключ «подход N из M», метку авторства и карточку при живой правке', () => {
    const training = {
      workoutLog: {
        exercises: [ex('ex1', 'Жим гантелей сидя', [
          ap('a1', 60, 10, true),
          ap('a2', 60, 10, true),
          ap('a3', 60, 10, false),
          ap('a4', 60, 10, false),
        ])],
        startedAt: Date.now() - 120000,
      },
      plan: {
        status: 'started',
        proposal: {
          id: 'pp1',
          status: 'pending',
          proposedBy: 'Артём',
          proposedAt: new Date('2026-09-04T19:12:00').getTime(),
          exercises: [ex('ex1', 'Жим гантелей сидя', [
            ap('a1', 60, 10, false),
            ap('a2', 60, 10, false),
            ap('a3', 25, 10, false),
            ap('a4', 25, 10, false),
          ])],
        },
      },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss(SAND);
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(BuilderScreen, {
        training,
        dateKey: '2026-09-04',
        onPatch: () => {},
        onClose: () => {},
      }));
      expect(container.querySelector('.sb-head-title > b').textContent).toBe('Жим гантелей сидя');
      expect(screen.getByText('подход 3 из 4')).toBeTruthy();
      expect(screen.getByText(/Артём поставил 25 кг · 19:12/)).toBeTruthy();
      expect(screen.getByText('Правка пришла')).toBeTruthy();
      expect(screen.getByText('после начала сессии')).toBeTruthy();
      expect(screen.getByText('вес подхода 3')).toBeTruthy();
      expect(container.querySelector('.sb-builder-screen.is-weight-entry.is-exercise-open')).toBeTruthy();
      const doneNum = container.querySelector('.is-weight-entry .sb-ap.is-done .sb-ap-num');
      const currentNum = container.querySelector('.is-weight-entry .sb-ap.is-current .sb-ap-num');
      expect(doneNum).toBeTruthy();
      expect(currentNum).toBeTruthy();
      expect(getComputedStyle(doneNum).backgroundColor).toBe(SAND.grBg);
      expect(getComputedStyle(doneNum).color).toBe(SAND.gr);
      expect(getComputedStyle(currentNum).backgroundColor).toBe(SAND.acs);
      expect(getComputedStyle(currentNum).color).toBe(SAND.onAcs);
    } finally {
      style.remove();
    }
  });

  it('gr/acs на weight_reps следуют палитре на синем наборе', () => {
    const training = {
      workoutLog: {
        exercises: [ex('ex1', 'Жим', [ap('a1', 60, 10, true), ap('a2', 60, 10, false)])],
        startedAt: Date.now() - 60000,
      },
      plan: { status: 'started' },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss(BLUE);
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(BuilderScreen, {
        training,
        dateKey: '2026-09-04',
        onPatch: () => {},
        onClose: () => {},
      }));
      const doneNum = container.querySelector('.is-weight-entry .sb-ap.is-done .sb-ap-num');
      expect(doneNum).toBeTruthy();
      expect(getComputedStyle(doneNum).backgroundColor).toBe(BLUE.grBg);
      expect(getComputedStyle(doneNum).color).toBe(BLUE.gr);
    } finally {
      style.remove();
    }
  });
});
