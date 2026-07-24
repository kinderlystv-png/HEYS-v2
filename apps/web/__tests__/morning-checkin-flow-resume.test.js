import fs from 'fs';
import path from 'path';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const YESTERDAY_VERIFY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');
const SYNC_MERGE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_sync_merge_v1.js'), 'utf8');
const DATE_KEY = '2026-07-17';
const CLIENT_ID = 'client-1';
const PROGRESS_KEY = `heys_${CLIENT_ID}_morning_checkin_progress_v1_${DATE_KEY}`;
const LEGACY_PROGRESS_KEY = `heys_${CLIENT_ID}_heys_morning_checkin_progress_v1_${DATE_KEY}`;
const DAY_KEY = `heys_${CLIENT_ID}_dayv2_${DATE_KEY}`;

function loadStepModal() {
  window.React = React;
  window.ReactDOM = { createRoot: vi.fn() };
  window.HEYS = {
    utils: { lsGet: () => ({}), lsSet: vi.fn() },
    dayUtils: { todayISO: () => DATE_KEY },
  };
  // eslint-disable-next-line no-new-func
  new Function(STEP_MODAL_SRC)();
  return window.HEYS.StepModal;
}

function loadMorning({ day = {}, profile = {}, ledger = null, yesterdayRequired = false, yesterdayReady = true } = {}) {
  const values = new Map([[DAY_KEY, { date: DATE_KEY, ...day }]]);
  if (ledger) values.set(PROGRESS_KEY, structuredClone(ledger));
  localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({
    _sourceClientId: CLIENT_ID,
    profileCompleted: true,
    ...profile,
  }));

  window.React = React;
  window.HEYS = {
    currentClientId: CLIENT_ID,
    _consentsValid: true,
    store: {
      readSafe: (key, fallback) => values.has(key) ? values.get(key) : fallback,
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
    YesterdayVerifyReady: yesterdayReady,
    YesterdayVerify: {
      stepRegistered: yesterdayReady,
      shouldShow: vi.fn(() => yesterdayRequired),
    },
  };
  // eslint-disable-next-line no-new-func
  new Function(SYNC_MERGE_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(MORNING_SRC)();
  return { HEYS: window.HEYS, utils: window.HEYS.MorningCheckinUtils, values };
}

function completedDay() {
  return {
    weightMorning: 82.4,
    sleepStart: '23:30',
    sleepEnd: '07:30',
    sleepQuality: 7,
    moodMorning: 8,
    measurements: { waist: 84 },
    coldExposure: { type: 'none' },
    supplementsPlanned: [],
  };
}

function fullIncidentLedger(flowStatus = 'saved_local') {
  return {
    version: 1,
    clientId: CLIENT_ID,
    dateKey: DATE_KEY,
    flowId: 'flow-original',
    plannedStepIds: [
      'yesterdayVerify',
      'weight',
      'sleepTime',
      'sleepQuality',
      'morning_mood',
      'measurements',
      'cold_exposure',
      'supplements',
      'morningRoutine',
    ],
    steps: {
      yesterdayVerify: { status: 'planned' },
      weight: { status: 'synced' },
      sleepTime: { status: 'synced' },
      sleepQuality: { status: 'synced' },
      morning_mood: { status: 'synced' },
      measurements: { status: 'skipped' },
      cold_exposure: { status: 'saved_local', cloudPending: true },
      supplements: { status: 'synced' },
      morningRoutine: { status: 'synced' },
      __flow__: { status: flowStatus },
    },
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('StepModal forced visibility', () => {
  it('re-registers yesterdayVerify when StepModal becomes ready after its retry started', () => {
    window.React = React;
    window.HEYS = {};
    // eslint-disable-next-line no-new-func
    new Function(YESTERDAY_VERIFY_SRC)();

    const registry = {};
    window.HEYS.StepModal = {
      registry,
      registerStep: (id, config) => { registry[id] = config; },
    };
    act(() => {
      document.dispatchEvent(new CustomEvent('heys-stepmodal-ready'));
    });

    expect(registry.yesterdayVerify).toBeTruthy();
    expect(window.HEYS.YesterdayVerifyReady).toBe(true);
    expect(window.HEYS.YesterdayVerify.stepRegistered).toBe(true);
  });

  it('renders a frozen planned step when its config registers after mount', () => {
    const modal = loadStepModal();
    const view = render(React.createElement(modal.Component, {
      steps: ['sleepTime'],
      freezeVisibleSteps: true,
      showTip: false,
    }));

    expect(screen.getByText('Загружаем следующий шаг…')).toBeTruthy();
    act(() => {
      modal.registerStep('sleepTime', {
        title: 'Сон',
        component: () => React.createElement('div', null, 'sleep-time-ready'),
      });
    });

    expect(screen.getByText('sleep-time-ready')).toBeTruthy();
  });

  it('announces StepModal readiness so an earlier lazy step can re-register', () => {
    const ready = vi.fn();
    document.addEventListener('heys-stepmodal-ready', ready, { once: true });

    loadStepModal();

    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('keeps a planned step visible without changing ordinary shouldShow filtering', () => {
    const modal = loadStepModal();
    const component = (label) => () => React.createElement('div', null, label);
    modal.registerStep('yesterdayVerify', { component: component('forced-yesterday'), shouldShow: () => false });
    modal.registerStep('ordinaryConditional', { component: component('ordinary-hidden'), shouldShow: () => false });
    modal.registerStep('alwaysVisible', { component: component('always-visible') });

    const view = render(React.createElement(modal.Component, {
      steps: ['yesterdayVerify', 'ordinaryConditional', 'alwaysVisible'],
      forceVisibleStepIds: ['yesterdayVerify'],
      showTip: false,
    }));

    expect(screen.getByText('forced-yesterday')).toBeTruthy();
    expect(screen.queryByText('ordinary-hidden')).toBeNull();

    view.unmount();
    render(React.createElement(modal.Component, {
      steps: ['yesterdayVerify', 'ordinaryConditional', 'alwaysVisible'],
      showTip: false,
    }));
    expect(screen.getByText('always-visible')).toBeTruthy();
    expect(screen.queryByText('forced-yesterday')).toBeNull();
    expect(screen.queryByText('ordinary-hidden')).toBeNull();
  });

  it('keeps all nine planned incident steps in the wizard and completes the sequence', async () => {
    vi.useFakeTimers();
    const modal = loadStepModal();
    const ids = [
      'yesterdayVerify',
      'weight',
      'sleepTime',
      'sleepQuality',
      'morning_mood',
      'measurements',
      'cold_exposure',
      'supplements',
      'morningRoutine',
    ];
    ids.forEach((id) => {
      modal.registerStep(id, {
        component: () => React.createElement('div', null, id),
        shouldShow: id === 'yesterdayVerify' ? () => false : undefined,
        save: () => ({ completed: true }),
      });
    });
    const onComplete = vi.fn();
    const view = render(React.createElement(modal.Component, {
      steps: ids,
      forceVisibleStepIds: ['yesterdayVerify'],
      freezeVisibleSteps: true,
      requireStepAck: true,
      onComplete,
      showTip: false,
    }));

    expect(view.container.querySelectorAll('.mc-progress-dot')).toHaveLength(9);
    for (let index = 0; index < ids.length; index += 1) {
      expect(view.container.querySelector('.mc-step-content')?.textContent).toContain(ids[index]);
      fireEvent.click(screen.getByRole('button', { name: index === ids.length - 1 ? 'Готово' : 'Далее' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    }
    expect(onComplete).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('accepts only one synchronous completion tap while the final save is pending', async () => {
    let releaseSave;
    const savePending = new Promise((resolve) => { releaseSave = resolve; });
    const modal = loadStepModal();
    const save = vi.fn(() => savePending.then(() => ({ completed: true })));
    modal.registerStep('weight', {
      component: () => React.createElement('div', null, 'weight'),
      save,
    });
    const onComplete = vi.fn();
    render(React.createElement(modal.Component, {
      steps: ['weight'],
      requireStepAck: true,
      onComplete,
      showTip: false,
    }));

    const finish = screen.getByRole('button', { name: 'Готово' });
    act(() => {
      finish.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      finish.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      releaseSave();
      await savePending;
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('morning progress key migration', () => {
  it('reads the previous double-heys local key without continuing to write it', () => {
    const { utils, values } = loadMorning();
    values.set(LEGACY_PROGRESS_KEY, fullIncidentLedger());

    expect(utils.readMorningProgress(DATE_KEY, CLIENT_ID)?.flowId).toBe('flow-original');
    utils.writeMorningProgress(fullIncidentLedger(), CLIENT_ID);
    expect(values.get(PROGRESS_KEY)?.flowId).toBe('flow-original');
  });
});

describe('morning check-in journal resume', () => {
  it('repairs a partial persisted journal before resuming the flow', () => {
    const partialLedger = {
      plannedStepIds: ['weight'],
      steps: { weight: { status: 'planned', attempt: 1, updatedAt: 1000 } },
      updatedAt: 1000,
    };
    const { utils, values } = loadMorning({
      day: {},
      profile: {},
      ledger: partialLedger,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    const written = values.get(PROGRESS_KEY);

    expect(plan.flowId).toBeTruthy();
    expect(written).toMatchObject({
      version: 1,
      clientId: CLIENT_ID,
      dateKey: DATE_KEY,
      flowId: plan.flowId,
    });
    expect(written.steps.__flow__).toMatchObject({ status: 'open', attempt: 1 });
    expect(written.steps.weight.status).toBe('planned');
  });

  it('reconciles an obsolete planned yesterdayVerify after the current-day decision is already stored', () => {
    const { utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger: fullIncidentLedger(),
      yesterdayRequired: false,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    const written = values.get(PROGRESS_KEY);

    expect(plan.steps).toEqual([]);
    expect(plan.flowId).toBe('flow-original');
    expect(written.plannedStepIds).toHaveLength(9);
    expect(written.steps.measurements.status).toBe('skipped');
    expect(written.steps.cold_exposure.status).toBe('saved_local');
    expect(written.steps.__flow__.status).toBe('saved_local');
    expect(utils.getBlockingMorningSteps({ ledger: written, dateKey: DATE_KEY, clientId: CLIENT_ID })).toEqual([]);
  });

  it('keeps a planned yesterdayVerify blocking while its decision module is not ready', () => {
    const { utils } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger: fullIncidentLedger(),
      yesterdayReady: false,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

    expect(plan.steps).toEqual(['yesterdayVerify']);
    expect(utils.getBlockingMorningSteps({ ledger: fullIncidentLedger(), dateKey: DATE_KEY, clientId: CLIENT_ID }))
      .toEqual([{ id: 'yesterdayVerify', status: 'planned', completeByData: false }]);
  });

  it('does not repeat explicit empty answers, skipped measurements, or a completed final step', () => {
    const ledger = fullIncidentLedger('closed');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    const { utils } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

    expect(plan.steps).toEqual([]);
    expect(plan.flowId).toBe('flow-original');
  });

  it('reopens a closed unfinished flow and preserves saved_local steps after a timeout', () => {
    const ledger = fullIncidentLedger('closed');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    ledger.steps.morningRoutine = { status: 'planned' };
    const { utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    const written = values.get(PROGRESS_KEY);

    expect(plan.steps).toEqual(['morningRoutine']);
    expect(plan.flowId).toBe('flow-original');
    expect(written.steps.cold_exposure.status).toBe('saved_local');
    expect(written.steps.__flow__.status).toBe('open');
  });

  it('adds a newly required yesterday step to a synced daily flow without replacing its journal', () => {
    const ledger = fullIncidentLedger('synced');
    ledger.plannedStepIds = ledger.plannedStepIds.filter((id) => id !== 'yesterdayVerify');
    delete ledger.steps.yesterdayVerify;
    const { utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
      yesterdayRequired: true,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    const written = values.get(PROGRESS_KEY);

    expect(plan.steps).toEqual(['yesterdayVerify']);
    expect(plan.flowId).toBe('flow-original');
    expect(written.plannedStepIds).toContain('yesterdayVerify');
    expect(written.steps.yesterdayVerify.status).toBe('planned');
    expect(written.steps.__flow__.status).toBe('open');
  });

  it('replans missing core data even when an older journal row was synced', () => {
    const ledger = fullIncidentLedger('synced');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    const day = completedDay();
    delete day.weightMorning;
    sessionStorage.setItem(`heys_morning_checkin_done_${CLIENT_ID}_${DATE_KEY}`, 'true');
    const { HEYS, utils, values } = loadMorning({
      day,
      profile: { stepsGoal: 9000 },
      ledger,
    });

    expect(HEYS.shouldShowMorningCheckin()).toBe(true);
    const plan = utils.buildMorningCheckinPlan({
      dateKey: DATE_KEY,
      clientId: CLIENT_ID,
      source: 'MorningCheckin',
      requiredOnly: true,
    });

    expect(plan.steps).toEqual(['weight']);
    expect(values.get(PROGRESS_KEY).steps.weight.status).toBe('planned');
  });

  it('does not let a session flag hide an unfinished journal or a current yesterday check', () => {
    sessionStorage.setItem(`heys_morning_checkin_done_${CLIENT_ID}_${DATE_KEY}`, 'true');
    const unfinishedLedger = fullIncidentLedger();
    unfinishedLedger.steps.morningRoutine = { status: 'planned' };
    const withLedger = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger: unfinishedLedger,
    });
    expect(withLedger.HEYS.shouldShowMorningCheckin()).toBe(true);

    const withCurrentYesterday = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      yesterdayRequired: true,
    });
    expect(withCurrentYesterday.HEYS.shouldShowMorningCheckin()).toBe(true);
  });

  it('merges a fresher persisted step before a stale shell writes its journal', () => {
    const staleShell = fullIncidentLedger('open');
    staleShell.steps.weight = { status: 'planned', updatedAt: 1000 };
    staleShell.steps.sleepTime = { status: 'synced', updatedAt: 3000 };
    staleShell.updatedAt = 3000;
    const persisted = structuredClone(staleShell);
    persisted.steps.weight = { status: 'synced', updatedAt: 4000 };
    persisted.steps.sleepTime = { status: 'planned', updatedAt: 1000 };
    persisted.updatedAt = 4000;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(persisted));
    const { utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger: staleShell,
    });

    const written = utils.writeMorningProgress(staleShell, CLIENT_ID);

    expect(written.steps.weight.status).toBe('synced');
    expect(written.steps.sleepTime.status).toBe('synced');
    expect(values.get(PROGRESS_KEY).flowId).toBe('flow-original');
  });

  it('rechecks yesterday at finalization and reopens instead of publishing a false completion', () => {
    const ledger = fullIncidentLedger('open');
    ledger.plannedStepIds = ledger.plannedStepIds.filter((id) => id !== 'yesterdayVerify');
    delete ledger.steps.yesterdayVerify;
    const { HEYS, utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
      yesterdayRequired: false,
    });
    HEYS.YesterdayVerify.shouldShow.mockReturnValue(true);

    const written = utils.ensureFinalMorningRequirements({
      dateKey: DATE_KEY,
      clientId: CLIENT_ID,
      flowId: 'flow-original',
    });

    expect(written.plannedStepIds).toContain('yesterdayVerify');
    expect(written.steps.yesterdayVerify.status).toBe('planned');
    expect(written.steps.__flow__.status).toBe('open');
    expect(utils.getBlockingMorningSteps({ ledger: written, dateKey: DATE_KEY, clientId: CLIENT_ID }))
      .toContainEqual({ id: 'yesterdayVerify', status: 'planned', completeByData: false });
    expect(values.get(PROGRESS_KEY).steps.__flow__.status).toBe('open');
  });

  it('turns local check-in rows into an explicit cloud acknowledgement after queue drain', () => {
    const ledger = fullIncidentLedger('saved_local');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    ledger.steps.weight = { status: 'saved_local', cloudPending: true, updatedAt: 1000 };
    ledger.steps.__flow__ = { status: 'saved_local', cloudPending: true, updatedAt: 2000 };
    const { utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
    });

    const written = utils.markMorningProgressCloudSynced(DATE_KEY, CLIENT_ID);

    expect(written.steps.weight.status).toBe('synced');
    expect(written.steps.weight.cloudPending).toBe(false);
    expect(written.steps.__flow__.status).toBe('synced');
    expect(values.get(PROGRESS_KEY).steps.__flow__.status).toBe('synced');
  });

  it('reports the newest locally saved step instead of staying on weight', () => {
    const ledger = fullIncidentLedger('open');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    ledger.steps.weight = { status: 'saved_local', cloudPending: true, updatedAt: 1000 };
    ledger.steps.sleepTime = { status: 'saved_local', cloudPending: true, updatedAt: 3000 };
    const { utils } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
    });

    expect(utils.getMorningCheckinStatus(DATE_KEY, CLIENT_ID).label).toBe('сохранено локально: сон');
  });

  it('publishes one local status transition for one successfully saved step', async () => {
    const ledger = fullIncidentLedger('open');
    ledger.steps.weight = { status: 'planned' };
    const { HEYS, utils } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
    });
    HEYS.cloud = { flushPendingQueue: vi.fn() };
    const events = [];
    const listener = (event) => events.push(event.detail);
    window.addEventListener('heys:morning-checkin-status', listener);

    await utils.flushAndMarkMorningStep('weight', [`heys_dayv2_${DATE_KEY}`], 10000, {
      dateKey: DATE_KEY,
      clientId: CLIENT_ID,
      saveResult: { completed: true },
    });
    window.removeEventListener('heys:morning-checkin-status', listener);

    expect(events.filter((event) => event.reason === 'step_status')).toHaveLength(1);
  });

  it('continues offline and keeps an explicit pending cloud status', async () => {
    const ledger = fullIncidentLedger('open');
    ledger.steps.weight = { status: 'planned' };
    const { HEYS, utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000 },
      ledger,
    });
    delete HEYS.cloud;

    await expect(utils.flushAndMarkMorningStep('weight', [`heys_dayv2_${DATE_KEY}`], 10000, {
      dateKey: DATE_KEY,
      clientId: CLIENT_ID,
      saveResult: { completed: true },
    })).resolves.toBe(true);

    expect(values.get(PROGRESS_KEY).steps.weight).toMatchObject({
      status: 'saved_local',
      cloudPending: true,
      syncNote: 'sync_unavailable',
    });
  });
});
