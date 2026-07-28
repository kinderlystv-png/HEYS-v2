// TrustSection.tsx — Секция "Доверие"
// Anchor: #trust
// Реальный стартовый proof: опыт куратора, стандарт ведения, первый набор.

'use client'

import { useEffect, useRef, useState } from 'react'

import SectionBadgeBar from '@/components/SectionBadgeBar'

const weekProof = [
    {
        label: 'От вас',
        title: 'Фото и короткий контекст',
        desc: 'Еда, график, сон, нагрузка и обстоятельства обычной недели.',
    },
    {
        label: 'Куратор ведёт',
        title: 'Заполненный дневник',
        desc: 'Приёмы собраны в HEYS, а отдельные эпизоды видны как часть общего ритма.',
    },
    {
        label: 'HEYS собирает',
        title: 'Картину недели',
        desc: 'Питание, режим и обстоятельства видны вместе, а не как разрозненные записи.',
    },
    {
        label: 'Следующий шаг',
        title: 'Разбор и следующий шаг',
        desc: 'Что сработало, где день начинал сбиваться и что реально изменить дальше.',
    },
]

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
            <SectionBadgeBar>06 — ОБЫЧНАЯ НЕДЕЛЯ С HEYS</SectionBadgeBar>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Как проходит обычная неделя с HEYS
                    </h2>
                    <p
                        className={`text-gray-600 text-center mb-12 max-w-2xl mx-auto leading-relaxed transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '100ms' }}
                    >
                        В минутном демо выше показан реальный путь: вы присылаете
                        данные, куратор переносит их в HEYS, а затем помогает
                        выбрать один выполнимый шаг.
                    </p>

                    {/* Block — ordinary week proof */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                            {weekProof.map((item, index) => (
                                <div
                                    key={item.label}
                                    className={`relative rounded-2xl border border-[#DCECF8] bg-[linear-gradient(180deg,#F8FCFF_0%,#FFFFFF_100%)] p-5 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                                        }`}
                                    style={{ transitionDelay: `${300 + index * 120}ms` }}
                                >
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1D70B7]">
                                        {item.label}
                                    </span>
                                    <h3 className="mt-2 font-semibold leading-snug text-gray-900">{item.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.desc}</p>
                                    {index < weekProof.length - 1 ? (
                                        <span className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[#DCECF8] bg-white text-xs text-[#52A0D8] md:flex" aria-hidden="true">→</span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        <div className="mt-5 rounded-2xl border border-[#D9D6ED] bg-[linear-gradient(135deg,#F8F7FC_0%,#F1EFFB_100%)] px-5 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7778A6]">Pro Спорт</p>
                            <p className="mt-2 text-sm font-semibold leading-relaxed text-gray-900 sm:text-base">
                                Питание <span className="text-[#7778A6]">+</span> тренировки <span className="text-[#7778A6]">+</span> восстановление <span className="text-[#7778A6]">→</span> один контекст недели
                            </p>
                            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                                Один специалист ведёт оба дневника и согласует следующий шаг с тем, как прошла реальная неделя.
                            </p>
                        </div>

                        <h3 className="mb-4 mt-8 border-t border-gray-100 px-5 pt-7 text-base font-bold text-gray-900 md:text-lg">
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
