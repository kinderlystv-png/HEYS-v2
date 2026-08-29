// Поправка на факт — расчёт коэффициента. Главная проверка здесь одна:
// сквозной пример контракта (norm-correction.v4.dc.html, строка «цепочка»)
// обязан воспроизводиться числом в число. Он же ловит любую подмену формулы.
//
// Остальное — вредные случаи, а не счастливый путь: первая неделя дефицита с
// уходом воды, дырявый лог, помеченные дни, выход за диапазон.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'),
  'utf8'
);

let NC;

beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  NC = window.HEYS.NormCorrection;
});

// Дни окна со стороны съеденного.
function days(n, kcal, extra) {
  return Array.from({ length: n }, () => Object.assign(
    { kcal, isLogged: true, isIncomplete: false }, extra || {}
  ));
}

describe('поправка на факт · сквозной пример контракта', () => {
  it('цепочка воспроизводится числом в число', () => {
    // Человек ел 2112 (норму до поправки) и за 21 день потерял 0,267 кг.
    const res = NC.compute({
      days: days(21, 2112),
      formulaPerDay: 2400,
      trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
      currentFactor: 1,
      historyDays: 60
    });

    expect(res.status).toBe('ready');
    expect(res.factPerDay).toBe(2210);          // факт 2 210
    expect(res.mismatchPct).toBe(-8);           // расхождение 8 %
    expect(res.targetFactor).toBeCloseTo(0.92, 2); // цель поправки ×0,92
    expect(res.nextFactor).toBe(0.97);          // шаг недели ×0,97
    expect(res.direction).toBe('down');
    expect(res.needsConsent).toBe(true);        // снижение требует согласия

    const after = NC.applyFactor({
      expenditure: 2400, factor: res.nextFactor, deficitPct: -12
    });
    expect(after.correctedExpenditure).toBe(2328); // ×0,97 = 2 328
    expect(after.norm).toBe(2049);                 // −12 % = 2 049 норма дня

    const before = NC.applyFactor({ expenditure: 2400, factor: 1, deficitPct: -12 });
    expect(before.norm).toBe(2112);                // норма до поправки
    expect(after.norm - before.norm).toBe(-63);    // разница −63 ккал
  });
});

describe('поправка на факт · когда считать нельзя', () => {
  it('холодный старт — видимое состояние, а не пустая строка', () => {
    const res = NC.compute({
      days: days(21, 2112),
      formulaPerDay: 2400,
      trend: { deltaKg: -0.5, measuredDays: 21, windowDays: 21 },
      historyDays: 9
    });
    expect(res.status).toBe('cold_start');
    expect(res.nextFactor).toBe(1);
    expect(res.daysLeft).toBe(5);
    expect(res.reason).toBeTruthy();
  });

  it('холодный старт не сокращается, даже когда данных уже хватает', () => {
    const res = NC.compute({
      days: days(30, 2112),
      formulaPerDay: 2400,
      trend: { deltaKg: -0.3, measuredDays: 30, windowDays: 21 },
      historyDays: 13
    });
    expect(res.status).toBe('cold_start');
  });

  it('мало взвешиваний — карточка называет, чего не хватает', () => {
    const res = NC.compute({
      days: days(21, 2112),
      formulaPerDay: 2400,
      trend: { deltaKg: -0.3, measuredDays: 4, windowDays: 21 },
      historyDays: 60
    });
    expect(res.status).toBe('not_enough_data');
    expect(res.missing.weighIns).toBe(2);
    expect(res.nextFactor).toBe(1);
  });

  it('дни, помеченные «не заполнял», в счёт не идут', () => {
    const res = NC.compute({
      days: days(9, 2112).concat(days(12, 300, { isIncomplete: true })),
      formulaPerDay: 2400,
      trend: { deltaKg: -0.3, measuredDays: 21, windowDays: 21 },
      historyDays: 60
    });
    // Девять ведённых дней — на один меньше порога, и это честно названо.
    expect(res.status).toBe('not_enough_data');
    expect(res.missing.loggedDays).toBe(1);
  });

  it('первая неделя дефицита с уходом воды не задирает коэффициент', () => {
    // Минус два килограмма за 21 день при обычной еде дают расход, которого не
    // бывает: это вода и гликоген. Диапазон такое не пропускает.
    const res = NC.compute({
      days: days(21, 2112),
      formulaPerDay: 2400,
      trend: { deltaKg: -2.0, measuredDays: 21, windowDays: 21 },
      currentFactor: 1,
      historyDays: 60
    });
    expect(res.status).toBe('out_of_range');
    expect(res.nextFactor).toBe(1);
  });
});

