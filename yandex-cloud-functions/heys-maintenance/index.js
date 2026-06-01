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
// Markdown-safe escape: parse_mode='Markdown' — только _ * [ ` \ специальные.
function _mdEscape(str) {
  return String(str).replace(/[_*[`\\]/g, '\\$&');
}

// Форматирует список с обрезкой: первые maxVisible + «и ещё N».
function _truncateList(items, maxVisible, formatFn) {
  if (!items.length) return '';
  const visible = items.slice(0, maxVisible).map(formatFn).join(', ');
  const rest = items.length - maxVisible;
  return rest > 0 ? `${visible} и ещё ${rest}` : visible;
}

async function sendTelegramNotification(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.log('[Telegram] Not configured, skipping');
    return { ok: false, error: 'not-configured' };
  }

  // 4096-char limit guard
  if (message.length > 4000) {
    message = message.slice(0, 3900) + '\n\n…_(сообщение обрезано, >4000 символов)_';
  }

  // Первая попытка с Markdown. Если 400 — retry без parse_mode (plain text),
  // потому что Markdown в Telegram очень строгий и любой unescaped _ или *
  // приводит к 400. Plain text fallback гарантирует доставку.
  const tryOnce = async (parseMode) => {
    const body = { chat_id: chatId, text: message };
    if (parseMode) body.parse_mode = parseMode;
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, ok: response.ok, body: response.ok ? null : await response.text() };
  };

  try {
    const first = await tryOnce('Markdown');
    if (first.ok) return { ok: true };

    console.warn('[Telegram] Markdown send failed:', first.status, first.body?.slice(0, 300));

    // Diagnostic: какой кусок сообщения сломал parser
    const offsetMatch = first.body?.match(/byte offset (\d+)/);
    if (offsetMatch) {
      const offset = parseInt(offsetMatch[1], 10);
      const ctx = message.slice(Math.max(0, offset - 40), Math.min(message.length, offset + 40));
      console.warn('[Telegram] Markdown ctx @offset', offset, JSON.stringify(ctx));
    }

    // Fallback: plain text без markdown
    if (first.status === 400) {
      const second = await tryOnce(null);
      if (second.ok) {
        console.warn('[Telegram] Plain-text fallback succeeded');
        return { ok: true, fallback: 'plain-text' };
      }
      console.error('[Telegram] Plain-text fallback also failed:', second.status, second.body?.slice(0, 300));
      return { ok: false, error: `plain-text-${second.status}`, body: second.body };
    }

    return { ok: false, error: `markdown-${first.status}`, body: first.body };
  } catch (err) {
    console.error('[Telegram] Error:', err.message);
    return { ok: false, error: 'exception', message: err.message };
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
 * Cleanup client_log_trace — клиентский console buffer (2026-06-01).
 * Удерживаем 14 дней (диагностика recent инцидентов). Источник: миграция
 * 2026-06-01_create_client_log_trace.sql.
 */
async function cleanupClientLogTrace(client) {
  try {
    const res = await client.query(
      `WITH del AS (
         DELETE FROM public.client_log_trace
         WHERE captured_at < (NOW() - INTERVAL '14 days')
         RETURNING length(message) + length(coalesce(args::text, '')) AS sz
       )
       SELECT count(*)::int AS rows, coalesce(sum(sz), 0)::bigint AS bytes FROM del`
    );
    return res.rows[0] || { rows: 0, bytes: 0 };
  } catch (e) {
    // Table может не существовать на стейдже — fail-safe
    return { rows: 0, bytes: 0, error: e.message };
  }
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
 * Ежедневный отчёт в Telegram — активность клиентов + trial queue + KV health summary.
 * Trigger: daily_report (07:00 МСК = 04:00 UTC).
 */
async function dailyReport(client) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });

  // 1. Активность за 24 часа из client_event_log
  let activityBlock = '';
  try {
    const actRes = await client.query(`
      SELECT
        count(DISTINCT client_id)::int        AS unique_clients,
        count(*)::int                          AS total_events,
        count(*) FILTER (WHERE kind = 'meal-add')::int          AS meal_add,
        count(*) FILTER (WHERE kind = 'supplement-mark')::int   AS supplement_mark,
        count(*) FILTER (WHERE kind = 'product-delete')::int    AS product_delete,
        count(*) FILTER (WHERE kind = 'sync-products')::int     AS sync_products
      FROM public.client_event_log
      WHERE ts > now() - interval '24 hours'
    `);
    const a = actRes.rows[0];
    if (a.total_events > 0) {
      activityBlock =
        `👥 *Активность за 24 часа*\n` +
        `Клиентов: *${a.unique_clients}* · Событий: *${a.total_events}*\n` +
        `🍽 meal-add: ${a.meal_add} · 💊 supps: ${a.supplement_mark}` +
        (a.product_delete > 0 ? ` · 🗑 del: ${a.product_delete}` : '') +
        (a.sync_products > 0 ? ` · 🔄 sync: ${a.sync_products}` : '');
    } else {
      activityBlock = `👥 *Активность за 24 часа*\nСобытий нет (event log пуст или не применена миграция)`;
    }
  } catch (e) {
    activityBlock = `👥 *Активность*: ⚠️ ${e.message.slice(0, 80)}`;
  }

  // 2. Trial queue stats
  let trialBlock = '';
  try {
    const tRes = await client.query(`
      SELECT
        count(*) FILTER (WHERE status = 'queued')::int   AS queued,
        count(*) FILTER (WHERE status = 'offer')::int    AS offers,
        count(*) FILTER (WHERE status = 'assigned')::int AS assigned
      FROM trial_queue
    `);
    const t = tRes.rows[0];
    trialBlock = `🎟 *Trial Queue*: очередь ${t.queued} · офферов ${t.offers} · назначено всего ${t.assigned}`;
  } catch (e) {
    trialBlock = `🎟 *Trial Queue*: ⚠️ ${e.message.slice(0, 80)}`;
  }

  // 3. Новые регистрации за 24ч
  let newClientsBlock = '';
  try {
    const ncRes = await client.query(`
      SELECT count(*)::int AS new_clients FROM clients
      WHERE created_at > now() - interval '24 hours'
    `);
    const nc = ncRes.rows[0].new_clients;
    if (nc > 0) newClientsBlock = `🆕 *Новых сегодня*: ${nc}`;
  } catch (e) {
    newClientsBlock = `🆕 *Новых*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  // 4. Churn risk — нет активности 3+ дней.
  // Dependency: требует Wave 5.3 (client_event_log populated).
  // До заполнения → 0 строк (false negative, безопасно).
  let churnBlock = '';
  try {
    const churnRes = await client.query(`
      SELECT c.name,
             EXTRACT(day FROM now() - MAX(e.ts))::int AS days_inactive
      FROM clients c
      JOIN client_event_log e ON e.client_id = c.id
      WHERE c.subscription_status IN ('trial', 'active')
      GROUP BY c.id, c.name
      HAVING MAX(e.ts) < now() - interval '3 days'
      ORDER BY MAX(e.ts) ASC
      LIMIT 7
    `);
    if (churnRes.rows.length === 0) {
      churnBlock = `✅ *Churn risk*: все активны`;
    } else {
      const list = _truncateList(churnRes.rows, 5, r => `${_mdEscape(r.name)} ${r.days_inactive}д`);
      churnBlock = `⚠️ *Churn risk (3+ дней)*: ${list}`;
    }
  } catch (e) {
    churnBlock = `⚠️ *Churn risk*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  // 5. Подписки истекают в 7 дней
  let expiringBlock = '';
  try {
    const expRes = await client.query(`
      SELECT c.name,
             EXTRACT(day FROM COALESCE(c.subscription_expires_at, c.trial_ends_at) - now())::int AS days_left
      FROM clients c
      WHERE c.subscription_status IN ('trial', 'active')
        AND COALESCE(c.subscription_expires_at, c.trial_ends_at) BETWEEN now() AND now() + interval '7 days'
      ORDER BY COALESCE(c.subscription_expires_at, c.trial_ends_at) ASC
      LIMIT 5
    `);
    if (expRes.rows.length > 0) {
      const list = _truncateList(expRes.rows, 3, r => `${_mdEscape(r.name)} ${r.days_left}д`);
      expiringBlock = `⏰ *Истекают в 7 дней*: ${list}`;
    }
  } catch (e) {
    expiringBlock = `⏰ *Истекают*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  // 6. KV health — краткий итог (всегда, не только при аномалиях)
  let healthBlock = '';
  try {
    const { findings, summary } = await kvHealthCheck(client);
    if (findings.length === 0) {
      const heaviest = summary.heaviest_key
        ? `; самый жирный ключ ${_mdEscape(summary.heaviest_key.k)} (${Math.round(summary.heaviest_key.bytes / 1024)} KB)`
        : '';
      healthBlock = `🩺 *KV Health*: ✅ без аномалий${heaviest}`;
    } else {
      healthBlock = `🩺 *KV Health*: ⚠️ ${findings.length} аномали${findings.length === 1 ? 'я' : 'и'} (алерт уже отправлен выше)`;
    }
  } catch (e) {
    healthBlock = `🩺 *KV Health*: ⚠️ ${e.message.slice(0, 80)}`;
  }

  const parts = [
    `📊 *Утренний отчёт HEYS* — ${dateStr}`,
    activityBlock,
    newClientsBlock,
    churnBlock,
    expiringBlock,
    trialBlock,
    healthBlock,
  ].filter(Boolean);

  await sendTelegramNotification(parts.join('\n\n'));
  return { sent: true };
}

/**
 * Еженедельный дайджест — воскресенье 19:00 МСК.
 * Trial→paid конверсии + новые клиенты + drip-воронка + push-статистика за 7 дней.
 */
async function weeklyReport(client) {
  const now = new Date();
  const endStr = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
  const weekAgo = new Date(now - 7 * 86400e3);
  const startStr = weekAgo.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
  const header = `📈 *Еженедельный дайджест HEYS* — ${startStr}–${endStr}`;

  // A: Trial → paid конверсии за 7 дней
  let conversionsBlock = '';
  try {
    const cRes = await client.query(`
      SELECT count(*)::int AS conversions FROM trial_queue_events
      WHERE event_type = 'purchased' AND created_at > now() - interval '7 days'
    `);
    conversionsBlock = `💰 *Конверсии trial → paid*: ${cRes.rows[0].conversions}`;
  } catch (e) {
    conversionsBlock = `💰 *Конверсии*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  // B: Новые клиенты за неделю
  let newClientsBlock = '';
  try {
    const ncRes = await client.query(`
      SELECT count(*)::int AS new_clients FROM clients
      WHERE created_at > now() - interval '7 days'
    `);
    newClientsBlock = `🆕 *Новых клиентов*: ${ncRes.rows[0].new_clients}`;
  } catch (e) {
    newClientsBlock = `🆕 *Новых клиентов*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  // C: Push за неделю
  let pushBlock = '';
  try {
    const pRes = await client.query(`
      SELECT count(*)::int AS pushes_sent FROM client_data_changelog
      WHERE notified_at > now() - interval '7 days'
    `);
    pushBlock = `📱 *Push-уведомлений*: ${pRes.rows[0].pushes_sent}`;
  } catch (e) {
    pushBlock = `📱 *Push*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  // D: Drip-воронка (общая статистика)
  let funnelBlock = '';
  try {
    const fRes = await client.query(`
      SELECT
        count(*) FILTER (WHERE status = 'queued')::int               AS queued,
        count(*) FILTER (WHERE status IN ('offer','assigned'))::int  AS engaged,
        count(*) FILTER (WHERE status = 'canceled_by_purchase')::int AS converted_ever
      FROM trial_queue
    `);
    const f = fRes.rows[0];
    funnelBlock = `🎟 *Trial воронка*:\nОчередь: ${f.queued} → Вовлечены: ${f.engaged} → Конвертировано всего: ${f.converted_ever}`;
  } catch (e) {
    funnelBlock = `🎟 *Trial воронка*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  const parts = [header, conversionsBlock, newClientsBlock, pushBlock, funnelBlock].filter(Boolean);
  await sendTelegramNotification(parts.join('\n\n'));
  return { sent: true };
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

  // 📝 client_event_log retention (plan Wave 5.4, F-EL6): удаляем events старше 7 дней.
  // Это отдельная таблица (не client_kv_store), но логически тот же weekly cleanup job.
  try {
    const elRes = await client.query(
      `WITH del AS (
         DELETE FROM public.client_event_log
         WHERE ts < (NOW() - INTERVAL '7 days')
         RETURNING length(summary) + length(coalesce(payload::text, '')) AS sz
       )
       SELECT count(*)::int AS rows, coalesce(sum(sz),0)::bigint AS bytes FROM del`
    );
    stats.client_event_log_retention = elRes.rows[0];
  } catch (elErr) {
    // Table may not exist yet (если миграция не применена) — fail-safe
    stats.client_event_log_retention = { rows: 0, bytes: 0, error: elErr.message };
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
  //   1. Timer trigger с --payload: messages[0].details.payload — string JSON
  //   2. Manual invoke с {"messages":[{"details":{"trigger_id":"..."}}]}:
  //      details.trigger_id строкой (для backward-compat manual debug)
  //   3. Top-level event.trigger_id (тоже manual invoke)
  //   4. Default fallback
  //
  // 🛡️ Yandex timer trigger без --payload АВТОМАТИЧЕСКИ заполняет
  // details.trigger_id значением UUID самого триггера. Это значит
  // напрямую использовать details.trigger_id как task name НЕЛЬЗЯ —
  // отфильтровываем UUID-формат (выглядит как 'a1s...19chars').
  const details = event.messages?.[0]?.details;
  let triggerId;

  // 1. Payload-based (рекомендуемый путь для timer trigger)
  if (details && typeof details.payload === 'string' && details.payload) {
    try {
      const parsed = JSON.parse(details.payload);
      triggerId = parsed && parsed.trigger_id;
    } catch (_) { /* payload not JSON */ }
  }
  // 2. Manual / Message Queue trigger_id (только если не UUID)
  if (!triggerId && details && typeof details.trigger_id === 'string') {
    const tid = details.trigger_id;
    // Yandex trigger IDs выглядят как 'a1s' + ~16 alnum chars. Custom
    // имена task (kv_health, trial_queue, etc.) — короче, snake_case.
    const looksLikeYcId = /^[a-z0-9]{17,}$/i.test(tid);
    if (!looksLikeYcId) triggerId = tid;
  }
  // 3. Top-level (manual invoke)
  if (!triggerId) triggerId = event.trigger_id;
  // 4. Default
  if (!triggerId) triggerId = 'default';

  // Diagnostic (одноразово полезно при отладке timer payload routing)
  console.log('[Maintenance] event keys:',
    JSON.stringify({
      hasMessages: !!event.messages,
      detailsKeys: details ? Object.keys(details) : null,
      payloadType: details ? typeof details.payload : null,
      resolvedTriggerId: triggerId,
    }));
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
    // Daily report: только по явному trigger (07:00 МСК = 04:00 UTC)
    const runDailyReport = triggerId === 'daily_report' || triggerId === 'all';
    // Weekly digest: воскресенье 19:00 МСК = 16:00 UTC
    const runWeeklyReport = triggerId === 'weekly_report' || triggerId === 'all';

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

      // client_log_trace TTL — каждый день в той же daily-фазе
      results.log_trace_cleanup = await cleanupClientLogTrace(client);
      console.log(`[Maintenance] LogTrace TTL: deleted ${results.log_trace_cleanup.rows} rows (${(Number(results.log_trace_cleanup.bytes || 0) / 1024).toFixed(1)} KB)`);
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

    // Daily morning report
    if (runDailyReport) {
      try {
        results.daily_report = await dailyReport(client);
      } catch (drErr) {
        console.error('[Maintenance] daily_report failed:', drErr.message);
        results.daily_report = { error: drErr.message };
      }
    }

    // Weekly digest (Sunday 19:00 MSK = 16:00 UTC)
    if (runWeeklyReport) {
      try {
        results.weekly_report = await weeklyReport(client);
      } catch (wrErr) {
        console.error('[Maintenance] weekly_report failed:', wrErr.message);
        results.weekly_report = { error: wrErr.message };
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
