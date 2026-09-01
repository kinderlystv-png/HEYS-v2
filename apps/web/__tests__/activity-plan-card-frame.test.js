// activity-plan-card-frame.test.js — карточка назначенного плана на «Активе».
//
// Кадр «Актив · план назначен»: заголовок «Сегодня по программе», пилюля
// «от куратора» справа, состав прозой, кнопка «Начать» и под ней ряд из двух.
// До сведения карточка говорила «Сегодня по плану · Ноги и спина» с составом
// в мелкой мете, а перенос и пропуск прятались за одной кнопкой («Не смогу
// сегодня» либо «Отпустить») — какое из двух действий за ней, видно не было.
//
// PlanCard — общий компонент из strength/heys_strength_superset_ui_v1.js.
// Разметку он поменял для всех, геометрию — только внутри .activity-v4-program,
// поэтому общий .sb-plan-card на других экранах не задет; это тоже проверяется.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

const CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/731-ui-v4-activity.css'), 'utf8',
);

function loadParts() {
  globalThis.window = globalThis;
  globalThis.React = React;
  globalThis.HEYS = globalThis.HEYS || {};
  const src = fs.readFileSync(
    path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8',
  );
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  return globalThis.HEYS.StrengthBuilderParts;
}

function planTraining(planOverrides) {
  return {
    workoutLog: { exercises: [{ name: 'Присед' }, { name: 'Тяга' }] },
    planSnapshot: { exercises: [{ id: 'snap_1', name: 'Присед' }, { id: 'snap_2', name: 'Тяга' }] },
    plan: { id: 'pl_1', status: 'assigned', dayLabel: 'Ноги и спина', assignedBy: 'Артём', ...planOverrides },
  };
}

function renderCard(props) {
  const Parts = loadParts();
  render(React.createElement(Parts.PlanCard, {
    training: planTraining(props && props.planOverrides),
    dateKey: '2026-08-30',
    isFutureDay: false,
    onStart: () => {},
    onSkip: () => {},
    onMove: () => {},
    ...props,
  }));
}

