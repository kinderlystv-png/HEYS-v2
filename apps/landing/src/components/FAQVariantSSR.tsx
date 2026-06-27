// FAQVariantSSR.tsx — Server Component версия FAQ
// Рендерится на сервере для SEO

import FAQAccordion from './FAQAccordion'

import type { LandingVariant, VariantContent } from '@/config/landing-variants'

interface FAQVariantSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function FAQVariantSSR({ content, variant: _variant }: FAQVariantSSRProps) {
  const faq = content.faq

  return (
    <section className="relative pb-16 md:pb-20 bg-white" id="faq">

      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            {faq.eyebrow ? (
              <p className="text-sm font-medium tracking-wide text-blue-700 mb-3">{faq.eyebrow}</p>
            ) : null}
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">{faq.title}</h2>
            {faq.subtitle ? <p className="text-base md:text-lg text-gray-600">{faq.subtitle}</p> : null}
          </div>

          <div className="mt-8">
            <FAQAccordion items={faq.items} />
          </div>
        </div>
      </div>
    </section>
  )
}
