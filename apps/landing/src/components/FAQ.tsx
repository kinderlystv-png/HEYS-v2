'use client'

import { useState } from 'react'

const faqs = [
  {
    question: 'Кто такой куратор?',
    answer: 'Куратор — это специалист по питанию (нутрициолог), который ведёт ваш дневник, отвечает на вопросы и поддерживает вас. Он не врач и не ставит диагнозы, но помогает выстроить здоровый режим питания и удерживать фокус на цели.'
  },
  {
    question: 'Что значит «куратор ведёт дневник»?',
    answer: 'Вы просто присылаете фото еды в мессенджер. Куратор сам определяет продукты, рассчитывает КБЖУ и вносит в ваш дневник. Вам не нужно искать продукты, взвешивать и считать — всё это делаем мы.'
  },
  {
    question: 'В какое время отвечает куратор?',
    answer: 'Рабочие часы: 09:00–21:00 (по вашему времени). В это время куратор отвечает в течение 30 минут. Вечером и в выходные работает дежурный режим — сообщения обрабатываются утром следующего рабочего дня.'
  },
  {
    question: 'Что если я сорвусь?',
    answer: 'Срывы — часть пути, не катастрофа. Куратор поддержит, поможет разобраться в причинах и спланировать следующие шаги. Мы не осуждаем, а помогаем вернуться в колею.'
  },
  {
    question: 'Можно ли отменить подписку?',
    answer: 'Да, в любой момент. Подписка без автопродления — вы сами решаете, продлевать или нет. Если отменяете до конца оплаченного периода, доступ сохраняется до его окончания.'
  },
  {
    question: 'Есть ли гарантия результата?',
    answer: 'Мы не можем гарантировать конкретный результат — он зависит от многих факторов. Но мы гарантируем качественное сопровождение, системный подход и поддержку на каждом шаге.'
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
