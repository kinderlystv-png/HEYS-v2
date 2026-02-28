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

function CRSScaleBlock({ isVisible, isOpen, onToggle }: { isVisible: boolean, isOpen: boolean, onToggle: () => void }) {
    return (
        <div
            className={`rounded-[2rem] bg-indigo-50/40 border border-indigo-100 p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer hover:shadow-md hover:bg-indigo-50/70 hover:border-indigo-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: '200ms' }}
            onClick={onToggle}
            aria-expanded={isOpen}
            role="button"
            tabIndex={0}
        >
            <div className="flex justify-between items-start gap-5">
                <div>
                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
                        Измеряем вашу реальность, а не шаблонный идеал.
                    </h3>
                    <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100 mt-2'}`}>
                        <p className="text-gray-600 text-sm md:text-base overflow-hidden">
                            Пока другие приложения сравнивают вас с выдуманной нормой — мы строим картину именно вашего организма.
                        </p>
                    </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-1.5 mt-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 ${isOpen ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-white/70 border-indigo-200 text-indigo-500 hover:bg-indigo-50'}`}>
                        <span className="text-xs font-semibold whitespace-nowrap">{isOpen ? 'Свернуть' : 'Подробнее'}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-500 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>
            </div>

            <div className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                <div className="overflow-hidden">
                    <p className="text-gray-600 mb-4 leading-relaxed">
                        Обычные фитнес-приложения сравнивают вас с шаблонным «идеалом». HEYS оценивает 10 факторов (от качества сна до гормезиса), изучает <strong className="font-semibold text-gray-900">ваши последние 14 дней</strong> и строит персональный baseline. Ваш «импульс» высчитывается непрерывно.
                    </p>

                    {/* CRS Scale — animated bars */}
                    <div className="space-y-3">
                        {crsLevels.map((level, index) => (
                            <div
                                key={index}
                                className={`flex items-center gap-5 transition-all duration-500 ease-out ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                                style={{ transitionDelay: isOpen ? `${100 + index * 80}ms` : '0ms' }}
                            >
                                <div
                                    className={`${level.color} h-3 rounded-full transition-all duration-700 ease-out`}
                                    style={{
                                        width: isOpen ? `${100 - index * 15}%` : '0%',
                                        maxWidth: '120px',
                                        transitionDelay: isOpen ? `${200 + index * 80}ms` : '0ms',
                                    }}
                                />
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-semibold text-gray-900">{level.label}</span>
                                    <span className="text-sm text-gray-500"> — {level.desc}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="mt-6 text-sm text-gray-500 italic bg-white/50 p-5 rounded-xl border border-white/60">
                        Обычное приложение жестко говорит: «сегодня ты молодец, а вчера плохой».
                        Система каскадов HEYS изучает непрерывные графики: мы видим перекосы кортизола и спасаем вас без жестких диет.
                    </p>
                </div>
            </div>
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

function CausesBlock({ isVisible, isOpen, onToggle }: { isVisible: boolean, isOpen: boolean, onToggle: () => void }) {
    return (
        <div
            className={`rounded-[2rem] bg-emerald-50/40 border border-emerald-100 p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer hover:shadow-md hover:bg-emerald-50/70 hover:border-emerald-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: '300ms' }}
            onClick={onToggle}
            aria-expanded={isOpen}
            role="button"
            tabIndex={0}
        >
            <div className="flex justify-between items-start gap-5">
                <div>
                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
                        Сила воли ни при чём. Ищем причину в биохимии.
                    </h3>
                    <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100 mt-2'}`}>
                        <p className="text-gray-600 text-sm md:text-base overflow-hidden">
                            Вечерняя тяга к сладкому — это не ваша слабость, а следствие недосыпа или накопленного стресса.
                        </p>
                    </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-1.5 mt-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 ${isOpen ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-white/70 border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                        <span className="text-xs font-semibold whitespace-nowrap">{isOpen ? 'Свернуть' : 'Подробнее'}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-500 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>
            </div>

            <div className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                <div className="overflow-hidden">
                    <p className="text-gray-600 mb-4 leading-relaxed">
                        Калорий в вакууме не существует. Алгоритм учитывает вашу <strong className="font-semibold text-gray-900">аллостатическую нагрузку</strong> (накопленный стресс) и гормональные ритмы:
                    </p>

                    <div className="space-y-3">
                        {causeExamples.map((item, index) => (
                            <div
                                key={index}
                                className={`flex items-start gap-5 bg-white/60 rounded-xl p-5 transition-all duration-700 ease-out border border-emerald-50/50 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                style={{ transitionDelay: isOpen ? `${100 + index * 100}ms` : '0ms' }}
                            >
                                <span className="text-xl flex-shrink-0">{item.icon}</span>
                                <p className="text-gray-700 text-sm md:text-base italic leading-relaxed">{item.text}</p>
                            </div>
                        ))}
                    </div>

                    <p className="mt-6 text-gray-600 text-sm leading-relaxed bg-emerald-50/30 p-5 rounded-xl border border-emerald-100/50">
                        Главный вопрос замученного диетами человека — «почему у меня не получается?».
                        Обычный ответ: «мало силы воли». Реальный ответ: недосып вызывает голод, а стресс
                        вызывает тягу к сладкому. HEYS даёт этот реальный ответ.
                    </p>
                </div>
            </div>
        </div>
    )
}

/* ──────────────────────────── No Punishment Block (Block 3) ──────────────────────────── */

const noPunishmentItems = [
    {
        icon: '🍽',
        title: 'Переели?',
        text: 'Система НЕ заставит вас голодать завтра. Коррекция настолько мягкая, что вы её не заметитите — и большую часть система предложит компенсировать через активность.',
    },
    {
        icon: '📊',
        title: 'Недоели вчера?',
        text: 'Система восполнит дефицит плавно. Потому что тело уже в режиме стресса — если резко добавить еды, запустится каскад запасания в жир.',
    },
    {
        icon: '🎉',
        title: 'Осознанный «загруз»?',
        text: 'Кнопка «Refeed Day» — это стратегия, а не срыв. Праздник, день после тренировки или ментальная разгрузка — система адаптирует расчёты.',
    },
    {
        icon: '🔥',
        title: 'Серия хороших дней?',
        text: 'Один плохой день НЕ ломает вашу серию. Мы оцениваем тренд и динамику, а не отдельные точки спада.',
    },
]

function NoPunishmentBlock({ isVisible, isOpen, onToggle }: { isVisible: boolean, isOpen: boolean, onToggle: () => void }) {
    return (
        <div
            className={`rounded-[2rem] bg-amber-50/40 border border-amber-100 p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer hover:shadow-md hover:bg-amber-50/70 hover:border-amber-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: '400ms' }}
            onClick={onToggle}
            aria-expanded={isOpen}
            role="button"
            tabIndex={0}
        >
            <div className="flex justify-between items-start gap-5">
                <div>
                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
                        Предвидим откаты. И никогда за них не наказываем.
                    </h3>
                    <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100 mt-2'}`}>
                        <p className="text-gray-600 text-sm md:text-base overflow-hidden">
                            HEYS видит риск выгорания за 3 дня. А если вы переели — не заставит голодать завтра, а плавно скорректирует курс.
                        </p>
                    </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-1.5 mt-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 ${isOpen ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-white/70 border-amber-200 text-amber-600 hover:bg-amber-50'}`}>
                        <span className="text-xs font-semibold whitespace-nowrap">{isOpen ? 'Свернуть' : 'Подробнее'}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-500 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>
            </div>

            <div className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                <div className="overflow-hidden">
                    <p className="text-gray-600 mb-4 leading-relaxed">
                        Доказано: резкая компенсация недоедания уйдет в жир, а упреки приведут к срыву. Оценивая кумулятивный стресс, мы рассчитываем <strong className="font-semibold text-gray-900">Crash Risk Score</strong> за 3 дня до потенциальной ямы:
                    </p>

                    <div className="grid sm:grid-cols-2 gap-5">
                        {noPunishmentItems.map((item, index) => (
                            <div
                                key={index}
                                className={`bg-white/60 rounded-xl p-5 transition-all duration-700 ease-out border border-amber-50/50 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                                style={{ transitionDelay: isOpen ? `${100 + index * 80}ms` : '0ms' }}
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xl">{item.icon}</span>
                                    <h4 className="font-semibold text-gray-900">{item.title}</h4>
                                </div>
                                <p className="text-gray-600 text-sm leading-relaxed">{item.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ──────────────────────────── Insulin Wave Block (Block 4) ──────────────────────────── */

function InsulinWaveBlock({ isVisible, isOpen, onToggle }: { isVisible: boolean, isOpen: boolean, onToggle: () => void }) {
    const [secondsLeft, setSecondsLeft] = useState(3 * 3600 + 30 * 60 + 48) // 03:30:48
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (!isOpen) return
        intervalRef.current = setInterval(() => {
            setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0))
        }, 1000)
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
    }, [isOpen])

    const h = Math.floor(secondsLeft / 3600).toString().padStart(2, '0')
    const m = Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0')
    const s = (secondsLeft % 60).toString().padStart(2, '0')

    return (
        <div
            className={`rounded-[2rem] bg-sky-50/40 border border-sky-100 p-5 sm:p-6 transition-all duration-700 ease-out cursor-pointer hover:shadow-md hover:bg-sky-50/70 hover:border-sky-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: '500ms' }}
            onClick={onToggle}
            aria-expanded={isOpen}
            role="button"
            tabIndex={0}
        >
            <div className="flex justify-between items-start gap-5">
                <div>
                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
                        Инсулиновая волна: точная математика жиросжигания.
                    </h3>
                    <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100 mt-2'}`}>
                        <p className="text-gray-600 text-sm md:text-base overflow-hidden">
                            Система знает: одни и те же калории могут дать энергию или уйти в жир. Мы вычисляем идеальные окна усвоения для вас.
                        </p>
                    </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-center gap-1.5 mt-1">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all duration-300 ${isOpen ? 'bg-sky-100 border-sky-200 text-sky-700' : 'bg-white/70 border-sky-200 text-sky-600 hover:bg-sky-50'}`}>
                        <span className="text-xs font-semibold whitespace-nowrap">{isOpen ? 'Свернуть' : 'Подробнее'}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-500 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                </div>
            </div>

            <div className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 mt-6' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                <div className="overflow-hidden">
                    <div className="flex flex-col xl:flex-row gap-8 items-start">
                        <div className="flex-1">
                            <p className="text-gray-600 mb-4 leading-relaxed mt-2">
                                После каждого приёма пищи тело сначала запасает энергию, а потом возвращается к сжиганию жира. Обычные диеты говорят: «не ешь после 18:00» или «окошко 2 часа».
                            </p>
                            <p className="text-gray-600 mb-4 leading-relaxed">
                                HEYS не гадает. Система выстраивает <strong className="font-semibold text-gray-900">Инсулиновую волну</strong> индивидуально для каждого приёма пищи по <strong className="font-semibold text-gray-900">37 параметрам</strong>
                                {' '}(БЖУ, клетчатка, гликемический индекс, текущий стресс и качество сна).
                            </p>
                            <ul className="space-y-3 mb-4 bg-white/50 p-5 rounded-2xl border border-sky-50">
                                <li className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="text-orange-500 mt-0.5">⚡</span>
                                    <span><b>Быстрые (Углеводный пик):</b> первая реакция на сладкое/быстрые углеводы.</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="text-green-500 mt-0.5">🌿</span>
                                    <span><b>Основной (Пищеварительный):</b> переваривание сложных углеводов и жиров.</span>
                                </li>
                                <li className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="text-purple-500 mt-0.5">🫀</span>
                                    <span><b>Печёночный (Белковый):</b> долгий хвост усвоения протеина.</span>
                                </li>
                            </ul>
                            <p className="text-sm text-gray-600 italic border-l-2 border-sky-300 pl-3">
                                Вы точно знаете, когда уровень инсулина опустится, и тело начнёт работать на вас.
                            </p>
                        </div>

                        {/* UI Mockup of the App */}
                        <div className={`w-full max-w-sm flex-shrink-0 bg-slate-50 p-5 rounded-3xl shadow-inner border border-slate-200 relative overflow-hidden transition-all duration-700 delay-300 ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}>

                            {/* Header inside the mock */}
                            <div className="flex items-center gap-2 mb-4 px-2 text-slate-700 font-semibold text-sm">
                                <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M2 12h4l3-9 5 18 3-9h5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Инсулиновая волна
                                <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>

                            {/* Blue Card */}
                            <div className="bg-[#3B82F6] rounded-2xl p-6 text-white shadow-lg relative z-10">
                                <div className="text-center mb-4">
                                    <div className="text-blue-100 text-sm font-medium mb-4 flex items-center justify-center gap-1.5">
                                        ⏱ Жиросжигание начнётся через
                                    </div>
                                    <div className="flex items-end justify-center gap-1 font-mono font-bold tracking-tight">
                                        <div className="flex flex-col items-center">
                                            <span className="text-5xl">{h}</span>
                                            <span className="text-[10px] text-blue-200 mt-1 uppercase font-sans">часов</span>
                                        </div>
                                        <span className="text-3xl mb-4 opacity-75">:</span>
                                        <div className="flex flex-col items-center">
                                            <span className="text-5xl">{m}</span>
                                            <span className="text-[10px] text-blue-200 mt-1 uppercase font-sans">минут</span>
                                        </div>
                                        <span className="text-3xl mb-4 opacity-75">:</span>
                                        <div className="flex flex-col items-center">
                                            <span className="text-5xl">{s}</span>
                                            <span className="text-[10px] text-blue-200 mt-1 uppercase font-sans">секунд</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Chart Area inside Blue Card */}
                                <div className="bg-white/10 rounded-xl p-5 relative h-32 border border-white/20 backdrop-blur-sm">
                                    {/* Dummy Graph Line */}
                                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 100">
                                        {/* Guideline */}
                                        <line x1="20" y1="80" x2="180" y2="80" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="4 4" />
                                        {/* Curve */}
                                        <path d="M 20,80 C 40,40 50,30 60,35 C 80,45 90,65 100,60 C 130,50 150,70 180,80" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />

                                        {/* Vertical "Now" line */}
                                        <line x1="60" y1="35" x2="60" y2="80" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="2 2" />

                                        {/* Dots */}
                                        {/* Fast */}
                                        <circle cx="60" cy="35" r="4" fill="#F97316" stroke="white" strokeWidth="2" />
                                        <circle cx="60" cy="35" r="10" fill="rgba(249,115,22,0.3)" />
                                        {/* Main */}
                                        <circle cx="100" cy="60" r="4" fill="#22C55E" stroke="white" strokeWidth="2" />
                                        {/* Hepatic */}
                                        <circle cx="150" cy="70" r="4" fill="#A855F7" stroke="white" strokeWidth="2" />

                                        {/* Start Time / End Fire */}
                                        <text x="25" y="80" fill="white" fontSize="8" alignmentBaseline="middle">12:15</text>
                                        <text x="175" y="80" fill="white" fontSize="10" alignmentBaseline="middle">🔥</text>
                                    </svg>

                                    <div className="absolute top-2 left-[25%] bg-white text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                        Сейчас
                                    </div>
                                </div>

                                {/* Legend */}
                                <div className="mt-6 flex justify-between items-center text-[11px] font-medium px-1">
                                    <div className="flex gap-1.5 items-center text-orange-200">
                                        <span className="text-orange-400">⚡</span> Быстрые
                                    </div>
                                    <div className="flex gap-1.5 items-center text-green-200">
                                        <span className="text-green-400">🌿</span> Основной
                                    </div>
                                    <div className="flex gap-1.5 items-center text-purple-200">
                                        <span className="text-purple-400">🫀</span> Печёночный
                                    </div>
                                </div>
                            </div>

                            {/* Status White Card */}
                            <div className="bg-white rounded-xl mx-4 -mt-3 relative z-20 shadow-md p-3 flex items-center gap-2 border border-slate-100">
                                <div className="w-1.5 h-6 bg-orange-400 rounded-full"></div>
                                <span className="text-slate-700 font-medium text-sm">Инсулин высокий, жир запасается</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ──────────────────────────── Main Navigator Section ──────────────────────────── */

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
        setOpenIndex(prev => prev === index ? -1 : index)
    }

    return (
        <section
            ref={sectionRef}
            id="navigator"
            className="py-16 md:py-20 bg-white relative"
        >
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">04 — ПОД КАПОТОМ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                    >
                        Мы видим, куда движется ваше поведение.<br />
                        <span className="text-blue-600">И разворачиваем его вовремя.</span>
                    </h2>
                    <p
                        className={`text-gray-600 text-center mb-12 max-w-2xl mx-auto leading-relaxed transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                        style={{ transitionDelay: '100ms' }}
                    >
                        HEYS отслеживает не только что вы едите, а какой паттерн поведения у вас
                        формируется прямо сейчас — положительный или отрицательный. И вмешивается до того, как всё выйдет из-под контроля.
                    </p>

                    {/* 4 blocks (Accordion) */}
                    <div className="space-y-3">
                        <CRSScaleBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 0}
                            onToggle={() => toggleAccordion(0)}
                        />
                        <CausesBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 1}
                            onToggle={() => toggleAccordion(1)}
                        />
                        <NoPunishmentBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 2}
                            onToggle={() => toggleAccordion(2)}
                        />
                        <InsulinWaveBlock
                            isVisible={isVisible}
                            isOpen={openIndex === 3}
                            onToggle={() => toggleAccordion(3)}
                        />
                    </div>

                    {/* CTA */}
                    <div
                        className={`text-center mt-12 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                        style={{ transitionDelay: '600ms' }}
                    >
                        <a
                            href="#trial"
                            className="inline-flex items-center justify-center px-8 py-3.5 bg-blue-600 text-white font-semibold rounded-2xl hover:bg-blue-700 active:scale-95 transition-all text-[15px] tracking-wide shadow-lg shadow-blue-600/25"
                        >
                            Изучить HEYS бесплатно
                        </a>
                        <p className="mt-3 text-sm text-gray-400">7 дней полного доступа. Без привязки карты.</p>
                    </div>
                </div>
            </div>
        </section>
    )
}
