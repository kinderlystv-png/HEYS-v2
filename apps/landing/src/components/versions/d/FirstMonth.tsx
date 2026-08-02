// 03 — «Ваш первый месяц» (`#how-it-works`).
//
// Четыре строки «период → что происходит». Блок отвечает на вопрос «а что
// дальше первой недели»: он идёт после механики и до артефакта недели, поэтому
// говорит о ритме сопровождения, а не о функциях приложения.

import { Section } from './primitives';

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
    text: 'Набралась неделя — видно, что повторяется. Куратор уточняет, что стояло за трудными днями, и предлагает один выполнимый шаг.',
  },
  {
    index: '04',
    period: 'Месяц +',
    title: 'Режим, который выдерживает обычную жизнь',
    text: 'Поездки, праздники и завалы на работе перестают обнулять прогресс: после сбоя вы возвращаетесь в ритм, а не начинаете всё заново.',
  },
];

export default function FirstMonth() {
  return (
    <Section id="how-it-works" index="03" label="Ваш первый месяц" tone="white">
      <h2
        data-reveal
        className="mx-auto mt-[54px] max-w-[760px] text-balance text-center text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.18] tracking-[-0.02em] text-[#101826]"
      >
        Что происходит в первый месяц
      </h2>

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
