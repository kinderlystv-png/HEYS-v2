/**
 * HEYS API REST — Yandex Cloud Function
 * REST операции с таблицами PostgreSQL
 */

const { getPool } = require('./db-pool');
const { initSecrets } = require('./secrets');
const { classifyCriticalKey, validateCriticalKvPayload } = require('./shared/kv-payload-contracts');
const { createServerlessCapacityGuard } = require('./shared/serverless-capacity-guard');
const { mergeDayData, mergeHungerStatusEvents, mergeInsightsFeedback } = require('./lib/heys_sync_merge_v1.cjs');
const fs = require('fs');
const path = require('path');

const requestCapacityGuard = createServerlessCapacityGuard({ functionName: 'heys-api-rest' });

// Загрузка CA сертификата Yandex Cloud
const CA_CERT_PATH = path.join(__dirname, 'certs', 'root.crt');
const CA_CERT = fs.existsSync(CA_CERT_PATH) ? fs.readFileSync(CA_CERT_PATH, 'utf8') : null;

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P3: requireEnv — fail fast if env not set (no admin fallbacks!)
// ═══════════════════════════════════════════════════════════════════════════
function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`[FATAL] ${name} is missing`);
  }
  return v;
}

// 🛡️ Identity-pollution guards (added 2026-06-01 incident 4).
// REST POST /rest/client_kv_store шёл в обход guard'ов в heys-api-rpc:
// ловил только blacklist через safe_upsert_client_kv, идентификационных
// проверок не было. Теперь до записи проверяем cross-client _writerCid.
// Принимаем и unscoped, и scoped (heys_<UUID>_...) варианты — pollution
// чаще идёт через scoped формат при curator-switch (incident 2026-06-01 #5).
const IDENTITY_GUARD_KEY_RE = /^heys_(?:[0-9a-f-]{36}_)?(profile|norms|game|hr_zones|dayv2_\d{4}-\d{2}-\d{2})$/i;
function isIdentityGuardKey(k) {
  return typeof k === 'string' && IDENTITY_GUARD_KEY_RE.test(k);
}

const HUNGER_STATUS_EVENTS_KEY = 'heys_hunger_energy_status_events_v1';
function isHungerStatusEventsKey(key) {
  return String(key || '') === HUNGER_STATUS_EVENTS_KEY;
}
const INSIGHTS_FEEDBACK_KEY = 'heys_insights_feedback';
function isInsightsFeedbackKey(key) {
  return String(key || '') === INSIGHTS_FEEDBACK_KEY;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 SEC-024 v2 (2026-06-14): curator-JWT verify для cross-client read detection
// Inline copy от shared/auth-helpers.js verifyCuratorJwt (heys-api-rest НЕ имеет
// shared/ инфраструктуры). Алгоритм идентичен heys-api-auth/index.js:189+ HS256.
// payload schema: { sub: curator_id (uuid), email, role: 'curator', iat, exp }.
// ═══════════════════════════════════════════════════════════════════════════
function verifyCuratorJwt(token, jwtSecret) {
  if (!token || !jwtSecret) return { valid: false, error: 'missing-token-or-secret' };
  const crypto = require('crypto');
  const base64UrlDecode = (str) =>
    Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'malformed' };
    const [headerB64, payloadB64, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, error: 'invalid-signature' };
    }
    const payload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { valid: false, error: 'expired' };
    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message || 'parse-error' };
  }
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() !== name) continue;
    const raw = part.slice(eqIdx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch (_e) {
      return raw;
    }
  }
  return null;
}

// 🛡️ Content-fingerprint dup check для dayv2 (incident 2026-06-02 #8):
// ловит partial pollution где writer_cid правильный (свой) но meals
// идентичны свежей записи другого клиента того же curator. REST POST
// не имеет JWT curator context, поэтому curator_id резолвим из
// clients.curator_id по client_id.
async function detectCrossClientDayv2ContentDup(client, clientId, k, v) {
  const dateMatch = /^heys_(?:[0-9a-f-]{36}_)?dayv2_(\d{4}-\d{2}-\d{2})$/i.exec(k || '');
  if (!dateMatch) return null;
  const dateStr = dateMatch[1];
  if (!v || typeof v !== 'object') return null;
  const meals = v.meals;
  if (!Array.isArray(meals) || meals.length === 0) return null;
  // Overlap by meal_id / item_id (partial pollution check — incident #8).
  const mealIds = [];
  const itemIds = [];
  for (const m of meals) {
    if (m && typeof m === 'object') {
      if (typeof m.id === 'string' && m.id) mealIds.push(m.id);
      if (Array.isArray(m.items)) {
        for (const it of m.items) {
          if (it && typeof it.id === 'string' && it.id) itemIds.push(it.id);
        }
      }
    }
  }
  if (mealIds.length === 0 && itemIds.length === 0) return null;
  try {
    const r = await client.query(
      `WITH this_curator AS (
         SELECT curator_id FROM clients WHERE id = $1::uuid LIMIT 1
       )
       SELECT kv.client_id, kv.k
         FROM client_kv_store kv
         JOIN clients c ON c.id = kv.client_id
         JOIN this_curator tc ON c.curator_id = tc.curator_id
        WHERE kv.client_id != $1::uuid
          AND (kv.k = ('heys_dayv2_' || $2::text)
               OR kv.k LIKE ('heys_%_dayv2_' || $2::text))
          AND kv.updated_at > now() - interval '30 minutes'
          AND (
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(coalesce(kv.v->'meals','[]'::jsonb)) AS m
              WHERE m->>'id' = ANY($3::text[])
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(coalesce(kv.v->'meals','[]'::jsonb)) AS m,
                jsonb_array_elements(coalesce(m->'items','[]'::jsonb)) AS it
              WHERE it->>'id' = ANY($4::text[])
            )
          )
        LIMIT 1`,
      [clientId, dateStr, mealIds, itemIds]
    );
    if (r.rows.length > 0) return { conflictClientId: r.rows[0].client_id, conflictKey: r.rows[0].k };
  } catch (e) {
    console.warn('[REST content-dup] check failed:', e.message);
  }
  return null;
}

/**
 * 🛡️ validateContextForWriteRest (Phase A2, 2026-06-02) — REST POST
 * /rest/client_kv_store закрывает критическую дыру (anyone-can-POST without
 * auth). Когда client передаёт row.context_id, server валидирует его через
 * validate_write_context() и при mismatch переписывает row.client_id ←
 * context.client_id. Это THE CORE FIX для REST path — stale state c context_A
 * → write попадает в client A независимо от browser-supplied client_id.
 *
 * Phase B (default): warn-only — invalid/mismatched контексты логируются в
 * data_loss_audit, но write всё равно идёт (rerouted если client_id отличается).
 * Phase C (HEYS_WRITE_CONTEXT_STRICT=1): write блокируется при отсутствии
 * или невалидности context — REST POST требует context_id как первый
 * capability-based auth для этого endpoint'а.
 *
 * Returns { ok, status, effectiveClientId }.
 */
