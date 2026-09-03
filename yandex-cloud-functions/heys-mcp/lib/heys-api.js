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

function request(url, { method = 'GET', body = null, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, raw = false }) {
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
        const buffer = Buffer.concat(chunks);
        // Картинка вложения — единственный не-JSON ответ в системе. Её нельзя
        // прогонять через toString('utf8'): это молча портит байты.
        if (raw) {
          resolve({ status: res.statusCode, headers: res.headers, buffer });
          return;
        }
        const text = buffer.toString('utf8');
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

/**
 * Читающие RPC. Повтор для них безопасен: они ничего не меняют, а сетевой сбой
 * при чтении каталога раньше превращался в «продукт не найден» и подталкивал
 * к созданию дубликата.
 *
 * Чего здесь намеренно нет: записи (повтор merge-сохранения мог бы задвоить
 * приём) и `verify_client_pin_v3` — он считает попытки входа, и повтор сжигал
 * бы лимит клиента вместо того, чтобы помочь.
 */
const IDEMPOTENT_RPC = /^(get_|batch_get_|list_mcp_call_events)/;

/** Строки KV → карта ключ→значение. Форма ответа отличается по путям чтения. */
function rowsToMap(rows) {
  const out = {};
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    const key = row.k ?? row.key;
    if (!key) continue;
    out[key] = row.v ?? row.value ?? null;
  }
  return out;
}

/**
 * Строки пакетного чтения. Форма ответа зависит от того, как SQL-функция
 * прошла через SELECT-обёртку: и `{items:[…]}`, и `[{fn:{items:[…]}}]` в
 * системе встречаются (см. parseExistingPlanningData в heys-api-rpc).
 * `null` — форма незнакомая; отличать это от пустого набора обязательно.
 */
function extractBatchItems(data, fnName) {
  if (Array.isArray(data)) {
    if (!data.length || data[0] == null) return data;
    if (typeof data[0] === 'object' && (data[0].k !== undefined || data[0].key !== undefined)) return data;
    const nested = data[0][fnName];
    if (nested && Array.isArray(nested.items)) return nested.items;
    return null;
  }
  if (data && typeof data === 'object') {
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.rows)) return data.rows;
    const nested = data[fnName];
    if (nested && Array.isArray(nested.items)) return nested.items;
  }
  return null;
}

const RETRY_DELAYS_MS = [200, 700];

/** 429 не повторяем: лимит снимается временем, а не настойчивостью. */
function isRetriableStatus(status) {
  return status === 0 || status === 408 || (status >= 500 && status < 600);
}

