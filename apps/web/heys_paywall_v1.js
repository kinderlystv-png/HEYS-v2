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

  const PAYWALL_CONFIG = {
    // Цены (в рублях)
    prices: {
      base: 1990,
      pro: 12990,
      proPlus: 19990
    },
    // Триал
    trialDays: 7,
    // Контакты для оплаты (пока без ЮKassa)
    contactTelegram: '@heyslab_support',
    contactEmail: 'pay@heyslab.ru'
  };

  // ========================================
  // СТИЛИ
  // ========================================

  const PAYWALL_STYLES = `
    .paywall-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      overscroll-behavior: contain;
      padding: 16px;
      animation: paywallFadeIn 0.2s ease-out;
    }
    
    @keyframes paywallFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .paywall-modal {
      background: var(--bg-primary, #fff);
      border-radius: 20px;
      max-width: 400px;
      width: 100%;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: paywallSlideUp 0.3s ease-out;
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
    }
    
    @keyframes paywallSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .paywall-header {
      text-align: center;
      margin-bottom: 20px;
    }
    
    .paywall-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    
    .paywall-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary, #1f2937);
      margin: 0 0 8px 0;
    }
    
    .paywall-subtitle {
      font-size: 14px;
      color: var(--text-secondary, #6b7280);
      margin: 0;
      line-height: 1.5;
    }
    
    .paywall-features {
      background: var(--bg-secondary, #f3f4f6);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    
    .paywall-feature {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      font-size: 14px;
      color: var(--text-primary, #1f2937);
    }
    
    .paywall-feature-icon {
      font-size: 18px;
      flex-shrink: 0;
    }
    
    .paywall-plans {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
    }
    
    .paywall-plan {
      border: 2px solid var(--border-color, #e5e7eb);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }
    
    .paywall-plan:hover {
      border-color: var(--accent-color, #3b82f6);
      background: var(--bg-hover, #f9fafb);
    }
    
    .paywall-plan.selected {
      border-color: var(--accent-color, #3b82f6);
      background: rgba(59, 130, 246, 0.05);
    }
    
    .paywall-plan.popular {
      border-color: var(--success-color, #10b981);
    }
    
    .paywall-plan-badge {
      position: absolute;
      top: -10px;
      right: 12px;
      background: var(--success-color, #10b981);
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 10px;
    }
    
    .paywall-plan-name {
      font-weight: 600;
      font-size: 16px;
      color: var(--text-primary, #1f2937);
      margin-bottom: 4px;
    }
    
    .paywall-plan-price {
      font-size: 20px;
      font-weight: 700;
      color: var(--accent-color, #3b82f6);
    }
    
    .paywall-plan-period {
      font-size: 13px;
      color: var(--text-secondary, #6b7280);
      font-weight: 400;
    }
    
    .paywall-plan-desc {
      font-size: 13px;
      color: var(--text-secondary, #6b7280);
      margin-top: 6px;
    }
    
    .paywall-cta {
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .paywall-cta:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }
    
    .paywall-cta:active {
      transform: translateY(0);
    }
    
    .paywall-footer {
      text-align: center;
      margin-top: 16px;
      font-size: 12px;
      color: var(--text-tertiary, #9ca3af);
    }
    
    .paywall-footer a {
      color: var(--accent-color, #3b82f6);
      text-decoration: none;
    }
    
    .paywall-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      border: none;
      background: var(--bg-secondary, #f3f4f6);
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: var(--text-secondary, #6b7280);
      transition: background 0.2s;
    }
    
    .paywall-close:hover {
      background: var(--bg-tertiary, #e5e7eb);
    }
    
    /* Read-only banner */
    .readonly-banner {
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      border-radius: 12px;
      padding: 12px 16px;
      margin: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .readonly-banner:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .readonly-banner-icon {
      font-size: 24px;
      flex-shrink: 0;
    }
    
    .readonly-banner-content {
      flex: 1;
    }
    
    .readonly-banner-title {
      font-weight: 600;
      font-size: 14px;
      color: #92400e;
      margin-bottom: 2px;
    }
    
    .readonly-banner-text {
      font-size: 12px;
      color: #a16207;
    }
    
    .readonly-banner-arrow {
      font-size: 18px;
      color: #a16207;
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

  /**
   * Paywall Modal — полноэкранная модалка с тарифами
   */
  function PaywallModal({ onClose, onSelectPlan, reason }) {
    const [selectedPlan, setSelectedPlan] = React.useState('pro');
    const [showPaymentScreen, setShowPaymentScreen] = React.useState(false);

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

      console.info('[HEYS.paywall] scroll-lock enabled');

      return () => {
        body.style.overflow = previousBodyOverflow;
        body.style.overscrollBehavior = previousBodyOverscrollBehavior;
        documentElement.style.overflow = previousDocumentOverflow;
        documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
        console.info('[HEYS.paywall] scroll-lock released');
      };
    }, []);

    const plans = [
      {
        id: 'base',
        name: 'Base',
        price: PAYWALL_CONFIG.prices.base,
        desc: 'Приложение + подсказки + 1 чек-ин/неделю',
        popular: false
      },
      {
        id: 'pro',
        name: 'Pro',
        price: PAYWALL_CONFIG.prices.pro,
        desc: 'Куратор ведёт дневник + чат + созвон/неделю',
        popular: true
      },
      {
        id: 'proPlus',
        name: 'Pro+',
        price: PAYWALL_CONFIG.prices.proPlus,
        desc: 'Полный режим 7/7 + приоритетный SLA + онлайн на 1 тренировке',
        popular: false
      }
    ];

    // Получаем clientId по стандартному паттерну HEYS
    const getClientId = () => {
      const U = window.HEYS?.utils || window.U;
      return (U && U.getCurrentClientId && U.getCurrentClientId()) || window.HEYS?.currentClientId || '';
    };

    const handleCTA = () => {
      const clientId = getClientId();
      if (clientId && window.HEYS?.YandexAPI?.createPayment) {
        // ЮKassa доступна — показываем PaymentScreen с чекбоксом оферты
        setShowPaymentScreen(true);
      } else {
        // Fallback — Telegram для связи
        const message = encodeURIComponent(`Привет! Хочу оформить подписку ${selectedPlan.toUpperCase()} на HEYS`);
        window.open(`https://t.me/heyslab_support?text=${message}`, '_blank');
        if (onSelectPlan) onSelectPlan(selectedPlan);
      }
    };

    // Если показываем PaymentScreen — рендерим его вместо плана
    if (showPaymentScreen) {
      const clientId = getClientId();
      const SubscriptionsModule = window.HEYS?.Subscriptions;

      if (SubscriptionsModule?.PaymentScreen) {
        return React.createElement('div', { className: 'paywall-overlay', onClick: (e) => e.target === e.currentTarget && setShowPaymentScreen(false) },
          React.createElement('div', { className: 'paywall-modal', style: { position: 'relative', maxHeight: '90vh', overflowY: 'auto' } },
            React.createElement('button', { className: 'paywall-close', onClick: () => setShowPaymentScreen(false) }, '✕'),
            React.createElement(SubscriptionsModule.PaymentScreen, {
              clientId,
              onSuccess: (result) => {
                console.info('[HEYS.paywall] ✅ Оплата успешна:', result);
                onClose?.();
              },
              onCancel: () => setShowPaymentScreen(false)
            })
          )
        );
      }
      // Fallback если PaymentScreen не загружен
      setShowPaymentScreen(false);
    }

    return React.createElement('div', { className: 'paywall-overlay', onClick: (e) => e.target === e.currentTarget && onClose?.() },
      React.createElement('div', { className: 'paywall-modal', style: { position: 'relative' } },
        // Close button
        React.createElement('button', { className: 'paywall-close', onClick: onClose }, '✕'),

        // Header
        React.createElement('div', { className: 'paywall-header' },
          React.createElement('div', { className: 'paywall-icon' }, '🔒'),
          React.createElement('h2', { className: 'paywall-title' },
            reason === 'trial_ended' ? 'Триал закончился' : 'Нужна подписка'
          ),
          React.createElement('p', { className: 'paywall-subtitle' },
            reason === 'trial_ended'
              ? 'Твои 7 дней Pro-доступа истекли. Оформи подписку, чтобы продолжить вести дневник.'
              : 'Для добавления данных нужна активная подписка.'
          )
        ),

        // Features
        React.createElement('div', { className: 'paywall-features' },
          React.createElement('div', { className: 'paywall-feature' },
            React.createElement('span', { className: 'paywall-feature-icon' }, '📊'),
            'Дневник питания без ограничений'
          ),
          React.createElement('div', { className: 'paywall-feature' },
            React.createElement('span', { className: 'paywall-feature-icon' }, '🧠'),
            '182 умных совета на основе твоих данных'
          ),
          React.createElement('div', { className: 'paywall-feature' },
            React.createElement('span', { className: 'paywall-feature-icon' }, '👨‍⚕️'),
            'Живой куратор для Pro тарифов'
          )
        ),

        // Plans
        React.createElement('div', { className: 'paywall-plans' },
          plans.map(plan =>
            React.createElement('div', {
              key: plan.id,
              className: `paywall-plan ${selectedPlan === plan.id ? 'selected' : ''} ${plan.popular ? 'popular' : ''}`,
              onClick: () => setSelectedPlan(plan.id)
            },
              plan.popular && React.createElement('div', { className: 'paywall-plan-badge' }, 'Популярный'),
              React.createElement('div', { className: 'paywall-plan-name' }, plan.name),
              React.createElement('div', { className: 'paywall-plan-price' },
                plan.price.toLocaleString('ru-RU'), ' ₽',
                React.createElement('span', { className: 'paywall-plan-period' }, ' / мес')
              ),
              React.createElement('div', { className: 'paywall-plan-desc' }, plan.desc)
            )
          )
        ),

        // CTA
        React.createElement('button', { className: 'paywall-cta', onClick: handleCTA },
          'Оформить подписку'
        ),

        // === TRIAL QUEUE SECTION ===
        // Разделитель
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '20px 0 16px',
            color: 'var(--text-tertiary, #9ca3af)',
            fontSize: '13px'
          }
        },
          React.createElement('div', { style: { flex: 1, height: '1px', background: 'var(--border-color, #e5e7eb)' } }),
          'или',
          React.createElement('div', { style: { flex: 1, height: '1px', background: 'var(--border-color, #e5e7eb)' } })
        ),

        // Trial Queue виджет (если модуль загружен)
        HEYS.TrialQueue && React.createElement(TrialQueueSection, { onTrialStarted: onClose }),

        // Footer
        React.createElement('div', { className: 'paywall-footer' },
          'Возникли вопросы? ',
          React.createElement('a', { href: 'https://t.me/heyslab_support', target: '_blank' }, 'Напиши нам')
        )
      )
    );
  }

  /**
   * TrialQueueSection — секция очереди внутри Paywall
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
      const interval = setInterval(refresh, 30000);
      return () => clearInterval(interval);
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
      return React.createElement('div', {
        style: { textAlign: 'center', padding: '16px', color: 'var(--text-secondary)' }
      }, '⏳ Проверяем места...');
    }

    const status = queueStatus?.status || 'not_in_queue';
    const isOffer = status === 'offer' && !HEYS.TrialQueue.isOfferExpired(queueStatus?.offer_expires_at);
    const isQueued = status === 'queued';

    // В очереди или есть offer
    if (isQueued || isOffer) {
      const meta = HEYS.TrialQueue.getQueueStatusMeta(status, queueStatus?.position, queueStatus?.offer_expires_at);

      return React.createElement('div', {
        style: {
          background: isOffer ? 'linear-gradient(135deg, #fef3c7, #fde68a)' : 'var(--bg-secondary, #f3f4f6)',
          borderRadius: '12px',
          padding: '16px',
          textAlign: 'center',
          border: isOffer ? '2px solid #f59e0b' : 'none'
        }
      },
        React.createElement('div', { style: { fontSize: '24px', marginBottom: '8px' } }, meta.emoji),
        React.createElement('div', { style: { fontWeight: 600, fontSize: '15px', marginBottom: '4px' } }, meta.label),

        // Таймер
        isOffer && timeRemaining && React.createElement('div', {
          style: {
            fontSize: '20px',
            fontWeight: 700,
            color: '#f59e0b',
            margin: '12px 0',
            background: 'rgba(255,255,255,0.5)',
            borderRadius: '8px',
            padding: '8px'
          }
        }, '⏰ ', timeRemaining),

        // Кнопки
        React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px' } },
          isOffer && React.createElement('button', {
            onClick: handleClaimOffer,
            disabled: isActioning,
            style: {
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px'
            }
          }, isActioning ? '⏳...' : '🎉 Начать триал!'),

          isQueued && React.createElement('button', {
            onClick: handleCancelQueue,
            disabled: isActioning,
            style: {
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #e5e7eb)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px'
            }
          }, 'Отменить')
        )
      );
    }

    // Показываем виджет мест
    const capMeta = capacity ? HEYS.TrialQueue.getCapacityMeta(capacity) : null;

    return React.createElement('div', {
      style: {
        background: 'var(--bg-secondary, #f3f4f6)',
        borderRadius: '12px',
        padding: '16px',
        textAlign: 'center'
      }
    },
      React.createElement('div', { style: { fontSize: '15px', fontWeight: 600, marginBottom: '8px' } },
        '🎁 Бесплатный триал 7 дней'
      ),

      capMeta && React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: '13px',
          color: capMeta.color,
          marginBottom: '12px'
        }
      },
        React.createElement('span', null, capMeta.emoji),
        React.createElement('span', null, capMeta.label)
      ),

      capMeta?.showQueue && React.createElement('div', {
        style: { fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }
      }, capMeta.sublabel),

      React.createElement('button', {
        onClick: handleRequestTrial,
        disabled: isActioning || !capacity?.is_accepting,
        style: {
          padding: '10px 24px',
          borderRadius: '8px',
          border: 'none',
          background: capacity?.available_slots > 0
            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
            : 'linear-gradient(135deg, #6b7280, #4b5563)',
          color: 'white',
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: '14px'
        }
      }, isActioning ? '⏳...' : (capMeta?.actionLabel || 'Запросить триал'))
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

    return React.createElement('div', { className: 'readonly-banner', onClick },
      React.createElement('span', { className: 'readonly-banner-icon' }, '⏰'),
      React.createElement('div', { className: 'readonly-banner-content' },
        React.createElement('div', { className: 'readonly-banner-title' }, 'Триал закончился'),
        React.createElement('div', { className: 'readonly-banner-text' },
          'Данные доступны для просмотра. Нажми чтобы оформить подписку.'
        )
      ),
      React.createElement('span', { className: 'readonly-banner-arrow' }, '→')
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
      return true; // Fallback: разрешаем если модуль не загружен
    }

    try {
      const status = await HEYS.Subscription.getStatus();
      // Можно писать если: trial, active, или нет данных (новый пользователь до регистрации)
      if (!status || !status.status) return true; // Новый пользователь
      return status.status === HEYS.Subscription.STATUS.TRIAL ||
        status.status === HEYS.Subscription.STATUS.ACTIVE ||
        status.status === HEYS.Subscription.STATUS.TRIAL_PENDING;
    } catch (err) {
      devWarn('[Paywall] Error checking status:', err);
      trackError(err, { scope: 'Paywall', action: 'checkStatus' });
      return true; // Fallback: разрешаем при ошибке
    }
  }

  /**
   * Синхронная версия canWrite (использует кэш)
   * @returns {boolean}
   */
  function canWriteSync() {
    if (!HEYS.Subscription) return true;

    const cached = HEYS.Subscription.getCachedStatus?.();
    if (!cached || !cached.status) return true;

    return cached.status === HEYS.Subscription.STATUS.TRIAL ||
      cached.status === HEYS.Subscription.STATUS.ACTIVE ||
      cached.status === HEYS.Subscription.STATUS.TRIAL_PENDING;
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
    const [canWriteState, setCanWrite] = React.useState(true);
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
