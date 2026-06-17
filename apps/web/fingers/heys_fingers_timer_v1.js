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
  const TIMER_LOCK_HEARTBEAT_MS = 2000;
  const TIMER_LOCK_TTL_MS = 15000;

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
    // Step 2 (reps phase-view): юзер сам пейсит повторы, машина ждёт completeSet().
    // Нет HANG/REST под-таймера — повторы непрерывны, REST только BIG_REST между сетами.
    REPS_INPUT: 'REPS_INPUT',
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

  // Cues, общие для обоих state-graph (countdown/reps). Раньше жили в ядре
  // таймера; после выноса useTimerCore в _kernel ядро домен-агностично и звуков
  // не знает — играем здесь, в доменном onPhaseEnter. Порядок сохранён: для DONE
  // cue играет до terminal-обработки (core зовёт onPhaseEnter перед release).
  function _sharedPhaseCue(s) {
    if (s === STATES.SET_PREP) { _say('cue.countdown_5'); _beep('notify'); }
    else if (s === STATES.BIG_REST) { _say('cue.big_rest_start'); _beep('caution'); }
    else if (s === STATES.DONE) { _beep('triumph'); _say('cue.session_done'); }
  }

  function _getCurrentClientId() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? String(cid) : '';
  }

  function _timerLockKey() {
    const cid = _getCurrentClientId();
    return cid ? ('heys_' + cid + '_fingers_timer_lock_v1') : 'heys_fingers_timer_lock_v1';
  }

  function _makeTimerTabId() {
    try {
      const cryptoObj = global.crypto;
      if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
        return cryptoObj.randomUUID();
      }
    } catch (_) { /* noop */ }
    return 'tab_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
  }

  const TIMER_TAB_ID = Fingers.__timerTabId || _makeTimerTabId();
  Fingers.__timerTabId = TIMER_TAB_ID;

  function _runnerKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.runner;
  }

  function _timerOwnerLock() {
    const kr = _runnerKernel();
    if (!kr || typeof kr.createOwnerLock !== 'function') return null;
    return kr.createOwnerLock({
      storage: global.localStorage || null,
      key: _timerLockKey(),
      ownerId: TIMER_TAB_ID,
      ttlMs: TIMER_LOCK_TTL_MS,
      now: _now,
      failOpenOnStorageUnavailable: true
    });
  }

  function _readTimerLock() {
    const lock = _timerOwnerLock();
    if (lock && typeof lock.read === 'function') return lock.read();
    try {
      const raw = global.localStorage && global.localStorage.getItem(_timerLockKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  function _writeTimerLock(lock) {
    const ownerLock = _timerOwnerLock();
    if (ownerLock && typeof ownerLock.write === 'function') return ownerLock.write(lock);
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(_timerLockKey(), JSON.stringify(lock));
      return true;
    } catch (_) { return false; }
  }

  function _removeTimerLock() {
    const lock = _timerOwnerLock();
    if (lock && typeof lock.release === 'function') return lock.release();
    try {
      const lock = _readTimerLock();
      if (lock && lock.ownerTabId && lock.ownerTabId !== TIMER_TAB_ID) return false;
      if (global.localStorage) global.localStorage.removeItem(_timerLockKey());
      return true;
    } catch (_) { return false; }
  }

  function _isTimerLockFresh(lock, now) {
    const kr = _runnerKernel();
    if (kr && typeof kr.isOwnerLockFresh === 'function') return kr.isOwnerLockFresh(lock, now, TIMER_LOCK_TTL_MS);
    if (!lock || !lock.ownerTabId) return false;
    const heartbeatAt = Number(lock.heartbeatAt) || 0;
    return heartbeatAt > 0 && (now - heartbeatAt) <= TIMER_LOCK_TTL_MS;
  }

  function _remainingSecFromSnapshot(snap) {
    const kr = _runnerKernel();
    if (kr && typeof kr.remainingSecFromSnapshot === 'function') {
      return kr.remainingSecFromSnapshot(snap, { minSec: 0.5 });
    }
    const elapsedMs = Date.now() - (Number(snap.phaseStartedAt) || Date.now());
    const remainingSec = (Number(snap.durationSec) || 0) - elapsedMs / 1000;
    return remainingSec >= 0.5 ? Math.ceil(remainingSec) : 0.5;
  }

  function _acquireTimerLock(reason) {
    const ownerLock = _timerOwnerLock();
    if (ownerLock && typeof ownerLock.acquire === 'function') {
      const result = ownerLock.acquire(reason || 'start');
      if (result.ok) return true;
      const existing = result.existing || {};
      Fingers.lastTimerLockDenied = {
        key: _timerLockKey(),
        ownerTabId: existing.ownerTabId,
        heartbeatAt: existing.heartbeatAt,
        deniedAt: result.deniedAt || _now(),
        reason: result.reason === 'held-by-another-owner' ? 'held-by-another-tab' : result.reason
      };
      return false;
    }
    const now = _now();
    const existing = _readTimerLock();
    if (_isTimerLockFresh(existing, now) && existing.ownerTabId !== TIMER_TAB_ID) {
      Fingers.lastTimerLockDenied = {
        key: _timerLockKey(),
        ownerTabId: existing.ownerTabId,
        heartbeatAt: existing.heartbeatAt,
        deniedAt: now,
        reason: 'held-by-another-tab'
      };
      return false;
    }
    const next = {
      ownerTabId: TIMER_TAB_ID,
      acquiredAt: existing && existing.ownerTabId === TIMER_TAB_ID ? (existing.acquiredAt || now) : now,
      heartbeatAt: now,
      reason: reason || 'start'
    };
    if (!_writeTimerLock(next)) return true; // storage unavailable: keep legacy single-tab behavior
    const verify = _readTimerLock();
    const ok = !!(verify && verify.ownerTabId === TIMER_TAB_ID);
    if (!ok) {
      Fingers.lastTimerLockDenied = {
        key: _timerLockKey(),
        ownerTabId: verify && verify.ownerTabId,
        heartbeatAt: verify && verify.heartbeatAt,
        deniedAt: now,
        reason: 'write-race-lost'
      };
    }
    return ok;
  }

  function _touchTimerLock() {
    const ownerLock = _timerOwnerLock();
    if (ownerLock && typeof ownerLock.touch === 'function') return ownerLock.touch();
    const lock = _readTimerLock();
    if (!lock || lock.ownerTabId !== TIMER_TAB_ID) return false;
    lock.heartbeatAt = _now();
    return _writeTimerLock(lock);
  }

  function _warnTimerLockDenied() {
    try {
      const msg = 'Тренировка пальцев уже открыта в другой вкладке. Закрой или заверши её там, затем попробуй снова.';
      if (HEYS.Toast && typeof HEYS.Toast.warn === 'function') HEYS.Toast.warn(msg);
      else if (HEYS.Toast && typeof HEYS.Toast.info === 'function') HEYS.Toast.info(msg);
      else if (HEYS.Toast && typeof HEYS.Toast.show === 'function') HEYS.Toast.show(msg);
    } catch (_) { /* noop */ }
  }

  // ─── INTERNAL: useTimerCore — тонкий адаптер на kernel-ядро таймера ────────
  //
  // Реализация (тик 100ms / pause-resume / wakeLock / owner-lock heartbeat /
  // visibility-warning) вынесена в HEYS.TrainingKernel.timer.useTimerCore
  // (Этап 2 унификации запуска). Здесь — доменная инъекция: имена служебных
  // фаз (STATES), owner-lock пальцев и флаг Fingers.activeTimerLock. ВСЕ cue фаз
  // (включая SET_PREP/BIG_REST/DONE) играет caller в onPhaseEnter — см.
  // _sharedPhaseCue. Публичный контракт возврата неизменён.
  function useTimerCore(coreConfig) {
    const kt = HEYS.TrainingKernel && HEYS.TrainingKernel.timer;
    if (!kt || typeof kt.useTimerCore !== "function") {
      throw new Error("[Fingers.timer] HEYS.TrainingKernel.timer недоступен — kernel-бандл не загружен до fingers timer");
    }
    const cfg = coreConfig || {};
    return kt.useTimerCore(Object.assign({}, cfg, {
      states: {
        idle: STATES.IDLE, paused: STATES.PAUSED, done: STATES.DONE,
        aborted: STATES.ABORTED, expired: STATES.EXPIRED
      },
      lock: {
        acquire: function (reason) { return _acquireTimerLock(reason); },
        touch: function () { return _touchTimerLock(); },
        release: function () { return _removeTimerLock(); },
        onDenied: function () { _warnTimerLockDenied(); },
        heartbeatMs: TIMER_LOCK_HEARTBEAT_MS
      },
      onActiveLockChange: function (held) { Fingers.activeTimerLock = !!held; }
    }));
  }

  // ─── Hook: useCountdownCycle — hang state-graph через useTimerCore ──────────
  //
  // State-graph (hang flow):
  //   IDLE → SET_PREP(5s) → HANG(hangSec) → REST(restSec) → SET_PREP(next rep)
  //          → ... → HANG(last rep) → BIG_REST(restBetweenSetsSec) → SET_PREP
  //          → ... → HANG(last set/last rep) → DONE
  //   Orthogonal: ANY → ABORTED | PAUSED ↔ previous.
  //
  // Specific side-effects:
  //   - HANG enter: _fingerSound('fingerStart') + 'cue.go_hang' + vibrate
  //                 + wakeLock request (через wakeLockPhases=[HANG])
  //   - REST enter: _fingerSound('fingerRelease') + 'cue.rest_start' + beep
  //   SET_PREP / BIG_REST / DONE — общие cues в core.
  //
  // Public API unchanged: {state, setIdx, repIdx, secondsLeft, totalElapsed,
  //   start, startFromSnapshot, pause, resume, abort, skipPhase}.
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

    const [setIdx, setSetIdx] = React.useState(0);
    const [repIdx, setRepIdx] = React.useState(0);
    // Immediate mirrors для onAdvance (читает свежие индексы синхронно).
    const setIdxRef = React.useRef(0);
    const repIdxRef = React.useRef(0);
    setIdxRef.current = setIdx;
    repIdxRef.current = repIdx;

    // Forward-ref на core.enterPhase — нужен в onAdvance до того как core
    // инициализирован (chicken-and-egg: core.config.onAdvance замыкается на
    // enterPhase, который сам внутри core).
    const enterPhaseRef = React.useRef(null);

    const phaseGraph = React.useMemo(function () {
      const kr = _runnerKernel();
      if (!kr || typeof kr.createPhaseGraph !== 'function') return null;
      return kr.createPhaseGraph({
        initialState: STATES.IDLE,
        terminalStates: [STATES.DONE, STATES.ABORTED, STATES.EXPIRED],
        initialContext: { setIdx: 0, repIdx: 0 },
        transitions: {
          [STATES.SET_PREP]: {
            advance: function (ctx) {
              return { state: STATES.HANG, durationSec: hangSec, context: ctx };
            }
          },
          [STATES.HANG]: {
            advance: function (ctx) {
              const curSet = Number(ctx.setIdx) || 0;
              const curRep = Number(ctx.repIdx) || 0;
              const isLastRep = (curRep + 1) >= repsPerSet;
              const isLastSet = (curSet + 1) >= setsCount;
              if (isLastRep && isLastSet) return { state: STATES.DONE, durationSec: 0, context: ctx };
              if (isLastRep) return { state: STATES.BIG_REST, durationSec: restBetweenSetsSec, context: ctx };
              return { state: STATES.REST, durationSec: restSec, context: ctx };
            }
          },
          [STATES.REST]: {
            advance: function (ctx) {
              const curSet = Number(ctx.setIdx) || 0;
              const nextRep = (Number(ctx.repIdx) || 0) + 1;
              return { state: STATES.SET_PREP, durationSec: SET_PREP_SEC, context: { setIdx: curSet, repIdx: nextRep } };
            }
          },
          [STATES.BIG_REST]: {
            advance: function (ctx) {
              const nextSet = (Number(ctx.setIdx) || 0) + 1;
              return { state: STATES.SET_PREP, durationSec: SET_PREP_SEC, context: { setIdx: nextSet, repIdx: 0 } };
            }
          }
        }
      });
    }, [hangSec, restSec, repsPerSet, setsCount, restBetweenSetsSec]);

    const handleAdvance = React.useCallback(function (currentState) {
      const enterPhase = enterPhaseRef.current;
      if (!enterPhase) return;
      const curSet = setIdxRef.current;
      const curRep = repIdxRef.current;
      if (phaseGraph) {
        const next = phaseGraph.transition({
          state: currentState,
          context: { setIdx: curSet, repIdx: curRep }
        }, 'advance');
        if (!next || !next.changed) return;
        const nextSet = Number(next.context && next.context.setIdx);
        const nextRep = Number(next.context && next.context.repIdx);
        if (isFinite(nextSet) && nextSet !== curSet) {
          setSetIdx(nextSet);
          setIdxRef.current = nextSet;
        }
        if (isFinite(nextRep) && nextRep !== curRep) {
          setRepIdx(nextRep);
          repIdxRef.current = nextRep;
        }
        enterPhase(next.state, next.durationSec, next.context || {});
        return;
      }
      // SET_PREP → HANG
      if (currentState === STATES.SET_PREP) {
        enterPhase(STATES.HANG, hangSec, { setIdx: curSet, repIdx: curRep });
        return;
      }
      // HANG → REST | BIG_REST | DONE
      if (currentState === STATES.HANG) {
        const isLastRep = (curRep + 1) >= repsPerSet;
        const isLastSet = (curSet + 1) >= setsCount;
        if (isLastRep && isLastSet) { enterPhase(STATES.DONE, 0, {}); return; }
        if (isLastRep) {
          enterPhase(STATES.BIG_REST, restBetweenSetsSec, { setIdx: curSet });
          return;
        }
        enterPhase(STATES.REST, restSec, { setIdx: curSet, repIdx: curRep });
        return;
      }
      // REST → SET_PREP (next rep)
      if (currentState === STATES.REST) {
        const nextRep = curRep + 1;
        setRepIdx(nextRep);
        repIdxRef.current = nextRep;
        enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: curSet, repIdx: nextRep });
        return;
      }
      // BIG_REST → SET_PREP (next set, rep=0)
      if (currentState === STATES.BIG_REST) {
        const nextSet = curSet + 1;
        setSetIdx(nextSet);
        setRepIdx(0);
        setIdxRef.current = nextSet;
        repIdxRef.current = 0;
        enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: nextSet, repIdx: 0 });
        return;
      }
    }, [hangSec, restSec, repsPerSet, setsCount, restBetweenSetsSec, phaseGraph]);

    const handlePhaseEnter = React.useCallback(function (s, _meta) {
      // Общие cue фаз (SET_PREP/BIG_REST/DONE) — после выноса ядра играем здесь.
      _sharedPhaseCue(s);
      // Ниже — hang-state-graph-specific cues.
      if (s === STATES.HANG) {
        _fingerSound('fingerStart');
        _say('cue.go_hang');
        _vibrate([80, 60, 80]);
      } else if (s === STATES.REST) {
        _fingerSound('fingerRelease');
        _say('cue.rest_start');
        _beep('caution');
      }
    }, []);

    const getExtraMeta = React.useCallback(function () {
      return { setIdx: setIdxRef.current, repIdx: repIdxRef.current };
    }, []);

    const core = useTimerCore({
      manualPhases: [],
      wakeLockPhases: [STATES.HANG],
      visibilityWarning: true,
      activePhases: [STATES.HANG, STATES.REST, STATES.BIG_REST, STATES.SET_PREP],
      onAdvance: handleAdvance,
      onPhaseEnter: handlePhaseEnter,
      getExtraMeta: getExtraMeta,
      onStateChange: cfg.onStateChange,
      onComplete: cfg.onComplete
    });

    enterPhaseRef.current = core.enterPhase;

    const start = React.useCallback(function () {
      if (core.markSessionStart() === false) return false;
      setSetIdx(0);
      setRepIdx(0);
      setIdxRef.current = 0;
      repIdxRef.current = 0;
      core.enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: 0, repIdx: 0 });
      return true;
    }, [core]);

    // Round-в-пользу-безопасности: фаза «истекшая в фоне» не auto-completes,
    // даём короткий 0.5s tail чтобы tick дошёл до 0 и advancePhase сам перевёл.
    const startFromSnapshot = React.useCallback(function (snap) {
      if (!snap || !snap.state
          || snap.state === STATES.IDLE || snap.state === STATES.DONE
          || snap.state === STATES.ABORTED || snap.state === STATES.EXPIRED) {
        return start();
      }
      if (core.markSessionStart() === false) return false;
      const snapSetIdx = Number(snap.setIdx) || 0;
      const snapRepIdx = Number(snap.repIdx) || 0;
      setSetIdx(snapSetIdx);
      setRepIdx(snapRepIdx);
      setIdxRef.current = snapSetIdx;
      repIdxRef.current = snapRepIdx;

      const wasPaused = snap.state === STATES.PAUSED;
      const targetState = wasPaused ? (snap.resumeTo || STATES.HANG) : snap.state;
      let targetSec;
      if (wasPaused) {
        targetSec = Math.max(1, Number(snap.pausedAtRemainingSec) || 0);
      } else {
        targetSec = _remainingSecFromSnapshot(snap);
      }

      core.enterPhase(targetState, targetSec, { setIdx: snapSetIdx, repIdx: snapRepIdx });

      if (wasPaused) {
        setTimeout(function () { try { core.pause(); } catch (_) {} }, 50);
      }
      return true;
    }, [start, core]);

    return {
      state: core.state,
      setIdx: setIdx, repIdx: repIdx,
      secondsLeft: core.secondsLeft,
      totalElapsed: core.totalElapsed,
      start: start, startFromSnapshot: startFromSnapshot,
      pause: core.pause, resume: core.resume,
      abort: core.abort, skipPhase: core.skipPhase
    };
  }

  // ─── Component: CountdownDisplay ─────────────────────────────────────────
  // Wave 6 premium: phase-color theming через data-phase, круговое progress-кольцо
  // с тенью и pulse'ом digit на финальных 3 секундах HANG/REST. Breathing-ring
  // на отдыхе (медленный scale 1↔1.02) подсказывает ритм дыхания.
  function CountdownDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const Focus = HEYS.TrainingFocus;
    if (!Focus || typeof Focus.LiveCountdownDisplay !== "function") return null;

    const {
      state, secondsLeft, setIdx, totalSets, repIdx, totalReps,
      gripLabel, gripId, equipmentTier, edgeLabel, addedWeightKg, onPause, onAbort, onSkip,
    } = props || {};

    // Tier-aware grip image: block/door имеют отдельные фото; при 404 откат на
    // базовый /exercises/<gripId>.webp, затем контейнер схлопывается (imageErrorHandler).
    const tieredGripSrc = gripId
      ? (equipmentTier && equipmentTier !== "full" && equipmentTier !== "none"
          ? "/exercises/" + gripId + "_" + equipmentTier + ".webp"
          : "/exercises/" + gripId + ".webp")
      : null;
    const baseGripSrc = gripId ? "/exercises/" + gripId + ".webp" : null;

    const phaseKey = state === STATES.HANG ? "hang"
      : state === STATES.REST ? "rest"
      : state === STATES.BIG_REST ? "big-rest"
      : state === STATES.SET_PREP ? "prep"
      : state === STATES.PAUSED ? "paused"
      : state === STATES.DONE ? "done"
      : state === STATES.ABORTED ? "aborted"
      : "idle";
    const phaseLabel = state === STATES.HANG ? "ВИС"
      : state === STATES.REST ? "Отдых"
      : state === STATES.BIG_REST ? "Большой отдых"
      : state === STATES.SET_PREP ? "Готовься"
      : state === STATES.PAUSED ? "Пауза"
      : state === STATES.DONE ? "Готово!"
      : state === STATES.ABORTED ? "Прервано"
      : state === STATES.IDLE ? "Готов к старту" : state;

    const ringRadius = 86;
    const phaseMaxSec = state === STATES.HANG ? Math.max(secondsLeft, 7)
      : state === STATES.REST ? Math.max(secondsLeft, 3)
      : state === STATES.BIG_REST ? Math.max(secondsLeft, 180)
      : state === STATES.SET_PREP ? 5
      : 60;
    const ratio = Math.max(0, Math.min(1, secondsLeft / phaseMaxSec));
    const isCountingActive = state === STATES.HANG || state === STATES.REST
      || state === STATES.BIG_REST || state === STATES.SET_PREP;
    const isFinalCount = isCountingActive && secondsLeft != null && secondsLeft <= 3 && secondsLeft > 0;
    const showControls = state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED;

    const counter = (totalSets && totalReps)
      ? "Подход " + ((setIdx || 0) + 1) + "/" + totalSets + " · Повтор " + ((repIdx || 0) + 1) + "/" + totalReps
      : "";

    const chips = [];
    if (edgeLabel) chips.push({ id: "edge", label: "Грань", value: edgeLabel });
    if (addedWeightKg != null) chips.push({
      id: "weight",
      className: "heys-fingers-countdown__chip--weight",
      weightSign: addedWeightKg > 0 ? "plus" : addedWeightKg < 0 ? "minus" : "zero",
      label: "Доп. вес",
      value: (addedWeightKg > 0 ? "+" : "") + addedWeightKg + " кг"
    });

    const controls = [];
    if (showControls) {
      controls.push({ id: "pause", label: state === STATES.PAUSED ? "▶ Возобновить" : "⏸ Пауза", onClick: onPause });
      if (typeof onSkip === "function" && state !== STATES.PAUSED) {
        controls.push({ id: "skip", label: "→", onClick: onSkip, ariaLabel: "Пропустить фазу", title: "Пропустить фазу" });
      }
      controls.push({ id: "abort", label: "Прервать", onClick: onAbort, abort: true });
    }

    // Tier-fallback фото хвата: block/door → base → схлопнуть. Стейт хранится на
    // самом <img> через data-fallback-tried.
    const imageErrorHandler = function (e) {
      try {
        const el = e.target;
        if (el.getAttribute("data-fallback-tried") !== "true" && baseGripSrc && baseGripSrc !== tieredGripSrc) {
          el.setAttribute("data-fallback-tried", "true");
          el.src = baseGripSrc;
          return;
        }
        el.parentNode.style.display = "none";
      } catch (_) {}
    };

    return h(Focus.LiveCountdownDisplay, {
      baseClass: "heys-fingers-countdown",
      phaseKey: phaseKey,
      phaseLabel: phaseLabel,
      counter: counter,
      title: gripLabel || null,
      image: gripId ? tieredGripSrc : null,
      imageAlt: gripLabel || gripId || "",
      imageLoading: "eager",
      imageErrorHandler: imageErrorHandler,
      chips: chips,
      digit: String(Math.max(0, secondsLeft | 0)),
      ratio: ratio,
      finalCount: isFinalCount,
      ringRadius: ringRadius,
      beforeControls: (showControls && Fingers.VoiceMiniControls) ? h(Fingers.VoiceMiniControls, null) : null,
      controls: controls
    });
  }

  // ─── Hook: useRepsCycle (Step 2 / ревью #9 scope) ────────────────────────────
  //
  // State graph (A-структура, ревью #8):
  //   IDLE → SET_PREP (5s) → REPS_INPUT (юзер сам жмёт completeSet()) →
  //     если последний сет → DONE; иначе → BIG_REST (restSetsSec) → SET_PREP …
  //   Orthogonal: ANY → ABORTED | PAUSED → previous.
  //
  // Отличия от useCountdownCycle:
  //   - НЕТ HANG/REST под-таймера в сете (повторы непрерывны, юзер пейсит).
  //   - Внутри сета — состояние REPS_INPUT, ждёт `completeSet()` от view.
  //   - reps в config — диапазон [min,max] или число, машина его НЕ использует;
  //     это для display (Step 3 RepsCounterDisplay).
  //   - addedWeightKg в config — тоже для display.
  //
  // API ПАРАЛЛЕЛЕН useCountdownCycle (одни callbacks, один shape return) →
  // ExerciseRunner (Step 4) подключает любой из хуков через один shell.
  // ─── Hook: useRepsCycle — reps state-graph через useTimerCore ───────────────
  //
  // State-graph (reps flow):
  //   IDLE → SET_PREP(5s) → REPS_INPUT (manual; ждёт completeSet()) →
  //         если последний сет → DONE; иначе → BIG_REST(restBetweenSetsSec)
  //         → SET_PREP → ...
  //   Orthogonal: ANY → ABORTED | PAUSED ↔ previous.
  //
  // Отличия от useCountdownCycle:
  //   - REPS_INPUT — manual phase (нет тика, ждёт completeSet()).
  //   - Нет HANG/REST внутрисетового цикла.
  //   - Дополнительный API: completeSet(); skipPhase в REPS_INPUT = completeSet.
  //
  // Public API unchanged: {state, setIdx, repIdx:0, secondsLeft, totalElapsed,
  //   start, startFromSnapshot, pause, resume, abort, completeSet, skipPhase}.
  function useRepsCycle(config) {
    const React = global.React;
    if (!React) {
      console.warn('[Fingers.useRepsCycle] React not loaded — returning stub');
      return { state: STATES.IDLE, setIdx: 0, repIdx: 0, secondsLeft: 0, totalElapsed: 0,
        start: () => {}, pause: () => {}, resume: () => {}, abort: () => {},
        completeSet: () => {}, skipPhase: () => {}, startFromSnapshot: () => {} };
    }

    const cfg = config || {};
    const setsCount = Math.max(1, Number(cfg.setsCount || cfg.sets) || 3);
    const restBetweenSetsSec = Number(cfg.restBetweenSetsSec || cfg.restSetsSec) || 60;

    const [setIdx, setSetIdx] = React.useState(0);
    const setIdxRef = React.useRef(0);
    setIdxRef.current = setIdx;

    const enterPhaseRef = React.useRef(null);

    const phaseGraph = React.useMemo(function () {
      const kr = _runnerKernel();
      if (!kr || typeof kr.createPhaseGraph !== 'function') return null;
      return kr.createPhaseGraph({
        initialState: STATES.IDLE,
        terminalStates: [STATES.DONE, STATES.ABORTED, STATES.EXPIRED],
        initialContext: { setIdx: 0, repIdx: 0 },
        transitions: {
          [STATES.SET_PREP]: {
            advance: function (ctx) {
              return { state: STATES.REPS_INPUT, durationSec: 0, context: ctx };
            }
          },
          [STATES.BIG_REST]: {
            advance: function (ctx) {
              const nextSet = (Number(ctx.setIdx) || 0) + 1;
              return { state: STATES.SET_PREP, durationSec: SET_PREP_SEC, context: { setIdx: nextSet, repIdx: 0 } };
            }
          },
          [STATES.REPS_INPUT]: {
            complete: function (ctx) {
              const curSet = Number(ctx.setIdx) || 0;
              const isLastSet = (curSet + 1) >= setsCount;
              return {
                state: isLastSet ? STATES.DONE : STATES.BIG_REST,
                durationSec: isLastSet ? 0 : restBetweenSetsSec,
                context: { setIdx: curSet, repIdx: 0 }
              };
            }
          }
        }
      });
    }, [setsCount, restBetweenSetsSec]);

    const handleAdvance = React.useCallback(function (currentState) {
      const enterPhase = enterPhaseRef.current;
      if (!enterPhase) return;
      const curSet = setIdxRef.current;
      if (phaseGraph) {
        const next = phaseGraph.transition({
          state: currentState,
          context: { setIdx: curSet, repIdx: 0 }
        }, 'advance');
        if (!next || !next.changed) return;
        const nextSet = Number(next.context && next.context.setIdx);
        if (isFinite(nextSet) && nextSet !== curSet) {
          setSetIdx(nextSet);
          setIdxRef.current = nextSet;
        }
        enterPhase(next.state, next.durationSec, next.context || {});
        return;
      }
      // SET_PREP → REPS_INPUT (manual)
      if (currentState === STATES.SET_PREP) {
        enterPhase(STATES.REPS_INPUT, 0, { setIdx: curSet });
        return;
      }
      // BIG_REST → SET_PREP (next set)
      if (currentState === STATES.BIG_REST) {
        const nextSet = curSet + 1;
        setSetIdx(nextSet);
        setIdxRef.current = nextSet;
        enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: nextSet });
        return;
      }
    }, [phaseGraph]);

    const handlePhaseEnter = React.useCallback(function (s, _meta) {
      // Общие cue фаз (SET_PREP/BIG_REST/DONE) — после выноса ядра играем здесь.
      _sharedPhaseCue(s);
      // REPS_INPUT — manual cue (юзер начинает повторы) + vibrate.
      // wakeLock на REPS_INPUT — запрашивает core (wakeLockPhases ниже).
      if (s === STATES.REPS_INPUT) {
        _say('cue.go_reps');
        _vibrate([80, 60, 80]);
      }
    }, []);

    const getExtraMeta = React.useCallback(function () {
      // repIdx всегда 0 в reps-cycle (нет внутрисетового цикла); pause/resume
      // оригинальной useRepsCycle передавал repIdx:0, сохраняем для совместимости.
      return { setIdx: setIdxRef.current, repIdx: 0 };
    }, []);

    const core = useTimerCore({
      manualPhases: [STATES.REPS_INPUT],
      wakeLockPhases: [STATES.REPS_INPUT],
      visibilityWarning: false, // reps без visibility-toast (legacy parity)
      activePhases: [],
      onAdvance: handleAdvance,
      onPhaseEnter: handlePhaseEnter,
      getExtraMeta: getExtraMeta,
      onStateChange: cfg.onStateChange,
      onComplete: cfg.onComplete
    });

    enterPhaseRef.current = core.enterPhase;

    const start = React.useCallback(function () {
      if (core.markSessionStart() === false) return false;
      setSetIdx(0);
      setIdxRef.current = 0;
      core.enterPhase(STATES.SET_PREP, SET_PREP_SEC, { setIdx: 0 });
      return true;
    }, [core]);

    // Reps-specific manual advance: юзер сигналит «подход выполнен».
    // Из REPS_INPUT → BIG_REST (если ещё есть сеты) или DONE (последний).
    const completeSet = React.useCallback(function () {
      const currentState = core.getCurrentState ? core.getCurrentState() : core.state;
      if (currentState !== STATES.REPS_INPUT) return;
      const curSet = setIdxRef.current;
      if (phaseGraph) {
        const next = phaseGraph.transition({
          state: currentState,
          context: { setIdx: curSet, repIdx: 0 }
        }, 'complete');
        if (!next || !next.changed) return;
        core.enterPhase(next.state, next.durationSec, next.context || {});
        return;
      }
      const isLastSet = (curSet + 1) >= setsCount;
      if (isLastSet) {
        core.enterPhase(STATES.DONE, 0, { setIdx: curSet });
      } else {
        core.enterPhase(STATES.BIG_REST, restBetweenSetsSec, { setIdx: curSet });
      }
    }, [core, setsCount, restBetweenSetsSec, phaseGraph]);

    // skipPhase для REPS_INPUT эквивалентен completeSet — core делегирует
    // skipPhase в onAdvance, но onAdvance не обрабатывает REPS_INPUT (это
    // manual phase). Перехватываем здесь: если REPS_INPUT — completeSet;
    // иначе core.skipPhase (для timed фаз).
    const skipPhase = React.useCallback(function () {
      const currentState = core.getCurrentState ? core.getCurrentState() : core.state;
      if (currentState === STATES.REPS_INPUT) {
        completeSet();
        return;
      }
      core.skipPhase();
    }, [core, completeSet]);

    const startFromSnapshot = React.useCallback(function (snap) {
      if (!snap || !snap.state
          || snap.state === STATES.IDLE || snap.state === STATES.DONE
          || snap.state === STATES.ABORTED || snap.state === STATES.EXPIRED) {
        return start();
      }
      if (core.markSessionStart() === false) return false;
      const snapSetIdx = Number(snap.setIdx) || 0;
      setSetIdx(snapSetIdx);
      setIdxRef.current = snapSetIdx;

      const wasPaused = snap.state === STATES.PAUSED;
      const targetState = wasPaused ? (snap.resumeTo || STATES.REPS_INPUT) : snap.state;

      if (targetState === STATES.REPS_INPUT) {
        // Manual фаза — продолжаем с нуля (юзер сам жмёт completeSet).
        core.enterPhase(STATES.REPS_INPUT, 0, { setIdx: snapSetIdx });
      } else {
        let targetSec;
        if (wasPaused) {
          targetSec = Math.max(1, Number(snap.pausedAtRemainingSec) || 0);
        } else {
          targetSec = _remainingSecFromSnapshot(snap);
        }
        core.enterPhase(targetState, targetSec, { setIdx: snapSetIdx });
      }

      if (wasPaused) {
        setTimeout(function () { try { core.pause(); } catch (_) {} }, 50);
      }
      return true;
    }, [start, core]);

    return {
      state: core.state,
      setIdx: setIdx, repIdx: 0,
      secondsLeft: core.secondsLeft,
      totalElapsed: core.totalElapsed,
      start: start, startFromSnapshot: startFromSnapshot,
      pause: core.pause, resume: core.resume,
      abort: core.abort,
      completeSet: completeSet, skipPhase: skipPhase
    };
  }

  // ─── Component: RepsCounterDisplay (Step 3 / ревью #9 scope) ─────────────────
  //
  // View для reps-сессии. Зеркалит CountdownDisplay props где общие
  // (state, setIdx, totalSets, secondsLeft, gripLabel, edgeLabel, addedWeightKg,
  //  onPause, onAbort), плюс reps-специфичные:
  //   - reps: number | [min, max] | null — целевые повторы (display)
  //   - onSetDone — кнопка «Подход выполнен» (вызывает useRepsCycle.completeSet())
  //
  // Phase-rendering:
  //   - SET_PREP — таймер countdown (как hang); preview «N повт. × M подх.»
  //   - REPS_INPUT — БОЛЬШАЯ кнопка «Подход выполнен», без ring, с reps-target
  //     и addedWeight chip. Это и есть отличие от hang.
  //   - BIG_REST — countdown ring (как hang).
  //   - PAUSED/DONE/ABORTED — как hang.
  function RepsCounterDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const {
      state, secondsLeft, setIdx, totalSets,
      reps, addedWeightKg,
      gripLabel, gripId, equipmentTier, edgeLabel,
      onSetDone, onPause, onAbort, onSkip,
    } = props || {};

    // Reuse hero/chip CSS из countdown (тот же data-phase theming).
    const tieredGripSrc = gripId
      ? (equipmentTier && equipmentTier !== 'full' && equipmentTier !== 'none'
          ? '/exercises/' + gripId + '_' + equipmentTier + '.webp'
          : '/exercises/' + gripId + '.webp')
      : null;
    const baseGripSrc = gripId ? '/exercises/' + gripId + '.webp' : null;

    const phaseKey = state === STATES.REPS_INPUT ? 'reps'
      : state === STATES.BIG_REST ? 'big-rest'
      : state === STATES.SET_PREP ? 'prep'
      : state === STATES.PAUSED ? 'paused'
      : state === STATES.DONE ? 'done'
      : state === STATES.ABORTED ? 'aborted'
      : 'idle';

    const phaseLabel = state === STATES.REPS_INPUT ? 'ПОВТОРЫ'
      : state === STATES.BIG_REST ? 'Большой отдых'
      : state === STATES.SET_PREP ? 'Готовься'
      : state === STATES.PAUSED ? 'Пауза'
      : state === STATES.DONE ? 'Готово!'
      : state === STATES.ABORTED ? 'Прервано'
      : state === STATES.IDLE ? 'Готов к старту' : state;

    // Reps target в человеко-читаемом виде.
    const repsLabel = (function () {
      if (Array.isArray(reps) && reps.length >= 2) {
        return reps[0] + '–' + reps[1] + ' повт.';
      }
      if (typeof reps === 'number' && isFinite(reps) && reps > 0) {
        return reps + ' повт.';
      }
      return 'Подход';
    })();

    const showControls = state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED;
    const isManualReps = state === STATES.REPS_INPUT;

    // SVG ring — только для TIMED фаз (SET_PREP, BIG_REST); REPS_INPUT без ring.
    const isTimedPhase = state === STATES.SET_PREP || state === STATES.BIG_REST;
    const ringRadius = 86;
    const ringCircum = 2 * Math.PI * ringRadius;
    const phaseMaxSec = state === STATES.SET_PREP ? 5
      : state === STATES.BIG_REST ? Math.max(secondsLeft, 60) : 1;
    const ratio = isTimedPhase ? Math.max(0, Math.min(1, secondsLeft / phaseMaxSec)) : 0;
    const dashoffset = ringCircum * (1 - ratio);
    const isFinalCount = isTimedPhase && secondsLeft != null && secondsLeft <= 3 && secondsLeft > 0;

    return h('div', {
      className: 'heys-fingers-countdown heys-fingers-reps-counter',
      'data-phase': phaseKey
    },
      // Set counter (без rep-counter — повторы manual)
      h('div', { className: 'heys-fingers-countdown__counter' },
        totalSets ? ('Подход ' + ((setIdx || 0) + 1) + '/' + totalSets) : ''
      ),

      gripLabel ? h('h2', { className: 'heys-fingers-countdown__grip' }, gripLabel) : null,

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

      h('div', { className: 'heys-fingers-countdown__phase-badge' }, phaseLabel),

      // Центральная зона: либо ring+digit (timed), либо большая reps-кнопка (manual).
      isManualReps
        ? h('div', { className: 'heys-fingers-reps-counter__manual' },
            h('div', { className: 'heys-fingers-reps-counter__target' }, repsLabel),
            h('button', {
              type: 'button',
              className: 'heys-fingers-reps-counter__done-btn',
              onClick: onSetDone,
              'aria-label': 'Подход выполнен'
            }, '✓ Подход выполнен')
          )
        : h('div', { className: 'heys-fingers-countdown__ring-wrap' },
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

      showControls ? h('div', { className: 'heys-fingers-countdown__controls' },
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

  // ─── Component: ContinuousDisplay (Шаг 5 / non-hang doseShape: continuous) ───
  //
  // View для continuous-сессии (ARC, mileage, technique drills): один большой
  // workSec-таймер на сет. Reuses useCountdownCycle (hangSec=workSec, repsPerSet=1,
  // setsCount=sets). Differences vs CountdownDisplay:
  //   - HANG-phase label → 'РАБОТА' (semantically «непрерывная работа», не вис).
  //   - Без rep-counter — только 'Подход N/M' (или ничего, если sets=1).
  //   - phaseMaxSec для HANG = workSec (long progress ring без clamp на 7с).
  //   - Optional `durationMinLabel` chip (например «30 мин» для ARC) — replaces
  //     edge/addedWeight chips для continuous-атомов (у них нет veca/edge).
  function ContinuousDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const {
      state, secondsLeft, setIdx, totalSets,
      workSec, durationMinLabel, gripLabel, gripId, equipmentTier,
      onPause, onAbort, onSkip,
    } = props || {};

    const tieredGripSrc = gripId
      ? (equipmentTier && equipmentTier !== 'full' && equipmentTier !== 'none'
          ? '/exercises/' + gripId + '_' + equipmentTier + '.webp'
          : '/exercises/' + gripId + '.webp')
      : null;
    const baseGripSrc = gripId ? '/exercises/' + gripId + '.webp' : null;

    const phaseKey = state === STATES.HANG ? 'work'
      : state === STATES.BIG_REST ? 'big-rest'
      : state === STATES.SET_PREP ? 'prep'
      : state === STATES.PAUSED ? 'paused'
      : state === STATES.DONE ? 'done'
      : state === STATES.ABORTED ? 'aborted'
      : 'idle';

    const phaseLabel = state === STATES.HANG ? 'РАБОТА'
      : state === STATES.BIG_REST ? 'Большой отдых'
      : state === STATES.SET_PREP ? 'Готовься'
      : state === STATES.PAUSED ? 'Пауза'
      : state === STATES.DONE ? 'Готово!'
      : state === STATES.ABORTED ? 'Прервано'
      : state === STATES.IDLE ? 'Готов к старту' : state;

    const ringRadius = 86;
    const ringCircum = 2 * Math.PI * ringRadius;
    const workClamp = Math.max(Number(workSec) || 0, 60);
    const phaseMaxSec = state === STATES.HANG ? workClamp
      : state === STATES.BIG_REST ? Math.max(secondsLeft, 180)
      : state === STATES.SET_PREP ? 5
      : 60;
    const ratio = Math.max(0, Math.min(1, secondsLeft / phaseMaxSec));
    const dashoffset = ringCircum * (1 - ratio);

    const isCountingActive = state === STATES.HANG || state === STATES.BIG_REST
      || state === STATES.SET_PREP;
    const isFinalCount = isCountingActive && secondsLeft != null && secondsLeft <= 3 && secondsLeft > 0;
    const showControls = state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED;

    // For long workSec (>=60s) — показываем mm:ss, иначе s.
    // Решение по СЫРОМУ workSec, не по workClamp (иначе short atom 30s
    // получит '0:30' вместо '30').
    const rawWorkSec = Number(workSec) || 0;
    const digitLabel = (function () {
      const sec = Math.max(0, secondsLeft | 0);
      if (state === STATES.HANG && rawWorkSec >= 60) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return m + ':' + (s < 10 ? '0' + s : String(s));
      }
      return String(sec);
    })();

    return h('div', {
      className: 'heys-fingers-countdown heys-fingers-continuous',
      'data-phase': phaseKey
    },
      h('div', { className: 'heys-fingers-countdown__counter' },
        totalSets && totalSets > 1 ? ('Подход ' + ((setIdx || 0) + 1) + '/' + totalSets) : ''
      ),

      gripLabel ? h('h2', { className: 'heys-fingers-countdown__grip' }, gripLabel) : null,

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

      durationMinLabel ? h('div', { className: 'heys-fingers-countdown__chips' },
        h('div', { className: 'heys-fingers-countdown__chip' },
          h('span', { className: 'heys-fingers-countdown__chip-label' }, 'Длительность'),
          h('span', { className: 'heys-fingers-countdown__chip-value' }, durationMinLabel)
        )
      ) : null,

      h('div', { className: 'heys-fingers-countdown__phase-badge' }, phaseLabel),

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
        }, digitLabel)
      ),

      showControls ? h('div', { className: 'heys-fingers-countdown__controls' },
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

  // ─── Component: AttemptsDisplay (Шаг 5b / non-hang doseShape: attempts) ──────
  //
  // View для attempts-сессии (лимит-болдер, дайно, кампус, RFD pulls): серия
  // коротких атак (1-5 движений / 1-5 сек) с длинным отдыхом 150-300с между.
  // Reuses useRepsCycle (manual phase = ATTEMPT_INPUT, BIG_REST = rest между
  // попытками). Differences vs RepsCounterDisplay:
  //   - REPS_INPUT phase label → 'ПОПЫТКА' (не 'ПОВТОРЫ').
  //   - counter → 'Попытка N/M' (не 'Подход').
  //   - doneBtn → '✓ Попытка выполнена'.
  //   - movesPerAttempt → target chip ('3 движения' / '1-5 движений').
  //   - BIG_REST badge → 'Отдых между попытками'.
  function AttemptsDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const {
      state, secondsLeft, setIdx, totalAttempts,
      movesPerAttempt, addedWeightKg,
      gripLabel, gripId, equipmentTier, edgeLabel,
      onAttemptDone, onPause, onAbort, onSkip,
    } = props || {};

    const tieredGripSrc = gripId
      ? (equipmentTier && equipmentTier !== 'full' && equipmentTier !== 'none'
          ? '/exercises/' + gripId + '_' + equipmentTier + '.webp'
          : '/exercises/' + gripId + '.webp')
      : null;
    const baseGripSrc = gripId ? '/exercises/' + gripId + '.webp' : null;

    const phaseKey = state === STATES.REPS_INPUT ? 'attempt'
      : state === STATES.BIG_REST ? 'big-rest'
      : state === STATES.SET_PREP ? 'prep'
      : state === STATES.PAUSED ? 'paused'
      : state === STATES.DONE ? 'done'
      : state === STATES.ABORTED ? 'aborted'
      : 'idle';

    const phaseLabel = state === STATES.REPS_INPUT ? 'ПОПЫТКА'
      : state === STATES.BIG_REST ? 'Отдых между попытками'
      : state === STATES.SET_PREP ? 'Готовься'
      : state === STATES.PAUSED ? 'Пауза'
      : state === STATES.DONE ? 'Готово!'
      : state === STATES.ABORTED ? 'Прервано'
      : state === STATES.IDLE ? 'Готов к старту' : state;

    // Moves target в человеко-читаемом виде.
    const movesLabel = (function () {
      if (Array.isArray(movesPerAttempt) && movesPerAttempt.length >= 2) {
        return movesPerAttempt[0] + '–' + movesPerAttempt[1] + ' движ.';
      }
      if (typeof movesPerAttempt === 'number' && isFinite(movesPerAttempt) && movesPerAttempt > 0) {
        return movesPerAttempt + ' движ.';
      }
      return 'Попытка';
    })();

    const showControls = state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED;
    const isManualAttempt = state === STATES.REPS_INPUT;

    const isTimedPhase = state === STATES.SET_PREP || state === STATES.BIG_REST;
    const ringRadius = 86;
    const ringCircum = 2 * Math.PI * ringRadius;
    const phaseMaxSec = state === STATES.SET_PREP ? 5
      : state === STATES.BIG_REST ? Math.max(secondsLeft, 60) : 1;
    const ratio = isTimedPhase ? Math.max(0, Math.min(1, secondsLeft / phaseMaxSec)) : 0;
    const dashoffset = ringCircum * (1 - ratio);
    const isFinalCount = isTimedPhase && secondsLeft != null && secondsLeft <= 3 && secondsLeft > 0;

    return h('div', {
      className: 'heys-fingers-countdown heys-fingers-attempts',
      'data-phase': phaseKey
    },
      h('div', { className: 'heys-fingers-countdown__counter' },
        totalAttempts ? ('Попытка ' + ((setIdx || 0) + 1) + '/' + totalAttempts) : ''
      ),

      gripLabel ? h('h2', { className: 'heys-fingers-countdown__grip' }, gripLabel) : null,

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

      h('div', { className: 'heys-fingers-countdown__phase-badge' }, phaseLabel),

      isManualAttempt
        ? h('div', { className: 'heys-fingers-reps-counter__manual' },
            h('div', { className: 'heys-fingers-reps-counter__target' }, movesLabel),
            h('button', {
              type: 'button',
              className: 'heys-fingers-reps-counter__done-btn',
              onClick: onAttemptDone,
              'aria-label': 'Попытка выполнена'
            }, '✓ Попытка выполнена')
          )
        : h('div', { className: 'heys-fingers-countdown__ring-wrap' },
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

      showControls ? h('div', { className: 'heys-fingers-countdown__controls' },
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

  // ─── Component: CircuitDisplay (Шаг 5c / non-hang doseShape: circuit) ────────
  //
  // View для circuit-сессии (4x4, EMOM, связки, повторы трассы, power intervals):
  // serie of rounds где каждый round = N problems с rest restRoundsSec между.
  // Reuses useRepsCycle (manual + timed rest). Differences vs AttemptsDisplay:
  //   - REPS_INPUT phase label → 'РАУНД'
  //   - counter → 'Раунд N/M'
  //   - doneBtn → '✓ Раунд выполнен'
  //   - problemsPerRound → target chip ('4 проблемы' / '1 связка')
  //   - BIG_REST badge → 'Отдых между раундами'
  function CircuitDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const {
      state, secondsLeft, setIdx, totalRounds,
      problemsPerRound, gripLabel, gripId, equipmentTier, edgeLabel,
      onRoundDone, onPause, onAbort, onSkip,
    } = props || {};

    const tieredGripSrc = gripId
      ? (equipmentTier && equipmentTier !== 'full' && equipmentTier !== 'none'
          ? '/exercises/' + gripId + '_' + equipmentTier + '.webp'
          : '/exercises/' + gripId + '.webp')
      : null;
    const baseGripSrc = gripId ? '/exercises/' + gripId + '.webp' : null;

    const phaseKey = state === STATES.REPS_INPUT ? 'round'
      : state === STATES.BIG_REST ? 'big-rest'
      : state === STATES.SET_PREP ? 'prep'
      : state === STATES.PAUSED ? 'paused'
      : state === STATES.DONE ? 'done'
      : state === STATES.ABORTED ? 'aborted'
      : 'idle';

    const phaseLabel = state === STATES.REPS_INPUT ? 'РАУНД'
      : state === STATES.BIG_REST ? 'Отдых между раундами'
      : state === STATES.SET_PREP ? 'Готовься'
      : state === STATES.PAUSED ? 'Пауза'
      : state === STATES.DONE ? 'Готово!'
      : state === STATES.ABORTED ? 'Прервано'
      : state === STATES.IDLE ? 'Готов к старту' : state;

    // Problems-per-round target в человеко-читаемом виде.
    const problemsLabel = (function () {
      const n = Number(problemsPerRound);
      if (!isFinite(n) || n <= 0) return 'Раунд';
      if (n === 1) return '1 проблема';
      if (n >= 2 && n <= 4) return n + ' проблемы';
      return n + ' проблем';
    })();

    const showControls = state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED;
    const isManualRound = state === STATES.REPS_INPUT;

    const isTimedPhase = state === STATES.SET_PREP || state === STATES.BIG_REST;
    const ringRadius = 86;
    const ringCircum = 2 * Math.PI * ringRadius;
    const phaseMaxSec = state === STATES.SET_PREP ? 5
      : state === STATES.BIG_REST ? Math.max(secondsLeft, 60) : 1;
    const ratio = isTimedPhase ? Math.max(0, Math.min(1, secondsLeft / phaseMaxSec)) : 0;
    const dashoffset = ringCircum * (1 - ratio);
    const isFinalCount = isTimedPhase && secondsLeft != null && secondsLeft <= 3 && secondsLeft > 0;

    return h('div', {
      className: 'heys-fingers-countdown heys-fingers-circuit',
      'data-phase': phaseKey
    },
      h('div', { className: 'heys-fingers-countdown__counter' },
        totalRounds ? ('Раунд ' + ((setIdx || 0) + 1) + '/' + totalRounds) : ''
      ),

      gripLabel ? h('h2', { className: 'heys-fingers-countdown__grip' }, gripLabel) : null,

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

      edgeLabel ? h('div', { className: 'heys-fingers-countdown__chips' },
        h('div', { className: 'heys-fingers-countdown__chip' },
          h('span', { className: 'heys-fingers-countdown__chip-label' }, 'Грань'),
          h('span', { className: 'heys-fingers-countdown__chip-value' }, edgeLabel)
        )
      ) : null,

      h('div', { className: 'heys-fingers-countdown__phase-badge' }, phaseLabel),

      isManualRound
        ? h('div', { className: 'heys-fingers-reps-counter__manual' },
            h('div', { className: 'heys-fingers-reps-counter__target' }, problemsLabel),
            h('button', {
              type: 'button',
              className: 'heys-fingers-reps-counter__done-btn',
              onClick: onRoundDone,
              'aria-label': 'Раунд выполнен'
            }, '✓ Раунд выполнен')
          )
        : h('div', { className: 'heys-fingers-countdown__ring-wrap' },
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

      showControls ? h('div', { className: 'heys-fingers-countdown__controls' },
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

  // ─── Component: ProcessDisplay (Шаг 5d / non-hang doseShape: process) ────────
  //
  // View для process-сессии (тактика redpoint: разбор трассы на сегменты,
  // beta-план, точки отдыха, дыхание, меморизация). Это не timed работа — это
  // когнитивный процесс. UX: чек-лист item'ов, юзер ставит галочки по мере
  // прохождения, кнопка «Закончить» (= cycle.completeSet). Reuses useRepsCycle
  // c setsCount=1 (один проход чек-листа → DONE).
  // Differences vs RepsCounterDisplay:
  //   - REPS_INPUT phase → CHECKLIST UI (список items с checkbox'ами).
  //   - phaseLabel REPS_INPUT → 'ПРОЦЕСС'.
  //   - doneBtn enabled только когда хотя бы один item отмечен (опциональная
  //     валидация — все галки не обязательно для completion).
  function ProcessDisplay(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;

    const {
      state, secondsLeft, checklist,
      gripLabel, gripId, equipmentTier,
      onProcessDone, onPause, onAbort, onSkip,
    } = props || {};

    const [checked, setChecked] = React.useState({});
    const items = Array.isArray(checklist) ? checklist : [];
    const anyChecked = Object.keys(checked).some((k) => checked[k]);

    const tieredGripSrc = gripId
      ? (equipmentTier && equipmentTier !== 'full' && equipmentTier !== 'none'
          ? '/exercises/' + gripId + '_' + equipmentTier + '.webp'
          : '/exercises/' + gripId + '.webp')
      : null;
    const baseGripSrc = gripId ? '/exercises/' + gripId + '.webp' : null;

    const phaseKey = state === STATES.REPS_INPUT ? 'process'
      : state === STATES.SET_PREP ? 'prep'
      : state === STATES.PAUSED ? 'paused'
      : state === STATES.DONE ? 'done'
      : state === STATES.ABORTED ? 'aborted'
      : 'idle';

    const phaseLabel = state === STATES.REPS_INPUT ? 'ПРОЦЕСС'
      : state === STATES.SET_PREP ? 'Готовься'
      : state === STATES.PAUSED ? 'Пауза'
      : state === STATES.DONE ? 'Готово!'
      : state === STATES.ABORTED ? 'Прервано'
      : state === STATES.IDLE ? 'Готов к старту' : state;

    const showControls = state !== STATES.IDLE && state !== STATES.DONE && state !== STATES.ABORTED;
    const isProcessPhase = state === STATES.REPS_INPUT;
    const isTimedPhase = state === STATES.SET_PREP;
    const ringRadius = 86;
    const ringCircum = 2 * Math.PI * ringRadius;
    const phaseMaxSec = state === STATES.SET_PREP ? 5 : 1;
    const ratio = isTimedPhase ? Math.max(0, Math.min(1, secondsLeft / phaseMaxSec)) : 0;
    const dashoffset = ringCircum * (1 - ratio);
    const isFinalCount = isTimedPhase && secondsLeft != null && secondsLeft <= 3 && secondsLeft > 0;

    function toggleItem(idx) {
      setChecked(function (prev) {
        const next = Object.assign({}, prev);
        next[idx] = !prev[idx];
        return next;
      });
    }

    return h('div', {
      className: 'heys-fingers-countdown heys-fingers-process',
      'data-phase': phaseKey
    },
      gripLabel ? h('h2', { className: 'heys-fingers-countdown__grip' }, gripLabel) : null,

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

      h('div', { className: 'heys-fingers-countdown__phase-badge' }, phaseLabel),

      isProcessPhase
        ? h('div', { className: 'heys-fingers-process__checklist' },
            items.length === 0
              ? h('div', { className: 'heys-fingers-process__empty' },
                  'Пройди процесс по своему чек-листу')
              : items.map(function (item, idx) {
                  const id = 'heys-fingers-process-item-' + idx;
                  return h('label', {
                    key: idx,
                    className: 'heys-fingers-process__item'
                      + (checked[idx] ? ' is-checked' : ''),
                    htmlFor: id
                  },
                    h('input', {
                      id: id,
                      type: 'checkbox',
                      checked: !!checked[idx],
                      onChange: function () { toggleItem(idx); }
                    }),
                    h('span', { className: 'heys-fingers-process__item-text' }, item)
                  );
                }),
            h('button', {
              type: 'button',
              className: 'heys-fingers-reps-counter__done-btn'
                + (items.length > 0 && !anyChecked ? ' is-disabled' : ''),
              onClick: onProcessDone,
              disabled: items.length > 0 && !anyChecked,
              'aria-label': 'Закончить процесс'
            }, '✓ Закончить')
          )
        : h('div', { className: 'heys-fingers-countdown__ring-wrap' },
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

      showControls ? h('div', { className: 'heys-fingers-countdown__controls' },
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
  Fingers.useRepsCycle = useRepsCycle;
  Fingers.CountdownDisplay = CountdownDisplay;
  Fingers.RepsCounterDisplay = RepsCounterDisplay;
  Fingers.ContinuousDisplay = ContinuousDisplay;
  Fingers.AttemptsDisplay = AttemptsDisplay;
  Fingers.CircuitDisplay = CircuitDisplay;
  Fingers.ProcessDisplay = ProcessDisplay;
})(typeof window !== 'undefined' ? window : globalThis);
