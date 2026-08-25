/**
 * HEYS Sounds Module v1 — совместимость со старым API.
 *
 * Звуков в продукте два — капля воды и звук совета (строка контракта
 * «звук · правило продукта», home-widgets.v4.dc.html). Старый словарь
 * `pop / ding / success / achievement / warning / whoosh` описывал шесть, и
 * пять из них контракт снял: успех, достижение, предупреждение и «уход»
 * карточки звука не имеют.
 *
 * Модуль оставлен мостом, чтобы забытый вызов из старого кода не падал; играет
 * он только звук совета и только через единственную политику `HEYS.feedback`.
 *
 * @file heys_sounds_v1.js
 * @version 3.0.0 (сведён к политике отклика)
 */
(function(global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // Появление совета — единственный из старых типов, у которого звук остался.
  const ADVICE_TYPES = new Set(['pop', 'ding']);

  function play(type) {
    if (!ADVICE_TYPES.has(type)) return;
    HEYS.feedback?.emit?.('advice.shown');
  }

  HEYS.sounds = {
    play,
    isEnabled: () => HEYS.audio?.isEnabled?.() ?? true,
    pop: () => play('pop'),
    ding: () => play('ding'),
    success: () => { },
    warning: () => { },
    whoosh: () => { }
  };

  console.info('[HEYS.sounds] ✅ Мост к политике отклика (звук совета)');

})(typeof window !== 'undefined' ? window : global);
