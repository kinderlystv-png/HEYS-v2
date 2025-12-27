// HeroSSR.tsx — Server Component версия Hero
// Контент рендерится на сервере и виден в HTML без JavaScript

import Image from 'next/image'

import { LandingVariant, VariantContent } from '@/config/landing-variants'

interface HeroSSRProps {
  content: VariantContent
  variant: LandingVariant
}

// Время сборки (фиксируется при старте сервера / компиляции)
const BUILD_TIME = new Date().toLocaleString('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Moscow'
})

export default function HeroSSR({ content, _variant }: HeroSSRProps) {
  return (
    <section className="relative h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-white" aria-hidden="true" />

      {/* Header */}
      <header className="relative w-full">
        <div className="mx-auto w-full max-w-[1024px] px-6 py-6 flex items-center justify-between">
          <div className="flex items-center">
            <Image
              src="/logo.png"
              alt="HEYS"
              width={80}
              height={53}
              priority
              className="w-[80px]"
              style={{ height: 'auto' }}
            />
          </div>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {content.nav.links.map((link) => (
              <a
                key={link.id}
                href={link.href}
                className="text-[#374151] hover:text-[#111827] transition-colors text-[13px] tracking-wide"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero Content — Two Column Layout */}
      <div className="relative w-full">
        <div className="mx-auto w-full max-w-[1024px] px-6 pt-6 md:pt-8 pb-24">
          
          {/* H1 — Main headline (outside grid, full width) */}
          <h1 className="text-[28px] md:text-[36px] lg:text-[40px] font-light text-[#374151] mb-8 leading-[1.15]">
            <span className="text-[#111827] font-semibold">
              HEYS — для тех, кто хочет управлять<br />своей жизнью.
            </span>
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-0 items-start">
            
            {/* Left Column — Text Content */}
            <div>
              {/* H2 — Subheadline (с переносом строки если есть \n) */}
              <h2 className="text-[15px] md:text-[17px] text-[#374151] font-normal mb-6 leading-[1.5]">
                Вы управляете решениями. Мы держим процесс.<br />
                Не за счёт силы воли, а за счёт системы:<br />
                <span className="text-[#111827] font-semibold">контекст → решения → поддержка → контроль.</span>
              </h2>

              {/* H3 — Features (если есть) */}
              {content.hero.features && content.hero.features.length > 0 && (
                <div className="space-y-3 mb-12">
                  {content.hero.features.map((feature, i) => (
                    <p key={i} className="text-[14px] md:text-[15px] text-[#4b5563] font-normal leading-[1.6]" dangerouslySetInnerHTML={{ __html: feature }} />
                  ))}
                </div>
              )}

              {/* Two CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-4 mb-3">
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center px-6 py-2.5 bg-[#4b5563] text-white/90 font-normal rounded-full hover:bg-[#374151] transition-all text-[14px] tracking-wide"
                >
                  {content.hero.ctaPrimary}
                </a>

                <a
                  href="#trial"
                  className="inline-flex items-center justify-center px-6 py-2.5 bg-white/40 text-[#4b5563] font-normal rounded-full border border-[#9ca3af]/30 hover:bg-white/60 hover:border-[#9ca3af]/50 transition-all text-[14px] tracking-wide backdrop-blur-sm"
                >
                  {content.hero.ctaSecondary}
                </a>
              </div>

              {/* Friction reduction note */}
              {content.hero.frictionNote && (
                <p className="text-[13px] text-[#4b5563] mb-5 leading-[1.5]">
                  {content.hero.frictionNote}
                </p>
              )}

              {/* Microtext */}
              <div className="space-y-1">
                <p className="text-[12px] text-[#6b7280] leading-[1.5]">
                  {content.hero.microtext}
                </p>
                {content.hero.microtextLine2 && (
                  <p className="text-[12px] text-[#6b7280] leading-[1.5] flex items-center gap-2">
                    <span>{content.hero.microtextLine2}</span>
                    <span suppressHydrationWarning className="text-[10px] font-mono text-[#9ca3af]">v{BUILD_TIME}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Right Column — iPhone Screenshot */}
            <div className="hidden lg:flex justify-center items-center">
              <div className="relative w-full max-w-[180px]">
                <Image
                  src="/phone3.jpg"
                  alt="HEYS App Interface"
                  width={180}
                  height={360}
                  priority
                  className="w-full h-auto object-contain drop-shadow-2xl"
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Scroll cue */}
      <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2">
        <a
          href="#what-is-heys"
          aria-label="Прокрутить вниз"
          className="pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#111827]/20 bg-white/60 text-[#111827] shadow-sm backdrop-blur transition-all hover:translate-y-[1px] hover:border-[#111827]/30 hover:bg-white/70"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 5v12m0 0 6-6m-6 6-6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>
    </section>
  )
}
