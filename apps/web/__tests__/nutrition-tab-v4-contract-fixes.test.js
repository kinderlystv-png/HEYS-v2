// Смоук-симуляция строк контракта nutrition-tab.v4.dc.html, сведённых в коде:
// «клетчатка · блок» (шкала зон + пустой день), «нахлёст» (обе строки, нет
// подписи без пересечений), «трассировка расчёта» (три вклада, неопределённость,
// «Весь расчёт»), «порядок чипов» (каталог), «согласие» (первое включение идёт
// через лист согласия; выключение чипа только прячет блок).
//
// Живьём эти стыки человек не соберёт: нахлёст волн, глубокий недобор клетчатки
// и лист согласия на добавки по заказу не воспроизводятся.
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const NUTRITION_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_nutrition_v1.js'), 'utf8');
const NUTRITION_CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css'), 'utf8');

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
    // Закрытый день → progressK = 1: 2 из 27 г — глубокое отставание, красная зона
    // (контракт «шкала зон» / кадр «вечер, 19:30»). Без isPastDay тест зависит от
    // времени суток: до подъёма ожидаемое ≈ 0 и 2 г выглядят «в графике».
    const { container } = renderTab(renderFn, {
      ctx: {
        date: '2026-08-19',
        day: { date: '2026-08-19', meals: MEALS, sleepEnd: '07:00', sleepStart: '23:00' },
        dayTot: { kcal: 418, prot: 20, fat: 10, carbs: 60, fiber: 2, harm: 3.4, gi: 48 }
      }
    });
    const block = container.querySelector('[data-block="fiber"]');
    expect(block).toBeTruthy();
    const bar = block.querySelector('.nutrition-v4-bar i');
    expect(bar).toBeTruthy();
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

  // Прежде здесь стояли два теста, закреплявшие правку 24.08: выключение чипа
  // «Добавки» шло через подтверждение отзыва и чистило поля профиля, а отказ в
  // подтверждении оставлял чип включённым. Владелец решение отменил в тот же
  // день («да разделить, чип только прятать должен»): чип отвечает за показ,
  // отзыв согласия живёт отдельной строкой в настройках. Тесты переписаны под
  // возврат, а не сняты, — чтобы путь отзыва не уехал на вкладку заново.
  it('чип «Добавки»: выключение прячет блок и не трогает курс с отметками', async () => {
    const store = seedHEYS({
      supplementsTrackingEnabled: true,
      showDiarySupplementsPanel: true,
      plannedSupplements: ['d3'],
      supplementSettings: { d3: { dose: 1 } }
    });
    const loaded = loadModule();
    const requestToggle = vi.fn(async () => true);
    const purgeProfile = vi.fn((p) => p);
    window.HEYS.healthFeatures = {
      isSupplementsTrackingEnabled: (p) => p?.supplementsTrackingEnabled === true,
      requestHealthFeatureToggle: requestToggle,
      FEATURE_TOGGLES: { supplementsTrackingEnabled: { purgeDay: vi.fn(), purgeProfile } }
    };
    const chip = loaded.api.CHIPS.find((c) => c.key === 'supplements');
    const ok = await loaded.api.writeChipState(chip, false);
    expect(ok).toBe(true);
    // Ни подтверждения, ни чистки: жест отвечает только за показ.
    expect(requestToggle).not.toHaveBeenCalled();
    expect(purgeProfile).not.toHaveBeenCalled();
    expect(store.heys_profile.showDiarySupplementsPanel).toBe(false);
    expect(store.heys_profile.supplementsTrackingEnabled).toBe(true);
    expect(store.heys_profile.plannedSupplements).toEqual(['d3']);
    expect(store.heys_profile.supplementSettings).toEqual({ d3: { dose: 1 } });
    // Спрятанный блок пропал из вкладки, остальные на местах.
    expect(loaded.api.readChipState(store.heys_profile).supplements).toBe(false);
  });

  it('чип «Добавки»: обратное включение возвращает блок без листа согласия', async () => {
    const store = seedHEYS({
      supplementsTrackingEnabled: true,
      showDiarySupplementsPanel: false,
      plannedSupplements: ['d3'],
      supplementSettings: { d3: { dose: 1 } }
    });
    const loaded = loadModule();
    const requestToggle = vi.fn(async () => true);
    window.HEYS.healthFeatures = {
      isSupplementsTrackingEnabled: (p) => p?.supplementsTrackingEnabled === true,
      requestHealthFeatureToggle: requestToggle,
      FEATURE_TOGGLES: { supplementsTrackingEnabled: { purgeProfile: (p) => p } }
    };
    const chip = loaded.api.CHIPS.find((c) => c.key === 'supplements');
    const ok = await loaded.api.writeChipState(chip, true);
    expect(ok).toBe(true);
    // Согласие уже дано — второй раз его не спрашивают.
    expect(requestToggle).not.toHaveBeenCalled();
    expect(store.heys_profile.showDiarySupplementsPanel).toBe(true);
    expect(store.heys_profile.plannedSupplements).toEqual(['d3']);
    expect(loaded.api.readChipState(store.heys_profile).supplements).toBe(true);
  });

  it('чип «Добавки»: первое включение по-прежнему идёт через согласие', async () => {
    const store = seedHEYS({});
    const loaded = loadModule();
    const requestToggle = vi.fn(async () => false);
    window.HEYS.healthFeatures = {
      isSupplementsTrackingEnabled: (p) => p?.supplementsTrackingEnabled === true,
      requestHealthFeatureToggle: requestToggle,
      FEATURE_TOGGLES: { supplementsTrackingEnabled: { purgeProfile: (p) => p } }
    };
    const chip = loaded.api.CHIPS.find((c) => c.key === 'supplements');
    const refused = await loaded.api.writeChipState(chip, true);
    expect(refused).toBe(false);
    expect(requestToggle).toHaveBeenCalledWith('supplementsTrackingEnabled', true);
    expect(store.heys_profile.supplementsTrackingEnabled).toBeUndefined();

    requestToggle.mockImplementation(async () => true);
    const granted = await loaded.api.writeChipState(chip, true);
    expect(granted).toBe(true);
    expect(store.heys_profile.supplementsTrackingEnabled).toBe(true);
    expect(store.heys_profile.showDiarySupplementsPanel).toBe(true);
  });

  it('чип «Добавки»: спрятанный блок остаётся спрятанным после перерисовки', () => {
    seedHEYS({ supplementsTrackingEnabled: true, showDiarySupplementsPanel: false });
    const loaded = loadModule();
    window.HEYS.healthFeatures = {
      isSupplementsTrackingEnabled: (p) => p?.supplementsTrackingEnabled === true
    };
    window.HEYS.Supplements = {
      CATALOG: { d3: { name: 'D3', timing: 'morning' } },
      getPlanned: () => ['d3'],
      markSupplementsTaken: vi.fn()
    };
    const ctx = {
      prof: { supplementsTrackingEnabled: true, showDiarySupplementsPanel: false },
      day: { date: '2026-08-20', meals: MEALS, supplementsPlanned: ['d3'], supplementsTaken: [] }
    };
    const first = renderTab(loaded.render, { ctx });
    expect(first.container.querySelector('[data-block="supplements"]')).toBeNull();
    // Перерисовка читает профиль заново — состояние показа живёт не в React.
    const second = renderTab(loaded.render, { ctx });
    expect(second.container.querySelector('[data-block="supplements"]')).toBeNull();
  });
});

