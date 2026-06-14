/**
 * HEYS Cron Security Alerts — детект подозрительных событий и алерт в Telegram.
 *
 * Юр. контекст: 152-ФЗ ст. 22.3 — оператор обязан уведомить РКН об инциденте
 * с ПДн в течение 24 часов (о факте) и 72 часов (о результатах). Эта функция
 * автоматизирует первичный детект, чтобы автор мог быстро принять решение.
 *
 * Запуск: timer trigger в Yandex Cloud (рекомендация — каждые 15 минут).
 * Cooldown: каждое правило не отправляет алерт повторно в течение 30 минут
 * (хранится в таблице security_alerts_log).
 *
 * Env vars (загружаются deploy-all.sh):
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (опционально — без них функция
 *   только логирует в БД)
 */

const http = require('http');
const https = require('https');

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');

const COOLDOWN_MINUTES = 30;
const WINDOW_MINUTES = 60;

// Telegram-токены подтягиваются initSecrets() из Lockbox в process.env —
// читаем напрямую в sendAlert ниже.

// ── Concurrency watch (rolled out 2026-05-22) ─────────────────────────────
// 5 API-функций переведены на concurrency=2. Этот блок проверяет пиковую
// память (used_memory_bytes) через YC Monitoring API. Если приближается к
// лимиту → Telegram-алерт. OOM = верный признак что concurrency=2 не
// вытягивает; нужно откатить на 1 (см. todo.md → Item 2 / plan
// 1-5-cheeky-micali.md → Item 2).
//
// ⚠️ Изначально пытался читать логи через Cloud Logging Reader API, но он
// gRPC-only без HTTP/JSON gateway → "socket hang up". Перевёл на Monitoring
// API metric (HTTP) с порогом по памяти.
const API_FUNCTIONS = [
  { name: 'heys-api-rpc', memory_mb: 512 },
  { name: 'heys-api-rest', memory_mb: 512 },
  { name: 'heys-api-auth', memory_mb: 256 },
  { name: 'heys-api-leads', memory_mb: 256 },
  { name: 'heys-api-push', memory_mb: 256 },
];
// Алертим если used_memory > 90% от лимита (memory_mb * 0.9 * 1MB).
const MEMORY_WARN_THRESHOLD_RATIO = 0.9;
const MONITORING_API_HOST = 'monitoring.api.cloud.yandex.net';
const FOLDER_ID = 'b1gnv1a4q8i6de6atl6n';

