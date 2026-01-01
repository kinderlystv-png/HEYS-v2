// HeroSSR.tsx — Server Component версия Hero
// Контент рендерится на сервере и виден в HTML без JavaScript

'use client'

import Image from 'next/image'
import { useState, useEffect } from 'react'

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

export default function HeroSSR({ content }: HeroSSRProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Trigger animations after mount
  useEffect(() => {
    // Small delay for smoother animation start
    const timer = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section className="relative h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-white" aria-hidden="true" />

      {/* Header */}
      <header className={`relative w-full transition-all duration-700 ease-out ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}>
        <div className="mx-auto w-full max-w-[1024px] px-6 py-4 flex items-center justify-between">
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

          {/* Desktop nav */}
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

          {/* Mobile menu button — минималистичный premium стиль */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#f3f4f6] transition-colors focus:outline-none focus:ring-2 focus:ring-[#111827]/10"
            aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={menuOpen}
          >
            <div className="relative w-5 h-4 flex flex-col justify-between">
              <span 
                className={`block h-[1.5px] w-full bg-[#374151] rounded-full transition-all duration-300 origin-center ${
                  menuOpen ? 'rotate-45 translate-y-[7px]' : ''
                }`} 
              />
              <span 
                className={`block h-[1.5px] w-full bg-[#374151] rounded-full transition-all duration-200 ${
                  menuOpen ? 'opacity-0 scale-x-0' : ''
                }`} 
              />
              <span 
                className={`block h-[1.5px] w-full bg-[#374151] rounded-full transition-all duration-300 origin-center ${
                  menuOpen ? '-rotate-45 -translate-y-[7px]' : ''
                }`} 
              />
            </div>
          </button>
        </div>

        {/* Mobile menu overlay */}
        <div 
          className={`md:hidden fixed inset-0 top-[72px] bg-white/95 backdrop-blur-xl z-50 transition-all duration-300 ${
            menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <nav className="flex flex-col items-center justify-center h-full gap-8 pb-20">
            {content.nav.links.map((link, index) => (
              <a
                key={link.id}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`text-[#374151] hover:text-[#111827] transition-all text-[18px] tracking-wide font-light transform ${
                  menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: menuOpen ? `${index * 50 + 100}ms` : '0ms' }}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#trial"
              onClick={() => setMenuOpen(false)}
              className={`mt-4 inline-flex items-center justify-center px-8 py-3 bg-[#111827] text-white/95 font-normal rounded-full transition-all text-[15px] tracking-wide transform ${
                menuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              }`}
              style={{ transitionDelay: menuOpen ? `${content.nav.links.length * 50 + 150}ms` : '0ms' }}
            >
              Начать бесплатно
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Content — First Screen: Logo + Phone + H1 + H2 */}
      <div className="relative w-full min-h-[calc(100vh-72px)] md:min-h-0 flex flex-col md:block">
        <div className="relative mx-auto w-full max-w-[1024px] px-6 pt-16 md:pt-20 pb-32 md:pb-0 flex flex-col md:block flex-1">
          
          {/* Mobile: Phone - adaptive size with animation */}
          <div className={`flex lg:hidden justify-center flex-1 items-center py-2 transition-all duration-700 ease-out ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`} style={{ transitionDelay: '200ms' }}>
            <div className="relative w-full max-w-[200px] sm:max-w-[240px]">
              <Image
                src="/phone3.jpg"
                alt="HEYS App Interface"
                width={240}
                height={480}
                priority
                className="w-full h-auto object-contain drop-shadow-xl"
                style={{ maxHeight: 'calc(100vh - 400px)' }}
              />
            </div>
          </div>

          {/* H1 — Main headline with animation */}
          <h1 className={`text-[26px] sm:text-[28px] md:text-[36px] lg:text-[40px] font-light text-[#374151] mb-3 md:mb-8 leading-[1.15] text-center lg:text-left transition-all duration-700 ease-out ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`} style={{ transitionDelay: '500ms' }}>
            <span className="text-[#111827] font-semibold">
              HEYS — для тех, кто хочет управлять<br className="hidden sm:inline" /> своей жизнью.
            </span>
          </h1>

          {/* H2 — Subheadline with animation (visible on first screen for mobile too) */}
          <h2 className={`lg:hidden text-[13px] sm:text-[14px] text-[#374151] font-normal mb-6 leading-[1.5] text-center transition-all duration-700 ease-out ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`} style={{ transitionDelay: '1000ms' }}>
            Вы управляете решениями. Мы держим процесс.<br /> За счет системы, а не силы воли:<br />
            <span className="text-[#111827] font-semibold">контекст → решения → поддержка → контроль.</span>
          </h2>

        </div>
      </div>

      {/* Scroll cue — fixed at bottom of viewport (Mobile: 3000ms delay) */}
      <div className={`lg:hidden pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 z-20 transition-all duration-700 ease-out ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`} style={{ transitionDelay: '3000ms' }}>
        <a
          href="#what-is-heys"
          aria-label="Прокрутить вниз"
          className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#111827]/15 bg-white/80 text-[#111827] shadow-sm backdrop-blur-sm transition-all hover:translate-y-[2px] hover:border-[#111827]/25 hover:bg-white hover:shadow-md active:scale-95"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 5v12m0 0 6-6m-6 6-6-6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>

      {/* Scroll cue — fixed at bottom of viewport (Desktop: 5000ms delay) */}
      <div className={`hidden lg:block pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 z-20 transition-all duration-700 ease-out ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`} style={{ transitionDelay: '5000ms' }}>
        <a
          href="#what-is-heys"
          aria-label="Прокрутить вниз"
          className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#111827]/15 bg-white/80 text-[#111827] shadow-sm backdrop-blur-sm transition-all hover:translate-y-[2px] hover:border-[#111827]/25 hover:bg-white hover:shadow-md active:scale-95"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 5v12m0 0 6-6m-6 6-6-6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>

      {/* Hero Content — Second part (scrollable on mobile) */}
      <div className="relative w-full bg-white">
        <div className="mx-auto w-full max-w-[1024px] px-6 pb-16 md:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-0 items-start">
            
            {/* Left Column — Text Content */}
            <div className="text-center lg:text-left">
              {/* H2 — Subheadline (с переносом строки если есть \n) */}
              <h2 className={`text-[14px] md:text-[17px] text-[#374151] font-normal mb-5 md:mb-6 leading-[1.5] hidden lg:block transition-all duration-700 ease-out ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`} style={{ transitionDelay: '1000ms' }}>
                Вы управляете решениями. Мы держим процесс. За счет системы, а не силы воли:<br />
                <span className="text-[#111827] font-semibold">контекст → решения → поддержка → контроль.</span>
              </h2>

              {/* H3 — Features (если есть) */}
              {content.hero.features && content.hero.features.length > 0 && (
                <div className={`space-y-3 mb-16 md:mb-20 transition-all duration-700 ease-out ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`} style={{ transitionDelay: '1000ms' }}>
                  {content.hero.features.map((feature, i) => (
                    <p key={i} className="text-[14px] md:text-[15px] text-[#4b5563] font-normal leading-[1.6]" dangerouslySetInnerHTML={{ __html: feature }} />
                  ))}
                </div>
              )}

              {/* Two CTA buttons */}
              <div className={`flex flex-col sm:flex-row gap-4 mb-3 transition-all duration-700 ease-out ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`} style={{ transitionDelay: '4000ms' }}>
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
                <p className={`text-[13px] text-[#4b5563] mb-5 leading-[1.5] transition-all duration-700 ease-out ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`} style={{ transitionDelay: '4000ms' }}>
                  {content.hero.frictionNote}
                </p>
              )}

              {/* Microtext */}
              <div className={`space-y-1 transition-all duration-700 ease-out ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`} style={{ transitionDelay: '4000ms' }}>
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
            <div className={`hidden lg:flex justify-center items-center transition-all duration-700 ease-out ${
              mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'
            }`} style={{ transitionDelay: '2500ms' }}>
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
    </section>
  )
}
