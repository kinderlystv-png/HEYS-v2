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
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }, []);

    const startTick = React.useCallback(() => {
      clearTick();
      tickRef.current = setInterval(() => {
        const elapsedMs = _now() - phaseStartedAtRef.current;
        const remainingMs = Math.max(0, phaseDurationMsRef.current - elapsedMs);
        const remainingSec = Math.ceil(remainingMs / 1000);
        setSecondsLeft(remainingSec);
        setTotalElapsed(Math.floor((_now() - sessionStartedAtRef.current - pauseTotalMsRef.current) / 1000));
        if (remainingMs <= 0) {
          // Phase complete — выходим, advance() решит следующий state.
          clearTick();
          advancePhase();
        }
      }, TICK_MS);
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

      // Phase cues
      if (nextState === STATES.HANG) {
        _fingerSound('fingerStart');
        _say('cue.hang_start');
        _vibrate([80, 60, 80]);
        if (wakeLock && wakeLock.requestWakeLock && !wakeLock.isWakeLockActive) {
          wakeLock.requestWakeLock();
        }
      } else if (nextState === STATES.REST) {
        _fingerSound('fingerRelease');
        _say('cue.rest_start');
        _beep('caution');
      } else if (nextState === STATES.BIG_REST) {
        _say('cue.big_rest_start');
        _beep('caution');
      } else if (nextState === STATES.SET_PREP) {
        _say('cue.prep_start');
        _beep('notify');
      } else if (nextState === STATES.DONE) {
        _beep('triumph');
        _say('cue.session_done');
        clearTick();
        if (wakeLock && wakeLock.releaseWakeLock) wakeLock.releaseWakeLock();
        if (typeof onComplete === 'function') {
          try { onComplete(); } catch (e) { console.warn('[Fingers.timer] onComplete threw:', e); }
        }
        return; // no tick to start
      } else if (nextState === STATES.ABORTED || nextState === STATES.EXPIRED) {
        clearTick();
        if (wakeLock && wakeLock.releaseWakeLock) wakeLock.releaseWakeLock();
        return;
      } else if (nextState === STATES.IDLE) {
        clearTick();
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
      enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: 0, repIdx: 0 });
    }, [enterPhase]);

    const pause = React.useCallback(() => {
      if (state === STATES.PAUSED || state === STATES.IDLE
          || state === STATES.DONE || state === STATES.ABORTED) return;
      previousStateRef.current = state;
      pauseStartedAtRef.current = _now();
      clearTick();
      setState(STATES.PAUSED);
      fireStateChange(STATES.PAUSED, { resumeTo: previousStateRef.current, secondsLeft });
    }, [state, secondsLeft, clearTick, fireStateChange]);

    const resume = React.useCallback(() => {
      if (state !== STATES.PAUSED) return;
      const pauseDurMs = _now() - pauseStartedAtRef.current;
      pauseTotalMsRef.current += pauseDurMs;
      // Adjust phaseStartedAt чтобы оставшееся время сохранилось.
      phaseStartedAtRef.current += pauseDurMs;
      setState(previousStateRef.current);
      fireStateChange(previousStateRef.current, { resumed: true });
      startTick();
    }, [state, startTick, fireStateChange]);

    const abort = React.useCallback(() => {
      enterPhase(STATES.ABORTED, 0, {});
    }, [enterPhase]);

    const skipPhase = React.useCallback(() => {
      if (state === STATES.IDLE || state === STATES.DONE
          || state === STATES.ABORTED || state === STATES.PAUSED) return;
      clearTick();
      advancePhase();
    }, [state, clearTick]);

    // Cleanup on unmount.
    React.useEffect(() => {
      return () => {
        clearTick();
        if (wakeLock && wakeLock.releaseWakeLock) wakeLock.releaseWakeLock();
      };
    }, [clearTick, wakeLock]);

    return { state, setIdx, repIdx, secondsLeft, totalElapsed,
      start, pause, resume, abort, skipPhase };
  }

  // ─── Component: CountdownDisplay ─────────────────────────────────────────
  function CountdownDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const {
      state, secondsLeft, setIdx, totalSets, repIdx, totalReps,
      gripLabel, edgeLabel, addedWeightKg, onPause, onAbort,
    } = props || {};

    // Visual style depending on phase
    const phaseColor = state === STATES.HANG ? '#dc2626'        // red — work
      : state === STATES.REST ? '#0891b2'                       // cyan — rest
      : state === STATES.BIG_REST ? '#0e7490'                   // dark cyan — big rest
      : state === STATES.SET_PREP ? '#ca8a04'                   // amber — prep
      : state === STATES.PAUSED ? '#6b7280'                     // gray — paused
      : state === STATES.DONE ? '#16a34a'                       // green — done
      : '#374151';                                              // neutral

    const phaseLabel = state === STATES.HANG ? 'ВИС'
      : state === STATES.REST ? 'Отдых'
      : state === STATES.BIG_REST ? 'Большой отдых'
      : state === STATES.SET_PREP ? 'Готовься'
      : state === STATES.PAUSED ? 'Пауза'
      : state === STATES.DONE ? 'Готово!'
      : state === STATES.ABORTED ? 'Прервано'
      : state === STATES.IDLE ? 'Готов к старту' : state;

    // SVG ring progress — 0..1 based on phase progress (computed by caller via secondsLeft + maxPhase).
    // Здесь упрощённо: показываем только заполнение по доле от 60s ceiling.
    const ringRadius = 84;
    const ringCircum = 2 * Math.PI * ringRadius;
    const phaseMaxSec = state === STATES.HANG ? Math.max(secondsLeft, 7)
      : state === STATES.REST ? Math.max(secondsLeft, 3)
      : state === STATES.BIG_REST ? Math.max(secondsLeft, 180)
      : state === STATES.SET_PREP ? 5
      : 60;
    const ratio = Math.max(0, Math.min(1, secondsLeft / phaseMaxSec));
    const dashoffset = ringCircum * (1 - ratio);

    return h('div', {
      className: 'heys-fingers-countdown',
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '16px', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif',
      },
    },
      // Top info — set/rep counter + grip
      h('div', { style: { fontSize: '14px', color: '#6b7280', textAlign: 'center' } },
        (totalSets && totalReps)
          ? `Подход ${(setIdx || 0) + 1}/${totalSets} · Повтор ${(repIdx || 0) + 1}/${totalReps}`
          : ''
      ),
      gripLabel ? h('div', { style: { fontSize: '13px', color: '#9ca3af', textAlign: 'center' } },
        `${gripLabel}${edgeLabel ? ' · ' + edgeLabel : ''}${addedWeightKg != null ? ` · ${addedWeightKg > 0 ? '+' : ''}${addedWeightKg} кг` : ''}`
      ) : null,

      // Phase badge
      h('div', {
        style: {
          background: phaseColor, color: '#fff',
          padding: '6px 16px', borderRadius: '999px',
          fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px',
          textTransform: 'uppercase',
        },
      }, phaseLabel),

      // Ring + big number
      h('div', { style: { position: 'relative', width: '200px', height: '200px' } },
        h('svg', { width: 200, height: 200, viewBox: '0 0 200 200' },
          h('circle', {
            cx: 100, cy: 100, r: ringRadius,
            stroke: '#e5e7eb', strokeWidth: 8, fill: 'none',
          }),
          h('circle', {
            cx: 100, cy: 100, r: ringRadius,
            stroke: phaseColor, strokeWidth: 10, fill: 'none',
            strokeLinecap: 'round',
            strokeDasharray: ringCircum,
            strokeDashoffset: dashoffset,
            transform: 'rotate(-90 100 100)',
            style: { transition: 'stroke-dashoffset 100ms linear' },
          })
        ),
        h('div', {
          style: {
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '72px', fontWeight: 700, color: phaseColor,
          },
        }, String(Math.max(0, secondsLeft | 0)))
      ),

      // Controls
      (state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED)
        ? h('div', { style: { display: 'flex', gap: '12px', marginTop: '8px' } },
            h('button', {
              type: 'button',
              onClick: onPause,
              style: {
                padding: '10px 20px', borderRadius: '8px',
                border: '1px solid #d1d5db', background: '#f9fafb',
                fontSize: '14px', cursor: 'pointer',
              },
            }, state === STATES.PAUSED ? 'Возобновить' : 'Пауза'),
            h('button', {
              type: 'button',
              onClick: onAbort,
              style: {
                padding: '10px 20px', borderRadius: '8px',
                border: '1px solid #fecaca', background: '#fef2f2',
                color: '#b91c1c', fontSize: '14px', cursor: 'pointer',
              },
            }, 'Прервать')
          ) : null
    );
  }

  Fingers.useCountdownCycle = useCountdownCycle;
  Fingers.CountdownDisplay = CountdownDisplay;
})(typeof window !== 'undefined' ? window : globalThis);
