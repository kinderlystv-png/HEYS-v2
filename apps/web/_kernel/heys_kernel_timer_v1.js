// heys_kernel_timer_v1.js — домен-агностичное ядро таймера тренировочной сессии.
//
// Извлечено из доменного timer'а (А4 strangler-консолидация, Этап 2 унификации
// запуска). Управляет: React-state (state/secondsLeft/totalElapsed), tick-петлёй
// 100ms, pause/resume с remaining-tracking, wakeLock, owner-lock heartbeat,
// visibility-warning, cleanup. State-graph и все звуковые/тактильные cue
// делегированы caller'у — ядро НЕ содержит доменных понятий.
//
// Public API:
//   const core = HEYS.TrainingKernel.timer.useTimerCore({
//     states: { idle, paused, done, aborted, expired },   // имена служебных фаз
//     manualPhases: [], wakeLockPhases: [], activePhases: [], visibilityWarning,
//     onAdvance(currentState), onPhaseEnter(state, meta), getExtraMeta(),
//     onStateChange(state, meta), onComplete(),
//     lock: { acquire(reason)->bool, touch()->bool, release(), onDenied(), heartbeatMs },
//     onActiveLockChange(held)
//   });
//   // core: { state, secondsLeft, totalElapsed, enterPhase, pause, resume,
//   //         abort, skipPhase, markSessionStart, getCurrentState }
//
// Контракт: enterPhase + skipPhase + pause/resume — единственный путь изменения
// state. lock / wakeLock — single-owner (только ядро их трогает). Все cue фаз
// (включая SET_PREP/BIG_REST/DONE) caller играет в onPhaseEnter — ядро их не знает.

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.timer && TK.timer.useTimerCore) return; // idempotent

  const TICK_MS = 100;
  const DEFAULT_HEARTBEAT_MS = 2000;

  // Дефолтные имена служебных фаз. Совпадают с каноническим словарём доменов
  // (нейтральные служебные имена, без доменных понятий). Caller вправе переопределить.
  const DEFAULT_STATES = {
    idle: 'IDLE',
    paused: 'PAUSED',
    done: 'DONE',
    aborted: 'ABORTED',
    expired: 'EXPIRED'
  };

  function _now() { return Date.now(); }

  function _noop() { return false; }

  function _normalizeStates(states) {
    const s = states || {};
    return {
      idle: s.idle || DEFAULT_STATES.idle,
      paused: s.paused || DEFAULT_STATES.paused,
      done: s.done || DEFAULT_STATES.done,
      aborted: s.aborted || DEFAULT_STATES.aborted,
      expired: s.expired || DEFAULT_STATES.expired
    };
  }

  function _normalizeLock(lock) {
    const l = lock || {};
    return {
      acquire: typeof l.acquire === 'function' ? l.acquire : function () { return true; },
      touch: typeof l.touch === 'function' ? l.touch : function () { return true; },
      release: typeof l.release === 'function' ? l.release : function () {},
      onDenied: typeof l.onDenied === 'function' ? l.onDenied : function () {},
      heartbeatMs: Number(l.heartbeatMs) > 0 ? Number(l.heartbeatMs) : DEFAULT_HEARTBEAT_MS
    };
  }

  // ─── Hook: useTimerCore ──────────────────────────────────────────────────
  function useTimerCore(coreConfig) {
    const React = global.React;
    const cfg = coreConfig || {};
    const STATES = _normalizeStates(cfg.states);
    const lock = _normalizeLock(cfg.lock);
    const manualPhases = Array.isArray(cfg.manualPhases) ? cfg.manualPhases : [];
    const wakeLockPhases = Array.isArray(cfg.wakeLockPhases) ? cfg.wakeLockPhases : [];
    const activePhases = Array.isArray(cfg.activePhases) ? cfg.activePhases : [];
    const visibilityWarning = !!cfg.visibilityWarning;
    const onActiveLockChange = typeof cfg.onActiveLockChange === 'function' ? cfg.onActiveLockChange : null;

    const [state, setState] = React.useState(STATES.idle);
    const [secondsLeft, setSecondsLeft] = React.useState(0);
    const [totalElapsed, setTotalElapsed] = React.useState(0);

    const tickRef = React.useRef(null);
    const secondsLeftRef = React.useRef(0);
    const phaseStartedAtRef = React.useRef(0);
    const phaseDurationMsRef = React.useRef(0);
    const sessionStartedAtRef = React.useRef(0);
    const pauseStartedAtRef = React.useRef(0);
    const pauseTotalMsRef = React.useRef(0);
    const previousStateRef = React.useRef(STATES.idle);
    // stateRef — immediate state mirror для callbacks (tick читает state до того,
    // как React зафлашит setState).
    const stateRef = React.useRef(STATES.idle);
    const lockHeldRef = React.useRef(false);
    const lockHeartbeatRef = React.useRef(null);

    const wakeLock = HEYS.AppHooks && typeof HEYS.AppHooks.useWakeLock === 'function'
      ? HEYS.AppHooks.useWakeLock() : null;
    const wakeLockRef = React.useRef(wakeLock);
    wakeLockRef.current = wakeLock;

    // State-graph callbacks через refs — wrapper переоткрывает каждый рендер.
    const onAdvanceRef = React.useRef(cfg.onAdvance);
    onAdvanceRef.current = cfg.onAdvance;
    const onPhaseEnterRef = React.useRef(cfg.onPhaseEnter);
    onPhaseEnterRef.current = cfg.onPhaseEnter;
    const getExtraMetaRef = React.useRef(cfg.getExtraMeta);
    getExtraMetaRef.current = cfg.getExtraMeta;
    const onStateChangeRef = React.useRef(cfg.onStateChange);
    onStateChangeRef.current = cfg.onStateChange;
    const onCompleteRef = React.useRef(cfg.onComplete);
    onCompleteRef.current = cfg.onComplete;
    const lockRef = React.useRef(lock);
    lockRef.current = lock;

    const fireStateChange = React.useCallback(function (nextState, meta) {
      const fn = onStateChangeRef.current;
      if (typeof fn !== 'function') return;
      const getMeta = getExtraMetaRef.current;
      const extra = typeof getMeta === 'function' ? (getMeta() || {}) : {};
      const merged = Object.assign({}, extra, meta || {});
      try { fn(nextState, merged); } catch (e) {
        console.warn('[kernel.timer] onStateChange threw:', e);
      }
    }, []);

    const clearTick = React.useCallback(function () {
      if (tickRef.current) {
        // setTimeout (рекурсивный) вместо setInterval — clearTimeout работает
        // одинаково; setInterval тротлится в HEYS-окружении (perf-monitor или
        // browser policy при mobile-эмуляции в DevTools).
        clearTimeout(tickRef.current);
        tickRef.current = null;
      }
    }, []);

    const clearLockHeartbeat = React.useCallback(function () {
      if (lockHeartbeatRef.current) {
        clearInterval(lockHeartbeatRef.current);
        lockHeartbeatRef.current = null;
      }
    }, []);

    const releaseActiveTimerLock = React.useCallback(function () {
      clearLockHeartbeat();
      if (lockHeldRef.current) lockRef.current.release();
      lockHeldRef.current = false;
      if (onActiveLockChange) onActiveLockChange(false);
    }, [clearLockHeartbeat, onActiveLockChange]);

    const expireFromLockLoss = React.useCallback(function () {
      clearTick();
      clearLockHeartbeat();
      lockHeldRef.current = false;
      if (onActiveLockChange) onActiveLockChange(false);
      setState(STATES.expired);
      stateRef.current = STATES.expired;
      fireStateChange(STATES.expired, { reason: 'timer_lock_lost' });
      const wl = wakeLockRef.current;
      if (wl && wl.releaseWakeLock) wl.releaseWakeLock();
    }, [clearTick, clearLockHeartbeat, fireStateChange, onActiveLockChange, STATES.expired]);

    const startLockHeartbeat = React.useCallback(function () {
      clearLockHeartbeat();
      lockHeartbeatRef.current = setInterval(function () {
        if (!lockHeldRef.current) return;
        if (!lockRef.current.touch()) expireFromLockLoss();
      }, lockRef.current.heartbeatMs);
    }, [clearLockHeartbeat, expireFromLockLoss]);

    const startTick = React.useCallback(function () {
      clearTick();
      const tickFn = function () {
        const elapsedMs = _now() - phaseStartedAtRef.current;
        const remainingMs = Math.max(0, phaseDurationMsRef.current - elapsedMs);
        const remainingSec = Math.ceil(remainingMs / 1000);
        secondsLeftRef.current = remainingSec;
        setSecondsLeft(remainingSec);
        setTotalElapsed(Math.floor((_now() - sessionStartedAtRef.current - pauseTotalMsRef.current) / 1000));
        if (remainingMs <= 0) {
          tickRef.current = null;
          if (typeof onAdvanceRef.current === 'function') {
            try { onAdvanceRef.current(stateRef.current); }
            catch (e) { console.warn('[kernel.timer] onAdvance threw:', e); }
          }
          return;
        }
        tickRef.current = setTimeout(tickFn, TICK_MS);
      };
      tickRef.current = setTimeout(tickFn, TICK_MS);
    }, [clearTick]);

    const enterPhase = React.useCallback(function (nextState, durationSec, meta) {
      phaseStartedAtRef.current = _now();
      phaseDurationMsRef.current = Math.max(0, durationSec * 1000);
      secondsLeftRef.current = durationSec;
      setSecondsLeft(durationSec);
      setState(nextState);
      stateRef.current = nextState; // immediate — tick/skip читают сразу
      previousStateRef.current = nextState;
      fireStateChange(nextState, Object.assign({ durationSec: durationSec }, meta || {}));

      // wakeLock — запрашивается на phase enter если фаза в wakeLockPhases.
      // Используем check !isWakeLockActive чтобы не дублировать.
      if (wakeLockPhases.indexOf(nextState) >= 0) {
        const wl = wakeLockRef.current;
        if (wl && wl.requestWakeLock && !wl.isWakeLockActive) wl.requestWakeLock();
      }

      // Все cue фаз (включая SET_PREP/BIG_REST/DONE) — забота caller'а через
      // onPhaseEnter. Ядро домен-агностично и звуков не знает. Вызывается ПОСЛЕ
      // того как state записан, ДО tick/terminal-обработки.
      if (typeof onPhaseEnterRef.current === 'function') {
        try { onPhaseEnterRef.current(nextState, meta || {}); }
        catch (e) { console.warn('[kernel.timer] onPhaseEnter threw:', e); }
      }

      // Terminal: DONE → onComplete + release locks (cue caller сыграл выше)
      if (nextState === STATES.done) {
        clearTick();
        releaseActiveTimerLock();
        const wl = wakeLockRef.current;
        if (wl && wl.releaseWakeLock) wl.releaseWakeLock();
        if (typeof onCompleteRef.current === 'function') {
          try { onCompleteRef.current(); }
          catch (e) { console.warn('[kernel.timer] onComplete threw:', e); }
        }
        return;
      }
      // Terminal: ABORTED / EXPIRED / IDLE — release locks
      if (nextState === STATES.aborted || nextState === STATES.expired || nextState === STATES.idle) {
        clearTick();
        releaseActiveTimerLock();
        const wl = wakeLockRef.current;
        if (wl && wl.releaseWakeLock) wl.releaseWakeLock();
        return;
      }

      // Manual phase — wakeLock уже запрошен (если в wakeLockPhases), tick НЕ
      // стартуем. Wrapper сам решает когда advance (e.g. completeSet).
      if (manualPhases.indexOf(nextState) >= 0) return;

      // Timed phase — стартуем tick.
      startTick();
    }, [fireStateChange, startTick, clearTick, releaseActiveTimerLock, manualPhases, wakeLockPhases,
        STATES.done, STATES.aborted, STATES.expired, STATES.idle]);

    const pause = React.useCallback(function () {
      const currentState = stateRef.current;
      if (currentState === STATES.paused || currentState === STATES.idle
          || currentState === STATES.done || currentState === STATES.aborted
          || currentState === STATES.expired) return;
      previousStateRef.current = currentState;
      pauseStartedAtRef.current = _now();
      clearTick();
      setState(STATES.paused);
      stateRef.current = STATES.paused;
      fireStateChange(STATES.paused, {
        resumeTo: previousStateRef.current,
        secondsLeft: secondsLeftRef.current
      });
    }, [clearTick, fireStateChange, STATES.paused, STATES.idle, STATES.done, STATES.aborted, STATES.expired]);

    const resume = React.useCallback(function () {
      if (stateRef.current !== STATES.paused) return;
      const pauseDurMs = _now() - pauseStartedAtRef.current;
      pauseTotalMsRef.current += pauseDurMs;
      const restored = previousStateRef.current;
      const isManual = manualPhases.indexOf(restored) >= 0;
      // Для timed-фаз adjust phaseStartedAt чтобы remaining time не уехал.
      // Для manual — нет тика, никаких корректировок.
      if (!isManual) phaseStartedAtRef.current += pauseDurMs;
      setState(restored);
      stateRef.current = restored;
      fireStateChange(restored, {
        resumed: true,
        durationSec: Math.ceil(phaseDurationMsRef.current / 1000)
      });
      if (!isManual) startTick();
    }, [manualPhases, startTick, fireStateChange, STATES.paused]);

    const abort = React.useCallback(function () {
      enterPhase(STATES.aborted, 0, {});
    }, [enterPhase, STATES.aborted]);

    const skipPhase = React.useCallback(function () {
      const currentState = stateRef.current;
      if (currentState === STATES.idle || currentState === STATES.done
          || currentState === STATES.aborted || currentState === STATES.paused
          || currentState === STATES.expired) return;
      clearTick();
      if (typeof onAdvanceRef.current === 'function') {
        try { onAdvanceRef.current(currentState); }
        catch (e) { console.warn('[kernel.timer] onAdvance threw:', e); }
      }
    }, [clearTick, STATES.idle, STATES.done, STATES.aborted, STATES.paused, STATES.expired]);

    const getCurrentState = React.useCallback(function () {
      return stateRef.current;
    }, []);

    const markSessionStart = React.useCallback(function () {
      if (lockRef.current.acquire('start') === false) {
        lockRef.current.onDenied();
        return false;
      }
      lockHeldRef.current = true;
      sessionStartedAtRef.current = _now();
      pauseTotalMsRef.current = 0;
      setTotalElapsed(0);
      if (onActiveLockChange) onActiveLockChange(true);
      startLockHeartbeat();
      return true;
    }, [startLockHeartbeat, onActiveLockChange]);

    // Cleanup unmount-only — deps=[] (wakeLock объект меняется каждый render,
    // привязать к deps → cleanup срабатывает на каждый rerender → setTimeout
    // убит сразу после запуска → таймер не тикает; wakeLockRef хранит свежий).
    React.useEffect(function () {
      return function () {
        clearTick();
        releaseActiveTimerLock();
        const wl = wakeLockRef.current;
        if (wl && wl.releaseWakeLock) wl.releaseWakeLock();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Visibility warning — если юзер был в фоне >5с во время activePhases,
    // показать toast (browser throttle setTimeout до 1Hz, voice cues могут
    // не сработать, юзер не слышит «3,2,1» отказа).
    React.useEffect(function () {
      if (!visibilityWarning || typeof document === 'undefined') return undefined;
      let hiddenAt = 0;
      const onVis = function () {
        const isActive = activePhases.indexOf(stateRef.current) >= 0;
        if (document.visibilityState === 'hidden') {
          if (isActive) hiddenAt = _now();
        } else if (document.visibilityState === 'visible') {
          if (wakeLockPhases.indexOf(stateRef.current) >= 0) {
            try {
              const wl = wakeLockRef.current;
              if (wl && wl.requestWakeLock && !wl.isWakeLockActive) wl.requestWakeLock();
            } catch (_) {}
          }
          const hiddenMs = hiddenAt > 0 ? (_now() - hiddenAt) : 0;
          hiddenAt = 0;
          if (hiddenMs > 5000 && isActive) {
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibilityWarning, wakeLockPhases]);

    return {
      state: state, secondsLeft: secondsLeft, totalElapsed: totalElapsed,
      enterPhase: enterPhase, pause: pause, resume: resume,
      abort: abort, skipPhase: skipPhase, markSessionStart: markSessionStart,
      getCurrentState: getCurrentState
    };
  }

  TK.timer = {
    useTimerCore: useTimerCore,
    TICK_MS: TICK_MS,
    DEFAULT_STATES: DEFAULT_STATES
  };
})(typeof window !== 'undefined' ? window : globalThis);
