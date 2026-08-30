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

  function resolveCuratorName(explicitName) {
    const configured = explicitName
      || HEYS.config?.curatorDisplayName
      || HEYS.config?.curatorName
      || HEYS.curatorDisplayName;
    const value = String(configured || '').trim();
    return value || 'Антон';
  }

  function formatWelcomeDate(dateLike) {
    if (!dateLike) return '';
    const date = new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '';
    const currentYear = new Date().getFullYear();
    const options = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== currentYear) options.year = 'numeric';
    return date.toLocaleDateString('ru-RU', options);
  }

  function pluralDays(days) {
    const n = Math.abs(Number(days) || 0);
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
    return 'дней';
  }

  function buildClientWelcomeMessage(options = {}) {
    const curatorName = resolveCuratorName(options.curatorName);
    const clientName = String(options.clientName || options.name || '').trim();
    const phone = String(options.phone || '').trim();
    const pin = String(options.pin || '').trim();
    const deepLink = String(options.deepLink || options.link || '').trim();
    const trialDays = Number(options.trialDays || options.trial_days || 7) || 7;
    const trialEndsLabel = formatWelcomeDate(options.trialEndsAt || options.trial_ends_at);
    const linkExpiresLabel = formatWelcomeDate(options.pinTokenExpiresAt || options.pin_token_expires_at);

    const greeting = clientName ? `Здравствуйте, ${clientName}.` : 'Здравствуйте.';
    const accessLines = [
      'Ссылка для привязки Telegram:',
      deepLink || '—',
      '',
      phone ? `Телефон для входа: ${phone}` : 'Телефон для входа: номер из заявки',
      `PIN: ${pin || '—'}`,
    ];
    const trialLine = trialEndsLabel
      ? `Первая неделя Pro открыта до ${trialEndsLabel}, без карты и автосписаний.`
      : `Первая неделя Pro длится ${trialDays} ${pluralDays(trialDays)} с момента активации доступа, без карты и автосписаний.`;
    const linkLine = linkExpiresLabel
      ? `Ссылка для привязки Telegram действует до ${linkExpiresLabel}.`
      : 'Ссылка для привязки Telegram действует 7 дней.';

    return [
      greeting,
      '',
      `Я ${curatorName}, ваш куратор в HEYS. Ниже доступ к приложению на первую неделю Pro.`,
      '',
      ...accessLines,
      '',
      'Что сделать:',
      '1. Откройте ссылку в Telegram.',
      '2. Бот привяжет ваш Telegram и даст ссылку на приложение.',
      '3. Войдите в приложение по телефону и PIN из этого сообщения.',
      '',
      trialLine,
      'В этот период вы присылаете данные о питании и контексте дня, а я веду дневник в HEYS и смотрю на картину недели.',
      linkLine,
      '',
      'Если ссылка не открылась или PIN не подошёл, напишите мне здесь.',
    ].join('\n');
  }

  function buildTrialIntakeInviteMessage(options = {}) {
    const pin = String(options.pin || '').trim();
    const intakeUrl = String(options.intakeUrl || 'https://app.heyslab.ru/?intake=1').trim();
    return [
      'Здравствуйте.',
      '',
      'Куратор HEYS приглашает вас заполнить защищённую анкету перед пробной неделей.',
      '',
      `Анкета: ${intakeUrl}`,
      'Телефон для входа — номер из заявки.',
      `PIN: ${pin || '—'}`,
      '',
      'Ответы сохраняются в защищённой анкете. Их проверит назначенный куратор. Не отправляйте сведения о здоровье в мессенджере.',
      'После анкеты куратор вручную оценит, подходит ли формат сопровождения. Заполнение анкеты не гарантирует начало пробной недели.',
      '',
      'Если не получится войти, ответьте на это сообщение.',
    ].join('\n');
  }

  const INTAKE_ATTENTION_RULES = [];

  function normalizeIntakeAnswer(value) {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return String(value || '').trim();
  }

  function createRequestId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (global.crypto?.getRandomValues) global.crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function getIntakeAnswerAttention(answers, section, key) {
    const rule = INTAKE_ATTENTION_RULES.find((item) => (
      item.section === section && (item.key === key || item.detailKey === key)
    ));
    if (!rule) return null;
    const value = normalizeIntakeAnswer(answers?.[section]?.[rule.key]);
    if (rule.nonEmpty ? !value : !rule.values.includes(value)) return null;
    const needsClarification = ['prefer_not', 'unsure'].includes(value);
    return {
      section,
      key: rule.key,
      label: rule.label,
      value,
      status: needsClarification ? 'clarification' : 'attention',
      statusLabel: needsClarification ? 'Нужно уточнить до решения' : 'Требует внимания',
      anchorId: `trial-intake-answer-${section}-${key}`,
    };
  }

  function summarizeIntakeAnswers(answers = {}) {
    const safetyFactors = INTAKE_ATTENTION_RULES.map((rule) => (
      getIntakeAnswerAttention(answers, rule.section, rule.key)
    )).filter(Boolean);
    const safetyFlags = safetyFactors.map((factor) => (
      factor.status === 'clarification' ? `${factor.label}: обсудить лично` : factor.label
    ));
    return {
      goal: String(answers.goals?.primary_goal || '').trim() || 'Цель не указана',
      safetyFlags,
      safetyFactors,
    };
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
    const api = HEYS.YandexAPI;
    if (!api) {
      return { success: false, error: 'api_not_ready', message: 'API не готов' };
    }

    try {
      const rpcParams = {
        p_source: source
      };
      if (sessionToken) rpcParams.p_session_token = sessionToken;
      const res = await api.rpc('request_trial', rpcParams);

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
    const api = HEYS.YandexAPI;
    if (!api) {
      return getCachedStatus() || { success: true, status: QUEUE_STATUS.NOT_IN_QUEUE };
    }

    try {
      const rpcParams = {};
      if (sessionToken) rpcParams.p_session_token = sessionToken;
      const res = await api.rpc('get_trial_queue_status', rpcParams);

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
    const api = HEYS.YandexAPI;
    if (!api) {
      return { success: false, error: 'api_not_ready', message: 'API не готов' };
    }

    try {
      const rpcParams = {};
      if (sessionToken) rpcParams.p_session_token = sessionToken;
      const res = await api.rpc('cancel_trial_queue', rpcParams);

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
      const tick = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        refresh();
      };
      const interval = setInterval(tick, 30000);
      const onVis = () => {
        if (typeof document !== 'undefined' && !document.hidden) refresh();
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVis);
      };
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
      const tick = () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        refresh();
      };
      const interval = setInterval(tick, 60000);
      const onVis = () => {
        if (typeof document !== 'undefined' && !document.hidden) refresh();
      };
      document.addEventListener('visibilitychange', onVis);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVis);
      };
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

  const hasCuratorAuthContext = () => {
    try {
      if (HEYS.auth?.isCuratorSession?.() === true) return true;
    } catch (_) { /* noop */ }
    try {
      if (HEYS.cloud?.getUser?.()) return true;
    } catch (_) { /* noop */ }
    try { return !!localStorage.getItem('heys_curator_cookie_session_hint'); } catch (_) { return false; }
  };

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

      if (!hasCuratorAuthContext()) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        // p_curator_session_token removed — JWT auth via Authorization header
        const res = await api.rpc('admin_get_trial_queue_list', {});

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

      if (!hasCuratorAuthContext()) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        const res = await api.rpc('admin_add_to_queue', {
          p_client_id: clientId,
          p_source: source,
          p_priority: priority
          // p_curator_id injected by cloud function from JWT
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
     * Активировать триал для клиента с выбором даты старта (v4.0 JWT-only)
     * @param {string} clientId - UUID клиента
     * @param {string} [startDate] - Дата старта (YYYY-MM-DD). По умолчанию — сегодня.
     * @returns {Promise<{success: boolean, status?: string, trial_ends_at?: string, error?: string}>}
     */
    async activateTrial(clientId, startDate) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      // 🔐 v4.0: JWT токен передаётся через Authorization header (YandexAPI.rpc)
      // p_curator_session_token удалён, p_curator_id добавляет cloud function
      if (!hasCuratorAuthContext()) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        const params = {
          p_client_id: clientId
        };
        if (startDate) {
          params.p_start_date = startDate;
        }
        // ❌ Убрано: p_curator_session_token (теперь JWT в Authorization header)

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
     * @param {string} queueId - UUID записи очереди
     * @param {string} reason - причина отклонения
     * @returns {Promise<{success: boolean, status?: string, error?: string}>}
     */
    async rejectApplication(queueId, reason = '') {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      if (!hasCuratorAuthContext()) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }

      try {
        const res = await api.rpc('admin_reject_request', {
          p_queue_id: queueId,
          p_reason: reason
          // p_curator_id injected by cloud function from JWT
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

    async getIntakeSummaries() {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }
      try {
        const [candidateRes, legacyRes] = await Promise.all([
          api.rpc('admin_get_trial_candidate_summaries', {}),
          api.rpc('admin_get_trial_intake_summaries', {}),
        ]);
        if (candidateRes.error) return { success: false, error: candidateRes.error.code, message: candidateRes.error.message };
        const candidates = candidateRes.data?.admin_get_trial_candidate_summaries || candidateRes.data || candidateRes;
        const legacy = legacyRes.error ? { items: [] } : (legacyRes.data?.admin_get_trial_intake_summaries || legacyRes.data || legacyRes);
        const candidateItems = Array.isArray(candidates.items) ? candidates.items.map((item) => ({
          ...item, client_id: item.candidate_id, subject_type: 'candidate',
        })) : [];
        const legacyItems = Array.isArray(legacy.items) ? legacy.items.map((item) => ({ ...item, subject_type: 'client' })) : [];
        return { success: true, data: [...candidateItems, ...legacyItems] };
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    async getIntake(clientId, subjectType = 'client') {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) return { success: false, error: 'no_auth' };
      try {
        const candidate = subjectType === 'candidate';
        const fn = candidate ? 'admin_get_trial_candidate' : 'admin_get_trial_intake';
        const res = await api.rpc(fn, candidate ? { p_candidate_id: clientId } : { p_client_id: clientId });
        if (res.error) return { success: false, error: res.error.code, message: res.error.message };
        return res.data?.[fn] || res.data || res;
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    async prepareInvite(clientId) {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) return { success: false, error: 'no_auth' };
      try {
        const res = await api.rpc('admin_invite_trial_intake', { p_client_id: clientId });
        if (res.error) return { success: false, error: res.error.code, message: res.error.message };
        return res.data?.admin_invite_trial_intake || res.data || res;
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    async markInviteSent(clientId, subjectType = 'client') {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) return { success: false, error: 'no_auth' };
      try {
        const candidate = subjectType === 'candidate';
        const fn = candidate ? 'admin_mark_trial_candidate_invite_sent' : 'admin_mark_trial_intake_invite_sent';
        const res = await api.rpc(fn, candidate ? { p_candidate_id: clientId } : { p_client_id: clientId });
        if (res.error) return { success: false, error: res.error.code, message: res.error.message };
        return res.data?.[fn] || res.data || res;
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    async regenerateCandidatePin(candidateId) {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) return { success: false, error: 'no_auth' };
      try {
        const fn = 'admin_regenerate_trial_candidate_pin';
        const res = await api.rpc(fn, { p_candidate_id: candidateId });
        if (res.error) return { success: false, error: res.error.code, message: res.error.message };
        return res.data?.[fn] || res.data || res;
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    async reviewIntake(clientId, action, reasonCode, internalNote, options = {}) {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) return { success: false, error: 'no_auth' };
      try {
        const candidate = options.subjectType === 'candidate';
        const fn = candidate ? 'admin_review_trial_candidate_v4' : 'admin_review_trial_intake_v2';
        const params = candidate
          ? {
            p_candidate_id: clientId,
            p_action: action,
            p_reason_code: reasonCode || null,
            p_internal_note: internalNote || null,
            p_decision_checklist: options.decisionChecklist || null,
            p_expected_updated_at: options.expectedUpdatedAt || null,
          }
          : {
            p_client_id: clientId,
            p_action: action,
            p_reason_code: reasonCode || null,
            p_internal_note: internalNote || null,
            p_client_message: options.clientMessage || null,
            p_clarification_sections: options.clarificationSections || null,
            p_decision_checklist: options.decisionChecklist || null,
            p_expected_updated_at: options.expectedUpdatedAt || null,
          };
        const res = await api.rpc(fn, params);
        if (res.error) return { success: false, error: res.error.code, message: res.error.message };
        return res.data?.[fn] || res.data || res;
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    async addCandidateAnswerCorrection(candidateId, correction) {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) return { success: false, error: 'no_auth' };
      const fn = 'admin_add_trial_candidate_answer_correction_v1';
      try {
        const res = await api.rpc(fn, {
          p_candidate_id: candidateId,
          p_question_id: correction.questionId,
          p_new_value: correction.newValue,
          p_communication_channel: correction.communicationChannel,
          p_comment: correction.comment,
          p_confirmed_from_candidate: correction.confirmedFromCandidate,
          p_safety_confirmed: correction.safetyConfirmed,
          p_request_id: correction.requestId,
          p_reverses_correction_id: correction.reversesCorrectionId || null,
          p_expected_updated_at: correction.expectedUpdatedAt || null,
        });
        if (res.error) return { success: false, error: res.error.code, message: res.error.message };
        return res.data?.[fn] || res.data || res;
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Сконвертировать лид в клиента (v4.0 — P0.6: автогенерация PIN на стороне БД)
     * Создаёт клиента с криптографически случайным 4-значным PIN, добавляет в очередь.
     * PIN возвращается ОДИН РАЗ в ответе — куратор должен сразу передать клиенту.
     *
     * @param {number} leadId - ID лида
     * @param {string} [curatorId] - UUID куратора (опционально, JWT-injected)
     * @returns {Promise<{success: boolean, client_id?: string, pin?: string, error?: string, message?: string}>}
     */
    async convertLead(leadId, curatorId) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const params = { p_lead_id: leadId };
        if (curatorId) {
          params.p_curator_id = curatorId;
        }

        const res = await api.rpc('admin_prepare_trial_candidate_from_lead', params);

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_prepare_trial_candidate_from_lead || res.data || res;
        return fnData;
      } catch (e) {
        console.error('[TrialQueue.admin] convertLead error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    async reopenCandidate(leadId) {
      const api = HEYS.YandexAPI;
      if (!api || !hasCuratorAuthContext()) {
        return { success: false, error: 'no_auth', message: 'Нет сессии куратора' };
      }
      try {
        const res = await api.rpc('admin_reopen_trial_candidate', { p_lead_id: leadId });
        if (res.error) return { success: false, error: res.error.code, message: res.error.message };
        return res.data?.admin_reopen_trial_candidate || res.data || res;
      } catch (e) {
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Сбросить Telegram-привязку клиента.
     * Используется, если персональную ссылку случайно открыл не клиент.
     */
    async clearTelegramBinding(clientId) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_clear_telegram_binding', {
          p_client_id: clientId
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_clear_telegram_binding || res.data || res;
        return fnData.success !== undefined ? fnData : { success: true };
      } catch (e) {
        console.error('[TrialQueue.admin] clearTelegramBinding error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Получить текущую Telegram-ссылку клиента без раскрытия pin_token
     * в общем списке клиентов.
     */
    async getClientAccessLink(clientId) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_get_client_access_link', {
          p_client_id: clientId
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_get_client_access_link || res.data || res;
        return fnData.success !== undefined ? fnData : { success: true };
      } catch (e) {
        console.error('[TrialQueue.admin] getClientAccessLink error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Перевыпустить PIN и Telegram-ссылку клиента.
     * Сервер также отзывает старые PIN-сессии и очищает Telegram-привязку.
     */
    async regeneratePin(clientId) {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_regenerate_pin', {
          p_client_id: clientId
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_regenerate_pin || res.data || res;
        return fnData.success !== undefined ? fnData : { success: true };
      } catch (e) {
        console.error('[TrialQueue.admin] regeneratePin error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    },

    /**
     * Отклонить лида (v3.0)
     * @param {string} leadId - UUID лида
     * @param {string} [reason] - Причина отклонения
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async rejectLead(leadId, reason = 'rejected_by_curator') {
      const api = HEYS.YandexAPI;
      if (!api) {
        return { success: false, error: 'api_not_ready', message: 'API не готов' };
      }

      try {
        const res = await api.rpc('admin_update_lead_status', {
          p_lead_id: leadId,
          p_status: 'rejected',
          p_reason: reason
        });

        if (res.error) {
          return { success: false, error: res.error.code, message: res.error.message };
        }

        const fnData = res.data?.admin_update_lead_status || res.data || res;
        return fnData.success !== undefined ? fnData : { success: true };
      } catch (e) {
        console.error('[TrialQueue.admin] rejectLead error:', e);
        return { success: false, error: 'request_failed', message: e.message };
      }
    }
  };

  // ========================================
  // ADMIN UI КОМПОНЕНТ
  // ========================================

  /**
   * NewLeadsBadge — индикатор заявок, требующих действия куратора.
   * Считает тот же набор, что вкладка «Лиды»: новые заявки общей очереди и
   * закреплённые за текущим куратором contacted-лиды без подготовленной анкеты.
   */
  function NewLeadsBadge({ children, curatorId, pollIntervalMs = 60000 }) {
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
      let alive = true;
      const tick = async () => {
        try {
          const [leadsRes, intakesRes] = await Promise.all([
            adminAPI.getLeads('all'),
            adminAPI.getIntakeSummaries(),
          ]);
          if (!alive) return;
          if (leadsRes.success && Array.isArray(leadsRes.data) && intakesRes.success) {
            setCount(filterActionableLeads(leadsRes.data, curatorId, intakesRes.data).length);
          }
        } catch (e) {
          console.warn('[NewLeadsBadge] poll failed:', e.message);
        }
      };

      const handleQueueUpdate = () => { tick(); };
      tick();
      const id = setInterval(tick, pollIntervalMs);
      window.addEventListener('heys:clients-updated', handleQueueUpdate);
      return () => {
        alive = false;
        clearInterval(id);
        window.removeEventListener('heys:clients-updated', handleQueueUpdate);
      };
    }, [curatorId, pollIntervalMs]);

    if (!count || count <= 0) {
      return children;
    }

    return React.createElement(
      'span',
      { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
      children,
      React.createElement(
        'span',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 9,
            background: '#dc2626',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
          }
        },
        String(count)
      )
    );
  }

  function filterActionableLeads(leads, curatorId, intakeItems = []) {
    const normalizedCuratorId = String(curatorId || '').trim().toLowerCase();
    const preparedLeadIds = new Set(
      (Array.isArray(intakeItems) ? intakeItems : [])
        .filter((item) => item?.subject_type === 'candidate')
        .map((item) => item?.lead_id)
        .filter(Boolean)
    );

    return (Array.isArray(leads) ? leads : []).filter((lead) => {
      if (preparedLeadIds.has(lead?.id)) return false;
      if (lead?.status === 'new') return true;
      if (lead?.status !== 'contacted' || !normalizedCuratorId) return false;

      return String(lead.curator_id || '').trim().toLowerCase() === normalizedCuratorId;
    });
  }

  /**
   * TrialQueueAdmin — UI для управления очередью
   * @param {Object} props - { onClose, curatorId }
   */
  function TrialQueueAdmin({ onClose, curatorId }) {
    const [queue, setQueue] = React.useState([]);
    const [stats, setStats] = React.useState(null);
    const [leads, setLeads] = React.useState([]);
    const [allClients, setAllClients] = React.useState([]); // Все клиенты куратора (для отображения trial вне очереди)
    const [intakeByClient, setIntakeByClient] = React.useState({});
    const [intakesReady, setIntakesReady] = React.useState(false);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [actionLoading, setActionLoading] = React.useState(null);
    const [activeTab, setActiveTab] = React.useState('new');
    // Диалог конвертации лида (v4.0 — P0.6: PIN генерируется на стороне БД)
    const [convertDialog, setConvertDialog] = React.useState(null); // { leadId, leadName, leadPhone }
    // Диалог "PIN сгенерирован" с deep-link (P0.7)
    const [pinResult, setPinResult] = React.useState(null); // { name, phone, pin, deepLink }
    const [intakeDialog, setIntakeDialog] = React.useState(null);
    const [reviewReason, setReviewReason] = React.useState('');
    const [reviewNote, setReviewNote] = React.useState('');
    const [decisionSheetOpen, setDecisionSheetOpen] = React.useState(false);
    const [answersDetailsOpen, setAnswersDetailsOpen] = React.useState(false);
    const [reviewAction, setReviewAction] = React.useState('approved');
    const [answerCorrection, setAnswerCorrection] = React.useState(null);
    const [correctionError, setCorrectionError] = React.useState('');
    const [decisionChecklist, setDecisionChecklist] = React.useState({
      within_scope: null,
      understands_boundaries: null,
      ready_to_track: null,
      realistic_expectations: null,
      safe_format: null,
    });

    // Загрузка данных
    const loadData = React.useCallback(async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      setError(null);

      try {
        const [queueRes, statsRes, leadsRes, clientsRes, intakesRes] = await Promise.all([
          adminAPI.getQueueList(),
          adminAPI.getStats(),
          adminAPI.getLeads('all'),
          HEYS.YandexAPI.getClients(), // Все клиенты куратора (для trial вне очереди)
          adminAPI.getIntakeSummaries()
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
          console.log('[TrialQueueAdmin] Loaded leads:', leadsRes.data);
          setLeads(leadsRes.data || []);
        }

        // Загружаем всех клиентов куратора (для отображения trial вне очереди)
        if (!clientsRes.error && Array.isArray(clientsRes.data)) {
          setAllClients(clientsRes.data);
        }

        if (intakesRes.success) {
          const next = {};
          (intakesRes.data || []).forEach((item) => { if (item?.client_id) next[item.client_id] = item; });
          setIntakeByClient(next);
          setIntakesReady(true);
        } else {
          setIntakesReady(false);
          setIntakeByClient({});
          setError('Не удалось загрузить этапы анкет. Действия временно заблокированы — обновите данные.');
        }
      } catch (e) {
        setIntakesReady(false);
        setIntakeByClient({});
        setError(e.message);
      } finally {
        if (!isSilent) setLoading(false);
      }
    }, []);

    React.useEffect(() => {
      loadData(false);
    }, [loadData]);

    // P0.11: polling каждые 30 секунд — куратор видит новые лиды без F5
    React.useEffect(() => {
      const intervalId = setInterval(() => {
        loadData(true); // isSilent=true — без спиннера
      }, 30000);
      return () => clearInterval(intervalId);
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
        if (intakeByClient[item.client_id]?.status === 'rejected') {
          result.rejected.push({ ...item, status: 'rejected' });
          return;
        }
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
    }, [queue, intakeByClient]);

    // Действия
    const handleRemove = (item) => {
      const clientId = item?.client_id;
      const clientName = item?.client_name || item?.name || 'клиент';
      if (!clientId) return;
      if (!confirm(`Удалить "${clientName}" из очереди?\n\nПосле удаления появится кнопка отмены.`)) return;

      const queueSnapshot = Array.isArray(queue) ? queue.slice() : [];

      const applyLocalRemoval = () => {
        setQueue((prev) => prev.filter((entry) => String(entry?.client_id || '') !== String(clientId)));
      };

      const restoreLocalRemoval = () => {
        setQueue(queueSnapshot);
      };

      const runCommit = async () => {
        setActionLoading(clientId);
        const res = await adminAPI.removeFromQueue(clientId, 'admin_removed');
        setActionLoading(null);

        if (res.success) {
          loadData(true);
          // 🔄 Hot-sync: убрали из очереди → обновить во всех вкладках.
          window.dispatchEvent(new CustomEvent('heys:clients-updated', {
            detail: { action: 'removedFromQueue', clientId }
          }));
          return;
        }

        throw new Error(res.message || 'Не удалось удалить');
      };

      if (!HEYS.Undo?.runAction) {
        applyLocalRemoval();
        runCommit().catch((error) => {
          restoreLocalRemoval();
          HEYS.Toast?.error?.(error.message || 'Не удалось удалить из очереди');
        });
        return;
      }

      HEYS.Undo.runAction({
        label: `«${clientName}» удалён из очереди`,
        errorMessage: 'Не удалось подготовить удаление из очереди',
        apply: () => {
          applyLocalRemoval();
          return { queueSnapshot, clientId, clientName };
        },
        undo: () => {
          restoreLocalRemoval();
        },
        onExpire: async () => {
          try {
            await runCommit();
          } catch (error) {
            restoreLocalRemoval();
            HEYS.Toast?.error?.(error.message || 'Не удалось удалить из очереди');
          }
        }
      });
    };

    // Конвертировать лид в клиента (v4.0 — P0.6: PIN автогенерируется в БД)
    const handleConvertLead = (lead) => {
      setConvertDialog({ leadId: lead.id, leadName: lead.name, leadPhone: lead.phone });
    };

    // Отклонить лида (v3.0)
    const handleRejectLead = async (lead) => {
      const reason = prompt(`Отклонить лида "${lead.name}"?\nУкажите причину (опционально):`, '');
      if (reason === null) return; // Отмена

      setActionLoading('lead-reject-' + lead.id);
      const res = await adminAPI.rejectLead(lead.id, reason || 'rejected_by_curator');
      setActionLoading(null);

      if (res.success) {
        loadData(true);
        // 🔄 Hot-sync: лид отклонён, лидов меньше → можно обновить badge.
        window.dispatchEvent(new CustomEvent('heys:clients-updated', {
          detail: { action: 'leadRejected', leadId: lead.id }
        }));
      } else {
        alert('Ошибка: ' + (res.message || 'Не удалось отклонить лида'));
      }
    };

    const confirmConvertLead = async () => {
      if (!convertDialog) return;

      setActionLoading('lead-' + convertDialog.leadId);
      const leadName = convertDialog.leadName;
      const leadPhone = convertDialog.leadPhone;
      const leadId = convertDialog.leadId;
      setConvertDialog(null);

      // P0.6: PIN генерируется на стороне БД, мы его только получаем
      const res = await adminAPI.convertLead(leadId);
      setActionLoading(null);

      const showPreparedInvite = (result) => {
        loadData(true);
        setActiveTab('pending');
        window.dispatchEvent(new CustomEvent('heys:clients-updated', {
          detail: { action: 'candidatePrepared', candidateId: result.candidate_id }
        }));
        const generatedPin = result.pin;
        if (!generatedPin) {
          alert(`Приглашение для "${leadName}" подготовлено, но PIN не получен от сервера. Повторите подготовку.`);
        } else {
          setPinResult({
            clientId: result.candidate_id,
            subjectType: 'candidate',
            name: leadName,
            phone: leadPhone,
            pin: generatedPin,
            deepLink: null,
            intakeUrl: result.intake_url || 'https://app.heyslab.ru/?intake=1',
            pinTokenExpiresAt: result.pin_token_expires_at,
            inviteStatus: 'invite_prepared',
          });
        }
      };

      if (res.success) {
        showPreparedInvite(res);
      } else if (res.error === 'phone_already_has_active' || res.code === 'PHONE_ALREADY_TRIAL') {
        alert(
          `ℹ️ У клиента с телефоном ${leadPhone} уже есть активная заявка/триал/подписка.\n` +
          `Лид НЕ конвертирован.`
        );
      } else if (res.error === 'phone_already_exists') {
        const reopen = confirm(
          `Клиент с телефоном ${leadPhone} уже существует.\n\n` +
          'Открыть новую анкету в существующей записи? Это возможно после 30 дней с прошлого отказа; старые ответы будут удалены.'
        );
        if (!reopen) return;
        setActionLoading('lead-' + leadId);
        const reopenRes = await adminAPI.reopenCandidate(leadId);
        setActionLoading(null);
        if (reopenRes.success) {
          showPreparedInvite(reopenRes);
        } else if (reopenRes.error === 'reapply_cooldown') {
          const eligible = reopenRes.eligible_at
            ? new Date(reopenRes.eligible_at).toLocaleDateString('ru-RU')
            : 'позже';
          alert(`Повторную анкету можно открыть ${eligible}.`);
        } else {
          alert('Не удалось открыть повторную анкету: ' + (reopenRes.message || reopenRes.error || 'ошибка'));
        }
      } else if (res.error === 'lead_already_converted') {
        alert(`ℹ️ Этот лид уже был сконвертирован ранее.`);
      } else {
        alert('Ошибка: ' + (res.message || res.error || 'Не удалось создать клиента'));
      }
    };

    const resumePreparedInvite = async (item, intakeStatus) => {
      const clientId = item.client_id;
      if (intakeStatus === 'invite_sent' && !confirm(
        'Перевыпустить доступ? Старый PIN и открытые клиентские сессии перестанут работать.'
      )) return;
      setActionLoading('invite-' + clientId);

      if (item.subject_type === 'candidate') {
        const access = await adminAPI.regenerateCandidatePin(clientId);
        setActionLoading(null);
        if (!access.success || !access.pin) {
          alert('Не удалось восстановить приглашение: ' + (access.message || access.error || 'ошибка'));
          return;
        }
        setPinResult({
          clientId, subjectType: 'candidate',
          name: item.client_name || item.name || 'Кандидат',
          phone: item.client_phone || item.phone_normalized || '',
          pin: access.pin, deepLink: null,
          intakeUrl: access.intake_url || 'https://app.heyslab.ru/?intake=1',
          inviteStatus: 'invite_prepared',
        });
        loadData(true);
        return;
      }

      if (intakeStatus === 'invited') {
        const prepared = await adminAPI.prepareInvite(clientId);
        if (!prepared.success) {
          setActionLoading(null);
          alert('Не удалось подготовить приглашение: ' + (prepared.message || prepared.error || 'ошибка'));
          return;
        }
      }

      const access = await adminAPI.regeneratePin(clientId);
      setActionLoading(null);
      if (!access.success || !access.pin) {
        alert('Не удалось восстановить приглашение: ' + (access.message || access.error || 'ошибка'));
        return;
      }

      setPinResult({
        clientId,
        name: item.client_name || item.name || 'Клиент',
        phone: item.client_phone || item.phone_normalized || '',
        pin: access.pin,
        deepLink: null,
        intakeUrl: 'https://app.heyslab.ru/?intake=1',
        pinTokenExpiresAt: access.pin_token_expires_at,
        inviteStatus: 'invite_prepared',
      });
      loadData(true);
    };

    const buildWelcomeForAccess = (access) => buildClientWelcomeMessage({
      clientName: access?.name,
      phone: access?.phone,
      pin: access?.pin,
      deepLink: access?.deepLink,
      pinTokenExpiresAt: access?.pinTokenExpiresAt,
      trialDays: stats?.limits?.trial_days || 7,
    });

    const buildIntakeInviteForAccess = (access) => buildTrialIntakeInviteMessage({
      pin: access?.pin,
      intakeUrl: access?.intakeUrl,
    });

    const copyToClipboard = async (text, successMessage) => {
      if (!text) return false;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
        await navigator.clipboard.writeText(text);
        HEYS.Toast?.success?.(successMessage || 'Скопировано');
        return true;
      } catch (e) {
        console.warn('[TrialQueueAdmin] Clipboard copy failed:', e);
        alert('Не удалось скопировать автоматически. Выделите текст и скопируйте вручную.');
        return false;
      }
    };

    const openIntake = async (item) => {
      const clientId = item.client_id;
      setActionLoading('intake-' + clientId);
      const res = await adminAPI.getIntake(clientId, item.subject_type);
      setActionLoading(null);
      if (!res.success || !res.intake) {
        alert('Не удалось открыть анкету: ' + (res.message || res.error || 'ошибка загрузки'));
        return;
      }
      setReviewReason(res.intake.decision_reason || '');
      setReviewNote(res.intake.internal_note || '');
      setDecisionChecklist({
        within_scope: null,
        understands_boundaries: null,
        ready_to_track: null,
        realistic_expectations: null,
        safe_format: null,
        ...Object.fromEntries(Object.entries(res.intake.decision_checklist || {})
          .filter(([key]) => key !== 'slot_available')),
      });
      setReviewAction('approved');
      setDecisionSheetOpen(false);
      setAnswersDetailsOpen(false);
      setAnswerCorrection(null);
      setCorrectionError('');
      setIntakeDialog({
        ...res.intake,
        client_id: clientId,
        subject_type: item.subject_type || 'client',
        clientName: item.client_name || item.name || 'Кандидат',
        clientPhone: item.client_phone || item.phone_normalized || '',
      });
    };

    const submitIntakeReview = async () => {
      if (!intakeDialog) return;
      const action = reviewAction;
      if (action === 'rejected' && (!reviewReason || !reviewNote.trim())) {
        alert('Для отказа выберите код причины и добавьте внутреннюю заметку.');
        return;
      }
      if (!['approved', 'rejected'].includes(action)) {
        alert('Выберите итоговое решение.');
        return;
      }
      if (Object.values(decisionChecklist).some((value) => typeof value !== 'boolean')) {
        alert('Заполните чек-лист решения.');
        return;
      }
      setActionLoading('review-' + intakeDialog.client_id);
      const res = await adminAPI.reviewIntake(
        intakeDialog.client_id,
        action,
        reviewReason,
        reviewNote.trim(),
        {
          decisionChecklist,
          expectedUpdatedAt: intakeDialog.updated_at,
          subjectType: intakeDialog.subject_type,
        }
      );
      setActionLoading(null);
      if (!res.success) {
        if (['stale_intake', 'review_not_allowed'].includes(res.error)) {
          setIntakeDialog(null);
          loadData(true);
          alert('Анкета уже изменилась в другой вкладке. Мы загрузили актуальное состояние — откройте её снова.');
          return;
        }
        alert('Не удалось сохранить решение: ' + (res.message || res.error || 'ошибка'));
        return;
      }
      if (res.status === 'promoted' && res.pin) {
        setPinResult({
          clientId: res.client_id, subjectType: 'client',
          name: intakeDialog.clientName || 'Клиент', phone: intakeDialog.clientPhone || '', pin: res.pin,
          deepLink: null, intakeUrl: null, inviteStatus: 'client_created',
        });
      }
      setIntakeDialog(null);
      loadData(true);
      HEYS.Toast?.success?.(
        action === 'approved'
          ? 'Клиент создан'
          : 'Решение сохранено'
      );
    };

    const submitAnswerCorrection = async () => {
      if (!intakeDialog || !answerCorrection) return;
      const value = String(answerCorrection.value ?? '').trim();
      if (!value || !answerCorrection.communicationChannel || !answerCorrection.comment.trim()) {
        setCorrectionError('Укажите уточнённый ответ, канал общения и краткое основание.');
        return;
      }
      if (!answerCorrection.confirmedFromCandidate) {
        setCorrectionError('Подтвердите, что ответ уточнён со слов кандидата.');
        return;
      }
      if (answerCorrection.isSafety && !answerCorrection.safetyConfirmed) {
        setCorrectionError('Для ответа о здоровье или безопасности нужно отдельное подтверждение.');
        return;
      }
      const requestId = answerCorrection.requestId || createRequestId();
      setAnswerCorrection((current) => ({ ...current, requestId }));
      setCorrectionError('');
      setActionLoading('correction-' + intakeDialog.client_id);
      const res = await adminAPI.addCandidateAnswerCorrection(intakeDialog.client_id, {
        questionId: answerCorrection.questionId,
        newValue: JSON.stringify(value),
        communicationChannel: answerCorrection.communicationChannel,
        comment: answerCorrection.comment.trim(),
        confirmedFromCandidate: true,
        safetyConfirmed: answerCorrection.isSafety ? answerCorrection.safetyConfirmed : false,
        requestId,
        expectedUpdatedAt: intakeDialog.updated_at,
      });
      if (!res.success) {
        setActionLoading(null);
        if (['stale_intake', 'stale_correction'].includes(res.error)) {
          setCorrectionError('Анкета изменилась в другой вкладке. Закройте её и откройте снова.');
          return;
        }
        setCorrectionError('Не удалось сохранить уточнение: ' + (res.message || res.error || 'ошибка'));
        return;
      }
      const fresh = await adminAPI.getIntake(intakeDialog.client_id, intakeDialog.subject_type);
      setActionLoading(null);
      if (!fresh.success || !fresh.intake) {
        setIntakeDialog(null);
        loadData(true);
        alert('Уточнение сохранено, но анкету не удалось обновить. Откройте её снова.');
        return;
      }
      setIntakeDialog((current) => ({
        ...current,
        ...fresh.intake,
        client_id: current.client_id,
        subject_type: current.subject_type,
      }));
      setAnswerCorrection(null);
      setCorrectionError('');
      HEYS.Toast?.success?.('Уточнение сохранено');
    };

    const INTAKE_STATUS = {
      not_invited: ['Не приглашён', '#f3f4f6', '#4b5563'],
      invite_prepared: ['Приглашение подготовлено', '#eef2f7', '#46566b'],
      invite_sent: ['Приглашение отправлено', '#eaf2ff', '#245b91'],
      invited: ['Приглашение отправлено', '#eaf2ff', '#245b91'],
      in_progress: ['Заполняет', '#fff7dd', '#805d00'],
      completed: ['Готово к разбору', '#e9f7ed', '#25613a'],
      needs_clarification: ['Нужны уточнения', '#fff0e5', '#934b13'],
      approved: ['Одобрен', '#dcfce7', '#166534'],
      approved_waiting_slot: ['Одобрен, ждёт место', '#eef0ff', '#434587'],
      rejected: ['Отказ', '#fee2e2', '#991b1b'],
    };
    // Контракт «кнопка называет действие сама»: приписка «Действие куратора: …»
    // повторяла текст кнопки под собой. Остались только те строки, что
    // сообщают ожидание — их кнопкой не выразить, потому что делать нечего.
    const INTAKE_NEXT = {
      invite_sent: 'Ожидаем вход и заполнение кандидатом',
      in_progress: 'Ожидаем завершение анкеты кандидатом',
      needs_clarification: 'Ожидаем уточнение кандидата',
      approved_waiting_slot: 'Ожидаем свободное место',
      rejected: 'Решение завершено · удаление анкеты через 30 дней',
    };

    const ANSWER_LABELS = {
      goals: 'Цели и ожидания', experience: 'Предыдущий опыт', lifestyle: 'Ритм жизни',
      collaboration: 'Формат совместной работы', warning: 'Важная информация',
      primary_goal: 'Главная цель', success_definition: 'Критерий результата', time_expectations: 'Желаемый срок',
      previous_experience: 'Опыт', what_worked: 'Что работало', what_did_not_work: 'Что не подошло',
      schedule: 'Распорядок', sleep: 'Сон', activity: 'Активность', constraints: 'Что может мешать присылать данные',
      daily_tracking: 'Готовность присылать фото или сообщения', feedback_style: 'Формат обратной связи', expectations_from_curator: 'Ожидания от куратора',
      acknowledged_at: 'Подтверждение предупреждения', text_version: 'Версия текста предупреждения',
    };
    const DECISION_CHECKLIST_LABELS = {
      within_scope: 'Запрос находится в пределах услуг HEYS',
      understands_boundaries: 'Человек понимает, что HEYS не лечит',
      ready_to_track: 'Готов регулярно присылать данные в течение недели',
      realistic_expectations: 'Ожидания от результата и куратора реалистичны',
      safe_format: 'Клиент подтвердил предупреждение перед анкетой; формат сопровождения обсуждается на пробной неделе',
    };

    const ANSWER_VALUE_LABELS = {
      none: 'Начинает впервые', self: 'Самостоятельно', specialist: 'Со специалистом', both: 'Самостоятельно и со специалистом',
      mostly: 'Скорее да, но возможны пропуски',
      concise: 'Коротко и по делу', detailed: 'Подробно с объяснениями', gentle: 'Мягко и постепенно', direct: 'Прямо и требовательно',
    };
    const renderAnswerValue = (value, section, key) => {
      if (value === true) return 'Да';
      if (value === false) return 'Нет';
      if (value === 'yes') return 'Да';
      if (value === 'no') return 'Нет';
      if (value === 'prefer_not') return 'Предпочитает обсудить лично';
      if (value === 'unsure' && section === 'collaboration' && key === 'daily_tracking') return 'Пока не уверен';
      if (value === 'unsure') return 'Затрудняется ответить';
      return ANSWER_VALUE_LABELS[value] || String(value || '—');
    };

    const effectiveAnswers = intakeDialog?.answers || {};
    const originalAnswers = intakeDialog?.original_answers || effectiveAnswers;
    const intakeSummary = intakeDialog ? summarizeIntakeAnswers(effectiveAnswers) : null;
    const originalIntakeSummary = intakeDialog ? summarizeIntakeAnswers(originalAnswers) : null;
    const answerCorrections = Array.isArray(intakeDialog?.answer_corrections)
      ? intakeDialog.answer_corrections
      : [];
    const correctionsByQuestion = answerCorrections.reduce((result, correction) => {
      const questionId = correction.question_id;
      if (!questionId) return result;
      if (!result[questionId]) result[questionId] = [];
      result[questionId].push(correction);
      return result;
    }, {});
    const historicalSafetyFactors = (originalIntakeSummary?.safetyFactors || []).filter((originalFactor) => (
      !(intakeSummary?.safetyFactors || []).some((factor) => (
        factor.section === originalFactor.section && factor.key === originalFactor.key
      )) && correctionsByQuestion[`${originalFactor.section}.${originalFactor.key}`]?.length
    ));
    const revealAttentionAnswers = () => {
      const firstFactor = intakeSummary?.safetyFactors?.[0] || historicalSafetyFactors[0];
      if (!firstFactor) return;
      setAnswersDetailsOpen(true);
      global.setTimeout(() => {
        const target = global.document?.getElementById(firstFactor.anchorId);
        target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        target?.focus?.({ preventScroll: true });
      }, 0);
    };

    // Отклонить заявку (v2.0)
    const handleReject = async (item) => {
      const clientId = item.client_id;
      const clientName = item.client_name || item.name;
      const reason = prompt(`Отклонить заявку "${clientName}"?\nУкажите причину (опционально):`, '');
      if (reason === null) return; // Отмена

      if (!clientId) {
        alert('Ошибка: не найден клиент заявки');
        return;
      }

      setActionLoading(clientId);
      const res = await adminAPI.removeFromQueue(clientId, reason || 'rejected_by_curator');
      setActionLoading(null);

      if (res.success) {
        loadData(true);
        // 🔄 Hot-sync: статус клиента изменился (rejected) → обновить во всех вкладках.
        window.dispatchEvent(new CustomEvent('heys:clients-updated', {
          detail: { action: 'requestRejected', clientId }
        }));
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

    const isAccepting = stats?.limits?.is_accepting_trials ?? false;

    // Новые лиды доступны общей очереди, contacted — только назначенному куратору.
    const candidateItems = Object.values(intakeByClient).filter((item) => item.subject_type === 'candidate');
    const actionableLeads = filterActionableLeads(leads, curatorId, candidateItems);
    const rejectedLeads = leads.filter(l => l.status === 'rejected');
    const decisionStatuses = new Set(['approved', 'approved_waiting_slot', 'rejected']);
    const questionnaireQueue = [
      ...candidateItems.filter((item) => !decisionStatuses.has(item.status) && item.status !== 'promoted'),
      ...grouped.pending.filter((item) => !decisionStatuses.has(intakeByClient[item.client_id]?.status)),
    ];
    const decisionQueue = [
      ...candidateItems.filter((item) => decisionStatuses.has(item.status)),
      ...grouped.pending.filter((item) => decisionStatuses.has(intakeByClient[item.client_id]?.status)),
      ...grouped.rejected,
    ].filter((item, index, items) => (
      items.findIndex((candidate) => candidate.client_id === item.client_id) === index
    ));

    const getEffectiveSubscriptionStatus = (client) => {
      const statusRaw = client.subscription_status || 'none';
      const now = Date.now();
      const activeUntil = client.active_until ? new Date(client.active_until).getTime() : null;
      const trialEndsAt = client.trial_ends_at ? new Date(client.trial_ends_at).getTime() : null;
      const trialStartsAt = client.trial_started_at ? new Date(client.trial_started_at).getTime() : null;

      if (activeUntil && activeUntil > now) return 'active';
      if (statusRaw === 'trial_pending') return 'trial_pending';
      if (trialStartsAt && trialStartsAt > now) return 'trial_pending';
      if (trialEndsAt && trialEndsAt > now) return 'trial';

      return statusRaw || 'none';
    };

    // Клиенты с активным триалом, которые НЕ в trial_queue (старые триалы до введения очереди)
    const queueClientIds = new Set(queue.map(q => q.client_id));
    const trialClients = allClients.filter(c =>
      (getEffectiveSubscriptionStatus(c) === 'trial' || getEffectiveSubscriptionStatus(c) === 'trial_pending') &&
      !queueClientIds.has(c.id)
    );

    const tabs = [
      { id: 'new', label: 'Лиды', count: actionableLeads.length, hint: 'Новые и взятые в работу заявки — следующий шаг: подготовить анкету.' },
      { id: 'pending', label: 'Анкеты', count: questionnaireQueue.length, hint: 'Приглашения, заполнение, уточнения и анкеты к разбору.' },
      { id: 'rejected', label: 'Решения', count: rejectedLeads.length + decisionQueue.length, hint: 'Одобренные, ожидающие место и отклонённые кандидаты.' },
      { id: 'active', label: 'Триалы', count: grouped.assigned.length + trialClients.length, hint: 'Текущие и запланированные пробные недели.' }
    ];

    // Контракт «вид · пустые состояния кабинета»: те же карточки, что в
    // панели, и ярус со ссылками туда, где работа есть. Иллюстраций во весь
    // экран нет — и эмодзи вместо них тоже: 📭 и 💤 сообщали настроение, а не
    // состояние, и уводили от единственного вопроса пустого экрана — «куда
    // идти дальше».
    const QueueEmpty = ({ title, note, tabs, activeTab, setActiveTab }) => {
      const elsewhere = (tabs || []).filter((t) => t.id !== activeTab && t.count);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'cur-panel__empty' },
          React.createElement('div', { className: 'cur-panel__empty-title' }, title),
          React.createElement('div', { className: 'cur-panel__empty-note' }, note)
        ),
        elsewhere.length ? React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'cur-group__title' }, 'Где сейчас работа'),
          React.createElement('div', { className: 'cur-group__card' },
            elsewhere.map((t) => React.createElement('button', {
              key: t.id,
              type: 'button',
              className: 'cur-row cur-row--line',
              onClick: () => setActiveTab(t.id)
            },
              React.createElement('span', { className: 'cur-row__line' }, t.label),
              React.createElement('span', { className: 'cur-row__count' }, String(t.count))
            ))
          )
        ) : null
      );
    };

    const LeadRow = ({ item }) => React.createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 12,
        background: '#fff',
        border: '1px solid var(--border, #e5e7eb)',
        transition: 'box-shadow 0.2s',
        flexWrap: 'wrap'
      },
      onMouseEnter: (e) => { e.currentTarget.style.boxShadow = '0 6px 16px -8px rgba(0,0,0,0.25)'; },
      onMouseLeave: (e) => { e.currentTarget.style.boxShadow = 'none'; }
    },
      React.createElement('div', { style: { display: 'flex', gap: 12, flex: '1 1 200px', alignItems: 'center' } },
        React.createElement('div', {
          style: {
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: item.messenger === 'telegram' ? '#0088cc'
              : item.messenger === 'whatsapp' ? '#25d366'
                : item.messenger === 'max' ? '#8b5cf6' : '#9ca3af',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0
          }
        }, item.messenger === 'telegram' ? '📱' : item.messenger === 'whatsapp' ? '💬' : item.messenger === 'max' ? '🟣' : '👤'),
        React.createElement('div', { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', {
            style: {
              fontWeight: 700,
              fontSize: 15,
              color: 'var(--text, #111827)',
              lineHeight: 1.3,
              wordBreak: 'break-word'
            }
          },
            item.name || '—',
            item.status === 'contacted' && React.createElement('span', {
              style: {
                display: 'inline-block',
                marginLeft: 8,
                padding: '2px 6px',
                borderRadius: 5,
                background: '#fef3c7',
                color: '#92400e',
                fontSize: 10,
                fontWeight: 700,
                verticalAlign: 'middle'
              }
            }, 'В работе')
          ),
          React.createElement('div', {
            style: {
              fontSize: 13,
              color: '#6b7280',
              fontFamily: 'monospace',
              lineHeight: 1.3,
              marginTop: 4
            }
          }, item.phone || '—'),
          React.createElement('div', {
            style: {
              fontSize: 11,
              color: '#9ca3af',
              marginTop: 6,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6
            }
          },
            React.createElement('span', null, formatDate(item.created_at)),
            item.utm_source && React.createElement('span', { style: { opacity: 0.5 } }, '|'),
            item.utm_source && React.createElement('span', {
              style: {
                background: '#f3f4f6',
                color: '#4b5563',
                padding: '2px 6px',
                borderRadius: 4,
                wordBreak: 'break-all'
              }
            }, item.utm_source),
            item.intent === 'direct_purchase' && React.createElement('span', {
              style: {
                background: '#fee2e2',
                color: '#dc2626',
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 'bold',
                marginLeft: 'auto'
              }
            }, '🔥 КУПИЛ')
          )
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto', alignItems: 'center', alignSelf: 'center' } },
        React.createElement('button', {
          onClick: () => handleConvertLead(item),
          disabled: actionLoading === 'lead-' + item.id || actionLoading === 'lead-reject-' + item.id,
          style: {
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: (actionLoading === 'lead-' + item.id || actionLoading === 'lead-reject-' + item.id)
              ? '#d1d5db'
              : '#434587',
            color: '#fff',
            cursor: (actionLoading === 'lead-' + item.id || actionLoading === 'lead-reject-' + item.id) ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }
        }, actionLoading === 'lead-' + item.id ? 'Создаём…' : 'Создать приглашение'),
        React.createElement('button', {
          onClick: () => handleRejectLead(item),
          disabled: actionLoading === 'lead-' + item.id || actionLoading === 'lead-reject-' + item.id,
          style: {
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#dc2626',
            cursor: (actionLoading === 'lead-' + item.id || actionLoading === 'lead-reject-' + item.id) ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600
          }
        }, actionLoading === 'lead-reject-' + item.id ? '⏳' : '❌')
      )
    );

    const ClientRow = ({ item, allowActions, allowRemove = false }) => {
      const intake = intakeByClient[item.client_id] || null;
      const intakeVisual = intake ? (INTAKE_STATUS[intake.status] || [intake.status, '#f3f4f6', '#4b5563']) : null;
      const statusColor = item.status === 'assigned'
        ? { bg: '#dcfce7', text: '#16a34a', label: 'Активен' }
        : item.status === 'rejected' || item.status === 'expired'
          ? { bg: '#fee2e2', text: '#dc2626', label: 'Отклонён' }
          : { bg: '#fef9c3', text: '#ca8a04', label: 'Ожидает' };

      return React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 12,
          background: '#fff',
          border: '1px solid var(--border, #e5e7eb)',
          transition: 'box-shadow 0.2s',
          flexWrap: 'wrap'
        },
        onMouseEnter: (e) => { e.currentTarget.style.boxShadow = '0 6px 16px -8px rgba(0,0,0,0.25)'; },
        onMouseLeave: (e) => { e.currentTarget.style.boxShadow = 'none'; }
      },
        React.createElement('div', { style: { display: 'flex', gap: 12, flex: '1 1 200px', alignItems: 'center' } },
          React.createElement('div', {
            style: {
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 700,
              flexShrink: 0
            }
          }, (item.client_name || item.name || '?')[0].toUpperCase()),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', {
              style: {
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--text, #111827)',
                lineHeight: 1.3,
                wordBreak: 'break-word'
              }
            }, item.client_name || item.name || '—'),
            React.createElement('div', {
              style: {
                fontSize: 13,
                color: '#6b7280',
                fontFamily: 'monospace',
                lineHeight: 1.3,
                marginTop: 4
              }
            }, item.client_phone || item.phone_normalized || '—'),
            React.createElement('div', {
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 6,
                background: statusColor.bg,
                color: statusColor.text,
                fontSize: 11,
                fontWeight: 700,
                marginTop: 6
              }
            }, statusColor.label),
            intakeVisual && React.createElement('div', {
              style: {
                display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6,
                background: intakeVisual[1], color: intakeVisual[2], fontSize: 11,
                fontWeight: 700, marginTop: 6, marginLeft: 6,
              }
            }, `Анкета: ${intakeVisual[0]}`)
            ,
            intake && React.createElement('div', {
              style: { marginTop: 7, fontSize: 11, color: '#7b8794', lineHeight: 1.35 }
            },
              `Обновлено: ${formatDate(intake.updated_at)}`,
              Number(intake.inactive_days) > 0 ? ` · без активности ${intake.inactive_days} дн.` : ''
            ),
            intake && React.createElement('div', {
              style: {
                marginTop: 5, fontSize: 12, lineHeight: 1.35,
                color: Number(intake.inactive_days) >= 7 ? '#9a4d12' : '#4f5d55',
                fontWeight: 650,
              }
            }, INTAKE_NEXT[intake.status] || 'Проверьте текущий этап')
          )
        ),
        allowActions && React.createElement('div', { style: { display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto', alignItems: 'center', alignSelf: 'center' } },
          intake && ['invite_prepared', 'invited', 'invite_sent'].includes(intake.status) && React.createElement('button', {
            onClick: () => resumePreparedInvite(item, intake.status),
            disabled: actionLoading === 'invite-' + item.client_id,
            style: {
              minHeight: 44, padding: '10px 12px', borderRadius: 10, border: 'none',
              background: actionLoading === 'invite-' + item.client_id ? '#d1d5db' : '#434587',
              color: '#fff', cursor: actionLoading === 'invite-' + item.client_id ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: 700,
            }
          }, actionLoading === 'invite-' + item.client_id
            ? 'Восстановление…'
            : intake.status === 'invite_sent' ? 'Перевыпустить доступ' : 'Открыть приглашение'),
          intake && ['completed', 'needs_clarification', 'approved', 'approved_waiting_slot', 'rejected'].includes(intake.status) && React.createElement('button', {
            onClick: () => openIntake(item),
            disabled: actionLoading === 'intake-' + item.client_id,
            style: {
              padding: '8px 11px', borderRadius: 8, border: '1px solid #bfdbfe',
              background: '#eff6ff', color: '#1d4f83', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }
          }, actionLoading === 'intake-' + item.client_id ? 'Загрузка…' : 'Открыть анкету'),
          intakesReady && !intake && React.createElement('button', {
            onClick: () => handleReject(item),
            disabled: actionLoading === item.client_id,
            style: {
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#dc2626',
              cursor: actionLoading === item.client_id ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 700
            }
          }, '❌'),
          allowRemove && !intake && React.createElement('button', {
            onClick: () => handleRemove(item),
            disabled: actionLoading === item.client_id,
            style: {
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #fecaca',
              background: '#fff7f7',
              color: '#dc2626',
              cursor: actionLoading === item.client_id ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 700
            }
          }, '🗑️')
        )
      );
    };

    return React.createElement('div', {
      style: {
        height: '75vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc'
      }
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb'
        }
      },
        React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#6b7280' }
        },
          React.createElement('span', null, isAccepting ? '🟢 Очередь открыта' : '🔴 Очередь закрыта'),
          React.createElement('span', null, `Слотов: ${grouped.assigned.length}/${stats?.limits?.max_active_trials || 3}`)
        ),
        React.createElement('button', {
          onClick: handleToggleAccepting,
          disabled: toggleLoading || !stats,
          style: {
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            cursor: toggleLoading ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600
          }
        }, toggleLoading ? '⏳' : isAccepting ? 'Закрыть' : 'Открыть')
      ),
      // Контракт «вид · подвкладки очереди»: чипы со счётом через точку, а не
      // сегмент с числом в скобках. Те же чипы, что у фильтра панели — один
      // приём на кабинет. Пустая подвкладка притушена, но не скрыта: её
      // исчезновение перестраивало бы ряд под руками куратора.
      React.createElement('div', { className: 'cur-cab__subtabs' },
        tabs.map((tab) => React.createElement('button', {
          key: tab.id,
          type: 'button',
          className: 'cur-chip'
            + (activeTab === tab.id ? ' is-on' : '')
            + (tab.count ? '' : ' is-muted'),
          onClick: () => setActiveTab(tab.id),
          title: tab.hint
        }, tab.label.toLowerCase() + ' · ' + tab.count))
      ),
      React.createElement('div', {
        style: {
          padding: '10px 16px',
          background: '#f0f9ff',
          borderBottom: '1px solid #bfdbfe',
          fontSize: 12,
          color: '#1e40af',
          lineHeight: 1.5
        }
      }, tabs.find(t => t.id === activeTab)?.hint || ''),
      React.createElement('div', {
        style: {
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }
      },
        loading && React.createElement('div', {
          style: { textAlign: 'center', padding: '40px', color: '#9ca3af' }
        }, '⏳ Загрузка...'),
        !loading && error && React.createElement('div', {
          style: { padding: '12px 16px', background: '#fee2e2', color: '#b91c1c', borderRadius: 10, fontSize: 13 }
        },
          React.createElement('div', null, '❌ ' + error),
          React.createElement('button', {
            type: 'button', onClick: () => loadData(false),
            style: { marginTop: 10, minHeight: 40, padding: '8px 12px', borderRadius: 8, border: '1px solid #efb4b4', background: '#fff', color: '#8f1d1d', cursor: 'pointer', fontWeight: 700 },
          }, 'Повторить загрузку')
        ),
        !loading && !error && activeTab === 'new' && (actionableLeads.length ? actionableLeads.map(item => React.createElement(LeadRow, { key: item.id, item })) : React.createElement(QueueEmpty, {
          title: 'Заявок в работе нет',
          note: 'Новые придут сами — с квиза и из мессенджеров. Здесь они появятся с шагом «подготовить анкету».',
          tabs, activeTab, setActiveTab
        })),
        !loading && !error && activeTab === 'pending' && (questionnaireQueue.length ? questionnaireQueue.map(item => React.createElement(ClientRow, { key: item.client_id || item.queue_id, item, allowActions: true, allowRemove: false })) : React.createElement(QueueEmpty, {
          title: 'Анкет к разбору нет',
          note: 'Приглашения отправлены, ответов пока не пришло. Как только анкета заполнится, она встанет сюда.',
          tabs, activeTab, setActiveTab
        })),
        !loading && !error && activeTab === 'active' && ((grouped.assigned.length + trialClients.length) ? [
          ...grouped.assigned.map(item => React.createElement(ClientRow, { key: item.client_id || item.queue_id, item })),
          ...trialClients.map(client => React.createElement(ClientRow, {
            key: 'trial-' + client.id, // Уникальный ключ
            item: {
              client_id: client.id,
              client_name: client.name || client.phone || '?', // Имя или телефон если имени нет
              client_phone: client.phone || '—',
              status: 'assigned', // Визуально как активный
              created_at: client.created_at
            }
          }))
        ] : React.createElement(QueueEmpty, {
          title: 'Активных триалов нет',
          note: 'Пробные недели заканчиваются и начинаются здесь. Пока идти некуда — работа в соседних подвкладках.',
          tabs, activeTab, setActiveTab
        })),
        !loading && !error && activeTab === 'rejected' && (
          (rejectedLeads.length || decisionQueue.length) ? [
            ...rejectedLeads.map(item => React.createElement(LeadRow, { key: 'lead-' + item.id, item })),
            ...decisionQueue.map(item => React.createElement(ClientRow, { key: item.client_id || item.queue_id, item, allowActions: true }))
          ] : React.createElement(QueueEmpty, {
            title: 'Решений пока нет',
            note: 'Одобренные, ожидающие место и отклонённые кандидаты собираются здесь после разбора анкеты.',
            tabs, activeTab, setActiveTab
          })
        )
      ),
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '10px 16px',
          background: '#fff',
          borderTop: '1px solid #e5e7eb'
        }
      },
        React.createElement('button', {
          onClick: () => loadData(false),
          disabled: loading,
          style: {
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600
          }
        }, loading ? '⏳' : '🔄 Обновить')
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
          }, 'Подготовить приглашение'),
          React.createElement('div', {
            style: { fontSize: '14px', color: '#6b7280', marginBottom: '4px' }
          }, `Имя: ${convertDialog.leadName}`),
          React.createElement('div', {
            style: { fontSize: '14px', color: '#6b7280', marginBottom: '16px' }
          }, `Телефон: ${convertDialog.leadPhone}`),
          React.createElement('div', {
            style: {
              fontSize: '13px',
              color: '#374151',
              background: '#f3f4f6',
              padding: '10px 12px',
              borderRadius: '8px',
              marginBottom: '20px',
              lineHeight: 1.5,
            }
          },
            'Сначала свяжитесь с человеком в выбранном мессенджере и убедитесь, что формат понятен. Затем будет создан клиент без активной пробной недели, PIN и универсальная ссылка на защищённую анкету.'
          ),
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
              style: {
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: '#434587',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }
            }, 'Создать приглашение')
          )
        )
      ),

      // ========== ДИАЛОГ: PIN сгенерирован (P0.7) ==========
      pinResult && React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        },
        onClick: (e) => { if (e.target === e.currentTarget) setPinResult(null); }
      },
        React.createElement('div', {
          style: {
            background: 'var(--card, #fff)',
            borderRadius: '16px',
            padding: '24px',
            width: '420px',
            maxWidth: '92vw',
            maxHeight: '88vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
          }
        },
          React.createElement('div', {
            style: { fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--text, #1f2937)' }
          }, pinResult.intakeUrl ? 'Приглашение готово' : '✅ Клиент создан'),
          React.createElement('div', {
            style: { fontSize: '13px', color: '#6b7280', marginBottom: '20px' }
          }, `${pinResult.name} · ${pinResult.phone}`),

          pinResult.pin && pinResult.intakeUrl && React.createElement(React.Fragment, null,
            React.createElement('div', {
              style: { fontSize: '12px', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: 0 }
            }, 'Сообщение клиенту'),
            React.createElement('div', {
              style: {
                fontSize: '12px',
                padding: '12px',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                color: '#334155',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.45,
                maxHeight: '190px',
                overflowY: 'auto',
                marginBottom: '8px'
              }
            }, buildIntakeInviteForAccess(pinResult)),
            React.createElement('button', {
              onClick: () => copyToClipboard(buildIntakeInviteForAccess(pinResult), 'Приглашение скопировано'),
              style: {
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                marginBottom: '8px'
              }
            }, 'Скопировать приглашение'),
            React.createElement('button', {
              onClick: async () => {
                const result = await adminAPI.markInviteSent(pinResult.clientId, pinResult.subjectType);
                if (!result.success) {
                  alert('Не удалось отметить отправку: ' + (result.message || result.error || 'ошибка'));
                  return;
                }
                setPinResult((current) => current ? { ...current, inviteStatus: 'invite_sent' } : current);
                loadData(true);
                HEYS.Toast?.success?.('Отправка приглашения отмечена');
              },
              disabled: pinResult.inviteStatus === 'invite_sent',
              style: {
                width: '100%',
                padding: '11px',
                borderRadius: '10px',
                border: 'none',
                background: pinResult.inviteStatus === 'invite_sent' ? '#d8dfdc' : '#434587',
                color: '#fff',
                cursor: pinResult.inviteStatus === 'invite_sent' ? 'default' : 'pointer',
                fontSize: '13px',
                fontWeight: 700,
                marginBottom: '18px'
              }
            }, pinResult.inviteStatus === 'invite_sent' ? 'Отправка отмечена' : 'Отметить как отправленное')
          ),

          React.createElement('div', {
            style: { fontSize: '12px', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }
          }, 'PIN'),
          React.createElement('div', {
            style: {
              fontSize: '32px',
              fontWeight: 700,
              letterSpacing: '12px',
              textAlign: 'center',
              padding: '14px',
              background: '#f3f4f6',
              borderRadius: '12px',
              fontFamily: 'monospace',
              marginBottom: '8px'
            }
          }, pinResult.pin),
          React.createElement('button', {
            onClick: () => {
              copyToClipboard(pinResult.pin, 'PIN скопирован');
            },
            style: {
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '20px'
            }
          }, '📋 Скопировать PIN'),

          pinResult.deepLink && React.createElement(React.Fragment, null,
            React.createElement('div', {
              style: { fontSize: '12px', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }
            }, 'Ссылка для клиента (Telegram-бот)'),
            React.createElement('div', {
              style: {
                fontSize: '11px',
                padding: '10px 12px',
                background: '#f3f4f6',
                borderRadius: '8px',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                marginBottom: '8px',
                color: '#374151'
              }
            }, pinResult.deepLink),
            React.createElement('div', {
              style: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '20px' }
            },
              React.createElement('button', {
                onClick: () => {
                  copyToClipboard(pinResult.deepLink, 'Ссылка скопирована');
                },
                style: {
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600
                }
              }, '📋 Копировать ссылку'),
              pinResult.clientId && React.createElement('button', {
                onClick: async () => {
                  if (!confirm('Сбросить Telegram-привязку? Используйте это, если ссылку случайно открыл не клиент. После сброса клиент сможет открыть эту же ссылку повторно.')) return;
                  const res = await adminAPI.clearTelegramBinding(pinResult.clientId);
                  if (res.success) {
                    HEYS.Toast?.success?.('Telegram-привязка сброшена');
                  } else {
                    alert('Ошибка: ' + (res.message || res.error || 'Не удалось сбросить Telegram-привязку'));
                  }
                },
                style: {
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #fca5a5',
                  background: '#fff',
                  color: '#b91c1c',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }
              }, 'Сбросить Telegram-привязку')
            )
          ),

          React.createElement('div', {
            style: { fontSize: '12px', color: '#6b7280', marginBottom: '16px', lineHeight: 1.5 }
          },
            pinResult.intakeUrl
              ? 'Передайте приглашение в удобном клиенту мессенджере. Сама ссылка не содержит персональных данных; доступ к анкете появится только после входа.'
              : 'Передайте PIN и ссылку клиенту в его мессенджере. Ссылка для привязки Telegram действует 7 дней.'
          ),

          React.createElement('button', {
            onClick: () => setPinResult(null),
            style: {
              width: '100%',
              padding: '11px',
              borderRadius: '8px',
              border: 'none',
              background: '#1f2937',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600
            }
          }, 'Готово')
        )
      ),

      // ========== ДИАЛОГ: защищённая анкета кандидата ==========
      intakeDialog && React.createElement('div', {
        style: {
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.58)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10002, padding: 16,
        },
        onClick: (e) => { if (e.target === e.currentTarget) setIntakeDialog(null); }
      }, React.createElement('div', {
        style: {
          width: 720, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto',
          background: '#fff', borderRadius: 18, padding: 24,
          boxShadow: '0 24px 70px rgba(0,0,0,.3)',
        }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 } },
          React.createElement('div', null,
            React.createElement('div', { style: { fontSize: 20, fontWeight: 750, color: '#17202a' } }, intakeDialog.clientName),
            React.createElement('div', { style: { fontSize: 13, color: '#64748b', marginTop: 4 } },
              `Анкета v${intakeDialog.schema_version || '1.0'} · ${INTAKE_STATUS[intakeDialog.status]?.[0] || intakeDialog.status}`)
          ),
          React.createElement('button', { type: 'button', onClick: () => setIntakeDialog(null), style: { border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#64748b' } }, '×')
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 } },
          React.createElement('section', { style: { border: '1px solid #dbe4de', borderRadius: 12, padding: 13, background: '#f8fbf8' } },
            React.createElement('div', { style: { fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 } }, 'Главная цель'),
            React.createElement('div', { style: { fontSize: 14, lineHeight: 1.45, color: '#213128' } }, intakeSummary?.goal)
          ),
          React.createElement('section', {
            role: 'status',
            style: {
              border: `1px solid ${(intakeSummary?.safetyFactors.length || historicalSafetyFactors.length) ? '#efc36f' : '#cfe3d3'}`,
              borderRadius: 12, padding: 13,
              background: (intakeSummary?.safetyFactors.length || historicalSafetyFactors.length) ? '#fff8e8' : '#f2faf4',
            }
          },
            React.createElement('div', { style: { fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 } }, 'Факторы безопасности'),
            intakeSummary?.safetyFactors.length
              ? React.createElement(React.Fragment, null,
                React.createElement('div', { style: { marginBottom: 7, color: '#724b05', fontSize: 13, fontWeight: 700 } },
                  `Ответы, требующие внимания: ${intakeSummary.safetyFactors.length}`),
                React.createElement('ul', { style: { margin: 0, paddingLeft: 18, color: '#724b05', fontSize: 13, lineHeight: 1.45 } },
                  intakeSummary.safetyFactors.map((factor) => React.createElement('li', { key: `${factor.section}-${factor.key}`, style: { marginBottom: 4 } },
                    `${factor.label} · ${factor.statusLabel}`))),
                historicalSafetyFactors.length ? React.createElement('div', {
                  style: { marginTop: 8, color: '#724b05', fontSize: 12, lineHeight: 1.45 },
                }, `Исходные safety-ответы изменены после общения: ${historicalSafetyFactors.length}`) : null,
                React.createElement('button', {
                  type: 'button', onClick: revealAttentionAnswers,
                  style: {
                    minHeight: 44, marginTop: 9, padding: '8px 11px', borderRadius: 9,
                    border: '1px solid #d8a84e', background: '#fff', color: '#724b05',
                    cursor: 'pointer', fontWeight: 700,
                  },
                }, 'Показать в ответах')
              )
              : historicalSafetyFactors.length
                ? React.createElement(React.Fragment, null,
                  React.createElement('div', { style: { color: '#724b05', fontSize: 13, lineHeight: 1.45 } },
                    `Текущие ответы уточнены. Исходные safety-сигналы сохранены: ${historicalSafetyFactors.length}.`),
                  React.createElement('button', {
                    type: 'button', onClick: revealAttentionAnswers,
                    style: {
                      minHeight: 44, marginTop: 9, padding: '8px 11px', borderRadius: 9,
                      border: '1px solid #d8a84e', background: '#fff', color: '#724b05',
                      cursor: 'pointer', fontWeight: 700,
                    },
                  }, 'Показать историю')
                )
              : React.createElement('div', { style: { fontSize: 14, color: '#27613b' } }, 'Факторов, требующих отдельного уточнения, не отмечено.')
          )
        ),
        React.createElement('details', {
          open: answersDetailsOpen,
          onToggle: (event) => setAnswersDetailsOpen(event.currentTarget.open),
          style: { border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }
        },
          React.createElement('summary', { style: { cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#334155' } }, 'Все ответы анкеты'),
          React.createElement('div', { style: { display: 'grid', gap: 14, marginTop: 14 } },
            Object.entries(effectiveAnswers).filter(([section, values]) => section !== 'meta' && values && typeof values === 'object').map(([section, values]) =>
              React.createElement('section', { key: section, style: { border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 } },
                React.createElement('h3', { style: { margin: '0 0 10px', fontSize: 15, color: '#27362d' } }, ANSWER_LABELS[section] || section),
                React.createElement('div', { style: { display: 'grid', gap: 9 } },
                  Object.entries(values).filter(([key, value]) => (
                    (value !== '' && value != null)
                    || correctionsByQuestion[`${section}.${key}`]?.length
                    || (originalAnswers?.[section]?.[key] !== '' && originalAnswers?.[section]?.[key] != null)
                  )).map(([key, value]) => {
                    const questionId = `${section}.${key}`;
                    const correctionHistory = correctionsByQuestion[questionId] || [];
                    const originalValue = originalAnswers?.[section]?.[key];
                    const attention = getIntakeAnswerAttention(effectiveAnswers, section, key);
                    const originalAttention = getIntakeAnswerAttention(originalAnswers, section, key);
                    const isCorrected = correctionHistory.length > 0;
                    const fieldMeta = HEYS.TrialIntake?.CURATOR_ANSWER_FIELDS?.[questionId];
                    const correctionOpen = answerCorrection?.questionId === questionId;
                    const answerLabel = section === 'experience' && key === 'what_did_not_work' && values.previous_experience === 'none'
                      ? 'Что кажется самым сложным'
                      : ANSWER_LABELS[key] || key.replaceAll('_', ' ');
                    return React.createElement('div', {
                      key,
                      id: `trial-intake-answer-${section}-${key}`,
                      tabIndex: attention ? -1 : undefined,
                      style: {
                        display: 'grid', gap: 5, borderRadius: 9, outline: 'none',
                        ...(attention || (originalAttention && isCorrected)
                          ? { background: '#fff7e8', border: '1px solid #efc36f', padding: '8px 9px' }
                          : {}),
                      },
                    },
                      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' } },
                        React.createElement('div', { style: { fontSize: 11, color: attention ? '#7a4b00' : '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em' } }, answerLabel),
                        attention || (originalAttention && isCorrected) ? React.createElement('span', {
                          style: {
                            padding: '3px 7px', borderRadius: 7, background: '#fff0c7',
                            color: '#7a4b00', fontSize: 11, fontWeight: 750,
                          }
                        }, attention?.statusLabel || 'Исходный safety-ответ изменён') : null
                      ),
                      React.createElement('div', {
                        style: {
                          fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: '#1f2937',
                          ...(attention ? { color: '#7a4b00', fontWeight: 650 } : {}),
                        }
                      }, renderAnswerValue(value, section, key)),
                      isCorrected ? React.createElement('div', {
                        style: { display: 'grid', gap: 5, marginTop: 4, paddingTop: 7, borderTop: '1px solid #ead9b3' },
                      },
                        React.createElement('div', { style: { fontSize: 12, color: '#64748b' } },
                          `Ответ кандидата: ${renderAnswerValue(originalValue, section, key)}`),
                        React.createElement('details', null,
                          React.createElement('summary', { style: { cursor: 'pointer', fontSize: 12, color: '#434587', fontWeight: 700 } },
                            `История уточнений: ${correctionHistory.length}`),
                          React.createElement('div', { style: { display: 'grid', gap: 8, marginTop: 8 } },
                            correctionHistory.map((correction) => React.createElement('div', {
                              key: correction.id || correction.revision_no,
                              style: { padding: 9, borderRadius: 9, background: '#f8fafc', fontSize: 12, lineHeight: 1.45, color: '#475569' },
                            },
                              React.createElement('div', { style: { fontWeight: 700, color: '#334155' } },
                                `Уточнение ${correction.revision_no || ''} · ${new Date(correction.created_at).toLocaleString('ru-RU')}`),
                              React.createElement('div', null, `Канал: ${{ messenger: 'Мессенджер', phone: 'Телефон', video_call: 'Видеозвонок', other: 'Другое' }[correction.communication_channel] || correction.communication_channel || '—'}`),
                              React.createElement('div', null, `Основание: ${correction.comment || '—'}`)
                            ))
                          )
                        )
                      ) : null,
                      intakeDialog.subject_type === 'candidate'
                        && ['completed', 'needs_clarification', 'approved_waiting_slot'].includes(intakeDialog.status)
                        && fieldMeta
                        ? React.createElement('button', {
                          type: 'button',
                          onClick: () => {
                            setCorrectionError('');
                            setAnswerCorrection({
                              questionId, value: String(value ?? ''), communicationChannel: '', comment: '',
                              confirmedFromCandidate: false, safetyConfirmed: false,
                              isSafety: ['health', 'safety'].includes(section), requestId: null,
                            });
                          },
                          style: {
                            justifySelf: 'start', minHeight: 40, padding: '7px 10px', borderRadius: 9,
                            border: '1px solid #cbd5e1', background: '#fff', color: '#434587',
                            cursor: 'pointer', fontWeight: 700, fontSize: 12,
                          },
                        }, isCorrected ? 'Добавить уточнение' : 'Уточнить ответ')
                        : null,
                      correctionOpen ? React.createElement('section', {
                        style: { display: 'grid', gap: 10, marginTop: 6, padding: 12, borderRadius: 10, background: '#f5f5fb', border: '1px solid #d9daee' },
                      },
                        React.createElement('div', { style: { fontSize: 13, fontWeight: 750, color: '#30325f' } }, 'Уточнение со слов кандидата'),
                        fieldMeta.type === 'select'
                          ? React.createElement('select', {
                            value: answerCorrection.value,
                            onChange: (event) => setAnswerCorrection((current) => ({ ...current, value: event.target.value, requestId: null })),
                            style: { minHeight: 44, padding: 10, borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', font: 'inherit' },
                          }, fieldMeta.options.map(([optionValue, optionLabel]) => React.createElement('option', { key: optionValue, value: optionValue }, optionLabel)))
                          : React.createElement('textarea', {
                            value: answerCorrection.value,
                            onChange: (event) => setAnswerCorrection((current) => ({ ...current, value: event.target.value.slice(0, 4000), requestId: null })),
                            style: { minHeight: 76, padding: 10, borderRadius: 9, border: '1px solid #cbd5e1', resize: 'vertical', font: 'inherit' },
                          }),
                        React.createElement('label', { style: { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 } },
                          'Канал общения',
                          React.createElement('select', {
                            value: answerCorrection.communicationChannel,
                            onChange: (event) => setAnswerCorrection((current) => ({ ...current, communicationChannel: event.target.value, requestId: null })),
                            style: { minHeight: 42, padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', font: 'inherit' },
                          },
                            React.createElement('option', { value: '' }, 'Выберите'),
                            React.createElement('option', { value: 'messenger' }, 'Мессенджер'),
                            React.createElement('option', { value: 'phone' }, 'Телефон'),
                            React.createElement('option', { value: 'video_call' }, 'Видеозвонок'),
                            React.createElement('option', { value: 'other' }, 'Другое')
                          )
                        ),
                        React.createElement('label', { style: { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700 } },
                          'Краткое основание',
                          React.createElement('textarea', {
                            value: answerCorrection.comment,
                            onChange: (event) => setAnswerCorrection((current) => ({ ...current, comment: event.target.value.slice(0, 1000), requestId: null })),
                            placeholder: 'Что именно уточнил кандидат',
                            style: { minHeight: 64, padding: 9, borderRadius: 9, border: '1px solid #cbd5e1', resize: 'vertical', font: 'inherit' },
                          })
                        ),
                        React.createElement('label', { style: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.4 } },
                          React.createElement('input', {
                            type: 'checkbox', checked: answerCorrection.confirmedFromCandidate,
                            onChange: (event) => setAnswerCorrection((current) => ({ ...current, confirmedFromCandidate: event.target.checked, requestId: null })),
                            style: { marginTop: 2, accentColor: '#434587' },
                          }),
                          'Ответ уточнён со слов кандидата'
                        ),
                        answerCorrection.isSafety ? React.createElement('label', { style: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.4, color: '#724b05' } },
                          React.createElement('input', {
                            type: 'checkbox', checked: answerCorrection.safetyConfirmed,
                            onChange: (event) => setAnswerCorrection((current) => ({ ...current, safetyConfirmed: event.target.checked, requestId: null })),
                            style: { marginTop: 2, accentColor: '#b7791f' },
                          }),
                          'Фактор здоровья или безопасности обсуждён отдельно'
                        ) : null,
                        correctionError ? React.createElement('div', { role: 'alert', style: { color: '#b42318', fontSize: 12 } }, correctionError) : null,
                        React.createElement('div', { style: { display: 'flex', gap: 8 } },
                          React.createElement('button', {
                            type: 'button', onClick: () => { setAnswerCorrection(null); setCorrectionError(''); },
                            style: { minHeight: 42, padding: '8px 11px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 700 },
                          }, 'Отмена'),
                          React.createElement('button', {
                            type: 'button', onClick: submitAnswerCorrection,
                            disabled: actionLoading === 'correction-' + intakeDialog.client_id,
                            style: { flex: 1, minHeight: 42, padding: '8px 11px', borderRadius: 9, border: 0, background: '#434587', color: '#fff', cursor: 'pointer', fontWeight: 700 },
                          }, actionLoading === 'correction-' + intakeDialog.client_id ? 'Сохраняем…' : 'Сохранить уточнение')
                        )
                      ) : null
                    );
                  })
                )
              )
            )
          )
        ),
        ['completed', 'needs_clarification'].includes(intakeDialog.status) && React.createElement('div', {
          style: { marginTop: 20, paddingTop: 18, borderTop: '1px solid #e2e8f0' }
        },
          !decisionSheetOpen
            ? React.createElement('button', {
              type: 'button',
              onClick: () => setDecisionSheetOpen(true),
              style: {
                width: '100%', minHeight: 46, padding: '11px 16px',
                border: 0, borderRadius: 12, background: '#434587',
                color: '#fff', fontWeight: 700, cursor: 'pointer',
              }
            }, 'Зафиксировать решение')
            : React.createElement('section', {
              style: {
                display: 'grid', gap: 14, padding: 16,
                border: '1px solid #dfe3ec', borderRadius: 14,
                background: '#fafbfc',
              }
            },
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: 16, fontWeight: 750, color: '#25332a' } }, 'Решение по анкете'),
                React.createElement('div', { style: { marginTop: 4, fontSize: 13, color: '#64748b', lineHeight: 1.45 } },
                  'Выберите итог. Система ничего не решает автоматически.')
              ),
              React.createElement('label', { style: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 } },
                'Действие',
                React.createElement('select', {
                  value: reviewAction,
                  onChange: (e) => setReviewAction(e.target.value),
                  style: { minHeight: 44, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', font: 'inherit' },
                },
                  React.createElement('option', { value: 'approved' }, 'Одобрить и создать клиента'),
                  React.createElement('option', { value: 'rejected' }, 'Отказать в текущем формате')
                )
              ),
              ['approved', 'rejected'].includes(reviewAction)
                ? React.createElement('fieldset', {
                  style: { display: 'grid', gap: 9, margin: 0, padding: 0, border: 0 }
                },
                  React.createElement('legend', { style: { fontSize: 13, fontWeight: 700, marginBottom: 7 } }, 'Чек-лист куратора'),
                  Object.entries(DECISION_CHECKLIST_LABELS).map(([key, label]) => (
                    React.createElement('label', {
                      key,
                      style: {
                        display: 'grid', gridTemplateColumns: '1fr minmax(112px, auto)',
                        alignItems: 'center', gap: 10,
                        fontSize: 13, lineHeight: 1.4, color: '#334155',
                      },
                    },
                      React.createElement('span', null, label),
                      React.createElement('select', {
                        value: decisionChecklist[key] == null
                          ? ''
                          : decisionChecklist[key] ? 'yes' : 'no',
                        onChange: (e) => setDecisionChecklist((current) => ({
                          ...current,
                          [key]: e.target.value === '' ? null : e.target.value === 'yes',
                        })),
                        style: {
                          minHeight: 38, padding: '7px 9px', borderRadius: 9,
                          border: '1px solid #cbd5e1', background: '#fff', font: 'inherit',
                        },
                      },
                        React.createElement('option', { value: '' }, 'Выберите'),
                        React.createElement('option', { value: 'yes' }, 'Да'),
                        React.createElement('option', { value: 'no' }, 'Нет')
                      )
                    )
                  ))
                )
                : null,
              reviewAction === 'rejected'
                ? React.createElement('label', { style: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 } },
                  'Причина отказа',
                  React.createElement('select', {
                    value: reviewReason, onChange: (e) => setReviewReason(e.target.value),
                    style: { minHeight: 44, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', font: 'inherit' },
                  },
                    React.createElement('option', { value: '' }, 'Выберите причину'),
                    React.createElement('option', { value: 'out_of_scope' }, 'Вне границ сопровождения'),
                    React.createElement('option', { value: 'safety' }, 'Риск для безопасности'),
                    React.createElement('option', { value: 'unrealistic_expectations' }, 'Несовместимые ожидания'),
                    React.createElement('option', { value: 'format_mismatch' }, 'Не подходит формат работы'),
                    React.createElement('option', { value: 'candidate_withdrew' }, 'Кандидат отказался')
                  )
                )
                : null,
              React.createElement('label', { style: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 } },
                'Внутренняя заметка',
                React.createElement('textarea', {
                  value: reviewNote,
                  onChange: (e) => setReviewNote(e.target.value.slice(0, 2000)),
                  placeholder: 'Контекст решения. Клиент эту заметку не увидит.',
                  style: { minHeight: 76, padding: 11, borderRadius: 10, border: '1px solid #cbd5e1', resize: 'vertical', font: 'inherit' },
                })
              ),
              React.createElement('div', { style: { display: 'flex', gap: 9 } },
                React.createElement('button', {
                  type: 'button',
                  onClick: () => setDecisionSheetOpen(false),
                  style: {
                    minHeight: 44, padding: '10px 14px', borderRadius: 10,
                    border: '1px solid #cbd5e1', background: '#fff',
                    color: '#475569', cursor: 'pointer', fontWeight: 650,
                  }
                }, 'Отмена'),
                React.createElement('button', {
                  type: 'button',
                  onClick: submitIntakeReview,
                  disabled: actionLoading === 'review-' + intakeDialog.client_id,
                  style: {
                    flex: 1, minHeight: 44, padding: '10px 14px',
                    border: 0, borderRadius: 10, background: '#434587',
                    color: '#fff', fontWeight: 700, cursor: 'pointer',
                    opacity: actionLoading === 'review-' + intakeDialog.client_id ? 0.65 : 1,
                  }
                }, actionLoading === 'review-' + intakeDialog.client_id ? 'Сохраняем…' : 'Сохранить решение')
              )
            )
        ),
        ['approved', 'approved_waiting_slot', 'rejected'].includes(intakeDialog.status) && React.createElement('button', {
          type: 'button',
          onClick: () => copyToClipboard(
            intakeDialog.status === 'approved'
              ? 'Здравствуйте. Мы рассмотрели анкету и готовы предложить вам пробную неделю HEYS. Дату начала согласуем отдельным сообщением.'
              : intakeDialog.status === 'approved_waiting_slot'
                ? 'Здравствуйте. Мы рассмотрели анкету и готовы предложить пробную неделю HEYS, когда освободится место. Куратор свяжется с вами, чтобы согласовать дату старта.'
              : 'Здравствуйте. Мы рассмотрели анкету. Сейчас не сможем предложить пробную неделю в текущем формате сопровождения. Благодарим за уделённое время.',
            'Нейтральное сообщение скопировано'
          ),
          style: { width: '100%', marginTop: 18, padding: 11, borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 650 }
        }, 'Скопировать сообщение клиенту')
      )),

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
    buildClientWelcomeMessage,
    buildTrialIntakeInviteMessage,
    getIntakeAnswerAttention,
    summarizeIntakeAnswers,
    filterActionableLeads,

    // React
    useTrialQueue,
    TrialCapacityWidget,
    QueueStatusCard,
    TrialQueueAdmin, // Админ-панель
    NewLeadsBadge,   // P0.11: бейдж "+N новых лидов" на табе «Очередь»
  };

  // 🔇 v4.7.0: Лог загрузки отключён

})(typeof window !== 'undefined' ? window : globalThis);
