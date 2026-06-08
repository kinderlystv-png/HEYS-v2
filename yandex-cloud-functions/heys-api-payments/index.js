/**
 * heys-api-payments — Cloud Function для интеграции с ЮKassa
 * 
 * Endpoints:
 *   POST /payments/create   — Создать платёж, вернуть URL для редиректа
 *   POST /payments/webhook  — Обработать webhook от ЮKassa
 *   GET  /payments/status   — Проверить статус платежа
 * 
 * Env variables:
 *   YUKASSA_SHOP_ID     — ID магазина ЮKassa
 *   YUKASSA_SECRET_KEY  — Секретный ключ ЮKassa
 *   PG_HOST, PG_PORT, PG_DATABASE, PG_USER, PG_PASSWORD — PostgreSQL
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');
const {
  extractBearerToken,
  verifyClientSession,
  verifyCuratorJwt,
} = require('./shared/auth-helpers');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════════

const YUKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';

// ЮKassa notification IP ranges (https://yookassa.ru/developers/using-api/webhooks)
// All webhook POSTs must originate from these CIDRs. IPv4 only — ЮKassa не шлёт с IPv6.
const YUKASSA_IP_CIDRS = [
  { base: [185, 71, 76, 0], prefix: 27 },
  { base: [185, 71, 77, 0], prefix: 27 },
  { base: [77, 75, 153, 0], prefix: 25 },
  { base: [77, 75, 154, 128], prefix: 25 },
];

function ipToInt(parts) {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isInCidr(ip, base, prefix) {
  const mask = prefix === 32 ? 0xFFFFFFFF : ((~0 << (32 - prefix)) >>> 0);
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask);
}

function isYukassaIp(rawIp) {
  if (!rawIp) return false;
  // Strip port if present (e.g. "185.71.76.1:12345")
  const ipStr = rawIp.split(':')[0];
  const parts = ipStr.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;

  return (
    isInCidr(parts, [185, 71, 76, 0], 27) ||
    isInCidr(parts, [185, 71, 77, 0], 27) ||
    isInCidr(parts, [77, 75, 153, 0], 25) ||
    isInCidr(parts, [77, 75, 154, 128], 25)
  );
}

// Тарифные планы. Цены ОБЯЗАНЫ совпадать с apps/landing/src/config/pricing.ts
// и HEYS.config.prices в apps/web/heys_paywall_v1.js — иначе клиент покажет
// одну сумму, а ЮKassa спишет другую (нарушение оферты, п. 4.2 user-agreement).
const PLANS = {
  base: { price: 2990, name: 'Base', description: 'HEYS Base подписка на 1 месяц' },
  pro: { price: 7990, name: 'Pro', description: 'HEYS Pro подписка на 1 месяц' },
  proplus: { price: 14990, name: 'Pro+', description: 'HEYS Pro+ подписка на 1 месяц' }
};

// PostgreSQL — используем shared/db-pool (getPool() ниже), он сам грузит CA cert.

// CORS headers — whitelist only production origins
const ALLOW_LOCALHOST_ORIGINS = process.env.ALLOW_LOCALHOST_ORIGINS === '1';
const ALLOWED_ORIGINS = [
  'https://app.heyslab.ru',
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  ...(ALLOW_LOCALHOST_ORIGINS ? [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ] : []),
];

function getCorsHeaders(requestOrigin) {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Id',
    'Content-Type': 'application/json',
    // 🔒 Security headers
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // SEC-005 (2026-06-08): CSP на JSON-ответ — defense-in-depth.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📦 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Current request CORS headers (set per-request in handler)
let _currentCorsHeaders = getCorsHeaders('');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: _currentCorsHeaders,
    body: JSON.stringify(body)
  };
}

function errorResponse(statusCode, message, code = 'ERROR') {
  console.error(`[ERROR] ${code}: ${message}`);
  return jsonResponse(statusCode, { error: message, code });
}

// ЮKassa Basic Auth header
function getYukassaAuthHeader() {
  const shopId = process.env.YUKASSA_SHOP_ID;
  const secretKey = process.env.YUKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    throw new Error('YUKASSA_SHOP_ID or YUKASSA_SECRET_KEY not configured');
  }

  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 💳 CREATE PAYMENT — Создание платежа в ЮKassa
// ═══════════════════════════════════════════════════════════════════════════════

async function createPayment(body, clientId) {
  const { plan, returnUrl } = body;

  // Валидация
  if (!plan || !PLANS[plan]) {
    return errorResponse(400, `Invalid plan. Valid: ${Object.keys(PLANS).join(', ')}`, 'INVALID_PLAN');
  }
  if (!clientId) {
    return errorResponse(400, 'Client ID required', 'NO_CLIENT_ID');
  }
  if (!returnUrl) {
    return errorResponse(400, 'Return URL required', 'NO_RETURN_URL');
  }

  // Whitelist: returnUrl must point to the production HEYS app to prevent open-redirect
  // through YuKassa confirmation flow.
  const ALLOWED_RETURN_HOSTS = new Set(['app.heyslab.ru']);
  try {
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'https:' || !ALLOWED_RETURN_HOSTS.has(parsed.hostname)) {
      return errorResponse(400, 'Return URL not allowed', 'INVALID_RETURN_URL');
    }
  } catch {
    return errorResponse(400, 'Return URL malformed', 'INVALID_RETURN_URL');
  }

  const planInfo = PLANS[plan];
  const idempotenceKey = uuidv4();

  // Текущая версия оферты — должна совпадать с CURRENT_VERSIONS.payment_oferta
  // в apps/web/heys_consents_v1.js (источник истины для legal-документов).
  // Если бампается версия оферты — обновить здесь.
  const PAYMENT_OFERTA_VERSION = '1.2';

  // 1. Создаём запись платежа в БД (pending) через connection pool
  // + получаем телефон клиента для чека 54-ФЗ
  const pool = getPool();
  const client = await pool.connect();
  let paymentId;
  let clientPhone = null;
  let clientEmail = null;

  try {
    // 152-ФЗ ст.9 + ст.437-438 ГК РФ: акцепт оферты должен быть зафиксирован
    // ДО списания. Проверяем активный consent payment_oferta нужной версии.
    // Если нет — отбрасываем без создания payment-записи и без обращения к ЮKassa.
    const consentRes = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM consents
          WHERE client_id = $1
            AND consent_type = 'payment_oferta'
            AND granted = true
            AND is_active = true
            AND document_version = $2
            AND revoked_at IS NULL
       ) AS has_consent`,
      [clientId, PAYMENT_OFERTA_VERSION]
    );

    if (!consentRes.rows[0]?.has_consent) {
      console.warn(`[PAYMENTS] BLOCKED no payment_oferta v${PAYMENT_OFERTA_VERSION} for client=${clientId}`);
      return errorResponse(
        400,
        'Необходимо принять условия публичной оферты',
        'PAYMENT_OFERTA_REQUIRED'
      );
    }

    // Получаем телефон + email клиента для чека 54-ФЗ
    const clientResult = await client.query(`
      SELECT phone, email FROM clients WHERE id = $1
    `, [clientId]);

    if (clientResult.rows.length > 0) {
      clientPhone = clientResult.rows[0].phone;
      clientEmail = clientResult.rows[0].email;
    }

    const insertResult = await client.query(`
      INSERT INTO payments (client_id, amount, plan, status, payment_provider, metadata)
      VALUES ($1, $2, $3, 'pending', 'yukassa', $4)
      RETURNING id
    `, [clientId, planInfo.price, plan, JSON.stringify({
      idempotence_key: idempotenceKey,
      oferta_version_accepted: PAYMENT_OFERTA_VERSION,
    })]);

    paymentId = insertResult.rows[0].id;
    console.log(`[PAYMENTS] Created pending payment: ${paymentId} for client ${clientId}`);

  } catch (dbError) {
    console.error('[PAYMENTS] DB error creating payment:', dbError);
    return errorResponse(500, 'Failed to create payment record', 'DB_ERROR');
  } finally {
    client.release();
  }

  // 2. Вызываем ЮKassa API
  try {
    const yukassaPayload = {
      amount: {
        value: planInfo.price.toFixed(2),
        currency: 'RUB'
      },
      capture: true, // Автоматическое подтверждение платежа
      confirmation: {
        type: 'redirect',
        return_url: returnUrl
      },
      description: planInfo.description,
      // 54-ФЗ: электронный чек (онлайн-касса через ЮKassa).
      // ЮKassa требует phone ИЛИ email в customer. Приоритет email при наличии,
      // дополнительно прикладываем phone — клиент получает чек на оба канала.
      receipt: {
        customer: {
          ...(clientEmail ? { email: clientEmail } : {}),
          ...(clientPhone ? { phone: clientPhone } : {}),
        },
        items: [{
          description: planInfo.description,
          quantity: '1.00',
          amount: {
            value: planInfo.price.toFixed(2),
            currency: 'RUB'
          },
          vat_code: 1, // Без НДС (ИП на УСН)
          payment_mode: 'full_payment',
          payment_subject: 'service'
        }]
      },
      metadata: {
        client_id: clientId,
        plan: plan,
        internal_payment_id: paymentId
      }
    };

    console.log(`[PAYMENTS] Calling YuKassa API for payment ${paymentId}`);

    const response = await fetch(YUKASSA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': getYukassaAuthHeader(),
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(yukassaPayload)
    });

    const yukassaResult = await response.json();

    if (!response.ok) {
      console.error('[PAYMENTS] YuKassa API error:', yukassaResult);

      // Обновляем статус платежа на failed через connection pool
      const updateClient = await pool.connect();
      try {
        await updateClient.query(`
          UPDATE payments SET status = 'failed', 
            metadata = metadata || $2, updated_at = NOW()
          WHERE id = $1
        `, [paymentId, JSON.stringify({ yukassa_error: yukassaResult })]);
      } finally {
        updateClient.release();
      }

      return errorResponse(500, 'YuKassa payment creation failed', 'YUKASSA_ERROR');
    }

    // 3. Обновляем запись платежа с external_payment_id через connection pool
    const updateClient = await pool.connect();
    try {
      await updateClient.query(`
        UPDATE payments 
        SET external_payment_id = $2, 
            external_status = $3,
            metadata = metadata || $4,
            updated_at = NOW()
        WHERE id = $1
      `, [
        paymentId,
        yukassaResult.id,
        yukassaResult.status,
        JSON.stringify({ yukassa_response: yukassaResult })
      ]);
    } finally {
      updateClient.release();
    }

    console.log(`[PAYMENTS] YuKassa payment created: ${yukassaResult.id}, status: ${yukassaResult.status}`);

    // 4. Возвращаем URL для редиректа
    const confirmationUrl = yukassaResult.confirmation?.confirmation_url;

    return jsonResponse(200, {
      success: true,
      paymentId: paymentId,
      externalPaymentId: yukassaResult.id,
      confirmationUrl: confirmationUrl,
      status: yukassaResult.status
    });

  } catch (apiError) {
    console.error('[PAYMENTS] API call error:', apiError);
    return errorResponse(500, 'Failed to call YuKassa API', 'API_ERROR');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔔 WEBHOOK — Обработка уведомлений от ЮKassa
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Проверка HMAC-подписи webhook'а ЮKassa.
 * Опциональная — если YUKASSA_WEBHOOK_SECRET не задан в env, пропускаем
 * (только IP-allowlist). Это позволяет постепенно мигрировать на HMAC после
 * настройки секрета в кабинете ЮKassa.
 *
 * @param {string} rawBody — raw HTTP body запроса
 * @param {object} headers — event.headers
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function verifyWebhookSignature(rawBody, headers) {
  const secret = process.env.YUKASSA_WEBHOOK_SECRET;
  if (!secret) {
    return { ok: true, reason: 'no-secret-configured' };
  }

  const signature =
    headers?.['x-webhook-signature'] ||
    headers?.['X-Webhook-Signature'] ||
    headers?.['authorization']?.replace(/^Bearer\s+/i, '') ||
    headers?.['Authorization']?.replace(/^Bearer\s+/i, '') ||
    null;

  if (!signature || typeof signature !== 'string') {
    return { ok: false, reason: 'no-signature' };
  }

  const computed = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  // Используем timingSafeEqual для защиты от timing-атак
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(computed, 'hex');
  if (sigBuf.length !== expBuf.length) return { ok: false, reason: 'sig-length-mismatch' };
  const valid = crypto.timingSafeEqual(sigBuf, expBuf);
  return valid ? { ok: true } : { ok: false, reason: 'sig-mismatch' };
}

/**
 * Идемпотентная обработка одного события ЮKassa (webhook или poll-результат).
 * Используется и в handleWebhook, и в cron-poll (P0.4).
 *
 * Логика:
 *  1. INSERT в payment_events (с UNIQUE constraint) — если ON CONFLICT, считаем
 *     событие уже обработанным и выходим без UPDATE.
 *  2. Иначе — обновляем payments + (если succeeded) clients в одной транзакции.
 *  3. Расчёт subscription_ends_at: GREATEST(NOW, current_ends) + INTERVAL '1 month',
 *     чтобы продление прибавлялось к остатку текущей подписки.
 *
 * @param {object} client — pg client (внутри pool.connect)
 * @param {object} ctx
 * @param {string} ctx.externalPaymentId — object.id из ЮKassa
 * @param {string} ctx.eventType — 'payment.succeeded' / 'payment.canceled' / ...
 * @param {string} ctx.externalStatus — object.status (succeeded / canceled / pending / waiting_for_capture)
 * @param {object} ctx.rawPayload — полный JSON-объект webhook'а (event + object)
 * @param {string} [ctx.sourceIp] — IP источника для аудита
 * @returns {Promise<{applied: boolean, payment?: object, reason?: string}>}
 */
