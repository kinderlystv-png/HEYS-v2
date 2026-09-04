import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '..');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const ACTIVITY_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/731-ui-v4-activity.css'), 'utf8');
const BUILDER_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');

const SAND = Object.freeze({
  bg: '#fffaf1', tx: '#201e1d', gr: '#5c6a45', grBg: '#eaefe0',
  ac2: '#a1471c', tint: '#f6e6dd', acs: '#c67139', onAcs: '#2b1608', bad: '#a83c22'
});
const BLUE = Object.freeze({
  bg: '#eef3fa', tx: '#1a2332', gr: '#4a6b3a', grBg: '#e3ebe0',
  ac2: '#8a3a18', tint: '#f0e4dc', acs: '#3d7cc9', onAcs: '#f5f8fc', bad: '#a8382b'
});

function paletteCss(palette) {
  const p = palette || SAND;
  return [BASE_CSS, BUILDER_CSS, ACTIVITY_CSS].join('\n')
    .replaceAll('var(--bg)', p.bg)
    .replaceAll('var(--tx)', p.tx)
    .replaceAll('var(--gr)', p.gr)
    .replaceAll('var(--gr-bg)', p.grBg)
    .replaceAll('var(--ac2)', p.ac2)
    .replaceAll('var(--tint)', p.tint)
    .replaceAll('var(--acs)', p.acs)
    .replaceAll('var(--on-acs)', p.onAcs)
    .replaceAll('var(--val-bad)', p.bad)
    .replaceAll('var(--ink)', '0, 0, 0')
    .replaceAll('var(--v4-ink-rgb', '0, 0, 0')
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');
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
  return window.HEYS.StrengthBuilderParts;
}

const work = (weight, reps, done) => ({
  weightKg: String(weight), reps, done: !!done
});

function canvasTraining() {
  return {
    plan: { dayLabel: 'пн, 8 авг', weekRange: 'недели 1–2' },
    planSnapshot: {
      exercises: [
        { name: 'Жим лёжа', approaches: [work(70, 8, false), work(70, 8, false), work(70, 8, false), work(70, 8, false)] },
        { name: 'Тяга штанги в наклоне', approaches: [work(60, 10, false), work(60, 10, false), work(60, 10, false), work(60, 10, false)] },
        { name: 'Разведение гантелей', approaches: [work(10, 15, false), work(10, 15, false), work(10, 15, false)] },
        { name: 'Планка', unit: 'time', approaches: [{ durationSec: 60, done: false }, { durationSec: 60, done: false }, { durationSec: 60, done: false }] },
      ]
    },
    workoutLog: {
      exercises: [
        { name: 'Жим лёжа', approaches: [work(75, 8, true), work(75, 8, true), work(75, 8, true), work(75, 8, true)] },
        { name: 'Тяга штанги в наклоне', approaches: [work(60, 10, true), work(60, 10, true), work(60, 10, true), work(60, 10, true)] },
        { name: 'Планка', unit: 'time', approaches: [{ durationSec: 60, done: true }, { durationSec: 60, done: true }, { durationSec: 60, done: true }] },
      ]
    }
  };
}

function styleOf(el, prop) {
  return window.getComputedStyle(el).getPropertyValue(prop).trim();
}

describe('strength builder · Г2 Назначено против сделано', () => {
  let Parts;

  beforeEach(() => {
    Parts = loadParts();
    const style = document.createElement('style');
    style.id = 'plan-vs-done-contract-css';
    style.textContent = paletteCss(SAND);
    document.head.appendChild(style);
  });

  afterEach(() => {
    cleanup();
    document.getElementById('plan-vs-done-contract-css')?.remove();
    delete window.HEYS;
  });

  it('renders contract copy: header, summary, cells, volume, CTA, footnote', () => {
    const { container } = render(React.createElement(Parts.PlanVsDoneScreen, {
      training: canvasTraining(),
      onBack: () => {},
      onClose: () => {}
    }));
    expect(screen.getByText('Назначено против сделано')).toBeTruthy();
    expect(screen.getByText('пн, 8 авг · 4 назначено')).toBeTruthy();
    expect(screen.queryByLabelText('Назад')).toBeNull();
    expect(screen.queryByLabelText('Закрыть')).toBeNull();
    expect(container.querySelector('.sb-plan-vs-top .sb-icon-btn')).toBeNull();
    expect(screen.getByText(/План выполнен на \d+ %/)).toBeTruthy();
    expect(screen.getByText('Жим лёжа')).toBeTruthy();
    expect(screen.getByText('Вес выше плана — это прогресс')).toBeTruthy();
    expect(screen.getAllByText('Как назначено').length).toBeGreaterThan(0);
    expect(screen.getAllByText('пропущено').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Назначено').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Сделано').length).toBeGreaterThan(0);
    expect(screen.getByText(/до 70 кг/)).toBeTruthy();
    expect(screen.getByText('Объём назначенного')).toBeTruthy();
    expect(screen.getByText('Объём сделанного')).toBeTruthy();
    expect(screen.getByText('Написать куратору')).toBeTruthy();
    expect(screen.getByText('Отчёт за неделю')).toBeTruthy();
    expect(screen.getByText(/Перенос и пропуск — разные исходы/)).toBeTruthy();
    expect(container.querySelector('.sb-plan-vs-summary')).toBeTruthy();
    expect(container.querySelector('.sb-plan-vs-row.is-progress')).toBeTruthy();
    expect(container.querySelector('.sb-plan-vs-row.is-skipped')).toBeTruthy();
  });

  it('summary dot and progress cell use green on sand palette', () => {
    const { container } = render(React.createElement(Parts.PlanVsDoneScreen, {
      training: canvasTraining(),
      onBack: () => {},
      onClose: () => {}
    }));
    const summaryDot = container.querySelector('.sb-plan-vs-dot.is-summary');
    const progressVal = container.querySelector('.sb-plan-vs-row.is-progress .sb-plan-vs-cell.is-positive .sb-plan-vs-cell-val');
    expect(summaryDot).toBeTruthy();
    expect(progressVal).toBeTruthy();
    expect(styleOf(summaryDot, 'background-color')).toBe(SAND.gr);
    expect(styleOf(progressVal, 'color')).toBe(SAND.gr);
  });

  it('green roles follow blue palette tokens', () => {
    document.getElementById('plan-vs-done-contract-css').textContent = paletteCss(BLUE);
    const { container } = render(React.createElement(Parts.PlanVsDoneScreen, {
      training: canvasTraining(),
      onBack: () => {},
      onClose: () => {}
    }));
    const summaryDot = container.querySelector('.sb-plan-vs-dot.is-summary');
    expect(styleOf(summaryDot, 'background-color')).toBe(BLUE.gr);
  });

  it('buildPlanVsDoneSnapshot classifies rows and prefers dayLabel in header key', () => {
    const snapshot = Parts.buildPlanVsDoneSnapshot(canvasTraining());
    expect(snapshot.headerKey).toBe('пн, 8 авг · 4 назначено');
    expect(snapshot.rows.find((row) => row.name === 'Жим лёжа').status).toBe('progress');
    expect(snapshot.rows.find((row) => row.name === 'Тяга штанги в наклоне').status).toBe('match');
    expect(snapshot.rows.find((row) => row.name === 'Разведение гантелей').status).toBe('skipped');
    expect(snapshot.percent).toBeGreaterThan(0);
  });
});
