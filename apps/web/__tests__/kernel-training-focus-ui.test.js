// kernel-training-focus-ui.test.js — shared training focus UI primitives.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_training_focus_ui_v1.js'), 'utf8'));
};

const Focus = () => globalThis.HEYS.TrainingFocus;

describe('TrainingFocus UI primitives', () => {
  beforeAll(setupOnce);
  afterEach(() => cleanup());

  it('Shell and ViewContainer provide common header/tabs/view containers', () => {
    const onTabChange = vi.fn();
    render(React.createElement(Focus().Shell, {
      classPrefix: 'test-focus',
      title: 'Режим',
      actions: [{ id: 'close', label: '×', kind: 'close', onClick: vi.fn() }],
      tabs: [
        { id: 'today', icon: '✓', label: 'Сегодня' },
        { id: 'protocols', icon: '▦', label: 'Протоколы' }
      ],
      activeTab: 'today',
      onTabChange
    },
      React.createElement(Focus().ViewContainer, {
        classPrefix: 'test-focus',
        view: 'today',
        title: 'Сегодня',
        subtitle: 'Готовая тренировка'
      }, React.createElement('button', null, 'Запустить')),
      React.createElement(Focus().EmptyState, {
        classPrefix: 'test-focus',
        title: 'Нет протоколов',
        text: 'Добавь упражнения в свою сборку'
      })
    ));

    expect(screen.getByRole('dialog', { name: 'Режим' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Сегодня/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: /Протоколы/ }));
    expect(onTabChange).toHaveBeenCalledWith('protocols');
    expect(screen.getByLabelText('Сегодня').getAttribute('data-training-view')).toBe('today');
    expect(screen.getByText('Нет протоколов')).toBeTruthy();
  });

  it('Registry filters by title, meta and chips without changing selection actions', () => {
    const onToggle = vi.fn();
    render(React.createElement(Focus().Registry, {
      classPrefix: 'test-focus',
      title: 'Все упражнения',
      items: [
        { id: 'hip_cars', title: 'Hip CARs', meta: '2 повт.', chips: ['CARs'], icon: '↕' },
        { id: 'calf_hold', title: 'Calf hold', meta: '30 сек', chips: ['Статика'], icon: '↕' }
      ],
      selectedIds: ['hip_cars'],
      addLabel: 'Добавить',
      removeLabel: 'Убрать',
      onToggle
    }));

    const dialog = screen.getByRole('dialog', { name: 'Все упражнения' });
    expect(within(dialog).getByText('Hip CARs')).toBeTruthy();
    expect(within(dialog).getByText('Calf hold')).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Поиск по упражнениям' }), {
      target: { value: 'статика' }
    });

    expect(within(dialog).queryByText('Hip CARs')).toBeNull();
    expect(within(dialog).getByText('Calf hold')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Добавить' }));
    expect(onToggle).toHaveBeenCalledWith('calf_hold', expect.objectContaining({ id: 'calf_hold' }));
  });
});
