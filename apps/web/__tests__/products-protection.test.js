/**
 * @fileoverview Tests for products protection logic
 * 
 * Критические тесты:
 * 1. BLOCKED protection — не уменьшаем количество продуктов
 * 2. Deduplicate — дедупликация по названию
 * 3. Orphan products — отслеживание и восстановление
 * 4. Empty array protection — не затираем существующие продукты
 */

import { describe, it, expect, beforeEach } from 'vitest';

// === ПРОДУКТЫ ДЛЯ ТЕСТОВ ===
const createProduct = (name, id = Date.now()) => ({
  id: `prod_${id}`,
  name,
  simple100: 10,
  complex100: 50,
  protein100: 15,
  badFat100: 2,
  goodFat100: 5,
  trans100: 0,
  fiber100: 3,
  gi: 45,
  harmScore: 5
});

// === ТЕСТЫ: BLOCKED PROTECTION ===
describe('Products BLOCKED Protection', () => {
  describe('shouldBlockProductsUpdate()', () => {
    /**
     * Симуляция логики блокировки из heys_core_v12.js
     * Не уменьшаем количество продуктов чтобы избежать потери данных
     */
    const shouldBlockProductsUpdate = (currentProducts, newProducts) => {
      if (!Array.isArray(currentProducts) || !Array.isArray(newProducts)) {
        return false;
      }
      // Блокируем если новый массив меньше текущего
      return newProducts.length < currentProducts.length;
    };

    it('blocks update when new products count is less than current', () => {
      const current = [createProduct('A', 1), createProduct('B', 2), createProduct('C', 3)];
      const newProducts = [createProduct('A', 1)];
      
      expect(shouldBlockProductsUpdate(current, newProducts)).toBe(true);
    });

    it('allows update when new products count is greater', () => {
      const current = [createProduct('A', 1)];
      const newProducts = [createProduct('A', 1), createProduct('B', 2), createProduct('C', 3)];
      
      expect(shouldBlockProductsUpdate(current, newProducts)).toBe(false);
    });

    it('allows update when products count is equal', () => {
      const current = [createProduct('A', 1), createProduct('B', 2)];
      const newProducts = [createProduct('C', 3), createProduct('D', 4)];
      
      expect(shouldBlockProductsUpdate(current, newProducts)).toBe(false);
    });

    it('does not block when current is empty', () => {
      const current = [];
      const newProducts = [createProduct('A', 1)];
      
      expect(shouldBlockProductsUpdate(current, newProducts)).toBe(false);
    });

    it('does not block when current is null', () => {
      const current = null;
      const newProducts = [createProduct('A', 1)];
      
      expect(shouldBlockProductsUpdate(current, newProducts)).toBe(false);
    });

    it('does not block when new is null', () => {
      const current = [createProduct('A', 1)];
      const newProducts = null;
      
      expect(shouldBlockProductsUpdate(current, newProducts)).toBe(false);
    });
  });

  describe('protectedSetProducts()', () => {
    /**
     * Обёртка setProducts с защитой от уменьшения
     */
    const protectedSetProducts = (currentProducts, newProducts) => {
      if (!Array.isArray(newProducts)) {
        return currentProducts;
      }
      if (Array.isArray(currentProducts) && newProducts.length < currentProducts.length) {
        return currentProducts; // BLOCKED
      }
      return newProducts;
    };

    it('keeps current products when new count is less', () => {
      const current = [createProduct('A', 1), createProduct('B', 2), createProduct('C', 3)];
      const newProducts = [createProduct('X', 10)];
      
      const result = protectedSetProducts(current, newProducts);
      
      expect(result).toBe(current);
      expect(result.length).toBe(3);
    });

    it('updates to new products when count is greater', () => {
      const current = [createProduct('A', 1)];
      const newProducts = [createProduct('A', 1), createProduct('B', 2), createProduct('C', 3)];
      
      const result = protectedSetProducts(current, newProducts);
      
      expect(result).toBe(newProducts);
      expect(result.length).toBe(3);
    });

    it('returns empty array when new is empty and current is empty', () => {
      const current = [];
      const newProducts = [];
      
      const result = protectedSetProducts(current, newProducts);
      
      expect(result).toEqual([]);
    });
  });
});

