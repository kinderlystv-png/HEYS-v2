// ContextSection.tsx — Секция "Контекст"
// Anchor: #context
// Карта вашей реальности: какие данные собираем, на что опираемся в выводах

'use client'

import { useState, useEffect, useRef } from 'react'

const dataCards = [
  {
    icon: '🍽️',
    title: 'Питание',
    desc: 'Структура приёмов пищи, насыщаемость, вечерние сценарии, "триггеры".',
  },
  {
    icon: '🌙',
    title: 'Сон',
    desc: 'Длительность, качество, время засыпания/подъёма, восстановление.',
  },
  {
    icon: '🚶',
    title: 'Активность',
    desc: 'Шаги и NEAT, тренировки, бытовая нагрузка, сидячесть.',
  },
  {
    icon: '💚',
    title: 'Самочувствие',
    desc: 'Энергия, голод, тяга, настроение, стресс, восстановление.',
  },
  {
    icon: '📊',
    title: 'Динамика',
    desc: 'Вес/замеры/фото — по желанию, чтобы понимать колебания без паники.',
  },
  {
    icon: '📅',
    title: 'Контекст жизни',
    desc: 'Работа, семья, поездки, праздники, режим — то, что обычно "ломает" планы.',
  },
]

const principles = [
  {
    title: 'Доказательные принципы.',
    desc: 'Используем базовые закономерности физиологии (аппетит, сон/стресс, активность, энергообмен).',
  },
  {
    title: 'Проверка гипотез.',
    desc: 'Не "угадываем причины", а ищем повторяющиеся связи на ваших данных.',
  },
  {
    title: 'Личный эксперимент.',
    desc: 'Меняем 1–2 фактора и смотрим эффект — закрепляем только то, что работает.',
  },
]

export default function ContextSection() {
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

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="context"
      className="py-14 md:py-20 bg-[#f9fafb] shadow-[inset_0_2px_4px_-2px_rgba(0,0,0,0.05)]"
    >
      <div className="mx-auto max-w-[1024px] px-6">
        {/* Header */}
        <div className={`text-center mb-10 transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <h2 className="text-[24px] md:text-[30px] lg:text-[36px] font-bold text-[#111827] leading-[1.2] mb-4">
            Контекст — карта вашей реальности.
            <br />
            <span className="text-[#6b7280]">Не "план", а факты.</span>
          </h2>
          <p className="text-[15px] md:text-[16px] text-[#6b7280] max-w-2xl mx-auto leading-relaxed">
            Метаболический трекер собирает картину недели: питание, сон, активность, стресс и самочувствие — и помогает увидеть, что реально влияет на результат.
          </p>
        </div>

        {/* Data Cards Grid */}
        <div className={`mb-10 transition-all duration-700 delay-200 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-xs font-medium tracking-wide text-[#374151] mb-5 text-center">
            Какие данные собираем
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dataCards.map((card, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 transition-all duration-300 hover:border-[#d1d5db] hover:shadow-sm"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <div className="text-xl mb-2">{card.icon}</div>
                <h3 className="text-[14px] font-semibold text-[#111827] mb-1">{card.title}</h3>
                <p className="text-[13px] text-[#6b7280] leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Principles */}
        <div className={`mb-10 transition-all duration-700 delay-300 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-xs font-medium tracking-wide text-[#374151] mb-5 text-center">
            На что опираемся в выводах
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {principles.map((p, i) => (
              <div key={i} className="text-center md:text-left">
                <h4 className="text-[14px] font-semibold text-[#111827] mb-1">{p.title}</h4>
                <p className="text-[13px] text-[#6b7280] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Callout */}
        <div className={`text-center mb-8 transition-all duration-700 delay-400 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-[17px] md:text-[20px] font-semibold text-[#111827]">
            Вы перестаёте гадать "почему не получается" и видите систему.
          </p>
        </div>

        {/* CTAs */}
        <div className={`flex flex-col sm:flex-row gap-3 justify-center items-center transition-all duration-700 delay-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <a
            href="#decisions"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#111827] text-white font-medium rounded-full transition-all hover:bg-[#1f2937] text-[14px]"
          >
            Как это работает →
          </a>
          <a
            href="#trial"
            className="inline-flex items-center justify-center px-6 py-3 border border-[#d1d5db] text-[#374151] font-medium rounded-full transition-all hover:bg-[#f9fafb] text-[14px]"
          >
            Неделя старта (0 ₽) →
          </a>
        </div>

        {/* Microcopy */}
        <p className="text-center text-[11px] text-[#9ca3af] mt-5">
          Данные помогают находить связи, но не заменяют диагностику и лечение.
        </p>
      </div>
    </section>
  )
}
