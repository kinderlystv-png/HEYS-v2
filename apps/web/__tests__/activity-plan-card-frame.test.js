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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

  it('будущий «Посмотреть» раскрывает snapshot inline и не вызывает внешний mutating callback', () => {
    const onOpenReadonly = vi.fn();
    renderCard({ isFutureDay: true, onOpenReadonly });

    fireEvent.click(screen.getByText('Посмотреть'));

    expect(screen.getByRole('list', { name: 'Состав плана' })).toBeTruthy();
    expect(screen.getByText('Присед')).toBeTruthy();
    expect(screen.getByText('Тяга')).toBeTruthy();
    expect(screen.getByText('Скрыть').getAttribute('aria-expanded')).toBe('true');
    expect(onOpenReadonly).not.toHaveBeenCalled();
  });

  it('пилюля называет источник плана', () => {
    renderCard();
    expect(screen.getByText('от куратора')).toBeTruthy();
  });

  it('перенесённый план говорит, откуда он, — вместо «от куратора»', () => {
    renderCard({ planOverrides: { movedFrom: '2026-08-29' } });
    expect(screen.getByText(/план с /)).toBeTruthy();
    expect(screen.queryByText('от куратора')).toBeNull();
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
    renderCard({ moveOptions: [{ date: '2026-08-31', label: 'завтра' }] });
    fireEvent.click(screen.getByText('Перенести'));
    expect(screen.queryByText('Мало сил')).toBeNull();
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
});
