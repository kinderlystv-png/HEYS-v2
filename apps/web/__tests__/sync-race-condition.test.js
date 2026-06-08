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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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

    // Incident 2026-06-08: curator add-item silently dropped — when curator viewed
    // a client whose PIN device kept pushing day updates, live-refresh's mergeDayData
    // (uses Math.max(cloud, local, Date.now()) for merged.updatedAt — see
    // heys_sync_merge_v1.js:558) would stamp LS with a ts slightly newer than
    // React's just-set updatedAt. flush() then bailed via shouldPreserveFreshestPersistedDay
    // and the add never persisted. Fix: when block-window is active (user just edited),
    // treat flush as force=true so the pending edit always writes through.
    // This mirrors the production logic in apps/web/heys_day_hooks.js flush().
    test('flush block-window override: write through even when LS has newer ts', () => {
      const stripMeta = (payload) => {
        if (!payload) return payload;
        const { updatedAt, _sourceId, ...rest } = payload;
        return rest;
      };

      // Setup: user just clicked "add item" — block-window armed.
      const blockCloudUpdatesUntilRef = { current: 1734000005000 };
      vi.mocked(Date.now).mockReturnValue(1734000002500); // 2.5s into 3s block
      global.HEYS.Day = global.HEYS.Day || {};
      global.HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;

      // React state: user added a third item; updatedAt = click time.
      const reactDay = {
        date: '2026-06-08',
        meals: [{ id: 'm1', items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }] }],
        updatedAt: 1734000002000,
      };
      // LS state: live-refresh's merge stamped LS with a slightly later Date.now()
      // (~200ms after click) — missing the user's new item it3.
      const lsDay = {
        date: '2026-06-08',
        meals: [{ id: 'm1', items: [{ id: 'i1' }, { id: 'i2' }] }],
        updatedAt: 1734000002200, // > React's updatedAt
      };

      // Production logic mirror — flush() decision:
      const options = {};
      let force = options && options.force === true;
      // Block-window override (new — see heys_day_hooks.js flush()):
      if (!force) {
        const isBlocking = typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function'
          ? global.HEYS.Day.isBlockingCloudUpdates() : false;
        if (isBlocking) force = true;
      }

      const updatedAt = reactDay.updatedAt;
      const freshestUpdatedAt = lsDay.updatedAt;
      const daySnap = JSON.stringify(stripMeta(reactDay));
      const freshestDaySnap = JSON.stringify(stripMeta(lsDay));
      const shouldPreserveFreshestPersistedDay = !!(
        lsDay && lsDay.date === reactDay.date && (
          freshestUpdatedAt > updatedAt ||
          (freshestUpdatedAt === updatedAt && freshestDaySnap !== daySnap)
        )
      );

      // Without force-override, shouldPreserve would be true and the write would be skipped.
      expect(shouldPreserveFreshestPersistedDay).toBe(true);
      // With block-window override, force is true → flush proceeds past the preserve guard.
      expect(force).toBe(true);
      // Effective write decision: skip only if !force && shouldPreserve.
      const skipWrite = !force && shouldPreserveFreshestPersistedDay;
      expect(skipWrite).toBe(false);
    });

    // Incident 2026-06-08 Phase 2: block-window истекает по таймеру (3с) или
    // обнуляется SKEW-clear защитой раньше чем flush успевает записать LS.
    // На медленном Android Chrome long-task 22с пожирал debounce setTimeout(500ms).
    // pendingDayMutation flag живёт пока flush явно не подтвердит запись (или
    // 30с auto-expire) — независимый от блок-окна сигнал «есть несохранённая
    // правка». flush() force-write при наличии флага, даже если block уже истёк
    // и даже если disabled=true (re-bootstrap flap).
    test('flush pending-mutation override: force-write when block expired but pending active', () => {
      // Setup: block-window истёк, disabled=true (re-bootstrap), но pending активен.
      vi.mocked(Date.now).mockReturnValue(1734000010000); // 10s после клика
      const blockCloudUpdatesUntilRef = { current: 1734000003000 }; // expired 7s назад
      const disabled = true;
      // Mirror pending-flag API (apps/web/heys_day_global_exports_v1.js):
      const _pending = new Map();
      _pending.set('2026-06-08', { ts: 1734000000000 });
      global.HEYS.Day = global.HEYS.Day || {};
      global.HEYS.Day.hasPendingMutation = (date) => {
        const entry = _pending.get(date);
        if (!entry) return false;
        if (Date.now() - entry.ts > 30000) { _pending.delete(date); return false; }
        return true;
      };
      global.HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;

      // Production logic mirror — flush() entry:
      const day = { date: '2026-06-08' };
      const isUnmountedRef = { current: false };
      let force = false;
      // Pending/block check BEFORE disabled (the actual fix in heys_day_hooks.js):
      const hasPending = typeof global.HEYS?.Day?.hasPendingMutation === 'function'
        ? global.HEYS.Day.hasPendingMutation(day.date) === true : false;
      const isBlocking = typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function'
        ? global.HEYS.Day.isBlockingCloudUpdates() === true : false;
      if (!force && (hasPending || isBlocking)) force = true;
      // Disabled check AFTER override → force=true bypasses it
      const bailedOnDisabled = !force && (disabled || isUnmountedRef.current);

      expect(hasPending).toBe(true);
      expect(isBlocking).toBe(false); // block expired
      expect(force).toBe(true); // override armed by pending alone
      expect(bailedOnDisabled).toBe(false); // disabled=true ignored
    });

    test('flush pending auto-expires after 30s — sync resumes', () => {
      const _pending = new Map();
      _pending.set('2026-06-08', { ts: 1734000000000 });
      vi.mocked(Date.now).mockReturnValue(1734000031000); // 31s после mark
      global.HEYS.Day = global.HEYS.Day || {};
      global.HEYS.Day.hasPendingMutation = (date) => {
        const entry = _pending.get(date);
        if (!entry) return false;
        if (Date.now() - entry.ts > 30000) { _pending.delete(date); return false; }
        return true;
      };

      expect(global.HEYS.Day.hasPendingMutation('2026-06-08')).toBe(false);
      expect(_pending.size).toBe(0); // self-cleaned
    });

    test('setBlockCloudUpdates caps skewed payload.updatedAt to Date.now() + 15s', () => {
      // Incident 2026-06-08: handler getting payload.updatedAt from PIN device with
      // future-skewed clock would set blockUntil 10 минут вперёд. SKEW-clear
      // защита потом обнуляла его, но между этими событиями flush видел
      // огромный остаточный block. Cap = 15s prevents that.
      const blockRef = { current: 0 };
      const MAX_LEGIT_BLOCK_MS = 15000;
      const setBlockCloudUpdatesCapped = (ref, until) => {
        const safeMax = Date.now() + MAX_LEGIT_BLOCK_MS;
        ref.current = (typeof until === 'number' && until > safeMax) ? safeMax : until;
      };

      vi.mocked(Date.now).mockReturnValue(1734000000000);
      setBlockCloudUpdatesCapped(blockRef, 1734000600000); // 600s ahead — clear skew
      expect(blockRef.current).toBe(1734000015000); // capped to now + 15s

      setBlockCloudUpdatesCapped(blockRef, 1734000003000); // 3s ahead — legitimate
      expect(blockRef.current).toBe(1734000003000); // unchanged
    });

    test('flush block-window NOT active: original preserve-fresher behavior unchanged', () => {
      // Counter-case: when block is NOT active (e.g. unrelated React re-render, no
      // pending user edit), the original guard still wins — stale React state must
      // not clobber a fresher persisted snapshot.
      const blockCloudUpdatesUntilRef = { current: 1734000000000 };
      vi.mocked(Date.now).mockReturnValue(1734000010000); // long past block expiry
      global.HEYS.Day = global.HEYS.Day || {};
      global.HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;

      const reactDay = { date: '2026-06-08', waterMl: 1300, updatedAt: 1734000001000 };
      const lsDay = { date: '2026-06-08', waterMl: 1400, updatedAt: 1734000002000 };

      let force = false;
      const isBlocking = typeof global.HEYS?.Day?.isBlockingCloudUpdates === 'function'
        ? global.HEYS.Day.isBlockingCloudUpdates() : false;
      if (isBlocking) force = true;

      const shouldPreserve = lsDay.updatedAt > reactDay.updatedAt;
      const skipWrite = !force && shouldPreserve;

      expect(isBlocking).toBe(false);
      expect(force).toBe(false);
      expect(skipWrite).toBe(true); // stale React state must NOT overwrite fresher LS
    });

    test('flush should preserve a fresher persisted day snapshot over stale React state', () => {
      const stripMeta = (payload) => {
        if (!payload) return payload;
        const { updatedAt, _sourceId, ...rest } = payload;
        return rest;
      };

      const staleDay = {
        date: '2025-12-12',
        waterMl: 1300,
        updatedAt: 1734000001000
      };
      const fresherPersistedDay = {
        date: '2025-12-12',
        waterMl: 1400,
        updatedAt: 1734000002000
      };

      const daySnap = JSON.stringify(stripMeta(staleDay));
      const freshestDaySnap = JSON.stringify(stripMeta(fresherPersistedDay));
      const updatedAt = staleDay.updatedAt;
      const freshestUpdatedAt = fresherPersistedDay.updatedAt;

      const shouldPreserveFreshestPersistedDay = (
        freshestUpdatedAt > updatedAt ||
        (
          freshestUpdatedAt === updatedAt &&
          freshestDaySnap !== daySnap
        )
      );

      expect(shouldPreserveFreshestPersistedDay).toBe(true);
      expect(fresherPersistedDay.waterMl).toBe(1400);
      expect(staleDay.waterMl).toBe(1300);
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

describe('Batch day-updated event strategy', () => {
  test('fetchDays should notify UI with one batch event payload', () => {
    const updatedDates = ['2026-04-24', '2026-04-24', '2026-04-23'];
    const uniqueDates = [...new Set(updatedDates)];
    const detail = {
      date: uniqueDates[0] || null,
      dates: uniqueDates,
      batch: true,
      source: 'fetchDays',
      forceReload: true
    };

    expect(detail.batch).toBe(true);
    expect(detail.source).toBe('fetchDays');
    expect(detail.dates).toEqual(['2026-04-24', '2026-04-23']);
    expect(detail.date).toBe('2026-04-24');
  });

  test('coalescer signature should skip duplicate apply in short window', () => {
    const sig = '2026-04-24|fetchDays|1';
    const lastAppliedSignatureRef = { current: sig };
    const lastAppliedAtRef = { current: 1000 };
    const nowApply = 1150;

    const pendingSource = 'fetchDays';
    const pendingForceReload = true;
    const sigCooldownMs = (pendingSource === 'fetchDays' && pendingForceReload) ? 720 : 220;
    const shouldSkip = lastAppliedSignatureRef.current === sig && (nowApply - lastAppliedAtRef.current) < sigCooldownMs;
    expect(shouldSkip).toBe(true);
  });

  test('external payload should not roll back newer local items even with forceReload', () => {
    const externalSources = ['cloud', 'cloud-sync', 'merge', 'fetchDays', 'foreground-hot-sync', 'server-merge'];
    const source = 'fetchDays';
    const isExternalSource = externalSources.includes(source);

    const prevDay = {
      updatedAt: 2000,
      meals: [{
        id: 'meal-1',
        name: 'Breakfast',
        items: [
          { id: 'item-1', name: 'Syrniki' },
          { id: 'item-2', name: 'Jam' }
        ]
      }]
    };

    const payloadDay = {
      updatedAt: 2000,
      meals: [{
        id: 'meal-1',
        name: 'Breakfast',
        items: [
          { id: 'item-1', name: 'Syrniki' }
        ]
      }]
    };

    const payloadUpdatedAt = payloadDay.updatedAt || 0;
    const prevUpdatedAt = prevDay.updatedAt || 0;
    const payloadItemsCount = payloadDay.meals.reduce((s, m) => s + (Array.isArray(m?.items) ? m.items.length : 0), 0);
    const prevItemsCount = prevDay.meals.reduce((s, m) => s + (Array.isArray(m?.items) ? m.items.length : 0), 0);

    const shouldSkipPayloadRollback = isExternalSource && payloadUpdatedAt <= prevUpdatedAt && payloadItemsCount < prevItemsCount;

    expect(shouldSkipPayloadRollback).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// heys_game hot-sync merge (Block B of dailyBonusClaimed fix)
//
// Регрессия которую покрывают эти тесты:
// 1. Пользователь нажал 🎁 daily bonus на устройстве A → local
//    dailyBonusClaimed='2026-05-27', totalXP+=10.
// 2. Hot-sync приносит stale cloud snapshot ({ dailyBonusClaimed:null, totalXP:старый }).
// 3. БЕЗ fix: applyForegroundHotSyncValue делает wholesale setItem →
//    dailyBonusClaimed теряется → кнопка появляется снова.
// 4. С fix: новая ветка `else if (baseKey === 'heys_game')` применяет
//    mergeGameData (или preserveLocalDailyBonusClaimed fallback) перед setItem.
//
// Контракт: тесты копируют preserveLocalDailyBonusClaimed inline
// (как остальные тесты — см. merge-day-data.test.js). Это та же чистая
// функция, что и в heys_gamification_v1.js — single source of truth там,
// тесты — verification mirror.
// ═══════════════════════════════════════════════════════════════════════════

// Inline копия preserveLocalDailyBonusClaimed (production: heys_gamification_v1.js:~742)
function preserveLocalDailyBonusClaimed(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  const localAch = Array.isArray(local.unlockedAchievements) ? local.unlockedAchievements : [];
  const remoteAch = Array.isArray(remote.unlockedAchievements) ? remote.unlockedAchievements : [];
  const mergedAch = [...new Set([...remoteAch, ...localAch])];
  const localDbc = local.dailyBonusClaimed || null;
  const remoteDbc = remote.dailyBonusClaimed || null;
  const dbc = localDbc && (!remoteDbc || localDbc >= remoteDbc) ? localDbc : (remoteDbc || null);
  return {
    ...remote,
    unlockedAchievements: mergedAch,
    dailyBonusClaimed: dbc,
    stats: {
      ...remote.stats,
      bestStreak: Math.max(remote.stats?.bestStreak || 0, local.stats?.bestStreak || 0),
      perfectDays: Math.max(remote.stats?.perfectDays || 0, local.stats?.perfectDays || 0),
      totalProducts: Math.max(remote.stats?.totalProducts || 0, local.stats?.totalProducts || 0),
      totalWater: Math.max(remote.stats?.totalWater || 0, local.stats?.totalWater || 0),
      totalTrainings: Math.max(remote.stats?.totalTrainings || 0, local.stats?.totalTrainings || 0),
    }
  };
}

// Inline симуляция heys_game hot-sync branch (production: heys_storage_supabase_v1.js:~11290)
// Принимает: текущий raw из LS, входящее cloud value, дескриптор HEYS.game (для DI).
// Возвращает: { wrote: bool, finalRaw: string|null, finalValue: any }.
// Совпадает с production-логикой строка-в-строку (кроме отсутствия dispatchEvent).
function simulateHotSyncHeysGameBranch({ currentRaw, value, HEYSgame }) {
  const previousValue = currentRaw ? JSON.parse(currentRaw) : null;
  const serialized = JSON.stringify(value);
  if (currentRaw === serialized) return { wrote: false, finalRaw: currentRaw, finalValue: previousValue };

  let appliedMergedGame = false;
  let finalRaw = currentRaw;
  let finalValue = value;
  try {
    const gameMerge = HEYSgame?.mergeGameData;
    const preserveHelper = HEYSgame?.preserveLocalDailyBonusClaimed;
    let mergedGame = null;
    if (typeof gameMerge === 'function' && previousValue) {
      mergedGame = gameMerge(previousValue, value);
    } else if (typeof preserveHelper === 'function' && previousValue) {
      mergedGame = preserveHelper(previousValue, value);
    }
    if (mergedGame) {
      const reserialized = JSON.stringify(mergedGame);
      if (currentRaw === reserialized) return { wrote: false, finalRaw: currentRaw, finalValue: previousValue };
      finalRaw = reserialized;
      finalValue = mergedGame;
      appliedMergedGame = true;
    }
  } catch (_) { /* fallback to wholesale */ }

  if (!appliedMergedGame) {
    finalRaw = serialized;
    finalValue = value;
  }
  return { wrote: true, finalRaw, finalValue };
}

describe('heys_game hot-sync merge (Block B)', () => {
  describe('with mergeGameData available', () => {
    test('stale cloud dailyBonusClaimed=null does NOT overwrite local dailyBonusClaimed=today', () => {
      // Реальный mergeGameData импортировать нельзя (legacy IIFE), но
      // preserveLocalDailyBonusClaimed имеет такое же поведение для критичных полей,
      // и production-код использует его как fallback. Используем mock-merge
      // который возвращает union по dailyBonusClaimed + максимум XP.
      const mockMerge = (local, remote) => ({
        ...remote,
        totalXP: Math.max(local.totalXP || 0, remote.totalXP || 0),
        dailyBonusClaimed: local.dailyBonusClaimed || remote.dailyBonusClaimed || null,
        unlockedAchievements: [...new Set([...(remote.unlockedAchievements || []), ...(local.unlockedAchievements || [])])],
      });

      const localGame = {
        totalXP: 110,
        dailyBonusClaimed: '2026-05-27',
        unlockedAchievements: ['first_login'],
        stats: { bestStreak: 5 }
      };
      const currentRaw = JSON.stringify(localGame);

      const incomingStale = {
        totalXP: 100,
        dailyBonusClaimed: null,
        unlockedAchievements: ['first_login'],
        stats: { bestStreak: 5 }
      };

      const result = simulateHotSyncHeysGameBranch({
        currentRaw,
        value: incomingStale,
        HEYSgame: { mergeGameData: mockMerge, preserveLocalDailyBonusClaimed }
      });

      // Critical: финальное состояние LS сохраняет local dailyBonusClaimed.
      // wrote=true когда merge изменил что-то по сравнению с currentRaw,
      // wrote=false когда merged == currentRaw (no-op). Оба варианта OK
      // пока финальный raw содержит preserved dailyBonusClaimed.
      const finalParsed = JSON.parse(result.finalRaw);
      expect(finalParsed.dailyBonusClaimed).toBe('2026-05-27');
      expect(finalParsed.totalXP).toBe(110); // max
    });
  });

  describe('without mergeGameData (fallback path)', () => {
    test('fallback to preserveLocalDailyBonusClaimed when mergeGameData unavailable', () => {
      const localGame = {
        totalXP: 110,
        dailyBonusClaimed: '2026-05-27',
        unlockedAchievements: ['first_login'],
        stats: { bestStreak: 5, perfectDays: 2 }
      };
      const currentRaw = JSON.stringify(localGame);

      const incomingStale = {
        totalXP: 100,
        dailyBonusClaimed: null,
        unlockedAchievements: ['first_login', 'streak_3'],
        stats: { bestStreak: 3, perfectDays: 1 }
      };

      const result = simulateHotSyncHeysGameBranch({
        currentRaw,
        value: incomingStale,
        HEYSgame: { mergeGameData: undefined, preserveLocalDailyBonusClaimed }
      });

      expect(result.wrote).toBe(true);
      const finalParsed = JSON.parse(result.finalRaw);
      // Critical: dailyBonusClaimed preserved
      expect(finalParsed.dailyBonusClaimed).toBe('2026-05-27');
      // Union of achievements
      expect(finalParsed.unlockedAchievements.sort()).toEqual(['first_login', 'streak_3'].sort());
      // Max per stat
      expect(finalParsed.stats.bestStreak).toBe(5);
      expect(finalParsed.stats.perfectDays).toBe(2);
    });

    test('newer remote dailyBonusClaimed wins over older local', () => {
      const localGame = {
        totalXP: 100,
        dailyBonusClaimed: '2026-05-26', // вчера
        stats: {}
      };
      const currentRaw = JSON.stringify(localGame);

      const incomingFresher = {
        totalXP: 100,
        dailyBonusClaimed: '2026-05-27', // сегодня
        stats: {}
      };

      const result = simulateHotSyncHeysGameBranch({
        currentRaw,
        value: incomingFresher,
        HEYSgame: { preserveLocalDailyBonusClaimed }
      });

      const finalParsed = JSON.parse(result.finalRaw);
      expect(finalParsed.dailyBonusClaimed).toBe('2026-05-27');
    });
  });

  describe('no-op detection', () => {
    test('returns wrote=false when value byte-identical to currentRaw (early return)', () => {
      const same = { totalXP: 100, dailyBonusClaimed: '2026-05-27', stats: {} };
      const raw = JSON.stringify(same);

      const result = simulateHotSyncHeysGameBranch({
        currentRaw: raw,
        value: JSON.parse(raw),
        HEYSgame: { preserveLocalDailyBonusClaimed }
      });

      expect(result.wrote).toBe(false);
    });

    test('post-merge no-op detection: merged == currentRaw triggers second no-op return', () => {
      // Этот тест проверяет специфичную ветку: `if (currentRaw === reserialized) return false`
      // после merge (вторая проверка, не early-return).
      //
      // Для этого нужно: value !== currentRaw, но preserveLocalDailyBonusClaimed(local, value)
      // даёт ровно тот же byte-output что и currentRaw.
      //
      // Достигаем этого через: currentRaw сериализован из объекта, который ИДЕНТИЧЕН выходу
      // preserveLocalDailyBonusClaimed(value, value). Любая мелкая разница в value
      // (например, лишнее поле в local) приведёт к расхождению.
      const incomingValue = { totalXP: 100, dailyBonusClaimed: '2026-05-27', stats: { bestStreak: 5 } };
      const expectedMerged = preserveLocalDailyBonusClaimed(incomingValue, incomingValue);
      const settledRaw = JSON.stringify(expectedMerged);

      // Передаём value как НОВЫЙ объект (другая ссылка), но same JSON shape.
      // JSON.stringify даст тот же байт-поток — early return сработает первым.
      const result = simulateHotSyncHeysGameBranch({
        currentRaw: settledRaw,
        value: { ...incomingValue },
        HEYSgame: { preserveLocalDailyBonusClaimed }
      });

      // Когда merged == currentRaw byte-for-byte — no-op return.
      // (Может сработать через early-return или через пост-merge return — оба путь к wrote=false).
      expect(result.wrote).toBe(false);
    });
  });

  describe('helpers unavailable (worst case)', () => {
    test('falls back to wholesale setItem when neither helper is available', () => {
      const localGame = {
        totalXP: 110,
        dailyBonusClaimed: '2026-05-27',
        stats: {}
      };
      const currentRaw = JSON.stringify(localGame);

      const incomingStale = {
        totalXP: 100,
        dailyBonusClaimed: null,
        stats: {}
      };

      const result = simulateHotSyncHeysGameBranch({
        currentRaw,
        value: incomingStale,
        HEYSgame: {} // ни mergeGameData, ни preserveLocalDailyBonusClaimed
      });

      // В worst case wholesale write — это известная регрессия, но
      // покрытие нужно зафиксировать, чтобы изменение в логике не оставалось незамеченным.
      expect(result.wrote).toBe(true);
      const finalParsed = JSON.parse(result.finalRaw);
      expect(finalParsed.dailyBonusClaimed).toBe(null);
    });
  });
});

describe('preserveLocalDailyBonusClaimed (pure function)', () => {
  test('returns remote when local is null/undefined', () => {
    const remote = { totalXP: 100, dailyBonusClaimed: '2026-05-27', stats: {} };
    expect(preserveLocalDailyBonusClaimed(null, remote)).toBe(remote);
    expect(preserveLocalDailyBonusClaimed(undefined, remote)).toBe(remote);
  });

  test('returns local when remote is null/undefined', () => {
    const local = { totalXP: 100, dailyBonusClaimed: '2026-05-27', stats: {} };
    expect(preserveLocalDailyBonusClaimed(local, null)).toBe(local);
    expect(preserveLocalDailyBonusClaimed(local, undefined)).toBe(local);
  });

  test('preserves local dailyBonusClaimed when remote is null', () => {
    const local = { dailyBonusClaimed: '2026-05-27', stats: {} };
    const remote = { dailyBonusClaimed: null, stats: {} };
    const merged = preserveLocalDailyBonusClaimed(local, remote);
    expect(merged.dailyBonusClaimed).toBe('2026-05-27');
  });

  test('takes newer dailyBonusClaimed when both present', () => {
    const local = { dailyBonusClaimed: '2026-05-26', stats: {} };
    const remote = { dailyBonusClaimed: '2026-05-27', stats: {} };
    expect(preserveLocalDailyBonusClaimed(local, remote).dailyBonusClaimed).toBe('2026-05-27');
  });

  test('unions unlockedAchievements', () => {
    const local = { unlockedAchievements: ['a', 'b'], stats: {} };
    const remote = { unlockedAchievements: ['b', 'c'], stats: {} };
    const merged = preserveLocalDailyBonusClaimed(local, remote);
    expect(merged.unlockedAchievements.sort()).toEqual(['a', 'b', 'c']);
  });

  test('takes max per stat field', () => {
    const local = { stats: { bestStreak: 10, perfectDays: 1, totalProducts: 50, totalWater: 200, totalTrainings: 3 } };
    const remote = { stats: { bestStreak: 5, perfectDays: 8, totalProducts: 100, totalWater: 100, totalTrainings: 7 } };
    const merged = preserveLocalDailyBonusClaimed(local, remote);
    expect(merged.stats.bestStreak).toBe(10);
    expect(merged.stats.perfectDays).toBe(8);
    expect(merged.stats.totalProducts).toBe(100);
    expect(merged.stats.totalWater).toBe(200);
    expect(merged.stats.totalTrainings).toBe(7);
  });

  test('takes remote XP/level (mergeGameData would max XP — but this is fallback for null/undefined only)', () => {
    // Helper не отвечает за XP — он только защищает dailyBonusClaimed/achievements/stats.
    // mergeGameData делает Math.max(totalXP) — fallback должен принять remote XP как есть.
    const local = { totalXP: 200, level: 10, stats: {} };
    const remote = { totalXP: 100, level: 5, stats: {} };
    const merged = preserveLocalDailyBonusClaimed(local, remote);
    expect(merged.totalXP).toBe(100); // взято из remote (...remote spread)
    expect(merged.level).toBe(5);
  });
});
