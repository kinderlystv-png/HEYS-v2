// types/heys.d.ts - Основные типы для приложения HEYS

declare global {
  interface Window {
    HEYS: HEYSGlobal;
    React: typeof React;
    ReactDOM: any;
    Chart: any;
    supabase: any;
  }
}

export interface HEYSGlobal {
  // Core modules
  utils: HEYSUtils;
  models: HEYSModels;
  store: HEYSStore;
  cloud: HEYSCloud;
  performance: HEYSPerformance;
  products: HEYSProducts;
  analytics: HEYSAnalytics;

  // React components
  DayTab: React.ComponentType<DayTabProps>;
  RationTab: React.ComponentType<RationTabProps>;
  UserTab: React.ComponentType<UserTabProps>;
  ReportTab: React.ComponentType<ReportTabProps>;
  Ration: React.ComponentType<RationTabProps>;
  VirtualList: React.ComponentType<VirtualListProps>;
  ErrorBoundary: React.ComponentType<ErrorBoundaryProps>;

  // Additional components and utilities
  EnhancedVirtualList?: React.ComponentType<any>;
  useVirtualListMetrics?: any;
  createDynamicVirtualList?: any;
  stats?: HEYSStats;

  // State
  currentClientId?: string;
  debug?: boolean;

  // Functions
  saveClientKey: (key: string, value: any) => void;
  clearReportsCache?: () => void;
  lsGet: (key: string, defaultValue?: any) => any;
  lsSet: (key: string, value: any) => void;
  calculateTotalsFromMeals: (meals: Meal[], products: Product[]) => MealTotals;
  calculateBMR: (profile: UserProfile) => number;
  logError: (error: Error, errorInfo?: React.ErrorInfo, additionalData?: any) => void;
}

// === Product Types ===
export interface Product {
  id: string | number;
  name: string;
  simple100: number;
  complex100: number;
  protein100: number;
  badFat100: number;
  goodFat100: number;
  trans100: number;
  fiber100: number;
  gi?: number;
  harmScore?: number;
  // Computed fields
  carbs100?: number;
  fat100?: number;
  kcal100?: number;
}

export interface ProductIndex {
  byId: Map<string, Product>;
  byName: Map<string, Product>;
}

// === Meal Types ===
export interface MealItem {
  id: string;
  product_id?: string | number;
  productId?: string | number;
  name?: string;
  grams: number;
}

export interface Meal {
  id: string;
  name: string;
  time?: string;
  mood?: string | number;
  wellbeing?: string | number;
  stress?: string | number;
  items: MealItem[];
}

export interface MealTotals {
  kcal: number;
  carbs: number;
  simple: number;
  complex: number;
  protein: number; // Добавляем для совместимости
  prot: number;
  fat: number;
  bad: number;
  good: number;
  trans: number;
  fiber: number;
  gi?: number;
  harm?: number;
}

// Alias for compatibility
export type NutritionTotals = MealTotals;

// === Day Types ===
export interface Training {
  z?: [number, number, number, number]; // 4 zones
  duration?: number;
  calories?: number;
  avgHr?: number;
  type?: string;
  name?: string;
}

export interface DayRecord {
  date: string;
  sleepStart?: string;
  sleepEnd?: string;
  sleepNote?: string;
  sleepQuality?: number | string;
  sleepHours?: number;
  weight?: number;
  weightMorning?: number | string;
  deficitPct?: number | string;
  steps?: number;
  householdMin?: number;
  trainings?: Training[];
  dayScore?: number | string;
  moodAvg?: number | string;
  wellbeingAvg?: number | string;
  stressAvg?: number | string;
  dayComment?: string;
  notes?: string;
  meals: Meal[];
}

// === Profile Types ===
export interface UserProfile {
  firstName?: string;
  lastName?: string;
  gender: string;
  sex?: string;
  weight: number;
  height: number;
  age: number;
  sleepHours: number;
  insulinWaveHours?: number;
  deficitPctTarget?: number;
  zones?: PulseZone[];
  revision?: number;
  lastModified?: string;
}

export interface PulseZone {
  name: string;
  hrFrom: number;
  hrTo: number;
  min: number; // Добавляем для совместимости
  max: number; // Добавляем для совместимости
  MET: number;
  met?: number;
}

export interface Norms {
  carbsPct: number;
  proteinPct: number;
  badFatPct: number;
  superbadFatPct: number;
  simpleCarbPct: number;
  giPct: number;
  harmPct: number;
  fiberPct: number;
}

// === Client Types ===
export interface Client {
  id: string;
  name: string;
  curator_id?: string;
  created_at?: string;
  updated_at?: string;
}

// === Component Props ===
export interface DayTabProps {
  products: Product[];
  clientId?: string;
}

export interface RationTabProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
  clientId?: string;
}

export interface UserTabProps {
  clientId?: string;
}

export interface ReportTabProps {
  products: Product[];
}

// === Utility Types ===
export interface HEYSUtils {
  INVIS: RegExp;
  NUM_RE: RegExp;
  round1: (v: number) => number;
  uuid: () => string;
  toNum: (x: any) => number;
  toNumInput: (v: any) => number;
  computeDerived: (p: Partial<Product>) => { carbs100: number; fat100: number; kcal100: number };
  lsGet: (key: string, defaultValue?: any) => any;
  lsSet: (key: string, value: any) => void;
  parsePasted: (text: string) => Promise<Product[]>;
  __clientScoped?: boolean;
}

