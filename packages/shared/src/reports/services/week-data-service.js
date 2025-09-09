/**
 * Week Data Service
 * Handles collection and processing of weekly nutrition and activity data
 */

import { StructuredLogger } from '../../monitoring/logger.js';
import { getCachedWeek, setCachedWeek } from '../cache/index.js';
import { round1 } from '../utils/index.js';

import { getDayData } from './day-data-service.js';

// Initialize logger
const logger = new StructuredLogger({
  name: 'week-data-service'
});

/**
 * Collects and processes data for a week (7 days ending on specified date)
 */
export async function getWeekData(endDateStr, prodIndex, profile, zones) {
  const cacheKey = `week_${endDateStr}_${JSON.stringify(profile).substring(0, 50)}`;
  const cached = getCachedWeek(cacheKey);
  
  if (cached) {
    logger.info('Week data retrieved from cache', {
      component: 'WeekDataService',
      operation: 'getWeekData',
      metadata: { endDateStr, cached: true }
    });
    return cached;
  }

  logger.info('Collecting week data', {
    component: 'WeekDataService',
    operation: 'getWeekData', 
    metadata: { endDateStr, cached: false }
  });

  const weekData = await collectWeekData(endDateStr, prodIndex, profile, zones);
  setCachedWeek(cacheKey, weekData);
  
  return weekData;
}

/**
 * Internal function to collect week data without caching
 */
async function collectWeekData(endDateStr, prodIndex, profile, zones) {
  const endDate = new Date(endDateStr);
  const dates = [];
  
  // Generate 7 dates ending with endDateStr
  for (let i = 6; i >= 0; i--) {
    const date = new Date(endDate);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }

  // Collect data for each day
  const dayPromises = dates.map(dateStr => 
    getDayData(dateStr, prodIndex, profile, zones)
  );
  
  const days = await Promise.all(dayPromises);
  
  // Calculate week aggregates
  const weekTotals = aggregateWeek(days);
  const weekAverages = calculateWeekAverages(days);
  const weekStats = calculateWeekStats(days);
  
  return {
    endDate: endDateStr,
    startDate: dates[0],
    dates,
    days,
    totals: weekTotals,
    averages: weekAverages,
    stats: weekStats,
    daysWithData: days.filter(day => day.totals.kcal > 0).length
  };
}

/**
 * Aggregates nutrition totals across the week
 */
function aggregateWeek(days) {
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
 * Calculates daily averages for the week
 */
function calculateWeekAverages(days) {
  const validDays = days.filter(day => day && day.totals && day.totals.kcal > 0);
  const count = validDays.length || 1;

  const totals = aggregateWeek(days);
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
 * Calculates week statistics and trends
 */
function calculateWeekStats(days) {
  const validDays = days.filter(day => day && day.totals && day.totals.kcal > 0);
  
  if (validDays.length === 0) {
    return {
      trend: 'insufficient_data',
      consistency: 0,
      targetAdherence: 0,
      bestDay: null,
      worstDay: null
    };
  }

  // Calculate consistency (coefficient of variation of daily calories)
  const kcalValues = validDays.map(day => day.totals.kcal);
  const kcalMean = kcalValues.reduce((sum, val) => sum + val, 0) / kcalValues.length;
  const kcalVariance = kcalValues.reduce((sum, val) => sum + Math.pow(val - kcalMean, 2), 0) / kcalValues.length;
  const kcalStdDev = Math.sqrt(kcalVariance);
  const consistency = kcalMean > 0 ? round1((1 - (kcalStdDev / kcalMean)) * 100) : 0;

  // Calculate target adherence (days within ±10% of target)
  const adherentDays = validDays.filter(day => {
    const target = day.optimum || 0;
    const actual = day.totals.kcal || 0;
    return target > 0 && Math.abs(actual - target) / target <= 0.1;
  });
  const targetAdherence = round1((adherentDays.length / validDays.length) * 100);

  // Find best and worst days (by deficit percentage)
  let bestDay = null, worstDay = null;
  validDays.forEach(day => {
    if (!bestDay || (day.defPct != null && day.defPct < bestDay.defPct)) {
      bestDay = day;
    }
    if (!worstDay || (day.defPct != null && day.defPct > worstDay.defPct)) {
      worstDay = day;
    }
  });

  // Determine trend
  let trend = 'stable';
  if (validDays.length >= 3) {
    const firstHalf = validDays.slice(0, Math.floor(validDays.length / 2));
    const secondHalf = validDays.slice(-Math.floor(validDays.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, day) => sum + (day.totals.kcal || 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, day) => sum + (day.totals.kcal || 0), 0) / secondHalf.length;
    
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    if (change > 5) trend = 'increasing';
    else if (change < -5) trend = 'decreasing';
  }

  return {
    trend,
    consistency: Math.max(0, Math.min(100, consistency)),
    targetAdherence: Math.max(0, Math.min(100, targetAdherence)),
    bestDay: bestDay ? bestDay.dstr : null,
    worstDay: worstDay ? worstDay.dstr : null
  };
}
