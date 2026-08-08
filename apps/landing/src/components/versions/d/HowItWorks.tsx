// 02 — «Как устроено» (`#curator`).
//
// Ключевой блок страницы. Три шага объясняют механику, но главное здесь —
// переписка: порядок реплик обязателен, куратор СПРАШИВАЕТ раньше, чем
// советует. Готовый разбор без уточнения умеет выдавать и алгоритм, поэтому
// именно эта последовательность — единственное место, где вникание показано,
// а не заявлено (`COPY_VOICE` § «Что мы защищаем»).

import { Accent, ClosingLine, Section, SectionLead } from './primitives';

import { PRICING } from '@/config/pricing';

const STEPS = [
  {
    index: '01',
    title: 'Вы присылаете',
    // «обычно» — обязательное смягчение: число описывает типичный случай, а не
    // обещание сервиса (решение владельца 2026-08-02, `15` №50). Фраза
    // повторяется ещё в подзаголовке героя и в первом ответе FAQ.
    text: 'Фото еды, снимок с весов, короткое сообщение или голосовое. Обычно до 3 минут в день — считать и заполнять ничего не нужно.',
  },
  {
    index: '02',
    title: 'Куратор ведёт дневник',
    text: 'Заносит в HEYS еду, сон, нагрузку и обстоятельства дня.',
  },
  {
    index: '03',
    title: 'Вы видите результат',
    text: 'Открываете HEYS и видите готовый дневник, динамику и то, как складывается день.',
  },
];

interface Message {
  author: 'client' | 'curator';
  meta: string;
  text: string;
}

const DIALOG: Message[] = [
  { author: 'client', meta: 'вы · 21:14', text: 'Вчера вечером снова был срыв.' },
  {
    author: 'curator',
    meta: 'куратор · 09:02',
    text: 'Вижу по дневнику: ужин все три дня уходил поздно. А обед в эти дни получался?',
  },
  {
    author: 'client',
    meta: 'вы · 09:15',
    text: 'Честно — нет. На работе завал, перехватывала на бегу.',
  },
  {
    author: 'curator',
    meta: 'куратор · 09:21',
    text: 'Тогда это не про силу воли: днём копится голод — вечером он догоняет. Начнём с простого: вернём полноценный обед и посмотрим, станет ли вечер спокойнее.',
  },
];

// Сравнение с трекером. Переехало сюда из секции тарифов (решение владельца
// 2026-08-08) и обратно не возвращается: в прайсе таблица лежала в спойлере
// «Сравнить форматы», который обещает сравнить форматы HEYS между собой, а
// трекера в прайсе нет вовсе. Здесь она читается на своём месте — сразу после
// того, как объяснена механика, — и стоит открытым блоком, а не по клику.
//
// Цена берётся из `PRICING`: хардкод развалил бы синхронизацию с
// legal-документами (pre-commit `check-pricing-sync`).
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
  // Не «Цена: от 0 ₽ против 7 990», иначе последняя — самая запоминающаяся —
  // строка таблицы читается как проигрыш: бесплатный трекер против платного
  // сервиса. Сравниваем полную цену участия: у трекера деньги нулевые, но
  // время тратится каждый день; у нас наоборот. Про ручной ввод здесь не
  // говорим — `COPY_VOICE` 2026-07-28 запрещает утверждать это про все
  // трекеры.
  [
    'Что это стоит вам',
    'от 0 ₽ и ваше время каждый день',
    `${PRICING.pro.price} ₽/мес и обычно до 3 минут в день`,
  ],
];

