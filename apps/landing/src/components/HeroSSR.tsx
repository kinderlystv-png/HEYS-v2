// HeroSSR.tsx — Server Component версия Hero
// Контент рендерится на сервере и виден в HTML без JavaScript

import Image from 'next/image'

import { LandingVariant, VariantContent } from '@/config/landing-variants'

interface HeroSSRProps {
  content: VariantContent
  variant: LandingVariant
}

export default function HeroSSR({ content, variant }: HeroSSRProps) {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#e9f1f6]" aria-hidden="true" />

      {/* Header */}
      <header className="relative w-full">
        <div className="mx-auto w-full max-w-[1000px] px-10 xl:px-12 py-10 flex items-center justify-between">
          <div className="flex items-center">
            <Image
              src="/logo.png"
              alt="HEYS"
              width={96}
              height={64}
              priority
              className="w-[96px]"
              style={{ height: 'auto' }}
            />
            {/* Variant badge для отладки */}
            <span className="ml-4 px-2 py-1 text-xs font-mono bg-blue-100 text-blue-800 rounded">
              Variant {variant}
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-12">
            {content.nav.links.map((link) => (
              <a
                key={link.id}
                href={link.href}
                className="text-[#374151] hover:text-[#111827] transition-colors text-[14px] tracking-wide"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero Content */}
      <div className="relative w-full">
        <div className="mx-auto w-full max-w-[1000px] px-10 xl:px-12 pt-16 md:pt-24 pb-16">
          <div className="max-w-[860px]">
            {/* Main headline — SSR, контент в HTML */}
            <h1 className="text-[36px] md:text-[46px] font-light text-[#374151] mb-8 leading-[1.15]">
              <span className="text-[#1d4ed8] font-semibold">HEYS</span>
              {' — '}
              <span className="text-[#111827] font-semibold">{content.hero.headline}</span>
            </h1>
          
            {/* Subheadline — SSR, с переносами строк */}
            <p className="text-[17px] md:text-[19px] text-[#374151] mb-10 max-w-[780px] leading-[1.55]">
              {content.hero.subheadline.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < content.hero.subheadline.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>

            {/* Two CTA buttons — SSR */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              {/* Primary CTA */}
              <a
                href="#pricing"
                className="inline-flex items-center justify-center px-8 py-4 bg-[#1d4ed8] text-white font-medium rounded-xl hover:bg-[#1e40af] transition-colors text-[16px] shadow-lg shadow-blue-500/20"
              >
                {content.hero.ctaPrimary}
              </a>

              {/* Secondary CTA */}
              <a
                href="#trial"
                className="inline-flex items-center justify-center px-8 py-4 bg-white/80 text-[#111827] font-medium rounded-xl border border-[#111827]/20 hover:bg-white hover:border-[#111827]/30 transition-colors text-[16px] backdrop-blur-sm"
              >
                {content.hero.ctaSecondary}
              </a>
            </div>

            {/* Microtext — SSR */}
            <p className="text-[13px] text-[#6b7280] max-w-[600px] leading-[1.5]">
              {content.hero.microtext}
            </p>
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
