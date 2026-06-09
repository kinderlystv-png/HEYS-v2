// fingers-circuit-display.test.js — Шаг 5c / CircuitDisplay render tests.
//
// Покрывает phase-specific rendering для circuit doseShape (4x4, EMOM, связки,
// повторы трассы, power intervals). Зеркалит AttemptsDisplay, отличия:
//   - REPS_INPUT badge → 'РАУНД'
//   - counter → 'Раунд N/M'
//   - doneBtn → 'Раунд выполнен'
//   - problemsPerRound → target chip ('4 проблемы' / '1 связка' / '1 проблема')
//   - BIG_REST badge → 'Отдых между раундами'

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

const Display = () => globalThis.HEYS.Fingers.CircuitDisplay;
const S = () => globalThis.HEYS.Fingers.STATES;

describe('CircuitDisplay — phase rendering (Шаг 5c)', () => {
  it('SET_PREP — ring + countdown digit, бейдж "Готовься"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 4, setIdx: 0, totalRounds: 4,
      problemsPerRound: 4
    }));
    expect(container.querySelector('[data-phase="prep"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готовься/);
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('4');
    expect(container.querySelector('.heys-fingers-reps-counter__done-btn')).toBeNull();
  });

  it('REPS_INPUT (=ROUND) — большая кнопка без ring, badge "РАУНД"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 4, problemsPerRound: 4
    }));
    expect(container.querySelector('[data-phase="round"]')).not.toBeNull();
    expect(container.textContent).toMatch(/РАУНД/);
    const doneBtn = container.querySelector('.heys-fingers-reps-counter__done-btn');
    expect(doneBtn).not.toBeNull();
    expect(doneBtn.textContent).toMatch(/Раунд выполнен/);
    expect(container.querySelector('.heys-fingers-countdown__ring')).toBeNull();
  });

  it('REPS_INPUT — problemsPerRound=1 → "1 проблема"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 6, problemsPerRound: 1
    }));
    expect(container.textContent).toMatch(/1 проблема/);
  });

  it('REPS_INPUT — problemsPerRound=4 → "4 проблемы" (2-4 множ.)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 4, problemsPerRound: 4
    }));
    expect(container.textContent).toMatch(/4 проблемы/);
  });

  it('REPS_INPUT — problemsPerRound=5 → "5 проблем" (множ. 5+)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 4, problemsPerRound: 5
    }));
    expect(container.textContent).toMatch(/5 проблем/);
  });

  it('REPS_INPUT — problemsPerRound отсутствует → fallback "Раунд"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 4
    }));
    const target = container.querySelector('.heys-fingers-reps-counter__target');
    expect(target.textContent.trim()).toBe('Раунд');
  });

  it('BIG_REST — ring + countdown + badge "Отдых между раундами"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().BIG_REST, secondsLeft: 240, setIdx: 0, totalRounds: 4
    }));
    expect(container.querySelector('[data-phase="big-rest"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Отдых между раундами/);
    expect(container.querySelector('.heys-fingers-countdown__ring')).not.toBeNull();
  });

  it('counter "Раунд N/M"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 2, totalRounds: 4, problemsPerRound: 4
    }));
    const counter = container.querySelector('.heys-fingers-countdown__counter');
    expect(counter.textContent).toMatch(/Раунд 3\/4/);
  });

  it('gripLabel + gripId → h2 + hero image', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 4, problemsPerRound: 4,
      gripLabel: 'Boulder 4x4', gripId: 'pe_boulder_4x4'
    }));
    expect(container.querySelector('.heys-fingers-countdown__grip').textContent).toBe('Boulder 4x4');
    expect(container.querySelector('img').getAttribute('src')).toBe('/exercises/pe_boulder_4x4.webp');
  });

  it('edgeLabel → chip "Грань"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 4, problemsPerRound: 4,
      edgeLabel: '20мм'
    }));
    expect(container.textContent).toMatch(/Грань/);
    expect(container.textContent).toMatch(/20мм/);
  });

  it('PAUSED — controls (Resume label)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().PAUSED, secondsLeft: 120, setIdx: 0, totalRounds: 4,
      onPause: vi.fn(), onAbort: vi.fn()
    }));
    expect(container.textContent).toMatch(/Пауза/);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Возобновить'));
    expect(btn).toBeDefined();
  });

  it('DONE / ABORTED — controls скрыты', () => {
    [S().DONE, S().ABORTED].forEach((state) => {
      const { container } = render(React.createElement(Display(), {
        state, setIdx: 0, totalRounds: 4, onPause: vi.fn(), onAbort: vi.fn()
      }));
      expect(container.querySelector('.heys-fingers-countdown__controls')).toBeNull();
    });
  });

  it('onRoundDone fires в REPS_INPUT при клике на done-btn', () => {
    const onRoundDone = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalRounds: 4, problemsPerRound: 4,
      onRoundDone, onPause: vi.fn(), onAbort: vi.fn()
    }));
    fireEvent.click(container.querySelector('.heys-fingers-reps-counter__done-btn'));
    expect(onRoundDone).toHaveBeenCalledTimes(1);
  });

  it('onPause / onAbort / onSkip handlers вызываются', () => {
    const onPause = vi.fn();
    const onAbort = vi.fn();
    const onSkip = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().BIG_REST, secondsLeft: 200, setIdx: 0, totalRounds: 4,
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
      state: S().SET_PREP, secondsLeft: 2, setIdx: 0, totalRounds: 4
    }));
    expect(container.querySelector('.heys-fingers-countdown__digit').className).toMatch(/is-final-count/);
  });

  it('IDLE — data-phase=idle, badge "Готов к старту"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().IDLE, setIdx: 0, totalRounds: 4
    }));
    expect(container.querySelector('[data-phase="idle"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готов к старту/);
  });
});
