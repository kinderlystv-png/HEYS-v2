// heys_add_product_step_v1.js — Шаг добавления продукта через StepModal
// Двухшаговый flow: поиск → граммы/порции
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef, useContext } = React;

  // === ГЛОБАЛЬНЫЙ СЧЁТЧИК ВЕРСИИ ПРОДУКТОВ ===
  // Должен быть доступен всем компонентам внутри модуля
  let globalProductsVersion = 0;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.warn('[HEYS] AddProductStep: StepModal not loaded yet');
  }

  // === Утилиты ===
  const U = () => HEYS.utils || {};
  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) { }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const readStoredValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  };

  const readGlobalValue = (key, fallback) => {
    try {
      if (HEYS.store?.get && /^heys_(clients|client_current)$/i.test(key)) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  };

  const writeRawValue = (key, value) => {
    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch { }
  };

  const lsGet = (key, def) => {
    const utils = U();
    if (HEYS.store?.get) return HEYS.store.get(key, def);
    if (utils.lsGet) return utils.lsGet(key, def);
    return readStoredValue(key, def);
  };

  // Haptic feedback
  const haptic = (style = 'light') => {
    if (navigator.vibrate) {
      navigator.vibrate(style === 'light' ? 10 : style === 'medium' ? 20 : 30);
    }
  };

  const useEscapeToClose = (closeFn, enabled = true) => {
    useEffect(() => {
      if (!enabled) return;

      const handleKeyDown = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeFn?.();
        HEYS.StepModal?.hide?.();
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeFn, enabled]);
  };

  const getAutoPortions = (productName) => {
    if (!productName) return [];
    return HEYS.models?.getAutoPortions?.(productName) || [];
  };

  const normalizePortions = (list) => {
    if (!Array.isArray(list)) {
      console.warn('[HEYS.portions] ⚠️ normalizePortions: не массив', { input: list });
      return [];
    }
    const result = list
      .map((p) => ({
        name: String(p?.name || '').trim(),
        grams: Number(p?.grams || 0)
      }))
      .filter((p) => p.name && p.grams > 0);
    console.info('[HEYS.portions] 🔄 normalizePortions', {
      inputCount: list.length,
      outputCount: result.length,
      input: list.map(p => ({ name: p?.name, grams: p?.grams })),
      output: result
    });
    return result;
  };

  const saveProductPortions = (product, portions) => {
    console.info('[HEYS.portions] 📥 saveProductPortions ВЫЗВАН', {
      productId: product?.id ?? product?.product_id ?? product?.name,
      productName: product?.name,
      portionsInput: portions,
      isShared: isSharedProduct(product),
      shared_origin_id: product?.shared_origin_id
    });
    if (!product || !Array.isArray(portions)) {
      console.warn('[HEYS.portions] ⚠️ saveProductPortions: невалидные аргументы', { product: !!product, portions });
      return;
    }
    const U = HEYS.utils || {};
    const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
    const pid = String(product.id ?? product.product_id ?? product.name);
    const idx = products.findIndex((p) => String(p.id ?? p.product_id ?? p.name) === pid);

    if (idx === -1) {
      console.warn('[HEYS.portions] ⚠️ Продукт не найден в базе, сохраняю через upsert', {
        productId: pid
      });
      upsertLocalProduct({ ...product, portions }, false);
      return;
    }

    const updated = {
      ...products[idx],
      portions
    };

    const nextProducts = [...products];
    nextProducts[idx] = updated;

    if (HEYS.products?.setAll) {
      HEYS.products.setAll(nextProducts);
    } else if (HEYS.store?.set) {
      HEYS.store.set('heys_products', nextProducts);
    } else if (U.lsSet) {
      U.lsSet('heys_products', nextProducts);
    }

    console.info('[HEYS.portions] 📣 Отправляем событие heys:local-product-updated', {
      productId: updated.id,
      productName: updated.name,
      portionsCount: portions.length,
      shared_origin_id: updated.shared_origin_id
    });
    window.dispatchEvent(new CustomEvent('heys:local-product-updated', {
      detail: {
        productId: updated.id ?? updated.product_id ?? updated.name,
        product: updated,
        portions,
        sharedId: updated.shared_origin_id
      }
    }));

    console.info('[HEYS.portions] 📣 Отправляем событие heys:product-portions-updated', {
      productId: updated.id ?? updated.product_id ?? updated.name,
      productName: updated.name,
      portionsCount: portions.length
    });
    notifyPortionsUpdated(updated, portions);
  };

  const upsertLocalProduct = (product, isUserEdit = true) => {
    if (!product) return;
    const U = HEYS.utils || {};
    const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
    const pid = String(product.id ?? product.product_id ?? product.name);
    const idx = products.findIndex((p) => String(p.id ?? p.product_id ?? p.name) === pid);

    let nextProducts = [...products];

    if (idx === -1) {
      nextProducts.push({
        ...product,
        user_modified: isUserEdit ? true : product.user_modified
      });
    } else {
      const existing = products[idx];
      const shouldMarkModified = isUserEdit && hasNutrientChanges(existing, product);
      nextProducts[idx] = {
        ...existing,
        ...product,
        user_modified: existing.user_modified === true || shouldMarkModified
      };
    }

    if (HEYS.products?.setAll) {
      HEYS.products.setAll(nextProducts);
    } else if (HEYS.store?.set) {
      HEYS.store.set('heys_products', nextProducts);
    } else if (U.lsSet) {
      U.lsSet('heys_products', nextProducts);
    }

    if (idx !== -1) {
      cascadeMealItemsOnProductUpdate(products[idx], nextProducts[idx]);
    }
  };

  const hasCuratorJwt = () => {
    try {
      return !!readGlobalValue('heys_curator_session', null);
    } catch (_) {
      return false;
    }
  };

  const isCuratorUser = () => {
    const isCuratorSession = HEYS.auth?.isCuratorSession;
    if (typeof isCuratorSession === 'function') return isCuratorSession();
    return !!HEYS.cloud?.getUser?.() || hasCuratorJwt();
  };

  const isSharedProduct = (product) => {
    if (!product) return false;
    return !!(product._fromShared || product._source === 'shared' || product.is_shared);
  };

  const isUuidLike = (value) => {
    if (value == null) return false;
    const str = String(value).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  };

  const resolveSharedProductId = (product) => {
    if (!product) return null;
    if (product.shared_origin_id != null) return product.shared_origin_id;
    if (product.sharedId != null) return product.sharedId;
    if (product._sharedId != null) return product._sharedId;
    if (isSharedProduct(product)) {
      const sharedId = product.id ?? product.product_id ?? null;
      return isUuidLike(sharedId) ? sharedId : null;
    }
    return null;
  };

  const canEditProduct = (product) => {
    if (!product) return false;
    if (!isSharedProduct(product)) return true;
    return isCuratorUser() || !!product.is_mine;
  };

  const notifyPortionsUpdated = (product, portions) => {
    if (!product) return;
    window.dispatchEvent(new CustomEvent('heys:product-portions-updated', {
      detail: {
        productId: product.id ?? product.product_id ?? product.name,
        product,
        portions: Array.isArray(portions) ? portions : []
      }
    }));
  };

  const notifySharedProductUpdated = (sharedId, portions, product = null) => {
    if (sharedId == null) return;
    const eventProduct = product ? { ...product, id: sharedId } : { id: sharedId, portions };
    window.dispatchEvent(new CustomEvent('heys:shared-product-updated', {
      detail: {
        productId: sharedId,
        product: eventProduct,
        portions: Array.isArray(portions) ? portions : []
      }
    }));
  };

  const updateSharedProductsCache = (sharedId, portions, product = null) => {
    if (sharedId == null) return;

    // 1. Обновляем через новый API (предпочтительно)
    if (HEYS.cloud?.updateCachedSharedProduct) {
      const updates = {
        ...(product || {}),
        portions: Array.isArray(portions) ? portions : undefined
      };
      HEYS.cloud.updateCachedSharedProduct(sharedId, updates);
    } else {
      // Fallback: обновляем напрямую
      const cache = HEYS.cloud?.getCachedSharedProducts?.();
      if (!Array.isArray(cache) || cache.length === 0) return;
      const idx = cache.findIndex((p) => String(p?.id) === String(sharedId));
      if (idx === -1) return;
      const merged = {
        ...cache[idx],
        ...(product || {}),
        id: sharedId,
        portions: Array.isArray(portions) ? portions : cache[idx]?.portions
      };
      cache[idx] = merged;
    }

    // 🔧 FIX: Синхронизируем с локальным heys_products (личная база)
    // Продукт мог быть клонирован туда ранее через addFromShared
    try {
      const U = HEYS.utils || {};
      let localProducts = [];
      if (HEYS.products?.getAll) localProducts = HEYS.products.getAll() || [];
      if (localProducts.length === 0 && HEYS.store?.get) {
        localProducts = HEYS.store.get('heys_products', []) || [];
      }
      if (localProducts.length === 0 && U.lsGet) {
        localProducts = U.lsGet('heys_products', []) || [];
      }
      if (localProducts.length === 0) {
        const rawProducts = readStoredValue('heys_products', []) || [];
        if (Array.isArray(rawProducts)) localProducts = rawProducts;
      }
      if (!Array.isArray(localProducts) || localProducts.length === 0) return;

      const normalizeName = HEYS.models?.normalizeProductName
        || ((name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е'));

      const sharedName = product?.name
        || (HEYS.cloud?.getCachedSharedProducts?.() || []).find(p => String(p?.id) === String(sharedId))?.name
        || null;

      const getSharedOriginId = (p) => p?.shared_origin_id ?? p?.sharedOriginId ?? p?.shared_id ?? p?.sharedId ?? null;

      const localIndices = localProducts
        .map((p, idx) => ({ idx, p }))
        .filter(({ p }) => String(getSharedOriginId(p)) === String(sharedId) || String(p?.id) === String(sharedId))
        .map((item) => item.idx);

      if (localIndices.length === 0 && sharedName) {
        const targetName = normalizeName(sharedName);
        localProducts.forEach((p, idx) => {
          if (normalizeName(p?.name) === targetName) {
            localIndices.push(idx);
          }
        });
      }

      if (localIndices.length > 0) {
        let updatedProducts = [...localProducts];
        const incomingPortions = Array.isArray(portions) ? portions : [];
        const hasIncomingPortions = incomingPortions.length > 0;

        localIndices.forEach((idx) => {
          const localProduct = updatedProducts[idx];
          const finalPortions = hasIncomingPortions ? incomingPortions : (localProduct?.portions || []);

          const updatedProduct = {
            ...localProduct,
            ...product,
            portions: finalPortions,
            id: localProduct?.id
          };

          if (!getSharedOriginId(localProduct)) {
            updatedProduct.shared_origin_id = sharedId;
          }

          updatedProducts[idx] = updatedProduct;

          window.dispatchEvent(new CustomEvent('heys:local-product-updated', {
            detail: {
              productId: localProduct?.id,
              sharedId: sharedId,
              product: updatedProduct,
              portions: finalPortions
            }
          }));
          window.dispatchEvent(new CustomEvent('heys:product-portions-updated', {
            detail: {
              productId: localProduct?.id,
              product: updatedProduct,
              portions: finalPortions
            }
          }));
        });

        if (HEYS.products?.setAll) {
          HEYS.products.setAll(updatedProducts, { source: 'portions-sync-shared' });
        } else if (HEYS.store?.set) {
          HEYS.store.set('heys_products', updatedProducts);
        } else if (U.lsSet) {
          U.lsSet('heys_products', updatedProducts);
        } else {
          writeRawValue('heys_products', updatedProducts);
        }
      } else {
        console.warn('[HEYS.portions] ⚠️ Не найден локальный продукт для синхронизации', { sharedId, sharedName });
      }
    } catch (e) {
      console.warn('[HEYS.portions] ⚠️ Не удалось синхронизировать с локальной базой', e?.message || e);
    }
  };

  // 🔄 Обновление порций через RPC (direct UPDATE, не INSERT ON CONFLICT)
  // Причина: REST upsert с partial data fails NOT NULL constraint на name/fingerprint
  const updateSharedProductPortions = async (productId, portions, product = null) => {
    // 🔧 Для кураторов используем JWT авторизацию (curator_id из cloud.getUser())
    // ПРИОРИТЕТ: curator mode если пользователь - куратор
    const curatorUser = (typeof HEYS !== 'undefined' && HEYS.cloud?.getUser?.());
    const curatorId = curatorUser?.id;
    const isCurator = curatorUser?.role === 'curator';

    // 🔧 Получаем session token для клиентов (PIN auth)
    const sessionToken = (typeof HEYS !== 'undefined' && HEYS.Auth?.getSessionToken?.())
      || localStorage.getItem('heys_session_token');

    // Кураторы используют curator функцию, клиенты - session функцию
    const isCuratorMode = isCurator && !!curatorId;

    if (!HEYS?.YandexAPI?.rpc) {
      HEYS.Toast?.warning('API недоступен для обновления') || alert('API недоступен для обновления');
      console.warn('[HEYS.portions] ⚠️ API недоступен для обновления порций', {
        productId,
        portionsCount: Array.isArray(portions) ? portions.length : 0
      });
      return { ok: false };
    }

    if (!sessionToken && !curatorId) {
      HEYS.Toast?.warning('Сессия не авторизована') || alert('Сессия не авторизована');
      console.warn('[HEYS.portions] ⚠️ Нет авторизации для обновления порций', { productId });
      return { ok: false };
    }

    const resolvedSharedId = resolveSharedProductId(product) ?? productId;
    if (!isUuidLike(resolvedSharedId)) {
      console.warn('[HEYS.portions] ⚠️ Некорректный shared UUID для RPC порций', {
        productId,
        resolvedSharedId
      });
      return { ok: false };
    }

    try {
      // Выбираем функцию и параметры в зависимости от режима авторизации
      const rpcFn = isCuratorMode ? 'update_shared_product_portions_by_curator' : 'update_shared_product_portions';
      const rpcParams = isCuratorMode
        ? {
          p_curator_id: curatorId,
          p_product_id: resolvedSharedId,
          p_portions: Array.isArray(portions) ? portions : []
        }
        : {
          p_session_token: sessionToken,
          p_product_id: resolvedSharedId,
          p_portions: Array.isArray(portions) ? portions : []
        };

      console.info(`[HEYS.portions] 📤 RPC ${rpcFn}`, {
        productId: resolvedSharedId,
        portionsCount: Array.isArray(portions) ? portions.length : 0,
        portionsData: portions,
        isCuratorMode,
        curatorId: isCuratorMode ? curatorId : undefined
      });

      const { data: rawData, error } = await HEYS.YandexAPI.rpc(rpcFn, rpcParams);

      if (error) {
        const errorMsg = error?.message || error;
        HEYS.Toast?.error('Ошибка обновления: ' + errorMsg) || alert('Ошибка обновления: ' + errorMsg);
        console.error('[HEYS.portions] ❌ RPC ошибка обновления порций', {
          productId,
          error
        });
        return { ok: false };
      }

      // 🔧 RPC возвращает { "[function_name]": { success: true/false, ... } }
      // Извлекаем результат из nested структуры
      const data = rawData?.[rpcFn] || rawData;

      console.info('[HEYS.portions] 📥 RPC response parsed', {
        rawDataKeys: rawData ? Object.keys(rawData) : [],
        success: data?.success,
        hasError: !!data?.error
      });

      if (data?.success === false) {
        const errorMsg = data?.message || data?.error || 'Ошибка сервера';
        HEYS.Toast?.error(errorMsg) || alert(errorMsg);
        console.error('[HEYS.portions] ❌ RPC вернул ошибку', {
          productId,
          data
        });
        return { ok: false };
      }

      HEYS.Toast?.success('Порции обновлены') || alert('Порции обновлены');
      console.info('[HEYS.portions] ✅ Порции обновлены через RPC', {
        productId: resolvedSharedId,
        portionsCount: Array.isArray(portions) ? portions.length : 0,
        portionsData: portions,
        serverResponse: data,
        isCuratorMode
      });

      // Обновляем кэш и уведомляем об изменениях
      updateSharedProductsCache(resolvedSharedId, portions, product);
      notifySharedProductUpdated(resolvedSharedId, portions, product);
      return { ok: true };
    } catch (e) {
      const msg = e?.message || 'Ошибка обновления';
      HEYS.Toast?.error(msg) || alert(msg);
      console.error('[HEYS.portions] ❌ Исключение при обновлении порций', {
        productId,
        error: e?.message || e
      });
      return { ok: false };
    }
  };

  const toNum = (value, fallback = 0) => {
    if (value == null || value === '') return fallback;
    const normalized = String(value).trim().replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : fallback;
  };

  const toInt = (value, fallback = null) => {
    if (value == null || value === '') return fallback;
    const n = Number(String(value).trim().replace(',', '.'));
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  };

  const normalizeAdditives = (value) => {
    if (!value) return null;
    if (Array.isArray(value)) return value.length ? value : null;
    return String(value)
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const normalizeName = (name) => {
    if (HEYS.models?.normalizeProductName) return HEYS.models.normalizeProductName(name);
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/ё/g, 'е');
  };

  const notifyProductUpdated = (product) => {
    if (!product) return;
    window.dispatchEvent(new CustomEvent('heys:product-updated', {
      detail: {
        productId: product.id ?? product.product_id ?? product.name,
        product
      }
    }));
  };

  // Хелпер для проверки изменений нутриентов (для user_modified флага)
  const hasNutrientChanges = (oldProduct, newProduct) => {
    const nutrientKeys = [
      'simple100', 'complex100', 'protein100',
      'badFat100', 'goodFat100', 'trans100',
      'fiber100', 'gi', 'harm'
    ];
    return nutrientKeys.some(key => {
      const oldVal = oldProduct?.[key];
      const newVal = newProduct?.[key];
      // Считаем изменённым если оба определены и различаются
      if (oldVal == null && newVal == null) return false;
      return oldVal !== newVal;
    });
  };

  const saveLocalProduct = (product, isUserEdit = true) => {
    if (!product) return;
    const U = HEYS.utils || {};
    const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
    const pid = String(product.id ?? product.product_id ?? product.name);
    const idx = products.findIndex((p) => String(p.id ?? p.product_id ?? p.name) === pid);
    if (idx === -1) return;

    const existing = products[idx];
    const nextProducts = [...products];

    // Устанавливаем user_modified: true если пользователь изменил нутриенты
    const shouldMarkModified = isUserEdit && hasNutrientChanges(existing, product);
    nextProducts[idx] = {
      ...existing,
      ...product,
      // Сохраняем user_modified если уже был true, или ставим если сейчас изменили
      user_modified: existing.user_modified === true || shouldMarkModified
    };

    if (HEYS.products?.setAll) {
      HEYS.products.setAll(nextProducts);
    } else if (HEYS.store?.set) {
      HEYS.store.set('heys_products', nextProducts);
    } else if (U.lsSet) {
      U.lsSet('heys_products', nextProducts);
    }

    // v4.8.0: Cascade update to MealItems in all days
    cascadeMealItemsOnProductUpdate(existing, nextProducts[idx]);
  };

  /**
   * v4.8.0: Cascade MealItem updates when product is renamed/edited
   * Updates item.name and inline nutrients in all days where product_id matches
   * @param {Object} oldProduct - Product before update (for comparison)
   * @param {Object} newProduct - Product after update
   */
  const cascadeMealItemsOnProductUpdate = (oldProduct, newProduct) => {
    if (!oldProduct || !newProduct) return;
    const pid = String(newProduct.id ?? newProduct.product_id ?? '');
    if (!pid) return;

    // Check if name changed (main reason for cascade)
    const nameChanged = oldProduct.name !== newProduct.name;
    const nutrientsChanged = hasNutrientChanges(oldProduct, newProduct);
    if (!nameChanged && !nutrientsChanged) return;

    const U = HEYS.utils || {};
    // Find all day keys (with or without clientId prefix)
    const dayKeys = Object.keys(localStorage).filter(k => k.includes('_dayv2_'));
    let updatedDays = 0;
    let updatedItems = 0;

    for (const key of dayKeys) {
      try {
        const day = readStoredValue(key, null);
        if (!day || !day.meals) continue;

        let dayChanged = false;

        for (const meal of day.meals) {
          if (!meal.items) continue;
          for (const item of meal.items) {
            // Match by product_id (primary key for cascade)
            const itemPid = String(item.product_id ?? item.productId ?? '');
            if (itemPid === pid) {
              // Update name if changed
              if (nameChanged) {
                item.name = newProduct.name;
              }
              // Update inline nutrients if changed
              if (nutrientsChanged) {
                item.kcal100 = newProduct.kcal100;
                item.protein100 = newProduct.protein100;
                item.fat100 = newProduct.fat100;
                item.simple100 = newProduct.simple100;
                item.complex100 = newProduct.complex100;
                item.badFat100 = newProduct.badFat100;
                item.goodFat100 = newProduct.goodFat100;
                item.trans100 = newProduct.trans100;
                item.fiber100 = newProduct.fiber100;
                item.gi = newProduct.gi ?? newProduct.gi100;
                item.harm = HEYS.models?.normalizeHarm?.(newProduct) ?? newProduct.harm;
              }
              dayChanged = true;
              updatedItems++;
            }
          }
        }

        if (dayChanged) {
          day.updatedAt = Date.now();
          writeRawValue(key, day);
          updatedDays++;
        }
      } catch (e) {
        console.warn('[HEYS] cascadeMealItems error for key:', key, e);
      }
    }

    if (updatedDays > 0) {
      console.log(`[HEYS] Cascade update: ${updatedItems} items in ${updatedDays} days`);
      // Clear caches to reflect changes
      HEYS.models?.clearMealTotalsCache?.();
      window.dispatchEvent(new CustomEvent('heys:mealitems-cascaded', {
        detail: { productId: pid, updatedDays, updatedItems }
      }));
    }
  };

  const updateSharedProduct = async (product, sharedIdOverride = null) => {
    const targetId = sharedIdOverride ?? product?.id ?? null;
    if (!product || !targetId) return { ok: false };
    if (!HEYS?.YandexAPI?.rest) {
      HEYS.Toast?.warning('API недоступен для обновления') || alert('API недоступен для обновления');
      return { ok: false };
    }

    let fingerprint = product?.fingerprint || null;
    if (!fingerprint && HEYS.models?.computeProductFingerprint) {
      try {
        fingerprint = await HEYS.models.computeProductFingerprint(product);
      } catch (e) {
        console.warn('[HEYS.portions] ⚠️ Не удалось вычислить fingerprint', e?.message || e);
      }
    }

    if (!fingerprint) {
      console.warn('[HEYS.portions] ⚠️ Нет fingerprint для shared update', {
        productId: targetId,
        name: product?.name || null
      });
      return { ok: false };
    }

    const payload = {
      id: targetId,
      name: product.name || null,
      name_norm: normalizeName(product.name),
      fingerprint: fingerprint,
      simple100: toNum(product.simple100, 0),
      complex100: toNum(product.complex100, 0),
      protein100: toNum(product.protein100, 0),
      badfat100: toNum(product.badFat100 ?? product.badfat100, 0),
      goodfat100: toNum(product.goodFat100 ?? product.goodfat100, 0),
      trans100: toNum(product.trans100, 0),
      fiber100: toNum(product.fiber100, 0),
      gi: toNum(product.gi, null),
      harm: toNum(HEYS.models?.normalizeHarm?.(product) ?? product.harm, null),
      category: product.category || null,
      portions: Array.isArray(product.portions) ? product.portions : null,
      description: product.description || null,
      sodium100: toNum(product.sodium100, null),
      omega3_100: toNum(product.omega3_100, null),
      omega6_100: toNum(product.omega6_100, null),
      nova_group: toInt(product.nova_group ?? product.novaGroup, null),
      additives: normalizeAdditives(product.additives),
      nutrient_density: toNum(product.nutrient_density ?? product.nutrientDensity, null),
      is_organic: product.is_organic ?? false,
      is_whole_grain: product.is_whole_grain ?? false,
      is_fermented: product.is_fermented ?? false,
      is_raw: product.is_raw ?? false,
      vitamin_a: toNum(product.vitamin_a, null),
      vitamin_c: toNum(product.vitamin_c, null),
      vitamin_d: toNum(product.vitamin_d, null),
      vitamin_e: toNum(product.vitamin_e, null),
      vitamin_k: toNum(product.vitamin_k, null),
      vitamin_b1: toNum(product.vitamin_b1, null),
      vitamin_b2: toNum(product.vitamin_b2, null),
      vitamin_b3: toNum(product.vitamin_b3, null),
      vitamin_b6: toNum(product.vitamin_b6, null),
      vitamin_b9: toNum(product.vitamin_b9, null),
      vitamin_b12: toNum(product.vitamin_b12, null),
      calcium: toNum(product.calcium, null),
      iron: toNum(product.iron, null),
      magnesium: toNum(product.magnesium, null),
      phosphorus: toNum(product.phosphorus, null),
      potassium: toNum(product.potassium, null),
      zinc: toNum(product.zinc, null),
      selenium: toNum(product.selenium, null),
      iodine: toNum(product.iodine, null)
    };

    const minimalPayload = {
      id: targetId,
      name: product.name || null,
      name_norm: normalizeName(product.name),
      fingerprint: fingerprint,
      simple100: toNum(product.simple100, 0),
      complex100: toNum(product.complex100, 0),
      protein100: toNum(product.protein100, 0),
      badfat100: toNum(product.badFat100 ?? product.badfat100, 0),
      goodfat100: toNum(product.goodFat100 ?? product.goodfat100, 0),
      trans100: toNum(product.trans100, 0),
      fiber100: toNum(product.fiber100, 0),
      gi: toNum(product.gi, null),
      harm: toNum(HEYS.models?.normalizeHarm?.(product) ?? product.harm, null),
      category: product.category || null,
      portions: Array.isArray(product.portions) ? product.portions : null,
      description: product.description || null
    };

    try {
      const primary = await HEYS.YandexAPI.rest('shared_products', {
        method: 'POST',
        data: payload,
        upsert: true,
        onConflict: 'id',
        select: 'id,name'
      });

      if (primary?.error?.code === 500) {
        console.warn('[HEYS.portions] ⚠️ Full payload failed, retry minimal payload', {
          productId: targetId
        });
        const fallback = await HEYS.YandexAPI.rest('shared_products', {
          method: 'POST',
          data: minimalPayload,
          upsert: true,
          onConflict: 'id',
          select: 'id,name'
        });
        if (fallback.error) {
          HEYS.Toast?.error('Ошибка обновления: ' + fallback.error) || alert('Ошибка обновления: ' + fallback.error);
          return { ok: false };
        }
        HEYS.Toast?.success('Продукт обновлён') || alert('Продукт обновлён');
        return { ok: true, fallback: true };
      }

      if (primary.error) {
        HEYS.Toast?.error('Ошибка обновления: ' + primary.error) || alert('Ошибка обновления: ' + primary.error);
        return { ok: false };
      }

      HEYS.Toast?.success('Продукт обновлён') || alert('Продукт обновлён');
      return { ok: true };
    } catch (e) {
      const msg = e?.message || 'Ошибка обновления';
      HEYS.Toast?.error(msg) || alert(msg);
      return { ok: false };
    }
  };

  const openProductPortionsEditor = (product) => {
    console.log('[openProductPortionsEditor] called with product:', product);
    if (!product) {
      console.log('[openProductPortionsEditor] no product, returning');
      return;
    }
    if (!HEYS?.StepModal || !HEYS?.AddProductStep?.PortionsStep) {
      console.log('[openProductPortionsEditor] StepModal or PortionsStep missing');
      HEYS.Toast?.warning('Модалка порций недоступна') || alert('Модалка порций недоступна');
      return;
    }

    if (!canEditProduct(product)) {
      console.log('[openProductPortionsEditor] canEditProduct returned false');
      HEYS.Toast?.warning('Нет доступа к редактированию') || alert('Нет доступа к редактированию');
      return;
    }

    console.log('[openProductPortionsEditor] calling HEYS.StepModal.show');
    HEYS.StepModal.show({
      steps: [
        {
          id: 'portions',
          title: 'Порции',
          hint: 'Настройте порции',
          icon: '🥣',
          component: HEYS.AddProductStep.PortionsStep,
          validate: () => true,
          hideHeaderNext: true,
          getInitialData: () => ({
            selectedProduct: product,
            portions: product.portions || []
          })
        }
      ],
      context: {
        isEditMode: true,
        editProduct: product,
        onFinish: async ({ portions }) => {
          console.info('[HEYS.portions] 🏁 onFinish shared/personal edit', {
            productId: product?.id,
            productName: product?.name,
            receivedPortions: portions,
            shared_origin_id: product?.shared_origin_id
          });
          const normalized = normalizePortions(portions || []);
          const updatedProduct = {
            ...product,
            ...(normalized.length > 0 ? { portions: normalized } : {})
          };

          const sharedId = resolveSharedProductId(product);
          if (isCuratorUser() && sharedId) {
            const result = await updateSharedProductPortions(sharedId, normalized, updatedProduct);
            if (result.ok) {
              upsertLocalProduct(updatedProduct, false);
              notifyPortionsUpdated(updatedProduct, normalized);
            }
            return;
          }

          if (isSharedProduct(product)) {
            if (isCuratorUser()) {
              const resolvedSharedId = resolveSharedProductId(product);
              if (!resolvedSharedId) {
                console.warn('[HEYS.portions] ⚠️ Не удалось определить shared UUID для порций', {
                  productId: product?.id,
                  productName: product?.name,
                  shared_origin_id: product?.shared_origin_id
                });
                return;
              }
              const result = await updateSharedProductPortions(resolvedSharedId, normalized, updatedProduct);
              if (result.ok) {
                upsertLocalProduct(updatedProduct, false);
                notifyPortionsUpdated(updatedProduct, normalized);
              }
              return;
            }

            upsertLocalProduct(updatedProduct, true);
            notifyPortionsUpdated(updatedProduct, normalized);
            return;
          }

          saveProductPortions(updatedProduct, normalized);
          notifyPortionsUpdated(updatedProduct, normalized);
        }
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: false,
      allowSwipe: false,
      hidePrimaryOnFirst: true,
      title: ''
    });
  };

  // === Умный список продуктов: частота + свежесть ===
  function computeSmartProducts(products, dateKey, options = {}) {
    if (!products || !products.length) return [];

    const usageStats = options.usageStats instanceof Map
      ? options.usageStats
      : new Map(Array.isArray(options.usageStats) ? options.usageStats : []);
    const lastUsedDay = new Map(); // Последний день использования (daysAgo)
    const today = new Date(dateKey || new Date().toISOString().slice(0, 10));
    const now = Date.now();
    const daysWindow = Math.max(1, Math.min(60, Number(options.daysWindow) || 21));
    const favoritesSet = options.favorites instanceof Set
      ? options.favorites
      : new Set(Array.isArray(options.favorites) ? options.favorites : []);
    const hiddenSet = options.hidden instanceof Set
      ? options.hidden
      : new Set(Array.isArray(options.hidden) ? options.hidden : []);

    // Комбинированный скор: частота × свежесть
    // Свежесть: 1.0 для сегодня, убывает экспоненциально
    // Формула: score = frequency * recencyWeight
    // recencyWeight = 1 / (1 + daysAgo * 0.15)
    const resolveUsageStats = (pid, name) => {
      const rawName = String(name || '').trim();
      const normName = normalizeName(rawName);
      const searchNorm = HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        ? HEYS.SmartSearchWithTypos.utils.normalizeText(rawName)
        : normName;

      const candidates = [];
      if (pid && usageStats.has(pid)) candidates.push(usageStats.get(pid));
      if (normName && usageStats.has(normName)) candidates.push(usageStats.get(normName));
      if (searchNorm && usageStats.has(searchNorm)) candidates.push(usageStats.get(searchNorm));
      if (rawName && usageStats.has(rawName)) candidates.push(usageStats.get(rawName));

      const target = searchNorm || normName || rawName;
      if (target) {
        usageStats.forEach((stats, key) => {
          const k = String(key || '').trim();
          if (!k || k.length < 3) return;
          if (!target.includes(k) && !k.includes(target)) return;
          candidates.push(stats);
        });
      }

      if (!candidates.length) return null;

      return candidates.reduce((best, curr) => {
        if (!best) return curr;
        const bc = Number(best.count) || 0;
        const cc = Number(curr.count) || 0;
        if (cc !== bc) return cc > bc ? curr : best;
        const bl = Number(best.lastUsed) || 0;
        const cl = Number(curr.lastUsed) || 0;
        return cl > bl ? curr : best;
      }, null);
    };

    const getFreq = (pid, name) => {
      const stats = resolveUsageStats(pid, name);
      if (!stats || !stats.lastUsed) return 0;
      const daysAgo = Math.floor((now - stats.lastUsed) / (1000 * 60 * 60 * 24));
      if (daysAgo > daysWindow) return 0;
      lastUsedDay.set(pid, daysAgo);
      return Number(stats.count) || 0;
    };

    const getScore = (pid, name) => {
      const freq = getFreq(pid, name);
      if (freq === 0) return 0;
      const daysAgo = lastUsedDay.get(pid) ?? daysWindow;
      const recencyWeight = 1 / (1 + daysAgo * 0.15);
      return freq * recencyWeight;
    };

    const getGroupRank = (pid, name) => {
      const freq = getFreq(pid, name);
      const isFav = favoritesSet.has(pid);
      if (isFav && freq > 0) return 0; // избранные + часто используемые
      if (freq > 0) return 1; // часто используемые
      if (isFav) return 2; // избранные, но без использования
      return 3;
    };

    // Сортируем по комбинированному скору
    const sorted = [...products]
      .filter(p => {
        const pid = String(p.id || p.product_id || p.name || '');
        if (!pid) return false;
        if (hiddenSet.has(pid)) return false; // Скрытые не показываем
        const freq = getFreq(pid, p.name);
        const isFav = favoritesSet.has(pid);
        return isFav || freq > 0; // Использованные или избранные
      })
      .sort((a, b) => {
        const aId = String(a.id || a.product_id || a.name || '');
        const bId = String(b.id || b.product_id || b.name || '');
        const aGroup = getGroupRank(aId, a.name);
        const bGroup = getGroupRank(bId, b.name);
        if (aGroup !== bGroup) return aGroup - bGroup;

        const aScore = getScore(aId, a.name);
        const bScore = getScore(bId, b.name);
        if (aGroup !== 2 && aScore !== bScore) return bScore - aScore;

        if (aGroup !== 2) {
          const aLast = lastUsedDay.get(aId) ?? 999;
          const bLast = lastUsedDay.get(bId) ?? 999;
          if (aLast !== bLast) return aLast - bLast;
        }

        return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
      });

    return sorted.slice(0, 20);
  }

  // === Категории для фильтрации ===
  const CATEGORIES = [
    { id: 'all', name: 'Все', icon: '📋' },
    { id: 'dairy', name: 'Молочные', icon: '🥛', match: ['молоч', 'сыр', 'творог', 'йогурт', 'кефир', 'молоко'] },
    { id: 'meat', name: 'Мясо', icon: '🍖', match: ['мяс', 'курин', 'говя', 'свин', 'индейк', 'птиц'] },
    { id: 'fish', name: 'Рыба', icon: '🐟', match: ['рыб', 'морепр', 'лосось', 'тунец', 'креветк'] },
    { id: 'veggies', name: 'Овощи', icon: '🥬', match: ['овощ', 'салат', 'огурец', 'помидор', 'капуст', 'морков'] },
    { id: 'fruits', name: 'Фрукты', icon: '🍎', match: ['фрукт', 'ягод', 'яблок', 'банан', 'апельс'] },
    { id: 'grains', name: 'Крупы', icon: '🌾', match: ['круп', 'каш', 'рис', 'гречк', 'овся', 'хлеб', 'макар'] },
    { id: 'sweets', name: 'Сладкое', icon: '🍬', match: ['сладк', 'конфет', 'шокол', 'торт', 'печень', 'десерт'] }
  ];

  // Проверка категории продукта
  function matchCategory(product, categoryId) {
    if (categoryId === 'all') return true;
    const cat = CATEGORIES.find(c => c.id === categoryId);
    if (!cat || !cat.match) return true;
    const name = (product.name || '').toLowerCase();
    const pCat = (product.category || '').toLowerCase();
    return cat.match.some(m => name.includes(m) || pCat.includes(m));
  }

  // === Компонент поиска продукта (Шаг 1) ===
  function ProductSearchStep({ data, onChange, context }) {
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [favorites, setFavorites] = useState(() =>
      HEYS.store?.getFavorites?.() || new Set()
    );
    const [hiddenProducts, setHiddenProducts] = useState(() =>
      HEYS.store?.getHiddenProducts?.() || new Set()
    );
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [showPhotoConfirm, setShowPhotoConfirm] = useState(false); // Модалка подтверждения
    const [pendingPhotoData, setPendingPhotoData] = useState(null);  // Данные для подтверждения
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);

    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, closeModal } = stepContext;

    const { dateKey = '', day: contextDay } = context || {};
    const usageWindowDays = 21;

    // 🔧 FIX: Реактивное состояние для продуктов с подпиской на синхронизацию
    // Это решает проблему: при открытии модалки сразу после создания приёма
    // продукты ещё не загружены из облака, но после heysSyncCompleted они появятся
    const [productsVersion, setProductsVersion] = useState(globalProductsVersion);
    const [usageStatsVersion, setUsageStatsVersion] = useState(0);

    // 🔒 Ref для пропуска первого sync (предотвращает мерцание)
    const initialSyncDoneRef = useRef(false);

    // Подписка на обновление продуктов (heysSyncCompleted или watch)
    useEffect(() => {
      const clearSearchCache = () => {
        try {
          HEYS?.SmartSearchWithTypos?.clearCache?.();
        } catch (e) {
          // no-op
        }
      };

      const refreshUsageFromHistory = () => {
        try {
          if (HEYS?.SmartSearchWithTypos?.syncUsageStatsFromDays) {
            HEYS.SmartSearchWithTypos.syncUsageStatsFromDays({
              daysWindow: usageWindowDays,
              dateKey: dateKey || new Date().toISOString().slice(0, 10),
              lsGet: HEYS.store?.get
            });
            setUsageStatsVersion(v => v + 1);
          }
        } catch (e) {
          // no-op
        }
      };

      const handleSyncComplete = (e) => {
        // 🔒 Пропускаем первый heysSyncCompleted — products уже загружены
        if (e?.type === 'heysSyncCompleted') {
          if (!initialSyncDoneRef.current) {
            initialSyncDoneRef.current = true;
            refreshUsageFromHistory();
            return;
          }
        }
        // console.log('[AddProductStep] 🔄 heysSyncCompleted → refreshing products');
        setProductsVersion(v => v + 1);
        clearSearchCache();
        refreshUsageFromHistory();
      };

      // 🆕 FIX v2: слушаем глобальное событие версии продуктов
      // Глобальные listeners регистрируются 1 раз при загрузке модуля
      // и dispatch'ат heys:products-version-changed для React компонентов
      const handleVersionChanged = (e) => {
        console.log('[AddProductStep] 🔄 handleVersionChanged fired', {
          event: e?.type,
          detail: e?.detail,
          prevVersion: productsVersion
        });
        setProductsVersion(v => {
          const next = v + 1;
          console.log('[AddProductStep] ✅ productsVersion updating', { prev: v, next });
          return next;
        });
        clearSearchCache();
      };

      window.addEventListener('heysSyncCompleted', handleSyncComplete);
      window.addEventListener('heys:products-version-changed', handleVersionChanged);

      // Также подписываемся через HEYS.products.watch если доступен
      let unwatchProducts = () => { };
      if (HEYS.products?.watch) {
        unwatchProducts = HEYS.products.watch(() => {
          // console.log('[AddProductStep] 🔄 products.watch → refreshing products');
          setProductsVersion(v => v + 1);
          clearSearchCache();
        });
      }

      return () => {
        window.removeEventListener('heysSyncCompleted', handleSyncComplete);
        window.removeEventListener('heys:products-version-changed', handleVersionChanged);
        unwatchProducts();
      };
    }, [dateKey, usageWindowDays]);

    // Всегда берём актуальные продукты из глобального стора (если появились новые)
    // productsVersion в зависимостях заставляет пересчитать при синхронизации
    const latestProducts = useMemo(() => {
      console.log('[AddProductStep] 🔄 latestProducts useMemo START', { productsVersion });
      const base = Array.isArray(context?.products) ? context.products : [];

      // Пробуем получить из HEYS.products.getAll()
      let storeProducts = [];
      if (HEYS.products?.getAll) {
        storeProducts = HEYS.products.getAll() || [];
      }

      // Fallback: напрямую из HEYS.store
      if (storeProducts.length === 0 && HEYS.store?.get) {
        storeProducts = HEYS.store.get('heys_products', []) || [];
      }

      // Fallback: из localStorage через U()
      if (storeProducts.length === 0) {
        const utils = U();
        if (utils.lsGet) {
          storeProducts = utils.lsGet('heys_products', []) || [];
        }
      }

      // Fallback: напрямую из localStorage
      if (storeProducts.length === 0) {
        const rawProducts = readStoredValue('heys_products', null);
        if (Array.isArray(rawProducts)) storeProducts = rawProducts;
      }

      storeProducts = Array.isArray(storeProducts) ? storeProducts : [];
      // Если store длиннее — используем его как основу
      const primary = storeProducts.length >= base.length ? storeProducts : base;
      const secondary = primary === storeProducts ? base : storeProducts;
      // Объединяем, убирая дубликаты по id/name
      const seen = new Set();
      const merged = [];
      const pushUnique = (p) => {
        if (!p) return;
        const pid = String(p.id ?? p.product_id ?? p.name);
        if (seen.has(pid)) return;
        seen.add(pid);
        merged.push(p);
      };
      primary.forEach(pushUnique);
      secondary.forEach(pushUnique);

      console.log('[AddProductStep] ✅ latestProducts useMemo DONE', {
        count: merged.length,
        sampleIds: merged.slice(0, 3).map(p => p.id),
        productsVersion
      });
      return merged;
    }, [context, productsVersion]);

    // 🌐 Результаты из общей базы (асинхронный поиск)
    const [sharedResults, setSharedResults] = useState([]);
    const [sharedLoading, setSharedLoading] = useState(false);

    useEffect(() => {
      const handleSharedUpdated = (event) => {
        const detail = event?.detail || {};
        const updatedId = detail.productId ?? detail.product?.id;
        if (updatedId == null) return;
        setSharedResults((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          let changed = false;
          const next = prev.map((p) => {
            if (String(p?.id) !== String(updatedId)) return p;
            changed = true;
            return {
              ...p,
              ...(detail.product || {}),
              id: p.id,
              portions: Array.isArray(detail.portions) ? detail.portions : (detail.product?.portions || p.portions)
            };
          });
          return changed ? next : prev;
        });
      };

      window.addEventListener('heys:shared-product-updated', handleSharedUpdated);
      return () => window.removeEventListener('heys:shared-product-updated', handleSharedUpdated);
    }, []);

    useEscapeToClose(closeModal, true);

    // Debug: проверяем что products пришли
    // useEffect(() => {
    //   console.log('[AddProductStep] products count:', latestProducts?.length);
    // }, [latestProducts]);

    // Фокус на input при монтировании
    useEffect(() => {
      setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    useEffect(() => {
      try {
        if (HEYS?.SmartSearchWithTypos?.syncUsageStatsFromDays) {
          HEYS.SmartSearchWithTypos.syncUsageStatsFromDays({
            daysWindow: usageWindowDays,
            dateKey: dateKey || new Date().toISOString().slice(0, 10),
            lsGet: HEYS.store?.get
          });
          setUsageStatsVersion(v => v + 1);
        }
      } catch (e) {
        // no-op
      }
    }, [dateKey, usageWindowDays]);

    // Debounce локального поиска
    useEffect(() => {
      const timer = setTimeout(() => {
        setSearch(searchInput);
      }, 200);

      return () => clearTimeout(timer);
    }, [searchInput]);

    // 🌐 Асинхронный поиск по общей базе (debounced)
    useEffect(() => {
      const trimmed = search.trim();
      if (trimmed.length < 2) {
        setSharedResults([]);
        return;
      }

      const timeoutId = setTimeout(async () => {
        setSharedLoading(true);
        console.log('[SharedSearch] Searching for:', trimmed);
        try {
          const result = await HEYS?.cloud?.searchSharedProducts?.(trimmed, { limit: 30 });
          console.log('[SharedSearch] Result:', result?.data?.length, 'products');
          if (result?.data) {
            // Преобразуем данные для совместимости с UI
            const normalized = result.data.map(p => {
              // Нормализация полей (snake_case → camelCase fallback)
              const protein100 = Number(p.protein100 ?? 0) || 0;
              const simple100 = Number(p.simple100 ?? 0) || 0;
              const complex100 = Number(p.complex100 ?? 0) || 0;
              const badFat100 = Number(p.badfat100 ?? p.badFat100 ?? 0) || 0;
              const goodFat100 = Number(p.goodfat100 ?? p.goodFat100 ?? 0) || 0;
              const trans100 = Number(p.trans100 ?? 0) || 0;

              // kcal100 — вычисляемое поле (не хранится в shared_products)
              // TEF-aware formula: protein*3 + carbs*4 + fat*9 (синхронизировано с heys_core_v12.js:computeDerived)
              const carbs100 = simple100 + complex100;
              const fat100 = badFat100 + goodFat100 + trans100;
              const kcal100 = Math.round(protein100 * 3 + carbs100 * 4 + fat100 * 9);

              return {
                ...p,
                protein100,
                simple100,
                complex100,
                badFat100,
                goodFat100,
                trans100,
                fiber100: Number(p.fiber100 ?? 0) || 0,
                gi: Number(p.gi ?? 0) || 0,
                harm: (HEYS.models?.normalizeHarm?.(p) ?? Number(p.harm ?? p.harmScore ?? p.harmscore ?? 0)) || 0,  // Canonical harm field
                // Вычисленные поля
                kcal100,
                carbs100,
                fat100,
                // Флаг что это из общей базы
                _fromShared: true
              };
            });
            console.log('[SharedSearch] Normalized first:', normalized[0]?.name, 'kcal100:', normalized[0]?.kcal100);
            setSharedResults(normalized);
          }
        } catch (err) {
          console.error('[AddProductStep] Shared search error:', err);
        } finally {
          setSharedLoading(false);
        }
      }, 300);

      return () => clearTimeout(timeoutId);
    }, [search]);

    // Умный список: частота + свежесть (объединяет "часто" и "последние")
    const usageStats = useMemo(() =>
      HEYS?.SmartSearchWithTypos?.getUsageStats?.() || new Map(),
      [productsVersion, usageStatsVersion]
    );

    const sessionUsageStats = useMemo(() => {
      const map = new Map();
      const dayData = contextDay || null;
      const meals = dayData?.meals || [];
      if (!Array.isArray(meals) || meals.length === 0) return map;

      const dateStr = dayData?.date || dateKey || new Date().toISOString().slice(0, 10);
      const dayTs = Date.parse(dateStr + 'T12:00:00') || Date.now();

      const bump = (key) => {
        if (!key) return;
        const curr = map.get(key);
        if (curr) {
          curr.count += 1;
          curr.lastUsed = Math.max(curr.lastUsed || 0, dayTs);
        } else {
          map.set(key, { count: 1, lastUsed: dayTs });
        }
      };

      meals.forEach((meal) => {
        (meal?.items || []).forEach((item) => {
          const pid = String(item?.product_id ?? item?.productId ?? '').trim();
          const name = String(item?.name || '').trim();
          if (pid) bump(pid);
          if (name) {
            bump(normalizeName(name));
            bump(name);
          }
        });
      });

      return map;
    }, [contextDay, dateKey]);

    const effectiveUsageStats = useMemo(() => {
      const base = usageStats instanceof Map ? usageStats : new Map();
      const session = sessionUsageStats instanceof Map ? sessionUsageStats : new Map();
      if (base.size === 0 && session.size === 0) return base;

      const merged = new Map(base);
      if (session.size === 0) return merged;

      const dateStr = dateKey || new Date().toISOString().slice(0, 10);
      const dayStart = Date.parse(dateStr + 'T00:00:00') || 0;

      session.forEach((s, key) => {
        if (!key) return;
        const curr = merged.get(key);
        if (!curr) {
          merged.set(key, { ...s });
          return;
        }
        const currLast = Number(curr.lastUsed || 0) || 0;
        const sessLast = Number(s.lastUsed || 0) || 0;
        const currHasToday = currLast >= dayStart;
        if (!currHasToday) {
          merged.set(key, {
            count: (Number(curr.count) || 0) + (Number(s.count) || 0),
            lastUsed: Math.max(currLast, sessLast)
          });
        }
      });

      return merged;
    }, [usageStats, sessionUsageStats, dateKey]);

    useEffect(() => {
      try {
        HEYS._usageStatsDebug = {
          ...(HEYS._usageStatsDebug || {}),
          modal: {
            size: effectiveUsageStats.size,
            source: usageStats.size > 0 ? 'stored' : (sessionUsageStats.size > 0 ? 'session' : 'empty'),
            products: latestProducts.length,
            dateKey: dateKey || new Date().toISOString().slice(0, 10)
          }
        };
      } catch (e) { }

      if (HEYS?.DEBUG_MODE) {
        const payload = HEYS._usageStatsDebug?.modal || {
          size: effectiveUsageStats.size,
          source: usageStats.size > 0 ? 'stored' : (sessionUsageStats.size > 0 ? 'session' : 'empty'),
          products: latestProducts.length,
          dateKey: dateKey || new Date().toISOString().slice(0, 10)
        };
        console.log('🔎 [UsageStats] snapshot', payload);
        if (window.DEV?.log) {
          window.DEV.log('🔎 [UsageStats] snapshot', payload);
        }
      }
    }, [effectiveUsageStats, usageStats.size, sessionUsageStats.size, latestProducts.length, dateKey]);

    const getUsageCount = useCallback((productId, productName) => {
      if (!productId && !productName) return 0;

      const nameRaw = String(productName || '').trim();
      const nameNorm = normalizeName(nameRaw);
      const nameSearchNorm = HEYS?.SmartSearchWithTypos?.utils?.normalizeText
        ? HEYS.SmartSearchWithTypos.utils.normalizeText(nameRaw)
        : nameNorm;

      const directStats = effectiveUsageStats.get(productId)
        || effectiveUsageStats.get(nameNorm)
        || effectiveUsageStats.get(nameSearchNorm)
        || effectiveUsageStats.get(nameRaw);

      const resolveCount = (stats) => {
        if (!stats || !stats.lastUsed) return 0;
        const daysAgo = Math.floor((Date.now() - stats.lastUsed) / (1000 * 60 * 60 * 24));
        if (daysAgo > usageWindowDays) return 0;
        return Number(stats.count) || 0;
      };

      const directCount = resolveCount(directStats);

      // Fallback: мягкий поиск по ключам статистики (подстрока)
      let best = directCount;
      const target = nameSearchNorm || nameNorm || nameRaw;
      if (!target || !effectiveUsageStats || effectiveUsageStats.size === 0) return 0;

      effectiveUsageStats.forEach((stats, key) => {
        if (best >= 9999) return;
        const k = String(key || '').trim();
        if (!k || k.length < 3) return;
        if (!target.includes(k) && !k.includes(target)) return;
        const c = resolveCount(stats);
        if (c > best) best = c;
      });

      return best;
    }, [effectiveUsageStats, usageWindowDays]);

    const smartProducts = useMemo(() =>
      computeSmartProducts(latestProducts, dateKey, {
        favorites,
        hidden: hiddenProducts,
        daysWindow: usageWindowDays,
        usageStats: effectiveUsageStats
      }),
      [latestProducts, dateKey, favorites, hiddenProducts, effectiveUsageStats, usageWindowDays]
    );

    // Поиск с фильтром категории
    // Используем normalizeText из SmartSearch (единый источник)
    const normalizeSearch = HEYS?.SmartSearchWithTypos?.utils?.normalizeText
      || ((text) => String(text || '').toLowerCase().replace(/ё/g, 'е'));
    const lc = normalizeSearch(search.trim());
    const searchResults = useMemo(() => {
      let results = [];

      if (lc) {
        // Умный поиск если доступен
        if (HEYS.SmartSearchWithTypos) {
          try {
            const result = HEYS.SmartSearchWithTypos.search(lc, latestProducts, {
              enablePhonetic: true,
              enableSynonyms: true,
              enableTranslit: true, // 🆕 рафа → rafa → Raffaello
              maxSuggestions: 30
            });
            if (result?.results?.length) results = result.results;
          } catch (e) {
            console.warn('[AddProductStep] Smart search error:', e);
          }
        }

        // Fallback с нормализацией ё→е (только если SmartSearch не дал результатов)
        if (!results.length) {
          results = latestProducts.filter(p =>
            normalizeSearch(p.name).includes(lc)
          );

          // Сортировка ТОЛЬКО для fallback — SmartSearch уже отсортирован по relevance!
          results.sort((a, b) => {
            const aName = normalizeSearch(a.name);
            const bName = normalizeSearch(b.name);
            const aStartsWith = aName.startsWith(lc) ? 0 : 1;
            const bStartsWith = bName.startsWith(lc) ? 0 : 1;
            if (aStartsWith !== bStartsWith) return aStartsWith - bStartsWith;
            // Затем по точному вхождению слова
            const aExact = aName.split(/\s+/).some(w => w === lc) ? 0 : 1;
            const bExact = bName.split(/\s+/).some(w => w === lc) ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            // Затем по длине названия (короткие = точнее)
            return aName.length - bName.length;
          });
        }
      }

      // Фильтр по категории
      if (selectedCategory !== 'all') {
        results = results.filter(p => matchCategory(p, selectedCategory));
      }

      return results.slice(0, 20);
    }, [lc, latestProducts, selectedCategory]);

    // 🌐 Объединённые результаты: личные + общая база (без дубликатов)
    const combinedResults = useMemo(() => {
      if (!lc) return [];

      // Фильтруем shared тоже по категории (иначе переключатель категории кажется «сломанный»)
      const sharedFiltered = selectedCategory !== 'all'
        ? sharedResults.filter(p => matchCategory(p, selectedCategory))
        : sharedResults;

      // Собираем кандидатов и пересчитываем скор по «реальному» совпадению,
      // чтобы семантические/косвенные личные совпадения не утаптывали точные shared-матчи.
      const candidates = [];

      // Простая функция нечеткого сравнения (Jaro-Winkler like для коротких строк)
      const isFuzzyMatch = (word, query) => {
        if (!word || !query) return false;
        if (word.includes(query)) return true;

        // Допускаем 1 ошибку/опечатку для слов длиннее 4 букв
        if (query.length > 3 && Math.abs(word.length - query.length) <= 2) {
          let errors = 0;
          let i = 0, j = 0;
          while (i < word.length && j < query.length) {
            if (word[i] !== query[j]) {
              errors++;
              if (errors > 1) return false;
              // Пробуем пропустить символ в одном из слов (вставка/удаление)
              if (word.length > query.length) i++;
              else if (query.length > word.length) j++;
              else { i++; j++; } // Замена
            } else {
              i++; j++;
            }
          }
          return true;
        }
        return false;
      };

      const pushCandidate = (p, source) => {
        if (!p) return;
        // Используем имя как есть, если нормализация вернула пустоту (защита от агрессивной очистки)
        let nameNorm = normalizeSearch(p.name || '');
        if (!nameNorm && p.name) nameNorm = p.name.toLowerCase().trim();

        if (!nameNorm) return;

        const baseRel = Number.isFinite(p.relevance) ? p.relevance : 0;
        const hasSubstring = nameNorm.includes(lc);
        const startsWith = nameNorm.startsWith(lc);

        // Разбиваем имя на слова для более умного анализа
        const nameWords = nameNorm.split(/[\s,().]+/); // Разделители: пробел, запятая, скобки, точка
        const exactWord = nameWords.some(w => w === lc);
        // Проверяем fuzzy совпадение для каждого слова запроса
        const fuzzyMatch = nameWords.some(w => isFuzzyMatch(w, lc));
        // Проверяем совпадение начала слова (3+ буквы) — спасает "савая" -> "савоярди" (совпадает "сав")
        const prefix3Match = lc.length >= 3 && nameWords.some(w => w.startsWith(lc.slice(0, 3)));

        // Базовый скор: используем relevance если есть + поправки
        let score = baseRel;

        if (hasSubstring) score += 40;
        else if (fuzzyMatch) score += 30; // Почти как точное, если похоже
        else if (prefix3Match) score += 20; // Начало совпадает — это уже неплохо

        if (startsWith) score += 15;
        if (exactWord) score += 10;

        // Если вообще нет подстрочного совпадения, fuzzy и даже префикса — сильно штрафуем
        if (!hasSubstring && !fuzzyMatch && !prefix3Match) score -= 35;

        // Лёгкий приоритет личным (при прочих равных)
        if (source === 'personal') score += 3;
        // Shared тоже важны, если они хорошо совпадают
        if (source === 'shared') score += 1;

        candidates.push({ ...p, _source: source, _score: score, _nameNorm: nameNorm });
      };

      searchResults.forEach(p => pushCandidate(p, 'personal'));
      sharedFiltered.forEach(p => pushCandidate(p, 'shared'));

      // Дедуп по нормализованному имени — оставляем лучший скор
      // 🔧 FIX: Приоритет продуктам с порциями (личные настройки пользователя)
      const bestByName = new Map();
      candidates.forEach(p => {
        const key = p._nameNorm;
        const prev = bestByName.get(key);
        if (!prev) {
          bestByName.set(key, p);
          return;
        }

        // Проверяем наличие порций
        const prevHasPortions = Array.isArray(prev.portions) && prev.portions.length > 0;
        const currHasPortions = Array.isArray(p.portions) && p.portions.length > 0;

        // Если у текущего есть порции, а у предыдущего нет — выбираем текущий
        if (currHasPortions && !prevHasPortions) {
          bestByName.set(key, p);
          return;
        }

        // Если у предыдущего есть порции, а у текущего нет — оставляем предыдущий
        if (prevHasPortions && !currHasPortions) {
          return;
        }

        // Иначе выбираем по score (как раньше)
        if ((p._score ?? 0) > (prev._score ?? 0)) {
          bestByName.set(key, p);
        }
      });

      const combined = Array.from(bestByName.values());

      combined.sort((a, b) => {
        const sa = a._score ?? 0;
        const sb = b._score ?? 0;
        if (sa !== sb) return sb - sa;
        // tie-break: personal выше shared
        if (a._source !== b._source) return a._source === 'personal' ? -1 : 1;
        // затем короче название выше
        return String(a.name || '').length - String(b.name || '').length;
      });

      return combined.slice(0, 25);
    }, [searchResults, sharedResults, lc, normalizeSearch, selectedCategory]);

    // "Возможно вы искали" — альтернативные запросы при пустых результатах
    const didYouMean = useMemo(() => {
      if (!lc || combinedResults.length > 0) return [];

      if (HEYS?.SmartSearchWithTypos?.getDidYouMean) {
        return HEYS.SmartSearchWithTypos.getDidYouMean(lc, latestProducts, 3);
      }
      return [];
    }, [lc, combinedResults.length, latestProducts]);

    // Toggle избранного
    const toggleFavorite = useCallback((e, productId) => {
      e.stopPropagation();
      if (HEYS.store?.toggleFavorite) {
        HEYS.store.toggleFavorite(productId);
        setFavorites(HEYS.store.getFavorites());
      }
    }, []);

    const toggleHidden = useCallback((e, productId, productName, isHiddenNow) => {
      e.stopPropagation();

      const name = productName || 'продукт';
      if (!isHiddenNow) {
        const confirmed = confirm(`Убрать "${name}" из быстрых продуктов?\n\nОн исчезнет из списка. Вернуть можно в профиле → Скрытые продукты.`);
        if (!confirmed) return;
      }

      if (HEYS.store?.toggleHiddenProduct) {
        HEYS.store.toggleHiddenProduct(productId);
        setHiddenProducts(HEYS.store.getHiddenProducts());
        setFavorites(HEYS.store.getFavorites());
      }
    }, []);

    // Выбор продукта — сразу переход на шаг граммов
    const selectProduct = useCallback((product) => {
      haptic('light');

      try {
        if (HEYS.store?.getHiddenProducts) {
          setHiddenProducts(HEYS.store.getHiddenProducts());
        }
      } catch (e) {
        // no-op
      }

      // Последние использованные граммы для этого продукта
      const productId = product.id ?? product.product_id ?? product.name;
      const lastGrams = lsGet(`heys_last_grams_${productId}`, null);
      const defaultGrams = lastGrams || 100;

      // 🔍 DEBUG: Подробный лог выбранного продукта
      const hasNutrients = !!(product.kcal100 || product.protein100 || product.carbs100);
      // console.log('[ProductSearchStep] selectProduct:', product.name, 'grams:', defaultGrams, {...});
      if (!hasNutrients) {
        console.error('🚨 [ProductSearchStep] CRITICAL: Product has NO nutrients!', product);
      }

      onChange({
        ...data,
        selectedProduct: product,
        grams: defaultGrams,
        lastGrams: lastGrams // Для отображения подсказки
      });
      // Автопереход на шаг граммов (index 4: search → grams)
      // Шаги create/portions/harm — только для НОВЫХ продуктов
      // Увеличен таймаут для гарантии обновления state
      if (goToStep) {
        setTimeout(() => goToStep(4, 'left'), 150);
      }
    }, [data, onChange, goToStep]);

    // Кнопка "Новый продукт" — открытие внешней формы создания
    const handleNewProduct = useCallback(() => {
      haptic('medium');
      onChange({ ...data, searchQuery: search });
      // Если есть внутренний шаг создания — перейти на него
      if (goToStep) {
        setTimeout(() => goToStep(1, 'left'), 10);
        return;
      }
      // Иначе, если передан onNewProduct из контекста — вызвать и закрыть модалку
      if (context?.onNewProduct) {
        context.onNewProduct();
        // Закрываем текущий StepModal, если возможно
        if (goToStep) {
          // StepModal не даёт явного close здесь — закроем через глобал
          HEYS.StepModal?.close?.();
        }
      }
    }, [context, goToStep, search, data, onChange]);

    // Обработчик выбора фото
    const handlePhotoSelect = useCallback((e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      haptic('medium');
      setSelectedPhoto(file);
      // console.log('[AddProductStep] Photo selected:', file.name, file.size, 'bytes');

      // Сжимаем фото перед сохранением (localStorage лимит ~5МБ)
      const MAX_SIZE = 800; // Максимальный размер по большей стороне
      const QUALITY = 0.7;  // Качество JPEG

      const img = new Image();
      img.onload = () => {
        // Расчёт новых размеров
        let { width, height } = img;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round(height * MAX_SIZE / width);
            width = MAX_SIZE;
          } else {
            width = Math.round(width * MAX_SIZE / height);
            height = MAX_SIZE;
          }
        }

        // Canvas для сжатия
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Конвертируем в JPEG (меньше размер чем PNG)
        const compressedData = canvas.toDataURL('image/jpeg', QUALITY);
        // console.log('[AddProductStep] Photo compressed:', ...);

        setPhotoPreview(compressedData);

        // Показываем превью для подтверждения
        setPendingPhotoData({
          compressedData,
          filename: file.name,
          originalSize: file.size
        });
        setShowPhotoConfirm(true);
      };

      img.onerror = () => {
        console.error('[AddProductStep] Failed to load image');
      };

      // Загружаем изображение из файла
      const reader = new FileReader();
      reader.onload = (event) => {
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);

      // Сбрасываем input чтобы можно было выбрать то же фото повторно
      e.target.value = '';
    }, []);

    // Подтверждение сохранения фото
    const confirmPhoto = useCallback(() => {
      if (!pendingPhotoData || !context?.onAddPhoto) {
        console.warn('[AddProductStep] Cannot confirm photo - missing data or callback');
        setShowPhotoConfirm(false);
        return;
      }

      haptic('success');
      context.onAddPhoto({
        mealIndex: context.mealIndex,
        photo: pendingPhotoData.compressedData,
        filename: pendingPhotoData.filename,
        timestamp: Date.now()
      });
      // console.log('[AddProductStep] Photo confirmed and added to meal:', context.mealIndex);

      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
    }, [pendingPhotoData, context]);

    // Отмена фото
    const cancelPhoto = useCallback(() => {
      haptic('light');
      setShowPhotoConfirm(false);
      setPendingPhotoData(null);
      setPhotoPreview(null);
      // console.log('[AddProductStep] Photo cancelled');
    }, []);

    // Открыть выбор фото
    const handlePhotoClick = useCallback(() => {
      haptic('medium');
      fileInputRef.current?.click();
    }, []);

    // Удаление продукта из базы
    const handleDeleteProduct = useCallback((e, product) => {
      e.stopPropagation();

      const name = product.name || 'продукт';
      if (!confirm(`Удалить "${name}" из базы?`)) return;

      haptic('medium');

      const U = HEYS.utils || {};
      const allProducts = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];
      const pid = String(product.id ?? product.product_id ?? product.name);
      const fingerprint = product.fingerprint || null;

      // 🆕 v4.8.0: Добавляем в игнор-лист чтобы autoRecover и cloud sync не восстанавливали
      if (HEYS.deletedProducts?.add) {
        HEYS.deletedProducts.add(name, pid, fingerprint);
      }

      // Фильтруем — убираем этот продукт
      const filtered = allProducts.filter(p => {
        const id = String(p.id ?? p.product_id ?? p.name);
        return id !== pid;
      });

      // Сохраняем через HEYS.products или HEYS.store.set (для синхронизации с облаком)
      if (HEYS.products?.setAll) {
        HEYS.products.setAll(filtered);
      } else if (HEYS.store?.set) {
        HEYS.store.set('heys_products', filtered);
      } else if (U.lsSet) {
        U.lsSet('heys_products', filtered);
        console.warn('[AddProductStep] ⚠️ Продукт удалён только локально (нет HEYS.store)');
      }

      // Обновляем context.products
      if (context?.onProductCreated) {
        // Костыль: триггерим обновление
      }

      // console.log('[AddProductStep] Продукт удалён:', name);

      // Перезапускаем поиск чтобы обновить список
      setSearch(s => s + ' ');
      setTimeout(() => setSearch(s => s.trim()), 10);
    }, [context]);

    // Рендер карточки продукта с подсветкой совпадений
    const renderProductCard = (product, showFavorite = true, showHide = true, showUsageCount = false) => {
      const pid = String(product.id ?? product.product_id ?? product.name);
      const isFav = favorites.has(pid);
      const isHidden = hiddenProducts.has(pid);
      const usageCount = showUsageCount ? getUsageCount(pid, product.name) : 0;
      const kcal = Math.round(product.kcal100 || 0);
      const prot = Math.round(product.protein100 || 0);
      const carbs = Math.round((product.simple100 || 0) + (product.complex100 || 0));
      const fat = Math.round((product.badFat100 || 0) + (product.goodFat100 || 0) + (product.trans100 || 0));
      const harmVal = product.harm ?? product.harmScore ?? product.harm100;
      const harmBg = getHarmBg(harmVal);

      // Флаг: продукт из общей базы (не из личной)
      const isFromShared = product._source === 'shared' || product._fromShared;

      // Подсветка совпадений в названии
      const highlightedName = lc && HEYS?.SmartSearchWithTypos?.renderHighlightedText
        ? HEYS.SmartSearchWithTypos.renderHighlightedText(product.name, search, React)
        : product.name;

      return React.createElement('div', {
        key: pid,
        className: 'aps-product-card',
        style: harmBg ? { background: harmBg } : undefined,
        onClick: () => selectProduct(product)
      },
        // Иконка категории
        product.category && React.createElement('span', {
          className: 'aps-product-icon'
        }, getCategoryIcon(product.category)),

        // Инфо
        React.createElement('div', { className: 'aps-product-info' },
          React.createElement('div', { className: 'aps-product-name' },
            highlightedName,
            // 🌐 Бейдж для продуктов из общей базы
            isFromShared && React.createElement('span', {
              className: 'aps-shared-badge'
            }, '🌐')
          ),
          React.createElement('div', { className: 'aps-product-meta' },
            React.createElement('span', { className: 'aps-meta-kcal' }, kcal + ' ккал'),
            React.createElement('span', { className: 'aps-meta-sep' }, '·'),
            React.createElement('span', { className: 'aps-meta-macros' },
              'Б ' + prot + ' | Ж ' + fat + ' | У ' + carbs
            ),
            showUsageCount && React.createElement(React.Fragment, null,
              React.createElement('span', { className: 'aps-meta-sep' }, '·'),
              React.createElement('span', { className: 'aps-product-usage' }, `Исп.: ${usageCount}×`)
            )
          )
        ),

        React.createElement('div', { className: 'aps-product-actions' },
          showHide && !isFromShared && React.createElement('button', {
            className: 'aps-hide-btn' + (isHidden ? ' aps-hide-btn--active' : ''),
            onClick: (e) => toggleHidden(e, pid, product.name, isHidden),
            title: isHidden ? 'Вернуть в список' : 'Скрыть из списка'
          }, '✕'),
          // Кнопка избранного — только для личных
          showFavorite && !isFromShared && React.createElement('button', {
            className: 'aps-fav-btn' + (isFav ? ' active' : ''),
            onClick: (e) => toggleFavorite(e, pid)
          }, isFav ? '★' : '☆')
        )
      );
    };

    // Что показывать: результаты поиска или умный список
    const showSearch = lc.length > 0;

    // Счётчик фото в текущем приёме
    const currentPhotoCount = context?.mealPhotos?.length || 0;
    const photoLimit = 10;
    const canAddPhoto = currentPhotoCount < photoLimit;

    return React.createElement('div', { className: 'aps-search-step' },
      // Модалка подтверждения фото
      showPhotoConfirm && pendingPhotoData && React.createElement('div', {
        className: 'photo-confirm-overlay',
        onClick: cancelPhoto
      },
        React.createElement('div', {
          className: 'photo-confirm-modal',
          onClick: e => e.stopPropagation()
        },
          React.createElement('div', { className: 'photo-confirm-header' }, 'Сохранить это фото?'),
          React.createElement('div', { className: 'photo-confirm-preview' },
            React.createElement('img', {
              src: pendingPhotoData.compressedData,
              alt: 'Превью фото'
            })
          ),
          React.createElement('div', { className: 'photo-confirm-info' },
            Math.round(pendingPhotoData.compressedData.length / 1024) + ' КБ'
          ),
          React.createElement('div', { className: 'photo-confirm-buttons' },
            React.createElement('button', {
              className: 'photo-confirm-btn cancel',
              onClick: cancelPhoto
            }, 'Отмена'),
            React.createElement('button', {
              className: 'photo-confirm-btn confirm',
              onClick: confirmPhoto
            }, 'Сохранить')
          )
        )
      ),

      // Скрытый input для выбора фото
      React.createElement('input', {
        ref: fileInputRef,
        type: 'file',
        accept: 'image/*',
        capture: 'environment', // Камера на мобильных
        style: { display: 'none' },
        onChange: handlePhotoSelect
      }),

      // === Фиксированная шапка: кнопки + поиск + категории ===
      React.createElement('div', { className: 'aps-fixed-header' },
        // Ряд кнопок: Добавить фото + Новый продукт
        React.createElement('div', { className: 'aps-action-buttons' },
          // Кнопка "Добавить фото" с счётчиком
          React.createElement('button', {
            className: 'aps-new-product-btn aps-photo-btn' + (!canAddPhoto ? ' disabled' : ''),
            onClick: canAddPhoto ? handlePhotoClick : null,
            disabled: !canAddPhoto,
            title: !canAddPhoto ? `Лимит ${photoLimit} фото` : 'Добавить фото'
          },
            React.createElement('span', { className: 'aps-new-icon' }, '📷'),
            React.createElement('span', null,
              currentPhotoCount > 0
                ? `Фото ${currentPhotoCount}/${photoLimit}`
                : 'Добавить фото'
            )
          ),
          // Кнопка "Новый продукт"
          React.createElement('button', {
            className: 'aps-new-product-btn',
            onClick: handleNewProduct
          },
            React.createElement('span', { className: 'aps-new-icon' }, '+'),
            React.createElement('span', null, 'Новый продукт')
          )
        ),

        // Поле поиска
        React.createElement('div', { className: 'aps-search-container' },
          React.createElement('span', { className: 'aps-search-icon' }, '🔍'),
          React.createElement('input', {
            ref: inputRef,
            type: 'text',
            className: 'aps-search-input',
            placeholder: 'Поиск продукта...',
            value: searchInput,
            onChange: (e) => setSearchInput(e.target.value),
            autoComplete: 'off',
            autoCorrect: 'off',
            spellCheck: false
          }),
          search && React.createElement('button', {
            className: 'aps-search-clear',
            onClick: () => {
              setSearchInput('');
              setSearch('');
            }
          }, '×')
        )
      ),

      // === Скроллируемый список продуктов ===
      React.createElement('div', { className: 'aps-products-scroll' },
        // Результаты поиска
        showSearch && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-section-title' },
            combinedResults.length > 0
              ? `Найдено: ${combinedResults.length}${sharedLoading ? ' ⏳' : ''}`
              : (sharedLoading ? '⏳ Поиск...' : 'Ничего не найдено')
          ),
          combinedResults?.length > 0 && React.createElement('div', { className: 'aps-products-list' },
            combinedResults.map(p => renderProductCard(p, true, false))
          ),
          // Пустой результат с "Возможно вы искали"
          combinedResults.length === 0 && !sharedLoading && React.createElement('div', { className: 'aps-empty' },
            React.createElement('span', null, '😕'),

            // "Возможно вы искали" — кликабельные альтернативы
            didYouMean.length > 0 && React.createElement('div', {
              className: 'aps-did-you-mean',
              style: {
                marginTop: '12px',
                padding: '12px',
                backgroundColor: 'rgba(255, 213, 0, 0.1)',
                borderRadius: '8px',
                textAlign: 'left'
              }
            },
              React.createElement('div', {
                style: {
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px'
                }
              }, '💡 Возможно вы искали:'),
              React.createElement('div', {
                style: {
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px'
                }
              },
                didYouMean.map((item, i) =>
                  React.createElement('button', {
                    key: i,
                    onClick: () => {
                      setSearchInput(item.text);
                      setSearch(item.text);
                    },
                    style: {
                      padding: '6px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '16px',
                      backgroundColor: 'var(--bg-card)',
                      cursor: 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }
                  },
                    React.createElement('span', null, item.text),
                    item.label && React.createElement('span', {
                      style: {
                        fontSize: '10px',
                        color: 'var(--text-tertiary)',
                        marginLeft: '4px'
                      }
                    }, item.label)
                  )
                )
              )
            ),

            !didYouMean.length && React.createElement('span', null, 'Попробуйте другой запрос'),

            React.createElement('button', {
              className: 'aps-add-new-btn',
              onClick: handleNewProduct,
              style: { marginTop: didYouMean.length > 0 ? '12px' : '8px' }
            }, '+ Добавить "' + search + '"')
          )
        ),

        // Умный список: часто + недавно используемые (объединённый)
        !showSearch && smartProducts?.length > 0 && React.createElement('div', { className: 'aps-section' },
          React.createElement('div', { className: 'aps-section-title' }, '⚡ Ваши продукты'),
          React.createElement('div', { className: 'aps-products-list' },
            smartProducts.map(p => renderProductCard(p, true, true, true))
          )
        )
      )
    );
  }

  const CREATE_PRODUCT_AI_PROMPT_FALLBACK = `Сделай одну текстовую строку в формате "Ключ: значение" (каждое поле с новой строки). Никакого JSON/кода. Все значения на 100г.

ОБЯЗАТЕЛЬНО:
Название: X
Ккал: X
Углеводы: X
Простые: X
Сложные: X
Белок: X
Жиры: X
Вредные жиры: X
Полезные жиры: X
Транс-жиры: X
Клетчатка: X
ГИ: X
Вред: X

ОПЦИОНАЛЬНО (если знаешь — добавь):
Натрий: X
Омега-3: X
Омега-6: X
NOVA: 1-4
Добавки: E621, E330 (если нет — "нет")
Нутриентная плотность: X
Органик: 0/1
Цельнозерновой: 0/1
Ферментированный: 0/1
Сырой: 0/1
Витамин A: X
Витамин C: X
Витамин D: X
Витамин E: X
Витамин K: X
Витамин B1: X
Витамин B2: X
Витамин B3: X
Витамин B6: X
Витамин B9: X
Витамин B12: X
Кальций: X
Железо: X
Магний: X
Фосфор: X
Калий: X
Цинк: X
Селен: X
Йод: X`;

  const CREATE_PRODUCT_AI_EXAMPLE = `Название: Перец болгарский свежий
Ккал: 31
Углеводы: 6
Простые: 4
Сложные: 2
Белок: 1
Жиры: 0.3
Вредные жиры: 0.1
Полезные жиры: 0.2
Транс-жиры: 0
Клетчатка: 2.1
ГИ: 15
Вред: 0
Натрий: 2
Омега-3: 0
Омега-6: 0
NOVA: 1
Добавки: нет
Органик: 0
Цельнозерновой: 0
Ферментированный: 0
Сырой: 1
Витамин A: 17.4
Витамин C: 141.1
Витамин D: 0
Витамин E: 10.5
Витамин K: 4.1
Витамин B1: 4.5
Витамин B2: 6.5
Витамин B3: 6.1
Витамин B6: 17.1
Витамин B9: 11.5
Витамин B12: 0
Кальций: 0.7
Железо: 2.4
Магний: 3
Фосфор: 3.7
Калий: 6
Цинк: 2.3
Селен: 0.2
Йод: 0`;

  // === Компонент создания нового продукта (Шаг create) ===
  function CreateProductStep({ data, onChange, context, stepData }) {
    // Берём поисковый запрос для предзаполнения названия
    const searchQuery = stepData?.search?.searchQuery || '';
    const [pasteText, setPasteText] = useState('');
    const [error, setError] = useState('');
    const [parsedPreview, setParsedPreview] = useState(null);
    const textareaRef = useRef(null);

    // 🌐 Публикация в общую базу (по умолчанию включено)
    const [publishToShared, setPublishToShared] = useState(true);

    // Определяем тип пользователя (куратор или клиент по PIN)
    const isCurator = isCuratorUser();

    // Доступ к навигации StepModal
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, closeModal, updateStepData } = stepContext;

    useEscapeToClose(closeModal, true);

    // Фокус на textarea при монтировании
    useEffect(() => {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }, []);

    const draftKey = 'heys_product_draft';

    useEffect(() => {
      const utils = U();
      const draft = HEYS.store?.get?.(draftKey, null) ?? utils.lsGet?.(draftKey, null);
      if (!draft || pasteText) return;
      if (draft.pasteText != null) setPasteText(draft.pasteText);
      if (typeof draft.publishToShared === 'boolean') setPublishToShared(draft.publishToShared);
    }, []);

    useEffect(() => {
      const utils = U();
      const timer = setTimeout(() => {
        const payload = {
          pasteText,
          publishToShared
        };
        if (HEYS.store?.set) {
          HEYS.store.set(draftKey, payload);
          return;
        }
        if (utils.lsSet) {
          utils.lsSet(draftKey, payload);
        }
      }, 500);

      return () => clearTimeout(timer);
    }, [pasteText, publishToShared]);

    const MISSING_FIELD_LABELS = {
      kcal100: 'Ккал',
      carbs100: 'Углеводы',
      simple100: 'Простые',
      complex100: 'Сложные',
      protein100: 'Белок',
      fat100: 'Жиры',
      badFat100: 'Вредные жиры',
      goodFat100: 'Полезные жиры',
      trans100: 'Транс-жиры',
      fiber100: 'Клетчатка',
      gi: 'ГИ',
      harm: 'Вред'
    };

    const countExtendedFields = useCallback((product) => {
      if (!product) return 0;
      const fields = [
        'sodium100', 'omega3_100', 'omega6_100', 'nova_group', 'additives', 'nutrient_density',
        'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
        'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
        'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
      ];

      return fields.reduce((count, field) => {
        const value = product[field];
        if (Array.isArray(value)) return value.length > 0 ? count + 1 : count;
        if (typeof value === 'boolean') return count + 1;
        return value != null ? count + 1 : count;
      }, 0);
    }, []);

    const formatMissingFields = useCallback((fields) => {
      return fields
        .map((field) => MISSING_FIELD_LABELS[field] || field)
        .join(', ');
    }, []);

    const PREVIEW_FIELDS = useMemo(() => ([
      { key: 'kcal100', label: 'Ккал (100г)', unit: 'ккал' },
      { key: 'carbs100', label: 'Углеводы (100г)', unit: 'г' },
      { key: 'simple100', label: 'Простые (100г)', unit: 'г' },
      { key: 'complex100', label: 'Сложные (100г)', unit: 'г' },
      { key: 'protein100', label: 'Белок (100г)', unit: 'г' },
      { key: 'fat100', label: 'Жиры (100г)', unit: 'г' },
      { key: 'badFat100', label: 'Вредные жиры (100г)', unit: 'г' },
      { key: 'goodFat100', label: 'Полезные жиры (100г)', unit: 'г' },
      { key: 'trans100', label: 'Транс-жиры (100г)', unit: 'г' },
      { key: 'fiber100', label: 'Клетчатка (100г)', unit: 'г' },
      { key: 'gi', label: 'ГИ' },
      { key: 'harm', label: 'Вред' },
      { key: 'sodium100', label: 'Натрий (100г)', unit: 'мг' },
      { key: 'omega3_100', label: 'Омега-3 (100г)', unit: 'г' },
      { key: 'omega6_100', label: 'Омега-6 (100г)', unit: 'г' },
      { key: 'nova_group', label: 'NOVA группа' },
      { key: 'additives', label: 'Добавки' },
      { key: 'nutrient_density', label: 'Нутр. плотность', unit: '%' },
      { key: 'is_organic', label: 'Органик', type: 'bool' },
      { key: 'is_whole_grain', label: 'Цельнозерн.', type: 'bool' },
      { key: 'is_fermented', label: 'Ферментир.', type: 'bool' },
      { key: 'is_raw', label: 'Сырой', type: 'bool' },
      { key: 'vitamin_a', label: 'Витамин A', unit: '%' },
      { key: 'vitamin_c', label: 'Витамин C', unit: '%' },
      { key: 'vitamin_d', label: 'Витамин D', unit: '%' },
      { key: 'vitamin_e', label: 'Витамин E', unit: '%' },
      { key: 'vitamin_k', label: 'Витамин K', unit: '%' },
      { key: 'vitamin_b1', label: 'Витамин B1', unit: '%' },
      { key: 'vitamin_b2', label: 'Витамин B2', unit: '%' },
      { key: 'vitamin_b3', label: 'Витамин B3', unit: '%' },
      { key: 'vitamin_b6', label: 'Витамин B6', unit: '%' },
      { key: 'vitamin_b9', label: 'Витамин B9', unit: '%' },
      { key: 'vitamin_b12', label: 'Витамин B12', unit: '%' },
      { key: 'calcium', label: 'Кальций', unit: '%' },
      { key: 'iron', label: 'Железо', unit: '%' },
      { key: 'magnesium', label: 'Магний', unit: '%' },
      { key: 'phosphorus', label: 'Фосфор', unit: '%' },
      { key: 'potassium', label: 'Калий', unit: '%' },
      { key: 'zinc', label: 'Цинк', unit: '%' },
      { key: 'selenium', label: 'Селен', unit: '%' },
      { key: 'iodine', label: 'Йод', unit: '%' }
    ]), []);

    const formatPreviewValue = useCallback((product, field) => {
      if (!product) return '—';
      const value = product[field.key];
      if (field.type === 'bool') {
        if (value === true) return 'да';
        if (value === false) return 'нет';
        return '—';
      }
      if (Array.isArray(value)) {
        return value.length ? value.join(', ') : '—';
      }
      if (value === null || value === undefined || value === '') return '—';
      const suffix = field.unit ? ` ${field.unit}` : '';
      return `${value}${suffix}`;
    }, []);

    // Парсинг вставленного текста (копия логики из heys_core_v12.js)
    const parseProductLine = useCallback((text) => {
      if (!text || !text.trim()) return null;

      // Регулярки из heys_core_v12.js
      const INVIS = /[\u00A0\u1680\u180E\u2000-\u200A\u200B-\u200F\u202F\u205F\u3000\uFEFF]/g;
      const NUM_RE = /[-+]?\d+(?:[\.,]\d+)?/g;

      // Нормализация строки
      let clean = text.replace(INVIS, ' ');
      clean = clean.replace(/\u060C/g, ',').replace(/\u066B/g, ',').replace(/\u066C/g, ',').replace(/\u201A/g, ',');
      clean = clean.replace(/\u00B7/g, '.').replace(/[–—−]/g, '-').replace(/%/g, '');
      clean = clean.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();

      // Извлекаем числа
      const tokens = clean.match(NUM_RE) || [];
      if (!tokens.length) return null;

      // Берём последние 12 чисел
      let last = tokens.slice(-12);
      if (last.length < 12) {
        last = Array(12 - last.length).fill('0').concat(last);
      }

      // Находим позицию первого числа для извлечения названия
      const toNum = (x) => {
        if (x === undefined || x === null) return 0;
        const s = String(x).trim().replace(',', '.');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };

      // Поиск позиции первого токена
      let start = 0;
      let firstPos = clean.length;
      for (const tok of last) {
        const idx = clean.indexOf(tok, start);
        if (idx !== -1 && idx < firstPos) {
          firstPos = idx;
          break;
        }
        if (idx !== -1) start = idx + tok.length;
      }

      const name = clean.slice(0, firstPos).trim() || 'Без названия';
      const nums = last.map(toNum);

      // Порядок: kcal, carbs (total), simple, complex, protein, fat (total), bad, good, trans, fiber, gi, harm
      const [kcal, carbs, simple, complex, protein, fat, bad, good, trans, fiber, gi, harm] = nums;

      // Вычисляем производные (приоритет totals из 12 полей)
      const derivedCarbs = (Number.isFinite(carbs) && carbs > 0) ? carbs : (simple + complex);
      const derivedFat = (Number.isFinite(fat) && fat > 0) ? fat : (bad + good + trans);
      // TEF-aware formula: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g (Atwater)
      const kcal100 = 3 * protein + 4 * derivedCarbs + 9 * derivedFat;

      return {
        id: Math.random().toString(36).slice(2, 10),
        name,
        simple100: simple,
        complex100: complex,
        protein100: protein,
        badFat100: bad,
        goodFat100: good,
        trans100: trans,
        fiber100: fiber,
        gi: gi,
        harm: harm,  // Canonical harm field
        carbs100: Math.round(derivedCarbs * 10) / 10,
        fat100: Math.round(derivedFat * 10) / 10,
        kcal100: Math.round(kcal100 * 10) / 10,
        createdAt: Date.now()
      };
    }, []);

    // Ref для onChange чтобы не вызывать лишние ререндеры
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Асинхронное вычисление fingerprint для локального продукта
    const ensureProductFingerprint = useCallback(async (product) => {
      if (!product || product.fingerprint) return product;
      if (!HEYS.models?.computeProductFingerprint) return product;
      try {
        const fingerprint = await HEYS.models.computeProductFingerprint(product);
        if (!fingerprint) return product;
        return { ...product, fingerprint };
      } catch {
        return product;
      }
    }, []);

    // При изменении текста — пытаемся распарсить (с debounce)
    useEffect(() => {
      if (!pasteText.trim()) {
        setParsedPreview(null);
        setError('');
        return;
      }

      // Debounce парсинга чтобы не тормозить при быстром вводе
      const timer = setTimeout(() => {
        const looksLikeAi = /[:=]/.test(pasteText) && /[а-яa-z]/i.test(pasteText);
        const aiParsed = HEYS.models?.parseAIProductString
          ? HEYS.models.parseAIProductString(pasteText, { defaultName: searchQuery || 'Без названия' })
          : null;

        if (looksLikeAi && aiParsed?.product) {
          if (aiParsed.missingFields?.length) {
            setParsedPreview(null);
            setError('Не хватает полей: ' + formatMissingFields(aiParsed.missingFields));
            return;
          }
          setParsedPreview(aiParsed.product);
          setError('');
          onChangeRef.current?.(prev => ({ ...prev, newProduct: aiParsed.product }));
          return;
        }

        const parsed = parseProductLine(pasteText);
        if (parsed) {
          setParsedPreview(parsed);
          setError('');
          onChangeRef.current?.(prev => ({ ...prev, newProduct: parsed }));
        } else if (looksLikeAi) {
          setParsedPreview(null);
          setError('Не удалось распознать AI-строку. Проверьте формат с ключами.');
        } else {
          setParsedPreview(null);
          setError('Не удалось распознать данные. Формат: Название + 12 чисел.');
        }
      }, 150);

      return () => clearTimeout(timer);
    }, [pasteText, parseProductLine, searchQuery, formatMissingFields]);

    // Подготовить продукт и перейти на шаг вредности (БЕЗ СОХРАНЕНИЯ В БАЗУ!)
    // Сохранение происходит ПОСЛЕ подтверждения вредности в HarmSelectStep
    const handleCreate = useCallback(async () => {
      if (!parsedPreview) return;

      haptic('medium');

      const preparedProduct = await ensureProductFingerprint(parsedPreview);
      if (preparedProduct?.fingerprint && preparedProduct !== parsedPreview) {
        setParsedPreview(preparedProduct);
      }

      console.log('[CreateProductStep] 📝 Подготовлен продукт:', preparedProduct?.name || parsedPreview.name);
      console.log('[CreateProductStep] ⏭️ Переходим на шаг порций (сохранение будет после вредности)');

      // 1. Обновляем данные текущего шага (БЕЗ сохранения в базу!)
      onChange({
        ...data,
        newProduct: preparedProduct,
        selectedProduct: preparedProduct,
        grams: 100
      });

      // 4. ТАКЖЕ обновляем данные шага harm и grams (чтобы сразу видели продукт)
      if (updateStepData) {
        updateStepData('harm', {
          product: preparedProduct
        });
        updateStepData('grams', {
          selectedProduct: preparedProduct,
          grams: 100
        });
      }

      // 5. Переходим на шаг порций (index 2) перед подтверждением вредности
      // Увеличен таймаут для гарантии обновления state
      if (goToStep) {
        setTimeout(() => goToStep(2, 'left'), 150);
      }
    }, [parsedPreview, data, onChange, context, goToStep, updateStepData, publishToShared, isCurator, ensureProductFingerprint]);

    // Авто-добавление fingerprint для превью (после парсинга)
    useEffect(() => {
      let active = true;
      if (!parsedPreview || parsedPreview.fingerprint) return undefined;

      (async () => {
        const updated = await ensureProductFingerprint(parsedPreview);
        if (!active || !updated?.fingerprint || updated.fingerprint === parsedPreview.fingerprint) return;
        setParsedPreview(updated);
        onChangeRef.current?.((prev) => ({ ...prev, newProduct: updated }));
      })();

      return () => {
        active = false;
      };
    }, [parsedPreview, ensureProductFingerprint]);

    const aiPromptText = useMemo(() => {
      const name = searchQuery || 'Название';
      if (HEYS.models?.generateAIProductStringPrompt) {
        return HEYS.models.generateAIProductStringPrompt(name);
      }
      return CREATE_PRODUCT_AI_PROMPT_FALLBACK.replace('Название: X', `Название: ${name}`);
    }, [searchQuery]);

    const handleCopyPrompt = useCallback(async () => {
      haptic('light');
      const text = aiPromptText;
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          HEYS.Toast?.success?.('Промпт скопирован');
          return;
        }
      } catch (e) {
        // fallback below
      }

      try {
        const temp = document.createElement('textarea');
        temp.value = text;
        temp.setAttribute('readonly', '');
        temp.style.position = 'absolute';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        HEYS.Toast?.success?.('Промпт скопирован');
      } catch (e) {
        HEYS.Toast?.warning?.('Не удалось скопировать промпт');
      }
    }, [aiPromptText]);

    return React.createElement('div', { className: 'aps-create-step' },
      // Заголовок
      React.createElement('div', { className: 'aps-create-header' },
        React.createElement('span', { className: 'aps-create-icon' }, '➕'),
        React.createElement('span', { className: 'aps-create-title' }, 'Создать новый продукт')
      ),

      // Подсказка о поисковом запросе
      searchQuery && React.createElement('div', { className: 'aps-create-search-hint' },
        '🔍 Вы искали: ',
        React.createElement('strong', null, searchQuery)
      ),

      // Инструкция
      React.createElement('div', { className: 'aps-create-hint' },
        'Вставьте строку с данными продукта:',
        React.createElement('br'),
        React.createElement('span', { className: 'aps-create-format' },
          'Название: …\nКкал: …\nУглеводы: …\nПростые: …\nСложные: …\nБелок: …\nЖиры: …\nВредные жиры: …\nПолезные жиры: …\nТранс-жиры: …\nКлетчатка: …\nГИ: …\nВред: …'
        )
      ),

      React.createElement('div', { className: 'aps-create-prompt-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'aps-create-prompt-btn',
          onClick: handleCopyPrompt
        }, '📋 Скопировать промпт для ИИ'),
        React.createElement('span', { className: 'aps-create-prompt-note' }, 'Под формат новой схемы')
      ),

      // Textarea для вставки
      React.createElement('textarea', {
        ref: textareaRef,
        className: 'aps-create-textarea',
        placeholder: searchQuery
          ? `Название: ${searchQuery}\nКкал: 120\nУглеводы: 22\nПростые: 2\nСложные: 20\nБелок: 4\nЖиры: 2\nВредные жиры: 0.5\nПолезные жиры: 1.5\nТранс-жиры: 0\nКлетчатка: 3\nГИ: 40\nВред: 0`
          : 'Название: Овсянка на воде\nКкал: 120\nУглеводы: 22\nПростые: 2\nСложные: 20\nБелок: 4\nЖиры: 2\nВредные жиры: 0.5\nПолезные жиры: 1.5\nТранс-жиры: 0\nКлетчатка: 3\nГИ: 40\nВред: 0',
        value: pasteText,
        onChange: (e) => setPasteText(e.target.value),
        rows: 8
      }),

      React.createElement('div', { className: 'aps-create-example-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'aps-create-example-btn',
          onClick: () => setPasteText(CREATE_PRODUCT_AI_EXAMPLE)
        }, '🧪 Вставить пример'),
        React.createElement('span', { className: 'aps-create-example-note' }, 'Формат для поля вставки')
      ),

      // Ошибка
      error && React.createElement('div', { className: 'aps-create-error' }, '⚠️ ' + error),

      // Превью распознанного продукта
      parsedPreview && React.createElement('div', { className: 'aps-create-preview' },
        React.createElement('div', { className: 'aps-preview-title' }, '✅ Распознано:'),
        React.createElement('div', { className: 'aps-preview-name' }, parsedPreview.name),
        // Основные макросы
        React.createElement('div', { className: 'aps-preview-macros' },
          React.createElement('span', { className: 'aps-preview-kcal' }, parsedPreview.kcal100 + ' ккал'),
          React.createElement('span', null, 'Б ' + parsedPreview.protein100 + 'г'),
          React.createElement('span', null, 'Ж ' + parsedPreview.fat100 + 'г'),
          React.createElement('span', null, 'У ' + parsedPreview.carbs100 + 'г')
        ),
        // Детальная таблица всех параметров
        React.createElement('div', { className: 'aps-preview-details' },
          PREVIEW_FIELDS.map((field) => React.createElement('div', { className: 'aps-preview-row', key: field.key },
            React.createElement('span', { className: 'aps-preview-label' }, field.label),
            React.createElement('span', { className: 'aps-preview-value' }, formatPreviewValue(parsedPreview, field))
          ))
        )
      ),

      // 🌐 Checkbox: Опубликовать в общую базу
      parsedPreview && React.createElement('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 12px',
          marginTop: '8px',
          background: 'var(--bg-secondary, #f3f4f6)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px'
        }
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: publishToShared,
          onChange: (e) => setPublishToShared(e.target.checked),
          style: { width: '18px', height: '18px', accentColor: '#22c55e' }
        }),
        React.createElement('span', null, '🌐 Опубликовать в общую базу'),
        React.createElement('span', {
          style: { fontSize: '11px', color: 'var(--text-muted, #6b7280)', marginLeft: 'auto' }
        }, isCurator ? 'сразу доступен всем' : 'на модерацию')
      ),

      // Кнопка добавить
      React.createElement('button', {
        className: 'aps-create-btn' + (parsedPreview ? ' active' : ''),
        onClick: handleCreate,
        disabled: !parsedPreview
      },
        parsedPreview
          ? '✓ Добавить «' + parsedPreview.name.slice(0, 20) + (parsedPreview.name.length > 20 ? '...' : '') + '»'
          : 'Вставьте данные продукта'
      ),

      // Подсказка про формат
      React.createElement('div', { className: 'aps-create-tip' },
        '💡 Скопируйте строку из таблицы Google Sheets или Excel. Поддерживаются запятые и точки.'
      )
    );
  }

  // === Шаг 1: Редактор базовых полей продукта ===
  function ProductEditBasicStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData, closeModal } = stepContext;

    useEscapeToClose(closeModal, true);

    const sourceProduct = context?.editProduct
      || stepData?.edit_extra?.product
      || stepData?.edit_basic?.product
      || stepData?.portions?.product
      || data?.product;

    const initialForm = useMemo(() => {
      const p = sourceProduct || {};
      const simple = toNum(p.simple100, 0);
      const complex = toNum(p.complex100, 0);
      const bad = toNum(p.badFat100 ?? p.badfat100, 0);
      const good = toNum(p.goodFat100 ?? p.goodfat100, 0);
      const trans = toNum(p.trans100, 0);
      const carbs = toNum(p.carbs100 ?? (simple + complex), 0);
      const fat = toNum(p.fat100 ?? (bad + good + trans), 0);
      const protein = toNum(p.protein100, 0);
      const kcal = toNum(p.kcal100 ?? (protein * 4 + carbs * 4 + fat * 9), 0);
      const harmVal = HEYS.models?.normalizeHarm?.(p) ?? toNum(p.harm, 0);

      return {
        name: p.name || '',
        kcal100: kcal ? String(kcal) : '',
        carbs100: carbs ? String(carbs) : '',
        simple100: simple ? String(simple) : '',
        complex100: complex ? String(complex) : '',
        protein100: protein ? String(protein) : '',
        fat100: fat ? String(fat) : '',
        badFat100: bad ? String(bad) : '',
        goodFat100: good ? String(good) : '',
        trans100: trans ? String(trans) : '',
        fiber100: p.fiber100 ? String(p.fiber100) : '',
        gi: p.gi != null ? String(p.gi) : '',
        harm: harmVal != null ? String(harmVal) : ''
      };
    }, [sourceProduct]);

    const [form, setForm] = useState(initialForm);

    useEffect(() => {
      setForm(initialForm);
    }, [initialForm]);

    const updateField = useCallback((key, value) => {
      setForm((prev) => ({
        ...prev,
        [key]: value
      }));
    }, []);

    const isInvalidNumber = useCallback((value) => {
      if (value == null || value === '') return false;
      const n = Number(String(value).trim().replace(',', '.'));
      return !Number.isFinite(n) || n < 0;
    }, []);

    const computed = useMemo(() => {
      const simple = toNum(form.simple100, 0);
      const complex = toNum(form.complex100, 0);
      const protein = toNum(form.protein100, 0);
      const bad = toNum(form.badFat100, 0);
      const good = toNum(form.goodFat100, 0);
      const trans = toNum(form.trans100, 0);
      const partsCarbs = simple + complex;
      const partsFat = bad + good + trans;
      const carbsTotalInput = toNum(form.carbs100, 0);
      const fatTotalInput = toNum(form.fat100, 0);
      const carbsTotal = carbsTotalInput || partsCarbs;
      const fatTotal = fatTotalInput || partsFat;
      const kcalCalc = Math.round((protein * 4 + carbsTotal * 4 + fatTotal * 9) * 10) / 10;
      const kcalInput = toNum(form.kcal100, 0);

      const carbsDiff = carbsTotalInput > 0 ? Math.abs(carbsTotalInput - partsCarbs) : 0;
      const fatDiff = fatTotalInput > 0 ? Math.abs(fatTotalInput - partsFat) : 0;
      const kcalDiff = kcalInput > 0 ? Math.abs(kcalInput - kcalCalc) : 0;

      return {
        carbsTotal: Math.round(carbsTotal * 10) / 10,
        fatTotal: Math.round(fatTotal * 10) / 10,
        kcalCalc,
        partsCarbs: Math.round(partsCarbs * 10) / 10,
        partsFat: Math.round(partsFat * 10) / 10,
        carbsDiff,
        fatDiff,
        kcalDiff,
        hasCarbsConflict: carbsDiff > 0.5,
        hasFatConflict: fatDiff > 0.5,
        hasKcalConflict: kcalDiff > 20
      };
    }, [form]);

    const buildUpdatedProduct = useCallback(() => {
      const base = sourceProduct || {};
      const name = String(form.name || base.name || '').trim() || 'Без названия';
      const simple100 = toNum(form.simple100, 0);
      const complex100 = toNum(form.complex100, 0);
      const protein100 = toNum(form.protein100, 0);
      const badFat100 = toNum(form.badFat100, 0);
      const goodFat100 = toNum(form.goodFat100, 0);
      const trans100 = toNum(form.trans100, 0);
      const fiber100 = toNum(form.fiber100, 0);
      const gi = toNum(form.gi, null);
      const harmInput = form.harm === '' ? null : toNum(form.harm, null);

      const carbsTotal = toNum(form.carbs100, 0);
      const fatTotal = toNum(form.fat100, 0);

      let finalSimple = simple100;
      let finalComplex = complex100;
      if (carbsTotal > 0) {
        if (!finalSimple && !finalComplex) {
          finalSimple = 0;
          finalComplex = carbsTotal;
        } else if (!finalComplex && finalSimple && carbsTotal > finalSimple) {
          finalComplex = Math.max(0, carbsTotal - finalSimple);
        }
      }

      let finalBad = badFat100;
      let finalGood = goodFat100;
      let finalTrans = trans100;
      if (fatTotal > 0) {
        const partsSum = finalBad + finalGood + finalTrans;
        if (!partsSum) {
          finalBad = fatTotal;
          finalGood = 0;
          finalTrans = 0;
        }
      }

      const carbs100 = Math.round((finalSimple + finalComplex) * 10) / 10;
      const fat100 = Math.round((finalBad + finalGood + finalTrans) * 10) / 10;
      // TEF-aware formula: protein*3 + carbs*4 + fat*9 (синхронизировано с heys_core_v12.js:computeDerived)
      const kcalFromMacros = Math.round((protein100 * 3 + carbs100 * 4 + fat100 * 9) * 10) / 10;
      const kcal100 = form.kcal100 === '' ? kcalFromMacros : toNum(form.kcal100, kcalFromMacros);

      const harm = harmInput != null
        ? harmInput
        : (HEYS.models?.normalizeHarm?.(base) ?? base.harm ?? null);

      return {
        ...base,
        name,
        simple100: finalSimple,
        complex100: finalComplex,
        protein100,
        badFat100: finalBad,
        goodFat100: finalGood,
        trans100: finalTrans,
        fiber100,
        gi,
        harm,
        carbs100,
        fat100,
        kcal100
      };
    }, [form, sourceProduct]);

    const handleNext = useCallback(() => {
      if (!sourceProduct) return;
      haptic('light');
      const updatedProduct = buildUpdatedProduct();
      onChange({ ...data, product: updatedProduct });

      if (updateStepData) {
        updateStepData('edit_basic', { product: updatedProduct });
        updateStepData('edit_extra', { product: updatedProduct });
        updateStepData('portions', { product: updatedProduct });
      }

      setTimeout(() => goToStep?.(1, 'left'), 120);
    }, [sourceProduct, buildUpdatedProduct, onChange, data, updateStepData, goToStep]);

    if (!sourceProduct) {
      return React.createElement('div', { className: 'pe-empty' }, 'Нет продукта для редактирования');
    }

    return React.createElement('div', { className: 'pe-step' },
      React.createElement('div', { className: 'pe-step-header' },
        React.createElement('span', { className: 'pe-step-icon' }, '✏️'),
        React.createElement('span', { className: 'pe-step-title' }, 'Название и 12 основных')
      ),

      React.createElement('div', { className: 'pe-field' },
        React.createElement('label', { className: 'pe-label' }, 'Название'),
        React.createElement('input', {
          className: 'pe-input',
          type: 'text',
          value: form.name,
          onChange: (e) => updateField('name', e.target.value),
          placeholder: 'Название продукта'
        })
      ),

      React.createElement('div', { className: 'pe-grid' },
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Ккал (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.kcal100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.kcal100,
            onChange: (e) => updateField('kcal100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Углеводы (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.carbs100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.carbs100,
            onChange: (e) => updateField('carbs100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Простые (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.simple100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.simple100,
            onChange: (e) => updateField('simple100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Сложные (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.complex100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.complex100,
            onChange: (e) => updateField('complex100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Белок (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.protein100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.protein100,
            onChange: (e) => updateField('protein100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.fat100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.fat100,
            onChange: (e) => updateField('fat100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Вредные жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.badFat100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.badFat100,
            onChange: (e) => updateField('badFat100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Полезные жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.goodFat100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.goodFat100,
            onChange: (e) => updateField('goodFat100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Транс-жиры (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.trans100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.trans100,
            onChange: (e) => updateField('trans100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Клетчатка (100г)'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.fiber100) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.fiber100,
            onChange: (e) => updateField('fiber100', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'ГИ'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.gi) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.gi,
            onChange: (e) => updateField('gi', e.target.value),
            placeholder: '0'
          })
        ),
        React.createElement('div', { className: 'pe-field' },
          React.createElement('label', { className: 'pe-label' }, 'Вред'),
          React.createElement('input', {
            className: 'pe-input' + (isInvalidNumber(form.harm) ? ' pe-input--error' : ''),
            type: 'text',
            inputMode: 'numeric',
            value: form.harm,
            onChange: (e) => updateField('harm', e.target.value),
            placeholder: '0'
          })
        )
      ),

      React.createElement('div', { className: 'pe-preview' },
        React.createElement('span', { className: 'pe-preview-label' }, 'Авто-расчёт:'),
        React.createElement('span', { className: 'pe-preview-value' },
          `У ${computed.carbsTotal} · Ж ${computed.fatTotal} · ${computed.kcalCalc} ккал`
        )
      ),

      (computed.hasCarbsConflict || computed.hasFatConflict || computed.hasKcalConflict) && React.createElement('div', {
        className: 'pe-warning'
      },
        React.createElement('div', { className: 'pe-warning__title' }, 'Проверьте несоответствия'),
        computed.hasCarbsConflict && React.createElement('div', { className: 'pe-warning__text' },
          `Углеводы: всего ${form.carbs100 || computed.carbsTotal} ≠ простые+сложные ${computed.partsCarbs}`
        ),
        computed.hasFatConflict && React.createElement('div', { className: 'pe-warning__text' },
          `Жиры: всего ${form.fat100 || computed.fatTotal} ≠ вредные+полезные+транс ${computed.partsFat}`
        ),
        computed.hasKcalConflict && React.createElement('div', { className: 'pe-warning__text' },
          `Ккал: введено ${form.kcal100 || computed.kcalCalc} ≠ расчёт ${computed.kcalCalc}`
        )
      ),

      React.createElement('button', {
        className: 'pe-next-btn',
        onClick: handleNext
      }, 'Далее')
    );
  }

  // === Шаг 2: Редактор расширенных полей ===
  function ProductEditExtraStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData, closeModal } = stepContext;

    useEscapeToClose(closeModal, true);

    const sourceProduct = stepData?.edit_basic?.product
      || context?.editProduct
      || stepData?.edit_extra?.product
      || stepData?.portions?.product
      || data?.product;

    const initialForm = useMemo(() => {
      const p = sourceProduct || {};
      return {
        category: p.category || '',
        description: p.description || '',
        sodium100: p.sodium100 != null ? String(p.sodium100) : '',
        omega3_100: p.omega3_100 != null ? String(p.omega3_100) : '',
        omega6_100: p.omega6_100 != null ? String(p.omega6_100) : '',
        nova_group: p.nova_group ?? p.novaGroup ?? '',
        nutrient_density: p.nutrient_density ?? p.nutrientDensity ?? '',
        additives: Array.isArray(p.additives) ? p.additives.join(', ') : (p.additives || ''),
        is_organic: !!p.is_organic,
        is_whole_grain: !!p.is_whole_grain,
        is_fermented: !!p.is_fermented,
        is_raw: !!p.is_raw,
        vitamin_a: p.vitamin_a != null ? String(p.vitamin_a) : '',
        vitamin_c: p.vitamin_c != null ? String(p.vitamin_c) : '',
        vitamin_d: p.vitamin_d != null ? String(p.vitamin_d) : '',
        vitamin_e: p.vitamin_e != null ? String(p.vitamin_e) : '',
        vitamin_k: p.vitamin_k != null ? String(p.vitamin_k) : '',
        vitamin_b1: p.vitamin_b1 != null ? String(p.vitamin_b1) : '',
        vitamin_b2: p.vitamin_b2 != null ? String(p.vitamin_b2) : '',
        vitamin_b3: p.vitamin_b3 != null ? String(p.vitamin_b3) : '',
        vitamin_b6: p.vitamin_b6 != null ? String(p.vitamin_b6) : '',
        vitamin_b9: p.vitamin_b9 != null ? String(p.vitamin_b9) : '',
        vitamin_b12: p.vitamin_b12 != null ? String(p.vitamin_b12) : '',
        calcium: p.calcium != null ? String(p.calcium) : '',
        iron: p.iron != null ? String(p.iron) : '',
        magnesium: p.magnesium != null ? String(p.magnesium) : '',
        phosphorus: p.phosphorus != null ? String(p.phosphorus) : '',
        potassium: p.potassium != null ? String(p.potassium) : '',
        zinc: p.zinc != null ? String(p.zinc) : '',
        selenium: p.selenium != null ? String(p.selenium) : '',
        iodine: p.iodine != null ? String(p.iodine) : ''
      };
    }, [sourceProduct]);

    const [form, setForm] = useState(initialForm);

    useEffect(() => {
      setForm(initialForm);
    }, [initialForm]);

    const updateField = useCallback((key, value) => {
      setForm((prev) => ({
        ...prev,
        [key]: value
      }));
    }, []);

    const isInvalidNumber = useCallback((value) => {
      if (value == null || value === '') return false;
      const n = Number(String(value).trim().replace(',', '.'));
      return !Number.isFinite(n) || n < 0;
    }, []);

    const buildUpdatedProduct = useCallback(() => {
      const base = sourceProduct || {};
      return {
        ...base,
        category: String(form.category || '').trim() || base.category || '',
        description: String(form.description || '').trim() || base.description || '',
        sodium100: form.sodium100 === '' ? null : toNum(form.sodium100, null),
        omega3_100: form.omega3_100 === '' ? null : toNum(form.omega3_100, null),
        omega6_100: form.omega6_100 === '' ? null : toNum(form.omega6_100, null),
        nova_group: form.nova_group === '' ? null : toInt(form.nova_group, null),
        additives: normalizeAdditives(form.additives),
        nutrient_density: form.nutrient_density === '' ? null : toNum(form.nutrient_density, null),
        is_organic: !!form.is_organic,
        is_whole_grain: !!form.is_whole_grain,
        is_fermented: !!form.is_fermented,
        is_raw: !!form.is_raw,
        vitamin_a: form.vitamin_a === '' ? null : toNum(form.vitamin_a, null),
        vitamin_c: form.vitamin_c === '' ? null : toNum(form.vitamin_c, null),
        vitamin_d: form.vitamin_d === '' ? null : toNum(form.vitamin_d, null),
        vitamin_e: form.vitamin_e === '' ? null : toNum(form.vitamin_e, null),
        vitamin_k: form.vitamin_k === '' ? null : toNum(form.vitamin_k, null),
        vitamin_b1: form.vitamin_b1 === '' ? null : toNum(form.vitamin_b1, null),
        vitamin_b2: form.vitamin_b2 === '' ? null : toNum(form.vitamin_b2, null),
        vitamin_b3: form.vitamin_b3 === '' ? null : toNum(form.vitamin_b3, null),
        vitamin_b6: form.vitamin_b6 === '' ? null : toNum(form.vitamin_b6, null),
        vitamin_b9: form.vitamin_b9 === '' ? null : toNum(form.vitamin_b9, null),
        vitamin_b12: form.vitamin_b12 === '' ? null : toNum(form.vitamin_b12, null),
        calcium: form.calcium === '' ? null : toNum(form.calcium, null),
        iron: form.iron === '' ? null : toNum(form.iron, null),
        magnesium: form.magnesium === '' ? null : toNum(form.magnesium, null),
        phosphorus: form.phosphorus === '' ? null : toNum(form.phosphorus, null),
        potassium: form.potassium === '' ? null : toNum(form.potassium, null),
        zinc: form.zinc === '' ? null : toNum(form.zinc, null),
        selenium: form.selenium === '' ? null : toNum(form.selenium, null),
        iodine: form.iodine === '' ? null : toNum(form.iodine, null)
      };
    }, [form, sourceProduct]);

    const handleNext = useCallback(() => {
      if (!sourceProduct) return;
      haptic('light');
      const updatedProduct = buildUpdatedProduct();
      onChange({ ...data, product: updatedProduct });

      if (updateStepData) {
        updateStepData('edit_extra', { product: updatedProduct });
        updateStepData('portions', { product: updatedProduct });
      }

      setTimeout(() => goToStep?.(2, 'left'), 120);
    }, [sourceProduct, buildUpdatedProduct, onChange, data, updateStepData, goToStep]);

    if (!sourceProduct) {
      return React.createElement('div', { className: 'pe-empty' }, 'Нет продукта для редактирования');
    }

    return React.createElement('div', { className: 'pe-step' },
      React.createElement('div', { className: 'pe-step-header' },
        React.createElement('span', { className: 'pe-step-icon' }, '🧬'),
        React.createElement('span', { className: 'pe-step-title' }, 'Доп. данные')
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-grid' },
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Категория'),
            React.createElement('input', {
              className: 'pe-input',
              type: 'text',
              list: 'pe-category-list',
              value: form.category,
              onChange: (e) => updateField('category', e.target.value),
              placeholder: 'Категория'
            }),
            React.createElement('datalist', { id: 'pe-category-list' },
              CATEGORIES.filter(c => c.id !== 'all').map((c) =>
                React.createElement('option', { key: c.id, value: c.name })
              )
            )
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Описание'),
            React.createElement('input', {
              className: 'pe-input',
              value: form.description,
              onChange: (e) => updateField('description', e.target.value),
              placeholder: 'Опционально'
            })
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Качество'),
        React.createElement('div', { className: 'pe-grid' },
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Натрий, мг'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.sodium100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.sodium100,
              onChange: (e) => updateField('sodium100', e.target.value)
            })
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'NOVA'),
            React.createElement('div', { className: 'pe-segment' },
              [1, 2, 3, 4].map((val) =>
                React.createElement('button', {
                  key: val,
                  className: 'pe-segment-btn' + (String(form.nova_group) === String(val) ? ' active' : ''),
                  type: 'button',
                  onClick: () => updateField('nova_group', String(val))
                }, String(val))
              )
            )
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Плотность нутр.'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.nutrient_density) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.nutrient_density,
              onChange: (e) => updateField('nutrient_density', e.target.value)
            })
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Омега и добавки'),
        React.createElement('div', { className: 'pe-grid' },
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Ω-3, г'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.omega3_100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.omega3_100,
              onChange: (e) => updateField('omega3_100', e.target.value)
            })
          ),
          React.createElement('div', { className: 'pe-field' },
            React.createElement('label', { className: 'pe-label' }, 'Ω-6, г'),
            React.createElement('input', {
              className: 'pe-input' + (isInvalidNumber(form.omega6_100) ? ' pe-input--error' : ''),
              type: 'text',
              inputMode: 'numeric',
              value: form.omega6_100,
              onChange: (e) => updateField('omega6_100', e.target.value)
            })
          ),
          React.createElement('div', { className: 'pe-field', style: { gridColumn: '1 / -1' } },
            React.createElement('label', { className: 'pe-label' }, 'E-добавки'),
            React.createElement('input', {
              className: 'pe-input',
              type: 'text',
              value: form.additives,
              onChange: (e) => updateField('additives', e.target.value),
              placeholder: 'E330, E621'
            })
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Флаги'),
        React.createElement('div', { className: 'pe-toggles pe-toggles--4col' },
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_organic,
              onChange: (e) => updateField('is_organic', e.target.checked)
            }),
            React.createElement('span', null, '🌿')
          ),
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_whole_grain,
              onChange: (e) => updateField('is_whole_grain', e.target.checked)
            }),
            React.createElement('span', null, '🌾')
          ),
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_fermented,
              onChange: (e) => updateField('is_fermented', e.target.checked)
            }),
            React.createElement('span', null, '🧬')
          ),
          React.createElement('label', { className: 'pe-toggle' },
            React.createElement('input', {
              type: 'checkbox',
              checked: form.is_raw,
              onChange: (e) => updateField('is_raw', e.target.checked)
            }),
            React.createElement('span', null, '🥬')
          )
        ),
        React.createElement('div', { className: 'pe-toggles-legend' },
          '🌿 Органик · 🌾 Цельнозерн. · 🧬 Ферментир. · 🥬 Сырой'
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Витамины (%)'),
        React.createElement('div', { className: 'pe-grid pe-grid--vitamins' },
          [
            { key: 'vitamin_a', label: 'A' },
            { key: 'vitamin_c', label: 'C' },
            { key: 'vitamin_d', label: 'D' },
            { key: 'vitamin_e', label: 'E' },
            { key: 'vitamin_k', label: 'K' },
            { key: 'vitamin_b1', label: 'B1' },
            { key: 'vitamin_b2', label: 'B2' },
            { key: 'vitamin_b3', label: 'B3' },
            { key: 'vitamin_b6', label: 'B6' },
            { key: 'vitamin_b9', label: 'B9' },
            { key: 'vitamin_b12', label: 'B12' }
          ].map((item) =>
            React.createElement('div', { className: 'pe-field pe-field--inline', key: item.key },
              React.createElement('label', { className: 'pe-label' }, item.label),
              React.createElement('input', {
                className: 'pe-input' + (isInvalidNumber(form[item.key]) ? ' pe-input--error' : ''),
                type: 'text',
                inputMode: 'numeric',
                placeholder: '%',
                value: form[item.key],
                onChange: (e) => updateField(item.key, e.target.value)
              })
            )
          )
        )
      ),

      React.createElement('div', { className: 'pe-section' },
        React.createElement('div', { className: 'pe-section-title' }, 'Минералы (%)'),
        React.createElement('div', { className: 'pe-grid pe-grid--minerals' },
          [
            { key: 'calcium', label: 'Ca' },
            { key: 'iron', label: 'Fe' },
            { key: 'magnesium', label: 'Mg' },
            { key: 'phosphorus', label: 'P' },
            { key: 'potassium', label: 'K' },
            { key: 'zinc', label: 'Zn' },
            { key: 'selenium', label: 'Se' },
            { key: 'iodine', label: 'I' }
          ].map((item) =>
            React.createElement('div', { className: 'pe-field pe-field--inline', key: item.key },
              React.createElement('label', { className: 'pe-label' }, item.label),
              React.createElement('input', {
                className: 'pe-input' + (isInvalidNumber(form[item.key]) ? ' pe-input--error' : ''),
                type: 'text',
                inputMode: 'numeric',
                placeholder: '%',
                value: form[item.key],
                onChange: (e) => updateField(item.key, e.target.value)
              })
            )
          )
        )
      ),

      React.createElement('button', {
        className: 'pe-next-btn',
        onClick: handleNext
      }, 'Далее к порциям')
    );
  }

  // === Компонент выбора порций (Шаг portions) ===
  function PortionsStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData, closeModal } = stepContext;

    useEscapeToClose(closeModal, true);

    // Ищем продукт из всех возможных источников
    const product = context?.editProduct
      || stepData?.grams?.selectedProduct  // Продукт с шага граммов
      || stepData?.search?.selectedProduct // Продукт с шага поиска
      || stepData?.create?.newProduct
      || stepData?.create?.selectedProduct
      || stepData?.portions?.product
      || data?.selectedProduct;

    const autoPortions = useMemo(() => getAutoPortions(product?.name), [product?.name]);

    const toEditablePortions = useCallback((list) => {
      const base = Array.isArray(list) ? list : [];
      return base.map((p) => ({
        name: String(p?.name || ''),
        grams: p?.grams ?? ''
      }));
    }, []);

    const [portions, setPortions] = useState(() => {
      if (product?.portions?.length) return toEditablePortions(product.portions);
      if (autoPortions?.length) return toEditablePortions(autoPortions);
      return [];
    });
    const [error, setError] = useState('');

    useEffect(() => {
      if (!product) return;
      if (portions.length > 0) return;

      if (product?.portions?.length) {
        setPortions(toEditablePortions(product.portions));
        return;
      }

      if (autoPortions?.length) {
        setPortions(toEditablePortions(autoPortions));
      }
    }, [product, autoPortions, portions.length, toEditablePortions]);

    const handleAddPortion = useCallback(() => {
      haptic('light');
      setPortions((prev) => {
        const next = [...prev, { name: '', grams: '' }];
        console.info('[HEYS.portions] ➕ Добавить порцию', {
          productId: product?.id ?? product?.product_id ?? null,
          prevCount: prev.length,
          nextCount: next.length
        });
        return next;
      });
    }, []);

    const handleRemovePortion = useCallback((index) => {
      haptic('light');
      console.info('[HEYS.portions] ➖ Удалить порцию', {
        productId: product?.id ?? product?.product_id ?? null,
        index
      });
      setPortions((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleUpdatePortion = useCallback((index, field, value) => {
      console.info('[HEYS.portions] ✏️ handleUpdatePortion', { index, field, value });
      setPortions((prev) => {
        const next = prev.map((p, i) => {
          if (i !== index) return p;
          return {
            ...p,
            [field]: value
          };
        });
        console.info('[HEYS.portions] ✏️ portions state updated', { prev, next });
        return next;
      });
    }, []);

    const handleApplyAuto = useCallback(() => {
      if (!autoPortions?.length) return;
      haptic('light');
      setPortions(toEditablePortions(autoPortions));
    }, [autoPortions, toEditablePortions]);

    const handleContinue = useCallback(() => {
      console.info('[HEYS.portions] 🔵 handleContinue START', {
        productId: product?.id ?? product?.product_id ?? null,
        productName: product?.name,
        productPortions: product?.portions,
        statePortions: portions,
        isEditMode: !!context?.isEditMode
      });
      if (!product) {
        console.warn('[HEYS.portions] ⚠️ Нет продукта при сохранении порций');
        return;
      }

      const normalized = normalizePortions(portions);
      if (portions.length > 0 && normalized.length === 0) {
        setError('Заполните название и граммы порции');
        console.warn('[HEYS.portions] ⚠️ Порции невалидны', {
          productId: product?.id ?? product?.product_id ?? null,
          rawCount: portions.length
        });
        return;
      }

      setError('');

      console.info('[HEYS.portions] 💾 Сохранение порций', {
        productId: product?.id ?? product?.product_id ?? null,
        productName: product?.name,
        rawPortions: portions,
        normalizedPortions: normalized,
        normalizedCount: normalized.length,
        isEditMode: !!context?.isEditMode,
        isShared: isSharedProduct(product),
        isCurator: isCuratorUser()
      });

      const updatedProduct = {
        ...product,
        ...(normalized.length > 0 ? { portions: normalized } : {})
      };

      onChange({
        ...data,
        portions: normalized,
        selectedProduct: updatedProduct
      });

      if (updateStepData) {
        updateStepData('portions', {
          product: updatedProduct,
          portions: normalized
        });
        updateStepData('create', {
          ...stepData?.create,
          newProduct: updatedProduct,
          selectedProduct: updatedProduct
        });
        updateStepData('harm', {
          product: updatedProduct
        });
        updateStepData('grams', {
          selectedProduct: updatedProduct,
          grams: stepData?.create?.grams || 100
        });
      }

      if (context?.isEditMode && normalized.length > 0) {
        saveProductPortions(updatedProduct, normalized);
      }

      if (context?.onFinish) {
        console.info('[HEYS.portions] ✅ Завершение шага порций', {
          productId: product?.id ?? product?.product_id ?? null,
          normalizedCount: normalized.length
        });
        context.onFinish({ product: updatedProduct, portions: normalized });
        if (HEYS.StepModal?.hide) {
          HEYS.StepModal.hide();
        }
        return;
      }

      const nextIndex = context?.isEditMode ? 1 : 3;
      setTimeout(() => goToStep?.(nextIndex, 'left'), 150);
    }, [product, portions, onChange, data, updateStepData, stepData, context?.isEditMode, context?.onFinish, goToStep]);

    const handleSkip = useCallback(() => {
      if (!product) return;
      haptic('light');

      if (updateStepData) {
        updateStepData('portions', {
          product,
          portions: []
        });
        updateStepData('harm', {
          product
        });
      }

      if (context?.onFinish) {
        context.onFinish({ product, portions: [] });
        if (HEYS.StepModal?.hide) {
          HEYS.StepModal.hide();
        }
        return;
      }

      const nextIndex = context?.isEditMode ? 1 : 3;
      setTimeout(() => goToStep?.(nextIndex, 'left'), 150);
    }, [product, updateStepData, context?.isEditMode, context?.onFinish, goToStep]);

    if (!product) {
      return React.createElement('div', { className: 'aps-no-product' },
        'Сначала создайте продукт'
      );
    }

    return React.createElement('div', { className: 'aps-portions-step' },
      React.createElement('div', { className: 'aps-portions-header' },
        React.createElement('span', { className: 'aps-portions-icon' }, '🥣'),
        React.createElement('span', { className: 'aps-portions-title' }, 'Порции')
      ),

      React.createElement('div', { className: 'aps-portions-subtitle' },
        'Удобные порции для «' + product.name + '»'
      ),

      autoPortions?.length > 0 && React.createElement('div', { className: 'aps-portions-suggest' },
        React.createElement('div', { className: 'aps-portions-suggest-title' }, 'Рекомендованные'),
        React.createElement('div', { className: 'aps-portions-suggest-list' },
          autoPortions.map((p, i) =>
            React.createElement('div', { key: i, className: 'aps-portions-suggest-chip' },
              p.name + (String(p.name).includes('г') ? '' : ` (${p.grams}г)`)
            )
          )
        ),
        React.createElement('button', {
          className: 'aps-portions-apply-btn',
          onClick: handleApplyAuto
        }, 'Использовать шаблон')
      ),

      React.createElement('div', { className: 'aps-portions-editor' },
        portions.length === 0 && React.createElement('div', { className: 'aps-portions-empty' },
          'Нет порций — добавьте свои или пропустите'
        ),
        portions.map((p, i) =>
          React.createElement('div', { key: i, className: 'aps-portions-row' },
            React.createElement('input', {
              className: 'aps-portions-input aps-portions-input--name',
              placeholder: 'Например: 1 яблоко',
              value: p.name,
              onChange: (e) => handleUpdatePortion(i, 'name', e.target.value)
            }),
            React.createElement('div', { className: 'aps-portions-grams' },
              React.createElement('input', {
                className: 'aps-portions-input aps-portions-input--grams',
                type: 'number',
                inputMode: 'numeric',
                placeholder: 'г',
                value: p.grams,
                onChange: (e) => handleUpdatePortion(i, 'grams', e.target.value)
              }),
              React.createElement('span', { className: 'aps-portions-grams-unit' }, 'г')
            ),
            React.createElement('button', {
              className: 'aps-portions-remove-btn',
              onClick: () => handleRemovePortion(i)
            }, '×')
          )
        )
      ),

      React.createElement('button', {
        className: 'aps-portions-add-btn',
        onClick: handleAddPortion
      }, '+ Добавить порцию'),

      error && React.createElement('div', { className: 'aps-portions-error' }, '⚠️ ' + error),

      React.createElement('div', { className: 'aps-portions-actions' },
        React.createElement('button', {
          className: 'aps-portions-skip-btn',
          onClick: handleSkip
        }, 'Пропустить'),
        React.createElement('button', {
          className: 'aps-portions-next-btn',
          onClick: handleContinue
        }, context?.isProductEditor ? 'Готово' : (context?.isEditMode ? 'Далее' : 'Далее к вредности'))
      )
    );
  }

  // Фон карточки по полезности: 0=зелёный(полезный), 5=голубой(средний), 10=красный(вредный)
  function getHarmBg(h) {
    if (h == null) return null;
    // h: 0=полезный, 5=средний, 10=вредный
    // Светлые оттенки для хорошей читаемости текста
    if (h <= 1) return '#d1fae5';  // 0-1: светло-мятный — полезный (emerald-100)
    if (h <= 2) return '#d1fae5';  // 2: светло-мятный
    if (h <= 3) return '#ecfdf5';  // 3: очень светлый мятный (emerald-50)
    if (h <= 4) return '#f0fdf4';  // 4: почти белый с зеленцой (green-50)
    if (h <= 5) return '#e0f2fe';  // 5: светло-голубой — средний
    if (h <= 6) return '#f0f9ff';  // 6: очень светлый голубой
    if (h <= 7) return '#fef2f2';  // 7: очень светло-розовый (red-50)
    if (h <= 8) return '#fee2e2';  // 8: светло-розовый (red-100)
    if (h <= 9) return '#fecaca';  // 9: розовый (red-200)
    return '#fca5a5';              // 10: красноватый (red-300) — вредный
  }

  // Иконка категории (копия из heys_day_v12.js)
  function getCategoryIcon(cat) {
    if (!cat) return '🍽️';
    const c = cat.toLowerCase();
    if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
    if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
    if (c.includes('рыб') || c.includes('морепр')) return '🐟';
    if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
    if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
    if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
    if (c.includes('яйц')) return '🥚';
    if (c.includes('орех') || c.includes('семеч')) return '🥜';
    if (c.includes('масл')) return '🫒';
    if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
    if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
    if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
    return '🍽️';
  }

  // === Компонент выбора Harm Score (Шаг harm) — минималистичный UI ===
  function HarmSelectStep({ data, onChange, context, stepData }) {
    const e = React.createElement;

    // Продукт из предыдущего шага create
    const product = stepData?.create?.newProduct
      || stepData?.portions?.product
      || stepData?.harm?.product
      || data?.newProduct
      || data?.product
      || data?.selectedProduct;

    // Вычисленный системой harm
    const calculatedBreakdown = useMemo(() => {
      if (!product) return null;
      if (HEYS.Harm?.getHarmBreakdown) {
        return HEYS.Harm.getHarmBreakdown(product);
      }
      return null;
    }, [product]);

    const calculatedHarm = calculatedBreakdown?.score ?? null;

    // Введённый вручную harm (из paste-данных)
    const manualHarmRef = useRef(null);
    if (manualHarmRef.current == null) {
      manualHarmRef.current = HEYS.models?.normalizeHarm?.(product)
        ?? Number(product?.harm ?? product?.harmScore ?? product?.harmscore ?? product?.harm100 ?? NaN);
    }
    const manualHarm = manualHarmRef.current;
    const hasManualHarm = Number.isFinite(manualHarm);

    // Текущий выбранный harm
    const [selectedHarm, setSelectedHarm] = useState(() => {
      const safeManual = Number.isFinite(manualHarm) ? manualHarm : null;
      // По умолчанию — вычисленный системой
      return calculatedHarm ?? safeManual ?? 5;
    });

    // Режим кастомного ввода
    const [showCustom, setShowCustom] = useState(false);

    // Показывать ли breakdown
    const [showBreakdown, setShowBreakdown] = useState(true);

    // WheelPicker для кастомного значения
    const WheelPicker = HEYS.StepModal?.WheelPicker;

    // Категория для текущего выбора
    const selectedCategory = useMemo(() => {
      return HEYS.Harm?.getHarmCategory?.(selectedHarm) || { name: '—', color: '#6b7280', emoji: '❓' };
    }, [selectedHarm]);

    // Навигация
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { goToStep, updateStepData } = stepContext;

    // Обновляем данные при изменении выбора
    useEffect(() => {
      if (product && selectedHarm != null) {
        const updatedProduct = {
          ...product,
          harm: selectedHarm,
          harmManual: Number.isFinite(manualHarm) ? manualHarm : product?.harmManual
        };
        onChange({ ...data, selectedHarm, product: updatedProduct });

        // Также обновляем в create stepData
        if (updateStepData && stepData?.create) {
          updateStepData('create', {
            ...stepData.create,
            newProduct: updatedProduct
          });
        }
      }
    }, [selectedHarm]);

    // Выбрать вариант, СОХРАНИТЬ ПРОДУКТ и перейти дальше
    const selectAndContinue = useCallback((harm) => {
      haptic('light');
      setSelectedHarm(harm);

      // Обновляем продукт с выбранным harm
      const updatedProduct = product ? {
        ...product,
        harm,
        harmManual: Number.isFinite(manualHarm) ? manualHarm : product?.harmManual
      } : null;

      if (updatedProduct && updateStepData) {
        updateStepData('create', {
          ...stepData?.create,
          newProduct: updatedProduct,
          selectedProduct: updatedProduct
        });
        updateStepData('grams', {
          selectedProduct: updatedProduct,
          grams: stepData?.create?.grams || 100
        });
      }

      // 🔐 СОХРАНЕНИЕ ПРОДУКТА В БАЗУ (перенесено из CreateProductStep)
      if (updatedProduct) {
        const U = HEYS.utils || {};
        const products = HEYS.products?.getAll?.() || U.lsGet?.('heys_products', []) || [];

        // Проверка на дубликат
        const normName = (updatedProduct.name || '').trim().toLowerCase();
        const existingPersonal = products.find(p =>
          (p.name || '').trim().toLowerCase() === normName
        );

        if (!existingPersonal) {
          // 🆕 v4.8.0: Удаляем из игнор-листа если был там
          if (HEYS.deletedProducts?.remove) {
            HEYS.deletedProducts.remove(updatedProduct.name, updatedProduct.id);
          }

          const newProducts = [...products, updatedProduct];
          if (HEYS.products?.setAll) {
            HEYS.products.setAll(newProducts);
            console.log('[HarmSelectStep] ✅ Сохранён в базу с harm:', harm, updatedProduct.name);
          } else if (HEYS.store?.set) {
            HEYS.store.set('heys_products', newProducts);
            console.log('[HarmSelectStep] ✅ Сохранён через store с harm:', harm);
          }
        } else {
          console.log('[HarmSelectStep] ⚠️ Продукт уже есть в базе:', existingPersonal.name);
          // Используем существующий ID
          updatedProduct.id = existingPersonal.id;
        }

        // 🔄 Orphan recovery
        if (HEYS.orphanProducts?.recalculate) {
          HEYS.orphanProducts.recalculate();
        }
        if (HEYS.orphanProducts?.remove && updatedProduct.name) {
          HEYS.orphanProducts.remove(updatedProduct.name);
        }

        // 🌐 Публикация в shared (async, не блокируем переход)
        const publishToShared = stepData?.create?.publishToShared ?? true;
        const isCurator = isCuratorUser();

        if (publishToShared && HEYS.cloud) {
          (async () => {
            try {
              if (HEYS.models?.computeProductFingerprint) {
                const fingerprint = await HEYS.models.computeProductFingerprint(updatedProduct);
                const existing = await HEYS.cloud.searchSharedProducts?.('', { fingerprint, limit: 1 });
                if (existing?.data?.length > 0) {
                  console.log('[HarmSelectStep] 🔄 Продукт уже в shared:', existing.data[0].name);
                  return;
                }
              }

              if (isCurator && HEYS.cloud.publishToShared) {
                const result = await HEYS.cloud.publishToShared(updatedProduct);
                console.log('[HarmSelectStep] ✅ Опубликован в shared:', result);
              } else if (HEYS.cloud.createPendingProduct) {
                const clientId = readGlobalValue('heys_client_current', null);
                if (clientId) {
                  await HEYS.cloud.createPendingProduct(clientId, updatedProduct);
                }
              }
            } catch (err) {
              console.error('[HarmSelectStep] ❌ Ошибка публикации:', err);
            }
          })();
        }
      }

      // Переходим на шаг граммов
      setTimeout(() => goToStep?.(4, 'left'), 150);
    }, [product, stepData, updateStepData, goToStep, manualHarm]);

    // Значения для WheelPicker: 0, 0.5, 1, ... 10
    const wheelValues = useMemo(() => Array.from({ length: 21 }, (_, i) => i * 0.5), []);

    if (!product) {
      return e('div', { className: 'flex items-center justify-center h-40 text-gray-400' },
        'Сначала создайте продукт'
      );
    }

    return e('div', { className: 'harm-select-step' },
      // Название продукта
      e('div', { className: 'text-center mb-4' },
        e('span', { className: 'text-lg font-medium text-gray-900' }, product.name)
      ),

      // Два варианта: Manual vs Calculated
      e('div', { className: 'flex gap-3 mb-4' },
        // Карточка: Введённое вручную (если есть и отличается)
        hasManualHarm && e('button', {
          className: `harm-card ${selectedHarm === manualHarm ? 'selected' : ''}`,
          onClick: () => selectAndContinue(manualHarm),
          style: {
            flex: 1,
            background: selectedHarm === manualHarm ? (HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280') + '15' : '#f9fafb',
            border: selectedHarm === manualHarm ? `2px solid ${HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280'}` : '2px solid transparent',
            borderRadius: '16px',
            padding: '16px 12px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s'
          }
        },
          e('div', { className: 'text-xs text-gray-500 mb-1' }, '✏️ AI'),
          e('div', {
            className: 'text-4xl font-bold mb-1',
            style: { color: HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280' }
          }, manualHarm.toFixed(1)),
          e('div', {
            className: 'text-xs font-medium',
            style: { color: HEYS.Harm?.getHarmColor?.(manualHarm) || '#6b7280' }
          }, HEYS.Harm?.getHarmCategory?.(manualHarm)?.emoji || '')
        ),

        // Карточка: Рассчитано системой
        calculatedHarm != null && e('button', {
          className: `harm-card ${selectedHarm === calculatedHarm ? 'selected' : ''}`,
          onClick: () => selectAndContinue(calculatedHarm),
          style: {
            flex: 1,
            background: selectedHarm === calculatedHarm ? (calculatedBreakdown?.category?.color || '#6b7280') + '15' : '#f9fafb',
            border: selectedHarm === calculatedHarm ? `2px solid ${calculatedBreakdown?.category?.color || '#6b7280'}` : '2px solid transparent',
            borderRadius: '16px',
            padding: '16px 12px',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s'
          }
        },
          e('div', { className: 'text-xs text-gray-500 mb-1' }, '🧪 Расчёт'),
          e('div', {
            className: 'text-4xl font-bold mb-1',
            style: { color: calculatedBreakdown?.category?.color || '#6b7280' }
          }, calculatedHarm.toFixed(1)),
          e('div', {
            className: 'text-xs font-medium',
            style: { color: calculatedBreakdown?.category?.color || '#6b7280' }
          }, calculatedBreakdown?.category?.emoji || '')
        )
      ),

      // Сравнение разницы (если есть оба значения и они отличаются)
      hasManualHarm && calculatedHarm != null && Math.abs(manualHarm - calculatedHarm) >= 0.5 && e('div', {
        className: 'text-center text-xs py-2 px-3 rounded-lg mb-3',
        style: {
          background: Math.abs(manualHarm - calculatedHarm) >= 2 ? '#fef3c7' : '#f3f4f6',
          color: Math.abs(manualHarm - calculatedHarm) >= 2 ? '#92400e' : '#6b7280'
        }
      },
        Math.abs(manualHarm - calculatedHarm) >= 2
          ? `⚠️ Разница ${Math.abs(manualHarm - calculatedHarm).toFixed(1)} — AI и расчёт сильно расходятся`
          : `Δ ${Math.abs(manualHarm - calculatedHarm).toFixed(1)} между AI и расчётом`
      ),

      // Кнопка "Своё значение"
      e('button', {
        className: 'w-full py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors',
        onClick: () => { setShowCustom(!showCustom); haptic('light'); }
      }, showCustom ? '▼ Скрыть выбор' : '⚙️ Указать своё значение'),

      // WheelPicker для кастомного значения
      showCustom && WheelPicker && e('div', { className: 'mt-3 mb-4' },
        e('div', { className: 'flex items-center justify-center gap-4' },
          e('div', { className: 'w-32' },
            e(WheelPicker, {
              values: wheelValues,
              value: selectedHarm,
              onChange: (v) => setSelectedHarm(v),
              height: 140,
              compact: true
            })
          ),
          e('div', { className: 'text-center' },
            e('div', {
              className: 'text-3xl font-bold',
              style: { color: selectedCategory.color }
            }, selectedHarm.toFixed(1)),
            e('div', {
              className: 'text-sm',
              style: { color: selectedCategory.color }
            }, selectedCategory.name)
          )
        ),
        e('button', {
          className: 'w-full mt-3 py-3 rounded-xl font-medium text-white',
          style: { background: selectedCategory.color },
          onClick: () => selectAndContinue(selectedHarm)
        }, '✓ Выбрать ' + selectedHarm.toFixed(1))
      ),

      // Кнопка "Как посчитано?" — раскрывает breakdown
      calculatedBreakdown && e('button', {
        className: 'w-full py-2 mt-2 text-xs text-gray-500 hover:text-gray-700 transition-colors',
        onClick: () => { setShowBreakdown(!showBreakdown); haptic('light'); }
      }, showBreakdown ? '▲ Скрыть расшифровку' : '❓ Как посчитано?'),

      // Breakdown расчёта
      showBreakdown && calculatedBreakdown && e('div', {
        className: 'mt-3 p-3 bg-gray-50 rounded-xl text-xs space-y-2'
      },
        // Формула
        e('div', { className: 'text-center text-gray-600 mb-2 font-mono' },
          calculatedBreakdown.formula
        ),
        // Версия формулы
        e('div', { className: 'text-center text-[10px] text-gray-400' },
          `Формула v${calculatedBreakdown.version || '3.0'}`
        ),

        // Штрафы
        calculatedBreakdown.penalties.length > 0 && e('div', null,
          e('div', { className: 'text-red-600 font-medium mb-1' }, '🔴 Штрафы:'),
          calculatedBreakdown.penalties.map((p, i) =>
            e('div', { key: i, className: 'flex justify-between text-gray-600 pl-4' },
              e('span', null, `${p.icon} ${p.label}`),
              e('span', { className: 'text-red-500' }, `+${p.contribution.toFixed(2)}`)
            )
          )
        ),

        // Бонусы
        calculatedBreakdown.bonuses.length > 0 && e('div', { className: 'mt-2' },
          e('div', { className: 'text-green-600 font-medium mb-1' }, '🟢 Бонусы:'),
          calculatedBreakdown.bonuses.map((b, i) =>
            e('div', { key: i, className: 'flex justify-between text-gray-600 pl-4' },
              e('span', null, `${b.icon} ${b.label}`),
              e('span', { className: 'text-green-500' }, `−${b.contribution.toFixed(2)}`)
            )
          )
        ),

        // NOVA info
        e('div', { className: 'mt-2 text-gray-500 text-center' },
          `NOVA ${calculatedBreakdown.novaGroup}: ${calculatedBreakdown.novaGroup === 4 ? 'Ультрапереработанный' :
            calculatedBreakdown.novaGroup === 3 ? 'Переработанный' :
              calculatedBreakdown.novaGroup === 2 ? 'Ингредиент' : 'Необработанный'
          }`
        )
      ),

      // Подсказка
      e('div', { className: 'text-center text-xs text-gray-400 mt-4' },
        '0 = суперполезный • 10 = супервредный'
      )
    );
  }

  // === Компонент выбора граммов (Шаг 2) ===
  function GramsStep({ data, onChange, context, stepData }) {
    const stepContext = useContext(HEYS.StepModal?.Context || React.createContext({}));
    const { closeModal, goToStep, updateStepData } = stepContext;

    useEscapeToClose(closeModal, true);
    // Продукт берём: 1) из context (для edit mode), 2) из своих данных, 3) из create (newProduct или selectedProduct), 4) из search
    // ВАЖНО: stepData?.create проверяется т.к. при создании нового продукта data.selectedProduct может не успеть обновиться
    const product = context?.editProduct
      || data.selectedProduct
      || stepData?.create?.newProduct
      || stepData?.create?.selectedProduct
      || stepData?.search?.selectedProduct;
    const lastGrams = stepData?.search?.lastGrams || stepData?.create?.lastGrams; // Последние использованные
    const grams = data.grams || context?.editGrams || stepData?.create?.grams || stepData?.search?.grams || 100;

    // Режим ввода: grams или kcal
    const [inputMode, setInputMode] = useState('grams');
    const [kcalInput, setKcalInput] = useState('');
    const gramsInputRef = useRef(null);

    const [favorites, setFavorites] = useState(() =>
      HEYS.store?.getFavorites?.() || new Set()
    );

    const productId = useMemo(() => {
      if (!product) return '';
      return String(product.id ?? product.product_id ?? product.name ?? '');
    }, [product]);

    useEffect(() => {
      if (HEYS.store?.getFavorites) {
        setFavorites(HEYS.store.getFavorites());
      }
    }, [productId]);

    const isFavorite = productId ? favorites.has(productId) : false;
    const isShared = isSharedProduct(product);

    const toggleFavorite = useCallback((e) => {
      e.stopPropagation();
      if (!productId || !HEYS.store?.toggleFavorite) return;
      HEYS.store.toggleFavorite(productId);
      if (HEYS.store?.getFavorites) {
        setFavorites(HEYS.store.getFavorites());
      }
    }, [productId]);

    // ВАЖНО: Значения продукта с fallback для ситуации когда product ещё не загружен
    const toNum = (v) => {
      if (v == null || v === '') return 0;
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
      const n = Number(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const kcal100 = toNum(product?.kcal100);
    const protein100 = toNum(product?.protein100);
    const carbs100 = toNum(product?.simple100) + toNum(product?.complex100);
    const fat100 = toNum(product?.badFat100) + toNum(product?.goodFat100) + toNum(product?.trans100);
    const derivedKcal100 = kcal100 > 0
      ? kcal100
      : Math.round((3 * protein100 + 4 * carbs100 + 9 * fat100) * 10) / 10;

    // Расчёт на текущую порцию (safe with fallbacks)
    const currentKcal = Math.round(derivedKcal100 * grams / 100);
    const currentProt = Math.round(protein100 * grams / 100);
    const currentCarbs = Math.round(carbs100 * grams / 100);
    const currentFat = Math.round(fat100 * grams / 100);

    // === ВСЕ ХУКИ ДОЛЖНЫ БЫТЬ ДО ЛЮБОГО RETURN ===

    // Авто-порции продукта
    const defaultPortions = useMemo(() => {
      if (!product) return [{ name: '100г', grams: 100 }];
      if (product.portions && product.portions.length) {
        return product.portions;
      }
      // Авто-порции по названию (передаём строку, не объект!)
      return HEYS.models?.getAutoPortions?.(product.name) || [
        { name: '50г', grams: 50 },
        { name: '100г', grams: 100 },
        { name: '150г', grams: 150 },
        { name: '200г', grams: 200 }
      ];
    }, [product]);

    const [localPortions, setLocalPortions] = useState(defaultPortions);

    useEffect(() => {
      setLocalPortions(defaultPortions);
    }, [defaultPortions]);

    useEffect(() => {
      const handleProductUpdated = (event) => {
        const detail = event?.detail || {};
        const updatedProduct = detail.product;
        const updatedId = String(detail.productId ?? updatedProduct?.id ?? updatedProduct?.product_id ?? updatedProduct?.name);
        const currentId = String(product?.id ?? product?.product_id ?? product?.name);
        if (!updatedId || updatedId !== currentId) return;

        const nextPortions = Array.isArray(detail.portions)
          ? detail.portions
          : (updatedProduct?.portions || []);

        setLocalPortions(nextPortions);
        if (updatedProduct) {
          onChange({ ...data, selectedProduct: updatedProduct });
        }
      };

      window.addEventListener('heys:product-portions-updated', handleProductUpdated);
      window.addEventListener('heys:product-updated', handleProductUpdated);
      return () => {
        window.removeEventListener('heys:product-portions-updated', handleProductUpdated);
        window.removeEventListener('heys:product-updated', handleProductUpdated);
      };
    }, [product, data, onChange]);

    // Обновление граммов
    const setGrams = useCallback((newGrams) => {
      const val = Math.max(1, Math.min(2000, Number(newGrams) || 100));
      // Debug: log only if value doesn't change as expected
      if (data?.grams && data.grams !== val && Math.abs(data.grams - val) > 1) {
        console.warn('[GramsStep] ⚠️ Unexpected grams change:', { from: data.grams, to: val, input: newGrams });
      }
      onChange({ ...data, grams: val });
    }, [data, onChange]);

    // Расчёт граммов из ккал
    const setKcalAndCalcGrams = useCallback((kcalStr) => {
      setKcalInput(kcalStr);
      const kcal = Number(kcalStr) || 0;
      if (kcal > 0 && kcal100 > 0) {
        const calcGrams = Math.round(kcal / kcal100 * 100);
        const val = Math.max(1, Math.min(2000, calcGrams));
        onChange({ ...data, grams: val });
      }
    }, [data, onChange, kcal100]);

    const handleSubmit = useCallback(() => {
      if (!product || grams <= 0) {
        console.warn('[HEYS.addProduct] ⚠️ GramsStep submit blocked', {
          hasProduct: !!product,
          grams,
          mealIndex: context?.mealIndex ?? null,
          productName: product?.name || null
        });
        return;
      }
      console.info('[HEYS.addProduct] 🟢 GramsStep submit', {
        grams,
        mealIndex: context?.mealIndex ?? null,
        productId: product?.id ?? product?.product_id ?? null,
        productName: product?.name || null
      });
      // Режим редактирования — вызываем onSave
      if (context?.isEditMode && context?.onSave) {
        context.onSave({
          mealIndex: context.mealIndex,
          itemId: context.itemId,
          grams
        });
      }
      // Режим добавления — вызываем onAdd
      else if (context?.onAdd) {
        if (grams !== data?.grams && data?.grams && data.grams !== 100) {
          console.warn('[GramsStep] ⚠️ grams mismatch on submit:', { final: grams, dataGrams: data.grams });
        }
        const hasNutrients = !!(product?.kcal100 || product?.protein100 || product?.carbs100);
        if (!hasNutrients) {
          console.error('🚨 [GramsStep] CRITICAL: Sending product with NO nutrients!', {
            product,
            stepData,
            contextEditProduct: context?.editProduct,
            dataSelectedProduct: data?.selectedProduct
          });
        }

        const productForSubmit = (!product?.kcal100 && derivedKcal100 > 0)
          ? { ...product, kcal100: derivedKcal100 }
          : product;

        console.info('[HEYS.addProduct] ➕ GramsStep onAdd', {
          grams,
          mealIndex: context?.mealIndex ?? null,
          productId: productForSubmit?.id ?? productForSubmit?.product_id ?? null,
          productName: productForSubmit?.name || null
        });
        context.onAdd({
          product: productForSubmit,
          grams,
          mealIndex: context.mealIndex
        });

        window.dispatchEvent(new CustomEvent('heysProductAdded', {
          detail: { product: productForSubmit, grams }
        }));
      }

      if (HEYS.StepModal?.hide) {
        if (!context?.multiProductMode) {
          HEYS.StepModal.hide({ scrollToDiary: true });
          return;
        }

        const continueAdding = () => {
          updateStepData?.('search', {
            ...stepData?.search,
            selectedProduct: null,
            grams,
            lastGrams: grams
          });
          updateStepData?.('grams', {
            ...stepData?.grams,
            selectedProduct: null,
            grams
          });
          setTimeout(() => {
            goToStep?.(0, 'right');
          }, 0);
        };

        const finishMeal = () => {
          HEYS.StepModal.hide({ scrollToDiary: true });
        };

        // 🆕 Используем общий summary-хелпер если доступен
        const summaryShow = HEYS.dayAddProductSummary?.show;
        if (typeof summaryShow === 'function') {
          let addMoreChosen = false;
          const dayUtils = HEYS.dayUtils || {};
          const getProductFromItem = dayUtils.getProductFromItem || (() => null);
          const per100 = dayUtils.per100 || (() => ({
            kcal100: 0, carbs100: 0, prot100: 0, fat100: 0,
            simple100: 0, complex100: 0, bad100: 0, good100: 0,
            trans100: 0, fiber100: 0
          }));
          const scale = dayUtils.scale || ((v, g) => Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10);
          const currentDay = HEYS.Day?.getDay?.() || context?.day || {};
          const pIndex = dayUtils.buildProductIndex?.() || HEYS.products?.buildIndex?.() || {};

          Promise.resolve(summaryShow({
            day: currentDay,
            mealIndex: context?.mealIndex ?? 0,
            pIndex,
            getProductFromItem,
            per100,
            scale,
            onAddMore: () => {
              addMoreChosen = true;
              continueAdding();
            }
          })).then(() => {
            if (!addMoreChosen) finishMeal();
          });
          return;
        }

        // Fallback: старый ConfirmModal
        if (HEYS.ConfirmModal?.show) {
          const mealName = (context?.day?.meals?.[context?.mealIndex]?.name || 'приём').toLowerCase();
          Promise.resolve(HEYS.ConfirmModal.show({
            icon: '🍽️',
            title: `Добавить ещё в ${mealName}?`,
            text: 'Можно продолжить добавлять продукты или завершить приём.',
            confirmText: 'Добавить ещё',
            cancelText: 'Завершить',
            confirmStyle: 'success',
            cancelStyle: 'primary',
            confirmVariant: 'fill',
            cancelVariant: 'fill'
          })).then((result) => {
            if (result) continueAdding();
            else finishMeal();
          });
        } else {
          continueAdding();
        }
      }
    }, [product, grams, context, data, stepData]);

    // Считаем сумму ккал за день
    const { dateKey, mealIndex } = context || {};
    const dayTotalKcal = useMemo(() => {
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});
      let total = 0;
      (dayData.meals || []).forEach(m => {
        (m.items || []).forEach(it => {
          const g = it.grams || 100;
          const pid = it.product_id || it.name;
          const prod = (context?.products || []).find(p => (p.id || p.name) === pid);
          if (prod) total += (prod.kcal100 || 0) * g / 100;
        });
      });
      return Math.round(total);
    }, [dateKey, context?.products]);

    // Норма ккал из профиля
    const dailyGoal = useMemo(() => {
      const profile = lsGet('heys_profile', {});
      return profile.optimum || profile.tdee || 1800;
    }, []);

    // === ТЕПЕРЬ МОЖНО ДЕЛАТЬ EARLY RETURN ===
    if (!product) {
      return React.createElement('div', { className: 'aps-no-product' },
        'Сначала выберите продукт'
      );
    }

    // Быстрые кнопки порций
    const quickPortions = [50, 100, 150, 200, 300];

    // Фон хедера по вредности
    const harmVal = product.harm ?? product.harmScore ?? product.harm100;
    const harmBg = getHarmBg(harmVal);

    return React.createElement('div', { className: 'aps-grams-step' },
      // Название продукта
      React.createElement('div', {
        className: 'aps-product-header',
        style: harmBg ? { background: harmBg, borderColor: harmBg } : undefined
      },
        React.createElement('div', { className: 'aps-product-header__main' },
          product.category && React.createElement('span', { className: 'aps-product-icon-lg' },
            getCategoryIcon(product.category)
          ),
          React.createElement('div', { className: 'aps-product-title' }, product.name)
        ),
        !isShared && React.createElement('button', {
          className: 'aps-fav-btn aps-product-header__fav' + (isFavorite ? ' active' : ''),
          onClick: toggleFavorite,
          title: isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'
        }, isFavorite ? '★' : '☆')
      ),

      // Подсказка про последние граммы
      lastGrams && React.createElement('div', { className: 'aps-last-grams-hint' },
        React.createElement('span', null, 'В прошлый раз: '),
        React.createElement('button', {
          className: 'aps-last-grams-btn',
          onClick: () => setGrams(lastGrams)
        }, lastGrams + 'г')
      ),

      // === HERO: Большой input (граммы или ккал в зависимости от режима) ===
      React.createElement('div', { className: 'aps-grams-hero' },
        React.createElement('button', {
          className: 'aps-grams-hero-btn',
          onClick: () => inputMode === 'grams'
            ? setGrams(grams - 10)
            : setKcalAndCalcGrams(Math.max(10, (Number(kcalInput) || 0) - 10))
        }, '−'),
        React.createElement('div', { className: 'aps-grams-hero-field' },
          React.createElement('input', {
            ref: gramsInputRef,
            type: 'number',
            className: 'aps-grams-hero-input',
            value: inputMode === 'grams' ? grams : kcalInput,
            onChange: (e) => inputMode === 'grams'
              ? setGrams(e.target.value)
              : setKcalAndCalcGrams(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            },
            onFocus: (e) => e.target.select(),
            onClick: (e) => e.target.select(),
            inputMode: 'numeric',
            min: 1,
            max: inputMode === 'grams' ? 2000 : 5000
          })
        ),
        React.createElement('button', {
          className: 'aps-grams-hero-btn',
          onClick: () => inputMode === 'grams'
            ? setGrams(grams + 10)
            : setKcalAndCalcGrams((Number(kcalInput) || 0) + 10)
        }, '+')
      ),

      // Подпись под инпутом (грамм / ккал)
      React.createElement('div', { className: 'aps-grams-hero-label' },
        inputMode === 'grams' ? 'грамм' : 'ккал'
      ),

      // Вторичная информация (калории или граммы)
      React.createElement('div', { className: 'aps-kcal-secondary' },
        React.createElement('span', { className: 'aps-kcal-secondary-value' },
          inputMode === 'grams' ? (currentKcal + ' ккал') : ('= ' + grams + 'г')
        )
      ),

      // БЖУ
      React.createElement('div', { className: 'aps-macros' },
        React.createElement('div', { className: 'aps-macro' },
          React.createElement('span', { className: 'aps-macro-label' }, 'Б'),
          React.createElement('span', { className: 'aps-macro-value' }, currentProt + 'г')
        ),
        React.createElement('div', { className: 'aps-macro' },
          React.createElement('span', { className: 'aps-macro-label' }, 'Ж'),
          React.createElement('span', { className: 'aps-macro-value' }, currentFat + 'г')
        ),
        React.createElement('div', { className: 'aps-macro' },
          React.createElement('span', { className: 'aps-macro-label' }, 'У'),
          React.createElement('span', { className: 'aps-macro-value' }, currentCarbs + 'г')
        )
      ),

      // === БОЛЬШАЯ КНОПКА ДОБАВИТЬ/ИЗМЕНИТЬ ===
      React.createElement('button', {
        className: 'aps-add-hero-btn',
        onClick: handleSubmit,
        style: {
          display: 'block',
          width: '100%',
          padding: '16px',
          marginTop: '16px',
          marginBottom: '16px',
          fontSize: '18px',
          fontWeight: '600',
          color: '#fff',
          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
          border: 'none',
          borderRadius: '12px',
          boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)',
          cursor: 'pointer'
        }
      }, context?.isEditMode ? '✓ Изменить' : '✓ Добавить'),

      // Переключатель режима: граммы / ккал
      React.createElement('div', { className: 'aps-input-mode-toggle' },
        React.createElement('button', {
          className: 'aps-mode-btn' + (inputMode === 'grams' ? ' active' : ''),
          onClick: () => setInputMode('grams')
        }, '⚖️ Граммы'),
        React.createElement('button', {
          className: 'aps-mode-btn' + (inputMode === 'kcal' ? ' active' : ''),
          onClick: () => setInputMode('kcal')
        }, '🔥 Ккал')
      ),

      // Слайдер (только в режиме граммов)
      inputMode === 'grams' && React.createElement('input', {
        type: 'range',
        className: 'aps-grams-slider',
        min: 10,
        max: 500,
        step: 5,
        value: Math.min(500, grams),
        onChange: (e) => setGrams(Number(e.target.value)),
        onTouchStart: (e) => e.stopPropagation(),
        onTouchEnd: (e) => e.stopPropagation(),
        onTouchMove: (e) => e.stopPropagation()
      }),

      // Быстрые кнопки
      React.createElement('div', { className: 'aps-quick-grams' },
        quickPortions.map(g =>
          React.createElement('button', {
            key: g,
            className: 'aps-quick-btn' + (grams === g ? ' active' : ''),
            onClick: () => setGrams(g)
          }, g + 'г')
        )
      ),

      // Порции продукта
      localPortions?.length > 0 && React.createElement('div', { className: 'aps-portions' },
        React.createElement('div', { className: 'aps-portions-title' }, 'Порции:'),
        React.createElement('div', { className: 'aps-portions-list' },
          localPortions.map((p, i) =>
            React.createElement('button', {
              key: i,
              className: 'aps-portion-btn' + (grams === p.grams ? ' active' : ''),
              onClick: () => setGrams(p.grams)
            }, p.name + (p.name.includes('г') ? '' : ` (${p.grams}г)`))
          )
        )
      ),

      // Итог дня: +ккал → всего/норма (%)
      React.createElement('div', { className: 'aps-day-total' },
        React.createElement('span', { className: 'aps-day-plus' }, '+' + currentKcal + ' ккал'),
        React.createElement('span', { className: 'aps-day-arrow' }, ' → '),
        React.createElement('span', { className: 'aps-day-sum' },
          (dayTotalKcal + currentKcal) + '/' + dailyGoal
        ),
        React.createElement('span', { className: 'aps-day-pct' },
          ' (' + Math.round((dayTotalKcal + currentKcal) / dailyGoal * 100) + '%)'
        )
      )
    );
  }

  // === Полный редактор продукта (3 шага) ===
  function showEditProductModal(productOrOptions = {}, maybeOptions = {}) {
    let product = productOrOptions;
    let options = maybeOptions;

    if (productOrOptions && typeof productOrOptions === 'object' && productOrOptions.product) {
      options = productOrOptions;
      product = productOrOptions.product;
    }

    const { initialStep = 0, onSave, onClose } = options || {};

    if (!product) {
      HEYS.Toast?.warning('Продукт не найден') || alert('Продукт не найден');
      return;
    }

    if (!HEYS.StepModal?.show) {
      HEYS.Toast?.warning('Модалка недоступна') || alert('Модалка недоступна');
      return;
    }

    if (!canEditProduct(product)) {
      HEYS.Toast?.warning('Нет доступа к редактированию') || alert('Нет доступа к редактированию');
      return;
    }

    HEYS.StepModal.show({
      steps: [
        {
          id: 'edit_basic',
          title: 'Основные',
          hint: 'Название и 12 полей',
          icon: '✏️',
          component: ProductEditBasicStep,
          validate: () => true,
          hideHeaderNext: true,
          getInitialData: () => ({ product })
        },
        {
          id: 'edit_extra',
          title: 'Дополнительно',
          hint: 'Расширенные значения',
          icon: '🧬',
          component: ProductEditExtraStep,
          validate: () => true,
          hideHeaderNext: true
        },
        {
          id: 'portions',
          title: 'Порции',
          hint: 'Настройте порции',
          icon: '🥣',
          component: PortionsStep,
          validate: () => true,
          hideHeaderNext: true
        }
      ],
      context: {
        isEditMode: true,
        isProductEditor: true,
        editProduct: product,
        onFinish: async ({ product: updatedProduct, portions }) => {
          const finalProduct = {
            ...product,
            ...(updatedProduct || {})
          };

          if (Array.isArray(portions)) {
            finalProduct.portions = portions;
          }

          // v4.8.0: Track if name changed for UX feedback
          const nameChanged = product.name !== finalProduct.name;
          const portionsChanged =
            JSON.stringify(normalizePortions(product.portions || [])) !==
            JSON.stringify(normalizePortions(finalProduct.portions || []));
          const otherChanged =
            nameChanged ||
            hasNutrientChanges(product, finalProduct) ||
            (product.category || '') !== (finalProduct.category || '') ||
            (product.description || '') !== (finalProduct.description || '');

          const sharedId = resolveSharedProductId(finalProduct);

          if (isCuratorUser() && sharedId && portionsChanged && !otherChanged) {
            const result = await updateSharedProductPortions(sharedId, finalProduct.portions || [], finalProduct);
            if (result.ok) {
              upsertLocalProduct(finalProduct, false);
              notifyProductUpdated(finalProduct);
              if (nameChanged) {
                HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                  console.log('[HEYS] Product renamed, cascaded to meals');
              }
            }
            onSave?.(finalProduct);
            return;
          }

          if (isSharedProduct(product)) {
            if (isCuratorUser()) {
              const result = await updateSharedProduct(finalProduct);
              if (result.ok) {
                upsertLocalProduct(finalProduct, false);
                notifyProductUpdated(finalProduct);
                // v4.8.0: Show cascade notification for shared products
                if (nameChanged) {
                  HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                    console.log('[HEYS] Product renamed, cascaded to meals');
                }
              }
            } else {
              upsertLocalProduct(finalProduct, true);
              notifyProductUpdated(finalProduct);
              if (nameChanged) {
                HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                  console.log('[HEYS] Product renamed, cascaded to meals');
              }
            }
          } else {
            saveLocalProduct(finalProduct);
            notifyProductUpdated(finalProduct);
            // v4.8.0: Show cascade notification for local products
            if (nameChanged) {
              HEYS.Toast?.info?.('Имя обновлено во всех приёмах') ||
                console.log('[HEYS] Product renamed, cascaded to meals');
            }
          }

          onSave?.(finalProduct);
        }
      },
      initialStep,
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: true,
      allowSwipe: false,
      hidePrimaryOnFirst: true,
      finishLabel: 'Готово',
      title: '',
      onClose
    });
  }

  // === Главная функция показа модалки ===
  function showAddProductModal(options = {}) {
    const {
      mealIndex = 0,
      products: providedProducts,
      day,
      dateKey = new Date().toISOString().slice(0, 10),
      multiProductMode = false,
      onAdd,
      onAddPhoto, // Callback для добавления фото к приёму
      onNewProduct,
      onClose
    } = options;

    // Всегда берём актуальные продукты из хранилища (providedProducts может быть устаревшим)
    const U = HEYS.utils || {};

    // Берём из первого непустого источника с fallback chain
    const fromHeysProducts = HEYS.products?.getAll?.() || [];
    const fromStore = HEYS.store?.get?.('heys_products', []) || [];
    const fromLsGet = U.lsGet?.('heys_products', []) || [];

    let products = [];
    if (fromHeysProducts.length > 0) {
      products = fromHeysProducts;
    } else if (fromStore.length > 0) {
      products = fromStore;
    } else if (fromLsGet.length > 0) {
      products = fromLsGet;
    }

    console.info('[HEYS.addProduct] 📦 Open modal', {
      mealIndex,
      dateKey,
      productsCount: products.length,
      hasProvidedProducts: Array.isArray(providedProducts) && providedProducts.length > 0
    });

    const handleModalClose = () => {
      onClose?.();
    };

    // Mutable ref для обновления продуктов после создания
    let currentProducts = [...products];

    if (!HEYS.StepModal) {
      console.error('[AddProductStep] StepModal not loaded');
      return;
    }

    HEYS.StepModal.show({
      steps: [
        {
          id: 'search',
          title: '',
          hint: '',
          icon: '',
          component: ProductSearchStep,
          getInitialData: () => ({ selectedProduct: null, grams: 100 }),
          validate: (data) => !!data?.selectedProduct
        },
        {
          id: 'create',
          title: 'Новый продукт',
          hint: 'Вставьте строку с макросами',
          icon: '➕',
          component: CreateProductStep,
          validate: () => true,
          hidden: true, // Скрытый шаг — не отображается в progress dots
          hideHeaderNext: true // Скрываем "Далее" — есть своя кнопка "Добавить"
        },
        {
          id: 'portions',
          title: 'Порции',
          hint: 'Добавьте удобные порции',
          icon: '🥣',
          component: PortionsStep,
          validate: () => true,
          hidden: true,
          hideHeaderNext: true
        },
        {
          id: 'harm',
          title: 'Вредность',
          hint: 'Проверьте или измените',
          icon: '🧪',
          component: HarmSelectStep,
          validate: () => true,
          hidden: true, // Скрытый шаг — показывается только при создании нового продукта
          hideHeaderNext: true // Есть своя кнопка выбора
        },
        {
          id: 'grams',
          title: '',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data, stepData) => (data?.grams || stepData?.search?.grams || 0) > 0,
          hideHeaderNext: true // Скрываем кнопку в хедере — есть большая зелёная кнопка внизу
        }
      ],
      context: {
        products: currentProducts,
        day,
        dateKey,
        mealIndex,
        multiProductMode,
        onNewProduct,
        onAdd, // Передаём callback для добавления в приём пищи
        onAddPhoto, // Callback для добавления фото к приёму
        headerRight: ({ stepData, currentConfig, goToStep }) => {
          const countLabel = `🗃️ ${currentProducts.length}`;
          if (currentConfig?.id !== 'grams') return countLabel;

          const product = stepData?.grams?.selectedProduct
            || stepData?.create?.newProduct
            || stepData?.create?.selectedProduct
            || stepData?.search?.selectedProduct;

          const canEdit = canEditProduct(product);

          return React.createElement('div', { className: 'mc-header-right-group' },
            React.createElement('span', { className: 'mc-header-right-count' }, countLabel),
            canEdit && React.createElement('button', {
              className: 'mc-header-right-btn',
              onClick: (e) => {
                e.stopPropagation();
                if (HEYS.StepModal?.hide) {
                  HEYS.StepModal.hide({ scrollToDiary: false });
                }
                setTimeout(() => {
                  showEditProductModal(product);
                }, 80);
              },
              title: 'Редактировать продукт'
            }, '✏️ Изменить')
          );
        }, // Счётчик + кнопка редактирования порций
        // Callback при создании продукта — обновляем список (не используется при 2 шагах, оставляем для совместимости)
        onProductCreated: (product) => {
          currentProducts = [...currentProducts, product];
        }
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: true,
      allowSwipe: false,
      hidePrimaryOnFirst: true,
      finishLabel: 'Добавить', // Кнопка на последнем шаге
      title: '', // Убрали — и так очевидно
      onComplete: (stepData) => {
        // console.log('[AddProductStep] onComplete stepData:', stepData);

        // Данные шагов
        const searchData = stepData.search || {};
        const gramsData = stepData.grams || {};
        const createData = stepData.create || {};

        // Приоритет: продукт из grams (последний шаг), затем create (новый продукт), затем search
        // ВАЖНО: create проверяется перед search, т.к. при создании нового продукта 
        // stepData.grams может не успеть обновиться из-за React batching
        // newProduct — это поле которое всегда устанавливается при создании
        const selectedProduct = gramsData.selectedProduct
          || createData.newProduct
          || createData.selectedProduct
          || searchData.selectedProduct;
        const grams = gramsData.grams || createData.grams || searchData.grams || 100;

        // console.log('[AddProductStep] selectedProduct:', selectedProduct?.name, 'grams:', grams);

        if (selectedProduct && grams) {
          console.info('[HEYS.addProduct] ✅ onComplete -> onAdd', {
            mealIndex,
            grams,
            productId: selectedProduct.id ?? selectedProduct.product_id ?? null,
            productName: selectedProduct.name || null,
            source: selectedProduct._source || (selectedProduct._fromShared ? 'shared' : 'personal')
          });
          onAdd?.({
            product: selectedProduct,
            grams: grams,
            mealIndex
          });

          // 🔔 Dispatch event для advice module
          window.dispatchEvent(new CustomEvent('heysProductAdded', {
            detail: { product: selectedProduct, grams }
          }));
        } else {
          console.warn('[HEYS.addProduct] ⚠️ onComplete skipped (missing product or grams)', {
            mealIndex,
            grams,
            hasSelectedProduct: !!selectedProduct,
            selectedProductName: selectedProduct?.name || null
          });
        }
      },
      onClose: handleModalClose
    });
  }

  // === Функция редактирования граммов (для карточки продукта) ===
  function showEditGramsModal(options = {}) {
    const {
      product,
      currentGrams = 100,
      mealIndex = 0,
      itemId,
      dateKey = new Date().toISOString().slice(0, 10),
      onSave,
      onClose
    } = options;

    if (!product) {
      console.error('[EditGramsModal] No product provided');
      return;
    }

    if (!HEYS.StepModal) {
      console.error('[EditGramsModal] StepModal not loaded');
      return;
    }

    HEYS.StepModal.show({
      steps: [
        {
          id: 'grams',
          title: product?.name || 'Граммы',
          hint: '',
          icon: '⚖️',
          component: GramsStep,
          validate: (data) => (data?.grams || 0) > 0,
          hideHeaderNext: true, // Скрываем кнопку в хедере — используем большую кнопку внизу
          getInitialData: (ctx) => ({
            grams: ctx?.editGrams || currentGrams || 100,
            selectedProduct: ctx?.editProduct || product
          })
        }
      ],
      context: {
        products: [],
        dateKey,
        mealIndex,
        itemId,
        isEditMode: true,
        editProduct: product,   // Продукт через context — доступен сразу
        editGrams: currentGrams, // Граммы через context
        onSave  // Callback для сохранения — используется большой кнопкой
      },
      showGreeting: false,
      showStreak: false,
      showTip: false,
      showProgress: false,
      allowSwipe: false,
      finishLabel: 'Сохранить', // Редактирование — "Сохранить"
      title: '',
      onComplete: (stepData) => {
        const gramsData = stepData.grams || {};
        const grams = gramsData.grams || currentGrams;

        if (grams > 0) {
          onSave?.({
            mealIndex,
            itemId,
            grams
          });
        }
      },
      onClose
    });
  }

  // === Экспорт ===
  HEYS.AddProductStep = {
    show: showAddProductModal,
    showEditGrams: showEditGramsModal,
    showEditProduct: showEditProductModal,
    ProductSearchStep,
    GramsStep,
    PortionsStep,
    CreateProductStep,
    ProductEditBasicStep,
    ProductEditExtraStep,
    HarmSelectStep,
    getCategoryIcon,
    computeSmartProducts,
    updateSharedProduct,
    updateSharedProductPortions
  };

  // === ГЛОБАЛЬНЫЙ МЕХАНИЗМ СОБЫТИЙ ПРОДУКТОВ ===
  // Слушатели на уровне модуля — переживают монтирование/размонтирование компонентов
  // Решение для EDIT flow (showEditProductModal), где ProductSearchStep никогда не монтируется

  function initializeGlobalProductListeners() {
    const handleGlobalProductUpdate = (e) => {
      console.log('[AddProductStep GLOBAL] 🔄 Product event received', {
        event: e?.type,
        detail: e?.detail,
        currentVersion: globalProductsVersion,
        timestamp: new Date().toISOString()
      });

      globalProductsVersion++;

      console.log('[AddProductStep GLOBAL] ✅ Version incremented', {
        newVersion: globalProductsVersion
      });

      // Диспатчим событие для React компонентов
      window.dispatchEvent(new CustomEvent('heys:products-version-changed', {
        detail: {
          version: globalProductsVersion,
          sourceEvent: e?.type
        }
      }));

      console.log('[AddProductStep GLOBAL] 📢 Dispatched version-changed event', {
        version: globalProductsVersion
      });
    };

    // Регистрируем постоянные глобальные слушатели (никогда не удаляются)
    window.addEventListener('heys:local-product-updated', handleGlobalProductUpdate);
    window.addEventListener('heys:product-portions-updated', handleGlobalProductUpdate);
    window.addEventListener('heys:product-updated', handleGlobalProductUpdate);

    console.log('[AddProductStep GLOBAL] ✅ Global product listeners initialized', {
      initialVersion: globalProductsVersion
    });
  }

  // Инициализация при загрузке модуля
  initializeGlobalProductListeners();

  console.log('[HEYS] AddProductStep v1 loaded with global listeners');

})(typeof window !== 'undefined' ? window : global);
