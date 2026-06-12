'use client';

type HeroFlowDemoProps = {
  compact?: boolean;
};

const flowFrames = [
  {
    src: '/hero-real-messenger.webp',
    alt: 'Сообщение куратору в приложении HEYS',
  },
  {
    src: '/hero-real-diary.webp',
    alt: 'Дневник питания с внесённым завтраком',
  },
  {
    src: '/hero-real-widgets.webp',
    alt: 'Виджеты HEYS после обновления дневника',
  },
  {
    src: '/hero-real-advice.webp',
    alt: 'Один совет в приложении HEYS',
  },
];

export default function HeroFlowDemo({ compact = false }: HeroFlowDemoProps) {
  return (
    <div
      className={[
        'hero-flow-demo relative mx-auto aspect-[9/19.5] w-full overflow-hidden border-[#111827] bg-white shadow-2xl shadow-[#1e3a8a]/20',
        compact
          ? 'max-w-[230px] rounded-[30px] border-[4px]'
          : 'max-w-[345px] rounded-[38px] border-[6px]',
      ].join(' ')}
      aria-label="Как HEYS показывает работу Pro в приложении"
    >
      <div
        className={[
          'absolute left-1/2 z-30 -translate-x-1/2 rounded-full bg-[#111827]',
          compact ? 'top-2 h-4 w-20' : 'top-3 h-5 w-24',
        ].join(' ')}
      />

      <div
        className={[
          'hero-flow-screen absolute inset-x-0 bottom-0 overflow-hidden bg-white',
          compact ? 'top-7' : 'top-9',
        ].join(' ')}
      >
        {flowFrames.map((frame, index) => (
          <img
            key={frame.src}
            src={frame.src}
            alt={frame.alt}
            className="hero-flow-frame absolute inset-0 h-full w-full object-cover object-top"
            style={{ animationDelay: `${index * 4}s` }}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ))}
      </div>
    </div>
  );
}
