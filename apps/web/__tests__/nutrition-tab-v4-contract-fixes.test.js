// Смоук-симуляция строк контракта nutrition-tab.v4.dc.html, сведённых в коде:
// «клетчатка · блок» (шкала зон + пустой день), «нахлёст» (обе строки, нет
// подписи без пересечений), «трассировка расчёта» (три вклада, неопределённость,
// «Весь расчёт»), «порядок чипов» (каталог), «согласие» (отзыв чистит данные).
//
// Живьём эти стыки человек не соберёт: нахлёст волн, глубокий недобор клетчатки
// и отзыв согласия на добавки по заказу не воспроизводятся.
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NUTRITION_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');

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
        kcal: acc.kcal + (item.kcal || 0), prot: 0, fat: 0, carbs: 0
      }), { kcal: 0, prot: 0, fat: 0, carbs: 0 })
    },
    getMealType: (meal) => ({ name: meal.name || 'Приём' })
  };
  return store;
}

const MEALS = [
  { id: 'm1', time: '08:20', name: 'Завтрак', items: [{ id: 'i1', name: 'Овсянка', kcal: 418, grams: 200 }] }
];

function renderTab(renderFn, overrides = {}) {
  const ctx = Object.assign({
    day: { date: '2026-08-20', meals: MEALS, sleepEnd: '07:00', sleepStart: '23:00' },
    prof: {},
    pIndex: { byId: new Map() },
    date: '2026-08-20',
    eatenKcal: 418,
    optimum: 1931,
    displayOptimum: 1931,
    dayTot: { kcal: 418, prot: 20, fat: 10, carbs: 60, fiber: 2, harm: 3.4, gi: 48 },
    normAbs: { kcal: 1931, prot: 128, fat: 64, carbs: 168, fiber: 27 },
    insulinWaveData: null,
    waterMl: 1700,
    waterGoal: 3000
  }, overrides.ctx || {});
  return render(renderFn({ React: RealReact, ctx, actions: overrides.actions || {} }));
}

const WAVE = {
  waveHistory: [
    { id: 'w1', startMin: 8 * 60, endMin: 11 * 60 },
    { id: 'w2', startMin: 10 * 60, endMin: 13 * 60 }
  ],
  overlaps: [{ overlapMinutes: 60 }],
  worstOverlap: { overlapMinutes: 60 },
  rangeRemaining: 90,
  estimatedWindow: {
    calculation: {
      uncertaintyPercent: 24,
      lowerMinutes: 130,
      upperMinutes: 220,
      contributions: [
        { code: 'a', label: 'База', minutes: 90 },
        { code: 'b', label: 'Гликемическая нагрузка', minutes: 42 },
        { code: 'c', label: 'Белок', minutes: -15 },
        { code: 'd', label: 'Форма продуктов', minutes: 6 },
        { code: 'e', label: 'Клетчатка', minutes: -0.2 }
      ]
    }
  }
};

