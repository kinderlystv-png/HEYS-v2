'use client';

// NavD — навигация версии D: липкая шапка, бургер-оверлей и липкий CTA.
//
// Три поведения держим в одном компоненте, потому что они делят одно
// наблюдение за прокруткой и одно состояние меню: разнесённые по трём файлам,
// они завели бы три независимых слушателя scroll на одну и ту же страницу.
//
// Липкая шапка появляется только при движении ВВЕРХ и только после героя: при
// движении вниз человек читает, и панель поверх контента ему мешает.

import { useEffect, useRef } from 'react';

import { LogoD } from './LogoD';
import { D_CTA_HREF, D_CTA_LABEL, D_CTA_NOTE, D_NAV_LINKS } from './nav';

// Порог бургера (1180px) задан в разметке классом `min-[1181px]:` — держать
// его ещё и числом здесь означало бы две правды об одном брейкпоинте.
/** Выше этой ширины липкий CTA не нужен: действие видно в шапке. */
const STICKY_CTA_MAX_WIDTH = 860;

interface NavDProps {
  /** Меню открывается и из шапки, и из героя, поэтому состояние живёт выше. */
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
}

export default function NavD({ menuOpen, onOpenMenu, onCloseMenu }: NavDProps) {
  const headerRef = useRef<HTMLDivElement | null>(null);
  const stickyCtaRef = useRef<HTMLDivElement | null>(null);
  const lastScrollRef = useRef(0);
  const headerShownRef = useRef(false);

  // Прокрутка: и шапка, и липкий CTA обновляются императивно, через ref, а не
  // через состояние React — иначе каждый кадр прокрутки перерисовывал бы всю
  // навигацию.
  useEffect(() => {
    const applyScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollRef.current;
      lastScrollRef.current = y;

      const hero = document.getElementById('hero-d');
      const heroEnd = hero ? hero.offsetTop + hero.offsetHeight : window.innerHeight;

      const header = headerRef.current;
      if (header) {
        if (y <= heroEnd + 40) {
          headerShownRef.current = false;
        } else if (delta < -4) {
          headerShownRef.current = true;
        } else if (delta > 6) {
          headerShownRef.current = false;
        }
        header.style.transform = headerShownRef.current ? 'translateY(0)' : 'translateY(-100%)';
      }

      const sticky = stickyCtaRef.current;
      if (sticky) {
        const pain = document.getElementById('pain');
        const trial = document.getElementById('trial');
        const vh = window.innerHeight;
        const from = pain ? pain.offsetTop - vh * 0.5 : heroEnd;
        const to = trial ? trial.offsetTop - vh * 0.9 : Number.POSITIVE_INFINITY;
        const visible = window.innerWidth <= STICKY_CTA_MAX_WIDTH && y > from && y < to;
        sticky.style.transform = visible ? 'translateY(0)' : 'translateY(140%)';
        sticky.style.pointerEvents = visible ? 'auto' : 'none';
      }
    };

    applyScroll();
    window.addEventListener('scroll', applyScroll, { passive: true });
    window.addEventListener('resize', applyScroll);
    return () => {
      window.removeEventListener('scroll', applyScroll);
      window.removeEventListener('resize', applyScroll);
    };
  }, []);

  // Открытое меню блокирует прокрутку страницы под собой и закрывается по Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseMenu();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, onCloseMenu]);

  // Меню шире двух вьюпортов прыгает мгновенно: плавная прокрутка на такую
  // дистанцию занимает секунды, и переход из меню читается как зависание.
  const jumpTo = (href: string) => {
    onCloseMenu();
    const target = document.querySelector<HTMLElement>(href);
    if (!target) return;
    const distance = Math.abs(target.getBoundingClientRect().top);
    if (distance > window.innerHeight * 2) {
      const previous = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = 'auto';
      target.scrollIntoView();
      document.documentElement.style.scrollBehavior = previous;
      return;
    }
    target.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      {/* Липкая шапка после героя. */}
      <div
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-40 -translate-y-full border-b border-white/10 bg-[#0A1119]/95 backdrop-blur transition-transform duration-[350ms] ease-out"
      >
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-6 px-5 py-3.5 sm:px-9">
          <a href="#hero-d" aria-label="HEYS — наверх">
            <LogoD size={18} />
          </a>

          <nav className="hidden items-center gap-6 min-[1181px]:flex">
            {D_NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  jumpTo(link.href);
                }}
                className="whitespace-nowrap text-[13px] text-white/72 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={D_CTA_HREF}
              className="whitespace-nowrap rounded-full border border-white/32 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              {D_CTA_LABEL}
            </a>
            <button
              type="button"
              aria-label="Открыть меню"
              aria-expanded={menuOpen}
              onClick={onOpenMenu}
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1.5 min-[1181px]:hidden"
            >
              <span aria-hidden="true" className="block h-0.5 w-5 bg-white" />
              <span aria-hidden="true" className="block h-0.5 w-5 bg-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Липкий CTA — только на узких экранах и только между узнаванием и формой. */}
      <div
        ref={stickyCtaRef}
        className="fixed inset-x-0 bottom-0 z-30 translate-y-[140%] bg-gradient-to-t from-[#0A1119] via-[#0A1119]/95 to-transparent px-5 pb-5 pt-8 transition-transform duration-300 ease-out"
        style={{ pointerEvents: 'none' }}
      >
        <a
          href={D_CTA_HREF}
          className="flex w-full items-center justify-center rounded-[16px] bg-white px-6 py-4 text-[15px] font-semibold text-[#12283E] shadow-[0_14px_34px_rgba(10,17,25,0.4)]"
        >
          {D_CTA_LABEL} →
        </a>
        <p className="mt-2 text-center text-[12px] text-white/55">{D_CTA_NOTE}</p>
      </div>

      {/* Бургер-оверлей. */}
      {menuOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,#12263B_0%,#0C1826_55%,#0A1119_100%)] px-5 py-6 sm:px-9"
          role="dialog"
          aria-modal="true"
          aria-label="Меню"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
            <div className="flex items-center justify-between">
              <LogoD size={20} />
              <button
                type="button"
                aria-label="Закрыть меню"
                onClick={onCloseMenu}
                className="flex h-11 w-11 items-center justify-center text-[22px] text-white"
              >
                ✕
              </button>
            </div>

            <p className="mt-16 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Разделы
            </p>

            <nav className="mt-4">
              {D_NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    jumpTo(link.href);
                  }}
                  className="flex items-baseline gap-5 border-b border-white/12 py-4 first:border-t"
                >
                  <span className="w-8 shrink-0 text-[11px] font-semibold tracking-[0.14em] text-white/40">
                    {link.index}
                  </span>
                  <span className="text-[19px] text-white">{link.label}</span>
                </a>
              ))}
            </nav>

            <div className="mt-auto pt-14">
              <a
                href={D_CTA_HREF}
                onClick={(event) => {
                  event.preventDefault();
                  jumpTo(D_CTA_HREF);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-white px-6 py-4 text-[15px] font-semibold text-[#12283E]"
              >
                {D_CTA_LABEL} →
              </a>
              <p className="mt-3 text-center text-[12px] text-white/50">{D_CTA_NOTE}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
