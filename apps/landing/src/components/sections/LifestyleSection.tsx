// LifestyleSection.tsx — Дополнительные инструменты как бонус, не ядро оффера
// Anchor: #lifestyle

'use client'

import { useEffect, useRef, useState } from 'react'

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
            className="relative bg-white py-12 md:py-16"
        >
            <div className="container mx-auto px-4 md:px-6">
                <div className="mx-auto max-w-3xl">
                    <div
                        className={`rounded-3xl border border-blue-100 bg-blue-50/45 px-6 py-8 text-center transition-all duration-700 ease-out md:px-10 md:py-9 ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                    >
                        <span className="mb-4 inline-block rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-600">
                            БОНУС СИСТЕМЫ
                        </span>
                        <h2 className="mb-3 text-xl font-bold leading-tight text-gray-900 md:text-2xl">
                            Дополнительные инструменты — рядом, но не вместо куратора
                        </h2>
                        <p className="mx-auto max-w-xl text-sm leading-relaxed text-gray-600 md:text-base">
                            В HEYS есть хронометраж дня, задачи и настраиваемые виджеты.
                            Они помогают ориентироваться в неделе, но главный формат остаётся
                            тем же: куратор ведёт дневник и держит контекст.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
