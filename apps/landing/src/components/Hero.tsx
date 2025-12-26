'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useVariant } from '@/context/VariantContext'

export default function Hero() {
  const { content } = useVariant()
  const heroRef = useRef<HTMLElement | null>(null)

  // initial: стандартное состояние (пульс мягкий)
  // hint: пользователь чуть скроллнул (пульс/контраст сильнее, но без автоскролла)
  // hidden: пользователь уже скроллит дальше / hero не в viewport — стрелку прячем
  const [cueMode, setCueMode] = useState<'initial' | 'hint' | 'hidden'>('initial')

  useEffect(() => {
    let raf = 0
    const HINT_PX = 60
    const MIN_SCROLL_PX = 6

    const updateFromScroll = () => {
      raf = 0
      const y =
        window.scrollY ||
        window.pageYOffset ||
        document.documentElement?.scrollTop ||
        0

      const nextMode: typeof cueMode =
        y <= MIN_SCROLL_PX ? 'initial' : y < HINT_PX ? 'hint' : 'hidden'

      setCueMode((prev) => (prev === nextMode ? prev : nextMode))
    }

    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(updateFromScroll)
    }

    // Инициализация на случай, если страница открыта не в самом верху.
    updateFromScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Как только hero перестал быть заметным — прячем стрелку,
        // чтобы она не спорила со скроллом.
        if (!entry.isIntersecting) {
          setCueMode('hidden')
        }
      },
      {
        // Считаем hero "видимым", пока хотя бы ~15% экрана занято hero.
        threshold: 0.15,
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const cueWrapClassName = useMemo(() => {
    const base =
      'pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 transition-opacity duration-300'
    if (cueMode === 'hidden') {
      return `${base} opacity-0 pointer-events-none`
    }
    return `${base} opacity-100`
  }, [cueMode])

  const cueButtonClassName = useMemo(() => {
    const base =
      'hero-anim-rise [--hero-delay:1.05s] hero-scroll-cue pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border bg-white/60 text-[#111827] shadow-sm backdrop-blur transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]/40'

    if (cueMode === 'hint') {
      return `${base} hero-scroll-cue--hint border-[#111827]/30 bg-white/75 shadow-md hover:translate-y-[1px] hover:bg-white/80`
    }

    return `${base} border-[#111827]/20 hover:translate-y-[1px] hover:border-[#111827]/30 hover:bg-white/70`
  }, [cueMode])

  return (
    <section ref={heroRef} className="relative min-h-screen overflow-hidden">
      {/* Background: fade-in first */}
      <div className="hero-anim-bg absolute inset-0 bg-[#e9f1f6]" aria-hidden="true" />

      {/* Header */}
      <header className="hero-anim-fade [--hero-delay:0.25s] relative w-full">
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
            {/* Main headline — dynamic from variant */}
            <h1 className="hero-anim-rise [--hero-delay:0.45s] text-[36px] md:text-[46px] font-light text-[#374151] mb-8 leading-[1.15]">
              <span className="text-[#1d4ed8] font-semibold">HEYS</span>
              {' — '}
              <span className="text-[#111827] font-semibold">{content.hero.headline}</span>
            </h1>
          
            {/* Subheadline — dynamic, with line breaks */}
            <p className="hero-anim-rise [--hero-delay:0.65s] text-[17px] md:text-[19px] text-[#374151] mb-10 max-w-[780px] leading-[1.55]">
              {content.hero.subheadline.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < content.hero.subheadline.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>

            {/* Two CTA buttons */}
            <div className="hero-anim-rise [--hero-delay:0.8s] flex flex-col sm:flex-row gap-4 mb-6">
              {/* Primary CTA — Выбрать тариф */}
              <a
                href="#pricing"
                className="inline-flex items-center justify-center px-8 py-4 bg-[#1d4ed8] text-white font-medium rounded-xl hover:bg-[#1e40af] transition-colors text-[16px] shadow-lg shadow-blue-500/20"
              >
                {content.hero.ctaPrimary}
              </a>

              {/* Secondary CTA — Неделя старта */}
              <a
                href="#trial"
                className="inline-flex items-center justify-center px-8 py-4 bg-white/80 text-[#111827] font-medium rounded-xl border border-[#111827]/20 hover:bg-white hover:border-[#111827]/30 transition-colors text-[16px] backdrop-blur-sm"
              >
                {content.hero.ctaSecondary}
              </a>
            </div>

            {/* Microtext */}
            <p className="hero-anim-rise [--hero-delay:0.9s] text-[13px] text-[#6b7280] max-w-[600px] leading-[1.5]">
              {content.hero.microtext}
            </p>
          </div>
        </div>
      </div>

      {/* Scroll cue (appears last): arrow in a circle */}
      <div className={cueWrapClassName}>
        <a
          href="#what-is-heys"
          aria-label="Прокрутить вниз"
          className={cueButtonClassName}
          onClick={() => {
            // Чтобы стрелка не спорила со smooth-scroll (и не "доезжала" поверх следующей секции)
            // прячем её сразу при клике.
            setCueMode('hidden')
          }}
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
