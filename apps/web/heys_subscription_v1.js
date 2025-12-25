// heys_subscription_v1.js — Trial-машина + Read-only режим
// Статусы: none → trial (7 дней) → read_only → active
// Безопасность: все RPC через session_token (не client_id!)
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  // === Константы ===
  const STATUS = {
    NONE: 'none',           // Триал не запущен
    TRIAL: 'trial',         // Триал активен
    ACTIVE: 'active',       // Оплаченная подписка
    READ_ONLY: 'read_only', // Триал/подписка истекла
  };

  const TRIAL_DAYS = 7;
  const CACHE_KEY = 'heys_subscription_status';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

  // === Утилиты ===
  const U = HEYS.utils || {
    lsGet: (k, d) => {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (_) {
        return d;
      }
    },
    lsSet: (k, v) => {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (_) {}
    },
  };

  // === Кэширование статуса ===
  let _cachedStatus = null;
  let _cachedAt = 0;

  function getCachedStatus() {
    if (_cachedStatus && Date.now() - _cachedAt < CACHE_TTL_MS) {
      return _cachedStatus;
    }
    // Пробуем localStorage
    const stored = U.lsGet(CACHE_KEY, null);
    if (stored && stored.status && stored.ts && Date.now() - stored.ts < CACHE_TTL_MS) {
      _cachedStatus = stored.status;
      _cachedAt = stored.ts;
      return _cachedStatus;
    }
    return null;
  }

  function setCachedStatus(status) {
    _cachedStatus = status;
    _cachedAt = Date.now();
    U.lsSet(CACHE_KEY, { status, ts: _cachedAt });
  }

  function clearCache() {
    _cachedStatus = null;
    _cachedAt = 0;
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (_) {}
  }

  // === API вызовы ===
  
  /**
   * Получить статус подписки с сервера
   * @param {boolean} forceRefresh - игнорировать кэш
   * @returns {Promise<string>} - 'none' | 'trial' | 'active' | 'read_only'
   */
  async function getStatus(forceRefresh = false) {
    // Проверяем кэш
    if (!forceRefresh) {
      const cached = getCachedStatus();
      if (cached) return cached;
    }

    // Нет session_token — возвращаем 'none'
    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (!sessionToken) {
      return STATUS.NONE;
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      console.warn('[Subscription] API не готов');
      return getCachedStatus() || STATUS.NONE;
    }

    try {
      const res = await api.rpc('get_subscription_status_by_session', {
        p_session_token: sessionToken,
      });

      if (res.error) {
        // Если сессия невалидна — возможно logout
        if (res.error.message?.includes('invalid_session')) {
          console.warn('[Subscription] Сессия невалидна');
          clearCache();
          return STATUS.NONE;
        }
        throw new Error(res.error.message);
      }

      const status = res.data || STATUS.NONE;
      setCachedStatus(status);
      return status;
    } catch (e) {
      console.error('[Subscription] getStatus error:', e);
      return getCachedStatus() || STATUS.NONE;
    }
  }

  /**
   * Запустить триал (идемпотентно)
   * @param {number} days - дней триала (default 7)
   * @returns {Promise<string>} - новый статус
   */
  async function startTrial(days = TRIAL_DAYS) {
    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (!sessionToken) {
      console.warn('[Subscription] startTrial: нет session_token');
      return STATUS.NONE;
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      console.error('[Subscription] startTrial: API не готов');
      return STATUS.NONE;
    }

    try {
      const res = await api.rpc('start_trial_by_session', {
        p_session_token: sessionToken,
        p_days: days,
      });

      if (res.error) {
        if (res.error.message?.includes('invalid_session')) {
          console.warn('[Subscription] Сессия невалидна');
          clearCache();
          return STATUS.NONE;
        }
        throw new Error(res.error.message);
      }

      const status = res.data || STATUS.TRIAL;
      setCachedStatus(status);
      
      console.log(`[Subscription] ✅ Триал запущен: ${status}`);
      return status;
    } catch (e) {
      console.error('[Subscription] startTrial error:', e);
      return getCachedStatus() || STATUS.NONE;
    }
  }

  // === Хелперы для UI ===

  /**
   * Можно ли добавлять данные? (не read_only)
   */
  function canWrite(status) {
    return status !== STATUS.READ_ONLY;
  }

  /**
   * Показывать ли paywall?
   */
  function shouldShowPaywall(status) {
    return status === STATUS.READ_ONLY || status === STATUS.NONE;
  }

  /**
   * Активен ли триал или подписка?
   */
  function isActive(status) {
    return status === STATUS.TRIAL || status === STATUS.ACTIVE;
  }

  /**
   * Получить UI-метаданные для статуса
   */
  function getStatusMeta(status) {
    switch (status) {
      case STATUS.TRIAL:
        return {
          label: 'Пробный период',
          shortLabel: 'Триал',
          color: '#f59e0b', // amber
          emoji: '⏳',
          canWrite: true,
        };
      case STATUS.ACTIVE:
        return {
          label: 'Подписка активна',
          shortLabel: 'Pro',
          color: '#22c55e', // green
          emoji: '✨',
          canWrite: true,
        };
      case STATUS.READ_ONLY:
        return {
          label: 'Подписка истекла',
          shortLabel: 'Истекла',
          color: '#ef4444', // red
          emoji: '🔒',
          canWrite: false,
        };
      case STATUS.NONE:
      default:
        return {
          label: 'Нет подписки',
          shortLabel: 'Нет',
          color: '#6b7280', // gray
          emoji: '📋',
          canWrite: false,
        };
    }
  }

  // === React Hook (если React доступен) ===
  
  /**
   * useSubscription() — React hook для статуса подписки
   * @returns {{ status, isLoading, isNone, isTrial, isActive, isReadOnly, canWrite, startTrial, refresh }}
   */
  function useSubscription() {
    const React = global.React;
    if (!React) {
      console.warn('[Subscription] React не доступен, useSubscription не работает');
      return {
        status: STATUS.NONE,
        isLoading: false,
        isNone: true,
        isTrial: false,
        isActive: false,
        isReadOnly: false,
        canWrite: false,
        meta: getStatusMeta(STATUS.NONE),
        startTrial: async () => STATUS.NONE,
        refresh: async () => STATUS.NONE,
      };
    }

    const { useState, useEffect, useCallback, useMemo } = React;

    const [status, setStatus] = useState(() => getCachedStatus() || STATUS.NONE);
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async (force = true) => {
      setIsLoading(true);
      try {
        const newStatus = await getStatus(force);
        setStatus(newStatus);
        return newStatus;
      } finally {
        setIsLoading(false);
      }
    }, []);

    const doStartTrial = useCallback(async () => {
      setIsLoading(true);
      try {
        const newStatus = await startTrial(TRIAL_DAYS);
        setStatus(newStatus);
        return newStatus;
      } finally {
        setIsLoading(false);
      }
    }, []);

    // Загружаем статус при монтировании
    useEffect(() => {
      refresh(false);
    }, [refresh]);

    const meta = useMemo(() => getStatusMeta(status), [status]);

    return {
      status,
      isLoading,
      isNone: status === STATUS.NONE,
      isTrial: status === STATUS.TRIAL,
      isActive: status === STATUS.ACTIVE,
      isReadOnly: status === STATUS.READ_ONLY,
      canWrite: canWrite(status),
      meta,
      startTrial: doStartTrial,
      refresh,
    };
  }

  // === Экспорт ===
  HEYS.Subscription = {
    STATUS,
    TRIAL_DAYS,

    // API
    getStatus,
    startTrial,
    clearCache,
    getCachedStatus, // Для синхронной проверки в Paywall

    // Helpers
    canWrite,
    shouldShowPaywall,
    isActive,
    getStatusMeta,

    // React
    useSubscription,
  };

  console.log('[HEYS] 🎫 Subscription module v1.0 loaded');
})(typeof window !== 'undefined' ? window : globalThis);
