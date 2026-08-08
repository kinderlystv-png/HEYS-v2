// 05 — «Кто ведёт и как» (`#trust`).
//
// Блок отвечает на вопрос «кому я доверяю свою неделю». Здесь же — граница
// услуги: чего HEYS не делает. Медицинские границы и правила обращения с
// данными держим в первом слое: прятать их в <details> запрещено
// (progressive disclosure не распространяется на безопасность и границы).
//
// Портрет и видео-знакомство ждут съёмки (`47` фаза 2). Слот сделан локальным,
// а не переиспользован из версии B: тамошний `MediaSlot` жёстко свёрстан в
// палитре B и не принимает оформления, а тащить в него параметры чужой версии
// ради одного кадра — хуже, чем десять строк здесь.

import { playfair } from './fonts';
import { Accent, Section, SectionLead, SectionTitle } from './primitives';

const PRINCIPLES = [
  {
    title: 'Один порядок разбора',
    text: 'Сначала факты недели, затем возможные причины, и только потом — один следующий шаг. Одинаково для всех участников, независимо от дня и настроения.',
  },
  {
    title: 'Ваши данные',
    text: 'Дневник и переписка доступны вам и вашему куратору. Данные о здоровье обрабатываются по отдельному согласию, примеры на сайте обезличены.',
  },
  {
    title: 'Чего HEYS не делает',
    text: 'Не ставит диагнозов, не назначает лечение и не трактует анализы. Не предлагает голодать или «отрабатывать» съеденное. При заболеваниях нужен врач.',
  },
];

const FACTS = [
  // Рядом с именем «Антон» это уже биография человека, не абстрактный слоган.
  // Формулировка закреплена `COPY_VOICE` (запись 2026-08-06): «практики», не
  // «опыт». В прототипе осталась старая редакция — расходится намеренно.
  'Более 20 лет практики в питании и сопровождении',
  // Подлежащее вернули: под именем строка без него читалась как обрывок.
  'Куратор берёт немного участников — чтобы хватало времени вникать в неделю каждого',
];

export default function CuratorSection() {
  return (
    <Section id="trust" index="05" label="Кто ведёт и как" tone="white">
      <div data-reveal>
        <SectionTitle>
          Вникание здесь — не обещание, а <Accent>стандарт работы.</Accent>
        </SectionTitle>
        <SectionLead>
          За словом «вникает» стоят опыт, один порядок разбора и ограниченное число участников —
          чтобы времени хватало на каждого.
        </SectionLead>
      </div>

      <div
        data-reveal
        className="mx-auto mt-14 grid max-w-[860px] gap-10 rounded-3xl border border-[rgba(16,24,38,0.1)] bg-[#FBFAF7] p-9 sm:grid-cols-[minmax(0,250px)_minmax(0,1fr)]"
      >
        {/* Слот портрета. До съёмки — честная рамка с описанием кадра, а не
            стоковое лицо: страница о вникании не может начинаться с подделки. */}
        <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[rgba(16,24,38,0.16)] bg-white px-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA3B0]">
            Съёмка запланирована · портрет
          </p>
          <p className="text-[13px] leading-5 text-[#8A94A2]">
            Куратор за работой: разбор недели участника
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A94A2]">
            Куратор HEYS
          </p>
          <p className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#101826]">
            Антон
          </p>

          <blockquote
            className={`${playfair.className} mt-5 text-[clamp(19px,2.2vw,24px)] font-medium italic leading-[1.45] text-[#101826]`}
          >
            «Моя задача — не оценивать идеальность питания, а собрать факты, увидеть повторяющийся
            сбой и предложить один выполнимый следующий шаг. И не исчезать, когда неделя идёт не по
            плану.»
          </blockquote>

          <ul className="mt-7 space-y-3">
            {FACTS.map((fact) => (
              <li key={fact} className="flex gap-3 text-[15px] leading-[1.6] text-[#5B6472]">
                <span aria-hidden="true" className="text-[color:var(--da)]">
                  —
                </span>
                {fact}
              </li>
            ))}
          </ul>

          {/* УДАЛИТЬ, когда появятся материалы съёмки (`47` фаза 2). */}
          <p className="mt-6 text-[12px] leading-[1.5] text-[#9AA3B0]">
            Видео-знакомство появится здесь после съёмки.
          </p>
        </div>
      </div>

      <div data-reveal className="mt-8 grid gap-5 sm:grid-cols-3">
        {PRINCIPLES.map((item) => (
          <div
            key={item.title}
            className="rounded-[20px] border border-[rgba(16,24,38,0.1)] bg-white px-7 py-[30px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_rgba(16,24,38,0.08)]"
          >
            <h3 className="text-[17px] font-semibold leading-[1.35] text-[#101826]">
              {item.title}
            </h3>
            <p className="mt-3 text-[14.5px] leading-[1.6] text-[#5B6472]">{item.text}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
