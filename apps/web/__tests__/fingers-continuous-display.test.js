// fingers-continuous-display.test.js — Шаг 5 / ContinuousDisplay render tests.
//
// Покрывает phase-specific rendering для continuous doseShape (ARC/mileage/
// technique drills). Зеркалит структуру reps-display, но specific cases:
//   - HANG → label 'РАБОТА' (semantically «работа», не «вис»)
//   - HANG long workSec (≥60s) → mm:ss digit; короткий → pure seconds
//   - durationMinLabel → chip 'Длительность'
//   - sets=1 → нет counter; sets>1 → 'Подход N/M'

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

const Display = () => globalThis.HEYS.Fingers.ContinuousDisplay;
const S = () => globalThis.HEYS.Fingers.STATES;

describe('ContinuousDisplay — phase rendering (Шаг 5)', () => {
  it('SET_PREP — ring + countdown digit, бейдж "Готовься"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 4, setIdx: 0, totalSets: 1, workSec: 1800
    }));
    expect(container.querySelector('[data-phase="prep"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готовься/);
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('4');
  });

  it('HANG long workSec (≥60s) → bage "РАБОТА", mm:ss digit', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 1755, setIdx: 0, totalSets: 1, workSec: 1800
    }));
    expect(container.querySelector('[data-phase="work"]')).not.toBeNull();
    expect(container.textContent).toMatch(/РАБОТА/);
    // 1755 sec = 29:15
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('29:15');
  });

  it('HANG short workSec (<60s) → pure seconds digit', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 30, setIdx: 0, totalSets: 1, workSec: 45
    }));
    expect(container.querySelector('.heys-fingers-countdown__digit').textContent).toBe('30');
  });

  it('HANG ring — fill ratio пропорционален остатку workSec', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 900, setIdx: 0, totalSets: 1, workSec: 1800
    }));
    // 50% оставшегося → ring почти наполовину пустой (dashoffset на середине круга).
    const ring = container.querySelector('.heys-fingers-countdown__ring-fill');
    const dashoffset = Number(ring.getAttribute('stroke-dashoffset'));
    const dasharray = Number(ring.getAttribute('stroke-dasharray'));
    // ratio = 900/1800 = 0.5 → dashoffset ≈ 0.5 * circumference
    expect(dashoffset).toBeCloseTo(dasharray * 0.5, 0);
  });

  it('BIG_REST — ring + countdown (как hang BIG_REST)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().BIG_REST, secondsLeft: 90, setIdx: 0, totalSets: 2, workSec: 900
    }));
    expect(container.querySelector('[data-phase="big-rest"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Большой отдых/);
    expect(container.querySelector('.heys-fingers-countdown__ring')).not.toBeNull();
  });

  it('durationMinLabel → chip "Длительность"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 1800, setIdx: 0, totalSets: 1,
      workSec: 1800, durationMinLabel: '30 мин'
    }));
    expect(container.textContent).toMatch(/Длительность/);
    expect(container.textContent).toMatch(/30 мин/);
  });

  it('sets=1 → counter скрыт (только в continuous: 1 set обычно)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 1800, setIdx: 0, totalSets: 1, workSec: 1800
    }));
    const counter = container.querySelector('.heys-fingers-countdown__counter');
    expect(counter.textContent.trim()).toBe('');
  });

  it('sets>1 → counter "Подход N/M"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 900, setIdx: 1, totalSets: 3, workSec: 900
    }));
    const counter = container.querySelector('.heys-fingers-countdown__counter');
    expect(counter.textContent).toMatch(/Подход 2\/3/);
  });

  it('gripLabel + gripId → h2 + hero image', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 1800, setIdx: 0, totalSets: 1,
      workSec: 1800, gripLabel: 'ARC traverse', gripId: 'aer_arc'
    }));
    expect(container.querySelector('.heys-fingers-countdown__grip').textContent).toBe('ARC traverse');
    expect(container.querySelector('img').getAttribute('src')).toBe('/exercises/aer_arc.webp');
  });

  it('PAUSED — show controls (Pause→Resume label)', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().PAUSED, secondsLeft: 1500, setIdx: 0, totalSets: 1,
      workSec: 1800, onPause: vi.fn(), onAbort: vi.fn()
    }));
    expect(container.textContent).toMatch(/Пауза/);
    const btn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Возобновить'));
    expect(btn).toBeDefined();
  });

  it('DONE — controls скрыты', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().DONE, secondsLeft: 0, setIdx: 0, totalSets: 1,
      workSec: 1800, onPause: vi.fn(), onAbort: vi.fn()
    }));
    expect(container.textContent).toMatch(/Готово/);
    expect(container.querySelector('.heys-fingers-countdown__controls')).toBeNull();
  });

  it('ABORTED — controls скрыты', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().ABORTED, secondsLeft: 0, setIdx: 0, totalSets: 1, workSec: 1800
    }));
    expect(container.textContent).toMatch(/Прервано/);
    expect(container.querySelector('.heys-fingers-countdown__controls')).toBeNull();
  });

  it('onPause / onAbort handlers вызываются по клику', () => {
    const onPause = vi.fn();
    const onAbort = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 1500, setIdx: 0, totalSets: 1,
      workSec: 1800, onPause, onAbort
    }));
    const pauseBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Пауза'));
    const abortBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Прервать'));
    fireEvent.click(pauseBtn);
    fireEvent.click(abortBtn);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('onSkip — кнопка → отрисована только если callback передан', () => {
    const onSkip = vi.fn();
    const { container } = render(React.createElement(Display(), {
      state: S().HANG, secondsLeft: 1500, setIdx: 0, totalSets: 1,
      workSec: 1800, onPause: vi.fn(), onAbort: vi.fn(), onSkip
    }));
    const skipBtn = Array.from(container.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Пропустить фазу');
    expect(skipBtn).toBeDefined();
    fireEvent.click(skipBtn);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('финальные 3 сек активной фазы → digit получает is-final-count класс', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().SET_PREP, secondsLeft: 2, setIdx: 0, totalSets: 1, workSec: 1800
    }));
    expect(container.querySelector('.heys-fingers-countdown__digit').className).toMatch(/is-final-count/);
  });

  it('IDLE — без data-phase=idle, badge "Готов к старту"', () => {
    const { container } = render(React.createElement(Display(), {
      state: S().IDLE, secondsLeft: 0, setIdx: 0, totalSets: 1, workSec: 1800
    }));
    expect(container.querySelector('[data-phase="idle"]')).not.toBeNull();
    expect(container.textContent).toMatch(/Готов к старту/);
  });
});