export interface HEYSModels {
  ensureDay: (d: Partial<DayRecord>, prof?: UserProfile) => DayRecord;
  buildProductIndex: (products: Product[]) => ProductIndex;
  getProductFromItem: (item: MealItem, index: ProductIndex) => Product | null;
  mealTotals: (meal: Meal, index: ProductIndex) => MealTotals;
  computeDerivedProduct: (p: Partial<Product>) => {
    carbs100: number;
    fat100: number;
    kcal100: number;
  };
  uuid: () => string;
  round1: (v: number) => number;
  todayISO: () => string;
}

export interface HEYSStore {
  get: (key: string, defaultValue?: any) => any;
  set: (key: string, value: any) => void;
  watch: (key: string, callback: (value: any) => void) => () => void;
  flushMemory: () => void;
}

export interface HEYSCloud {
  client: any;
  init: (config: { url: string; anonKey: string }) => void;
  signIn: (email: string, password: string) => Promise<{ user?: any; error?: any }>;
  signOut: () => void;
  getUser: () => any;
  getStatus: () => string;
  bootstrapSync: () => Promise<void>;
  bootstrapClientSync: (clientId: string) => Promise<void>;
  shouldSyncClient: (clientId: string, maxAgeMs?: number) => boolean;
  saveClientKey: (...args: any[]) => void;
  saveKey: (key: string, value: any) => void;
  ensureClient: (clientId: string) => Promise<boolean>;
  upsert: (tableName: string, obj: any, conflictKey?: string) => Promise<any>;
  getSyncStatus: (key: string) => string;
  waitForSync: (key: string, timeout?: number) => Promise<string>;
  lsGet: (key: string, defaultValue?: any) => any;
  lsSet: (key: string, value: any) => void;
  _inited?: boolean;
  _lastClientSync?: { clientId: string; ts: number };
}

export interface HEYSProducts {
  getAll: () => Product[];
  setAll: (products: Product[]) => void;
  watch: (callback: (products: Product[]) => void) => () => void;
}

export interface HEYSPerformance {
  measure: <T>(name: string, fn: () => T) => T;
  measureAsync: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  increment: (name: string) => void;
  timing: (name: string, duration: number) => void; // Добавляем
  getStats: () => Record<string, any>;
  logSlow: (name: string, threshold?: number) => void;
  clear: () => void;
  getStorageSize: () => number;
  report: () => void;
  showStats: () => Record<string, any>;
}

export interface HEYSAnalytics {
  trackDataOperation: (type: string, details?: any) => void;
  trackUserInteraction: (action: string, details?: any) => void;
  trackApiCall: (endpoint: string, duration: number, success: boolean) => void;
  trackError: (error: string, details?: any) => void;
  getMetrics: () => Record<string, any>;
}

// === Report Types ===
export interface ReportRow {
  date: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  weight: number;
  bmr: number;
  kcalBalance: number;
  trainDuration: number;
  trainCalories: number;
  avgTrainHr: number;
  zone2: number;
  zone3: number;
  zone4: number;
  zone5: number;
  sleepHours: number;
  notes: string;
  proteinPct: number;
  fatPct: number;
  carbsPct: number;

  // Legacy fields for compatibility
  dstr?: string;
  totals?: MealTotals;
  activitySubtotal?: number;
  activitiesKcal?: number;
  dailyExp?: number;
  simplePct?: number;
  complexPct?: number;
  giAvg?: number;
  harmAvg?: number;
  mealsCount?: number;
  dayTargetDef?: number;
  sleepQuality?: number;
  sleepComment?: string;
  stressAvg?: number;
  wellbeingAvg?: number;
  moodAvg?: number;
  dayComment?: string;
  optimum?: number;
  defKcal?: number;
  defPct?: number;
  factDefPct?: number;
  factDefText?: string;
}

// === Virtual List Types ===
export interface VirtualListProps {
  items: any[];
  itemHeight: number;
  height: number;
  renderItem: (item: any, index: number) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

// === Error Boundary Types ===
export interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

// === Stats Types ===
export interface HEYSStats {
  aggregateDays: (days: DayRecord[]) => DayAggregation;
  calculateTrends: (days: DayRecord[]) => TrendData;
  getWeeklyStats: (days: DayRecord[]) => WeeklyStats;
  getRecentAverage: (daysCount?: number) => DayAggregation;
  comparePeriods: (
    period1: DayRecord[],
    period2: DayRecord[]
  ) => {
    period1: DayAggregation;
    period2: DayAggregation;
    diff: Partial<DayAggregation>;
  };
  findAnomalies: (
    days: DayRecord[],
    threshold?: number
  ) => Array<{
    date: string;
    type: 'high_kcal' | 'low_kcal' | 'high_weight' | 'low_weight';
    value: number;
    deviation: number;
  }>;
}

export interface DayAggregation {
  totalKcal: number;
  totalProt: number;
  totalFat: number;
  totalCarbs: number;
  days: number;
  avgKcal: number;
  avgProt: number;
  avgFat: number;
  avgCarbs: number;
}

export interface TrendData {
  kcalTrend: number[];
  weightTrend: number[];
  avgsByWeek: DayAggregation[];
}

export interface WeeklyStats {
  weeks: Array<{
    start: string;
    end: string;
    stats: DayAggregation;
  }>;
}

export {};
