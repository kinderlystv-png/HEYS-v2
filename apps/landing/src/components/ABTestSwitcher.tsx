'use client'

import { useEffect, useState } from 'react'

const VARIANTS = [
    { id: 'control', label: 'Control (Боль 1)' },
    { id: 'variant_a', label: 'Variant A (Боль 2)' },
    { id: 'variant_b', label: 'Variant B (Старый)' },
    { id: 'variant_c', label: 'Variant C (Выгода)' },
]

export function ABTestSwitcher() {
    const [isOpen, setIsOpen] = useState(false)
    const [current, setCurrent] = useState<string | null>(null)
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        // Показываем только на localhost или если есть спец. флаг в localStorage
        // Чтобы реальные юзеры не видели эту кнопку
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const isForceEnabled = localStorage.getItem('heys_dev_mode') === 'true'

        if (isLocalhost || isForceEnabled) {
            setIsVisible(true)
            setCurrent(localStorage.getItem('ab_hero_copy'))
        }
    }, [])

    if (!isVisible) return null

    const setVariant = (v: string | null) => {
        if (v) {
            localStorage.setItem('ab_hero_copy', v)
        } else {
            localStorage.removeItem('ab_hero_copy')
        }
        window.location.reload()
    }

    return (
        <div className="fixed bottom-6 left-6 z-[9999] font-sans">
            {isOpen && (
                <div className="absolute bottom-16 left-0 mb-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-sm animate-in fade-in slide-in-from-bottom-2">
                    <div className="p-3 bg-slate-50 border-b border-slate-100 font-semibold text-slate-700 flex justify-between items-center">
                        <span>🧪 A/B Тест Hero</span>
                        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                            ✕
                        </button>
                    </div>
                    <div className="flex flex-col py-1">
                        {VARIANTS.map(v => (
                            <button
                                key={v.id}
                                onClick={() => setVariant(v.id)}
                                className={`px-4 py-2.5 text-left hover:bg-slate-50 transition-colors flex items-center justify-between ${current === v.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-slate-600'
                                    }`}
                            >
                                <span>{v.label}</span>
                                {current === v.id && <span className="text-blue-600">✓</span>}
                            </button>
                        ))}
                        <div className="h-px bg-slate-100 my-1" />
                        <button
                            onClick={() => setVariant(null)}
                            className="px-4 py-2 text-left text-slate-500 hover:bg-slate-50 text-xs"
                        >
                            Сбросить (Случайный выбор)
                        </button>
                    </div>
                </div>
            )}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 ${isOpen ? 'bg-slate-800 text-white scale-95' : 'bg-white text-slate-800 hover:scale-105 border border-slate-200'
                    }`}
                title="Переключатель A/B тестов"
            >
                <span className="text-xl">🧪</span>
            </button>
        </div>
    )
}
