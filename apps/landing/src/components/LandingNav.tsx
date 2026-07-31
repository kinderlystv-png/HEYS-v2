// LandingNav.tsx — навигация лендинга целиком: состояние меню, определение
// текущего раздела, залипающая шапка и выдвижная панель разделов.
//
// Живёт над версиями страницы, а не внутри первого экрана: у каждой версии
// свой hero, но меню у всех одно. Сам hero берёт из контекста только кнопку
// (`NavToggle`) и ставит её в свою строку с логотипом — так расчёт высоты
// первого экрана остаётся его внутренним делом.

'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import logoHorizontal from '../assets/logo-horizontal.svg';

import MobileNavMenu from './MobileNavMenu';

import type { NavLink } from '@/config/landing-variants';

interface LandingNavValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** id раздела, до которого пользователь дочитал. */
  activeLinkId: string | null;
}

const LandingNavContext = createContext<LandingNavValue | null>(null);

/** Возвращает null вне провайдера — hero не обязан быть внутри него. */
export function useLandingNav(): LandingNavValue | null {
  return useContext(LandingNavContext);
}

interface LandingNavProps {
  links: NavLink[];
  children: ReactNode;
  /** Высота шапки первого экрана: под ней начинается контент панели. */
  heroHeaderHeight?: number;
}

const STICKY_HEIGHT = 56;

export default function LandingNav({ links, children, heroHeaderHeight = 85 }: LandingNavProps) {
  const [open, setOpen] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  // Зависимость по содержимому, а не по ссылке на массив: версия вправе
  // собирать свой список ссылок прямо в разметке, и переподписывать слушатель
  // на каждый рендер из-за этого не нужно.
  const linksRef = useRef(links);
  linksRef.current = links;
  const anchorsKey = links.map((link) => `${link.id}>${link.href}`).join('|');

  // Один слушатель прокрутки на две задачи: показать залипающую шапку после
  // первого экрана и определить текущий раздел.
  useEffect(() => {
    const anchors = linksRef.current.map((link) => ({
      id: link.id,
      elementId: link.href.replace('#', ''),
    }));
    let raf = 0;
    const measure = () => {
      raf = 0;
      setPastHero(window.scrollY > window.innerHeight * 0.7);
      // Активен последний раздел, чья верхняя граница уже прошла шапку.
      let current: string | null = null;
      for (const anchor of anchors) {
        const element = document.getElementById(anchor.elementId);
        if (element && element.getBoundingClientRect().top <= 120) current = anchor.id;
      }
      setActiveLinkId(current);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
    };
  }, [anchorsKey]);

  const value = useMemo<LandingNavValue>(
    () => ({ open, toggle, close, activeLinkId }),
    [open, toggle, close, activeLinkId],
  );

  const activeLabel = links.find((link) => link.id === activeLinkId)?.label ?? null;

  return (
    <LandingNavContext.Provider value={value}>
      {children}

      {/* Залипающая шапка: после первого экрана меню остаётся доступным, а
          подпись у логотипа отвечает на вопрос «в каком я разделе». */}
      <div
        className={`fixed inset-x-0 top-0 z-[70] transition-transform duration-300 ease-out lg:hidden ${
          pastHero ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div
          className="flex items-center justify-between gap-3 border-b border-[#0F172A]/[0.06] bg-white/85 pl-5 pr-3 backdrop-blur-xl"
          style={{ height: STICKY_HEIGHT }}
        >
          {/* items-end: у логотипа плюсы поднимаются над буквами, поэтому по
              центру строки подпись оказывалась заметно выше слова «HEYS».
              Выравниваем по низу — то есть по базовой линии букв. */}
          <div className="flex min-w-0 items-end gap-3">
            <img
              src={logoHorizontal.src}
              alt="HEYS lab"
              width={99}
              height={37}
              className="shrink-0"
            />
            <span className="min-w-0 translate-y-[3px] truncate text-[13px] text-[#6b7280]">
              {open ? 'меню' : (activeLabel ?? '')}
            </span>
          </div>
          <NavToggle />
        </div>
      </div>

      <MobileNavMenu
        links={links}
        open={open}
        onClose={close}
        activeLinkId={activeLinkId}
        headerOffset={pastHero ? STICKY_HEIGHT : heroHeaderHeight}
      />
    </LandingNavContext.Provider>
  );
}

/** Кнопка меню. Стоит в двух местах: в шапке hero и в залипающей полоске. */
export function NavToggle() {
  const nav = useLandingNav();
  if (!nav) return null;

  const { open, toggle } = nav;

  return (
    <button
      onClick={toggle}
      className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-[#f3f4f6] focus:outline-none focus:ring-2 focus:ring-[#111827]/10 lg:hidden"
      aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
      aria-expanded={open}
      aria-controls="mobile-navigation"
    >
      <div className="relative w-5 h-4 flex flex-col justify-between">
        <span
          className={`block h-[1.5px] w-full bg-[#374151] rounded-full transition-all duration-300 origin-center ${
            open ? 'rotate-45 translate-y-[7px]' : ''
          }`}
        />
        <span
          className={`block h-[1.5px] w-full bg-[#374151] rounded-full transition-all duration-200 ${
            open ? 'opacity-0 scale-x-0' : ''
          }`}
        />
        <span
          className={`block h-[1.5px] w-full bg-[#374151] rounded-full transition-all duration-300 origin-center ${
            open ? '-rotate-45 -translate-y-[7px]' : ''
          }`}
        />
      </div>
    </button>
  );
}
