// strength-builder-templates.test.js — шаблоны тренировок.
//
// Строки контракта: «вид · итоги сессии» (в конце «В шаблоны» 48 на --c2 и
// «Готово»), «шторка — семь входов» (шаблоны — первый вход), «пустая
// тренировка» (повтор прошлой и шаблон стоят строками .cd). Стережём цепочку
// целиком: сохранить с итогов → лежит в клиентском хранилище тем же путём, что
// избранное каталога → виден в шторке ⋯ и на пустой тренировке → старт даёт
// состав без прошлых подходов через тот же owner-callback, что «Повторить».

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadModules(utils) {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = utils ? { utils: utils } : {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS;
}

const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });

function finishedExercises() {
  return [
    { id: 'ex1', name: 'Жим лёжа', restSec: 120, rpe: 8, note: 'тяжело', reopened: false, approaches: [
      { weightKg: '40', reps: 10, done: true, type: 'warmup' },
      work(75, 8, true), work(75, 8, true)
    ] },
    { id: 'ex2', name: 'Подтягивания', ssGroup: 1, unit: 'bodyweight', bodyweightFactor: 1, restSec: 90, approaches: [work(0, 10, true), work(0, 9, true)] },
    { id: 'ex3', name: 'Тяга блока', ssGroup: 1, restSec: 90, approaches: [
      Object.assign(work(55, 10, true), { drops: [{ weightKg: '44', reps: 6, done: true }] }),
      work(55, 10, true)
    ] }
  ];
}

function finishedTraining() {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    workoutLog: { title: 'Силовая · грудь, спина', exercises: finishedExercises(), startedAt: 1, completedAt: 2 }
  };
}

let HEYS;

