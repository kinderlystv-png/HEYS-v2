// Блок 6 версии C — второй слой: «А если…?».
//
// Всё, что не меняет решение, но нужно для его проверки: сравнение форматов,
// состав сопровождения, кто ведёт, условия и частые вопросы. Раскрывается по
// запросу — это и есть progressive disclosure из принципов версии C.
//
// Сравнение здесь единственное на странице: сравнение категорий
// (трекер / консультация / HEYS). Сравнение тарифов между собой не дублируется —
// оно решается самим блоком цены.
//
// FAQ переиспользуется из общего контента варианта A, чтобы ответы не разъехались
// между версиями.

import { VARIANTS } from '@/config/landing-variants';

const COMPARISON = [
  {
    title: 'Трекер',
    text: 'Дневник заполняете сами, а почему вечер сбился и что делать дальше — он не объяснит.',
  },
  {
    title: 'Консультация',
    text: 'Помогает на встрече, но детали недели приходится восстанавливать по памяти.',
  },
  {
    title: 'HEYS',
    text: 'Присылаете фото или сообщение — куратор ведёт дневник, видит контекст недели и помогает выбрать следующий шаг.',
  },
];

const CURATOR_STANDARD = [
  'С вами работает куратор HEYS с опытом более 20 лет в питании и сопровождении.',
  'Куратор смотрит на несколько дней целиком и уточняет контекст, прежде чем обсуждать следующий шаг.',
  'Одновременно ведётся ограниченное число участников — чтобы вникать в ритм недели каждого.',
];

function Disclosure({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-slate-200 last:border-b-0">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-[15px] font-medium text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {summary}
        <span
          aria-hidden="true"
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="pb-4 text-[14px] leading-6 text-slate-600">{children}</div>
    </details>
  );
}

export default function SecondLayerSection() {
  const faq = VARIANTS.A.faq;

  return (
    <section id="details" className="bg-white px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
          Если нужно проверить
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">
          Подробности, которые не влияют на выбор, но помогают убедиться.
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 px-5">
          <Disclosure summary="Чем это отличается от трекера и консультации">
            <ul className="space-y-3">
              {COMPARISON.map((item) => (
                <li key={item.title}>
                  <span className="font-semibold text-slate-900">{item.title}. </span>
                  {item.text}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-slate-500">
              При медицинских показаниях HEYS не заменяет врача или нутрициолога.
            </p>
          </Disclosure>

          <Disclosure summary="Кто ведёт и по какому стандарту">
            <ul className="space-y-2">
              {CURATOR_STANDARD.map((item) => (
                <li key={item} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Disclosure>

          {faq.items.map((item) => (
            <Disclosure key={item.q} summary={item.q}>
              {item.a}
            </Disclosure>
          ))}
        </div>
      </div>
    </section>
  );
}
