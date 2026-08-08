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

// Трекер из этого блока убран (решение владельца 2026-08-08). Две причины.
// Первая: он подробно разобран выше, в таблице секции 02, и здесь повторялся
// сокращённо — четыре строки той таблицы пересказывались одной фразой.
// Вторая, важнее: рядом с нашей ценой у него стояло «Обычно бесплатно», то есть
// ровно то сравнение числа с нулём, которое запрещено записью `COPY_VOICE`
// 2026-08-08. Остались два платных формата, и сравнение работает на нас: месяц
// ежедневной работы стоит как один-два разовых приёма.
const FORMATS = [
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
  'После разбора остаются заполненный дневник, динамика и понятный итог недели.',
];

// Self — витрина приложения и вход в воронку. Без состава рядом с восемью
// строками Pro Спорт карточка читается как «брать не надо».
const SELF_INCLUDES = [
  'Дневник питания и КБЖУ',
  'Динамика по дням и неделям',
  'Своя база продуктов и история',
  'Тренировочный дневник',
];

// У Pro Спорт самый высокий порог решения на странице, поэтому состав услуги
// показан целиком, а не двумя абзацами.
const PRO_SPORT_INCLUDES = [
  'Всё сопровождение Pro',
  'Стартовая встреча до 60 минут',
  'Персональная программа тренировок на четыре недели',
  'Тренер ведёт тренировочный дневник и видит, что реально выполнено',
  'Один общий созвон по питанию и тренировкам 45–60 минут каждую неделю',
  'Тренер проверяет технику упражнений вашей программы по коротким видео',
  'Если обстоятельства меняются, тренер помогает перестроить ближайшую тренировку',
  'Тренер обновляет программу с учётом того, как вы реально выполняете тренировки',
];

// Сравнение самих тарифов, а не сравнение с трекером: списком подряд разницу
// между тремя форматами прочитать легко, но уловить трудно (решение владельца
// 2026-08-08). Сравнение с трекером живёт выше, в секции 02.
const PLAN_COMPARISON: ReadonlyArray<readonly [string, string, string, string]> = [
  ['Кто ведёт дневник питания', 'Вы', 'Куратор', 'Куратор'],
  [
    'Помощь по ходу недели',
    'Сами',
    'Куратор помогает, если планы или режим меняются',
    'Специалист помогает подстроить питание и тренировочную нагрузку под ситуацию',
  ],
  [
    'Недельный разбор',
    'Нет',
    'Питание и ритм недели · 20–45 минут',
    'Питание и тренировки · 45–60 минут',
  ],
  ['Кто ведёт дневник тренировок', 'Вы', 'Вы', 'Тренер'],
  ['Программа тренировок', 'Нет', 'Нет', 'На четыре недели'],
  ['Адаптация нагрузки', 'Сами', 'Не входит', 'Тренер помогает изменить ближайшую тренировку'],
  ['Обновление программы', 'Нет', 'Нет', 'По результатам выполнения, не чаще раза в неделю'],
  [
    'Контроль техники',
    'Сами',
    'Нет',
    'Тренер разбирает упражнения текущей программы по коротким видео',
  ],
  ['На старте новой программы', 'Сами', 'Не входит', 'Проверка техники упражнений новой программы'],
  ['Бесплатная неделя', 'Нет', '7 дней', 'Нет'],
];

