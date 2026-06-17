// kernel-timer.test.js — shared training timer hook lifecycle.

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(
  resolve(__dirname, '../_kernel/heys_kernel_timer_v1.js'),
  'utf8'
);

function loadKernel() {
  if (typeof window === 'undefined') globalThis.window = globalThis;
  window.HEYS = { TrainingKernel: {} };
  globalThis.HEYS = window.HEYS;
  globalThis.React = window.React = React;
  // eslint-disable-next-line no-new-func
  new Function(SRC)();
  return window.HEYS.TrainingKernel.timer;
}

describe('TrainingKernel.timer.useTimerCore', () => {
  let core;
  let events;
  let lock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00Z'));
    events = [];
    lock = {
      acquire: vi.fn(() => true),
      touch: vi.fn(() => true),
      release: vi.fn(),
      onDenied: vi.fn(),
      heartbeatMs: 500
    };
    loadKernel();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete window.HEYS;
    delete globalThis.HEYS;
    delete globalThis.React;
    core = null;
  });

  function Harness(props) {
    const timer = window.HEYS.TrainingKernel.timer;
    core = timer.useTimerCore({
      states: { idle: 'idle', paused: 'paused', done: 'done', aborted: 'aborted', expired: 'expired' },
      activePhases: ['run'],
      wakeLockPhases: ['run'],
      manualPhases: ['manual'],
      visibilityWarning: false,
      lock: props.lock || lock,
      onActiveLockChange: (held) => events.push(['lock', held]),
      onStateChange: (state, meta) => events.push(['state', state, meta]),
      onPhaseEnter: (state) => events.push(['phase', state]),
      onComplete: () => events.push(['complete']),
      onAdvance: (state) => {
        events.push(['advance', state]);
        if (props.completeOnAdvance !== false) core.enterPhase('done', 0, { from: state });
      }
    });
    return React.createElement('div', {
      'data-testid': 'timer',
      'data-state': core.state,
      'data-sec': String(core.secondsLeft)
    });
  }

  it('starts a timed phase, advances on expiry, completes, and releases lock', () => {
    const { getByTestId } = render(React.createElement(Harness, null));

    act(() => {
      expect(core.markSessionStart()).toBe(true);
      core.enterPhase('run', 2, {});
    });
    expect(getByTestId('timer').getAttribute('data-state')).toBe('run');

    act(() => { vi.advanceTimersByTime(2_100); });

    expect(events).toEqual(expect.arrayContaining([
      ['lock', true],
      ['state', 'run', expect.objectContaining({ durationSec: 2 })],
      ['phase', 'run'],
      ['advance', 'run'],
      ['phase', 'done'],
      ['lock', false],
      ['complete']
    ]));
    expect(getByTestId('timer').getAttribute('data-state')).toBe('done');
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('pause/resume keeps remaining seconds stable while paused', () => {
    const { getByTestId } = render(React.createElement(Harness, { completeOnAdvance: false }));

    act(() => {
      core.markSessionStart();
      core.enterPhase('run', 5, {});
      vi.advanceTimersByTime(2_100);
    });
    const beforePause = getByTestId('timer').getAttribute('data-sec');
    expect(Number(beforePause)).toBeGreaterThanOrEqual(2);

    act(() => {
      core.pause();
      vi.advanceTimersByTime(3_000);
    });
    expect(getByTestId('timer').getAttribute('data-state')).toBe('paused');
    expect(getByTestId('timer').getAttribute('data-sec')).toBe(beforePause);

    act(() => {
      core.resume();
      vi.advanceTimersByTime(200);
    });
    expect(getByTestId('timer').getAttribute('data-state')).toBe('run');
    expect(events).toEqual(expect.arrayContaining([
      ['state', 'paused', expect.objectContaining({ resumeTo: 'run' })],
      ['state', 'run', expect.objectContaining({ resumed: true })]
    ]));
  });

  it('returns false and calls onDenied when owner-lock acquisition fails', () => {
    lock.acquire = vi.fn(() => false);
    render(React.createElement(Harness, null));

    let started;
    act(() => { started = core.markSessionStart(); });

    expect(started).toBe(false);
    expect(lock.onDenied).toHaveBeenCalledTimes(1);
    expect(events).not.toContainEqual(['lock', true]);
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('expires the session when heartbeat touch fails', () => {
    lock.touch = vi.fn(() => false);
    const { getByTestId } = render(React.createElement(Harness, { completeOnAdvance: false }));

    act(() => {
      core.markSessionStart();
      core.enterPhase('run', 10, {});
      vi.advanceTimersByTime(500);
    });

    expect(lock.touch).toHaveBeenCalledTimes(1);
    expect(getByTestId('timer').getAttribute('data-state')).toBe('expired');
    expect(events).toEqual(expect.arrayContaining([
      ['lock', true],
      ['lock', false],
      ['state', 'expired', expect.objectContaining({ reason: 'timer_lock_lost' })]
    ]));
  });
});
