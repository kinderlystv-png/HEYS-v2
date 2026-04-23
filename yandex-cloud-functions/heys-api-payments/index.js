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

const { getPool } = require('../shared/db-pool');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// 🔧 КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════════

const YUKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';

// ЮKassa notification IP ranges (https://yookassa.ru/developers/using-api/webhooks)
// All webhook POSTs must originate from these CIDRs.
const YUKASSA_IP_CIDRS = [
  { base: [185, 71, 76, 0], prefix: 27 },
  { base: [185, 71, 77, 0], prefix: 27 },
  { base: [77, 75, 153, 0], prefix: 25 },
  { base: [77, 75, 154, 128], prefix: 25 },
  { base: [2a02, 0, 0, 0], prefix: -1 }, // placeholder, handled separately
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

// Тарифные планы (цены в копейках для точности, в рублях для API)
const PLANS = {
  base: { price: 1990, name: 'Base', description: 'HEYS Base подписка на 1 месяц' },
  pro: { price: 12990, name: 'Pro', description: 'HEYS Pro подписка на 1 месяц' },
  proplus: { price: 19990, name: 'Pro+', description: 'HEYS Pro+ подписка на 1 месяц' }
};

// PostgreSQL config — читаем из env
const PG_CONFIG = {
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '6432'),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.existsSync(path.join(__dirname, 'certs', 'root.crt'))
      ? fs.readFileSync(path.join(__dirname, 'certs', 'root.crt'), 'utf8')
      : undefined
  },
  connectionTimeoutMillis: 5000
};

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
    'Referrer-Policy': 'strict-origin-when-cross-origin'
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

  // 1. Создаём запись платежа в БД (pending) через connection pool
  // + получаем телефон клиента для чека 54-ФЗ
  const pool = getPool();
  const client = await pool.connect();
  let paymentId;
  let clientPhone = null;

  try {
    // Получаем телефон клиента для чека 54-ФЗ
    const clientResult = await client.query(`
      SELECT phone FROM clients WHERE id = $1
    `, [clientId]);

    if (clientResult.rows.length > 0) {
      clientPhone = clientResult.rows[0].phone;
    }

    const insertResult = await client.query(`
      INSERT INTO payments (client_id, amount, plan, status, payment_provider, metadata)
      VALUES ($1, $2, $3, 'pending', 'yukassa', $4)
      RETURNING id
    `, [clientId, planInfo.price, plan, JSON.stringify({ idempotence_key: idempotenceKey })]);

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
      // 54-ФЗ: электронный чек (онлайн-касса через ЮKassa)
      receipt: {
        customer: clientPhone ? { phone: clientPhone } : {},
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

async function handleWebhook(body, event) {
  // 🔐 Verify request originates from YuKassa IPs
  const rawIp =
    event?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    event?.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
    event?.requestContext?.identity?.sourceIp ||
    '';

  if (!isYukassaIp(rawIp)) {
    console.warn(`[WEBHOOK] Rejected request from non-YuKassa IP: ${rawIp}`);
    return jsonResponse(403, { error: 'Forbidden' });
  }

  const { event: webhookEvent, object } = body;

  if (!webhookEvent || !object) {
    return errorResponse(400, 'Invalid webhook payload', 'INVALID_WEBHOOK');
  }

  console.log(`[WEBHOOK] Received: ${webhookEvent}, payment_id: ${object.id}`);

  const externalPaymentId = object.id;
  const newStatus = object.status;
  const metadata = object.metadata || {};

  const pool = getPool();
  const client = await pool.connect();

  try {

    // 1. Находим платёж по external_payment_id
    const findResult = await client.query(`
      SELECT id, client_id, plan, status FROM payments 
      WHERE external_payment_id = $1
    `, [externalPaymentId]);

    if (findResult.rows.length === 0) {
      console.warn(`[WEBHOOK] Payment not found: ${externalPaymentId}`);
      // Не ошибка — может быть дубликат или тестовый платёж
      return jsonResponse(200, { received: true, warning: 'Payment not found' });
    }

    const payment = findResult.rows[0];
    console.log(`[WEBHOOK] Found payment: ${payment.id}, current status: ${payment.status}`);

    // 2. Обновляем статус платежа
    let internalStatus = 'pending';
    if (newStatus === 'succeeded') {
      internalStatus = 'completed';
    } else if (newStatus === 'canceled') {
      internalStatus = 'failed';
    }

    await client.query(`
      UPDATE payments 
      SET external_status = $2, 
          status = $3,
          metadata = metadata || $4,
          updated_at = NOW()
      WHERE id = $1
    `, [
      payment.id,
      newStatus,
      internalStatus,
      JSON.stringify({ webhook_event: webhookEvent, webhook_received_at: new Date().toISOString() })
    ]);

    // 3. Если платёж успешен — активируем подписку
    if (newStatus === 'succeeded') {
      console.log(`[WEBHOOK] Payment succeeded! Activating subscription for client ${payment.client_id}`);

      // Вызываем существующую SQL функцию activate_subscription
      // Но она создаёт новый платёж — нам нужно просто обновить клиента
      // Используем прямое обновление:
      const now = new Date();
      const subscriptionEnd = new Date(now);
      subscriptionEnd.setMonth(subscriptionEnd.getMonth() + 1);

      await client.query(`
        UPDATE clients 
        SET subscription_status = 'active',
            subscription_plan = $2,
            subscription_starts_at = NOW(),
            subscription_ends_at = $3,
            updated_at = NOW()
        WHERE id = $1
      `, [payment.client_id, payment.plan, subscriptionEnd.toISOString()]);

      // Обновляем period в платеже
      await client.query(`
        UPDATE payments 
        SET period_start = NOW(), 
            period_end = $2
        WHERE id = $1
      `, [payment.id, subscriptionEnd.toISOString()]);

      console.log(`[WEBHOOK] Subscription activated until ${subscriptionEnd.toISOString()}`);
    }

    return jsonResponse(200, {
      received: true,
      paymentId: payment.id,
      status: internalStatus
    });

  } catch (error) {
    console.error('[WEBHOOK] Processing error:', error);
    return errorResponse(500, 'Webhook processing failed', 'WEBHOOK_ERROR');
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
// 🚀 MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

module.exports.handler = async function (event, context) {
  // Set CORS headers based on request origin
  const requestOrigin = event.headers?.['origin'] || event.headers?.['Origin'] || '';
  _currentCorsHeaders = getCorsHeaders(requestOrigin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: _currentCorsHeaders, body: '' };
  }

  const method = event.httpMethod;
  const path = event.path || event.url || '';

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

  // Get client ID from header or body
  const clientId = event.headers?.['x-client-id'] ||
    event.headers?.['X-Client-Id'] ||
    body.clientId ||
    params.clientId;

  console.log(`[PAYMENTS] ${method} ${path} | clientId: ${clientId || 'none'}`);

  try {
    // Route: POST /payments/create
    if (method === 'POST' && path.includes('/create')) {
      return await createPayment(body, clientId);
    }

    // Route: POST /payments/webhook
    if (method === 'POST' && path.includes('/webhook')) {
      return await handleWebhook(body, event);
    }

    // Route: GET /payments/status
    if (method === 'GET' && path.includes('/status')) {
      const paymentId = params.paymentId || params.id;
      return await getPaymentStatus(paymentId, clientId);
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
