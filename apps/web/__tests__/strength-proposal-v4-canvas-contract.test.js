import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { loadStrengthModuleSet, readWebFile } from './helpers/strength-canvas-contract-harness.js';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readWebFile(WEB_DIR, 'strength/heys_strength_proposal_ui_v1.js');
const CSS = readWebFile(WEB_DIR, 'styles/modules/750-strength-builder.css');
const ACTIVITY_CSS = readWebFile(WEB_DIR, 'styles/modules/731-ui-v4-activity.css');
const BASE_CSS = readWebFile(WEB_DIR, 'styles/modules/000-base-and-gamification.css');

const SAND = Object.freeze({
  bg: '#fffaf1', tint: '#f6e6dd', tx: '#201e1d', ac: '#8a4a20', ac2: '#a1471c', gr: '#5c6a45',
  grBg: '#eaefe0', ink56: 'rgba(0, 0, 0, 0.56)', ink45: 'rgba(0, 0, 0, 0.45)', bad: '#a83c22',
});
const BLUE = Object.freeze({
  bg: '#eef3fa', tint: '#e2ecf6', tx: '#101826', ac: '#1a6eb2', ac2: '#1d5e96', gr: '#5c6a45',
  grBg: '#eaefe0', ink56: 'rgba(16, 24, 38, 0.56)', ink45: 'rgba(16, 24, 38, 0.45)', bad: '#a8382b',
});

const PALETTE_CSS = {
  sand: null,
  blue: null,
};

function paletteCss(name) {
  if (PALETTE_CSS[name]) return PALETTE_CSS[name];
  const p = name === 'blue' ? BLUE : SAND;
  const inkRgb = name === 'blue' ? '16, 24, 38' : '0, 0, 0';
  PALETTE_CSS[name] = `${BASE_CSS}\n${ACTIVITY_CSS}\n${CSS}`
    .replaceAll('var(--bg)', p.bg)
    .replaceAll('var(--tint)', p.tint)
    .replaceAll('var(--tx)', p.tx)
    .replaceAll('var(--ac)', p.ac)
    .replaceAll('var(--ac2)', p.ac2)
    .replaceAll('var(--gr)', p.gr)
    .replaceAll('var(--gr-bg)', p.grBg)
    .replaceAll('var(--val-bad)', p.bad)
    .replaceAll('var(--c1)', p.tint)
    .replaceAll('var(--c2)', p.tint)
    .replaceAll('var(--ink)', inkRgb)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');
  return PALETTE_CSS[name];
}

function srcBlock(name) {
  const start = SRC.indexOf('function ' + name);
  expect(start, name).toBeGreaterThan(-1);
  const next = SRC.indexOf('\n  function ', start + 1);
  return SRC.slice(start, next > start ? next : start + 4000);
}

loadStrengthModuleSet(WEB_DIR, 'proposal', React);
let sharedParts = globalThis.window.HEYS.StrengthBuilderParts;

function getParts() {
  if (!globalThis.window.HEYS?.TrainingKernel) {
    loadStrengthModuleSet(WEB_DIR, 'proposal', React);
    sharedParts = globalThis.window.HEYS.StrengthBuilderParts;
  }
  return sharedParts;
}

const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });
const ex = (id, name, approaches, ssGroup) => ({ id, name, approaches, ssGroup: ssGroup || 0 });

function startedTraining(proposalExercises) {
  return {
    workoutLog: { exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, true), ap('a2', 75, 8, false)])] },
    planSnapshot: { exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 75, 8, false)])] },
    plan: {
      status: 'started',
      dayLabel: 'Верх тела B',
      proposal: {
        id: 'pp_1', status: 'pending', proposedBy: 'Артём',
        exercises: proposalExercises,
      },
    },
  };
}

