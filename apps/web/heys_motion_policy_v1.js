/**
 * HEYS Motion Policy v1 — единая точка правды для prefers-reduced-motion.
 *
 * Два яруса:
 * - decorative (по умолчанию): глобальный killer в heys-components.css
 * - functional: класс animate-always на корне анимированного поддерева
 *
 * @see docs/implementation/MOTION_POLICY.md
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  const FUNCTIONAL_ROOT_CLASS = 'animate-always';
  const REDUCE_FAST_CLASS = 'motion-reduce-fast';

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_error) {
      return false;
    }
  }

  /** Функциональные анимации (смена дня, ответ на жест) — не гасим по ОС. */
  function functionalAnimationsEnabled() {
    return true;
  }

  /** Декоративные анимации — уважаем ОС (глобальный CSS без animate-always). */
  function decorativeAnimationsEnabled() {
    return !prefersReducedMotion();
  }

  function withFunctionalClass(className) {
    const base = String(className || '').trim();
    if (!base) return FUNCTIONAL_ROOT_CLASS;
    return base.split(/\s+/).includes(FUNCTIONAL_ROOT_CLASS)
      ? base
      : `${base} ${FUNCTIONAL_ROOT_CLASS}`;
  }

  HEYS.motion = Object.freeze({
    FUNCTIONAL_ROOT_CLASS,
    REDUCE_FAST_CLASS,
    prefersReducedMotion,
    functionalAnimationsEnabled,
    decorativeAnimationsEnabled,
    withFunctionalClass,
  });
})(typeof window !== 'undefined' ? window : globalThis);
