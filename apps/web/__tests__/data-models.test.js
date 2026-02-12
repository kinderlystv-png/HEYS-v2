/**
 * @fileoverview Tests for data models and calculations
 * 
 * Критические тесты:
 * 1. computeDerivedProduct — расчёт калорий, углеводов, жиров
 * 2. getProductFromItem — поиск продукта по item
 * 3. mealTotals — суммирование нутриентов приёма
 * 4. Validation — проверка структуры данных
 */

import { describe, it, expect } from 'vitest';

// === HELPER FUNCTIONS (из heys_models_v1.js) ===
const round1 = (v) => Math.round((+v || 0) * 10) / 10;

function computeDerivedProduct(p) {
  const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
  const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
  const kcal = (+p.kcal100) || (4 * ((+p.protein100 || 0) + carbs) + 8 * fat);
  return { carbs100: round1(carbs), fat100: round1(fat), kcal100: round1(kcal) };
}

function buildProductIndex(ps) {
  const byId = new Map();
  const byName = new Map();
  (ps || []).forEach(p => {
    if (!p) return;
    const id = (p.id != null ? p.id : p.product_id);
    if (id != null) byId.set(String(id).toLowerCase(), p);
    const nm = String(p.name || p.title || '').trim().toLowerCase();
    if (nm) byName.set(nm, p);
  });
  return { byId, byName };
}

function getProductFromItem(it, idx) {
  if (!it) return null;
  // Сначала ищем по названию (приоритет)
  const nm = String(it.name || it.title || '').trim().toLowerCase();
  if (nm && idx.byName) {
    const found = idx.byName.get(nm);
    if (found) return found;
  }
  // Fallback: ищем в индексе по product_id
  if (it.product_id != null && idx.byId) {
    const found = idx.byId.get(String(it.product_id).toLowerCase());
    if (found) return found;
  }
  if (it.productId != null && idx.byId) {
    const found = idx.byId.get(String(it.productId).toLowerCase());
    if (found) return found;
  }
  // FALLBACK: если в item есть нутриенты — возвращаем сам item
  if (it.kcal100 !== undefined || it.protein100 !== undefined) {
    return it;
  }
  return null;
}

function per100(p) {
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
    fiber100: +p.fiber100 || 0
  };
}

function scale(v, g) {
  return Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10;
}

function mealTotals(meal, idx) {
  const T = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
  (meal.items || []).forEach(it => {
    const p = getProductFromItem(it, idx) || {};
    const per = per100(p);
    const G = +it.grams || 0;
    T.kcal += scale(per.kcal100, G);
    T.carbs += scale(per.carbs100, G);
    T.simple += scale(per.simple100, G);
    T.complex += scale(per.complex100, G);
    T.prot += scale(per.prot100, G);
    T.fat += scale(per.fat100, G);
    T.bad += scale(per.bad100, G);
    T.good += scale(per.good100, G);
    T.trans += scale(per.trans100, G);
    T.fiber += scale(per.fiber100, G);
  });
  Object.keys(T).forEach(k => T[k] = round1(T[k]));
  return T;
}

// Validation functions
function validateProduct(product) {
  if (!product || typeof product !== 'object') return false;
  if (!product.name || typeof product.name !== 'string') return false;
  if (typeof product.kcal100 !== 'number' || product.kcal100 < 0) return false;
  return true;
}

function validateMeal(meal) {
  if (!meal || typeof meal !== 'object') return false;
  if (!meal.name || typeof meal.name !== 'string') return false;
  if (!Array.isArray(meal.items)) return false;
  return true;
}

function validateDay(day) {
  if (!day || typeof day !== 'object') return false;
  if (!day.date || typeof day.date !== 'string') return false;
  if (!Array.isArray(day.meals)) return false;
  return true;
}

