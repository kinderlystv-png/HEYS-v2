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
            className="py-16 md:py-20 bg-slate-50 border-y border-slate-200"
        >
            <div className="container mx-auto px-4 md:px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Section header */}
                    <h2
                        className={`text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-12 text-center transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                    >
                        Кто создал HEYS и почему это работает
                    </h2>

                    {/* Block 1 — Curator */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 mb-6 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                            Ваш куратор
                        </h3>
                        <p className="text-gray-600 mb-6 leading-relaxed">
                            Живой человек. С именем, лицом и опытом. Ваш куратор — это не оператор call-центра.
                            Это специалист в области нутрициологии и поведенческих изменений, который ведёт
                            ограниченное число клиентов и знает вашу историю.
                        </p>

                        <div className="space-y-3">
                            {curatorBullets.map((item, index) => (
                                <div
                                    key={index}
                                    className={`flex items-start gap-3 transition-all duration-500 ease-out ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                                        }`}
                                    style={{ transitionDelay: `${400 + index * 100}ms` }}
                                >
                                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                                    <span className="text-gray-700 leading-relaxed">{item.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Block 2 — Science */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 mb-6 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '500ms' }}
                    >
                        <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                            Научная основа
                        </h3>
                        <p className="text-gray-600 leading-relaxed">
                            Каждая рекомендация основана на исследованиях, а не на мнениях.
                            Алгоритмы HEYS построены на рецензированных научных работах (PubMed).
                            Система анализирует связи между сном, стрессом, питанием и активностью,
                            доказанные в исследованиях на тысячах участников. Это не «авторская методика» —
                            это биохимия и физиология, переведённые в понятные рекомендации.
                        </p>
                    </div>

                    {/* Block 3 — 3 Principles */}
                    <div
                        className={`rounded-2xl bg-white border border-gray-200 p-6 md:p-8 transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                            }`}
                        style={{ transitionDelay: '700ms' }}
                    >
                        <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-6">
                            Наш подход в трёх принципах
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
