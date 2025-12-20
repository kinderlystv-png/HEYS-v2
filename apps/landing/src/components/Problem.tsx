export default function Problem() {
  return (
    <section className="py-24 bg-white" id="problem">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          {/* Main insight */}
          <div className="mb-12">
            <p className="text-lg text-gray-500 mb-4 tracking-wide uppercase">
              Почему не получается?
            </p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Проблема не в силе воли.
              <br />
              <span className="text-blue-600">Проблема — в одиночестве.</span>
            </h2>
          </div>
          
          {/* The truth */}
          <div className="bg-gray-50 rounded-3xl p-8 md:p-12 mb-12">
            <p className="text-xl md:text-2xl text-gray-700 leading-relaxed">
              Вы знаете, что нужно делать. Информации&nbsp;море.
            </p>
            <p className="text-xl md:text-2xl text-gray-700 leading-relaxed mt-4">
              Но вечером, после трудного дня,
              <br />
              когда сила воли на&nbsp;нуле&nbsp;—
            </p>
            <p className="text-xl md:text-2xl font-semibold text-gray-900 mt-4">
              рядом никого.
            </p>
          </div>
          
          {/* Three points - compact */}
          <div className="grid md:grid-cols-3 gap-6 text-left">
            <div className="p-6">
              <div className="text-3xl mb-3">📊</div>
              <p className="text-gray-600">
                <span className="font-medium text-gray-900">Трекеры</span> — рутина. 
                Через неделю надоедает, через месяц — забрасываешь.
              </p>
            </div>
            
            <div className="p-6">
              <div className="text-3xl mb-3">🤖</div>
              <p className="text-gray-600">
                <span className="font-medium text-gray-900">Приложения</span> — бездушные. 
                Цифры есть, а «как дела?» — нет.
              </p>
            </div>
            
            <div className="p-6">
              <div className="text-3xl mb-3">😔</div>
              <p className="text-gray-600">
                <span className="font-medium text-gray-900">После срыва</span> — вина и «с понедельника». 
                Потому что не к кому обратиться.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
