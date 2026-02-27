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
    <section className="relative py-16 md:py-20 bg-gradient-to-br from-blue-600 to-blue-700" id="trial">
      
            {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">09 — НЕДЕЛЯ СТАРТА</span>
            </div>
            <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Левая часть - текст */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="mb-8">
                <div className="inline-block bg-white/20 backdrop-blur text-white text-sm font-medium px-4 py-2 rounded-full">
                  {trial.badge}
                </div>
              </div>

              {/* Heading */}
              <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-6">{trial.title}</h2>

              <p className="text-lg md:text-xl text-blue-100 mb-8">{trial.subtitle}</p>

              {/* What you get */}
              <div className="space-y-4 mb-8">
                {trial.bullets.map((bullet, i) => (
                  <div key={i} className="flex items-center gap-3 text-white">
                    <span className="text-2xl">{bullet.icon}</span>
                    <span>{bullet.text}</span>
                  </div>
                ))}
              </div>

              {/* Limitation */}
              <p className="text-blue-200 text-sm whitespace-pre-line">{trial.limitation}</p>

              {/* Purchase link */}
              <div className="mt-8 pt-6 border-t border-white/20">
                <p className="text-white/70 text-sm">
                  {trial.purchaseLinkText}{' '}
                  <a href="#contact" className="text-white font-medium hover:underline">
                    {trial.purchaseLinkCta}
                  </a>
                </p>
              </div>
            </div>

            {/* Правая часть - интерактивная форма */}
            <TrialForm ctaLabel={trial.ctaAvailable} />
          </div>
        </div>
      </div>
    </section>
  )
}
