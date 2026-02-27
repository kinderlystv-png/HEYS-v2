// NavigatorSection.tsx — Секция "Поведенческий навигатор"
// Anchor: #navigator
// Главная продающая секция: CRS-шкала, причины, без наказания, инсулиновая волна

'use client'

import { useEffect, useRef, useState } from 'react'

/* ──────────────────────────── CRS Scale (Block 1) ──────────────────────────── */

const crsLevels = [
    { color: 'bg-green-500', label: '🟢 Всё хорошо', desc: 'ваш день идёт отлично, продолжайте' },
    { color: 'bg-yellow-400', label: '🟡 Внимание', desc: 'небольшой перекос, вот что поможет его выровнять' },
    { color: 'bg-orange-500', label: '🟠 Предупреждение', desc: 'формируется негативный паттерн, вот 3 конкретных действия' },
    { color: 'bg-red-500', label: '🔴 Нужен разворот', desc: 'стоп, давайте развернём ситуацию прямо сейчас' },
    { color: 'bg-purple-500', label: '🟣 Поддержка', desc: 'подключается куратор для персональной помощи' },
]

function CRSScaleBlock({ isVisible }: { isVisible: boolean }) {
    return (
        <div
            className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
            style={{ transitionDelay: '200ms' }}
        >
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                Система знает, куда вы движетесь — раньше вас.
            </h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
                Каждые несколько часов HEYS оценивает ваше состояние по 6 факторам: питание,
                распределение еды по дню, белок, эмоциональный фон, история последних 7 дней
                и качество сна. Из этого складывается ваш «импульс» — растущий или падающий.
            </p>

            {/* CRS Scale — animated bars */}
            <div className="space-y-3">
                {crsLevels.map((level, index) => (
                    <div
                        key={index}
                        className={`flex items-center gap-3 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                            }`}
                        style={{ transitionDelay: `${400 + index * 120}ms` }}
                    >
                        <div
                            className={`${level.color} h-3 rounded-full transition-all duration-700 ease-out`}
                            style={{
                                width: isVisible ? `${100 - index * 15}%` : '0%',
                                maxWidth: '120px',
                                transitionDelay: `${500 + index * 120}ms`,
                            }}
                        />
                        <div className="flex-1 min-w-0">
                            <span className="text-sm font-semibold text-gray-900">{level.label}</span>
                            <span className="text-sm text-gray-500"> — {level.desc}</span>
                        </div>
                    </div>
                ))}
            </div>

            <p className="mt-6 text-sm text-gray-500 italic">
                Это как навигатор в машине. Обычное приложение — одометр: показывает, сколько проехали.
                HEYS — навигатор, который видит пробку впереди и предлагает объезд.
            </p>
        </div>
    )
}

/* ──────────────────────────── Causes Block (Block 2) ──────────────────────────── */

const causeExamples = [
    {
        icon: '😴',
        text: '«Вы спали 5 часов. Это повысило кортизол. Поэтому сегодня тянет на сладкое — это не слабость, это биохимия.»',
    },
    {
        icon: '📉',
        text: '«Вы недоели вчера и позавчера. Тело включило режим экономии. Поэтому вечером раздражение и тяга к еде.»',
    },
    {
        icon: '🔄',
        text: '«Поздний ужин → плохой сон → низкая энергия утром → пропуск завтрака → переедание вечером. Вот где разорвать цикл.»',
    },
]

function CausesBlock({ isVisible }: { isVisible: boolean }) {
    return (
        <div
            className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
            style={{ transitionDelay: '400ms' }}
        >
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                Наконец-то ответ на вопрос «ПОЧЕМУ у меня так?»
            </h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
                HEYS не просто показывает «плохой день». Система находит причину
                и объясняет человеческим языком:
            </p>

            <div className="space-y-4">
                {causeExamples.map((item, index) => (
                    <div
                        key={index}
                        className={`flex items-start gap-3 bg-blue-50/50 rounded-xl p-4 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                            }`}
                        style={{ transitionDelay: `${600 + index * 150}ms` }}
                    >
                        <span className="text-xl flex-shrink-0">{item.icon}</span>
                        <p className="text-gray-700 text-sm md:text-base italic leading-relaxed">{item.text}</p>
                    </div>
                ))}
            </div>

            <p className="mt-6 text-gray-600 text-sm leading-relaxed">
                Главный вопрос замученного диетами человека — «почему у меня не получается?».
                Обычный ответ: «мало силы воли». Реальный ответ: недосып вызывает голод, а стресс
                вызывает тягу к сладкому. HEYS даёт этот реальный ответ.
            </p>
        </div>
    )
}

/* ──────────────────────────── No Punishment Block (Block 3) ──────────────────────────── */

