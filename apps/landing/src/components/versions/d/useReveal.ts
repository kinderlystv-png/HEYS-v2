'use client';

import { useEffect, type RefObject } from 'react';

// useReveal — появление блоков при прокрутке для версии D.
//
// Механизм намеренно «отказоустойчивый в открытую». В прототипе дизайнера этот
// эффект дважды ломался одинаково: элементы прячутся сразу, а показываются по
// сигналу (`scroll`, затем `IntersectionObserver`), которого в части окружений
// не приходит, — и контент оставался невидимым навсегда. Здесь три страховки:
//
//   1. Прячем только то, что на момент монтирования УЖЕ ниже вьюпорта. Всё
//      видимое остаётся видимым, поэтому первый экран не моргает, а страница
//      без JS (SSR-разметка) читается целиком.
//   2. Показ идёт по опросу геометрии раз в 250 мс, а не по событию. Опрос
//      сам останавливается, когда прятать больше нечего.
//   3. Любая ошибка внутри цикла и общий предохранитель на 3 с показывают всё.
//
// `prefers-reduced-motion` отключает эффект целиком.

const REVEAL_ATTR = 'data-reveal';
const POLL_MS = 250;
const FAILSAFE_MS = 3000;
/** Доля вьюпорта, ниже которой блок считается «доехавшим» до зрителя. */
const VISIBLE_RATIO = 0.94;
const TRANSITION =
  'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)';

export default function useReveal(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>(`[${REVEAL_ATTR}]`));
    if (nodes.length === 0) return;

    let poll = 0;
    let failsafe = 0;
    let scrollFrame = 0;

    // Прокрутка дёргает тот же проход, что крутится по таймеру: без этого при
    // быстрой прокрутке блок появлялся с задержкой до одного тика (250 мс) — он
    // уже в кадре, а всё ещё прозрачный. Объявлено функцией, а не константой:
    // снять слушатель нужно и в аварийном пути `showAll`, который стоит выше.
    function handleScroll() {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        sweep();
      });
    }

    function stopScrollWatch() {
      window.removeEventListener('scroll', handleScroll);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    }

    const show = (el: HTMLElement) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    };

    const showAll = () => {
      window.clearInterval(poll);
      window.clearTimeout(failsafe);
      stopScrollWatch();
      for (const el of nodes) show(el);
    };

    // Предохранитель вооружается ДО того, как что-то спрятано: если следующий
    // блок кода упадёт на любом шаге, контент всё равно окажется на экране.
    failsafe = window.setTimeout(showAll, FAILSAFE_MS);

    let pending: HTMLElement[] = [];
    try {
      for (const el of nodes) {
        const top = el.getBoundingClientRect().top;
        if (top < window.innerHeight * VISIBLE_RATIO) {
          show(el);
          continue;
        }
        el.style.opacity = '0';
        el.style.transform = 'translateY(26px)';
        el.style.transition = TRANSITION;
        el.style.willChange = 'opacity, transform';
        pending.push(el);
      }
    } catch {
      showAll();
      return;
    }

    if (pending.length === 0) {
      window.clearTimeout(failsafe);
      return;
    }

    const sweep = () => {
      try {
        const limit = window.innerHeight * VISIBLE_RATIO;
        pending = pending.filter((el) => {
          if (el.getBoundingClientRect().top >= limit) return true;
          show(el);
          return false;
        });
        if (pending.length === 0) {
          window.clearInterval(poll);
          window.clearTimeout(failsafe);
          stopScrollWatch();
        }
      } catch {
        showAll();
      }
    };

    poll = window.setInterval(sweep, POLL_MS);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(failsafe);
      stopScrollWatch();
    };
  }, [rootRef]);
}
