// 04 — «Неделя после разбора» (`#week`).
//
// Артефакт: заполненный дневник за 7 дней, повторяющийся сдвиг и один
// следующий шаг. Порядок четырёх блоков разбора критичен — второй блок («что
// уточнил куратор») и есть УТП: между наблюдением и выводом стоит вопрос
// человека, а не автоматический совет.
//
// Данные недели демонстрационные и обезличенные (канон `маркетинг/30` L3).
// Настоящий скриншот недели из приложения ждёт материалов — слот в макете.

import { D_CTA_HREF, D_CTA_LABEL } from './nav';
import { Accent, Caption, PrimaryCta, Section, SectionLead, SectionTitle } from './primitives';
import { D_WEEK } from './theme';

interface Day {
  label: string;
  /** Столбик: заполненный день или день с пропуском. */
  bar: 'full' | 'skipped';
  lateDinner: boolean;
  shortSleep: boolean;
}

const WEEK: Day[] = [
  { label: 'Пн', bar: 'full', lateDinner: false, shortSleep: false },
  { label: 'Вт', bar: 'full', lateDinner: true, shortSleep: false },
  { label: 'Ср', bar: 'full', lateDinner: false, shortSleep: true },
  { label: 'Чт', bar: 'skipped', lateDinner: true, shortSleep: true },
  { label: 'Пт', bar: 'skipped', lateDinner: true, shortSleep: true },
  { label: 'Сб', bar: 'full', lateDinner: false, shortSleep: false },
  { label: 'Вс', bar: 'full', lateDinner: false, shortSleep: false },
];

const LEGEND = [
  { color: D_WEEK.full, text: 'все приёмы пищи' },
  { color: D_WEEK.skipped, text: 'день с пропуском' },
  { color: D_WEEK.lateDinner, text: 'поздний ужин' },
  { color: D_WEEK.shortSleep, text: 'короткий сон' },
];

const ANALYSIS = [
  {
    title: 'Что заметил куратор',
    text: 'Три ночи подряд сон был короче обычного, в четверг и пятницу пропускался обед, а ужин стал позже.',
    accentTitle: false,
  },
  {
    title: 'Что уточнил куратор',
    text: 'Спросил про четверг и пятницу. Оказалось — поздние встречи, обед не получался.',
    accentTitle: true,
  },
  {
    title: 'Что могло повлиять',
    text: 'Накопленный за день голод и недосып усиливают вечернюю тягу — дело не в дисциплине.',
    accentTitle: false,
  },
];

// Спойлер расшифровывает артефакт выше, поэтому говорит только о том, что на
// нём нарисовано: приёмы пищи, пропуск, поздний ужин, короткий сон. Вода и шаги
// отсюда убраны — на графике их нет, и блок превращался в отдельное обещание.
const ALSO_SEEN = [
  'В какое время был каждый приём пищи и сколько часов между ними',
  'Сколько дней подряд повторялся сдвиг, а не был ли он разовым',
  'Что вы писали про самочувствие и нагрузку в эти дни',
];

// Короткие эталонные формулировки прототипа: это второй слой, и длинные
// объяснения здесь спорят с ответом, за которым спойлер открывают.
const NOT_A_GOOD_WEEK = [
  {
    title: 'Был избыток',
    text: 'Наутро возвращаемся к обычному питанию. Без голодной компенсации.',
  },
  {
    title: 'Был дефицит',
    text: 'Возвращаемся к обычному ритму приёмов пищи. Тоже без компенсации.',
  },
  {
    title: 'Праздник или ужин вне дома',
    text: 'Неделя не испорчена. Учитываем событие и продолжаем обычный режим.',
  },
];

