// fingers-attempts-display.test.js — Шаг 5b / AttemptsDisplay render tests.
//
// Покрывает phase-specific rendering для attempts doseShape (болдер-лимит, дайно,
// кампус, RFD pulls). Зеркалит RepsCounterDisplay, отличия:
//   - REPS_INPUT badge → 'ПОПЫТКА'
//   - counter → 'Попытка N/M'
//   - doneBtn → 'Попытка выполнена'
//   - movesPerAttempt → target chip ('3 движ.' / '1-5 движ.')
//   - BIG_REST badge → 'Отдых между попытками'

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
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

const Display = () => globalThis.HEYS.Fingers.AttemptsDisplay;
const S = () => globalThis.HEYS.Fingers.STATES;

describe('AttemptsDisplay — phase rendering (Шаг 5b)', () => {
  it('SET_PREP — ring + countdown digit, бейдж "Готовься"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 4, setIdx: 0, totalAttempts: 9,
      movesPerAttempt: [1, 5]
    }));
    expect(container.querySelector('[data-phase="prep"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готовься/);
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('4');
    expect(container.querySelector('.heys-fingers-reps-counter__done-btn')).toBeNull();
  });

  it('REPS_INPUT (=ATTEMPT) — большая кнопка без ring, badge "ПОПЫТКА"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalAttempts: 9,
      movesPerAttempt: [1, 5]
    }));
    expect(container.querySelector('[data-phase="attempt"]')).not.toBeNull();
    expect(container.textContent).toMatch(/ПОПЫТКА/);
    const doneBtn = container.querySelector('.heys-fingers-reps-counter__done-btn');
    expect(doneBtn).not.toBeNull();
    expect(doneBtn.textContent).toMatch(/Попытка выполнена/);
    expect(container.querySelector('.heys-fingers-countdown__ring')).toBeNull();
  });

  it('REPS_INPUT — movesPerAttempt диапазон [1,5] → "1–5 движ."', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalAttempts: 9, movesPerAttempt: [1, 5]
    }));
    expect(container.textContent).toMatch(/1.{0,3}5 движ\./);
  });

  it('REPS_INPUT — movesPerAttempt как scalar number → "N движ."', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalAttempts: 6, movesPerAttempt: 3
    }));
    expect(container.textContent).toMatch(/3 движ\./);
  });

  it('REPS_INPUT — movesPerAttempt null/undefined → fallback "Попытка"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalAttempts: 6
    }));
    const target = container.querySelector('.heys-fingers-reps-counter__target');
    expect(target.textContent).toMatch(/Попытка/);
  });

  it('BIG_REST — ring + countdown + badge "Отдых между попытками"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().BIG_REST, secondsLeft: 240, setIdx: 0, totalAttempts: 9
    }));
    expect(container.querySelector('[data-phase="big-rest"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Отдых между попытками/);
    expect(container.querySelector('.heys-fingers-countdown__ring')).not.toBeNull();
  });

  it('counter "Попытка N/M"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 4, totalAttempts: 9, movesPerAttempt: [1, 5]
    }));
    const counter = container.querySelector('.heys-fingers-countdown__counter');
    expect(counter.textContent).toMatch(/Попытка 5\/9/);
  });

  it('gripLabel + gripId + edgeLabel + addedWeightKg → header + chips', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalAttempts: 6,
      gripLabel: 'Открытый хват', gripId: 'halfcrimp',
      edgeLabel: '20мм', addedWeightKg: 25
    }));
    expect(container.querySelector('.heys-fingers-countdown__grip').textContent).toBe('Открытый хват');
    expect(container.querySelector('img').getAttribute('src')).toBe('/exercises/halfcrimp.webp');
    expect(container.textContent).toMatch(/Грань/);
    expect(container.textContent).toMatch(/20мм/);
    expect(container.textContent).toMatch(/\+25 кг/);
  });

  it('PAUSED — controls (Resume label)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().PAUSED, secondsLeft: 120, setIdx: 0, totalAttempts: 9,
      onPause: vi.fn(), onAbort: vi.fn()
    }));
    expect(container.textContent).toMatch(/Пауза/);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Возобновить'));
    expect(btn).toBeDefined();
  });

  it('DONE / ABORTED — controls скрыты', () => {
    [S().DONE, S().ABORTED].forEach((state) => {
      const { container } = render(React.createElement(Display(), {
        state, setIdx: 0, totalAttempts: 9, onPause: vi.fn(), onAbort: vi.fn()
      }));
      expect(container.querySelector('.heys-fingers-countdown__controls')).toBeNull();
    });
  });

  it('onAttemptDone fires в REPS_INPUT при клике на done-btn', () => {
    const onAttemptDone = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalAttempts: 6,
      movesPerAttempt: 3, onAttemptDone, onPause: vi.fn(), onAbort: vi.fn()
    }));
    fireEvent.click(container.querySelector('.heys-fingers-reps-counter__done-btn'));
    expect(onAttemptDone).toHaveBeenCalledTimes(1);
  });

  it('onPause / onAbort / onSkip handlers вызываются', () => {
    const onPause = vi.fn();
    const onAbort = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().BIG_REST, secondsLeft: 200, setIdx: 0, totalAttempts: 9,
      onPause, onAbort, onSkip
    }));
    const pauseBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Пауза'));
    const abortBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Прервать'));
    const skipBtn = Array.from(container.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Пропустить фазу');
    fireEvent.click(pauseBtn);
    fireEvent.click(skipBtn);
    fireEvent.click(abortBtn);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('финальные 3 сек таймед фазы → digit получает is-final-count', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 2, setIdx: 0, totalAttempts: 9
    }));
    expect(container.querySelector('.heys-fingers-countdown__digit').className).toMatch(/is-final-count/);
  });

  it('IDLE — data-phase=idle, badge "Готов к старту"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().IDLE, setIdx: 0, totalAttempts: 9
    }));
    expect(container.querySelector('[data-phase="idle"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готов к старту/);
  });
});
