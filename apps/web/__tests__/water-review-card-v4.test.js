// Карточка воды в «Разборе дня» против канваса water-add.v4.dc.html.
// Контракт [data-contract="water-add"]: строки «вид карточки», «переключатель
// вида», «неделя в Кольце», «минус в Кольце». Вид один — «Полоса» снята ревью
// 22 августа.
import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WATER_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_water_v1.js'), 'utf8');
const originalHEYS = global.HEYS;
const originalReact = global.React;

function loadWaterCard() {
  eval(WATER_SRC);
  return window.HEYS.dayWater;
}

// Неделя вокруг 2025-12-12: шесть прошлых дней в LS, сегодняшний — из day.
function seedWeek(perDayMl) {
  const days = ['2025-12-06', '2025-12-07', '2025-12-08', '2025-12-09', '2025-12-10', '2025-12-11'];
  const store = {};
  days.forEach((iso, index) => {
    store['heys_dayv2_' + iso] = { date: iso, waterMl: perDayMl[index] };
  });
  return vi.fn((key, fallback) => (key in store ? store[key] : fallback));
}

function renderCard(dayWater, { waterMl = 1700, waterGoal = 3000, actions = {} } = {}) {
  const element = dayWater.render({
    React: RealReact,
    ctx: {
      day: { date: '2025-12-12', waterMl },
      waterGoal,
      waterGoalBreakdown: { base: 3000 },
      waterLastDrink: null
    },
    actions: {
      addWater: vi.fn(),
      removeWater: vi.fn(),
      haptic: vi.fn(),
      openExclusivePopup: vi.fn(),
      ...actions
    }
  });
  return render(element);
}

describe('карточка воды в «Разборе дня» — канвас water-add v4', () => {
  let dayWater;

  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {
      utils: { lsGet: seedWeek([2400, 2100, 1800, 2600, 1600, 2400]) }
    };
    dayWater = loadWaterCard();
  });

  afterEach(() => {
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('вид один — «Кольцо»; настройки вида и переключателя нет', () => {
    const { container } = renderCard(dayWater);
    expect(container.querySelector('#water-card').className).toContain('water-review--ring');
    // «Полоса» снята ревью 22 августа: переключать нечего, настройка не заводится.
    expect(container.querySelector('.water-review-switch')).toBeNull();
    expect(container.querySelector('.water-review__view')).toBeNull();
    expect(WATER_SRC).not.toContain('heys_water_card_view_v1');
  });

  it('утро 0 л: кольцо пусто, −200 погашен, но остаётся в ряду', () => {
    const { container } = renderCard(dayWater, { waterMl: 0 });
    const card = container.querySelector('#water-card');

    expect(card.querySelector('.water-review__ring-fact').textContent).toBe('0 л');
    expect(card.querySelector('.water-review__ring-meta').textContent).toBe('из 3,0 · осталось 3,0');
    const [drawn] = card.querySelector('.water-review__ring-fill')
      .getAttribute('stroke-dasharray').split(' ').map(Number);
    expect(drawn).toBe(0);

    const minus = card.querySelector('.water-review__chip--sub');
    expect(minus.className).toContain('is-off');
    expect(minus.disabled).toBe(true);
    expect(minus.textContent).toBe('−200');
  });

  it('объёмы зовут addWater и removeWater с шагом из контракта', () => {
    const addWater = vi.fn();
    const removeWater = vi.fn();
    const { container } = renderCard(dayWater, { actions: { addWater, removeWater } });
    const card = container.querySelector('#water-card');

    fireEvent.click(card.querySelector('.water-review__chip--sub'));
    expect(removeWater).toHaveBeenCalledWith(200);

    const adds = card.querySelectorAll('.water-review__chip--quick');
    fireEvent.click(adds[3]);
    expect(addWater).toHaveBeenCalledWith(500, expect.objectContaining({
      skipScroll: true,
      source: 'water-review-card'
    }));
  });

  it('вид «Кольцо»: кольцо доли нормы, четыре объёма, неделя кривой', () => {
    // Первый день недели — выше нормы: его точка обязана быть залитой.
    window.HEYS.utils.lsGet = seedWeek([3200, 2100, 1800, 2600, 1600, 2400]);
    const { container } = renderCard(dayWater);
    const card = container.querySelector('#water-card');

    expect(card.querySelector('.water-review__kicker').textContent).toBe('Вода · 7 дней в среднем 2,2 л');
    expect(card.querySelector('.water-review__ring-fact').textContent).toBe('1,7 л');
    expect(card.querySelector('.water-review__ring-meta').textContent).toBe('из 3,0 · осталось 1,3');

    // Дуга = доля нормы от длины окружности r 24.
    const ringLength = Math.round(2 * Math.PI * 24 * 10) / 10;
    const [drawn, total] = card.querySelector('.water-review__ring-fill')
      .getAttribute('stroke-dasharray').split(' ').map(Number);
    expect(total).toBe(ringLength);
    expect(drawn / total).toBeCloseTo(1700 / 3000, 3);

    const quick = [...card.querySelectorAll('.water-review__chip--quick')].map((el) => el.textContent);
    expect(quick).toEqual(['+100', '+200', '+330', '+500']);

    // Контракт 47: минус — первым в том же ряду пятой пилюлей, в шапке его нет.
    expect(card.querySelector('.water-review__top .water-review__chip')).toBeNull();
    const row = [...card.querySelectorAll('.water-review__quick .water-review__chip')]
      .map((el) => el.textContent);
    expect(row).toEqual(['−200', '+100', '+200', '+330', '+500']);
    expect(card.querySelector('.water-review__quick .water-review__chip').className)
      .toContain('water-review__chip--sub');

    // Пунктир нормы поперёк, залитая точка = норма взята, промах = контурная.
    expect(card.querySelector('.water-review__curve-goal').getAttribute('stroke-dasharray')).toBe('3 3');
    const dots = card.querySelectorAll('.water-review__curve-dot');
    expect(dots.length).toBe(7);
    expect(dots[0].getAttribute('fill')).toBe('currentColor');
    expect(dots[2].getAttribute('fill')).toBe(null);
    // Сегодня отмечен только ореолом.
    expect(card.querySelectorAll('.water-review__curve-halo').length).toBe(1);
  });

  it('в «Кольце» при 0 л минус гаснет, но остаётся пятой пилюлей', () => {
    const { container } = renderCard(dayWater, { waterMl: 0 });
    const minus = container.querySelector('.water-review__quick .water-review__chip--sub');

    expect(minus).toBeTruthy();
    expect(minus.disabled).toBe(true);
    expect(minus.className).toContain('is-off');
    expect(container.querySelectorAll('.water-review__quick .water-review__chip').length).toBe(5);
  });

  it('applyOptimistic двигает кольцо и его подпись', () => {
    const { container } = renderCard(dayWater, { waterMl: 0 });
    const card = container.querySelector('#water-card');

    dayWater.applyOptimistic(card, 1500, 3000);

    expect(card.querySelector('.water-review__ring-fact').textContent).toBe('1,5 л');
    expect(card.querySelector('.water-review__ring-meta').textContent).toBe('из 3,0 · осталось 1,5');
    const [drawn, total] = card.querySelector('.water-review__ring-fill')
      .getAttribute('stroke-dasharray').split(' ').map(Number);
    expect(drawn / total).toBeCloseTo(0.5, 3);
  });
});

