// Лист «Отчёты по месяцам и неделям» считал по своим правилам, расходясь с
// зоной в двух местах:
//
// 1. Объект дня в buildWeekReport не содержал isIncomplete/isFastingDay/isFuture,
//    хотя общий предикат shouldIncludeDay их читает — предикат работал вхолостую.
//    Вдобавок сам предикат судит «неполный» только про сегодняшний день, а
//    пометку «не заполнял» человек ставит и на прошлые: такой день попадал и в
//    «учтено N дней», и в средние, хотя вкладка его выбрасывает.
//
// 2. Средний вес считался по любому weightMorning, включая расчётный —
//    подставленный, когда человек не взвесился. Это было единственное место в
//    проекте без такого фильтра. При отсутствии взвешиваний средний вес молча
//    подменялся весом из профиля, и соседний период сравнивался с константой.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const weeklySrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_weekly_reports_v2.js'),
  'utf8'
);
const matrixSrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_discipline_matrix_v1.js'),
  'utf8'
);
const serviceSrc = fs.readFileSync(
  path.resolve(__dirname, '../heys_monthly_reports_service_v1.js'),
  'utf8'
);

// Неделя целиком в прошлом: сегодняшний день в неё не попадает, и правило
// «неполный сегодня» не мешает проверять правило «помечен не заполнял».
const PAST_WEEK = [
  '2020-01-06', '2020-01-07', '2020-01-08', '2020-01-09',
  '2020-01-10', '2020-01-11', '2020-01-12'
];

const MEALS = [{ items: [{ name: 'x', grams: 100 }] }];

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Понедельник–воскресенье текущей недели, как их считает сервис.
function currentWeekDates() {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return fmt(d);
  });
}

describe('лист отчётов · день, помеченный «не заполнял»', () => {
  let store;

  beforeEach(() => {
    store = new Map();
    window.HEYS = {
      SparklinesShared: { getWeekDates: () => PAST_WEEK.slice() },
      dayNorm: { resolve: () => ({ kcal: 2000 }) },
      dayUtils: { getDayTdee: () => ({ tdee: 2500 }) }
    };
    // eslint-disable-next-line no-eval
    (0, eval)(weeklySrc);
  });

  const lsGet = (key, fallback = null) => (store.has(key) ? store.get(key) : fallback);

  function seed(dates, dayFor) {
    dates.forEach((d, i) => store.set(`heys_dayv2_${d}`, Object.assign({ date: d }, dayFor(d, i))));
  }

  function build() {
    return window.HEYS.weeklyReports.buildWeekReport({
      dateStr: PAST_WEEK[0],
      lsGet,
      profile: { weight: 90 },
      pIndex: null,
      filterEmptyDays: true
    });
  }

  it('объект дня наконец несёт поля, которые читает общий предикат', () => {
    seed(PAST_WEEK, () => ({ meals: MEALS, dayTot: { kcal: 2000 } }));
    const row = build().days[0];
    expect(row).toHaveProperty('isIncomplete');
    expect(row).toHaveProperty('isFastingDay');
    expect(row).toHaveProperty('isFuture');
  });

  it('помеченный день не идёт ни в счёт дней, ни в средние', () => {
    // Шесть полных дней по 2000 и один помеченный с 200 ккал.
    seed(PAST_WEEK, (d, i) => (i === 3
      ? { meals: MEALS, dayTot: { kcal: 200 }, isIncomplete: true }
      : { meals: MEALS, dayTot: { kcal: 2000 } }));

    const report = build();
    // Раньше было 7 дней и среднее 1743 — помеченный день тянул вниз.
    expect(report.daysWithData).toBe(6);
    expect(report.avgKcal).toBe(2000);
  });

  it('уставка дня сохраняется, и плитка «план» — её среднее', () => {
    // Инвариант против третьей формулы: строка дня и плитка обязаны показывать
    // одно и то же число. Раньше строка считала свой процент из нормы и затрат,
    // и «−10 %» в плитке спорил с «−14 %» в строке того же дня.
    seed(PAST_WEEK, () => ({ meals: MEALS, dayTot: { kcal: 2000 } }));
    const report = build();

    const perDay = report.days
      .map((d) => d.targetDeficitPct)
      .filter((v) => Number.isFinite(v));
    expect(perDay.length).toBe(7);

    const mean = perDay.reduce((s, v) => s + v, 0) / perDay.length;
    expect(report.targetDeficitPct).toBe(Math.round(mean));
  });

  it('два счётчика: записи считаются шире еды, но средние делит еда', () => {
    // Общий предикат зоны берём настоящий, а не свой: смысл правки в том, что
    // обе вкладки считают дни одинаково.
    // eslint-disable-next-line no-eval
    (0, eval)(matrixSrc);
    expect(typeof window.HEYS.DisciplineMatrix.hasAnyData).toBe('function');

    // Четыре дня с едой по 2000 и три дня, где человек вёл только вес и сон.
    seed(PAST_WEEK, (d, i) => (i < 4
      ? { meals: MEALS, dayTot: { kcal: 2000 } }
      : { weightMorning: 90, sleepStart: '23:00', sleepEnd: '07:00' }));

    const report = build();
    expect(report.daysWithData).toBe(4);
    expect(report.daysWithRecords).toBe(7);
    // Главное: дни без еды не попали в знаменатель «съедено в среднем».
    expect(report.avgKcal).toBe(2000);
  });

  it('норма БЖУ считается для самого дня, а не для пустого', () => {
    // Раньше движок звали без контекста дня: вес брался из профиля вместо
    // утреннего, и тренировочный бонус к белку не применялся никогда — норма
    // в отчёте расходилась с той, что человек видел в дне.
    const seen = [];
    window.HEYS.dayCalculations = {
      computeDailyNorms: (optimum, normPerc, ctx) => {
        seen.push(ctx);
        return { prot: 100, fat: 60, carbs: 200 };
      }
    };
    seed(PAST_WEEK, (d, i) => ({
      meals: MEALS,
      dayTot: { kcal: 2000 },
      weightMorning: 90 + i,
      trainings: [{ type: 'strength' }]
    }));
    build();

    expect(seen.length).toBe(7);
    expect(seen.every((c) => c && c.day)).toBe(true);
    // День приходит именно тот, а не любой: утренний вес растёт по дням.
    expect(seen.map((c) => c.day.weightMorning)).toEqual([90, 91, 92, 93, 94, 95, 96]);
    expect(seen[0].profile).toBeTruthy();
  });

  it('голодный день остаётся в расчёте — это осознанный режим, а не пропуск', () => {
    seed(PAST_WEEK, (d, i) => (i === 2
      ? { meals: MEALS, dayTot: { kcal: 600 }, isFastingDay: true }
      : { meals: MEALS, dayTot: { kcal: 2000 } }));

    expect(build().daysWithData).toBe(7);
  });
});

