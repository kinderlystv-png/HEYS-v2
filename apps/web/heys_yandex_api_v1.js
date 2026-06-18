// heys_yandex_api_v1.js — Yandex Cloud API adapter (152-ФЗ compliant)
// Замена Supabase на собственный API в Yandex Cloud
// v58: Enhanced token detection with namespaced fallback + better diagnostics

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // DEMO_MODE: replace YandexAPI with a no-op surface. Any call to .rpc/.rest/
  // .from()/etc. resolves to an empty result so HEYS code paths that touch the
  // API (e.g. heys_cloud_shared_v1.js) don't hit the network at all.
  if (global.__HEYS_DEMO_MODE__ && global.__HEYS_DEMO_MODE__.enabled) {
    const empty = function () { return Promise.resolve({ data: [], error: null }); };
    const chain = function () {
      const obj = {};
      const fn = function () { return obj; };
      const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'in',
        'gt', 'lt', 'gte', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle'];
      methods.forEach(function (m) { obj[m] = fn; });
      obj.then = function (resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); };
      return obj;
    };
    HEYS.YandexAPI = {
      rpc: empty,
      rest: empty,
      sms: empty,
      from: function () { return chain(); },
      setAuthToken: function () {},
      clearAuthToken: function () {},
      getAuthToken: function () { return null; },
    };
    (global.console || console).info('[HEYS.YandexAPI] DEMO_MODE — no-op stub installed');
    return;
  }
  const isLocalBrowserDev =
    typeof window !== 'undefined' &&
    typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
    !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || ''));

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 КОНФИГУРАЦИЯ
  // ═══════════════════════════════════════════════════════════════════

  const CONFIG = {
    // Локально — через Node :4001: POST /rpc с браузера на api.heyslab.ru ломается preflight
    // (Allow-Origin часто только https://heyslab.ru). Прокси — same-origin для Vite.
    API_URL: isLocalBrowserDev
      ? 'http://localhost:4001'
      : 'https://api.heyslab.ru',

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

    // Таймауты (нарастающие; верхняя попытка capped — меньше «зависло на 30с» при плохой сети)
    // Локально: крупный bootstrap через прокси — чуть длиннее окно, чем на проде
    TIMEOUT_MS: isLocalBrowserDev ? 60000 : 12000,
    TIMEOUT_ESCALATION_MS: isLocalBrowserDev ? [60000, 90000, 120000] : [12000, 18000, 22000],

    // Retry логика (exponential backoff; последний шаг чуть короче для UX)
    // v59 FIX I: Increased delays for cold-start resilience.
    // 502 returns instantly (not timeout), so retry window = sum of delays.
    // Old [1000,3000,7000] gave only 4s — less than CF cold start (>4s).
    // New [2000,5000,10000] gives 7s — enough for CF warm-up.
    MAX_RETRIES: 2,
    RETRY_DELAY_MS: 2000,
    RETRY_DELAY_ESCALATION_MS: [2000, 4500, 7000]
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🌐 СОСТОЯНИЕ
  // ═══════════════════════════════════════════════════════════════════

  let _isOnline = true;
  let _lastError = null;
  let _lastErrorAt = 0;
  let _curatorTokenLogged = false;
  const PIN_COOKIE_SESSION_HINT_KEY = 'heys_pin_cookie_session_hint';
  const CURATOR_COOKIE_SESSION_HINT_KEY = 'heys_curator_cookie_session_hint';

  function setCookieSessionHint(kind, active) {
    const key = kind === 'curator' ? CURATOR_COOKIE_SESSION_HINT_KEY : PIN_COOKIE_SESSION_HINT_KEY;
    try {
      if (active) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch (_) { /* noop */ }
  }

  function hasCookieSessionHint(kind) {
    const key = kind === 'curator' ? CURATOR_COOKIE_SESSION_HINT_KEY : PIN_COOKIE_SESSION_HINT_KEY;
    try {
      return !!localStorage.getItem(key);
    } catch (_) {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 УТИЛИТЫ
  // ═══════════════════════════════════════════════════════════════════

  // Debug логи — только при включённой группе api или localStorage.heys_debug_api = 'true'
  function log(...args) {
    if (global.__heysLogControl?.isEnabled?.('api') === true || global.localStorage?.getItem('heys_debug_api') === 'true') {
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
   * 🔁 Phase A SWR invalidation: уведомить SW что cache для GET /rest/client_kv_store
   * больше не валиден. Вызывается после успешных write-операций (saveKV / batchSaveKV /
   * mergeSaveKV / deleteKV). SW clears API_KV_CACHE и broadcast'ит INVALIDATED в tabs.
   * Fail-safe: noop если SW недоступен (private mode, нет controller).
   */
  function invalidateSwKvCache(reason) {
    try {
      const sw = (typeof navigator !== 'undefined') && navigator.serviceWorker;
      if (sw && sw.controller) {
        sw.controller.postMessage({ type: 'INVALIDATE_KV', reason: reason || 'kv_write' });
      }
    } catch (_) { /* noop */ }
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
      // ⏱️ Нарастающий таймаут (см. CONFIG.TIMEOUT_ESCALATION_MS)
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
          const baseDelay = CONFIG.RETRY_DELAY_ESCALATION_MS[i] || CONFIG.RETRY_DELAY_MS;
          // PERF NEW-14: jitter ±30% — десинхронизирует ретраи между вкладками/клиентами,
          // чтобы после cold-start 502 не приходила thundering herd через 2с/4.5с/7с в lockstep.
          const jitter = (Math.random() - 0.5) * 0.6 * baseDelay; // ±30% от base
          const delay = Math.max(100, Math.round(baseDelay + jitter));
          console.info(`[HEYS.api] ↩️ Retry ${i + 1}/${retries} in ${delay}ms (base=${baseDelay}±30%)...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    _isOnline = false;
    _lastError = lastError;
    _lastErrorAt = Date.now();
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

  function shouldTryCookieCuratorRequest() {
    try {
      const host = global.location && global.location.hostname || '';
      return !!host && host !== 'localhost' && host !== '127.0.0.1';
    } catch (_) {
      return false;
    }
  }

  function buildCuratorRequestHeaders(baseHeaders = {}) {
    const token = getCuratorToken();
    const headers = { ...(baseHeaders || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return {
      ok: !!token || shouldTryCookieCuratorRequest(),
      headers,
      token
    };
  }

  function hasCuratorRuntimeContext() {
    if (getCuratorToken()) return true;
    try {
      if (global.HEYS?.auth?.isCuratorSession?.() === true) return true;
    } catch (_) { /* noop */ }
    try {
      if (global.HEYS?.cloud?.getUser?.()) return true;
    } catch (_) { /* noop */ }
    return false;
  }

  function shouldUseCuratorAuthPath() {
    return !!getCuratorToken() ||
      (shouldTryCookieCuratorRequest() && hasCuratorRuntimeContext());
  }

  function decodeJwtPayload(token) {
    try {
      const part = String(token || '').split('.')[1];
      if (!part) return null;
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      if (typeof atob !== 'function') return null;
      const raw = atob(padded);
      try {
        return JSON.parse(decodeURIComponent(Array.prototype.map.call(raw, ch => {
          return '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2);
        }).join('')));
      } catch (_) {
        return JSON.parse(raw);
      }
    } catch (_) {
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
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.user?.id) return parsed.user.id;
        } catch (_) {
          // Malformed legacy-compatible token must not block bare JWT fallback.
        }
      }

      const curatorSession = localStorage.getItem('heys_curator_session');
      const payload = decodeJwtPayload(curatorSession);
      return payload?.sub || payload?.user_id || null;
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

    // === PIN MANAGEMENT (Phase 1 hotfix — bcrypt в БД) ===
    'admin_set_client_pin',           // 🆕 plain pin → bcrypt в БД (замена reset_client_pin)
    'admin_regenerate_pin',           // 🆕 авто-перевыпуск PIN+pin_token
    'admin_clear_telegram_binding',    // Сброс chat_id, если ссылку открыл не клиент
    'admin_get_client_access_link',    // Получение текущей Telegram-ссылки одного клиента

    // === GAMIFICATION AUDIT ===
    'log_gamification_event_by_curator',
    'get_gamification_events_by_curator',
    'delete_gamification_events_by_curator',

    // === KV STORAGE (curator, JWT-auth) — warm-path parity with PIN ===
    // Куратор шлёт данные через горячий heys-api-rpc вместо холодного
    // heys-api-rest. rpc() автоматически положит JWT в Authorization.
    'batch_upsert_client_kv_by_curator',
    'merge_save_client_kv_by_curator', // 🔀 Server-side merge для dayv2/norms/profile (curator path)
    'issue_write_context_by_curator',  // 🛡️ Write context for curator KV uploads
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
        const shouldTryCookieCurator = shouldTryCookieCuratorRequest();
        if (!curatorToken && !shouldTryCookieCurator) {
          err(`RPC ${fnName} requires curator token, but none found`);
          return { data: null, error: { message: 'Требуется авторизация куратора', code: 'UNAUTHORIZED' } };
        }
        if (curatorToken) {
          headers['Authorization'] = `Bearer ${curatorToken}`;
          log(`RPC: ${fnName} — adding curator JWT`);
        } else {
          log(`RPC: ${fnName} — using HttpOnly curator cookie`);
        }
      }

      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        // Phase C (2026-05-19): send/receive HttpOnly cookies for cross-
        // subdomain (app.heyslab.ru → api.heyslab.ru). Without `include`
        // the browser drops the cookie even though CORS allows credentials.
        credentials: 'include'
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

    // Строим URL с параметрами (формат: /rest/{table}?params)
    const params = new URLSearchParams();
    if (select) params.set('select', select);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (order) params.set('order', order);
    if (upsert) params.set('upsert', 'true');
    if (onConflict) params.set('on_conflict', onConflict);

    // Добавляем фильтры в формате Supabase: eq.column=value → column=eq.value
    Object.entries(filters).forEach(([key, value]) => {
      // Пропускаем undefined/null значения (null → строка "null" → невалидный SQL)
      if (value === undefined || value === 'undefined' || value === null || value === 'null') return;
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
    const url = `${CONFIG.API_URL}/rest/${table}${queryString ? '?' + queryString : ''}`;

    try {
      log(`REST: ${method} ${table}`, filters);

      // 🔐 SEC-024: /rest/client_kv_store GET must carry an identity signal.
      // PIN legacy path: X-Session-Token. PIN cookie-only path: credentials
      // include lets heys-api-rest read HttpOnly heys_session_token. Curator
      // path: explicit JWT so strict read can verify ownership.
      const headers = { 'Content-Type': 'application/json' };
      try {
        const curatorToken = getCuratorToken();
        if (curatorToken) {
          headers.Authorization = `Bearer ${curatorToken}`;
        } else {
          const tok = (typeof getSessionTokenForKV === 'function') ? getSessionTokenForKV() : null;
          if (tok) headers['X-Session-Token'] = tok;
        }
      } catch (_) { /* noop */ }

      const fetchOptions = {
        method,
        headers,
        credentials: 'include'
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
   * Вход куратора (email + password + optional MFA code)
   * @param {string} email - Email куратора
   * @param {string} password - Пароль
   * @param {string} [mfaCode] - TOTP-код куратора
   * @returns {Promise<{data: {access_token, user, expires_in, expires_at}, error: any}>}
   */
  async function curatorLogin(email, password, mfaCode) {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.AUTH_LOGIN}`;

    try {
      log(`Curator login: ${email}`);

      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password, mfa_code: mfaCode || undefined }),
        // PR-B (2026-05-20): принимаем Set-Cookie от heys-api-auth
        // (heys_curator_jwt, HttpOnly, Domain=.heyslab.ru). credentials:'include'
        // обязателен для cross-subdomain cookie carriage.
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        return {
          data: null,
          error: {
            message: data.mfa_required ? 'Введите код 2FA из приложения' : (data.error || 'Login failed'),
            code: response.status,
            mfa_required: !!data.mfa_required
          }
        };
      }

      // Успешный ответ: { access_token, token_type, expires_in, user }
      if (data?.user?.id) {
        logInfo('🔐 [HEYS.auth] Вход куратора OK:', `${data.user.id.slice(0, 8)}...`);
      } else {
        logInfo('🔐 [HEYS.auth] Вход куратора OK');
      }
      setCookieSessionHint('curator', true);

      try {
        const cleanup = await clientLogout();
        if (cleanup && cleanup.ok === false) {
          throw new Error(cleanup.error?.message || cleanup.error?.error || 'role_switch_cleanup_failed');
        }
      } catch (cleanupErr) {
        try { await curatorLogout(); } catch (_) { /* rollback best-effort */ }
        return {
          data: null,
          error: {
            message: cleanupErr?.message || 'role_switch_cleanup_failed',
            code: 'ROLE_SWITCH_CLEANUP_FAILED',
          },
        };
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
   * @returns {Promise<{data: {valid: boolean, user?: object, expires_at?: number}, error: any}>}
   */
  async function verifyCuratorToken(token) {
    const url = `${CONFIG.API_URL}${CONFIG.ENDPOINTS.AUTH_VERIFY}`;

    try {
      log('Verifying curator token');

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(token ? { token } : {})
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

      return { data: { valid: true, user: data.user, expires_at: data.expires_at }, error: null };
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
   * PR-C (2026-05-20) перенёс client session_token в HttpOnly cookie. JS его
   * прочитать не может, поэтому `getSessionTokenForKV()` возвращает null для
   * всех post-deploy логинов. Чтобы upload не упирался в "No auth token
   * available", session-RPC вызываются здесь: если LS-токен есть — передаём
   * его явно (legacy путь до естественного истечения 30-дневного TTL); если
   * нет, но есть PIN-сессия (cookie carrier) — делаем RPC без
   * `p_session_token`, и heys-api-rpc подставляет токен из cookie
   * (см. yandex-cloud-functions/heys-api-rpc/index.js, cookie-based session
   * carriage). Возвращает {ok, rpcParams} либо {ok: false} если ни LS, ни
   * cookie не доступны.
   */
  function buildSessionRpcParams(extra = {}) {
    const token = getSessionTokenForKV();
    if (token) return { ok: true, params: { ...extra, p_session_token: token } };
    const hasCookieSession = !!global?.HEYS?.cloud?.isPinAuthClient?.() ||
      shouldTryCookieSessionRequest();
    if (hasCookieSession) return { ok: true, params: { ...extra } };
    return { ok: false, params: null };
  }

  async function getCurrentClientBySession() {
    try {
      const { data, error } = await rpc('get_client_data_by_session', {});
      if (error) return { data: null, error };
      if (data?.error) return { data: null, error: { message: data.error, raw: data } };

      const clientId = data?.client_id || data?.id || data?.data?.id;
      if (!clientId) return { data: null, error: { message: 'client_id_missing', raw: data } };

      return {
        data: {
          id: clientId,
          name: data?.name || data?.data?.name || null,
          raw: data,
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: { message: e.message || String(e) } };
    }
  }

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

    // 3) 🔧 v58: namespaced-fallback. PR-C (2026-05-20): миграцию в
    // глобальный ключ убрали — новые сессии живут в HttpOnly cookie,
    // а старые namespaced-токены тоже естественно истекут через 30
    // дней. Просто читаем и удаляем устаревший namespaced-ключ.
    const pinClient = localStorage.getItem('heys_pin_auth_client');
    const currentClient = localStorage.getItem('heys_client_current');
    const clientId = (pinClient || currentClient || '').replace(/"/g, '');

    if (clientId) {
      const namespacedKey = `heys_${clientId}_session_token`;
      const namespacedRaw = localStorage.getItem(namespacedKey);
      if (namespacedRaw) {
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

  function shouldTryCookieSessionRequest() {
    try {
      if (global?.HEYS?.cloud?.isPinAuthClient?.()) return true;
      return hasCookieSessionHint('pin');
    } catch (_) {
      return false;
    }
  }

  /**
   * Сохранить данные в client_kv_store (RPC) — 🔐 session-safe!
   * @param {string} clientId - ID клиента (IGNORED для безопасности!)
   * @param {string} key - Ключ
   * @param {any} value - Значение
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function saveKV(clientId, key, value, contextId = null) {
    try {
      // 🛡️ CRITICAL FIX (2026-05-17): curator path FIRST.
      // Без этого stale session token от прошлой PIN-сессии резолвил бы
      // client_id из session → save попадал бы не туда. Используем
      // batch_upsert_client_kv_by_curator с одним item — SQL функция уже
      // имеет ownership guard через clients.curator_id = caller.
      const useCuratorPath = shouldUseCuratorAuthPath();
      if (useCuratorPath) {
        try {
          if (/^heys_(?:profile|norms|game|hr_zones|dayv2_)/i.test(String(key))) {
            const stack = (new Error()).stack || '';
            const caller = stack.split('\n').slice(2, 5).map(s => s.trim().replace(/^at\s+/, '').slice(0, 70)).join(' ← ');
            global.HEYS?.__pt?.('RPC_SAVE_CURATOR', {
              targetCid: String(clientId).slice(0, 8),
              k: String(key).slice(0, 60),
              fp: global.HEYS?.__ptFingerprint?.(value),
              caller,
            });
          }
        } catch (_) { /* noop */ }
        const result = await rpc('batch_upsert_client_kv_by_curator', {
          p_client_id: clientId,
          p_items: [{ k: key, v: value }],
          p_context_id: contextId || null, // 🛡️ Phase B2 write context
        });
        if (!result.error) {
          const data = result.data;
          const success = data?.success !== false;
          // 🛡️ Layer 4: handle identity_blocked для saveKV path (single item batch).
          try {
            if (Array.isArray(data?.identity_blocked) && data.identity_blocked.length > 0) {
              for (const ib of data.identity_blocked) {
                if (ib && typeof ib.k === 'string') {
                  try { global.HEYS?.cloud?._dropRejectedKey?.(clientId, ib.k, ib.reason || 'identity_blocked'); } catch (_) { /* noop */ }
                }
              }
            }
          } catch (_) { /* noop */ }
          if (success && !data?.error) {
            invalidateSwKvCache('saveKV_curator');
            return { success: true };
          }
          return { success: false, error: data?.error || 'Curator save failed' };
        }
        // Curator RPC ошибка — НЕ fallback на session (риск wrong-client write).
        return { success: false, error: result.error.message || String(result.error) };
      }

      // Fallback: PIN auth client (no curator token). Post PR-C cookie-only —
      // buildSessionRpcParams даёт безтокенный body для cookie carrier.
      const sessionRpc = buildSessionRpcParams({
        p_key: key,
        p_value: value,
        p_context_id: contextId || null, // 🛡️ Phase B2 write context
      });
      if (!sessionRpc.ok) {
        return { success: false, error: 'No auth token (neither curator nor session)' };
      }
      const result = await rpc('upsert_client_kv_by_session', sessionRpc.params);
      if (result.error) {
        return { success: false, error: result.error.message || result.error };
      }
      const data = result.data;
      if (data?.success === false) {
        return { success: false, error: data.error || 'Unknown error' };
      }
      invalidateSwKvCache('saveKV_session');
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
      // 🛡️ CRITICAL FIX (2026-05-17): curator path FIRST через getKVBatchByCurator.
      // Without this, stale session token routes READ to the wrong client's row,
      // and any subsequent write-back to LS corrupts curator's local state.
      // Real incident vector: Phase 5 polling fetchCloudDay read wrong-client day
      // and wrote it into LS scoped under the "correct" client_id.
      const useCuratorPath = shouldUseCuratorAuthPath();
      if (useCuratorPath && key && clientId) {
        const result = await getKVBatchByCurator(clientId, [key]);
        if (result.error) {
          return { data: null, error: result.error };
        }
        if (Array.isArray(result.data) && result.data.length > 0) {
          return { data: result.data[0].v };
        }
        return { data: null }; // not found
      }

      // Post PR-C cookie-only через buildSessionRpcParams.
      if (!key) {
        // TODO: Создать get_all_client_kv_by_session если нужно
        warn('getKV without key not supported in session mode');
        return { data: [], error: null };
      }
      const sessionRpc = buildSessionRpcParams({ p_key: key });
      if (!sessionRpc.ok) {
        return { data: null, error: 'No session token' };
      }

      const result = await rpc('get_client_kv_by_session', sessionRpc.params);

      if (result.error) {
        return { data: null, error: result.error.message || result.error };
      }

      // RPC возвращает {success, found, key, value}
      let data = result.data;
      // Некоторые RPC-ответы приходят в обёртке по имени функции:
      // { get_client_kv_by_session: { success, found, key, value } }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const keys = Object.keys(data);
        if (keys.length === 1 && data[keys[0]] && typeof data[keys[0]] === 'object') {
          data = data[keys[0]];
        }
      }
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
   * Batch-чтение KV (RPC) — 🔐 session-safe!
   * Phase 1a hot-sync: один запрос вместо N getKV().
   * @param {string} clientId - ID клиента (IGNORED для безопасности!)
   * @param {string[]} keys - Массив ключей для чтения
   * @returns {Promise<{data: Array<{k: string, v: any}> | null, error?: string}>}
   */
  async function getKVBatch(clientId, keys) {
    try {
      if (!Array.isArray(keys) || keys.length === 0) {
        return { data: [], error: null };
      }

      // 🛡️ CRITICAL FIX (2026-05-17): curator path FIRST.
      // getKVBatchByCurator уже использует REST с явным client_id — безопасно.
      const useCuratorPath = shouldUseCuratorAuthPath();
      if (useCuratorPath && clientId) {
        return await getKVBatchByCurator(clientId, keys);
      }

      const sessionRpc = buildSessionRpcParams({ p_keys: keys });
      if (!sessionRpc.ok) {
        return { data: null, error: 'No session token' };
      }

      const result = await rpc('batch_get_client_kv_by_session', sessionRpc.params);

      if (result.error) {
        return { data: null, error: result.error.message || result.error };
      }

      let data = result.data;
      // Unwrap function name wrapper if present
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const dataKeys = Object.keys(data);
        if (dataKeys.length === 1 && data[dataKeys[0]] && typeof data[dataKeys[0]] === 'object') {
          data = data[dataKeys[0]];
        }
      }

      if (data?.error) {
        return { data: null, error: data.error };
      }

      // L2 (2026-06-03): items now carry per-row `revision` + `updated_at`; the
      // response carries top-level `server_revision`. Surfaced as extra fields here
      // (data shape unchanged → callers that read `data` are unaffected). Dormant
      // until L3 consumes them.
      return {
        data: Array.isArray(data?.items) ? data.items : [],
        server_revision: typeof data?.server_revision === 'number' ? data.server_revision : undefined,
        error: null
      };
    } catch (e) {
      err('getKVBatch failed:', e.message);
      return { data: null, error: e.message };
    }
  }

  /**
   * Phase 1b: Получить scoped change markers для клиента (session-safe).
   *
   * ⚠️ PIN-ONLY (2026-05-17 incident): эта функция работает только для
   * PIN-клиентов через session token. Куратор должен использовать
   * `getChangeMarkersByCurator(clientId, since)` напрямую — иначе stale
   * session token резолвит client_id из чужой PIN-сессии и куратор
   * получит markers не того клиента.
   *
   * @param {string|null} [since] - ISO timestamp, если null вернёт все маркеры
   * @returns {Promise<{data: Object|null, error?: string}>}
   */
  async function getChangeMarkers(since, sinceRevision) {
    try {
      // 🛡️ Guard: если есть curator token — это значит куратор. Curator должен
      // вызвать getChangeMarkersByCurator явно. Возвращаем early-error чтобы
      // обнаружить misuse в логах и заставить callers переключиться.
      if (shouldUseCuratorAuthPath()) {
        warn('getChangeMarkers called in curator context — use getChangeMarkersByCurator(clientId, since) instead');
        return { data: null, error: 'curator_should_use_getChangeMarkersByCurator' };
      }

      const sessionRpc = buildSessionRpcParams({});
      if (!sessionRpc.ok) {
        return { data: null, error: 'No session token' };
      }

      const params = sessionRpc.params;
      if (since) params.p_since = since;
      // L3c (2026-06-03): revision checkpoint. When provided, the server filters by
      // changed_revision > p_since_revision (clock-skew immune) and ignores p_since.
      // Omitted → server falls back to the timestamp path (deploy-lag / un-migrated).
      if (sinceRevision != null) params.p_since_revision = sinceRevision;

      const result = await rpc('get_change_markers_by_session', params);

      if (result.error) {
        return { data: null, error: result.error.message || result.error };
      }

      let data = result.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const dataKeys = Object.keys(data);
        if (dataKeys.length === 1 && data[dataKeys[0]] && typeof data[dataKeys[0]] === 'object') {
          data = data[dataKeys[0]];
        }
      }

      if (data?.error) {
        return { data: null, error: data.error };
      }

      // L2 (2026-06-03): `markers` keeps its {scope: changed_at} shape (un-upgraded
      // bundles compare changed_at as a timestamp). Per-scope `marker_revisions`
      // {scope: changed_revision} and top-level `server_revision` are surfaced as
      // extra fields — dormant until L3 switches the checkpoint to revision.
      return {
        data: data?.markers || {},
        marker_revisions: (data && typeof data.marker_revisions === 'object') ? data.marker_revisions : undefined,
        server_revision: typeof data?.server_revision === 'number' ? data.server_revision : undefined,
        error: null
      };
    } catch (e) {
      err('getChangeMarkers failed:', e.message);
      return { data: null, error: e.message };
    }
  }

  /**
   * Phase 1b curator fallback: Получить change markers через REST (curator JWT).
   * Используется когда session_token недоступен (куратор не имеет PIN-сессии).
   * @param {string} clientId - ID клиента
   * @param {string|null} [since] - ISO timestamp
   * @returns {Promise<{data: Object|null, error?: string}>}
   */
  async function getChangeMarkersByCurator(clientId, since, sinceRevision) {
    if (!clientId) return { data: null, error: 'No clientId' };
    try {
      const filters = { 'eq.client_id': clientId };
      // L3c (2026-06-03): prefer the revision checkpoint (clock-skew immune) when we
      // have one; fall back to the timestamp delta otherwise.
      if (sinceRevision != null) {
        filters['gt.changed_revision'] = sinceRevision;
      } else if (since) {
        filters['gt.changed_at'] = since;
      }
      // L2 (2026-06-03): widen to read changed_revision (server-revision watermark).
      const result = await rest('client_change_markers', {
        select: 'scope,changed_at,changed_revision',
        filters
      });
      if (result.error) {
        return { data: null, error: result.error.message || result.error };
      }
      const rows = Array.isArray(result.data) ? result.data : [];
      const markers = {};
      const markerRevisions = {};
      let serverRevision = 0;
      for (const row of rows) {
        if (!row.scope) continue;
        markers[row.scope] = row.changed_at; // unchanged shape (backward-compat)
        const rev = Number(row.changed_revision) || 0;
        markerRevisions[row.scope] = rev;
        if (rev > serverRevision) serverRevision = rev;
      }
      // No curator RPC variant exists, so server_revision is derived as the max
      // changed_revision across this client's scopes (== latest write's revision).
      return { data: markers, marker_revisions: markerRevisions, server_revision: serverRevision, error: null };
    } catch (e) {
      err('getChangeMarkersByCurator failed:', e.message);
      return { data: null, error: e.message };
    }
  }

  /**
   * Phase 1a curator fallback: Batch-read KV через REST (curator JWT).
   * Используется когда session_token недоступен.
   * @param {string} clientId - ID клиента
   * @param {string[]} keys - Ключи для чтения
   * @returns {Promise<{data: Array<{k: string, v: any}> | null, error?: string}>}
   */
  async function getKVBatchByCurator(clientId, keys) {
    if (!clientId) return { data: null, error: 'No clientId' };
    if (!Array.isArray(keys) || keys.length === 0) return { data: [], error: null };
    try {
      // L2 (2026-06-03): widen to read per-row revision + updated_at so the curator
      // hot-sync path has parity with the session RPC. Previously mapped to {k,v}
      // only, which silently stripped revision.
      const result = await rest('client_kv_store', {
        select: 'k,v,revision,updated_at',
        filters: {
          'eq.client_id': clientId,
          'in.k': `(${keys.join(',')})`
        }
      });
      if (result.error) {
        return { data: null, error: result.error.message || result.error };
      }
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows.map(r => ({ k: r.k, v: r.v, revision: r.revision, updated_at: r.updated_at })), error: null };
    } catch (e) {
      err('getKVBatchByCurator failed:', e.message);
      return { data: null, error: e.message };
    }
  }

  /**
   * Получить ВСЕ KV данные клиента по curator JWT, игнорируя session_token.
   * Нужен для curator-only сценариев, где глобальный heys_session_token может
   * остаться от PIN-входа и вернуть данные не того клиента.
   * @param {string} clientId - ID клиента
   * @param {Object} [options] - Опции
   * @param {string} [options.since] - ISO timestamp для delta sync
   * @returns {Promise<{data: Array<{k: string, v: any}>, error?: string, delta?: boolean}>}
   */
  async function getAllKVByCurator(clientId, options = {}) {
    if (!clientId) {
      return { data: [], error: 'No clientId provided' };
    }

    const since = options.since || null;
    const keys = Array.isArray(options.keys) ? options.keys.filter(Boolean) : null;

    try {
      if (keys && keys.length > 0) {
        const subsetResult = await rest('client_kv_store', {
          select: 'k,v,updated_at',
          filters: {
            'eq.client_id': clientId,
            'in.k': `(${keys.join(',')})`
          }
        });

        if (subsetResult.error) {
          return { data: [], error: subsetResult.error.message || subsetResult.error };
        }

        const subsetRows = Array.isArray(subsetResult.data) ? subsetResult.data : [];
        log(`getAllKVByCurator: Loaded ${subsetRows.length}/${keys.length} targeted keys for client ${clientId.slice(0, 8)}`);
        return { data: subsetRows, error: null, delta: false };
      }

      const curatorAuth = buildCuratorRequestHeaders({ 'Content-Type': 'application/json' });
      if (!curatorAuth.ok) {
        return { data: [], error: 'No curator token' };
      }

      let url = `${CONFIG.API_URL}/auth/clients/${encodeURIComponent(clientId)}/kv`;
      if (since) {
        url += `?since=${encodeURIComponent(since)}`;
      }

      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: curatorAuth.headers,
        credentials: 'include'
      });

      const result = await response.json();
      if (!response.ok) {
        return { data: [], error: result?.error || 'Curator KV fetch failed' };
      }

      const rows = Array.isArray(result?.data) ? result.data : [];
      log(`getAllKVByCurator: Loaded ${rows.length} keys${since ? ' (delta)' : ''} for client ${clientId.slice(0, 8)}`);
      return { data: rows, error: null, delta: !!since };
    } catch (e) {
      err('getAllKVByCurator failed:', e.message);
      return { data: [], error: e.message };
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

      // 🛡️ CRITICAL FIX (2026-05-17): curator path FIRST. Without this, stale
      // session token would load wrong-client data into curator's LS during
      // bootstrapClientSync. getAllKVByCurator uses REST with explicit client_id
      // + curator JWT — server validates ownership via clients.curator_id.
      const useCuratorPath = shouldUseCuratorAuthPath();
      if (useCuratorPath) {
        return getAllKVByCurator(clientId, options);
      }

      // Post PR-C cookie-only: если LS-токена нет и мы не PIN-cookie-сессия —
      // упадём к curator-REST fallback'у (download уже работает через него).
      // Если PIN cookie carrier — отправим RPC без p_session_token.
      const sessionRpc = buildSessionRpcParams({});
      if (!sessionRpc.ok) {
        return getAllKVByCurator(clientId, options);
      }

      const rpcParams = sessionRpc.params;
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
  async function batchSaveKVviaREST(curatorUserId, clientId, items, contextId = null) {
    log(`[v56] batchSaveKVviaREST: curator=${curatorUserId?.slice(0, 8)}, client=${clientId?.slice(0, 8)}, items=${items.length}`);

    if (!curatorUserId || !clientId || !items?.length) {
      return { success: false, saved: 0, error: 'Missing required params for REST save' };
    }

    try {
      // Формируем данные для REST upsert
      // Primary Key: (user_id, client_id, k)
      // 🛡️ Phase B2: каждая row несёт context_id (per-item _ctx или fallback на
      // top-level contextId). Server резолвит canonical client_id из context'а,
      // в Phase C — отвергает writes без context.
      const restData = items.map(item => ({
        user_id: curatorUserId,
        client_id: clientId,
        k: item.k,
        v: item.v,
        context_id: item._ctx || contextId || null,
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
      // 🛡️ Phase B (2026-06-02): REST POST identity_blocked array — server
      // вернул items которые он отверг (cross-client guard / content-dup /
      // data_loss_protection). Drop LS keys + trigger reload, иначе stale
      // данные остаются в LS и UI показывает их пока не reload вручную.
      try {
        if (Array.isArray(responseData?.identity_blocked) && responseData.identity_blocked.length > 0) {
          for (const ib of responseData.identity_blocked) {
            if (ib && typeof ib.k === 'string') {
              try {
                global.HEYS?.cloud?._dropRejectedKey?.(clientId, ib.k, ib.reason || 'rest_blocked');
              } catch (_) { /* noop */ }
            }
          }
        }
      } catch (_) { /* noop */ }
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
  async function batchSaveKV(clientId, items, contextId = null) {
    if (!items || items.length === 0) {
      return { success: true, saved: 0 };
    }

    // 🛡️ Phase B2: если top-level contextId не передан — пробуем извлечь из
    // первого items с _ctx (все items в batch обычно из одного React state,
    // share один context).
    if (!contextId) {
      const itemWithCtx = items.find(it => it && it._ctx);
      if (itemWithCtx) contextId = itemWithCtx._ctx;
    }

    try {
      // 🛡️ CRITICAL FIX (2026-05-17): curator JWT path MUST be checked BEFORE
      // session token path. Otherwise stale `heys_session_token` from a previous
      // PIN session takes over: server resolves session → wrong client_id →
      // save lands under wrong client. Same incident as mergeSaveKV — see that
      // comment for full context.
      const useCuratorPath = shouldUseCuratorAuthPath();
      if (useCuratorPath) {
        try {
          try {
            const guardedItems = items.filter(it => it && typeof it.k === 'string' &&
              /^heys_(?:profile|norms|game|hr_zones|dayv2_)/i.test(it.k));
            if (guardedItems.length > 0) {
              const stack = (new Error()).stack || '';
              const caller = stack.split('\n').slice(2, 5).map(s => s.trim().replace(/^at\s+/, '').slice(0, 70)).join(' ← ');
              global.HEYS?.__pt?.('RPC_BATCH_CURATOR', {
                targetCid: String(clientId).slice(0, 8),
                totalItems: items.length,
                guardedItems: guardedItems.map(it => ({
                  k: it.k.slice(0, 50),
                  fp: global.HEYS?.__ptFingerprint?.(it.v),
                })),
                caller,
              });
            }
          } catch (_) { /* noop */ }
          // 🛡️ Phase B2: strip _ctx from items (transport-only), pass top-level p_context_id.
          const cleanItems = items.map(({ _ctx: _stripped, ...rest }) => rest);
          const result = await rpc('batch_upsert_client_kv_by_curator', {
            p_client_id: clientId,
            p_items: cleanItems,
            p_context_id: contextId || null,
            // p_curator_id проставит RPC handler автоматически из JWT
          });

          if (!result.error) {
            const data = result.data;
            const success = data?.success !== false;
            // 🛡️ Layer 4 (incident 2026-06-02): сервер мог частично заблокировать
            // items через identity guards. data.identity_blocked содержит { k, reason }.
            // Для каждого — drop LS/queue, чтобы pollution не retry'илась бесконечно.
            try {
              if (Array.isArray(data?.identity_blocked) && data.identity_blocked.length > 0) {
                for (const ib of data.identity_blocked) {
                  if (ib && typeof ib.k === 'string') {
                    try { global.HEYS?.cloud?._dropRejectedKey?.(clientId, ib.k, ib.reason || 'identity_blocked'); } catch (_) { /* noop */ }
                  }
                }
              }
            } catch (_) { /* noop */ }
            // Если SQL вернул success:true — отдаём как есть
            if (success && !data?.error) {
              invalidateSwKvCache('batchSaveKV_curator_rpc');
              return {
                success: true,
                saved: data?.saved || 0,
              };
            }
            // Если SQL вернул success:false с ownership-ошибкой — это
            // конфигурационная ошибка, REST с тем же кураторским токеном
            // тоже не пройдёт. Возвращаем как есть.
            if (data?.error === 'curator_does_not_own_client') {
              err('[curator-rpc] ownership check failed for client', clientId?.slice(0, 8));
              return { success: false, saved: 0, error: data.error };
            }
            // Иные SQL-ошибки — fallback на REST
            log(`[curator-rpc] SQL returned non-success, falling back to REST: ${data?.error || 'unknown'}`);
          } else {
            // Сетевая/RPC ошибка — fallback на REST
            log(`[curator-rpc] RPC error, falling back to REST: ${result.error?.message || result.error}`);
          }
        } catch (rpcErr) {
          log(`[curator-rpc] exception, falling back to REST: ${rpcErr.message}`);
        }
      }

      // 🔐 Path 3: REST на heys-api-rest. Холодный путь для куратора,
      // используется если RPC недоступен но curator user_id есть.
      const curatorUserId = getCuratorUserId();
      if (curatorUserId) {
        log(`[v56] Falling back to REST path (curator=${curatorUserId?.slice(0, 8)})`);
        const restResult = await batchSaveKVviaREST(curatorUserId, clientId, items, contextId);
        if (restResult?.success) invalidateSwKvCache('batchSaveKV_curator_rest');
        return restResult;
      }

      // 🔐 Path 4: PIN auth client (no curator token at all). Session token
      // resolves to a single client_id server-side — safe because PIN sessions
      // are bound to one client. Post PR-C: токен может быть только в HttpOnly
      // cookie — buildSessionRpcParams отдаст RPC-параметры без
      // p_session_token, и heys-api-rpc заполнит из cookie.
      // 🛡️ Phase B2: session path тоже передаёт p_context_id. Хотя server
      // резолвит client_id из session_token/cookie, strict write-context gate
      // всё равно требует capability token, иначе legitimate PIN writes
      // попадают в context_missing_warn и блокируют future STRICT=1 flip.
      const sessionContextId = items.find((item) => item && item._ctx)?._ctx || contextId || null;
      const cleanItemsSession = items.map(({ _ctx: _stripped, ...rest }) => rest);
      const sessionRpc = buildSessionRpcParams({
        p_items: cleanItemsSession,
        p_context_id: sessionContextId,
      });
      if (sessionRpc.ok) {
        const result = await rpc('batch_upsert_client_kv_by_session', sessionRpc.params);
        if (result.error) {
          console.error('[YandexAPI] batchSaveKV RPC ERROR:', result.error);
          return { success: false, saved: 0, error: result.error.message || result.error };
        }
        const data = result.data;
        const success = data?.success !== false;
        // 🛡️ Layer 4 — то же что в curator path: drop rejected items.
        try {
          if (Array.isArray(data?.identity_blocked) && data.identity_blocked.length > 0) {
            for (const ib of data.identity_blocked) {
              if (ib && typeof ib.k === 'string') {
                try { global.HEYS?.cloud?._dropRejectedKey?.(clientId, ib.k, ib.reason || 'identity_blocked'); } catch (_) { /* noop */ }
              }
            }
          }
        } catch (_) { /* noop */ }
        if (success && !data?.error) invalidateSwKvCache('batchSaveKV_session_rpc');
        return {
          success,
          saved: data?.saved || 0,
          error: data?.error
        };
      }

      err('[v56] batchSaveKV: No auth token available (neither curator nor session)');
      return { success: false, saved: 0, error: 'No auth token available' };
    } catch (e) {
      err('batchSaveKV failed:', e.message);
      return { success: false, saved: 0, error: e.message };
    }
  }

  /**
   * 🔀 Server-side merge save для одного KV-ключа (dayv2/norms/profile).
   * Атомарно мержит incoming с текущей облачной версией внутри Postgres-транзакции
   * (FOR UPDATE), возвращает финальный merged blob. Клиент должен записать
   * возвращённое значение в LS чтобы local совпал с облаком.
   *
   * @param {string} clientId - target client UUID
   * @param {string} k - storage key (e.g. heys_dayv2_2026-05-17)
   * @param {object} v - value to merge into cloud
   * @param {number} lastSeenUpdatedAt - client's last-known cloud updatedAt (optimistic concurrency token)
   * @returns {Promise<{success: boolean, v?: object, outcome?: string, error?: string}>}
   */
  // ─── Curator Actions Feed (in-app banner) ──────────────────────────
  /**
   * Получить changelog действий куратора с момента последнего ack.
   * Session-only (PIN-клиент). Возвращает { ok, since, entries: [...] }.
   * Каждая entry: { id, curator_id, keys, actions: {actions:[...]}, created_at }.
   */
  async function getMyCuratorChangelogSince(p_since = null) {
    try {
      const sessionRpc = buildSessionRpcParams({ p_since });
      if (!sessionRpc.ok) return { ok: false, error: 'No session token', entries: [] };
      const result = await rpc('get_my_curator_changelog_since', sessionRpc.params);
      if (result.error) {
        return { ok: false, error: result.error.message || result.error, entries: [] };
      }
      let data = result.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const keys = Object.keys(data);
        if (keys.length === 1 && data[keys[0]] && typeof data[keys[0]] === 'object') {
          data = data[keys[0]];
        }
      }
      if (!data || data.ok === false) return { ok: false, error: data?.error || 'unknown', entries: [] };
      return { ok: true, since: data.since, entries: Array.isArray(data.entries) ? data.entries : [] };
    } catch (e) {
      return { ok: false, error: e.message, entries: [] };
    }
  }

  /**
   * Подтвердить просмотр curator-changes до момента p_until_ts (ISO).
   * Идемпотентно. Возвращает { ok, acked_until }.
   */
  async function ackCuratorChangelog(p_until_ts = null) {
    try {
      const sessionRpc = buildSessionRpcParams({
        p_until_ts: p_until_ts || new Date().toISOString(),
      });
      if (!sessionRpc.ok) return { ok: false, error: 'No session token' };
      const result = await rpc('ack_curator_changelog', sessionRpc.params);
      if (result.error) {
        return { ok: false, error: result.error.message || result.error };
      }
      let data = result.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const keys = Object.keys(data);
        if (keys.length === 1 && data[keys[0]] && typeof data[keys[0]] === 'object') {
          data = data[keys[0]];
        }
      }
      return data || { ok: false, error: 'no_response' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function mergeSaveKV(clientId, k, v, lastSeenUpdatedAt = 0, contextId = null) {
    if (!k || v == null) {
      return { success: false, error: 'invalid_params' };
    }
    // 🛡️ Cross-client blob guard tag (2026-06-01, wave 2: + norms/game/hr_zones).
    // Тегаем каждую запись per-client KV blob полем _writerCid = clientId, чтобы
    // сервер мог отвергать writes от чужого клиента. Mirror Class 4 fa851aad для
    // dayv2. Backward compat: server skip-ит guard если хотя бы одна сторона
    // без _writerCid (ramp-up по мере перезаписи).
    const _GUARDED_KEYS = ['heys_profile', 'heys_norms', 'heys_game', 'heys_hr_zones'];
    if (_GUARDED_KEYS.indexOf(k) !== -1 && v && typeof v === 'object' && !Array.isArray(v) && clientId) {
      try { v = Object.assign({}, v, { _writerCid: clientId }); } catch (_) { /* readonly object — skip */ }
    }
    try {
      if (_GUARDED_KEYS.indexOf(k) !== -1 || /^heys_dayv2_/i.test(k)) {
        const stack = (new Error()).stack || '';
        const caller = stack.split('\n').slice(2, 5).map(s => s.trim().replace(/^at\s+/, '').slice(0, 70)).join(' ← ');
        global.HEYS?.__pt?.('RPC_MERGE_SAVE', {
          targetCid: String(clientId).slice(0, 8),
          k: k.slice(0, 60),
          fp: global.HEYS?.__ptFingerprint?.(v),
          caller,
        });
      }
    } catch (_) { /* noop */ }
    try {
      // 🛡️ CRITICAL FIX (2026-05-17): curator JWT path MUST be checked BEFORE
      // session token path. Otherwise stale `heys_session_token` left in LS by
      // a previous PIN session (e.g. another client of the same curator) takes
      // over: server resolves session → wrong client_id → save lands under the
      // wrong client. Real incident: curator added meals to Александра, they
      // ended up in Poplanton's day because Poplanton's old PIN session token
      // was still in LS. Phase 4 made every dayv2 save go through this path,
      // which exposed the latent bug at high frequency.
      const useCuratorPath = shouldUseCuratorAuthPath();
      if (useCuratorPath) {
        const result = await rpc('merge_save_client_kv_by_curator', {
          p_client_id: clientId,
          p_key: k,
          p_value: v,
          p_last_seen_updated_at: lastSeenUpdatedAt,
          p_context_id: contextId || null, // 🛡️ Phase B2 write context
        });
        if (result.error) {
          err('[mergeSaveKV] curator RPC error:', result.error?.message || result.error);
          return { success: false, error: result.error.message || String(result.error) };
        }
        const data = result.data;
        if (data?.ok === false) {
          return { success: false, error: data.error || 'merge_failed' };
        }
        invalidateSwKvCache('mergeSaveKV_curator');
        // 🛡️ Layer 4 (incident 2026-06-02): сервер отверг через cross-client guard.
        // outcome содержит код rejection — удаляем local LS/queue, чтобы pollution
        // больше не пыталась push'нуться.
        if (data?.outcome && /^(cross_client_|invalid_profile_field)/i.test(data.outcome)) {
          try { global.HEYS?.cloud?._dropRejectedKey?.(clientId, k, data.outcome); } catch (_) { /* noop */ }
        }
        return { success: true, v: data?.v, outcome: data?.outcome };
      }

      // Fallback: PIN-auth client (no curator JWT). Session token resolves to
      // exactly one client_id on server side — safe because PIN sessions are
      // bound to a single client. Post PR-C cookie-only через
      // buildSessionRpcParams.
      const sessionRpc = buildSessionRpcParams({
        p_key: k,
        p_value: v,
        p_last_seen_updated_at: lastSeenUpdatedAt,
        p_context_id: contextId || null, // 🛡️ Phase B2 write context
      });
      if (sessionRpc.ok) {
        const result = await rpc('merge_save_client_kv_by_session', sessionRpc.params);
        if (result.error) {
          err('[mergeSaveKV] session RPC error:', result.error?.message || result.error);
          return { success: false, error: result.error.message || String(result.error) };
        }
        const data = result.data;
        if (data?.ok === false) {
          return { success: false, error: data.error || 'merge_failed' };
        }
        invalidateSwKvCache('mergeSaveKV_session');
        // 🛡️ Layer 4 — то же что в curator path выше.
        if (data?.outcome && /^(cross_client_|invalid_profile_field)/i.test(data.outcome)) {
          try { global.HEYS?.cloud?._dropRejectedKey?.(clientId, k, data.outcome); } catch (_) { /* noop */ }
        }
        return { success: true, v: data?.v, outcome: data?.outcome };
      }

      err('[mergeSaveKV] No auth token (neither curator nor session)');
      return { success: false, error: 'No auth token available' };
    } catch (e) {
      err('[mergeSaveKV] exception:', e.message);
      return { success: false, error: e.message };
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
      const curatorAuth = buildCuratorRequestHeaders({ 'Content-Type': 'application/json' });
      if (!curatorAuth.ok) {
        return { success: false, error: 'No curator token' };
      }

      const url = `${CONFIG.API_URL}/rest/client_kv_store?user_id=eq.${userId}&client_id=eq.${clientId}&k=eq.${encodeURIComponent(key)}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: curatorAuth.headers,
        credentials: 'include'
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
      // 🛡️ CRITICAL FIX (2026-05-17): curator REST path FIRST — это destructive
      // operation. Stale session token от прошлой PIN-сессии превратит delete
      // в silent data loss для другого клиента того же куратора. Same incident
      // pattern as mergeSaveKV — см. комментарий там.
      const curatorUserId = getCuratorUserId();
      if (curatorUserId && clientId) {
        log(`[deleteKV] curator REST path (curator=${curatorUserId?.slice(0, 8)} client=${clientId?.slice(0, 8)})`);
        const restResult = await deleteKVviaREST(curatorUserId, clientId, key);
        if (restResult?.success) invalidateSwKvCache('deleteKV_curator');
        return restResult;
      }

      // Fallback: PIN auth client (no curator token). Session resolves to a
      // single bound client_id — safe for PIN. Cookie-only after PR-C.
      const sessionRpc = buildSessionRpcParams({ p_key: key });
      if (sessionRpc.ok) {
        const result = await rpc('delete_client_kv_by_session', sessionRpc.params);
        if (result.error) {
          return { success: false, error: result.error.message || result.error };
        }
        const ok = result.data?.success !== false;
        if (ok) invalidateSwKvCache('deleteKV_session');
        return { success: ok };
      }

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
      const curatorAuth = buildCuratorRequestHeaders({ 'Content-Type': 'application/json' });
      if (!curatorAuth.ok) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const safeCuratorId = curatorId || 'self';
      log(`getClients: curatorId=${safeCuratorId}`);

      const url = `${CONFIG.API_URL}/auth/clients`;
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: curatorAuth.headers,
        credentials: 'include'
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

      const curatorAuth = buildCuratorRequestHeaders({ 'Content-Type': 'application/json' });
      if (!curatorAuth.ok) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const url = `${CONFIG.API_URL}/auth/clients`;
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: curatorAuth.headers,
        credentials: 'include',
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

      const curatorAuth = buildCuratorRequestHeaders({ 'Content-Type': 'application/json' });
      if (!curatorAuth.ok) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const url = `${CONFIG.API_URL}/auth/clients/${clientId}`;
      const response = await fetchWithRetry(url, {
        method: 'PATCH',
        headers: curatorAuth.headers,
        credentials: 'include',
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

      const curatorAuth = buildCuratorRequestHeaders({ 'Content-Type': 'application/json' });
      if (!curatorAuth.ok) {
        return { data: null, error: { message: 'Curator not authenticated' } };
      }

      const url = `${CONFIG.API_URL}/auth/clients/${clientId}`;
      const response = await fetchWithRetry(url, {
        method: 'DELETE',
        headers: curatorAuth.headers,
        credentials: 'include'
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
      const hasCookieSession = !!global?.HEYS?.cloud?.isPinAuthClient?.() ||
        shouldTryCookieSessionRequest();
      if (!token && !hasCookieSession) {
        return { data: null, error: { message: 'No session token' } };
      }

      log(`checkSubscriptionStatus: using session-based RPC`);

      const rpcParams = {};
      if (token) rpcParams.p_session_token = token;
      const result = await rpc('get_subscription_status_by_session', rpcParams);

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

      const sessionRpc = buildSessionRpcParams({
        p_consents: JSON.stringify(consents),
        p_ip: null,
        p_user_agent: userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : null)
      });
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };

      const result = await rpc('log_consents_by_session', sessionRpc.params);

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

  // 152-ФЗ ст. 21 — отзыв согласия на специальную категорию (здоровье).
  // Сначала отзывается consent (revoke_consent), затем фактически удаляются
  // health-данные из KV. Обе RPC SECURITY DEFINER.
  async function purgeHealthData(clientId) {
    try {
      log(`purgeHealthData: clientId=${clientId}`);
      return await rpc('purge_health_data', { p_client_id: clientId });
    } catch (e) {
      err('purgeHealthData failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  // 152-ФЗ ст. 21 — полное удаление аккаунта по требованию субъекта.
  // Принимает session_token, проверяет внутри функции, удаляет cascade.
  async function deleteMyAccount(sessionToken) {
    try {
      log('deleteMyAccount');
      const sessionRpc = sessionToken
        ? { ok: true, params: { p_session_token: sessionToken } }
        : buildSessionRpcParams();
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('delete_my_account', sessionRpc.params);
    } catch (e) {
      err('deleteMyAccount failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🆕 COMPLIANCE OVERHAUL 2026-05-20 — version-aware consents, DSAR,
  // proof-of-consent, age gate, restriction, revoke curator
  // ═══════════════════════════════════════════════════════════════════

  /**
   * 🔐 Session-safe v2: version-aware проверка согласий.
   * Передаём ожидаемые версии — сервер сравнивает с подписанными,
   * запускает grace 7д или блокирует если истёк.
   * @param {object} expectedVersions - например HEYS.LegalVersions
   * @returns {Promise<{data: {valid, missing, outdated, grace_status, must_block}, error}>}
   */
  async function checkRequiredConsentsBySession(expectedVersions) {
    try {
      const sessionRpc = buildSessionRpcParams({
        p_expected_versions: JSON.stringify(expectedVersions || {})
      });
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };

      return await rpc('check_required_consents_by_session', sessionRpc.params);
    } catch (e) {
      err('checkRequiredConsentsBySession failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * 🔐 Список своих согласий для UI "Мои согласия и данные".
   */
  async function getMyConsentsBySession() {
    try {
      const sessionRpc = buildSessionRpcParams();
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('get_my_consents_by_session', sessionRpc.params);
    } catch (e) {
      err('getMyConsentsBySession failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * 🔐 Доказательство подписи конкретного типа consent (для скачивания).
   * @param {string} consentType - 'user_agreement','personal_data','health_data','marketing','payment_oferta','push_notifications','curator_access'
   */
  async function getConsentProofBySession(consentType) {
    try {
      const sessionRpc = buildSessionRpcParams({ p_consent_type: consentType });
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('get_consent_proof_by_session', sessionRpc.params);
    } catch (e) {
      err('getConsentProofBySession failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * 🔐 DSAR — выгрузка всех данных клиента (152-ФЗ ст.14 / GDPR Art.15).
   */
  async function exportMyDataBySession() {
    try {
      const sessionRpc = buildSessionRpcParams();
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('export_my_data_by_session', sessionRpc.params);
    } catch (e) {
      err('exportMyDataBySession failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * 🔐 18+ gate. Передаём год рождения; сервер валидирует >= 18 лет.
   */
  async function confirmAgeBySession(birthYear) {
    try {
      const sessionRpc = buildSessionRpcParams({ p_birth_year: birthYear });
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('confirm_age_by_session', sessionRpc.params);
    } catch (e) {
      err('confirmAgeBySession failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * 🔐 Право на ограничение обработки (152-ФЗ ст.21.3 / GDPR Art.18).
   * Когда active=true — KV writes блокируются триггером.
   */
  async function requestRestrictionBySession(active) {
    try {
      const sessionRpc = buildSessionRpcParams({ p_active: !!active });
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('request_restriction_by_session', sessionRpc.params);
    } catch (e) {
      err('requestRestrictionBySession failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * 🔐 Право на возражение: убрать куратора без удаления аккаунта.
   */
  async function revokeCuratorAccessBySession() {
    try {
      const sessionRpc = buildSessionRpcParams();
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('revoke_curator_access_by_session', sessionRpc.params);
    } catch (e) {
      err('revokeCuratorAccessBySession failed:', e.message);
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * 🔐 Session-safe отзыв одного согласия. Для health_data/personal_data
   * сервер дополнительно kill всех активных сессий клиента.
   */
  async function revokeConsentBySession(consentType) {
    try {
      const sessionRpc = buildSessionRpcParams({ p_consent_type: consentType });
      if (!sessionRpc.ok) return { data: null, error: { message: 'No session token' } };
      return await rpc('revoke_consent_by_session', sessionRpc.params);
    } catch (e) {
      err('revokeConsentBySession failed:', e.message);
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
      const sessionRpc = buildSessionRpcParams({
        p_name: product.name,
        p_product_data: product
      });
      if (!sessionRpc.ok) {
        return { data: null, error: { message: 'No session token' } };
      }

      const result = await rpc('create_pending_product_by_session', sessionRpc.params);

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

      const sessionToken = getSessionTokenForKV();
      const shouldTryCookieSession = shouldTryCookieSessionRequest();
      if (!sessionToken && !shouldTryCookieSession) {
        const msg = 'Нет активной сессии клиента. Войдите по PIN, чтобы оформить подписку.';
        err('createPayment: no session token');
        return { data: null, error: { message: msg, code: 'NO_SESSION' } };
      }

      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

      const response = await fetch(`${CONFIG.API_URL}/payments/create`, {
        method: 'POST',
        headers,
        credentials: 'include',
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
      _lastErrorAt = Date.now();
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * Получить статус платежа
   * @param {string} paymentId - ID платежа ЮKassa
   * @param {string} clientId - ID клиента (для безопасности)
   * @returns {Promise<{data: {status, paid, amount}, error: any}>}
   */
  /**
   * Logout клиента (отзыв PIN-сессии). После вызова токен невалиден.
   * Локальный heys_session_token также удаляется. (P0.15)
   * @returns {Promise<{ok: boolean, error?: any}>}
   */
  async function clientLogout() {
    const clearLocalClientAuth = () => {
      try { localStorage.removeItem('heys_session_token'); } catch {}
      try { localStorage.removeItem('heys_pin_auth_client'); } catch {}
      try { localStorage.removeItem('heys_client_current'); } catch {}
      try { localStorage.removeItem('heys_last_client_id'); } catch {}
      setCookieSessionHint('pin', false);
    };

    try {
      const sessionToken = getSessionTokenForKV();
      const host = global.location?.hostname || '';
      let shouldTryCookieLogout = !!host && host !== 'localhost' && host !== '127.0.0.1';
      shouldTryCookieLogout = shouldTryCookieLogout ||
        hasCookieSessionHint('pin') ||
        !!global?.HEYS?.cloud?.isPinAuthClient?.();

      if (!sessionToken && !shouldTryCookieLogout) {
        // Нечего отзывать
        clearLocalClientAuth();
        return { ok: true };
      }

      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

      const response = await fetch(`${CONFIG.API_URL}/auth/client-logout`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(sessionToken ? { session_token: sessionToken } : {}),
      });

      // Удаляем локальный токен независимо от результата сервера —
      // если сервер не ответил, на клиенте всё равно logout.
      clearLocalClientAuth();

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { ok: false, error: data };
      }

      return { ok: true };
    } catch (e) {
      err('clientLogout failed:', e.message);
      clearLocalClientAuth();
      return { ok: false, error: { message: e.message } };
    }
  }

  async function curatorLogout() {
    const clearLocalCuratorAuth = () => {
      try { localStorage.removeItem('heys_curator_session'); } catch {}
      try { localStorage.removeItem('heys_supabase_auth_token'); } catch {}
      setCookieSessionHint('curator', false);
    };

    try {
      const response = await fetch(`${CONFIG.API_URL}/auth/curator-logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      });

      clearLocalCuratorAuth();

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return { ok: false, error: data };
      }

      return { ok: true };
    } catch (e) {
      err('curatorLogout failed:', e.message);
      clearLocalCuratorAuth();
      return { ok: false, error: { message: e.message } };
    }
  }

  /**
   * Инициировать refund платежа куратором.
   * @param {string} paymentId — UUID платежа в нашей БД (payments.id)
   * @param {number} [amount] — частичная сумма (по умолчанию полная)
   * @returns {Promise<{data: {refundId, status}, error: any}>}
   */
  async function refundPayment(paymentId, amount) {
    try {
      log(`refundPayment: paymentId=${paymentId}, amount=${amount || 'full'}`);

      const curatorAuth = buildCuratorRequestHeaders({ 'Content-Type': 'application/json' });
      if (!curatorAuth.ok) {
        const msg = 'Нет токена куратора. Войдите заново.';
        err('refundPayment: no curator token');
        return { data: null, error: { message: msg, code: 'NO_TOKEN' } };
      }

      const response = await fetch(`${CONFIG.API_URL}/payments/refund`, {
        method: 'POST',
        headers: curatorAuth.headers,
        credentials: 'include',
        body: JSON.stringify({ paymentId, amount }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      log(`refundPayment success:`, data);
      return { data, error: null };
    } catch (e) {
      err('refundPayment failed:', e.message);
      _lastError = e.message;
      _lastErrorAt = Date.now();
      return { data: null, error: { message: e.message } };
    }
  }

  async function getPaymentStatus(paymentId, clientId) {
    try {
      log(`getPaymentStatus: paymentId=${paymentId}`);

      const sessionToken = getSessionTokenForKV();
      const shouldTryCookieSession = shouldTryCookieSessionRequest();
      if (!sessionToken && !shouldTryCookieSession) {
        const msg = 'Нет активной сессии клиента.';
        err('getPaymentStatus: no session token');
        return { data: null, error: { message: msg, code: 'NO_SESSION' } };
      }

      const headers = {
        'Content-Type': 'application/json',
      };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;

      const response = await fetch(
        `${CONFIG.API_URL}/payments/status?paymentId=${encodeURIComponent(paymentId)}&clientId=${encodeURIComponent(clientId)}`,
        {
          method: 'GET',
          headers,
          credentials: 'include',
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
      _lastErrorAt = Date.now();
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
    getCuratorToken,  // exposed для гейта в curator-only фичах (см. heys_curator_actions_banner_v1.js)
    setCookieSessionHint,
    hasCookieSessionHint,

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
    refundPayment,
    clientLogout,
    curatorLogout,

    // �📝 Consents
    logConsents,
    logConsentsBySession,
    checkRequiredConsents,
    checkRequiredConsentsBySession,
    revokeConsent,
    revokeConsentBySession,
    purgeHealthData,
    deleteMyAccount,
    // 🆕 Compliance overhaul 2026-05-20
    getMyConsentsBySession,
    getConsentProofBySession,
    exportMyDataBySession,
    confirmAgeBySession,
    requestRestrictionBySession,
    revokeCuratorAccessBySession,

    // 🏭 Products
    getSharedProducts,
    createPendingProduct,

    // KV Store (REST-based для надёжности)
    saveKV,
    getKV,
    getKVBatch,
    getCurrentClientBySession,
    getChangeMarkers,
    getChangeMarkersByCurator,
    getKVBatchByCurator,
    getAllKV,
    getAllKVByCurator,
    batchSaveKV,
    mergeSaveKV,
    deleteKV,

    // 📝 Curator Actions Feed
    getMyCuratorChangelogSince,
    ackCuratorChangelog,

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
    rest,

    // 🔍 Debug snapshot (sync badge)
    _debug: () => ({
      isOnline: _isOnline,
      lastError: _lastError != null ? String(_lastError.message || _lastError).slice(0, 200) : null,
      lastErrorAt: _lastErrorAt || 0
    })
  };

  // Экспорт
  HEYS.YandexAPI = YandexAPI;

  // Для отладки в консоли
  if (typeof window !== 'undefined') {
    window.YandexAPI = YandexAPI;
  }

  log(`✅ YandexAPI module loaded (${CONFIG.API_URL})`);

})(typeof window !== 'undefined' ? window : global);
