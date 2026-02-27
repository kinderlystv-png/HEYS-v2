// ComparisonSection.tsx — Секция "Отличие"
// Anchor: #comparison
// 6-строчная таблица: обычное приложение vs HEYS

'use client'

import { useEffect, useRef, useState } from 'react'

const comparisonRows = [
    {
        usual: 'Вы считаете калории сами',
        heys: 'Трекер работает под капотом — вы получаете готовый результат',
    },
    {
        usual: '100 графиков, ноль понимания',
        heys: '1-2 конкретных действия на день, объяснённых простым языком',
    },
    {
        usual: 'Мотивация = push-уведомления',
        heys: 'Мотивация = живой куратор, которому не всё равно',
    },
    {
        usual: 'Сорвались → приложение молчит',
        heys: 'Система предвидит срыв ДО него и предупреждает',
    },
    {
        usual: 'Переели → «красная зона», стыд',
        heys: 'Переели → мягкая коррекция через активность, не через голодание',
    },
    {
        usual: 'Показывает факт: «переели на 300 ккал»',
        heys: 'Показывает причину: «переели, потому что спали 5 часов → стресс → голод»',
    },
]

export default function ComparisonSection() {
    const [isVisible, setIsVisible] = useState(false)
    const sectionRef = useRef<HTMLElement>(null)

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.disconnect()
                }
            },
            { threshold: 0.1 }
        )
        if (sectionRef.current) observer.observe(sectionRef.current)
        return () => observer.disconnect()
    }, [])

    return (
        <section
            ref={sectionRef}
            id="comparison"
            className="py-16 md:py-20 bg-slate-50 border-y border-slate-200 relative"
        >
            
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">03 — ОТЛИЧИЕ ОТ ДИЕТ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Чем HEYS отличается от калорийников и диет
                    </h2>

                    {/* Desktop table */}
                    <div
                        className={`hidden md:block transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-white">
                            {/* Table header */}
                            <div className="grid grid-cols-2">
                                <div className="bg-red-50/50 px-6 py-4 border-r border-red-100">
                                    <span className="text-sm font-semibold text-red-800/60 uppercase tracking-wider">
                                        Обычное приложение
                                    </span>
                                </div>
                                <div className="bg-blue-50 px-6 py-4">
                                    <span className="text-sm font-semibold text-blue-600 uppercase tracking-wider">
                                        HEYS с куратором
                                    </span>
                                </div>
                            </div>

                            {/* Table rows */}
                            {comparisonRows.map((row, index) => (
                                <div
                                    key={index}
                                    className={`grid grid-cols-2 ${index < comparisonRows.length - 1 ? 'border-b border-gray-100' : ''
                                        }`}
                                >
                                    <div className="px-6 py-5 bg-red-50/30 border-r border-red-100 flex items-start gap-3">
                                        <span className="text-red-400 mt-1 flex-shrink-0">✕</span>
                                        <span className="text-gray-600">{row.usual}</span>
                                    </div>
                                    <div className="px-6 py-5 flex items-start gap-3 bg-blue-50/30">
                                        <span className="text-green-500 mt-1 flex-shrink-0">✓</span>
                                        <span className="text-gray-800 font-medium">{row.heys}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Mobile cards */}
                    <div className="md:hidden space-y-4">
                        {comparisonRows.map((row, index) => (
                            <div
                                key={index}
                                className={`rounded-2xl overflow-hidden border border-gray-200 bg-white transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                    }`}
                                style={{ transitionDelay: `${200 + index * 100}ms` }}
                            >
                                <div className="px-5 py-4 bg-red-50/50 border-b border-red-100 flex items-start gap-3">
                                    <span className="text-red-400 mt-0.5 flex-shrink-0">✕</span>
                                    <span className="text-gray-600 text-sm">{row.usual}</span>
                                </div>
                                <div className="px-5 py-4 bg-blue-50/30 flex items-start gap-3">
                                    <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                                    <span className="text-gray-800 font-medium text-sm">{row.heys}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