// === ТЕСТЫ: computeDerivedProduct ===
describe('computeDerivedProduct', () => {
  it('calculates kcal from protein, carbs, fat', () => {
    const product = {
      protein100: 10,
      simple100: 5,
      complex100: 15, // carbs = 20
      badFat100: 3,
      goodFat100: 5,
      trans100: 0 // fat = 8
    };

    const result = computeDerivedProduct(product);

    // kcal = 4*(protein + carbs) + 8*fat = 4*(10+20) + 8*8 = 120 + 64 = 184
    // WAIT: формула = 4*((protein100||0)+carbs) + 8*fat
    // = 4*(10+20) + 8*8 = 120 + 64 = 184
    expect(result.carbs100).toBe(20);
    expect(result.fat100).toBe(8);
    expect(result.kcal100).toBe(184);
  });

  it('uses existing kcal100 if provided', () => {
    const product = {
      kcal100: 250,
      protein100: 10,
      carbs100: 30,
      fat100: 5
    };

    const result = computeDerivedProduct(product);

    expect(result.kcal100).toBe(250); // Uses provided value
    expect(result.carbs100).toBe(30);
    expect(result.fat100).toBe(5);
  });

  it('uses carbs100 if provided instead of calculating', () => {
    const product = {
      protein100: 10,
      carbs100: 50, // Direct carbs value
      simple100: 5, // Should be ignored
      complex100: 10 // Should be ignored
    };

    const result = computeDerivedProduct(product);

    expect(result.carbs100).toBe(50); // Uses provided carbs100
  });

  it('handles zero values', () => {
    const product = {
      protein100: 0,
      simple100: 0,
      complex100: 0,
      badFat100: 0,
      goodFat100: 0,
      trans100: 0
    };

    const result = computeDerivedProduct(product);

    expect(result.kcal100).toBe(0);
    expect(result.carbs100).toBe(0);
    expect(result.fat100).toBe(0);
  });

  it('handles null/undefined values', () => {
    const product = {};

    const result = computeDerivedProduct(product);

    expect(result.kcal100).toBe(0);
    expect(result.carbs100).toBe(0);
    expect(result.fat100).toBe(0);
  });

  it('rounds to 1 decimal place', () => {
    const product = {
      protein100: 10.333,
      simple100: 5.555,
      complex100: 10.111 // carbs = 15.666
    };

    const result = computeDerivedProduct(product);

    expect(result.carbs100).toBe(15.7); // Rounded
  });
});

// === ТЕСТЫ: buildProductIndex ===
describe('buildProductIndex', () => {
  it('indexes products by ID and name', () => {
    const products = [
      { id: 'prod_1', name: 'Apple' },
      { id: 'prod_2', name: 'Banana' }
    ];

    const idx = buildProductIndex(products);

    expect(idx.byId.get('prod_1').name).toBe('Apple');
    expect(idx.byName.get('apple').id).toBe('prod_1');
  });

  it('handles product_id as fallback', () => {
    const products = [
      { product_id: 123, name: 'Cherry' }
    ];

    const idx = buildProductIndex(products);

    expect(idx.byId.get('123').name).toBe('Cherry');
  });

  it('handles empty array', () => {
    const idx = buildProductIndex([]);

    expect(idx.byId.size).toBe(0);
    expect(idx.byName.size).toBe(0);
  });

  it('handles null/undefined', () => {
    const idx = buildProductIndex(null);

    expect(idx.byId.size).toBe(0);
    expect(idx.byName.size).toBe(0);
  });

  it('normalizes names to lowercase', () => {
    const products = [
      { id: '1', name: 'APPLE PIE' }
    ];

    const idx = buildProductIndex(products);

    expect(idx.byName.get('apple pie')).toBeDefined();
    expect(idx.byName.get('APPLE PIE')).toBeUndefined();
  });

  it('trims whitespace from names', () => {
    const products = [
      { id: '1', name: '  Apple  ' }
    ];

    const idx = buildProductIndex(products);

    expect(idx.byName.get('apple')).toBeDefined();
  });
});

