/**
 * HEYS API RPC — Yandex Cloud Function
 * PostgreSQL RPC вызовы напрямую к Yandex.Cloud PostgreSQL
 * v2.5.3 — verify stable deployment (2026-02-10)
 */

const crypto = require('crypto');
const { initSecrets } = require('./shared/secrets');

const { getPool } = require('./shared/db-pool');
const { mergeDayData, mergeScalarKv } = require('./lib/heys_sync_merge_v1.cjs');
const { computeCuratorActionPayload } = require('./curator-action-diff');

// ═══════════════════════════════════════════════════════════════════════════
// Ticket B: ключи курaторской UI-сессии — никогда не должны попадать в
// `client_kv_store`. Server-side гейт для всех write-paths (merge_save_*,
// batch_upsert_client_kv_by_curator). Mirror-copy в
// `apps/web/heys_storage_supabase_v1.js NON_CLIENT_DATA_BLACKLIST` (client-side).
// ═══════════════════════════════════════════════════════════════════════════
const NON_CLIENT_DATA_BLACKLIST = [
  'heys_clients',
  'heys_client_current',
  'heys_curator_session',
  'heys_debug_events',
];
function stripClientScopeFromKey(key) {
  const m = String(key || '').match(/^heys_[0-9a-f-]{36}_(.+)$/i);
  return m ? 'heys_' + m[1] : key;
}
function isNonClientDataKey(k) {
  if (typeof k !== 'string') return false;
  return NON_CLIENT_DATA_BLACKLIST.includes(k) || NON_CLIENT_DATA_BLACKLIST.includes(stripClientScopeFromKey(k));
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 P0 SECURITY: Conditional logging (never log env in production)
// ═══════════════════════════════════════════════════════════════════════════
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';  // debug | info | warn | error
const IS_DEBUG = LOG_LEVEL === 'debug';

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ Startup env validation — логируем проблемы сразу при cold start
// ═══════════════════════════════════════════════════════════════════════════
(function validateEnv() {
  const required = ['PG_PASSWORD'];
  const recommended = ['PG_HOST', 'JWT_SECRET', 'HEYS_ENCRYPTION_KEY'];

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[HEYS.rpc] ❌ FATAL: Missing required env: ${key}`);
    }
  }
  for (const key of recommended) {
    if (!process.env[key]) {
      console.warn(`[HEYS.rpc] ⚠️ Missing recommended env: ${key}`);
    }
  }
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error(`[HEYS.rpc] ❌ JWT_SECRET too short (${process.env.JWT_SECRET.length} < 32)`);
  }
})();

function debugLog(...args) {
  if (IS_DEBUG) console.info(...args);
}

function infoLog(...args) {
  if (IS_DEBUG || LOG_LEVEL === 'info') console.info(...args);
}

function normalizeEncryptionKey(rawKey) {
  if (!rawKey) return null;
  const key = String(rawKey).trim();
  if (!key) return null;

  const isHex = /^[0-9a-fA-F]+$/.test(key);
  const hasEvenLength = key.length % 2 === 0;
  if (isHex && hasEvenLength && key.length >= 32) {
    return key;
  }

  return Buffer.from(key, 'utf8').toString('hex');
}

// 🔐 В production логируем только факт старта, без деталей конфигурации
infoLog('[RPC Init] Starting... LOG_LEVEL=' + LOG_LEVEL);
debugLog('[RPC Init] Debug mode enabled (never enable in production!)');

// PostgreSQL: shared/db-pool сам грузит CA cert и собирает config с verify-full SSL.

/**
 * 🔐 Извлечение реального IP клиента из заголовков
 * Yandex Cloud Functions / API Gateway добавляют X-Forwarded-For
 * Формат: "client_ip, proxy1_ip, proxy2_ip"
 * 
 * 🔐 P1: Защита от DoS через длинные заголовки:
 * - Обрезаем входящую строку до 128 символов
 * - Берём только первый IP до запятой
 * - Возвращаем null если не парсится (SQL сделает safe cast)
 */
function extractClientIp(headers) {
  if (!headers) return null;

  // Нормализуем ключи (могут быть разные регистры)
  const h = {};
  for (const [k, v] of Object.entries(headers)) {
    h[k.toLowerCase()] = v;
  }

  // 1. X-Forwarded-For (основной)
  if (h['x-forwarded-for']) {
    // 🔐 P1: Ограничиваем длину строки (защита от DoS)
    const raw = String(h['x-forwarded-for']).slice(0, 128);
    // Берём только первый IP до запятой
    const firstIp = raw.split(',')[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }

  // 2. X-Real-IP (Nginx)
  const realIp = h['x-real-ip'] ? String(h['x-real-ip']).slice(0, 45) : null;
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  // 3. CF-Connecting-IP (Cloudflare)
  const cfIp = h['cf-connecting-ip'] ? String(h['cf-connecting-ip']).slice(0, 45) : null;
  if (cfIp && isValidIp(cfIp)) {
    return cfIp;
  }

  return null;
}

/**
 * Валидация IP адреса (IPv4 или IPv6)
 */
function isValidIp(ip) {
  if (!ip) return false;
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split('.').every(n => parseInt(n) <= 255);
  }
  // IPv6 (упрощённая проверка)
  if (ip.includes(':') && /^[0-9a-fA-F:]+$/.test(ip)) {
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 JWT Verification (для curator-only функций)
// ═══════════════════════════════════════════════════════════════════════════

function base64UrlDecode(str) {
  // Сначала заменяем URL-safe символы на стандартные
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  // Затем добавляем padding
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString();
}

function verifyJwt(token, jwtSecret) {
  try {
    const [headerB64, payloadB64, signature] = token.split('.');

    // Проверяем подпись
    const expectedSig = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    if (signature !== expectedSig) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Декодируем payload
    const payload = JSON.parse(base64UrlDecode(payloadB64));

    // Проверяем срок действия
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (e) {
    return { valid: false, error: e.message };
  }
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

// ⚠️ SECURITY: Только клиентские RPC функции!
// Админские функции (set_subscription_*, get_*_for_curator) — в отдельный heys-api-admin
const ALLOWED_FUNCTIONS = [
  // === AUTH (клиентская) ===
  'get_client_salt',
  // 🔐 P2: Removed verify_client_pin (no rate-limit)
  'client_pin_auth',
  // 🔐 P2: Removed create_client_with_pin — curator-only (иначе спам-регистрация)
  // 🔐 P2: Removed verify_client_pin_v2 (returned plaintext PIN!)
  'verify_client_pin_v3',             // 🔐 P1: С rate-limit по IP!
  'revoke_session',                   // Logout (отзыв сессии)

  // === SUBSCRIPTION (клиентская) ===
  'get_subscription_status_by_session', // Статус подписки по session_token
  'start_trial_by_session',             // Старт триала (идемпотентно)
  'activate_trial_timer_by_session',    // 🆕 v2.0: Старт таймера при первом логине

  // === TRIAL QUEUE (очередь на триал) ===
  'get_public_trial_capacity',          // Публичный виджет мест (без auth!)
  'request_trial',                      // Запрос триала: offer или очередь
  'get_trial_queue_status',             // Статус в очереди
  'claim_trial_offer',                  // Подтверждение offer → старт триала
  'cancel_trial_queue',                 // Отмена запроса на триал
  'assign_trials_from_queue',           // Воркер: раздача offers (cron)

  // ❌ TRIAL QUEUE ADMIN функции ПЕРЕМЕЩЕНЫ в CURATOR_ONLY_FUNCTIONS
  // (требуют JWT-авторизацию, см. ниже)

  // === KV STORAGE (🔐 P1: session-версии — IDOR fix!) ===
  'update_client_profile_by_session',     // 🔐 P1: Обновление профиля клиента (name)
  'get_client_data_by_session',           // 🔐 P1: session-версия (IDOR fix)
  'get_client_kv_by_session',             // 🔐 P1: чтение KV (session-safe)
  'upsert_client_kv_by_session',          // 🔐 P1: запись KV (session-safe)
  'batch_upsert_client_kv_by_session',    // 🔐 P1: пакетная запись (session-safe)
  'merge_save_client_kv_by_session',      // 🔀 Server-side merge для dayv2/norms/profile (lost-update fix)
  'batch_get_client_kv_by_session',       // 🔐 Phase 1a: пакетное чтение (hot-sync optimization)
  'get_change_markers_by_session',        // 🔐 Phase 1b: scoped change markers (conditional sync)
  'delete_client_kv_by_session',          // 🔐 P1: удаление KV (session-safe)

  // === CURATOR ACTIONS FEED (📝 in-app banner + push body) ===
  'get_my_curator_changelog_since',       // 📝 client reads curator-changes since last-seen
  'ack_curator_changelog',                // 📝 client marks changelog as read

  // === EWS WEEKLY SNAPSHOTS (🔐 Wave 3.1: облачная синхронизация) ===
  'upsert_weekly_snapshot_by_session',    // 🔐 Сохранение weekly snapshot
  'get_weekly_snapshots_by_session',      // 🔐 Загрузка последних N недель
  'delete_old_weekly_snapshots_by_session', // 🔐 Cleanup старых snapshots

  // === GAMIFICATION AUDIT (client, session-based) ===
  'log_gamification_event_by_session',
  'get_gamification_events_by_session',

  // === PLANNING INGEST (API-first context apply) ===
  'planning_context_ingest',
  'planning_context_agent_ingest', // Bearer PLANNING_AGENT_SECRET + targetClientId (server-trusted KV path)

  // ❌ УБРАНО (IDOR — принимают UUID от клиента!):
  // 'save_client_kv'             — IDOR: клиент может передать чужой UUID
  // 'get_client_kv'              — IDOR: клиент может читать чужие данные
  // 'delete_client_kv'           — IDOR: клиент может удалять чужие данные
  // 'upsert_client_kv'           — IDOR: клиент может писать в чужие данные
  // 'batch_upsert_client_kv'     — IDOR: клиент может пакетно писать в чужие данные

  // === PRODUCTS (read-only или с модерацией) ===
  'get_shared_products',
  'create_pending_product_by_session', // 🔐 P1: session-версия для PIN-клиентов (на модерацию)
  'publish_shared_product_by_session', // 🔐 P3: прямая публикация для кураторов (REST→RPC, session)
  'publish_shared_product_by_curator', // 🔐 P3: прямая публикация для кураторов (REST→RPC, JWT)
  // 'sync_shared_products_by_session', // 🪦 REMOVED 2026-05-24 (plan F17): не вызывается из apps/,
  //                                     attack surface (replace heys_products через UPSERT без tombstone).
  //                                     DROP миграция: database/2026-05-24_drop_sync_shared_products_by_session.sql
  'update_shared_product_portions',    // 🔐 Обновление порций продукта (direct UPDATE, не INSERT)
  'update_shared_product_portions_by_curator', // 🔐 Обновление порций куратором (JWT auth)

  // === DEBUG / OBSERVABILITY ===
  'log_client_event_by_session',       // 📝 Append-only event log для debug (plan Wave 5 F-EL2,F-EL3)

  // === LEADERBOARD (🏆 global opt-in leaderboard) ===
  'toggle_leaderboard_sharing_by_session',
  'publish_leaderboard_snapshot_by_session',
  'get_leaderboard_by_session',
  'get_leaderboard_weekly_by_session',

  // === CONSENTS ===
  'log_consents',                     // Логирование согласий с ПЭП
  'log_consents_by_session',          // 🔐 Session-safe: client_id из сессии (IDOR protection)
  'check_required_consents',          // Проверка обязательных согласий (legacy)
  'check_required_consents_by_session', // 🔐 v2 version-aware: re-consent при bump версии (compliance overhaul 2026-05-20)
  'check_payment_consent_by_session', // 🔐 Session-safe: проверка payment_oferta перед оплатой
  'revoke_consent',                   // Отзыв согласия (legacy)
  'revoke_consent_by_session',        // 🔐 Session-safe revoke + kill sessions при health/personal (2026-05-20)
  'get_client_consents',              // Получение всех согласий клиента
  'get_my_consents_by_session',       // 🔐 Self-view: список своих согласий для UI "Мои согласия" (2026-05-20)
  'get_consent_proof_by_session',     // 🔐 Self-view: proof-of-consent для скачивания PDF/JSON (2026-05-20)

  // === DSAR / СУБЪЕКТНЫЕ ПРАВА (152-ФЗ ст.14 / GDPR Art.15-18, 2026-05-20) ===
  'export_my_data_by_session',        // 🔐 DSAR: выгрузка всех своих данных JSON-ом
  'confirm_age_by_session',           // 🔐 18+ gate: установка birth_year для старых клиентов
  'request_restriction_by_session',   // 🔐 Right to restriction: заморозка/разморозка обработки
  'revoke_curator_access_by_session', // 🔐 Right to object: убрать куратора без удаления аккаунта

  // === ACCOUNT LIFECYCLE (152-ФЗ ст. 21 — права субъекта ПДн) ===
  'purge_health_data',                // Удаление health-данных из KV после отзыва health_data согласия
  'delete_my_account',                // Полное удаление аккаунта клиента (session-проверка внутри)

  // ❌ УБРАНО (SECURITY RISK — были доступны публично!):
  // 'reset_client_pin'                 — только через куратора/админ-API
  // 'get_curator_clients'              — только через админ-API
  // 'get_subscription_status_for_curator' — только через админ-API
  // 'set_subscription_active_until'    — только через админ-API
  // 'require_client_id'                — oracle валидности токенов (полезен атакующему)
  // 'log_security_event'               — DoS по security_events, логируем внутри SECURITY DEFINER
  // 'check_subscription_status(UUID)'  — утечка статуса по чужому client_id
];

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 CURATOR_ONLY_FUNCTIONS — требуют JWT токен куратора!
// ═══════════════════════════════════════════════════════════════════════════
const CURATOR_ONLY_FUNCTIONS = [
  // === CLIENT MANAGEMENT ===
  'create_client_with_pin',           // Создание клиента (только куратор!)
  'reset_client_pin',                 // Сброс PIN клиента
  'get_curator_clients',              // Список клиентов куратора
  'admin_get_all_clients',            // 🆕 Список всех клиентов (JWT-only v4.0)

  // === SUBSCRIPTION MANAGEMENT ===
  'admin_extend_subscription',        // Продление подписки клиента
  'admin_cancel_subscription',        // Сброс подписки клиента
  'admin_extend_trial',               // 🆕 Продление триала (JWT-only v2.0)

  // === TRIAL QUEUE ADMIN ===
  'admin_get_trial_queue_list',       // Список очереди с данными клиентов
  'admin_add_to_queue',               // Добавить клиента в очередь
  'admin_remove_from_queue',          // Удалить из очереди
  'admin_send_offer',                 // @deprecated — use admin_activate_trial
  'admin_activate_trial',             // 🆕 Активировать триал (JWT-only v4.0)
  'admin_reject_request',             // Отклонить заявку с причиной
  'admin_get_queue_stats',            // Статистика очереди
  'admin_update_queue_settings',      // Изменить настройки (is_accepting и т.д.)

  // === LEADS MANAGEMENT (v3.0) ===
  'admin_get_leads',                  // Список лидов с лендинга
  'admin_convert_lead',               // Конвертация лида в клиента
  'admin_update_lead_status',         // Обновление статуса лида (отклонение и т.д.)
  'admin_set_client_pin',             // 🆕 Установка PIN с bcrypt (Phase 1 hotfix, замена reset_client_pin)
  'admin_regenerate_pin',             // 🆕 Перевыпуск PIN+pin_token (P0.7)

  // === GAMIFICATION AUDIT ===
  'log_gamification_event_by_curator',
  'get_gamification_events_by_curator',
  'delete_gamification_events_by_curator', // Удаление дубликатов из audit log

  // === KV STORAGE (curator, JWT-auth) ===
  // Куратор пишет данные клиента через горячий heys-api-rpc вместо
  // холодного heys-api-rest (cold start parity с PIN-путём).
  // Безопасность: SQL функция проверяет ownership (clients.user_id = curator).
  'batch_upsert_client_kv_by_curator',
  'merge_save_client_kv_by_curator',      // 🔀 Server-side merge — куратор пишет данные клиента
];

// === P1-B: Curator audit middleware (2026-05-22) =============================
// 152-ФЗ ст.18.1 — оператор обязан вести учёт обработки ПДн. Каждое чтение/
// запись health-data клиента курaтором фиксируется в data_access_audit_log
// через log_data_access SQL-функцию (compliance_overhaul §1.8).
//
// CURATOR_AUDIT_SKIP — функции БЕЗ конкретного target client_id (списки,
// агрегаты, глобальные настройки). Их audit не нужен — нет «чьи именно ПДн
// прочёл куратор». Логировать их = шум.
const CURATOR_AUDIT_SKIP = new Set([
  'get_curator_clients',
  'admin_get_all_clients',
  'admin_get_trial_queue_list',
  'admin_get_leads',
  'admin_get_queue_stats',
  'admin_update_queue_settings',
  'create_client_with_pin',          // новый клиент — нет existing target
  'delete_gamification_events_by_curator',  // bulk delete по event_ids, не client
]);

// CURATOR_AUDIT_HEALTH — функции которые читают/пишут health-data (питание,
// вес, диета, gamification XP). is_health_data=true для GDPR special category
// классификации в audit log.
const CURATOR_AUDIT_HEALTH = new Set([
  'batch_upsert_client_kv_by_curator',
  'merge_save_client_kv_by_curator',
  'log_gamification_event_by_curator',
  'get_gamification_events_by_curator',
]);

// Маппинг параметров (если нужно)
// Клиент передаёт короткие имена → маппим на p_* для PostgreSQL функций
const PARAM_MAPPING = {
  // Маппинг клиентских параметров → параметры функций PostgreSQL
  'phone': 'p_phone',
  'pin': 'p_pin',
  'session_token': 'p_session_token',
  'client_id': 'p_client_id',
  // KV функции: клиент передаёт k/v, PostgreSQL ожидает p_key/p_value
  'k': 'p_key',
  'v': 'p_value',
  // 'p_phone': 'p_phone_normalized',  // НЕ НУЖНО — функции уже используют p_phone
};

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.some(allowed => origin?.startsWith(allowed));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    // 🔒 Security headers
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

const PLANNING_KEYS = {
  PROJECTS: 'heys_planning_projects',
  TASKS: 'heys_planning_tasks',
  CONTEXT_INBOX: 'heys_planning_inbox_v1',
  LINKS: 'heys_planning_links_v1',
  SLOTS: 'heys_planning_slots',
  IDEMPOTENCY: 'heys_planning_ingest_idempotency_v1',
};

function makeUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text) {
  return new Set(normalizeText(text).split(' ').filter(Boolean));
}

function fuzzySimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function pad2Iso(n) {
  return String(Math.floor(Number(n) || 0)).padStart(2, '0');
}

function isoFromParts(y, m, d) {
  const yi = Math.floor(Number(y));
  const mi = Math.floor(Number(m));
  const di = Math.floor(Number(d));
  if (!yi || mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  const dt = new Date(Date.UTC(yi, mi - 1, di));
  if (dt.getUTCFullYear() !== yi || dt.getUTCMonth() !== mi - 1 || dt.getUTCDate() !== di) return null;
  return `${yi}-${pad2Iso(mi)}-${pad2Iso(di)}`;
}

function addDaysUtcIso(isoDate, deltaDays) {
  const base = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.floor(Number(deltaDays) || 0));
  return isoFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function extractSnapshotReferenceDate(text) {
  const m = String(text || '').match(/Дата:\s*(\d{4}-\d{2}-\d{2})/i);
  return m ? m[1] : null;
}

function timeToMinutesClock(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 9 * 60;
  const [h, m] = timeStr.split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function clockFromMinutesTotal(totalMinutes) {
  const safe = Math.min(23 * 60 + 59, Math.max(0, Math.round(Number(totalMinutes) || 0)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${pad2Iso(h)}:${pad2Iso(m)}`;
}

const RU_MONTH_GEN = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
};

/**
 * Best-effort schedule hints from free text (snapshot lines, user prompt).
 * @returns {{ startDate?: string, dueDate?: string, plannedMinutes?: number, slotStartTime?: string }}
 */
function extractScheduleHints(text, refIsoDate) {
  const full = String(text || '');
  const ref = (refIsoDate && /^\d{4}-\d{2}-\d{2}$/.test(refIsoDate))
    ? refIsoDate
    : new Date().toISOString().slice(0, 10);
  const hints = {};

  const isoMatches = [];
  const isoRe = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  let im;
  while ((im = isoRe.exec(full)) !== null) {
    const iso = isoFromParts(im[1], im[2], im[3]);
    if (iso) isoMatches.push(iso);
  }
  if (isoMatches.length === 1) {
    hints.dueDate = isoMatches[0];
  } else if (isoMatches.length >= 2) {
    hints.startDate = isoMatches[0];
    hints.dueDate = isoMatches[isoMatches.length - 1];
  }

  const dmyRe = /\b(\d{1,2})[./](\d{1,2})[./](20\d{2}|\d{2})\b/g;
  const dmyList = [];
  let dm;
  while ((dm = dmyRe.exec(full)) !== null) {
    let year = Number(dm[3]);
    if (dm[3].length === 2) year += 2000;
    const iso = isoFromParts(year, dm[2], dm[1]);
    if (iso) dmyList.push(iso);
  }
  if (dmyList.length === 1 && !hints.dueDate) hints.dueDate = dmyList[0];
  if (dmyList.length >= 2) {
    if (!hints.startDate) hints.startDate = dmyList[0];
    if (!hints.dueDate) hints.dueDate = dmyList[dmyList.length - 1];
  }

  const ruRe = /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(20\d{2}))?\b/gi;
  const ruList = [];
  let rm;
  while ((rm = ruRe.exec(full)) !== null) {
    const day = Number(rm[1]);
    const mon = RU_MONTH_GEN[rm[2].toLowerCase()];
    let year = rm[3] ? Number(rm[3]) : Number(ref.slice(0, 4));
    if (mon && day >= 1 && day <= 31) {
      const iso = isoFromParts(year, mon, day);
      if (iso) ruList.push(iso);
    }
  }
  if (ruList.length === 1 && !hints.dueDate) hints.dueDate = ruList[0];
  if (ruList.length >= 2) {
    if (!hints.startDate) hints.startDate = ruList[0];
    if (!hints.dueDate) hints.dueDate = ruList[ruList.length - 1];
  }

  if (!hints.dueDate) {
    if (/\bсегодня\b/i.test(full)) hints.dueDate = ref;
    else if (/\bзавтра\b/i.test(full)) hints.dueDate = addDaysUtcIso(ref, 1) || ref;
    else if (/\bпослезавтра\b/i.test(full)) hints.dueDate = addDaysUtcIso(ref, 2) || ref;
  }

  let planned = 0;
  // Do not use \b after Cyrillic "ч": in JS \b is ASCII-word-based, so "2ч " fails to match.
  const hMatch = full.match(/(\d+(?:[.,]\d+)?)\s*(?:ч(?:ас|аса|асов)?|h)(?=\s|[,.;)]|$)/i);
  if (hMatch) planned += Math.round(parseFloat(String(hMatch[1]).replace(',', '.')) * 60);
  const minMatch = full.match(/(\d+)\s*мин/i);
  if (minMatch) planned += Number(minMatch[1]);
  if (planned > 0 && planned <= 24 * 60) hints.plannedMinutes = planned;

  const tMatch = full.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (tMatch) {
    hints.slotStartTime = `${pad2Iso(Number(tMatch[1]))}:${tMatch[2]}`;
  }

  return hints;
}

