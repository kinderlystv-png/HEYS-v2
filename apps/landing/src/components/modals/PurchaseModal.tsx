'use client'

import { logger } from '@heys/logger'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type FormState = 'idle' | 'loading' | 'success' | 'error'
type Messenger = 'telegram' | 'whatsapp' | 'call'

interface UTMParams {
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_term?: string
    utm_content?: string
}

interface PurchaseModalProps {
    isOpen: boolean
    onClose: () => void
    planName: string
    planPrice: string
}

export default function PurchaseModal({ isOpen, onClose, planName, planPrice }: PurchaseModalProps) {
    const [name, setName] = useState('')
    const [phone, setPhone] = useState('')
    const [messenger, setMessenger] = useState<Messenger>('telegram')
    const [formState, setFormState] = useState<FormState>('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [utmParams, setUtmParams] = useState<UTMParams>({})

    // Парсим UTM при открытии
    useEffect(() => {
        if (isOpen && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search)
            setUtmParams({
                utm_source: params.get('utm_source') || undefined,
                utm_medium: params.get('utm_medium') || undefined,
                utm_campaign: params.get('utm_campaign') || undefined,
                utm_term: params.get('utm_term') || undefined,
                utm_content: params.get('utm_content') || undefined,
            })
            // Блокируем скролл фона
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }

        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    // Закрытие по Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    if (!isOpen) return null

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.replace(/[^\d+]/g, '')
        if (val.startsWith('8')) val = '7' + val.substring(1)
        if (!val.startsWith('+') && val.length > 0) val = '+' + val
        setPhone(val)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setFormState('loading')
        setErrorMessage('')

        try {
            const response = await fetch('https://api.heyslab.ru/leads', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name.trim(),
                    phone: phone.replace(/\D/g, ''),
                    messenger,
                    intent: 'direct_purchase',
                    plan: planName,
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

            if (typeof window !== 'undefined') {
                if (window.gtag) {
                    window.gtag('event', 'purchase_request', { plan: planName })
                }
                if (window.fbq) {
                    window.fbq('track', 'PurchaseRequest')
                }
            }
        } catch (err: any) {
            setFormState('error')
            setErrorMessage(err.message || 'Произошла ошибка. Пожалуйста, попробуйте позже или напишите нам в Telegram.')
            logger.error('[PurchaseModal] ❌ Submit error:', err)
        }
    }

    const modalContent = (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal Window */}
            <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-10"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                <div className="px-6 pt-8 pb-6 bg-slate-50 border-b border-slate-100">
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Оформление: {planName}</h3>
                    <p className="text-slate-600 text-sm">
                        Оставьте контакты — куратор свяжется с вами, ответит на вопросы и пришлет ссылку на оплату подписки ({planPrice}).
                    </p>
                </div>

                <div className="p-6">
                    {formState === 'success' ? (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">🎉</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-2">Заявка принята!</h3>
                            <p className="text-slate-600">
                                Мы свяжемся с вами в ближайшее время через {messenger === 'telegram' ? 'Telegram' : messenger === 'whatsapp' ? 'WhatsApp' : 'звонок'}, чтобы завершить оформление.
                            </p>
                            <button
                                onClick={onClose}
                                className="mt-8 w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
                            >
                                Закрыть
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label htmlFor="purchase-name" className="block text-sm font-medium text-slate-700 mb-1">
                                    Ваше имя
                                </label>
                                <input
                                    type="text"
                                    id="purchase-name"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                                    placeholder="Иван"
                                    disabled={formState === 'loading'}
                                />
                            </div>

                            <div>
                                <label htmlFor="purchase-phone" className="block text-sm font-medium text-slate-700 mb-1">
                                    Номер телефона
                                </label>
                                <input
                                    type="tel"
                                    id="purchase-phone"
                                    required
                                    value={phone}
                                    onChange={handlePhoneChange}
                                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-mono"
                                    placeholder="+7 999 000-00-00"
                                    disabled={formState === 'loading'}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Как вам удобнее обсудить детали?
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    <label className={`
                    flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium cursor-pointer transition-all
                    ${messenger === 'telegram'
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }
                  `}>
                                        <input
                                            type="radio"
                                            name="messenger"
                                            value="telegram"
                                            checked={messenger === 'telegram'}
                                            onChange={(e) => setMessenger(e.target.value as Messenger)}
                                            className="sr-only"
                                            disabled={formState === 'loading'}
                                        />
                                        <span className="text-[#2AABEE]">✈️</span>
                                        Telegram
                                    </label>

                                    <label className={`
                    flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium cursor-pointer transition-all
                    ${messenger === 'whatsapp'
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }
                  `}>
                                        <input
                                            type="radio"
                                            name="messenger"
                                            value="whatsapp"
                                            checked={messenger === 'whatsapp'}
                                            onChange={(e) => setMessenger(e.target.value as Messenger)}
                                            className="sr-only"
                                            disabled={formState === 'loading'}
                                        />
                                        <span className="text-[#25D366]">💬</span>
                                        WhatsApp
                                    </label>

                                    <label className={`
                    flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium cursor-pointer transition-all
                    ${messenger === 'call'
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                        }
                  `}>
                                        <input
                                            type="radio"
                                            name="messenger"
                                            value="call"
                                            checked={messenger === 'call'}
                                            onChange={(e) => setMessenger(e.target.value as Messenger)}
                                            className="sr-only"
                                            disabled={formState === 'loading'}
                                        />
                                        <span className="text-slate-600">📞</span>
                                        Звонок
                                    </label>
                                </div>
                            </div>

                            {errorMessage && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
                                    {errorMessage}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={formState === 'loading'}
                                className="w-full py-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 focus:ring-4 focus:ring-slate-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center overflow-hidden relative"
                            >
                                {formState === 'loading' ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Отправка...
                                    </span>
                                ) : (
                                    'Оформить подписку'
                                )}
                            </button>

                            <p className="text-xs text-center text-slate-400 mt-4 leading-relaxed">
                                Нажимая кнопку, вы соглашаетесь с{' '}
                                <a href="/legal/agreements" className="underline hover:text-slate-600" target="_blank">условиями обработки персональных данных</a>.
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )

    // Используем Portal чтобы модалка гарантированно рендерилась поверх всего
    if (typeof document === 'undefined') return null
    return createPortal(modalContent, document.body)
}
