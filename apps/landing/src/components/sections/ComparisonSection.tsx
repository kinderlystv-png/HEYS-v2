// ComparisonSection.tsx — Секция "Отличие форматов"
// Anchor: #comparison
// Сценарное сравнение: что происходит в реальной неделе

'use client'

import { useEffect, useRef, useState } from 'react'

import SectionBadgeBar from '@/components/SectionBadgeBar'

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
            className="pb-16 md:pb-20 bg-slate-50 border-y border-slate-200 relative"
        >

            <SectionBadgeBar>04 — ОТЛИЧИЕ ОТ ДИЕТ</SectionBadgeBar>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <div
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
                            Трекер и разбор специалиста — в одном формате
                        </h2>
                        <p className="mx-auto mt-4 max-w-2xl text-[15px] sm:text-[17px] font-normal leading-relaxed text-gray-500">
                            В HEYS остаётся дневник и цифры, но вам не нужно вносить всё
                            вручную. Есть экспертный разбор, но контекст недели не ждёт
                            только одной встречи.
                        </p>
                    </div>

                    <div
                        className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-[#BFE6D2] bg-[#F1FBF6] px-4 py-4 text-center">
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#16814C]">
                                    HEYS
                                </p>
                                <p className="mt-2 text-[16px] font-semibold leading-snug text-gray-900">
                                    Дневник ведётся в приложении, а куратор держит контекст
                                    недели между решениями.
                                </p>
                            </div>

                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-center">
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                    Пример
                                </p>
                                <h3 className="mt-2 text-xl font-bold leading-snug text-gray-900">
                                    Вечером был срыв
                                </h3>
                            </div>

                            <div className="space-y-3">
                                <div className="rounded-2xl border border-[#F3D5DA] bg-[#FFF4F5] px-4 py-4">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#B45A67]">
                                        Трекер
                                    </p>
                                    <p className="mt-1 text-[15px] leading-relaxed text-gray-600">
                                        Показывает красные цифры, но рутину дневника и следующий
                                        шаг приходится держать самому.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-[#F1DCA8] bg-[#FFF9E8] px-4 py-4">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#A87513]">
                                        Консультация
                                    </p>
                                    <p className="mt-1 text-[15px] leading-relaxed text-gray-600">
                                        Помогает на встрече, но часть деталей недели уже приходится
                                        восстанавливать по памяти.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-[#BFE6D2] bg-[#F1FBF6] px-4 py-4">
                                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#16814C]">
                                        HEYS
                                    </p>
                                    <p className="mt-1 text-[15px] font-semibold leading-relaxed text-gray-900">
                                        Куратор видит свежий дневник, сон, нагрузку и ритм недели —
                                        и помогает выбрать спокойный следующий шаг.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <p className="mt-5 px-4 text-sm leading-relaxed text-gray-500">
                            HEYS не заменяет врача или нутрициолога при медицинских показаниях.
                            Отличие — в формате ежедневного ведения и единой истории.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
