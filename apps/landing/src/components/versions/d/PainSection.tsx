// 01 — «Ваша ситуация» (`#pain`).
//
// Блок узнавания: четыре ситуации без карточек и иконок, затем вывод о том, что
// дело не в силе воли, и карточка-CTA. Порядок важен: страница сначала называет
// ситуацию человека и только потом переходит к механике сервиса.

import { Accent, Caption, ClosingLine, PrimaryCta, Section } from './primitives';

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

      <div
        data-reveal
        className="mx-auto mt-14 max-w-[640px] rounded-3xl border border-[rgba(16,24,38,0.12)] bg-[#FBFAF7] px-9 py-10 text-center shadow-[0_16px_44px_rgba(16,24,38,0.05)]"
      >
        <h3 className="text-[20px] font-semibold leading-[1.35] text-[#101826]">
          Если узнали себя — начните с <Accent>недели Pro.</Accent>
        </h3>
        <p className="mx-auto mt-4 max-w-[440px] text-[14.5px] leading-[1.6] text-[#5B6472]">
          Неделю куратор ведёт ваш дневник и разбирает, где день начинает сбиваться. Дальше решаете
          сами.
        </p>
        <div className="mt-7">
          <PrimaryCta href="#trial">Начать неделю Pro</PrimaryCta>
        </div>
        <Caption>0 ₽ · без карты и автосписаний</Caption>
      </div>
    </Section>
  );
}