async function applyPaymentStatus(client, ctx) {
  const { externalPaymentId, eventType, externalStatus, rawPayload, sourceIp } = ctx;

  await client.query('BEGIN');

  try {
    // 1. Находим платёж заранее (нужен payment_id для FK в payment_events)
    const findResult = await client.query(
      `SELECT id, client_id, plan, status FROM payments
       WHERE external_payment_id = $1
       FOR UPDATE`,
      [externalPaymentId]
    );

    const payment = findResult.rows[0] || null;

    // 2. Регистрируем событие; UNIQUE constraint обеспечивает идемпотентность
    const insertResult = await client.query(
      `INSERT INTO payment_events
        (payment_id, external_payment_id, event_type, external_status, raw_payload, source_ip)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ON CONSTRAINT payment_events_unique DO NOTHING
       RETURNING id`,
      [
        payment?.id || null,
        externalPaymentId,
        eventType,
        externalStatus,
        JSON.stringify(rawPayload || {}),
        sourceIp || null,
      ]
    );

    if (insertResult.rows.length === 0) {
      // Событие уже обрабатывалось — выходим, не трогая БД
      await client.query('COMMIT');
      console.log(
        `[PAYMENT_EVENT] duplicate ${eventType}/${externalStatus} for ${externalPaymentId} — skipped`
      );
      return { applied: false, reason: 'duplicate' };
    }

    // 3. Если платежа в нашей БД нет — это «чужой» webhook (тестовый или для
    //    другого мерчанта попавший к нам). Мы его залогировали, но не действуем.
    if (!payment) {
      await client.query('COMMIT');
      console.warn(`[PAYMENT_EVENT] payment not found in DB: ${externalPaymentId}`);
      return { applied: false, reason: 'payment-not-found' };
    }

    // 4. Маппинг внешнего статуса → наш статус
    let internalStatus = payment.status;
    if (externalStatus === 'succeeded') internalStatus = 'completed';
    else if (externalStatus === 'canceled') internalStatus = 'failed';
    else if (externalStatus === 'waiting_for_capture') internalStatus = 'waiting_capture';
    // pending — оставляем текущий

    // refund.succeeded — отдельный статус
    if (eventType === 'refund.succeeded') internalStatus = 'refunded';

    // 5. UPDATE payments
    await client.query(
      `UPDATE payments
       SET external_status = $2,
           status = $3,
           metadata = metadata || $4::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        payment.id,
        externalStatus,
        internalStatus,
        JSON.stringify({
          last_event: eventType,
          last_event_at: new Date().toISOString(),
        }),
      ]
    );

    // 6. Применяем эффекты к подписке клиента
    if (eventType === 'payment.succeeded' && externalStatus === 'succeeded') {
      // Продление: GREATEST(NOW(), current_ends_at) + INTERVAL '1 month'.
      // Это корректно работает и для первой покупки (current=NULL → берём NOW),
      // и для досрочного продления (берём конец текущей подписки).
      const updRes = await client.query(
        `UPDATE clients
         SET subscription_status = 'active',
             subscription_plan = $2,
             subscription_starts_at = COALESCE(subscription_starts_at, NOW()),
             subscription_ends_at =
               GREATEST(NOW(), COALESCE(subscription_ends_at, NOW())) + INTERVAL '1 month',
             updated_at = NOW()
         WHERE id = $1
         RETURNING subscription_ends_at`,
        [payment.client_id, payment.plan]
      );

      const newEndsAt = updRes.rows?.[0]?.subscription_ends_at;

      // 7. period_start / period_end в payment-записи (для отчётности)
      await client.query(
        `UPDATE payments
         SET period_start = COALESCE(period_start, NOW()),
             period_end = $2
         WHERE id = $1`,
        [payment.id, newEndsAt]
      );

      console.log(
        `[PAYMENT_EVENT] activated subscription ${payment.plan} for client ${payment.client_id} until ${newEndsAt?.toISOString?.() || newEndsAt}`
      );
    } else if (eventType === 'refund.succeeded') {
      // Возврат: переводим клиента в read_only немедленно, обнуляем ends_at.
      await client.query(
        `UPDATE clients
         SET subscription_status = 'read_only',
             subscription_ends_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [payment.client_id]
      );
      console.log(
        `[PAYMENT_EVENT] refund applied: client ${payment.client_id} → read_only`
      );
    }
    // payment.canceled / payment.waiting_for_capture не трогают clients —
    // подписка не активируется, но и не отзывается.

    await client.query('COMMIT');
    return { applied: true, payment };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Проверка internal-cron-token. Используется для poll-фолбэка (P0.4),
 * когда наш внутренний скрипт получает свежий статус из ЮKassa и хочет
 * передать его в общий webhook-pipeline без IP-allowlist и HMAC.
 *
 * Токен хранится в env INTERNAL_CRON_TOKEN. Если задан — заголовок
 * X-Internal-Cron-Token должен совпадать. Это альтернатива IP/HMAC проверкам.
 */
function isInternalCronCall(headers) {
  const expected = process.env.INTERNAL_CRON_TOKEN;
  if (!expected) return false;
  const provided =
    headers?.['x-internal-cron-token'] ||
    headers?.['X-Internal-Cron-Token'] ||
    null;
  if (!provided || typeof provided !== 'string') return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function handleWebhook(body, event) {
  const headers = event?.headers || {};
  const internalCron = isInternalCronCall(headers);

  const clientIp =
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
    event?.requestContext?.identity?.sourceIp ||
    '';

  if (!internalCron) {
    // 🔐 Verify request originates from YuKassa IPs
    if (!isYukassaIp(clientIp)) {
      console.warn(`[WEBHOOK] Rejected request from non-YuKassa IP: ${clientIp}`);
      return jsonResponse(403, { error: 'Forbidden' });
    }

    // 🔐 HMAC-проверка подписи (если YUKASSA_WEBHOOK_SECRET настроен)
    const rawBody = typeof event?.body === 'string'
      ? event.body
      : JSON.stringify(body || {});
    const sigCheck = verifyWebhookSignature(rawBody, headers);
    if (!sigCheck.ok) {
      console.warn(`[WEBHOOK] HMAC signature check failed: ${sigCheck.reason}`);
      return jsonResponse(403, { error: 'Invalid signature', reason: sigCheck.reason });
    }
    if (sigCheck.reason === 'no-secret-configured') {
      console.warn('[WEBHOOK] YUKASSA_WEBHOOK_SECRET not set — relying on IP allowlist only');
    }
  } else {
    console.log('[WEBHOOK] Internal cron call accepted (IP/HMAC checks skipped)');
  }

  // sourceIp для аудита — для cron берём фиксированный маркер
  const sourceIp = internalCron ? 'internal-cron' : clientIp;

  const { event: webhookEvent, object } = body || {};

  if (!webhookEvent || !object) {
    return errorResponse(400, 'Invalid webhook payload', 'INVALID_WEBHOOK');
  }

  console.log(`[WEBHOOK] Received: ${webhookEvent}, payment_id: ${object.id}, status: ${object.status}`);

  const pool = getPool();
  const client = await pool.connect();

  try {
    const result = await applyPaymentStatus(client, {
      externalPaymentId: object.id,
      eventType: webhookEvent,
      externalStatus: object.status,
      rawPayload: body,
      sourceIp: sourceIp,
    });

    return jsonResponse(200, {
      received: true,
      applied: result.applied,
      reason: result.reason,
      paymentId: result.payment?.id,
    });
  } catch (error) {
    console.error('[WEBHOOK] Processing error:', error);
    return errorResponse(500, 'Webhook processing failed', 'WEBHOOK_ERROR');
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 💰 REFUND — Возврат денег куратором (P0.5)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Инициирует refund в ЮKassa. Доступно только куратору, владеющему клиентом.
 * Сам платёж переводится в 'refunded' уже через webhook refund.succeeded
 * (обрабатывается в applyPaymentStatus, P0.3).
 *
 * @param {object} body — { paymentId, amount? } (amount опционально, по умолчанию полный)
 * @param {string} curatorId — UUID куратора из проверенного JWT
 */
async function refundPayment(body, curatorId) {
  const { paymentId, amount: customAmount } = body || {};
  if (!paymentId) {
    return errorResponse(400, 'paymentId required', 'NO_PAYMENT_ID');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    // 1. Достаём платёж + проверяем, что клиент принадлежит куратору
    const findResult = await client.query(
      `SELECT p.id, p.client_id, p.external_payment_id, p.amount, p.status,
              c.curator_id, c.name AS client_name
       FROM payments p
       JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1`,
      [paymentId]
    );

    if (findResult.rows.length === 0) {
      return errorResponse(404, 'Payment not found', 'NOT_FOUND');
    }
    const payment = findResult.rows[0];

    if (String(payment.curator_id) !== String(curatorId)) {
      console.warn(
        `[REFUND] curator ${curatorId} tried to refund foreign payment ${paymentId}`
      );
      return errorResponse(403, 'Forbidden — not your client', 'FORBIDDEN');
    }

    if (payment.status !== 'completed') {
      return errorResponse(
        400,
        `Cannot refund payment in status '${payment.status}' — only 'completed' allowed`,
        'INVALID_STATUS'
      );
    }

    if (!payment.external_payment_id) {
      return errorResponse(400, 'Payment has no external_payment_id', 'NO_EXTERNAL_ID');
    }

    const refundAmount = customAmount ? Number(customAmount) : Number(payment.amount);
    if (!(refundAmount > 0) || refundAmount > Number(payment.amount)) {
      return errorResponse(400, 'Invalid refund amount', 'INVALID_AMOUNT');
    }

    // 2. Вызываем ЮKassa POST /v3/refunds
    const idempotenceKey = uuidv4();
    const yukassaResp = await fetch('https://api.yookassa.ru/v3/refunds', {
      method: 'POST',
      headers: {
        Authorization: getYukassaAuthHeader(),
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment_id: payment.external_payment_id,
        amount: { value: refundAmount.toFixed(2), currency: 'RUB' },
        description: `Refund initiated by curator for client "${payment.client_name}"`,
      }),
    });

    const yukassaResult = await yukassaResp.json();

    if (!yukassaResp.ok) {
      console.error('[REFUND] YuKassa error:', yukassaResult);
      return errorResponse(
        502,
        `YuKassa refund failed: ${yukassaResult?.description || 'unknown'}`,
        'YUKASSA_ERROR'
      );
    }

    console.log(
      `[REFUND] Refund created: ${yukassaResult.id} for payment ${payment.id}, amount ${refundAmount}`
    );

    // 3. Метим в нашей БД, что refund initiated. Финальный переход в 'refunded'
    //    произойдёт через webhook refund.succeeded.
    await client.query(
      `UPDATE payments
       SET metadata = metadata || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        payment.id,
        JSON.stringify({
          refund_initiated_at: new Date().toISOString(),
          refund_initiated_by: curatorId,
          refund_external_id: yukassaResult.id,
          refund_status: yukassaResult.status,
        }),
      ]
    );

    return jsonResponse(200, {
      success: true,
      refundId: yukassaResult.id,
      status: yukassaResult.status,
      amount: refundAmount,
    });
  } catch (error) {
    console.error('[REFUND] error:', error);
    return errorResponse(500, 'Refund failed', 'INTERNAL_ERROR');
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📊 GET STATUS — Проверка статуса платежа
// ═══════════════════════════════════════════════════════════════════════════════

async function getPaymentStatus(paymentId, clientId) {
  if (!paymentId) {
    return errorResponse(400, 'Payment ID required', 'NO_PAYMENT_ID');
  }

  const pool = getPool();
  const client = await pool.connect();

  try {

    const result = await client.query(`
      SELECT id, client_id, amount, plan, status, external_status, 
             payment_provider, created_at, period_start, period_end
      FROM payments 
      WHERE id = $1 ${clientId ? 'AND client_id = $2' : ''}
    `, clientId ? [paymentId, clientId] : [paymentId]);

    if (result.rows.length === 0) {
      return errorResponse(404, 'Payment not found', 'NOT_FOUND');
    }

    const payment = result.rows[0];

    return jsonResponse(200, {
      id: payment.id,
      status: payment.status,
      externalStatus: payment.external_status,
      plan: payment.plan,
      amount: payment.amount,
      createdAt: payment.created_at,
      periodStart: payment.period_start,
      periodEnd: payment.period_end
    });

  } catch (error) {
    console.error('[STATUS] Query error:', error);
    return errorResponse(500, 'Failed to get payment status', 'DB_ERROR');
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 AUTH — проверка клиентской сессии для /create и /status
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Проверяет Bearer-токен клиентской сессии. Если в запросе явно указан clientId
 * (header X-Client-Id или body.clientId) — он должен совпадать с client_id из
 * сессии, иначе 403 (защита от попыток оплатить чужую подписку).
 *
 * @returns {{clientId: string} | {error: object}}
 */
/**
 * Проверяет JWT-токен куратора (тот же формат, что выдаёт heys-api-auth/login).
 * Возвращает curator_id или error-response.
 *
 * @returns {{curatorId: string} | {error: object}}
 */
function authenticateCuratorRequest(event) {
  const token = extractBearerToken(event);
  if (!token) {
    return { error: errorResponse(401, 'Authentication required', 'NO_AUTH') };
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    console.error('[PAYMENTS] JWT_SECRET missing or too short');
    return { error: errorResponse(500, 'Server misconfigured', 'JWT_SECRET_MISSING') };
  }

  const result = verifyCuratorJwt(token, jwtSecret);
  if (!result.valid) {
    console.warn(`[PAYMENTS] Invalid curator JWT: ${result.error}`);
    return { error: errorResponse(401, 'Invalid or expired token', 'INVALID_JWT') };
  }

  // payload должен содержать curator_id (sub) или user_id — берём первое подходящее
  const curatorId =
    result.payload?.curator_id ||
    result.payload?.sub ||
    result.payload?.user_id ||
    result.payload?.id;
  if (!curatorId) {
    console.warn('[PAYMENTS] JWT payload has no curator_id');
    return { error: errorResponse(401, 'Token missing curator_id', 'INVALID_JWT_PAYLOAD') };
  }

  return { curatorId };
}

async function authenticateClientRequest(event, requestedClientId) {
  const token = extractBearerToken(event);
  if (!token) {
    console.warn('[PAYMENTS] Missing bearer token');
    return { error: errorResponse(401, 'Authentication required', 'NO_AUTH') };
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const session = await verifyClientSession(client, token);
    if (!session) {
      console.warn('[PAYMENTS] Invalid or expired session');
      return { error: errorResponse(401, 'Invalid or expired session', 'INVALID_SESSION') };
    }

    if (requestedClientId && String(requestedClientId) !== String(session.client_id)) {
      console.warn(
        `[PAYMENTS] clientId mismatch: requested=${requestedClientId} session=${session.client_id}`
      );
      return { error: errorResponse(403, 'Client ID mismatch', 'CLIENT_ID_MISMATCH') };
    }

    return { clientId: session.client_id };
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🚀 MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

module.exports.handler = async function (event, context) {
  await initSecrets();
  // Set CORS headers based on request origin
  const requestOrigin = event.headers?.['origin'] || event.headers?.['Origin'] || '';
  _currentCorsHeaders = getCorsHeaders(requestOrigin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: _currentCorsHeaders, body: '' };
  }

  const method = event.httpMethod;
  const path = event.path || event.url || '';

  // 🛡️ SEC-018 (2026-06-08): Body size limit — защита от DoS/OOM.
  // 64 KB: payment-init payload'ы + ЮKassa webhook'и реально <10KB.
  // Аналог heys-api-rpc/index.js:1517-1518 (256 KB). Payments может быть меньше.
  const MAX_BODY_BYTES = 64 * 1024;
  if (event.body && typeof event.body === 'string' && Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES) {
    return { statusCode: 413, headers: _currentCorsHeaders, body: JSON.stringify({ error: 'Payload too large' }) };
  }

  // Parse body
  let body = {};
  if (event.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
      console.warn('[PAYMENTS] Failed to parse body:', e.message);
    }
  }

  // Parse query params
  const params = event.queryStringParameters || {};

  // Client ID указанный явно (для логирования). Доверять ему НЕЛЬЗЯ —
  // окончательный clientId будет получен из проверенной сессии ниже.
  const requestedClientId = event.headers?.['x-client-id'] ||
    event.headers?.['X-Client-Id'] ||
    body.clientId ||
    params.clientId;

  console.log(`[PAYMENTS] ${method} ${path} | requestedClientId: ${requestedClientId || 'none'}`);

  try {
    // Route: POST /payments/create — требует Bearer-токен сессии клиента
    if (method === 'POST' && path.includes('/create')) {
      const auth = await authenticateClientRequest(event, requestedClientId);
      if (auth.error) return auth.error;
      return await createPayment(body, auth.clientId);
    }

    // Route: POST /payments/webhook — без сессионной auth (HMAC + IP в P0.2)
    if (method === 'POST' && path.includes('/webhook')) {
      return await handleWebhook(body, event);
    }

    // Route: POST /payments/refund — куратор инициирует возврат денег (P0.5)
    if (method === 'POST' && path.includes('/refund')) {
      const auth = authenticateCuratorRequest(event);
      if (auth.error) return auth.error;
      return await refundPayment(body, auth.curatorId);
    }

    // Route: GET /payments/status — требует Bearer-токен сессии клиента
    if (method === 'GET' && path.includes('/status')) {
      const auth = await authenticateClientRequest(event, requestedClientId);
      if (auth.error) return auth.error;
      const paymentId = params.paymentId || params.id;
      return await getPaymentStatus(paymentId, auth.clientId);
    }

    // Health check
    if (method === 'GET' && (path === '/payments' || path === '/payments/')) {
      return jsonResponse(200, {
        service: 'heys-api-payments',
        status: 'ok',
        version: '1.0.0',
        endpoints: ['/payments/create', '/payments/webhook', '/payments/status']
      });
    }

    return errorResponse(404, 'Endpoint not found', 'NOT_FOUND');

  } catch (error) {
    console.error('[PAYMENTS] Unhandled error:', error);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
};

// Экспортируем applyPaymentStatus для переиспользования в cron-poll (P0.4)
module.exports.applyPaymentStatus = applyPaymentStatus;
module.exports.PLANS = PLANS;
