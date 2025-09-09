/**
 * Day Data Service
 * Handles collection and processing of daily nutrition and activity data
 */

import { StructuredLogger } from '../../monitoring/logger.js';
import { fmtDate, round1, toNum } from '../utils/index.js';
import { getCachedDay, setCachedDay } from '../cache/index.js';
import type { DayData, ProductIndex, Profile, Zones, DataServiceOptions } from '../types.js';

// Initialize logger
const logger = new StructuredLogger({
  name: 'day-data-service'
});

/**
 * Collects and processes data for a specific day
 * @param dateStr Date string in YYYY-MM-DD format
 * @param prodIndex Product index for lookups
 * @param profile User profile data
 * @param zones Activity zones data
 * @param products Array of products
 * @returns Processed day data
 */
export async function getDayData(
  dateStr: string,
  prodIndex: ProductIndex,
  profile: Profile,
  zones: Zones,
  products: unknown[] = []
): Promise<DayData> {
  // Check cache first
  const cacheKey = `day_${dateStr}_${JSON.stringify(profile).substring(0, 50)}`;
  const cached = getCachedDay(cacheKey);
  
  if (cached) {
    logger.info('Day data retrieved from cache', {
      component: 'DayDataService',
      operation: 'getDayData',
      metadata: { dateStr, cached: true }
    });
    return cached as DayData;
  }

  logger.info('Collecting day data', {
    component: 'DayDataService', 
    operation: 'getDayData',
    metadata: { dateStr, cached: false }
  });

  // Collect data using internal function
  const dayData = await collectDayData(dateStr, prodIndex, profile, zones);
  
  // Cache the result
  setCachedDay(cacheKey, dayData);
  
  return dayData;
}

/**
 * Internal function to collect day data without caching
 */
async function collectDayData(
  dateStr: string,
  prodIndex: ProductIndex,
  profile: Profile,
  zones: Zones
): Promise<DayData> {
  // Load meals for the specific date
  const meals = loadMealsForDate(dateStr);
  
  // Load day object from localStorage
  const dayObj = loadDayObject(dateStr);
  
  // Calculate nutrition totals
  const totals = aggregateDay(meals, prodIndex);
  
  // Calculate daily energy expenditure
  const dailyExp = calculateDailyExpenditure(dayObj, profile, zones);
  
  // Calculate target deficit from day or profile
  const targetDef = dayObj.dayTargetDef ?? +(profile.deficitPctTarget || 0);
  
  // Calculate optimum calories needed
  const optimum = dailyExp ? Math.round(dailyExp * (1 + targetDef / 100)) : 0;
  
  // Calculate actual deficit
  const eatenKcal = totals.kcal || 0;
  const defKcal = dailyExp ? Math.round(eatenKcal - dailyExp) : 0;
  const defPct = dailyExp ? Math.round(defKcal / dailyExp * 100) : 0;
  const factDefPct = dailyExp ? Math.round(((eatenKcal - dailyExp) / dailyExp) * 100) : 0;
  
  // Calculate macronutrient percentages
  const totalMacroKcal = (totals.carbs * 4) + (totals.prot * 4) + (totals.fat * 9);
  const carbsPct = totalMacroKcal ? round1((totals.carbs * 4 / totalMacroKcal) * 100) : 0;
  const protPct = totalMacroKcal ? round1((totals.prot * 4 / totalMacroKcal) * 100) : 0;
  const fatPct = totalMacroKcal ? round1((totals.fat * 9 / totalMacroKcal) * 100) : 0;
  
  const totalCarbs = totals.simple + totals.complex;
  const simplePct = totalCarbs ? round1((totals.simple / totalCarbs) * 100) : 0;
  const complexPct = totalCarbs ? round1((totals.complex / totalCarbs) * 100) : 0;
  
  // Calculate averages
  const giAvg = totals.giCnt ? round1(totals.giSum / totals.giCnt) : 0;
  const harmAvg = totals.harmCnt ? round1(totals.harmSum / totals.harmCnt) : 0;
  
  // Calculate sleep hours
  const calculatedSleepHours = calculateSleepHours(dayObj);
  
  return {
    dstr: dateStr,
    totals: {
      kcal: round1(totals.kcal),
      carbs: round1(totals.carbs),
      prot: round1(totals.prot),
      fat: round1(totals.fat),
      simple: round1(totals.simple),
      complex: round1(totals.complex),
      badFat: round1(totals.badFat),
      goodFat: round1(totals.goodFat),
      trans: round1(totals.trans),
      fiber: round1(totals.fiber)
    },
    dailyExp,
    optimum,
    defKcal,
    defPct,
    factDefPct,
    carbsPct,
    protPct,
    fatPct,
    simplePct,
    complexPct,
    giAvg,
    harmAvg,
    mealsCount: Array.isArray(meals) ? meals.length : 0,
    dayTargetDef: targetDef,
    sleepHours: calculatedSleepHours || dayObj.sleepHours || 0,
    sleepQuality: dayObj.sleepQuality,
    sleepComment: dayObj.sleepComment ?? dayObj.sleepNote,
    stressAvg: dayObj.stressAvg,
    wellbeingAvg: dayObj.wellbeingAvg,
    moodAvg: dayObj.moodAvg,
    dayComment: dayObj.dayComment,
    weight: dayObj.weight || profile.weight
  };
}

/**
 * Loads meals data for a specific date from localStorage
 */
