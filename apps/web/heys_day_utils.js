// heys_day_utils.js — Day utilities: date/time, storage, calculations

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    // Создаём namespace для утилит дня
    HEYS.dayUtils = {};

    // === Deleted Products Ignore List v2.0 ===
    // 🆕 v4.8.0: Персистентный список удалённых продуктов с TTL и метаданными
    const DELETED_PRODUCTS_KEY = 'heys_deleted_products_ignore_list';
    const DELETED_PRODUCTS_VERSION = 2;
    const DELETED_PRODUCTS_TTL_DAYS = 90;

    function loadDeletedProductsList() {
        try {
            const stored = localStorage.getItem(DELETED_PRODUCTS_KEY);
            if (!stored) return { entries: {}, version: DELETED_PRODUCTS_VERSION };

            const parsed = JSON.parse(stored);

            // Миграция v1 → v2
            if (Array.isArray(parsed)) {
                const now = Date.now();
                const migrated = { entries: {}, version: DELETED_PRODUCTS_VERSION };
                parsed.forEach(key => {
                    if (key) {
                        migrated.entries[String(key).toLowerCase()] = { name: key, deletedAt: now, _migratedFromV1: true };
                    }
                });
                saveDeletedProductsData(migrated);
                return migrated;
            }

            if (parsed.version === DELETED_PRODUCTS_VERSION && parsed.entries) {
                return parsed;
            }

            return { entries: {}, version: DELETED_PRODUCTS_VERSION };
        } catch (e) {
            console.warn('[HEYS] Ошибка загрузки deleted products list:', e);
            return { entries: {}, version: DELETED_PRODUCTS_VERSION };
        }
    }

    function saveDeletedProductsData(data) {
        try {
            localStorage.setItem(DELETED_PRODUCTS_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('[HEYS] Ошибка сохранения deleted products list:', e);
        }
    }

    let deletedProductsData = loadDeletedProductsList();

    function normalizeDeletedKey(name) {
        return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function cleanupExpiredEntries() {
        const now = Date.now();
        const ttlMs = DELETED_PRODUCTS_TTL_DAYS * 24 * 60 * 60 * 1000;
        let removed = 0;

        for (const [key, entry] of Object.entries(deletedProductsData.entries)) {
            if (entry.deletedAt && (now - entry.deletedAt) > ttlMs) {
                delete deletedProductsData.entries[key];
                removed++;
            }
        }

        if (removed > 0) {
            saveDeletedProductsData(deletedProductsData);
            console.log(`[HEYS] 🧹 Очищено ${removed} устаревших записей из игнор-листа`);
        }
        return removed;
    }

    cleanupExpiredEntries();

    // 🆕 v4.8.0: API для управления игнор-листом удалённых продуктов (v2)
    HEYS.deletedProducts = {
        // 🪦 F10 (plan 2026-05-24): перечитать blocklist из LS — используется multi-tab
        // storage event handler, чтобы синхронизировать удаление сделанное в другом табе.
        _reloadFromStorage() {
            try {
                deletedProductsData = loadDeletedProductsList();
            } catch (e) {
                console.warn('[HEYS] deletedProducts._reloadFromStorage failed:', e?.message || e);
            }
        },
        add(name, id, fingerprint, reason) {
            if (!name) return;
            const key = normalizeDeletedKey(name);
            const now = Date.now();

            deletedProductsData.entries[key] = { name, id: id || null, fingerprint: fingerprint || null, deletedAt: now, ...(reason ? { reason } : {}) };
            if (id) deletedProductsData.entries[String(id)] = { name, id, fingerprint: fingerprint || null, deletedAt: now, _isIdKey: true, ...(reason ? { reason } : {}) };
            if (fingerprint) deletedProductsData.entries[String(fingerprint)] = { name, id: id || null, fingerprint, deletedAt: now, _isFingerprintKey: true, ...(reason ? { reason } : {}) };

            saveDeletedProductsData(deletedProductsData);
            console.log(`[HEYS] 🚫 Продукт добавлен в игнор-лист: "${name}"${reason ? ` reason=${reason}` : ''}`);
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', { detail: { action: 'add', name, id, fingerprint, reason } }));
            }
        },
        isDeleted(nameOrId) {
            if (!nameOrId) return false;
            const key = normalizeDeletedKey(nameOrId);
            return !!deletedProductsData.entries[key] || !!deletedProductsData.entries[String(nameOrId)];
        },
        isProductDeleted(product) {
            if (!product) return false;
            if (product.name && this.isDeleted(product.name)) return true;
            if (product.id && this.isDeleted(product.id)) return true;
            if (product.product_id && this.isDeleted(product.product_id)) return true;
            if (product.fingerprint && this.isDeleted(product.fingerprint)) return true;
            return false;
        },
        remove(name, id, fingerprint) {
            if (!name) return;
            const key = normalizeDeletedKey(name);
            delete deletedProductsData.entries[key];
            if (id) delete deletedProductsData.entries[String(id)];
            if (fingerprint) delete deletedProductsData.entries[String(fingerprint)];
            saveDeletedProductsData(deletedProductsData);
            console.info(`[HEYS] ✅ Продукт восстановлен из игнор-листа: "${name}"`);
            // 🪦 FIX v5.0.2: Также очищаем Store tombstone (heys_deleted_ids) при явном восстановлении.
            try {
                const _storeTombstones = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
                if (Array.isArray(_storeTombstones) && _storeTombstones.length > 0) {
                    const normName = (n) => String(n || '').toLowerCase().trim();
                    const nameNorm = normName(name);
                    const before = _storeTombstones.length;
                    const cleaned = _storeTombstones.filter(t => {
                        if (id && t.id === id) return false;
                        if (nameNorm && normName(t.name) === nameNorm) return false;
                        return true;
                    });
                    if (cleaned.length < before) {
                        window.HEYS.store.set('heys_deleted_ids', cleaned);
                        console.info(`[HEYS] 🪦 Store tombstone очищен при восстановлении: "${name}" (${before}→${cleaned.length})`);
                    }
                }
            } catch (e) {
                console.warn('[HEYS] ⚠️ Ошибка очистки Store tombstone:', e?.message);
            }
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', { detail: { action: 'remove', name, id, fingerprint } }));
            }
        },
        getAll() {
            const unique = new Map();
            for (const [key, entry] of Object.entries(deletedProductsData.entries)) {
                if (entry._isIdKey || entry._isFingerprintKey) continue;
                unique.set(normalizeDeletedKey(entry.name), entry);
            }
            return Array.from(unique.values());
        },
        getEntry(nameOrId) {
            if (!nameOrId) return null;
            const key = normalizeDeletedKey(nameOrId);
            return deletedProductsData.entries[key] || deletedProductsData.entries[String(nameOrId)] || null;
        },
        count() { return this.getAll().length; },
        clear() {
            const count = this.count();
            deletedProductsData = { entries: {}, version: DELETED_PRODUCTS_VERSION };
            saveDeletedProductsData(deletedProductsData);
            console.info(`[HEYS] Игнор-лист удалённых продуктов очищен (было ${count})`);
            // 🪦 FIX v5.0.2: При полной очистке тоже сбрасываем Store tombstones
            try {
                if (window.HEYS?.store?.set) {
                    window.HEYS.store.set('heys_deleted_ids', []);
                    console.info('[HEYS] 🪦 Store tombstones (heys_deleted_ids) полностью очищены');
                }
            } catch (e) {
                console.warn('[HEYS] ⚠️ Ошибка очистки heys_deleted_ids:', e?.message);
            }
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', { detail: { action: 'clear', count } }));
            }
        },
        cleanup() { return cleanupExpiredEntries(); },
        log() {
            const all = this.getAll();
            if (all.length === 0) {
                console.log('✅ Игнор-лист удалённых продуктов пуст');
                return;
            }
            console.log(`🚫 Игнор-лист удалённых продуктов (${all.length}):`);
            const now = Date.now();
            all.forEach((entry, i) => {
                const daysAgo = Math.floor((now - entry.deletedAt) / (24 * 60 * 60 * 1000));
                console.log(`  ${i + 1}. "${entry.name}" — удалён ${daysAgo}д назад`);
            });
        },
        exportForSync() {
            return { entries: deletedProductsData.entries, version: DELETED_PRODUCTS_VERSION, exportedAt: Date.now() };
        },
        importFromSync(cloudData) {
            if (!cloudData || !cloudData.entries) return 0;
            let imported = 0;
            for (const [key, entry] of Object.entries(cloudData.entries)) {
                const local = deletedProductsData.entries[key];
                if (!local || (entry.deletedAt > (local.deletedAt || 0))) {
                    deletedProductsData.entries[key] = entry;
                    imported++;
                }
            }
            if (imported > 0) {
                saveDeletedProductsData(deletedProductsData);
                console.log(`[HEYS] ☁️ Импортировано ${imported} записей игнор-листа из облака`);
            }
            return imported;
        },
        TTL_DAYS: DELETED_PRODUCTS_TTL_DAYS,
        VERSION: DELETED_PRODUCTS_VERSION
    };

    // === Orphan Products Tracking ===
    // Карта сирот и HEYS.orphanProducts задаются в heys_day_utils.js (загружается следом в boot-calc).
    // Здесь только хелперы для getDayData в этом файле — пишем в тот же singleton через .track / .remove.
    const orphanLoggedRecently = new Map(); // name => timestamp (throttle логов)
    const normalizeProductName = HEYS.models?.normalizeProductName
      || ((name) => String(name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
    const shouldLogOrphanDebug = () => {
      try {
        return !!(
          HEYS?.debug?.orphans === true ||
          global?.localStorage?.getItem('heys_debug_orphans') === 'true'
        );
      } catch (_) {
        return false;
      }
    };

    // PERF (2026-05-27 v2): O(N×M) → O(1) lookup через Map index с WeakMap multi-list cache.
    // ИСТОРИЯ: v1 кэшировал только один последний productsList (identity ===). Chrome Perf
    // trace после v1 deploy показал что resolveProductByItem self time ВЫРОС 603→1048ms —
    // оказалось call sites чередуют 3 разных list (freshProducts, sharedEarly, sharedProducts)
    // и cache тhrash'ился на каждом switch, rebuild Map'ов был хуже оригинала.
    // v2: WeakMap<list, index> хранит indexes для ВСЕХ lists одновременно, GC автоматически
    // чистит когда list релизится. Length stored в cache entry для detection in-place mutations.
    const _productsIndexCache = new WeakMap();
    function _getProductsIndex(productsList) {
      const cached = _productsIndexCache.get(productsList);
      if (cached && cached.length === productsList.length) {
        return cached;
      }
      const byId = new Map();
      const byFingerprint = new Map();
      const byNormName = new Map();
      const byLowerName = new Map();
      for (let i = 0; i < productsList.length; i++) {
        const p = productsList[i];
        if (!p || typeof p !== 'object') continue;
        const id = p.id ?? p.product_id;
        if (id != null) byId.set(String(id), p);
        if (p.fingerprint) byFingerprint.set(p.fingerprint, p);
        const name = String(p.name || '').trim();
        if (name) {
          const lower = name.toLowerCase();
          if (!byLowerName.has(lower)) byLowerName.set(lower, p); // first wins при дубликатах
          const norm = normalizeProductName(name);
          if (!byNormName.has(norm)) byNormName.set(norm, p);
        }
      }
      const index = { byId, byFingerprint, byNormName, byLowerName, length: productsList.length, builtAt: Date.now() };
      _productsIndexCache.set(productsList, index);
      return index;
    }

    function resolveProductByItem(item, productsList) {
      if (!item) return null;
      const list = Array.isArray(productsList) ? productsList : [];
      if (!list.length) return null;

      const idx = _getProductsIndex(list);

      // Priority order совпадает с оригинальной функцией: id → fingerprint → name (lower → norm)
      const productId = item.product_id ?? item.productId;
      if (productId != null) {
        const p = idx.byId.get(String(productId));
        if (p) return p;
      }

      const itemFingerprint = item.fingerprint || null;
      if (itemFingerprint) {
        const p = idx.byFingerprint.get(itemFingerprint);
        if (p) return p;
      }

      const itemName = String(item.name || '').trim();
      if (itemName) {
        const lower = itemName.toLowerCase();
        let p = idx.byLowerName.get(lower);
        if (p) return p;
        const norm = normalizeProductName(itemName);
        p = idx.byNormName.get(norm);
        if (p) return p;
      }

      return null;
    }

    // Diagnostics для проверки эффекта в HEYS.perf.productsIndexStats()
    if (typeof window !== 'undefined') {
      window.HEYS = window.HEYS || {};
      window.HEYS.perf = window.HEYS.perf || {};
      window.HEYS.perf.productsIndexStats = function () {
        // WeakMap не имеет .size / iterate API — stats нельзя enumerate.
        // Diagnostic шлёт "isWeakMap: true" чтобы пользователь знал что v2 deployed.
        const stats = { type: 'WeakMap (v2)', note: 'размер не enumerable; вместо этого проверь Chrome Perf trace resolveProductByItem self time' };
        console.info('[HEYS.perf] productsIndex', stats);
        return stats;
      };
    }

    function isSyntheticEstimatedItem(item) {
      if (!item || typeof item !== 'object') return false;
      const productId = String(item.product_id ?? item.productId ?? '');
      const itemId = String(item.id ?? '');
      const estimatedSource = String(item.estimatedSource ?? '');
      return !!(
        item.isEstimated ||
        item.virtualProduct ||
        item.skipProductRestore ||
        item.skipOrphanTracking ||
        estimatedSource === 'morning-checkin' ||
        productId.startsWith('estimated_') ||
        productId.startsWith('estimated_quickfill_') ||
        itemId.startsWith('estimated_')
      );
    }

    function trackOrphanProduct(item, dateStr) {
      try {
        if (typeof global.HEYS?.orphanProducts?.track === 'function') {
          global.HEYS.orphanProducts.track(item, dateStr);
        }
      } catch (_e) { /* noop */ }
    }

    function orphanProductsRemoveKeys(itemName, itemNameNorm, itemNameLower) {
      const op = global.HEYS?.orphanProducts;
      if (!op || typeof op.remove !== 'function') return;
      const n = String(itemName || '').trim();
      if (n) op.remove(n);
      if (itemNameNorm) op.remove(String(itemNameNorm));
      if (itemNameLower) op.remove(String(itemNameLower));
    }


    // === Haptic Feedback ===
    // Track if user has interacted (required for vibrate API)
    let userHasInteracted = false;
    if (typeof window !== 'undefined') {
        const markInteracted = () => { userHasInteracted = true; };
        window.addEventListener('click', markInteracted, { once: true, passive: true });
        window.addEventListener('touchstart', markInteracted, { once: true, passive: true });
        window.addEventListener('keydown', markInteracted, { once: true, passive: true });
    }

    function hapticFn(type = 'light') {
        if (!navigator.vibrate || !userHasInteracted) return;
        try {
            switch (type) {
                case 'light': navigator.vibrate(10); break;
                case 'medium': navigator.vibrate(20); break;
                case 'heavy': navigator.vibrate(30); break;
                case 'success': navigator.vibrate([10, 50, 20]); break;
                case 'warning': navigator.vibrate([30, 30, 30]); break;
                case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
                case 'tick': navigator.vibrate(5); break;
                default: navigator.vibrate(10);
            }
        } catch (e) { /* ignore vibrate errors */ }
    }

    // Двойной API: функция + объект с методами для удобства
    // HEYS.haptic('medium') ИЛИ HEYS.haptic.medium()
    const hapticObj = Object.assign(
        (type) => hapticFn(type),
        {
            light: () => hapticFn('light'),
            medium: () => hapticFn('medium'),
            heavy: () => hapticFn('heavy'),
            success: () => hapticFn('success'),
            warning: () => hapticFn('warning'),
            error: () => hapticFn('error'),
            tick: () => hapticFn('tick')
        }
    );

    HEYS.haptic = hapticObj;

    // === Date/Time Utilities ===
    function pad2(n) { return String(n).padStart(2, '0'); }

    // Ночной порог: до 03:00 считается "вчера" (день ещё не закончился)
    const NIGHT_HOUR_THRESHOLD = 3; // 00:00 - 02:59 → ещё предыдущий день

    // "Эффективная" сегодняшняя дата — до 3:00 возвращает вчера
    function todayISO() {
        const d = new Date();
        const hour = d.getHours();
        // До 3:00 — это ещё "вчера" (день не закончился)
        if (hour < NIGHT_HOUR_THRESHOLD) {
            d.setDate(d.getDate() - 1);
        }
        return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }

    function fmtDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
    function parseISO(s) { const [y, m, d] = String(s || '').split('-').map(x => parseInt(x, 10)); if (!y || !m || !d) return new Date(); const dt = new Date(y, m - 1, d); dt.setHours(12); return dt; }
    function uid(p) { return (p || 'id') + Math.random().toString(36).slice(2, 8); }

    // Проверка: время относится к "ночным" часам (00:00-02:59)
    function isNightTime(timeStr) {
        if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return false;
        const [hh] = timeStr.split(':').map(x => parseInt(x, 10));
        if (isNaN(hh)) return false;
        return hh >= 0 && hh < NIGHT_HOUR_THRESHOLD;
    }

    // Возвращает "эффективную" дату для приёма пищи
    // Если время 00:00-02:59, возвращает предыдущий день
    function getEffectiveDate(timeStr, calendarDateISO) {
        if (!calendarDateISO) return calendarDateISO;
        if (!isNightTime(timeStr)) return calendarDateISO;
        // Вычитаем 1 день
        const d = parseISO(calendarDateISO);
        d.setDate(d.getDate() - 1);
        return fmtDate(d);
    }

    // Возвращает "следующий" календарный день
    function getNextDay(dateISO) {
        const d = parseISO(dateISO);
        d.setDate(d.getDate() + 1);
        return fmtDate(d);
    }

    // === Storage Utilities ===
    // ВАЖНО: Store-first (HEYS.store), затем HEYS.utils, затем localStorage
    function lsGet(k, d) {
        try {
            // Приоритет: HEYS.store → HEYS.utils → localStorage fallback
            if (HEYS.store && typeof HEYS.store.get === 'function') {
                return HEYS.store.get(k, d);
            }
            if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
                return HEYS.utils.lsGet(k, d);
            }
            const v = JSON.parse(localStorage.getItem(k));
            return v == null ? d : v;
        } catch (e) { return d; }
    }

    function lsSet(k, v) {
        try {
            // Приоритет: HEYS.store → HEYS.utils → localStorage fallback
            if (HEYS.store && typeof HEYS.store.set === 'function') {
                return HEYS.store.set(k, v);
            }
            if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
                return HEYS.utils.lsSet(k, v);
            }
            localStorage.setItem(k, JSON.stringify(v));
        } catch (e) { }
    }

    // === Math Utilities ===
    function clamp(n, a, b) { n = +n || 0; if (n < a) return a; if (n > b) return b; return n; }
    const r1 = v => Math.round((+v || 0) * 10) / 10; // округление до 1 десятой (для веса)
    const r0 = v => Math.round(+v || 0); // округление до целого (для калорий)
    const scale = (v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10;

    // === Model Helpers (delegates to HEYS.models) ===
    function ensureDay(d, prof) {
        const M = HEYS.models || {};
        return (M.ensureDay ? M.ensureDay(d, prof) : (d || {}));
    }

    function buildProductIndex(ps) {
        const M = HEYS.models || {};
        return M.buildProductIndex ? M.buildProductIndex(ps) : { byId: new Map(), byName: new Map(), byFingerprint: new Map() }; // 🆕 v4.6.0
    }

    function getProductFromItem(it, idx) {
        const M = HEYS.models || {};
        return M.getProductFromItem ? M.getProductFromItem(it, idx) : null;
    }

    function per100(p) {
        const M = HEYS.models || {};
        if (!p) return { kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0 };
        if (M.computeDerivedProduct) {
            const d = M.computeDerivedProduct(p);
            return { kcal100: d.kcal100, carbs100: d.carbs100, prot100: +p.protein100 || 0, fat100: d.fat100, simple100: +p.simple100 || 0, complex100: +p.complex100 || 0, bad100: +p.badFat100 || 0, good100: +p.goodFat100 || 0, trans100: +p.trans100 || 0, fiber100: +p.fiber100 || 0 };
        }
        const s = +p.simple100 || 0, c = +p.complex100 || 0, pr = +p.protein100 || 0, b = +p.badFat100 || 0, g = +p.goodFat100 || 0, t = +p.trans100 || 0, fib = +p.fiber100 || 0;
        const carbs = +p.carbs100 || (s + c);
        const fat = +p.fat100 || (b + g + t);
        const kcal = +p.kcal100 || (4 * (pr + carbs) + 8 * fat);
        return { kcal100: kcal, carbs100: carbs, prot100: pr, fat100: fat, simple100: s, complex100: c, bad100: b, good100: g, trans100: t, fiber100: fib };
    }

    // === Data Loading ===

    // Базовая загрузка приёмов из storage (store-first) (без ночной логики)
    function loadMealsRaw(ds) {
        // v69 FIX: Try scoped key first to prevent cross-client contamination
        const cid = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
        const scopedDayKey = cid ? 'heys_' + cid + '_dayv2_' + ds : null;
        const keys = scopedDayKey
            ? [scopedDayKey, 'heys_dayv2_' + ds, 'heys_day_' + ds, 'day_' + ds + '_meals', 'meals_' + ds, 'food_' + ds]
            : ['heys_dayv2_' + ds, 'heys_day_' + ds, 'day_' + ds + '_meals', 'meals_' + ds, 'food_' + ds];
        const debugEnabled = !!(global.HEYS?.DEBUG_MODE || global.HEYS?.debug?.dayLoad);
        const debugLog = debugEnabled ? (...args) => console.log(...args) : null;
        const summarizeObjectArrays = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            const keys = Object.keys(obj);
            const arrays = keys
                .filter((key) => Array.isArray(obj[key]))
                .map((key) => ({ key, count: obj[key].length }))
                .filter((entry) => entry.count > 0);
            return { keys, arrays };
        };
        for (const k of keys) {
            try {
                const fromStore = (global.HEYS?.store?.get ? global.HEYS.store.get(k, null) : null);
                const raw = fromStore ?? (global.localStorage ? global.localStorage.getItem(k) : null);
                if (!raw) continue;
                if (debugLog) {
                    debugLog('[MEALS LOAD] candidate', {
                        date: ds,
                        key: k,
                        source: fromStore != null ? 'store' : 'localStorage',
                        rawType: typeof raw
                    });
                }
                if (typeof raw === 'object') {
                    if (raw && Array.isArray(raw.meals) && raw.meals.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit object.meals', { key: k, count: raw.meals.length });
                        return raw.meals;
                    }
                    if (Array.isArray(raw) && raw.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit array', { key: k, count: raw.length });
                        return raw;
                    }
                    if (debugLog) {
                        const summary = summarizeObjectArrays(raw);
                        const compact = summary
                            ? {
                                keys: summary.keys.slice(0, 30),
                                arrays: summary.arrays.slice(0, 30)
                            }
                            : null;
                        debugLog('[MEALS LOAD] object without meals', {
                            key: k,
                            summary: compact,
                            summaryStr: compact ? JSON.stringify(compact) : null
                        });
                    }
                }
                if (typeof raw === 'string') {
                    let parsed = null;
                    if (raw.startsWith('¤Z¤') && global.HEYS?.store?.decompress) {
                        parsed = global.HEYS.store.decompress(raw);
                    } else {
                        parsed = JSON.parse(raw);
                    }
                    if (parsed && Array.isArray(parsed.meals) && parsed.meals.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit parsed.meals', { key: k, count: parsed.meals.length });
                        return parsed.meals;
                    }
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        if (debugLog) debugLog('[MEALS LOAD] hit parsed array', { key: k, count: parsed.length });
                        return parsed;
                    }
                    if (debugLog) {
                        const summary = summarizeObjectArrays(parsed);
                        const compact = summary
                            ? {
                                keys: summary.keys.slice(0, 30),
                                arrays: summary.arrays.slice(0, 30)
                            }
                            : null;
                        debugLog('[MEALS LOAD] parsed without meals', {
                            key: k,
                            summary: compact,
                            summaryStr: compact ? JSON.stringify(compact) : null
                        });
                    }
                }
            } catch (e) { }
        }
        // 🔁 Fallback: искать данные по всем ключам localStorage для этой даты
        // (на случай, если данные лежат под другим clientId)
        try {
            const patterns = [
                `_dayv2_${ds}`,
                `_day_${ds}`,
                `day_${ds}_meals`,
                `meals_${ds}`,
                `food_${ds}`
            ];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !patterns.some((p) => key.includes(p))) continue;
                const raw = localStorage.getItem(key);
                if (!raw) continue;
                let parsed = null;
                if (typeof raw === 'string') {
                    if (raw.startsWith('¤Z¤') && global.HEYS?.store?.decompress) {
                        parsed = global.HEYS.store.decompress(raw);
                    } else {
                        parsed = JSON.parse(raw);
                    }
                } else if (typeof raw === 'object') {
                    parsed = raw;
                }
                if (parsed && Array.isArray(parsed.meals) && parsed.meals.length > 0) {
                    if (debugLog) debugLog('[MEALS LOAD] cross-key hit meals', { key, count: parsed.meals.length });
                    return parsed.meals;
                }
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (debugLog) debugLog('[MEALS LOAD] cross-key hit array', { key, count: parsed.length });
                    return parsed;
                }
            }
        } catch (e) { }
        if (debugLog) debugLog('[MEALS LOAD] miss', { date: ds, triedKeys: keys });
        return [];
    }

    // Загрузка приёмов для даты с учётом ночной логики:
    // - Берём приёмы текущего дня (кроме ночных 00:00-02:59)
    // - Добавляем ночные приёмы из следующего календарного дня (они принадлежат этому дню)
    function loadMealsForDate(ds) {
        // 1. Загружаем приёмы текущего календарного дня (фильтруем ночные — они ушли в предыдущий день)
        const currentDayMeals = (loadMealsRaw(ds) || []).filter(m => !isNightTime(m.time));

        // 2. Загружаем ночные приёмы из следующего календарного дня
        const nextDayISO = getNextDay(ds);
        const nextDayMeals = (loadMealsRaw(nextDayISO) || []).filter(m => isNightTime(m.time));

        // 3. Объединяем и сортируем по времени
        const allMeals = [...currentDayMeals, ...nextDayMeals];

        // Сортировка: ночные (00:00-02:59) в конец, остальные по времени
        allMeals.sort((a, b) => {
            const aIsNight = isNightTime(a.time);
            const bIsNight = isNightTime(b.time);
            if (aIsNight && !bIsNight) return 1; // ночные в конец
            if (!aIsNight && bIsNight) return -1;
            // Одинаковый тип — сортируем по времени
            return (a.time || '').localeCompare(b.time || '');
        });

        return allMeals;
    }

    // Lightweight signature for products (ids/names + kcal для инвалидации при синхронизации)
    // FIX: добавлен kcal100 чтобы пересобрать индекс когда продукт обновился с нулей на реальные данные
    function productsSignature(ps) {
        // Ensure ps is an array
        if (!ps) return '';
        if (!Array.isArray(ps)) {
            console.warn('[HEYS] productsSignature: expected array, got', typeof ps);
            return '';
        }
        // Включаем id/name + kcal100 для детектирования обновлений содержимого
        return ps.map(p => {
            if (!p) return '';
            const id = p.id || p.product_id || p.name || '';
            const kcal = p.kcal100 ?? p.kcal ?? 0;
            return `${id}:${kcal}`;
        }).join('|');
    }

    // Cached popular products (per month + signature + TTL)
    const POPULAR_CACHE = {}; // key => {ts, list}

    function computePopularProducts(ps, iso) {
        const sig = productsSignature(ps);
        const monthKey = (iso || todayISO()).slice(0, 7); // YYYY-MM
        // Добавляем favorites в ключ кэша чтобы обновлять при изменении избранных
        const favorites = (window.HEYS && window.HEYS.store && window.HEYS.store.getFavorites)
            ? window.HEYS.store.getFavorites()
            : new Set();
        const favSig = Array.from(favorites).sort().join(',');
        const key = monthKey + '::' + sig + '::' + favSig;
        const now = Date.now();
        const ttl = 1000 * 60 * 10; // 10 минут
        const cached = POPULAR_CACHE[key];
        if (cached && (now - cached.ts) < ttl) return cached.list;
        const idx = buildProductIndex(ps), base = iso ? new Date(iso) : new Date(), cnt = new Map();
        for (let i = 0; i < 30; i++) {
            const d = new Date(base); d.setDate(d.getDate() - i);
            (loadMealsForDate(fmtDate(d)) || []).forEach(m => {
                ((m && m.items) || []).forEach(it => {
                    const p = getProductFromItem(it, idx);
                    if (!p) return;
                    const k = String(p.id ?? p.product_id ?? p.name);
                    cnt.set(k, (cnt.get(k) || 0) + 1);
                });
            });
        }
        const arr = [];
        cnt.forEach((c, k) => {
            let p = idx.byId.get(String(k)) || idx.byName.get(String(k).trim().toLowerCase());
            if (p) arr.push({ p, c });
        });
        // Сортировка: избранные первые, затем по частоте
        arr.sort((a, b) => {
            const aFav = favorites.has(String(a.p.id ?? a.p.product_id ?? a.p.name));
            const bFav = favorites.has(String(b.p.id ?? b.p.product_id ?? b.p.name));
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return b.c - a.c;
        });
        const list = arr.slice(0, 20).map(x => x.p);
        POPULAR_CACHE[key] = { ts: now, list };
        return list;
    }

    // === Profile & Calculations ===
    function getProfile() {
        const p = lsGet('heys_profile', {}) || {};
        const g = (p.gender || p.sex || 'Мужской');
        const sex = (String(g).toLowerCase().startsWith('ж') ? 'female' : 'male');
        return {
            sex,
            height: +p.height || 175,
            age: +p.age || 30,
            sleepHours: +p.sleepHours || 8,
            weight: +p.weight || 70,
            deficitPctTarget: +p.deficitPctTarget || 0,
            stepsGoal: +p.stepsGoal || 7000,
            weightGoal: +p.weightGoal || 0,  // Целевой вес для прогноза
            cycleTrackingEnabled: !!p.cycleTrackingEnabled
        };
    }

    // 🔬 TDEE v1.1.0: Делегируем в единый модуль HEYS.TDEE с fallback для legacy
    function calcBMR(w, prof) {
        // Fallback: Mifflin-St Jeor (всегда должен быть доступен)
        const fallback = () => {
            const h = +prof.height || 175, a = +prof.age || 30, sex = (prof.sex || 'male');
            return Math.round(10 * (+w || 0) + 6.25 * h - 5 * a + (sex === 'female' ? -161 : 5));
        };

        // Делегируем в единый модуль, но НИКОГДА не даём ошибке “убить” UI.
        // В противном случае getActiveDaysForMonth вернёт пустой Map из-за try/catch.
        try {
            if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.calcBMR) {
                const v = HEYS.TDEE.calcBMR({ ...prof, weight: w });
                const num = +v;
                if (Number.isFinite(num) && num > 0) return Math.round(num);
            }
        } catch (e) {
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, { where: 'day_utils.calcBMR', hasTDEE: !!HEYS.TDEE });
                }
            } catch (_) { }
        }

        return fallback();
    }

    // 🔬 TDEE v1.1.0: Делегируем в единый модуль с fallback
    function kcalPerMin(met, w) {
        try {
            if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.kcalPerMin) {
                const v = HEYS.TDEE.kcalPerMin(met, w);
                const num = +v;
                if (Number.isFinite(num)) return num;
            }
        } catch (e) {
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, { where: 'day_utils.kcalPerMin', hasTDEE: !!HEYS.TDEE });
                }
            } catch (_) { }
        }
        return Math.round((((+met || 0) * (+w || 0) * 0.0175) - 1) * 10) / 10;
    }

    function stepsKcal(steps, w, sex, len) {
        try {
            if (typeof HEYS !== 'undefined' && HEYS.TDEE && HEYS.TDEE.stepsKcal) {
                const v = HEYS.TDEE.stepsKcal(steps, w, sex, len);
                const num = +v;
                if (Number.isFinite(num)) return num;
            }
        } catch (e) {
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, { where: 'day_utils.stepsKcal', hasTDEE: !!HEYS.TDEE });
                }
            } catch (_) { }
        }
        const coef = (sex === 'female' ? 0.5 : 0.57);
        const km = (+steps || 0) * (len || 0.7) / 1000;
        return Math.round(coef * (+w || 0) * km * 10) / 10;
    }

    // === Time/Sleep Utilities ===
    function parseTime(t) {
        if (!t || typeof t !== 'string' || !t.includes(':')) return null;
        const [hh, mm] = t.split(':').map(x => parseInt(x, 10));
        if (isNaN(hh) || isNaN(mm)) return null;
        // НЕ обрезаем часы до 23 — ночные часы могут быть 24-26
        return { hh: Math.max(0, hh), mm: clamp(mm, 0, 59) };
    }

    function sleepHours(a, b) {
        const s = parseTime(a), e = parseTime(b);
        if (!s || !e) return 0;
        let sh = s.hh + s.mm / 60, eh = e.hh + e.mm / 60;
        let d = eh - sh;
        if (d < 0) d += 24;
        return r1(d);
    }

    // === Meal Type Classification ===
    // Типы приёмов пищи с иконками и названиями
    const MEAL_TYPES = {
        breakfast: { name: 'Завтрак', icon: '🍳', order: 1 },
        snack1: { name: 'Перекус', icon: '🍎', order: 2 },
        lunch: { name: 'Обед', icon: '🍲', order: 3 },
        snack2: { name: 'Перекус', icon: '🥜', order: 4 },
        dinner: { name: 'Ужин', icon: '🍽️', order: 5 },
        snack3: { name: 'Перекус', icon: '🧀', order: 6 },
        night: { name: 'Ночной приём', icon: '🌙', order: 7 }
    };

    // Пороги для определения "основного приёма" vs "перекуса"
    const MAIN_MEAL_THRESHOLDS = {
        minProducts: 3,      // минимум продуктов для основного приёма
        minGrams: 200,       // минимум граммов для основного приёма
        minKcal: 300         // минимум калорий для основного приёма
    };

    /**
     * Вычисляет тотал по приёму (граммы, продукты, калории)
     */
    function getMealStats(meal, pIndex) {
        if (!meal || !meal.items || !meal.items.length) {
            return { totalGrams: 0, productCount: 0, totalKcal: 0 };
        }

        let totalGrams = 0;
        let totalKcal = 0;
        const productCount = meal.items.length;

        meal.items.forEach(item => {
            const g = +item.grams || 0;
            totalGrams += g;

            // Пытаемся получить калории
            const p = pIndex ? getProductFromItem(item, pIndex) : null;
            if (p) {
                const per = per100(p);
                totalKcal += (per.kcal100 || 0) * g / 100;
            }
        });

        return { totalGrams, productCount, totalKcal: Math.round(totalKcal) };
    }

    /**
     * Проверяет, является ли приём "основным" (завтрак/обед/ужин) по размеру
     */
    function isMainMeal(mealStats) {
        const { totalGrams, productCount, totalKcal } = mealStats;

        // Основной приём если: много продуктов ИЛИ (много граммов И больше 1 продукта)
        if (productCount >= MAIN_MEAL_THRESHOLDS.minProducts) return true;
        if (totalGrams >= MAIN_MEAL_THRESHOLDS.minGrams && productCount >= 2) return true;
        if (totalKcal >= MAIN_MEAL_THRESHOLDS.minKcal) return true;

        return false;
    }

    /**
     * Преобразует время в минуты от полуночи (с учётом ночных часов)
     * Ночные часы (00:00-02:59) считаются как 24:00-26:59
     */
    function timeToMinutes(timeStr) {
        const parsed = parseTime(timeStr);
        if (!parsed) return null;

        let { hh, mm } = parsed;
        // Ночные часы (00-02) — это "после полуночи" предыдущего дня
        if (hh < NIGHT_HOUR_THRESHOLD) {
            hh += 24;
        }
        return hh * 60 + mm;
    }

    /**
     * Форматирует время приёма для отображения
     * 24:20 → 00:20 (ночные часы хранятся как 24-26)
     */
    function formatMealTime(timeStr) {
        if (!timeStr) return '';
        const parsed = parseTime(timeStr);
        if (!parsed) return timeStr;

        let { hh, mm } = parsed;
        // Нормализуем ночные часы: 24 → 00, 25 → 01, 26 → 02
        if (hh >= 24) {
            hh = hh - 24;
        }
        return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }

    // === Hours Order для Wheel Picker ===
    // Порядок часов: 03, 04, ..., 23, 00, 01, 02
    // Это позволяет скроллить от вечера к ночи естественно
    const HOURS_ORDER = (() => {
        const order = [];
        for (let h = NIGHT_HOUR_THRESHOLD; h < 24; h++) order.push(h);
        for (let h = 0; h < NIGHT_HOUR_THRESHOLD; h++) order.push(h);
        return order;
    })();

    /**
     * Конвертация: индекс колеса → реальный час
     * @param {number} idx - индекс в HOURS_ORDER
     * @returns {number} реальный час (0-23)
     */
    function wheelIndexToHour(idx) {
        return HOURS_ORDER[idx] ?? idx;
    }

    /**
     * Конвертация: реальный час → индекс колеса
     * Учитывает ночные часы: 24→0, 25→1, 26→2
     * @param {number} hour - реальный час (0-26)
     * @returns {number} индекс в HOURS_ORDER
     */
    function hourToWheelIndex(hour) {
        // Нормализуем ночные часы для поиска в колесе
        const normalizedHour = hour >= 24 ? hour - 24 : hour;
        const idx = HOURS_ORDER.indexOf(normalizedHour);
        return idx >= 0 ? idx : 0;
    }

    /**
     * Определяет тип приёма пищи на основе:
     * - Порядкового номера (первый = завтрак)
     * - Времени (деление дня на слоты)
     * - Размера приёма (основной vs перекус)
     * 
     * @param {number} mealIndex - Индекс приёма в отсортированном списке
     * @param {Object} meal - Объект приёма {id, time, items, ...}
     * @param {Array} allMeals - Все приёмы дня (отсортированы по времени)
     * @param {Object} pIndex - Индекс продуктов для расчёта калорий
     * @returns {Object} { type: string, name: string, icon: string }
     */
    function getMealType(mealIndex, meal, allMeals, pIndex) {
        // Защита от undefined
        if (!allMeals || !Array.isArray(allMeals) || allMeals.length === 0) {
            return { type: 'snack', ...MEAL_TYPES.snack };
        }

        // Первый приём дня всегда Завтрак
        if (mealIndex === 0) {
            return { type: 'breakfast', ...MEAL_TYPES.breakfast };
        }

        // Получаем время первого приёма (завтрака)
        const firstMeal = allMeals[0];
        const breakfastMinutes = timeToMinutes(firstMeal?.time);
        const currentMinutes = timeToMinutes(meal?.time);

        // Если время не указано, определяем по порядку и размеру
        if (breakfastMinutes === null || currentMinutes === null) {
            return fallbackMealType(mealIndex, meal, pIndex);
        }

        // Конец дня = 03:00 следующего дня = 27:00 в нашей системе
        const endOfDayMinutes = 27 * 60; // 03:00 + 24 = 27:00

        // Оставшееся время от завтрака до конца дня
        const remainingMinutes = endOfDayMinutes - breakfastMinutes;

        // Делим на 6 слотов (7 типов минус завтрак = 6)
        const slotDuration = remainingMinutes / 6;

        // Определяем в какой слот попадает текущий приём
        const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
        const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

        // Типы слотов: 0=перекус1, 1=обед, 2=перекус2, 3=ужин, 4=перекус3, 5=ночной
        const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];

        // Получаем статистику приёма
        const mealStats = getMealStats(meal, pIndex);
        const isMain = isMainMeal(mealStats);

        // Определяем базовый тип по слоту
        let baseType = slotTypes[clamp(slotIndex, 0, 5)];

        // Корректируем: если попали в "перекус" слот, но это большой приём — 
        // проверяем соседние "основные" слоты
        if (baseType.startsWith('snack') && isMain) {
            // Ищем ближайший основной слот
            if (slotIndex <= 1) {
                baseType = 'lunch';
            } else if (slotIndex >= 2 && slotIndex <= 3) {
                baseType = 'dinner';
            }
            // Если после ужина большой приём — оставляем как есть (поздний ужин → snack3)
        }

        // Обратная корректировка: если попали в "основной" слот, но это маленький приём — 
        // оставляем как основной (обед может быть лёгким)

        // Проверяем не дублируется ли уже этот тип (избегаем 2 обеда)
        const usedTypes = new Set();
        for (let i = 0; i < mealIndex; i++) {
            const prevType = getMealTypeSimple(i, allMeals[i], allMeals, pIndex);
            usedTypes.add(prevType);
        }

        // Если обед уже был, а мы пытаемся назвать это обедом — делаем перекусом
        if (baseType === 'lunch' && usedTypes.has('lunch')) {
            baseType = 'snack2';
        }
        if (baseType === 'dinner' && usedTypes.has('dinner')) {
            baseType = 'snack3';
        }

        return { type: baseType, ...MEAL_TYPES[baseType] };
    }

    /**
     * Упрощённая версия для проверки дубликатов (без рекурсии)
     */
    function getMealTypeSimple(mealIndex, meal, allMeals, pIndex) {
        if (mealIndex === 0) return 'breakfast';

        const firstMeal = allMeals[0];
        const breakfastMinutes = timeToMinutes(firstMeal?.time);
        const currentMinutes = timeToMinutes(meal?.time);

        if (breakfastMinutes === null || currentMinutes === null) {
            return 'snack1';
        }

        const endOfDayMinutes = 27 * 60;
        const remainingMinutes = endOfDayMinutes - breakfastMinutes;
        const slotDuration = remainingMinutes / 6;
        const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
        const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

        const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
        let baseType = slotTypes[clamp(slotIndex, 0, 5)];

        const mealStats = getMealStats(meal, pIndex);
        const isMain = isMainMeal(mealStats);

        if (baseType.startsWith('snack') && isMain) {
            if (slotIndex <= 1) baseType = 'lunch';
            else if (slotIndex >= 2 && slotIndex <= 3) baseType = 'dinner';
        }

        return baseType;
    }

    /**
     * Fallback определение типа (когда нет времени)
     */
    function fallbackMealType(mealIndex, meal, pIndex) {
        const mealStats = getMealStats(meal, pIndex);
        const isMain = isMainMeal(mealStats);

        // По порядку: 0=завтрак, 1=перекус/обед, 2=перекус/ужин, ...
        const fallbackTypes = [
            'breakfast',
            isMain ? 'lunch' : 'snack1',
            isMain ? 'dinner' : 'snack2',
            'snack3',
            'night'
        ];

        const type = fallbackTypes[clamp(mealIndex, 0, fallbackTypes.length - 1)];
        return { type, ...MEAL_TYPES[type] };
    }

    // Форматирование даты для отображения
    // Использует "эффективную" дату (до 3:00 — ещё вчера)
    function formatDateDisplay(isoDate) {
        const d = parseISO(isoDate);
        const effectiveToday = parseISO(todayISO()); // todayISO учитывает ночной порог
        const effectiveYesterday = new Date(effectiveToday);
        effectiveYesterday.setDate(effectiveYesterday.getDate() - 1);

        const isToday = d.toDateString() === effectiveToday.toDateString();
        const isYesterday = d.toDateString() === effectiveYesterday.toDateString();

        const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });
        const dayNum = d.getDate();
        const month = d.toLocaleDateString('ru-RU', { month: 'short' });

        if (isToday) return { label: 'Сегодня', sub: `${dayNum} ${month}` };
        if (isYesterday) return { label: 'Вчера', sub: `${dayNum} ${month}` };
        return { label: `${dayNum} ${month}`, sub: dayName };
    }

    /**
     * Предпросмотр типа приёма для модалки создания.
     * Определяет тип по времени и существующим приёмам (без данных о продуктах).
     * @param {string} timeStr - время в формате "HH:MM"
     * @param {Array} existingMeals - массив существующих приёмов дня
     * @returns {string} - ключ типа (breakfast, lunch, dinner, snack1, snack2, snack3, night)
     */
    function getMealTypeForPreview(timeStr, existingMeals) {
        const meals = existingMeals || [];

        // Если нет приёмов — это будет первый, значит завтрак
        if (meals.length === 0) {
            return 'breakfast';
        }

        // Находим первый приём (завтрак)
        const sortedMeals = [...meals].sort((a, b) => {
            const aMin = timeToMinutes(a.time) || 0;
            const bMin = timeToMinutes(b.time) || 0;
            return aMin - bMin;
        });

        const breakfastMinutes = timeToMinutes(sortedMeals[0]?.time);
        const currentMinutes = timeToMinutes(timeStr);

        if (breakfastMinutes === null || currentMinutes === null) {
            return 'snack1'; // fallback
        }

        // Если новый приём раньше первого — он станет завтраком
        if (currentMinutes < breakfastMinutes) {
            return 'breakfast';
        }

        // Конец дня = 03:00 следующего дня = 27:00
        const endOfDayMinutes = 27 * 60;
        const remainingMinutes = endOfDayMinutes - breakfastMinutes;
        const slotDuration = remainingMinutes / 6;

        const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
        const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);

        const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
        return slotTypes[clamp(slotIndex, 0, 5)];
    }

    // === Calendar Day Indicators ===

    /**
     * Получает данные дня: калории и активность для расчёта реального target
     * @param {string} dateStr - Дата в формате YYYY-MM-DD
     * @param {Map} productsMap - Map продуктов (id => product)
     * @param {Object} profile - Профиль пользователя
     * @returns {{kcal: number, steps: number, householdMin: number, trainings: Array}} Данные дня
     */
    function getDayData(dateStr, productsMap, profile) {
        try {
            // Пробуем несколько источников clientId (через утилиту для корректного JSON.parse)
            const U = window.HEYS && window.HEYS.utils;
            const storeGet = window.HEYS?.store?.get;
            const clientId = (U && U.getCurrentClientId ? U.getCurrentClientId() : '')
                || (window.HEYS && window.HEYS.currentClientId) || (storeGet ? storeGet('heys_client_current', '') : '')
                || localStorage.getItem('heys_client_current') || '';

            const scopedKey = clientId
                ? 'heys_' + clientId + '_dayv2_' + dateStr
                : 'heys_dayv2_' + dateStr;

            const raw = (global.HEYS?.store?.get ? global.HEYS.store.get(scopedKey, null) : null)
                ?? (global.localStorage ? global.localStorage.getItem(scopedKey) : null);
            if (!raw) return null;

            let dayData = null;
            if (typeof raw === 'object') {
                dayData = raw;
            } else if (typeof raw === 'string') {
                if (raw.startsWith('¤Z¤')) {
                    if (global.HEYS?.store?.decompress) {
                        dayData = global.HEYS.store.decompress(raw);
                    } else {
                        let str = raw.substring(3);
                        const patterns = {
                            '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
                            '¤c¤': '"carbs100"', '¤f¤': '"fat100"'
                        };
                        for (const [code, pattern] of Object.entries(patterns)) {
                            str = str.split(code).join(pattern);
                        }
                        dayData = JSON.parse(str);
                    }
                } else {
                    dayData = JSON.parse(raw);
                }
            }

            if (!dayData) return null;

            // Считаем калории и макросы из meals
            let totalKcal = 0, totalProt = 0, totalFat = 0, totalCarbs = 0;
            (dayData.meals || []).forEach(meal => {
                (meal.items || []).forEach(item => {
                    const grams = +item.grams || 0;
                    if (grams <= 0) return;

                    // Ищем в productsMap по id/нормализованному имени, затем fallback на inline данные item
                    const itemName = String(item.name || '').trim();
                    const itemNameLower = itemName.toLowerCase();
                    const itemNameNorm = normalizeProductName(itemName);
                    let product = null;
                    if (item.product_id != null && global.HEYS?.products?.getById) {
                        product = global.HEYS.products.getById(item.product_id);
                        // 🪦 Stamp-cache fallback (heys_core_v12.js:5050+) возвращает product с
                        // _recoveredFrom='stamp' — это значит что в реальной базе продукта НЕТ,
                        // он живёт только в meal-stamp. Считаем не-resolved → код пойдёт по
                        // orphan-tracking ветке и banner покажет выбор «восстановить» / «разовым».
                        if (product && product._recoveredFrom === 'stamp') {
                            product = null;
                        }
                    }
                    if (!product && itemName) {
                        product = productsMap.get(itemNameLower) || productsMap.get(itemNameNorm) || null;
                    }

                    // 🔄 Fallback: актуальная личная база (resolve по id / fingerprint / имени)
                    if (!product && itemName && global.HEYS?.products?.getAll) {
                        const freshProducts = global.HEYS.products.getAll();
                        const freshProduct = resolveProductByItem(item, freshProducts);
                        if (freshProduct) {
                            product = freshProduct;
                            productsMap.set(itemNameLower, freshProduct);
                            if (itemNameNorm) productsMap.set(itemNameNorm, freshProduct);
                            orphanProductsRemoveKeys(itemName, itemNameNorm, itemNameLower);
                        } else if (freshProducts.length > 0) {
                            const similar = freshProducts.filter(p => {
                                const pName = String(p.name || '').trim().toLowerCase();
                                return pName.includes(itemNameLower.slice(0, 10)) ||
                                  itemNameLower.includes(pName.slice(0, 10));
                            });
                            if (similar.length > 0) {
                                const lastLogged = orphanLoggedRecently.get(itemName) || 0;
                                if (Date.now() - lastLogged > 60000) {
                                    console.warn(`[HEYS] Orphan mismatch: "${itemName}" not found, similar: "${similar[0].name}"`);
                                    orphanLoggedRecently.set(itemName, Date.now());
                                }
                            }
                        }
                    }

                    // 🌐 Общая база: ссылка на shared id / fingerprint без локального клона
                    if (!product && itemName) {
                        const sharedEarly = global.HEYS?.cloud?.getCachedSharedProducts?.() || [];
                        const fromSharedEarly = resolveProductByItem(item, sharedEarly);
                        if (fromSharedEarly) {
                            product = fromSharedEarly;
                            productsMap.set(itemNameLower, fromSharedEarly);
                            if (itemNameNorm) productsMap.set(itemNameNorm, fromSharedEarly);
                            orphanProductsRemoveKeys(itemName, itemNameNorm, itemNameLower);
                        }
                    }

                    const src = product || item; // item может иметь inline kcal100, protein100 и т.д.

                    // Трекаем orphan-продукты (когда используется штамп вместо базы)
                    if (!product && itemName && !isSyntheticEstimatedItem(item)) {
                        let freshProducts = global.HEYS?.products?.getAll?.() || [];

                        if (freshProducts.length === 0) {
                            try {
                                const U = global.HEYS?.utils;
                                const storeGet = global.HEYS?.store?.get;
                                if (storeGet) {
                                    freshProducts = storeGet('heys_products', []) || [];
                                } else if (U && U.lsGet) {
                                    freshProducts = U.lsGet('heys_products', []) || [];
                                } else {
                                    const cid = U?.getCurrentClientId?.()
                                        || (storeGet ? storeGet('heys_client_current', '') : '')
                                        || localStorage.getItem('heys_client_current') || '';
                                    const keys = [
                                        cid ? `heys_${cid}_products` : null,
                                        'heys_products'
                                    ].filter(Boolean);

                                    for (const key of keys) {
                                        const stored = storeGet ? storeGet(key, null) : localStorage.getItem(key);
                                        if (stored) {
                                            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
                                            if (Array.isArray(parsed) && parsed.length > 0) {
                                                freshProducts = parsed;
                                                break;
                                            }
                                        }
                                    }
                                }
                            } catch (e) { /* ignore */ }
                        }

                        const sharedProducts = global.HEYS?.cloud?.getCachedSharedProducts?.() || [];

                        const hasProductsLoaded = productsMap.size > 0 || freshProducts.length > 0 || sharedProducts.length > 0;

                        const foundInFresh = resolveProductByItem(item, freshProducts);
                        const foundInShared = resolveProductByItem(item, sharedProducts);

                        if (hasProductsLoaded && !foundInFresh && !foundInShared) {
                            if (shouldLogOrphanDebug()) {
                                const itemNameNorm = normalizeProductName(itemName);
                                const freshSample = freshProducts
                                    .filter((p) => p && p.name)
                                    .map((p) => String(p.name).trim())
                                    .filter((name) => {
                                        const n = normalizeProductName(name);
                                        return n.includes(itemNameNorm.slice(0, 8)) || itemNameNorm.includes(n.slice(0, 8));
                                    })
                                    .slice(0, 3);
                                const sharedSample = sharedProducts
                                    .filter((p) => p && p.name)
                                    .map((p) => String(p.name).trim())
                                    .filter((name) => {
                                        const n = normalizeProductName(name);
                                        return n.includes(itemNameNorm.slice(0, 8)) || itemNameNorm.includes(n.slice(0, 8));
                                    })
                                    .slice(0, 3);
                                console.info('[HEYS.orphan-debug] miss', {
                                    date: dateStr,
                                    itemName,
                                    itemNameNorm,
                                    productId: item.product_id ?? item.productId ?? null,
                                    fingerprint: item.fingerprint || null,
                                    freshProductsCount: freshProducts.length,
                                    sharedProductsCount: sharedProducts.length,
                                    freshSimilar: freshSample,
                                    sharedSimilar: sharedSample,
                                    hasInlineData: item.kcal100 != null,
                                });
                            }
                            trackOrphanProduct(item, dateStr);
                        } else if (foundInFresh || foundInShared) {
                            const n = String(item.name || '').trim();
                            orphanProductsRemoveKeys(n || itemName, itemNameNorm, itemNameLower);
                        }
                    }

                    if (src.kcal100 != null || src.protein100 != null) {
                        const mult = grams / 100;
                        const prot = (+src.protein100 || 0) * mult;
                        const fat = (+src.fat100 || 0) * mult;
                        const carbs = (+src.carbs100 || (+src.simple100 || 0) + (+src.complex100 || 0)) * mult;

                        // 🔄 v3.9.2: Используем TEF-формулу как в mealTotals (белок 3 ккал/г вместо 4)
                        // TEF-aware: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g
                        const kcalTEF = 3 * prot + 4 * carbs + 9 * fat;
                        totalKcal += kcalTEF;
                        totalProt += prot;
                        totalFat += fat;
                        totalCarbs += carbs;
                    }
                });
            });

            // Вычисляем sleepHours из sleepStart/sleepEnd
            let sleepHours = 0;
            if (dayData.sleepStart && dayData.sleepEnd) {
                const [sh, sm] = dayData.sleepStart.split(':').map(Number);
                const [eh, em] = dayData.sleepEnd.split(':').map(Number);
                let startMin = sh * 60 + sm;
                let endMin = eh * 60 + em;
                if (endMin < startMin) endMin += 24 * 60; // через полночь
                sleepHours = (endMin - startMin) / 60;
            }

            // Считаем общие минуты тренировок
            let trainingMinutes = 0;
            (dayData.trainings || []).forEach(t => {
                if (t && t.z && Array.isArray(t.z)) {
                    trainingMinutes += t.z.reduce((sum, m) => sum + (+m || 0), 0);
                }
            });

            return {
                kcal: Math.round(totalKcal),
                savedEatenKcal: +dayData.savedEatenKcal || 0, // 🆕 Сохранённые калории (приоритет над пересчитанными)
                prot: Math.round(totalProt),
                fat: Math.round(totalFat),
                carbs: Math.round(totalCarbs),
                steps: +dayData.steps || 0,
                waterMl: +dayData.waterMl || 0, // 🆕 Вода для персонализированных инсайтов
                householdMin: +dayData.householdMin || 0,
                trainings: dayData.trainings || [],
                trainingMinutes,
                weightMorning: +dayData.weightMorning || 0,
                deficitPct: dayData.deficitPct, // может быть undefined — тогда из профиля
                sleepHours,
                moodAvg: +dayData.moodAvg || 0,
                dayScore: +dayData.dayScore || 0,
                cycleDay: dayData.cycleDay || null, // День менструального цикла (1-N или null)
                isRefeedDay: dayData.isRefeedDay || false, // Загрузочный день
                refeedReason: dayData.refeedReason || null, // Причина refeed
                // 🔧 FIX: Сохранённая норма с учётом долга — используется для корректного отображения в sparkline
                savedDisplayOptimum: +dayData.savedDisplayOptimum || 0,
                // 🆕 v1.1: Флаги верификации низкокалорийных дней
                isFastingDay: dayData.isFastingDay || false, // Осознанное голодание — данные корректны
                isIncomplete: dayData.isIncomplete || false, // Не заполнен — исключить из статистик
                meals: dayData.meals || [] // 🆕 v1.1: Для определения пустого дня
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Вычисляет калории за день напрямую из localStorage (legacy wrapper)
     */
    function getDayCalories(dateStr, productsMap) {
        const data = getDayData(dateStr, productsMap, {});
        return data ? data.kcal : 0;
    }

    /**
     * Получает Map продуктов для вычисления калорий
     * @returns {Map} productsMap (name => product)
     */
    function getProductsMap() {
        const productsMap = new Map();
        try {
            // Используем HEYS.store.get который знает правильный ключ с clientId
            let products = [];
            if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.get === 'function') {
                products = window.HEYS.store.get('heys_products', []);
            } else {
                // Fallback: пробуем напрямую из localStorage
                const U = window.HEYS?.utils;
                const storeGet = window.HEYS?.store?.get;
                const clientId = U?.getCurrentClientId?.()
                    || (window.HEYS && window.HEYS.currentClientId)
                    || (storeGet ? storeGet('heys_client_current', '') : '')
                    || localStorage.getItem('heys_client_current') || '';
                const productsKey = clientId
                    ? 'heys_' + clientId + '_products'
                    : 'heys_products';
                const productsRaw = storeGet ? storeGet(productsKey, null) : localStorage.getItem(productsKey);

                if (productsRaw) {
                    if (typeof productsRaw === 'string') {
                        if (productsRaw.startsWith('¤Z¤')) {
                            let str = productsRaw.substring(3);
                            const patterns = {
                                '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
                                '¤c¤': '"carbs100"', '¤f¤': '"fat100"', '¤s¤': '"simple100"',
                                '¤x¤': '"complex100"', '¤b¤': '"badFat100"', '¤g¤': '"goodFat100"',
                                '¤t¤': '"trans100"', '¤i¤': '"fiber100"', '¤G¤': '"gi"', '¤h¤': '"harmScore"'
                            };
                            for (const [code, pattern] of Object.entries(patterns)) {
                                str = str.split(code).join(pattern);
                            }
                            products = JSON.parse(str);
                        } else {
                            products = JSON.parse(productsRaw);
                        }
                    } else {
                        products = productsRaw;
                    }
                }
            }
            // Если products — объект с полем products, извлекаем массив
            if (products && !Array.isArray(products) && Array.isArray(products.products)) {
                products = products.products;
            }
            // Финальная проверка что это массив
            if (!Array.isArray(products)) {
                products = [];
            }
            products.forEach(p => {
                if (p && p.name) {
                    const name = String(p.name).trim();
                    if (name) productsMap.set(name, p);
                }
            });
        } catch (e) {
            // Тихий fallback — productsMap не критичен
        }
        return productsMap;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 🚀 LAZY-LOADING DAYS — Оптимизированная загрузка дней
    // ═══════════════════════════════════════════════════════════════════

    // Кэш загруженных дней (для предотвращения повторных чтений)
    const DAYS_CACHE = new Map(); // dateStr => { data, timestamp }
    const DAYS_CACHE_TTL = 5 * 60 * 1000; // 5 минут TTL

    /**
     * Lazy-загрузка дней — загружает только последние N дней
     * Оптимизирует холодный старт приложения
     * 
     * @param {number} daysBack - Сколько дней назад загружать (default: 30)
     * @param {Object} options - Опции
     * @param {boolean} options.forceRefresh - Игнорировать кэш
     * @param {Function} options.onProgress - Callback прогресса (loaded, total)
     * @returns {Map<string, Object>} Map дат с данными дней
     */
    function loadRecentDays(daysBack = 30, options = {}) {
        const { forceRefresh = false, onProgress } = options;
        const result = new Map();
        const now = Date.now();
        const today = new Date();

        for (let i = 0; i < daysBack; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = fmtDate(d);

            // Проверяем кэш
            if (!forceRefresh && DAYS_CACHE.has(dateStr)) {
                const cached = DAYS_CACHE.get(dateStr);
                if (now - cached.timestamp < DAYS_CACHE_TTL) {
                    result.set(dateStr, cached.data);
                    if (onProgress) onProgress(i + 1, daysBack);
                    continue;
                }
            }

            // Загружаем день (v69: scoped key first)
            const _cid1 = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
            const dayData = (_cid1 ? lsGet('heys_' + _cid1 + '_dayv2_' + dateStr, null) : null) || lsGet('heys_dayv2_' + dateStr, null);
            if (dayData && typeof dayData === 'object') {
                result.set(dateStr, dayData);
                DAYS_CACHE.set(dateStr, { data: dayData, timestamp: now });
            }

            if (onProgress) onProgress(i + 1, daysBack);
        }

        return result;
    }

    /**
     * Lazy-загрузка одного дня с кэшированием
     * @param {string} dateStr - Дата в формате YYYY-MM-DD
     * @param {boolean} forceRefresh - Игнорировать кэш
     * @returns {Object|null} Данные дня или null
     */
    function loadDay(dateStr, forceRefresh = false) {
        const now = Date.now();

        // Проверяем кэш
        if (!forceRefresh && DAYS_CACHE.has(dateStr)) {
            const cached = DAYS_CACHE.get(dateStr);
            if (now - cached.timestamp < DAYS_CACHE_TTL) {
                return cached.data;
            }
        }

        // Загружаем день (v69: scoped key first)
        const _cid2 = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
        const dayData = (_cid2 ? lsGet('heys_' + _cid2 + '_dayv2_' + dateStr, null) : null) || lsGet('heys_dayv2_' + dateStr, null);
        if (dayData && typeof dayData === 'object') {
            DAYS_CACHE.set(dateStr, { data: dayData, timestamp: now });
            return dayData;
        }

        return null;
    }

    /**
     * Инвалидирует кэш дня (вызывать после сохранения)
     * @param {string} dateStr - Дата в формате YYYY-MM-DD
     */
    function invalidateDayCache(dateStr) {
        DAYS_CACHE.delete(dateStr);
        _invalidateActiveDaysCache(dateStr);
    }

    /**
     * Очищает весь кэш дней
     */
    function clearDaysCache() {
        DAYS_CACHE.clear();
        _clearActiveDaysCache();
    }

    /**
     * Получить статистику кэша
     * @returns {{size: number, hitRate: number}}
     */
    function getDaysCacheStats() {
        let validCount = 0;
        const now = Date.now();

        DAYS_CACHE.forEach((cached) => {
            if (now - cached.timestamp < DAYS_CACHE_TTL) {
                validCount++;
            }
        });

        return {
            size: DAYS_CACHE.size,
            validEntries: validCount,
            expiredEntries: DAYS_CACHE.size - validCount
        };
    }

    /**
     * Предзагрузка дней для месяца (для календаря)
     * Загружает данные асинхронно чтобы не блокировать UI
     * 
     * @param {number} year
     * @param {number} month - 0-11
     * @returns {Promise<Map<string, Object>>}
     */
    async function preloadMonthDays(year, month) {
        return new Promise((resolve) => {
            const result = new Map();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // Используем requestIdleCallback для фоновой загрузки
            const loadBatch = (startDay, batchSize = 5) => {
                const endDay = Math.min(startDay + batchSize, daysInMonth + 1);

                for (let d = startDay; d < endDay; d++) {
                    const dateStr = fmtDate(new Date(year, month, d));
                    const dayData = loadDay(dateStr);
                    if (dayData) {
                        result.set(dateStr, dayData);
                    }
                }

                if (endDay <= daysInMonth) {
                    // Продолжаем загрузку в следующем idle callback
                    if (typeof requestIdleCallback !== 'undefined') {
                        requestIdleCallback(() => loadBatch(endDay, batchSize));
                    } else {
                        setTimeout(() => loadBatch(endDay, batchSize), 0);
                    }
                } else {
                    // Загрузка завершена
                    resolve(result);
                }
            };

            // Начинаем загрузку
            loadBatch(1);
        });
    }

    // R53: In-memory cache for getActiveDaysForMonth to avoid repeated localStorage reads
    const _activeDaysCache = new Map();
    const _ACTIVE_DAYS_CACHE_TTL = 60000; // 60s TTL

    function _invalidateActiveDaysCache(dateStr) {
        // Invalidate the month containing dateStr
        if (dateStr && dateStr.length >= 7) {
            const key = dateStr.substring(0, 7); // 'YYYY-MM'
            _activeDaysCache.forEach((_, k) => {
                if (k.startsWith(key)) _activeDaysCache.delete(k);
            });
        }
    }

    function _clearActiveDaysCache() {
        _activeDaysCache.clear();
    }

    // Listen for day updates to invalidate cache
    if (global.addEventListener) {
        global.addEventListener('heys:day-updated', (e) => {
            const dateStr = e?.detail?.date || e?.detail?.dateStr;
            if (dateStr) {
                _invalidateActiveDaysCache(dateStr);
            } else {
                _clearActiveDaysCache();
            }
        });
    }

    /**
     * Вычисляет Set активных дней для месяца
     * Активный день = съедено ≥ 1/3 BMR (реальное ведение дневника)
     * 
     * @param {number} year - Год
     * @param {number} month - Месяц (0-11)
     * @param {Object} profile - Профиль пользователя {weight, height, age, sex, deficitPctTarget}
     * @param {Array} products - Массив продуктов (передаётся из App state)
     * @returns {Map<string, {kcal: number, target: number, ratio: number}>} Map дат с данными
     */
    function getActiveDaysForMonth(year, month, profile, products) {
        // R53: Check in-memory cache first
        const clientId = (HEYS.currentClientId || '').slice(0, 16);
        const cacheKey = year + '-' + String(month + 1).padStart(2, '0') + '_' + clientId;
        const cached = _activeDaysCache.get(cacheKey);
        if (cached && (Date.now() - cached.ts < _ACTIVE_DAYS_CACHE_TTL)) {
            return cached.data;
        }

        const daysData = new Map();

        try {
            // Получаем базовые данные из профиля
            const profileWeight = +(profile && profile.weight) || 70;
            const deficitPct = +(profile && profile.deficitPctTarget) || 0;
            const sex = (profile && profile.sex) || 'male';
            const baseBmr = calcBMR(profileWeight, profile || {});
            const threshold = Math.round(baseBmr / 3); // 1/3 BMR — минимум для "активного" дня

            // Строим Map продуктов из переданного массива (ключ = lowercase name)
            const productsMap = new Map();
            const productsArr = Array.isArray(products) ? products : [];
            productsArr.forEach(p => {
                if (p && p.name) {
                    const name = String(p.name).trim().toLowerCase();
                    if (name) productsMap.set(name, p);
                }
            });

            // Проходим по всем дням месяца
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            // [HEYS.calendar] Диагностика: подсчёт статуса дней
            let _diagNull = 0, _diagFiltered = 0, _diagActive = 0;

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = fmtDate(new Date(year, month, d));
                const dayInfo = getDayData(dateStr, productsMap, profile);

                // Пропускаем дни без данных. Если есть цикл или хотя бы один приём пищи — показываем даже при низких ккал
                const hasCycleDay = dayInfo && dayInfo.cycleDay != null;
                const hasMeals = !!(dayInfo && Array.isArray(dayInfo.meals) && dayInfo.meals.length > 0);
                if (!dayInfo) { _diagNull++; continue; }
                if (dayInfo.kcal < threshold && !hasCycleDay && !hasMeals) { _diagFiltered++; continue; }

                // Если день только с cycleDay (без еды) — добавляем минимальную запись
                if (dayInfo.kcal < threshold && hasCycleDay) {
                    daysData.set(dateStr, {
                        kcal: 0, target: 0, ratio: 0,
                        hasTraining: false, trainingTypes: [], morningActivationCount: 0, trainingMinutes: 0,
                        moodAvg: null, sleepHours: 0, dayScore: 0,
                        prot: 0, fat: 0, carbs: 0,
                        cycleDay: dayInfo.cycleDay
                    });
                    continue;
                }

                // Используем вес дня если есть, иначе из профиля
                const weight = dayInfo.weightMorning || profileWeight;
                const bmr = calcBMR(weight, profile || {});

                // Шаги: формула stepsKcal(steps, weight, sex, 0.7)
                const steps = dayInfo.steps || 0;
                const stepsK = stepsKcal(steps, weight, sex, 0.7);

                // Быт: householdMin × kcalPerMin(2.5, weight)
                const householdMin = dayInfo.householdMin || 0;
                const householdK = Math.round(householdMin * kcalPerMin(2.5, weight));

                // Тренировки: суммируем ккал из зон z (как на экране дня — только первые 3)
                // Читаем кастомные MET из heys_hr_zones (как на экране дня)
                const hrZones = lsGet('heys_hr_zones', []);
                const customMets = hrZones.map(x => +x.MET || 0);
                const mets = [2.5, 6, 8, 10].map((def, i) => customMets[i] || def);
                const kcalMin = mets.map(m => kcalPerMin(m, weight));

                let trainingsK = 0;
                const trainings = (dayInfo.trainings || []).slice(0, 3); // максимум 3 тренировки

                // Собираем типы тренировок с реальными минутами
                const activeTrainings = trainings
                    .filter(t => t && t.z && Array.isArray(t.z) && t.z.some(z => z > 0));
                const trainingTypes = activeTrainings.map(t => t.type || 'cardio');
                const morningActivationCount = activeTrainings.filter(t => t?.source === 'morning_activation').length;
                const hasTraining = trainingTypes.length > 0;

                trainings.forEach((t, tIdx) => {
                    if (t.z && Array.isArray(t.z)) {
                        let tKcal = 0;
                        t.z.forEach((min, i) => {
                            tKcal += Math.round((+min || 0) * (kcalMin[i] || 0));
                        });
                        trainingsK += tKcal;
                    }
                });

                const tdee = bmr + stepsK + householdK + trainingsK;
                // Используем дефицит дня если есть (не пустая строка и не null), иначе из профиля
                const dayDeficit = (dayInfo.deficitPct !== '' && dayInfo.deficitPct != null) ? +dayInfo.deficitPct : deficitPct;
                const calculatedTarget = Math.round(tdee * (1 + dayDeficit / 100));

                // 🔧 FIX: Используем сохранённую норму с долгом если есть, иначе расчётную
                // Это позволяет показывать корректную линию нормы в sparkline для прошлых дней
                const target = dayInfo.savedDisplayOptimum > 0 ? dayInfo.savedDisplayOptimum : calculatedTarget;

                // 🔧 FIX: Используем сохранённые калории если есть, иначе пересчитанные
                // savedEatenKcal гарантирует точное значение, которое показывалось пользователю в тот день
                const hasAnyMealItems = (dayInfo.meals || []).some((m) => Array.isArray(m?.items) && m.items.length > 0);
                const kcal = hasAnyMealItems && dayInfo.savedEatenKcal > 0 ? dayInfo.savedEatenKcal : dayInfo.kcal;

                // ratio: 1.0 = идеально в цель, <1 недоел, >1 переел
                const ratio = target > 0 ? kcal / target : 0;

                // moodAvg для mood-полосы на графике
                const moodAvg = dayInfo.moodAvg ? +dayInfo.moodAvg : null;

                // Дополнительные данные для sparkline и персонализированных инсайтов
                const sleepHours = dayInfo.sleepHours || 0;
                const trainingMinutes = dayInfo.trainingMinutes || 0;
                const prot = dayInfo.prot || 0;
                const fat = dayInfo.fat || 0;
                const carbs = dayInfo.carbs || 0;
                const dayScore = dayInfo.dayScore || 0;
                const cycleDay = dayInfo.cycleDay || null; // День менструального цикла
                // steps уже объявлен выше для расчёта stepsKcal
                const waterMl = dayInfo.waterMl || 0; // 🆕 Вода для персонализированных инсайтов
                const weightMorning = dayInfo.weightMorning || 0; // 🆕 Вес для персонализированных инсайтов

                daysData.set(dateStr, {
                    kcal, target, ratio, // 🔧 FIX: kcal теперь использует savedEatenKcal если есть
                    baseTarget: calculatedTarget, // 🔧 Базовая норма БЕЗ долга — для расчёта caloricDebt
                    hasTraining, trainingTypes, morningActivationCount, trainingMinutes,
                    moodAvg, sleepHours, dayScore,
                    prot, fat, carbs,
                    steps, waterMl, weightMorning, // 🆕 Добавлены для персонализированных инсайтов
                    cycleDay,
                    isRefeedDay: dayInfo.isRefeedDay || false,
                    refeedReason: dayInfo.refeedReason || null,
                    // 🆕 v1.1: Флаги верификации низкокалорийных дней
                    isFastingDay: dayInfo.isFastingDay || false,
                    isIncomplete: dayInfo.isIncomplete || false
                });

                _diagActive++;
            }

            // [HEYS.calendar] Диагностика результатов
            window.console.info('[HEYS.calendar] 📊 getActiveDaysForMonth: month=' + (month + 1)
                + ' daysInMonth=' + daysInMonth
                + ' null=' + _diagNull + ' filtered=' + _diagFiltered + ' active=' + _diagActive
                + ' productsMap=' + productsMap.size
                + ' threshold=' + threshold
                + ' clientId=' + (window.HEYS?.currentClientId?.slice(0, 8) || 'none'));

        } catch (e) {
            // Тихий fallback — activeDays для календаря не критичны,
            // но ошибку стоит залогировать, иначе отладка невозможна.
            window.console.error('[HEYS.calendar] ❌ getActiveDaysForMonth ошибка:', e?.message || e);
            try {
                if (typeof HEYS !== 'undefined' && HEYS.analytics && HEYS.analytics.trackError) {
                    HEYS.analytics.trackError(e, {
                        where: 'day_utils.getActiveDaysForMonth',
                        year,
                        month,
                        hasProfile: !!profile,
                        productsLen: Array.isArray(products) ? products.length : null,
                    });
                }
            } catch (_) { }
        }

        // R53: Store in cache before returning
        _activeDaysCache.set(cacheKey, { data: daysData, ts: Date.now() });
        return daysData;
    }

    function compactMealsContentSignature(meals) {
        const arr = Array.isArray(meals) ? meals : [];
        if (arr.length === 0) return '0';
        return arr.map((m, idx) => {
            const items = Array.isArray(m && m.items) ? m.items : [];
            const itemSig = items.map((it, j) => [
                (it && (it.productId || it.id)) || j,
                Math.round(Number(it && it.grams) || 0),
                Math.round(Number(it && it.kcal) || 0),
                it && it.deleted ? 'd' : ''
            ].join('.')).join(',');
            return [
                (m && m.id) || ('i' + idx),
                String((m && m.updatedAt) || 0),
                Math.round(Number(m && m.grams) || 0),
                Math.round(Number(m && m.kcal) || 0),
                String((m && m.time) || ''),
                String((m && m.name) || '').slice(0, 120),
                items.length,
                itemSig
            ].join('|');
        }).join('\n');
    }

    function compactTrainingsContentSignature(trainings) {
        const arr = Array.isArray(trainings) ? trainings : [];
        if (arr.length === 0) return '0';
        return arr.map((t, idx) => [
            (t && t.id) || ('i' + idx),
            String((t && t.updatedAt) || 0),
            String((t && t.type) || ''),
            Math.round(Number(t && t.minutes) || 0),
            Math.round(Number(t && t.kcal) || 0)
        ].join('|')).join('\n');
    }

    function mealsTrainingsDeepEqual(a, b) {
        return JSON.stringify(a || []) === JSON.stringify(b || []);
    }

    function isSameDayHydratedContent(prevDay, newDay) {
        if (!prevDay || !newDay || prevDay.date !== newDay.date) return false;
        const pm = prevDay.meals || [];
        const nm = newDay.meals || [];
        const pt = prevDay.trainings || [];
        const nt = newDay.trainings || [];
        if (pm.length !== nm.length || pt.length !== nt.length) return false;
        const mealsOk = compactMealsContentSignature(pm) === compactMealsContentSignature(nm)
            || mealsTrainingsDeepEqual(pm, nm);
        const trainOk = compactTrainingsContentSignature(pt) === compactTrainingsContentSignature(nt)
            || mealsTrainingsDeepEqual(pt, nt);
        if (!mealsOk || !trainOk) return false;
        return prevDay.waterMl === newDay.waterMl &&
            prevDay.steps === newDay.steps &&
            prevDay.weightMorning === newDay.weightMorning &&
            !!prevDay.isFastingDay === !!newDay.isFastingDay &&
            !!prevDay.isIncomplete === !!newDay.isIncomplete &&
            prevDay.moodMorning === newDay.moodMorning &&
            prevDay.wellbeingMorning === newDay.wellbeingMorning &&
            prevDay.stressMorning === newDay.stressMorning &&
            prevDay.moodAvg === newDay.moodAvg &&
            prevDay.wellbeingAvg === newDay.wellbeingAvg &&
            prevDay.stressAvg === newDay.stressAvg &&
            prevDay.dayScore === newDay.dayScore &&
            prevDay.dayScoreRaw === newDay.dayScoreRaw &&
            prevDay.dayScoreManual === newDay.dayScoreManual &&
            prevDay.sleepStart === newDay.sleepStart &&
            prevDay.sleepEnd === newDay.sleepEnd &&
            prevDay.sleepHours === newDay.sleepHours &&
            prevDay.sleepQuality === newDay.sleepQuality;
    }

    function isSameDayStorageMergeContent(prevDay, newDay) {
        if (!prevDay || !newDay || prevDay.date !== newDay.date) return false;
        const pm = prevDay.meals || [];
        const nm = newDay.meals || [];
        const pt = prevDay.trainings || [];
        const nt = newDay.trainings || [];
        if (pm.length !== nm.length || pt.length !== nt.length) return false;
        const mealsOk = compactMealsContentSignature(pm) === compactMealsContentSignature(nm)
            || mealsTrainingsDeepEqual(pm, nm);
        const trainOk = compactTrainingsContentSignature(pt) === compactTrainingsContentSignature(nt)
            || mealsTrainingsDeepEqual(pt, nt);
        if (!mealsOk || !trainOk) return false;
        const prevSupplementsPlanned = JSON.stringify(prevDay.supplementsPlanned || []);
        const newSupplementsPlanned = JSON.stringify(newDay.supplementsPlanned || []);
        const prevSupplementsTaken = JSON.stringify(prevDay.supplementsTaken || []);
        const newSupplementsTaken = JSON.stringify(newDay.supplementsTaken || []);
        const prevHouseholdJson = JSON.stringify(prevDay.householdActivities || []);
        const newHouseholdJson = JSON.stringify(newDay.householdActivities || []);
        return prevHouseholdJson === newHouseholdJson &&
            prevDay.waterMl === newDay.waterMl &&
            prevDay.steps === newDay.steps &&
            prevDay.weightMorning === newDay.weightMorning &&
            prevDay.moodMorning === newDay.moodMorning &&
            prevDay.wellbeingMorning === newDay.wellbeingMorning &&
            prevDay.stressMorning === newDay.stressMorning &&
            prevSupplementsPlanned === newSupplementsPlanned &&
            prevSupplementsTaken === newSupplementsTaken &&
            prevDay.sleepStart === newDay.sleepStart &&
            prevDay.sleepEnd === newDay.sleepEnd &&
            prevDay.sleepHours === newDay.sleepHours &&
            prevDay.sleepQuality === newDay.sleepQuality &&
            prevDay.morningActivation?.status === newDay.morningActivation?.status &&
            prevDay.householdMin === newDay.householdMin;
    }

    // === Exports ===
    // Всё экспортируется через HEYS.dayUtils
    // POPULAR_CACHE — приватный, не экспортируется (инкапсуляция)
    HEYS.dayUtils = {
        // Haptic
        haptic: hapticFn,
        // Date/Time
        pad2,
        todayISO,
        fmtDate,
        parseISO,
        uid,
        formatDateDisplay,
        // Night time logic (приёмы 00:00-02:59 относятся к предыдущему дню)
        NIGHT_HOUR_THRESHOLD,
        isNightTime,
        getEffectiveDate,
        getNextDay,
        // Storage
        lsGet,
        lsSet,
        // Math
        clamp,
        r0,
        r1,
        scale,
        // Models
        ensureDay,
        buildProductIndex,
        getProductFromItem,
        per100,
        // Data
        loadMealsForDate,
        loadMealsRaw,
        productsSignature,
        computePopularProducts,
        // Profile/Calculations
        getProfile,
        calcBMR,
        kcalPerMin,
        stepsKcal,
        // Time/Sleep
        parseTime,
        sleepHours,
        formatMealTime,
        // Hours Order (для wheel picker с ночными часами)
        HOURS_ORDER,
        wheelIndexToHour,
        hourToWheelIndex,
        // Meal Type Classification
        MEAL_TYPES,
        MAIN_MEAL_THRESHOLDS,
        getMealStats,
        isMainMeal,
        timeToMinutes,
        getMealType,
        getMealTypeSimple,
        getMealTypeForPreview,
        fallbackMealType,
        // Calendar indicators
        getDayCalories,
        getProductsMap,
        getActiveDaysForMonth,
        getDayData,
        // 🚀 Lazy-loading API
        loadRecentDays,
        loadDay,
        invalidateDayCache,
        clearDaysCache,
        getDaysCacheStats,
        preloadMonthDays,
        isSameDayHydratedContent,
        isSameDayStorageMergeContent,
        // Predicates
        isSyntheticEstimatedItem
    };

})(window);

