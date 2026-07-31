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
import TrustStrip from '@/components/versions/c/TrustStrip';
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
    // На мобильном порядок — как в массиве: основной формат первым. В ряду на
    // десктопе он встаёт в середину, потому что центр ряда читается как
    // рекомендованный выбор.
    desktopOrder: 'lg:order-2',
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
    desktopOrder: 'lg:order-1',
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
    desktopOrder: 'lg:order-3',
  },
];

export default function PriceSection() {
  return (
    <section id="pricing" className="bg-white px-5 py-14 sm:px-8 sm:py-16">
      {/* На широком экране колонка расширяется только под этот блок: три тарифа
          в столбик оставляли по 352 px пустоты с каждой стороны и заставляли
          сравнивать их по памяти. Текстовые блоки страницы остаются узкими —
          широкая строка читается хуже. */}
      <div className="mx-auto w-full max-w-xl lg:max-w-4xl">
        {/* Опора на исполнителя стоит до цены, а не после: решение о деньгах
            принимается прямо здесь, а раньше единственное упоминание о том, кто
            ведёт, лежало в аккордеоне ниже тарифов. */}
        <TrustStrip />

        <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
          Какую помощь вы хотите получить?
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">
          Все цены — за месяц. Без скрытых доплат и автосписаний.
        </p>

        {/* На десктопе тарифы встают в ряд и сравниваются взглядом, а основной
            формат оказывается в середине — порядок задаётся `lg:order-*`, в
            разметке первым остаётся Pro, чтобы на мобильном он читался первым.
            `flex-col` + `mt-auto` у кнопки выравнивают действия по нижнему краю
            при разной длине списков. */}
        <div className="mt-7 space-y-4 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-5 lg:space-y-0">
          {PLANS.map((item) => (
            <article
              key={item.id}
              className={`flex flex-col rounded-3xl border p-5 ${item.desktopOrder} ${
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

              {/* Действие и сноска прижимаются к низу карточки: в ряду списки
                  разной длины, и без этого кнопки вставали бы на трёх разных
                  высотах. На мобильном карточки идут одна под другой, и прижим
                  ничего не меняет. */}
              <div className="lg:mt-auto lg:pt-4">
                {item.cta ? (
                  <a
                    href={item.cta.href}
                    // Явное кольцо фокуса, а не браузерный дефолт: на синей
                    // заливке Pro системный контур почти не читается, и по
                    // клавиатуре было непонятно, где ты находишься.
                    className={`mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-center text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 lg:mt-0 ${
                      item.featured
                        ? 'bg-[#1D70B7] text-white hover:bg-[#185F9D]'
                        : 'border border-slate-300 text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {item.cta.label}
                  </a>
                ) : null}

                {/* Под кнопкой сноска центрируется вместе с ней, без кнопки —
                    продолжает левый край списка, иначе висит сама по себе. */}
                <p
                  className={`text-[12px] text-slate-500 ${
                    item.cta ? 'mt-2 text-center' : 'mt-3'
                  }`}
                >
                  {item.note}
                </p>
              </div>
            </article>
          ))}
        </div>

        {/* Возражения снимаем здесь, а не в подвале: решение принимается тут. */}
        <PriceObjections />
      </div>
    </section>
  );
}
