// MobileNavMenu.tsx — мобильное меню лендинга.
// Список разделов как оглавление: номер, название и короткая подсказка,
// внизу — единственное целевое действие. Панель перекрывает экран целиком,
// строка с логотипом и кнопкой закрытия остаётся над ней.

'use client';

import { useCallback, useEffect, useRef } from 'react';

import type { NavLink } from '@/config/landing-variants';

interface MobileNavMenuProps {
  links: NavLink[];
  open: boolean;
  onClose: () => void;
  /** Раздел, до которого пользователь дочитал: подсвечивается в списке. */
  activeLinkId?: string | null;
  /** Высота шапки лендинга — панель начинает контент под ней. */
  headerOffset?: number;
}

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

export default function MobileNavMenu({
  links,
  open,
  onClose,
  activeLinkId = null,
  headerOffset = 85,
}: MobileNavMenuProps) {
  const lockedOverflowRef = useRef<string | null>(null);

  const releaseScrollLock = useCallback(() => {
    if (lockedOverflowRef.current === null) return;
    document.body.style.overflow = lockedOverflowRef.current;
    lockedOverflowRef.current = null;
  }, []);

  // Esc закрывает меню, фон не прокручивается под открытой панелью.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    lockedOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, releaseScrollLock]);

  // Замок снимается синхронно в обработчике клика: переход по якорю
  // происходит сразу после события, и заблокированный body его гасит.
  const handleNavigate = useCallback(() => {
    releaseScrollLock();
    onClose();
  }, [onClose, releaseScrollLock]);

  return (
    <div
      id="mobile-navigation"
      aria-hidden={!open}
      className={`fixed inset-0 z-[60] lg:hidden ${
        open ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Фон: продолжение градиента первого экрана, чтобы панель не читалась
          как чужой белый слой поверх брендового hero. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[linear-gradient(180deg,#EAF3FA_0%,#FAFCFD_34%,#FFFFFF_72%,#FFFBF3_100%)] transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Обёртка гасит узор вместе с панелью: сам класс задаёт свою opacity. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="hero-brand-plus-pattern absolute inset-0" />
      </div>

      {/* Общая прозрачность нужна поверх поэлементной анимации: линейки списка
          иначе просвечивают поверх hero при закрытом меню. */}
      <div
        className={`relative flex h-full flex-col transition-opacity duration-300 ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          paddingTop: `${headerOffset}px`,
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}
      >
        <nav className="flex flex-1 overflow-y-auto px-6 py-1" aria-label="Разделы страницы">
          {/* m-auto центрирует список в свободной высоте и, в отличие от
              justify-center, не срезает верх при прокрутке на низких экранах. */}
          <div className="m-auto w-full">
            <p
              className={`pb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9CA8B4] transition-all duration-500 ${
                open ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
              }`}
              style={{ transitionTimingFunction: EASE_OUT, transitionDelay: open ? '60ms' : '0ms' }}
            >
              Разделы
            </p>

            <ul className="border-t border-[#0F172A]/[0.07]">
              {links.map((link, index) => {
                const isActive = link.id === activeLinkId;

                return (
                  <li key={link.id} className="border-b border-[#0F172A]/[0.07]">
                    <a
                      href={link.href}
                      onClick={handleNavigate}
                      tabIndex={open ? undefined : -1}
                      aria-current={isActive ? 'true' : undefined}
                      className={`group -mx-2 flex min-h-[52px] items-center gap-4 rounded-xl px-2 py-[10px] transition-all duration-500 active:bg-[#1D70B7]/[0.05] ${
                        isActive ? 'bg-[#1D70B7]/[0.055]' : ''
                      } ${open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
                      style={{
                        transitionTimingFunction: EASE_OUT,
                        transitionDelay: open ? `${100 + index * 55}ms` : '0ms',
                      }}
                    >
                      <span
                        className={`w-[22px] shrink-0 self-start pt-[3px] text-[10.5px] font-medium tabular-nums tracking-[0.14em] ${
                          isActive ? 'text-[#1D70B7]' : 'text-[#B7CBDA]'
                        }`}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* items-end, а не items-baseline: по базовой линии бейдж
                            зрительно висит высоко, потому что у слов раздела есть
                            выносные элементы. Ставим его по нижней линии строки. */}
                        <span className="flex items-end gap-2 text-[19px] font-semibold leading-tight tracking-[-0.01em] text-[#111827]">
                          {link.label}
                          {isActive ? (
                            <span className="shrink-0 rounded-full bg-[#1D70B7]/[0.1] px-2 py-[2px] text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#1D70B7]">
                              вы здесь
                            </span>
                          ) : null}
                        </span>
                        {/* На низких экранах подсказки скрываются, чтобы все
                          разделы помещались без прокрутки. */}
                        {link.hint ? (
                          <span className="mt-[2px] hidden text-[12px] leading-snug text-[#7C8A99] [@media(min-height:700px)]:block">
                            {link.hint}
                          </span>
                        ) : null}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                        className="shrink-0 text-[#C6D4E0] transition-transform duration-300 group-active:translate-x-[3px]"
                      >
                        <path
                          d="m9 6 6 6-6 6"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Целевое действие остаётся одно и не спорит с навигацией. */}
        <div
          className={`px-6 pt-5 transition-all duration-500 ${
            open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
          }`}
          style={{
            transitionTimingFunction: EASE_OUT,
            transitionDelay: open ? `${140 + links.length * 55}ms` : '0ms',
          }}
        >
          <a
            href="#trial"
            onClick={handleNavigate}
            tabIndex={open ? undefined : -1}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#1D70B7] px-6 text-[15px] font-semibold tracking-wide text-white shadow-[0_12px_26px_rgba(29,112,183,0.22)] transition-colors hover:bg-[#185F9D] active:bg-[#185F9D]"
          >
            Бесплатная неделя Pro
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
          <p className="mt-3 text-center text-[11.5px] text-[#8A97A5]">Без карты и автосписаний</p>
        </div>
      </div>
    </div>
  );
}
