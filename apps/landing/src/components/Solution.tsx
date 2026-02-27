export default function Solution() {
  return (
    <section className="py-24 bg-gradient-to-b from-blue-50 to-white" id="solution">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Main answer */}
          <div className="text-center mb-16">
            <p className="text-lg text-blue-600 mb-4 font-medium">
              Поэтому HEYS — это не приложение
            </p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Это человек, которому
              <br />
              <span className="text-blue-600">не всё равно</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Куратор, который ведёт ваш дневник, держит фокус и рядом в моменты слабости.
            </p>
          </div>

          {/* Central card - Curator */}
          <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border border-gray-100 mb-12">
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="flex-shrink-0">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl flex items-center justify-center shadow-lg">
                  <span className="text-5xl">👤</span>
                </div>
              </div>
              <div className="text-center md:text-left">
                <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
                  Ваш личный куратор
                </h3>
                <p className="text-lg text-gray-600 mb-4">
                  Живой человек, который ведёт ваш дневник питания — вам не нужно ничего считать.
                  Присылаете фото еды → куратор вносит. Просто и без рутины.
                </p>
                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  <span className="bg-green-100 text-green-700 text-sm font-medium px-4 py-1.5 rounded-full">
                    Ведёт дневник
                  </span>
                  <span className="bg-blue-100 text-blue-700 text-sm font-medium px-4 py-1.5 rounded-full">
                    Ответ ≤30 мин
                  </span>
                  <span className="bg-purple-100 text-purple-700 text-sm font-medium px-4 py-1.5 rounded-full">
                    Рядом при срыве
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* What else you get */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
              <div className="text-3xl mb-3">📱</div>
              <h4 className="font-semibold text-gray-900 mb-2">Приложение</h4>
              <p className="text-gray-600 text-sm">
                Где я сейчас? Что дальше? Вся аналитика понятно и без перегруза.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
              <div className="text-3xl mb-3">🎯</div>
              <h4 className="font-semibold text-gray-900 mb-2">Ритм</h4>
              <p className="text-gray-600 text-sm">
                Утро → план. День → корректировка. Вечер → итоги. Неделя → созвон.
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
              <div className="text-3xl mb-3">🛟</div>
              <h4 className="font-semibold text-gray-900 mb-2">Анти-срыв</h4>
              <p className="text-gray-600 text-sm">
                В сложный момент — не один. Написать можно сразу, ответят быстро.
              </p>
            </div>
          </div>

          {/* Key message */}
          <div className="text-center">
            <p className="text-2xl md:text-3xl font-medium text-gray-900">
              «Вас <span className="text-blue-600 font-bold">ведут</span>,
              <br className="md:hidden" />
              а не оставляют с цифрами»
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
