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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

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

  it('unit=time показывает поле секунд, а не повторы, и пишет duration_sec', () => {
    const seen = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Планка', unit: 'time',
        approaches: [{ weightKg: '', durationSec: 60, done: false }],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: (next) => seen.push(next),
      onClose: () => {},
    }));
    expect(screen.getByLabelText('Время, сек').value).toBe('60');
    expect(screen.queryByLabelText('Повторы')).toBeNull();
    expect(screen.getByLabelText('Вес, кг')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Время, сек'), { target: { value: '45' } });
    expect(seen[0][0].approaches[0].durationSec).toBe(45);
  });

  it('unit=distance показывает поле метров и пишет distance_m, вес остаётся отдельным полем', () => {
    const seen = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Фермерская переноска', unit: 'distance',
        approaches: [{ weightKg: '24', distanceM: 40, done: false }],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: (next) => seen.push(next),
      onClose: () => {},
    }));
    expect(screen.getByLabelText('Дистанция, м').value).toBe('40');
    expect(screen.getByLabelText('Вес, кг').value).toBe('24');
    fireEvent.change(screen.getByLabelText('Дистанция, м'), { target: { value: '50' } });
    expect(seen[0][0].approaches[0].distanceM).toBe(50);
  });

  it('галочка на time/distance подходе доступна только когда мера заполнена', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Планка', unit: 'time',
        approaches: [{ weightKg: '', durationSec: 0, done: false }],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByLabelText('Отметить выполненным').disabled).toBe(true);
  });

  it('«+ Сброс» скрыт для time/distance — дропсет там не имеет смысла', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Планка', unit: 'time',
        approaches: [{ weightKg: '', durationSec: 60, done: false }],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.queryByText('+ Сброс')).toBeNull();
  });

  it('дискомфорт на time-подходе показывается так же, как на весовом', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Планка', unit: 'time',
        approaches: [{ weightKg: '', durationSec: 60, done: true, discomfort: true, discomfortNote: 'поясница' }],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText(/Дискомфорт: поясница/)).toBeTruthy();
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

  it('шапка показывает прогресс, а кнопка завершения — незакрытый остаток', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText('Завершить · 1 не закрыто')).toBeTruthy();
    expect(screen.getByText('1 / 2 ✓')).toBeTruthy();
  });
});

describe('конструктор: тяжесть подхода без профессионального жаргона', () => {
  it('показывает тяжесть понятными словами и раскрывает краткую шкалу', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Жим',
        rpe: 7,
        restSec: 120,
        approaches: [work(75, 8, false)],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));

    const helpTrigger = screen.getByLabelText('Что значит тяжесть подхода');
    const help = helpTrigger.closest('details');
    expect(help?.open).toBe(false);
    fireEvent.click(helpTrigger);
    expect(help?.open).toBe(true);
    expect(screen.getByText(/6 — легко; 7–8 — тяжело/)).toBeTruthy();
    expect(screen.getByText('· по тяжести 7')).toBeTruthy();
    expect(screen.getByLabelText('Тяжесть подхода 7 из 10')).toBeTruthy();
    expect(screen.queryByText(/RPE/i)).toBeNull();
    expect(screen.queryByLabelText(/RPE/i)).toBeNull();
  });
});

