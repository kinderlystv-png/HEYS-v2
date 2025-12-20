export default function Pricing() {
  const plans = [
    {
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
      badge: 'Популярный'
    },
    {
      name: 'Pro+',
      price: '19 990',
      period: '₽/мес',
      description: 'Максимальный режим 7/7 + приоритетный SLA в рабочие часы',
      features: [
        'Всё из Pro',
        '09:00–21:00 — полный режим 7/7 (без дежурного)',
        'Приоритетный SLA в рабочие часы',
        'Разбор в середине недели',
      ],
      cta: 'Выбрать Pro+',
      featured: false,
    },
  ]

  return (
    <section className="py-20 bg-gray-50" id="pricing">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Простые тарифы
            </h2>
            <p className="text-xl text-gray-600">
              Выберите уровень сопровождения
            </p>
          </div>
          
          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div 
                key={plan.name} 
                className={`pricing-card ${plan.featured ? 'featured' : ''}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-sm font-medium px-4 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  </div>
                )}
                
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-gray-900">
                      {plan.price}
                    </span>
                    <span className="text-gray-500">
                      {plan.period}
                    </span>
                  </div>
                  <p className="mt-2 text-gray-600 text-sm">
                    {plan.description}
                  </p>
                </div>
                
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <a 
                  href="#trial"
                  className={`block w-full py-3 rounded-xl font-semibold transition-colors text-center ${
                    plan.featured 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
          
          {/* Note */}
          <p className="text-center text-gray-500 mt-8">
            Все тарифы без автопродления. Оплата — помесячно.
            <br />
            <span className="text-gray-500">
              SLA и время реакции действуют в рабочие часы тарифа. Вне рабочего времени — в следующий рабочий период.
            </span>
          </p>
        </div>
      </div>
    </section>
  )
}
