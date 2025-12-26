'use client'

import { useState, useEffect } from 'react'

type FormState = 'idle' | 'loading' | 'success' | 'error'
type Messenger = 'telegram' | 'whatsapp'

interface UTMParams {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}

const PLANS = {
  base: { name: 'Base', price: '1 990' },
  pro: { name: 'Pro', price: '12 990' },
  'pro-plus': { name: 'Pro+', price: '19 990' },
}

export default function PurchaseSection() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [messenger, setMessenger] = useState<Messenger>('telegram')
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [utmParams, setUtmParams] = useState<UTMParams>({})

  // Проверяем hash при загрузке и изменении
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash
      if (hash.startsWith('#purchase-')) {
        const plan = hash.replace('#purchase-', '')
        if (plan in PLANS) {
          setSelectedPlan(plan)
        }
      }
    }
    
    checkHash()
    window.addEventListener('hashchange', checkHash)
    return () => window.removeEventListener('hashchange', checkHash)
  }, [])

  // UTM параметры
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
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    if (digits.length <= 1) return `+${digits}`
    if (digits.length <= 4) return `+${digits.slice(0, 1)} (${digits.slice(1)}`
    if (digits.length <= 7) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4)}`
    if (digits.length <= 9) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
    return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value))
  }

  const validateForm = (): boolean => {
    if (!selectedPlan) {
      setErrorMessage('Выберите тариф')
      return false
    }
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
      const response = await fetch('https://api.heyslab.ru/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          messenger,
          lead_type: 'purchase',
          selected_plan: selectedPlan,
          ...utmParams,
          referrer: typeof document !== 'undefined' ? document.referrer : undefined,
          landing_page: typeof window !== 'undefined' ? window.location.pathname : undefined
        })
      })
      
      const data = await response.json()
      
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Ошибка отправки')
      }
      
      setFormState('success')
    } catch (error) {
      setFormState('error')
      setErrorMessage(
        error instanceof Error 
          ? error.message 
          : 'Произошла ошибка. Попробуйте ещё раз или напишите нам напрямую.'
      )
    }
  }

  const plan = selectedPlan ? PLANS[selectedPlan as keyof typeof PLANS] : null

  // Успешная отправка
  if (formState === 'success') {
    return (
      <section className="py-20 bg-emerald-600" id="contact">
        <div className="container mx-auto px-6">
          <div className="max-w-xl mx-auto text-center">
            <div className="text-6xl mb-6">✅</div>
            <h2 className="text-3xl font-bold text-white mb-4">
              Заявка отправлена!
            </h2>
            <p className="text-xl text-emerald-100 mb-4">
              {plan && (
                <>
                  Тариф: <strong>{plan.name}</strong> — {plan.price} ₽/мес
                </>
              )}
            </p>
            <p className="text-emerald-100">
              Ваш куратор свяжется с вами в {messenger === 'telegram' ? 'Telegram' : 'WhatsApp'} в течение 2 часов 
              для оформления подписки.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-20 bg-gray-900" id="contact">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Оформить подписку
            </h2>
            <p className="text-xl text-gray-300">
              Оставьте заявку — мы свяжемся для оформления
            </p>
          </div>

          {/* Plan selection */}
          <div className="mb-8">
            <label className="block text-gray-300 text-sm font-medium mb-3">
              Выберите тариф
            </label>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(PLANS).map(([key, { name, price }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedPlan(key)}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    selectedPlan === key
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className={`font-semibold ${selectedPlan === key ? 'text-blue-400' : 'text-white'}`}>
                    {name}
                  </div>
                  <div className="text-gray-400 text-sm">{price} ₽</div>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="purchase-name" className="block text-gray-300 text-sm font-medium mb-2">
                Ваше имя
              </label>
              <input
                type="text"
                id="purchase-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как к вам обращаться"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="purchase-phone" className="block text-gray-300 text-sm font-medium mb-2">
                Телефон
              </label>
              <input
                type="tel"
                id="purchase-phone"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="+7 (___) ___-__-__"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Messenger */}
            <div>
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Где удобнее общаться
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMessenger('telegram')}
                  className={`p-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                    messenger === 'telegram'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span>📱</span> Telegram
                </button>
                <button
                  type="button"
                  onClick={() => setMessenger('whatsapp')}
                  className={`p-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                    messenger === 'whatsapp'
                      ? 'border-green-500 bg-green-500/10 text-green-400'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span>💬</span> WhatsApp
                </button>
              </div>
            </div>

            {/* Error */}
            {errorMessage && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {errorMessage}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={formState === 'loading'}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-semibold rounded-xl transition-colors"
            >
              {formState === 'loading' ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Отправка...
                </span>
              ) : (
                <>Отправить заявку{plan && ` на ${plan.name}`}</>
              )}
            </button>

            {/* Note */}
            <p className="text-center text-gray-500 text-sm">
              Мы свяжемся в течение 2 часов для оформления.
              <br />
              Оплата только после подтверждения деталей.
            </p>
          </form>

          {/* Trial link */}
          <div className="mt-10 pt-8 border-t border-gray-800 text-center">
            <p className="text-gray-400 mb-3">
              Не готовы покупать сразу?
            </p>
            <a 
              href="#trial" 
              className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              Попробуйте 7 дней бесплатно →
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
