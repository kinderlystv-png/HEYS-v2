// fingers-exercise-runner.test.js — Step 1 / гейт перед Step 4 (ревью #9).
//
// Зачем: пиннит RPE/onSetFeedback/snapshot/abort flow в ExerciseRunner ДО того
// как Step 4 (branch по doseShape) тронет код. После рефактора те же тесты
// должны пройти бит-в-бит — это гарантия behavior-preserving выноса общего
// shell под reps-runner.
//
// Покрытие (по требованию ревью #9):
//   1. onSetFeedback(exIdx, setIdx, {rpe, pain}) на каждой границе сета (S8);
//   2. Финальный RPE-промпт → onDone (submit И skip пути);
//   3. Snapshot-resume: useEffect → cycle.startFromSnapshot(initialSnapshot);
//   4. Abort confirm-flow + keepSnapshotOnAbortRef;
// Бонусы:
//   5. handleStateChangeRpe: BIG_REST → non-final prompt; HANG/SET_PREP → dismiss;
//   6. persistence.save/clear на state-переходах.

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
  // Загружаем deps в правильном порядке для session_ui IIFE.
  const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');
  const ev = (f) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8'));
  };
  ev('heys_fingers_timer_v1.js'); // STATES + useCountdownCycle (заменим стабом)
  // session_ui_v1.js большой — загружаем целиком (включая ExerciseRunner экспорт).
  ev('heys_fingers_session_ui_v1.js');
});

const ER = () => globalThis.HEYS.Fingers._ExerciseRunner;
const S = () => globalThis.HEYS.Fingers.STATES;

// Stub useCountdownCycle: захватывает config + предоставляет controllable handlers.
// Возвращает controller с публичными методами для теста.
function installCycleStub() {
  const captured = {
    config: null,
    onComplete: null,
    onStateChange: null,
    state: 'IDLE',
    setIdx: 0,
    repIdx: 0,
    secondsLeft: 0,
    abortCalled: false,
    startCalled: false,
    startFromSnapshotCalled: false,
    startFromSnapshotArg: null,
    pauseCalled: false,
    resumeCalled: false,
  };
  globalThis.HEYS.Fingers.useCountdownCycle = function (cfg) {
    captured.config = cfg;
    captured.onComplete = cfg.onComplete;
    captured.onStateChange = cfg.onStateChange;
    return {
      get state() { return captured.state; },
      get setIdx() { return captured.setIdx; },
      get repIdx() { return captured.repIdx; },
      get secondsLeft() { return captured.secondsLeft; },
      totalElapsed: 0,
      start: () => { captured.startCalled = true; },
      pause: () => { captured.pauseCalled = true; },
      resume: () => { captured.resumeCalled = true; },
      abort: () => { captured.abortCalled = true; },
      skipPhase: () => {},
      startFromSnapshot: (snap) => {
        captured.startFromSnapshotCalled = true;
        captured.startFromSnapshotArg = snap;
      },
    };
  };
  return captured;
}

// Stub CountdownDisplay — пустой рендер, чтобы фокусироваться на overlay/handlers.
function installDisplayStub() {
  globalThis.HEYS.Fingers.CountdownDisplay = function (props) {
    return React.createElement('div', { 'data-testid': 'countdown-stub' });
  };
}

// Default exercise (hang-shape).
const defaultExercise = (over = {}) => ({
  gripId: 'halfcrimp',
  edgeSizeMm: 20,
  hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180,
  addedWeightKg: 0,
  ...over
});

