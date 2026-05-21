// heys_consents_v1.js — Модуль согласий и ПЭП (простая электронная подпись)
// Версия: 1.0
// 152-ФЗ compliant consent management

(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const { useState, useEffect, useCallback, useRef } = React || {};

  // =====================================================
  // Константы
  // =====================================================

  const CONSENT_TYPES = {
    USER_AGREEMENT: 'user_agreement',
    PERSONAL_DATA: 'personal_data',
    HEALTH_DATA: 'health_data',
    MARKETING: 'marketing',
    PAYMENT_OFERTA: 'payment_oferta'
  };

  const CURRENT_VERSIONS = {
    user_agreement: '1.5',
    personal_data: '1.5',
    health_data: '1.3',  // Отдельный документ согласия на данные о здоровье
    marketing: '1.2',
    payment_oferta: '1.2'  // Акцепт оферты при оплате (ст. 438 ГК РФ)
  };

  const REQUIRED_CONSENTS = [
    CONSENT_TYPES.USER_AGREEMENT,
    CONSENT_TYPES.PERSONAL_DATA,
    CONSENT_TYPES.HEALTH_DATA
  ];

  // =====================================================
  // Конфигурация верификации
  // =====================================================

  // SMS верификация отключена — используем только чекбоксы + логирование
  // Это полностью законно по 152-ФЗ ст.9 (согласие в любой форме с подтверждением получения)
  // SMS можно включить позже после настройки буквенного отправителя в SMS.ru
  const SMS_VERIFICATION_ENABLED = false;

  // =====================================================
  // Тексты документов
  // =====================================================

  const CONSENT_TEXTS = {
    // Короткие тексты для чекбоксов
    checkboxes: {
      user_agreement: {
        label: 'Принимаю условия Пользовательского соглашения (Оферты)',
        link: '/legal/user-agreement',
        required: true
      },
      personal_data: {
        label: 'Даю согласие на обработку моих персональных данных в соответствии с Политикой конфиденциальности',
        link: '/legal/privacy-policy',
        required: true
      },
      health_data: {
        label: 'Даю явное согласие на обработку данных о здоровье (питание, вес, активность) в целях предоставления услуг Сервиса',
        link: '/legal/health-data-consent',  // Отдельный документ по 152-ФЗ ст.10
        required: true
      },
      marketing: {
        label: 'Согласен получать информационные и рекламные материалы сервиса',
        link: null,
        required: false
      },
      notifications: {
        label: 'Напоминания и важные события (статус триала, новые сообщения куратора)',
        link: null,
        required: false
      },
      payment_oferta: {
        label: 'Нажимая «Оплатить», принимаю условия Публичной оферты и Политики конфиденциальности',
        link: 'https://heyslab.ru/legal/user-agreement',
        secondaryLink: 'https://heyslab.ru/legal/privacy-policy',
        required: true
      }
    },

    // Дружелюбные описания документов для модального окна
    friendlySummaries: {
      user_agreement: {
        emoji: '🤝',
        title: 'Что это значит простыми словами?',
        color: '#dbeafe', // blue-100
        borderColor: '#3b82f6', // blue-500
        textColor: '#1e40af', // blue-800
        points: [
          '📱 Вы получаете доступ к приложению HEYS для ведения дневника питания',
          '👨‍💼 При выборе тарифа Pro/Pro+ — персональное сопровождение куратора',
          '⚠️ Это НЕ медицинская услуга — куратор помогает с питанием, но не ставит диагнозы',
          '💰 Пробный период 7 дней бесплатно, потом — помесячная оплата',
          '🚪 Можно отказаться в любой момент и получить возврат за неиспользованные дни'
        ]
      },
      personal_data: {
        emoji: '🔒',
        title: 'Что мы делаем с вашими данными?',
        color: '#dcfce7', // green-100
        borderColor: '#22c55e', // green-500
        textColor: '#166534', // green-800
        points: [
          '📝 Храним имя и телефон для входа в аккаунт',
          '🇷🇺 Все данные хранятся в России (Яндекс.Облако)',
          '🔐 Никому не передаём и не продаём ваши данные',
          '🗑️ Можете запросить удаление всех данных в любой момент',
          '📧 Рассылки отправляем только с вашего согласия'
        ]
      },
      health_data: {
        emoji: '❤️',
        title: 'Зачем нам данные о здоровье?',
        color: '#fce7f3', // pink-100
        borderColor: '#ec4899', // pink-500
        textColor: '#9d174d', // pink-800
        points: [
          '🍎 Записываем что и сколько вы едите',
          '⚖️ Следим за изменениями веса',
          '🏃 Учитываем физическую активность',
          '📊 На основе этого даём персональные рекомендации по питанию',
          '🛡️ Это «особые данные» по закону — храним их с повышенной защитой'
        ]
      },
      marketing: {
        emoji: '📬',
        title: 'Что будем присылать?',
        color: '#fef3c7', // amber-100
        borderColor: '#f59e0b', // amber-500
        textColor: '#92400e', // amber-800
        points: [
          '💡 Полезные советы по питанию и здоровому образу жизни',
          '🎁 Информацию о новых функциях и акциях',
          '📊 Периодические отчёты о вашем прогрессе',
          '🔕 Можно отписаться в любой момент в настройках',
          '✉️ Отправляем не чаще 1-2 раз в неделю'
        ]
      }
    },

    // Дисклеймер
    disclaimer: {
      short: 'HEYS — сервис учёта питания и сопровождения. Не является медицинской услугой.',
      full: 'HEYS предоставляет информационные услуги по учёту питания и коучинговое сопровождение. ' +
        'Сервис НЕ является медицинской организацией, не оказывает медицинские услуги, ' +
        'не ставит диагнозы и не назначает лечение. При наличии заболеваний обратитесь к врачу.'
    },

    // Полный текст согласия (краткая версия для экрана)
    consentSummary: `
Нажимая «Продолжить», вы подтверждаете:
• Ознакомление с Пользовательским соглашением (Офертой)
• Согласие на обработку персональных данных  
• Явное согласие на обработку данных о здоровье

Согласие даётся до начала обработки данных и может быть отозвано в любой момент через настройки профиля.
    `.trim()
  };

  // =====================================================
  // API для работы с согласиями
  // =====================================================

  const consentsAPI = {
    /**
     * Логирование согласий через YandexAPI
     */
    async logConsents(clientId, consents) {
      try {
        // Используем YandexAPI
        if (HEYS.YandexAPI) {
          const result = await HEYS.YandexAPI.logConsents(clientId, consents, navigator.userAgent);
          if (result.error) throw new Error(result.error?.message || result.error);
          console.log('[Consents] ✅ Logged:', result);
          // Нормализуем результат — YandexAPI возвращает { data: { log_consents: { success, logged_count } }, error: null }
          return { success: result.data?.log_consents?.success ?? !result.error, data: result.data };
        }

        console.warn('[Consents] YandexAPI not available');
        return { success: false, error: 'No API client' };
      } catch (err) {
        console.error('[Consents] ❌ Error logging:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Проверка наличия всех обязательных согласий
     */
    async checkRequired(clientId) {
      try {
        // Используем YandexAPI
        if (HEYS.YandexAPI) {
          const result = await HEYS.YandexAPI.checkRequiredConsents(clientId);
          if (result.error) throw new Error(result.error?.message || result.error);
          // Нормализуем результат — YandexAPI возвращает { data: { check_required_consents: { valid, missing } }, error: null }
          const data = result.data?.check_required_consents || result.data;
          return {
            valid: data?.valid ?? false,
            missing: data?.missing || REQUIRED_CONSENTS
          };
        }

        return { valid: false, missing: REQUIRED_CONSENTS };
      } catch (err) {
        console.error('[Consents] ❌ Error checking:', err);
        return { valid: false, missing: REQUIRED_CONSENTS, error: err.message };
      }
    },

    /**
     * Отзыв согласия
     */
    async revoke(clientId, consentType) {
      try {
        // Используем YandexAPI
        if (HEYS.YandexAPI) {
          const result = await HEYS.YandexAPI.revokeConsent(clientId, consentType);
          if (result.error) throw new Error(result.error?.message || result.error);
          console.log('[Consents] ✅ Revoked:', consentType);
          // Нормализуем результат
          return { success: result.data?.revoke_consent?.success ?? !result.error };
        }

        return { success: false, error: 'No API client' };
      } catch (err) {
        console.error('[Consents] ❌ Error revoking:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Отзыв согласия на обработку health-данных + удаление самих данных
     * (152-ФЗ ст. 21). revoke_consent сам по себе только помечает consents
     * как revoked — фактическое удаление делает purge_health_data.
     */
    async revokeHealthDataAndPurge(clientId) {
      try {
        if (!HEYS.YandexAPI) return { success: false, error: 'No API client' };

        const revokeRes = await HEYS.YandexAPI.revokeConsent(clientId, 'health_data');
        if (revokeRes.error) throw new Error(revokeRes.error?.message || revokeRes.error);

        const purgeRes = await HEYS.YandexAPI.purgeHealthData(clientId);
        if (purgeRes.error) throw new Error(purgeRes.error?.message || purgeRes.error);

        const deletedKeys = purgeRes.data?.purge_health_data?.deleted_keys ?? 0;
        console.log('[Consents] ✅ Health-data revoked + purged:', deletedKeys, 'keys');
        return { success: true, deleted_keys: deletedKeys };
      } catch (err) {
        console.error('[Consents] ❌ Error revoking health-data:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Полное удаление аккаунта (152-ФЗ ст. 21). Проверка сессии
     * выполняется внутри RPC. После успеха клиент должен быть выкинут
     * на экран login.
     */
    async deleteAccount() {
      try {
        if (!HEYS.YandexAPI) return { success: false, error: 'No API client' };

        // Тот же паттерн, что в heys_add_product_step_v1.js: HEYS.auth API
        // как источник session_token для session-safe RPC.
        const sessionToken =
          (HEYS.auth && typeof HEYS.auth.getSessionToken === 'function'
            ? HEYS.auth.getSessionToken()
            : null) || null;
        if (!sessionToken) return { success: false, error: 'No session token' };

        const res = await HEYS.YandexAPI.deleteMyAccount(sessionToken);
        if (res.error) throw new Error(res.error?.message || res.error);

        const success = res.data?.delete_my_account?.success ?? false;
        if (success) {
          // Чистим локальные следы — кэш SW, localStorage, sessionStorage.
          try {
            const keysToKeep = new Set(['heys_cookie_info_seen']);
            for (let i = localStorage.length - 1; i >= 0; i--) {
              const k = localStorage.key(i);
              if (k && !keysToKeep.has(k)) localStorage.removeItem(k);
            }
            sessionStorage.clear();
            if (window.caches && typeof window.caches.keys === 'function') {
              const keys = await window.caches.keys();
              await Promise.all(keys.map((k) => window.caches.delete(k)));
            }
          } catch (_) { /* best-effort */ }
          console.log('[Consents] ✅ Account deleted, local state cleared');
        }
        return { success, raw: res.data };
      } catch (err) {
        console.error('[Consents] ❌ Error deleting account:', err);
        return { success: false, error: err.message };
      }
    },

    /**
     * Локальная проверка (из localStorage)
     */
    hasLocalConsent(clientId) {
      const key = `heys_consents_${clientId}`;
      const stored = localStorage.getItem(key);
      if (!stored) return false;

      try {
        const data = JSON.parse(stored);
        return REQUIRED_CONSENTS.every(type => data[type] === true);
      } catch {
        return false;
      }
    },

    /**
     * Сохранить локально (для быстрой проверки)
     */
    saveLocal(clientId, consents) {
      const key = `heys_consents_${clientId}`;
      const data = {};
      consents.forEach(c => {
        data[c.type] = c.granted !== false;
      });
      data.timestamp = Date.now();
      data.version = CURRENT_VERSIONS;
      localStorage.setItem(key, JSON.stringify(data));
    }
  };

  // =====================================================
  // React компоненты
  // =====================================================

  /**
   * Экран согласий (полноэкранный, блокирующий)
   * @param {string} clientId - ID клиента
   * @param {string} phone - Телефон клиента (для SMS верификации)
   * @param {function} onComplete - Вызывается при успешном принятии согласий
   * @param {function} onCancel - Вызывается при отказе (выход без принятия)
   * @param {function} onError - Вызывается при ошибке
   */
  function ConsentScreen({ clientId, phone, onComplete, onCancel, onError }) {
    // Шаги: 'consents' → 'verify_code' → done
    // ВАЖНО: если SMS выключен — verify_code никогда не используется!
    const [step, setStep] = useState('consents');
    const [consents, setConsents] = useState({
      user_agreement: false,
      personal_data: false,
      health_data: false,
      marketing: false
    });
    // notifications — отдельный preference, НЕ 152-ФЗ согласие.
    // Default ON: пользователь явно решил включить уведомления при онбординге.
    const [notificationsOptIn, setNotificationsOptIn] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showFullText, setShowFullText] = useState(null);

    // SMS verification state
    const [code, setCode] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);
    const codeInputRef = useRef(null);

    const allRequiredAccepted = REQUIRED_CONSENTS.every(type => consents[type]);

    // =====================================================
    // АВАРИЙНЫЙ ВЫКЛЮЧАТЕЛЬ: если SMS выключен — verify_code невозможен
    // =====================================================
    useEffect(() => {
      if (!SMS_VERIFICATION_ENABLED && step === 'verify_code') {
        console.warn('[Consents] ⚠️ SMS выключен, но step=verify_code — принудительный сброс');
        setStep('consents');
      }
    }, [step]);

    const handleToggle = useCallback((type) => {
      setConsents(prev => ({ ...prev, [type]: !prev[type] }));
    }, []);

    // Отправка SMS кода
    const sendVerificationCode = useCallback(async () => {
      if (!phone) {
        setError('Номер телефона не указан');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await HEYS.sms?.sendCode(phone);

        if (result?.success) {
          setCodeSent(true);
          setResendTimer(60);
          return true;
        } else {
          setError(result?.error || 'Ошибка отправки SMS');
          return false;
        }
      } catch (err) {
        setError(err.message);
        return false;
      } finally {
        setLoading(false);
      }
    }, [phone]);

    // Таймер повторной отправки
    useEffect(() => {
      if (resendTimer > 0) {
        const timer = setTimeout(() => setResendTimer(r => r - 1), 1000);
        return () => clearTimeout(timer);
      }
    }, [resendTimer]);

    // Проверка кода
    const verifyCodeAndSubmit = useCallback(async () => {
      if (code.length < 4) {
        setError('Введите код из SMS');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Проверяем код
        const verifyResult = HEYS.sms?.verifyCode(phone, code);

        if (!verifyResult?.valid) {
          setError(verifyResult?.error || 'Неверный код');
          setLoading(false);
          return;
        }

        // Код верный — сохраняем согласия с методом подписи
        const consentList = Object.entries(consents).map(([type, granted]) => ({
          type,
          granted,
          signature_method: type === 'health_data' ? 'sms_code' : 'checkbox'
        }));

        // Логируем в Supabase
        const result = await consentsAPI.logConsents(clientId, consentList);

        if (!result.success) {
          throw new Error(result.error || 'Ошибка сохранения согласий');
        }

        // Сохраняем локально
        consentsAPI.saveLocal(clientId, consentList);

        // Push opt-in (если пользователь согласился во время онбординга).
        if (notificationsOptIn && HEYS.push) {
          HEYS.push.subscribe().then((r) => {
            // iOS Safari вне PWA — нельзя подписаться. Запоминаем, что юзер
            // хотел уведомления, и попросим заново после установки PWA.
            if (r && r.reason === 'ios_needs_install') {
              try { localStorage.setItem('heys_push_pending_install', '1'); } catch (_) { /* noop */ }
            }
          }).catch((err) =>
            console.warn('[Consents] push.subscribe failed:', err?.message)
          );
        }

        // Успех!
        onComplete?.(consentList);
      } catch (err) {
        setError(err.message);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    }, [clientId, phone, code, consents, notificationsOptIn, onComplete, onError]);

    // Переход к шагу верификации
    const handleProceedToVerify = useCallback(async () => {
      if (!allRequiredAccepted) return;

      // SMS верификация отключена — используем только чекбоксы + логирование
      // Это полностью законно по 152-ФЗ ст.9
      if (!SMS_VERIFICATION_ENABLED || !HEYS.sms || !phone) {
        console.log('[Consents] ✅ Сохраняем согласия (чекбокс + логирование, без SMS)');
        // Сохраняем без верификации
        setLoading(true);
        try {
          const consentList = Object.entries(consents).map(([type, granted]) => ({
            type,
            granted,
            signature_method: 'checkbox'
          }));

          const result = await consentsAPI.logConsents(clientId, consentList);
          if (!result.success) throw new Error(result.error || 'Ошибка сохранения согласий');

          consentsAPI.saveLocal(clientId, consentList);

          // Push opt-in: если пользователь согласился — подписываемся.
          // Не блокируем onComplete если подписка не получится (например, iOS без install).
          if (notificationsOptIn && HEYS.push) {
            HEYS.push.subscribe().then(
              (r) => {
                console.info('[Consents] push.subscribe →', r);
                if (r && r.reason === 'ios_needs_install') {
                  try { localStorage.setItem('heys_push_pending_install', '1'); } catch (_) { /* noop */ }
                }
              },
              (err) => console.warn('[Consents] push.subscribe failed:', err?.message)
            );
          }

          onComplete?.(consentList);
        } catch (err) {
          setError(err.message || 'Неизвестная ошибка');
          onError?.(err);
        } finally {
          setLoading(false);
        }
        return;
      }

      // Переходим к верификации
      setStep('verify_code');
      // Сразу отправляем код
      await sendVerificationCode();
      // Фокус на поле ввода
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }, [allRequiredAccepted, consents, clientId, phone, onComplete, onError, sendVerificationCode]);

    // Старый handleSubmit для обратной совместимости (без верификации)
    const handleSubmit = useCallback(async () => {
      if (!allRequiredAccepted) return;

      setLoading(true);
      setError(null);

      try {
        // Формируем массив согласий
        const consentList = Object.entries(consents).map(([type, granted]) => ({
          type,
          granted,
          signature_method: 'checkbox'
        }));

        // Логируем в Supabase
        const result = await consentsAPI.logConsents(clientId, consentList);

        if (!result.success) {
          throw new Error(result.error || 'Ошибка сохранения согласий');
        }

        // Сохраняем локально
        consentsAPI.saveLocal(clientId, consentList);

        // Push opt-in (если пользователь согласился во время онбординга).
        if (notificationsOptIn && HEYS.push) {
          HEYS.push.subscribe().then((r) => {
            // iOS Safari вне PWA — нельзя подписаться. Запоминаем, что юзер
            // хотел уведомления, и попросим заново после установки PWA.
            if (r && r.reason === 'ios_needs_install') {
              try { localStorage.setItem('heys_push_pending_install', '1'); } catch (_) { /* noop */ }
            }
          }).catch((err) =>
            console.warn('[Consents] push.subscribe failed:', err?.message)
          );
        }

        // Успех!
        onComplete?.(consentList);
      } catch (err) {
        setError(err.message);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    }, [clientId, consents, allRequiredAccepted, notificationsOptIn, onComplete, onError]);

    return React.createElement('div', {
      className: 'fixed inset-0 z-50 flex flex-col',
      style: { backgroundColor: '#ffffff' }
    },
      // Header
      React.createElement('div', {
        className: 'p-4 border-b',
        style: { borderColor: '#e5e7eb' }
      },
        React.createElement('h1', {
          className: 'text-xl font-semibold',
          style: { color: '#18181b' }
        }, step === 'verify_code' ? '📱 Подтверждение' : '📋 Согласия и условия'),
        React.createElement('p', {
          className: 'text-sm mt-1',
          style: { color: '#71717a' }
        }, step === 'verify_code'
          ? 'Введите код из SMS для подтверждения согласия на обработку данных о здоровье'
          : 'Для продолжения необходимо принять условия')
      ),

      // Content - разные шаги
      step === 'consents' ? (
        // Шаг 1: Чекбоксы согласий
        React.createElement('div', {
          className: 'flex-1 overflow-auto p-4 space-y-4'
        },
          // Дисклеймер
          React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#fffbeb', border: '1px solid #fde68a' }
          },
            React.createElement('div', {
              className: 'flex items-start gap-3'
            },
              React.createElement('span', { className: 'text-xl' }, '⚠️'),
              React.createElement('div', null,
                React.createElement('p', {
                  className: 'font-medium',
                  style: { color: '#92400e' }
                }, 'Важно'),
                React.createElement('p', {
                  className: 'text-sm mt-1',
                  style: { color: '#b45309' }
                }, CONSENT_TEXTS.disclaimer.full)
              )
            )
          ),

          // Чекбоксы
          React.createElement('div', {
            className: 'space-y-3'
          },
            // User Agreement
            React.createElement(ConsentCheckbox, {
              type: 'user_agreement',
              checked: consents.user_agreement,
              onChange: () => handleToggle('user_agreement'),
              config: CONSENT_TEXTS.checkboxes.user_agreement,
              onShowFull: () => setShowFullText('user_agreement')
            }),

            // Personal Data
            React.createElement(ConsentCheckbox, {
              type: 'personal_data',
              checked: consents.personal_data,
              onChange: () => handleToggle('personal_data'),
              config: CONSENT_TEXTS.checkboxes.personal_data,
              onShowFull: () => setShowFullText('personal_data')
            }),

            // Health Data
            React.createElement(ConsentCheckbox, {
              type: 'health_data',
              checked: consents.health_data,
              onChange: () => handleToggle('health_data'),
              config: CONSENT_TEXTS.checkboxes.health_data,
              onShowFull: () => setShowFullText('health_data')
            }),

            // Divider
            React.createElement('hr', {
              className: 'my-4',
              style: { borderColor: '#e5e7eb' }
            }),

            // Marketing (optional)
            React.createElement(ConsentCheckbox, {
              type: 'marketing',
              checked: consents.marketing,
              onChange: () => handleToggle('marketing'),
              config: CONSENT_TEXTS.checkboxes.marketing
            }),

            // Push-уведомления (preference, не 152-ФЗ).
            // Default ON; пользователь может снять галочку, и тогда мы НЕ
            // запросим Notification.requestPermission().
            React.createElement(ConsentCheckbox, {
              type: 'notifications',
              checked: notificationsOptIn,
              onChange: () => setNotificationsOptIn(v => !v),
              config: CONSENT_TEXTS.checkboxes.notifications
            })
          ),

          // Error
          error && React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
          }, '❌ ', error)
        )
      ) : (
        // Шаг 2: Ввод кода SMS
        React.createElement('div', {
          className: 'flex-1 overflow-auto p-4 space-y-4'
        },
          // Инфо о коде
          React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }
          },
            React.createElement('div', {
              className: 'flex items-start gap-3'
            },
              React.createElement('span', { className: 'text-xl' }, '📱'),
              React.createElement('div', null,
                React.createElement('p', {
                  className: 'font-medium',
                  style: { color: '#1e40af' }
                }, codeSent ? 'Код отправлен' : 'Отправляем код...'),
                React.createElement('p', {
                  className: 'text-sm mt-1',
                  style: { color: '#3b82f6' }
                }, codeSent
                  ? `SMS с кодом отправлено на номер ${phone?.replace(/(\d{1})(\d{3})(\d{3})(\d{2})(\d{2})/, '+$1 ($2) ***-**-$5')}`
                  : 'Подождите, идёт отправка...')
              )
            )
          ),

          // Поле ввода кода
          React.createElement('div', {
            className: 'space-y-2'
          },
            React.createElement('label', {
              className: 'block text-sm font-medium',
              style: { color: '#3f3f46' }
            }, 'Код из SMS'),
            React.createElement('input', {
              ref: codeInputRef,
              type: 'text',
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 4,
              placeholder: '• • • •',
              value: code,
              onChange: (e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4)),
              className: 'w-full px-4 py-4 text-center text-2xl font-bold tracking-widest rounded-xl',
              style: {
                border: '2px solid #e5e7eb',
                outline: 'none',
                letterSpacing: '0.5em'
              },
              disabled: loading
            })
          ),

          // Повторная отправка
          React.createElement('div', {
            className: 'text-center'
          },
            resendTimer > 0
              ? React.createElement('p', {
                className: 'text-sm',
                style: { color: '#71717a' }
              }, `Отправить повторно через ${resendTimer} сек`)
              : React.createElement('button', {
                type: 'button',
                onClick: sendVerificationCode,
                disabled: loading,
                className: 'text-sm font-medium',
                style: { color: '#3b82f6' }
              }, '🔄 Отправить код повторно')
          ),

          // Пояснение
          React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#f4f4f5' }
          },
            React.createElement('p', {
              className: 'text-sm',
              style: { color: '#71717a' }
            }, '🔒 Подтверждение кодом требуется для согласия на обработку данных о здоровье в соответствии с 152-ФЗ ст.10')
          ),

          // Error
          error && React.createElement('div', {
            className: 'rounded-xl p-4',
            style: { backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }
          }, '❌ ', error)
        )
      ),

      // Footer
      React.createElement('div', {
        className: 'p-4 safe-area-bottom space-y-3',
        style: { borderTop: '1px solid #e5e7eb' }
      },
        step === 'consents' ? (
          // Кнопка "Продолжить" → переход к верификации
          React.createElement('button', {
            onClick: handleProceedToVerify,
            disabled: !allRequiredAccepted || loading,
            className: 'w-full py-4 rounded-xl font-semibold text-white transition-all',
            style: {
              backgroundColor: allRequiredAccepted && !loading ? '#22c55e' : '#d4d4d8',
              cursor: allRequiredAccepted && !loading ? 'pointer' : 'not-allowed'
            }
          }, loading ? '⏳ Загрузка...' : '✅ Продолжить')
        ) : (
          // Кнопка "Подтвердить" код
          React.createElement('button', {
            onClick: verifyCodeAndSubmit,
            disabled: code.length < 4 || loading,
            className: 'w-full py-4 rounded-xl font-semibold text-white transition-all',
            style: {
              backgroundColor: code.length >= 4 && !loading ? '#22c55e' : '#d4d4d8',
              cursor: code.length >= 4 && !loading ? 'pointer' : 'not-allowed'
            }
          }, loading ? '⏳ Проверка...' : '✅ Подтвердить')
        ),

        // Кнопка "Назад" или "Выйти"
        step === 'verify_code' ? (
          React.createElement('button', {
            onClick: () => { setStep('consents'); setError(null); setCode(''); },
            disabled: loading,
            className: 'w-full py-3 rounded-xl font-medium transition-all',
            style: { color: '#71717a' }
          }, '← Назад к согласиям')
        ) : (
          onCancel && React.createElement('button', {
            onClick: onCancel,
            disabled: loading,
            className: 'w-full py-3 rounded-xl font-medium transition-all',
            style: { color: '#71717a' }
          }, '← Выйти без регистрации')
        )
      ),

      // Full text modal
      showFullText && React.createElement(FullTextModal, {
        type: showFullText,
        onClose: () => setShowFullText(null),
        onAccept: () => {
          // Автоматически отмечаем чекбокс при подтверждении
          setConsents(prev => ({ ...prev, [showFullText]: true }));
          setShowFullText(null);
        }
      })
    );
  }

  /**
   * Чекбокс согласия
   */
  function ConsentCheckbox({ type, checked, onChange, config, onShowFull }) {
    const checkedStyle = {
      border: '1px solid #22c55e',
      backgroundColor: '#f0fdf4'
    };
    const uncheckedStyle = {
      border: '1px solid #e5e7eb',
      backgroundColor: '#ffffff'
    };

    return React.createElement('label', {
      className: 'flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all',
      style: checked ? checkedStyle : uncheckedStyle
    },
      // Checkbox
      React.createElement('div', {
        className: 'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5',
        style: checked
          ? { border: '2px solid #22c55e', backgroundColor: '#22c55e' }
          : { border: '2px solid #d4d4d8', backgroundColor: 'transparent' }
      },
        checked && React.createElement('span', { className: 'text-white text-sm' }, '✓')
      ),

      // Label
      React.createElement('div', {
        className: 'flex-1'
      },
        React.createElement('span', {
          className: 'text-sm',
          style: { color: '#3f3f46' }
        }, config.label),

        // Required badge
        config.required && React.createElement('span', {
          className: 'ml-2 text-xs',
          style: { color: '#ef4444' }
        }, '*'),

        // Link to full text
        config.link && React.createElement('button', {
          type: 'button',
          onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onShowFull?.();
          },
          className: 'block mt-1 text-xs hover:underline',
          style: { color: '#3b82f6' }
        }, 'Читать полностью →')
      ),

      // Hidden input for form
      React.createElement('input', {
        type: 'checkbox',
        checked: checked,
        onChange: onChange,
        className: 'sr-only'
      })
    );
  }

  // === Маппинг типов согласий на markdown файлы ===
  // Файлы находятся в public/docs/ (симлинк на docs/legal/)
  // ⚠️ ВАЖНО (радикально против CDN-кэша):
  // - НИКОГДА не перезаписываем одну и ту же версию документа по одному и тому же URL.
  // - При изменении текста документа — увеличиваем CURRENT_VERSIONS.
  // - Приложение грузит документы по УНИКАЛЬНОМУ пути: /docs/v<version>/...
  // - /docs/... остаётся как "latest" (для прямых ссылок/инспекции), но может залипать на edge.
  function buildVersionedDocPath(fileName, version) {
    return `/docs/v${version}/${fileName}`;
  }

  function buildLatestDocPath(fileName, version) {
    // Query — как дополнительный cache-busting на стороне браузера/Service Worker.
    // Важно: CDN может игнорировать query, поэтому это НЕ основная защита.
    return `/docs/${fileName}?v=${version}`;
  }

  function escapeRegExp(str) {
    return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isExpectedDocVersion(markdown, expectedVersion) {
    // Не все документы версионируются (например, chat rules) — тогда проверка не нужна.
    if (!expectedVersion) return true;
    if (!markdown) return false;

    // Ищем маркер вида: **Версия:** 1.2
    const re = new RegExp(`\\*\\*Версия:\\*\\*\\s*${escapeRegExp(expectedVersion)}(\\b|\\s|$)`);
    return re.test(markdown);
  }

  const DOC_PATHS = {
    user_agreement: {
      versioned: buildVersionedDocPath('user-agreement.md', CURRENT_VERSIONS.user_agreement),
      latest: buildLatestDocPath('user-agreement.md', CURRENT_VERSIONS.user_agreement)
    },
    personal_data: {
      versioned: buildVersionedDocPath('privacy-policy.md', CURRENT_VERSIONS.personal_data),
      latest: buildLatestDocPath('privacy-policy.md', CURRENT_VERSIONS.personal_data)
    },
    health_data: {
      // Отдельный документ согласия на данные о здоровье (152-ФЗ ст.10)
      versioned: buildVersionedDocPath('health-data-consent.md', CURRENT_VERSIONS.health_data),
      latest: buildLatestDocPath('health-data-consent.md', CURRENT_VERSIONS.health_data)
    }
  };

  // Кеш загруженных документов (с версией)
  const docCache = {};
  const docCacheVersion = `${CURRENT_VERSIONS.user_agreement}-${CURRENT_VERSIONS.personal_data}-${CURRENT_VERSIONS.health_data}`;

  // При изменении версии — очищаем localStorage кэш
  (() => {
    const cacheKey = 'heys_docs_cache_version';
    const storedVersion = localStorage.getItem(cacheKey);
    if (storedVersion !== docCacheVersion) {
      // 🔇 v4.7.1: Лог отключён
      localStorage.setItem(cacheKey, docCacheVersion);
      // Очищаем in-memory кэш (уже пустой при загрузке, но для надёжности)
      Object.keys(docCache).forEach(key => delete docCache[key]);
    }
  })();

  /**
   * Простой парсер Markdown → HTML
   * Поддерживает: заголовки, списки, жирный/курсив, таблицы, горизонтальные линии
   */
  function parseMarkdown(md) {
    if (!md) return '';

    let html = md
      // Экранируем HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Горизонтальные линии
      .replace(/^---+$/gm, '<hr class="my-4 border-zinc-300 dark:border-zinc-600">')
      // Заголовки
      .replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold mt-4 mb-2">$1</h4>')
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-3">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-4">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mb-4">$1</h1>')
      // Blockquotes
      .replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-zinc-300 dark:border-zinc-600 pl-4 italic text-zinc-600 dark:text-zinc-400 my-2">$1</blockquote>')
      // Жирный и курсив
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Инлайн-код
      .replace(/`(.+?)`/g, '<code class="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-sm">$1</code>')
      // Ссылки
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-blue-500 underline" target="_blank">$1</a>')
      // Списки (простые)
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^• (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
      // Параграфы (пустые строки)
      .replace(/\n\n/g, '</p><p class="my-2">')
      // Переносы строк
      .replace(/\n/g, '<br>');

    // Оборачиваем в параграф
    html = '<p class="my-2">' + html + '</p>';

    // Группируем списки
    html = html.replace(/(<li[^>]*>.*?<\/li>)(\s*<br>)?/g, '$1');

    return html;
  }

  /**
   * Модальное окно с полным текстом документа
   * Загружает и парсит markdown файлы из /docs/legal/
   * Требует прокрутки до конца для подтверждения
   */
  function FullTextModal({ type, onClose, onAccept }) {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
    const contentRef = useRef(null);

    // Обработчик прокрутки — проверяем достигли ли конца
    const handleScroll = useCallback(() => {
      if (!contentRef.current || hasScrolledToEnd) return;

      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      // Считаем "до конца" если осталось < 50px
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

      if (isAtBottom) {
        setHasScrolledToEnd(true);
      }
    }, [hasScrolledToEnd]);

    // Проверка при загрузке контента (если документ короткий)
    useEffect(() => {
      if (content && contentRef.current) {
        const { scrollHeight, clientHeight } = contentRef.current;
        // Если контент помещается без скролла — сразу разрешаем
        if (scrollHeight <= clientHeight + 10) {
          setHasScrolledToEnd(true);
        }
      }
    }, [content]);

    useEffect(() => {
      async function loadDocument() {
        setLoading(true);
        setError(null);
        setHasScrolledToEnd(false);

        const docInfo = DOC_PATHS[type];

        if (!docInfo) {
          setError('Документ не найден');
          setLoading(false);
          return;
        }

        // Проверяем кеш (только если не retry)
        if (retryCount === 0 && docCache[type]) {
          setContent(docCache[type]);
          setLoading(false);
          return;
        }

        async function fetchMarkdown(url) {
          const response = await fetch(url, { cache: 'no-store' });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return response.text();
        }

        try {
          // 1) Сначала пробуем "неубиваемый" версионированный путь.
          // 2) Если /docs/vX ещё не задеплоены — пробуем /docs/latest, НО только если версия в тексте совпадает.
          //    Это принципиально: нельзя показывать пользователю устаревший юридический документ из CDN-кэша.
          let markdown;
          const expectedVersion = CURRENT_VERSIONS[type];

          try {
            markdown = await fetchMarkdown(docInfo.versioned);
            if (!isExpectedDocVersion(markdown, expectedVersion)) {
              throw new Error('DOC_VERSION_MISMATCH');
            }
          } catch (e) {
            markdown = await fetchMarkdown(docInfo.latest);
            if (!isExpectedDocVersion(markdown, expectedVersion)) {
              const exp = expectedVersion ? `v${expectedVersion}` : 'актуальная версия';
              setError(
                `Сейчас CDN отдаёт устаревшую версию документа (ожидается ${exp}).\n\n` +
                `Пожалуйста, обновите страницу или попробуйте позже.`
              );
              setLoading(false);
              return;
            }
          }

          // Теперь health_data имеет свой отдельный документ — парсим полностью
          const html = parseMarkdown(markdown);

          // Сохраняем в кеш
          docCache[type] = html;

          setContent(html);
          setError(null);
        } catch (err) {
          console.error('[Consents] Ошибка загрузки документа:', err);
          setError('Не удалось загрузить документ. Попробуйте позже.');
        } finally {
          setLoading(false);
        }
      }

      loadDocument();
    }, [type, retryCount]);

    // Retry handler
    const handleRetry = () => {
      delete docCache[type];
      setRetryCount(c => c + 1);
    };

    return React.createElement('div', {
      className: 'fixed inset-0 z-[60] flex items-end',
      style: { backgroundColor: 'rgba(0, 0, 0, 0.5)' }
    },
      React.createElement('div', {
        className: 'rounded-t-2xl w-full max-h-[80vh] flex flex-col',
        style: { backgroundColor: '#ffffff' }
      },
        // Header
        React.createElement('div', {
          className: 'flex items-center justify-between p-4',
          style: { borderBottom: '1px solid #e5e7eb' }
        },
          React.createElement('h2', {
            className: 'font-semibold',
            style: { color: '#18181b' }
          }, CONSENT_TEXTS.checkboxes[type]?.label || type),
          React.createElement('button', {
            onClick: onClose,
            className: 'p-2 rounded-full',
            style: { color: '#71717a' }
          }, '✕')
        ),

        // Content с отслеживанием прокрутки
        React.createElement('div', {
          ref: contentRef,
          onScroll: handleScroll,
          className: 'flex-1 overflow-auto p-4'
        },
          loading
            ? React.createElement('div', {
              className: 'text-center py-8',
              style: { color: '#71717a' }
            }, '⏳ Загрузка документа...')
            : error
              ? React.createElement('div', {
                className: 'text-center py-8',
                style: { color: '#ef4444' }
              },
                React.createElement('p', null, '❌ ', error),
                React.createElement('button', {
                  onClick: handleRetry,
                  className: 'mt-4 text-sm underline',
                  style: { color: '#3b82f6' }
                }, 'Попробовать снова')
              )
              : React.createElement('div', null,
                // Дружелюбный блок-резюме
                CONSENT_TEXTS.friendlySummaries[type] && React.createElement('div', {
                  className: 'mb-4 p-4 rounded-xl',
                  style: {
                    backgroundColor: CONSENT_TEXTS.friendlySummaries[type].color,
                    borderLeft: `4px solid ${CONSENT_TEXTS.friendlySummaries[type].borderColor}`
                  }
                },
                  React.createElement('div', {
                    className: 'flex items-center gap-2 mb-3'
                  },
                    React.createElement('span', { className: 'text-2xl' }, CONSENT_TEXTS.friendlySummaries[type].emoji),
                    React.createElement('span', {
                      className: 'font-semibold',
                      style: { color: CONSENT_TEXTS.friendlySummaries[type].textColor }
                    }, CONSENT_TEXTS.friendlySummaries[type].title)
                  ),
                  React.createElement('ul', {
                    className: 'space-y-2 text-sm',
                    style: { color: CONSENT_TEXTS.friendlySummaries[type].textColor }
                  },
                    CONSENT_TEXTS.friendlySummaries[type].points.map((point, i) =>
                      React.createElement('li', { key: i }, point)
                    )
                  )
                ),
                // Полный текст документа
                React.createElement('div', {
                  className: 'prose max-w-none text-sm leading-relaxed',
                  style: { color: '#3f3f46' },
                  dangerouslySetInnerHTML: { __html: content }
                })
              )
        ),

        // Подсказка о прокрутке (если ещё не долистали)
        !loading && !error && !hasScrolledToEnd && React.createElement('div', {
          className: 'px-4 py-2 text-center',
          style: { backgroundColor: '#fef3c7', color: '#92400e' }
        },
          React.createElement('p', { className: 'text-xs' }, '👇 Прокрутите до конца, чтобы подтвердить')
        ),

        // Footer с кнопками
        React.createElement('div', {
          className: 'p-4 space-y-2',
          style: { borderTop: '1px solid #e5e7eb' }
        },
          // Кнопка "Ознакомлен" — появляется после прокрутки
          hasScrolledToEnd && !loading && !error && React.createElement('button', {
            onClick: onAccept,
            className: 'w-full py-3 rounded-xl font-semibold text-white transition-all',
            style: { backgroundColor: '#22c55e' }
          }, '✅ Ознакомлен, принимаю'),

          // Кнопка "Закрыть" — всегда видна
          React.createElement('button', {
            onClick: onClose,
            className: 'w-full py-3 rounded-xl font-medium',
            style: { backgroundColor: '#f4f4f5', color: '#3f3f46' }
          }, hasScrolledToEnd ? 'Закрыть без принятия' : 'Закрыть')
        )
      )
    );
  }

  /**
   * Баннер дисклеймера (для футера)
   */
  function DisclaimerBanner({ variant = 'short' }) {
    const text = variant === 'full'
      ? CONSENT_TEXTS.disclaimer.full
      : CONSENT_TEXTS.disclaimer.short;

    return React.createElement('div', {
      className: 'px-4 py-2 text-center',
      style: { backgroundColor: '#f4f4f5' }
    },
      React.createElement('p', {
        className: 'text-xs',
        style: { color: '#71717a' }
      }, '⚠️ ', text)
    );
  }

  /**
   * Мини-бейдж "Не медицина"
   */
  function NotMedicineBadge() {
    return React.createElement('span', {
      className: 'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full',
      style: { backgroundColor: '#fef3c7', color: '#b45309' }
    }, '⚠️ Не является медицинской услугой');
  }

  // =====================================================
  // Hook для проверки согласий
  // =====================================================

  function useConsentsRequired(clientId) {
    const [needsConsent, setNeedsConsent] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
      if (!clientId) {
        setChecking(false);
        return;
      }

      // Быстрая локальная проверка
      if (consentsAPI.hasLocalConsent(clientId)) {
        setNeedsConsent(false);
        setChecking(false);
        return;
      }

      // Проверка на сервере
      consentsAPI.checkRequired(clientId).then(result => {
        setNeedsConsent(!result.valid);
        setChecking(false);
      });
    }, [clientId]);

    return { needsConsent, checking };
  }

  // =====================================================
  // 🆕 COMPLIANCE OVERHAUL 2026-05-20 — extensions
  // =====================================================

  // Источник версий — единый, читаем из HEYS.LegalVersions (см.
  // apps/web/heys_legal_versions_v1.js). Fallback на локальный
  // CURRENT_VERSIONS если legal-versions модуль не загрузился.
  function getCurrentLegalVersions() {
    if (typeof HEYS.LegalVersions === 'object' && HEYS.LegalVersions) {
      return HEYS.LegalVersions;
    }
    return CURRENT_VERSIONS;
  }

  // ── Version-aware check (re-consent на bump) ────────────────────────────
  consentsAPI.checkRequiredVersioned = async function () {
    try {
      if (!HEYS.YandexAPI || !HEYS.YandexAPI.checkRequiredConsentsBySession) {
        return { valid: false, missing: REQUIRED_CONSENTS, error: 'API not ready' };
      }
      const versions = getCurrentLegalVersions();
      const result = await HEYS.YandexAPI.checkRequiredConsentsBySession(versions);
      if (result.error) throw new Error(result.error?.message || result.error);
      const data = result.data?.check_required_consents_by_session || result.data;
      return {
        valid: data?.valid ?? false,
        missing: data?.missing || [],
        outdated: data?.outdated || [],
        graceExpiresAt: data?.grace_expires_at || null,
        graceStatus: data?.grace_status || 'none',
        mustBlock: data?.must_block ?? false
      };
    } catch (err) {
      console.error('[Consents] checkRequiredVersioned failed:', err);
      return { valid: false, missing: REQUIRED_CONSENTS, error: err.message };
    }
  };

  // ── My consents list (для UI «Мои согласия») ────────────────────────────
  consentsAPI.getMyConsents = async function () {
    try {
      if (!HEYS.YandexAPI?.getMyConsentsBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.getMyConsentsBySession();
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.get_my_consents_by_session || r.data;
      return { success: true, consents: data?.consents || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // ── Proof of consent (скачать как файл) ──────────────────────────────────
  consentsAPI.getConsentProof = async function (consentType) {
    try {
      if (!HEYS.YandexAPI?.getConsentProofBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.getConsentProofBySession(consentType);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.get_consent_proof_by_session || r.data;
      return { success: true, proof: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.downloadConsentProofAsFile = async function (consentType) {
    const res = await consentsAPI.getConsentProof(consentType);
    if (!res.success) return res;
    const blob = new Blob([JSON.stringify(res.proof, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heys-consent-${consentType}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true };
  };

  // ── DSAR (152-ФЗ ст.14 / GDPR Art.15) ────────────────────────────────────
  consentsAPI.exportMyData = async function () {
    try {
      if (!HEYS.YandexAPI?.exportMyDataBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.exportMyDataBySession();
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.export_my_data_by_session || r.data;
      return { success: true, export: data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.downloadMyDataAsFile = async function () {
    const res = await consentsAPI.exportMyData();
    if (!res.success) return res;
    const blob = new Blob([JSON.stringify(res.export, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heys-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true };
  };

  // ── Setters / toggles ────────────────────────────────────────────────────
  consentsAPI.setMarketingConsent = async function (granted) {
    try {
      if (!HEYS.YandexAPI?.logConsentsBySession) return { success: false, error: 'API not ready' };
      const versions = getCurrentLegalVersions();
      const r = await HEYS.YandexAPI.logConsentsBySession([
        { type: 'marketing', granted: !!granted, version: versions.marketing || '1.2' }
      ]);
      if (r.error) throw new Error(r.error?.message || r.error);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.setPushConsent = async function (granted) {
    try {
      if (!HEYS.YandexAPI?.logConsentsBySession) return { success: false, error: 'API not ready' };
      const versions = getCurrentLegalVersions();
      const r = await HEYS.YandexAPI.logConsentsBySession([
        { type: 'push_notifications', granted: !!granted, version: versions.push_notifications || '1.0' }
      ]);
      if (r.error) throw new Error(r.error?.message || r.error);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.confirmAge = async function (birthYear) {
    try {
      if (!HEYS.YandexAPI?.confirmAgeBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.confirmAgeBySession(birthYear);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.confirm_age_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.requestRestriction = async function (active) {
    try {
      if (!HEYS.YandexAPI?.requestRestrictionBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.requestRestrictionBySession(!!active);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.request_restriction_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.revokeCuratorAccess = async function () {
    try {
      if (!HEYS.YandexAPI?.revokeCuratorAccessBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.revokeCuratorAccessBySession();
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.revoke_curator_access_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  consentsAPI.revokeConsentBySession = async function (consentType) {
    try {
      if (!HEYS.YandexAPI?.revokeConsentBySession) return { success: false, error: 'API not ready' };
      const r = await HEYS.YandexAPI.revokeConsentBySession(consentType);
      if (r.error) throw new Error(r.error?.message || r.error);
      const data = r.data?.revoke_consent_by_session || r.data;
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // ── ConsentOutdatedBanner (sticky top, мягкий призыв пере-подписать) ────
  function ConsentOutdatedBanner({ outdatedTypes, graceExpiresAt, onClick }) {
    if (!outdatedTypes || outdatedTypes.length === 0) return null;
    const expDate = graceExpiresAt ? new Date(graceExpiresAt) : null;
    const daysLeft = expDate ? Math.max(0, Math.ceil((expDate - new Date()) / 86400000)) : null;
    const labels = (HEYS.LegalVersions?.labels) || {};
    const typeNames = (Array.isArray(outdatedTypes) ? outdatedTypes : [])
      .map(t => labels[t?.type || t] || (t?.type || t))
      .join(', ');

    return React.createElement('div', {
      role: 'alert',
      style: {
        position: 'sticky', top: 0, zIndex: 100,
        background: '#fef3c7', borderBottom: '1px solid #fbbf24',
        padding: '10px 16px', color: '#92400e',
        fontSize: '14px', textAlign: 'center', cursor: 'pointer'
      },
      onClick
    },
      React.createElement('strong', null, '📋 Документы обновлены: '),
      'мы обновили ', typeNames, '. Пожалуйста, ознакомьтесь и подпишите.',
      daysLeft !== null && React.createElement('span', null,
        ' Осталось дней: ', React.createElement('strong', null, daysLeft), '.'),
      React.createElement('span', { style: { textDecoration: 'underline', marginLeft: 8 } }, 'Открыть')
    );
  }

  // ── AgeGateModal (18+ для старых клиентов без birth_year) ───────────────
  function AgeGateModal({ onConfirm, onDismiss }) {
    const [year, setYear] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const currentYear = new Date().getFullYear();

    const submit = async () => {
      const y = parseInt(year, 10);
      if (!Number.isInteger(y) || y < 1900 || y > currentYear) {
        setError('Введите корректный год рождения');
        return;
      }
      if (currentYear - y < 18) {
        setError('Сервис доступен только лицам старше 18 лет (152-ФЗ ст.9.5).');
        return;
      }
      setLoading(true);
      const res = await consentsAPI.confirmAge(y);
      setLoading(false);
      if (res?.success) {
        onConfirm && onConfirm(y);
      } else {
        setError(res?.error || res?.message || 'Не удалось сохранить');
      }
    };

    return React.createElement('div', {
      style: {
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16
      }
    },
      React.createElement('div', {
        style: {
          background: '#fff', borderRadius: 16, padding: '24px',
          maxWidth: 420, width: '100%'
        }
      },
        React.createElement('h2', { style: { marginTop: 0, fontSize: 20 } },
          '🎂 Подтвердите возраст'),
        React.createElement('p', { style: { color: '#52525b', fontSize: 14 } },
          'По требованиям 152-ФЗ ст.9.5 сервисом могут пользоваться только лица старше 18 лет. Пожалуйста, укажите ваш год рождения.'),
        React.createElement('input', {
          type: 'number', placeholder: 'Год рождения (например, 1990)',
          value: year,
          onChange: e => setYear(e.target.value),
          style: {
            width: '100%', padding: '12px', fontSize: 16,
            border: '1px solid #d4d4d8', borderRadius: 8, marginTop: 12
          }
        }),
        error && React.createElement('div', {
          style: { color: '#dc2626', fontSize: 13, marginTop: 8 }
        }, error),
        React.createElement('button', {
          onClick: submit,
          disabled: loading,
          style: {
            marginTop: 16, padding: '12px 20px', width: '100%',
            background: '#22c55e', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 16, cursor: 'pointer'
          }
        }, loading ? '⏳ Сохранение...' : 'Подтвердить'),
        onDismiss && React.createElement('button', {
          onClick: onDismiss,
          style: {
            marginTop: 8, padding: '10px', width: '100%',
            background: 'transparent', color: '#71717a',
            border: 'none', fontSize: 14, cursor: 'pointer'
          }
        }, 'Напомнить позже')
      )
    );
  }

  // ── Self-service ConsentScreen wrapper для re-consent flow ─────────────
  // Простая обёртка: пере-используем существующий ConsentScreen,
  // передаём clientId из текущей сессии, после complete — closе.
  function ReConsentScreen({ outdatedTypes, onComplete, onDismiss }) {
    const clientId =
      (window.HEYS && window.HEYS.currentClientId) ||
      localStorage.getItem('heys_client_current') || '';

    return React.createElement('div', { style: { position: 'fixed', inset: 0, zIndex: 9998 } },
      React.createElement('div', {
        style: {
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '12px 16px', background: '#fef3c7',
          color: '#92400e', textAlign: 'center', fontSize: 14
        }
      }, '📋 Мы обновили документы. Пожалуйста, ознакомьтесь и подпишите.'),
      React.createElement(ConsentScreen, {
        clientId,
        phone: null,  // re-consent flow без SMS verify
        onComplete: onComplete,
        onCancel: onDismiss,
        onError: () => { /* swallow */ }
      })
    );
  }

  // Экспорт компонентов и обновлённого API
  HEYS.Consents.ConsentOutdatedBanner = ConsentOutdatedBanner;
  HEYS.Consents.AgeGateModal = AgeGateModal;
  HEYS.Consents.ReConsentScreen = ReConsentScreen;
  HEYS.Consents.getCurrentLegalVersions = getCurrentLegalVersions;

  // =====================================================
  // Экспорт
  // =====================================================

  HEYS.Consents = Object.assign(HEYS.Consents || {}, {
    // Константы
    TYPES: CONSENT_TYPES,
    REQUIRED: REQUIRED_CONSENTS,
    VERSIONS: CURRENT_VERSIONS,
    TEXTS: CONSENT_TEXTS,

    // API
    api: consentsAPI,

    // Компоненты
    ConsentScreen,
    ConsentCheckbox,
    DisclaimerBanner,
    NotMedicineBadge,
    FullTextModal,
    ConsentOutdatedBanner,
    AgeGateModal,
    ReConsentScreen,

    // Hook
    useConsentsRequired,

    // Utils
    getCurrentLegalVersions
  });

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
