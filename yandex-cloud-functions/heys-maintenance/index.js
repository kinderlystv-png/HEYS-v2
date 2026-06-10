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

// ─────────────────────────────────────────────────────────────────────────
// Synthetic / E2E fixtures (registry added 2026-06-03). These rows live in the
// SAME DB as real clients (E2E-TestAlex / E2E-TestPopl). They never log in,
// never ack the curator changelog, and their profiles get mutated by test
// runs — so they must NOT count as real-client signal in unacked / churn /
// integrity metrics, or the monitor cries wolf about its own fixtures.
// Incident 2026-06-03: 50 of 52 "unacked changelog" were these two fixtures,
// and the synthetic self-test 🚨'd because fixture 1111 had no heys_profile row.
// The synthetic-defense self-test uses SANDBOX as a write target, always inside
// BEGIN/ROLLBACK (zero real mutation).
const SYNTHETIC_CLIENT_IDS = Object.freeze([
  '11111111-1111-1111-1111-111111111111', // E2E-TestAlex
  '22222222-2222-2222-2222-222222222222', // E2E-TestPopl
]);
const SYNTHETIC_DEFENSE_SANDBOX = SYNTHETIC_CLIENT_IDS[0];
const _SYN_UUID_LIST = SYNTHETIC_CLIENT_IDS.map((id) => `'${id}'::uuid`).join(', ');