describe('nutrition-tab · доступность и три чипа профиля', () => {
  let api;
  let renderFn;

  beforeEach(() => {
    seedHEYS({ supplementsTrackingEnabled: true });
    const loaded = loadModule();
    api = loaded.api;
    renderFn = loaded.render;
  });

  it('герой, строка приёма, чипы и прочерк — по контракту доступности', () => {
    const wave = {
      waveHistory: [{ id: 'w1', startMin: 8 * 60, endMin: 11 * 60 }],
      overlaps: []
    };
    const { container } = renderTab(renderFn, { ctx: { insulinWaveData: wave } });
    const hero = container.querySelector('.nutrition-v4-hero');
    expect(hero.getAttribute('aria-label')).toMatch(/осталось .+ ккал, в коридоре/);

    const row = container.querySelector('.nutrition-v4-meal-row');
    expect(row.getAttribute('aria-label')).toBe('08:20, Завтрак, 418 ккал, 1 продукт');
    expect(row.querySelector('.nutrition-v4-sr-only')).toBeNull();

    const track = container.querySelector('.nutrition-v4-timeline__track');
    expect(track?.getAttribute('aria-hidden')).toBe('true');

    const chip = container.querySelector('.nutrition-v4-chip');
    expect(chip.getAttribute('role')).toBe('switch');
    expect(chip.getAttribute('aria-label')).toMatch(/, включено$/);
  });

  it('пустой приём и пустой день читают «нет данных», а не тире', () => {
    const emptyMeal = renderTab(renderFn, {
      ctx: { day: { date: '2026-08-20', meals: [{ id: 'e1', time: '19:30', name: 'Ужин', items: [] }] } }
    });
    const emptyRow = emptyMeal.container.querySelector('.nutrition-v4-meal-row');
    expect(emptyRow.getAttribute('aria-label')).toBe('19:30, Ужин, нет данных, 0 продуктов');
    expect(emptyRow.querySelector('.nutrition-v4-sr-only')?.textContent).toBe('нет данных');

    const emptyDay = renderTab(renderFn, {
      ctx: { day: { date: '2026-08-20', meals: [] }, eatenKcal: 0, dayTot: {}, normAbs: { kcal: 1931 } }
    });
    expect(emptyDay.container.querySelector('.nutrition-v4-total-row .nutrition-v4-sr-only')?.textContent)
      .toBe('нет данных');
  });

  it('три чипа профиля: writeChipState пишет поля и убирает блоки', async () => {
    const store = seedHEYS({ supplementsTrackingEnabled: true });
    const loaded = loadModule();
    const wave = {
      waveHistory: [{ id: 'w1', startMin: 8 * 60, endMin: 11 * 60 }],
      overlaps: []
    };
    const fields = [
      ['hunger', 'showDiaryHungerPanel'],
      ['refeed', 'showDiaryRefeedPanel'],
      ['mealsTimeline', 'showDiaryMealsTimelinePanel']
    ];
    for (const [key, field] of fields) {
      const chip = loaded.api.CHIPS.find((c) => c.key === key);
      expect(await loaded.api.writeChipState(chip, false)).toBe(true);
      expect(store.heys_profile[field]).toBe(false);
      expect(loaded.api.readChipState(store.heys_profile)[key]).toBe(false);
    }
    const hidden = renderTab(loaded.render, {
      ctx: {
        prof: store.heys_profile,
        day: { date: '2026-08-20', meals: MEALS, isRefeedDay: true },
        insulinWaveData: wave,
        displayOptimum: 2200,
        optimum: 1931,
        budgetKcal: 2200
      }
    });
    expect(hidden.container.querySelector('[data-block="hunger"]')).toBeNull();
    expect(hidden.container.querySelector('[data-block="refeed"]')).toBeNull();
    expect(hidden.container.querySelector('[data-block="mealsTimeline"]')).toBeNull();
  });

  it('три чипа: тап в UI переключает профиль и скрывает блок', async () => {
    const store = seedHEYS({ supplementsTrackingEnabled: true });
    const loaded = loadModule();
    const wave = {
      waveHistory: [{ id: 'w1', startMin: 8 * 60, endMin: 11 * 60 }],
      overlaps: []
    };
    const { container } = renderTab(loaded.render, {
      ctx: { insulinWaveData: wave }
    });
    const hungerChip = [...container.querySelectorAll('.nutrition-v4-chip')]
      .find((node) => node.textContent.includes('Голод'));
    expect(container.querySelector('[data-block="hunger"]')).toBeTruthy();
    fireEvent.click(hungerChip);
    await Promise.resolve();
    expect(store.heys_profile.showDiaryHungerPanel).toBe(false);
    const after = renderTab(loaded.render, {
      ctx: { prof: store.heys_profile, insulinWaveData: wave }
    });
    expect(after.container.querySelector('[data-block="hunger"]')).toBeNull();
    const offChip = [...after.container.querySelectorAll('.nutrition-v4-chip')]
      .find((node) => node.textContent.includes('Голод'));
    expect(offChip.getAttribute('aria-label')).toBe('Голод, выключено');
  });

  it('reduce-motion снимает блюр под листом правки приёма', () => {
    expect(NUTRITION_CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.nutrition-v4-sheet-backdrop[\s\S]*backdrop-filter:\s*none/);
  });

  it('«Особый период»: блок после голода, radiogroup дней 1–7', () => {
    window.HEYS.healthFeatures = {
      isCycleTrackingEnabled: (p) => p?.cycleTrackingEnabled === true
    };
    window.HEYS.CycleUI = {
      resolveCycleDayForUi: () => 3,
      getSuggestedCycleDay: () => null,
      formatCycleWeekBadge: (d) => `День ${d}`,
      applyCycleDaySelection: vi.fn()
    };
    const { container } = renderTab(renderFn, {
      ctx: {
        prof: { gender: 'Женский', cycleTrackingEnabled: true, showDiaryCyclePanel: true, showDiaryHungerPanel: true },
        day: { date: '2026-08-20', meals: MEALS, cycleDay: 3 }
      }
    });
    const blocks = [...container.querySelectorAll('[data-block]')].map((el) => el.getAttribute('data-block'));
    const hungerIdx = blocks.indexOf('hunger');
    const cycleIdx = blocks.indexOf('cycle');
    expect(hungerIdx).toBeGreaterThan(-1);
    expect(cycleIdx).toBeGreaterThan(hungerIdx);
    const group = container.querySelector('[data-block="cycle"] [role="radiogroup"]');
    expect(group?.getAttribute('aria-label')).toBe('Какой день');
    expect(container.querySelectorAll('.nutrition-v4-cycle-day')).toHaveLength(7);
    const cycleChip = [...container.querySelectorAll('.nutrition-v4-chip')]
      .find((node) => node.textContent.includes('Особый период'));
    expect(cycleChip).toBeTruthy();
  });
});

