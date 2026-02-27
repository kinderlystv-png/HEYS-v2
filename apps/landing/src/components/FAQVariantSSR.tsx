// FAQVariantSSR.tsx — Server Component версия FAQ
// Рендерится на сервере для SEO

import type { LandingVariant, VariantContent } from '@/config/landing-variants'

interface FAQVariantSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function FAQVariantSSR({ content, variant: _variant }: FAQVariantSSRProps) {
  const faq = content.faq

  return (
    <section className="py-16 md:py-20 bg-white" id="faq">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            {faq.eyebrow ? (
              <p className="text-sm font-medium tracking-wide text-blue-700 mb-3">{faq.eyebrow}</p>
            ) : null}
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">{faq.title}</h2>
            {faq.subtitle ? <p className="text-base md:text-lg text-gray-600">{faq.subtitle}</p> : null}
          </div>

          <div className="space-y-6">
            {faq.items.map((item, i) => (
              <details key={i} className="group rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6">
                  <span className="text-base md:text-lg font-semibold text-gray-900">{item.q}</span>
                  <span className="text-gray-500 transition-transform group-open:rotate-180">▼</span>
                </summary>
                <div className="mt-4 text-gray-700 leading-relaxed whitespace-pre-line">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
