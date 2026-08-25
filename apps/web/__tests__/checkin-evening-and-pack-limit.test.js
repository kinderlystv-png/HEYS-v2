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
//   · нижняя граница ползунка у вечернего экрана — ноль, а не 3 000: «нисколько
//     не прошёл» — законный факт, тогда как план в ноль шагов смысла не имеет.
//     Контракт границ не называет.
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
    // Состав не меняется: та же длина, тот же порядок слотов. Отличается ровно
    // один — слот шагов: утром там вопрос про план, вечером про факт.
    expect(eveningPlan.steps).toHaveLength(morningPlan.steps.length);
    expect(eveningPlan.steps.map((id) => (id === 'stepsFact' ? 'stepsGoal' : id)))
      .toEqual(morningPlan.steps);
    expect(morningPlan.steps).toEqual(expect.arrayContaining([
      'weight', 'sleep', 'morning_mood', 'stepsGoal', 'morningRest',
    ]));
    expect(eveningPlan.steps).toEqual(expect.arrayContaining([
      'weight', 'sleep', 'morning_mood', 'stepsFact', 'morningRest',
    ]));
    expect(eveningPlan.steps).not.toContain('stepsGoal');
    // Чек-ин открывается только на сегодня — своей даты не выбирает.
    expect(eveningPlan.dateKey).toBe(DATE_KEY);
  });

  it('вечером спрашивают факт, а не план: два шага, а не один с ветвлением', () => {
    const registry = loadStepRegistry();
    expect(registry.stepsGoal).toBeTruthy();
    expect(registry.stepsFact).toBeTruthy();
    expect(registry.stepsFact.component).not.toBe(registry.stepsGoal.component);

    const morning = renderStepsScreen(registry, 'stepsGoal', { stepsGoal: 10500 }, 'morning');
    expect(morning.container.querySelector('.mc-step-kicker').textContent).toBe('Шаги на сегодня');
    expect(morning.container.querySelector('.mc-v4-scale').getAttribute('aria-label'))
      .toBe('Цель по шагам');
    cleanup();

    // Дословно из строки контракта «чек-ин не пройден до вечера».
    const evening = renderStepsScreen(registry, 'stepsFact', { steps: 8200 }, 'evening');
    expect(evening.container.querySelector('.mc-step-kicker').textContent).toBe('Сколько получилось');
    expect(evening.container.querySelector('.mc-v4-scale').getAttribute('aria-label'))
      .toBe('Сколько прошли за день');
  });

  it('вечерний ответ уходит в день, а план дня не трогает', () => {
    const registry = loadStepRegistry({
      heys_profile: { stepsGoal: 11000, stepsGoalConfirmedDate: '2026-08-10' },
    });

    registry.stepsFact.save({ steps: 8200 }, { dateKey: DATE_KEY });

    const day = readStoredDay();
    expect(day.steps).toBe(8200);
    expect(day.stepsAnsweredAt).toBeGreaterThan(0);
    // heys_sync_merge_v1 решает спор по stepsUpdatedAt — без него уменьшение
    // проиграло бы legacy-правилу «берём максимум».
    expect(day.stepsUpdatedAt).toBeGreaterThan(0);
    // План не тронут: факт не выдаёт себя за идеально выполненную цель.
    expect(readStoredProfile()).toEqual({ stepsGoal: 11000, stepsGoalConfirmedDate: '2026-08-10' });
  });

  it('утренний ответ уходит в план, а факта дня не выдумывает', () => {
    const registry = loadStepRegistry();

    registry.stepsGoal.save({ stepsGoal: 11500 }, { dateKey: DATE_KEY });

    const profile = readStoredProfile();
    expect(profile.stepsGoal).toBe(11500);
    expect(profile.stepsGoalConfirmedDate).toBe(DATE_KEY);
    expect(readStoredDay().steps).toBeUndefined();
    expect(readStoredDay().stepsAnsweredAt).toBeUndefined();
  });

  it('ноль шагов — данный ответ: шаг не переспрашивается', () => {
    const registry = loadStepRegistry();
    // Ноль вообще достижим ползунком: у факта нижняя граница — ноль.
    const view = renderStepsScreen(registry, 'stepsFact', { steps: 0 }, 'evening');
    expect(view.container.querySelector('.mc-v4-scale').getAttribute('aria-valuemin')).toBe('0');
    cleanup();

    registry.stepsFact.save({ steps: 0 }, { dateKey: DATE_KEY });
    const day = readStoredDay();
    expect(day.steps).toBe(0);
    expect(day.stepsAnsweredAt).toBeGreaterThan(0);

    // Планировщик читает отметку, а не истинность значения.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 21, 0));
    const utils = loadMorningPlanner({ [dayLsKey(DATE_KEY)]: day });
    expect(utils.hasStepsFactAnswered(day)).toBe(true);
    expect(utils.isMorningStepComplete('stepsFact', { dateKey: DATE_KEY, day, profile: {} })).toBe(true);
    expect(utils.getCheckinSteps({}, { filterCompleted: true, dateKey: DATE_KEY, daypart: 'evening' }))
      .not.toContain('stepsFact');
  });

  it('повторное открытие вечером показывает уже отвеченное, включая ноль', () => {
    const answered = { date: DATE_KEY, steps: 0, stepsAnsweredAt: 1700000000000 };
    const registry = loadStepRegistry({ [dayLsKey(DATE_KEY)]: answered });
    expect(registry.stepsFact.getInitialData({ dateKey: DATE_KEY }, {}).steps).toBe(0);

    const walked = { date: DATE_KEY, steps: 7400, stepsAnsweredAt: 1700000000000 };
    const registry2 = loadStepRegistry({ [dayLsKey(DATE_KEY)]: walked });
    expect(registry2.stepsFact.getInitialData({ dateKey: DATE_KEY }, {}).steps).toBe(7400);
  });

  it('событие о шагах несёт дату дня, к которому относится ответ', () => {
    const registry = loadStepRegistry();
    const seen = [];
    const listener = (event) => seen.push(event.detail);
    window.addEventListener('heysStepsUpdated', listener);
    try {
      registry.stepsFact.save({ steps: 9100 }, { dateKey: DATE_KEY });
    } finally {
      window.removeEventListener('heysStepsUpdated', listener);
    }
    expect(seen).toEqual([{ steps: 9100, date: DATE_KEY }]);
  });

  // Здесь раньше стоял сторож приёмника: пока ответ вечернего экрана уходил в
  // profile.stepsGoal, переименовывать подписи было нельзя — факт записался бы
  // как идеально выполненный план. Приёмник разведён (stepsGoal → профиль,
  // stepsFact → day.steps), и сторож заменён тестами выше: они проверяют и то,
  // что вечерний вопрос звучит по контракту, и то, что ответ уходит в день.

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
