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
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', gr: '#5c6a45', grBg: '#eaefe0', tx: '#201e1d', c1: '#f7efe2'
});
const BLUE = Object.freeze({
  ac: '#2a5490', acs: '#3d7cc9', onAcs: '#f5f8fc', gr: '#4a6b3a', grBg: '#e3ebe0', tx: '#1a2332', c1: '#eef3fa'
});

function paletteCss(palette) {
  const p = palette || SAND;
  return `${BASE_CSS}\n${CSS}`
    .replaceAll('var(--c1)', p.c1)
    .replaceAll('var(--c2)', '#efe3cf')
    .replaceAll('var(--bg)', '#fffaf1')
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

const ap = (id, extra) => Object.assign({ id, weightKg: '', reps: 0, done: true }, extra || {});
const ex = (id, name, approaches, extra) => Object.assign({
  id, name, approaches, unit: 'bodyweight', bodyweightFactor: 1.0
}, extra || {});

describe('М6 · Ввод · свой вес с довесом · canvas contract', () => {
  let BuilderScreen;

  beforeEach(() => { BuilderScreen = loadBuilder(); });
  afterEach(() => { cleanup(); delete window.HEYS; });

  it('держит is-bodyweight-entry, колонку «Довес, кг» и сводку', () => {
    expect(BUILDER).toContain('is-bodyweight-entry');
    expect(BUILDER).toContain('bodyweightHeadKey');
    expect(BUILDER).toContain('bodyweightEntrySummary');
    expect(BUILDER).toContain('Прочерк в довесе значит');
    expect(CSS).toMatch(/\.is-bodyweight-entry\.is-exercise-open \.sb-aps-head > span:nth-child\(2\)::after[\s\S]*content:\s*'Довес, кг'/);
    expect(CSS).toMatch(/\.is-bodyweight-entry\.is-exercise-open \.sb-ap\.is-done \.sb-ap-num[\s\S]*var\(--gr-bg\)/);
    expect(CSS).toMatch(/\.is-bodyweight-entry \.sb-ap-value\.is-bw::after[\s\S]*content:\s*'—'/);
    expect(CSS).toMatch(/\.sb-bw-entry-summary[\s\S]*margin-top:\s*10px/);
  });

  it('показывает ключ коэффициента, сводку подходов и сноску', () => {
    const training = {
      workoutLog: {
        exercises: [ex('e1', 'Подтягивания', [
          ap('a1', { reps: 10 }),
          ap('a2', { reps: 9 }),
          ap('a3', { weightKg: '10', extraWeightKg: 10, reps: 7 }),
        ])],
        startedAt: Date.now() - 60000,
      },
      plan: { status: 'started', dayLabel: 'Кор' },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss(SAND);
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(BuilderScreen, {
        training,
        dateKey: '2026-09-04',
        profile: { weight: 78 },
        onPatch: () => {},
        onClose: () => {},
      }));
      expect(screen.getByText(/Подтягивания · 3 подход/)).toBeTruthy();
      expect(screen.getByText('свой вес · коэффициент 1,0')).toBeTruthy();
      expect(screen.getByText('Первые два подхода')).toBeTruthy();
      expect(screen.getByText('78 кг за повтор')).toBeTruthy();
      expect(screen.getByText(/1\s482 кг/)).toBeTruthy();
      expect(screen.getByText('Третий · с довесом')).toBeTruthy();
      expect(screen.getByText('78 + 10 = 88 кг за повтор')).toBeTruthy();
      expect(screen.getByText('616 кг')).toBeTruthy();
      expect(screen.getByText('Упражнение')).toBeTruthy();
      expect(screen.getByText(/2\s098 кг/)).toBeTruthy();
      expect(screen.getByText(/Прочерк в довесе значит/)).toBeTruthy();
      expect(container.querySelector('.sb-builder-screen.is-bodyweight-entry.is-exercise-open')).toBeTruthy();
    } finally {
      style.remove();
    }
  });

  it('сводка и заливки подходов следуют палитре на песочной и синей', () => {
    const training = {
      workoutLog: {
        exercises: [ex('e1', 'Подтягивания', [
          ap('a1', { reps: 10 }),
          ap('a2', { reps: 9 }),
        ])],
        startedAt: Date.now() - 60000,
      },
      plan: { status: 'started' },
    };
    const props = {
      training,
      dateKey: '2026-09-04',
      profile: { weight: 78 },
      onPatch: () => {},
      onClose: () => {},
    };

    const style = document.createElement('style');
    style.textContent = paletteCss(BLUE);
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(BuilderScreen, props));
      const doneNum = container.querySelector('.is-bodyweight-entry .sb-ap.is-done .sb-ap-num');
      const summaryTitle = container.querySelector('.sb-bw-entry-summary-copy b');
      expect(doneNum).toBeTruthy();
      expect(summaryTitle).toBeTruthy();
      expect(getComputedStyle(doneNum).backgroundColor).toBe(BLUE.grBg);
      expect(getComputedStyle(doneNum).color).toBe(BLUE.gr);
      expect(getComputedStyle(summaryTitle).color).toBe(BLUE.tx);
    } finally {
      style.remove();
    }
  });
});
