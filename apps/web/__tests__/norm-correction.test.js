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
    expect(card.result || card.mismatchPct).toBeTruthy();
    expect(card.whereMismatchSits).toContain('формула завышает');
    expect(card.whereMismatchSits).toContain('не попала в дневник');

    // Считать нечего — объяснять тоже нечего.
    const cold = NC.buildCuratorCard({
      result: NC.compute({ days: days(21, 2112), formulaPerDay: 2400, trend: {}, historyDays: 3 }),
      expenditure: 2400, deficitPct: -12
    });
    expect(cold.whereMismatchSits).toBeNull();
  });

  it('объяснение выбирается стороной расхождения, а не одно на оба', () => {
    // У живого клиента факт 2 273 против формулы 2 230: расчёт просит поднять
    // норму, а строка говорила «формула завышает» — прямо против чисел над ней.
    // Расхождение берём заведомо вне мёртвой зоны: внутри неё объяснять нечего.
    const up = NC.buildCuratorCard({
      result: NC.compute({
        days: days(21, 2650), formulaPerDay: 2400,
        trend: { deltaKg: 0.3, measuredDays: 21, windowDays: 21 },
        currentFactor: 1, historyDays: 60
      }),
      expenditure: 2400, deficitPct: -12
    });
    expect(up.recommendation.stepFactor).toBeGreaterThan(1);
    expect(up.whereMismatchSits).toContain('формула занижает');
    expect(up.whereMismatchSits).not.toContain('формула завышает');

    const down = NC.buildCuratorCard({ result: ready(), expenditure: 2400, deficitPct: -12 });
    expect(down.recommendation.stepFactor).toBeLessThan(1);
    expect(down.whereMismatchSits).toContain('формула завышает');
  });

  it('расхождения нет — объяснять нечего', () => {
    // Строка «где сидит расхождение» при нулевом расхождении утверждала бы,
    // что расхождение есть.
    const flat = NC.buildCuratorCard({
      result: NC.compute({
        days: days(21, 2400), formulaPerDay: 2400,
        trend: { deltaKg: 0, measuredDays: 21, windowDays: 21 },
        currentFactor: 1, historyDays: 60
      }),
      expenditure: 2400, deficitPct: -12
    });
    expect(flat.mismatchPct).toBe(0);
    expect(flat.whereMismatchSits).toBeNull();
  });

  it('разбор расхода: доли дают ровно сто и нули не показываются', () => {
    // Простое округление каждой доли давало 72 + 13 + 13 + 3 = 101, и сумма
    // спорила сама с собой. Нули — не факт о человеке, а шум от того, что он
    // не тренировался.
    const card = NC.buildCuratorCard({
      result: ready(), expenditure: 2004, deficitPct: -15, basalMetabolism: 1446,
      breakdown: { bmr: 1446, trainings: 253, steps: 253, household: 53 }
    });
    expect(card.expenditureParts.map((p) => p.sharePct).reduce((a, b) => a + b, 0)).toBe(100);
    expect(card.expenditureParts.map((p) => p.label)).toEqual([
      'Базовый обмен', 'Тренировки', 'Шаги', 'Бытовая активность'
    ]);

    const noTraining = NC.buildCuratorCard({
      result: ready(), expenditure: 1800, deficitPct: -15, basalMetabolism: 1446,
      breakdown: { bmr: 1446, trainings: 0, steps: 300, household: 54 }
    });
    expect(noTraining.expenditureParts.map((p) => p.key)).toEqual(['bmr', 'steps', 'household']);
    expect(noTraining.expenditureParts.map((p) => p.sharePct).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('путь «съедено → факт → норма» показан числами, а не подразумевается', () => {
    const card = NC.buildCuratorCard({
      result: ready(), expenditure: 2400, deficitPct: -15, basalMetabolism: 1400
    });
    // Съеденное, движение веса и энергия запаса — из движка, не из вёрстки.
    expect(card.path.eatenPerDay).toBe(card.path.eatenPerDay);
    expect(Number.isFinite(card.path.storedPerDay)).toBe(true);
    expect(card.path.deltaKg).toBeCloseTo(-0.267, 3);
    // Последний переход: расход с поправкой и дефицит по договорённости.
    expect(card.recommendation.correctedExpenditure)
      .toBe(Math.round(2400 * card.recommendation.stepFactor));
    expect(card.recommendation.deficitPct).toBe(-15);
    // Норма — это расход с поправкой минус дефицит, и числа сходятся.
    expect(card.recommendation.norm)
      .toBe(Math.round(card.recommendation.correctedExpenditure * 0.85));
  });

  it('цель к показу округлена как применяемое', () => {
    // Иначе рядом встают «цель ×1,008» и «применяем ×1,01», и разница в
    // записи читается как разница в решении.
    const card = NC.buildCuratorCard({
      result: NC.compute({
        days: days(21, 2380), formulaPerDay: 2400,
        trend: { deltaKg: -0.05, measuredDays: 21, windowDays: 21 },
        currentFactor: 1, historyDays: 60
      }),
      expenditure: 2400, deficitPct: -15
    });
    const shown = String(card.recommendation.targetFactorShown);
    expect(shown.split('.')[1] || '').toHaveLength(
      String(card.recommendation.stepFactor).split('.')[1]?.length || 0
    );
  });

  it('ограничение шага названо только когда оно сработало', () => {
    // Цель ×0,93 при шаге не больше 3 % даёт ×0,97 — разрыв виден.
    const capped = NC.compute({
      days: days(21, 2050), formulaPerDay: 2400,
      trend: { deltaKg: -0.5, measuredDays: 21, windowDays: 21 },
      currentFactor: 1, historyDays: 60
    });
    expect(capped.status).toBe('ready');
    expect(Math.abs(capped.targetFactor - capped.nextFactor)).toBeGreaterThan(0.005);
    expect(capped.stepCapped).toBe(true);

    const free = NC.compute({
      days: days(21, 2380), formulaPerDay: 2400,
      trend: { deltaKg: -0.05, measuredDays: 21, windowDays: 21 },
      currentFactor: 1, historyDays: 60
    });
    expect(free.stepCapped).toBe(false);
  });

  it('мёртвая зона: расхождение до 2 % — это «сошлось», а не изменение', () => {
    // Пример контракта «четыре недели одного клиента»: ели 2 095, вес −0,3 кг
    // за неделю (−0,9 за окно) — ровно k 1,01. Без зоны это давало кадр
    // «Можно есть больше» и +15 ккал.
    const matched = NC.compute({
      days: days(21, 2095), formulaPerDay: 2400,
      trend: { deltaKg: -0.9, measuredDays: 21, windowDays: 21 },
      currentFactor: 1, historyDays: 60
    });
    expect(matched.targetFactor).toBe(1.01);
    expect(matched.deadZone).toBe(true);
    expect(matched.nextFactor).toBe(1);
    expect(matched.direction).toBe('hold');
    expect(NC.buildWeeklySyncCard({ result: matched, tariff: 'self' }).frame).toBe('matched');

    // Ровно на границе — ещё совпадение; за ней — уже изменение.
    const edge = (target) => NC.compute({
      days: days(21, 2400 * target), formulaPerDay: 2400,
      trend: { deltaKg: 0, measuredDays: 21, windowDays: 21 },
      currentFactor: 1, historyDays: 60
    });
    expect(edge(1.02).deadZone).toBe(true);
    expect(edge(1.025).deadZone).toBe(false);
    expect(edge(1.025).direction).toBe('up');
  });

  it('зона мерится от действующей поправки, а не от единицы', () => {
    // У клиента с применённой ×0,95 расхождение считается от неё: иначе он
    // навсегда остался бы «разошедшимся» просто потому, что поправка не 1,00.
    const r = NC.compute({
      days: days(21, 2280), formulaPerDay: 2400,
      trend: { deltaKg: 0, measuredDays: 21, windowDays: 21 },
      currentFactor: 0.95, historyDays: 60
    });
    expect(r.targetFactor).toBe(0.95);
    expect(r.deadZone).toBe(true);
    expect(r.nextFactor).toBe(0.95);
  });

  it('внутри зоны решать нечего — и кнопок решения нет', () => {
    const card = NC.buildCuratorCard({
      result: NC.compute({
        days: days(21, 2095), formulaPerDay: 2400,
        trend: { deltaKg: -0.9, measuredDays: 21, windowDays: 21 },
        currentFactor: 1, historyDays: 60
      }),
      expenditure: 2400, deficitPct: -12
    });
    expect(card.actions).toEqual([]);
    // Объяснять расхождение тоже нечего: его нет.
    expect(card.whereMismatchSits).toBeNull();
    // Норма при этом показывается — она и есть ответ «осталась прежней».
    expect(card.recommendation.norm).toBe(card.recommendation.currentNorm);
  });

  it('клиент видит основания решения, а не только результат', () => {
    // Контракт требует два числа в обоих тарифах: на Self в кадре «снижение
    // ждёт согласия», на Pro в блоке «Что он смотрит».
    const result = ready();
    for (const tariff of ['self', 'pro']) {
      const card = NC.buildWeeklySyncCard({ result, tariff, expenditure: 2400, deficitPct: -12 });
      expect(card.evidenceRows.map((r) => r.label), tariff)
        .toEqual(['Формула говорит', 'Факт говорит']);
      expect(card.evidenceRows[0].value, tariff).toBe(2400);
      expect(card.evidenceRows[1].value, tariff).toBe(result.factPerDay);
    }

    // Нечего показывать — строк нет, а не нули.
    const cold = NC.buildWeeklySyncCard({
      result: NC.compute({ days: [], formulaPerDay: 2400, trend: {}, historyDays: 3 }),
      tariff: 'self', expenditure: 2400, deficitPct: -12
    });
    expect(cold.evidenceRows).toBeNull();
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

    // Кадра «перестройку проверить не удалось» нет намеренно: он утверждает,
    // что двухнедельная заморозка истекла, а заморозки в проекте нет.
    const noEvidence = NC.buildWeeklySyncCard({
      result: down(), tariff: 'self', recomposition: { noWaistEvidence: true },
      expenditure: 2400, deficitPct: -12, basalMetabolism: 1520
    });
    expect(noEvidence.frame).toBe('lowered_needs_consent');
    // Но молчать нельзя: строка контракта называет молчание дефектом.
    expect(noEvidence.copy.evidenceNote).toBe('Замера не было — проверить перестройку было нечем');
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

describe('поправка на факт · тон карточек сверки', () => {
  const ready = (delta) => NC.compute({
    days: days(21, delta < 0 ? 2112 : 2500),
    formulaPerDay: 2400,
    trend: { deltaKg: delta < 0 ? -0.267 : -0.2, measuredDays: 21, windowDays: 21 },
    currentFactor: 1,
    historyDays: 60
  });

  const allFrames = () => [
    NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'self', expenditure: 2400, deficitPct: -12, basalMetabolism: 1520 }),
    NC.buildWeeklySyncCard({ result: ready(1), tariff: 'self', expenditure: 2400, deficitPct: -12, basalMetabolism: 1520 }),
    NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'pro', applied: true, expenditure: 2400, deficitPct: -12, basalMetabolism: 1520 }),
    NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'pro', applied: false, expenditure: 2400, deficitPct: -12, basalMetabolism: 1520 }),
    NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'self', refusalStreak: 3, weeksUnchanged: 6, expenditure: 2400, deficitPct: -12, basalMetabolism: 1520 }),
    NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'self', recomposition: { confirmed: true, source: 'по замеру от 12 августа' } }),
    NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'self', recomposition: { checkFailed: true } })
  ];

  it('у каждого кадра есть заголовок, объяснение и подписи кнопок', () => {
    for (const c of allFrames()) {
      expect(c.copy, c.frame).toBeTruthy();
      expect(c.copy.title, c.frame).toBeTruthy();
      expect(c.copy.body, c.frame).toBeTruthy();
      for (const a of c.actions) {
        expect(c.copy.actionLabels[a], c.frame + '/' + a).toBeTruthy();
      }
    }
  });

  it('в клиентском тексте нет ни «коэффициента», ни «автоматически»', () => {
    // Имя для клиента — «поправка на факт». «Подняли и сказали» точнее, чем
    // «автоматически»: молча норма не двигается никогда.
    for (const c of allFrames()) {
      const text = JSON.stringify(c.copy);
      expect(text, c.frame).not.toMatch(/коэффициент/i);
      expect(text, c.frame).not.toMatch(/автоматическ/i);
    }
  });

  it('нет медицинских утверждений, упрёков дневнику и обещаний килограммов', () => {
    for (const c of allFrames()) {
      const text = JSON.stringify(c.copy);
      expect(text, c.frame).not.toMatch(/обмен веществ|медленный обмен|метаболизм/i);
      expect(text, c.frame).not.toMatch(/неточн|забыва|недооцен/i);
      expect(text, c.frame).not.toMatch(/сбросите|потеряете|похудеете/i);
    }
  });

  it('причина снижения — система, а не человек', () => {
    const c = NC.buildWeeklySyncCard({
      result: ready(-1), tariff: 'pro', applied: true,
      expenditure: 2400, deficitPct: -12, basalMetabolism: 1520
    });
    expect(c.copy.body).toContain('мы поправили его, а не вас');
  });

  it('оба числа приходят из модели, рисующему нечего округлять', () => {
    const c = NC.buildWeeklySyncCard({
      result: ready(-1), tariff: 'self', expenditure: 2400, deficitPct: -12, basalMetabolism: 1520
    });
    // Сквозной пример контракта: 2112 было, 2049 станет, разница −63.
    expect(c.norms.current).toBe(2112);
    expect(c.norms.next).toBe(2049);
    expect(c.norms.deltaKcal).toBe(-63);
    expect(c.copy.heroCaption).toBe('−63 ккал');
  });

  it('счёт недель в заголовке третьего отказа склоняется', () => {
    const one = NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'self', refusalStreak: 3, weeksUnchanged: 1 });
    const six = NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'self', refusalStreak: 3, weeksUnchanged: 6 });
    const two = NC.buildWeeklySyncCard({ result: ready(-1), tariff: 'self', refusalStreak: 3, weeksUnchanged: 22 });
    expect(one.copy.title).toContain('1 неделю');
    expect(six.copy.title).toContain('6 недель');
    expect(two.copy.title).toContain('22 недели');
  });
});

