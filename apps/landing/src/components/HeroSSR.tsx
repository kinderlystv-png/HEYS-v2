// HeroSSR.tsx — Server Component версия Hero
// Контент рендерится на сервере и виден в HTML без JavaScript

'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import logoHeroBlue from '../assets/logo-hero-blue.png';

import HeroFlowDemo from './HeroFlowDemo';

import { LandingVariant, VariantContent } from '@/config/landing-variants';

interface HeroSSRProps {
  content: VariantContent;
  variant: LandingVariant;
}

export default function HeroSSR({ content }: HeroSSRProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Mobile fit-to-height: if the content would overflow the available slot
  // (short browser tab / large system font), scale the whole block down so it
  // never needs scroll; spare height stays around the whole block instead of
  // stretching the gaps between individual elements.
  const fitSlotRef = useRef<HTMLDivElement | null>(null); // flex slot (available height)
  const fitContentRef = useRef<HTMLDivElement | null>(null); // measured/scaled block
  const [contentScale, setContentScale] = useState(1);

  // Scale-only fit (mirrors stavropol-landing's report sheet): measure the
  // natural content height vs the slot the flex layout leaves for it, and
  // scale the whole block down if it would overflow. Never scales up — spare
  // height stays as comfortable air around the centred content. Scale-only is
  // deliberately one-directional: a two-way air-distributing variant
  // oscillated because the slot height "breathes" (dvh + cookie banner).
  const applyFit = useCallback(() => {
    const slot = fitSlotRef.current;
    const content = fitContentRef.current;
    if (!slot || !content) return;
    // Desktop (>= lg): native layout, never scale.
    if (window.matchMedia('(min-width: 1024px)').matches) {
      setContentScale((prev) => (prev === 1 ? prev : 1));
      return;
    }
    // offsetHeight ignores transform:scale, so it already is the natural height.
    const natural = content.offsetHeight;
    if (natural <= 0) return;
    const available = slot.clientHeight;
    // Small safety margin so we don't sit pixel-flush against the fold.
    const next = Math.min(1, Math.max(0.6, (available - 4) / natural));
    setContentScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
  }, []);

  useLayoutEffect(() => {
    applyFit();
    let raf = 0;
    const queue = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applyFit);
    };
    window.addEventListener('resize', queue);
    window.visualViewport?.addEventListener('resize', queue);
    // Observe only the slot (its height tracks the viewport). Observing the
    // content too would feedback-loop: applying air grows the content →
    // ResizeObserver fires → re-measure → oscillation. The slot's height is
    // independent of the air we inject, so it's the stable signal.
    const ro =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue);
    if (fitSlotRef.current) ro?.observe(fitSlotRef.current);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', queue);
      window.visualViewport?.removeEventListener('resize', queue);
      ro?.disconnect();
    };
  }, [applyFit]);

  // Re-fit once entry animations settle (heights shift as opacity/translate end).
  useEffect(() => {
    if (!mounted) return;
    const t = setTimeout(() => applyFit(), 850);
    return () => clearTimeout(t);
  }, [mounted, applyFit]);

  // Trigger animations after mount
  useEffect(() => {
    // Small delay for smoother animation start
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Hide scroll cue when user scrolls
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section className="hero-mobile-fit relative h-dvh overflow-hidden flex flex-col">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #8EBFE0 0%, #E2ECF2 46%, #FCFBF9 82%, #F3D7D7 100%)',
        }}
        aria-hidden="true"
      />
      <div className="hero-brand-plus-pattern absolute inset-0" aria-hidden="true" />

      {/* Header */}
      <header
        className={`relative w-full transition-all duration-700 ease-out ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="hero-mobile-header mx-auto w-full max-w-[1024px] py-4 pl-6 pr-4 md:px-6 flex items-center justify-between">
          <div className="flex items-center">
            <img src={logoHeroBlue.src} alt="HEYS" width={80} height={53} />
          </div>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
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
            className="lg:hidden relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#f3f4f6] transition-colors focus:outline-none focus:ring-2 focus:ring-[#111827]/10"
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
          className={`lg:hidden fixed inset-0 top-[72px] bg-white/95 backdrop-blur-xl z-50 transition-all duration-300 ${
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
          </nav>
        </div>
      </header>

      {/* Hero Content — unified grid: left=all text, right=phone.
          min-h-0 stops this flex-1 slot from growing under its content (the
          default min-height:auto), so clientHeight reports the *true*
          remaining height after the header — which the fit-scaler relies on. */}
      <div ref={fitSlotRef} className="relative flex w-full min-h-0 flex-1 items-center">
        <div
          ref={fitContentRef}
          className="hero-mobile-content mx-auto w-full max-w-[1024px] px-4 pb-4 pt-2 md:px-6 md:pb-24 md:pt-8"
          style={{
            transform:
              contentScale === 1
                ? 'translateY(var(--hero-mobile-content-shift-y, 0px))'
                : `translateY(var(--hero-mobile-content-shift-y, 0px)) scale(${contentScale})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          <div className="hero-mobile-grid grid grid-cols-1 items-center lg:grid-cols-[1fr_400px] lg:gap-14">
            {/* Mobile: Phone — above text, bleeds off right edge, bottom cropped */}
            <div
              className={`flex lg:hidden order-1 justify-center transition-all duration-700 ease-out ${
                mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
              style={{ transitionDelay: '200ms' }}
            >
              <div className="hero-mobile-phone relative w-[48%] max-w-[180px] sm:w-[44%]">
                <HeroFlowDemo compact />
              </div>
            </div>

            {/* Left Column — ALL text content */}
            <div className="order-2 text-center lg:order-1 lg:mt-10 lg:text-left">
              {/* H1 */}
              <h1
                className={`hero-mobile-title text-balance text-[26px] font-semibold leading-[1.15] text-[#111827] transition-all duration-700 ease-out sm:text-[28px] md:mb-8 md:text-[36px] lg:text-[42px] ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}
                style={{ transitionDelay: '400ms' }}
              >
                {content.hero.headline}
              </h1>

              {/* H2 */}
              <h2
                className={`hero-mobile-subtitle text-[14px] font-normal leading-[1.5] text-[#6b7280] transition-all duration-700 ease-out md:mb-12 md:text-[16px] md:leading-[1.6] ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}
                style={{ transitionDelay: '800ms' }}
              >
                <span className="md:hidden">
                  Фото, голосовое или короткое сообщение — этого достаточно.
                  Куратор вносит данные в приложение, оценивает всё в контексте вашей недели и делится своими рекомендациями.
                </span>
                <span className="hidden md:inline">
                  Фото, голосовое или короткое сообщение — этого достаточно.
                  <br />
                  Куратор вносит данные в приложение, оценивает всё в контексте вашей недели
                  и делится своими рекомендациями.
                </span>
              </h2>

              {/* CTA — first move is understanding the format, not forcing a form. */}
              <div
                className={`hero-mobile-actions flex flex-row flex-wrap items-center justify-center gap-x-6 gap-y-3 transition-all duration-700 ease-out lg:mb-4 lg:justify-start ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                }`}
                style={{ transitionDelay: '1200ms' }}
              >
                <a
                  href="#curator"
                  className="hero-mobile-primary inline-flex items-center justify-center gap-2 bg-[#1D70B7] px-6 py-3 text-white font-semibold rounded-2xl hover:bg-[#185F9D] active:scale-95 transition-all text-[14px] tracking-wide shadow-[0_10px_22px_rgba(29,112,183,0.18)]"
                >
                  {content.hero.ctaPrimary}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 12h14m-7-7 7 7-7 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
              {content.hero.microtext ? (
                <p
                  className={`hero-mobile-micro text-[12px] text-[#6b7280] transition-all duration-700 ease-out md:text-[13px] ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
                  }`}
                  style={{ transitionDelay: '1350ms' }}
                >
                  {content.hero.microtext}
                </p>
              ) : null}
            </div>

            {/* Right Column — Phone (desktop only) */}
            <div
              className={`hidden lg:flex order-2 justify-center items-center transition-all duration-700 ease-out ${
                mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-12'
              }`}
              style={{ transitionDelay: '600ms' }}
            >
              <div className="relative w-full max-w-[400px]">
                <HeroFlowDemo />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll cue — fixed at bottom of viewport (Desktop: 5000ms delay) */}
      <div
        className={`hidden lg:block pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 z-20 transition-all duration-700 ease-out ${
          mounted && !scrolled ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
        style={{ transitionDelay: scrolled ? '0ms' : '5000ms' }}
      >
        <a
          href="#curator"
          aria-label="Перейти к блоку «Как устроено»"
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
    </section>
  );
}
