/**
 * heys-cron-reminders — периодические push-уведомления.
 *
 * Запуск: Yandex Cloud Timer Trigger каждые 15 минут.
 *
 * Существующие 5 сценариев (a–e) + 11 новых (1–11):
 *
 *   a) Куратор-батчинг: client_data_changelog (pending > 1 min) → 1 пуш клиенту
 *   b) 4ч без еды → клиенту
 *   c) Inactive client (>2 дней без логов) → куратору
 *   d) Вечерний итог в evening_summary_time
 *   e) Стрик 7 дней
 *
 *   1) Утренний завтрак (12:00 ±7мин если нет meals)
 *   2) Утренний чек-ин — взвесься (через 1ч после среднего пробуждения)
 *   3) Утренние витамины (10 мин после чек-ина, если есть plannedSupplements)
 *   4) 4ч без воды (эвристика: отстаёт от пропорции к дневной норме)
 *   5) 90% дневной нормы калорий
 *   6) Превышение нормы Б/Ж/У
 *   7) 3 дня подряд переедание (>110%) → разгрузка
 *   8) Поздний приём пищи (позже медианы последних 14 дней)
 *   9) Достиг цели по весу (≤ weightGoal+0.5, 7 дней подряд) → куратору
 *  10) EWS-критичный паттерн (из client snapshot, trend_delta ≤ -0.2)
 *  11) Подписка истекает (trial < 3д / active < 7д / просрочка) → куратору
 *
 * Idempotency: каждый сценарий имеет свой ключ в push_idempotency.
 * Тон сообщений: дружелюбный с эмодзи.
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const webpush = require('web-push');
const { collapseNetChange, bucketize, formatBody } = require('./curator-action-format');
const { deliverIdempotently, isInReminderDeliveryWindow } = require('./push-idempotency');
const {
  HUNGER_EVENTS_KEY,
  findDueHungerFollowUps,
  buildHungerFollowUpPayload,
  buildHungerFollowUpIdempotencyKey,
} = require('./hunger-follow-up');

// VAPID config: лениво, после initSecrets() — иначе на cold start читаем
// плейсхолдер `__IN_LOCKBOX__heys-app-secrets__` из env и setVapidDetails ломается.
let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@heyslab.ru';
  if (pub && priv && !pub.startsWith('__IN_LOCKBOX__') && !priv.startsWith('__IN_LOCKBOX__')) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
  } else {
    console.error('[cron-reminders] FATAL: VAPID keys not configured (lockbox load failed?)');
  }
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
    try {
      await client.query(
        `DELETE FROM ${table} WHERE id = ANY($1::uuid[])`,
        [deadIds]
      );
    } catch (error) {
      // Доставка уже завершилась: ошибка housekeeping не должна превращать
      // успешный push в retry и создавать дубль на живом endpoint.
      console.error('[cron-reminders] failed to clean dead push subscriptions', {
        table,
        count: deadIds.length,
        error: error.message,
      });
    }
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
  curator_actions_enabled: true, // 📝 Privacy split: гейтит push о действиях куратора
  hunger_follow_up_enabled: true,
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

// ─── Templates (дружелюбный тон с эмодзи) ─────────────────────────────

const T = {
  morningBreakfast: () => ({
    title: '🍳 HEYS — пора завтракать',
    body: 'Самое время добавить первый приём пищи ☀️',
  }),
  morningCheckin: () => ({
    title: '⚖️ HEYS — утренний чек-ин',
    body: 'Доброе утро! Время взвеситься и отметить как спалось',
  }),
  morningVitamins: (list) => ({
    title: '💊 HEYS — утренние витамины',
    body: list && list.length ? `Не забудь: ${list.join(', ')}` : 'Не забудь утренние витамины',
  }),
  waterHint: (deficitMl) => ({
    title: '💧 HEYS — попей воды',
    body: deficitMl > 0
      ? `Сегодня не хватает ~${deficitMl} мл воды. Попей стакан 🥤`
      : 'Давно не пил воды — попей стакан 🥤',
  }),
  cal90: (leftKcal) => ({
    title: '⚠️ HEYS — почти достиг нормы',
    body: leftKcal > 0
      ? `Осталось ${leftKcal} ккал до дневной нормы`
      : 'Уже на 90% дневной нормы — следи за порциями',
  }),
  macroOverP: () => ({ title: '🥩 HEYS — превышение белка',     body: 'Сегодня перебор по белку. Завтра — больше овощей' }),
  macroOverF: () => ({ title: '🥑 HEYS — превышение жиров',     body: 'Сегодня перебор по жирам — попробуй лёгкий ужин' }),
  macroOverC: () => ({ title: '🍞 HEYS — превышение углеводов', body: 'Сегодня перебор по углеводам — добавь белок и клетчатку' }),
  overeat3d: () => ({
    title: '🌿 HEYS — пора на разгрузку',
    body: '3 дня перебор — попробуй сегодня разгрузочный день',
  }),
  lateMeal: () => ({
    title: '🌙 HEYS — поздно поел',
    body: 'Сегодня позднее обычного. Попробуй завтра ужинать пораньше',
  }),
  calStreakCurator: (clientName, days) => ({
    title: '🏆 HEYS — клиент держит план!',
    body: `${clientName || 'Клиент'} ${days} дней подряд укладывается в норму калорий. Время обновить план.`,
  }),
  ewsCurator: (clientName, patternName) => ({
    title: '⚠️ HEYS — алёрт EWS',
    body: `${clientName || 'Клиент'}: ухудшение паттерна «${patternName}»`,
  }),
  ewsClient: (patternName) => ({
    title: '💛 HEYS — мягкий намёк',
    body: `Заметили ухудшение в «${patternName}». Загляни в инсайты`,
  }),
  subscriptionTrialEnding: (clientName, daysLeft) => ({
    title: '💳 HEYS — пробный истекает',
    body: `${clientName || 'Клиент'}: пробный период истекает через ${daysLeft} дн.`,
  }),
  subscriptionEnding: (clientName, daysLeft) => ({
    title: '💳 HEYS — подписка истекает',
    body: `${clientName || 'Клиент'}: подписка истекает через ${daysLeft} дн.`,
  }),
  subscriptionExpired: (clientName) => ({
    title: '💳 HEYS — подписка истекла',
    body: `${clientName || 'Клиент'}: подписка истекла. Время связаться.`,
  }),
};

// ─── Серверные helpers для новых сценариев ────────────────────────────

/** Сумма kcal/протеин/жир/углеводы за день из dayv2.meals[]. */
function sumDayMacros(dayJson) {
  let kcal = 0, protein = 0, fat = 0, carbs = 0;
  if (!dayJson || !Array.isArray(dayJson.meals)) return { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const meal of dayJson.meals) {
    if (!Array.isArray(meal.items)) continue;
    for (const item of meal.items) {
      const grams = Number(item.grams || 0);
      if (item.kcal100 != null) kcal += (Number(item.kcal100) * grams) / 100;
      else if (item.kcal != null) kcal += Number(item.kcal);
      if (item.protein100 != null) protein += (Number(item.protein100) * grams) / 100;
      else if (item.protein != null) protein += Number(item.protein);
      if (item.fat100 != null) fat += (Number(item.fat100) * grams) / 100;
      else if (item.fat != null) fat += Number(item.fat);
      if (item.carbs100 != null) carbs += (Number(item.carbs100) * grams) / 100;
      else if (item.carbs != null) carbs += Number(item.carbs);
    }
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) };
}

