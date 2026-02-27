// ObjectionsSection.tsx — Секция "Частые сомнения"
// Anchor: #objections
// 4 продающих возражения в формате аккордеон (отдельно от FAQ)

'use client'

import { useEffect, useRef, useState } from 'react'

const objections = [
    {
        question: '«У меня нет времени на ещё одно приложение»',
        answer:
            'Куратор ведёт дневник за вас. Вам не нужно ничего считать, заполнять таблицы или разбираться в графиках. Ваше участие — 5 минут в день: скинуть фото еды и ответить на пару вопросов. Остальное делает система.',
    },
    {
        question: '«Я уже всё пробовал — ничего не работает»',
        answer:
            'Диеты и приложения не работают, потому что оставляют вас один на один с собой. В HEYS — система + живой человек. Мы не бросаем вас после регистрации. Куратор рядом каждый день, а система предвидит проблемы до того, как вы их заметите.',
    },
    {
        question: '«Дорого»',
        answer:
            'Посчитайте, сколько вы уже потратили на диетологов, фитнес-клубы и добавки, которые не дали устойчивого результата. HEYS — первый сервис, который включает и технологию, и живого человека рядом. Пробный период бесплатный — проверьте без риска.',
    },
    {
        question: '«А вдруг куратор будет меня стыдить за срывы?»',
        answer:
            'Наш подход — ноль осуждения. Срыв — это не проблема клиента, а сигнал системе пересмотреть план. Куратор обучен работать именно так: не мотивировать через вину, а находить причину и корректировать процесс.',
    },
]

export default function ObjectionsSection() {
    const [isVisible, setIsVisible] = useState(false)
    const [openIndex, setOpenIndex] = useState<number | null>(null)
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

    const toggleIndex = (index: number) => {
        setOpenIndex(openIndex === index ? null : index)
    }

    return (
        <section
            ref={sectionRef}
            id="objections"
            className="py-20 bg-white"
        >
            <div className="container mx-auto px-6">
                <div className="max-w-3xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-3xl md:text-4xl font-bold text-gray-900 mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Частые сомнения
                    </h2>

                    {/* Accordion */}
                    <div className="space-y-3">
                        {objections.map((item, index) => (
                            <div
                                key={index}
                                className={`rounded-2xl border border-gray-200 bg-white overflow-hidden transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                    }`}
                                style={{ transitionDelay: `${150 + index * 100}ms` }}
                            >
                                <button
                                    onClick={() => toggleIndex(index)}
                                    className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
                                    aria-expanded={openIndex === index}
                                >
                                    <span className="text-gray-900 font-semibold text-base md:text-lg pr-4">
                                        {item.question}
                                    </span>
                                    <svg
                                        className={`w-5 h-5 flex-shrink-0 text-gray-400 transition-transform duration-300 ${openIndex === index ? 'rotate-180' : ''
                                            }`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 9l-7 7-7-7"
                                        />
                                    </svg>
                                </button>

                                <div
                                    className={`overflow-hidden transition-all duration-300 ease-in-out ${openIndex === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                                        }`}
                                >
                                    <div className="px-6 pb-5">
                                        <p className="text-gray-600 leading-relaxed">{item.answer}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