describe('конструктор: спокойная нижняя панель', () => {
  it('показывает незакрытый остаток тихой кнопкой', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));

    const finish = screen.getByRole('button', { name: 'Завершить · 1 не закрыто' });
    expect(finish).toBeTruthy();
  });

  it('добавление подхода к закрытому упражнению сбрасывает время завершения и возвращает active-state', () => {
    const sessionPatches = [];
    const exercisePatches = [];
    const closed = training([{ name: 'Жим', approaches: [work(75, 8, true)] }]);
    closed.workoutLog.completedAt = 123456;

    const props = {
      training: closed,
      dateKey: '2026-08-09',
      profile: {},
      onPatch: (next) => exercisePatches.push(next),
      onPatchSession: (patch) => sessionPatches.push(patch),
      onClose: () => {},
    };
    const view = render(React.createElement(SB.BuilderScreen, props));
    expect(screen.getByRole('button', { name: 'Завершить тренировку' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '+ Подход' }));
    expect(sessionPatches).toContainEqual({ completedAt: null });
    expect(exercisePatches.at(-1)[0].approaches).toHaveLength(2);

    view.rerender(React.createElement(SB.BuilderScreen, {
      ...props,
      training: {
        ...closed,
        workoutLog: { ...closed.workoutLog, completedAt: undefined, exercises: exercisePatches.at(-1) },
      },
    }));
    const reopened = screen.getByRole('button', { name: 'Завершить · 1 не закрыто' });
    expect(reopened).toBeTruthy();
    expect(screen.getByText('1 / 2 ✓')).toBeTruthy();
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

  it('не предлагает сброс веса внутри связки', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: superset(), dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));

    expect(screen.queryByRole('button', { name: '+ Сброс' })).toBeNull();
  });

  it('отдых связки — максимум из участников', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: superset(), dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));
    expect(screen.getByText(/Отдых 2:00 пойдёт, когда закрыт весь раунд/)).toBeTruthy();
  });

  it('закрытие последней клетки раунда один раз запускает отдых связки', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: superset(), dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));

    const round = screen.getByText('Р2').closest('.sb-round');
    const cells = within(round).getAllByRole('button');
    fireEvent.click(cells[0]);
    expect(screen.queryByText('Отдых · Связка A')).toBeNull();
    fireEvent.click(cells[1]);
    expect(screen.getByText('Отдых · Связка A')).toBeTruthy();
    expect(screen.getByText(/максимум участников · 2:00/)).toBeTruthy();
    expect(screen.getByText(/Следующий раунд|Связка завершена/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Завершить тренировку' })).toBeTruthy();
  });

  it('таймер дока прибавляет 10 секунд и сворачивается, не закрывая список', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([
        { name: 'Жим', restSec: 90, approaches: [work(75, 8, false)] },
        { name: 'Тяга', restSec: 90, approaches: [work(60, 10, false)] },
      ]),
      dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));

    fireEvent.click(screen.getByLabelText('Отметить выполненным'));
    expect(screen.getByText('отдых между подходами')).toBeTruthy();
    expect(screen.getByText('1 из 2 подходов')).toBeTruthy();
    expect(screen.getByText('Жим закрыт')).toBeTruthy();
    expect(screen.getByText('дальше · следующий подход')).toBeTruthy();
    expect(screen.getByText('осталось')).toBeTruthy();
    expect(screen.getByText(/Число подписано, откуда взялось — по правилу «по умолчанию»/)).toBeTruthy();
    expect(screen.getByText('+10 секунд')).toBeTruthy();
    fireEvent.click(screen.getByText('+10 секунд'));
    expect(screen.getByText('1:40')).toBeTruthy();
    expect(screen.getByText('свернуть')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Тяга/ }));
    expect(screen.getByLabelText('Развернуть таймер отдыха')).toBeTruthy();
    expect(screen.getByText('Отдых 1:40 · Жим')).toBeTruthy();
    expect(screen.getByText('идёт от подхода, который его запустил')).toBeTruthy();
    expect(screen.getByText('Отдых 1:40 · Жим')).toBeTruthy();
    expect(screen.getByLabelText('Развернуть таймер отдыха')).toBeTruthy();
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
  it('open пробрасывает day-owned summary callback в production BuilderScreen', () => {
    const finishSummaryFor = vi.fn();
    globalThis.HEYS.TrainingKernel.fullscreen = {
      mount: ({ render: renderScreen }) => renderScreen({ close: vi.fn() }),
    };
    const element = SB.open({
      training: training([]),
      dateKey: '2026-08-09',
      finishSummaryFor,
    });
    expect(element.props.finishSummaryFor).toBe(finishSummaryFor);
  });

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

