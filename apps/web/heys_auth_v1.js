// heys_auth_v1.js — Phone+PIN auth helpers (client) + curator create/reset PIN
(function (global) {
  const HEYS = (global.HEYS = global.HEYS || {});

  const U = HEYS.utils || {
    lsGet: (k, d) => {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (_) {
        return d;
      }
    },
    lsSet: (k, v) => {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (_) { }
    },
  };

  const AUTH_RATE_KEY = 'heys_auth_rate_limit_v1';
  const PIN_COOKIE_SESSION_HINT_KEY = 'heys_pin_cookie_session_hint';
  const CURATOR_COOKIE_SESSION_HINT_KEY = 'heys_curator_cookie_session_hint';

  function setCookieSessionHint(kind, active) {
    const key = kind === 'curator' ? CURATOR_COOKIE_SESSION_HINT_KEY : PIN_COOKIE_SESSION_HINT_KEY;
    try {
      if (active) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch (_) { }
  }

  function hasCookieSessionHint(kind) {
    const key = kind === 'curator' ? CURATOR_COOKIE_SESSION_HINT_KEY : PIN_COOKIE_SESSION_HINT_KEY;
    try {
      return !!localStorage.getItem(key);
    } catch (_) {
      return false;
    }
  }

  function nowMs() {
    return Date.now();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function normalizePhone(raw) {
    const s = String(raw || '').trim();
    const digits = s.replace(/\D/g, '');

    // RU-focused normalization:
    // - 8XXXXXXXXXX -> 7XXXXXXXXXX
    // - +7XXXXXXXXXX -> 7XXXXXXXXXX
    // - XXXXXXXXXX (10 digits) -> 7XXXXXXXXXX
    if (digits.length === 11 && digits[0] === '8') return '7' + digits.slice(1);
    if (digits.length === 11 && digits[0] === '7') return digits;
    if (digits.length === 10) return '7' + digits;

    return digits; // fallback (will fail validation)
  }

  function isValidPhone(raw) {
    const p = normalizePhone(raw);
    return /^7\d{10}$/.test(p);
  }

  function formatPhone(raw) {
    const p = normalizePhone(raw);
    if (!/^7\d{10}$/.test(p)) return raw || '';
    const d = p.slice(1);
    return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
  }

  // Список явно слабых PIN. Не претендуем на полную защиту от подбора —
  // отсекаем самые очевидные паттерны, которые куратор может случайно
  // выдать или клиент запросить. Все 10 идентичных + восходящие/нисходящие
  // последовательности + распространённые keypad-паттерны.
  const WEAK_PINS = new Set([
    // 10 одинаковых
    '0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
    // Восходящие последовательности
    '0123','1234','2345','3456','4567','5678','6789',
    // Нисходящие последовательности
    '9876','8765','7654','6543','5432','4321','3210',
    // Распространённые keypad-паттерны
    '2580','0852','1379','9731','1397','7913',
  ]);

  function isWeakPin(pin) {
    return WEAK_PINS.has(String(pin || ''));
  }

  // Только формат (4 цифры). Используется в login flow — клиенту с уже
  // выданным «слабым» PIN мы не отказываем во входе, чтобы не выкинуть
  // существующих пользователей при бампе правил.
  function validatePin(pin) {
    const s = String(pin || '');
    return /^\d{4}$/.test(s);
  }

  // Формат + блок-лист слабых PIN. Используется ТОЛЬКО при создании или
  // смене PIN (createClientWithPin / resetClientPin / PinChangeCard).
  function validatePinStrict(pin) {
    const s = String(pin || '');
    if (!/^\d{4}$/.test(s)) return false;
    if (isWeakPin(s)) return false;
    return true;
  }

  function randomHex(bytes) {
    try {
      const arr = new Uint8Array(bytes);
      crypto.getRandomValues(arr);
      return Array.from(arr)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (_) {
      // слабый fallback (крайний случай)
      let out = '';
      for (let i = 0; i < bytes * 2; i++) out += Math.floor(Math.random() * 16).toString(16);
      return out;
    }
  }

  function generateSalt() {
    return randomHex(16);
  }

  async function sha256Hex(str) {
    const data = new TextEncoder().encode(String(str));
    if (global.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', data);
        const hex = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        if (hex && hex.length === 64) {
          return hex;
        }
      } catch (_) {
        // fallback below
      }
    }

    // Детерминированный fallback для нестабильных test/runtime-окружений.
    // Не используется, если штатный WebCrypto работает корректно.
    let seed = 0x9e3779b1 >>> 0;
    const parts = [];
    for (let block = 0; block < 8; block++) {
      let h = (seed ^ ((block + 1) * 0x85ebca6b)) >>> 0;
      for (let i = 0; i < data.length; i++) {
        h ^= data[i] + ((h << 6) >>> 0) + (h >>> 2);
        h >>>= 0;
      }
      parts.push(h.toString(16).padStart(8, '0'));
      seed = (seed * 1664525 + 1013904223) >>> 0;
    }
    return parts.join('');
  }

  async function hashPin(pin, salt) {
    // Простая схема: sha256(pin + ':' + salt)
    // (Сервер хранит и salt, и hash)
    const p = String(pin || '');
    const s = String(salt || '');
    return sha256Hex(`${p}:${s}`);
  }

  function getRateState() {
    return U.lsGet(AUTH_RATE_KEY, {
      byKey: {},
    });
  }

  function setRateState(st) {
    U.lsSet(AUTH_RATE_KEY, st);
  }

  function getAttemptKey(kind, phoneNormalized) {
    return `${kind}:${phoneNormalized || ''}`;
  }

  function canAttempt(kind, phoneNormalized) {
    const st = getRateState();
    const key = getAttemptKey(kind, phoneNormalized);
    const rec = st.byKey[key] || { count: 0, resetAt: 0, lockedUntil: 0 };
    const t = nowMs();

    if (rec.lockedUntil && t < rec.lockedUntil) {
      return {
        ok: false,
        retryAfterMs: rec.lockedUntil - t,
      };
    }

    // окно 10 минут
    const WINDOW = 10 * 60 * 1000;
    const MAX = 10;

    if (!rec.resetAt || t > rec.resetAt) {
      rec.count = 0;
      rec.resetAt = t + WINDOW;
    }

    if (rec.count >= MAX) {
      // локальный lock 10 минут
      rec.lockedUntil = t + WINDOW;
      st.byKey[key] = rec;
      setRateState(st);
      return { ok: false, retryAfterMs: WINDOW };
    }

    return { ok: true };
  }

  function registerFail(kind, phoneNormalized) {
    const st = getRateState();
    const key = getAttemptKey(kind, phoneNormalized);
    const t = nowMs();
    const rec = st.byKey[key] || { count: 0, resetAt: 0, lockedUntil: 0 };

    const WINDOW = 10 * 60 * 1000;
    if (!rec.resetAt || t > rec.resetAt) {
      rec.count = 0;
      rec.resetAt = t + WINDOW;
    }
    rec.count += 1;
    if (rec.count >= 10) rec.lockedUntil = t + WINDOW;

    st.byKey[key] = rec;
    setRateState(st);
  }

  async function loginClient({ phone, pin }) {
    // 🔧 FIX: Очищаем curator токен ПЕРЕД PIN-авторизацией
    // Если остался старый heys_supabase_auth_token от куратора,
    // switchClient ошибочно определит hasCuratorSession=true и очистит _pinAuthClientId
    // Это ломало синхронизацию для PIN-клиентов (данные не загружались в облако).
    // Также очищаем heys_curator_session — иначе isCuratorSession() даёт
    // false-positive PIN-клиенту (стейл-токен от прошлого куратор-логина),
    // что отправляет flow публикации продукта в неправильную ветку.
    try {
      localStorage.removeItem('heys_supabase_auth_token');
      localStorage.removeItem('heys_curator_session');
      setCookieSessionHint('curator', false);
    } catch (_) { }

    const phoneNorm = normalizePhone(phone);

    if (!isValidPhone(phoneNorm)) {
      return { ok: false, error: 'invalid_phone' };
    }
    if (!validatePin(pin)) {
      return { ok: false, error: 'invalid_pin' };
    }

    const rate = canAttempt('login', phoneNorm);
    if (!rate.ok) {
      return { ok: false, error: 'rate_limited', retryAfterMs: rate.retryAfterMs };
    }

    // fake delay to reduce timing attacks
    await sleep(350 + Math.floor(Math.random() * 250));

    // Используем YandexAPI вместо Supabase
    const api = HEYS.YandexAPI;
    if (!api) {
      return { ok: false, error: 'api_not_ready', _debug: { stage: 'init' } };
    }
    if (typeof api.curatorLogout !== 'function' || typeof api.clientLogout !== 'function') {
      return {
        ok: false,
        error: 'api_not_ready',
        _debug: { stage: 'role_switch_cleanup_api' },
      };
    }

    try {
      // v3: одношаговая авторизация (сервер сам хеширует PIN)
      const vRes = await api.rpc('verify_client_pin_v3', {
        p_phone: phoneNorm,
        p_pin: pin,
      });

      if (vRes.error) {
        registerFail('login', phoneNorm);
        return {
          ok: false,
          error: vRes.error.message === 'rate_limited' ? 'rate_limited' : 'invalid_credentials',
          _debug: {
            stage: 'verify_pin',
            rpc: 'verify_client_pin_v3',
            code: vRes.error.code,
            message: vRes.error.message,
          },
        };
      }

      // YandexAPI возвращает { verify_client_pin_v3: { success, client_id, ... } }
      const rawData = vRes.data;
      const vRow = rawData?.verify_client_pin_v3 || (Array.isArray(rawData) ? rawData[0] : rawData);

      // v3 возвращает { success, client_id, session_token, error }
      if (!vRow?.success) {
        registerFail('login', phoneNorm);
        return {
          ok: false,
          error: vRow?.error === 'rate_limited' ? 'rate_limited' : 'invalid_credentials',
          _debug: {
            stage: 'verify_pin',
            rpc: 'verify_client_pin_v3',
            serverError: vRow?.error,
          },
        };
      }

      const clientId = vRow.client_id;
      const sessionToken = vRow.session_token;
      const clientName = vRow.name || vRow.client_name || ''; // Имя введённое куратором при создании

      if (!clientId || !sessionToken) {
        registerFail('login', phoneNorm);
        return {
          ok: false,
          error: 'invalid_credentials',
          _debug: {
            stage: 'verify_pin',
            rpc: 'verify_client_pin_v3',
            hasClientId: !!clientId,
            hasSessionToken: !!sessionToken,
          },
        };
      }

      // HttpOnly curator cookie cannot be removed through localStorage. After
      // a successful PIN login clear it server-side, otherwise a stale curator
      // cookie can coexist with the new client session.
      try {
        const cleanup = await api.curatorLogout?.();
        if (cleanup && cleanup.ok === false) {
          throw new Error(cleanup.error?.message || cleanup.error?.error || 'role_switch_cleanup_failed');
        }
      } catch (cleanupErr) {
        try { await api.clientLogout?.(); } catch (_) { /* rollback best-effort */ }
        return {
          ok: false,
          error: 'role_switch_cleanup_failed',
          _debug: {
            stage: 'clear_curator_cookie',
            message: cleanupErr?.message || String(cleanupErr || ''),
          },
        };
      }

      // 🔐 Сохраняем session_token для безопасных RPC вызовов
      setSessionToken(sessionToken);

      // 🔐 Сохраняем PIN-клиента заранее (на случай сбоя switchClient)
      try {
        localStorage.setItem('heys_pin_auth_client', clientId);
        setCookieSessionHint('pin', true);
      } catch (_) { }

      // 💡 Сохраняем имя клиента для предзаполнения профиля
      // ⚠️ v1.15 FIX: Используем localStorage.setItem напрямую (без namespace),
      // т.к. heys_profile_step_v1.js читает через localStorage.getItem('heys_pending_client_name')
      if (clientName) {
        localStorage.setItem('heys_pending_client_name', JSON.stringify(clientName));
      }

      // 📡 Notify components about auth state change (for curator status refresh)
      window.dispatchEvent(new Event('heys:auth-changed'));

      console.info(`[HEYS.auth] 🔐 Вход выполнен: ${clientId.slice(0, 8)}***`);

      return { ok: true, clientId, sessionToken, clientName };
    } catch (e) {
      registerFail('login', phoneNorm);
      return {
        ok: false,
        error: 'exception',
        message: e?.message || String(e),
        _debug: { stage: 'exception' },
      };
    }
  }

  async function createClientWithPin({ name, phone, pin }) {
    const phoneNorm = normalizePhone(phone);

    if (!isValidPhone(phoneNorm)) {
      return { ok: false, error: 'invalid_phone' };
    }
    if (!validatePinStrict(pin)) {
      return { ok: false, error: 'invalid_pin' };
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      return { ok: false, error: 'api_not_ready' };
    }

    const salt = generateSalt();
    const pinHash = await hashPin(pin, salt);

    const res = await api.rpc('create_client_with_pin', {
      p_name: String(name || '').trim(),
      p_phone: phoneNorm,
      p_pin_salt: salt,
      p_pin_hash: pinHash,
    });

    if (res.error) {
      return { ok: false, error: 'server_error', message: res.error.message };
    }

    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    const clientId = row && (row.client_id || row.id);
    const pinToken = row && (row.pin_token || row.pinToken);
    const botUsername = HEYS.config?.clientBotUsername || 'heyslab_bot';
    const deepLink = pinToken ? `https://t.me/${botUsername}?start=${pinToken}` : null;

    // 🔔 Уведомляем компоненты о создании клиента (для RationTab и др.)
    window.dispatchEvent(new Event('heys:auth-changed'));

    return {
      ok: true,
      client: res.data,
      clientId,
      phone: phoneNorm,
      pin,
      pinToken,
      deepLink,
    };
  }

  async function resetClientPin({ clientId, newPin }) {
    if (!clientId) return { ok: false, error: 'missing_client_id' };
    if (!validatePinStrict(newPin)) return { ok: false, error: 'invalid_pin' };

    const api = HEYS.YandexAPI;
    if (!api) {
      return { ok: false, error: 'api_not_ready' };
    }

    // Phase 1 hotfix: используем admin_set_client_pin (bcrypt в БД через crypt()),
    // совместимо с verify_client_pin_v3. Старая reset_client_pin писала SHA256 —
    // клиент не мог войти после смены PIN.
    const res = await api.rpc('admin_set_client_pin', {
      p_client_id: clientId,
      p_pin: newPin,
    });

    if (res.error) {
      return { ok: false, error: 'server_error', message: res.error.message };
    }

    const fnData = res.data?.admin_set_client_pin || res.data || res;
    if (fnData && fnData.success === false) {
      return { ok: false, error: fnData.error, message: fnData.error };
    }

    return { ok: true };
  }

  /**
   * Проверить, является ли сессия кураторской
   * Источник правды: heys_curator_session (JWT), fallback: legacy supabase token,
   * дополнительный fallback: HEYS.cloud.getUser()
   */
  function isCuratorSession() {
    try {
      const curatorSession = localStorage.getItem('heys_curator_session');
      if (curatorSession && curatorSession.length > 10) return true;
      const legacy = localStorage.getItem('heys_supabase_auth_token');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed?.access_token) return true;
      }
    } catch (_) { }
    try {
      return !!HEYS.cloud?.getUser?.();
    } catch (_) {
      return false;
    }
  }

  // === Session Token Management ===

  /**
   * Получить текущий session_token.
   *
   * PR-C (2026-05-20): после перехода на HttpOnly cookie токен в JS не
   * доступен. Функция возвращает то, что осталось в localStorage от
   * сессий, выданных ДО этого деплоя (legacy), и `null` для всех
   * новых сессий — тогда heys-api-rpc сам подставит токен из cookie
   * на сервере. Legacy LS-токены естественно истекут через 30 дней.
   */
  function getSessionToken() {
    return U.lsGet('heys_session_token', null);
  }

  /**
   * Установить session token.
   *
   * PR-C (2026-05-20): после успешного PIN-входа сервер (verify_client_pin_v3
   * через heys-api-rpc) ставит токен в HttpOnly cookie `heys_session_token`
   * (Domain=.heyslab.ru). JS читать не может — это и был параллельный JS-
   * доступ, который ловила XSS.
   *
   * Dev-fix (2026-05-21): cookie с `Domain=.heyslab.ru` НЕ доставляется на
   * `localhost:4001` (domain mismatch). Без LS-fallback всё что зовёт
   * `getSessionToken()` падает с "No session token" в dev (Subscriptions,
   * Consents.checkRequiredVersioned, curator-actions banner). В production
   * (app.heyslab.ru) — по-прежнему no-op, security не ослаблена.
   *
   * @param {string} token - Session token (в prod — игнорируется)
   */
  function setSessionToken(token) {
    if (!token) return;
    try {
      const host = typeof window !== 'undefined' && window.location
        ? window.location.hostname : '';
      const isDev = host === 'localhost' || host === '127.0.0.1';
      if (isDev) {
        U.lsSet('heys_session_token', token);
      }
      // production: no-op (credential carriage = HttpOnly cookie)
    } catch (_) { /* noop */ }
  }

  /**
   * Очистить session token локально (без revoke на сервере)
   */
  function clearSessionToken() {
    try {
      localStorage.removeItem('heys_session_token');
    } catch (_) { }
  }

  /**
   * Проверить, есть ли активная сессия
   */
  function hasSession() {
    return !!getSessionToken();
  }

  /**
   * Logout — отозвать сессию на сервере и очистить локально
   */
  async function logout() {
    const token = getSessionToken();
    let shouldTryCookieLogout = false;
    try {
      const host = global.location?.hostname || '';
      shouldTryCookieLogout = !!host && host !== 'localhost' && host !== '127.0.0.1';
      shouldTryCookieLogout = shouldTryCookieLogout || hasCookieSessionHint('pin');
    } catch (_) { /* noop */ }

    const api = HEYS.YandexAPI;
    if (api && (token || shouldTryCookieLogout)) {
      try {
        await api.rpc('revoke_session', token ? { p_session_token: token } : {});
      } catch (e) {
        // Revoke failed - continue with local cleanup
      }
    }

    // Очищаем локально. Важно убрать и marker PIN-режима: session-expired
    // handler вызывает именно этот logout, без полного cloudSignOut.
    try {
      localStorage.removeItem('heys_session_token');
      localStorage.removeItem('heys_pin_auth_client');
      localStorage.removeItem('heys_client_current');
      setCookieSessionHint('pin', false);
    } catch (_) { }

    console.info('[HEYS.auth] 🚪 Выход из системы');

    // 📡 Notify components about auth state change
    window.dispatchEvent(new Event('heys:auth-changed'));

    return { ok: true };
  }

  HEYS.auth = {
    normalizePhone,
    isValidPhone,
    formatPhone,
    validatePin,
    validatePinStrict,
    isWeakPin,
    generateSalt,
    hashPin,
    loginClient,
    createClientWithPin,
    resetClientPin,
    isCuratorSession,
    // 🔐 Session management
    getSessionToken,
    setSessionToken,
    clearSessionToken,
    hasSession,
    logout,
  };
})(typeof window !== 'undefined' ? window : globalThis);
