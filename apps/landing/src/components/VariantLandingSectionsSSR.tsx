// VariantLandingSectionsSSR.tsx — Server Component версия секций
// Контент рендерится на сервере и виден в HTML без JavaScript

import FAQVariantSSR from '@/components/FAQVariantSSR'
import FooterSSR from '@/components/FooterSSR'
import PricingSSR from '@/components/PricingSSR'
import TrialSSR from '@/components/TrialSSR'
import type { LandingSectionId, LandingVariant, VariantContent } from '@/config/landing-variants'

interface VariantLandingSectionsSSRProps {
  content: VariantContent
  variant: LandingVariant
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-14">
      {eyebrow ? (
        <p className="text-sm font-medium tracking-wide text-blue-700 mb-3">{eyebrow}</p>
      ) : null}
      <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">{title}</h2>
      {subtitle ? <p className="text-lg text-gray-600">{subtitle}</p> : null}
    </div>
  )
}

function SocialProofSection({ content }: { content: VariantContent }) {
  const sp = content.socialProof

  return (
    <section className="py-16 md:py-20 bg-white relative" id="socialProof">
      <div className="container mx-auto px-4 md:px-6">
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

function DelegateSection({ content }: { content: VariantContent }) {
  const d = content.delegate

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-y border-slate-200 relative" id="delegate">
      <div className="container mx-auto px-4 md:px-6">
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

function InteractionSection({ content }: { content: VariantContent }) {
  const inter = content.interaction

  return (
    <section className="py-16 md:py-20 bg-white relative" id="interaction">
      <div className="container mx-auto px-4 md:px-6">
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

function FormatsSection({ content }: { content: VariantContent }) {
  const f = content.formats

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-y border-slate-200 relative" id="formats">
                  {/* Sticky Header Badge */}
            <div className="sticky top-0 z-[100] bg-white/90 backdrop-blur-md border-b border-gray-100/50 py-3 mb-8 px-6 text-center shadow-sm w-full">
                <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[11px] font-bold tracking-widest uppercase rounded-full">07 — ФОРМАТЫ РАБОТЫ</span>
            </div>
            <div className="container mx-auto px-4 md:px-6">
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

function LayersSection({ content }: { content: VariantContent }) {
  const layers = content.layers

  return (
    <section className="py-16 md:py-20 bg-white relative" id="layers">
      <div className="container mx-auto px-4 md:px-6">
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

function MatrixSection({ content }: { content: VariantContent }) {
  const m = content.matrix
  if (!m?.rows?.length) return null

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-y border-slate-200 relative" id="matrix">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={m.eyebrow} title={m.title} subtitle={m.subtitle} />

          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white rounded-xl overflow-hidden shadow-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-6 py-4 text-gray-900 font-semibold">Аспект</th>
                  <th className="text-center px-6 py-4 text-gray-900 font-semibold">Base</th>
                  <th className="text-center px-6 py-4 text-gray-900 font-semibold">Pro</th>
                  <th className="text-center px-6 py-4 text-gray-900 font-semibold">Pro+</th>
                </tr>
              </thead>
              <tbody>
                {m.rows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    <td className="px-6 py-4 text-gray-800 font-medium">{row.label}</td>
                    <td className="text-center px-6 py-4 text-gray-600">{row.base}</td>
                    <td className="text-center px-6 py-4 text-gray-600">{row.pro}</td>
                    <td className="text-center px-6 py-4 text-gray-600">{row.proPlus}</td>
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

function SlaSection({ content }: { content: VariantContent }) {
  const s = content.sla
  if (!s?.title) return null

  return (
    <section className="py-16 md:py-20 bg-white relative" id="sla">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={s.eyebrow} title={s.title} />

          {/* Items: label/value pairs */}
          {s.items && s.items.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {s.items.map((item, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <div className="text-sm text-gray-500 mb-1">{item.label}</div>
                  <div className="text-lg font-semibold text-gray-900">{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Protocol: icon/label/desc cards */}
          {s.protocol && s.protocol.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {s.protocol.map((p, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="text-2xl mb-2">{p.icon}</div>
                  <h4 className="font-semibold text-gray-900 mb-1">{p.label}</h4>
                  <p className="text-sm text-gray-600">{p.desc}</p>
                </div>
              ))}
            </div>
          )}

          {s.note && (
            <p className="mt-6 text-sm text-gray-500 text-center">{s.note}</p>
          )}
        </div>
      </div>
    </section>
  )
}

function ProblemSection({ content }: { content: VariantContent }) {
  const p = (content as unknown as { problem?: { eyebrow?: string; title: string; points?: { icon: string; title: string; desc: string }[] } }).problem
  if (!p?.title) return null

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-y border-slate-200 relative" id="problem">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={p.eyebrow} title={p.title} />

          {p.points && p.points.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {p.points.map((pt, i) => (
                <div key={i} className="rounded-2xl bg-white border border-gray-200 p-6">
                  <div className="text-3xl mb-4">{pt.icon}</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{pt.title}</h3>
                  <p className="text-gray-700 leading-relaxed">{pt.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function SolutionSection({ content }: { content: VariantContent }) {
  const sol = (content as unknown as { solution?: { eyebrow?: string; title: string; points?: { icon: string; title: string; desc: string }[] } }).solution
  if (!sol?.title) return null

  return (
    <section className="py-16 md:py-20 bg-white relative" id="solution">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={sol.eyebrow} title={sol.title} />

          {sol.points && sol.points.length > 0 && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sol.points.map((pt, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                  <div className="text-3xl mb-4">{pt.icon}</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{pt.title}</h3>
                  <p className="text-gray-700 leading-relaxed">{pt.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection({ content }: { content: VariantContent }) {
  const hiw = (content as unknown as { howItWorks?: { eyebrow?: string; title: string; steps?: { title: string; desc: string }[] } }).howItWorks
  if (!hiw?.title) return null

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-y border-slate-200 relative" id="howItWorks">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={hiw.eyebrow} title={hiw.title} />

          {hiw.steps && hiw.steps.length > 0 && (
            <div className="space-y-6">
              {hiw.steps.map((step, i) => (
                <div key={i} className="flex gap-6 items-start">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">{step.title}</h3>
                    <p className="text-gray-700 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function SecuritySection({ content }: { content: VariantContent }) {
  const sec = content.security
  if (!sec?.title) return null

  return (
    <section className="py-16 md:py-20 bg-slate-50 border-y border-slate-200 relative" id="security">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <SectionHeading eyebrow={sec.eyebrow} title={sec.title} />

          {/* Bullets list */}
          {sec.bullets && sec.bullets.length > 0 && (
            <ul className="space-y-3 mb-8">
              {sec.bullets.map((bullet, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-green-600 mt-1">✓</span>
                  <span className="text-gray-700">{bullet}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Links */}
          {sec.links && sec.links.length > 0 && (
            <div className="flex flex-wrap gap-4">
              {sec.links.map((link, i) => (
                <a
                  key={i}
                  href={link.href}
                  className="text-blue-600 hover:underline text-sm"
                >
                  {link.label} →
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default function VariantLandingSectionsSSR({ content, variant }: VariantLandingSectionsSSRProps) {
  const order = content.page.order

  const renderSection = (id: LandingSectionId) => {
    switch (id) {
      case 'socialProof':
        return <SocialProofSection content={content} />
      case 'delegate':
        return <DelegateSection content={content} />
      case 'interaction':
        return <InteractionSection content={content} />
      case 'formats':
        return <FormatsSection content={content} />
      case 'problem':
        return <ProblemSection content={content} />
      case 'solution':
        return <SolutionSection content={content} />
      case 'howItWorks':
        return <HowItWorksSection content={content} />
      case 'layers':
        return <LayersSection content={content} />
      case 'matrix':
        return <MatrixSection content={content} />
      case 'sla':
        return <SlaSection content={content} />
      case 'security':
        return <SecuritySection content={content} />
      case 'pricing':
        return <PricingSSR content={content} variant={variant} />
      case 'trial':
        return <TrialSSR content={content} variant={variant} />
      case 'faq':
        return <FAQVariantSSR content={content} variant={variant} />
      case 'footer':
        return <FooterSSR />
      // Пропускаем purchase — он интегрирован в pricing
      case 'purchase':
        return null
      // Секции которых нет в SSR версии пока
      case 'screens':
      case 'cases':
      case 'doDont':
      case 'method':
        return null
      default:
        return null
    }
  }

  return (
    <>
      {order.map((sectionId, idx) => {
        const el = renderSection(sectionId)
        if (!el) return null

        // Якорь для первой секции
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
