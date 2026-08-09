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

import type { ReactNode } from 'react';
import { useState } from 'react';

import { playfair } from './fonts';
import { D_CTA_HREF, D_CTA_LABEL_SHORT } from './nav';
import { Accent, Section, SectionTitle } from './primitives';
import { D_STAR_TEXTURE, D_TARIFF_HEADER, D_TEXT_CAPTION_AA } from './theme';

import PurchaseModal from '@/components/modals/PurchaseModal';
import { PRICING } from '@/config/pricing';

/**
 * Пункты хранятся парой «ведущая часть — продолжение»: первая набирается
 * плотнее и темнее, вторая обычным весом. Это не украшение, а навигация —
 * список из пяти строк подряд читается ровной серой массой, и по нему нельзя
 * скользнуть взглядом, а именно так его и читают при выборе тарифа.
 *
 * Выделять целую мысль в каждом пункте нельзя: выделено всё — не выделено
 * ничего. Поэтому вперёд вынесено только действие, и все пункты приведены к
 * одной конструкции — глагол первым. Это заодно требование `COPY_VOICE`
 * (2026-07-29): услугу описывает действие специалиста, а не отглагольное
 * существительное. Подлежащее опущено намеренно — двумя строками выше стоит
 * «Дневник ведёт куратор, который вас знает».
 */
/**
 * Три карточки собраны одним каркасом: шапка с ценой, подзаголовок курсивом,
 * полоса чисел, список, необязательные блоки Pro, кнопка с подписью. Разное
 * наполнение при одинаковой конструкции — то, ради чего ряд читается как выбор
 * из трёх вариантов, а не как три разных объявления (пакет тарифов, § Каркас).
 *
 * Пункты списков хранятся парой «ведущее действие — продолжение»: первая часть
 * плотнее и темнее. Это навигация, а не украшение — список одним весом читается
 * ровной массой, по которой нельзя скользнуть взглядом, а именно так его и
 * читают при выборе тарифа. Выделять целую мысль в каждом пункте нельзя:
 * выделено всё — не выделено ничего.
 *
 * Подлежащее в пунктах опущено намеренно. У Pro его даёт подзаголовок
 * («Дневник ведёт куратор, который вас знает»), а у Pro Спорт слово «тренер»
 * запрещено прямо: как только оно появляется, читается второй исполнитель, и
 * УТП тарифа — один специалист без передачи между двумя — рушится.
 */
interface Tariff {
  id: 'self' | 'pro' | 'proSport';
  badge: string;
  name: string;
  price: string;
  period: string;
  /** Подзаголовок Playfair italic: обычная часть + акцентная. */
  subtitle: [string, string];
  /** Полоса чисел. У Self её нет — вместо неё `fit`. */
  metrics?: ReadonlyArray<{ value: string; caption: ReactNode }>;
  /** Только Self: честных чисел у тарифа без куратора нет. */
  fit?: { title: string; text: string };
  listTitle: string;
  items: ReadonlyArray<[string, string]>;
  cta: { label: string; href?: string; note: string };
}

/**
 * Слово «ориентир» — видимая ссылка на § 5.4 оферты, а не обычный текст.
 * Тильда читается как «примерно полтора часа», реальный потолок — сутки, и эту
 * разницу несёт только ссылка. Оговорки в карточке нет: ей место в оферте,
 * витрина не оправдывается (решение владельца 2026-08-08).
 */
function OfferRef({ children }: { children: ReactNode }) {
  return (
    <a
      href="/legal/user-agreement#5-4"
      className="text-[#2467A3] underline decoration-[0.5px] underline-offset-2"
    >
      {children}
    </a>
  );
}

