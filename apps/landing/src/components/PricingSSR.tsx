// PricingSSR.tsx — Server Component версия прайсинга
// Рендерится на сервере для SEO

import PurchaseButton from './PurchaseButton'
import SectionBadgeBar from './SectionBadgeBar'

import type { LandingVariant, VariantContent } from '@/config/landing-variants'
import { PRICING } from '@/config/pricing'

interface PricingSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function PricingSSR({ content, variant: _variant }: PricingSSRProps) {
  const pricing = content.pricing

  const plans = [
    {
      id: 'base',
      name: PRICING.base.name,
      price: PRICING.base.price,
      period: PRICING.base.period,
      description: 'Самостоятельный дневник и базовый контроль. Без куратора.',
      features: [
        'Вы ведёте дневник питания сами',
        'Расчёт КБЖУ и приёмов пищи',
        'Базовая динамика по дням и неделям',
        'Виджеты и задачник',
        'Своя база продуктов и история',
      ],
      cta: 'Попробовать Pro (0 ₽)', hasTrial: true, directCta: 'Выбрать Self',
      featured: false,
    },
    {
      id: 'pro',
      name: PRICING.pro.name,
      price: PRICING.pro.price,
      period: PRICING.pro.period,
      description: 'Куратор ведёт ваш дневник и держит картину недели вместе с вами.',
      features: [
        'Дневник ведёт куратор: фото, текст или голос',
        'Связь в выбранном канале или HEYS-мессенджере',
        'RiskRadar показывает, где сбивается ритм',
        'Еженедельный разбор и следующий шаг',
        'Виджеты показывают актуальную картину',
        'Бережные рамки без наказания за срывы',
      ],
      cta: 'Оставить заявку на неделю Pro (0 ₽)', hasTrial: true, directCta: 'Оформить Pro на месяц',
      featured: true,
      badge: 'Первый набор — цена фиксируется',
      note: 'Цена первого набора. Для тех, кто подключился сейчас, она не меняется. Дальше Pro будет дороже.',
    },
    {
      id: 'pro-plus',
      name: PRICING.proPlus.name,
      price: PRICING.proPlus.price,
      period: PRICING.proPlus.period,
      description: 'Всё из Pro + больше внимания к тренировкам и восстановлению.',
      features: [
        'Все опции тарифа Pro',
        'Приоритетное внимание к разбору и сопровождению',
        'Дополнительный созвон в середине недели',
        'Тренировки учитываются в недельном плане и восстановлении',
        'Куратор помогает согласовать нагрузку, питание и темп недели',
      ],
      cta: 'Оставить заявку на неделю Pro (0 ₽)', hasTrial: true, directCta: 'Выбрать Pro+',
      featured: false,
      premium: true,
    },
  ]

  return (
    <section className="relative pb-12 bg-gray-50" id="pricing">

      <SectionBadgeBar>09 — ТАРИФЫ</SectionBadgeBar>
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{pricing.intro}</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              В Pro и Pro+ с вами работает куратор, не алгоритм. Self — самостоятельный режим, если нужен только дневник и базовый контроль.
            </p>
            <p className="mt-3 text-sm text-gray-500 max-w-xl mx-auto">
              Цена на сайте — окончательная: без скидок с таймером, обязательных созвонов и автосписаний.
            </p>
          </div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 sm:p-7 md:p-8 ${plan.premium
                  ? 'bg-gradient-to-br from-indigo-900 to-slate-900 border-2 border-indigo-400/30 text-white shadow-xl shadow-indigo-900/10'
                  : plan.featured
                    ? 'bg-[linear-gradient(180deg,#F8FCFF_0%,#EEF7FD_48%,#FFFFFF_100%)] border border-[#AFCFE9] shadow-[0_18px_50px_rgba(67,69,135,0.12)] ring-1 ring-[#E2ECF2]'
                    : 'bg-[linear-gradient(180deg,#FFFEFA_0%,#FFF8E8_100%)] border border-[#E9D8A6] shadow-[0_12px_34px_rgba(180,140,44,0.08)]'
                  }`}
              >
                {plan.badge ? (
                  <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold leading-none shadow-[0_6px_18px_rgba(67,69,135,0.12)] ${plan.premium ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20' : 'border border-[#DCECF8] bg-white text-[#434587]'}`}>
                      {plan.badge}
                    </span>
                  </div>
                ) : null}

                <div className="text-center mb-5">
                  <h3 className={`text-lg font-bold mb-2 ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className={`text-3xl sm:text-4xl font-bold tracking-normal ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                    <span className={`text-sm ${plan.premium ? 'text-indigo-200/70' : 'text-gray-500'}`}>{plan.period}</span>
                  </div>
                  <p className={`mt-2 text-[13px] leading-relaxed sm:text-sm ${plan.premium ? 'text-indigo-100/90' : 'text-gray-600'}`}>{plan.description}</p>
                  {plan.note ? (
                    <p className="mt-3 rounded-xl border border-[#DCECF8] bg-white/80 px-3 py-2 text-[11px] leading-snug text-[#434587] sm:text-[12px]">{plan.note}</p>
                  ) : null}
                </div>

                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${plan.premium ? 'bg-white/10 text-indigo-200' : 'bg-[#DEEDDB] text-[#1A7F3C]'}`}>✓</span>
                      <span className={`text-[13px] leading-[1.45] sm:text-sm sm:leading-relaxed ${plan.premium ? 'text-indigo-50/90' : 'text-gray-700'}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.hasTrial ? (
                  <>
                    <a
                      href="#trial"
                      className={`flex min-h-[46px] w-full items-center justify-center rounded-xl px-4 py-3 text-center text-[13px] font-semibold leading-snug transition-colors sm:text-sm ${plan.premium
                        ? 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                        : plan.featured
                          ? 'bg-[#1D70B7] text-white shadow-[0_10px_22px_rgba(29,112,183,0.18)] hover:bg-[#185F9D]'
                          : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                        }`}
                    >
                      {plan.cta}
                    </a>
                    <PurchaseButton
                      planName={plan.name}
                      planPrice={`${plan.price} ${plan.period}`}
                      featured={plan.featured ?? false}
                      premium={plan.premium ?? false} ctaText={plan.directCta}
                    />
                  </>
                ) : (
                  <PurchaseButton
                    planName={plan.name}
                    planPrice={`${plan.price} ${plan.period}`}
                    featured={plan.featured ?? false}
                    premium={plan.premium ?? false}
                    ctaText={plan.directCta}
                    isPrimary={true}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
