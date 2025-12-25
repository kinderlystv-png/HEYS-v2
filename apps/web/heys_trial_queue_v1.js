// heys_trial_queue_v1.js — Умная очередь на триал + UI виджеты
// Система честной очереди с offer/claim механикой
// v1.0.0 | 2025-12-25
(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // ========================================
  // КОНСТАНТЫ
  // ========================================
  
  const QUEUE_STATUS = {
    NOT_IN_QUEUE: 'not_in_queue',  // Не в очереди
    QUEUED: 'queued',              // Ожидает в очереди
    OFFER: 'offer',                // Получил offer, нужно подтвердить
    ASSIGNED: 'assigned',          // Триал стартовал
    EXPIRED: 'expired',            // Offer истёк
    CANCELED: 'canceled',          // Пользователь отменил
    CANCELED_BY_PURCHASE: 'canceled_by_purchase', // Купил подписку
  };
  
  const CACHE_KEY = 'heys_trial_queue_status';
  const CAPACITY_CACHE_KEY = 'heys_trial_capacity';
  const CACHE_TTL_MS = 60 * 1000; // 1 минута для очереди
  const CAPACITY_CACHE_TTL_MS = 30 * 1000; // 30 секунд для capacity
  
  // ========================================
  // УТИЛИТЫ
  // ========================================
  
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
  
  // Кэширование
  let _statusCache = null;
  let _statusCacheAt = 0;
  let _capacityCache = null;
  let _capacityCacheAt = 0;
  
  function getCachedStatus() {
    if (_statusCache && Date.now() - _statusCacheAt < CACHE_TTL_MS) {
      return _statusCache;
    }
    const stored = U.lsGet(CACHE_KEY, null);
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
    U.lsSet(CACHE_KEY, { data, ts: _statusCacheAt });
  }
  
  function getCachedCapacity() {
    if (_capacityCache && Date.now() - _capacityCacheAt < CAPACITY_CACHE_TTL_MS) {
      return _capacityCache;
    }
    const stored = U.lsGet(CAPACITY_CACHE_KEY, null);
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
    U.lsSet(CAPACITY_CACHE_KEY, { data, ts: _capacityCacheAt });
  }
  
  function clearCache() {
    _statusCache = null;
    _statusCacheAt = 0;
    _capacityCache = null;
    _capacityCacheAt = 0;
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CAPACITY_CACHE_KEY);
    } catch (_) {}
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
      
      const data = res.data || res;
      setCachedCapacity(data);
      return data;
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
      
      const data = res.data || res;
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
      
      const data = res.data || res;
      setCachedStatus(data);
      return data;
    } catch (e) {
      console.error('[TrialQueue] getQueueStatus error:', e);
      return getCachedStatus() || { success: true, status: QUEUE_STATUS.NOT_IN_QUEUE };
    }
  }
  
  /**
   * Подтвердить offer и запустить триал
   * @returns {Promise<{success, message, trial_ends_at?, error?}>}
   */
  async function claimOffer() {
    const sessionToken = HEYS.auth?.getSessionToken?.();
    if (!sessionToken) {
      return { success: false, error: 'no_session', message: 'Необходима авторизация' };
    }
    
    const api = HEYS.YandexAPI;
    if (!api) {
      return { success: false, error: 'api_not_ready', message: 'API не готов' };
    }
    
    try {
      const res = await api.rpc('claim_trial_offer', {
        p_session_token: sessionToken
      });
      
      if (res.error) {
        return { 
          success: false, 
          error: res.error.code || 'unknown', 
          message: res.error.message 
        };
      }
      
      const data = res.data || res;
      
      // Очищаем кэши — статус изменился
      clearCache();
      
      // Инвалидируем subscription cache
      if (HEYS.Subscription?.clearCache) {
        HEYS.Subscription.clearCache();
      }
      
      return data;
    } catch (e) {
      console.error('[TrialQueue] claimOffer error:', e);
      return { success: false, error: 'claim_failed', message: e.message };
    }
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
      
      return res.data || res;
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
   * Проверка: истёк ли offer
   */
  function isOfferExpired(expiresAt) {
    if (!expiresAt) return true;
    return new Date(expiresAt) <= new Date();
  }
  
  /**
   * Получить UI-метаданные для статуса очереди
   */
  function getQueueStatusMeta(status, position, offerExpiresAt) {
    switch (status) {
      case QUEUE_STATUS.OFFER:
        const expired = isOfferExpired(offerExpiresAt);
        return {
          label: expired ? 'Время истекло' : 'Место доступно!',
          shortLabel: expired ? 'Истекло' : 'Подтвердите',
          color: expired ? '#ef4444' : '#f59e0b',
          emoji: expired ? '⏰' : '🎉',
          actionLabel: expired ? 'Запросить снова' : 'Начать триал',
          showTimer: !expired,
        };
      
      case QUEUE_STATUS.QUEUED:
        return {
          label: `Вы в очереди: #${position || '?'}`,
          shortLabel: `#${position || '?'}`,
          color: '#6b7280',
          emoji: '⏳',
          actionLabel: 'Отменить',
          showTimer: false,
        };
      
      case QUEUE_STATUS.ASSIGNED:
        return {
          label: 'Триал активен',
          shortLabel: 'Активен',
          color: '#22c55e',
          emoji: '✅',
          actionLabel: null,
          showTimer: false,
        };
      
      case QUEUE_STATUS.EXPIRED:
        return {
          label: 'Время истекло',
          shortLabel: 'Истекло',
          color: '#ef4444',
          emoji: '⏰',
          actionLabel: 'Запросить снова',
          showTimer: false,
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
   */
  function getCapacityMeta(capacity) {
    const { available_slots, total_slots, queue_size, is_accepting } = capacity;
    
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
    
    if (available_slots > 0) {
      return {
        status: 'available',
        color: '#22c55e',
        emoji: '🟢',
        label: `Свободно ${available_slots} из ${total_slots}`,
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
      sublabel: queue_size > 0 ? `В очереди: ${queue_size}` : 'Очередь пуста',
      actionLabel: 'Встать в очередь',
      showQueue: true,
      queueSize: queue_size,
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
    
    // Таймер для offer
    useEffect(() => {
      if (queueStatus?.status !== QUEUE_STATUS.OFFER || !queueStatus?.offer_expires_at) {
        setTimeRemaining('');
        return;
      }
      
      const updateTimer = () => {
        setTimeRemaining(formatTimeRemaining(queueStatus.offer_expires_at));
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      
      return () => clearInterval(interval);
    }, [queueStatus?.status, queueStatus?.offer_expires_at]);
    
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
      
      // Кнопки действий
      React.createElement('div', { 
        style: { display: 'flex', gap: '8px', flexDirection: 'column' } 
      },
        // Основное действие
        status === QUEUE_STATUS.OFFER && !isOfferExpired(queueStatus?.offer_expires_at) && 
          React.createElement('button', {
            onClick: handleClaim,
            disabled: isActioning,
            style: {
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '15px'
            }
          }, isActioning ? '⏳...' : '🎉 Начать триал!'),
        
        // Запросить снова (для expired/canceled)
        (status === QUEUE_STATUS.EXPIRED || status === QUEUE_STATUS.CANCELED) &&
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
        
        // Отмена (для queued)
        status === QUEUE_STATUS.QUEUED &&
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
        refreshCapacity: async () => {},
        refreshStatus: async () => {},
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
      claimOffer: doClaimOffer,
      cancelQueue: doCancelQueue,
      
      // Обновление
      refreshCapacity,
      refreshStatus,
      
      // Хелперы
      hasOffer: queueStatus?.status === QUEUE_STATUS.OFFER && 
                !isOfferExpired(queueStatus?.offer_expires_at),
      isInQueue: queueStatus?.status === QUEUE_STATUS.QUEUED,
      position: queueStatus?.position,
      offerExpiresAt: queueStatus?.offer_expires_at,
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
    
    // Хелперы
    formatTimeRemaining,
    isOfferExpired,
    getQueueStatusMeta,
    getCapacityMeta,
    
    // React
    useTrialQueue,
    TrialCapacityWidget,
    QueueStatusCard,
  };
  
  console.log('[HEYS] 🎫 TrialQueue module v1.0 loaded');
  
})(typeof window !== 'undefined' ? window : globalThis);
