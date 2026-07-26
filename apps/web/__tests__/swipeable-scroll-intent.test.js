import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(__dirname, '../heys_swipeable.js'), 'utf8');

function renderSwipeableRow() {
  window.React = React;
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(source);

  const view = render(React.createElement(
    window.HEYS.SwipeableRow,
    { onDelete: () => {} },
    React.createElement('div', null, 'Продукт')
  ));

  return view.container.querySelector('.swipeable-container');
}

function dispatchTouch(target, type, clientX, clientY) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientX, clientY }],
  });
  fireEvent(target, event);
  return event;
}

describe('SwipeableRow scroll intent', () => {
  beforeEach(() => {
    renderSwipeableRow();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not block scrolling while touch direction is undecided', () => {
    const row = document.querySelector('.swipeable-container');

    dispatchTouch(row, 'touchstart', 100, 100);
    const move = dispatchTouch(row, 'touchmove', 92, 108);

    expect(move.defaultPrevented).toBe(false);
  });

  it('does not block a vertical scroll with horizontal finger drift', () => {
    const row = document.querySelector('.swipeable-container');

    dispatchTouch(row, 'touchstart', 100, 100);
    const move = dispatchTouch(row, 'touchmove', 88, 132);

    expect(move.defaultPrevented).toBe(false);
  });

  it('captures only a deliberate horizontal swipe', () => {
    const row = document.querySelector('.swipeable-container');

    dispatchTouch(row, 'touchstart', 100, 100);
    const move = dispatchTouch(row, 'touchmove', 70, 104);

    expect(move.defaultPrevented).toBe(true);
    expect(row.querySelector('.swipeable-content').style.transform).toBe('translateX(-30px)');
  });
});
