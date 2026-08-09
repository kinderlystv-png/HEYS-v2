// strength-builder-ui.test.js — экраны полноэкранного силового конструктора.
//
// Шаг 5 протокола STRENGTH_BUILDER_REDESIGN_PROTOCOL_2026-08-09.md. Тест
// стережёт то, что легко ломается молча: UI обязан показывать числа ядра, а не
// считать их сам, и обязан соблюдать решения владельца — разминка вне тоннажа,
// дроп не даёт нового номера, прочерк не закрывается, безопасность не спрятана.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

function loadModules() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    /* eslint-disable-next-line no-eval */
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS.StrengthBuilder;
}

const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });

function training(exercises) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { exercises },
  };
}

let SB;

beforeEach(() => {
  SB = loadModules();
});

afterEach(() => {
  cleanup();
});

describe('конструктор: подходы и типы', () => {
  it('разминка идёт ярлыком без номера, рабочие нумеруются подряд', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Жим лёжа',
        approaches: [
          { weightKg: '40', reps: 10, done: true, type: 'warmup' },
          work(75, 8, true),
          work(75, 8, false),
        ],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText('разм')).toBeTruthy();
    expect(screen.getByLabelText('Рабочий подход номер 1')).toBeTruthy();
    expect(screen.getByLabelText('Рабочий подход номер 2')).toBeTruthy();
  });

  it('ступень сброса не получает своего номера', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Жим лёжа',
        approaches: [{ weightKg: '75', reps: 8, done: true, drops: [{ weightKg: '60', reps: 6, done: true }] }],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText('дроп')).toBeTruthy();
    expect(screen.queryByLabelText('Рабочий подход номер 2')).toBeNull();
  });

  it('пустые повторы блокируют галочку без модалки и слова «ошибка»', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [{ weightKg: '75', reps: 0, done: false }] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByLabelText('Отметить выполненным').disabled).toBe(true);
    expect(screen.queryByText(/ошибк/i)).toBeNull();
  });

  it('пустой вес — норма, это свой вес, и галочка доступна', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Подтягивания', approaches: [{ weightKg: '', reps: 10, done: false }] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByLabelText('Отметить выполненным').disabled).toBe(false);
  });

  it('правка подхода видна на экране, а не только уходит наружу', () => {
    const seen = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: (next) => seen.push(next),
      onClose: () => {},
    }));
    fireEvent.click(screen.getByLabelText('Отметить выполненным'));
    expect(seen.length).toBe(1);
    expect(screen.getByLabelText('Отменить отметку')).toBeTruthy();
  });
});

describe('конструктор: сводка считается ядром', () => {
  it('в шапке счётчик подходов, а метрики — не здесь', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Жим',
        approaches: [
          { weightKg: '40', reps: 10, done: true, type: 'warmup' },
          work(75, 8, true),
        ],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    // Прототип экрана 04: время и счётчик. Тоннаж живёт на финале, чтобы в
    // зале не отвлекать; сам подсчёт разминки проверяется тестами ядра.
    expect(screen.getByText('2 / 2 ✓')).toBeTruthy();
    expect(screen.queryByText(/\d+ кг$/)).toBeNull();
  });

  it('упражнение без коэффициента показано как непосчитанное, а не нулём', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Бурпи',
        unit: 'bodyweight',
        bodyweightFactor: null,
        approaches: [{ weightKg: '', reps: 15, done: true }],
      }]),
      dateKey: '2026-08-09',
      profile: { weight: 70 },
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText('1 без тоннажа')).toBeTruthy();
  });

  it('главная кнопка называет, сколько не закрыто', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText('Завершить · 1 не закрыто')).toBeTruthy();
  });
});

