// PainSection.tsx — Секция "Знакомо?"
// Anchor: #pain
// 5 болевых точек + переход к решению

'use client'

import { useEffect, useRef, useState } from 'react'

const painPoints = [
    {
        icon: '😴',
        text: 'Утром нет сил, хотя спали 8 часов',
    },
    {
        icon: '⚖️',
        text: 'Вес стоит, хотя вроде едите нормально',
    },
    {
        icon: '🔄',
        text: 'Начинаете диету — держитесь 2 недели — срываетесь — вините себя',
    },
    {
        icon: '📱',
        text: 'Пробовали приложения — бросили через неделю, потому что надоело всё считать',
    },
    {
        icon: '🤷',
        text: 'Хотите разобраться в своём организме, но не понимаете, с чего начать',
    },
]

export default function PainSection() {
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
            id="pain"
            className="pt-10 sm:pt-16 pb-12 sm:pb-20 bg-white relative"
        >
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/95 border-y border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">02 — ВАША СИТУАЦИЯ</span>
            </div>

            <div className="container mx-auto px-6 sm:px-8">
                <div className="max-w-3xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-[26px] sm:text-3xl md:text-4xl font-bold text-gray-900 mb-6 sm:mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Знакомо?
                    </h2>

                    {/* Pain points */}
                    <div className="space-y-3 sm:space-y-4">
                        {painPoints.map((point, index) => (
                            <div
                                key={index}
                                className={`flex items-start gap-3 sm:gap-4 p-4 sm:p-5 rounded-2xl bg-gray-50/80 border border-gray-100 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                    }`}
                                style={{ transitionDelay: `${150 + index * 100}ms` }}
                            >
                                <span className="text-xl sm:text-2xl flex-shrink-0 mt-0.5">{point.icon}</span>
                                <p className="text-[#374151] text-[15px] sm:text-lg leading-snug">{point.text}</p>
                            </div>
                        ))}
                    </div>

                    {/* Transition text */}
                    <div
                        className={`mt-10 sm:mt-12 px-6 sm:px-8 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '800ms' }}
                    >
                        <p className="text-[18px] sm:text-xl md:text-2xl font-semibold text-gray-900 leading-snug">
                            Сила воли тут ни при чём.<br />
                            <span className="text-blue-600 inline-block mt-2">Рядом нужен человек, который видит и реагирует.</span>
                        </p>
                    </div>

                    <div
                        className={`mt-8 sm:mt-10 rounded-3xl border border-blue-100 bg-[#F4FAFF] px-5 py-6 sm:px-8 sm:py-7 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '900ms' }}
                    >
                        <p className="text-[18px] sm:text-xl font-semibold text-gray-900 leading-snug">
                            Если узнали себя — начните с недели Pro.
                        </p>
                        <p className="mt-2 text-[14px] sm:text-[15px] text-[#6b7280] leading-relaxed">
                            7 дней сопровождения: куратор ведёт дневник, вы видите картину в HEYS.
                            Без карты и автосписаний.
                        </p>
                        <a
                            href="#trial"
                            className="mt-5 inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[#1D70B7] px-6 py-3 text-[14px] font-semibold tracking-wide text-white shadow-[0_10px_22px_rgba(29,112,183,0.16)] transition-all hover:bg-[#185F9D] active:scale-95"
                        >
                            Оставить заявку на неделю Pro (0 ₽)
                            <span aria-hidden="true">→</span>
                        </a>
                    </div>
                </div>
            </div>
        </section>
    )
}
