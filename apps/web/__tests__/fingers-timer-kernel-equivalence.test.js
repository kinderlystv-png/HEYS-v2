// fingers-timer-kernel-equivalence.test.js
//
// Characterization for the strangled timer path:
// with TrainingKernel.runner.createPhaseGraph and without it, fingers timer hooks
// must keep the same externally visible phase sequence.

import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const kernelRunnerFile = path.resolve(__dirname, '..', '_kernel', 'heys_kernel_runner_v1.js');
const timerFile = path.resolve(__dirname, '..', 'fingers', 'heys_fingers_timer_v1.js');

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

const installTimer = ({ withKernel }) => {
  ensureLocalStorage();
  globalThis.window.localStorage.clear();

  const heys = {};
  globalThis.HEYS = heys;
  globalThis.window.HEYS = heys;
  globalThis.React = React;

  if (withKernel) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(kernelRunnerFile, 'utf8'));
  }
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(timerFile, 'utf8'));

  return {
    runnerActive: !!(heys.TrainingKernel?.runner?.createPhaseGraph),
    useCountdownCycle: heys.Fingers.useCountdownCycle,
    useRepsCycle: heys.Fingers.useRepsCycle,
    states: heys.Fingers.STATES,
  };
};

const snap = (label, current) => ({
  label,
  state: current.state,
  setIdx: current.setIdx,
  repIdx: current.repIdx,
  secondsLeft: current.secondsLeft,
});

const cleanupRun = (unmount) => {
  try { unmount(); } catch (_) { /* noop */ }
  try { vi.clearAllTimers(); } catch (_) { /* noop */ }
  try { globalThis.window.localStorage.clear(); } catch (_) { /* noop */ }
};

const captureCountdownTrace = (withKernel) => {
  const env = installTimer({ withKernel });
  expect(env.runnerActive).toBe(withKernel);
  const complete = vi.fn();
  const { result, unmount } = renderHook(() => env.useCountdownCycle({
    hangSec: 1,
    restSec: 1,
    repsPerSet: 2,
    setsCount: 2,
    restBetweenSetsSec: 2,
    onComplete: complete,
  }));
  const trace = [];
  const record = (label) => trace.push(snap(label, result.current));

  act(() => result.current.start());
  record('start');
  act(() => { vi.advanceTimersByTime(5100); });
  record('set0-rep0-hang');
  act(() => { vi.advanceTimersByTime(1100); });
  record('set0-rep0-rest');
  act(() => { vi.advanceTimersByTime(1100); });
  record('set0-rep1-prep');
  act(() => { vi.advanceTimersByTime(5100); });
  record('set0-rep1-hang');
  act(() => { vi.advanceTimersByTime(1100); });
  record('set0-big-rest');
  act(() => { vi.advanceTimersByTime(2100); });
  record('set1-rep0-prep');
  act(() => { vi.advanceTimersByTime(5100); });
  record('set1-rep0-hang');
  act(() => { vi.advanceTimersByTime(1100); });
  record('set1-rep0-rest');
  act(() => { vi.advanceTimersByTime(1100); });
  record('set1-rep1-prep');
  act(() => { vi.advanceTimersByTime(5100); });
  record('set1-rep1-hang');
  act(() => { vi.advanceTimersByTime(1100); });
  record('done');

  const out = { trace, completeCalls: complete.mock.calls.length };
  cleanupRun(unmount);
  return out;
};

const captureRepsTrace = (withKernel) => {
  const env = installTimer({ withKernel });
  expect(env.runnerActive).toBe(withKernel);
  const complete = vi.fn();
  const { result, unmount } = renderHook(() => env.useRepsCycle({
    setsCount: 2,
    restBetweenSetsSec: 2,
    onComplete: complete,
  }));
  const trace = [];
  const record = (label) => trace.push(snap(label, result.current));

  act(() => result.current.start());
  record('start');
  act(() => { vi.advanceTimersByTime(5100); });
  record('set0-input');
  act(() => result.current.completeSet());
  record('set0-big-rest');
  act(() => { vi.advanceTimersByTime(2100); });
  record('set1-prep');
  act(() => { vi.advanceTimersByTime(5100); });
  record('set1-input');
  act(() => result.current.completeSet());
  record('done');

  const out = { trace, completeCalls: complete.mock.calls.length };
  cleanupRun(unmount);
  return out;
};

describe('fingers timer kernel/fallback equivalence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ensureLocalStorage();
    globalThis.window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    ensureLocalStorage();
    globalThis.window.localStorage.clear();
    delete globalThis.HEYS;
    if (globalThis.window) delete globalThis.window.HEYS;
  });

  it('useCountdownCycle keeps the same hang/rest sequence with kernel phaseGraph and fallback', () => {
    expect(captureCountdownTrace(false)).toEqual(captureCountdownTrace(true));
  });

  it('useRepsCycle keeps the same manual reps sequence with kernel phaseGraph and fallback', () => {
    expect(captureRepsTrace(false)).toEqual(captureRepsTrace(true));
  });
});
