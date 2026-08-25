// Контракт nutrition-tab: «Повторить сегодня» — видимая строка в блоке «Действия с приёмом».
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NUTRITION_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
const MEALS_SRC = fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');

function loadNutrition() {
  eval(NUTRITION_SRC);
  return { api: window.HEYS.NutritionV4, render: window.HEYS.dayNutrition.render };
}

const MEALS = [
  {
    id: 'm1',
    time: '08:20',
    name: 'Завтрак',
    items: [{ id: 'i1', product_id: 'p1', grams: 100, kcal100: 120 }],
  },
];

function renderTab(renderFn, overrides = {}) {
  const ctx = Object.assign({
    day: { date: '2026-08-20', meals: MEALS },
    prof: {},
    pIndex: { byId: new Map([['p1', { id: 'p1', name: 'Овсянка', kcal100: 120 }]]) },
    date: '2026-08-20',
    eatenKcal: 120,
    optimum: 1931,
    displayOptimum: 1931,
    dayTot: { kcal: 120, prot: 5, fat: 2, carbs: 20, fiber: 1, harm: 1, gi: 40 },
    normAbs: { kcal: 1931, prot: 128, fat: 64, carbs: 168, fiber: 27 },
    insulinWaveData: null,
    waterMl: 0,
    waterGoal: 3000,
  }, overrides.ctx || {});
  return render(renderFn({ React: RealReact, ctx, actions: overrides.actions || {} }));
}

describe('nutrition-tab · Повторить сегодня', () => {
  beforeEach(() => {
    window.HEYS = {
      dayMealHandlers: {},
      dayUtils: { localizeMealName: (raw, fb) => raw || fb },
      models: {
        mealTotals: (meal) => (meal.items || []).reduce((acc, item) => ({
          kcal: acc.kcal + ((item.kcal100 || 0) * (item.grams || 0)) / 100,
          prot: 0, fat: 0, carbs: 0,
        }), { kcal: 0, prot: 0, fat: 0, carbs: 0 }),
      },
      getMealType: (meal) => ({ name: meal.name || 'Приём' }),
    };
  });

  it('лист правки содержит строку «Повторить сегодня» в действиях приёма', () => {
    const { render: renderFn } = loadNutrition();
    const view = renderTab(renderFn);
    fireEvent.click(view.container.querySelector('.nutrition-v4-meal-row'));
    const sheet = document.querySelector('.nutrition-v4-sheet');
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain('Повторить сегодня');
    expect(sheet.textContent).not.toContain('Оценки приёма');
    expect(sheet.textContent).toContain('Копировать приём');
  });

  it('строка вызывает repeatTodayMeal и не открывает добавление продукта', () => {
    const { render: renderFn } = loadNutrition();
    const repeatTodayMeal = vi.fn();
    const openAddProductForMeal = vi.fn();
    const view = renderTab(renderFn, { actions: { repeatTodayMeal, openAddProductForMeal } });
    fireEvent.click(view.container.querySelector('.nutrition-v4-meal-row'));
    const rows = Array.from(document.querySelectorAll('.nutrition-v4-sheet__action b'));
    const repeatRow = rows.find((el) => el.textContent === 'Повторить сегодня');
    expect(repeatRow).toBeTruthy();
    fireEvent.click(repeatRow.closest('button'));
    expect(repeatTodayMeal).toHaveBeenCalledWith(0);
    expect(openAddProductForMeal).not.toHaveBeenCalled();
  });

  it('handlers экспортируют repeatTodayMeal', () => {
    expect(MEALS_SRC).toContain('const repeatTodayMeal = React.useCallback');
    expect(MEALS_SRC).toContain('repeatTodayMeal,');
    expect(MEALS_SRC).toContain("'repeat_today_meal'");
    expect(MEALS_SRC).toContain('HEYS.MealStep.showAddMeal');
  });
});
