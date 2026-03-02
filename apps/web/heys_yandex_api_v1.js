// heys_yandex_api_v1.js — Yandex Cloud API adapter (152-ФЗ compliant)
// Замена Supabase на собственный API в Yandex Cloud
// v58: Enhanced token detection with namespaced fallback + better diagnostics

; (function (global) {
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

    // Таймауты (нарастающие: 1я попытка 15с, 2я 20с, 3я 30с)
    TIMEOUT_MS: 15000,
    TIMEOUT_ESCALATION_MS: [15000, 20000, 30000],

    // Retry логика (exponential backoff: 2с → 5с → 10с)
    // v59 FIX I: Increased delays for cold-start resilience.
    // 502 returns instantly (not timeout), so retry window = sum of delays.
    // Old [1000,3000,7000] gave only 4s — less than CF cold start (>4s).
    // New [2000,5000,10000] gives 7s — enough for CF warm-up.
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 2000,
    RETRY_DELAY_ESCALATION_MS: [2000, 5000, 10000]
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🌐 СОСТОЯНИЕ
  // ═══════════════════════════════════════════════════════════════════

  let _isOnline = true;
  let _lastError = null;
  let _curatorTokenLogged = false;

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════════

  // Debug логи — только при localStorage.heys_debug_api = 'true'
  function log(...args) {
    if (global.localStorage?.getItem('heys_debug_api') === 'true') {
      console.info('[HEYS.api]', ...args);
    }
  }

  // Критические логи — ВСЕГДА видны
  function logInfo(...args) {
    console.info('[HEYS.api]', ...args);
  }

  function err(...args) {
    console.error('[HEYS.api] ❌', ...args);
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
   * Выполнить запрос с retry (exponential backoff + нарастающий таймаут)
   */
  async function fetchWithRetry(url, options, retries = CONFIG.MAX_RETRIES) {
    let lastError;

    for (let i = 0; i <= retries; i++) {
      // ⏱️ Нарастающий таймаут: 15с → 20с → 30с
      const timeoutMs = CONFIG.TIMEOUT_ESCALATION_MS[i] || CONFIG.TIMEOUT_MS;
      try {
        const response = await fetchWithTimeout(url, options, timeoutMs);

        // 🔄 v58 FIX: Retry on server errors (502/503/504) — cold start recovery
        // Yandex API Gateway returns 502 when cloud function times out on cold start.
        // Without this check, fetchWithRetry returns 502 as valid response (no retry).
        const retryableStatuses = [502, 503, 504];
        if (retryableStatuses.includes(response.status)) {
          const msg = `Server error ${response.status} (retryable)`;
          err(`Attempt ${i + 1}/${retries + 1}: ${msg}`);
          throw new Error(msg);
        }

        return response;
      } catch (e) {
        lastError = e;
        err(`Attempt ${i + 1}/${retries + 1} failed (timeout=${timeoutMs}ms):`, e.message);

        if (i < retries) {
          // ⏱️ Exponential backoff: 1с → 3с → 7с
          const delay = CONFIG.RETRY_DELAY_ESCALATION_MS[i] || CONFIG.RETRY_DELAY_MS;
          console.info(`[HEYS.api] ↩️ Retry ${i + 1}/${retries} in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    _isOnline = false;
    _lastError = lastError;
    throw lastError;
  }

  /**
   * Получить JWT токен куратора из localStorage
   * 🔧 v57 FIX: Читаем heys_curator_session (куратор JWT), а НЕ heys_supabase_auth_token (Supabase auth)
   * @returns {string|null}
   */
  function getCuratorToken() {
    try {
      // 1. Сначала проверяем curator JWT (правильный ключ)
      const curatorSession = localStorage.getItem('heys_curator_session');
      if (curatorSession) {
        log('getCuratorToken: using heys_curator_session');
        if (!_curatorTokenLogged) {
          logInfo('🔐 [HEYS.auth] Токен куратора найден (heys_curator_session)');
          _curatorTokenLogged = true;
        }
        return curatorSession;
      }

      // 2. Fallback: legacy supabase auth (для обратной совместимости)
      const supabaseAuth = localStorage.getItem('heys_supabase_auth_token');
      if (supabaseAuth) {
        const parsed = JSON.parse(supabaseAuth);
        if (parsed?.access_token) {
          log('getCuratorToken: fallback to heys_supabase_auth_token');
          if (!_curatorTokenLogged) {
            logInfo('🔐 [HEYS.auth] Токен куратора найден (legacy heys_supabase_auth_token)');
            _curatorTokenLogged = true;
          }
          return parsed.access_token;
        }
      }

      return null;
    } catch (e) {
      err('getCuratorToken failed:', e.message);
      return null;
    }
  }

  /**
   * 🔐 v56: Получить user_id куратора из auth token
   * Используется для REST upsert операций
   * @returns {string|null}
   */
  function getCuratorUserId() {
    try {
      const stored = localStorage.getItem('heys_supabase_auth_token');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return parsed?.user?.id || null;
    } catch (e) {
      err('getCuratorUserId failed:', e.message);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 📡 API МЕТОДЫ
  // ═══════════════════════════════════════════════════════════════════

  // 🔐 Функции, требующие JWT токен куратора
  const CURATOR_ONLY_FUNCTIONS = [
    // === CLIENT MANAGEMENT ===
    'create_client_with_pin',
    'reset_client_pin',
    'get_curator_clients',
    'admin_get_all_clients',

    // === SUBSCRIPTION MANAGEMENT ===
    'admin_extend_subscription',
    'admin_cancel_subscription',
    'admin_extend_trial',

    // === TRIAL QUEUE ADMIN ===
    'admin_get_trial_queue_list',
    'admin_add_to_queue',
    'admin_remove_from_queue',
    'admin_send_offer',
    'admin_activate_trial',           // 🆕 v4.0: JWT-only
    'admin_reject_request',
    'admin_get_queue_stats',
    'admin_update_queue_settings',

    // === LEADS MANAGEMENT (v3.0) ===
    'admin_get_leads',
    'admin_convert_lead',
    'admin_update_lead_status',       // 🆕 v3.0: Отклонение лидов

    // === GAMIFICATION AUDIT ===
    'log_gamification_event_by_curator',
    'get_gamification_events_by_curator',
    'delete_gamification_events_by_curator',
  ];

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

      // 🔐 Для curator-only функций добавляем JWT токен
      const headers = {
        'Content-Type': 'application/json'
      };

      if (CURATOR_ONLY_FUNCTIONS.includes(fnName)) {
        const curatorToken = getCuratorToken();
        if (!curatorToken) {
          err(`RPC ${fnName} requires curator token, but none found`);
          return { data: null, error: { message: 'Требуется авторизация куратора', code: 'UNAUTHORIZED' } };
        }
        headers['Authorization'] = `Bearer ${curatorToken}`;
        log(`RPC: ${fnName} — adding curator JWT`);
      }

      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params)
      });

      const data = await response.json();

      if (!response.ok) {
        try {
          console.error('[HEYS.api] ❌ RPC failed', {
            fn: fnName,
            code: response.status,
            message: data?.error || 'RPC error',
            details: data?.details,
            rawKeys: data ? Object.keys(data) : []
          });
        } catch (_) { }
        return {
          data: null,
          error: {
            message: data.error || 'RPC error',
            code: response.status,
            details: data.details,
            raw: data
          }
        };
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
      // Преобразуем формат: eq.id → id=eq.value, gt.updated_at → updated_at=gt.value
      const dotIdx = key.indexOf('.');
      if (dotIdx > 0) {
        const op = key.slice(0, dotIdx);  // eq, in, gt, gte, lt, lte, like, neq
        const col = key.slice(dotIdx + 1);
        params.set(col, `${op}.${value}`);
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

      // v60: REST POST возвращает {success, rowCount, inserted} вместо массива
      const displayCount = Array.isArray(result) ? result.length : (result?.rowCount || result?.inserted || 'obj');
      log(`REST RESPONSE: ${table}`, { status: response.status, rowCount: displayCount, success: result?.success, error: result?.error });

      if (!response.ok) {
        return { data: null, error: { message: result.error || result.message || 'REST error', code: response.status } };
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
      if (data?.user?.id) {
        logInfo('🔐 [HEYS.auth] Вход куратора OK:', `${data.user.id.slice(0, 8)}...`);
      } else {
        logInfo('🔐 [HEYS.auth] Вход куратора OK');
      }
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
        logInfo('🔐 [HEYS.auth] Проверка токена: invalid');
        return {
          data: { valid: false },
          error: data.error ? { message: data.error } : null
        };
      }

      if (data?.user?.id) {
        logInfo('🔐 [HEYS.auth] Проверка токена: valid', `${data.user.id.slice(0, 8)}...`);
      } else {
        logInfo('🔐 [HEYS.auth] Проверка токена: valid');
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
      const { search, limit = null, offset = 0 } = options;

      // Базовый запрос
      const filters = {};

      // TODO: поиск по имени (ilike не поддерживается в простом REST)
      // Для MVP — просто вернём все продукты

      const restOptions = {
        filters,
        offset
      };

      if (limit != null) {
        restOptions.limit = limit;
      }

      const result = await rest('shared_products', restOptions);

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
  // 🔑 KV ОПЕРАЦИИ (через RPC, session-safe — 🔐 P1 IDOR fix!)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Получить session_token для KV операций
   * @returns {string|null}
   * 🔧 v58 FIX: Улучшенная диагностика и fallback на heys_pin_auth_client
   */
  function getSessionTokenForKV() {
    // 1) Пробуем через HEYS.auth (должен уже мигрировать если нужно)
    if (typeof HEYS !== 'undefined' && HEYS.auth && typeof HEYS.auth.getSessionToken === 'function') {
      const token = HEYS.auth.getSessionToken();
      if (token) {
        log('getSessionTokenForKV: got token from HEYS.auth:', token.slice(0, 8) + '...');
        return token;
      }
    }

    // 2) Fallback: напрямую из localStorage
    const raw = localStorage.getItem('heys_session_token');
    if (raw) {
      log('getSessionTokenForKV: got token from localStorage');
      try {
        return JSON.parse(raw);
      } catch {
        return raw; // Если не JSON — вернуть как есть
      }
    }

    // 3) 🔧 v58: Ещё один fallback — ищем под namespaced ключом
    const pinClient = localStorage.getItem('heys_pin_auth_client');
    const currentClient = localStorage.getItem('heys_client_current');
    const clientId = (pinClient || currentClient || '').replace(/"/g, '');

    if (clientId) {
      const namespacedKey = `heys_${clientId}_session_token`;
      const namespacedRaw = localStorage.getItem(namespacedKey);
      if (namespacedRaw) {
        // Мигрируем в глобальный ключ (одноразово)
        localStorage.setItem('heys_session_token', namespacedRaw);
        localStorage.removeItem(namespacedKey);
        try {
          return JSON.parse(namespacedRaw);
        } catch {
          return namespacedRaw;
        }
      }
    }

    // 4) Нет session_token — это НОРМАЛЬНО для куратора (у него JWT, не PIN)
    // Не логируем как warning, это ожидаемый fallback на REST path
    return null;
  }

  /**
   * Сохранить данные в client_kv_store (RPC) — 🔐 session-safe!
   * @param {string} clientId - ID клиента (IGNORED для безопасности!)
   * @param {string} key - Ключ
   * @param {any} value - Значение
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function saveKV(clientId, key, value) {
    try {
      const sessionToken = getSessionTokenForKV();
      if (!sessionToken) {
        return { success: false, error: 'No session token' };
      }

      // 🔐 P1: Используем session-версию (client_id извлекается на сервере!)
      const result = await rpc('upsert_client_kv_by_session', {
        p_session_token: sessionToken,
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
   * Получить данные из client_kv_store (RPC) — 🔐 session-safe!
   * @param {string} clientId - ID клиента (IGNORED для безопасности!)
   * @param {string} key - Ключ (опционально, если не указан — все ключи)
   * @returns {Promise<{data: any, error?: string}>}
   */
  async function getKV(clientId, key = null) {
    try {
      const sessionToken = getSessionTokenForKV();
      if (!sessionToken) {
        return { data: null, error: 'No session token' };
      }

      // 🔐 P1: Используем session-версию
      // Примечание: для "все ключи" пока нет session-версии, возвращаем ошибку
      if (!key) {
        // TODO: Создать get_all_client_kv_by_session если нужно
        warn('getKV without key not supported in session mode');
        return { data: [], error: null };
      }

      const result = await rpc('get_client_kv_by_session', {
        p_session_token: sessionToken,
        p_key: key
      });

      if (result.error) {
        return { data: null, error: result.error.message || result.error };
      }

      // RPC возвращает {success, found, key, value}
      const data = result.data;
      if (data?.found) {
        return { data: data.value };
      }
      return { data: null };
    } catch (e) {
      err('getKV failed:', e.message);
      return { data: null, error: e.message };
    }
  }

  /**
   * Получить ВСЕ KV данные клиента для синхронизации
   * @param {string} clientId - ID клиента
   * @param {Object} [options] - Опции
   * @param {string} [options.since] - ISO timestamp для delta sync (только изменения после этого момента)
   * @returns {Promise<{data: Array<{k: string, v: any}>, error?: string, delta?: boolean}>}
   */
  async function getAllKV(clientId, options = {}) {
    if (!clientId) {
      return { data: [], error: 'No clientId provided' };
    }

    const since = options.since || null;

    try {
      log(`getAllKV: Loading ${since ? 'delta' : 'all'} data for client ${clientId.slice(0, 8)}...${since ? ' (since ' + since + ')' : ''}`);

      const sessionToken = getSessionTokenForKV();
      if (!sessionToken) {
        // 🔐 Fallback для куратора: JWT + /auth/clients/:id/kv
        const curatorToken = getCuratorToken();
        if (!curatorToken) {
          return { data: [], error: 'No session token' };
        }

        // 🚀 Delta Sync: добавляем since в query string
        let url = `${CONFIG.API_URL}/auth/clients/${encodeURIComponent(clientId)}/kv`;
        if (since) {
          url += `?since=${encodeURIComponent(since)}`;
        }
        const response = await fetchWithRetry(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${curatorToken}`
          }
        });

        const result = await response.json();
        if (!response.ok) {
          return { data: [], error: result?.error || 'Curator KV fetch failed' };
        }

        const rows = Array.isArray(result?.data) ? result.data : [];
        log(`getAllKV: Loaded ${rows.length} keys (curator${since ? ', delta' : ', full'})`);
        return { data: rows, error: null, delta: !!since };
      }

      const rpcParams = {
        p_session_token: sessionToken,
      };
      // 🚀 Delta Sync: передаём p_since для RPC
      if (since) {
        rpcParams.p_since = since;
      }

      const { data, error } = await rpc('get_client_data_by_session', rpcParams);

      if (error) {
        err('getAllKV RPC error:', error.message || error);
        return { data: [], error: error.message || error };
      }

      if (data?.error) {
        return { data: [], error: data.error };
      }

      const payload = data?.data || {};
      const entries = Object.entries(payload).map(([k, v]) => ({ k, v }));

      log(`getAllKV: Loaded ${entries.length} keys${data?.delta ? ' (delta)' : ' (full)'}`);
      return { data: entries, error: null, delta: !!data?.delta };
    } catch (e) {
      err('getAllKV failed:', e.message);
      return { data: [], error: e.message };
    }
  }

  /**
   * 🔐 v56: Пакетное сохранение KV через REST API (для куратора)
   * Используется когда нет session_token (куратор работает через JWT)
   * @param {string} curatorUserId - ID куратора (user_id в таблице)
   * @param {string} clientId - ID клиента  
   * @param {Array<{k: string, v: any, updated_at?: string}>} items - Массив данных
   * @returns {Promise<{success: boolean, saved: number, error?: string}>}
   */
  async function batchSaveKVviaREST(curatorUserId, clientId, items) {
    log(`[v56] batchSaveKVviaREST: curator=${curatorUserId?.slice(0, 8)}, client=${clientId?.slice(0, 8)}, items=${items.length}`);

    if (!curatorUserId || !clientId || !items?.length) {
      return { success: false, saved: 0, error: 'Missing required params for REST save' };
    }

    try {
      // Формируем данные для REST upsert
      // Primary Key: (user_id, client_id, k)
      const restData = items.map(item => ({
        user_id: curatorUserId,
        client_id: clientId,
        k: item.k,
        v: item.v,
        updated_at: item.updated_at || new Date().toISOString()
      }));

      // DIAGNOSTIC: логируем размер payload для больших batch
      try {
        const payloadBytes = new TextEncoder().encode(JSON.stringify(restData)).length;
        if (payloadBytes >= 100 * 1024) {
          console.warn(
            `[HEYS.api] ⚠️ Large payload: ${Math.round(payloadBytes / 1024)}KB (${items.length} items)`
          );
        }
      } catch (e) {
        console.warn('[HEYS.api] ⚠️ Payload size check failed');
      }

      // REST POST с upsert
      // ⚠️ v59 FIX: PK таблицы client_kv_store = (client_id, k), НЕ (user_id, client_id, k)!
      const result = await rest('client_kv_store', {
        method: 'POST',
        data: restData,
        upsert: true,
        onConflict: 'client_id,k'
      });

      if (result.error) {
        err('[v56] REST upsert error:', result.error);
        return { success: false, saved: 0, error: result.error.message || result.error };
      }

      // v60: REST теперь возвращает { success, rowCount, inserted } для upsert
      const responseData = result.data;
      const actualSaved = responseData?.rowCount || responseData?.inserted || items.length;
      log(`[v56] REST upsert success: ${actualSaved} items saved (requested: ${items.length})`);
      return { success: true, saved: actualSaved };
    } catch (e) {
      err('[v56] batchSaveKVviaREST failed:', e.message);
      return { success: false, saved: 0, error: e.message };
    }
  }

  /**
   * Пакетное сохранение KV данных — 🔐 dual-path: RPC для PIN клиентов, REST для куратора
   * @param {string} clientId - ID клиента
   * @param {Array<{k: string, v: any}>} items - Массив данных
   * @returns {Promise<{success: boolean, saved: number, error?: string}>}
   */
  async function batchSaveKV(clientId, items) {
    if (!items || items.length === 0) {
      return { success: true, saved: 0 };
    }

    try {
      // 🔐 Path 1: Попытка через session token (PIN auth клиент)
      const sessionToken = getSessionTokenForKV();
      // 🔇 v4.7.0: DEBUG логи отключены
      if (sessionToken) {
        const result = await rpc('batch_upsert_client_kv_by_session', {
          p_session_token: sessionToken,
          p_items: items
        });

        // 🔇 v4.7.0: DEBUG логи отключены

        if (result.error) {
          console.error('[YandexAPI] batchSaveKV RPC ERROR:', result.error);
          return { success: false, saved: 0, error: result.error.message || result.error };
        }

        const data = result.data;
        return {
          success: data?.success !== false,
          saved: data?.saved || 0,
          error: data?.error
        };
      }

      // 🔐 v56 Path 2: Fallback на REST для куратора
      const curatorUserId = getCuratorUserId();
      if (curatorUserId) {
        log(`[v56] No session token, trying REST path (curator=${curatorUserId?.slice(0, 8)})`);
        return await batchSaveKVviaREST(curatorUserId, clientId, items);
      }

      // Нет ни session token, ни curator token
      err('[v56] batchSaveKV: No auth token available (neither session nor curator)');
      return { success: false, saved: 0, error: 'No auth token available' };
    } catch (e) {
      err('batchSaveKV failed:', e.message);
      return { success: false, saved: 0, error: e.message };
    }
  }

  /**
   * 🔐 v56: Удалить KV через REST API (для куратора)
   * @param {string} userId - ID куратора
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ для удаления
   * @returns {Promise<{success: boolean, deleted?: number, error?: string}>}
   */
  async function deleteKVviaREST(userId, clientId, key) {
    try {
      const curatorToken = getCuratorToken();
      if (!curatorToken) {
        return { success: false, error: 'No curator token' };
      }

      const url = `${API_BASE}/rest/client_kv_store?user_id=eq.${userId}&client_id=eq.${clientId}&k=eq.${encodeURIComponent(key)}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${curatorToken}`
        }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `REST DELETE failed: ${response.status}`);
      }

      const data = await response.json();
      log(`[v56] deleteKVviaREST success: deleted ${data.deleted || 0} rows`);
      return { success: true, deleted: data.deleted || 0 };
    } catch (e) {
      err('deleteKVviaREST failed:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Удалить данные из client_kv_store — 🔐 v56: dual-path (RPC + REST fallback)
   * @param {string} clientId - ID клиента
   * @param {string} key - Ключ
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function deleteKV(clientId, key) {
    try {
      // 🔐 Путь 1: RPC с session token (для PIN auth клиентов)
      const sessionToken = getSessionTokenForKV();
      if (sessionToken) {
        const result = await rpc('delete_client_kv_by_session', {
          p_session_token: sessionToken,
          p_key: key
        });

        if (result.error) {
          return { success: false, error: result.error.message || result.error };
        }

        return { success: result.data?.success !== false };
      }

      // 🔐 Путь 2 (v56): REST DELETE для куратора
      const curatorUserId = getCuratorUserId();
      if (curatorUserId && clientId) {
        log(`[v56] No session token, trying REST DELETE (curator=${curatorUserId?.slice(0, 8)})`);
        return await deleteKVviaREST(curatorUserId, clientId, key);
      }

      // Ни session token, ни curator — ошибка
      return { success: false, error: 'No auth token available' };
    } catch (e) {
      err('deleteKV failed:', e.message);
      return { success: false, error: e.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 👥 CLIENTS МЕТОДЫ
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Получить список клиентов куратора
   * @param {string} curatorId - ID куратора
   * @returns {Promise<{data: Array<{id, name}>, error: any}>}
   */
  async function getClients(curatorId) {
    try {
      // 🔐 Используем /auth/clients вместо REST API (clients убран из REST по security)
      // Требует JWT токен куратора
      const token = getCuratorToken();
      if (!token) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const safeCuratorId = curatorId || 'self';
      log(`getClients: curatorId=${safeCuratorId}`);

      const url = `${CONFIG.API_URL}/auth/clients`;
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        return { data: null, error: { message: result.error || 'Failed to get clients', code: response.status } };
      }

      const rawClients = result.data || [];
      const hasSubscriptionFields = rawClients.some((client) =>
        Object.prototype.hasOwnProperty.call(client, 'subscription_status') ||
        Object.prototype.hasOwnProperty.call(client, 'trial_ends_at')
      );

      let clients = rawClients.map((client) => ({
        ...client,
        subscription_status: typeof client.subscription_status === 'undefined'
          ? null
          : client.subscription_status,
        trial_ends_at: typeof client.trial_ends_at === 'undefined'
          ? null
          : client.trial_ends_at
      }));

      // 🔧 Fallback: если /auth/clients вернул старый формат без подписки
      if (!hasSubscriptionFields && clients.length > 0) {
        logInfo('⚠️ [HEYS.clients] /auth/clients missing subscription fields, fallback to RPC', {
          total: clients.length
        });
        // 🔐 get_curator_clients требует JWT — rpc() автоматически добавит токен из CURATOR_ONLY_FUNCTIONS
        const fallback = await rpc('get_curator_clients', {});
        if (!fallback.error && Array.isArray(fallback.data)) {
          clients = fallback.data;
          log('getClients: fallback to get_curator_clients');
        }
      }

      // 🐛 DEBUG: логируем поля для отладки Trial Machine
      if (clients.length > 0) {
        console.info('[HEYS.clients] 🐛 Client fields:', Object.keys(clients[0]));
        console.info('[HEYS.clients] 🐛 First client sample:', {
          id: clients[0].id?.substring(0, 8),
          name: clients[0].name,
          subscription_status: clients[0].subscription_status,
          trial_ends_at: clients[0].trial_ends_at,
          active_until: clients[0].active_until
        });
      }

      // Сортируем по updated_at (ascending)
      clients = clients.sort((a, b) => {
        const dateA = new Date(a.updated_at || 0);
        const dateB = new Date(b.updated_at || 0);
        return dateA - dateB;
      });

      log(`getClients: SUCCESS, ${clients.length} clients`);

      // 🔐 Кэшируем для cloud.ensureClient (clients убран из REST API)
      if (typeof window !== 'undefined') {
        window.HEYS = window.HEYS || {};
        window.HEYS.curatorClients = clients;
      }

      return { data: clients, error: null };
    } catch (e) {
      err('getClients failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * Создать нового клиента (без phone/PIN)
   * 🔐 Использует /auth/clients вместо REST API (clients убран из REST по security)
   * @param {string} name - Имя клиента
   * @param {string} curatorId - ID куратора (не используется - берём из JWT)
   * @returns {Promise<{data: {id, name}, error: any}>}
   */
  async function createClient(name, curatorId) {
    try {
      log(`createClient: name=${name}`);

      const token = getCuratorToken();
      if (!token) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const url = `${CONFIG.API_URL}/auth/clients`;
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: name || `Клиент ${Date.now()}` })
      });

      const result = await response.json();

      if (!response.ok) {
        return { data: null, error: { message: result.error || 'Failed to create client', code: response.status } };
      }

      // Обновляем кэш клиентов
      if (result.data && window.HEYS?.curatorClients) {
        window.HEYS.curatorClients.push(result.data);
      }

      return { data: result.data, error: null };
    } catch (e) {
      err('createClient failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * Обновить клиента
   * 🔐 Использует /auth/clients вместо REST API (clients убран из REST по security)
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

      const token = getCuratorToken();
      if (!token) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const url = `${CONFIG.API_URL}/auth/clients/${clientId}`;
      const response = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok) {
        return { data: null, error: { message: result.error || 'Failed to update client', code: response.status } };
      }

      // Обновляем кэш клиентов
      if (result.data && window.HEYS?.curatorClients) {
        const idx = window.HEYS.curatorClients.findIndex(c => c.id === clientId);
        if (idx >= 0) window.HEYS.curatorClients[idx] = result.data;
      }

      return { data: result.data, error: null };
    } catch (e) {
      err('updateClient failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * Удалить клиента
   * 🔐 Использует /auth/clients вместо REST API (clients убран из REST по security)
   * @param {string} clientId - ID клиента
   * @returns {Promise<{data: any, error: any}>}
   */
  async function deleteClient(clientId) {
    if (!clientId) {
      return { data: null, error: { message: 'clientId required' } };
    }

    try {
      log(`deleteClient: id=${clientId}`);

      const token = getCuratorToken();
      if (!token) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const url = `${CONFIG.API_URL}/auth/clients/${clientId}`;
      const response = await fetchWithRetry(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        return { data: null, error: { message: result.error || 'Failed to delete client', code: response.status } };
      }

      // Удаляем из кэша клиентов
      if (window.HEYS?.curatorClients) {
        window.HEYS.curatorClients = window.HEYS.curatorClients.filter(c => c.id !== clientId);
      }

      return { data: { success: true }, error: null };
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
  async function checkSubscriptionStatus(sessionToken = null) {
    try {
      const token = sessionToken || HEYS.auth?.getSessionToken?.();
      if (!token) {
        return { data: null, error: { message: 'No session token' } };
      }

      log(`checkSubscriptionStatus: using session-based RPC`);

      const result = await rpc('get_subscription_status_by_session', {
        p_session_token: token
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
   * 🔐 Session-safe логирование согласий (IDOR protection)
   * Используется PIN-клиентами — client_id определяется из session_token на сервере
   * @param {Array<{type, version, granted}>} consents - Согласия
   * @param {string} userAgent - User agent
   * @returns {Promise<{data: object, error: any}>}
   */
  async function logConsentsBySession(consents, userAgent = null) {
    try {
      log('logConsentsBySession (session-safe)', consents);

      const result = await rpc('log_consents_by_session', {
        p_session_token: getSessionTokenForKV(),
        p_consents: JSON.stringify(consents),
        p_ip: null,
        p_user_agent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null)
      });

      return result;
    } catch (e) {
      err('logConsentsBySession failed:', e.message);
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
   * Создать pending продукт (🔐 P1: session-версия)
   * @param {object} product - Данные продукта
   * @returns {Promise<{data: object, error: any}>}
   */
  async function createPendingProduct(product) {
    try {
      log(`createPendingProduct:`, product.name);

      // 🔐 P1: Используем session-версию (IDOR fix)
      const sessionToken = getSessionTokenForKV();
      if (!sessionToken) {
        return { data: null, error: { message: 'No session token' } };
      }

      const result = await rpc('create_pending_product_by_session', {
        p_session_token: sessionToken,
        p_name: product.name,
        p_product_data: product
      });

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
