/**
 * HEYS Leads API — Yandex Cloud Function
 * Сохранение лидов с landing page + Telegram уведомления
 */

const { getPool } = require('./shared/db-pool');
const { initSecrets } = require('./shared/secrets');

// PostgreSQL: используем shared/db-pool (он сам грузит CA cert и собирает config).
// Telegram-токены: initSecrets() кладёт их в process.env при cold start, читаем
// напрямую в sendTelegramNotification ниже.

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
 * Нормализует поддержанный российский телефон к формату +7XXXXXXXXXX.
 * @param {string} phone - сырой телефон (может быть с пробелами, дефисами, скобками)
 * @returns {string|null} - нормализованный телефон или null для invalid input
 */
function normalizePhone(phone) {
  const raw = String(phone ?? '').trim();
  if (!raw || !/^\+?[\d\s()-]+$/.test(raw)) return null;

  let digits = raw.replace(/\D/g, '');
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!/^7\d{10}$/.test(digits)) return null;

  return `+${digits}`;
}

function getCorsHeaders(origin) {
  const isAllowed = isAllowedOrigin(origin);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    // 🔒 Security headers
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // SEC-005 (2026-06-08): CSP на JSON-ответ — defense-in-depth.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };

  if (isAllowed) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

async function sendTelegramNotification(lead) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.log('[Telegram] Not configured, skipping notification');
    return;
  }

  const messengerLabels = {
    telegram: '📱 Telegram',
    whatsapp: '💬 WhatsApp',
    max: '🟣 MAX',
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
      [{ text: '✅ Взял в работу', callback_data: `lead_taken_${lead.id || Date.now()}` }],
    ],
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }),
    });

    const result = await response.json();
    console.log('[Telegram] Notification sent:', result.ok);
  } catch (error) {
    console.error('[Telegram Error]', error.message);
  }
}

function cleanOptionalText(value, maxLength = 128) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

async function markFunnelEventMetricaStatus(client, eventId, status, error) {
  if (!eventId) return;
  try {
    await client.query(
      `SELECT public.mark_funnel_event_metrica_status($1::uuid, $2::text, $3::text)`,
      [eventId, status, error ? String(error).slice(0, 500) : null],
    );
  } catch (e) {
    console.warn('[Metrica] Failed to mark funnel event status:', e.message);
  }
}

async function sendMetricaEvent(client, funnelEvent, landingPage) {
  if (!funnelEvent?.id) return;

  const counterId = process.env.YANDEX_METRICA_COUNTER_ID;
  const token = process.env.YANDEX_METRICA_MP_TOKEN;
  const dryRun =
    process.env.YANDEX_METRICA_DRY_RUN === '1' || process.env.YANDEX_METRICA_DRY_RUN === 'true';

  if (!funnelEvent.ym_client_id) {
    await markFunnelEventMetricaStatus(client, funnelEvent.id, 'skipped:no_client_id');
    return;
  }

  if (dryRun) {
    console.log('[Metrica] Dry-run event:', funnelEvent.event_type, funnelEvent.id);
    await markFunnelEventMetricaStatus(client, funnelEvent.id, 'dry_run');
    return;
  }

  if (!counterId || !token) {
    await markFunnelEventMetricaStatus(client, funnelEvent.id, 'skipped:not_configured');
    return;
  }

  const url = new URL('https://mc.yandex.ru/collect/');
  url.searchParams.set('tid', counterId);
  url.searchParams.set('cid', funnelEvent.ym_client_id);
  url.searchParams.set('t', 'event');
  url.searchParams.set('ea', funnelEvent.event_type);
  url.searchParams.set('ms', token);
  url.searchParams.set('dl', landingPage || 'https://heyslab.ru/');
  url.searchParams.set(
    'params',
    JSON.stringify({
      heys: {
        source: funnelEvent.source || 'unknown',
        campaign: funnelEvent.campaign || 'unknown',
        segment: funnelEvent.segment || undefined,
        tariff: funnelEvent.tariff || undefined,
      },
    }),
  );

  try {
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    await markFunnelEventMetricaStatus(client, funnelEvent.id, 'sent');
  } catch (e) {
    console.warn('[Metrica] Send failed:', e.message);
    await markFunnelEventMetricaStatus(client, funnelEvent.id, 'error', e.message);
  }
}

