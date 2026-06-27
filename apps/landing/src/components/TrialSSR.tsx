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
    <section className="relative bg-[linear-gradient(180deg,#F9FAFB_0%,#FFF6DF_18%,#FFE9B8_48%,#FFF3DB_100%)] pb-16 pt-12 md:pb-24 md:pt-16" id="trial">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-2xl mx-auto">

          {/* Offer card */}
          <div className="relative overflow-hidden rounded-3xl border border-[#E89A1F] bg-[linear-gradient(180deg,#FFF9E8_0%,#FFD979_58%,#FFB93E_100%)] p-7 shadow-[0_24px_70px_rgba(181,111,0,0.22)] sm:p-9">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold leading-tight text-[#1F2937] md:text-4xl">
                {trial.title}
              </h2>
              <div className="mt-4 flex items-baseline justify-center gap-2">
                <span className="text-5xl font-extrabold tracking-normal text-[#111827]">0</span>
                <span className="text-2xl font-bold text-[#111827]">₽</span>
                <span className="text-sm font-semibold text-[#6B4B00]">/ 7 дней</span>
              </div>
            </div>

            <p className="mx-auto mt-5 max-w-xl text-center text-[15px] leading-relaxed text-[#4A3820] md:text-base">
              {trial.subtitle}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9951E] bg-white/75 px-3 py-1.5 text-sm font-semibold text-[#5C4100]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Без привязки карты
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9951E] bg-white/75 px-3 py-1.5 text-sm font-semibold text-[#5C4100]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Без автосписаний
              </span>
            </div>

            <div className="mt-7 rounded-2xl border border-[#D9951E] bg-white/60 p-4 text-center text-sm leading-relaxed text-[#4A3820]">
              <span className="font-semibold text-[#5C4100]">Первый набор ограничен.</span>{' '}
              Куратор берёт немного участников, чтобы сохранять вовлечённость в каждого.
            </div>
          </div>

          {/* Форма заявки */}
          <div className="mt-8 bg-white/90 rounded-3xl border border-[#E9AF2E] p-6 md:p-8 shadow-[0_22px_60px_rgba(181,111,0,0.16)]">
            <div className="mb-6">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight mb-1">Оставить заявку на неделю Pro</h3>
              <p className="text-sm text-gray-500">7 дней сопровождения — 0 ₽, без привязки карты</p>
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
