// heys_paywall_v1.js — Read-only gating + Paywall UI + Trial Queue integration
// v2.0.0 | 2025-12-25
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  const DEV = global.DEV || {};
  const devLog = typeof DEV.log === 'function' ? DEV.log.bind(DEV) : function () { };
  const devWarn = typeof DEV.warn === 'function' ? DEV.warn.bind(DEV) : function () { };
  const trackError = (error, context) => {
    if (!HEYS?.analytics?.trackError) return;
    try {
      const err = error instanceof Error ? error : new Error(String(error || 'Paywall error'));
      HEYS.analytics.trackError(err, context);
    } catch (_) { }
  };

  // ========================================
  // КОНСТАНТЫ
  // ========================================

  HEYS.support = HEYS.support || {
    telegramHandle: '@heyslab_support_bot',
    telegramUrl: 'https://t.me/heyslab_support_bot',
    email: 'pay@heyslab.ru',
  };

  // Цены тарифов — единый источник для paywall и subscriptions модулей.
  // Должны совпадать с apps/landing/src/config/pricing.ts.
  HEYS.config = HEYS.config || {};
  HEYS.config.prices = HEYS.config.prices || {
    base: 490,
    pro: 7990,
    proPlus: 19990,
  };

  const PAYWALL_CONFIG = {
    prices: HEYS.config.prices,
    trialDays: 7,
    contactTelegram: HEYS.support.telegramHandle,
    contactEmail: HEYS.support.email,
  };

  // ========================================
  // СТИЛИ — styles/modules/735-ui-v4-subscription.css (main.css import)
  // ========================================

  // ========================================
  // REACT КОМПОНЕНТЫ
  // ========================================

  function paywallCloseIcon() {
    return React.createElement('svg', {
      width: 15,
      height: 15,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2.75,
      strokeLinecap: 'round',
      'aria-hidden': 'true',
    }, React.createElement('path', { d: 'M18 6L6 18M6 6l12 12' }));
  }

  function formatPlanPrice(price) {
    return `${price.toLocaleString('ru-RU')} ₽`;
  }

  function getPaywallPlans() {
    return [
      {
        id: 'base',
        name: 'Self',
        price: PAYWALL_CONFIG.prices.base,
        desc: 'Самостоятельный дневник: КБЖУ, динамика, виджеты',
        popular: false,
      },
      {
        id: 'pro',
        name: 'Pro',
        price: PAYWALL_CONFIG.prices.pro,
        desc: 'Куратор ведёт дневник, чат, созвон раз в неделю',
        popular: true,
      },
      {
        id: 'proPlus',
        name: 'Pro Спорт',
        price: PAYWALL_CONFIG.prices.proPlus,
        desc: 'Питание и тренировки с одним специалистом · после согласования',
        popular: false,
      },
    ];
  }

  function getPaywallCtaLabel(selectedPlan, plans) {
    const plan = plans.find((item) => item.id === selectedPlan);
    if (!plan) return 'Оформить подписку';
    if (selectedPlan === 'proPlus') return 'Написать в поддержку';
    return `Оформить ${plan.name} · ${formatPlanPrice(plan.price)}`;
  }

  /**
   * Paywall Modal — центральная модалка тарифов (фаза 2)
   */
  function PaywallModal({ onClose, onSelectPlan, reason }) {
    const [selectedPlan, setSelectedPlan] = React.useState('pro');
    const [showPaymentScreen, setShowPaymentScreen] = React.useState(false);
    const paymentsEnabled = HEYS.config?.paymentsEnabled === true;
    const plans = getPaywallPlans();

    React.useEffect(() => {
      if (typeof document === 'undefined') return undefined;

      const { body, documentElement } = document;
      if (!body || !documentElement) return undefined;

      const previousBodyOverflow = body.style.overflow;
      const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
      const previousDocumentOverflow = documentElement.style.overflow;
      const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;

      body.style.overflow = 'hidden';
      body.style.overscrollBehavior = 'none';
      documentElement.style.overflow = 'hidden';
      documentElement.style.overscrollBehavior = 'none';

      return () => {
        body.style.overflow = previousBodyOverflow;
        body.style.overscrollBehavior = previousBodyOverscrollBehavior;
        documentElement.style.overflow = previousDocumentOverflow;
        documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
      };
    }, []);

    const getClientId = () => {
      const U = window.HEYS?.utils || window.U;
      return (U && U.getCurrentClientId && U.getCurrentClientId()) || window.HEYS?.currentClientId || '';
    };

    const handleCTA = () => {
      const clientId = getClientId();
      if (selectedPlan === 'proPlus') {
        window.open(HEYS.support.telegramUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      if (paymentsEnabled && clientId && window.HEYS?.YandexAPI?.createPayment) {
        setShowPaymentScreen(true);
        return;
      }
      const message = encodeURIComponent(`Привет! Хочу оформить подписку ${selectedPlan.toUpperCase()} на HEYS`);
      window.open(`${HEYS.support.telegramUrl}?text=${message}`, '_blank');
      if (onSelectPlan) onSelectPlan(selectedPlan);
    };

    if (paymentsEnabled && showPaymentScreen) {
      const clientId = getClientId();
      const SubscriptionsModule = window.HEYS?.Subscriptions;

      if (SubscriptionsModule?.PaymentScreen) {
        return React.createElement('div', {
          className: 'paywall-overlay',
          onClick: (e) => e.target === e.currentTarget && setShowPaymentScreen(false),
          role: 'dialog',
          'aria-modal': 'true',
        },
          React.createElement('div', { className: 'paywall-modal', style: { position: 'relative' } },
            React.createElement('button', {
              type: 'button',
              className: 'paywall-close',
              onClick: () => setShowPaymentScreen(false),
              'aria-label': 'Закрыть',
            }, paywallCloseIcon()),
            React.createElement(SubscriptionsModule.PaymentScreen, {
              clientId,
              plan: selectedPlan,
              embedded: true,
              onSuccess: (result) => {
                console.info('[HEYS.paywall] ✅ Оплата успешна:', result);
                onClose?.();
              },
              onCancel: () => setShowPaymentScreen(false),
            })
          )
        );
      }
      setShowPaymentScreen(false);
    }

    const title = reason === 'trial_ended' ? 'Пробный период закончился' : 'Подписка';

    return React.createElement('div', {
      className: 'paywall-overlay',
      onClick: (e) => e.target === e.currentTarget && onClose?.(),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'paywall-modal-title',
    },
      React.createElement('div', { className: 'paywall-modal', style: { position: 'relative' } },
        React.createElement('button', {
          type: 'button',
          className: 'paywall-close',
          onClick: onClose,
          'aria-label': 'Закрыть',
        }, paywallCloseIcon()),

        React.createElement('h2', { id: 'paywall-modal-title', className: 'paywall-title' }, title),
        React.createElement('p', { className: 'paywall-subtitle' },
          'Выберите тариф — доступ откроется сразу после оплаты.'
        ),

        React.createElement('div', { className: 'paywall-plans', role: 'radiogroup', 'aria-label': 'Тарифы' },
          plans.map((plan, index) =>
            React.createElement('div', {
              key: plan.id,
              className: [
                'paywall-plan',
                selectedPlan === plan.id ? 'selected' : '',
                plan.popular && index > 0 ? 'popular-offset' : '',
              ].filter(Boolean).join(' '),
              onClick: () => setSelectedPlan(plan.id),
              role: 'radio',
              'aria-checked': selectedPlan === plan.id,
            },
              plan.popular && React.createElement('div', { className: 'paywall-plan-badge' }, 'Популярный'),
              React.createElement('div', { className: 'paywall-plan-main' },
                React.createElement('div', { className: 'paywall-plan-name' }, plan.name),
                React.createElement('div', { className: 'paywall-plan-desc' }, plan.desc)
              ),
              React.createElement('div', { className: 'paywall-plan-price' },
                formatPlanPrice(plan.price),
                ' ',
                React.createElement('span', { className: 'paywall-plan-period' }, '/ мес')
              )
            )
          )
        ),

        React.createElement('button', { type: 'button', className: 'paywall-cta', onClick: handleCTA },
          getPaywallCtaLabel(selectedPlan, plans)
        ),

        selectedPlan === 'proPlus' && React.createElement('p', { className: 'paywall-footnote' },
          'Pro Спорт подключается после согласования — поддержка ответит и оформит.'
        ),

        selectedPlan !== 'proPlus' && React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'paywall-divider' },
            React.createElement('span', { className: 'paywall-divider-line' }),
            React.createElement('span', { className: 'paywall-divider-label' }, 'или'),
            React.createElement('span', { className: 'paywall-divider-line' })
          ),
          HEYS.TrialQueue && React.createElement(TrialQueueSection, { onTrialStarted: onClose })
        )
      )
    );
  }

  /**
   * TrialQueueSection — блок пробного периода внутри Paywall
   */
  function TrialQueueSection({ onTrialStarted }) {
    const [capacity, setCapacity] = React.useState(null);
    const [queueStatus, setQueueStatus] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isActioning, setIsActioning] = React.useState(false);
    const [cancelConfirmOpen, setCancelConfirmOpen] = React.useState(false);
    const [timeRemaining, setTimeRemaining] = React.useState('');

    const refresh = React.useCallback(async () => {
      if (!HEYS.TrialQueue) return;

      setIsLoading(true);
      try {
        const [cap, status] = await Promise.all([
          HEYS.TrialQueue.getCapacity(true),
          HEYS.TrialQueue.getQueueStatus(true)
        ]);
        setCapacity(cap);
        setQueueStatus(status);
      } finally {
        setIsLoading(false);
      }
    }, []);

    // Таймер для offer
    React.useEffect(() => {
      if (queueStatus?.status !== 'offer' || !queueStatus?.offer_expires_at) {
        setTimeRemaining('');
        return;
      }

      const updateTimer = () => {
        setTimeRemaining(HEYS.TrialQueue.formatTimeRemaining(queueStatus.offer_expires_at));
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [queueStatus?.status, queueStatus?.offer_expires_at]);

    React.useEffect(() => {
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

    const handleRequestTrial = async () => {
      setIsActioning(true);
      try {
        const result = await HEYS.TrialQueue.requestTrial('paywall');
        if (result.success || result.status) {
          await refresh();
        } else {
          alert(result.message || 'Ошибка запроса');
        }
      } finally {
        setIsActioning(false);
      }
    };

    const handleClaimOffer = async () => {
      setIsActioning(true);
      try {
        const result = await HEYS.TrialQueue.claimOffer();
        if (result.success) {
          // Триал стартовал!
          if (HEYS.Subscription?.clearCache) HEYS.Subscription.clearCache();
          window.dispatchEvent(new Event('heys:subscription-changed'));
          onTrialStarted?.();
        } else {
          alert(result.message || 'Ошибка подтверждения');
          await refresh();
        }
      } finally {
        setIsActioning(false);
      }
    };

    const handleCancelQueueConfirm = async () => {
      setIsActioning(true);
      try {
        await HEYS.TrialQueue.cancelQueue();
        setCancelConfirmOpen(false);
        await refresh();
      } finally {
        setIsActioning(false);
      }
    };

    if (isLoading && !capacity) {
      return React.createElement('div', { className: 'paywall-trial' },
        React.createElement('div', { className: 'paywall-trial-title' }, 'Пробный период 7 дней — бесплатно'),
        React.createElement('div', { className: 'paywall-trial-status paywall-trial-status--busy' }, 'Проверяем места…')
      );
    }

    const status = queueStatus?.status || 'not_in_queue';
    const isOffer = status === 'offer' && !HEYS.TrialQueue.isOfferExpired(queueStatus?.offer_expires_at);
    const isQueued = status === 'queued' || status === 'pending';

    if (isQueued || isOffer) {
      if (isOffer) {
        return React.createElement('div', { className: 'paywall-trial paywall-trial--offer' },
          React.createElement('div', { className: 'paywall-trial-title' }, 'Место освободилось'),
          timeRemaining && React.createElement('div', {
            className: 'n',
            style: {
              font: '800 26px/1 Figtree, system-ui, sans-serif',
              color: 'var(--v4-ink, #201e1d)',
              marginTop: '8px',
              fontVariantNumeric: 'tabular-nums',
            },
          }, timeRemaining),
          React.createElement('div', {
            style: {
              font: '500 11px/1.4 Figtree, system-ui, sans-serif',
              color: 'var(--v4-ink-2, rgba(32, 30, 29, 0.56))',
              marginTop: '4px',
            },
          }, 'на подтверждение'),
          React.createElement('button', {
            type: 'button',
            className: 'paywall-cta',
            onClick: handleClaimOffer,
            disabled: isActioning,
          }, isActioning ? 'Подтверждаем…' : 'Начать пробный период')
        );
      }

      if (cancelConfirmOpen) {
        return React.createElement('div', { className: 'paywall-trial paywall-trial--cancel-confirm' },
          React.createElement('div', { className: 'paywall-trial-title' }, 'Отменить заявку на пробный период?'),
          React.createElement('button', {
            type: 'button',
            className: 'btn',
            onClick: handleCancelQueueConfirm,
            disabled: isActioning,
          }, isActioning ? 'Отменяем…' : 'Отменить заявку'),
          React.createElement('button', {
            type: 'button',
            className: 'btnq',
            onClick: () => setCancelConfirmOpen(false),
            disabled: isActioning,
          }, 'Оставить')
        );
      }

      const position = queueStatus?.position;
      return React.createElement('div', { className: 'paywall-trial' },
        React.createElement('div', { className: 'paywall-trial-title' },
          position ? `Заявка подана · вы ${position}-й в очереди` : 'Заявка подана'
        ),
        React.createElement('div', {
          style: {
            font: '500 11px/1.4 Figtree, system-ui, sans-serif',
            color: 'var(--v4-ink-2, rgba(32, 30, 29, 0.56))',
            marginTop: '4px',
          },
        }, 'Сообщим, когда место освободится'),
        React.createElement('button', {
          type: 'button',
          className: 'paywall-text-btn',
          onClick: () => setCancelConfirmOpen(true),
          disabled: isActioning,
        }, 'Отменить заявку')
      );
    }

    const available = capacity?.available_slots > 0
      || (capacity?.is_accepting && (capacity?.available_slots === undefined || capacity?.available_slots > 0));
    const queueSize = capacity?.queue_length ?? capacity?.queue_size ?? 0;

    return React.createElement('div', { className: 'paywall-trial' },
      React.createElement('div', { className: 'paywall-trial-title' }, 'Пробный период 7 дней — бесплатно'),
      React.createElement('div', {
        className: `paywall-trial-status ${available ? 'paywall-trial-status--ok' : 'paywall-trial-status--busy'}`,
      },
        React.createElement('span', {
          className: `paywall-trial-dot ${available ? 'paywall-trial-dot--ok' : 'paywall-trial-dot--busy'}`,
        }),
        available ? 'Место свободно' : `Мест нет · в очереди ${queueSize}`
      ),
      React.createElement('button', {
        type: 'button',
        className: 'paywall-btnq',
        onClick: handleRequestTrial,
        disabled: isActioning || !capacity?.is_accepting,
      }, isActioning ? 'Отправляем…' : (available ? 'Начать пробный период' : 'Встать в очередь'))
    );
  }

  /**
   * Read-only Banner — компактный баннер для показа в UI
   */
  function ReadOnlyBanner({ onClick, compact = false }) {
    if (compact) {
      return React.createElement('div', {
        className: 'readonly-banner',
        onClick,
        style: { margin: '8px', padding: '10px 12px' }
      },
        React.createElement('span', { className: 'readonly-banner-icon' }, '🔒'),
        React.createElement('div', { className: 'readonly-banner-content' },
          React.createElement('div', { className: 'readonly-banner-title' }, 'Режим просмотра'),
          React.createElement('div', { className: 'readonly-banner-text' }, 'Нажми чтобы активировать')
        ),
        React.createElement('span', { className: 'readonly-banner-arrow' }, '→')
      );
    }

    // Плашка называет причину и что делать; эмодзи и стрелки на вкладке нет.
    return React.createElement('div', { className: 'readonly-banner', onClick },
      React.createElement('div', { className: 'readonly-banner-content' },
        React.createElement('div', { className: 'readonly-banner-title' }, 'Пробный период закончился'),
        React.createElement('div', { className: 'readonly-banner-text' },
          'День и история открыты для чтения. Чтобы записывать снова — напишите куратору.'
        )
      )
    );
  }

  // ========================================
  // GATING LOGIC
  // ========================================

  let _paywallContainer = null;
  let _paywallRootInstance = null;

  /**
   * Показать paywall модалку
   */
  function showPaywall(reason = 'subscription_required') {
    if (
      HEYS.config?.paymentsEnabled !== true &&
      typeof HEYS.Subscriptions?.openCuratorContactModal === 'function'
    ) {
      HEYS.Subscriptions.openCuratorContactModal();
      return;
    }

    if (!_paywallContainer) {
      _paywallContainer = document.createElement('div');
      _paywallContainer.id = 'heys-paywall-container';
      document.body.appendChild(_paywallContainer);
    }

    const handleClose = () => {
      if (_paywallRootInstance) {
        _paywallRootInstance.unmount();
        _paywallRootInstance = null;
      }
    };

    if (!_paywallRootInstance) {
      _paywallRootInstance = ReactDOM.createRoot(_paywallContainer);
    }

    _paywallRootInstance.render(
      React.createElement(PaywallModal, {
        onClose: handleClose,
        reason
      })
    );
  }

  /**
   * Скрыть paywall
   */
  function hidePaywall() {
    if (_paywallRootInstance) {
      _paywallRootInstance.unmount();
      _paywallRootInstance = null;
    }
  }

  let _toastTimeout = null;

  /**
   * Показать toast о заблокированном действии
   */
  function showBlockedToast(message = 'Действие недоступно в режиме просмотра') {
    // Удаляем предыдущий toast
    const existing = document.querySelector('.readonly-toast');
    if (existing) existing.remove();
    if (_toastTimeout) clearTimeout(_toastTimeout);

    const toast = document.createElement('div');
    toast.className = 'readonly-toast';
    toast.innerHTML = `
      <span>🔒</span>
      <span>${message}</span>
      <button class="readonly-toast-action" onclick="HEYS.Paywall.show('trial_ended')">Подписка</button>
    `;
    document.body.appendChild(toast);

    _toastTimeout = setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  /**
   * Проверка: разрешено ли писать данные?
   * @returns {boolean} true если можно писать
   */
  async function canWrite() {
    if (!HEYS.Subscription) {
      devWarn('[Paywall] Subscription module not loaded');
      return false;
    }

    try {
      const status = await HEYS.Subscription.getStatus();
      return HEYS.Subscription.canWriteStatus?.(status) === true;
    } catch (err) {
      devWarn('[Paywall] Error checking status:', err);
      trackError(err, { scope: 'Paywall', action: 'checkStatus' });
      return false;
    }
  }

  /**
   * Синхронная версия canWrite (использует кэш)
   * @returns {boolean}
   */
  function canWriteSync() {
    if (!HEYS.Subscription) return false;

    const normalizeStatus = HEYS.Subscription.normalizeStatus;
    const cached = normalizeStatus?.(HEYS.Subscription.getCachedStatus?.())
      || normalizeStatus?.(HEYS.Subscription.getLocalStatus?.());
    if (!cached) {
      requestStatusRefresh('empty-cache');
      return false;
    }

    const allowed = HEYS.Subscription.canWriteStatus?.(cached) === true;
    if (!allowed) requestStatusRefresh(cached);
    return allowed;
  }

  let _statusRefreshPromise = null;
  function requestStatusRefresh(reason) {
    if (_statusRefreshPromise || !HEYS.Subscription?.refresh) return;
    _statusRefreshPromise = HEYS.Subscription.refresh()
      .catch((err) => {
        devWarn('[Paywall] status refresh failed:', reason, err?.message || err);
      })
      .finally(() => {
        _statusRefreshPromise = null;
      });
  }

  /**
   * Gate wrapper для write actions
   * Показывает toast и блокирует действие если read-only
   * @param {Function} action - действие для выполнения
   * @param {string} actionName - название действия для лога
   * @returns {Function} wrapped action
   */
  function gateWrite(action, actionName = 'action') {
    return async function (...args) {
      if (!canWriteSync()) {
        devLog(`[Paywall] Blocked ${actionName}: read-only mode`);
        showBlockedToast(`Добавление данных недоступно`);
        return null;
      }
      return action.apply(this, args);
    };
  }

  /**
   * React Hook для проверки write access
   * @returns {{ canWrite: boolean, isLoading: boolean, showPaywall: Function }}
   */
  function useWriteAccess() {
    const [canWriteState, setCanWrite] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
      let mounted = true;

      canWrite().then(result => {
        if (mounted) {
          setCanWrite(result);
          setIsLoading(false);
        }
      });

      // Subscribe to subscription changes
      const handleChange = () => {
        canWrite().then(result => {
          if (mounted) setCanWrite(result);
        });
      };

      window.addEventListener('heys:subscription-changed', handleChange);
      return () => {
        mounted = false;
        window.removeEventListener('heys:subscription-changed', handleChange);
      };
    }, []);

    return {
      canWrite: canWriteState,
      isLoading,
      showPaywall: () => showPaywall('trial_ended')
    };
  }

  // ========================================
  // ЭКСПОРТ
  // ========================================

  HEYS.Paywall = {
    // UI
    show: showPaywall,
    hide: hidePaywall,
    showBlockedToast,

    // Components
    PaywallModal,
    ReadOnlyBanner,

    // Gating
    canWrite,
    canWriteSync,
    gateWrite,
    useWriteAccess,

    // Config
    CONFIG: PAYWALL_CONFIG,
  };

  devLog('[HEYS] Paywall module loaded v2.0.0 (Trial Queue integration)');

})(typeof window !== 'undefined' ? window : global);
