/**
 * HEYS Unified Audio Module v1
 * Единый движок звука и вибрации для всего приложения.
 *
 * API:
 *   HEYS.audio.play(eventOrCategory)  — воспроизвести звук + вибрацию по событию
 *   HEYS.audio.haptic(pattern)        — только вибрация (массив ms)
 *   HEYS.audio.preview(category)      — превью звука для настроек (игнорирует тихие часы)
 *   HEYS.audio.getSettings()          — текущие настройки
 *   HEYS.audio.saveSettings(updates)  — сохранить настройки (перезаписывает частично)
 *   HEYS.audio.isEnabled()            — true если masterEnabled
 *   HEYS.audio.EVENTS                 — карта всех событий → категории (freeze)
 *   HEYS.audio.CATEGORIES             — список категорий (freeze)
 *
 * Kill switch: localStorage.setItem('heys_audio_disabled', 'true')
 *
 * @file heys_audio_v1.js
 * @version 1.0.0
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // ─── Kill switch ──────────────────────────────────────────────────────────
  if (localStorage.getItem('heys_audio_disabled') === 'true') {
    HEYS.audio = {
      play: () => {},
      haptic: () => {},
      preview: () => {},
      isEnabled: () => false,
      getSettings: () => ({ masterEnabled: false }),
      saveSettings: () => {},
      invalidateSettings: () => {},
      EVENTS: Object.freeze({}),
      CATEGORIES: Object.freeze([])
    };
    console.info('[HEYS.audio] ⚠️ Disabled via kill switch');
    return;
  }

  // ─── Defaults ─────────────────────────────────────────────────────────────
  const DEFAULT_SETTINGS = {
    masterEnabled: true,
    volume: 0.12,
    hapticEnabled: true,
    quietHoursEnabled: true,
    quietStart: 23,
    quietEnd: 7
  };

  const SETTINGS_KEY = 'heys_audio_settings';

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // ─── Settings ─────────────────────────────────────────────────────────────
  let _settings = null;

  function _lsGet(key, fallback) {
    try {
      const fn = HEYS.utils?.lsGet;
      if (fn) return fn(key, fallback);
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  }

  function _lsSet(key, value) {
    try {
      const fn = HEYS.utils?.lsSet;
      if (fn) { fn(key, value); return; }
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
  }

  function loadSettings() {
    if (_settings) return _settings;

    const raw = _lsGet(SETTINGS_KEY, null);
    if (raw && typeof raw === 'object') {
      _settings = Object.assign({}, DEFAULT_SETTINGS, raw);
      if (hasOwn(_settings, 'enabled') && !hasOwn(_settings, 'masterEnabled')) {
        _settings.masterEnabled = _settings.enabled !== false;
      }
      return _settings;
    }

    // First launch — migrate from legacy keys
    _settings = Object.assign({}, DEFAULT_SETTINGS);

    try {
      // heys_sound_enabled (heys_day_sound_v1)
      const soundEnabled = _lsGet('heys_sound_enabled', null);
      if (soundEnabled === false) _settings.masterEnabled = false;

      // heys_sound_settings (heys_gamification_v1)
      const soundSettings = _lsGet('heys_sound_settings', null);
      if (soundSettings) {
        if (soundSettings.enabled === false) _settings.masterEnabled = false;
        if (typeof soundSettings.volume === 'number') _settings.volume = soundSettings.volume;
      }

      // heys_advice_settings.soundEnabled (heys_sounds_v1)
      const adviceSettings = _lsGet('heys_advice_settings', null);
      if (adviceSettings?.soundEnabled === false) _settings.masterEnabled = false;
    } catch { /* ignore */ }

    return _settings;
  }

  function invalidateSettings() {
    _settings = null;
  }

  function saveSettings(updates) {
    const s = loadSettings();
    const normalizedUpdates = Object.assign({}, updates);
    if (hasOwn(normalizedUpdates, 'enabled') && !hasOwn(normalizedUpdates, 'masterEnabled')) {
      normalizedUpdates.masterEnabled = normalizedUpdates.enabled !== false;
      delete normalizedUpdates.enabled;
    }
    if (hasOwn(normalizedUpdates, 'soundEnabled') && !hasOwn(normalizedUpdates, 'masterEnabled')) {
      normalizedUpdates.masterEnabled = normalizedUpdates.soundEnabled !== false;
      delete normalizedUpdates.soundEnabled;
    }
    Object.assign(s, normalizedUpdates);
    _lsSet(SETTINGS_KEY, s);
    invalidateSettings();
  }

  // ─── Time checks ──────────────────────────────────────────────────────────
  function isQuietHours() {
    const s = loadSettings();
    if (!s.quietHoursEnabled) return false;
    const hour = new Date().getHours();
    const start = s.quietStart;
    const end = s.quietEnd;
    // Handles midnight wrap: e.g. 23-07
    if (start > end) return hour >= start || hour < end;
    return hour >= start && hour < end;
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch { return false; }
  }

  function prefersReducedTransparency() {
    try {
      return window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
    } catch { return false; }
  }

  function isDocumentHidden() {
    try {
      return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    } catch {
      return false;
    }
  }

  // ─── AudioContext (lazy, user-gesture-aware) ──────────────────────────────
  let _audioCtx = null;
  let _userGestured = false;

  function _markUserGesture() {
    _userGestured = true;
  }

  document.addEventListener('click', _markUserGesture, { once: true, passive: true });
  document.addEventListener('touchstart', _markUserGesture, { once: true, passive: true });
  document.addEventListener('keydown', _markUserGesture, { once: true, passive: true });

  function getCtx() {
    if (!_userGestured) return null;
    if (!_audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      try { _audioCtx = new AudioContext(); } catch { return null; }
    }
    if (_audioCtx.state === 'closed') {
      // Context was closed — create a new one
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      try { _audioCtx = new AudioContext(); } catch { return null; }
    }
    if (_audioCtx.state === 'suspended') {
      _audioCtx.resume().catch(() => {});
    }
    return _audioCtx;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!_audioCtx) return;
      if (document.visibilityState === 'hidden') {
        _audioCtx.suspend?.().catch(() => {});
        return;
      }
      if (document.visibilityState === 'visible' && _userGestured) {
        _audioCtx.resume?.().catch(() => {});
      }
    });
  }

  // ─── Haptic ────────────────────────────────────────────────────────────────
  function triggerHaptic(pattern) {
    try {
      if (HEYS.vibration?.play) {
        HEYS.vibration.play(pattern);
        return;
      }
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch { /* ignore */ }
  }

  // ─── Deduplication / cooldown ─────────────────────────────────────────────
  const _lastPlayTime = {};

  // Per-category minimum interval between plays (ms)
  const COOLDOWN = {
    triumph: 3000,
    success: 1500,
    reward: 500,
    notify: 800,
    caution: 800,
    alert: 2000,
    error: 1000,
    interaction: 100,
    dismiss: 400
  };

  function isThrottled(category) {
    const now = Date.now();
    const last = _lastPlayTime[category] || 0;
    if (now - last < (COOLDOWN[category] || 800)) return true;
    _lastPlayTime[category] = now;
    return false;
  }

  // ─── Sound synthesis functions ────────────────────────────────────────────
  // Each takes (ctx, vol) and synthesizes a sound using Web Audio API.

  function synthTriumph(ctx, vol) {
    // Epic ascending arpeggio: G4 → C5 → E5 → G5 → C6 → E6
    const notes = [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    const stagger = 0.08;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = i < 3 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * stagger;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * (1.0 - i * 0.03), t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  function synthSuccess(ctx, vol) {
    // Warm 3-note stagger: E5 + A5 + D6
    const notes = [659.25, 880.0, 1174.66];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.06;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * (0.9 - i * 0.1), t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  }

  function synthReward(ctx, vol) {
    // Quick sparkle: A5 + D6
    const notes = [880.0, 1174.66];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.04;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * (0.7 - i * 0.15), t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  function synthNotify(ctx, vol) {
    // Soft chime: F5 + C6
    const notes = [698.46, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.07;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.27);
    });
  }

  function synthCaution(ctx, vol) {
    // Descending minor: E5 → D5, triangle wave
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(659.25, ctx.currentTime);       // E5
    osc.frequency.setValueAtTime(587.33, ctx.currentTime + 0.1); // D5
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol * 0.8, ctx.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  }

  function synthAlert(ctx, vol) {
    // Tritone: F#4 + C5 — dissonant, attention-grabbing
    const freqs = [369.99, 523.25];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol * (i === 0 ? 0.9 : 0.7), ctx.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.38);
    });
  }

  function synthError(ctx, vol) {
    // Heavy descending: A3 → G3
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);       // A3
    osc.frequency.setValueAtTime(196, ctx.currentTime + 0.12); // G3
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.42);
  }

  function synthInteraction(ctx, vol) {
    // Subtle tap: 800 → 600 Hz, 60ms
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(vol * 0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.07);
  }

  function synthDismiss(ctx, vol) {
    // Filtered sawtooth whoosh: 200 → 50 Hz
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(vol * 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.17);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  // ─── Category registry ────────────────────────────────────────────────────
  const SYNTH = {
    triumph: synthTriumph,
    success: synthSuccess,
    reward: synthReward,
    notify: synthNotify,
    caution: synthCaution,
    alert: synthAlert,
    error: synthError,
    interaction: synthInteraction,
    dismiss: synthDismiss
  };

  // Haptic pattern per category
  const HAPTIC_PATTERN = {
    triumph:     [50, 50, 50, 50, 50, 50, 200],
    success:     [50, 30, 50],
    reward:      [20],
    notify:      [15],
    caution:     [40, 20, 40],
    alert:       [200, 100, 200],
    error:       [100, 50, 100, 50, 100],
    interaction: [5],
    dismiss:     [15]
  };

  // ─── Event → category map ─────────────────────────────────────────────────
  // null = haptic-only, no sound
  const EVENT_MAP = {
    // Triumph
    rankCeremony:        'triumph',
    levelUp:             'triumph',
    allMissionsComplete: 'triumph',
    achievementUnlocked: 'triumph',

    // Success
    missionComplete:     'success',
    calorieGoalReached:  'success',
    supplementsComplete: 'success',

    // Reward
    xpGained:            'reward',
    foodAdded:           'reward',

    // Notify
    adviceAppear:        'notify',

    // Caution
    foodAddedModerate:   'caution',

    // Alert
    foodAddedHarmful:    'alert',

    // Error
    error:               'error',

    // Interaction
    buttonTap:           'interaction',

    // Dismiss
    adviceDismiss:       'dismiss',

    // Water: haptic-only (too frequent for sound)
    waterAdded:          null
  };

  function toPublicSettings(settings) {
    return {
      masterEnabled: settings.masterEnabled !== false,
      enabled: settings.masterEnabled !== false,
      volume: settings.volume,
      hapticEnabled: settings.hapticEnabled !== false,
      quietHoursEnabled: settings.quietHoursEnabled !== false,
      quietStart: settings.quietStart,
      quietEnd: settings.quietEnd
    };
  }

  function canPlay(eventOrCategory, options) {
    const s = loadSettings();
    if (!s.masterEnabled) return false;

    const cat = hasOwn(EVENT_MAP, eventOrCategory)
      ? EVENT_MAP[eventOrCategory]
      : eventOrCategory;

    if (cat === null) {
      return s.hapticEnabled && !prefersReducedMotion() && !isDocumentHidden();
    }

    if (!cat || !SYNTH[cat]) return false;
    if (isDocumentHidden() && options?.allowInBackground !== true) return false;
    if (isQuietHours() && options?.ignoreQuietHours !== true) return false;
    if (prefersReducedTransparency() && cat === 'interaction') return false;
    return !prefersReducedMotion();
  }

  // ─── Core play ────────────────────────────────────────────────────────────
  function play(eventOrCategory, options) {
    const s = loadSettings();
    if (!s.masterEnabled) return;

    const cat = hasOwn(EVENT_MAP, eventOrCategory)
      ? EVENT_MAP[eventOrCategory]
      : eventOrCategory;

    const hidden = isDocumentHidden();
    if (hidden && options?.allowInBackground !== true) {
      console.info('[HEYS.audio] ⏸ skipped in hidden tab:', eventOrCategory);
      return;
    }

    // null category = haptic-only event
    if (cat === null) {
      if (s.hapticEnabled && !prefersReducedMotion()) triggerHaptic([20]);
      return;
    }

    if (!cat || !SYNTH[cat]) {
      console.warn('[HEYS.audio] Unknown event/category:', eventOrCategory);
      return;
    }

    if (isThrottled(cat)) return;

    // Haptic — never muted by quiet hours
    const doHaptic = options?.haptic !== false;
    if (doHaptic && s.hapticEnabled && !prefersReducedMotion()) {
      triggerHaptic(HAPTIC_PATTERN[cat] || [20]);
    }

    // Sound — muted in quiet hours and when prefers-reduced-motion
    if ((!isQuietHours() || options?.ignoreQuietHours === true) && !prefersReducedMotion()) {
      const ctx = getCtx();
      if (ctx) {
        const vol = typeof options?.volume === 'number' ? options.volume : s.volume;
        try {
          SYNTH[cat](ctx, vol);
        } catch (e) {
          console.warn('[HEYS.audio] Synthesis error:', cat, e);
        }
      }
    }

    console.info('[HEYS.audio] ▶ play:', eventOrCategory, '->', cat);
  }

  // ─── Haptic-only helper ───────────────────────────────────────────────────
  function haptic(pattern) {
    const s = loadSettings();
    if (!s.masterEnabled || !s.hapticEnabled || prefersReducedMotion() || isDocumentHidden()) return;
    triggerHaptic(Array.isArray(pattern) ? pattern : [pattern]);
  }

  // ─── Preview (for settings UI, skips quiet hours) ─────────────────────────
  function preview(category) {
    const s = loadSettings();
    if (!s.masterEnabled) return;

    // Validate category
    const cat = SYNTH[category] ? category : EVENT_MAP[category];
    if (!cat || !SYNTH[cat]) return;

    // Play haptic
    if (s.hapticEnabled && !prefersReducedMotion()) {
      triggerHaptic(HAPTIC_PATTERN[cat] || [20]);
    }

    // Play sound regardless of quiet hours
    if (!prefersReducedMotion()) {
      const ctx = getCtx();
      if (ctx) {
        try {
          SYNTH[cat](ctx, s.volume);
        } catch (e) {
          console.warn('[HEYS.audio] Preview error:', cat, e);
        }
      }
    }

    console.info('[HEYS.audio] 🎵 preview:', category, '->', cat);
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  HEYS.audio = {
    play,
    playCategory: play,
    haptic,
    preview,
    testCategory: preview,
    canPlay,
    stopAll: () => {
      if (_audioCtx?.close) {
        _audioCtx.close().catch(() => {});
        _audioCtx = null;
      }
      if (HEYS.vibration?.stop) {
        HEYS.vibration.stop();
      } else {
        navigator.vibrate?.(0);
      }
    },
    isEnabled: () => loadSettings().masterEnabled,
    getSettings: () => toPublicSettings(loadSettings()),
    saveSettings,
    setSettings: saveSettings,
    invalidateSettings,
    EVENTS: Object.freeze(Object.assign({}, EVENT_MAP)),
    CATEGORIES: Object.freeze(Object.keys(SYNTH))
  };

  console.info('[HEYS.audio] ✅ Unified audio module loaded (v1.0.0)');

})(typeof window !== 'undefined' ? window : global);
