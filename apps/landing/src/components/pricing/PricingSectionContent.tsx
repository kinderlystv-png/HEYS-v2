// PricingSectionContent.tsx — основное содержимое блока 07.

import { type ReactNode } from 'react';

import { SUPPORT_CONTACTS } from '../../config/legal-versions';
import { PRICING } from '../../config/pricing';
import PurchaseButton from '../PurchaseButton';

export type PricingComparisonRow = {
  label: string;
  self: string;
  pro: string;
  proSport: string;
};

export const comparisonRows = [
  {
    label: 'Кто ведёт дневник питания',
    self: 'Вы',
    pro: 'Куратор',
    proSport: 'Куратор',
  },
  {
    label: 'Помощь по ходу недели',
    self: 'Самостоятельно',
    pro: 'Куратор помогает решить, как действовать, если планы или режим меняются',
    proSport: 'Специалист помогает подстроить питание и тренировочную нагрузку под ситуацию',
  },
  {
    label: 'Недельный разбор',
    self: 'Нет',
    pro: 'Питание и ритм недели · 20–45 минут',
    proSport: 'Питание и тренировки · 45–60 минут',
  },
  {
    label: 'Кто ведёт тренировочный дневник',
    self: 'Вы',
    pro: 'Вы',
    proSport: 'Тренер',
  },
  {
    label: 'Персональная программа тренировок',
    self: 'Нет',
    pro: 'Нет',
    proSport: 'На четыре недели',
  },
  {
    label: 'Адаптация тренировочной нагрузки',
    self: 'Самостоятельно',
    pro: 'Не входит',
    proSport: 'Тренер помогает изменить ближайшую тренировку',
  },
  {
    label: 'Обновление основной программы',
    self: 'Нет',
    pro: 'Нет',
    proSport: 'По результатам выполнения, не чаще раза в неделю',
  },
  {
    label: 'Контроль техники упражнений',
    self: 'Самостоятельно',
    pro: 'Нет',
    proSport: 'Тренер разбирает упражнения текущей программы по коротким видео',
  },
  {
    label: 'На старте новой программы',
    self: 'Самостоятельно',
    pro: 'Не входит',
    proSport: 'Проверка техники упражнений новой программы',
  },
  {
    label: 'Бесплатная неделя',
    self: 'Нет',
    pro: '7 дней',
    proSport: 'Нет',
  },
] as const satisfies readonly PricingComparisonRow[];

const proDuringWeek = [
  'Все присланные приёмы заносятся в дневник.',
  'Куратор уточняет детали, если информации недостаточно.',
  'Куратор видит питание, сон, нагрузку и изменения графика в одной картине.',
  'Если меняются планы или график, куратор помогает решить, как действовать дальше.',
  'После сбоя помогает вернуться в ритм без необходимости начинать всё заново.',
] as const;

const proWeeklyReview = [
  'Подробный разбор занимает 20–45 минут.',
  'Понятно, что сработало, что мешало и на чём сосредоточиться дальше.',
  'После разбора остаются заполненный дневник, динамика и понятный итог недели.',
] as const;

const selfFeatures = [
  'Дневник питания и КБЖУ',
  'Динамика по дням и неделям',
  'Своя база продуктов и история',
  'Тренировочный дневник',
] as const;

const proSportFeatures = [
  'Всё сопровождение Pro',
  'Стартовая встреча до 60 минут',
  'Персональная программа тренировок на четыре недели',
  'Тренер ведёт тренировочный дневник и видит, что реально выполнено',
  'Один общий созвон по питанию и тренировкам 45–60 минут каждую неделю',
  'Тренер проверяет технику упражнений вашей программы по коротким видео',
  'Если обстоятельства меняются, тренер помогает перестроить ближайшую тренировку',
  'Тренер обновляет программу с учётом того, как вы реально выполняете тренировки',
] as const;

interface CompactPlanCardProps {
  planId: 'base' | 'pro-plus';
  badge?: string;
  name: string;
  price: string;
  period: string;
  positioning: string;
  description: string;
  features: readonly string[];
  order: string;
  tone: 'neutral' | 'sport';
  children: ReactNode;
}

