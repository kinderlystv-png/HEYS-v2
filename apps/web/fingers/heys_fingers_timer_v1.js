// heys_fingers_timer_v1.js — Countdown state-machine для Fingers training.
//
// State graph (см. план «State machine + Reload recovery»):
//   IDLE → WARMUP_CHECKLIST → SET_PREP → HANG → REST
//        → SET_PREP (next rep) | BIG_REST (between sets) → DONE
//   Orthogonal: ANY → ABORTED | EXPIRED | PAUSED
//   PAUSED → возвращается в previous state.
//
// Public API:
//   const ctrl = HEYS.Fingers.useCountdownCycle({
//     hangSec, restSec, repsPerSet, setsCount, restBetweenSetsSec,
//     onStateChange?, onComplete?
//   });
//   // ctrl: { state, setIdx, repIdx, secondsLeft, totalElapsed,
//   //         start, pause, resume, abort, skipPhase }
//
//   HEYS.Fingers.CountdownDisplay({ state, secondsLeft, setIdx, totalSets,
//     repIdx, totalReps, gripLabel?, edgeLabel?, addedWeightKg?,
//     onPause, onAbort })
//
// Integration: timer срабатывает HEYS.Fingers.playFingerSound на phase
// transitions, HEYS.Fingers.voice?.say(cueId) для голосовых cue (optional
// chaining — Wave 2-B добавит voice), и `useWakeLock` из HEYS.AppHooks
// для удержания экрана во время HANG/REST.
//
// Tick: setInterval 100ms (smooth visual update без перегрузки CPU).
// Защита от тиков-дублей: ref на интервал, очистка на unmount/abort/done.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.useCountdownCycle && Fingers.CountdownDisplay) return; // idempotent

  const TICK_MS = 100;

  // State constants (избегаем magic strings в коде потребителей).
  const STATES = Fingers.STATES = Object.freeze({
    IDLE: 'IDLE',
    WARMUP_CHECKLIST: 'WARMUP_CHECKLIST',
    SET_PREP: 'SET_PREP',
    HANG: 'HANG',
    REST: 'REST',
    BIG_REST: 'BIG_REST',
    DONE: 'DONE',
    ABORTED: 'ABORTED',
    EXPIRED: 'EXPIRED',
    PAUSED: 'PAUSED',
  });

  // SET_PREP всегда 5 секунд (countdown до HANG).
  const SET_PREP_SEC = 5;

  function _now() { return Date.now(); }

  function _vibrate(pattern) {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (_e) { /* swallow */ }
  }

  function _say(cueId) {
    try {
      const v = HEYS.Fingers && HEYS.Fingers.voice;
      if (v && typeof v.say === 'function') v.say(cueId);
    } catch (_e) { /* swallow — voice optional */ }
  }

  function _beep(category) {
    try {
      if (HEYS.audio && typeof HEYS.audio.play === 'function') {
        HEYS.audio.play(category);
      }
    } catch (_e) { /* swallow */ }
  }

  function _fingerSound(type) {
    try {
      if (HEYS.Fingers && typeof HEYS.Fingers.playFingerSound === 'function') {
        HEYS.Fingers.playFingerSound(type);
      }
    } catch (_e) { /* swallow */ }
  }

  // ─── Hook: useCountdownCycle ─────────────────────────────────────────────
  function useCountdownCycle(config) {
    const React = global.React;
    if (!React) {
      console.warn('[Fingers.useCountdownCycle] React not loaded — returning stub');
      return { state: STATES.IDLE, setIdx: 0, repIdx: 0, secondsLeft: 0, totalElapsed: 0,
        start: () => {}, pause: () => {}, resume: () => {}, abort: () => {}, skipPhase: () => {} };
    }

    const cfg = config || {};
    const hangSec = Number(cfg.hangSec) || 7;
    const restSec = Number(cfg.restSec) || 3;
    const repsPerSet = Math.max(1, Number(cfg.repsPerSet) || 6);
    const setsCount = Math.max(1, Number(cfg.setsCount) || 5);
    const restBetweenSetsSec = Number(cfg.restBetweenSetsSec) || 180;

    const [state, setState] = React.useState(STATES.IDLE);
    const [setIdx, setSetIdx] = React.useState(0);
    const [repIdx, setRepIdx] = React.useState(0);
    const [secondsLeft, setSecondsLeft] = React.useState(0);
    const [totalElapsed, setTotalElapsed] = React.useState(0);

    const tickRef = React.useRef(null);
    const phaseStartedAtRef = React.useRef(0);
    const phaseDurationMsRef = React.useRef(0);
    const sessionStartedAtRef = React.useRef(0);
    const pauseStartedAtRef = React.useRef(0);
    const pauseTotalMsRef = React.useRef(0);
    const previousStateRef = React.useRef(STATES.IDLE);

    // Wake lock integration — optional, через HEYS.AppHooks.useWakeLock
    const wakeLock = HEYS.AppHooks && typeof HEYS.AppHooks.useWakeLock === 'function'
      ? HEYS.AppHooks.useWakeLock() : null;

    const onStateChange = cfg.onStateChange;
    const onComplete = cfg.onComplete;

    const fireStateChange = React.useCallback((nextState, meta) => {
      if (typeof onStateChange === 'function') {
        try { onStateChange(nextState, meta || {}); } catch (e) {
          console.warn('[Fingers.timer] onStateChange threw:', e);
        }
      }
    }, [onStateChange]);

    const clearTick = React.useCallback(() => {
      if (tickRef.current) {
        // Используется setTimeout (рекурсивный) вместо setInterval — clearTimeout
        // независимо работает для timeouts. setInterval throttled в этом
        // окружении (HEYS perf optimizations либо browser policy).
        clearTimeout(tickRef.current);
        tickRef.current = null;
      }
    }, []);

    // Рекурсивный setTimeout вместо setInterval — более надёжный в HEYS
    // окружении (setInterval не fires; возможно perf-main-thread наблюдатель
    // или background throttling). Преимущества: каждый next tick планируется
    // только после завершения предыдущего, нет накопления pending callbacks.
    const tickFnRef = React.useRef(null);
    const startTick = React.useCallback(() => {
      clearTick();
      const tickFn = function () {
        const elapsedMs = _now() - phaseStartedAtRef.current;
        const remainingMs = Math.max(0, phaseDurationMsRef.current - elapsedMs);
        const remainingSec = Math.ceil(remainingMs / 1000);
        setSecondsLeft(remainingSec);
        setTotalElapsed(Math.floor((_now() - sessionStartedAtRef.current - pauseTotalMsRef.current) / 1000));
        if (remainingMs <= 0) {
          tickRef.current = null;
          advancePhase();
          return;
        }
        // Рекурсивный setTimeout вместо setInterval — setInterval blocked
        // в HEYS окружении (возможно perf-monitor patches либо browser policy
        // в DevTools mobile emulation). Каждый next tick планируется только
        // после завершения предыдущего.
        tickRef.current = setTimeout(tickFn, TICK_MS);
      };
      tickFnRef.current = tickFn;
      tickRef.current = setTimeout(tickFn, TICK_MS);
    }, [clearTick]); // advancePhase прямой ref внизу — eslint disable-line

    // Forward-declared advancePhase (создаётся ниже через ref).
    const advancePhaseRef = React.useRef(null);
    function advancePhase() { if (advancePhaseRef.current) advancePhaseRef.current(); }

    const enterPhase = React.useCallback((nextState, durationSec, meta) => {
      phaseStartedAtRef.current = _now();
      phaseDurationMsRef.current = Math.max(0, durationSec * 1000);
      setSecondsLeft(durationSec);
      setState(nextState);
      previousStateRef.current = nextState;
      fireStateChange(nextState, Object.assign({ durationSec }, meta || {}));

      // Phase cues. ВАЖНО: cue ID должны совпадать с MP3 файлами в
      // apps/web/public/voice/fingers-ru/. Mismatch → 404 → TTS fallback с
      // дефолтным voice (часто en-US) → дублирование RU и EN голоса.
      if (nextState === STATES.HANG) {
        _fingerSound('fingerStart');
        _say('cue.go_hang'); // MP3: «Вис.»
        _vibrate([80, 60, 80]);
        if (wakeLock && wakeLock.requestWakeLock && !wakeLock.isWakeLockActive) {
          wakeLock.requestWakeLock();
        }
      } else if (nextState === STATES.REST) {
        _fingerSound('fingerRelease');
        _say('cue.rest_start'); // MP3: «Отдых.»
        _beep('caution');
      } else if (nextState === STATES.BIG_REST) {
        _say('cue.big_rest_start'); // MP3: «Большой отдых...»
        _beep('caution');
      } else if (nextState === STATES.SET_PREP) {
        _say('cue.countdown_5'); // MP3: «Готовься. Пять.»
        _beep('notify');
      } else if (nextState === STATES.DONE) {
        _beep('triumph');
        _say('cue.session_done');
        clearTick();
        Fingers.activeTimerLock = false;
        if (wakeLock && wakeLock.releaseWakeLock) wakeLock.releaseWakeLock();
        if (typeof onComplete === 'function') {
          try { onComplete(); } catch (e) { console.warn('[Fingers.timer] onComplete threw:', e); }
        }
        return; // no tick to start
      } else if (nextState === STATES.ABORTED || nextState === STATES.EXPIRED) {
        clearTick();
        Fingers.activeTimerLock = false;
        if (wakeLock && wakeLock.releaseWakeLock) wakeLock.releaseWakeLock();
        return;
      } else if (nextState === STATES.IDLE) {
        clearTick();
        Fingers.activeTimerLock = false;
        if (wakeLock && wakeLock.releaseWakeLock) wakeLock.releaseWakeLock();
        return;
      }

      startTick();
    }, [fireStateChange, startTick, clearTick, wakeLock, onComplete]);

    // Real advancePhase (after enterPhase available).
    advancePhaseRef.current = function realAdvancePhase() {
      // From SET_PREP → HANG
      if (state === STATES.SET_PREP) {
        enterPhase(STATES.HANG, hangSec, { setIdx, repIdx });
        return;
      }
      // From HANG → REST (или DONE если последний rep последнего сета)
      if (state === STATES.HANG) {
        const isLastRep = (repIdx + 1) >= repsPerSet;
        const isLastSet = (setIdx + 1) >= setsCount;
        if (isLastRep && isLastSet) {
          enterPhase(STATES.DONE, 0, {});
          return;
        }
        if (isLastRep) {
          // Конец сета — переходим в BIG_REST, увеличиваем setIdx после.
          enterPhase(STATES.BIG_REST, restBetweenSetsSec, { setIdx });
          return;
        }
        // Просто rest между подходами
        enterPhase(STATES.REST, restSec, { setIdx, repIdx });
        return;
      }
      // From REST → next rep (SET_PREP)
      if (state === STATES.REST) {
        setRepIdx((r) => r + 1);
        enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx, repIdx: repIdx + 1 });
        return;
      }
      // From BIG_REST → next set, rep=0, SET_PREP
      if (state === STATES.BIG_REST) {
        setSetIdx((s) => s + 1);
        setRepIdx(0);
        enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: setIdx + 1, repIdx: 0 });
        return;
      }
    };

    // ─── Control API ─────────────────────────────────────────────────────
    const start = React.useCallback(() => {
      sessionStartedAtRef.current = _now();
      pauseTotalMsRef.current = 0;
      setSetIdx(0);
      setRepIdx(0);
      setTotalElapsed(0);
      // Lock close/swipe-confirm while timer running (read by fullscreen swipe guard
      // и close handler). Cleared on abort/DONE/unmount ниже.
      Fingers.activeTimerLock = true;
      enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: 0, repIdx: 0 });
    }, [enterPhase]);

    const pause = React.useCallback(() => {
      if (state === STATES.PAUSED || state === STATES.IDLE
          || state === STATES.DONE || state === STATES.ABORTED) return;
      previousStateRef.current = state;
      pauseStartedAtRef.current = _now();
      clearTick();
      setState(STATES.PAUSED);
      fireStateChange(STATES.PAUSED, { resumeTo: previousStateRef.current, secondsLeft, setIdx, repIdx });
    }, [state, secondsLeft, setIdx, repIdx, clearTick, fireStateChange]);

    const resume = React.useCallback(() => {
      if (state !== STATES.PAUSED) return;
      const pauseDurMs = _now() - pauseStartedAtRef.current;
      pauseTotalMsRef.current += pauseDurMs;
      // Adjust phaseStartedAt чтобы оставшееся время сохранилось.
      phaseStartedAtRef.current += pauseDurMs;
      setState(previousStateRef.current);
      fireStateChange(previousStateRef.current, { resumed: true, setIdx, repIdx, durationSec: Math.ceil(phaseDurationMsRef.current / 1000) });
      startTick();
    }, [state, setIdx, repIdx, startTick, fireStateChange]);

    const abort = React.useCallback(() => {
      enterPhase(STATES.ABORTED, 0, {});
    }, [enterPhase]);

    const skipPhase = React.useCallback(() => {
      if (state === STATES.IDLE || state === STATES.DONE
          || state === STATES.ABORTED || state === STATES.PAUSED) return;
      clearTick();
      advancePhase();
    }, [state, clearTick]);

    // ─── Resume from persistence snapshot ──────────────────────────────────
    // Round-в-пользу-безопасности: фаза которая «истекла пока юзера не было»
    // не auto-completes (можно проскочить целый вис) — вместо этого даём
    // короткий 0.5s tail, чтобы тик дошёл до 0 и advancePhase сам перевёл
    // на следующую фазу через нормальный путь.
    const startFromSnapshot = React.useCallback((snap) => {
      if (!snap || !snap.state
          || snap.state === STATES.IDLE || snap.state === STATES.DONE
          || snap.state === STATES.ABORTED || snap.state === STATES.EXPIRED) {
        start();
        return;
      }
      sessionStartedAtRef.current = _now();
      pauseTotalMsRef.current = 0;
      const snapSetIdx = Number(snap.setIdx) || 0;
      const snapRepIdx = Number(snap.repIdx) || 0;
      setSetIdx(snapSetIdx);
      setRepIdx(snapRepIdx);
      Fingers.activeTimerLock = true;

      const wasPaused = snap.state === STATES.PAUSED;
      const targetState = wasPaused ? (snap.resumeTo || STATES.HANG) : snap.state;
      let targetSec;
      if (wasPaused) {
        targetSec = Math.max(1, Number(snap.pausedAtRemainingSec) || 0);
      } else {
        const elapsedMs = Date.now() - (Number(snap.phaseStartedAt) || Date.now());
        const remainingSec = (Number(snap.durationSec) || 0) - elapsedMs / 1000;
        if (remainingSec >= 0.5) {
          targetSec = Math.ceil(remainingSec);
        } else {
          targetSec = 0.5; // istекло — короткий tail, advancePhase сам переведёт
        }
      }

      enterPhase(targetState, targetSec, { setIdx: snapSetIdx, repIdx: snapRepIdx });

      if (wasPaused) {
        // Defer: даём enterPhase отработать React state update, потом ставим pause.
        setTimeout(function () { try { pause(); } catch (_) {} }, 50);
      }
    }, [start, enterPhase, pause]);

    // Cleanup on unmount ONLY. ВАЖНО: deps=[] (пустой массив), иначе wakeLock
    // (новый объект каждый render из HEYS.AppHooks.useWakeLock()) триггерил
    // cleanup → clearTick на КАЖДОМ ререндере → setTimeout убит сразу после
    // запуска → таймер не tick. Сохраняем wakeLock через ref для cleanup.
    const wakeLockRef = React.useRef(wakeLock);
    wakeLockRef.current = wakeLock;
    React.useEffect(() => {
      return () => {
        clearTick();
        Fingers.activeTimerLock = false;
        const wl = wakeLockRef.current;
        if (wl && wl.releaseWakeLock) wl.releaseWakeLock();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Visibility hook: если юзер ушёл на фоновую вкладку дольше 5с во время
    // активной фазы (HANG/REST/BIG_REST/SET_PREP) — браузер throttle'ит
    // setTimeout до 1Hz и приостанавливает Web Audio. Voice cues могут не
    // сработать → юзер не слышит «3...2...1» отказа. На возвращении показываем
    // тост-предупреждение, чтобы он перепроверил данные.
    const stateRef = React.useRef(state);
    stateRef.current = state;
    React.useEffect(() => {
      if (typeof document === 'undefined') return;
      let hiddenAt = 0;
      const onVis = function () {
        const isActivePhase = stateRef.current === STATES.HANG
          || stateRef.current === STATES.REST
          || stateRef.current === STATES.BIG_REST
          || stateRef.current === STATES.SET_PREP;
        if (document.visibilityState === 'hidden') {
          if (isActivePhase) hiddenAt = _now();
        } else if (document.visibilityState === 'visible' && hiddenAt > 0) {
          const hiddenMs = _now() - hiddenAt;
          hiddenAt = 0;
          if (hiddenMs > 5000 && isActivePhase) {
            try {
              const sec = Math.round(hiddenMs / 1000);
              const msg = '⚠ Вкладка была в фоне ' + sec +
                ' сек — звуковые команды могли не сработать, перепроверь данные.';
              if (HEYS.Toast && typeof HEYS.Toast.warn === 'function') HEYS.Toast.warn(msg);
              else if (HEYS.Toast && typeof HEYS.Toast.info === 'function') HEYS.Toast.info(msg);
              else if (HEYS.Toast && typeof HEYS.Toast.show === 'function') HEYS.Toast.show(msg);
            } catch (_) {}
          }
        }
      };
      document.addEventListener('visibilitychange', onVis);
      return function () { document.removeEventListener('visibilitychange', onVis); };
    }, []);

    return { state, setIdx, repIdx, secondsLeft, totalElapsed,
      start, startFromSnapshot, pause, resume, abort, skipPhase };
  }

  // ─── Component: CountdownDisplay ─────────────────────────────────────────
  // Wave 6 premium: phase-color theming через data-phase, круговое progress-кольцо
  // с тенью и pulse'ом digit на финальных 3 секундах HANG/REST. Breathing-ring
  // на отдыхе (медленный scale 1↔1.02) подсказывает ритм дыхания.
  function CountdownDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const {
      state, secondsLeft, setIdx, totalSets, repIdx, totalReps,
      gripLabel, gripId, equipmentTier, edgeLabel, addedWeightKg, onPause, onAbort, onSkip,
    } = props || {};

    // Tier-aware grip image: для block/door есть отдельные фото с реальным
    // оборудованием. Если для (grip+tier) нет файла — onError откатывается на
    // базовый /exercises/<gripId>.webp, если и его нет — wrapper схлопывается.
    const tieredGripSrc = gripId
      ? (equipmentTier && equipmentTier !== 'full' && equipmentTier !== 'none'
          ? '/exercises/' + gripId + '_' + equipmentTier + '.webp'
          : '/exercises/' + gripId + '.webp')
      : null;
    const baseGripSrc = gripId ? '/exercises/' + gripId + '.webp' : null;

    // Phase → CSS data-attr value (используется в .heys-fingers-countdown[data-phase=...])
    const phaseKey = state === STATES.HANG ? 'hang'
      : state === STATES.REST ? 'rest'
      : state === STATES.BIG_REST ? 'big-rest'
      : state === STATES.SET_PREP ? 'prep'
      : state === STATES.PAUSED ? 'paused'
      : state === STATES.DONE ? 'done'
      : state === STATES.ABORTED ? 'aborted'
      : 'idle';

    const phaseLabel = state === STATES.HANG ? 'ВИС'
      : state === STATES.REST ? 'Отдых'
      : state === STATES.BIG_REST ? 'Большой отдых'
      : state === STATES.SET_PREP ? 'Готовься'
      : state === STATES.PAUSED ? 'Пауза'
      : state === STATES.DONE ? 'Готово!'
      : state === STATES.ABORTED ? 'Прервано'
      : state === STATES.IDLE ? 'Готов к старту' : state;

    // SVG ring progress — 0..1 based on phase progress.
    const ringRadius = 86;
    const ringCircum = 2 * Math.PI * ringRadius;
    const phaseMaxSec = state === STATES.HANG ? Math.max(secondsLeft, 7)
      : state === STATES.REST ? Math.max(secondsLeft, 3)
      : state === STATES.BIG_REST ? Math.max(secondsLeft, 180)
      : state === STATES.SET_PREP ? 5
      : 60;
    const ratio = Math.max(0, Math.min(1, secondsLeft / phaseMaxSec));
    const dashoffset = ringCircum * (1 - ratio);

    // Финальные 3 сек активной фазы — pulse'нем digit. Активно только на работе/
    // отдыхе (на паузе/done — нет смысла).
    const isCountingActive = state === STATES.HANG || state === STATES.REST
      || state === STATES.BIG_REST || state === STATES.SET_PREP;
    const isFinalCount = isCountingActive && secondsLeft != null && secondsLeft <= 3 && secondsLeft > 0;

    const showControls = state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED;

    return h('div', {
      className: 'heys-fingers-countdown',
      'data-phase': phaseKey
    },
      // Set/rep counter — наверху
      h('div', { className: 'heys-fingers-countdown__counter' },
        (totalSets && totalReps)
          ? 'Подход ' + ((setIdx || 0) + 1) + '/' + totalSets +
            ' · Повтор ' + ((repIdx || 0) + 1) + '/' + totalReps
          : ''
      ),

      // Grip name — крупный заголовок
      gripLabel ? h('h2', { className: 'heys-fingers-countdown__grip' }, gripLabel) : null,

      // Hero image (при 404 откатываемся на базовый файл, потом схлопываемся)
      gripId ? h('div', { className: 'heys-fingers-countdown__hero' },
        h('img', {
          src: tieredGripSrc,
          alt: gripLabel || gripId,
          loading: 'eager',
          decoding: 'async',
          'data-fallback-tried': tieredGripSrc === baseGripSrc ? 'true' : 'false',
          onError: function (e) {
            try {
              const el = e.target;
              if (el.getAttribute('data-fallback-tried') !== 'true' && baseGripSrc && baseGripSrc !== tieredGripSrc) {
                el.setAttribute('data-fallback-tried', 'true');
                el.src = baseGripSrc;
                return;
              }
              el.parentNode.style.display = 'none';
            } catch (_) {}
          }
        })
      ) : null,

      // Chips: грань + доп. вес
      (edgeLabel || addedWeightKg != null) ? h('div', { className: 'heys-fingers-countdown__chips' },
        edgeLabel ? h('div', { className: 'heys-fingers-countdown__chip' },
          h('span', { className: 'heys-fingers-countdown__chip-label' }, 'Грань'),
          h('span', { className: 'heys-fingers-countdown__chip-value' }, edgeLabel)
        ) : null,
        addedWeightKg != null ? h('div', {
          className: 'heys-fingers-countdown__chip heys-fingers-countdown__chip--weight',
          'data-weight-sign': addedWeightKg > 0 ? 'plus' : addedWeightKg < 0 ? 'minus' : 'zero'
        },
          h('span', { className: 'heys-fingers-countdown__chip-label' }, 'Доп. вес'),
          h('span', { className: 'heys-fingers-countdown__chip-value' },
            (addedWeightKg > 0 ? '+' : '') + addedWeightKg + ' кг')
        ) : null
      ) : null,

      // Phase badge
      h('div', { className: 'heys-fingers-countdown__phase-badge' }, phaseLabel),

      // Ring + digit
      h('div', { className: 'heys-fingers-countdown__ring-wrap' },
        h('svg', {
          className: 'heys-fingers-countdown__ring',
          width: 200, height: 200, viewBox: '0 0 200 200'
        },
          h('circle', {
            className: 'heys-fingers-countdown__ring-track',
            cx: 100, cy: 100, r: ringRadius, fill: 'none'
          }),
          h('circle', {
            className: 'heys-fingers-countdown__ring-fill',
            cx: 100, cy: 100, r: ringRadius, fill: 'none',
            strokeDasharray: ringCircum,
            strokeDashoffset: dashoffset,
            transform: 'rotate(-90 100 100)'
          })
        ),
        h('div', {
          className: 'heys-fingers-countdown__digit'
            + (isFinalCount ? ' is-final-count' : '')
        }, String(Math.max(0, secondsLeft | 0)))
      ),

      // Controls — touch targets ≥44px (iOS HIG, потные пальцы после виса).
      showControls ? h('div', { className: 'heys-fingers-countdown__controls' },
        // VoiceMiniControls без inline — 44px чтобы матчиться с .__btn высотой
        Fingers.VoiceMiniControls
          ? h(Fingers.VoiceMiniControls, null)
          : null,
        h('button', {
          type: 'button',
          className: 'heys-fingers-countdown__btn',
          onClick: onPause
        }, state === STATES.PAUSED ? '▶ Возобновить' : '⏸ Пауза'),
        (typeof onSkip === 'function' && state !== STATES.PAUSED) ? h('button', {
          type: 'button',
          className: 'heys-fingers-countdown__btn',
          onClick: onSkip,
          'aria-label': 'Пропустить фазу',
          title: 'Пропустить фазу'
        }, '→') : null,
        h('button', {
          type: 'button',
          className: 'heys-fingers-countdown__btn heys-fingers-countdown__btn--abort',
          onClick: onAbort
        }, 'Прервать')
      ) : null
    );
  }

  Fingers.useCountdownCycle = useCountdownCycle;
  Fingers.CountdownDisplay = CountdownDisplay;
})(typeof window !== 'undefined' ? window : globalThis);
