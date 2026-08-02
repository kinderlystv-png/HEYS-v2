'use client';

// Герой версии D.
//
// Первый экран обещает не снятую рутину, а вникание: «помнит, что было на
// прошлой неделе, и спрашивает, прежде чем советовать» — первая из пяти точек,
// на которых держится позиционирование страницы.
//
// Скролл-анимация. Секция вдвое выше вьюпорта, внутри — липкий слой на высоту
// экрана. По мере прокрутки текст уходит, а телефон вырастает почти во весь
// экран, то есть демонстрация «раскрывается» вместо того, чтобы уехать вверх.
// Кнопка play контр-масштабируется, иначе она росла бы вместе с корпусом.
//
// Кнопка первого экрана ведёт не в форму, а в блок механики: прямая заявка на
// первом экране запрещена записью `COPY_VOICE` от 2026-06-27, а доступность
// действия закрыта липкой панелью и шапкой.

import { useEffect, useRef } from 'react';

import { playfair } from './fonts';
import { LogoD } from './LogoD';
import { D_CTA_HREF, D_NAV_LINKS } from './nav';

import HeroFlowDemo from '@/components/HeroFlowDemo';

/** Орнамент фона: повторяющийся плюс, едва различимый. */
const PLUS_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg width='28' height='28' viewBox='0 0 28 28' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 5.5c.9 4.1.9 4.1 5 4.9-4.1.9-4.1.9-5 5-.9-4.1-.9-4.1-5-5 4.1-.8 4.1-.8 5-4.9Z' fill='%23FFFFFF'/%3E%3C/svg%3E\")";

const MAX_PHONE_SCALE = 1.55;

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
    // Скролл-зум — приём для широкого экрана. На телефоне первый экран и так
    // почти целиком занят демонстрацией, а липкий слой на высоту экрана резал
    // бы кнопку и точки-главы: контент героя выше вьюпорта телефона, и всё,
    // что не поместилось, пропадало под `overflow: hidden`. Поэтому на узких
    // экранах герой — обычный блок в потоке, без анимации.
    const desktop = window.matchMedia('(min-width: 1024px)');

    // Всё, что меняется на каждый кадр прокрутки, пишем прямо в стиль узла:
    // через состояние React это перерисовывало бы весь первый экран.
    const apply = () => {
      const section = sectionRef.current;
      const phone = phoneRef.current;
      if (!section || !phone) return;

      if (!desktop.matches) {
        phone.style.transform = '';
        phone.style.removeProperty('--hero-content-scale');
        if (textRef.current) {
          textRef.current.style.opacity = '';
          textRef.current.style.transform = '';
        }
        if (ctaRef.current) ctaRef.current.style.marginTop = '';
        return;
      }

      const vh = window.innerHeight;
      const heroTop = section.offsetTop;
      const heroHeight = section.offsetHeight;
      const travel = Math.max(1, heroHeight - vh);
      const p = clamp01((window.scrollY - heroTop) / travel);

      const width = phone.offsetWidth;
      const height = phone.offsetHeight;
      if (width === 0 || height === 0) return;

      const targetWidth = Math.min(470, window.innerWidth * 0.92);
      const maxScale = Math.min(
        MAX_PHONE_SCALE,
        Math.max(1, Math.min(targetWidth / width, (vh - 40) / height)),
      );
      const scale = 1 + (maxScale - 1) * smoothstep(Math.min(1, p / 0.6));
      phone.style.transform = `scale(${scale.toFixed(4)})`;
      phone.style.setProperty('--hero-content-scale', String(1 / scale));

      const text = textRef.current;
      if (text) {
        const fade = Math.min(1, p / 0.4);
        text.style.opacity = String(1 - fade);
        text.style.transform = `translateY(${(-28 * fade).toFixed(1)}px)`;
      }

      const cta = ctaRef.current;
      if (cta) {
        // Телефон растёт из центра, поэтому нижний край уезжает вниз на
        // половину прироста — на столько же отодвигаем кнопку.
        cta.style.marginTop = `${52 + ((maxScale - 1) * height) / 2}px`;
      }
    };

    apply();
    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', apply);
    window.addEventListener('load', apply);
    desktop.addEventListener('change', apply);
    return () => {
      window.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('load', apply);
      desktop.removeEventListener('change', apply);
    };
  }, []);

  return (
    <section id="hero-d" ref={sectionRef} className="relative bg-[#0A1119] lg:pb-[70vh]">
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
              Неделя Pro — 0 ₽
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
            className="mt-[5vh] w-[248px] max-w-[76vw] origin-center will-change-transform sm:w-[300px] sm:max-w-[86vw] lg:mt-[7vh]"
          >
            <HeroFlowDemo
              showChapters
              containerClassName="relative mx-auto aspect-[301/608] w-full"
              frameClassName="absolute inset-0 overflow-hidden rounded-[44px] border-8 border-[#0B0F16] bg-[#0B0F16] shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_40px_90px_rgba(0,0,0,0.55)]"
              controlClassName="absolute -right-3.5 top-3.5 z-20 flex h-[46px] w-[46px] items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#12283E] shadow-[0_8px_20px_rgba(0,0,0,0.25)] transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-wait"
            />
          </div>

          <div ref={ctaRef} className="pb-10" style={{ marginTop: 52 }}>
            <a
              href="#curator"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-[30px] py-4 text-[15px] font-semibold text-[#12283E] shadow-[0_12px_30px_rgba(0,0,0,0.3)] transition-all duration-[250ms] hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(0,0,0,0.4)]"
            >
              Понять, как работает HEYS →
            </a>
            <p className="mt-3 text-[13px] text-white/58">Куратор — живой человек, не чат-бот</p>
          </div>
        </div>
      </div>
    </section>
  );
}
