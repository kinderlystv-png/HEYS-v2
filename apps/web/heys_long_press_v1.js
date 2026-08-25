/**
 * HEYS Long Press v1 — единый порог удержания на продукт.
 *
 * Контракт: home-widgets.v4.dc.html, «долгое нажатие · правило продукта».
 * Порог один — 350 мс, минимум 250. Перетаскивание виджетов в режиме
 * расстановки — без удержания (см. heys_widgets_variants_v4.js).
 *
 * @file heys_long_press_v1.js
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  HEYS.longPress = Object.freeze({
    MS: 350,
    MIN_MS: 250,
  });
})(typeof window !== 'undefined' ? window : globalThis);