// SQL predicate — TRUE only for real (non-synthetic) clients. Belt-and-braces:
// excludes by hardcoded UUID AND by live `E2E-%` name prefix, so a freshly
// added fixture can't silently re-pollute metrics before someone updates the
// list above. `col` = the client_id column expression in the calling query.
function realClientOnly(col) {
  return `(${col} NOT IN (${_SYN_UUID_LIST}) ` +
    `AND ${col} NOT IN (SELECT id FROM clients WHERE name LIKE 'E2E-%'))`;
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

// ─────────────────────────────────────────────────────────────────────────
// Dead-man's switch (2026-06-03). The whole monitor — synthetic defense, KV
// health, daily/weekly reports — is worthless if heys-maintenance silently
// (watcher теперь бежит в конце КАЖДОГО триггера, не только trial_queue — см.
// checkHeartbeats call-site перед return handler'а).
// stops running (dead cron trigger, broken initSecrets / Lockbox rotation,
// exhausted DB pool). recordHeartbeat() stamps each task's last SUCCESS;
// checkHeartbeats() is the watcher, run by the high-frequency trial_queue
// trigger, and alerts when any task has gone silent past its threshold.

async function recordHeartbeat(client, task) {
  try {
    // ON CONFLICT preserves the seeded max_silence; clears the stale latch so a
    // recovered task can alert again if it dies later.
    await client.query(
      `INSERT INTO maintenance_heartbeat (task, last_ok_at, stale_alerted_at, max_silence)
         VALUES ($1, now(), NULL, interval '25 hours')
       ON CONFLICT (task) DO UPDATE
         SET last_ok_at = now(), stale_alerted_at = NULL`,
      [task]
    );
  } catch (e) {
    console.warn('[heartbeat] record failed for', task, e.message);
  }
}

async function checkHeartbeats(client) {
  // Stale = last_ok_at older than its max_silence. Atomically latch
  // stale_alerted_at (re-alert at most once / 6h) so a 5-min watcher cadence
  // doesn't spam, and concurrent runs don't double-send.
  let stale;
  try {
    const res = await client.query(`
      UPDATE maintenance_heartbeat
         SET stale_alerted_at = now()
       WHERE last_ok_at < now() - max_silence
         AND (stale_alerted_at IS NULL OR stale_alerted_at < now() - interval '6 hours')
       RETURNING task,
                 round(extract(epoch FROM now() - last_ok_at) / 3600)::int AS silent_h,
                 max_silence::text AS max_silence
    `);
    stale = res.rows;
  } catch (e) {
    console.warn('[heartbeat] check failed:', e.message);
    return;
  }
  if (stale.length === 0) return;
  // Severity растёт с длительностью молчания: >72h (3× типового порога 25h) —
  // это не рутинный «один таск чихнул», а затяжная авария. Меняем заголовок и
  // помечаем строки 🔴, чтобы 157h визуально не читался как 25h (alert fatigue).
  const worstSilentH = Math.max(...stale.map((r) => r.silent_h));
  const escalated = worstSilentH >= 72;
  const header = escalated
    ? `🔴 *Monitor dead-man's switch — ЭСКАЛАЦИЯ (${Math.round(worstSilentH / 24)} сут молчания)*`
    : `🚑 *Monitor dead-man's switch*`;
  await sendTelegramNotification(
    header + `\n\n` +
    `Таск(и) heys-maintenance молчат дольше порога — возможно умер cron-триггер, ` +
    `секреты (Lockbox) или DB-pool:\n\n` +
    stale.map((r) => `• \`${r.task}\` молчит ${r.silent_h}h _(порог ${r.max_silence})_${r.silent_h >= 72 ? ' 🔴' : ''}`).join('\n') +
    `\n\n_Проверь Yandex Cloud → Functions → triggers и логи heys-maintenance._`
  );
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
 * Cleanup profile_snapshots (2026-06-01 wave 2) — TTL 30 дней. Источник:
 * миграция 2026-06-01_create_profile_snapshots.sql + merge_save pre-write
 * snapshot logic в heys-api-rpc.
 */
async function cleanupProfileSnapshots(client) {
  try {
    const res = await client.query(
      `WITH del AS (
         DELETE FROM public.profile_snapshots
         WHERE created_at < (NOW() - INTERVAL '30 days')
         RETURNING length(prev_v::text) + length(coalesce(new_v::text, '')) AS sz
       )
       SELECT count(*)::int AS rows, coalesce(sum(sz), 0)::bigint AS bytes FROM del`
    );
    return res.rows[0] || { rows: 0, bytes: 0 };
  } catch (e) {
    return { rows: 0, bytes: 0, error: e.message };
  }
}

/**
 * Synthetic defense check (2026-06-01 wave 4, layer A) — каждый день
 * проверяем что наши защитные механизмы ЖИВЫ (DB CHECK trigger, validate
 * functions, snapshot table). Если кто-то случайно дропнул триггер или
 * мигрировал схему сломав защиту — здесь поймаем за 24 часа, а не когда
 * случится реальный pollution incident.
 *
 * Strategy: smoke-tests прямо в DB через transaction + ROLLBACK (никакого
 * mutation реальных данных). Test client 11111111-...-1111 — E2E fixture.
 */
async function syntheticDefenseCheck(client) {
  const failures = [];
  const groups = { validate: true, snapshot: true, logtrace: true, structure: true };
  const SANDBOX = SYNTHETIC_DEFENSE_SANDBOX;

  // Test 1: validate_profile_jsonb trigger must REJECT invalid field values.
  //
  // Self-seeding (2026-06-03 rewrite): we INSERT…ON CONFLICT a heys_profile row
  // with a bad value, so the BEFORE INSERT/UPDATE trigger fires REGARDLESS of
  // whether a fixture row exists. The old test did a bare UPDATE that no-op'd on
  // the missing row (0 rows matched → trigger never ran) and reported "защита
  // сломана" — a false 🚨 (incident 2026-06-03). user_id stays NULL so the
  // curator-lock guard passes through and we exercise validate specifically.
  // Each case runs in its own SAVEPOINT; the whole thing is rolled back — zero
  // real mutation. We assert ALL value dimensions (gender + numeric ranges), so
  // a partial trigger regression (e.g. gender check kept, age check dropped) is
  // also caught.
  const VALIDATION_CASES = [
    { field: 'gender', payload: '{"gender":"InvalidGenderSynthetic"}', errcode: 'invalid_profile_gender' },
    { field: 'age',    payload: '{"gender":"Мужской","age":999}',      errcode: 'invalid_profile_age' },
    { field: 'weight', payload: '{"gender":"Мужской","weight":9999}',  errcode: 'invalid_profile_weight' },
  ];
  try {
    await client.query('BEGIN');
    for (const tc of VALIDATION_CASES) {
      let rejected = false;
      let otherErr = null;
      // eslint-disable-next-line no-await-in-loop
      await client.query('SAVEPOINT sp_validate');
      try {
        // eslint-disable-next-line no-await-in-loop
        await client.query(
          `INSERT INTO client_kv_store (client_id, k, v)
             VALUES ($1::uuid, 'heys_profile', $2::jsonb)
           ON CONFLICT (client_id, k) DO UPDATE SET v = EXCLUDED.v`,
          [SANDBOX, tc.payload]
        );
      } catch (e) {
        if (String(e.message).includes(tc.errcode)) rejected = true;
        else otherErr = e.message;
      }
      // After the expected RAISE the tx is aborted → roll back to the savepoint.
      // eslint-disable-next-line no-await-in-loop
      await client.query('ROLLBACK TO SAVEPOINT sp_validate');
      if (!rejected) {
        groups.validate = false;
        failures.push(
          otherErr
            ? `🚨 validate trigger ${tc.field}-case: неожиданная ошибка (защита под вопросом): ${otherErr.slice(0, 90)}`
            : `🚨 validate trigger НЕ отклоняет invalid ${tc.field} — DB CHECK защита сломана!`
        );
      }
    }
    await client.query('ROLLBACK');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    groups.validate = false;
    failures.push(`trigger test exception: ${e.message.slice(0, 120)}`);
  }

  // Test 2: profile_snapshots table accessible + RPC restore_profile_snapshot exists
  try {
    const fnRes = await client.query(
      `SELECT 1 FROM pg_proc WHERE proname = 'restore_profile_snapshot' LIMIT 1`
    );
    if (fnRes.rows.length === 0) {
      groups.snapshot = false;
      failures.push('🚨 restore_profile_snapshot function MISSING — instant rollback сломан!');
    }
    const tblRes = await client.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profile_snapshots' LIMIT 1`
    );
    if (tblRes.rows.length === 0) {
      groups.snapshot = false;
      failures.push('🚨 profile_snapshots table MISSING — snapshots не пишутся!');
    }
  } catch (e) {
    groups.snapshot = false;
    failures.push(`snapshot infra test exception: ${e.message.slice(0, 120)}`);
  }

  // Test 3: client_log_trace table accessible (для диагностики)
  try {
    const r = await client.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'client_log_trace' LIMIT 1`
    );
    if (r.rows.length === 0) {
      groups.logtrace = false;
      failures.push('⚠️ client_log_trace table MISSING — mobile debug pipeline сломан');
    }
  } catch (e) {
    groups.logtrace = false;
    failures.push(`log_trace test exception: ${e.message.slice(0, 120)}`);
  }

  // Test 4: structural invariants (2026-06-03) — раньше "3/3 ✅" читалось как
  // "вся защита жива", хотя проверялись только validate-триггер + snapshot +
  // log_trace. Эти DB-уровневые инварианты — несущая конструкция защиты от
  // pollution (CLAUDE.md). Если миграция случайно их снесёт, "3/3" бы не
  // дрогнул. Проверяем дёшево само СУЩЕСТВОВАНИЕ (не поведение).
  try {
    const checks = [
      // инвариант #8 path — curator-lock / restriction guards на client_kv_store
      { sql: `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_block_curator_write_on_locked'`,
        miss: 'trg_block_curator_write_on_locked (curator-lock guard) MISSING' },
      { sql: `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_block_kv_under_restriction'`,
        miss: 'trg_block_kv_under_restriction (152-ФЗ restriction guard) MISSING' },
      // инвариант #6 — FK client_kv_store → clients ON DELETE CASCADE
      { sql: `SELECT 1 FROM pg_constraint
                WHERE conrelid = 'public.client_kv_store'::regclass
                  AND contype = 'f' AND confdeltype = 'c'`,
        miss: 'client_kv_store→clients FK ON DELETE CASCADE MISSING (инвариант #6)' },
      // инвариант #10 — server-authoritative client_id routing
      { sql: `SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'write_contexts'`,
        miss: 'write_contexts table MISSING (инвариант #10 capability routing)' },
      { sql: `SELECT 1 FROM pg_proc WHERE proname = 'validate_write_context'`,
        miss: 'validate_write_context() MISSING (инвариант #10)' },
    ];
    for (const c of checks) {
      // eslint-disable-next-line no-await-in-loop
      const res = await client.query(`${c.sql} LIMIT 1`);
      if (res.rows.length === 0) {
        groups.structure = false;
        failures.push(`🚨 ${c.miss}`);
      }
    }
  } catch (e) {
    groups.structure = false;
    failures.push(`structure test exception: ${e.message.slice(0, 120)}`);
  }

  // passed = number of healthy CHECK GROUPS (validate / snapshot / logtrace /
  // structure), not raw failure-message count — so multiple sub-cases failing
  // still reads as "1 group down", keeping the X/4 in the report meaningful.
  const passed = Object.values(groups).filter(Boolean).length;
  return { failures, summary: { passed, total: 4, groups } };
}