describe('карточка воды стоит в «Разборе дня», а не в скрытом legacy-дневнике', () => {
  const NUTRITION_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
  const CARD_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_water_card_v1.js'), 'utf8');

  afterEach(() => {
    localStorage.clear();
    window.HEYS = originalHEYS;
    global.React = originalReact;
  });

  it('NutritionTabV4 рендерит карточку воды и не рисует свой блок', () => {
    localStorage.clear();
    localStorage.setItem('heys_water_card_view_v1', 'bar');
    window.HEYS = { utils: { lsGet: seedWeek([2400, 2100, 1800, 2600, 1600, 2400]) } };
    // renderNutritionCard берёт React из глобала, как в приложении.
    global.React = RealReact;
    eval(WATER_SRC);
    eval(CARD_SRC);
    eval(NUTRITION_SRC);

    const { container } = render(window.HEYS.dayNutrition.render({
      React: RealReact,
      ctx: {
        day: { date: '2025-12-12', waterMl: 1700, meals: [] },
        prof: {},
        pIndex: {},
        date: '2025-12-12',
        eatenKcal: 1116,
        displayOptimum: 2225,
        displayRemainingKcal: 1109,
        dayTot: { fiber: 7, harm: 0 },
        normAbs: { fiber: 31, harm: 10 },
        insulinWaveData: null,
        dailyWaveOverview: null,
        legacyMealsUI: null,
        waterMl: 1700,
        waterGoal: 3000,
        waterGoalBreakdown: { base: 3000 },
        waterLastDrink: null
      },
      actions: {
        addMeal: vi.fn(),
        addWater: vi.fn(),
        removeWater: vi.fn(),
        openAddProductForMeal: vi.fn(),
        haptic: vi.fn(),
        openExclusivePopup: vi.fn()
      }
    }));

    expect(container.querySelector('.nutrition-v4-water')).toBeNull();
    const card = container.querySelector('#water-card');
    expect(card).toBeTruthy();
    // Единственный вид — «Кольцо»: доля нормы дугой и неделя кривой.
    expect(card.querySelector('.water-review__ring-fill')).toBeTruthy();
    expect(card.querySelectorAll('.water-review__curve-dot').length).toBe(7);
    expect(container.querySelector('.water-review-switch')).toBeNull();
  });
});
