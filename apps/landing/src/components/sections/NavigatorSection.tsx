// NavigatorSection.tsx — Секция "Под капотом"
// Anchor: #navigator
// Публичная подача RiskRadar без medical-claim и псевдоточных обещаний.

'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

import SectionBadgeBar from '@/components/SectionBadgeBar'

const causeExamples = [
    {
        icon: '😴',
        text: '«Три ночи подряд сон короче обычного, а ужин сдвигается поздно. Сегодня лучше упростить вечер и не требовать идеального дня.»',
    },
    {
        icon: '🍽',
        text: '«Вчера и позавчера пропускался обед. Вечерняя тяга может быть не слабостью, а накопленной усталостью и голодом.»',
    },
    {
        icon: '🔄',
        text: '«Поздний ужин → хуже сон → меньше энергии утром → пропуск завтрака. Начнём с одного звена, а не с запрета всего.»',
    },
]

const correctionItems = [
    {
        icon: '🍽',
        title: 'Если был избыток',
        text: 'Не предлагаем голодать завтра. Куратор смотрит день целиком и выбирает мягкую коррекцию.',
    },
    {
        icon: '📉',
        title: 'Если был дефицит',
        text: 'Не разгоняем качели. Возвращаем питание к нормальному ритму без резких компенсаций.',
    },
    {
        icon: '🎉',
        title: 'Если был гибкий день',
        text: 'Праздник или ужин вне дома не обнуляют прогресс. Система помогает встроить это в неделю.',
    },
    {
        icon: '🧭',
        title: 'Если ритм сбился',
        text: 'Смотрим тренд, а не один эпизод. Важно спокойно выбрать следующий шаг.',
    },
]

const foodWindowItems = [
    'Как состав приёма пищи влияет на ощущение сытости и энергии',
    'Как близко друг к другу стоят приёмы пищи',
    'Что меняется после тренировки, недосыпа или позднего ужина',
]