/** Загрузить один KV-ключ клиента (heys_*). null если нет. */
async function loadKv(client, clientId, k) {
  const r = await client.query(
    `SELECT v FROM client_kv_store WHERE client_id = $1 AND k = $2 LIMIT 1`,
    [clientId, k]
  );
  return r.rows[0]?.v || null;
}

/** Норма kcal/Б/Ж/У/вода. Читает heys_norms + heys_profile, возвращает абсолютные значения. */
async function getNorms(client, clientId) {
  const norms = (await loadKv(client, clientId, 'heys_norms')) || {};
  const profile = (await loadKv(client, clientId, 'heys_profile')) || {};
  // Абсолютная дневная норма kcal из profile (поля могут разные — пробуем).
  const kcal = Number(profile.dailyKcal || profile.kcalGoal || profile.targetKcal || norms.kcal || 0);
  if (kcal <= 0) return null;
  // Проценты Б/У из heys_norms (или fallback на profile). Жиры = 100 - Б - У.
  const proteinPct = Number(norms.proteinPct || profile.proteinPct || 25);
  const carbsPct = Number(norms.carbsPct || profile.carbsPct || 45);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);
  // 1 г белка = 4 ккал, углевода = 4 ккал, жира = 9 ккал.
  const protein = Math.round((kcal * proteinPct) / 100 / 4);
  const carbs = Math.round((kcal * carbsPct) / 100 / 4);
  const fat = Math.round((kcal * fatPct) / 100 / 9);
  // Вода: heys_norms.water или fallback 2000 мл.
  const water = Number(norms.water || profile.waterGoal || 2000);
  return { kcal, protein, fat, carbs, water };
}

