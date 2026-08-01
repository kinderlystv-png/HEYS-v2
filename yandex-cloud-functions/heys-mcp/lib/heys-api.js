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
  async function rpc(fnName, params = {}) {
    const url = `${apiUrl}/rpc?fn=${encodeURIComponent(fnName)}`;
    const res = await fetchImpl(url, { method: 'POST', body: params, timeoutMs });
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

  async function rest(table, { select, limit, offset, order } = {}) {
    const params = new URLSearchParams();
    if (select) params.set('select', select);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    if (order) params.set('order', order);
    const query = params.toString();
    const url = `${apiUrl}/rest/${table}${query ? `?${query}` : ''}`;
    const res = await fetchImpl(url, { method: 'GET', timeoutMs });
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

  return { rpc, rest, verifyPin, getKV, mergeSaveKV, upsertKV, getSharedProducts };
}

module.exports = { createApiClient, request, unwrap, DEFAULT_TIMEOUT_MS };
