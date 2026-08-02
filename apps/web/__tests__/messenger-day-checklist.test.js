import fs from 'fs';
import path from 'path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_api_v1.js'), 'utf8');
const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadAPI() {
  eval(apiSource);
  return window.HEYS.MessengerAPI;
}

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

function okResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

describe('MessengerAPI.getDayChecklist', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('клиент запрашивает свой день без параметров', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ success: true, items: [] }));
    const api = loadAPI();

    await api.getDayChecklist();

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/messages\/day-checklist$/);
  });

  it('куратор передаёт client_id и дату', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse({ success: true, items: [] }));
    const api = loadAPI();

    await api.getDayChecklist({ client_id: 'client-1', date: '2026-08-01' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('client_id=client-1');
    expect(url).toContain('date=2026-08-01');
  });
});

describe('DayChecklistRow', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('строка скрыта целиком, когда ждать нечего', () => {
    const { DayChecklistRow } = loadMessengerComponentInternals();
    const done = [{ key: 'meal', label: 'Приём пищи', status: 'done' }];

    const { container } = render(RealReact.createElement(DayChecklistRow, { items: done }));
    expect(container.innerHTML).toBe('');

    const empty = render(RealReact.createElement(DayChecklistRow, { items: [] }));
    expect(empty.container.innerHTML).toBe('');
  });

  it('пункты со статусом skipped не показываются', () => {
    const { DayChecklistRow } = loadMessengerComponentInternals();
    const items = [
      { key: 'meal', label: 'Приём пищи', status: 'missing' },
      { key: 'water', label: 'Вода', status: 'skipped' },
    ];

    const { getByText, queryByText } = render(RealReact.createElement(DayChecklistRow, { items }));
    expect(getByText('Приём пищи')).toBeTruthy();
    expect(queryByText('Вода')).toBeNull();
  });

  it('клиент видит «Ждём», куратор — «Нет в дне» с дефицитным цветом', () => {
    const { DayChecklistRow } = loadMessengerComponentInternals();
    const items = [{ key: 'weight', label: 'Вес утром', status: 'missing' }];

    const client = render(RealReact.createElement(DayChecklistRow, { items }));
    expect(client.getByText('Ждём')).toBeTruthy();
    expect(client.container.querySelector('.messenger-day-checklist__chip--curator')).toBeNull();

    const curator = render(RealReact.createElement(DayChecklistRow, { items, isCurator: true }));
    expect(curator.getByText('Нет в дне')).toBeTruthy();
    expect(curator.container.querySelector('.messenger-day-checklist__chip--curator')).toBeTruthy();
  });

  it('закрытые пункты показываются рядом с ожидаемыми и помечены галочкой', () => {
    const { DayChecklistRow } = loadMessengerComponentInternals();
    const items = [
      { key: 'meal', label: 'Приём пищи', status: 'done' },
      { key: 'weight', label: 'Вес утром', status: 'missing' },
    ];

    const { container } = render(RealReact.createElement(DayChecklistRow, { items }));
    expect(container.querySelectorAll('.messenger-day-checklist__chip--done')).toHaveLength(1);
    expect(container.querySelector('.messenger-day-checklist__tick')?.textContent).toBe('✓');
  });

  it('тап по ожидаемому пункту подставляет шаблон, закрытый — не кликается', () => {
    const { DayChecklistRow } = loadMessengerComponentInternals();
    const onPick = vi.fn();
    const items = [
      { key: 'weight', label: 'Вес утром', status: 'missing' },
      { key: 'meal', label: 'Приём пищи', status: 'done' },
    ];

    const { container } = render(RealReact.createElement(DayChecklistRow, { items, onPick }));
    const buttons = container.querySelectorAll('button.messenger-day-checklist__chip');
    expect(buttons).toHaveLength(1);

    buttons[0].click();
    expect(onPick).toHaveBeenCalledWith('Вес утром: ');
  });

  it('у куратора чипы не подставляют текст — разбор идёт своим путём', () => {
    const { DayChecklistRow } = loadMessengerComponentInternals();
    const onPick = vi.fn();
    const items = [{ key: 'meal', label: 'Приём пищи', status: 'missing' }];

    const { container } = render(
      RealReact.createElement(DayChecklistRow, { items, isCurator: true, onPick }),
    );
    expect(container.querySelectorAll('button.messenger-day-checklist__chip')).toHaveLength(0);
  });

  it('шаблон приёма пищи содержит текущее время', () => {
    const { CHECKLIST_TEMPLATES } = loadMessengerComponentInternals();
    vi.setSystemTime(new Date(2026, 7, 2, 13, 5));

    expect(CHECKLIST_TEMPLATES.meal()).toBe('Приём пищи в 13:05, ');

    vi.useRealTimers();
  });

  it('срок «ждём с» доступен подсказкой, а не отдельным текстом в чипе', () => {
    const { DayChecklistRow } = loadMessengerComponentInternals();
    const items = [{ key: 'meal', label: 'Приём пищи', status: 'missing', due_from: '12:00' }];

    const { container } = render(RealReact.createElement(DayChecklistRow, { items }));
    const chip = container.querySelector('.messenger-day-checklist__chip');
    expect(chip.getAttribute('title')).toBe('Ждём с 12:00');
    expect(chip.textContent).toBe('Приём пищи');
  });
});
