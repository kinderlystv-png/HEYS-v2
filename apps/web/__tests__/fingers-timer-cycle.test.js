// fingers-timer-cycle.test.js — Step 1 / parity-snapshot для useCountdownCycle.
//
// Цель: ПИННИТЬ текущее поведение hang-runner state machine до рефактора
// шагов 2-4. Эти тесты должны остаться зелёные после выноса общего каркаса
// (Step 2 — useRepsCycle на той же базе) и добавления reps phase-view (Step 3).
// Если рефактор сломает hang-flow — characterization упадёт и это будет видно.
//
// Покрытие:
//   - IDLE initial; start() → SET_PREP (5s)
//   - SET_PREP → HANG (after hangSec)
//   - HANG → REST (после hangSec, если не последний rep)
//   - REST → SET_PREP next rep (repIdx+1)
//   - HANG последнего rep-а НЕ-последнего сета → BIG_REST (restBetweenSetsSec)
//   - BIG_REST → SET_PREP next set (setIdx+1, repIdx=0)
//   - HANG последнего rep-а последнего сета → DONE + onComplete
//   - pause()/resume() — корректное состояние сохранения
//   - abort() → ABORTED
//   - startFromSnapshot — корректный resume

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createStorageMock = () => {
  const store = {};
  return {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
};

const ensureLocalStorage = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.window.localStorage || typeof globalThis.window.localStorage.clear !== 'function') {
    globalThis.localStorage = createStorageMock();
    globalThis.window.localStorage = globalThis.localStorage;
  }
};

beforeAll(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  ensureLocalStorage();
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = React;
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.resolve(__dirname, '..', '_kernel', 'heys_kernel_runner_v1.js'), 'utf8'));
  // kernel-timer (useTimerCore) — fingers timer делегирует в него.
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.resolve(__dirname, '..', '_kernel', 'heys_kernel_timer_v1.js'), 'utf8'));
  // Загружаем timer-модуль (IIFE регистрирует Fingers.useCountdownCycle).
  const file = path.resolve(__dirname, '..', 'fingers', 'heys_fingers_timer_v1.js');
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(file, 'utf8'));
});

const useCycle = (cfg) => globalThis.HEYS.Fingers.useCountdownCycle(cfg);
const S = () => globalThis.HEYS.Fingers.STATES;
const timerLockKey = () => 'heys_fingers_timer_lock_v1';
const timerTabId = () => globalThis.HEYS.Fingers.__timerTabId;

const defaultCfg = (over = {}) => ({
  hangSec: 7, restSec: 3, repsPerSet: 2, setsCount: 2, restBetweenSetsSec: 60,
  ...over
});