const toneClasses = {
  neutral: 'border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]',
  sport:
    'border border-[#C9C7E6] bg-[linear-gradient(180deg,#FCFBFF_0%,#F5F3FC_100%)] shadow-[0_10px_30px_rgba(67,69,135,0.07)]',
};

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#DEEDDB] text-xs font-semibold text-[#1A7F3C]"
            aria-hidden="true"
          >
            ✓
          </span>
          <span className="text-[14px] leading-[1.5] text-gray-700 sm:text-[15px]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CompactPlanCard({
  planId,
  badge,
  name,
  price,
  period,
  positioning,
  description,
  features,
  order,
  tone,
  children,
}: CompactPlanCardProps) {
  return (
    <article
      className={`relative flex flex-col rounded-[22px] border p-5 sm:p-6 ${order} ${toneClasses[tone]}`}
      data-pricing-plan={planId}
    >
      {badge ? (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap">
          <span className="inline-flex items-center rounded-full border border-[#B8D9EF] bg-white px-3 py-1 text-[11px] font-semibold leading-none text-[#434587] shadow-[0_6px_16px_rgba(67,69,135,0.1)]">
            {badge}
          </span>
        </div>
      ) : null}

      <header className="text-center">
        <h3 className="text-lg font-bold text-gray-900">{name}</h3>
        <div className="mt-2 flex items-baseline justify-center gap-1">
          <span className="text-3xl font-bold tracking-normal text-gray-900 sm:text-[34px]">
            {price}
          </span>
          <span className="text-sm text-gray-500">{period}</span>
        </div>
        <p className="mt-3 text-sm font-semibold leading-snug text-[#434587]">{positioning}</p>
      </header>

      <p className="mt-4 text-[14px] leading-relaxed text-gray-600 sm:text-[15px]">{description}</p>

      <div className="mt-5">
        <FeatureList items={features} />
      </div>

      <div className="mt-auto pt-6">{children}</div>
    </article>
  );
}

function ProPlanCard() {
  return (
    <article
      className="relative rounded-[22px] border-2 border-[#52A0D8] bg-[linear-gradient(180deg,#F8FCFF_0%,#EEF7FD_46%,#FFFFFF_100%)] p-5 shadow-[0_18px_44px_rgba(29,112,183,0.13)] sm:p-7 md:col-span-5"
      data-pricing-plan="pro"
    >
      <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap">
        <span className="inline-flex items-center rounded-full border border-[#B8D9EF] bg-white px-3 py-1 text-[11px] font-semibold leading-none text-[#434587] shadow-[0_6px_16px_rgba(67,69,135,0.1)]">
          Основной формат
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] md:gap-x-10 md:gap-y-5">
        <div className="md:col-start-1 md:row-start-1">
          <header className="text-center md:text-left">
            <h3 className="text-xl font-bold text-gray-900">{PRICING.pro.name}</h3>
            <div className="mt-2 flex items-baseline justify-center gap-1 md:justify-start">
              <span className="text-3xl font-bold tracking-normal text-gray-900 sm:text-[36px]">
                {PRICING.pro.price}
              </span>
              <span className="text-sm text-gray-500">{PRICING.pro.period}</span>
            </div>
            <p className="mt-3 text-sm font-semibold leading-snug text-[#434587]">
              Дневник ведёт куратор
            </p>
          </header>
          <p className="mt-4 text-[14px] leading-relaxed text-gray-600 sm:text-[15px]">
            Вы присылаете фото, текст или голос. Куратор ведёт дневник, помнит, что происходило в
            течение недели, и помогает понять, что изменить, если планы или режим сбились.
          </p>
        </div>

        <div className="space-y-6 md:col-start-2 md:row-span-2 md:row-start-1">
          <section
            aria-labelledby="pricing-pro-during-week"
            data-pricing-feature-group="during-week"
          >
            <h4
              className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#434587]"
              id="pricing-pro-during-week"
            >
              По ходу недели
            </h4>
            <FeatureList items={proDuringWeek} />
          </section>
          <section
            className="border-t border-[#D7E5EE] pt-5"
            aria-labelledby="pricing-pro-weekly-review"
            data-pricing-feature-group="weekly-review"
          >
            <h4
              className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#434587]"
              id="pricing-pro-weekly-review"
            >
              Итог недели
            </h4>
            <FeatureList items={proWeeklyReview} />
          </section>
        </div>

        <div className="md:col-start-1 md:row-start-2 md:self-end">
          <a
            href="#trial"
            className="flex min-h-[46px] w-full items-center justify-center rounded-xl bg-[#1D70B7] px-4 py-3 text-center text-[13px] font-semibold leading-snug text-white shadow-[0_10px_22px_rgba(29,112,183,0.18)] transition-colors hover:bg-[#185F9D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D70B7] focus-visible:ring-offset-2 sm:text-sm"
          >
            Оставить заявку на 7 дней Pro
          </a>
          <p className="mt-2 text-center text-[12px] leading-relaxed text-[#5F6B7A]">
            0 ₽ · без карты и автосписаний
          </p>
        </div>
      </div>
    </article>
  );
}

