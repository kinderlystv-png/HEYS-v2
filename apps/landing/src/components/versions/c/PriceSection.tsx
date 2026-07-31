// Блок 4 версии C — «Сколько и что дальше».
//
// Карточка тарифа отвечает на «что я получу», а не пересказывает регламент:
// у версии A на Pro приходится восемь пунктов в двух группах, здесь — три.
// Подробный состав сопровождения уходит во второй слой (блок 6).
//
// Цены и роли тарифов берутся из общего источника `pricing.ts` и не меняются:
// Pro — основной, Self — самостоятельный режим, Pro Спорт — ручной пилот
// (архитектура `44`, состав `43`).

import PriceObjections from '@/components/versions/c/PriceObjections';
import { PRICING } from '@/config/pricing';

const PLANS = [
  {
    id: 'pro',
    plan: PRICING.pro,
    badge: 'Основной формат',
    lead: 'Дневник ведёт куратор',
    points: [
      'Присылаете фото, текст или голос — заносит куратор',
      'Видит питание, сон и нагрузку в одной картине недели',
      'Разбор недели и один следующий шаг',
    ],
    cta: { label: 'Оставить заявку на 7 дней Pro', href: '#trial' },
    note: '0 ₽ · без карты и автосписаний',
    featured: true,
  },
  {
    id: 'base',
    plan: PRICING.base,
    lead: 'Дневник ведёте сами',
    points: [
      'Питание, КБЖУ и динамика по дням',
      'Своя база продуктов и история',
      'Тренировочный дневник',
    ],
    cta: null,
    note: 'Без участия куратора',
    featured: false,
  },
  {
    id: 'proPlus',
    plan: PRICING.proPlus,
    badge: 'Пилот · до 4 участников',
    lead: 'Pro + персональный онлайн-тренер',
    points: [
      'Всё сопровождение Pro',
      'Персональная программа тренировок',
      'Один общий созвон по питанию и тренировкам каждую неделю',
    ],
    cta: { label: 'Обсудить Pro Спорт', href: 'https://t.me/heyslab_support_bot' },
    note: 'Оплата после личного согласования',
    featured: false,
  },
];

export default function PriceSection() {
  return (
    <section id="pricing" className="bg-white px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
          Какую помощь вы хотите получить?
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">
          Все цены — за месяц. Без скрытых доплат и автосписаний.
        </p>

        <div className="mt-7 space-y-4">
          {PLANS.map((item) => (
            <article
              key={item.id}
              className={`rounded-3xl border p-5 ${
                item.featured
                  ? 'border-blue-200 bg-blue-50/40 shadow-sm'
                  : 'border-slate-200 bg-white'
              }`}
            >
              {item.badge ? (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                  {item.badge}
                </p>
              ) : null}

              <div className="mt-1 flex items-baseline gap-2">
                <h3 className="text-lg font-bold text-slate-900">{item.plan.name}</h3>
                <span className="text-lg font-bold text-slate-900">{item.plan.price}</span>
                <span className="text-sm text-slate-500">{item.plan.period}</span>
              </div>

              <p className="mt-1 text-sm font-medium text-slate-700">{item.lead}</p>

              <ul className="mt-3 space-y-1.5">
                {item.points.map((point) => (
                  <li key={point} className="flex gap-2 text-[14px] leading-5 text-slate-600">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400"
                    />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              {item.cta ? (
                <a
                  href={item.cta.href}
                  className={`mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors ${
                    item.featured
                      ? 'bg-[#1D70B7] text-white hover:bg-[#185F9D]'
                      : 'border border-slate-300 text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {item.cta.label}
                </a>
              ) : null}

              <p className="mt-2 text-center text-[12px] text-slate-500">{item.note}</p>
            </article>
          ))}
        </div>

        {/* Возражения снимаем здесь, а не в подвале: решение принимается тут. */}
        <PriceObjections />
      </div>
    </section>
  );
}
