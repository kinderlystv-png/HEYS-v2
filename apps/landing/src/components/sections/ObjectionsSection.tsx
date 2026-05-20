// ObjectionsSection.tsx — Секция "Частые сомнения"
// Anchor: #objections
// 4 продающих возражения в формате аккордеон (отдельно от FAQ)

'use client'

import { useEffect, useRef, useState } from 'react'

const objections = [
    {
        question: '«У меня нет времени всё взвешивать и вносить в приложение»',
        answer:
            'Вносить — не вам. Взвешивание занимает секунду: ставите еду на весы и шлёте фото куратору (или просто пишете «съел 150г творога»). Дальше его работа — он переносит всё в ваш дневник в приложении, фиксирует тренировки и активность, добавляет новые продукты в вашу персональную базу. На вас остаётся только утренний чекин — вес, самочувствие.',
    },
    {
        question: 'Придётся ли мне готовить себе отдельно от семьи?',
        answer:
            'Нет. У вас нет жёсткого меню вроде «гречка с грудкой» — вы едите свой обычный рацион: бизнес-ланч в ресторане, ужин с семьёй, заказ из доставки. Куратор подсказывает, как комбинировать продукты из вашей привычной тарелки под вашу цель.',
    },
    {
        question: 'А если у меня частые командировки и непредсказуемый график?',
        answer:
            'Куратор учитывает ваш график заранее: перелёт, смену часовых поясов, питание в отелях. Не успеваете нормально пообедать — пишет варианты перекуса из ближайшей кофейни. График подстраивается под вашу жизнь, а не наоборот.',
    },
    {
        question: '«Действительно ли это стоит своих денег?»',
        answer:
            'Вы покупаете не приложение, а куратора, который вникает в вашу ситуацию целиком: график, тренировки, сон, контекст жизни. Он экономит десятки часов вашего времени и ограждает от трат на бесполезные добавки, противоречивые советы из интернета и очередные марафоны.',
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
            className="pb-16 md:pb-20 bg-white relative"
        >
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/95 border-y border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">07 — ЧАСТЫЕ СОМНЕНИЯ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6 pt-10">
                <div className="max-w-3xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Частые сомнения
                    </h2>

                    {/* Accordion */}
                    <div className="space-y-4">
                        {objections.map((item, index) => (
                            <div
                                key={index}
                                className={`rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden transition-all hover:border-blue-100 hover:shadow-md duration-500 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                                    } ${openIndex === index ? 'ring-1 ring-blue-50 bg-blue-50/10' : ''}`}
                                style={{ transitionDelay: `${150 + index * 100}ms` }}
                            >
                                <button
                                    onClick={() => toggleIndex(index)}
                                    className="w-full flex items-center justify-between px-6 py-5 md:py-6 text-left transition-colors"
                                    aria-expanded={openIndex === index}
                                >
                                    <span className="text-gray-900 font-semibold text-base md:text-lg pr-4">
                                        {item.question}
                                    </span>
                                    <div className={`p-2 rounded-full transition-colors ${openIndex === index ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                        <svg
                                            className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 ${openIndex === index ? 'rotate-180 text-blue-600' : 'text-gray-500'
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
                                    </div>
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
