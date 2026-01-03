// ControlSection.tsx — Секция "Контроль"
// Anchor: #control
// Спокойное ощущение управления: что даёт контроль, финальный CTA

'use client'

import { useState, useEffect, useRef } from 'react'

const controlBenefits = [
  {
    icon: '👁️',
    title: 'Прозрачность',
    desc: 'Понимаете, что влияет на вес и самочувствие, а что — шум.',
  },
  {
    icon: '🎯',
    title: 'Предсказуемость',
    desc: 'Знаете триггеры и заранее готовите план B.',
  },
  {
    icon: '⚖️',
    title: 'Стабильность',
    desc: 'Прогресс держится на рутине, а не на мотивации.',
  },
  {
    icon: '📈',
    title: 'Измеримость',
    desc: 'Видите динамику по ключевым факторам, не только по весам.',
  },
  {
    icon: '🚀',
    title: 'Автопилот',
    desc: 'Часть решений становится привычкой — усилий нужно меньше.',
  },
]

export default function ControlSection() {
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
      id="control"
      className="py-14 md:py-20 bg-white shadow-[inset_0_2px_4px_-2px_rgba(0,0,0,0.05)]"
    >
      <div className="mx-auto max-w-[1024px] px-6">
        {/* Header */}
        <div className={`text-center mb-10 transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <h2 className="text-[24px] md:text-[30px] lg:text-[36px] font-bold text-[#111827] leading-[1.2] mb-4">
            Контроль — это спокойное
            <br />
            <span className="text-[#6b7280]">ощущение управления. Без давления.</span>
          </h2>
          <p className="text-[15px] md:text-[16px] text-[#6b7280] max-w-2xl mx-auto leading-relaxed">
            Когда контекст понятен, решения простые, а поддержка живая — появляется основа: вы управляете факторами результата, даже если жизнь не идеальна.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className={`mb-10 transition-all duration-700 delay-200 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <p className="text-xs font-medium tracking-wide text-[#374151] mb-5 text-center">
            Что даёт контроль
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {controlBenefits.map((benefit, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-center transition-all duration-300 hover:border-[#d1d5db] hover:shadow-sm"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <div className="text-2xl mb-2">{benefit.icon}</div>
                <h3 className="text-[13px] font-semibold text-[#111827] mb-1">{benefit.title}</h3>
                <p className="text-[12px] text-[#6b7280] leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Final Thesis */}
        <div className={`text-center mb-8 transition-all duration-700 delay-300 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <div className="inline-block bg-white border border-[#e5e7eb] rounded-xl px-6 py-5 shadow-sm">
            <p className="text-[15px] md:text-[18px] font-semibold text-[#111827] leading-relaxed">
              HEYS — это система, которая держит процесс:
            </p>
            <p className="text-[15px] md:text-[18px] font-bold text-[#111827] mt-1.5">
              <span className="text-[#3b82f6]">контекст</span>
              <span className="text-[#9ca3af] mx-1.5">→</span>
              <span className="text-[#10b981]">решения</span>
              <span className="text-[#9ca3af] mx-1.5">→</span>
              <span className="text-[#f59e0b]">поддержка</span>
              <span className="text-[#9ca3af] mx-1.5">→</span>
              <span className="text-[#8b5cf6]">контроль</span>
            </p>
          </div>
        </div>

        {/* CTAs */}
        <div className={`flex flex-col sm:flex-row gap-3 justify-center items-center transition-all duration-700 delay-400 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <a
            href="#trial"
            className="inline-flex items-center justify-center px-7 py-3 bg-[#111827] text-white font-medium rounded-full transition-all hover:bg-[#1f2937] text-[14px]"
          >
            Записаться на неделю старта (0 ₽) →
          </a>
          <a
            href="#pricing"
            className="inline-flex items-center justify-center px-7 py-3 border border-[#d1d5db] text-[#374151] font-medium rounded-full transition-all hover:bg-white text-[14px]"
          >
            Выбрать тариф →
          </a>
        </div>

        {/* Microcopy */}
        <p className="text-center text-[11px] text-[#9ca3af] mt-5">
          0 ₽ без карты • без автосписаний • по записи • не медицинская услуга
        </p>
      </div>
    </section>
  )
}
