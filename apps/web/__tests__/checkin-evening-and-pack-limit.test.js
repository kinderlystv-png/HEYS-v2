// Сверка двух строк контракта checkin-morning (пятнадцатая сборка пакета):
//
//   «чек-ин не пройден до вечера» (решение 24 августа) — незакрытый чек-ин
//   показывается как есть, полным мастером и в прежних формулировках. «Во
//   сколько легли» и «Насколько выспались» относятся к прошлой ночи и вечером
//   остаются верными; «Цель по шагам» относится к уже прошедшему дню и тоже не
//   переписывается. Урезанного вечернего варианта, второго набора текстов и
//   порога, после которого чек-ин перестают предлагать, нет.
//
//   «пропущенные дни подряд» (решение 24 августа) — развилка разбора предлагает
//   до семи пропущенных дней подряд; дальше — только сегодняшний чек-ин, старые
//   дни остаются незакрытыми и в разбор не попадают.
//
// Названные отступления (контракт старше кадра, кадров вечера в пакете нет):
//   · приветствие в шапке первого вопроса вечером говорит «Добрый вечер».
//     Строка запрещает второй набор формулировок под один экран; приветствие в
//     него не входит — это не вопрос и не подпись ответа, а та же строка
//     продукта, что на входе (heys_login_screen_v1.js). Рубеж 18:00 взят оттуда
//     же и остался в модуле только ради приветствия: ни на состав плана, ни на
//     тексты вопросов, ни на приёмники ответов он не влияет.
//   · «старые дни остаются незакрытыми» прочитано как «в разбор не попадают, и
//     ни одно число дня не трогается»: за пачкой день получает только маркер
//     out_of_review_window, приёмы и калории остаются как есть. Без маркера те
//     же дни возвращались бы развилкой каждое утро — а строка требует, чтобы
//     дальше предлагался только сегодняшний чек-ин.
//   · «порог 7 совпадает с окном, по которому считается серия» — обоснование
//     строки, а не проверяемое здесь правило: серия считается сканом на 30 дней
//     с обрывом на первом неуспешном дне (heys_day_calendar_metrics.js), окна в
//     семь дней у неё нет. Сверяется само число 7.
import fs from 'node:fs';
import path from 'node:path';

import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const readSrc = (name) => fs.readFileSync(path.resolve(WEB_DIR, name), 'utf8');

const MORNING_SRC = readSrc('heys_morning_checkin_v1.js');
const STEPS_SRC = readSrc('heys_steps_v1.js');
const STEP_MODAL_SRC = readSrc('heys_step_modal_v1.js');
const SYNC_MERGE_SRC = readSrc('heys_sync_merge_v1.js');
const MODELS_SRC = readSrc('heys_models_v1.js');
const YESTERDAY_SRC = readSrc('heys_yesterday_verify_v1.js');

const CLIENT_ID = 'client-evening';
const DATE_KEY = '2026-08-16';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const originalReactDOM = window.ReactDOM;
const originalDEV = window.DEV;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function addDays(dateKey, delta) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day + delta);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function dayLsKey(date) {
  return `heys_${CLIENT_ID}_dayv2_${date}`;
}

// ── Шаги мастера ─────────────────────────────────────────────────────────────

/** Хранилище последнего загруженного реестра шагов: приёмники пишут в него. */
let stepsStore = new Map();