function applyScheduleHintsToTask(task, hints) {
  if (!task || !hints) return 0;
  let n = 0;
  if (hints.startDate) {
    task.startDate = hints.startDate;
    n += 1;
  }
  if (hints.dueDate) {
    task.dueDate = hints.dueDate;
    n += 1;
  }
  if (hints.plannedMinutes) {
    task.plannedMinutes = hints.plannedMinutes;
    n += 1;
  }
  if (n) task.updatedAt = nowIso();
  return n;
}

function tryAddIngestCalendarSlot(nextSlots, taskId, hints, taskTitle) {
  if (!taskId || !hints) return false;
  const date = hints.dueDate || hints.startDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const exists = nextSlots.some((s) => s && s.taskId === taskId && s.date === date);
  if (exists) return false;
  const startTime = hints.slotStartTime || '09:00';
  const mins = Number(hints.plannedMinutes) > 0 ? Number(hints.plannedMinutes) : 60;
  const endTotal = timeToMinutesClock(startTime) + mins;
  const endTime = clockFromMinutesTotal(endTotal);
  const slotTitle = String(taskTitle || hints.slotTitle || '').trim().slice(0, 240);
  nextSlots.push({
    id: makeUid(),
    taskId,
    title: slotTitle,
    date,
    startTime,
    endTime,
    source: 'agent_ingest',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return true;
}

function safeJsonParse(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function extractSectionBlock(text, sectionName) {
  const source = String(text || '');
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\[${escaped}\\]\\s*([\\s\\S]*?)(?:\\n\\[[A-Z0-9_]+\\]|$)`, 'i');
  const match = source.match(regex);
  return match ? String(match[1] || '').trim() : '';
}

function mapSnapshotType(rawType) {
  const t = normalizeText(rawType);
  if (t.includes('задач')) return 'task';
  if (t.includes('тем')) return 'thread';
  if (t.includes('решен')) return 'decision';
  if (t.includes('вопрос')) return 'question';
  if (t.includes('огранич')) return 'constraint';
  if (t.includes('ценност')) return 'value';
  return 'capture';
}

function parseSnapshotInbox(snapshotText) {
  const section = String(snapshotText || '').split('--- Inbox ---')[1] || '';
  const normalized = section.replace(/\r/g, '');
  const entryRegex = /(?:^|\n)(\d+)\.\s+[^\[]*\[([^\]]+)\]\s+([^\n]+)\n\s+([^\n]+)/g;
  const entries = [];
  let match;
  while ((match = entryRegex.exec(normalized)) !== null) {
    entries.push({
      type: mapSnapshotType(match[2]),
      title: String(match[3] || '').trim(),
      body: String(match[4] || '').trim(),
    });
  }
  return entries;
}

function parseAdditionalContext(text) {
  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw || /^<.*>$/.test(raw)) return [];
  if (raw.includes('--- Inbox ---')) {
    return parseSnapshotInbox(raw).map((item) => ({ ...item, source: 'additional_context' }));
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: 'capture',
      title: line.length > 72 ? line.slice(0, 72).trim() + '…' : line,
      body: line,
      source: 'additional_context',
    }));
}

function parseKnownItems(text) {
  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw || /^<.*>$/.test(raw) || normalizeText(raw).includes('агент проверь')) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasWaitMarker(text) {
  const source = normalizeText(text);
  return source.includes('ждёт решения') || source.includes('ждет решения');
}

function parseContextPayload(snapshotText, rawPromptText) {
  const prompt = String(rawPromptText || '');
  const snapshotBlock = extractSectionBlock(prompt, 'SNAPSHOT') || String(snapshotText || '');
  const daysBlock = extractSectionBlock(prompt, 'HEYS_DAYS_LAST_5');
  const additionalBlock = extractSectionBlock(prompt, 'ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ');
  const knownBlock = extractSectionBlock(prompt, 'ЧТО УЖЕ ЕСТЬ В HEYS');
  const noDupBlock = extractSectionBlock(prompt, 'НЕ ДУБЛИРОВАТЬ');

  const parsedSnapshotEntries = parseSnapshotInbox(snapshotBlock);
  const parsedAdditional = parseAdditionalContext(additionalBlock);
  const knownItems = parseKnownItems(knownBlock);
  const noDuplicateHints = parseKnownItems(noDupBlock);

  const seen = new Set();
  const entries = []
    .concat(parsedSnapshotEntries.map((item) => ({ ...item, source: 'snapshot' })))
    .concat(parsedAdditional)
    .filter((item) => {
      const key = normalizeText(item.body || item.title);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    snapshotBlock,
    daysBlock,
    knownItems,
    noDuplicateHints,
    entries,
    unresolvedEntries: entries.filter((entry) =>
      entry.type === 'question' || hasWaitMarker((entry.title || '') + ' ' + (entry.body || ''))
    ),
  };
}

function parseSnapshotMeta(snapshotText) {
  const text = String(snapshotText || '');
  const modeMatch = text.match(/Режим:\s*([^\n]+)/i);
  const modeRaw = normalizeText(modeMatch?.[1] || '');
  const overdue = Number((text.match(/Просроченные:\s*(\d+)/i) || [])[1] || 0);
  const todayDue = Number((text.match(/Дедлайны сегодня:\s*(\d+)/i) || [])[1] || 0);
  const scheduled = Number((text.match(/Забронировано:\s*(\d+)/i) || [])[1] || 0);
  const inbox = Number((text.match(/Inbox:\s*(\d+)/i) || [])[1] || 0);
  let mode = 'steady';
  if (modeRaw.includes('береж')) mode = 'careful';
  else if (modeRaw.includes('фокус')) mode = 'focus';
  else if (overdue >= 3 || todayDue >= 3 || scheduled >= 240 || inbox >= 6) mode = 'focus';
  return { mode, overdue, todayDue, scheduled, inbox };
}

function parseExistingPlanningData(rows) {
  const byKey = {};
  const sourceRows = Array.isArray(rows) ? rows : [];

  // batch_get_client_kv_by_session returns jsonb:
  // { success: true, items: [{ k, v }, ...] }
  // Depending on SELECT wrapper we can get either:
  // 1) [{ k, v }, ...] (legacy assumption)
  // 2) [{ batch_get_client_kv_by_session: { items: [...] } }]
  const extractedItems = [];
  for (const row of sourceRows) {
    if (!row) continue;
    if (row.k) {
      extractedItems.push({ k: row.k, v: row.v });
      continue;
    }
    const payload = row.batch_get_client_kv_by_session || row.batch_get_client_kv_by_client_id;
    if (payload && Array.isArray(payload.items)) {
      for (const item of payload.items) {
        if (item && item.k) extractedItems.push({ k: item.k, v: item.v });
      }
    }
  }

  for (const item of extractedItems) {
    byKey[item.k] = safeJsonParse(item.v, []);
  }
  return {
    projects: Array.isArray(byKey[PLANNING_KEYS.PROJECTS]) ? byKey[PLANNING_KEYS.PROJECTS] : [],
    tasks: Array.isArray(byKey[PLANNING_KEYS.TASKS]) ? byKey[PLANNING_KEYS.TASKS] : [],
    inbox: Array.isArray(byKey[PLANNING_KEYS.CONTEXT_INBOX]) ? byKey[PLANNING_KEYS.CONTEXT_INBOX] : [],
    links: Array.isArray(byKey[PLANNING_KEYS.LINKS]) ? byKey[PLANNING_KEYS.LINKS] : [],
    slots: Array.isArray(byKey[PLANNING_KEYS.SLOTS]) ? byKey[PLANNING_KEYS.SLOTS] : [],
    idempotency: byKey[PLANNING_KEYS.IDEMPOTENCY] && typeof byKey[PLANNING_KEYS.IDEMPOTENCY] === 'object'
      ? byKey[PLANNING_KEYS.IDEMPOTENCY]
      : {},
  };
}

function buildIngestSummary() {
  return {
    created: 0,
    updated: 0,
    linked: 0,
    skippedAsDuplicate: 0,
  };
}

function pickReasonByScore(score, isExact) {
  if (isExact) return 'exact_match';
  if (score >= 0.88) return 'semantic_match';
  if (score >= 0.75) return 'safe_skip';
  return 'created_new';
}

const PLANNING_AGENT_CLIENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function maskClientIdForLog(clientId) {
  const s = String(clientId || '');
  if (s.length < 12) return '***';
  return `${s.slice(0, 8)}…`;
}

function verifyPlanningAgentAuthorization(authHeader) {
  const secret = process.env.PLANNING_AGENT_SECRET;
  if (!secret || !String(secret).trim()) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: { code: 'AGENT_INGEST_DISABLED', message: 'Planning agent ingest is not configured' },
      },
    };
  }
  const h = authHeader || '';
  if (!h.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization' } },
    };
  }
  const token = h.slice(7).trim();
  const digestA = crypto.createHash('sha256').update(token, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(String(secret), 'utf8').digest();
  if (digestA.length !== digestB.length || !crypto.timingSafeEqual(digestA, digestB)) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid agent credentials' } },
    };
  }
  return { ok: true };
}

function isPlanningAgentClientIdAllowed(clientId) {
  const raw = process.env.PLANNING_AGENT_ALLOWED_CLIENT_IDS;
  if (!raw || !String(raw).trim()) return true;
  const allowed = new Set(
    String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(String(clientId).toLowerCase());
}

/**
 * P1-B: fire-and-forget audit log записи доступа куратора к данным клиента.
 *
 * Вызывается ПОСЛЕ успешного query, ПЕРЕД return ответа. Использует свежий
 * client из pool — не блокирует основной поток. Ошибка логирования НЕ
 * влияет на ответ пользователю (graceful degradation: миссы в audit log
 * приемлемы, чем падение endpoint'а).
 *
 * @param {object} pool — pg pool из getPool()
 * @param {string} fnName — имя RPC (admin_extend_subscription и т.п.)
 * @param {string} curatorId — UUID куратора из JWT
 * @param {object} params — params уже с маппингом (p_client_id, ...)
 * @param {string|null} ip
 * @param {string|null} userAgent
 */
function logCuratorAccessFireAndForget(pool, fnName, curatorId, params, ip, userAgent) {
  if (!curatorId || CURATOR_AUDIT_SKIP.has(fnName)) return;

  // Достаём target client_id из стандартных параметров
  const targetClientId = params?.p_client_id || params?.p_target_client_id || null;
  if (!targetClientId) return;  // нет target — нечего логировать

  const isHealth = CURATOR_AUDIT_HEALTH.has(fnName);

  // Fire-and-forget: не await'им. Ошибки ловим, чтобы unhandled rejection
  // не убил процесс. Yandex Function freeze не страшен — запрос успевает
  // улететь до return (INSERT ~5-30ms).
  (async () => {
    let auditClient;
    try {
      auditClient = await pool.connect();
      await auditClient.query(
        'SELECT log_data_access($1, $2::uuid, $3::uuid, $4, NULL, $5::boolean, $6, $7, $8::jsonb)',
        ['curator', curatorId, targetClientId, fnName, isHealth, ip, userAgent, '{}'],
      );
    } catch (err) {
      // Audit miss НЕ должен срывать API. Логируем для post-mortem.
      console.warn('[AUDIT] log_data_access failed:', fnName, err.message);
    } finally {
      try { auditClient?.release(); } catch (_) { /* ignore */ }
    }
  })();
}

module.exports.handler = async function (event, context) {
  await initSecrets();
  // 🔐 P0: Conditional logging — no request details in production
  debugLog('[RPC Handler] Request received');
  debugLog('[RPC Handler] Method:', event.httpMethod);
  debugLog('[RPC Handler] Path:', event.path);
  // 🔐 Никогда не логируем query params / body целиком — могут содержать токены

  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  // Только POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Получаем имя функции из URL
  const directPlanningIngestPath = typeof event.path === 'string' && /\/planning\/context-ingest\/?$/.test(event.path);
  const fnName = directPlanningIngestPath
    ? 'planning_context_ingest'
    : (event.queryStringParameters?.fn || event.params?.fn);

  if (!fnName) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing function name (fn parameter)' })
    };
  }

  // Проверяем что функция разрешена
  const isPublicFunction = ALLOWED_FUNCTIONS.includes(fnName);
  const isCuratorFunction = CURATOR_ONLY_FUNCTIONS.includes(fnName);

  if (!isPublicFunction && !isCuratorFunction) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Function "${fnName}" not allowed` })
    };
  }

  // 🛡️ Defense-in-depth (2026-05-17 incident): если caller имеет curator JWT
  // и пытается вызвать `*_by_session` endpoint — это признак misconfigured
  // client (stale session token живёт рядом с curator auth). Server резолвит
  // session → wrong client. Reject explicitly чтобы заставить client использовать
  // `*_by_curator` endpoint с явным p_client_id (ownership validated в SQL).
  if (fnName.endsWith('_by_session')) {
    const authHeaderEarly = event.headers?.['authorization'] || event.headers?.['Authorization'];
    if (authHeaderEarly && authHeaderEarly.startsWith('Bearer ')) {
      console.warn('[RPC] ⚠️ Rejecting session-endpoint call with JWT header present:', fnName);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'use_curator_endpoint_when_authenticated',
          message: `Use *_by_curator endpoint instead of ${fnName} when JWT is present`
        })
      };
    }
  }

  // 🔐 Для curator-only функций требуется JWT
  let curatorId = null;
  if (isCuratorFunction) {
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];

    // PR-B (2026-05-20): JWT принимается из Authorization: Bearer (legacy
    // путь через localStorage в JS) ИЛИ из HttpOnly cookie heys_curator_jwt
    // (новый путь, XSS-safe). Cookie выставляется handler'ом heys-api-auth
    // на curator login. Когда все legacy-callers перейдут на cookie,
    // Authorization-путь можно будет удалить.
    let token = null;
    if (authHeader?.startsWith('Bearer ')) {
      const candidate = authHeader.slice(7).trim();
      if (candidate.length > 0) token = candidate;
    }
    if (!token) {
      const cookieHdr = event.headers?.cookie || event.headers?.Cookie || '';
      if (cookieHdr && typeof cookieHdr === 'string') {
        for (const part of cookieHdr.split(';')) {
          const eqIdx = part.indexOf('=');
          if (eqIdx === -1) continue;
          if (part.slice(0, eqIdx).trim() === 'heys_curator_jwt') {
            try {
              token = decodeURIComponent(part.slice(eqIdx + 1).trim());
            } catch (_e) {
              token = part.slice(eqIdx + 1).trim();
            }
            break;
          }
        }
      }
    }

    if (!token) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Authorization required for curator functions' })
      };
    }

    // 🔐 JWT_SECRET: ОБЯЗАТЕЛЕН из env. Без fallback — чтобы не было silent mismatch!
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error('[RPC] FATAL: JWT_SECRET not configured in env! Curator functions will NOT work.');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Server configuration error: JWT_SECRET missing' })
      };
    }

    console.info('[RPC] ℹ️ JWT token received, length:', token.length, 'first 20 chars:', token.substring(0, 20));
    const jwtResult = verifyJwt(token, JWT_SECRET);

    if (!jwtResult.valid) {
      console.error('[RPC] ❌ JWT verification FAILED:', jwtResult.error);
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid or expired token', details: jwtResult.error })
      };
    }

    curatorId = jwtResult.payload.sub;
    debugLog('[RPC] Curator authenticated:', curatorId);
  }

  // Парсим тело запроса
  // 🛡️ Body size limit: 256 KB — защита от DoS через огромные payload'ы
  const MAX_BODY_BYTES = 256 * 1024;
  if (event.body && typeof event.body === 'string' && Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    return {
      statusCode: 413,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Payload too large' })
    };
  }

  let params = {};
  try {
    if (event.body) {
      params = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    }
  } catch (e) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  // Применяем маппинг параметров
  const mappedParams = {};
  for (const [key, value] of Object.entries(params)) {
    const mappedKey = PARAM_MAPPING[key] || key;
    mappedParams[mappedKey] = value;
  }
  params = mappedParams;

  // Phase C (2026-05-19): cookie-based session token carriage.
  // Parses `heys_session_token` from the incoming Cookie header and uses it
  // as `p_session_token` when the body did not supply one. Lets cookie-only
  // clients call any *_by_session RPC transparently; legacy JS that still
  // puts the token in the body is unchanged. Domain=.heyslab.ru covers both
  // app.heyslab.ru (frontend) and api.heyslab.ru (this Function).
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || '';
  let cookieSessionToken = null;
  if (cookieHeader && typeof cookieHeader === 'string') {
    for (const part of cookieHeader.split(';')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const name = part.slice(0, eqIdx).trim();
      if (name === 'heys_session_token') {
        try {
          cookieSessionToken = decodeURIComponent(part.slice(eqIdx + 1).trim());
        } catch (_e) {
          cookieSessionToken = part.slice(eqIdx + 1).trim();
        }
        break;
      }
    }
  }
  // 🔧 FIX 2026-05-21: инъекция только для *_by_session функций.
  // Раньше токен прокидывался во все RPC — это ломало функции которые
  // p_session_token не принимают (verify_client_pin_v3, log_consents,
  // check_required_consents и т.д.) с 42883 undefined_function, когда
  // в cookie оставался токен от прошлой сессии.
  if (cookieSessionToken && !params.p_session_token && fnName.endsWith('_by_session')) {
    params.p_session_token = cookieSessionToken;
  }

  // API-first ingest endpoint (custom handler, not direct SQL function wrapper)
  if (fnName === 'planning_context_ingest' || fnName === 'planning_context_agent_ingest') {
    let kv;
    let defaultSource;
    if (fnName === 'planning_context_agent_ingest') {
      const authHeader = event.headers?.authorization || event.headers?.Authorization;
      const authCheck = verifyPlanningAgentAuthorization(authHeader);
      if (!authCheck.ok) {
        return {
          statusCode: authCheck.status,
          headers: corsHeaders,
          body: JSON.stringify(authCheck.body),
        };
      }
      const targetClientId = String(
        params.targetClientId || params.p_target_client_id || params.p_client_id || '',
      ).trim();
      if (!PLANNING_AGENT_CLIENT_UUID_RE.test(targetClientId)) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            ok: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid or missing targetClientId' },
          }),
        };
      }
      if (!isPlanningAgentClientIdAllowed(targetClientId)) {
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'CLIENT_NOT_ALLOWED',
              message: 'targetClientId is not in PLANNING_AGENT_ALLOWED_CLIENT_IDS',
            },
          }),
        };
      }
      kv = { kind: 'clientId', clientId: targetClientId };
      defaultSource = 'heys_cursor_agent';
    } else {
      const sessionToken = params.p_session_token || params.sessionToken || params?.input?.sessionToken;
      if (!sessionToken) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Missing session token' } }),
        };
      }
      kv = { kind: 'session', sessionToken };
      defaultSource = 'heys_context_all_button';
    }
    const source = params.source || defaultSource;
    const applyNow = params.applyNow !== false;
    const dryRun = !!params.dryRun;
    const idempotencyKey = String(params.idempotencyKey || '').trim();
    const parentIngestId = String(params.parentIngestId || '').trim() || null;
    const antiDuplicateFirst = params?.policy?.antiDuplicateFirst !== false;
    const allowDestructiveOverwrite = params?.policy?.allowDestructiveOverwrite === true;
    const linkToExisting = params?.policy?.linkToExisting !== false;
    const linkToExistingMin = Number(
      params?.policy?.linkToExistingMin != null ? params.policy.linkToExistingMin : 0.38,
    );
    const linkToExistingMaxLinks = Math.min(
      50,
      Math.max(0, Math.floor(Number(params?.policy?.linkToExistingMaxLinks ?? 6))),
    );
    const linkToExistingMaxNewNodes = Math.min(
      50,
      Math.max(0, Math.floor(Number(params?.policy?.linkToExistingMaxNewNodes ?? 8))),
    );
    const createSlotsFromIngestHints = params?.policy?.createSlotsFromIngestHints !== false;
    const maxSlotsPerIngest = Math.min(
      50,
      Math.max(0, Math.floor(Number(params?.policy?.maxSlotsPerIngest ?? 12))),
    );
    const maxNowTasks = Number(params?.policy?.maxNowTasks || 3);
    const snapshotText = String(params?.input?.snapshotText || params.snapshotText || '');
    const daysLast5Text = String(params?.input?.daysLast5Text || params.daysLast5Text || '');
    const rawPromptText = String(params?.input?.rawPromptText || params.rawPromptText || '');
    const fullText = [rawPromptText, snapshotText, daysLast5Text].filter(Boolean).join('\n');

    if (!idempotencyKey || idempotencyKey.length < 8) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid idempotencyKey' } }),
      };
    }

    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        source,
        applyNow,
        dryRun,
        antiDuplicateFirst,
        allowDestructiveOverwrite,
        linkToExisting,
        linkToExistingMin,
        linkToExistingMaxLinks,
        linkToExistingMaxNewNodes,
        createSlotsFromIngestHints,
        maxSlotsPerIngest,
        maxNowTasks,
        fullText,
      }))
      .digest('hex');

    const pool = getPool();
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // 1) Load existing planning keys + idempotency map
      const keysToLoad = [
        PLANNING_KEYS.PROJECTS,
        PLANNING_KEYS.TASKS,
        PLANNING_KEYS.CONTEXT_INBOX,
        PLANNING_KEYS.LINKS,
        PLANNING_KEYS.SLOTS,
        PLANNING_KEYS.IDEMPOTENCY,
      ];
      const loadRes =
        kv.kind === 'session'
          ? await client.query(
            `select * from batch_get_client_kv_by_session(
          p_session_token => $1::text,
          p_keys => $2::text[]
        )`,
            [kv.sessionToken, keysToLoad],
          )
          : await client.query(
            `select * from batch_get_client_kv_by_client_id(
          p_client_id => $1::uuid,
          p_keys => $2::text[]
        )`,
            [kv.clientId, keysToLoad],
          );
      const batchGetRow = loadRes.rows[0];
      const batchGetPayload =
        batchGetRow?.batch_get_client_kv_by_session ?? batchGetRow?.batch_get_client_kv_by_client_id;
      if (batchGetPayload?.error) {
        await client.query('ROLLBACK');
        client.release();
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            ok: false,
            error: { code: 'KV_LOAD_ERROR', message: String(batchGetPayload.error) },
          }),
        };
      }
      if (batchGetPayload && batchGetPayload.success === false && batchGetPayload.error) {
        await client.query('ROLLBACK');
        client.release();
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({
            ok: false,
            error: { code: 'KV_LOAD_ERROR', message: String(batchGetPayload.error) },
          }),
        };
      }
      const existing = parseExistingPlanningData(loadRes.rows);

      // 2) Idempotency replay/conflict
      const idemMap = existing.idempotency || {};
      const idemEntry = idemMap[idempotencyKey];
      if (idemEntry) {
        if (idemEntry.requestHash && idemEntry.requestHash !== payloadHash) {
          await client.query('ROLLBACK');
          client.release();
          return {
            statusCode: 409,
            headers: corsHeaders,
            body: JSON.stringify({
              ok: false,
              error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Same idempotencyKey used with different payload' },
            }),
          };
        }
        await client.query('ROLLBACK');
        client.release();
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(idemEntry.response || { ok: true, replay: true }),
        };
      }

      // 3) Parse input candidates
      const parsed = parseContextPayload(snapshotText, rawPromptText);
      const parsedEntries = parsed.entries;
      const modeMeta = parseSnapshotMeta(parsed.snapshotBlock || fullText);
      const summary = buildIngestSummary();
      const created = [];
      const updated = [];
      const skipped = [];
      const createdLinks = [];
      const nowIds = [];
      const unresolved = [];
      let semanticNeighborLinksAdded = 0;
      let scheduleFieldsApplied = 0;
      let ingestSlotsAdded = 0;

      const nextProjects = Array.isArray(existing.projects) ? existing.projects.slice() : [];
      const nextInbox = existing.inbox.slice();
      const nextTasks = existing.tasks.slice();
      const nextLinks = existing.links.slice();
      const nextSlots = Array.isArray(existing.slots) ? existing.slots.slice() : [];
      const snapshotRefDate = extractSnapshotReferenceDate(parsed.snapshotBlock || '')
        || extractSnapshotReferenceDate(fullText);
      let slotsBudgetRemaining = maxSlotsPerIngest;
      const knownFingerprint = new Set(
        parsed.knownItems
          .concat(parsed.noDuplicateHints)
          .map((x) => normalizeText(x))
          .filter(Boolean)
      );
      const startedAtMs = Date.now();

      function pushTypedLink(fromId, toId, relation, label, fromType, toType) {
        if (!fromId || !toId || fromId === toId) return;
        const rel = relation || 'related';
        const exists = nextLinks.some((lnk) => lnk.fromId === fromId && lnk.toId === toId && lnk.relation === rel);
        if (exists) return;
        const link = {
          id: makeUid(),
          fromId,
          toId,
          fromType: fromType || 'inbox',
          toType: toType || 'task',
          relation: rel,
          label: label || '',
          createdAt: nowIso(),
        };
        nextLinks.push(link);
        createdLinks.push(link);
        summary.linked += 1;
      }

      function pushLink(fromId, toId, relation, label) {
        pushTypedLink(fromId, toId, relation, label, 'inbox', 'task');
      }

      for (const entry of parsedEntries) {
        const normalizedCandidate = normalizeText(entry.body || entry.title);
        if (!normalizedCandidate) continue;

        const scheduleHints = extractScheduleHints(
          `${entry.title || ''} ${entry.body || ''}`,
          snapshotRefDate,
        );

        if (knownFingerprint.has(normalizedCandidate)) {
          skipped.push({
            candidate: entry.title || entry.body,
            matchedId: null,
            score: 1,
            reason: 'exact_match',
          });
          summary.skippedAsDuplicate += 1;
          continue;
        }

        // dedupe over inbox + tasks
        let best = null;
        const candidates = []
          .concat(nextInbox.map((x) => ({ kind: 'inbox', item: x })))
          .concat(nextTasks.map((x) => ({ kind: 'task', item: x })));
        for (const candidate of candidates) {
          const refText = candidate.kind === 'task' ? candidate.item.title : (candidate.item.body || candidate.item.title);
          const score = fuzzySimilarity(normalizedCandidate, refText);
          if (!best || score > best.score) best = { ...candidate, score };
        }

        const isExact = best && normalizeText((best.item.body || best.item.title || best.item.title || '')) === normalizedCandidate;
        const dedupeReason = pickReasonByScore(best?.score || 0, !!isExact);

        if (best && antiDuplicateFirst && (isExact || best.score >= 0.88)) {
          // update existing (touch + enrich body for inbox)
          if (best.kind === 'inbox') {
            best.item.updatedAt = nowIso();
            if (!best.item.body || best.item.body.length < entry.body.length) {
              best.item.body = entry.body;
              best.item.title = String(entry.title || '').trim() || best.item.title;
            }
            updated.push({
              id: best.item.id,
              type: best.item.type || 'capture',
              title: best.item.title || 'Запись',
              reason: dedupeReason,
            });
          } else {
            best.item.updatedAt = nowIso();
            scheduleFieldsApplied += applyScheduleHintsToTask(best.item, scheduleHints);
            if (createSlotsFromIngestHints && slotsBudgetRemaining > 0) {
              if (tryAddIngestCalendarSlot(nextSlots, best.item.id, scheduleHints, best.item.title)) {
                ingestSlotsAdded += 1;
                slotsBudgetRemaining -= 1;
              }
            }
            updated.push({
              id: best.item.id,
              type: 'task',
              title: best.item.title || 'Задача',
              reason: dedupeReason,
            });
          }
          summary.updated += 1;
          continue;
        }

        if (best && antiDuplicateFirst && best.score >= 0.75) {
          skipped.push({
            candidate: entry.title || entry.body,
            matchedId: best.item.id,
            score: Number(best.score.toFixed(2)),
            reason: dedupeReason,
          });
          summary.skippedAsDuplicate += 1;
          continue;
        }

        if (entry.type === 'task') {
          const task = {
            id: makeUid(),
            title: String(entry.title || entry.body || 'Новая задача').trim(),
            priority: 'p2',
            status: 'todo',
            order: nextTasks.length,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          scheduleFieldsApplied += applyScheduleHintsToTask(task, scheduleHints);
          nextTasks.push(task);
          created.push({ id: task.id, type: 'task', title: task.title, priority: task.priority, reason: 'created_new' });
          nowIds.push(task.id);
          summary.created += 1;
          if (createSlotsFromIngestHints && slotsBudgetRemaining > 0) {
            if (tryAddIngestCalendarSlot(nextSlots, task.id, scheduleHints, task.title)) {
              ingestSlotsAdded += 1;
              slotsBudgetRemaining -= 1;
            }
          }
          continue;
        }

        const inboxItem = {
          id: makeUid(),
          type: entry.type || 'capture',
          status: 'new',
          source: 'agent_ingest',
          privacy: 'standard',
          title: String(entry.title || entry.body || 'Новая запись').trim(),
          preview: String(entry.body || '').slice(0, 180),
          body: String(entry.body || entry.title || '').trim(),
          linkedTaskIds: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        nextInbox.unshift(inboxItem);
        created.push({ id: inboxItem.id, type: inboxItem.type, title: inboxItem.title, reason: 'created_new' });
        summary.created += 1;
        if (inboxItem.type === 'question' || hasWaitMarker((inboxItem.title || '') + ' ' + (inboxItem.body || ''))) {
          unresolved.push({ id: inboxItem.id, title: inboxItem.title, type: inboxItem.type, status: 'waiting_for_clarification' });
        }

        // auto promote questions with explicit wait marker into now queue as task suggestions
        if (inboxItem.type === 'question' && nowIds.length < maxNowTasks) {
          const qHints = extractScheduleHints(
            `${inboxItem.title || ''} ${inboxItem.body || ''}`,
            snapshotRefDate,
          );
          const task = {
            id: makeUid(),
            title: 'Решить: ' + inboxItem.title,
            priority: 'p1',
            status: 'todo',
            order: nextTasks.length,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          scheduleFieldsApplied += applyScheduleHintsToTask(task, qHints);
          nextTasks.push(task);
          inboxItem.linkedTaskIds = [task.id];
          pushLink(inboxItem.id, task.id, 'promoted_to', 'Авто-промоут');
          created.push({ id: task.id, type: 'task', title: task.title, priority: task.priority, reason: 'created_new' });
          summary.created += 1;
          nowIds.push(task.id);
          if (createSlotsFromIngestHints && slotsBudgetRemaining > 0) {
            if (tryAddIngestCalendarSlot(nextSlots, task.id, qHints, task.title)) {
              ingestSlotsAdded += 1;
              slotsBudgetRemaining -= 1;
            }
          }
        }
      }

      // Batch graph: link new inbox nodes from this ingest (conservative star).
      // Anchor priority: constraint → decision → first created inbox in batch order.
      const INBOX_TYPES = new Set(['capture', 'thread', 'decision', 'question', 'constraint', 'value']);
      const inboxCreatedThisRun = created.filter((node) => node && INBOX_TYPES.has(node.type));
      const MAX_BATCH_RELATED = 12;
      if (inboxCreatedThisRun.length >= 2) {
        let anchor = inboxCreatedThisRun.find((n) => n.type === 'constraint')
          || inboxCreatedThisRun.find((n) => n.type === 'decision')
          || inboxCreatedThisRun[0];
        const anchorId = anchor?.id;
        if (anchorId) {
          let fan = 0;
          for (const node of inboxCreatedThisRun) {
            if (!node?.id || node.id === anchorId) continue;
            if (fan >= MAX_BATCH_RELATED) break;
            pushTypedLink(anchorId, node.id, 'related', 'ingest_context_batch', 'inbox', 'inbox');
            fan += 1;
          }
        }
      }

      // Semantic neighbors: link new inbox → existing inbox/task (moderate similarity only).
      const SEMANTIC_MERGE_CEILING = 0.75;
      if (linkToExisting && linkToExistingMaxLinks > 0 && linkToExistingMaxNewNodes > 0) {
        const newInboxCreated = created.filter((n) => n && INBOX_TYPES.has(n.type));
        const newInboxIdsAll = new Set(newInboxCreated.map((n) => n.id));
        for (const meta of newInboxCreated.slice(0, linkToExistingMaxNewNodes)) {
          if (semanticNeighborLinksAdded >= linkToExistingMaxLinks) break;
          const item = nextInbox.find((x) => x.id === meta.id);
          if (!item) continue;
          const rawText = item.body || item.title || '';
          if (!normalizeText(rawText)) continue;

          let best = null;
          for (const ob of nextInbox) {
            if (newInboxIdsAll.has(ob.id)) continue;
            if (ob.id === item.id) continue;
            const ref = ob.body || ob.title || '';
            const score = fuzzySimilarity(rawText, ref);
            if (score < linkToExistingMin || score >= SEMANTIC_MERGE_CEILING) continue;
            if (!best || score > best.score) best = { kind: 'inbox', id: ob.id, score };
          }
          for (const t of nextTasks) {
            const ref = t.title || '';
            const score = fuzzySimilarity(rawText, ref);
            if (score < linkToExistingMin || score >= SEMANTIC_MERGE_CEILING) continue;
            if (!best || score > best.score) best = { kind: 'task', id: t.id, score };
          }

          if (best) {
            pushTypedLink(
              item.id,
              best.id,
              'related',
              'ingest_semantic_neighbor',
              'inbox',
              best.kind === 'task' ? 'task' : 'inbox',
            );
            semanticNeighborLinksAdded += 1;
          }
        }
      }

      // Safety guard: never allow accidental destructive overwrite when existing
      // planning arrays are non-empty but computed next arrays become empty.
      const destructiveSignals = [];
      if (Array.isArray(existing.tasks) && existing.tasks.length > 0 && nextTasks.length === 0) {
        destructiveSignals.push('tasks_would_be_cleared');
      }
      if (Array.isArray(existing.inbox) && existing.inbox.length > 0 && nextInbox.length === 0) {
        destructiveSignals.push('inbox_would_be_cleared');
      }
      if (Array.isArray(existing.links) && existing.links.length > 0 && nextLinks.length === 0) {
        destructiveSignals.push('links_would_be_cleared');
      }
      if (Array.isArray(existing.slots) && existing.slots.length > 0 && nextSlots.length === 0) {
        destructiveSignals.push('slots_would_be_cleared');
      }
      if (Array.isArray(existing.projects) && existing.projects.length > 0 && nextProjects.length === 0) {
        destructiveSignals.push('projects_would_be_cleared');
      }
      if (destructiveSignals.length > 0 && !allowDestructiveOverwrite) {
        await client.query('ROLLBACK');
        client.release();
        return {
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({
            ok: false,
            error: {
              code: 'DESTRUCTIVE_WRITE_BLOCKED',
              message: 'Potential destructive overwrite blocked by safety guard',
              details: {
                destructiveSignals,
                hint: 'Pass policy.allowDestructiveOverwrite=true only for explicit reset flows',
              },
            },
          }),
        };
      }

      const effectiveApply = !dryRun && applyNow;
      const responsePayload = {
        ok: true,
        mode: modeMeta.mode,
        summary,
        nodes: { created, updated, skipped },
        links: { created: createdLinks },
        plan: {
          now: nowIds.slice(0, Math.max(1, maxNowTasks)),
          next: [],
          later: [],
        },
        unresolved,
        nextQuestions: unresolved.map((item, idx) => ({
          id: 'q_' + String(idx + 1),
          itemId: item.id,
          question: `Уточни решение по пункту: ${item.title}`,
        })),
        audit: {
          ingestId: makeUid(),
          parentIngestId,
          idempotencyKey,
          requestHash: payloadHash,
          appliedAt: nowIso(),
          source,
          dryRun,
          applyNow,
          applyStatus: effectiveApply ? 'applied' : 'analyzed_only',
          transaction: { strategy: 'single_transaction', committed: effectiveApply },
        },
        metrics: {
          parseEntries: parsedEntries.length,
          unresolvedCount: unresolved.length,
          durationMs: Date.now() - startedAtMs,
          fallbackUsed: false,
          fallbackReason: null,
          safetyGuardEnabled: true,
          safetyGuardBypass: allowDestructiveOverwrite,
          semanticNeighborLinksAdded,
          scheduleFieldsApplied,
          ingestSlotsAdded,
        },
      };

      if (effectiveApply) {
        const idemPatch = {
          ...idemMap,
          [idempotencyKey]: {
            requestHash: payloadHash,
            createdAt: nowIso(),
            response: responsePayload,
          },
        };
        const itemsJson = JSON.stringify([
          { k: PLANNING_KEYS.PROJECTS, v: nextProjects },
          { k: PLANNING_KEYS.TASKS, v: nextTasks },
          { k: PLANNING_KEYS.CONTEXT_INBOX, v: nextInbox },
          { k: PLANNING_KEYS.LINKS, v: nextLinks },
          { k: PLANNING_KEYS.SLOTS, v: nextSlots },
          { k: PLANNING_KEYS.IDEMPOTENCY, v: idemPatch },
        ]);
        if (kv.kind === 'session') {
          await client.query(
            `select * from batch_upsert_client_kv_by_session(
            p_session_token => $1::text,
            p_items => $2::jsonb
          )`,
            [kv.sessionToken, itemsJson],
          );
        } else {
          await client.query(
            `select * from batch_upsert_client_kv_by_client_id(
            p_client_id => $1::uuid,
            p_items => $2::jsonb
          )`,
            [kv.clientId, itemsJson],
          );
        }
      }

      await client.query(effectiveApply ? 'COMMIT' : 'ROLLBACK');
      client.release();
      const ingestLogMeta =
        fnName === 'planning_context_agent_ingest'
          ? { targetClientId: maskClientIdForLog(kv.clientId) }
          : {};
      infoLog(`[${fnName}] done`, {
        applyStatus: responsePayload.audit.applyStatus,
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skippedAsDuplicate,
        unresolved: unresolved.length,
        durationMs: responsePayload.metrics.durationMs,
        ...ingestLogMeta,
      });
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(responsePayload),
      };
    } catch (error) {
      try { await client?.query('ROLLBACK'); } catch (_) { /* noop */ }
      try { client?.release(true); } catch (_) { /* noop */ }
      console.error(`[RPC Error] ${fnName}`, error.message);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: { code: 'INGEST_INTERNAL_ERROR', message: 'Internal error' },
        }),
      };
    }
  }

  // 🔐 Для curator-only функций добавляем curator_id из JWT
  if (isCuratorFunction && curatorId) {
    params.p_curator_id = curatorId;
    // Remove old session token param — DB functions now use p_curator_id only
    delete params.p_curator_session_token;
    debugLog('[RPC Handler] Added p_curator_id for curator function');
  }

  // 🔐 P1: Извлекаем IP клиента для rate-limit
  // Yandex Cloud Functions: X-Forwarded-For содержит реальный IP
  const clientIp = extractClientIp(event.headers);
  debugLog('[RPC Handler] Client IP:', clientIp ? '***extracted***' : 'null');

  // 🔐 P2: Для verify_client_pin_v3 добавляем IP и User-Agent автоматически
  if (fnName === 'verify_client_pin_v3') {
    params.p_ip = clientIp || null;
    params.p_user_agent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
    debugLog('[RPC Handler] Added p_ip and p_user_agent to verify_client_pin_v3');
  }

  // 🔐 Для log_consents: IP-адрес берём с сервера (надёжнее, чем от клиента)
  if (fnName === 'log_consents') {
    params.p_ip = clientIp || params.p_ip || null;
    if (!params.p_user_agent) {
      params.p_user_agent = event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
    }
    debugLog('[RPC Handler] Added server-side p_ip to log_consents');
  }

  // Подключаемся к PostgreSQL через connection pool
  // 🛟 Retry с health check — PgBouncer убивает idle-соединения
  const pool = getPool();
  let client;
  for (let _attempt = 0; _attempt < 3; _attempt++) {
    try {
      client = await pool.connect();
      await client.query('SELECT 1');
      break;
    } catch (connErr) {
      console.warn(`[RPC] Pool connection stale (attempt ${_attempt + 1}/3):`, connErr.message);
      try { client?.release(true); } catch (e) { /* ignore */ }
      client = null;
      if (_attempt === 2) {
        return {
          statusCode: 503,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Service temporarily unavailable', message: 'Database connection failed after 3 attempts' })
        };
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Объявляем переменные перед try блоком, чтобы они были доступны в catch
  let query;
  let paramKeys = [];
  let values = [];

  try {
    // 🔐 P2: Устанавливаем ключ шифрования для health_data (если настроен)
    const encryptionKey = process.env.HEYS_ENCRYPTION_KEY;
    if (encryptionKey) {
      const normalizedKey = normalizeEncryptionKey(encryptionKey);
      if (normalizedKey) {
        // SET не поддерживает параметры, используем format с экранированием
        await client.query(`SET heys.encryption_key = '${normalizedKey.replace(/'/g, "''")}'`);
      }
    }

    // 🔐 TEMP: Возможность отключить шифрование на уровне сессии (plaintext mode)
    if (process.env.HEYS_ENCRYPTION_DISABLED === '1') {
      await client.query("SET heys.encryption_disabled = '1'");
    }

    // 🔀 Server-side merge для устранения lost-update коллизий
    // (когда куратор и клиент одновременно правят разные приёмы пищи одного дня).
    //
    // Алгоритм:
    //   1. Резолвим caller → client_id (через session_token или curator JWT + ownership)
    //   2. BEGIN TX + SELECT FOR UPDATE — блокируем строку от параллельных мержей
    //   3. Если в облаке нет данных или клиентский last_seen_updated_at >= server.updated_at:
    //      пишем incoming как есть (нет конфликта).
    //   4. Если server.updated_at > last_seen_updated_at — конфликт. Запускаем mergeDayData/mergeScalarKv:
    //      meals/items объединяются по id, скаляры по max(updatedAt).
    //   5. UPSERT merged + return клиенту, чтобы local LS совпал с облаком.
    if (fnName === 'merge_save_client_kv_by_session' || fnName === 'merge_save_client_kv_by_curator') {
      const isCurator = fnName === 'merge_save_client_kv_by_curator';
      const k = params.p_key || params.k;
      const incomingValue = params.p_value || params.v;
      const lastSeenUpdatedAt = Number(params.p_last_seen_updated_at || params.last_seen_updated_at || 0);

      if (!k || typeof k !== 'string') {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'Missing p_key' })
        };
      }
      if (incomingValue == null || typeof incomingValue !== 'object') {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'Missing or invalid p_value (must be JSON object)' })
        };
      }

      // Resolve client_id from auth context.
      let resolvedClientId;
      if (isCurator) {
        const targetClientId = params.p_client_id || params.client_id;
        if (!targetClientId) {
          try { client.release(); } catch (_) { /* ignore */ }
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ ok: false, error: 'Missing p_client_id for curator merge' })
          };
        }
        // Ownership guard: curator must own this client.
        const ownerCheck = await client.query(
          'SELECT 1 FROM clients WHERE id = $1::uuid AND curator_id = $2::uuid',
          [targetClientId, curatorId]
        );
        if (ownerCheck.rows.length === 0) {
          try { client.release(); } catch (_) { /* ignore */ }
          return {
            statusCode: 403,
            headers: corsHeaders,
            body: JSON.stringify({ ok: false, error: 'Curator does not own this client' })
          };
        }
        resolvedClientId = targetClientId;
      } else {
        const sessionToken = params.p_session_token;
        if (!sessionToken) {
          try { client.release(); } catch (_) { /* ignore */ }
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ ok: false, error: 'Missing p_session_token' })
          };
        }
        const sessionRes = await client.query(
          `SELECT client_id FROM client_sessions
           WHERE token_hash = digest($1, 'sha256')
             AND expires_at > now()
             AND revoked_at IS NULL`,
          [sessionToken]
        );
        resolvedClientId = sessionRes.rows?.[0]?.client_id;
        if (!resolvedClientId) {
          try { client.release(); } catch (_) { /* ignore */ }
          // Ticket D: 200 → 401 чтобы fetch wrapper увидел response.ok===false
          // и положил error в result.error (а не молча в result.data).
          return {
            statusCode: 401,
            headers: corsHeaders,
            body: JSON.stringify({ ok: false, error: 'invalid_session' })
          };
        }
      }

      // Ticket B: server-side blacklist — UI-state ключи курaторской сессии
      // (см. NON_CLIENT_DATA_BLACKLIST в начале файла) никогда не должны
      // попадать в client_kv_store, независимо от пути (by_session ИЛИ
      // by_curator). Возвращаем 403 + best-effort audit.
      if (isNonClientDataKey(k)) {
        try {
          await client.query(
            `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
             VALUES ($1::uuid, $2::text, 'non_client_data_rejected', FALSE, $3)`,
            [
              resolvedClientId,
              k,
              isCurator ? 'blacklist_curator_path' : 'blacklist_session_path'
            ]
          );
        } catch (auditErr) {
          console.warn('[merge_save] blacklist audit insert failed:', auditErr.message);
        }
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'not_client_data', key: k })
        };
      }

      // Transaction with row-level lock to serialize concurrent merges on the same (client_id, k).
      let mergeOutcome = 'incoming_wins'; // for audit
      let mergedValue;
      try {
        await client.query('BEGIN');

        const cur = await client.query(
          'SELECT v, updated_at FROM client_kv_store WHERE client_id = $1::uuid AND k = $2::text FOR UPDATE',
          [resolvedClientId, k]
        );

        if (cur.rows.length === 0) {
          // Row doesn't exist → incoming wins outright
          mergedValue = incomingValue;
        } else {
          const currentValue = cur.rows[0].v;
          const currentUpdatedAt = (cur.rows[0].updated_at instanceof Date)
            ? cur.rows[0].updated_at.getTime()
            : Date.parse(cur.rows[0].updated_at);
          const cloudInternalTs = Number(currentValue && currentValue.updatedAt) || 0;
          // Concurrency conflict if cloud version was modified after the client's last-known timestamp.
          const noConflict = lastSeenUpdatedAt > 0 && lastSeenUpdatedAt >= cloudInternalTs;

          if (noConflict) {
            mergedValue = incomingValue;
          } else if (/^heys_dayv2_\d{4}-\d{2}-\d{2}$/.test(k)) {
            // forceKeepAll: client may not have seen the latest cloud-side meals yet,
            // so treating absence as "deleted" would lose other side's edits. Conservative: keep both.
            const merged = mergeDayData(incomingValue, currentValue, { forceKeepAll: true });
            if (merged) {
              mergedValue = merged;
              mergeOutcome = 'day_merged';
            } else {
              mergedValue = incomingValue; // identical content
            }
          } else if (k === 'heys_norms' || k === 'heys_profile') {
            mergedValue = mergeScalarKv(incomingValue, currentValue);
            mergeOutcome = 'scalar_merged';
          } else {
            // Ticket A v2: hybrid last-write-wins по semantic causality (v.updatedAt).
            // Primary — device clock (момент намеренной правки в UI).
            // Secondary — server clock fallback при равных ts (rare race).
            // Pre-req: Ticket M v1 — все client-data writes должны нести top-level
            // v.updatedAt. Keys без ts (heys_ews_snapshot/heys_cascade_dcs_v9/etc.)
            // попадают в legacy fallback → incoming wins (то же поведение что до A v2).
            const incTs = Number(incomingValue && incomingValue.updatedAt) || 0;
            const curTs = Number(currentValue && currentValue.updatedAt) || 0;
            if (incTs > 0 && curTs > 0) {
              if (incTs > curTs) {
                mergedValue = incomingValue;
                mergeOutcome = 'hybrid_lww_inc';
              } else if (incTs < curTs) {
                mergedValue = currentValue;
                mergeOutcome = 'stale_write_blocked';
              } else {
                // incTs === curTs — rare race, tie-breaker: incoming wins
                // (server NOW() в UPSERT гарантирует monotonic updated_at).
                mergedValue = incomingValue;
                mergeOutcome = 'tie_breaker_server';
              }
            } else {
              // Legacy backward-compat: один из side'ов без ts → incoming wins.
              mergedValue = incomingValue;
              mergeOutcome = incTs === 0 ? 'legacy_no_inc_ts' : 'legacy_no_cur_ts';
            }
          }
        }

        // UPSERT with NOW() so future merges see a monotonic timestamp.
        // user_id is curator_id for curator path, NULL for session path.
        const userIdForRow = isCurator ? curatorId : null;
        await client.query(
          `INSERT INTO client_kv_store(client_id, k, v, updated_at, user_id)
           VALUES ($1::uuid, $2::text, $3::jsonb, NOW(), $4)
           ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW()`,
          [resolvedClientId, k, JSON.stringify(mergedValue), userIdForRow]
        );

        await client.query('COMMIT');

        // Best-effort audit: only when actual merge happened (don't spam on every save).
        if (mergeOutcome === 'day_merged' || mergeOutcome === 'scalar_merged') {
          try {
            await client.query(
              `INSERT INTO data_loss_audit (client_id, key, action, existing_meals, new_meals, allowed, reason)
               VALUES ($1::uuid, $2::text, 'merge_applied', $3, $4, TRUE, $5)`,
              [
                resolvedClientId,
                k,
                Array.isArray(cur.rows[0]?.v?.meals) ? cur.rows[0].v.meals.length : null,
                Array.isArray(incomingValue.meals) ? incomingValue.meals.length : null,
                mergeOutcome === 'day_merged' ? 'concurrent_edit_merged' : 'scalar_merged'
              ]
            );
          } catch (auditErr) {
            // Audit failure shouldn't fail the actual save.
            console.warn('[merge_save] audit insert failed:', auditErr.message);
          }
        } else if (mergeOutcome === 'stale_write_blocked') {
          // Ticket A v2: explicit audit запись для отброшенных stale-writes.
          // existing_updated / new_updated несут BIGINT semantic ts для forensic.
          try {
            await client.query(
              `INSERT INTO data_loss_audit (client_id, key, action, existing_updated, new_updated, allowed, reason)
               VALUES ($1::uuid, $2::text, 'stale_write_blocked', $3, $4, FALSE, 'stale_ts')`,
              [
                resolvedClientId,
                k,
                Number(cur.rows[0]?.v?.updatedAt) || null,
                Number(incomingValue?.updatedAt) || null
              ]
            );
          } catch (auditErr) {
            console.warn('[merge_save] stale_ts audit insert failed:', auditErr.message);
          }
        }

        // 📝 Curator-actions feed: log semantic diff for in-app banner + push body.
        // Only for curator path. Best-effort: changelog INSERT must NOT fail the save.
        if (isCurator) {
          try {
            const oldV = cur.rows[0]?.v ?? null;
            const payload = computeCuratorActionPayload(oldV, mergedValue, k);
            if (payload && Array.isArray(payload.actions) && payload.actions.length > 0) {
              await client.query(
                `INSERT INTO client_data_changelog (client_id, curator_id, keys_updated, actions)
                 VALUES ($1::uuid, $2::uuid, $3::text[], $4::jsonb)`,
                [
                  resolvedClientId,
                  curatorId,
                  [k],
                  JSON.stringify(payload),
                ]
              );
            }
          } catch (changelogErr) {
            console.warn('[merge_save] changelog insert failed:', changelogErr.message);
          }
        }
      } catch (mergeErr) {
        try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        try { client.release(true); } catch (_) { /* noop */ }
        console.error('[merge_save] error:', mergeErr.message);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'merge_failed', message: mergeErr.message })
        };
      }

      try { client.release(); } catch (_) { /* ignore */ }

      // P1-B audit: merge_save_client_kv_by_curator — куратор пишет health-data
      if (fnName === 'merge_save_client_kv_by_curator') {
        logCuratorAccessFireAndForget(
          getPool('heys-api-rpc'), fnName, curatorId, params, clientIp,
          event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
        );
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: true,
          v: mergedValue,
          outcome: mergeOutcome
        })
      };
    }

    // 📝 SPECIAL: get_my_curator_changelog_since
    // Возвращает curator-actions для текущей сессии PIN-клиента, начиная с
    // последнего ack (clients.curator_actions_last_seen_at) или явного p_since.
    if (fnName === 'get_my_curator_changelog_since') {
      const sessionToken = params.p_session_token;
      const explicitSince = params.p_since || null;
      if (!sessionToken) {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'Missing p_session_token' })
        };
      }
      const sessRes = await client.query(
        `SELECT client_id FROM client_sessions
          WHERE token_hash = digest($1, 'sha256')
            AND expires_at > now()
            AND revoked_at IS NULL`,
        [sessionToken]
      );
      const resolvedClientId = sessRes.rows?.[0]?.client_id;
      if (!resolvedClientId) {
        try { client.release(); } catch (_) { /* ignore */ }
        // Ticket D: 200 → 401 (см. merge_save handler выше).
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'invalid_session' })
        };
      }

      // Determine since: explicit > last_seen > 30 days ago fallback.
      let sinceTs;
      if (explicitSince) {
        sinceTs = explicitSince;
      } else {
        const lastSeenRes = await client.query(
          'SELECT curator_actions_last_seen_at FROM clients WHERE id = $1::uuid',
          [resolvedClientId]
        );
        const lastSeen = lastSeenRes.rows?.[0]?.curator_actions_last_seen_at;
        sinceTs = lastSeen
          ? (lastSeen instanceof Date ? lastSeen.toISOString() : lastSeen)
          : new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      }

      const rowsRes = await client.query(
        `SELECT id, curator_id, keys_updated, actions, created_at
           FROM client_data_changelog
          WHERE client_id = $1::uuid
            AND acked_at IS NULL
            AND created_at > $2::timestamptz
          ORDER BY created_at DESC
          LIMIT 100`,
        [resolvedClientId, sinceTs]
      );

      try { client.release(); } catch (_) { /* ignore */ }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: true,
          since: sinceTs,
          entries: rowsRes.rows.map((r) => ({
            id: r.id,
            curator_id: r.curator_id,
            keys: r.keys_updated,
            actions: r.actions && typeof r.actions === 'object' ? r.actions : { actions: [] },
            created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          })),
        })
      };
    }

    // 📝 SPECIAL: ack_curator_changelog
    // Клиент отмечает изменения куратора как прочитанные.
    // Идемпотентно: апдейтит last_seen_at = GREATEST(coalesce, p_until_ts).
    if (fnName === 'ack_curator_changelog') {
      const sessionToken = params.p_session_token;
      const untilTsRaw = params.p_until_ts;
      if (!sessionToken) {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'Missing p_session_token' })
        };
      }
      const sessRes = await client.query(
        `SELECT client_id FROM client_sessions
          WHERE token_hash = digest($1, 'sha256')
            AND expires_at > now()
            AND revoked_at IS NULL`,
        [sessionToken]
      );
      const resolvedClientId = sessRes.rows?.[0]?.client_id;
      if (!resolvedClientId) {
        try { client.release(); } catch (_) { /* ignore */ }
        // Ticket D: 200 → 401 (см. merge_save handler выше).
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'invalid_session' })
        };
      }

      const untilTs = untilTsRaw || new Date().toISOString();
      // 🛡️ FIX 2026-05-23: precision-mismatch JS↔PG.
      // JS Date.toISOString() режет timestamp до миллисекунд (.566Z), PG хранит
      // микросекунды (.566961). Клиент шлёт last entry.created_at в untilTs:
      // если pg-driver вернул created_at как JS Date, точность УЖЕ потеряна в Node
      // (см. строку 2093 — r.created_at.toISOString()). Сервер делает UPDATE с
      // untilTs = .566Z, сравнение `created_at <= .566000` пропускает .566961 —
      // запись остаётся unacked, на следующем запросе возвращается снова,
      // банер показывается повторно после каждого "Понял".
      // Лечим +1мс tolerance к obоим сравнениям:
      //  - acked_at: захватываем записи с микросекундами в пределах той же ms.
      //  - last_seen_at: устанавливаем на 1мс позже, чтобы следующий SELECT
      //    (`created_at > last_seen_at`) не вернул только что acked записи.
      const untilTsTolerantSql = `($2::timestamptz + INTERVAL '1 millisecond')`;
      await client.query('BEGIN');
      try {
        await client.query(
          `UPDATE clients
              SET curator_actions_last_seen_at = GREATEST(
                COALESCE(curator_actions_last_seen_at, 'epoch'::timestamptz),
                ${untilTsTolerantSql}
              )
            WHERE id = $1::uuid`,
          [resolvedClientId, untilTs]
        );
        await client.query(
          `UPDATE client_data_changelog
              SET acked_at = NOW()
            WHERE client_id = $1::uuid
              AND acked_at IS NULL
              AND created_at <= ${untilTsTolerantSql}`,
          [resolvedClientId, untilTs]
        );
        await client.query('COMMIT');
      } catch (ackErr) {
        try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
        try { client.release(true); } catch (_) { /* noop */ }
        console.error('[ack_curator_changelog] failed:', ackErr.message);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: ackErr.message })
        };
      }

      try { client.release(); } catch (_) { /* ignore */ }
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, acked_until: untilTs })
      };
    }

    // 📝 SPECIAL: batch_upsert_client_kv_by_curator
    // SQL функция делает UPSERT, но НЕ пишет changelog — это делается здесь
    // с семантическим diff'ом (computeCuratorActionPayload) по каждому ключу.
    if (fnName === 'batch_upsert_client_kv_by_curator') {
      const targetClientId = params.p_client_id || params.client_id;
      const items = Array.isArray(params.p_items) ? params.p_items : [];
      if (!targetClientId || !curatorId) {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'Missing p_client_id or curator auth' })
        };
      }
      if (items.length === 0) {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, saved: 0 })
        };
      }

      // Ticket B: server-side blacklist для batch path. Отфильтровываем
      // non-client-data ключи из items + audit row. Не падаем — продолжаем
      // batch с оставшимися items (legitimate client-data сохраняется).
      const filteredItems = [];
      const rejectedKeys = [];
      for (const it of items) {
        const ik = it && it.k;
        if (isNonClientDataKey(ik)) {
          rejectedKeys.push(ik);
        } else {
          filteredItems.push(it);
        }
      }
      if (rejectedKeys.length > 0) {
        try {
          await client.query(
            `INSERT INTO data_loss_audit (client_id, key, action, allowed, reason)
             SELECT $1::uuid, unnest($2::text[]), 'non_client_data_rejected', FALSE, 'blacklist_curator_batch'`,
            [targetClientId, rejectedKeys]
          );
        } catch (auditErr) {
          console.warn('[batch_upsert] blacklist audit insert failed:', auditErr.message);
        }
      }
      // Replace items with filtered set; downstream код больше не видит rejected keys.
      items.length = 0;
      items.push(...filteredItems);
      if (items.length === 0) {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, saved: 0, rejected: rejectedKeys.length, error: rejectedKeys.length ? 'not_client_data' : undefined })
        };
      }

      // 1) Pre-SELECT OLD values одним запросом для diff'a.
      const keysList = items.map(it => it && it.k).filter(k => typeof k === 'string');
      let oldByKey = new Map();
      if (keysList.length > 0) {
        try {
          const oldRows = await client.query(
            'SELECT k, v FROM client_kv_store WHERE client_id = $1::uuid AND k = ANY($2::text[])',
            [targetClientId, keysList]
          );
          for (const row of oldRows.rows) {
            oldByKey.set(row.k, row.v);
          }
        } catch (selErr) {
          // Если SELECT упал — продолжаем без OLD (diff покажет всё как added).
          console.warn('[batch_upsert] OLD select failed:', selErr.message);
        }
      }

      // 2) Вызываем PL/pgSQL функцию (она делает ownership check + UPSERT).
      let upsertResult;
      try {
        const r = await client.query(
          'SELECT * FROM batch_upsert_client_kv_by_curator(p_curator_id => $1::uuid, p_client_id => $2::uuid, p_items => $3::jsonb)',
          [curatorId, targetClientId, JSON.stringify(items)]
        );
        upsertResult = r.rows[0]?.batch_upsert_client_kv_by_curator || r.rows[0] || {};
      } catch (upsertErr) {
        try { client.release(true); } catch (_) { /* noop */ }
        console.error('[batch_upsert] upsert failed:', upsertErr.message);
        return {
          statusCode: 500,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, saved: 0, error: upsertErr.message })
        };
      }

      // 3) Если ownership упал — не пишем changelog.
      if (upsertResult && upsertResult.success === false) {
        try { client.release(); } catch (_) { /* ignore */ }
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(upsertResult)
        };
      }

      // 4) Best-effort: compute diff и INSERT в changelog.
      try {
        const allActions = [];
        const loggedKeys = [];
        for (const it of items) {
          if (!it || typeof it.k !== 'string') continue;
          const oldV = oldByKey.has(it.k) ? oldByKey.get(it.k) : null;
          const newV = it.v;
          const payload = computeCuratorActionPayload(oldV, newV, it.k);
          if (payload && Array.isArray(payload.actions) && payload.actions.length > 0) {
            allActions.push(...payload.actions);
            loggedKeys.push(it.k);
          }
        }
        if (allActions.length > 0) {
          const ACTIONS_CAP = 50;
          let finalActions = allActions;
          if (allActions.length > ACTIONS_CAP) {
            finalActions = allActions.slice(0, ACTIONS_CAP - 1);
            finalActions.push({ type: 'truncated', count: allActions.length - finalActions.length });
          }
          await client.query(
            `INSERT INTO client_data_changelog (client_id, curator_id, keys_updated, actions)
             VALUES ($1::uuid, $2::uuid, $3::text[], $4::jsonb)`,
            [
              targetClientId,
              curatorId,
              loggedKeys,
              JSON.stringify({ actions: finalActions }),
            ]
          );
        }
      } catch (changelogErr) {
        console.warn('[batch_upsert] changelog insert failed:', changelogErr.message);
      }

      try { client.release(); } catch (_) { /* ignore */ }

      // P1-B audit: batch_upsert_client_kv_by_curator — куратор пишет health-data
      logCuratorAccessFireAndForget(
        getPool('heys-api-rpc'), fnName, curatorId, params, clientIp,
        event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      );

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(upsertResult)
      };
    }

    // 🛟 SAFE FALLBACK: get_client_data_by_session
    // Причина: в некоторых прод-данных возможны дубликаты по ключу (k),
    // что ломает jsonb_object_agg внутри функции и даёт 500.
    // Здесь собираем данные с DISTINCT ON (k) по updated_at.
    if (fnName === 'get_client_data_by_session') {
      const sessionToken = params.p_session_token;
      const since = params.p_since || null; // 🚀 Delta Sync: ISO timestamp
      if (!sessionToken) {
        client.release();
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Missing p_session_token' })
        };
      }

      // 1) Валидируем сессию
      const sessionRes = await client.query(
        `select client_id
         from client_sessions
         where token_hash = digest($1, 'sha256')
           and expires_at > now()
           and revoked_at is null`,
        [sessionToken]
      );

      const clientId = sessionRes.rows?.[0]?.client_id;
      if (!clientId) {
        client.release();
        // Ticket D: 200 → 401 (см. merge_save handler выше). Body унификация:
        // добавлен `ok: false` для consistency с другими invalid_session-paths.
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ ok: false, error: 'invalid_session' })
        };
      }

      // 2) Собираем KV с защитой от дублей
      // 🚀 Delta Sync: если передан p_since — возвращаем только обновлённые ключи
      const queryParams = [clientId];
      const sinceFilter = since ? `and updated_at > $2::timestamptz` : '';
      if (since) queryParams.push(since);

      const dataRes = await client.query(
        `select jsonb_object_agg(
            k,
            case
              when key_version is not null and v_encrypted is not null
                then coalesce(decrypt_health_data(v_encrypted), v)
              else v
            end
          ) as payload
         from (
           select distinct on (k)
             k, v, v_encrypted, key_version, updated_at
           from client_kv_store
           where client_id = $1 ${sinceFilter}
           order by k, updated_at desc nulls last
         ) t`,
        queryParams
      );

      const payload = dataRes.rows?.[0]?.payload || {};
      const isDelta = !!since;

      client.release();

      console.info(`[RPC] get_client_data_by_session: ${Object.keys(payload).length} keys${isDelta ? ' (delta since ' + since + ')' : ' (full)'}`);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          client_id: clientId,
          data: payload,
          delta: isDelta
        })
      };
    }

    // Формируем вызов RPC функции
    paramKeys = Object.keys(params);

    // Ticket B follow-up: PIN-path defence-in-depth для generic dispatch.
    // merge_save_*_by_session / batch_upsert_client_kv_by_curator уже гейтятся
    // в specific handlers выше. Здесь покрываем single+batch PIN-write paths.
    // delete_client_kv_by_session НЕ гейтится — удалить случайно осевший
    // blacklisted key OK (cleanup).
    if (fnName === 'upsert_client_kv_by_session' && isNonClientDataKey(params.p_key)) {
      console.warn('[RPC] blocked non-client-data key (upsert_client_kv_by_session):', params.p_key);
      try { client.release(); } catch (_) { /* ignore */ }
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, success: false, error: 'not_client_data', key: params.p_key })
      };
    }
    if (fnName === 'batch_upsert_client_kv_by_session' && Array.isArray(params.p_items)) {
      const _rejected = [];
      const _filtered = [];
      for (const it of params.p_items) {
        if (isNonClientDataKey(it && it.k)) {
          _rejected.push(it.k);
        } else {
          _filtered.push(it);
        }
      }
      if (_rejected.length > 0) {
        console.warn('[RPC] filtered non-client-data keys (batch_upsert_client_kv_by_session):', _rejected);
        params.p_items = _filtered;
        // Если после фильтрации items пуст — short-circuit, SQL функция всё равно
        // вернёт пустой результат, но мы экономим один DB round-trip.
        if (params.p_items.length === 0) {
          try { client.release(); } catch (_) { /* ignore */ }
          return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ success: true, saved: 0, rejected: _rejected.length, error: 'not_client_data' })
          };
        }
      }
    }

    // 🔐 P2: Для некоторых функций нужны явные типы (pg передаёт unknown)
    const TYPE_HINTS = {
      'verify_client_pin_v3': {
        'p_phone': '::text',
        'p_pin': '::text',
        'p_ip': '::text',
        'p_user_agent': '::text'
      },
      // 🔐 P2: KV функции требуют явные типы
      'get_client_kv_by_session': {
        'p_session_token': '::text',
        'p_key': '::text'
      },
      'batch_upsert_client_kv_by_session': {
        'p_session_token': '::text',
        'p_items': '::jsonb'
      },
      'batch_get_client_kv_by_session': {
        'p_session_token': '::text',
        'p_keys': '::text[]'
      },
      'get_change_markers_by_session': {
        'p_session_token': '::text',
        'p_since': '::timestamptz'
      },
      'upsert_client_kv_by_session': {
        'p_session_token': '::text',
        'p_key': '::text',
        'p_value': '::jsonb'
      },
      'delete_client_kv_by_session': {
        'p_session_token': '::text',
        'p_key': '::text'
      },
      'update_client_profile_by_session': {
        'p_session_token': '::text',
        'p_name': '::text'
      },
      'get_client_data_by_session': {
        'p_session_token': '::text',
        'p_since': '::text'  // 🚀 Delta Sync: optional ISO timestamp
      },
      // 🔐 EWS Weekly Snapshots (Wave 3.1 cloud sync)
      'upsert_weekly_snapshot_by_session': {
        'p_session_token': '::text',
        'p_week_start': '::date',
        'p_week_end': '::date',
        'p_week_number': '::int',
        'p_year': '::int',
        'p_warnings_count': '::int',
        'p_global_score': '::int',
        'p_severity_breakdown': '::jsonb',
        'p_top_warnings': '::jsonb'
      },
      'get_weekly_snapshots_by_session': {
        'p_session_token': '::text',
        'p_weeks_count': '::int'
      },
      'delete_old_weekly_snapshots_by_session': {
        'p_session_token': '::text',
        'p_weeks_to_keep': '::int'
      },
      // 🔐 Curator-only функции
      'get_curator_clients': {
        'p_curator_id': '::uuid'
      },
      'create_pending_product_by_session': {
        'p_session_token': '::text',
        'p_product_name': '::text',
        'p_product_data': '::jsonb'
      },
      // 🔐 P3: Публикация продуктов кураторами
      'publish_shared_product_by_session': {
        'p_session_token': '::text',
        'p_product_data': '::jsonb'
      },
      'publish_shared_product_by_curator': {
        'p_curator_id': '::uuid',
        'p_product_data': '::jsonb'
      },
      // 🔐 Получение shared products
      'get_shared_products': {
        'p_search': '::text',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      // 🔐 Обновление порций продукта
      'update_shared_product_portions': {
        'p_session_token': '::text',
        'p_product_id': '::uuid',
        'p_portions': '::jsonb'
      },
      // 🔐 Обновление порций куратором (JWT auth)
      'update_shared_product_portions_by_curator': {
        'p_curator_id': '::uuid',
        'p_product_id': '::uuid',
        'p_portions': '::jsonb'
      },
      // === LEADERBOARD ===
      'toggle_leaderboard_sharing_by_session': {
        'p_session_token': '::text',
        'p_enabled': '::boolean',
        'p_display_name': '::text'
      },
      'publish_leaderboard_snapshot_by_session': {
        'p_session_token': '::text',
        'p_snapshot_date': '::date',
        'p_display_name': '::text',
        'p_day_balance': '::numeric',
        'p_cascade_pct': '::numeric'
      },
      'get_leaderboard_by_session': {
        'p_session_token': '::text',
        'p_snapshot_date': '::date'
      },
      'get_leaderboard_weekly_by_session': {
        'p_session_token': '::text',
        'p_today_date': '::date'
      },
      // === GAMIFICATION AUDIT ===
      'log_gamification_event_by_session': {
        'p_session_token': '::text',
        'p_action': '::text',
        'p_reason': '::text',
        'p_xp_before': '::int',
        'p_xp_after': '::int',
        'p_xp_delta': '::int',
        'p_level_before': '::int',
        'p_level_after': '::int',
        'p_achievements_before': '::int',
        'p_achievements_after': '::int',
        'p_metadata': '::jsonb'
      },
      'log_gamification_event_by_curator': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid',
        'p_action': '::text',
        'p_reason': '::text',
        'p_xp_before': '::int',
        'p_xp_after': '::int',
        'p_xp_delta': '::int',
        'p_level_before': '::int',
        'p_level_after': '::int',
        'p_achievements_before': '::int',
        'p_achievements_after': '::int',
        'p_metadata': '::jsonb'
      },
      'get_gamification_events_by_session': {
        'p_session_token': '::text',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      'get_gamification_events_by_curator': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      'delete_gamification_events_by_curator': {
        'p_curator_id': '::uuid',
        'p_event_ids': '::uuid[]'
      },
      // === TRIAL QUEUE ADMIN ===
      'admin_get_trial_queue_list': {
        'p_curator_id': '::uuid',
        'p_status_filter': '::text',
        'p_search': '::text',
        'p_limit': '::int',
        'p_offset': '::int'
      },
      'admin_add_to_queue': {
        'p_client_id': '::uuid',
        'p_source': '::text',
        'p_priority': '::int',
        'p_curator_id': '::uuid'
      },
      'admin_remove_from_queue': {
        'p_client_id': '::uuid',
        'p_reason': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_send_offer': {
        'p_client_id': '::uuid',
        'p_offer_window_minutes': '::int',
        'p_curator_id': '::uuid'
      },
      // 🆕 v3.0: Manual trial activation with start date
      'admin_activate_trial': {
        'p_client_id': '::uuid',
        'p_start_date': '::date',
        'p_trial_days': '::int',
        'p_curator_id': '::uuid'
      },
      'admin_reject_request': {
        'p_client_id': '::uuid',
        'p_rejection_reason': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_get_queue_stats': {
        'p_curator_id': '::uuid'
      },
      'admin_update_queue_settings': {
        'p_is_accepting': '::boolean',
        'p_max_active': '::int',
        'p_offer_window_minutes': '::int',
        'p_trial_days': '::int',
        'p_curator_id': '::uuid'
      },
      // 🆕 v3.0: Leads management
      'admin_get_leads': {
        'p_status': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_convert_lead': {
        'p_lead_id': '::uuid',
        'p_pin': '::text',
        'p_curator_id': '::uuid'
      },
      'admin_update_lead_status': {
        'p_lead_id': '::uuid',
        'p_status': '::text',
        'p_reason': '::text',
        'p_curator_id': '::uuid'  // JWT authenticated curator (unused in function but required)
      },
      // 🔐 JWT-only: functions that need p_curator_id type hint
      'admin_get_all_clients': {
        'p_curator_id': '::uuid'
      },
      'admin_extend_trial': {
        'p_client_id': '::uuid',
        'p_days': '::int',
        'p_curator_id': '::uuid'
      },
      'admin_extend_subscription': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid',
        'p_months': '::int'
      },
      'admin_cancel_subscription': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid'
      },
      'create_client_with_pin': {
        'p_name': '::text',
        'p_phone': '::text',
        'p_pin_salt': '::text',
        'p_pin_hash': '::text',
        'p_curator_id': '::uuid'
      },
      'reset_client_pin': {
        'p_client_id': '::uuid',
        'p_pin_salt': '::text',
        'p_pin_hash': '::text',
        'p_curator_id': '::uuid'
      },
      // 🚀 Curator batch KV upsert (replaces cold heys-api-rest path)
      'batch_upsert_client_kv_by_curator': {
        'p_curator_id': '::uuid',
        'p_client_id': '::uuid',
        'p_items': '::jsonb'
      },
      // 📝 Event log: p_events требует ::jsonb hint, иначе pg-driver
      // сериализует массив объектов как Postgres array literal вместо jsonb
      // и client.query кидает JS-уровень exception без SQLSTATE → клиент
      // видит INTERNAL_ERROR / 500 "Database error". До этого fix'а ни одно
      // событие не доходило до SQL функции (см. todo.md «RPC 500
      // log_client_event_by_session», диагностика 2026-05-26).
      'log_client_event_by_session': {
        'p_session_token': '::text',
        'p_events': '::jsonb'
      }
    };

    const hints = TYPE_HINTS[fnName] || {};

    // PostgreSQL 14+ named parameters: p_phone => $1::text
    const paramNames = paramKeys.map((k, i) => {
      const hint = hints[k] || '';
      return `${k} => $${i + 1}${hint}`;
    }).join(', ');

    if (paramKeys.length > 0) {
      // Вызов функции с именованными параметрами
      query = `SELECT * FROM ${fnName}(${paramNames})`;
      // 🔐 P2: Для ::jsonb параметров нужен JSON.stringify (pg driver передаёт object as-is)
      values = paramKeys.map(k => {
        const hint = hints[k] || '';
        const val = params[k];
        // Если это jsonb и значение — объект/массив, сериализуем в строку
        if (hint === '::jsonb' && val !== null && typeof val === 'object') {
          return JSON.stringify(val);
        }
        return val;
      });
    } else {
      query = `SELECT * FROM ${fnName}()`;
      values = [];
    }

    if (fnName === 'get_curator_clients') {
      const shortCuratorId = params?.p_curator_id ? String(params.p_curator_id).slice(0, 8) : 'unknown';
      infoLog('[RPC] get_curator_clients start', { curatorId: shortCuratorId, hasCuratorId: !!params?.p_curator_id });
      debugLog('[RPC] get_curator_clients SQL', query);
    }

    const result = await client.query(query, values);

    if (fnName === 'get_curator_clients') {
      infoLog('[RPC] get_curator_clients success', { rows: result.rows?.length || 0 });
    }

    // 🔐 P2 FIX: Освобождаем клиент в pool ДО return (serverless best practice)
    client.release();

    // P1-B (2026-05-22): audit-log если это curator-action на конкретного
    // клиента (152-ФЗ ст.18.1). Fire-and-forget — не блокирует ответ.
    if (isCuratorFunction) {
      logCuratorAccessFireAndForget(
        getPool('heys-api-rpc'),
        fnName,
        curatorId,
        params,
        clientIp,
        event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null,
      );
    }

    // Phase C (2026-05-19): HttpOnly cookie carriage for client session.
    // On a successful `verify_client_pin_v3` response we mint
    // `heys_session_token` as HttpOnly + Secure + SameSite=Lax (Strict
    // blocks app.heyslab.ru → api.heyslab.ru in some browsers) so XSS in
    // the legacy IIFE bundles can no longer pluck the token from
    // localStorage. The body still returns the plain UUID for legacy JS
    // until we drop localStorage on the client; both paths interoperate.
    // `revoke_session` success clears the same cookie with Max-Age=0.
    const responseBody = result.rows.length === 1 ? result.rows[0] : result.rows;
    const finalHeaders = { ...corsHeaders };

    // pg returns scalar-functions wrapped as `{ <fnName>: <value> }`, so we
    // unwrap once before inspecting `success` / `session_token`.
    const inner = (responseBody && typeof responseBody === 'object' && fnName in responseBody)
      ? responseBody[fnName]
      : responseBody;

    if (fnName === 'verify_client_pin_v3'
        && inner && typeof inner === 'object'
        && inner.success === true
        && typeof inner.session_token === 'string') {
      const tok = encodeURIComponent(inner.session_token);
      finalHeaders['Set-Cookie'] =
        `heys_session_token=${tok}; Domain=.heyslab.ru; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
    } else if (fnName === 'revoke_session'
        && inner && typeof inner === 'object'
        && (inner.success === true || inner.revoked === true)) {
      finalHeaders['Set-Cookie'] =
        'heys_session_token=; Domain=.heyslab.ru; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
    }

    return {
      statusCode: 200,
      headers: finalHeaders,
      body: JSON.stringify(responseBody)
    };

  } catch (error) {
    // Детальное логирование для admin функций и критичных функций.
    // log_* — debug/audit функции, которые сами логируют события клиента.
    // Если ОНИ падают — нужны полные SQLSTATE/detail/hint, иначе мы не
    // увидим что внутри функции (особенно с EXCEPTION WHEN OTHERS THEN
    // RETURN — этот pattern глушит SQLERRM в RETURN value, но error
    // объект в JS catch всё равно несёт SQLSTATE если pg-driver получил
    // raw error до того как функция обернула его в JSONB).
    const needsDetailedLog = fnName.startsWith('admin_')
      || fnName.startsWith('log_')
      || fnName === 'get_curator_clients';

    if (needsDetailedLog) {
      console.error('[RPC Error]', fnName, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        where: error.where,
        query: query || 'no query',
        params: paramKeys.length > 0 ? paramKeys.join(', ') : 'no params'
      });
    } else {
      console.error('[RPC Error]', fnName, error.message);
    }

    // Освобождаем клиент в pool даже при ошибке
    // 🛟 release(true) при connection errors — уничтожает мёртвое соединение
    const isConnectionError =
      error.message?.includes('Connection terminated') ||
      error.message?.includes('connection') ||
      error.code === 'ECONNRESET' ||
      error.code === 'EPIPE';
    try { client.release(isConnectionError); } catch (e) { /* ignore */ }

    // 🔐 P0001 = RAISE EXCEPTION (бизнес-ошибка, НЕ сбой БД)
    // Возвращаем 200 с error-объектом, чтобы фронтенд парсил корректно
    if (error.code === 'P0001') {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          error: error.message,
          code: error.code
        })
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Database error',
        message: 'Internal server error',
        code: error.code || 'INTERNAL_ERROR'
      })
    };
  }
};
// deployed at 2026-02-05 01:25:37
