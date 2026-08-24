// Сверка двух строк контракта checkin-morning (сборка 24 августа):
//
//   «чек-ин не пройден до вечера» — вечером предлагается полный чек-ин, как
//   утренний, но два вопроса переформулированы: вместо «Цель по шагам» стоит
//   «Сколько прошли за день», вместо «Сколько планируете» — «Сколько
//   получилось». Остальные вопросы — сон, вес, самочувствие — звучат дословно
//   так же.
//
//   «пропущенные дни подряд» — после двух недель отсутствия чек-ин открывается
//   только на сегодня; развилка разбора предлагает пачку не больше семи дней,
//   остальные закрываются без разбора. Числа за незакрытые дни остаются как
//   есть, «дыр» в истории не появляется.
//
// Названные отступления (контракт старше кадра, но кадров вечера в пакете нет):
//   · строка контракта называет вопросы перифразом, а не строками продукта.
//     «Цель по шагам» — единственное дословное совпадение, в коде это
//     accessible-имя ползунка шагов; роль «вопроса над крупным числом» играет
//     надзаголовок экрана «Шаги на сегодня» — его и заменяет «Сколько
//     получилось».
//   · порог вечера строкой не назван. Взят уже существующий в продукте рубеж
//     18:00 (приветствие входа heys_login_screen_v1.js, getTimePeriod советов).
//   · шапка первого вопроса «Доброе утро» — не вопрос чек-ина, но вечером она
//     врёт; вечером берётся уже существующее в продукте «Добрый вечер».
//   · семидневная пачка включена всегда, а не только после двух недель
//     отсутствия: обоснование строки («за семью днями разбор превращается в
//     угадывание») от длины перерыва не зависит.
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

function loadStepRegistry() {
  window.React = React;
  window.ReactDOM = { render: vi.fn(), unmountComponentAtNode: vi.fn() };
  window.HEYS = {
    utils: { lsGet: () => ({}), lsSet: vi.fn() },
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

function renderStepsGoal(registry, daypart) {
  const Component = registry.stepsGoal.component;
  return render(React.createElement(Component, {
    data: { stepsGoal: 10500 },
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

function loadMorningPlanner() {
  const values = new Map();
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

  it('вечер начинается с 18:00 по часам устройства и часового пояса не заводит', () => {
    const utils = loadMorningPlanner();
    expect(utils.EVENING_CHECKIN_HOUR).toBe(18);
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 7, 0))).toBe('morning');
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 17, 59))).toBe('morning');
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 18, 0))).toBe('evening');
    expect(utils.getCheckinDaypart(new Date(2026, 7, 16, 23, 30))).toBe('evening');
    // Ни одного обращения к часовому поясу в модуле чек-ина.
    expect(MORNING_SRC).not.toMatch(/timeZone|getTimezoneOffset|Intl\.DateTimeFormat/);
  });

  it('вечерний вариант — тот же полный состав шагов, не урезанный', () => {
    vi.useFakeTimers();
    const utils = loadMorningPlanner();

    vi.setSystemTime(new Date(2026, 7, 16, 8, 0));
    const morningPlan = utils.buildMorningCheckinPlan({ source: 'test', mode: 'daily' });

    vi.setSystemTime(new Date(2026, 7, 16, 20, 30));
    const eveningPlan = utils.buildMorningCheckinPlan({ source: 'test', mode: 'daily' });

    expect(morningPlan.daypart).toBe('morning');
    expect(eveningPlan.daypart).toBe('evening');
    expect(eveningPlan.steps).toEqual(morningPlan.steps);
    expect(eveningPlan.steps).toEqual(expect.arrayContaining([
      'weight', 'sleep', 'morning_mood', 'stepsGoal', 'morningRest',
    ]));
    // Чек-ин открывается только на сегодня — своей даты не выбирает.
    expect(eveningPlan.dateKey).toBe(DATE_KEY);
  });

  // Две вечерние переформулировки экрана шагов сознательно НЕ сделаны: ответ
  // отсюда уходит в profile.stepsGoal, то есть в план, а вечерний вопрос
  // «сколько прошли за день» собирает факт. Переименовать подпись, не сменив
  // приёмник, значит записать факт как идеально выполненный план — день
  // выглядел бы безупречно закрытой целью. Тест сторожит именно это: пока
  // приёмник прежний, вечерний экран обязан звучать как план.
  it('экран шагов вечером не переименован, пока ответ уходит в план', () => {
    const registry = loadStepRegistry();

    const morning = renderStepsGoal(registry, 'morning');
    const morningKicker = morning.container.querySelector('.mc-step-kicker').textContent;
    const morningAria = morning.container.querySelector('.mc-v4-scale').getAttribute('aria-label');
    const morningText = morning.container.textContent;
    cleanup();

    const evening = renderStepsGoal(registry, 'evening');
    const eveningKicker = evening.container.querySelector('.mc-step-kicker').textContent;
    const eveningAria = evening.container.querySelector('.mc-v4-scale').getAttribute('aria-label');
    const eveningText = evening.container.textContent;

    expect(eveningKicker).toBe(morningKicker);
    expect(eveningAria).toBe(morningAria);
    expect(eveningText).toBe(morningText);

    // Сторож приёмника: как только ответ перестанет уходить в profile.stepsGoal,
    // этот тест обязан упасть — значит вопрос владельцу решён и подписи пора
    // менять по строке контракта.
    const stepsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_steps_v1.js'), 'utf8');
    expect(stepsSrc).toContain('profile.stepsGoal = data.stepsGoal;');
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
