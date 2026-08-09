// strength-proposal-ui.test.js — правка куратора глазами клиента.
//
// Хэндофф «Правка куратора после старта» (2026-08-09), экраны 14a/14c/15b.
// Разбор «что ляжет» покрыт в kernel-plan-edit.test.js; здесь — ответ клиента
// (взял / остался на прежнем / закрыл не ответив) и то, как правка называется
// человеку на экране.

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(__dirname, '..');
const originalHEYS = window.HEYS;

function loadAll() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    /* eslint-disable-next-line no-eval */
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_proposal_ui_v1.js');
  return {
    ks: window.HEYS.TrainingKernel.strength,
    Parts: window.HEYS.StrengthBuilderParts,
  };
}

const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });
const ex = (id, name, approaches, ssGroup) => ({ id, name, approaches, ssGroup: ssGroup || 0 });

/** План начат: первый подход жима закрыт, второй нет. */
function startedTraining(proposalExercises, extra) {
  return {
    id: 'tr_1',
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { version: 1, exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, true), ap('a2', 75, 8, false)])] },
    planSnapshot: { exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 75, 8, false)])] },
    plan: Object.assign({
      id: 'pl_1',
      status: 'started',
      assignedBy: 'Артём',
      dayLabel: 'Верх тела B',
      proposal: {
        id: 'pp_1',
        status: 'pending',
        proposedBy: 'Артём',
        exercises: proposalExercises,
      },
    }, extra || {}),
  };
}

describe('правка куратора: ответ клиента', () => {
  beforeEach(() => { loadAll(); });
  afterEach(() => { cleanup(); window.HEYS = originalHEYS; });

  it('взял правку: сделанное на месте, снимок задания обновлён, прежний в истории', () => {
    const { ks } = loadAll();
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);

    const res = ks.acceptPlanProposal(training, 5000);
    expect(res.ok).toBe(true);
    const aps = res.training.workoutLog.exercises[0].approaches;
    expect(aps[0]).toMatchObject({ weightKg: '75', done: true });
    expect(aps[1].weightKg).toBe('60');
    // Снимок стал согласованным планом, прежний уехал в историю — иначе отчёт
    // куратору покажет отклонение от плана, который обе стороны уже отменили.
    expect(res.training.planSnapshot.exercises[0].approaches[1].weightKg).toBe('60');
    expect(res.training.planSnapshot.previous).toHaveLength(1);
    expect(res.training.plan.proposal.status).toBe('accepted');
  });

  it('снимок не делит ссылку с предложением — иначе он не доезжает на диск', () => {
    // Регресс из живой проверки 2026-08-09: сериализация дня вырезает второе
    // вхождение одного и того же объекта (защита от циклов). Снимок и
    // предложение ссылались на один массив, и на диск уезжал только один из
    // них — второй молча оказывался пустым. В памяти дефект не виден вовсе,
    // поэтому проверяем именно через сериализацию.
    const { ks } = loadAll();
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);

    const res = ks.acceptPlanProposal(training, 5000);
    expect(res.training.planSnapshot.exercises).not.toBe(res.training.plan.proposal.exercises);

    const roundTrip = JSON.parse(JSON.stringify(res.training));
    expect(roundTrip.planSnapshot.exercises).toHaveLength(1);
    expect(roundTrip.plan.proposal.exercises).toHaveLength(1);
  });

  it('остался на прежнем: тренировка не меняется вовсе', () => {
    const { ks } = loadAll();
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);

    const res = ks.declinePlanProposal(training, 5000);
    expect(res.ok).toBe(true);
    expect(res.training.workoutLog).toEqual(training.workoutLog);
    expect(res.training.planSnapshot).toEqual(training.planSnapshot);
    expect(res.training.plan.proposal.status).toBe('declined');
  });

  it('закрыл тренировку, не ответив: предложение гаснет само и не блокирует', () => {
    const { ks } = loadAll();
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false)])]);

    const next = ks.expirePlanProposal(training, 9000);
    expect(next.plan.proposal.status).toBe('expired');
    expect(ks.pendingPlanProposal(next)).toBeNull();
    expect(next.workoutLog).toEqual(training.workoutLog);
  });

  it('отвеченное предложение второй раз не применяется', () => {
    const { ks } = loadAll();
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);
    const once = ks.acceptPlanProposal(training, 5000);
    const twice = ks.acceptPlanProposal(once.training, 6000);
    expect(twice.ok).toBe(false);
  });

  it('чужое упражнение между участниками связки её не разрывает', () => {
    const { ks } = loadAll();
    const training = {
      workoutLog: {
        exercises: [
          ex('ex1', 'Подтягивания', [ap('a1', 0, 10, true)], 1),
          ex('ex2', 'Тяга блока', [ap('a2', 55, 12, true)], 1),
        ],
      },
      plan: {
        status: 'started',
        proposal: {
          id: 'pp_x', status: 'pending', proposedBy: 'Артём',
          // Куратор вклинил планку между участниками начатой связки.
          exercises: [
            ex('ex1', 'Подтягивания', [ap('a1', 0, 10, false)], 1),
            ex('exZ', 'Планка', [ap('z1', 0, 60, false)]),
            ex('ex2', 'Тяга блока', [ap('a2', 55, 12, false)], 1),
          ],
        },
      },
    };
    const res = ks.acceptPlanProposal(training, 5000);
    // Связка обрабатывается блоком целиком, поэтому участники остаются
    // подряд, а планка встаёт рядом — раунды продолжают сходиться.
    expect(res.ok).toBe(true);
    const names = res.training.workoutLog.exercises.map((e) => e.name);
    expect(names.indexOf('Тяга блока')).toBe(names.indexOf('Подтягивания') + 1);
    expect(names).toContain('Планка');
    expect(ks.validateSupersetLayout(res.training.workoutLog.exercises).ok).toBe(true);
  });
});