function rule(selector) {
  const at = CSS.indexOf(selector + ' {');
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

afterEach(() => cleanup());

describe('Карточка плана говорит словами кадра', () => {
  it('заголовок — «Сегодня по программе», без состава в нём', () => {
    renderCard();
    expect(screen.getByText('Сегодня по программе')).toBeTruthy();
    expect(screen.queryByText(/Сегодня по плану/)).toBeNull();
  });

  it('состав и счётчик берёт из snapshot текущей ревизии, когда live workout ещё пуст', () => {
    renderCard({
      training: {
        ...planTraining(),
        workoutLog: { exercises: [] },
      },
    });
    expect(document.querySelector('.sb-plan-meta').textContent).toContain('2 упр.');
  });

  it('будущий план сразу показывает состав snapshot и не предлагает небезопасный ранний старт', () => {
    const onOpenReadonly = vi.fn();
    renderCard({ isFutureDay: true, onOpenReadonly });

    expect(screen.getByRole('list', { name: 'Состав плана' })).toBeTruthy();
    expect(screen.getByText('Присед')).toBeTruthy();
    expect(screen.getByText('Тяга')).toBeTruthy();
    expect(screen.queryByText('Начать сейчас')).toBeNull();
    expect(screen.queryByText('Начать')).toBeNull();
    expect(onOpenReadonly).not.toHaveBeenCalled();
  });

  it('будущий план показывает первые четыре упражнения, дозировку и честный остаток', () => {
    const exercises = Array.from({ length: 6 }, (_, index) => ({
      id: 'ex_' + index,
      name: 'Упражнение ' + (index + 1),
      approaches: Array.from({ length: index === 0 ? 4 : 3 }, (_unused, approachIndex) => ({
        reps: approachIndex === 0 ? 8 : 12,
        weightKg: index === 0 ? '75' : '60',
      })),
    }));
    renderCard({
      isFutureDay: true,
      training: {
        ...planTraining({ assignedAt: new Date(2026, 7, 3).getTime() }),
        workoutLog: { exercises: [] },
        planSnapshot: { exercises },
      },
    });

    expect(screen.getByText('Запланировано куратором')).toBeTruthy();
    expect(screen.getByText('Ноги и спина · Артём, 3 августа')).toBeTruthy();
    expect(screen.getByText('4 × 8–12 · 75 кг')).toBeTruthy();
    expect(screen.getByText('и ещё 2 · всего 19 подходов')).toBeTruthy();
    expect(screen.getByText('план')).toBeTruthy();
  });

  it('будущий план выводит реальную проекцию недели, переданную owner-слоем', () => {
    const kinds = ['done', 'rest', 'assigned', 'rest', 'assigned', 'rest', 'rest'];
    renderCard({
      isFutureDay: true,
      weekLabel: 'Неделя 2 · вторая из трёх на неделе',
      weekOverview: kinds.map((kind, index) => ({
        date: '2026-08-' + String(10 + index).padStart(2, '0'),
        weekday: ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][index],
        kind,
      })),
    });

    expect(screen.getByText('Неделя 2 · вторая из трёх на неделе')).toBeTruthy();
    expect(document.querySelectorAll('.sb-plan-week-days > span')).toHaveLength(7);
    expect(document.querySelectorAll('.sb-plan-week-days > .is-done')).toHaveLength(1);
    expect(document.querySelectorAll('.sb-plan-week-days > .is-assigned')).toHaveLength(2);
    expect(screen.getByText('день отдыха')).toBeTruthy();
  });

  it('связка в snapshot остаётся одной строкой с раундами', () => {
    const exercises = [
      { id: 'press', name: 'Жим лёжа', approaches: [{ reps: 8, weightKg: 75 }] },
      {
        id: 'pull-up', name: 'Подтягивания', ssGroup: 1,
        approaches: [{ reps: 8 }, { reps: 8 }, { reps: 8 }],
      },
      {
        id: 'row', name: 'Тяга блока', ssGroup: 1,
        approaches: [{ reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }, { reps: 12, weightKg: 50 }],
      },
    ];
    renderCard({
      isFutureDay: true,
      training: {
        ...planTraining(),
        workoutLog: { exercises: [] },
        planSnapshot: { exercises },
      },
    });

    expect(screen.getByText('Связка A · Подтягивания ⇄ Тяга блока')).toBeTruthy();
    expect(screen.getByText('3 раунда')).toBeTruthy();
    expect(screen.queryByText('Подтягивания')).toBeNull();
    expect(screen.queryByText('Тяга блока')).toBeNull();
  });

  it('ssGroup: 0 остаётся обычными упражнениями, а не ложной связкой', () => {
    renderCard({
      isFutureDay: true,
      training: {
        ...planTraining(),
        workoutLog: { exercises: [] },
        planSnapshot: {
          exercises: [
            { id: 'one', name: 'Жим', ssGroup: 0, approaches: [{ reps: 8, weightKg: 60 }] },
            { id: 'two', name: 'Тяга', ssGroup: 0, approaches: [{ reps: 10, weightKg: 50 }] },
          ],
        },
      },
    });
    expect(screen.getByText('Жим')).toBeTruthy();
    expect(screen.getByText('Тяга')).toBeTruthy();
    expect(screen.queryByText(/Связка 0/)).toBeNull();
  });

  it('пилюля называет источник плана', () => {
    renderCard();
    expect(screen.getByText('от куратора')).toBeTruthy();
  });

  it('перенесённый план говорит, откуда он, — вместо «от куратора»', () => {
    renderCard({ planOverrides: { movedFrom: '2026-08-29' } });
    expect(screen.getByText(/план с /)).toBeTruthy();
    expect(screen.getByText(/Перенесено с .*веса те же/)).toBeTruthy();
    expect(screen.queryByText('от куратора')).toBeNull();
  });

  it('исходный день переноса остаётся следом, а не пропуском', () => {
    renderCard({ planOverrides: { status: 'moved', movedTo: '2026-09-05' } });
    expect(screen.getByText(/Не пропуск — тренировка ждёт/)).toBeTruthy();
    expect(screen.getByText(/откуда перенесли/)).toBeTruthy();
    expect(screen.queryByText(/пропущен/)).toBeNull();
  });

  it('состав ушёл в прозу и называет, что плана нет в расходе', () => {
    renderCard();
    const meta = document.querySelector('.sb-plan-meta').textContent;
    expect(meta).toContain('Ноги и спина');
    expect(meta).toContain('2 упр.');
    // Контракт строка 18: план до старта не даёт расхода, и это сказано словом.
    expect(meta).toContain('В расход не идёт, пока не начнёте.');
  });
});

