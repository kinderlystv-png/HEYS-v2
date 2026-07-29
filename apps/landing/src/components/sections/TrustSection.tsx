// TrustSection.tsx — Секция доверия показывает опыт куратора, стандарт
// недельного разбора и ограниченную нагрузку без повтора механики продукта.

'use client';

import { useEffect, useRef, useState } from 'react';

import SectionBadgeBar from '@/components/SectionBadgeBar';

const trustPoints = [
  {
    number: '01',
    title: '20+ лет опыта',
    text: 'С вами работает куратор HEYS с опытом более 20 лет в питании и сопровождении.',
    delay: 280,
  },
  {
    number: '02',
    title: 'Разбор без поспешных выводов',
    text: 'Куратор смотрит на несколько дней целиком, уточняет контекст и только после этого обсуждает с вами следующий шаг — без выводов по одному продукту или неидеальному дню.',
    delay: 360,
  },
  {
    number: '03',
    title: 'Ограниченное число участников',
    text: 'Куратор ведёт столько людей, чтобы вникать в ритм недели и обстоятельства жизни каждого, а не отвечать по шаблону.',
    delay: 440,
  },
];

export default function TrustSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="trust" className="relative bg-slate-50 pb-14 md:pb-20">
      <SectionBadgeBar>06 — КТО ВЕДЁТ И КАК</SectionBadgeBar>

      <div className="container mx-auto px-4 md:px-6">
        <div className="mx-auto max-w-4xl">
          <h2
            className={`mx-auto mb-4 max-w-2xl text-balance text-center text-2xl font-bold leading-tight text-gray-900 transition-all duration-700 ease-out md:text-3xl ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            Куратор ведёт вашу неделю
            <br />
            по понятному стандарту.
          </h2>
          <p
            className={`mx-auto mb-8 max-w-2xl text-center text-sm leading-relaxed text-gray-600 transition-all duration-700 ease-out md:mb-10 md:text-base ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            В основе ведения — опыт, понятный порядок разбора и время, чтобы вникнуть в вашу
            ситуацию.
          </p>

          <article
            className={`rounded-2xl border border-slate-200 bg-white px-5 py-1 transition-all duration-700 ease-out md:px-8 md:py-7 ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
            style={{ transitionDelay: '200ms' }}
          >
            <ol className="divide-y divide-slate-100 md:grid md:grid-cols-[0.85fr_1.3fr_0.95fr] md:divide-x md:divide-y-0">
              {trustPoints.map((point) => (
                <li
                  key={point.number}
                  className={`py-5 transition-all duration-500 ease-out first:pt-5 last:pb-5 md:px-6 md:py-0 md:first:py-0 md:first:pl-0 md:last:py-0 md:last:pr-0 ${
                    isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                  }`}
                  style={{ transitionDelay: `${point.delay}ms` }}
                >
                  <div className="flex items-baseline gap-3">
                    <span
                      className="flex-shrink-0 text-xs font-bold tracking-[0.14em] text-[#1D70B7]"
                      aria-hidden="true"
                    >
                      {point.number}
                    </span>
                    <h3 className="text-base font-semibold leading-snug text-gray-900 md:text-lg">
                      {point.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600 md:text-[15px]">
                    {point.text}
                  </p>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>
    </section>
  );
}
