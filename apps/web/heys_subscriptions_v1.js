// heys_subscriptions_v1.js — Модуль подписок и платежей
// Версия: 1.0.0 | Дата: 2025-12-20
// 
// Управление статусами подписки, триалом, mock-оплатой
// Реальная интеграция ЮKassa будет добавлена позже

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // =====================================================
  // КОНФИГУРАЦИЯ
  // =====================================================
  
  const CONFIG = {
    TRIAL_DAYS: 7,
    
    PLANS: {
      base: {
        id: 'base',
        name: 'Base',
        price: 1990,
        currency: 'RUB',
        features: [
          'Приложение + умные подсказки',
          '1 чек-ин в неделю (async)'
        ]
      },
      pro: {
        id: 'pro',
        name: 'Pro',
        price: 12990,
        currency: 'RUB',
        recommended: true,
        features: [
          'Всё из Base',
          'Ведение дневника куратором',
          'Чат с куратором',
          'Созвон раз в неделю'
        ]
      },
      proplus: {
        id: 'proplus',
        name: 'Pro+',
        price: 19990,
        currency: 'RUB',
        features: [
          'Всё из Pro',
          '7/7 без дежурного режима',
          'Приоритетный SLA',
          'Mid-week чек-ин'
        ]
      }
    },
    
    STATUSES: {
      trial: { id: 'trial', name: 'Триал', color: '#3b82f6', canEdit: true },
      active: { id: 'active', name: 'Активна', color: '#22c55e', canEdit: true },
      read_only: { id: 'read_only', name: 'Только просмотр', color: '#f59e0b', canEdit: false },
      canceled: { id: 'canceled', name: 'Отменена', color: '#6b7280', canEdit: false }
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
  
  // =====================================================
  // API МЕТОДЫ
  // =====================================================
  
  /**
   * Получить статус подписки клиента
   */
  async function getStatus(clientId) {
    try {
      // Сначала проверяем и обновляем статус (на случай истечения)
      if (HEYS.cloud?.client) {
        const { data, error } = await HEYS.cloud.client.rpc('check_subscription_status', {
          p_client_id: clientId
        });
        
        if (error) throw error;
        return data;
      }
      
      // Fallback: читаем из localStorage
      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      return {
        success: true,
        status: profile.subscription_status || 'trial',
        plan: profile.subscription_plan || null,
        is_trial: true,
        days_left: 7,
        can_edit: true
      };
    } catch (err) {
      console.error('[Subscriptions] getStatus error:', err);
      return { success: false, error: err.message, can_edit: true };
    }
  }
  
  /**
   * Запустить триал (вызывается при первом приёме пищи)
   */
  async function startTrial(clientId) {
    try {
      if (HEYS.cloud?.client) {
        const { data, error } = await HEYS.cloud.client.rpc('start_trial', {
          p_client_id: clientId
        });
        
        if (error) throw error;
        console.log('[Subscriptions] Trial started:', data);
        return data;
      }
      
      // Fallback: сохраняем локально
      const now = new Date();
      const trialEnd = new Date(now.getTime() + CONFIG.TRIAL_DAYS * 24 * 60 * 60 * 1000);
      
      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      profile.subscription_status = 'trial';
      profile.trial_started_at = now.toISOString();
      profile.trial_ends_at = trialEnd.toISOString();
      HEYS.utils?.lsSet?.('heys_profile', profile);
      
      return {
        success: true,
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd.toISOString()
      };
    } catch (err) {
      console.error('[Subscriptions] startTrial error:', err);
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
      
      if (HEYS.cloud?.client) {
        const { data, error } = await HEYS.cloud.client.rpc('activate_subscription', {
          p_client_id: clientId,
          p_plan: plan,
          p_months: months
        });
        
        if (error) throw error;
        console.log('[Subscriptions] Subscription activated:', data);
        return data;
      }
      
      // Fallback: сохраняем локально
      const now = new Date();
      const expiresAt = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
      
      const profile = HEYS.utils?.lsGet?.('heys_profile') || {};
      profile.subscription_status = 'active';
      profile.subscription_plan = plan;
      profile.subscription_started_at = now.toISOString();
      profile.subscription_expires_at = expiresAt.toISOString();
      HEYS.utils?.lsSet?.('heys_profile', profile);
      
      return {
        success: true,
        plan: plan,
        expires_at: expiresAt.toISOString()
      };
    } catch (err) {
      console.error('[Subscriptions] activateSubscription error:', err);
      return { success: false, error: err.message };
    }
  }
  
  /**
   * Проверить, может ли пользователь редактировать данные
   */
  async function canEdit(clientId) {
    const status = await getStatus(clientId);
    return status.can_edit === true;
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
  
  /**
   * Экран выбора тарифа
   */
  function PaymentScreen({ clientId, onSuccess, onCancel }) {
    const [selectedPlan, setSelectedPlan] = useState('pro');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    
    const handlePayment = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await activateSubscription(clientId, selectedPlan, 1);
        
        if (result.success) {
          onSuccess?.(result);
        } else {
          setError(result.error || 'Ошибка оплаты');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    const containerStyle = {
      padding: '20px',
      maxWidth: '500px',
      margin: '0 auto'
    };
    
    const titleStyle = {
      fontSize: '24px',
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: '24px'
    };
    
    const buttonStyle = {
      width: '100%',
      padding: '14px',
      fontSize: '16px',
      fontWeight: '600',
      color: '#fff',
      backgroundColor: loading ? '#9ca3af' : '#22c55e',
      border: 'none',
      borderRadius: '12px',
      cursor: loading ? 'not-allowed' : 'pointer',
      marginTop: '16px'
    };
    
    const cancelStyle = {
      width: '100%',
      padding: '12px',
      fontSize: '14px',
      color: '#6b7280',
      backgroundColor: 'transparent',
      border: 'none',
      cursor: 'pointer',
      marginTop: '8px'
    };
    
    const plans = getPlans();
    const selectedInfo = getPlan(selectedPlan);
    
    return h('div', { style: containerStyle },
      h('h1', { style: titleStyle }, '💳 Выберите тариф'),
      
      plans.map(p => 
        h(PlanCard, {
          key: p.id,
          plan: p.id,
          isSelected: selectedPlan === p.id,
          onSelect: setSelectedPlan
        })
      ),
      
      error && h('div', { 
        style: { 
          color: '#ef4444', 
          textAlign: 'center', 
          marginTop: '12px',
          padding: '8px',
          backgroundColor: '#fef2f2',
          borderRadius: '8px'
        } 
      }, error),
      
      h('button', { 
        style: buttonStyle, 
        onClick: handlePayment,
        disabled: loading 
      }, 
        loading ? 'Обработка...' : `Оплатить ${formatPrice(selectedInfo?.price || 0)}`
      ),
      
      onCancel && h('button', { style: cancelStyle, onClick: onCancel }, 'Отмена')
    );
  }
  
  /**
   * Экран успешной оплаты
   */
  function PaymentSuccessScreen({ plan, expiresAt, onContinue }) {
    const planInfo = getPlan(plan);
    
    const containerStyle = {
      padding: '40px 20px',
      textAlign: 'center',
      maxWidth: '400px',
      margin: '0 auto'
    };
    
    const iconStyle = {
      fontSize: '64px',
      marginBottom: '16px'
    };
    
    const titleStyle = {
      fontSize: '24px',
      fontWeight: '700',
      marginBottom: '8px'
    };
    
    const subtitleStyle = {
      fontSize: '16px',
      color: '#6b7280',
      marginBottom: '24px'
    };
    
    const infoStyle = {
      backgroundColor: '#f0fdf4',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '24px'
    };
    
    const buttonStyle = {
      width: '100%',
      padding: '14px',
      fontSize: '16px',
      fontWeight: '600',
      color: '#fff',
      backgroundColor: '#22c55e',
      border: 'none',
      borderRadius: '12px',
      cursor: 'pointer'
    };
    
    return h('div', { style: containerStyle },
      h('div', { style: iconStyle }, '✅'),
      h('h1', { style: titleStyle }, 'Подписка активирована!'),
      h('p', { style: subtitleStyle }, `Тариф ${planInfo?.name || plan}`),
      
      h('div', { style: infoStyle },
        h('div', { style: { marginBottom: '8px' } }, 
          '📅 Активна до: ', h('strong', null, formatDate(expiresAt))
        ),
        h('div', null, 
          '💰 Стоимость: ', h('strong', null, formatPrice(planInfo?.price || 0) + '/мес')
        )
      ),
      
      h('button', { style: buttonStyle, onClick: onContinue }, 'Продолжить')
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
      loadStatus();
    }, [clientId]);
    
    const loadStatus = async () => {
      setLoading(true);
      const result = await getStatus(clientId);
      setStatus(result);
      setLoading(false);
    };
    
    const handleSuccess = (result) => {
      setShowPayment(false);
      loadStatus();
    };
    
    if (loading) {
      return h('div', { style: { padding: '16px', textAlign: 'center' } }, 'Загрузка...');
    }
    
    if (showPayment) {
      return h(PaymentScreen, { 
        clientId, 
        onSuccess: handleSuccess,
        onCancel: () => setShowPayment(false)
      });
    }
    
    const sectionStyle = {
      backgroundColor: '#f9fafb',
      borderRadius: '12px',
      padding: '16px',
      margin: '16px 0'
    };
    
    const headerStyle = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12px'
    };
    
    const titleStyle = {
      fontSize: '16px',
      fontWeight: '600'
    };
    
    const infoStyle = {
      fontSize: '14px',
      color: '#6b7280'
    };
    
    const buttonStyle = {
      padding: '8px 16px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#22c55e',
      backgroundColor: '#f0fdf4',
      border: '1px solid #22c55e',
      borderRadius: '8px',
      cursor: 'pointer',
      marginTop: '12px'
    };
    
    const statusInfo = getStatusInfo(status?.status);
    const planInfo = status?.plan ? getPlan(status.plan) : null;
    
    return h('div', { style: sectionStyle },
      h('div', { style: headerStyle },
        h('div', { style: titleStyle }, '📋 Подписка'),
        h(SubscriptionBadge, { 
          status: status?.status, 
          plan: status?.plan,
          daysLeft: status?.days_left
        })
      ),
      
      status?.is_trial && h('div', { style: infoStyle },
        `Триал до ${formatDate(status.trial_ends_at)}`,
        status.days_left > 0 && ` (осталось ${status.days_left} дн.)`
      ),
      
      status?.status === 'active' && h('div', { style: infoStyle },
        planInfo && `Тариф: ${planInfo.name}`,
        h('br'),
        `Активна до ${formatDate(status.subscription_expires_at)}`
      ),
      
      (status?.status === 'trial' || status?.status === 'read_only') && 
        h('button', { style: buttonStyle, onClick: () => setShowPayment(true) }, 
          status?.status === 'trial' ? 'Оформить подписку' : 'Продлить подписку'
        )
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
    
    // API
    getStatus,
    startTrial,
    activateSubscription,
    canEdit,
    showPaymentRequired,
    
    // Components
    SubscriptionBadge,
    PlanCard,
    PaymentScreen,
    PaymentSuccessScreen,
    PaywallBanner,
    SubscriptionSection
  };
  
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
      hideBackButton: true,
      
      render: ({ onComplete }) => {
        const [selectedPlan, setSelectedPlan] = React.useState('pro');
        const [showPayment, setShowPayment] = React.useState(false);
        
        if (showPayment) {
          return h(PaymentScreen, {
            plan: selectedPlan,
            onSuccess: onComplete,
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
            h(PlanCard, { plan: 'pro_plus', isSelected: selectedPlan === 'pro_plus', onSelect: setSelectedPlan })
          ),
          h('button', { style: buttonStyle, onClick: () => setShowPayment(true) },
            'Оформить подписку'
          )
        );
      },
      
      validate: () => true, // Всегда можно закрыть
      
      onSave: () => {
        // Ничего не сохраняем, это информационный шаг
      }
    });
    
    return true;
  }
  
  // Пытаемся зарегистрировать сразу
  if (!registerPaymentRequiredStep()) {
    // Если StepModal ещё не загружен — подписываемся на событие
    window.addEventListener('heys:step-modal-ready', registerPaymentRequiredStep, { once: true });
  }
  
  console.log('[HEYS] Subscriptions module loaded v1.0.0');
  
})(typeof window !== 'undefined' ? window : global);
