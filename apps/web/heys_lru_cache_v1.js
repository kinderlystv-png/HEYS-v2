// heys_lru_cache_v1.js — Foundation 2: in-memory cache layer с write-stamp протоколом.
//
// Зачем: горячие пути (readDayV2, product list hydrate) делают JSON.parse одного и того же
// LS-контента по 2-3 раза за рендер. На больших каталогах — 50-100мс parse jank каждый раз.
//
// Контракт invalidate (Plan v3 Option B — write-stamp comparison):
//   • Cache хранит value + stamp.
//   • Writes (явный source: 'write') → cache.delete + writeStamps[key] = now.
//   • Reads (явный source: 'read') → no-op. Кэш считается валидным, если cache.stamp >= writeStamps[key].
//   • Без явного source — defaults to 'write' для безопасности (старые места кода).
//
// API:
//   const cache = HEYS.lruCache.create({ name, max, ttlMs })
//   cache.get(key)                       — получить cached value или null
//   cache.set(key, value)                — положить в кэш с текущим stamp
//   cache.invalidate(key, opts)          — opts.source: 'write'|'read'|undefined
//   cache.invalidateAll()                — полная очистка (без stamp bump)
//   cache.size()
//   cache.stats()
//
// Дизайн LRU:
//   • Map preserves insertion order → on get, delete+set перемещает в конец (most recent).
//   • При size > max — удалить first entry (least recent).
//
(function (global) {
  'use strict';
  const HEYS = global.HEYS = global.HEYS || {};

  if (HEYS.lruCache && HEYS.lruCache.version) return; // re-load guard

  function create(opts) {
    opts = opts || {};
    const name = opts.name || 'unnamed';
    const max = opts.max || 200;
    const ttlMs = opts.ttlMs || 0; // 0 = no TTL
    const cache = new Map();        // key -> { value, stamp, expires }
    const writeStamps = new Map();  // key -> last write timestamp
    let hits = 0;
    let misses = 0;
    let evictions = 0;

    function now() { return performance.now ? performance.now() : Date.now(); }

    function isExpired(entry) {
      return ttlMs > 0 && entry.expires < now();
    }

    function get(key) {
      const entry = cache.get(key);
      if (!entry) { misses += 1; return null; }
      // TTL check
      if (isExpired(entry)) {
        cache.delete(key);
        misses += 1;
        return null;
      }
      // Write-stamp check: если был write после нашего cache stamp — invalidate
      const lastWrite = writeStamps.get(key) || 0;
      if (entry.stamp < lastWrite) {
        cache.delete(key);
        misses += 1;
        return null;
      }
      // LRU: переместить в конец
      cache.delete(key);
      cache.set(key, entry);
      hits += 1;
      return entry.value;
    }

    function set(key, value) {
      // Если уже есть — удалить, чтобы insertion order обновился
      cache.delete(key);
      cache.set(key, {
        value,
        stamp: now(),
        expires: ttlMs > 0 ? now() + ttlMs : Infinity,
      });
      // LRU eviction
      if (cache.size > max) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
        evictions += 1;
      }
    }

    function invalidate(key, opts) {
      const source = opts && opts.source;
      // По умолчанию — 'write' (безопасный legacy). Только явный 'read' → no-op.
      if (source === 'read') return;
      cache.delete(key);
      writeStamps.set(key, now());
    }

    function invalidateAll() {
      cache.clear();
      // не трогаем writeStamps — последующие set с правильным stamp нормально вытеснят старые writes
    }

    function size() { return cache.size; }

    function stats() {
      const total = hits + misses;
      return {
        name, size: cache.size, max, ttlMs,
        hits, misses, evictions,
        hitRate: total > 0 ? hits / total : 0,
      };
    }

    return { get, set, invalidate, invalidateAll, size, stats };
  }

  HEYS.lruCache = {
    create,
    version: 1,
  };
})(typeof window !== 'undefined' ? window : globalThis);
