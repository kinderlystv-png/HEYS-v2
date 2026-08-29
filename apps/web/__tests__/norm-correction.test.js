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
