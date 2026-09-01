// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';

import React, { act } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const roots = [];

function fmtDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISO(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDaysIso(iso, delta) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + delta);
  return fmtDate(date);
}

function formatShortHumanDate(iso) {
  return parseISO(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long' });
}

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

function renderPicker(overrides = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const props = {
    React,
    isOpen: true,
    cycleDay: 7,
    valueISO: '2026-08-24',
    todayISO: '2026-08-26',
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  act(() => root.render(React.createElement(window.HEYS.dayPickers.CycleDatePickerSheet, props)));
  roots.push({ root, host });
  return { sheet: document.querySelector('.cycle-date-picker-sheet'), props };
}

function dateCell(sheet, iso) {
  return sheet.querySelector(`[data-date="${iso}"]`);
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.ReactDOM = ReactDOM;
  window.HEYS = {
    dayUtils: { parseISO, fmtDate, todayISO: () => '2026-08-26' },
    CycleUI: { addDaysIso, formatShortHumanDate },
  };
  loadScript('heys_day_pickers.js');
});

afterEach(() => {
  for (const { root, host } of roots.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

describe('CycleDatePickerSheet v4', () => {
  it('renders the exact August frame with a real 28-day boundary', () => {
    const { sheet } = renderPicker();
    const selected = dateCell(sheet, '2026-08-24');
    const today = dateCell(sheet, '2026-08-26');
    const future = dateCell(sheet, '2026-08-27');

    expect(sheet.querySelector('.cycle-date-picker-sheet__handle')).not.toBeNull();
    expect(sheet.querySelector('.cycle-date-picker-sheet__month').textContent).toBe('Август');
    expect(sheet.querySelectorAll('.cycle-date-picker-cell')).toHaveLength(31);
    expect(sheet.querySelector('.cycle-date-picker-sheet__weekdays')).toBeNull();
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(today.getAttribute('aria-current')).toBe('date');
    expect(future.disabled).toBe(true);
    expect(future.tabIndex).toBe(-1);
    expect(sheet.querySelector('.cycle-date-picker-sheet__selected-title').textContent)
      .toBe('Седьмой день — 24 августа');
    expect(sheet.querySelector('.cycle-date-picker-sheet__selected-copy').textContent)
      .toBe('Период встанет на 18–24 августа. Их нормы пересчитаются, съеденное и вес останутся как есть.');
  });

  it('navigates only across months that intersect the allowed window', () => {
    const { sheet } = renderPicker();
    const previous = sheet.querySelector('[aria-label="Предыдущий месяц"]');

    expect(previous).not.toBeNull();
    expect(sheet.querySelector('[aria-label="Следующий месяц"]')).toBeNull();
    act(() => previous.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(sheet.querySelector('.cycle-date-picker-sheet__month').textContent).toBe('Июль');
    expect(dateCell(sheet, '2026-07-29').disabled).toBe(true);
    expect(dateCell(sheet, '2026-07-30').disabled).toBe(false);
    expect(sheet.querySelector('[aria-label="Предыдущий месяц"]')).toBeNull();
    const next = sheet.querySelector('[aria-label="Следующий месяц"]');
    expect(next).not.toBeNull();

    act(() => next.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(sheet.querySelector('.cycle-date-picker-sheet__month').textContent).toBe('Август');
  });

  it('supports roving keyboard focus, selection, confirm and Escape', () => {
    const { sheet, props } = renderPicker();
    const selected = dateCell(sheet, '2026-08-24');
    selected.focus();

    act(() => selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(document.activeElement).toBe(dateCell(sheet, '2026-08-23'));
    expect(dateCell(sheet, '2026-08-23').tabIndex).toBe(0);

    act(() => dateCell(sheet, '2026-08-23').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(sheet.querySelector('.cycle-date-picker-sheet__selected-title').textContent)
      .toBe('Седьмой день — 23 августа');

    act(() => sheet.querySelector('.cycle-v4-btn--primary')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(props.onConfirm).toHaveBeenCalledWith('2026-08-23');

    act(() => sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
