// heys_sms_v1.js — Модуль отправки SMS для ПЭП (SMS.ru)
// Версия: 1.0
// Дата: 2025-12-20

(function(global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // =====================================================
  // КОНФИГУРАЦИЯ
  // =====================================================
  
  const SMS_CONFIG = {
    // API SMS.ru
    apiUrl: 'https://sms.ru/sms/send',
    
    // API ключ (хранить в env, не в коде!)
    // В проде: process.env.SMSRU_API_KEY или Supabase secrets
    apiKey: null, // Устанавливается через init()
    
    // Отправитель (после согласования с операторами)
    sender: 'HEYS',
    
    // Параметры кода
    codeLength: 4,
    codeExpireMinutes: 10,
    
    // Лимиты
    maxAttemptsPerHour: 3,
    resendDelaySeconds: 60
  };
  
  // Хранилище кодов (в проде — Redis/Supabase)
  const pendingCodes = new Map(); // phone -> { code, expires, attempts }
  
  // =====================================================
  // ГЕНЕРАЦИЯ КОДА
  // =====================================================
  
  /**
   * Генерирует случайный цифровой код
   */
  function generateCode(length = 4) {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += digits[Math.floor(Math.random() * digits.length)];
    }
    return code;
  }
  
  // =====================================================
  // ОТПРАВКА SMS
  // =====================================================
  
  /**
   * Отправляет SMS через SMS.ru API
   * @param {string} phone - Номер телефона (79XXXXXXXXX)
   * @param {string} message - Текст сообщения
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function sendSms(phone, message) {
    if (!SMS_CONFIG.apiKey) {
      console.error('[SMS] API key not configured');
      return { success: false, error: 'SMS not configured' };
    }
    
    // Нормализуем номер
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number' };
    }
    
    try {
      // Формируем URL с параметрами
      const params = new URLSearchParams({
        api_id: SMS_CONFIG.apiKey,
        to: normalizedPhone,
        msg: message,
        json: '1'
      });
      
      // Добавляем отправителя если согласован
      if (SMS_CONFIG.sender) {
        params.append('from', SMS_CONFIG.sender);
      }
      
      const response = await fetch(`${SMS_CONFIG.apiUrl}?${params.toString()}`);
      const result = await response.json();
      
      // SMS.ru возвращает status_code: 100 при успехе
      if (result.status_code === 100) {
        return { success: true };
      }
      
      // Обработка ошибок SMS.ru
      const errorMessages = {
        100: 'Успешно',
        200: 'Неверный api_id',
        201: 'Не хватает средств',
        202: 'Неверный номер получателя',
        203: 'Нет текста сообщения',
        204: 'Имя отправителя не согласовано',
        205: 'Сообщение слишком длинное',
        206: 'Дневной лимит исчерпан',
        207: 'Нельзя отправить на этот номер',
        208: 'Неверное время отправки',
        209: 'Добавлен в стоп-лист',
        210: 'Используйте POST',
        211: 'Метод не найден',
        212: 'Текст нужно кодировать в UTF-8',
        220: 'Сервис временно недоступен',
        230: 'Превышен лимит сообщений в день',
        231: 'Превышен лимит одинаковых сообщений',
        232: 'Превышен лимит на один номер'
      };
      
      const errorMsg = errorMessages[result.status_code] || `Unknown error: ${result.status_code}`;
      console.error('[SMS] Error:', errorMsg);
      return { success: false, error: errorMsg };
      
    } catch (error) {
      console.error('[SMS] Network error:', error);
      return { success: false, error: 'Network error' };
    }
  }
  
  /**
   * Нормализует номер телефона к формату 79XXXXXXXXX
   */
  function normalizePhone(phone) {
    if (!phone) return null;
    
    // Убираем всё кроме цифр
    let digits = phone.replace(/\D/g, '');
    
    // 8 → 7
    if (digits.startsWith('8') && digits.length === 11) {
      digits = '7' + digits.slice(1);
    }
    
    // Добавляем 7 если нет
    if (digits.length === 10) {
      digits = '7' + digits;
    }
    
    // Проверяем формат
    if (digits.length !== 11 || !digits.startsWith('7')) {
      return null;
    }
    
    return digits;
  }
  
  // =====================================================
  // ПЭП — ОТПРАВКА И ПРОВЕРКА КОДА
  // =====================================================
  
  /**
   * Отправляет код подтверждения для ПЭП
   * @param {string} phone - Номер телефона
   * @returns {Promise<{success: boolean, error?: string, resendAfter?: number}>}
   */
  async function sendVerificationCode(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return { success: false, error: 'Неверный номер телефона' };
    }
    
    // Проверяем лимиты
    const existing = pendingCodes.get(normalizedPhone);
    if (existing) {
      const now = Date.now();
      
      // Проверяем cooldown
      if (existing.sentAt && (now - existing.sentAt) < SMS_CONFIG.resendDelaySeconds * 1000) {
        const resendAfter = Math.ceil((SMS_CONFIG.resendDelaySeconds * 1000 - (now - existing.sentAt)) / 1000);
        return { 
          success: false, 
          error: `Подождите ${resendAfter} сек`,
          resendAfter 
        };
      }
      
      // Проверяем кол-во попыток
      if (existing.attempts >= SMS_CONFIG.maxAttemptsPerHour) {
        return { 
          success: false, 
          error: 'Превышен лимит попыток. Попробуйте через час' 
        };
      }
    }
    
    // Генерируем код
    const code = generateCode(SMS_CONFIG.codeLength);
    const message = `HEYS: Ваш код подтверждения: ${code}. Никому не сообщайте этот код.`;
    
    // Отправляем SMS
    const result = await sendSms(normalizedPhone, message);
    
    if (result.success) {
      // Сохраняем код
      pendingCodes.set(normalizedPhone, {
        code,
        expires: Date.now() + SMS_CONFIG.codeExpireMinutes * 60 * 1000,
        sentAt: Date.now(),
        attempts: (existing?.attempts || 0) + 1
      });
      
      return { success: true };
    }
    
    return result;
  }
  
  /**
   * Проверяет код подтверждения
   * @param {string} phone - Номер телефона
   * @param {string} code - Введённый код
   * @returns {{valid: boolean, error?: string}}
   */
  function verifyCode(phone, code) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return { valid: false, error: 'Неверный номер телефона' };
    }
    
    const pending = pendingCodes.get(normalizedPhone);
    
    if (!pending) {
      return { valid: false, error: 'Код не запрашивался' };
    }
    
    if (Date.now() > pending.expires) {
      pendingCodes.delete(normalizedPhone);
      return { valid: false, error: 'Код истёк. Запросите новый' };
    }
    
    if (pending.code !== code) {
      return { valid: false, error: 'Неверный код' };
    }
    
    // Код верный — удаляем
    pendingCodes.delete(normalizedPhone);
    
    return { valid: true };
  }
  
  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ
  // =====================================================
  
  /**
   * Инициализирует модуль SMS
   * @param {Object} config - Конфигурация
   * @param {string} config.apiKey - API ключ SMS.ru
   * @param {string} [config.sender] - Имя отправителя
   */
  function init(config) {
    if (config.apiKey) {
      SMS_CONFIG.apiKey = config.apiKey;
    }
    if (config.sender) {
      SMS_CONFIG.sender = config.sender;
    }
  }
  
  // =====================================================
  // DEV MODE — для тестирования без реальных SMS
  // =====================================================
  
  let devMode = false;
  const devCodes = new Map();
  
  /**
   * Включает dev-режим (коды выводятся в консоль вместо SMS)
   */
  function enableDevMode() {
    devMode = true;
  }
  
  /**
   * Dev-версия отправки кода
   */
  async function sendVerificationCodeDev(phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return { success: false, error: 'Неверный номер телефона' };
    }
    
    const code = generateCode(SMS_CONFIG.codeLength);
    
    console.log(`[SMS DEV] Code for ${normalizedPhone}: ${code}`);
    
    devCodes.set(normalizedPhone, {
      code,
      expires: Date.now() + SMS_CONFIG.codeExpireMinutes * 60 * 1000
    });
    
    return { success: true };
  }
  
  /**
   * Dev-версия проверки кода
   */
  function verifyCodeDev(phone, code) {
    const normalizedPhone = normalizePhone(phone);
    const pending = devCodes.get(normalizedPhone);
    
    if (!pending) {
      return { valid: false, error: 'Код не запрашивался' };
    }
    
    if (Date.now() > pending.expires) {
      devCodes.delete(normalizedPhone);
      return { valid: false, error: 'Код истёк' };
    }
    
    if (pending.code !== code) {
      return { valid: false, error: 'Неверный код' };
    }
    
    devCodes.delete(normalizedPhone);
    return { valid: true };
  }
  
  // =====================================================
  // ЭКСПОРТ
  // =====================================================
  
  HEYS.sms = {
    init,
    enableDevMode,
    
    // Основные методы
    sendCode: (phone) => devMode ? sendVerificationCodeDev(phone) : sendVerificationCode(phone),
    verifyCode: (phone, code) => devMode ? verifyCodeDev(phone, code) : verifyCode(phone, code),
    
    // Утилиты
    normalizePhone,
    
    // Для отладки
    _config: SMS_CONFIG,
    _pendingCodes: pendingCodes,
    _devMode: () => devMode
  };
  
  // Автоматическая инициализация
  // На localhost — dev mode (коды в консоль)
  // В продакшене — нужен API ключ через init()
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1' ||
                        window.location.hostname.endsWith('.local');
    
    if (isLocalhost) {
      enableDevMode();
    }
  }
  
  // Verbose init log removed
  
})(typeof window !== 'undefined' ? window : global);
