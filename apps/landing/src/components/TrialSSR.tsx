// TrialSSR.tsx — Server Component версия секции Trial
// Рендерится на сервере для SEO

import type { LandingVariant, VariantContent } from '@/config/landing-variants'

interface TrialSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function TrialSSR({ content, variant: _variant }: TrialSSRProps) {
  const trial = content.trial

  return (
    <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-700" id="trial">
      <div className="container mx-auto px-6">
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
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">{trial.title}</h2>

              <p className="text-xl text-blue-100 mb-8">{trial.subtitle}</p>

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

            {/* Правая часть - simplified form placeholder */}
            <div className="bg-white rounded-3xl p-8 shadow-2xl">
              <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">Заявка на участие</h3>

              {/* Статическая форма для SSR */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ваше имя</label>
                  <input
                    type="text"
                    placeholder="Имя"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50"
                    disabled
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Телефон</label>
                  <input
                    type="tel"
                    placeholder="+7 (___) ___-__-__"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-50"
                    disabled
                  />
                </div>

                <button
                  type="button"
                  className="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl"
                  disabled
                >
                  {trial.ctaAvailable}
                </button>

                <p className="text-xs text-gray-500 text-center mt-4">
                  Нажимая кнопку, вы соглашаетесь с{' '}
                  <a href="/legal/user-agreement" className="text-blue-600 hover:underline">
                    условиями
                  </a>{' '}
                  и{' '}
                  <a href="/legal/privacy-policy" className="text-blue-600 hover:underline">
                    политикой
                  </a>
                </p>
              </div>

              <p className="text-center text-gray-500 text-sm mt-4 italic">
                Форма работает с JavaScript. Если видите это — вы смотрите SSR версию.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