// === ТЕСТЫ: getProductFromItem ===
describe('getProductFromItem', () => {
  const products = [
    { id: 'prod_1', name: 'Apple', kcal100: 52 },
    { id: 'prod_2', name: 'Banana', kcal100: 89 }
  ];
  const idx = buildProductIndex(products);

  it('finds product by name (priority)', () => {
    const item = { name: 'Apple', product_id: 'wrong_id', grams: 100 };

    const product = getProductFromItem(item, idx);

    expect(product.id).toBe('prod_1');
    expect(product.kcal100).toBe(52);
  });

  it('falls back to product_id if name not found', () => {
    const item = { name: 'Unknown', product_id: 'prod_2', grams: 100 };

    const product = getProductFromItem(item, idx);

    expect(product.id).toBe('prod_2');
    expect(product.name).toBe('Banana');
  });

  it('returns null if product not found', () => {
    const item = { name: 'NotExists', product_id: 'invalid', grams: 100 };

    const product = getProductFromItem(item, idx);

    expect(product).toBeNull();
  });

  it('returns item itself if it has nutrient data (stamp fallback)', () => {
    const item = { 
      name: 'OrphanProduct', 
      product_id: 'orphan', 
      grams: 100,
      kcal100: 200, // Has nutrient data from stamp
      protein100: 10
    };

    const product = getProductFromItem(item, idx);

    expect(product).toBe(item); // Returns the item itself
    expect(product.kcal100).toBe(200);
  });

  it('returns null for null item', () => {
    expect(getProductFromItem(null, idx)).toBeNull();
  });

  it('handles case-insensitive name matching', () => {
    const item = { name: 'APPLE', grams: 100 };

    const product = getProductFromItem(item, idx);

    expect(product.id).toBe('prod_1');
  });

  it('handles productId (camelCase) as fallback', () => {
    const item = { name: 'Unknown', productId: 'prod_1', grams: 100 };

    const product = getProductFromItem(item, idx);

    expect(product.name).toBe('Apple');
  });
});

// === ТЕСТЫ: mealTotals ===
describe('mealTotals', () => {
  const products = [
    { 
      id: 'prod_1', 
      name: 'Apple', 
      kcal100: 52, 
      protein100: 0.3, 
      carbs100: 14,
      simple100: 10,
      complex100: 4,
      fat100: 0.2,
      badFat100: 0,
      goodFat100: 0.2,
      trans100: 0,
      fiber100: 2.4
    },
    { 
      id: 'prod_2', 
      name: 'Chicken', 
      kcal100: 165, 
      protein100: 31, 
      carbs100: 0,
      simple100: 0,
      complex100: 0,
      fat100: 3.6,
      badFat100: 1,
      goodFat100: 2.6,
      trans100: 0,
      fiber100: 0
    }
  ];
  const idx = buildProductIndex(products);

  it('calculates totals for single item', () => {
    const meal = {
      name: 'Snack',
      items: [{ name: 'Apple', grams: 150 }]
    };

    const totals = mealTotals(meal, idx);

    // 150g of Apple (52 kcal/100g) = 78 kcal
    expect(totals.kcal).toBe(78);
    expect(totals.prot).toBe(0.5); // 0.3 * 1.5 = 0.45 → 0.5
    expect(totals.fiber).toBe(3.6); // 2.4 * 1.5 = 3.6
  });

  it('calculates totals for multiple items', () => {
    const meal = {
      name: 'Lunch',
      items: [
        { name: 'Apple', grams: 100 },
        { name: 'Chicken', grams: 200 }
      ]
    };

    const totals = mealTotals(meal, idx);

    // Apple: 52 kcal + Chicken: 330 kcal = 382 kcal
    expect(totals.kcal).toBe(382);
    // Apple: 0.3g + Chicken: 62g = 62.3g
    expect(totals.prot).toBe(62.3);
  });

  it('handles empty items array', () => {
    const meal = { name: 'Empty', items: [] };

    const totals = mealTotals(meal, idx);

    expect(totals.kcal).toBe(0);
    expect(totals.prot).toBe(0);
    expect(totals.carbs).toBe(0);
    expect(totals.fat).toBe(0);
  });

  it('handles missing items array', () => {
    const meal = { name: 'NoItems' };

    const totals = mealTotals(meal, idx);

    expect(totals.kcal).toBe(0);
  });

  it('handles item with zero grams', () => {
    const meal = {
      name: 'Test',
      items: [{ name: 'Apple', grams: 0 }]
    };

    const totals = mealTotals(meal, idx);

    expect(totals.kcal).toBe(0);
  });

  it('uses stamp data for orphan products', () => {
    const meal = {
      name: 'Test',
      items: [{ 
        name: 'OrphanProduct', 
        grams: 100,
        kcal100: 300,
        protein100: 20
      }]
    };

    const totals = mealTotals(meal, idx);

    expect(totals.kcal).toBe(300);
    expect(totals.prot).toBe(20);
  });

  it('handles product not found (zero contribution)', () => {
    const meal = {
      name: 'Test',
      items: [{ name: 'NotInDatabase', grams: 100 }]
    };

    const totals = mealTotals(meal, idx);

    // No kcal100/protein100 in item, product not found = 0
    expect(totals.kcal).toBe(0);
  });
});

