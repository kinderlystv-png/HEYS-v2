// PricingSSR.tsx — Server Component версия прайсинга
// Рендерится на сервере для SEO

import type { LandingVariant, VariantContent } from '@/config/landing-variants'
import PurchaseButton from './PurchaseButton'

interface PricingSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function PricingSSR({ content, variant: _variant }: PricingSSRProps) {
  const pricing = content.pricing

  const plans = [
    {
      id: 'base',
      name: 'Base',
      price: '1 990',
      period: '₽/мес',
      description: 'Самостоятельный контроль + мощная аналитика HEYS',
      features: [
        'Вы ведете дневник питания сами',
        'Полный доступ к приложению и виджетам',
        'Алгоритмы предсказывают риск срывов',
        'Глубокая аналитика метрик под капотом',
        'Ревью и объективная оценка ситуации 1 раз в неделю',
      ],
      cta: 'Попробовать Pro (0 ₽)', hasTrial: true, directCta: 'Выбрать Base',
      featured: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '12 990',
      period: '₽/мес',
      description: 'Максимальный результат. Вы живёте — куратор берёт рутину на себя.',
      features: [
        'Куратор сам ведёт ваш дневник (по фото/аудио)',
        'Чат 09:00–21:00: живой наставник, не бот',
        'Анти-срыв: подхватываем до того, как вы сдадитесь',
        'Ответы в течение 30 минут',
        'Еженедельный видео-созвон 20–45 минут',
        'Выходные: дежурный режим',
      ],
      cta: 'Попробовать неделю (0 ₽)', hasTrial: true, directCta: 'Оформить подписку',
      featured: true,
      badge: 'Хит',
    },
    {
      id: 'pro-plus',
      name: 'Pro+',
      price: '19 990',
      period: '₽/мес',
      description: 'Премиум-поддержка 7/7 без выходных + приоритет',
      features: [
        'Все опции тарифа Pro',
        '09:00–21:00 — полная поддержка без выходных',
        'Приоритет в очереди ответов (реакция мгновенная)',
        'Дополнительный разбор состояний посреди недели',
        'Персональная онлайн-тренировка 1 раз в неделю (контроль техники по видео)',
      ],
      cta: 'Попробовать Pro (0 ₽)', hasTrial: true, directCta: 'Выбрать Pro+',
      featured: false,
      premium: true,
    },
  ]

  return (
    <section className="relative py-20 bg-gray-50" id="pricing">

      {/* Sticky Header Badge */}
      <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
        <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">08 — ТАРИФЫ</span>
      </div>
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{pricing.intro}</h2>
          </div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 ${plan.premium
                  ? 'bg-gradient-to-br from-indigo-900 to-slate-900 border-2 border-indigo-400/30 text-white shadow-xl shadow-indigo-900/10'
                  : plan.featured
                    ? 'bg-white border-2 border-blue-600 shadow-lg'
                    : 'bg-white border border-gray-200'
                  }`}
              >
                {plan.badge ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`text-sm font-medium px-4 py-1 rounded-full ${plan.premium ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20' : 'bg-blue-600 text-white'}`}>
                      {plan.badge}
                    </span>
                  </div>
                ) : null}

                <div className="text-center mb-6">
                  <h3 className={`text-xl font-bold mb-2 ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className={`text-4xl font-bold ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                    <span className={plan.premium ? 'text-indigo-200/70' : 'text-gray-500'}>{plan.period}</span>
                  </div>
                  <p className={`mt-2 text-sm ${plan.premium ? 'text-indigo-100/90' : 'text-gray-600'}`}>{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className={`${plan.premium ? 'text-indigo-400' : 'text-green-500'} mt-1`}>✓</span>
                      <span className={plan.premium ? 'text-indigo-50/90' : 'text-gray-700'}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.hasTrial ? (
                  <>
                    <a
                      href="#trial"
                      className={`block w-full text-center py-3 rounded-xl font-semibold transition-colors ${plan.premium
                        ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                        : plan.featured
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                        }`}
                    >
                      {plan.cta}
                    </a>
                    <PurchaseButton
                      planName={plan.name}
                      planPrice={`${plan.price} ${plan.period}`}
                      featured={plan.featured ?? false}
                      premium={plan.premium ?? false} ctaText={plan.directCta}
                    />
                  </>
                ) : (
                  <PurchaseButton
                    planName={plan.name}
                    planPrice={`${plan.price} ${plan.period}`}
                    featured={plan.featured ?? false}
                    premium={plan.premium ?? false}
                    ctaText={plan.directCta}
                    isPrimary={true}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
