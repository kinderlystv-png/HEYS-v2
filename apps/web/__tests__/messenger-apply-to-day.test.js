import fs from 'fs';
import path from 'path';

import { fireEvent, render } from '@testing-library/react';
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

describe('разбор сообщения в запись дня', () => {
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

  it('из текста вытаскиваются продукты с весом', () => {
    const { parseMealItems } = loadMessengerComponentInternals();

    expect(parseMealItems('Завтрак в 08:40: овсянка 60 г, молоко 200 г')).toEqual([
      { name: 'овсянка', grams: 60 },
      { name: 'молоко', grams: 200 },
    ]);
    expect(parseMealItems('Просто поел')).toEqual([]);
  });

  it('интент даёт готовую строку, текст — время приёма', () => {
    const { buildApplyDraft } = loadMessengerComponentInternals();

    const fromIntent = buildApplyDraft({
      intent_type: 'meal',
      intent_payload: { product_name: 'Овсянка', grams: 220, kcal: 178 },
      created_at: new Date(2026, 7, 2, 9, 20).toISOString(),
    });
    expect(fromIntent.items).toEqual([{ name: 'Овсянка', grams: 220, kcal: 178 }]);

    const fromText = buildApplyDraft({
      body: 'Обед в 13:05, рис 200 г',
      created_at: new Date(2026, 7, 2, 14, 0).toISOString(),
    });
    expect(fromText.mealTime).toBe('13:05');
    expect(fromText.items).toEqual([{ name: 'рис', grams: 200, kcal: '' }]);
  });

  it('панель собирает summary и не обещает записи в дневник', () => {
    const { ApplyToDayPanel } = loadMessengerComponentInternals();
    const onApply = vi.fn();

    const { getByText, container } = render(RealReact.createElement(ApplyToDayPanel, {
      message: { body: 'Завтрак в 08:40, овсянка 60 г', created_at: new Date().toISOString() },
      onApply,
      onCancel: () => {},
    }));

    // Кнопка не притворяется, что пишет в дневник: механики записи в чужой
    // день из мессенджера нет.
    expect(getByText('Отметить внесённым')).toBeTruthy();
    expect(container.textContent).toMatch(/Сама запись — в разделе «День»/);

    fireEvent.click(getByText('Отметить внесённым'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ name: 'овсянка', grams: 60 }],
      meal_label: 'Приём пищи',
      meal_time: '08:40',
    }));
  });

  it('пустой разбор отправить нельзя', () => {
    const { ApplyToDayPanel } = loadMessengerComponentInternals();

    const { getByText } = render(RealReact.createElement(ApplyToDayPanel, {
      message: { body: 'Спасибо!', created_at: new Date().toISOString() },
      onApply: () => {},
      onCancel: () => {},
    }));

    expect(getByText('Отметить внесённым').disabled).toBe(true);
    expect(getByText('В сообщении не нашлись продукты с весом. Добавьте строку вручную.')).toBeTruthy();
  });

  it('карточка показывает состав, итог и появляется только при summary', () => {
    const { AppliedDayCard, MessageBubble } = loadMessengerComponentInternals();

    const { getByText } = render(RealReact.createElement(AppliedDayCard, {
      summary: {
        items: [{ name: 'Овсянка', grams: 60, kcal: 220 }],
        total: { kcal: 258, p: 9, f: 4, c: 48 },
        meal_label: 'Завтрак',
        meal_time: '08:40',
      },
    }));
    expect(getByText('Внесено в дневник')).toBeTruthy();
    expect(getByText('Завтрак · 08:40')).toBeTruthy();
    expect(getByText('Итого 258 ккал · Б 9 · Ж 4 · У 48')).toBeTruthy();

    const withoutSummary = render(RealReact.createElement(MessageBubble, {
      viewerRole: 'client',
      message: { id: 'm', sender_role: 'client', body: 'текст', created_at: new Date().toISOString(), applied_at: new Date().toISOString() },
    }));
    expect(withoutSummary.container.querySelector('.msg-applied-card')).toBeNull();
  });

  it('«Открыть день» появляется только если есть куда открывать', () => {
    const { AppliedDayCard } = loadMessengerComponentInternals();
    const summary = { items: [], total: { kcal: 100 } };

    const without = render(RealReact.createElement(AppliedDayCard, { summary }));
    expect(without.container.querySelector('.msg-applied-card__open')).toBeNull();

    const withHandler = render(RealReact.createElement(AppliedDayCard, { summary, onOpenDay: () => {} }));
    expect(withHandler.container.querySelector('.msg-applied-card__open')).toBeTruthy();
  });

  it('«Разобрать» доступно только куратору на сообщении клиента', () => {
    const { MessageBubble } = loadMessengerComponentInternals();
    const onApplyRequest = vi.fn();
    const message = { id: 'm1', sender_role: 'client', body: 'овсянка 60 г', created_at: new Date().toISOString() };

    const curator = render(RealReact.createElement(MessageBubble, {
      viewerRole: 'curator', message, onApplyRequest, onReply: () => {}, onToggleAck: () => {},
    }));
    fireEvent.click(curator.getByText('Разобрать'));
    expect(onApplyRequest).toHaveBeenCalledWith(message);

    const client = render(RealReact.createElement(MessageBubble, {
      viewerRole: 'client', message: { ...message, sender_role: 'curator' }, onApplyRequest, onReply: () => {}, onToggleAck: () => {},
    }));
    // queryByText ищет по всему body, поэтому смотрим внутри своего контейнера.
    const clientActions = [...client.container.querySelectorAll('.msg-action')].map((b) => b.textContent);
    expect(clientActions).not.toContain('Разобрать');
  });

  it('у разобранного сообщения действие называется «Изменить разбор»', () => {
    const { MessageBubble } = loadMessengerComponentInternals();

    const { getByText } = render(RealReact.createElement(MessageBubble, {
      viewerRole: 'curator',
      onApplyRequest: () => {},
      onReply: () => {},
      onToggleAck: () => {},
      message: {
        id: 'm2',
        sender_role: 'client',
        body: 'овсянка 60 г',
        created_at: new Date().toISOString(),
        applied_at: new Date().toISOString(),
      },
    }));

    expect(getByText('Изменить разбор')).toBeTruthy();
  });

  it('API шлёт разбор на set-applied и умеет снимать отметку', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    const api = loadAPI();

    await api.setApplied('msg-1', { items: [{ name: 'Овсянка', grams: 60 }] });
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/messages\/set-applied$/);
    expect(JSON.parse(options.body)).toMatchObject({
      message_id: 'msg-1',
      applied: true,
      summary: { items: [{ name: 'Овсянка', grams: 60 }] },
    });

    await api.setApplied('msg-1', { items: [] }, false);
    expect(JSON.parse(fetchSpy.mock.calls[1][1].body)).toMatchObject({ applied: false, summary: null });
  });
});
