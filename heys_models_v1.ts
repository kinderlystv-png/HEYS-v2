// heys_models_v1.ts — доменные модели и вычисления (TypeScript version)

// Import existing types to maintain compatibility
import type {
  HEYSGlobal,
  Meal,
  DayRecord,
  UserProfile,
  Product,
  MealItem,
  Training,
  MealTotals,
  NutritionTotals,
  ProductIndex,
} from './types/heys';

// Declare global HEYS namespace
declare global {
  interface Window {
    HEYS: HEYSGlobal;
  }
}
//
// Product index for fast lookups
// Computed nutrition per 100g
interface NutritionPer100g {
  readonly kcal100: number;
  readonly carbs100: number;
  readonly prot100: number;
  readonly fat100: number;
  readonly simple100: number;
  readonly complex100: number;
  readonly bad100: number;
  readonly good100: number;
  readonly trans100: number;
  readonly fiber100: number;
}

// Derived product data
export interface DerivedProduct {
  readonly carbs100: number;
  readonly fat100: number;
  readonly kcal100: number;
}

// Module implementation
(function (global: Window & typeof globalThis): void {
  const HEYS = (global.HEYS = global.HEYS || {});
  const M = (HEYS.models = HEYS.models || {});

  // Utility functions with proper TypeScript types
  function round1(v: number): number {
    return Math.round(v * 10) / 10;
  }

  function uuid(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  function pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  function todayISO(): string {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function ensureDay(d: Partial<DayRecord> | null, prof?: UserProfile): DayRecord {
    d = d || {};

    // Определяем, задан ли вес явно
    const hasExplicitWeight =
      d.weightMorning != null && d.weightMorning !== '' && d.weightMorning !== 0;

    const base: DayRecord = {
      date: d.date || todayISO(),
      sleepStart: d.sleepStart || '',
      sleepEnd: d.sleepEnd || '',
      sleepNote: d.sleepNote || '',
      sleepQuality: d.sleepQuality === '' ? '' : d.sleepQuality != null ? d.sleepQuality : '',
      weightMorning: hasExplicitWeight ? d.weightMorning! : d.weightMorning || '',
      deficitPct: hasExplicitWeight
        ? d.deficitPct != null
          ? d.deficitPct
          : (prof && prof.deficitPctTarget) || 0
        : d.deficitPct || '',
      steps: +d.steps! || 0,
      householdMin: +d.householdMin! || 0,
      trainings: Array.isArray(d.trainings)
        ? d.trainings
        : [{ z: [0, 0, 0, 0] }, { z: [0, 0, 0, 0] }],
      dayScore: d.dayScore === '' ? '' : d.dayScore != null ? d.dayScore : '',
      moodAvg: d.moodAvg === '' ? '' : d.moodAvg != null ? d.moodAvg : '',
      wellbeingAvg: d.wellbeingAvg === '' ? '' : d.wellbeingAvg != null ? d.wellbeingAvg : '',
      stressAvg: d.stressAvg === '' ? '' : d.stressAvg != null ? d.stressAvg : '',
      dayComment: d.dayComment || '',
      meals: Array.isArray(d.meals)
        ? d.meals
        : [
            {
              id: uuid(),
              name: 'Приём пищи',
              time: '',
              mood: '',
              wellbeing: '',
              stress: '',
              items: [],
            },
          ],
    };

    // Ensure trainings array has proper structure
    let trainings = base.trainings as Training[];
    if (!Array.isArray(trainings)) trainings = [{ z: [0, 0, 0, 0] }, { z: [0, 0, 0, 0] }];
    if (trainings.length < 2) {
      const newTrainings = [...trainings];
      while (newTrainings.length < 2) {
        newTrainings.push({ z: [0, 0, 0, 0] });
      }
      trainings = newTrainings;
    }

    trainings = trainings.map((t: any) =>
      t && Array.isArray(t.z)
        ? { z: [+t.z[0] || 0, +t.z[1] || 0, +t.z[2] || 0, +t.z[3] || 0] }
        : { z: [0, 0, 0, 0] }
    );

    return {
      ...base,
      trainings,
    };
  }

  function computeDerivedProduct(p: Partial<Product>): DerivedProduct {
    const carbs = +p.carbs100! || (+p.simple100! || 0) + (+p.complex100! || 0);
    const fat = +p.fat100! || (+p.badFat100! || 0) + (+p.goodFat100! || 0) + (+p.trans100! || 0);
    const kcal = +p.kcal100! || 4 * ((+p.protein100! || 0) + carbs) + 8 * fat;
    return {
      carbs100: round1(carbs),
      fat100: round1(fat),
      kcal100: round1(kcal),
    };
  }

  function buildProductIndex(ps: readonly Product[]): ProductIndex {
    const byId = new Map<string, Product>();
    const byName = new Map<string, Product>();

    (ps || []).forEach((p: Product) => {
      if (!p) return;
      const id = p.id != null ? p.id : (p as any).product_id;
      if (id != null) byId.set(String(id).toLowerCase(), p);
      const nm = String(p.name || (p as any).title || '')
        .trim()
        .toLowerCase();
      if (nm) byName.set(nm, p);
    });

    return { byId, byName };
  }

  function getProductFromItem(it: MealItem, idx: ProductIndex): Product | null {
    if (!it) return null;
    if (it.product_id != null) return idx.byId.get(String(it.product_id).toLowerCase()) || null;
    if (it.productId != null) return idx.byId.get(String(it.productId).toLowerCase()) || null;
    const nm = String(it.name || '')
      .trim()
      .toLowerCase();
    return nm ? idx.byName.get(nm) || null : null;
  }

  function per100(p: Product): NutritionPer100g {
    const d = computeDerivedProduct(p);
    return {
      kcal100: d.kcal100,
      carbs100: d.carbs100,
      prot100: +p.protein100 || 0,
      fat100: d.fat100,
      simple100: +p.simple100 || 0,
      complex100: +p.complex100 || 0,
      bad100: +p.badFat100 || 0,
      good100: +p.goodFat100 || 0,
      trans100: +p.trans100 || 0,
      fiber100: +p.fiber100 || 0,
    };
  }

  function scale(v: number, g: number): number {
    return Math.round((((+v || 0) * (+g || 0)) / 100) * 10) / 10;
  }

  // Meal totals with caching
  const _mealTotalsCache = new Map<string, NutritionTotals>();

  function mealSignature(meal: Meal): string {
    if (!meal || !Array.isArray(meal.items)) return '';
    return meal.items
      .map((it: MealItem) => `${it.product_id || it.productId || it.name || ''}:${it.grams || 0}`)
      .join('|');
  }

  function idxSignature(idx: ProductIndex): string {
    if (!idx || !idx.byId) return '';
    return Array.from(idx.byId.keys()).join(',');
  }

  function mealTotals(meal: Meal, idx: ProductIndex): MealTotals {
    const key = (meal.id || '') + '::' + mealSignature(meal) + '::' + idxSignature(idx);
    if (_mealTotalsCache.has(key)) return _mealTotalsCache.get(key)!;

    const T: MealTotals = {
      kcal: 0,
      carbs: 0,
      simple: 0,
      complex: 0,
      prot: 0,
      protein: 0,
      fat: 0,
      bad: 0,
      good: 0,
      trans: 0,
      fiber: 0,
    };

    (meal.items || []).forEach((it: MealItem) => {
      const p = getProductFromItem(it, idx) || ({} as Product);
      const per = per100(p);
      const G = +it.grams || 0;
      T.kcal += scale(per.kcal100, G);
      T.carbs += scale(per.carbs100, G);
      T.simple += scale(per.simple100, G);
      T.complex += scale(per.complex100, G);
      T.prot += scale(per.prot100, G);
      T.protein += scale(per.prot100, G); // Same as prot for compatibility
      T.fat += scale(per.fat100, G);
      T.bad += scale(per.bad100, G);
      T.good += scale(per.good100, G);
      T.trans += scale(per.trans100, G);
      T.fiber += scale(per.fiber100, G);
    });

    Object.keys(T).forEach(k => ((T as any)[k] = round1((T as any)[k])));
    _mealTotalsCache.set(key, T);
    return T;
  }

  // Export to HEYS namespace
  M.ensureDay = ensureDay;
  M.buildProductIndex = buildProductIndex;
  M.getProductFromItem = getProductFromItem;
  M.mealTotals = mealTotals;
  M.computeDerivedProduct = computeDerivedProduct;
  M.uuid = uuid;
  M.round1 = round1;
  M.todayISO = todayISO;
})(window);
