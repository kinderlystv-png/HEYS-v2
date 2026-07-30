// heys_subscription_v1.js — Trial-машина + Read-only режим
// Статусы: none → trial (7 дней) → read_only → active
// Безопасность: все RPC через session_token (не client_id!)
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  // === Константы ===
  const STATUS = {
    NONE: 'none',                 // Нет подписки
    TRIAL_PENDING: 'trial_pending', // Куратор назначил будущую дату старта
    TRIAL: 'trial',               // Триал активен (7 дней)
    ACTIVE: 'active',             // Оплаченная подписка
    READ_ONLY: 'read_only',       // Триал/подписка истекла
  };

  const TRIAL_DAYS = 7;
  const CACHE_KEY = 'heys_subscription_status';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

  function normalizeStatus(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return '';
    if (typeof value.status === 'string') return value.status;
    if (typeof value.subscription_status === 'string') return value.subscription_status;
    if (value.data) return normalizeStatus(value.data);
    if (value.get_subscription_status_by_session) {
      return normalizeStatus(value.get_subscription_status_by_session);
    }
    return '';
  }

  function normalizeDetails(value) {
    let payload = value;
    if (payload?.data) payload = payload.data;
    if (payload?.get_subscription_status_by_session) {
      payload = payload.get_subscription_status_by_session;
    }
    if (Array.isArray(payload)) payload = payload[0] || null;
    const status = normalizeStatus(payload) || STATUS.NONE;
    if (!payload || typeof payload !== 'object') return { status };
    return {
      status,
      trial_approved_at: payload.trial_approved_at || null,
      trial_started_at: payload.trial_started_at || null,
      trial_ends_at: payload.trial_ends_at || null,
      active_until: payload.active_until || null,
      days_left: payload.days_left ?? null,
    };
  }

  function canWriteStatus(value) {
    const status = normalizeStatus(value);
    return status === STATUS.TRIAL || status === STATUS.ACTIVE;
  }

  // === Утилиты ===
  const U = HEYS.utils || {};

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

  const readCacheValue = (key, fallback) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, fallback);
        }
      }
      if (U.lsGet) return U.lsGet(key, fallback);
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, fallback);
      return fallback;
    } catch (_) {
      return fallback;
    }
  };

  const writeCacheValue = (key, value) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(key, value);
        return;
      }
      if (U.lsSet) {
        U.lsSet(key, value);
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) { }
  };

  const readGlobalValue = (key, fallback = null) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return tryParseStoredValue(raw, fallback);
    } catch (_) {
      return fallback;
    }
  };

  const normalizeClientId = (value) => {
    if (!value) return '';
    const parsed = tryParseStoredValue(value, value);
    return typeof parsed === 'string' ? parsed.replace(/"/g, '') : '';
  };

  const getCurrentClientId = () => {
    try {
      return normalizeClientId(HEYS.currentClientId)
        || normalizeClientId(localStorage.getItem('heys_client_current'));
    } catch (_) {
      return '';
    }
  };

  const getLocalSubscriptionStatus = () => {
    try {
      const profile = readCacheValue('heys_profile', {}) || {};
      if (profile.subscription_status) return profile.subscription_status;

      const clientId = getCurrentClientId();
      const clients = readCacheValue('heys_clients', []) || [];
      if (clientId && Array.isArray(clients)) {
        const client = clients.find((c) => c && c.id === clientId);
        if (client && client.subscription_status) return client.subscription_status;
      }

      const cached = getCachedStatus();
      return cached || STATUS.NONE;
    } catch (_) {
      return getCachedStatus() || STATUS.NONE;
    }
  };

  const isCuratorSession = () => {
    try {
      const hasPinAuth = !!readGlobalValue('heys_pin_auth_client', null)
        || !!readGlobalValue('heys_pin_cookie_session_hint', null);
      if (hasPinAuth) return false;
      if (HEYS.auth?.isCuratorSession?.() === true) return true;
      return !!(HEYS.cloud?.getUser?.()
        || HEYS.YandexAPI?.getCuratorToken?.()
        || readGlobalValue('heys_curator_cookie_session_hint', null));
    } catch (_) {
      return false;
    }
  };

  const hasClientSessionSignal = () => {
    try {
      return !!HEYS.auth?.getSessionToken?.()
        || !!readGlobalValue('heys_pin_auth_client', null)
        || !!readGlobalValue('heys_pin_cookie_session_hint', null)
        || !!readGlobalValue('heys_session_token', null);
    } catch (_) {
      return false;
    }
  };

  const removeCacheValue = (key) => {
    try {
      if (HEYS.store?.set) HEYS.store.set(key, null);
    } catch (_) { }
    try { localStorage.removeItem(key); } catch (_) { }
  };

  // === Кэширование статуса ===
  let _cachedStatus = null;
  let _cachedDetails = null;
  let _cachedAt = 0;

  function getCachedStatus() {
    if (_cachedStatus && Date.now() - _cachedAt < CACHE_TTL_MS) {
      return _cachedStatus;
    }
    // Пробуем localStorage
    const stored = readCacheValue(CACHE_KEY, null);
    if (stored && stored.status && stored.ts && Date.now() - stored.ts < CACHE_TTL_MS) {
      _cachedStatus = stored.status;
      _cachedAt = stored.ts;
      return _cachedStatus;
    }
    return null;
  }

  function getCachedDetails() {
    const status = getCachedStatus();
    if (!status) return null;
    return _cachedDetails?.status === status ? { ..._cachedDetails } : { status };
  }

  function setCachedStatus(status, details = null) {
    const prev = _cachedStatus;
    const prevDetails = _cachedDetails;
    _cachedStatus = status;
    _cachedDetails = details ? { ...details, status } : { status };
    _cachedAt = Date.now();
    // Не пишем в storage если статус не изменился — иначе обновление ts
    // каждые 5 минут триггерит бесполезный cloud sync
    const detailsChanged = JSON.stringify(prevDetails || null) !== JSON.stringify(_cachedDetails);
    if (prev !== status || detailsChanged) {
      writeCacheValue(CACHE_KEY, { status, ts: _cachedAt });
      try {
        window.dispatchEvent(new CustomEvent('heys:subscription-changed', {
          detail: { ..._cachedDetails, status, previousStatus: prev || null }
        }));
      } catch (_) { }
    }
  }

  function clearCache() {
    _cachedStatus = null;
    _cachedDetails = null;
    _cachedAt = 0;
    _inflightPromise = null; // сбрасываем in-flight при очистке кэша
    removeCacheValue(CACHE_KEY);
  }

  // === In-flight deduplication (thundering herd prevention) ===
  let _inflightPromise = null;

  function unwrapStatusPayload(payload) {
    return normalizeStatus(payload) || STATUS.NONE;
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
      if (cached) {
        return cached;
      }
    }

    // === DEDUPE: если уже есть запрос в полёте — ждём его результат ===
    if (_inflightPromise && !forceRefresh) {
      return _inflightPromise;
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      console.warn('[Subscription] API не готов');
      return getLocalSubscriptionStatus();
    }

    // Legacy sessions still expose a JS token. Post PR-C sessions use the
    // HttpOnly cookie carrier, so absence of a readable token is not logout.
    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (isCuratorSession()) {
      const localStatus = getLocalSubscriptionStatus();
      setCachedStatus(localStatus);
      return localStatus;
    }
    if (!hasClientSessionSignal()) {
      const localStatus = getLocalSubscriptionStatus();
      setCachedStatus(localStatus);
      return localStatus;
    }

    const rpcParams = {};
    if (sessionToken) rpcParams.p_session_token = sessionToken;

    // Создаём promise и сохраняем его для дедупликации
    _inflightPromise = (async () => {
      try {
        // 🔇 v4.7.0: Логи отключены
        const res = await api.rpc('get_subscription_status_by_session', rpcParams);

        if (res.error) {
          // Если сессия невалидна — возможно logout
          if (res.error.message?.includes('invalid_session')) {
            return getLocalSubscriptionStatus();
          }
          throw new Error(res.error.message);
        }

        const details = normalizeDetails(res.data || STATUS.NONE);
        const status = details.status;
        setCachedStatus(status, details);

        // 🎫 v3.0: trial_pending = куратор одобрил, но дата старта в будущем
        // Таймер НЕ запускается автоматически — куратор выбирает дату при активации
        // Когда дата наступит, БД автоматически вернёт status='trial'

        return status;
      } catch (e) {
        if (!/invalid_session|no session token/i.test(String(e?.message || e))) {
          console.error('[Subscription] getStatus error:', e);
        }
        return getCachedStatus() || STATUS.NONE;
      } finally {
        // Очищаем in-flight promise после завершения
        _inflightPromise = null;
      }
    })();

    return _inflightPromise;
  }

  async function getStatusDetails(forceRefresh = false) {
    const status = await getStatus(forceRefresh);
    return getCachedDetails() || { status };
  }

  let _passiveRefreshTimer = null;
  function schedulePassiveRefresh(reason) {
    if (typeof window === 'undefined') return;
    if (_passiveRefreshTimer) clearTimeout(_passiveRefreshTimer);
    _passiveRefreshTimer = setTimeout(() => {
      _passiveRefreshTimer = null;
      getStatus(true).catch((e) => {
        if (!/invalid_session|no session token/i.test(String(e?.message || e))) {
          console.warn('[Subscription] passive refresh failed:', reason, e?.message || e);
        }
      });
    }, 150);
  }

  /**
   * @deprecated Триал активирует куратор через admin_activate_trial.
   * Оставлено только как fail-closed compatibility API.
   */
  async function startTrial(days = TRIAL_DAYS) {
    console.warn('[Subscription] ⚠️ startTrial() deprecated — триал запускает куратор');
    return getCachedStatus() || STATUS.NONE;
  }

  /** @deprecated Клиент не может запускать триал: дату назначает только куратор. */
  async function activateTrialTimer() {
    console.warn('[Subscription] activateTrialTimer() blocked — триал запускает куратор');
    return { success: false, message: 'curator_activation_required' };
  }

  // === Хелперы для UI ===

  /**
   * Можно ли добавлять данные?
   * trial_pending ещё не открывает дневник: куратор одобрил, но доступ стартует позже.
   */
  function canWrite(status) {
    return canWriteStatus(status);
  }

  /**
   * Показывать ли paywall?
   */
  function shouldShowPaywall(status) {
    return status === STATUS.READ_ONLY;
  }

  /**
   * Активен ли триал или подписка?
   */
  function isActive(status) {
    return canWriteStatus(status);
  }

  /**
   * Получить UI-метаданные для статуса
   */
  function getStatusMeta(status) {
    const normalized = normalizeStatus(status) || STATUS.NONE;
    const accessAllowed = canWriteStatus(normalized);
    switch (normalized) {
      case STATUS.TRIAL_PENDING:
        return {
          label: 'Триал запланирован',
          shortLabel: 'Запланирован',
          color: '#3b82f6', // blue
          emoji: '✅',
          canWrite: accessAllowed,
        };
      case STATUS.TRIAL:
        return {
          label: 'Пробный период',
          shortLabel: 'Триал',
          color: '#f59e0b', // amber
          emoji: '⏳',
          canWrite: accessAllowed,
        };
      case STATUS.ACTIVE:
        return {
          label: 'Подписка активна',
          shortLabel: 'Pro',
          color: '#22c55e', // green
          emoji: '✨',
          canWrite: accessAllowed,
        };
      case STATUS.READ_ONLY:
        return {
          label: 'Подписка истекла',
          shortLabel: 'Истекла',
          color: '#ef4444', // red
          emoji: '🔒',
          canWrite: accessAllowed,
        };
      case STATUS.NONE:
      default:
        return {
          label: 'Нет подписки',
          shortLabel: 'Нет',
          color: '#6b7280', // gray
          emoji: '📋',
          canWrite: accessAllowed,
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
    const [details, setDetails] = useState(() => getCachedDetails() || { status: getCachedStatus() || STATUS.NONE });
    const [isLoading, setIsLoading] = useState(true);

    const refresh = useCallback(async (force = true) => {
      setIsLoading(true);
      try {
        const newStatus = await getStatus(force);
        setStatus(newStatus);
        setDetails(getCachedDetails() || { status: newStatus });
        return newStatus;
      } finally {
        setIsLoading(false);
      }
    }, []);

    /** @deprecated v5.0 — триал запускает куратор */
    const doStartTrial = useCallback(async () => {
      console.warn('[Subscription] useSubscription.startTrial() deprecated');
      return status;
    }, [status]);

    // Загружаем статус при монтировании
    useEffect(() => {
      refresh(false);
    }, [refresh]);

    useEffect(() => {
      const handleChange = (event) => {
        const next = normalizeDetails(event?.detail || STATUS.NONE);
        setStatus(next.status);
        setDetails(next);
        setIsLoading(false);
      };
      window.addEventListener('heys:subscription-changed', handleChange);
      return () => window.removeEventListener('heys:subscription-changed', handleChange);
    }, []);

    const meta = useMemo(() => getStatusMeta(status), [status]);

    return {
      status,
      details,
      isLoading,
      isNone: status === STATUS.NONE,
      isTrialPending: status === STATUS.TRIAL_PENDING,
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
    getStatusDetails,
    refresh: () => getStatus(true),
    startTrial,            // @deprecated — триал запускает куратор
    activateTrialTimer,    // @deprecated — fail-closed compatibility stub
    clearCache,
    getCachedStatus,       // Для синхронной проверки в Paywall
    getCachedDetails,
    getLocalStatus: getLocalSubscriptionStatus,

    // Helpers
    normalizeStatus,
    normalizeDetails,
    canWriteStatus,
    canWrite,
    shouldShowPaywall,
    isActive,
    getStatusMeta,

    // React
    useSubscription,
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('heys:auth-changed', () => schedulePassiveRefresh('auth-changed'));
    window.addEventListener('heys:client-changed', () => schedulePassiveRefresh('client-changed'));
    window.addEventListener('focus', () => schedulePassiveRefresh('focus'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') schedulePassiveRefresh('visibility');
    });
  }

  // 🔇 v4.7.0: Лог загрузки отключён
})(typeof window !== 'undefined' ? window : globalThis);