// === ТЕСТЫ: Validation ===
describe('Validation Functions', () => {
  describe('validateProduct', () => {
    it('returns true for valid product', () => {
      const product = { name: 'Apple', kcal100: 52 };
      expect(validateProduct(product)).toBe(true);
    });

    it('returns false for null', () => {
      expect(validateProduct(null)).toBe(false);
    });

    it('returns false for missing name', () => {
      expect(validateProduct({ kcal100: 52 })).toBe(false);
    });

    it('returns false for non-string name', () => {
      expect(validateProduct({ name: 123, kcal100: 52 })).toBe(false);
    });

    it('returns false for negative kcal', () => {
      expect(validateProduct({ name: 'Apple', kcal100: -10 })).toBe(false);
    });

    it('returns false for non-number kcal', () => {
      expect(validateProduct({ name: 'Apple', kcal100: '52' })).toBe(false);
    });
  });

  describe('validateMeal', () => {
    it('returns true for valid meal', () => {
      const meal = { name: 'Lunch', items: [] };
      expect(validateMeal(meal)).toBe(true);
    });

    it('returns true for meal with items', () => {
      const meal = { name: 'Lunch', items: [{ name: 'Apple', grams: 100 }] };
      expect(validateMeal(meal)).toBe(true);
    });

    it('returns false for null', () => {
      expect(validateMeal(null)).toBe(false);
    });

    it('returns false for missing name', () => {
      expect(validateMeal({ items: [] })).toBe(false);
    });

    it('returns false for missing items array', () => {
      expect(validateMeal({ name: 'Lunch' })).toBe(false);
    });

    it('returns false for non-array items', () => {
      expect(validateMeal({ name: 'Lunch', items: 'not array' })).toBe(false);
    });
  });

  describe('validateDay', () => {
    it('returns true for valid day', () => {
      const day = { date: '2025-01-15', meals: [] };
      expect(validateDay(day)).toBe(true);
    });

    it('returns true for day with meals', () => {
      const day = { 
        date: '2025-01-15', 
        meals: [{ name: 'Lunch', items: [] }] 
      };
      expect(validateDay(day)).toBe(true);
    });

    it('returns false for null', () => {
      expect(validateDay(null)).toBe(false);
    });

    it('returns false for missing date', () => {
      expect(validateDay({ meals: [] })).toBe(false);
    });

    it('returns false for missing meals array', () => {
      expect(validateDay({ date: '2025-01-15' })).toBe(false);
    });

    it('returns false for non-array meals', () => {
      expect(validateDay({ date: '2025-01-15', meals: {} })).toBe(false);
    });

    it('returns false for non-string date', () => {
      expect(validateDay({ date: 12345, meals: [] })).toBe(false);
    });
  });
});

