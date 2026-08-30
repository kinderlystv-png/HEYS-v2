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

function loadStepModal(heysOverrides = {}) {
  window.React = React;
  window.ReactDOM = { createRoot: vi.fn() };
  window.HEYS = {
    utils: { lsGet: () => ({}), lsSet: vi.fn() },
    dayUtils: { todayISO: () => DATE_KEY },
    ...heysOverrides,
  };
  // eslint-disable-next-line no-new-func
  new Function(STEP_MODAL_SRC)();
  return window.HEYS.StepModal;
}

function loadMorning({
  day = {},
  profile = {},
  profileIncomplete = false,
  fullSync = null,
  subscriptionStatus = null,
  ledger = null,
  yesterdayRequired = false,
  yesterdayReady = true,
  dateKey = DATE_KEY,
  todayKey = DATE_KEY,
  curatorSession = false,
} = {}) {
  const dayKey = `heys_${CLIENT_ID}_dayv2_${dateKey}`;
  const progressKey = `heys_${CLIENT_ID}_morning_checkin_progress_v1_${dateKey}`;
  const values = new Map([[dayKey, { date: dateKey, ...day }]]);
  if (ledger) values.set(progressKey, structuredClone(ledger));
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
    dayUtils: { todayISO: () => todayKey },
    ProfileSteps: { isProfileIncomplete: () => profileIncomplete },
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
  if (fullSync) window.HEYS.cloud = { _lastClientSync: fullSync };
  // Кураторская сессия: тот же признак, что читает продукт.
  window.HEYS.auth = { isCuratorSession: () => curatorSession };
  if (subscriptionStatus) {
    window.HEYS.Subscription = {
      getCachedStatus: () => subscriptionStatus,
      getLocalStatus: () => subscriptionStatus,
      canWriteStatus: (status) => ['trial', 'active'].includes(status),
    };
  }
  if (!window.HEYS.models) {
    const modelsSrc = fs.readFileSync(path.resolve(__dirname, '../heys_models_v1.js'), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(modelsSrc)();
  }
  // eslint-disable-next-line no-new-func
  new Function(SYNC_MERGE_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(MORNING_SRC)();
  return { HEYS: window.HEYS, utils: window.HEYS.MorningCheckinUtils, values, dayKey, progressKey };
}

function curatorCoreDay(overrides = {}) {
  return {
    weightMorning: 71,
    sleepStart: '02:00',
    sleepEnd: '10:20',
    sleepQuality: 7,
    moodMorning: 8,
    _curatorEdits: {
      weightMorning: { at: 1, value: 71 },
      sleepStart: { at: 1, value: '02:00' },
      sleepEnd: { at: 1, value: '10:20' },
      sleepQuality: { at: 1, value: 7 },
      moodMorning: { at: 1, value: 8 },
    },
    ...overrides,
  };
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
    morningActivation: { status: 'skipped' },
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
      'stepsGoal',
      'morningRest',
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
      stepsGoal: { status: 'synced' },
      morningRest: { status: 'synced' },
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
  it('offers a close action instead of loading forever when a step never registers', () => {
    vi.useFakeTimers();
    try {
      const traceEvent = vi.fn();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const StepModal = loadStepModal({
        version: '2026.07.31.test',
        LogTrace: { event: traceEvent },
        PlatformAPIs: {
          getAppVersion: () => '2026.07.31.test',
          getSwUpdateState: () => 'ready',
          getUpdateState: () => ({ version: '2026.07.31.next' }),
        },
      });
      const onClose = vi.fn();
      const view = render(React.createElement(StepModal.Component, {
        steps: ['missing-step'],
        onClose,
      }));

      expect(screen.getByText('Загружаем следующий шаг…')).toBeTruthy();
      act(() => vi.advanceTimersByTime(8000));
      expect(screen.getByText('Не удалось загрузить шаг')).toBeTruthy();
      expect(view.container.querySelector('[data-heys-step-modal-error="missing_step_config"]')).toBeTruthy();
      expect(traceEvent).toHaveBeenCalledWith('step_registry_timeout', expect.objectContaining({
        source: 'step_modal',
        status: 'failed',
        reason: 'missing_step_config',
        step_id: 'missing-step',
        release_version: '2026.07.31.test',
        update_version: '2026.07.31.next',
        phase: 'ready',
      }), 'warn');
      expect(warn).toHaveBeenCalledWith('[StepModal] Step registry timeout', expect.objectContaining({
        missingStepIds: ['missing-step'],
      }));
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

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

  it('preserves externally registered steps when a duplicate lazy load reinitializes StepModal', () => {
    const modal = loadStepModal();
    modal.registerStep('payment_required', {
      title: 'Подписка не активна',
      component: () => React.createElement('div', null, 'contact-curator'),
    });

    // Reproduce the confirmed runtime order: subscriptions register their
    // external step, then a duplicate postboot-3 lazy chunk executes again.
    // eslint-disable-next-line no-new-func
    new Function(STEP_MODAL_SRC)();

    expect(window.HEYS.StepModal.registry.payment_required).toEqual(expect.objectContaining({
      id: 'payment_required',
      title: 'Подписка не активна',
    }));
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
  it('closes stale registration-only progress after a confirmed full profile sync', () => {
    const ledger = {
      version: 1,
      clientId: CLIENT_ID,
      dateKey: DATE_KEY,
      flowId: 'registration-flow',
      plannedStepIds: ['profile-personal', 'profile-body', 'profile-goals', 'profile-metabolism'],
      steps: {
        'profile-personal': { status: 'planned', updatedAt: 1000 },
        'profile-body': { status: 'planned', updatedAt: 1000 },
        'profile-goals': { status: 'planned', updatedAt: 1000 },
        'profile-metabolism': { status: 'planned', updatedAt: 1000 },
        __flow__: { status: 'open', updatedAt: 1000 },
      },
      updatedAt: 1000,
    };
    const { HEYS, utils, values } = loadMorning({
      ledger,
      fullSync: { clientId: CLIENT_ID, ts: 2_000 },
      subscriptionStatus: 'trial_pending',
    });

    expect(HEYS.shouldShowMorningCheckin()).toBe(false);
    const written = values.get(PROGRESS_KEY);
    expect(utils.getRemainingMorningSteps({ ledger: written, dateKey: DATE_KEY, clientId: CLIENT_ID })).toEqual([]);
    expect(written.steps['profile-personal']).toMatchObject({
      status: 'skipped',
      skippedReason: 'profile_completed_after_full_sync',
    });
    expect(written.steps.__flow__).toMatchObject({
      status: 'closed',
      closeReason: 'stale_registration_resolved',
    });
  });

  it('keeps a pre-trial registration profile-only and does not create a daily journal', () => {
    const { utils, values } = loadMorning({
      profileIncomplete: true,
      subscriptionStatus: 'trial_pending',
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

    expect(plan.steps).toEqual([
      'profile-personal',
      'profile-body',
      'profile-goals',
      'profile-metabolism',
      'welcome',
    ]);
    expect(plan.isProfileOnlyRegistration).toBe(true);
    expect(plan.mode).toBe('registration');
    expect(values.has(PROGRESS_KEY)).toBe(false);
  });

  it('keeps registration steps in canonical order when resuming a mixed daily ledger', () => {
    const ledger = {
      version: 1,
      clientId: CLIENT_ID,
      dateKey: DATE_KEY,
      flowId: 'registration-mixed',
      plannedStepIds: [
        'weight',
        'sleepTime',
        'profile-personal',
        'profile-body',
        'profile-goals',
        'profile-metabolism',
        'morningRoutine',
      ],
      steps: {
        'profile-personal': { status: 'synced', updatedAt: 2000 },
        weight: { status: 'planned', updatedAt: 1000 },
        sleepTime: { status: 'planned', updatedAt: 1000 },
        'profile-body': { status: 'planned', updatedAt: 1000 },
        'profile-goals': { status: 'planned', updatedAt: 1000 },
        'profile-metabolism': { status: 'planned', updatedAt: 1000 },
        morningRoutine: { status: 'planned', updatedAt: 1000 },
        __flow__: { status: 'open', updatedAt: 1000 },
      },
      updatedAt: 2000,
    };
    const { utils } = loadMorning({
      profileIncomplete: true,
      profile: {
        firstName: 'Анна',
        birthDate: '1990-05-01',
        gender: 'Женский',
      },
      subscriptionStatus: 'trial',
      ledger,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

    expect(plan.mode).toBe('registration');
    expect(plan.isProfileOnlyRegistration).toBe(true);
    expect(plan.steps).toEqual([
      'profile-resume',
      'profile-body',
      'profile-goals',
      'profile-metabolism',
      'welcome',
    ]);
    expect(plan.steps).not.toContain('profile-personal');
    expect(plan.steps).not.toContain('weight');
  });

  it('does not replan profile-personal when personal data is already saved in profile', () => {
    const ledger = fullIncidentLedger('open');
    ledger.plannedStepIds = [
      'profile-personal',
      'profile-body',
      'profile-goals',
      'profile-metabolism',
      'weight',
    ];
    ledger.steps = {
      'profile-personal': { status: 'synced', updatedAt: 3000 },
      'profile-body': { status: 'planned', updatedAt: 1000 },
      'profile-goals': { status: 'planned', updatedAt: 1000 },
      'profile-metabolism': { status: 'planned', updatedAt: 1000 },
      weight: { status: 'planned', updatedAt: 1000 },
      __flow__: { status: 'open', updatedAt: 1000 },
    };
    const { utils } = loadMorning({
      profileIncomplete: true,
      profile: {
        firstName: 'Иван',
        birthDate: '1988-03-12',
        gender: 'Мужской',
      },
      subscriptionStatus: 'trial',
      ledger,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

    expect(plan.steps[0]).toBe('profile-resume');
    expect(plan.steps).not.toContain('profile-personal');
  });

  it('opens a historical reset against the selected date without adding today-only steps', () => {
    const historicalDate = '2026-07-25';
    const { HEYS } = loadMorning({
      dateKey: historicalDate,
      todayKey: '2026-07-26',
      day: {
        weightMorning: 92.7,
        sleepStart: '03:00',
        sleepEnd: '09:10',
        sleepQuality: 7,
        moodMorning: 7,
      },
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: historicalDate },
      yesterdayRequired: true,
    });
    HEYS.StepModal = { show: vi.fn() };

    HEYS.showCheckin.morning(historicalDate, null, {
      requiredOnly: true,
      yesterdayVerifyRequired: false,
      forceStepIds: ['weight', 'sleepTime', 'sleepQuality'],
    });

    expect(HEYS.StepModal.show).toHaveBeenCalledTimes(1);
    const options = HEYS.StepModal.show.mock.calls[0][0];
    expect(options.context.dateKey).toBe(historicalDate);
    expect(options.steps).toEqual(['weight', 'sleepTime', 'sleepQuality']);
    expect(options.forceVisibleStepIds).toEqual([]);
  });

  it('reports a completed persisted flow consistently after a new browser session', () => {
    const ledger = fullIncidentLedger('synced');
    ledger.steps.yesterdayVerify = { status: 'synced', updatedAt: 3000 };
    ledger.steps.sleepTime = { status: 'planned', updatedAt: 1000 };
    ledger.steps.sleepQuality = { status: 'planned', updatedAt: 1000 };
    ledger.steps.morning_mood = { status: 'planned', updatedAt: 1000 };
    ledger.steps.cold_exposure = { status: 'synced', updatedAt: 3000 };
    const { utils } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger,
    });

    const status = utils.getMorningCheckinStatus(DATE_KEY, CLIENT_ID);

    expect(status.state).toBe('complete');
    expect(status.sessionDone).toBe(true);
    expect(status.sessionFlagDone).toBe(false);
    expect(status.counts.planned).toBeUndefined();
    expect(status.counts.data_present).toBe(3);
  });

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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger: fullIncidentLedger(),
      yesterdayRequired: false,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    const written = values.get(PROGRESS_KEY);

    expect(plan.steps).toEqual([]);
    expect(plan.flowId).toBe('flow-original');
    expect(written.plannedStepIds).toHaveLength(11);
    expect(written.steps.measurements.status).toBe('skipped');
    expect(written.steps.cold_exposure.status).toBe('saved_local');
    expect(written.steps.__flow__.status).toBe('saved_local');
    expect(utils.getBlockingMorningSteps({ ledger: written, dateKey: DATE_KEY, clientId: CLIENT_ID })).toEqual([]);
  });

  it('keeps a planned yesterdayVerify blocking while its decision module is not ready', () => {
    const { utils } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    const written = values.get(PROGRESS_KEY);

    expect(plan.steps).toEqual([]);
    expect(plan.flowId).toBe('flow-original');
    expect(written.steps.cold_exposure.status).toBe('saved_local');
    expect(written.steps.__flow__.status).toBe('closed');
  });

  it('shows check-in again after refresh when user closed flow before required core steps', () => {
    const ledger = {
      version: 1,
      clientId: CLIENT_ID,
      dateKey: DATE_KEY,
      flowId: 'flow-interrupted',
      plannedStepIds: [
        'welcome',
        'weight',
        'sleepTime',
        'sleepQuality',
        'morning_mood',
        'stepsGoal',
        'cold_exposure',
        'morningRoutine',
      ],
      steps: {
        welcome: { status: 'planned', attempt: 1 },
        weight: { status: 'planned', attempt: 1 },
        sleepTime: { status: 'planned', attempt: 1 },
        sleepQuality: { status: 'planned', attempt: 1 },
        morning_mood: { status: 'planned', attempt: 1 },
        stepsGoal: { status: 'planned', attempt: 1 },
        cold_exposure: { status: 'planned', attempt: 1 },
        morningRoutine: { status: 'planned', attempt: 1 },
        __flow__: { status: 'closed', closedAt: Date.now() },
      },
    };
    const { HEYS, utils } = loadMorning({
      day: {},
      profile: { stepsGoal: 7000 },
      ledger,
    });

    expect(HEYS.shouldShowMorningCheckin()).toBe(true);
    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    expect(plan.steps).toContain('weight');
    expect(plan.steps).toContain('sleep');
    expect(plan.steps).not.toContain('sleepTime');
    expect(plan.steps).toContain('morning_mood');
    expect(plan.steps).not.toContain('welcome');
  });

  it('does not reopen leftover welcome when profile was already complete', () => {
    const ledger = {
      version: 1,
      clientId: CLIENT_ID,
      dateKey: DATE_KEY,
      flowId: '2026-08-16-msvfgscm-sc68fy',
      plannedStepIds: [
        'profile-personal',
        'profile-body',
        'profile-goals',
        'profile-metabolism',
        'welcome',
        'weight',
        'sleepTime',
        'sleepQuality',
        'morning_mood',
        'stepsGoal',
        'cold_exposure',
        'morningRoutine',
      ],
      steps: {
        'profile-personal': { status: 'skipped', skippedReason: 'profile_completed_after_full_sync' },
        'profile-body': { status: 'skipped', skippedReason: 'profile_completed_after_full_sync' },
        'profile-goals': { status: 'skipped', skippedReason: 'profile_completed_after_full_sync' },
        'profile-metabolism': { status: 'skipped', skippedReason: 'profile_completed_after_full_sync' },
        welcome: { status: 'planned', attempt: 1 },
        weight: { status: 'planned', attempt: 1 },
        sleepTime: { status: 'planned', attempt: 1 },
        sleepQuality: { status: 'planned', attempt: 1 },
        morning_mood: { status: 'planned', attempt: 1 },
        stepsGoal: { status: 'planned', attempt: 1 },
        cold_exposure: { status: 'planned', attempt: 1 },
        morningRoutine: { status: 'planned', attempt: 1 },
        __flow__: { status: 'closed' },
      },
    };
    const { HEYS, utils, values } = loadMorning({
      day: {},
      profile: { firstName: 'Антон', weight: 82.4, weightGoal: 80, stepsGoal: 7000 },
      ledger,
    });

    expect(HEYS.shouldShowMorningCheckin()).toBe(true);
    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    expect(plan.steps[0]).toBe('weight');
    expect(plan.steps).not.toContain('welcome');
    expect(values.get(PROGRESS_KEY).steps.welcome).toMatchObject({
      status: 'skipped',
      skippedReason: 'welcome_without_registration_flow',
    });
  });

  it('keeps welcome only after a real registration collected profile data', () => {
    const ledger = {
      version: 1,
      clientId: CLIENT_ID,
      dateKey: DATE_KEY,
      flowId: 'registration-just-finished',
      plannedStepIds: [
        'profile-personal',
        'profile-body',
        'profile-goals',
        'profile-metabolism',
        'welcome',
        'weight',
      ],
      steps: {
        'profile-personal': { status: 'synced', updatedAt: 2000 },
        'profile-body': { status: 'synced', updatedAt: 2000 },
        'profile-goals': { status: 'synced', updatedAt: 2000 },
        'profile-metabolism': { status: 'synced', updatedAt: 2000 },
        welcome: { status: 'planned', updatedAt: 2000 },
        weight: { status: 'planned', updatedAt: 2000 },
        __flow__: { status: 'open', updatedAt: 2000 },
      },
    };
    const { utils } = loadMorning({
      profileIncomplete: false,
      profile: { firstName: 'Анна', weight: 64, weightGoal: 60, profileCompleted: true },
      subscriptionStatus: 'trial',
      ledger,
    });

    const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });
    expect(plan.steps[0]).toBe('welcome');
    expect(plan.steps).toContain('weight');
  });

  it('keeps check-in hidden after close when required core data is already present', () => {
    const ledger = fullIncidentLedger('closed');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    ledger.steps.cold_exposure = { status: 'synced' };
    ledger.steps.morningRoutine = { status: 'synced' };
    const { HEYS } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger,
    });

    expect(HEYS.shouldShowMorningCheckin()).toBe(false);
  });

  it('adds a newly required yesterday step to a synced daily flow without replacing its journal', () => {
    const ledger = fullIncidentLedger('synced');
    ledger.plannedStepIds = ledger.plannedStepIds.filter((id) => id !== 'yesterdayVerify');
    delete ledger.steps.yesterdayVerify;
    const { utils, values } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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

  it('у куратора чек-ин не открывается вовсе — это самоотчёт клиента', () => {
    // Куратор входит в дневник клиента той же оболочкой, и currentClientId у
    // него выставлен на клиента. Без гарда мастер спросил бы у него вес, сон и
    // настроение, а записанное ушло бы клиенту как его собственный чек-ин.
    const open = loadMorning({ day: {}, profile: {} });
    expect(open.HEYS.shouldShowMorningCheckin()).toBe(true);

    const curator = loadMorning({ day: {}, profile: {}, curatorSession: true });
    expect(curator.HEYS.shouldShowMorningCheckin()).toBe(false);
  });

  it('не открывает чек-ин, когда куратор заполнил все core-поля', () => {
    const day = curatorCoreDay({
      coldExposure: { type: 'shower' },
      supplementsPlanned: ['d3'],
    });
    const { HEYS } = loadMorning({
      day,
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
    });

    expect(HEYS.shouldShowMorningCheckin()).toBe(false);
  });

  it('открывает только недостающие core-шаги, когда куратор заполнил часть', () => {
    const day = {
      sleepStart: '02:00',
      sleepEnd: '10:20',
      sleepHours: 8.3,
      _curatorEdits: {
        sleepStart: { at: 1, value: '02:00' },
        sleepEnd: { at: 1, value: '10:20' },
      },
    };
    const { HEYS, utils } = loadMorning({
      day,
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
    });

    expect(HEYS.shouldShowMorningCheckin()).toBe(true);
    const plan = utils.buildMorningCheckinPlan({
      dateKey: DATE_KEY,
      clientId: CLIENT_ID,
      source: 'MorningCheckin',
    });

    expect(plan.steps).toEqual(['weight', 'sleep', 'morning_mood']);
    expect(plan.steps).not.toContain('sleepTime');
    expect(plan.steps).not.toContain('cold_exposure');
    expect(plan.steps).not.toContain('supplements');
    expect(plan.steps).not.toContain('morningRoutine');
  });

  it('не открывает чек-ин ради одного опционального хвоста, когда обязательное собрано', () => {
    // Обязательную часть могли закрыть не через флоу — из карточки дня или
    // через куратора (heys_checkin). Тогда всплывать с одними замерами и
    // холодом значит требовать то, чего система не требует: сам флоу их
    // блокирующими не считает (getBlockingMorningSteps), и «показать» с
    // «закрыть» должны отвечать одинаково.
    const ledger = fullIncidentLedger('synced');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    ledger.steps.measurements = { status: 'planned' };
    ledger.steps.cold_exposure = { status: 'planned' };
    const day = completedDay();
    delete day.measurements;
    delete day.coldExposure;

    const { HEYS } = loadMorning({ day, profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY }, ledger });
    expect(HEYS.shouldShowMorningCheckin()).toBe(false);
  });

  it('не открывает чек-ин ради одного позитивного экрана, когда всё собрано и синхронизировано', () => {
    // «Финал» ничего не записывает и завершённым по данным не становится
    // никогда. Пока он считался блокирующим наравне с остальными, модалка
    // открывалась каждое утро ради экрана «начни день» — при полностью
    // собранном и уехавшем в облако чек-ине.
    const ledger = fullIncidentLedger('synced');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    ledger.steps.cold_exposure = { status: 'synced' };
    ledger.steps.morningRoutine = { status: 'planned' };

    const { HEYS } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger,
    });
    expect(HEYS.shouldShowMorningCheckin()).toBe(false);
  });

  it('всё же открывает чек-ин, если у шага данные не уехали в облако', () => {
    // Обратная сторона предыдущего: значение уже видно в дне, но живёт только
    // на устройстве. Такой шаг обязан дозакрыться, иначе пропадёт вместе с
    // телефоном — и здесь модалка нужна, даже когда обязательное собрано.
    const ledger = fullIncidentLedger('synced');
    ledger.steps.yesterdayVerify = { status: 'synced' };
    ledger.steps.morningRoutine = { status: 'synced' };
    ledger.steps.cold_exposure = { status: 'saved_local', cloudPending: true };

    const { HEYS } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger,
    });
    expect(HEYS.shouldShowMorningCheckin()).toBe(true);
  });

  it('does not let a session flag hide an unfinished journal or a current yesterday check', () => {
    sessionStorage.setItem(`heys_morning_checkin_done_${CLIENT_ID}_${DATE_KEY}`, 'true');
    const unfinishedLedger = fullIncidentLedger();
    unfinishedLedger.steps.morningRoutine = { status: 'planned' };
    const withLedger = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger: unfinishedLedger,
    });
    expect(withLedger.HEYS.shouldShowMorningCheckin()).toBe(true);

    const withCurrentYesterday = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
      ledger,
    });

    expect(utils.getMorningCheckinStatus(DATE_KEY, CLIENT_ID).label).toBe('сохранено локально: сон');
  });

  it('publishes one local status transition for one successfully saved step', async () => {
    const ledger = fullIncidentLedger('open');
    ledger.steps.weight = { status: 'planned' };
    const { HEYS, utils } = loadMorning({
      day: completedDay(),
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
      profile: { stepsGoal: 9000, stepsGoalConfirmedDate: DATE_KEY },
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