describe('ExerciseRunner — characterization до Step 4 рефактора (гейт #9)', () => {
  let cycle;

  beforeEach(() => {
    cycle = installCycleStub();
    installDisplayStub();
    delete globalThis.HEYS.Fingers.persistence;
    delete globalThis.HEYS.ConfirmModal;
  });

  describe('config: ExerciseRunner→useCountdownCycle проброс', () => {
    it('exercise hangSec/restSec/repsPerSet/setsCount/restBetweenSetsSec → config', () => {
      const ex = defaultExercise({ hangSec: 10, restSec: 5, repsPerSet: 4, setsCount: 2, restBetweenSetsSec: 120 });
      render(React.createElement(ER(), {
        exercise: ex, exIdx: 0, totalExercises: 1, exercises: [ex]
      }));
      expect(cycle.config.hangSec).toBe(10);
      expect(cycle.config.restSec).toBe(5);
      expect(cycle.config.repsPerSet).toBe(4);
      expect(cycle.config.setsCount).toBe(2);
      expect(cycle.config.restBetweenSetsSec).toBe(120);
    });

    it('defaults применяются при отсутствии полей (hangSec:7, restSec:3, ...)', () => {
      render(React.createElement(ER(), {
        exercise: {}, exIdx: 0, totalExercises: 1, exercises: [{}]
      }));
      expect(cycle.config.hangSec).toBe(7);
      expect(cycle.config.restSec).toBe(3);
      expect(cycle.config.repsPerSet).toBe(6);
      expect(cycle.config.setsCount).toBe(3);
      expect(cycle.config.restBetweenSetsSec).toBe(180);
    });

    it('onComplete и onStateChange wired', () => {
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()]
      }));
      expect(typeof cycle.config.onComplete).toBe('function');
      expect(typeof cycle.config.onStateChange).toBe('function');
    });
  });

  describe('Snapshot-resume (требование #9.3)', () => {
    it('initialSnapshot + exIdx match → cycle.startFromSnapshot вызывается с snap', async () => {
      const snap = { state: S().HANG, setIdx: 1, repIdx: 2, exIdx: 0, phaseStartedAt: Date.now(), durationSec: 7 };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], initialSnapshot: snap
      }));
      // useEffect асинхронно через Promise (waitPromise).
      await act(async () => { await Promise.resolve(); });
      expect(cycle.startFromSnapshotCalled).toBe(true);
      expect(cycle.startFromSnapshotArg).toBe(snap);
      expect(cycle.startCalled).toBe(false); // НЕ обычный start
    });

    it('initialSnapshot без exIdx match → обычный start, не startFromSnapshot', async () => {
      const snap = { state: S().HANG, setIdx: 1, repIdx: 2, exIdx: 5 /* другой */ };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], initialSnapshot: snap
      }));
      await act(async () => { await Promise.resolve(); });
      expect(cycle.startCalled).toBe(true);
      expect(cycle.startFromSnapshotCalled).toBe(false);
    });

    it('без initialSnapshot → обычный start', async () => {
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()]
      }));
      await act(async () => { await Promise.resolve(); });
      expect(cycle.startCalled).toBe(true);
    });
  });

  describe('RPE flow / onSetFeedback (требования #9.1-2)', () => {
    it('BIG_REST → показывается non-final RPE-prompt с setIdx', () => {
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 2, totalExercises: 5,
        exercises: [defaultExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().BIG_REST, { setIdx: 1 }); });
      // Подход 2 — как прошёл? (setIdx=1 → setNo=2)
      expect(container.textContent).toMatch(/Подход 2.*как прошёл/);
    });

    it('submit RPE из BIG_REST → onSetFeedback(exIdx, setIdx, {rpe, pain}) с верными индексами', () => {
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 3, totalExercises: 5,
        exercises: [defaultExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().BIG_REST, { setIdx: 1 }); });
      // Клик «Норм»
      const okBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Норм'));
      fireEvent.click(okBtn);
      expect(onSetFeedback).toHaveBeenCalledWith(3, 1, { rpe: 'ok', pain: false });
    });

    it('submit с pain=true → передаётся {rpe, pain:true}', () => {
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      // Чекбокс боли
      const painCheckbox = container.querySelector('input[type="checkbox"]');
      fireEvent.click(painCheckbox);
      const hardBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Тяжело'));
      fireEvent.click(hardBtn);
      expect(onSetFeedback).toHaveBeenCalledWith(0, 0, { rpe: 'hard', pain: true });
    });

    it('БЕЗ onSetFeedback → RPE-prompt НЕ показывается', () => {
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onDone: vi.fn()
        // нет onSetFeedback
      }));
      act(() => { cycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      expect(container.querySelector('.fingers-fs-rpe-overlay')).toBeNull();
    });

    it('HANG/SET_PREP после BIG_REST → non-final prompt auto-dismiss', () => {
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      expect(container.querySelector('.fingers-fs-rpe-overlay')).not.toBeNull();
      // Юзер не отвечает, заходит SET_PREP next set
      act(() => { cycle.onStateChange(S().SET_PREP, { setIdx: 1, repIdx: 0, durationSec: 5 }); });
      expect(container.querySelector('.fingers-fs-rpe-overlay')).toBeNull();
    });
  });

  describe('Финальный RPE-prompt → onDone (требование #9.2)', () => {
    it('cycle.onComplete показывает final RPE-prompt (последний сет, isFinal)', () => {
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise({ setsCount: 3 }), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise({ setsCount: 3 })],
        onSetFeedback, onDone: vi.fn()
      }));
      act(() => { cycle.onComplete(); });
      expect(container.textContent).toMatch(/Последний подход — как прошёл/);
    });

    it('submit финального → onSetFeedback + onDone (обе вызваны)', () => {
      const onSetFeedback = vi.fn();
      const onDone = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise({ setsCount: 3 }), exIdx: 4, totalExercises: 5,
        exercises: [defaultExercise({ setsCount: 3 })],
        onSetFeedback, onDone
      }));
      act(() => { cycle.onComplete(); });
      const okBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Норм'));
      fireEvent.click(okBtn);
      expect(onSetFeedback).toHaveBeenCalledWith(4, 2 /* lastSet=setsCount-1 */, { rpe: 'ok', pain: false });
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('skip финального → onDone (без onSetFeedback)', () => {
      const onSetFeedback = vi.fn();
      const onDone = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onSetFeedback, onDone
      }));
      act(() => { cycle.onComplete(); });
      const skipBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Пропустить');
      fireEvent.click(skipBtn);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onSetFeedback).not.toHaveBeenCalled();
    });

    it('БЕЗ onSetFeedback → cycle.onComplete вызывает onDone напрямую (без prompt)', () => {
      const onDone = vi.fn();
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onDone
        // нет onSetFeedback
      }));
      act(() => { cycle.onComplete(); });
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  describe('Abort confirm-flow (требование #9.4)', () => {
    it('БЕЗ ConfirmModal → abort сразу вызывает cycle.abort + onAbort', () => {
      const onAbort = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onAbort, onDone: vi.fn()
      }));
      // Найти Прервать кнопку (стаб CountdownDisplay не рендерит её, но
      // ExerciseRunner подключает её к onAbort prop CountdownDisplay).
      // Так как stub не рендерит контролы, тригернём requestAbort напрямую
      // через CountdownDisplay props — пересоберём stub чтобы заклинить onAbort.
      // Альтернатива: тригернём через захват props CountdownDisplay.
      // Воссоздадим Display чтобы захватить onAbort.
      // (Упрощение: используем тот факт что CountdownDisplay stub не рендерит controls,
      //  поэтому требуется capture via Display props.)
      const displayPropsCapture = vi.fn();
      globalThis.HEYS.Fingers.CountdownDisplay = function (props) {
        displayPropsCapture(props);
        return React.createElement('div');
      };
      // Re-render
      const { container: c2 } = render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onAbort, onDone: vi.fn()
      }));
      // Trigger captured onAbort
      const lastProps = displayPropsCapture.mock.calls[displayPropsCapture.mock.calls.length - 1][0];
      act(() => { lastProps.onAbort(); });
      expect(cycle.abortCalled).toBe(true);
      expect(onAbort).toHaveBeenCalledTimes(1);
    });

    it('С ConfirmModal → показывается «Прервать тренировку?», cancel НЕ вызывает abort', () => {
      const onAbort = vi.fn();
      const confirmShow = vi.fn();
      globalThis.HEYS.ConfirmModal = { show: confirmShow };
      const displayPropsCapture = vi.fn();
      globalThis.HEYS.Fingers.CountdownDisplay = function (props) {
        displayPropsCapture(props);
        return React.createElement('div');
      };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onAbort, onDone: vi.fn()
      }));
      const lastProps = displayPropsCapture.mock.calls[displayPropsCapture.mock.calls.length - 1][0];
      act(() => { lastProps.onAbort(); });
      expect(confirmShow).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Прервать тренировку?',
        confirmText: 'Прервать',
        cancelText: 'Продолжить',
      }));
      // Cancel: onConfirm не вызываем — abort НЕ должен случиться
      expect(cycle.abortCalled).toBe(false);
      expect(onAbort).not.toHaveBeenCalled();
    });

    it('Confirm "Прервать" БЕЗ прогресса → сразу finalize (abort + onAbort)', () => {
      const onAbort = vi.fn();
      const confirmShow = vi.fn();
      globalThis.HEYS.ConfirmModal = { show: confirmShow };
      const displayPropsCapture = vi.fn();
      globalThis.HEYS.Fingers.CountdownDisplay = function (props) {
        displayPropsCapture(props);
        return React.createElement('div');
      };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onAbort, onDone: vi.fn()
      }));
      const lastProps = displayPropsCapture.mock.calls[displayPropsCapture.mock.calls.length - 1][0];
      act(() => { lastProps.onAbort(); });
      const firstModal = confirmShow.mock.calls[0][0];
      // exIdx=0, setIdx=0, repIdx=0 → нет progress → finalize сразу
      act(() => { firstModal.onConfirm(); });
      expect(cycle.abortCalled).toBe(true);
      expect(onAbort).toHaveBeenCalledTimes(1);
    });

    it('Confirm "Прервать" С прогрессом → второй модал «Записать прогресс?»', () => {
      const onAbort = vi.fn();
      const confirmShow = vi.fn();
      globalThis.HEYS.ConfirmModal = { show: confirmShow };
      // Симулируем progress (exIdx > 0 или setIdx > 0)
      cycle.setIdx = 2;
      const displayPropsCapture = vi.fn();
      globalThis.HEYS.Fingers.CountdownDisplay = function (props) {
        displayPropsCapture(props);
        return React.createElement('div');
      };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1,
        exercises: [defaultExercise()], onAbort, onDone: vi.fn()
      }));
      const lastProps = displayPropsCapture.mock.calls[displayPropsCapture.mock.calls.length - 1][0];
      act(() => { lastProps.onAbort(); });
      const firstModal = confirmShow.mock.calls[0][0];
      act(() => { firstModal.onConfirm(); });
      // Должен показаться ВТОРОЙ модал
      expect(confirmShow.mock.calls.length).toBe(2);
      expect(confirmShow.mock.calls[1][0]).toMatchObject({
        title: 'Записать прогресс?',
        confirmText: 'Записать как частично',
      });
    });
  });

  describe('Step 4 reps-path — S8 наследуется через shared shell', () => {
    // Stub useRepsCycle параллельно с useCountdownCycle.
    function installRepsCycleStub() {
      const captured = {
        config: null, onComplete: null, onStateChange: null,
        state: 'IDLE', setIdx: 0, repIdx: 0, secondsLeft: 0,
        completeSetCalled: false, abortCalled: false, startCalled: false,
      };
      globalThis.HEYS.Fingers.useRepsCycle = function (cfg) {
        captured.config = cfg;
        captured.onComplete = cfg.onComplete;
        captured.onStateChange = cfg.onStateChange;
        return {
          get state() { return captured.state; },
          get setIdx() { return captured.setIdx; },
          repIdx: 0,
          get secondsLeft() { return captured.secondsLeft; },
          totalElapsed: 0,
          start: () => { captured.startCalled = true; },
          pause: () => {}, resume: () => {},
          abort: () => { captured.abortCalled = true; },
          completeSet: () => { captured.completeSetCalled = true; },
          skipPhase: () => {},
          startFromSnapshot: () => {},
        };
      };
      return captured;
    }

    const repsExercise = (over = {}) => ({
      doseShape: 'reps',
      dose: { reps: [8, 12], sets: 3, restSetsSec: 60 },
      setsCount: 3, restBetweenSetsSec: 60,
      addedWeightKg: 0,
      ...over
    });

    it('exercise.doseShape="reps" → RepsRunner (useRepsCycle вызван, useCountdownCycle НЕ вызван)', () => {
      const repsCycle = installRepsCycleStub();
      // Reset hang cycle stub state to detect non-call.
      cycle.startCalled = false; cycle.config = null;
      render(React.createElement(ER(), {
        exercise: repsExercise(), exIdx: 0, totalExercises: 1, exercises: [repsExercise()]
      }));
      expect(repsCycle.config).not.toBeNull();
      // useCountdownCycle НЕ вызван (Rules of Hooks: только один runner монтируется).
      expect(cycle.config).toBeNull();
    });

    it('reps BIG_REST → non-final RPE-prompt (S8 наследуется)', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: repsExercise(), exIdx: 1, totalExercises: 2,
        exercises: [repsExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { repsCycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      expect(container.textContent).toMatch(/Подход 1.*как прошёл/);
    });

    it('reps submit non-final → onSetFeedback с верными индексами + pain', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: repsExercise(), exIdx: 2, totalExercises: 3,
        exercises: [repsExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { repsCycle.onStateChange(S().BIG_REST, { setIdx: 1 }); });
      // pain-чекбокс + Тяжело
      fireEvent.click(container.querySelector('input[type="checkbox"]'));
      const hardBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Тяжело'));
      fireEvent.click(hardBtn);
      // S8 контракт ТОТ ЖЕ что для hang.
      expect(onSetFeedback).toHaveBeenCalledWith(2, 1, { rpe: 'hard', pain: true });
    });

    it('reps onComplete (после completeSet последнего сета) → final RPE → onSetFeedback + onDone', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const onDone = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: repsExercise({ setsCount: 3 }), exIdx: 4, totalExercises: 5,
        exercises: [repsExercise({ setsCount: 3 })], onSetFeedback, onDone
      }));
      // Симулируем completeSet на последнем сете → useRepsCycle → onComplete.
      act(() => { repsCycle.onComplete(); });
      expect(container.textContent).toMatch(/Последний подход — как прошёл/);
      // Submit final
      const okBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Норм'));
      fireEvent.click(okBtn);
      expect(onSetFeedback).toHaveBeenCalledWith(4, 2 /* lastSet=setsCount-1 */, { rpe: 'ok', pain: false });
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('reps без onSetFeedback → cycle.onComplete вызывает onDone напрямую', () => {
      const repsCycle = installRepsCycleStub();
      const onDone = vi.fn();
      render(React.createElement(ER(), {
        exercise: repsExercise(), exIdx: 0, totalExercises: 1,
        exercises: [repsExercise()], onDone
        // нет onSetFeedback → final RPE-flow выключен
      }));
      act(() => { repsCycle.onComplete(); });
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('reps REPS_INPUT после BIG_REST → non-final prompt auto-dismiss', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: repsExercise(), exIdx: 0, totalExercises: 1,
        exercises: [repsExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { repsCycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      expect(container.querySelector('.fingers-fs-rpe-overlay')).not.toBeNull();
      // Юзер не отвечает, заходит REPS_INPUT next set (Step 4 добавил REPS_INPUT в auto-dismiss states).
      act(() => { repsCycle.onStateChange(S().REPS_INPUT, { setIdx: 1 }); });
      expect(container.querySelector('.fingers-fs-rpe-overlay')).toBeNull();
    });
  });

  describe('Шаг 5 continuous-path — useCountdownCycle reuse через ContinuousRunner', () => {
    const continuousExercise = (over = {}) => ({
      doseShape: 'continuous',
      gripId: 'aer_arc',
      dose: { workSec: 1800, sets: 1 },
      setsCount: 1, restBetweenSetsSec: 0,
      ...over
    });

    it('exercise.doseShape="continuous" → ContinuousRunner (useCountdownCycle с hangSec=workSec, repsPerSet=1)', () => {
      cycle.startCalled = false; cycle.config = null;
      render(React.createElement(ER(), {
        exercise: continuousExercise(),
        exIdx: 0, totalExercises: 1, exercises: [continuousExercise()]
      }));
      expect(cycle.config).not.toBeNull();
      expect(cycle.config.hangSec).toBe(1800);
      expect(cycle.config.repsPerSet).toBe(1);
      expect(cycle.config.restSec).toBe(0);
      expect(cycle.config.setsCount).toBe(1);
    });

    it('continuous BIG_REST (sets>1) → non-final RPE-prompt (S8 наследуется)', () => {
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: continuousExercise({ dose: { workSec: 900, sets: 2 }, setsCount: 2 }),
        exIdx: 0, totalExercises: 1,
        exercises: [continuousExercise({ dose: { workSec: 900, sets: 2 }, setsCount: 2 })],
        onSetFeedback, onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      expect(container.textContent).toMatch(/Подход 1.*как прошёл/);
    });

    it('continuous onComplete → final RPE → onSetFeedback + onDone (sets=1 единственный)', () => {
      const onSetFeedback = vi.fn();
      const onDone = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: continuousExercise(), exIdx: 2, totalExercises: 3,
        exercises: [continuousExercise()], onSetFeedback, onDone
      }));
      act(() => { cycle.onComplete(); });
      expect(container.textContent).toMatch(/Последний подход — как прошёл/);
      const okBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Норм'));
      fireEvent.click(okBtn);
      expect(onSetFeedback).toHaveBeenCalledWith(2, 0, { rpe: 'ok', pain: false });
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('continuous dose.restSetsSec → проброс в restBetweenSetsSec', () => {
      render(React.createElement(ER(), {
        exercise: continuousExercise({
          dose: { workSec: 900, sets: 2, restSetsSec: 240 },
          setsCount: 2
        }),
        exIdx: 0, totalExercises: 1, exercises: [continuousExercise()]
      }));
      expect(cycle.config.restBetweenSetsSec).toBe(240);
    });
  });

  describe('Шаг 5b attempts-path — useRepsCycle reuse через AttemptsRunner', () => {
    function installRepsCycleStub() {
      const captured = {
        config: null, onComplete: null, onStateChange: null,
        state: 'IDLE', setIdx: 0, repIdx: 0, secondsLeft: 0,
        completeSetCalled: false,
      };
      globalThis.HEYS.Fingers.useRepsCycle = function (cfg) {
        captured.config = cfg;
        captured.onComplete = cfg.onComplete;
        captured.onStateChange = cfg.onStateChange;
        return {
          get state() { return captured.state; },
          get setIdx() { return captured.setIdx; },
          repIdx: 0,
          get secondsLeft() { return captured.secondsLeft; },
          totalElapsed: 0,
          start: () => {},
          pause: () => {}, resume: () => {},
          abort: () => {},
          completeSet: () => { captured.completeSetCalled = true; },
          skipPhase: () => {},
          startFromSnapshot: () => {},
        };
      };
      return captured;
    }

    const attemptsExercise = (over = {}) => ({
      doseShape: 'attempts',
      gripId: 'halfcrimp', edgeSizeMm: 20,
      dose: { movesPerAttempt: [1, 5], attempts: [6, 12], restSetsSec: 240 },
      addedWeightKg: 0,
      ...over
    });

    it('exercise.doseShape="attempts" → AttemptsRunner (useRepsCycle с setsCount=upper(attempts)=12)', () => {
      const repsCycle = installRepsCycleStub();
      cycle.startCalled = false; cycle.config = null;
      render(React.createElement(ER(), {
        exercise: attemptsExercise(),
        exIdx: 0, totalExercises: 1, exercises: [attemptsExercise()]
      }));
      expect(repsCycle.config).not.toBeNull();
      expect(repsCycle.config.setsCount).toBe(12);
      expect(repsCycle.config.restBetweenSetsSec).toBe(240);
      // useCountdownCycle НЕ вызван.
      expect(cycle.config).toBeNull();
    });

    it('attempts scalar dose.attempts=9 → setsCount=9', () => {
      const repsCycle = installRepsCycleStub();
      render(React.createElement(ER(), {
        exercise: attemptsExercise({ dose: { movesPerAttempt: 3, attempts: 9, restSetsSec: 180 } }),
        exIdx: 0, totalExercises: 1, exercises: [attemptsExercise()]
      }));
      expect(repsCycle.config.setsCount).toBe(9);
      expect(repsCycle.config.restBetweenSetsSec).toBe(180);
    });

    it('attempts BIG_REST → non-final RPE-prompt (S8 наследуется)', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: attemptsExercise(), exIdx: 0, totalExercises: 1,
        exercises: [attemptsExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { repsCycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      expect(container.textContent).toMatch(/Подход 1.*как прошёл/);
    });

    it('attempts onComplete → final RPE → onSetFeedback + onDone (последняя попытка)', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const onDone = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: attemptsExercise(), exIdx: 1, totalExercises: 2,
        exercises: [attemptsExercise()], onSetFeedback, onDone
      }));
      act(() => { repsCycle.onComplete(); });
      expect(container.textContent).toMatch(/Последний подход — как прошёл/);
      const okBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Норм'));
      fireEvent.click(okBtn);
      // setIdx последней попытки = setsCount-1 = 11 (upper bound dose.attempts)
      expect(onSetFeedback).toHaveBeenCalledWith(1, 11, { rpe: 'ok', pain: false });
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('attempts по умолчанию (нет dose.attempts) → setsCount=6 fallback', () => {
      const repsCycle = installRepsCycleStub();
      render(React.createElement(ER(), {
        exercise: { doseShape: 'attempts', dose: { movesPerAttempt: [1, 3] } },
        exIdx: 0, totalExercises: 1, exercises: [{}]
      }));
      expect(repsCycle.config.setsCount).toBe(6);
      expect(repsCycle.config.restBetweenSetsSec).toBe(240);
    });
  });

  describe('Шаг 5c circuit-path — useRepsCycle reuse через CircuitRunner', () => {
    function installRepsCycleStub() {
      const captured = {
        config: null, onComplete: null, onStateChange: null,
        state: 'IDLE', setIdx: 0, repIdx: 0, secondsLeft: 0,
      };
      globalThis.HEYS.Fingers.useRepsCycle = function (cfg) {
        captured.config = cfg;
        captured.onComplete = cfg.onComplete;
        captured.onStateChange = cfg.onStateChange;
        return {
          get state() { return captured.state; },
          get setIdx() { return captured.setIdx; },
          repIdx: 0,
          get secondsLeft() { return captured.secondsLeft; },
          totalElapsed: 0,
          start: () => {}, pause: () => {}, resume: () => {},
          abort: () => {}, completeSet: () => {}, skipPhase: () => {},
          startFromSnapshot: () => {},
        };
      };
      return captured;
    }

    const circuitExercise = (over = {}) => ({
      doseShape: 'circuit',
      gripId: 'pe_boulder_4x4',
      dose: { problemsPerRound: 4, rounds: 4, restRoundsSec: 240 },
      addedWeightKg: 0,
      ...over
    });

    it('exercise.doseShape="circuit" → CircuitRunner (useRepsCycle с setsCount=rounds=4)', () => {
      const repsCycle = installRepsCycleStub();
      cycle.startCalled = false; cycle.config = null;
      render(React.createElement(ER(), {
        exercise: circuitExercise(),
        exIdx: 0, totalExercises: 1, exercises: [circuitExercise()]
      }));
      expect(repsCycle.config).not.toBeNull();
      expect(repsCycle.config.setsCount).toBe(4);
      expect(repsCycle.config.restBetweenSetsSec).toBe(240);
      expect(cycle.config).toBeNull();
    });

    it('circuit dose.rounds=10 (EMOM) → setsCount=10', () => {
      const repsCycle = installRepsCycleStub();
      render(React.createElement(ER(), {
        exercise: circuitExercise({
          dose: { problemsPerRound: 1, rounds: 10, restRoundsSec: 60 }
        }),
        exIdx: 0, totalExercises: 1, exercises: [circuitExercise()]
      }));
      expect(repsCycle.config.setsCount).toBe(10);
      expect(repsCycle.config.restBetweenSetsSec).toBe(60);
    });

    it('circuit BIG_REST → non-final RPE-prompt (S8 наследуется)', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: circuitExercise(), exIdx: 0, totalExercises: 1,
        exercises: [circuitExercise()], onSetFeedback, onDone: vi.fn()
      }));
      act(() => { repsCycle.onStateChange(S().BIG_REST, { setIdx: 0 }); });
      expect(container.textContent).toMatch(/Подход 1.*как прошёл/);
    });

    it('circuit onComplete → final RPE → onSetFeedback(setsCount-1) + onDone', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const onDone = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: circuitExercise(), exIdx: 2, totalExercises: 3,
        exercises: [circuitExercise()], onSetFeedback, onDone
      }));
      act(() => { repsCycle.onComplete(); });
      expect(container.textContent).toMatch(/Последний подход — как прошёл/);
      const okBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Норм'));
      fireEvent.click(okBtn);
      // setsCount=4 (rounds) → lastSet=3
      expect(onSetFeedback).toHaveBeenCalledWith(2, 3, { rpe: 'ok', pain: false });
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('circuit без dose → setsCount=4 fallback, restBetweenSetsSec=240', () => {
      const repsCycle = installRepsCycleStub();
      render(React.createElement(ER(), {
        exercise: { doseShape: 'circuit', dose: {} },
        exIdx: 0, totalExercises: 1, exercises: [{}]
      }));
      expect(repsCycle.config.setsCount).toBe(4);
      expect(repsCycle.config.restBetweenSetsSec).toBe(240);
    });
  });

  describe('Шаг 5d process-path — useRepsCycle reuse через ProcessRunner (1-set checklist)', () => {
    function installRepsCycleStub() {
      const captured = {
        config: null, onComplete: null, onStateChange: null,
        state: 'IDLE', setIdx: 0, repIdx: 0, secondsLeft: 0,
      };
      globalThis.HEYS.Fingers.useRepsCycle = function (cfg) {
        captured.config = cfg;
        captured.onComplete = cfg.onComplete;
        captured.onStateChange = cfg.onStateChange;
        return {
          get state() { return captured.state; },
          get setIdx() { return captured.setIdx; },
          repIdx: 0,
          get secondsLeft() { return captured.secondsLeft; },
          totalElapsed: 0,
          start: () => {}, pause: () => {}, resume: () => {},
          abort: () => {}, completeSet: () => {}, skipPhase: () => {},
          startFromSnapshot: () => {},
        };
      };
      return captured;
    }

    const processExercise = (over = {}) => ({
      doseShape: 'process',
      gripId: 'mental_redpoint_tactics',
      dose: { checklist: ['сегменты', 'beta-план', 'точки отдыха', 'дыхание'] },
      addedWeightKg: 0,
      ...over
    });

    it('exercise.doseShape="process" → ProcessRunner (useRepsCycle с setsCount=1)', () => {
      const repsCycle = installRepsCycleStub();
      cycle.startCalled = false; cycle.config = null;
      render(React.createElement(ER(), {
        exercise: processExercise(),
        exIdx: 0, totalExercises: 1, exercises: [processExercise()]
      }));
      expect(repsCycle.config).not.toBeNull();
      expect(repsCycle.config.setsCount).toBe(1);
      expect(repsCycle.config.restBetweenSetsSec).toBe(0);
      expect(cycle.config).toBeNull();
    });

    it('process onComplete → final RPE → onSetFeedback(0) + onDone (один проход)', () => {
      const repsCycle = installRepsCycleStub();
      const onSetFeedback = vi.fn();
      const onDone = vi.fn();
      const { container } = render(React.createElement(ER(), {
        exercise: processExercise(), exIdx: 3, totalExercises: 4,
        exercises: [processExercise()], onSetFeedback, onDone
      }));
      act(() => { repsCycle.onComplete(); });
      expect(container.textContent).toMatch(/Последний подход — как прошёл/);
      const okBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Норм'));
      fireEvent.click(okBtn);
      // setsCount=1 → lastSet=0
      expect(onSetFeedback).toHaveBeenCalledWith(3, 0, { rpe: 'ok', pain: false });
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('process без dose.checklist → setsCount=1 fallback OK', () => {
      const repsCycle = installRepsCycleStub();
      render(React.createElement(ER(), {
        exercise: { doseShape: 'process', dose: {} },
        exIdx: 0, totalExercises: 1, exercises: [{}]
      }));
      expect(repsCycle.config.setsCount).toBe(1);
      expect(repsCycle.config.restBetweenSetsSec).toBe(0);
    });
  });

  describe('persistence: handleStateChange (бонус #9)', () => {
    it('persistence.save вызывается на не-final state переходе', () => {
      const save = vi.fn();
      globalThis.HEYS.Fingers.persistence = { save, clear: vi.fn() };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1, exercises: [defaultExercise()],
        dateKey: '2026-06-09', trainingIndex: 0, programId: 'horst_max_hangs',
        onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().HANG, { setIdx: 0, repIdx: 0, durationSec: 7 }); });
      expect(save).toHaveBeenCalledTimes(1);
      const snap = save.mock.calls[0][0];
      expect(snap.state).toBe(S().HANG);
      expect(snap.setIdx).toBe(0);
      expect(snap.durationSec).toBe(7);
      expect(snap.programId).toBe('horst_max_hangs');
    });

    it('persistence.clear на DONE', () => {
      const clear = vi.fn();
      globalThis.HEYS.Fingers.persistence = { save: vi.fn(), clear };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1, exercises: [defaultExercise()],
        onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().DONE, {}); });
      expect(clear).toHaveBeenCalledTimes(1);
    });

    it('persistence.clear на ABORTED БЕЗ keepSnapshotOnAbortRef', () => {
      const clear = vi.fn();
      globalThis.HEYS.Fingers.persistence = { save: vi.fn(), clear };
      render(React.createElement(ER(), {
        exercise: defaultExercise(), exIdx: 0, totalExercises: 1, exercises: [defaultExercise()],
        onDone: vi.fn()
      }));
      act(() => { cycle.onStateChange(S().ABORTED, {}); });
      expect(clear).toHaveBeenCalledTimes(1);
    });
  });
});
