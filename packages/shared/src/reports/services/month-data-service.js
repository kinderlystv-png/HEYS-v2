/**
 * Month Data Service  
 * Handles collection and processing of monthly nutrition and activity data
 */

import { StructuredLogger } from '../../monitoring/logger.js';
import { round1 } from '../utils/index.js';

import { getDayData } from './day-data-service.js';
import { getWeekData } from './week-data-service.js';

// Initialize logger
const logger = new StructuredLogger({
  name: 'month-data-service'
});

/**
 * Collects and processes data for a month
 */
export async function getMonthData(year, month, prodIndex, profile, zones) {
  logger.info('Collecting month data', {
    component: 'MonthDataService',
    operation: 'getMonthData',
    metadata: { year, month }
  });

  const monthData = await collectMonthData(year, month, prodIndex, profile, zones);
  return monthData;
}

/**
 * Internal function to collect month data
 */
async function collectMonthData(year, month, prodIndex, profile, zones) {
  const endDate = new Date(year, month, 0); // Last day of month
  const daysInMonth = endDate.getDate();
  
  const dates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    dates.push(date.toISOString().split('T')[0]);
  }

  // Collect data for each day
  const dayPromises = dates.map(dateStr => 
    getDayData(dateStr, prodIndex, profile, zones)
  );
  
  const days = await Promise.all(dayPromises);
  
  // Generate weeks for the month
  const weeks = await generateMonthWeeks(year, month, prodIndex, profile, zones);
  
  // Calculate month aggregates
  const monthTotals = aggregateMonth(days);
  const monthAverages = calculateMonthAverages(days);
  const monthStats = calculateMonthStats(days);
  const progressMetrics = calculateProgressMetrics(days);
  
  return {
    year,
    month,
    monthName: getMonthName(month),
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    daysInMonth,
    dates,
    days,
    weeks,
    totals: monthTotals,
    averages: monthAverages,
    stats: monthStats,
    progress: progressMetrics,
    daysWithData: days.filter(day => day.totals.kcal > 0).length
  };
}

/**
 * Generates week data for all weeks in the month
 */
async function generateMonthWeeks(year, month, prodIndex, profile, zones) {
  const weeks = [];
  const startDate = new Date(year, month - 1, 1);
  
  // Find first Sunday of the month or before
  const firstDay = new Date(startDate);
  firstDay.setDate(1 - startDate.getDay()); // Go to Sunday
  
  // Generate weeks until we pass the end of month
  const endOfMonth = new Date(year, month, 0);
  const current = new Date(firstDay);
  
  while (current <= endOfMonth || current.getMonth() === month - 1) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6); // Saturday
    
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    const weekData = await getWeekData(weekEndStr, prodIndex, profile, zones);
    
    weeks.push(weekData);
    current.setDate(current.getDate() + 7);
    
    // Safety break
    if (weeks.length > 6) break;
  }
  
  return weeks;
}

/**
 * Aggregates nutrition totals across the month
 */
function aggregateMonth(days) {
  const totals = {
    kcal: 0, carbs: 0, prot: 0, fat: 0, simple: 0, complex: 0,
    badFat: 0, goodFat: 0, trans: 0, fiber: 0
  };

  days.forEach(day => {
    if (day && day.totals) {
      totals.kcal += day.totals.kcal || 0;
      totals.carbs += day.totals.carbs || 0;
      totals.prot += day.totals.prot || 0;
      totals.fat += day.totals.fat || 0;
      totals.simple += day.totals.simple || 0;
      totals.complex += day.totals.complex || 0;
      totals.badFat += day.totals.badFat || 0;
      totals.goodFat += day.totals.goodFat || 0;
      totals.trans += day.totals.trans || 0;
      totals.fiber += day.totals.fiber || 0;
    }
  });

  // Round all totals
  Object.keys(totals).forEach(key => {
    totals[key] = round1(totals[key]);
  });

  return totals;
}

/**
 * Calculates daily averages for the month
 */
function calculateMonthAverages(days) {
  const validDays = days.filter(day => day && day.totals && day.totals.kcal > 0);
  const count = validDays.length || 1;

  const totals = aggregateMonth(days);
  const averages = {};

  Object.keys(totals).forEach(key => {
    averages[key] = round1(totals[key] / count);
  });

  // Calculate other averages
  let defKcalSum = 0, defPctSum = 0, giAvgSum = 0, harmAvgSum = 0;
  let sleepSum = 0, stressSum = 0, wellbeingSum = 0, moodSum = 0;
  let defCount = 0, giCount = 0, harmCount = 0;
  let sleepCount = 0, stressCount = 0, wellbeingCount = 0, moodCount = 0;

  validDays.forEach(day => {
    if (day.defKcal != null) {
      defKcalSum += day.defKcal;
      defCount++;
    }
    if (day.defPct != null) {
      defPctSum += day.defPct;
    }
    if (day.giAvg != null && day.giAvg > 0) {
      giAvgSum += day.giAvg;
      giCount++;
    }
    if (day.harmAvg != null && day.harmAvg > 0) {
      harmAvgSum += day.harmAvg;
      harmCount++;
    }
    if (day.sleepHours != null && day.sleepHours > 0) {
      sleepSum += day.sleepHours;
      sleepCount++;
    }
    if (day.stressAvg != null) {
      stressSum += day.stressAvg;
      stressCount++;
    }
    if (day.wellbeingAvg != null) {
      wellbeingSum += day.wellbeingAvg;
      wellbeingCount++;
    }
    if (day.moodAvg != null) {
      moodSum += day.moodAvg;
      moodCount++;
    }
  });

  averages.defKcal = defCount ? round1(defKcalSum / defCount) : 0;
  averages.defPct = count ? round1(defPctSum / count) : 0;
  averages.giAvg = giCount ? round1(giAvgSum / giCount) : 0;
  averages.harmAvg = harmCount ? round1(harmAvgSum / harmCount) : 0;
  averages.sleepHours = sleepCount ? round1(sleepSum / sleepCount) : 0;
  averages.stressAvg = stressCount ? round1(stressSum / stressCount) : 0;
  averages.wellbeingAvg = wellbeingCount ? round1(wellbeingSum / wellbeingCount) : 0;
  averages.moodAvg = moodCount ? round1(moodSum / moodCount) : 0;

  return averages;
}

