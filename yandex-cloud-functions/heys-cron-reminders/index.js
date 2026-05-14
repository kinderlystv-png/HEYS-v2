/**
 * heys-cron-reminders — периодические push-уведомления (5 сценариев).
 *
 * Запуск: Yandex Cloud Timer Trigger каждые 15 минут.
 *
 * Сценарии:
 *   a) Курятор-батчинг: client_data_changelog (pending > 1 min) → 1 пуш клиенту
 *   b) 4ч без еды: heys_dayv2_<today>.meals — если последний meal > N часов
 *      и сейчас не quiet hours → пуш-напоминалка
 *   c) Inactive client → куратору: client_kv_store последняя запись heys_dayv2_*
 *      старше 2 дней → пуш куратору
 *   d) Вечерний итог: в локальное время evening_summary_time (±7 мин) →
 *      пуш с цифрами съеденного
 *   e) Стрик 7 дней: 7 дней подряд с непустым meals[] → пуш-похвала
 *
 * Idempotency: для каждого сценария свой ключ в push_idempotency. INSERT с
 * ON CONFLICT DO NOTHING гарантирует, что один и тот же пуш не уйдёт дважды.
 */

const { getPool } = require('./shared/db-pool');
const webpush = require('web-push');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:noreply@heyslab.ru';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.error('[cron-reminders] FATAL: VAPID keys not configured');
}

// Все юзеры считаются в MSK (UTC+3). User prefs хранят HH:MM в MSK.
const MSK_OFFSET_HOURS = 3;

// ─── Time helpers ──────────────────────────────────────────────────────

function nowInMsk() {
  const utc = new Date();
  return new Date(utc.getTime() + MSK_OFFSET_HOURS * 3600 * 1000);
}

function parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function minutesOfDay(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

// Возвращает true если currentMinutes попадает в quiet-окно.
// Учитывает wrap-around (23:00–09:00).
function isInQuietHours(currentMinutes, quietStart, quietEnd) {
  const start = parseHHMM(quietStart);
  const end = parseHHMM(quietEnd);
  if (start === null || end === null) return false;
  if (start === end) return false;
  if (start < end) {
    return currentMinutes >= start && currentMinutes < end;
  }
  // wrap-around: например 23:00–09:00
  return currentMinutes >= start || currentMinutes < end;
}

function todayDateMsk() {
  const d = nowInMsk();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function isoDateNDaysAgoMsk(n) {
  const d = nowInMsk();
  d.setUTCDate(d.getUTCDate() - n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ─── Idempotency ──────────────────────────────────────────────────────

async function claimIdempotency(client, key) {
  const r = await client.query(
    `INSERT INTO push_idempotency (key) VALUES ($1)
     ON CONFLICT (key) DO NOTHING
     RETURNING key`,
    [key]
  );
  return r.rowCount > 0;
}

// ─── Push sending ──────────────────────────────────────────────────────

async function sendToSubscriptions(client, table, idCol, ownerId, payload) {
  const subsRes = await client.query(
    `SELECT id, endpoint, p256dh, auth FROM ${table} WHERE ${idCol} = $1`,
    [ownerId]
  );
  if (subsRes.rows.length === 0) return { sent: 0, total: 0, cleaned: 0 };

  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subsRes.rows.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body
      )
    )
  );

  // Чистим dead endpoints (404/410).
  const deadIds = results
    .map((r, i) => {
      if (r.status === 'rejected') {
        const code = r.reason?.statusCode;
        if (code === 404 || code === 410) return subsRes.rows[i].id;
      }
      return null;
    })
    .filter(Boolean);

  if (deadIds.length) {
    await client.query(
      `DELETE FROM ${table} WHERE id = ANY($1::uuid[])`,
      [deadIds]
    );
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return { sent, total: subsRes.rows.length, cleaned: deadIds.length };
}

async function sendToClient(client, clientId, payload) {
  return sendToSubscriptions(client, 'push_subscriptions', 'client_id', clientId, payload);
}

async function sendToCurator(client, curatorId, payload) {
  return sendToSubscriptions(client, 'curator_push_subscriptions', 'curator_id', curatorId, payload);
}

// ─── Prefs ─────────────────────────────────────────────────────────────

const DEFAULT_CLIENT_PREFS = {
  enabled: true,
  quiet_start: '23:00',
  quiet_end: '09:00',
  meal_reminder_enabled: true,
  meal_reminder_gap_hours: 4,
  evening_summary_enabled: true,
  evening_summary_time: '21:00',
  streak_celebration_enabled: true,
};

const DEFAULT_CURATOR_PREFS = {
  enabled: true,
  quiet_start: '22:00',
  quiet_end: '08:00',
  inactive_client_enabled: true,
};

async function getClientPrefs(client, clientId) {
  const r = await client.query(
    `SELECT v FROM client_kv_store WHERE client_id = $1 AND k = 'heys_push_prefs' LIMIT 1`,
    [clientId]
  );
  return { ...DEFAULT_CLIENT_PREFS, ...(r.rows[0]?.v || {}) };
}

async function getCuratorPrefs(client, curatorId) {
  // Таблица создаётся lazily в heys-api-push.
  try {
    const r = await client.query(
      `SELECT v FROM curator_prefs WHERE curator_id = $1 LIMIT 1`,
      [curatorId]
    );
    return { ...DEFAULT_CURATOR_PREFS, ...(r.rows[0]?.v || {}) };
  } catch {
    return { ...DEFAULT_CURATOR_PREFS };
  }
}

// ─── a) Курятор-батчинг ────────────────────────────────────────────────

async function jobCuratorBatching(client) {
  const pending = await client.query(
    `SELECT client_id, COUNT(*)::int AS cnt, MIN(created_at) AS first_at
       FROM client_data_changelog
      WHERE notified_at IS NULL
        AND created_at < NOW() - INTERVAL '1 minute'
      GROUP BY client_id`
  );

  let total = 0;
  for (const row of pending.rows) {
    const prefs = await getClientPrefs(client, row.client_id);
    if (!prefs.enabled) continue;
    const now = nowInMsk();
    if (isInQuietHours(minutesOfDay(now), prefs.quiet_start, prefs.quiet_end)) {
      // Не шлём в тишину, но и не помечаем notified_at — отложится до следующего слота.
      continue;
    }

    const payload = {
      title: 'HEYS — куратор обновил твой день',
      body: 'Загляни в приложение, чтобы посмотреть изменения.',
      tag: 'curator-update',
      url: '/',
    };
    const res = await sendToClient(client, row.client_id, payload);
    if (res.sent > 0) total += res.sent;

    // Помечаем все pending события этого клиента как notified.
    await client.query(
      `UPDATE client_data_changelog
          SET notified_at = NOW()
        WHERE client_id = $1 AND notified_at IS NULL
          AND created_at < NOW() - INTERVAL '1 minute'`,
      [row.client_id]
    );
  }
  return { processed: pending.rows.length, total };
}

// ─── b) 4h без еды ─────────────────────────────────────────────────────

function lastMealMinutesOfDay(dayJson) {
  if (!dayJson || !Array.isArray(dayJson.meals)) return null;
  let maxMin = null;
  for (const meal of dayJson.meals) {
    if (!meal?.time) continue;
    if (!Array.isArray(meal.items) || meal.items.length === 0) continue;
    const m = parseHHMM(meal.time);
    if (m === null) continue;
    if (maxMin === null || m > maxMin) maxMin = m;
  }
  return maxMin;
}

async function jobMealReminders(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const currentMinutes = minutesOfDay(now);

  // Берём всех клиентов с активной push-подпиской.
  const rows = await client.query(
    `SELECT DISTINCT client_id FROM push_subscriptions`
  );

  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || !prefs.meal_reminder_enabled) continue;
    if (isInQuietHours(currentMinutes, prefs.quiet_start, prefs.quiet_end)) continue;

    // Читаем сегодняшний день.
    const dayRes = await client.query(
      `SELECT v FROM client_kv_store WHERE client_id = $1 AND k = $2 LIMIT 1`,
      [clientId, `heys_dayv2_${today}`]
    );
    const dayJson = dayRes.rows[0]?.v || null;
    const lastMin = lastMealMinutesOfDay(dayJson);
    if (lastMin === null) continue; // ни одного приёма пищи сегодня — не напоминаем (будет вечером)

    const gapMin = currentMinutes - lastMin;
    const gapHoursMin = (prefs.meal_reminder_gap_hours || 4) * 60;
    if (gapMin < gapHoursMin) continue;

    // Hour-bucket для идемпотентности: один пуш на каждый "час разрыва".
    const hourBucket = Math.floor(gapMin / 60);
    const key = `meal_reminder:${today}:${hourBucket}:${clientId}`;
    if (!(await claimIdempotency(client, key))) continue;

    const payload = {
      title: 'HEYS — не забудь записать еду',
      body: `Прошло ${hourBucket} часа без записи. Запиши, чтобы статистика была ровной.`,
      tag: 'meal-reminder',
      url: '/',
    };
    const res = await sendToClient(client, clientId, payload);
    total += res.sent;
  }
  return { total };
}

