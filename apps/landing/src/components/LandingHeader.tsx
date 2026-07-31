// LandingHeader.tsx — строка шапки лендинга: логотип, десктопная навигация и
// кнопка мобильного меню.
//
// Общая для всех версий страницы: у каждой версии свой первый экран, но шапка
// у них одна, и правка меню не должна расходиться по копиям. Кнопка работает
// только внутри LandingNav — он владеет состоянием меню.

'use client';

import logoHeroBlue from '../assets/logo-hero-blue.png';

import { NavToggle } from './LandingNav';

import type { NavLink } from '@/config/landing-variants';

interface LandingHeaderProps {
  links: NavLink[];
  /** Классы внешнего элемента: например анимация появления первого экрана. */
  className?: string;
}

export default function LandingHeader({ links, className = '' }: LandingHeaderProps) {
  return (
    <header className={`relative w-full ${className}`}>
      <div className="hero-mobile-header relative z-[70] mx-auto flex w-full max-w-[1024px] items-center justify-between py-4 pl-6 pr-4 md:px-6">
        <div className="flex items-center">
          <img src={logoHeroBlue.src} alt="HEYS" width={80} height={53} />
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 lg:flex xl:gap-8">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className="text-[13px] tracking-wide text-[#374151] transition-colors hover:text-[#111827]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Mobile menu button — минималистичный premium стиль */}
        <NavToggle />
      </div>
    </header>
  );
}