function DisclosureIcon() {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-base leading-none text-[#434587] transition-transform group-open:rotate-45"
      aria-hidden="true"
    >
      +
    </span>
  );
}

export default function PricingSectionContent() {
  return (
    <div className="container mx-auto px-5 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-9 text-center md:mb-12">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
            Какую помощь вы хотите получить?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-gray-600">
            Self — ведёте дневник сами. Pro — куратор ведёт дневник и помогает по ходу недели. Pro
            Спорт — один специалист ведёт питание и тренировки.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-gray-500">
            Все цены — за месяц. Без скрытых доплат и автосписаний.
          </p>
        </div>

        <div className="grid items-start gap-4 md:grid-cols-5 md:gap-5" data-pricing-cards>
          <ProPlanCard />

          <CompactPlanCard
            planId="base"
            name={PRICING.base.name}
            price={PRICING.base.price}
            period={PRICING.base.period}
            positioning="Дневник ведёте сами"
            description="Питание, КБЖУ, тренировочные записи и динамика собраны в HEYS — без участия куратора."
            features={selfFeatures}
            order="md:col-span-2"
            tone="neutral"
          >
            <div className="[&_button]:border-slate-300 [&_button]:bg-white [&_button]:text-slate-900 [&_button]:hover:border-slate-400 [&_button]:hover:bg-slate-50 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#434587] [&_button]:focus-visible:ring-offset-2">
              <PurchaseButton
                planName={PRICING.base.name}
                planPrice={`${PRICING.base.price} ${PRICING.base.period}`}
                ctaText="Выбрать Self"
                isPrimary={true}
              />
            </div>
          </CompactPlanCard>

          <CompactPlanCard
            planId="pro-plus"
            badge="Пилот · до 4 участников"
            name={PRICING.proPlus.name}
            price={PRICING.proPlus.price}
            period={PRICING.proPlus.period}
            positioning="Pro + персональный онлайн-тренер"
            description="Один специалист ведёт питание и тренировки, составляет программу под ваш график и видит, как вы выполняете упражнения. Поэтому нагрузка, питание и восстановление не существуют отдельно друг от друга."
            features={proSportFeatures}
            order="md:col-span-3"
            tone="sport"
          >
            <a
              href={SUPPORT_CONTACTS.telegramUrl}
              className="flex min-h-[46px] w-full items-center justify-center rounded-xl border border-[#7778A6] bg-white px-4 py-3 text-center text-[13px] font-semibold leading-snug text-[#434587] transition-colors hover:bg-[#F4F2FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7778A6] focus-visible:ring-offset-2 sm:text-sm"
            >
              Обсудить Pro Спорт
            </a>
            <p className="mt-2 text-center text-[12px] leading-relaxed text-[#5F6B7A]">
              Оплата после личного согласования
            </p>
          </CompactPlanCard>
        </div>

        <details
          className="group mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)]"
          data-pricing-comparison
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D70B7] sm:px-6">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-900 sm:text-[15px]">
                Сравнить форматы
              </span>
              <span className="mt-1 block text-[12px] leading-relaxed text-gray-500 sm:text-[13px]">
                Основные различия между Self, Pro и Pro Спорт
              </span>
            </span>
            <DisclosureIcon />
          </summary>

          <div className="border-t border-slate-100 px-4 pb-5 pt-2 sm:px-6 sm:pb-6">
            <div className="divide-y divide-slate-100 md:hidden">
              {comparisonRows.map((row, index) => (
                <section
                  key={row.label}
                  className="py-4"
                  aria-labelledby={`pricing-comparison-mobile-${index}`}
                >
                  <h4
                    className="text-[13px] font-semibold leading-snug text-gray-900"
                    id={`pricing-comparison-mobile-${index}`}
                  >
                    {row.label}
                  </h4>
                  <dl className="mt-2 space-y-1.5 text-[12px] leading-relaxed">
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-lg px-2 py-1.5 text-gray-600">
                      <dt className="font-semibold text-gray-700">Self</dt>
                      <dd>{row.self}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-lg bg-[#F2F8FC] px-2 py-1.5 text-gray-700">
                      <dt className="font-semibold text-[#1D70B7]">Pro</dt>
                      <dd>{row.pro}</dd>
                    </div>
                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 rounded-lg bg-[#F8F7FC] px-2 py-1.5 text-gray-600">
                      <dt className="font-semibold text-[#5C5E8F]">Pro Спорт</dt>
                      <dd>{row.proSport}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>

            <div className="hidden md:block">
              <table className="w-full table-fixed border-collapse text-left text-[13px] leading-relaxed text-gray-600">
                <colgroup>
                  <col className="w-[31%]" />
                  <col className="w-[23%]" />
                  <col className="w-[23%]" />
                  <col className="w-[23%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-3 font-semibold text-gray-900" scope="col">
                      Критерий
                    </th>
                    <th className="px-3 py-3 font-semibold text-gray-900" scope="col">
                      Self
                    </th>
                    <th className="bg-[#F2F8FC] px-3 py-3 font-semibold text-[#1D70B7]" scope="col">
                      Pro
                    </th>
                    <th className="bg-[#F8F7FC] px-3 py-3 font-semibold text-[#5C5E8F]" scope="col">
                      Pro Спорт
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.label} className="border-b border-slate-100 last:border-b-0">
                      <th className="px-3 py-3 font-medium text-gray-800" scope="row">
                        {row.label}
                      </th>
                      <td className="px-3 py-3 align-top">{row.self}</td>
                      <td className="bg-[#F2F8FC] px-3 py-3 align-top text-gray-700">{row.pro}</td>
                      <td className="bg-[#F8F7FC] px-3 py-3 align-top">{row.proSport}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        <details
          className="group mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.035)]"
          data-pricing-boundaries
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D70B7] sm:px-6 sm:text-[15px]">
            <span>Как устроено сопровождение</span>
            <DisclosureIcon />
          </summary>
          <div className="divide-y divide-slate-100 border-t border-slate-100 px-5 sm:px-6">
            <section className="py-4">
              <h3 className="text-sm font-semibold text-gray-900">По ходу недели</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Куратор работает с новыми записями в течение недели: вносит данные, задаёт
                уточняющие вопросы и помогает решить, что изменить, если меняются график, нагрузка
                или обстоятельства. Для этого не нужно ждать недельного разбора.
              </p>
            </section>
            <section className="py-4">
              <h3 className="text-sm font-semibold text-gray-900">Итог недели</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Раз в неделю проходит более глубокий разбор: что сработало, где начал сбиваться ритм
                и на чём сосредоточиться дальше.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Для Pro он занимает 20–45 минут. Для Pro Спорт питание и тренировки разбираются
                вместе на общем созвоне 45–60 минут.
              </p>
            </section>
            <section className="py-4">
              <h3 className="text-sm font-semibold text-gray-900">Как работает тренер</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                В Pro Спорт тренер видит тренировочный дневник и помогает перестроить ближайшую
                тренировку, если ситуация изменилась.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Основная программа обновляется по результатам выполнения, но не чаще одного раза в
                неделю.
              </p>
              <h4 className="mt-4 text-[13px] font-semibold text-gray-900">
                Как тренер проверяет технику
              </h4>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Для разбора достаточно короткого видео одного рабочего подхода. На старте тренер
                проверяет упражнения новой программы. Дальше вы присылаете новые, изменённые или
                вызывающие сомнение движения. При необходимости тренер сам просит прислать
                контрольное видео.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                В ответ вы получаете несколько главных замечаний: что уже получается, что изменить и
                нужно ли показать упражнение повторно. Если движение не подходит, тренер заменяет
                его или меняет нагрузку.
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[#5C5E8F]">
                Цена 19 990 ₽/мес действует для текущего пилота. Для следующего набора планируется
                цена 26 990 ₽/мес.
              </p>
            </section>
            <section className="py-4">
              <h3 className="text-sm font-semibold text-gray-900">Связь и границы</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Куратор на связи ежедневно, 09:00–21:00 МСК, включая выходные. Ориентир ответа и
                внесения данных в дневник — 1–2 часа; полный разбор может потребовать больше
                времени.
              </p>
              <p className="mt-2 text-[13px] font-medium leading-relaxed text-gray-700">
                Это не круглосуточная или экстренная связь. HEYS не заменяет врача, реабилитолога
                или медицинскую помощь.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-gray-600">
                Техника оценивается по коротким видео рабочих подходов в пределах видимого ракурса.
                Формат не предполагает непрерывную видеосвязь, просмотр полных тренировок или
                медицинскую и реабилитационную оценку. Если материалов много, тренер определяет
                приоритет и порядок разбора.
              </p>
            </section>
          </div>
        </details>
      </div>
    </div>
  );
}
