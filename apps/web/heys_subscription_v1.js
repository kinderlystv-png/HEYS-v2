// heys_subscription_v1.js — Trial-машина + Read-only режим
// Статусы: none → trial (7 дней) → read_only → active
// Безопасность: все RPC через session_token (не client_id!)
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  // === Константы ===
  const STATUS = {
    NONE: 'none',                 // Нет подписки
    TRIAL_PENDING: 'trial_pending', // Куратор одобрил, ждём первый логин (таймер не запущен)
    TRIAL: 'trial',               // Триал активен (7 дней)
    ACTIVE: 'active',             // Оплаченная подписка
    READ_ONLY: 'read_only',       // Триал/подписка истекла
  };

  const TRIAL_DAYS = 7;
  const CACHE_KEY = 'heys_subscription_status';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут

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

  const removeCacheValue = (key) => {
    try {
      if (HEYS.store?.set) HEYS.store.set(key, null);
    } catch (_) { }
    try { localStorage.removeItem(key); } catch (_) { }
  };

  // === Кэширование статуса ===
  let _cachedStatus = null;
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

  function setCachedStatus(status) {
    _cachedStatus = status;
    _cachedAt = Date.now();
    writeCacheValue(CACHE_KEY, { status, ts: _cachedAt });
  }

  function clearCache() {
    _cachedStatus = null;
    _cachedAt = 0;
    _inflightPromise = null; // сбрасываем in-flight при очистке кэша
    removeCacheValue(CACHE_KEY);
  }

  // === In-flight deduplication (thundering herd prevention) ===
  let _inflightPromise = null;

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

    // Создаём promise и сохраняем его для дедупликации
    _inflightPromise = (async () => {
      try {
        // 🔇 v4.7.0: Логи отключены
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

        // 🎫 v3.0: trial_pending = куратор одобрил, но дата старта в будущем
        // Таймер НЕ запускается автоматически — куратор выбирает дату при активации
        // Когда дата наступит, БД автоматически вернёт status='trial'

        return status;
      } catch (e) {
        console.error('[Subscription] getStatus error:', e);
        return getCachedStatus() || STATUS.NONE;
      } finally {
        // Очищаем in-flight promise после завершения
        _inflightPromise = null;
      }
    })();

    return _inflightPromise;
  }

  /**
   * @deprecated v5.0 — Триал теперь активирует куратор через admin_activate_trial.
   * Таймер стартует автоматически при первом логине через activateTrialTimer().
   * Оставлено для обратной совместимости.
   */
  async function startTrial(days = TRIAL_DAYS) {
    console.warn('[Subscription] ⚠️ startTrial() deprecated — триал запускает куратор');
    return getCachedStatus() || STATUS.NONE;
  }

  /**
   * @deprecated v3.0 — Таймер управляется куратором через admin_activate_trial(start_date).
   * Оставлено для обратной совместимости — может пригодиться для ручного запуска.
   * Идемпотентна: если таймер уже запущен — ничего не делает.
   * @returns {Promise<{success: boolean, message: string, trial_ends_at: string}>}
   */
  async function activateTrialTimer() {
    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (!sessionToken) {
      console.warn('[Subscription] activateTrialTimer: нет session_token');
      return { success: false, message: 'no_session' };
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      console.error('[Subscription] activateTrialTimer: API не готов');
      return { success: false, message: 'api_not_ready' };
    }

    try {
      const res = await api.rpc('activate_trial_timer_by_session', {
        p_session_token: sessionToken,
      });

      if (res.error) {
        if (res.error.message?.includes('invalid_session') || res.error.message?.includes('invalid_or_expired_session')) {
          console.warn('[Subscription] Сессия невалидна');
          clearCache();
          return { success: false, message: 'invalid_session' };
        }
        throw new Error(res.error.message);
      }

      const result = res.data?.activate_trial_timer_by_session?.[0] || res.data?.[0] || res.data || {};

      if (result.success && result.message === 'trial_timer_started') {
        console.info('[HEYS.subscription] ✅ Trial timer started, ends:', result.trial_ends_at);
        // Обновляем кэш на trial
        setCachedStatus(STATUS.TRIAL);
      }

      return result;
    } catch (e) {
      console.error('[Subscription] activateTrialTimer error:', e);
      return { success: false, message: e.message };
    }
  }

  // === Хелперы для UI ===

  /**
   * Можно ли добавлять данные?
   * trial_pending разрешает запись (куратор уже одобрил)
   */
  function canWrite(status) {
    return status === STATUS.TRIAL || status === STATUS.ACTIVE || status === STATUS.TRIAL_PENDING;
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
    return status === STATUS.TRIAL || status === STATUS.ACTIVE || status === STATUS.TRIAL_PENDING;
  }

  /**
   * Получить UI-метаданные для статуса
   */
  function getStatusMeta(status) {
    switch (status) {
      case STATUS.TRIAL_PENDING:
        return {
          label: 'Триал одобрен',
          shortLabel: 'Одобрен',
          color: '#3b82f6', // blue
          emoji: '✅',
          canWrite: true,
        };
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

    /** @deprecated v5.0 — триал запускает куратор */
    const doStartTrial = useCallback(async () => {
      console.warn('[Subscription] useSubscription.startTrial() deprecated');
      return status;
    }, [status]);

    // Загружаем статус при монтировании
    useEffect(() => {
      refresh(false);
    }, [refresh]);

    const meta = useMemo(() => getStatusMeta(status), [status]);

    return {
      status,
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
    startTrial,            // @deprecated v5.0 — используй activateTrialTimer
    activateTrialTimer,    // v5.0: стартует 7-дневный таймер при первом логине
    clearCache,
    getCachedStatus,       // Для синхронной проверки в Paywall

    // Helpers
    canWrite,
    shouldShowPaywall,
    isActive,
    getStatusMeta,

    // React
    useSubscription,
  };

  // 🔇 v4.7.0: Лог загрузки отключён
})(typeof window !== 'undefined' ? window : globalThis);
