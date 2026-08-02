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
    writeDraft(CLIENT_A, { text: 'черновик первого' });

    // На общем устройстве второй клиент не должен видеть чужую очередь.
    expect(readQueue(CLIENT_B)).toEqual([]);
    expect(readDraft(CLIENT_B)).toEqual({ text: '', photos: [] });
    expect(readQueue(CLIENT_A)).toHaveLength(1);
    expect(readDraft(CLIENT_A).text).toBe('черновик первого');
  });

  it('пустая очередь и пустой черновик убирают ключ', () => {
    const { writeQueue, writeDraft } = loadMessengerComponentInternals();

    writeQueue(CLIENT_A, [{ request_id: 'r1', payload: {} }]);
    writeQueue(CLIENT_A, []);
    writeDraft(CLIENT_A, { text: 'текст' });
    writeDraft(CLIENT_A, { text: '', photos: [] });

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

describe('фото в черновике', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    localStorage.clear();
    window.HEYS = originalHEYS;
  });

  const photo = (id, bytes = 100) => ({
    tempId: id,
    localPreview: `data:image/jpeg;base64,${'A'.repeat(bytes)}`,
    filename: `${id}.jpg`,
    width: 800,
    height: 600,
    mime: 'image/jpeg',
    status: 'pending-upload',
  });

  it('снимок переживает перезагрузку вместе с текстом', () => {
    const { writeDraft, readDraft } = loadMessengerComponentInternals();

    writeDraft(CLIENT_A, { text: 'ужин', photos: [photo('p1')] });
    const restored = readDraft(CLIENT_A);

    expect(restored.text).toBe('ужин');
    expect(restored.photos).toHaveLength(1);
    expect(restored.photos[0]).toMatchObject({ tempId: 'p1', status: 'pending-upload', mime: 'image/jpeg' });
    expect(restored.photos[0].localPreview).toContain('data:image/jpeg;base64,');
  });

  it('загруженное фото хранит ссылку, а не только превью', () => {
    const { writeDraft, readDraft } = loadMessengerComponentInternals();

    writeDraft(CLIENT_A, {
      text: '',
      photos: [{ ...photo('p2'), status: 'done', url: 'https://example.test/p2.webp', path: 'c/p2.webp' }],
    });

    expect(readDraft(CLIENT_A).photos[0]).toMatchObject({
      status: 'done',
      url: 'https://example.test/p2.webp',
      path: 'c/p2.webp',
    });
  });

  it('черновик не съедает хранилище: лимит по числу и по объёму', () => {
    const { writeDraft, readDraft } = loadMessengerComponentInternals();

    const many = writeDraft(CLIENT_A, { text: '', photos: [photo('a'), photo('b'), photo('c'), photo('d')] });
    expect(many.photosSaved).toBe(3);

    // Один снимок сверх лимита объёма отбрасывается целиком, а не режется.
    const heavy = writeDraft(CLIENT_A, { text: 'т', photos: [photo('big', 1_600_000)] });
    expect(heavy.photosSaved).toBe(0);
    expect(readDraft(CLIENT_A).text).toBe('т');
  });

  it('при переполнении хранилища текст сохраняется, снимки — нет', () => {
    const { writeDraft, readDraft } = loadMessengerComponentInternals();
    const original = localStorage.setItem.bind(localStorage);
    let call = 0;
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      call += 1;
      // Первая попытка — с фото — падает по квоте, вторая (только текст) проходит.
      if (call === 1) throw new DOMException('quota', 'QuotaExceededError');
      return original(key, value);
    });

    const res = writeDraft(CLIENT_A, { text: 'важный текст', photos: [photo('p3')] });
    expect(res).toEqual({ saved: true, photosSaved: 0 });

    vi.restoreAllMocks();
    expect(readDraft(CLIENT_A)).toEqual({ text: 'важный текст', photos: [] });
  });

  it('старый черновик-строка читается без потери текста', () => {
    const { readDraft } = loadMessengerComponentInternals();
    localStorage.setItem(`heys_messenger_draft_${CLIENT_A}`, 'написано до появления фото');

    expect(readDraft(CLIENT_A)).toEqual({ text: 'написано до появления фото', photos: [] });
  });

  it('без сети снимок не грузится и отправку не пускает', () => {
    // Отправить сейчас значило бы отправить текст без снимка.
    expect(messengerSource).toContain("status: 'pending-upload'");
    expect(messengerSource).toContain('Нет сети — фото пока не отправить');
  });

  it('после возвращения сети сначала снимки, потом очередь', () => {
    // Иначе очередь уйдёт без вложений, которые к ней прикладывали.
    expect(messengerSource).toContain('uploadPendingPhotos().then(() => flushOutbox())');
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
