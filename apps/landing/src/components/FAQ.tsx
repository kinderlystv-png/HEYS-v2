'use client'

import { useState } from 'react'

const faqs = [
  {
    question: 'Кто такой куратор?',
    answer: 'Куратор — это человек, который ведёт ваш дневник питания, отвечает на вопросы и поддерживает вас каждый день. Он не врач и не ставит диагнозы, но помогает выстроить здоровый режим питания и удерживать фокус на цели.'
  },
  {
    question: 'Что значит «куратор ведёт дневник»?',
    answer: 'Вы присылаете фото еды в мессенджер. Куратор сам определяет продукты, рассчитывает КБЖУ и вносит в ваш дневник. Вам не нужно искать продукты в базе, взвешивать и считать — всё это делаем мы.'
  },
  {
    question: 'Когда отвечает куратор?',
    answer: 'В рабочие часы 09:00–21:00 куратор отвечает в течение 30 минут. В выходные и праздники работает дежурный режим — сообщения обрабатываются батчами, но вы всё равно не остаётесь без поддержки.'
  },
  {
    question: 'Что если я сорвусь?',
    answer: 'Срывы — часть пути, не катастрофа. Куратор не осудит, а поможет разобраться в причинах и спланировать следующие шаги. Именно для этого нужен человек рядом — чтобы после срыва не бросить всё, а продолжить.'
  },
  {
    question: 'Чем HEYS отличается от обычного трекера?',
    answer: 'Трекер — это инструмент, который вы используете в одиночку. HEYS — это сопровождение живым человеком. Куратор снимает рутину (ведёт дневник за вас), держит фокус и поддерживает в сложные моменты.'
  },
  {
    question: 'Можно ли отменить подписку?',
    answer: 'Да, в любой момент. Подписка без автопродления — вы сами решаете, продлевать или нет. Мы не верим в удержание «по забывчивости».'
  }
]

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="py-20 bg-white" id="faq">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Частые вопросы
            </h2>
          </div>
          
          {/* FAQ items */}
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900">
                    {faq.question}
                  </span>
                  <span className="text-2xl text-gray-400">
                    {openIndex === index ? '−' : '+'}
                  </span>
                </button>
                
                {openIndex === index && (
                  <div className="px-6 pb-4 text-gray-600 bg-gray-50">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