/**
 * Calculates month statistics and trends
 */
function calculateMonthStats(days) {
  const validDays = days.filter(day => day && day.totals && day.totals.kcal > 0);
  
  if (validDays.length === 0) {
    return {
      dataCompleteness: 0,
      consistency: 0,
      targetAdherence: 0,
      bestWeek: null,
      worstWeek: null,
      trend: 'insufficient_data'
    };
  }

  const dataCompleteness = round1((validDays.length / days.length) * 100);

  // Calculate consistency (coefficient of variation)
  const kcalValues = validDays.map(day => day.totals.kcal);
  const kcalMean = kcalValues.reduce((sum, val) => sum + val, 0) / kcalValues.length;
  const kcalVariance = kcalValues.reduce((sum, val) => sum + Math.pow(val - kcalMean, 2), 0) / kcalValues.length;
  const kcalStdDev = Math.sqrt(kcalVariance);
  const consistency = kcalMean > 0 ? round1((1 - (kcalStdDev / kcalMean)) * 100) : 0;

  // Calculate target adherence
  const adherentDays = validDays.filter(day => {
    const target = day.optimum || 0;
    const actual = day.totals.kcal || 0;
    return target > 0 && Math.abs(actual - target) / target <= 0.1;
  });
  const targetAdherence = round1((adherentDays.length / validDays.length) * 100);

  // Determine trend
  let trend = 'stable';
  if (validDays.length >= 7) {
    const firstWeek = validDays.slice(0, 7);
    const lastWeek = validDays.slice(-7);
    
    const firstAvg = firstWeek.reduce((sum, day) => sum + (day.totals.kcal || 0), 0) / firstWeek.length;
    const lastAvg = lastWeek.reduce((sum, day) => sum + (day.totals.kcal || 0), 0) / lastWeek.length;
    
    const change = ((lastAvg - firstAvg) / firstAvg) * 100;
    if (change > 5) trend = 'increasing';
    else if (change < -5) trend = 'decreasing';
  }

  return {
    dataCompleteness: Math.max(0, Math.min(100, dataCompleteness)),
    consistency: Math.max(0, Math.min(100, consistency)),
    targetAdherence: Math.max(0, Math.min(100, targetAdherence)),
    bestWeek: null, // Would be calculated from week data
    worstWeek: null, // Would be calculated from week data
    trend
  };
}

/**
 * Calculates progress metrics for the month
 */
function calculateProgressMetrics(days) {
  const validDays = days.filter(day => day && day.totals && day.totals.kcal > 0);
  
  if (validDays.length < 2) {
    return {
      weightChange: 0,
      avgDeficit: 0,
      projectedWeightLoss: 0,
      goalAdherence: 0
    };
  }

  // Weight change (first to last recorded weight)
  const daysWithWeight = validDays.filter(day => day.weight > 0);
  const weightChange = daysWithWeight.length >= 2 
    ? round1(daysWithWeight[daysWithWeight.length - 1].weight - daysWithWeight[0].weight)
    : 0;

  // Average deficit
  const deficits = validDays.map(day => day.defKcal || 0);
  const avgDeficit = round1(deficits.reduce((sum, def) => sum + def, 0) / deficits.length);

  // Projected weight loss (3500 kcal = 1 lb)
  const totalDeficit = deficits.reduce((sum, def) => sum + def, 0);
  const projectedWeightLoss = round1(Math.abs(totalDeficit) / 3500);

  // Goal adherence (simplified - based on target deficit adherence)
  const targetAdherentDays = validDays.filter(day => {
    const target = day.dayTargetDef || 0;
    const actual = day.defPct || 0;
    return Math.abs(actual - target) <= 5; // Within 5% of target
  });
  const goalAdherence = round1((targetAdherentDays.length / validDays.length) * 100);

  return {
    weightChange,
    avgDeficit,
    projectedWeightLoss,
    goalAdherence: Math.max(0, Math.min(100, goalAdherence))
  };
}

/**
 * Returns month name for display
 */
function getMonthName(month) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return names[month - 1] || 'Unknown';
}
