// SupportSection.tsx — Секция "Поддержка"
// Anchor: #support
// Чтобы система выдерживала вашу жизнь: куратор рядом, протокол если сорвался

'use client'

import { useState, useEffect, useRef } from 'react'

const curatorPoints = [
  {
    icon: '🧠',
    title: 'Помнит ваш контекст',
    desc: 'Что вам подходит, а что ломает рутину.',
  },
  {
    icon: '🛟',
    title: 'Поддерживает в точках риска',
    desc: 'Вечер, стресс, усталость, поездки, праздники.',
  },
  {
    icon: '💬',
    title: 'Разбирает без наказаний',
    desc: 'Что случилось → что делать сейчас → как вернуться.',
  },
  {
    icon: '🔒',
    title: 'Снижает риск повторения',
    desc: 'Добавляет "страховки" в систему заранее.',
  },
]

const recoveryProtocol = [
  'Остановить спираль "раз уж сорвался — всё".',
  'Выбрать самый простой шаг, чтобы вернуть контроль сегодня.',
  'Минимизировать ущерб (без "компенсаций" и крайностей).',
  'Сделать корректировку на завтра.',
  'Зафиксировать триггер и добавить страховку.',
]

export default function SupportSection() {
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
      id="support"
      className="py-14 md:py-20 bg-[#f9fafb] shadow-[inset_0_2px_4px_-2px_rgba(0,0,0,0.05)]"
    >
      <div className="mx-auto max-w-[1024px] px-6">
        {/* Header */}
        <div className={`text-center mb-10 transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <h2 className="text-[24px] md:text-[30px] lg:text-[36px] font-bold text-[#111827] leading-[1.2] mb-4">
            Поддержка — чтобы система
            <br />
            <span className="text-[#6b7280]">выдерживала вашу жизнь.</span>
          </h2>
          <p className="text-[15px] md:text-[16px] text-[#6b7280] max-w-2xl mx-auto leading-relaxed">
            Срывы и откаты — часть процесса. Куратор рядом, чтобы один сложный день не превращался в потерянную неделю.
          </p>
        </div>

        {/* Curator Points */}
        <div className={`mb-10 transition-all duration-700 delay-200 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-xs font-medium tracking-wide text-[#374151] mb-5 text-center">
            Что значит "куратор рядом"
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {curatorPoints.map((point, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 flex items-start gap-3 transition-all duration-300 hover:border-[#d1d5db] hover:shadow-sm"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <div className="text-xl flex-shrink-0">{point.icon}</div>
                <div>
                  <h3 className="text-[14px] font-semibold text-[#111827] mb-1">{point.title}</h3>
                  <p className="text-[13px] text-[#6b7280] leading-relaxed">{point.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recovery Protocol */}
        <div className={`mb-10 transition-all duration-700 delay-300 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <div className="rounded-xl border border-[#e5e7eb] bg-[#fef3c7]/30 p-5 md:p-6">
            <p className="text-xs font-medium tracking-wide text-[#92400e] mb-4 text-center">
              Протокол, если сорвался
            </p>
            <div className="space-y-2.5">
              {recoveryProtocol.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#92400e] text-white flex items-center justify-center text-[11px] font-semibold">
                    {i + 1}
                  </div>
                  <p className="text-[13px] md:text-[14px] text-[#78350f] pt-0.5">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Callout */}
        <div className={`text-center mb-8 transition-all duration-700 delay-400 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-[17px] md:text-[20px] font-semibold text-[#111827]">
            Вы не боитесь нестабильности — потому что умеете возвращаться.
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
            Неделя старта (0 ₽) →
          </a>
          <a
            href="#faq"
            className="inline-flex items-center justify-center px-6 py-3 border border-[#d1d5db] text-[#374151] font-medium rounded-full transition-all hover:bg-[#f9fafb] text-[14px]"
          >
            Задать вопрос →
          </a>
        </div>
      </div>
    </section>
  )
}
