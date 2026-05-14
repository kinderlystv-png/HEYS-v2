/**
 * HEYS API RPC — Yandex Cloud Function
 * PostgreSQL RPC вызовы напрямую к Yandex.Cloud PostgreSQL
 * v2.5.3 — verify stable deployment (2026-02-10)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { getPool } = require('./shared/db-pool');

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

// Загрузка CA сертификата Yandex Cloud
const CA_CERT_PATH = path.join(__dirname, 'certs', 'root.crt');
let CA_CERT = null;
try {
  if (fs.existsSync(CA_CERT_PATH)) {
    CA_CERT = fs.readFileSync(CA_CERT_PATH, 'utf8');
    debugLog('[RPC Init] CA cert loaded');
  } else {
    // 🔐 Это ошибка конфигурации, логируем всегда
    console.error('[RPC Init] CA cert NOT FOUND at:', CA_CERT_PATH);
  }
} catch (e) {
  console.error('[RPC Init] CA cert error:', e.message);
}

// Конфигурация PostgreSQL
const PG_CONFIG = {
  host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
  port: parseInt(process.env.PG_PORT || '6432'),
  database: process.env.PG_DATABASE || 'heys_production',
  user: process.env.PG_USER || 'heys_admin',
  password: process.env.PG_PASSWORD,
  ssl: CA_CERT ? {
    rejectUnauthorized: true,
    ca: CA_CERT
  } : {
    rejectUnauthorized: false
  },
  // Таймауты
  connectionTimeoutMillis: 5000,
  query_timeout: 10000
};

debugLog('[RPC Init] PG_CONFIG ssl:', CA_CERT ? 'verify-full with cert' : 'no verify');

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
  'batch_get_client_kv_by_session',       // 🔐 Phase 1a: пакетное чтение (hot-sync optimization)
  'get_change_markers_by_session',        // 🔐 Phase 1b: scoped change markers (conditional sync)
  'delete_client_kv_by_session',          // 🔐 P1: удаление KV (session-safe)

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
  'sync_shared_products_by_session',   // 🔐 Копирование всех shared_products в базу клиента
  'update_shared_product_portions',    // 🔐 Обновление порций продукта (direct UPDATE, не INSERT)
  'update_shared_product_portions_by_curator', // 🔐 Обновление порций куратором (JWT auth)

  // === LEADERBOARD (🏆 global opt-in leaderboard) ===
  'toggle_leaderboard_sharing_by_session',
  'publish_leaderboard_snapshot_by_session',
  'get_leaderboard_by_session',
  'get_leaderboard_weekly_by_session',

  // === CONSENTS ===
  'log_consents',                     // Логирование согласий с ПЭП
  'log_consents_by_session',          // 🔐 Session-safe: client_id из сессии (IDOR protection)
  'check_required_consents',          // Проверка обязательных согласий
  'check_payment_consent_by_session', // 🔐 Session-safe: проверка payment_oferta перед оплатой
  'revoke_consent',                   // Отзыв согласия
  'get_client_consents',              // Получение всех согласий клиента

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
];

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

module.exports.handler = async function (event, context) {
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

  // 🔐 Для curator-only функций требуется JWT
  let curatorId = null;
  if (isCuratorFunction) {
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
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

    const token = authHeader.slice(7);
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
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'invalid_session' })
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

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.rows.length === 1 ? result.rows[0] : result.rows)
    };

  } catch (error) {
    // Детальное логирование для admin функций и критичных функций
    const needsDetailedLog = fnName.startsWith('admin_') || fnName === 'get_curator_clients';

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
