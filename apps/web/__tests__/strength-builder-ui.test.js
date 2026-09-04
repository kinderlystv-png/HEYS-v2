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
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
  ev('strength/heys_strength_catalog_ui_v1.js');
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
    fireEvent.click(screen.getByText('Разминка и дроп-сет'));
    expect(screen.getByText('разм.')).toBeTruthy();
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
    fireEvent.click(screen.getByText('Разминка и дроп-сет'));
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
    expect(screen.getByText('1 / 1 ✓')).toBeTruthy();
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

  it('шапка показывает прогресс, а незакрытый остаток остаётся в доступном имени кнопки', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByRole('button', { name: 'Завершить тренировку · 1 не закрыто' })).toBeTruthy();
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
    expect(screen.getByText('⏱ Отдых 2:00 — по тяжести 7')).toBeTruthy();
    expect(screen.getByLabelText('Тяжесть подхода 7 из 10')).toBeTruthy();
    expect(screen.queryByText(/RPE/i)).toBeNull();
    expect(screen.queryByLabelText(/RPE/i)).toBeNull();
  });
});

const A2_COLLAPSED_NOTE = 'Состояние, в котором список живёт между упражнениями: карточку свернули, подход закрыт, следующее ещё не начато. Раскрытие — тап по карточке, и прежняя сворачивается сама: две открытые карточки не бывают. «Завершить» остаётся тихой, пока счёт незакрытых не дошёл до нуля.';
const A1B_OPEN_NOTE = 'Тот же состав, шесть правок против шума. Сделанное не громче текущего: у закрытых упражнений и подходов снята зелёная заливка, сигнал остался один — галочка. Акцент указывает одно место: обводка карточки говорит «открыто здесь», рамка полей — «писать сюда»; номера, кольцо галочки и обводка активной строки приглушены, потому что шесть акцентов внутри одного блока не акцентируют ничего. Заливки больше не вложены тройкой: строки внутри карточки живут на её фоне. Шкала тяжести без обводок — это одна необязательная оценка, а не второй блок веса таблицы. Счётчик незакрытых снят с кнопки: он уже стоит бейджем в шапке.';

