'use client';

// Герой версии D.
//
// Первый экран обещает не снятую рутину, а вникание: «помнит, что было на
// прошлой неделе, и спрашивает, прежде чем советовать» — первая из пяти точек,
// на которых держится позиционирование страницы.
//
// Скролл-анимация. Нижний запас секции считается под ход зума (до центра
// мокапа), без пустых 50–70vh после CTA. Липкий только фон. Ролик растёт от
// верха; play — через `--hero-content-scale`.
//
// Кнопка на первом экране убрана: после зума соседний блок уже в кадре, soft-
// scroll пустой, а trial/квиз живут в шапке и липкой панели. Под мокапом —
// closer-строка про живого куратора (Playfair на «не бот»).
// Прямая заявка на первом экране по-прежнему запрещена `COPY_VOICE` 2026-06-27.

import { useEffect, useRef } from 'react';

import { playfair } from './fonts';
import { LogoD } from './LogoD';
import { D_CTA_HREF, D_CTA_LABEL, D_NAV_LINKS } from './nav';

import HeroFlowDemo from '@/components/HeroFlowDemo';

/** Орнамент фона: повторяющийся плюс, едва различимый. */
const PLUS_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 5.5c.9 4.1.9 4.1 5 4.9-4.1.9-4.1.9-5 5-.9-4.1-.9-4.1-5-5 4.1-.8 4.1-.8 5-4.9Z' fill='%23FFFFFF'/%3E%3C/svg%3E\")";

const MAX_PHONE_SCALE = 1.44;
/** Главы демо торчат под рамкой (`-bottom-9` в HeroFlowDemo). */
const CHAPTER_DOTS_PX = 36;
/** Воздух между низом масштабированного мокапа и closer-строкой. */
const CTA_GAP_PX = 36;
/** Высота closer-строки + нижний отступ блока (без кнопки). */
const CTA_CHROME_PX = 72;

const smoothstep = (g: number) => g * g * (3 - 2 * g);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

interface HeroDProps {
  onOpenMenu: () => void;
}