describe('поправка на факт · границы и шаг', () => {
  it('шаг не больше трёх процентов, к цели идём за несколько недель', () => {
    const input = {
      days: days(21, 2112),
      formulaPerDay: 2400,
      trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
      historyDays: 60
    };
    const first = NC.compute(Object.assign({}, input, { currentFactor: 1 }));
    const second = NC.compute(Object.assign({}, input, { currentFactor: first.nextFactor }));
    const third = NC.compute(Object.assign({}, input, { currentFactor: second.nextFactor }));

    expect(first.nextFactor).toBe(0.97);
    expect(second.nextFactor).toBe(0.94);
    // К цели ×0,92 подходим на третьей неделе, а не рывком.
    expect(third.nextFactor).toBeCloseTo(0.92, 2);
    expect(third.nextFactor).toBeGreaterThanOrEqual(NC.FACTOR_MIN);
  });

  it('рост применяется без согласия, снижение — с согласием', () => {
    // Ел меньше нормы, а вес почти не двигался — расход выше формульного.
    const up = NC.compute({
      days: days(21, 2500),
      formulaPerDay: 2400,
      trend: { deltaKg: -0.2, measuredDays: 21, windowDays: 21 },
      currentFactor: 1,
      historyDays: 60
    });
    expect(up.direction).toBe('up');
    expect(up.needsConsent).toBe(false);
  });

  it('норма не опускается ниже базового обмена ни при какой поправке', () => {
    const res = NC.applyFactor({
      expenditure: 2400, factor: 0.90, deficitPct: -30, basalMetabolism: 1520
    });
    expect(res.norm).toBe(1520);
    expect(res.hitFloor).toBe(true);
  });

  it('дефицит по договорённости поправка не переписывает', () => {
    const a = NC.applyFactor({ expenditure: 2400, factor: 0.97, deficitPct: -12 });
    const b = NC.applyFactor({ expenditure: 2400, factor: 1.10, deficitPct: -12 });
    // Обещание клиенту одно и то же: меняется база, а не доля.
    expect(a.norm / a.correctedExpenditure).toBeCloseTo(0.88, 3);
    expect(b.norm / b.correctedExpenditure).toBeCloseTo(0.88, 3);
  });
});

describe('поправка на факт · модель кураторской карточки', () => {
  const ready = () => NC.compute({
    days: days(21, 2112),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
    currentFactor: 1,
    historyDays: 60
  });

  it('норма против факта, расхождение и рекомендация — числами сквозного примера', () => {
    const card = NC.buildCuratorCard({
      result: ready(), expenditure: 2400, deficitPct: -12
    });
    expect(card.formula.value).toBe(2400);
    expect(card.formula.source).toBe('BMR + шаги + тренировки');
    expect(card.fact.value).toBe(2210);
    expect(card.mismatchPct).toBe(8);
    expect(card.recommendation.norm).toBe(2049);
    expect(card.recommendation.currentNorm).toBe(2112);
    expect(card.recommendation.deltaKcal).toBe(-63);
    expect(card.actions).toEqual(['apply_tomorrow', 'postpone', 'freeze']);
  });

  it('качество данных сказано словом «хватает», а не голым числом', () => {
    const card = NC.buildCuratorCard({ result: ready(), expenditure: 2400, deficitPct: -12 });
    expect(card.quality.every((q) => q.enough)).toBe(true);

    const weak = NC.buildCuratorCard({
      result: NC.compute({
        days: days(21, 2112),
        formulaPerDay: 2400,
        trend: { deltaKg: -0.3, measuredDays: 4, windowDays: 21 },
        historyDays: 60
      }),
      expenditure: 2400, deficitPct: -12
    });
    expect(weak.status).toBe('not_enough_data');
    expect(weak.quality.find((q) => q.label === 'Взвешиваний реальных').enough).toBe(false);
    expect(weak.recommendation).toBeNull();
    expect(weak.actions).toEqual([]);
    expect(weak.missing.weighIns).toBe(2);
  });

  it('«где может сидеть расхождение» — только куратору и только когда есть что объяснять', () => {
    const card = NC.buildCuratorCard({ result: ready(), expenditure: 2400, deficitPct: -12 });
    expect(card.whereMismatchSits).toContain('формула завышает');
    expect(card.whereMismatchSits).toContain('не попала в дневник');

    // Считать нечего — объяснять тоже нечего.
    const cold = NC.buildCuratorCard({
      result: NC.compute({ days: days(21, 2112), formulaPerDay: 2400, trend: {}, historyDays: 3 }),
      expenditure: 2400, deficitPct: -12
    });
    expect(cold.whereMismatchSits).toBeNull();
  });

  it('точка недели в истории стоит по шкале, а не «примерно»', () => {
    const card = NC.buildCuratorCard({
      result: ready(), expenditure: 2400, deficitPct: -12,
      history: [
        { weekLabel: '26 авг', factor: 0.97, what: 'applied' },
        { weekLabel: '19 авг', factor: 1.00, what: 'cold_start' }
      ]
    });
    // Цель ×0,92, значит 0,97 — три десятых пути от 1,00.
    expect(card.history[0].scaleShare).toBeCloseTo(0.38, 1);
    expect(card.history[0].whatWord).toBe('применил');
    expect(card.history[1].scaleShare).toBe(0);
    expect(card.history[1].whatWord).toBe('холодный старт');
  });

  it('норма ниже базового обмена не уезжает и на карточке', () => {
    const card = NC.buildCuratorCard({
      result: ready(), expenditure: 2400, deficitPct: -40, basalMetabolism: 1520
    });
    expect(card.recommendation.norm).toBe(1520);
    expect(card.recommendation.hitFloor).toBe(true);
  });
});

