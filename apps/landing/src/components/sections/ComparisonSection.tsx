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

            <SectionBadgeBar>04 — СРАВНЕНИЕ ФОРМАТОВ</SectionBadgeBar>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <div
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-8 md:mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 leading-tight">
                            Трекер и разбор специалиста — в одном формате
                        </h2>
                    </div>

                    <div
                        className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <div className="space-y-5">
                            <div className="py-1 text-center">
                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                    Пример
                                </p>
                                <h3 className="mt-2 text-xl font-bold leading-snug text-gray-900">
                                    Вечером был срыв
                                </h3>
                            </div>

                            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                <div className="px-4 py-4">
                                    <p className="text-[13px] font-bold uppercase tracking-widest text-[#B45A67]">
                                        Трекер
                                    </p>
                                    <p className="mt-1 text-[15px] leading-relaxed text-gray-600">
                                        В трекере дневник заполняете сами: добавляете продукты и
                                        их количество — и только потом видите цифры. Почему вечер
                                        сбился и что делать дальше, он не объяснит.
                                    </p>
                                </div>
                                <div className="border-t border-slate-100 px-4 py-4">
                                    <p className="text-[13px] font-bold uppercase tracking-widest text-[#A87513]">
                                        Консультация
                                    </p>
                                    <p className="mt-1 text-[15px] leading-relaxed text-gray-600">
                                        Помогает на встрече, но часть деталей недели уже приходится
                                        восстанавливать по памяти.
                                    </p>
                                </div>
                                <div className="border-t border-[#DCEFE5] bg-[#F7FBF8] px-4 py-4">
                                    <p className="text-[13px] font-bold uppercase tracking-widest text-[#16814C]">
                                        HEYS
                                    </p>
                                    <p className="mt-1 text-[15px] font-semibold leading-relaxed text-gray-900">
                                        Вы присылаете фото или короткое сообщение — куратор
                                        переносит данные в дневник, видит контекст недели и помогает
                                        выбрать следующий шаг.
                                    </p>
                                </div>
                            </div>
                        </div>
                        <p className="mt-5 px-4 text-sm leading-relaxed text-gray-500">
                            При медицинских показаниях HEYS не заменяет врача или нутрициолога.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