/**
 * Writer-CID invariant check (2026-06-01 wave 3, #12 reframe) — для каждого
 * per-client KV blob (heys_profile/norms/game/hr_zones) проверяет что
 * v._writerCid совпадает с client_id (legitimate write). Mismatch → pollution
 * (даже если RPC guard был bypassed напрямую через SQL/admin path). NULL →
 * legacy untagged row, нужна перезапись через клиента для активации guard.
 *
 * Без S3 backup diff (требовал бы новых зависимостей). Этот инвариант
 * самодостаточен: legitimate write всегда тегается currentClientId = client_id.
 */
async function writerCidIntegrityCheck(client) {
  const findings = [];
  const summary = { mismatched: 0, untagged: 0, dayv2_mismatched: 0, dayv2_untagged: 0 };

  // 2026-06-01 wave 4 (B): добавлены heys_dayv2_* (meals data) — те же writer-CID
  // инварианты применимы. dayv2 более активна (per-day rows), threshold выше.
  try {
    const res = await client.query(
      `SELECT client_id, k,
              v->>'_writerCid' AS writer_cid,
              updated_at,
              v->>'firstName' AS first_name,
              v->>'lastName'  AS last_name,
              (k LIKE 'heys_dayv2_%') AS is_dayv2
         FROM client_kv_store
        WHERE (
            k IN ('heys_profile', 'heys_norms', 'heys_game', 'heys_hr_zones')
            OR k ~ '^heys_dayv2_\\d{4}-\\d{2}-\\d{2}$'
          )
          AND (
            v->>'_writerCid' IS NULL
            OR v->>'_writerCid' <> client_id::text
          )
          AND ${realClientOnly('client_id')}
        ORDER BY (k LIKE 'heys_dayv2_%'), updated_at DESC
        LIMIT 100`
    );

    for (const row of res.rows) {
      const cidShort = String(row.client_id).slice(0, 8);
      const writer = row.writer_cid;
      const ageHours = Math.round((Date.now() - new Date(row.updated_at).getTime()) / 3600000);
      const isDayv2 = row.is_dayv2;

      if (writer == null || writer === '') {
        if (isDayv2) {
          summary.dayv2_untagged++;
          // dayv2 untagged — менее критично (legacy много), включаем в findings только первые 5
          if (summary.dayv2_untagged <= 5) {
            findings.push(`⚠️ *dayv2_untagged* \`${cidShort}\` ${row.k.slice(11)} age=${ageHours}h`);
          }
        } else {
          summary.untagged++;
          findings.push(
            `⚠️ *untagged* \`${cidShort}\` key=\`${row.k}\` age=${ageHours}h ` +
            (row.first_name ? `(${row.first_name})` : '')
          );
        }
      } else if (writer !== row.client_id) {
        if (isDayv2) {
          summary.dayv2_mismatched++;
          findings.push(
            `🚨 *dayv2_writer_cid_mismatch* \`${cidShort}\` ${row.k.slice(11)}\n` +
            `expected: \`${cidShort}\`, got: \`${String(writer).slice(0, 8)}\`\n` +
            `age=${ageHours}h — _POSSIBLE POLLUTION_`
          );
        } else {
          summary.mismatched++;
          findings.push(
            `🚨 *writer_cid_mismatch* \`${cidShort}\` key=\`${row.k}\`\n` +
            `expected: \`${cidShort}\`, got: \`${String(writer).slice(0, 8)}\`\n` +
            `age=${ageHours}h ${row.first_name ? '('+row.first_name+')' : ''}\n` +
            `_POSSIBLE POLLUTION — bypass через direct SQL?_`
          );
        }
      }
    }
  } catch (e) {
    // Fail-loud: a query error must NOT masquerade as "0 mismatched ✅". Surface
    // it so the caller can render 🚨 "проверка не отработала" instead of green.
    console.warn('[writer-cid-integrity] query failed:', e.message);
    summary.error = e.message;
  }

  return { findings, summary };
}