describe('пустая тренировка (экран 02)', () => {
  it('план куратора не показываем — под него нет схемы данных', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText('Пустая тренировка')).toBeTruthy();
    expect(screen.getByText('+ Собрать свою')).toBeTruthy();
    expect(screen.queryByText(/Начать по плану/)).toBeNull();
    expect(screen.queryByText(/Шаблон/)).toBeNull();
  });

  it('без прошлой сессии кнопка повтора не показывается', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
      lastSessionFor: () => null,
    }));
    expect(screen.queryByText(/Повторить/)).toBeNull();
  });

  it('с прошлой сессией повтор клонирует упражнения, не ссылается на старые', () => {
    const repeated = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
      lastSessionFor: () => ({ dateKey: '2026-08-05', exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }] }),
      onRepeatLast: (ex) => repeated.push(ex),
    }));
    fireEvent.click(screen.getByText(/Повторить/));
    expect(repeated.length).toBe(1);
    expect(repeated[0][0].name).toBe('Жим');
  });
});

describe('остались незакрытые подходы (экран 11)', () => {
  it('«Завершить» с незакрытыми подходами спрашивает, а не уходит сразу на финал', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    fireEvent.click(screen.getByText('Завершить · 1 не закрыто'));
    expect(screen.getByText('Остались незакрытые подходы')).toBeTruthy();
    expect(screen.getByText(/лучше убрать/)).toBeTruthy();
  });

  it('«Убрать пустые» чистит незакрытые заполненные, но не трогает закрытые и прочерки', () => {
    const seen = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([{
        name: 'Жим',
        // Третий подход — прочерк участника связки, добавленного по ходу: он
        // легитимен и не должен исчезнуть вместе с настоящим «недоделал».
        approaches: [work(75, 8, true), work(75, 8, false), { weightKg: '', reps: 0, done: false }],
      }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: (next) => seen.push(next),
      onClose: () => {},
    }));
    fireEvent.click(screen.getByText('Завершить · 1 не закрыто'));
    fireEvent.click(screen.getByText('Убрать пустые'));
    const aps = seen[seen.length - 1][0].approaches;
    expect(aps.length).toBe(2);
    expect(aps[0].done).toBe(true);
    expect(aps[1].weightKg).toBe('');
    expect(aps[1].reps).toBe(0);
  });

  it('«Оставить» закрывает конструктор, ничего не меняя', () => {
    const patched = [];
    const closed = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: (n) => patched.push(n),
      onClose: () => closed.push(1),
    }));
    fireEvent.click(screen.getByText('Завершить · 1 не закрыто'));
    fireEvent.click(screen.getByText('Оставить'));
    expect(patched.length).toBe(0);
    expect(closed.length).toBe(1);
  });
});

describe('очередь отправки (экран 09)', () => {
  it('«Ждёт сеть» показан, когда день не синхронизирован', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
      syncStatusFor: () => 'pending',
    }));
    expect(screen.getByText('📡 Ждёт сеть')).toBeTruthy();
  });

  it('бейдж не показан, когда день синхронизирован', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
      syncStatusFor: () => 'synced',
    }));
    expect(screen.queryByText('📡 Ждёт сеть')).toBeNull();
  });
});

