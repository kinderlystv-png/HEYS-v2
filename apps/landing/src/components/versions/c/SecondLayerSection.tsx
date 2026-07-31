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

import { CURATOR_STANDARD } from '@/components/versions/c/curatorStandard';
import { VARIANTS } from '@/config/landing-variants';

// Вопросы про деньги и границы услуги отделены от вопросов про формат: человек
// приходит сюда с одним из двух намерений и не должен просматривать все
// двенадцать строк подряд.
//
// Разбор по ключевым словам, а не по индексам: FAQ живёт в общем контенте
// версии A и может пополняться. Всё, что не опознано, попадает в первую группу,
// поэтому новый вопрос не может потеряться — в худшем случае окажется не в
// самой точной группе.
const TERMS_MATCHERS = [/оплат/i, /возврат/i, /бесплатн/i, /тариф/i];
const LIMITS_MATCHERS = [/медицинск/i, /врач/i];

function matches(question: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(question));
}

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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2 rounded-2xl border border-slate-200 px-5">{children}</div>
    </div>
  );
}

export default function SecondLayerSection() {
  const faq = VARIANTS.A.faq;

  const terms = faq.items.filter((item) => matches(item.q, TERMS_MATCHERS));
  const limits = faq.items.filter(
    (item) => !matches(item.q, TERMS_MATCHERS) && matches(item.q, LIMITS_MATCHERS),
  );
  const format = faq.items.filter(
    (item) => !matches(item.q, TERMS_MATCHERS) && !matches(item.q, LIMITS_MATCHERS),
  );

  return (
    <section id="details" className="bg-white px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <h2 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl">
          Если нужно проверить
        </h2>
        <p className="mt-3 text-[15px] leading-6 text-slate-600">
          Подробности, которые не влияют на выбор, но помогают убедиться.
        </p>

        <div className="mt-6">
          <Group title="Как это работает">
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

            {format.map((item) => (
              <Disclosure key={item.q} summary={item.q}>
                {item.a}
              </Disclosure>
            ))}
          </Group>

          <Group title="Кто ведёт">
            <Disclosure summary="Кто ведёт и по какому стандарту">
              <ul className="space-y-2">
                {CURATOR_STANDARD.map((item) => (
                  <li key={item.short} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400"
                    />
                    <span>{item.full}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </Group>

          {terms.length ? (
            <Group title="Условия и оплата">
              {terms.map((item) => (
                <Disclosure key={item.q} summary={item.q}>
                  {item.a}
                </Disclosure>
              ))}
            </Group>
          ) : null}

          {limits.length ? (
            <Group title="Границы услуги">
              {limits.map((item) => (
                <Disclosure key={item.q} summary={item.q}>
                  {item.a}
                </Disclosure>
              ))}
            </Group>
          ) : null}
        </div>
      </div>
    </section>
  );
}