describe('strength proposal · canvas contract (proposal UI)', () => {
  let Parts;

  beforeAll(() => { Parts = getParts(); });
  afterEach(() => { cleanup(); });

  it('ProposalCard: signs 22×7 and outcome labels on the right', () => {
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);
    const { container } = render(React.createElement(Parts.ProposalCard, {
      training, onReview: () => {}, onAccept: () => {}, onDecline: () => {},
    }));
    expect(screen.getByText(/Артём поправил сегодняшнюю тренировку/)).toBeTruthy();
    const sign = container.querySelector('.sb-proposal-sign');
    expect(sign).toBeTruthy();
    expect(sign.getAttribute('style')).toMatch(/border-radius:\s*7px/);
    expect(srcBlock('proposalSignEl')).toContain('backgroundColor: tone.backgroundColor');
    expect(SRC).toMatch(/SIGN_STYLE[\s\S]{0,400}backgroundColor: V4\.tint/);
    expect(container.querySelector('.sb-proposal-outcome')).toBeTruthy();
  });

  it('ProposalCard not started: badge and «Принять план»', () => {
    const training = {
      workoutLog: { exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 75, 8, false)])] },
      plan: {
        status: 'assigned', dayLabel: 'Верх тела B',
        proposal: {
          id: 'pp_0', status: 'pending', proposedBy: 'Артём',
          exercises: [ex('exNew', 'Тяга', [ap('n1', 45, 12, false)])],
        },
      },
    };
    render(React.createElement(Parts.ProposalCard, {
      training, onReview: () => {}, onAccept: () => {}, onDecline: () => {},
    }));
    expect(screen.getByText(/Артём поменял план/)).toBeTruthy();
    expect(screen.getByText(/Сегодня по плану · Верх тела B/)).toBeTruthy();
    expect(screen.getByText('Принять план')).toBeTruthy();
  });

  it('ProposalOutcome: D2 copy and v4 warn/ok roles via CSS', () => {
    const training = {
      plan: {
        proposal: {
          status: 'accepted', proposedBy: 'Артём',
          applied: [{ name: 'Жим лёжа · 25 кг', reason: 'approaches_changed' }],
          rejected: [{ name: 'Тяга блока · 60 кг', reason: 'done_approaches_kept' }],
        },
      },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(Parts.ProposalOutcome, { training }));
      expect(screen.getByText(/легла не полностью/)).toBeTruthy();
      expect(screen.getByText(/Эта же строка уйдёт ему/)).toBeTruthy();
      const list = container.querySelector('.sb-proposal-outcome-list');
      expect(list).toBeTruthy();
      expect(getComputedStyle(list).marginTop).toBe('10px');
      const row = container.querySelector('.sb-proposal-outcome-row');
      expect(row).toBeTruthy();
      expect(getComputedStyle(row).display).toBe('flex');
      expect(container.querySelector('.sb-proposal-outcome-row.is-applied .sb-proposal-outcome-mark')?.textContent).toBe('✓');
      expect(container.querySelector('.sb-proposal-outcome-row.is-rejected .sb-proposal-outcome-mark')?.textContent).toBe('—');
      const appliedDetail = container.querySelector('.sb-proposal-outcome-row.is-applied .sb-proposal-outcome-detail');
      const rejectedDetail = container.querySelector('.sb-proposal-outcome-row.is-rejected .sb-proposal-outcome-detail');
      expect(getComputedStyle(appliedDetail).color).toBe(SAND.gr);
      expect(getComputedStyle(rejectedDetail).color).toBe(SAND.ac2);
    } finally {
      style.remove();
    }
    const block = srcBlock('ProposalOutcome');
    expect(block).not.toContain('backgroundColor: V4.tint');
    expect(block).toContain('className: \'sb-proposal-outcome\'');
  });

  it('ProposalOutcome list colors follow palette on blue set', () => {
    const training = {
      plan: {
        proposal: {
          status: 'accepted', proposedBy: 'Артём',
          applied: [{ name: 'Жим лёжа · 25 кг', reason: 'approaches_changed' }],
          rejected: [{ name: 'Тяга блока · 60 кг', reason: 'done_approaches_kept' }],
        },
      },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss('blue');
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(Parts.ProposalOutcome, { training }));
      const appliedDetail = container.querySelector('.sb-proposal-outcome-row.is-applied .sb-proposal-outcome-detail');
      const rejectedDetail = container.querySelector('.sb-proposal-outcome-row.is-rejected .sb-proposal-outcome-detail');
      expect(getComputedStyle(appliedDetail).color).toBe(BLUE.gr);
      expect(getComputedStyle(rejectedDetail).color).toBe(BLUE.ac2);
    } finally {
      style.remove();
    }
  });

  it('ProposalReview: superset boundaries section when composition changes', () => {
    const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });
    const ex = (id, name, approaches, ssGroup) => ({ id, name, approaches, ssGroup: ssGroup || 0 });
    const training = {
      workoutLog: {
        exercises: [
          ex('ex1', 'Подтягивания', [ap('a1', 0, 10, false), ap('a2', 0, 8, false)], 1),
          ex('ex2', 'Тяга блока', [ap('a3', 55, 12, false), ap('a4', 55, 12, false)], 1),
        ],
      },
      plan: {
        status: 'assigned', dayLabel: 'Верх тела B',
        proposal: {
          id: 'pp_b', status: 'pending', proposedBy: 'Артём',
          exercises: [
            ex('ex1', 'Тяга блока', [ap('a1', 55, 12, false), ap('a2', 55, 12, false)], 1),
            ex('exN', 'Тяга гантели', [ap('n1', 30, 12, false), ap('n2', 30, 12, false)], 1),
          ],
        },
      },
    };
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(Parts.ProposalReview, {
        training, onClose: () => {}, onAccept: () => {}, onDecline: () => {},
      }));
      expect(screen.getByText('Связка · границы правки')).toBeTruthy();
      expect(container.querySelector('.sb-proposal-boundaries')).toBeTruthy();
      expect(screen.getByText('было')).toBeTruthy();
      expect(screen.getByText('станет')).toBeTruthy();
    } finally {
      style.remove();
    }
  });

  it('ProgramDoneScreen: hero count 30px on v4 ok-bg', () => {
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(Parts.ProgramDoneScreen, {
        program: { title: 'Верх/низ', weeks: 4, startDate: '2026-07-08' },
        days: [{ date: '2026-07-08', status: 'done' }, { date: '2026-08-05', status: 'done' }],
        sessions: [
          { date: '2026-07-01', exercises: [{ name: 'Жим', approaches: [{ weightKg: '60', reps: 8, done: true }] }] },
          { date: '2026-07-08', exercises: [{ name: 'Жим', approaches: [{ weightKg: '65', reps: 8, done: true }] }] },
          { date: '2026-07-15', exercises: [{ name: 'Жим', approaches: [{ weightKg: '70', reps: 8, done: true }] }] },
        ],
        doneCount: 9, totalCount: 12, skippedCount: 3,
        onClose: () => {}, onWriteCurator: () => {},
      }));
      expect(screen.getByText('9 из 12')).toBeTruthy();
      expect(screen.getByText('Тренировок из назначенных')).toBeTruthy();
      expect(screen.getByText('и вот что за ними стоит')).toBeTruthy();
      expect(screen.getByText('Программа пройдена')).toBeTruthy();
      expect(screen.getByText('цикл закрыт')).toBeTruthy();
      expect(screen.getByText('8 июля — 5 августа')).toBeTruthy();
      const heroCount = container.querySelector('.program-done-hero b');
      expect(getComputedStyle(heroCount).fontSize).toBe('30px');
      const badge = container.querySelector('.program-done-badge');
      expect(getComputedStyle(badge).color).toBe(SAND.gr);
    } finally {
      style.remove();
    }
  });

  it('ProgramDoneScreen: geometry rows 11–24 and growth color on sand+blue', { timeout: 15000 }, () => {
    const props = {
      program: { weeks: 4, startDate: '2026-07-08' },
      days: [{ date: '2026-07-08', status: 'done' }, { date: '2026-08-05', status: 'done' }],
      sessions: [
        { date: '2026-07-01', exercises: [{ name: 'Жим лёжа', approaches: [{ weightKg: '75', reps: 8, done: true }] }] },
        { date: '2026-07-08', exercises: [{ name: 'Жим лёжа', approaches: [{ weightKg: '80', reps: 8, done: true }] }] },
        { date: '2026-07-15', exercises: [{ name: 'Жим лёжа', approaches: [{ weightKg: '85', reps: 8, done: true }] }] },
      ],
      doneCount: 9, totalCount: 12, skippedCount: 3,
      onClose: () => {}, onWriteCurator: () => {},
    };
    for (const palette of ['sand', 'blue']) {
      const style = document.createElement('style');
      style.textContent = paletteCss(palette);
      document.head.appendChild(style);
      try {
        const { container } = render(React.createElement(Parts.ProgramDoneScreen, props));
        const stats = container.querySelector('.program-done-stats');
        expect(getComputedStyle(stats).gap).toBe('8px');
        expect(getComputedStyle(stats).marginTop).toBe('10px');
        const stat = container.querySelector('.program-done-stat');
        expect(getComputedStyle(stat).borderRadius).toBe('14px');
        expect(getComputedStyle(stat).padding).toBe('10px 12px');
        const statLabel = container.querySelector('.program-done-stat-label');
        expect(getComputedStyle(statLabel).fontSize).toBe('9.5px');
        const statVal = container.querySelector('.program-done-stat b');
        expect(getComputedStyle(statVal).fontSize).toBe('19px');
        const tier = container.querySelector('.program-done-tier');
        expect(tier.textContent).toBe('Что выросло');
        expect(getComputedStyle(tier).color).toBe(palette === 'blue' ? BLUE.ac : SAND.ac);
        const growthVal = container.querySelector('.program-done-growth-val');
        expect(getComputedStyle(growthVal).color).toBe(palette === 'blue' ? BLUE.gr : SAND.gr);
        const secondary = container.querySelector('.program-done-secondary');
        expect(getComputedStyle(secondary).marginTop).toBe('9px');
        expect(getComputedStyle(secondary).minHeight).toBe('48px');
        const cta = container.querySelector('.program-done-cta');
        expect(getComputedStyle(cta).marginTop).toBe('10px');
        const note = container.querySelector('.program-done-note');
        expect(getComputedStyle(note).fontSize).toBe('11px');
        expect(getComputedStyle(note).marginTop).toBe('6px');
        cleanup();
      } finally {
        style.remove();
      }
    }
  });

  it('ProgramDoneScreen · текст: составная цепочка кадра Г5', () => {
    render(React.createElement(Parts.ProgramDoneScreen, {
      program: { weeks: 4, startDate: '2026-07-08' },
      days: [{ date: '2026-07-08', status: 'done' }, { date: '2026-08-05', status: 'done' }],
      sessions: [
        { date: '2026-07-01', exercises: [{ name: 'Жим лёжа', approaches: [{ weightKg: '75', reps: 8, done: true }] }] },
        { date: '2026-07-08', exercises: [{ name: 'Жим лёжа', approaches: [{ weightKg: '80', reps: 8, done: true }] }] },
        { date: '2026-07-15', exercises: [{ name: 'Жим лёжа', approaches: [{ weightKg: '85', reps: 8, done: true }] }] },
      ],
      doneCount: 9, totalCount: 12, skippedCount: 3,
      onClose: () => {}, onWriteCurator: () => {},
    }));
    const composite = [
      'Программа пройдена',
      '8 июля — 5 августа',
      'цикл закрыт',
      'Тренировок из назначенных',
      '9 из 12',
      'и вот что за ними стоит',
      'Тоннаж',
      'Рекордов',
      'Недель',
      'Что выросло',
      'Жим лёжа',
      '75 → 85 кг',
      'Показать случай без роста',
      '3 тренировки пропущены — на итог это повлияло мало.',
      'Написать куратору',
      'Куратор уже видит итоги и готовит следующую.',
    ].join(' › ');
    const actual = document.body.textContent.replace(/\s+/g, ' ').trim();
    for (const chunk of composite.split(' › ')) {
      expect(actual).toContain(chunk);
    }
  });

  it('source uses v4 role variables, not legacy hex literals', () => {
    expect(SRC).toContain('var(--v4-warn-text');
    expect(SRC).toContain('var(--v4-ok-text');
    expect(SRC).toContain('var(--v4-tint');
    expect(SRC).not.toMatch(/color:\s*['"]#15803d/);
    expect(SRC).not.toMatch(/color:\s*['"]#b91c1c/);
  });
});

describe('Л10–Л12 · исходы предложения · canvas contract', () => {
  let Parts;

  beforeAll(() => { Parts = getParts(); });
  afterEach(() => { cleanup(); });

  it('держит ProposalOutcomeScreen и CSS кадров Л10–Л12', () => {
    expect(SRC).toContain('function ProposalOutcomeScreen');
    expect(SRC).toContain('План обновлён');
    expect(SRC).toContain('План остался прежним');
    expect(SRC).toContain('Тренировка закрыта');
    expect(SRC).toContain('sb-proposal-resolution');
    expect(CSS).toMatch(/\.sb-proposal-resolution-hero\.is-ok[\s\S]*background:\s*var\(--gr-bg\)/);
    expect(CSS).toMatch(/\.sb-proposal-resolution-weight \.is-new[\s\S]*color:\s*var\(--ac\)/);
    expect(CSS).toMatch(/\.sb-proposal-resolution-btn[\s\S]*min-height:\s*48px/);
  });

  it('рисует Л10 с бейджем «принято» и ярусами frozen/changed', () => {
    const { ks } = { ks: window.HEYS.TrainingKernel.strength };
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);
    const res = ks.acceptPlanProposal(training, 9 * 3600 + 21 * 60 * 1000);
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(Parts.ProposalOutcomeScreen, {
        training: res.training,
        variant: 'accepted',
        onClose: () => {},
        onContinue: () => {},
      }));
      expect(screen.getByText(/План обновлён/)).toBeTruthy();
      expect(container.querySelector('.sb-proposal-resolution-badge')).toBeTruthy();
      expect(container.querySelector('.sb-proposal-resolution-hero.is-ok')).toBeTruthy();
      expect(screen.getByText(/Что (осталось как было|поменялось)/)).toBeTruthy();
    } finally {
      style.remove();
    }
  });

  it('Л10–Л12 · текст: составные цепочки исходов', () => {
    const { ks } = { ks: window.HEYS.TrainingKernel.strength };
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);
    const accepted = ks.acceptPlanProposal(training, 9 * 3600 + 21 * 60 * 1000).training;
    render(React.createElement(Parts.ProposalOutcomeScreen, {
      training: accepted, variant: 'accepted', onClose: () => {}, onContinue: () => {},
    }));
    let actual = document.body.textContent.replace(/\s+/g, ' ').trim();
    [
      'Верх тела B', 'правка принята в', 'принято', 'План обновлён',
      'Продолжить тренировку', 'Исход виден составом',
    ].forEach((chunk) => expect(actual).toContain(chunk));
    cleanup();

    const declined = ks.declinePlanProposal(training, Date.now()).training;
    render(React.createElement(Parts.ProposalOutcomeScreen, {
      training: declined, variant: 'declined', onClose: () => {}, onReview: () => {},
    }));
    actual = document.body.textContent.replace(/\s+/g, ' ').trim();
    [
      'Верх тела B', 'предложение отклонено', 'План остался прежним',
      'Посмотреть, что он предлагал', 'Одна кнопка, и та тихая',
    ].forEach((chunk) => expect(actual).toContain(chunk));
    cleanup();

    const started = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, true), ap('a2', 75, 8, false)])]);
    const expired = ks.expirePlanProposal(started, Date.now());
    render(React.createElement(Parts.ProposalOutcomeScreen, {
      training: expired, variant: 'expired', elapsedSec: 54 * 60 + 30, onClose: () => {},
    }));
    actual = document.body.textContent.replace(/\s+/g, ' ').trim();
    [
      'Тренировка завершена', '54:30', 'Тренировка закрыта',
      'Сделано по прежнему плану', 'не принято',
      'Предложение не блокирует завершение',
    ].forEach((chunk) => expect(actual).toContain(chunk));
  });

  const work = (weight, reps, done) => ({
    weightKg: String(weight), reps, done: !!done,
  });

  function cycleReportTraining() {
    return {
      planSnapshot: {
        exercises: [
          { name: 'Жим лёжа', approaches: [work(70, 8, false), work(70, 8, false), work(70, 8, false), work(70, 8, false)] },
          { name: 'Тяга штанги в наклоне', approaches: [work(60, 10, false), work(60, 10, false), work(60, 10, false), work(60, 10, false)] },
          { name: 'Разведение гантелей', approaches: [work(10, 15, false), work(10, 15, false), work(10, 15, false)] },
          { name: 'Планка', unit: 'time', approaches: [{ durationSec: 60, done: false }, { durationSec: 60, done: false }, { durationSec: 60, done: false }] },
        ],
      },
      workoutLog: {
        exercises: [
          { name: 'Жим лёжа', approaches: [work(75, 8, true), work(75, 8, true), work(75, 8, true), work(75, 8, true)] },
          { name: 'Тяга штанги в наклоне', approaches: [work(60, 10, true), work(60, 10, true), work(60, 10, true), work(60, 10, true)] },
          { name: 'Планка', unit: 'time', approaches: [{ durationSec: 60, done: true }, { durationSec: 60, done: true }, { durationSec: 60, done: true }] },
        ],
      },
    };
  }

  function completedCycleFixture() {
    const program = { weekRange: 'недели 1–2', startDate: '2026-08-01' };
    const days = [
      { date: '2026-08-04', status: 'done', dayLabel: 'Верх тела A', weekIndex: 1 },
      { date: '2026-08-06', status: 'done', dayLabel: 'Низ тела A', weekIndex: 1 },
      { date: '2026-08-08', status: 'done', dayLabel: 'Верх тела B', weekIndex: 1 },
      { date: '2026-08-11', status: 'moved', dayLabel: 'Низ B', weekIndex: 2, movedTo: '2026-08-16' },
      { date: '2026-08-13', status: 'skipped', dayLabel: 'Верх C', weekIndex: 2 },
      { date: '2026-08-16', status: 'done', dayLabel: 'Низ B', weekIndex: 2 },
    ];
    const training = cycleReportTraining();
    const readDay = (dateKey) => (
      dateKey === '2026-08-08'
        ? { trainings: [training] }
        : { trainings: [] }
    );
    return { program, days, readDay, training };
  }

  it('CycleReportScreen · computed: green roles and assigned cell on sand+blue', { timeout: 15000 }, () => {
    const fx = completedCycleFixture();
    const snapshot = Parts.buildCycleReportSnapshot(
      fx.program, fx.days, fx.readDay, { training: fx.training },
    );
    for (const palette of ['sand', 'blue']) {
      const p = palette === 'blue' ? BLUE : SAND;
      const style = document.createElement('style');
      style.textContent = paletteCss(palette);
      document.head.appendChild(style);
      try {
        const { container } = render(React.createElement(Parts.CycleReportScreen, {
          snapshot,
          onClose: () => {},
        }));
        const summaryDot = container.querySelector('.sb-plan-vs-dot.is-summary');
        const progressVal = container.querySelector(
          '.sb-plan-vs-row.is-progress .sb-plan-vs-cell.is-positive .sb-plan-vs-cell-val',
        );
        const assignedCell = container.querySelector('.sb-plan-vs-cell.is-assigned');
        expect(getComputedStyle(summaryDot).backgroundColor).toBe(p.gr);
        expect(getComputedStyle(progressVal).color).toBe(p.gr);
        expect(getComputedStyle(assignedCell).backgroundColor).toBe(p.bg);
        cleanup();
      } finally {
        style.remove();
      }
    }
  });

  it('PeriodReportScreen · computed: outcome tones and debt card on sand+blue', { timeout: 15000 }, () => {
    const fx = completedCycleFixture();
    const snapshot = Parts.buildPeriodReportSnapshot(
      fx.program, fx.days, fx.readDay, { incomplete: true },
    );
    for (const palette of ['sand', 'blue']) {
      const p = palette === 'blue' ? BLUE : SAND;
      const style = document.createElement('style');
      style.textContent = paletteCss(palette);
      document.head.appendChild(style);
      try {
        const { container } = render(React.createElement(Parts.PeriodReportScreen, {
          snapshot,
          onClose: () => {},
        }));
        const okVal = container.querySelector('.sb-period-outcome-val.is-ok');
        const badVal = container.querySelector('.sb-period-outcome-val.is-bad');
        const detail = container.querySelector('.sb-period-outcome-detail');
        const debtTitle = container.querySelector('.sb-period-debt-title');
        const debtCard = container.querySelector('.sb-period-debt-card');
        const label = container.querySelector('.sb-period-outcome-label');
        const normColor = (value) => String(value).replace(/\s+/g, ' ').trim();
        expect(normColor(getComputedStyle(okVal).color)).toBe(p.gr);
        expect(normColor(getComputedStyle(badVal).color)).toBe(p.bad);
        // Строка «вид · отчёт за период»: подробность переноса и пропуска —
        // чернила 45 %, а не 56 %. Проверка сторожила 56 % и тем закрепляла
        // отступление кода от контракта: падала бы на починке, а не на поломке.
        expect(normColor(getComputedStyle(detail).color)).toBe(p.ink45);
        expect(getComputedStyle(debtTitle).color).toBe(p.ac2);
        expect(getComputedStyle(debtCard).backgroundColor).toBe(p.tint);
        expect(getComputedStyle(label).color).toBe(p.tx);
        cleanup();
      } finally {
        style.remove();
      }
    }
  });

  it('CycleReportScreen: completed cycle shows plan-vs-done report shell', () => {
    const fx = completedCycleFixture();
    const snapshot = Parts.buildCycleReportSnapshot(
      fx.program, fx.days, fx.readDay, { training: fx.training },
    );
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    try {
      const { container } = render(React.createElement(Parts.CycleReportScreen, {
        snapshot,
        onClose: () => {},
      }));
      expect(screen.getByLabelText('Закрыть')).toBeTruthy();
      expect(screen.getByText('Отчёт по циклу')).toBeTruthy();
      expect(screen.getByText(/недели 1–2 · \d+ назначено/)).toBeTruthy();
      expect(screen.getByText(/План выполнен на \d+ %/)).toBeTruthy();
      expect(screen.getByText('Жим лёжа')).toBeTruthy();
      expect(screen.getByText('Написать куратору')).toBeTruthy();
      expect(screen.getByText('Отчёт за неделю')).toBeTruthy();
      expect(container.querySelector('.sb-cycle-report.sb-plan-vs-done')).toBeTruthy();
      expect(container.querySelector('.sb-finish-head')).toBeTruthy();
    } finally {
      style.remove();
    }
  });

  it('PeriodReportScreen: incomplete period shows outcomes and debt card', () => {
    const fx = completedCycleFixture();
    const snapshot = Parts.buildPeriodReportSnapshot(
      fx.program, fx.days, fx.readDay, { incomplete: true },
    );
    const style = document.createElement('style');
    style.textContent = paletteCss('sand');
    document.head.appendChild(style);
    try {
      render(React.createElement(Parts.PeriodReportScreen, {
        snapshot,
        onClose: () => {},
      }));
      expect(screen.getByText('Отчёт за период')).toBeTruthy();
      expect(screen.getByText('Сделано как назначено')).toBeTruthy();
      expect(screen.getByText('Перенесено')).toBeTruthy();
      expect(screen.getByText('Пропущено')).toBeTruthy();
      expect(screen.getByText('Своих, вне плана')).toBeTruthy();
      expect(screen.getByText('Пропущенная не считается сделанной')).toBeTruthy();
      expect(screen.getByText(/Отчёт дня и отчёт периода/)).toBeTruthy();
    } finally {
      style.remove();
    }
  });

  it('CycleScreen: «Отчёт по циклу ›» wires navigation callback', () => {
    const fx = completedCycleFixture();
    const onOpenCycleReport = vi.fn();
    const snapshot = Parts.buildProgramCycleSnapshot
      ? Parts.buildProgramCycleSnapshot(fx.program, fx.days, fx.readDay, { today: '2026-08-09' })
      : null;
    render(React.createElement(Parts.CycleScreen, {
      program: fx.program,
      days: fx.days,
      snapshot,
      onClose: () => {},
      onOpenCycleReport,
    }));
    fireEvent.click(screen.getByText('Отчёт по циклу'));
    expect(onOpenCycleReport).toHaveBeenCalledTimes(1);
  });
});