describe('конструктор: связка', () => {
  const superset = () => training([
    { name: 'Подтягивания', ssGroup: 1, restSec: 60, approaches: [work(0, 10, true), work(0, 10, false)] },
    { name: 'Тяга блока', ssGroup: 1, restSec: 120, approaches: [work(50, 12, true), work(50, 12, false)] },
  ]);

  it('раунды показаны строками, а не тремя визитами в карточки', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: superset(), dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));
    expect(screen.getByText('Р1')).toBeTruthy();
    expect(screen.getByText('Р2')).toBeTruthy();
    expect(screen.getByText('A1')).toBeTruthy();
    expect(screen.getByText('A2')).toBeTruthy();
  });

  it('отдых связки — максимум из участников', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: superset(), dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));
    expect(screen.getByText(/Отдых 2:00 пойдёт, когда закрыт весь раунд/)).toBeTruthy();
  });

  it('старая связка с неравными подходами показана плоско и объясняет почему', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([
        { name: 'Жим', ssGroup: 1, approaches: [work(60, 8, true), work(60, 8, true), work(60, 8, true)] },
        { name: 'Тяга', ssGroup: 1, approaches: [work(50, 10, true)] },
      ]),
      dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));
    expect(screen.queryByText('Р1')).toBeNull();
    expect(screen.getByText(/не переписывать историю/)).toBeTruthy();
  });

  it('прочерк участника по ходу не закрывается', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([
        { name: 'Жим', ssGroup: 1, approaches: [work(60, 8, true), work(60, 8, true)] },
        { name: 'Тяга', ssGroup: 1, approaches: [work(50, 10, true), work(50, 10, true)] },
        { name: 'Разгибания', ssGroup: 1, approaches: [{ weightKg: '', reps: 0, done: false }, work(20, 15, false)] },
      ]),
      dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));
    const blank = screen.getByText('—');
    expect(blank.disabled).toBe(true);
  });
});

describe('конструктор: безопасность не спрятана', () => {
  it('дискомфорт показан с действиями, а не только записан в журнал', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Жим гантелей сидя',
        approaches: [
          work(20, 12, true),
          { weightKg: '22', reps: 10, done: true, discomfort: true, discomfortNote: 'плечо' },
        ],
      }]),
      dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));
    expect(screen.getByText(/Дискомфорт · плечо/)).toBeTruthy();
    expect(screen.getByText('Снизить вес на 20%')).toBeTruthy();
    expect(screen.getByText('Пропустить упражнение')).toBeTruthy();
    expect(screen.getByText(/Боль — не «стало тяжело»/)).toBeTruthy();
  });

  it('«снизить вес» правит только незакрытые подходы', () => {
    const seen = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Жим',
        approaches: [
          { weightKg: '100', reps: 8, done: true, discomfort: true },
          work(100, 8, false),
        ],
      }]),
      dateKey: '2026-08-09', profile: {}, onPatch: (n) => seen.push(n), onClose: () => {},
    }));
    fireEvent.click(screen.getByText('Снизить вес на 20%'));
    const aps = seen[0][0].approaches;
    expect(aps[0].weightKg).toBe('100');
    expect(aps[1].weightKg).toBe('80');
  });
});

describe('финал тренировки', () => {
  it('расчётный максимум считается по Эпли, а не по Бржицки', () => {
    loadModules();
    const Fin = globalThis.HEYS.StrengthFinishUI;
    // Пример протокола: 75 кг × 8 → 95 кг.
    expect(Math.round(Fin.epley(75, 8))).toBe(95);
  });

  it('максимум берётся с рабочего подхода, а не с разминки или сброса', () => {
    loadModules();
    const Fin = globalThis.HEYS.StrengthFinishUI;
    const best = Fin.bestWorkingSet([{
      name: 'Жим',
      approaches: [
        { weightKg: '100', reps: 10, done: true, type: 'warmup' },
        { weightKg: '75', reps: 8, done: true, drops: [{ weightKg: '60', reps: 6, done: true }] },
        { weightKg: '90', reps: 5, done: false },
      ],
    }]);
    expect(best.weightKg).toBe('75');
    expect(best.reps).toBe(8);
  });
});