// === ТЕСТЫ: EMPTY ARRAY PROTECTION ===
describe('Empty Array Protection', () => {
  /**
   * Защита от затирания существующих продуктов пустым массивом
   */
  const shouldSaveProducts = (newProducts, existingProducts) => {
    // Не сохраняем пустой массив если есть существующие продукты
    if ((!newProducts || newProducts.length === 0) && 
        existingProducts && 
        Array.isArray(existingProducts) && 
        existingProducts.length > 0) {
      return false;
    }
    return true;
  };

  it('blocks saving empty array when existing products exist', () => {
    const existing = [createProduct('A', 1), createProduct('B', 2)];
    
    expect(shouldSaveProducts([], existing)).toBe(false);
  });

  it('blocks saving null when existing products exist', () => {
    const existing = [createProduct('A', 1)];
    
    expect(shouldSaveProducts(null, existing)).toBe(false);
  });

  it('allows saving products when existing is empty', () => {
    const existing = [];
    const newProducts = [createProduct('A', 1)];
    
    expect(shouldSaveProducts(newProducts, existing)).toBe(true);
  });

  it('allows saving products when existing is null', () => {
    const existing = null;
    const newProducts = [createProduct('A', 1)];
    
    expect(shouldSaveProducts(newProducts, existing)).toBe(true);
  });

  it('allows saving empty when existing is also empty', () => {
    expect(shouldSaveProducts([], [])).toBe(true);
  });
});

// === ТЕСТЫ: DEDUPLICATE ===
describe('Products Deduplicate', () => {
  /**
   * Дедупликация продуктов по названию
   * Первый с таким названием остаётся
   */
  const deduplicateProducts = (products) => {
    if (!Array.isArray(products)) {
      return {
        original: 0,
        deduplicated: 0,
        removed: 0,
        products: []
      };
    }
    
    const seen = new Map();
    const unique = [];
    
    for (const p of products) {
      const key = (p.name || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, true);
        unique.push(p);
      }
    }
    
    return {
      original: products.length,
      deduplicated: unique.length,
      removed: products.length - unique.length,
      products: unique
    };
  };

  it('removes exact duplicates', () => {
    const products = [
      createProduct('Apple', 1),
      createProduct('Apple', 2),
      createProduct('Banana', 3)
    ];
    
    const result = deduplicateProducts(products);
    
    expect(result.original).toBe(3);
    expect(result.deduplicated).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.products.map(p => p.name)).toEqual(['Apple', 'Banana']);
  });

  it('handles case-insensitive duplicates', () => {
    const products = [
      createProduct('Apple', 1),
      createProduct('APPLE', 2),
      createProduct('apple', 3),
      createProduct('Banana', 4)
    ];
    
    const result = deduplicateProducts(products);
    
    expect(result.deduplicated).toBe(2);
    expect(result.removed).toBe(2);
  });

  it('handles whitespace differences', () => {
    const products = [
      createProduct('Apple ', 1),
      createProduct(' Apple', 2),
      createProduct('  Apple  ', 3)
    ];
    
    const result = deduplicateProducts(products);
    
    expect(result.deduplicated).toBe(1);
    expect(result.removed).toBe(2);
  });

  it('keeps first occurrence', () => {
    const products = [
      { ...createProduct('Apple', 1), gi: 30 },
      { ...createProduct('Apple', 2), gi: 50 },
      { ...createProduct('Apple', 3), gi: 70 }
    ];
    
    const result = deduplicateProducts(products);
    
    expect(result.products.length).toBe(1);
    expect(result.products[0].gi).toBe(30); // First one kept
    expect(result.products[0].id).toBe('prod_1');
  });

  it('returns empty for null input', () => {
    const result = deduplicateProducts(null);
    
    expect(result.original).toBe(0);
    expect(result.products).toEqual([]);
  });

  it('returns unchanged for empty array', () => {
    const result = deduplicateProducts([]);
    
    expect(result.original).toBe(0);
    expect(result.deduplicated).toBe(0);
    expect(result.removed).toBe(0);
  });

  it('handles products with empty names', () => {
    const products = [
      createProduct('', 1),
      createProduct('', 2),
      createProduct('Apple', 3)
    ];
    
    const result = deduplicateProducts(products);
    
    // Empty names are duplicates of each other
    expect(result.deduplicated).toBe(2);
    expect(result.removed).toBe(1);
  });

  it('preserves all unique products', () => {
    const products = [
      createProduct('Apple', 1),
      createProduct('Banana', 2),
      createProduct('Cherry', 3),
      createProduct('Date', 4)
    ];
    
    const result = deduplicateProducts(products);
    
    expect(result.removed).toBe(0);
    expect(result.deduplicated).toBe(4);
  });
});

