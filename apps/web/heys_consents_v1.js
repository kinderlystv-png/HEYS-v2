// heys_consents_v1.js — Модуль согласий и ПЭП (простая электронная подпись)
// Версия: 1.0
// 152-ФЗ compliant consent management

(function(global) {
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
    MARKETING: 'marketing'
  };
  
  const CURRENT_VERSIONS = {
    user_agreement: '1.2',
    personal_data: '1.2',
    health_data: '1.0',  // Отдельный документ согласия на данные о здоровье
    marketing: '1.2'
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
        
        // Успех!
        onComplete?.(consentList);
      } catch (err) {
        setError(err.message);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    }, [clientId, phone, code, consents, onComplete, onError]);
    
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
        
        // Успех!
        onComplete?.(consentList);
      } catch (err) {
        setError(err.message);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    }, [clientId, consents, allRequiredAccepted, onComplete, onError]);
    
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
      console.log('[Consents] 🔄 Документы обновлены, очищаем кэш');
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
              : React.createElement('div', { 
                  className: 'prose max-w-none text-sm leading-relaxed',
                  style: { color: '#3f3f46' },
                  dangerouslySetInnerHTML: { __html: content }
                })
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
  // Экспорт
  // =====================================================
  
  HEYS.Consents = {
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
    
    // Hook
    useConsentsRequired
  };
  
  // Verbose init log removed
  
})(typeof window !== 'undefined' ? window : global);
