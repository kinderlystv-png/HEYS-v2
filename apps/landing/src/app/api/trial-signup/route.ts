import { NextRequest, NextResponse } from 'next/server'

import { logger } from '@/lib/logger'

// === ТИПЫ ===
type Messenger = 'telegram' | 'whatsapp' | 'max'

interface TrialSignupRequest {
  name: string
  phone: string
  messenger: Messenger
  // UTM-метки
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  // A/B тест
  ab_variant?: string
  // Технические
  referrer?: string
  landing_page?: string
}

interface TrialSignupResponse {
  success: boolean
  message: string
  leadId?: string
}

// === КОНФИГ ===
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CURATOR_CHAT_ID = process.env.TELEGRAM_CURATOR_CHAT_ID

// Валидные мессенджеры
const VALID_MESSENGERS: Messenger[] = ['telegram', 'whatsapp', 'max']

// Название мессенджера для уведомлений
const MESSENGER_NAMES: Record<Messenger, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  max: 'MAX (VK)'
}

// Эмодзи для мессенджеров
const MESSENGER_EMOJI: Record<Messenger, string> = {
  telegram: '✈️',
  whatsapp: '💚',
  max: '💜'
}

// === SUPABASE ===
async function saveLeadToSupabase(data: {
  name: string
  phone: string
  messenger: Messenger
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  ab_variant?: string
  user_agent?: string
  ip_address?: string
  referrer?: string
  landing_page?: string
}): Promise<{ id: string } | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    logger.warn('[LEADS] Supabase не настроен, пропускаем сохранение')
    return null
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[LEADS] Ошибка Supabase:', { status: response.status, error: errorText })
      return null
    }

    const result = await response.json()
    return result[0] || null
  } catch (error) {
    logger.error('[LEADS] Ошибка сохранения:', error)
    return null
  }
}

// === TELEGRAM ===
async function sendTelegramNotification(data: {
  name: string
  phone: string
  messenger: Messenger
  leadId: string
  utm_source?: string
}): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CURATOR_CHAT_ID) {
    logger.warn('[TELEGRAM] Бот не настроен, пропускаем уведомление')
    return false
  }

  const messengerName = MESSENGER_NAMES[data.messenger]
  const messengerEmoji = MESSENGER_EMOJI[data.messenger]
  
  // Форматируем телефон
  const phoneFormatted = data.phone.replace(/(\d)(\d{3})(\d{3})(\d{2})(\d{2})/, '+$1 ($2) $3-$4-$5')
  
  // Текст сообщения
  const text = `🆕 <b>Новая заявка на триал!</b>

👤 <b>Имя:</b> ${data.name}
📱 <b>Телефон:</b> <code>${phoneFormatted}</code>
${messengerEmoji} <b>Мессенджер:</b> ${messengerName}
${data.utm_source ? `📊 <b>Источник:</b> ${data.utm_source}` : ''}

🆔 <code>${data.leadId}</code>
⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}

#trial #lead #${data.messenger}`

  // Inline кнопки для быстрых действий
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Взял в работу', callback_data: `lead_contacted:${data.leadId}` },
        { text: '📞 Позвонить', url: `tel:${data.phone}` }
      ],
      [
        data.messenger === 'telegram' 
          ? { text: '✈️ Написать в TG', url: `https://t.me/+${data.phone}` }
          : data.messenger === 'whatsapp'
          ? { text: '💚 Написать в WA', url: `https://wa.me/${data.phone}` }
          : { text: '💜 Написать в MAX', url: `https://vk.me/+${data.phone}` }
      ]
    ]
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CURATOR_CHAT_ID,
        text,
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[TELEGRAM] Ошибка отправки:', { status: response.status, error: errorText })
      return false
    }

    return true
  } catch (error) {
    logger.error('[TELEGRAM] Ошибка:', error)
    return false
  }
}

// === POST /api/trial-signup ===
export async function POST(request: NextRequest): Promise<NextResponse<TrialSignupResponse>> {
  try {
    const body: TrialSignupRequest = await request.json()
    
    // === ВАЛИДАЦИЯ ===
    if (!body.name?.trim()) {
      return NextResponse.json(
        { success: false, message: 'Имя обязательно' },
        { status: 400 }
      )
    }
    
    const phoneDigits = body.phone?.replace(/\D/g, '') || ''
    if (phoneDigits.length !== 11) {
      return NextResponse.json(
        { success: false, message: 'Некорректный номер телефона' },
        { status: 400 }
      )
    }
    
    if (!VALID_MESSENGERS.includes(body.messenger)) {
      return NextResponse.json(
        { success: false, message: 'Выберите мессенджер: Telegram, WhatsApp или MAX' },
        { status: 400 }
      )
    }
    
    // === СБОР ДАННЫХ ===
    const userAgent = request.headers.get('user-agent') || undefined
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                      request.headers.get('x-real-ip') || 
                      undefined

    const leadData = {
      name: body.name.trim(),
      phone: phoneDigits,
      messenger: body.messenger,
      utm_source: body.utm_source || undefined,
      utm_medium: body.utm_medium || undefined,
      utm_campaign: body.utm_campaign || undefined,
      utm_term: body.utm_term || undefined,
      utm_content: body.utm_content || undefined,
      ab_variant: body.ab_variant || undefined,
      user_agent: userAgent,
      ip_address: ipAddress,
      referrer: body.referrer || undefined,
      landing_page: body.landing_page || undefined
    }

    // === СОХРАНЕНИЕ В SUPABASE ===
    const savedLead = await saveLeadToSupabase(leadData)
    const leadId = savedLead?.id || `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // === ЛОГИРОВАНИЕ ===
    logger.info('[TRIAL SIGNUP]', {
      leadId,
      name: leadData.name,
      phone: leadData.phone,
      messenger: leadData.messenger,
      utm_source: leadData.utm_source,
      ab_variant: leadData.ab_variant,
      timestamp: new Date().toISOString(),
      savedToSupabase: !!savedLead
    })

    // === TELEGRAM УВЕДОМЛЕНИЕ ===
    const telegramSent = await sendTelegramNotification({
      name: leadData.name,
      phone: leadData.phone,
      messenger: leadData.messenger,
      leadId,
      utm_source: leadData.utm_source
    })

    if (!telegramSent) {
      logger.warn('[TRIAL SIGNUP] Telegram уведомление не отправлено')
    }

    // === ОТВЕТ ===
    return NextResponse.json({
      success: true,
      message: 'Заявка принята! Куратор свяжется с вами в течение 30 минут.',
      leadId
    })
    
  } catch (error) {
    logger.error('[TRIAL SIGNUP ERROR]', error)
    
    return NextResponse.json(
      { success: false, message: 'Внутренняя ошибка сервера' },
      { status: 500 }
    )
  }
}

// Не допускаем другие методы
export async function GET() {
  return NextResponse.json(
    { success: false, message: 'Method not allowed' },
    { status: 405 }
  )
}
