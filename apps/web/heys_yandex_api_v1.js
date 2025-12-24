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
      HEALTH: '/health',
      AUTH_LOGIN: '/auth/login',
      AUTH_VERIFY: '/auth/verify'
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
   * @param {object} options - { method, filters, data, select, limit, offset, order, upsert, onConflict }
   * @returns {Promise<{data: any, error: any}>}
   */
  async function rest(table, options = {}) {
    const { method = 'GET', filters = {}, data = null, select, limit, offset, order, upsert, onConflict } = options;
    
    // Строим URL с параметрами (формат: /rest/v1/{table}?params)
    const params = new URLSearchParams();
    if (select) params.set('select', select);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (order) params.set('order', order);
    if (upsert) params.set('upsert', 'true');
    if (onConflict) params.set('on_conflict', onConflict);
    
    // Добавляем фильтры в формате Supabase: eq.column=value → column=eq.value
    Object.entries(filters).forEach(([key, value]) => {
      // Пропускаем undefined значения
      if (value === undefined || value === 'undefined') return;
      // Преобразуем формат: eq.id → id=eq.value
      if (key.startsWith('eq.')) {
        const col = key.slice(3);
        params.set(col, `eq.${value}`);
      } else if (key.startsWith('in.')) {
        const col = key.slice(3);
        params.set(col, `in.${value}`);
      } else {
        params.set(key, String(value));
      }
    });
    
    const queryString = params.toString();
    const url = `${CONFIG.API_URL}/rest/v1/${table}${queryString ? '?' + queryString : ''}`;
    
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
      
      // DEBUG: показываем что вернул API
      log(`REST RESPONSE: ${table}`, { status: response.status, rowCount: Array.isArray(result) ? result.length : 'not array', error: result?.error });
      
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
  // 🔐 CURATOR AUTH (JWT-based)
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Вход куратора (email + password)
   * @param {string} email - Email куратора
   * @param {string} password - Пароль
   * @returns {Promise<{data: {access_token, user, expires_in, expires_at}, error: any}>}
   */
  async function curatorLogin(email, password) {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.AUTH_LOGIN}`;
    
    try {
      log(`Curator login: ${email}`);
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        return { 
          data: null, 
          error: { message: data.error || 'Login failed', code: response.status } 
        };
      }
      
      // Успешный ответ: { access_token, token_type, expires_in, user }
      return { 
        data: {
          access_token: data.access_token,
          user: data.user,
          expires_in: data.expires_in,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 86400)
        }, 
        error: null 
      };
    } catch (e) {
      err('Curator login failed:', e.message);
      return { data: null, error: { message: e.message, code: 'NETWORK_ERROR' } };
    }
  }
  
  /**
   * Верификация JWT токена куратора
   * @param {string} token - JWT токен
   * @returns {Promise<{data: {valid: boolean, user?: object}, error: any}>}
   */
  async function verifyCuratorToken(token) {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.AUTH_VERIFY}`;
    
    try {
      log('Verifying curator token');
      
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ token })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.valid) {
        return { 
          data: { valid: false }, 
          error: data.error ? { message: data.error } : null 
        };
      }
      
      return { data: { valid: true, user: data.user }, error: null };
    } catch (e) {
      err('Token verification failed:', e.message);
      return { data: { valid: false }, error: { message: e.message } };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔐 AUTH МЕТОДЫ (REST-based — надёжнее чем RPC!)
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Получить соль для PIN (REST-based)
   * @param {string} phone - Нормализованный телефон
   * @returns {Promise<{data: {salt, client_id, locked_until}[], error: any}>}
   */
  async function getClientSalt(phone) {
    try {
      log(`getClientSalt (REST): phone=${phone}`);
      
      // Запрашиваем данные клиента по телефону
      const result = await rest('clients', {
        filters: { 'eq.phone': phone },
        select: 'id,pin_salt,pin_locked_until,pin_failed_attempts'
      });
      
      if (result.error) {
        return { data: null, error: result.error };
      }
      
      const client = result.data?.[0];
      if (!client) {
        return { data: [], error: null }; // Пустой массив = клиент не найден
      }
      
      // Проверяем блокировку
      if (client.pin_locked_until) {
        const lockedUntil = new Date(client.pin_locked_until);
        if (lockedUntil > new Date()) {
          return { 
            data: [{ 
              salt: null, 
              client_id: client.id, 
              locked_until: client.pin_locked_until 
            }], 
            error: null 
          };
        }
      }
      
      return { 
        data: [{ 
          salt: client.pin_salt, 
          client_id: client.id, 
          locked_until: null 
        }], 
        error: null 
      };
    } catch (e) {
      err('getClientSalt failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Верифицировать PIN (REST-based)
   * @param {string} phone - Нормализованный телефон
   * @param {string} pinHash - Хеш PIN
   * @returns {Promise<{data: {success, client_id, name, error, remaining_attempts}[], error: any}>}
   */
  async function verifyClientPin(phone, pinHash) {
    try {
      log(`verifyClientPin (REST): phone=${phone}`);
      
      // Получаем клиента с pin_hash
      const result = await rest('clients', {
        filters: { 'eq.phone': phone },
        select: 'id,name,pin_hash,pin_salt,pin_failed_attempts,pin_locked_until'
      });
      
      if (result.error) {
        return { data: null, error: result.error };
      }
      
      const client = result.data?.[0];
      if (!client) {
        return { 
          data: [{ success: false, error: 'client_not_found' }], 
          error: null 
        };
      }
      
      // Проверяем блокировку
      if (client.pin_locked_until) {
        const lockedUntil = new Date(client.pin_locked_until);
        if (lockedUntil > new Date()) {
          return { 
            data: [{ 
              success: false, 
              client_id: client.id,
              error: 'account_locked',
              locked_until: client.pin_locked_until
            }], 
            error: null 
          };
        }
      }
      
      // Проверяем PIN hash
      if (client.pin_hash === pinHash) {
        // Успех! Сбрасываем счётчик попыток
        await rest('clients', {
          method: 'PATCH',
          filters: { 'eq.id': client.id },
          data: { 
            pin_failed_attempts: 0,
            pin_locked_until: null
          }
        });
        
        return { 
          data: [{ 
            success: true, 
            client_id: client.id, 
            name: client.name 
          }], 
          error: null 
        };
      }
      
      // Неверный PIN — увеличиваем счётчик
      const attempts = (client.pin_failed_attempts || 0) + 1;
      const maxAttempts = 5;
      const remainingAttempts = maxAttempts - attempts;
      
      const updateData = { pin_failed_attempts: attempts };
      
      // Блокируем после 5 попыток на 15 минут
      if (attempts >= maxAttempts) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // +15 минут
        updateData.pin_locked_until = lockUntil.toISOString();
      }
      
      await rest('clients', {
        method: 'PATCH',
        filters: { 'eq.id': client.id },
        data: updateData
      });
      
      return { 
        data: [{ 
          success: false, 
          client_id: client.id,
          error: 'invalid_pin',
          remaining_attempts: Math.max(0, remainingAttempts)
        }], 
        error: null 
      };
    } catch (e) {
      err('verifyClientPin failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Получить shared products (REST-based)
   * @param {object} options - { search, limit, offset }
   * @returns {Promise<{data: Product[], error: any}>}
   */
  async function getSharedProducts(options = {}) {
    try {
      const { search, limit = 100, offset = 0 } = options;
      
      // Базовый запрос
      const filters = {};
      
      // TODO: поиск по имени (ilike не поддерживается в простом REST)
      // Для MVP — просто вернём все продукты
      
      const result = await rest('shared_products', {
        filters,
        limit,
        offset
      });
      
      if (result.error) {
        return { data: null, error: result.error };
      }
      
      let products = result.data || [];
      
      // Фильтрация на клиенте если есть search
      if (search && search.trim()) {
        const searchLower = search.toLowerCase().trim();
        products = products.filter(p => 
          p.name?.toLowerCase().includes(searchLower)
        );
      }
      
      return { data: products, error: null };
    } catch (e) {
      err('getSharedProducts failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 💾 KV STORE МЕТОДЫ (REST-based для надёжности)
  // ═══════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════
  // 🔑 KV ОПЕРАЦИИ (через RPC, не REST)
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Сохранить данные в client_kv_store (RPC)
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ
   * @param {any} value - Значение
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function saveKV(clientId, key, value) {
    try {
      const result = await rpc('save_client_kv', {
        p_client_id: clientId,
        p_key: key,
        p_value: value
      });
      
      if (result.error) {
        return { success: false, error: result.error.message || result.error };
      }
      
      // RPC возвращает {success: true/false, error?: string}
      const data = result.data;
      if (data?.success === false) {
        return { success: false, error: data.error || 'Unknown error' };
      }
      
      return { success: true };
    } catch (e) {
      err('saveKV failed:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  /**
   * Получить данные из client_kv_store (RPC)
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ (опционально, если не указан — все ключи)
   * @returns {Promise<{data: any, error?: string}>}
   */
  async function getKV(clientId, key = null) {
    try {
      const params = { p_client_id: clientId };
      if (key) {
        params.p_key = key;
      }
      
      const result = await rpc('get_client_kv', params);
      
      if (result.error) {
        return { data: null, error: result.error.message || result.error };
      }
      
      // RPC возвращает массив [{k, v, updated_at}, ...]
      const rows = Array.isArray(result.data) ? result.data : [result.data].filter(Boolean);
      
      if (key) {
        // Для конкретного ключа возвращаем только значение
        return { data: rows[0]?.v };
      }
      return { data: rows };
    } catch (e) {
      err('getKV failed:', e.message);
      return { data: null, error: e.message };
    }
  }
  
  /**
   * Получить ВСЕ KV данные клиента для синхронизации
   * @param {string} clientId - ID клиента
   * @returns {Promise<{data: Array<{k: string, v: any}>, error?: string}>}
   */
  async function getAllKV(clientId) {
    return getKV(clientId, null);
  }
  
  /**
   * Пакетное сохранение KV данных (RPC)
   * @param {string} clientId - ID клиента
   * @param {Array<{k: string, v: any}>} items - Массив данных
   * @returns {Promise<{success: boolean, saved: number, error?: string}>}
   */
  async function batchSaveKV(clientId, items) {
    if (!items || items.length === 0) {
      return { success: true, saved: 0 };
    }
    
    try {
      const result = await rpc('batch_upsert_client_kv', {
        p_client_id: clientId,
        p_items: items
      });
      
      if (result.error) {
        return { success: false, saved: 0, error: result.error.message || result.error };
      }
      
      // RPC возвращает {success: true/false, saved: number, error?: string}
      const data = result.data;
      return { 
        success: data?.success !== false, 
        saved: data?.saved || 0,
        error: data?.error
      };
    } catch (e) {
      err('batchSaveKV failed:', e.message);
      return { success: false, saved: 0, error: e.message };
    }
  }
  
  /**
   * Удалить данные из client_kv_store (RPC)
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function deleteKV(clientId, key) {
    try {
      const result = await rpc('delete_client_kv', {
        p_client_id: clientId,
        p_key: key
      });
      
      if (result.error) {
        return { success: false, error: result.error.message || result.error };
      }
      
      return { success: true };
    } catch (e) {
      err('deleteKV failed:', e.message);
      return { success: false, error: e.message };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // � CLIENTS МЕТОДЫ
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Получить список клиентов куратора
   * @param {string} curatorId - ID куратора
   * @returns {Promise<{data: Array<{id, name}>, error: any}>}
   */
  async function getClients(curatorId) {
    if (!curatorId) {
      return { data: [], error: { message: 'curatorId required' } };
    }
    
    try {
      log(`getClients: curatorId=${curatorId}`);
      
      const result = await rest('clients', {
        filters: { 'eq.curator_id': curatorId },
        select: 'id,name,updated_at'
      });
      
      if (result.error) {
        return { data: null, error: result.error };
      }
      
      // Сортируем по updated_at (ascending)
      const clients = (result.data || []).sort((a, b) => {
        const dateA = new Date(a.updated_at || 0);
        const dateB = new Date(b.updated_at || 0);
        return dateA - dateB;
      });
      
      return { data: clients, error: null };
    } catch (e) {
      err('getClients failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Создать нового клиента (без phone/PIN)
   * @param {string} name - Имя клиента
   * @param {string} curatorId - ID куратора
   * @returns {Promise<{data: {id, name}, error: any}>}
   */
  async function createClient(name, curatorId) {
    if (!curatorId) {
      return { data: null, error: { message: 'curatorId required' } };
    }
    
    try {
      log(`createClient: name=${name}, curatorId=${curatorId}`);
      
      const result = await rest('clients', {
        method: 'POST',
        data: { 
          name: name || `Клиент ${Date.now()}`,
          curator_id: curatorId
        }
      });
      
      if (result.error) {
        return { data: null, error: result.error };
      }
      
      // REST POST возвращает массив
      const client = Array.isArray(result.data) ? result.data[0] : result.data;
      return { data: client, error: null };
    } catch (e) {
      err('createClient failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Обновить клиента
   * @param {string} clientId - ID клиента
   * @param {object} data - Данные для обновления { name, ... }
   * @returns {Promise<{data: any, error: any}>}
   */
  async function updateClient(clientId, data) {
    if (!clientId) {
      return { data: null, error: { message: 'clientId required' } };
    }
    
    try {
      log(`updateClient: id=${clientId}`, data);
      
      const result = await rest('clients', {
        method: 'PATCH',
        filters: { 'eq.id': clientId },
        data
      });
      
      return result;
    } catch (e) {
      err('updateClient failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Удалить клиента
   * @param {string} clientId - ID клиента
   * @returns {Promise<{data: any, error: any}>}
   */
  async function deleteClient(clientId) {
    if (!clientId) {
      return { data: null, error: { message: 'clientId required' } };
    }
    
    try {
      log(`deleteClient: id=${clientId}`);
      
      const result = await rest('clients', {
        method: 'DELETE',
        filters: { 'eq.id': clientId }
      });
      
      return result;
    } catch (e) {
      err('deleteClient failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 📋 SUBSCRIPTIONS МЕТОДЫ (RPC)
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Проверить статус подписки клиента
   * @param {string} clientId - ID клиента
   * @returns {Promise<{data: object, error: any}>}
   */
  async function checkSubscriptionStatus(clientId) {
    try {
      log(`checkSubscriptionStatus: clientId=${clientId}`);
      
      const result = await rpc('check_subscription_status', {
        p_client_id: clientId
      });
      
      return result;
    } catch (e) {
      err('checkSubscriptionStatus failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Запустить триал для клиента
   * @param {string} clientId - ID клиента
   * @returns {Promise<{data: object, error: any}>}
   */
  async function startTrial(clientId) {
    try {
      log(`startTrial: clientId=${clientId}`);
      
      const result = await rpc('start_trial', {
        p_client_id: clientId
      });
      
      return result;
    } catch (e) {
      err('startTrial failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Активировать подписку
   * @param {string} clientId - ID клиента
   * @param {string} plan - План (base/pro/proplus)
   * @param {number} months - Количество месяцев
   * @returns {Promise<{data: object, error: any}>}
   */
  async function activateSubscription(clientId, plan, months = 1) {
    try {
      log(`activateSubscription: clientId=${clientId}, plan=${plan}, months=${months}`);
      
      const result = await rpc('activate_subscription', {
        p_client_id: clientId,
        p_plan: plan,
        p_months: months
      });
      
      return result;
    } catch (e) {
      err('activateSubscription failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 📝 CONSENTS МЕТОДЫ (RPC)
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Залогировать согласия клиента
   * @param {string} clientId - ID клиента
   * @param {Array<{type, version, granted}>} consents - Согласия
   * @param {string} userAgent - User agent
   * @returns {Promise<{data: object, error: any}>}
   */
  async function logConsents(clientId, consents, userAgent = null) {
    try {
      log(`logConsents: clientId=${clientId}`, consents);
      
      // ВАЖНО: pg драйвер требует JSONB как строку, не объект!
      const result = await rpc('log_consents', {
        p_client_id: clientId,
        p_consents: JSON.stringify(consents),  // Must be string for pg JSONB!
        p_ip: null,
        p_user_agent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null)
      });
      
      return result;
    } catch (e) {
      err('logConsents failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Проверить наличие обязательных согласий
   * @param {string} clientId - ID клиента
   * @returns {Promise<{data: {valid, missing}, error: any}>}
   */
  async function checkRequiredConsents(clientId) {
    try {
      log(`checkRequiredConsents: clientId=${clientId}`);
      
      const result = await rpc('check_required_consents', {
        p_client_id: clientId
      });
      
      return result;
    } catch (e) {
      err('checkRequiredConsents failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Отозвать согласие
   * @param {string} clientId - ID клиента
   * @param {string} consentType - Тип согласия
   * @returns {Promise<{data: object, error: any}>}
   */
  async function revokeConsent(clientId, consentType) {
    try {
      log(`revokeConsent: clientId=${clientId}, type=${consentType}`);
      
      const result = await rpc('revoke_consent', {
        p_client_id: clientId,
        p_consent_type: consentType
      });
      
      return result;
    } catch (e) {
      err('revokeConsent failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 🏭 SHARED PRODUCTS МЕТОДЫ
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Создать pending продукт
   * @param {object} product - Данные продукта
   * @returns {Promise<{data: object, error: any}>}
   */
  async function createPendingProduct(product) {
    try {
      log(`createPendingProduct:`, product.name);
      
      const result = await rpc('create_pending_product', product);
      
      return result;
    } catch (e) {
      err('createPendingProduct failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // 💳 PAYMENTS МЕТОДЫ (ЮKassa)
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Создать платёж через ЮKassa
   * @param {string} clientId - ID клиента
   * @param {string} plan - План подписки (base/pro/proplus)
   * @param {string} returnUrl - URL для редиректа после оплаты
   * @returns {Promise<{data: {paymentId, confirmationUrl}, error: any}>}
   */
  async function createPayment(clientId, plan, returnUrl) {
    try {
      log(`createPayment: clientId=${clientId}, plan=${plan}`);
      
      const response = await fetch(`${CONFIG.API_URL}/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clientId,
          plan,
          returnUrl
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      log(`createPayment success:`, data);
      
      return { data, error: null };
    } catch (e) {
      err('createPayment failed:', e.message);
      _lastError = e.message;
      return { data: null, error: { message: e.message } };
    }
  }
  
  /**
   * Получить статус платежа
   * @param {string} paymentId - ID платежа ЮKassa
   * @param {string} clientId - ID клиента (для безопасности)
   * @returns {Promise<{data: {status, paid, amount}, error: any}>}
   */
  async function getPaymentStatus(paymentId, clientId) {
    try {
      log(`getPaymentStatus: paymentId=${paymentId}`);
      
      const response = await fetch(
        `${CONFIG.API_URL}/payments/status?paymentId=${encodeURIComponent(paymentId)}&clientId=${encodeURIComponent(clientId)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      log(`getPaymentStatus success:`, data);
      
      return { data, error: null };
    } catch (e) {
      err('getPaymentStatus failed:', e.message);
      _lastError = e.message;
      return { data: null, error: { message: e.message } };
    }
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
    curatorLogin,
    verifyCuratorToken,
    
    // 👥 Clients
    getClients,
    createClient,
    updateClient,
    deleteClient,
    
    // 📋 Subscriptions
    checkSubscriptionStatus,
    startTrial,
    activateSubscription,
    
    // � Payments (ЮKassa)
    createPayment,
    getPaymentStatus,
    
    // �📝 Consents
    logConsents,
    checkRequiredConsents,
    revokeConsent,
    
    // 🏭 Products
    getSharedProducts,
    createPendingProduct,
    
    // KV Store (REST-based для надёжности)
    saveKV,
    getKV,
    getAllKV,
    batchSaveKV,
    deleteKV,
    
    // Алиасы для совместимости с Supabase SDK
    from: (table) => ({
      select: (columns = '*') => ({
        eq: (col, val) => ({
          // Chainable .eq().in()
          in: (col2, vals) => rest(table, { select: columns, filters: { [`eq.${col}`]: val, [`in.${col2}`]: `(${vals.join(',')})` } }),
          // Chainable .eq().eq()
          eq: (col2, val2) => rest(table, { select: columns, filters: { [`eq.${col}`]: val, [`eq.${col2}`]: val2 } }),
          // Chainable .eq().like() 
          like: (col2, pattern) => rest(table, { select: columns, filters: { [`eq.${col}`]: val, [`like.${col2}`]: pattern } }),
          // Chainable .eq().order().limit() — для meta check queries
          order: (orderCol, opts = {}) => ({
            limit: (n) => rest(table, { select: columns, filters: { [`eq.${col}`]: val }, order: `${orderCol}.${opts.ascending ? 'asc' : 'desc'}`, limit: n }),
            then: (resolve) => rest(table, { select: columns, filters: { [`eq.${col}`]: val }, order: `${orderCol}.${opts.ascending ? 'asc' : 'desc'}` }).then(resolve)
          }),
          // Terminal .single() - throws if no row
          single: () => rest(table, { select: columns, filters: { [`eq.${col}`]: val }, limit: 1 }).then(r => ({ ...r, data: r.data?.[0] })),
          // Terminal .maybeSingle() - returns null if no row, no error
          maybeSingle: () => rest(table, { select: columns, filters: { [`eq.${col}`]: val }, limit: 1 }).then(r => ({ ...r, data: r.data?.[0] || null })),
          // Terminal .then()
          then: (resolve) => rest(table, { select: columns, filters: { [`eq.${col}`]: val } }).then(resolve)
        }),
        in: (col, vals) => rest(table, { select: columns, filters: { [`in.${col}`]: `(${vals.join(',')})` } }),
        like: (col, pattern) => rest(table, { select: columns, filters: { [`like.${col}`]: pattern } }),
        limit: (n) => rest(table, { select: columns, limit: n }),
        order: (col, opts = {}) => ({
          eq: (c, v) => rest(table, { select: columns, filters: { [`eq.${c}`]: v }, order: `${col}.${opts.ascending ? 'asc' : 'desc'}` }),
          limit: (n) => rest(table, { select: columns, limit: n, order: `${col}.${opts.ascending ? 'asc' : 'desc'}` }),
          then: (resolve) => rest(table, { select: columns, order: `${col}.${opts.ascending ? 'asc' : 'desc'}` }).then(resolve)
        }),
        single: () => rest(table, { select: columns, limit: 1 }).then(r => ({ ...r, data: r.data?.[0] })),
        then: (resolve) => rest(table, { select: columns }).then(resolve)
      }),
      insert: (data) => ({
        select: (columns = '*') => ({
          single: () => rest(table, { method: 'POST', data, select: columns }).then(r => ({ ...r, data: r.data?.[0] })),
          then: (resolve) => rest(table, { method: 'POST', data, select: columns }).then(resolve)
        }),
        then: (resolve) => rest(table, { method: 'POST', data }).then(resolve)
      }),
      update: (data) => ({
        eq: (col, val) => ({
          select: (columns = '*') => rest(table, { method: 'PATCH', data, filters: { [`eq.${col}`]: val }, select: columns }),
          then: (resolve) => rest(table, { method: 'PATCH', data, filters: { [`eq.${col}`]: val } }).then(resolve)
        }),
        then: (resolve) => rest(table, { method: 'PATCH', data }).then(resolve)
      }),
      upsert: (data, opts = {}) => ({
        select: (columns = '*') => rest(table, { method: 'POST', data, upsert: true, onConflict: opts.onConflict, select: columns }),
        then: (resolve) => rest(table, { method: 'POST', data, upsert: true, onConflict: opts.onConflict }).then(resolve)
      }),
      delete: () => ({
        eq: (col, val) => ({
          eq: (col2, val2) => rest(table, { method: 'DELETE', filters: { [`eq.${col}`]: val, [`eq.${col2}`]: val2 } }),
          then: (resolve) => rest(table, { method: 'DELETE', filters: { [`eq.${col}`]: val } }).then(resolve)
        }),
        in: (col, vals) => rest(table, { method: 'DELETE', filters: { [`in.${col}`]: `(${vals.join(',')})` } })
      })
    }),
    
    // Advanced: прямой REST доступ для сложных запросов
    rest
  };
  
  // Экспорт
  HEYS.YandexAPI = YandexAPI;
  
  // Для отладки в консоли
  if (typeof window !== 'undefined') {
    window.YandexAPI = YandexAPI;
  }
  
  log('✅ YandexAPI module loaded (api.heyslab.ru)');
  
})(typeof window !== 'undefined' ? window : global);
