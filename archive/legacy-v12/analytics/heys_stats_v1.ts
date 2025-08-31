// heys_stats_v1.ts — предагрегация и быстрые вычисления статистик по дням (TypeScript version)

import type {
  HEYSGlobal,
  HEYSStats,
  DayRecord,
  DayAggregation,
  TrendData,
  WeeklyStats,
  MealTotals,
  Product,
} from './types/heys';

// Global declarations
declare global {
  interface Window {
    HEYS: HEYSGlobal;
  }
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || ({} as HEYSGlobal));
  const Stats: HEYSStats = {} as HEYSStats;

  // Utility functions
  function round1(x: number): number {
    return Math.round((+x || 0) * 10) / 10;
  }

  function isValidDay(day: any): day is DayRecord {
    return day && typeof day === 'object' && Array.isArray(day.meals);
  }

  function getProducts(): Product[] {
    return HEYS.products && HEYS.products.getAll ? HEYS.products.getAll() : [];
  }

  function calculateDayTotals(day: DayRecord): MealTotals {
    if (!isValidDay(day) || !day.meals.length) {
      return {
        kcal: 0,
        prot: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        simple: 0,
        complex: 0,
        bad: 0,
        good: 0,
        trans: 0,
        fiber: 0,
      };
    }

    const products = getProducts();
    const index = HEYS.models ? HEYS.models.buildProductIndex(products) : null;

    if (!index || !HEYS.models?.mealTotals) {
      return {
        kcal: 0,
        prot: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        simple: 0,
        complex: 0,
        bad: 0,
        good: 0,
        trans: 0,
        fiber: 0,
      };
    }

    // Суммируем все приемы пищи за день
    let totalKcal = 0,
      totalProt = 0,
      totalFat = 0,
      totalCarbs = 0;
    let totalSimple = 0,
      totalComplex = 0,
      totalBad = 0,
      totalGood = 0,
      totalTrans = 0,
      totalFiber = 0;

    for (const meal of day.meals) {
      try {
        const mealTotals = HEYS.models.mealTotals(meal, index);
        totalKcal += mealTotals.kcal || 0;
        totalProt += mealTotals.prot || 0;
        totalFat += mealTotals.fat || 0;
        totalCarbs += mealTotals.carbs || 0;
        totalSimple += mealTotals.simple || 0;
        totalComplex += mealTotals.complex || 0;
        totalBad += mealTotals.bad || 0;
        totalGood += mealTotals.good || 0;
        totalTrans += mealTotals.trans || 0;
        totalFiber += mealTotals.fiber || 0;
      } catch (e) {
        console.warn('Error calculating meal totals:', e);
      }
    }

    return {
      kcal: round1(totalKcal),
      prot: round1(totalProt),
      protein: round1(totalProt), // Alias for compatibility
      fat: round1(totalFat),
      carbs: round1(totalCarbs),
      simple: round1(totalSimple),
      complex: round1(totalComplex),
      bad: round1(totalBad),
      good: round1(totalGood),
      trans: round1(totalTrans),
      fiber: round1(totalFiber),
    };
  }

  // Агрегировать массив дней в сводные показатели
  Stats.aggregateDays = function (daysArr: DayRecord[]): DayAggregation {
    const res: DayAggregation = {
      totalKcal: 0,
      totalProt: 0,
      totalFat: 0,
      totalCarbs: 0,
      days: 0,
      avgKcal: 0,
      avgProt: 0,
      avgFat: 0,
      avgCarbs: 0,
    };

    if (!Array.isArray(daysArr) || !daysArr.length) return res;

    let validDaysCount = 0;

    for (const day of daysArr) {
      if (!isValidDay(day)) continue;

      const dayTotals = calculateDayTotals(day);

      res.totalKcal += dayTotals.kcal;
      res.totalProt += dayTotals.prot;
      res.totalFat += dayTotals.fat;
      res.totalCarbs += dayTotals.carbs;
      validDaysCount++;
    }

    res.days = validDaysCount;

    if (validDaysCount > 0) {
      res.avgKcal = round1(res.totalKcal / validDaysCount);
      res.avgProt = round1(res.totalProt / validDaysCount);
      res.avgFat = round1(res.totalFat / validDaysCount);
      res.avgCarbs = round1(res.totalCarbs / validDaysCount);
    }

    return res;
  };

  // Быстрое получение средних за последние N дней
  Stats.getRecentAverage = function (daysCount: number = 7): DayAggregation {
    try {
      const recentDays: DayRecord[] = [];
      const today = new Date();

      for (let i = 0; i < daysCount; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr =
          date.getFullYear() +
          '-' +
          String(date.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(date.getDate()).padStart(2, '0');

        const dayData = HEYS.utils?.lsGet(`dayv2_${dateStr}`);
        if (dayData && isValidDay(dayData)) {
          recentDays.push(dayData);
        }
      }

      return Stats.aggregateDays(recentDays);
    } catch (e) {
      console.error('Error getting recent average:', e);
      return {
        totalKcal: 0,
        totalProt: 0,
        totalFat: 0,
        totalCarbs: 0,
        days: 0,
        avgKcal: 0,
        avgProt: 0,
        avgFat: 0,
        avgCarbs: 0,
      };
    }
  };

  // Вычисление трендов
  Stats.calculateTrends = function (days: DayRecord[]): TrendData {
    if (!Array.isArray(days) || days.length === 0) {
      return { kcalTrend: [], weightTrend: [], avgsByWeek: [] };
    }

    const sortedDays = [...days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Дневные тренды
    const kcalTrend: number[] = [];
    const weightTrend: number[] = [];

    for (const day of sortedDays) {
      if (isValidDay(day)) {
        const totals = calculateDayTotals(day);
        kcalTrend.push(totals.kcal);

        const weight =
          typeof day.weight === 'number'
            ? day.weight
            : typeof day.weightMorning === 'number'
              ? day.weightMorning
              : parseFloat(String(day.weight || day.weightMorning || 0));
        weightTrend.push(weight || 0);
      }
    }

    // Недельные средние
    const avgsByWeek: DayAggregation[] = [];
    const weekSize = 7;

    for (let i = 0; i < sortedDays.length; i += weekSize) {
      const weekDays = sortedDays.slice(i, i + weekSize);
      const weekAvg = Stats.aggregateDays(weekDays);
      avgsByWeek.push(weekAvg);
    }

    return { kcalTrend, weightTrend, avgsByWeek };
  };

  // Недельная статистика
  Stats.getWeeklyStats = function (days: DayRecord[]): WeeklyStats {
    if (!Array.isArray(days) || days.length === 0) {
      return { weeks: [] };
    }

    const sortedDays = [...days].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const weeks: WeeklyStats['weeks'] = [];

    // Группируем по неделям (понедельник - воскресенье)
    let currentWeek: DayRecord[] = [];
    let weekStart = '';

    for (const day of sortedDays) {
      const dayDate = new Date(day.date);
      const dayOfWeek = (dayDate.getDay() + 6) % 7; // Понедельник = 0

      if (dayOfWeek === 0 && currentWeek.length > 0) {
        // Начало новой недели, сохраняем предыдущую
        const weekEnd = currentWeek[currentWeek.length - 1].date;
        weeks.push({
          start: weekStart,
          end: weekEnd,
          stats: Stats.aggregateDays(currentWeek),
        });
        currentWeek = [day];
        weekStart = day.date;
      } else {
        if (currentWeek.length === 0) {
          weekStart = day.date;
        }
        currentWeek.push(day);
      }
    }

    // Добавляем последнюю неделю
    if (currentWeek.length > 0) {
      const weekEnd = currentWeek[currentWeek.length - 1].date;
      weeks.push({
        start: weekStart,
        end: weekEnd,
        stats: Stats.aggregateDays(currentWeek),
      });
    }

    return { weeks };
  };

  // Сравнение периодов
  Stats.comparePeriods = function (
    period1: DayRecord[],
    period2: DayRecord[]
  ): { period1: DayAggregation; period2: DayAggregation; diff: Partial<DayAggregation> } {
    const stats1 = Stats.aggregateDays(period1);
    const stats2 = Stats.aggregateDays(period2);

    const diff: Partial<DayAggregation> = {
      avgKcal: round1(stats2.avgKcal - stats1.avgKcal),
      avgProt: round1(stats2.avgProt - stats1.avgProt),
      avgFat: round1(stats2.avgFat - stats1.avgFat),
      avgCarbs: round1(stats2.avgCarbs - stats1.avgCarbs),
      days: stats2.days - stats1.days,
    };

    return { period1: stats1, period2: stats2, diff };
  };

  // Поиск аномалий в данных
  Stats.findAnomalies = function (
    days: DayRecord[],
    threshold: number = 2
  ): Array<{
    date: string;
    type: 'high_kcal' | 'low_kcal' | 'high_weight' | 'low_weight';
    value: number;
    deviation: number;
  }> {
    if (!Array.isArray(days) || days.length < 3) return [];

    const anomalies: any[] = [];
    const validDays = days.filter(isValidDay);

    // Вычисляем средние и стандартные отклонения
    const kcalValues = validDays.map(day => calculateDayTotals(day).kcal);
    const avgKcal = kcalValues.reduce((sum, val) => sum + val, 0) / kcalValues.length;
    const stdKcal = Math.sqrt(
      kcalValues.reduce((sum, val) => sum + Math.pow(val - avgKcal, 2), 0) / kcalValues.length
    );

    // Ищем аномалии по калориям
    for (const day of validDays) {
      const dayTotals = calculateDayTotals(day);
      const deviation = Math.abs(dayTotals.kcal - avgKcal) / stdKcal;

      if (deviation > threshold) {
        anomalies.push({
          date: day.date,
          type: dayTotals.kcal > avgKcal ? 'high_kcal' : 'low_kcal',
          value: dayTotals.kcal,
          deviation: round1(deviation),
        });
      }
    }

    return anomalies.sort((a, b) => b.deviation - a.deviation);
  };

  // Performance tracking
  if (HEYS.performance) {
    const originalAggregate = Stats.aggregateDays;
    Stats.aggregateDays = function (daysArr: DayRecord[]): DayAggregation {
      return HEYS.performance.measure('stats.aggregateDays', () => {
        const result = originalAggregate.call(this, daysArr);
        HEYS.performance.increment('stats.operations');
        return result;
      });
    };
  }

  // Export to HEYS global
  HEYS.stats = Stats;

  // Legacy compatibility
  if (!(HEYS as any).Stats) {
    (HEYS as any).Stats = Stats;
  }

  console.log('📊 HEYS Stats v1 (TypeScript) загружен');
})(window);
