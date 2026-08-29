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

  it('неделя без взвешиваний не тянет средний вес месяца к нулю', () => {
    // Восемь недель: в чётных вес измерен, в нечётных только расчётный.
    const now = new Date();
    const dow = now.getDay();
    const monday0 = new Date(now);
    monday0.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));

    const allDates = [];
    for (let w = 0; w < 8; w++) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday0);
        d.setDate(monday0.getDate() - 7 * w + i);
        allDates.push({ key: fmt(d), week: w });
      }
    }
    allDates.forEach(({ key, week }) => {
      store.set(`heys_dayv2_${key}`, week % 2 === 0
        ? { date: key, meals: MEALS, weightMorning: 90, weightMorningSource: 'measured' }
        : { date: key, meals: MEALS, weightMorning: 60, weightMorningEstimated: true });
    });
    window.HEYS.weeklyReports.buildWeekReport = ({ dateStr }) => {
      const monday = new Date(dateStr);
      return {
        daysWithData: 7,
        days: Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          return { dateStr: fmt(d), hasMeals: true, ratio: 1 };
        })
      };
    };

    const svc = window.HEYS.monthlyReportsService;
    const weeks = svc.buildMonthlyWeeks({ weeksCount: 8, useCache: false });
    const months = svc.buildMonthlyMonths({ weeksCount: 8, useCache: false });
    expect(months.length).toBeGreaterThan(0);

    // Проверка не должна проходить вхолостую: хотя бы у одного месяца должна
    // быть и измеренная неделя, и неизмеренная — иначе защита не сработала бы
    // ни разу и тест ничего не доказывает.
    const mixed = months.some((month) => {
      const mine = weeks.filter((w) => w.monday.slice(0, 7) === month.monthKey);
      const measured = mine.filter((w) => w.report.avgWeight > 0).length;
      return measured > 0 && measured < mine.length;
    });
    expect(mixed).toBe(true);

    // Ожидание считаем из тех же недель: месяц — среднее только по неделям,
    // где вес вообще измеряли. Нулевые в знаменатель не идут.
    months.forEach((month) => {
      const mine = weeks.filter((w) => w.monday.slice(0, 7) === month.monthKey);
      const measured = mine.map((w) => w.report.avgWeight).filter((v) => v > 0);
      const expected = measured.length
        ? Math.round(measured.reduce((s, v) => s + v, 0) / measured.length * 10) / 10
        : 0;
      expect(month.report.avgWeight).toBe(expected);
      // И главное: пока хоть одна неделя измерена, ноль в месяце невозможен.
      if (measured.length) expect(month.report.avgWeight).toBeGreaterThan(0);
    });
  });
});
