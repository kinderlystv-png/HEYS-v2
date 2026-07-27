'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_CONSENT_KEY,
  type AnalyticsConsentValue,
} from '@/components/AnalyticsConsentGate'

export default function CookieInfoBanner() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (pathname?.startsWith('/legal/')) {
      setVisible(false)
      return
    }
    try {
      const decision = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
      if (decision !== 'granted' && decision !== 'denied') {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [pathname])

  const decide = (value: AnalyticsConsentValue) => {
    try {
      window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value)
      window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: value }))
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Уведомление об использовании cookies"
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.18)] sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <p className="flex-1 text-sm leading-6 text-gray-700">
          Необходимые данные браузера обеспечивают работу сайта. Яндекс.Метрика
          для статистики загрузится только с вашего разрешения; отказ не влияет
          на заявку и работу сайта. Подробнее — в{' '}
          <a
            href="/legal/cookie-policy"
            className="text-orange-600 underline hover:text-orange-700"
          >
            политике использования cookies
          </a>
          .
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            type="button"
            onClick={() => decide('denied')}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
          >
            Отклонить
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50"
          >
            Разрешить
          </button>
        </div>
      </div>
    </div>
  )
}
