/**
 * Пустой справочник продуктов — это незнание, а не пустой день.
 *
 * Дефект (замер 12.09.2026, стенд reports-insights-no-tasks-sand): проба в
 * отрисовке блока «Стоит внимания» показала справочник `{вИндексе: 0,
 * всего: 0}` на момент расчёта, при том что приёмы в днях записаны и макросы
 * у продуктов заполнены. `calculateItemKcal` не находит продукт в индексе и
 * молча возвращает ноль, дневная сумма выходит нулевой — и человек получает
 * «два дня подряд недобор около 1694 ккал», то есть свою норму целиком.
 *
 * Живой случай тот же: справочник приезжает из облака не мгновенно, а расчёт
 * предупреждений стартует при открытии вкладки. В этом окне любой человек
 * выглядит так, будто ничего не ел.
 *
 * Контракт зоны: числа, которого нет, не показывается вовсе. Значит правила
 * про еду молчат, а правила, которым справочник не нужен (сон, самочувствие),
 * продолжают работать — глушить всё разом нельзя.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

beforeAll(async () => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};
  global.HEYS.InsightsPI.calculations = global.HEYS.InsightsPI.calculations || {};
  global.HEYS.Status = global.HEYS.Status || {};

  global.HEYS.InsightsPI.calculations.calculateHealthScore = (day) => ({ overall: day.mockScore ?? 70 });
  // Настоящее поведение: продукта нет в индексе — позиция даёт ноль.
  global.HEYS.InsightsPI.calculations.calculateItemKcal = (item, pIndex) => {
    const key = String(item?.product_id || item?.id || '').toLowerCase();
    const prod = pIndex?.byId?.get?.(key);
    if (!prod) return 0;
    return Number(item?.grams) || 0;
  };
  global.HEYS.Status.calculate = (opts) => ({ score: opts?.dayData?.statusScore ?? 75 });

  await import('../heys_models_v1.js');
  await import('../insights/pi_early_warning.js');
});

const OPTIMUM = 2000;
const PROFILE = { optimum: OPTIMUM, sleepHours: 8 };
const FULL_INDEX = () => ({ byId: new Map([['p1', { id: 'p1', protein100: 10 }]]) });
const EMPTY_INDEX = () => ({ byId: new Map() });

function isoDate(offset) {
  const d = new Date(Date.UTC(2026, 7, 1));
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Тридцать дней, в каждом записана нормальная еда и недосып в последние три ночи. */
function buildDays() {
  const days = [];
  for (let i = 0; i < 30; i++) {
    days.push({
      date: isoDate(i),
      sleepHours: i >= 27 ? 5 : 8,
      meals: [{ time: '12:00', items: [{ product_id: 'p1', grams: OPTIMUM }] }]
    });
  }
  return days;
}

function detect(days, pIndex) {
  global.HEYS.InsightsPI.earlyWarning._clearDetectCache();
  return global.HEYS.InsightsPI.earlyWarning.detect(days, PROFILE, pIndex, { includeDetails: true });
}

describe('пустой справочник продуктов не превращается в недобор калорий', () => {
  beforeEach(() => {
    global.HEYS.InsightsPI.earlyWarning._clearDetectCache();
  });

  it('еда записана, справочник пуст — правило про недобор молчит', () => {
    const result = detect(buildDays(), EMPTY_INDEX());
    expect(result.available).toBe(true);
    expect(result.warnings.find((w) => w.type === 'CALORIC_DEBT')).toBeUndefined();
  });

  it('правила, которым справочник не нужен, продолжают работать', () => {
    // Глушить весь блок при пустом справочнике нельзя: недосып и самочувствие
    // считаются по полям дня и от продуктов не зависят.
    const result = detect(buildDays(), EMPTY_INDEX());
    expect(result.warnings.find((w) => w.type === 'SLEEP_DEBT')).toBeDefined();
  });

  it('тот же вход со справочником даёт честный результат: еда посчитана, недобора нет', () => {
    const result = detect(buildDays(), FULL_INDEX());
    expect(result.warnings.find((w) => w.type === 'CALORIC_DEBT')).toBeUndefined();
  });

  it('справочник на месте, еды действительно мало — правило срабатывает', () => {
    // Контрольная сторона: молчание должно означать «не смогли посчитать»,
    // а не «правило сломано».
    const days = buildDays().map((day, i) => (i < 28 ? day : {
      ...day,
      meals: [{ time: '12:00', items: [{ product_id: 'p1', grams: 400 }] }]
    }));
    const result = detect(days, FULL_INDEX());
    const debt = result.warnings.find((w) => w.type === 'CALORIC_DEBT');
    expect(debt).toBeDefined();
    expect(debt.avgEaten).toBe(400);
  });

  it('день без записанной еды остаётся честным нулём', () => {
    // Пустой дневник — это не незнание: недобор по нему настоящий.
    const days = buildDays().map((day, i) => (i < 28 ? day : { ...day, meals: [] }));
    const result = detect(days, FULL_INDEX());
    expect(result.warnings.find((w) => w.type === 'CALORIC_DEBT')).toBeDefined();
  });
});
