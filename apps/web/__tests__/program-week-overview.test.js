// program-week-overview.test.js — обзор программы куратора у клиента.
//
// Дизайн-ревью 2026-08-10 (экраны 16c/16d) заменило прежнюю карточку-календарь:
// она занимала место каждый день, а менялась раз в неделю, ничего не предлагала
// сделать сегодня и исчезала, когда цикл выполнен — то есть пропадала ровно в
// лучший его момент. Осталась строка и только в день без тренировки; второй
// слой показывает путь (сколько прошёл / сколько осталось), а не таблицу дат
// со статусами.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

function loadModule() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8'));
  return globalThis.HEYS.dayTrainings;
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}
function iso(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}
function addDays(base, delta) {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

// Среда: у «завтра» и «послезавтра» есть место в той же ISO-неделе.
const ANCHOR = new Date(2026, 7, 12);
const T0 = iso(ANCHOR);
const T1 = iso(addDays(ANCHOR, 1));
const T2 = iso(addDays(ANCHOR, 2));

function program(days, status = 'active') {
  return { id: 'pr_1', title: 'Верх/низ, 4 недели', weeks: 4, status, days };
}

function fakeYandexApi({ programData, dayBlobs = {} }) {
  return {
    async getKV(_clientId, key) {
      if (key === 'heys_training_program') return { data: programData, error: null };
      return { data: null, error: null };
    },
    async getKVBatch(_clientId, keys) {
      return { data: keys.filter((k) => dayBlobs[k]).map((k) => ({ k, v: dayBlobs[k] })), error: null };
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(ANCHOR);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ProgramNextLine — первый слой', () => {
  const twoDayProgram = () => ({
    programData: program([
      { date: T1, dayLabel: 'День A', weekIndex: 1, trainingId: 'tr_1' },
      { date: T2, dayLabel: 'День B', weekIndex: 1, trainingId: 'tr_2' },
    ]),
    dayBlobs: {
      ['heys_dayv2_' + T1]: { trainings: [{ id: 'tr_1', plan: { status: 'assigned' } }] },
      ['heys_dayv2_' + T2]: { trainings: [{ id: 'tr_2', plan: { status: 'assigned' } }] },
    },
  });

  it('в день без тренировки — строка, названная по-человечески, а не датой', async () => {
    const { ProgramNextLine } = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi(twoDayProgram());

    await act(async () => {
      render(React.createElement(ProgramNextLine, { clientId: 'c1', hasPlanToday: false }));
    });

    expect(screen.getByText(/Следующая тренировка/)).toBeTruthy();
    expect(screen.getByText('завтра')).toBeTruthy();
    // Ссылка названа словом кадра «Актив · день отдыха» — строчная
    // «программа ›» (сведение 31 августа).
    expect(screen.getByText(/программа/)).toBeTruthy();
  });

  it('в день с планом строки нет вовсе — карточка плана уже всё сказала', async () => {
    const { ProgramNextLine } = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi(twoDayProgram());

    const { container } = render(
      React.createElement(ProgramNextLine, { clientId: 'c1', hasPlanToday: true }),
    );
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('без активной программы строки нет', async () => {
    const { ProgramNextLine } = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi({ programData: null });

    const { container } = render(
      React.createElement(ProgramNextLine, { clientId: 'c1', hasPlanToday: false }),
    );
    await act(async () => {});
    expect(container.innerHTML).toBe('');
  });

  it('выполненные и пропущенные дни в «следующую» не идут', async () => {
    const { ProgramNextLine } = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi({
      programData: program([
        { date: T1, dayLabel: 'День A', weekIndex: 1, trainingId: 'tr_1' },
        { date: T2, dayLabel: 'День B', weekIndex: 1, trainingId: 'tr_2' },
      ]),
      dayBlobs: {
        ['heys_dayv2_' + T1]: { trainings: [{ id: 'tr_1', plan: { status: 'skipped' } }] },
        ['heys_dayv2_' + T2]: { trainings: [{ id: 'tr_2', plan: { status: 'assigned' } }] },
      },
    });

    await act(async () => {
      render(React.createElement(ProgramNextLine, { clientId: 'c1', hasPlanToday: false }));
    });
    // Пропущенный завтрашний пропускаем, ближайшая — послезавтра.
    expect(screen.queryByText('завтра')).toBeNull();
    expect(screen.getByText(/четверг|пятниц|суббот|воскресень|понедельник|вторник|сред/)).toBeTruthy();
  });
});

describe('ProgramPathScreen — второй слой', () => {
  const days = [
    { date: '2026-08-03', dayLabel: 'День A', weekIndex: 1, status: 'done' },
    { date: '2026-08-05', dayLabel: 'День B', weekIndex: 1, status: 'done' },
    { date: '2026-08-07', dayLabel: 'День C', weekIndex: 1, status: 'skipped' },
    { date: T1, dayLabel: 'День A', weekIndex: 2, status: 'assigned' },
    { date: T2, dayLabel: 'День B', weekIndex: 2, status: 'assigned' },
  ];

  it('показывает путь: сколько сделано из скольких и сколько осталось', () => {
    const { ProgramPathScreen } = loadModule();
    render(React.createElement(ProgramPathScreen, {
      program: program([], 'active'), days, onClose: () => {},
    }));

    expect(screen.getByText('Сделано 2 из 5')).toBeTruthy();
    expect(screen.getByText(/осталось 2/)).toBeTruthy();
  });

  it('считает сделанным только done, но не started и не skipped', () => {
    const { ProgramPathScreen } = loadModule();
    render(React.createElement(ProgramPathScreen, {
      program: program([], 'active'),
      days: [
        { date: '2026-08-10', status: 'done' },
        { date: '2026-08-11', status: 'started' },
        { date: '2026-08-12', status: 'skipped' },
      ],
      onClose: () => {},
    }));

    expect(screen.getByText('Сделано 1 из 3')).toBeTruthy();
  });

  it('дат и слова «статус» во втором слое нет — это отчёт куратора, не путь клиента', () => {
    const { ProgramPathScreen } = loadModule();
    const { container } = render(React.createElement(ProgramPathScreen, {
      program: program([], 'active'), days, onClose: () => {},
    }));

    const text = container.textContent;
    expect(text).not.toMatch(/статус/i);
    expect(text).not.toMatch(/\d{2}\.\d{2}/);
  });

  it('называет ближайшую тренировку и её место в неделе', () => {
    const { ProgramPathScreen } = loadModule();
    render(React.createElement(ProgramPathScreen, {
      program: program([], 'active'), days, onClose: () => {},
    }));

    expect(screen.getByText('Ближайшая')).toBeTruthy();
    expect(screen.getByText(/День A/)).toBeTruthy();
  });
});

describe('lifecycle workoutLog', () => {
  it('частичный патч сохраняет первую/последнюю отметки и очищает activeRest явно', () => {
    const { mergeWorkoutLifecyclePatch } = loadModule();
    const merged = mergeWorkoutLifecyclePatch({
      startedAt: 100,
      firstMarkAt: 100,
      lastMarkAt: 200,
      activeRest: { startedAt: 200, total: 90 },
      exercises: [],
    }, { completedAt: 300, activeRest: null, finish: true });

    expect(merged).toEqual({
      startedAt: 100,
      firstMarkAt: 100,
      lastMarkAt: 200,
      completedAt: 300,
      exercises: [],
    });
  });

  it('finish переводит только начатый план в done и хранит время завершения', () => {
    const { finishStartedWorkoutPlan } = loadModule();
    const done = finishStartedWorkoutPlan({ plan: { status: 'started', id: 'p1' } });
    expect(done.plan).toEqual({ status: 'done', id: 'p1' });

    const assigned = { plan: { status: 'assigned', id: 'p2' } };
    expect(finishStartedWorkoutPlan(assigned)).toBe(assigned);
  });
});

describe('placeInWeek — место дня в своей неделе', () => {
  it('«вторая из трёх на неделе», а не дата следующей', () => {
    const { placeInWeek } = loadModule();
    const week = [{ date: '2026-08-10' }, { date: '2026-08-12' }, { date: '2026-08-14' }];
    expect(placeInWeek(week, '2026-08-12')).toBe('вторая из трёх на неделе');
    expect(placeInWeek(week, '2026-08-10')).toBe('первая из трёх на неделе');
  });

  it('одна тренировка в неделе места не получает — сообщать нечего', () => {
    const { placeInWeek } = loadModule();
    expect(placeInWeek([{ date: '2026-08-12' }], '2026-08-12')).toBe('');
  });
});

describe('projectProgramWeek — проекция недели из owner-index программы', () => {
  it('не рисует статусы константами и сохраняет неизвестный owner-день неизвестным', () => {
    const { projectProgramWeek } = loadModule();
    const ownerProgram = program([
      { date: '2026-08-10', weekIndex: 2 },
      { date: '2026-08-12', weekIndex: 2 },
      { date: '2026-08-14', weekIndex: 2 },
    ]);
    const ownerDays = [
      { date: '2026-08-10', status: 'done' },
      { date: '2026-08-12', status: 'assigned' },
      { date: '2026-08-14', status: null },
    ];

    const week = projectProgramWeek(
      ownerProgram,
      ownerDays,
      '2026-08-12',
      { id: 'pl_1', programId: 'pr_1', status: 'assigned' },
    );
    expect(week.map((day) => day.weekday)).toEqual(['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']);
    expect(week.map((day) => day.kind)).toEqual([
      'done', 'rest', 'assigned', 'rest', 'unknown', 'rest', 'rest',
    ]);
  });

  it('чужой programId не получает чужую неделю', () => {
    const { projectProgramWeek } = loadModule();
    expect(projectProgramWeek(program([]), [], T0, { programId: 'pr_other' })).toBeNull();
  });
});

describe('перенос тренировки — след в обе стороны', () => {
  it('не называет отсутствующий в кэше день свободным', () => {
    const { moveOptionsFor } = loadModule();
    expect(typeof moveOptionsFor).toBe('function');
    const opts = moveOptionsFor(T0);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => typeof o.date === 'string' && typeof o.weekday === 'string')).toBe(true);
    expect(opts[0].label).toMatch(/^Завтра,/);
    expect(opts[0].unknown).toBe(true);
    expect(opts[0].busy).toBe(true);
    expect(opts[0].details).toBe('Данные дня ещё не загружены');
    expect(opts.some((o) => o.date === T1)).toBe(true);
  });

  it('явно загруженный пустой день можно назвать свободным', () => {
    const { moveOptionsFor } = loadModule();
    globalThis.HEYS.utils = {
      lsGet(key, fallback) {
        return key.endsWith('_dayv2_' + T1) || key === 'heys_dayv2_' + T1
          ? { date: T1, trainings: [] }
          : fallback;
      },
    };
    const option = moveOptionsFor(T0).find((item) => item.date === T1);
    expect(option.unknown).toBe(false);
    expect(option.busy).toBe(false);
    expect(option.details).toBe('Свободно');
  });

  it('авторитетный пустой batch снимает fail-closed блокировку выбора', async () => {
    const { ProgramPlanCard } = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi({
      programData: program([{ date: T0, weekIndex: 1, trainingId: 'tr_1' }]),
      dayBlobs: {},
    });
    globalThis.HEYS.StrengthBuilderParts = {
      PlanCard(props) {
        const available = (props.moveOptions || []).filter((option) => !option.busy).length;
        return React.createElement('span', { 'data-testid': 'available-move-days' }, String(available));
      },
    };

    await act(async () => {
      render(React.createElement(ProgramPlanCard, {
        clientId: 'c1',
        dateKey: T0,
        training: { plan: { id: 'pl_1', programId: 'pr_1', status: 'assigned', weekIndex: 1 } },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('available-move-days').textContent).toBe('5');
  });

  it('видимая подпись недели совпадает с Canvas и не добавляет порядковое место дня', async () => {
    const { ProgramPlanCard } = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi({
      programData: {
        ...program([
          { date: '2026-08-10', weekIndex: 2, trainingId: 'tr_0' },
          { date: T0, weekIndex: 2, trainingId: 'tr_1' },
          { date: '2026-08-14', weekIndex: 2, trainingId: 'tr_2' },
        ]),
        title: 'мезоцикл «База»',
      },
      dayBlobs: {
        ['heys_dayv2_' + T0]: {
          trainings: [{ id: 'tr_1', plan: { status: 'assigned' } }],
        },
      },
    });
    globalThis.HEYS.StrengthBuilderParts = {
      PlanCard(props) {
        return React.createElement('span', { 'data-testid': 'week-label' }, props.weekLabel);
      },
    };

    await act(async () => {
      render(React.createElement(ProgramPlanCard, {
        clientId: 'c1',
        dateKey: T0,
        training: {
          plan: { id: 'pl_1', programId: 'pr_1', status: 'assigned', weekIndex: 2 },
        },
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('week-label').textContent)
      .toBe('Неделя 2 из 4 · мезоцикл «База»');
    expect(screen.getByTestId('week-label').textContent).not.toContain('из трёх на неделе');
  });

  it('варианты начинаются со следующего дня — сегодня переносить некуда', () => {
    const { moveOptionsFor } = loadModule();
    const opts = moveOptionsFor(T0);
    expect(opts.some((o) => o.date === T0)).toBe(false);
  });
});
