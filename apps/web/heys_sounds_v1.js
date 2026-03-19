/**
 * HEYS Sounds Module v1 — Bridge layer
 * Делегирует все звуки в HEYS.audio (heys_audio_v1.js).
 * Старый API (HEYS.sounds.play/pop/ding/success/warning/whoosh) полностью сохранён.
 *
 * @file heys_sounds_v1.js
 * @version 2.0.0 (bridge)
 */
(function(global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // Маппинг старых типов → новые события HEYS.audio
  const TYPE_TO_EVENT = {
    pop:     'adviceAppear',
    ding:    'adviceAppear',
    success: 'success',
    achievement: 'achievementUnlocked',
    warning: 'caution',
    whoosh:  'adviceDismiss'
  };

  function play(type) {
    const audio = HEYS.audio;
    if (!audio) return;

    const event = TYPE_TO_EVENT[type] || TYPE_TO_EVENT['pop'];
    audio.play(event);
  }

  HEYS.sounds = {
    play,
    isEnabled: () => HEYS.audio?.isEnabled?.() ?? true,
    // Алиасы для обратной совместимости
    pop:     () => play('pop'),
    ding:    () => play('ding'),
    success: () => play('success'),
    warning: () => play('warning'),
    whoosh:  () => play('whoosh')
  };

  console.info('[HEYS.sounds] ✅ Bridge to HEYS.audio loaded');

})(typeof window !== 'undefined' ? window : global);