describe('конструктор: спокойная нижняя панель', () => {
  it('свёрнутый список показывает состояния из Canvas в номере и одной строке', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([
        { name: 'Жим лёжа', approaches: [work(75, 8, true), work(75, 12, true)] },
        { name: 'Жим гантелей сидя', approaches: [work(24, 10, true), work(24, 12, false)] },
        { name: 'Разведение', approaches: [work(20, 12, false)] },
      ]),
      dateKey: '2026-08-09',
      profile: {},
      historyFor: (name) => name === 'Жим лёжа' ? { record: { maxW: 75 } } : null,
      onPatch: () => {},
      onClose: () => {},
    }));

    expect(document.querySelector('.sb-builder-note')?.textContent).toBe(A1B_OPEN_NOTE);

    fireEvent.click(screen.getByRole('button', { name: /Жим лёжа/ }));
    expect(document.querySelector('.sb-builder-note')?.textContent).toBe(A2_COLLAPSED_NOTE);
    expect(screen.getByText('2 × 8–12 · 75 кг · рекорд')).toBeTruthy();
    expect(screen.getByText('сейчас · подход 2 из 2')).toBeTruthy();
    expect(screen.getByText('1 × 12 · 20 кг · не начато')).toBeTruthy();
    expect(screen.getByText('Добавить упражнение')).toBeTruthy();
    expect(document.querySelector('.sb-ex.is-complete .sb-ex-state')?.textContent).toBe('✓');
    expect(document.querySelector('.sb-ex.is-current .sb-ex-state')?.textContent).toBe('раскрыть ›');
  });

  it('держит открытой не больше одной карточки и синхронизирует aria-expanded', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([
        { name: 'Жим', approaches: [work(75, 8, false)] },
        { name: 'Тяга', approaches: [work(60, 10, false)] },
      ]),
      dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));

    const first = screen.getByRole('button', { name: /Жим/ });
    const second = screen.getByRole('button', { name: /Тяга/ });
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(second.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(second);
    expect(document.querySelectorAll('.sb-ex.is-open')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Жим/ }).getAttribute('aria-expanded')).toBe('false');
    const openedSecond = screen.getByRole('button', { name: /Тяга/ });
    expect(openedSecond.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(openedSecond);
    expect(document.querySelectorAll('.sb-ex.is-open')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /Тяга/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('показывает незакрытый остаток тихой кнопкой', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));

    const finish = screen.getByRole('button', { name: 'Завершить тренировку · 1 не закрыто' });
    expect(finish).toBeTruthy();
    expect(finish.classList.contains('is-ready')).toBe(false);
  });

  it('делает завершение главным действием только при нулевом остатке', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
      dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));

    const finish = screen.getByRole('button', { name: 'Завершить тренировку' });
    expect(finish.classList.contains('is-ready')).toBe(true);
    fireEvent.click(finish);
    expect(screen.getByText('Тренировка завершена')).toBeTruthy();
  });

  it('открытый кадр берёт прошлый подход из detail и переносит вторичные действия в overflow', () => {
    const patched = [];
    const source = training([{
      name: 'Жим гантелей сидя',
      unit: 'weight_reps',
      approaches: [work(22.5, 12, true), work(24, 10, true), work(24, 10, false), work(24, 10, false)],
    }]);
    source.workoutLog.startedAt = Date.now();

    render(React.createElement(SB.BuilderScreen, {
      training: source,
      dateKey: '2026-08-09',
      profile: {},
      historyFor: () => ({ record: { maxW: 25, maxSet: 250 } }),
      historyDetailFor: () => ({
        usages: [{ approaches: [{ weightKg: '22.5', reps: 12, done: true }] }],
      }),
      onPatch: (next) => patched.push(next),
      onClose: () => {},
    }));

    expect(document.querySelector('.sb-builder-screen.is-exercise-open')).toBeTruthy();
    expect(screen.getByText('Прошлый раз · 22,5 × 12')).toBeTruthy();
    expect(screen.getByText('Рекорд · 25 × 10')).toBeTruthy();
    expect(screen.queryByText('идёт')).toBeNull();
    expect(document.querySelectorAll('.sb-aps > .sb-ap')).toHaveLength(3);
    expect(document.querySelectorAll('.sb-aps > .sb-ap.is-current')).toHaveLength(1);
    expect(document.querySelectorAll('.sb-aps > .sb-ap.is-done .sb-ap-value')).toHaveLength(4);

    fireEvent.click(screen.getByLabelText('Отметить выполненным'));
    expect(document.querySelectorAll('.sb-aps > .sb-ap')).toHaveLength(4);
    expect(document.querySelectorAll('.sb-aps > .sb-ap.is-current')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Ещё' }));
    expect(screen.getByRole('button', { name: /Добавить подход/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Добавить сброс/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Связать упражнения/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Добавить подход/ }));
    expect(patched.at(-1)[0].approaches).toHaveLength(5);
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
    const reopened = screen.getByRole('button', { name: 'Завершить тренировку · 1 не закрыто' });
    expect(reopened).toBeTruthy();
    expect(screen.getByText('1 / 2 ✓')).toBeTruthy();
  });
});

describe('каталог конструктора по Canvas Б2', () => {
  it('показывает компактные группы и прошлый результат без собственной арифметики', () => {
    globalThis.HEYS.getExerciseSuggestions = () => [{
      name: 'Тяга штанги в наклоне',
      norm: 'тяга штанги в наклоне',
      rank: 1,
      favorite: true,
    }];
    const Catalog = globalThis.HEYS.StrengthCatalogUI.CatalogScreen;
    render(React.createElement(Catalog, {
      onPick: () => {},
      onCreate: () => {},
      onBack: () => {},
      historyFor: () => ({
        last: { approaches: [{ weightKg: '60', reps: 8, done: true }] },
        record: null,
      }),
    }));

    expect(document.querySelector('.sb-catalog-screen')).toBeTruthy();
    expect(document.querySelector('.sb-cat-row')).toBeTruthy();
    expect(screen.getByText('Спина · прошлый раз 60 × 8')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ноги' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Квадрицепс' })).toBeTruthy();
    expect(screen.getByText(/Строка создания появляется/)).toBeTruthy();
  });
});

