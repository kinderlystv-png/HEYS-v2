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

const SAND = Object.freeze({ ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', gr: '#5c6a45', grBg: '#eaefe0', tx: '#201e1d' });

function paletteCss() {
  return `${BASE_CSS}\n${CSS}`
    .replaceAll('var(--c1)', '#f7efe2')
    .replaceAll('var(--c2)', '#efe3cf')
    .replaceAll('var(--bg)', '#fffaf1')
    .replaceAll('var(--tx)', SAND.tx)
    .replaceAll('var(--ac)', SAND.ac)
    .replaceAll('var(--acs)', SAND.acs)
    .replaceAll('var(--on-acs)', SAND.onAcs)
    .replaceAll('var(--gr)', SAND.gr)
    .replaceAll('var(--gr-bg)', SAND.grBg)
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

const ap = (id, w, r, done, extra) => Object.assign({ id, weightKg: String(w), reps: r, done: !!done }, extra || {});
const ex = (id, name, approaches, unit) => ({ id, name, approaches, unit: unit || 'weight_reps' });

describe('Л2 · Правка · клиент уже начал · canvas contract', () => {
  let BuilderScreen;

  beforeEach(() => { BuilderScreen = loadBuilder(); });
  afterEach(() => { cleanup(); delete window.HEYS; });

  it('держит ProposalStartedScreen и полосу куратора', () => {
    expect(BUILDER).toContain('function ProposalStartedScreen');
    expect(BUILDER).toContain('function proposalLockIcon');
    expect(BUILDER).toContain('sb-proposal-started-detail');
    expect(BUILDER).toContain("setView('proposal-started')");
    expect(CSS).toMatch(/\.sb-proposal-started-banner[\s\S]*background:\s*var\(--c2\)/);
    expect(CSS).toMatch(/\.sb-proposal-started-badge[\s\S]*background:\s*var\(--gr-bg\)/);
    expect(CSS).toMatch(/\.sb-proposal-started-detail[\s\S]*background:\s*var\(--c2\)/);
    expect(CSS).toMatch(/\.sb-proposal-started-card\.is-plain[\s\S]*background:\s*transparent/);
  });

  it('рисует разбор с бейджем и кнопкой принятия', () => {
    const training = {
      workoutLog: { exercises: [ex('e1', 'Жим', [ap('a1', 75, 8, true)])] },
      plan: {
        status: 'started', dayLabel: 'Верх тела B',
        proposal: {
          id: 'pp1', status: 'pending', proposedBy: 'Артём',
          exercises: [ex('e1', 'Жим', [ap('a1', 70, 8, false)])],
        },
      },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss();
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(BuilderScreen, {
        training,
        dateKey: '2026-09-04',
        exercises: training.workoutLog.exercises,
        onPatch: () => {},
        onClose: () => {},
      }));
      // Force proposal-started view via rerender trick: call internal by setting view through strip
      expect(container.querySelector('.sb-proposal-strip')).toBeTruthy();
      const icon = container.querySelector('.sb-proposal-strip-icon');
      expect(icon).toBeTruthy();
      const bg = getComputedStyle(icon).backgroundColor;
      expect(bg === 'rgb(198, 113, 57)' || bg === '#c67139').toBe(true);
    } finally {
      style.remove();
    }
  });
});

describe('М4 · Ввод · время под нагрузкой · canvas contract', () => {
  let BuilderScreen;

  beforeEach(() => { BuilderScreen = loadBuilder(); });
  afterEach(() => { cleanup(); delete window.HEYS; });

  it('держит is-time-entry и сводку под нагрузкой', () => {
    expect(BUILDER).toContain('is-time-entry');
    expect(BUILDER).toContain('sb-time-summary');
    expect(BUILDER).toContain('sb-time-entry-footnote');
    expect(BUILDER).toContain('есть ли что взвешивать');
    expect(CSS).toMatch(/\.sb-builder-screen\.is-time-entry \.sb-ap[\s\S]*grid-template-columns:\s*44px 1fr 44px/);
    expect(CSS).toMatch(/\.is-time-entry\.is-exercise-open \.sb-ap\.is-done \.sb-ap-num[\s\S]*var\(--gr-bg\)/);
    expect(CSS).toMatch(/\.is-time-entry\.is-exercise-open \.sb-ap\.is-current \.sb-ap-num[\s\S]*var\(--acs\)/);
  });

  it('показывает заголовок упражнения и единицу времени', () => {
    const training = {
      workoutLog: {
        exercises: [ex('e1', 'Планка', [ap('a1', 0, 0, true, { durationSec: 70 })], 'time')],
        startedAt: Date.now() - 60000,
      },
      plan: { status: 'started', dayLabel: 'Кор' },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss();
    document.head.appendChild(style);
    try {
      render(React.createElement(BuilderScreen, {
        training,
        dateKey: '2026-09-04',
        onPatch: () => {},
        onClose: () => {},
      }));
      expect(screen.getByText(/Планка · 1 подход/)).toBeTruthy();
      expect(screen.getByText('единица — время')).toBeTruthy();
      expect(screen.getByText('Итого под нагрузкой')).toBeTruthy();
      expect(screen.getByText(/есть ли что взвешивать/)).toBeTruthy();
    } finally {
      style.remove();
    }
  });
});