const TARIFFS: ReadonlyArray<Tariff> = [
  {
    id: 'self',
    badge: 'Только приложение',
    name: PRICING.base.name,
    price: PRICING.base.price,
    period: PRICING.base.period,
    subtitle: ['Дневник ', 'ведёте сами'],
    // Полоса сохраняется, но работа у неё другая: «0 разборов» писать нельзя,
    // а придуманные числа обесценили бы числа у Pro. Честное «вы уже умеете
    // считать» превращает дешёвый тариф в осознанный выбор, а не в огрызок.
    fit: {
      title: 'Кому подходит',
      text: 'Вы уже умеете считать и вести записи — нужен только удобный инструмент, без сопровождения.',
    },
    listTitle: 'Что внутри',
    items: [
      ['Дневник питания', 'и КБЖУ'],
      ['Динамика', 'по дням и неделям'],
      ['Своя база продуктов', 'и тренировочный дневник'],
    ],
    cta: {
      label: 'Начать в HEYS',
      href: 'https://app.heyslab.ru',
      note: 'Регистрация и оплата в приложении',
    },
  },
  {
    id: 'pro',
    badge: 'Основной формат',
    name: PRICING.pro.name,
    price: PRICING.pro.price,
    period: PRICING.pro.period,
    subtitle: ['Дневник ведёт куратор, ', 'который вас знает'],
    metrics: [
      // «30 дней подряд» обеспечено офертой 1.10 § 5.4: режим ежедневный,
      // включая выходные и праздники. До бампа версии число висело на
      // нерасшифрованном «в дни и объёме тарифа» и ставить его было нельзя.
      { value: '30', caption: 'дней подряд дневник ведёт куратор' },
      {
        value: '~1–2 ч',
        caption: (
          <>
            <OfferRef>ориентир</OfferRef> ответа и записи
          </>
        ),
      },
      { value: '4', caption: 'разбора недели, каждые 7 дней' },
    ],
    listTitle: 'По ходу недели',
    // Пятый пункт про сбой вынесен ниже отдельным блоком: конец перечня —
    // слабейшая позиция, а строка замыкает секцию 01 и должна читаться как
    // ответ на неё, а не как ещё один пункт состава.
    items: [
      ['Заносит в дневник', 'всё, что вы прислали'],
      ['Спрашивает,', 'что стояло за днём, а не достраивает за вас'],
      ['Видит', 'питание, сон и нагрузку в одной картине'],
      ['Помогает решить,', 'что делать, если меняются планы или график'],
    ],
    cta: {
      label: D_CTA_LABEL_SHORT,
      href: D_CTA_HREF,
      note: 'Около 270 ₽ в день · без карты и автосписаний',
    },
  },
  {
    id: 'proSport',
    badge: 'Пилот · до 4 участников',
    name: PRICING.proPlus.name,
    price: PRICING.proPlus.price,
    period: PRICING.proPlus.period,
    subtitle: ['Питание и тренировки — ', 'у одного специалиста'],
    metrics: [
      { value: '4', caption: 'недели персональной программы' },
      { value: '45–60', caption: 'минут общий созвон каждую неделю' },
      // «∞ приёмов в день» пересказывает оферту (ведение дневника по
      // присланным данным), а не обещает объём сверх неё. Прежнее «~90»
      // снято как обещание, которого сервис не давал: объём задаёт клиент.
      { value: '∞', caption: 'приёмов в день — вносим всё, что прислали' },
    ],
    listTitle: 'Дополнительно к Pro',
    items: [
      ['Всё сопровождение Pro', '— дневник ведёт куратор'],
      ['Стартовая встреча до 60 минут', '— цель, график и что нужно учесть'],
      [
        'Один специалист на питание и тренировки',
        '— тренировочный дневник ведёт тот же человек, что ведёт питание',
      ],
      ['Проверяет технику', 'по коротким видео'],
    ],
    cta: { label: 'Обсудить Pro Спорт', note: 'Оплата после личного согласования' },
  },
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
  // Здесь стояли ещё два блока — «По ходу недели» и «Итог недели» — с теми же
  // заголовками и тем же смыслом, что в карточке Pro на 500px выше. «Разбор
  // недели 20–45 минут» встречался в секции дважды.
  //
  // Убраны из спойлера, а не из карточки, хотя формально дублем можно назвать
  // и то и другое. Причина в том, где принимается решение: список в карточке —
  // единственное место, где видно, за что берут месячную цену, и прятать
  // доказательство ценности за клик нельзя (замечание владельца 2026-08-08:
  // «как тогда показать глубину продукта»). Спойлер по определению второй
  // слой, туда идёт
  // то, чего в карточках нет вовсе.
  //
  // Тайминг разбора сюда тоже не вернулся, хотя сначала казался уникальным:
  // строка «Недельный разбор» в таблице соседнего спойлера говорит ровно то же
  // самое про все три тарифа сразу. Проверка на живой странице показала, что
  // «20–45 минут» встречалось в секции трижды — в карточке Pro, в таблице и
  // здесь. Здесь эта деталь была самой слабой из трёх: без соседних колонок
  // сравнивать не с чем.
  //
  // В спойлере осталось только то, чего на первом слое нет вовсе: как работает
  // тренер и в какие часы отвечает куратор.
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
      'Куратор на связи ежедневно, 09:00–21:00 МСК, включая выходные. Ориентир первой реакции и внесения данных в дневник — 1–2 часа; полный разбор может потребовать больше времени.',
    ],
    strongNote:
      'Это не круглосуточная или экстренная связь. HEYS не заменяет врача, реабилитолога или медицинскую помощь.',
  },
];