describe('правка куратора: как она названа человеку', () => {
  beforeEach(() => { loadAll(); });
  afterEach(() => { cleanup(); window.HEYS = originalHEYS; });

  it('разбор делит на «останется как есть» и «впереди»', () => {
    const { Parts } = loadAll();
    const live = [
      ex('ex1', 'Жим', [ap('a1', 75, 8, true), ap('a2', 75, 8, false)]),
      ex('ex2', 'Планка', [ap('a3', 0, 60, false)]),
    ];
    const proposed = [
      ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)]),
      ex('exNew', 'Тяга к груди', [ap('n1', 45, 12, false)]),
    ];

    const diff = Parts.describePlanEdit(live, proposed);
    expect(diff.frozen.map((f) => f.name)).toEqual(['Жим']);
    expect(diff.frozen[0].summary).toBe('1 из 2');
    const kinds = diff.ahead.reduce((acc, r) => Object.assign(acc, { [r.name]: r.kind }), {});
    expect(kinds['Тяга к груди']).toBe('added');
    expect(kinds['Планка']).toBe('removed');
  });

  it('правка веса в НАЧАТОМ упражнении видна человеку — главный сценарий живой правки', () => {
    // Регресс из живой проверки 2026-08-09: раскладка относила начатое
    // упражнение целиком в «останется как есть», и сбавленный куратором вес в
    // незакрытых подходах пропадал с экрана вовсе. Клиент видел «куратор
    // ничего не сделал» ровно в том случае, ради которого правка и нужна.
    const { Parts } = loadAll();
    const live = [ex('ex1', 'Тяга штанги', [
      ap('a1', 60, 10, true), ap('a2', 60, 10, false), ap('a3', 60, 10, false),
    ])];
    const proposed = [ex('ex1', 'Тяга штанги', [
      ap('a1', 60, 10, false), ap('a2', 50, 12, false), ap('a3', 50, 12, false),
    ])];

    const diff = Parts.describePlanEdit(live, proposed);
    const row = diff.ahead.find((r) => r.name === 'Тяга штанги');
    expect(row).toBeTruthy();
    expect(row.kind).toBe('changed');
    expect(row.before).toContain('60 кг');
    expect(row.after).toContain('50 кг');
    // И одновременно оно же в «останется как есть» — сделанный подход под замком.
    expect(diff.frozen.map((f) => f.name)).toContain('Тяга штанги');
  });

  it('карточка на дне обещает, что сделанное не тронется, и ведёт в разбор', () => {
    const { Parts } = loadAll();
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);
    let reviewed = false;

    render(React.createElement(Parts.ProposalCard, {
      training,
      onReview: () => { reviewed = true; },
      onDecline: () => {},
    }));

    expect(screen.getByText(/Артём поменял план/)).toBeTruthy();
    expect(screen.getByText(/Сделанное не тронется/)).toBeTruthy();
    fireEvent.click(screen.getByText('Посмотреть, что изменилось'));
    expect(reviewed).toBe(true);
  });

  it('разбор показывает замок над сделанным раньше, чем кнопку ответа', () => {
    const { Parts } = loadAll();
    const training = startedTraining([ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])]);

    const { container } = render(React.createElement(Parts.ProposalReview, {
      training,
      onClose: () => {}, onAccept: () => {}, onDecline: () => {},
    }));

    const frozen = container.querySelector('.sb-proposal-frozen');
    const foot = container.querySelector('.sb-proposal-foot');
    expect(frozen).toBeTruthy();
    expect(foot).toBeTruthy();
    // Обещание «твою работу не тронут» обязано стоять до вопроса «берёшь ли».
    expect(frozen.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('итог закрытой тренировки называет упражнение, на которое правка не легла', () => {
    const { Parts } = loadAll();
    const training = {
      plan: {
        proposal: {
          status: 'accepted',
          proposedBy: 'Артём',
          applied: [{ name: 'Присед', reason: 'approaches_changed' }],
          rejected: [{ name: 'Разведение', reason: 'started_cannot_remove' }],
        },
      },
    };

    render(React.createElement(Parts.ProposalOutcome, { training }));
    expect(screen.getByText(/легла не полностью/)).toBeTruthy();
    expect(screen.getByText('Разведение')).toBeTruthy();
    expect(screen.getByText(/убирал, но ты уже начал/)).toBeTruthy();
  });

  it('когда всё легло, строки «легла не полностью» нет', () => {
    const { Parts } = loadAll();
    const { container } = render(React.createElement(Parts.ProposalOutcome, {
      training: { plan: { proposal: { status: 'accepted', applied: [{ name: 'Присед' }], rejected: [] } } },
    }));
    expect(container.innerHTML).toBe('');
  });
});
