// NavigatorSection.tsx — Секция "Под капотом"
// Anchor: #navigator
// Публичная подача RiskRadar без medical-claim и псевдоточных обещаний.

'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'

const riskLevels = [
    {
        id: 'low',
        color: 'bg-emerald-500',
        label: 'Спокойно',
        text: 'ритм держится, можно продолжать без лишних изменений',
    },
    {
        id: 'guarded',
        color: 'bg-lime-500',
        label: 'Наблюдаем',
        text: 'появился небольшой сдвиг, его лучше не игнорировать',
    },
    {
        id: 'elevated',
        color: 'bg-amber-500',
        label: 'Лучше подстраховаться',
        text: 'сон, еда или нагрузка начинают тянуть день в сторону срыва',
    },
    {
        id: 'high',
        color: 'bg-orange-500',
        label: 'Нужно внимание',
        text: 'накопилось несколько факторов, куратору важно быстро увидеть причину',
    },
    {
        id: 'critical',
        color: 'bg-rose-500',
        label: 'Нужен разбор',
        text: 'система подсвечивает ситуацию для бережной корректировки плана',
    },
]

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
            <div className="sticky top-0 z-[100] mb-8 w-full border-y border-gray-100/50 bg-white/95 px-6 py-3 text-center shadow-sm">
                <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-600">
                    05 — ПОД КАПОТОМ
                </span>
            </div>

            <div className="container mx-auto px-4 pt-10 md:px-6">
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
                        Navigator собирает питание, сон, активность, стресс и ритм недели в
                        понятную картину. RiskRadar подсвечивает ранний сигнал риска, а куратор
                        переводит его в простой следующий шаг.
                    </p>

                    <div className="space-y-3">
                        <AccordionBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 0}
                            onToggle={() => toggleAccordion(0)}
                            delay={200}
                            tone="border-indigo-100 bg-indigo-50/45"
                            title="RiskRadar: ранний сигнал, а не диагноз"
                            summary="Система сравнивает текущую неделю с вашим обычным ритмом и показывает, где лучше вмешаться мягко и вовремя."
                        >
                            <div className="space-y-3">
                                {riskLevels.map((level, index) => (
                                    <div key={level.id} className="flex items-center gap-4">
                                        <div
                                            className={`${level.color} h-3 rounded-full`}
                                            style={{ width: `${118 - index * 16}px` }}
                                        />
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-gray-900">
                                                {level.label}
                                            </div>
                                            <div className="text-sm text-gray-600">{level.text}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-5 rounded-xl border border-white/70 bg-white/65 p-4 text-sm leading-relaxed text-gray-600">
                                Публично это не медицинская шкала. Это рабочий индикатор для
                                куратора: где накопились сдвиги и какой следующий шаг будет
                                самым бережным.
                            </p>
                        </AccordionBlock>

                        <AccordionBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 1}
                            onToggle={() => toggleAccordion(1)}
                            delay={300}
                            tone="border-emerald-100 bg-emerald-50/45"
                            title="Ищем причину в режиме недели"
                            summary="Вечерняя тяга, пропуски еды и усталость часто складываются в цепочку. HEYS помогает увидеть её без обвинений."
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
                            title="Корректируем без наказания"
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
                            title="Окно после еды — без псевдоточного таймера"
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

                    <div
                        className={`mt-12 text-center transition-all duration-700 ease-out ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                        }`}
                        style={{ transitionDelay: '600ms' }}
                    >
                        <a
                            href="#trial"
                            className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-8 py-3.5 text-[15px] font-semibold tracking-wide text-white shadow-lg shadow-blue-600/25 transition-all hover:bg-blue-700 active:scale-95"
                        >
                            Оставить заявку на неделю Pro (0 ₽)
                        </a>
                        <p className="mt-3 text-sm text-gray-400">
                            7 дней сопровождения. Без привязки карты.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}
