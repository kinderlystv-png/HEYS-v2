import fs from 'fs';
import path from 'path';

import { render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const serverSource = fs.readFileSync(
  path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-messages/index.js'),
  'utf8',
);
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

const CLIENT_A = '11111111-1111-4111-8111-111111111111';
const CLIENT_B = '22222222-2222-4222-8222-222222222222';

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

describe('офлайн-очередь и черновик', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  it('очередь и черновик скоупятся клиентом', () => {
    const { writeQueue, readQueue, writeDraft, readDraft } = loadMessengerComponentInternals();

    writeQueue(CLIENT_A, [{ request_id: 'r1', payload: { body: 'от первого' } }]);
    writeDraft(CLIENT_A, 'черновик первого');

    // На общем устройстве второй клиент не должен видеть чужую очередь.
    expect(readQueue(CLIENT_B)).toEqual([]);
    expect(readDraft(CLIENT_B)).toBe('');
    expect(readQueue(CLIENT_A)).toHaveLength(1);
    expect(readDraft(CLIENT_A)).toBe('черновик первого');
  });

  it('пустая очередь и пустой черновик убирают ключ', () => {
    const { writeQueue, writeDraft } = loadMessengerComponentInternals();

    writeQueue(CLIENT_A, [{ request_id: 'r1', payload: {} }]);
    writeQueue(CLIENT_A, []);
    writeDraft(CLIENT_A, 'текст');
    writeDraft(CLIENT_A, '');

    expect(localStorage.getItem(`heys_messenger_queue_${CLIENT_A}`)).toBeNull();
    expect(localStorage.getItem(`heys_messenger_draft_${CLIENT_A}`)).toBeNull();
  });

  it('битое содержимое хранилища не роняет чтение', () => {
    const { readQueue } = loadMessengerComponentInternals();
    localStorage.setItem(`heys_messenger_queue_${CLIENT_A}`, '{не json');

    expect(readQueue(CLIENT_A)).toEqual([]);
  });

  it('сетевой сбой отличается от отказа сервера', () => {
    const { isNetworkFailure } = loadMessengerComponentInternals();

    expect(isNetworkFailure({ error: 'network_error' })).toBe(true);
    expect(isNetworkFailure(null)).toBe(true);
    // Отказ по существу повторять бессмысленно — он не сетевой.
    expect(isNetworkFailure({ error: 'body_too_long', statusCode: 400 })).toBe(false);
    expect(isNetworkFailure({ success: true })).toBe(false);
  });

  it('сообщение из очереди рисуется как своё и со статусом', () => {
    const { queuedToOptimistic, MessageBubble } = loadMessengerComponentInternals();
    const entry = {
      request_id: 'r1',
      created_at: new Date(2026, 7, 2, 9, 0).toISOString(),
      payload: { body: 'уйдёт позже' },
    };

    const optimistic = queuedToOptimistic(entry, 'client');
    expect(optimistic).toMatchObject({ id: 'queued:r1', sender_role: 'client', queued: true });

    const { container } = render(RealReact.createElement(MessageBubble, {
      message: optimistic,
      viewerRole: 'client',
    }));
    expect(container.querySelector('.msg-bubble-queued')).toBeTruthy();
    expect(container.querySelector('.msg-meta').textContent).toBe('В очереди…');
    // У неотправленного сообщения нечего редактировать и не на что отвечать.
    expect(container.querySelectorAll('.msg-action')).toHaveLength(0);
  });

  it('полоса появляется только когда есть что сохранять', () => {
    const { OfflineQueueBar } = loadMessengerComponentInternals();

    const empty = render(RealReact.createElement(OfflineQueueBar, { count: 0, hasDraft: false }));
    expect(empty.container.innerHTML).toBe('');

    const withQueue = render(RealReact.createElement(OfflineQueueBar, { count: 2, hasDraft: true, onRetry: () => {} }));
    expect(withQueue.container.textContent).toMatch(/2 сообщения и черновик сохранены на устройстве/);
    expect(withQueue.getByText('Повторить')).toBeTruthy();
  });

  it('склонение по числу сообщений', () => {
    const { OfflineQueueBar } = loadMessengerComponentInternals();
    const текст = (n) => render(RealReact.createElement(OfflineQueueBar, { count: n, hasDraft: false, onRetry: () => {} }))
      .container.textContent;

    expect(текст(1)).toMatch(/1 сообщение /);
    expect(текст(3)).toMatch(/3 сообщения /);
    expect(текст(5)).toMatch(/5 сообщений /);
  });

  it('отправка кладёт в очередь тот же request_id, что и первая попытка', () => {
    // Повтор с прежним request_id не создаёт дубль: сервер идемпотентен по нему.
    expect(messengerSource).toMatch(/HEYS\.MessengerAPI\.send\(entry\.payload, \{ requestId: entry\.request_id \}\)/);
    expect(messengerSource).toMatch(/const entry = \{ request_id: requestId, payload, created_at/);
  });
});

describe('правка расшифровки до отправки', () => {
  it('сервер принимает только правку человека, а не подделку машинной', () => {
    // Поля SpeechKit по-прежнему срезаются; исключение помечено своим provider.
    expect(serverSource).toMatch(/CLIENT_EDITED_TRANSCRIPT_PROVIDER = 'client_edited'/);
    expect(serverSource).toMatch(/att\?\.transcript_provider === CLIENT_EDITED_TRANSCRIPT_PROVIDER/);
    expect(serverSource).toMatch(/att\.transcript_text\.length <= MAX_TRANSCRIPT_TEXT_LENGTH/);
  });

  it('правленый текст не отправляется в SpeechKit повторно', () => {
    expect(serverSource).toMatch(/if \(att\.transcript_provider === CLIENT_EDITED_TRANSCRIPT_PROVIDER\) continue;/);
  });

  it('клиент помечает свою правку и не выдаёт её за машинную', () => {
    expect(messengerSource).toMatch(/transcript_provider = 'client_edited'/);
  });
});
