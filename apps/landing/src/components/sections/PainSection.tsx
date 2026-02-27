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
        icon: '📉',
        text: 'Вес стоит, так как организм включил "режим энергосбережения"',
    },
    {
        icon: '⚡',
        text: 'Энергия резко падает в 15:00, и рука сама тянется за сахаром',
    },
    {
        icon: '🔄',
        text: 'Жестко держитесь 2 недели — срываетесь — вините во всем себя',
    },
    {
        icon: '📱',
        text: 'Пробовали приложения — бросили, потому что считать каждый грамм невыносимо',
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
            className="py-16 md:py-20 bg-slate-50 border-y border-slate-200"
        >
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-3xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl font-bold text-gray-900 mb-8 md:mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Знакомо?
                    </h2>

                    {/* Pain points */}
                    <div className="space-y-3 md:space-y-4">
                        {painPoints.map((point, index) => (
                            <div
                                key={index}
                                className={`flex items-start gap-4 p-4 md:p-5 rounded-2xl bg-white border shadow-sm border-gray-200 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                    }`}
                                style={{ transitionDelay: `${150 + index * 100}ms` }}
                            >
                                <span className="text-xl md:text-2xl flex-shrink-0 mt-0.5">{point.icon}</span>
                                <p className="text-gray-700 text-base md:text-lg leading-relaxed">{point.text}</p>
                            </div>
                        ))}
                    </div>

                    {/* Transition text */}
                    <div
                        className={`mt-10 md:mt-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '800ms' }}
                    >
                        <p className="text-base md:text-xl font-semibold text-gray-900 leading-snug">
                            Проблема не в вас.<br className="md:hidden" />{' '}
                            <span className="text-blue-600">Проблема в том, что вы боретесь со своим метаболизмом вслепую.</span>
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
