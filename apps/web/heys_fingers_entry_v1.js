// heys_fingers_entry_v1.js — Точка входа модуля «Тренировка пальцев» (climbing fingerboard).
// Wave 1: stub-регистрация namespace HEYS.Fingers + public API openFullscreen().
// Wave 3 заменит inner-rendering на полноценный full-screen portal (heys_fingers_fullscreen_v1.js).
//
// Контракт public API:
//   HEYS.Fingers.openFullscreen({ dateKey, trainingIndex, mode })
//     dateKey:        ISO 'YYYY-MM-DD' дата дневника
//     trainingIndex:  индекс тренировки в day.trainings[]
//     mode:           'new' | 'view' | 'continue' | 'edit'
//
// Reuse-зависимости (resolved at runtime, не загружаемые на момент Wave 1):
//   HEYS.Fingers.Fullscreen      — Wave 3 portal orchestrator
//   HEYS.Fingers.SessionUI       — Wave 3 main UI
//   HEYS.Fingers.Onboarding      — Wave 3 wizard
//   HEYS.TrainingStep.saveFingers — Wave 1 persistence wrapper (готов)
//
// Lifecycle:
//   * Wave 1: stub — logs invocation, no UI.
//   * Wave 3: mounts FingersFullscreen portal, routing на Onboarding/SessionUI по флагу.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__entryRegistered) return; // idempotent
  Fingers.__entryRegistered = true;

  Fingers.openFullscreen = function openFullscreen(opts) {
    const o = opts || {};
    // Wave 1: stub diagnostic + graceful fallback if Wave 3 not loaded yet.
    if (typeof Fingers.Fullscreen === 'function') {
      // Wave 3 lifecycle (будет реализовано):
      // Fingers.Fullscreen.mount(o);
      return;
    }
    // Wave 1 fallback — show user-visible toast or alert so handoff не «съедает» click silently.
    const msg = '🤚 Тренировка пальцев — модуль ещё не загружен (Wave 3).';
    try {
      if (HEYS.Toast?.info) HEYS.Toast.info(msg);
      else if (HEYS.Toast?.show) HEYS.Toast.show(msg);
      else console.info('[Fingers]', msg, o);
    } catch (_) {
      console.info('[Fingers]', msg, o);
    }
  };

  Fingers.close = function close() {
    if (typeof Fingers.Fullscreen?.unmount === 'function') {
      Fingers.Fullscreen.unmount();
    }
  };

  // Diagnostic: ready-state check for other modules.
  Fingers.isReady = function isReady() {
    return typeof Fingers.Fullscreen === 'function';
  };
})(typeof window !== 'undefined' ? window : globalThis);
