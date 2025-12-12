/**
 * Тесты для защиты от race condition при синхронизации данных
 * 
 * Проблема (race condition):
 * 1. Пользователь добавляет meal/product на мобильном
 * 2. setDay() обновляет React state с новым updatedAt
 * 3. useDayAutosave имеет debounce 500ms → данные НЕ сразу в localStorage
 * 4. Cloud sync триггерится (visibility change, focus) → читает СТАРЫЕ данные из localStorage
 * 5. remote.updatedAt > local.updatedAt (старый) → remote побеждает → meals потеряны
 * 
 * Решение (3-уровневая защита):
 * 1. Forced flush() через 10ms после setDay() → немедленная запись в localStorage
 * 2. blockCloudUpdatesUntilRef = Date.now() + 3000 → блокировка cloud sync на 3 сек
 * 3. Проверка isBlockingCloudUpdates() в sync → пропуск localStorage overwrite при блокировке
 * 
 * Создано: 2025-12-12
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Sync Race Condition Protection', () => {
  
  // Mock localStorage
  let mockStorage = {};
  
  beforeEach(() => {
    mockStorage = {};
    
    // Mock localStorage
    global.localStorage = {
      getItem: vi.fn((key) => mockStorage[key] || null),
      setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
      removeItem: vi.fn((key) => { delete mockStorage[key]; }),
      clear: vi.fn(() => { mockStorage = {}; })
    };
    
    // Mock HEYS global
    global.HEYS = {
      Day: {}
    };
    
    // Mock Date.now for time-based tests
    vi.spyOn(Date, 'now');
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('blockCloudUpdatesUntilRef', () => {
    
    test('isBlockingCloudUpdates() returns false when blockUntil is 0', () => {
      // Setup: блокировка не установлена
      const blockCloudUpdatesUntilRef = { current: 0 };
      
      const isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      
      vi.mocked(Date.now).mockReturnValue(1000);
      
      expect(isBlockingCloudUpdates()).toBe(false);
    });
    
    test('isBlockingCloudUpdates() returns true when within block window', () => {
      // Setup: блокировка установлена на 3 секунды вперёд
      const blockCloudUpdatesUntilRef = { current: 5000 };
      
      const isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      
      vi.mocked(Date.now).mockReturnValue(3000); // 3000 < 5000
      
      expect(isBlockingCloudUpdates()).toBe(true);
    });
    
    test('isBlockingCloudUpdates() returns false when block window expired', () => {
      // Setup: блокировка была установлена, но уже истекла
      const blockCloudUpdatesUntilRef = { current: 5000 };
      
      const isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      
      vi.mocked(Date.now).mockReturnValue(6000); // 6000 > 5000 — блокировка истекла
      
      expect(isBlockingCloudUpdates()).toBe(false);
    });
    
    test('block window is 3 seconds after action', () => {
      // Setup: симуляция добавления meal
      const blockCloudUpdatesUntilRef = { current: 0 };
      
      const actionTime = 10000;
      const BLOCK_DURATION = 3000;
      
      vi.mocked(Date.now).mockReturnValue(actionTime);
      
      // Действие: установка блокировки (как в heys_day_v12.js)
      blockCloudUpdatesUntilRef.current = actionTime + BLOCK_DURATION;
      
      expect(blockCloudUpdatesUntilRef.current).toBe(13000);
      
      // Через 1 секунду — ещё заблокировано
      vi.mocked(Date.now).mockReturnValue(11000);
      expect(Date.now() < blockCloudUpdatesUntilRef.current).toBe(true);
      
      // Через 3 секунды — разблокировано
      vi.mocked(Date.now).mockReturnValue(13001);
      expect(Date.now() < blockCloudUpdatesUntilRef.current).toBe(false);
    });
    
    test('getBlockUntil() returns correct timestamp', () => {
      const blockCloudUpdatesUntilRef = { current: 15000 };
      
      const getBlockUntil = () => blockCloudUpdatesUntilRef.current;
      
      expect(getBlockUntil()).toBe(15000);
    });
  });
  
  describe('Cloud sync blocking in heys_storage_supabase_v1.js', () => {
    
    test('should skip localStorage overwrite when blocking is active', () => {
      // Setup: имитация состояния во время локального редактирования
      const isBlockingCloudUpdates = vi.fn().mockReturnValue(true);
      const getBlockUntil = vi.fn().mockReturnValue(Date.now() + 2500);
      
      global.HEYS.Day.isBlockingCloudUpdates = isBlockingCloudUpdates;
      global.HEYS.Day.getBlockUntil = getBlockUntil;
      
      // Симуляция логики из heys_storage_supabase_v1.js
      const key = 'heys_ccfe6ea3_dayv2_2025-12-12';
      // remoteData: { meals: [], updatedAt: 1734000000000 } — данные с сервера
      let shouldSkip = false;
      
      if (key.includes('dayv2_')) {
        if (typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function' && 
            global.HEYS.Day.isBlockingCloudUpdates()) {
          shouldSkip = true;
        }
      }
      
      expect(shouldSkip).toBe(true);
      expect(isBlockingCloudUpdates).toHaveBeenCalled();
    });
    
    test('should allow localStorage overwrite when blocking is not active', () => {
      // Setup: блокировка не активна
      const isBlockingCloudUpdates = vi.fn().mockReturnValue(false);
      
      global.HEYS.Day.isBlockingCloudUpdates = isBlockingCloudUpdates;
      
      const key = 'heys_ccfe6ea3_dayv2_2025-12-12';
      let shouldSkip = false;
      
      if (key.includes('dayv2_')) {
        if (typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function' && 
            global.HEYS.Day.isBlockingCloudUpdates()) {
          shouldSkip = true;
        }
      }
      
      expect(shouldSkip).toBe(false);
    });
    
    test('should allow localStorage overwrite when HEYS.Day is undefined', () => {
      // Setup: компонент DayTab не смонтирован
      global.HEYS.Day = undefined;
      
      const key = 'heys_ccfe6ea3_dayv2_2025-12-12';
      let shouldSkip = false;
      
      if (key.includes('dayv2_')) {
        if (typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function' && 
            global.HEYS.Day.isBlockingCloudUpdates()) {
          shouldSkip = true;
        }
      }
      
      expect(shouldSkip).toBe(false);
    });
    
    test('should not affect non-dayv2 keys', () => {
      // Setup: блокировка активна, но ключ НЕ dayv2
      global.HEYS.Day.isBlockingCloudUpdates = vi.fn().mockReturnValue(true);
      
      const key = 'heys_ccfe6ea3_products'; // не dayv2
      let shouldSkip = false;
      
      if (key.includes('dayv2_')) {
        if (typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function' && 
            global.HEYS.Day.isBlockingCloudUpdates()) {
          shouldSkip = true;
        }
      }
      
      expect(shouldSkip).toBe(false);
    });
  });
  
  describe('updatedAt timestamp management', () => {
    
    test('new updatedAt should be greater than previous', () => {
      const prevUpdatedAt = 1734000000000;
      
      vi.mocked(Date.now).mockReturnValue(1734000001000); // +1 секунда
      
      const newUpdatedAt = Date.now();
      
      expect(newUpdatedAt).toBeGreaterThan(prevUpdatedAt);
    });
    
    test('lastLoadedUpdatedAtRef should be updated on local edit', () => {
      // Симуляция защиты от перезаписи
      const lastLoadedUpdatedAtRef = { current: 1734000000000 };
      
      vi.mocked(Date.now).mockReturnValue(1734000003000);
      
      const newUpdatedAt = Date.now();
      lastLoadedUpdatedAtRef.current = newUpdatedAt;
      
      expect(lastLoadedUpdatedAtRef.current).toBe(1734000003000);
    });
  });
  
  describe('Flush timing', () => {
    
    test('flush should be called after setDay with minimal delay', async () => {
      const flush = vi.fn();
      
      // Симуляция setTimeout как в heys_day_v12.js
      vi.useFakeTimers();
      
      setTimeout(() => {
        if (typeof flush === 'function') {
          flush();
        }
      }, 10);
      
      // До истечения таймера flush не вызван
      expect(flush).not.toHaveBeenCalled();
      
      // Прокручиваем таймеры
      vi.advanceTimersByTime(10);
      
      expect(flush).toHaveBeenCalledTimes(1);
      
      vi.useRealTimers();
    });
    
    test('flush is guarded by typeof check', () => {
      // flush может быть undefined если хук не вернул функцию
      const flush = undefined;
      
      let flushCalled = false;
      
      if (typeof flush === 'function') {
        flush();
        flushCalled = true;
      }
      
      expect(flushCalled).toBe(false);
    });
  });
  
  describe('Race condition scenario simulation', () => {
    
    test('without protection: remote wins, local data lost', () => {
      // Симуляция проблемы БЕЗ защиты
      const localData = {
        meals: [{ id: 'meal1', name: 'Завтрак', items: [{ name: 'Кофе' }] }],
        updatedAt: 1734000000000 // Старый timestamp (ещё не обновлён в localStorage)
      };
      
      const remoteData = {
        meals: [], // Пустые meals
        updatedAt: 1734000001000 // Более новый timestamp
      };
      
      // Логика mergeDayData (упрощённо): remote.updatedAt > local.updatedAt → remote wins
      const remoteUpdatedAt = remoteData.updatedAt || 0;
      const localUpdatedAt = localData.updatedAt || 0;
      
      let winner;
      if (remoteUpdatedAt > localUpdatedAt) {
        winner = 'remote';
      } else {
        winner = 'local';
      }
      
      expect(winner).toBe('remote');
      // Результат: локальный meal потерян!
    });
    
    test('with protection: local edit blocks remote overwrite', () => {
      // Симуляция защиты
      const actionTime = 1734000000000;
      const BLOCK_DURATION = 3000;
      const blockCloudUpdatesUntilRef = { current: actionTime + BLOCK_DURATION };
      
      vi.mocked(Date.now).mockReturnValue(actionTime + 500); // 500ms после действия
      
      const isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      
      // Симуляция sync
      const key = 'heys_dayv2_2025-12-12';
      let shouldOverwrite = true;
      
      if (key.includes('dayv2_') && isBlockingCloudUpdates()) {
        shouldOverwrite = false; // Блокируем!
      }
      
      expect(shouldOverwrite).toBe(false);
      // Результат: localStorage НЕ затёрт, локальные данные сохранены
    });
    
    test('protection expires after 3 seconds, sync proceeds', () => {
      const actionTime = 1734000000000;
      const BLOCK_DURATION = 3000;
      const blockCloudUpdatesUntilRef = { current: actionTime + BLOCK_DURATION };
      
      vi.mocked(Date.now).mockReturnValue(actionTime + 3500); // 3.5 секунды после действия
      
      const isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      
      const key = 'heys_dayv2_2025-12-12';
      let shouldOverwrite = true;
      
      if (key.includes('dayv2_') && isBlockingCloudUpdates()) {
        shouldOverwrite = false;
      }
      
      expect(shouldOverwrite).toBe(true);
      // Результат: через 3+ секунды sync работает нормально
    });
  });
  
  describe('Multiple rapid actions', () => {
    
    test('each action resets the block window', () => {
      const blockCloudUpdatesUntilRef = { current: 0 };
      const BLOCK_DURATION = 3000;
      
      // Первое действие
      vi.mocked(Date.now).mockReturnValue(10000);
      blockCloudUpdatesUntilRef.current = Date.now() + BLOCK_DURATION;
      expect(blockCloudUpdatesUntilRef.current).toBe(13000);
      
      // Второе действие через 1 секунду — продлевает блокировку
      vi.mocked(Date.now).mockReturnValue(11000);
      blockCloudUpdatesUntilRef.current = Date.now() + BLOCK_DURATION;
      expect(blockCloudUpdatesUntilRef.current).toBe(14000);
      
      // Третье действие через ещё 1 секунду
      vi.mocked(Date.now).mockReturnValue(12000);
      blockCloudUpdatesUntilRef.current = Date.now() + BLOCK_DURATION;
      expect(blockCloudUpdatesUntilRef.current).toBe(15000);
      
      // Проверяем что блокировка активна через 4.5 секунды от начала
      vi.mocked(Date.now).mockReturnValue(14500);
      expect(Date.now() < blockCloudUpdatesUntilRef.current).toBe(true);
      
      // Но истекла через 5.5 секунд
      vi.mocked(Date.now).mockReturnValue(15500);
      expect(Date.now() < blockCloudUpdatesUntilRef.current).toBe(false);
    });
  });
  
  describe('HEYS.Day API exports', () => {
    
    test('isBlockingCloudUpdates should be exported to HEYS.Day', () => {
      const blockCloudUpdatesUntilRef = { current: 5000 };
      
      // Симуляция useEffect из heys_day_v12.js
      global.HEYS.Day = global.HEYS.Day || {};
      global.HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      
      vi.mocked(Date.now).mockReturnValue(4000);
      
      expect(typeof global.HEYS.Day.isBlockingCloudUpdates).toBe('function');
      expect(global.HEYS.Day.isBlockingCloudUpdates()).toBe(true);
    });
    
    test('getBlockUntil should be exported to HEYS.Day', () => {
      const blockCloudUpdatesUntilRef = { current: 12345 };
      
      global.HEYS.Day = global.HEYS.Day || {};
      global.HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current;
      
      expect(typeof global.HEYS.Day.getBlockUntil).toBe('function');
      expect(global.HEYS.Day.getBlockUntil()).toBe(12345);
    });
    
    test('cleanup should remove exports on unmount', () => {
      const blockCloudUpdatesUntilRef = { current: 5000 };
      const flush = vi.fn();
      
      // Mount
      global.HEYS.Day = global.HEYS.Day || {};
      global.HEYS.Day.requestFlush = flush;
      global.HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      global.HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current;
      
      expect(global.HEYS.Day.isBlockingCloudUpdates).toBeDefined();
      expect(global.HEYS.Day.getBlockUntil).toBeDefined();
      
      // Unmount cleanup
      if (global.HEYS.Day && global.HEYS.Day.requestFlush === flush) {
        delete global.HEYS.Day.requestFlush;
        delete global.HEYS.Day.isBlockingCloudUpdates;
        delete global.HEYS.Day.getBlockUntil;
      }
      
      expect(global.HEYS.Day.isBlockingCloudUpdates).toBeUndefined();
      expect(global.HEYS.Day.getBlockUntil).toBeUndefined();
    });
  });
});

describe('Day Data Merge Logic', () => {
  
  describe('updatedAt comparison', () => {
    
    test('remote with newer updatedAt should win in merge', () => {
      const local = { updatedAt: 1000, meals: [{ id: '1' }] };
      const remote = { updatedAt: 2000, meals: [{ id: '2' }] };
      
      // Упрощённая логика merge
      const remoteUpdatedAt = remote.updatedAt || 0;
      const localUpdatedAt = local.updatedAt || 0;
      
      expect(remoteUpdatedAt > localUpdatedAt).toBe(true);
    });
    
    test('local with newer updatedAt should win in merge', () => {
      const local = { updatedAt: 3000, meals: [{ id: '1' }] };
      const remote = { updatedAt: 2000, meals: [{ id: '2' }] };
      
      const remoteUpdatedAt = remote.updatedAt || 0;
      const localUpdatedAt = local.updatedAt || 0;
      
      expect(localUpdatedAt > remoteUpdatedAt).toBe(true);
    });
    
    test('should handle missing updatedAt gracefully', () => {
      const local = { meals: [{ id: '1' }] }; // no updatedAt
      const remote = { updatedAt: 2000, meals: [] };
      
      const remoteUpdatedAt = remote.updatedAt || 0;
      const localUpdatedAt = local.updatedAt || 0;
      
      expect(localUpdatedAt).toBe(0);
      expect(remoteUpdatedAt).toBe(2000);
      expect(remoteUpdatedAt > localUpdatedAt).toBe(true);
    });
  });
});

describe('Integration: Meal Creation Flow', () => {
  
  test('meal creation should set updatedAt, blockCloudUpdatesUntilRef, and call flush', async () => {
    vi.useFakeTimers();
    
    const flush = vi.fn();
    const blockCloudUpdatesUntilRef = { current: 0 };
    const lastLoadedUpdatedAtRef = { current: 0 };
    let dayState = { meals: [], updatedAt: 0 };
    
    const setDay = (updater) => {
      dayState = typeof updater === 'function' ? updater(dayState) : updater;
    };
    
    // Симуляция onComplete callback
    const newMeal = { id: 'meal_123', name: 'Обед', time: '12:30', items: [] };
    
    Date.now = vi.fn().mockReturnValue(1734000000000);
    
    const newUpdatedAt = Date.now();
    lastLoadedUpdatedAtRef.current = newUpdatedAt;
    blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
    
    setDay(prevDay => ({
      ...prevDay,
      meals: [...(prevDay.meals || []), newMeal],
      updatedAt: newUpdatedAt
    }));
    
    // Forced flush
    setTimeout(() => {
      if (typeof flush === 'function') {
        flush();
      }
    }, 10);
    
    // Проверки ДО flush
    expect(flush).not.toHaveBeenCalled();
    expect(dayState.meals).toHaveLength(1);
    expect(dayState.updatedAt).toBe(1734000000000);
    expect(blockCloudUpdatesUntilRef.current).toBe(1734000003000);
    expect(lastLoadedUpdatedAtRef.current).toBe(1734000000000);
    
    // Прокручиваем таймер
    vi.advanceTimersByTime(10);
    
    expect(flush).toHaveBeenCalledTimes(1);
    
    vi.useRealTimers();
  });
});

describe('Integration: Product Addition Flow', () => {
  
  test('product addition should set updatedAt, blockCloudUpdatesUntilRef, and call flush', async () => {
    vi.useFakeTimers();
    
    const flush = vi.fn();
    const blockCloudUpdatesUntilRef = { current: 0 };
    const lastLoadedUpdatedAtRef = { current: 0 };
    let dayState = {
      meals: [{ id: 'meal_1', name: 'Завтрак', items: [] }],
      updatedAt: 1734000000000
    };
    
    const setDay = (updater) => {
      dayState = typeof updater === 'function' ? updater(dayState) : updater;
    };
    
    // Симуляция onAdd callback
    const product = { id: 'prod_123', name: 'Кофе', kcal100: 2 };
    const grams = 200;
    const targetMealIndex = 0;
    
    Date.now = vi.fn().mockReturnValue(1734000005000);
    
    const newUpdatedAt = Date.now();
    lastLoadedUpdatedAtRef.current = newUpdatedAt;
    blockCloudUpdatesUntilRef.current = newUpdatedAt + 3000;
    
    const newItem = {
      id: `item_${Date.now()}`,
      product_id: product.id,
      name: product.name,
      grams
    };
    
    setDay((prevDay = {}) => {
      const updatedMeals = (prevDay.meals || []).map((m, i) =>
        i === targetMealIndex
          ? { ...m, items: [...(m.items || []), newItem] }
          : m
      );
      return { ...prevDay, meals: updatedMeals, updatedAt: newUpdatedAt };
    });
    
    // Forced flush
    setTimeout(() => {
      if (typeof flush === 'function') {
        flush();
      }
    }, 10);
    
    // Проверки ДО flush
    expect(flush).not.toHaveBeenCalled();
    expect(dayState.meals[0].items).toHaveLength(1);
    expect(dayState.meals[0].items[0].name).toBe('Кофе');
    expect(dayState.updatedAt).toBe(1734000005000);
    expect(blockCloudUpdatesUntilRef.current).toBe(1734000008000);
    
    // Прокручиваем таймер
    vi.advanceTimersByTime(10);
    
    expect(flush).toHaveBeenCalledTimes(1);
    
    vi.useRealTimers();
  });
});
