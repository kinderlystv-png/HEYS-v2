// CuratorSection.tsx — Как устроено ведение Pro
// Anchor: #curator
// Раскрывает механику: данные → связь → картина недели в HEYS.

'use client'

import { useEffect, useRef, useState } from 'react'

const cards = [
    {
        icon: '👤',
        title: 'Фото и сообщения — в дневнике',
        text: 'Куратор переносит их в HEYS: еду, график, сон, нагрузку и обстоятельства. Без ручного заполнения с вашей стороны.',
    },
    {
        icon: '💬',
        title: 'Связь — как вам удобно',
        text: 'На старте куратор связывается с вами во внешнем канале из заявки. После входа можно перейти во встроенный мессенджер HEYS: всё в одном, контекст рядом с перепиской.',
    },
    {
        icon: '📊',
        title: 'Результат — в HEYS',
        text: 'После переноса вы открываете HEYS и видите дневник, динамику и отчёты недели. Виджеты показывают то, что важно сейчас.',
    },
]

export default function CuratorSection() {
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
            id="curator"
            className="relative pt-10 sm:pt-16 pb-14 sm:pb-20 bg-white"
        >
            <div className="mx-auto w-full max-w-[1024px] px-4 md:px-6">
                {/* Section badge */}
                <div
                    className={`text-center mb-6 sm:mb-8 transition-all duration-700 ease-out ${
                        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                    }`}
                >
                    <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">
                        01 — КАК УСТРОЕНО
                    </span>
                </div>

                {/* H2 + short subline */}
                <div
                    className={`text-center max-w-2xl mx-auto mb-10 sm:mb-14 transition-all duration-700 ease-out ${
                        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                    }`}
                    style={{ transitionDelay: '150ms' }}
                >
                    <h2 className="text-[26px] sm:text-3xl md:text-4xl font-semibold text-gray-900 mb-4 leading-[1.2] text-balance">
                        Дневник не нужно заполнять вручную.
                    </h2>
                    <p className="text-[15px] sm:text-[17px] text-[#6b7280] leading-relaxed">
                        Можно отправить снимок с весов, пару строк или голосовое. Куратор переносит это в HEYS, смотрит на неделю целиком и показывает, где режим начинает сбиваться.
                    </p>
                </div>

                {/* 3 cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-10 sm:mb-12">
                    {cards.map((c, i) => (
                        <div
                            key={c.title}
                            className={`flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-gray-50/80 border border-gray-100 transition-all duration-700 ease-out ${
                                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                            style={{ transitionDelay: `${250 + i * 100}ms` }}
                        >
                            <span className="text-2xl sm:text-3xl flex-shrink-0 mt-0.5">
                                {c.icon}
                            </span>
                            <div>
                                <div className="text-[15px] sm:text-[16px] font-semibold text-[#111827] mb-1 leading-snug">
                                    {c.title}
                                </div>
                                <p className="text-[14px] sm:text-[15px] text-[#6b7280] leading-snug">
                                    {c.text}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Chat-bubble proof — anonymous, shows tone */}
                <div
                    className={`max-w-xl mx-auto mb-10 sm:mb-12 transition-all duration-700 ease-out ${
                        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    style={{ transitionDelay: '700ms' }}
                >
                    <div className="text-[11px] uppercase tracking-widest text-gray-400 text-center mb-3">
                        Пример подхода к разбору
                    </div>
                    <div className="bg-gray-50/60 border border-gray-100 rounded-3xl p-4 sm:p-5 space-y-3">
                        {/* Client bubble (right) */}
                        <div className="flex justify-end">
                            <div className="bg-blue-600 text-white text-[14px] sm:text-[15px] rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] leading-snug shadow-sm">
                                Вчера вечером снова был срыв.
                            </div>
                        </div>
                        {/* Curator bubble (left) */}
                        <div className="flex justify-start">
                            <div className="bg-white text-[#111827] text-[14px] sm:text-[15px] rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[92%] sm:max-w-[85%] leading-snug shadow-sm border border-gray-100">
                                Да, вижу: вечер снова сбился. По дневнику три дня не хватало белка, а ужин уходил поздно. Завтра начнём с простого: добавим полноценный обед и посмотрим вечер.
                            </div>
                        </div>
                        <div className="text-[11px] text-gray-400 text-center pt-1">
                            Иллюстрация метода, не отзыв клиента
                        </div>
                    </div>
                </div>

                {/* Microprinciple */}
                <div
                    className={`text-center max-w-2xl mx-auto mb-6 sm:mb-8 transition-all duration-700 ease-out ${
                        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                    }`}
                    style={{ transitionDelay: '850ms' }}
                >
                    <p className="text-[17px] sm:text-[19px] font-medium text-gray-900 leading-snug text-balance">
                        Вам не нужно открывать приложение после каждого приёма пищи.<br />
                        <span className="text-blue-600">
                            Куратор ведёт дневник, а вы заходите в HEYS и по виджетам видите, как складывается день.
                        </span>
                    </p>
                </div>

                {/* Format declaration — тихая декларация формата работы */}
                <div
                    className={`text-center max-w-xl mx-auto transition-all duration-700 ease-out ${
                        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                    }`}
                    style={{ transitionDelay: '925ms' }}
                >
                    <p className="text-[13px] sm:text-sm text-gray-500 italic leading-relaxed">
                        Первый набор ограничен реальной ёмкостью: так куратор сохраняет внимание к дневнику, тренировкам, сну и ритму недели.
                    </p>
                </div>
            </div>
        </section>
    )
}