const noPunishmentItems = [
    {
        icon: '🍽',
        title: 'Переели?',
        text: 'Система НЕ заставит вас голодать завтра. Коррекция настолько мягкая, что вы её не заметите — и большую часть система предложит компенсировать через активность: прогулку, тренировку.',
    },
    {
        icon: '📊',
        title: 'Недоели?',
        text: 'Система восполнит дефицит постепенно и частично — потому что тело уже адаптировалось, и резкая компенсация уйдёт в жир. Это не мнение — это доказано исследованиями.',
    },
    {
        icon: '🎉',
        title: 'Осознанный «загруз»?',
        text: 'Есть кнопка «Refeed Day» — это не срыв, а стратегия. Праздник, день после тяжёлой тренировки, ментальная разгрузка — система знает и адаптирует все расчёты.',
    },
    {
        icon: '🔥',
        title: 'Серия хороших дней?',
        text: 'Один плохой день НЕ ломает вашу серию. Система оценивает тренд, а не отдельные точки.',
    },
]

function NoPunishmentBlock({ isVisible }: { isVisible: boolean }) {
    return (
        <div
            className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
            style={{ transitionDelay: '600ms' }}
        >
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                Без наказания. Вообще. Никогда.
            </h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
                HEYS не ругает вас за переедание. Ни в каком случае. Обычные приложения
                после переедания: «красная зона», -500 ккал завтра, чувство вины.
                HEYS работает иначе:
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
                {noPunishmentItems.map((item, index) => (
                    <div
                        key={index}
                        className={`bg-green-50/50 rounded-xl p-5 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                            }`}
                        style={{ transitionDelay: `${800 + index * 120}ms` }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">{item.icon}</span>
                            <h4 className="font-semibold text-gray-900">{item.title}</h4>
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed">{item.text}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ──────────────────────────── Insulin Wave Block (Block 4) ──────────────────────────── */

function InsulinWaveBlock({ isVisible }: { isVisible: boolean }) {
    const [minutes, setMinutes] = useState(45)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (!isVisible) return
        // Animated countdown from 45 to 0
        intervalRef.current = setInterval(() => {
            setMinutes((prev) => {
                if (prev <= 0) {
                    if (intervalRef.current) clearInterval(intervalRef.current)
                    return 0
                }
                return prev - 1
            })
        }, 80)
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [isVisible])

    return (
        <div
            className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
            style={{ transitionDelay: '800ms' }}
        >
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                Когда горит жир?
            </h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
                Впервые вы видите это — не по ощущениям, а по науке. После каждого приёма пищи
                тело сначала накапливает, потом переключается в режим сжигания. HEYS рассчитывает
                этот момент персонально для вас — с учётом вашей еды, активности, сна
                и десятков других параметров.
            </p>

            {/* Timer visual */}
            <div className="flex flex-col items-center py-8">
                <div className="relative w-40 h-40 md:w-48 md:h-48">
                    {/* Background ring */}
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="#f3f4f6"
                            strokeWidth="6"
                        />
                        {/* Animated progress ring */}
                        <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="url(#timerGradient)"
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 42}`}
                            strokeDashoffset={`${2 * Math.PI * 42 * (minutes / 45)}`}
                            className="transition-all duration-200 ease-linear"
                        />
                        <defs>
                            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#f97316" />
                                <stop offset="100%" stopColor="#ef4444" />
                            </linearGradient>
                        </defs>
                    </svg>

                    {/* Center text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl md:text-4xl font-bold text-gray-900">
                            {minutes}
                        </span>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">минут</span>
                    </div>
                </div>

                <p className="mt-4 text-lg font-semibold text-gray-900">
                    До жиросжигания — {minutes} минут
                </p>
                <p className="text-sm text-gray-500 mt-1">
                    Это не мотивационная фраза. Это расчёт на основе ваших данных.
                </p>
            </div>
        </div>
    )
}

/* ──────────────────────────── Main Navigator Section ──────────────────────────── */

export default function NavigatorSection() {
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
        <section
            ref={sectionRef}
            id="navigator"
            className="py-20 bg-white"
        >
            <div className="container mx-auto px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Мы видим, куда движется ваше поведение.{' '}
                        <span className="text-blue-600">И разворачиваем его вовремя.</span>
                    </h2>
                    <p
                        className={`text-gray-600 text-center mb-12 max-w-2xl mx-auto leading-relaxed transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '100ms' }}
                    >
                        HEYS отслеживает не только что вы едите, а какой паттерн поведения у вас
                        формируется прямо сейчас — положительный или отрицательный. И вмешивается до того,
                        как всё покатится вниз.
                    </p>

                    {/* 4 blocks */}
                    <div className="space-y-6">
                        <CRSScaleBlock isVisible={isVisible} />
                        <CausesBlock isVisible={isVisible} />
                        <NoPunishmentBlock isVisible={isVisible} />
                        <InsulinWaveBlock isVisible={isVisible} />
                    </div>
                </div>
            </div>
        </section>
    )
}
