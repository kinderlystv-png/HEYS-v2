import TrialForm from './TrialForm'

export default function Trial() {
  return (
    <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-700" id="trial">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Левая часть - текст */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="inline-block bg-white/20 backdrop-blur text-white text-sm font-medium px-4 py-2 rounded-full mb-8">
                🎁 Бесплатный триал
              </div>
              
              {/* Heading */}
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Попробуйте не быть одни
              </h2>
              
              <p className="text-xl text-blue-100 mb-8">
                7 дней Pro бесплатно — с куратором, который ведёт дневник за вас. 
                Без привязки карты, без обязательств.
              </p>
              
              {/* What you get */}
              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-3 text-white">
                  <span className="text-2xl">📱</span>
                  <span>Полный доступ к приложению</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <span className="text-2xl">👤</span>
                  <span>Личный куратор ведёт дневник</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <span className="text-2xl">💬</span>
                  <span>Ежедневная поддержка в чате</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <span className="text-2xl">📊</span>
                  <span>Еженедельный разбор с видеосозвоном</span>
                </div>
              </div>
              
              {/* Trust */}
              <p className="text-blue-200 text-sm">
                ✓ Триал начинается с первого внесённого приёма пищи<br/>
                ✓ Отменить можно в любой момент
              </p>
            </div>
            
            {/* Правая часть - форма */}
            <div>
              <TrialForm />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
