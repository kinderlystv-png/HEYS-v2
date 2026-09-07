import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(__dirname, '..');

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });

function training(exercises) {
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    plan: { status: 'started' },
    workoutLog: {
      startedAt: new Date(2026, 7, 9, 18, 40, 0).getTime(),
      lastMarkAt: new Date(2026, 7, 9, 19, 24, 0).getTime(),
      exercises,
    },
  };
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  loadScript('_kernel/heys_kernel_strength_v1.js');
  loadScript('strength/heys_strength_superset_ui_v1.js');
  loadScript('heys_day_trainings_v1.js');
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('брошенная вчерашняя сессия — три исхода', () => {
  const Parts = () => window.HEYS.StrengthBuilderParts;
  const DT = () => window.HEYS.dayTrainings;

  it('finishPastDay закрывает на lastMarkAt без переноса дня', () => {
    const lastMarkAt = new Date(2026, 7, 9, 19, 24, 0).getTime();
    const input = training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]);
    const out = DT().finishPastDay(input);
    expect(out.workoutLog.completedAt).toBe(lastMarkAt);
    expect(out.workoutLog.activeRest).toBeUndefined();
    expect(out.plan.status).toBe('done');
    expect(out.workoutLog.startedAt).toBe(input.workoutLog.startedAt);
  });

  it('finishPastDay без lastMarkAt не закрывает сессию', () => {
    const input = training([{ name: 'Жим', approaches: [work(75, 8, false)] }]);
    input.workoutLog.lastMarkAt = 0;
    const out = DT().finishPastDay(input);
    expect(out.workoutLog.completedAt).toBeUndefined();
  });

  it('deletePastSession убирает тренировку с дня', () => {
    const day = {
      trainings: [
        training([{ name: 'Жим', approaches: [work(75, 8, true)] }]),
        training([{ name: 'Тяга', approaches: [work(60, 10, true)] }]),
      ],
    };
    const out = DT().deletePastSession(day, 0);
    expect(out.trainings).toHaveLength(1);
    expect(out.trainings[0].workoutLog.exercises[0].name).toBe('Тяга');
  });

  it('SummaryCard: три кнопки вызывают удалить / дописать / завершить', () => {
    const actions = [];
    render(React.createElement(Parts().SummaryCard, {
      training: training([{ name: 'Жим', approaches: [work(75, 8, true), work(75, 8, false)] }]),
      dateKey: '2026-08-09',
      onDelete: () => actions.push('delete'),
      onOpen: () => actions.push('resume'),
      onCloseAtLastMark: () => actions.push('finish'),
    }));

    expect(screen.getByText('Вчерашняя не закрыта')).toBeTruthy();
    fireEvent.click(screen.getByText('Удалить сессию'));
    fireEvent.click(screen.getByText('Дописать'));
    fireEvent.click(screen.getByText('Завершить вчерашним'));
    expect(actions).toEqual(['delete', 'resume', 'finish']);
  });
});
