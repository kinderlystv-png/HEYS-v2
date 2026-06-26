// ComparisonSection.tsx — Секция "Отличие форматов"
// Anchor: #comparison
// Сценарное сравнение: что происходит в реальной неделе

'use client'

import { useEffect, useRef, useState } from 'react'

const scenarios = [
    {
        label: 'Нужно внести еду',
        tracker: 'В трекере: ручной ввод каждого приёма',
        consult: 'На консультации: записи и воспоминания к встрече',
        heys: 'Куратор переносит фото, голосовые и заметки в дневник',
    },
    {
        label: 'Вечером был срыв',
        tracker: 'В трекере: цифры краснеют',
        consult: 'На консультации: разбор обычно ждёт следующего контакта',
        heys: 'Куратор смотрит свежий контекст и предлагает простой следующий шаг',
    },
    {
        label: 'Нужно понять причину',
        tracker: 'В трекере: отдельный день и графики',
        consult: 'На консультации: фрагменты из заметок, чата и памяти',
        heys: 'Единая история недели — питание, сон, нагрузка и ритм',
    },
    {
        label: 'Между решениями',
        tracker: 'В трекере: напоминания и самоконтроль',
        consult: 'На консультации: сильная точка контакта, но меньше повседневной картины',
        heys: 'Куратор держит контекст между днями и видит сдвиги раньше',
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
                    <div
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
                            Когда день идёт не по плану, важен не ещё один график
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-[15px] sm:text-[17px] font-normal leading-relaxed text-gray-500">
                            Трекер показывает цифры. Консультация помогает на встрече.
                            HEYS берёт на себя другой участок: ежедневное ведение и контекст
                            между решениями.
                        </p>
                    </div>

                    <div
                        className={`space-y-4 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        {scenarios.map((scenario) => (
                            <div
                                key={scenario.label}
                                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                            >
                                <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                                    <h3 className="text-[17px] font-semibold leading-snug text-gray-900">
                                        {scenario.label}
                                    </h3>
                                </div>
                                <div className="grid gap-0 md:grid-cols-[1fr_1.08fr]">
                                    <div className="divide-y divide-slate-100 bg-slate-50/60">
                                        <div className="px-5 py-4 sm:px-6">
                                            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                                Трекер
                                            </div>
                                            <p className="text-[14px] leading-relaxed text-gray-600">
                                                {scenario.tracker}
                                            </p>
                                        </div>
                                        <div className="px-5 py-4 sm:px-6">
                                            <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                                Консультация
                                            </div>
                                            <p className="text-[14px] leading-relaxed text-gray-600">
                                                {scenario.consult}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="border-t border-blue-100 bg-[#EFF6FF] px-5 py-5 sm:px-6 md:border-l md:border-t-0">
                                        <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-[#1D70B7]">
                                            HEYS
                                        </div>
                                        <p className="text-[15px] font-semibold leading-relaxed text-gray-900">
                                            {scenario.heys}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div
                            className="rounded-2xl border border-[#D7E7F5] bg-white px-5 py-5 text-center shadow-sm sm:px-8"
                            style={{ transitionDelay: `${260 + scenarios.length * 80}ms` }}
                        >
                            <p className="text-[16px] font-semibold leading-snug text-gray-900">
                                HEYS не спорит с трекерами и консультациями.
                            </p>
                            <p className="mt-2 text-[14px] leading-relaxed text-gray-500">
                                Он берёт на себя участок, который обычно остаётся между ними:
                                ежедневное ведение, свежий контекст и спокойный следующий шаг.
                            </p>
                        </div>
                        <p className="px-1 text-sm leading-relaxed text-gray-500">
                            HEYS не заменяет врача или нутрициолога при медицинских показаниях.
                            Отличие — в формате ежедневного ведения и единой истории.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
