import fs from 'fs';
import path from 'path';

import { act, fireEvent, render } from '@testing-library/react';
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

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

function message(overrides = {}) {
  return {
    id: 'm1',
    sender_role: 'client',
    body: 'Завтрак в 08:40: овсянка 60 г',
    created_at: new Date(2026, 7, 2, 9, 20).toISOString(),
    ...overrides,
  };
}

function renderBubble(props) {
  const { MessageBubble } = loadMessengerComponentInternals();
  return render(RealReact.createElement(MessageBubble, {
    viewerRole: 'client',
    onToggleAck: () => {},
    onReply: () => {},
    onEdit: () => {},
    onDelete: () => {},
    ...props,
  }));
}

describe('пузырь сообщения после редизайна', () => {
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

  it('мета-строка живёт под пузырём, а не внутри него', () => {
    const { container } = renderBubble({ message: message() });

    const bubble = container.querySelector('.msg-bubble');
    const meta = container.querySelector('.msg-meta-row');
    expect(meta).toBeTruthy();
    expect(bubble.contains(meta)).toBe(false);
    expect(meta.parentElement.classList.contains('msg-row')).toBe(true);
  });

  it('статус не заливает пузырь целиком', () => {
    const { container } = renderBubble({
      message: message({ done_at: new Date(2026, 7, 2, 9, 40).toISOString() }),
    });

    expect(container.querySelector('.msg-bubble-done')).toBeNull();
    expect(cssSource).not.toMatch(/msg-bubble-done/);
  });

  it('внесённое в день сообщение показывает это состоянием, а не голым временем', () => {
    const { container } = renderBubble({
      message: message({
        applied_at: new Date(2026, 7, 2, 9, 41).toISOString(),
        done_at: new Date(2026, 7, 2, 9, 40).toISOString(),
      }),
    });

    const status = container.querySelector('.msg-status--applied');
    expect(status.textContent).toBe('Внесено в день · 09:41');
    expect(status.querySelector('svg.messenger-icon')).toBeTruthy();
  });

  it('состояния идут от позднего к раннему: внесено → обработано → смотрит → отправлено', () => {
    const seen = new Date(2026, 7, 2, 9, 30).toISOString();
    const done = new Date(2026, 7, 2, 9, 40).toISOString();

    const justSent = renderBubble({ message: message() });
    expect(justSent.container.querySelector('.msg-status--sent').textContent).toMatch(/^Отправлено · /);

    const watched = renderBubble({ message: message({ seen_at: seen }) });
    expect(watched.container.querySelector('.msg-status--seen').textContent).toBe('Куратор смотрит · 09:30');

    // Обработка куратором перекрывает «смотрит».
    const processed = renderBubble({ message: message({ seen_at: seen, done_at: done }) });
    expect(processed.container.querySelector('.msg-status--acked').textContent).toBe('Обработано · 09:40');
  });

  it('куратор на своём сообщении видит «Принято» клиентом', () => {
    const asCurator = renderBubble({
      viewerRole: 'curator',
      message: message({ sender_role: 'curator', acked_at: new Date(2026, 7, 2, 12, 35).toISOString() }),
    });
    expect(asCurator.container.querySelector('.msg-status--acked').textContent).toBe('Принято · 12:35');
  });

  it('у чужого сообщения состояния нет — только время', () => {
    const { container } = renderBubble({ message: message({ sender_role: 'curator' }) });

    expect(container.querySelector('.msg-status')).toBeNull();
    expect(container.querySelector('.msg-meta').textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('«принять» — текстовое действие в мета-строке, а не круглая кнопка', () => {
    const onToggleAck = vi.fn();
    const { container, getByText } = renderBubble({
      message: message({ sender_role: 'curator', id: 'm2' }),
      onToggleAck,
    });

    expect(container.querySelector('.msg-ack-outside')).toBeNull();
    const action = getByText('Принять');
    expect(action.classList.contains('msg-action')).toBe(true);

    fireEvent.click(action);
    expect(onToggleAck).toHaveBeenCalledTimes(1);
  });

  it('после отметки действие меняет подпись и статус', () => {
    const { getByText } = renderBubble({
      message: message({ sender_role: 'curator', acked_at: new Date().toISOString() }),
    });

    expect(getByText('Принято').classList.contains('is-active')).toBe(true);
  });

  it('куратор обрабатывает, а не принимает', () => {
    const { getByText } = renderBubble({
      viewerRole: 'curator',
      message: message({ sender_role: 'client' }),
    });

    expect(getByText('Обработать')).toBeTruthy();
  });

  it('пока отметка сохраняется, действие заблокировано', () => {
    const { getByText } = renderBubble({
      message: message({ sender_role: 'curator' }),
      ackPending: true,
    });

    const action = getByText('Сохраняем…');
    expect(action.disabled).toBe(true);
  });

  it('свои действия — только у своих сообщений, чужие — только у чужих', () => {
    const actionsOf = (result) => [...result.container.querySelectorAll('.msg-action')].map((b) => b.textContent);

    expect(actionsOf(renderBubble({ message: message() }))).toEqual(['Изменить', 'Удалить']);
    expect(actionsOf(renderBubble({ message: message({ sender_role: 'curator' }) }))).toEqual(['Ответить', 'Принять']);
  });

  it('долгое нажатие открывает свои действия на тач-устройствах', () => {
    vi.useFakeTimers();
    const { container } = renderBubble({ message: message() });

    const row = container.querySelector('.msg-row');
    expect(container.querySelector('.msg-meta-row').classList.contains('is-actions-open')).toBe(false);

    fireEvent.touchStart(row);
    act(() => { vi.advanceTimersByTime(500); });
    expect(container.querySelector('.msg-meta-row').classList.contains('is-actions-open')).toBe(true);

    vi.useRealTimers();
  });

  it('короткое касание действия не открывает', () => {
    vi.useFakeTimers();
    const { container } = renderBubble({ message: message() });

    const row = container.querySelector('.msg-row');
    fireEvent.touchStart(row);
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.touchEnd(row);
    act(() => { vi.advanceTimersByTime(500); });

    expect(container.querySelector('.msg-meta-row').classList.contains('is-actions-open')).toBe(false);
    vi.useRealTimers();
  });

  it('эмодзи-иконок в сообщении не осталось', () => {
    const { container } = renderBubble({
      message: message({ applied_at: new Date().toISOString(), edited_at: new Date().toISOString() }),
    });

    expect(container.textContent).not.toMatch(/[🗑↩✎✅✓]/u);
  });

  it('свои действия скрыты, пока нет hover или долгого нажатия', () => {
    const own = cssSource.match(/\.msg-action--own \{[^}]*\}/)[0];
    expect(own).toMatch(/display:\s*none/);
    expect(cssSource).toMatch(/\.msg-meta-row\.is-actions-open \.msg-action--own \{\s*display:\s*inline/);
    expect(cssSource).toMatch(/@media \(hover: hover\) \{\s*\.msg-row:hover \.msg-action--own/);
  });
});
