'use strict';

/**
 * Тонкий HTTP-клиент к собственному API HEYS.
 *
 * Ключевое архитектурное решение: heys-mcp НЕ ходит в БД напрямую и не
 * повторяет merge-логику. Вся серверная защита дневного блоба (row-lock,
 * cross-client guard, contract-валидация, data_loss_audit, telegram-алерты)
 * живёт в heys-api-rpc. Агент обязан ходить тем же путём, что и PWA, иначе
 * появится второй, неизбежно расходящийся путь записи.
 */

const https = require('node:https');
const { URL } = require('node:url');

const DEFAULT_TIMEOUT_MS = 12000;

function request(url, { method = 'GET', body = null, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body == null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method,
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_) { /* не-JSON отдаём как текст */ }
        resolve({ status: res.statusCode, json, text });
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('upstream_timeout'));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** RPC-ответ иногда завёрнут в объект с именем функции — разворачиваем как во фронте. */
function unwrap(data, fnName) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (data[fnName] !== undefined) return data[fnName];
    const keys = Object.keys(data);
    if (keys.length === 1 && data[keys[0]] && typeof data[keys[0]] === 'object') return data[keys[0]];
  }
  if (Array.isArray(data) && data.length === 1) return data[0];
  return data;
}

function createApiClient({ apiUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = request }) {
  // Счётчик round-trip'ов к API: по нему видно, из чего складывается время
  // инструмента — из его логики или из числа обращений к серверу.
  const stats = { calls: 0, ms: 0 };

  async function measured(...args) {
    const startedAt = Date.now();
    try {
      return await fetchImpl(...args);
    } finally {
      stats.calls += 1;
      stats.ms += Date.now() - startedAt;
    }
  }

  async function rpc(fnName, params = {}, { bearer = null } = {}) {
    const url = `${apiUrl}/rpc?fn=${encodeURIComponent(fnName)}`;
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
    const res = await measured(url, { method: 'POST', body: params, headers, timeoutMs });
    if (res.status < 200 || res.status >= 300) {
      const message = (res.json && (res.json.error || res.json.message)) || `rpc_http_${res.status}`;
      return { data: null, error: { message: String(message), status: res.status, raw: res.json } };
    }
    const data = unwrap(res.json, fnName);
    if (data && typeof data === 'object' && data.success === false) {
      return { data, error: { message: String(data.error || 'rpc_failed'), status: res.status, raw: data } };
    }
    if (data && typeof data === 'object' && data.ok === false) {
      return { data, error: { message: String(data.error || 'rpc_failed'), status: res.status, raw: data } };
    }
    return { data, error: null };
  }

  async function rest(table, { select, limit, offset, order, filters, bearer } = {}) {
    const params = new URLSearchParams();
    if (select) params.set('select', select);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (order) params.set('order', order);
    // Supabase-формат фильтров, как в heys_yandex_api_v1.js: 'eq.client_id' → client_id=eq.<v>
    for (const [key, value] of Object.entries(filters || {})) {
      const dot = key.indexOf('.');
      if (dot > 0) params.set(key.slice(dot + 1), `${key.slice(0, dot)}.${value}`);
      else params.set(key, String(value));
    }
    const query = params.toString();
    const url = `${apiUrl}/rest/${table}${query ? `?${query}` : ''}`;
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
    const res = await measured(url, { method: 'GET', headers, timeoutMs });
    if (res.status < 200 || res.status >= 300) {
      return { data: null, error: { message: `rest_http_${res.status}`, status: res.status } };
    }
    const rows = Array.isArray(res.json) ? res.json : (res.json && Array.isArray(res.json.data) ? res.json.data : []);
    return { data: rows, error: null };
  }

  // ── Прикладные обёртки ────────────────────────────────────────────────

  async function verifyPin(phone, pin) {
    const { data, error } = await rpc('verify_client_pin_v3', { p_phone: phone, p_pin: pin });
    if (error) return { ok: false, error: error.message };
    if (!data || data.success !== true || !data.client_id || !data.session_token) {
      return { ok: false, error: String((data && data.error) || 'invalid_credentials') };
    }
    return {
      ok: true,
      clientId: data.client_id,
      sessionToken: data.session_token,
      name: data.name || data.client_name || '',
    };
  }

  async function getKV(sessionToken, key) {
    const { data, error } = await rpc('get_client_kv_by_session', {
      p_session_token: sessionToken,
      p_key: key,
    });
    if (error) return { data: null, error };
    if (data && data.found) return { data: data.value, error: null };
    return { data: null, error: null };
  }

  /**
   * Запись дневного блоба всегда через merge: сервер сам разрешает конфликт
   * с версией в облаке по p_last_seen_updated_at, поэтому параллельно открытое
   * PWA не теряет данные и не затирает наши.
   */
  async function mergeSaveKV(sessionToken, key, value, lastSeenUpdatedAt) {
    const { data, error } = await rpc('merge_save_client_kv_by_session', {
      p_session_token: sessionToken,
      p_key: key,
      p_value: value,
      p_last_seen_updated_at: Number(lastSeenUpdatedAt) || 0,
    });
    if (error) return { ok: false, error: error.message, outcome: data && data.outcome };
    return { ok: true, outcome: (data && data.outcome) || 'saved', value: data && data.v };
  }

  /**
   * Обычная запись целого блоба — для ключей вне merge-контура.
   * Наборы приёмов (`heys_meal_presets_v1`) приложение пишет именно так:
   * ключ не входит в MERGEABLE_KEY_RE, и merge-путь для него не предусмотрен.
   */
  async function upsertKV(sessionToken, key, value) {
    const { data, error } = await rpc('upsert_client_kv_by_session', {
      p_session_token: sessionToken,
      p_key: key,
      p_value: value,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  }

  async function getSharedProducts({ limit = 5000 } = {}) {
    return rest('shared_products', { limit });
  }

  // ── Кураторский контур ────────────────────────────────────────────────
  // Те же операции над данными КЛИЕНТА куратора: авторизация кураторским JWT,
  // сервер подставляет p_curator_id из токена и проверяет ownership в SQL.

  /** POST /auth/login. Запрос server-to-server (без Origin) — токен приходит в теле. */
  async function curatorLogin(email, password, mfaCode = '') {
    const body = { email, password };
    if (mfaCode) {
      body.mfa_code = mfaCode;
      body.code = mfaCode;
    }
    const res = await measured(`${apiUrl}/auth/login`, { method: 'POST', body, timeoutMs });
    const data = res.json || {};
    if (res.status === 401 && (data.mfa_required || data.error === 'mfa_required')) {
      return { ok: false, error: 'mfa_required' };
    }
    if (res.status === 429 || data.retryAfter) return { ok: false, error: 'rate_limited' };
    if (res.status < 200 || res.status >= 300 || !data.access_token) {
      return { ok: false, error: String(data.error || `login_http_${res.status}`) };
    }
    return {
      ok: true,
      token: data.access_token,
      curatorId: data.user && data.user.id,
      name: (data.user && data.user.user_metadata && data.user.user_metadata.name) || (data.user && data.user.email) || '',
    };
  }

  async function listClients(bearer) {
    const { data, error } = await rpc('get_curator_clients', {}, { bearer });
    if (error) return { data: null, error };
    const rows = Array.isArray(data) ? data : (data && Array.isArray(data.clients) ? data.clients : (data ? [data] : []));
    return {
      data: rows
        .filter((r) => r && (r.id || r.client_id))
        .map((r) => ({
          client_id: r.id || r.client_id,
          name: r.name || r.client_name || '',
          status: r.subscription_status || r.status || null,
        })),
      error: null,
    };
  }

  /** Чтение KV клиента куратором — REST, как getKVBatchByCurator в приложении. */
  async function getKVByCurator(bearer, clientId, key) {
    const { data, error } = await rest('client_kv_store', {
      select: 'k,v',
      filters: { 'eq.client_id': clientId, 'eq.k': key },
      bearer,
    });
    if (error) return { data: null, error };
    const row = (data || []).find((r) => r && r.k === key);
    return { data: row ? row.v : null, error: null };
  }

  /**
   * Write-context для кураторской записи (Phase B: без него запись пройдёт,
   * но с ним сервер жёстко привязывает цель записи и чище ведёт аудит;
   * при future flip в STRICT-режим код уже готов). Ошибка выдачи не блокирует.
   */
  async function issueWriteContext(bearer, clientId) {
    const { data, error } = await rpc('issue_write_context_by_curator', {
      p_client_id: clientId,
      p_ttl_seconds: 86400,
    }, { bearer });
    if (error || !data) return null;
    return data.context_id || data.id || data.write_context_id || null;
  }

  async function mergeSaveKVByCurator(bearer, clientId, key, value, lastSeenUpdatedAt, contextId = null) {
    const { data, error } = await rpc('merge_save_client_kv_by_curator', {
      p_client_id: clientId,
      p_key: key,
      p_value: value,
      p_last_seen_updated_at: Number(lastSeenUpdatedAt) || 0,
      p_context_id: contextId,
    }, { bearer });
    if (error) return { ok: false, error: error.message, outcome: data && data.outcome };
    return { ok: true, outcome: (data && data.outcome) || 'saved', value: data && data.v };
  }

  async function upsertKVByCurator(bearer, clientId, key, value, contextId = null) {
    const { data, error } = await rpc('batch_upsert_client_kv_by_curator', {
      p_client_id: clientId,
      p_items: [{ k: key, v: value }],
      p_context_id: contextId,
    }, { bearer });
    if (error) return { ok: false, error: error.message };
    if (data && Array.isArray(data.identity_blocked) && data.identity_blocked.length) {
      return { ok: false, error: 'identity_blocked' };
    }
    return { ok: true, data };
  }

  return {
    rpc, rest, verifyPin, getKV, mergeSaveKV, upsertKV, getSharedProducts, stats,
    curatorLogin, listClients, getKVByCurator, issueWriteContext, mergeSaveKVByCurator, upsertKVByCurator,
  };
}

module.exports = { createApiClient, request, unwrap, DEFAULT_TIMEOUT_MS };
