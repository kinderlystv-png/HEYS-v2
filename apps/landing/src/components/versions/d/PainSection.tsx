// 01 — «Ваша ситуация» (`#pain`).
//
// Блок узнавания: четыре ситуации без карточек и иконок, затем вывод о том, что
// дело не в силе воли. Карточку заявки сюда не ставим: COPY_VOICE 2026-06-27 —
// первая заявка после объяснения и доказательства, не сразу после узнавания.
// Trial-карточка стоит после артефакта недели (`ReviewedWeek`).

import { ClosingLine, Section } from './primitives';

const SITUATIONS = [
  'Вес стоит, и непонятно, почему — вроде бы питаетесь нормально',
  'Советы «для всех» не подходят: у вас поездки, поздние ужины и общий стол с семьёй',
  'Начинаете диету — держитесь 2 недели — срываетесь — вините себя',
  'Пробовали приложения — бросили через неделю, потому что надоело всё считать',
];

export default function PainSection() {
  return (
    <Section id="pain" index="01" label="Ваша ситуация" tone="white">
      <h2
        data-reveal
        className="mt-[54px] text-balance text-center text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.18] tracking-[-0.02em] text-[#101826]"
      >
        Знакомо?
      </h2>

      <ul data-reveal className="mx-auto mt-12 max-w-[760px]">
        {SITUATIONS.map((text, i) => (
          <li
            key={text}
            className="grid grid-cols-[44px_1fr] gap-[18px] border-b border-[rgba(16,24,38,0.12)] px-1 py-[22px] first:border-t"
          >
            <span className="pt-1 text-[11px] font-semibold tracking-[0.16em] text-[color:var(--da)]">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="text-[17px] leading-[1.5] text-[#101826]">{text}</span>
          </li>
        ))}
      </ul>

      <ClosingLine
        lead="Сила воли тут ни при чём."
        accent="Рядом нужен человек, которому не всё равно."
      />

      {/* «Рядом» здесь — описание потребности человека, а не обещание
          доступности куратора: разделение прямо закреплено в COPY_VOICE
          (раздел «Зависит от контекста»). */}
    </Section>
  );
}
