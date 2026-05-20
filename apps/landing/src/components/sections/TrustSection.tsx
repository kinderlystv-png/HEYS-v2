// TrustSection.tsx — Секция "Фундамент"
// Anchor: #trust
// Наука + 3 принципа системы (кураторский блок переехал в CuratorSection)

'use client'

import { useEffect, useRef, useState } from 'react'

const principles = [
    {
        number: '1',
        title: 'Ноль наказания.',
        desc: 'Срыв — не ваша вина, а сигнал пересмотреть план.',
    },
    {
        number: '2',
        title: 'Система вместо силы воли.',
        desc: 'Мы не мотивируем — мы выстраиваем процесс, где правильные решения становятся лёгкими.',
    },
    {
        number: '3',
        title: 'Данные вместо догадок.',
        desc: 'Каждый совет основан на ваших реальных показателях, а не на общих правилах.',
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
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/95 border-y border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">06 — ПРИНЦИПЫ РАБОТЫ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6 pt-10">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Принципы работы
                    </h2>
                    <p
                        className={`text-gray-600 text-center mb-12 max-w-2xl mx-auto leading-relaxed transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '100ms' }}
                    >
                        Наука и три принципа, на которых держится формат.
                    </p>

                    {/* Block 1 — Science */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 mb-6 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2">
                            Биохимия вместо силы воли
                        </h3>
                        <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                            За каждой рекомендацией HEYS стоят тысячи актуальных клинических исследований (PubMed). Система видит скрытые каскады: как вчерашний стресс запускает сегодняшнюю тягу к перееданию. Никакой магии и мифов из интернета — только точные законы физиологии, переведённые в понятные и своевременные для вас шаги.
                        </p>
                    </div>

                    {/* Block 2 — 3 Principles */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '400ms' }}
                    >
                        <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4">
                            Что для нас важно
                        </h3>

                        <div className="grid sm:grid-cols-3 gap-4">
                            {principles.map((p, index) => (
                                <div
                                    key={index}
                                    className={`bg-blue-50/50 rounded-xl p-5 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                                        }`}
                                    style={{ transitionDelay: `${600 + index * 150}ms` }}
                                >
                                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm mb-3">
                                        {p.number}
                                    </div>
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