export default function ReviewedWeek() {
  return (
    <Section id="week" index="04" label="Неделя после разбора" tone="warm">
      <div data-reveal>
        <SectionTitle>
          Не один неидеальный день, а <Accent>изменения за неделю.</Accent>
        </SectionTitle>
        <SectionLead>
          Заполненный дневник, повторяющийся сдвиг и один следующий шаг. Не диагноз и не
          автоматический совет: выводы делает куратор, а не система.
        </SectionLead>
      </div>

      <figure
        data-reveal
        className="mx-auto mt-14 max-w-[560px] overflow-hidden rounded-3xl border border-[rgba(16,24,38,0.1)] bg-white shadow-[0_16px_44px_rgba(16,24,38,0.05)]"
      >
        <div className="flex items-center justify-between border-b border-[rgba(16,24,38,0.08)] px-7 py-5">
          <span className="text-[14px] font-semibold text-[#101826]">Ваша неделя в HEYS</span>
          <span className="text-[11px] text-[#9AA3B0]">7 дней подряд</span>
        </div>

        <div className="px-7 py-7">
          <div className="grid grid-cols-7 gap-[7px]">
            {WEEK.map((day) => (
              <div key={day.label} className="text-center">
                <p className="text-[11px] text-[#8A94A2]">{day.label}</p>
                <div
                  className="mt-2 h-8 rounded-md"
                  style={{ background: day.bar === 'full' ? D_WEEK.full : D_WEEK.skipped }}
                />
                <div className="mt-2 flex justify-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: day.lateDinner ? D_WEEK.lateDinner : D_WEEK.neutral }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: day.shortSleep ? D_WEEK.shortSleep : D_WEEK.neutral }}
                  />
                </div>
              </div>
            ))}
          </div>

          <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2">
            {LEGEND.map((item) => (
              <li key={item.text} className="flex items-center gap-2 text-[11px] text-[#8A94A2]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-px bg-[rgba(16,24,38,0.08)]">
          {ANALYSIS.map((block) => (
            <div key={block.title} className="bg-white px-7 py-6">
              <h3
                className={`text-[13px] font-semibold uppercase tracking-[0.14em] ${
                  block.accentTitle ? 'text-[color:var(--da)]' : 'text-[#8A94A2]'
                }`}
              >
                {block.title}
              </h3>
              <p className="mt-3 text-[15px] leading-[1.6] text-[#101826]">{block.text}</p>
            </div>
          ))}

          {/* Следующий шаг — один и выполнимый. Тёмная плашка отделяет его от
              наблюдений: это то единственное, что человеку предлагается сделать. */}
          <div className="bg-[#12283E] px-7 py-7">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#8FC1E8]">
              Следующий шаг
            </h3>
            <p className="mt-3 text-[15px] leading-[1.6] text-white">
              Вернуть полноценный обед в четверг и пятницу — и посмотреть, станет ли вечер
              спокойнее.
            </p>
          </div>
        </div>

        <details className="group border-t border-[rgba(16,24,38,0.08)] bg-white">
          <summary className="flex cursor-pointer items-center justify-between px-7 py-5 text-[14px] font-semibold text-[#101826] [&::-webkit-details-marker]:hidden">
            Что ещё видит куратор в этой неделе
            <span
              aria-hidden="true"
              className="ml-4 inline-block h-2 w-2 shrink-0 rotate-45 border-b border-r border-[#9AA3B0] transition-transform duration-[250ms] group-open:rotate-[225deg]"
            />
          </summary>
          <ul className="space-y-3 px-7 pb-6">
            {ALSO_SEEN.map((text) => (
              <li key={text} className="flex gap-3 text-[14.5px] leading-[1.6] text-[#5B6472]">
                <span
                  aria-hidden="true"
                  className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[color:var(--da)]"
                />
                {text}
              </li>
            ))}
          </ul>
        </details>

        <figcaption className="bg-[#FBFAF7] px-7 py-4 text-center text-[11px] text-[#9AA3B0]">
          Демонстрационный пример · данные обезличены
        </figcaption>
      </figure>

      {/* Второй слой: вопрос «а если неделя не задалась» задают почти все, но
          на первом слое он увёл бы разговор от того, что человек получает. */}
      <details
        data-reveal
        className="group mx-auto mt-8 max-w-[560px] rounded-[18px] border border-[rgba(16,24,38,0.12)] bg-white px-7 py-5"
      >
        <summary className="flex cursor-pointer items-center justify-between text-[15px] font-semibold text-[#101826] [&::-webkit-details-marker]:hidden">
          А если неделя не задалась?
          <span
            aria-hidden="true"
            className="ml-4 inline-block h-2 w-2 shrink-0 rotate-45 border-b border-r border-[#9AA3B0] transition-transform duration-[250ms] group-open:rotate-[225deg]"
          />
        </summary>

        <p className="mt-4 text-[14.5px] leading-[1.7] text-[#5B6472]">
          Никто не предложит голодать, «отрабатывать» съеденное или начинать всё заново.
        </p>

        <div className="mt-5">
          {NOT_A_GOOD_WEEK.map((item) => (
            <div
              key={item.title}
              className="grid gap-2 border-t border-[rgba(16,24,38,0.1)] py-4 sm:grid-cols-[minmax(120px,170px)_1fr] sm:gap-6"
            >
              <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8A94A2]">
                {item.title}
              </p>
              <p className="text-[14.5px] leading-[1.6] text-[#5B6472]">{item.text}</p>
            </div>
          ))}
        </div>
      </details>

      {/* Первая body-заявка — после узнавания, механики и артефакта недели
          (COPY_VOICE 2026-06-27). Раньше карточка стояла в `#pain` и опережала proof. */}
      <div
        data-reveal
        className="mx-auto mt-14 max-w-[640px] rounded-3xl border border-[rgba(16,24,38,0.12)] bg-[#FBFAF7] px-9 py-10 text-center shadow-[0_16px_44px_rgba(16,24,38,0.05)]"
      >
        <h3 className="text-[clamp(17px,1.9vw,20px)] font-semibold leading-[1.35] text-[#101826]">
          Если хотите такую неделю — начните с <Accent>недели Pro.</Accent>
        </h3>
        <p className="mx-auto mt-4 max-w-[440px] text-[14.5px] leading-[1.6] text-[#5B6472]">
          Неделю куратор ведёт ваш дневник и разбирает, где день начинает сбиваться. Дальше решаете
          сами.
        </p>
        <div className="mt-7">
          <PrimaryCta href={D_CTA_HREF}>{D_CTA_LABEL}</PrimaryCta>
        </div>
        <Caption>0 ₽ · без карты и автосписаний</Caption>
      </div>
    </Section>
  );
}
