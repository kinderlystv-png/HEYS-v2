// Карточка воды в «Разборе дня» — nutrition-tab + water-add v4.
import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WATER_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_water_v1.js'), 'utf8');
const originalHEYS = global.HEYS;
const originalReact = global.React;

function stubWaterCustomVolume() {
  global.HEYS.WaterCustomVolume = {
    useLongPress350: (_onLongPress, { onShortClick, disabled } = {}) => ({
      onPointerDown: () => {},
      onPointerMove: () => {},
      onPointerUp: (event) => { if (!disabled) onShortClick?.(event); },
      onClick: (event) => { if (!disabled) onShortClick?.(event); }
    }),
    open: vi.fn()
  };
}

function loadWaterCard() {
  stubWaterCustomVolume();
  eval(WATER_SRC);
  return window.HEYS.dayWater;
}

function seedWeek(perDayMl) {
  const days = ['2025-12-06', '2025-12-07', '2025-12-08', '2025-12-09', '2025-12-10', '2025-12-11'];
  const store = {};
  days.forEach((iso, index) => {
    store['heys_dayv2_' + iso] = { date: iso, waterMl: perDayMl[index] };
  });
  return vi.fn((key, fallback) => (key in store ? store[key] : fallback));
}

function renderCard(dayWater, {
  waterMl = 1700,
  waterGoal = 3000,
  waterFabOn = false,
  actions = {},
  ctxExtra = {}
} = {}) {
  window.HEYS.FabVisibility = {
    read: () => ({
      water: waterFabOn,
      hunger: true,
      message: true,
      activity: true,
      meal: true
    })
  };
  const element = dayWater.render({
    React: RealReact,
    ctx: {
      day: { date: '2025-12-12', waterMl, lastWaterTime: waterMl > 0 ? Date.now() - 3600000 : null },
      prof: {},
      waterGoal,
      waterGoalBreakdown: { base: 3000 },
      waterLastDrink: waterMl > 0 ? { text: '1 ч назад', isLong: false } : null,
      isPastDay: false,
      isReadOnly: false,
      ...ctxExtra
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

describe('карточка воды в «Разборе дня» — nutrition-tab v4', () => {
  let dayWater;

  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {
      utils: { lsGet: seedWeek([2400, 2100, 1800, 2600, 1600, 2400]) },
      dayWaterState: {
        computeWaterGoalBreakdown: () => ({ finalGoal: 3000 })
      },
      NutritionV4: {
        eatingProgressK: () => 0.5
      }
    };
    dayWater = loadWaterCard();
  });

  afterEach(() => {
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('полный вид при выключенной кнопке воды: 58px кольцо и четыре объёма', () => {
    const { container } = renderCard(dayWater, { waterFabOn: false });
    const card = container.querySelector('#water-card');
    expect(card.className).toContain('water-review--full');
    expect(card.querySelector('.water-review__ring-svg').getAttribute('width')).toBe('58');
    expect([...card.querySelectorAll('.water-review__chip--quick')].map((el) => el.textContent))
      .toEqual(['+100', '+200', '+330', '+500']);
    expect(card.querySelector('.water-review__header-sub').textContent).toBe('−200');
    expect(card.querySelector('.water-review__quick .water-review__chip--sub')).toBeNull();
  });

  it('компактный вид при включённой кнопке воды: 44px кольцо без чипов', () => {
    const { container } = renderCard(dayWater, { waterFabOn: true });
    const card = container.querySelector('#water-card');
    expect(card.className).toContain('water-review--compact');
    expect(card.querySelector('.water-review__ring-svg').getAttribute('width')).toBe('44');
    expect(card.querySelector('.water-review__quick')).toBeNull();
    expect(card.querySelector('.water-review__last').textContent).toContain('последний раз');
  });

  it('пустой день: прочерк, тревога и подсказка внести воду', () => {
    const { container } = renderCard(dayWater, { waterMl: 0, ctxExtra: { waterLastDrink: null } });
    const card = container.querySelector('#water-card');
    expect(card.className).toContain('water-review--empty');
    expect(card.querySelector('.water-review__ring-fact').textContent).toBe('—');
    expect(card.querySelector('.water-review__ring-tail').textContent).toBe('за день не отмечено');
    expect(card.querySelector('.water-review__empty-note')).toBeTruthy();
    expect(card.querySelector('.water-review__last')).toBeNull();
  });

  it('норма набрана и ссылка на расчёт открывают metric-popup', () => {
    const openExclusivePopup = vi.fn();
    const { container } = renderCard(dayWater, {
      waterMl: 3000,
      actions: { openExclusivePopup }
    });
    const card = container.querySelector('#water-card');
    expect(card.querySelector('.water-review__ring-tail').textContent).toBe('норма набрана');
    fireEvent.click(card.querySelector('.water-review__norm-link'));
    expect(openExclusivePopup).toHaveBeenCalledWith('metric', expect.objectContaining({ type: 'water' }));
  });

  it('объёмы зовут addWater и removeWater', () => {
    const addWater = vi.fn();
    const removeWater = vi.fn();
    const { container } = renderCard(dayWater, { actions: { addWater, removeWater } });
    const card = container.querySelector('#water-card');

    fireEvent.click(card.querySelector('.water-review__header-sub'));
    expect(removeWater).toHaveBeenCalledWith(200);

    fireEvent.click(card.querySelectorAll('.water-review__chip--quick')[3]);
    expect(addWater).toHaveBeenCalledWith(500, expect.objectContaining({
      skipScroll: true,
      source: 'water-review-card'
    }));
  });

  it('неделя: кривая, пунктир нормы и ряд дней', () => {
    window.HEYS.utils.lsGet = seedWeek([3200, 2100, 1800, 2600, 1600, 2400]);
    const { container } = renderCard(dayWater);
    const card = container.querySelector('#water-card');
    expect(card.querySelector('.water-review__avg').textContent).toBe('в среднем 2,2 л');
    expect(card.querySelector('.water-review__curve-line').getAttribute('d')).toContain('C');
    expect(card.querySelector('.water-review__curve-goal').getAttribute('d')).toContain('C');
    expect(card.querySelectorAll('.water-review__day-done').length).toBeGreaterThan(0);
    expect(card.querySelectorAll('.water-review__day-label').length).toBeGreaterThan(0);
  });

  it('applyOptimistic двигает кольцо и подпись', () => {
    const { container } = renderCard(dayWater, { waterMl: 0, ctxExtra: { waterLastDrink: null } });
    const card = container.querySelector('#water-card');
    dayWater.applyOptimistic(card, 1500, 3000);
    expect(card.querySelector('.water-review__ring-fact').textContent).toBe('1,5 л');
    expect(card.querySelector('.water-review__ring-tail').textContent).toBe('осталось 1,5');
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
    window.HEYS = {
      utils: { lsGet: seedWeek([2400, 2100, 1800, 2600, 1600, 2400]) },
      FabVisibility: { read: () => ({ water: false, hunger: true, message: true, activity: true, meal: true }) },
      dayWaterState: { computeWaterGoalBreakdown: () => ({ finalGoal: 3000 }) },
      NutritionV4: { eatingProgressK: () => 0.5 }
    };
    global.React = RealReact;
    stubWaterCustomVolume();
    eval(WATER_SRC);
    eval(CARD_SRC);
    eval(NUTRITION_SRC);

    const { container } = render(window.HEYS.dayNutrition.render({
      React: RealReact,
      ctx: {
        day: { date: '2025-12-12', waterMl: 1700, meals: [], lastWaterTime: Date.now() },
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
        waterLastDrink: { text: '1 ч назад' }
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
    expect(container.querySelector('#water-card')).toBeTruthy();
  });
});
