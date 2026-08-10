import fs from 'fs';
import path from 'path';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STEPS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_steps_v1.js'),
  'utf8'
);

// Загружаем библиотеку шагов и отдаём конфиги, зарегистрированные в StepModal.
function loadStepConfigs() {
  const configs = {};
  window.React = React;
  window.HEYS = {
    StepModal: {
      WheelPicker: () => null,
      TimePicker: () => null,
      registerStep: (id, config) => { configs[id] = config; },
      utils: {
        lsGet: (_key, fallback) => fallback,
        lsSet: vi.fn(),
        getTodayKey: () => '2026-08-10',
      },
    },
  };

  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();
  return configs;
}

function captureEvent(name) {
  const events = [];
  const handler = (e) => events.push(e);
  window.addEventListener(name, handler);
  return { events, stop: () => window.removeEventListener(name, handler) };
}

describe('XP events for sleep and weight', () => {
  let configs;

  beforeEach(() => {
    localStorage.clear();
    configs = loadStepConfigs();
  });

  afterEach(() => {
    delete window.HEYS;
  });

  it('weight step dispatches heysWeightLogged on save', () => {
    const captured = captureEvent('heysWeightLogged');
    try {
      configs.weight.save({ weightKg: 72, weightG: 5 }, { dateKey: '2026-08-10' });
    } finally {
      captured.stop();
    }

    expect(captured.events).toHaveLength(1);
    expect(captured.events[0].detail).toMatchObject({
      weight: 72.5,
      date: '2026-08-10',
      source: 'weight-step',
    });
  });

  it('sleep time step dispatches heysSleepLogged on save', () => {
    const captured = captureEvent('heysSleepLogged');
    try {
      configs.sleepTime.save(
        { sleepStartH: 23, sleepStartM: 30, sleepEndH: 7, sleepEndM: 0 },
        { dateKey: '2026-08-10' }
      );
    } finally {
      captured.stop();
    }

    expect(captured.events).toHaveLength(1);
    expect(captured.events[0].detail).toMatchObject({
      date: '2026-08-10',
      sleepStart: '23:30',
      sleepEnd: '07:00',
      source: 'sleep-step',
    });
    expect(captured.events[0].detail.sleepHours).toBeCloseTo(7.5, 5);
  });

  it('rendering steps does not dispatch XP events without save', () => {
    const sleep = captureEvent('heysSleepLogged');
    const weight = captureEvent('heysWeightLogged');
    try {
      configs.sleepTime.getInitialData({ dateKey: '2026-08-10' });
      configs.weight.getInitialData({ dateKey: '2026-08-10' });
    } finally {
      sleep.stop();
      weight.stop();
    }

    expect(sleep.events).toHaveLength(0);
    expect(weight.events).toHaveLength(0);
  });
});