async function validateContextForWriteRest(client, ctxId, suppliedClientId, k) {
  const STRICT_MODE = process.env.HEYS_WRITE_CONTEXT_STRICT === '1';
  const auditKey = (typeof k === 'string' && k.length > 0) ? k.slice(0, 200) : '<rest>';

  if (!ctxId) {
    if (STRICT_MODE) {
      try {
        await client.query(
          `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
           VALUES ($1::uuid, $2::text, 'context_required', FALSE, 'rest_strict')`,
          [suppliedClientId, auditKey]
        );
      } catch (_) { /* noop */ }
      return { ok: false, status: 'context_required', effectiveClientId: suppliedClientId };
    }
    // SEC-004 (2026-06-14): Phase B+ — warn-only теперь ЛОГИРУЕТ no-context cases,
    // а не пропускает silent (как раньше). Это pre-flip ratchet: запускаем
    // мониторинг 7 дней, если 0 событий `context_missing_warn` → flip STRICT=1
    // безопасен; иначе видим какие endpoints/клиенты ещё посылают без context_id
    // (старые билды) и обновляем перед flip. allowed=true потому что write
    // продолжает идти (не блокируется).
    try {
      await client.query(
        `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
         VALUES ($1::uuid, $2::text, 'context_missing_warn', TRUE, 'rest_phase_b')`,
        [suppliedClientId, auditKey]
      );
    } catch (_) { /* noop */ }
    return { ok: true, status: 'no_context_phase_b', effectiveClientId: suppliedClientId };
  }

  let row;
  try {
    const r = await client.query(
      'SELECT * FROM validate_write_context($1::uuid, NULL, NULL)', [ctxId]
    );
    row = r.rows[0];
  } catch (e) {
    console.warn('[REST write-context] validate query failed:', e.message);
    return { ok: true, status: 'validation_db_error', effectiveClientId: suppliedClientId };
  }

  if (!row || !row.ok) {
    try {
      await client.query(
        `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
         VALUES ($1::uuid, $2::text, 'context_mismatch', $3::boolean, $4)`,
        [suppliedClientId, auditKey, !STRICT_MODE,
          (row?.status || 'unknown') + '_rest']
      );
    } catch (_) { /* noop */ }
    if (STRICT_MODE) {
      return { ok: false, status: row?.status || 'context_invalid', effectiveClientId: suppliedClientId };
    }
    return { ok: true, status: row?.status || 'context_invalid_warn', effectiveClientId: suppliedClientId };
  }

  const ctxClientId = row.client_id;
  if (suppliedClientId && String(suppliedClientId) !== String(ctxClientId)) {
    try {
      await client.query(
        `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
         VALUES ($1::uuid, $2::text, 'context_rerouted', TRUE, $3)`,
        [ctxClientId, auditKey,
          `rest_post browser=${String(suppliedClientId).slice(0, 8)} context=${String(ctxClientId).slice(0, 8)}`]
      );
    } catch (_) { /* noop */ }
    return { ok: true, status: 'rerouted', effectiveClientId: ctxClientId };
  }
  return { ok: true, status: 'ok', effectiveClientId: suppliedClientId };
}

const _tgAlertLastSent = new Map();
const TG_ALERT_DEDUP_MS = 5 * 60 * 1000;
// Per-action dedupe overrides — для cross-client pollution events ставим
// 30 сек чтобы видеть каждый burst в real-time. Symmetric к heys-api-rpc.
const TG_ALERT_DEDUP_BY_ACTION = {
  cross_client_dayv2_content_dup: 30 * 1000,
  cross_client_profile_blocked:   30 * 1000,
  cross_client_blob_blocked:      30 * 1000,
};
function shouldSendTgAlert(clientId, action) {
  const key = `${clientId}:${action}`;
  const now = Date.now();
  const last = _tgAlertLastSent.get(key) || 0;
  const ttl = TG_ALERT_DEDUP_BY_ACTION[action] || TG_ALERT_DEDUP_MS;
  if (now - last < ttl) return false;
  _tgAlertLastSent.set(key, now);
  return true;
}
function sendTgAlertFireAndForget(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  const body = JSON.stringify({ chat_id: chatId, text: text.slice(0, 3800), parse_mode: 'Markdown' });
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch((err) => console.warn('[tg-alert] send failed:', err.message));
}

// PG config loaded lazily inside handler (after OPTIONS check)
// This allows CORS preflight to work even if DB env is misconfigured
let PG_CONFIG = null;

function getPgConfig() {
  if (!PG_CONFIG) {
    PG_CONFIG = {
      host: requireEnv('PG_HOST'),
      port: Number(requireEnv('PG_PORT')),
      database: requireEnv('PG_DATABASE'),
      user: requireEnv('PG_USER'),
      password: requireEnv('PG_PASSWORD'),
      ssl: CA_CERT ? {
        rejectUnauthorized: true,
        ca: CA_CERT
      } : {
        rejectUnauthorized: false
      }
    };
  }
  return PG_CONFIG;
}

const ALLOW_LOCALHOST_ORIGINS = process.env.ALLOW_LOCALHOST_ORIGINS === '1';
const ALLOWED_ORIGINS = [
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'https://heys-v2-web.vercel.app',
  ...(ALLOW_LOCALHOST_ORIGINS ? [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ] : []),
];

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P3: Tables whitelist
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_TABLES = [
  'shared_products',
  'shared_products_blocklist', // Blocklist куратора (read-only)
  'shared_products_pending',   // Pending products для модерации куратором (PATCH/DELETE)
  'client_kv_store',           // KV store для данных клиентов (куратор sync)
  'client_change_markers',     // Change markers для hot-sync (куратор read-only)
  'client_log_trace',          // Клиентский console buffer → батчевый insert (write-only с мобильных)
  // ❌ shared_products_public — REMOVED: VIEW uses auth.uid() which doesn't exist in YC
  // ❌ clients — removed (PII: phone_normalized, managed via /auth/clients)
  // ❌ kv_store — removed (writes via RPC only)
  // ❌ consents — removed (sensitive, use RPC by_session)
];

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P1 SECURITY: Column whitelist per table (prevents SQL injection via select)
// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P3: Column whitelist (matches reduced ALLOWED_TABLES + real DB schema)
// ⚠️  ВАЖНО: shared_products_public VIEW uses auth.uid() — NOT AVAILABLE in YC!
const ALLOWED_COLUMNS = {
  // shared_products (table) — публичные колонки (без created_by_* для "public view" логики)
  // Для "public API" клиенты запрашивают select=id,name,... БЕЗ авторства
  // ⚠️  Колонки в lowercase! (badfat100, goodfat100 — NOT camelCase)
  shared_products: [
    'id', 'name', 'brand', 'brand_fingerprint', 'name_norm', 'fingerprint',
    'barcode', 'barcodes', 'variant_of',
    'simple100', 'complex100', 'protein100', 'badfat100', 'goodfat100', 'trans100', 'fiber100',
    'gi', 'harm', 'category', 'portions', 'description',
    'sodium100', 'omega3_100', 'omega6_100', 'nova_group', 'additives', 'nutrient_density',
    'is_organic', 'is_whole_grain', 'is_fermented', 'is_raw',
    'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
    'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
    'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine',
    'created_at', 'updated_at'
    // ❌ created_by_user_id, created_by_client_id — REMOVED: авторство скрыто от публичного API
  ],
  // shared_products_blocklist (table) — composite PK (curator_id, product_id)
  shared_products_blocklist: ['curator_id', 'product_id', 'created_at'],
  // shared_products_pending (table) — pending products for curator review (read-only via REST)
  // ⚠️  Все поля продукта внутри product_data JSONB! Не раскрываем на уровне SQL.
  shared_products_pending: [
    'id', 'curator_id', 'client_id', 'product_data', 'name_norm', 'fingerprint', 'barcode', 'barcodes',
    'status', 'reject_reason', 'created_at', 'moderated_at', 'moderated_by'
  ],
  // client_kv_store (table) — KV storage для данных клиентов (куратор sync)
  // `revision` added 2026-06-03 (L2): curator hot-sync reads per-row server revision.
  client_kv_store: ['user_id', 'client_id', 'k', 'v', 'updated_at', 'revision'],
  // client_change_markers — hot-sync change detection (read-only)
  // `changed_revision` added 2026-06-03 (L2): per-scope server-revision high-watermark.
  client_change_markers: ['client_id', 'scope', 'changed_at', 'changed_revision'],
  // client_log_trace — клиентский console buffer (см. миграцию 2026-06-01)
  client_log_trace: ['id', 'client_id', 'captured_at', 'client_ts', 'level', 'message', 'args', 'session_id', 'user_agent', 'page_url'],
  // ❌ shared_products_public — REMOVED: VIEW uses auth.uid() which doesn't exist in YC
  // ❌ clients, kv_store, shared_products_pending, consents — removed
};