// ─── c) Inactive client → куратору ─────────────────────────────────────

async function jobInactiveClients(client) {
  const today = todayDateMsk();
  const cutoff = isoDateNDaysAgoMsk(2);

  // Находим клиентов где последняя запись dayv2 старше cutoff (2 дня назад).
  const rows = await client.query(
    `SELECT c.id AS client_id, c.name, c.curator_id, MAX(kv.updated_at) AS last_log
       FROM clients c
       LEFT JOIN client_kv_store kv
              ON kv.client_id = c.id AND kv.k LIKE 'heys_dayv2_%'
      WHERE c.curator_id IS NOT NULL
      GROUP BY c.id, c.name, c.curator_id
      HAVING MAX(kv.updated_at) IS NULL
          OR MAX(kv.updated_at) < NOW() - INTERVAL '2 days'`
  );

  let total = 0;
  for (const row of rows.rows) {
    const prefs = await getCuratorPrefs(client, row.curator_id);
    if (!prefs.enabled || !prefs.inactive_client_enabled) continue;
    const now = nowInMsk();
    if (isInQuietHours(minutesOfDay(now), prefs.quiet_start, prefs.quiet_end)) continue;

    const key = `inactive_client:${today}:${row.curator_id}:${row.client_id}`;
    if (!(await claimIdempotency(client, key))) continue;

    const payload = {
      title: 'HEYS — клиент пропал',
      body: `${row.name || 'Клиент'} не логирует еду 2+ дня. Стоит выйти на связь.`,
      tag: `inactive-${row.client_id}`,
      url: '/curator',
    };
    const res = await sendToCurator(client, row.curator_id, payload);
    total += res.sent;
  }
  return { total };
}

// ─── d) Вечерний итог ──────────────────────────────────────────────────

function sumDayKcalProtein(dayJson) {
  let kcal = 0, protein = 0;
  if (!dayJson || !Array.isArray(dayJson.meals)) return { kcal: 0, protein: 0 };
  for (const meal of dayJson.meals) {
    if (!Array.isArray(meal.items)) continue;
    for (const item of meal.items) {
      const grams = Number(item.grams || 0);
      if (item.kcal100 != null) kcal += (Number(item.kcal100) * grams) / 100;
      else if (item.kcal != null) kcal += Number(item.kcal); // fallback
      if (item.protein100 != null) protein += (Number(item.protein100) * grams) / 100;
      else if (item.protein != null) protein += Number(item.protein);
    }
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein) };
}

