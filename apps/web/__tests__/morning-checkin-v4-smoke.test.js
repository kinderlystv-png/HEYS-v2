import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');
const SYNC_MERGE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_sync_merge_v1.js'), 'utf8');

const DATE_KEY = '2026-08-16';
const CLIENT_ID = 'client-v4';

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;

function loadMorning({
  day = {},
  profile = {},
  ledger = null,
  yesterdayRequired = false,
  requiredOnly,
} = {}) {
  const dayKey = `heys_${CLIENT_ID}_dayv2_${DATE_KEY}`;
  const progressKey = `heys_${CLIENT_ID}_morning_checkin_progress_v1_${DATE_KEY}`;
  const values = new Map([[dayKey, { date: DATE_KEY, ...day }]]);
  if (ledger) values.set(progressKey, structuredClone(ledger));
  localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({
    _sourceClientId: CLIENT_ID,
    profileCompleted: true,
    ...profile,
  }));

  window.HEYS = {
    currentClientId: CLIENT_ID,
    _consentsValid: true,
    store: {
      readSafe: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
      set: (key, value) => values.set(key, structuredClone(value)),
    },
    utils: { getCurrentClientId: () => CLIENT_ID },
    dayUtils: { todayISO: () => DATE_KEY },
    ProfileSteps: { isProfileIncomplete: () => false },
    Steps: {
      shouldShowCycleStep: () => false,
      shouldShowMeasurements: () => false,
    },
    Refeed: { shouldShowRefeedStep: () => false },
    YesterdayVerifyReady: true,
    YesterdayVerify: {
      stepRegistered: true,
      shouldShow: vi.fn(() => yesterdayRequired),
    },
    Subscription: {
      getCachedStatus: () => 'trial',
      getLocalStatus: () => 'trial',
      canWriteStatus: (status) => ['trial', 'active'].includes(status),
    },
  };
  if (!window.HEYS.models) {
    const modelsSrc = fs.readFileSync(path.resolve(__dirname, '../heys_models_v1.js'), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(modelsSrc)();
  }
  // eslint-disable-next-line no-new-func
  new Function(SYNC_MERGE_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(MORNING_SRC)();
  return { HEYS: window.HEYS, utils: window.HEYS.MorningCheckinUtils, values };
}

afterEach(() => {
  window.HEYS = originalHEYS;
  if (originalLocalStorage) {
    localStorage.clear();
  }
  vi.restoreAllMocks();
});

describe('morning check-in v4 plan', () => {
  it('source contracts exist', () => {
    expect(MORNING_SRC).toContain("steps.push('sleep')");
    expect(MORNING_SRC).toContain("steps.push('morningRest')");
    expect(MORNING_SRC).toContain("steps.push('checkinRecorded')");
    expect(MORNING_SRC).toContain('function collapseLegacyCheckinStepIds');
    expect(STEPS_SRC).toContain("registerStep('sleep'");
    expect(STEPS_SRC).toContain("registerStep('morningRest'");
    expect(STEPS_SRC).toContain("registerStep('checkinRecorded'");
    expect(STEPS_SRC).toContain("weightMorningSource");
    expect(STEPS_SRC).toContain('estimated_avg');
    expect(STEPS_SRC).toContain('estimated_profile');
  });

  it('full morning is five visible screens plus recorded, yesterday outside dots', () => {
    const { utils } = loadMorning({ yesterdayRequired: true });
    const steps = utils.getCheckinSteps({}, { yesterdayVerifyRequired: true });
    expect(steps).toEqual([
      'yesterdayVerify',
      'weight',
      'sleep',
      'morning_mood',
      'stepsGoal',
      'morningRest',
      'checkinRecorded',
    ]);
    expect(steps).not.toContain('sleepTime');
    expect(steps).not.toContain('cold_exposure');
    expect(steps).not.toContain('morningRoutine');
  });

  it('requiredOnly reopen drops the optional fifth screen and recorded', () => {
    const { utils } = loadMorning({
      day: { weightMorning: 72, sleepStart: '23:00', sleepEnd: '07:00' },
    });
    const steps = utils.getCheckinSteps({ stepsGoal: 9000 }, { requiredOnly: true, filterCompleted: true });
    expect(steps).not.toContain('morningRest');
    expect(steps).not.toContain('checkinRecorded');
    expect(steps).toContain('sleep');
    expect(steps).toContain('morning_mood');
    expect(steps).toContain('stepsGoal');
  });

  it('collapses a stale sleepTime/sleepQuality ledger into one sleep screen', () => {
    const { utils } = loadMorning({
      day: {},
      ledger: {
        plannedStepIds: ['weight', 'sleepTime', 'sleepQuality', 'morning_mood'],
        steps: {
          weight: { status: 'synced' },
          sleepTime: { status: 'planned' },
          sleepQuality: { status: 'planned' },
          morning_mood: { status: 'planned' },
        },
      },
    });
    expect(utils.collapseLegacyCheckinStepIds(['sleepTime', 'sleepQuality', 'morning_mood'])).toEqual([
      'sleep',
      'morning_mood',
    ]);
    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    expect(plan.steps).toContain('sleep');
    expect(plan.steps).not.toContain('sleepTime');
    expect(plan.steps).not.toContain('sleepQuality');
  });
});
