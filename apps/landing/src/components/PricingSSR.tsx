// PricingSSR.tsx — Server Component версия прайсинга
// Рендерится на сервере для SEO

import type { LandingVariant, VariantContent } from '@/config/landing-variants'

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
      description: 'Приложение + умные подсказки + обратная связь раз в неделю',
      features: [
        'Полный доступ к приложению',
        'Умные подсказки и аналитика',
        '1 обратная связь в неделю (async)',
      ],
      cta: 'Выбрать Base',
      featured: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '12 990',
      period: '₽/мес',
      description: 'Сопровождение: чат + ведение дневника + созвон раз в неделю',
      features: [
        'Всё из Base',
        'Куратор ведёт ваш дневник питания',
        'Чат: 09:00–21:00 (время клиента)',
        'Ответ ≤30 минут в рабочие часы',
        'Выходные/праздники: дежурный режим',
        'Еженедельный созвон 20–45 минут',
        'Анти‑срыв сигнал — приоритет',
      ],
      cta: 'Выбрать Pro',
      featured: true,
      badge: 'Популярный',
    },
    {
      id: 'pro-plus',
      name: 'Pro+',
      price: '19 990',
      period: '₽/мес',
      description: 'Максимальный режим 7/7 + приоритет в очереди ответов',
      features: [
        'Всё из Pro',
        '09:00–21:00 — полный режим 7/7 (без дежурного)',
        'Приоритет в очереди ответов в рабочие часы (≤30 мин)',
        'Разбор в середине недели',
      ],
      cta: 'Выбрать Pro+',
      featured: false,
    },
  ]

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-y border-slate-200" id="pricing">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">{pricing.intro}</h2>
          </div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 ${plan.featured
                  ? 'bg-white border-2 border-blue-600 shadow-lg'
                  : 'bg-white border border-gray-200'
                  }`}
              >
                {plan.badge ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-sm font-medium px-4 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  </div>
                ) : null}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl md:text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-500">{plan.period}</span>
                  </div>
                  <p className="mt-2 text-gray-600 text-sm">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="text-green-500 mt-1">✓</span>
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>

                <a
                  href="#trial"
                  className={`block w-full text-center py-3 rounded-xl font-semibold transition-colors ${plan.featured
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                    }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          {/* Onboarding Steps */}
          <div className="mt-20 bg-white rounded-3xl p-8 border border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 text-center mb-8">Что будет дальше:</h3>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-4">1</div>
                <h4 className="font-bold text-gray-900 mb-2">Знакомство в мессенджере</h4>
                <p className="text-gray-600 text-sm">Куратор напишет вам, задаст пару уточняющих вопросов и выдаст доступ в HEYS.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-4">2</div>
                <h4 className="font-bold text-gray-900 mb-2">Калибровка EWS</h4>
                <p className="text-gray-600 text-sm">Вы просто ведёте привычный образ жизни 3-5 дней. Мы собираем данные (37 параметров).</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-4">3</div>
                <h4 className="font-bold text-gray-900 mb-2">Коррекция без диет</h4>
                <p className="text-gray-600 text-sm">Разбор ваших метаболических паттернов. Начинаем плавные изменения без насилия.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
