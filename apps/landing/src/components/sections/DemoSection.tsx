// DemoSection.tsx — Интерактивный демо HEYS внутри iPhone-рамки.
// Anchor: #demo
// Lazy-loaded iframe on https://try.heyslab.ru/?gender=…&defaultTab=widgets
// (subdomain to avoid Safari ITP).

'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import GenderSelectModal from '../modals/GenderSelectModal'

const DEMO_BASE_URL =
    process.env.NEXT_PUBLIC_DEMO_BASE_URL || 'https://try.heyslab.ru'

// Native iPhone 15 viewport so HEYS renders at PWA-like dimensions inside iframe.
const NATIVE_W = 393
const NATIVE_H = 852

function buildDemoSrc(gender: 'male' | 'female') {
    const params = new URLSearchParams({
        gender,
        embed: 'landing-demo',
        default_ts: '1',
        hideWhatsNew: '1',
        defaultTab: 'widgets',
        tab: 'widgets',
        view: 'widgets',
    })
    return `${DEMO_BASE_URL}/?${params.toString()}`
}

export default function DemoSection() {
    const [isVisible, setIsVisible] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    const [gender, setGender] = useState<'male' | 'female' | null>(null)
    const [mounted, setMounted] = useState(false)
    const [scale, setScale] = useState(1)
    const [isMobile, setIsMobile] = useState(false)
    const sectionRef = useRef<HTMLElement>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        const mql = window.matchMedia('(max-width: 639px)')
        const update = () => setIsMobile(mql.matches)
        update()
        mql.addEventListener('change', update)
        return () => mql.removeEventListener('change', update)
    }, [])

    // External trigger: Hero CTA dispatches 'heys:open-demo' to skip the
    // scroll-to-section + click-on-preview steps and jump straight to the gender modal.
    useEffect(() => {
        const handler = () => setModalOpen(true)
        window.addEventListener('heys:open-demo', handler)
        return () => window.removeEventListener('heys:open-demo', handler)
    }, [])

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.disconnect()
                }
            },
            { threshold: 0.1 }
        )
        if (sectionRef.current) observer.observe(sectionRef.current)
        return () => observer.disconnect()
    }, [])

    const inDemo = !!gender

    useEffect(() => {
        if (inDemo) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        window.dispatchEvent(
            new CustomEvent('heys:demo-toggle', { detail: { open: inDemo } })
        )
        return () => {
            document.body.style.overflow = ''
        }
    }, [inDemo])

    useEffect(() => {
        if (!inDemo) return
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setGender(null)
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [inDemo])

    // Compute scale so the 393×852 iframe + 20px border + actions row fit the viewport.
    // Desktop only — on mobile the iframe is fullscreen without a frame.
    useEffect(() => {
        if (!inDemo || isMobile) return
        const compute = () => {
            const vw = window.innerWidth
            const vh = window.innerHeight
            // Reserve space: 24px horizontal padding, 80px vertical (actions row + gap + padding).
            const availW = Math.max(280, vw - 32)
            const availH = Math.max(400, vh - 100)
            // 20px = border-[10px] on each side of the iPhone frame.
            const scaleW = availW / (NATIVE_W + 20)
            const scaleH = availH / (NATIVE_H + 20)
            setScale(Math.min(scaleW, scaleH, 1))
        }
        compute()
        window.addEventListener('resize', compute)
        return () => window.removeEventListener('resize', compute)
    }, [inDemo, isMobile])

    const iframeSrc = gender ? buildDemoSrc(gender) : null

    // Visual outer box size (scaled). Layout uses these dimensions so flex centers correctly.
    const outerW = (NATIVE_W + 20) * scale
    const outerH = (NATIVE_H + 20) * scale

    const overlay =
        inDemo && mounted
            ? createPortal(
                  <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex flex-col">
                      {/* Viewport area — fills available space above the action bar */}
                      <div className="flex-1 min-h-0 flex items-center justify-center sm:p-4">
                          {isMobile ? (
                              // Mobile: fullscreen iframe, no frame
                              iframeSrc && (
                                  <iframe
                                      src={iframeSrc}
                                      title="HEYS Demo"
                                      // SEC-012 (2026-06-08): `allow-same-origin + allow-scripts` в одном
                                      // sandbox'е — классический escape-паттерн ТОЛЬКО когда iframe-src ===
                                      // parent-origin. У нас parent=heyslab.ru, src=try.heyslab.ru
                                      // (DEMO_BASE_URL) → cross-origin; iframe не может обратиться к
                                      // parent.window независимо от sandbox-настроек. Защита держится на
                                      // инварианте `DEMO_BASE_URL !== window.location.host`. Если поменяешь
                                      // DEMO_BASE_URL на same-host — снять `allow-same-origin`.
                                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                                      className="w-full h-full bg-white border-0"
                                  />
                              )
                          ) : (
                              // Desktop: iPhone frame with scale
                              <div
                                  className="relative"
                                  style={{ width: outerW, height: outerH }}
                              >
                                  <div
                                      className="absolute top-0 left-0 rounded-[44px] border-[10px] border-black bg-black shadow-2xl overflow-hidden"
                                      style={{
                                          width: NATIVE_W + 20,
                                          height: NATIVE_H + 20,
                                          transform: `scale(${scale})`,
                                          transformOrigin: 'top left',
                                      }}
                                  >
                                      {/* Dynamic island */}
                                      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-10" />
                                      {iframeSrc && (
                                          <iframe
                                              src={iframeSrc}
                                              title="HEYS Demo"
                                              // SEC-012 (2026-06-08): `allow-same-origin + allow-scripts` в одном
                                      // sandbox'е — классический escape-паттерн ТОЛЬКО когда iframe-src ===
                                      // parent-origin. У нас parent=heyslab.ru, src=try.heyslab.ru
                                      // (DEMO_BASE_URL) → cross-origin; iframe не может обратиться к
                                      // parent.window независимо от sandbox-настроек. Защита держится на
                                      // инварианте `DEMO_BASE_URL !== window.location.host`. Если поменяешь
                                      // DEMO_BASE_URL на same-host — снять `allow-same-origin`.
                                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                                              className="absolute inset-0 bg-white border-0"
                                              style={{
                                                  width: NATIVE_W,
                                                  height: NATIVE_H,
                                              }}
                                          />
                                      )}
                                  </div>
                              </div>
                          )}
                      </div>

                      {/* Bottom action bar — Trial CTA + close X */}
                      <div className="flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 shrink-0 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)] border-t border-gray-100">
                          <a
                              href="#trial"
                              onClick={() => setGender(null)}
                              className="inline-flex flex-col items-center justify-center px-5 py-2.5 sm:px-6 sm:py-3 bg-[#1D70B7] text-white rounded-2xl hover:bg-[#185F9D] active:scale-95 transition-all tracking-wide shadow-[0_10px_22px_rgba(29,112,183,0.18)] whitespace-nowrap leading-tight"
                          >
                              <span className="font-semibold text-[13px] sm:text-[15px]">
                                  Оставить заявку на неделю Pro
                              </span>
                              <span className="text-[10px] sm:text-[11px] opacity-80 mt-0.5">
                                  0 ₽ · без карты
                              </span>
                          </a>
                          <button
                              type="button"
                              onClick={() => setGender(null)}
                              className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-2xl shadow-sm active:scale-95 transition-all shrink-0"
                              aria-label="Закрыть приложение"
                          >
                              <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                              >
                                  <path
                                      d="M6 6l12 12M18 6L6 18"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                  />
                              </svg>
                          </button>
                      </div>
                  </div>,
                  document.body
              )
            : null

    return (
        <>
            <section
                ref={sectionRef}
                id="demo"
                className="relative py-12 sm:py-16 lg:py-20"
                style={{
                    background:
                        'linear-gradient(180deg, #FFFFFF 0%, #FFF8EA 18%, #FBEFE6 42%, #FCFBF9 76%, #FFFFFF 100%)',
                }}
            >
                <div className="mx-auto w-full max-w-[1024px] px-4 md:px-6">
                    {/* Header */}
                    <div
                        className={`text-center mb-8 sm:mb-10 transition-all duration-700 ease-out ${
                            isVisible
                                ? 'opacity-100 translate-y-0'
                                : 'opacity-0 translate-y-6'
                        }`}
                    >
                        <h2 className="text-[24px] sm:text-[28px] md:text-[34px] font-semibold text-[#111827] mb-3 leading-[1.2]">
                            Так выглядит ваша картина
                        </h2>
                        <p className="text-[14px] sm:text-[15px] text-[#6b7280] max-w-xl mx-auto leading-relaxed">
                            Демо открывается с виджетов: не экран ввода, а зеркало того,
                            что куратор уже внёс в дневник.
                        </p>
                    </div>

                    {/* Preview frame (iPhone 14/15 proportions) */}
                    <div
                        className={`flex justify-center transition-all duration-700 ease-out ${
                            isVisible
                                ? 'opacity-100 translate-y-0'
                                : 'opacity-0 translate-y-12'
                        }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        {/* Desktop preview frame — iPhone 14/15-like */}
                        <div className="hidden md:block relative w-[420px] aspect-[9/19.5] rounded-[44px] border-[10px] border-black bg-black shadow-2xl overflow-hidden">
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-10" />
                            <PreviewButton
                                onClick={() => setModalOpen(true)}
                            />
                        </div>

                        {/* Mobile preview frame — fits 9/19.5 aspect on phones.
                            Width clamped so the mockup height (via aspect-ratio)
                            never exceeds visible viewport minus header — иначе
                            на узких/коротких экранах (URL-бар + любой webview)
                            нижняя половина mockup'а с CTA уезжает за обрез. */}
                        <div className="md:hidden relative mx-auto aspect-[9/19.5] w-[min(430px,calc(100vw-32px),calc((100dvh-220px)*9/19.5))] rounded-[32px] border-[6px] border-black bg-black shadow-2xl overflow-hidden">
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-black rounded-full z-10" />
                            <PreviewButton
                                onClick={() => setModalOpen(true)}
                            />
                        </div>
                    </div>
                </div>

                <GenderSelectModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onSelect={(g) => setGender(g)}
                />
            </section>

            {overlay}
        </>
    )
}

function PreviewButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#8EBFE0] via-[#D8ECF8] to-[#FAE5D5] cursor-pointer group"
            aria-label="Открыть интерактивное приложение HEYS"
        >
            <div className="w-20 h-20 rounded-full bg-white/80 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M8 5v14l11-7z" fill="#111827" />
                </svg>
            </div>
            <div className="text-center px-4">
                <div className="text-[15px] font-semibold text-[#111827] mb-1">
                    Посмотреть пример
                </div>
                <div className="text-[12px] text-[#374151]/80">
                    начнём со сводки
                </div>
            </div>
        </button>
    )
}
