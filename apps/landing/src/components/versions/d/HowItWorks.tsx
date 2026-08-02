// 02 — «Как устроено» (`#curator`).
//
// Ключевой блок страницы. Три шага объясняют механику, но главное здесь —
// переписка: порядок реплик обязателен, куратор СПРАШИВАЕТ раньше, чем
// советует. Готовый разбор без уточнения умеет выдавать и алгоритм, поэтому
// именно эта последовательность — единственное место, где вникание показано,
// а не заявлено (`COPY_VOICE` § «Что мы защищаем»).

import { Accent, ClosingLine, Section } from './primitives';

const STEPS = [
  {
    index: '01',
    title: 'Вы присылаете',
    // «обычно» — обязательное смягчение: число описывает типичный случай, а не
    // обещание сервиса (решение владельца 2026-08-02, `15` №50). Фраза
    // повторяется ещё в подзаголовке героя и в первом ответе FAQ.
    text: 'Фото еды, снимок с весов, короткое сообщение или голосовое. Обычно 3–5 минут в день — считать и заполнять ничего не нужно.',
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

export default function HowItWorks() {
  return (
    <Section id="curator" index="02" label="Как устроено" tone="warm">
      <h2
        data-reveal
        className="mx-auto mt-[54px] max-w-[760px] text-balance text-center text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.18] tracking-[-0.02em] text-[#101826]"
      >
        Дневник не нужно заполнять <Accent>вручную.</Accent>
      </h2>

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
    </Section>
  );
}