// === ТЕСТЫ: scale helper ===
describe('scale helper', () => {
  it('scales value by grams', () => {
    // 52 kcal/100g * 150g = 78 kcal
    expect(scale(52, 150)).toBe(78);
  });

  it('handles zero grams', () => {
    expect(scale(100, 0)).toBe(0);
  });

  it('handles zero value', () => {
    expect(scale(0, 150)).toBe(0);
  });

  it('rounds to 1 decimal', () => {
    // 52 * 33 / 100 = 17.16 → 17.2
    expect(scale(52, 33)).toBe(17.2);
  });

  it('handles null/undefined', () => {
    expect(scale(null, 100)).toBe(0);
    expect(scale(100, null)).toBe(0);
    expect(scale(undefined, 100)).toBe(0);
  });
});
// === ТЕСТЫ: Phase 0 — Extended Nutrient Aliases (12.02.2026) ===
// Проверяем, что omega3/omega6/cholesterol получают правильные aliases в normalizer
describe('Extended nutrient aliases (Phase 0)', () => {
  // Эмуляция normalizeExtendedProduct() из heys_models_v1.js:1443
  function normalizeExtendedProduct(product) {
    const result = { ...product };

    const extendedAliases = [
      { snake: 'omega3_100', camel: 'omega3', type: 'number' },
      { snake: 'omega6_100', camel: 'omega6', type: 'number' },
      { snake: 'cholesterol', camel: 'cholesterol100', type: 'number' }
    ];

    extendedAliases.forEach(({ snake, camel, type }) => {
      if (result[camel] == null && result[snake] != null) {
        result[camel] = result[snake];
      }
      if (result[snake] == null && result[camel] != null) {
        result[snake] = result[camel];
      }

      if (type === 'number') {
        if (result[snake] != null && typeof result[snake] !== 'number') {
          result[snake] = parseFloat(result[snake]) || 0;
        }
        if (result[camel] != null && typeof result[camel] !== 'number') {
          result[camel] = parseFloat(result[camel]) || 0;
        }
      }
    });

    return result;
  }

  it('creates omega3 alias from omega3_100', () => {
    const product = { id: 'test', title: 'Salmon', omega3_100: 500 };
    const normalized = normalizeExtendedProduct(product);
    expect(normalized.omega3_100).toBe(500);
    expect(normalized.omega3).toBe(500);
  });

  it('creates omega6 alias from omega6_100', () => {
    const product = { id: 'test', title: 'Walnuts', omega6_100: 1200 };
    const normalized = normalizeExtendedProduct(product);
    expect(normalized.omega6_100).toBe(1200);
    expect(normalized.omega6).toBe(1200);
  });

  it('creates cholesterol100 alias from cholesterol', () => {
    const product = { id: 'test', title: 'Eggs', cholesterol: 372 };
    const normalized = normalizeExtendedProduct(product);
    expect(normalized.cholesterol).toBe(372);
    expect(normalized.cholesterol100).toBe(372);
  });

  it('handles all three fields together', () => {
    const product = {
      id: 'test',
      title: 'Mackerel',
      omega3_100: 2670,
      omega6_100: 219,
      cholesterol: 70
    };
    const normalized = normalizeExtendedProduct(product);
    expect(normalized.omega3).toBe(2670);
    expect(normalized.omega6).toBe(219);
    expect(normalized.cholesterol100).toBe(70);
  });

  it('handles missing values', () => {
    const product = { id: 'test', title: 'Rice' };
    const normalized = normalizeExtendedProduct(product);
    expect(normalized.omega3).toBeUndefined();
    expect(normalized.omega6).toBeUndefined();
    expect(normalized.cholesterol100).toBeUndefined();
  });

  it('parses string values to numbers', () => {
    const product = { id: 'test', title: 'Test', omega3_100: '500', cholesterol: '45' };
    const normalized = normalizeExtendedProduct(product);
    expect(normalized.omega3_100).toBe(500);
    expect(normalized.omega3).toBe(500);
    expect(normalized.cholesterol).toBe(45);
    expect(normalized.cholesterol100).toBe(45);
  });

  it('handles fallback chains (like pi_patterns.js)', () => {
    const product = { id: 'test', title: 'Chia', omega3_100: 17830 };
    const normalized = normalizeExtendedProduct(product);
    // Эмулируем fallback из pi_patterns.js:2762
    const omega3Val = normalized.omega3_100 || normalized.omega3;
    expect(omega3Val).toBe(17830);
  });
});