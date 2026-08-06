'use client';

// 06 — «Форматы и тарифы» (`#pricing`).
//
// Сначала сравнение форматов (что человек вообще выбирает), потом цена. Вилка
// по разовой консультации — обобщённый рыночный диапазон без имён компаний, с
// источником и датой сверки: это ровно те три условия, при которых COPY_VOICE
// v19 разрешает цену чужого формата. Сравнивается формат работы, а не качество
// чужой работы.
//
// Цены берутся из `PRICING` — единого источника. Хардкод здесь развалил бы
// синхронизацию с legal-документами (pre-commit `check-pricing-sync`).

import { useState } from 'react';

import { D_CTA_HREF, D_CTA_LABEL } from './nav';
import { Accent, Caption, PrimaryCta, Section, SectionTitle } from './primitives';

import PurchaseModal from '@/components/modals/PurchaseModal';
import { PRICING } from '@/config/pricing';

const FORMATS = [
  {
    label: 'Трекер',
    labelColor: '#A0616D',
    text: 'Заполняете сами. Цифры есть — объяснения нет.',
    price: 'Обычно бесплатно',
    accentPrice: false,
  },
  {
    label: 'Консультация',
    labelColor: '#A8823C',
    text: 'Видит день встречи. Неделю вспоминаете по памяти.',
    price: '2 000 — 9 000 ₽ за один приём',
    accentPrice: false,
  },
  {
    label: 'HEYS',
    labelColor: null,
    text: 'Дневник ведёт куратор. Он видит неделю целиком.',
    price: `${PRICING.pro.price} ₽ за месяц ежедневной работы`,
    accentPrice: true,
  },
];

const PRO_WEEK = [
  'Куратор заносит в дневник всё, что вы прислали.',
  'Спрашивает, что стояло за днём, а не достраивает за вас.',
  'Видит питание, сон, нагрузку и график в одной картине — и помнит, как было неделю назад.',
  'Если меняются планы или график, помогает решить, как действовать дальше.',
  'После сбоя помогает вернуться в ритм без необходимости начинать всё заново.',
];

const PRO_RESULT = [
  'Разбор недели 20–45 минут — голосом или перепиской, как вам удобнее.',
  'Понятно, что сработало и что стоит поменять на следующей неделе.',
  'Остаются дневник, динамика и итог — они никуда не исчезают после разбора.',
];

const COMPARISON: ReadonlyArray<[string, string, string]> = [
  ['Кто ведёт дневник', 'вы сами', 'куратор'],
  ['Что нужно от вас', 'считать и заносить', 'прислать фото или пару фраз'],
  ['Горизонт разбора', 'один день', 'неделя целиком'],
  ['Кто делает вывод', 'алгоритм или никто', 'человек, который вас знает'],
  ['Уточняющий вопрос', 'нет', 'до совета, а не после'],
  ['Что с поездками и праздниками', 'ломают статистику', 'часть обычной жизни'],
  ['После срыва', 'начинать заново', 'вернуться в ритм'],
  ['Сон и нагрузка', 'отдельные приложения', 'в одной картине с питанием'],
  ['Ответ на «почему так»', 'графики', 'причина и один следующий шаг'],
  ['Цена', 'от 0 ₽', `${PRICING.pro.price} ₽/мес`],
];

const SUPPORT_DETAILS = [
  {
    title: 'По ходу недели',
    text: 'Вы присылаете, куратор заносит и уточняет. Ответ приходит в течение рабочего дня — расписания «24/7» мы не обещаем.',
  },
  {
    title: 'Итог недели',
    text: 'Разбор на 20–45 минут: что повторялось, что могло на это повлиять и один выполнимый шаг на следующую неделю.',
  },
  {
    title: 'Как работает тренер в Pro Спорт',
    text: 'Питание и тренировки ведёт один специалист, поэтому нагрузка и еда согласованы между собой, а не живут в двух разных чатах.',
  },
  {
    title: 'Связь и границы',
    text: 'Общение идёт в мессенджере HEYS или привычном вам. Куратор не ставит диагнозов и не назначает лечение: при заболеваниях нужен врач.',
  },
];

