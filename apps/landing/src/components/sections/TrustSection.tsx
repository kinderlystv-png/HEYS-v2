// TrustSection.tsx — Секция "Кто за этим стоит"
// Anchor: #trust
// Заменяет отзывы на старте: куратор, наука, 3 принципа

'use client'

import { useEffect, useRef, useState } from 'react'

const curatorBullets = [
    { icon: '📱', text: 'Ведёт дневник за вас — вы шлёте фото, он вносит данные' },
    { icon: '☀️', text: '3 касания в день — утром план, в обед корректировка, вечером итоги' },
    { icon: '⏱', text: 'Реагирует за 30 минут в рабочее время (09:00–21:00)' },
    { icon: '📹', text: 'Еженедельный видеоразбор 20–45 мин — разбираете, что получилось и что менять' },
    { icon: '🛟', text: 'Приоритетное внимание при срыве — не осуждение, а быстрая коррекция плана' },
]

const principles = [
    {
        number: '1',
        title: 'Ноль наказания.',
        desc: 'Срыв — не ваша вина, а сигнал пересмотреть план.',
    },
    {
        number: '2',
        title: 'Система вместо силы воли.',
        desc: 'Мы не мотивируем — мы выстраиваем процесс, где правильные решения становятся лёгкими.',
    },
    {
        number: '3',
        title: 'Данные вместо догадок.',
        desc: 'Каждый совет основан на ваших реальных показателях, а не на общих правилах.',
    },
]

export default function TrustSection() {
    const [isVisible, setIsVisible] = useState(false)
    const [activeScienceVar, setActiveScienceVar] = useState<number>(1)
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
            id="trust"
            className="pb-16 md:pb-20 bg-slate-50 relative"
        >
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-y border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">05 — ФУНДАМЕНТ РЕЗУЛЬТАТА</span>
            </div>
            <div className="container mx-auto px-4 md:px-6 pt-10">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-lg md:text-2xl lg:text-3xl font-bold text-gray-900 mb-8 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Фундамент HEYS: На чём строится результат
                    </h2>

                    {/* Block 1 — Curator */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 mb-6 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2">
                            Ваш личный куратор
                        </h3>
                        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                            Живой человек. С именем, лицом и эмпатией. Ваш куратор — это не оператор call-центра, читающий по скрипту.
                            Это ваш личный проектный менеджер по здоровью, который ведет ограниченное число клиентов, глубоко погружается в ваш график, стрессы и привычки, и становится главным специалистом конкретно по вашей ситуации.
                        </p>

                        <div className="space-y-3">
                            {curatorBullets.map((item, index) => (
                                <div
                                    key={index}
                                    className={`flex items-start gap-3 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                                        }`}
                                    style={{ transitionDelay: `${400 + index * 100}ms` }}
                                >
                                    <span className="text-base flex-shrink-0">{item.icon}</span>
                                    <span className="text-sm text-gray-700 leading-relaxed">{item.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Block 2 — Science */}
                    <div
                        className={`relative rounded-2xl bg-white border border-gray-200 p-6 md:p-8 mb-6 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '500ms' }}
                    >
                        {/* A/B Test Toggler (Dev Only Visual) */}
                        <div className="absolute top-4 right-4 flex items-center bg-gray-100 rounded-full p-1 border border-gray-200 shadow-sm z-10 hover:border-gray-300 transition-colors">
                            <button
                                onClick={() => setActiveScienceVar(1)}
                                className={`text-[10px] font-bold px-3 py-1 rounded-full transition-all ${activeScienceVar === 1 ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                V1
                            </button>
                            <button
                                onClick={() => setActiveScienceVar(2)}
                                className={`text-[10px] font-bold px-3 py-1 rounded-full transition-all ${activeScienceVar === 2 ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                V2
                            </button>
                        </div>

                        {activeScienceVar === 1 ? (
                            <>
                                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2 max-w-[80%]">
                                    Наука вместо «авторских диет»
                                </h3>
                                <p className="text-gray-600 leading-relaxed max-w-[95%] text-sm sm:text-base">
                                    Каждая подсказка системы опирается на доказательную медицину (PubMed). Алгоритмы HEYS анализируют не просто вашу еду, а сложные связи между качеством сна, уровнем стресса и метаболизмом. Мы берём строгую физиологию и биохимию тела, чтобы превратить их в простые, заботливые рекомендации на каждый день.
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2 max-w-[80%]">
                                    Биохимия вместо силы воли
                                </h3>
                                <p className="text-gray-600 leading-relaxed max-w-[95%] text-sm sm:text-base">
                                    За каждой рекомендацией HEYS стоят тысячи актуальных клинических исследований (PubMed). Система видит скрытые каскады: как вчерашний стресс запускает сегодняшнюю тягу к перееданию. Никакой магии и мифов из интернета — только точные законы физиологии, переведённые в понятные и своевременные для вас шаги.
                                </p>
                            </>
                        )}
                    </div>

                    {/* Block 3 — 3 Principles */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '700ms' }}
                    >
                        <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4">
                            Ключевые принципы системы
                        </h3>

                        <div className="grid sm:grid-cols-3 gap-4">
                            {principles.map((p, index) => (
                                <div
                                    key={index}
                                    className={`bg-blue-50/50 rounded-xl p-5 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                                        }`}
                                    style={{ transitionDelay: `${900 + index * 150}ms` }}
                                >
                                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm mb-3">
                                        {p.number}
                                    </div>
                                    <h4 className="font-semibold text-gray-900 mb-1">{p.title}</h4>
                                    <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </section>
    )
}
