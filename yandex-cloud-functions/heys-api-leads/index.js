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

const ALLOWED_ORIGINS = [
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://app.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'http://localhost:3003',
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
    'Content-Type': 'application/json'
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
      messenger,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      referrer,
      landing_page,
      intent,
      plan
    } = body;

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

    // Нормализуем телефон к формату +7XXXXXXXXXX
    const normalizedPhone = normalizePhone(phone);

    // Сохраняем в PostgreSQL через connection pool
    const pool = getPool();
    const client = await pool.connect();

    try {
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
        // Дубликат найден — возвращаем существующий ID
        leadId = duplicateCheck.rows[0].id;
        isDuplicate = true;
        console.log('[Leads] Duplicate detected:', leadId, 'within', DEDUPLICATION_WINDOW_MINUTES, 'minutes');
      } else {
        // 2. Вставляем новый лид
        const result = await client.query(`
          INSERT INTO leads (name, phone, messenger, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [name, normalizedPhone, messenger, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page]);

        leadId = result.rows[0].id;
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
