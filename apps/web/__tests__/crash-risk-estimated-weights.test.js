// Виджет «Динамика веса / риск срыва» строил регрессию по любому weightMorning,
// включая расчётный — тот, что подставляется, когда человек не взвесился
// (среднее трёх последних взвешиваний либо вес профиля). Остальные графики веса
// такие точки выбрасывают, этот единственный не выбрасывал, и зона темпа —
// вплоть до «слишком быстро» и «критично» — считалась частично по синтетике.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const store = new Map();

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// daysAgo = 0 — сегодня. Виджет идёт назад от сегодняшнего дня.
function seed(daysAgo, day) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  store.set(`heys_dayv2_${fmtDate(d)}`, day);
}

const measured = (w) => ({ weightMorning: w, weightMorningSource: 'measured' });
const byFlag = (w) => ({ weightMorning: w, weightMorningEstimated: true });
const byAvg = (w) => ({ weightMorning: w, weightMorningSource: 'estimated_avg' });
const byProfile = (w) => ({ weightMorning: w, weightMorningSource: 'estimated_profile' });

function crashRisk() {
  return global.HEYS.Widgets.DataProviders.crashRisk.getData({ days: 7 });
}

beforeAll(async () => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  global.HEYS.utils = {
    lsGet: (key, fallback = null) => (store.has(key) ? store.get(key) : fallback),
  };
  global.HEYS.dayUtils = Object.assign({}, global.HEYS.dayUtils, { fmtDate });
  global.HEYS.products = { getAll: () => [] };
  await import('../heys_widgets_data_crash_risk_v1.js');
});

beforeEach(() => {
  store.clear();
});

describe('риск срыва · расчётные веса не идут в регрессию', () => {
  it('семь измеренных дней — разбор состоится', () => {
    for (let i = 0; i < 7; i++) seed(i, measured(90 - i * 0.1));
    expect(crashRisk().hasData).toBe(true);
  });

  it('вес, помеченный флагом расчётного, в счёт не идёт', () => {
    for (let i = 0; i < 7; i++) seed(i, byFlag(90 - i * 0.3));
    const res = crashRisk();
    expect(res.hasData).toBe(false);
    expect(res.message).toContain('минимум 3 дня');
  });

  it('вес из среднего трёх взвешиваний в счёт не идёт', () => {
    for (let i = 0; i < 7; i++) seed(i, byAvg(90 - i * 0.3));
    expect(crashRisk().hasData).toBe(false);
  });

  it('вес из профиля в счёт не идёт', () => {
    for (let i = 0; i < 7; i++) seed(i, byProfile(90 - i * 0.3));
    expect(crashRisk().hasData).toBe(false);
  });

  it('синтетическое падение не подменяет собой разбор', () => {
    // Два реальных взвешивания и пять расчётных с резким минусом. Раньше это
    // были семь точек и уверенный вывод о темпе; теперь — два замера, то есть
    // честное «данных мало».
    seed(0, measured(90));
    seed(1, measured(90.1));
    for (let i = 2; i < 7; i++) seed(i, byAvg(95 - i));
    const res = crashRisk();
    expect(res.hasData).toBe(false);
    expect(res.message).toContain('минимум 3 дня');
  });
});