describe('пропуск назначенного дня (экран 18, минимальная версия)', () => {
  function planTraining(planOverrides) {
    return {
      workoutLog: { exercises: [{ name: 'Тяга', approaches: [work(60, 8, false)] }] },
      plan: Object.assign({ id: 'pl_1', status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём' }, planOverrides),
    };
  }

  // Кнопка карточки теперь называется «Пропустить»: кадр «Актив · план назначен»
  // разносит перенос и пропуск по двум кнопкам, а прежняя одна («Не смогу
  // сегодня» / «Отпустить») не говорила, какое из двух действий за ней.
  // Шторка причин своё слово сохранила.
  it('«Пропустить» открывает причины, «Отпустить» в шторке пишет причину и передаёт наружу', () => {
    loadModules();
    const Parts = globalThis.HEYS.StrengthBuilderParts;
    const seen = [];
    render(React.createElement(Parts.PlanCard, {
      training: planTraining(),
      dateKey: '2026-08-09',
      isFutureDay: false,
      onStart: () => {},
      onSkip: (reason) => seen.push(reason),
    }));
    fireEvent.click(screen.getByText('Пропустить'));
    fireEvent.click(screen.getByText('Мало сил'));
    fireEvent.click(screen.getAllByText('Отпустить').find((el) => el.closest('.sb-sheet')));
    expect(seen).toEqual(['Мало сил']);
  });

  it('«Передумал» закрывает шторку без вызова onSkip', () => {
    loadModules();
    const Parts = globalThis.HEYS.StrengthBuilderParts;
    const seen = [];
    render(React.createElement(Parts.PlanCard, {
      training: planTraining(),
      dateKey: '2026-08-09',
      isFutureDay: false,
      onStart: () => {},
      onSkip: (reason) => seen.push(reason),
    }));
    fireEvent.click(screen.getByText('Пропустить'));
    fireEvent.click(screen.getByText('Передумал'));
    expect(seen.length).toBe(0);
    expect(screen.queryByText('Что помешало · необязательно')).toBeNull();
  });

  it('пропущенный план показывает причину и «Начать всё же», а не обычную сводку', () => {
    loadModules();
    const Parts = globalThis.HEYS.StrengthBuilderParts;
    const resumed = [];
    render(React.createElement(Parts.PlanCard, {
      training: planTraining({ status: 'skipped', skipReason: 'Плохое самочувствие' }),
      dateKey: '2026-08-09',
      isFutureDay: false,
      onResumeSkipped: () => resumed.push(1),
    }));
    expect(screen.getByText(/пропущен/)).toBeTruthy();
    expect(screen.getByText(/Плохое самочувствие/)).toBeTruthy();
    fireEvent.click(screen.getByText('Начать всё же'));
    expect(resumed.length).toBe(1);
  });

  it('пропуск без причины — нормальное состояние, не ошибка', () => {
    loadModules();
    const Parts = globalThis.HEYS.StrengthBuilderParts;
    render(React.createElement(Parts.PlanCard, {
      training: planTraining({ status: 'skipped' }),
      dateKey: '2026-08-09',
      isFutureDay: false,
      onResumeSkipped: () => {},
    }));
    expect(screen.getByText('Без объяснения — и это нормально')).toBeTruthy();
  });
});

describe('пуш об окончании отдыха (экран 11, только с существующим разрешением)', () => {
  let created;
  let originalNotification;

  beforeEach(() => {
    created = [];
    originalNotification = global.Notification;
    function FakeNotification(title, opts) {
      created.push({ title, opts });
    }
    FakeNotification.permission = 'granted';
    global.Notification = FakeNotification;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  });

  afterEach(() => {
    global.Notification = originalNotification;
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  it('не запрашивает разрешение сам — только использует уже выданное', () => {
    // Симулируем «ещё не спрошено»: конструктор не должен трогать permission API.
    global.Notification.permission = 'default';
    global.Notification.requestPermission = () => { throw new Error('не должен звать requestPermission'); };
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    fireEvent.click(screen.getByLabelText('Отметить выполненным'));
    expect(created.length).toBe(0);
  });

  it('без permission=granted пуш не показывается, даже если вкладка скрыта', () => {
    global.Notification.permission = 'denied';
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    fireEvent.click(screen.getByLabelText('Отметить выполненным'));
    expect(created.length).toBe(0);
  });

  it('когда отдых истекает при granted+hidden — пуш с именем упражнения показывается', () => {
    vi.useFakeTimers();
    try {
      render(React.createElement(SB.BuilderScreen, {
        training: training([{
          name: 'Жим гантелей сидя', restSec: 90,
          approaches: [work(24, 10, true), work(24, 10, true), work(24, 10, false)],
        }]),
        dateKey: '2026-08-09',
        profile: {},
        onPatch: () => {},
        onClose: () => {},
      }));
      fireEvent.click(screen.getByLabelText('Отметить выполненным'));
      act(() => { vi.advanceTimersByTime(91000); });
      expect(created.length).toBe(1);
      expect(created[0].title).toBe('Отдых закончился');
      expect(created[0].opts.body).toBe('Жим гантелей сидя · подход 3 из 3');
      expect(created[0].opts.icon).toBe('/icon-192.png');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('сохраняемый отдых', () => {
  it('восстанавливает незавершённый activeRest и сохраняет +10 секунд', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T18:41:40Z'));
    try {
      const startedAt = Date.now() - 10000;
      const patches = [];
      render(React.createElement(SB.BuilderScreen, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
          workoutLog: {
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }],
            activeRest: {
              startedAt, total: 90, owner: 'Жим', source: 'тяжесть 7 → 1:30',
              nextLabel: 'Следующий подход', collapsed: false,
            },
          },
        },
        dateKey: '2026-08-09', profile: {}, onPatch: () => {},
        onPatchSession: (patch) => patches.push(patch), onClose: () => {},
      }));

      expect(screen.getByText('1:20')).toBeTruthy();
      fireEvent.click(screen.getByText('+10 секунд'));
      expect(patches.at(-1).activeRest).toMatchObject({ startedAt, total: 100, owner: 'Жим' });
      expect(screen.getByText('1:30')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('не запускает истёкший activeRest заново и просит очистить снимок', () => {
    const patches = [];
    render(React.createElement(SB.BuilderScreen, {
      training: {
        ...training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
        workoutLog: {
          exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }],
          activeRest: { startedAt: Date.now() - 120000, total: 90 },
        },
      },
      dateKey: '2026-08-09', profile: {}, onPatch: () => {},
      onPatchSession: (patch) => patches.push(patch), onClose: () => {},
    }));

    expect(screen.queryByText('+10 секунд')).toBeNull();
    expect(patches).toContainEqual({ activeRest: null });
  });

  it('проводит activeRest через нормализацию workoutLog и оба входа конструктора', () => {
    const daySource = fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8');
    const normalizer = daySource.slice(
      daySource.indexOf('function ensureWorkoutLogShape'),
      daySource.indexOf('function patchTraining'),
    );
    expect(normalizer).toContain('out.activeRest = {');
    expect(normalizer).toContain('collapsed: !!restRaw.collapsed');
    expect(normalizer).toContain("closedLabel: String(restRaw.closedLabel || '').slice(0, 160)");
    expect(normalizer).toContain("contextNextLabel: String(restRaw.contextNextLabel || '').slice(0, 160)");
    expect(normalizer).toContain("notificationLabel: String(restRaw.notificationLabel || '').slice(0, 160)");
    expect(normalizer).toContain('out.firstMarkAt = firstMarkAtNum');
    expect(normalizer).toContain('out.lastMarkAt = lastMarkAtNum');
    expect(daySource.match(/onPatchSession: function \(patch\)/g)).toHaveLength(2);
    expect(daySource).toContain('onCloseAtLastMark: function (e)');
    expect(daySource).toContain('wl0.completedAt = closedAt');
    expect(daySource).toContain('delete wl0.activeRest');
    expect(daySource).toContain('removeTraining(ti)');
  });
});

describe('lifecycle силовой сессии', () => {
  it('все отмеченные подходы без completedAt остаются активной сессией и ведут к завершению', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 9, 20, 16, 0));
    try {
      const opened = [];
      const Parts = globalThis.HEYS.StrengthBuilderParts;
      render(React.createElement(Parts.SummaryCard, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, true)] }]),
          workoutLog: {
            startedAt: Date.now() - 20 * 60 * 1000,
            lastMarkAt: Date.now() - 10 * 1000,
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, true)] }]
          }
        },
        dateKey: '2026-08-09',
        onOpen: () => opened.push(true)
      }));

      expect(screen.getByText('Тренировка готова к завершению · 20:00')).toBeTruthy();
      expect(screen.getByText('все подходы закрыты · 2 из 2')).toBeTruthy();
      fireEvent.click(screen.getByText('Завершить тренировку'));
      expect(opened).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('после перезапуска показывает точное место возврата без второго кольца', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 9, 20, 16, 0));
    try {
      const opened = [];
      const startedAt = Date.now() - (52 * 60 + 14) * 1000;
      const lastMarkAt = new Date(2026, 7, 9, 19, 24, 0).getTime();
      const Parts = globalThis.HEYS.StrengthBuilderParts;
      render(React.createElement(Parts.SummaryCard, {
        training: {
          ...training([{ name: 'Жим гантелей', approaches: [work(24, 10, true), work(24, 10, true), work(24, 10, false)] }]),
          workoutLog: {
            startedAt,
            lastMarkAt,
            exercises: [{ name: 'Жим гантелей', approaches: [work(24, 10, true), work(24, 10, true), work(24, 10, false)] }],
          },
        },
        dateKey: '2026-08-09',
        onOpen: () => opened.push(true),
      }));

      expect(screen.getByText('Тренировка продолжается · 52:14')).toBeTruthy();
      expect(screen.getByText('последняя отметка в 19:24 · Жим гантелей 2 из 3')).toBeTruthy();
      expect(screen.queryByText('осталось')).toBeNull();
      fireEvent.click(screen.getByText('Вернуться в тренировку'));
      expect(opened).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('вчерашняя сессия не мотает ночь и даёт удалить, дописать или закрыть', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
    try {
      const actions = [];
      const Parts = globalThis.HEYS.StrengthBuilderParts;
      render(React.createElement(Parts.SummaryCard, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
          workoutLog: {
            startedAt: new Date(2026, 7, 9, 18, 40, 0).getTime(),
            lastMarkAt: new Date(2026, 7, 9, 19, 24, 0).getTime(),
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
          },
        },
        dateKey: '2026-08-09',
        onDelete: () => actions.push('delete'),
        onOpen: () => actions.push('edit'),
        onCloseAtLastMark: () => actions.push('close'),
      }));

      expect(screen.getByText('Вчерашняя не закрыта')).toBeTruthy();
      expect(screen.getByText('Тренировка 9 августа')).toBeTruthy();
      expect(screen.getByText('таймер остановлен на последней отметке в 19:24, чтобы не мотать всю ночь')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(6 * 60 * 60 * 1000); });
      expect(screen.getByText('таймер остановлен на последней отметке в 19:24, чтобы не мотать всю ночь')).toBeTruthy();
      for (const label of ['удалить', 'дописать', 'закрыть']) fireEvent.click(screen.getByText(label));
      expect(actions).toEqual(['delete', 'edit', 'close']);
      expect(screen.getByText(/Таймер привязан к подходу, который его запустил/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('completedAt закрывает offscreen-сессию даже при оставшихся подходах', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
    try {
      const completedAt = new Date(2026, 7, 9, 19, 24, 0).getTime();
      const Parts = globalThis.HEYS.StrengthBuilderParts;
      render(React.createElement(Parts.SummaryCard, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
          workoutLog: {
            startedAt: new Date(2026, 7, 9, 18, 40, 0).getTime(),
            lastMarkAt: completedAt,
            completedAt,
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
          },
        },
        dateKey: '2026-08-09',
        onOpen: () => {},
      }));

      expect(screen.queryByText('Вчерашняя не закрыта')).toBeNull();
      expect(screen.queryByText(/Тренировка продолжается/)).toBeNull();
      expect(screen.getByText('Открыть конструктор')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('после паузы больше 45 минут предлагает продолжить или завершить последней отметкой', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T20:51:00'));
    try {
      const lastMarkAt = new Date('2026-08-09T19:47:00').getTime();
      const patches = [];
      render(React.createElement(SB.BuilderScreen, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
          workoutLog: {
            startedAt: new Date('2026-08-09T19:40:00').getTime(),
            firstMarkAt: new Date('2026-08-09T19:41:00').getTime(),
            lastMarkAt,
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
          },
        },
        dateKey: '2026-08-09', profile: {}, onPatch: () => {},
        onPatchSession: (patch) => patches.push(patch), onClose: () => {},
      }));

      expect(screen.getByText('Тренировка на паузе')).toBeTruthy();
      expect(screen.getByText('1 из 2 подходов · вас не было 64:00')).toBeTruthy();
      fireEvent.click(screen.getByText('Завершить в 19:47'));
      expect(patches.at(-1)).toEqual({ completedAt: lastMarkAt, activeRest: null });
      expect(screen.getByText('Тренировка завершена')).toBeTruthy();
      expect(screen.getByText('6:00')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('«Продолжить» убирает паузу без изменения журнала', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T20:51:00'));
    try {
      const patches = [];
      render(React.createElement(SB.BuilderScreen, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
          workoutLog: {
            startedAt: new Date('2026-08-09T19:40:00').getTime(),
            lastMarkAt: new Date('2026-08-09T19:47:00').getTime(),
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
          },
        },
        dateKey: '2026-08-09', profile: {}, onPatch: () => {},
        onPatchSession: (patch) => patches.push(patch), onClose: () => {},
      }));

      fireEvent.click(screen.getByText('Продолжить'));
      expect(screen.queryByText('Тренировка на паузе')).toBeNull();
      expect(patches).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('таймер берёт persisted startedAt и замирает на completedAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T18:42:00Z'));
    try {
      const completedAt = Date.now() - 30000;
      const startedAt = completedAt - 60000;
      const persistedTraining = {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
          time: '06:00',
          workoutLog: {
            startedAt,
            completedAt,
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }],
          },
        };
      const builderView = render(React.createElement(SB.BuilderScreen, {
        training: persistedTraining,
        dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
      }));

      expect(screen.getByText(/⏱ 1:00/)).toBeTruthy();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.getByText(/⏱ 1:00/)).toBeTruthy();

      builderView.unmount();
      const Parts = globalThis.HEYS.StrengthBuilderParts;
      render(React.createElement(Parts.SummaryCard, {
        training: persistedTraining, dateKey: '2026-08-09', onOpen: () => {},
      }));
      expect(screen.getByText('1:00')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.getByText('1:00')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('первая отметка пишет старт и обе метки, следующая двигает только lastMarkAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T18:40:00Z'));
    try {
      const patches = [];
      render(React.createElement(SB.BuilderScreen, {
        training: training([{ name: 'Жим', approaches: [work(75, 8, false), work(75, 8, false)] }]),
        dateKey: '2026-08-09', profile: {}, onPatch: () => {},
        onPatchSession: (patch) => patches.push(patch), onClose: () => {},
      }));

      fireEvent.click(screen.getAllByLabelText('Отметить выполненным')[0]);
      const first = patches.find((patch) => patch.firstMarkAt);
      expect(first).toEqual({
        startedAt: Date.now(), firstMarkAt: Date.now(), lastMarkAt: Date.now(),
      });

      vi.setSystemTime(new Date('2026-08-09T18:40:30Z'));
      fireEvent.click(screen.getByLabelText('Отметить выполненным'));
      const marks = patches.filter((patch) => patch.lastMarkAt);
      expect(marks).toHaveLength(2);
      expect(marks[1]).toEqual({ lastMarkAt: Date.now() });
    } finally {
      vi.useRealTimers();
    }
  });

  it('«Готово» фиксирует completedAt и одним патчем очищает отдых', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T18:45:00Z'));
    try {
      const patches = [];
      const closed = [];
      render(React.createElement(SB.BuilderScreen, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
          workoutLog: {
            startedAt: Date.now() - 300000,
            activeRest: { startedAt: Date.now() - 10000, total: 90 },
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }],
          },
        },
        dateKey: '2026-08-09', profile: {}, onPatch: () => {},
        onPatchSession: (patch) => patches.push(patch), onClose: () => closed.push(1),
      }));

      fireEvent.click(screen.getByText('Завершить тренировку'));
      fireEvent.click(screen.getByText('Готово'));

      expect(patches).toContainEqual({
        completedAt: Date.now(), activeRest: null, finish: true,
      });
      expect(closed).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
