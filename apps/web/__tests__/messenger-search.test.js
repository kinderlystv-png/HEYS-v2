import fs from 'fs';
import path from 'path';

import { act, fireEvent, render } from '@testing-library/react';
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

describe('поиск по переписке', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('голосовые ищутся по расшифровке, а не по пустому телу', () => {
    const { searchableText } = loadMessengerComponentInternals();

    expect(searchableText({ body: 'обед' })).toBe('обед');
    expect(searchableText({ attachments: [{ type: 'audio', transcript_text: 'съел суп' }] })).toBe('съел суп');
    expect(searchableText({ attachments: [{ type: 'image' }] })).toBe('');
  });

  it('сниппет обрезается вокруг совпадения', () => {
    const { buildSnippet } = loadMessengerComponentInternals();
    const long = `${'а'.repeat(80)} творог ${'б'.repeat(80)}`;

    const snippet = buildSnippet(long, 'творог', 10);
    expect(snippet).toContain('творог');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThan(long.length);
  });

  it('совпадение размечается частями, без вставки HTML', () => {
    const { splitByMatch } = loadMessengerComponentInternals();

    expect(splitByMatch('Творог и ещё творог', 'творог')).toEqual([
      { text: 'Творог', match: true },
      { text: ' и ещё ', match: false },
      { text: 'творог', match: true },
    ]);
    expect(splitByMatch('без совпадений', '')).toEqual([{ text: 'без совпадений', match: false }]);
  });

  it('запрос уходит на сервер с фильтром и client_id куратора', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, messages: [] }) });
    const api = loadAPI();

    await api.searchMessages({ q: 'творог', type: 'audio', client_id: 'client-1' });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('/messages/search?');
    expect(url).toContain('q=%D1%82%D0%B2%D0%BE%D1%80%D0%BE%D0%B3');
    expect(url).toContain('type=audio');
    expect(url).toContain('client_id=client-1');
  });

  it('короткий запрос сервер не дёргает', async () => {
    vi.useFakeTimers();
    const { SearchPanel } = loadMessengerComponentInternals();
    window.HEYS.MessengerAPI = { searchMessages: vi.fn() };

    const { container } = render(RealReact.createElement(SearchPanel, { onClose: () => {} }));
    fireEvent.change(container.querySelector('.messenger-search__input'), { target: { value: 'т' } });
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(window.HEYS.MessengerAPI.searchMessages).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Введите хотя бы два символа/);
  });

  it('результаты группируются по дням и подсвечивают совпадение', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 2, 12, 0));
    const { SearchPanel } = loadMessengerComponentInternals();
    window.HEYS.MessengerAPI = {
      searchMessages: vi.fn().mockResolvedValue({
        success: true,
        messages: [
          { id: '1', sender_role: 'client', body: 'Обед: творог 150 г', created_at: new Date(2026, 7, 2, 13, 5).toISOString() },
          { id: '2', sender_role: 'curator', body: 'Сколько творога?', created_at: new Date(2026, 7, 1, 10, 0).toISOString() },
        ],
      }),
    };

    const { container } = render(RealReact.createElement(SearchPanel, { onClose: () => {} }));
    fireEvent.change(container.querySelector('.messenger-search__input'), { target: { value: 'творог' } });
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(container.querySelectorAll('.messenger-search__group')).toHaveLength(2);
    expect(container.querySelectorAll('.messenger-search__item')).toHaveLength(2);
    expect(container.querySelector('mark').textContent).toBe('творог');
  });

  it('пустая выдача объясняется словами', async () => {
    vi.useFakeTimers();
    const { SearchPanel } = loadMessengerComponentInternals();
    window.HEYS.MessengerAPI = {
      searchMessages: vi.fn().mockResolvedValue({ success: true, messages: [] }),
    };

    const { container } = render(RealReact.createElement(SearchPanel, { onClose: () => {} }));
    fireEvent.change(container.querySelector('.messenger-search__input'), { target: { value: 'кефир' } });
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(container.textContent).toMatch(/Ничего не нашлось/);
  });

  it('фильтр переспрашивает сервер', async () => {
    vi.useFakeTimers();
    const { SearchPanel } = loadMessengerComponentInternals();
    const searchMessages = vi.fn().mockResolvedValue({ success: true, messages: [] });
    window.HEYS.MessengerAPI = { searchMessages };

    const { container, getByText } = render(RealReact.createElement(SearchPanel, { onClose: () => {} }));
    fireEvent.change(container.querySelector('.messenger-search__input'), { target: { value: 'творог' } });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(searchMessages).toHaveBeenCalledTimes(1);

    fireEvent.click(getByText('Голосовые'));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(searchMessages).toHaveBeenCalledTimes(2);
    expect(searchMessages.mock.calls[1][0]).toMatchObject({ q: 'творог', type: 'audio' });
  });
});
