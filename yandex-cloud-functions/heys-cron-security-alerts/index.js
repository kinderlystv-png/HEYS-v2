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

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');

const COOLDOWN_MINUTES = 30;
const WINDOW_MINUTES = 60;

// Telegram-токены подтягиваются initSecrets() из Lockbox в process.env —
// читаем напрямую в sendAlert ниже.

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

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        checked_rules: RULES.length,
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
