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

  // Единый словарь серверных кодов отказа на входе клиента — он же контракт с
  // SQL. `verify_client_pin_v3` не имеет права вернуть код, которого здесь нет:
  // это сверяет тест `__tests__/login-error-codes-contract.test.js`, поэтому
  // новый код на сервере без осознанной трактовки на клиенте роняет сборку.
  // До 2026-08-11 сверки не было — из-за этого `pin_rate_limited` (блокировка
  // по номеру) молча читался клиентом как «PIN не подошёл».
  //
  // kind:
  //   'wrong_pin'  — единственный случай, когда экран говорит «PIN не подошёл»
  //                  и когда попытка идёт в локальный счётчик неудач;
  //   'rate_limit' — попытки исчерпаны, вход временно закрыт;
  //   'explained'  — другая причина: код доезжает до экрана как есть, у экрана
  //                  есть своя формулировка на случай, если сервер не прислал
  //                  `message`.
  const LOGIN_SERVER_ERRORS = {
    // Нейтральная формулировка на экране: номер может не существовать в базе.
    invalid_credentials: { kind: 'explained' },
    invalid_pin: { kind: 'wrong_pin' },
    wrong_pin: { kind: 'wrong_pin' },
    rate_limited: { kind: 'rate_limit' },
    // database/2026-08-11_pin_lockout_by_phone.sql — блокировка по номеру.
    pin_rate_limited: { kind: 'rate_limit' },
    // Заглушка боевой БД с 2026-08-11 (вход по PIN временно закрыт против
    // перебора). Миграции в репозитории нет — код известен только отсюда.
    pin_login_disabled: { kind: 'explained' },
    access_code_login_required: { kind: 'explained' },
    access_code_required: { kind: 'explained' },
    invalid_access_code: { kind: 'wrong_pin' },
    access_code_rate_limited: { kind: 'rate_limit' },
    weak_access_code: { kind: 'explained' },
    access_code_matches_onetime_pin: { kind: 'explained' },
    invalid_device_id: { kind: 'explained' },
  };

  // Приводит серверный отказ к коду для экрана. Незнакомый код НЕ схлопывается
  // в invalid_credentials, а уезжает наверх как есть вместе с серверным
  // текстом: экран покажет настоящую причину, а не «PIN не подошёл».
  function classifyServerLoginError(rawError, rawMessage) {
    const serverError = typeof rawError === 'string' ? rawError.trim() : '';
    const serverMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    const known = Object.prototype.hasOwnProperty.call(LOGIN_SERVER_ERRORS, serverError)
      ? LOGIN_SERVER_ERRORS[serverError]
      : null;

    let error;
    if (known && known.kind === 'rate_limit') {
      error = 'rate_limited';
    } else if (!serverError) {
      // Отказ без кода — нейтральный invalid_credentials (не «PIN не подошёл»).
      error = 'invalid_credentials';
    } else if (known && known.kind === 'wrong_pin') {
      error = 'invalid_credentials';
    } else {
      error = serverError;
    }

    const isWrongPin = Boolean(known && known.kind === 'wrong_pin');
    return { error, serverError, serverMessage, isWrongPin };
  }

  const CLIENT_DEVICE_ID_KEY = 'heys_client_device_id_v1';
  const PEP_ACCEPTED_STORAGE_KEY = 'heys_pep_agreement_accepted_v1_';

  function hasPepAgreementAccepted(clientId) {
    if (!clientId) return false;
    try {
      return localStorage.getItem(PEP_ACCEPTED_STORAGE_KEY + clientId) === '1';
    } catch (_) {
      return false;
    }
  }

  function markPepAgreementAccepted(clientId) {
    if (!clientId) return;
    try {
      localStorage.setItem(PEP_ACCEPTED_STORAGE_KEY + clientId, '1');
    } catch (_) { }
  }

  function getClientDeviceId() {
    try {
      let v = localStorage.getItem(CLIENT_DEVICE_ID_KEY);
      if (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
        return v;
      }
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        v = global.crypto.randomUUID();
      } else {
        v = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const val = c === 'x' ? r : (r & 0x3 | 0x8);
          return val.toString(16);
        });
      }
      localStorage.setItem(CLIENT_DEVICE_ID_KEY, v);
      return v;
    } catch (_) {
      return '00000000-0000-4000-8000-000000000001';
    }
  }

  function extractRpcRow(rawData, rpcName) {
    if (!rawData) return null;
    if (rawData[rpcName]) return rawData[rpcName];
    if (Array.isArray(rawData)) return rawData[0];
    return rawData;
  }

  function mapRpcTransportError(vRes, rpcName) {
    if (vRes.error) {
      if (vRes.error.code === 'NETWORK_ERROR') {
        return {
          ok: false,
          error: 'network_error',
          serverError: '',
          serverMessage: '',
          isWrongPin: false,
          _debug: { stage: rpcName, rpc: rpcName, code: vRes.error.code },
        };
      }
      const transport = classifyServerLoginError(vRes.error.message, vRes.error.raw && vRes.error.raw.message);
      return {
        ok: false,
        error: transport.error,
        serverError: transport.serverError,
        serverMessage: transport.serverMessage,
        isWrongPin: transport.isWrongPin,
        _debug: { stage: rpcName, rpc: rpcName, code: vRes.error.code, message: vRes.error.message },
      };
    }
    return null;
  }

  async function finalizeClientLogin({ clientId, sessionToken, clientName, phoneNorm, api, rpcName }) {
    if (!clientId || !sessionToken) {
      return {
        ok: false,
        error: 'session_not_issued',
        _debug: {
          stage: rpcName,
          rpc: rpcName,
          hasClientId: !!clientId,
          hasSessionToken: !!sessionToken,
        },
      };
    }

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

    setSessionToken(sessionToken);

    try {
      localStorage.setItem('heys_pin_auth_client', clientId);
      setCookieSessionHint('pin', true);
    } catch (_) { }

    if (clientName) {
      localStorage.setItem('heys_pending_client_name', JSON.stringify(clientName));
    }

    window.dispatchEvent(new Event('heys:auth-changed'));
    console.info(`[HEYS.auth] 🔐 Вход выполнен: ${clientId.slice(0, 8)}***`);

    return { ok: true, clientId, sessionToken, clientName, phone: phoneNorm };
  }

  async function callLoginClientV1(api, phoneNorm, deviceId, accessCode) {
    const vRes = await api.rpc('login_client_v1', {
      p_phone: phoneNorm,
      p_device_id: deviceId,
      p_access_code: accessCode || null,
    });
    const transportErr = mapRpcTransportError(vRes, 'login_client_v1');
    if (transportErr) return { row: null, transportErr };

    const row = extractRpcRow(vRes.data, 'login_client_v1');
    if (!row?.success) {
      const rejected = classifyServerLoginError(row?.error, row?.message);
      return {
        row,
        transportErr: {
          ok: false,
          error: rejected.error,
          serverError: rejected.serverError,
          serverMessage: rejected.serverMessage,
          isWrongPin: rejected.isWrongPin,
          _debug: { stage: 'login_client_v1', rpc: 'login_client_v1', serverError: row?.error },
        },
      };
    }
    return { row, transportErr: null };
  }

  async function callVerifyClientOnetimePin(api, phoneNorm, pin, deviceId) {
    const vRes = await api.rpc('verify_client_onetime_pin', {
      p_phone: phoneNorm,
      p_pin: pin,
      p_device_id: deviceId,
    });
    const transportErr = mapRpcTransportError(vRes, 'verify_client_onetime_pin');
    if (transportErr) return { row: null, transportErr };

    const row = extractRpcRow(vRes.data, 'verify_client_onetime_pin');
    if (!row?.success) {
      const rejected = classifyServerLoginError(row?.error, row?.message);
      return {
        row,
        transportErr: {
          ok: false,
          error: rejected.error,
          serverError: rejected.serverError,
          serverMessage: rejected.serverMessage,
          isWrongPin: rejected.isWrongPin,
          _debug: { stage: 'verify_client_onetime_pin', rpc: 'verify_client_onetime_pin', serverError: row?.error },
        },
      };
    }
    return { row, transportErr: null };
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
      const deviceId = getClientDeviceId();

      let attempt = await callLoginClientV1(api, phoneNorm, deviceId, null);
      if (attempt.row?.success) {
        return finalizeClientLogin({
          clientId: attempt.row.client_id,
          sessionToken: attempt.row.session_token,
          clientName: attempt.row.name || attempt.row.client_name || '',
          phoneNorm,
          api,
          rpcName: 'login_client_v1',
        });
      }

      let serverError = attempt.row?.error || attempt.transportErr?.serverError || '';

      if (serverError === 'access_code_required') {
        attempt = await callLoginClientV1(api, phoneNorm, deviceId, pin);
        if (attempt.row?.success) {
          return finalizeClientLogin({
            clientId: attempt.row.client_id,
            sessionToken: attempt.row.session_token,
            clientName: attempt.row.name || attempt.row.client_name || '',
            phoneNorm,
            api,
            rpcName: 'login_client_v1',
          });
        }
        if (attempt.transportErr) {
          if (attempt.transportErr.isWrongPin) registerFail('login', phoneNorm);
          return attempt.transportErr;
        }
        serverError = attempt.row?.error || '';
      }

      if (serverError === 'access_code_not_set') {
        const onetime = await callVerifyClientOnetimePin(api, phoneNorm, pin, deviceId);
        if (onetime.row?.success) {
          if (onetime.row.needs_access_code) {
            setSessionToken(onetime.row.session_token);
            try {
              localStorage.setItem('heys_pin_auth_client', onetime.row.client_id);
              setCookieSessionHint('pin', true);
            } catch (_) { }
            return {
              ok: false,
              error: 'needs_access_code_setup',
              clientId: onetime.row.client_id,
              sessionToken: onetime.row.session_token,
              phone: phoneNorm,
              skipPepAgreement: hasPepAgreementAccepted(onetime.row.client_id),
            };
          }
          return finalizeClientLogin({
            clientId: onetime.row.client_id,
            sessionToken: onetime.row.session_token,
            clientName: onetime.row.name || onetime.row.client_name || '',
            phoneNorm,
            api,
            rpcName: 'verify_client_onetime_pin',
          });
        }
        if (onetime.transportErr) {
          if (onetime.transportErr.isWrongPin) registerFail('login', phoneNorm);
          return onetime.transportErr;
        }
      }

      if (attempt.transportErr) {
        if (attempt.transportErr.isWrongPin) registerFail('login', phoneNorm);
        return attempt.transportErr;
      }

      const rejected = classifyServerLoginError(serverError, attempt.row?.message);
      if (rejected.isWrongPin) registerFail('login', phoneNorm);
      return {
        ok: false,
        error: rejected.error,
        serverError: rejected.serverError,
        serverMessage: rejected.serverMessage,
        _debug: {
          stage: 'login_client_v1',
          rpc: 'login_client_v1',
          serverError,
        },
      };
    } catch (e) {
      return {
        ok: false,
        error: 'exception',
        _debug: { stage: 'exception', message: e?.message || String(e) },
      };
    }
  }

  async function setClientAccessCode({ accessCode, sessionToken, clientId, phone }) {
    if (!validatePinStrict(accessCode)) {
      return { ok: false, error: 'weak_access_code' };
    }

    const api = HEYS.YandexAPI;
    if (!api) {
      return { ok: false, error: 'api_not_ready' };
    }

    const token = sessionToken || getSessionToken();
    if (!token) {
      return { ok: false, error: 'session_not_issued' };
    }

    const deviceId = getClientDeviceId();
    const phoneNorm = phone ? normalizePhone(phone) : null;

    try {
      const res = await api.rpc('set_client_access_code', {
        p_session_token: token,
        p_access_code: accessCode,
        p_device_id: deviceId,
      });

      const transportErr = mapRpcTransportError(res, 'set_client_access_code');
      if (transportErr) return transportErr;

      const row = extractRpcRow(res.data, 'set_client_access_code');
      if (!row?.success) {
        const rejected = classifyServerLoginError(row?.error, row?.message);
        return {
          ok: false,
          error: rejected.error,
          serverError: rejected.serverError,
          serverMessage: rejected.serverMessage,
          _debug: { stage: 'set_client_access_code', serverError: row?.error },
        };
      }

      markPepAgreementAccepted(clientId || row.client_id);

      return finalizeClientLogin({
        clientId: clientId || row.client_id,
        sessionToken: token,
        clientName: '',
        phoneNorm: phoneNorm || '',
        api,
        rpcName: 'set_client_access_code',
      });
    } catch (e) {
      return {
        ok: false,
        error: 'exception',
        _debug: { stage: 'set_client_access_code', message: e?.message || String(e) },
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

    const row = extractRpcRow(res.data, 'create_client_with_pin');
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

  /** Проверить кураторский runtime без чтения секретов из JS storage. */
  function isCuratorSession() {
    try {
      if (HEYS.cloud?.getUser?.()) return true;
      if (HEYS.YandexAPI?.getCuratorToken?.()) return true;
      return localStorage.getItem(CURATOR_COOKIE_SESSION_HINT_KEY) === '1';
    } catch (_) { }
    return false;
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
    setClientAccessCode,
    getClientDeviceId,
    // Контракт кодов отказа на входе: читает тест, сверяющий его с SQL и с
    // ветками экрана входа.
    LOGIN_SERVER_ERRORS,
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
