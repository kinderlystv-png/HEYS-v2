// Канонический тренд веса для поправки на факт (строка контракта «тренд веса
// один»): поправка ходит в MA7 виджета динамики и не заводит седьмую
// реализацию. Здесь же закрепляется «сторона веса» из строки «два исключения по
// двум причинам»: дни цикла и рефида в тренд не входят — там вода и гликоген.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_widgets_weight_dynamics_v4.js'),
  'utf8'
);

const store = new Map();

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// daysAgo = 0 — сегодня; виджет идёт назад от сегодняшнего дня.
function seed(daysAgo, day) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  store.set(`heys_dayv2_${fmt(d)}`, day);
}

function load(extra) {
  store.clear();
  window.HEYS = Object.assign({
    utils: { lsGet: (k, fb = null) => (store.has(k) ? store.get(k) : fb) },
    dayUtils: { fmtDate: fmt }
  }, extra || {});
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  return window.HEYS.Widgets.WeightDynamicsV4;
}

describe('канонический тренд веса', () => {
  beforeEach(() => { store.clear(); });

  it('снижение веса даёт отрицательную дельту за окно', () => {
    const api = load();
    for (let i = 0; i < 30; i++) {
      seed(i, { weightMorning: 90 + i * 0.1, weightMorningSource: 'measured' });
    }
    const t = api.trendForWindow({ days: 21 });
    expect(t.measuredDays).toBe(21);
    expect(t.deltaKg).toBeLessThan(0);
  });

  it('расчётные веса в тренд не идут', () => {
    const api = load();
    for (let i = 0; i < 30; i++) {
      seed(i, { weightMorning: 90, weightMorningEstimated: true });
    }
    const t = api.trendForWindow({ days: 21 });
    expect(t.measuredDays).toBe(0);
    expect(t.deltaKg).toBeNull();
  });

  it('дни рефида исключаются: вода, а не состав', () => {
    const api = load({
      Refeed: { shouldExcludeFromWeightTrend: (d) => !!d.isRefeedDay }
    });
    for (let i = 0; i < 30; i++) {
      seed(i, {
        weightMorning: 90,
        weightMorningSource: 'measured',
        isRefeedDay: i % 3 === 0
      });
    }
    const t = api.trendForWindow({ days: 21 });
    // Каждый третий день выброшен, значит замеров меньше окна.
    expect(t.measuredDays).toBeLessThan(21);
    expect(t.measuredDays).toBeGreaterThan(0);
  });

  it('дни цикла исключаются тем же правилом, что у тренда дня', () => {
    const api = load({
      Cycle: {
        resolveCycleCountDay: ({ cycleDay }) => cycleDay ?? null,
        shouldExcludeFromWeightTrend: (cd) => cd != null && cd <= 5
      }
    });
    for (let i = 0; i < 30; i++) {
      seed(i, {
        weightMorning: 90,
        weightMorningSource: 'measured',
        cycleDay: i < 5 ? i + 1 : null
      });
    }
    const t = api.trendForWindow({ days: 21 });
    expect(t.measuredDays).toBe(16);
  });

  it('гейт данных считает реальные взвешивания, а не календарные дни', () => {
    const api = load();
    // Шесть взвешиваний в окне — ровно порог из строки «гейт данных».
    for (let i = 0; i < 21; i++) {
      seed(i, i % 3 === 0
        ? { weightMorning: 90 - i * 0.05, weightMorningSource: 'measured' }
        : { steps: 5000 });
    }
    const t = api.trendForWindow({ days: 21 });
    expect(t.measuredDays).toBe(7);
    expect(t.windowDays).toBe(21);
  });

  it('короткие дыры интерполируются, длинные — нет', () => {
    const api = load();
    for (let i = 0; i < 30; i++) {
      // Дыра в четыре дня подряд длиннее порога склейки.
      const hole = i >= 10 && i <= 13;
      seed(i, hole ? { steps: 5000 } : { weightMorning: 90, weightMorningSource: 'measured' });
    }
    const t = api.trendForWindow({ days: 21 });
    expect(t.deltaKg).not.toBeNull();
    expect(t.measuredDays).toBe(17);
  });
});
