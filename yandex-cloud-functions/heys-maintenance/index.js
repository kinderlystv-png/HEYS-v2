/**
 * heys-maintenance — Scheduled maintenance tasks
 * 
 * Functions:
 * - cleanup_security_logs: Remove old auth attempt logs (30 days)
 * - process_trial_queue: Assign trial offers to queued users
 * 
 * Trigger: Timer (every 5 minutes for trial queue, daily for cleanup)
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');

// DB pool — shared canonical implementation (CA-cert verify-full SSL).

// Telegram-токены подтягиваются initSecrets() из Lockbox в process.env —
// читаем напрямую в sendTelegramNotification ниже.

/**
 * Send Telegram notification (минимум ПДн — только ID)
 */
async function sendTelegramNotification(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.log('[Telegram] Not configured, skipping');
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      })
    });
    
    if (!response.ok) {
      console.warn('[Telegram] Failed to send:', response.status);
    }
  } catch (err) {
    console.error('[Telegram] Error:', err.message);
  }
}

/**
 * Process trial queue — assign offers to waiting users
 */
async function processTrialQueue(client) {
  console.log('[Trial Queue] Processing queue...');
  
  // 1. Expire old offers
  const expireResult = await client.query(`
    UPDATE trial_queue 
    SET status = 'expired', updated_at = now()
    WHERE status = 'offer' 
      AND offer_expires_at IS NOT NULL 
      AND offer_expires_at < now()
    RETURNING client_id
  `);
  
  if (expireResult.rowCount > 0) {
    console.log(`[Trial Queue] Expired ${expireResult.rowCount} offers`);
    
    // Логируем события
    for (const row of expireResult.rows) {
      await client.query(`
        INSERT INTO trial_queue_events (client_id, event_type, meta)
        VALUES ($1, 'offer_expired', '{"reason":"timeout"}')
      `, [row.client_id]);
    }
  }
  
  // 2. Assign new offers from queue
  // NOTE: assign_trials_from_queue returns jsonb with keys: assigned, expired, available_after
  const assignResult = await client.query(
    'SELECT assign_trials_from_queue($1) as result',
    [5] // Assign up to 5 at a time
  );
  
  const assignData = assignResult.rows[0]?.result || {};
  const assignedCount = assignData.assigned || 0;
  
  if (assignedCount > 0) {
    console.log(`[Trial Queue] Assigned ${assignedCount} new offers (expired: ${assignData.expired || 0})`);
    
    // Notify curator (без ПДн — только кол-во)
    await sendTelegramNotification(
      `🎟️ *Trial Queue*\n\n` +
      `Выдано ${assignedCount} новых offer.\n` +
      `Проверьте статус очереди в админке.`
    );
  }
  
  // 3. Get queue stats for logging
  const statsResult = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'queued') as queued,
      COUNT(*) FILTER (WHERE status = 'offer') as offers,
      COUNT(*) FILTER (WHERE status = 'assigned') as assigned
    FROM trial_queue
  `);
  
  const stats = statsResult.rows[0] || {};
  console.log(`[Trial Queue] Stats: queued=${stats.queued || 0}, offers=${stats.offers || 0}, assigned=${stats.assigned || 0}`);
  
  return {
    expired: expireResult.rowCount || 0,
    assigned: assignedCount,
    stats
  };
}

/**
 * Cleanup old security logs
 */
async function cleanupSecurityLogs(client) {
  const result = await client.query(
    'SELECT public.cleanup_security_logs($1) as deleted_count',
    [30] // Keep 30 days
  );
  return result.rows[0]?.deleted_count || 0;
}

/**
 * KV Storage health check — ловит индикаторы регрессий после фиксов 2026-05-23
 * (precision-mismatch ack, zombie xp_cache, race profile-subscription, и т.д.).
 * Шлёт Telegram alert если что-то выглядит аномально.
 *
 * Эквивалент scripts/db/monitor-stuck-rows.sql, но запускается автоматически.
 */
async function kvHealthCheck(client) {
  const findings = [];
  const summary = {};

  // 1. Unacked curator changelog. >5 unacked со старостью >24h = индикатор
  //    что ack RPC снова сломался или precision-mismatch вернулся.
  const unackedRes = await client.query(`
    SELECT count(*)::int AS unacked,
           extract(epoch FROM coalesce(max(now() - created_at), interval '0'))::int AS oldest_age_sec
    FROM client_data_changelog
    WHERE acked_at IS NULL
  `);
  summary.unacked = unackedRes.rows[0];
  if (unackedRes.rows[0].unacked > 5 && unackedRes.rows[0].oldest_age_sec > 86400) {
    findings.push(`📌 *Unacked changelog*: ${unackedRes.rows[0].unacked} записей, старейшей ${Math.round(unackedRes.rows[0].oldest_age_sec / 3600)}h — возможно precision-mismatch ack снова сломан (см. BUGS_HISTORY 2026-05-23)`);
  }

  // 2. Zombie heys_xp_cache_* должно быть 0 после LOCAL_ONLY_STORAGE_PREFIXES fix.
  const xpZombieRes = await client.query(`
    SELECT count(*)::int AS rows
    FROM client_kv_store WHERE k LIKE 'heys_xp_cache_%'
  `);
  summary.xp_zombie = xpZombieRes.rows[0].rows;
  if (xpZombieRes.rows[0].rows > 0) {
    findings.push(`🧟 *Zombie xp_cache*: ${xpZombieRes.rows[0].rows} строк — LOCAL_ONLY_STORAGE_PREFIXES не работает или старый bundle ещё пишет`);
  }

  // 3. Inline-cid suffix outliers. Известные ОК: last_grams (productId), combo,
  //    dismiss, chain, milestone (feature ids). Появление нового pattern = новый
  //    архитектурный outlier.
  const inlineCidRes = await client.query(`
    SELECT regexp_replace(k, '_[a-z0-9-]{8,}', '_<id>') AS k_pattern, count(*)::int AS rows
    FROM client_kv_store
    WHERE k ~ 'heys_[a-z_]+_[0-9a-f]{8}-'
    GROUP BY k_pattern
    HAVING regexp_replace(k, '_[a-z0-9-]{8,}', '_<id>') NOT IN (
      'heys_last_grams_<id>', 'heys_combo_<id>', 'heys_dismiss_<id>',
      'heys_chain_<id>', 'heys_milestone_<id>'
    )
  `);
  summary.unknown_inline_cid_patterns = inlineCidRes.rows.length;
  if (inlineCidRes.rows.length > 0) {
    const patterns = inlineCidRes.rows.map((r) => `\`${r.k_pattern}\` (${r.rows})`).join(', ');
    findings.push(`🆕 *Unknown inline-cid patterns*: ${patterns} — потенциальный новый outlier (см. BUGS_HISTORY 2026-05-23 п.5)`);
  }

  // 4. Profile subscription-only race indicator — профиль <500 байт без firstName
  //    у активного клиента (active_until > now) указывает что refreshProfileSubscription
  //    race снова сработал.
  const profileRaceRes = await client.query(`
    SELECT count(*)::int AS suspicious
    FROM client_kv_store kv
    INNER JOIN clients c ON c.id = kv.client_id
    WHERE kv.k = 'heys_profile'
      AND length(kv.v::text) < 500
      AND NOT (kv.v ? 'firstName')
      AND (kv.v ? 'subscription_status')
      AND c.subscription_status IN ('trial','active')
  `);
  summary.profile_race_suspicious = profileRaceRes.rows[0].suspicious;
  if (profileRaceRes.rows[0].suspicious > 0) {
    findings.push(`⚠️ *Profile subscription-only race*: ${profileRaceRes.rows[0].suspicious} активных клиентов имеют subscription-only профиль без personal — race вернулся`);
  }

  // 5. Микросекундные unacked timestamps. После tolerance fix должно быть 0
  //    (server +1ms интервал покрывает любые µs). Если >0 — tolerance не работает.
  const usRes = await client.query(`
    SELECT count(*)::int AS rows
    FROM client_data_changelog
    WHERE acked_at IS NULL
      AND extract(microseconds FROM created_at)::int % 1000 != 0
  `);
  summary.unacked_with_us = usRes.rows[0].rows;

  // 6. Топ-1 жирный ключ — для информирования о росте мусора.
  const topRes = await client.query(`
    SELECT k, sum(length(v::text))::int AS bytes
    FROM client_kv_store GROUP BY k ORDER BY sum(length(v::text)) DESC LIMIT 1
  `);
  summary.heaviest_key = topRes.rows[0];

  return { findings, summary };
}