/**
 * Profile integrity check (2026-06-01) — обнаруживает cross-client pollution
 * profile-полей. Источник: incident 2026-05-31 13:00 где Poplanton'овские
 * identity-поля перетёрли профиль Александры через unscoped legacy LS path.
 *
 * Эвристика: clients.name vs profile.firstName+lastName fuzzy comparison.
 * Если ≥1 mismatch → alert в Telegram с client_id + diff для разбора.
 * Бэкап для restore — в heys-backups/client-daily/.
 *
 * Также pull-аутит свежие cross_client_profile_blocked / wholesale_identity_change
 * записи из data_loss_audit (последние 24ч) как дополнительный сигнал.
 */
async function profileIntegrityCheck(client) {
  const findings = [];
  const summary = { mismatches: 0, blocked: 0, anomalies: 0 };

  // 1. Name mismatch detection. Normalize hyphens/spaces/dots/quotes на обеих сторонах
  // ДО compare — иначе "E2E-TestAlex" vs "E2E TestAlex" даёт false-positive.
  // regexp_replace убирает любой non-letter character перед lower().
  try {
    const mismatchRes = await client.query(`
      WITH normalized AS (
        SELECT c.id, c.name AS c_name,
               p.v->>'firstName' AS pf,
               p.v->>'lastName'  AS pl,
               p.v->>'gender'    AS pg,
               p.v->>'_writerCid' AS pwriter,
               p.updated_at,
               lower(regexp_replace(c.name, '[^[:alpha:][:digit:]]', '', 'g')) AS c_norm,
               lower(regexp_replace(
                 coalesce(p.v->>'firstName','') || coalesce(p.v->>'lastName',''),
                 '[^[:alpha:][:digit:]]', '', 'g'
               )) AS p_norm
          FROM clients c
          JOIN client_kv_store p
            ON p.client_id = c.id AND p.k = 'heys_profile'
         WHERE c.name IS NOT NULL
           AND length(trim(c.name)) > 0
           AND p.v->>'firstName' IS NOT NULL
           AND ${realClientOnly('c.id')}
      )
      SELECT id, c_name AS name, pf, pl, pg, pwriter, updated_at
        FROM normalized
       WHERE c_norm <> ''
         AND p_norm <> ''
         AND p_norm NOT LIKE '%' || c_norm || '%'
         AND c_norm NOT LIKE '%' || p_norm || '%'
       LIMIT 20
    `);
    summary.mismatches = mismatchRes.rows.length;
    for (const r of mismatchRes.rows) {
      findings.push(
        `🚨 *Profile name mismatch* \`${String(r.id).slice(0, 8)}\`\n` +
        `clients.name: \`${r.name}\`\n` +
        `profile: \`${r.pf || '?'} ${r.pl || '?'}\` (gender=${r.pg || '?'})\n` +
        (r.pwriter ? `writerCid: \`${String(r.pwriter).slice(0, 8)}\`` : `_writerCid: ⚠️ missing (pre-fix row)`)
      );
    }
  } catch (e) {
    console.warn('[profile-integrity] mismatch query failed:', e.message);
    summary.error = e.message;
  }

  // 2. Recent cross_client_profile_blocked + wholesale_identity_change events
  try {
    const auditRes = await client.query(`
      SELECT client_id, action, reason, created_at
        FROM data_loss_audit
       WHERE key = 'heys_profile'
         AND action IN ('cross_client_profile_blocked','wholesale_identity_change')
         AND created_at > NOW() - INTERVAL '24 hours'
         AND ${realClientOnly('client_id')}
       ORDER BY created_at DESC
       LIMIT 10
    `);
    for (const r of auditRes.rows) {
      if (r.action === 'cross_client_profile_blocked') summary.blocked++;
      if (r.action === 'wholesale_identity_change') summary.anomalies++;
      findings.push(
        `${r.action === 'cross_client_profile_blocked' ? '🛡️' : '⚠️'} *${r.action}* \`${String(r.client_id).slice(0, 8)}\`\n` +
        `${r.reason || ''}\n` +
        `at ${new Date(r.created_at).toISOString().slice(11, 19)} UTC`
      );
    }
  } catch (e) {
    console.warn('[profile-integrity] audit query failed:', e.message);
    summary.error = summary.error || e.message;
  }

  return { findings, summary };
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

  // 1. Curator changelog ack health — REAL regression detector (2026-06-03
  //    rewrite). The precision/range bug signature (BUGS_HISTORY 2026-05-23) is:
  //    an entry created BEFORE the client's own most-recent successful ack is
  //    STILL unacked — i.e. acking failed to clear older rows. A raw "unacked
  //    count" is NOT a bug: E2E fixtures and never-logged-in clients accumulate
  //    unacked forever by design (incident 2026-06-03: 50/52 unacked were E2E
  //    fixtures that never ack). So we alert ONLY on the stuck-despite-ack
  //    signature, and only for real clients.
  const stuckAckRes = await client.query(`
    SELECT cl.client_id::text AS client_id, count(*)::int AS stuck,
           round(extract(epoch FROM max(now() - cl.created_at)) / 3600)::int AS oldest_h
    FROM client_data_changelog cl
    JOIN (
      SELECT client_id, max(acked_at) AS last_ack
      FROM client_data_changelog
      WHERE acked_at IS NOT NULL
      GROUP BY client_id
    ) a ON a.client_id = cl.client_id
    WHERE cl.acked_at IS NULL
      AND cl.created_at < a.last_ack
      AND ${realClientOnly('cl.client_id')}
    GROUP BY cl.client_id
    ORDER BY stuck DESC
  `);
  summary.stuck_ack = stuckAckRes.rows.reduce((n, r) => n + r.stuck, 0);
  if (stuckAckRes.rows.length > 0) {
    const detail = stuckAckRes.rows.slice(0, 5)
      .map((r) => `\`${r.client_id.slice(0, 8)}\` ${r.stuck} (старейш ${r.oldest_h}h)`)
      .join(', ');
    findings.push(
      `📌 *Ack regression*: ${summary.stuck_ack} записей не сброшены после ack'а ` +
      `у ${stuckAckRes.rows.length} клиент(ов) — precision-mismatch ack снова сломан ` +
      `(см. BUGS_HISTORY 2026-05-23). ${detail}`
    );
  }

  // 1b. Informational only (not an alert) — real-client unacked backlog for the
  //     summary line. Excludes synthetic fixtures.
  const unackedRes = await client.query(`
    SELECT count(*)::int AS unacked,
           extract(epoch FROM coalesce(max(now() - created_at), interval '0'))::int AS oldest_age_sec
    FROM client_data_changelog
    WHERE acked_at IS NULL
      AND ${realClientOnly('client_id')}
  `);
  summary.unacked = unackedRes.rows[0];

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

  // 5. (removed 2026-06-03) The old "unacked rows with microsecond suffix"
  //    discriminator was conceptually broken: EVERY Postgres timestamp carries
  //    microseconds, so it counted essentially all unacked rows regardless of
  //    whether the +1ms tolerance fix works. The real precision-regression
  //    signal now lives in check #1 (stuck-despite-ack detector).

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
async function dailyReport(client, once) {
  // `once(key, fn)` memoizes heavy scans within a single invoke so the daily
  // report reuses results already computed in the cleanup/kv_health phases of an
  // 'all' run instead of re-scanning. No-op (single call) for separate triggers.
  const memo = once || ((_k, fn) => fn());
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
      // Аномалия: синки идут, но событий еды/добавок нет N-й день. Это не «тихо»,
      // а скорее всего телеметрия meal-add/supplement-mark не пишется в event log
      // (клиент не эмитит эти kind, либо миграция Wave 5.3 не докатана). Без флага
      // отчёт читается как здоровый — маскирует поломку аналитики/churn-сигнала.
      if (a.meal_add === 0 && a.supplement_mark === 0 && a.sync_products > 0) {
        activityBlock += `\n⚠️ _Только sync-события: meal-add/supps не логируются — телеметрия еды сломана либо клиент реально не вносит. Проверь client_event_log / миграцию Wave 5.3._`;
      }
    } else {
      activityBlock = `👥 *Активность за 24 часа*\n⚠️ _Событий нет совсем — event log пуст. Это поломка (cron не пишет или миграция Wave 5.3 не применена), а не тихий день._`;
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
        AND ${realClientOnly('c.id')}
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
    const { findings, summary } = await memo('kv_health', () => kvHealthCheck(client));
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

  // 7. Profile pollution defense status (wave 1-4) — позитивное подтверждение
  // что все 14 layer'ов работают. Каждое утро видим зелёный baseline или
  // конкретное место где регрессия.
  let defenseBlock = '';
  try {
    // a) Synthetic self-test (DB CHECK trigger + RPC function + tables)
    const syn = await memo('synthetic', () => syntheticDefenseCheck(client));
    // b) Writer-CID invariant
    const wci = await memo('writer_cid', () => writerCidIntegrityCheck(client));
    // c) Profile name integrity
    const pi = await memo('profile_integrity', () => profileIntegrityCheck(client));
    // d) Snapshots за 24ч (показывает что pipeline активный)
    const snapRes = await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE reason = 'routine')::int   AS routine,
             count(*) FILTER (WHERE reason = 'wholesale_identity_change')::int AS wholesale,
             count(*) FILTER (WHERE reason = 'cross_client_blocked')::int      AS blocked
        FROM profile_snapshots
       WHERE created_at > now() - interval '24 hours'
    `);
    const s = snapRes.rows[0];
    // e) Pollution-related audit events за 24ч. КЛЮЧЕВОЕ различие (2026-06-03):
    //    *_blocked события — это защита, которая СРАБОТАЛА (чужая запись отбита,
    //    cloud не тронут), а не поломка. content_dup — fingerprint-fallback тоже
    //    поймал. Реальная пробоина = только invalid-field, прорвавшийся в стор.
    const auRes = await client.query(`
      SELECT
        count(*) FILTER (WHERE action = 'cross_client_profile_blocked')::int  AS blocked_p,
        count(*) FILTER (WHERE action = 'cross_client_blob_blocked')::int      AS blocked_b,
        count(*) FILTER (WHERE action = 'cross_client_dayv2_content_dup')::int AS content_dup,
        count(*) FILTER (WHERE action = 'wholesale_identity_change')::int      AS wholesale_a,
        count(*) FILTER (WHERE action = 'invalid_profile_field')::int          AS invalid_f,
        count(*) FILTER (WHERE action = 'non_client_data_rejected')::int       AS ui_rejected
      FROM data_loss_audit
       WHERE created_at > now() - interval '24 hours'
    `);
    const au = auRes.rows[0];

    // Fail-loud: a check whose query errored reports summary.error — it must read
    // as 🚨 "проверка не отработала", NOT as a green "0 mismatched" (false-green
    // was the deeper risk behind the 2026-06-03 audit).
    const synOk = syn.failures.length === 0;
    const wciOk = !wci.summary.error && wci.summary.mismatched === 0 && wci.summary.dayv2_mismatched === 0;
    const piOk = !pi.summary.error && pi.summary.mismatches === 0;
    // LANDED pollution = the only true failure. Blocks are the defense WORKING
    // (incident 2026-06-03: 60 blocks were painted "защита сломана" when the
    // guard had in fact done its job). writerCid/profile mismatches that landed
    // are already covered by wciOk/piOk; here we only add invalid-field leaks.
    const landedClean = au.invalid_f === 0;
    const allGreen = synOk && wciOk && piOk && landedClean;
    const totalBlocks = au.blocked_p + au.blocked_b;

    const lines = [];
    lines.push(`🛡️ *Защита данных* — ${allGreen ? '✅ всё работает' : '🚨 требует внимания'}`);
    lines.push(`${synOk ? '✅' : '🚨'} Synthetic self-test: ${syn.summary.passed}/${syn.summary.total}${synOk ? '' : ' — *защита сломана*'}`);
    lines.push(
      wci.summary.error
        ? `🚨 Writer-CID invariant: *проверка не отработала* — ${_mdEscape(String(wci.summary.error).slice(0, 80))}`
        : `${wciOk ? '✅' : '🚨'} Writer-CID invariant: ` +
          `profile/norms ${wci.summary.mismatched}, dayv2 ${wci.summary.dayv2_mismatched} mismatched` +
          (wci.summary.untagged + wci.summary.dayv2_untagged > 0
            ? ` _(${wci.summary.untagged + wci.summary.dayv2_untagged} legacy untagged — норма)_`
            : '')
    );
    lines.push(
      pi.summary.error
        ? `🚨 Profile name integrity: *проверка не отработала* — ${_mdEscape(String(pi.summary.error).slice(0, 80))}`
        : `${piOk ? '✅' : '🚨'} Profile name integrity: ${pi.summary.mismatches} mismatches`
    );
    // Blocks: SUCCESS signal — green always; soft-flag only on a spike, which
    // points at the client side (curator switching between LS-sharing clients,
    // инвариант #9), not at a leak.
    lines.push(
      `🛡️ Отбито чужих записей 24ч: *${totalBlocks}* _(profile=${au.blocked_p}, blob=${au.blocked_b}` +
      (au.content_dup > 0 ? `, content-dup=${au.content_dup}` : '') +
      `)_` + (totalBlocks > 0 ? ` — защита сработала` : '')
    );
    if (totalBlocks > 100) {
      lines.push(
        `⚠️ Всплеск блокировок (>100/24ч) — вероятно курaтор активно переключается ` +
        `между клиентами с общим localStorage (инвариант #9). Это не утечка, но стоит ` +
        `глянуть клиентскую сторону.`
      );
    }
    if (au.invalid_f > 0) {
      lines.push(`🚨 Invalid-field записи ПРОРВАЛИСЬ в стор: ${au.invalid_f} — реальная пробоина, не блок`);
    }
    if (au.wholesale_a > 0) {
      lines.push(`ℹ️ Wholesale identity changes: ${au.wholesale_a} _(legit смена имени или подозрительно — глянуть)_`);
    }
    // UI-state ключи, отбитые серверным blacklist'ом. Защита работает (в стор не
    // попало), но высокий объём = клиент раз за разом шлёт то, что не должен —
    // клиентская неэффективность (лишние round-trip'ы). >500/24ч стоит чинить.
    if (au.ui_rejected > 0) {
      lines.push(
        `${au.ui_rejected > 500 ? '⚠️' : 'ℹ️'} Отбито UI-state ключей: ${au.ui_rejected}` +
        (au.ui_rejected > 500 ? ` — клиент шлёт лишнее, стоит чинить клиентскую сторону` : ` _(норма, защита blacklist'а)_`)
      );
    }
    lines.push(
      `📸 Snapshots 24ч: ${s.total} ` +
      `_(routine=${s.routine}, wholesale=${s.wholesale}, blocked=${s.blocked})_`
    );
    defenseBlock = lines.join('\n');
  } catch (e) {
    defenseBlock = `🛡️ *Защита данных*: ⚠️ ${e.message.slice(0, 100)}`;
  }

  const parts = [
    `📊 *Утренний отчёт HEYS* — ${dateStr}`,
    activityBlock,
    newClientsBlock,
    churnBlock,
    expiringBlock,
    trialBlock,
    healthBlock,
    defenseBlock,
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

  // Числовые значения держим отдельно (null = блок упал на ошибке), чтобы в
  // конце решить: слать полный дайджест или сжатую строку при пустой неделе.
  let conv = null, newClients = null, pushes = null, funnel = null;

  // A: Trial → paid конверсии за 7 дней
  let conversionsBlock = '';
  try {
    const cRes = await client.query(`
      SELECT count(*)::int AS conversions FROM trial_queue_events
      WHERE event_type = 'purchased' AND created_at > now() - interval '7 days'
    `);
    conv = cRes.rows[0].conversions;
    conversionsBlock = `💰 *Конверсии trial → paid*: ${conv}`;
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
    newClients = ncRes.rows[0].new_clients;
    newClientsBlock = `🆕 *Новых клиентов*: ${newClients}`;
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
    pushes = pRes.rows[0].pushes_sent;
    pushBlock = `📱 *Push-уведомлений*: ${pushes}`;
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
    funnel = fRes.rows[0];
    funnelBlock = `🎟 *Trial воронка*:\nОчередь: ${funnel.queued} → Вовлечены: ${funnel.engaged} → Конвертировано всего: ${funnel.converted_ever}`;
  } catch (e) {
    funnelBlock = `🎟 *Trial воронка*: ⚠️ ${e.message.slice(0, 60)}`;
  }

  // Пустая неделя (всё посчиталось и всё по нулям) → одна строка вместо четырёх
  // блоков нулей. Полный дайджест приучает скроллить мимо, когда смотреть не на
  // что; реальные движения сразу видны, т.к. ломают этот «зелёный» путь.
  const allZero =
    conv === 0 && newClients === 0 &&
    funnel && funnel.queued === 0 && funnel.engaged === 0;

  let parts;
  if (allZero) {
    parts = [
      header,
      `🟢 Без изменений за неделю: 0 новых, 0 конверсий, очередь пуста.` +
      (pushes != null ? ` Push: ${pushes}.` : ''),
    ];
  } else {
    parts = [header, conversionsBlock, newClientsBlock, pushBlock, funnelBlock].filter(Boolean);
  }
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

    // Per-invoke memo — heavy scans (synthetic / writerCid / profile / kvHealth)
    // are computed at most once even when an 'all' trigger runs both the cleanup
    // phase and the daily report. Fresh per invocation (NOT module-level — the
    // serverless container is reused and would serve stale results).
    const _memo = {};
    const once = (key, fn) => (_memo[key] ??= fn());

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
      await recordHeartbeat(client, 'trial_queue');
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

      // profile_snapshots TTL (30 дней)
      results.profile_snapshots_cleanup = await cleanupProfileSnapshots(client);
      console.log(`[Maintenance] ProfileSnapshots TTL: deleted ${results.profile_snapshots_cleanup.rows} rows (${(Number(results.profile_snapshots_cleanup.bytes || 0) / 1024).toFixed(1)} KB)`);

      // 🧪 Synthetic defense check (2026-06-01 wave 4, A) — гарантия что
      // защитные триггеры/функции не дропнуты случайной миграцией.
      try {
        const { failures, summary } = await once('synthetic', () => syntheticDefenseCheck(client));
        results.synthetic_defense = summary;
        console.log('[Maintenance] Synthetic defense:', JSON.stringify(summary));
        if (failures.length > 0) {
          await sendTelegramNotification(
            `🧪 *Synthetic Defense FAILED*\n\n` +
            `passed=${summary.passed}/${summary.total}\n\n` +
            failures.map(f => `• ${f}`).join('\n')
          );
        }
      } catch (sErr) {
        // Fail-loud: the check that guards the guards must not die quietly.
        console.error('[Maintenance] synthetic_defense failed:', sErr.message);
        results.synthetic_defense = { error: sErr.message };
        await sendTelegramNotification(
          `🚨 *Synthetic check ERRORED*\n\nСам self-test защиты не отработал — слепое пятно:\n${sErr.message.slice(0, 200)}`
        );
      }

      // 🔬 Writer-CID invariant check (2026-06-01 wave 3, #12) — ловит pollution
      // даже если RPC guards bypassed через direct SQL/admin. mismatched/untagged
      // rows → Telegram alert. Untagged — это legacy rows до wave 1 deploy, не
      // критично но желательно мигрировать (перезаписать через клиента).
      try {
        const { findings, summary } = await once('writer_cid', () => writerCidIntegrityCheck(client));
        results.writer_cid_integrity = summary;
        console.log('[Maintenance] Writer-CID integrity:', JSON.stringify(summary));
        // Fail-loud: a query error inside the check surfaces as summary.error —
        // alert it rather than letting "0 mismatched" read as healthy.
        if (summary.error) {
          await sendTelegramNotification(
            `🚨 *Writer-CID check ERRORED*\n\nПроверка целостности не отработала (false-green risk):\n${String(summary.error).slice(0, 200)}`
          );
        }
        // Alert threshold: ANY mismatched (real pollution) — always alert.
        // untagged (legacy pre-guard rows) — noisy, не alert'им. dayv2 untagged
        // особенно много исторически (snapshot baseline 93 при deploy) — будут
        // мигрировать постепенно при edit. Sum untagged видно в audit log
        // results, не в alert.
        if (
          summary.mismatched > 0 ||
          summary.dayv2_mismatched > 0
        ) {
          await sendTelegramNotification(
            `🔬 *Writer-CID Integrity Alert*\n\n` +
            `profile/norms: mismatched=${summary.mismatched} untagged=${summary.untagged}\n` +
            `dayv2: mismatched=${summary.dayv2_mismatched} untagged=${summary.dayv2_untagged}\n\n` +
            findings.slice(0, 8).join('\n\n') +
            (findings.length > 8 ? `\n\n…+${findings.length - 8} more` : '')
          );
        }
      } catch (wErr) {
        console.error('[Maintenance] writer_cid_integrity failed:', wErr.message);
        results.writer_cid_integrity = { error: wErr.message };
      }

      // 🛡️ Profile integrity check (2026-06-01) — обнаружение cross-client pollution.
      // Алертит в Telegram если есть mismatch'и clients.name vs profile.firstName+lastName
      // или свежие cross_client_profile_blocked / wholesale_identity_change события.
      try {
        const { findings, summary } = await once('profile_integrity', () => profileIntegrityCheck(client));
        results.profile_integrity = summary;
        console.log('[Maintenance] Profile integrity:', JSON.stringify(summary));
        if (summary.error) {
          await sendTelegramNotification(
            `🚨 *Profile integrity check ERRORED*\n\nПроверка не отработала (false-green risk):\n${String(summary.error).slice(0, 200)}`
          );
        }
        if (findings.length > 0) {
          await sendTelegramNotification(
            `🩺 *Profile Integrity Alert*\n\n` +
            `mismatches=${summary.mismatches}, blocked=${summary.blocked}, anomalies=${summary.anomalies}\n\n` +
            findings.slice(0, 8).join('\n\n') +
            (findings.length > 8 ? `\n\n…+${findings.length - 8} more` : '') +
            `\n\n_Restore procedure_: \`yc storage s3 cp s3://heys-backups/client-daily/YYYY-MM-DD/<cid>.json.gz /tmp/\` + safe_upsert_client_kv с merged профилем.`
          );
        }
      } catch (piErr) {
        console.error('[Maintenance] profile_integrity failed:', piErr.message);
        results.profile_integrity = { error: piErr.message };
        await sendTelegramNotification(
          `🚨 *Profile integrity check ERRORED*\n\n${piErr.message.slice(0, 200)}`
        );
      }

      await recordHeartbeat(client, 'daily_cleanup');
    }

    // KV health check + Telegram alert при аномалиях
    if (runKVHealth) {
      try {
        const { findings, summary } = await once('kv_health', () => kvHealthCheck(client));
        results.kv_health = { findings_count: findings.length, summary };
        console.log('[Maintenance] KV health:', JSON.stringify(summary));
        if (findings.length > 0) {
          await sendTelegramNotification(
            `🩺 *KV Health Alert*\n\n${findings.join('\n\n')}\n\n` +
            `_Daily monitor from heys-maintenance. См. apps/web/BUGS_HISTORY.md 2026-05-23 для контекста._`
          );
        }
        await recordHeartbeat(client, 'kv_health');
      } catch (kvErr) {
        // Fail-loud: kvHealthCheck has no internal catch, so a query error throws
        // here — alert instead of silently logging (false-green otherwise).
        console.error('[Maintenance] kv_health failed:', kvErr.message);
        results.kv_health = { error: kvErr.message };
        await sendTelegramNotification(
          `🚨 *KV Health check ERRORED*\n\nМонитор KV не отработал:\n${kvErr.message.slice(0, 200)}`
        );
      }
    }

    // Daily morning report
    if (runDailyReport) {
      try {
        results.daily_report = await dailyReport(client, once);
        await recordHeartbeat(client, 'daily_report');
      } catch (drErr) {
        console.error('[Maintenance] daily_report failed:', drErr.message);
        results.daily_report = { error: drErr.message };
        await sendTelegramNotification(
          `🚨 *Daily report FAILED*\n\nУтренний отчёт не сформирован:\n${drErr.message.slice(0, 200)}`
        );
      }
    }

    // Weekly digest (Sunday 19:00 MSK = 16:00 UTC)
    if (runWeeklyReport) {
      try {
        results.weekly_report = await weeklyReport(client);
        await recordHeartbeat(client, 'weekly_report');
      } catch (wrErr) {
        console.error('[Maintenance] weekly_report failed:', wrErr.message);
        results.weekly_report = { error: wrErr.message };
        await sendTelegramNotification(
          `🚨 *Weekly report FAILED*\n\n${wrErr.message.slice(0, 200)}`
        );
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

    // Dead-man's switch watcher — РАНЬШЕ висел только под trial_queue-триггером
    // (SPOF: умри trial_queue — умри и наблюдатель, тишина = «всё ок»). Теперь
    // checkHeartbeats бежит в конце ЛЮБОГО триггера. Idempotent: атомарный латч
    // (stale_alerted_at, re-alert ≤1/6h) защищает от двойной отправки, поэтому
    // повтор на trial_queue/all-инвокациях безвреден. Внешнего watchdog'а это не
    // заменяет (падение всей функции/Yandex по-прежнему = тишина) — см. handoff.
    await checkHeartbeats(client);

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

    // ANY handler-level failure must alert (was: only if message contained
    // 'trial_queue'/'advisory' — a DB-pool / secrets / connect failure on a
    // daily_report run would have been silent). Best-effort: if Telegram itself
    // is the casualty, sendTelegramNotification fails gracefully.
    await sendTelegramNotification(
      `🚨 *Maintenance handler FAILED*\n\n` +
      `Task: ${triggerId}\n` +
      `Error: ${error.message.slice(0, 300)}`
    );
    
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