// === ТЕСТЫ: ORPHAN PRODUCTS ===
describe('Orphan Products Tracking', () => {
  let orphanProductsMap;

  beforeEach(() => {
    orphanProductsMap = new Map();
  });

  /**
   * Отслеживание orphan продуктов (используются из штампа, а не из базы)
   */
  const trackOrphanProduct = (item, dateStr, productsDatabase) => {
    const productId = item.product_id;
    const name = item.name || 'Unknown';
    
    // Проверяем есть ли продукт в базе
    const existsInDb = productsDatabase.some(p => 
      p.id === productId || 
      (p.name || '').toLowerCase() === name.toLowerCase()
    );
    
    if (existsInDb) {
      return false; // Не orphan
    }
    
    // Это orphan — добавляем в трекинг
    if (!orphanProductsMap.has(productId)) {
      orphanProductsMap.set(productId, {
        name,
        firstSeenDate: dateStr,
        daysUsed: [dateStr],
        item // Сохраняем штамп для возможного восстановления
      });
    } else {
      const existing = orphanProductsMap.get(productId);
      if (!existing.daysUsed.includes(dateStr)) {
        existing.daysUsed.push(dateStr);
      }
    }
    
    return true; // Is orphan
  };

  it('detects orphan product not in database', () => {
    const item = { product_id: 'orphan_1', name: 'Missing Product', grams: 100 };
    const database = [createProduct('Apple', 1), createProduct('Banana', 2)];
    
    const isOrphan = trackOrphanProduct(item, '2025-01-01', database);
    
    expect(isOrphan).toBe(true);
    expect(orphanProductsMap.has('orphan_1')).toBe(true);
  });

  it('does not track product that exists in database by ID', () => {
    const item = { product_id: 'prod_1', name: 'Apple', grams: 100 };
    const database = [{ ...createProduct('Apple', 1), id: 'prod_1' }];
    
    const isOrphan = trackOrphanProduct(item, '2025-01-01', database);
    
    expect(isOrphan).toBe(false);
    expect(orphanProductsMap.size).toBe(0);
  });

  it('does not track product that exists in database by name', () => {
    const item = { product_id: 'different_id', name: 'Apple', grams: 100 };
    const database = [createProduct('Apple', 1)];
    
    const isOrphan = trackOrphanProduct(item, '2025-01-01', database);
    
    expect(isOrphan).toBe(false);
  });

  it('tracks multiple days for same orphan product', () => {
    const item = { product_id: 'orphan_1', name: 'Missing', grams: 100 };
    const database = [];
    
    trackOrphanProduct(item, '2025-01-01', database);
    trackOrphanProduct(item, '2025-01-02', database);
    trackOrphanProduct(item, '2025-01-03', database);
    
    const orphan = orphanProductsMap.get('orphan_1');
    expect(orphan.daysUsed).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
  });

  it('does not duplicate same day', () => {
    const item = { product_id: 'orphan_1', name: 'Missing', grams: 100 };
    const database = [];
    
    trackOrphanProduct(item, '2025-01-01', database);
    trackOrphanProduct(item, '2025-01-01', database);
    trackOrphanProduct(item, '2025-01-01', database);
    
    const orphan = orphanProductsMap.get('orphan_1');
    expect(orphan.daysUsed).toEqual(['2025-01-01']);
  });

  it('preserves stamp data for recovery', () => {
    const item = { 
      product_id: 'orphan_1', 
      name: 'Missing Product',
      grams: 150,
      // Штамп содержит все нутриенты
      kcal: 200,
      prot: 10,
      carbs: 30,
      fat: 5
    };
    const database = [];
    
    trackOrphanProduct(item, '2025-01-01', database);
    
    const orphan = orphanProductsMap.get('orphan_1');
    expect(orphan.item.kcal).toBe(200);
    expect(orphan.item.prot).toBe(10);
  });

  /**
   * Восстановление orphan продукта в базу из штампа
   */
  const recoverOrphanProduct = (orphanData) => {
    const item = orphanData.item;
    
    // Конвертируем штамп в формат продукта (на 100г)
    const grams = item.grams || 100;
    const scale = 100 / grams;
    
    return {
      id: item.product_id,
      name: item.name,
      protein100: (item.prot || 0) * scale,
      simple100: 0, // Нет данных в штампе
      complex100: (item.carbs || 0) * scale, // Упрощение: все carbs → complex
      badFat100: 0,
      goodFat100: (item.fat || 0) * scale, // Упрощение: все fat → good
      trans100: 0,
      fiber100: 0,
      gi: 50, // Default GI
      harmScore: 0,
      recoveredFromStamp: true,
      recoveryDate: new Date().toISOString().split('T')[0]
    };
  };

  it('recovers product from stamp data', () => {
    const orphanData = {
      item: {
        product_id: 'orphan_1',
        name: 'Recovered Product',
        grams: 200,
        kcal: 400,
        prot: 20,
        carbs: 60,
        fat: 10
      }
    };
    
    const recovered = recoverOrphanProduct(orphanData);
    
    expect(recovered.id).toBe('orphan_1');
    expect(recovered.name).toBe('Recovered Product');
    expect(recovered.protein100).toBe(10); // 20g / 200g * 100 = 10
    expect(recovered.complex100).toBe(30); // 60g / 200g * 100 = 30
    expect(recovered.goodFat100).toBe(5); // 10g / 200g * 100 = 5
    expect(recovered.recoveredFromStamp).toBe(true);
  });
});