function loadStepRegistry(seed = {}) {
  window.React = React;
  window.ReactDOM = { render: vi.fn(), unmountComponentAtNode: vi.fn() };
  stepsStore = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  const read = (key, fallback) => (stepsStore.has(key) ? structuredClone(stepsStore.get(key)) : fallback);
  const write = (key, value) => { stepsStore.set(key, structuredClone(value)); };
  window.HEYS = {
    currentClientId: CLIENT_ID,
    store: { get: read, set: write },
    utils: { lsGet: read, lsSet: write, getCurrentClientId: () => CLIENT_ID },
    dayUtils: { todayISO: () => DATE_KEY },
    scales: {
      moodRating: () => ({ color: '#84cc16', step: 'GOOD_SOFT' }),
      stressRating: () => ({ color: '#fbbf24', step: 'NEUTRAL' }),
    },
  };
  // eslint-disable-next-line no-new-func
  new Function(STEP_MODAL_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();
  return window.HEYS.StepModal.registry;
}

function readStoredDay(date = DATE_KEY) {
  return stepsStore.get(dayLsKey(date)) || {};
}

function readStoredProfile() {
  return stepsStore.get('heys_profile') || {};
}

function renderStepsScreen(registry, stepId, data, daypart) {
  const Component = registry[stepId].component;
  return render(React.createElement(Component, {
    data,
    onChange: vi.fn(),
    stepData: {},
    context: { dateKey: DATE_KEY, dailyCheckin: true, daypart },
  }));
}

// ── Развилка разбора ─────────────────────────────────────────────────────────

function loadYesterdayVerify() {
  window.React = React;
  window.DEV = {};
  window.HEYS = {
    currentClientId: CLIENT_ID,
    utils: { getCurrentClientId: () => CLIENT_ID },
    dayUtils: { todayISO: () => DATE_KEY },
    StepModal: { registerStep: vi.fn() },
    MorningCheckinUtils: {
      writeDayV2Scoped: (dateKey, dayData) => {
        localStorage.setItem(dayLsKey(dateKey), JSON.stringify(dayData));
        return true;
      },
    },
  };
  localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({ firstName: 'Анна' }));
  // eslint-disable-next-line no-eval
  (0, eval)(YESTERDAY_SRC);
  return window.HEYS.YesterdayVerify;
}

function filledDay(date) {
  return {
    date,
    meals: [{
      items: [{
        id: `item-${date}`,
        product_id: `product-${date}`,
        grams: 100,
        kcal100: 2200,
        protein100: 100,
        carbs100: 200,
        fat100: 80,
      }],
    }],
  };
}

function lowFoodDay(date) {
  return {
    date,
    meals: [{
      items: [{
        id: `item-${date}`,
        product_id: `product-${date}`,
        grams: 100,
        kcal100: 640,
        protein100: 20,
        carbs100: 40,
        fat100: 20,
      }],
    }],
  };
}

function emptyDay(date) {
  return { date, meals: [] };
}

// ── Планировщик чек-ина ──────────────────────────────────────────────────────