/**
 * 🔐 Валидация и санитизация списка колонок для SELECT
 * @param {string} selectParam - строка из query param (например "id,name,value")
 * @param {string} tableName - имя таблицы
 * @returns {string|null} - безопасный SQL список колонок или null если невалидно
 */
function sanitizeSelectColumns(selectParam, tableName) {
  const allowedForTable = ALLOWED_COLUMNS[tableName];

  // 🔐 Таблица должна быть в whitelist колонок (не разрешаем * для unknown таблиц)
  if (!allowedForTable) {
    console.error(`[REST] No column whitelist for table: "${tableName}"`);
    return null;
  }

  // '*' → возвращаем все разрешённые колонки (а не SQL *)
  if (!selectParam || selectParam === '*') {
    return allowedForTable.map(c => `"${c}"`).join(', ');
  }

  // Парсим список колонок
  const requestedColumns = selectParam.split(',').map(c => c.trim()).filter(c => c.length > 0);

  // 🔐 Пустой список после фильтрации — ошибка (select= без колонок)
  if (requestedColumns.length === 0) {
    console.error(`[REST] Empty column list after parsing: "${selectParam}"`);
    return null;
  }

  // Валидируем каждую колонку
  const validColumns = [];
  for (const col of requestedColumns) {
    // Базовая regex проверка: только буквы, цифры, underscore
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
      console.error(`[REST] Invalid column name rejected: "${col}"`);
      return null; // Подозрительный символ — отклоняем весь запрос
    }

    // Проверяем whitelist
    if (!allowedForTable.includes(col)) {
      console.error(`[REST] Column not in whitelist: "${col}" for table "${tableName}"`);
      return null; // Колонка не в whitelist — отклоняем
    }

    validColumns.push(`"${col}"`);
  }

  // Все колонки провалидированы
  return validColumns.join(', ');
}

function getCorsHeaders(origin) {
  const headers = {
    // 🔐 CORS: All REST methods allowed (GET/POST/PATCH/DELETE)
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer, apikey',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    'Vary': 'Origin',  // 🔐 Важно для кэширования
    // 🔒 Security headers
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // SEC-005 (2026-06-08): CSP на JSON-ответ — defense-in-depth (см. auth-функцию).
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  };

  // 🔐 Только разрешённые origin получают ACAO
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  // Без Origin (серверный запрос) — не блокируем
  // С неразрешённым Origin — браузер заблокирует

  return headers;
}

function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

