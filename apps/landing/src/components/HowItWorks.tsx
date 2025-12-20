export default function HowItWorks() {
  return (
    <section className="py-24 bg-white" id="how-it-works">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <p className="text-lg text-gray-500 mb-4">
              Как выглядит сопровождение
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Ваш типичный день с HEYS
            </h2>
          </div>
          
          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-200 via-blue-400 to-blue-200 -translate-x-1/2" />
            
            {/* Morning */}
            <div className="relative flex flex-col md:flex-row items-start mb-12">
              <div className="md:w-1/2 md:pr-12 md:text-right">
                <div className="hidden md:block">
                  <span className="text-sm text-blue-600 font-medium">08:00</span>
                  <h3 className="text-xl font-semibold text-gray-900 mt-1">Утро</h3>
                  <p className="text-gray-600 mt-2">
                    Куратор присылает план на день: на что обратить внимание, 
                    какие приёмы пищи спланировать.
                  </p>
                </div>
              </div>
              <div className="absolute left-6 md:left-1/2 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center -translate-x-1/2 border-4 border-white shadow-md">
                <span className="text-xl">🌅</span>
              </div>
              <div className="md:w-1/2 md:pl-12 pl-20">
                <div className="md:hidden">
                  <span className="text-sm text-blue-600 font-medium">08:00</span>
                  <h3 className="text-xl font-semibold text-gray-900 mt-1">Утро</h3>
                  <p className="text-gray-600 mt-2">
                    Куратор присылает план на день: на что обратить внимание, 
                    какие приёмы пищи спланировать.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Breakfast */}
            <div className="relative flex flex-col md:flex-row items-start mb-12">
              <div className="md:w-1/2 md:pr-12" />
              <div className="absolute left-6 md:left-1/2 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center -translate-x-1/2 border-4 border-white shadow-md">
                <span className="text-xl">📸</span>
              </div>
              <div className="md:w-1/2 md:pl-12 pl-20">
                <span className="text-sm text-blue-600 font-medium">09:30</span>
                <h3 className="text-xl font-semibold text-gray-900 mt-1">Завтрак</h3>
                <p className="text-gray-600 mt-2">
                  Фото еды → в мессенджер. Куратор сам внесёт в дневник. 
                  Вам не нужно ничего искать и считать.
                </p>
              </div>
            </div>
            
            {/* Lunch */}
            <div className="relative flex flex-col md:flex-row items-start mb-12">
              <div className="md:w-1/2 md:pr-12 md:text-right">
                <div className="hidden md:block">
                  <span className="text-sm text-blue-600 font-medium">13:00</span>
                  <h3 className="text-xl font-semibold text-gray-900 mt-1">Обед</h3>
                  <p className="text-gray-600 mt-2">
                    Снова фото → куратор вносит. Если что-то пошло не по плану — 
                    корректирует на остаток дня.
                  </p>
                </div>
              </div>
              <div className="absolute left-6 md:left-1/2 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center -translate-x-1/2 border-4 border-white shadow-md">
                <span className="text-xl">🍽️</span>
              </div>
              <div className="md:w-1/2 md:pl-12 pl-20">
                <div className="md:hidden">
                  <span className="text-sm text-blue-600 font-medium">13:00</span>
                  <h3 className="text-xl font-semibold text-gray-900 mt-1">Обед</h3>
                  <p className="text-gray-600 mt-2">
                    Снова фото → куратор вносит. Если что-то пошло не по плану — 
                    корректирует на остаток дня.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Difficult moment */}
            <div className="relative flex flex-col md:flex-row items-start mb-12">
              <div className="md:w-1/2 md:pr-12" />
              <div className="absolute left-6 md:left-1/2 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center -translate-x-1/2 border-4 border-white shadow-md">
                <span className="text-xl">🛟</span>
              </div>
              <div className="md:w-1/2 md:pl-12 pl-20">
                <span className="text-sm text-red-500 font-medium">18:00</span>
                <h3 className="text-xl font-semibold text-gray-900 mt-1">Сложный момент</h3>
                <p className="text-gray-600 mt-2">
                  Тяжёлый день, хочется сорваться. Пишете куратору — 
                  он поможет найти решение, а не осудит.
                </p>
                <div className="mt-3 inline-block bg-red-50 text-red-600 text-sm font-medium px-3 py-1 rounded-full">
                  Анти-срыв
                </div>
              </div>
            </div>
            
            {/* Evening */}
            <div className="relative flex flex-col md:flex-row items-start">
              <div className="md:w-1/2 md:pr-12 md:text-right">
                <div className="hidden md:block">
                  <span className="text-sm text-blue-600 font-medium">21:00</span>
                  <h3 className="text-xl font-semibold text-gray-900 mt-1">Вечер</h3>
                  <p className="text-gray-600 mt-2">
                    Итоги дня: что получилось, что улучшить. 
                    Фиксируем прогресс, планируем завтра.
                  </p>
                </div>
              </div>
              <div className="absolute left-6 md:left-1/2 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center -translate-x-1/2 border-4 border-white shadow-md">
                <span className="text-xl">🌙</span>
              </div>
              <div className="md:w-1/2 md:pl-12 pl-20">
                <div className="md:hidden">
                  <span className="text-sm text-blue-600 font-medium">21:00</span>
                  <h3 className="text-xl font-semibold text-gray-900 mt-1">Вечер</h3>
                  <p className="text-gray-600 mt-2">
                    Итоги дня: что получилось, что улучшить. 
                    Фиксируем прогресс, планируем завтра.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Weekly callout */}
          <div className="mt-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-8 text-center">
            <div className="inline-block bg-white text-blue-600 text-sm font-medium px-4 py-1.5 rounded-full mb-4 shadow-sm">
              Раз в неделю
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Созвон 20–45 минут
            </h3>
            <p className="text-gray-600 max-w-lg mx-auto">
              Разбираем неделю: что работает, что мешает. 
              Корректируем подход, ставим фокус на следующие 7 дней.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