/**
 * Periodic cleanup zombie KV rows — выполняет SQL из scripts/db/cleanup-zombie-keys.sql.
 * Запускается раз в неделю (отдельный trigger).
 */
async function kvZombieCleanup(client) {
  const stats = {};

  const tasks = [
    ['xp_cache', "k LIKE 'heys_xp_cache_%'"],
    ['insights_feedback_legacy', "k LIKE 'heys_insights_feedback_%' AND k != 'heys_insights_feedback'"],
    ['backups_and_overlays',
      "k LIKE 'heys_products_BACKUP_%' OR k LIKE 'heys_hidden_products_BACKUP_%' "
      + "OR k LIKE 'heys_products_overlay_v2_BACKUP_%' OR k LIKE 'heys_overlay_%' "
      + "OR k LIKE 'heys_products_pre_overlay_%'"],
    ['advice_trace', "k LIKE '%_advice_trace_day_v1'"],
    ['debug_test',
      "k IN ('test_key_new','_audit_test_','_test_upsert','test_curator_sync',"
      + "'test_jsonb_fix','test_jsonb_fix2','heys_profile_test','heys_debug_sync',"
      + "'test_key','test_large','heys_debug_gamification',"
      + "'heys_debug_yesterday_zero_payload','heys_debug_yesterday_info','heys_insights_debug')"],
  ];

  for (const [label, where] of tasks) {
    // eslint-disable-next-line no-await-in-loop
    const res = await client.query(
      `WITH del AS (DELETE FROM client_kv_store WHERE ${where} RETURNING length(v::text) AS sz)
       SELECT count(*)::int AS rows, coalesce(sum(sz),0)::bigint AS bytes FROM del`
    );
    stats[label] = res.rows[0];
  }
  return stats;
}