describe('создание связки по Canvas З1', () => {
  it('собирает выбор, раунды, отдых и прогноз в одну композицию', () => {
    const Cat = globalThis.HEYS.StrengthCatalogUI;
    const exercises = [
      { name: 'Жим лёжа', restSec: 90, approaches: [work(75, 8, false)] },
      { name: 'Тяга', restSec: 120, approaches: [work(60, 10, false)] },
      { name: 'Жим гантелей', restSec: 90, approaches: [work(24, 12, false)] },
      { name: 'Разведение', restSec: 60, approaches: [work(20, 12, false)] },
    ];
    render(React.createElement(Cat.SupersetScreen, {
      exercises,
      startIndex: 0,
      onCreate: () => {},
      onCancel: () => {},
    }));

    fireEvent.click(screen.getByRole('button', { name: /Трисет/ }));
    expect(screen.getByText('2:00')).toBeTruthy();
    expect(screen.getByText('3 упражнения подряд без паузы, затем отдых 2:00. Так 3 раза.')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.getByText('13 мин')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Собрать связку · 9 подходов' })).toBeTruthy();
    expect(document.querySelectorAll('.sb-superset-result .sb-tile')).toHaveLength(3);
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
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
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
    expect(screen.getByRole('timer', { name: 'Отдых 1:40 осталось' })).toBeTruthy();
    expect(document.querySelector('.sb-rest-ring svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('свернуть')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Тяга/ }));
    expect(screen.getByRole('button', { name: 'Отдых 1:40 · Жим. Идёт от подхода, который его запустил. Развернуть' })).toBeTruthy();
    expect(screen.getByText('Отдых 1:40 · Жим')).toBeTruthy();
    expect(screen.getByText('идёт от подхода, который его запустил')).toBeTruthy();
    expect(screen.getByText('Отдых 1:40 · Жим')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Отдых 1:40 · Жим.*Развернуть/ })).toBeTruthy();
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
    expect(screen.getByText('история')).toBeTruthy();
    expect(screen.getByText('3 подхода')).toBeTruthy();
    expect(screen.getByText('1 подход')).toBeTruthy();
    expect(screen.getByText(/Историю не переписываем/)).toBeTruthy();
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
    expect(screen.getByText(/Дискомфорт в плечо · 2-й подход/)).toBeTruthy();
    expect(screen.getByText('Снизить вес на 20 %')).toBeTruthy();
    expect(screen.getByText('Пропустить')).toBeTruthy();
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
    fireEvent.click(screen.getByText('Снизить вес на 20 %'));
    const aps = seen[0][0].approaches;
    expect(aps[0].weightKg).toBe('100');
    expect(aps[1].weightKg).toBe('80');
  });
});

describe('финал тренировки', () => {
  it('open пробрасывает day-owned summary и старт плана в production BuilderScreen', () => {
    const finishSummaryFor = vi.fn();
    const onStartPlan = vi.fn();
    globalThis.HEYS.TrainingKernel.fullscreen = {
      mount: ({ render: renderScreen }) => renderScreen({ close: vi.fn() }),
    };
    const element = SB.open({
      training: training([]),
      dateKey: '2026-08-09',
      finishSummaryFor,
      onStartPlan,
    });
    expect(element.props.finishSummaryFor).toBe(finishSummaryFor);
    expect(element.props.onStartPlan).toBe(onStartPlan);
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
  it('без плана главным остаётся «Собрать свою», а недоступные способы старта скрыты', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
    }));
    expect(screen.getByText('Пустая тренировка')).toBeTruthy();
    expect(screen.getByText('пусто · 0 подходов')).toBeTruthy();
    expect(screen.getByText('Собрать свою')).toBeTruthy();
    expect(screen.getByText(/Плана нет — главной становится/)).toBeTruthy();
    expect(screen.queryByText(/Начать по плану/)).toBeNull();
    expect(screen.queryByText(/Шаблон/)).toBeNull();
  });

  it('валидный снимок назначенного плана показывает состав и переходит только по owner acknowledgement', async () => {
    const started = [
      { name: 'Жим', approaches: [work(75, 8, false)] },
      { name: 'Тяга', approaches: [work(60, 10, false)] },
    ];
    const onStartPlan = vi.fn(async () => started);
    render(React.createElement(SB.BuilderScreen, {
      training: {
        workoutLog: { exercises: [] },
        plan: { id: 'pl_1', status: 'assigned', assignedAt: 1000, dayLabel: 'День B', assignedBy: 'Артём' },
        planSnapshot: {
          exercises: [
            { name: 'Жим', approaches: [work(75, 8, true)] },
            { name: 'Тяга', approaches: [work(60, 10, true)] },
          ],
        },
      },
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onStartPlan,
      onClose: () => {},
    }));
    expect(screen.getByText('Начать по плану · День B')).toBeTruthy();
    expect(screen.getByText('план на день · 0 подходов')).toBeTruthy();
    expect(screen.getByText('План на сегодня готов')).toBeTruthy();
    expect(screen.getByText('2 упражнения · назначил Артём')).toBeTruthy();
    expect(screen.getByText('Жим')).toBeTruthy();
    expect(screen.getByText('Тяга')).toBeTruthy();
    fireEvent.click(screen.getByText('Начать по плану · День B'));
    expect(onStartPlan).toHaveBeenCalledWith({ id: 'pl_1', assignedAt: 1000 });
    await waitFor(() => expect(screen.getByText('Жим')).toBeTruthy());
    expect(started[0].approaches[0].done).toBe(false);
  });

  it('отклонённый owner transition оставляет Builder пустым', async () => {
    render(React.createElement(SB.BuilderScreen, {
      training: {
        workoutLog: { exercises: [] },
        plan: { id: 'pl_stale', status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём' },
        planSnapshot: { exercises: [{ name: 'Жим', approaches: [work(75, 8, false)] }] },
      },
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onStartPlan: async () => null,
      onClose: () => {},
    }));
    fireEvent.click(screen.getByText('Начать по плану · День B'));
    await waitFor(() => expect(screen.getByText('План на сегодня готов')).toBeTruthy());
    expect(screen.queryByLabelText('Отметить выполненным')).toBeNull();
  });

  it('собственная тренировка из назначенного draft открывает каталог только после owner acknowledgement', async () => {
    const onStartCustom = vi.fn(async () => true);
    globalThis.HEYS.StrengthCatalogUI = {
      CatalogScreen: ({ onBack }) => React.createElement('div', null,
        'Каталог упражнений',
        React.createElement('button', { type: 'button', onClick: onBack }, 'Назад из каталога')
      ),
    };
    render(React.createElement(SB.BuilderScreen, {
      training: {
        workoutLog: { exercises: [] },
        plan: { id: 'pl_custom', status: 'assigned', assignedAt: 2000, dayLabel: 'День B', assignedBy: 'Артём' },
        planSnapshot: { exercises: [{ name: 'Жим', approaches: [work(75, 8, false)] }] },
      },
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onStartPlan: async () => null,
      onStartCustom,
      onClose: () => {},
    }));
    fireEvent.click(screen.getByText('Собрать свою'));
    expect(onStartCustom).toHaveBeenCalledWith({ id: 'pl_custom', assignedAt: 2000 });
    await waitFor(() => expect(screen.getByText('Каталог упражнений')).toBeTruthy());
    fireEvent.click(screen.getByText('Назад из каталога'));
    expect(screen.queryByText(/Начать по плану/)).toBeNull();
    fireEvent.click(screen.getByText('Собрать свою'));
    expect(onStartCustom).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Каталог упражнений')).toBeTruthy();
  });

  it('отклонённая собственная тренировка оставляет назначенный draft пустым', async () => {
    render(React.createElement(SB.BuilderScreen, {
      training: {
        workoutLog: { exercises: [] },
        plan: { id: 'pl_stale_custom', status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём' },
        planSnapshot: { exercises: [{ name: 'Жим', approaches: [work(75, 8, false)] }] },
      },
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onStartPlan: async () => null,
      onStartCustom: async () => false,
      onClose: () => {},
    }));
    fireEvent.click(screen.getByText('Собрать свою'));
    await waitFor(() => expect(screen.getByText('План на сегодня готов')).toBeTruthy());
    expect(screen.queryByText('Каталог упражнений')).toBeNull();
  });

  it('план без снимка или owner callback не рисует кнопку в пустоту', () => {
    render(React.createElement(SB.BuilderScreen, {
      training: {
        workoutLog: { exercises: [] },
        plan: { status: 'assigned', dayLabel: 'День B', assignedBy: 'Артём' },
      },
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onStartPlan: () => {},
      onClose: () => {},
    }));
    expect(screen.queryByText(/Начать по плану/)).toBeNull();
    expect(screen.getByText('Собрать свою')).toBeTruthy();
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

  it('с прошлой сессией повтор переходит в журнал только после owner acknowledgement', async () => {
    const repeated = [{ name: 'Жим', approaches: [work(75, 8, false)] }];
    const onRepeatLast = vi.fn(async () => repeated);
    render(React.createElement(SB.BuilderScreen, {
      training: training([]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: () => {},
      onClose: () => {},
      lastSessionFor: () => ({ dateKey: '2026-08-05', exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }] }),
      onRepeatLast,
    }));
    expect(screen.getByText('Повторить 5 августа')).toBeTruthy();
    expect(screen.getByText('1 упр.')).toBeTruthy();
    fireEvent.click(screen.getByText('Повторить 5 августа'));
    expect(onRepeatLast).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Жим')).toBeTruthy());
    expect(repeated[0].name).toBe('Жим');
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
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тренировку · 1 не закрыто' }));
    expect(screen.getByText('Остались незакрытые подходы')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Остались незакрытые подходы' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Оставить' }));
    expect(screen.getByText(/лучше убрать/)).toBeTruthy();
  });

  it('удерживает фокус внутри подтверждения и возвращает его после Escape или тапа по фону', async () => {
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
    }));

    const finish = screen.getByRole('button', { name: 'Завершить тренировку · 1 не закрыто' });
    fireEvent.click(finish);
    const keep = screen.getByRole('button', { name: 'Оставить' });
    const remove = screen.getByRole('button', { name: 'Убрать пустые' });

    remove.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(keep);
    keep.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(remove);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(finish));

    fireEvent.click(finish);
    fireEvent.click(document.querySelector('.sb-sheet-back'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(finish));
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
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тренировку · 1 не закрыто' }));
    fireEvent.click(screen.getByText('Убрать пустые'));
    const aps = seen[seen.length - 1][0].approaches;
    expect(aps.length).toBe(2);
    expect(aps[0].done).toBe(true);
    expect(aps[1].weightKg).toBe('');
    expect(aps[1].reps).toBe(0);
    expect(screen.getByText('Тренировка завершена')).toBeTruthy();
  });

  it('«Оставить» сохраняет строки и переходит к итогу', () => {
    const patched = [];
    const closed = [];
    render(React.createElement(SB.BuilderScreen, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      profile: {},
      onPatch: (n) => patched.push(n),
      onClose: () => closed.push(1),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Завершить тренировку · 1 не закрыто' }));
    fireEvent.click(screen.getByText('Оставить'));
    expect(patched.length).toBe(0);
    expect(closed.length).toBe(0);
    expect(screen.getByText('Тренировка завершена')).toBeTruthy();
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

  it('отпущенный план показывает причину и даёт передумать в текущем дне', () => {
    loadModules();
    const Parts = globalThis.HEYS.StrengthBuilderParts;
    const resumed = [];
    render(React.createElement(Parts.PlanCard, {
      training: planTraining({ status: 'skipped', skipReason: 'Плохое самочувствие' }),
      dateKey: '2026-08-09',
      isFutureDay: false,
      onResumeSkipped: () => resumed.push(1),
    }));
    expect(screen.getByText(/отпущен/)).toBeTruthy();
    expect(screen.getByText(/Плохое самочувствие/)).toBeTruthy();
    fireEvent.click(screen.getByText('Передумать'));
    expect(resumed.length).toBe(1);
  });

  it('прошедший отпущенный день не предлагает переписать задним числом', () => {
    loadModules();
    const Parts = globalThis.HEYS.StrengthBuilderParts;
    render(React.createElement(Parts.PlanCard, {
      training: planTraining({ status: 'skipped' }),
      dateKey: '2026-08-08',
      isFutureDay: false,
      isPastDay: true,
      onResumeSkipped: () => {},
    }));
    expect(screen.queryByText('Передумать')).toBeNull();
    expect(screen.getByText(/Тоннажа и подходов нет/)).toBeTruthy();
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

      expect(document.querySelector('.sb-rest-value')?.textContent).toContain('1:20');
      fireEvent.click(screen.getByText('+10 секунд'));
      expect(patches.at(-1).activeRest).toMatchObject({ startedAt, total: 100, owner: 'Жим' });
      expect(document.querySelector('.sb-rest-value')?.textContent).toContain('1:30');
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
    expect(daySource).toContain('onStartPlan: function (expectedPlan)');
    expect(daySource).toContain('onStartCustom: function (expectedPlan)');
    expect(daySource).toContain('matchesOpenedPlanRevision(t0, expectedPlan)');
    expect(daySource).toContain('return patchTrainingAcknowledged(ti, function (t0)');
    expect(daySource).toContain('ack.resolve(null);');
    expect(daySource).toContain('return prevDay;');
    expect(daySource).toContain("plan: { ...t0.plan, status: 'started' }");
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
      expect(screen.getByText('1 из 2 подходов · вас не было 1:04')).toBeTruthy();
      expect(screen.getByText('Последняя отметка')).toBeTruthy();
      expect(screen.getByText('Сейчас')).toBeTruthy();
      expect(screen.getByText('20:51')).toBeTruthy();
      expect(screen.getByText('Всё, что отмечено, на месте. Таймер отдыха вы не запускали — ждать нечего.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Ещё' })).toBeNull();
      expect(screen.queryByLabelText('Добавить упражнение')).toBeNull();
      expect(screen.queryByLabelText('Отметить выполненным')).toBeNull();
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

  it('ровно 45:00 оставляет тренировку доступной, а в 45:01 требует решения', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T20:32:00'));
    try {
      const lastMarkAt = Date.now() - 45 * 60 * 1000;
      const makeProps = () => ({
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
          workoutLog: {
            startedAt: lastMarkAt - 7 * 60 * 1000,
            lastMarkAt,
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
          },
        },
        dateKey: '2026-08-09', profile: {}, onPatch: () => {}, onClose: () => {},
      });

      const atBoundary = render(React.createElement(SB.BuilderScreen, makeProps()));
      expect(screen.queryByText('Тренировка на паузе')).toBeNull();
      expect(screen.getByLabelText('Отметить выполненным')).toBeTruthy();
      atBoundary.unmount();

      vi.setSystemTime(Date.now() + 1000);
      render(React.createElement(SB.BuilderScreen, makeProps()));
      expect(screen.getByText('Тренировка на паузе')).toBeTruthy();
      expect(screen.queryByLabelText('Отметить выполненным')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('протухший отдых назван точно и не очищается или запускается заново при продолжении', () => {
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
            lastMarkAt,
            activeRest: { startedAt: lastMarkAt, total: 90, exName: 'Жим' },
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
          },
        },
        dateKey: '2026-08-09', profile: {}, onPatch: () => {},
        onPatchSession: (patch) => patches.push(patch), onClose: () => {},
      }));

      expect(screen.getByText('Всё, что отмечено, на месте. Таймер отдыха истёк, пока вас не было, и заново не запускается.')).toBeTruthy();
      expect(patches).toHaveLength(0);
      fireEvent.click(screen.getByText('Продолжить'));
      expect(patches).toHaveLength(0);
      expect(screen.queryByLabelText(/Отдых/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('при сохранившемся таймере называет остаток и возвращает к нему по «Продолжить»', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T20:51:00'));
    try {
      const lastMarkAt = new Date('2026-08-09T19:47:00').getTime();
      const startedAt = new Date('2026-08-09T20:50:08').getTime();
      render(React.createElement(SB.BuilderScreen, {
        training: {
          ...training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
          workoutLog: {
            startedAt: new Date('2026-08-09T19:40:00').getTime(),
            lastMarkAt,
            activeRest: { startedAt, total: 90, exName: 'Жим' },
            exercises: [{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }],
          },
        },
        dateKey: '2026-08-09', profile: {}, onPatch: () => {},
        onPatchSession: () => {}, onClose: () => {},
      }));

      expect(screen.getByText('Всё, что отмечено, на месте. Таймер отдыха ещё идёт — осталось 0:38.')).toBeTruthy();
      fireEvent.click(screen.getByText('Продолжить'));
      expect(screen.queryByText('Тренировка на паузе')).toBeNull();
      expect(screen.getByLabelText(/Отдых 0:38/)).toBeTruthy();
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

      expect(screen.getByText('⏱ 1:00')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(5000); });
      expect(screen.getByText('⏱ 1:00')).toBeTruthy();

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

  it('«Готово» сохраняет feedback и заметку, фиксирует completedAt и одним патчем очищает отдых', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T18:45:00Z'));
    try {
      const patches = [];
      const calls = [];
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
        onPatchSession: (patch) => patches.push(patch),
        onPatchNote: (note) => calls.push(['note', note]),
        onFinishProposal: () => calls.push(['proposal']),
        onClose: () => calls.push(['close']),
      }));

      fireEvent.click(screen.getByText('Завершить тренировку'));
      fireEvent.change(screen.getByLabelText('настроение'), { target: { value: '7' } });
      fireEvent.change(screen.getByLabelText('самочувствие'), { target: { value: '8' } });
      fireEvent.change(screen.getByLabelText('стресс'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('Заметка к тренировке'), { target: { value: 'Легко' } });
      fireEvent.click(screen.getByText('Готово'));

      expect(patches).toContainEqual({
        completedAt: Date.now(), activeRest: null, finish: true,
        feedback: { mood: 7, wellbeing: 8, stress: 5 },
      });
      expect(calls).toEqual([
        ['note', 'Легко'],
        ['proposal'],
        ['close'],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
