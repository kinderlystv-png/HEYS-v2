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
        lsGet: (key, fallback) => {
          const raw = window.localStorage.getItem(key);
          if (raw == null) return fallback;
          try { return JSON.parse(raw); } catch { return raw; }
        },
        lsSet: (key, value) => {
          window.localStorage.setItem(key, JSON.stringify(value));
        },
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

  it('estimated weight save does not dispatch heysWeightLogged and keeps the flag', () => {
    localStorage.setItem('heys_profile', JSON.stringify({ weight: 74.2 }));
    const captured = captureEvent('heysWeightLogged');
    try {
      configs.weight.save(
        { estimated: true, estimateSource: 'profile', weightKg: 74, weightG: 2 },
        { dateKey: '2026-08-10' }
      );
    } finally {
      captured.stop();
    }

    expect(captured.events).toHaveLength(0);
    const saved = JSON.parse(localStorage.getItem('heys_dayv2_2026-08-10'));
    expect(saved.weightMorning).toBe(74.2);
    expect(saved.weightMorningEstimated).toBe(true);
    expect(JSON.parse(localStorage.getItem('heys_profile')).weight).toBe(74.2);
  });

  it('estimateMorningWeight averages three measured days and ignores estimated ones', () => {
    localStorage.setItem('heys_profile', JSON.stringify({ weight: 80 }));
    localStorage.setItem('heys_dayv2_2026-08-09', JSON.stringify({ weightMorning: 73.4 }));
    localStorage.setItem('heys_dayv2_2026-08-08', JSON.stringify({ weightMorning: 73.5 }));
    localStorage.setItem('heys_dayv2_2026-08-07', JSON.stringify({ weightMorning: 73.9 }));
    localStorage.setItem('heys_dayv2_2026-08-06', JSON.stringify({
      weightMorning: 90,
      weightMorningEstimated: true,
    }));

    const estimate = window.HEYS.Steps.estimateMorningWeight();
    expect(estimate.source).toBe('estimated_avg');
    expect(estimate.weight).toBe(73.6);
    expect(estimate.samples).toHaveLength(3);
  });
});
