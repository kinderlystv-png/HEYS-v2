// heys_mobility_voice_v1.js — RU voice coach for guided Mobility sessions.
//
// Mirrors the Fingers voice API shape, but keeps mobility-specific phrases and
// settings isolated under HEYS.Mobility.voice.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};
  if (Mobility.voice__registered) return;
  Mobility.voice__registered = true;

  const SETTINGS_KEY = 'heys_mobility_voice_settings_v1';
  const DEFAULT_SETTINGS = {
    enabled: true,
    volume: 0.8,
    speed: 1.0
  };

  const BASE_PHRASES = [
    { id: 'cue.start_session', text: 'Начинаем. Двигайся спокойно, без боли.' },
    { id: 'cue.session_done', text: 'Сессия завершена. Выходи из положения медленно.' },
    { id: 'cue.session_aborted', text: 'Тренировка прервана. Прогресс сохранён.' },
    { id: 'cue.prep', text: 'Подготовка. Займи позицию и проверь дыхание.' },
    { id: 'cue.work', text: 'Работа. Плавный темп, контроль амплитуды.' },
    { id: 'cue.reps', text: 'Повторы. Двигайся ровно, без рывков.' },
    { id: 'cue.hold', text: 'Удержание. Натяжение умеренное, без боли.' },
    { id: 'cue.smr', text: 'Самомассаж. Давление мягкое, не по кости.' },
    { id: 'cue.breath', text: 'Дыхание. Мягкий вдох, длинный выдох.' },
    { id: 'cue.rest_start', text: 'Отдых. Расслабь плечи и челюсть.' },
    { id: 'cue.next_step', text: 'Следующее упражнение.' },
    { id: 'cue.paused', text: 'Пауза.' },
    { id: 'cue.resumed', text: 'Продолжаем.' },
    { id: 'cue.pain', text: 'Боль отмечена. Уменьши амплитуду или остановись.' }
  ];

  const PHRASE_BY_ID = {};
  BASE_PHRASES.forEach(function (p) { PHRASE_BY_ID[p.id] = p; });

  function loadSettings() {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        const v = HEYS.utils.lsGet(SETTINGS_KEY, null);
        if (v && typeof v === 'object') return Object.assign({}, DEFAULT_SETTINGS, v);
      }
      const raw = global.localStorage && global.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw) || {});
    } catch (_) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(s) {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        HEYS.utils.lsSet(SETTINGS_KEY, s);
      }
    } catch (_) {}
  }

  function hasRuVoice() {
    if (typeof global.speechSynthesis === 'undefined') return false;
    try {
      const voices = global.speechSynthesis.getVoices();
      if (!voices || !voices.length) return false;
      return voices.some(function (v) { return v && v.lang && v.lang.toLowerCase().indexOf('ru') === 0; });
    } catch (_) {
      return false;
    }
  }

  function substituteText(text, vars) {
    if (!vars || typeof text !== 'string') return text;
    return text.replace(/\{(\w+)\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  function playTts(text, opts) {
    return new Promise(function (resolve) {
      if (typeof global.speechSynthesis === 'undefined' || typeof global.SpeechSynthesisUtterance === 'undefined') {
        resolve(false);
        return;
      }
      if (!hasRuVoice()) {
        try { console.debug('[Mobility.voice] TTS skipped — no ru-RU voice available'); } catch (_) {}
        resolve(false);
        return;
      }
      try {
        const u = new global.SpeechSynthesisUtterance(text);
        u.lang = 'ru-RU';
        u.volume = Math.max(0, Math.min(1, opts.volume));
        u.rate = Math.max(0.8, Math.min(1.2, opts.speed));
        u.onend = function () { resolve(true); };
        u.onerror = function () { resolve(false); };
        if (opts.signal) {
          opts.signal.addEventListener('abort', function () {
            try { global.speechSynthesis.cancel(); } catch (_) {}
            resolve(false);
          }, { once: true });
        }
        const voices = global.speechSynthesis.getVoices();
        const ru = voices && voices.find(function (v) { return v.lang && v.lang.toLowerCase().indexOf('ru') === 0; });
        if (ru) u.voice = ru;
        global.speechSynthesis.speak(u);
      } catch (_) {
        resolve(false);
      }
    });
  }

  let settings = loadSettings();
  let queue = Promise.resolve();
  const voice = Mobility.voice = {};

  voice.PHRASE_BANK = BASE_PHRASES.slice();
  voice.PHRASE_BY_ID = PHRASE_BY_ID;
  voice.getSettings = function () { return Object.assign({}, settings); };
  voice.setEnabled = function (b) { settings.enabled = !!b; saveSettings(settings); };
  voice.setVolume = function (v) { settings.volume = Math.max(0, Math.min(1, Number(v) || 0)); saveSettings(settings); };
  voice.setSpeed = function (v) { settings.speed = Math.max(0.8, Math.min(1.2, Number(v) || 1)); saveSettings(settings); };
  voice.isAvailable = function () { return typeof global.speechSynthesis !== 'undefined' ? 'tts' : 'none'; };
  voice.stopAll = function () {
    try {
      if (global.speechSynthesis && global.speechSynthesis.cancel) global.speechSynthesis.cancel();
    } catch (_) {}
  };
  voice.clearAudioCache = function () { voice.stopAll(); };
  voice.getAudioCacheSize = function () { return 0; };
  voice.waitForQueue = function () { return queue; };
  voice.say = function (cueId, opts) {
    const job = queue.then(function () { return doSay(cueId, opts); }).catch(function () {});
    queue = job;
    return job;
  };

  async function doSay(cueId, opts) {
    if (!settings.enabled) return false;
    const o = opts || {};
    const phrase = PHRASE_BY_ID[cueId];
    const text = substituteText(phrase ? phrase.text : cueId, o.vars);
    if (!text) return false;
    return playTts(text, {
      volume: typeof o.volume === 'number' ? o.volume : settings.volume,
      speed: typeof o.speed === 'number' ? o.speed : settings.speed,
      signal: o.signal || null
    });
  }

  const R = global.React || null;
  if (R && R.createElement) {
    Mobility.VoiceMiniControls = function MobilityVoiceMiniControls(props) {
      const inline = !!(props && props.inline);
      const initial = voice.getSettings();
      const [open, setOpen] = R.useState(false);
      const [enabled, setEnabledLocal] = R.useState(initial.enabled !== false);
      const [vol, setVolLocal] = R.useState(typeof initial.volume === 'number' ? initial.volume : 0.8);

      function applyEnabled(b) {
        setEnabledLocal(b);
        try { voice.setEnabled(b); } catch (_) {}
      }
      function applyVolume(v) {
        const clamped = Math.max(0, Math.min(1, Number(v) || 0));
        setVolLocal(clamped);
        try { voice.setVolume(clamped); } catch (_) {}
      }
      function icon() {
        return R.createElement('svg', { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
          R.createElement('path', { d: 'M4 9v6h3l5 4V5L7 9H4z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }),
          enabled && vol > 0.05 ? R.createElement('path', { d: 'M15 9.5c.8.8 1.2 1.6 1.2 2.5s-.4 1.7-1.2 2.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }) : null,
          enabled && vol > 0.45 ? R.createElement('path', { d: 'M17.4 7.2c1.4 1.4 2.1 3 2.1 4.8s-.7 3.4-2.1 4.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }) : null,
          !enabled ? R.createElement('path', { d: 'M16 9l5 5M21 9l-5 5', fill: 'none', stroke: '#dc2626', strokeWidth: 1.8, strokeLinecap: 'round' }) : null
        );
      }

      return R.createElement('div', { className: 'mobility-voice-mini' + (inline ? ' is-inline' : '') + (open ? ' is-open' : '') },
        R.createElement('button', {
          type: 'button',
          className: 'mobility-voice-mini__btn',
          'aria-label': enabled ? 'Голос: включен. Изменить громкость' : 'Голос: выключен. Изменить',
          'aria-expanded': open ? 'true' : 'false',
          onClick: function () { setOpen(function (v) { return !v; }); }
        }, icon()),
        open ? R.createElement('div', { className: 'mobility-voice-mini__pop', role: 'dialog', 'aria-label': 'Настройки голоса' },
          R.createElement('label', { className: 'mobility-voice-mini__row' },
            R.createElement('span', { className: 'mobility-voice-mini__label' }, 'Голосовое сопровождение'),
            R.createElement('input', {
              type: 'checkbox',
              className: 'mobility-voice-mini__toggle',
              checked: enabled,
              onChange: function (e) { applyEnabled(!!e.target.checked); }
            })
          ),
          R.createElement('label', { className: 'mobility-voice-mini__row mobility-voice-mini__row--volume' },
            R.createElement('span', { className: 'mobility-voice-mini__label' }, 'Громкость ', R.createElement('span', { className: 'mobility-voice-mini__value' }, Math.round(vol * 100) + '%')),
            R.createElement('input', {
              type: 'range',
              className: 'mobility-voice-mini__slider',
              min: 0,
              max: 1,
              step: 0.05,
              value: vol,
              disabled: !enabled,
              onChange: function (e) { applyVolume(e.target.value); },
              'aria-label': 'Громкость голоса'
            })
          ),
          R.createElement('button', { type: 'button', className: 'mobility-voice-mini__close', onClick: function () { setOpen(false); } }, 'Готово')
        ) : null
      );
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);
