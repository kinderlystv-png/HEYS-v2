export default function HowItWorks() {
  const steps = [
    {
      number: '01',
      icon: '📲',
      title: 'Начните бесплатный триал',
      description: 'Скачайте приложение, заполните короткую анкету и выберите удобный мессенджер для общения с куратором.',
      highlight: '5 минут'
    },
    {
      number: '02',
      icon: '📸',
      title: 'Фотографируйте еду',
      description: 'Просто присылайте фото еды в мессенджер. Куратор сам внесёт всё в дневник — вам не нужно ничего считать.',
      highlight: 'Куратор делает за вас'
    },
    {
      number: '03',
      icon: '💬',
      title: 'Получайте поддержку',
      description: 'Утром — план на день. Вечером — итоги. В сложный момент — поддержка. Раз в неделю — разбор прогресса.',
      highlight: 'Не остаётесь одни'
    },
    {
      number: '04',
      icon: '📈',
      title: 'Видите результат',
      description: 'Контроль без стресса, понимание своего питания, предсказуемый прогресс к цели.',
      highlight: 'Без срывов'
    }
  ]

  return (
    <section className="py-20 bg-white" id="how-it-works">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Как это работает
            </h2>
            <p className="text-xl text-gray-600">
              4 простых шага к контролю питания
            </p>
          </div>
          
          {/* Steps */}
          <div className="space-y-8">
            {steps.map((step, _index) => (
              <div key={step.number} className="flex gap-6 items-start">
                {/* Number */}
                <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
                  {step.number}
                </div>
                
                {/* Content */}
                <div className="flex-grow bg-gray-50 rounded-2xl p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{step.icon}</span>
                        <h3 className="text-xl font-semibold text-gray-900">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-gray-600">
                        {step.description}
                      </p>
                    </div>
                    <span className="hidden sm:inline-block flex-shrink-0 bg-green-100 text-green-700 text-sm font-medium px-3 py-1 rounded-full">
                      {step.highlight}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
