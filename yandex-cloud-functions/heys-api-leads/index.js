/**
 * HEYS Leads API — Yandex Cloud Function
 * Сохранение лидов с landing page + Telegram уведомления
 */

const { getPool } = require('./shared/db-pool');
const fs = require('fs');
const path = require('path');

// Загрузка CA сертификата Yandex Cloud
const CA_CERT_PATH = path.join(__dirname, 'certs', 'root.crt');
const CA_CERT = fs.existsSync(CA_CERT_PATH) ? fs.readFileSync(CA_CERT_PATH, 'utf8') : null;

// Конфигурация PostgreSQL
const PG_CONFIG = {
  host: process.env.PG_HOST || 'rc1b-obkgs83tnrd6a2m3.mdb.yandexcloud.net',
  port: parseInt(process.env.PG_PORT || '6432'),
  database: process.env.PG_DATABASE || 'heys_production',
  user: process.env.PG_USER || 'heys_admin',
  password: process.env.PG_PASSWORD,
  ssl: CA_CERT ? {
    rejectUnauthorized: true,
    ca: CA_CERT
  } : {
    rejectUnauthorized: false
  }
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Окно дедупликации (30 минут)
const DEDUPLICATION_WINDOW_MINUTES = 30;

// Rate-limit: максимум N submit'ов с одного IP за W минут (P0.13)
const RATE_LIMIT_MAX_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MINUTES = 15;

const ALLOWED_ORIGINS = [
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'http://localhost:3003',
  'http://127.0.0.1:3003',
];

/**
 * Нормализует телефон к формату +7XXXXXXXXXX
 * @param {string} phone - сырой телефон (может быть с пробелами, дефисами, скобками)
 * @returns {string} - нормализованный телефон +7XXXXXXXXXX
 */
function normalizePhone(phone) {
  // Убираем всё кроме цифр и +
  let digits = phone.replace(/[^\d+]/g, '');

  // Убираем + в начале если есть
  digits = digits.replace(/^\+/, '');

  // Если начинается с 8 — заменяем на 7
  if (digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  }

  // Если не начинается с 7 — добавляем 7 в начало (для РФ)
  if (!digits.startsWith('7')) {
    digits = '7' + digits;
  }

  // Возвращаем в формате +7XXXXXXXXXX
  return '+' + digits;
}

function getCorsHeaders(origin) {
  const isAllowed = ALLOWED_ORIGINS.some(allowed => origin?.startsWith(allowed));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    // 🔒 Security headers
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

async function sendTelegramNotification(lead) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Not configured, skipping notification');
    return;
  }

  const messengerLabels = {
    telegram: '📱 Telegram',
    whatsapp: '💬 WhatsApp',
    max: '🟣 MAX'
  };

  // ⚠️ МИНИМИЗАЦИЯ ПДн: Telegram сервера за рубежом (ст.12 152-ФЗ)
  // Отправляем ТОЛЬКО lead_id для идентификации, без ПДн
  // Куратор смотрит полные данные в PostgreSQL (Yandex.Cloud РФ)
  let text = `🆕 *Новая заявка #${lead.id || 'N/A'}*

📋 Мессенджер: ${messengerLabels[lead.messenger] || lead.messenger}
${lead.utm_source ? `📊 UTM: ${lead.utm_source}` : ''}

👉 Полные данные в базе (PostgreSQL РФ)`;

  if (lead.intent === 'direct_purchase') {
    text = `🚨 *ПРЯМАЯ ПОКУПКА - ${lead.plan || 'Неизвестный тариф'}*\n\n` + text;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: '✅ Взял в работу', callback_data: `lead_taken_${lead.id || Date.now()}` }]
    ]
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      })
    });

    const result = await response.json();
    console.log('[Telegram] Notification sent:', result.ok);
  } catch (error) {
    console.error('[Telegram Error]', error.message);
  }
}

