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

    const toNum = (v) => {
      if (v == null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const normalizeSharedProduct = (p) => {
      if (!p || typeof p !== 'object') return p;
      const next = { ...p };
      if (next.harmScore == null) {
        if (next.harmscore != null) next.harmScore = next.harmscore;
        else if (next.harm != null) next.harmScore = next.harm;
      }
      if (next.harm == null && next.harmScore != null) next.harm = next.harmScore;
      if (next.harm != null) next.harm = toNum(next.harm);
      if (next.harmScore != null) next.harmScore = toNum(next.harmScore);
      if (next.gi != null) next.gi = toNum(next.gi);
      return next;
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
        const { data, error } = await YandexAPI.from('shared_products')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          err('[SHARED PRODUCTS] Get all error:', error);
          return { data: null, error };
        }

        let filtered = (data || []).map(normalizeSharedProduct);
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
      console.log('[SHARED SEARCH] Called with query:', query, 'user:', !!getUser());

      const { limit = 50, excludeBlocklist = true, fingerprint = null } = options;
      const normQuery = (HEYS?.models?.normalizeProductName
        ? HEYS.models.normalizeProductName(query)
        : (query || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/ё/g, 'е'));
      console.log('[SHARED SEARCH] Normalized query:', normQuery);

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
        console.log('[SHARED SEARCH] Query result:', data?.length, 'error:', error);

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

        let filtered = (data || []).map(normalizeSharedProduct);
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
      console.log('[SHARED] 📤 publishToShared called:', {
        hasUser: !!getUser(),
        userId: getUser()?.id,
        productName: product?.name
      });

      const user = getUser();
      if (!user) {
        console.log('[SHARED] ❌ Not authenticated:', { user: !!user });
        return { data: null, error: 'Not authenticated', status: 'error' };
      }

      try {
        console.log('[SHARED] 🔑 Computing fingerprint...');
        const fingerprint = await HEYS.models.computeProductFingerprint(product);
        const name_norm = HEYS.models.normalizeProductName(product.name);
        console.log('[SHARED] Fingerprint:', fingerprint, 'Name norm:', name_norm);

        const curatorId = user?.id;

        if (!curatorId) {
          console.error('[SHARED] ❌ No curator ID (user.id)');
          return { data: null, error: 'Not authenticated as curator', status: 'error' };
        }

        console.log('[SHARED] 👤 Using curator ID:', curatorId);

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
          description: product.description || null
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
          || HEYS.utils?.lsGet?.('heys_session_token', null)
          || (() => { try { return JSON.parse(localStorage.getItem('heys_session_token')); } catch { return null; } })();
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
