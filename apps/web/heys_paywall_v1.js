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
  // СТИЛИ
  // ========================================

  const PAYWALL_STYLES = `
    .paywall-overlay {
      position: fixed;
      inset: 0;
      background: var(--v4-modal-backdrop-dim, rgba(42, 26, 12, 0.45));
      backdrop-filter: blur(var(--v4-modal-backdrop-blur, 2.5px));
      -webkit-backdrop-filter: blur(var(--v4-modal-backdrop-blur, 2.5px));
      z-index: 9999;
      overflow: hidden;
      overscroll-behavior: contain;
      animation: paywallFadeIn 0.2s ease-out;
    }

    [data-theme$="dark"] .paywall-overlay {
      background: var(--v4-modal-backdrop-dim-dark, rgba(0, 0, 0, 0.55));
    }

    @keyframes paywallFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .paywall-modal {
      position: absolute;
      left: 14px;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--v4-bg, var(--bg, #fffaf3));
      border-radius: 26px;
      padding: 22px 18px 18px;
      box-shadow: 0 24px 60px rgba(var(--dp-shadow-rgb, 80, 50, 20), 0.28);
      max-height: calc(100vh - 28px);
      overflow-y: auto;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
      font-family: Figtree, system-ui, -apple-system, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
    }

    .paywall-close {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 34px;
      height: 34px;
      border: none;
      background: var(--v4-surface, var(--c1, #f7efe2));
      border-radius: 999px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(var(--v4-ink-rgb, 32, 30, 29), 0.5);
      padding: 0;
    }

    .paywall-title {
      font: 700 19px/1.2 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
      margin: 0;
      padding-right: 40px;
      text-wrap: pretty;
    }

    .paywall-subtitle {
      font: 500 12.5px/1.5 Figtree, system-ui, sans-serif;
      color: var(--v4-ink-2, rgba(32, 30, 29, 0.62));
      margin: 8px 0 0;
      text-wrap: pretty;
    }

    .paywall-plans {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 14px;
    }

    .paywall-plan {
      border-radius: 18px;
      background: var(--v4-surface, var(--c1, #f7efe2));
      padding: 12px 14px;
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      box-shadow: inset 0 0 0 1px rgba(var(--v4-ink-rgb, 32, 30, 29), 0.06);
      position: relative;
      cursor: pointer;
    }

    .paywall-plan + .paywall-plan {
      margin-top: 0;
    }

    .paywall-plan.popular-offset {
      margin-top: 4px;
    }

    .paywall-plan.selected {
      box-shadow: inset 0 0 0 2px var(--v4-act-surface, var(--acs, #c67139));
    }

    .paywall-plan-main {
      min-width: 0;
      flex: 1;
    }

    .paywall-plan-name {
      font: 700 13.5px/1 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
    }

    .paywall-plan-desc {
      font: 500 11px/1.4 Figtree, system-ui, sans-serif;
      color: var(--v4-ink-2, rgba(32, 30, 29, 0.56));
      margin-top: 4px;
      text-wrap: pretty;
    }

    .paywall-plan-price {
      font: 700 13px/1 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .paywall-plan-period {
      font: 500 11px/1 Figtree, system-ui, sans-serif;
      color: var(--v4-ink-2, rgba(32, 30, 29, 0.5));
      font-weight: 500;
    }

    .paywall-plan-badge {
      position: absolute;
      top: -9px;
      left: 14px;
      font: 700 9px/1 Figtree, system-ui, sans-serif;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 5px 8px;
      border-radius: 999px;
      background: var(--v4-act-surface, var(--acs, #c67139));
      color: var(--v4-on-act-surface, var(--on-acs, #fffaf3));
    }

    .paywall-cta {
      width: 100%;
      min-height: 48px;
      margin-top: 14px;
      border: none;
      border-radius: 999px;
      background: var(--v4-act-surface, var(--acs, #c67139));
      color: var(--v4-on-act-surface, var(--on-acs, #fffaf3));
      font: 700 13px/1 Figtree, system-ui, sans-serif;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 18px;
    }

    .paywall-cta:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .paywall-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 14px 0 12px;
    }

    .paywall-divider-line {
      flex: 1;
      height: 1px;
      background: rgba(var(--v4-ink-rgb, 32, 30, 29), 0.08);
    }

    .paywall-divider-label {
      font: 600 11px/1 Figtree, system-ui, sans-serif;
      color: rgba(var(--v4-ink-rgb, 32, 30, 29), 0.45);
    }

    .paywall-trial {
      background: var(--v4-hero, var(--c2, #efe3cf));
      border-radius: 18px;
      padding: 14px;
      text-align: center;
    }

    .paywall-trial--offer {
      background: var(--v4-tint, var(--tint, #f6e6dd));
    }

    .paywall-trial-title {
      font: 700 13px/1.3 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
    }

    .paywall-trial-status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin-top: 6px;
      font: 600 12px/1 Figtree, system-ui, sans-serif;
    }

    .paywall-trial-status--ok {
      color: var(--v4-ok, var(--gr, #2f9d62));
    }

    .paywall-trial-status--busy {
      color: var(--v4-ink-2, rgba(32, 30, 29, 0.56));
    }

    .paywall-trial-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex: none;
    }

    .paywall-trial-dot--ok {
      background: var(--v4-ok, var(--gr, #2f9d62));
    }

    .paywall-trial-dot--busy {
      background: var(--v4-danger, var(--red, #c4442a));
    }

    .paywall-btnq {
      width: 100%;
      min-height: 44px;
      margin-top: 12px;
      border: none;
      border-radius: 999px;
      background: var(--v4-bg, var(--bg, #fffaf3));
      color: var(--v4-ink, var(--tx, #201e1d));
      font: 700 13px/1 Figtree, system-ui, sans-serif;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 18px;
    }

    .paywall-footnote {
      font: 500 11.5px/1.45 Figtree, system-ui, sans-serif;
      color: var(--v4-ink-2, rgba(32, 30, 29, 0.56));
      text-align: center;
      margin-top: 10px;
      text-wrap: pretty;
    }

    .paywall-order-card {
      background: var(--v4-surface, var(--c1, #f7efe2));
      border-radius: 18px;
      padding: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
    }

    .paywall-order-name {
      font: 700 15px/1.2 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
    }

    .paywall-order-price {
      font: 800 17px/1 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .paywall-order-period {
      font: 500 11px/1 Figtree, system-ui, sans-serif;
      color: var(--v4-ink-2, rgba(32, 30, 29, 0.5));
      margin-top: 4px;
      text-align: right;
    }

    .paywall-consent {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-top: 16px;
      padding: 0 2px;
      cursor: pointer;
    }

    .paywall-consent-box {
      width: 22px;
      height: 22px;
      border-radius: 7px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 0 2px rgba(var(--v4-ink-rgb, 32, 30, 29), 0.25);
      background: transparent;
      color: var(--v4-on-act-surface, var(--on-acs, #fffaf3));
    }

    .paywall-consent-box.is-checked {
      background: var(--v4-act-surface, var(--acs, #c67139));
      box-shadow: none;
    }

    .paywall-consent-text {
      font: 500 12px/1.45 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
      text-wrap: pretty;
    }

    .paywall-consent-link {
      color: var(--v4-act, var(--ac, #c67139));
      text-decoration: underline;
    }

    .paywall-cancel {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      font: 600 12px/1 Figtree, system-ui, sans-serif;
      color: var(--v4-ink-2, rgba(32, 30, 29, 0.56));
      background: transparent;
      border: none;
      width: 100%;
      cursor: pointer;
      padding: 0;
    }

    .paywall-error {
      font: 600 12px/1.4 Figtree, system-ui, sans-serif;
      color: var(--v4-danger, var(--red, #c4442a));
      margin-top: 12px;
      text-align: center;
    }

    .paywall-success-icon {
      width: 56px;
      height: 56px;
      border-radius: 999px;
      background: var(--v4-ok-bg, var(--gr-bg, #e8f6ee));
      color: var(--v4-ok, var(--gr, #2f9d62));
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .paywall-success-card {
      background: var(--v4-surface, var(--c1, #f7efe2));
      border-radius: 18px;
      padding: 14px;
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font: 500 12.5px/1.4 Figtree, system-ui, sans-serif;
      color: var(--v4-ink, var(--tx, #201e1d));
    }

    .paywall-success-card .n {
      font-variant-numeric: tabular-nums;
    }

    .paywall-text-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      margin-top: 6px;
      font: 600 12px/1 Figtree, system-ui, sans-serif;
      color: var(--v4-act, var(--ac, #c67139));
      background: transparent;
      border: none;
      width: 100%;
      cursor: pointer;
      padding: 0;
    }

    /* Read-only banner — кадр «Питание · только чтение»: плашка над
       содержимым в тонах набора, без эмодзи и без стрелки. */
    .readonly-banner {
      background: var(--v4-hero, #f8fafc);
      border-radius: 16px;
      padding: 12px 14px;
      margin: 12px 0 0;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      text-wrap: pretty;
    }

    .readonly-banner-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .readonly-banner-content {
      flex: 1;
    }

    .readonly-banner-title {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.45;
      color: var(--v4-ink, #111827);
    }

    .readonly-banner-text {
      margin-top: 4px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.45;
      color: var(--v4-ink-2, #64748b);
    }

    .readonly-banner-arrow {
      font-size: 18px;
      color: var(--v4-ink-2, #64748b);
    }

    /* Toast notification for blocked action */
    .readonly-toast {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2937;
      color: white;
      padding: 12px 20px;
      border-radius: 12px;
      font-size: 14px;
      z-index: 10000;
      animation: toastSlideUp 0.3s ease-out;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 320px;
    }
    
    @keyframes toastSlideUp {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    
    .readonly-toast-action {
      background: #3b82f6;
      border: none;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      margin-left: 8px;
      white-space: nowrap;
    }
  `;

  // Inject styles
  function injectStyles() {
    if (document.getElementById('heys-paywall-styles')) return;
    const style = document.createElement('style');
    style.id = 'heys-paywall-styles';
    style.textContent = PAYWALL_STYLES;
    document.head.appendChild(style);
  }

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

    const handleCancelQueue = async () => {
      if (!confirm('Отменить запрос на триал?')) return;
      setIsActioning(true);
      try {
        await HEYS.TrialQueue.cancelQueue();
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
              color: 'var(--v4-ink, var(--tx, #201e1d))',
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
          onClick: handleCancelQueue,
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

    injectStyles();

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
    injectStyles();

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

    // Utils
    injectStyles
  };

  // Inject styles on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  devLog('[HEYS] Paywall module loaded v2.0.0 (Trial Queue integration)');

})(typeof window !== 'undefined' ? window : global);
