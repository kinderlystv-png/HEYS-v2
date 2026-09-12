/**
 * Окно предупреждений — последние дни, а не самые старые.
 *
 * Дефект (замер 12.09.2026 на стенде reports-insights-no-tasks-sand): при
 * сегодняшнем 28 августа проверка «недобор калорий» считала дни 17 и 16
 * августа — одиннадцать и двенадцать дней назад. Причина: JSDoc
 * detectEarlyWarnings объявляет порядок «oldest to newest», и на нём стоят все
 * срезы `slice(-N)`, а весь вызывающий код собирает дни циклом
 * `for (i = 0; i < 30; i++)` с `d.setDate(d.getDate() - i)`, то есть от
 * сегодня назад. «Семь с конца» попадали в самую старую неделю истории.
 *
 * Здесь порядок проверяется с обеих сторон: детектор обязан назвать последние
 * дни и при свежем-первом, и при старом-первом входе. Тест падает на возврате
 * к `slice(-7)` без нормализации порядка и на возврате `slice(0, N)` внутри
 * детекторов сна и калорий.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

beforeAll(async () => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  global.HEYS.InsightsPI = global.HEYS.InsightsPI || {};
  global.HEYS.InsightsPI.calculations = global.HEYS.InsightsPI.calculations || {};
  global.HEYS.Status = global.HEYS.Status || {};

  global.HEYS.InsightsPI.calculations.calculateHealthScore = (day) => ({ overall: day.mockScore ?? 70 });
  // Килокалории считаем прямо из граммов: 1 г = 1 ккал, чтобы день можно было
  // задать одним числом и проверяемо отличить «съедено» от «недобор».
  global.HEYS.InsightsPI.calculations.calculateItemKcal = (item) => Number(item?.grams) || 0;
  global.HEYS.Status.calculate = (opts) => ({ score: opts?.dayData?.statusScore ?? 75 });

  await import('../heys_models_v1.js');
  await import('../insights/pi_early_warning.js');
});

const OPTIMUM = 2000;
const PROFILE = { optimum: OPTIMUM, sleepHours: 8 };

function isoDate(offsetFromStart) {
  const d = new Date(Date.UTC(2026, 7, 1)); // 1 августа 2026
  d.setUTCDate(d.getUTCDate() + offsetFromStart);
  return d.toISOString().slice(0, 10);
}

/**
 * Тридцать дней подряд: старые сытые и выспавшиеся, последние — голодные и
 * недоспавшие. Окна у правил разные (недобор калорий смотрит два дня, недосып
 * три), поэтому и плохих дней разное число. Возвращаются от старого к свежему.
 */
function buildDays() {
  const days = [];
  for (let i = 0; i < 30; i++) {
    const badSleep = i >= 27; // три последние ночи
    const badCalories = i >= 28; // два последних дня
    days.push({
      date: isoDate(i),
      sleepHours: badSleep ? 5 : 8,
      meals: [{ time: '12:00', items: [{ product_id: 'p1', grams: badCalories ? 400 : OPTIMUM }] }]
    });
  }
  return days;
}

const LAST_TWO = [isoDate(28), isoDate(29)];
const FIRST_TWO = [isoDate(0), isoDate(1)];

// Справочник обязан содержать продукт из дней: без него правила про еду молчат
// (см. ews-empty-catalog.test.js), и проверять порядок было бы не на чем.
function makePIndex() {
  return { byId: new Map([['p1', { id: 'p1', protein100: 10, simple100: 10, complex100: 10 }]]) };
}

function detectWith(days) {
  global.HEYS.InsightsPI.earlyWarning._clearDetectCache();
  return global.HEYS.InsightsPI.earlyWarning.detect(days, PROFILE, makePIndex(), { includeDetails: true });
}

describe('окно предупреждений — последние дни', () => {
  beforeEach(() => {
    global.HEYS.InsightsPI.earlyWarning._clearDetectCache();
  });

  for (const [name, order] of [['от старого к свежему', (d) => d], ['от свежего к старому (как собирает продукт)', (d) => d.slice().reverse()]]) {
    it(`недобор калорий считается по последним дням: вход ${name}`, () => {
      const result = detectWith(order(buildDays()));
      expect(result.available).toBe(true);

      const debt = result.warnings.find((w) => w.type === 'CALORIC_DEBT');
      expect(debt, 'правило «недобор калорий» должно сработать на двух последних днях').toBeDefined();
      expect(debt.windowDates).toEqual(LAST_TWO);
      expect(debt.windowDates).not.toEqual(FIRST_TWO);
      // Съедено 400 при норме 2000 — правило обязано назвать голодные дни,
      // а не сытые: на старой неделе недобора нет вовсе.
      expect(debt.avgEaten).toBe(400);
    });

    it(`недосып считается по последним дням: вход ${name}`, () => {
      const result = detectWith(order(buildDays()));
      const sleep = result.warnings.find((w) => w.type === 'SLEEP_DEBT');
      expect(sleep, 'правило «недосып» должно сработать на последних ночах').toBeDefined();
      expect(sleep.windowDates[sleep.windowDates.length - 1]).toBe(isoDate(29));
      expect(sleep.avgSleep).toBeLessThan(8);
    });
  }

  it('сытые и выспавшиеся последние дни не дают предупреждения, даже если старые плохие', () => {
    // Зеркало основного случая: плохие дни в начале истории не должны
    // «протекать» в окно последних дней.
    const days = buildDays().map((day, i) => {
      const bad = i < 3; // теперь плохие — самые старые
      return {
        ...day,
        sleepHours: bad ? 5 : 8,
        meals: [{ time: '12:00', items: [{ product_id: 'p1', grams: bad ? 400 : OPTIMUM }] }]
      };
    });

    const result = detectWith(days.slice().reverse());
    expect(result.warnings.find((w) => w.type === 'CALORIC_DEBT')).toBeUndefined();
    expect(result.warnings.find((w) => w.type === 'SLEEP_DEBT')).toBeUndefined();
  });
});