module.exports.handler = async function (event, context) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  // Только POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Парсим тело запроса
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

    const {
      name,
      phone,
      email,
      messenger,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      referrer,
      landing_page,
      intent,
      plan,
      website, // 🍯 honeypot (P0.13) — должно быть пустым
      consent, // 152-ФЗ ст. 9: согласие на обработку ПДн
    } = body;

    // 🍯 Honeypot (P0.13): боты обычно заполняют все поля. Если website непустой —
    // это автомат. Возвращаем 200 чтобы не палить детект, но в БД ничего не пишем.
    if (website && String(website).trim().length > 0) {
      console.log('[Leads] BOT_BLOCKED honeypot filled:', String(website).slice(0, 100));
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, status: 'received' }),
      };
    }

    // Валидация
    if (!name || !phone || !messenger) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: name, phone, messenger'
        })
      };
    }

    // Email опционален, но если задан — должен быть валидным
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invalid email format' }),
      };
    }

    // 152-ФЗ ст. 9: оператор обязан подтвердить факт получения согласия.
    // UI уже валидирует checkbox; сервер дополнительно отбрасывает запросы
    // без consent-поля (защита от подмены клиента и backwards-compat для
    // старых сборок landing, которые могут отправлять заявку без поля).
    if (
      !consent ||
      typeof consent !== 'object' ||
      !consent.privacy_version ||
      !consent.method
    ) {
      console.warn('[Leads] REJECTED missing consent payload');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Consent required',
          message: 'Необходимо принять политику конфиденциальности',
        }),
      };
    }

    const consentAcceptedAt = consent.accepted_at
      ? new Date(consent.accepted_at)
      : new Date();
    const consentUserAgent = consent.user_agent
      ? String(consent.user_agent).slice(0, 500)
      : event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
    const consentPrivacyVersion = String(consent.privacy_version).slice(0, 32);
    const consentMethod = String(consent.method).slice(0, 32);

    // IP клиента для rate-limit
    const clientIp =
      event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
      event.requestContext?.identity?.sourceIp ||
      'unknown';

    // Нормализуем телефон к формату +7XXXXXXXXXX
    const normalizedPhone = normalizePhone(phone);

    // Сохраняем в PostgreSQL через connection pool
    const pool = getPool();
    const client = await pool.connect();

    try {
      // 🛑 Rate-limit (P0.13): максимум RATE_LIMIT_MAX_PER_WINDOW submit'ов
      // с одного IP за RATE_LIMIT_WINDOW_MINUTES минут.
      const rateRes = await client.query(
        `SELECT COUNT(*)::int AS cnt
         FROM lead_submission_attempts
         WHERE ip_address = $1
           AND attempted_at > NOW() - ($2 || ' minutes')::INTERVAL`,
        [clientIp, RATE_LIMIT_WINDOW_MINUTES]
      );
      const recentAttempts = rateRes.rows?.[0]?.cnt || 0;
      if (recentAttempts >= RATE_LIMIT_MAX_PER_WINDOW) {
        console.warn(`[Leads] RATE_LIMITED ip=${clientIp} attempts=${recentAttempts}`);
        return {
          statusCode: 429,
          headers: { ...corsHeaders, 'Retry-After': String(RATE_LIMIT_WINDOW_MINUTES * 60) },
          body: JSON.stringify({
            success: false,
            error: 'Too many requests',
            retry_after_seconds: RATE_LIMIT_WINDOW_MINUTES * 60,
          }),
        };
      }

      // Логируем попытку (даже если потом откажемся вставлять — для статистики)
      await client.query(
        `INSERT INTO lead_submission_attempts (ip_address, honeypot_filled)
         VALUES ($1, false)`,
        [clientIp]
      );

      // Таблица leads создаётся миграциями (database/yandex_migration/001_schema.sql)
      // с правильным типом id UUID DEFAULT gen_random_uuid()

      // 1. Проверяем дубликаты за последние N минут
      const duplicateCheck = await client.query(`
        SELECT id, created_at
        FROM leads
        WHERE phone = $1
          AND created_at > NOW() - INTERVAL '${DEDUPLICATION_WINDOW_MINUTES} minutes'
        ORDER BY created_at DESC
        LIMIT 1
      `, [normalizedPhone]);

      let leadId;
      let isDuplicate = false;

      if (duplicateCheck.rows.length > 0) {
        // Дубликат в скользящем окне — возвращаем существующий ID
        leadId = duplicateCheck.rows[0].id;
        isDuplicate = true;
        console.log('[Leads] Duplicate (window) detected:', leadId, 'within', DEDUPLICATION_WINDOW_MINUTES, 'minutes');
      } else {
        // 2. Вставляем новый лид. Partial UNIQUE-индекс leads_active_phone_idx
        // (миграция 2026-04-28_leads_dedup) может бросить 23505 если phone уже
        // имеет активный лид (status IN 'new'/'contacted'/'trial_started').
        try {
          const result = await client.query(`
            INSERT INTO leads (
              name, phone, email, messenger,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              referrer, landing_page, ip_address,
              consent_privacy_version, consent_accepted_at, consent_method, consent_user_agent
            )
            VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8, $9,
              $10, $11, $12,
              $13, $14, $15, $16
            )
            RETURNING id
          `, [
            name, normalizedPhone, email || null, messenger,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            referrer, landing_page, clientIp,
            consentPrivacyVersion, consentAcceptedAt, consentMethod, consentUserAgent,
          ]);

          leadId = result.rows[0].id;
        } catch (insErr) {
          if (insErr?.code === '23505') {
            // unique_violation — есть активный лид с этим телефоном
            const existing = await client.query(
              `SELECT id FROM leads
               WHERE phone = $1
                 AND status IN ('new', 'contacted', 'trial_started')
               ORDER BY created_at DESC
               LIMIT 1`,
              [normalizedPhone]
            );
            leadId = existing.rows?.[0]?.id || null;
            isDuplicate = true;
            console.log('[Leads] Duplicate (active) detected via unique_violation:', leadId);
          } else {
            throw insErr;
          }
        }
      }

      // 3. Отправляем уведомление в Telegram только для новых лидов
      if (!isDuplicate) {
        await sendTelegramNotification({
          id: leadId,
          name,
          phone: normalizedPhone,
          messenger,
          utm_source,
          referrer,
          intent,
          plan
        });

        console.log('[Leads] New lead saved:', leadId);
      } else {
        console.log('[Leads] Duplicate lead ignored:', leadId);
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          id: leadId,
          duplicate: isDuplicate
        })
      };

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('[Leads Error]', error.message);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: 'Failed to save lead',
        message: error.message
      })
    };
  }
};