/** Получить kcal за каждый из последних N дней (включая сегодня). */
async function getLastNDaysKcal(client, clientId, n) {
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(`heys_dayv2_${isoDateNDaysAgoMsk(i)}`);
  const r = await client.query(
    `SELECT k, v FROM client_kv_store
      WHERE client_id = $1 AND k = ANY($2::text[])`,
    [clientId, keys]
  );
  const map = new Map();
  for (const row of r.rows) map.set(row.k, row.v);
  return keys.map((k) => sumDayMacros(map.get(k) || null).kcal);
}

/** Среднее время пробуждения (sleepEnd) за 7 дней. Возвращает minutes-of-day или null. */
async function getWakeAvgMinutes(client, clientId) {
  const keys = [];
  for (let i = 0; i < 7; i++) keys.push(`heys_dayv2_${isoDateNDaysAgoMsk(i)}`);
  const r = await client.query(
    `SELECT v FROM client_kv_store
      WHERE client_id = $1 AND k = ANY($2::text[])`,
    [clientId, keys]
  );
  const minutes = [];
  for (const row of r.rows) {
    const t = row.v?.sleepEnd;
    if (typeof t !== 'string') continue;
    const m = parseHHMM(t);
    if (m !== null) minutes.push(m);
  }
  if (minutes.length < 5) return null; // мало данных — fallback на client logic
  return Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
}

/** Медиана minutes-of-day последнего приёма пищи за 14 дней. null если мало данных. */
async function getLastMealMedian(client, clientId) {
  const keys = [];
  for (let i = 1; i <= 14; i++) keys.push(`heys_dayv2_${isoDateNDaysAgoMsk(i)}`); // не включаем сегодня
  const r = await client.query(
    `SELECT v FROM client_kv_store
      WHERE client_id = $1 AND k = ANY($2::text[])`,
    [clientId, keys]
  );
  const minutes = [];
  for (const row of r.rows) {
    const m = lastMealMinutesOfDay(row.v);
    if (m !== null) minutes.push(m);
  }
  if (minutes.length < 7) return null;
  minutes.sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  return minutes.length % 2 ? minutes[mid] : Math.round((minutes[mid - 1] + minutes[mid]) / 2);
}

/**
 * Серия дней подряд (включая сегодня и предыдущие) где kcal в диапазоне
 * [normKcal × 0.9, normKcal × 1.05] — клиент «держит план питания».
 * Возвращает { streak, startDate } — длина серии и дата ПЕРВОГО дня
 * (самый старый день серии, формат YYYY-MM-DD). startDate используется как
 * sentinel — пока серия не порвётся, startDate стабилен → один push на серию.
 * Когда серия порвалась и начался новый счёт с другой даты — новый
 * startDate → новый sentinel → новый push.
 */
async function getCalStreak(client, clientId, normKcal) {
  if (!normKcal || normKcal <= 0) return { streak: 0, startDate: null };
  const lo = normKcal * 0.9;
  const hi = normKcal * 1.05;
  let streak = 0;
  let startDate = null;
  for (let i = 0; i < 14; i++) {
    const dateStr = isoDateNDaysAgoMsk(i);
    const v = await loadKv(client, clientId, `heys_dayv2_${dateStr}`);
    const k = sumDayMacros(v).kcal;
    if (k <= 0) break; // ни одной записи — серия прерывается
    if (k >= lo && k <= hi) {
      startDate = dateStr; // обновляется на самый старый день в серии (i растёт назад)
      streak++;
    } else break;
  }
  return { streak, startDate };
}

/** Hour-bucket для воды: чтобы пуш о воде шёл не чаще раз в 4 часа. */
function waterHourBucket(currentMinutes) {
  return Math.floor(currentMinutes / 60 / 4); // 0..5 в течение суток
}

// ─── a) Курятор-батчинг ────────────────────────────────────────────────

