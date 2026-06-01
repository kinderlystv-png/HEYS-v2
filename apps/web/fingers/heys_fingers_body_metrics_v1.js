// heys_fingers_body_metrics_v1.js — единый источник истины для body metrics в fingers.
// Wave 6 P1 (2026-06-01). Закрывает дыру где constructor:424 читал HEYS.user.weightKg
// (поле, которого нет в кодовой базе) → у 100% юзеров MVC% считался с дефолтом 70кг
// независимо от реального веса. Канонический путь в HEYS — heys_profile.weight (или
// baseWeight как альтернативный alias из user_tab_impl_v1.js:798/816/838).
//
// Public API:
//   HEYS.Fingers.getBodyWeight() → { kg:number, source:'profile'|'baseWeight'|'fallback' }
//     - 'profile'    — взяли profile.weight
//     - 'baseWeight' — взяли profile.baseWeight (legacy alias)
//     - 'fallback'   — оба отсутствуют, вернули 70 (caller должен показать warning)
//
// Зачем разделять source: caller (renderMvcHint) при fallback показывает CTA
// «укажи вес в профиле для точного %», иначе юзер видит цифру и думает что она
// персонализирована.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__bodyMetricsRegistered) return; // idempotent
  Fingers.__bodyMetricsRegistered = true;

  const FALLBACK_KG = 70;

  function readProfile() {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsGet === 'function') return u.lsGet('heys_profile', {}) || {};
    } catch (_) { /* noop */ }
    return {};
  }

  /**
   * @returns {{kg:number, source:'profile'|'baseWeight'|'fallback'}}
   */
  function getBodyWeight() {
    const p = readProfile();
    const w = Number(p && p.weight);
    if (Number.isFinite(w) && w > 0) return { kg: w, source: 'profile' };
    const bw = Number(p && p.baseWeight);
    if (Number.isFinite(bw) && bw > 0) return { kg: bw, source: 'baseWeight' };
    return { kg: FALLBACK_KG, source: 'fallback' };
  }

  Fingers.getBodyWeight = getBodyWeight;
  Fingers.bodyMetrics = { getBodyWeight: getBodyWeight, FALLBACK_KG: FALLBACK_KG };
})(typeof window !== 'undefined' ? window : globalThis);
