// heys_fingers_audio_extension_v1.js — Fingers-specific audio cues.
//
// HEYS.audio (heys_audio_v1.js) — категории захардкожены в SYNTH registry,
// publicного registerSynth API нет. Поэтому регистрируем свои beep'ы как
// HEYS.Fingers.playFingerSound('fingerStart'|'fingerRelease') через
// собственный lazy AudioContext (reuse pattern из heys_day_trainings_v1.js).
//
// Public API:
//   HEYS.Fingers.playFingerSound(type)
//     type = 'fingerStart'   → 1200Hz beep 120ms (T-0 HANG)
//     type = 'fingerRelease' → descending 1200→400Hz 200ms (конец виса)
//
// Respects HEYS.audio settings: если audio muted / quiet hours active / tab
// hidden → silently skip. Vibration goes through HEYS.audio.haptic если
// есть, иначе navigator.vibrate напрямую.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__audioExtensionRegistered) return;
  Fingers.__audioExtensionRegistered = true;

  // ─── Lazy AudioContext (изолирован от HEYS.audio internal _audioCtx) ───
  let _audioCtx = null;
  function _getAudioCtx() {
    if (_audioCtx && _audioCtx.state !== 'closed') return _audioCtx;
    try {
      const Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor) return null;
      _audioCtx = new Ctor();
    } catch (_e) {
      _audioCtx = null;
    }
    return _audioCtx;
  }

  // ─── Settings gate: уважаем HEYS.audio masterEnabled / quietHours ───
  function _shouldPlaySound() {
    try {
      if (HEYS.audio?.isEnabled && !HEYS.audio.isEnabled()) return false;
      const settings = HEYS.audio?.getSettings?.();
      if (settings && settings.masterEnabled === false) return false;
      // Hidden tab — не звучим (timer всё равно tик'ает в фоне minimally).
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    } catch (_e) { /* on error — proceed with default-on */ }
    return true;
  }

  function _vibrate(pattern) {
    try {
      if (HEYS.audio?.haptic) {
        HEYS.audio.haptic(pattern);
        return;
      }
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (_e) { /* swallow */ }
  }

  // ─── Synth: fingerStart (1200Hz beep) ───
  function _synthFingerStart(ctx) {
    const now = ctx.currentTime;
    const dur = 0.12;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // ─── Synth: fingerRelease (descending sweep) ───
  function _synthFingerRelease(ctx) {
    const now = ctx.currentTime;
    const dur = 0.2;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  const SYNTHS = {
    fingerStart: _synthFingerStart,
    fingerRelease: _synthFingerRelease,
  };

  const HAPTICS = {
    fingerStart: [80, 60, 80],
    fingerRelease: [40],
  };

  /**
   * Play a fingers-specific cue. Safe to call в любом state (silent fallback
   * если AudioContext/vibrate недоступны). Не должен бросать exceptions —
   * аудио никогда не блокирует timer.
   */
  function playFingerSound(type) {
    const synth = SYNTHS[type];
    if (!synth) {
      console.warn('[HEYS.Fingers.audio] Unknown sound type:', type);
      return;
    }

    // Haptic — even в quiet hours (тактильно, не разбудит)
    _vibrate(HAPTICS[type] || [20]);

    if (!_shouldPlaySound()) return;

    try {
      const ctx = _getAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        try { ctx.resume(); } catch (_e) { /* noop */ }
      }
      synth(ctx);
    } catch (e) {
      console.warn('[HEYS.Fingers.audio] Synth error:', type, e);
    }
  }

  Fingers.playFingerSound = playFingerSound;
})(typeof window !== 'undefined' ? window : globalThis);