export default function HeroD({ onOpenMenu }: HeroDProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const ctaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Зум доигрывает к моменту, когда мокап по центру экрана — дальше scale
    // держим. Origin сверху: рост вниз, не наезжает на плашку «7 дней».
    const desktop = window.matchMedia('(min-width: 1024px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const rafRef = { current: 0 };
    const metrics = {
      active: false,
      growStart: 0,
      growTravel: 1,
      maxScale: 1,
      height: 0,
    };

    const measure = () => {
      const section = sectionRef.current;
      const phone = phoneRef.current;
      if (!section || !phone) return;

      if (reduced.matches) {
        metrics.active = false;
        metrics.maxScale = 1;
        metrics.height = phone.offsetHeight;
        if (ctaRef.current) ctaRef.current.style.marginTop = '';
        section.style.paddingBottom = '';
        return;
      }

      // Сбрасываем pad до замера контента — иначе накопит прошлый запас.
      section.style.paddingBottom = '0px';

      const prevTransform = phone.style.transform;
      const prevScaleVar = phone.style.getPropertyValue('--hero-content-scale');
      phone.style.transform = 'none';
      phone.style.removeProperty('--hero-content-scale');

      const width = phone.offsetWidth;
      const height = phone.offsetHeight;
      const rect = phone.getBoundingClientRect();
      const centerDoc = rect.top + window.scrollY + height / 2;

      phone.style.transform = prevTransform;
      if (prevScaleVar) phone.style.setProperty('--hero-content-scale', prevScaleVar);

      if (width === 0 || height === 0) return;

      const vh = window.innerHeight;
      // Финальная ширина чуть уже края экрана — воздух по бокам, не «в упор».
      const targetWidth = desktop.matches
        ? Math.min(430, window.innerWidth * 0.82)
        : Math.min(310, window.innerWidth * 0.76);
      // Снизу оставляем место под точки глав + CTA + подпись.
      const bottomChrome = CHAPTER_DOTS_PX + CTA_GAP_PX + CTA_CHROME_PX;
      const heightPad = desktop.matches ? 48 : 32;
      const cap = desktop.matches ? MAX_PHONE_SCALE : 1.26;
      const maxScale = Math.min(
        cap,
        Math.max(1, Math.min(targetWidth / width, (vh - heightPad - bottomChrome) / height)),
      );

      // scrollY, при котором центр мокапа (без scale) = центр вьюпорта.
      const growStart = section.offsetTop;
      const centeredScroll = centerDoc - vh / 2;
      const growTravel = Math.max(1, centeredScroll - growStart);

      metrics.active = maxScale > 1.02;
      metrics.growStart = growStart;
      metrics.growTravel = growTravel;
      metrics.maxScale = maxScale;
      metrics.height = height;

      const cta = ctaRef.current;
      if (cta) {
        // Origin сверху: прирост высоты вниз + точки глав (тоже в transform).
        cta.style.marginTop = metrics.active
          ? `${CTA_GAP_PX + CHAPTER_DOTS_PX * maxScale + (maxScale - 1) * height}px`
          : `${CTA_GAP_PX + CHAPTER_DOTS_PX}px`;
      }

      // Pad только чтобы доскроллить зум до центра. Без лишнего хвоста:
      // после CTA сразу «Ваша ситуация», а не пустое тёмное поле.
      const softLand = 16;
      const contentH = section.offsetHeight;
      const padNeeded = growTravel + vh - contentH;
      section.style.paddingBottom = `${Math.max(softLand, Math.ceil(padNeeded))}px`;
    };

    const apply = () => {
      const phone = phoneRef.current;
      if (!phone) return;

      if (!metrics.active) {
        phone.style.transform = '';
        phone.style.removeProperty('--hero-content-scale');
        if (textRef.current) {
          textRef.current.style.opacity = '';
          textRef.current.style.transform = '';
        }
        return;
      }

      const p = clamp01((window.scrollY - metrics.growStart) / metrics.growTravel);
      const scale = 1 + (metrics.maxScale - 1) * smoothstep(p);
      phone.style.transformOrigin = 'center top';
      phone.style.transform = `scale(${scale.toFixed(4)})`;
      // HeroFlowDemo: play = 0.88 / --hero-content-scale → кладём scale родителя.
      phone.style.setProperty('--hero-content-scale', String(scale));

      const text = textRef.current;
      if (text) {
        if (desktop.matches) {
          // Плашка уходит до того, как мокап заметно вырастет.
          const fade = Math.min(1, p / 0.55);
          text.style.opacity = String(1 - fade);
          text.style.transform = `translateY(${(-28 * fade).toFixed(1)}px)`;
        } else {
          text.style.opacity = '';
          text.style.transform = '';
        }
      }
    };

    const schedule = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        apply();
      });
    };

    const remeasure = () => {
      measure();
      apply();
    };

    remeasure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure);
    window.addEventListener('load', remeasure);
    desktop.addEventListener('change', remeasure);
    reduced.addEventListener('change', remeasure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
    if (phoneRef.current) observer?.observe(phoneRef.current);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('load', remeasure);
      desktop.removeEventListener('change', remeasure);
      reduced.removeEventListener('change', remeasure);
      observer?.disconnect();
    };
  }, []);

  return (
    <section id="hero-d" ref={sectionRef} className="relative bg-[#0A1119]">
      {/* Липкая обёртка нулевой высоты: сама она места в потоке не занимает,
          поэтому контент ниже начинается от верха секции, а фон внутри неё
          остаётся на экране всю прокрутку героя. Класть контент ВНУТРЬ липкого
          слоя нельзя: его `overflow: hidden` срезает всё, что не поместилось в
          высоту экрана, — при 812 px по высоте так пропадали кнопка и
          точки-главы (контент героя ~1240 px). */}
      <div className="sticky top-0 z-0 h-0">
        <div className="h-screen overflow-hidden">
          {/* Фон: градиент, орнамент и свечение под заголовком. */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg,#12263B 0%,#0E1D2E 42%,#0A1420 78%,#080F17 100%)',
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: PLUS_PATTERN,
              backgroundSize: '56px 56px',
              // Маска сверху — чтобы орнамент не спорил с шапкой.
              maskImage:
                'linear-gradient(180deg,rgba(0,0,0,0) 0px,rgba(0,0,0,0.35) 84px,rgba(0,0,0,1) 132px)',
              WebkitMaskImage:
                'linear-gradient(180deg,rgba(0,0,0,0) 0px,rgba(0,0,0,0.35) 84px,rgba(0,0,0,1) 132px)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 h-[520px] w-[900px] max-w-none -translate-x-1/2"
            style={{
              top: -220,
              background: 'radial-gradient(closest-side,rgba(88,150,205,0.28),rgba(88,150,205,0))',
            }}
          />
        </div>
      </div>

      {/* Контент поверх липкого фона. */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Шапка первого экрана. */}
        <header className="relative z-10 mx-auto flex w-full max-w-[1240px] items-center justify-between gap-6 px-5 py-6 sm:px-9">
          <LogoD size={20} />

          <nav className="hidden items-center gap-6 min-[1181px]:flex">
            {D_NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="whitespace-nowrap text-[13px] text-white/72 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={D_CTA_HREF}
              className="hidden whitespace-nowrap rounded-full border border-white/32 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/10 sm:inline-flex"
            >
              {D_CTA_LABEL}
            </a>
            <button
              type="button"
              aria-label="Открыть меню"
              onClick={onOpenMenu}
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1.5 min-[1181px]:hidden"
            >
              <span aria-hidden="true" className="block h-0.5 w-5 bg-white" />
              <span aria-hidden="true" className="block h-0.5 w-5 bg-white" />
            </button>
          </div>
        </header>

        {/* Контент первого экрана. */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-5 text-center">
          <div ref={textRef} className="flex flex-col items-center">
            <h1 className="max-w-[760px] text-balance text-[clamp(38px,5vw,62px)] font-semibold leading-[1.08] tracking-[-0.025em] text-white">
              Ваш дневник питания{' '}
              <span className={`${playfair.className} font-medium italic`}>ведёт куратор.</span>
            </h1>

            <p className="mt-[clamp(20px,3.2vw,36px)] max-w-[560px] text-[clamp(15px,1.6vw,17px)] leading-[1.6] text-white/75">
              Присылаете фото, голосовое или пару фраз — обычно 3–5 минут в день. Остальное делает
              куратор: ведёт дневник, помнит, что было на прошлой неделе, и спрашивает, прежде чем
              советовать.
            </p>

            <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/24 bg-white/[0.09] px-[18px] py-2.5 text-[13px] backdrop-blur-[4px]">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#7FD1A0]" />
              <span className="whitespace-nowrap font-semibold text-white">7 дней Pro — 0 ₽</span>
              <span className="whitespace-nowrap text-white/62">· без карты и автосписаний</span>
            </p>
          </div>

          <div
            ref={phoneRef}
            className="mt-[clamp(28px,5vh,48px)] w-[248px] max-w-[68vw] origin-top will-change-transform sm:w-[280px] sm:max-w-[72vw] lg:mt-[clamp(36px,6vh,56px)]"
          >
            <HeroFlowDemo
              showChapters
              containerClassName="relative mx-auto aspect-[301/608] w-full"
              frameClassName="absolute inset-0 overflow-hidden rounded-[44px] border-8 border-[#0B0F16] bg-[#0B0F16] shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_40px_90px_rgba(0,0,0,0.55)]"
              controlClassName="absolute -right-3.5 top-3.5 z-20 flex h-[46px] w-[46px] items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#12283E] shadow-[0_8px_20px_rgba(0,0,0,0.25)] transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait"
            />
          </div>

          {/* Closer героя: без кнопки — job trial закрыт шапкой и липкой панелью.
              «не бот» — Playfair italic, как акценты в заголовках D, меньшим кеглем. */}
          <div ref={ctaRef} className="pb-12 sm:pb-14" style={{ marginTop: CTA_GAP_PX + CHAPTER_DOTS_PX }}>
            <p className="max-w-[320px] text-balance text-[clamp(17px,2.1vw,21px)] font-medium leading-[1.4] tracking-[-0.01em] text-white/88">
              Куратор — живой человек,{' '}
              <span className={`${playfair.className} font-medium italic text-white`}>не бот</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
