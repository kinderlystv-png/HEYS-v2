// Смоук-симуляция состояний вкладки «Питание» v4 против контракта канваса
// nutrition-tab.v4.dc.html: пустой день, прошлый день, три зоны перебора,
// приоритет нахлёста волн, выключенные чипы, только чтение.
//
// Живые условия для этих стыков человек собрать не может: рефид-день, нахлёст
// волн, 138 % бюджета и офлайн-холодный старт не воспроизводятся по заказу.
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NUTRITION_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');

const NBSP = ' ';
const DASH = '—';

function loadModule() {
  eval(NUTRITION_SRC);
  return { api: window.HEYS.NutritionV4, render: window.HEYS.dayNutrition.render };
}

function seedHEYS(profile) {
  const store = { heys_profile: profile || {} };
  window.HEYS = {
    utils: {
      lsGet: vi.fn((key, fallback) => (key in store ? store[key] : fallback)),
      lsSet: vi.fn((key, value) => { store[key] = value; })
    },
    dayUtils: {
      todayISO: () => '2026-08-20',
      localizeMealName: (raw, fallback) => raw || fallback
    },
    models: {
      mealTotals: (meal) => (meal.items || []).reduce((acc, item) => ({
        kcal: acc.kcal + (item.kcal || 0),
        prot: acc.prot + (item.prot || 0),
        fat: acc.fat + (item.fat || 0),
        carbs: acc.carbs + (item.carbs || 0)
      }), { kcal: 0, prot: 0, fat: 0, carbs: 0 })
    },
    getMealType: (meal) => ({ name: meal.name || 'Приём' })
  };
  return store;
}

const MEALS = [
  { id: 'm1', time: '08:20', name: 'Завтрак', items: [{ id: 'i1', name: 'Овсянка', kcal: 418, grams: 200 }] },
  { id: 'm2', time: '13:05', name: 'Обед', items: [{ id: 'i2', name: 'Курица', kcal: 562, grams: 180 }] },
  { id: 'm3', time: '16:40', name: 'Перекус', items: [{ id: 'i3', name: 'Творог', kcal: 309, grams: 150 }] }
];

function renderTab(renderFn, overrides = {}) {
  const ctx = Object.assign({
    day: { date: '2026-08-20', meals: MEALS },
    prof: {},
    pIndex: { byId: new Map() },
    date: '2026-08-20',
    eatenKcal: 1289,
    optimum: 1931,
    displayOptimum: 1931,
    displayRemainingKcal: 642,
    dayTot: { kcal: 1289, prot: 96, fat: 58, carbs: 132, fiber: 18, harm: 3.4, gi: 48 },
    normAbs: { kcal: 1931, prot: 128, fat: 64, carbs: 168, fiber: 27 },
    insulinWaveData: null,
    waterMl: 1700,
    waterGoal: 3000
  }, overrides.ctx || {});
  return render(renderFn({ React: RealReact, ctx, actions: overrides.actions || {} }));
}

