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
      cta: 'Выбрать Base',
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
      cta: 'Выбрать Pro',
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
        'Онлайн-тренировка раз в неделю: куратор подключится по видеосвязи и проконтролирует технику (по желанию, вы ставите штатив)',
      ],
      cta: 'Выбрать Pro+',
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
                  ? 'bg-slate-900 border-2 border-slate-800 text-white shadow-xl shadow-slate-900/20'
                  : plan.featured
                    ? 'bg-white border-2 border-blue-600 shadow-lg'
                    : 'bg-white border border-gray-200'
                  }`}
              >
                {plan.badge ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`text-sm font-medium px-4 py-1 rounded-full ${plan.premium ? 'bg-amber-500 text-amber-950' : 'bg-blue-600 text-white'}`}>
                      {plan.badge}
                    </span>
                  </div>
                ) : null}

                <div className="text-center mb-6">
                  <h3 className={`text-xl font-bold mb-2 ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className={`text-4xl font-bold ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                    <span className={plan.premium ? 'text-slate-400' : 'text-gray-500'}>{plan.period}</span>
                  </div>
                  <p className={`mt-2 text-sm ${plan.premium ? 'text-slate-300' : 'text-gray-600'}`}>{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className={`${plan.premium ? 'text-amber-500' : 'text-green-500'} mt-1`}>✓</span>
                      <span className={plan.premium ? 'text-slate-200' : 'text-gray-700'}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#trial"
                  className={`block w-full text-center py-3 rounded-xl font-semibold transition-colors ${plan.premium
                    ? 'bg-white text-slate-900 hover:bg-gray-100'
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
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
