import fs from 'fs';
import path from 'path';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STEPS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_steps_v1.js'),
  'utf8'
);

const TODAY = new Date('2026-08-15T12:00:00.000Z');

function buildStepsHistoryMap(stepsValue, dayCount, today = TODAY) {
  const map = {};
  for (let i = 1; i <= dayCount; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    map[d.toISOString().slice(0, 10)] = { steps: stepsValue };
  }
  return map;
}

function makeReadDay(map) {
  return (dateKey) => map[dateKey] || {};
}

function loadStepsModule(profile = {}, options = {}) {
  const configs = {};
  const profileStore = { ...profile };
  const dayMap = {};

  if (options.dayHistory) {
    const historyMap = buildStepsHistoryMap(
      options.dayHistory.value,
      options.dayHistory.count,
      options.dayHistory.today || TODAY
    );
    Object.entries(historyMap).forEach(([dateKey, data]) => {
      dayMap[`heys_dayv2_${dateKey}`] = data;
    });
  }

  if (options.dayMap) {
    Object.entries(options.dayMap).forEach(([dateKey, data]) => {
      dayMap[`heys_dayv2_${dateKey}`] = data;
    });
  }

  window.React = React;
  window.HEYS = {
    StepModal: {
      WheelPicker: () => null,
      TimePicker: () => null,
      registerStep: (id, config) => { configs[id] = config; },
      utils: {
        lsGet: (key, fallback) => {
          if (key === 'heys_profile') return profileStore;
          if (Object.prototype.hasOwnProperty.call(dayMap, key)) return dayMap[key];
          return fallback;
        },
        lsSet: vi.fn(),
        getTodayKey: () => TODAY.toISOString().slice(0, 10),
      },
    },
    scales: {
      stepsGoal: (value) => ({ color: '#3b82f6', step: value }),
    },
  };

  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();

  return {
    configs,
    profileStore,
    computeAdaptiveStepsGoal: window.HEYS.Steps.computeAdaptiveStepsGoal,
    resolveStepsGoalContext: window.HEYS.Steps.resolveStepsGoalContext,
    stepsGoalSliderValueToRatio: window.HEYS.Steps.stepsGoalSliderValueToRatio,
    stepsGoalSliderRatioToValue: window.HEYS.Steps.stepsGoalSliderRatioToValue,
    stepsGoalSliderStepForValue: window.HEYS.Steps.stepsGoalSliderStepForValue,
  };
}

describe('computeAdaptiveStepsGoal', () => {
  afterEach(() => {
    delete window.HEYS;
    delete window.React;
  });

  it('caps ratchet days near 12k instead of avg*1.2', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule({ weight: 60 });
    const readDay = makeReadDay(buildStepsHistoryMap(12667, 14));

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: { weight: 60 },
    });

    expect(stats.recommended).toBeLessThanOrEqual(12000);
    expect(stats.recommended).not.toBe(15200);
    expect(stats.median).toBe(12667);
  });

  it('uses soft +5% progression from median history', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule();
    const readDay = makeReadDay(buildStepsHistoryMap(10000, 10));

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: {},
    });

    expect(stats.recommended).toBe(10500);
    expect(stats.baseline).toBe(10500);
  });

  it('falls back to profile.stepsGoal when history is sparse', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule({ stepsGoal: 9000 });
    const readDay = makeReadDay(buildStepsHistoryMap(8000, 2));

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: { stepsGoal: 9000 },
    });

    expect(stats.fallback).toBe(true);
    expect(stats.recommended).toBe(9000);
  });

  it('lowers the goal after short or poor sleep', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule();
    const readDay = makeReadDay(buildStepsHistoryMap(10000, 10));

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: {},
      allStepData: {
        sleepTime: { sleepHours: 5.5 },
        sleepQuality: { sleepQuality: 7 },
      },
    });

    expect(stats.recommended).toBe(8900);
    expect(stats.modifiers.some((item) => item.id === 'sleep')).toBe(true);
  });

  it('lowers the goal for a low morning energy bucket', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule();
    const readDay = makeReadDay(buildStepsHistoryMap(10000, 10));

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: {},
      allStepData: {
        morning_mood: { mood: 2, wellbeing: 2, stress: 9 },
      },
    });

    expect(stats.recommended).toBe(8900);
    expect(stats.modifiers.some((item) => item.id === 'energy_low')).toBe(true);
  });

  it('raises the goal slightly for high energy but keeps the cap', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule();
    const readDay = makeReadDay(buildStepsHistoryMap(12000, 10));

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: {},
      allStepData: {
        morning_mood: { mood: 9, wellbeing: 9, stress: 1 },
      },
    });

    expect(stats.baseline).toBe(12000);
    expect(stats.recommended).toBe(12000);
    expect(stats.modifiers.some((item) => item.id === 'energy_high')).toBe(true);
  });

  it('lowers the goal on a heavy training day', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule();
    const todayKey = TODAY.toISOString().slice(0, 10);
    const readDay = makeReadDay({
      ...buildStepsHistoryMap(10000, 10),
      [todayKey]: {
        trainings: [{
          type: 'strength',
          z: [50, 10, 0, 0],
          plan: { status: 'assigned' },
        }],
      },
    });

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: {},
    });

    expect(stats.recommended).toBe(8900);
    expect(stats.modifiers.some((item) => item.id === 'training')).toBe(true);
  });

  it('rounds to hundreds and respects the 7000 floor', () => {
    const { computeAdaptiveStepsGoal } = loadStepsModule();
    const readDay = makeReadDay(buildStepsHistoryMap(6600, 10));

    const stats = computeAdaptiveStepsGoal({
      readDay,
      today: TODAY,
      profile: {},
    });

    expect(stats.recommended).toBe(7000);
    expect(stats.recommended % 100).toBe(0);
  });
});