function createApiClient({ apiUrl, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = request, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  // Счётчик round-trip'ов к API: по нему видно, из чего складывается время
  // инструмента — из его логики или из числа обращений к серверу.
  const stats = { calls: 0, ms: 0, retries: 0 };

  async function measured(url, options, { retry = false } = {}) {
    const startedAt = Date.now();
    try {
      let lastError = null;
      for (let attempt = 0; attempt <= (retry ? RETRY_DELAYS_MS.length : 0); attempt += 1) {
        if (attempt > 0) {
          stats.retries += 1;
          await sleep(RETRY_DELAYS_MS[attempt - 1]);
        }
        try {
          const res = await fetchImpl(url, options);
          if (!retry || !isRetriableStatus(res.status)) return res;
          lastError = null;
          if (attempt === RETRY_DELAYS_MS.length) return res;
        } catch (e) {
          // Обрыв соединения и таймаут — самый частый сбой в serverless.
          lastError = e;
          if (!retry || attempt === RETRY_DELAYS_MS.length) throw e;
        }
      }
      if (lastError) throw lastError;
      return { status: 0, json: null, text: '' };
    } finally {
      stats.calls += 1;
      stats.ms += Date.now() - startedAt;
    }
  }

  async function rpc(fnName, params = {}, { bearer = null, timeoutMs: callTimeoutMs } = {}) {
    const url = `${apiUrl}/rpc?fn=${encodeURIComponent(fnName)}`;
    const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
    const res = await measured(url, {
      method: 'POST',
      body: params,
      headers,
      timeoutMs: callTimeoutMs || timeoutMs,
    },
      { retry: IDEMPOTENT_RPC.test(fnName) });
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

  async function rest(table, { select, limit, offset, order, filters, bearer, timeoutMs: callTimeoutMs } = {}) {
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
    const res = await measured(url, { method: 'GET', headers, timeoutMs: callTimeoutMs || timeoutMs }, { retry: true });
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
   * Пакетное чтение: неделя дневников — это 7 ключей, и по одному запросу на
   * каждый инструмент упирался бы в холодный старт вместо полезной работы.
   * Ключи перечисляются явно, без префиксного поиска: так в ответ не может
   * попасть ничего, кроме запрошенного.
   */
  async function getKVMany(sessionToken, keys) {
    if (!Array.isArray(keys) || !keys.length) return { data: {}, error: null };
    const { data, error } = await rpc('batch_get_client_kv_by_session', {
      p_session_token: sessionToken,
      p_keys: keys,
    });
    if (error) return { data: null, error };
    const items = extractBatchItems(data, 'batch_get_client_kv_by_session');
    // Незнакомая форма ответа — это сбой, а не «данных нет»: пустая карта здесь
    // означала бы «клиент ничего не ведёт» и увела бы ассистента в неверный вывод.
    if (!items) return { data: null, error: { message: 'unexpected_batch_shape', status: 0 } };
    return { data: rowsToMap(items), error: null };
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

  async function deleteKV(sessionToken, key) {
    const { data, error } = await rpc('delete_client_kv_by_session', {
      p_session_token: sessionToken,
      p_key: key,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  }

  /**
   * Общий справочник — самый тяжёлый запрос в системе, поэтому у него свой
   * таймаут. Если пришло ровно `limit` строк, справочник почти наверняка
   * обрезан: сообщаем об этом, чтобы неполнота не выглядела как «нет продукта».
   */
  async function getSharedProducts({ limit = 5000 } = {}) {
    const res = await rest('shared_products', { limit, timeoutMs: Math.max(timeoutMs, 20000) });
    if (!res.error && Array.isArray(res.data) && res.data.length >= limit) {
      return { ...res, truncated: true };
    }
    return res;
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

  /**
   * 🔐 SEC-031: GET /auth/curator-status — жив ли ещё кураторский аккаунт.
   *
   * Вызывается перед перевыпуском кураторского JWT на refresh-гранте. Ответ
   * трактуется fail-closed: всё, кроме явного 200 `{active:true}`, означает
   * «не перевыпускать». Сетевая ошибка тоже отказ — цена ошибки здесь
   * несимметрична: лишний перелогин против доступа к дневникам всех клиентов.
   */
  async function curatorStatus(bearer) {
    try {
      const res = await measured(`${apiUrl}/auth/curator-status`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
        timeoutMs,
      });
      if (res.status === 200 && res.json && res.json.active === true) {
        return { ok: true };
      }
      return { ok: false, error: String((res.json && res.json.error) || `curator_status_http_${res.status}`) };
    } catch (e) {
      return { ok: false, error: `curator_status_unreachable: ${e && e.message}` };
    }
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

  /** Пакетное чтение кураторским путём — тот же `in.k`, что у getKVBatchByCurator в приложении. */
  async function getKVManyByCurator(bearer, clientId, keys) {
    if (!Array.isArray(keys) || !keys.length) return { data: {}, error: null };
    const { data, error } = await rest('client_kv_store', {
      select: 'k,v',
      filters: { 'eq.client_id': clientId, 'in.k': `(${keys.join(',')})` },
      bearer,
    });
    if (error) return { data: null, error };
    return { data: rowsToMap(data), error: null };
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

  /**
   * Пакетная запись нескольких ключей одним вызовом. Нужна там, где значение и
   * его индекс обязаны меняться вместе: задачник хранит файл и запись в
   * `heys_tasks_index`, и разъехавшись они дают либо потерянную для пуллера
   * правку, либо запись о файле, которого нет.
   */
  async function upsertKVManyByCurator(bearer, clientId, items, contextId = null) {
    if (!Array.isArray(items) || !items.length) return { ok: true, data: null };
    const { data, error } = await rpc('batch_upsert_client_kv_by_curator', {
      p_client_id: clientId,
      p_items: items,
      p_context_id: contextId,
    }, { bearer });
    if (error) return { ok: false, error: error.message };
    if (data && Array.isArray(data.identity_blocked) && data.identity_blocked.length) {
      return { ok: false, error: 'identity_blocked' };
    }
    // Задачник: сервер отбил файл, чья ревизия разошлась с облачной. Молча
    // вернуть ok нельзя — инструмент решит, что текст сохранён, и скажет это
    // куратору. Ровно так 02.09 пропала правка, сделанная из чата.
    if (data && Array.isArray(data.tasks_blocked) && data.tasks_blocked.length) {
      return { ok: false, error: 'tasks_stale_rev', currentRev: Number(data.tasks_blocked[0].current_rev) || 0 };
    }
    return { ok: true, data };
  }

  /**
   * Дельта-запись transcript/journal: в теле RPC только блок, не весь файл.
   * Сервер дописывает/вставляет и ротирует переполнение в archive/*_partN.
   */
  async function appendTasksFileByCurator(bearer, clientId, spec, contextId = null) {
    const { data, error } = await rpc('append_heys_tasks_file_by_curator', {
      p_client_id: clientId,
      p_path: spec.path,
      p_mode: spec.mode,
      p_block: spec.block,
      p_base_rev: Number(spec.base_rev) || 0,
      p_context_id: contextId,
    }, { bearer });
    if (error) return { ok: false, error: error.message };
    if (data && data.error === 'stale_rev') {
      return { ok: false, error: 'stale_rev', current_rev: Number(data.current_rev) || 0 };
    }
    if (data && data.ok === false) return { ok: false, error: data.error || 'append_failed' };
    return { ok: true, data };
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

  async function deleteKVByCurator(bearer, curatorUserId, clientId, key) {
    if (!curatorUserId) return { ok: false, error: 'curator_id_required' };
    const params = new URLSearchParams({
      user_id: `eq.${curatorUserId}`,
      client_id: `eq.${clientId}`,
      k: `eq.${key}`,
    });
    const url = `${apiUrl}/rest/client_kv_store?${params}`;
    const res = await measured(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearer}` },
    });
    if (res.status < 200 || res.status >= 300) {
      const message = (res.json && (res.json.error || res.json.message)) || `rest_http_${res.status}`;
      return { ok: false, error: String(message) };
    }
    return { ok: true, data: res.json };
  }

  // ── Административный контур куратора ──────────────────────────────────
  // Все функции ниже — curator-only по JWT: ownership и права проверяет SQL,
  // `p_curator_id` там, где он есть, сервер подставляет из токена.

  /** Разворачивает `{fnName: {...}}` и приводит ошибку к единой форме. */
  async function adminRpc(fnName, params, bearer) {
    const { data, error } = await rpc(fnName, params, { bearer });
    if (error) return { ok: false, error: error.message, raw: data };
    const result = unwrap(data, fnName);
    if (result && typeof result === 'object' && result.success === false) {
      return { ok: false, error: String(result.error || result.message || `${fnName}_failed`), raw: result };
    }
    return { ok: true, data: result };
  }

  async function createClientWithPin(bearer, { name, phone, pinSalt, pinHash }) {
    return adminRpc('create_client_with_pin', {
      p_name: name,
      p_phone: phone,
      p_pin_salt: pinSalt,
      p_pin_hash: pinHash,
    }, bearer);
  }

  async function setClientPin(bearer, clientId, pin) {
    return adminRpc('admin_set_client_pin', { p_client_id: clientId, p_pin: pin }, bearer);
  }

  async function getClientAccessLink(bearer, clientId) {
    return adminRpc('admin_get_client_access_link', { p_client_id: clientId }, bearer);
  }

  async function extendSubscription(bearer, curatorId, clientId, months) {
    return adminRpc('admin_extend_subscription', {
      p_curator_id: curatorId,
      p_client_id: clientId,
      p_months: months,
    }, bearer);
  }

  async function cancelSubscription(bearer, curatorId, clientId) {
    return adminRpc('admin_cancel_subscription', {
      p_curator_id: curatorId,
      p_client_id: clientId,
    }, bearer);
  }

  async function getTrialQueue(bearer) {
    return adminRpc('admin_get_trial_queue_list', {}, bearer);
  }

  async function getQueueStats(bearer) {
    return adminRpc('admin_get_queue_stats', {}, bearer);
  }

  async function activateTrial(bearer, clientId, startDate) {
    const params = { p_client_id: clientId };
    if (startDate) params.p_start_date = startDate;
    return adminRpc('admin_activate_trial', params, bearer);
  }

  async function rejectTrialRequest(bearer, queueId, reason) {
    return adminRpc('admin_reject_request', { p_queue_id: queueId, p_reason: reason }, bearer);
  }

  async function getLeads(bearer, status) {
    return adminRpc('admin_get_leads', { p_status: status || null }, bearer);
  }

  async function updateLeadStatus(bearer, leadId, status, reason) {
    return adminRpc('admin_update_lead_status', {
      p_lead_id: leadId,
      p_status: status,
      p_reason: reason || '',
    }, bearer);
  }

  async function getClientObservability(bearer, clientId, { since, limit = 100 } = {}) {
    return adminRpc('get_client_observability_by_curator', {
      p_client_id: clientId,
      p_since: since,
      p_limit: limit,
    }, bearer);
  }

  // ── Модерация общей базы продуктов ────────────────────────────────────
  // Клиент присылает продукт в очередь, куратор её разбирает. Обе операции
  // ходят теми же путями, что и вкладка модерации в приложении.

  async function getPendingSharedProducts(bearer, curatorId, { limit = 50 } = {}) {
    return rest('shared_products_pending', {
      select: 'id,client_id,product_data,status,created_at,barcode',
      filters: { 'eq.curator_id': curatorId, 'eq.status': 'pending' },
      order: 'created_at.desc',
      limit,
      bearer,
    });
  }

  /**
   * Скрыть или вернуть продукт общей базы в выдаче клиентов этого куратора.
   *
   * Удаления из общего каталога нет ни здесь, ни в приложении — и это
   * сознательно: строку могли уже записать в приёмы у других клиентов.
   * Blocklist обратим и действует только на клиентов своего куратора,
   * поэтому им безопасно исправлять ошибочную публикацию.
   */
  async function setSharedProductHidden(bearer, curatorId, productId, hidden) {
    const headers = { Authorization: `Bearer ${bearer}` };
    const url = hidden
      ? `${apiUrl}/rest/shared_products_blocklist`
      : `${apiUrl}/rest/shared_products_blocklist?${new URLSearchParams({
        curator_id: `eq.${curatorId}`,
        product_id: `eq.${productId}`,
      })}`;
    const res = await measured(url, {
      method: hidden ? 'POST' : 'DELETE',
      body: hidden ? { curator_id: curatorId, product_id: productId } : null,
      headers,
      timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) {
      const message = (res.json && (res.json.error || res.json.message)) || `blocklist_http_${res.status}`;
      return { ok: false, error: String(message) };
    }
    return { ok: true };
  }

  /**
   * Публикация карточки в общую базу куратором — тот же путь, которым это
   * делает вкладка каталога в приложении.
   *
   * `fingerprint` обязателен: по нему сервер отсекает дубликаты. Ответ
   * «такой продукт уже есть» — не ошибка вызова, а нормальный исход, поэтому
   * он возвращается отдельным полем, а не исключением.
   */
  async function publishSharedProduct(bearer, curatorId, productData) {
    const { data, error } = await rpc('publish_shared_product_by_curator', {
      p_curator_id: curatorId,
      p_product_data: productData,
    }, { bearer });
    const result = unwrap(data, 'publish_shared_product_by_curator') || {};
    const reason = String(result.error || (error && error.message) || '');
    if (/duplicate|already|exists/i.test(reason)) {
      return { ok: false, duplicate: true, error: reason, existing: result.existing_id || result.id || null };
    }
    if (error) return { ok: false, error: error.message };
    if (result.success === false) return { ok: false, error: reason || 'publish_failed' };
    return { ok: true, data: result };
  }

  /**
   * Правка существующей карточки общей базы куратором.
   *
   * Тот же путь, которым это делает кураторский UI приложения
   * (updateSharedProduct в apps/web/heys_add_product_step_v1.js): upsert по `id`
   * с кураторским JWT. Через очередь модерации он не идёт и не должен —
   * `shared_products_pending` это вход для клиентских публикаций
   * (create_pending_product_by_session), а куратор в этой очереди разбирающий,
   * а не подающий. Правка карточки, уже стоящей в каталоге, модерацией не
   * гейтится нигде в продукте.
   *
   * Колонки обязаны быть из белого списка REST-шлюза, иначе ответ
   * `invalid_insert_column` — payload собирает products.buildSharedProductPayload.
   */
  async function updateSharedProduct(bearer, productData) {
    if (!productData || !productData.id) return { ok: false, error: 'shared_product_id_required' };
    const query = new URLSearchParams({ upsert: 'true', on_conflict: 'id', select: 'id,name' });
    const res = await measured(`${apiUrl}/rest/shared_products?${query.toString()}`, {
      method: 'POST',
      body: productData,
      headers: { Authorization: `Bearer ${bearer}` },
      timeoutMs,
    });
    if (res.status < 200 || res.status >= 300) {
      const message = (res.json && (res.json.error || res.json.message)) || `shared_update_http_${res.status}`;
      return { ok: false, error: String(message), status: res.status };
    }
    const rows = Array.isArray(res.json) ? res.json : [];
    return { ok: true, row: rows[0] || null };
  }

  /**
   * Approve/reject. Ownership проверяет SQL, `p_curator_id` подставляется из
   * JWT на стороне функции. Ответ `status: 'race'` означает, что заявку уже
   * разобрали — это нормальный исход, а не ошибка.
   */
  async function moderatePendingProduct(bearer, pendingId, action, rejectReason = '') {
    const { data, error } = await rpc('moderate_pending_shared_product_by_curator', {
      p_pending_id: pendingId,
      p_action: action,
      p_reject_reason: rejectReason || '',
    }, { bearer });
    if (error) return { ok: false, error: error.message, raw: data };
    const result = (data && data.moderate_pending_shared_product_by_curator) || data || {};
    if (result.status === 'race') return { ok: false, race: true, error: 'already_moderated' };
    if (result.success === false) return { ok: false, error: String(result.error || result.message || 'moderation_failed') };
    return { ok: true, data: result };
  }

  // ── Мессенджер ────────────────────────────────────────────────────────
  // Отдельная функция heys-api-messages со своими путями: в /rpc её функций
  // нет вообще. Куратор авторизуется тем же JWT, что и остальной кураторский
  // контур.

  async function messagesRequest(path, { method = 'GET', bearer, body = null, query = null } = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    const url = `${apiUrl}${path}${qs ? `?${qs}` : ''}`;
    const res = await measured(
      url,
      { method, body, headers: { Authorization: `Bearer ${bearer}` }, timeoutMs },
      { retry: method === 'GET' },
    );
    if (res.status < 200 || res.status >= 300) {
      const message = (res.json && (res.json.error || res.json.message)) || `messages_http_${res.status}`;
      return { data: null, error: { message: String(message), status: res.status } };
    }
    return { data: res.json || {}, error: null };
  }

  /** Переписка с клиентом. limit максимум 200, дальше — пагинация через before. */
  async function getMessagesThread(bearer, clientId, { limit = 100, before = null } = {}) {
    return messagesRequest('/messages/thread', {
      bearer,
      query: { client_id: clientId, limit: Math.min(Number(limit) || 100, 200), before },
    });
  }

  /**
   * Фото из переписки. Путь берётся из вложения сообщения, права проверяет
   * сервер: он же убеждается, что путь действительно упомянут в сообщении
   * этого клиента, — поэтому произвольный путь из S3 отсюда не прочитать.
   *
   * Возвращает base64 и mime: в таком виде картинка уходит в ответ инструмента
   * как image-контент MCP, и модель видит именно изображение, а не ссылку.
   */
  async function readAttachment(bearer, path) {
    const res = await measured(`${apiUrl}/photos/read`, {
      method: 'POST',
      body: { path },
      headers: { Authorization: `Bearer ${bearer}` },
      timeoutMs: Math.max(timeoutMs, 20000),
      raw: true,
    });
    if (res.status < 200 || res.status >= 300) {
      // Тело ошибки — JSON, и оно осталось в буфере: читаем его как текст.
      let message = `photos_http_${res.status}`;
      try {
        const parsed = JSON.parse(res.buffer.toString('utf8'));
        if (parsed && parsed.error) message = String(parsed.error);
      } catch (_) { /* не-JSON ошибка — оставляем код статуса */ }
      return { ok: false, error: message, status: res.status };
    }
    const mimeType = String((res.headers && res.headers['content-type']) || '').split(';')[0].trim() || 'image/jpeg';
    return { ok: true, data: res.buffer.toString('base64'), mimeType, bytes: res.buffer.length };
  }

  /** Счётчики непрочитанного по всем клиентам куратора. */
  async function getMessagesInbox(bearer) {
    return messagesRequest('/messages/inbox', { bearer });
  }

  async function setMessageDone(bearer, messageId, desiredState = true) {
    return messagesRequest('/messages/set-done', {
      method: 'POST',
      bearer,
      body: { message_id: messageId, desired_state: !!desiredState },
    });
  }

  async function sendMessageToClient(bearer, clientId, text) {
    return messagesRequest('/messages/send', {
      method: 'POST',
      bearer,
      body: { client_id: clientId, body: text },
    });
  }

  async function insertMcpCallEvent(record, { secret, timeoutMs: callTimeoutMs = 250 } = {}) {
    if (!secret) return { ok: false, reason: 'no_secret' };
    const url = `${apiUrl}/rpc?fn=${encodeURIComponent('insert_mcp_call_event')}`;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        body: record,
        headers: { Authorization: `Bearer ${secret}` },
        timeoutMs: callTimeoutMs,
      });
      if (res.status < 200 || res.status >= 300) {
        console.warn('[mcp-telemetry-db] insert_failed: http', res.status);
        return { ok: false, reason: `http_${res.status}` };
      }
      const data = unwrap(res.json, 'insert_mcp_call_event');
      return data && typeof data === 'object' ? data : { ok: true };
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      const kind = /timeout/i.test(msg) ? 'timeout' : 'insert_failed';
      console.warn(`[mcp-telemetry-db] ${kind}:`, msg);
      return { ok: false, reason: kind };
    }
  }

  /**
   * Сколько раз инструмент уже звался в этом подключении за окно.
   *
   * Зовётся ПАРАЛЛЕЛЬНО работе инструмента (lib/mcp.js), поэтому любой сбой
   * означает «подсказки не будет», а не задержку ответа.
   *
   * Но параллельность не бесплатна: ответ ждёт обоих, и если счётчик медленнее
   * инструмента, разница ложится в ожидание куратора. Поэтому потолок — те же
   * 250 мс, что у записи телеметрии (`DEFAULT_PERSIST_TIMEOUT_MS`): сам поиск
   * стоит 400–600 мс, то есть счётчик почти всегда прячется за ним целиком, а
   * когда не успевает — молчит. Подсказка про лишний круг не стоит того, чтобы
   * ради неё ждать.
   */
  async function countMcpRecentCalls({ connId, tool, windowMs = 60000, secret, timeoutMs: callTimeoutMs = 250 } = {}) {
    if (!secret || !connId || !tool) return { count: 0 };
    const url = `${apiUrl}/rpc?fn=${encodeURIComponent('count_mcp_recent_calls')}`;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        body: { p_conn_id: connId, p_tool: tool, p_window_ms: windowMs },
        headers: { Authorization: `Bearer ${secret}` },
        timeoutMs: callTimeoutMs,
      });
      if (res.status < 200 || res.status >= 300) return { count: 0 };
      const data = unwrap(res.json, 'count_mcp_recent_calls');
      const count = data && Number.isFinite(Number(data.count)) ? Number(data.count) : 0;
      return { count };
    } catch (_) {
      return { count: 0 };
    }
  }

  async function listMcpCallEvents({
    since,
    until,
    role = 'curator',
    limit = 5000,
    bearer,
    timeoutMs: callTimeoutMs,
  } = {}) {
    const { data, error } = await rpc('list_mcp_call_events', {
      p_since: since,
      p_until: until,
      p_role: role,
      p_limit: limit,
    }, { bearer, timeoutMs: callTimeoutMs || timeoutMs });
    if (error) return { records: [], truncated: false, error };
    return {
      records: Array.isArray(data && data.records) ? data.records : [],
      truncated: Boolean(data && data.truncated),
      error: null,
    };
  }

  return {
    rpc, rest, verifyPin, getKV, getKVMany, mergeSaveKV, upsertKV, deleteKV, getSharedProducts, stats,
    insertMcpCallEvent, listMcpCallEvents, countMcpRecentCalls,
    curatorLogin, curatorStatus, listClients, getKVByCurator, getKVManyByCurator, issueWriteContext, mergeSaveKVByCurator, upsertKVByCurator, upsertKVManyByCurator, deleteKVByCurator, appendTasksFileByCurator,
    getMessagesThread, getMessagesInbox, setMessageDone, sendMessageToClient, readAttachment,
    createClientWithPin, setClientPin, getClientAccessLink,
    extendSubscription, cancelSubscription,
    getTrialQueue, getQueueStats, activateTrial, rejectTrialRequest,
    getLeads, updateLeadStatus, getClientObservability,
    getPendingSharedProducts, moderatePendingProduct, publishSharedProduct, setSharedProductHidden,
    updateSharedProduct,
  };
}

module.exports = { createApiClient, request, unwrap, extractBatchItems, rowsToMap, DEFAULT_TIMEOUT_MS };
