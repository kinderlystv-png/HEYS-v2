'use client'

import { useVariant } from '@/context/VariantContext'

export default function FAQVariant() {
  const { content } = useVariant()
  const faq = content.faq

  return (
    <section className="py-20 bg-white" id="faq">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            {faq.eyebrow ? (
              <p className="text-sm font-medium tracking-wide text-blue-700 mb-3">
                {faq.eyebrow}
              </p>
            ) : null}
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{faq.title}</h2>
            {faq.subtitle ? <p className="text-lg text-gray-600">{faq.subtitle}</p> : null}
          </div>

          <div className="space-y-6">
            {faq.items.map((item, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6">
                  <span className="text-lg font-semibold text-gray-900">{item.q}</span>
                  <span className="text-gray-500 transition-transform group-open:rotate-180">
                    ▼
                  </span>
                </summary>
                <div className="mt-4 text-gray-700 leading-relaxed whitespace-pre-line">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
