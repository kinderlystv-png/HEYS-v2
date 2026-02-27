'use client'

import { useEffect, useState } from 'react'

// Расширяем Window для аналитики
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

type FormState = 'idle' | 'loading' | 'success' | 'error'
type Messenger = 'telegram' | 'whatsapp' | 'max'

// UTM параметры
interface UTMParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

interface TrialFormProps {
  ctaLabel?: string
}

export default function TrialForm({ ctaLabel }: TrialFormProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [messenger, setMessenger] = useState<Messenger>('telegram')
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [utmParams, setUtmParams] = useState<UTMParams>({})

  // Парсим UTM из URL при загрузке
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      setUtmParams({
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_term: params.get('utm_term') || undefined,
        utm_content: params.get('utm_content') || undefined
      })
    }
  }, [])

  const formatPhone = (value: string) => {
    // Убираем всё кроме цифр
    const digits = value.replace(/\D/g, '')

    // Форматируем как +7 (XXX) XXX-XX-XX
    if (digits.length === 0) return ''
    if (digits.length <= 1) return `+${digits}`
    if (digits.length <= 4) return `+${digits.slice(0, 1)} (${digits.slice(1)}`
    if (digits.length <= 7) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4)}`
    if (digits.length <= 9) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value)
    setPhone(formatted)
  }

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setErrorMessage('Пожалуйста, введите ваше имя')
      return false
    }

    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 11) {
      setErrorMessage('Введите корректный номер телефона')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (!validateForm()) return

    setFormState('loading')

    try {
      // Yandex Cloud Function API (152-ФЗ compliant, данные хранятся в РФ)
      const response = await fetch('https://api.heyslab.ru/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          messenger,
          // UTM параметры
          ...utmParams,
          // Технические данные
          referrer: typeof document !== 'undefined' ? document.referrer : undefined,
          landing_page: typeof window !== 'undefined' ? window.location.pathname : undefined
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Ошибка отправки')
      }

      // Успех
      setFormState('success')

      // ⚠️ GA4/Meta Pixel ОТКЛЮЧЕНЫ для 152-ФЗ compliance (трансграничная передача)
      // Вызовы ниже не выполнятся пока GA4_ID/META_PIXEL_ID = null в layout.tsx
      // TODO: Включить после уведомления РКН о трансграничной передаче
      if (typeof window !== 'undefined') {
        // Google Analytics 4 (disabled until RKN notification)
        if (window.gtag) {
          window.gtag('event', 'trial_signup', {
            event_category: 'conversion',
            event_label: messenger,
            messenger: messenger,
            utm_source: utmParams.utm_source
          })
        }
        // Meta Pixel (disabled until RKN notification)
        if (window.fbq) {
          window.fbq('track', 'Lead', {
            content_name: 'trial_signup',
            messenger: messenger
          })
        }
      }
    } catch (error) {
      setFormState('error')
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Произошла ошибка. Попробуйте ещё раз или напишите нам напрямую.'
      )
    }
  }

  // Успешная отправка
  if (formState === 'success') {
    return (
      <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Заявка отправлена!</h3>
        <p className="text-gray-600 mb-4">
          Ваш куратор свяжется с вами в рабочее время (с 10:00 до 20:00)
          {messenger === 'telegram' ? ' в Telegram' : messenger === 'whatsapp' ? ' в WhatsApp' : ' в MAX'}
        </p>
        <p className="text-gray-500 text-sm">
          Если не получили сообщение — проверьте папку «Запросы» или напишите нам: @heys_support
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-8 shadow-2xl">
      <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Заявка на участие</h3>

      {/* Имя */}
      <div className="mb-4">
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          Ваше имя
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Как к вам обращаться?"
          className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
          disabled={formState === 'loading'}
        />
      </div>

      {/* Телефон */}
      <div className="mb-4">
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
          Номер телефона
        </label>
        <input
          type="tel"
          id="phone"
          value={phone}
          onChange={handlePhoneChange}
          placeholder="+7 (___) ___-__-__"
          className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
          disabled={formState === 'loading'}
        />
      </div>

      {/* Выбор мессенджера */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Где удобнее общаться?
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setMessenger('telegram')}
            className={`py-3 px-2 rounded-xl border-2 transition-all flex items-center justify-center gap-1 text-sm ${messenger === 'telegram'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
              }`}
            disabled={formState === 'loading'}
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
            <span className="hidden sm:inline">Telegram</span>
            <span className="sm:hidden">TG</span>
          </button>
          <button
            type="button"
            onClick={() => setMessenger('whatsapp')}
            className={`py-3 px-2 rounded-xl border-2 transition-all flex items-center justify-center gap-1 text-sm ${messenger === 'whatsapp'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
              }`}
            disabled={formState === 'loading'}
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            <span className="hidden sm:inline">WhatsApp</span>
            <span className="sm:hidden">WA</span>
          </button>
          <button
            type="button"
            onClick={() => setMessenger('max')}
            className={`py-3 px-2 rounded-xl border-2 transition-all flex items-center justify-center gap-1 text-sm ${messenger === 'max'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
              }`}
            disabled={formState === 'loading'}
          >
            {/* MAX (VK Messenger) icon */}
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.19 7.8c.2.39.02.86-.38 1.05l-2.97 1.48 2.97 1.48c.4.19.58.66.38 1.05-.19.4-.66.58-1.05.38l-4.14-2.07-4.14 2.07c-.39.2-.86.02-1.05-.38-.2-.39-.02-.86.38-1.05l2.97-1.48-2.97-1.48c-.4-.19-.58-.66-.38-1.05.19-.4.66-.58 1.05-.38l4.14 2.07 4.14-2.07c.39-.2.86-.02 1.05.38z" />
            </svg>
            <span>MAX</span>
          </button>
        </div>
        <p className="text-gray-500 text-xs mt-2 text-center">
          MAX — мессенджер от VK, работает без ограничений в России
        </p>
      </div>

      {/* Ошибка */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Кнопка отправки */}
      <button
        type="submit"
        disabled={formState === 'loading'}
        className="w-full py-4 bg-blue-600 text-white font-semibold text-lg rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {formState === 'loading' ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Отправляем...
          </span>
        ) : (
          ctaLabel || 'Записаться на неделю старта →'
        )}
      </button>

      {/* Согласие */}
      <p className="mt-4 text-gray-500 text-xs text-center">
        Нажимая кнопку, вы соглашаетесь с{' '}
        <a href="/legal/user-agreement" className="text-blue-600 hover:underline">
          условиями использования
        </a>{' '}
        и{' '}
        <a href="/legal/privacy-policy" className="text-blue-600 hover:underline">
          политикой конфиденциальности
        </a>
      </p>
    </form>
  )
}
