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

const ap = (id, extra) => Object.assign({ id, weightKg: '0', reps: 0, done: true }, extra || {});
const ex = (id, name, approaches, unit) => ({ id, name, approaches, unit: unit || 'weight_reps' });

describe('М5 · Ввод · метры · canvas contract', () => {
  let BuilderScreen;

  beforeEach(() => { BuilderScreen = loadBuilder(); });
  afterEach(() => { cleanup(); delete window.HEYS; });

  it('держит is-distance-entry, сводку и колонку «Метры»', () => {
    expect(BUILDER).toContain('is-distance-entry');
    expect(BUILDER).toContain('formatDistanceM');
    expect(BUILDER).toContain('метры не умножаются на килограммы');
    expect(CSS).toMatch(/\.sb-builder-screen\.is-distance-entry \.sb-ap[\s\S]*grid-template-columns:\s*44px 1fr 44px/);
    expect(CSS).toMatch(/\.is-distance-entry\.is-exercise-open \.sb-aps-head > span:nth-child\(3\)::after[\s\S]*content:\s*'Метры'/);
    expect(CSS).toMatch(/\.is-distance-entry\.is-exercise-open \.sb-ap\.is-done \.sb-ap-num[\s\S]*var\(--gr-bg\)/);
    expect(CSS).toMatch(/\.is-distance-entry\.is-exercise-open \.sb-ap\.is-current \.sb-ap-num[\s\S]*var\(--acs\)/);
  });

  it('показывает заголовок упражнения, итог в метрах и сноску', () => {
    const training = {
      workoutLog: {
        exercises: [ex('e1', 'Гребной тренажёр', [
          ap('a1', { distanceM: 500 }),
          ap('a2', { distanceM: 500 }),
          ap('a3', { distanceM: 400 }),
        ], 'distance')],
        startedAt: Date.now() - 60000,
      },
      plan: { status: 'started', dayLabel: 'Кор' },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss();
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(BuilderScreen, {
        training,
        dateKey: '2026-09-04',
        onPatch: () => {},
        onClose: () => {},
      }));
      // Г4 (425403748): в шапке только имя; счёт подходов ушёл из шапки в ключ
      // «подход N из M» по контракту Г4 — прежняя строка была снимком старой шапки.
      expect(screen.getAllByText('Гребной тренажёр').length).toBeGreaterThan(0);
      expect(screen.getByText('единица — метры')).toBeTruthy();
      expect(screen.getByText('Итого')).toBeTruthy();
      expect(screen.getByText('1 400 м')).toBeTruthy();
      expect(screen.getByText(/Метры и время устроены одинаково/)).toBeTruthy();
      expect(container.querySelector('.sb-builder-screen.is-distance-entry.is-exercise-open')).toBeTruthy();
    } finally {
      style.remove();
    }
  });
});
