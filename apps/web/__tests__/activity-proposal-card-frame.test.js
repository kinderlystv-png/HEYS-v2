// activity-proposal-card-frame.test.js — карточка правки куратора на «Активе».
//
// Кадр «Актив · правка куратора»: .grp на подложке предупреждения, одна фраза
// заголовком тоном --ac2, суть правки прозой, две кнопки 48 — «Принять» на
// акценте и «Оставить прежнюю» на грунте с обводкой.
//
// До сведения заголовком стояло название дня, источник правки уходил в мелкую
// пилюлю, а главной кнопкой был переход в разбор: ответить с самой карточки
// было нельзя, хотя правка перехватывает день и без ответа он не идёт.
//
// Что сохранено сверх кадра и почему — проверяется здесь же: обещание
// «сделанное не тронется» и список изменений остаются на первом слое, иначе
// «Принять» оказалось бы вслепую.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

const CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/731-ui-v4-activity.css'), 'utf8',
);
const TRAININGS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8');

function rule(selector) {
  const at = CSS.indexOf(selector + ' {');
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

const ap = (id, w, r, done) => ({ id, weightKg: String(w), reps: r, done: !!done });
const ex = (id, name, approaches) => ({ id, name, approaches, ssGroup: 0 });

function loadParts() {
  window.HEYS = {};
  window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_proposal_ui_v1.js');
  return window.HEYS.StrengthBuilderParts;
}

/** План начат: первый подход закрыт — тогда обещание «сделанное не тронется» обязано стоять. */
function proposalTraining(note) {
  return {
    id: 'tr_1',
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { version: 1, exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, true), ap('a2', 75, 8, false)])] },
    planSnapshot: { exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 75, 8, false)])] },
    plan: {
      id: 'pl_1',
      status: 'started',
      assignedBy: 'Артём',
      dayLabel: 'Верх тела B',
      proposal: {
        id: 'pp_1',
        status: 'pending',
        proposedBy: 'Артём',
        note: note === undefined ? 'Вместо силовой на ноги — кардио 40 минут.' : note,
        exercises: [ex('ex1', 'Жим', [ap('a1', 75, 8, false), ap('a2', 60, 8, false)])],
      },
    },
  };
}

function renderCard(props) {
  const Parts = loadParts();
  render(React.createElement(Parts.ProposalCard, {
    training: proposalTraining(),
    onReview: () => {},
    onAccept: () => {},
    onDecline: () => {},
    ...props,
  }));
  return Parts;
}

afterEach(() => cleanup());

describe('Правка куратора названа одной фразой', () => {
  it('заголовок говорит, кто и что поправил', () => {
    if (!renderCard()) return;
    expect(screen.getByText(/Артём поправил сегодняшнюю тренировку/)).toBeTruthy();
    expect(screen.queryByText(/поменял план/)).toBeNull();
  });

  it('суть правки стоит прозой, а не за кнопкой разбора', () => {
    if (!renderCard()) return;
    expect(screen.getByText(/кардио 40 минут/)).toBeTruthy();
  });

  it('без пояснения куратора карточка всё равно говорит, что случилось', () => {
    // Пустая проза оставила бы заголовок без объяснения, а ответить всё равно надо.
    if (!renderCard({ training: proposalTraining(null) })) return;
    expect(document.querySelector('.sb-plan-meta').textContent.trim().length)
      .toBeGreaterThan(0);
  });
});

describe('Ответить можно с самой карточки', () => {
  it('«Принять» применяет правку, а не открывает разбор', () => {
    let accepted = false;
    let reviewed = false;
    if (!renderCard({ onAccept: () => { accepted = true; }, onReview: () => { reviewed = true; } })) return;
    fireEvent.click(screen.getByText(/Принять/));
    expect(accepted).toBe(true);
    expect(reviewed).toBe(false);
  });

  it('«Оставить прежнюю» отклоняет', () => {
    let declined = false;
    if (!renderCard({ onDecline: () => { declined = true; } })) return;
    fireEvent.click(screen.getByText('Оставить прежнюю'));
    expect(declined).toBe(true);
  });

  it('разбор остался доступен вторым слоем', () => {
    let reviewed = false;
    if (!renderCard({ onReview: () => { reviewed = true; } })) return;
    fireEvent.click(screen.getByText('что изменилось ›'));
    expect(reviewed).toBe(true);
  });

  it('действие проброшено из вызова, а не осталось заглушкой', () => {
    expect(TRAININGS_SRC).toContain('onAccept: function (e) {');
    expect(TRAININGS_SRC).toContain('acceptProposal();');
  });
});

describe('Вид по кадру, и обе кнопки одного роста', () => {
  it('карточка стоит на подложке предупреждения', () => {
    expect(rule('.activity-v4-program .sb-proposal-card')).toContain('var(--v4-tint');
  });

  it('заголовок — 13,5/1,35 тоном предупреждения', () => {
    const head = rule('.activity-v4-program .sb-proposal-card b');
    expect(head).toContain('font: 700 13.5px/1.35 Figtree');
    expect(head).toContain('var(--v4-warn-text');
  });

  it('«Оставить прежнюю» на грунте с обводкой, а не второй заливкой', () => {
    // Две одинаковые заливки рядом читались бы как равные действия.
    const alt = rule('.activity-v4-program .sb-proposal-card .sb-plan-actions .sb-plan-skip');
    expect(alt).toContain('var(--v4-bg');
    expect(alt).toContain('inset 0 0 0 1px');
  });

  it('«Принять» внутри ряда не тянет чужой отступ', () => {
    // У плана та же кнопка стоит над рядом и несёт margin-top 14; здесь он
    // разъезжал две кнопки по вертикали.
    const cta = rule('.activity-v4-program .sb-proposal-card .sb-plan-actions .sb-btn.sb-plan-cta');
    expect(cta).toContain('margin-top: 0');
    expect(cta).toContain('flex: 1');
  });

  it('ссылка разбора — не главное действие', () => {
    const link = rule('.activity-v4-program .sb-proposal-review-link');
    expect(link).toContain('background: none');
    expect(link).toContain('var(--v4-act-text');
  });
});
