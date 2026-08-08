// 03 — «Ваш первый месяц» (`#how-it-works`).
//
// Четыре строки «период → что происходит». Блок отвечает на вопрос «а что
// дальше первой недели»: он идёт после механики и до артефакта недели, поэтому
// говорит о ритме сопровождения, а не о функциях приложения.

import { Accent, Section, SectionLead } from './primitives';

// Тексты смешанного происхождения (решение дизайнера 2026-08-08): «День 1» и
// «Дни 2–7» оставлены в кодовой редакции — она конкретнее; «Неделя 2» и
// «Месяц +» возвращены дословно из прототипа.
const STAGES = [
  {
    index: '01',
    period: 'День 1',
    title: 'Куратор знакомится с вами и помогает начать',
    text: 'Спрашивает про ваш обычный день, график и то, что уже пробовали. Первые приёмы пищи переносит в дневник сам — вам остаётся прислать, что было.',
  },
  {
    index: '02',
    period: 'Дни 2–7',
    title: 'Дневник ведёт куратор — не вы',
    text: 'Вы присылаете фото, голосовые или пару фраз. Еда, сон, нагрузка и обстоятельства дня попадают в HEYS без вашего участия.',
  },
  {
    index: '03',
    period: 'Неделя 2',
    title: 'Свои причины, а не советы из интернета',
    text: 'Куратор смотрит не день, а неделю: где пропадает обед, как короткий сон отзывается вечерней тягой, что меняется после поездки. Вместо совета «для всех» — человек, который знает, как проходит именно ваша неделя.',
  },
  {
    index: '04',
    period: 'Месяц +',
    title: 'Режим, который выдерживает обычную жизнь',
    text: 'Не диета с датой окончания, а ритм, который переживает поездки, усталость и семейные ужины. Сбились — куратор разбирается, что изменилось, и предлагает один простой шаг.',
  },
];

export default function FirstMonth() {
  return (
    <Section id="how-it-works" index="03" label="Ваш первый месяц" tone="white">
      {/* Акцент антиквой обязателен: это был единственный H2 версии D без
          акцентного слова — ритм заголовков страницы на нём спотыкался. */}
      <div data-reveal>
        <h2 className="mx-auto mt-[54px] max-w-[760px] text-balance text-center text-[clamp(30px,3.8vw,46px)] font-semibold leading-[1.18] tracking-[-0.02em] text-[#101826]">
          Как выглядит ваш первый месяц <Accent>с HEYS</Accent>
        </h2>
        <SectionLead>
          От заявки до первой устойчивой недели — без ощущения, что вас бросили разбираться в
          приложении.
        </SectionLead>
      </div>

      <div data-reveal className="mx-auto mt-12 max-w-[860px]">
        {STAGES.map((stage) => (
          <div
            key={stage.index}
            className="grid gap-7 border-b border-[rgba(16,24,38,0.12)] py-[34px] first:border-t sm:grid-cols-[minmax(120px,200px)_1fr]"
          >
            <div>
              <span className="text-[11px] font-semibold tracking-[0.16em] text-[color:var(--da)]">
                {stage.index}
              </span>
              <p className="mt-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#5B6472]">
                {stage.period}
              </p>
            </div>
            <div>
              <h3 className="text-[20px] font-semibold leading-[1.35] text-[#101826]">
                {stage.title}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.65] text-[#5B6472]">{stage.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