async function jobCuratorBatching(client) {
  // 📝 v2: агрегируем `actions` payload через jsonb_agg, формируем
  // динамический body ("+2 приёма пищи, вес 89→90") через format helpers.
  // Если actions колонки пустые (legacy rows до миграции 2026-05-18) — fallback
  // на старый generic body.
  // 🛡️ acked_at IS NULL — если юзер УЖЕ нажал "Понял" в banner до того как
  // cron успел отправить push, пуш больше не нужен (шумит впустую).
  const pending = await client.query(
    `SELECT client_id,
            COUNT(*)::int AS cnt,
            MIN(created_at) AS first_at,
            jsonb_agg(actions) AS actions_array
       FROM client_data_changelog
      WHERE notified_at IS NULL
        AND acked_at IS NULL
        AND created_at < NOW() - INTERVAL '1 minute'
      GROUP BY client_id`
  );

  let total = 0;
  for (const row of pending.rows) {
    const prefs = await getClientPrefs(client, row.client_id);
    if (!prefs.enabled) continue;
    if (prefs.curator_actions_enabled === false) {
      // 📝 Privacy split: клиент отключил уведомления о действиях куратора.
      // Маркируем notified_at чтобы не накапливать pending — banner всё равно
      // покажет это в приложении (banner читает acked_at, а не notified_at).
      await client.query(
        `UPDATE client_data_changelog
            SET notified_at = NOW()
          WHERE client_id = $1 AND notified_at IS NULL
            AND acked_at IS NULL
            AND created_at < NOW() - INTERVAL '1 minute'`,
        [row.client_id]
      );
      continue;
    }
    const now = nowInMsk();
    if (isInQuietHours(minutesOfDay(now), prefs.quiet_start, prefs.quiet_end)) {
      // Не шлём в тишину, но и не помечаем notified_at — отложится до следующего слота.
      continue;
    }

    // Flatten все actions из всех pending rows этого клиента.
    let body = 'Загляни в приложение, чтобы посмотреть изменения.';
    try {
      const flat = [];
      const arr = Array.isArray(row.actions_array) ? row.actions_array : [];
      for (const entry of arr) {
        if (!entry) continue;
        const acts = Array.isArray(entry.actions) ? entry.actions : [];
        flat.push(...acts);
      }
      if (flat.length > 0) {
        const collapsed = collapseNetChange(flat);
        const buckets = bucketize(collapsed);
        body = formatBody(buckets);
      }
    } catch (formatErr) {
      console.warn('[curator-batching] body format failed:', formatErr.message);
    }

    const payload = {
      title: 'Куратор обновил твой день',
      body,
      tag: 'curator-update',
      url: '/?openCuratorFeed=1',
    };
    const res = await sendToClient(client, row.client_id, payload);
    if (res.sent > 0) total += res.sent;

    // Помечаем pending события этого клиента как notified.
    // Гард `acked_at IS NULL` — если юзер успел ack'нуть параллельно с этим
    // RPC-tick'ом, мы не перетираем notified_at (хотя на практике уже отправили).
    await client.query(
      `UPDATE client_data_changelog
          SET notified_at = NOW()
        WHERE client_id = $1 AND notified_at IS NULL
          AND acked_at IS NULL
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

    const payload = {
      title: 'HEYS — не забудь записать еду',
      body: `Прошло ${hourBucket} часа без записи. Запиши, чтобы статистика была ровной.`,
      tag: 'meal-reminder',
      url: '/',
    };
    const res = await deliverIdempotently(client, key, () => sendToClient(client, clientId, payload));
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

    const payload = {
      title: 'HEYS — клиент пропал',
      body: `${row.name || 'Клиент'} не логирует еду 2+ дня. Стоит выйти на связь.`,
      tag: `inactive-${row.client_id}`,
      url: `/curator?client=${row.client_id}`,
    };
    const res = await deliverIdempotently(client, key, () => sendToCurator(client, row.curator_id, payload));
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
    if (!isInReminderDeliveryWindow(currentMinutes, targetMin)) continue;

    if (isInQuietHours(currentMinutes, prefs.quiet_start, prefs.quiet_end)) continue;

    const key = `evening_summary:${today}:${clientId}`;

    const res = await deliverIdempotently(client, key, async () => {
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
      return sendToClient(client, clientId, payload);
    });
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

    const payload = {
      title: 'HEYS — 7 дней подряд!',
      body: 'Неделя без пропусков. Так держать!',
      tag: 'streak-7d',
      url: '/',
    };
    const res = await deliverIdempotently(client, key, () => sendToClient(client, clientId, payload));
    total += res.sent;
  }
  return { total };
}

// ─── 1) Утренний завтрак (12:00 ±7мин если нет meals) ──────────────────

async function jobMorningBreakfast(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);
  const target = 12 * 60; // 12:00
  if (!isInReminderDeliveryWindow(cur, target)) return { total: 0, skipped: 'window' };

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.morning_breakfast_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const day = await loadKv(client, clientId, `heys_dayv2_${today}`);
    const lastMeal = lastMealMinutesOfDay(day);
    if (lastMeal !== null) continue; // уже есть приём пищи

    const key = `morning_breakfast:${today}:${clientId}`;

    const res = await deliverIdempotently(client, key, () => (
      sendToClient(client, clientId, { ...T.morningBreakfast(), tag: 'morning-breakfast', url: '/' })
    ));
    total += res.sent;
  }
  return { total };
}

// ─── 2) Утренний чек-ин (взвесься/сон) ─────────────────────────────────

async function jobMorningCheckin(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.morning_checkin_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const wakeAvg = await getWakeAvgMinutes(client, clientId);
    const target = (wakeAvg !== null ? wakeAvg : 8 * 60) + 60; // wake + 1 час
    if (!isInReminderDeliveryWindow(cur, target)) continue;

    // Если weightMorning уже заполнен — не шлём.
    const day = await loadKv(client, clientId, `heys_dayv2_${today}`);
    if (day?.weightMorning && Number(day.weightMorning) > 0) continue;

    const key = `morning_checkin:${today}:${clientId}`;

    const res = await deliverIdempotently(client, key, () => (
      sendToClient(client, clientId, { ...T.morningCheckin(), tag: 'morning-checkin', url: '/' })
    ));
    total += res.sent;
  }
  return { total };
}

// ─── 3) Утренние витамины (10 мин после чек-ина) ───────────────────────

async function jobMorningVitamins(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.morning_vitamins_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const wakeAvg = await getWakeAvgMinutes(client, clientId);
    const target = (wakeAvg !== null ? wakeAvg : 8 * 60) + 60 + 10; // wake + 1ч + 10мин
    if (!isInReminderDeliveryWindow(cur, target)) continue;

    // Витамины — только если есть plannedSupplements
    const profile = await loadKv(client, clientId, 'heys_profile');
    const supplements = Array.isArray(profile?.plannedSupplements) ? profile.plannedSupplements : [];
    if (supplements.length === 0) continue;

    // И только если чек-ин уже сделан
    const day = await loadKv(client, clientId, `heys_dayv2_${today}`);
    if (!day?.weightMorning) continue;

    const key = `morning_vitamins:${today}:${clientId}`;

    // Соберём список названий
    const names = supplements
      .map((s) => s.name || s.id || '')
      .filter(Boolean)
      .slice(0, 3); // не более 3 в тексте

    const res = await deliverIdempotently(client, key, () => (
      sendToClient(client, clientId, { ...T.morningVitamins(names), tag: 'morning-vitamins', url: '/' })
    ));
    total += res.sent;
  }
  return { total };
}

// ─── 4) 4ч без воды (эвристика) ────────────────────────────────────────

async function jobWaterHint(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.water_hint_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const norms = await getNorms(client, clientId);
    if (!norms || !norms.water) continue;

    const wakeAvg = (await getWakeAvgMinutes(client, clientId)) ?? 8 * 60;
    const hoursSinceWake = Math.max(1, (cur - wakeAvg) / 60);
    const totalActiveHours = Math.max(1, (20 * 60 - wakeAvg) / 60); // активно до 20:00
    const expected = Math.min(norms.water, norms.water * (hoursSinceWake / totalActiveHours));

    const day = await loadKv(client, clientId, `heys_dayv2_${today}`);
    const actual = Number(day?.water || 0);
    const deficit = expected - actual;
    if (deficit < norms.water * 0.3) continue; // отстаём <30% — норм

    const bucket = waterHourBucket(cur);
    const key = `water_hint:${today}:${bucket}:${clientId}`;

    const res = await deliverIdempotently(client, key, () => (
      sendToClient(client, clientId, { ...T.waterHint(Math.round(deficit)), tag: 'water-hint', url: '/' })
    ));
    total += res.sent;
  }
  return { total };
}

// ─── 5) 90% дневной нормы калорий ──────────────────────────────────────

async function jobCal90(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.cal_90_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const norms = await getNorms(client, clientId);
    if (!norms || !norms.kcal) continue;

    const day = await loadKv(client, clientId, `heys_dayv2_${today}`);
    const macros = sumDayMacros(day);
    const pct = macros.kcal / norms.kcal;
    if (pct < 0.9 || pct >= 1.0) continue; // 90–100%

    const key = `cal_90:${today}:${clientId}`;

    const left = Math.max(0, norms.kcal - macros.kcal);
    const res = await deliverIdempotently(client, key, () => (
      sendToClient(client, clientId, { ...T.cal90(left), tag: 'cal-90', url: '/' })
    ));
    total += res.sent;
  }
  return { total };
}

// ─── 6) Превышение нормы Б/Ж/У ─────────────────────────────────────────

async function jobMacroOver(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.macro_over_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const norms = await getNorms(client, clientId);
    if (!norms) continue;

    const day = await loadKv(client, clientId, `heys_dayv2_${today}`);
    const macros = sumDayMacros(day);

    const checks = [
      { code: 'p', val: macros.protein, norm: norms.protein, tpl: T.macroOverP },
      { code: 'f', val: macros.fat,     norm: norms.fat,     tpl: T.macroOverF },
      { code: 'c', val: macros.carbs,   norm: norms.carbs,   tpl: T.macroOverC },
    ];
    for (const c of checks) {
      if (!c.norm || c.val < c.norm) continue;
      const key = `macro_over_${c.code}:${today}:${clientId}`;
      const res = await deliverIdempotently(client, key, () => (
        sendToClient(client, clientId, { ...c.tpl(), tag: `macro-over-${c.code}`, url: '/' })
      ));
      total += res.sent;
    }
  }
  return { total };
}

// ─── 7) 3 дня переедание → разгрузка (в 09:00) ─────────────────────────

async function jobOvereat3d(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);
  if (!isInReminderDeliveryWindow(cur, 9 * 60)) return { total: 0, skipped: 'window' };

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.overeat_3d_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const norms = await getNorms(client, clientId);
    if (!norms || !norms.kcal) continue;

    // Последние 3 дня (вчера, позавчера, поза-позавчера)
    const keys = [];
    for (let i = 1; i <= 3; i++) keys.push(`heys_dayv2_${isoDateNDaysAgoMsk(i)}`);
    const dRes = await client.query(
      `SELECT k, v FROM client_kv_store WHERE client_id = $1 AND k = ANY($2::text[])`,
      [clientId, keys]
    );
    if (dRes.rows.length < 3) continue;
    const allOver = dRes.rows.every((row) => sumDayMacros(row.v).kcal > norms.kcal * 1.10);
    if (!allOver) continue;

    const key = `overeat_3d:${today}:${clientId}`;

    const res = await deliverIdempotently(client, key, () => (
      sendToClient(client, clientId, { ...T.overeat3d(), tag: 'overeat-3d', url: '/' })
    ));
    total += res.sent;
  }
  return { total };
}

// ─── 8) Поздний приём пищи (по медиане) ────────────────────────────────

async function jobLateMeal(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);
  if (cur < 21 * 60) return { total: 0, skipped: 'window' };

  const rows = await client.query(`SELECT DISTINCT client_id FROM push_subscriptions`);
  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const prefs = await getClientPrefs(client, clientId);
    if (!prefs.enabled || prefs.late_meal_enabled === false) continue;
    if (isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) continue;

    const median = await getLastMealMedian(client, clientId);
    if (median === null) continue;

    const day = await loadKv(client, clientId, `heys_dayv2_${today}`);
    const lastToday = lastMealMinutesOfDay(day);
    if (lastToday === null) continue;
    if (lastToday < median + 30) continue;

    const key = `late_meal:${today}:${clientId}`;

    const res = await deliverIdempotently(client, key, () => (
      sendToClient(client, clientId, { ...T.lateMeal(), tag: 'late-meal', url: '/' })
    ));
    total += res.sent;
  }
  return { total };
}

// ─── 9) Держит план питания 7 дней → куратору (на каждую серию заново) ─

async function jobCalStreak(client) {
  const rows = await client.query(
    `SELECT c.id AS client_id, c.name, c.curator_id
       FROM clients c
      WHERE c.curator_id IS NOT NULL`
  );

  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const norms = await getNorms(client, clientId);
    if (!norms || !norms.kcal) continue;

    const { streak, startDate } = await getCalStreak(client, clientId, norms.kcal);
    if (streak < 7 || !startDate) continue;

    // Sentinel = startDate серии. Пока серия не порвётся — startDate стабилен,
    // sentinel один → один push. Серия порвалась и началась новая → новая
    // startDate → новый sentinel → новый push.
    const key = `cal_streak:${clientId}:${startDate}`;
    const res = await deliverIdempotently(client, key, async () => {
      const prefs = await getCuratorPrefs(client, r.curator_id);
      if (!prefs.enabled) return { sent: 0, total: 0, cleaned: 0 };
      return sendToCurator(client, r.curator_id, {
        ...T.calStreakCurator(r.name, streak),
        tag: `cal-streak-${clientId}`,
        url: `/curator?client=${clientId}`,
      });
    });
    total += res.sent;
  }
  return { total };
}

// ─── 10) EWS-критичный паттерн (читает client snapshot) ────────────────

async function jobEwsAlerts(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);
  // Проверяем раз в день в 10:00 ±7 мин (sentinel + раз в 3 дня)
  if (!isInReminderDeliveryWindow(cur, 10 * 60)) return { total: 0, skipped: 'window' };

  const rows = await client.query(
    `SELECT c.id AS client_id, c.name, c.curator_id
       FROM clients c
      WHERE c.curator_id IS NOT NULL`
  );

  let total = 0;
  for (const r of rows.rows) {
    const clientId = r.client_id;
    const snapshot = await loadKv(client, clientId, 'heys_ews_snapshot');
    if (!Array.isArray(snapshot) || snapshot.length === 0) continue;

    // Фильтр: критичные паттерны где trend_delta ≤ -0.2 за 7 дней.
    // Также отбрасываем протухшие snapshot (computed_at > 7 дней назад) —
    // клиент давно не заходил, EWS-данные устарели, не шлём ложные алёрты.
    const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const critical = snapshot.filter((p) => {
      if (Number(p.trend_delta) > -0.2) return false;
      const computedTs = p.computed_at ? new Date(p.computed_at).getTime() : 0;
      if (!computedTs || computedTs < staleCutoff) return false;
      return true;
    });
    if (critical.length === 0) continue;

    for (const p of critical) {
      // sentinel раз в 3 дня
      const day3 = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 3));
      const key = `ews:${p.pattern_id || p.id}:${clientId}:${day3}`;
      const res = await deliverIdempotently(client, key, async () => {
        const result = { sent: 0, total: 0, cleaned: 0 };
        try {
          // Куратору — полный текст
          const curatorPrefs = await getCuratorPrefs(client, r.curator_id);
          if (curatorPrefs.enabled) {
            const curatorResult = await sendToCurator(client, r.curator_id, {
              ...T.ewsCurator(r.name, p.name || p.pattern_id || 'паттерн'),
              tag: `ews-${p.pattern_id}-${clientId}`,
              url: `/curator?client=${clientId}`,
            });
            result.sent += curatorResult.sent;
            result.total += curatorResult.total;
            result.cleaned += curatorResult.cleaned;
          }
          // Клиенту — мягкий намёк
          const prefs = await getClientPrefs(client, clientId);
          if (prefs.enabled && prefs.ews_client_hint_enabled !== false) {
            if (!isInQuietHours(cur, prefs.quiet_start, prefs.quiet_end)) {
              const clientResult = await sendToClient(client, clientId, {
                ...T.ewsClient(p.name || p.pattern_id || 'паттерн'),
                tag: `ews-client-${p.pattern_id}`,
                url: '/',
              });
              result.sent += clientResult.sent;
              result.total += clientResult.total;
              result.cleaned += clientResult.cleaned;
            }
          }
        } catch (error) {
          if (result.sent < 1) throw error;
          console.error('[cron-reminders] EWS channel failed after partial delivery', {
            key,
            sent: result.sent,
            error: error.message,
          });
        }
        return result;
      });
      total += res.sent;
    }
    void today; // eslint-disable-line no-unused-expressions
  }
  return { total };
}

// ─── 11) Подписка истекает (в 10:00) ───────────────────────────────────

async function jobSubscriptionExpiry(client) {
  const today = todayDateMsk();
  const now = nowInMsk();
  const cur = minutesOfDay(now);
  if (!isInReminderDeliveryWindow(cur, 10 * 60)) return { total: 0, skipped: 'window' };

  // Берём всех клиентов с куратором и активной/триал-подпиской
  const rows = await client.query(
    `SELECT c.id AS client_id, c.name, c.curator_id, c.subscription_status,
            s.trial_ends_at, s.active_until
       FROM clients c
       LEFT JOIN subscriptions s ON s.client_id = c.id
      WHERE c.curator_id IS NOT NULL`
  );

  let total = 0;
  for (const r of rows.rows) {
    if (!r.curator_id) continue;
    const status = r.subscription_status;
    const now = Date.now();
    let kind = null, daysLeft = 0, tpl = null;

    if (status === 'trial' && r.trial_ends_at) {
      daysLeft = Math.ceil((new Date(r.trial_ends_at).getTime() - now) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 3) { kind = 'trial_ending'; tpl = T.subscriptionTrialEnding; }
    } else if (status === 'active' && r.active_until) {
      daysLeft = Math.ceil((new Date(r.active_until).getTime() - now) / (1000 * 60 * 60 * 24));
      if (daysLeft >= 0 && daysLeft <= 7) { kind = 'active_ending'; tpl = T.subscriptionEnding; }
    } else if (status === 'expired' || status === 'cancelled') {
      kind = 'expired';
      tpl = T.subscriptionExpired;
    }

    if (!kind || !tpl) continue;

    const key = `subscription_${kind}:${today}:${r.client_id}`;

    const payload = kind === 'expired'
      ? { ...tpl(r.name), tag: `subscription-${kind}-${r.client_id}`, url: `/curator?client=${r.client_id}` }
      : { ...tpl(r.name, daysLeft), tag: `subscription-${kind}-${r.client_id}`, url: `/curator?client=${r.client_id}` };

    const res = await deliverIdempotently(client, key, () => sendToCurator(client, r.curator_id, payload));
    total += res.sent;
  }
  return { total };
}

// ─── Hunger outcome follow-up ────────────────────────────────────────

async function jobHungerOutcomeFollowUps(client) {
  const rows = await client.query(
    `SELECT kv.client_id, kv.v
       FROM client_kv_store kv
      WHERE kv.k = $1
        AND kv.updated_at >= NOW() - INTERVAL '2 days'
        AND EXISTS (
          SELECT 1 FROM push_subscriptions ps WHERE ps.client_id = kv.client_id
        )`,
    [HUNGER_EVENTS_KEY]
  );
  const now = Date.now();
  const currentMinutes = minutesOfDay(nowInMsk());
  let total = 0;
  let due = 0;

  for (const row of rows.rows) {
    const prefs = await getClientPrefs(client, row.client_id);
    if (!prefs.enabled || prefs.hunger_follow_up_enabled === false) continue;
    if (isInQuietHours(currentMinutes, prefs.quiet_start, prefs.quiet_end)) continue;
    const followUp = findDueHungerFollowUps(row.v, now)[0];
    if (!followUp) continue;
    due += 1;
    const key = buildHungerFollowUpIdempotencyKey(row.client_id, followUp);
    const result = await deliverIdempotently(client, key, () => (
      sendToClient(client, row.client_id, buildHungerFollowUpPayload(followUp))
    ));
    total += result.sent;
  }

  return { scanned: rows.rows.length, due, total };
}

// ─── Main ──────────────────────────────────────────────────────────────

module.exports.handler = async function (event, context) {
  await initSecrets();
  ensureVapid();
  const startedAt = Date.now();
  console.log('[cron-reminders] start', { trigger: event?.messages?.[0]?.event_metadata?.event_type || 'manual' });

  const pool = getPool();
  const client = await pool.connect();
  let stats = {};
  try {
    stats.curatorBatching = await jobCuratorBatching(client);
    stats.hungerOutcomeFollowUps = await jobHungerOutcomeFollowUps(client);
    stats.mealReminders = await jobMealReminders(client);
    stats.inactiveClients = await jobInactiveClients(client);
    stats.eveningSummary = await jobEveningSummary(client);
    stats.streakCelebration = await jobStreakCelebration(client);
    // ─── Новые сценарии (1–11) ──────────────────
    stats.morningBreakfast = await jobMorningBreakfast(client);
    stats.morningCheckin = await jobMorningCheckin(client);
    stats.morningVitamins = await jobMorningVitamins(client);
    stats.waterHint = await jobWaterHint(client);
    stats.cal90 = await jobCal90(client);
    stats.macroOver = await jobMacroOver(client);
    stats.overeat3d = await jobOvereat3d(client);
    stats.lateMeal = await jobLateMeal(client);
    stats.calStreak = await jobCalStreak(client);
    stats.ewsAlerts = await jobEwsAlerts(client);
    stats.subscriptionExpiry = await jobSubscriptionExpiry(client);
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