describe('useCountdownCycle — parity pin (Step 1, ревью #9 для reps-runner refactor)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ensureLocalStorage();
    window.localStorage.clear();
    delete globalThis.HEYS.Fingers.lastTimerLockDenied;
  });
  afterEach(() => {
    vi.useRealTimers();
    ensureLocalStorage();
    window.localStorage.clear();
    delete globalThis.HEYS.Fingers.activeTimerLock;
    delete globalThis.HEYS.Fingers.lastTimerLockDenied;
    delete globalThis.HEYS.AppHooks;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  describe('IDLE / start()', () => {
    it('initial state = IDLE, counters at 0', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      expect(result.current.state).toBe(S().IDLE);
      expect(result.current.setIdx).toBe(0);
      expect(result.current.repIdx).toBe(0);
      expect(result.current.secondsLeft).toBe(0);
    });

    it('start() → SET_PREP, secondsLeft=5, onStateChange вызывается', () => {
      const onSC = vi.fn();
      const { result } = renderHook(() => useCycle({ ...defaultCfg(), onStateChange: onSC }));
      act(() => result.current.start());
      expect(result.current.state).toBe(S().SET_PREP);
      expect(result.current.secondsLeft).toBe(5);
      expect(onSC).toHaveBeenCalledWith(S().SET_PREP, expect.objectContaining({ durationSec: 5 }));
    });

    it('start() ставит activeTimerLock = true', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      expect(globalThis.HEYS.Fingers.activeTimerLock).toBe(true);
    });

    it('start() не запускает таймер если свежий lock держит другая вкладка', () => {
      window.localStorage.setItem(timerLockKey(), JSON.stringify({
        ownerTabId: 'other-tab',
        acquiredAt: Date.now(),
        heartbeatAt: Date.now()
      }));
      const { result } = renderHook(() => useCycle(defaultCfg()));
      let ok;
      act(() => { ok = result.current.start(); });
      expect(ok).toBe(false);
      expect(result.current.state).toBe(S().IDLE);
      expect(globalThis.HEYS.Fingers.activeTimerLock).not.toBe(true);
      expect(globalThis.HEYS.Fingers.lastTimerLockDenied.reason).toBe('held-by-another-tab');
    });

    it('start() перехватывает stale lock другой вкладки', () => {
      window.localStorage.setItem(timerLockKey(), JSON.stringify({
        ownerTabId: 'old-tab',
        acquiredAt: Date.now() - 20000,
        heartbeatAt: Date.now() - 20000
      }));
      const { result } = renderHook(() => useCycle(defaultCfg()));
      let ok;
      act(() => { ok = result.current.start(); });
      const lock = JSON.parse(window.localStorage.getItem(timerLockKey()));
      expect(ok).toBe(true);
      expect(result.current.state).toBe(S().SET_PREP);
      expect(lock.ownerTabId).toBe(timerTabId());
    });

    it('heartbeat продлевает lock текущей вкладки', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      const first = JSON.parse(window.localStorage.getItem(timerLockKey())).heartbeatAt;
      act(() => { vi.advanceTimersByTime(2100); });
      const next = JSON.parse(window.localStorage.getItem(timerLockKey())).heartbeatAt;
      expect(next).toBeGreaterThan(first);
      expect(result.current.state).toBe(S().SET_PREP);
    });

    it('если lock украден во время работы — таймер уходит в EXPIRED', () => {
      const onSC = vi.fn();
      const { result } = renderHook(() => useCycle({ ...defaultCfg(), onStateChange: onSC }));
      act(() => result.current.start());
      window.localStorage.setItem(timerLockKey(), JSON.stringify({
        ownerTabId: 'other-tab',
        acquiredAt: Date.now(),
        heartbeatAt: Date.now()
      }));
      act(() => { vi.advanceTimersByTime(2100); });
      expect(result.current.state).toBe(S().EXPIRED);
      expect(globalThis.HEYS.Fingers.activeTimerLock).toBe(false);
      expect(onSC).toHaveBeenCalledWith(S().EXPIRED, expect.objectContaining({ reason: 'timer_lock_lost' }));
    });

    it('после возврата вкладки повторно запрашивает wake-lock для активной фазы', () => {
      const requestWakeLock = vi.fn();
      const wakeLockApi = {
        isWakeLockActive: false,
        requestWakeLock,
        releaseWakeLock: vi.fn()
      };
      globalThis.HEYS.AppHooks = { useWakeLock: () => wakeLockApi };
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG
      requestWakeLock.mockClear();

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      act(() => { vi.advanceTimersByTime(6000); });
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });

      expect(requestWakeLock).toHaveBeenCalledTimes(1);
      delete globalThis.HEYS.AppHooks;
    });
  });

  describe('Фазы цикла', () => {
    it('SET_PREP → HANG после 5000ms', () => {
      const onSC = vi.fn();
      const { result } = renderHook(() => useCycle({ ...defaultCfg(), onStateChange: onSC }));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      expect(result.current.state).toBe(S().HANG);
      expect(onSC).toHaveBeenCalledWith(S().HANG, expect.objectContaining({ durationSec: 7 }));
    });

    it('HANG → REST после hangSec, если НЕ последний rep', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // SET_PREP → HANG
      expect(result.current.state).toBe(S().HANG);
      act(() => { vi.advanceTimersByTime(7100); }); // HANG → REST
      expect(result.current.state).toBe(S().REST);
    });

    it('REST → SET_PREP с repIdx+1', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG (rep 0)
      act(() => { vi.advanceTimersByTime(7100); }); // → REST
      act(() => { vi.advanceTimersByTime(3100); }); // REST → SET_PREP next rep
      expect(result.current.state).toBe(S().SET_PREP);
      expect(result.current.repIdx).toBe(1);
    });

    it('HANG последнего rep-а НЕ-последнего сета → BIG_REST (НЕ REST)', () => {
      const { result } = renderHook(() => useCycle(defaultCfg())); // repsPerSet=2, setsCount=2
      act(() => result.current.start());
      // Прокручиваем до конца set 0: SET_PREP → HANG → REST → SET_PREP → HANG
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG (rep 0)
      act(() => { vi.advanceTimersByTime(7100); }); // → REST
      act(() => { vi.advanceTimersByTime(3100); }); // → SET_PREP (rep 1)
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG (rep 1, последний rep set 0)
      act(() => { vi.advanceTimersByTime(7100); }); // HANG → BIG_REST (не REST!)
      expect(result.current.state).toBe(S().BIG_REST);
    });

    it('BIG_REST → SET_PREP с setIdx+1, repIdx=0', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => { vi.advanceTimersByTime(7100); });
      act(() => { vi.advanceTimersByTime(3100); });
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => { vi.advanceTimersByTime(7100); }); // → BIG_REST
      act(() => { vi.advanceTimersByTime(60100); }); // BIG_REST 60s → SET_PREP next set
      expect(result.current.state).toBe(S().SET_PREP);
      expect(result.current.setIdx).toBe(1);
      expect(result.current.repIdx).toBe(0);
    });

    it('HANG последнего rep-а последнего сета → DONE, onComplete вызывается', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useCycle({ ...defaultCfg(), onComplete }));
      act(() => result.current.start());
      // set 0: SET_PREP, HANG, REST, SET_PREP, HANG, BIG_REST
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => { vi.advanceTimersByTime(7100); });
      act(() => { vi.advanceTimersByTime(3100); });
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => { vi.advanceTimersByTime(7100); }); // BIG_REST
      act(() => { vi.advanceTimersByTime(60100); }); // SET_PREP (set 1)
      // set 1: SET_PREP, HANG, REST, SET_PREP, HANG → DONE
      act(() => { vi.advanceTimersByTime(5100); }); // HANG (set 1, rep 0)
      act(() => { vi.advanceTimersByTime(7100); }); // REST
      act(() => { vi.advanceTimersByTime(3100); }); // SET_PREP (rep 1)
      act(() => { vi.advanceTimersByTime(5100); }); // HANG (rep 1, последний)
      act(() => { vi.advanceTimersByTime(7100); }); // HANG → DONE
      expect(result.current.state).toBe(S().DONE);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('DONE сбрасывает activeTimerLock', () => {
      const { result } = renderHook(() => useCycle({ ...defaultCfg(), repsPerSet: 1, setsCount: 1 }));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // HANG
      act(() => { vi.advanceTimersByTime(7100); }); // DONE
      expect(result.current.state).toBe(S().DONE);
      expect(globalThis.HEYS.Fingers.activeTimerLock).toBe(false);
    });
  });

  describe('pause / resume / abort', () => {
    it('pause() из HANG → PAUSED, previousState запомнен', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG
      act(() => result.current.pause());
      expect(result.current.state).toBe(S().PAUSED);
    });

    it('pause() из IDLE — no-op', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.pause());
      expect(result.current.state).toBe(S().IDLE);
    });

    it('resume() из PAUSED → возврат к previousState (HANG)', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG
      act(() => result.current.pause());
      expect(result.current.state).toBe(S().PAUSED);
      act(() => result.current.resume());
      expect(result.current.state).toBe(S().HANG);
    });

    it('pause()+resume() через stale controller ref работает без ожидания rerender', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG
      const ctrl = result.current;
      act(() => {
        ctrl.pause();
        ctrl.resume();
      });
      expect(result.current.state).toBe(S().HANG);
    });

    it('abort() → ABORTED, activeTimerLock=false', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.abort());
      expect(result.current.state).toBe(S().ABORTED);
      expect(globalThis.HEYS.Fingers.activeTimerLock).toBe(false);
    });
  });

  describe('startFromSnapshot', () => {
    it('snap.state=IDLE → ведёт себя как start()', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.startFromSnapshot({ state: S().IDLE }));
      expect(result.current.state).toBe(S().SET_PREP);
    });

    it('snap активного HANG → восстанавливает state с remaining', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.startFromSnapshot({
        state: S().HANG,
        setIdx: 0, repIdx: 1,
        phaseStartedAt: Date.now() - 2000, // прошло 2с из 7с hangSec
        durationSec: 7
      }));
      expect(result.current.state).toBe(S().HANG);
      expect(result.current.repIdx).toBe(1);
    });

    it('snap.state=DONE → старт через start()', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.startFromSnapshot({ state: S().DONE }));
      expect(result.current.state).toBe(S().SET_PREP);
    });
  });

  describe('fast-click stale controller refs', () => {
    it('skipPhase через stale SET_PREP controller skips текущий HANG, не старую фазу', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      act(() => result.current.start());
      const ctrl = result.current;
      act(() => { vi.advanceTimersByTime(5100); }); // → HANG
      expect(result.current.state).toBe(S().HANG);
      act(() => ctrl.skipPhase());
      expect(result.current.state).toBe(S().REST);
    });
  });

  describe('Config defaults и edge cases', () => {
    it('config без полей → defaults: hangSec=7, restSec=3, repsPerSet=6, setsCount=5, restBetweenSetsSec=180', () => {
      const { result } = renderHook(() => useCycle({}));
      // Defaults применены если cycle стартует и заходит в HANG через 5s SET_PREP.
      act(() => result.current.start());
      expect(result.current.state).toBe(S().SET_PREP);
      act(() => { vi.advanceTimersByTime(5100); });
      // HANG будет 7s; через 6s ещё HANG.
      act(() => { vi.advanceTimersByTime(6000); });
      expect(result.current.state).toBe(S().HANG);
    });

    it('repsPerSet=1, setsCount=1 → одна итерация HANG → DONE', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useCycle({
        ...defaultCfg(), repsPerSet: 1, setsCount: 1, onComplete
      }));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // HANG
      act(() => { vi.advanceTimersByTime(7100); }); // DONE
      expect(result.current.state).toBe(S().DONE);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Контракт API', () => {
    it('возвращает {state, setIdx, repIdx, secondsLeft, totalElapsed, start, pause, resume, abort, skipPhase, startFromSnapshot}', () => {
      const { result } = renderHook(() => useCycle(defaultCfg()));
      const keys = Object.keys(result.current);
      ['state', 'setIdx', 'repIdx', 'secondsLeft', 'totalElapsed',
       'start', 'pause', 'resume', 'abort', 'skipPhase']
        .forEach((k) => expect(keys).toContain(k));
    });

    it('STATES enum fields stable (IDLE/SET_PREP/HANG/REST/BIG_REST/DONE/ABORTED/PAUSED)', () => {
      ['IDLE', 'SET_PREP', 'HANG', 'REST', 'BIG_REST', 'DONE', 'ABORTED', 'PAUSED']
        .forEach((s) => expect(S()[s]).toBe(s));
    });
  });
});
