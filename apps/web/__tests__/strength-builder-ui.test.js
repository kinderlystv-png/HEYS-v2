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
        training: training([{ name: 'Жим лёжа', restSec: 90, approaches: [{ weightKg: '75', reps: 8, done: false }] }]),
        dateKey: '2026-08-09',
        profile: {},
        onPatch: () => {},
        onClose: () => {},
      }));
      fireEvent.click(screen.getByLabelText('Отметить выполненным'));
      act(() => { vi.advanceTimersByTime(91000); });
      expect(created.length).toBe(1);
      expect(created[0].title).toBe('Отдых закончился');
      expect(created[0].opts.body).toContain('Жим лёжа');
    } finally {
      vi.useRealTimers();
    }
  });
});