describe('Перенос и пропуск — два разных действия', () => {
  it('кнопка старта названа словом кадра', () => {
    renderCard();
    expect(screen.getByText('Начать')).toBeTruthy();
    expect(screen.queryByText('Начать по плану')).toBeNull();
  });

  it('«Перенести» ведёт в выбор даты, а не в причины', () => {
    renderCard({ moveOptions: [{ date: '2026-08-31', label: 'Завтра, понедельник 31 августа' }] });
    fireEvent.click(screen.getByText('Перенести'));
    expect(screen.getByText('Куда перенести · выбор дня')).toBeTruthy();
    expect(screen.getByText('Завтра, понедельник 31 августа')).toBeTruthy();
    expect(screen.getByText('Свободно')).toBeTruthy();
    expect(screen.queryByText('Мало сил')).toBeNull();
  });

  it('на будущем дне перенос — единственное и визуально главное безопасное действие', () => {
    renderCard({
      isFutureDay: true,
      moveOptions: [{ date: '2026-08-31', label: 'Завтра, понедельник 31 августа' }],
    });
    const move = screen.getByText('Перенести');
    expect(move.className).toContain('is-accent');
    expect(screen.queryByText('Начать сейчас')).toBeNull();
  });

  it('занятый день назван причиной и не выбирается', () => {
    renderCard({
      moveOptions: [{
        date: '2026-08-31',
        label: 'Понедельник, 31 августа',
        busy: true,
        details: 'Уже стоит День C',
      }, {
        date: '2026-09-01',
        label: 'Вторник, 1 сентября',
        busy: false,
      }],
    });
    fireEvent.click(screen.getByText('Перенести'));
    expect(screen.getByText('Уже стоит День C')).toBeTruthy();
    expect(screen.getByText('занят')).toBeTruthy();
    expect(document.querySelector('.sb-move-day').disabled).toBe(true);
  });

  it('«Пропустить» ведёт в причины и передаёт выбранную наружу', () => {
    const seen = [];
    renderCard({ onSkip: (reason) => seen.push(reason) });
    fireEvent.click(screen.getByText('Пропустить'));
    fireEvent.click(screen.getByText('Мало сил'));
    fireEvent.click(screen.getAllByText('Отпустить').find((el) => el.closest('.sb-sheet')));
    expect(seen).toEqual(['Мало сил']);
  });

  it('переносить некуда — кнопки нет, а не погашена', () => {
    // То же правило, что у листа действия (контракт строка 29): погашенная
    // кнопка обещает действие, которого нет.
    renderCard({ moveOptions: [] });
    expect(screen.queryByText('Перенести')).toBeNull();
    expect(screen.getByText('Пропустить')).toBeTruthy();
  });

  it('«Пропустить» доступно и когда перенос возможен', () => {
    renderCard({ moveOptions: [{ date: '2026-08-31', label: 'завтра' }] });
    expect(screen.getByText('Перенести')).toBeTruthy();
    expect(screen.getByText('Пропустить')).toBeTruthy();
  });

  it('не закрывает перенос до owner-ack и оставляет шторку открытой при stale revision', async () => {
    let resolveMove;
    const onMove = vi.fn(() => new Promise((resolve) => { resolveMove = resolve; }));
    renderCard({
      moveOptions: [{ date: '2026-08-31', weekday: 'завтра', human: '31 августа' }],
      onMove,
    });

    fireEvent.click(document.querySelector('.sb-plan-actions button'));
    fireEvent.click(document.querySelector('.sb-move-day'));
    fireEvent.click(document.querySelector('.sb-sheet .sb-btn.is-accent'));

    expect(document.querySelector('.sb-sheet')).not.toBeNull();
    expect(document.querySelector('.sb-sheet .sb-btn.is-accent').disabled).toBe(true);
    expect(onMove).toHaveBeenCalledWith('2026-08-31', expect.objectContaining({ id: 'pl_1', status: 'assigned' }));

    resolveMove(null);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(document.querySelector('.sb-sheet')).not.toBeNull();
  });

  it('не считает rollback failure успехом и явно оставляет перенос на проверку', async () => {
    renderCard({
      moveOptions: [{ date: '2026-08-31', weekday: 'завтра', human: '31 августа' }],
      onMove: async () => ({ ok: false, code: 'move_rollback_failed' }),
    });

    fireEvent.click(document.querySelector('.sb-plan-actions button'));
    fireEvent.click(document.querySelector('.sb-move-day'));
    fireEvent.click(document.querySelector('.sb-sheet .sb-btn.is-accent'));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('оба дня'));
    expect(document.querySelector('.sb-sheet')).not.toBeNull();
  });

  it('void owner callback не считается acknowledgment и не закрывает пропуск', async () => {
    renderCard({ onSkip: () => undefined });

    const actions = document.querySelectorAll('.sb-plan-actions button');
    fireEvent.click(actions[actions.length - 1]);
    fireEvent.click(document.querySelector('.sb-sheet .sb-btn.is-accent'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(document.querySelector('.sb-sheet')).not.toBeNull();
  });

  it('закрывает пропуск только после успешного owner-ack и передаёт открытую ревизию', async () => {
    let resolveSkip;
    const onSkip = vi.fn(() => new Promise((resolve) => { resolveSkip = resolve; }));
    renderCard({ onSkip });

    const actions = document.querySelectorAll('.sb-plan-actions button');
    fireEvent.click(actions[actions.length - 1]);
    fireEvent.click(document.querySelector('.sb-sheet .sb-btn.is-accent'));

    expect(document.querySelector('.sb-sheet')).not.toBeNull();
    expect(onSkip).toHaveBeenCalledWith('', expect.objectContaining({ id: 'pl_1', status: 'assigned' }));

    resolveSkip(true);
    await waitFor(() => expect(document.querySelector('.sb-sheet')).toBeNull());
  });
});

describe('Геометрия задана только внутри блока программы', () => {
  it('карточка — .grp кадра: радиус 20, поля 16, без рамки', () => {
    const scoped = rule('.activity-v4-program .sb-plan-card');
    expect(scoped).toContain('border-radius: 20px');
    expect(scoped).toContain('padding: 16px');
    expect(scoped).toContain('border: none');
    expect(scoped).toContain('var(--v4-c1');
  });

  it('общий .sb-plan-card остался прежним — чужие экраны не задеты', () => {
    const base = fs.readFileSync(
      path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8',
    );
    const at = base.indexOf('.sb-plan-card {');
    expect(at).toBeGreaterThan(-1);
    expect(base.slice(at, base.indexOf('}', at))).toContain('border-radius: 16px');
  });

  it('кнопка старта перебивает общий .sb-btn.is-accent', () => {
    // Равная специфичность проигрывала: 750-strength-builder.css грузится позже.
    expect(CSS).toContain('.activity-v4-program .sb-btn.sb-plan-cta {');
  });

  it('ряд вторичных кнопок делит ширину пополам с зазором 8', () => {
    const row = rule('.activity-v4-program .sb-plan-actions');
    expect(row).toContain('gap: 8px');
    expect(row).toContain('margin-top: 9px');
    expect(rule('.activity-v4-program .sb-plan-actions .sb-plan-skip')).toContain('flex: 1');
  });

  it('пилюля — 9 px моноширинной тоном акцента', () => {
    const badge = rule('.activity-v4-program .sb-plan-badge');
    expect(badge).toContain('ui-monospace');
    expect(badge).toContain('9px');
    expect(badge).toContain('var(--v4-act-text');
  });

  it('будущий состав и неделя повторяют геометрию строк canvas', () => {
    expect(rule('.activity-v4-program .sb-plan-summary')).toContain('gap: 10px');
    expect(rule('.activity-v4-program .sb-plan-letter')).toContain('width: 34px');
    expect(rule('.activity-v4-program .sb-plan-letter')).toContain('border-radius: 11px');
    expect(rule('.activity-v4-program .sb-plan-exercises')).toContain('gap: 6px');
    expect(rule('.activity-v4-program .sb-plan-week-days')).toContain('gap: 5px');
    expect(rule('.activity-v4-program .sb-plan-exercises li > i')).toContain('Figtree');
    expect(rule('.activity-v4-program .sb-plan-exercises li > i')).toContain('tabular-nums');
  });

  it('выбор переноса в Активе — вертикальный список строк', () => {
    const days = rule('.activity-v4-program .sb-move-days');
    expect(days).toContain('flex-direction: column');
    expect(days).toContain('overflow: visible');
    expect(rule('.activity-v4-program .sb-move-day')).toContain('width: 100%');
  });
});
