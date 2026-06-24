// LifestyleSection.tsx — Дополнительные инструменты как бонус, не ядро оффера
// Anchor: #lifestyle

'use client'

import { useEffect, useRef, useState } from 'react'

const tools = [
    {
        icon: '⏱',
        title: 'Хронометраж дня',
        text: 'Помогает увидеть ритм недели, если вам хочется больше структуры.',
    },
    {
        icon: '✓',
        title: 'Задачник и чек-листы',
        text: 'Для небольших действий, которые поддерживают питание и режим.',
    },
    {
        icon: '🧩',
        title: 'Настраиваемые виджеты',
        text: 'Выбираете, что видеть первым: дневник, динамику, задачи или отчёты.',
    },
]

export default function LifestyleSection() {
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
            id="lifestyle"
            className="relative bg-white py-16 md:py-20"
        >
            <div className="container mx-auto px-4 md:px-6">
                <div className="mx-auto max-w-5xl">
                    <div
                        className={`mx-auto mb-10 max-w-2xl text-center transition-all duration-700 ease-out ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                    >
                        <span className="mb-4 inline-block rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-600">
                            БОНУС СИСТЕМЫ
                        </span>
                        <h2 className="mb-4 text-2xl font-bold leading-tight text-gray-900 md:text-3xl lg:text-4xl">
                            Внутри — не только дневник
                        </h2>
                        <p className="text-base leading-relaxed text-gray-600 md:text-lg">
                            Кроме питания, в приложении есть инструменты для рутины. Хотите —
                            пользуетесь; не хотите — они не мешают главному: куратор ведёт
                            дневник, вы видите картину.
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        {tools.map((tool, index) => (
                            <div
                                key={tool.title}
                                className={`rounded-2xl border border-gray-100 bg-gray-50/80 p-5 transition-all duration-700 ease-out ${
                                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                }`}
                                style={{ transitionDelay: `${150 + index * 100}ms` }}
                            >
                                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                                    {tool.icon}
                                </div>
                                <h3 className="mb-2 text-base font-semibold text-gray-900">
                                    {tool.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-gray-600">{tool.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
