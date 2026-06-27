// TrustSection.tsx — Секция "Доверие"
// Anchor: #trust
// Реальный стартовый proof: опыт куратора, стандарт ведения, первый набор.

'use client'

import { useEffect, useRef, useState } from 'react'

import SectionBadgeBar from '@/components/SectionBadgeBar'

const principles = [
    {
        title: 'Опыт куратора',
        desc: 'С вами работает куратор HEYS с опытом 20+ лет в питании и сопровождении.',
    },
    {
        title: 'Правильный вход в работу',
        desc: 'Куратор собирает внесённые данные в карту недели и разбирает её с вами в удобном формате: что сработало, где сбивался ритм и какой шаг взять дальше.',
    },
    {
        title: 'Ограниченное число участников',
        desc: 'У куратора ограниченное число участников в ведении, чтобы он мог вникнуть в ритм недели и обстоятельства жизни каждого.',
    },
]

export default function TrustSection() {
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
            id="trust"
            className="pb-16 md:pb-20 bg-slate-50 relative"
        >
            <SectionBadgeBar>06 — ПРИНЦИПЫ РАБОТЫ</SectionBadgeBar>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        За неделю становится понятнее, что происходит
                    </h2>
                    <p
                        className={`text-gray-600 text-center mb-12 max-w-2xl mx-auto leading-relaxed transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '100ms' }}
                    >
                        На первой неделе куратор ведёт дневник по вашим данным,
                        собирает контекст и показывает в HEYS, где день начинает
                        сбиваться.
                    </p>

                    {/* Block — 3 trust points */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <h3 className="px-5 text-base md:text-lg font-bold text-gray-900 mb-4">
                            Что повышает вероятность результата
                        </h3>

                        <div className="grid md:grid-cols-3 gap-4">
                            {principles.map((p, index) => (
                                <div
                                    key={index}
                                    className={`bg-slate-50 rounded-xl border border-slate-100 p-5 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                                        }`}
                                    style={{ transitionDelay: `${400 + index * 150}ms` }}
                                >
                                    <div className="mb-4 h-1 w-8 rounded-full bg-[#52A0D8]/70" />
                                    <h4 className="font-semibold text-gray-900 mb-1">{p.title}</h4>
                                    <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </section>
    )
}