function RiskRadarWidgetPreview() {
    const size = 180
    const strokeWidth = 26
    const radius = (size - strokeWidth) / 2
    const halfCircumference = Math.PI * radius
    const score = 2
    const progress = (score / 100) * halfCircumference
    const offset = halfCircumference - progress

    return (
        <div className="mx-auto max-w-[280px] rounded-[28px] border border-white/70 bg-gradient-to-br from-[#FFE7D8] via-white to-[#F7FAFF] px-6 py-7 shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
            <div className="relative mx-auto h-[128px] w-[180px]">
                <svg
                    viewBox={`0 0 ${size} ${size / 2 + 26}`}
                    className="absolute inset-x-0 top-0 h-[116px] w-full"
                    aria-hidden="true"
                >
                    <path
                        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
                        fill="none"
                        stroke="rgba(226, 232, 240, 0.95)"
                        strokeLinecap="round"
                        strokeWidth={strokeWidth}
                    />
                    <path
                        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
                        fill="none"
                        stroke="#22C55E"
                        strokeDasharray={halfCircumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        strokeWidth={strokeWidth}
                    />
                </svg>
                <div className="absolute inset-x-0 top-[54px] text-center">
                    <div className="text-[42px] font-bold leading-none text-[#22C55E]">
                        {score}%
                    </div>
                    <div className="mt-1 text-[18px] font-semibold leading-none text-slate-500">
                        Риск-радар
                    </div>
                </div>
            </div>
            <div className="mx-auto mt-3 flex h-12 max-w-[210px] items-center justify-center rounded-full border-2 border-[#22C55E] bg-white/78 px-5 text-[16px] font-bold uppercase tracking-wide text-[#22C55E]">
                Спокойно
            </div>
        </div>
    )
}

function AccordionBlock({
    isVisible,
    isOpen,
    onToggle,
    delay,
    tone,
    title,
    summary,
    children,
}: {
    isVisible: boolean
    isOpen: boolean
    onToggle: () => void
    delay: number
    tone: string
    title: string
    summary: string
    children: ReactNode
}) {
    return (
        <div
            className={`rounded-2xl border p-5 transition-all duration-700 ease-out ${tone} ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
            style={{ transitionDelay: `${delay}ms` }}
        >
            <button
                type="button"
                className="flex w-full items-start justify-between gap-5 text-left"
                onClick={onToggle}
                aria-expanded={isOpen}
            >
                <span>
                    <span className="mb-2 block text-xl font-bold leading-snug text-gray-900 md:text-2xl">
                        {title}
                    </span>
                    <span className="block text-sm leading-relaxed text-gray-600 md:text-base">
                        {summary}
                    </span>
                </span>
                <span className="mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/80 text-gray-500 shadow-sm">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </span>
            </button>

            <div
                className={`grid transition-all duration-500 ease-in-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'
                }`}
            >
                <div className="overflow-hidden">{children}</div>
            </div>
        </div>
    )
}

export default function NavigatorSection() {
    const [isVisible, setIsVisible] = useState(false)
    const [openIndex, setOpenIndex] = useState<number>(-1)
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

    const toggleAccordion = (index: number) => {
        setOpenIndex((current) => (current === index ? -1 : index))
    }

    return (
        <section
            ref={sectionRef}
            id="navigator"
            className="relative bg-white pb-16 md:pb-20"
        >
            <SectionBadgeBar>05 — ПОД КАПОТОМ</SectionBadgeBar>

            <div className="container mx-auto px-4 md:px-6">
                <div className="mx-auto max-w-4xl">
                    <h2
                        className={`mb-4 text-center text-2xl font-bold text-gray-900 transition-all duration-700 ease-out md:text-3xl lg:text-4xl ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                    >
                        Куратор видит, как складывается ваш ритм.
                        <br />
                        <span className="text-blue-600">
                            И помогает мягко скорректировать — заранее.
                        </span>
                    </h2>
                    <p
                        className={`mx-auto mb-12 max-w-2xl text-center leading-relaxed text-gray-600 transition-all duration-700 ease-out ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                        style={{ transitionDelay: '100ms' }}
                    >
                        HEYS собирает питание, сон, активность, стресс и ритм недели в
                        понятную картину. Риск-радар подсвечивает ранний сдвиг, а куратор
                        переводит его в простой следующий шаг.
                    </p>

                    <div className="space-y-3">
                        <AccordionBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 0}
                            onToggle={() => toggleAccordion(0)}
                            delay={200}
                            tone="border-indigo-100 bg-indigo-50/45"
                            title="Риск-радар: ранний сигнал, а не диагноз"
                            summary="HEYS сравнивает текущую неделю с вашим обычным ритмом и показывает куратору, где день начинает требовать внимания."
                        >
                            <div className="grid gap-5 md:grid-cols-[280px_1fr] md:items-center">
                                <RiskRadarWidgetPreview />
                                <div className="space-y-3">
                                    <p className="rounded-xl border border-white/70 bg-white/65 p-4 text-sm leading-relaxed text-gray-600">
                                        Это не диагноз, а рабочая подсказка для куратора:
                                        где ритм держится спокойно, а где накопились сдвиги.
                                    </p>
                                    <p className="rounded-xl border border-white/70 bg-white/65 p-4 text-sm leading-relaxed text-gray-600">
                                        Когда статус меняется, куратор смотрит не на один
                                        процент, а на неделю: питание, сон, нагрузку и
                                        обстоятельства дня.
                                    </p>
                                </div>
                            </div>
                        </AccordionBlock>

                        <AccordionBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 1}
                            onToggle={() => toggleAccordion(1)}
                            delay={300}
                            tone="border-emerald-100 bg-emerald-50/45"
                            title="Ищем причину в режиме недели"
                            summary="Вечерняя тяга, пропуски еды и усталость часто связаны. HEYS помогает увидеть эту связь без обвинений."
                        >
                            <div className="space-y-3">
                                {causeExamples.map((item) => (
                                    <div
                                        key={item.text}
                                        className="flex items-start gap-4 rounded-xl border border-emerald-50 bg-white/65 p-4"
                                    >
                                        <span className="text-xl">{item.icon}</span>
                                        <p className="text-sm italic leading-relaxed text-gray-700 md:text-base">
                                            {item.text}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </AccordionBlock>

                        <AccordionBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 2}
                            onToggle={() => toggleAccordion(2)}
                            delay={400}
                            tone="border-amber-100 bg-amber-50/45"
                            title="Возвращаем ритм без наказания"
                            summary="Если день пошёл не по плану, система не предлагает жёсткую компенсацию. Задача — вернуть ритм, а не усилить качели."
                        >
                            <div className="grid gap-4 sm:grid-cols-2">
                                {correctionItems.map((item) => (
                                    <div
                                        key={item.title}
                                        className="rounded-xl border border-amber-50 bg-white/65 p-4"
                                    >
                                        <div className="mb-3 flex items-center gap-2">
                                            <span className="text-xl">{item.icon}</span>
                                            <h4 className="font-semibold text-gray-900">{item.title}</h4>
                                        </div>
                                        <p className="text-sm leading-relaxed text-gray-600">{item.text}</p>
                                    </div>
                                ))}
                            </div>
                        </AccordionBlock>

                        <AccordionBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 3}
                            onToggle={() => toggleAccordion(3)}
                            delay={500}
                            tone="border-sky-100 bg-sky-50/45"
                            title="Окно после еды — как ориентир, а не таймер"
                            summary="HEYS показывает качественный ориентир: как приёмы пищи накладываются друг на друга и что это значит для планирования дня."
                        >
                            <div className="grid gap-4 md:grid-cols-[1fr_240px]">
                                <div>
                                    <p className="mb-4 text-sm leading-relaxed text-gray-600 md:text-base">
                                        Внутри система учитывает состав еды, интервалы и контекст дня.
                                        На лендинге мы не обещаем секундную точность — показываем, что
                                        куратор видит картину, а не отдельную запись в дневнике.
                                    </p>
                                    <ul className="space-y-2">
                                        {foodWindowItems.map((item) => (
                                            <li key={item} className="flex items-start gap-3 text-sm text-gray-700">
                                                <span className="mt-1 h-2 w-2 rounded-full bg-sky-500" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-blue-700 p-4 text-white shadow-lg">
                                    <div className="mb-4 text-sm font-semibold">Окно дня</div>
                                    <svg viewBox="0 0 220 120" className="h-32 w-full" aria-hidden="true">
                                        <line
                                            x1="20"
                                            y1="94"
                                            x2="200"
                                            y2="94"
                                            stroke="rgba(255,255,255,0.35)"
                                            strokeWidth="1"
                                        />
                                        <path
                                            d="M20 94 C45 38, 70 32, 94 58 C116 82, 135 84, 156 64 C176 45, 190 72, 200 92"
                                            fill="none"
                                            stroke="white"
                                            strokeLinecap="round"
                                            strokeWidth="3"
                                        />
                                        <circle cx="68" cy="40" r="5" fill="#fde68a" />
                                        <circle cx="154" cy="64" r="5" fill="#bbf7d0" />
                                    </svg>
                                    <div className="rounded-xl bg-white/14 p-3 text-xs leading-relaxed text-sky-50">
                                        Ориентир для спокойного планирования: когда лучше
                                        поесть, отдохнуть или упростить вечер.
                                    </div>
                                </div>
                            </div>
                        </AccordionBlock>
                    </div>

                </div>
            </div>
        </section>
    )
}
