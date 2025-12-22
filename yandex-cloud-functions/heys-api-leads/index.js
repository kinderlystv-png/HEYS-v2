/**
 * HEYS Leads API — Yandex Cloud Function
 * Сохранение лидов с landing page + Telegram уведомления
 */

const { Client } = require('pg');
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

const ALLOWED_ORIGINS = [
  'https://heyslab.ru',
  'https://www.heyslab.ru',
  'https://heys-static.website.yandexcloud.net',
  'http://localhost:3003',
];

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

  const messengerLink = lead.messenger === 'telegram' 
    ? `tg://resolve?phone=${lead.phone}`
    : lead.messenger === 'whatsapp'
    ? `https://wa.me/${lead.phone}`
    : null;

  const text = `🆕 *Новая заявка на триал!*

👤 *Имя:* ${lead.name}
📞 *Телефон:* +${lead.phone}
${messengerLabels[lead.messenger] || lead.messenger}

${lead.utm_source ? `📊 UTM: ${lead.utm_source}` : ''}
${lead.referrer ? `🔗 Referrer: ${lead.referrer}` : ''}`;

  const keyboard = {
    inline_keyboard: [
      messengerLink ? [{ text: `Написать в ${lead.messenger}`, url: messengerLink }] : [],
      [{ text: '✅ Взял в работу', callback_data: `lead_taken_${lead.id || Date.now()}` }]
    ].filter(row => row.length > 0)
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
      landing_page
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

    // Сохраняем в PostgreSQL
    const client = new Client(PG_CONFIG);
    await client.connect();

    try {
      // Создаём таблицу если нет
      await client.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          phone VARCHAR(20) NOT NULL,
          messenger VARCHAR(20) NOT NULL,
          utm_source VARCHAR(255),
          utm_medium VARCHAR(255),
          utm_campaign VARCHAR(255),
          utm_term VARCHAR(255),
          utm_content VARCHAR(255),
          referrer TEXT,
          landing_page VARCHAR(255),
          status VARCHAR(20) DEFAULT 'new',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Вставляем лид
      const result = await client.query(`
        INSERT INTO leads (name, phone, messenger, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [name, phone, messenger, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_page]);

      const leadId = result.rows[0].id;

      // Отправляем уведомление в Telegram
      await sendTelegramNotification({
        id: leadId,
        name,
        phone,
        messenger,
        utm_source,
        referrer
      });

      console.log('[Leads] New lead saved:', leadId);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          success: true,
          id: leadId
        })
      };

    } finally {
      await client.end();
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
