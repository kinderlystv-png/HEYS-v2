'use client'

import FAQVariant from '@/components/FAQVariant'
import Footer from '@/components/Footer'
import HowItWorks from '@/components/HowItWorks'
import Pricing from '@/components/Pricing'
import Problem from '@/components/Problem'
import PurchaseSection from '@/components/PurchaseSection'
import Solution from '@/components/Solution'
import Trial from '@/components/Trial'
import type { LandingSectionId } from '@/config/landing-variants'
import { useVariant } from '@/context/VariantContext'

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-14">
      {eyebrow ? (
        <p className="text-sm font-medium tracking-wide text-blue-700 mb-3">{eyebrow}</p>
      ) : null}
      <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{title}</h2>
      {subtitle ? <p className="text-lg text-gray-600">{subtitle}</p> : null}
    </div>
  )
}

function SocialProofSection() {
  const { content } = useVariant()
  const sp = content.socialProof

  return (
    <section className="py-20 bg-white" id="socialProof">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={sp.eyebrow} title={sp.title} />

          <div className="grid md:grid-cols-2 gap-6">
            {sp.quotes.slice(0, 6).map((q, i) => (
              <blockquote key={i} className="rounded-2xl border border-gray-200 bg-gray-50 px-6 py-6">
                <p className="text-gray-800 leading-relaxed">{q}</p>
              </blockquote>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function DelegateSection() {
  const { content } = useVariant()
  const d = content.delegate

  return (
    <section className="py-20 bg-gray-50" id="delegate">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={d.eyebrow} title={d.title} />

          <div className="grid md:grid-cols-3 gap-6">
            {d.cards.map((c, i) => (
              <div key={i} className="rounded-2xl bg-white border border-gray-200 p-6">
                <div className="text-3xl mb-4">{c.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{c.title}</h3>
                <p className="text-gray-700 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function InteractionSection() {
  const { content } = useVariant()
  const inter = content.interaction

  return (
    <section className="py-20 bg-white" id="interaction">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={inter.eyebrow} title={inter.title} subtitle={inter.note} />

          <div className="grid md:grid-cols-3 gap-6">
            {inter.steps.map((s, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <div className="text-3xl mb-4">{s.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-gray-700 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FormatsSection() {
  const { content } = useVariant()
  const f = content.formats

  return (
    <section className="py-20 bg-gray-50" id="formats">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={f.eyebrow} title={f.title} />

          <div className="grid md:grid-cols-2 gap-6">
            {f.cards.map((card, i) => (
              <div
                key={i}
                className={`rounded-2xl border p-7 bg-white ${
                  card.highlight ? 'border-blue-300 shadow-sm' : 'border-gray-200'
                }`}
              >
                <h3 className="text-xl font-bold text-gray-900 mb-2">{card.title}</h3>
                <p className="text-gray-700 leading-relaxed mb-5">{card.desc}</p>
                <ul className="space-y-2">
                  {card.points.map((p, j) => (
                    <li key={j} className="flex items-start gap-3 text-gray-700">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function LayersSection() {
  const { content } = useVariant()
  const layers = content.layers

  return (
    <section className="py-20 bg-white" id="layers">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={layers.eyebrow} title={layers.title} />

          <div className="grid md:grid-cols-3 gap-6">
            {layers.items.map((it, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                <div className="text-3xl mb-4">{it.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{it.title}</h3>
                <p className="text-gray-700 leading-relaxed">{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ScreensSection() {
  const { content } = useVariant()
  const screens = content.screens

  return (
    <section className="py-20 bg-gray-50" id="screens">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={screens.eyebrow} title={screens.title} subtitle={screens.subtitle} />

          <div className="grid md:grid-cols-2 gap-6">
            {screens.items.map((it, i) => (
              <div key={i} className="rounded-2xl bg-white border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{it.title}</h3>
                <p className="text-gray-700">{it.benefit}</p>
              </div>
            ))}
          </div>

          <p className="mt-10 text-center text-gray-500 text-sm">
            Скрины продукта можно подключить как единый набор для всех вариантов, чтобы A/B/C тест оставался честным.
          </p>
        </div>
      </div>
    </section>
  )
}

function MatrixSection() {
  const { content } = useVariant()
  const m = content.matrix

  if (!m.rows.length) return null

  return (
    <section className="py-20 bg-white" id="matrix">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeading eyebrow={m.eyebrow} title={m.title} subtitle={m.subtitle} />

          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-[720px] w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-700">Параметр</th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-700">Base</th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-700">Pro</th>
                  <th className="px-5 py-4 text-sm font-semibold text-gray-700">Pro+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {m.rows.map((row, i) => (
                  <tr key={i} className="bg-white">
                    <td className="px-5 py-4 text-gray-900 font-medium">{row.label}</td>
                    <td className="px-5 py-4 text-gray-700">{row.base}</td>
                    <td className="px-5 py-4 text-gray-700">{row.pro}</td>
                    <td className="px-5 py-4 text-gray-700">{row.proPlus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

function CasesSection() {
  const { content } = useVariant()
  const cases = content.cases

  if (!cases.items.length) return null

  return (
    <section className="py-20 bg-gray-50" id="cases">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={cases.eyebrow} title={cases.title} />

          <div className="grid md:grid-cols-2 gap-6">
            {cases.items.map((it, i) => (
              <div key={i} className="rounded-2xl bg-white border border-gray-200 p-6">
                <p className="text-gray-500 text-sm mb-2">Было</p>
                <p className="text-gray-900 font-medium mb-4">{it.before}</p>
                <p className="text-gray-500 text-sm mb-2">Стало</p>
                <p className="text-gray-900 font-medium">{it.after}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function DoDontSection() {
  const { content } = useVariant()
  const dd = content.doDont

  return (
    <section className="py-20 bg-white" id="doDont">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={dd.eyebrow} title={dd.title} />

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">✅ Делаем</h3>
              <ul className="space-y-2">
                {dd.do.map((it, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700">
                    <span className="text-green-600 mt-0.5">✓</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">⛔️ Не делаем</h3>
              <ul className="space-y-2">
                {dd.dont.map((it, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700">
                    <span className="text-red-600 mt-0.5">✕</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MethodSection() {
  const { content } = useVariant()
  const m = content.method

  return (
    <section className="py-20 bg-gray-50" id="method">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={m.eyebrow} title={m.title} />

          <div className="space-y-4">
            {m.steps.map((s, i) => (
              <div key={i} className="rounded-2xl bg-white border border-gray-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{s.title}</h3>
                    <p className="text-gray-700 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function SlaSection() {
  const { content } = useVariant()
  const sla = content.sla

  return (
    <section className="py-20 bg-white" id="sla">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={sla.eyebrow} title={sla.title} subtitle={sla.note} />

          {sla.items.length ? (
            <div className="grid md:grid-cols-3 gap-6 mb-10">
              {sla.items.map((it, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <p className="text-sm text-gray-500 mb-1">{it.label}</p>
                  <p className="text-gray-900 font-semibold">{it.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {sla.protocol.length ? (
            <div className="grid md:grid-cols-2 gap-6">
              {sla.protocol.map((p, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{p.icon}</div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{p.label}</h3>
                      <p className="text-gray-700 leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function SecuritySection() {
  const { content } = useVariant()
  const sec = content.security

  return (
    <section className="py-20 bg-gray-50" id="security">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={sec.eyebrow} title={sec.title} />

          <div className="grid md:grid-cols-2 gap-8">
            <div className="rounded-2xl bg-white border border-gray-200 p-7">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Коротко</h3>
              <ul className="space-y-2">
                {sec.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-700">
                    <span className="text-blue-700 mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white border border-gray-200 p-7">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Документы</h3>
              <div className="space-y-3">
                {sec.links.map((l, i) => (
                  <a
                    key={i}
                    href={l.href}
                    className="block rounded-xl border border-gray-200 px-4 py-3 text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function VariantLandingSections() {
  const { content } = useVariant()
  const order = content.page.order

  const renderSection = (id: LandingSectionId) => {
    switch (id) {
      case 'socialProof':
        return <SocialProofSection />
      case 'delegate':
        return <DelegateSection />
      case 'interaction':
        return <InteractionSection />
      case 'formats':
        return <FormatsSection />
      case 'problem':
        return <Problem />
      case 'solution':
        return <Solution />
      case 'howItWorks':
        return <HowItWorks />
      case 'layers':
        return <LayersSection />
      case 'screens':
        return <ScreensSection />
      case 'matrix':
        return <MatrixSection />
      case 'cases':
        return <CasesSection />
      case 'doDont':
        return <DoDontSection />
      case 'method':
        return <MethodSection />
      case 'sla':
        return <SlaSection />
      case 'security':
        return <SecuritySection />
      case 'pricing':
        return <Pricing />
      case 'trial':
        return <Trial />
      case 'purchase':
        return <PurchaseSection />
      case 'faq':
        return <FAQVariant />
      case 'footer':
        return <Footer />
      default:
        return null
    }
  }

  return (
    <>
      {order.map((sectionId, idx) => {
        const el = renderSection(sectionId)
        if (!el) return null

        // Якорь "heys — это" и стрелка из Hero всегда ведут на первый блок.
        if (idx === 0) {
          return (
            <div key={sectionId} id="what-is-heys">
              {el}
            </div>
          )
        }

        return <div key={sectionId}>{el}</div>
      })}
    </>
  )
}
