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
        text: 'Хотите разобраться в своём теле, но не понимаете, с чего начать',
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
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-y border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">01 — ВАША СИТУАЦИЯ</span>
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
                            Проблема не в вас.<br />
                            <span className="text-blue-600 inline-block mt-2">Проблема в отсутствии системы вокруг вас.</span>
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
