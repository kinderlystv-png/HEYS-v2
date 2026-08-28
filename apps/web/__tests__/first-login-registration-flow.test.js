import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const profileStepSource = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;
const originalReact = window.React;
const SERVER_NORMS = {
  carbsPct: 40,
  proteinPct: 28,
  simpleCarbPct: 30,
  badFatPct: 30,
  superbadFatPct: 5,
  fiberPct: 14,
  giPct: 55,
  harmPct: 10,
  source: 'registration-server',
  schemaVersion: 1,
};

function createMockStorage(seed = {}) {
  const store = { ...seed };
  return {
    getItem: vi.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    _store: store,
  };
}

function readJson(storage, key, fallback = null) {
  const raw = storage._store[key];
  return raw ? JSON.parse(raw) : fallback;
}

function loadProfileSteps(storage, overrides = {}) {
  const steps = {};
  const rpc = vi.fn(async (fnName) => {
    if (fnName === 'calculate_registration_norms_by_session') {
      const profile = readJson(storage, 'heys_profile', {});
      return {
        data: {
          calculate_registration_norms_by_session: {
            success: true,
            norms: {
              ...SERVER_NORMS,
              profileUpdatedAt: profile.updatedAt,
              updatedAt: Number(profile.updatedAt || 0) + 1,
            },
          },
        },
        error: null,
      };
    }
    return { data: { success: true }, error: null };
  });
  const flushPendingQueue = vi.fn().mockResolvedValue(true);
  const waitForSync = vi.fn().mockResolvedValue('synced');
  const getKV = vi.fn().mockImplementation(async () => ({ data: readJson(storage, 'heys_profile') }));
  const saveKV = vi.fn().mockResolvedValue({ success: true });
  const notifyClientsUpdated = vi.fn();

  Object.defineProperty(window, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });

  window.React = {
    useState: (initial) => [initial, vi.fn()],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: () => undefined,
    createElement: (type, props, ...children) => ({ type, props, children }),
  };

  window.HEYS = {
    store: { invalidate: vi.fn() },
    cloud: { flushPendingQueue, waitForSync },
    auth: { getSessionToken: vi.fn(() => 'session-token') },
    YandexAPI: { rpc, getKV, saveKV },
    AppClientManagement: { notifyClientsUpdated },
    StepModal: {
      WheelPicker: function WheelPicker() {},
      registerStep: (id, config) => { steps[id] = config; },
      utils: {
        lsGet: (key, fallback) => readJson(storage, key, fallback),
        lsSet: (key, value) => storage.setItem(key, JSON.stringify(value)),
        getTodayKey: () => '2026-06-19',
      },
    },
    ...overrides,
  };

  // eslint-disable-next-line no-eval
  (0, eval)(profileStepSource);

  return { steps, rpc, flushPendingQueue, waitForSync, getKV, saveKV, notifyClientsUpdated };
}

