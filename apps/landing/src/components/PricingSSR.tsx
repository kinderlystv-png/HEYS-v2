// PricingSSR.tsx — Server Component версия прайсинга
// Рендерится на сервере для SEO

import PurchaseButton from './PurchaseButton'
import SectionBadgeBar from './SectionBadgeBar'

import type { LandingVariant, VariantContent } from '@/config/landing-variants'
import { SUPPORT_CONTACTS } from '@/config/legal-versions'
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
      description: 'Для тех, кому нужен понятный дневник без сопровождения.',
      value: 'Питание, динамика и история собраны в одном месте — вы ведёте и оцениваете неделю самостоятельно.',
      features: [
        'Не нужно собирать записи по заметкам и таблицам',
        'КБЖУ, приёмы пищи и динамика видны вместе',
        'История и своя база продуктов остаются под рукой',
      ],
      details: [
        'Дневник питания с расчётом КБЖУ',
        'Динамика по дням и неделям',
        'Виджеты, задачи, база продуктов и история',
        'Существующий тренировочный дневник',
      ],
      cta: 'Попробовать Pro (0 ₽)', hasTrial: true, directCta: 'Выбрать Self',
      primaryAction: 'purchase' as const,
      featured: false,
      cardOrder: 'order-2 md:order-1',
    },
    {
      id: 'pro',
      name: PRICING.pro.name,
      price: PRICING.pro.price,
      period: PRICING.pro.period,
      description: 'Для тех, кто хочет снять с себя ручное ведение дневника.',
      value: 'Куратор превращает ваши фото и сообщения в заполненный дневник, сохраняет контекст недели и помогает выбрать следующий выполнимый шаг.',
      features: [
        'Меньше рутины: достаточно прислать фото, текст или голос',
        'Питание, режим и обстоятельства недели рассматриваются вместе',
        'К концу недели — понятный итог и следующий шаг',
        'После сбоя не нужно начинать всё заново',
      ],
      details: [
        'Ведение дневника куратором',
        'Связь в выбранном канале или HEYS-мессенджере',
        'Недельный разбор 20–45 минут',
        'Одна асинхронная корректировка при необходимости',
        '«Итог недели» с наблюдениями и следующим шагом',
        'RiskRadar и актуальные виджеты HEYS',
      ],
      cta: 'Оставить заявку на неделю Pro (0 ₽)', hasTrial: true, directCta: 'Оформить Pro на месяц',
      primaryAction: 'trial' as const,
      featured: true,
      badge: 'Основной формат',
      note: 'Первая неделя Pro — 0 ₽, без карты и автосписаний.',
      cardOrder: 'order-1 md:order-2',
    },
    {
      id: 'pro-plus',
      name: PRICING.proPlus.name,
      price: PRICING.proPlus.price,
      period: PRICING.proPlus.period,
      description: 'Для тех, кому важно согласовать питание и тренировки.',
      value: 'Один специалист видит питание, нагрузку и восстановление, ведёт оба дневника и корректирует план по фактической неделе.',
      features: [
        'Не нужно пересказывать один контекст двум специалистам',
        'Питание и тренировки собраны в одной картине недели',
        'Программа меняется по фактическому выполнению',
        'Понятный маршрут действий на ближайшие четыре недели',
      ],
      details: [
        'Всё сопровождение тарифа Pro',
        'Стартовая встреча до 60 минут',
        '«Маршрут на четыре недели»: персональная программа',
        'Ведение тренировочного дневника',
        'Один общий созвон 45–60 минут в неделю',
        'Одна асинхронная корректировка в середине недели',
        'Разбор техники до двух упражнений в неделю',
        'Обновление программы по необходимости, не чаще раза в неделю',
      ],
      cta: 'Обсудить Pro Спорт', hasTrial: false, directCta: 'Обсудить Pro Спорт',
      primaryAction: 'purchase' as const,
      featured: false,
      premium: true,
      applicationOnly: true,
      badge: 'Первый набор · 4 места',
      note: 'Для следующего набора цена составит 26 990 ₽/мес.',
      cardOrder: 'order-3',
    },
  ]

  return (
    <section className="relative pb-12 bg-gray-50" id="pricing">

      <SectionBadgeBar>07 — ФОРМАТЫ И ТАРИФЫ</SectionBadgeBar>
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section header */}
          <div className="mb-12 text-center md:mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{pricing.intro}</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              Self — инструменты для самостоятельного ведения. В Pro дневник и контекст недели берёт на себя куратор. Pro Спорт добавляет персональную тренировочную программу в том же сопровождении.
            </p>
            <p className="mt-3 text-sm text-gray-500 max-w-xl mx-auto">
              Без скрытых доплат, скидочных таймеров и автосписаний.
            </p>
          </div>

          {/* Pricing cards */}
          <div className="grid items-start gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl p-6 sm:p-7 md:p-8 ${plan.cardOrder} ${plan.featured ? 'md:-translate-y-3' : ''} ${plan.premium
                  ? 'bg-[linear-gradient(155deg,#4B4D91_0%,#35376F_100%)] border border-[#7778A6] text-white shadow-[0_18px_42px_rgba(67,69,135,0.18)]'
                  : plan.featured
                    ? 'bg-[linear-gradient(180deg,#F8FCFF_0%,#EEF7FD_48%,#FFFFFF_100%)] border-2 border-[#52A0D8] shadow-[0_18px_48px_rgba(29,112,183,0.14)] ring-1 ring-[#E2ECF2]'
                    : 'bg-[linear-gradient(180deg,#FFFEFA_0%,#FFF8E8_100%)] border border-[#E9D8A6] shadow-[0_12px_34px_rgba(180,140,44,0.08)]'
                  }`}
              >
                {plan.badge ? (
                  <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold leading-none shadow-[0_6px_18px_rgba(67,69,135,0.12)] ${plan.premium ? 'border border-white/30 bg-[#F4F2FA] text-[#434587]' : 'border border-[#B8D9EF] bg-white text-[#434587]'}`}>
                      {plan.badge}
                    </span>
                  </div>
                ) : null}

                <div className="text-center mb-5">
                  <h3 className={`mb-2 text-lg font-bold ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className={`text-3xl font-bold tracking-normal sm:text-4xl ${plan.premium ? 'text-white' : 'text-gray-900'}`}>{plan.price}</span>
                    <span className={`text-sm ${plan.premium ? 'text-[#E2ECF2]' : 'text-gray-500'}`}>{plan.period}</span>
                  </div>
                  <p className={`mt-2 text-[13px] leading-relaxed sm:text-sm ${plan.premium ? 'text-white/85' : 'text-gray-600'}`}>{plan.description}</p>
                  {plan.note ? (
                    <p className={`mt-3 rounded-xl px-3 py-2 text-[11px] leading-snug sm:text-[12px] ${plan.premium ? 'border border-white/20 bg-white/10 text-white/90' : 'border border-[#DCECF8] bg-white/80 text-[#434587]'}`}>{plan.note}</p>
                  ) : null}
                </div>

                <div className={`mb-5 rounded-xl px-4 py-3.5 ${plan.premium ? 'border border-white/20 bg-white/10' : plan.featured ? 'border border-[#C9DDEA] bg-white/80' : 'border border-black/[0.06] bg-white/65'}`}>
                  <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.09em] ${plan.premium ? 'text-[#E2ECF2]' : 'text-[#434587]'}`}>
                    Что вы получаете
                  </p>
                  <p className={`text-[13px] font-medium leading-relaxed ${plan.premium ? 'text-white' : 'text-gray-800'}`}>
                    {plan.value}
                  </p>
                </div>

                <p className={`mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] ${plan.premium ? 'text-[#E2ECF2]' : 'text-[#434587]'}`}>
                  Что меняется для вас
                </p>
                <ul className="mb-5 space-y-2.5">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${plan.premium ? 'bg-white/15 text-[#DEEDDB]' : 'bg-[#DEEDDB] text-[#1A7F3C]'}`}>✓</span>
                      <span className={`text-[13px] leading-[1.45] sm:text-sm sm:leading-relaxed ${plan.premium ? 'text-white/90' : 'text-gray-700'}`}>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className={`mb-6 border-t pt-4 ${plan.premium ? 'border-white/15' : 'border-black/10'}`}>
                  <p className={`mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] ${plan.premium ? 'text-[#E2ECF2]' : 'text-[#434587]'}`}>
                    В тариф входит
                  </p>
                  <ul className="space-y-2">
                    {plan.details.map((detail) => (
                      <li key={detail} className={`flex items-start gap-2 text-[12px] leading-relaxed sm:text-[13px] ${plan.premium ? 'text-white/80' : 'text-gray-600'}`}>
                        <span className={`mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full ${plan.premium ? 'bg-[#B8D9EF]' : 'bg-[#7778A6]'}`} aria-hidden="true" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto">
                {plan.applicationOnly ? (
                  <>
                    <a
                      href={SUPPORT_CONTACTS.telegramUrl}
                      className="flex min-h-[46px] w-full items-center justify-center rounded-xl border border-white/30 bg-white px-4 py-3 text-center text-[13px] font-semibold leading-snug text-[#434587] transition-colors hover:bg-[#F4F2FA] sm:text-sm"
                    >
                      Обсудить участие
                    </a>
                    <p className="mt-3 text-center text-[11px] leading-relaxed text-white/65 sm:text-[12px]">
                      Без бесплатной недели. Оплата — только после личного согласования формата.
                    </p>
                  </>
                ) : plan.primaryAction === 'trial' ? (
                  <>
                    <a
                      href="#trial"
                      className="flex min-h-[46px] w-full items-center justify-center rounded-xl bg-[#1D70B7] px-4 py-3 text-center text-[13px] font-semibold leading-snug text-white shadow-[0_10px_22px_rgba(29,112,183,0.18)] transition-colors hover:bg-[#185F9D] sm:text-sm"
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
                  <>
                    <PurchaseButton
                      planName={plan.name}
                      planPrice={`${plan.price} ${plan.period}`}
                      featured={plan.featured ?? false}
                      premium={plan.premium ?? false}
                      ctaText={plan.directCta}
                      isPrimary={true}
                    />
                    <a
                      href="#trial"
                      className="mt-3 flex min-h-[44px] w-full items-center justify-center px-3 text-center text-[13px] font-medium text-gray-500 transition-colors hover:text-[#1D70B7]"
                    >
                      Сначала попробовать Pro (0 ₽)
                    </a>
                  </>
                )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-[#C9DDEA] bg-[linear-gradient(135deg,#F7FBFE_0%,#F4F2FA_55%,#FFFFFF_100%)]">
            <div className="flex items-start gap-3 px-5 py-5 sm:px-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#434587] shadow-sm ring-1 ring-[#DCECF8]" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v18M3 12h18" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
                  Можно влиять на развитие HEYS
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                  Участники Pro и Pro Спорт могут передавать идеи через куратора и участвовать в отобранных голосованиях.
                </p>
                <details className="group mt-4 border-t border-[#D7E5EE] pt-4">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-[#434587] marker:content-none">
                    <span>Как рассматриваются предложения</span>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </summary>
                  <p className="pb-1 pt-2 text-sm leading-relaxed text-gray-600">
                    Если предложение подходит многим, команда может вынести его на консультативное голосование. Голосование помогает определить приоритет; решение о реализации, объёме и сроках остаётся за HEYS.
                  </p>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