describe('поправка на факт · кадры недельной сверки', () => {
  const down = () => NC.compute({
    days: days(21, 2112),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
    currentFactor: 1,
    historyDays: 60
  });
  const up = () => NC.compute({
    days: days(21, 2500),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.2, measuredDays: 21, windowDays: 21 },
    currentFactor: 1,
    historyDays: 60
  });
  const hold = () => NC.compute({
    days: days(21, 2112),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.3, measuredDays: 3, windowDays: 21 },
    historyDays: 60
  });

  it('рост применяет система и сообщает — отменить можно одной кнопкой', () => {
    const c = NC.buildWeeklySyncCard({ result: up(), tariff: 'self' });
    expect(c.frame).toBe('raised');
    expect(c.decidedBy).toBe('system');
    expect(c.needsConsent).toBe(false);
    expect(c.actions).toContain('revert');
  });

  it('на Pro до решения куратора клиент видит действующую норму, а не предложение', () => {
    const c = NC.buildWeeklySyncCard({ result: down(), tariff: 'pro', applied: false });
    expect(c.frame).toBe('pending_curator');
    expect(c.readOnly).toBe(true);
    // Герой — действующая норма: иначе человек начнёт есть на непринятое число.
    expect(c.hero).toBe('currentNorm');
    // Отменить решение куратора клиент не может — двух хозяев у числа нет.
    expect(c.actions).not.toContain('keep_current');
  });

  it('на Pro применённое снижение показывается как результат', () => {
    const c = NC.buildWeeklySyncCard({ result: down(), tariff: 'pro', applied: true });
    expect(c.frame).toBe('lowered');
    expect(c.decidedBy).toBe('curator');
  });

  it('на Self снижение требует согласия клиента', () => {
    const c = NC.buildWeeklySyncCard({ result: down(), tariff: 'self' });
    expect(c.frame).toBe('lowered_needs_consent');
    expect(c.decidedBy).toBe('client');
    expect(c.actions).toEqual(['apply_tomorrow', 'keep_current']);
  });

  it('третий отказ подряд перестаёт уходить в тишину', () => {
    const c = NC.buildWeeklySyncCard({
      result: down(), tariff: 'self', refusalStreak: 3, weeksUnchanged: 6
    });
    expect(c.frame).toBe('refused_three_times');
    expect(c.weeksUnchanged).toBe(6);
    expect(c.mismatchPct).toBe(8);
    // Кнопки необязательные: плохо не то, что человек отказывается.
    expect(c.actions).toEqual(['apply', 'measure_waist', 'mute_month']);
  });

  it('рекомпозиция показывается только при подтверждённом доводе', () => {
    const ok = NC.buildWeeklySyncCard({
      result: down(), tariff: 'self',
      recomposition: { confirmed: true, source: 'по замеру от 12 августа' }
    });
    expect(ok.frame).toBe('recomposition');
    expect(ok.evidence).toContain('замеру');

    const failed = NC.buildWeeklySyncCard({
      result: down(), tariff: 'self', recomposition: { checkFailed: true }
    });
    expect(failed.frame).toBe('recomposition_unverified');
  });

  it('считать нечего — сошлось, и это самый частый исход', () => {
    expect(NC.buildWeeklySyncCard({ result: hold(), tariff: 'self' }).frame).toBe('matched');
  });

  it('предохранители есть в обоих тарифах, слой разный', () => {
    const self = NC.buildWeeklySyncCard({ result: down(), tariff: 'self' });
    const pro = NC.buildWeeklySyncCard({ result: down(), tariff: 'pro', applied: true });
    expect(self.safeguardsLayer).toBe('first');
    expect(pro.safeguardsLayer).toBe('second');
    // Содержание одно и то же — иначе это два разных набора правил.
    expect(self.safeguards).toEqual(pro.safeguards);
  });
});
