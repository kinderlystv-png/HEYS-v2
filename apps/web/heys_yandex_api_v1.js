// heys_yandex_api_v1.js — Yandex Cloud API adapter (152-ФЗ compliant)
// Замена Supabase на собственный API в Yandex Cloud

;(function (global) {
  'use strict';
  
  const HEYS = global.HEYS = global.HEYS || {};
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔧 КОНФИГУРАЦИЯ
  // ═══════════════════════════════════════════════════════════════════
  
  const CONFIG = {
    // Production API (Yandex Cloud)
    API_URL: 'https://api.heyslab.ru',
    
    // Endpoints
    ENDPOINTS: {
      RPC: '/rpc',
      REST: '/rest',
      SMS: '/sms',
      LEADS: '/leads',
      HEALTH: '/health'
    },
    
    // Таймауты
    TIMEOUT_MS: 15000,
    
    // Retry логика
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 1000
  };
  
  // ═══════════════════════════════════════════════════════════════════
  // 🌐 СОСТОЯНИЕ
  // ═══════════════════════════════════════════════════════════════════
  
  let _isOnline = true;
  let _lastError = null;
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔧 УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════════
  
  function log(...args) {
    console.log('[YandexAPI]', ...args);
  }
  
  function err(...args) {
    console.error('[YandexAPI] ❌', ...args);
  }
  
  /**
   * Выполнить fetch с таймаутом
   */
  async function fetchWithTimeout(url, options, timeoutMs = CONFIG.TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw e;
    }
  }
  
  /**
   * Выполнить запрос с retry
   */
  async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
    let lastError;
    
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetchWithTimeout(url, options);
        _isOnline = true;
        return response;
      } catch (e) {
        lastError = e;
        err(`Attempt ${i + 1}/${retries + 1} failed:`, e.message);
        
        if (i < retries) {
          await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS * (i + 1)));
        }
      }
    }
    
    _isOnline = false;
    _lastError = lastError;
    throw lastError;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 📡 API МЕТОДЫ
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * RPC вызов (PostgreSQL функция)
   * @param {string} fnName - Имя функции (get_client_salt, verify_client_pin, etc.)
   * @param {object} params - Параметры функции
   * @returns {Promise<{data: any, error: any}>}
   */
  async function rpc(fnName, params = {}) {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.RPC}?fn=${encodeURIComponent(fnName)}`;
    
    try {
      log(`RPC: ${fnName}`, params);
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return { data: null, error: { message: data.error || 'RPC error', code: response.status } };
      }
      
      return { data, error: null };
    } catch (e) {
      err(`RPC ${fnName} failed:`, e.message);
      return { data: null, error: { message: e.message, code: 'NETWORK_ERROR' } };
    }
  }
  
  /**
   * REST запрос (CRUD операции)
   * @param {string} table - Имя таблицы
   * @param {object} options - { method, filters, data, select, limit, offset }
   * @returns {Promise<{data: any, error: any}>}
   */
  async function rest(table, options = {}) {
    const { method = 'GET', filters = {}, data = null, select, limit, offset } = options;
    
    // Строим URL с параметрами
    const params = new URLSearchParams({ table });
    if (select) params.set('select', select);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    
    // Добавляем фильтры
    Object.entries(filters).forEach(([key, value]) => {
      params.set(key, String(value));
    });
    
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.REST}?${params.toString()}`;
    
    try {
      log(`REST: ${method} ${table}`, filters);
      
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      if (data && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
        fetchOptions.body = JSON.stringify(data);
      }
      
      const response = await fetchWithRetry(url, fetchOptions);
      const result = await response.json();
      
      if (!response.ok) {
        return { data: null, error: { message: result.error || 'REST error', code: response.status } };
      }
      
      return { data: result, error: null };
    } catch (e) {
      err(`REST ${method} ${table} failed:`, e.message);
      return { data: null, error: { message: e.message, code: 'NETWORK_ERROR' } };
    }
  }
  
  /**
   * Отправка SMS
   * @param {string} phone - Номер телефона
   * @param {string} message - Текст сообщения
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function sendSMS(phone, message) {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.SMS}`;
    
    try {
      log(`SMS: ${phone}`);
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to: phone, msg: message })
      });
      
      const data = await response.json();
      
      if (!response.ok || data.status_code !== 100) {
        return { success: false, error: data.status_text || data.error || 'SMS error' };
      }
      
      return { success: true };
    } catch (e) {
      err('SMS failed:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Сохранение лида (с лендинга)
   * @param {object} leadData - { name, phone, messenger, utm_* }
   * @returns {Promise<{success: boolean, id?: string, error?: string}>}
   */
  async function saveLead(leadData) {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.LEADS}`;
    
    try {
      log('Lead:', leadData.phone);
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(leadData)
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Lead save error' };
      }
      
      return { success: true, id: data.id };
    } catch (e) {
      err('Lead save failed:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Health check
   * @returns {Promise<boolean>}
   */
  async function healthCheck() {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.HEALTH}`;
    
    try {
      const response = await fetchWithTimeout(url, { method: 'GET' }, 5000);
      const data = await response.json();
      _isOnline = response.ok && data.status === 'ok';
      return _isOnline;
    } catch (e) {
      _isOnline = false;
      return false;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔐 AUTH МЕТОДЫ (обёртки для совместимости)
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Получить соль для PIN
   * @param {string} phone - Нормализованный телефон
   * @returns {Promise<{data: {salt, client_id, locked_until}[], error: any}>}
   */
  async function getClientSalt(phone) {
    return rpc('get_client_salt', { p_phone: phone });
  }
  
  /**
   * Верифицировать PIN
   * @param {string} phone - Нормализованный телефон
   * @param {string} pinHash - Хеш PIN
   * @returns {Promise<{data: {success, client_id, name, error, remaining_attempts}[], error: any}>}
   */
  async function verifyClientPin(phone, pinHash) {
    return rpc('verify_client_pin', { p_phone: phone, p_pin_hash: pinHash });
  }
  
  /**
   * Получить shared products
   * @param {object} options - { search, limit, offset }
   * @returns {Promise<{data: Product[], error: any}>}
   */
  async function getSharedProducts(options = {}) {
    return rpc('get_shared_products', {
      p_search: options.search || null,
      p_limit: options.limit || 100,
      p_offset: options.offset || 0
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 💾 KV STORE МЕТОДЫ
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Сохранить данные в client_kv_store
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ
   * @param {any} value - Значение (будет JSON.stringify)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function saveKV(clientId, key, value) {
    const result = await rpc('upsert_client_kv', {
      p_client_id: clientId,
      p_key: key,
      p_value: JSON.stringify(value)
    });
    
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true };
  }
  
  /**
   * Получить данные из client_kv_store
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ (опционально, если не указан — все ключи)
   * @returns {Promise<{data: any, error?: string}>}
   */
  async function getKV(clientId, key = null) {
    const result = await rpc('get_client_kv', {
      p_client_id: clientId,
      p_key: key
    });
    
    if (result.error) {
      return { data: null, error: result.error.message };
    }
    
    // Парсим JSON значения
    if (Array.isArray(result.data)) {
      const parsed = result.data.map(row => ({
        ...row,
        v: row.v ? JSON.parse(row.v) : null
      }));
      return { data: key ? parsed[0]?.v : parsed };
    }
    
    return { data: result.data };
  }
  
  /**
   * Удалить данные из client_kv_store
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function deleteKV(clientId, key) {
    const result = await rpc('delete_client_kv', {
      p_client_id: clientId,
      p_key: key
    });
    
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true };
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 📤 ЭКСПОРТ
  // ═══════════════════════════════════════════════════════════════════
  
  const YandexAPI = {
    // Конфигурация
    CONFIG,
    
    // Состояние
    isOnline: () => _isOnline,
    getLastError: () => _lastError,
    
    // Базовые методы
    rpc,
    rest,
    sendSMS,
    saveLead,
    healthCheck,
    
    // Auth методы
    getClientSalt,
    verifyClientPin,
    
    // Products
    getSharedProducts,
    
    // KV Store
    saveKV,
    getKV,
    deleteKV,
    
    // Алиасы для совместимости с Supabase SDK
    from: (table) => ({
      select: (columns = '*') => ({
        eq: (col, val) => rest(table, { select: columns, filters: { [`${col}__eq`]: val } }),
        limit: (n) => rest(table, { select: columns, limit: n }),
        single: () => rest(table, { select: columns, limit: 1 }).then(r => ({ ...r, data: r.data?.[0] }))
      }),
      insert: (data) => rest(table, { method: 'POST', data }),
      update: (data) => ({
        eq: (col, val) => rest(table, { method: 'PATCH', data, filters: { [`${col}__eq`]: val } })
      }),
      delete: () => ({
        eq: (col, val) => rest(table, { method: 'DELETE', filters: { [`${col}__eq`]: val } })
      })
    })
  };
  
  // Экспорт
  HEYS.YandexAPI = YandexAPI;
  
  // Для отладки в консоли
  if (typeof window !== 'undefined') {
    window.YandexAPI = YandexAPI;
  }
  
  log('✅ YandexAPI module loaded (api.heyslab.ru)');
  
})(typeof window !== 'undefined' ? window : global);
