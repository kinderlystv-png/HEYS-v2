'use client'

import { useState } from 'react'

import { LandingVariant, VARIANTS } from '@/config/landing-variants'
import { useVariant } from '@/context/VariantContext'

export default function VersionSwitcher() {
  const { variant, setVariant } = useVariant()
  const [isOpen, setIsOpen] = useState(false)

  const variants: LandingVariant[] = ['A', 'B', 'C']

  const variantColors: Record<LandingVariant, string> = {
    A: 'bg-emerald-500 hover:bg-emerald-600',
    B: 'bg-blue-500 hover:bg-blue-600',
    C: 'bg-amber-500 hover:bg-amber-600',
  }

  const variantBorders: Record<LandingVariant, string> = {
    A: 'border-emerald-500',
    B: 'border-blue-500',
    C: 'border-amber-500',
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2">
      {/* Выпадающие кнопки версий */}
      <div className={`flex flex-col gap-2 transition-all duration-300 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        {variants.map((v) => (
          <button
            key={v}
            onClick={() => {
              setVariant(v)
              setIsOpen(false)
            }}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg backdrop-blur-sm
              text-white font-medium text-sm
              transition-all duration-200
              ${variantColors[v]}
              ${variant === v ? 'ring-2 ring-white ring-offset-2' : ''}
            `}
          >
            <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">
              {v}
            </span>
            <div className="text-left">
              <div className="font-semibold">{VARIANTS[v].name}</div>
              <div className="text-xs text-white/80">{VARIANTS[v].description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Основная FAB кнопка */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          group flex items-center gap-2 px-4 py-3 rounded-full shadow-xl
          bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900
          border-2 ${variantBorders[variant]}
          transition-all duration-300
          hover:scale-105 active:scale-95
        `}
        aria-label="Переключить версию лендинга"
      >
        <div className={`
          w-8 h-8 rounded-full flex items-center justify-center font-bold text-white
          ${variantColors[variant].split(' ')[0]}
        `}>
          {variant}
        </div>
        <span className="text-sm font-medium pr-1">
          A/B/C Тест
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Info tooltip */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 p-3 bg-zinc-900/95 dark:bg-zinc-800/95 text-white rounded-xl shadow-lg text-xs max-w-[280px] backdrop-blur-sm">
          <p className="font-semibold mb-1">🔬 Фокус-группа: A/B/C тест</p>
          <p className="text-zinc-400">
            Три тональности лендинга. Выберите версию и поделитесь впечатлениями.
          </p>
          <div className="mt-2 pt-2 border-t border-zinc-700 text-zinc-500">
            URL: <code className="text-emerald-400">?v={variant}</code>
          </div>
        </div>
      )}
    </div>
  )
}
