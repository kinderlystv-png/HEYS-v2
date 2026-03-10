// heys_day_utils.js — Day utilities: date/time, storage, calculations

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // Создаём namespace для утилит дня
  HEYS.dayUtils = {};

  // === Deleted Products Ignore List v2.0 ===
  // Персистентный список удалённых продуктов — чтобы autoRecover и cloud sync не восстанавливали их
  // Ключ localStorage: heys_deleted_products_ignore_list
  // Формат v2: { entries: { [key]: { name, id?, deletedAt, fingerprint? } }, version: 2 }
  const DELETED_PRODUCTS_KEY = 'heys_deleted_products_ignore_list';
  const DELETED_PRODUCTS_VERSION = 2;
  const DELETED_PRODUCTS_TTL_DAYS = 90; // Автоочистка через 90 дней

  /**
   * Загружаем игнор-лист из localStorage при инициализации
   * Поддерживает миграцию с v1 (Set) на v2 (Object с метаданными)
   */
  function loadDeletedProductsList() {
    try {
      const stored = localStorage.getItem(DELETED_PRODUCTS_KEY);
      if (!stored) return { entries: {}, version: DELETED_PRODUCTS_VERSION };

      const parsed = JSON.parse(stored);

      // Миграция с v1 (массив строк) на v2 (объект с метаданными)
      if (Array.isArray(parsed)) {
        const now = Date.now();
        const migrated = { entries: {}, version: DELETED_PRODUCTS_VERSION };
        parsed.forEach(key => {
          if (key) {
            migrated.entries[String(key).toLowerCase()] = {
              name: key,
              deletedAt: now,
              _migratedFromV1: true
            };
          }
        });
        console.log(`[HEYS] 🔄 Мигрировано ${Object.keys(migrated.entries).length} записей игнор-листа v1 → v2`);
        saveDeletedProductsData(migrated);
        return migrated;
      }

      // v2 формат
      if (parsed.version === DELETED_PRODUCTS_VERSION && parsed.entries) {
        return parsed;
      }

      return { entries: {}, version: DELETED_PRODUCTS_VERSION };
    } catch (e) {
      console.warn('[HEYS] Ошибка загрузки deleted products list:', e);
      return { entries: {}, version: DELETED_PRODUCTS_VERSION };
    }
  }

  /**
   * Сохраняем игнор-лист в localStorage
   */
  function saveDeletedProductsData(data) {
    try {
      localStorage.setItem(DELETED_PRODUCTS_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[HEYS] Ошибка сохранения deleted products list:', e);
    }
  }

  // In-memory кэш игнор-листа
  let deletedProductsData = loadDeletedProductsList();

  /**
   * Нормализация ключа для игнор-листа (lowercase, trim, collapse spaces)
   */
  function normalizeDeletedKey(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Автоочистка устаревших записей (старше TTL)
   */
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
      console.log(`[HEYS] 🧹 Очищено ${removed} устаревших записей из игнор-листа (TTL: ${DELETED_PRODUCTS_TTL_DAYS} дней)`);
    }

    return removed;
  }

  // Автоочистка при загрузке
  cleanupExpiredEntries();

  // === API для управления игнор-листом удалённых продуктов ===
  HEYS.deletedProducts = {
    /**
     * Добавить продукт в игнор-лист (при удалении)
     * @param {string} name - Название продукта
     * @param {string} [id] - ID продукта (опционально)
     * @param {string} [fingerprint] - Fingerprint продукта (опционально)
     */
    add(name, id, fingerprint) {
      if (!name) return;
      const key = normalizeDeletedKey(name);
      const now = Date.now();

      deletedProductsData.entries[key] = {
        name: name,
        id: id || null,
        fingerprint: fingerprint || null,
        deletedAt: now
      };

      // Также добавляем по ID и fingerprint для быстрого поиска
      if (id) {
        deletedProductsData.entries[String(id)] = {
          name: name,
          id: id,
          fingerprint: fingerprint || null,
          deletedAt: now,
          _isIdKey: true
        };
      }
      if (fingerprint) {
        deletedProductsData.entries[String(fingerprint)] = {
          name: name,
          id: id || null,
          fingerprint: fingerprint,
          deletedAt: now,
          _isFingerprintKey: true
        };
      }

      saveDeletedProductsData(deletedProductsData);
      console.log(`[HEYS] 🚫 Продукт добавлен в игнор-лист: "${name}"${id ? ` (id: ${id.slice(0, 8)}...)` : ''}`);

      // Диспатчим событие для синхронизации с облаком
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', {
          detail: { action: 'add', name, id, fingerprint }
        }));
      }
    },

    /**
     * Проверить, удалён ли продукт (по имени, ID или fingerprint)
     * @param {string} nameOrIdOrFingerprint - Название, ID или fingerprint продукта
     * @returns {boolean}
     */
    isDeleted(nameOrIdOrFingerprint) {
      if (!nameOrIdOrFingerprint) return false;
      const key = normalizeDeletedKey(nameOrIdOrFingerprint);
      return !!deletedProductsData.entries[key] || !!deletedProductsData.entries[String(nameOrIdOrFingerprint)];
    },

    /**
     * Проверить продукт по всем полям (имя, ID, fingerprint)
     * @param {Object} product - Объект продукта
     * @returns {boolean}
     */
    isProductDeleted(product) {
      if (!product) return false;
      if (product.name && this.isDeleted(product.name)) return true;
      if (product.id && this.isDeleted(product.id)) return true;
      if (product.product_id && this.isDeleted(product.product_id)) return true;
      if (product.fingerprint && this.isDeleted(product.fingerprint)) return true;
      return false;
    },

    /**
     * Удалить продукт из игнор-листа (если пользователь снова добавил продукт с таким же именем)
     * @param {string} name - Название продукта
     * @param {string} [id] - ID продукта (опционально)
     * @param {string} [fingerprint] - Fingerprint продукта (опционально)
     */
    remove(name, id, fingerprint) {
      if (!name) return;
      const key = normalizeDeletedKey(name);
      delete deletedProductsData.entries[key];
      if (id) delete deletedProductsData.entries[String(id)];
      if (fingerprint) delete deletedProductsData.entries[String(fingerprint)];
      saveDeletedProductsData(deletedProductsData);
      console.info(`[HEYS] ✅ Продукт восстановлен из игнор-листа: "${name}"`);

      // 🪦 FIX v5.0.2: Также очищаем Store tombstone (heys_deleted_ids) при явном восстановлении.
      // Без этого tombstone из Store блокирует orphan recovery и merge sync,
      // и продукт не появляется в личной базе даже после восстановления из игнор-листа.
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

      // Диспатчим событие для обновления UI
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', {
          detail: { action: 'remove', name, id, fingerprint }
        }));
      }
    },

    /**
     * Получить весь игнор-лист (только уникальные записи по name)
     * @returns {Array<{name: string, id?: string, fingerprint?: string, deletedAt: number}>}
     */
    getAll() {
      const unique = new Map();
      for (const [key, entry] of Object.entries(deletedProductsData.entries)) {
        // Пропускаем вспомогательные ключи (_isIdKey, _isFingerprintKey)
        if (entry._isIdKey || entry._isFingerprintKey) continue;
        unique.set(normalizeDeletedKey(entry.name), entry);
      }
      return Array.from(unique.values());
    },

    /**
     * Получить метаданные записи
     * @param {string} nameOrId - Название или ID продукта
     * @returns {Object|null}
     */
    getEntry(nameOrId) {
      if (!nameOrId) return null;
      const key = normalizeDeletedKey(nameOrId);
      return deletedProductsData.entries[key] || deletedProductsData.entries[String(nameOrId)] || null;
    },

    /**
     * Количество удалённых продуктов в игнор-листе (уникальных)
     * @returns {number}
     */
    count() {
      return this.getAll().length;
    },

    /**
     * Очистить игнор-лист (осторожно!)
     */
    clear() {
      const count = this.count();
      deletedProductsData = { entries: {}, version: DELETED_PRODUCTS_VERSION };
      saveDeletedProductsData(deletedProductsData);
      console.info(`[HEYS] Игнор-лист удалённых продуктов очищен (было ${count})`);

      // 🪦 FIX v5.0.2: При полной очистке тоже сбрасываем Store tombstones (heys_deleted_ids)
      try {
        if (window.HEYS?.store?.set) {
          window.HEYS.store.set('heys_deleted_ids', []);
          console.info('[HEYS] 🪦 Store tombstones (heys_deleted_ids) полностью очищены');
        }
      } catch (e) {
        console.warn('[HEYS] ⚠️ Ошибка очистки heys_deleted_ids:', e?.message);
      }

      // Диспатчим событие для обновления UI
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:deleted-products-changed', {
          detail: { action: 'clear', count }
        }));
      }
    },

    /**
     * Принудительная очистка устаревших записей
     * @returns {number} Количество удалённых записей
     */
    cleanup() {
      return cleanupExpiredEntries();
    },

    /**
     * Показать игнор-лист в консоли
     */
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
        const ttlRemaining = DELETED_PRODUCTS_TTL_DAYS - daysAgo;
        console.log(`  ${i + 1}. "${entry.name}" — удалён ${daysAgo}д назад (TTL: ${ttlRemaining}д)`);
      });
    },

    /**
     * Экспорт данных для cloud sync
     * @returns {Object}
     */
    exportForSync() {
      return {
        entries: deletedProductsData.entries,
        version: DELETED_PRODUCTS_VERSION,
        exportedAt: Date.now()
      };
    },

    /**
     * Импорт данных из cloud sync (merge с локальными)
     * @param {Object} cloudData - Данные из облака
     * @returns {number} Количество импортированных записей
     */
    importFromSync(cloudData) {
      if (!cloudData || !cloudData.entries) return 0;

      let imported = 0;
      for (const [key, entry] of Object.entries(cloudData.entries)) {
        // Мержим: если запись новее — заменяем
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

    /**
     * Batch-очистка item'ов из дневника для удалённого продукта
     * @param {string} name - Название продукта
     * @param {Object} options - Опции
     * @returns {Promise<{daysAffected: number, itemsRemoved: number}>}
     */
    async purgeFromDiary(name, options = {}) {
      const { dryRun = false, maxDays = 365 } = options;

      if (!name) return { daysAffected: 0, itemsRemoved: 0 };

      const normalizedName = normalizeDeletedKey(name);
      const entry = this.getEntry(name);
      const productId = entry?.id;
      const fingerprint = entry?.fingerprint;

      const U = HEYS.utils || {};
      const lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const lsSet = U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v)));

      // Собираем все ключи дней
      const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));

      let daysAffected = 0;
      let itemsRemoved = 0;

      for (const key of keys.slice(0, maxDays)) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;

          let day;
          if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
            day = HEYS.store.decompress(raw);
          } else {
            day = JSON.parse(raw);
          }

          if (!day || !Array.isArray(day.meals)) continue;

          let dayModified = false;

          for (const meal of day.meals) {
            if (!Array.isArray(meal.items)) continue;

            const beforeCount = meal.items.length;
            meal.items = meal.items.filter(item => {
              const itemName = normalizeDeletedKey(item.name);
              const itemId = String(item.product_id || item.productId || '');
              const itemFingerprint = item.fingerprint || '';

              // Проверяем совпадение по имени, ID или fingerprint
              if (itemName === normalizedName) return false;
              if (productId && itemId === String(productId)) return false;
              if (fingerprint && itemFingerprint === fingerprint) return false;

              return true;
            });

            if (meal.items.length < beforeCount) {
              dayModified = true;
              itemsRemoved += (beforeCount - meal.items.length);
            }
          }

          if (dayModified && !dryRun) {
            // Сохраняем изменённый день
            if (HEYS.store?.compress) {
              localStorage.setItem(key, HEYS.store.compress(day));
            } else {
              localStorage.setItem(key, JSON.stringify(day));
            }
            daysAffected++;
          } else if (dayModified) {
            daysAffected++;
          }
        } catch (e) {
          // Пропускаем битые записи
        }
      }

      if (itemsRemoved > 0) {
        console.log(`[HEYS] ${dryRun ? '🔍 [DRY RUN]' : '🗑️'} Удалено ${itemsRemoved} записей "${name}" из ${daysAffected} дней`);
      }

      return { daysAffected, itemsRemoved };
    },

    // Константы для внешнего использования
    TTL_DAYS: DELETED_PRODUCTS_TTL_DAYS,
    VERSION: DELETED_PRODUCTS_VERSION
  };

  // === Orphan Products Tracking ===
  // Отслеживание продуктов, для которых данные берутся из штампа вместо базы
  const orphanProductsMap = new Map(); // name => { name, usedInDays: Set, firstSeen }
  const orphanLoggedRecently = new Map(); // name => timestamp (throttle логов)

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
    if (!item || !item.name) return;
    if (isSyntheticEstimatedItem(item)) return;
    const name = String(item.name).trim();
    if (!name) return;

    if (!orphanProductsMap.has(name)) {
      orphanProductsMap.set(name, {
        name: name,
        usedInDays: new Set([dateStr]),
        firstSeen: Date.now(),
        hasInlineData: item.kcal100 != null
      });
      // Первое обнаружение — логируем с датой
      console.warn(`[HEYS] Orphan product: "${name}" — используются данные из штампа (день: ${dateStr || 'unknown'})`);
    } else {
      orphanProductsMap.get(name).usedInDays.add(dateStr);
    }
  }

  // API для просмотра orphan-продуктов
  HEYS.orphanProducts = {
    // Получить список всех orphan-продуктов
    getAll() {
      return Array.from(orphanProductsMap.values()).map(o => ({
        ...o,
        usedInDays: Array.from(o.usedInDays),
        daysCount: o.usedInDays.size
      }));
    },

    // Количество orphan-продуктов
    count() {
      return orphanProductsMap.size;
    },

    // Есть ли orphan-продукты?
    hasAny() {
      return orphanProductsMap.size > 0;
    },

    // Очистить (после синхронизации или исправления)
    clear() {
      orphanProductsMap.clear();
    },

    // Удалить конкретный по имени (если продукт добавили обратно в базу)
    remove(productName) {
      const name = String(productName || '').trim();
      if (name) {
        orphanProductsMap.delete(name);
        // Также пробуем lowercase
        orphanProductsMap.delete(name.toLowerCase());
      }
    },

    // Пересчитать orphan-продукты на основе актуальной базы
    // Вызывается после добавления продукта или удаления item из meal
    recalculate() {
      if (!global.HEYS?.products?.getAll) return;

      const products = global.HEYS.products.getAll();
      const productNames = new Set(
        products.map(p => String(p.name || '').trim().toLowerCase()).filter(Boolean)
      );

      const beforeCount = orphanProductsMap.size;

      // Удаляем из orphan те, что теперь есть в базе
      for (const [name] of orphanProductsMap) {
        if (productNames.has(name.toLowerCase())) {
          orphanProductsMap.delete(name);
        }
      }

      const afterCount = orphanProductsMap.size;

      // Если количество изменилось — диспатчим событие для обновления UI
      if (beforeCount !== afterCount && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('heys:orphan-updated', {
          detail: { count: afterCount, removed: beforeCount - afterCount }
        }));
      }
    },

    // Показать в консоли красивую таблицу
    log() {
      const all = this.getAll();
      if (all.length === 0) {
        console.log('✅ Нет orphan-продуктов — все данные берутся из базы');
        return;
      }
      console.warn(`⚠️ Найдено ${all.length} orphan-продуктов (данные из штампа):`);
      console.table(all.map(o => ({
        Название: o.name,
        'Дней использования': o.daysCount,
        'Есть данные': o.hasInlineData ? '✓' : '✗'
      })));
    },

    // Восстановить orphan-продукты в базу из штампов в днях
    async restore() {
      const U = HEYS.utils || {};
      const lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const lsSet = U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v)));
      const parseStoredValue = (raw) => {
        if (!raw || typeof raw !== 'string') return null;
        if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
          return HEYS.store.decompress(raw);
        }
        try { return JSON.parse(raw); } catch { return null; }
      };

      // Получаем текущие продукты (ключ = name LOWERCASE для консистентности с getDayData)
      const products = lsGet('heys_products', []);
      const productsMap = new Map();
      const productsById = new Map(); // Для восстановления по id
      products.forEach(p => {
        if (p && p.name) {
          const name = String(p.name).trim().toLowerCase();
          if (name) productsMap.set(name, p);
          if (p.id) productsById.set(String(p.id), p);
        }
      });

      // Собираем orphan-продукты из всех дней
      // Ключи могут быть: heys_dayv2_YYYY-MM-DD (legacy) или heys_<clientId>_dayv2_YYYY-MM-DD
      const restored = [];
      const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));

      // 🔇 v4.7.0: DEBUG логи отключены

      // Debug: показать какие orphan продукты мы ищем
      const orphanNames = Array.from(orphanProductsMap.keys());

      let checkedItems = 0;
      let foundWithData = 0;
      let alreadyInBase = 0;

      for (const key of keys) {
        try {
          const day = parseStoredValue(localStorage.getItem(key));
          if (!day || !day.meals) continue;

          for (const meal of day.meals) {
            for (const item of (meal.items || [])) {
              if (isSyntheticEstimatedItem(item)) continue;
              checkedItems++;
              const itemName = String(item.name || '').trim();
              const itemNameLower = itemName.toLowerCase();
              if (!itemName) continue;

              const hasData = item.kcal100 != null;
              const inBase = productsMap.has(itemNameLower) || (item.product_id && productsById.has(String(item.product_id)));

              if (hasData) foundWithData++;
              if (inBase) alreadyInBase++;

              // 🔇 v4.7.0: DEBUG логи отключены

              // Если продукта нет в базе по имени И есть inline данные
              if (itemName && !inBase && hasData) {
                const restoredProduct = {
                  id: item.product_id || ('restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
                  name: itemName, // Сохраняем оригинальное имя
                  kcal100: item.kcal100,
                  protein100: item.protein100 || 0,
                  fat100: item.fat100 || 0,
                  carbs100: item.carbs100 || 0,
                  simple100: item.simple100 || 0,
                  complex100: item.complex100 || 0,
                  badFat100: item.badFat100 || 0,
                  goodFat100: item.goodFat100 || 0,
                  trans100: item.trans100 || 0,
                  fiber100: item.fiber100 || 0,
                  gi: item.gi || 50,
                  harm: item.harm ?? item.harmScore ?? 0,
                  restoredAt: Date.now(),
                  restoredFrom: 'orphan_stamp'
                };
                productsMap.set(itemNameLower, restoredProduct);
                restored.push(restoredProduct);
                // 🔇 v4.7.0: Лог отключён
              }
            }
          }
        } catch (e) {
          // Пропускаем битые записи
        }
      }

      // 🔇 v4.7.0: DEBUG лог отключён

      if (restored.length > 0) {
        // Сохраняем обновлённую базу
        const newProducts = Array.from(productsMap.values());

        // Используем HEYS.products.setAll для синхронизации с облаком и React state
        if (HEYS.products?.setAll) {
          HEYS.products.setAll(newProducts);
        } else {
          lsSet('heys_products', newProducts);
          console.warn('[HEYS] ⚠️ Products saved via lsSet only (no cloud sync)');
        }

        if (HEYS.cloud?.flushPendingQueue) {
          try {
            await HEYS.cloud.flushPendingQueue(3000);
          } catch (e) { }
        }

        // Очищаем orphan-трекинг
        this.clear();

        // Обновляем индекс продуктов если есть
        if (HEYS.products?.buildSearchIndex) {
          HEYS.products.buildSearchIndex();
        }

        // Уведомляем UI об обновлении продуктов
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('heysProductsUpdated', {
            detail: { products: newProducts, restored: restored.length }
          }));
        }

        console.log(`✅ Восстановлено ${restored.length} продуктов в базу`);
        return { success: true, count: restored.length, products: restored };
      }

      console.log('ℹ️ Нечего восстанавливать — нет данных в штампах');
      return { success: false, count: 0, products: [] };
    },

    /**
     * 🔄 autoRecoverOnLoad — Автоматическая проверка и восстановление orphan-продуктов при загрузке
     * Вызывается после загрузки продуктов (sync или localStorage)
     * 
     * Логика:
     * 1. Сканирует все дни (heys_dayv2_*)
     * 2. Для каждого продукта в приёмах пищи проверяет наличие в локальной базе
     * 3. Если не найден — пытается восстановить:
     *    a) Из штампа (kcal100, protein100, etc. в meal item) — приоритет
     *    b) Из shared_products через HEYS.YandexAPI.rpc — fallback
     * 4. Добавляет восстановленные продукты в локальную базу
     * 
     * @param {Object} options - Опции
     * @param {boolean} options.verbose - Подробный лог (default: false)
     * @param {boolean} options.tryShared - Пытаться восстановить из shared_products (default: true)
     * @returns {Promise<{recovered: number, fromStamp: number, fromShared: number, missing: string[]}>}
     */
    async autoRecoverOnLoad(options = {}) {
      const { verbose = false, tryShared = true } = options;
      const U = HEYS.utils || {};
      const lsGet = U.lsGet || ((k, d) => {
        try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
      });
      const parseStoredValue = (raw) => {
        if (!raw || typeof raw !== 'string') return null;
        if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
          return HEYS.store.decompress(raw);
        }
        try { return JSON.parse(raw); } catch { return null; }
      };

      const startTime = Date.now();
      if (verbose) console.log('[HEYS] 🔍 autoRecoverOnLoad: начинаю проверку продуктов...');

      // 1. Собираем текущие продукты в Map по id и по name (normalized)
      // 🆕 v4.9.0: Используем HEYS.products.getAll() вместо localStorage напрямую
      // чтобы не потерять продукты которые уже загружены в память
      const products = HEYS.products?.getAll?.() || lsGet('heys_products', []);
      const productsById = new Map();
      const productsByName = new Map();
      const productsByFingerprint = new Map(); // 🆕 v4.6.0: Индекс по fingerprint
      const normalizeName = HEYS.models?.normalizeProductName || ((n) => String(n || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
      products.forEach(p => {
        if (p && p.id) productsById.set(String(p.id), p);
        if (p && p.name) productsByName.set(normalizeName(p.name), p);
        if (p && p.fingerprint) productsByFingerprint.set(p.fingerprint, p); // 🆕
      });

      if (verbose) console.log(`[HEYS] Локальная база: ${products.length} продуктов`);

      // 2. Собираем все уникальные продукты из всех дней
      const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));
      const missingProducts = new Map(); // product_id or name => { item, dateStr, hasStamp }

      for (const key of keys) {
        try {
          const day = parseStoredValue(localStorage.getItem(key));
          if (!day || !day.meals) continue;
          const dateStr = key.split('_dayv2_').pop();

          for (const meal of day.meals) {
            for (const item of (meal.items || [])) {
              if (isSyntheticEstimatedItem(item)) continue;
              const productId = item.product_id ? String(item.product_id) : null;
              const itemName = String(item.name || '').trim();
              const itemNameNorm = normalizeName(itemName); // 🆕 v4.6.0: Используем normalizeProductName
              const itemFingerprint = item.fingerprint || null; // 🆕 v4.6.0: Fingerprint из штампа

              // Проверяем есть ли в базе (ID → fingerprint → name)
              const foundById = productId && productsById.has(productId);
              const foundByFingerprint = itemFingerprint && productsByFingerprint.has(itemFingerprint); // 🆕
              const foundByName = itemNameNorm && productsByName.has(itemNameNorm);

              if (!foundById && !foundByFingerprint && !foundByName && itemName) {
                const key = itemFingerprint || productId || itemNameNorm; // 🆕 Приоритет: fingerprint → id → name
                if (!missingProducts.has(key)) {
                  missingProducts.set(key, {
                    productId,
                    name: itemName,
                    fingerprint: itemFingerprint, // 🆕 v4.6.0
                    hasStamp: item.kcal100 != null,
                    stampData: item.kcal100 != null ? {
                      kcal100: item.kcal100,
                      protein100: item.protein100 || 0,
                      fat100: item.fat100 || 0,
                      carbs100: item.carbs100 || 0,
                      simple100: item.simple100 || 0,
                      complex100: item.complex100 || 0,
                      badFat100: item.badFat100 || 0,
                      goodFat100: item.goodFat100 || 0,
                      trans100: item.trans100 || 0,
                      fiber100: item.fiber100 || 0,
                      gi: item.gi,
                      harm: item.harm ?? item.harmScore
                    } : null,
                    firstSeenDate: dateStr
                  });
                }
              }
            }
          }
        } catch (e) {
          // Пропускаем битые записи
        }
      }

      if (missingProducts.size === 0) {
        if (verbose) console.log(`[HEYS] ✅ Все продукты найдены в базе (${Date.now() - startTime}ms)`);
        return { recovered: 0, fromStamp: 0, fromShared: 0, missing: [] };
      }

      // 🔇 v4.7.1: Лог отключён

      // 3. Пытаемся восстановить
      const recovered = [];
      let fromStamp = 0;
      let fromShared = 0;
      let skippedDeleted = 0; // 🆕 v4.8.0: Счётчик пропущенных удалённых
      const stillMissing = [];

      // 🪦 FIX v4.9.1: Строим Set удалённых имён из heys_deleted_ids (Store-based, надёжный)
      // HEYS.deletedProducts — localStorage-based, может потеряться при overflow/cleanup.
      // heys_deleted_ids — Store-based, синхронизирован с облаком, НАДЁЖНЫЙ.
      const _tombstonesRecovery = window.HEYS?.store?.get?.('heys_deleted_ids') || [];
      const _deletedNamesSet = new Set();
      const _deletedIdsSet = new Set();
      if (Array.isArray(_tombstonesRecovery)) {
        const _normTS = (n) => String(n || '').toLowerCase().trim();
        _tombstonesRecovery.forEach(t => {
          if (t.name) _deletedNamesSet.add(_normTS(t.name));
          if (t.id) _deletedIdsSet.add(String(t.id));
        });
      }

      // Хелпер: проверка tombstones (оба источника)
      const _isProductTombstoned = (name, productId) => {
        // 1️⃣ heys_deleted_ids (Store — надёжный)
        const _normCheck = (n) => String(n || '').toLowerCase().trim();
        if (name && _deletedNamesSet.has(_normCheck(name))) return true;
        if (productId && _deletedIdsSet.has(String(productId))) return true;
        // 2️⃣ HEYS.deletedProducts (localStorage — fallback)
        if (HEYS.deletedProducts?.isDeleted?.(name)) return true;
        if (HEYS.deletedProducts?.isDeleted?.(productId)) return true;
        return false;
      };

      // 3a. Восстановление из штампов
      for (const [key, data] of missingProducts) {
        // 🆕 v4.9.1: Проверяем ОБА tombstone-источника (heys_deleted_ids + deletedProducts)
        if (_isProductTombstoned(data.name, data.productId)) {
          skippedDeleted++;
          if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт: "${data.name}" (tombstone)`);
          continue;
        }

        if (data.hasStamp && data.stampData) {
          const restoredProduct = {
            id: data.productId || ('restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
            name: data.name,
            fingerprint: data.fingerprint, // 🆕 v4.6.0: Сохраняем fingerprint
            ...data.stampData,
            gi: data.stampData.gi ?? 50,
            harm: data.stampData.harm ?? 0,
            _recoveredFrom: 'stamp',
            _recoveredAt: Date.now()
          };
          recovered.push(restoredProduct);
          productsById.set(String(restoredProduct.id), restoredProduct);
          productsByName.set(normalizeName(data.name), restoredProduct); // 🆕 v4.6.0: normalizeProductName
          if (data.fingerprint) productsByFingerprint.set(data.fingerprint, restoredProduct); // 🆕
          fromStamp++;
          // 🔇 v4.7.1: Лог отключён
        } else {
          stillMissing.push(data);
        }
      }

      // 3b. Пытаемся найти в shared_products (если есть YandexAPI)
      if (tryShared && stillMissing.length > 0 && HEYS.YandexAPI?.rpc) {
        try {
          if (verbose) console.log(`[HEYS] 🌐 Пытаюсь найти ${stillMissing.length} продуктов в shared_products...`);

          const { data: sharedProducts, error } = await HEYS.YandexAPI.rpc('get_shared_products', {});

          if (!error && Array.isArray(sharedProducts)) {
            // 🆕 v4.6.0: Индексация shared по fingerprint, id и name
            const sharedByFingerprint = new Map();
            const sharedById = new Map();
            const sharedByName = new Map();
            sharedProducts.forEach(p => {
              if (p && p.fingerprint) sharedByFingerprint.set(p.fingerprint, p);
              if (p && p.id) sharedById.set(String(p.id), p);
              if (p && p.name) sharedByName.set(normalizeName(p.name), p);
            });

            for (const data of stillMissing) {
              // 🆕 v4.9.1: Проверяем ОБА tombstone-источника (heys_deleted_ids + deletedProducts)
              if (_isProductTombstoned(data.name, data.productId)) {
                skippedDeleted++;
                if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт (shared): "${data.name}" (tombstone)`);
                continue;
              }

              // 🆕 v4.6.0: Поиск: fingerprint → id → name (приоритет)
              let found = null;
              if (data.fingerprint) found = sharedByFingerprint.get(data.fingerprint);
              if (!found && data.productId) found = sharedById.get(data.productId);
              if (!found && data.name) found = sharedByName.get(normalizeName(data.name));

              if (found) {
                // Клонируем из shared
                const cloned = HEYS.products?.addFromShared?.(found);
                if (cloned) {
                  cloned._recoveredFrom = 'shared';
                  cloned._recoveredAt = Date.now();
                  recovered.push(cloned);
                  fromShared++;
                  // 🔇 v4.7.1: Лог отключён
                }
              }
            }
          }
        } catch (e) {
          console.warn('[HEYS] Не удалось загрузить shared_products:', e?.message || e);
        }
      }

      // 4. Сохраняем восстановленные продукты (если были восстановлены из штампов)
      if (fromStamp > 0) {
        const newProducts = [...products, ...recovered.filter(p => p._recoveredFrom === 'stamp')];

        if (HEYS.products?.setAll) {
          HEYS.products.setAll(newProducts);
        } else {
          const lsSet = U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v)));
          lsSet('heys_products', newProducts);
        }

        // Обновляем индекс
        if (HEYS.products?.buildSearchIndex) {
          HEYS.products.buildSearchIndex();
        }
      }

      // 5. Очищаем orphan-трекинг для восстановленных
      recovered.forEach(p => this.remove(p.name));

      // Собираем имена тех, кого так и не нашли
      const finalMissing = [];
      for (const data of stillMissing) {
        const wasRecovered = recovered.some(p =>
          p.name.toLowerCase() === data.name.toLowerCase() ||
          (data.productId && String(p.id) === data.productId)
        );
        if (!wasRecovered) {
          finalMissing.push(data.name);
          // 🔇 v4.7.1: Лог отключён
        }
      }

      const elapsed = Date.now() - startTime;

      // 🆕 v4.8.0: Лог пропущенных удалённых
      if (skippedDeleted > 0 && verbose) {
        console.log(`[HEYS] 🚫 Пропущено ${skippedDeleted} удалённых продуктов (в игнор-листе)`);
      }

      // Диспатчим событие для UI
      if (recovered.length > 0 && typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('heys:orphans-recovered', {
          detail: { recovered: recovered.length, fromStamp, fromShared, missing: finalMissing }
        }));
      }

      return { recovered: recovered.length, fromStamp, fromShared, missing: finalMissing };
    }
  };

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
  // ВАЖНО: Используем HEYS.utils.lsGet/lsSet которые работают с clientId namespace
  function lsGet(k, d) {
    try {
      // Приоритет: HEYS.utils (с namespace) → HEYS.store → localStorage fallback
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        return HEYS.utils.lsGet(k, d);
      }
      if (HEYS.store && typeof HEYS.store.get === 'function') {
        return HEYS.store.get(k, d);
      }
      const v = JSON.parse(localStorage.getItem(k));
      return v == null ? d : v;
    } catch (e) { return d; }
  }

  function lsSet(k, v) {
    try {
      // Приоритет: HEYS.utils (с namespace) → HEYS.store → localStorage fallback
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        return HEYS.utils.lsSet(k, v);
      }
      if (HEYS.store && typeof HEYS.store.set === 'function') {
        return HEYS.store.set(k, v);
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
    if (!p) return { kcal100: 0, carbs100: 0, prot100: 0, fat100: 0, simple100: 0, complex100: 0, bad100: 0, good100: 0, trans100: 0, fiber100: 0, sodium100: 0 };
    if (M.computeDerivedProduct) {
      const d = M.computeDerivedProduct(p);
      return { kcal100: d.kcal100, carbs100: d.carbs100, prot100: +p.protein100 || 0, fat100: d.fat100, simple100: +p.simple100 || 0, complex100: +p.complex100 || 0, bad100: +p.badFat100 || 0, good100: +p.goodFat100 || 0, trans100: +p.trans100 || 0, fiber100: +p.fiber100 || 0, sodium100: +p.sodium100 || 0 };
    }
    const s = +p.simple100 || 0, c = +p.complex100 || 0, pr = +p.protein100 || 0, b = +p.badFat100 || 0, g = +p.goodFat100 || 0, t = +p.trans100 || 0, fib = +p.fiber100 || 0, na = +p.sodium100 || 0;
    const carbs = +p.carbs100 || (s + c);
    const fat = +p.fat100 || (b + g + t);
    const kcal = +p.kcal100 || (4 * (pr + carbs) + 8 * fat);
    return { kcal100: kcal, carbs100: carbs, prot100: pr, fat100: fat, simple100: s, complex100: c, bad100: b, good100: g, trans100: t, fiber100: fib, sodium100: na };
  }

  // === Data Loading ===

  // Базовая загрузка приёмов из localStorage (без ночной логики)
  function loadMealsRaw(ds) {
    const keys = ['heys_dayv2_' + ds, 'heys_day_' + ds, 'day_' + ds + '_meals', 'meals_' + ds, 'food_' + ds];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const v = JSON.parse(raw);
        if (v && Array.isArray(v.meals)) return v.meals;
        if (Array.isArray(v)) return v;
      } catch (e) { }
    }
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

  function normalizeDaySleepMinutes(value) {
    const n = Math.round(+value || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return clamp(n, 0, 360);
  }

  function getNightSleepHours(day) {
    if (!day) return 0;
    const fromWindow = sleepHours(day.sleepStart, day.sleepEnd);
    if (fromWindow > 0) return fromWindow;

    const total = +day.sleepHours || 0;
    const napHours = normalizeDaySleepMinutes(day.daySleepMinutes) / 60;
    return r1(Math.max(0, total - napHours));
  }

  function getTotalSleepHours(day) {
    if (!day) return 0;

    const totalStored = +day.sleepHours || 0;
    const napHours = normalizeDaySleepMinutes(day.daySleepMinutes) / 60;
    const nightHours = getNightSleepHours(day);

    if (nightHours > 0 || napHours > 0) {
      return r1(nightHours + napHours);
    }

    return r1(Math.max(0, totalStored));
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
      const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';

      const scopedKey = clientId
        ? 'heys_' + clientId + '_dayv2_' + dateStr
        : 'heys_dayv2_' + dateStr;

      const raw = localStorage.getItem(scopedKey);
      if (!raw) return null;

      let dayData = null;
      if (raw.startsWith('¤Z¤')) {
        let str = raw.substring(3);
        const patterns = {
          '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
          '¤c¤': '"carbs100"', '¤f¤': '"fat100"'
        };
        for (const [code, pattern] of Object.entries(patterns)) {
          str = str.split(code).join(pattern);
        }
        dayData = JSON.parse(str);
      } else {
        dayData = JSON.parse(raw);
      }

      if (!dayData) return null;

      // Считаем калории и макросы из meals
      let totalKcal = 0, totalProt = 0, totalFat = 0, totalCarbs = 0;
      (dayData.meals || []).forEach(meal => {
        (meal.items || []).forEach(item => {
          const grams = +item.grams || 0;
          if (grams <= 0) return;

          // Ищем в productsMap по названию (lowercase), потом fallback на inline данные item
          const itemName = String(item.name || '').trim();
          const itemNameLower = itemName.toLowerCase();
          let product = itemName ? productsMap.get(itemNameLower) : null;

          // 🔄 Fallback: если не найден в переданном productsMap, проверяем актуальную базу
          // Это решает проблему когда продукт только что добавлен но props ещё не обновились
          if (!product && itemName && global.HEYS?.products?.getAll) {
            const freshProducts = global.HEYS.products.getAll();
            const freshProduct = freshProducts.find(p =>
              String(p.name || '').trim().toLowerCase() === itemNameLower
            );
            if (freshProduct) {
              product = freshProduct;
              // Добавляем в productsMap для следующих итераций (ключ lowercase)
              productsMap.set(itemNameLower, freshProduct);
              // Убираем из orphan если был там
              if (orphanProductsMap.has(itemName)) {
                orphanProductsMap.delete(itemName);
              }
              if (orphanProductsMap.has(itemNameLower)) {
                orphanProductsMap.delete(itemNameLower);
              }
            } else if (freshProducts.length > 0) {
              // DEBUG: Продукт не найден, но база загружена
              // Проверяем возможные причины
              const similar = freshProducts.filter(p => {
                const pName = String(p.name || '').trim().toLowerCase();
                return pName.includes(itemNameLower.slice(0, 10)) ||
                  itemNameLower.includes(pName.slice(0, 10));
              });
              if (similar.length > 0) {
                // Throttle: не логируем чаще раза в минуту для каждого продукта
                const lastLogged = orphanLoggedRecently.get(itemName) || 0;
                if (Date.now() - lastLogged > 60000) {
                  console.warn(`[HEYS] Orphan mismatch: "${itemName}" not found, similar: "${similar[0].name}"`);
                  orphanLoggedRecently.set(itemName, Date.now());
                }
              }
            }
          }

          const src = product || item; // item может иметь inline kcal100, protein100 и т.д.

          // Трекаем orphan-продукты (когда используется штамп вместо базы)
          // НЕ трекаем если база продуктов пуста или синхронизация не завершена
          if (!product && itemName && !isSyntheticEstimatedItem(item)) {
            // Получаем продукты из всех возможных источников
            let freshProducts = global.HEYS?.products?.getAll?.() || [];

            // Fallback: читаем напрямую из localStorage если HEYS.products пуст
            if (freshProducts.length === 0) {
              try {
                // Пробуем разные варианты ключей
                const U = global.HEYS?.utils;
                if (U && U.lsGet) {
                  freshProducts = U.lsGet('heys_products', []) || [];
                } else {
                  // Fallback без clientId-aware функции
                  const clientId = localStorage.getItem('heys_client_current') || '';
                  const keys = [
                    clientId ? `heys_${clientId}_products` : null,
                    'heys_products'
                  ].filter(Boolean);

                  for (const key of keys) {
                    const stored = localStorage.getItem(key);
                    if (stored) {
                      const parsed = JSON.parse(stored);
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        freshProducts = parsed;
                        break;
                      }
                    }
                  }
                }
              } catch (e) { /* ignore */ }
            }

            // 🔧 v3.19.0: Получаем также shared products из кэша
            const sharedProducts = global.HEYS?.cloud?.getCachedSharedProducts?.() || [];

            const hasProductsLoaded = productsMap.size > 0 || freshProducts.length > 0 || sharedProducts.length > 0;

            // Дополнительная проверка: ищем продукт напрямую в свежей базе
            const foundInFresh = freshProducts.find(p =>
              String(p.name || '').trim().toLowerCase() === itemNameLower
            );

            // 🔧 v3.19.0: Также ищем в shared products
            const foundInShared = sharedProducts.find(p =>
              String(p.name || '').trim().toLowerCase() === itemNameLower
            );

            // Трекаем только если база загружена И продукт реально не найден в обеих базах
            if (hasProductsLoaded && !foundInFresh && !foundInShared) {
              trackOrphanProduct(item, dateStr);
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

      const sleepHours = getTotalSleepHours(dayData);

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
   * Рассчитать оптимум для конкретного дня
   * @param {Object} dayData - данные дня
   * @param {Object} profile - профиль пользователя
   * @param {Object} options - { includeNDTE?: boolean }
   * @returns {{ optimum: number, baseOptimum: number|null, deficitPct: number, tdee: number }}
   */
  function getOptimumForDay(dayData, profile, options = {}) {
    const day = dayData || {};
    const prof = profile || getProfile() || {};
    const savedDisplayOptimum = +day.savedDisplayOptimum || 0;
    const dayDeficit = (day.deficitPct !== '' && day.deficitPct != null) ? +day.deficitPct : (prof.deficitPctTarget || 0);

    if (savedDisplayOptimum > 0) {
      return {
        optimum: savedDisplayOptimum,
        baseOptimum: null,
        deficitPct: dayDeficit,
        tdee: 0
      };
    }

    if (global.HEYS?.TDEE?.calculate) {
      const tdeeResult = global.HEYS.TDEE.calculate(day, prof, { lsGet, includeNDTE: options.includeNDTE }) || {};
      const optimum = tdeeResult.optimum || 0;
      const baseExpenditure = tdeeResult.baseExpenditure || 0;
      const deficitPct = (tdeeResult.deficitPct != null) ? tdeeResult.deficitPct : dayDeficit;
      const baseOptimum = baseExpenditure
        ? Math.round(baseExpenditure * (1 + deficitPct / 100))
        : (optimum || 0);
      return {
        optimum,
        baseOptimum,
        deficitPct,
        tdee: tdeeResult.tdee || 0
      };
    }

    if (!prof.weight || !prof.height || !prof.age) {
      return {
        optimum: 2000,
        baseOptimum: 2000,
        deficitPct: dayDeficit,
        tdee: 0
      };
    }

    const bmr = calcBMR(prof);
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const multiplier = activityMultipliers[prof.activityLevel] || 1.55;
    const baseExpenditure = Math.round(bmr * multiplier);
    const optimum = Math.round(baseExpenditure * (1 + dayDeficit / 100));

    return {
      optimum,
      baseOptimum: baseExpenditure,
      deficitPct: dayDeficit,
      tdee: baseExpenditure
    };
  }

  /**
   * Рассчитать оптимумы для набора дат
   * @param {string[]} dateStrs
   * @param {Object} options - { profile?: Object, includeNDTE?: boolean, daysByDate?: Map }
   * @returns {Map<string, { optimum: number, baseOptimum: number|null, deficitPct: number, tdee: number }>}
   */
  function getOptimumForDays(dateStrs, options = {}) {
    const result = new Map();
    const prof = options.profile || getProfile() || {};
    const daysByDate = options.daysByDate || new Map();

    (dateStrs || []).forEach((dateStr) => {
      const dayData = daysByDate.get(dateStr) || loadDay(dateStr);
      result.set(dateStr, getOptimumForDay(dayData, prof, options));
    });

    return result;
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
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        const productsKey = clientId
          ? 'heys_' + clientId + '_products'
          : 'heys_products';
        const productsRaw = localStorage.getItem(productsKey);

        if (productsRaw) {
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
  const TDEE_CACHE = new Map(); // key => { data, timestamp }
  const TDEE_CACHE_TTL = 5 * 60 * 1000; // 5 минут TTL
  let TDEE_CACHE_HITS = 0;
  let TDEE_CACHE_MISSES = 0;

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

      // Загружаем день
      const dayData = lsGet('heys_dayv2_' + dateStr, null);
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

    // Загружаем день
    const dayData = lsGet('heys_dayv2_' + dateStr, null);
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
    if (!dateStr) return;
    const prefix = dateStr + '|';
    Array.from(TDEE_CACHE.keys()).forEach((key) => {
      if (key.startsWith(prefix)) TDEE_CACHE.delete(key);
    });
  }

  /**
   * Очищает весь кэш дней
   */
  function clearDaysCache() {
    DAYS_CACHE.clear();
    TDEE_CACHE.clear();
    TDEE_CACHE_HITS = 0;
    TDEE_CACHE_MISSES = 0;
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
   * Получить статистику TDEE-кэша
   * @returns {{size: number, validEntries: number, expiredEntries: number, hits: number, misses: number, hitRate: number}}
   */
  function getTdeeCacheStats() {
    let validCount = 0;
    const now = Date.now();

    TDEE_CACHE.forEach((cached) => {
      if (now - cached.timestamp < TDEE_CACHE_TTL) {
        validCount++;
      }
    });

    const total = TDEE_CACHE_HITS + TDEE_CACHE_MISSES;
    const hitRate = total > 0 ? Math.round((TDEE_CACHE_HITS / total) * 1000) / 10 : 0;

    return {
      size: TDEE_CACHE.size,
      validEntries: validCount,
      expiredEntries: TDEE_CACHE.size - validCount,
      hits: TDEE_CACHE_HITS,
      misses: TDEE_CACHE_MISSES,
      hitRate
    };
  }

  /**
   * Получить TDEE/optimum для дня с кэшированием
   * @param {string} dateStr
   * @param {Object} profile
   * @param {Object} options - { includeNDTE?: boolean, dayData?: Object }
   * @returns {{ tdee: number, optimum: number, baseExpenditure: number|null, deficitPct: number }}
   */
  function getDayTdee(dateStr, profile, options = {}) {
    if (!dateStr) {
      return { tdee: 0, optimum: 0, baseExpenditure: null, deficitPct: (profile?.deficitPctTarget || 0) };
    }

    const includeNDTE = !!options.includeNDTE;
    const productsSig = options.products ? productsSignature(options.products) : (options.pIndex ? 'pindex' : 'nopindex');
    const cacheKey = dateStr + '|' + (includeNDTE ? '1' : '0') + '|' + productsSig;
    const now = Date.now();

    if (TDEE_CACHE.has(cacheKey)) {
      const cached = TDEE_CACHE.get(cacheKey);
      if (now - cached.timestamp < TDEE_CACHE_TTL) {
        TDEE_CACHE_HITS += 1;
        return cached.data;
      }
    }

    TDEE_CACHE_MISSES += 1;

    const prof = profile || getProfile() || {};
    const dayDataRaw = options.dayData || loadDay(dateStr);
    const dayData = dayDataRaw ? { ...dayDataRaw, date: dayDataRaw.date || dateStr } : dayDataRaw;
    const resolvedPIndex = options.pIndex || (options.products ? buildProductIndex(options.products) : null);

    let result = null;
    if (dayData && global.HEYS?.TDEE?.calculate) {
      const tdeeResult = global.HEYS.TDEE.calculate(dayData, prof, { lsGet, includeNDTE, pIndex: resolvedPIndex }) || {};
      result = {
        tdee: tdeeResult.tdee || 0,
        optimum: tdeeResult.optimum || 0,
        baseExpenditure: tdeeResult.baseExpenditure || null,
        deficitPct: (tdeeResult.deficitPct != null) ? tdeeResult.deficitPct : (prof.deficitPctTarget || 0)
      };
    } else {
      const optInfo = getOptimumForDay(dayData, prof, { includeNDTE });
      result = {
        tdee: optInfo.tdee || optInfo.baseOptimum || optInfo.optimum || 0,
        optimum: optInfo.optimum || 0,
        baseExpenditure: optInfo.baseOptimum || null,
        deficitPct: optInfo.deficitPct || (prof.deficitPctTarget || 0)
      };
    }

    TDEE_CACHE.set(cacheKey, { data: result, timestamp: now });
    return result;
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
      const pIndex = buildProductIndex(productsArr);

      // Проходим по всем дням месяца
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = fmtDate(new Date(year, month, d));
        const dayInfo = getDayData(dateStr, productsMap, profile);

        // Пропускаем дни без данных. Если есть цикл или хотя бы один приём пищи — показываем даже при низких ккал
        const hasCycleDay = dayInfo && dayInfo.cycleDay != null;
        const hasMeals = !!(dayInfo && Array.isArray(dayInfo.meals) && dayInfo.meals.length > 0);
        if (!dayInfo || (dayInfo.kcal < threshold && !hasCycleDay && !hasMeals)) continue;

        // Если день только с cycleDay (без еды) — добавляем минимальную запись
        if (dayInfo.kcal < threshold && hasCycleDay) {
          daysData.set(dateStr, {
            kcal: 0, target: 0, ratio: 0,
            hasTraining: false, trainingTypes: [], trainingMinutes: 0,
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

        // Быт: householdMin × kcalPerMin(2.5, weight)
        const householdMin = dayInfo.householdMin || 0;

        // Тренировки: суммируем ккал из зон z (как на экране дня — только первые 3)
        const trainings = (dayInfo.trainings || []).slice(0, 3); // максимум 3 тренировки

        // Собираем типы тренировок с реальными минутами
        const trainingTypes = trainings
          .filter(t => t && t.z && Array.isArray(t.z) && t.z.some(z => z > 0))
          .map(t => t.type || 'cardio');
        const hasTraining = trainingTypes.length > 0;

        const dayForTdee = { ...dayInfo, date: dayInfo.date || dateStr };
        const tdeeResult = global.HEYS?.TDEE?.calculate
          ? global.HEYS.TDEE.calculate(dayForTdee, profile || {}, { lsGet, includeNDTE: true, pIndex })
          : null;
        const tdee = tdeeResult?.tdee || (bmr + stepsKcal(steps, weight, sex, 0.7) + Math.round(householdMin * kcalPerMin(2.5, weight)));
        // Используем дефицит дня если есть (не пустая строка и не null), иначе из профиля
        const dayDeficit = (tdeeResult?.deficitPct != null)
          ? tdeeResult.deficitPct
          : ((dayInfo.deficitPct !== '' && dayInfo.deficitPct != null) ? +dayInfo.deficitPct : deficitPct);
        const calculatedTarget = tdeeResult?.optimum || Math.round(tdee * (1 + dayDeficit / 100));
        const calculatedBaseTarget = tdeeResult?.baseExpenditure
          ? Math.round(tdeeResult.baseExpenditure * (1 + dayDeficit / 100))
          : calculatedTarget;

        // 🔧 FIX: Используем сохранённую норму с долгом если есть, иначе расчётную
        // Это позволяет показывать корректную линию нормы в sparkline для прошлых дней
        const target = dayInfo.savedDisplayOptimum > 0 ? dayInfo.savedDisplayOptimum : calculatedTarget;

        // 🔧 FIX: Используем сохранённые калории если есть, иначе пересчитанные
        // savedEatenKcal гарантирует точное значение, которое показывалось пользователю в тот день
        const kcal = dayInfo.savedEatenKcal > 0 ? dayInfo.savedEatenKcal : dayInfo.kcal;

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
          baseTarget: calculatedBaseTarget, // 🔧 Базовая норма БЕЗ долга — для расчёта caloricDebt
          spent: tdee, // 🆕 v5.0: Затраты дня (TDEE) для расчета дефицита/профицита
          hasTraining, trainingTypes, trainingMinutes,
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
      }
    } catch (e) {
      // Тихий fallback — activeDays для календаря не критичны,
      // но ошибку стоит залогировать, иначе отладка невозможна.
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

    return daysData;
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
    sleepHours,
    normalizeDaySleepMinutes,
    getNightSleepHours,
    getTotalSleepHours,
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
    getOptimumForDay,
    getOptimumForDays,
    getDayTdee,
    getTdeeCacheStats,
    // 🚀 Lazy-loading API
    loadRecentDays,
    loadDay,
    invalidateDayCache,
    clearDaysCache,
    getDaysCacheStats,
    preloadMonthDays
  };

})(window);