describe('nutrition-tab · правки зоны', () => {
  let api;
  let renderFn;

  beforeEach(() => {
    seedHEYS();
    const loaded = loadModule();
    api = loaded.api;
    renderFn = loaded.render;
  });

  it('клетчатка: дорожка идёт по шкале зон, а не вечно is-ok', () => {
    const { container } = renderTab(renderFn);
    const block = container.querySelector('[data-block="fiber"]');
    expect(block).toBeTruthy();
    const bar = block.querySelector('.nutrition-v4-bar i');
    expect(bar).toBeTruthy();
    // 2 из 27 г к концу дня — глубокое отставание, красная зона.
    expect(bar.className).toBe('is-red');
  });

  it('клетчатка: пустой день — прочерк, без дорожки и без строки «добрать»', () => {
    const { container } = renderTab(renderFn, {
      ctx: { day: { date: '2026-08-20', meals: [] }, dayTot: {}, eatenKcal: 0 }
    });
    const block = container.querySelector('[data-block="fiber"]');
    expect(block).toBeTruthy();
    expect(block.textContent).toContain('—');
    expect(block.querySelector('.nutrition-v4-bar')).toBeNull();
    expect(block.querySelector('.nutrition-v4-disclose')).toBeNull();
  });

  it('нахлёст красится в обеих строках, «без пересечений» больше нет', () => {
    const { container } = renderTab(renderFn, { ctx: { insulinWaveData: WAVE } });
    const block = container.querySelector('[data-block="mealsTimeline"]');
    const rows = block.querySelectorAll('.nutrition-v4-timeline__row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelectorAll('i.is-overlap')).toHaveLength(1);
    expect(rows[1].querySelectorAll('i.is-overlap')).toHaveLength(1);
    expect(block.textContent).toContain('нахлёст');
  });

  it('без пересечений подписи в шапке нет вовсе', () => {
    const calm = {
      ...WAVE,
      waveHistory: [{ id: 'w1', startMin: 480, endMin: 600 }, { id: 'w2', startMin: 720, endMin: 840 }],
      overlaps: [],
      worstOverlap: null
    };
    const { container } = renderTab(renderFn, { ctx: { insulinWaveData: calm } });
    const block = container.querySelector('[data-block="mealsTimeline"]');
    expect(block.querySelector('.nutrition-v4-block__meta')).toBeNull();
    expect(block.textContent).not.toContain('без пересечений');
    expect(block.querySelectorAll('i.is-overlap')).toHaveLength(0);
  });

  it('трассировка: три крупнейших вклада, строка неопределённости, «Весь расчёт»', () => {
    const { container } = renderTab(renderFn, { ctx: { insulinWaveData: WAVE } });
    const block = container.querySelector('[data-block="wave"]');
    expect(block).toBeTruthy();
    const rows = block.querySelectorAll('.nutrition-v4-list__row');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('База');
    expect(rows[0].textContent).toContain('+90');
    expect(rows[2].textContent).toContain('Белок');
    expect(rows[2].textContent).toContain('−15');
    expect(block.textContent).toContain('Неопределённость расчёта');
    expect(block.textContent).toContain('±24 %');
    const more = block.querySelector('.nutrition-v4-disclose');
    expect(more.textContent).toContain('Весь расчёт');
    fireEvent.click(more);
    expect(container.querySelector('[data-block="wave"]').querySelectorAll('.nutrition-v4-list__row')).toHaveLength(5);
  });

  it('добавки: порядок чипов внутри группы — каталожный, а не порядок добавления', () => {
    window.HEYS.Supplements = {
      CATALOG: {
        d3: { name: 'D3', timing: 'morning' },
        omega: { name: 'Омега-3', timing: 'morning' },
        mg: { name: 'Магний', timing: 'morning' }
      },
      getPlanned: () => ['mg', 'omega', 'd3'],
      markSupplementsTaken: vi.fn()
    };
    const { container } = renderTab(renderFn, {
      ctx: {
        prof: { supplementsTrackingEnabled: true },
        day: { date: '2026-08-20', meals: MEALS, supplementsPlanned: ['mg', 'omega', 'd3'], supplementsTaken: [] }
      }
    });
    const block = container.querySelector('[data-block="supplements"]')
      || container.querySelector('.nutrition-v4-supplements__chips')?.closest('section');
    const chips = [...block.querySelectorAll('.nutrition-v4-supplements__chip')].map((el) => el.textContent);
    expect(chips).toEqual(['D3', 'Омега-3', 'Магний']);
  });

  it('согласие: выключение чипа «Добавки» чистит отметки и поля профиля', async () => {
    const store = seedHEYS({
      supplementsTrackingEnabled: true,
      showDiarySupplementsPanel: true,
      plannedSupplements: ['d3'],
      supplementSettings: { d3: { dose: 1 } }
    });
    const loaded = loadModule();
    const purgeDay = vi.fn((day) => day);
    const requestToggle = vi.fn(async () => true);
    window.HEYS.healthFeatures = {
      isSupplementsTrackingEnabled: (p) => p?.supplementsTrackingEnabled === true,
      requestHealthFeatureToggle: requestToggle,
      FEATURE_TOGGLES: {
        supplementsTrackingEnabled: {
          purgeDay,
          purgeProfile: (profile) => ({
            ...profile,
            supplementsTrackingEnabled: false,
            showDiarySupplementsPanel: false,
            plannedSupplements: [],
            supplementSettings: {}
          })
        }
      }
    };
    const chip = loaded.api.CHIPS.find((c) => c.key === 'supplements');
    const ok = await loaded.api.writeChipState(chip, false);
    expect(ok).toBe(true);
    expect(requestToggle).toHaveBeenCalledWith('supplementsTrackingEnabled', false);
    expect(store.heys_profile.supplementsTrackingEnabled).toBe(false);
    expect(store.heys_profile.showDiarySupplementsPanel).toBe(false);
    expect(store.heys_profile.plannedSupplements).toEqual([]);
  });

  it('согласие: отказ в подтверждении отзыва оставляет чип включённым', async () => {
    const store = seedHEYS({ supplementsTrackingEnabled: true, showDiarySupplementsPanel: true });
    const loaded = loadModule();
    window.HEYS.healthFeatures = {
      isSupplementsTrackingEnabled: (p) => p?.supplementsTrackingEnabled === true,
      requestHealthFeatureToggle: vi.fn(async () => false),
      FEATURE_TOGGLES: { supplementsTrackingEnabled: { purgeProfile: (p) => p } }
    };
    const chip = loaded.api.CHIPS.find((c) => c.key === 'supplements');
    const ok = await loaded.api.writeChipState(chip, false);
    expect(ok).toBe(false);
    expect(store.heys_profile.supplementsTrackingEnabled).toBe(true);
    expect(store.heys_profile.showDiarySupplementsPanel).toBe(true);
  });
});