async function handleRestRequest(event, context) {
  await initSecrets();
  const origin = event.headers?.origin || event.headers?.Origin || null;
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  // 🔐 P0: Explicit 403 for disallowed browser origins
  // Server-to-server (origin === null) is allowed
  if (origin && !isAllowedOrigin(origin)) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json',
        'Vary': 'Origin',
        // 🔐 Минимальные CORS headers для диагностики (браузер покажет 403 вместо "CORS error")
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: JSON.stringify({ error: 'cors_denied' })
    };
  }

  // 🛡️ SEC-018 (2026-06-08): Body size limit — защита от DoS/OOM через гигантский JSON.
  // 512 KB покрывает реалистичный batch upsert client_kv_store (десятки meals/products).
  // Аналог heys-api-rpc/index.js:1517-1518 (256 KB там). REST допускает больше из-за batch'ей.
  const MAX_BODY_BYTES = 512 * 1024;
  if (event.body && typeof event.body === 'string' && Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    return {
      statusCode: 413,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Payload too large' })
    };
  }

  // Debug: логируем структуру event для диагностики
  console.log('[REST Debug] Event:', JSON.stringify({
    path: event.path,
    pathParameters: event.pathParameters,
    params: event.params,
    queryStringParameters: event.queryStringParameters,
    httpMethod: event.httpMethod
  }));

  // Получаем имя таблицы из path (единственный поддерживаемый способ)
  // 1. pathParameters.table (Yandex API Gateway path param {table})
  // 2. path /rest/TABLE_NAME или /rest/v1/TABLE_NAME (парсинг пути)
  // ❌ queryStringParameters.table — REMOVED (legacy, security risk)
  // ✅ params.table — YC API Gateway format (path parameters)
  // ✅ pathParameters.table — AWS/Supabase format (fallback)
  let tableName = event.params?.table || event.pathParameters?.table;

  // Если не нашли в параметрах, парсим из path
  // Поддерживаем оба формата: /rest/table и /rest/v1/table (Supabase SDK)
  if (!tableName && event.path) {
    const pathMatch = event.path.match(/\/rest(?:\/v1)?\/([a-zA-Z_]+)/);
    if (pathMatch) {
      tableName = pathMatch[1];
    }
  }

  if (!tableName) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing table name', debug: { path: event.path, pathParameters: event.pathParameters } })
    };
  }

  // 🔐 Проверяем что таблица разрешена
  // Возвращаем 404 (не 403) — security through obscurity, не раскрываем структуру БД
  if (!ALLOWED_TABLES.includes(tableName)) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Not found' })
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔐 P1.1 + P3: EARLY VALIDATION — все проверки входа ДО подключения к БД
  // Fail fast: не тратим ресурсы на connect если input невалидный
  // ═══════════════════════════════════════════════════════════════════════════

  const method = event.httpMethod;

  // 🔐 P3.1: Разрешённые таблицы для записи (POST/PATCH/DELETE)
  // Остальные таблицы — read-only (только GET)
  const WRITE_ALLOWED_TABLES = [
    'client_kv_store',           // Куратор sync
    'shared_products_pending',   // Модерация продуктов куратором
    'shared_products',           // Админ-удаление/правки shared продуктов
    'client_log_trace'           // Клиентский console batch insert (write-only с мобильных)
  ];
  const isWriteAllowed = WRITE_ALLOWED_TABLES.includes(tableName);

  if (method !== 'GET' && !isWriteAllowed) {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed. REST API is read-only. Use RPC for writes.' })
    };
  }

  // Разрешённые методы для writable tables
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Method ${method} not allowed.` })
    };
  }

  // Для GET: валидируем select columns ДО подключения к БД
  let selectColumns = null;
  if (method === 'GET') {
    const rawSelect = event.queryStringParameters?.select || '*';
    selectColumns = sanitizeSelectColumns(rawSelect, tableName);
    if (selectColumns === null) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid select columns — contains forbidden characters or unknown columns' })
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Только теперь подключаемся к БД через connection pool (все валидации пройдены)
  // ═══════════════════════════════════════════════════════════════════════════
  const pool = getPool();
  const client = await pool.connect();

  try {

    let result;

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔐 SEC-023 hot-fix 2026-06-14: anon read-block для client_kv_store.
    // До hot-fix: GET /rest/client_kv_store?client_id=eq.<UUID>&k=eq.heys_profile
    //   возвращал PII любого клиента **без любого** Authorization-header (anon).
    // Live-проба 2026-06-14: 557 ключей Александры читались anon curl'ом.
    //
    // Архитектурный контекст: YandexAPI.rest() (apps/web/heys_yandex_api_v1.js:401)
    //   шлёт fetch БЕЗ Authorization header по дизайну. Поэтому реализуем
    //   capability-style auth: клиент-side добавит `X-Session-Token` к /rest fetch'ам,
    //   server резолвит → определяет authedClientId → блок при mismatch.
    //
    // Ratchet (как SEC-004 Phase B):
    //   HEYS_REST_READ_STRICT=0 (warn): audit-log + пропуск (НЕ ломаем legacy
    //     клиентов которые ещё не передают X-Session-Token).
    //   HEYS_REST_READ_STRICT=1 (strict): mismatch/no-auth → 401/403.
    // ═══════════════════════════════════════════════════════════════════════════
    async function enforceClientKvAuthForGet(event, qParams) {
      const READ_STRICT = process.env.HEYS_REST_READ_STRICT === '1';
      const requestedRaw = qParams.client_id;
      let requestedCid = null;
      if (typeof requestedRaw === 'string') {
        requestedCid = requestedRaw.startsWith('eq.') ? requestedRaw.slice(3) : requestedRaw;
      } else if (typeof qParams['eq.client_id'] === 'string') {
        requestedCid = qParams['eq.client_id'];
      }

      const h = event.headers || {};
      const auth = h.Authorization || h.authorization || '';
      let token = null;
      if (auth.startsWith('Bearer ')) token = auth.slice(7).trim();
      const xs = h['X-Session-Token'] || h['x-session-token'] || '';
      if (!token && xs) token = String(xs).trim();
      if (!token) {
        token = getCookieValue(h.cookie || h.Cookie || '', 'heys_session_token');
      }
      if (!token) {
        token = getCookieValue(h.cookie || h.Cookie || '', 'heys_curator_jwt');
      }
      // Heuristic: JWT (3 dot-separated parts) — это curator JWT, который
      // может прийти как legacy Authorization bearer или как HttpOnly cookie.
      const isJwt = token && token.split('.').length === 3;
      const sessionToken = (token && !isJwt) ? token : null;

      let authedCid = null;
      if (sessionToken) {
        try {
          const r = await client.query(
            'SELECT client_id FROM client_sessions WHERE token_hash = sha256($1::bytea) AND expires_at > now() AND revoked_at IS NULL LIMIT 1',
            [sessionToken]
          );
          authedCid = r.rows[0]?.client_id || null;
        } catch (_) { /* swallow */ }
      }

      async function audit(action, allowed, reason) {
        try {
          await client.query(
            `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
             VALUES ($1::uuid, $2::text, $3::text, $4::boolean, $5)`,
            [
              authedCid || requestedCid || '00000000-0000-0000-0000-000000000000',
              String(qParams.k || qParams['eq.k'] || '<list>').slice(0, 200),
              action, allowed, reason
            ]
          );
        } catch (_) { /* noop */ }
      }

      // Case 1: no auth header at all
      if (!sessionToken && !isJwt) {
        if (READ_STRICT) {
          await audit('rest_read_no_auth_blocked', false, 'session_token_required');
          return { decision: 'block', status: 401, body: { error: 'session_token_required' } };
        }
        await audit('rest_read_no_auth_warn', true, 'phase_b');
        return { decision: 'allow', warn: true };
      }
      // Case 2: JWT (curator path) — SEC-024 v2 (2026-06-14): полный verify.
      // verifyCuratorJwt → если invalid/expired → 401 (strict) или warn.
      // Если valid → payload.sub = curator_id, SELECT clients WHERE curator_id=$1
      // → allowedCids set, проверяем что requestedCid в нём.
      if (isJwt) {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          // env-misconfig — fail-open warn (defense lost, но не ломаем endpoint).
          await audit('rest_read_curator_jwt_no_secret', true, 'env_misconfig');
          return { decision: 'allow', warn: true };
        }
        const verifyResult = verifyCuratorJwt(token, jwtSecret);
        if (!verifyResult.valid) {
          if (READ_STRICT) {
            await audit('rest_read_curator_jwt_blocked', false, verifyResult.error);
            return { decision: 'block', status: 401, body: { error: 'invalid_curator_jwt', detail: verifyResult.error } };
          }
          await audit('rest_read_curator_jwt_invalid_warn', true, verifyResult.error);
          return { decision: 'allow', warn: true };
        }
        const payload = verifyResult.payload || {};
        if (payload.role !== 'curator') {
          if (READ_STRICT) {
            await audit('rest_read_curator_role_blocked', false, `role=${payload.role || 'null'}`);
            return { decision: 'block', status: 403, body: { error: 'curator_role_required' } };
          }
          await audit('rest_read_curator_role_warn', true, `role=${payload.role || 'null'}`);
          return { decision: 'allow', warn: true };
        }
        const curatorId = payload.sub;
        if (!curatorId) {
          if (READ_STRICT) {
            await audit('rest_read_curator_no_sub_blocked', false, 'missing_sub');
            return { decision: 'block', status: 401, body: { error: 'invalid_curator_jwt' } };
          }
          await audit('rest_read_curator_no_sub_warn', true, 'missing_sub');
          return { decision: 'allow', warn: true };
        }
        // Если запрос без client_id (list/filter без cid) — kurator может видеть
        // всех своих, но фильтра нет → не определимо. Logging-only.
        if (!requestedCid) {
          await audit('rest_read_curator_no_filter_warn', true, `curator=${String(curatorId).slice(0,8)}`);
          return { decision: 'allow', warn: true };
        }
        // Проверяем что requestedCid принадлежит этому куратору.
        let owns = false;
        try {
          const r = await client.query(
            'SELECT 1 FROM clients WHERE id = $1::uuid AND curator_id = $2::uuid LIMIT 1',
            [requestedCid, curatorId]
          );
          owns = r.rowCount > 0;
        } catch (_) { /* swallow */ }
        if (!owns) {
          if (READ_STRICT) {
            await audit('rest_read_curator_cross_client_blocked', false,
              `curator=${String(curatorId).slice(0,8)} requested=${String(requestedCid).slice(0,8)}`);
            return { decision: 'block', status: 403, body: { error: 'cross_client_forbidden' } };
          }
          await audit('rest_read_curator_cross_client_warn', true,
            `curator=${String(curatorId).slice(0,8)} requested=${String(requestedCid).slice(0,8)}`);
          return { decision: 'allow', warn: true };
        }
        // OK — kurator владеет этим client_id
        return { decision: 'allow', warn: false };
      }
      // Case 3: session_token но invalid/expired
      if (!authedCid) {
        if (READ_STRICT) {
          await audit('rest_read_invalid_session_blocked', false, 'invalid_session');
          return { decision: 'block', status: 401, body: { error: 'invalid_or_expired_session' } };
        }
        await audit('rest_read_invalid_session_warn', true, 'phase_b');
        return { decision: 'allow', warn: true };
      }
      // Case 4: session_token валиден — сравниваем с requestedCid
      if (requestedCid && String(requestedCid).toLowerCase() !== String(authedCid).toLowerCase()) {
        if (READ_STRICT) {
          await audit('rest_read_cross_client_blocked', false,
            `authed=${String(authedCid).slice(0,8)} requested=${String(requestedCid).slice(0,8)}`);
          return { decision: 'block', status: 403, body: { error: 'cross_client_forbidden' } };
        }
        await audit('rest_read_cross_client_warn', true,
          `authed=${String(authedCid).slice(0,8)} requested=${String(requestedCid).slice(0,8)}`);
        return { decision: 'allow', warn: true };
      }
      // OK — own client or no requestedCid filter
      return { decision: 'allow', warn: false };
    }

    switch (method) {
      case 'GET': {
        // Простой SELECT с фильтрами из query params
        const params = { ...event.queryStringParameters };
        delete params.table;
        delete params.select; // Уже обработано выше

        // 🔐 SEC-023 auth-check для client_kv_store
        if (tableName === 'client_kv_store') {
          const authDecision = await enforceClientKvAuthForGet(event, params);
          if (authDecision.decision === 'block') {
            return {
              statusCode: authDecision.status,
              headers: corsHeaders,
              body: JSON.stringify(authDecision.body)
            };
          }
        }

        // selectColumns уже валидированы и санитизированы выше (early validation)
        let query = `SELECT ${selectColumns} FROM "${tableName}"`;
        const conditions = [];
        const values = [];
        let i = 1;

        for (const [key, value] of Object.entries(params)) {
          // Поддержка ДВУХ форматов:
          // 1. PostgREST style: field=eq.value (value начинается с оператора)
          // 2. Supabase-like: eq.field=value (key начинается с оператора)

          // Формат 2: eq.field=value, gt.field=value, etc.
          if (key.startsWith('eq.')) {
            const fieldName = key.replace('eq.', '');
            conditions.push(`"${fieldName}" = $${i++}`);
            values.push(value);
          } else if (key.startsWith('neq.')) {
            const fieldName = key.replace('neq.', '');
            conditions.push(`"${fieldName}" != $${i++}`);
            values.push(value);
          } else if (key.startsWith('gt.')) {
            const fieldName = key.replace('gt.', '');
            conditions.push(`"${fieldName}" > $${i++}`);
            values.push(value);
          } else if (key.startsWith('lt.')) {
            const fieldName = key.replace('lt.', '');
            conditions.push(`"${fieldName}" < $${i++}`);
            values.push(value);
          } else if (key.startsWith('gte.')) {
            const fieldName = key.replace('gte.', '');
            conditions.push(`"${fieldName}" >= $${i++}`);
            values.push(value);
          } else if (key.startsWith('lte.')) {
            const fieldName = key.replace('lte.', '');
            conditions.push(`"${fieldName}" <= $${i++}`);
            values.push(value);
          } else if (key.startsWith('like.')) {
            const fieldName = key.replace('like.', '');
            const actualValue = value.replace(/\*/g, '%');
            conditions.push(`"${fieldName}" ILIKE $${i++}`);
            values.push(actualValue);
          } else if (key.startsWith('ilike.')) {
            // Support ilike.field=value format (case-insensitive search)
            const fieldName = key.replace('ilike.', '');
            const actualValue = value.replace(/\*/g, '%');
            conditions.push(`"${fieldName}" ILIKE $${i++}`);
            values.push(actualValue);
          } else if (key.startsWith('in.')) {
            const fieldName = key.replace('in.', '');
            const inValues = value.replace(/^\(|\)$/g, '').split(',');
            const placeholders = inValues.map(() => `$${i++}`).join(', ');
            conditions.push(`"${fieldName}" IN (${placeholders})`);
            values.push(...inValues);
          } else if (key.startsWith('contains.')) {
            const fieldName = key.replace('contains.', '');
            conditions.push(`"${fieldName}" @> ARRAY[$${i++}]::text[]`);
            values.push(value);
          } else if (key.startsWith('is.')) {
            const fieldName = key.replace('is.', '');
            if (value === 'null') {
              conditions.push(`"${fieldName}" IS NULL`);
            } else if (value === 'true') {
              conditions.push(`"${fieldName}" = true`);
            } else if (value === 'false') {
              conditions.push(`"${fieldName}" = false`);
            }
          }
          // Формат 1: field=eq.value (value начинается с оператора)
          else if (typeof value === 'string' && value.startsWith('eq.')) {
            const actualValue = value.replace('eq.', '');
            conditions.push(`"${key}" = $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('neq.')) {
            const actualValue = value.replace('neq.', '');
            conditions.push(`"${key}" != $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('gt.')) {
            const actualValue = value.replace('gt.', '');
            conditions.push(`"${key}" > $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('lt.')) {
            const actualValue = value.replace('lt.', '');
            conditions.push(`"${key}" < $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('gte.')) {
            const actualValue = value.replace('gte.', '');
            conditions.push(`"${key}" >= $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('lte.')) {
            const actualValue = value.replace('lte.', '');
            conditions.push(`"${key}" <= $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && (value.startsWith('like.') || value.startsWith('ilike.'))) {
            const actualValue = value.replace(/^(i?like)\./, '').replace(/\*/g, '%');
            conditions.push(`"${key}" ILIKE $${i++}`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('in.')) {
            // IN operator: in.(val1,val2,val3)
            const inValues = value.replace('in.', '').replace(/^\(|\)$/g, '').split(',');
            const placeholders = inValues.map(() => `$${i++}`).join(', ');
            conditions.push(`"${key}" IN (${placeholders})`);
            values.push(...inValues);
          } else if (typeof value === 'string' && value.startsWith('contains.')) {
            const actualValue = value.replace('contains.', '');
            conditions.push(`"${key}" @> ARRAY[$${i++}]::text[]`);
            values.push(actualValue);
          } else if (typeof value === 'string' && value.startsWith('is.')) {
            const actualValue = value.replace('is.', '');
            if (actualValue === 'null') {
              conditions.push(`"${key}" IS NULL`);
            } else if (actualValue === 'true') {
              conditions.push(`"${key}" = true`);
            } else if (actualValue === 'false') {
              conditions.push(`"${key}" = false`);
            }
          } else if (!['order', 'limit', 'offset'].includes(key)) {
            // Простое равенство без оператора
            conditions.push(`"${key}" = $${i++}`);
            values.push(value);
          }
        }

        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }

        if (params.order) {
          // Strict whitelist: column[.asc|.desc] where column is [a-zA-Z_][a-zA-Z0-9_]*.
          // Prevents SQL injection via ORDER BY (subqueries, comments, multi-statement, etc.).
          const orderMatch = String(params.order).match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\.(asc|desc))?$/);
          if (orderMatch) {
            const orderCol = orderMatch[1];
            const orderDir = orderMatch[3] === 'desc' ? 'DESC' : 'ASC';
            query += ` ORDER BY "${orderCol}" ${orderDir}`;
          }
        }

        if (params.limit) {
          query += ` LIMIT ${parseInt(params.limit)}`;
        }

        if (params.offset) {
          query += ` OFFSET ${parseInt(params.offset)}`;
        }

        result = await client.query(query, values);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(result.rows)
        };
      }

      // 🔐 P3.1: POST — INSERT/UPSERT для client_kv_store (supports batch: array of objects)
      case 'POST': {
        if (!isWriteAllowed) {
          return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'POST not allowed for this table.' })
          };
        }

        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const params = event.queryStringParameters || {};

        // [DEBUG] Log request summary (не полный body чтобы не захламлять логи)
        const rowsPreview = Array.isArray(body) ? body.length : 1;
        console.log('[REST POST REQUEST]', { table: tableName, rows: rowsPreview, params: Object.keys(params) });

        // 📝 client_log_trace — батчевый INSERT клиентского console buffer.
        // Никакой авторизации/UPSERT: append-only, TTL 14 дней (heys-maintenance).
        // Жёсткие лимиты чтобы public POST не превратился в DoS-вектор.
        if (tableName === 'client_log_trace') {
          const MAX_ROWS_PER_BATCH = 500;
          const MAX_MSG_LEN = 4000;
          const MAX_ARGS_BYTES = 8000;
          const MAX_UA_LEN = 500;
          const MAX_URL_LEN = 1000;
          const MAX_SESSION_LEN = 100;
          const LEVELS = new Set(['log', 'info', 'warn', 'error', 'debug']);

          const rawRows = Array.isArray(body) ? body : [body];
          if (rawRows.length === 0) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Empty body' })
            };
          }
          if (rawRows.length > MAX_ROWS_PER_BATCH) {
            return {
              statusCode: 413,
              headers: corsHeaders,
              body: JSON.stringify({ error: `Batch too large (max ${MAX_ROWS_PER_BATCH})` })
            };
          }

          // UA / URL — общие для batch'a (берём из заголовков fallback)
          const headerUA = (event.headers?.['User-Agent'] || event.headers?.['user-agent'] || '').slice(0, MAX_UA_LEN);

          const cols = ['client_id', 'client_ts', 'level', 'message', 'args', 'session_id', 'user_agent', 'page_url'];
          const values = [];
          const placeholders = [];
          let p = 1;
          let inserted = 0;
          let skipped = 0;

          for (const row of rawRows) {
            const lvl = LEVELS.has(row.level) ? row.level : 'log';
            const msg = typeof row.message === 'string' ? row.message.slice(0, MAX_MSG_LEN) : String(row.message ?? '').slice(0, MAX_MSG_LEN);
            if (!msg) { skipped++; continue; }
            // client_id: optional, ignore malformed (не блокируем batch)
            const cid = (typeof row.client_id === 'string' && /^[0-9a-f-]{32,36}$/i.test(row.client_id)) ? row.client_id : null;
            // client_ts: optional, default now()
            let cts = row.client_ts ? new Date(row.client_ts) : new Date();
            if (Number.isNaN(cts.getTime())) cts = new Date();
            // args: cap by serialized size
            let argsJson = null;
            if (row.args != null) {
              try {
                const s = JSON.stringify(row.args);
                argsJson = s.length > MAX_ARGS_BYTES ? JSON.stringify({ _truncated: true, _origLen: s.length, preview: s.slice(0, 2000) }) : s;
              } catch (_) { argsJson = null; }
            }
            const sid = typeof row.session_id === 'string' ? row.session_id.slice(0, MAX_SESSION_LEN) : null;
            const ua = (typeof row.user_agent === 'string' ? row.user_agent : headerUA).slice(0, MAX_UA_LEN);
            const url = typeof row.page_url === 'string' ? row.page_url.slice(0, MAX_URL_LEN) : null;

            placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++}, $${p++}, $${p++})`);
            values.push(cid, cts.toISOString(), lvl, msg, argsJson, sid, ua, url);
            inserted++;
          }

          if (inserted === 0) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'No valid rows', skipped })
            };
          }

          const query = `INSERT INTO "client_log_trace" (${cols.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders.join(', ')}`;
          await client.query(query, values);

          console.log('[REST POST client_log_trace]', { inserted, skipped, total: rawRows.length });

          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ success: true, inserted, skipped })
          };
        }

        // 🛡️ DATA LOSS PROTECTION: Для client_kv_store используем защищённые функции!
        if (tableName === 'client_kv_store') {
          const rows = Array.isArray(body) ? body : [body];

          if (rows.length === 0) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ error: 'Empty body' })
            };
          }

          let processed = 0;
          let blocked = 0;
          // 🛡️ Track blocked keys with their reason so client can call
          // _dropRejectedKey → clear stale LS + trigger reload. Без этого
          // REST POST полюция остаётся в LS даже после server reject (UI
          // показывает stale данные до hard-reload).
          const blockedItems = [];
          const payloadBlockedItems = [];

          for (const row of rows) {
            if (!row.client_id || !row.k) {
              console.warn('[REST POST] Missing client_id or k in row:', row);
              continue;
            }

            // 🛡️ Write context validation + reroute (Phase A2/B, 2026-06-02).
            // Если row.context_id присутствует, server валидирует и при mismatch
            // переписывает row.client_id ← context.client_id. THE CORE FIX для
            // REST POST: первая capability-based auth для endpoint'a где раньше
            // вообще не было auth (anyone-can-POST gap).
            {
              const ctxResult = await validateContextForWriteRest(
                client, row.context_id || null, row.client_id, row.k
              );
              if (!ctxResult.ok) {
                blocked++;
                blockedItems.push({ k: row.k, reason: ctxResult.status });
                continue; // strict mode reject
              }
              row.client_id = ctxResult.effectiveClientId;
              // Strip context_id из row — это transport metadata, не данные.
              delete row.context_id;
            }

            // 🛡️ Identity-pollution guard (incident 2026-06-01 #4): incoming
            // _writerCid должен совпадать с client_id (owner of row). Ловит
            // cross-client write от curator switch'ей где stale React state
            // одного клиента ре-tag'ается правильным writerCid и улетает
            // под другой scope. RPC path уже гейтится (commit 5df98732),
            // но REST шёл в обход — закрываем дыру здесь.
            // [DEBUG #5]: для каждого guarded key логируем что пришло.
            if (isIdentityGuardKey(row.k)) {
              const vType = typeof row.v;
              const vIsArr = Array.isArray(row.v);
              const vKeys = (row.v && vType === 'object' && !vIsArr) ? Object.keys(row.v).slice(0, 12) : null;
              const wc = (row.v && vType === 'object' && !vIsArr) ? row.v._writerCid : null;
              console.log('[GUARD-DEBUG]', JSON.stringify({
                k: row.k,
                client: String(row.client_id).slice(0, 8),
                vType,
                vIsArr,
                vKeysCount: vKeys ? Object.keys(row.v).length : null,
                vKeysSample: vKeys,
                writerCid: wc ? String(wc).slice(0, 8) : null,
                hasMeals: row.v && Array.isArray(row.v.meals) ? row.v.meals.length : null,
              }));
            }
            if (isIdentityGuardKey(row.k) && row.v && typeof row.v === 'object' &&
                row.v._writerCid && String(row.v._writerCid) !== String(row.client_id)) {
              const auditAction = (row.k === 'heys_profile')
                ? 'cross_client_profile_blocked'
                : 'cross_client_blob_blocked';
              blocked++;
              blockedItems.push({ k: row.k, reason: auditAction });
              const incomingWriter = String(row.v._writerCid).slice(0, 8);
              const expectedWriter = String(row.client_id).slice(0, 8);
              console.warn(`[REST POST] 🛡️ ${auditAction}:`, row.k,
                'incoming_writer=', incomingWriter, 'expected=', expectedWriter);
              // Forensic snapshot для profile + audit + TG alert.
              let snapshotId = null;
              if (row.k === 'heys_profile') {
                try {
                  const prevR = await client.query(
                    'SELECT v FROM client_kv_store WHERE client_id = $1::uuid AND k = $2::text',
                    [row.client_id, row.k]
                  );
                  const prev = prevR.rows[0]?.v || {};
                  const snapR = await client.query(
                    `INSERT INTO profile_snapshots (client_id, prev_v, new_v, reason, writer_cid)
                     VALUES ($1::uuid, $2::jsonb, $3::jsonb, 'cross_client_blocked', $4)
                     RETURNING id`,
                    [row.client_id, JSON.stringify(prev), JSON.stringify(row.v), row.v._writerCid || null]
                  );
                  snapshotId = snapR.rows[0]?.id;
                } catch (e) {
                  console.warn('[REST POST] snapshot insert failed:', e.message);
                }
              }
              try {
                await client.query(
                  `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
                   VALUES ($1::uuid, $2::text, $3::text, FALSE, $4)`,
                  [row.client_id, row.k, auditAction,
                    `rest_post incoming_writer=${incomingWriter} expected=${expectedWriter}`]
                );
              } catch (e) {
                console.warn('[REST POST] audit insert failed:', e.message);
              }
              if (shouldSendTgAlert(row.client_id, auditAction)) {
                sendTgAlertFireAndForget(
                  `🛡️ *${auditAction}*\n` +
                  `key: \`${row.k}\`\n` +
                  `client: \`${expectedWriter}\`\n` +
                  `source: \`rest_post\`\n` +
                  `incoming writer: \`${incomingWriter}\`` +
                  (snapshotId ? `\n_Forensic snapshot #${snapshotId}._` : '')
                );
              }
              continue;
            }

            let protectedWriteTxStarted = false;
            let contractCurrentValue = null;
            const criticalContract = classifyCriticalKey(row.k);
            if (criticalContract) {
              try {
                await client.query('BEGIN');
                protectedWriteTxStarted = true;
                const currentRes = await client.query(
                  'SELECT v FROM client_kv_store WHERE client_id = $1::uuid AND k = $2::text FOR UPDATE',
                  [row.client_id, row.k]
                );
                contractCurrentValue = currentRes.rows?.[0]?.v || null;
                const payloadResult = validateCriticalKvPayload(row.k, row.v, {
                  mode: 'write',
                  currentValue: contractCurrentValue,
                });
                if (!payloadResult.ok) {
                  const firstError = payloadResult.errors?.[0];
                  const reason = firstError ? `${firstError.code}:${firstError.path}` : 'invalid_payload';
                  await client.query('ROLLBACK');
                  protectedWriteTxStarted = false;
                  try {
                    await client.query(
                      `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
                       VALUES ($1::uuid, $2::text, 'critical_payload_rejected', FALSE, $3)`,
                      [row.client_id, row.k, `rest_post:${reason}`]
                    );
                  } catch (auditError) {
                    console.warn('[REST POST] critical payload audit failed:', auditError.message);
                  }
                  blocked++;
                  const blockedItem = { k: row.k, reason: 'critical_payload_rejected', detail: reason };
                  blockedItems.push(blockedItem);
                  payloadBlockedItems.push(blockedItem);
                  continue;
                }
              } catch (error) {
                if (protectedWriteTxStarted) {
                  try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
                  protectedWriteTxStarted = false;
                }
                console.warn('[REST POST] critical payload validation failed:', error.message);
                blocked++;
                const blockedItem = { k: row.k, reason: 'critical_payload_validation_failed' };
                blockedItems.push(blockedItem);
                payloadBlockedItems.push(blockedItem);
                continue;
              }
            }

            // Legacy curator clients may still send bounded event logs through
            // the generic REST batch path. Merge under a row lock so an old tab
            // cannot replace the log with a stale whole-array snapshot.
            if (isHungerStatusEventsKey(row.k) || isInsightsFeedbackKey(row.k)) {
              try {
                if (!protectedWriteTxStarted) {
                  await client.query('BEGIN');
                  protectedWriteTxStarted = true;
                  const currentRes = await client.query(
                    'SELECT v FROM client_kv_store WHERE client_id = $1::uuid AND k = $2::text FOR UPDATE',
                    [row.client_id, row.k]
                  );
                  contractCurrentValue = currentRes.rows?.[0]?.v || null;
                }
                row.v = isHungerStatusEventsKey(row.k)
                  ? mergeHungerStatusEvents(row.v, contractCurrentValue)
                  : mergeInsightsFeedback(row.v, contractCurrentValue);
              } catch (e) {
                if (protectedWriteTxStarted) {
                  try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
                  protectedWriteTxStarted = false;
                }
                console.warn('[REST POST client_kv_store] event-log merge failed:', e.message);
                blocked++;
                blockedItems.push({ k: row.k, reason: 'event_log_merge_failed' });
                continue;
              }
            }

            // 🛡️ Content-fingerprint dup check для dayv2 — ловит partial pollution
            // где writer_cid правильный но meals идентичны другому клиенту того же
            // curator (incident #8).
            if (/^heys_(?:[0-9a-f-]{36}_)?dayv2_\d{4}-\d{2}-\d{2}$/i.test(row.k)) {
              const dup = await detectCrossClientDayv2ContentDup(client, row.client_id, row.k, row.v);
              if (dup) {
                if (protectedWriteTxStarted) {
                  try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
                  protectedWriteTxStarted = false;
                }
                blocked++;
                blockedItems.push({ k: row.k, reason: 'cross_client_dayv2_content_dup' });
                const expected = String(row.client_id).slice(0, 8);
                const conflictCid = String(dup.conflictClientId).slice(0, 8);
                console.warn(`[REST POST] 🛡️ cross_client_dayv2_content_dup:`, row.k,
                  'client=', expected, 'dup_from=', conflictCid);
                try {
                  await client.query(
                    `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
                     VALUES ($1::uuid, $2::text, 'cross_client_dayv2_content_dup', FALSE, $3)`,
                    [row.client_id, row.k, `rest_post dup_from=${conflictCid} dup_key=${dup.conflictKey}`]
                  );
                } catch (e) { console.warn('[REST POST] dup audit insert failed:', e.message); }
                if (shouldSendTgAlert(row.client_id, 'cross_client_dayv2_content_dup')) {
                  sendTgAlertFireAndForget(
                    `🛡️ *cross_client_dayv2_content_dup*\n` +
                    `key: \`${row.k}\`\n` +
                    `client: \`${expected}\`\n` +
                    `source: \`rest_post\`\n` +
                    `dup with client: \`${conflictCid}\` (within 5 min)\n` +
                    `_Curator state не очистился между switch'ами — meals идентичны._`
                  );
                }
                continue;
              }

              try {
                if (!protectedWriteTxStarted) {
                  await client.query('BEGIN');
                  protectedWriteTxStarted = true;
                  const currentRes = await client.query(
                    'SELECT v FROM client_kv_store WHERE client_id = $1::uuid AND k = $2::text FOR UPDATE',
                    [row.client_id, row.k]
                  );
                  contractCurrentValue = currentRes.rows?.[0]?.v || null;
                }
                const currentValue = contractCurrentValue;
                if (currentValue) {
                  const merged = mergeDayData(row.v, currentValue, { forceKeepAll: true });
                  if (merged) {
                    row.v = merged;
                    console.warn('[REST POST client_kv_store] dayv2_guard_merged:', row.k);
                  }
                }
              } catch (e) {
                if (protectedWriteTxStarted) {
                  try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
                  protectedWriteTxStarted = false;
                }
                console.warn('[REST POST client_kv_store] dayv2 merge failed:', e.message);
                blocked++;
                blockedItems.push({ k: row.k, reason: 'dayv2_merge_failed' });
                continue;
              }
            }

            // Вызываем защищённую функцию вместо прямого INSERT
            let writeResult;
            try {
              writeResult = await client.query(
                'SELECT safe_upsert_client_kv($1, $2, $3::jsonb) as result',
                [row.client_id, row.k, JSON.stringify(row.v)]
              );
            } catch (writeErr) {
              if (protectedWriteTxStarted) {
                try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
                protectedWriteTxStarted = false;
              }
              throw writeErr;
            }

            const res = writeResult.rows[0]?.result;
            if (res?.success) {
              if (protectedWriteTxStarted) {
                await client.query('COMMIT');
                protectedWriteTxStarted = false;
              }
              processed++;
            } else if (res?.error === 'data_loss_protection' || res?.error === 'non_client_data') {
              if (protectedWriteTxStarted) {
                try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
                protectedWriteTxStarted = false;
              }
              blocked++;
              blockedItems.push({ k: row.k, reason: res.error });
              console.warn('[REST POST] 🛡️ Protected write blocked:', row.k, res.error);
            } else {
              if (protectedWriteTxStarted) {
                try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
                protectedWriteTxStarted = false;
              }
              console.error('[REST POST] Write failed:', res);
            }
          }

          console.log('[REST POST client_kv_store]', { processed, blocked, total: rows.length });

          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
              success: true,
              processed,
              blocked,
              // 🛡️ identity_blocked — symmetric с RPC batch_upsert response.
              // Client (batchSaveKVviaREST) видит этот массив и вызывает
              // _dropRejectedKey для каждого entry → удаляет stale LS +
              // ставит drop fence + триггерит reload. Без этого UI остаётся
              // загрязнённым stale данными даже после server reject.
              payload_blocked: payloadBlockedItems.length > 0 ? payloadBlockedItems : undefined,
              identity_blocked: blockedItems.length > 0 ? blockedItems : undefined,
              message: blocked > 0 ? `${blocked} writes blocked by data loss protection` : undefined
            })
          };
        }

        // Для остальных таблиц — обычная логика
        // Поддержка upsert через on_conflict
        const onConflict = params.on_conflict;
        const isUpsert = params.upsert === 'true' && onConflict;

        // 🔐 v57: Поддержка batch insert — массив объектов
        const rows = Array.isArray(body) ? body : [body];

        if (rows.length === 0) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Empty body' })
          };
        }

        // Колонки берём из первого объекта (все объекты должны иметь те же колонки).
        // Пустое тело {} или [{}] → нет колонок → отбиваем 400 до SQL, иначе
        // PG отдаёт 42601 syntax_error, который раньше прорастал в response (SEC-003).
        const columns = Object.keys(rows[0] || {});
        if (columns.length === 0) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Empty body — no columns to insert' })
          };
        }

        // 🔐 FIX v2: JSON/JSONB колонки нужно сериализовать в JSON строку
        // 🔐 FIX v3: TEXT[] массивы нужно преобразовывать в PostgreSQL array format
        const JSON_COLUMNS = ['v', 'portions']; // JSONB columns
        const ARRAY_COLUMNS = ['additives', 'barcodes'];    // TEXT[] columns

        // Формируем VALUES для batch insert
        const allValues = [];
        const allPlaceholders = [];
        let paramIdx = 1;

        for (const row of rows) {
          const rowPlaceholders = [];
          for (const col of columns) {
            const val = row[col];
            // Для JSONB колонок — сериализуем в JSON строку
            if (JSON_COLUMNS.includes(col) && val !== undefined && val !== null) {
              allValues.push(JSON.stringify(val));
              // Для TEXT[] колонок — преобразуем JS array в PostgreSQL array literal
            } else if (ARRAY_COLUMNS.includes(col) && Array.isArray(val)) {
              // PostgreSQL array format: {"elem1","elem2"} — pg driver понимает JS массивы напрямую
              allValues.push(val);
            } else {
              allValues.push(val);
            }
            rowPlaceholders.push(`$${paramIdx++}`);
          }
          allPlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        }

        const quotedColumns = columns.map(c => `"${c}"`).join(', ');

        let query;
        if (isUpsert) {
          // UPSERT: INSERT ... ON CONFLICT DO UPDATE
          const conflictCols = onConflict.split(',').map(c => `"${c.trim()}"`).join(', ');
          const updateSet = columns
            .filter(c => !onConflict.split(',').map(x => x.trim()).includes(c))
            .map(c => `"${c}" = EXCLUDED."${c}"`)
            .join(', ');

          query = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${allPlaceholders.join(', ')} ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSet}`;

          // Добавляем updated_at если колонка не в body
          if (!columns.includes('updated_at')) {
            query = query.replace('DO UPDATE SET ', 'DO UPDATE SET "updated_at" = NOW(), ');
          }
        } else {
          // Обычный INSERT
          query = `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${allPlaceholders.join(', ')}`;
        }

        // RETURNING если нужен select
        const selectCols = params.select;
        if (selectCols) {
          const sanitized = sanitizeSelectColumns(selectCols, tableName);
          if (sanitized) {
            query += ` RETURNING ${sanitized}`;
          }
        }

        console.log('[REST POST]', { table: tableName, isUpsert, onConflict, columns, rowCount: rows.length });
        result = await client.query(query, allValues);

        // v58: Для upsert важно вернуть rowCount для подтверждения записи
        // result.rows пустой без RETURNING, но rowCount показывает кол-во затронутых строк
        const responseBody = selectCols ? result.rows : {
          success: true,
          rowCount: result.rowCount,
          inserted: rows.length
        };

        // [DEBUG] Log DB result
        console.log('[REST POST RESULT]', { dbRowCount: result.rowCount, responseRowCount: responseBody.rowCount || 'array' });

        return {
          statusCode: isUpsert ? 200 : 201,
          headers: corsHeaders,
          body: JSON.stringify(responseBody)
        };
      }

      // 🔐 P3.1: PATCH — UPDATE для разрешённых writable таблиц (moderation status updates)
      case 'PATCH': {
        if (!isWriteAllowed) {
          return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'PATCH not allowed for this table.' })
          };
        }

        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        const params = { ...event.queryStringParameters };
        delete params.table;
        const selectParam = params.select;
        delete params.select;

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'PATCH body must be a JSON object' })
          };
        }

        const updateCols = Object.keys(body);
        if (updateCols.length === 0) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'PATCH body is empty' })
          };
        }

        // Allowed columns for this table
        const allowedCols = ALLOWED_COLUMNS[tableName] || [];
        const values = [];
        let i = 1;

        // Build SET clause
        const setClauses = [];
        for (const col of updateCols) {
          if (!allowedCols.includes(col)) {
            return {
              statusCode: 400,
              headers: corsHeaders,
              body: JSON.stringify({ error: `Column "${col}" not allowed for update` })
            };
          }
          setClauses.push(`"${col}" = $${i++}`);
          values.push(body[col]);
        }

        // Build WHERE clause from query params (same logic as GET)
        const conditions = [];
        for (const [key, value] of Object.entries(params)) {
          if (key.startsWith('eq.')) {
            const col = key.replace('eq.', '');
            conditions.push(`"${col}" = $${i++}`);
            values.push(value);
          } else if (typeof value === 'string' && value.startsWith('eq.')) {
            conditions.push(`"${key}" = $${i++}`);
            values.push(value.replace('eq.', ''));
          } else if (!['order', 'limit', 'offset'].includes(key)) {
            conditions.push(`"${key}" = $${i++}`);
            values.push(value);
          }
        }

        if (conditions.length === 0) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'PATCH requires at least one filter' })
          };
        }

        let query = `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')}`;

        if (selectParam) {
          const sanitized = sanitizeSelectColumns(selectParam, tableName);
          if (sanitized) {
            query += ` RETURNING ${sanitized}`;
          }
        }

        console.log('[REST PATCH]', { table: tableName, setCols: updateCols, conditions: conditions.length });
        result = await client.query(query, values);

        const responseBody = selectParam ? result.rows : { success: true, rowCount: result.rowCount };
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(responseBody)
        };
      }

      // 🔐 P3.1: DELETE — только для разрешённых writable таблиц
      case 'DELETE': {
        if (!isWriteAllowed) {
          return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'DELETE not allowed for this table.' })
          };
        }

        const params = { ...event.queryStringParameters };
        delete params.table;

        // Строим WHERE из фильтров
        const conditions = [];
        const values = [];
        let i = 1;

        for (const [key, value] of Object.entries(params)) {
          if (key.startsWith('eq.')) {
            const col = key.replace('eq.', '');
            conditions.push(`"${col}" = $${i++}`);
            values.push(value);
          } else if (typeof value === 'string' && value.startsWith('eq.')) {
            conditions.push(`"${key}" = $${i++}`);
            values.push(value.replace('eq.', ''));
          }
        }

        if (conditions.length === 0) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'DELETE requires at least one filter' })
          };
        }

        const query = `DELETE FROM "${tableName}" WHERE ${conditions.join(' AND ')}`;
        console.log('[REST DELETE]', { table: tableName, conditions: conditions.length });
        result = await client.query(query, values);

        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ deleted: result.rowCount })
        };
      }

      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method not allowed.' })
        };
    }

  } catch (error) {
    // SEC-003: лог содержит SQLSTATE для diagnostics, response — нет (не утекаем
    // pg error.code типа 42601/42703 в публичный JSON; они подсказывают атакующему
    // структуру запроса/таблицы).
    console.error('[REST Error]', { message: error.message, code: error.code });

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal server error'
      })
    };

  } finally {
    client.release();
  }
}

module.exports.handler = async function (event, context) {
  if (event?.httpMethod === 'OPTIONS') return handleRestRequest(event, context);

  const permit = requestCapacityGuard.tryEnter();
  if (!permit.ok) {
    const origin = event?.headers?.origin || event?.headers?.Origin || null;
    return requestCapacityGuard.withCorsHeaders(permit.response, getCorsHeaders(origin));
  }

  try {
    return await handleRestRequest(event, context);
  } finally {
    permit.release();
  }
};
