'use client';

import { useEffect, useState } from 'react';

/**
 * Липкое действие версии C — принцип «действие доступно всегда» (`маркетинг/46`).
 *
 * Позиция формы в процентах перестаёт что-либо значить, если заявку можно
 * оставить с любого экрана: панель появляется после первого экрана и ведёт к
 * форме одним нажатием. Пока форма на экране, панель прячется — иначе она
 * перекрывала бы то самое поле, к которому ведёт.
 *
 * Панель прижата к правому краю и оставляет место переключателю версий
 * (он слева внизу), чтобы кнопки не наезжали друг на друга.
 */
export default function StickyCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const trial = document.getElementById('trial');

    const update = () => {
      const passedHero = window.scrollY > window.innerHeight * 0.6;
      const trialOnScreen = trial
        ? (() => {
            const rect = trial.getBoundingClientRect();
            return rect.top < window.innerHeight && rect.bottom > 0;
          })()
        : false;
      setVisible(passedHero && !trialOnScreen);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-end px-4 pb-4 transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <a
        href="#trial"
        tabIndex={visible ? 0 : -1}
        className={`flex min-h-[48px] max-w-[calc(100%-5rem)] items-center gap-2 rounded-full bg-[#1D70B7] px-5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#185F9D] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 ${
          visible ? 'pointer-events-auto' : ''
        }`}
      >
        Неделя Pro — 0 ₽<span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
