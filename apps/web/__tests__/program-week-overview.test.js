// program-week-overview.test.js — обзор программы куратора на карточке дня.
//
// Слой 4 CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md: «ближайшая
// тренировка + на неделе ещё N» первым слоем, весь цикл — вторым, по
// «Подробнее». Индекс heys_training_program — снимок на момент назначения,
// не источник правды: живой статус каждого дня тесты подсовывают отдельно
// через getKVBatch, как это делает и сам виджет.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

function loadModule() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8'));
  return globalThis.HEYS.dayTrainings.ProgramWeekOverviewCard;
}

// Виджет берёт «сегодня» из системных часов локальным временем
// (todayDateKeyForPlan: getFullYear/getMonth/getDate, не UTC). Системное время
// фиксируем на среду — иначе тест «на неделе ещё N» ломается всякий раз, когда
// реальный запуск приходится на воскресенье (последний день ISO-недели: у
// «завтра» уже нет места в этой неделе).
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

const ANCHOR = new Date(2026, 7, 12); // среда
const T0 = iso(ANCHOR);
const T1 = iso(addDays(ANCHOR, 1));
const T2 = iso(addDays(ANCHOR, 2));

function program(days, status = 'active') {
  return {
    id: 'pr_1',
    title: 'Верх/низ, 4 недели',
    weeks: 4,
    status,
    days,
  };
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

describe('ProgramWeekOverviewCard', () => {
  it('показывает ближайшую тренировку и остаток недели, не показывает весь цикл сразу', async () => {
    const ProgramWeekOverviewCard = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi({
      programData: program([
        { date: T0, dayLabel: 'День A', weekIndex: 1, trainingId: 'tr_0' },
        { date: T1, dayLabel: 'День B', weekIndex: 1, trainingId: 'tr_1' },
      ]),
      dayBlobs: {
        ['heys_dayv2_' + T0]: { trainings: [{ id: 'tr_0', plan: { status: 'assigned' } }] },
        ['heys_dayv2_' + T1]: { trainings: [{ id: 'tr_1', plan: { status: 'assigned' } }] },
      },
    });

    await act(async () => {
      render(React.createElement(ProgramWeekOverviewCard, { clientId: 'c1' }));
    });

    expect(screen.getByText(/Следующая по плану: День A/)).toBeTruthy();
    expect(screen.getByText(/На неделе ещё 1/)).toBeTruthy();
    expect(screen.queryByText('Верх/низ, 4 недели')).toBeNull();
  });

  it('раскрывает весь цикл по клику на «Подробнее», прошедшие дни помечены отдельно', async () => {
    const ProgramWeekOverviewCard = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi({
      programData: program([
        { date: T0, dayLabel: 'День A', weekIndex: 1, trainingId: 'tr_0' },
        { date: T2, dayLabel: 'День C', weekIndex: 1, trainingId: 'tr_2' },
      ]),
      dayBlobs: {
        ['heys_dayv2_' + T0]: { trainings: [{ id: 'tr_0', plan: { status: 'assigned' } }] },
        ['heys_dayv2_' + T2]: { trainings: [{ id: 'tr_2', plan: { status: 'assigned' } }] },
      },
    });

    await act(async () => {
      render(React.createElement(ProgramWeekOverviewCard, { clientId: 'c1' }));
    });

    fireEvent.click(screen.getByText('Подробнее'));
    expect(screen.getByText('Верх/низ, 4 недели · 4 нед.')).toBeTruthy();
    expect(screen.getByText('День A')).toBeTruthy();
    expect(screen.getByText('День C')).toBeTruthy();
  });

  it('день уже started не в счёте «ближайшая/на неделе» — расчёт по живому статусу, не по индексу', async () => {
    const ProgramWeekOverviewCard = loadModule();
    globalThis.HEYS.YandexAPI = fakeYandexApi({
      programData: program([
        { date: T0, dayLabel: 'День A', weekIndex: 1, trainingId: 'tr_0' },
        { date: T1, dayLabel: 'День B', weekIndex: 1, trainingId: 'tr_1' },
      ]),
      dayBlobs: {
        // Клиент уже начал День A локально — индекс программы этого не знает.
        ['heys_dayv2_' + T0]: { trainings: [{ id: 'tr_0', plan: { status: 'started' } }] },
        ['heys_dayv2_' + T1]: { trainings: [{ id: 'tr_1', plan: { status: 'assigned' } }] },
      },
    });

    await act(async () => {
      render(React.createElement(ProgramWeekOverviewCard, { clientId: 'c1' }));
    });

    expect(screen.getByText(/Следующая по плану: День B/)).toBeTruthy();
    expect(screen.queryByText(/На неделе ещё/)).toBeNull();
  });

  it('без активной программы или без ожидающих дней ничего не рендерит', async () => {
    const ProgramWeekOverviewCard = loadModule();

    globalThis.HEYS.YandexAPI = fakeYandexApi({ programData: null });
    const { container: c1 } = render(React.createElement(ProgramWeekOverviewCard, { clientId: 'c1' }));
    await act(async () => {});
    expect(c1.innerHTML).toBe('');
    cleanup();

    globalThis.HEYS.YandexAPI = fakeYandexApi({
      programData: program([{ date: T0, dayLabel: 'День A', weekIndex: 1, trainingId: 'tr_0' }]),
      dayBlobs: { ['heys_dayv2_' + T0]: { trainings: [{ id: 'tr_0', plan: { status: 'done' } }] } },
    });
    const { container: c2 } = render(React.createElement(ProgramWeekOverviewCard, { clientId: 'c1' }));
    await act(async () => {});
    expect(c2.innerHTML).toBe('');
  });
});
