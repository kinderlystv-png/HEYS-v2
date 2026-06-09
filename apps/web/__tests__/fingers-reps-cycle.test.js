// fingers-reps-cycle.test.js — Step 2 / characterization useRepsCycle.
//
// State graph (A-структура, ревью #8):
//   IDLE → SET_PREP (5s timer) → REPS_INPUT (manual; ждёт completeSet()) →
//     last set → DONE; else → BIG_REST (restSetsSec timer) → SET_PREP → ...
//
// Параллельный API с useCountdownCycle (одни callbacks, один shape return) →
// shared shell ExerciseRunner (Step 4) подключает оба хука единообразно.

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

beforeAll(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = React;
  const file = path.resolve(__dirname, '..', 'fingers', 'heys_fingers_timer_v1.js');
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(file, 'utf8'));
});

const useReps = (cfg) => globalThis.HEYS.Fingers.useRepsCycle(cfg);
const S = () => globalThis.HEYS.Fingers.STATES;

const defaultCfg = (over = {}) => ({
  setsCount: 2, restBetweenSetsSec: 60, ...over
});

describe('useRepsCycle — characterization (Step 2 / ревью #9)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.HEYS.Fingers.activeTimerLock;
  });

  describe('IDLE / start()', () => {
    it('initial state = IDLE, counters at 0', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      expect(result.current.state).toBe(S().IDLE);
      expect(result.current.setIdx).toBe(0);
      expect(result.current.secondsLeft).toBe(0);
    });

    it('start() → SET_PREP, secondsLeft=5', () => {
      const onSC = vi.fn();
      const { result } = renderHook(() => useReps({ ...defaultCfg(), onStateChange: onSC }));
      act(() => result.current.start());
      expect(result.current.state).toBe(S().SET_PREP);
      expect(result.current.secondsLeft).toBe(5);
      expect(onSC).toHaveBeenCalledWith(S().SET_PREP, expect.objectContaining({ durationSec: 5 }));
    });

    it('start() ставит activeTimerLock = true', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      expect(globalThis.HEYS.Fingers.activeTimerLock).toBe(true);
    });

    it('repIdx всегда 0 (reps machine не трекает per-rep state)', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      expect(result.current.repIdx).toBe(0);
      act(() => result.current.start());
      expect(result.current.repIdx).toBe(0);
    });
  });

  describe('Фазы цикла', () => {
    it('SET_PREP → REPS_INPUT после 5000ms (тик доходит до 0)', () => {
      const onSC = vi.fn();
      const { result } = renderHook(() => useReps({ ...defaultCfg(), onStateChange: onSC }));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      expect(result.current.state).toBe(S().REPS_INPUT);
      expect(onSC).toHaveBeenCalledWith(S().REPS_INPUT, expect.objectContaining({ setIdx: 0 }));
    });

    it('REPS_INPUT — manual phase: вызов advanceTimers не сдвигает state', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // → REPS_INPUT
      // Прокрутка часов не должна повлиять — manual phase ждёт completeSet().
      act(() => { vi.advanceTimersByTime(60000); });
      expect(result.current.state).toBe(S().REPS_INPUT);
    });

    it('completeSet() из REPS_INPUT → BIG_REST (если не последний сет)', () => {
      const onSC = vi.fn();
      const { result } = renderHook(() => useReps({ ...defaultCfg(), onStateChange: onSC }));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.completeSet());
      expect(result.current.state).toBe(S().BIG_REST);
      expect(onSC).toHaveBeenCalledWith(S().BIG_REST, expect.objectContaining({ setIdx: 0, durationSec: 60 }));
    });

    it('BIG_REST → SET_PREP с setIdx+1', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // SET_PREP → REPS_INPUT
      act(() => result.current.completeSet()); // REPS_INPUT → BIG_REST
      act(() => { vi.advanceTimersByTime(60100); }); // BIG_REST 60s → SET_PREP
      expect(result.current.state).toBe(S().SET_PREP);
      expect(result.current.setIdx).toBe(1);
    });

    it('completeSet() последнего сета → DONE; onComplete called', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useReps({ ...defaultCfg(), onComplete }));
      act(() => result.current.start()); // set 0
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.completeSet()); // → BIG_REST
      act(() => { vi.advanceTimersByTime(60100); }); // → SET_PREP (set 1)
      act(() => { vi.advanceTimersByTime(5100); }); // → REPS_INPUT (set 1)
      act(() => result.current.completeSet()); // → DONE (last set)
      expect(result.current.state).toBe(S().DONE);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('DONE сбрасывает activeTimerLock', () => {
      const { result } = renderHook(() => useReps({ ...defaultCfg(), setsCount: 1 }));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // REPS_INPUT
      act(() => result.current.completeSet()); // DONE (single set)
      expect(result.current.state).toBe(S().DONE);
      expect(globalThis.HEYS.Fingers.activeTimerLock).toBe(false);
    });
  });

  describe('completeSet() guards', () => {
    it('completeSet() из IDLE — no-op', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.completeSet());
      expect(result.current.state).toBe(S().IDLE);
    });

    it('completeSet() из SET_PREP — no-op (ждём countdown)', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      expect(result.current.state).toBe(S().SET_PREP);
      act(() => result.current.completeSet());
      expect(result.current.state).toBe(S().SET_PREP); // не изменилось
    });

    it('completeSet() из BIG_REST — no-op', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.completeSet()); // → BIG_REST
      const before = result.current.state;
      act(() => result.current.completeSet()); // no-op
      expect(result.current.state).toBe(before);
    });
  });

  describe('pause / resume / abort', () => {
    it('pause() из REPS_INPUT → PAUSED; resume() → REPS_INPUT', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); }); // → REPS_INPUT
      act(() => result.current.pause());
      expect(result.current.state).toBe(S().PAUSED);
      act(() => result.current.resume());
      expect(result.current.state).toBe(S().REPS_INPUT);
    });

    it('pause() из BIG_REST → PAUSED; resume() → BIG_REST с remaining', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.completeSet()); // → BIG_REST
      act(() => result.current.pause());
      expect(result.current.state).toBe(S().PAUSED);
      act(() => result.current.resume());
      expect(result.current.state).toBe(S().BIG_REST);
    });

    it('pause() из IDLE — no-op', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.pause());
      expect(result.current.state).toBe(S().IDLE);
    });

    it('abort() → ABORTED, activeTimerLock=false', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.abort());
      expect(result.current.state).toBe(S().ABORTED);
      expect(globalThis.HEYS.Fingers.activeTimerLock).toBe(false);
    });
  });

  describe('skipPhase', () => {
    it('skipPhase из REPS_INPUT эквивалентен completeSet()', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.skipPhase());
      expect(result.current.state).toBe(S().BIG_REST);
    });

    it('skipPhase из IDLE/DONE/PAUSED/ABORTED — no-op', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.skipPhase()); // IDLE
      expect(result.current.state).toBe(S().IDLE);
    });
  });

  describe('startFromSnapshot', () => {
    it('snap.state=IDLE → ведёт себя как start()', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.startFromSnapshot({ state: S().IDLE }));
      expect(result.current.state).toBe(S().SET_PREP);
    });

    it('snap.state=DONE → start()', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.startFromSnapshot({ state: S().DONE }));
      expect(result.current.state).toBe(S().SET_PREP);
    });

    it('snap.state=REPS_INPUT → восстанавливает manual фазу с setIdx', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.startFromSnapshot({
        state: S().REPS_INPUT, setIdx: 1
      }));
      expect(result.current.state).toBe(S().REPS_INPUT);
      expect(result.current.setIdx).toBe(1);
    });

    it('snap.state=BIG_REST → восстанавливает с remaining', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      act(() => result.current.startFromSnapshot({
        state: S().BIG_REST, setIdx: 0,
        phaseStartedAt: Date.now() - 20000, durationSec: 60
      }));
      expect(result.current.state).toBe(S().BIG_REST);
      expect(result.current.setIdx).toBe(0);
    });
  });

  describe('Config defaults', () => {
    it('config={} → defaults setsCount=3, restBetweenSetsSec=60', () => {
      const { result } = renderHook(() => useReps({}));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      expect(result.current.state).toBe(S().REPS_INPUT);
    });

    it('alias: cfg.sets = cfg.setsCount', () => {
      const { result } = renderHook(() => useReps({ sets: 2, restSetsSec: 30 }));
      act(() => result.current.start());
      act(() => { vi.advanceTimersByTime(5100); });
      act(() => result.current.completeSet());
      expect(result.current.state).toBe(S().BIG_REST);
      // restSetsSec=30 alias
      act(() => { vi.advanceTimersByTime(30100); });
      expect(result.current.state).toBe(S().SET_PREP);
      expect(result.current.setIdx).toBe(1);
    });
  });

  describe('API contract', () => {
    it('возвращает {state, setIdx, repIdx=0, secondsLeft, totalElapsed, start, pause, resume, abort, completeSet, skipPhase, startFromSnapshot}', () => {
      const { result } = renderHook(() => useReps(defaultCfg()));
      const keys = Object.keys(result.current);
      ['state', 'setIdx', 'repIdx', 'secondsLeft', 'totalElapsed',
       'start', 'pause', 'resume', 'abort', 'completeSet', 'skipPhase', 'startFromSnapshot']
        .forEach((k) => expect(keys).toContain(k));
    });

    it('STATES.REPS_INPUT определён', () => {
      expect(S().REPS_INPUT).toBe('REPS_INPUT');
    });
  });
});
