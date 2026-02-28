// TrialSSR.tsx — Server Component версия секции Trial
// Рендерится на сервере для SEO

import TrialForm from '@/components/TrialForm'
import type { LandingVariant, VariantContent } from '@/config/landing-variants'

interface TrialSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function TrialSSR({ content, variant: _variant }: TrialSSRProps) {
  const trial = content.trial

  return (
    <section className="relative py-16 md:py-24 bg-white border-t border-gray-100" id="trial">
      {/* Sticky Header Badge */}
      <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100 py-3 mb-10 px-6 text-center shadow-sm w-full">
        <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">
          09 — БЕСПЛАТНЫЙ ТЕСТ
        </span>
      </div>

      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-2xl mx-auto">

          {/* Badge */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 text-sm font-medium px-4 py-2 rounded-full border border-blue-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              {trial.badge}
            </div>
          </div>

          {/* Heading */}
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-5 leading-tight">
            {trial.title}
          </h2>

          {/* Subtitle Sub-block */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-8">
            <p className="text-base md:text-lg text-gray-700 leading-relaxed mb-4">
              {trial.subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Без привязки карты
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Без автосписаний
              </span>
            </div>
          </div>

          {/* What you get */}
          <div className="mb-8">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Что будет на тесте:</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {trial.bullets.map((bullet, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-colors">
                  <span className="text-xl leading-none flex-shrink-0 bg-white w-10 h-10 flex items-center justify-center rounded-lg shadow-sm border border-gray-100">{bullet.icon}</span>
                  <span className="text-gray-700 mt-1.5 text-sm md:text-base leading-snug">{bullet.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Limitation info */}
          <div className="flex items-start gap-3 text-gray-500 text-sm bg-amber-50 p-4 rounded-xl border border-amber-100 mb-8">
            <svg className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="leading-relaxed">
              <strong className="text-amber-700 block mb-0.5">Мест мало</strong>
              {trial.limitation}
            </p>
          </div>

          {/* Форма заявки */}
          <div className="bg-gray-50 rounded-3xl border border-gray-200 p-6 md:p-8">
            <div className="mb-6">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-1">Оставить заявку на тест</h3>
              <p className="text-sm text-gray-500">Начните 7 дней бесплатного сопровождения — 0 ₽</p>
            </div>
            <TrialForm ctaLabel={trial.ctaAvailable} />
            <div className="mt-6 pt-5 border-t border-gray-200 text-center">
              <p className="text-gray-500 text-sm">
                {trial.purchaseLinkText}{' '}
                <a href="#pricing" className="text-indigo-600 font-semibold hover:text-indigo-700 hover:underline">
                  {trial.purchaseLinkCta}
                </a>
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
