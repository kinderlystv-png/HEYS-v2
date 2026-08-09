'use client';

// ThemeBarColor.tsx — цвет системных полос телефона под содержимое страницы.
//
// На iPhone область «чёлки» сверху и панель Safari снизу красятся в
// `theme-color`. Одно значение на всю страницу здесь не работает: первый экран
// и подвал тёмные, середина светлая, и любой фиксированный цвет половину
// страницы обрамляет чужой полосой. Пара «светлая/тёмная» тоже не спасает — она
// зависит от темы системы, а не от того, что сейчас перед глазами.
//
// Поэтому цвет ведёт разметка: поверхность, которая может оказаться в верхней
// точке экрана, помечает себя `data-theme-bar="<цвет>"`. Здесь мы смотрим, кто
// из помеченных накрывает эту точку, и отдаём его цвет. Ничего не накрывает —
// значит сверху обычный светлый фон страницы.

import { useEffect } from 'react';

import { D_BG_WARM } from './theme';

/** Светлый верх: липкая шапка и тёплый фон разделов между героем и подвалом. */
const DEFAULT_BAR = D_BG_WARM;

export default function ThemeBarColor() {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    const initial = meta.content;
    let current = initial;
    let raf = 0;

    const pick = () => {
      raf = 0;
      let colour = DEFAULT_BAR;
      // Последний подходящий выигрывает: оверлей меню идёт в разметке позже
      // секций и лежит поверх них.
      document.querySelectorAll<HTMLElement>('[data-theme-bar]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.top <= 0 && rect.bottom > 0) {
          colour = el.dataset.themeBar || colour;
        }
      });
      if (colour === current) return;
      current = colour;
      meta.content = colour;
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };

    pick();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Меню открывается без скролла, поэтому одних событий прокрутки мало.
    // Следим только за составом узлов: правки inline-стилей (их на скролле
    // много) сюда не долетают.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (meta) meta.content = initial;
    };
  }, []);

  return null;
}
