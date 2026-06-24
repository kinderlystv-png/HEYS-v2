// ComparisonSection.tsx — Секция "Отличие форматов"
// Anchor: #comparison
// 3 колонки: трекер / консультация / HEYS

'use client'

import { useEffect, useRef, useState } from 'react'

const comparisonRows = [
    {
        label: 'Кто ведёт дневник',
        tracker: 'Вы сами вбиваете каждый грамм',
        consult: 'Вы сами собираете отчёт к встрече',
        heys: 'Куратор ведёт дневник по вашим данным',
    },
    {
        label: 'Чем подкреплён разбор',
        tracker: 'Графики и напоминания',
        consult: 'Опыт специалиста и ваши заметки',
        heys: 'Метод HEYS + непрерывная картина недели',
    },
    {
        label: 'Между контактами',
        tracker: 'Push-напоминание',
        consult: 'Меньше непрерывной картины между встречами',
        heys: 'Куратор держит контекст и видит сдвиги',
    },
    {
        label: 'Если день сорвался',
        tracker: 'Цифры краснеют',
        consult: 'Разбираете на следующем контакте',
        heys: 'Разбираем причину по свежему контексту, без вины',
    },
    {
        label: 'Контекст',
        tracker: 'Один день за раз',
        consult: 'Фрагменты в чате и памяти',
        heys: 'Единая история: питание, сон, тренировки, ритм',
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
            <div className="sticky top-0 z-[100] bg-white/95 border-y border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">04 — ОТЛИЧИЕ ОТ ДИЕТ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Трекер, консультация и HEYS — разные форматы
                    </h2>

                    {/* Desktop table */}
                    <div
                        className={`hidden lg:block transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                            {/* Table header */}
                            <div className="grid grid-cols-[1.05fr_1fr_1fr_1.15fr]">
                                <div className="bg-slate-100 px-5 py-4">
                                    <span className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                                        Формат
                                    </span>
                                </div>
                                <div className="border-l border-slate-100 bg-slate-50 px-5 py-4">
                                    <span className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                                        Трекер
                                    </span>
                                </div>
                                <div className="border-l border-slate-100 bg-slate-50 px-5 py-4">
                                    <span className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                                        Консультация
                                    </span>
                                </div>
                                <div className="border-l border-blue-100 bg-blue-50 px-5 py-4">
                                    <span className="text-sm font-semibold uppercase tracking-wider text-blue-700">
                                        HEYS
                                    </span>
                                </div>
                            </div>

                            {/* Table rows */}
                            {comparisonRows.map((row, index) => (
                                <div
                                    key={index}
                                    className={`grid grid-cols-[1.05fr_1fr_1fr_1.15fr] ${index < comparisonRows.length - 1 ? 'border-b border-gray-100' : ''
                                        }`}
                                >
                                    <div className="bg-white px-5 py-5 font-semibold text-gray-900">
                                        {row.label}
                                    </div>
                                    <div className="border-l border-gray-100 bg-slate-50/40 px-5 py-5 text-gray-600">
                                        {row.tracker}
                                    </div>
                                    <div className="border-l border-gray-100 bg-slate-50/40 px-5 py-5 text-gray-600">
                                        {row.consult}
                                    </div>
                                    <div className="border-l border-blue-100 bg-blue-50/30 px-5 py-5 font-medium text-gray-900">
                                        {row.heys}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-gray-500">
                            HEYS не заменяет врача или нутрициолога при медицинских показаниях.
                            Отличие — в формате ежедневного ведения и единой истории.
                        </p>
                    </div>

                    {/* Mobile cards */}
                    <div className="lg:hidden space-y-4">
                        {comparisonRows.map((row, index) => (
                            <div
                                key={index}
                                className={`rounded-2xl overflow-hidden border border-gray-200 bg-white transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                    }`}
                                style={{ transitionDelay: `${200 + index * 100}ms` }}
                            >
                                <div className="px-5 py-4 bg-red-50/50 border-b border-red-100 flex items-start gap-3">
                                    <span className="text-sm font-semibold text-gray-900">{row.label}</span>
                                </div>
                                <div className="space-y-3 px-5 py-4">
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                                            Трекер
                                        </div>
                                        <p className="text-sm text-gray-600">{row.tracker}</p>
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                                            Консультация
                                        </div>
                                        <p className="text-sm text-gray-600">{row.consult}</p>
                                    </div>
                                    <div className="rounded-xl bg-blue-50 px-3 py-3">
                                        <div className="text-[11px] font-bold uppercase tracking-widest text-blue-700">
                                            HEYS
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">{row.heys}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <p className="text-sm leading-relaxed text-gray-500">
                            HEYS не заменяет врача или нутрициолога при медицинских показаниях.
                            Отличие — в формате ежедневного ведения и единой истории.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