beforeEach(() => {
  window.localStorage.clear();
  HEYS = loadModules();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('хранилище шаблонов', () => {
  it('состав уходит без прошлых подходов, тяжести и заметки; веса и повторы остаются планом', () => {
    const api = HEYS.StrengthBuilderParts.strengthTemplates;
    const entry = api.save('Силовая · грудь, спина', finishedExercises());
    expect(entry.name).toBe('Силовая · грудь, спина');
    expect(entry.exercises.map((ex) => ex.name)).toEqual(['Жим лёжа', 'Подтягивания', 'Тяга блока']);
    const bench = entry.exercises[0];
    expect(bench.approaches).toEqual([
      { weightKg: '40', reps: 10, done: false, type: 'warmup' },
      { weightKg: '75', reps: 8, done: false },
      { weightKg: '75', reps: 8, done: false }
    ]);
    expect(bench.rpe).toBeUndefined();
    expect(bench.note).toBeUndefined();
    expect(bench.id).toBeUndefined();
    expect(bench.restSec).toBe(120);
    // Связка и единица едут в шаблон: без них состав — не та тренировка.
    expect(entry.exercises[1].ssGroup).toBe(1);
    expect(entry.exercises[1].unit).toBe('bodyweight');
    expect(entry.exercises[2].approaches[0].drops).toEqual([{ weightKg: '44', reps: 6, done: false }]);
    expect(api.list().map((row) => row.id)).toEqual([entry.id]);
  });

  it('пишет тем же путём, что избранное каталога — через utils.lsSet клиентского скоупа', () => {
    const store = {};
    const utils = {
      lsGet: vi.fn((key, fallback) => (key in store ? store[key] : fallback)),
      lsSet: vi.fn((key, value) => { store[key] = value; })
    };
    const H = loadModules(utils);
    const api = H.StrengthBuilderParts.strengthTemplates;
    api.save('Ноги', [{ name: 'Присед', approaches: [work(100, 5, true)] }]);
    expect(utils.lsSet).toHaveBeenCalledWith('heys_strength_templates_v1', expect.objectContaining({ items: expect.any(Array) }));
    expect(api.list()).toHaveLength(1);
    expect(window.localStorage.getItem('heys_strength_templates_v1')).toBeNull();
  });

  it('шаблон с тем же именем заменяется, удаление снимает его из списка', () => {
    const api = HEYS.StrengthBuilderParts.strengthTemplates;
    const first = api.save('Ноги', [{ name: 'Присед', approaches: [work(100, 5, true)] }]);
    const second = api.save('Ноги', [{ name: 'Жим ногами', approaches: [work(120, 10, true)] }]);
    expect(api.list()).toHaveLength(1);
    expect(api.list()[0].id).toBe(second.id);
    expect(api.remove(first.id)).toBe(false);
    expect(api.remove(second.id)).toBe(true);
    expect(api.list()).toEqual([]);
  });

  it('пустой состав шаблоном не становится', () => {
    const api = HEYS.StrengthBuilderParts.strengthTemplates;
    expect(api.save('Пусто', [{ name: '', approaches: [] }])).toBeNull();
    expect(api.list()).toEqual([]);
  });
});

describe('итоги · «В шаблоны»', () => {
  function renderFinish() {
    render(React.createElement(HEYS.StrengthFinishUI.FinishScreen, {
      training: finishedTraining(),
      dateKey: '2026-08-08',
      elapsedSec: 3270,
      bodyWeightKg: 80,
      dayTonnageKg: 0,
      strengthCount: 1,
      historyFor: () => null,
      historyDetailFor: () => ({ usages: [], record: null }),
      onDone: vi.fn(),
      onBack: vi.fn()
    }));
  }

  it('стоит перед «Готово», сохраняет под именем сессии и показывает тост с отменой', () => {
    renderFinish();
    const save = screen.getByText('В шаблоны');
    const done = screen.getByText('Готово');
    expect(save.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(save);
    const list = HEYS.StrengthBuilderParts.strengthTemplates.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Силовая · грудь, спина');
    expect(list[0].exercises.every((ex) => ex.approaches.every((a) => a.done === false))).toBe(true);
    expect(screen.getByText('Шаблон сохранён · Силовая · грудь, спина')).toBeTruthy();
    expect(screen.getByText('В шаблонах').disabled).toBe(true);

    fireEvent.click(screen.getByText('Отменить'));
    expect(HEYS.StrengthBuilderParts.strengthTemplates.list()).toEqual([]);
    expect(screen.queryByText(/Шаблон сохранён/)).toBeNull();
    expect(screen.getByText('В шаблоны').disabled).toBe(false);
  });

  it('тост гаснет сам, шаблон остаётся', () => {
    vi.useFakeTimers();
    renderFinish();
    fireEvent.click(screen.getByText('В шаблоны'));
    expect(screen.getByText(/Шаблон сохранён/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByText(/Шаблон сохранён/)).toBeNull();
    expect(HEYS.StrengthBuilderParts.strengthTemplates.list()).toHaveLength(1);
  });
});

describe('вход в шаблоны и старт', () => {
  function emptyTraining() {
    return { type: 'strength', strengthEntryMode: 'workout_builder', workoutLog: { exercises: [] } };
  }

  it('без шаблонов ни «Из шаблона», ни рабочего входа в шторке нет', () => {
    render(React.createElement(HEYS.StrengthBuilder.BuilderScreen, {
      training: emptyTraining(), dateKey: '2026-08-09', profile: {},
      onPatch: () => {}, onClose: () => {}, onRepeatLast: vi.fn(async () => [])
    }));
    expect(screen.queryByText('Из шаблона')).toBeNull();

    const rows = HEYS.StrengthBuilderParts.sheetRows({
      exercises: [{ name: 'Жим', approaches: [] }, { name: 'Тяга', approaches: [] }], openIdx: 0,
      close: () => {}, go: () => {}, setLinkFrom: () => {}, setHistoryName: () => {},
      setWarmupDropIdx: () => {}, setApproachTypesIdx: () => {}, templatesCount: 0, openTemplates: () => {}
    });
    expect(rows[0].t).toBe('Шаблоны тренировок');
    expect(rows[0].off).toBe(true);
    expect(rows[0].d).toContain('В шаблоны');
  });

  it('с шаблоном пустая тренировка даёт строку «Из шаблона», старт идёт через owner-callback без галочек', async () => {
    const saved = HEYS.StrengthBuilderParts.strengthTemplates.save('Силовая · грудь, спина', finishedExercises());
    const onRepeatLast = vi.fn(async (source) => source.map((ex) => Object.assign({}, ex, { id: 'live-' + ex.name })));
    render(React.createElement(HEYS.StrengthBuilder.BuilderScreen, {
      training: emptyTraining(), dateKey: '2026-08-09', profile: {},
      onPatch: () => {}, onClose: () => {}, lastSessionFor: () => null, onRepeatLast
    }));
    const row = screen.getByText('Из шаблона').closest('button');
    expect(within(row).getByText('1 шаблон')).toBeTruthy();
    fireEvent.click(row);

    expect(screen.getByText('Шаблоны тренировок')).toBeTruthy();
    expect(screen.getByText('Силовая · грудь, спина')).toBeTruthy();
    expect(screen.getByText('Жим лёжа · Подтягивания · Тяга блока')).toBeTruthy();
    fireEvent.click(screen.getByText('Силовая · грудь, спина'));

    expect(onRepeatLast).toHaveBeenCalledTimes(1);
    const [source] = onRepeatLast.mock.calls[0];
    expect(source).toEqual(saved.exercises);
    expect(source.every((ex) => ex.approaches.every((a) => !a.done))).toBe(true);
    await waitFor(() => expect(screen.getAllByText('Жим лёжа').length).toBeGreaterThan(0));
    expect(screen.queryByText('Шаблоны тренировок')).toBeNull();
  });

  it('вход из шторки ⋯ открывает список, крест удаляет шаблон', () => {
    HEYS.StrengthBuilderParts.strengthTemplates.save('Ноги', [{ name: 'Присед', approaches: [work(100, 5, true)] }]);
    render(React.createElement(HEYS.StrengthBuilder.BuilderScreen, {
      training: { type: 'strength', workoutLog: { exercises: [{ name: 'Жим', approaches: [work(75, 8, false)] }] } },
      dateKey: '2026-08-09', profile: {},
      onPatch: () => {}, onClose: () => {}, onRepeatLast: vi.fn(async () => [])
    }));
    fireEvent.click(screen.getByLabelText('Ещё'));
    const entry = screen.getByText('Шаблоны тренировок').closest('button');
    expect(entry.disabled).toBe(false);
    fireEvent.click(entry);
    expect(screen.getByText('Ноги')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Удалить шаблон Ноги'));
    expect(HEYS.StrengthBuilderParts.strengthTemplates.list()).toEqual([]);
    expect(screen.getByText('Шаблонов пока нет')).toBeTruthy();
  });

  it('тренировку с закрытыми подходами шаблон не подменяет — вход в шторке погашен', () => {
    HEYS.StrengthBuilderParts.strengthTemplates.save('Ноги', [{ name: 'Присед', approaches: [work(100, 5, true)] }]);
    render(React.createElement(HEYS.StrengthBuilder.BuilderScreen, {
      training: { type: 'strength', workoutLog: { exercises: [{ name: 'Жим', approaches: [work(75, 8, true)] }] } },
      dateKey: '2026-08-09', profile: {},
      onPatch: () => {}, onClose: () => {}, onRepeatLast: vi.fn(async () => [])
    }));
    fireEvent.click(screen.getByLabelText('Ещё'));
    expect(screen.getByText('Шаблоны тренировок').closest('button').disabled).toBe(true);
  });
});