describe('лист отчётов · средний вес', () => {
  let store;
  let dates;

  beforeEach(() => {
    store = new Map();
    dates = currentWeekDates();
    window.HEYS = {
      utils: { lsGet: (key, fallback = null) => (store.has(key) ? store.get(key) : fallback) },
      // Сервис берёт дни из хранилища сам; отчёт недели подменяем, чтобы
      // проверять ровно расчёт веса, а не арифметику калорий.
      weeklyReports: {
        buildWeekReport: () => ({
          daysWithData: 7,
          days: dates.map((d) => ({ dateStr: d, hasMeals: true, ratio: 1 }))
        })
      }
    };
    // eslint-disable-next-line no-eval
    (0, eval)(serviceSrc);
  });

  function seedWeights(dayFor) {
    dates.forEach((d, i) => store.set(`heys_dayv2_${d}`, Object.assign(
      { date: d, meals: MEALS }, dayFor(d, i)
    )));
  }

  function weekReport() {
    return window.HEYS.monthlyReportsService
      .buildMonthlyWeeks({ weeksCount: 1, useCache: false })[0].report;
  }

  it('измеренные веса усредняются как прежде', () => {
    seedWeights(() => ({ weightMorning: 90, weightMorningSource: 'measured' }));
    expect(weekReport().avgWeight).toBe(90);
  });

  it('вес, помеченный расчётным, в среднее не идёт', () => {
    seedWeights((d, i) => (i < 3
      ? { weightMorning: 90, weightMorningSource: 'measured' }
      : { weightMorning: 60, weightMorningEstimated: true }));
    // Раньше среднее уехало бы к 72,9 — на четырёх подставленных значениях.
    expect(weekReport().avgWeight).toBe(90);
  });

  it('вес из среднего трёх взвешиваний и вес из профиля тоже не идут', () => {
    seedWeights((d, i) => {
      if (i === 0) return { weightMorning: 90, weightMorningSource: 'measured' };
      if (i % 2) return { weightMorning: 60, weightMorningSource: 'estimated_avg' };
      return { weightMorning: 50, weightMorningSource: 'estimated_profile' };
    });
    expect(weekReport().avgWeight).toBe(90);
  });

  it('ни одного взвешивания — прочерк, а не вес из профиля', () => {
    store.set('heys_profile', { weight: 88 });
    seedWeights(() => ({ weightMorning: 70, weightMorningEstimated: true }));
    // Ноль значит «нечего показать»: карточка рисует прочерк и не ставит стрелку.
    expect(weekReport().avgWeight).toBe(0);
  });

  it('месяц считается по дням: порог достижим, средние взвешены по дням', () => {
    // Шестнадцать недель подряд с записями. Раньше месяц собирался из недель
    // по их понедельнику при календарном знаменателе, и у месяца, начинающегося
    // с воскресенья, доля упиралась примерно в 80 % — порог «≥86 %» был
    // недостижим при любой дисциплине.
    const now = new Date();
    const dow = now.getDay();
    const monday0 = new Date(now);
    monday0.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));

    const seeded = new Set();
    for (let w = 0; w < 16; w++) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday0);
        d.setDate(monday0.getDate() - 7 * w + i);
        const key = fmt(d);
        if (d > now) continue;
        seeded.add(key);
        store.set(`heys_dayv2_${key}`, {
          date: key, meals: MEALS, weightMorning: 90, weightMorningSource: 'measured'
        });
      }
    }

    window.HEYS.weeklyReports.buildWeekReport = ({ dateStr }) => {
      const monday = new Date(dateStr);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const key = fmt(d);
        const has = seeded.has(key);
        return {
          dateStr: key,
          hasMeals: has,
          hasAnyRecord: has,
          isCounted: has,
          ratio: 1,
          burned: 2500,
          targetDeficitPct: -12,
          totals: { kcal: 2000, prot: 120, fat: 70, carbs: 200 },
          normAbs: { prot: 130, fat: 70, carbs: 210 }
        };
      });
      return { daysWithData: days.filter((d) => d.isCounted).length, days };
    };

    const months = window.HEYS.monthlyReportsService
      .buildMonthlyMonths({ weeksCount: 16, useCache: false });
    expect(months.length).toBeGreaterThan(0);

    // Месяц, все календарные дни которого засеяны, обязан дать полноту 1 —
    // и заодно доказать, что стык недель делится по дням, а не по понедельнику.
    const full = months.filter((m) => {
      const [y, mo] = m.monthKey.split('-').map(Number);
      const inMonth = new Date(y, mo, 0).getDate();
      for (let day = 1; day <= inMonth; day++) {
        if (!seeded.has(`${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`)) return false;
      }
      return true;
    });
    expect(full.length).toBeGreaterThan(0);
    full.forEach((m) => {
      expect(m.report.completenessRatio).toBe(1);
      // Порог надёжности месяцев — 6/7 ≈ 0,857. Теперь он берётся.
      expect(m.report.completenessRatio).toBeGreaterThanOrEqual(6 / 7);
      expect(m.report.daysWithRecords).toBe(m.report.totalDaysPossible);
    });

    // Средние взвешены по дням: все дни одинаковы, значит и месяц равен дню,
    // независимо от того, сколько дней месяца попало в какую неделю.
    months.forEach((m) => {
      expect(m.report.avgKcal).toBe(2000);
      expect(m.report.avgWeight).toBe(90);
      expect(m.report.targetDeficitPct).toBe(-12);
    });
  });

  it('дни месяца не задваиваются на стыке недель', () => {
    const now = new Date();
    const dow = now.getDay();
    const monday0 = new Date(now);
    monday0.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
    const seeded = new Set();
    for (let w = 0; w < 8; w++) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday0);
        d.setDate(monday0.getDate() - 7 * w + i);
        if (d > now) continue;
        const key = fmt(d);
        seeded.add(key);
        store.set(`heys_dayv2_${key}`, { date: key, meals: MEALS });
      }
    }
    window.HEYS.weeklyReports.buildWeekReport = ({ dateStr }) => {
      const monday = new Date(dateStr);
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const key = fmt(d);
        const has = seeded.has(key);
        return { dateStr: key, hasMeals: has, hasAnyRecord: has, isCounted: has, ratio: 1 };
      });
      return { daysWithData: days.filter((d) => d.isCounted).length, days };
    };

    const months = window.HEYS.monthlyReportsService
      .buildMonthlyMonths({ weeksCount: 8, useCache: false });

    months.forEach((m) => {
      const dates = m.report.days.map((d) => d.dateStr);
      expect(new Set(dates).size).toBe(dates.length);
      // И каждый день принадлежит своему календарному месяцу, а не месяцу
      // понедельника своей недели.
      dates.forEach((d) => expect(d.slice(0, 7)).toBe(m.monthKey));
      expect(m.report.daysWithRecords).toBeLessThanOrEqual(m.report.totalDaysPossible);
    });
  });
});