describe('вкладка «Питание» v4 — состояния', () => {
  let api;
  let renderFn;

  beforeEach(() => {
    seedHEYS();
    const loaded = loadModule();
    api = loaded.api;
    renderFn = loaded.render;
  });

  it('формат чисел: разделитель тысяч неразрывный, дробные с запятой', () => {
    expect(api.formatNumber(1289)).toBe('1' + NBSP + '289');
    expect(api.formatNumber(null)).toBe(DASH);
    expect(api.formatDecimal(3.42, 1)).toBe('3,4');
    expect(api.formatPercent(113)).toBe('113' + NBSP + '%');
  });

  it('пустой день: прочерки вместо нулей, полосы не рисуются', () => {
    const hero = api.buildHeroState({ eatenKcal: 0, budgetKcal: 1931, hasData: false, isPastDay: false });
    expect(hero.label).toBe('Осталось на сегодня');
    expect(hero.value).toBe('1' + NBSP + '931');
    expect(hero.left).toBe('съедено ' + DASH);
    expect(hero.fillPct).toBe(0);

    const rows = api.buildTotalRows({ kcal: 0, prot: 0 }, { kcal: 1931, prot: 128, fat: 64, carbs: 168, fiber: 27 }, false);
    expect(rows).toHaveLength(5);
    rows.forEach((row) => {
      expect(row.fact).toBe(DASH);
      expect(row.hasBar).toBe(false);
    });

    const view = renderTab(renderFn, { ctx: { day: { date: '2026-08-20', meals: [] }, eatenKcal: 0, dayTot: {} } });
    expect(view.getByText('Пока нет приёмов — добавьте первый')).toBeTruthy();
    expect(view.container.querySelectorAll('.nutrition-v4-bar')).toHaveLength(0);
  });

  it('закрытый день: «Съедено за день», порогов «к этому часу» нет', () => {
    const hero = api.buildHeroState({ eatenKcal: 1786, budgetKcal: 1931, hasData: true, isPastDay: true });
    expect(hero.label).toBe('Съедено за день');
    expect(hero.value).toBe('1' + NBSP + '786');
    expect(hero.left).toBe('из 1' + NBSP + '931');
    expect(hero.right).toBe('не съедено 145');
    expect(hero.overPct).toBe(0);
  });

  it('три зоны перебора: 105 / 113 / 138 %', () => {
    const at = (eaten) => api.buildHeroState({ eatenKcal: eaten, budgetKcal: 1931, hasData: true, isPastDay: false });

    const neutral = at(2029); // 105 %
    expect(neutral.label).toBe('Перебор');
    expect(neutral.value).toBe('98');
    expect(neutral.right).toBe('105' + NBSP + '%');
    expect(neutral.zone).toBe('over');

    const warn = at(2190); // 113 %
    expect(warn.zone).toBe('warn');
    expect(warn.right).toBe('113' + NBSP + '%');
    expect(Math.round(warn.fillPct)).toBe(88);
    expect(Math.round(warn.overPct)).toBe(12);

    const red = at(2665); // 138 %
    expect(red.zone).toBe('red');
    expect(red.right).toBe('138' + NBSP + '%');
    expect(red.value).toBe('734');
  });

  it('до 100 % процента нет, подпись прежняя', () => {
    const hero = api.buildHeroState({ eatenKcal: 1289, budgetKcal: 1931, hasData: true, isPastDay: false });
    expect(hero.label).toBe('Осталось на сегодня');
    expect(hero.right).toBe('бюджет 1' + NBSP + '931');
    expect(hero.right).not.toContain('%');
  });

  it('зоны итогов дня: отставание от ожидаемого и перебор по дневной норме', () => {
    window.HEYS.ratioZones = {
      getZones: () => ([
        { id: 'over', from: 1.05, to: 1.2 },
        { id: 'binge', from: 1.2, to: Infinity }
      ])
    };
    // Кураторские пороги влияют только на героя, не на итоги.
    expect(api.kcalZoneThresholds()).toEqual({ warn: 105, red: 120 });

    const norms = { kcal: 1000, prot: 100, fat: 100, carbs: 100, fiber: 100 };
    const rows = api.buildTotalRows(
      { kcal: 200, prot: 95, fat: 115, carbs: 100, fiber: 140 },
      norms,
      true,
      { isPastDay: false, progressK: 0.5 }
    );
    const kcal = rows.find((row) => row.key === 'kcal');
    expect(kcal.zone).toBe('red');
    expect(kcal.barClass).toBe('is-red');
    expect(kcal.showTick).toBe(true);
    expect(kcal.tickPct).toBe(50);
    expect(rows.find((row) => row.key === 'prot').zone).toBe('none');
    expect(rows.find((row) => row.key === 'fat').zone).toBe('warn');
    expect(rows.find((row) => row.key === 'fiber').zone).toBe('red');
  });

  it('нахлёст волн старше «окна открыто»', () => {
    const overlapping = api.buildWindowState({
      rangeStatus: 'complete',
      hasOverlaps: true,
      worstOverlap: { overlapMinutes: 130 }
    });
    expect(overlapping.tone).toBe('warn');
    expect(overlapping.lines).toEqual(['волны наложились', 'нахлёст 2:10']);

    const open = api.buildWindowState({ rangeStatus: 'complete', hasOverlaps: false });
    expect(open).toEqual({ tone: 'ok', lines: ['окно открыто'] });
  });

  it('прошлый день не считает окно от текущего времени', () => {
    expect(api.buildWindowState({ rangeStatus: 'complete', isPastDay: true }))
      .toEqual({ tone: 'calm', lines: ['день закрыт'] });
  });

  it('справочные состояния окна нейтральны, не шалфейные', () => {
    expect(api.buildWindowState(null).tone).toBe('calm');
    expect(api.buildWindowState({ rangeStatus: 'scheduled' }).tone).toBe('calm');
    expect(api.buildWindowState({ isOvernightEstimate: true }).tone).toBe('calm');
    // Запас меньше часа — тоже нейтрально.
    expect(api.buildWindowState({ rangeStatus: 'settling', rangeRemaining: 35 }).tone).toBe('calm');
    expect(api.buildWindowState({ rangeStatus: 'settling', rangeRemaining: 80 }).tone).toBe('ok');
  });

  it('перебор 100–110 %: полоса шалфейная, цифра без зоны', () => {
    const norms = { kcal: 1000, prot: 100, fat: 100, carbs: 100, fiber: 100 };
    const rows = api.buildTotalRows(
      { kcal: 1050, prot: 50, fat: 50, carbs: 50, fiber: 50 },
      norms,
      true,
      { isPastDay: true, progressK: 1 }
    );
    const kcal = rows.find((row) => row.key === 'kcal');
    expect(kcal.zone).toBe('none');
    expect(kcal.barClass).toBe('is-ok');
    expect(kcal.overClass).toBe('is-ok');
    expect(kcal.overPct).toBeGreaterThan(0);
    expect(kcal.showTick).toBe(false);
  });

  it('недобор без окраски факта, перебор берёт тон зоны', () => {
    const norms = { kcal: 1000, prot: 100, fat: 100, carbs: 100, fiber: 100 };
    const rows = api.buildTotalRows(
      { kcal: 500, prot: 50, fat: 115, carbs: 100, fiber: 50 },
      norms,
      true,
      { isPastDay: true, progressK: 1 }
    );
    const kcal = rows.find((row) => row.key === 'kcal');
    expect(kcal.zone).toBe('red');
    expect(kcal.overPct).toBe(0);
    expect(Math.round(kcal.fillPct)).toBe(50);
    expect(rows.find((row) => row.key === 'prot').zone).toBe('red');
    expect(rows.find((row) => row.key === 'fat').zone).toBe('warn');
    expect(rows.find((row) => row.key === 'fiber').zone).toBe('red');
    expect(rows.find((row) => row.key === 'fiber').showTick).toBe(false);
  });

  it('единицы стоят в строке итогов, а не в заголовке столбца', () => {
    const rows = api.buildTotalRows({ kcal: 1289, prot: 96 }, { kcal: 1931, prot: 128 }, true);
    expect(rows.map((row) => row.unit)).toEqual(['ккал', 'г', 'г', 'г', 'г']);
    expect(rows.map((row) => row.label)).toEqual(['Калории', 'Белок', 'Жиры', 'Углеводы', 'Клетчатка']);
  });

  it('пустой день · качество: прочерки без ступени и подсказок', () => {
    const view = renderTab(renderFn, {
      ctx: {
        day: { date: '2026-08-20', meals: [] },
        eatenKcal: 0,
        dayTot: {}
      }
    });
    expect(view.getAllByText(DASH).length).toBeGreaterThan(0);
    expect(view.queryByText('взвешен по углеводам')).toBeNull();
    expect(view.queryByText(/порог 5/)).toBeNull();
  });

  it('качество еды: порог вредности — константа 5, ГИ словом', () => {
    expect(api.HARM_THRESHOLD).toBe(5);
    expect(api.giStepLabel(38)).toBe('низкий');
    expect(api.giStepLabel(48)).toBe('средний');
    expect(api.giStepLabel(72)).toBe('высокий');

    const good = renderTab(renderFn);
    expect(good.getByText('порог 5 · в норме')).toBeTruthy();

    const bad = renderTab(renderFn, { ctx: { dayTot: { kcal: 1289, harm: 7.2, gi: 61 } } });
    expect(bad.getByText('порог 5 · выше порога')).toBeTruthy();
  });

  it('выключённый чип убирает блок, порядок остальных не меняется', () => {
    const all = renderTab(renderFn);
    const before = Array.from(all.container.querySelectorAll('[data-block]')).map((node) => node.dataset.block);
    expect(before).toContain('fiber');

    const some = renderTab(renderFn, { ctx: { prof: { showDiaryFiberPanel: false } } });
    const after = Array.from(some.container.querySelectorAll('[data-block]')).map((node) => node.dataset.block);
    expect(after).not.toContain('fiber');
    expect(after).toEqual(before.filter((key) => key !== 'fiber'));
  });

  it('чипы: включены все по умолчанию, добавки ждут согласия', () => {
    expect(api.CHIPS).toHaveLength(7);
    const state = api.readChipState({});
    expect(state.hunger).toBe(true);
    expect(state.fiber).toBe(true);
    expect(state.refeed).toBe(true);
    expect(state.mealsTimeline).toBe(true);
    // До согласия на трекинг добавок чип выключен.
    expect(state.supplements).toBe(false);
    expect(api.readChipState({ supplementsTrackingEnabled: true }).supplements).toBe(true);
  });

  it('только чтение: кнопки записи гаснут, но остаются на месте', () => {
    window.HEYS.Subscription = {
      getCachedStatus: () => 'read_only',
      normalizeStatus: (value) => value
    };
    const view = renderTab(renderFn);
    const root = view.container.querySelector('.nutrition-v4');
    expect(root.getAttribute('data-readonly')).toBe('true');
    expect(view.container.querySelector('.nutrition-v4-cta')).toBeTruthy();
  });

  it('строка приёма нажимается целиком и открывает лист правки', () => {
    const openAddProductForMeal = vi.fn();
    const view = renderTab(renderFn, { actions: { openAddProductForMeal } });
    const rows = view.container.querySelectorAll('.nutrition-v4-meal-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('role')).toBe('button');
    // Номер приёма — по возрастанию времени, 1 у самого раннего.
    expect(rows[0].querySelector('.nutrition-v4-meal-row__num').textContent).toBe('1');
    expect(rows[2].querySelector('.nutrition-v4-meal-row__num').textContent).toBe('3');

    fireEvent.click(rows[0]);
    expect(document.querySelector('.nutrition-v4-sheet')).toBeTruthy();
    expect(document.querySelector('.nutrition-v4-sheet__delete').textContent).toContain('Удалить приём');
    // Кнопка добавления продукта не перекрывает тап по строке.
    expect(openAddProductForMeal).not.toHaveBeenCalled();
  });

  it('пустой приём называет цену и получает залитую кнопку', () => {
    const view = renderTab(renderFn, {
      ctx: { day: { date: '2026-08-20', meals: [{ id: 'e1', time: '19:30', name: 'Ужин', items: [] }] } }
    });
    expect(view.getByText('без продуктов · итог дня посчитан без него')).toBeTruthy();
    expect(view.getByText('+ продукт')).toBeTruthy();
    expect(view.container.querySelector('.nutrition-v4-meal-row__kcal').textContent).toBe(DASH);
  });

  it('серия приёмов — факт, а не похвала', () => {
    const pIndex = { byId: new Map() };
    const full = [400, 500, 450].map((kcal, i) => ({ id: 'f' + i, time: '0' + (8 + i) + ':00', items: [{ id: 'x' + i, kcal }] }));
    expect(api.buildMealStreak(full, pIndex, 1931)).toBe('Три полноценных приёма подряд');
    // Кофе с молоком серию рвёт.
    const broken = [full[0], { id: 'c', time: '10:00', items: [{ id: 'c1', kcal: 20 }] }, full[1], full[2]];
    expect(api.buildMealStreak(broken, pIndex, 1931)).toBeNull();
    expect(api.buildMealStreak(full, pIndex, 0)).toBeNull();
  });

  it('порядок приёмов — по возрастанию времени, без времени в конец', () => {
    const sorted = api.sortMealsAscending([
      { id: 'a', time: '13:05' },
      { id: 'b' },
      { id: 'c', time: '08:20' }
    ]);
    expect(sorted.map((meal) => meal.id)).toEqual(['c', 'a', 'b']);
  });

  it('название приёма: динамика до явного касания чипа', () => {
    window.HEYS.getMealType = () => ({ name: 'Завтрак' });
    expect(api.mealTypeLabel({ name: 'Ужин', mealType: 'dinner' })).toBe('Завтрак');
    expect(api.mealTypeLabel({ name: 'Ужин', mealType: 'dinner', mealTypePinned: true })).toBe('Ужин');
  });

  it('порядок блоков: вода сразу после итогов дня', () => {
    window.HEYS.dayWaterCard = {
      buildWaterCard: ({ React }) => React.createElement('div', { className: 'water-review', 'data-testid': 'water-card' })
    };
    const view = renderTab(renderFn);
    const root = view.container.querySelector('.nutrition-v4');
    const indexOf = (selector) => Array.from(root.querySelectorAll('*')).indexOf(root.querySelector(selector));
    expect(indexOf('.nutrition-v4-totals')).toBeGreaterThan(-1);
    expect(indexOf('.water-review')).toBeGreaterThan(-1);
    expect(indexOf('.nutrition-v4-quality')).toBeGreaterThan(-1);
    expect(indexOf('.nutrition-v4-totals')).toBeLessThan(indexOf('.water-review'));
    expect(indexOf('.water-review')).toBeLessThan(indexOf('.nutrition-v4-quality'));
  });

  it('мета-строка шапки не обещает синхронизацию', () => {
    const meta = api.formatTabMetaLine('2026-08-20', { meals: MEALS });
    expect(meta.text).toContain('3 приёма');
    expect(meta.syncLabel).toBeNull();
  });
});
