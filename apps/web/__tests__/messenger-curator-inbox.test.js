import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/1000-messenger.css'),
  'utf8',
);
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const rows = [
  { client_id: A, unread_count: 2, last_message_at: minutesAgo(42), last_message_preview: { body: 'творог 150 г' } },
  { client_id: B, unread_count: 1, last_message_at: minutesAgo(8), last_message_preview: { body: 'фото ужина' } },
  { client_id: C, unread_count: 0, last_message_at: minutesAgo(60 * 24 * 5), last_message_preview: { body: 'спасибо' } },
];

describe('инбокс куратора', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
    localStorage.setItem('heys_clients', JSON.stringify([
      { id: A, name: 'Александра Ким' },
      { id: B, name: 'Пётр Волков' },
      { id: C, name: 'Мария Соколова' },
    ]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('сначала те, кого ждут дольше всех', () => {
    const { sortInbox } = loadMessengerComponentInternals();

    // A ждёт 42 минуты, B — 8: неразобранное вперёд, внутри — по возрасту.
    expect(sortInbox(rows).map((r) => r.client_id)).toEqual([A, B, C]);
  });

  it('фильтры отбирают ждущих и молчащих', () => {
    const { filterInbox } = loadMessengerComponentInternals();

    expect(filterInbox(rows, 'pending').map((r) => r.client_id)).toEqual([A, B]);
    expect(filterInbox(rows, 'silent').map((r) => r.client_id)).toEqual([C]);
    expect(filterInbox(rows, 'all')).toHaveLength(3);
  });

  it('время ожидания читается словами', () => {
    const { formatWaiting } = loadMessengerComponentInternals();

    expect(formatWaiting(42)).toBe('Ждёт 42 мин');
    expect(formatWaiting(90)).toBe('Ждёт 1 ч');
    expect(formatWaiting(60 * 30)).toBe('Ждёт 1 дн');
    expect(formatWaiting(null)).toBeNull();
  });

  it('превью подставляет тип для сообщений без текста', () => {
    const { previewText } = loadMessengerComponentInternals();

    expect(previewText({ body: 'текст' })).toBe('текст');
    expect(previewText({ intent_type: 'weight' })).toBe('Вес');
    expect(previewText({})).toBe('Вложение');
    expect(previewText(null)).toBe('Нет сообщений');
  });

  it('имя берётся из списка клиентов куратора, а не из инбокса', () => {
    const { CuratorInbox } = loadMessengerComponentInternals();

    const { getByText } = render(RealReact.createElement(CuratorInbox, { rows, onSelect: () => {} }));
    expect(getByText('Александра Ким')).toBeTruthy();
  });

  it('без списка клиентов строка не ломается', () => {
    localStorage.removeItem('heys_clients');
    const { CuratorInbox } = loadMessengerComponentInternals();

    const { getAllByText } = render(RealReact.createElement(CuratorInbox, { rows, onSelect: () => {} }));
    expect(getAllByText('Клиент').length).toBeGreaterThan(0);
  });

  it('выбор клиента отдаётся наверх, активная строка помечена', () => {
    const { CuratorInbox } = loadMessengerComponentInternals();
    const onSelect = vi.fn();

    const { container, getByText } = render(
      RealReact.createElement(CuratorInbox, { rows, activeClientId: A, onSelect }),
    );
    expect(container.querySelector('.messenger-inbox__row.is-active')).toBeTruthy();

    fireEvent.click(getByText('Пётр Волков'));
    expect(onSelect).toHaveBeenCalledWith(B);
  });

  it('долгое ожидание помечается тревожным цветом', () => {
    const { CuratorInbox } = loadMessengerComponentInternals();

    const { container } = render(RealReact.createElement(CuratorInbox, { rows, onSelect: () => {} }));
    const overdue = container.querySelectorAll('.messenger-inbox__tag.is-overdue');
    // 42 минуты — просрочено, 8 минут — ещё нет.
    expect(overdue).toHaveLength(1);
    expect(overdue[0].textContent).toBe('Ждёт 42 мин');
  });

  it('переключение фильтра меняет список', () => {
    const { CuratorInbox } = loadMessengerComponentInternals();

    const { container, getByText } = render(RealReact.createElement(CuratorInbox, { rows, onSelect: () => {} }));
    expect(container.querySelectorAll('.messenger-inbox__row')).toHaveLength(2);

    fireEvent.click(getByText('Все'));
    expect(container.querySelectorAll('.messenger-inbox__row')).toHaveLength(3);

    fireEvent.click(getByText('Молчат 3 дня'));
    expect(container.querySelectorAll('.messenger-inbox__row')).toHaveLength(1);
  });

  it('когда всё разобрано, это сказано словами', () => {
    const { CuratorInbox } = loadMessengerComponentInternals();

    const { getByText } = render(RealReact.createElement(CuratorInbox, {
      rows: [{ client_id: A, unread_count: 0, last_message_at: minutesAgo(10) }],
      onSelect: () => {},
    }));
    expect(getByText('Всё разобрано.')).toBeTruthy();
  });

  it('десктоп разводит инбокс и тред по колонкам от 900 px', () => {
    expect(cssSource).toMatch(/@media \(min-width: 900px\) \{\s*\.messenger-modal--curator \{[^}]*flex-direction:\s*row/);
    expect(cssSource).toMatch(/\.messenger-modal--curator \.messenger-inbox \{\s*width:\s*320px/);
  });

  it('инбокс показывается только куратору', () => {
    expect(messengerSource).toMatch(/isCurator && React\.createElement\(CuratorInbox, \{/);
  });
});