function loadMorningPlanner(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)]));
  localStorage.setItem(`heys_${CLIENT_ID}_profile`, JSON.stringify({
    _sourceClientId: CLIENT_ID,
    profileCompleted: true,
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
    Steps: { shouldShowCycleStep: () => false, shouldShowMeasurements: () => false },
    Refeed: { shouldShowRefeedStep: () => false },
    YesterdayVerifyReady: true,
    YesterdayVerify: { stepRegistered: true, shouldShow: () => true },
    Subscription: {
      getCachedStatus: () => 'trial',
      getLocalStatus: () => 'trial',
      canWriteStatus: (status) => ['trial', 'active'].includes(status),
    },
  };
  // eslint-disable-next-line no-new-func
  new Function(MODELS_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(SYNC_MERGE_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(MORNING_SRC)();
  return window.HEYS.MorningCheckinUtils;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  window.HEYS = originalHEYS;
  window.React = originalReact;
  window.ReactDOM = originalReactDOM;
  window.DEV = originalDEV;
});

describe('чек-ин не пройден до вечера', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('час устройства решает только приветствие; часового пояса модуль не заводит', () => {
    const utils = loadMorningPlanner();
    expect(utils.EVENING_CHECKIN_HOUR).toBe(18);
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 7, 0))).toBe('morning');
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 17, 59))).toBe('morning');
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 18, 0))).toBe('evening');
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 23, 30))).toBe('evening');
    // Ни одного обращения к часовому поясу в модуле чек-ина.
    expect(MORNING_SRC).not.toMatch(/timeZone|getTimezoneOffset|Intl\.DateTimeFormat/);
  });

  it('вечером мастер тот же: состав шагов совпадает с утренним до идентичности', () => {
    vi.useFakeTimers();
    const utils = loadMorningPlanner();

    vi.setSystemTime(new Date(2026, 7, 16, 8, 0));
    const morningPlan = utils.buildMorningCheckinPlan({ source: 'test', mode: 'daily' });

    vi.setSystemTime(new Date(2026, 7, 16, 20, 30));
    const eveningPlan = utils.buildMorningCheckinPlan({ source: 'test', mode: 'daily' });

    expect(morningPlan.daypart).toBe('morning');
    expect(eveningPlan.daypart).toBe('evening');
    // Урезанного вечернего варианта нет: тот же список, тот же порядок.
    expect(eveningPlan.steps).toEqual(morningPlan.steps);
    expect(morningPlan.steps).toEqual(expect.arrayContaining([
      'weight', 'sleep', 'morning_mood', 'stepsGoal', 'morningRest',
    ]));
    // Чек-ин открывается только на сегодня — своей даты не выбирает.
    expect(eveningPlan.dateKey).toBe(DATE_KEY);
  });

  it('порога, после которого чек-ин перестают предлагать, нет', () => {
    vi.useFakeTimers();
    const utils = loadMorningPlanner();

    // Поздний вечер — мастер всё ещё полный, а не пустой и не обрезанный.
    vi.setSystemTime(new Date(2026, 7, 16, 23, 45));
    const latePlan = utils.buildMorningCheckinPlan({ source: 'test', mode: 'daily' });
    expect(latePlan.steps).toEqual(expect.arrayContaining([
      'weight', 'sleep', 'morning_mood', 'stepsGoal', 'morningRest',
    ]));
    expect(utils.getCheckinSteps({}, { filterCompleted: false, dateKey: DATE_KEY }))
      .toContain('stepsGoal');
  });

  it('второго набора текстов нет: слот шагов — один шаг реестра', () => {
    const registry = loadStepRegistry();
    expect(registry.stepsGoal).toBeTruthy();
    // Вечернего близнеца не существует ни в реестре, ни в исходнике.
    expect(registry.stepsFact).toBeUndefined();
    expect(STEPS_SRC).not.toContain('stepsFact');
    expect(MORNING_SRC).not.toContain('stepsFact');

    const readScreen = (daypart) => {
      const view = renderStepsScreen(registry, 'stepsGoal', { stepsGoal: 10500 }, daypart);
      const text = {
        kicker: view.container.querySelector('.mc-step-kicker').textContent,
        label: view.container.querySelector('.mc-v4-scale').getAttribute('aria-label'),
        min: view.container.querySelector('.mc-v4-scale').getAttribute('aria-valuemin'),
      };
      cleanup();
      return text;
    };

    // «Цель по шагам» относится к уже прошедшему дню и не переписывается.
    expect(readScreen('evening')).toEqual(readScreen('morning'));
    expect(readScreen('morning')).toEqual({
      kicker: 'Шаги на сегодня', label: 'Цель по шагам', min: '3000',
    });
  });

  it('ответ уходит в план дня в любой час, а факта дня не выдумывает', () => {
    const registry = loadStepRegistry();

    registry.stepsGoal.save({ stepsGoal: 11500 }, { dateKey: DATE_KEY });

    const profile = readStoredProfile();
    expect(profile.stepsGoal).toBe(11500);
    expect(profile.stepsGoalConfirmedDate).toBe(DATE_KEY);
    // Приёмник один: шаг не пишет в день ни числа шагов, ни отметки ответа.
    expect(readStoredDay().steps).toBeUndefined();
    expect(readStoredDay().stepsAnsweredAt).toBeUndefined();
  });

  it('подтверждённый план закрывает слот шагов и вечером тоже', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 21, 0));
    const utils = loadMorningPlanner();
    const profile = { stepsGoal: 11500, stepsGoalConfirmedDate: DATE_KEY };
    expect(utils.hasStepsGoalConfirmedToday(profile, DATE_KEY)).toBe(true);
    expect(utils.isMorningStepComplete('stepsGoal', { dateKey: DATE_KEY, day: {}, profile }))
      .toBe(true);
    expect(utils.getCheckinSteps(profile, { filterCompleted: true, dateKey: DATE_KEY }))
      .not.toContain('stepsGoal');
  });

  it('сон, вес и самочувствие вечером звучат дословно так же', () => {
    const registry = loadStepRegistry();
    const cases = [
      ['weight', { weightKg: 72, weightG: 4 }],
      ['sleep', { sleepStart: '23:00', sleepEnd: '07:00', sleepQuality: 7 }],
      ['morning_mood', { mood: 5, wellbeing: 5, stress: 5 }],
    ];

    cases.forEach(([stepId, data]) => {
      const Component = registry[stepId].component;
      const readKicker = (daypart) => {
        const view = render(React.createElement(Component, {
          data,
          onChange: vi.fn(),
          stepData: {},
          context: { dateKey: DATE_KEY, dailyCheckin: false, daypart },
        }));
        const kicker = view.container.querySelector('.mc-step-kicker');
        const text = kicker ? kicker.textContent : null;
        cleanup();
        return text;
      };
      expect(readKicker('evening')).toBe(readKicker('morning'));
    });

    // Кадры и код: надзаголовки этих трёх экранов не зависят от времени суток.
    expect(STEPS_SRC).toContain("React.createElement('div', { className: 'mc-step-kicker' }, 'Вес на утро')");
    expect(STEPS_SRC).toContain("React.createElement('div', { className: 'mc-step-kicker' }, 'Сон этой ночью')");
    expect(STEPS_SRC).toContain("React.createElement('div', { className: 'mc-step-kicker' }, 'Как вы сегодня')");
  });

  it('шапка первого вопроса вечером здоровается по-вечернему', () => {
    const registry = loadStepRegistry();
    const Component = registry.weight.component;
    const renderGreeting = (daypart) => {
      const view = render(React.createElement(Component, {
        data: { weightKg: 72, weightG: 4 },
        onChange: vi.fn(),
        stepData: {},
        context: { dateKey: DATE_KEY, dailyCheckin: true, daypart },
      }));
      const node = view.container.querySelector('.mc-daily-greeting-title');
      const text = node ? node.textContent : null;
      cleanup();
      return text;
    };
    expect(renderGreeting('morning')).toBe('Доброе утро');
    expect(renderGreeting('evening')).toBe('Добрый вечер');
  });
});

