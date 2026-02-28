// ObjectionsSection.tsx — Секция "Частые сомнения"
// Anchor: #objections
// 4 продающих возражения в формате аккордеон (отдельно от FAQ)

'use client'

import { useEffect, useRef, useState } from 'react'

const objections = [
    {
        question: 'Что будет, если я сорвусь и съем пиццу на ночь?',
        answer:
            'Ничего страшного. Ваш куратор — не школьный учитель с указкой. Наш подход — абсолютный ноль осуждения. Срыв для нас — это не проблема вашей силы воли, а системный сигнал. Мы просто найдем причину (например, вчерашний недосып или долгий перерыв между приемами пищи) и мягко скорректируем план на следующий день.',
    },
    {
        question: '«У меня нет времени всё взвешивать и вносить в приложение»',
        answer:
            'Вам и не придется. В HEYS вам не нужно собирать пазлы из калорий, взвешивать еду до грамма или заполнять бесконечные таблицы. Ваше участие — 3 минуты в день: просто сфотографируйте еду и скиньте в Telegram. Всю рутину, расчёты, ведение дневника и аналитику берет на себя ваш личный куратор и наши алгоритмы.',
    },
    {
        question: 'Придется ли мне готовить себе отдельно от семьи?',
        answer:
            'Нет. HEYS не выдает жестких меню в стиле «гречка с грудкой». Мы работаем с тем, что вы уже едите — будь то бизнес-ланч в ресторане, ужин с семьей или заказ из доставки. Куратор подскажет, как правильно скомбинировать продукты из вашей привычной тарелки, чтобы получить нужный результат.',
    },
    {
        question: '«Я уже всё пробовал: диеты, марафоны, приложения. Ничего не работает»',
        answer:
            'Стандартные подходы не работают, потому что оставляют вас один на один с жестким шаблоном. Как только случается стресс или поездка — шаблон рушится. В HEYS вас поддерживает живой человек, который каждый день адаптирует систему под ваш график и состояние. Мы выстраиваем процесс, где правильные решения становятся лёгкими.',
    },
    {
        question: 'А если у меня частые командировки и непредсказуемый график?',
        answer:
            'Именно в таких случаях HEYS работает лучше всего. Куратор заранее учтет ваш перелет, смену часовых поясов и питание в отелях. Если вы не успеваете пообедать, он быстро пришлет варианты перекуса из ближайшей кофейни. Система подстраивается под вашу жизнь, а не наоборот.',
    },
    {
        question: '«Действительно ли это стоит своих денег?»',
        answer:
            'Оплачивая HEYS, вы покупаете не просто доступ к приложению, а личного project-менеджера по вашему здоровью. Он экономит десятки часов вашего времени, ограждает от противоречивой информации из интернета и уберегает от бесполезных трат на неработающие добавки и очередные марафоны.',
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
            className="py-16 md:py-20 bg-white relative"
        >
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">06 — ЧАСТЫЕ СОМНЕНИЯ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6">
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