describe('nutrition-tab · повторный тап · правило продукта — добавки', () => {
  let renderFn;

  function seedSupplements(planned, taken) {
    seedHEYS({ supplementsTrackingEnabled: true });
    const loaded = loadModule();
    renderFn = loaded.render;
    window.HEYS.Supplements = {
      CATALOG: {
        d3: { name: 'D3', timing: 'morning' },
        mg: { name: 'Магний', timing: 'morning' }
      },
      getPlanned: () => planned,
      markSupplementsTaken: vi.fn()
    };
    return renderTab(renderFn, {
      ctx: {
        prof: { supplementsTrackingEnabled: true },
        day: { date: '2026-08-20', meals: MEALS, supplementsPlanned: planned, supplementsTaken: taken }
      }
    });
  }

  // Контракт «повторный тап и поворот» (nutrition-tab.v4.dc.html): «защита
  // стоит на чипах добавок, на пилюле группы и на «Всё сразу»; на чипах
  // блоков вкладки её нет». 350 мс дребезга пальца человек и тест
  // воспроизводят по-разному: вживую — не собрать одинаково дважды, в jsdom —
  // двумя синхронными click подряд.
  it('чип добавки: второй тап за 350 мс не создаёт вторую отметку', () => {
    const { container } = seedSupplements(['d3'], []);
    const chip = container.querySelector('.nutrition-v4-supplements__chip');
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(window.HEYS.Supplements.markSupplementsTaken).toHaveBeenCalledTimes(1);
  });

  it('чип добавки: тап через 400 мс проходит как новое нажатие', () => {
    const { container } = seedSupplements(['d3'], []);
    const chip = container.querySelector('.nutrition-v4-supplements__chip');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValueOnce(now).mockReturnValueOnce(now + 400);
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(window.HEYS.Supplements.markSupplementsTaken).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('пилюля группы: второй тап за 350 мс не дублирует групповую отметку', () => {
    const { container } = seedSupplements(['d3', 'mg'], []);
    const pill = container.querySelector('.nutrition-v4-supplements__group-pill');
    expect(pill).toBeTruthy();
    fireEvent.click(pill);
    fireEvent.click(pill);
    expect(window.HEYS.Supplements.markSupplementsTaken).toHaveBeenCalledTimes(1);
  });

  it('«Всё сразу»: второй тап за 350 мс не дублирует отметку дня', () => {
    const { container } = seedSupplements(['d3', 'mg'], []);
    const pill = container.querySelector('.nutrition-v4-supplements__pill:not(.is-course)');
    expect(pill).toBeTruthy();
    expect(pill.textContent).toBe('Всё сразу');
    fireEvent.click(pill);
    fireEvent.click(pill);
    expect(window.HEYS.Supplements.markSupplementsTaken).toHaveBeenCalledTimes(1);
  });

  it('разные чипы за 350 мс — это не повтор по тому же элементу, обе отметки проходят', () => {
    const { container } = seedSupplements(['d3', 'mg'], []);
    const chips = container.querySelectorAll('.nutrition-v4-supplements__chip');
    expect(chips).toHaveLength(2);
    fireEvent.click(chips[0]);
    fireEvent.click(chips[1]);
    expect(window.HEYS.Supplements.markSupplementsTaken).toHaveBeenCalledTimes(2);
  });
});

describe('nutrition-tab · выделение и копирование · правило продукта', () => {
  // Контракт «язык, выделение, часовой пояс» (nutrition-tab.v4.dc.html):
  // «названия своих продуктов и заметки к приёму выделяются и копируются,
  // числа итогов и подписи блоков — нет». Проверено по исходнику CSS — само
  // выделение мышью/пальцем в jsdom не воспроизводится.
  it('вкладка и лист правки приёма не выделяются по умолчанию', () => {
    const match = NUTRITION_CSS.match(/\.nutrition-v4,\s*\.nutrition-v4-sheet-backdrop\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match[0]).toContain('user-select: none;');
  });

  it('названия своих продуктов остаются выделяемыми — явное исключение', () => {
    const match = NUTRITION_CSS.match(/\.nutrition-v4-meal-row__items,\s*\.nutrition-v4-sheet__row--product b\s*\{[^}]*\}/);
    expect(match).toBeTruthy();
    expect(match[0]).toContain('user-select: text;');
  });
});
