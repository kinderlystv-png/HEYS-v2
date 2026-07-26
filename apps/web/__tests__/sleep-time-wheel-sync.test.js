import fs from 'fs';
import path from 'path';

import { cleanup, render } from '@testing-library/react';
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STEPS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_steps_v1.js'),
  'utf8'
);

function loadSleepTimeStep(timePickerProps) {
  window.React = React;
  window.HEYS = {
    StepModal: {
      WheelPicker: () => null,
      TimePicker: (props) => {
        timePickerProps.push(props);
        return null;
      },
      registerStep: vi.fn(),
      utils: {
        lsGet: (_key, fallback) => fallback,
        lsSet: vi.fn(),
        getTodayKey: () => '2026-07-26',
      },
    },
  };

  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();
  return window.HEYS.Steps.SleepTime;
}

describe('sleep time wheel synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps both rapid wheel changes when React has not rendered between them', () => {
    const timePickerProps = [];
    const SleepTimeStep = loadSleepTimeStep(timePickerProps);
    const onChange = vi.fn();

    render(React.createElement(SleepTimeStep, {
      data: {
        sleepStartH: 3,
        sleepStartM: 0,
        sleepEndH: 9,
        sleepEndM: 10,
      },
      onChange,
    }));

    expect(timePickerProps).toHaveLength(2);

    act(() => {
      timePickerProps[0].onHoursChange(4);
      timePickerProps[0].onMinutesChange(15);
    });

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      sleepStartH: 4,
      sleepStartM: 15,
      sleepStart: '04:15',
      sleepEnd: '09:10',
      sleepHours: 4.9,
    }));
  });
});
