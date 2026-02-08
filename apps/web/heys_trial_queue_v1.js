// heys_trial_queue_v1.js — Умная очередь на триал + UI виджеты
// Упрощённая система: заявка → куратор проверяет → активирует триал
// v2.0.0 | 2025-01-09
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

  // ========================================
  // КОНСТАНТЫ
  // ========================================

  const QUEUE_STATUS = {
    NOT_IN_QUEUE: 'not_in_queue',  // Не в очереди
    PENDING: 'pending',            // Заявка отправлена, ждёт куратора
    ASSIGNED: 'assigned',          // Триал стартовал (куратор активировал)
    REJECTED: 'rejected',          // Куратор отклонил заявку
    CANCELED: 'canceled',          // Пользователь сам отменил
    // Legacy (для обратной совместимости)
    QUEUED: 'queued',              // → теперь pending
    OFFER: 'offer',                // → убран
    EXPIRED: 'expired',            // → теперь rejected
    CANCELED_BY_PURCHASE: 'canceled_by_purchase',
  };

  const CACHE_KEY = 'heys_trial_queue_status';
  const CAPACITY_CACHE_KEY = 'heys_trial_capacity';
  const CACHE_TTL_MS = 60 * 1000; // 1 минута для очереди
  const CAPACITY_CACHE_TTL_MS = 30 * 1000; // 30 секунд для capacity

  // ========================================
  // УТИЛИТЫ
  // ========================================

  const storeGet = (k, d) => {
    try {
      if (HEYS.store?.get) return HEYS.store.get(k, d);
      if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(k, d);
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (_) {
      return d;
    }
  };

  const storeSet = (k, v) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(k, v);
        return;
      }
      if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(k, v);
        return;
      }
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) { }
  };

  // Кэширование
  let _statusCache = null;
  let _statusCacheAt = 0;
  let _capacityCache = null;
  let _capacityCacheAt = 0;

  function getCachedStatus() {
    if (_statusCache && Date.now() - _statusCacheAt < CACHE_TTL_MS) {
      return _statusCache;
    }
    const stored = storeGet(CACHE_KEY, null);
    if (stored && stored.data && Date.now() - stored.ts < CACHE_TTL_MS) {
      _statusCache = stored.data;
      _statusCacheAt = stored.ts;
      return _statusCache;
    }
    return null;
  }

  function setCachedStatus(data) {
    _statusCache = data;
    _statusCacheAt = Date.now();
    storeSet(CACHE_KEY, { data, ts: _statusCacheAt });
  }

  function getCachedCapacity() {
    if (_capacityCache && Date.now() - _capacityCacheAt < CAPACITY_CACHE_TTL_MS) {
      return _capacityCache;
    }
    const stored = storeGet(CAPACITY_CACHE_KEY, null);
    if (stored && stored.data && Date.now() - stored.ts < CAPACITY_CACHE_TTL_MS) {
      _capacityCache = stored.data;
      _capacityCacheAt = stored.ts;
      return _capacityCache;
    }
    return null;
  }

  function setCachedCapacity(data) {
    _capacityCache = data;
    _capacityCacheAt = Date.now();
    storeSet(CAPACITY_CACHE_KEY, { data, ts: _capacityCacheAt });
  }

  function clearCache() {
    _statusCache = null;
    _statusCacheAt = 0;
    _capacityCache = null;
    _capacityCacheAt = 0;
    try {
      storeSet(CACHE_KEY, null);
      storeSet(CAPACITY_CACHE_KEY, null);
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CAPACITY_CACHE_KEY);
    } catch (_) { }
  }

  // ========================================
  // API ФУНКЦИИ
  // ========================================

  /**
   * Получить публичную capacity (без auth)
   * @param {boolean} forceRefresh
   * @returns {Promise<{available_slots, total_slots, queue_size, is_accepting, offer_window_minutes, trial_days}>}
   */
  async function getCapacity(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCachedCapacity();
      if (cached) return cached;
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      console.warn('[TrialQueue] API не готов');
      return getCachedCapacity() || {
        available_slots: 0,
        total_slots: 3,
        queue_size: 0,
        is_accepting: false,
        offer_window_minutes: 120,
        trial_days: 7
      };
    }

    try {
      const res = await api.rpc('get_public_trial_capacity', {});

      if (res.error) {
        throw new Error(res.error.message || 'Unknown error');
      }

      // API wraps response: {data: {get_public_trial_capacity: {...}}}
      const fnData = res.data?.get_public_trial_capacity || res.data || res;
      // 🔇 v4.7.0: DEBUG логи отключены
      setCachedCapacity(fnData);
      return fnData;
    } catch (e) {
      console.error('[TrialQueue] getCapacity error:', e);
      return getCachedCapacity() || {
        available_slots: 0,
        total_slots: 3,
        queue_size: 0,
        is_accepting: false,
        offer_window_minutes: 120,
        trial_days: 7
      };
    }
  }

  /**
   * Запросить триал (offer или очередь)
   * @param {string} source - источник ('app', 'landing', etc)
   * @returns {Promise<{success, status, position?, offer_expires_at?, message}>}
   */
  async function requestTrial(source = 'app') {
    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (!sessionToken) {
      return { success: false, error: 'no_session', message: 'Необходима авторизация' };
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      return { success: false, error: 'api_not_ready', message: 'API не готов' };
    }

    try {
      const res = await api.rpc('request_trial', {
        p_session_token: sessionToken,
        p_source: source
      });

      if (res.error) {
        return {
          success: false,
          error: res.error.code || 'unknown',
          message: res.error.message
        };
      }

      // v2.1: API wraps response in {request_trial: {...}}
      const data = res.data?.request_trial || res.data || res;
      // 🔇 v4.7.0: DEBUG логи отключены
      setCachedStatus(data);

      // Инвалидируем capacity cache
      _capacityCache = null;
      _capacityCacheAt = 0;

      return data;
    } catch (e) {
      console.error('[TrialQueue] requestTrial error:', e);
      return { success: false, error: 'request_failed', message: e.message };
    }
  }

  /**
   * Получить статус в очереди
   * @param {boolean} forceRefresh
   * @returns {Promise<{success, status, position?, offer_expires_at?, queue_size}>}
   */
  async function getQueueStatus(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCachedStatus();
      if (cached) return cached;
    }

    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (!sessionToken) {
      return { success: true, status: QUEUE_STATUS.NOT_IN_QUEUE };
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      return getCachedStatus() || { success: true, status: QUEUE_STATUS.NOT_IN_QUEUE };
    }

    try {
      const res = await api.rpc('get_trial_queue_status', {
        p_session_token: sessionToken
      });

      if (res.error) {
        if (res.error.message?.includes('invalid_session')) {
          return { success: true, status: QUEUE_STATUS.NOT_IN_QUEUE };
        }
        throw new Error(res.error.message);
      }

      // v2.1: API wraps response in {get_trial_queue_status: {...}}
      const data = res.data?.get_trial_queue_status || res.data || res;
      // 🔇 v4.7.0: DEBUG логи отключены
      setCachedStatus(data);
      return data;
    } catch (e) {
      console.error('[TrialQueue] getQueueStatus error:', e);
      return getCachedStatus() || { success: true, status: QUEUE_STATUS.NOT_IN_QUEUE };
    }
  }

  /**
   * @deprecated v2.0 — Триал теперь активирует куратор через admin_activate_trial
   * Оставлено для обратной совместимости
   */
  async function claimOffer() {
    console.warn('[TrialQueue] claimOffer() deprecated — триал активирует куратор');
    return {
      success: false,
      error: 'deprecated',
      message: 'Триал активирует куратор после проверки заявки'
    };
  }

  /**
   * Отменить запрос на триал
   * @returns {Promise<{success, message}>}
   */
  async function cancelQueue() {
    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (!sessionToken) {
      return { success: false, error: 'no_session', message: 'Необходима авторизация' };
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      return { success: false, error: 'api_not_ready', message: 'API не готов' };
    }

    try {
      const res = await api.rpc('cancel_trial_queue', {
        p_session_token: sessionToken
      });

      if (res.error) {
        return {
          success: false,
          error: res.error.code || 'unknown',
          message: res.error.message
        };
      }

      // Очищаем кэши
      clearCache();

      // v2.1: API wraps response in {cancel_trial_queue: {...}}
      const data = res.data?.cancel_trial_queue || res.data || res;
      // 🔇 v4.7.0: DEBUG логи отключены
      return data;
    } catch (e) {
      console.error('[TrialQueue] cancelQueue error:', e);
      return { success: false, error: 'cancel_failed', message: e.message };
    }
  }

  // ========================================
  // ХЕЛПЕРЫ
  // ========================================

  /**
   * Форматирование оставшегося времени
   */
  function formatTimeRemaining(expiresAt) {
    if (!expiresAt) return '';

    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires - now;

    if (diffMs <= 0) return 'Время истекло';

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours}ч ${mins}м`;
    }
    return `${mins}м`;
  }

  /**
   * @deprecated v2.0 — Offer механика убрана
   */
  function isOfferExpired(expiresAt) {
    if (!expiresAt) return true;
    return new Date(expiresAt) <= new Date();
  }

  /**
   * Получить UI-метаданные для статуса очереди
   * v2.0: Упрощённая система без offer
   */
  function getQueueStatusMeta(status, position, offerExpiresAt) {
    switch (status) {
      // Новый статус: заявка на рассмотрении
      case QUEUE_STATUS.PENDING:
      case QUEUE_STATUS.QUEUED: // Legacy → pending
        return {
          label: 'Заявка отправлена',
          shortLabel: 'Ожидание',
          color: '#f59e0b',
          emoji: '⏳',
          actionLabel: 'Отменить',
          showTimer: false,
          description: 'Куратор свяжется с вами для активации триала'
        };

      // Новый статус: куратор отклонил
      case QUEUE_STATUS.REJECTED:
      case QUEUE_STATUS.EXPIRED: // Legacy → rejected
        return {
          label: 'Заявка отклонена',
          shortLabel: 'Отклонено',
          color: '#ef4444',
          emoji: '❌',
          actionLabel: 'Запросить снова',
          showTimer: false,
          description: 'Куратор не смог подтвердить заявку'
        };

      // Legacy: offer → теперь трактуем как pending
      case QUEUE_STATUS.OFFER:
        return {
          label: 'Заявка отправлена',
          shortLabel: 'Ожидание',
          color: '#f59e0b',
          emoji: '⏳',
          actionLabel: 'Отменить',
          showTimer: false,
          description: 'Куратор свяжется с вами для активации триала'
        };

      case QUEUE_STATUS.ASSIGNED:
        return {
          label: 'Триал активен',
          shortLabel: 'Активен',
          color: '#22c55e',
          emoji: '✅',
          actionLabel: null,
          showTimer: false,
          description: 'Куратор назначен, триал идёт'
        };

      case QUEUE_STATUS.CANCELED:
      case QUEUE_STATUS.CANCELED_BY_PURCHASE:
        return {
          label: status === QUEUE_STATUS.CANCELED_BY_PURCHASE
            ? 'Подписка оформлена'
            : 'Запрос отменён',
          shortLabel: status === QUEUE_STATUS.CANCELED_BY_PURCHASE ? 'Оплачено' : 'Отменён',
          color: status === QUEUE_STATUS.CANCELED_BY_PURCHASE ? '#22c55e' : '#6b7280',
          emoji: status === QUEUE_STATUS.CANCELED_BY_PURCHASE ? '💳' : '❌',
          actionLabel: status === QUEUE_STATUS.CANCELED_BY_PURCHASE ? null : 'Запросить снова',
          showTimer: false,
        };

      case QUEUE_STATUS.NOT_IN_QUEUE:
      default:
        return {
          label: 'Не в очереди',
          shortLabel: '',
          color: '#6b7280',
          emoji: '',
          actionLabel: 'Начать триал',
          showTimer: false,
        };
    }
  }

  /**
   * Получить UI-метаданные для capacity виджета
   * v2.1: Адаптирован под упрощённый API (is_accepting + queue_length)
   */
  function getCapacityMeta(capacity) {
    // API v2 возвращает: { is_accepting, queue_length }
    // Для обратной совместимости поддерживаем оба формата
    const is_accepting = capacity.is_accepting;
    const queue_length = capacity.queue_length ?? capacity.queue_size ?? 0;
    const available_slots = capacity.available_slots; // может быть undefined в v2
    const total_slots = capacity.total_slots; // может быть undefined в v2

    if (!is_accepting) {
      return {
        status: 'paused',
        color: '#6b7280',
        emoji: '⏸️',
        label: 'Приём на паузе',
        sublabel: 'Скоро откроется',
        actionLabel: 'Купить без ожидания',
        showQueue: false,
      };
    }

    // v2: Если is_accepting=true — места есть (упрощённая логика)
    // v1: Проверяем available_slots если есть
    if (is_accepting && (available_slots === undefined || available_slots > 0)) {
      const label = available_slots !== undefined
        ? `Свободно ${available_slots} из ${total_slots}`
        : 'Приём открыт';
      return {
        status: 'available',
        color: '#22c55e',
        emoji: '🟢',
        label: label,
        sublabel: 'Место доступно прямо сейчас!',
        actionLabel: 'Начать триал',
        showQueue: false,
      };
    }

    return {
      status: 'full',
      color: '#ef4444',
      emoji: '🔴',
      label: 'Мест нет',
      sublabel: queue_length > 0 ? `В очереди: ${queue_length}` : 'Очередь пуста',
      actionLabel: 'Встать в очередь',
      showQueue: true,
      queueSize: queue_length,
    };
  }

  // ========================================
  // REACT КОМПОНЕНТЫ
  // ========================================

  /**
   * TrialCapacityWidget — виджет мест на лендинге/в app
   */
  function TrialCapacityWidget({
    onRequestTrial,
    onBuyNow,
    className = '',
    compact = false
  }) {
    if (!React) return null;

    const { useState, useEffect, useCallback } = React;

    const [capacity, setCapacity] = useState(getCachedCapacity());
    const [isLoading, setIsLoading] = useState(!capacity);

    const refresh = useCallback(async () => {
      setIsLoading(true);
      try {
        const data = await getCapacity(true);
        setCapacity(data);
      } finally {
        setIsLoading(false);
      }
    }, []);

    useEffect(() => {
      refresh();
      // Обновляем каждые 30 секунд
      const interval = setInterval(refresh, 30000);
      return () => clearInterval(interval);
    }, [refresh]);

    if (!capacity && isLoading) {
      return React.createElement('div', {
        className: `trial-capacity-widget loading ${className}`
      }, '⏳ Загрузка...');
    }

    const meta = getCapacityMeta(capacity || {});

    if (compact) {
      // Компактная версия для мобильных
      return React.createElement('div', {
        className: `trial-capacity-widget compact ${className}`,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--bg-secondary, #f3f4f6)',
          borderRadius: '8px',
          fontSize: '14px'
        }
      },
        React.createElement('span', { style: { fontSize: '16px' } }, meta.emoji),
        React.createElement('span', { style: { fontWeight: 500 } }, meta.label),
        isLoading && React.createElement('span', {
          style: { opacity: 0.5, fontSize: '12px' }
        }, '...')
      );
    }

    // Полная версия
    return React.createElement('div', {
      className: `trial-capacity-widget full ${className}`,
      style: {
        background: 'var(--bg-secondary, #f3f4f6)',
        borderRadius: '12px',
        padding: '16px',
        textAlign: 'center'
      }
    },
      // Статус
      React.createElement('div', {
        style: {
          fontSize: '24px',
          marginBottom: '8px'
        }
      }, meta.emoji),

      React.createElement('div', {
        style: {
          fontWeight: 600,
          fontSize: '16px',
          color: meta.color,
          marginBottom: '4px'
        }
      }, meta.label),

      React.createElement('div', {
        style: {
          fontSize: '13px',
          color: 'var(--text-secondary, #6b7280)',
          marginBottom: '12px'
        }
      }, meta.sublabel),

      // Кнопки
      React.createElement('div', {
        style: {
          display: 'flex',
          gap: '8px',
          justifyContent: 'center'
        }
      },
        // Основная CTA
        React.createElement('button', {
          onClick: onRequestTrial,
          disabled: isLoading,
          style: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: meta.status === 'available'
              ? 'linear-gradient(135deg, #22c55e, #16a34a)'
              : 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '14px'
          }
        }, meta.actionLabel),

        // Альтернатива
        onBuyNow && React.createElement('button', {
          onClick: onBuyNow,
          style: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: '2px solid var(--border-color, #e5e7eb)',
            background: 'transparent',
            color: 'var(--text-primary, #1f2937)',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '14px'
          }
        }, 'Купить сразу')
      )
    );
  }

  /**
   * QueueStatusCard — карточка статуса в очереди
   */
  function QueueStatusCard({
    onClaimOffer,
    onCancelQueue,
    onRequestAgain,
    onBuyNow,
    className = ''
  }) {
    if (!React) return null;

    const { useState, useEffect, useCallback } = React;

    const [queueStatus, setQueueStatus] = useState(getCachedStatus());
    const [isLoading, setIsLoading] = useState(!queueStatus);
    const [isActioning, setIsActioning] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState('');

    const refresh = useCallback(async () => {
      setIsLoading(true);
      try {
        const data = await getQueueStatus(true);
        setQueueStatus(data);
      } finally {
        setIsLoading(false);
      }
    }, []);

    // Таймер для offer (депрекейтед, оставлен для обратной совместимости)
    useEffect(() => {
      setTimeRemaining('');
    }, [queueStatus?.status]);

    useEffect(() => {
      refresh();
      // Обновляем каждую минуту
      const interval = setInterval(refresh, 60000);
      return () => clearInterval(interval);
    }, [refresh]);

    const handleClaim = async () => {
      setIsActioning(true);
      try {
        const result = await claimOffer();
        if (result.success) {
          onClaimOffer?.(result);
          refresh();
        } else {
          alert(result.message || 'Ошибка подтверждения');
          refresh();
        }
      } finally {
        setIsActioning(false);
      }
    };

    const handleCancel = async () => {
      if (!confirm('Отменить запрос на триал?')) return;

      setIsActioning(true);
      try {
        const result = await cancelQueue();
        if (result.success) {
          onCancelQueue?.(result);
          refresh();
        }
      } finally {
        setIsActioning(false);
      }
    };

    const handleRequestAgain = async () => {
      setIsActioning(true);
      try {
        const result = await requestTrial('app');
        if (result.success) {
          onRequestAgain?.(result);
          refresh();
        } else {
          alert(result.message || 'Ошибка запроса');
        }
      } finally {
        setIsActioning(false);
      }
    };

    if (!queueStatus && isLoading) {
      return React.createElement('div', {
        className: `queue-status-card loading ${className}`
      }, '⏳ Загрузка...');
    }

    const status = queueStatus?.status || QUEUE_STATUS.NOT_IN_QUEUE;
    const meta = getQueueStatusMeta(
      status,
      queueStatus?.position,
      queueStatus?.offer_expires_at
    );

    // Если не в очереди — не показываем карточку
    if (status === QUEUE_STATUS.NOT_IN_QUEUE) {
      return null;
    }

    return React.createElement('div', {
      className: `queue-status-card ${className}`,
      style: {
        background: 'var(--bg-secondary, #f3f4f6)',
        borderRadius: '12px',
        padding: '16px',
        border: status === QUEUE_STATUS.OFFER
          ? `2px solid ${meta.color}`
          : '1px solid var(--border-color, #e5e7eb)'
      }
    },
      // Заголовок
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px'
        }
      },
        React.createElement('span', { style: { fontSize: '20px' } }, meta.emoji),
        React.createElement('span', {
          style: {
            fontWeight: 600,
            fontSize: '16px',
            color: meta.color
          }
        }, meta.label)
      ),

      // Таймер (для offer)
      meta.showTimer && timeRemaining && React.createElement('div', {
        style: {
          background: 'rgba(245, 158, 11, 0.1)',
          borderRadius: '8px',
          padding: '12px',
          textAlign: 'center',
          marginBottom: '12px'
        }
      },
        React.createElement('div', {
          style: { fontSize: '12px', color: '#92400e', marginBottom: '4px' }
        }, 'Осталось времени:'),
        React.createElement('div', {
          style: { fontSize: '24px', fontWeight: 700, color: '#f59e0b' }
        }, timeRemaining)
      ),

      // Действия
      React.createElement('div', {
        style: { display: 'flex', gap: '8px', flexDirection: 'column' }
      },
        // Запросить снова (для rejected/canceled)
        (status === QUEUE_STATUS.REJECTED || status === QUEUE_STATUS.EXPIRED || status === QUEUE_STATUS.CANCELED) &&
        React.createElement('button', {
          onClick: handleRequestAgain,
          disabled: isActioning,
          style: {
            padding: '12px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '15px'
          }
        }, isActioning ? '⏳...' : 'Запросить снова'),

        // Отмена (для pending)
        (status === QUEUE_STATUS.PENDING || status === QUEUE_STATUS.QUEUED) &&
        React.createElement('button', {
          onClick: handleCancel,
          disabled: isActioning,
          style: {
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #e5e7eb)',
            background: 'transparent',
            color: 'var(--text-secondary, #6b7280)',
            cursor: 'pointer',
            fontSize: '13px'
          }
        }, 'Отменить'),

        // Альтернатива — купить
        onBuyNow && React.createElement('button', {
          onClick: onBuyNow,
          style: {
            padding: '10px',
            borderRadius: '8px',
            border: '2px solid var(--border-color, #e5e7eb)',
            background: 'transparent',
            color: 'var(--text-primary, #1f2937)',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '14px',
            marginTop: '4px'
          }
        }, '💳 Купить без ожидания')
      )
    );
  }

  // ========================================
  // REACT HOOK
  // ========================================

  /**
   * useTrialQueue() — hook для работы с очередью
   */
  function useTrialQueue() {
    if (!React) {
      console.warn('[TrialQueue] React не доступен');
      return {
        capacity: null,
        queueStatus: null,
        isLoading: false,
        requestTrial: async () => ({ success: false }),
        claimOffer: async () => ({ success: false }),
        cancelQueue: async () => ({ success: false }),
        refreshCapacity: async () => { },
        refreshStatus: async () => { },
      };
    }

    const { useState, useCallback, useEffect } = React;

    const [capacity, setCapacity] = useState(getCachedCapacity());
    const [queueStatus, setQueueStatus] = useState(getCachedStatus());
    const [isLoading, setIsLoading] = useState(false);

    const refreshCapacity = useCallback(async () => {
      const data = await getCapacity(true);
      setCapacity(data);
      return data;
    }, []);

    const refreshStatus = useCallback(async () => {
      const data = await getQueueStatus(true);
      setQueueStatus(data);
      return data;
    }, []);

    const doRequestTrial = useCallback(async (source = 'app') => {
      setIsLoading(true);
      try {
        const result = await requestTrial(source);
        if (result.success) {
          setQueueStatus(result);
          await refreshCapacity();
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    }, [refreshCapacity]);

    const doClaimOffer = useCallback(async () => {
      setIsLoading(true);
      try {
        const result = await claimOffer();
        if (result.success) {
          await refreshStatus();
          await refreshCapacity();
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    }, [refreshStatus, refreshCapacity]);

    const doCancelQueue = useCallback(async () => {
      setIsLoading(true);
      try {
        const result = await cancelQueue();
        if (result.success) {
          await refreshStatus();
          await refreshCapacity();
        }
        return result;
      } finally {
        setIsLoading(false);
      }
    }, [refreshStatus, refreshCapacity]);

    // Начальная загрузка
    useEffect(() => {
      refreshCapacity();
      refreshStatus();
    }, [refreshCapacity, refreshStatus]);

    return {
      capacity,
      queueStatus,
      isLoading,

      // Действия
      requestTrial: doRequestTrial,
      claimOffer: doClaimOffer,  // @deprecated v5.0
      cancelQueue: doCancelQueue,

      // Обновление
      refreshCapacity,
      refreshStatus,

      // Хелперы
      isPending: queueStatus?.status === QUEUE_STATUS.PENDING ||
        queueStatus?.status === QUEUE_STATUS.QUEUED,
      isAssigned: queueStatus?.status === QUEUE_STATUS.ASSIGNED,
      position: queueStatus?.position,
      capacityMeta: capacity ? getCapacityMeta(capacity) : null,
      queueMeta: queueStatus ? getQueueStatusMeta(
        queueStatus.status,
        queueStatus.position,
        queueStatus.offer_expires_at
      ) : null,
    };
  }

  // ========================================
  // СТИЛИ
  // ========================================

  const TRIAL_QUEUE_STYLES = `
    .trial-capacity-widget {
      transition: opacity 0.2s;
    }
    .trial-capacity-widget.loading {
      opacity: 0.7;
    }
    .trial-capacity-widget button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .queue-status-card {
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .queue-status-card button:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .queue-status-card button:active:not(:disabled) {
      transform: translateY(0);
    }
  `;

  // Инжектим стили
  if (typeof document !== 'undefined') {
    const styleId = 'heys-trial-queue-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = TRIAL_QUEUE_STYLES;
      document.head.appendChild(style);
    }
  }

  // ========================================
  // ADMIN API (только для кураторов)
  // ========================================

  const adminAPI = {
    /**
     * Получить полный список очереди
     * @returns {Promise<{success, data: Array, total_count}>}
     */
    async getQueueList() {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      const curatorSession = localStorage.getItem('heys_curator_session');
      if (!curatorSession) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        const res = await api.rpc('admin_get_trial_queue_list', {
          p_curator_session_token: curatorSession
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        // API возвращает обёрткой {admin_get_trial_queue_list: {items, total, ...}}
        const fnData = res.data?.admin_get_trial_queue_list || res.data || res;
        const items = Array.isArray(fnData) ? fnData : (fnData.items || []);
        const total = fnData.total ?? items.length;

        return { success: true, data: items, total_count: total };
      } catch (e) {
        console.error('[TrialQueue.admin] getQueueList error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Добавить клиента в очередь
     * @param {string} clientId - UUID клиента
     * @param {string} source - источник ('admin', 'landing', etc)
     * @param {number} priority - приоритет (1-10, 10 = высший)
     */
    async addToQueue(clientId, source = 'admin', priority = 5) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      const curatorSession = localStorage.getItem('heys_curator_session');
      if (!curatorSession) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        const res = await api.rpc('admin_add_to_queue', {
          p_client_id: clientId,
          p_source: source,
          p_priority: priority,
          p_curator_session_token: curatorSession
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_add_to_queue || res.data || res;
        return fnData;
      } catch (e) {
        console.error('[TrialQueue.admin] addToQueue error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Удалить клиента из очереди
     * @param {string} clientId - UUID клиента
     * @param {string} reason - причина удаления
     */
    async removeFromQueue(clientId, reason = 'admin_removed') {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_remove_from_queue', {
          p_client_id: clientId,
          p_reason: reason
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_remove_from_queue || res.data || res;
        return fnData;
      } catch (e) {
        console.error('[TrialQueue.admin] removeFromQueue error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * @deprecated v2.0 — автоматические offer'ы убраны, используй activateTrial()
     * Отправить offer клиенту (пропустить очередь)
     */
    async sendOffer(clientId, windowMinutes = 120) {
      console.warn('[TrialQueue.admin] sendOffer() deprecated — use activateTrial()');
      return { success: false, error: 'deprecated', message: 'Используйте activateTrial() вместо sendOffer()' };
    },

    /**
     * Активировать триал для клиента с выбором даты старта (v3.0)
     * @param {string} clientId - UUID клиента
     * @param {string} [startDate] - Дата старта (YYYY-MM-DD). По умолчанию — сегодня.
     * @returns {Promise<{success: boolean, status?: string, trial_ends_at?: string, error?: string}>}
     */
    async activateTrial(clientId, startDate) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      const curatorSession = localStorage.getItem('heys_curator_session');
      if (!curatorSession) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        const params = {
          p_client_id: clientId,
          p_curator_session_token: curatorSession
        };
        if (startDate) {
          params.p_start_date = startDate;
        }

        const res = await api.rpc('admin_activate_trial', params);

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_activate_trial || res.data || res;
        return fnData;
      } catch (e) {
        console.error('[TrialQueue.admin] activateTrial error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Отклонить заявку на триал
     * @param {string} clientId - UUID клиента
     * @param {string} reason - причина отклонения
     * @returns {Promise<{success: boolean, status?: string, error?: string}>}
     */
    async rejectApplication(clientId, reason = '') {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      const curatorSession = localStorage.getItem('heys_curator_session');
      if (!curatorSession) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        const res = await api.rpc('admin_reject_request', {
          p_client_id: clientId,
          p_reason: reason,
          p_curator_session_token: curatorSession
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_reject_request || res.data || res;
        return fnData;
      } catch (e) {
        console.error('[TrialQueue.admin] rejectApplication error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Получить статистику очереди
     */
    async getStats() {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_get_queue_stats', {});

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        // API оборачивает ответ в ключ с именем функции: { admin_get_queue_stats: {...} }
        const fnData = res.data?.admin_get_queue_stats || res.data || res;
        return { success: true, ...fnData };
      } catch (e) {
        console.error('[TrialQueue.admin] getStats error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Обновить настройки очереди
     * @param {Object} settings - {is_accepting, max_concurrent_trials, offer_window_minutes}
     */
    async updateSettings(settings) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_update_queue_settings', {
          p_is_accepting: (settings.is_accepting_trials ?? settings.is_accepting) ?? null,
          p_max_active: (settings.max_active_trials ?? settings.max_concurrent_trials) ?? null,
          p_offer_window_minutes: settings.offer_window_minutes ?? null
        });

        // 🔇 v4.7.0: DEBUG логи отключены

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        // API возвращает {data: {admin_update_queue_settings: {success, settings}}, error: null}
        const result = res.data?.admin_update_queue_settings || res.admin_update_queue_settings || res;
        return result;
      } catch (e) {
        console.error('[TrialQueue.admin] updateSettings error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Получить лиды с лендинга (v3.0)
     * @param {string} [status='new'] - Фильтр: 'new', 'converted', 'rejected', 'all'
     * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
     */
    async getLeads(status = 'new') {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_get_leads', { p_status: status });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const data = res.data?.admin_get_leads || res.data || [];
        return { success: true, data: Array.isArray(data) ? data : [] };
      } catch (e) {
        console.error('[TrialQueue.admin] getLeads error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Сконвертировать лид в клиента (v3.0)
     * Создаёт клиента, ставит PIN, добавляет в очередь
     * @param {number} leadId - ID лида
     * @param {string} pin - PIN-код для клиента (4-6 цифр)
     * @param {string} [curatorId] - UUID куратора
     * @returns {Promise<{success: boolean, client_id?: string, error?: string}>}
     */
    async convertLead(leadId, pin, curatorId) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const params = {
          p_lead_id: leadId,
          p_pin: pin
        };
        if (curatorId) {
          params.p_curator_id = curatorId;
        }

        const res = await api.rpc('admin_convert_lead', params);

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_convert_lead || res.data || res;
        return fnData;
      } catch (e) {
        console.error('[TrialQueue.admin] convertLead error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    }
  };

  // ========================================
  // ADMIN UI КОМПОНЕНТ
  // ========================================

  /**
   * TrialQueueAdmin — UI для управления очередью
   * @param {Object} props - { onClose }
   */
  function TrialQueueAdmin({ onClose }) {
    const [queue, setQueue] = React.useState([]);
    const [stats, setStats] = React.useState(null);
    const [leads, setLeads] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [actionLoading, setActionLoading] = React.useState(null);
    // Диалог активации триала (v3.0: с выбором даты)
    const [trialDialog, setTrialDialog] = React.useState(null); // { clientId, clientName }
    const [trialStartDate, setTrialStartDate] = React.useState('');
    // Диалог конвертации лида (v3.0)
    const [convertDialog, setConvertDialog] = React.useState(null); // { leadId, leadName, leadPhone }
    const [convertPin, setConvertPin] = React.useState('');

    // Загрузка данных
    const loadData = React.useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const [queueRes, statsRes, leadsRes] = await Promise.all([
          adminAPI.getQueueList(),
          adminAPI.getStats(),
          adminAPI.getLeads('new')
        ]);

        if (queueRes.success) {
          // Защита: data должен быть массивом
          const queueData = Array.isArray(queueRes.data) ? queueRes.data : [];
          setQueue(queueData);
        } else {
          setError(queueRes.message || 'Ошибка загрузки очереди');
        }

        if (statsRes.success) {
          setStats(statsRes);
        }

        if (leadsRes.success) {
          setLeads(leadsRes.data || []);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, []);

    React.useEffect(() => {
      loadData();
    }, [loadData]);

    // Группировка по статусам (v2.0: pending/rejected вместо offer/queued)
    const grouped = React.useMemo(() => {
      const result = {
        assigned: [],   // Активные триалы
        pending: [],    // Заявки на рассмотрении
        rejected: [],   // Отклонённые заявки
        other: []       // Остальные (canceled)
      };
      queue.forEach(item => {
        // Маппинг legacy статусов
        if (item.status === 'assigned') {
          result.assigned.push(item);
        } else if (item.status === 'pending' || item.status === 'queued' || item.status === 'offer') {
          result.pending.push(item);
        } else if (item.status === 'rejected' || item.status === 'expired') {
          result.rejected.push(item);
        } else {
          result.other.push(item);
        }
      });
      return result;
    }, [queue]);

    // Действия
    const handleRemove = async (clientId, clientName) => {
      if (!confirm(`Удалить "${clientName}" из очереди?`)) return;

      setActionLoading(clientId);
      const res = await adminAPI.removeFromQueue(clientId, 'admin_removed');
      setActionLoading(null);

      if (res.success) {
        loadData();
      } else {
        alert('Ошибка: ' + (res.message || 'Не удалось удалить'));
      }
    };

    // Открыть диалог активации триала с выбором даты (v3.0)
    const handleActivateTrial = async (clientId, clientName) => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      setTrialStartDate(today);
      setTrialDialog({ clientId, clientName });
    };

    // Подтвердить активацию триала
    const confirmActivateTrial = async () => {
      if (!trialDialog) return;
      const { clientId, clientName } = trialDialog;

      setActionLoading(clientId);
      setTrialDialog(null);

      const res = await adminAPI.activateTrial(clientId, trialStartDate || undefined);
      setActionLoading(null);

      if (res.success) {
        loadData();
        const isToday = !trialStartDate || trialStartDate === new Date().toISOString().split('T')[0];
        if (isToday) {
          alert('✅ Триал активирован! Клиент получил доступ на 7 дней.');
        } else {
          alert(`✅ Триал запланирован! Начнётся ${trialStartDate}, доступ на 7 дней.`);
        }
      } else {
        alert('Ошибка: ' + (res.message || 'Не удалось активировать триал'));
      }
    };

    // Конвертировать лид в клиента (v3.0)
    const handleConvertLead = (lead) => {
      setConvertPin('');
      setConvertDialog({ leadId: lead.id, leadName: lead.name, leadPhone: lead.phone });
    };

    const confirmConvertLead = async () => {
      if (!convertDialog || !convertPin) return;

      if (convertPin.length < 4) {
        alert('PIN должен быть минимум 4 цифры');
        return;
      }

      setActionLoading('lead-' + convertDialog.leadId);
      setConvertDialog(null);

      const res = await adminAPI.convertLead(convertDialog.leadId, convertPin);
      setActionLoading(null);

      if (res.success) {
        loadData();
        if (res.already_existed) {
          alert(`ℹ️ Клиент с этим телефоном уже существует. Лид помечен как сконвертированный.`);
        } else {
          alert(`✅ Клиент "${convertDialog.leadName}" создан! PIN: ${convertPin}`);
        }
      } else {
        alert('Ошибка: ' + (res.message || 'Не удалось создать клиента'));
      }
    };

    // Отклонить заявку (v2.0)
    const handleReject = async (clientId, clientName) => {
      const reason = prompt(`Отклонить заявку "${clientName}"?\nУкажите причину (опционально):`, '');
      if (reason === null) return; // Отмена

      setActionLoading(clientId);
      const res = await adminAPI.rejectApplication(clientId, reason || 'rejected_by_curator');
      setActionLoading(null);

      if (res.success) {
        loadData();
      } else {
        alert('Ошибка: ' + (res.message || 'Не удалось отклонить заявку'));
      }
    };

    const [toggleLoading, setToggleLoading] = React.useState(false);

    const handleToggleAccepting = async () => {
      if (!stats || toggleLoading) return;

      setToggleLoading(true);
      const newValue = !stats.limits?.is_accepting_trials;
      const res = await adminAPI.updateSettings({ is_accepting_trials: newValue });
      setToggleLoading(false);

      if (res.success) {
        setStats(prev => ({
          ...prev,
          limits: { ...prev.limits, is_accepting_trials: newValue }
        }));
      } else {
        alert('Ошибка: ' + (res.message || 'Не удалось обновить настройки'));
      }
    };

    // Форматирование даты
    const formatDate = (dateStr) => {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    // Время до истечения offer
    const getOfferTimeLeft = (expiresAt) => {
      if (!expiresAt) return null;
      const now = Date.now();
      const exp = new Date(expiresAt).getTime();
      const diff = exp - now;
      if (diff <= 0) return 'Истёк';
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins} мин`;
      const hours = Math.floor(mins / 60);
      return `${hours}ч ${mins % 60}м`;
    };

    // Свободные слоты
    const freeSlots = stats ? Math.max(0, (stats.limits?.max_active_trials || 3) - (grouped.assigned?.length || 0)) : 0;
    const isAccepting = stats?.limits?.is_accepting_trials ?? false;

    // Карточка клиента
    const ClientCard = ({ item, showPosition, showActions, showOfferTimer }) => {
      return React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 14px',
          background: 'var(--card, #fff)',
          borderRadius: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          transition: 'box-shadow 0.2s'
        }
      },
        // Позиция (если показываем)
        showPosition && React.createElement('div', {
          style: {
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '14px',
            flexShrink: 0
          }
        }, item.queue_position || '?'),

        // Аватар (если без позиции)
        !showPosition && React.createElement('div', {
          style: {
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: item.status === 'assigned' ? '#dcfce7' : '#fef3c7',
            color: item.status === 'assigned' ? '#16a34a' : '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            flexShrink: 0
          }
        }, item.status === 'assigned' ? '✓' : '⏳'),

        // Инфо
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', {
            style: {
              fontWeight: 600,
              fontSize: '14px',
              color: 'var(--text, #1f2937)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }
          }, item.client_name || item.name || 'Без имени'),
          React.createElement('div', {
            style: {
              fontSize: '12px',
              color: '#6b7280',
              marginTop: '2px'
            }
          }, item.client_phone || item.phone_normalized || '—')
        ),

        // Таймер offer
        showOfferTimer && item.offer_expires_at && React.createElement('div', {
          style: {
            padding: '4px 10px',
            background: '#fef3c7',
            color: '#92400e',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }
        }, '⏱ ' + getOfferTimeLeft(item.offer_expires_at)),

        // Дата начала (для активных)
        item.status === 'assigned' && item.assigned_at && React.createElement('div', {
          style: {
            fontSize: '11px',
            color: '#6b7280',
            textAlign: 'right'
          }
        },
          React.createElement('div', null, 'Начало:'),
          React.createElement('div', { style: { fontWeight: 500 } }, formatDate(item.assigned_at))
        ),

        // Действия (v2.0: Активировать + Отклонить)
        showActions && React.createElement('div', {
          style: { display: 'flex', gap: '6px', flexShrink: 0 }
        },
          // Кнопка "Активировать триал" (для pending заявок)
          (item.status === 'pending' || item.status === 'queued' || item.status === 'offer') && React.createElement('button', {
            onClick: () => handleActivateTrial(item.client_id, item.client_name || item.name),
            disabled: actionLoading === item.client_id,
            title: 'Активировать триал',
            style: {
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff',
              cursor: actionLoading === item.client_id ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              opacity: actionLoading === item.client_id ? 0.7 : 1
            }
          }, actionLoading === item.client_id ? '⏳' : '✅ Активировать'),

          // Кнопка "Отклонить" (для pending заявок)
          (item.status === 'pending' || item.status === 'queued' || item.status === 'offer') && React.createElement('button', {
            onClick: () => handleReject(item.client_id, item.client_name || item.name),
            disabled: actionLoading === item.client_id,
            title: 'Отклонить заявку',
            style: {
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              background: 'var(--card, #fff)',
              color: '#dc2626',
              cursor: actionLoading === item.client_id ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: actionLoading === item.client_id ? 0.7 : 1
            }
          }, '❌')
        )
      );
    };

    // Секция с заголовком
    const Section = ({ title, icon, count, color, children, emptyText }) => {
      return React.createElement('div', {
        style: {
          marginBottom: '20px',
          background: '#f9fafb',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid #e5e7eb'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: count > 0 ? '12px' : 0,
            paddingBottom: count > 0 ? '12px' : 0,
            borderBottom: count > 0 ? '1px solid #e5e7eb' : 'none'
          }
        },
          React.createElement('span', { style: { fontSize: '18px' } }, icon),
          React.createElement('span', {
            style: {
              fontWeight: 600,
              fontSize: '15px',
              color: 'var(--text, #374151)'
            }
          }, title),
          React.createElement('span', {
            style: {
              marginLeft: 'auto',
              padding: '2px 10px',
              background: color,
              color: '#fff',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600
            }
          }, count)
        ),
        count === 0 && React.createElement('div', {
          style: {
            color: '#9ca3af',
            fontSize: '13px',
            textAlign: 'center',
            padding: '8px'
          }
        }, emptyText),
        count > 0 && React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '8px' }
        }, children)
      );
    };

    // ========================================
    // РЕНДЕР
    // ========================================
    return React.createElement('div', {
      style: {
        padding: '20px',
        maxHeight: '75vh',
        overflowY: 'auto',
        background: 'var(--card, #fff)'
      }
    },
      // ========== HEADER: Статус очереди ==========
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          padding: '16px 20px',
          background: isAccepting
            ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)'
            : 'linear-gradient(135deg, #fee2e2, #fecaca)',
          borderRadius: '16px',
          border: isAccepting ? '2px solid #86efac' : '2px solid #fca5a5'
        }
      },
        React.createElement('div', null,
          React.createElement('div', {
            style: {
              fontSize: '13px',
              color: isAccepting ? '#166534' : '#991b1b',
              fontWeight: 500,
              marginBottom: '4px'
            }
          }, 'СТАТУС ОЧЕРЕДИ'),
          React.createElement('div', {
            style: {
              fontSize: '22px',
              fontWeight: 700,
              color: isAccepting ? '#15803d' : '#b91c1c',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }
          },
            isAccepting ? '🟢 Открыта' : '🔴 Закрыта',
            toggleLoading && React.createElement('span', {
              style: { fontSize: '14px', opacity: 0.7 }
            }, '⏳')
          )
        ),
        // Toggle Switch
        React.createElement('button', {
          onClick: handleToggleAccepting,
          disabled: toggleLoading || !stats,
          style: {
            position: 'relative',
            width: '64px',
            height: '34px',
            borderRadius: '17px',
            border: 'none',
            background: isAccepting ? '#22c55e' : '#d1d5db',
            cursor: toggleLoading ? 'not-allowed' : 'pointer',
            transition: 'background 0.3s',
            opacity: toggleLoading ? 0.7 : 1
          }
        },
          React.createElement('div', {
            style: {
              position: 'absolute',
              top: '3px',
              left: isAccepting ? '33px' : '3px',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'var(--card, #fff)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transition: 'left 0.3s'
            }
          })
        )
      ),

      // ========== STATS CARDS ==========
      React.createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '24px'
        }
      },
        // Активных триалов
        React.createElement('div', {
          style: {
            padding: '16px',
            background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
            borderRadius: '12px',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: { fontSize: '28px', fontWeight: 700, color: '#1d4ed8' }
          }, grouped.assigned.length),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#3b82f6', fontWeight: 500, marginTop: '4px' }
          }, 'АКТИВНЫХ')
        ),

        // Свободных слотов
        React.createElement('div', {
          style: {
            padding: '16px',
            background: freeSlots > 0
              ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)'
              : 'linear-gradient(135deg, #fef3c7, #fde68a)',
            borderRadius: '12px',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: '28px',
              fontWeight: 700,
              color: freeSlots > 0 ? '#15803d' : '#b45309'
            }
          }, freeSlots),
          React.createElement('div', {
            style: {
              fontSize: '12px',
              color: freeSlots > 0 ? '#16a34a' : '#d97706',
              fontWeight: 500,
              marginTop: '4px'
            }
          }, 'СВОБОДНО')
        ),

        // Заявки (pending)
        React.createElement('div', {
          style: {
            padding: '16px',
            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
            borderRadius: '12px',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: { fontSize: '28px', fontWeight: 700, color: '#b45309' }
          }, grouped.pending.length),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#d97706', fontWeight: 500, marginTop: '4px' }
          }, 'ЗАЯВКИ')
        ),

        // Отклонённые
        React.createElement('div', {
          style: {
            padding: '16px',
            background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
            borderRadius: '12px',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: { fontSize: '28px', fontWeight: 700, color: '#dc2626' }
          }, grouped.rejected.length),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#ef4444', fontWeight: 500, marginTop: '4px' }
          }, 'ОТКЛОНЕНО')
        )
      ),

      // ========== REFRESH BUTTON ==========
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '16px'
        }
      },
        React.createElement('button', {
          onClick: loadData,
          disabled: loading,
          style: {
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            background: 'var(--card, #fff)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text, #374151)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }
        }, loading ? '⏳ Загрузка...' : '🔄 Обновить')
      ),

      // ========== ERROR ==========
      error && React.createElement('div', {
        style: {
          padding: '16px',
          background: '#fee2e2',
          color: '#dc2626',
          borderRadius: '12px',
          marginBottom: '16px',
          fontWeight: 500
        }
      }, '❌ ' + error),

      // ========== LOADING ==========
      loading && React.createElement('div', {
        style: {
          padding: '48px',
          textAlign: 'center',
          color: '#6b7280'
        }
      },
        React.createElement('div', {
          style: { fontSize: '32px', marginBottom: '8px' }
        }, '⏳'),
        'Загрузка данных...'
      ),

      // ========== CONTENT ==========
      !loading && React.createElement(React.Fragment, null,
        // Секция: Лиды с лендинга (v3.0)
        Section({
          title: 'Лиды с сайта',
          icon: '🌐',
          count: leads.length,
          color: '#8b5cf6',
          emptyText: 'Нет новых заявок с лендинга',
          children: leads.map((lead, idx) =>
            React.createElement('div', {
              key: lead.id || idx,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: 'var(--card, #fff)',
                borderRadius: '10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }
            },
              // Иконка
              React.createElement('div', {
                style: {
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: '#f3e8ff',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  flexShrink: 0
                }
              }, '🌐'),
              // Инфо
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', {
                  style: {
                    fontWeight: 600,
                    fontSize: '14px',
                    color: 'var(--text, #1f2937)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }
                }, lead.name || 'Без имени'),
                React.createElement('div', {
                  style: { fontSize: '12px', color: '#6b7280', marginTop: '2px' }
                }, lead.phone + (lead.messenger ? ' · ' + lead.messenger : '')),
                lead.utm_source && React.createElement('div', {
                  style: { fontSize: '11px', color: '#9ca3af', marginTop: '2px' }
                }, 'UTM: ' + lead.utm_source)
              ),
              // Дата
              React.createElement('div', {
                style: { fontSize: '11px', color: '#9ca3af', textAlign: 'right', flexShrink: 0 }
              }, formatDate(lead.created_at)),
              // Кнопка "Создать клиента"
              React.createElement('button', {
                onClick: () => handleConvertLead(lead),
                disabled: actionLoading === 'lead-' + lead.id,
                style: {
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  color: '#fff',
                  cursor: actionLoading === 'lead-' + lead.id ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  opacity: actionLoading === 'lead-' + lead.id ? 0.7 : 1,
                  whiteSpace: 'nowrap'
                }
              }, actionLoading === 'lead-' + lead.id ? '⏳' : '👤 Создать клиента')
            )
          )
        }),

        // Секция: Активные триалы
        Section({
          title: 'Активные триалы',
          icon: '🎯',
          count: grouped.assigned.length,
          color: '#3b82f6',
          emptyText: 'Нет активных триалов',
          children: grouped.assigned.map((item, idx) =>
            React.createElement(ClientCard, {
              key: item.client_id || item.queue_id || idx,
              item,
              showPosition: false,
              showActions: false,
              showOfferTimer: false
            })
          )
        }),

        // Секция: Заявки на рассмотрении (v2.0)
        Section({
          title: 'Заявки на рассмотрении',
          icon: '📋',
          count: grouped.pending.length,
          color: '#f59e0b',
          emptyText: 'Нет новых заявок',
          children: grouped.pending.map((item, idx) =>
            React.createElement(ClientCard, {
              key: item.client_id || item.queue_id || idx,
              item,
              showPosition: false,
              showActions: true,
              showOfferTimer: false
            })
          )
        }),

        // Секция: Отклонённые
        grouped.rejected.length > 0 && Section({
          title: 'Отклонённые заявки',
          icon: '❌',
          count: grouped.rejected.length,
          color: '#ef4444',
          emptyText: '',
          children: grouped.rejected.map((item, idx) =>
            React.createElement(ClientCard, {
              key: item.client_id || item.queue_id || idx,
              item,
              showPosition: false,
              showActions: false,
              showOfferTimer: false
            })
          )
        })
      ),

      // ========== ДИАЛОГ: Активация триала (v3.0 — с выбором даты) ==========
      trialDialog && React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        },
        onClick: (e) => { if (e.target === e.currentTarget) setTrialDialog(null); }
      },
        React.createElement('div', {
          style: {
            background: 'var(--card, #fff)',
            borderRadius: '16px',
            padding: '24px',
            width: '340px',
            maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        },
          React.createElement('div', {
            style: { fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--text, #1f2937)' }
          }, '🎫 Активировать триал'),
          React.createElement('div', {
            style: { fontSize: '14px', color: '#6b7280', marginBottom: '16px' }
          }, `Клиент: ${trialDialog.clientName}`),
          React.createElement('label', {
            style: { display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text, #374151)', marginBottom: '6px' }
          }, 'Дата начала триала:'),
          React.createElement('input', {
            type: 'date',
            value: trialStartDate,
            onChange: (e) => setTrialStartDate(e.target.value),
            min: new Date().toISOString().split('T')[0],
            style: {
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              marginBottom: '8px',
              boxSizing: 'border-box'
            }
          }),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#9ca3af', marginBottom: '20px' }
          }, trialStartDate === new Date().toISOString().split('T')[0]
            ? '⚡ Триал начнётся сразу (7 дней)'
            : `📅 Триал начнётся ${trialStartDate}, доступ на 7 дней`
          ),
          React.createElement('div', {
            style: { display: 'flex', gap: '10px', justifyContent: 'flex-end' }
          },
            React.createElement('button', {
              onClick: () => setTrialDialog(null),
              style: {
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'var(--card, #fff)',
                cursor: 'pointer',
                fontSize: '14px',
                color: 'var(--text, #374151)'
              }
            }, 'Отмена'),
            React.createElement('button', {
              onClick: confirmActivateTrial,
              style: {
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }
            }, '✅ Активировать')
          )
        )
      ),

      // ========== ДИАЛОГ: Конвертация лида (v3.0) ==========
      convertDialog && React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        },
        onClick: (e) => { if (e.target === e.currentTarget) setConvertDialog(null); }
      },
        React.createElement('div', {
          style: {
            background: 'var(--card, #fff)',
            borderRadius: '16px',
            padding: '24px',
            width: '340px',
            maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }
        },
          React.createElement('div', {
            style: { fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: 'var(--text, #1f2937)' }
          }, '👤 Создать клиента'),
          React.createElement('div', {
            style: { fontSize: '14px', color: '#6b7280', marginBottom: '4px' }
          }, `Имя: ${convertDialog.leadName}`),
          React.createElement('div', {
            style: { fontSize: '14px', color: '#6b7280', marginBottom: '16px' }
          }, `Телефон: ${convertDialog.leadPhone}`),
          React.createElement('label', {
            style: { display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text, #374151)', marginBottom: '6px' }
          }, 'PIN-код для клиента:'),
          React.createElement('input', {
            type: 'text',
            inputMode: 'numeric',
            pattern: '[0-9]*',
            maxLength: 6,
            placeholder: '1234',
            value: convertPin,
            onChange: (e) => setConvertPin(e.target.value.replace(/\D/g, '')),
            style: {
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '18px',
              textAlign: 'center',
              letterSpacing: '8px',
              marginBottom: '8px',
              boxSizing: 'border-box'
            }
          }),
          React.createElement('div', {
            style: { fontSize: '12px', color: '#9ca3af', marginBottom: '20px' }
          }, 'Минимум 4 цифры. Сообщите PIN клиенту для входа.'),
          React.createElement('div', {
            style: { display: 'flex', gap: '10px', justifyContent: 'flex-end' }
          },
            React.createElement('button', {
              onClick: () => setConvertDialog(null),
              style: {
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'var(--card, #fff)',
                cursor: 'pointer',
                fontSize: '14px',
                color: 'var(--text, #374151)'
              }
            }, 'Отмена'),
            React.createElement('button', {
              onClick: confirmConvertLead,
              disabled: convertPin.length < 4,
              style: {
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: convertPin.length >= 4
                  ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
                  : '#d1d5db',
                color: '#fff',
                cursor: convertPin.length >= 4 ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: 600
              }
            }, '✅ Создать')
          )
        )
      ),

      // ========== SETTINGS HINT ==========
      stats && React.createElement('div', {
        style: {
          marginTop: '24px',
          padding: '12px 16px',
          background: 'var(--bg-secondary, #f3f4f6)',
          borderRadius: '10px',
          fontSize: '12px',
          color: '#6b7280'
        }
      },
        React.createElement('strong', null, '⚙️ Настройки: '),
        `Макс. слотов: ${stats.limits?.max_active_trials || 3} | `,
        `Длительность триала: ${stats.limits?.trial_days || 7} дней`
      )
    );
  }

  // ========================================
  // ЭКСПОРТ
  // ========================================

  HEYS.TrialQueue = {
    // Константы
    STATUS: QUEUE_STATUS,

    // API
    getCapacity,
    requestTrial,
    getQueueStatus,
    claimOffer,
    cancelQueue,
    clearCache,

    // Admin API
    admin: adminAPI,

    // Хелперы
    formatTimeRemaining,
    isOfferExpired,
    getQueueStatusMeta,
    getCapacityMeta,

    // React
    useTrialQueue,
    TrialCapacityWidget,
    QueueStatusCard,
    TrialQueueAdmin, // Админ-панель
  };

  // 🔇 v4.7.0: Лог загрузки отключён

})(typeof window !== 'undefined' ? window : globalThis);
