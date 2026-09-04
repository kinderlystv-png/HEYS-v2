import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_proposal_ui_v1.js'), 'utf8');

function srcBlock(name) {
  const start = SRC.indexOf('function ' + name);
  expect(start, name).toBeGreaterThan(-1);
  const next = SRC.indexOf('\n  function ', start + 1);
  return SRC.slice(start, next > start ? next : start + 4000);
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

const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });
const ex = (id, name, approaches, ssGroup) => ({ id, name, approaches, ssGroup: ssGroup || 0 });

function startedTraining(proposalExercises) {
  return {
    workoutLog: { exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, true), ap('a2', 75, 8, false)])] },
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

  beforeEach(() => { Parts = loadParts(); });
  afterEach(() => { cleanup(); delete window.HEYS; });

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

  it('ProposalOutcome: D2 copy and v4 warn/ok roles', () => {
    const training = {
      plan: {
        proposal: {
          status: 'accepted', proposedBy: 'Артём',
          applied: [{ name: 'Жим лёжа · 25 кг', reason: 'approaches_changed' }],
          rejected: [{ name: 'Тяга блока · 60 кг', reason: 'done_approaches_kept' }],
        },
      },
    };
    const { container } = render(React.createElement(Parts.ProposalOutcome, { training }));
    expect(screen.getByText(/легла не полностью/)).toBeTruthy();
    expect(screen.getByText(/Эта же строка уйдёт ему/)).toBeTruthy();
    const title = container.querySelector('.sb-proposal-outcome-title');
    expect(title).toBeTruthy();
    const block = srcBlock('ProposalOutcome');
    expect(block).toContain('color: V4.warnText');
    expect(block).toContain('backgroundColor: V4.tint');
    expect(block).toContain('color: V4.okText');
  });

  it('ProgramDoneScreen: hero count 30px on v4 ok-bg', () => {
    render(React.createElement(Parts.ProgramDoneScreen, {
      program: { title: 'Верх/низ', weeks: 4 },
      sessions: [],
      doneCount: 9, totalCount: 12, skippedCount: 0,
      onClose: () => {}, onWriteCurator: () => {},
    }));
    expect(screen.getByText('9 из 12')).toBeTruthy();
    expect(screen.getByText('Тренировок из назначенных')).toBeTruthy();
    expect(screen.getByText('и вот что за ними стоит')).toBeTruthy();
  });

  it('source uses v4 role variables, not legacy hex literals', () => {
    expect(SRC).toContain('var(--v4-warn-text');
    expect(SRC).toContain('var(--v4-ok-text');
    expect(SRC).toContain('var(--v4-tint');
    expect(SRC).not.toMatch(/color:\s*['"]#15803d/);
    expect(SRC).not.toMatch(/color:\s*['"]#b91c1c/);
  });
});
