// HowItWorksSection.tsx — «4 шага к предсказуемому результату»
// COPY_FINAL v3.0, Секция 3
// Заменяет 4 тяжёлых блока: ContextSection, DecisionsSection, SupportSection, ControlSection

'use client'

import { useEffect, useRef, useState } from 'react'

const STEPS = [
    {
        number: '01',
        label: 'ВИЖУ',
        headline: 'Полная прозрачность. Без лишних усилий.',
        body: 'Вы просто живёте как обычно. Данные собираются органично в течение дня с минимальными вашими усилиями: питание, сон, активность, стресс и самочувствие складываются в единую картину. 98% рутины берёт на себя куратор, а вы сразу замечаете, что усиливает результат и что мешает двигаться вперёд.',
        icon: '👁',
        accent: 'bg-blue-50 border-blue-100',
        badgeColor: 'bg-blue-600',
    },
    {
        number: '02',
        label: 'ПОНИМАЮ',
        headline: 'Понимаете, что работает именно у вас.',
        body: 'На основе собранных данных вы ясно видите: какие действия дают результат, а какие тормозят прогресс. Вместе с куратором вы усиливаете рабочие паттерны и мягко корректируете те, где теряется импульс — всё это на базе сотен метрик, а не догадок.',
        icon: '💡',
        accent: 'bg-green-50 border-green-100',
        badgeColor: 'bg-green-600',
    },
    {
        number: '03',
        label: 'НЕ ОДИН',
        headline: 'Живой человек рядом. Не бот.',
        body: 'В одиночку легко выгореть и бросить. С куратором — совсем другой опыт: вы чувствуете, что в ваш процесс реально вовлечены. Это как тренироваться с напарником: появляется энергия, дисциплина и внутренний драйв продолжать, даже когда настроение проседает.',
        icon: '🤝',
        accent: 'bg-orange-50 border-orange-100',
        badgeColor: 'bg-orange-500',
    },
    {
        number: '04',
        label: 'РЕЗУЛЬТАТ',
        headline: 'Устойчивые изменения без выгорания.',
        body: 'Система + куратор выстраивают бережный процесс, где правильные действия становятся естественными. Это не диета с датой окончания — это новое качество жизни.',
        icon: '🎯',
        accent: 'bg-purple-50 border-purple-100',
        badgeColor: 'bg-purple-600',
    },
]

export default function HowItWorksSection() {
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
            { threshold: 0.05 }
        )
        if (sectionRef.current) observer.observe(sectionRef.current)
        return () => observer.disconnect()
    }, [])

    return (
        <section ref={sectionRef} id="how-it-works" className="pb-16 md:pb-20 bg-white relative">
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-y border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">02 — КАК ЭТО РАБОТАЕТ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6 pt-10">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <div
                        className={`text-center mb-14 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                    >
                        <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                            4 шага к{' '}
                            <span className="text-blue-600">предсказуемому результату</span>
                        </h2>
                        <p className="text-gray-500 text-base md:text-lg max-w-xl mx-auto">
                            Простой процесс — вы не одни на каждом шаге
                        </p>
                    </div>

                    {/* Steps */}
                    <div className="space-y-5">
                        {STEPS.map((step, index) => (
                            <div
                                key={step.number}
                                className={`rounded-2xl border ${step.accent} p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
                                style={{ transitionDelay: `${150 + index * 120}ms` }}
                            >
                                <div className="flex items-start gap-5">
                                    {/* Number badge */}
                                    <div
                                        className={`flex-shrink-0 w-12 h-12 rounded-xl ${step.badgeColor} flex items-center justify-center`}
                                    >
                                        <span className="text-xl">{step.icon}</span>
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">
                                                {step.number}
                                            </span>
                                            <span className="text-xs font-bold tracking-widest text-gray-400 uppercase">
                                                —
                                            </span>
                                            <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                                                {step.label}
                                            </span>
                                        </div>
                                        <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 leading-snug">
                                            {step.headline}
                                        </h3>
                                        <p className="text-gray-600 leading-relaxed text-[15px]">{step.body}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <div
                        className={`text-center mt-12 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                        style={{ transitionDelay: '650ms' }}
                    >
                        <a
                            href="#trial"
                            className="inline-flex items-center justify-center px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-2xl hover:bg-blue-700 active:scale-95 transition-all text-[15px] tracking-wide shadow-lg shadow-blue-600/25"
                        >
                            Начать бесплатный период
                        </a>
                        <p className="mt-3 text-sm text-gray-400">Без карты. Без автосписаний.</p>
                    </div>
                </div>
            </div>
        </section>
    )
}
