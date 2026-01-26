// heys_day_core_bundle_v1.js — Day core bundle (utils/hooks/calculations/effects/handlers)
// ⚠️ Manual concat for delivery optimization. Keep order in sync with dependencies.

// === heys_day_utils.js ===
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
        add(name, id, fingerprint) {
            if (!name) return;
            const key = normalizeDeletedKey(name);
            const now = Date.now();

            deletedProductsData.entries[key] = { name, id: id || null, fingerprint: fingerprint || null, deletedAt: now };
            if (id) deletedProductsData.entries[String(id)] = { name, id, fingerprint: fingerprint || null, deletedAt: now, _isIdKey: true };
            if (fingerprint) deletedProductsData.entries[String(fingerprint)] = { name, id: id || null, fingerprint, deletedAt: now, _isFingerprintKey: true };

            saveDeletedProductsData(deletedProductsData);
            console.log(`[HEYS] 🚫 Продукт добавлен в игнор-лист: "${name}"`);
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
            console.log(`[HEYS] ✅ Продукт восстановлен из игнор-листа: "${name}"`);
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
            console.log(`[HEYS] Игнор-лист удалённых продуктов очищен (было ${count})`);
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
    // Отслеживание продуктов, для которых данные берутся из штампа вместо базы
    const orphanProductsMap = new Map(); // name => { name, usedInDays: Set, firstSeen }
    const orphanLoggedRecently = new Map(); // name => timestamp (throttle логов)
    const shouldLogRecovery = () => {
        // 🔇 v4.8.2: Recovery логи только при явном HEYS.debug.recovery = true
        return !!(HEYS && HEYS.debug && HEYS.debug.recovery);
    };
    const logRecovery = (level, ...args) => {
        if (!shouldLogRecovery()) return;
        const fn = console[level] || console.log;
        fn(...args);
    };

    function copySnapshotFields(item, target) {
        if (!item || !target) return target;

        const numericFields = [
            'kcal100', 'protein100', 'carbs100', 'fat100',
            'simple100', 'complex100', 'badFat100', 'goodFat100', 'trans100',
            'fiber100', 'sodium100',
            'omega3_100', 'omega6_100', 'nutrient_density',
            'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
            'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
            'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
        ];

        numericFields.forEach((field) => {
            if (target[field] == null && item[field] != null) {
                target[field] = item[field];
            }
        });

        const itemNova = item.nova_group ?? item.novaGroup;
        if (target.nova_group == null && itemNova != null) {
            target.nova_group = itemNova;
        }
        if (target.novaGroup == null && target.nova_group != null) {
            target.novaGroup = target.nova_group;
        }

        if (target.additives == null && Array.isArray(item.additives) && item.additives.length) {
            target.additives = item.additives;
        }

        const boolFields = ['is_organic', 'is_whole_grain', 'is_fermented', 'is_raw'];
        boolFields.forEach((field) => {
            if (target[field] == null && item[field] != null) {
                target[field] = item[field];
            }
        });

        return target;
    }

    function enrichProductMaybe(product) {
        if (!product) return product;
        const normalized = global.HEYS?.models?.normalizeProductFields
            ? global.HEYS.models.normalizeProductFields(product)
            : product;

        if (global.HEYS?.Harm?.enrichProduct) {
            try {
                return global.HEYS.Harm.enrichProduct(normalized) || normalized;
            } catch {
                return normalized;
            }
        }

        return normalized;
    }

    function trackOrphanProduct(item, dateStr) {
        if (!item || !item.name) return;
        const name = String(item.name).trim();
        if (!name) return;

        if (!orphanProductsMap.has(name)) {
            orphanProductsMap.set(name, {
                name: name,
                // v4.8.0: Store product_id for better matching after rename
                product_id: item.product_id ?? item.productId ?? null,
                usedInDays: new Set([dateStr]),
                firstSeen: Date.now(),
                hasInlineData: item.kcal100 != null
            });
            // 🔇 v4.7.0: Тихий режим — orphan логи отключены (см. HEYS.orphanProducts.list())
        } else {
            const orphanData = orphanProductsMap.get(name);
            orphanData.usedInDays.add(dateStr);
            // v4.8.0: Update product_id if not set
            if (!orphanData.product_id && (item.product_id ?? item.productId)) {
                orphanData.product_id = item.product_id ?? item.productId;
            }
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
        // v4.8.0: Теперь проверяет и по product_id, не только по name
        recalculate() {
            if (!global.HEYS?.products?.getAll) return;

            const products = global.HEYS.products.getAll();
            // Index by name (lowercase)
            const productNames = new Set(
                products.map(p => String(p.name || '').trim().toLowerCase()).filter(Boolean)
            );
            // Index by id
            const productIds = new Set(
                products.map(p => String(p.id ?? p.product_id ?? '').toLowerCase()).filter(Boolean)
            );

            const beforeCount = orphanProductsMap.size;

            // Удаляем из orphan те, что теперь есть в базе (по name ИЛИ по id)
            for (const [name, orphanData] of orphanProductsMap) {
                const nameLower = name.toLowerCase();
                const hasName = productNames.has(nameLower);
                // v4.8.0: Также проверяем product_id если он сохранён в orphan data
                const pid = orphanData.product_id ? String(orphanData.product_id).toLowerCase() : '';
                const hasId = pid && productIds.has(pid);

                if (hasName || hasId) {
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
            const lsGet = HEYS.store?.get
                ? (k, d) => HEYS.store.get(k, d)
                : (U.lsGet || ((k, d) => {
                    try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
                }));
            const lsSet = HEYS.store?.set
                ? (k, v) => HEYS.store.set(k, v)
                : (U.lsSet || ((k, v) => localStorage.setItem(k, JSON.stringify(v))));
            const parseStoredValue = (raw) => {
                if (!raw) return null;
                if (typeof raw === 'object') return raw;
                if (typeof raw !== 'string') return null;
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

            // 🔇 v4.7.0: Debug логи отключены
            const orphanNames = Array.from(orphanProductsMap.keys());

            let checkedItems = 0;
            let foundWithData = 0;
            let alreadyInBase = 0;

            for (const key of keys) {
                try {
                    const storedDay = HEYS.store?.get ? HEYS.store.get(key, null) : null;
                    const day = parseStoredValue(storedDay ?? localStorage.getItem(key));
                    if (!day || !day.meals) continue;

                    for (const meal of day.meals) {
                        for (const item of (meal.items || [])) {
                            checkedItems++;
                            const itemName = String(item.name || '').trim();
                            const itemNameLower = itemName.toLowerCase();
                            if (!itemName) continue;

                            const hasData = item.kcal100 != null;
                            const inBase = productsMap.has(itemNameLower) || (item.product_id && productsById.has(String(item.product_id)));

                            if (hasData) foundWithData++;
                            if (inBase) alreadyInBase++;

                            // 🔇 v4.7.0: Debug логи отключены

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
                                copySnapshotFields(item, restoredProduct);
                                const enriched = enrichProductMaybe(restoredProduct);
                                productsMap.set(itemNameLower, enriched);
                                restored.push(enriched);
                                // 🔇 v4.7.0: Логи восстановления отключены
                            }
                        }
                    }
                } catch (e) {
                    // Пропускаем битые записи
                }
            }

            // 🔇 v4.7.0: Stats лог отключён (см. return.stats)

            if (restored.length > 0) {
                // 🔒 SAFETY: НИКОГДА не перезаписывать если products пустой — это означает corrupted state
                if (products.length === 0) {
                    console.error('[HEYS] ❌ RESTORE BLOCKED: localStorage products пустой! Это признак corruption.');
                    console.error('[HEYS] Для восстановления запусти: await HEYS.YandexAPI.rest("shared_products").then(r => { HEYS.store.set("heys_products", r.data || r); location.reload(); })');
                    return { success: false, count: 0, products: [], error: 'BLOCKED_EMPTY_BASE' };
                }

                // 🔒 SAFETY: Проверяем что НЕ уменьшаем количество продуктов
                const newProducts = Array.from(productsMap.values());
                if (newProducts.length < products.length * 0.5) {
                    console.error(`[HEYS] ❌ RESTORE BLOCKED: Новое кол-во (${newProducts.length}) меньше 50% от текущего (${products.length})`);
                    return { success: false, count: 0, products: [], error: 'BLOCKED_DATA_LOSS' };
                }

                // 🔍 DEBUG: Лог перед сохранением
                console.log('[HEYS] 🔍 RESTORE DEBUG:', {
                    restoredCount: restored.length,
                    newProductsCount: newProducts.length,
                    previousCount: products.length,
                    hasSetAll: !!HEYS.products?.setAll,
                    hasStore: !!HEYS.store?.set,
                    restoredSample: restored.slice(0, 3).map(p => ({ id: p.id, name: p.name }))
                });

                // Используем HEYS.products.setAll для синхронизации с облаком и React state
                if (HEYS.products?.setAll) {
                    console.log('[HEYS] 🔍 Calling HEYS.products.setAll with', newProducts.length, 'products');
                    HEYS.products.setAll(newProducts, { source: 'button-restore-orphans' });

                    // 🔍 DEBUG: Проверяем что сохранилось
                    setTimeout(() => {
                        const afterSave = HEYS.products.getAll();
                        const restoredStillThere = restored.every(rp =>
                            afterSave.some(p => p.id === rp.id || p.name?.toLowerCase() === rp.name?.toLowerCase())
                        );
                        console.log('[HEYS] 🔍 POST-SAVE CHECK:', {
                            savedCount: afterSave.length,
                            restoredStillPresent: restoredStillThere,
                            missingRestored: restoredStillThere ? 0 : restored.filter(rp =>
                                !afterSave.some(p => p.id === rp.id || p.name?.toLowerCase() === rp.name?.toLowerCase())
                            ).map(p => p.name)
                        });
                    }, 500);
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
            const lsGet = HEYS.store?.get
                ? (k, d) => HEYS.store.get(k, d)
                : (U.lsGet || ((k, d) => {
                    try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; }
                }));
            const parseStoredValue = (raw) => {
                if (!raw) return null;
                if (typeof raw === 'object') return raw;
                if (typeof raw !== 'string') return null;
                if (raw.startsWith('¤Z¤') && HEYS.store?.decompress) {
                    return HEYS.store.decompress(raw);
                }
                try { return JSON.parse(raw); } catch { return null; }
            };

            const startTime = Date.now();
            logRecovery('log', '[RECOVERY] 🔄 autoRecoverOnLoad START', { verbose, tryShared });

            // 1. Собираем текущие продукты в Map по id и по name (lowercase)
            // 🔧 FIX: Используем HEYS.products.getAll() который читает правильный scoped ключ
            const products = (HEYS.products?.getAll?.() || lsGet('heys_products', []));
            const productsById = new Map();
            const productsByName = new Map();
            const productsByFingerprint = new Map();
            const normalizeName = HEYS.models?.normalizeProductName || ((n) => String(n || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
            products.forEach(p => {
                if (p && p.id) productsById.set(String(p.id), p);
                if (p && p.name) productsByName.set(normalizeName(p.name), p);
                if (p && p.fingerprint) productsByFingerprint.set(p.fingerprint, p);
            });

            logRecovery('log', `[RECOVERY] 📦 Локальная база: ${products.length} продуктов (byId: ${productsById.size}, byName: ${productsByName.size}, byFP: ${productsByFingerprint.size})`);

            // 2. Собираем все уникальные продукты из всех дней
            const keys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));
            const missingProducts = new Map(); // product_id or name => { item, dateStr, hasStamp }

            for (const key of keys) {
                try {
                    const storedDay = HEYS.store?.get ? HEYS.store.get(key, null) : null;
                    const day = parseStoredValue(storedDay ?? localStorage.getItem(key));
                    if (!day || !day.meals) continue;
                    const dateStr = key.split('_dayv2_').pop();

                    for (const meal of day.meals) {
                        for (const item of (meal.items || [])) {
                            const productId = item.product_id ? String(item.product_id) : null;
                            const itemName = String(item.name || '').trim();
                            const itemNameNorm = normalizeName(itemName);
                            const itemFingerprint = item.fingerprint || null;

                            // Проверяем есть ли в базе
                            const foundById = productId && productsById.has(productId);
                            const foundByFingerprint = itemFingerprint && productsByFingerprint.has(itemFingerprint);
                            const foundByName = itemNameNorm && productsByName.has(itemNameNorm);

                            if (!foundById && !foundByFingerprint && !foundByName && itemName) {
                                const key = itemFingerprint || productId || itemNameNorm;
                                if (!missingProducts.has(key)) {
                                    const stampData = item.kcal100 != null ? {
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
                                    } : null;

                                    if (stampData) {
                                        copySnapshotFields(item, stampData);
                                    }

                                    missingProducts.set(key, {
                                        productId,
                                        name: itemName,
                                        fingerprint: itemFingerprint,
                                        hasStamp: item.kcal100 != null,
                                        stampData: stampData,
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
                logRecovery('log', `[RECOVERY] ✅ Нет orphan-продуктов (проверено ${keys.length} дней)`);
                return { recovered: 0, fromStamp: 0, fromShared: 0, missing: [] };
            }

            logRecovery('warn', `[RECOVERY] ⚠️ Найдено ${missingProducts.size} orphan-продуктов в ${keys.length} днях`);

            // 🔇 v4.7.0: Лог про отсутствующие отключён (см. return.missing));

            // 3. Пытаемся восстановить
            const recovered = [];
            let fromStamp = 0;
            let fromShared = 0;
            let skippedDeleted = 0; // 🆕 v4.8.0: Счётчик пропущенных удалённых
            const stillMissing = [];

            // 3a. Восстановление из штампов
            for (const [key, data] of missingProducts) {
                // 🆕 v4.8.0: Проверяем игнор-лист удалённых продуктов
                if (HEYS.deletedProducts?.isDeleted(data.name) ||
                    HEYS.deletedProducts?.isDeleted(data.productId)) {
                    skippedDeleted++;
                    if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт: "${data.name}"`);
                    continue;
                }

                if (data.hasStamp && data.stampData) {
                    const restoredProduct = {
                        id: data.productId || ('restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
                        name: data.name,
                        fingerprint: data.fingerprint,
                        ...data.stampData,
                        gi: data.stampData.gi ?? 50,
                        harm: data.stampData.harm ?? 0,
                        _recoveredFrom: 'stamp',
                        _recoveredAt: Date.now()
                    };
                    const enriched = enrichProductMaybe(restoredProduct);
                    recovered.push(enriched);
                    productsById.set(String(enriched.id), enriched);
                    productsByName.set(normalizeName(data.name), enriched);
                    if (data.fingerprint) productsByFingerprint.set(data.fingerprint, enriched);
                    fromStamp++;
                    // 🔇 v4.7.0: Лог восстановления отключён
                } else {
                    stillMissing.push(data);
                }
            }

            // 3b. Пытаемся найти в shared_products (если есть YandexAPI)
            if (tryShared && stillMissing.length > 0 && HEYS.YandexAPI?.rpc) {
                try {
                    // 🔇 v4.7.0: verbose логи отключены

                    const { data: sharedProducts, error } = await HEYS.YandexAPI.rpc('get_shared_products', {});

                    if (!error && Array.isArray(sharedProducts)) {
                        // Создаём индекс shared продуктов по id и name
                        const sharedByFingerprint = new Map();
                        const sharedById = new Map();
                        const sharedByName = new Map();
                        sharedProducts.forEach(p => {
                            if (p && p.fingerprint) sharedByFingerprint.set(p.fingerprint, p);
                            if (p && p.id) sharedById.set(String(p.id), p);
                            if (p && p.name) sharedByName.set(normalizeName(p.name), p);
                        });

                        for (const data of stillMissing) {
                            // 🆕 v4.8.0: Проверяем игнор-лист удалённых продуктов
                            if (HEYS.deletedProducts?.isDeleted(data.name) ||
                                HEYS.deletedProducts?.isDeleted(data.productId)) {
                                skippedDeleted++;
                                if (verbose) console.log(`[HEYS] ⏭️ Пропускаю удалённый продукт (shared): "${data.name}"`);
                                continue;
                            }

                            // Ищем сначала по id, потом по имени
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
                                    // 🔇 v4.7.0: Лог отключён
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 🔇 v4.7.0: Только критические ошибки
                }
            }

            // 4. Сохраняем восстановленные продукты (если были восстановлены из штампов)
            logRecovery('log', `[RECOVERY] 📊 Результат: fromStamp=${fromStamp}, fromShared=${fromShared}, stillMissing=${stillMissing.length}`);

            if (fromStamp > 0) {
                // 🔒 SAFETY: Проверяем что products НЕ пустой (признак corruption)
                if (products.length === 0) {
                    console.error('[RECOVERY] ❌ autoRecover BLOCKED: localStorage products пустой! Не сохраняем только orphan-ы.');
                    console.error('[HEYS] Для восстановления запусти: await HEYS.YandexAPI.rest("shared_products").then(r => { HEYS.store.set("heys_products", r.data || r); location.reload(); })');
                    // Но диспатчим событие чтобы UI показал ошибку
                    window.dispatchEvent(new CustomEvent('heys:recovery-blocked', {
                        detail: { reason: 'EMPTY_BASE', recoveredCount: recovered.length }
                    }));
                    // 🐛 FIX v1.1: Было Object.keys(orphans) — orphans не определена, заменено на missingProducts
                    return { success: false, recovered: [], fromStamp: 0, fromShared: 0, stillMissing: Array.from(missingProducts.keys()), error: 'BLOCKED_EMPTY_BASE' };
                }

                const stampRecovered = recovered.filter(p => p._recoveredFrom === 'stamp');
                const newProducts = [...products, ...stampRecovered];

                logRecovery('log', `[RECOVERY] 💾 Сохраняю: было ${products.length}, добавляю ${stampRecovered.length}, итого ${newProducts.length}`);

                if (HEYS.products?.setAll) {
                    logRecovery('log', '[RECOVERY] 🔄 Вызываю HEYS.products.setAll...');
                    HEYS.products.setAll(newProducts, { source: 'orphan-recovery' });

                    // Проверяем сохранение
                    const afterSave = HEYS.products.getAll?.() || [];
                    logRecovery('log', `[RECOVERY] ✅ После setAll: ${afterSave.length} продуктов в базе`);
                } else {
                    logRecovery('warn', '[RECOVERY] ⚠️ HEYS.products.setAll недоступен, использую lsSet');
                    const storeSet = HEYS.store?.set;
                    if (storeSet) {
                        storeSet('heys_products', newProducts);
                    } else if (U.lsSet) {
                        U.lsSet('heys_products', newProducts);
                    } else {
                        localStorage.setItem('heys_products', JSON.stringify(newProducts));
                    }
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
                    (data.fingerprint && p.fingerprint === data.fingerprint) ||
                    (data.productId && String(p.id) === data.productId) ||
                    normalizeName(p.name) === normalizeName(data.name)
                );
                if (!wasRecovered) {
                    finalMissing.push(data.name);
                    // 🔇 v4.7.0: Лог отключён (см. return.missing)
                }
            }

            // 🔇 v4.7.0: Итоговый лог отключён (данные в return)

            const elapsed = Date.now() - startTime;
            logRecovery('log', `[RECOVERY] 🏁 autoRecoverOnLoad END: recovered=${recovered.length}, skippedDeleted=${skippedDeleted}, elapsed=${elapsed}ms`);

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
        const keys = ['heys_dayv2_' + ds, 'heys_day_' + ds, 'day_' + ds + '_meals', 'meals_' + ds, 'food_' + ds];
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
                        }
                        // 🔇 v4.7.0: Orphan mismatch логи отключены для чистоты консоли
                    }

                    const src = product || item; // item может иметь inline kcal100, protein100 и т.д.

                    // Трекаем orphan-продукты (когда используется штамп вместо базы)
                    // НЕ трекаем если база продуктов пуста или синхронизация не завершена
                    if (!product && itemName) {
                        // Получаем продукты из всех возможных источников
                        let freshProducts = global.HEYS?.products?.getAll?.() || [];

                        // Fallback: читаем напрямую из localStorage если HEYS.products пуст
                        if (freshProducts.length === 0) {
                            try {
                                // Пробуем разные варианты ключей
                                const U = global.HEYS?.utils;
                                const storeGet = global.HEYS?.store?.get;
                                if (storeGet) {
                                    freshProducts = storeGet('heys_products', []) || [];
                                } else if (U && U.lsGet) {
                                    freshProducts = U.lsGet('heys_products', []) || [];
                                } else {
                                    // Fallback без clientId-aware функции
                                    const clientId = U?.getCurrentClientId?.()
                                        || (storeGet ? storeGet('heys_client_current', '') : '')
                                        || localStorage.getItem('heys_client_current') || '';
                                    const keys = [
                                        clientId ? `heys_${clientId}_products` : null,
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
    }

    /**
     * Очищает весь кэш дней
     */
    function clearDaysCache() {
        DAYS_CACHE.clear();
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
                const trainingTypes = trainings
                    .filter(t => t && t.z && Array.isArray(t.z) && t.z.some(z => z > 0))
                    .map(t => t.type || 'cardio');
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
                    baseTarget: calculatedTarget, // 🔧 Базовая норма БЕЗ долга — для расчёта caloricDebt
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
        preloadMonthDays
    };

})(window);

// === heys_day_hooks.js ===
// heys_day_hooks.js — React hooks for Day component

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Импортируем утилиты из dayUtils
    const getDayUtils = () => HEYS.dayUtils || {};

    // Хук для централизованного автосохранения дня с учётом гонок и межвкладочной синхронизации
    // Поддерживает ночную логику: приёмы 00:00-02:59 сохраняются под следующий календарный день
    function useDayAutosave({
        day,
        date,
        lsSet,
        lsGetFn,
        keyPrefix = 'heys_dayv2_',
        debounceMs = 500,
        now = () => Date.now(),
        disabled = false, // ЗАЩИТА: не сохранять пока данные не загружены
    }) {
        const utils = getDayUtils();
        // ВАЖНО: Используем динамический вызов чтобы всегда брать актуальный HEYS.utils.lsSet
        // Это нужно для синхронизации с облаком (диспатч события heys:data-saved)
        const lsSetFn = React.useCallback((key, val) => {
            const storeSet = global.HEYS?.store?.set;
            if (storeSet) {
                storeSet(key, val);
                return;
            }
            const actualLsSet = global.HEYS?.utils?.lsSet || lsSet || utils.lsSet;
            if (actualLsSet) {
                actualLsSet(key, val);
            } else {
                // Fallback
                try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { }
            }
        }, [lsSet, utils.lsSet]);
        const lsGetFunc = lsGetFn || utils.lsGet;

        const timerRef = React.useRef(null);
        const prevStoredSnapRef = React.useRef(null);
        const prevDaySnapRef = React.useRef(null);
        const sourceIdRef = React.useRef((global.crypto && typeof global.crypto.randomUUID === 'function') ? global.crypto.randomUUID() : String(Math.random()));
        const channelRef = React.useRef(null);
        const isUnmountedRef = React.useRef(false);

        React.useEffect(() => {
            isUnmountedRef.current = false;
            if ('BroadcastChannel' in global) {
                const channel = new BroadcastChannel('heys_day_updates');
                channelRef.current = channel;
                return () => {
                    isUnmountedRef.current = true;
                    channel.close();
                    channelRef.current = null;
                };
            }
            channelRef.current = null;
        }, []);

        const getKey = React.useCallback((dateStr) => keyPrefix + dateStr, [keyPrefix]);

        const stripMeta = React.useCallback((payload) => {
            if (!payload) return payload;
            const { updatedAt, _sourceId, ...rest } = payload;
            return rest;
        }, []);

        const readExisting = React.useCallback((key) => {
            if (!key) return null;
            try {
                const stored = lsGetFunc ? lsGetFunc(key, null) : null;
                if (stored && typeof stored === 'object') return stored;
            } catch (e) { }
            try {
                const raw = global.HEYS?.store?.get
                    ? global.HEYS.store.get(key, null)
                    : (global.localStorage ? global.localStorage.getItem(key) : null);
                if (!raw) return null;
                if (typeof raw === 'object') return raw;
                return JSON.parse(raw);
            } catch (e) { return null; }
        }, [lsGetFunc]);

        // Очистка фото от base64 данных перед сохранением (экономия localStorage)
        const stripPhotoData = React.useCallback((payload) => {
            if (!payload?.meals) return payload;
            return {
                ...payload,
                meals: payload.meals.map(meal => {
                    if (!meal?.photos?.length) return meal;
                    return {
                        ...meal,
                        photos: meal.photos.map(photo => {
                            // Если есть URL — удаляем data (base64)
                            // Если нет URL (pending) — сохраняем data для offline
                            if (photo.url) {
                                const { data, ...rest } = photo;
                                return rest;
                            }
                            // Pending фото: сохраняем, но ограничиваем размер
                            // Если data > 100KB — не сохраняем в localStorage (только в pending queue)
                            if (photo.data && photo.data.length > 100000) {
                                console.warn('[AUTOSAVE] Photo too large for localStorage, skipping data');
                                const { data, ...rest } = photo;
                                return { ...rest, dataSkipped: true };
                            }
                            return photo;
                        })
                    };
                })
            };
        }, []);

        // Сохранение данных дня под конкретную дату
        const saveToDate = React.useCallback((dateStr, payload) => {
            if (!dateStr || !payload) return;
            const key = getKey(dateStr);
            const current = readExisting(key);
            const incomingUpdatedAt = payload.updatedAt != null ? payload.updatedAt : now();

            if (current && current.updatedAt > incomingUpdatedAt) return;
            if (current && current.updatedAt === incomingUpdatedAt && current._sourceId && current._sourceId > sourceIdRef.current) return;

            // 🔍 DEBUG: Проверка на продукты без нутриентов в meals
            const emptyItems = [];
            (payload.meals || []).forEach((meal, mi) => {
                (meal.items || []).forEach((item, ii) => {
                    if (!item.kcal100 && !item.protein100 && !item.carbs100) {
                        emptyItems.push({
                            mealIndex: mi,
                            itemIndex: ii,
                            name: item.name,
                            id: item.id,
                            product_id: item.product_id,
                            grams: item.grams
                        });
                    }
                });
            });
            if (emptyItems.length > 0) {
                console.warn('⚠️ [AUTOSAVE] Items WITHOUT nutrients being saved:', emptyItems);
                // Попробуем найти продукт в базе для этого item
                emptyItems.forEach(item => {
                    const products = HEYS?.products?.getAll?.() || [];
                    const found = products.find(p =>
                        p.name?.toLowerCase() === item.name?.toLowerCase() ||
                        String(p.id) === String(item.product_id)
                    );
                    if (found) {
                        console.log('🔍 [AUTOSAVE] Found product in DB for empty item:', item.name, {
                            dbHasNutrients: !!(found.kcal100 || found.protein100),
                            dbKcal100: found.kcal100,
                            dbProtein100: found.protein100
                        });
                    } else {
                        console.error('🚨 [AUTOSAVE] Product NOT FOUND in DB for:', item.name);
                    }
                });
            }

            // Очищаем фото от base64 перед сохранением
            const cleanedPayload = stripPhotoData(payload);

            const toStore = {
                ...cleanedPayload,
                date: dateStr,
                schemaVersion: payload.schemaVersion != null ? payload.schemaVersion : 3,
                updatedAt: incomingUpdatedAt,
                _sourceId: sourceIdRef.current,
            };

            try {
                lsSetFn(key, toStore);
                if (channelRef.current && !isUnmountedRef.current) {
                    try {
                        channelRef.current.postMessage({ type: 'day:update', date: dateStr, payload: toStore });
                    } catch (e) { }
                }
            } catch (error) {
                console.error('[AUTOSAVE] localStorage write failed:', error);
            }
        }, [getKey, lsSetFn, now, readExisting, stripPhotoData]);

        const flush = React.useCallback(() => {
            if (disabled || isUnmountedRef.current || !day || !day.date) return;

            const daySnap = JSON.stringify(stripMeta(day));
            if (prevDaySnapRef.current === daySnap) return;

            const updatedAt = day.updatedAt != null ? day.updatedAt : now();

            // Просто сохраняем все приёмы под текущую дату
            // Ночная логика теперь в todayISO() — до 3:00 "сегодня" = вчера
            const payload = {
                ...day,
                updatedAt,
            };
            saveToDate(day.date, payload);
            prevStoredSnapRef.current = JSON.stringify(payload);
            prevDaySnapRef.current = daySnap;
        }, [day, now, saveToDate, stripMeta, disabled, getKey, readExisting]);

        React.useEffect(() => {
            // 🔒 ЗАЩИТА: Не инициализируем prevDaySnapRef до гидратации!
            // Иначе после sync данные изменятся, а ref будет содержать старую версию
            if (disabled) return;
            if (!day || !day.date) return;
            // ✅ FIX: getKey ожидает dateStr, а не объект day
            // Иначе получаем ключ вида "heys_dayv2_[object Object]" и ломаем init снапов.
            const key = getKey(day.date);
            const current = readExisting(key);
            if (current) {
                prevStoredSnapRef.current = JSON.stringify(current);
                prevDaySnapRef.current = JSON.stringify(stripMeta(current));
            } else {
                prevDaySnapRef.current = JSON.stringify(stripMeta(day));
            }
        }, [day && day.date, getKey, readExisting, stripMeta, disabled]);

        React.useEffect(() => {
            if (disabled) return; // ЗАЩИТА: не запускать таймер до гидратации
            if (!day || !day.date) return;

            // 🔒 ЗАЩИТА: Инициализируем prevDaySnapRef при первом включении
            // Это предотвращает ложный save сразу после isHydrated=true
            const daySnap = JSON.stringify(stripMeta(day));

            if (prevDaySnapRef.current === null) {
                // Первый запуск после гидратации — просто запоминаем состояние без save
                prevDaySnapRef.current = daySnap;
                return;
            }

            if (prevDaySnapRef.current === daySnap) return;

            // ☁️ Сразу показать что данные изменились (до debounce)
            // Это запустит анимацию синхронизации в облачном индикаторе
            if (typeof global.dispatchEvent === 'function') {
                global.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key: 'day', type: 'data' } }));
            }

            global.clearTimeout(timerRef.current);
            timerRef.current = global.setTimeout(flush, debounceMs);
            return () => { global.clearTimeout(timerRef.current); };
        }, [day, debounceMs, flush, stripMeta, disabled]);

        React.useEffect(() => {
            return () => {
                global.clearTimeout(timerRef.current);
                if (!disabled) flush(); // ЗАЩИТА: не сохранять при unmount если не гидратировано
            };
        }, [flush, disabled]);

        React.useEffect(() => {
            const onVisChange = () => {
                if (!disabled && global.document.visibilityState !== 'visible') flush();
            };
            global.document.addEventListener('visibilitychange', onVisChange);
            global.addEventListener('pagehide', flush);
            return () => {
                global.document.removeEventListener('visibilitychange', onVisChange);
                global.removeEventListener('pagehide', flush);
            };
        }, [flush]);

        return { flush };
    }

    // Хук для централизованной детекции мобильных устройств с поддержкой ротации
    function useMobileDetection(breakpoint = 768) {
        const [isMobile, setIsMobile] = React.useState(() => {
            if (typeof window === 'undefined') return false;
            return window.innerWidth <= breakpoint;
        });

        React.useEffect(() => {
            if (typeof window === 'undefined' || !window.matchMedia) return;

            const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

            const handleChange = (e) => {
                setIsMobile(e.matches);
            };

            // Начальное значение
            setIsMobile(mediaQuery.matches);

            // Подписка на изменения (поддержка ротации экрана)
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleChange);
                return () => mediaQuery.removeEventListener('change', handleChange);
            } else {
                // Fallback для старых браузеров
                mediaQuery.addListener(handleChange);
                return () => mediaQuery.removeListener(handleChange);
            }
        }, [breakpoint]);

        return isMobile;
    }

    // 🔧 v3.19.2: Глобальный кэш prefetch для предотвращения повторных запросов
    // Сохраняется между размонтированиями компонента
    const globalPrefetchCache = {
        prefetched: new Set(),
        lastPrefetchTime: 0,
        PREFETCH_COOLDOWN: 5000 // 5 секунд между prefetch
    };

    // Хук для Smart Prefetch — предзагрузка данных ±N дней при наличии интернета
    function useSmartPrefetch({
        currentDate,
        daysRange = 7,  // ±7 дней
        enabled = true
    }) {
        // 🔧 v3.19.2: Используем глобальный кэш вместо локального ref
        const prefetchedRef = React.useRef(globalPrefetchCache.prefetched);
        const utils = getDayUtils();
        const lsGet = utils.lsGet || HEYS.utils?.lsGet;

        // Генерация списка дат для prefetch
        const getDatesToPrefetch = React.useCallback((centerDate) => {
            const dates = [];
            const center = new Date(centerDate);

            for (let i = -daysRange; i <= daysRange; i++) {
                const d = new Date(center);
                d.setDate(d.getDate() + i);
                dates.push(d.toISOString().slice(0, 10));
            }

            return dates;
        }, [daysRange]);

        // Prefetch данных через Supabase (если доступно)
        const prefetchFromCloud = React.useCallback(async (dates) => {
            if (!navigator.onLine) return;
            if (!HEYS.cloud?.isAuthenticated?.()) return;

            // 🔧 v3.19.2: Cooldown защита от частых вызовов
            const now = Date.now();
            if (now - globalPrefetchCache.lastPrefetchTime < globalPrefetchCache.PREFETCH_COOLDOWN) {
                return; // Слишком частые вызовы — пропускаем
            }

            const toFetch = dates.filter(d => !prefetchedRef.current.has(d));
            if (toFetch.length === 0) return;

            try {
                // 🔧 v3.19.2: Обновляем время последнего prefetch
                globalPrefetchCache.lastPrefetchTime = now;

                // Пометим как "в процессе" чтобы избежать дублирования
                toFetch.forEach(d => prefetchedRef.current.add(d));

                // Загружаем данные через cloud sync
                if (HEYS.cloud?.fetchDays) {
                    await HEYS.cloud.fetchDays(toFetch);
                }
            } catch (error) {
                // Откатываем пометки при ошибке
                toFetch.forEach(d => prefetchedRef.current.delete(d));
            }
        }, []);

        // Prefetch при смене даты или восстановлении соединения
        React.useEffect(() => {
            if (!enabled || !currentDate) return;

            const dates = getDatesToPrefetch(currentDate);
            prefetchFromCloud(dates);

            // Подписка на восстановление соединения
            const handleOnline = () => {
                prefetchFromCloud(getDatesToPrefetch(currentDate));
            };

            window.addEventListener('online', handleOnline);
            return () => window.removeEventListener('online', handleOnline);
        }, [currentDate, enabled, getDatesToPrefetch, prefetchFromCloud]);

        // Ручной триггер prefetch
        const triggerPrefetch = React.useCallback(() => {
            if (!currentDate) return;
            prefetchedRef.current.clear();
            prefetchFromCloud(getDatesToPrefetch(currentDate));
        }, [currentDate, getDatesToPrefetch, prefetchFromCloud]);

        return { triggerPrefetch };
    }

    // === Exports ===
    HEYS.dayHooks = {
        useDayAutosave,
        useMobileDetection,
        useSmartPrefetch
    };

})(window);

// === heys_day_calculations.js ===
// heys_day_calculations.js — Helper functions for calculations and data processing
// Phase 11 of HEYS Day v12 refactoring
// Extracted calculation and utility functions
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Dependencies - use HEYS.dayUtils if available (optional for this module)
    const U = HEYS.dayUtils || {};
    const M = HEYS.models || {};
    const r0 = (n) => Math.round(n) || 0;
    const r1 = (n) => Math.round(n * 10) / 10;

    /**
     * Calculate day totals from meals
     * @param {Object} day - Day data
     * @param {Object} pIndex - Product index
     * @returns {Object} Day totals
     */
    function calculateDayTotals(day, pIndex) {
        const t = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0 };
        (day.meals || []).forEach(m => {
            const mt = M.mealTotals ? M.mealTotals(m, pIndex) : {};
            Object.keys(t).forEach(k => {
                t[k] += mt[k] || 0;
            });
        });
        Object.keys(t).forEach(k => t[k] = r0(t[k]));

        // Weighted averages для ГИ и вредности по граммам
        let gSum = 0, giSum = 0, harmSum = 0;
        (day.meals || []).forEach(m => {
            (m.items || []).forEach(it => {
                const p = getProductFromItem(it, pIndex);
                if (!p) return;
                const g = +it.grams || 0;
                if (!g) return;
                const gi = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
                const harm = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
                gSum += g;
                if (gi != null) giSum += gi * g;
                if (harm != null) harmSum += harm * g;
            });
        });
        t.gi = gSum ? giSum / gSum : 0;
        t.harm = gSum ? harmSum / gSum : 0;

        return t;
    }

    /**
     * Get product from item (helper function)
     */
    function getProductFromItem(item, pIndex) {
        if (!item || !pIndex) return null;
        const productId = item.product_id || item.id;
        return pIndex[productId] || null;
    }

    /**
     * Compute daily norms from percentages
     * @param {number} optimum - Target calories
     * @param {Object} normPerc - Norm percentages
     * @returns {Object} Absolute norms
     */
    function computeDailyNorms(optimum, normPerc = {}) {
        const K = +optimum || 0;
        const carbPct = +normPerc.carbsPct || 0;
        const protPct = +normPerc.proteinPct || 0;
        const fatPct = Math.max(0, 100 - carbPct - protPct);
        const carbs = K ? (K * carbPct / 100) / 4 : 0;
        const prot = K ? (K * protPct / 100) / 4 : 0;
        const fat = K ? (K * fatPct / 100) / 9 : 0; // 9 ккал/г
        const simplePct = +normPerc.simpleCarbPct || 0;
        const simple = carbs * simplePct / 100;
        const complex = Math.max(0, carbs - simple);
        const badPct = +normPerc.badFatPct || 0;
        const transPct = +normPerc.superbadFatPct || 0;
        const bad = fat * badPct / 100;
        const trans = fat * transPct / 100;
        const good = Math.max(0, fat - bad - trans);
        const fiberPct = +normPerc.fiberPct || 0;
        const fiber = K ? (K / 1000) * fiberPct : 0;
        const gi = +normPerc.giPct || 0;
        const harm = +normPerc.harmPct || 0;
        return { kcal: K, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi, harm };
    }

    /**
     * Calculate day averages (mood, wellbeing, stress, dayScore)
     * @param {Array} meals - Meals array
     * @param {Array} trainings - Trainings array
     * @param {Object} dayData - Day data with morning scores
     * @returns {Object} Averages
     */
    function calculateDayAverages(meals, trainings, dayData) {
        // Утренние оценки из чек-ина (если есть — это стартовая точка дня)
        const morningMood = dayData?.moodMorning && !isNaN(+dayData.moodMorning) ? [+dayData.moodMorning] : [];
        const morningWellbeing = dayData?.wellbeingMorning && !isNaN(+dayData.wellbeingMorning) ? [+dayData.wellbeingMorning] : [];
        const morningStress = dayData?.stressMorning && !isNaN(+dayData.stressMorning) ? [+dayData.stressMorning] : [];

        // Собираем все оценки из приёмов пищи
        const mealMoods = (meals || []).filter(m => m.mood && !isNaN(+m.mood)).map(m => +m.mood);
        const mealWellbeing = (meals || []).filter(m => m.wellbeing && !isNaN(+m.wellbeing)).map(m => +m.wellbeing);
        const mealStress = (meals || []).filter(m => m.stress && !isNaN(+m.stress)).map(m => +m.stress);

        // Собираем оценки из тренировок (фильтруем только РЕАЛЬНЫЕ тренировки)
        const realTrainings = (trainings || []).filter(t => {
            const hasTime = t.time && t.time.trim() !== '';
            const hasMinutes = t.z && Array.isArray(t.z) && t.z.some(m => m > 0);
            return hasTime || hasMinutes;
        });
        const trainingMoods = realTrainings.filter(t => t.mood && !isNaN(+t.mood)).map(t => +t.mood);
        const trainingWellbeing = realTrainings.filter(t => t.wellbeing && !isNaN(+t.wellbeing)).map(t => +t.wellbeing);
        const trainingStress = realTrainings.filter(t => t.stress && !isNaN(+t.stress)).map(t => +t.stress);

        // Объединяем все оценки: утро + приёмы пищи + тренировки
        const allMoods = [...morningMood, ...mealMoods, ...trainingMoods];
        const allWellbeing = [...morningWellbeing, ...mealWellbeing, ...trainingWellbeing];
        const allStress = [...morningStress, ...mealStress, ...trainingStress];

        const moodAvg = allMoods.length ? r1(allMoods.reduce((sum, val) => sum + val, 0) / allMoods.length) : '';
        const wellbeingAvg = allWellbeing.length ? r1(allWellbeing.reduce((sum, val) => sum + val, 0) / allWellbeing.length) : '';
        const stressAvg = allStress.length ? r1(allStress.reduce((sum, val) => sum + val, 0) / allStress.length) : '';

        // Автоматический расчёт dayScore
        // Формула: (mood + wellbeing + (10 - stress)) / 3, округлено до целого
        let dayScore = '';
        if (moodAvg !== '' || wellbeingAvg !== '' || stressAvg !== '') {
            const m = moodAvg !== '' ? +moodAvg : 5;
            const w = wellbeingAvg !== '' ? +wellbeingAvg : 5;
            const s = stressAvg !== '' ? +stressAvg : 5;
            // stress инвертируем: низкий стресс = хорошо
            dayScore = Math.round((m + w + (10 - s)) / 3);
        }

        return { moodAvg, wellbeingAvg, stressAvg, dayScore };
    }

    /**
     * Normalize trainings data (migrate quality/feelAfter to mood/wellbeing)
     * @param {Array} trainings - Trainings array
     * @returns {Array} Normalized trainings
     */
    function normalizeTrainings(trainings = []) {
        return trainings.map((t = {}) => {
            if (t.quality !== undefined || t.feelAfter !== undefined) {
                const { quality, feelAfter, ...rest } = t;
                return {
                    ...rest,
                    mood: rest.mood ?? quality ?? 5,
                    wellbeing: rest.wellbeing ?? feelAfter ?? 5,
                    stress: rest.stress ?? 5
                };
            }
            return t;
        });
    }

    /**
     * Clean empty trainings (all zones = 0)
     * @param {Array} trainings - Trainings array
     * @returns {Array} Filtered trainings
     */
    function cleanEmptyTrainings(trainings) {
        if (!Array.isArray(trainings)) return [];
        return trainings.filter(t => t && t.z && t.z.some(z => z > 0));
    }

    /**
     * Sort meals by time (latest first)
     * @param {Array} meals - Meals array
     * @returns {Array} Sorted meals
     */
    function sortMealsByTime(meals) {
        if (!meals || meals.length <= 1) return meals;

        return [...meals].sort((a, b) => {
            const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
            const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;

            // Если оба без времени — сохраняем порядок
            if (timeA === null && timeB === null) return 0;
            // Без времени — в конец
            if (timeA === null) return 1;
            if (timeB === null) return -1;

            // Обратный порядок: последние наверху
            return timeB - timeA;
        });
    }

    /**
     * Parse time string to minutes
     * @param {string} timeStr - Time string (HH:MM)
     * @returns {number} Minutes since midnight
     */
    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    }

    /**
     * Format time from minutes
     * @param {number} minutes - Minutes since midnight
     * @returns {string} Time string (HH:MM)
     */
    function formatMinutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Export module
    HEYS.dayCalculations = {
        calculateDayTotals,
        computeDailyNorms,
        calculateDayAverages,
        normalizeTrainings,
        cleanEmptyTrainings,
        sortMealsByTime,
        parseTimeToMinutes,
        formatMinutesToTime,
        getProductFromItem
    };

})(window);

// === heys_day_effects.js ===
// heys_day_effects.js — DayTab side effects (sync, events)
// Phase 12 of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};

    function getReact() {
        const React = global.React;
        if (!React) {
            throw new Error('[heys_day_effects] React is required. Ensure React is loaded before heys_day_effects.js');
        }
        return React;
    }

    function useDaySyncEffects(deps) {
        const React = getReact();
        const {
            date,
            setIsHydrated,
            setDay,
            getProfile,
            ensureDay,
            loadMealsForDate,
            lsGet,
            lsSet,
            normalizeTrainings,
            cleanEmptyTrainings,
            prevDateRef,
            lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef,
            isSyncingRef
        } = deps || {};

        // Подгружать данные дня из облака при смене даты
        React.useEffect(() => {
            let cancelled = false;

            // 🔴 КРИТИЧНО: Сохранить текущие данные ПЕРЕД сменой даты!
            // Иначе несохранённые изменения потеряются при переходе на другую дату
            const dateActuallyChanged = prevDateRef.current !== date;
            if (dateActuallyChanged && HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
                console.info(`[HEYS] 📅 Смена даты: ${prevDateRef.current} → ${date}, сохраняем предыдущий день...`);
                // Flush данные предыдущего дня синхронно
                HEYS.Day.requestFlush();
            }
            prevDateRef.current = date;

            setIsHydrated(false); // Сброс: данные ещё не загружены для новой даты
            const clientId = global.HEYS?.utils?.getCurrentClientId?.()
                || global.HEYS?.currentClientId
                || (global.HEYS?.store?.get ? global.HEYS.store.get('heys_client_current', '') : '')
                || localStorage.getItem('heys_client_current') || '';
            const cloud = global.HEYS && global.HEYS.cloud;

            // Сбрасываем ref при смене даты
            lastLoadedUpdatedAtRef.current = 0;

            const doLocal = () => {
                if (cancelled) return;
                const profNow = getProfile();
                const key = 'heys_dayv2_' + date;
                const v = lsGet(key, null);
                const hasStoredData = !!(v && typeof v === 'object' && (
                    v.date ||
                    (Array.isArray(v.meals) && v.meals.length > 0) ||
                    (Array.isArray(v.trainings) && v.trainings.length > 0) ||
                    v.updatedAt || v.waterMl || v.steps || v.weightMorning
                ));

                // � DEBUG v59 → v4.8.2: Отключено — слишком много логов при навигации
                // console.log(`[DAY LOAD] date=${date}, key=${key}, hasData=${hasStoredData}, meals=${v?.meals?.length || 0}`);

                if (hasStoredData) {
                    const normalizedDay = v?.date ? v : { ...v, date };
                    // ЗАЩИТА: не перезаписываем более свежие данные
                    // handleDayUpdated может уже загрузить sync данные
                    if (normalizedDay.updatedAt && lastLoadedUpdatedAtRef.current > 0 && normalizedDay.updatedAt < lastLoadedUpdatedAtRef.current) {
                        return;
                    }
                    lastLoadedUpdatedAtRef.current = normalizedDay.updatedAt || Date.now();

                    // Мигрируем оценки тренировок и очищаем пустые (только в памяти, НЕ сохраняем)
                    // Миграция сохранится автоматически при следующем реальном изменении данных
                    const normalizedTrainings = normalizeTrainings(normalizedDay.trainings);
                    const cleanedTrainings = cleanEmptyTrainings(normalizedTrainings);
                    const cleanedDay = {
                        ...normalizedDay,
                        trainings: cleanedTrainings
                    };
                    // 🔧 FIX: если meals пустые, пробуем подхватить legacy-ключи (heys_day_*, meals_*)
                    if (!Array.isArray(cleanedDay.meals) || cleanedDay.meals.length === 0) {
                        const legacyMeals = loadMealsForDate(date) || [];
                        if (legacyMeals.length > 0) {
                            cleanedDay.meals = legacyMeals;
                        }
                    }
                    // 🔒 НЕ сохраняем миграцию сразу — это вызывает DAY SAVE и мерцание UI
                    // Данные сохранятся при следующем изменении (добавление еды, воды и т.д.)
                    const newDay = ensureDay(cleanedDay, profNow);
                    // 🔒 Оптимизация: не вызываем setDay если данные идентичны (предотвращает мерцание)
                    setDay(prevDay => {
                        // Сравниваем по КОНТЕНТУ, а не по метаданным (updatedAt может отличаться между локальной и облачной версией)
                        if (prevDay && prevDay.date === newDay.date) {
                            const prevMealsJson = JSON.stringify(prevDay.meals || []);
                            const newMealsJson = JSON.stringify(newDay.meals || []);
                            const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
                            const newTrainingsJson = JSON.stringify(newDay.trainings || []);
                            const isSameContent =
                                prevMealsJson === newMealsJson &&
                                prevTrainingsJson === newTrainingsJson &&
                                prevDay.waterMl === newDay.waterMl &&
                                prevDay.steps === newDay.steps &&
                                prevDay.weightMorning === newDay.weightMorning &&
                                prevDay.sleepStart === newDay.sleepStart &&
                                prevDay.sleepEnd === newDay.sleepEnd;
                            if (isSameContent) {
                                // Данные не изменились — оставляем предыдущий объект (без ре-рендера)
                                return prevDay;
                            }
                        }
                        return newDay;
                    });
                } else {
                    // create a clean default day for the selected date (don't inherit previous trainings)
                    const defaultDay = ensureDay({
                        date: date,
                        meals: (loadMealsForDate(date) || []),
                        trainings: [],
                        // Явно устанавливаем пустые значения для полей сна и оценки
                        sleepStart: '',
                        sleepEnd: '',
                        sleepQuality: '',
                        sleepNote: '',
                        dayScore: '',
                        moodAvg: '',
                        wellbeingAvg: '',
                        stressAvg: '',
                        dayComment: ''
                    }, profNow);
                    setDay(defaultDay);
                }

                // ВАЖНО: данные загружены, теперь можно сохранять
                // Продукты приходят через props.products, не нужно обновлять локально
                setIsHydrated(true);
            };

            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
                if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true) {
                    // 🔒 Блокируем события heys:day-updated во время синхронизации
                    // Это предотвращает множественные setDay() и мерцание UI
                    isSyncingRef.current = true;
                    cloud.bootstrapClientSync(clientId)
                        .then(() => {
                            // После sync localStorage уже обновлён событиями heys:day-updated
                            // Просто загружаем финальные данные (без задержки!)
                            isSyncingRef.current = false;
                            doLocal();
                        })
                        .catch((err) => {
                            // Нет сети или ошибка — загружаем из локального кэша
                            isSyncingRef.current = false;
                            console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
                            doLocal();
                        });
                } else {
                    doLocal();
                }
            } else {
                doLocal();
            }

            return () => {
                cancelled = true;
                isSyncingRef.current = false; // Сброс при смене даты или размонтировании
            };
        }, [date]);

        // Слушаем событие обновления данных дня (от Morning Check-in или внешних изменений)
        // НЕ слушаем heysSyncCompleted — это вызывает бесконечный цикл при каждом сохранении
        // 🔧 v3.19.1: Защита от дублирующихся событий fetchDays
        const lastProcessedEventRef = React.useRef({ date: null, source: null, timestamp: 0 });

        React.useEffect(() => {
            const handleDayUpdated = (e) => {
                const updatedDate = e.detail?.date;
                const source = e.detail?.source || 'unknown';
                const forceReload = e.detail?.forceReload || false;

                // 🔧 v3.19.1: Дедупликация событий — игнорируем одинаковые события в течение 100мс
                const now = Date.now();
                const last = lastProcessedEventRef.current;
                if (source === 'fetchDays' &&
                    last.date === updatedDate &&
                    last.source === source &&
                    now - last.timestamp < 100) {
                    return; // Пропускаем дубликат
                }
                lastProcessedEventRef.current = { date: updatedDate, source, timestamp: now };

                // 🔒 Игнорируем события во время начальной синхронизации
                // doLocal() в конце синхронизации загрузит все финальные данные
                if (isSyncingRef.current && (source === 'cloud' || source === 'merge')) {
                    return;
                }

                // Блокируем ВСЕ внешние обновления на 3 секунды после локального изменения
                // Но НЕ блокируем forceReload (от шагов модалки)
                if (!forceReload && Date.now() < blockCloudUpdatesUntilRef.current) {
                    return;
                }

                // Если date не указан или совпадает с текущим — перезагружаем
                if (!updatedDate || updatedDate === date) {
                    const profNow = getProfile();
                    const key = 'heys_dayv2_' + date;
                    const v = lsGet(key, null);
                    const hasStoredData = !!(v && typeof v === 'object' && (
                        v.date ||
                        (Array.isArray(v.meals) && v.meals.length > 0) ||
                        (Array.isArray(v.trainings) && v.trainings.length > 0) ||
                        v.updatedAt || v.waterMl || v.steps || v.weightMorning
                    ));
                    if (hasStoredData) {
                        const normalizedDay = v?.date ? v : { ...v, date };
                        // Проверяем: данные из storage новее текущих?
                        const storageUpdatedAt = normalizedDay.updatedAt || 0;
                        const currentUpdatedAt = lastLoadedUpdatedAtRef.current || 0;

                        // Двойная защита: по timestamp И по количеству meals
                        // Не откатываем если в storage меньше meals чем в текущем state
                        const storageMealsCount = (normalizedDay.meals || []).length;

                        // Пропускаем проверку timestamp если forceReload
                        // ВАЖНО: используем < вместо <= чтобы обрабатывать первую загрузку (когда оба = 0)
                        if (!forceReload && storageUpdatedAt < currentUpdatedAt) {
                            return; // Не перезаписываем более новые данные старыми
                        }

                        // Обновляем ref чтобы doLocal() не перезаписал более старыми данными
                        lastLoadedUpdatedAtRef.current = storageUpdatedAt;
                        const migratedTrainings = normalizeTrainings(normalizedDay.trainings);
                        const cleanedTrainings = cleanEmptyTrainings(migratedTrainings);
                        const migratedDay = { ...normalizedDay, trainings: cleanedTrainings };
                        // 🔧 FIX: если meals пустые, пробуем подхватить legacy-ключи (heys_day_*, meals_*)
                        if (!Array.isArray(migratedDay.meals) || migratedDay.meals.length === 0) {
                            const legacyMeals = loadMealsForDate(date) || [];
                            if (legacyMeals.length > 0) {
                                migratedDay.meals = legacyMeals;
                            }
                        }
                        // Сохраняем миграцию ТОЛЬКО если данные изменились
                        const trainingsChanged = JSON.stringify(normalizedDay.trainings) !== JSON.stringify(cleanedTrainings);
                        if (trainingsChanged) {
                            lsSet(key, migratedDay);
                        }
                        const newDay = ensureDay(migratedDay, profNow);

                        // 🔒 Оптимизация: не вызываем setDay если контент идентичен (предотвращает мерцание)
                        setDay(prevDay => {
                            if (prevDay && prevDay.date === newDay.date) {
                                const prevMealsJson = JSON.stringify(prevDay.meals || []);
                                const newMealsJson = JSON.stringify(newDay.meals || []);
                                const prevTrainingsJson = JSON.stringify(prevDay.trainings || []);
                                const newTrainingsJson = JSON.stringify(newDay.trainings || []);
                                const prevSupplementsPlanned = JSON.stringify(prevDay.supplementsPlanned || []);
                                const newSupplementsPlanned = JSON.stringify(newDay.supplementsPlanned || []);
                                const prevSupplementsTaken = JSON.stringify(prevDay.supplementsTaken || []);
                                const newSupplementsTaken = JSON.stringify(newDay.supplementsTaken || []);

                                const isSameContent =
                                    prevMealsJson === newMealsJson &&
                                    prevTrainingsJson === newTrainingsJson &&
                                    prevDay.waterMl === newDay.waterMl &&
                                    prevDay.steps === newDay.steps &&
                                    prevDay.weightMorning === newDay.weightMorning &&
                                    // Утренние оценки из чек-ина
                                    prevDay.moodMorning === newDay.moodMorning &&
                                    prevDay.wellbeingMorning === newDay.wellbeingMorning &&
                                    prevDay.stressMorning === newDay.stressMorning &&
                                    // Витамины/добавки
                                    prevSupplementsPlanned === newSupplementsPlanned &&
                                    prevSupplementsTaken === newSupplementsTaken;

                                if (isSameContent) {
                                    // DEBUG (отключено): console.log('[HEYS] 📅 handleDayUpdated SKIPPED — same content');
                                    return prevDay;
                                }
                            }
                            return newDay;
                        });
                    }
                }
            };

            // Слушаем явное событие обновления дня (от StepModal, Morning Check-in)
            global.addEventListener('heys:day-updated', handleDayUpdated);

            return () => {
                global.removeEventListener('heys:day-updated', handleDayUpdated);
            };
        }, [date]);
    }

    function useDayBootEffects() {
        const React = getReact();
        // Twemoji: reparse emoji after render
        React.useEffect(() => {
            if (global.scheduleTwemojiParse) global.scheduleTwemojiParse();
        });

        // Трекинг просмотра дня (только один раз)
        React.useEffect(() => {
            if (global.HEYS && global.HEYS.analytics) {
                global.HEYS.analytics.trackDataOperation('day-viewed');
            }
        }, []);
    }

    function useDayCurrentMinuteEffect(deps) {
        const React = getReact();
        const { setCurrentMinute } = deps || {};
        React.useEffect(() => {
            const intervalId = setInterval(() => {
                setCurrentMinute(Math.floor(Date.now() / 60000));
            }, 60000); // Обновляем каждую минуту
            return () => clearInterval(intervalId);
        }, []);
    }

    function useDayThemeEffect(deps) {
        const React = getReact();
        const { theme, resolvedTheme } = deps || {};
        React.useEffect(() => {
            document.documentElement.setAttribute('data-theme', resolvedTheme);
            try {
                const U = global.HEYS?.utils || {};
                if (global.HEYS?.store?.set) {
                    global.HEYS.store.set('heys_theme', theme);
                } else if (U.lsSet) {
                    U.lsSet('heys_theme', theme);
                } else {
                    localStorage.setItem('heys_theme', theme);
                }
            } catch (e) {
                // QuotaExceeded — игнорируем, тема применится через data-theme
            }

            if (theme !== 'auto') return;

            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = () => {
                document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
            };
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        }, [theme, resolvedTheme]);
    }

    function useDayExportsEffects(deps) {
        const React = getReact();
        const {
            currentStreak,
            addMeal,
            addWater,
            addProductToMeal,
            day,
            pIndex,
            getMealType,
            getMealQualityScore,
            safeMeals
        } = deps || {};

        // Экспорт getStreak для использования в gamification модуле
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.getStreak = () => currentStreak;

            // Dispatch событие чтобы GamificationBar мог обновить streak
            window.dispatchEvent(new CustomEvent('heysDayStreakUpdated', {
                detail: { streak: currentStreak }
            }));

            // Confetti при streak 7, 14, 30, 100
            if ([7, 14, 30, 100].includes(currentStreak) && HEYS.game && HEYS.game.celebrate) {
                HEYS.game.celebrate();
            }

            return () => {
                if (HEYS.Day && HEYS.Day.getStreak) {
                    delete HEYS.Day.getStreak;
                }
            };
        }, [currentStreak]);

        // Экспорт addMeal для PWA shortcuts и внешних вызовов
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addMeal = addMeal;
            return () => {
                if (HEYS.Day && HEYS.Day.addMeal === addMeal) {
                    delete HEYS.Day.addMeal;
                }
            };
        }, [addMeal]);

        // Экспорт addWater для внешних вызовов (например, FAB на вкладке Виджеты)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addWater = addWater;
            return () => {
                if (HEYS.Day && HEYS.Day.addWater === addWater) {
                    delete HEYS.Day.addWater;
                }
            };
        }, [addWater]);

        // Экспорт addProductToMeal как публичный API
        // Позволяет добавлять продукт в приём извне: HEYS.Day.addProductToMeal(mealIndex, product, grams?)
        React.useEffect(() => {
            HEYS.Day = HEYS.Day || {};
            HEYS.Day.addProductToMeal = (mi, product, grams) => {
                // Валидация
                if (typeof mi !== 'number' || mi < 0) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid meal index:', mi);
                    return false;
                }
                if (!product || !product.name) {
                    console.warn('[HEYS.Day.addProductToMeal] Invalid product:', product);
                    return false;
                }
                // Добавляем продукт
                const productWithGrams = grams ? { ...product, grams } : product;
                addProductToMeal(mi, productWithGrams);
                return true;
            };
            return () => {
                if (HEYS.Day) delete HEYS.Day.addProductToMeal;
            };
        }, [addProductToMeal]);

        // Экспорт getMealQualityScore и getMealType как публичный API для advice модуля
        // getMealTypeByMeal — wrapper с текущим контекстом (meals и pIndex)
        React.useEffect(() => {
            HEYS.getMealQualityScore = getMealQualityScore;
            // Wrapper: принимает meal объект, находит его индекс и вызывает с полным контекстом
            HEYS.getMealType = (meal) => {
                if (!meal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                const allMeals = day.meals || [];
                // Если передали только time (string), находим meal по времени
                if (typeof meal === 'string') {
                    const foundMeal = allMeals.find(m => m.time === meal);
                    if (!foundMeal) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                    const idx = allMeals.indexOf(foundMeal);
                    return getMealType(idx, foundMeal, allMeals, pIndex);
                }
                // Если передали meal объект
                const idx = allMeals.findIndex(m => m.id === meal.id || m.time === meal.time);
                if (idx === -1) return { type: 'snack', name: 'Перекус', icon: '🍎' };
                return getMealType(idx, meal, allMeals, pIndex);
            };
            return () => {
                delete HEYS.getMealQualityScore;
                delete HEYS.getMealType;
            };
        }, [safeMeals, pIndex]);
    }

    HEYS.dayEffects = {
        useDaySyncEffects,
        useDayBootEffects,
        useDayCurrentMinuteEffect,
        useDayThemeEffect,
        useDayExportsEffects
    };

})(window);

// === heys_day_training_handlers.js ===
// heys_day_training_handlers.js — Training picker + zone/household popups handlers
// Phase 10.2 of HEYS Day v12 refactoring
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    if (!HEYS.dayUtils) {
        throw new Error('[heys_day_training_handlers] HEYS.dayUtils is required. Ensure heys_day_utils.js is loaded first.');
    }

    const { pad2, wheelIndexToHour, hourToWheelIndex } = HEYS.dayUtils;

    function createTrainingHandlers(deps) {
        const {
            day,
            date,
            TR,
            zoneMinutesValues,
            visibleTrainings,
            setVisibleTrainings,
            updateTraining,
            lsGet,
            haptic,
            getSmartPopupPosition,
            setZonePickerTarget,
            zonePickerTarget,
            setPendingZoneMinutes,
            setShowZonePicker,
            setZoneFormulaPopup,
            setHouseholdFormulaPopup,
            setShowTrainingPicker,
            setTrainingPickerStep,
            setEditingTrainingIndex,
            setPendingTrainingTime,
            setPendingTrainingType,
            setPendingTrainingZones,
            setPendingTrainingQuality,
            setPendingTrainingFeelAfter,
            setPendingTrainingComment,
            setDay,
            trainingPickerStep,
            pendingTrainingTime,
            pendingTrainingZones,
            pendingTrainingType,
            pendingTrainingQuality,
            pendingTrainingFeelAfter,
            pendingTrainingComment,
            editingTrainingIndex
        } = deps;

        const hapticFn = typeof haptic === 'function' ? haptic : HEYS.dayUtils.haptic || (() => { });

        const zoneNames = ['Восстановление', 'Жиросжигание', 'Аэробная', 'Анаэробная'];
        const POPUP_WIDTH = 240;
        const POPUP_HEIGHT = 220;

        function openZonePicker(trainingIndex, zoneIndex) {
            const T = TR[trainingIndex] || { z: [0, 0, 0, 0] };
            const currentMinutes = +T.z[zoneIndex] || 0;
            setZonePickerTarget({ trainingIndex, zoneIndex });
            setPendingZoneMinutes(currentMinutes);
            setShowZonePicker(true);
        }

        function confirmZonePicker() {
            if (zonePickerTarget) {
                updateTraining(zonePickerTarget.trainingIndex, zonePickerTarget.zoneIndex, pendingZoneMinutes);
            }
            setShowZonePicker(false);
            setZonePickerTarget(null);
        }

        function cancelZonePicker() {
            setShowZonePicker(false);
            setZonePickerTarget(null);
        }

        function showZoneFormula(trainingIndex, zoneIndex, event) {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const pos = getSmartPopupPosition(
                rect.left + rect.width / 2,
                rect.bottom,
                POPUP_WIDTH,
                POPUP_HEIGHT,
                { offset: 8 }
            );
            setZoneFormulaPopup({
                ti: trainingIndex,
                zi: zoneIndex,
                left: pos.left,
                top: pos.top,
                showAbove: pos.showAbove
            });
        }

        function closeZoneFormula() {
            setZoneFormulaPopup(null);
        }

        function showHouseholdFormula(householdIndex, event) {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            const pos = getSmartPopupPosition(
                rect.left + rect.width / 2,
                rect.bottom,
                POPUP_WIDTH,
                POPUP_HEIGHT,
                { offset: 8 }
            );
            setHouseholdFormulaPopup({
                hi: householdIndex,
                left: pos.left,
                top: pos.top,
                showAbove: pos.showAbove
            });
        }

        function closeHouseholdFormula() {
            setHouseholdFormulaPopup(null);
        }

        function openTrainingPicker(trainingIndex) {
            if (HEYS.TrainingStep?.show) {
                HEYS.TrainingStep.show({
                    dateKey: date,
                    trainingIndex,
                    onComplete: () => {
                        const savedDay = lsGet(`heys_dayv2_${date}`, {});
                        const savedTrainings = savedDay.trainings || [];
                        setDay(prev => ({
                            ...prev,
                            trainings: savedTrainings,
                            updatedAt: Date.now()
                        }));
                        const validCount = savedTrainings.filter(t => t && t.z && t.z.some(v => +v > 0)).length;
                        setVisibleTrainings(validCount);
                    }
                });
                return;
            }

            const now = new Date();
            const T = TR[trainingIndex] || { z: [0, 0, 0, 0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' };

            if (T.time) {
                const [h, m] = T.time.split(':').map(Number);
                setPendingTrainingTime({ hours: hourToWheelIndex(h || 10), minutes: m || 0 });
            } else {
                setPendingTrainingTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
            }

            setPendingTrainingType(T.type || 'cardio');

            const zones = T.z || [0, 0, 0, 0];
            const zoneIndices = zones.map(minutes => {
                const idx = zoneMinutesValues.indexOf(String(minutes));
                return idx >= 0 ? idx : 0;
            });
            setPendingTrainingZones(zoneIndices);

            setPendingTrainingQuality(T.quality || 0);
            setPendingTrainingFeelAfter(T.feelAfter || 0);
            setPendingTrainingComment(T.comment || '');

            setTrainingPickerStep(1);
            setEditingTrainingIndex(trainingIndex);
            setShowTrainingPicker(true);
        }

        function confirmTrainingPicker() {
            if (trainingPickerStep === 1) {
                setTrainingPickerStep(2);
                return;
            }

            if (trainingPickerStep === 2) {
                const totalMinutes = pendingTrainingZones.reduce(
                    (sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0),
                    0
                );
                if (totalMinutes === 0) {
                    hapticFn('error');
                    const zonesSection = document.querySelector('.training-zones-section');
                    if (zonesSection) {
                        zonesSection.classList.add('shake');
                        setTimeout(() => zonesSection.classList.remove('shake'), 500);
                    }
                    return;
                }
                setTrainingPickerStep(3);
                return;
            }

            const realHours = wheelIndexToHour(pendingTrainingTime.hours);
            const timeStr = pad2(realHours) + ':' + pad2(pendingTrainingTime.minutes);
            const zoneMinutes = pendingTrainingZones.map(idx => parseInt(zoneMinutesValues[idx], 10) || 0);

            const existingTrainings = day.trainings || [];
            const newTrainings = [...existingTrainings];
            const idx = editingTrainingIndex;

            while (newTrainings.length <= idx) {
                newTrainings.push({ z: [0, 0, 0, 0], time: '', type: '', mood: 5, wellbeing: 5, stress: 5, comment: '' });
            }

            newTrainings[idx] = {
                ...newTrainings[idx],
                z: zoneMinutes,
                time: timeStr,
                type: pendingTrainingType,
                mood: pendingTrainingQuality || 5,
                wellbeing: pendingTrainingFeelAfter || 5,
                stress: 5,
                comment: pendingTrainingComment
            };

            setDay(prev => ({ ...prev, trainings: newTrainings, updatedAt: Date.now() }));
            setShowTrainingPicker(false);
            setTrainingPickerStep(1);
            setEditingTrainingIndex(null);
        }

        function cancelTrainingPicker() {
            if (trainingPickerStep === 3) {
                setTrainingPickerStep(2);
                return;
            }
            if (trainingPickerStep === 2) {
                setTrainingPickerStep(1);
                return;
            }

            const idx = editingTrainingIndex;
            const trainings = day.trainings || [];
            const training = trainings[idx];

            const isEmpty = !training || (
                (!training.z || training.z.every(z => z === 0)) &&
                !training.time &&
                !training.type
            );

            if (isEmpty && idx !== null && idx === visibleTrainings - 1) {
                setVisibleTrainings(prev => Math.max(0, prev - 1));
            }

            setShowTrainingPicker(false);
            setTrainingPickerStep(1);
            setEditingTrainingIndex(null);
        }

        return {
            openZonePicker,
            confirmZonePicker,
            cancelZonePicker,
            showZoneFormula,
            closeZoneFormula,
            showHouseholdFormula,
            closeHouseholdFormula,
            openTrainingPicker,
            confirmTrainingPicker,
            cancelTrainingPicker,
            zoneNames
        };
    }

    HEYS.dayTrainingHandlers = {
        createTrainingHandlers
    };

})(window);

// === heys_day_day_handlers.js ===
// heys_day_day_handlers.js — Day-level handlers (water, weight, steps, date, training)
// Phase 10.3 of HEYS Day v12 refactoring
// Extracted from heys_day_v12.js
(function (global) {
    'use strict';

    const HEYS = global.HEYS = global.HEYS || {};
    const React = global.React;

    // Dependencies - explicit check instead of silent fallbacks
    if (!HEYS.dayUtils) {
        throw new Error('[heys_day_day_handlers] HEYS.dayUtils is required. Ensure heys_day_utils.js is loaded first.');
    }
    const { haptic, lsGet } = HEYS.dayUtils;

    /**
     * Create day-level handlers
     * @param {Object} deps - Dependencies
     * @returns {Object} Day handler functions
     */
    function createDayHandlers(deps) {
        const {
            setDay,
            day,
            date,
            prof,
            setShowWaterDrop,
            setWaterAddedAnim,
            showConfetti,
            setShowConfetti,
            waterGoal,
            setEditGramsTarget,
            setEditGramsValue,
            setGrams
        } = deps;

        /**
         * Open weight picker modal
         */
        function openWeightPicker() {
            if (HEYS.showCheckin && HEYS.showCheckin.weight) {
                HEYS.showCheckin.weight(date, (weightData) => {
                    // Мгновенное обновление UI через setDay
                    if (weightData && (weightData.weightKg !== undefined || weightData.weightG !== undefined)) {
                        const newWeight = (weightData.weightKg || 70) + (weightData.weightG || 0) / 10;
                        setDay(prev => ({ ...prev, weightMorning: newWeight, updatedAt: Date.now() }));
                    }
                });
            }
        }

        /**
         * Open steps goal picker
         */
        function openStepsGoalPicker() {
            if (HEYS.showCheckin && HEYS.showCheckin.steps) {
                HEYS.showCheckin.steps();
            }
        }

        /**
         * Open deficit picker
         */
        function openDeficitPicker() {
            // Используем StepModal вместо старого пикера
            if (HEYS.showCheckin && HEYS.showCheckin.deficit) {
                HEYS.showCheckin.deficit(date, (stepData) => {
                    // Мгновенное обновление UI через setDay
                    // stepData = { deficit: { deficit: -15, dateKey: '...' } }
                    const deficitValue = stepData?.deficit?.deficit;
                    if (deficitValue !== undefined) {
                        setDay(prev => ({ ...prev, deficitPct: deficitValue, updatedAt: Date.now() }));
                    }
                });
            }
        }

        /**
         * Add water with animation
         * @param {number} ml - Milliliters to add
         * @param {boolean} skipScroll - Skip scroll to water card
         */
        function addWater(ml, skipScroll = false) {
            // 🔒 Read-only gating
            if (HEYS.Paywall && !HEYS.Paywall.canWriteSync()) {
                HEYS.Paywall.showBlockedToast('Добавление воды недоступно');
                return;
            }

            // Сначала прокручиваем к карточке воды (если вызвано из FAB)
            const waterCardEl = document.getElementById('water-card');
            if (!skipScroll && waterCardEl) {
                waterCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Задержка для завершения скролла перед анимацией
                setTimeout(() => runWaterAnimation(ml), 400);
                return;
            }
            runWaterAnimation(ml);
        }

        /**
         * Internal water animation runner
         */
        function runWaterAnimation(ml) {
            const newWater = (day.waterMl || 0) + ml;
            setDay(prev => ({ ...prev, waterMl: (prev.waterMl || 0) + ml, lastWaterTime: Date.now(), updatedAt: Date.now() }));

            // 💧 Анимация падающей капли (длиннее для плавности)
            if (setShowWaterDrop) {
                setShowWaterDrop(true);
                setTimeout(() => setShowWaterDrop(false), 1200);
            }

            // Анимация feedback
            if (setWaterAddedAnim) {
                setWaterAddedAnim('+' + ml);
            }
            haptic('light');

            // 🎮 XP: Dispatch для gamification
            window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail: { ml, total: newWater } }));

            // 🎉 Celebration при достижении цели (переиспользуем confetti от калорий)
            const prevWater = day.waterMl || 0;
            if (waterGoal && newWater >= waterGoal && prevWater < waterGoal && !showConfetti && setShowConfetti) {
                setShowConfetti(true);
                haptic('success');
                setTimeout(() => setShowConfetti(false), 2000);
            }

            // Скрыть анимацию
            if (setWaterAddedAnim) {
                setTimeout(() => setWaterAddedAnim(null), 800);
            }
        }

        /**
         * Remove water (для исправления ошибок)
         */
        function removeWater(ml) {
            const newWater = Math.max(0, (day.waterMl || 0) - ml);
            setDay(prev => ({ ...prev, waterMl: Math.max(0, (prev.waterMl || 0) - ml), updatedAt: Date.now() }));
            haptic('light');
        }

        /**
         * Open household activity picker
         */
        function openHouseholdPicker(mode = 'add', editIndex = null) {
            const dateKey = date; // ключ дня (YYYY-MM-DD)
            if (HEYS.StepModal) {
                // Выбираем шаги в зависимости от режима
                let steps, title;
                if (mode === 'stats') {
                    steps = ['household_stats'];
                    title = '📊 Статистика активности';
                } else if (mode === 'edit' && editIndex !== null) {
                    steps = ['household_minutes'];
                    title = '🏠 Редактирование';
                } else {
                    steps = ['household_minutes'];
                    title = '🏠 Добавить активность';
                }

                HEYS.StepModal.show({
                    steps,
                    title,
                    showProgress: steps.length > 1,
                    showStreak: false,
                    showGreeting: false,
                    showTip: false,
                    finishLabel: 'Готово',
                    context: { dateKey, editIndex, mode },
                    onComplete: (stepData) => {
                        // Обновляем локальное состояние из сохранённых данных
                        const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
                        setDay(prev => ({
                            ...prev,
                            householdActivities: savedDay.householdActivities || [],
                            // Legacy fields для backward compatibility
                            householdMin: savedDay.householdMin || 0,
                            householdTime: savedDay.householdTime || '',
                            updatedAt: Date.now()
                        }));
                    }
                });
            }
        }

        /**
         * Open edit grams modal
         */
        function openEditGramsModal(mealIndex, itemId, currentGrams, product) {
            if (HEYS.AddProductStep?.showEditGrams) {
                HEYS.AddProductStep.showEditGrams({
                    product,
                    currentGrams: currentGrams || 100,
                    mealIndex,
                    itemId,
                    dateKey: date,
                    onSave: ({ mealIndex: mi, itemId: id, grams }) => {
                        if (setGrams) setGrams(mi, id, grams);
                    }
                });
            } else {
                // Fallback на старую модалку (если AddProductStep не загружен)
                if (setEditGramsTarget) setEditGramsTarget({ mealIndex, itemId, product });
                if (setEditGramsValue) setEditGramsValue(currentGrams || 100);
            }
        }

        /**
         * Confirm edit grams modal
         */
        function confirmEditGramsModal(editGramsTarget, editGramsValue) {
            if (editGramsTarget && editGramsValue > 0 && setGrams) {
                setGrams(editGramsTarget.mealIndex, editGramsTarget.itemId, editGramsValue);
            }
            if (setEditGramsTarget) setEditGramsTarget(null);
            if (setEditGramsValue) setEditGramsValue(100);
        }

        /**
         * Cancel edit grams modal
         */
        function cancelEditGramsModal() {
            if (setEditGramsTarget) setEditGramsTarget(null);
            if (setEditGramsValue) setEditGramsValue(100);
        }

        /**
         * Update training zone minutes
         */
        function updateTraining(i, zi, mins) {
            setDay(prevDay => {
                const arr = (prevDay.trainings || []).map((t, idx) => {
                    if (idx !== i) return t;
                    return {
                        ...t,  // сохраняем time, type и другие поля
                        z: t.z.map((v, j) => j === zi ? (+mins || 0) : v)
                    };
                });
                return { ...prevDay, trainings: arr, updatedAt: Date.now() };
            });
        }

        /**
         * Open training picker
         */
        function openTrainingPicker(mode = 'add', editIndex = null) {
            if (HEYS.TrainingStep) {
                const dateKey = date;
                HEYS.TrainingStep.show({
                    dateKey,
                    mode,
                    editIndex,
                    onComplete: (stepData) => {
                        // Обновляем локальное состояние из сохранённых данных
                        const savedDay = lsGet(`heys_dayv2_${dateKey}`, {});
                        setDay(prev => ({
                            ...prev,
                            trainings: savedDay.trainings || [],
                            updatedAt: Date.now()
                        }));
                    }
                });
            }
        }

        return {
            // Weight & Stats
            openWeightPicker,
            openStepsGoalPicker,
            openDeficitPicker,

            // Water
            addWater,
            removeWater,
            runWaterAnimation,

            // Household
            openHouseholdPicker,

            // Grams editing
            openEditGramsModal,
            confirmEditGramsModal,
            cancelEditGramsModal,

            // Training
            updateTraining,
            openTrainingPicker
        };
    }

    // Export module
    HEYS.dayDayHandlers = {
        createDayHandlers
    };

})(window);

// === heys_day_handlers_bundle_v1.js ===
// heys_day_handlers_bundle_v1.js — DayTab handlers + water anim/presets bundle

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};

    HEYS.dayHandlersBundle = HEYS.dayHandlersBundle || {};

    HEYS.dayHandlersBundle.useDayHandlersBundle = function useDayHandlersBundle(ctx) {
        const React = ctx.React || global.React;
        const heysRef = ctx.HEYS || HEYS;

        // Вспомогательная функция: моментальная прокрутка к заголовку дневника
        const scrollToDiaryHeading = React.useCallback(() => {
            setTimeout(() => {
                const heading = document.getElementById('diary-heading');
                if (heading) {
                    heading.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }, 50);
        }, []);

        // Track newly added items for fly-in animation
        const [newItemIds, setNewItemIds] = React.useState(new Set());

        // === Water Tracking Animation States ===
        const [waterAddedAnim, setWaterAddedAnim] = React.useState(null); // для анимации "+200"
        const [showWaterDrop, setShowWaterDrop] = React.useState(false); // анимация падающей капли

        // Быстрые пресеты воды
        const waterPresets = [
            { ml: 100, label: '100 мл', icon: '💧' },
            { ml: 200, label: 'Стакан', icon: '🥛' },
            { ml: 330, label: 'Бутылка', icon: '🧴' },
            { ml: 500, label: '0.5л', icon: '🍶' }
        ];

        // === Meal handlers (extracted) ===
        const mealHandlers = heysRef.dayMealHandlers.createMealHandlers({
            setDay: ctx.setDay,
            expandOnlyMeal: ctx.expandOnlyMeal,
            date: ctx.date,
            products: ctx.products,
            day: ctx.day,
            prof: ctx.prof,
            pIndex: ctx.pIndex,
            getProductFromItem: ctx.getProductFromItem,
            isMobile: ctx.isMobile,
            openTimePickerForNewMeal: ctx.openTimePickerForNewMeal,
            scrollToDiaryHeading,
            lastLoadedUpdatedAtRef: ctx.lastLoadedUpdatedAtRef,
            blockCloudUpdatesUntilRef: ctx.blockCloudUpdatesUntilRef,
            newItemIds,
            setNewItemIds
        });

        React.useEffect(() => {
            if (ctx.updateMealTimeRef) {
                ctx.updateMealTimeRef.current = mealHandlers.updateMealTime;
            }
        }, [ctx.updateMealTimeRef, mealHandlers.updateMealTime]);

        // === Day-level handlers (weight/steps/deficit/water/household/edit grams/training zones) ===
        if (!heysRef.dayDayHandlers?.createDayHandlers) {
            throw new Error('[heys_day_handlers_bundle_v1] HEYS.dayDayHandlers not loaded');
        }
        const dayHandlers = heysRef.dayDayHandlers.createDayHandlers({
            setDay: ctx.setDay,
            day: ctx.day,
            date: ctx.date,
            prof: ctx.prof,
            setShowWaterDrop,
            setWaterAddedAnim,
            showConfetti: ctx.showConfetti,
            setShowConfetti: ctx.setShowConfetti,
            waterGoal: ctx.waterGoal,
            setEditGramsTarget: ctx.setEditGramsTarget,
            setEditGramsValue: ctx.setEditGramsValue,
            setGrams: mealHandlers.setGrams
        });

        // === Training handlers (Phase 10) ===
        if (!heysRef.dayTrainingHandlers?.createTrainingHandlers) {
            throw new Error('[heys_day_handlers_bundle_v1] HEYS.dayTrainingHandlers not loaded');
        }
        const trainingHandlers = heysRef.dayTrainingHandlers.createTrainingHandlers({
            day: ctx.day,
            date: ctx.date,
            TR: ctx.TR,
            zoneMinutesValues: ctx.zoneMinutesValues,
            visibleTrainings: ctx.visibleTrainings,
            setVisibleTrainings: ctx.setVisibleTrainings,
            updateTraining: dayHandlers.updateTraining,
            lsGet: ctx.lsGet,
            haptic: ctx.haptic,
            getSmartPopupPosition: ctx.getSmartPopupPosition,
            setZonePickerTarget: ctx.setZonePickerTarget,
            zonePickerTarget: ctx.zonePickerTarget,
            pendingZoneMinutes: ctx.pendingZoneMinutes,
            setPendingZoneMinutes: ctx.setPendingZoneMinutes,
            setShowZonePicker: ctx.setShowZonePicker,
            setZoneFormulaPopup: ctx.setZoneFormulaPopup,
            setHouseholdFormulaPopup: ctx.setHouseholdFormulaPopup,
            setShowTrainingPicker: ctx.setShowTrainingPicker,
            setTrainingPickerStep: ctx.setTrainingPickerStep,
            setEditingTrainingIndex: ctx.setEditingTrainingIndex,
            setPendingTrainingTime: ctx.setPendingTrainingTime,
            setPendingTrainingType: ctx.setPendingTrainingType,
            setPendingTrainingZones: ctx.setPendingTrainingZones,
            setPendingTrainingQuality: ctx.setPendingTrainingQuality,
            setPendingTrainingFeelAfter: ctx.setPendingTrainingFeelAfter,
            setPendingTrainingComment: ctx.setPendingTrainingComment,
            setDay: ctx.setDay,
            trainingPickerStep: ctx.trainingPickerStep,
            pendingTrainingTime: ctx.pendingTrainingTime,
            pendingTrainingZones: ctx.pendingTrainingZones,
            pendingTrainingType: ctx.pendingTrainingType,
            pendingTrainingQuality: ctx.pendingTrainingQuality,
            pendingTrainingFeelAfter: ctx.pendingTrainingFeelAfter,
            pendingTrainingComment: ctx.pendingTrainingComment,
            editingTrainingIndex: ctx.editingTrainingIndex
        });

        return {
            waterPresets,
            waterAddedAnim,
            showWaterDrop,
            setWaterAddedAnim,
            setShowWaterDrop,
            mealHandlers,
            dayHandlers,
            trainingHandlers
        };
    };
})(window);