/**
 * Мостик перед карточками: чем три тарифа отличаются в одну строку каждый.
 * Формулировки намеренно короче, чем в самих карточках, — здесь нужна не
 * полнота, а быстрое различение.
 */
const TIER_SUMMARY: ReadonlyArray<[string, string]> = [
  ['Self', 'ведёте дневник сами'],
  ['Pro', 'куратор ведёт дневник и помогает по ходу недели'],
  ['Pro Спорт', 'один специалист ведёт питание и тренировки'],
];

export default function PricingD() {
  const [proSportOpen, setProSportOpen] = useState(false);

  return (
    <Section id="pricing" index="06" label="Форматы и тарифы" tone="warm">
      {/* Отрицательные поля гасят общесекционные `px-8` и ставят 20px: на 390px
          32px секции плюс 28–44px внутри карточки отдавали полям 39% ширины, и
          блок «После срыва» рендерился узким столбиком. Порог тот же 560px, что
          и в секции заявки — арифметика полей у них одна. */}
      <div className="-mx-3 min-[561px]:mx-0">
        <div data-reveal>
          <SectionTitle>
            Какую помощь вы хотите <Accent>получить?</Accent>
          </SectionTitle>
        </div>

        {/* Три тарифа строками, а не одним абзацем: это мостик перед подробными
          карточками, и работает он только если различие считывается с одного
          взгляда. Сплошным текстом три названия сливались, и глазу приходилось
          разбирать предложение, чтобы понять, что вариантов вообще три.
          Выравнивание левое внутри центрированного блока — список читается
          сверху вниз, центрированные строки такой опоры не дают. */}
        <ul
          data-reveal
          className="mx-auto mt-8 flex max-w-[440px] flex-col gap-2.5 text-left text-[14.5px] leading-[1.6] text-[#5B6472]"
        >
          {TIER_SUMMARY.map(([tier, what]) => (
            <li key={tier}>
              <span className="font-medium text-[#101826]">{tier}</span> — {what}
            </li>
          ))}
        </ul>

        {/* Ряд из трёх карточек. На узких экранах — колонкой, Pro первым:
          основной формат должен встречаться раньше остальных, а на широких
          он стоит в середине и держит центр ряда. */}
        {/* Шапка Self ниже остальных: под ней сразу подзаголовок, а у Pro и
          Pro Спорт — числовая строка, которая держит вес. Одинаковая высота
          делала лёгкую карточку тяжеловесной сверху. Уменьшены только отступы,
          кегль цены общий — цена должна читаться одинаково во всех трёх.

          Ритм полос у Self плотнее, чем у Pro и Pro Спорт. Каркас общий, но у
          Self нет числовой строки и вдвое меньше пунктов, а шаг рассчитан на
          плотность Pro — тот же отступ при более редком содержимом читается
          пустотой (замечание владельца 2026-08-09). Сильнее всего это било по
          подзаголовку: однострочное «Дневник ведёте сами» получало 40px
          паддингов на 26px текста.

          Карточки отделяет от фона тень, а не заливка. Замер 2026-08-09: белое
          тело даёт к фону секции контраст 1.08:1, и это ЛУЧШЕЕ, что здесь
          возможно — фон `#F7F6F2` сам светлый, и мягкая тонировка тел (пробовали
          `#F4F8FC`, `#F7F5FC`) опускает контраст до 1.00–1.03, то есть работает
          против задачи. Насыщенная заливка отделила бы, но дала бы три цветных
          прямоугольника подряд и заспорила бы с внутренними плашками карточки.
          Тень рисует край и от разницы двух почти одинаковых светлых не зависит.
          У Pro она сильнее по спеке — он остаётся основным форматом.

          Зазор на колонке втрое больше, чем в ряду. Причина не в эстетике:
          фон секции `#F7F6F2` и белые карточки различаются на 8 единиц по
          каналу, отделяет их только рамка — и при 20px между ними три карточки
          читались единой портянкой (замечание владельца 2026-08-09). В ряду на
          десктопе такой проблемы нет: там карточки разделены по горизонтали и
          видны как три объекта сразу. */}
        <div data-reveal className="mt-14 grid gap-12 lg:grid-cols-3 lg:gap-5">
          {TARIFFS.map((tariff) => {
            const dark = tariff.id !== 'self';
            return (
              <div
                key={tariff.id}
                // Метка стоит на карточке, а не на её кнопке. Кнопка ниже
                // складки: человек, читающий состав Pro, кнопку ещё не видит —
                // но уже ждёт её в карточке, и плавающая пилюля всё это время
                // дублирует то, до чего он вот-вот доскроллит (замечание
                // владельца 2026-08-09). Триггер — блок, у которого своя кнопка
                // есть, а не момент, когда она попала в кадр.
                data-own-cta
                className={`flex flex-col overflow-hidden rounded-[22px] bg-white min-[561px]:rounded-[26px] ${
                  tariff.id === 'pro'
                    ? 'shadow-[0_18px_44px_rgba(10,17,25,0.12)] lg:order-2'
                    : tariff.id === 'proSport'
                      ? 'border border-[#C9C7E0] shadow-[0_10px_26px_rgba(10,17,25,0.06)] lg:order-3'
                      : 'border border-[rgba(16,24,38,0.16)] shadow-[0_10px_26px_rgba(10,17,25,0.06)] lg:order-1'
                }`}
              >
                {/* Шапка. Орнамент на тёмных — та же звёздная текстура, что в
                  герое и в карточке пробной недели: она держит поверхности в
                  родстве и не даёт заливке читаться плоским прямоугольником.
                  Решение зафиксировано, а не унаследовано (пакет тарифов №05). */}
                <div
                  className={`relative px-5 min-[561px]:px-7 ${
                    tariff.id === 'self' ? 'pb-4 pt-5' : 'pb-6 pt-6'
                  }`}
                  style={{ backgroundImage: D_TARIFF_HEADER[tariff.id] }}
                >
                  {dark ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{
                        backgroundImage: D_STAR_TEXTURE,
                        backgroundSize: '56px',
                        opacity: tariff.id === 'pro' ? 0.06 : 0.07,
                      }}
                    />
                  ) : null}

                  {/* Высота строки задана явно: на другом наборе шрифтов текст
                    бейджа выезжал за скругление пилюли. */}
                  <span
                    className={`relative inline-block rounded-full border px-3 py-[5px] text-[11px] font-semibold uppercase leading-[1.35] tracking-[0.14em] ${
                      tariff.id === 'pro'
                        ? 'border-[rgba(255,255,255,0.28)] text-[rgba(255,255,255,0.82)]'
                        : tariff.id === 'proSport'
                          ? 'border-[rgba(255,255,255,0.32)] text-[rgba(255,255,255,0.85)]'
                          : 'border-[rgba(16,24,38,0.2)] text-[#5B6472]'
                    }`}
                  >
                    {tariff.badge}
                  </span>

                  <p
                    className={`relative text-[clamp(20px,2.4vw,24px)] font-semibold leading-none ${
                      tariff.id === 'self' ? 'mt-3' : 'mt-4'
                    } ${dark ? 'text-white' : 'text-[#101826]'}`}
                  >
                    {tariff.name}
                  </p>
                  <p className="relative mt-2 flex items-baseline gap-2">
                    <span
                      className={`text-[clamp(30px,3.4vw,41px)] font-semibold leading-none tracking-[-0.025em] ${
                        dark ? 'text-white' : 'text-[#101826]'
                      }`}
                    >
                      {tariff.price}
                    </span>
                    <span
                      className={`text-[14px] ${dark ? 'text-[rgba(255,255,255,0.62)]' : 'text-[#8A94A2]'}`}
                    >
                      {tariff.period}
                    </span>
                  </p>
                </div>

                {/* Спека пакета задаёт название 24px и число метрики 22px
                  фиксированными; здесь они адаптивные с тем же максимумом.
                  Правило масштаба версии D (`primitives.tsx`) выведено замером
                  и старше этого пакета: заголовок секции на узких экранах
                  падает до 30px, и фиксированные 24px дали бы 0.80 от него —
                  карточка начала бы спорить с заголовком секции. На десктопе
                  значения совпадают со спекой. */}
                {/* Подзаголовок курсивом — на своей полосе: он объясняет, кто
                  ведёт дневник, и это первое, что читают после цены. */}
                <p
                  className={`${playfair.className} border-b border-[rgba(16,24,38,0.08)] px-5 text-[17.5px] min-[561px]:px-7 font-medium italic leading-[1.4] text-[#101826] ${
                    tariff.id === 'self' ? 'py-4' : 'py-5'
                  } ${dark ? 'bg-[#FBFAF7]' : 'bg-white'}`}
                >
                  {tariff.subtitle[0]}
                  <span style={{ color: tariff.id === 'proSport' ? '#4A4C7E' : 'var(--da)' }}>
                    {tariff.subtitle[1]}
                  </span>
                </p>

                {tariff.metrics ? (
                  <div className="grid grid-cols-3 border-b border-[rgba(16,24,38,0.08)]">
                    {tariff.metrics.map((metric, i) => (
                      <div
                        key={metric.value}
                        className={`px-4 py-5 ${i > 0 ? 'border-l border-[rgba(16,24,38,0.08)]' : ''}`}
                      >
                        <p className="text-[clamp(19px,2.2vw,22px)] font-semibold leading-none text-[#101826]">
                          {metric.value}
                        </p>
                        <p
                          className="mt-2 text-[11.5px] leading-[1.3]"
                          style={{ color: D_TEXT_CAPTION_AA }}
                        >
                          {metric.caption}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {tariff.fit ? (
                  <div className="border-b border-[rgba(16,24,38,0.08)] px-5 py-4 min-[561px]:px-7">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: D_TEXT_CAPTION_AA }}
                    >
                      {tariff.fit.title}
                    </p>
                    <p className="mt-2 text-[14px] leading-[1.5] text-[#3C4552]">
                      {tariff.fit.text}
                    </p>
                  </div>
                ) : null}

                <div className={`px-5 min-[561px]:px-7 ${tariff.id === 'self' ? 'py-4' : 'py-5'}`}>
                  {tariff.id === 'proSport' ? (
                    <span className="inline-block rounded-full bg-[rgba(74,76,126,0.1)] px-[13px] py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#3E4069]">
                      {tariff.listTitle}
                    </span>
                  ) : (
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: D_TEXT_CAPTION_AA }}
                    >
                      {tariff.listTitle}
                    </p>
                  )}

                  <ul className="mt-3">
                    {tariff.items.map(([lead, rest]) => (
                      <li
                        key={lead}
                        className={`border-b border-[rgba(16,24,38,0.08)] text-[14px] leading-[1.5] text-[#3C4552] last:border-b-0 ${
                          tariff.id === 'self' ? 'py-1.5' : 'py-2'
                        }`}
                      >
                        <span className="font-semibold text-[#101826]">{lead}</span> {rest}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Блок тёплый, хотя в макете он тёмный `#12283E`. Причина не
                  вкусовая: этот цвет почти совпадает с шапкой карточки
                  (`#12263B → #0E1D2E`), и на узких экранах, где карточки идут
                  стопкой, тёмный прямоугольник посреди белого тела читался
                  шапкой СЛЕДУЮЩЕГО тарифа — то есть разрезал Pro надвое
                  (замечание владельца 2026-08-09).

                  Тёплый, а не голубой: акцентного синего на странице уже много
                  — ссылки, выделения, подзаголовки, — и ещё одна голубая плашка
                  добавила бы шума. Здесь он и смысловее: блок про срыв и
                  возвращение, а не про предупреждение.

                  Тона взяты из палитры, новых не заведено: `#F8F1E6` — фон
                  колонки Self в таблице сравнения, `#A8823C` — метка формата.
                  Акцент текста затемнён до `#7A5D28`: исходный давал на этом
                  фоне 3.16:1 и не проходил AA, затемнённый — 5.47:1.

                  От соседнего «Итога недели» (`#FBFAF7`) отличается насыщенностью
                  — два блока подряд не сливаются.

                  Ответ на секцию 01 — отдельным блоком, не пунктом списка.
                  Речь сервиса — «после срыва»: форма «сорвались» обвиняет и
                  остаётся только в собственной речи клиента в переписке 02. */}
                {tariff.id === 'pro' ? (
                  <div className="mx-5 mb-5 rounded-2xl border-l-[3px] border-[#A8823C] bg-[#F8F1E6] px-4 py-[15px] min-[561px]:mx-7">
                    <p
                      className={`${playfair.className} text-[16px] italic leading-[1.35] text-[#101826]`}
                    >
                      После срыва — <span className="text-[#7A5D28]">возвращает в ритм</span>
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.5] text-[#3C4552]">
                      Без необходимости начинать всё заново — с той точки, где остановились.
                    </p>
                  </div>
                ) : null}

                {tariff.id === 'pro' ? (
                  <div className="mx-5 mb-5 rounded-[15px] border min-[561px]:mx-7 border-[rgba(16,24,38,0.08)] bg-[#FBFAF7] px-4 py-4">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.16em]"
                      style={{ color: D_TEXT_CAPTION_AA }}
                    >
                      Итог недели
                    </p>
                    <p className="mt-2 text-[13px] leading-[1.5] text-[#3C4552]">
                      <span className="font-semibold text-[#101826]">Разбор 20–45 минут:</span> что
                      сработало, что мешало и один шаг дальше. Остаются дневник, динамика и итог.
                    </p>
                  </div>
                ) : null}
                <div className="mt-auto px-5 pb-7 min-[561px]:px-7">
                  {tariff.cta.href ? (
                    <a
                      href={tariff.cta.href}
                      className={`flex items-center justify-center rounded-[15px] px-5 py-[15px] text-[14.5px] font-semibold transition-transform duration-[250ms] hover:-translate-y-0.5 ${
                        tariff.id === 'pro'
                          ? 'bg-[#12283E] text-white'
                          : 'border border-[rgba(16,24,38,0.25)] bg-white text-[#101826]'
                      }`}
                    >
                      {tariff.cta.label}
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setProSportOpen(true)}
                      className="flex w-full items-center justify-center rounded-[15px] bg-[#4A4C7E] px-5 py-[15px] text-[14.5px] font-semibold text-white transition-transform duration-[250ms] hover:-translate-y-0.5"
                    >
                      {tariff.cta.label}
                    </button>
                  )}
                  <p
                    className="mt-3 text-center text-[12px] leading-[1.4]"
                    style={{ color: D_TEXT_CAPTION_AA }}
                  >
                    {tariff.cta.note}
                  </p>
                </div>
              </div>
            );
          })}
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
                      <td className="break-words bg-[#F8F1E6] px-2 py-2.5 text-[#5B6472]">
                        {self}
                      </td>
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
                    <p className="mt-2 text-[13px] leading-[1.6] text-[#4A4C7E]">
                      {item.accentNote}
                    </p>
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
      </div>
    </Section>
  );
}
