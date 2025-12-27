// VersionSwitcherSSR.tsx — Коллапсируемый переключатель версий
// Кнопка "?" раскрывается при нажатии
'use client'

import { useState } from 'react'

import type { LandingVariant } from '@/config/landing-variants'

interface VersionSwitcherSSRProps {
  currentVariant: LandingVariant
}

const VARIANTS: LandingVariant[] = ['A', 'B', 'C', 'D']

// Время сборки (фиксируется при старте сервера / компиляции)
const BUILD_TIME = new Date().toLocaleString('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Moscow'
})

export default function VersionSwitcherSSR({ currentVariant }: VersionSwitcherSSRProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Collapsed state: кнопка "?" */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-7 h-7 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-full text-black/30 hover:text-black/60 hover:bg-black/30 transition-all text-sm font-normal"
          aria-label="Переключить варианты"
        >
          ?
        </button>
      )}

      {/* Expanded state: панель с вариантами */}
      {isOpen && (
        <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="text-white/60 text-xs">
              Варианты
              {/* suppressHydrationWarning — время может отличаться server vs client */}
              <span suppressHydrationWarning className="block text-white/40 text-[10px] mt-0.5">v{BUILD_TIME}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <div className="flex gap-2">
            {VARIANTS.map((v) => {
              const isActive = v === currentVariant
              const href = `/${v.toLowerCase()}`

              return (
                <a
                  key={v}
                  href={href}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  {v}
                </a>
              )
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-white/10">
            <a
              href="/"
              className="block text-center text-white/50 text-xs hover:text-white/80 transition-colors"
            >
              ← На главную
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
