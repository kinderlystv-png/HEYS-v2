import fs from 'fs';
import path from 'path';

import { cleanup, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STEP_MODAL_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_step_modal_v1.js'),
  'utf8'
);
const STEPS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_steps_v1.js'),
  'utf8'
);

function loadSteps() {
  window.React = React;
  window.ReactDOM = { render: vi.fn(), unmountComponentAtNode: vi.fn() };
  window.HEYS = {
    utils: {
      lsGet: () => ({}),
      lsSet: vi.fn(),
    },
    dayUtils: {
      todayISO: () => '2026-06-21',
    },
  };
  Object.defineProperty(window.navigator, 'vibrate', {
    configurable: true,
    value: vi.fn(),
  });

  // eslint-disable-next-line no-new-func
  new Function(STEP_MODAL_SRC)();
  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();
  return window.HEYS.StepModal.registry.morning_mood.component;
}

describe('morning mood slider gestures', () => {
  let MorningMoodStep;

  beforeEach(() => {
    localStorage.clear();
    MorningMoodStep = loadSteps();
  });

  afterEach(() => {
    cleanup();
  });

  it('updates while dragging and keeps slider gestures from bubbling to the card/modal', () => {
    const onChange = vi.fn();
    const parentMouseDown = vi.fn();
    const view = render(React.createElement('div', { onMouseDown: parentMouseDown },
      React.createElement(MorningMoodStep, {
        data: { mood: 5, wellbeing: 5, stress: 5 },
        onChange,
      })
    ));

    const sliders = view.container.querySelectorAll('.mc-quality-slider');
    expect(sliders.length).toBe(3);

    sliders[0].getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 39,
      right: 100,
      bottom: 39,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.mouseDown(sliders[0], { clientX: 20 });
    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith({ mood: 3, wellbeing: 5, stress: 5 });

    fireEvent.mouseMove(document, { clientX: 80 });
    expect(onChange).toHaveBeenCalledWith({ mood: 8, wellbeing: 5, stress: 5 });
  });
});
