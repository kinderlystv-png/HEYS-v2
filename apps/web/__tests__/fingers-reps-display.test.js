// fingers-reps-display.test.js — Step 3 / RepsCounterDisplay render tests.
//
// Покрывает phase-specific rendering и callbacks. Зеркалит структуру
// CountdownDisplay где общие props (счётчик сетов, chips, controls).
// Phase-specific: REPS_INPUT — большая кнопка «Подход выполнен» без ring.

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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

const Display = () => globalThis.HEYS.Fingers.RepsCounterDisplay;
const S = () => globalThis.HEYS.Fingers.STATES;

describe('RepsCounterDisplay — phase rendering (Step 3 / ревью #9)', () => {
  it('SET_PREP — рендерит ring + countdown digit, бейдж "Готовься"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 4, setIdx: 0, totalSets: 3,
      reps: [8, 12]
    }));
    expect(container.querySelector('[data-phase="prep"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готовься/);
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('4');
    // SET_PREP — НЕТ кнопки «Подход выполнен»
    expect(container.querySelector('.heys-fingers-reps-counter__done-btn')).toBeNull();
  });

  it('REPS_INPUT — рендерит большую кнопку без ring, badge "ПОВТОРЫ"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3,
      reps: [8, 12]
    }));
    expect(container.querySelector('[data-phase="reps"]')).not.toBeNull();
    expect(container.textContent).toMatch(/ПОВТОРЫ/);
    // Manual phase — есть большая кнопка
    const doneBtn = container.querySelector('.heys-fingers-reps-counter__done-btn');
    expect(doneBtn).not.toBeNull();
    expect(doneBtn.textContent).toMatch(/Подход выполнен/);
    // Manual phase — НЕТ ring
    expect(container.querySelector('.heys-fingers-countdown__ring')).toBeNull();
  });

  it('REPS_INPUT — reps target отображается: диапазон [8,12] → "8–12 повт."', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: [8, 12]
    }));
    expect(container.textContent).toMatch(/8.{0,3}12 повт\./); // допускаем разные тире
  });

  it('REPS_INPUT — reps как scalar number → "N повт."', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 1, reps: 10
    }));
    expect(container.textContent).toMatch(/10 повт\./);
  });

  it('REPS_INPUT — reps=null/undefined → fallback "Подход"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 1
    }));
    const target = container.querySelector('.heys-fingers-reps-counter__target');
    expect(target.textContent).toMatch(/Подход/);
  });

  it('BIG_REST — рендерит ring + countdown (как hang BIG_REST)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().BIG_REST, secondsLeft: 30, setIdx: 0, totalSets: 2
    }));
    expect(container.querySelector('[data-phase="big-rest"]')).not.toBeNull();
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('30');
    expect(container.textContent).toMatch(/Большой отдых/);
  });

  it('DONE — нет controls, бейдж "Готово!"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().DONE, setIdx: 2, totalSets: 3
    }));
    expect(container.querySelector('[data-phase="done"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готово/);
    expect(container.querySelector('.heys-fingers-countdown__controls')).toBeNull();
  });

  it('IDLE — нет controls', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().IDLE, setIdx: 0, totalSets: 3
    }));
    expect(container.querySelector('.heys-fingers-countdown__controls')).toBeNull();
  });

  it('PAUSED — есть Resume button', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().PAUSED, setIdx: 0, totalSets: 3, onPause: vi.fn(), onAbort: vi.fn()
    }));
    expect(container.textContent).toMatch(/Возобновить/);
  });
});

describe('RepsCounterDisplay — counter and chips', () => {
  it('счётчик сетов: setIdx=0 totalSets=3 → "Подход 1/3"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: 10
    }));
    expect(container.textContent).toMatch(/Подход 1\/3/);
  });

  it('addedWeightKg chip: +20кг рендерится с "+" префиксом', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: [3, 5], addedWeightKg: 20
    }));
    const chip = container.querySelector('.heys-fingers-countdown__chip--weight');
    expect(chip).not.toBeNull();
    expect(chip.getAttribute('data-weight-sign')).toBe('plus');
    expect(chip.textContent).toMatch(/\+20.*кг/);
  });

  it('addedWeightKg=0 → chip есть, data-weight-sign=zero', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: 10, addedWeightKg: 0
    }));
    const chip = container.querySelector('.heys-fingers-countdown__chip--weight');
    expect(chip).not.toBeNull();
    expect(chip.getAttribute('data-weight-sign')).toBe('zero');
  });

  it('addedWeightKg отсутствует → chip не рендерится', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: 10
    }));
    expect(container.querySelector('.heys-fingers-countdown__chip--weight')).toBeNull();
  });

  it('edgeLabel chip рендерится для weighted-pulls', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: [3, 5],
      addedWeightKg: 20, edgeLabel: '20мм'
    }));
    expect(container.textContent).toMatch(/Грань.*20мм/);
  });

  it('gripLabel рендерится в h2', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 1, reps: 10,
      gripLabel: 'Полузамок'
    }));
    expect(container.querySelector('h2').textContent).toBe('Полузамок');
  });
});

describe('RepsCounterDisplay — callbacks', () => {
  it('Кнопка «Подход выполнен» вызывает onSetDone', () => {
    const onSetDone = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: 10,
      onSetDone
    }));
    fireEvent.click(container.querySelector('.heys-fingers-reps-counter__done-btn'));
    expect(onSetDone).toHaveBeenCalledTimes(1);
  });

  it('Кнопка «Пауза» вызывает onPause', () => {
    const onPause = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: 10,
      onPause, onAbort: vi.fn()
    }));
    const pauseBtn = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent.includes('Пауза'));
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('Кнопка «Прервать» вызывает onAbort', () => {
    const onAbort = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, setIdx: 0, totalSets: 3, reps: 10,
      onPause: vi.fn(), onAbort
    }));
    const abortBtn = container.querySelector('.heys-fingers-countdown__btn--abort');
    fireEvent.click(abortBtn);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('Skip-кнопка вызывает onSkip когда передана', () => {
    const onSkip = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().BIG_REST, secondsLeft: 30, setIdx: 0, totalSets: 2,
      onPause: vi.fn(), onAbort: vi.fn(), onSkip
    }));
    const skipBtn = container.querySelector('button[aria-label="Пропустить фазу"]');
    expect(skipBtn).not.toBeNull();
    fireEvent.click(skipBtn);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('Skip-кнопка не рендерится в PAUSED', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().PAUSED, setIdx: 0, totalSets: 2,
      onPause: vi.fn(), onAbort: vi.fn(), onSkip: vi.fn()
    }));
    expect(container.querySelector('button[aria-label="Пропустить фазу"]')).toBeNull();
  });
});

describe('RepsCounterDisplay — экспонирован через Fingers namespace', () => {
  it('Fingers.RepsCounterDisplay === функция', () => {
    expect(typeof Display()).toBe('function');
  });
});
