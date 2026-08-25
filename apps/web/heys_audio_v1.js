/**
 * HEYS Unified Audio Module v1
 * Единый движок звука и вибрации для всего приложения.
 *
 * ЕДИНСТВЕННАЯ ТОЧКА ПОЛИТИКИ ОТКЛИКА — `HEYS.feedback` (в конце файла).
 * Продуктовое событие отображается в отклик здесь, в таблице `RESPONSES`, и
 * нигде больше. Ответ дизайнера на «а пусть удаление тоже звучит» меняет одну
 * строку таблицы, а не сто сорок два вызова по коду.
 *
 * Контракт: `home-widgets.v4.dc.html`, строки «вибрация · правило продукта» и
 * «звук · правило продукта».
 *   вибрация — два уровня: 10 мс на успешную запись в данные, двойной короткий
 *              на необратимое действие; на обычные нажатия, переключение
 *              вкладок и открытие листов вибрации нет;
 *   звук     — два: капля воды и звук совета, у каждого свой переключатель.
 *
 * API:
 *   HEYS.feedback.emit(event)         — отклик продукта по событию (см. RESPONSES)
 *   HEYS.audio.play(sound)            — только звук ('water' | 'advice')
 *   HEYS.audio.haptic(level)          — только вибрация ('tap' | 'double')
 *   HEYS.audio.preview(sound)         — превью звука для настроек (игнорирует тихие часы)
 *   HEYS.audio.getSettings()          — текущие настройки
 *   HEYS.audio.saveSettings(updates)  — сохранить настройки (перезаписывает частично)
 *   HEYS.audio.isEnabled()            — true если masterEnabled
 *   HEYS.audio.CATEGORIES             — список звуков (freeze)
 *
 * Kill switch: localStorage.setItem('heys_audio_disabled', 'true')
 *
 * @file heys_audio_v1.js
 * @version 2.0.0
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // ─── Kill switch ──────────────────────────────────────────────────────────
  if (localStorage.getItem('heys_audio_disabled') === 'true') {
    HEYS.audio = {
      play: () => { },
      haptic: () => { },
      preview: () => { },
      isEnabled: () => false,
      getSettings: () => ({ masterEnabled: false }),
      saveSettings: () => { },
      invalidateSettings: () => { },
      EVENTS: Object.freeze({}),
      CATEGORIES: Object.freeze([])
    };
    // Политика тоже должна существовать: вызовы `HEYS.feedback.emit` разбросаны
    // по продукту и не обязаны знать про kill switch.
    HEYS.feedback = {
      emit: () => { },
      responseFor: () => null,
      levelFor: () => null,
      RESPONSES: Object.freeze({}),
      LEVELS: Object.freeze({})
    };
    console.info('[HEYS.audio] ⚠️ Disabled via kill switch');
    return;
  }

  // ─── Defaults ─────────────────────────────────────────────────────────────
  const DEFAULT_SETTINGS = {
    masterEnabled: true,
    volume: 0.12,
    hapticEnabled: true,
    quietHoursEnabled: false, // disabled by default; user can enable in settings
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
      // One-time migration: quiet hours were enabled by default, now disabled
      if (!raw._qhOff) {
        _settings.quietHoursEnabled = false;
        _settings._qhOff = 1;
        _lsSet(SETTINGS_KEY, Object.assign({}, _settings));
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
      _audioCtx.resume().catch(() => { });
    }
    return _audioCtx;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!_audioCtx) return;
      if (document.visibilityState === 'hidden') {
        _audioCtx.suspend?.().catch(() => { });
        return;
      }
      if (document.visibilityState === 'visible' && _userGestured) {
        _audioCtx.resume?.().catch(() => { });
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
  const _waterSoundTapTimes = [];

  // Пауза между повторами одного звука (мс). Звуков два — строк тоже две.
  const COOLDOWN = {
    advice: 800,
    water: 0
  };

  function pruneWaterSoundTapTimes(now = Date.now()) {
    while (_waterSoundTapTimes.length && now - _waterSoundTapTimes[0] > 2000) {
      _waterSoundTapTimes.shift();
    }
  }

  function isWaterSoundFlooded(now = Date.now()) {
    pruneWaterSoundTapTimes(now);
    _waterSoundTapTimes.push(now);
    return _waterSoundTapTimes.length > 4;
  }

  let _waterToneStep = 0;
  let _waterToneDay = null;

  function nextWaterToneCents(dateKey) {
    const today = (typeof dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
      ? dateKey
      : new Date().toISOString().slice(0, 10);
    if (_waterToneDay !== today) {
      _waterToneDay = today;
      _waterToneStep = 0;
    }
    const cents = (_waterToneStep % 4) * 30;
    _waterToneStep += 1;
    if (_waterToneStep >= 4) _waterToneStep = 0;
    return cents;
  }

  function isThrottled(category) {
    const now = Date.now();
    const last = _lastPlayTime[category] || 0;
    // `??`, а не `||`: у воды пауза намеренно нулевая, и `||` читал этот ноль
    // как «не задано» и подставлял 800 мс. Из-за этого второй быстрый тап
    // молчал, а правило контракта water-add «более 4 тапов за 2 с — звук
    // молчит» не могло сработать ни разу: до пятого тапа дело не доходило.
    if (now - last < (COOLDOWN[category] ?? 800)) return true;
    _lastPlayTime[category] = now;
    return false;
  }

  // ─── Sound synthesis functions ────────────────────────────────────────────
  // Звуков ровно два — строка «звук · правило продукта». Было десять: triumph,
  // success, reward, notify, caution, alert, error, interaction, dismiss, water.
  // Each takes (ctx, vol) and synthesizes a sound using Web Audio API.

  /** Звук совета — мягкий двойной колокольчик F5 + C6. */
  function synthAdvice(ctx, vol) {
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
  /**
   * Звук капли воды — строки контракта water-add «чем сделан», «характер»,
   * «тон», «огибающая», «громкость».
   *
   * Синтез в WebAudio, не семпл. Числа заданы контрактом, и все они прежде
   * расходились: тон падал 760 → 330 вместо восходящего 400 → 540, спад тянулся
   * 230 мс при разрешённых 200, а поверх стоял room wash — та самая
   * реверберация, которую строка «характер» запрещает прямо. Громкость шла
   * через 0,74 от общего уровня вместо 0,22.
   *
   * Мягкое контактное «ток» — короткий фильтрованный шум — остаётся: без него
   * капля звучит синтетическим свистком, а строка просит именно контакт.
   */
  function synthWater(ctx, vol, detuneCents = 0) {
    const now = ctx.currentTime;
    const detune = Number(detuneCents) || 0;

    // Строка «громкость»: 0,22 от общего уровня — тише системного тапа.
    const level = vol * 0.22;

    // Строка «характер»: без пузырей и реверберации. Прямой путь, без delay и
    // обратной связи — прежний room wash снят целиком.
    const out = ctx.createGain();
    out.gain.setValueAtTime(1, now);
    out.connect(ctx.destination);

    // ── Контактное «ток»: 2 мс фильтрованного шума ──────────────────────────
    const clickLen = Math.floor(ctx.sampleRate * 0.002);
    const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) clickData[i] = (Math.random() * 2 - 1) * (1 - i / clickLen);
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(1650, now);
    clickFilter.Q.setValueAtTime(1.0, now);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(level * 0.22, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.007);
    clickSrc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(out);
    clickSrc.start(now);
    clickSrc.stop(now + 0.008);

    // ── Основной тон: 400 → 540 Гц восходящим глайдом ───────────────────────
    // Строка «огибающая»: атака 4 мс, спад 140 мс, без сустейна.
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), now + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.144);
    bodyGain.connect(out);

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'sine';
    bodyOsc.detune.setValueAtTime(detune, now);
    bodyOsc.frequency.setValueAtTime(400, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(540, now + 0.14);
    bodyOsc.connect(bodyGain);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.15);

    // ── Обертон ×2 на −12 дБ: та же кривая, вдвое выше, вчетверо тише ───────
    // −12 дБ по амплитуде = 10^(−12/20) ≈ 0,251.
    const overGain = ctx.createGain();
    overGain.gain.setValueAtTime(0.0001, now);
    overGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * 0.251), now + 0.004);
    overGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.144);
    overGain.connect(out);

    const overOsc = ctx.createOscillator();
    overOsc.type = 'sine';
    overOsc.detune.setValueAtTime(detune, now);
    overOsc.frequency.setValueAtTime(800, now);
    overOsc.frequency.exponentialRampToValueAtTime(1080, now + 0.14);
    overOsc.connect(overGain);
    overOsc.start(now);
    overOsc.stop(now + 0.15);
  }

  // ─── Реестр звуков ────────────────────────────────────────────────────────
  const SYNTH = {
    advice: synthAdvice,
    water: synthWater
  };

  // ─── Политика отклика: единственная таблица на весь продукт ───────────────
  //
  // Уровни вибрации — строка «вибрация · правило продукта»: их два и только
  // два. Было семь (5 / 8 / 10 / 15 / 20 / 30 / 50 мс) и десять образцов.
  //
  //   tap    — 10 мс, успешная запись в данные;
  //   double — двойной короткий, необратимое действие.
  //
  // Числа двойного контракт не называет: 10 мс + пауза 60 мс + 10 мс читается
  // как «два коротких», а не как одно длинное. Отступление названо в отчёте.
  const LEVELS = Object.freeze({
    tap: Object.freeze([10]),
    double: Object.freeze([10, 60, 10])
  });

  // Событие продукта → отклик. Всё, чего здесь нет, откликом не сопровождается:
  // обычные нажатия, переключение вкладок, открытие листов, ползунки, колёса,
  // пресеты, чипы, тумблеры, переходы между шагами форм.
  //
  // Шесть строк ниже названы контрактом, но точки вызова у них пока нет:
  // `checkin.step`, `form.submitted`, `document.signed`, `registration.done`,
  // `login.success`, `app.reload`. Отклика на этих экранах не было и раньше;
  // строки оставлены здесь, чтобы правило продукта читалось целиком и чтобы
  // тот, кто будет сводить эти экраны, звал политику, а не заводил свой образец.
  const RESPONSES = Object.freeze({
    // ── Успешная запись в данные — 10 мс ───────────────────────────────────
    'water.sip': { haptic: 'tap', sound: 'water' },   // water-add «вибрация 10 мс на каждый глоток»
    'meal.added': { haptic: 'tap' },                  // nutrition-tab «на добавленный приём»
    'supplement.taken': { haptic: 'tap' },            // nutrition-tab «на отметку добавки»
    'step.done': { haptic: 'tap' },                   // «законченный шаг»
    'checkin.step': { haptic: 'tap' },                // checkin-morning «на законченный шаг и на отметку „Сделал“»
    'form.submitted': { haptic: 'tap' },              // questionnaire «на отправку анкеты»
    'document.signed': { haptic: 'tap' },             // registration «на подпись документа»
    'registration.done': { haptic: 'tap' },           // registration «на завершение регистрации»
    'login.success': { haptic: 'tap' },               // login «на успешный вход»
    'advice.hidden': { haptic: 'tap' },               // tips «на скрытие совета свайпом»
    'undo': { haptic: 'tap' },                        // undo-bar «одиночная 10 мс на отмену»
    'longpress': { haptic: 'tap' },                   // home-widgets «короткое вибро в момент срабатывания»

    // ── Необратимое действие — двойной короткий ────────────────────────────
    'record.deleted': { haptic: 'double' },           // undo-bar, nutrition-tab «двойная на удаление»
    'app.reload': { haptic: 'double' },               // pwa-update «в момент перезагрузки — она необратима»

    // ── Только звук ────────────────────────────────────────────────────────
    'advice.shown': { sound: 'advice' },              // «звук совета»

    // ── Отступление: у мессенджера своего кадра в пакете дизайна нет ───────
    // Пришедшее сообщение куратора — единственный сигнал, что оно пришло, пока
    // приложение открыто. Отклик оставлен, но сведён к контрактным уровням и
    // одолжил звук совета вместе с его переключателем. Строки контракта под
    // это нет — расхождение вынесено в UI_V4_FINDINGS.md.
    'message.incoming': { haptic: 'tap', sound: 'advice' }
  });

  // Старый словарь уровней (`HEYS.dayUtils.haptic`, `HEYS.vibration.play`,
  // локальные helper'ы в модулях) сведён к контрактным двум. `null` = молчит.
  const LEGACY_LEVELS = Object.freeze({
    light: null, medium: null, heavy: null, tick: null, selection: null,
    warning: null, notification: null, caution: null, alert: null, error: null,
    heartbeat: null, sos: null, countdown: null, levelUp: null, triumph: null,
    reward: null, interaction: null, dismiss: null,
    success: 'tap',
    tap: 'tap',
    delete: 'double', remove: 'double', double: 'double'
  });

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

  // ─── Переключатель звука ──────────────────────────────────────────────────
  // Строка «звук · правило продукта» шестнадцатой сборки: «свой переключатель
  // один, у звука совета… Капля звучит под общим выключателем звуков
  // приложения; своего тумблера у воды нет и не заводится». Тумблер капли
  // (waterSoundEnabled) заводили 25 августа по пятнадцатой сборке — она этого
  // ещё не говорила; снят в тот же день, когда сборка ответила.
  //
  // Тумблер советов живёт в `heys_advice_settings` (решение владельца 24.08 —
  // три локальных гейта в day/_advice.js). Политика читает его тоже, иначе она
  // врала бы: «звук совета включён», пока человек его выключил.
  function adviceSoundEnabled() {
    const settings = _lsGet('heys_advice_settings', null);
    if (!settings || typeof settings !== 'object') return true;
    if (hasOwn(settings, 'adviceSoundEnabled')) return settings.adviceSoundEnabled !== false;
    if (hasOwn(settings, 'soundEnabled')) return settings.soundEnabled !== false;
    return true;
  }

  function soundToggleOn(sound) {
    // Капля своего тумблера не имеет: общий выключатель её уже погасил выше,
    // в play(), поэтому здесь она всегда разрешена.
    if (sound === 'water') return true;
    if (sound === 'advice') return adviceSoundEnabled();
    return false;
  }

  // ─── Проигрывание звука ───────────────────────────────────────────────────
  function play(sound, options) {
    const s = loadSettings();
    if (!s.masterEnabled) return;
    if (!sound || !SYNTH[sound]) {
      // Событий у модуля больше нет — только два звука. Старое имя события
      // сюда попасть не должно; если попало, это забытый вызов, а не звук.
      console.warn('[HEYS.audio] Неизвестный звук (звуков два — water, advice):', sound);
      return;
    }
    if (!soundToggleOn(sound)) return;

    if (isDocumentHidden() && options?.allowInBackground !== true) {
      console.info('[HEYS.audio] ⏸ skipped in hidden tab:', sound);
      return;
    }

    if (isThrottled(sound)) return;

    if (sound === 'water' && isWaterSoundFlooded()) {
      // water-add «частые тапы · звук»: больше 4 тапов за 2 с — звук молчит,
      // тактильный отклик остаётся (он выдаётся отдельно, в emit()).
      console.info('[HEYS.audio] ▶ water sound muted (>4 taps / 2s)');
      return;
    }

    // Звук глушат только тихие часы (плюс общий выключатель, свой переключатель,
    // фоновая вкладка и защита от частых повторов выше). Системная настройка
    // движения на звук не распространяется — строка контракта «Правило
    // „уменьшить движение“ звук не отключает — он не движение» и
    // docs/implementation/MOTION_POLICY.md, раздел «Звук».
    if (isQuietHours() && options?.ignoreQuietHours !== true) return;

    const ctx = getCtx();
    if (!ctx) return;
    const vol = typeof options?.volume === 'number' ? options.volume : s.volume;
    try {
      if (sound === 'water') {
        SYNTH.water(ctx, vol, nextWaterToneCents(options?.dateKey));
      } else {
        SYNTH[sound](ctx, vol);
      }
    } catch (e) {
      console.warn('[HEYS.audio] Synthesis error:', sound, e);
    }
  }

  // ─── Вибрация одного из двух уровней ──────────────────────────────────────
  function haptic(level) {
    const s = loadSettings();
    // `masterEnabled` гасит и вибрацию: так подписан сам переключатель в
    // профиле («Звуки и вибрация отключены»), и люди им пользуются именно так.
    // Контракт своего переключателя вибрации не предполагает вовсе — расхождение
    // названо в отчёте, но существующий выключатель не снимаем.
    if (!s.masterEnabled || !s.hapticEnabled) return;
    // Вибрация — физическое движение устройства, поэтому остаётся под системной
    // настройкой движения (MOTION_POLICY.md, «Вибрация — не звук»).
    if (prefersReducedMotion() || isDocumentHidden()) return;

    const pattern = Array.isArray(level)
      ? level
      : LEVELS[level] || LEVELS[LEGACY_LEVELS[level]] || null;
    if (!pattern) return;
    triggerHaptic(pattern.slice());
  }

  // ─── Превью звука для настроек (игнорирует тихие часы) ────────────────────
  function preview(sound) {
    const s = loadSettings();
    if (!s.masterEnabled) return;
    if (!sound || !SYNTH[sound]) return;

    // Превью обязано звучать при выключенном тумблере этого звука — иначе
    // переключатель немой ровно тогда, когда его и хотят послушать. И
    // независимо от настройки движения: звук не движение.
    const ctx = getCtx();
    if (!ctx) return;
    try {
      if (sound === 'water') SYNTH.water(ctx, s.volume, nextWaterToneCents());
      else SYNTH[sound](ctx, s.volume);
    } catch (e) {
      console.warn('[HEYS.audio] Preview error:', sound, e);
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  HEYS.audio = {
    play,
    haptic,
    preview,
    stopAll: () => {
      if (_audioCtx?.close) {
        _audioCtx.close().catch(() => { });
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
    CATEGORIES: Object.freeze(Object.keys(SYNTH))
  };

  // ─── Единственная точка политики ──────────────────────────────────────────
  /**
   * Отклик продукта на событие. Всё, что вибрирует или звучит, проходит здесь.
   *
   * @param {string} event  ключ из RESPONSES
   * @param {object} [options]  { dateKey, allowInBackground, ignoreQuietHours, volume }
   */
  function emit(event, options) {
    const response = RESPONSES[event];
    if (!response) {
      console.warn('[HEYS.feedback] Событие вне политики отклика:', event);
      return;
    }
    if (response.haptic) haptic(response.haptic);
    if (response.sound) play(response.sound, options);
  }

  HEYS.feedback = {
    emit,
    /** Отклик, назначенный событию (для тестов и отладки). */
    responseFor: (event) => RESPONSES[event] || null,
    /** Контрактный уровень для имени из старого словаря; null = молчит. */
    levelFor: (legacyName) => (hasOwn(LEGACY_LEVELS, legacyName) ? LEGACY_LEVELS[legacyName] : null),
    RESPONSES,
    LEVELS
  };

  console.info('[HEYS.audio] ✅ Unified audio module loaded (v2.0.0)');

})(typeof window !== 'undefined' ? window : global);