async function recordLeadFunnelEvent(client, lead) {
  const result = await client.query(
    `SELECT public.record_funnel_event(
       $1::text, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::text,
       $8::text, $9::jsonb, $10::text, $11::timestamptz
     ) AS event`,
    [
      'lead',
      lead.id,
      null,
      lead.utm_source || null,
      lead.utm_campaign || null,
      lead.quiz_segment || null,
      lead.plan || null,
      lead.ym_client_id || null,
      JSON.stringify({
        messenger: lead.messenger || null,
        utm_medium: lead.utm_medium || null,
        utm_content: lead.utm_content || null,
        promo_code: lead.promo_code || null,
        how_heard: lead.how_heard || null,
        readiness: lead.readiness || null,
        ab_variant: lead.ab_variant || null,
        intent: lead.intent || null,
      }),
      `lead:${lead.id}`,
      new Date().toISOString(),
    ],
  );
  return result.rows?.[0]?.event || null;
}

module.exports.handler = async function (event, context) {
  await initSecrets();

  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  // Только POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // 🛡️ SEC-019 (2026-06-08): Origin guard. До этого функция тихо подменяла ACAO
  // на ALLOWED_ORIGINS[0] для запрещённых origin'ов — браузер блокировал чтение
  // ответа, но lead УЖЕ был залит в БД + Telegram-уведомление ушло (CSRF).
  // Server-to-server (origin === '') допустим, как в heys-api-rest.
  const canAcceptOrigin = !origin || isAllowedOrigin(origin);
  if (!canAcceptOrigin) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'cors_denied' }),
    };
  }

  // 🛡️ SEC-018 (2026-06-08): Body size limit — защита от DoS/OOM.
  // 64 KB: lead-форма ~1KB. Аналог heys-api-rpc/index.js:1517-1518 (256 KB).
  const MAX_BODY_BYTES = 64 * 1024;
  if (
    event.body &&
    typeof event.body === 'string' &&
    Buffer.byteLength(event.body, 'utf8') > MAX_BODY_BYTES
  ) {
    return {
      statusCode: 413,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Payload too large' }),
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
      promo_code,
      how_heard,
      ym_client_id,
      quiz_segment,
      readiness,
      ab_variant,
      referrer,
      landing_page,
      intent,
      plan,
      website, // 🍯 honeypot (P0.13) — должно быть пустым
      consent, // 152-ФЗ ст. 9: согласие на обработку ПДн
      birth_year, // 152-ФЗ ст.9.5: 18+ gate (compliance overhaul 2026-05-20)
      marketing_accepted_at, // 152-ФЗ ст.15: опциональное маркетинговое согласие
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
    if (!name || !messenger) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: name, messenger',
        }),
      };
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: 'Invalid phone format',
          message: 'Введите корректный номер телефона',
        }),
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
    if (!consent || typeof consent !== 'object' || !consent.privacy_version || !consent.method) {
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

    const consentAcceptedAt = consent.accepted_at ? new Date(consent.accepted_at) : new Date();
    const consentUserAgent = consent.user_agent
      ? String(consent.user_agent).slice(0, 500)
      : event.headers?.['user-agent'] || event.headers?.['User-Agent'] || null;
    const consentPrivacyVersion = String(consent.privacy_version).slice(0, 32);
    const consentMethod = String(consent.method).slice(0, 32);

    // 152-ФЗ ст.9.5 серверная валидация 18+ (UI уже проверил, но не доверяем).
    // Старые сборки landing могут не присылать birth_year — допускаем для backwards-compat,
    // но логируем для мониторинга. После rollout landing >2 недель — сделать REJECTED.
    const birthYearNum = Number.isInteger(birth_year)
      ? birth_year
      : typeof birth_year === 'string'
        ? parseInt(birth_year, 10)
        : null;
    const currentYear = new Date().getFullYear();
    if (birthYearNum != null) {
      if (birthYearNum < 1900 || birthYearNum > currentYear) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: 'Invalid birth_year' }),
        };
      }
      if (currentYear - birthYearNum < 18) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({
            success: false,
            error: 'Under 18 not allowed',
            message: 'Сервис доступен только лицам старше 18 лет (152-ФЗ ст.9.5).',
          }),
        };
      }
    } else {
      console.warn('[Leads] WARN birth_year missing (legacy landing build)');
    }

    const consentMarketingAt = marketing_accepted_at ? new Date(marketing_accepted_at) : null;
    const safeYmClientId = consentAcceptedAt ? cleanOptionalText(ym_client_id, 64) : null;
    const safePromoCode = cleanOptionalText(promo_code, 64);
    const safeHowHeard = cleanOptionalText(how_heard, 64);
    const safeQuizSegment = cleanOptionalText(quiz_segment, 64);
    const safeReadiness = cleanOptionalText(readiness, 64);
    const safeAbVariant = cleanOptionalText(ab_variant, 256);

    // IP клиента для rate-limit
    const clientIp =
      event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
      event.requestContext?.identity?.sourceIp ||
      'unknown';

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
        [clientIp, RATE_LIMIT_WINDOW_MINUTES],
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
        [clientIp],
      );

      // Таблица leads создаётся миграциями (database/yandex_migration/001_schema.sql)
      // с правильным типом id UUID DEFAULT gen_random_uuid()

      // 1. Проверяем дубликаты за последние N минут
      const duplicateCheck = await client.query(
        `
        SELECT id, created_at
        FROM leads
        WHERE phone = $1
          AND created_at > NOW() - INTERVAL '${DEDUPLICATION_WINDOW_MINUTES} minutes'
        ORDER BY created_at DESC
        LIMIT 1
      `,
        [normalizedPhone],
      );

      let leadId;
      let isDuplicate = false;

      if (duplicateCheck.rows.length > 0) {
        // Дубликат в скользящем окне — возвращаем существующий ID
        leadId = duplicateCheck.rows[0].id;
        isDuplicate = true;
        console.log(
          '[Leads] Duplicate (window) detected:',
          leadId,
          'within',
          DEDUPLICATION_WINDOW_MINUTES,
          'minutes',
        );
      } else {
        // 2. Вставляем новый лид. Partial UNIQUE-индекс leads_active_phone_idx
        // (миграция 2026-04-28_leads_dedup) может бросить 23505 если phone уже
        // имеет активный лид (status IN 'new'/'contacted'/'trial_started').
        try {
          const result = await client.query(
            `
            INSERT INTO leads (
              name, phone, email, messenger,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              promo_code, how_heard, ym_client_id, quiz_segment, readiness, ab_variant,
              referrer, landing_page, ip_address,
              consent_privacy_version, consent_accepted_at, consent_method, consent_user_agent,
              birth_year, consent_marketing_accepted_at
            )
            VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14, $15,
              $16, $17, $18,
              $19, $20, $21, $22,
              $23, $24
            )
            RETURNING id
          `,
            [
              name,
              normalizedPhone,
              email || null,
              messenger,
              utm_source,
              utm_medium,
              utm_campaign,
              utm_term,
              utm_content,
              safePromoCode,
              safeHowHeard,
              safeYmClientId,
              safeQuizSegment,
              safeReadiness,
              safeAbVariant,
              referrer,
              landing_page,
              clientIp,
              consentPrivacyVersion,
              consentAcceptedAt,
              consentMethod,
              consentUserAgent,
              birthYearNum,
              consentMarketingAt,
            ],
          );

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
              [normalizedPhone],
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
        const funnelEvent = await recordLeadFunnelEvent(client, {
          id: leadId,
          messenger,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_content,
          promo_code: safePromoCode,
          how_heard: safeHowHeard,
          ym_client_id: safeYmClientId,
          quiz_segment: safeQuizSegment,
          readiness: safeReadiness,
          ab_variant: safeAbVariant,
          intent,
          plan,
        });

        await sendMetricaEvent(client, funnelEvent, landing_page || 'https://heyslab.ru/');

        await sendTelegramNotification({
          id: leadId,
          name,
          phone: normalizedPhone,
          messenger,
          utm_source,
          referrer,
          intent,
          plan,
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
          duplicate: isDuplicate,
        }),
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
        message: error.message,
      }),
    };
  }
};

module.exports.__test = { normalizePhone };