// === ТЕСТЫ: PRODUCTS SYNC MERGE ===
describe('Products Sync Merge', () => {
  /**
   * Merge логика для продуктов: объединение local + remote
   * Дедупликация по названию, предпочитаем более полные данные
   */
  const mergeProducts = (localProducts, remoteProducts) => {
    if (!Array.isArray(localProducts)) localProducts = [];
    if (!Array.isArray(remoteProducts)) remoteProducts = [];
    
    const merged = new Map();
    
    // Сначала добавляем remote (они могут быть более свежими)
    for (const p of remoteProducts) {
      const key = (p.name || '').trim().toLowerCase();
      if (key) {
        merged.set(key, p);
      }
    }
    
    // Потом добавляем local (если ещё нет)
    for (const p of localProducts) {
      const key = (p.name || '').trim().toLowerCase();
      if (key && !merged.has(key)) {
        merged.set(key, p);
      }
    }
    
    return Array.from(merged.values());
  };

  it('combines products from both sources', () => {
    const local = [createProduct('Apple', 1), createProduct('Banana', 2)];
    const remote = [createProduct('Cherry', 3), createProduct('Date', 4)];
    
    const result = mergeProducts(local, remote);
    
    expect(result.length).toBe(4);
  });

  it('deduplicates by name (remote wins)', () => {
    const local = [{ ...createProduct('Apple', 1), gi: 30 }];
    const remote = [{ ...createProduct('Apple', 2), gi: 50 }];
    
    const result = mergeProducts(local, remote);
    
    expect(result.length).toBe(1);
    expect(result[0].gi).toBe(50); // Remote version
  });

  it('keeps local-only products', () => {
    const local = [createProduct('LocalOnly', 1), createProduct('Shared', 2)];
    const remote = [createProduct('Shared', 3)];
    
    const result = mergeProducts(local, remote);
    
    expect(result.length).toBe(2);
    expect(result.some(p => p.name === 'LocalOnly')).toBe(true);
  });

  it('keeps remote-only products', () => {
    const local = [createProduct('Shared', 1)];
    const remote = [createProduct('Shared', 2), createProduct('RemoteOnly', 3)];
    
    const result = mergeProducts(local, remote);
    
    expect(result.length).toBe(2);
    expect(result.some(p => p.name === 'RemoteOnly')).toBe(true);
  });

  it('handles empty local', () => {
    const local = [];
    const remote = [createProduct('A', 1), createProduct('B', 2)];
    
    const result = mergeProducts(local, remote);
    
    expect(result.length).toBe(2);
  });

  it('handles empty remote', () => {
    const local = [createProduct('A', 1), createProduct('B', 2)];
    const remote = [];
    
    const result = mergeProducts(local, remote);
    
    expect(result.length).toBe(2);
  });

  it('handles null inputs', () => {
    expect(mergeProducts(null, null).length).toBe(0);
    expect(mergeProducts(null, [createProduct('A', 1)]).length).toBe(1);
    expect(mergeProducts([createProduct('A', 1)], null).length).toBe(1);
  });

  it('handles case-insensitive merge', () => {
    const local = [createProduct('apple', 1)];
    const remote = [createProduct('APPLE', 2)];
    
    const result = mergeProducts(local, remote);
    
    expect(result.length).toBe(1);
  });
});

// === ТЕСТЫ: AUTO DEDUPLICATE THRESHOLD ===
describe('Auto Deduplicate Threshold', () => {
  /**
   * Автоматическая дедупликация при подозрительно большом количестве продуктов
   */
  const DEDUPE_THRESHOLD = 1000;

  const shouldAutoDeduplicate = (productsCount) => {
    return productsCount > DEDUPE_THRESHOLD;
  };

  it('triggers dedupe when products exceed threshold', () => {
    expect(shouldAutoDeduplicate(1001)).toBe(true);
    expect(shouldAutoDeduplicate(2000)).toBe(true);
    expect(shouldAutoDeduplicate(5000)).toBe(true);
  });

  it('does not trigger dedupe for normal counts', () => {
    expect(shouldAutoDeduplicate(100)).toBe(false);
    expect(shouldAutoDeduplicate(500)).toBe(false);
    expect(shouldAutoDeduplicate(999)).toBe(false);
    expect(shouldAutoDeduplicate(1000)).toBe(false);
  });
});
