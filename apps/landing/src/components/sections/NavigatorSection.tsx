// NavigatorSection.tsx — Секция показывает, как данные недели превращаются
// в решение куратора без medical claim и псевдоточных показателей.

'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

import SectionBadgeBar from '@/components/SectionBadgeBar';

const recoveryRules = [
  {
    number: '01',
    title: 'Был избыток',
    text: 'Без голодной компенсации на следующий день — возвращаемся к обычному питанию.',
  },
  {
    number: '02',
    title: 'Был дефицит',
    text: 'Не продолжаем недоедание — восстанавливаем нормальный ритм приёмов пищи.',
  },
  {
    number: '03',
    title: 'Был праздник или ужин вне дома',
    text: 'Не считаем неделю испорченной — учитываем событие и продолжаем обычный режим.',
  },
];

function AccordionBlock({
  number,
  isVisible,
  isOpen,
  onToggle,
  delay,
  title,
  summary,
  children,
}: {
  number: string;
  isVisible: boolean;
  isOpen: boolean;
  onToggle: () => void;
  delay: number;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const buttonId = `navigator-accordion-button-${number}`;
  const panelId = `navigator-accordion-panel-${number}`;

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white transition-all duration-700 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <button
        id={buttonId}
        type="button"
        className="flex min-h-11 w-full items-start gap-3 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 md:gap-4 md:px-5"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <span className="mt-0.5 flex-shrink-0 text-xs font-bold tracking-[0.14em] text-blue-600">
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold leading-snug text-gray-900 md:text-lg">
            {title}
          </span>
          <span className="mt-1.5 block text-sm leading-relaxed text-gray-600 md:text-base">
            {summary}
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`mt-1 flex-shrink-0 text-slate-400 transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-slate-100 px-4 py-4 text-sm leading-relaxed text-gray-700 md:px-5 md:text-base"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default function NavigatorSection() {
  const [isVisible, setIsVisible] = useState(false);
  const [openIndex, setOpenIndex] = useState<number>(-1);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const toggleAccordion = (index: number) => {
    setOpenIndex((current) => (current === index ? -1 : index));
  };

  return (
    <section ref={sectionRef} id="navigator" className="relative bg-white pb-16 md:pb-20">
      <SectionBadgeBar>05 — КАК КУРАТОР ПРИНИМАЕТ РЕШЕНИЕ</SectionBadgeBar>

      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <h2
            className={`mx-auto mb-4 max-w-3xl text-center text-2xl font-bold text-gray-900 transition-all duration-700 ease-out md:text-3xl lg:text-4xl ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            Не один неидеальный день, а изменения за неделю.
            <br />
            <span className="text-blue-600">HEYS помогает увидеть их и выбрать следующий шаг.</span>
          </h2>
          <p
            className={`mx-auto mb-8 max-w-2xl text-center text-sm leading-relaxed text-gray-600 transition-all duration-700 ease-out md:mb-10 md:text-base ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            Система сопоставляет питание, сон, активность и изменения графика с вашим обычным
            ритмом. Это не диагноз и не автоматический совет: решение принимает куратор.
          </p>

          <article
            className={`mb-4 rounded-3xl border border-slate-200 bg-slate-50/50 px-5 py-6 transition-all duration-700 ease-out md:px-8 md:py-7 ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
            style={{ transitionDelay: '180ms' }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
              Демонстрационный пример
            </p>
            <h3 className="mt-2 text-xl font-bold leading-snug text-gray-900 md:text-2xl">
              Вечером снова тянет на еду
            </h3>
            <dl className="mt-5 divide-y divide-slate-200">
              <div className="pb-4">
                <dt className="text-sm font-semibold text-gray-900">Что изменилось</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 md:text-base">
                  Три ночи подряд сон был короче обычного, два дня пропускался обед, а ужин стал
                  позже.
                </dd>
              </div>
              <div className="py-4">
                <dt className="text-sm font-semibold text-gray-900">Что могло повлиять</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 md:text-base">
                  Недосып и накопленный голод могут усиливать вечернюю тягу.
                </dd>
              </div>
              <div className="pt-4">
                <dt className="text-sm font-semibold text-gray-900">Следующий шаг</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 md:text-base">
                  Вернуть полноценный обед и упростить вечер — затем посмотреть, станет ли тяга
                  слабее.
                </dd>
              </div>
            </dl>
          </article>

          <div className="space-y-3">
            <AccordionBlock
              number="01"
              isVisible={isVisible}
              isOpen={openIndex === 0}
              onToggle={() => toggleAccordion(0)}
              delay={260}
              title="Как HEYS замечает сдвиг"
              summary="Сравнивает текущую неделю с вашим обычным ритмом и отмечает повторяющиеся изменения — без диагноза и выводов по одному показателю."
            >
              <p>
                Куратор смотрит на несколько дней целиком: питание, сон, нагрузку, интервалы между
                приёмами пищи и обстоятельства. Один продукт или один неидеальный день сами по себе
                не становятся основанием для вывода.
              </p>
            </AccordionBlock>

            <AccordionBlock
              number="02"
              isVisible={isVisible}
              isOpen={openIndex === 1}
              onToggle={() => toggleAccordion(1)}
              delay={340}
              title="Что происходит после неидеального дня"
              summary="Куратор не предлагает голодать, «отрабатывать» еду или начинать всё заново. Задача — спокойно вернуть обычный ритм."
            >
              <ol className="divide-y divide-slate-200">
                {recoveryRules.map((rule) => (
                  <li
                    key={rule.title}
                    className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[2rem_11rem_1fr] sm:gap-3"
                  >
                    <span className="text-xs font-bold tracking-[0.14em] text-blue-600">
                      {rule.number}
                    </span>
                    <span className="font-semibold text-gray-900">{rule.title}</span>
                    <span className="text-gray-600">{rule.text}</span>
                  </li>
                ))}
              </ol>
            </AccordionBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