describe('пропущенные дни подряд', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** Перерыв в `gap` дней: последний заполненный день — gap дней назад. */
  function seedAbsence(YesterdayVerify, gap) {
    const yesterday = YesterdayVerify.getYesterdayKey();
    const anchor = addDays(yesterday, -gap);
    localStorage.setItem(dayLsKey(anchor), JSON.stringify(filledDay(anchor)));
    const pending = [];
    for (let i = gap - 1; i >= 0; i--) {
      const date = addDays(yesterday, -i);
      // Чередуем пустые и малоедящие дни: оба вида попадают в развилку.
      const payload = i % 2 === 0 ? emptyDay(date) : lowFoodDay(date);
      localStorage.setItem(dayLsKey(date), JSON.stringify(payload));
      pending.push(date);
    }
    return { yesterday, anchor, pending };
  }

  it('предел пачки — семь дней', () => {
    const YesterdayVerify = loadYesterdayVerify();
    expect(YesterdayVerify.PENDING_REVIEW_PACK_MAX).toBe(7);
    const days = Array.from({ length: 10 }, (_, i) => ({ date: `d${i}` }));
    const split = YesterdayVerify.splitPendingPackByLimit(days);
    expect(split.packDays).toHaveLength(7);
    expect(split.overflowDays).toHaveLength(3);
    expect(split.packDays[0].date).toBe('d3');
    expect(YesterdayVerify.splitPendingPackByLimit(days.slice(0, 5)).overflowDays).toEqual([]);
  });

  it('после двух недель отсутствия развилка предлагает семь дней, ближайших к сегодня', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const { pending } = seedAbsence(YesterdayVerify, 21);

    const result = YesterdayVerify.getPendingPastDays();
    expect(result.totalPendingDaysUncapped).toBe(21);
    expect(result.totalPendingDays).toBe(7);
    expect(result.missingDays.map((day) => day.date)).toEqual(pending.slice(-7));
    expect(result.overflowDays.map((day) => day.date)).toEqual(pending.slice(0, 14));
    expect(YesterdayVerify.shouldShow()).toBe(true);
  });

  it('короткий перерыв идёт в разбор целиком', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const { pending } = seedAbsence(YesterdayVerify, 4);
    const result = YesterdayVerify.getPendingPastDays();
    expect(result.totalPendingDays).toBe(4);
    expect(result.overflowDays).toEqual([]);
    expect(result.missingDays.map((day) => day.date)).toEqual(pending);
  });

  it('дни за пачкой закрываются без разбора и их числа остаются как есть', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const { pending } = seedAbsence(YesterdayVerify, 21);
    const overflow = pending.slice(0, 14);
    const pack = pending.slice(-7);
    const before = new Map(pending.map((date) => [date, localStorage.getItem(dayLsKey(date))]));

    const closed = YesterdayVerify.closePendingDaysOutsideReviewWindow('test');
    expect(closed).toEqual(overflow);

    overflow.forEach((date) => {
      const after = JSON.parse(localStorage.getItem(dayLsKey(date)));
      expect(after.yesterdayVerifyAction).toBe('out_of_review_window');
      expect(YesterdayVerify.isExplicitlyVerified(after)).toBe(true);
      // Числа дня не тронуты: снимок до закрытия совпадает после снятия маркера.
      const stripped = { ...after };
      delete stripped.yesterdayVerifyAction;
      delete stripped.yesterdayVerifyAt;
      delete stripped.yesterdayVerifyVersion;
      delete stripped.updatedAt;
      expect(stripped).toEqual(JSON.parse(before.get(date)));
    });

    // Пачка не тронута вовсе.
    pack.forEach((date) => {
      expect(localStorage.getItem(dayLsKey(date))).toBe(before.get(date));
    });
  });

  it('закрытые дни не возвращаются развилкой, а пачка не добирает их место', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const { pending } = seedAbsence(YesterdayVerify, 21);
    YesterdayVerify.closePendingDaysOutsideReviewWindow('test');

    const result = YesterdayVerify.getPendingPastDays();
    expect(result.totalPendingDaysUncapped).toBe(7);
    expect(result.overflowDays).toEqual([]);
    expect(result.missingDays.map((day) => day.date)).toEqual(pending.slice(-7));

    // Повторный проход ничего не пишет.
    expect(YesterdayVerify.closePendingDaysOutsideReviewWindow('test')).toEqual([]);
  });

  it('«дыр» в истории не появляется: закрытые дни остаются в списке дней', () => {
    const YesterdayVerify = loadYesterdayVerify();
    const { pending } = seedAbsence(YesterdayVerify, 21);
    YesterdayVerify.closePendingDaysOutsideReviewWindow('test');

    pending.slice(0, 14).forEach((date, index) => {
      expect(localStorage.getItem(dayLsKey(date))).not.toBeNull();
      const info = YesterdayVerify.getDayReviewInfo(date);
      expect(info.date).toBe(date);
      expect(info.hasStoredDay).toBe(true);
      expect(info.hasBeenVerified).toBe(true);
      // Ни один день не «поправлен» закрытием: пустой остался пустым,
      // малоедящий сохранил свои приёмы и калории.
      const wasEmpty = (21 - 1 - index) % 2 === 0;
      expect(info.mealCount).toBe(wasEmpty ? 0 : 1);
      expect(info.isFastingDay).toBe(false);
      expect(info.isIncomplete).toBe(false);
    });
  });
});