describe('first login registration flow', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    window.HEYS = originalHEYS;
    window.React = originalReact;
  });

  it('persists first and last name, updates curator client card, and flushes profile before completion', async () => {
    const clientId = 'client-1';
    const completePendingRegistrationPushOptIn = vi.fn().mockResolvedValue({ ok: true });
    const feedbackEmit = vi.fn();
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
      heys_clients: JSON.stringify([{ id: clientId, name: 'Черновик' }]),
      heys_pending_client_name: JSON.stringify('Анна Петрова'),
      heys_profile: JSON.stringify({}),
    });
    const { steps, rpc, flushPendingQueue, waitForSync, getKV, notifyClientsUpdated } = loadProfileSteps(storage, {
      Consents: { completePendingRegistrationPushOptIn },
      feedback: { emit: feedbackEmit },
    });

    const initial = steps['profile-personal'].getInitialData();
    expect(initial.firstName).toBe('Анна');
    expect(initial.lastName).toBe('Петрова');

    await steps['profile-personal'].save({
      firstName: ' Анна ',
      lastName: ' Петрова ',
      gender: 'Женский',
      birthDay: 1,
      birthMonth: 1,
      birthYear: 2001,
      cycleTrackingEnabled: true,
    });

    const savedProfile = readJson(storage, 'heys_profile');
    expect(savedProfile).toMatchObject({
      firstName: 'Анна',
      lastName: 'Петрова',
      name: 'Анна Петрова',
      displayName: 'Анна Петрова',
      gender: 'Женский',
      birthDate: '2001-01-01',
    });
    expect(storage._store.heys_pending_client_name).toBeUndefined();
    expect(readJson(storage, 'heys_clients')).toEqual([{ id: clientId, name: 'Анна Петрова' }]);
    expect(notifyClientsUpdated).toHaveBeenCalledWith([{ id: clientId, name: 'Анна Петрова' }], 'profile-personal');
    expect(rpc).toHaveBeenCalledWith('update_client_profile_by_session', {
      p_name: 'Анна Петрова',
      p_session_token: 'session-token',
    });

    const completed = await steps['profile-metabolism'].save(
      { sleepHours: 8, insulinWaveHours: 3 },
      {},
      {
        'profile-personal': {
          firstName: 'Анна',
          lastName: 'Петрова',
          gender: 'Женский',
          birthDate: '2001-01-01',
          cycleTrackingEnabled: true,
        },
        'profile-body': { weight: 64, height: 172, weightGoal: 60 },
        'profile-goals': { deficitPctTarget: -10, activityLevel: 'light' },
        'profile-metabolism': { sleepHours: 8, insulinWaveHours: 3 },
      }
    );

    expect(completed).toBe(true);
    expect(flushPendingQueue).toHaveBeenCalledWith(10000);
    expect(waitForSync).toHaveBeenCalledWith('heys_profile', 10000);
    expect(getKV).toHaveBeenCalledWith(clientId, 'heys_profile');
    expect(readJson(storage, 'heys_profile')).toMatchObject({
      firstName: 'Анна',
      lastName: 'Петрова',
      name: 'Анна Петрова',
      displayName: 'Анна Петрова',
      profileCompleted: true,
      activityLevel: 'light',
      deficitPctTarget: -10,
    });
    expect(notifyClientsUpdated).toHaveBeenCalledWith([{ id: clientId, name: 'Анна Петрова' }], 'profile-wizard');
    expect(storage._store.heys_registration_in_progress).toBeUndefined();
    expect(storage._store['heys_dayv2_2026-06-19']).toBeUndefined();
    expect(completePendingRegistrationPushOptIn).toHaveBeenCalledOnce();
    expect(completePendingRegistrationPushOptIn).toHaveBeenCalledWith(clientId);
    expect(feedbackEmit).toHaveBeenCalledOnce();
    expect(feedbackEmit).toHaveBeenCalledWith('registration.done');
    expect(rpc).toHaveBeenCalledWith('calculate_registration_norms_by_session', {
      p_session_token: 'session-token',
    });
    expect(readJson(storage, 'heys_norms')).toMatchObject({
      ...SERVER_NORMS,
      profileUpdatedAt: readJson(storage, 'heys_profile').updatedAt,
    });
  });

  it('finishes when the profile is confirmed even if an unrelated queue item keeps the global flush pending', async () => {
    const clientId = 'client-2';
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
      heys_profile: JSON.stringify({}),
    });
    const flushPendingQueue = vi.fn().mockResolvedValue(false);
    const { steps, getKV, saveKV } = loadProfileSteps(storage, {
      cloud: {
        flushPendingQueue,
        waitForSync: vi.fn().mockResolvedValue('synced'),
      },
    });

    await expect(steps['profile-metabolism'].save(
      { sleepHours: 8, insulinWaveHours: 3 },
      {},
      {
        'profile-personal': { firstName: 'Иван', gender: 'Мужской', birthDate: '1990-01-01' },
        'profile-body': { weight: 80, height: 180, weightGoal: 76 },
        'profile-goals': { deficitPctTarget: -10, activityLevel: 'light' },
        'profile-metabolism': { sleepHours: 8, insulinWaveHours: 3 },
      },
    )).resolves.toBe(true);

    expect(flushPendingQueue).toHaveBeenCalledWith(10000);
    expect(getKV).toHaveBeenCalledTimes(1);
    expect(saveKV).not.toHaveBeenCalled();
  });

  it('keeps registration incomplete and surfaces the exact profile server error', async () => {
    const clientId = 'client-3';
    const completePendingRegistrationPushOptIn = vi.fn();
    const feedbackEmit = vi.fn();
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
      heys_profile: JSON.stringify({}),
    });
    const getKV = vi.fn().mockResolvedValue({ data: null });
    const saveKV = vi.fn().mockResolvedValue({ success: false, error: 'subscription_profile_write_denied' });
    const { steps } = loadProfileSteps(storage, {
      cloud: {
        flushPendingQueue: vi.fn().mockResolvedValue(false),
        waitForSync: vi.fn().mockResolvedValue('pending'),
      },
      YandexAPI: { rpc: vi.fn(), getKV, saveKV },
      Consents: { completePendingRegistrationPushOptIn },
      feedback: { emit: feedbackEmit },
    });

    await expect(steps['profile-metabolism'].save(
      { sleepHours: 8, insulinWaveHours: 3 },
      {},
      {
        'profile-personal': { firstName: 'Пётр', gender: 'Мужской', birthDate: '1991-02-02' },
        'profile-body': { weight: 82, height: 181, weightGoal: 78 },
        'profile-goals': { deficitPctTarget: -10, activityLevel: 'light' },
        'profile-metabolism': { sleepHours: 8, insulinWaveHours: 3 },
      },
    )).rejects.toThrow('subscription_profile_write_denied');

    expect(storage._store.heys_registration_in_progress).toBe('true');
    expect(window.HEYS.ProfileSteps.isProfileIncomplete(readJson(storage, 'heys_profile'))).toBe(true);
    expect(completePendingRegistrationPushOptIn).not.toHaveBeenCalled();
    expect(feedbackEmit).not.toHaveBeenCalled();
  });

  it('does not complete registration when server norms are not confirmed', async () => {
    const clientId = 'client-norms-error';
    const feedbackEmit = vi.fn();
    const completePendingRegistrationPushOptIn = vi.fn();
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
      heys_profile: JSON.stringify({}),
    });
    const getKV = vi.fn(async () => ({ data: readJson(storage, 'heys_profile') }));
    const rpc = vi.fn(async (fnName) => {
      if (fnName === 'calculate_registration_norms_by_session') {
        return {
          data: {
            calculate_registration_norms_by_session: {
              success: false,
              error: 'registration_norms_failed',
            },
          },
          error: null,
        };
      }
      return { data: { success: true }, error: null };
    });
    const { steps } = loadProfileSteps(storage, {
      YandexAPI: { rpc, getKV, saveKV: vi.fn() },
      feedback: { emit: feedbackEmit },
      Consents: { completePendingRegistrationPushOptIn },
    });

    await expect(steps['profile-metabolism'].save(
      { sleepHours: 8, insulinWaveHours: 3 },
      {},
      {
        'profile-personal': { firstName: 'Анна', gender: 'Женский', birthDate: '1990-01-01' },
        'profile-body': { weight: 64, height: 172, weightGoal: 60 },
        'profile-goals': { deficitPctTarget: -10, activityLevel: 'light' },
        'profile-metabolism': { sleepHours: 8, insulinWaveHours: 3 },
      },
    )).rejects.toThrow('registration_norms_failed');

    expect(storage._store.heys_registration_in_progress).toBe('true');
    expect(storage._store.heys_norms).toBeUndefined();
    expect(feedbackEmit).not.toHaveBeenCalled();
    expect(completePendingRegistrationPushOptIn).not.toHaveBeenCalled();
  });

  it('ignores a stale registration marker after the completed profile is confirmed by a newer full sync', () => {
    const clientId = 'client-confirmed';
    const profile = {
      firstName: 'Анна',
      profileCompleted: true,
      updatedAt: 1_000,
    };
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
      heys_registration_in_progress: 'true',
      heys_profile: JSON.stringify(profile),
    });
    loadProfileSteps(storage, {
      cloud: {
        _lastClientSync: { clientId, ts: 2_000 },
      },
    });

    expect(window.HEYS.ProfileSteps.isProfileIncomplete(profile)).toBe(false);
    expect(storage._store.heys_registration_in_progress).toBeUndefined();
  });

  it('keeps a locally completed profile fail-closed when it is newer than the last full sync', () => {
    const clientId = 'client-unconfirmed';
    const profile = {
      firstName: 'Анна',
      profileCompleted: true,
      updatedAt: 2_000,
    };
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
      heys_registration_in_progress: 'true',
      heys_profile: JSON.stringify(profile),
    });
    loadProfileSteps(storage, {
      cloud: {
        _lastClientSync: { clientId, ts: 1_000 },
      },
    });

    expect(window.HEYS.ProfileSteps.isProfileIncomplete(profile)).toBe(true);
    expect(storage._store.heys_registration_in_progress).toBe('true');
  });

  it('does not treat the personal step as a completed profile when the local progress flag is absent', () => {
    const partialProfile = {
      firstName: 'Ирина',
      gender: 'Женский',
      birthDate: '1992-04-03',
      age: 34,
      updatedAt: Date.now(),
    };
    const storage = createMockStorage({
      heys_client_current: JSON.stringify('client-4'),
      heys_profile: JSON.stringify(partialProfile),
    });
    loadProfileSteps(storage);

    expect(window.HEYS.ProfileSteps.isProfileIncomplete(partialProfile)).toBe(true);
    expect(storage._store.heys_registration_in_progress).toBe('true');
  });

  it('does not rewrite registration marker on repeated incomplete checks', () => {
    const storage = createMockStorage({
      heys_client_current: JSON.stringify('client-5'),
      heys_profile: JSON.stringify({}),
    });
    loadProfileSteps(storage);

    expect(window.HEYS.ProfileSteps.isProfileIncomplete({})).toBe(true);
    expect(storage._store.heys_registration_in_progress).toBe('true');
    const writesAfterFirst = storage.setItem.mock.calls.length;

    for (let i = 0; i < 24; i += 1) {
      expect(window.HEYS.ProfileSteps.isProfileIncomplete({})).toBe(true);
    }

    expect(storage.setItem.mock.calls.length).toBe(writesAfterFirst);
  });

  it('reads saved profile on welcome when wizard stepData is empty', () => {
    const storage = createMockStorage({
      heys_client_current: JSON.stringify('client-welcome'),
      heys_profile: JSON.stringify({
        firstName: 'Антон',
        weight: 82.4,
        weightGoal: 80,
        deficitPctTarget: -10,
        gender: 'Мужской',
        birthDate: '1988-03-12',
        profileCompleted: true,
      }),
    });
    const { steps } = loadProfileSteps(storage);
    const tree = steps.welcome.component({
      stepData: {},
      context: { onStartDailyCheckin: vi.fn() },
    });

    const text = JSON.stringify(tree);
    expect(text).toContain('Профиль готов, Антон');
    expect(text).toContain('80 кг');
    expect(text).toContain('Начать утренний чек-ин');
    expect(text).not.toContain('70 кг');
  });
});
