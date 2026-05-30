// heys_platform_features_v1.js — Централизованный feature detection.
//
// Wave 2-C (Fingers training): первый файл в loader chain для модуля Fingers.
// Используется audio extension, timer (wakeLock), persistence (serviceWorker),
// calibration (audioContext), и future Bluetooth (Tindeq) / Web Push / Voice.
//
// Public API:
//   HEYS.features.<name>           — boolean, true если фича доступна в runtime
//   HEYS.features.assert(name,msg) — throws Error если фича отсутствует
//
// Все детекты — runtime-safe: ловят отсутствие window/navigator/SyncManager
// (Node/SSR/worker контексты).
//
// Идемпотентен: повторная загрузка скрипта не перезаписывает уже посчитанные
// флаги (полезно при HMR или сторонней перезагрузке).

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  if (HEYS.features && HEYS.features.__registered) return;

  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';

  const features = {
    wakeLock: hasNavigator && 'wakeLock' in navigator,
    webPush: typeof PushManager !== 'undefined',
    webBluetooth: hasNavigator && 'bluetooth' in navigator,
    speechSynthesis: hasWindow && 'speechSynthesis' in window,
    vibration: hasNavigator && typeof navigator.vibrate === 'function',
    serviceWorker: hasNavigator && 'serviceWorker' in navigator,
    backgroundSync: hasWindow && 'SyncManager' in window,
    audioContext: hasWindow && ('AudioContext' in window || 'webkitAudioContext' in window),
  };

  /**
   * Throws Error если фича недоступна — используется в критичных точках,
   * где graceful fallback невозможен. Для opt-in флоу предпочитай явный
   * `if (HEYS.features.<name>)` без throw.
   */
  function assert(featureName, message) {
    if (!features[featureName]) {
      const msg = message || `[HEYS.features] Required platform feature unavailable: ${featureName}`;
      throw new Error(msg);
    }
    return true;
  }

  features.assert = assert;
  Object.defineProperty(features, '__registered', { value: true, enumerable: false });

  HEYS.features = features;
})(typeof window !== 'undefined' ? window : globalThis);