describe('stepsGoal getInitialData', () => {
  afterEach(() => {
    delete window.HEYS;
    delete window.React;
  });

  it('uses morning check-in stepData for adaptive recommendation', () => {
    const { configs } = loadStepsModule(
      { weight: 60, stepsGoal: 10000 },
      { dayHistory: { value: 10000, count: 10 } }
    );

    const initial = configs.stepsGoal.getInitialData(
      { dateKey: TODAY.toISOString().slice(0, 10) },
      {
        sleepTime: { sleepHours: 5.5 },
        sleepQuality: { sleepQuality: 7 },
        morning_mood: { mood: 2, wellbeing: 2, stress: 9 },
      }
    );

    expect(initial.stepsGoal).toBe(7600);
  });
});

describe('stepsGoal slider visual map', () => {
  afterEach(() => {
    delete window.HEYS;
    delete window.React;
  });

  it('puts the 10k norm near two-thirds of the track', () => {
    const {
      stepsGoalSliderValueToRatio,
      stepsGoalSliderRatioToValue,
      stepsGoalSliderStepForValue,
    } = loadStepsModule();

    expect(stepsGoalSliderValueToRatio(3000)).toBeCloseTo(0, 5);
    expect(stepsGoalSliderValueToRatio(10000)).toBeCloseTo(2 / 3, 5);
    expect(stepsGoalSliderValueToRatio(30000)).toBeCloseTo(1, 5);
    // Linear 3k–30k would put 10k at ~26%; keep it clearly past mid.
    expect(stepsGoalSliderValueToRatio(10000)).toBeGreaterThan(0.6);

    expect(stepsGoalSliderRatioToValue(0)).toBe(3000);
    expect(stepsGoalSliderRatioToValue(2 / 3)).toBe(10000);
    expect(stepsGoalSliderRatioToValue(1)).toBe(30000);

    expect(stepsGoalSliderStepForValue(9000)).toBe(100);
    expect(stepsGoalSliderStepForValue(10000)).toBe(500);
    expect(stepsGoalSliderStepForValue(15000)).toBe(500);
  });

  it('uses finer steps below the norm and coarser above', () => {
    const { stepsGoalSliderRatioToValue } = loadStepsModule();
    const leftMid = stepsGoalSliderRatioToValue(1 / 3);
    const rightMid = stepsGoalSliderRatioToValue(5 / 6);

    expect(leftMid % 100).toBe(0);
    expect(leftMid).toBeLessThan(10000);
    expect(rightMid % 500).toBe(0);
    expect(rightMid).toBeGreaterThan(10000);
  });
});
