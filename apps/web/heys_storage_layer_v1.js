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

      // perf: tiny payloads rarely benefit from pattern pass; skip main-thread work
      if (json.length <= 384) {
        return json;
      }

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

  /**
   * То же сжатие паттернами, что compress(), но порог ~1.5% — для RPC upload
   * больших каталогов heys_products (шлюз 413 на batch_upsert_client_kv_by_session).
   * Возвращает строку с префиксом ¤Z¤ или null если выгода слишком мала.
   */
  function compressProductsWire(obj) {
    try {
      if (obj == null || typeof obj !== 'object') return null;
      const seen = new WeakSet();
      let json = JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return undefined;
          }
          seen.add(value);
        }
        return value;
      });
      if (json.length <= 384) return null;
      json = json.replace(/:(-?\d+)\.0+(?=[,}\]])/g, ':$1');
      json = json.replace(/:(-?\d+\.\d*?)0+(?=[,}\]])/g, ':$1');
      let compressed = json;
      for (const [pattern, code] of Object.entries(COMPRESS_PATTERNS)) {
        compressed = compressed.split(pattern).join(code);
      }
      const RATIO = 0.985;
      if (compressed.length < json.length * RATIO) {
        return '¤Z¤' + compressed;
      }
      return null;
    } catch (e) {
      return null;
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

  // ────────────────────────────────────────────────────────────────────────
  // 🔍 POLLUTION-TRACE (added 2026-06-01 incident 3): instrument write paths
  // и switchClient lifecycle, чтобы при следующем pollution-incident'е
  // можно было точно установить КОГДА данные одного клиента ушли под
  // scope другого. Логи с префиксом [POLLUTION-TRACE] для grep'а. Также
  // буферизуем последние 500 записей в HEYS.__pollutionTrace для post-mortem.
  // ────────────────────────────────────────────────────────────────────────
  function __ptFingerprint(v) {
    if (!v || typeof v !== 'object') return null;
    try {
      const fp = {};
      if (Array.isArray(v.meals)) {
        fp.meals = v.meals.length;
        if (v.meals[0] && typeof v.meals[0] === 'object') {
          fp.meal0 = String(v.meals[0].name || v.meals[0].title || '').slice(0, 30);
        }
      }
      if (v.weightMorning != null) fp.wm = v.weightMorning;
      if (v.firstName != null) fp.fn = String(v.firstName).slice(0, 20);
      if (v.weight != null) fp.w = v.weight;
      if (v.gender != null) fp.g = v.gender;
      if (v._writerCid) fp.wc = String(v._writerCid).slice(0, 8);
      if (v.updatedAt != null) fp.ts = v.updatedAt;
      return fp;
    } catch (_) { return null; }
  }
  function __pt(stage, payload) {
    try {
      const entry = {
        ts: new Date().toISOString(),
        stage,
        cid: ns().slice(0, 8) || null,
        switchInProgress: !!(global.HEYS?.cloud?._switchClientInProgress),
        ...payload,
      };
      const arr = global.HEYS.__pollutionTrace = global.HEYS.__pollutionTrace || [];
      arr.push(entry);
      if (arr.length > 500) arr.shift();
      // Compact line for console
      const tail = Object.entries(payload || {})
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(' ');
      console.info(`[POLLUTION-TRACE] ${stage} cid=${entry.cid} switching=${entry.switchInProgress} ${tail}`);
    } catch (_) { /* never break */ }
  }
  // Expose helper for instrumentation in other modules
  global.HEYS.__pt = __pt;
  global.HEYS.__ptFingerprint = __ptFingerprint;
  global.HEYS.__ptDump = function () {
    return (global.HEYS.__pollutionTrace || []).slice(-100);
  };
  function scoped(k) {
    const cid = ns();
    if (!cid) return k;
    // Non-client-data ключи (curator UI session: theme, widget_layout, whats_new и т.д.)
    // никогда не скоупим под currentClientId — иначе каждый client switch плодит
    // отдельную копию в LS и в client_kv_store (incident 2026-05-31: 25 строк с
    // одинаковым md5). Single source of truth: глобальный unscoped LS-слот +
    // существующие isNonClientDataKey gates в cloud.saveClientKey блокируют cloud upload.
    try {
      const c = global.HEYS && global.HEYS.cloud;
      if (c && typeof c.isNonClientDataKey === 'function' && c.isNonClientDataKey(k)) return k;
    } catch (_) { /* noop — fall through to legacy regex below */ }
    // 🎮 Global keys — НЕ добавляем clientId (для совместимости с cloud sync)
    // heys_game теперь client-scoped (иначе XP смешивается между клиентами)
    if (/^heys_(clients|client_current|sound_settings)$/i.test(k)) return k;

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

  function dayItemsCount(day) {
    if (!day || !Array.isArray(day.meals)) return 0;
    return day.meals.reduce((sum, meal) => sum + (Array.isArray(meal?.items) ? meal.items.length : 0), 0);
  }

  function shouldRecoverDoubleScopedDay(currentValue, recoveredValue) {
    if (!recoveredValue || typeof recoveredValue !== 'object') return false;
    if (!currentValue || typeof currentValue !== 'object') return true;
    const currentUpdatedAt = Number(currentValue.updatedAt || 0);
    const recoveredUpdatedAt = Number(recoveredValue.updatedAt || 0);
    if (recoveredUpdatedAt > currentUpdatedAt) return true;
    if (recoveredUpdatedAt === currentUpdatedAt && dayItemsCount(recoveredValue) > dayItemsCount(currentValue)) {
      return true;
    }
    return false;
  }

  function validProductsList(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(p => p && typeof p.name === 'string' && p.name.trim().length > 0);
  }

  function backupProductsList(value) {
    if (Array.isArray(value)) return validProductsList(value);
    if (value && Array.isArray(value.data)) return validProductsList(value.data);
    if (value && Array.isArray(value.products)) return validProductsList(value.products);
    return [];
  }

  function looksLikeProductsCatalogKey(key) {
    if (typeof key !== 'string') return false;
    if (!/products/i.test(key)) return false;
    if (/(shared|hidden|favorite|deleted|usage|search|cache|rpc_tail)/i.test(key)) return false;
    return (
      key === 'heys_products' ||
      /^heys_[a-f0-9-]{36}_products$/i.test(key) ||
      /^heys_[a-f0-9-]{36}_heys_products$/i.test(key) ||
      /^heys_[a-f0-9-]{36}_[a-f0-9-]{36}_products$/i.test(key)
    );
  }

  function findRecoverableProducts(scopedKey) {
    try {
      const cid = ns();
      const preferred = [];
      if (scopedKey) preferred.push(scopedKey);
      if (cid) {
        preferred.push(`heys_${cid}_products`);
        preferred.push(`heys_${cid}_heys_products`);
        preferred.push(`heys_${cid}_${cid}_products`);
      }
      preferred.push('heys_products');

      const seen = new Set();
      const keys = [];
      preferred.forEach(key => {
        if (key && !seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      });
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !seen.has(key) && looksLikeProductsCatalogKey(key)) {
          seen.add(key);
          keys.push(key);
        }
      }

      let best = null;
      let bestLen = 0;
      let bestKey = '';
      keys.forEach(key => {
        const candidate = validProductsList(rawGet(key, undefined));
        if (candidate.length > bestLen) {
          best = candidate;
          bestLen = candidate.length;
          bestKey = key;
        }
      });
      if (bestLen > 0) return { value: best, key: bestKey, length: bestLen, source: 'catalog' };

      const backupKeys = [];
      if (cid) {
        backupKeys.push(`heys_${cid}_products_backup`);
        backupKeys.push(`heys_${cid}_heys_products_backup`);
      }
      backupKeys.push('heys_products_backup');
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /products_backup$/i.test(key) && !backupKeys.includes(key)) backupKeys.push(key);
      }
      backupKeys.forEach(key => {
        const candidate = backupProductsList(rawGet(key, undefined));
        if (candidate.length > bestLen) {
          best = candidate;
          bestLen = candidate.length;
          bestKey = key;
        }
      });
      if (bestLen > 0) return { value: best, key: bestKey, length: bestLen, source: 'backup' };
    } catch (e) { }
    return null;
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
        if (k === 'heys_products' && Array.isArray(cached) && cached.length === 0) {
          const recovered = findRecoverableProducts(sk);
          if (recovered && recovered.length > 0) {
            memory.set(sk, recovered.value);
            rawSet(sk, recovered.value);
            console.warn('[Store.get] 🛠️ Recovered products from', recovered.source, recovered.key, '→', sk, `(${recovered.length})`);
            return recovered.value;
          }
        }
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
      try {
        const cid = ns();
        const isDayV2 = cid && typeof sk === 'string' && sk.includes('dayv2_');
        const ownPrefix = `heys_${cid}_`;
        if (isDayV2 && sk.startsWith(ownPrefix)) {
          const doubleScopedKey = `heys_${cid}_${sk.slice(ownPrefix.length)}`;
          if (doubleScopedKey !== sk) {
            const recovered = rawGet(doubleScopedKey, undefined);
            if (shouldRecoverDoubleScopedDay(v, recovered)) {
              v = recovered;
              memory.set(sk, recovered);
              rawSet(sk, recovered);
              console.warn('[Store.get] 🛠️ Recovered double-scoped day key:', doubleScopedKey, '→', sk);
            }
          }
        }
      } catch (e) { }
      if (v === undefined || v === null) {
        // try legacy unscoped key (with safeguards for heys_game)
        try {
          let allowLegacy = true;
          const cid = ns();
          if (cid && k === 'heys_game') {
            allowLegacy = false;
            // Разрешаем legacy только если нет других client-scoped game ключей
            const clientPrefix = `heys_${cid}_`;
            let hasOtherGame = false;
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.endsWith('_game') && key.startsWith('heys_') && !key.startsWith(clientPrefix)) {
                hasOtherGame = true;
                break;
              }
            }
            if (!hasOtherGame) {
              allowLegacy = true;
            }
          }

          if (allowLegacy) {
            const legacy = rawGet(k, undefined);
            if (legacy !== undefined && legacy !== null) {
              // migrate to scoped key for future reads/writes
              memory.set(sk, legacy);
              rawSet(sk, legacy);
              return legacy;
            }
          }
        } catch (e) { }
        // Fallback: if products are stored under another clientId scope
        if (k === 'heys_products') {
          try {
            const recovered = findRecoverableProducts(sk);
            if (recovered && recovered.length > 0) {
              memory.set(sk, recovered.value);
              rawSet(sk, recovered.value);
              console.warn('[Store.get] 🛠️ Recovered products from', recovered.source, recovered.key, '→', sk, `(${recovered.length})`);
              return recovered.value;
            }
          } catch (e) { }
        }
        // return default
        v = def;
      }
      if (k === 'heys_products' && Array.isArray(v) && v.length === 0) {
        const recovered = findRecoverableProducts(sk);
        if (recovered && recovered.length > 0) {
          v = recovered.value;
          rawSet(sk, recovered.value);
          console.warn('[Store.get] 🛠️ Recovered products from', recovered.source, recovered.key, '→', sk, `(${recovered.length})`);
        }
      }
      memory.set(sk, v);
      return v;
    };
  })(Store.get);
  /** Replay writes deferred during cloud.switchClient (see cloud._flushDeferredWritesAfterSwitch). */
  const HEYS_SCOPED_LEAD_RE = /^heys_([a-f0-9-]{36})_/i;
  Store.__replayDeferredSwitchWrites = function (rows, newClientId, oldClientId) {
    if (!Array.isArray(rows) || !rows.length) return { replayed: 0, skipped: 0 };
    let replayed = 0;
    let skipped = 0;
    const oldC = oldClientId || '';
    // 🛡️ Same blacklist gate как в Store.set: global keys (heys_clients,
    // heys_debug_events и т.д.) не идут в cloud.saveClientKey даже из replay
    // пути. Раньше replay обходил gate в Store.set и proxy кричал warning'и.
    const _shouldSyncToCloud = (sk) => {
      const c = global.HEYS && global.HEYS.cloud;
      if (c && typeof c.isNonClientDataKey === 'function' && c.isNonClientDataKey(sk)) return false;
      return true;
    };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sk = row && row.sk;
      const v = row && row.v;
      if (!sk || v === undefined || typeof v === 'function') {
        skipped++;
        continue;
      }
      const m = typeof sk === 'string' ? sk.match(HEYS_SCOPED_LEAD_RE) : null;
      const lead = m && m[1];
      if (lead && lead !== newClientId && (!oldC || lead !== oldC)) {
        skipped++;
        continue;
      }
      if (lead === newClientId) {
        memory.set(sk, v);
        rawSet(sk, v);
        if (watchers.has(sk)) watchers.get(sk).forEach(fn => { try { fn(v); } catch (e) { } });
        try {
          if (global.HEYS && typeof global.HEYS.saveClientKey === 'function' && newClientId && _shouldSyncToCloud(sk)) {
            global.HEYS.saveClientKey(newClientId, sk, v);
          }
        } catch (e) { }
        replayed++;
        continue;
      }
      if (oldC && lead === oldC) {
        try {
          if (global.HEYS && typeof global.HEYS.saveClientKey === 'function' && _shouldSyncToCloud(sk)) {
            global.HEYS.saveClientKey(oldC, sk, v);
          }
        } catch (e) { }
        replayed++;
        continue;
      }
      if (!lead && newClientId && sk.indexOf(newClientId) >= 0) {
        memory.set(sk, v);
        rawSet(sk, v);
        if (watchers.has(sk)) watchers.get(sk).forEach(fn => { try { fn(v); } catch (e) { } });
        try {
          if (global.HEYS && typeof global.HEYS.saveClientKey === 'function' && _shouldSyncToCloud(sk)) {
            global.HEYS.saveClientKey(newClientId, sk, v);
          }
        } catch (e) { }
        replayed++;
        continue;
      }
      skipped++;
    }
    return { replayed, skipped };
  };

  // ── HEYS internal quota meter (Phase 4) ────────────────────────────────
  // Checks HEYS own 4.5 MB budget every 50 writes (full LS scan, acceptable
  // since it's amortised). Browser-level navigator.storage.estimate() is used
  // only as a secondary safety net logged at 95% if HEYS budget constant is wrong.
  const HEYS_BUDGET_BYTES = 4.5 * 1024 * 1024;
  let _quotaWriteCounter = 0;
  const QUOTA_CHECK_INTERVAL = 50;
  let _quotaWarned75 = false, _quotaWarned85 = false, _quotaWarned95 = false;

  function _measureLsBytes() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        total += (k.length + (localStorage.getItem(k) || '').length) * 2;
      }
    } catch (_) {}
    return total;
  }

  function _triggerEmergencyAudit() {
    try {
      const reg = global.HEYS?.storageRegistry;
      if (reg && typeof reg.runStorageAuditOnce === 'function') {
        reg.runStorageAuditOnce({ force: true, bypassIdle: true });
      }
    } catch (_) {}
  }

  function maybeReportQuota() {
    if (++_quotaWriteCounter < QUOTA_CHECK_INTERVAL) return;
    _quotaWriteCounter = 0;
    const used = _measureLsBytes();
    const pct = used / HEYS_BUDGET_BYTES;
    if (pct >= 0.95 && !_quotaWarned95) {
      _quotaWarned95 = true;
      console.warn('[HEYS.storage] HEYS budget 95% — emergency audit triggered');
      _triggerEmergencyAudit();
      if (navigator.storage?.estimate) {
        navigator.storage.estimate().then(({ usage, quota }) => {
          if (quota && usage / quota >= 0.95) {
            console.warn('[HEYS.storage] Browser quota also 95% — HEYS_BUDGET_BYTES may be too high');
          }
        }).catch(() => {});
      }
    } else if (pct >= 0.85 && !_quotaWarned85) {
      _quotaWarned85 = true;
      console.warn('[HEYS.storage] HEYS budget 85%');
    } else if (pct >= 0.75 && !_quotaWarned75) {
      _quotaWarned75 = true;
      console.info('[HEYS.storage] HEYS budget 75%');
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  // 🛡️ Cross-client merge invariant (Strategy B, 2026-06-01).
  // Tag every dayv2 write with _writerCid извлечённым из scoped key. Это позволяет
  // mergeDayData отвергать cross-client merges (incident: Алексин cycleDay/MA
  // утекал в Poplanton через mergeDayData с `remote` от чужого клиента). Тег
  // идёт от KEY scope, не от currentClientId — корректно для defer/re-scope
  // путей, где deferSk указывает на oldCid пока currentClientId уже newCid.
  const HEYS_DAYV2_KEY_RE = /^heys_([0-9a-f-]{36})_dayv2_\d{4}-\d{2}-\d{2}$/i;
  function tagDayV2WriterCid(sk, v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const m = HEYS_DAYV2_KEY_RE.exec(sk);
    if (!m) return v;
    const cid = m[1];
    if (v._writerCid === cid) return v;
    // 🔍 trace: writerCid changes (включая first-tag undefined→cid, и cross-cid re-tag).
    try {
      __pt('TAG_CID', {
        sk: sk.slice(0, 60),
        keyCid: cid.slice(0, 8),
        prevWriter: v._writerCid ? String(v._writerCid).slice(0, 8) : 'null',
        mealsLen: Array.isArray(v.meals) ? v.meals.length : null,
      });
    } catch (_) { /* noop */ }
    return { ...v, _writerCid: cid };
  }

  Store.set = function (k, v) {
    const sk = scoped(k);
    v = tagDayV2WriterCid(sk, v);
    // 🔍 trace: log every write для guarded keys (dayv2/profile/norms/game/hr_zones).
    try {
      if (/^heys_(?:[0-9a-f-]{36}_)?(?:profile|norms|game|hr_zones|dayv2_)/i.test(sk)) {
        const stack = (new Error()).stack || '';
        const caller = stack.split('\n').slice(2, 4).map(s => s.trim().replace(/^at\s+/, '').slice(0, 80)).join(' ← ');
        __pt('STORE_SET', {
          k: k.slice(0, 60),
          sk: sk.slice(0, 80),
          fp: __ptFingerprint(v),
          caller,
        });
      }
    } catch (_) { /* noop */ }
    // 🔧 v69 FIX: Блокируем все записи во время switchClient.
    // Gate flow теперь НЕ меняет currentClientId до завершения switch,
    // но на случай если другой путь всё же вызовет Store.set — блокируем.
    if (global.HEYS?.cloud?._switchClientInProgress) {
      // Разрешаем только служебные ключи
      if (!/^heys_(clients|client_current|last_client_id)$/i.test(k)) {
        try {
          const c = global.HEYS.cloud;
          if (!c._deferredStoreWriteMap || typeof c._deferredStoreWriteMap.set !== 'function') {
            c._deferredStoreWriteMap = new Map();
          }
          // 🔧 v74 FIX: Re-scope defer key под OLD client.
          // Во время switchClient `ns()` уже возвращает newClientId (выставлен
          // на строке 12219 в heys_storage_supabase_v1.js), поэтому `sk` уже
          // scoped под NEW. Но любой Store.set здесь — это stale React state
          // OLD клиента (debounced autosave из profile/norms/hr-zones/day).
          // Re-scope под OLD, чтобы replay в __replayDeferredSwitchWrites
          // отправил данные в OLD scope (LS+cloud), а не утёк в NEW.
          let deferSk = sk;
          const snap = c._switchSnapshot;
          const oldCid = snap && snap.oldCid;
          const curCid = ns();
          if (oldCid && oldCid !== curCid && curCid) {
            // sk имеет вид 'heys_<curCid>_<tail>'. Меняем curCid → oldCid.
            const reHasNew = new RegExp('^heys_' + curCid + '_');
            if (reHasNew.test(sk)) {
              deferSk = sk.replace(reHasNew, 'heys_' + oldCid + '_');
            }
          }
          // Re-tag _writerCid под deferSk scope (если re-scope сменил ключ).
          if (deferSk !== sk) v = tagDayV2WriterCid(deferSk, v);
          c._deferredStoreWriteMap.set(deferSk, { sk: deferSk, v });
          if (deferSk !== sk) {
            try {
              global.HEYS._syncDebug = global.HEYS._syncDebug || [];
              global.HEYS._syncDebug.push({
                ts: new Date().toISOString(),
                step: 'leak-blocked',
                payload: {
                  keyShape: String(k).slice(0, 40),
                  oldCid: oldCid && oldCid.slice(0, 8),
                  newCid: curCid && curCid.slice(0, 8),
                },
              });
              if (global.HEYS._syncDebug.length > 200) global.HEYS._syncDebug.shift();
            } catch (_) { /* noop */ }
            // Operational log, не warning — это нормальный flow switchClient'а.
            console.debug('[Store.set] 🛡️ LEAK-BLOCKED re-scoped to OLD:', k, '→', deferSk);
          } else {
            console.debug('[Store.set] 🛡️ DEFERRED during switchClient:', k);
          }
        } catch (_) { }
        return;
      }
    }
    memory.set(sk, v);
    rawSet(sk, v);
    maybeReportQuota();
    if (watchers.has(sk)) watchers.get(sk).forEach(fn => { try { fn(v); } catch (e) { } });
    try {
      if (global.HEYS && typeof global.HEYS.saveClientKey === 'function') {
        const cid = ns();
        if (cid) {
          // 🛡️ Source-of-truth gate: global / non-client ключи (heys_clients,
          // heys_client_current, heys_debug_events и т.д.) не должны идти в
          // cloud.saveClientKey. Раньше блокировка была только на proxy-слое
          // (heys_app_global_bindings_v1.js:27) с шумным warning'ом — теперь
          // отсекаем здесь, до выхода из storage layer. Proxy остаётся как
          // defence-in-depth, но больше не кричит на каждый global key.
          if (global.HEYS.cloud && typeof global.HEYS.cloud.isNonClientDataKey === 'function'
              && global.HEYS.cloud.isNonClientDataKey(sk)) {
            return;
          }
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
  // 🍽️ ГОТОВЫЕ НАБОРЫ (MEAL PRESETS)
  // ═══════════════════════════════════════════════════════════════════
  const MEAL_PRESETS_KEY = 'heys_meal_presets_v1';

  /**
   * Получить все сохранённые наборы
   * @returns {Array<{id: string, name: string, items: Array, createdAt: number, updatedAt: number}>}
   */
  Store.getMealPresets = function () {
    const arr = Store.get(MEAL_PRESETS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  };

  /**
   * Сохранить или обновить набор (upsert по id)
   * @param {{id?: string, name: string, items: Array, createdAt?: number, updatedAt?: number}} preset
   * @returns {string} id сохранённого набора
   */
  Store.saveMealPreset = function (preset) {
    const presets = Store.getMealPresets();
    const id = preset.id || ('mp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    const now = Date.now();
    const normalized = {
      id,
      name: preset.name || 'Набор',
      items: Array.isArray(preset.items) ? preset.items : [],
      createdAt: preset.createdAt || now,
      updatedAt: now,
    };
    const idx = presets.findIndex((p) => p.id === id);
    if (idx >= 0) {
      presets[idx] = normalized;
    } else {
      presets.unshift(normalized);
    }
    Store.set(MEAL_PRESETS_KEY, presets);
    console.info('[HEYS.storage] ✅ Meal preset saved:', { id, name: normalized.name, itemCount: normalized.items.length });
    return id;
  };

  /**
   * Удалить набор по id
   * @param {string} id
   */
  Store.deleteMealPreset = function (id) {
    const presets = Store.getMealPresets();
    const updated = presets.filter((p) => p.id !== id);
    Store.set(MEAL_PRESETS_KEY, updated);
    console.info('[HEYS.storage] ✅ Meal preset deleted:', { id });
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🤖 РЕКОМЕНДУЕМЫЕ НАБОРЫ (SUGGESTED PRESETS — из анализа истории)
  // ═══════════════════════════════════════════════════════════════════
  const SUGGESTED_PRESETS_KEY = 'heys_suggested_presets_v1';
  const SUGGESTED_PRESETS_DISMISSED_KEY = 'heys_suggested_presets_dismissed_v1';

  /**
   * Получить все рекомендованные (неодобренные) наборы
   * @returns {Array}
   */
  Store.getSuggestedPresets = function () {
    const arr = Store.get(SUGGESTED_PRESETS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  };

  /**
   * Подтвердить рекомендованный набор → переводит его в confirmed presets
   * @param {string} id
   * @returns {string|null} id сохранённого набора
   */
  Store.confirmSuggestedPreset = function (id) {
    const suggested = Store.getSuggestedPresets();
    const preset = suggested.find((p) => p.id === id);
    if (!preset) return null;
    // Убираем из рекомендаций
    Store.set(SUGGESTED_PRESETS_KEY, suggested.filter((p) => p.id !== id));
    // Сохраняем как обычный набор
    const savedId = Store.saveMealPreset({
      name: preset.name,
      items: (preset.items || []).map((item) => ({ ...item, grams: item.grams || 100 })),
    });
    console.info('[HEYS.storage] ✅ Suggested preset confirmed:', { id, name: preset.name });
    return savedId;
  };

  /**
   * Отклонить рекомендованный набор (удаляет его и заносит в черный список)
   * @param {string} id
   */
  Store.dismissSuggestedPreset = function (id) {
    const suggested = Store.getSuggestedPresets();
    const preset = suggested.find((p) => p.id === id);
    if (!preset) return;

    // Удаляем из активных
    Store.set(SUGGESTED_PRESETS_KEY, suggested.filter((p) => p.id !== id));

    // Добавляем сигнатуру в черный список, чтобы движок больше не предлагал
    if (preset.signature) {
      const dismissed = Store.get(SUGGESTED_PRESETS_DISMISSED_KEY, []);
      if (!dismissed.includes(preset.signature)) {
        dismissed.push(preset.signature);
        if (dismissed.length > 500) dismissed.shift(); // защита от переполнения
        Store.set(SUGGESTED_PRESETS_DISMISSED_KEY, dismissed);
      }
    }

    console.info('[HEYS.storage] ✅ Suggested preset dismissed (blacklisted):', { id });
  };

  /**
   * Анализирует историю приёмов пищи и формирует рекомендации наборов.
   * Ищет сочетания продуктов (по product_id, без учёта граммовки), которые
   * встречаются в истории не менее minFrequency раз.
   *
   * @param {{ minFrequency?: number, maxComboSize?: number }} [options]
   * @returns {number} количество актуальных рекомендаций
   */
  Store.runPresetSuggestionEngine = function (options) {
    const MIN_FREQUENCY = (options && options.minFrequency) || 3;
    const MAX_COMBO_SIZE = (options && options.maxComboSize) || 8;
    const MIN_COMBO_SIZE = (options && options.minComboSize) || 2;

    // --- Собираем все дни из localStorage ---
    const allDays = [];
    try {
      const lsKeys = Object.keys(localStorage);
      const dayKeyPattern = /dayv2_\d{4}-\d{2}-\d{2}$/;
      lsKeys.forEach(function (key) {
        if (!dayKeyPattern.test(key)) return;
        try {
          const raw = localStorage.getItem(key);
          if (!raw) return;
          const data = JSON.parse(raw);
          if (data && Array.isArray(data.meals)) allDays.push(data);
        } catch (e) { /* пропускаем битые дни */ }
      });
    } catch (e) {
      console.warn('[HEYS.storage] ⚠️ runPresetSuggestionEngine: ошибка чтения LS', e);
      return 0;
    }

    if (allDays.length === 0) {
      console.info('[HEYS.storage] ℹ️ runPresetSuggestionEngine: нет данных о днях');
      return 0;
    }

    // --- Строим карту частотности сочетаний ---
    var comboMap = new Map();

    // -- Хелпер для нормализации продуктов и создания сигнатуры --
    function getComboSignature(items) {
      var uMap = new Map();
      items.forEach(function (item) {
        var n = String(item.name || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
        var fallbackId = String(item.product_id || item.id);
        var key = n || fallbackId;
        if (!uMap.has(key)) uMap.set(key, item);
      });
      var uniqueItems = Array.from(uMap.values());

      // Сортируем элементы по имени для предсказуемого отображения
      uniqueItems.sort(function (a, b) {
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      var signature = uniqueItems.map(function (i) {
        return String(i.name || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, '') || String(i.product_id || i.id);
      }).join('|');

      return { uniqueItems: uniqueItems, signature: signature };
    }

    // -- Нормализованный ключ продукта (для gramsHistory) --
    function normalizedItemKey(item) {
      return String(item.name || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, '') || String(item.product_id || item.id);
    }

    // -- Извлечение граммов из item (только валидные числа > 0) --
    function extractItemGrams(item) {
      var g = Number(item && (item.grams != null ? item.grams : item.weight));
      return Number.isFinite(g) && g > 0 ? Math.round(g) : null;
    }

    // -- Самая частая граммовка (MODE). При равной частоте: ближе к 100г, затем меньшее значение --
    function computeMostFrequentGrams(arr) {
      if (!arr || arr.length === 0) return 100;

      var freq = new Map();
      arr.forEach(function (val) {
        var g = Number(val);
        if (!Number.isFinite(g) || g <= 0) return;
        g = Math.round(g);
        freq.set(g, (freq.get(g) || 0) + 1);
      });

      if (freq.size === 0) return 100;

      var bestVal = 100;
      var bestCount = -1;
      freq.forEach(function (count, val) {
        if (count > bestCount) {
          bestCount = count;
          bestVal = val;
          return;
        }
        if (count === bestCount) {
          var currentDist = Math.abs(val - 100);
          var bestDist = Math.abs(bestVal - 100);
          if (currentDist < bestDist || (currentDist === bestDist && val < bestVal)) {
            bestVal = val;
          }
        }
      });

      return bestVal;
    }

    // --- Собираем все приёмы пищи ---
    allDays.forEach(function (day) {
      (day.meals || []).forEach(function (meal) {
        var items = (meal.items || []).filter(function (item) {
          return item.product_id || item.id;
        });

        // Получаем уникальные продукты и сигнатуру по ИМЕНИ (или ID)
        var comboData = getComboSignature(items);
        var uniqueItems = comboData.uniqueItems;
        var signature = comboData.signature;

        if (uniqueItems.length < MIN_COMBO_SIZE || uniqueItems.length > MAX_COMBO_SIZE) return;

        if (comboMap.has(signature)) {
          var entry = comboMap.get(signature);
          entry.count++;
          var dayTs = day.date ? new Date(day.date).getTime() : Date.now();
          if (dayTs > entry.lastSeenAt) entry.lastSeenAt = dayTs;
          // накапливаем граммы для последующего выбора самого частого значения
          uniqueItems.forEach(function (item) {
            var key = normalizedItemKey(item);
            if (!entry.gramsHistory[key]) entry.gramsHistory[key] = [];
            var gramsVal = extractItemGrams(item);
            if (gramsVal != null) entry.gramsHistory[key].push(gramsVal);
          });
        } else {
          var dayTs = day.date ? new Date(day.date).getTime() : Date.now();
          var initGramsHistory = {};
          uniqueItems.forEach(function (item) {
            var gramsVal = extractItemGrams(item);
            initGramsHistory[normalizedItemKey(item)] = gramsVal != null ? [gramsVal] : [];
          });
          comboMap.set(signature, {
            gramsHistory: initGramsHistory,
            sampleItems: uniqueItems.map(function (item) {
              return {
                product_id: item.product_id || item.id,
                name: item.name || '',
                grams: 100,
                kcal100: item.kcal100 || 0,
                protein100: item.protein100 || 0,
                fat100: item.fat100 || 0,
                simple100: item.simple100 || 0,
                complex100: item.complex100 || 0,
                badFat100: item.badFat100 || 0,
                goodFat100: item.goodFat100 || 0,
                trans100: item.trans100 || 0,
                fiber100: item.fiber100 || 0,
                gi: item.gi || 0,
                harm: item.harm || 0,
              };
            }),
            count: 1,
            lastSeenAt: dayTs,
          });
        }
      });
    });

    // --- Пересчитываем grams по наиболее частому значению из истории ---
    comboMap.forEach(function (entry) {
      entry.sampleItems.forEach(function (item) {
        var history = entry.gramsHistory[normalizedItemKey(item)] || [];
        item.grams = computeMostFrequentGrams(history);
      });
    });

    // --- Фильтруем: только частые сочетания ---
    var frequentCombos = [];
    comboMap.forEach(function (entry, signature) {
      if (entry.count >= MIN_FREQUENCY) {
        frequentCombos.push(Object.assign({ signature: signature }, entry));
      }
    });

    if (frequentCombos.length === 0) {
      console.info('[HEYS.storage] ℹ️ runPresetSuggestionEngine: частых сочетаний не найдено', { days: allDays.length, minFreq: MIN_FREQUENCY });
      return 0;
    }

    // --- Исключаем уже подтверждённые наборы ---
    var confirmedPresets = Store.getMealPresets();
    var confirmedSignatures = new Set(
      confirmedPresets.map(function (p) {
        return getComboSignature(p.items || []).signature;
      })
    );

    // --- Исключаем отклонённые пользователем наборы (dismissed) ---
    var dismissedSignatures = new Set(Store.get(SUGGESTED_PRESETS_DISMISSED_KEY, []));

    // --- Обновляем или создаём рекомендации ---
    var existingSuggested = Store.getSuggestedPresets();
    var existingMap = new Map(existingSuggested.map(function (p) { return [p.signature, p]; }));
    var now = Date.now();
    var newSuggested = [];

    // --- Лог всех частых комбо до фильтрации ---
    console.groupCollapsed('[HEYS.storage] 📊 ML-presets: все частые комбо до фильтрации (' + frequentCombos.length + ')');
    frequentCombos.forEach(function (combo, i) {
      var names = combo.sampleItems.map(function (x) { return x.name || '?'; }).join(' + ');
      var isConfirmed = confirmedSignatures.has(combo.signature);
      console.info('[HEYS.storage] combo[' + (i + 1) + '] freq=' + combo.count + (isConfirmed ? ' ⛔ уже сохранён' : ' ✅ кандидат') + ' → ' + names);
    });
    console.groupEnd();

    // --- Детекция и исключение подмножеств среди кандидатов ---
    var candidateCombos = frequentCombos.filter(function (c) { return !confirmedSignatures.has(c.signature); });

    // Строим Set сигнатур-подмножеств: если все ключи A входят в B и A меньше B — A исключается
    var subsetSignatures = new Set();
    candidateCombos.forEach(function (comboA, iA) {
      var keysA = new Set(comboA.sampleItems.map(function (x) {
        return String(x.name || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, '') || String(x.product_id || x.id);
      }));
      candidateCombos.forEach(function (comboB, iB) {
        if (iA === iB) return;
        var keysB = new Set(comboB.sampleItems.map(function (x) {
          return String(x.name || '').toLowerCase().replace(/[^a-zа-яё0-9]/g, '') || String(x.product_id || x.id);
        }));
        var isSubset = Array.from(keysA).every(function (k) { return keysB.has(k); });
        if (isSubset && keysA.size < keysB.size) {
          var namesA = comboA.sampleItems.map(function (x) { return x.name || '?'; }).join(' + ');
          var namesB = comboB.sampleItems.map(function (x) { return x.name || '?'; }).join(' + ');
          var diffKeys = Array.from(keysB).filter(function (k) { return !keysA.has(k); });
          console.info('[HEYS.storage] ⛔ SUBSET исключён: freq=' + comboA.count + ', лишние в большем: ' + diffKeys.join(', ') + '\n  исключаем: ' + namesA + '\n  оставляем: ' + namesB);
          subsetSignatures.add(comboA.signature);
        }
      });
    });

    frequentCombos.forEach(function (combo) {
      if (confirmedSignatures.has(combo.signature)) {
        var skippedNames = combo.sampleItems.map(function (x) { return x.name || '?'; }).join(' + ');
        console.info('[HEYS.storage] ⛔ ML-presets: пропущен (уже в пресетах): freq=' + combo.count + ' → ' + skippedNames);
        return;
      }
      if (dismissedSignatures.has(combo.signature)) {
        var skippedNamesDisp = combo.sampleItems.map(function (x) { return x.name || '?'; }).join(' + ');
        console.info('[HEYS.storage] ⛔ ML-presets: пропущен (был отменён): freq=' + combo.count + ' → ' + skippedNamesDisp);
        return;
      }
      if (subsetSignatures.has(combo.signature)) {
        return; // подмножество более крупного комбо — молча пропускаем
      }

      var names = combo.sampleItems.map(function (i) { return i.name; }).filter(Boolean);
      var displayName = names.length > 3
        ? names.slice(0, 3).join(' + ') + ' +' + (names.length - 3)
        : names.join(' + ');

      if (existingMap.has(combo.signature)) {
        var existing = existingMap.get(combo.signature);
        newSuggested.push(Object.assign({}, existing, {
          items: combo.sampleItems,
          frequency: combo.count,
          lastSeenAt: combo.lastSeenAt,
        }));
      } else {
        newSuggested.push({
          id: 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: displayName,
          items: combo.sampleItems,
          signature: combo.signature,
          suggested: true,
          frequency: combo.count,
          lastSeenAt: combo.lastSeenAt,
          createdAt: now,
        });
      }
    });

    // Сортируем по частоте (самые частые → первыми)
    newSuggested.sort(function (a, b) { return (b.frequency || 0) - (a.frequency || 0); });

    Store.set(SUGGESTED_PRESETS_KEY, newSuggested);

    console.groupCollapsed('[HEYS.storage] 🔍 ML-presets: сгенерировано ' + newSuggested.length + ' наборов (развернуть)');
    newSuggested.forEach(function (s, i) {
      var itemNames = s.items.map(function (item) { return item.name || 'Без названия'; }).join(' + ');
      console.info('[HEYS.storage] preset[' + (i + 1) + '] freq=' + s.frequency + ' → ' + itemNames);
    });
    console.groupEnd();

    console.info('[HEYS.storage] ✅ runPresetSuggestionEngine завершён:', {
      days: allDays.length,
      frequentCombos: frequentCombos.length,
      suggestions: newSuggested.length,
      minFrequency: MIN_FREQUENCY,
    });
    return newSuggested.length;
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

  // 🔧 Экспорт compress/decompress для использования в cloud sync.
  //
  // ⚠️ ВАЖНО про decompress: функция принимает ПОЛНУЮ строку, включая префикс
  // '¤Z¤'. Если вы передадите `raw.slice(3)` (только тело), она не распознает
  // префикс, попытается JSON.parse сжатые байты, упадёт и вернёт null. Это
  // была причина 14 одинаковых багов по всему проекту (см. readSafe ниже —
  // в большинстве кейсов лучше использовать его).
  Store.decompress = decompress;
  Store.compress = compress;
  Store.compressProductsWire = compressProductsWire;

  /**
   * Безопасное чтение LS-значения с уже выполненной декомпрессией.
   *
   * Заменяет inline-копии `readStoredValue` (~10 файлов), у каждой из которых
   * исторически была одна и та же ошибка `decompress(value.slice(3))`.
   *
   * Алгоритм:
   *   1. Store.get(key, fallback) — обычный путь (с memory cache + scoping).
   *   2. Если результат — сырая строка с префиксом ¤Z¤ (редко, но бывает на
   *      раннем boot или при сбое cache), пропускаем через decompress.
   *   3. Если результат — обычная JSON-строка, парсим.
   *   4. null/undefined → fallback.
   *
   * @param {string} key
   * @param {*} fallback — возвращается, если ключ пуст или парсинг не удался
   */
  Store.readSafe = function readSafe(key, fallback = null) {
    let value;
    try {
      value = Store.get ? Store.get(key, fallback) : null;
    } catch (_) {
      return fallback;
    }
    if (value == null) return fallback;
    if (typeof value !== 'string') return value;
    if (value.startsWith('¤Z¤')) {
      try {
        const decompressed = decompress(value);
        return decompressed == null ? fallback : decompressed;
      } catch (_) {
        return fallback;
      }
    }
    try { return JSON.parse(value); } catch (_) { return value; }
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🧹 ONE-SHOT CLEANUP — устаревшие per-client копии UI-state ключей
  // ═══════════════════════════════════════════════════════════════════
  // Контекст: до фикса scoped() (heys_storage_layer_v1.js:212) Store.set
  // слепо скоупил UI-state ключи (heys_theme, heys_widget_layout_v1 и т.д.)
  // под currentClientId, плодя heys_<UUID>_<key> копии в LS на каждом
  // курaторском свитче. После фикса записи идут в unscoped слот; старые
  // scoped копии остаются мёртвым весом. Чистим один раз.
  //
  // Marker key heys_cleanup_scoped_uikeys_v1: '1' означает «уже почистили».
  // ═══════════════════════════════════════════════════════════════════
  const CLEANUP_MARKER = 'heys_cleanup_scoped_uikeys_v1';
  const UI_KEY_TAILS = [
    'heys_clients', 'heys_client_current', 'heys_curator_session',
    'heys_debug_events', 'heys_iw_config_cache_v1', 'heys_iw_config_cache_meta_v1',
    'heys_docs_cache_version', 'heys_update_in_progress', 'heys_boot_perf_baseline_v1',
    'heys_last_client_id', 'heys_theme', 'heys_theme_pref', 'heys_theme_explicit',
    'heys_whats_new_last_seen', 'heys_whats_new_last_acknowledged', 'heys_push_onboarded',
    'heys_widget_layout_v1', 'heys_widget_layout_meta_v1', 'heys_shared_harm_backfill_v1',
  ];
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(CLEANUP_MARKER) !== '1') {
      const SCOPED_RE = /^heys_[a-f0-9-]{36}_(heys_.+)$/i;
      const tailSet = new Set(UI_KEY_TAILS);
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const m = SCOPED_RE.exec(key);
        if (m && tailSet.has(m[1])) toRemove.push(key);
      }
      for (const k of toRemove) {
        try { localStorage.removeItem(k); } catch (_) { /* noop */ }
      }
      try { localStorage.setItem(CLEANUP_MARKER, '1'); } catch (_) { /* noop */ }
      if (toRemove.length > 0) {
        console.info('[HEYS.storage] 🧹 cleaned ' + toRemove.length + ' stale scoped UI-key copies from LS');
      }
    }
  } catch (_) { /* noop — never block module init */ }

})(window);
