// heys_fingers_voice_v1.js — Wave 2-B (voice coach).
// HEYS.Fingers.voice — RU TTS / MP3 coach для full-screen режима.
//
// Public API:
//   voice.say(cueId, opts)         — async; MP3 → fallback Web Speech API → silent
//     opts.vars       : Object — substitution для templated cues ({duration, n, m, ...})
//     opts.volume     : 0-1 (override)
//     opts.speed      : 0.8-1.2 (override)
//     opts.signal     : AbortSignal — отменить воспроизведение
//   voice.preload()                — fetch all MP3 в browser HTTP cache
//   voice.isAvailable()            — 'mp3' | 'tts' | 'none'
//   voice.setVoice(name)           — 'alena' | 'jane' | 'ermil' (Yandex SpeechKit voices)
//   voice.setEnabled(bool)
//   voice.setVolume(0-1)
//   voice.setSpeed(0.8-1.2)
//   voice.getSettings()
//   voice.PHRASE_BANK              — массив (для generate-finger-voice.mjs)
//
// Settings persistence: LS-key 'heys_fingers_voice_settings_v1'.
// Templated cues — combinator-precomputed MP3 файлы (cue.rest_60sec.mp3 и т.д.); TTS-fallback substitute в тексте.
//
// Идемпотентность: Fingers.voice__registered.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.voice__registered) return;
  Fingers.voice__registered = true;

  // ===== PHRASE BANK — 35 базовых cue + templated варианты =====
  // Пути MP3 — `/voice/fingers-ru/<id>.mp3` — будут сгенерены Wave 4 (Yandex SpeechKit).
  const MP3_BASE = '/voice/fingers-ru/';

  // Базовые 35 фраз (Wave 2-B finalized).
  // Принципы (см. plan секция "Voice cues bank"):
  //   - mid-hang silence (никаких слов во время виса)
  //   - cues краткие (≤3 сек прочитано)
  //   - context-aware (start/rest/warmup/set/done/PR/safety)
  const BASE_PHRASES = [
    // --- сессия (старт/завершение) ---
    { id: 'cue.start_session',        text: 'Начинаем тренировку. Проверь разогрев.' },
    { id: 'cue.warmup_ok',            text: 'Разогрев подтверждён. Готовься.' },
    { id: 'cue.warmup_skipped',       text: 'Внимание: ты пропустил разогрев. Риск травмы выше.' },
    { id: 'cue.session_done',         text: 'Сессия завершена. Хорошая работа.' },
    { id: 'cue.session_done_pr',      text: 'Личный рекорд! Отличная сессия.' },
    { id: 'cue.session_aborted',      text: 'Тренировка прервана. Прогресс сохранён.' },

    // --- countdown перед HANG ---
    { id: 'cue.countdown_5',          text: 'Готовься. Пять.' },
    { id: 'cue.countdown_3',          text: 'Три.' },
    { id: 'cue.countdown_2',          text: 'Два.' },
    { id: 'cue.countdown_1',          text: 'Один.' },
    { id: 'cue.go_hang',              text: 'Вис.' },

    // --- завершение виса ---
    { id: 'cue.hang_done',            text: 'Отпускай.' },
    { id: 'cue.last_3_sec',           text: 'Три секунды.' },

    // --- отдых ---
    { id: 'cue.rest_start',           text: 'Отдых.' },
    { id: 'cue.rest_almost_done',     text: 'Готовься, следующий вис.' },
    { id: 'cue.rest_done',            text: 'Подготовься.' },

    // --- сеты ---
    { id: 'cue.set_done',             text: 'Сет закончен.' },
    { id: 'cue.big_rest_start',       text: 'Большой отдых. Расслабь предплечья.' },
    { id: 'cue.last_set',             text: 'Последний сет. Не сдавайся.' },
    { id: 'cue.halfway',              text: 'Середина сессии.' },

    // --- безопасность ---
    { id: 'cue.safety_pip_warning',   text: 'Боль в PIP-суставе. Сделай паузу или прерви тренировку.' },
    { id: 'cue.safety_pulley_warn',   text: 'Тяжёлый крип. Контролируй вход и выход.' },
    { id: 'cue.cooldown_warning',     text: 'Меньше сорока восьми часов с прошлой максимальной сессии. Подумай о восстановлении.' },
    { id: 'cue.readiness_low',        text: 'Сегодня готовность низкая. Рекомендую лёгкий день.' },

    // --- мотивация ---
    { id: 'cue.push_hard',            text: 'Финальный вис. Выложись.' },
    { id: 'cue.good_form',            text: 'Техника хорошая. Продолжай.' },
    { id: 'cue.almost_done',          text: 'Почти всё. Последний рывок.' },

    // --- pause / resume ---
    { id: 'cue.paused',               text: 'Пауза.' },
    { id: 'cue.resumed',              text: 'Продолжаем.' },

    // --- сustom-protocol (Nelson no-equip) ---
    { id: 'cue.no_equip_intro',       text: 'Готовы к работе без виса. Сядь устойчиво.' },
    { id: 'cue.no_equip_effort',      text: 'Усилие — семь из десяти. Дыши ровно.' },
    { id: 'cue.no_equip_release',     text: 'Отпускай. Дыхание.' },

    // --- transitions (хват сменился) ---
    { id: 'cue.next_grip',            text: 'Следующий хват.' },
    { id: 'cue.grip_change_warning',  text: 'Смена хвата. Свободные руки минимум двадцать секунд.' },

    // --- assistance ---
    { id: 'cue.add_weight',           text: 'Добавь вес для следующего сета.' },
  ];

  // Templated cues — combinator-precomputed.
  // rest durations: 60, 90, 120, 180 seconds (3-минутный — главный для max-hangs).
  const REST_DURATIONS = [60, 90, 120, 180];
  const SET_COMBOS = []; // {n, m} — set N of M, для N∈1..6, M∈3..6
  for (let m = 3; m <= 6; m++) {
    for (let n = 1; n <= m; n++) {
      SET_COMBOS.push({ n, m });
    }
  }

  function restText(sec) {
    if (sec < 60) return 'Отдых ' + sec + ' секунд.';
    if (sec === 60) return 'Отдых одна минута.';
    if (sec === 90) return 'Отдых полторы минуты.';
    if (sec === 120) return 'Отдых две минуты.';
    if (sec === 180) return 'Отдых три минуты.';
    const m = Math.floor(sec / 60);
    return 'Отдых ' + m + ' минут.';
  }
  function setText(n, m) {
    return 'Подход ' + n + ' из ' + m + '.';
  }

  const TEMPLATED_PHRASES = [];
  REST_DURATIONS.forEach((sec) => {
    TEMPLATED_PHRASES.push({ id: 'cue.rest_' + sec + 'sec', text: restText(sec), templateOf: 'cue.rest_start', vars: { duration: sec } });
  });
  SET_COMBOS.forEach(({ n, m }) => {
    TEMPLATED_PHRASES.push({ id: 'cue.set_' + n + 'of' + m, text: setText(n, m), templateOf: 'cue.set_announce', vars: { n, m } });
  });

  const PHRASE_BANK = BASE_PHRASES.concat(TEMPLATED_PHRASES).map((p) => Object.assign({ mp3: MP3_BASE + p.id + '.mp3' }, p));

  // Quick index by id
  const PHRASE_BY_ID = {};
  PHRASE_BANK.forEach((p) => { PHRASE_BY_ID[p.id] = p; });

  Fingers.voice__PHRASE_BANK = PHRASE_BANK;

  // ===== Settings =====
  const SETTINGS_KEY = 'heys_fingers_voice_settings_v1';
  const DEFAULT_SETTINGS = {
    enabled: true,
    volume: 0.8,
    speed: 1.0,
    voice: 'alena', // alena | jane | ermil
  };

  function loadSettings() {
    try {
      const HEYS = (typeof window !== 'undefined' && window.HEYS) || {};
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        const v = HEYS.utils.lsGet(SETTINGS_KEY, null);
        if (v && typeof v === 'object') return Object.assign({}, DEFAULT_SETTINGS, v);
      }
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(SETTINGS_KEY) : null;
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_SETTINGS, parsed || {});
    } catch (_) { return Object.assign({}, DEFAULT_SETTINGS); }
  }

  function saveSettings(s) {
    try {
      const HEYS = (typeof window !== 'undefined' && window.HEYS) || {};
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        HEYS.utils.lsSet(SETTINGS_KEY, s);
        return;
      }
      if (typeof localStorage !== 'undefined') localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (_) { /* silent — quota / private mode */ }
  }

  let settings = loadSettings();

  // ===== Audio engine =====
  // Кэш HTMLAudioElement, чтобы повторное воспроизведение было быстрым.
  const MAX_AUDIO_CACHE = 12;
  const audioCache = Object.create(null);
  const audioCacheOrder = [];

  function stopAudio(a) {
    if (!a) return;
    try { a.pause(); } catch (_) {}
    try { a.currentTime = 0; } catch (_) {}
    try { a.removeAttribute && a.removeAttribute('src'); } catch (_) {}
    try { a.load && a.load(); } catch (_) {}
  }

  function touchAudioCache(url) {
    const idx = audioCacheOrder.indexOf(url);
    if (idx >= 0) audioCacheOrder.splice(idx, 1);
    audioCacheOrder.push(url);
  }

  function evictAudioCache() {
    while (audioCacheOrder.length > MAX_AUDIO_CACHE) {
      const oldUrl = audioCacheOrder.shift();
      const oldAudio = audioCache[oldUrl];
      delete audioCache[oldUrl];
      stopAudio(oldAudio);
    }
  }

  function ensureAudio(url) {
    if (audioCache[url]) {
      touchAudioCache(url);
      return audioCache[url];
    }
    if (typeof Audio === 'undefined') return null;
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
    audioCache[url] = a;
    touchAudioCache(url);
    evictAudioCache();
    return a;
  }

  // Попытка воспроизвести MP3. Возвращает Promise, resolves true если успешно.
  function playMp3(url, opts) {
    return new Promise((resolve) => {
      const a = ensureAudio(url);
      if (!a) { resolve(false); return; }
      try {
        a.volume = Math.max(0, Math.min(1, opts.volume));
        a.playbackRate = Math.max(0.8, Math.min(1.2, opts.speed));
        a.currentTime = 0;
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(ok);
        };
        const onEnded = () => { finish(true); };
        const onError = () => { finish(false); };
        const onAbort = () => { try { a.pause(); } catch (_) {} finish(false); };
        function cleanup() {
          a.removeEventListener('ended', onEnded);
          a.removeEventListener('error', onError);
          if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
        }
        a.addEventListener('ended', onEnded, { once: true });
        a.addEventListener('error', onError, { once: true });
        if (opts.signal) {
          opts.signal.addEventListener('abort', onAbort, { once: true });
        }
        const playPromise = a.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => { finish(false); });
        }
      } catch (_) {
        resolve(false);
      }
    });
  }

  // Web Speech API fallback. ВАЖНО: TTS включаем ТОЛЬКО если в браузере
  // реально есть голос на ru-RU. Иначе SpeechSynthesisUtterance падает на
  // default voice (часто en-US) — это приводит к «двойному голосу» (Yandex MP3
  // на одном cue + Web Speech en-US на другом cue которого нет в банке).
  // Молчание лучше чем English поверх русской сессии.
  function hasRuVoice() {
    if (typeof speechSynthesis === 'undefined') return false;
    try {
      const voices = speechSynthesis.getVoices();
      if (!voices || !voices.length) return false;
      return voices.some((v) => v && v.lang && v.lang.toLowerCase().startsWith('ru'));
    } catch (_) { return false; }
  }

  function playTts(text, opts) {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
        resolve(false); return;
      }
      // Защита от en-US double-voice: нет RU голоса → не озвучиваем.
      if (!hasRuVoice()) {
        if (typeof console !== 'undefined') {
          console.debug('[Fingers.voice] TTS skipped — no ru-RU voice available, silence > English');
        }
        resolve(false); return;
      }
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ru-RU';
        u.volume = Math.max(0, Math.min(1, opts.volume));
        u.rate = Math.max(0.8, Math.min(1.2, opts.speed));
        u.onend = () => resolve(true);
        u.onerror = () => resolve(false);
        if (opts.signal) {
          opts.signal.addEventListener('abort', () => { try { speechSynthesis.cancel(); } catch (_) {} resolve(false); }, { once: true });
        }
        const voices = speechSynthesis.getVoices();
        const ru = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ru'));
        if (ru) u.voice = ru;
        speechSynthesis.speak(u);
      } catch (_) {
        resolve(false);
      }
    });
  }

  // Шаблонная подстановка в text (для TTS fallback, если MP3 не существует).
  function substituteText(text, vars) {
    if (!vars || typeof text !== 'string') return text;
    // Простая регулярка {key}
    return text.replace(/\{(\w+)\}/g, (m, k) => Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
  }

  // ===== Public API =====
  const voice = Fingers.voice = {};

  voice.PHRASE_BANK = PHRASE_BANK;
  voice.PHRASE_BY_ID = PHRASE_BY_ID;

  voice.getSettings = function () { return Object.assign({}, settings); };

  voice.setEnabled = function (b) { settings.enabled = !!b; saveSettings(settings); };
  voice.setVolume  = function (v) { settings.volume = Math.max(0, Math.min(1, Number(v) || 0)); saveSettings(settings); };
  voice.setSpeed   = function (s) { settings.speed  = Math.max(0.8, Math.min(1.2, Number(s) || 1)); saveSettings(settings); };
  voice.setVoice   = function (name) {
    if (['alena', 'jane', 'ermil'].indexOf(name) === -1) return;
    settings.voice = name; saveSettings(settings);
  };

  voice.isAvailable = function () {
    if (typeof Audio !== 'undefined') return 'mp3';
    if (typeof speechSynthesis !== 'undefined') return 'tts';
    return 'none';
  };

  voice.stopAll = function stopAll() {
    Object.keys(audioCache).forEach(function (url) { stopAudio(audioCache[url]); });
    try {
      if (typeof speechSynthesis !== 'undefined' && speechSynthesis.cancel) speechSynthesis.cancel();
    } catch (_) {}
  };

  voice.clearAudioCache = function clearAudioCache() {
    voice.stopAll();
    Object.keys(audioCache).forEach(function (url) { delete audioCache[url]; });
    audioCacheOrder.splice(0, audioCacheOrder.length);
  };

  voice.getAudioCacheSize = function getAudioCacheSize() {
    return audioCacheOrder.length;
  };

  // ===== VoiceMiniControls (React) =====
  // Компактные controls для inline-рендера в шапке WarmupRunner и LiveSession:
  // иконка 🔊/🔇 (toggle enabled) + раскрывающаяся панелька со слайдером громкости.
  // Изменения сразу пишутся в LS через voice.setEnabled/setVolume.
  // Используется как: Fingers.VoiceMiniControls({ inline?: true })
  const R = (typeof window !== 'undefined') ? window.React : null;
  if (R && R.createElement) {
    Fingers.VoiceMiniControls = function VoiceMiniControls(props) {
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

      // SVG монолинейный спикер — единый стиль с табами и кнопками-иконками
      // вместо emoji-силуэта (тот рендерится чёрным и выбивается из дизайна).
      // Количество волн зависит от громкости; muted — крест поверх.
      function speakerIcon() {
        const waves = !enabled ? 0
          : vol < 0.05 ? 0
          : vol < 0.4 ? 1
          : vol < 0.75 ? 2
          : 3;
        const stroke = 1.7;
        const common = {
          fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
          strokeLinecap: 'round', strokeLinejoin: 'round'
        };
        const children = [
          // Корпус спикера
          R.createElement('path', Object.assign({ key: 'body',
            d: 'M3.5 9v6h3.2l5 3.6V5.4L6.7 9H3.5z' }, common))
        ];
        if (waves >= 1) {
          children.push(R.createElement('path', Object.assign({ key: 'w1',
            d: 'M14.5 9.5c.7.7 1.1 1.6 1.1 2.5s-.4 1.8-1.1 2.5' }, common)));
        }
        if (waves >= 2) {
          children.push(R.createElement('path', Object.assign({ key: 'w2',
            d: 'M16.7 7.3c1.3 1.3 2 3 2 4.7s-.7 3.4-2 4.7' }, common)));
        }
        if (waves >= 3) {
          children.push(R.createElement('path', Object.assign({ key: 'w3',
            d: 'M18.9 5.1c1.9 1.9 2.9 4.3 2.9 6.9s-1 5-2.9 6.9' }, common)));
        }
        if (!enabled) {
          children.push(R.createElement('path', Object.assign({ key: 'mute',
            d: 'M15.5 9.5l5 5M20.5 9.5l-5 5' }, common, {
            stroke: '#dc2626', strokeWidth: stroke
          })));
        }
        return R.createElement('svg', {
          width: 22, height: 22, viewBox: '0 0 24 24',
          'aria-hidden': 'true'
        }, children);
      }

      return R.createElement('div', {
        className: 'fingers-voice-mini' + (inline ? ' is-inline' : '') + (open ? ' is-open' : '')
      },
        // Trigger
        R.createElement('button', {
          type: 'button',
          className: 'fingers-voice-mini__btn',
          'aria-label': enabled ? 'Голос: включен. Изменить громкость' : 'Голос: выключен. Изменить',
          'aria-expanded': open ? 'true' : 'false',
          onClick: function () { setOpen(function (o) { return !o; }); }
        }, speakerIcon()),

        // Popover
        open ? R.createElement('div', {
          className: 'fingers-voice-mini__pop',
          role: 'dialog',
          'aria-label': 'Настройки голоса'
        },
          // Row 1: enable toggle
          R.createElement('label', { className: 'fingers-voice-mini__row' },
            R.createElement('span', { className: 'fingers-voice-mini__label' }, 'Голосовое сопровождение'),
            R.createElement('input', {
              type: 'checkbox',
              className: 'fingers-voice-mini__toggle',
              checked: enabled,
              onChange: function (e) { applyEnabled(!!e.target.checked); }
            })
          ),
          // Row 2: volume slider (disabled if voice off)
          R.createElement('label', { className: 'fingers-voice-mini__row fingers-voice-mini__row--volume' },
            R.createElement('span', { className: 'fingers-voice-mini__label' },
              'Громкость',
              R.createElement('span', { className: 'fingers-voice-mini__value' }, Math.round(vol * 100) + '%')
            ),
            R.createElement('input', {
              type: 'range',
              className: 'fingers-voice-mini__slider',
              min: 0, max: 1, step: 0.05,
              value: vol,
              disabled: !enabled,
              onChange: function (e) { applyVolume(e.target.value); },
              'aria-label': 'Громкость голоса'
            })
          ),
          R.createElement('button', {
            type: 'button',
            className: 'fingers-voice-mini__close',
            onClick: function () { setOpen(false); }
          }, 'Готово')
        ) : null
      );
    };
  }

  // Serial queue: чтобы фразы НЕ накладывались друг на друга, каждый say
  // ждёт завершения предыдущего. Используется fire-and-forget из timer
  // (без await), и без очереди MP3 проигрывались параллельно.
  let _voiceQueue = Promise.resolve();

  voice.say = function say(cueId, opts) {
    const job = _voiceQueue.then(function () { return _doSay(cueId, opts); }).catch(function () {});
    _voiceQueue = job;
    return job;
  };

  // Используется ExerciseRunner: «не запускай countdown пока pre-flight voice
  // не доиграет», иначе display 5→4→3→2→1 идёт пока ещё играет «Начнём
  // тренировку. Проверь разогрев.» — voice и render desync.
  voice.waitForQueue = function () {
    return _voiceQueue;
  };

  // Internal — actual say logic without queue (queue в voice.say обёртке выше).
  async function _doSay(cueId, opts) {
    if (!settings.enabled) return false;
    const o = opts || {};
    const vol = typeof o.volume === 'number' ? o.volume : settings.volume;
    const spd = typeof o.speed === 'number' ? o.speed : settings.speed;
    const signal = o.signal || null;

    // 1) Попытка найти exact phrase
    let phrase = PHRASE_BY_ID[cueId];
    let resolvedText = phrase ? phrase.text : cueId;

    // 2) Templated phrase resolution — если cueId без точного совпадения, но opts.vars передан.
    //    Пример: voice.say('cue.rest_start', {vars:{duration:120}}) → искать 'cue.rest_120sec'.
    if (phrase && o.vars && cueId === 'cue.rest_start' && typeof o.vars.duration === 'number') {
      const candidateId = 'cue.rest_' + o.vars.duration + 'sec';
      const tmpl = PHRASE_BY_ID[candidateId];
      if (tmpl) {
        phrase = tmpl;
        resolvedText = tmpl.text;
      } else {
        resolvedText = restText(o.vars.duration);
      }
    }
    if (phrase && o.vars && cueId === 'cue.set_announce' && typeof o.vars.n === 'number' && typeof o.vars.m === 'number') {
      const candidateId = 'cue.set_' + o.vars.n + 'of' + o.vars.m;
      const tmpl = PHRASE_BY_ID[candidateId];
      if (tmpl) {
        phrase = tmpl;
        resolvedText = tmpl.text;
      } else {
        resolvedText = setText(o.vars.n, o.vars.m);
      }
    }

    // Fallback: ручная substitution в text если phrase найден и есть vars
    if (phrase && o.vars && resolvedText.indexOf('{') !== -1) {
      resolvedText = substituteText(resolvedText, o.vars);
    }

    // 3) Попытка MP3
    if (phrase && phrase.mp3) {
      const ok = await playMp3(phrase.mp3, { volume: vol, speed: spd, signal });
      if (ok) return true;
    }

    // 4) Fallback TTS
    if (resolvedText) {
      const ok2 = await playTts(resolvedText, { volume: vol, speed: spd, signal });
      if (ok2) return true;
    }

    // 5) Silent fallback — return false (caller может показать toast «голос недоступен»)
    return false;
  };

  // Preload — fetch all MP3 в browser HTTP cache.
  voice.preload = async function preload() {
    if (typeof fetch === 'undefined') return false;
    const promises = PHRASE_BANK.map((p) => {
      // HEAD-запрос дешевле; кэш HTTP всё равно сохранит redirect chain.
      return fetch(p.mp3, { method: 'GET', cache: 'force-cache' }).then(() => true).catch(() => false);
    });
    const results = await Promise.all(promises);
    const ok = results.filter(Boolean).length;
    try { console.info('[Fingers.voice] preload:', ok, '/', PHRASE_BANK.length); } catch (_) {}
    return ok === PHRASE_BANK.length;
  };

})(typeof window !== 'undefined' ? window : globalThis);