/**
 * Main handler for timer trigger
 * Supports multiple tasks via event.messages[0].details.trigger_id
 * - trial_queue: Process trial queue (every 5-10 minutes)
 * - daily_cleanup: Security logs cleanup (daily at 03:00 UTC)
 */
module.exports.handler = async (event, context) => {
  await initSecrets();

  // Source of trigger_id (по убыванию приоритета):
  //   1. Message Queue trigger: event.messages[0].details.trigger_id
  //   2. Timer trigger с --payload '{"trigger_id":"..."}' → event.payload (string)
  //   3. Manual invoke с body/data: event.trigger_id напрямую
  let triggerId = event.messages?.[0]?.details?.trigger_id;
  if (!triggerId && typeof event.payload === 'string') {
    try {
      const parsed = JSON.parse(event.payload);
      triggerId = parsed.trigger_id;
    } catch (_) { /* payload not JSON */ }
  }
  if (!triggerId) triggerId = event.trigger_id || 'default';
  console.log(`[Maintenance] Starting task: ${triggerId}`);

  let client;
  try {
    const pool = getPool();
    client = await pool.connect();
    
    const results = {};

    // Determine which tasks to run
    const runTrialQueue = triggerId === 'trial_queue' || triggerId === 'all' || triggerId === 'default';
    const runCleanup = triggerId === 'daily_cleanup' || triggerId === 'all';
    // KV health: ежедневно (daily trigger без явного id) + on-demand
    const runKVHealth = triggerId === 'kv_health' || triggerId === 'all' || triggerId === 'default';
    // KV cleanup: ТОЛЬКО по weekly trigger (никогда default — destructive)
    const runKVCleanup = triggerId === 'kv_cleanup' || triggerId === 'all';

    // Process trial queue
    if (runTrialQueue) {
      results.trial_queue = await processTrialQueue(client);
    }

    // Cleanup security logs
    if (runCleanup) {
      results.cleanup = {
        deleted_count: await cleanupSecurityLogs(client)
      };
      console.log(`[Maintenance] Cleanup: deleted ${results.cleanup.deleted_count} old entries`);
    }

    // KV health check + Telegram alert при аномалиях
    if (runKVHealth) {
      try {
        const { findings, summary } = await kvHealthCheck(client);
        results.kv_health = { findings_count: findings.length, summary };
        console.log('[Maintenance] KV health:', JSON.stringify(summary));
        if (findings.length > 0) {
          await sendTelegramNotification(
            `🩺 *KV Health Alert*\n\n${findings.join('\n\n')}\n\n` +
            `_Daily monitor from heys-maintenance. См. apps/web/BUGS_HISTORY.md 2026-05-23 для контекста._`
          );
        }
      } catch (kvErr) {
        console.error('[Maintenance] kv_health failed:', kvErr.message);
        results.kv_health = { error: kvErr.message };
      }
    }

    // KV zombie cleanup (weekly)
    if (runKVCleanup) {
      try {
        const stats = await kvZombieCleanup(client);
        results.kv_cleanup = stats;
        const totalRows = Object.values(stats).reduce((a, s) => a + (s.rows || 0), 0);
        const totalBytes = Object.values(stats).reduce((a, s) => a + Number(s.bytes || 0), 0);
        console.log(`[Maintenance] KV cleanup: removed ${totalRows} rows, ${(totalBytes/1024).toFixed(1)} KB`);
        // Alert только если удалили что-то существенное (>100 rows или >1MB)
        if (totalRows > 100 || totalBytes > 1024 * 1024) {
          await sendTelegramNotification(
            `🧹 *Weekly KV Cleanup*\n\n` +
            `Removed *${totalRows}* rows, freed *${(totalBytes/1024/1024).toFixed(2)} MB*\n\n` +
            Object.entries(stats)
              .filter(([, s]) => s.rows > 0)
              .map(([label, s]) => `• ${label}: ${s.rows} rows, ${(Number(s.bytes)/1024).toFixed(1)} KB`)
              .join('\n')
          );
        }
      } catch (clErr) {
        console.error('[Maintenance] kv_cleanup failed:', clErr.message);
        results.kv_cleanup = { error: clErr.message };
        await sendTelegramNotification(
          `🚨 *KV Cleanup failed*\n\nError: ${clErr.message.slice(0, 200)}`
        );
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        trigger_id: triggerId,
        results,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } catch (error) {
    console.error('[Maintenance] Error:', error.message);
    
    // Notify on critical errors
    if (error.message.includes('trial_queue') || error.message.includes('advisory')) {
      await sendTelegramNotification(
        `⚠️ *Maintenance Error*\n\n` +
        `Task: ${triggerId}\n` +
        `Error: ${error.message.slice(0, 100)}`
      );
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        trigger_id: triggerId,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } finally {
    if (client) client.release();
  }
};