export default function PricingD() {
  const [proSportOpen, setProSportOpen] = useState(false);

  return (
    <Section id="pricing" index="06" label="Форматы и тарифы" tone="warm">
      <div data-reveal>
        <SectionTitle>
          Какую помощь вы хотите <Accent>получить?</Accent>
        </SectionTitle>
      </div>

      <div data-reveal className="mt-14 grid border-t border-[rgba(16,24,38,0.14)] sm:grid-cols-3">
        {FORMATS.map((format, i) => (
          <div
            key={format.label}
            className={`border-b border-[rgba(16,24,38,0.12)] px-0 py-[22px] sm:px-[26px] ${
              i === 0 ? 'sm:pl-0' : ''
            } ${i === FORMATS.length - 1 ? 'sm:pr-0' : ''}`}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: format.labelColor ?? 'var(--da)' }}
            >
              {format.label}
            </p>
            <p className="mt-4 text-[15px] leading-[1.6] text-[#101826]">{format.text}</p>
            <p
              className={`mt-4 text-[13px] font-semibold ${
                format.accentPrice ? 'text-[color:var(--da)]' : 'text-[#5B6472]'
              }`}
            >
              {format.price}
            </p>
          </div>
        ))}
      </div>

      <p
        data-reveal
        className="mx-auto mt-8 max-w-[720px] text-center text-[14.5px] leading-[1.6] text-[#5B6472]"
      >
        Self — ведёте дневник сами. Pro — куратор ведёт дневник и помогает по ходу недели. Pro Спорт
        — один специалист ведёт питание и тренировки.
      </p>

      <p
        data-reveal
        className="mx-auto mt-4 max-w-[720px] text-center text-[13px] leading-[1.6] text-[#9AA3B0]"
      >
        Вилка по консультациям — открытые прайсы московских клиник и площадок на август 2026. Цены
        HEYS — за месяц, без скрытых доплат и автосписаний. При медицинских показаниях HEYS не
        заменяет врача или нутрициолога.
      </p>

      {/* Карточка Pro — основной формат. */}
      <div
        data-reveal
        className="relative mt-14 rounded-[26px] border-[1.5px] border-[#12283E] bg-[linear-gradient(180deg,#FBFCFE_0%,#F3F7FB_100%)] px-8 py-10 shadow-[0_24px_60px_rgba(18,40,62,0.1)] sm:px-11"
      >
        <span className="absolute -top-[13px] left-11 rounded-full bg-[#12283E] px-4 py-1.5 text-[11px] font-semibold text-white">
          Основной формат
        </span>

        <div className="grid gap-11 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
              {PRICING.pro.name}
            </p>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-[42px] font-semibold leading-none text-[#101826]">
                {PRICING.pro.price}
              </span>
              <span className="text-[15px] text-[#8A94A2]">{PRICING.pro.period}</span>
            </p>
            <p className="mt-3 text-[13px] leading-[1.5] text-[#8A94A2]">
              Около 270 ₽ в день — с ежедневным ведением дневника
            </p>

            <p className="mt-7 text-[14px] font-semibold leading-[1.5] text-[color:var(--da)]">
              Дневник ведёт куратор, который вас знает
            </p>
            <p className="mt-3 text-[14.5px] leading-[1.6] text-[#5B6472]">
              Он помнит, как прошла ваша прошлая неделя, и спрашивает про трудные дни, прежде чем
              что-то предлагать.
            </p>

            <div className="mt-8">
              <PrimaryCta href={D_CTA_HREF}>{D_CTA_LABEL}</PrimaryCta>
              <Caption>0 ₽ · без карты и автосписаний</Caption>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
                По ходу недели
              </h3>
              <ul className="mt-4 space-y-3">
                {PRO_WEEK.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-[14.5px] leading-[1.55] text-[#101826]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[color:var(--da)]"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
                Итог недели
              </h3>
              <ul className="mt-4 space-y-3">
                {PRO_RESULT.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-[14.5px] leading-[1.55] text-[#101826]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[color:var(--da)]"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Self и Pro Спорт. */}
      <div data-reveal className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="rounded-[22px] border border-[rgba(16,24,38,0.12)] bg-white px-8 py-9">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
            {PRICING.base.name}
          </p>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-[32px] font-semibold leading-none text-[#101826]">
              {PRICING.base.price}
            </span>
            <span className="text-[14px] text-[#8A94A2]">{PRICING.base.period}</span>
          </p>
          <p className="mt-4 text-[14.5px] leading-[1.6] text-[#5B6472]">
            Дневник, КБЖУ и динамика — вы ведёте сами. Куратора и разбора недели здесь нет.
          </p>
          <a
            href="https://app.heyslab.ru"
            className="mt-7 inline-flex items-center justify-center rounded-[13px] border border-[rgba(16,24,38,0.18)] bg-white px-6 py-3 text-[14px] font-semibold text-[#101826] transition-colors hover:border-[rgba(16,24,38,0.3)]"
          >
            Начать в HEYS
          </a>
          <Caption>Регистрация и оплата в приложении</Caption>
        </div>

        <div className="rounded-[22px] border border-[#C9C7E0] bg-[linear-gradient(180deg,#FCFBFF_0%,#F6F4FB_100%)] px-8 py-9">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A4C7E]">
              {PRICING.proPlus.name}
            </p>
            <span className="rounded-full border border-[#C9C7E0] px-3 py-1 text-[11px] font-semibold text-[#4A4C7E]">
              Пилот · до 4 участников
            </span>
          </div>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-[32px] font-semibold leading-none text-[#101826]">
              {PRICING.proPlus.price}
            </span>
            <span className="text-[14px] text-[#8A94A2]">{PRICING.proPlus.period}</span>
          </p>
          <p className="mt-3 text-[13px] leading-[1.5] text-[#8A94A2]">
            Около 670 ₽ в день — питание и тренировки у одного специалиста
          </p>
          <p className="mt-4 text-[14.5px] leading-[1.6] text-[#5B6472]">
            Всё, что входит в Pro, плюс тренировочный план и его сведение с питанием. Мест немного:
            куратор ведёт ограниченный набор, и каждого участника разбирает лично.
          </p>
          <button
            type="button"
            onClick={() => setProSportOpen(true)}
            className="mt-7 inline-flex items-center justify-center rounded-[13px] bg-[#4A4C7E] px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-[250ms] hover:-translate-y-0.5"
          >
            Обсудить Pro Спорт
          </button>
          <Caption>Оплата после личного согласования</Caption>
        </div>
      </div>

      {/* Второй слой: подробное сравнение и устройство сопровождения. Обычный
          сценарий выбора проходится без него — на первом слое уже есть формат,
          цена и действие. */}
      <div data-reveal className="mx-auto mt-10 max-w-[860px] space-y-4">
        <details className="group rounded-[18px] border border-[rgba(16,24,38,0.12)] bg-white px-7 py-5">
          <summary className="flex cursor-pointer items-center justify-between text-[15px] font-semibold text-[#101826] [&::-webkit-details-marker]:hidden">
            Сравнить форматы
            <span
              aria-hidden="true"
              className="ml-4 inline-block h-2 w-2 shrink-0 rotate-45 border-b border-r border-[#9AA3B0] transition-transform duration-[250ms] group-open:rotate-[225deg]"
            />
          </summary>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[rgba(16,24,38,0.12)]">
                  <th className="py-3 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
                    &nbsp;
                  </th>
                  <th className="py-3 pr-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
                    Трекер
                  </th>
                  <th className="py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--da)]">
                    HEYS Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([row, tracker, heys]) => (
                  <tr key={row} className="border-b border-[rgba(16,24,38,0.08)] align-top">
                    <td className="py-3 pr-4 text-[14px] leading-[1.5] text-[#8A94A2]">{row}</td>
                    <td className="py-3 pr-4 text-[14px] leading-[1.5] text-[#5B6472]">
                      {tracker}
                    </td>
                    <td className="py-3 text-[14px] leading-[1.5] text-[#101826]">{heys}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="group rounded-[18px] border border-[rgba(16,24,38,0.12)] bg-white px-7 py-5">
          <summary className="flex cursor-pointer items-center justify-between text-[15px] font-semibold text-[#101826] [&::-webkit-details-marker]:hidden">
            Как устроено сопровождение
            <span
              aria-hidden="true"
              className="ml-4 inline-block h-2 w-2 shrink-0 rotate-45 border-b border-r border-[#9AA3B0] transition-transform duration-[250ms] group-open:rotate-[225deg]"
            />
          </summary>
          <div className="mt-5 space-y-5">
            {SUPPORT_DETAILS.map((item) => (
              <div key={item.title}>
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
                  {item.title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-[1.6] text-[#5B6472]">{item.text}</p>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Контракт заявки на Pro Спорт переиспользуется целиком: та же отправка в
          `POST /leads`, те же согласия и та же версия политики, что на публичной
          странице. Оформление модалки — из существующего компонента, а не из
          макета: расхождение с макетом здесь дешевле, чем второй контракт
          заявки. Пункт для приёмки. */}
      <PurchaseModal
        isOpen={proSportOpen}
        onClose={() => setProSportOpen(false)}
        planName={PRICING.proPlus.name}
        planPrice={`${PRICING.proPlus.price} ${PRICING.proPlus.period}`}
      />
    </Section>
  );
}
