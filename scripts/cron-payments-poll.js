#!/usr/bin/env node

/**
 * HEYS Payments Poll Fallback (P0.4)
 *
 * Каждые 5 минут проверяет в БД платежи в статусе 'pending' (не старше 24 часов)
 * и опрашивает ЮKassa GET /v3/payments/{id}. Если статус ЮKassa отличается от
 * нашего — формирует псевдо-webhook payload и POST'ит его в наш собственный
 * /payments/webhook с заголовком X-Internal-Cron-Token (обход IP-allowlist).
 *
 * Идемпотентность гарантируется на стороне webhook-handler через таблицу
 * payment_events (UNIQUE constraint), так что повторный poll того же события
 * безопасен.
 *
 * ENV:
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD — БД
 *   YUKASSA_SHOP_ID, YUKASSA_SECRET_KEY — Basic Auth ЮKassa
 *   PAYMENTS_API_URL — URL нашего webhook (default: https://api.heyslab.ru/payments/webhook)
 *   INTERNAL_CRON_TOKEN — должен совпадать с переменной в heys-api-payments
 *   DRY_RUN=true — режим проверки без HTTP-вызовов
 *
 * Run: node scripts/cron-payments-poll.js
 * Cron: каждые 5 минут — настраивается через Yandex Cloud Scheduler
 */

const { Client } = require('pg');

const PG_CONFIG = {
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '6432', 10),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'disable' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
};

const YUKASSA_SHOP_ID = process.env.YUKASSA_SHOP_ID;
const YUKASSA_SECRET_KEY = process.env.YUKASSA_SECRET_KEY;
const YUKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';
const PAYMENTS_WEBHOOK_URL =
  process.env.PAYMENTS_API_URL || 'https://api.heyslab.ru/payments/webhook';
const INTERNAL_CRON_TOKEN = process.env.INTERNAL_CRON_TOKEN;
const DRY_RUN = process.env.DRY_RUN === 'true';

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!PG_CONFIG.host || !PG_CONFIG.user || !PG_CONFIG.password) {
  fail('PG_HOST/PG_USER/PG_PASSWORD не заданы');
}
if (!YUKASSA_SHOP_ID || !YUKASSA_SECRET_KEY) {
  fail('YUKASSA_SHOP_ID/YUKASSA_SECRET_KEY не заданы');
}
if (!INTERNAL_CRON_TOKEN && !DRY_RUN) {
  fail('INTERNAL_CRON_TOKEN не задан (нужен для обхода IP-allowlist webhook)');
}

const yukassaAuthHeader =
  'Basic ' + Buffer.from(`${YUKASSA_SHOP_ID}:${YUKASSA_SECRET_KEY}`).toString('base64');

// Маппинг ЮKassa-статуса на eventType, который webhook-handler ожидает.
// Использую тот же набор, что и в P0.2.
function deriveEventType(externalStatus) {
  switch (externalStatus) {
    case 'succeeded':
      return 'payment.succeeded';
    case 'canceled':
      return 'payment.canceled';
    case 'waiting_for_capture':
      return 'payment.waiting_for_capture';
    case 'pending':
      return 'payment.pending';
    default:
      return `payment.${externalStatus}`;
  }
}

/**
 * GET /v3/payments/{id} в ЮKassa.
 */
async function fetchYukassaPayment(externalPaymentId) {
  const res = await fetch(`${YUKASSA_API_URL}/${encodeURIComponent(externalPaymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: yukassaAuthHeader,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YuKassa GET ${externalPaymentId}: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Триггерит наш webhook-pipeline через приватный internal-cron канал.
 */
async function triggerInternalWebhook(yukassaPayment) {
  const eventType = deriveEventType(yukassaPayment.status);
  const payload = {
    event: eventType,
    object: yukassaPayment,
    type: 'notification',
  };

  if (DRY_RUN) {
    console.log(`[DRY_RUN] would POST ${eventType} for ${yukassaPayment.id}`);
    return { dry: true };
  }

  const res = await fetch(PAYMENTS_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Cron-Token': INTERNAL_CRON_TOKEN,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`webhook POST: ${res.status} ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { received: true, raw: text };
  }
}

async function main() {
  const started = Date.now();
  console.log(`[CRON-POLL] started at ${new Date().toISOString()} (DRY_RUN=${DRY_RUN})`);

  const client = new Client(PG_CONFIG);
  await client.connect();

  let processed = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  try {
    // Берём pending платежи не старше 24h — старые скорее всего уже забыты клиентом
    // и могут засорять опрос ЮKassa.
    const result = await client.query(
      `SELECT id, external_payment_id, status, external_status, created_at
       FROM payments
       WHERE status = 'pending'
         AND external_payment_id IS NOT NULL
         AND created_at > NOW() - INTERVAL '24 hours'
         AND created_at < NOW() - INTERVAL '1 minute'
       ORDER BY created_at ASC
       LIMIT 100`,
    );

    console.log(`[CRON-POLL] candidates: ${result.rows.length}`);

    for (const row of result.rows) {
      processed += 1;
      const extId = row.external_payment_id;

      try {
        const yk = await fetchYukassaPayment(extId);

        // Если статус не изменился — пропускаем
        if (yk.status === row.external_status && yk.status === 'pending') {
          unchanged += 1;
          continue;
        }

        // Если платёж уже succeeded/canceled/waiting_for_capture — триггерим webhook
        await triggerInternalWebhook(yk);
        updated += 1;
        console.log(
          `[CRON-POLL] ${extId}: ${row.external_status || '(none)'} → ${yk.status} → webhook triggered`,
        );
      } catch (e) {
        errors += 1;
        console.error(`[CRON-POLL] error on ${extId}:`, e.message);
      }
    }
  } finally {
    await client.end();
  }

  const duration = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[CRON-POLL] done in ${duration}s — processed=${processed}, updated=${updated}, unchanged=${unchanged}, errors=${errors}`,
  );

  if (errors > 0) process.exit(2);
}

main().catch((err) => {
  console.error('[CRON-POLL] fatal:', err);
  process.exit(1);
});
