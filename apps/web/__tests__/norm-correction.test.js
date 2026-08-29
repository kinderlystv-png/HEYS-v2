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
