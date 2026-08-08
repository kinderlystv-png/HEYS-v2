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
import { D_CTA_HREF, D_CTA_LABEL, D_CTA_LABEL_SHORT, D_CTA_NOTE, D_NAV_LINKS } from './nav';

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

      // Широкий экран: липкой пилюли там нет (она живёт до
      // `STICKY_CTA_MAX_WIDTH`), и если шапка ещё и прячется при чтении вниз,
      // человек, дочитавший тарифы, остаётся без единой кнопки на экране. На
      // такой высоте прятать панель незачем — 56 px ничего не поджимают.
      const wide = window.innerWidth > STICKY_CTA_MAX_WIDTH;

      const header = headerRef.current;
      if (header) {
        if (y <= heroEnd + 40) {
          headerShownRef.current = false;
        } else if (wide) {
          headerShownRef.current = true;
        } else if (delta < -4) {
          headerShownRef.current = true;
        } else if (delta > 6) {
          headerShownRef.current = false;
        }
        // Пишем именно `translate`, а не `transform`: стартовое состояние задано
        // классом Tailwind (`-translate-y-full`), а в Tailwind v4 это отдельное
        // CSS-свойство `translate`. Инлайновый `transform` его не заменяет, а
        // складывается с ним — панель оставалась сдвинутой на -100% и не
        // показывалась ни разу.
        header.style.translate = headerShownRef.current ? '0 0' : '0 -100%';
      }

      const sticky = stickyCtaRef.current;
      if (sticky) {
        const pain = document.getElementById('pain');
        const trial = document.getElementById('trial');
        const vh = window.innerHeight;
        const from = pain ? pain.offsetTop - vh * 0.5 : heroEnd;
        const to = trial ? trial.offsetTop - vh * 0.9 : Number.POSITIVE_INFINITY;
        // Липкая гаснет там, где на экране есть собственная кнопка. Правило
        // общее, а не исключение для тарифов: в секции 06 три карточки со
        // своими CTA, и плавающая дублировала бы одну из них, перекрывая две
        // другие ровно в момент выбора — то есть отбирала бы выбор там, где
        // страница его предлагает (решение владельца 2026-08-08).
        //
        // Считаем по геометрии, а не через IntersectionObserver: слушатель
        // scroll здесь уже один на всю страницу, и заводить рядом второй
        // механизм ради того же вопроса — лишняя точка рассинхрона.
        const ownCtaInView = Array.from(
          document.querySelectorAll<HTMLElement>('[data-own-cta]'),
        ).some((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < vh;
        });
        const visible = !wide && y > from && y < to && !ownCtaInView;
        // `translate`, а не `transform` — по той же причине, что и у шапки.
        // 180% вместо прежних 140%: пилюля ниже прежней кнопки, а её тень
        // (34px размытия) прежняя, и на 140% край подсветки виден у кромки.
        sticky.style.translate = visible ? '0 0' : '0 180%';
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
      {/* Начальное «спрятано» задаётся инлайном, а не классом `-translate-y-full`.
          Причина: в Tailwind v4 утилиты сдвига пишут `translate` через свои
          `@property`-переменные, и инлайновое значение того же свойства до них
          не достаёт — панель оставалась на −100% даже при `translate: none`
          в `style`. Одно место правды: и старт, и переключение — инлайн. */}
      <div
        ref={headerRef}
        style={{ translate: '0 -100%' }}
        className="fixed inset-x-0 top-0 z-40 border-b border-[rgba(16,24,38,0.08)] bg-[rgba(247,246,242,0.88)] backdrop-blur-[14px] transition-transform duration-[350ms] ease-out"
      >
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-6 px-5 py-3 sm:px-9">
          {/* `LogoD` жёстко белый (рассчитан на тёмный герой и бургер), а эта
              панель светлая. Перекрашиваем его снаружи, из места применения:
              переписывать сам логотип нельзя — он используется ещё в трёх
              тёмных местах, и там белый правильный. */}
          <a
            href="#hero-d"
            aria-label="HEYS — наверх"
            className="[&>span>span]:text-[#8A94A2] [&>span]:text-[#101826]"
          >
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
                // Прототипный #5B6472 над тёмной карточкой заявки даёт 4.35:1 —
                // на волос ниже AA. #565F6C визуально тот же серый, но 4.70:1.
                className="whitespace-nowrap text-[13px] text-[#565F6C] transition-colors hover:text-[#101826]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <a
              href={D_CTA_HREF}
              className="whitespace-nowrap rounded-full bg-[#12283E] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#1B3A58]"
            >
              {D_CTA_LABEL_SHORT}
            </a>
            <button
              type="button"
              aria-label="Открыть меню"
              aria-expanded={menuOpen}
              onClick={onOpenMenu}
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1.5 min-[1181px]:hidden"
            >
              <span aria-hidden="true" className="block h-0.5 w-5 rounded-[2px] bg-[#101826]" />
              <span aria-hidden="true" className="block h-0.5 w-5 rounded-[2px] bg-[#101826]" />
            </button>
          </div>
        </div>
      </div>

      {/* Липкий CTA — только на узких экранах и только между узнаванием и формой. */}
      <div
        ref={stickyCtaRef}
        className="fixed inset-x-0 bottom-4 z-30 mx-auto w-fit max-w-[calc(100%-32px)] transition-transform duration-300 ease-out"
        style={{ translate: '0 180%', pointerEvents: 'none' }}
      >
        {/* Светлый контур в 1px — не украшение, а лечение коллизии: пилюля
            проезжает над тёмной плашкой «Следующий шаг» в блоке недели, где тот
            же `#12283E`, и без контура её силуэт растворяется в фоне (тень не
            помогает — она тоже тёмная). На светлых секциях линия по краю тёмной
            пилюли не читается вовсе. Прозрачность 0.22, а не чистый белый:
            белый в упор дал бы мыльный ореол на светлом фоне. Контур сделан
            вторым, внутренним слоем той же тени, а не утилитой `ring-*`: в
            Tailwind v4 `ring` с произвольной прозрачностью здесь не собирался в
            CSS, и рамки просто не было. */}
        <a
          href={D_CTA_HREF}
          className="flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#12283E] px-[26px] py-[14px] text-[14px] font-semibold text-white shadow-[0_14px_34px_rgba(10,17,25,0.4),inset_0_0_0_1px_rgba(255,255,255,0.22)]"
        >
          {D_CTA_LABEL_SHORT}
          <span aria-hidden="true">→</span>
        </a>
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