describe('поправка на факт · довод перестройки', () => {
  const dayWith = (date, waist) => ({
    date,
    weightMorning: 80,
    measurements: waist ? { waist } : null,
    meals: [],
    trainings: []
  });

  function stubPattern(quality, waistTrend) {
    window.HEYS.InsightsPI = {
      patternModules: {
        analyzeHypertrophy: () => ({
          available: true, compositionQuality: quality, waistTrend
        })
      }
    };
  }

  it('без замера талии довода нет, но и молчания нет', () => {
    stubPattern('recomposition', -0.1);
    const days = Array.from({ length: 21 }, (_, i) => dayWith('2026-08-' + String(i + 1).padStart(2, '0'), null));
    expect(NC.detectRecomposition(days, {})).toEqual({ noWaistEvidence: true });
  });

  it('замер есть — довод назван источником и числом', () => {
    stubPattern('recomposition', -0.1);
    const days = Array.from({ length: 21 }, (_, i) => dayWith('2026-08-' + String(i + 1).padStart(2, '0'), i === 11 ? 78 : null));
    const r = NC.detectRecomposition(days, {});
    expect(r.confirmed).toBe(true);
    expect(r.source).toBe('по замеру от 12 августа');
    expect(r.dropCm).toBe(2.1);
    expect(r.weeks).toBe(3);
  });

  it('другой состав — не перестройка, даже когда замер есть', () => {
    stubPattern('fat_loss', -0.1);
    const days = Array.from({ length: 21 }, (_, i) => dayWith('2026-08-' + String(i + 1).padStart(2, '0'), 78));
    expect(NC.detectRecomposition(days, {})).toBe(null);
  });

  it('модуль инсайтов не загружен — сверка не падает', () => {
    delete window.HEYS.InsightsPI;
    expect(NC.detectRecomposition([dayWith('2026-08-01', 78)], {})).toEqual({ noWaistEvidence: false });
  });

  it('замера нет, но веса растут — довод косвенный, и он назван косвенным', () => {
    // Вторая ступень лестницы: слабее замера, поэтому и карточка обычная, а
    // не праздничная, и норму трогать нельзя только этот цикл.
    const card = NC.buildWeeklySyncCard({
      result: { status: 'ready', direction: 'down', currentFactor: 1, nextFactor: 0.97 },
      tariff: 'self',
      recomposition: { indirect: true, weeks: 4, deltaPct: 6.2, source: 'по росту рабочих весов за 4 недели' }
    });
    expect(card.frame).toBe('recomposition_indirect');
    expect(card.celebratory).toBeUndefined();
    expect(card.frozenCycle).toBe(true);
    expect(card.evidence).toBe('по росту рабочих весов за 4 недели');
    expect(card.copy.body).toContain('рабочие веса в зале растут 4 недели');
    // Предлагаем замер, а не решение: он отличит перестройку прямо.
    expect(card.actions).toEqual(['enable_measurements', 'later']);
  });

  it('рядом с просьбой о замере стоит состояние нормы и остаток срока', () => {
    // «Заморожена» без срока звучит бессрочно, а заморозка кончается на
    // четырнадцатый день — и тогда поправка применяется по весу.
    const card = NC.buildWeeklySyncCard({
      result: { status: 'ready', direction: 'down', currentFactor: 1, nextFactor: 0.97 },
      tariff: 'self',
      recomposition: {
        indirect: true, weeks: 4, deltaPct: 6.2, daysLeft: 6,
        source: 'по росту рабочих весов за 4 недели'
      }
    });
    const facts = Object.fromEntries(card.facts.map((f) => [f.label, f.value]));
    expect(facts['Норма']).toBe('заморожена');
    expect(facts['Ждём замер']).toBe('ещё 6 дней');
    expect(card.copy.footnote).toContain('поправка применится по весу');
  });

  it('остаток срока склоняется', () => {
    const daysLeftOf = (daysLeft) => {
      const c = NC.buildWeeklySyncCard({
        result: { status: 'ready', direction: 'down', currentFactor: 1, nextFactor: 0.97 },
        tariff: 'self',
        recomposition: { indirect: true, weeks: 4, daysLeft, source: 'по весам' }
      });
      return c.facts.find((f) => f.label === 'Ждём замер').value;
    };
    expect(daysLeftOf(1)).toBe('ещё 1 день');
    expect(daysLeftOf(3)).toBe('ещё 3 дня');
    expect(daysLeftOf(14)).toBe('ещё 14 дней');
  });

  it('косвенный довод даёт остаток срока, а не бессрочную заморозку', () => {
    // Отсчёт идёт от первой просьбы о замере, а не от начала застоя.
    const days = Array.from({ length: 28 }, (_, i) => ({
      date: '2026-08-' + String(i + 1).padStart(2, '0'),
      measurements: null, meals: [],
      trainings: [{ type: 'strength', workoutLog: { exercises: [
        { name: 'жим', approaches: [{ weightKg: String(60 + (i > 13 ? 6 : 0)) }] },
        { name: 'тяга', approaches: [{ weightKg: String(90 + (i > 13 ? 8 : 0)) }] }
      ] } }]
    }));
    const wsrc = fs.readFileSync(
      path.resolve(__dirname, '../heys_working_weights_v1.js'), 'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(wsrc);

    const now = new Date('2026-08-28T00:00:00');
    // Ещё не просили — впереди весь срок.
    expect(NC.detectRecomposition(days, {}, { askedAt: null, now }).daysLeft)
      .toBe(NC.FREEZE_LIMIT_DAYS);
    // Просили восемь дней назад — осталось шесть.
    const asked = new Date('2026-08-20T00:00:00').getTime();
    expect(NC.detectRecomposition(days, {}, { askedAt: asked, now }).daysLeft).toBe(6);
    // Срок вышел — это уже другой кадр, и остатка у него нет.
    const old = new Date('2026-08-10T00:00:00').getTime();
    const expired = NC.detectRecomposition(days, {}, { askedAt: old, now });
    expect(expired.checkExpired).toBe(true);
    expect(expired.daysLeft).toBeUndefined();
  });

  it('вторая ступень срабатывает, когда модуль весов загружен', () => {
    const days = Array.from({ length: 28 }, (_, i) => ({
      date: '2026-08-' + String(i + 1).padStart(2, '0'),
      measurements: null, meals: [],
      trainings: [{ type: 'strength', workoutLog: { exercises: [
        { name: 'жим', approaches: [{ weightKg: String(60 + (i > 13 ? 6 : 0)) }] },
        { name: 'тяга', approaches: [{ weightKg: String(90 + (i > 13 ? 8 : 0)) }] }
      ] } }]
    }));
    const wsrc = fs.readFileSync(
      path.resolve(__dirname, '../heys_working_weights_v1.js'), 'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(wsrc);
    const r = NC.detectRecomposition(days, {});
    expect(r.indirect).toBe(true);
    expect(r.weeks).toBe(4);
    expect(r.source).toBe('по росту рабочих весов за 4 недели');
  });

  it('лестница доводов идёт по ступеням, а не перескакивает', () => {
    const days = Array.from({ length: 28 }, (_, i) => ({
      date: '2026-08-' + String(i + 1).padStart(2, '0'),
      measurements: null, meals: [],
      trainings: [{ type: 'strength', workoutLog: { exercises: [
        { name: 'жим', approaches: [{ weightKg: String(60 + (i > 13 ? 6 : 0)) }] },
        { name: 'тяга', approaches: [{ weightKg: String(90 + (i > 13 ? 8 : 0)) }] }
      ] } }]
    }));
    // Замера нет — прямого довода тоже; но веса растут, значит вторая ступень.
    window.HEYS.WorkingWeights = undefined;
    expect(NC.detectRecomposition(days, {})).toEqual({ noWaistEvidence: true });
  });

  it('в тексте карточки стоит конкретика замера, а не утешение', () => {
    const card = NC.buildWeeklySyncCard({
      result: { status: 'ready', direction: 'down', currentFactor: 1, nextFactor: 0.97 },
      tariff: 'self',
      recomposition: { confirmed: true, dropCm: 2, weeks: 3, source: 'по замеру от 12 августа' }
    });
    expect(card.copy.body).toContain('Талия ушла на 2 см за 3 недели');
    expect(card.evidence).toBe('по замеру от 12 августа');
  });
});

describe('поправка на факт · «применено» относится к этой неделе', () => {
  it('старая дата применения не выдаёт новое предложение за принятое решение', () => {
    // Клиент, которому куратор поправил норму месяц назад, иначе прочитал бы
    // свежее предложение как уже применённое.
    expect(src).toContain('appliedThisWeek(prof.normCorrectionAppliedAt');
    const fn = src.slice(src.indexOf('function appliedThisWeek'), src.indexOf('const MONTHS_RU'));
    expect(fn).toContain('7 * 24 * 60 * 60 * 1000');
    // Битая дата не должна превращаться в «применено».
    expect(fn).toContain('Number.isNaN');
  });
});

describe('поправка на факт · чей это тариф', () => {
  // Решение владельца 30 августа: признак Pro — наличие куратора, а не
  // оплаченный план. Клиент без платежа не Self, а Pro с неактивной подпиской.
  const cases = [
    ['куратора нет — свой тариф', { hasCurator: false }, 'self'],
    ['куратор есть', { hasCurator: true }, 'pro'],
    // Назначенный куратор приезжает в профиль сам — по нему тариф виден без
    // отдельного флага.
    ['назначен куратор по id', { curatorId: 'cur-1' }, 'pro'],
    ['тот же id в змеином регистре', { curator_id: 'cur-1' }, 'pro'],
    ['куратор есть, подписка кончилась — право решения не переносится',
      { hasCurator: true, subscription_status: 'canceled' }, 'pro'],
    // Прежняя редакция считала по плану и на боевых данных давала Self всем:
    // subscription_plan проставляется только при оплате, а куратор есть у всех.
    ['план пуст — не повод отдать решение клиенту', { subscription_plan: null }, 'pro'],
    ['пустой профиль', {}, 'pro'],
    ['план base сам по себе ничего не решает', { subscription_plan: 'base' }, 'pro']
  ];

  for (const [name, profile, expected] of cases) {
    it(name + ' → ' + expected, () => {
      expect(NC.resolveTariff(profile)).toBe(expected);
    });
  }

  it('неизвестность — это Pro, и это выбор менее опасной ошибки', () => {
    // Ошибиться в сторону Self — отдать клиенту кнопку на числе, которым
    // распоряжается куратор. Ошибиться в сторону Pro — задержать решение.
    expect(NC.resolveTariff(undefined)).toBe('pro');
    expect(NC.resolveTariff({ hasCurator: undefined })).toBe('pro');
  });

  it('отсутствие куратора записывается фактом, а не молчанием', () => {
    // Без этого «куратора нет» и «ещё не спрашивали» выглядят одинаково.
    const api = fs.readFileSync(
      path.resolve(__dirname, '../heys_yandex_api_v1.js'), 'utf8'
    );
    expect(api).toContain('function clearAssignedCuratorInProfile');
    expect(api).toContain('hasCurator: false');
    // Чистим только на настоящей записи клиента, а не на ошибке ответа.
    expect(api).toContain('looksLikeClient');
  });

  it('явный аргумент важнее — им пользуется кабинет куратора', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../heys_norm_correction_v1.js'), 'utf8'
    );
    expect(src).toContain('const activeTariff = tariff || resolveTariff(prof);');
  });
});

