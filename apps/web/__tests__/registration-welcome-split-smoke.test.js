import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const SYNC_MERGE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_sync_merge_v1.js'), 'utf8');
const PROFILE_STEP_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');
const GATE_FLOW_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_app_gate_flow_v1.js'), 'utf8');
const APP_MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_app_morning_checkin_v1.js'), 'utf8');
const OVERLAYS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_app_overlays_v1.js'), 'utf8');

const DATE_KEY = '2026-08-16';
const CLIENT_ID = 'client-smoke';
const PROGRESS_KEY = `heys_${CLIENT_ID}_morning_checkin_progress_v1_${DATE_KEY}`;

const MS_DAY = 24 * 60 * 60 * 1000;

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalLocalStorage = window.localStorage;

function loadMorning({
  day = {},
  profile = {},
  profileIncomplete = false,
  subscriptionStatus = 'trial',
  subscriptionDetails = null,
  ledger = null,
  todayKey = DATE_KEY,
  dateKey = DATE_KEY,
} = {}) {
  const dayKey = `heys_${CLIENT_ID}_dayv2_${dateKey}`;
  const progressKey = `heys_${CLIENT_ID}_morning_checkin_progress_v1_${dateKey}`;
  const values = new Map([[dayKey, { date: dateKey, ...day }]]);
  if (ledger) values.set(progressKey, structuredClone(ledger));

  localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({
    _sourceClientId: CLIENT_ID,
    profileCompleted: !profileIncomplete,
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
    dayUtils: { todayISO: () => todayKey },
    ProfileSteps: { isProfileIncomplete: () => profileIncomplete },
    Steps: {
      shouldShowCycleStep: () => false,
      shouldShowMeasurements: () => false,
    },
    Refeed: { shouldShowRefeedStep: () => false },
    YesterdayVerifyReady: true,
    YesterdayVerify: {
      stepRegistered: true,
      shouldShow: vi.fn(() => false),
    },
  };

  if (subscriptionStatus) {
    window.HEYS.Subscription = {
      getCachedStatus: () => subscriptionStatus,
      getLocalStatus: () => subscriptionStatus,
      getCachedDetails: () => subscriptionDetails || { status: subscriptionStatus },
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

  return {
    HEYS: window.HEYS,
    utils: window.HEYS.MorningCheckinUtils,
    values,
    progressKey,
    dayKey,
  };
}

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

function loadProfileWelcome(storage, heysOverrides = {}) {
  const steps = {};
  window.React = {
    useState: (initial) => [initial, vi.fn()],
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: () => undefined,
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  window.HEYS = {
    store: { invalidate: vi.fn() },
    cloud: {},
    StepModal: {
      WheelPicker: function WheelPicker() {},
      registerStep: (id, config) => { steps[id] = config; },
      utils: {
        lsGet: (key, fallback) => readJson(storage, key, fallback),
        lsSet: (key, value) => storage.setItem(key, JSON.stringify(value)),
        getTodayKey: () => DATE_KEY,
      },
    },
    ...heysOverrides,
  };
  // eslint-disable-next-line no-eval
  (0, eval)(PROFILE_STEP_SRC);
  return steps;
}

function renderWelcomeText(storage, subscription, profile = {}) {
  storage.setItem('heys_client_current', JSON.stringify(CLIENT_ID));
  storage.setItem('heys_profile', JSON.stringify({
    firstName: 'Мария',
    weight: 68,
    height: 170,
    weightGoal: 62,
    deficitPctTarget: -10,
    gender: 'Женский',
    birthDate: '1995-03-10',
    profileCompleted: true,
    ...profile,
  }));

  const steps = loadProfileWelcome(storage, {
    dateUtils: { todayISO: () => DATE_KEY },
    Subscription: {
      canWriteStatus: (status) => ['trial', 'active'].includes(status),
      getCachedStatus: () => subscription.status,
      getLocalStatus: () => subscription.status,
      getCachedDetails: () => subscription.details || { status: subscription.status },
    },
  });

  const tree = steps.welcome.component({
    stepData: {},
    context: {
      onStartDailyCheckin: vi.fn(),
      onRefreshAccess: vi.fn(),
    },
  });
  return JSON.stringify(tree);
}

function loadGateFlow(heys) {
  const previousHEYS = window.HEYS;
  const previousReact = window.React;
  window.HEYS = heys;
  window.React = {
    createElement: (type, props, ...children) => {
      const flat = children.flat(Infinity).filter((c) => typeof c === 'string');
      return { type, props: props || {}, children, _text: flat.join(' ') };
    },
  };
  try {
    // eslint-disable-next-line no-eval
    (0, eval)(GATE_FLOW_SRC);
    return window.HEYS.AppGateFlow.buildConsentGate.bind(window.HEYS.AppGateFlow);
  } finally {
    window.HEYS = previousHEYS;
    window.React = previousReact;
  }
}

function createStatefulMorningReact(initialShow = false) {
  let show = initialShow;
  const setter = vi.fn((updater) => {
    show = typeof updater === 'function' ? updater(show) : updater;
  });
  const cleanups = [];
  const React = {
    useState: (init) => [show, setter],
    useRef: (value) => ({ current: value }),
    useEffect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    },
  };
  return { React, setter, getShow: () => show, cleanups };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  window.HEYS = originalHEYS;
  window.React = originalReact;
  Object.defineProperty(window, 'localStorage', {
    value: originalLocalStorage,
    writable: true,
    configurable: true,
  });
});

describe('registration welcome split smoke', () => {
  describe('два плана StepModal', () => {
    it.each([
      ['trial', true],
      ['trial_pending', true],
      ['none', true],
    ])('регистрация при %s не создаёт dayv2/progress', (status, incomplete) => {
      const { utils, values } = loadMorning({
        profileIncomplete: incomplete,
        subscriptionStatus: status,
      });
      const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

      expect(plan.mode).toBe('registration');
      expect(plan.isProfileOnlyRegistration).toBe(true);
      expect(plan.steps).toEqual([
        'profile-personal',
        'profile-body',
        'profile-goals',
        'profile-metabolism',
        'welcome',
      ]);
      expect(values.has(PROGRESS_KEY)).toBe(false);
    });

    it('дневной план без profile/welcome при завершённом профиле', () => {
      const { utils } = loadMorning({
        profileIncomplete: false,
        subscriptionStatus: 'trial',
        profile: { firstName: 'Иван', stepsGoal: 8000 },
      });
      const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

      expect(plan.mode).toBe('daily');
      expect(plan.isProfileOnlyRegistration).toBe(false);
      expect(plan.steps).not.toContain('welcome');
      expect(plan.steps).not.toContain('profile-personal');
      expect(plan.steps).toContain('weight');
    });

    it('handoff mode=daily сразу после регистрации не возвращает welcome', () => {
      const { utils } = loadMorning({
        profileIncomplete: true,
        subscriptionStatus: 'trial',
        profile: {
          firstName: 'Олег',
          birthDate: '1988-01-01',
          gender: 'Мужской',
          weight: 82,
          height: 180,
          weightGoal: 78,
          deficitPctTarget: -10,
          sleepHours: 8,
          profileBodyCapturedAt: Date.now(),
          profileCompleted: false,
        },
      });

      const daily = utils.buildMorningCheckinPlan({
        dateKey: DATE_KEY,
        clientId: CLIENT_ID,
        mode: 'daily',
      });

      expect(daily.mode).toBe('daily');
      expect(daily.steps).not.toContain('welcome');
      expect(daily.steps).not.toContain('profile-metabolism');
      expect(daily.steps[0]).toBe('weight');
      expect(daily.isProfileOnlyRegistration).toBe(false);
    });

    it('без canWrite дневной план пустой даже при mode=daily', () => {
      const { utils } = loadMorning({
        profileIncomplete: false,
        subscriptionStatus: 'trial_pending',
        profile: { firstName: 'Ирина', stepsGoal: 7000, profileCompleted: true },
      });
      const plan = utils.buildMorningCheckinPlan({
        dateKey: DATE_KEY,
        clientId: CLIENT_ID,
        mode: 'daily',
      });

      expect(plan.mode).toBe('daily');
      expect(plan.steps).toEqual([]);
    });
  });

  describe('resume тела и цели', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-16T12:00:00Z'));
    });

    const basePartialProfile = {
      firstName: 'Анна',
      birthDate: '1990-05-01',
      gender: 'Женский',
      weight: 64,
      height: 168,
      weightGoal: 60,
      deficitPctTarget: -10,
      activityLevel: 'light',
    };

    it('свежее тело (<3 дней) и цель уже есть — только metabolism + welcome', () => {
      const { utils } = loadMorning({
        profileIncomplete: true,
        subscriptionStatus: 'trial',
        profile: {
          ...basePartialProfile,
          profileBodyCapturedAt: Date.now() - 2 * MS_DAY,
        },
      });
      const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

      expect(plan.steps).toEqual(['profile-resume', 'profile-metabolism', 'welcome']);
      expect(plan.steps).not.toContain('profile-body');
      expect(plan.steps).not.toContain('profile-goals');
    });

    it('устаревшее тело (>3 дней) переспрашивает вес/рост, цель не трогает', () => {
      const { utils } = loadMorning({
        profileIncomplete: true,
        subscriptionStatus: 'trial',
        profile: {
          ...basePartialProfile,
          profileBodyCapturedAt: Date.now() - 4 * MS_DAY,
        },
      });
      const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

      expect(plan.steps).toEqual(['profile-resume', 'profile-body', 'profile-metabolism', 'welcome']);
      expect(plan.steps).not.toContain('profile-goals');
    });

    it('черновик без profileBodyCapturedAt всегда переспрашивает тело', () => {
      const { utils } = loadMorning({
        profileIncomplete: true,
        subscriptionStatus: 'trial',
        profile: { ...basePartialProfile },
      });
      const plan = utils.buildMorningCheckinPlan({ dateKey: DATE_KEY, clientId: CLIENT_ID });

      expect(plan.steps).toContain('profile-body');
    });

    it('save profile-body ставит profileBodyCapturedAt', async () => {
      const storage = createMockStorage({
        heys_client_current: JSON.stringify(CLIENT_ID),
        heys_profile: JSON.stringify({}),
      });
      const steps = loadProfileWelcome(storage);
      const before = Date.now();
      await steps['profile-body'].save({ weight: 72, height: 178, weightGoal: 70 });
      const saved = readJson(storage, 'heys_profile');
      expect(saved.profileBodyCapturedAt).toBeGreaterThanOrEqual(before);
      expect(saved.weight).toBe(72);
    });
  });

  describe('три конца регистрации (welcome)', () => {
    it('open: trial/active — сводка и «Начать утренний чек-ин»', () => {
      const storage = createMockStorage();
      const text = renderWelcomeText(storage, { status: 'trial' });

      expect(text).toContain('Профиль готов, Мария');
      expect(text).toContain('Начать утренний чек-ин');
      expect(text).not.toContain('Профиль сохранён');
      expect(text).not.toContain('можно не открывать');
    });

    it('waiting: none — «Проверить доступ», без кнопки чек-ина', () => {
      const storage = createMockStorage();
      const text = renderWelcomeText(storage, { status: 'none' });

      expect(text).toContain('Профиль сохранён');
      expect(text).toContain('Проверить доступ');
      expect(text).not.toContain('Начать утренний чек-ин');
    });

    it('dated: trial_pending с датой в будущем — герой даты и «можно не открывать»', () => {
      const storage = createMockStorage();
      const text = renderWelcomeText(storage, {
        status: 'trial_pending',
        details: { status: 'trial_pending', trial_started_at: '2026-08-21T03:00:00.000Z' },
      });

      expect(text).toContain('Неделя начнётся');
      expect(text).toContain('можно не открывать');
      expect(text).toContain('Проверить доступ');
      expect(text).not.toContain('Начать утренний чек-ин');
      expect(text).not.toMatch(/напомн/i);
    });

    it('trial_pending с датой ≤ todayISO — waiting, не open', () => {
      const storage = createMockStorage();
      const text = renderWelcomeText(storage, {
        status: 'trial_pending',
        details: { status: 'trial_pending', trial_started_at: '2026-08-16T03:00:00.000Z' },
      });

      expect(text).toContain('Профиль сохранён');
      expect(text).not.toContain('Начать утренний чек-ин');
    });

    it('куратор в waiting только при имени', () => {
      const storage = createMockStorage();
      const withCurator = renderWelcomeText(storage, { status: 'none' }, {
        curatorName: 'Елена',
      });
      const withoutCurator = renderWelcomeText(createMockStorage(), { status: 'none' });

      expect(withCurator).toContain('Написать куратору');
      expect(withoutCurator).not.toContain('Написать куратору');
    });
  });

  describe('порядок первого входа и гейты', () => {
    function OptionalFeatureOfferScreen() {}
    function baseGateHeys(overrides = {}) {
      return {
        cloud: { isPinAuthClient: () => true },
        utils: { lsGet: () => ({ profileCompleted: false }) },
        ProfileSteps: { isProfileIncomplete: () => true },
        Consents: {
          OptionalFeatureOfferScreen,
          shouldOfferOptionalFeatures: () => true,
        },
        ...overrides,
      };
    }

    it('OptionalFeatureOffer не показывается пока профиль неполон', () => {
      const buildConsentGate = loadGateFlow(baseGateHeys());
      const gate = buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: CLIENT_ID,
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        setShowMorningCheckin: () => {},
      });

      expect(gate).toBeNull();
    });

    it('subscription-waiting не дублирует ending при showMorningCheckin', () => {
      const buildConsentGate = loadGateFlow({
        cloud: { isPinAuthClient: () => true },
        utils: { lsGet: () => ({ profileCompleted: true }) },
        ProfileSteps: { isProfileIncomplete: () => false },
        Consents: {},
      });

      const gate = buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: CLIENT_ID,
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        showMorningCheckin: true,
        subscriptionState: {
          status: 'trial_pending',
          details: { trial_started_at: '2026-08-21T03:00:00.000Z' },
          isLoading: false,
        },
      });

      expect(gate).toBeNull();
    });

    it('subscription-waiting показывается без открытого MorningCheckin', () => {
      const buildConsentGate = loadGateFlow({
        cloud: { isPinAuthClient: () => true },
        utils: { lsGet: () => ({ profileCompleted: true }) },
        ProfileSteps: { isProfileIncomplete: () => false },
        Consents: {},
      });

      const gate = buildConsentGate({
        gate: null,
        desktopGate: null,
        cloudUser: null,
        clientId: CLIENT_ID,
        needsConsent: false,
        checkingConsent: false,
        setNeedsConsent: () => {},
        showMorningCheckin: false,
        subscriptionState: {
          status: 'none',
          details: {},
          isLoading: false,
        },
      });

      expect(gate?.props?.key).toBe('subscription-waiting');
    });
  });

  describe('live trial и сохранение ending', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('не гасит регистрационный итог при trial_pending sync', () => {
      const { React, setter, getShow, cleanups } = createStatefulMorningReact(true);
      window.React = React;
      window.HEYS = {
        _consentsValid: true,
        utils: { getCurrentClientId: () => CLIENT_ID, lsGet: () => ({}) },
        ProfileSteps: { isProfileIncomplete: () => true },
        shouldShowMorningCheckin: vi.fn(() => false),
        Subscription: {
          canWriteStatus: (status) => ['trial', 'active'].includes(status),
          getCachedStatus: () => 'trial_pending',
          getLocalStatus: () => 'trial_pending',
        },
        YesterdayVerifyReady: true,
        YesterdayVerify: { shouldShow: vi.fn(() => false), stepRegistered: true },
      };

      // eslint-disable-next-line no-eval
      (0, eval)(APP_MORNING_SRC);
      window.HEYS.AppMorningCheckin.useMorningCheckinSync({
        React,
        isInitializing: false,
        clientId: CLIENT_ID,
      });

      window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
        detail: { clientId: CLIENT_ID, phase: 'full' },
      }));
      vi.advanceTimersByTime(250);

      expect(getShow()).toBe(true);
      expect(setter).toHaveBeenCalled();
      const lastUpdater = setter.mock.calls[setter.mock.calls.length - 1][0];
      expect(typeof lastUpdater).toBe('function');
      expect(lastUpdater(true)).toBe(true);

      cleanups.forEach((fn) => fn());
    });

    it('после canWrite открывает чек-ин с ожидания', () => {
      const { React, setter, cleanups } = createStatefulMorningReact(false);
      window.React = React;
      window.HEYS = {
        _consentsValid: true,
        utils: { getCurrentClientId: () => CLIENT_ID, lsGet: () => ({ profileCompleted: true }) },
        ProfileSteps: { isProfileIncomplete: () => false },
        shouldShowMorningCheckin: vi.fn(() => true),
        Subscription: {
          canWriteStatus: (status) => ['trial', 'active'].includes(status),
        },
        YesterdayVerifyReady: true,
        YesterdayVerify: { shouldShow: vi.fn(() => false), stepRegistered: true },
      };

      // eslint-disable-next-line no-eval
      (0, eval)(APP_MORNING_SRC);
      window.HEYS.AppMorningCheckin.useMorningCheckinSync({
        React,
        isInitializing: false,
        clientId: CLIENT_ID,
      });

      window.dispatchEvent(new CustomEvent('heysSyncCompleted', {
        detail: { clientId: CLIENT_ID, phase: 'full' },
      }));
      vi.advanceTimersByTime(250);
      setter.mockClear();

      window.dispatchEvent(new CustomEvent('heys:subscription-changed', {
        detail: { status: 'trial', previousStatus: 'trial_pending' },
      }));
      vi.advanceTimersByTime(1);

      expect(setter).toHaveBeenCalled();
      cleanups.forEach((fn) => fn());
    });
  });

  describe('UI-контракты handoff и утра', () => {
    it('MorningCheckin StepModal без onClose; overlays remount на daily и ведёт на Главную', () => {
      const stepModalMount = MORNING_SRC.slice(
        MORNING_SRC.indexOf('return React.createElement(HEYS.StepModal.Component'),
        MORNING_SRC.indexOf('requireStepAck: true') + 'requireStepAck: true'.length,
      );
      // Проверяем проп, а не слово: комментарий рядом объясняет, почему
      // крестика нет, и подстрочный поиск ловил именно его.
      expect(stepModalMount).not.toMatch(/onClose\s*:/);
      expect(stepModalMount).toContain('showProgress: true');
      const morningMountStart = OVERLAYS_SRC.indexOf('React.createElement(HEYS.MorningCheckin');
      const morningMountEnd = OVERLAYS_SRC.indexOf('// === OFFLINE BANNER', morningMountStart);
      const morningMount = OVERLAYS_SRC.slice(morningMountStart, morningMountEnd);
      expect(morningMount).not.toMatch(/onClose\s*:/);
      expect(OVERLAYS_SRC).toContain('startDailyCheckin');
      expect(OVERLAYS_SRC).toContain("setCheckinMode('daily')");
      expect(OVERLAYS_SRC).toContain("resolveHomeTab?.('widgets')");
      expect(PROFILE_STEP_SRC).toContain('disableBack: true');
      expect(PROFILE_STEP_SRC).toContain('hideProgressDots: true');
      expect(PROFILE_STEP_SRC).toContain('Профиль готов');
      expect(MORNING_SRC).not.toContain('Прервать утренний чек-ин?');
    });
  });

  describe('цель, активность и копи регистрации', () => {
    it('validate цели требует и процент, и activityLevel', () => {
      const storage = createMockStorage({ heys_profile: JSON.stringify({}) });
      const steps = loadProfileWelcome(storage);
      expect(steps['profile-goals'].validate({ deficitPctTarget: -10 })).toBe('Выберите активность');
      expect(steps['profile-goals'].validate({ activityLevel: 'light' })).toBe('Выберите цель');
      expect(steps['profile-goals'].validate({ deficitPctTarget: -10, activityLevel: 'light' })).toBe(true);
    });

    it('save целей пишет activityLevel в профиль', async () => {
      const storage = createMockStorage({ heys_profile: JSON.stringify({}) });
      const steps = loadProfileWelcome(storage);
      await steps['profile-goals'].save({
        deficitPctTarget: -15,
        activityLevel: 'sedentary',
        goalDirection: 'lose',
      });
      expect(readJson(storage, 'heys_profile')).toMatchObject({
        deficitPctTarget: -15,
        activityLevel: 'sedentary',
      });
    });
  });
});
