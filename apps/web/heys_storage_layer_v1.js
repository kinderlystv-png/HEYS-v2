// heys_storage_layer_v1.js — Centralized storage layer, cache, watchers
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Store = HEYS.store = HEYS.store || {};

  const memory = new Map();
  const watchers = new Map(); // key -> Set<fn>

  // ═══════════════════════════════════════════════════════════════════
  // 🗜️ COMPRESSION v2.0 — Улучшенное сжатие данных (~25-30% экономия)
  // ═══════════════════════════════════════════════════════════════════

  // Паттерны для сжатия (упорядочены по частоте использования)
  const COMPRESS_PATTERNS = {
    // Продукты (самые частые)
    '"name":"': '¤n¤',
    '"kcal100":': '¤k¤',
    '"protein100":': '¤p¤',
    '"carbs100":': '¤c¤',
    '"fat100":': '¤f¤',
    '"simple100":': '¤s¤',
    '"complex100":': '¤x¤',
    '"badFat100":': '¤b¤',
    '"goodFat100":': '¤g¤',
    '"trans100":': '¤t¤',
    '"fiber100":': '¤i¤',
    '"gi":': '¤G¤',
    '"harm":': '¤H¤',
    '"harmScore":': '¤h¤',
    '"category":"': '¤C¤',
    '"portions":': '¤P¤',
    // Дни питания
    '"meals":': '¤M¤',
    '"items":': '¤I¤',
    '"product_id":': '¤D¤',
    '"time":"': '¤T¤',
    '"date":"': '¤d¤',
    '"trainings":': '¤R¤',
    '"weightMorning":': '¤W¤',
    '"sleepHours":': '¤S¤',
    '"waterMl":': '¤w¤',
    '"steps":': '¤e¤',
    '"mood":': '¤m¤',
    '"wellbeing":': '¤B¤',
    '"stress":': '¤E¤',
    '"grams":': '¤r¤',
    // Общие JSON паттерны
    '":true': '¤1¤',
    '":false': '¤0¤',
    '":null': '¤_¤',
    '"id":': '¤j¤'
  };

  // Инвертированные паттерны для декомпрессии
  const DECOMPRESS_PATTERNS = Object.fromEntries(
    Object.entries(COMPRESS_PATTERNS).map(([k, v]) => [v, k])
  );

  function compress(obj) {
    try {
      // Safe stringify with circular reference detection
      const seen = new WeakSet();
      let json = JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            console.warn('[compress] Circular reference detected at key:', key);
            return undefined; // Skip circular refs
          }
          seen.add(value);
        }
        return value;
      });

      // 1. Сжатие числовых значений (убираем лишние нули)
      // 10.00 → 10, 5.50 → 5.5
      json = json.replace(/:(-?\d+)\.0+(?=[,}\]])/g, ':$1');
      json = json.replace(/:(-?\d+\.\d*?)0+(?=[,}\]])/g, ':$1');

      // 2. Применяем паттерны сжатия
      let compressed = json;
      for (const [pattern, code] of Object.entries(COMPRESS_PATTERNS)) {
        compressed = compressed.split(pattern).join(code);
      }

      // 3. Если сжатие эффективно (>8%), используем его
      if (compressed.length < json.length * 0.92) {
        return '¤Z¤' + compressed;
      }

      return json;
    } catch (e) {
      console.error('[compress] Error:', e?.message || e);
      return JSON.stringify(obj);
    }
  }

  function decompress(str) {
    try {
      if (!str || !str.startsWith('¤Z¤')) {
        return JSON.parse(str);
      }

      let decompressed = str.substring(3);

      // Восстановление паттернов
      for (const [code, pattern] of Object.entries(DECOMPRESS_PATTERNS)) {
        decompressed = decompressed.split(code).join(pattern);
      }

      return JSON.parse(decompressed);
    } catch (e) {
      // Fallback для некорректных данных
      try { return JSON.parse(str); } catch (e2) { return null; }
    }
  }

  function rawGet(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? decompress(v) : d;
    } catch (e) {
      return d;
    }
  }

  function rawSet(k, v) {
    try {
      const compressed = compress(v);
      localStorage.setItem(k, compressed);
      return true;
    } catch (e) {
      const errorName = e?.name || 'UnknownError';
      const errorMsg = e?.message || String(e);
      console.error('[rawSet] ERROR:', k, errorName, errorMsg);

      // QuotaExceededError — попробуем очистить старые данные
      if (errorName === 'QuotaExceededError' || errorMsg.includes('quota')) {
        console.warn('[rawSet] localStorage quota exceeded, attempting cleanup...');
        try {
          // Удаляем старые дни (>60 дней)
          const keysToRemove = [];
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - 60);
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.includes('_dayv2_')) {
              const match = key.match(/_dayv2_(\d{4}-\d{2}-\d{2})/);
              if (match) {
                const keyDate = new Date(match[1]);
                if (keyDate < cutoffDate) {
                  keysToRemove.push(key);
                }
              }
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
          if (keysToRemove.length > 0) {
            console.log('[rawSet] Cleaned up', keysToRemove.length, 'old day records');
            // Retry
            localStorage.setItem(k, compress(v));
            return true;
          }
        } catch (cleanupErr) {
          console.error('[rawSet] Cleanup failed:', cleanupErr);
        }
      }
      return false;
    }
  }

  function ns() { return (global.HEYS && global.HEYS.currentClientId) || ''; }
  function scoped(k) {
    const cid = ns();
    if (!cid) return k;
    if (/^heys_(clients|client_current)$/i.test(k)) return k;

    // 🐛 FIX: Если ключ уже содержит clientId — не добавляем повторно!
    if (cid && k.includes(cid)) {
      return k; // Уже scoped
    }

    // Ключ `k` может быть 'dayv2_2025-01-01' или 'heys_dayv2_date'.
    // Мы должны добавить client_id после 'heys_'.
    if (k.startsWith('heys_')) {
      return 'heys_' + cid + '_' + k.substring('heys_'.length);
    }
    // Для ключей, не начинающихся с 'heys_', просто добавляем префикс.
    return `heys_${cid}_${k}`;
  }

  Store.get = function (k, def) { const sk = scoped(k); if (memory.has(sk)) return memory.get(sk); const v = rawGet(sk, def); memory.set(sk, v); return v; };
  // If scoped key not present, try unscoped legacy key and migrate it into scoped namespace
  Store.get = (function (orig) {
    return function (k, def) {
      const sk = scoped(k);

      // �🔧 FIX: Если в memory лежит null/undefined, но передан def — возвращаем def
      // Это исправляет баг когда lsGet(key, null) кэширует null, а следующий
      // вызов lsGet(key, {}) возвращает null вместо {}
      if (memory.has(sk)) {
        const cached = memory.get(sk);
        // Возвращаем кэш только если он не null/undefined, или если def тоже null/undefined
        if (cached !== null && cached !== undefined) {
          return cached;
        }
        // Кэш null/undefined — если есть def, возвращаем def
        if (def !== undefined && def !== null) {
          return def;
        }
        return cached;
      }
      let v = rawGet(sk, undefined);
      if (v === undefined || v === null) {
        // try legacy unscoped key
        try {
          const legacy = rawGet(k, undefined);
          if (legacy !== undefined && legacy !== null) {
            // migrate to scoped key for future reads/writes
            memory.set(sk, legacy);
            rawSet(sk, legacy);
            return legacy;
          }
        } catch (e) { }
        // Fallback: if products are stored under another clientId scope
        if (k === 'heys_products') {
          try {
            const keys = Object.keys(localStorage).filter((key) => /^heys_[^_]+_products$/i.test(key));
            let best = null;
            let bestLen = 0;
            for (const key of keys) {
              const candidate = rawGet(key, undefined);
              const len = Array.isArray(candidate) ? candidate.length : 0;
              if (len > bestLen) {
                bestLen = len;
                best = candidate;
              }
            }
            if (best && bestLen > 0) {
              memory.set(sk, best);
              rawSet(sk, best);
              return best;
            }
          } catch (e) { }
        }
        // return default
        v = def;
      }
      memory.set(sk, v);
      return v;
    };
  })(Store.get);
  Store.set = function (k, v) {
    const sk = scoped(k);
    memory.set(sk, v);
    rawSet(sk, v);
    if (watchers.has(sk)) watchers.get(sk).forEach(fn => { try { fn(v); } catch (e) { } });
    try {
      if (global.HEYS && typeof global.HEYS.saveClientKey === 'function') {
        const cid = ns();
        if (cid) {
          // Передаём scoped key в облако (с clientId), чтобы ключ совпадал при загрузке
          // sk уже содержит heys_<clientId>_<key>
          // Сохраняем любые значения: объекты, массивы, boolean, числа, строки
          // (не сохраняем только undefined и функции)
          if (v === undefined || typeof v === 'function') {
            return;
          }
          global.HEYS.saveClientKey(cid, sk, v);
        }
      }
    } catch (e) {
      console.error('[Store.set] Error:', e);
      // 🔥 INSTANT FEEDBACK: Если ошибка при сохранении в облако, уведомляем UI
      if (global.dispatchEvent) {
        global.dispatchEvent(new CustomEvent('heys:sync-error', {
          detail: {
            error: `Storage error: ${e.message}`,
            persistent: true
          }
        }));
      }
    }
  };

  Store.watch = function (k, fn) { const sk = scoped(k); if (!watchers.has(sk)) watchers.set(sk, new Set()); watchers.get(sk).add(fn); return () => { const set = watchers.get(sk); if (set) { set.delete(fn); if (!set.size) watchers.delete(sk); } }; };

  Store.flushMemory = function () { memory.clear(); };

  /**
   * Инвалидирует кэш для конкретного ключа (при прямой записи в localStorage извне)
   * @param {string} k - ключ для инвалидации
   */
  Store.invalidate = function (k) {
    const sk = scoped(k);
    memory.delete(sk);
    // Также пробуем удалить raw key (если он уже scoped)
    memory.delete(k);
  };

  // ═══════════════════════════════════════════════════════════════════
  // ⭐ ИЗБРАННЫЕ ПРОДУКТЫ
  // ═══════════════════════════════════════════════════════════════════
  const FAVORITES_KEY = 'heys_favorite_products';

  /**
   * Получить Set id избранных продуктов
   * @returns {Set<string>}
   */
  Store.getFavorites = function () {
    const arr = Store.get(FAVORITES_KEY, []);
    return new Set(Array.isArray(arr) ? arr : []);
  };

  /**
   * Проверить, является ли продукт избранным
   * @param {string|number} productId
   * @returns {boolean}
   */
  Store.isFavorite = function (productId) {
    const favorites = Store.getFavorites();
    return favorites.has(String(productId));
  };

  /**
   * Переключить избранное для продукта
   * @param {string|number} productId
   * @returns {boolean} новое состояние (true = избранный)
   */
  Store.toggleFavorite = function (productId) {
    const id = String(productId);
    const favorites = Store.getFavorites();
    let newState;
    if (favorites.has(id)) {
      favorites.delete(id);
      newState = false;
    } else {
      favorites.add(id);
      newState = true;
    }
    Store.set(FAVORITES_KEY, Array.from(favorites));
    return newState;
  };

  /**
   * Добавить продукт в избранное
   * @param {string|number} productId
   */
  Store.addFavorite = function (productId) {
    const id = String(productId);
    const favorites = Store.getFavorites();
    if (!favorites.has(id)) {
      favorites.add(id);
      Store.set(FAVORITES_KEY, Array.from(favorites));
    }
  };

  /**
   * Удалить продукт из избранного
   * @param {string|number} productId
   */
  Store.removeFavorite = function (productId) {
    const id = String(productId);
    const favorites = Store.getFavorites();
    if (favorites.has(id)) {
      favorites.delete(id);
      Store.set(FAVORITES_KEY, Array.from(favorites));
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🙈 СКРЫТЫЕ ПРОДУКТЫ (в списке "Ваши продукты")
  // ═══════════════════════════════════════════════════════════════════
  const HIDDEN_PRODUCTS_KEY = 'heys_hidden_products';

  /**
   * Получить Set id скрытых продуктов
   * @returns {Set<string>}
   */
  Store.getHiddenProducts = function () {
    const arr = Store.get(HIDDEN_PRODUCTS_KEY, []);
    return new Set(Array.isArray(arr) ? arr : []);
  };

  /**
   * Проверить, скрыт ли продукт
   * @param {string|number} productId
   * @returns {boolean}
   */
  Store.isHiddenProduct = function (productId) {
    const hidden = Store.getHiddenProducts();
    return hidden.has(String(productId));
  };

  /**
   * Скрыть продукт из списка "Ваши продукты"
   * @param {string|number} productId
   */
  Store.hideProduct = function (productId) {
    const id = String(productId);
    const hidden = Store.getHiddenProducts();
    if (!hidden.has(id)) {
      hidden.add(id);
      Store.set(HIDDEN_PRODUCTS_KEY, Array.from(hidden));
      Store.removeFavorite?.(id);
    }
  };

  /**
   * Вернуть продукт в список "Ваши продукты"
   * @param {string|number} productId
   */
  Store.unhideProduct = function (productId) {
    const id = String(productId);
    const hidden = Store.getHiddenProducts();
    if (hidden.has(id)) {
      hidden.delete(id);
      Store.set(HIDDEN_PRODUCTS_KEY, Array.from(hidden));
    }
  };

  /**
   * Переключить скрытие продукта
   * @param {string|number} productId
   * @returns {boolean} новое состояние (true = скрыт)
   */
  Store.toggleHiddenProduct = function (productId) {
    const id = String(productId);
    const hidden = Store.getHiddenProducts();
    let newState;
    if (hidden.has(id)) {
      hidden.delete(id);
      newState = false;
    } else {
      hidden.add(id);
      newState = true;
      Store.removeFavorite?.(id);
    }
    Store.set(HIDDEN_PRODUCTS_KEY, Array.from(hidden));
    return newState;
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🔒 PERSISTENT STORAGE API — Защита от очистки браузером
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Запрашивает у браузера постоянное хранилище
   * Защищает данные от автоматической очистки при нехватке места
   * @returns {Promise<{persisted: boolean, estimate: {usage: number, quota: number}}>}
   */
  Store.requestPersistentStorage = async function () {
    const result = { persisted: false, estimate: null };

    try {
      // Проверяем поддержку API
      if (!navigator.storage || !navigator.storage.persist) {
        return result;
      }

      // Проверяем текущий статус
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) {
        result.persisted = true;
      } else {
        // Запрашиваем постоянное хранилище
        const granted = await navigator.storage.persist();
        result.persisted = granted;
      }

      // Получаем информацию о квоте
      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        result.estimate = {
          usage: Math.round(estimate.usage / 1024 / 1024 * 100) / 100, // MB
          quota: Math.round(estimate.quota / 1024 / 1024 * 100) / 100, // MB
          usedPct: Math.round(estimate.usage / estimate.quota * 100)
        };
      }

    } catch (e) {
      console.warn('[Storage] Ошибка Persistent Storage:', e);
    }

    return result;
  };

  /**
   * Проверить статус постоянного хранилища
   * @returns {Promise<boolean>}
   */
  Store.isPersistent = async function () {
    try {
      if (navigator.storage && navigator.storage.persisted) {
        return await navigator.storage.persisted();
      }
    } catch (e) { }
    return false;
  };

  /**
   * Получить информацию о хранилище
   * @returns {Promise<{usage: number, quota: number, usedPct: number, persisted: boolean}>}
   */
  Store.getStorageInfo = async function () {
    const info = { usage: 0, quota: 0, usedPct: 0, persisted: false };

    try {
      if (navigator.storage) {
        if (navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          info.usage = Math.round(est.usage / 1024 / 1024 * 100) / 100;
          info.quota = Math.round(est.quota / 1024 / 1024 * 100) / 100;
          info.usedPct = Math.round(est.usage / est.quota * 100);
        }
        if (navigator.storage.persisted) {
          info.persisted = await navigator.storage.persisted();
        }
      }
    } catch (e) { }

    return info;
  };

  // ═══════════════════════════════════════════════════════════════════
  // 📊 COMPRESSION STATS — Статистика сжатия
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Анализ эффективности сжатия для конкретного ключа
   * @param {string} key - ключ в localStorage
   * @returns {{raw: number, compressed: number, saved: number, savedPct: number}}
   */
  Store.analyzeCompression = function (key) {
    try {
      const sk = scoped(key);
      const stored = localStorage.getItem(sk);
      if (!stored) return null;

      const isCompressed = stored.startsWith('¤Z¤');
      const data = decompress(stored);
      const rawJson = JSON.stringify(data);

      return {
        key: sk,
        isCompressed,
        raw: rawJson.length,
        stored: stored.length,
        saved: rawJson.length - stored.length,
        savedPct: Math.round((1 - stored.length / rawJson.length) * 100)
      };
    } catch (e) {
      return null;
    }
  };

  /**
   * Общая статистика по всему localStorage
   * @returns {{totalRaw: number, totalStored: number, savedPct: number, keys: number}}
   */
  Store.getCompressionStats = function () {
    let totalRaw = 0;
    let totalStored = 0;
    let compressedKeys = 0;
    let totalKeys = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith('heys_')) continue;

      totalKeys++;
      const stored = localStorage.getItem(key);
      totalStored += stored.length * 2; // UTF-16

      if (stored.startsWith('¤Z¤')) {
        compressedKeys++;
        try {
          const data = decompress(stored);
          totalRaw += JSON.stringify(data).length * 2;
        } catch (e) {
          totalRaw += stored.length * 2;
        }
      } else {
        totalRaw += stored.length * 2;
      }
    }

    return {
      totalRaw: Math.round(totalRaw / 1024), // KB
      totalStored: Math.round(totalStored / 1024), // KB
      savedKB: Math.round((totalRaw - totalStored) / 1024),
      savedPct: totalRaw > 0 ? Math.round((1 - totalStored / totalRaw) * 100) : 0,
      keys: totalKeys,
      compressedKeys
    };
  };

  // Автоматический запрос persistent storage при загрузке
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      // Запрашиваем через 2 сек после загрузки (когда есть взаимодействие)
      setTimeout(() => {
        Store.requestPersistentStorage().catch(() => { });
      }, 2000);
    });
  }

  // 🔧 Экспорт compress/decompress для использования в cloud sync
  Store.decompress = decompress;
  Store.compress = compress;

})(window);
