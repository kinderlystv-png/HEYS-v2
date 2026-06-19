import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const profileStepSource = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');

const originalHEYS = window.HEYS;
const originalLocalStorage = window.localStorage;
const originalReact = window.React;

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
  const rpc = vi.fn().mockResolvedValue({ success: true });
  const flushPendingQueue = vi.fn().mockResolvedValue(true);
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
    cloud: { flushPendingQueue },
    auth: { getSessionToken: vi.fn(() => 'session-token') },
    YandexAPI: { rpc },
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

  return { steps, rpc, flushPendingQueue, notifyClientsUpdated };
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
    const storage = createMockStorage({
      heys_client_current: JSON.stringify(clientId),
      heys_clients: JSON.stringify([{ id: clientId, name: 'Черновик' }]),
      heys_pending_client_name: JSON.stringify('Анна Петрова'),
      heys_profile: JSON.stringify({}),
    });
    const { steps, rpc, flushPendingQueue, notifyClientsUpdated } = loadProfileSteps(storage);

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
        'profile-goals': { deficitPctTarget: -10 },
        'profile-metabolism': { sleepHours: 8, insulinWaveHours: 3 },
      }
    );

    expect(completed).toBe(true);
    expect(flushPendingQueue).toHaveBeenCalledWith(10000);
    expect(readJson(storage, 'heys_profile')).toMatchObject({
      firstName: 'Анна',
      lastName: 'Петрова',
      name: 'Анна Петрова',
      displayName: 'Анна Петрова',
      profileCompleted: true,
    });
    expect(notifyClientsUpdated).toHaveBeenCalledWith([{ id: clientId, name: 'Анна Петрова' }], 'profile-wizard');
  });
});
