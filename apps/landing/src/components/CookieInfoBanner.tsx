'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'heys_cookie_info_seen'

export default function CookieInfoBanner() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (pathname?.startsWith('/legal/')) {
      setVisible(false)
      return
    }
    try {
      if (window.localStorage.getItem(STORAGE_KEY) !== '1') {
        setVisible(true)
      }
    } catch {
      setVisible(true)
    }
  }, [pathname])

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
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
          Мы используем технические и аналитические cookies для работы сайта и
          статистики посещений. Подробнее — в{' '}
          <a
            href="/legal/cookie-policy"
            className="text-orange-600 underline hover:text-orange-700"
          >
            политике использования cookies
          </a>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 active:bg-orange-800"
        >
          Понятно
        </button>
      </div>
    </div>
  )
}