// Часы сопровождения и ориентир ответа — те же, что в пользовательском
// соглашении (§ 5.4). Две разные обещанные скорости на одной странице — повод
// для спора с клиентом.
const SUPPORT_DETAILS: ReadonlyArray<{
  title: string;
  paragraphs: readonly string[];
  accentNote?: string;
  strongNote?: string;
}> = [
  {
    title: 'По ходу недели',
    paragraphs: [
      'Куратор работает с новыми записями в течение недели: вносит данные, задаёт уточняющие вопросы и помогает решить, что изменить, если меняются график, нагрузка или обстоятельства. Для этого не нужно ждать недельного разбора.',
    ],
  },
  {
    title: 'Итог недели',
    paragraphs: [
      'Раз в неделю проходит более глубокий разбор: что сработало, где начал сбиваться ритм и на чём сосредоточиться дальше.',
      'Для Pro он занимает 20–45 минут. Для Pro Спорт питание и тренировки разбираются вместе на общем созвоне 45–60 минут.',
    ],
  },
  {
    title: 'Как работает тренер',
    paragraphs: [
      'В Pro Спорт тренер видит тренировочный дневник и помогает перестроить ближайшую тренировку, если ситуация изменилась. Основная программа обновляется по результатам выполнения, но не чаще одного раза в неделю.',
      'Для разбора техники достаточно короткого видео одного рабочего подхода. На старте тренер проверяет упражнения новой программы, дальше вы присылаете новые или вызывающие сомнение движения. В ответ — несколько главных замечаний: что уже получается, что изменить и нужно ли показать упражнение повторно.',
    ],
    // Единственное место на странице, где сказано, что цена пилотная: без этого
    // будущее повышение выглядит как обман.
    accentNote: `Цена ${PRICING.proPlus.price} ${PRICING.proPlus.period} действует для текущего пилота. Для следующего набора планируется цена 26 990 ₽/мес.`,
  },
  {
    title: 'Связь и границы',
    paragraphs: [
      'Сообщения обрабатываются в часы сопровождения 09:00–21:00 МСК. Ориентир первой реакции — 1–2 часа; полный разбор может потребовать больше времени.',
    ],
    strongNote:
      'Это не круглосуточная или экстренная связь. HEYS не заменяет врача, реабилитолога или медицинскую помощь.',
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

      <div data-reveal className="mt-14 grid border-t border-[rgba(16,24,38,0.14)] sm:grid-cols-2">
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
              Вы присылаете фото, текст или голос. Куратор ведёт дневник, помнит, что происходило в
              течение недели, и помогает понять, что изменить, если планы или режим сбились.
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
                    <span aria-hidden="true" className="shrink-0 text-[color:var(--da)]">
                      —
                    </span>
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
                    <span aria-hidden="true" className="shrink-0 text-[color:var(--da)]">
                      —
                    </span>
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
        <div className="flex flex-col rounded-[22px] border border-[rgba(16,24,38,0.12)] bg-white px-8 py-9">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
            {PRICING.base.name}
          </p>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-[32px] font-semibold leading-none text-[#101826]">
              {PRICING.base.price}
            </span>
            <span className="text-[14px] text-[#8A94A2]">{PRICING.base.period}</span>
          </p>
          <p className="mt-3 text-[13.5px] font-semibold leading-[1.5] text-[color:var(--da)]">
            Дневник ведёте сами
          </p>
          <p className="mt-3 text-[14.5px] leading-[1.6] text-[#5B6472]">
            Питание, КБЖУ, тренировочные записи и динамика собраны в HEYS — без участия куратора.
          </p>
          <ul className="mt-4 space-y-2.5">
            {SELF_INCLUDES.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13.5px] leading-[1.5] text-[#3C4552]">
                <span aria-hidden="true" className="shrink-0 text-[color:var(--da)]">
                  —
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">
            <a
              href="https://app.heyslab.ru"
              className="inline-flex items-center justify-center rounded-[13px] border border-[rgba(16,24,38,0.18)] bg-white px-6 py-3 text-[14px] font-semibold text-[#101826] transition-colors hover:border-[rgba(16,24,38,0.3)]"
            >
              Начать в HEYS
            </a>
            <Caption>Регистрация и оплата в приложении</Caption>
          </div>
        </div>

        {/* Бейдж — абсолютный, верхом на рамке: так же, как «Основной формат» у
            карточки Pro. Инлайн-чип в строке с названием делал карточки
            разнотипными. */}
        <div className="relative flex flex-col rounded-[22px] border border-[#C9C7E0] bg-[linear-gradient(180deg,#FCFBFF_0%,#F6F4FB_100%)] px-8 py-9">
          <span className="absolute -top-3 left-[30px] rounded-full border border-[#C9C7E0] bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#4A4C7E]">
            Пилот · до 4 участников
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4A4C7E]">
            {PRICING.proPlus.name}
          </p>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="text-[32px] font-semibold leading-none text-[#101826]">
              {PRICING.proPlus.price}
            </span>
            <span className="text-[14px] text-[#8A94A2]">{PRICING.proPlus.period}</span>
          </p>
          <p className="mt-3 text-[13px] leading-[1.5] text-[#8A94A2]">
            Около 670 ₽ в день — питание и тренировки у одного специалиста
          </p>
          <p className="mt-3 text-[13.5px] font-semibold leading-[1.5] text-[#4A4C7E]">
            Pro + персональный онлайн-тренер
          </p>
          <p className="mt-3 text-[14.5px] leading-[1.6] text-[#5B6472]">
            Один специалист ведёт питание и тренировки, составляет программу под ваш график и видит,
            как вы выполняете упражнения. Поэтому нагрузка, питание и восстановление не существуют
            отдельно друг от друга.
          </p>
          <ul className="mt-4 space-y-2.5">
            {PRO_SPORT_INCLUDES.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13.5px] leading-[1.5] text-[#3C4552]">
                <span aria-hidden="true" className="shrink-0 text-[#4A4C7E]">
                  —
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={() => setProSportOpen(true)}
              className="inline-flex items-center justify-center rounded-[13px] bg-[#4A4C7E] px-6 py-3 text-[14px] font-semibold text-white transition-transform duration-[250ms] hover:-translate-y-0.5"
            >
              Обсудить Pro Спорт
            </button>
            <Caption>Оплата после личного согласования</Caption>
          </div>
        </div>
      </div>

      {/* Второй слой: подробное сравнение и устройство сопровождения. Обычный
          сценарий выбора проходится без него — на первом слое уже есть формат,
          цена и действие. */}
      <div data-reveal className="mx-auto mt-10 max-w-[860px]">
        <details className="group border-b border-[rgba(16,24,38,0.12)] first:border-t">
          <summary className="flex cursor-pointer items-center justify-between gap-4 py-6 text-[16.5px] font-semibold leading-[1.4] text-[#101826] [&::-webkit-details-marker]:hidden">
            Сравнить тарифы
            <span
              aria-hidden="true"
              className="ml-4 inline-block h-2 w-2 shrink-0 rotate-45 border-b border-r border-[#9AA3B0] transition-transform duration-[250ms] group-open:rotate-[225deg]"
            />
          </summary>
          {/* Спойлер свёрстан как FAQ — разделителями, без карточки-рамки. Так
              второй слой выглядит одинаково по всей странице, а таблица
              получает всю ширину контейнера секции: четыре колонки помещаются
              целиком, и ни горизонтальная прокрутка, ни липкая колонка больше
              не нужны. Колонка Self узкая намеренно — в ней только «Вы», «Нет»
              и «Сами»; освободившееся отдано колонкам сопровождения. */}
          {/* Таблица одна выходит за поля секции (`-mx-8`, компенсирует
              `px-8` секции) — так все четыре колонки помещаются без
              горизонтальной прокрутки. `px-1` — минимальный зазор до края
              экрана, чтобы текст первой и последней колонки не упирался в
              рамку устройства. На `sm` и выше поля не нужны — таблица уже
              умещается в карточку целиком. */}
          <div className="-mx-8 px-1 pb-6 sm:mx-0 sm:px-0">
            <table className="w-full table-fixed border-collapse text-left text-[12px] leading-[1.45]">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[13%]" />
                <col className="w-[31.5%]" />
                <col className="w-[31.5%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-[rgba(16,24,38,0.14)] align-bottom">
                  {/* Колонка критериев липкая: при горизонтальной прокрутке
                      под неё уезжает Self, а рядом остаются Pro и Pro Спорт —
                      сравнивать имеет смысл именно их, и вопрос строки должен
                      быть виден. Непрозрачный фон обязателен, иначе уезжающий
                      текст просвечивает сквозь колонку. */}
                  <th className="bg-[#FBFAF7] py-3 pl-2 pr-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8A94A2]">
                    Критерий
                  </th>
                  <th className="bg-[#F8F1E6] px-2 py-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#8A94A2]">
                    {PRICING.base.name}
                  </th>
                  <th className="bg-[#F6FAFD] px-2 py-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--da)]">
                    {PRICING.pro.name}
                  </th>
                  <th className="bg-[#F1FAF4] px-2 py-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#1F6E4D]">
                    {PRICING.proPlus.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {PLAN_COMPARISON.map(([row, self, pro, proSport]) => (
                  <tr key={row} className="border-b border-[rgba(16,24,38,0.08)] align-top">
                    <th
                      scope="row"
                      className="break-words bg-[#FBFAF7] py-2.5 pl-2 pr-1.5 text-left text-[11.5px] font-medium text-[#101826]"
                    >
                      {row}
                    </th>
                    <td className="break-words bg-[#F8F1E6] px-2 py-2.5 text-[#5B6472]">{self}</td>
                    <td className="break-words bg-[#F6FAFD] px-2 py-2.5 text-[#3C4552]">{pro}</td>
                    <td className="break-words bg-[#F1FAF4] px-2 py-2.5 text-[#3C4552]">
                      {proSport}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="group border-b border-[rgba(16,24,38,0.12)] first:border-t">
          <summary className="flex cursor-pointer items-center justify-between gap-4 py-6 text-[16.5px] font-semibold leading-[1.4] text-[#101826] [&::-webkit-details-marker]:hidden">
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
                {item.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-2 text-[14.5px] leading-[1.6] text-[#5B6472]">
                    {paragraph}
                  </p>
                ))}
                {item.accentNote ? (
                  <p className="mt-2 text-[13px] leading-[1.6] text-[#4A4C7E]">{item.accentNote}</p>
                ) : null}
                {item.strongNote ? (
                  <p className="mt-2 text-[14.5px] font-medium leading-[1.6] text-[#3C4552]">
                    {item.strongNote}
                  </p>
                ) : null}
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