function loadMealsForDate(dateStr: string): unknown[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }

  const ls = window.localStorage;
  
  // Check with current client ID
  const clientId = (window as any).HEYS?.currentClientId;
  const keys = [
    clientId ? `heys_${clientId}_dayv2_${dateStr}` : null,
    `heys_dayv2_${dateStr}`,   // day object with meals[]
    `heys_day_${dateStr}`,     // old day format
    `day_${dateStr}_meals`,    // meals array
    `meals_${dateStr}`,        // meals array
    `food_${dateStr}`          // meals array
  ].filter(Boolean) as string[];
  
  for (const key of keys) {
    try {
      const raw = ls.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw);
      if (value && Array.isArray(value.meals)) return value.meals;
      if (Array.isArray(value)) return value;
    } catch (error) {
      logger.logError({
        error: error instanceof Error ? error : new Error(String(error)),
        component: 'DayDataService',
        operation: 'loadMealsForDate',
        context: { key, dateStr }
      });
    }
  }
  return [];
}

/**
 * Loads day object from localStorage
 */
function loadDayObject(dateStr: string): any {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }

  const ls = window.localStorage;
  const clientId = (window as any).HEYS?.currentClientId;
  const keys = [
    clientId ? `heys_${clientId}_dayv2_${dateStr}` : null,
    `heys_dayv2_${dateStr}`,
    `heys_day_${dateStr}`
  ].filter(Boolean) as string[];

  for (const key of keys) {
    try {
      const raw = ls.getItem(key);
      if (!raw) continue;
      return JSON.parse(raw);
    } catch (error) {
      logger.logError({
        error: error instanceof Error ? error : new Error(String(error)),
        component: 'DayDataService',
        operation: 'loadDayObject',
        context: { key, dateStr }
      });
    }
  }
  return {};
}

/**
 * Aggregates nutrition data from meals
 */
function aggregateDay(meals: any[], prodIndex: ProductIndex): any {
  const total = {
    kcal: 0, carbs: 0, prot: 0, fat: 0, simple: 0, complex: 0,
    badFat: 0, goodFat: 0, trans: 0, fiber: 0, giSum: 0, giCnt: 0,
    harmSum: 0, harmCnt: 0
  };

  (meals || []).forEach(meal => {
    const items = (meal && (meal.items || meal.food || meal.list || meal.products)) || [];
    items.forEach((item: any) => {
      const grams = +(item.grams ?? item.g) || +(item.qty || 0) || +(item.weight || 0) || 0;
      let product = null;
      
      // Find product by ID
      if (item.product_id != null) product = prodIndex.byId.get(String(item.product_id));
      if (!product && item.productId != null) product = prodIndex.byId.get(String(item.productId));
      if (!product && item.id != null && typeof item.name !== 'string') {
        product = prodIndex.byId.get(String(item.id));
      }
      
      // Find product by name
      if (!product) {
        const name = String(item.name || item.title || '').trim().toLowerCase();
        if (name) product = prodIndex.byName.get(name);
      }
      
      if (!product || !grams) return;

      const k = grams / 100;
      const kcal100 = +product.kcal100 || 0;
      const carbs100 = +product.carbs100 || ((+product.simple100 || 0) + (+product.complex100 || 0));
      const prot100 = +product.protein100 || (+product.prot100 || 0);
      const fat100 = +product.fat100 || ((+product.badFat100 || 0) + (+product.goodFat100 || 0) + (+product.trans100 || 0));
      const simple100 = +product.simple100 || 0;
      const complex100 = +product.complex100 || 0;
      const bad100 = +product.badFat100 || 0;
      const good100 = +product.goodFat100 || 0;
      const trans100 = +product.trans100 || 0;
      const fiber100 = +product.fiber100 || 0;
      const gi = +product.gi || 0;
      const harm = +product.harmScore || 0;

      total.kcal += kcal100 * k;
      total.carbs += carbs100 * k;
      total.prot += prot100 * k;
      total.fat += fat100 * k;
      total.simple += simple100 * k;
      total.complex += complex100 * k;
      total.badFat += bad100 * k;
      total.goodFat += good100 * k;
      total.trans += trans100 * k;
      total.fiber += fiber100 * k;
      
      if (gi > 0) {
        total.giSum += gi;
        total.giCnt++;
      }
      if (harm > 0) {
        total.harmSum += harm;
        total.harmCnt++;
      }
    });
  });

  return total;
}

/**
 * Calculates daily energy expenditure
 */
function calculateDailyExpenditure(dayObj: any, profile: Profile, zones: Zones): number {
  // Simplified calculation - in real implementation would include:
  // - BMR calculation
  // - Activity levels
  // - Exercise data
  // - Step counts
  // etc.
  
  const bmr = calculateBMR(profile.gender || '', profile.weight || 0, profile.height || 0, profile.age || 0);
  const activityMultiplier = 1.4; // Sedentary baseline
  
  return Math.round(bmr * activityMultiplier);
}

/**
 * Calculates Basal Metabolic Rate
 */
function calculateBMR(gender: string, weight: number, height: number, age: number): number {
  const w = toNum(weight);
  const h = toNum(height);
  const a = toNum(age);
  
  return String(gender || '').toLowerCase().startsWith('ж') || String(gender || '').toLowerCase().startsWith('f')
    ? (10 * w + 6.25 * h - 5 * a - 161)
    : (10 * w + 6.25 * h - 5 * a + 5);
}

/**
 * Calculates sleep hours from day object
 */
function calculateSleepHours(dayObj: any): number {
  // Implementation would parse sleep start/end times
  // For now return stored value or 0
  return toNum(dayObj.sleepHours || 0);
}
