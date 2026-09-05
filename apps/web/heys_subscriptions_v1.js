// heys_subscriptions_v1.js — Модуль подписок и платежей
// Версия: 1.1.0 | Дата: 2025-12-22
// 
// Управление статусами подписки, триалом, оплатой через ЮKassa
// Интегрировано с YandexAPI.createPayment / getPaymentStatus

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
  const devWarn = typeof DEV.warn === 'function' ? DEV.warn.bind(DEV) : function () { };
  const trackError = (error, context) => {
    if (!HEYS?.analytics?.trackError) return;
    try {
      const err = error instanceof Error ? error : new Error(String(error || 'Subscriptions error'));
      HEYS.analytics.trackError(err, context);
    } catch (_) { }
  };
  const canWriteStatus = (value) => HEYS.Subscription?.canWriteStatus?.(value) === true;

  // Закрытие welcome в этой сессии вкладки — страховка от race, когда
  // heys:profile-updated / SW KV invalidation приходит раньше, чем успевает
  // записаться heys_first_login в store/облако.
  const _welcomeDismissedSession = new Set();

  function normalizeWelcomeClientId(clientId) {
    if (!clientId) return '';
    return String(clientId).replace(/"/g, '').trim().toLowerCase();
  }

  function dismissWelcomeHost() {
    const welcomeHost = typeof document !== 'undefined'
      ? document.getElementById('heys-welcome-host')
      : null;
    if (!welcomeHost) return;
    try {
      if (welcomeHost._heysRoot) welcomeHost._heysRoot.render(null);
    } catch (_) { /* noop */ }
    welcomeHost.remove();
  }

  function welcomeSessionKey(normalizedCid) {
    return `heys_welcome_seen_${normalizedCid}`;
  }

  function hasReturningUserProfile() {
    try {
      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      return profile.profileCompleted === true
        || profile.weight != null
        || profile.firstName
        || profile.name;
    } catch (_) {
      return false;
    }
  }

  function markWelcomeSeen(clientId) {
    const normalizedCid = normalizeWelcomeClientId(clientId);
    if (!normalizedCid) return;
    _welcomeDismissedSession.add(normalizedCid);
    const welcomeKey = `heys_first_login_${normalizedCid}`;
    const isCurrentClient = normalizeWelcomeClientId(HEYS.currentClientId) === normalizedCid;
    // Legacy LS — синхронно и первым: переживает debounced cloud sync.
    try { localStorage.setItem(welcomeKey, '1'); } catch (_) { /* noop */ }
    try { sessionStorage.setItem(welcomeSessionKey(normalizedCid), '1'); } catch (_) { /* noop */ }
    try {
      if (isCurrentClient && HEYS.store?.set) HEYS.store.set('heys_first_login', 1);
    } catch (_) { /* noop */ }
  }

  function welcomeAlreadySeen(clientId) {
    const normalizedCid = normalizeWelcomeClientId(clientId);
    if (!normalizedCid) return false;
    if (_welcomeDismissedSession.has(normalizedCid)) return true;
    try {
      if (sessionStorage.getItem(welcomeSessionKey(normalizedCid))) return true;
    } catch (_) { /* noop */ }
    if (hasReturningUserProfile()) return true;
    const isCurrentClient = normalizeWelcomeClientId(HEYS.currentClientId) === normalizedCid;
    try {
      if (isCurrentClient && HEYS.store?.get && HEYS.store.get('heys_first_login', null)) return true;
    } catch (_) { /* store недоступен — падаем на legacy */ }
    const welcomeKey = `heys_first_login_${normalizedCid}`;
    try {
      if (localStorage.getItem(welcomeKey)) return true;
      // Старые сессии могли писать ключ без lower-case.
      const rawCid = String(clientId).replace(/"/g, '').trim();
      if (rawCid && rawCid !== normalizedCid && localStorage.getItem(`heys_first_login_${rawCid}`)) return true;
    } catch (_) { return false; }
    return false;
  }

  // =====================================================
  // КОНФИГУРАЦИЯ
  // =====================================================

  // Цены тарифов — единый источник для paywall и subscriptions модулей.
  // Должны совпадать с apps/landing/src/config/pricing.ts.
  HEYS.config = HEYS.config || {};
  HEYS.config.prices = HEYS.config.prices || {
    base: 490,
    pro: 7990,
    proPlus: 19990,
  };

  const CONFIG = {
    TRIAL_DAYS: 7,
    PAYMENT_CHECK_INTERVAL: 3000, // Проверка статуса каждые 3 секунды
    PAYMENT_CHECK_MAX_ATTEMPTS: 60, // Максимум 3 минуты ожидания

    PLANS: {
      base: {
        id: 'base',
        name: 'Self',
        price: HEYS.config.prices.base,
        currency: 'RUB',
        features: [
          'Самостоятельный дневник: КБЖУ и приёмы',
          'Базовая динамика, виджеты, задачник'
        ]
      },
      pro: {
        id: 'pro',
        name: 'Pro',
        price: HEYS.config.prices.pro,
        currency: 'RUB',
        recommended: true,
        features: [
          'Всё из Self',
          'Ведение дневника куратором',
          'Чат с куратором',
          'Созвон раз в неделю'
        ]
      },
      proplus: {
        id: 'proplus',
        name: 'Pro Спорт',
        price: HEYS.config.prices.proPlus,
        currency: 'RUB',
        features: [
          'Всё из Pro',
          'Программа тренировок на 4 недели',
          'Общий созвон 45–60 минут/нед.',
          '1 корректировка в середине недели',
          'Разбор до 2 упражнений/нед.'
        ]
      }
    },

    STATUSES: {
      trial: { id: 'trial', name: 'Триал', color: '#3b82f6', get canEdit() { return canWriteStatus('trial'); } },
      active: { id: 'active', name: 'Активна', color: '#22c55e', get canEdit() { return canWriteStatus('active'); } },
      read_only: { id: 'read_only', name: 'Только просмотр', color: '#f59e0b', get canEdit() { return canWriteStatus('read_only'); } },
      canceled: { id: 'canceled', name: 'Отменена', color: '#6b7280', get canEdit() { return canWriteStatus('canceled'); } }
    }
  };

  // =====================================================
  // УТИЛИТЫ
  // =====================================================

  function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
  }

  function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function daysUntil(date) {
    if (!date) return 0;
    const now = new Date();
    const target = new Date(date);
    const diff = target - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  function tryParseStoredValue(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw !== 'string') return raw;
    let str = raw;
    if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
      try { str = HEYS.store.decompress(str); } catch (_) { }
    }
    try { return JSON.parse(str); } catch (_) { return str; }
  }

  function readGlobalValue(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null || raw === undefined ? fallback : tryParseStoredValue(raw, fallback);
    } catch (_) {
      return fallback;
    }
  }

  function readStoredValue(key, fallback) {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) return tryParseStoredValue(stored, fallback);
      }
      if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(key, fallback);
      const raw = localStorage.getItem(key);
      return raw === null || raw === undefined ? fallback : tryParseStoredValue(raw, fallback);
    } catch (_) {
      return fallback;
    }
  }

  function normalizeClientId(value) {
    if (!value) return '';
    const parsed = tryParseStoredValue(value, value);
    return typeof parsed === 'string' ? parsed.replace(/"/g, '') : '';
  }

  function getCurrentClientId() {
    try {
      return normalizeClientId(HEYS.currentClientId)
        || normalizeClientId(localStorage.getItem('heys_client_current'));
    } catch (_) {
      return '';
    }
  }

  function isCuratorSession() {
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
  }

  function getLocalSubscriptionData(clientId) {
    const cid = normalizeClientId(clientId) || getCurrentClientId();
    const profile = readStoredValue('heys_profile', {}) || {};
    let status = profile.subscription_status || '';
    let plan = profile.subscription_plan || null;

    if (!status && cid) {
      const clients = readStoredValue('heys_clients', []) || [];
      if (Array.isArray(clients)) {
        const client = clients.find((item) => item && normalizeClientId(item.id) === cid);
        if (client) {
          status = client.subscription_status || '';
          plan = plan || client.subscription_plan || null;
        }
      }
    }

    if (!status && HEYS.Subscription?.getCachedStatus) {
      status = HEYS.Subscription.getCachedStatus() || '';
    }
    status = status || 'none';

    return {
      success: true,
      status,
      plan,
      is_trial: status === 'trial',
      days_left: daysUntil(profile.trial_ends_at),
      can_edit: canWriteStatus(status),
      trial_started_at: profile.trial_started_at,
      trial_ends_at: profile.trial_ends_at,
      subscription_ends_at: profile.subscription_ends_at,
      source: isCuratorSession() ? 'local_curator' : 'local_fallback'
    };
  }

  // =====================================================
  // ПРОВЕРКА PENDING ПЛАТЕЖА
  // =====================================================

  /**
   * Проверить pending платёж после редиректа с ЮKassa
   * Вызывается при загрузке приложения
   * @returns {Promise<{success: boolean, plan?: string}>}
   */
  async function checkPendingPayment() {
    try {
      // Читаем сохранённый pending payment
      const pendingRaw = localStorage.getItem('heys_pending_payment');
      if (!pendingRaw) return { success: false };

      const pending = JSON.parse(pendingRaw);
      const { paymentId, clientId, plan, createdAt } = pending;

      // Проверяем не старый ли это платёж (>1 час)
      if (Date.now() - createdAt > 60 * 60 * 1000) {
        devLog('[Subscriptions] Pending payment expired');
        localStorage.removeItem('heys_pending_payment');
        return { success: false };
      }

      devLog('[Subscriptions] Checking pending payment:', paymentId);

      // Запрашиваем статус платежа
      const YandexAPI = window.HEYS?.YandexAPI;
      if (!YandexAPI?.getPaymentStatus) {
        devWarn('[Subscriptions] YandexAPI.getPaymentStatus недоступен');
        return { success: false };
      }

      const { data, error } = await YandexAPI.getPaymentStatus(paymentId, clientId);

      if (error) {
        devWarn('[Subscriptions] getPaymentStatus error:', error);
        trackError(error, { scope: 'Subscriptions', action: 'getPaymentStatus' });
        return { success: false, error: error.message };
      }

      devLog('[Subscriptions] Payment status:', data);

      // Платёж успешен?
      if (data.paid && data.status === 'succeeded') {
        // Очищаем pending и возвращаем успех
        localStorage.removeItem('heys_pending_payment');
        return { success: true, plan, paymentId };
      }

      // Платёж отменён или ошибка?
      if (data.status === 'canceled' || data.status === 'failed') {
        localStorage.removeItem('heys_pending_payment');
        return { success: false, status: data.status };
      }

      // Платёж ещё в процессе (pending/waiting_for_capture)
      return { success: false, pending: true, status: data.status };

    } catch (err) {
      devWarn('[Subscriptions] checkPendingPayment error:', err);
      trackError(err, { scope: 'Subscriptions', action: 'checkPendingPayment' });
      return { success: false, error: err.message };
    }
  }

  /**
   * Ожидать завершения платежа (polling)
   * @param {Function} onSuccess - Callback при успехе
   * @param {Function} onError - Callback при ошибке
   */
  async function waitForPayment(onSuccess, onError) {
    let attempts = 0;

    const check = async () => {
      attempts++;

      if (attempts > CONFIG.PAYMENT_CHECK_MAX_ATTEMPTS) {
        devLog('[Subscriptions] Payment check timeout');
        onError?.({ message: 'Таймаут ожидания оплаты' });
        return;
      }

      const result = await checkPendingPayment();

      if (result.success) {
        devLog('[Subscriptions] Payment succeeded!', result);
        onSuccess?.(result);
        return;
      }

      if (result.pending) {
        // Продолжаем ждать
        setTimeout(check, CONFIG.PAYMENT_CHECK_INTERVAL);
        return;
      }

      // Платёж не удался или нет pending
      if (result.error || result.status === 'canceled' || result.status === 'failed') {
        onError?.(result);
        return;
      }

      // Нет pending payment — ничего не делаем
    };

    check();
  }

  // =====================================================
  // API МЕТОДЫ
  // =====================================================

  /**
   * Получить статус подписки клиента
   */
  async function getStatus(clientId) {
    try {
      if (isCuratorSession()) {
        return getLocalSubscriptionData(clientId);
      }

      // Используем YandexAPI (session-based)
      if (HEYS.YandexAPI) {
        const sessionToken = HEYS.auth?.getSessionToken?.();
        const rpcParams = {};
        if (sessionToken) rpcParams.p_session_token = sessionToken;
        const result = await HEYS.YandexAPI.rpc('get_subscription_status_by_session', rpcParams);

        if (result.error) {
          const message = result.error.message || result.error;
          if (/invalid_session|no session token/i.test(String(message))) {
            return getLocalSubscriptionData(clientId);
          }
          throw new Error(message);
        }
        // Распаковываем данные: { data: { get_subscription_status_by_session: {...} } }
        const statusData = result.data?.get_subscription_status_by_session || result.data || result;
        devLog('[Subscriptions] getStatus result:', statusData);
        return statusData;
      }

      // Fallback: читаем из localStorage
      return getLocalSubscriptionData(clientId);
    } catch (err) {
      devWarn('[Subscriptions] getStatus error:', err);
      // trackError только для НЕИЗВЕСТНЫХ ошибок (не для "нет токена" — это нормально)
      if (!/invalid_session|no session token/i.test(err.message || '')) {
        trackError(err, { scope: 'Subscriptions', action: 'getStatus' });
      }
      return getLocalSubscriptionData(clientId);
    }
  }

  /**
   * Запустить триал (вызывается при первом приёме пищи)
   */
  async function startTrial(clientId) {
    try {
      // Используем YandexAPI
      if (HEYS.YandexAPI) {
        const result = await HEYS.YandexAPI.startTrial(clientId);
        if (result.error) throw new Error(result.error);
        devLog('[Subscriptions] Trial started:', result);
        return result;
      }

      // Fallback: сохраняем локально (YandexAPI недоступен)
      const now = new Date();
      const trialEnd = new Date(now.getTime() + CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000);

      // 🛡️ FIX 2026-05-23: тот же guard как в refreshProfileSubscription —
      // не пишем subscription portion если local профиль ещё не приземлился
      // (incomplete). Иначе lsSet через nsKey() затрёт scoped LS subscription-only
      // объектом и сломает следующий cloud sync merge.
      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      const hasPersonalMarkers = profile.firstName || profile.age || profile.weight
        || profile.height || profile.profileCompleted === true;
      if (!hasPersonalMarkers) {
        devWarn('[Subscriptions] startTrial fallback: skipping LS write — profile incomplete');
        return {
          success: true,
          trial_started_at: now.toISOString(),
          trial_ends_at: trialEnd.toISOString(),
          note: 'local_profile_incomplete_no_write'
        };
      }
      profile.subscription_status = 'trial';
      profile.trial_started_at = now.toISOString();
      profile.trial_ends_at = trialEnd.toISOString();
      profile.updatedAt = now.getTime();
      HEYS.utils?.lsSet?.('heys_profile', profile);

      return {
        success: true,
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd.toISOString()
      };
    } catch (err) {
      devWarn('[Subscriptions] startTrial error:', err);
      trackError(err, { scope: 'Subscriptions', action: 'startTrial' });
      return { success: false, error: err.message };
    }
  }

  /**
   * Активировать подписку (mock-оплата)
   */
  async function activateSubscription(clientId, plan, months = 1) {
    try {
      if (!CONFIG.PLANS[plan]) {
        throw new Error('Invalid plan: ' + plan);
      }

      // Используем YandexAPI
      if (HEYS.YandexAPI) {
        const result = await HEYS.YandexAPI.activateSubscription(clientId, plan, months);
        if (result.error) throw new Error(result.error);
        devLog('[Subscriptions] Subscription activated:', result);
        return result;
      }

      // Fallback: сохраняем локально (YandexAPI недоступен)
      const now = new Date();
      const expiresAt = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);

      // 🛡️ FIX 2026-05-23: см. startTrial — тот же guard.
      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      const hasPersonalMarkers = profile.firstName || profile.age || profile.weight
        || profile.height || profile.profileCompleted === true;
      if (!hasPersonalMarkers) {
        devWarn('[Subscriptions] activateSubscription fallback: skipping LS write — profile incomplete');
        return {
          success: true,
          plan: plan,
          expires_at: expiresAt.toISOString(),
          note: 'local_profile_incomplete_no_write'
        };
      }
      profile.subscription_status = 'active';
      profile.subscription_plan = plan;
      profile.subscription_started_at = now.toISOString();
      profile.subscription_expires_at = expiresAt.toISOString();
      profile.updatedAt = now.getTime();
      HEYS.utils?.lsSet?.('heys_profile', profile);

      return {
        success: true,
        plan: plan,
        expires_at: expiresAt.toISOString()
      };
    } catch (err) {
      devWarn('[Subscriptions] activateSubscription error:', err);
      trackError(err, { scope: 'Subscriptions', action: 'activateSubscription' });
      return { success: false, error: err.message };
    }
  }

  /**
   * Проверить, может ли пользователь редактировать данные
   */
  async function canEdit(clientId) {
    const status = await getStatus(clientId);
    return canWriteStatus(status);
  }

  /**
   * Получить конфигурацию тарифов
   */
  function getPlans() {
    return Object.values(CONFIG.PLANS);
  }

  /**
   * Получить информацию о тарифе
   */
  function getPlan(planId) {
    return CONFIG.PLANS[planId] || null;
  }

  /**
   * Получить информацию о статусе
   */
  function getStatusInfo(statusId) {
    return CONFIG.STATUSES[statusId] || CONFIG.STATUSES.trial;
  }

  // =====================================================
  // REACT КОМПОНЕНТЫ
  // =====================================================

  const { createElement: h, useState, useEffect } = window.React || {};

  /**
   * Бейдж статуса подписки
   */
  function SubscriptionBadge({ status, plan, daysLeft, onClick }) {
    const statusInfo = getStatusInfo(status);
    const planInfo = plan ? getPlan(plan) : null;

    const badgeStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '13px',
      fontWeight: '500',
      backgroundColor: statusInfo.color + '20',
      color: statusInfo.color,
      cursor: onClick ? 'pointer' : 'default'
    };

    let label = statusInfo.name;
    if (status === 'trial' && daysLeft > 0) {
      label = `Триал: ${daysLeft} дн.`;
    } else if (status === 'active' && planInfo) {
      label = planInfo.name;
    }

    return h('span', { style: badgeStyle, onClick }, label);
  }

  /**
   * Карточка тарифа
   */
  function PlanCard({ plan, isSelected, onSelect }) {
    const planInfo = getPlan(plan);
    if (!planInfo) return null;

    const cardStyle = {
      border: isSelected ? '2px solid #22c55e' : '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '12px',
      backgroundColor: isSelected ? '#f0fdf4' : '#fff',
      cursor: 'pointer',
      transition: 'all 0.2s'
    };

    const headerStyle = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    };

    const nameStyle = {
      fontSize: '18px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    };

    const priceStyle = {
      fontSize: '20px',
      fontWeight: '700',
      color: '#22c55e'
    };

    const featureStyle = {
      fontSize: '14px',
      color: '#6b7280',
      marginLeft: '16px',
      marginBottom: '4px'
    };

    return h('div', { style: cardStyle, onClick: () => onSelect(plan) },
      h('div', { style: headerStyle },
        h('div', { style: nameStyle },
          planInfo.name,
          planInfo.recommended && h('span', {
            style: {
              fontSize: '11px',
              backgroundColor: '#fef3c7',
              color: '#d97706',
              padding: '2px 8px',
              borderRadius: '10px'
            }
          }, '⭐ Рекомендуем')
        ),
        h('div', { style: priceStyle }, formatPrice(planInfo.price) + '/мес')
      ),
      h('div', null,
        planInfo.features.map((f, i) =>
          h('div', { key: i, style: featureStyle }, '• ' + f)
        )
      )
    );
  }

  function formatDateShort(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  const TRIAL_SCREEN_FEATURES = [
    'Дневник, приёмы и продукты без ограничений',
    'Динамика веса, виджеты, отчёты',
    'Советы по вашим данным',
    'Куратор в чате — как на Pro',
  ];

  const ACTIVE_SCREEN_FEATURES = [
    'Всё из Self: дневник, динамика, виджеты, задачи',
    'Куратор ведёт дневник',
    'Чат с куратором',
    'Созвон раз в неделю',
  ];

  function formatDateSettingsMeta(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
  }

  function formatSubscriptionHeadlineDate(date) {
    if (!date) return '';
    return `до ${formatDateShort(date)}`;
  }

  function subscriptionScreenCheckIcon() {
    return h('svg', {
      width: 15,
      height: 15,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 3.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    }, h('path', { d: 'M20 6L9 17l-5-5' }));
  }

  function subscriptionScreenChevronIcon() {
    return h('svg', {
      width: 15,
      height: 15,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2.75,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    }, h('path', { d: 'M9 6l6 6-6 6' }));
  }

  function getSettingsRowMeta(statusData) {
    let data = statusData || {};
    if (!data.status) return 'Загрузка...';
    try {
      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      data = {
        ...data,
        trial_ends_at: data.trial_ends_at || profile.trial_ends_at || null,
        subscription_ends_at: data.subscription_ends_at
          || data.subscription_expires_at
          || profile.subscription_ends_at
          || profile.subscription_expires_at
          || null,
        plan: data.plan || profile.subscription_plan || profile.plan || null,
      };
    } catch (_) { /* noop */ }

    const status = data.status;
    const meta = getStatusInfo(status);
    if (status === 'trial') {
      const shortDate = formatDateSettingsMeta(data.trial_ends_at);
      return shortDate ? `Триал · до ${shortDate}` : (meta?.name || 'Триал');
    }
    if (status === 'active') {
      const plan = data.plan ? getPlan(normalizePlanId(data.plan)) : null;
      const shortDate = formatDateSettingsMeta(data.subscription_ends_at);
      if (plan && shortDate) return `${plan.name} · до ${shortDate}`;
      return meta?.name || 'Активна';
    }
    if (status === 'read_only') return 'Только чтение';
    return meta?.name || 'Подписка';
  }

  function renderSubscriptionScreenFooter(onSupport) {
    return h('div', { className: 'sub-screen__footer' },
      h('div', { className: 'sub-screen__footnote' },
        h('div', { className: 'sub-screen__footnote-title' }, 'Само ничего не спишется'),
        h('div', { className: 'sub-screen__footnote-text' },
          'Оплата и продление идут через поддержку — деньги не уходят без вашего слова. Продлить или сменить тариф: написать в поддержку.')
      ),
      h('button', {
        type: 'button',
        className: 'sub-screen__support',
        onClick: onSupport,
      },
        h('span', { className: 'sub-screen__support-link' }, 'Написать в поддержку'),
        h('span', { className: 'sub-screen__support-chevron', 'aria-hidden': 'true' }, subscriptionScreenChevronIcon())
      )
    );
  }

  function handleSubscriptionScreenSupport() {
    if (HEYS.config?.paymentsEnabled) {
      HEYS.Paywall?.show?.('subscription_screen');
      return;
    }
    openCuratorContactModal();
  }

  function normalizePlanId(plan) {
    if (plan === 'proPlus') return 'proplus';
    return plan;
  }

  function paywallCheckIcon() {
    return h('svg', {
      width: 13,
      height: 13,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 3.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    }, h('path', { d: 'M20 6L9 17l-5-5' }));
  }

  function paywallSuccessCheckIcon() {
    return h('svg', {
      width: 26,
      height: 26,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2.75,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    }, h('path', { d: 'M20 6L9 17l-5-5' }));
  }

  function paywallCloseIconMarkup() {
    return h('svg', {
      width: 15,
      height: 15,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2.75,
      strokeLinecap: 'round',
      'aria-hidden': 'true',
    }, h('path', { d: 'M18 6L6 18M6 6l12 12' }));
  }

  /**
   * Экран «Проверьте заказ»
   */
  function PaymentScreen({ clientId, plan = 'pro', embedded = false, onSuccess, onCancel }) {
    const selectedPlan = normalizePlanId(plan);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [ofertaAccepted, setOfertaAccepted] = useState(false);

    React.useEffect(() => {
      if (embedded || typeof document === 'undefined') return;
      window.HEYS?.Paywall?.injectStyles?.();
    }, [embedded]);

    /**
     * Логирование согласия payment_oferta перед оплатой (ст. 438 ГК РФ)
     */
    const logPaymentConsent = async () => {
      try {
        const Consents = window.HEYS?.Consents;
        const YandexAPI = window.HEYS?.YandexAPI;
        if (!YandexAPI?.logConsentsBySession) {
          devWarn('[Subscriptions] session-safe consent API недоступен');
          return false;
        }

        // payment_oferta = акцепт публичной оферты (user-agreement) при оплате.
        // Версия должна совпадать с CURRENT_VERSIONS.payment_oferta и backend-gate.
        const consentData = [{
          type: 'payment_oferta',
          version: window.HEYS?.Consents?.VERSIONS?.payment_oferta || '1.7',
          granted: true,
          signature_method: 'checkbox'
        }];

        const result = await YandexAPI.logConsentsBySession(consentData, navigator.userAgent);
        if (result.error) {
          console.error('[HEYS.subscriptions] ❌ Ошибка логирования payment_oferta:', result.error);
          return false;
        }

        console.info('[HEYS.subscriptions] ✅ payment_oferta consent записан:', {
          clientId,
          plan: selectedPlan,
          version: consentData[0].version
        });
        return true;
      } catch (err) {
        console.error('[HEYS.subscriptions] ❌ logPaymentConsent error:', err);
        trackError(err, { scope: 'Subscriptions', action: 'logPaymentConsent' });
        return false;
      }
    };

    const handlePayment = async () => {
      if (!ofertaAccepted) {
        setError('Необходимо принять условия Оферты для оплаты');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Логируем согласие с офертой перед оплатой
        const consentLogged = await logPaymentConsent();
        if (!consentLogged) {
          setError('Не удалось зафиксировать согласие. Попробуйте ещё раз.');
          setLoading(false);
          return;
        }

        // 2. Используем YandexAPI для создания реального платежа ЮKassa
        const YandexAPI = window.HEYS?.YandexAPI;

        if (!YandexAPI?.createPayment) {
          // Fallback на прямую активацию (для тестов без платёжки)
          devWarn('[Subscriptions] YandexAPI.createPayment недоступен, используем прямую активацию');
          const result = await activateSubscription(clientId, selectedPlan, 1);

          if (result.success) {
            onSuccess?.(result);
          } else {
            setError(result.error || 'Ошибка оплаты');
          }
          return;
        }

        // 3. Создаём платёж через ЮKassa
        const returnUrl = window.location.origin + '/payment-result?clientId=' + clientId;
        const { data, error: apiError } = await YandexAPI.createPayment(clientId, selectedPlan, returnUrl);

        if (apiError || !data) {
          setError(apiError?.message || 'Ошибка создания платежа');
          return;
        }

        // Сохраняем paymentId для проверки после редиректа
        try {
          localStorage.setItem('heys_pending_payment', JSON.stringify({
            paymentId: data.paymentId,
            clientId,
            plan: selectedPlan,
            createdAt: Date.now()
          }));
        } catch (e) {
          devWarn('[Subscriptions] Не удалось сохранить pending payment:', e);
          trackError(e, { scope: 'Subscriptions', action: 'savePendingPayment' });
        }

        // Редирект на страницу оплаты ЮKassa
        if (data.confirmationUrl) {
          window.location.href = data.confirmationUrl;
        } else {
          // Если confirmationUrl нет, значит платёж уже успешен (редкий кейс)
          onSuccess?.({ plan: selectedPlan });
        }

      } catch (err) {
        devWarn('[Subscriptions] handlePayment error:', err);
        trackError(err, { scope: 'Subscriptions', action: 'handlePayment' });
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const selectedInfo = getPlan(selectedPlan);
    const planName = selectedInfo?.name || 'Pro';
    const planDesc = selectedPlan === 'pro'
      ? 'Куратор ведёт дневник, чат, созвон раз в неделю'
      : (selectedInfo?.features?.[0] || '');
    const payLabel = `Оплатить ${formatPrice(selectedInfo?.price || 0)}`;

    const body = h('div', null,
      !embedded && h('button', {
        type: 'button',
        className: 'paywall-close',
        onClick: onCancel,
        'aria-label': 'Закрыть',
      }, paywallCloseIconMarkup()),

      h('h1', { className: 'paywall-title', style: embedded ? { paddingRight: 40 } : undefined }, 'Проверьте заказ'),

      h('div', { className: 'paywall-order-card' },
        h('div', null,
          h('div', { className: 'paywall-order-name' }, planName),
          h('div', { className: 'paywall-plan-desc' }, planDesc)
        ),
        h('div', null,
          h('div', { className: 'paywall-order-price n' }, formatPrice(selectedInfo?.price || 0)),
          h('div', { className: 'paywall-order-period' }, 'за 30 дней')
        )
      ),

      error && h('div', { className: 'paywall-error' }, error),

      h('div', {
        className: 'paywall-consent',
        onClick: () => setOfertaAccepted(!ofertaAccepted),
      },
        h('span', { className: `paywall-consent-box ${ofertaAccepted ? 'is-checked' : ''}` },
          ofertaAccepted && paywallCheckIcon()
        ),
        h('span', { className: 'paywall-consent-text' },
          'Принимаю условия ',
          h('a', {
            href: 'https://heyslab.ru/legal/user-agreement',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'paywall-consent-link',
            onClick: (e) => e.stopPropagation(),
          }, 'публичной оферты'),
          ' и ',
          h('a', {
            href: 'https://heyslab.ru/legal/privacy-policy',
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'paywall-consent-link',
            onClick: (e) => e.stopPropagation(),
          }, 'политики конфиденциальности')
        )
      ),

      h('button', {
        type: 'button',
        className: 'paywall-cta',
        style: { marginTop: '18px', opacity: (loading || !ofertaAccepted) ? 0.45 : 1 },
        onClick: handlePayment,
        disabled: loading || !ofertaAccepted,
      }, loading ? 'Обработка…' : payLabel),

      onCancel && h('button', { type: 'button', className: 'paywall-cancel', onClick: onCancel }, 'Отмена')
    );

    if (embedded) return body;

    window.HEYS?.Paywall?.injectStyles?.();

    return h('div', {
      className: 'paywall-overlay',
      onClick: (e) => e.target === e.currentTarget && onCancel?.(),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'payment-screen-title',
    },
      h('div', { className: 'paywall-modal', style: { position: 'relative' } }, body)
    );
  }

  /**
   * Экран успешной оплаты
   */
  function PaymentSuccessScreen({ plan, expiresAt, onContinue, embedded = false }) {
    const planInfo = getPlan(normalizePlanId(plan));
    const planName = planInfo?.name || plan || 'Pro';
    const untilLabel = formatDateShort(expiresAt);
    const priceLabel = formatPrice(planInfo?.price || 0);

    const body = h('div', null,
      h('div', { className: 'paywall-success-icon' }, paywallSuccessCheckIcon()),
      h('h1', {
        id: 'payment-screen-title',
        className: 'paywall-title',
        style: { marginTop: '14px', paddingRight: 0 },
      }, 'Подписка активна'),
      h('div', { className: 'paywall-success-card' },
        h('div', null, 'Тариф — ', h('b', { style: { fontWeight: 700 } }, planName)),
        h('div', { className: 'n' }, `До ${untilLabel} · ${priceLabel} в месяц`)
      ),
      h('button', { type: 'button', className: 'paywall-cta', style: { marginTop: '18px' }, onClick: onContinue }, 'Продолжить')
    );

    if (embedded) return body;

    window.HEYS?.Paywall?.injectStyles?.();

    return h('div', {
      className: 'paywall-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'payment-screen-title',
    },
      h('div', { className: 'paywall-modal', style: { position: 'relative' } }, body)
    );
  }

  /**
   * Баннер "Подписка не активна" для read_only режима
   */
  function PaywallBanner({ onUpgrade }) {
    const bannerStyle = {
      backgroundColor: '#fef3c7',
      borderRadius: '12px',
      padding: '16px',
      margin: '16px',
      textAlign: 'center'
    };

    const titleStyle = {
      fontSize: '16px',
      fontWeight: '600',
      color: '#d97706',
      marginBottom: '8px'
    };

    const textStyle = {
      fontSize: '14px',
      color: '#92400e',
      marginBottom: '12px'
    };

    const buttonStyle = {
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#fff',
      backgroundColor: '#d97706',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer'
    };

    return h('div', { style: bannerStyle },
      h('div', { style: titleStyle }, '⚠️ Подписка не активна'),
      h('p', { style: textStyle },
        'Вы можете просматривать историю, но добавление данных недоступно'
      ),
      h('button', { style: buttonStyle, onClick: onUpgrade }, 'Оформить подписку')
    );
  }

  /**
   * Секция подписки для профиля
   */
  function SubscriptionSection({ clientId }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showPayment, setShowPayment] = useState(false);

    useEffect(() => {
      HEYS.Paywall?.injectStyles?.();
    }, []);

    useEffect(() => {
      loadStatus();
    }, [clientId]);

    const loadStatus = async () => {
      setLoading(true);
      const result = await getStatus(clientId);
      setStatus(result);
      setLoading(false);
    };

    const handleSuccess = () => {
      setShowPayment(false);
      loadStatus();
    };

    if (loading) {
      return h('div', { className: 'sub-screen' },
        h('div', { className: 'sub-screen__body', style: { padding: '16px', textAlign: 'center' } }, 'Загрузка...')
      );
    }

    if (showPayment) {
      return h(PaymentScreen, {
        clientId,
        onSuccess: handleSuccess,
        onCancel: () => setShowPayment(false),
      });
    }

    const subscriptionStatus = status?.status || 'none';
    const isTrial = subscriptionStatus === 'trial' || status?.is_trial;
    const isActive = subscriptionStatus === 'active';
    const isReadOnly = subscriptionStatus === 'read_only';
    const planInfo = status?.plan ? getPlan(normalizePlanId(status.plan)) : null;
    const trialEnds = status?.trial_ends_at;
    const activeEnds = status?.subscription_ends_at || status?.subscription_expires_at;

    if (isReadOnly) {
      return h('div', { className: 'sub-screen' },
        h('div', { className: 'sub-screen__body' },
          h('div', { className: 'sub-screen__status-card sub-screen__status-card--readonly' },
            h('div', { className: 'sub-screen__kick sub-screen__kick--danger' }, 'Только чтение'),
            h('div', { className: 'sub-screen__readonly-title' }, 'Пробный период закончился'),
            h('div', { className: 'sub-screen__readonly-copy' },
              'День и история открыты для чтения. Чтобы записывать снова — оформите подписку.')
          ),
          h('button', {
            type: 'button',
            className: 'sub-screen__cta paywall-cta',
            onClick: handleSubscriptionScreenSupport,
          }, 'Написать в поддержку')
        ),
        renderSubscriptionScreenFooter(handleSubscriptionScreenSupport)
      );
    }

    const features = isTrial ? TRIAL_SCREEN_FEATURES : ACTIVE_SCREEN_FEATURES;
    const kickLabel = isTrial ? 'Пробный период' : `${planInfo?.name || 'Pro'} · активна`;
    const headline = isTrial
      ? formatSubscriptionHeadlineDate(trialEnds)
      : formatSubscriptionHeadlineDate(activeEnds);
    const subline = isActive && planInfo
      ? `${formatPrice(planInfo.price)} в месяц · оплачено до этой даты`
      : null;

    return h('div', { className: 'sub-screen' },
      h('div', { className: 'sub-screen__body' },
        h('div', { className: 'sub-screen__status-card' },
          h('div', { className: 'sub-screen__kick' }, kickLabel),
          headline && h('div', { className: 'sub-screen__headline n' }, headline),
          isTrial && h('div', { className: 'sub-screen__hint' }, 'дату окончания даёт сервер'),
          subline && h('div', { className: 'sub-screen__subline n' }, subline)
        ),
        h('div', { className: 'sub-screen__tier' }, 'Что открыто'),
        h('div', { className: 'sub-screen__features' },
          features.map((text) => h('div', { key: text, className: 'sub-screen__feature' },
            h('span', { className: 'sub-screen__feature-icon', 'aria-hidden': 'true' }, subscriptionScreenCheckIcon()),
            text
          ))
        ),
        isTrial && h('div', { className: 'sub-screen__note' },
          'Когда пробный период закончится, день и история останутся открытыми для чтения. Записывать снова можно будет после оформления подписки.')
      ),
      renderSubscriptionScreenFooter(handleSubscriptionScreenSupport)
    );
  }

  /**
   * Показать уведомление о необходимости оплаты
   * Используется при попытке редактирования в read-only режиме
   */
  function showPaymentRequired() {
    // Если есть StepModal — показываем красивую модалку
    if (HEYS.StepModal && HEYS.StepModal.show) {
      HEYS.StepModal.show({
        steps: ['payment_required'],
        showProgress: false,
        showGreeting: false
      });
      return;
    }

    // Fallback: показываем PaywallBanner в корне приложения
    // Используем кастомный event который слушает App
    window.dispatchEvent(new CustomEvent('heys:show-paywall', {
      detail: { source: 'edit-blocked', message: 'Подписка не активна' }
    }));
  }

  /**
   * Получить читаемый label статуса для subtitle в профиле
   * Синхронная функция, использует кэшированные данные
   */
  function getStatusLabel() {
    try {
      const clientId = HEYS.currentClientId || localStorage.getItem('heys_client_current');
      if (!clientId) return 'Тариф и оплата';

      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      const status = profile.subscription_status || 'trial';
      const plan = profile.subscription_plan;
      const trialEnds = profile.trial_ends_at;
      const subExpires = profile.subscription_expires_at;

      const statusInfo = getStatusInfo(status);

      if (status === 'trial' && trialEnds) {
        const days = daysUntil(trialEnds);
        return `Триал: ${days} дн. осталось`;
      }

      if (status === 'active' && plan) {
        const planInfo = getPlan(plan);
        if (planInfo) {
          const days = subExpires ? daysUntil(subExpires) : 0;
          return `${planInfo.name} • ${days} дн.`;
        }
      }

      return statusInfo.name;
    } catch (e) {
      return 'Тариф и оплата';
    }
  }

  // =====================================================
  // Phase 1 (A.7): «Свяжитесь с куратором» вместо ЮKassa pay-wall
  // =====================================================

  // Глобальный флаг: false = pay-wall заглушен, true = активен.
  // Включается перед Phase 2 деплоя heys-api-payments.
  if (!HEYS.config) HEYS.config = {};
  if (typeof HEYS.config.paymentsEnabled !== 'boolean') {
    HEYS.config.paymentsEnabled = false;
  }
  if (typeof HEYS.config.curatorContactUrl !== 'string') {
    HEYS.config.curatorContactUrl = (HEYS.support && HEYS.support.telegramUrl) || 'https://t.me/heyslab_support_bot';
  }

  /**
   * Экран «свяжитесь с куратором» — показывается во всех точках, где раньше
   * вёл pay-wall с ЮKassa. После Phase 2 заменится на реальный PaymentScreen
   * через HEYS.config.paymentsEnabled = true.
   */
  function ContactCuratorScreen({ onClose, isReadOnly }) {
    const contactUrl = HEYS.config.curatorContactUrl || (HEYS.support && HEYS.support.telegramUrl);

    return h('div', {
      style: { padding: '24px 20px', textAlign: 'center', maxWidth: 380, margin: '0 auto' }
    },
      h('div', { style: { fontSize: 56, marginBottom: 12 } }, '👨‍⚕️'),
      h('h3', {
        style: {
          fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 12, margin: '0 0 12px 0'
        }
      },
        isReadOnly
          ? 'Триал завершён'
          : 'Оформление подписки'
      ),
      h('p', {
        style: { fontSize: 14, color: '#64748b', lineHeight: 1.55, marginBottom: 24 }
      },
        isReadOnly
          ? 'Чтобы продолжить пользоваться HEYS — свяжитесь с вашим куратором. Он оформит подписку и продлит доступ.'
          : 'Чтобы оформить подписку — напишите вашему куратору. Он подберёт подходящий тариф и оформит оплату индивидуально.'
      ),
      h('a', {
        href: contactUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        style: {
          display: 'block',
          padding: '14px 24px',
          background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          borderRadius: 12,
          textDecoration: 'none',
          marginBottom: 12,
        }
      }, '✈️ Написать куратору в Telegram'),
      onClose && h('button', {
        onClick: onClose,
        style: {
          width: '100%',
          padding: '12px',
          background: 'transparent',
          border: '1px solid #e5e7eb',
          color: '#64748b',
          fontSize: 14,
          borderRadius: 12,
          cursor: 'pointer',
        }
      }, 'Закрыть')
    );
  }

  /**
   * Открывает контактную модалку через StepModal или fallback на window.alert.
   * Используется как обработчик upgrade-кликов в Фазе 1.
   */
  function openCuratorContactModal(opts = {}) {
    if (HEYS.StepModal && HEYS.StepModal.show) {
      HEYS.StepModal.show({
        steps: ['payment_required'],
        showProgress: false,
        showGreeting: false,
      });
      return;
    }
    // Fallback: открываем напрямую Telegram куратора в новой вкладке
    const url = HEYS.config.curatorContactUrl || (HEYS.support && HEYS.support.telegramUrl);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // =====================================================
  // P0.8: TrialCountdownBanner — только блокирующее состояние доступа
  // =====================================================

  /**
   * Активный trial не занимает шапку и не предлагает досрочную оплату:
   * срок доступен в настройках подписки. Баннер остаётся только для явно
   * завершившегося доступа (read_only либо истёкший trial до refresh статуса).
   */
  function TrialCountdownBanner({ subscriptionStatus, trialEndsAt, subscriptionEndsAt, onUpgrade, onClose }) {
    const status = subscriptionStatus || 'none';
    const endDate = subscriptionEndsAt || trialEndsAt;
    const daysLeft = endDate ? daysUntil(endDate) : null;

    const isExpiredTrial = status === 'trial' && daysLeft !== null && daysLeft <= 0;
    if (status !== 'read_only' && !isExpiredTrial) {
      return null;
    }

    const bg = '#fee2e2';
    const color = '#991b1b';
    const border = '#fca5a5';
    const text = '🔒 Доступ ограничен. Чтобы продолжить, оформите подписку.';
    const ctaText = 'Оформить подписку';

    return h('div', {
      style: {
        position: 'sticky',
        top: 0,
        zIndex: 9000,
        background: bg,
        color,
        borderBottom: `1px solid ${border}`,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }
    },
      h('span', { style: { flex: 1 } }, text),
      ctaText && h('button', {
        onClick: onUpgrade,
        style: {
          padding: '6px 12px',
          borderRadius: 8,
          border: 'none',
          background: color,
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }
      }, ctaText),
      onClose && h('button', {
        onClick: onClose,
        title: 'Закрыть',
        style: {
          background: 'transparent',
          border: 'none',
          color,
          fontSize: 18,
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
        }
      }, '×')
    );
  }

  /**
   * Welcome-модалка при первом успешном входе клиента.
   * Использует localStorage флаг heys_first_login_<clientId>.
   */
  function WelcomeFirstLogin({ clientName, trialEndsAt, onClose }) {
    const days = trialEndsAt ? daysUntil(trialEndsAt) : 7;

    return h('div', {
      style: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      },
      onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
    },
      h('div', {
        style: {
          width: 420,
          maxWidth: '92vw',
          background: '#fff',
          borderRadius: 18,
          padding: 28,
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          textAlign: 'center',
        }
      },
        h('div', { style: { fontSize: 56, marginBottom: 12 } }, '🎉'),
        h('div', { style: { fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 8 } },
          `${clientName ? clientName + ', добро пожаловать в HEYS!' : 'Добро пожаловать в HEYS!'}`
        ),
        h('div', { style: { fontSize: 14, color: '#64748b', marginBottom: 18, lineHeight: 1.55 } },
          `Триал на ${days} дней начался${trialEndsAt ? ` — до ${formatDate(trialEndsAt)}.` : '.'}`,
          h('br'),
          h('br'),
          'За это время вы успеете завести дневник, получить первые рекомендации и понять, ',
          'подходит ли HEYS лично вам.'
        ),
        h('button', {
          onClick: onClose,
          style: {
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            width: '100%',
          }
        }, 'Начать!')
      )
    );
  }

  /**
   * Автоматический монтаж countdown-баннера и welcome-модалки.
   * Вызывается из shell приложения после успешного логина клиента.
   *
   * Использование (в любом месте shell):
   *   HEYS.Subscriptions.mountTrialUI({
   *     clientId: '...',
   *     clientName: 'Иван',
   *     subscriptionStatus: 'trial',
   *     trialEndsAt: '2026-05-05T...',
   *     onUpgrade: () => HEYS.Subscriptions.showPaymentRequired(),
   *   });
   */
  function mountTrialUI({ clientId, clientName, subscriptionStatus, trialEndsAt, subscriptionEndsAt, onUpgrade }) {
    if (typeof document === 'undefined' || !React || !ReactDOM) return null;

    // 1. Основной экран и шапка всегда свободны от subscription UI.
    // Ограничение read_only/expired остаётся в HEYS.Paywall и readonly UI.
    const bannerHost = document.getElementById('heys-trial-banner-host');
    if (bannerHost) {
      if (bannerHost._heysRoot) bannerHost._heysRoot.render(null);
      bannerHost.remove();
    }

    // 2. Welcome-модалка при первом логине.
    //
    // ВАЖНО: НЕ показываем welcome если StepModal уже открыт (например, идёт
    // первый чек-ин, согласия или onboarding-tour). Иначе welcome-overlay
    // перекрывает события касания на ползунках/кнопках чек-ина.
    // Признак «клиент уже видел приветствие» живёт в client-scoped KV и потому
    // синхронизируется с облаком: иначе на каждом новом устройстве, после
    // очистки данных сайта или в приватном окне приветствие показывалось бы
    // заново. Legacy-ключ `heys_first_login_<clientId>` остаётся как fallback
    // для тех, кто уже закрыл окно до этого изменения.
    const normalizedCid = normalizeWelcomeClientId(clientId);

    // Показ проверяется через ~100 мс после загрузки скрипта, когда облачные
    // данные ещё не пришли. Без этого гейта синхронизированный признак не
    // успевал бы прочитаться и окно всё равно мелькало бы на новом устройстве.
    // Перемонтаж произойдёт по `heys:profile-updated` / `heys:client-changed`.
    const initialSyncDone = HEYS.cloud?.isInitialSyncCompleted?.() === true;

    const stepModalOpen = !!(typeof document !== 'undefined' && (
      document.querySelector('[data-step-modal]') ||
      document.querySelector('.step-modal-overlay') ||
      document.querySelector('.heys-step-modal') ||
      (window.HEYS?.StepModal && window.HEYS.StepModal.isOpen?.())
    ));

    const seenWelcome = welcomeAlreadySeen(clientId);

    if (seenWelcome || subscriptionStatus !== 'trial') {
      dismissWelcomeHost();
    }

    if (
      subscriptionStatus === 'trial' &&
      normalizedCid &&
      initialSyncDone &&
      !seenWelcome &&
      !stepModalOpen
    ) {
      let welcomeHost = document.getElementById('heys-welcome-host');
      if (!welcomeHost) {
        welcomeHost = document.createElement('div');
        welcomeHost.id = 'heys-welcome-host';
        document.body.appendChild(welcomeHost);
      }
      const welcomeRoot = welcomeHost._heysRoot || ReactDOM.createRoot(welcomeHost);
      welcomeHost._heysRoot = welcomeRoot;

      const close = () => {
        markWelcomeSeen(clientId);
        welcomeRoot.render(null);
        // Полностью убираем host из DOM, чтобы пустой div с inset:0 не висел
        // и не перехватывал клики случайно.
        setTimeout(() => {
          if (welcomeHost && welcomeHost.parentNode) {
            welcomeHost.parentNode.removeChild(welcomeHost);
          }
        }, 50);
      };

      welcomeRoot.render(
        h(WelcomeFirstLogin, { clientName, trialEndsAt, onClose: close })
      );
    }
  }

  // =====================================================
  // ЭКСПОРТ
  // =====================================================

  HEYS.Subscriptions = {
    // Config
    CONFIG,
    getPlans,
    getPlan,
    getStatusInfo,

    // Utils
    formatPrice,
    formatDate,
    daysUntil,
    getStatusLabel,
    getSettingsRowMeta,

    // API
    getStatus,
    startTrial,
    activateSubscription,
    canEdit,
    showPaymentRequired,

    // Payment (ЮKassa)
    checkPendingPayment,
    waitForPayment,

    // Components
    SubscriptionBadge,
    PlanCard,
    PaymentScreen,
    PaymentSuccessScreen,
    PaywallBanner,
    SubscriptionSection,

    // P0.8: countdown + welcome
    TrialCountdownBanner,
    WelcomeFirstLogin,
    mountTrialUI,

    // Phase 1 (A.7): «свяжитесь с куратором» вместо ЮKassa
    ContactCuratorScreen,
    openCuratorContactModal,
  };

  // =====================================================
  // P0.8: Auto-bootstrap welcome-модалки и очистка legacy header-баннера
  // =====================================================
  //
  // Слушает heys:profile-updated и при наличии активного клиента и
  // данных подписки — удаляет legacy header banner и монтирует
  // WelcomeFirstLogin. Subscription status показывается только в настройках.

  function readProfileForUI() {
    try {
      const profile = (HEYS.utils?.lsGet?.('heys_profile')) || {};
      const clientId = HEYS.currentClientId || localStorage.getItem('heys_client_current') || null;
      return {
        clientId: clientId ? String(clientId).replace(/"/g, '') : null,
        clientName: profile.name || profile.first_name || null,
        subscriptionStatus: profile.subscription_status || null,
        trialEndsAt: profile.trial_ends_at || null,
        subscriptionEndsAt: profile.subscription_ends_at || profile.subscription_expires_at || null,
      };
    } catch {
      return { clientId: null };
    }
  }

  function autoMountTrialUINow() {
    const data = readProfileForUI();
    if (!data.clientId || !data.subscriptionStatus) return;
    // active и none без trial_ends_at — нечего показывать
    if (data.subscriptionStatus === 'active') {
      // Удаляем баннер если он был
      const host = document.getElementById('heys-trial-banner-host');
      if (host && host._heysRoot) host._heysRoot.render(null);
      return;
    }
    mountTrialUI({
      ...data,
      onUpgrade: () => {
        // Phase 1: pay-wall выключен → открываем «Свяжитесь с куратором».
        // Phase 2: HEYS.config.paymentsEnabled = true → ЮKassa pay-wall.
        if (HEYS.config.paymentsEnabled) {
          showPaymentRequired();
        } else {
          openCuratorContactModal();
        }
      },
    });
  }

  let _autoMountTrialUITimer = null;
  function autoMountTrialUI() {
    if (_autoMountTrialUITimer) clearTimeout(_autoMountTrialUITimer);
    _autoMountTrialUITimer = setTimeout(() => {
      _autoMountTrialUITimer = null;
      try { autoMountTrialUINow(); } catch (e) { console.warn('[Subs.autoMount] error:', e.message); }
    }, 280);
  }

  /**
   * Принудительно обновить heys_profile из get_subscription_status_by_session
   * и выпустить heys:profile-updated. Используется после успешного PIN-login,
   * чтобы canEdit-проверки сразу видели свежий subscription_status='trial'
   * без ожидания page reload.
   *
   * 🛡️ FIX 2026-05-23: race с Phase A cloud sync. lsSet('heys_profile', ...)
   * через nsKey() скоупится в heys_${cid}_profile. Если в этот момент local LS
   * пустой (incognito cold start, HEYS.store memory cache отдаёт null/{}) —
   * мы пишем туда subscription-only объект (4 поля), затирая результат Phase A
   * (32 поля). Лечим так: читаем raw LS (минуя cache), и если в local профиле
   * пока нет personal markers (firstName/age/weight/height/profileCompleted) —
   * не трогаем heys_profile вообще. Subscription portion всё равно лежит
   * в той же row.v в БД и приземлится через cloud sync. Для срочного UI status
   * используем отдельный cache key `heys_subscription_status`.
   */
  async function refreshProfileSubscription() {
    try {
      const status = await getStatus();
      if (!status || status.success === false) return;

      const cid = (HEYS.utils?.getCurrentClientId?.()) || HEYS.currentClientId || '';
      const decompress = HEYS.store?.decompress;
      const tryDecompress = (raw) => {
        if (!raw) return null;
        try { return decompress ? decompress(raw) : JSON.parse(raw); } catch (_) { return null; }
      };
      // Force-raw read scoped first, затем legacy. Минуем HEYS.store memory cache,
      // которая может отдать stale {} даже если Phase A уже записал полный профиль.
      const profile = (cid && tryDecompress(localStorage.getItem(`heys_${cid}_profile`)))
        || tryDecompress(localStorage.getItem('heys_profile'))
        || {};

      const hasPersonalMarkers = profile.firstName || profile.age || profile.weight
        || profile.height || profile.profileCompleted === true;

      if (!hasPersonalMarkers) {
        // Cloud sync ещё не приземлил профиль (или новый клиент без personal данных).
        // Не пишем в heys_profile: иначе затрём Phase A результат subscription-only объектом.
        // Subscription portion в БД уже включает status/trial_*, придёт через cloud sync.
        // UI получит свежий status из отдельного cache key.
        try {
          if (status.status) {
            HEYS.utils?.lsSet?.('heys_subscription_status', { status: status.status, ts: Date.now() });
          }
        } catch (_) { /* noop */ }
        window.dispatchEvent(new CustomEvent('heys:profile-updated', {
          detail: { source: 'auth-changed', subscription_status: status.status },
        }));
        devLog('[Subscriptions] refreshProfileSubscription: skipped heys_profile write — local profile incomplete, deferring to cloud sync');
        return;
      }

      const updated = {
        ...profile,
        subscription_status: status.status || profile.subscription_status,
        subscription_plan: status.plan || profile.subscription_plan,
        trial_started_at: status.trial_started_at || profile.trial_started_at,
        trial_ends_at: status.trial_ends_at || profile.trial_ends_at,
        subscription_ends_at: status.active_until || status.subscription_ends_at || profile.subscription_ends_at,
      };
      HEYS.utils?.lsSet?.('heys_profile', updated);
      window.dispatchEvent(new CustomEvent('heys:profile-updated', { detail: { source: 'auth-changed', subscription_status: updated.subscription_status } }));
      devLog('[Subscriptions] Profile refreshed after auth-changed:', updated.subscription_status);
    } catch (e) {
      devWarn('[Subscriptions] refreshProfileSubscription failed:', e.message);
    }
  }

  if (typeof window !== 'undefined') {
    // Сразу убираем welcome, если признак уже известен — до debounced autoMount.
    try {
      const earlyCid = normalizeWelcomeClientId(
        HEYS.currentClientId || localStorage.getItem('heys_client_current'),
      );
      if (earlyCid && welcomeAlreadySeen(earlyCid)) dismissWelcomeHost();
    } catch (_) { /* noop */ }

    // На профиль-апдейт пере-монтируем (debounced)
    window.addEventListener('heys:profile-updated', () => {
      try { autoMountTrialUI(); } catch (e) { console.warn('[Subs.autoMount] error:', e.message); }
    });
    // На смену клиента — тоже
    window.addEventListener('heys:client-changed', () => {
      try { autoMountTrialUI(); } catch {}
    });
    // 🔑 На auth-changed (после PIN-login) — рефрешим subscription_status в профиле,
    // иначе canEdit берёт устаревший кеш и блокирует приложение пока clear-cache.
    window.addEventListener('heys:auth-changed', () => {
      // Небольшая задержка, чтобы сервер успел дать актуальную сессию
      setTimeout(() => { refreshProfileSubscription(); }, 200);
    });
    // Первоначальный mount после загрузки скрипта
    setTimeout(() => {
      try { autoMountTrialUI(); } catch {}
    }, 100);
  }

  // =====================================================
  // РЕГИСТРАЦИЯ ШАГА для StepModal
  // =====================================================

  // Отложенная регистрация (StepModal может загрузиться позже)
  function registerPaymentRequiredStep() {
    if (!HEYS.StepModal || !HEYS.StepModal.registerStep) return false;

    const h = React.createElement;

    HEYS.StepModal.registerStep('payment_required', {
      title: '🔒 Подписка не активна',
      icon: '💳',
      canSkip: false,
      hideHeaderNext: true,

      component: function PaymentRequiredStep({ context }) {
        // Phase 1 (A.7): pay-wall с ЮKassa выключен по умолчанию.
        // Чтобы включить — set HEYS.config.paymentsEnabled = true (Phase 2).
        const paymentsEnabled = !!(HEYS.config && HEYS.config.paymentsEnabled);

        if (!paymentsEnabled) {
          return h(ContactCuratorScreen, {
            onClose: context?.onClose,
            isReadOnly: true,
          });
        }

        const [selectedPlan, setSelectedPlan] = React.useState('pro');
        const [showPayment, setShowPayment] = React.useState(false);

        if (showPayment) {
          return h(PaymentScreen, {
            plan: selectedPlan,
            // Шаговая модалка отдаёт в контекст onNext/onClose; onComplete здесь
            // никогда не существовал — оплата падала бы на ReferenceError.
            onSuccess: context?.onNext,
            onCancel: () => setShowPayment(false)
          });
        }

        const containerStyle = {
          padding: '20px',
          textAlign: 'center'
        };

        const messageStyle = {
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '24px',
          lineHeight: '1.5'
        };

        const plansStyle = {
          marginBottom: '24px'
        };

        const buttonStyle = {
          width: '100%',
          padding: '14px 24px',
          backgroundColor: '#22c55e',
          color: '#fff',
          border: 'none',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer'
        };

        return h('div', { style: containerStyle },
          h('div', { style: messageStyle },
            'Для добавления записей и редактирования данных ',
            'необходима активная подписка.'
          ),
          h('div', { style: plansStyle },
            h(PlanCard, { plan: 'base', isSelected: selectedPlan === 'base', onSelect: setSelectedPlan }),
            h(PlanCard, { plan: 'pro', isSelected: selectedPlan === 'pro', onSelect: setSelectedPlan }),
            h(PlanCard, { plan: 'proplus', isSelected: selectedPlan === 'proplus', onSelect: setSelectedPlan })
          ),
          h('button', { style: buttonStyle, onClick: () => setShowPayment(true) },
            'Оформить подписку'
          )
        );
      },

      validate: () => true, // Всегда можно закрыть

      save: () => true,
    });

    return true;
  }

  // Пытаемся зарегистрировать сразу
  if (!registerPaymentRequiredStep()) {
    // Если StepModal ещё не загружен — подписываемся на событие
    document.addEventListener('heys-stepmodal-ready', registerPaymentRequiredStep, { once: true });
  }

  devLog('[HEYS] Subscriptions module loaded v1.0.0');

})(typeof window !== 'undefined' ? window : global);
