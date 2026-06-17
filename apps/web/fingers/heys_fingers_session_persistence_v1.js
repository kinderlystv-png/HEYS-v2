// heys_fingers_session_persistence_v1.js — тонкая обёртка над kernel activeSession.
//
// Generic-машинерия snapshot активной сессии (debounced save / stale-check /
// multi-tab race guard / detectOnBoot / client-scoped LS-ключ / flushSync на
// unload) вынесена в HEYS.TrainingKernel.activeSession (Этап 3 унификации
// запуска). Здесь — доменная конфигурация: keySuffix + 24h stale.
//
// Public API (неизменён): HEYS.Fingers.persistence.{save,load,clear,
//   clearForTraining,detectOnBoot}; LS-key `heys_<cid>_finger_active_session`
//   (или `heys_finger_active_session` для anonymous). Back-compat __-хелперы
//   (__getKey/__isActiveSessionKey/__STALE_THRESHOLD_MS) отдаёт ядро.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.persistence && Fingers.persistence.__registered) return;

  const TK = HEYS.TrainingKernel;
  if (!TK || !TK.activeSession || typeof TK.activeSession.create !== 'function') {
    console.warn('[Fingers.persistence] HEYS.TrainingKernel.activeSession недоступен — kernel-бандл не загружен до fingers persistence');
    return;
  }

  // Stale 24h: если закрыл вечером, открыл утром — snapshot ещё не «забыт»;
  // UI отдельно показывает «давно открыта» для snapshots старше 1h.
  const store = TK.activeSession.create({
    keySuffix: 'finger_active_session',
    staleMs: 24 * 60 * 60 * 1000,
    debounceMs: 250
  });
  store.__registered = true;

  Fingers.persistence = store;
})(typeof window !== 'undefined' ? window : globalThis);