// Правила детектирования. Каждое — SQL-запрос, возвращающий 0 или 1+ строк.
// Если есть строки → правило сработало.
const RULES = [
  {
    key: 'brute_force_ip',
    label: '🔴 Brute force по PIN с одного IP',
    description:
      'Более 10 неудачных PIN-попыток с одного IP за последний час. ' +
      'Подозрение на перебор паролей.',
    sql: `
      SELECT
        host(ip_address) AS ip_address,
        COUNT(*)::int AS failed_count,
        COUNT(DISTINCT phone)::int AS distinct_phones
      FROM security_events
      WHERE event_type = 'pin_failed'
        AND ip_address IS NOT NULL
        AND created_at > NOW() - ($1 || ' minutes')::INTERVAL
      GROUP BY ip_address
      HAVING COUNT(*) > 10
      ORDER BY failed_count DESC
      LIMIT 5
    `,
  },
  {
    key: 'coordinated_locks',
    label: '🔴 Массовые блокировки PIN-аккаунтов',
    description:
      'Более 3 разных клиентов получили блокировку аккаунта за последний час. ' +
      'Возможна координированная атака.',
    sql: `
      SELECT
        COUNT(DISTINCT COALESCE(client_id::text, phone))::int AS locked_distinct
      FROM security_events
      WHERE event_type = 'pin_locked'
        AND created_at > NOW() - ($1 || ' minutes')::INTERVAL
      HAVING COUNT(DISTINCT COALESCE(client_id::text, phone)) > 3
    `,
  },
  {
    key: 'mass_account_deletion',
    label: '⚠️ Массовое удаление аккаунтов',
    description:
      'Более 2 аккаунтов удалено за последний час. Проверьте, легитимные ли действия.',
    sql: `
      SELECT COUNT(*)::int AS deleted_count
      FROM security_events
      WHERE event_type = 'account_deleted'
        AND created_at > NOW() - ($1 || ' minutes')::INTERVAL
      HAVING COUNT(*) > 2
    `,
  },
  // P1-L (2026-05-22): DSAR SLA-tracker — 152-ФЗ ст.21 ч.4, 10 рабочих дней.
  // Игнорируем $1 (WINDOW_MINUTES) — здесь окно не имеет смысла, проверяем
  // абсолютный дедлайн. Cooldown берёт на себя isOnCooldown по rule_key.
  {
    key: 'dsar_sla_warning',
    label: '🟡 DSAR-запрос: 2 дня до дедлайна',
    description:
      'Есть необработанные запросы субъектов ПДн с дедлайном через ≤2 дня. ' +
      '152-ФЗ ст.21 ч.4 — рассмотреть в 10 рабочих дней. Просрочка = риск штрафа.',
    sql: `
      SELECT $1::text AS _window_unused,
        id::text AS request_id,
        request_type,
        source,
        COALESCE(client_id::text, 'no-client') AS client_id,
        requested_at,
        sla_deadline,
        EXTRACT(EPOCH FROM (sla_deadline - now()))/86400 AS days_left
      FROM data_subject_requests
      WHERE processed_at IS NULL
        AND sla_deadline > now()
        AND sla_deadline <= now() + INTERVAL '2 days'
      ORDER BY sla_deadline
      LIMIT 10
    `,
  },
  {
    key: 'dsar_sla_breach',
    label: '🔴 DSAR-запрос: дедлайн ПРОСРОЧЕН',
    description:
      'Запрос субъекта ПДн НЕ обработан в срок 10 рабочих дней (152-ФЗ ст.21 ч.4). ' +
      'Срочно: обработать + быть готовым ответить РКН при жалобе.',
    sql: `
      SELECT $1::text AS _window_unused,
        id::text AS request_id,
        request_type,
        source,
        COALESCE(client_id::text, 'no-client') AS client_id,
        requested_at,
        sla_deadline,
        EXTRACT(EPOCH FROM (now() - sla_deadline))/86400 AS days_overdue
      FROM data_subject_requests
      WHERE processed_at IS NULL
        AND sla_deadline < now()
      ORDER BY sla_deadline
      LIMIT 10
    `,
  },
  // SEC-021 (2026-06-14): backup-chain watchdog. Существующее alerting в
  // heys-client-daily-backup срабатывает ТОЛЬКО когда функция запустилась
  // (partial failure). Если функция вообще не запускается (как в инциденте
  // 2026-04-14 → 2026-05-10, 27-дневная дыра, root-cause = accidentally
  // deleted version) — silence. Это правило ловит SILENT FAILURE: за
  // last 7 дней должно быть ≥5 success-INSERT'ов в backup_run_log; если
  // меньше — alert.
  {
    key: 'backup_chain_gap',
    label: '🔴 Backup-chain прерван',
    description:
      'За последние 7 дней зафиксировано <5 успешных backup-run\'ов. ' +
      'Возможно heys-client-daily-backup функция не запускается. Проверь: ' +
      '(1) yc serverless function version list --function-id <id> — есть ли активная версия; ' +
      '(2) yc serverless trigger get heys-client-daily-backup-timer — ACTIVE; ' +
      '(3) Cloud Functions web-console logs за последние сутки.',
    sql: `
      SELECT
        $1::text AS _window_unused,
        COUNT(*) FILTER (WHERE status = 'ok')::int AS ok_count_7d,
        COUNT(*) FILTER (WHERE status = 'partial')::int AS partial_count_7d,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count_7d,
        MAX(run_at) AS last_run_at,
        EXTRACT(EPOCH FROM (now() - COALESCE(MAX(run_at), '2000-01-01'::timestamptz)))/3600 AS hours_since_last
      FROM backup_run_log
      WHERE run_at > NOW() - INTERVAL '7 days'
      HAVING COUNT(*) FILTER (WHERE status = 'ok') < 5
    `,
  },
];

