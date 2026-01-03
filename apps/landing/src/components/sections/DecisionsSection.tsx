// DecisionsSection.tsx — Секция "Решения"
// Anchor: #decisions
// Следующий шаг: как работает куратор, примеры рекомендаций

'use client'

import { useState, useEffect, useRef } from 'react'

const steps = [
  {
    num: '01',
    title: 'Разбор недели',
    desc: 'Где "утечки" энергии/сна/режима и что повторяется.',
  },
  {
    num: '02',
    title: 'Приоритет 1–2 рычагов',
    desc: 'Вместо десятка правил — два действия, которые тянут результат.',
  },
  {
    num: '03',
    title: 'Рекомендации как сценарии',
    desc: 'Что делать в реальных ситуациях: поздно пришёл, стресс, гости, усталость.',
  },
  {
    num: '04',
    title: 'Проверка эффекта',
    desc: 'Оставляем то, что заходит и работает, и корректируем остальное.',
  },
]

const recommendations = [
  {
    icon: '🍽️',
    title: 'Структура питания',
    desc: 'Собрать день так, чтобы голод и тяга не разрывали вечер.',
  },
  {
    icon: '🥗',
    title: 'Насыщаемость без "диеты"',
    desc: 'Белок/клетчатка/объём — чтобы держаться проще.',
  },
  {
    icon: '🛟',
    title: 'Страховка на сложные дни',
    desc: 'План B: быстрые варианты еды, чтобы не "снести" неделю.',
  },
  {
    icon: '😴',
    title: 'Сон как рычаг контроля аппетита',
    desc: 'Малые правки, которые реально улучшают восстановление.',
  },
  {
    icon: '🚶',
    title: 'Активность без спорта "через силу"',
    desc: 'NEAT и короткие форматы движения, которые не ломают график.',
  },
  {
    icon: '🔄',
    title: 'Триггеры и привычки',
    desc: 'Не запреты, а замены и ритуалы, которые можно удерживать.',
  },
]

export default function DecisionsSection() {
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
      id="decisions"
      className="py-14 md:py-20 bg-white shadow-[inset_0_2px_4px_-2px_rgba(0,0,0,0.05)]"
    >
      <div className="mx-auto max-w-[1024px] px-6">
        {/* Header */}
        <div className={`text-center mb-10 transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <h2 className="text-[24px] md:text-[30px] lg:text-[36px] font-bold text-[#111827] leading-[1.2] mb-4">
            Решения — это следующий шаг.
            <br />
            <span className="text-[#6b7280]">Не идеальный план, а рабочий рычаг.</span>
          </h2>
          <p className="text-[15px] md:text-[16px] text-[#6b7280] max-w-2xl mx-auto leading-relaxed">
            Куратор превращает контекст и данные в простые действия, которые дают максимум эффекта при минимальном усилии.
          </p>
        </div>

        {/* How Curator Works — Timeline */}
        <div className={`mb-10 transition-all duration-700 delay-200 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-xs font-medium tracking-wide text-[#374151] mb-6 text-center">
            Как работает куратор
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map((step, i) => (
              <div
                key={i}
                className="relative"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#111827] text-white flex items-center justify-center text-[12px] font-semibold">
                    {step.num}
                  </div>
                  <div className="pt-0.5">
                    <h3 className="text-[14px] font-semibold text-[#111827] mb-1">{step.title}</h3>
                    <p className="text-[13px] text-[#6b7280] leading-relaxed">{step.desc}</p>
                  </div>
                </div>
                {/* Connector line for desktop */}
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-4 left-[44px] w-[calc(100%-44px)] h-[2px] bg-[#e5e7eb]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations Grid */}
        <div className={`mb-10 transition-all duration-700 delay-300 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-xs font-medium tracking-wide text-[#374151] mb-5 text-center">
            Примеры рекомендаций
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#e5e7eb] bg-white p-4 transition-all duration-300 hover:border-[#d1d5db] hover:shadow-sm"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <div className="text-xl mb-2">{rec.icon}</div>
                <h3 className="text-[14px] font-semibold text-[#111827] mb-1">{rec.title}</h3>
                <p className="text-[13px] text-[#6b7280] leading-relaxed">{rec.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Callout */}
        <div className={`text-center mb-8 transition-all duration-700 delay-400 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-[17px] md:text-[20px] font-semibold text-[#111827]">
            Вместо "надо собраться" появляется понятный план действий под вашу жизнь.
          </p>
        </div>

        {/* CTAs */}
        <div className={`flex flex-col sm:flex-row gap-3 justify-center items-center transition-all duration-700 delay-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <a
            href="#trial"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#111827] text-white font-medium rounded-full transition-all hover:bg-[#1f2937] text-[14px]"
          >
            Записаться на неделю старта (0 ₽) →
          </a>
          <a
            href="#pricing"
            className="inline-flex items-center justify-center px-6 py-3 border border-[#d1d5db] text-[#374151] font-medium rounded-full transition-all hover:bg-white text-[14px]"
          >
            Смотреть тарифы →
          </a>
        </div>
      </div>
    </section>
  )
}
