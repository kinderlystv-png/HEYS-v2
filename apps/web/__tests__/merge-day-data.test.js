/**
 * Тесты для mergeDayData — ключевая функция разрешения конфликтов sync
 * 
 * mergeDayData() определяет какие данные побеждают при конфликте local vs remote:
 * - Числовые поля (steps, waterMl) — берём максимум
 * - Редактируемые поля (householdMin, weight) — берём свежее
 * - Meals — merge по ID с учётом удалений
 * - Trainings — merge с учётом намеренных удалений
 * 
 * Создано: 2025-12-12
 */

import { describe, test, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
// Копируем mergeDayData для тестирования (isolated unit tests)
// В production используется из heys_storage_supabase_v1.js
// ═══════════════════════════════════════════════════════════════════

function mergeItemsById(remoteItems = [], localItems = [], preferLocal = true) {
  if (!preferLocal) {
    return remoteItems.filter(item => item && item.id);
  }
  
  const itemsMap = new Map();
  remoteItems.forEach(item => {
    if (item && item.id) {
      itemsMap.set(item.id, item);
    }
  });
  localItems.forEach(item => {
    if (item && item.id) {
      itemsMap.set(item.id, item);
    }
  });
  
  return Array.from(itemsMap.values());
}

function mergeDayData(local, remote, options = {}) {
  const forceKeepAll = options.forceKeepAll || false;
  const preferRemote = options.preferRemote || false;
  
  if (!local || !remote) return null;
  
  // Если данные идентичны — merge не нужен
  const localJson = JSON.stringify({ ...local, updatedAt: 0, _sourceId: '' });
  const remoteJson = JSON.stringify({ ...remote, updatedAt: 0, _sourceId: '' });
  if (localJson === remoteJson) return null;
  
  const merged = {
    ...remote,
    date: local.date || remote.date,
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
    _mergedAt: Date.now(),
  };
  
  // Числовые поля: берём максимум
  merged.steps = Math.max(local.steps || 0, remote.steps || 0);
  merged.waterMl = Math.max(local.waterMl || 0, remote.waterMl || 0);
  
  // householdMin — берём свежее
  if ((local.updatedAt || 0) >= (remote.updatedAt || 0)) {
    merged.householdMin = local.householdMin ?? remote.householdMin ?? 0;
  } else {
    merged.householdMin = remote.householdMin ?? local.householdMin ?? 0;
  }
  
  // Вес: берём любое ненулевое
  if (local.weightMorning && remote.weightMorning) {
    merged.weightMorning = (local.updatedAt || 0) >= (remote.updatedAt || 0) 
      ? local.weightMorning 
      : remote.weightMorning;
  } else {
    merged.weightMorning = local.weightMorning || remote.weightMorning || 0;
  }
  
  // Meals: merge по ID
  const localMeals = local.meals || [];
  const remoteMeals = remote.meals || [];
  const mealsMap = new Map();
  const localMealIds = new Set(localMeals.filter(m => m?.id).map(m => m.id));
  const localIsNewer = (local.updatedAt || 0) >= (remote.updatedAt || 0);
  
  remoteMeals.forEach(meal => {
    if (!meal || !meal.id) return;
    
    if (!forceKeepAll && !preferRemote && localIsNewer && !localMealIds.has(meal.id)) {
      // Удалён локально
      return;
    }
    
    mealsMap.set(meal.id, meal);
  });
  
  localMeals.forEach(meal => {
    if (!meal || !meal.id) return;
    const existing = mealsMap.get(meal.id);
    if (!existing) {
      mealsMap.set(meal.id, meal);
    } else {
      const preferLocal = preferRemote ? false : localIsNewer;
      const mergedItems = mergeItemsById(existing.items || [], meal.items || [], preferLocal);
      const mergedMeal = preferRemote
        ? { ...meal, ...existing, items: mergedItems }
        : localIsNewer 
          ? { ...existing, ...meal, items: mergedItems }
          : { ...meal, ...existing, items: mergedItems };
      
      mealsMap.set(meal.id, mergedMeal);
    }
  });
  
  merged.meals = Array.from(mealsMap.values())
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  
  return merged;
}

// ═══════════════════════════════════════════════════════════════════
// ТЕСТЫ
// ═══════════════════════════════════════════════════════════════════

describe('mergeDayData', () => {
  
  describe('Basic merge scenarios', () => {
    
    test('returns null when local or remote is null', () => {
      expect(mergeDayData(null, { date: '2025-12-12' })).toBeNull();
      expect(mergeDayData({ date: '2025-12-12' }, null)).toBeNull();
      expect(mergeDayData(null, null)).toBeNull();
    });
    
    test('returns null when data is identical (excluding updatedAt)', () => {
      const data = {
        date: '2025-12-12',
        meals: [{ id: 'meal1', items: [] }],
        steps: 5000,
      };
      
      const local = { ...data, updatedAt: 1000 };
      const remote = { ...data, updatedAt: 2000 };
      
      expect(mergeDayData(local, remote)).toBeNull();
    });
    
    test('merged.updatedAt is max of local, remote, and Date.now()', () => {
      const local = { date: '2025-12-12', updatedAt: 1000, steps: 100 };
      const remote = { date: '2025-12-12', updatedAt: 2000, steps: 200 };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.updatedAt).toBeGreaterThanOrEqual(2000);
    });
  });
  
  describe('Numeric fields (steps, waterMl)', () => {
    
    test('takes maximum for steps', () => {
      const local = { date: '2025-12-12', steps: 5000, updatedAt: 1000 };
      const remote = { date: '2025-12-12', steps: 8000, updatedAt: 2000 };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.steps).toBe(8000);
    });
    
    test('takes maximum for waterMl', () => {
      const local = { date: '2025-12-12', waterMl: 1500, updatedAt: 2000 };
      const remote = { date: '2025-12-12', waterMl: 1200, updatedAt: 1000 };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.waterMl).toBe(1500);
    });
    
    test('handles zero and undefined values', () => {
      const local = { date: '2025-12-12', steps: 0, updatedAt: 1000 };
      const remote = { date: '2025-12-12', waterMl: 500, updatedAt: 2000 };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.steps).toBe(0);
      expect(merged.waterMl).toBe(500);
    });
  });
  
  describe('Editable fields (householdMin, weightMorning)', () => {
    
    test('takes householdMin from newer source', () => {
      const local = { date: '2025-12-12', householdMin: 30, updatedAt: 2000 };
      const remote = { date: '2025-12-12', householdMin: 60, updatedAt: 1000 };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.householdMin).toBe(30); // local is newer
    });
    
    test('takes weightMorning from newer source when both exist', () => {
      const local = { date: '2025-12-12', weightMorning: 75.5, updatedAt: 2000 };
      const remote = { date: '2025-12-12', weightMorning: 76.0, updatedAt: 1000 };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.weightMorning).toBe(75.5); // local is newer
    });
    
    test('takes any non-zero weightMorning when one is missing', () => {
      const local = { date: '2025-12-12', weightMorning: 0, updatedAt: 2000 };
      const remote = { date: '2025-12-12', weightMorning: 76.0, updatedAt: 1000 };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.weightMorning).toBe(76.0); // non-zero wins
    });
  });
  
  describe('Meals merge', () => {
    
    test('local meals win when local is newer (remote meal deleted if not in local)', () => {
      // Важно: когда local новее, remote-only meals считаются УДАЛЁННЫМИ локально
      const local = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [
          { id: 'meal1', name: 'Завтрак', time: '08:00', items: [] }
        ]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [
          { id: 'meal2', name: 'Обед', time: '12:00', items: [] }
        ]
      };
      
      const merged = mergeDayData(local, remote);
      
      // Remote meal удалён, потому что local новее и его там нет
      expect(merged.meals).toHaveLength(1);
      expect(merged.meals[0].id).toBe('meal1');
    });
    
    test('respects deletion when local is newer and meal missing', () => {
      // Local удалил meal2
      const local = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [
          { id: 'meal1', name: 'Завтрак', items: [] }
        ]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [
          { id: 'meal1', name: 'Завтрак', items: [] },
          { id: 'meal2', name: 'Обед', items: [] }
        ]
      };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.meals).toHaveLength(1);
      expect(merged.meals[0].id).toBe('meal1');
    });
    
    test('keeps remote meal when remote is newer', () => {
      const local = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [
          { id: 'meal1', name: 'Завтрак', items: [] }
        ]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [
          { id: 'meal1', name: 'Завтрак', items: [] },
          { id: 'meal2', name: 'Обед', items: [] }
        ]
      };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.meals).toHaveLength(2);
    });
    
    test('forceKeepAll keeps all meals regardless of deletion', () => {
      const local = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [{ id: 'meal1', name: 'Завтрак', items: [] }]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [
          { id: 'meal1', name: 'Завтрак', items: [] },
          { id: 'meal2', name: 'Обед', items: [] }
        ]
      };
      
      const merged = mergeDayData(local, remote, { forceKeepAll: true });
      
      expect(merged.meals).toHaveLength(2);
    });
    
    test('preferRemote takes remote items in meal conflict', () => {
      const local = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [{
          id: 'meal1',
          name: 'Завтрак',
          items: [
            { id: 'item1', name: 'Кофе' },
            { id: 'item2', name: 'Хлеб' }
          ]
        }]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [{
          id: 'meal1',
          name: 'Завтрак',
          items: [
            { id: 'item1', name: 'Кофе' }
          ] // item2 удалён на другом устройстве
        }]
      };
      
      const merged = mergeDayData(local, remote, { preferRemote: true });
      
      expect(merged.meals[0].items).toHaveLength(1);
      expect(merged.meals[0].items[0].name).toBe('Кофе');
    });
  });
  
  describe('Items merge within meals', () => {
    
    test('merges items by ID from both versions', () => {
      const local = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [{
          id: 'meal1',
          items: [{ id: 'item1', name: 'Кофе' }]
        }]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [{
          id: 'meal1',
          items: [{ id: 'item2', name: 'Хлеб' }]
        }]
      };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.meals[0].items).toHaveLength(2);
    });
    
    test('local version of item wins when local is newer', () => {
      const local = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [{
          id: 'meal1',
          items: [{ id: 'item1', name: 'Кофе', grams: 200 }]
        }]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [{
          id: 'meal1',
          items: [{ id: 'item1', name: 'Кофе', grams: 100 }]
        }]
      };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.meals[0].items[0].grams).toBe(200);
    });
  });
  
  describe('Sorting', () => {
    
    test('meals are sorted by time after merge when both are in result', () => {
      // remote is newer, so both meals kept
      const local = {
        date: '2025-12-12',
        updatedAt: 1000,
        meals: [{ id: 'meal1', time: '18:00', items: [] }]
      };
      const remote = {
        date: '2025-12-12',
        updatedAt: 2000,
        meals: [
          { id: 'meal1', time: '18:00', items: [] },
          { id: 'meal2', time: '08:00', items: [] }
        ]
      };
      
      const merged = mergeDayData(local, remote);
      
      expect(merged.meals).toHaveLength(2);
      expect(merged.meals[0].time).toBe('08:00');
      expect(merged.meals[1].time).toBe('18:00');
    });
  });
});

describe('mergeItemsById', () => {
  
  test('returns only remote items when preferLocal is false', () => {
    const remote = [{ id: '1', name: 'A' }];
    const local = [{ id: '2', name: 'B' }];
    
    const result = mergeItemsById(remote, local, false);
    
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
  
  test('merges both when preferLocal is true', () => {
    const remote = [{ id: '1', name: 'A' }];
    const local = [{ id: '2', name: 'B' }];
    
    const result = mergeItemsById(remote, local, true);
    
    expect(result).toHaveLength(2);
  });
  
  test('local version overwrites remote for same ID', () => {
    const remote = [{ id: '1', name: 'A', grams: 100 }];
    const local = [{ id: '1', name: 'A', grams: 200 }];
    
    const result = mergeItemsById(remote, local, true);
    
    expect(result).toHaveLength(1);
    expect(result[0].grams).toBe(200);
  });
  
  test('filters out items without ID', () => {
    const remote = [{ name: 'no-id' }, { id: '1', name: 'A' }];
    const local = [{ id: '2', name: 'B' }];
    
    const result = mergeItemsById(remote, local, true);
    
    expect(result).toHaveLength(2);
    expect(result.find(i => i.name === 'no-id')).toBeUndefined();
  });
});