async function isOnCooldown(client, ruleKey) {
  const res = await client.query(
    `SELECT 1
       FROM security_alerts_log
      WHERE rule_key = $1
        AND telegram_sent_at IS NOT NULL
        AND telegram_sent_at > NOW() - ($2 || ' minutes')::INTERVAL
      LIMIT 1`,
    [ruleKey, COOLDOWN_MINUTES],
  );
  return res.rows.length > 0;
}

async function recordAlert(client, ruleKey, payload, sent, messageId) {
  await client.query(
    `INSERT INTO security_alerts_log
       (rule_key, triggered_count, payload, telegram_sent_at, telegram_message_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      ruleKey,
      Number(payload.count || 0),
      payload,
      sent ? new Date() : null,
      messageId || null,
    ],
  );
}

// ── YC Cloud Logging helpers (для concurrency-watch) ──────────────────────

function fetchJson(transport, options, body) {
  return new Promise((resolve, reject) => {
    // Precompute body + set Content-Length, иначе YC API закрывает соединение
    // ("socket hang up") при chunked-encoded POST'ах от Node.js.
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) {
      options.headers = options.headers || {};
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const req = transport.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${chunks.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(new Error(`Invalid JSON: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Request timeout')));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function getIamTokenForLogging() {
  // YC metadata server — HTTP port 80, header Metadata-Flavor: Google
  const meta = await new Promise((resolve, reject) => {
    const req = http.get({
      host: '169.254.169.254',
      port: 80,
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      headers: { 'Metadata-Flavor': 'Google' },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Metadata timeout')));
  });
  if (!meta || !meta.access_token) throw new Error('No access_token from metadata');
  return meta.access_token;
}

async function readPeakMemory(functionName, sinceMinutes, iamToken) {
  // Query Monitoring API для max(used_memory_bytes) за окно.
  // Возвращает максимум по всем версиям/bin'ам за window.
  const now = new Date();
  const since = new Date(now.getTime() - sinceMinutes * 60 * 1000);
  const body = {
    query:
      `"serverless.functions.used_memory_bytes"{service="serverless-functions", function="${functionName}"}`,
    fromTime: since.toISOString(),
    toTime: now.toISOString(),
    downsampling: { maxPoints: 10, aggregation: 'MAX' },
  };
  const resp = await fetchJson(https, {
    method: 'POST',
    hostname: MONITORING_API_HOST,
    path: `/monitoring/v2/data/read?folderId=${FOLDER_ID}`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${iamToken}`,
    },
  }, body);
  let peak = 0;
  for (const m of resp.metrics || []) {
    const values = m.timeseries?.doubleValues || [];
    for (const v of values) {
      const n = Number(v);
      if (Number.isFinite(n) && n > peak) peak = n;
    }
  }
  return peak;  // bytes
}

async function checkConcurrencyIssues() {
  let iamToken;
  try { iamToken = await getIamTokenForLogging(); }
  catch (err) {
    console.error('[concurrency-watch] failed to get IAM token:', err.message);
    return [];
  }

  const issues = [];
  for (const fn of API_FUNCTIONS) {
    try {
      const peakBytes = await readPeakMemory(fn.name, WINDOW_MINUTES, iamToken);
      const peakMB = peakBytes / 1024 / 1024;
      const limitMB = fn.memory_mb;
      const ratio = peakMB / limitMB;
      console.log(`[concurrency-watch] ${fn.name}: peak ${peakMB.toFixed(1)}MB / ${limitMB}MB (${(ratio * 100).toFixed(1)}%)`);
      if (ratio >= MEMORY_WARN_THRESHOLD_RATIO) {
        issues.push({
          function: fn.name,
          peak_mb: Math.round(peakMB),
          limit_mb: limitMB,
          ratio_pct: Math.round(ratio * 100),
        });
      }
    } catch (err) {
      console.error(`[concurrency-watch] metric read failed for ${fn.name}:`, err.message);
    }
  }
  return issues;
}

async function sendTelegram(rule, rows) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return { sent: false, messageId: null, reason: 'telegram not configured' };
  }

  const linesPreview = rows
    .slice(0, 5)
    .map((row) => '`' + JSON.stringify(row).slice(0, 180) + '`')
    .join('\n');

  const text =
    `${rule.label}\n\n` +
    `${rule.description}\n\n` +
    `Окно анализа: ${WINDOW_MINUTES} мин\n` +
    `Триггер-строк: ${rows.length}\n\n` +
    linesPreview +
    `\n\n_Правило: ${rule.key}_\n` +
    `_152-ФЗ ст. 22.3 — при подтверждении уведомить РКН в 24ч._`;

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      },
    );
    const data = await resp.json();
    if (!data.ok) {
      console.error('[security-alerts] Telegram API error:', data);
      return { sent: false, messageId: null, reason: data.description || 'tg error' };
    }
    return {
      sent: true,
      messageId: data.result?.message_id ? String(data.result.message_id) : null,
      reason: null,
    };
  } catch (error) {
    console.error('[security-alerts] Telegram fetch failed:', error.message);
    return { sent: false, messageId: null, reason: error.message };
  }
}

module.exports.handler = async function () {
  await initSecrets();

  const pool = getPool();
  const client = await pool.connect();
  const results = [];

  try {
    for (const rule of RULES) {
      let rows = [];
      try {
        const queryRes = await client.query(rule.sql, [WINDOW_MINUTES]);
        rows = queryRes.rows || [];
      } catch (err) {
        console.error(`[security-alerts] Rule ${rule.key} query failed:`, err.message);
        results.push({ rule: rule.key, status: 'query_error', error: err.message });
        continue;
      }

      if (!rows.length) {
        results.push({ rule: rule.key, status: 'clean' });
        continue;
      }

      if (await isOnCooldown(client, rule.key)) {
        results.push({ rule: rule.key, status: 'cooldown', triggered: rows.length });
        continue;
      }

      const telegram = await sendTelegram(rule, rows);
      const payload = {
        count: rows.length,
        sample: rows.slice(0, 5),
        telegram_reason: telegram.reason,
      };
      await recordAlert(client, rule.key, payload, telegram.sent, telegram.messageId);

      results.push({
        rule: rule.key,
        status: telegram.sent ? 'alert_sent' : 'logged_only',
        triggered: rows.length,
      });
    }

    // ── Concurrency watch ─────────────────────────────────────────────
    try {
      const issues = await checkConcurrencyIssues();
      if (!issues.length) {
        results.push({ rule: 'concurrency_watch', status: 'clean' });
      } else if (await isOnCooldown(client, 'concurrency_watch')) {
        results.push({ rule: 'concurrency_watch', status: 'cooldown', triggered: issues.length });
      } else {
        const concurrencyRule = {
          key: 'concurrency_watch',
          label: '⚠️ Concurrency=2: OOM/pool issues',
          description:
            'В логах одной из 5 API-функций найдены ошибки памяти или БД-пула. ' +
            'Возможно, нужно откатить concurrency на 1 в deploy-all.sh.',
        };
        const telegram = await sendTelegram(concurrencyRule, issues);
        await recordAlert(
          client,
          'concurrency_watch',
          { count: issues.length, sample: issues, telegram_reason: telegram.reason },
          telegram.sent,
          telegram.messageId,
        );
        results.push({
          rule: 'concurrency_watch',
          status: telegram.sent ? 'alert_sent' : 'logged_only',
          triggered: issues.length,
        });
      }
    } catch (err) {
      console.error('[security-alerts] concurrency_watch error:', err.message);
      results.push({ rule: 'concurrency_watch', status: 'check_error', error: err.message });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        checked_rules: RULES.length + 1,
        results,
        window_minutes: WINDOW_MINUTES,
      }),
    };
  } catch (error) {
    console.error('[security-alerts] Fatal:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  } finally {
    client.release();
  }
};
