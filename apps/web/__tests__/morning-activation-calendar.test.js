import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindow = global.window;
const originalReact = global.React;
const CALENDAR_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_activation_calendar_v1.js'), 'utf8');

function loadCalendar() {
  global.window = global;
  global.React = {
    useState: vi.fn(),
    useMemo: vi.fn(),
    useCallback: vi.fn(),
    useEffect: vi.fn(),
    useRef: vi.fn(),
    createElement: vi.fn(),
  };
  global.HEYS = {
    dayUtils: {
      todayISO: () => '2026-06-03',
    },
  };
  eval(CALENDAR_SRC);
  return global.HEYS.morningActivationCalendar;
}

describe('morning activation habit calendar', () => {
  afterEach(() => {
    global.HEYS = originalHEYS;
    global.window = originalWindow;
    global.React = originalReact;
    vi.restoreAllMocks();
  });

  it('counts first-half training replacement as done but keeps a distinct calendar status', () => {
    const calendar = loadCalendar();
    const days = {
      '2026-06-01': {
        morningActivation: {
          status: 'done',
          replacement: 'first_half_training',
          firstMealTime: '09:00',
        },
      },
      '2026-06-02': {
        morningActivation: {
          status: 'done',
          intensity: 'medium',
          firstMealTime: '08:40',
        },
      },
    };

    const data = calendar.buildMorningActivationCalendarData(
      '2026-06-03',
      calendar.VIEW_28_DAYS,
      (dateKey) => days[dateKey] || {}
    );

    const replacementDay = data.grid.find((cell) => cell.dateKey === '2026-06-01');
    const chargeDay = data.grid.find((cell) => cell.dateKey === '2026-06-02');

    expect(replacementDay.status).toBe('replacement');
    expect(chargeDay.status).toBe('done');
    expect(data.doneCount).toBe(2);
    expect(data.replacementCount).toBe(1);
  });

  it('uses replacement training evidence when the morningActivation object is missing', () => {
    const calendar = loadCalendar();
    const days = {
      '2026-06-01': {
        trainings: [{ source: 'morning_activation_replacement' }],
      },
    };

    const data = calendar.buildMorningActivationCalendarData(
      '2026-06-03',
      calendar.VIEW_28_DAYS,
      (dateKey) => days[dateKey] || {}
    );

    expect(data.grid.find((cell) => cell.dateKey === '2026-06-01').status).toBe('replacement');
    expect(data.doneCount).toBe(1);
    expect(data.replacementCount).toBe(1);
  });
});
