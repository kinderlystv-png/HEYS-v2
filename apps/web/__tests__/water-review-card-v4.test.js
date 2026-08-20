// Карточка воды в «Разборе дня» против канваса water-add.v4.dc.html.
// Контракт [data-contract="water-add"]: строки 35, 44–52, 58, 59.
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

function renderCard(dayWater, { waterMl = 1700, waterGoal = 3000, actions = {}, view = 'bar' } = {}) {
  if (view) localStorage.setItem('heys_water_card_view_v1', view);
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

  it('без сохранённой настройки открывается «Кольцо» (решение владельца)', () => {
    const { container } = renderCard(dayWater, { view: null });
    expect(container.querySelector('#water-card').className).toContain('water-review--ring');
  });

  it('вид «Полоса»: подпись, норма, факт, остаток, полоса, неделя, среднее, объёмы', () => {
    const { container } = renderCard(dayWater);

    const card = container.querySelector('#water-card');
    expect(card.className).toContain('water-review--bar');

    expect(card.querySelector('.water-review__kicker').textContent).toBe('Вода');
    expect(card.querySelector('.water-review__norm').textContent).toBe('из 3,0 л');
    expect(card.querySelector('.water-review__fact-value').textContent).toBe('1,7');
    expect(card.querySelector('.water-review__fact-unit').textContent).toBe('л');
    expect(card.querySelector('.water-review__left').textContent).toBe('осталось 1,3');
    expect(card.querySelector('.water-review__bar-fill').style.width).toBe('56.666666666666664%');

    // Семь столбиков, сегодня — всегда правый (контракт 51).
    const bars = card.querySelectorAll('.water-review__spark-bar');
    expect(bars.length).toBe(7);
    expect(bars[6].className).toContain('water-review__spark-bar--today');
    expect(bars[0].className).not.toContain('--today');

    // Среднее слева, ряд объёмов справа: −200 первый, затем +200 и +500.
    expect(card.querySelector('.water-review__avg').textContent).toBe('в среднем 2,1 л');
    const chips = [...card.querySelectorAll('.water-review__chip')].map((el) => el.textContent);
    expect(chips).toEqual(['−200', '+200', '+500']);

    // Слово «неделя» в подписи не пишем — период читается по столбикам.
    expect(card.textContent).not.toContain('неделя');
  });

  it('утро 0 л: полоса пуста, сегодняшний столбик 2 px, −200 погашен, но в ряду', () => {
    const { container } = renderCard(dayWater, { waterMl: 0 });
    const card = container.querySelector('#water-card');

    expect(card.querySelector('.water-review__fact-value').textContent).toBe('0');
    expect(card.querySelector('.water-review__left').textContent).toBe('осталось 3,0');
    expect(card.querySelector('.water-review__bar-fill').style.width).toBe('0%');

    const bars = card.querySelectorAll('.water-review__spark-bar');
    expect(bars[6].style.height).toBe('2px');
    expect(bars[0].style.height).not.toBe('2px');

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

    const adds = card.querySelectorAll('.water-review__chip--add');
    fireEvent.click(adds[1]);
    expect(addWater).toHaveBeenCalledWith(500, expect.objectContaining({
      skipScroll: true,
      source: 'water-review-card'
    }));
  });

  it('переключатель меняет вид, пишет выбор сразу и переживает пересборку карточки', () => {
    const haptic = vi.fn();
    const first = renderCard(dayWater, { actions: { haptic } });

    // Ряд переключателя стоит под карточкой, а не внутри неё.
    expect(first.container.querySelector('#water-card .water-review__view')).toBeNull();
    const views = [...first.container.querySelectorAll('.water-review-switch .water-review__view')].map((el) => el.textContent);
    expect(views).toEqual(['Полоса', 'Кольцо']);

    fireEvent.click(first.container.querySelectorAll('.water-review__view')[1]);
    expect(haptic).toHaveBeenCalledWith('light');

    const ringCard = first.container.querySelector('#water-card');
    expect(ringCard.className).toContain('water-review--ring');
    expect(localStorage.getItem('heys_water_card_view_v1')).toBe('ring');

    // Новый монтаж карточки — выбор уже прочитан из настройки, а не сброшен.
    first.unmount();
    const second = renderCard(dayWater, { view: null });
    expect(second.container.querySelector('#water-card').className).toContain('water-review--ring');
  });

  it('вид «Кольцо»: кольцо доли нормы, четыре объёма, неделя кривой', () => {
    // Первый день недели — выше нормы: его точка обязана быть залитой.
    window.HEYS.utils.lsGet = seedWeek([3200, 2100, 1800, 2600, 1600, 2400]);
    const { container } = renderCard(dayWater, { view: 'ring' });
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

  it('applyOptimistic двигает число, полосу и сегодняшний столбик без ре-рендера', () => {
    const { container } = renderCard(dayWater, { waterMl: 0 });
    const card = container.querySelector('#water-card');

    dayWater.applyOptimistic(card, 1500, 3000);

    expect(card.querySelector('.water-review__fact-value').textContent).toBe('1,5');
    expect(card.querySelector('.water-review__left').textContent).toBe('осталось 1,5');
    expect(card.querySelector('.water-review__bar-fill').style.width).toBe('50%');
    expect(card.querySelector('.water-review__spark-bar--today').style.height).toBe('50%');
    expect(card.querySelector('.water-review__chip--sub').disabled).toBe(false);
  });

  it('в «Кольце» при 0 л минус гаснет, но остаётся пятой пилюлей', () => {
    const { container } = renderCard(dayWater, { waterMl: 0, view: 'ring' });
    const minus = container.querySelector('.water-review__quick .water-review__chip--sub');

    expect(minus).toBeTruthy();
    expect(minus.disabled).toBe(true);
    expect(minus.className).toContain('is-off');
    expect(container.querySelectorAll('.water-review__quick .water-review__chip').length).toBe(5);
  });

  it('applyOptimistic двигает кольцо и его подпись', () => {
    const { container } = renderCard(dayWater, { waterMl: 0, view: 'ring' });
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
    expect(card.querySelector('.water-review__bar-fill')).toBeTruthy();
    expect(card.querySelectorAll('.water-review__spark-bar').length).toBe(7);
    expect(container.querySelector('.water-review-switch')).toBeTruthy();
    expect(card.querySelector('.water-review-switch')).toBeNull();
  });
});
