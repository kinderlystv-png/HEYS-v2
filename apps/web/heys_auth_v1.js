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
      } catch (_) {}
    },
  };

  const AUTH_RATE_KEY = 'heys_auth_rate_limit_v1';

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

  function validatePin(pin) {
    const s = String(pin || '');
    return /^\d{4}$/.test(s);
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
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    // Без WebCrypto — не поддерживаем (лучше упасть, чем сделать небезопасно)
    throw new Error('WebCrypto недоступен: SHA-256 не поддерживается');
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

    const cloud = HEYS.cloud;
    if (!cloud || !cloud.client) {
      return { ok: false, error: 'cloud_not_ready', _debug: { stage: 'init' } };
    }

    try {
      const saltRes = await cloud.client.rpc('get_client_salt', {
        p_phone_normalized: phoneNorm,
      });
      if (saltRes.error) {
        registerFail('login', phoneNorm);
        return {
          ok: false,
          error: 'server_error',
          message: saltRes.error.message,
          _debug: {
            stage: 'get_salt',
            rpc: 'get_client_salt',
            sbCode: saltRes.error.code,
            sbDetails: saltRes.error.details,
            sbHint: saltRes.error.hint,
          },
        };
      }

      const saltRow = Array.isArray(saltRes.data) ? saltRes.data[0] : saltRes.data;
      const salt = saltRow && saltRow.salt;
      if (!salt) {
        registerFail('login', phoneNorm);
        return {
          ok: false,
          error: 'invalid_credentials',
          _debug: {
            stage: 'get_salt',
            rpc: 'get_client_salt',
            dataType: Array.isArray(saltRes.data) ? 'array' : typeof saltRes.data,
            hasSalt: false,
          },
        };
      }

      const pinHash = await hashPin(pin, salt);

      const vRes = await cloud.client.rpc('verify_client_pin', {
        p_phone_normalized: phoneNorm,
        p_pin_hash: pinHash,
      });

      if (vRes.error) {
        registerFail('login', phoneNorm);
        return {
          ok: false,
          error: 'invalid_credentials',
          _debug: {
            stage: 'verify_pin',
            rpc: 'verify_client_pin',
            sbCode: vRes.error.code,
            sbDetails: vRes.error.details,
            sbHint: vRes.error.hint,
          },
        };
      }

      const vRow = Array.isArray(vRes.data) ? vRes.data[0] : vRes.data;
      const clientId = vRow && vRow.client_id;
      if (!clientId) {
        registerFail('login', phoneNorm);
        return {
          ok: false,
          error: 'invalid_credentials',
          _debug: {
            stage: 'verify_pin',
            rpc: 'verify_client_pin',
            dataType: Array.isArray(vRes.data) ? 'array' : typeof vRes.data,
            hasClientId: false,
            // Важно: server-side lockout сейчас не отличим от неверного PIN (оба возвращают client_id=null)
            note: 'lockout_indistinguishable_without_rpc_v2',
          },
        };
      }

      return { ok: true, clientId };
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
    if (!validatePin(pin)) {
      return { ok: false, error: 'invalid_pin' };
    }

    const cloud = HEYS.cloud;
    if (!cloud || !cloud.client) {
      return { ok: false, error: 'cloud_not_ready' };
    }

    const salt = generateSalt();
    const pinHash = await hashPin(pin, salt);

    const res = await cloud.client.rpc('create_client_with_pin', {
      p_name: String(name || '').trim(),
      p_phone_normalized: phoneNorm,
      p_pin_salt: salt,
      p_pin_hash: pinHash,
    });

    if (res.error) {
      return { ok: false, error: 'server_error', message: res.error.message };
    }

    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    const clientId = row && (row.client_id || row.id);
    return {
      ok: true,
      client: res.data,
      clientId,
      phone: phoneNorm,
      pin,
    };
  }

  async function resetClientPin({ clientId, newPin }) {
    if (!clientId) return { ok: false, error: 'missing_client_id' };
    if (!validatePin(newPin)) return { ok: false, error: 'invalid_pin' };

    const cloud = HEYS.cloud;
    if (!cloud || !cloud.client) {
      return { ok: false, error: 'cloud_not_ready' };
    }

    const salt = generateSalt();
    const pinHash = await hashPin(newPin, salt);

    const res = await cloud.client.rpc('reset_client_pin', {
      p_client_id: clientId,
      p_pin_salt: salt,
      p_pin_hash: pinHash,
    });

    if (res.error) {
      return { ok: false, error: 'server_error', message: res.error.message };
    }

    return { ok: true };
  }

  HEYS.auth = {
    normalizePhone,
    isValidPhone,
    formatPhone,
    validatePin,
    generateSalt,
    hashPin,
    loginClient,
    createClientWithPin,
    resetClientPin,
  };
})(typeof window !== 'undefined' ? window : globalThis);
