// Chapter.tsx — полноэкранная глава версии B (`маркетинг/47`).
//
// Ритм «один экран — одна мысль»: глава занимает высоту экрана, несёт одну
// крупную фразу тем же фирменным шрифтом, что типографские отбивки hero-демо,
// и один носитель смысла под ней — сцену, артефакт или знакомство.

import { Playfair_Display } from 'next/font/google';

// Тот же шрифт, что в отбивках демо (`HeroFlowDemo`): главы продолжают их
// визуальный язык. next/font self-host'ит файлы на сборке — внешних
// CDN-запросов в runtime нет.
const chapterFont = Playfair_Display({
  subsets: ['cyrillic', 'latin'],
  weight: '500',
  display: 'swap',
});

interface ChapterProps {
  id: string;
  /** Порядковая подпись, например «Глава 1». */
  kicker: string;
  /** Одна крупная фраза — мысль главы. */
  phrase: string;
  /** Короткое пояснение под фразой. */
  lead?: string;
  children?: React.ReactNode;
  tone?: 'light' | 'shaded';
}

export default function Chapter({
  id,
  kicker,
  phrase,
  lead,
  children,
  tone = 'light',
}: ChapterProps) {
  return (
    <section
      id={id}
      className={`flex min-h-[100svh] items-center px-5 py-16 sm:px-8 ${
        tone === 'shaded' ? 'bg-slate-50' : 'bg-white'
      }`}
    >
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          {kicker}
        </p>
        <h2
          className={`${chapterFont.className} mt-4 text-[34px] leading-[1.15] text-slate-900 sm:text-5xl sm:leading-[1.12]`}
        >
          {phrase}
        </h2>
        {lead ? <p className="mt-5 max-w-xl text-[16px] leading-7 text-slate-600">{lead}</p> : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}
