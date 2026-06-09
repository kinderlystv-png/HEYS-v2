// fingers-process-display.test.js — Шаг 5d / ProcessDisplay render tests.
//
// Покрывает phase-specific rendering для process doseShape (тактика redpoint:
// сегменты, beta-план, дыхание, меморизация). UX отличается фундаментально —
// без таймера, чек-лист с checkbox'ами и кнопкой «Закончить» (disabled пока
// нет ни одной галки).

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

const Display = () => globalThis.HEYS.Fingers.ProcessDisplay;
const S = () => globalThis.HEYS.Fingers.STATES;

describe('ProcessDisplay — phase rendering (Шаг 5d)', () => {
  it('SET_PREP — ring + countdown digit', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 4, checklist: ['сегменты', 'beta']
    }));
    expect(container.querySelector('[data-phase="prep"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готовься/);
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('4');
    // SET_PREP — чек-листа нет
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  it('REPS_INPUT (=PROCESS) — рендерит чек-лист с item-ами, badge "ПРОЦЕСС"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: ['сегменты', 'beta-план', 'дыхание']
    }));
    expect(container.querySelector('[data-phase="process"]')).not.toBeNull();
    expect(container.textContent).toMatch(/ПРОЦЕСС/);
    const items = container.querySelectorAll('.heys-fingers-process__item');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toMatch(/сегменты/);
    expect(items[1].textContent).toMatch(/beta-план/);
    expect(items[2].textContent).toMatch(/дыхание/);
  });

  it('REPS_INPUT — пустой checklist → fallback empty-message', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: []
    }));
    expect(container.textContent).toMatch(/Пройди процесс по своему чек-листу/);
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  it('REPS_INPUT — done-btn disabled пока нет галок', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: ['сегменты', 'beta']
    }));
    const btn = container.querySelector('.heys-fingers-reps-counter__done-btn');
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
    expect(btn.className).toMatch(/is-disabled/);
  });

  it('REPS_INPUT — клик на checkbox → done-btn enabled', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: ['сегменты', 'beta']
    }));
    const checkbox0 = container.querySelectorAll('input[type="checkbox"]')[0];
    fireEvent.click(checkbox0);
    const btn = container.querySelector('.heys-fingers-reps-counter__done-btn');
    expect(btn.disabled).toBe(false);
  });

  it('REPS_INPUT — клик на checkbox → item получает is-checked', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: ['сегменты']
    }));
    const checkbox = container.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);
    const item = container.querySelector('.heys-fingers-process__item');
    expect(item.className).toMatch(/is-checked/);
  });

  it('REPS_INPUT — пустой checklist → done-btn НЕ disabled (manual process)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: []
    }));
    const btn = container.querySelector('.heys-fingers-reps-counter__done-btn');
    expect(btn.disabled).toBe(false);
  });

  it('onProcessDone fires в REPS_INPUT при клике на done-btn', () => {
    const onProcessDone = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: ['сегменты'], onProcessDone
    }));
    // Toggle item чтобы enable button
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    fireEvent.click(container.querySelector('.heys-fingers-reps-counter__done-btn'));
    expect(onProcessDone).toHaveBeenCalledTimes(1);
  });

  it('gripLabel + gripId → h2 + hero image', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: ['сегменты'],
      gripLabel: 'Redpoint tactics', gripId: 'mental_redpoint_tactics'
    }));
    expect(container.querySelector('.heys-fingers-countdown__grip').textContent).toBe('Redpoint tactics');
    expect(container.querySelector('img').getAttribute('src')).toBe('/exercises/mental_redpoint_tactics.webp');
  });

  it('PAUSED — controls (Resume label)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().PAUSED, checklist: ['сегменты'],
      onPause: vi.fn(), onAbort: vi.fn()
    }));
    expect(container.textContent).toMatch(/Пауза/);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Возобновить'));
    expect(btn).toBeDefined();
  });

  it('DONE / ABORTED — controls скрыты, чек-лист скрыт', () => {
    [S().DONE, S().ABORTED].forEach((state) => {
      const { container } = render(React.createElement(Display(), {
        state, checklist: ['сегменты'], onPause: vi.fn(), onAbort: vi.fn()
      }));
      expect(container.querySelector('.heys-fingers-countdown__controls')).toBeNull();
      expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    });
  });

  it('onPause / onAbort handlers вызываются', () => {
    const onPause = vi.fn();
    const onAbort = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().REPS_INPUT, checklist: ['сегменты'],
      onPause, onAbort, onProcessDone: vi.fn()
    }));
    const pauseBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Пауза'));
    const abortBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Прервать'));
    fireEvent.click(pauseBtn);
    fireEvent.click(abortBtn);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('финальные 3 сек SET_PREP → digit is-final-count', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 2, checklist: ['сегменты']
    }));
    expect(container.querySelector('.heys-fingers-countdown__digit').className).toMatch(/is-final-count/);
  });

  it('IDLE — data-phase=idle, badge "Готов к старту"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().IDLE, checklist: ['сегменты']
    }));
    expect(container.querySelector('[data-phase="idle"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готов к старту/);
  });
});
