/**
 * TypeScript types for HEYS Reports Data Services
 */

// Basic data types
export interface DayData {
  dstr: string; // Date string (YYYY-MM-DD)
  totals: {
    kcal: number;
    carbs: number;
    prot: number;
    fat: number;
    simple: number;
    complex: number;
    badFat: number;
    goodFat: number;
    trans: number;
    fiber: number;
  };
  dailyExp: number; // Daily energy expenditure
  optimum: number; // Target calories  
  defKcal: number; // Calorie deficit
  defPct: number; // Deficit percentage
  factDefPct: number; // Actual deficit percentage
  carbsPct: number;
  protPct: number;
  fatPct: number;
  simplePct: number;
  complexPct: number;
  giAvg: number; // Glycemic index average
  harmAvg: number; // Harm score average
  mealsCount: number;
  dayTargetDef: number;
  sleepHours: number;
  sleepQuality?: number;
  sleepComment?: string;
  stressAvg?: number;
  wellbeingAvg?: number;
  moodAvg?: number;
  dayComment?: string;
  weight?: number;
}

export interface ProductIndex {
  byName: Map<string, Product>;
  byId: Map<string, Product>;
}

export interface Product {
  id?: string;
  product_id?: string;
  name: string;
  kcal100: number;
  carbs100: number;
  protein100: number;
  fat100: number;
  simple100?: number;
  complex100?: number;
  badFat100?: number;
  goodFat100?: number;
  trans100?: number;
  fiber100?: number;
  gi?: number; // Glycemic index
  harmScore?: number;
}

export interface Profile {
  deficitPctTarget?: number;
  weight?: number;
  height?: number;
  age?: number;
  gender?: string;
  activityLevel?: number;
}

export interface Zones {
  // Activity zones or other zone-based data
  [key: string]: unknown;
}

export interface DataServiceOptions {
  dateStr?: string;
  offsetDays?: number;
  profile?: Profile;
  zones?: Zones;
  products?: Product[];
  useCache?: boolean;
}

export interface WeekData {
  rows: DayData[];
  averages: DayData;
  weekOffset: number;
}

export interface MonthData {
  rows: DayData[];
  averages: DayData;
  monthOffset: number;
}
