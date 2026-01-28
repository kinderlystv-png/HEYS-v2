// heys_cloud_shared_v1.js — shared products API
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const cloud = HEYS.cloud = HEYS.cloud || {};

  function getLogger() {
    const logger = cloud._log || {};
    return {
      log: logger.log || function () { },
      err: logger.err || function () { }
    };
  }

  function getUser() {
    return cloud._getUser ? cloud._getUser() : null;
  }

  HEYS.CloudShared = HEYS.CloudShared || {};

  HEYS.CloudShared.init = function () {
    const { log, err } = getLogger();

    const readStoredValue = (key, fallback = null) => {
      let value;
      if (HEYS.store?.get) {
        value = HEYS.store.get(key, fallback);
      } else if (HEYS.utils?.lsGet) {
        value = HEYS.utils.lsGet(key, fallback);
      } else {
        try {
          value = localStorage.getItem(key);
        } catch {
          return fallback;
        }
      }

      if (value == null) return fallback;

      if (typeof value === 'string') {
        if (value.startsWith('¤Z¤') && HEYS.store?.decompress) {
          try {
            value = HEYS.store.decompress(value.slice(3));
          } catch {
          }
        }
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }

      return value;
    };

    const toNum = (v) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    /**
     * @architecture "Normalize Once, Render Anywhere"
     * - Все shared продукты нормализуются при загрузке
     * - Рендер использует готовые данные
     * - SoT формулы = computeDerivedProduct()
     */
    /**
     * Normalize shared product to have both harm and harmScore fields
     * Uses centralized HEYS.models.normalizeHarm() if available
     * Extended in v4.4.0 to normalize all extended nutrient fields
     */
    const normalizeSharedProduct = (p) => {
      if (!p || typeof p !== 'object') return p;

      if (HEYS.features?.unifiedTables === false) {
        return HEYS.models?.normalizeProductFields
          ? HEYS.models.normalizeProductFields({ ...p })
          : { ...p };
      }

      // Use extended normalization if available (v4.4.0+)
      if (HEYS.models?.normalizeExtendedProduct) {
        try {
          return HEYS.models.normalizeExtendedProduct(p);
        } catch (e) {
          err('[HEYS.shared] normalizeExtendedProduct failed:', e);
        }
      }

      // Fallback to basic normalization (без дублирования extended mapping)
      let next = { ...p };

      if (HEYS.models?.normalizeProductFields) {
        next = HEYS.models.normalizeProductFields(next);
      }

      const harmVal = HEYS.models?.normalizeHarm?.(next) ?? toNum(next.harm ?? next.harmScore ?? next.harmscore);
      if (harmVal != null) {
        next.harm = harmVal;
        next.harmScore = harmVal;
      }

      if (next.gi != null) next.gi = toNum(next.gi);

      if (HEYS.models?.computeDerivedProduct) {
        const derived = HEYS.models.computeDerivedProduct(next);
        next.kcal100 = derived.kcal100;
        next.carbs100 = derived.carbs100;
        next.fat100 = derived.fat100;
        if (derived.harm != null && next.harm == null) {
          next.harm = derived.harm;
          next.harmScore = derived.harm;
        }
      }

      next._normalized = true;
      return next;
    };

    const backfillSharedHarm = async (items) => {
      if (!Array.isArray(items) || items.length === 0) return items;

      const calcHarm = HEYS?.Harm?.calculateHarmScore;
      if (typeof calcHarm !== 'function') return items;

      const needs = items.filter(p => p && p.id && (p.harm == null && p.harmScore == null));
      if (needs.length === 0) return items;

      const withHarm = items.map(p => {
        if (!p || p.harm != null || p.harmScore != null) return p;
        const harmValue = calcHarm(p);
        return { ...p, harm: harmValue, harmScore: harmValue };
      });

      const canPersist = HEYS?.utils?.lsGet && HEYS?.utils?.lsSet;
      const backfillKey = 'heys_shared_harm_backfill_v1';
      const missingKey = needs.map(p => p.id).sort().join('|');
      const lastKey = canPersist ? HEYS.utils.lsGet(backfillKey, '') : '';

      if (missingKey && missingKey !== lastKey) {
        try {
          const updates = needs.map(p => ({ id: p.id, harm: calcHarm(p) }));
          const { error } = await YandexAPI.rest('shared_products', {
            method: 'POST',
            data: updates,
            upsert: true,
            onConflict: 'id'
          });

          if (!error && canPersist) {
            HEYS.utils.lsSet(backfillKey, missingKey);
          }

          if (error) {
            HEYS.analytics?.trackError?.(error, { context: 'shared_harm_backfill' });
          }
        } catch (e) {
          HEYS.analytics?.trackError?.(e, { context: 'shared_harm_backfill' });
        }
      }

      return withHarm;
    };

    let _sharedProductsCache = [];
    let _sharedProductsCacheTime = 0;
    const SHARED_PRODUCTS_CACHE_TTL = 5 * 60 * 1000;

    cloud.getCachedSharedProducts = function () {
      return _sharedProductsCache || [];
    };

    cloud.getAllSharedProducts = async function (options = {}) {
      const { limit = 500, excludeBlocklist = true } = options;

      try {
        let data = null;
        let error = null;

        if (YandexAPI?.rpc) {
          const rpcResult = await YandexAPI.rpc('get_shared_products', {
            p_search: null,
            p_limit: limit,
            p_offset: 0
          });
          data = rpcResult?.data;
          error = rpcResult?.error;
        }

        if (error || !Array.isArray(data)) {
          const restResult = await YandexAPI.from('shared_products')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
          data = restResult?.data;
          error = restResult?.error;
        }

        if (error) {
          err('[SHARED PRODUCTS] Get all error:', error);
          return { data: null, error };
        }

        const safeNormalize = (item) => {
          try {
            return normalizeSharedProduct(item);
          } catch (e) {
            err('[HEYS.shared] normalizeSharedProduct failed:', e);
            return null;
          }
        };
        let filtered = (data || []).map(safeNormalize).filter(Boolean);
        filtered = await backfillSharedHarm(filtered);
        const user = getUser();
        if (excludeBlocklist && user) {
          const blocklist = await cloud.getBlocklist();
          const blocklistSet = new Set(blocklist.map(id => id));
          filtered = filtered.filter(p => !blocklistSet.has(p.id));
        }

        _sharedProductsCache = filtered;
        _sharedProductsCacheTime = Date.now();
        log(`[SHARED PRODUCTS] Loaded ${filtered.length} products total, cached`);

        return { data: filtered, error: null };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message };
      }
    };

    cloud.searchSharedProducts = async function (query, options = {}) {
      const { limit = 50, excludeBlocklist = true, fingerprint = null } = options;
      const normQuery = (HEYS?.models?.normalizeProductName
        ? HEYS.models.normalizeProductName(query)
        : (query || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));

      try {
        const fetchByName = async (nameQ) => {
          const q = (nameQ || '').toString().trim();
          if (!q) return [];
          const { data, error } = await YandexAPI.rest('shared_products', {
            select: '*',
            filters: { 'ilike.name_norm': `%${q}%` },
            order: 'created_at.desc',
            limit
          });
          if (error) throw error;
          return data || [];
        };

        const filters = {};

        if (fingerprint) {
          filters['eq.fingerprint'] = fingerprint;
        } else if (normQuery) {
          filters['ilike.name_norm'] = `%${normQuery}%`;
        }

        let data;
        let error;
        ({ data, error } = await YandexAPI.rest('shared_products', {
          select: '*',
          filters,
          order: 'created_at.desc',
          limit
        }));

        if (error) {
          err('[SHARED PRODUCTS] Search error:', error);
          return { data: null, error };
        }

        if (!fingerprint && normQuery && Array.isArray(data)) {
          const baseCount = data.length;
          if (baseCount < 3 && normQuery.length >= 4) {
            const prefix3 = normQuery.slice(0, 3);
            if (prefix3 && prefix3.length === 3 && prefix3 !== normQuery) {
              try {
                const fallbackData = await fetchByName(prefix3);
                if (fallbackData && fallbackData.length) {
                  const byId = new Map();
                  (data || []).forEach(p => {
                    const key = p?.id || p?.fingerprint || p?.name;
                    if (key) byId.set(key, p);
                  });
                  fallbackData.forEach(p => {
                    const key = p?.id || p?.fingerprint || p?.name;
                    if (key && !byId.has(key)) byId.set(key, p);
                  });
                  data = Array.from(byId.values()).slice(0, limit);
                }
              } catch (e) {
              }
            }
          }
        }

        const safeNormalize = (item) => {
          try {
            return normalizeSharedProduct(item);
          } catch (e) {
            err('[HEYS.shared] normalizeSharedProduct failed:', e);
            return null;
          }
        };
        let filtered = (data || []).map(safeNormalize).filter(Boolean);
        const user = getUser();
        if (excludeBlocklist && user) {
          const blocklist = await cloud.getBlocklist();
          const blocklistSet = new Set(blocklist.map(id => id));
          filtered = filtered.filter(p => !blocklistSet.has(p.id));
        }

        log(`[SHARED PRODUCTS] Found ${filtered.length} products for "${query}"`);
        return { data: filtered, error: null };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message };
      }
    };

    cloud.publishToShared = async function (product) {
      const user = getUser();
      if (!user) {
        return { data: null, error: 'Not authenticated', status: 'error' };
      }

      try {
        const fingerprint = await HEYS.models.computeProductFingerprint(product);
        const name_norm = HEYS.models.normalizeProductName(product.name);

        const curatorId = user?.id;

        if (!curatorId) {
          console.error('[SHARED] No curator ID');
          return { data: null, error: 'Not authenticated as curator', status: 'error' };
        }

        const productData = {
          name: product.name,
          fingerprint,
          simple100: product.simple100 || 0,
          complex100: product.complex100 || 0,
          protein100: product.protein100 || 0,
          badFat100: product.badFat100 || 0,
          goodFat100: product.goodFat100 || 0,
          trans100: product.trans100 || 0,
          fiber100: product.fiber100 || 0,
          gi: product.gi,
          harm: product.harm,
          category: product.category,
          portions: product.portions || null,
          description: product.description || null,
          // Extended fields (v4.4.0)
          sodium100: product.sodium100 || null,
          omega3_100: product.omega3_100 || null,
          omega6_100: product.omega6_100 || null,
          nova_group: product.nova_group || null,
          additives: product.additives || null,
          nutrient_density: product.nutrient_density || null,
          is_organic: product.is_organic || false,
          is_whole_grain: product.is_whole_grain || false,
          is_fermented: product.is_fermented || false,
          is_raw: product.is_raw || false,
          // Vitamins
          vitamin_a: product.vitamin_a || null,
          vitamin_c: product.vitamin_c || null,
          vitamin_d: product.vitamin_d || null,
          vitamin_e: product.vitamin_e || null,
          vitamin_k: product.vitamin_k || null,
          vitamin_b1: product.vitamin_b1 || null,
          vitamin_b2: product.vitamin_b2 || null,
          vitamin_b3: product.vitamin_b3 || null,
          vitamin_b6: product.vitamin_b6 || null,
          vitamin_b9: product.vitamin_b9 || null,
          vitamin_b12: product.vitamin_b12 || null,
          // Minerals
          calcium: product.calcium || null,
          iron: product.iron || null,
          magnesium: product.magnesium || null,
          phosphorus: product.phosphorus || null,
          potassium: product.potassium || null,
          zinc: product.zinc || null,
          selenium: product.selenium || null,
          iodine: product.iodine || null
        };

        console.log('[SHARED] 📝 Publishing via RPC:', productData.name);

        const { data, error } = await YandexAPI.rpc('publish_shared_product_by_curator', {
          p_curator_id: curatorId,
          p_product_data: productData
        });

        console.log('[SHARED] RPC result:', { data, error });

        if (error) {
          console.error('[SHARED] ❌ Publish error:', error);
          err('[SHARED PRODUCTS] Publish error:', error);
          return { data: null, error, status: 'error' };
        }

        if (data?.success === false) {
          console.error('[SHARED] ❌ RPC returned error:', data.error);
          return { data: null, error: data.error, status: 'error', message: data.message };
        }

        const status = data?.status || 'published';
        console.log('[SHARED] ✅ Result:', status, product.name);
        log('[SHARED PRODUCTS] Result:', status, product.name);
        return {
          data: { id: data?.id },
          error: null,
          status,
          message: data?.message
        };
      } catch (e) {
        console.error('[SHARED] ❌ Unexpected error:', e);
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message, status: 'error' };
      }
    };

    cloud.deleteSharedProduct = async function (productId) {
      console.log('[SHARED] 🗑️ deleteSharedProduct called:', productId);

      const user = getUser();
      if (!user) {
        console.log('[SHARED] ❌ Not authenticated');
        return { success: false, error: 'Not authenticated' };
      }

      try {
        const { error } = await YandexAPI.from('shared_products')
          .delete()
          .eq('id', productId);

        if (error) {
          console.error('[SHARED] ❌ Delete error:', error);
          return { success: false, error: error.message };
        }

        console.log('[SHARED] ✅ Deleted from shared:', productId);
        return { success: true, error: null };
      } catch (e) {
        console.error('[SHARED] ❌ Unexpected error:', e);
        return { success: false, error: e.message };
      }
    };

    cloud.createPendingProduct = async function (clientId, product) {
      try {
        const sessionToken = (typeof HEYS !== 'undefined' && HEYS.Auth?.getSessionToken?.())
          || readStoredValue('heys_session_token', null);
        if (!sessionToken) {
          return { data: null, error: 'No session token', status: 'error' };
        }

        const { data, error } = await YandexAPI.rpc('create_pending_product_by_session', {
          p_session_token: sessionToken,
          p_name: product.name,
          p_product_data: product
        });

        if (error) {
          err('[SHARED PRODUCTS] Pending create error:', error);
          return { data: null, error, status: 'error' };
        }

        log('[SHARED PRODUCTS] Pending created:', data);
        return {
          data,
          error: null,
          status: data.status,
          message: data.message
        };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message, status: 'error' };
      }
    };

    cloud.getPendingProducts = async function () {
      const user = getUser();
      if (!user) {
        return { data: null, error: 'Not authenticated' };
      }

      try {
        const { data, error } = await YandexAPI.rest('shared_products_pending', {
          select: '*',
          filters: {
            'eq.curator_id': user.id,
            'eq.status': 'pending'
          },
          order: 'created_at.desc'
        });

        if (error) {
          err('[SHARED PRODUCTS] Get pending error:', error);
          return { data: null, error };
        }

        log(`[SHARED PRODUCTS] Found ${data?.length || 0} pending products`);
        return { data, error: null };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message };
      }
    };

    cloud.approvePendingProduct = async function (pendingId, productData) {
      const user = getUser();
      if (!user) {
        return { data: null, error: 'Not authenticated', status: 'error' };
      }

      try {
        const publishResult = await cloud.publishToShared(productData);

        if (publishResult.error && publishResult.status !== 'exists') {
          return publishResult;
        }

        const { error: updateError } = await YandexAPI.rest('shared_products_pending', {
          method: 'PATCH',
          filters: { 'eq.id': pendingId },
          data: {
            status: 'approved',
            moderated_at: new Date().toISOString(),
            moderated_by: user.id
          }
        });

        if (updateError) {
          err('[SHARED PRODUCTS] Approve update error:', updateError);
          return { data: null, error: updateError, status: 'error' };
        }

        log('[SHARED PRODUCTS] Approved pending:', pendingId);
        return {
          data: publishResult.data,
          error: null,
          status: 'approved',
          existing: publishResult.status === 'exists'
        };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message, status: 'error' };
      }
    };

    cloud.rejectPendingProduct = async function (pendingId, reason = '') {
      const user = getUser();
      if (!user) {
        return { data: null, error: 'Not authenticated' };
      }

      try {
        const { data, error } = await YandexAPI.rest('shared_products_pending', {
          method: 'PATCH',
          filters: { 'eq.id': pendingId },
          data: {
            status: 'rejected',
            reject_reason: reason,
            moderated_at: new Date().toISOString(),
            moderated_by: user.id
          },
          select: '*',
          limit: 1
        });

        if (error) {
          err('[SHARED PRODUCTS] Reject error:', error);
          return { data: null, error };
        }

        log('[SHARED PRODUCTS] Rejected pending:', pendingId);
        return { data, error: null };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message };
      }
    };

    cloud.getBlocklist = async function () {
      const user = getUser();
      if (!user) return [];

      try {
        const { data, error } = await YandexAPI.rest('shared_products_blocklist', {
          select: 'product_id',
          filters: { 'eq.curator_id': user.id }
        });

        if (error) {
          err('[SHARED PRODUCTS] Get blocklist error:', error);
          return [];
        }

        return (data || []).map(row => row.product_id);
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return [];
      }
    };

    cloud.blockProduct = async function (productId) {
      const user = getUser();
      if (!user) {
        return { data: null, error: 'Not authenticated' };
      }

      try {
        const { data, error } = await YandexAPI.rest('shared_products_blocklist', {
          method: 'POST',
          data: {
            curator_id: user.id,
            product_id: productId
          },
          select: '*',
          limit: 1
        });

        if (error) {
          err('[SHARED PRODUCTS] Block error:', error);
          return { data: null, error };
        }

        log('[SHARED PRODUCTS] Blocked product:', productId);
        return { data, error: null };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message };
      }
    };

    cloud.unblockProduct = async function (productId) {
      const user = getUser();
      if (!user) {
        return { data: null, error: 'Not authenticated' };
      }

      try {
        const { error } = await YandexAPI.rest('shared_products_blocklist', {
          method: 'DELETE',
          filters: {
            'eq.curator_id': user.id,
            'eq.product_id': productId
          }
        });

        if (error) {
          err('[SHARED PRODUCTS] Unblock error:', error);
          return { data: null, error };
        }

        log('[SHARED PRODUCTS] Unblocked product:', productId);
        return { data: true, error: null };
      } catch (e) {
        err('[SHARED PRODUCTS] Unexpected error:', e);
        return { data: null, error: e.message };
      }
    };
  };
})(window);