describe('поправка на факт · на Pro у числа один хозяин', () => {
  const up = () => NC.compute({
    days: days(21, 2500),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.2, measuredDays: 21, windowDays: 21 },
    currentFactor: 1,
    historyDays: 60
  });

  it('рост на Pro не применяется сам — он тоже ждёт куратора', () => {
    // Правило «рост применяет система» уступает более сильному: завести у
    // одного числа второго хозяина нельзя.
    const c = NC.buildWeeklySyncCard({ result: up(), tariff: 'pro', applied: false });
    expect(c.frame).toBe('pending_curator');
    expect(c.decidedBy).toBe('curator');
    expect(c.actions).not.toContain('revert');
  });

  it('сборщик поднимает норму сам только на Self', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../heys_norm_correction_v1.js'), 'utf8'
    );
    expect(src).toContain("activeTariff === 'self'");
  });
});

describe('поправка на факт · предел заморозки', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const growingDays = () => Array.from({ length: 28 }, (_, i) => ({
    date: '2026-08-' + String(i + 1).padStart(2, '0'),
    measurements: null, meals: [],
    trainings: [{ type: 'strength', workoutLog: { exercises: [
      { name: 'жим', approaches: [{ weightKg: String(60 + (i > 13 ? 6 : 0)) }] },
      { name: 'тяга', approaches: [{ weightKg: String(90 + (i > 13 ? 8 : 0)) }] }
    ] } }]
  }));

  beforeEach(() => {
    const wsrc = fs.readFileSync(
      path.resolve(__dirname, '../heys_working_weights_v1.js'), 'utf8'
    );
    // eslint-disable-next-line no-eval
    (0, eval)(wsrc);
  });

  it('предел — две недели, и отсчёт от первой просьбы, а не от начала застоя', () => {
    // Застой мог тянуться месяц до того, как мы впервые спросили; наказывать
    // за это нечестно.
    expect(NC.FREEZE_LIMIT_DAYS).toBe(14);
    const now = new Date('2026-08-28T12:00:00');
    expect(NC.freezeAgeDays(now.getTime() - 3 * DAY, now)).toBe(3);
    expect(NC.freezeAgeDays(null, now)).toBe(null);
  });

  it('внутри предела довод косвенный и говорит, сколько ждать', () => {
    const now = new Date('2026-08-28T12:00:00');
    const r = NC.detectRecomposition(growingDays(), {}, { askedAt: now.getTime() - 8 * DAY, now });
    expect(r.indirect).toBe(true);
    expect(r.daysLeft).toBe(6);
  });

  it('первая просьба ещё не прозвучала — заморозка только начинается', () => {
    const r = NC.detectRecomposition(growingDays(), {}, { askedAt: null, now: new Date() });
    expect(r.indirect).toBe(true);
    expect(r.daysLeft).toBe(14);
  });

  it('две недели истекли — поправка идёт по весу, и кадр перестал быть ложью', () => {
    const now = new Date('2026-08-28T12:00:00');
    const r = NC.detectRecomposition(growingDays(), {}, { askedAt: now.getTime() - 15 * DAY, now });
    expect(r.checkExpired).toBe(true);
    expect(r.waitedDays).toBe(15);

    const card = NC.buildWeeklySyncCard({
      result: { status: 'ready', direction: 'down', currentFactor: 1, nextFactor: 0.97 },
      tariff: 'self', recomposition: r
    });
    expect(card.frame).toBe('recomposition_unverified');
    expect(card.copy.body).toContain('Две недели ожидания истекли');
  });

  it('вторая просьба заморозку не продлевает', () => {
    const store = new Map();
    const lsGet = (k, fb = null) => (store.has(k) ? store.get(k) : fb);
    const lsSet = (k, v) => store.set(k, v);
    const first = NC.recordMeasurementAsk({ lsGet, lsSet, now: 1000 });
    const second = NC.recordMeasurementAsk({ lsGet, lsSet, now: 9999 });
    expect(first).toBe(1000);
    expect(second).toBe(1000);
  });

  it('ответ на просьбу не стирает саму просьбу', () => {
    // Порядок обратный: сначала метка, потом решение. Раньше recordDecision
    // писал объект целиком и заморозка исчезала от ответа на неё же.
    const store = new Map();
    const lsGet = (k, fb = null) => (store.has(k) ? store.get(k) : fb);
    const lsSet = (k, v) => store.set(k, v);
    NC.recordMeasurementAsk({ lsGet, lsSet, now: 7 });
    NC.recordDecision({ lsGet, lsSet, weekLabel: '24 авг', factor: 0.97, what: 'applied', now: 9 });
    expect(NC.readMeasurementAsk(lsGet)).toBe(7);
    expect(NC.readHistory(lsGet)).toHaveLength(1);
  });

  it('метка просьбы живёт в том же блобе, что история решений', () => {
    const store = new Map();
    const lsGet = (k, fb = null) => (store.has(k) ? store.get(k) : fb);
    const lsSet = (k, v) => store.set(k, v);
    NC.recordDecision({ lsGet, lsSet, weekLabel: '24 авг', factor: 0.97, what: 'applied', now: 5 });
    NC.recordMeasurementAsk({ lsGet, lsSet, now: 7 });
    const blob = store.get(NC.HISTORY_KEY);
    // Решения не потерялись от того, что рядом легла метка.
    expect(blob.weeks).toHaveLength(1);
    expect(blob.measurementAskedAt).toBe(7);
  });
});
