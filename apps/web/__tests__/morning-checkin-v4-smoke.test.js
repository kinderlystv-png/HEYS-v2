import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');
const SYNC_MERGE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_sync_merge_v1.js'), 'utf8');
const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const PWA_CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css'), 'utf8');

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
    expect(STEPS_SRC).toMatch(/function CombinedSleepStepComponent[\s\S]*const TimePicker = HEYS\.StepModal\.TimePicker/);
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

  it('morningRest stays blocking until coldExposure is saved', () => {
    expect(MORNING_SRC).toContain("const MORNING_OPTIONAL_TAIL_STEPS = new Set(['checkinRecorded'");
    expect(MORNING_SRC).not.toMatch(/!\(row\.id === 'morningRest' && coreDone\)/);
    const { utils } = loadMorning({
      day: {
        weightMorning: 72,
        sleepStart: '23:00',
        sleepEnd: '07:00',
        sleepQuality: 7,
        morningMood: 5,
        wellbeing: 5,
        stress: 3,
      },
      profile: { stepsGoal: 10000, stepsGoalConfirmedDate: DATE_KEY },
    });
    expect(utils.isMorningStepComplete('morningRest', {
      dateKey: DATE_KEY,
      day: {
        weightMorning: 72,
        sleepStart: '23:00',
        sleepEnd: '07:00',
        sleepQuality: 7,
        morningMood: 5,
        wellbeing: 5,
        stress: 3,
      },
      profile: { stepsGoal: 10000, stepsGoalConfirmedDate: DATE_KEY },
    })).toBe(false);
    expect(utils.isMorningStepComplete('morningRest', {
      dateKey: DATE_KEY,
      day: {
        weightMorning: 72,
        sleepStart: '23:00',
        sleepEnd: '07:00',
        sleepQuality: 7,
        morningMood: 5,
        wellbeing: 5,
        stress: 3,
        coldExposure: { type: 'none', answeredAt: 1 },
      },
      profile: { stepsGoal: 10000, stepsGoalConfirmedDate: DATE_KEY },
    })).toBe(false);
    expect(utils.isMorningStepComplete('morningRest', {
      dateKey: DATE_KEY,
      day: {
        weightMorning: 72,
        sleepStart: '23:00',
        sleepEnd: '07:00',
        sleepQuality: 7,
        morningMood: 5,
        wellbeing: 5,
        stress: 3,
        coldExposure: { type: 'none', answeredAt: 1 },
        morningActivation: { status: 'done', checkinAnsweredAt: 1, intensity: null },
      },
      profile: { stepsGoal: 10000, stepsGoalConfirmedDate: DATE_KEY },
    })).toBe(true);
  });

  it('v4 daily plan keeps full core after weight is already saved (canvas progress + back)', () => {
    const { utils } = loadMorning({
      day: { weightMorning: 73.4, weightMorningSource: 'measured' },
    });
    const plan = utils.buildMorningCheckinPlan({
      dateKey: DATE_KEY,
      clientId: CLIENT_ID,
      source: 'MorningCheckin',
    });
    expect(plan.steps).toEqual([
      'weight',
      'sleep',
      'morning_mood',
      'stepsGoal',
      'morningRest',
      'checkinRecorded',
    ]);
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

describe('checkin-morning · три сквозных правила продукта', () => {
  it('safe-area: футер прижат к нижней врезке (поля 12/18/20 контракта)', () => {
    // Контракт «safe-area и кнопка назад» (checkin-morning.v4.dc.html):
    // «футер прижат к нижней врезке». Уже реализовано — .mc-daily-footer
    // берёт готовую переменную --safe-area-bottom (000-base-and-gamification.css:135
    // = env(safe-area-inset-bottom, 0px)), своего env() заводить не нужно.
    const idx = PWA_CSS.indexOf('.mc-daily-footer {');
    expect(idx).toBeGreaterThan(-1);
    const block = PWA_CSS.slice(idx, idx + 200);
    expect(block).toContain('padding: 12px 18px calc(20px + var(--safe-area-bottom));');
  });

  it('выделение: заметка о сне выделяется, вопрос и подписи оценок — нет', () => {
    // Контракт «язык, выделение, часовой пояс»: «свои заметки о сне
    // выделяются и копируются; вопросы и подписи оценок — нет».
    expect(PWA_CSS).not.toMatch(/\.mc-note-input\s*\{[^}]*user-select:\s*none/);
    const titleMatch = PWA_CSS.match(/\.mc-step-title,\s*\.mc-step-hint\s*\{[^}]*\}/);
    expect(titleMatch).toBeTruthy();
    expect(titleMatch[0]).toContain('user-select: none;');
    const kickerIdx = PWA_CSS.indexOf('.mc-step-kicker {');
    expect(kickerIdx).toBeGreaterThan(-1);
    expect(PWA_CSS.slice(kickerIdx, kickerIdx + 250)).toContain('user-select: none;');
    const scaleIdx = PWA_CSS.indexOf('.mc-scale-head {');
    expect(scaleIdx).toBeGreaterThan(-1);
    expect(PWA_CSS.slice(scaleIdx, scaleIdx + 350)).toContain('user-select: none;');
    const qualityIdx = PWA_CSS.indexOf('.mc-quality-label {');
    expect(qualityIdx).toBeGreaterThan(-1);
    expect(PWA_CSS.slice(qualityIdx, qualityIdx + 250)).toContain('user-select: none;');
  });

  it('повторный тап на «Дальше»: re-entrancy guard в StepModal уже блокирует двойное нажатие', () => {
    // Контракт «повторный тап и поворот»: «защита стоит на кнопке «Дальше» —
    // двойное нажатие не проскакивает шаг». Кнопка живёт в heys_step_modal_v1.js
    // (общий для всех step-flow модуль, вне зоны this-агента: checkin-morning,
    // но не сам StepModal). handleNext уже синхронно блокирует повторный вызов
    // через actionInFlightRef ДО первого await и до setSavingStep — второй
    // клик из того же тика return'ится немедленно, а кнопка вдобавок physically
    // disabled на время сохранения/анимации. Это закрывает контракт без
    // отдельного 350-мс таймера; фиксируем этим тестом, чтобы будущий рефактор
    // StepModal не потерял guard молча.
    expect(STEP_MODAL_SRC).toMatch(
      /const handleNext = useCallback\(async \(maybePatch\) => \{\s*\n\s*if \(actionInFlightRef\.current \|\| transitionInFlightRef\.current \|\| savingStep \|\| animating\) return;/,
    );
    expect(STEP_MODAL_SRC).toContain('actionInFlightRef.current = true;');
    expect(STEP_MODAL_SRC).toMatch(/dailyPrimaryDisabled = savingStep \|\| animating \|\| liveInvalidReason/);
    expect(STEP_MODAL_SRC).toMatch(/className: 'mc-btn mc-btn--primary mc-daily-footer-primary',\s*\n\s*onClick: handleNext,\s*\n\s*disabled: dailyPrimaryDisabled/);
  });
});