export default function HowItWorks() {
  return (
    <Section id="curator" index="02" label="Как устроено" tone="warm">
      {/* Лид обязателен: без него заголовок падает сразу в сетку шагов, и
          механика читается раньше, чем сказано, ради чего она нужна. */}
      <div data-reveal>
        {/* Заголовок крупнее общего `SectionTitle`: в прототипе (`prototype.html`
            строка 261) у секций 01–03 размер `clamp(30px,3.8vw,46px)` против
            `clamp(30px,3.8vw,44px)` у 04–06 и FAQ — спад мягкий, в два пункта:
            нижняя половина страницы успокаивается, но не читается как другой
            набор заголовков
            по весу. Размер задан локально, `primitives.tsx` общий для всех. */}
        <h2 className="mx-auto mt-[54px] max-w-[760px] text-balance text-center text-[clamp(30px,3.8vw,46px)] font-semibold leading-[1.18] tracking-[-0.02em] text-[#101826]">
          Дневник не нужно заполнять <Accent>вручную.</Accent>
        </h2>
        <SectionLead>
          Куратор переносит данные в HEYS и расспрашивает о том, чего в цифрах не видно. Он
          ежедневно смотрит, что изменилось, и помогает поправить режим, пока тот только начинает
          сбиваться.
        </SectionLead>
      </div>

      <div data-reveal className="mt-14 grid border-y border-[rgba(16,24,38,0.1)] sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div
            key={step.index}
            className={`px-0 py-8 sm:px-7 ${i === 0 ? 'sm:pl-0' : ''} ${
              i === STEPS.length - 1 ? 'sm:pr-0' : ''
            } ${i > 0 ? 'border-t border-[rgba(16,24,38,0.1)] sm:border-t-0' : ''}`}
          >
            <span className="text-[11px] font-semibold tracking-[0.16em] text-[color:var(--da)]">
              {step.index}
            </span>
            <h3 className="mt-3 text-[18px] font-semibold leading-[1.35] text-[#101826]">
              {step.title}
            </h3>
            <p className="mt-3 text-[15px] leading-[1.6] text-[#5B6472]">{step.text}</p>
          </div>
        ))}
      </div>

      <div data-reveal className="mx-auto mt-16 max-w-[620px]">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
          Пример разбора по дневнику
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {DIALOG.map((message) => (
            <div
              key={message.meta + message.text}
              className={`flex flex-col ${message.author === 'client' ? 'items-end' : 'items-start'}`}
            >
              <span className="px-1 pb-1 text-[11px] text-[#9AA3B0]">{message.meta}</span>
              <p
                className={
                  message.author === 'client'
                    ? 'max-w-[78%] rounded-[18px_18px_6px_18px] bg-[#12283E] px-5 py-3.5 text-[15px] leading-[1.5] text-white'
                    : 'max-w-[88%] rounded-[18px_18px_18px_6px] bg-white px-5 py-3.5 text-[15px] leading-[1.5] text-[#101826] shadow-[0_10px_28px_rgba(16,24,38,0.05)]'
                }
              >
                {message.text}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-[11px] text-[#9AA3B0]">Демонстрационный пример</p>
      </div>

      <ClosingLine
        lead="Вам не нужно открывать HEYS после каждого приёма пищи."
        accent="И разговор начинается не с «расскажите, что вы ели», а с того, что куратор уже видит."
      />

      <div data-reveal className="mx-auto mt-16 max-w-[620px]">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
          Чем это отличается от трекера
        </p>

        {/* Ширина подобрана так, чтобы на обычном телефоне таблица помещалась
            целиком: колонка HEYS Pro — тот самый ответ ради которого блок и
            стоит, обрезать её горизонтальной прокруткой нельзя. `min-w` держит
            читаемость на совсем узких экранах, а прокрутка при этом живёт
            внутри обёртки: горизонтальный ход всей страницы в этой версии уже
            был дефектом, второй раз его заводить нельзя. */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[rgba(16,24,38,0.12)]">
                <th className="w-[30%] py-3 pr-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
                  &nbsp;
                </th>
                <th className="py-3 pr-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A94A2]">
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
                  <th
                    scope="row"
                    className="py-2.5 pr-3 text-left text-[13px] font-medium leading-[1.5] text-[#101826]"
                  >
                    {row}
                  </th>
                  <td className="py-2.5 pr-3 text-[13px] leading-[1.5] text-[#5B6472]">
                    {tracker}
                  </td>
                  <td className="py-2.5 text-[13px] font-medium leading-[1.5] text-[#101826]">
                    {heys}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
