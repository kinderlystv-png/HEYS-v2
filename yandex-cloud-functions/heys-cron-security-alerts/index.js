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
// 5 API-функций переведены на concurrency=2. Этот блок сканирует логи в
// поисках ошибок памяти / БД-пула и шлёт Telegram-алерт если они появятся.
// Если алерт прилетел → откатить concurrency на 1 в deploy-all.sh и
// передеплоить (см. plan 1-5-cheeky-micali.md → Item 2).
const API_FUNCTION_IDS = {
  'heys-api-rpc': 'd4e9e90es31bgjp87j8i',
  'heys-api-rest': 'd4ea4j7eh05rtkjubipt',
  'heys-api-auth': 'd4ef3c4o67vdg7o4c4d3',
  'heys-api-leads': 'd4eml8vh341v41642cdu',
  'heys-api-push': 'd4e2d7p20llki46ctf2b',
};
const LOG_GROUP_ID = 'e23ndggvq798r3v3eepq';  // default log group
const CONCURRENCY_ERROR_PATTERN =
  /out of memory|OOM|memory size limit exceeded|pool exhausted|too many connections|too many clients/i;

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
    if (body) req.write(JSON.stringify(body));
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

async function readFunctionLogs(functionId, sinceMinutes, iamToken) {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  const body = {
    log_group_id: LOG_GROUP_ID,
    criteria: {
      since,
      resource_types: ['serverless.functions'],
      resource_ids: [functionId],
      page_size: 100,
      levels: ['ERROR', 'FATAL', 'WARN'],
    },
  };
  return fetchJson(https, {
    method: 'POST',
    hostname: 'reader.logging.yandexcloud.net',
    path: '/logging/v1/log-events:read',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${iamToken}`,
    },
  }, body);
}

async function checkConcurrencyIssues() {
  let iamToken;
  try { iamToken = await getIamTokenForLogging(); }
  catch (err) {
    console.error('[concurrency-watch] failed to get IAM token:', err.message);
    return [];
  }

  const issues = [];
  for (const [fnName, fnId] of Object.entries(API_FUNCTION_IDS)) {
    try {
      const resp = await readFunctionLogs(fnId, WINDOW_MINUTES, iamToken);
      const entries = Array.isArray(resp?.events) ? resp.events : [];
      const matches = entries.filter((e) => CONCURRENCY_ERROR_PATTERN.test(e?.message || ''));
      if (matches.length > 0) {
        issues.push({
          function: fnName,
          count: matches.length,
          samples: matches.slice(0, 3).map((m) => (m.message || '').slice(0, 200)),
        });
      }
    } catch (err) {
      console.error(`[concurrency-watch] log read failed for ${fnName}:`, err.message);
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
