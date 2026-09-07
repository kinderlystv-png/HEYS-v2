import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

const WEB_DIR = path.resolve(__dirname, '..');
const UI_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');

beforeAll(() => {
  window.React = React;
  window.HEYS = window.HEYS || {};
  window.HEYS.Widgets = window.HEYS.Widgets || {};
  window.HEYS.Widgets.registry = {
    getType: () => ({ category: 'nutrition', defaultSize: '2x2' }),
    getCategory: () => ({ label: 'Питание' }),
    getSize: () => ({ cols: 2, rows: 2, label: '2×2' }),
  };
  window.HEYS.Widgets.emit = vi.fn();
  window.HEYS.Widgets.dnd = {
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    isDragging: () => false,
  };
  window.HEYS.Widgets.VariantsV4 = { getCatalog: () => [] };
  // eslint-disable-next-line no-eval
  eval(UI_SRC);
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('режим удаления виджета — цель вся плитка', () => {
  it('removePickActive вешает удаление на клик по плитке', () => {
    expect(UI_SRC).toContain('if (removePickActive)');
    expect(UI_SRC).toContain('if (!removePickActive || !isEditMode');
  });

  it('клик по плитке в removePickActive вызывает onRemove', () => {
    const onRemove = vi.fn();
    const WidgetCard = window.HEYS.Widgets.WidgetCard;
    const { container } = render(React.createElement(WidgetCard, {
      widget: { id: 'w1', type: 'calories', size: '2x2', cols: 2, rows: 2 },
      isEditMode: true,
      removePickActive: true,
      onRemove,
      selectedDate: '2026-08-09',
    }));

    const tile = container.querySelector('.widget');
    expect(tile).toBeTruthy();
    fireEvent.click(tile);
    expect(onRemove).toHaveBeenCalledWith('w1');
  });

  it('в обычном edit без removePickActive клик по плитке не удаляет', () => {
    const onRemove = vi.fn();
    const WidgetCard = window.HEYS.Widgets.WidgetCard;
    const { container } = render(React.createElement(WidgetCard, {
      widget: { id: 'w2', type: 'calories', size: '2x2', cols: 2, rows: 2 },
      isEditMode: true,
      removePickActive: false,
      onRemove,
      selectedDate: '2026-08-09',
    }));

    fireEvent.click(container.querySelector('.widget'));
    fireEvent.pointerDown(container.querySelector('.widget'), { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(container.querySelector('.widget'), { clientX: 10, clientY: 10 });
    expect(onRemove).not.toHaveBeenCalled();
  });
});
