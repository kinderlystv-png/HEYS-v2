export default function Problem() {
  return (
    <section className="py-20 bg-white" id="problem">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Знакомо?
            </h2>
            <p className="text-xl text-gray-600">
              Почему традиционные подходы не работают
            </p>
          </div>
          
          {/* Problems grid */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-red-50 rounded-2xl p-8 border border-red-100">
              <div className="text-4xl mb-4">😤</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                «Я знаю, что нужно делать, но не могу»
              </h3>
              <p className="text-gray-600">
                Информации о питании море. Но знание не превращается в действие. 
                Вечером сила воли заканчивается — и привет, срыв.
              </p>
            </div>
            
            <div className="bg-red-50 rounded-2xl p-8 border border-red-100">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                «Трекеры — это рутина»
              </h3>
              <p className="text-gray-600">
                Каждый приём пищи — искать продукт, взвешивать, вносить. 
                Через неделю надоедает, через месяц — забрасываешь.
              </p>
            </div>
            
            <div className="bg-red-50 rounded-2xl p-8 border border-red-100">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                «Приложения — бездушные»
              </h3>
              <p className="text-gray-600">
                Цифры, графики, уведомления. Но никто не спросит: 
                «Как дела? Что мешает сегодня?» Нет человеческой поддержки.
              </p>
            </div>
            
            <div className="bg-red-50 rounded-2xl p-8 border border-red-100">
              <div className="text-4xl mb-4">😔</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                «После срыва опускаются руки»
              </h3>
              <p className="text-gray-600">
                Переел вечером — и всё. Чувство вины, «начну с понедельника», 
                а потом снова по кругу. Нужен кто-то, кто поддержит в момент слабости.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