async function jobEveningSummary(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const currentMinutes = minutesOfDay(now);

  const rows = await client.query(
    `SELECT DISTINCT client_id FROM push_subscriptions`
  );

  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || !prefs.evening_summary_enabled) continue;

    const targetMin = parseHHMM(prefs.evening_summary_time);
    if (targetMin === null) continue;
    // Окно ±7 минут от заданного времени (так как cron каждые 15 мин).
    const diff = currentMinutes - targetMin;
    if (diff < -7 || diff > 7) continue;

    if (isInQuietHours(currentMinutes, prefs.quiet_start, prefs.quiet_end)) continue;

    const key = `evening_summary:${today}:${clientId}`;
    if (!(await claimIdempotency(client, key))) continue;

    const dayRes = await client.query(
      `SELECT v FROM client_kv_store WHERE client_id = $1 AND k = $2 LIMIT 1`,
      [clientId, `heys_dayv2_${today}`]
    );
    const { kcal, protein } = sumDayKcalProtein(dayRes.rows[0]?.v || null);

    const payload = {
      title: 'HEYS — итог дня',
      body: kcal > 0
        ? `Сегодня: ${kcal} ккал, белок ${protein} г. Загляни, чтобы добрать норму.`
        : 'Ты сегодня ничего не записал. Самое время заглянуть в приложение.',
      tag: 'evening-summary',
      url: '/',
    };
    const res = await sendToClient(client, clientId, payload);
    total += res.sent;
  }
  return { total };
}

// ─── e) Стрик 7 дней ───────────────────────────────────────────────────

async function jobStreakCelebration(client) {
  const today = todayDateMsk();

  const rows = await client.query(
    `SELECT DISTINCT client_id FROM push_subscriptions`
  );

  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || !prefs.streak_celebration_enabled) continue;
    const now = nowInMsk();
    if (isInQuietHours(minutesOfDay(now), prefs.quiet_start, prefs.quiet_end)) continue;

    // Сегодня + 6 прошлых = 7 подряд. Проверяем что во всех есть meals.
    const keys = [];
    for (let i = 0; i < 7; i++) keys.push(`heys_dayv2_${isoDateNDaysAgoMsk(i)}`);

    const daysRes = await client.query(
      `SELECT k, v FROM client_kv_store
        WHERE client_id = $1 AND k = ANY($2::text[])`,
      [clientId, keys]
    );

    const daysFound = new Map();
    for (const d of daysRes.rows) daysFound.set(d.k, d.v);

    let allHaveMeals = true;
    for (const k of keys) {
      const v = daysFound.get(k);
      if (!v || !Array.isArray(v.meals)) { allHaveMeals = false; break; }
      const hasItems = v.meals.some((m) => Array.isArray(m.items) && m.items.length > 0);
      if (!hasItems) { allHaveMeals = false; break; }
    }
    if (!allHaveMeals) continue;

    const key = `streak_7d:${today}:${clientId}`;
    if (!(await claimIdempotency(client, key))) continue;

    const payload = {
      title: 'HEYS — 7 дней подряд!',
      body: 'Неделя без пропусков. Так держать!',
      tag: 'streak-7d',
      url: '/',
    };
    const res = await sendToClient(client, clientId, payload);
    total += res.sent;
  }
  return { total };
}

// ─── Main ──────────────────────────────────────────────────────────────

module.exports.handler = async function (event, context) {
  const startedAt = Date.now();
  console.log('[cron-reminders] start', { trigger: event?.messages?.[0]?.event_metadata?.event_type || 'manual' });

  const pool = getPool();
  const client = await pool.connect();
  let stats = {};
  try {
    stats.curatorBatching = await jobCuratorBatching(client);
    stats.mealReminders = await jobMealReminders(client);
    stats.inactiveClients = await jobInactiveClients(client);
    stats.eveningSummary = await jobEveningSummary(client);
    stats.streakCelebration = await jobStreakCelebration(client);
  } catch (err) {
    console.error('[cron-reminders] error:', err.message, err.stack);
    stats.error = err.message;
  } finally {
    client.release();
  }

  const duration = Date.now() - startedAt;
  console.log('[cron-reminders] done', { duration_ms: duration, stats });
  return { statusCode: 200, body: JSON.stringify({ ok: true, duration_ms: duration, stats }) };
};
