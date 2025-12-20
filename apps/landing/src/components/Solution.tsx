export default function Solution() {
  return (
    <section className="py-20 bg-gradient-to-b from-blue-50 to-white" id="solution">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              HEYS — это <span className="gradient-text">другой подход</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Не приложение с цифрами, а экосистема: приложение + живой куратор + протоколы сопровождения.
            </p>
          </div>
          
          {/* Solution cards */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="feature-card text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">📱</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Экосистема (не трекер)
              </h3>
              <p className="text-gray-600">
                Приложение и аналитика, которые помогают держать курс: понятно «где я сейчас» и «что делать дальше».
              </p>
            </div>
            
            <div className="feature-card text-center border-2 border-blue-200">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">👤</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Живой куратор
              </h3>
              <p className="text-gray-600">
                В Pro/Pro+ куратор ведёт дневник и помогает удерживать фокус — особенно в моменты риска и срывов.
              </p>
              <div className="mt-4 inline-block bg-blue-50 text-blue-600 text-sm font-medium px-3 py-1 rounded-full">
                Главная ценность
              </div>
            </div>
            
            <div className="feature-card text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">🎯</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Контур ответственности
              </h3>
              <p className="text-gray-600">
                Вас не оставляют один на один с цифрами: есть ритм, договорённости и понятный «следующий шаг».
              </p>
            </div>

            <div className="feature-card text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">🛟</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Анти‑срыв и честная связь
              </h3>
              <p className="text-gray-600">
                В Pro/Pro+ есть окно связи и понятный SLA: в рабочие часы отвечаем быстро и предсказуемо.
              </p>
            </div>
          </div>

          {/* 5-я идея — отдельным блоком */}
          <div className="mt-10 bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <h3 className="text-lg md:text-xl font-semibold text-gray-900">
                  «Паспорт движения» — протокол сопровождения
                </h3>
                <p className="mt-2 text-gray-600">
                  Чтобы всегда было понятно: что делать дальше и как выглядит ритм сопровождения.
                </p>
              </div>
              <div className="text-sm text-gray-600">
                <div className="font-medium text-gray-900 mb-2">Примеры ритма:</div>
                <ul className="space-y-1">
                  <li>• Утро: план/фокус дня</li>
                  <li>• Днём: корректировка по факту</li>
                  <li>• Вечер: итоги и поддержка</li>
                  <li>• Раз в неделю: созвон 20–45 минут</li>
                  <li>• Pro+: mid‑week чек‑ин</li>
                </ul>
              </div>
            </div>
          </div>
          
          {/* Key message */}
          <div className="mt-16 bg-white rounded-2xl p-8 shadow-lg border border-gray-100 text-center">
            <p className="text-2xl font-medium text-gray-900">
              «Вас <span className="text-blue-600 font-bold">ведут</span>, а не оставляют с цифрами»
            </p>
            <p className="mt-4 text-gray-600">
              Есть человек, которому не всё равно на вашу жизнь и здоровье
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
