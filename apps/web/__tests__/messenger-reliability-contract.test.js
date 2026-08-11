import fs from 'fs';
import path from 'path';

import { act, fireEvent, render } from '@testing-library/react';
import * as RealReact from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_api_v1.js'), 'utf8');
const messengerSource = fs.readFileSync(path.resolve(__dirname, '../heys_messenger_v1.js'), 'utf8');
const logTraceSource = fs.readFileSync(path.resolve(__dirname, '../heys_client_log_trace_v1.js'), 'utf8');
const originalReact = globalThis.React;
const originalReactDOM = globalThis.ReactDOM;
const originalHEYS = window.HEYS;

function loadAPI() {
  eval(apiSource);
  return window.HEYS.MessengerAPI;
}

function loadMessengerInternals() {
  globalThis.React = {
    useState: () => [null, () => {}],
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    createElement: () => null,
  };
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

function loadMessengerComponentInternals() {
  globalThis.React = RealReact;
  globalThis.ReactDOM = { createRoot: () => ({ render: () => {}, unmount: () => {} }) };
  eval(messengerSource);
  return window.HEYS.Messenger._test;
}

function message(index) {
  return {
    id: `message-${String(index).padStart(3, '0')}`,
    created_at: new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString(),
    body: `body-${index}`,
  };
}

describe('messenger retry-safe transport', () => {
  beforeEach(() => {
    localStorage.clear();
    window.HEYS = {};
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('reuses one request_id across an ambiguous send retry', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'internal_error' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, message_id: 'm1' }) });
    const api = loadAPI();

    const pending = api.send({ body: 'hello' }, { requestId: '11111111-1111-4111-8111-111111111111' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ success: true, message_id: 'm1' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const payloads = fetchSpy.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(payloads).toEqual([
      { body: 'hello', request_id: '11111111-1111-4111-8111-111111111111' },
      { body: 'hello', request_id: '11111111-1111-4111-8111-111111111111' },
    ]);
  });

  it('uses desired-state endpoints and sends the same state on retries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: 'internal_error' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, done_at: 'now' }) });
    const api = loadAPI();

    const pending = api.setDone('message-1', true);
    await vi.runAllTimersAsync();
    await pending;

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:4001/messages/set-done',
      'http://localhost:4001/messages/set-done',
    ]);
    expect(fetchSpy.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([
      { message_id: 'message-1', desired_state: true },
      { message_id: 'message-1', desired_state: true },
    ]);
    expect(api.toggleDone).toBeUndefined();
    expect(api.toggleAcked).toBeUndefined();
  });

  it('uses the client desired-state acknowledgement endpoint without toggling on retry', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'internal_error' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, acked_at: 'now' }) });
    const api = loadAPI();

    const pending = api.setAcked('message-1', true);
    await vi.runAllTimersAsync();
    await pending;

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:4001/messages/set-acked',
      'http://localhost:4001/messages/set-acked',
    ]);
    expect(fetchSpy.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([
      { message_id: 'message-1', desired_state: true },
      { message_id: 'message-1', desired_state: true },
    ]);
  });

  it('generates a different UUID for a new send action', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message_id: 'm' }),
    });
    const api = loadAPI();

    await api.send({ body: 'one' });
    await api.send({ body: 'two' });

    const requestIds = fetchSpy.mock.calls.map(([, options]) => JSON.parse(options.body).request_id);
    expect(requestIds[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(requestIds[1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  it('fetches an authenticated photo blob and caches the object URL by path', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => blob,
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:photo-1');
    const createDescriptor = Object.getOwnPropertyDescriptor(globalThis.URL, 'createObjectURL');
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    localStorage.setItem('heys_session_token', JSON.stringify('session-token'));
    const api = loadAPI();

    try {
      await expect(api.fetchPhotoBlob('client/2026-07-25/msg-photo/file.jpg'))
        .resolves.toEqual({ success: true, objectUrl: 'blob:photo-1' });
      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:4001/photos/read', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer session-token',
        },
        credentials: 'include',
        body: JSON.stringify({ path: 'client/2026-07-25/msg-photo/file.jpg' }),
      }));

      // Второй запрос того же пути отдаётся из кэша, сети не касается.
      fetchSpy.mockClear();
      await expect(api.fetchPhotoBlob('client/2026-07-25/msg-photo/file.jpg'))
        .resolves.toEqual({ success: true, objectUrl: 'blob:photo-1', cached: true });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (createDescriptor) Object.defineProperty(globalThis.URL, 'createObjectURL', createDescriptor);
      else delete globalThis.URL.createObjectURL;
    }
  });

  it('fetches an authenticated voice-message blob through the same endpoint, validating audio/*', async () => {
    // Голосовые лежат в том же бакете тем же способом, что и фото (2026-08-11):
    // публичная ссылка снята для обоих, `/photos/read` — общий эндпоинт.
    // `fetchPhotoBlob` для audio/webm обязан отклонить ответ — иначе перепутанный
    // media-type тихо проходит мимо серверной проверки.
    const audioBlob = new Blob(['webm'], { type: 'audio/webm' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => audioBlob,
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:audio-1');
    const createDescriptor = Object.getOwnPropertyDescriptor(globalThis.URL, 'createObjectURL');
    Object.defineProperty(globalThis.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    const api = loadAPI();

    try {
      await expect(api.fetchAudioBlob('client/2026-08-01/voice/msg-1/file.webm'))
        .resolves.toEqual({ success: true, objectUrl: 'blob:audio-1' });
      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:4001/photos/read', expect.objectContaining({
        body: JSON.stringify({ path: 'client/2026-08-01/voice/msg-1/file.webm' }),
      }));

      await expect(api.fetchPhotoBlob('client/2026-08-01/voice/msg-1/file.webm'))
        .resolves.toMatchObject({ success: false, error: 'invalid_photo_response' });
    } finally {
      if (createDescriptor) Object.defineProperty(globalThis.URL, 'createObjectURL', createDescriptor);
      else delete globalThis.URL.createObjectURL;
    }
  });

  it('does not repeat a failed photo request within the negative-cache window', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'attachment_not_found' }),
    });
    localStorage.setItem('heys_session_token', JSON.stringify('session-token'));
    const api = loadAPI();

    await expect(api.fetchPhotoBlob('client/2026-07-25/msg-photo/missing.jpg'))
      .resolves.toEqual({ success: false, error: 'attachment_not_found', statusCode: 404 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Тот же путь сразу после провала — из отрицательного кэша, без сети.
    await expect(api.fetchPhotoBlob('client/2026-07-25/msg-photo/missing.jpg'))
      .resolves.toEqual({ success: false, error: 'cached_failure', cached: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // `force` (ручной «Повторить») обходит отрицательный кэш немедленно.
    await expect(api.fetchPhotoBlob('client/2026-07-25/msg-photo/missing.jpg', { force: true }))
      .resolves.toEqual({ success: false, error: 'attachment_not_found', statusCode: 404 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('messenger page scroll lock', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('style');
    vi.restoreAllMocks();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('freezes the page while open and restores its exact scroll position', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });
    document.body.style.overflow = 'auto';
    const messenger = loadMessengerInternals();

    messenger.lockPageScroll();
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-420px');
    expect(document.body.style.overflow).toBe('hidden');

    messenger.unlockPageScroll();
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.overflow).toBe('auto');
    expect(scrollTo).toHaveBeenCalledWith(0, 420);
  });

  it('keeps the iOS body unfixed while installing and removing the touch containment guard', () => {
    vi.useFakeTimers();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)',
    );
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('iPhone');
    vi.spyOn(window.navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');
    vi.spyOn(window.navigator, 'maxTouchPoints', 'get').mockReturnValue(5);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
    document.body.style.position = 'relative';
    document.body.style.overflow = 'auto';
    const messenger = loadMessengerInternals();

    messenger.lockPageScroll();
    expect(document.body.style.position).toBe('relative');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('');
    expect(addEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function), {
      capture: true,
      passive: false,
    });

    messenger.unlockPageScroll();
    expect(document.body.style.position).toBe('relative');
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 240);
    vi.runAllTimers();
    expect(scrollTo).toHaveBeenCalledTimes(3);
    expect(removeEventListener).toHaveBeenCalledWith('touchmove', expect.any(Function), true);
  });

  it('contains background touch scroll but allows the messenger thread away from its edges', () => {
    const { shouldContainMessengerTouchMove } = loadMessengerInternals();

    expect(shouldContainMessengerTouchMove({ insideThread: false, deltaY: -20 })).toBe(true);
    expect(shouldContainMessengerTouchMove({
      insideThread: true,
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 500,
      deltaY: 20,
    })).toBe(true);
    expect(shouldContainMessengerTouchMove({
      insideThread: true,
      scrollTop: 500,
      scrollHeight: 1000,
      clientHeight: 500,
      deltaY: -20,
    })).toBe(true);
    expect(shouldContainMessengerTouchMove({
      insideThread: true,
      scrollTop: 250,
      scrollHeight: 1000,
      clientHeight: 500,
      deltaY: -20,
    })).toBe(false);
  });
});

describe('messenger in-app notification', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.HEYS = {};
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    vi.stubGlobal('requestAnimationFrame', (callback) => callback());
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('keeps unread messages unread when postponed and opens the messenger on read', () => {
    const messenger = loadMessengerInternals();

    messenger.showInAppMessageToast(1);
    expect(document.querySelector('.messenger-inapp-toast__read')?.textContent).toBe('Прочитать');
    document.querySelector('.messenger-inapp-toast__later').click();
    expect(document.querySelector('.messenger-portal')).toBeFalsy();

    messenger.showInAppMessageToast(1);
    document.querySelector('.messenger-inapp-toast__read').click();
    expect(document.querySelector('.messenger-portal')).toBeTruthy();
  });
});

describe('messenger error copy', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('never exposes transport error codes to the user', () => {
    const { formatMessengerError } = loadMessengerInternals();

    expect(formatMessengerError('network_error')).toBe(
      'Не удалось связаться с сервером. Повторите попытку.',
    );
    expect(formatMessengerError('http_503')).toBe('Не удалось выполнить действие. Повторите попытку.');
  });

  it('keeps an already user-facing explanation unchanged', () => {
    const { formatMessengerError } = loadMessengerInternals();

    expect(formatMessengerError('Не удалось удалить сообщение. Повторите попытку чуть позже.')).toBe(
      'Не удалось удалить сообщение. Повторите попытку чуть позже.',
    );
  });
});

describe('messenger photo recovery', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('reports an allowlisted privacy-safe diagnostic', () => {
    const { tracePhotoLoadFailure } = loadMessengerInternals();
    const event = vi.fn();
    window.HEYS.LogTrace = { event };

    const diagnostic = tracePhotoLoadFailure({
      candidateType: 'api',
      attemptCount: 6,
      url: 'https://storage.example.test/private-photo.jpg',
      path: 'private/client/path.jpg',
      client_id: 'private-client',
      filename: 'private-name.jpg',
      body: 'private message',
    }, {
      navigator: {
        onLine: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Mobile)',
        connection: { effectiveType: '3g' },
      },
      matchMedia: () => ({ matches: true }),
    });

    expect(diagnostic).toEqual({
      source: 'messenger',
      status: 'degraded',
      screen: 'messenger',
      online: true,
      effective_type: '3g',
      candidate_type: 'api',
      attempt_count: 6,
      surface: 'mobile-pwa',
    });
    expect(event).toHaveBeenCalledWith('messenger_photo_load_failed', diagnostic, 'warn');
    for (const forbiddenKey of ['url', 'path', 'client_id', 'filename', 'body']) {
      expect(diagnostic).not.toHaveProperty(forbiddenKey);
    }
    expect(JSON.stringify(diagnostic)).not.toContain('private-photo');
    // `/photos/upload` больше не отдаёт публичный URL (2026-08-11): функция,
    // строившая кандидатов из `attachment.url`, не должна вернуться в файл.
    expect(messengerSource).not.toContain('getPhotoSourceCandidates');
    expect(messengerSource).not.toContain('getYandexPathStylePhotoUrl');
    expect(messengerSource).toContain('HEYS.MessengerAPI?.fetchPhotoBlob');
    expect(logTraceSource).toContain('effective_type: 1, candidate_type: 1, attempt_count: 1, surface: 1');
    expect(messengerSource).toContain('Не удалось показать фото');
    expect(messengerSource).not.toContain('Не удалось загрузить фото');
  });

  it('loads the photo through the authorized path immediately, ignoring any legacy public url', async () => {
    const attachment = {
      // Историческая запись: до 2026-08-11 `url` был публичной ссылкой на
      // бакет. Она должна остаться полностью неиспользованной.
      url: 'https://heys-photos.storage.yandexcloud.net/client/2026-05-25/msg-photo/file.jpg',
      path: 'client/2026-05-25/msg-photo/file.jpg',
      type: 'image',
      mime: 'image/jpeg',
    };
    const fetchPhotoBlob = vi.fn().mockResolvedValue({ success: true, objectUrl: 'blob:api-photo' });
    window.HEYS = { MessengerAPI: { fetchPhotoBlob } };
    const { MessagePhoto } = loadMessengerComponentInternals();
    const view = render(RealReact.createElement(MessagePhoto, {
      attachment,
      photos: [attachment],
      index: 0,
      eager: true,
    }));

    try {
      const image = () => view.container.querySelector('img');
      // Никакой прямой попытки по attachment.url — источник пуст до ответа API.
      expect(image().getAttribute('src')).not.toBe(attachment.url);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchPhotoBlob).toHaveBeenCalledTimes(1);
      expect(fetchPhotoBlob).toHaveBeenCalledWith(attachment.path, { force: false });
      expect(image().getAttribute('src')).toBe('blob:api-photo');
      fireEvent.load(image());
      expect(view.queryByText('Не удалось показать фото')).toBeNull();
    } finally {
      if (view.container.isConnected) view.unmount();
    }
  });

  it('does not revoke the cached object URL on unmount — the cache owns its lifecycle', async () => {
    const revokeObjectURL = vi.fn();
    const revokeDescriptor = Object.getOwnPropertyDescriptor(globalThis.URL, 'revokeObjectURL');
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const attachment = { path: 'client/2026-08-01/msg-photo/file.jpg' };
    const fetchPhotoBlob = vi.fn().mockResolvedValue({ success: true, objectUrl: 'blob:shared-photo' });
    window.HEYS = { MessengerAPI: { fetchPhotoBlob } };
    const { MessagePhoto } = loadMessengerComponentInternals();
    const view = render(RealReact.createElement(MessagePhoto, {
      attachment, photos: [attachment], index: 0, eager: true,
    }));

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      view.unmount();
      // Тот же blob-URL мог быть показан одновременно в ленте и в лайтбоксе —
      // отзыв на unmount одного места сломал бы другое. Отзывает только LRU
      // кэша в heys_messenger_api_v1.js.
      expect(revokeObjectURL).not.toHaveBeenCalled();
    } finally {
      if (view.container.isConnected) view.unmount();
      if (revokeDescriptor) Object.defineProperty(globalThis.URL, 'revokeObjectURL', revokeDescriptor);
      else delete globalThis.URL.revokeObjectURL;
    }
  });

  it('retries by bypassing the negative cache, not by trying another URL', async () => {
    const attachment = { path: 'client/2026-08-01/msg-photo/retry.jpg' };
    const fetchPhotoBlob = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'http_404' })
      .mockResolvedValueOnce({ success: true, objectUrl: 'blob:retried-photo' });
    window.HEYS = { MessengerAPI: { fetchPhotoBlob } };
    const { MessagePhoto } = loadMessengerComponentInternals();
    const view = render(RealReact.createElement(MessagePhoto, {
      attachment, photos: [attachment], index: 0, eager: true,
    }));

    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(view.getByText('Не удалось показать фото')).toBeTruthy();

      fireEvent.click(view.getByText('Повторить'));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchPhotoBlob).toHaveBeenCalledTimes(2);
      expect(fetchPhotoBlob).toHaveBeenNthCalledWith(2, attachment.path, { force: true });
      expect(view.container.querySelector('img').getAttribute('src')).toBe('blob:retried-photo');
    } finally {
      if (view.container.isConnected) view.unmount();
    }
  });
});

describe('messenger composer keyboard', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    document.body.innerHTML = '';
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('keeps Enter as a line break on touch devices', () => {
    const { shouldSendMessageOnEnter } = loadMessengerInternals();

    expect(shouldSendMessageOnEnter({ key: 'Enter', shiftKey: false }, true)).toBe(false);
  });

  it('sends on plain Enter only for non-touch pointers', () => {
    const { shouldSendMessageOnEnter } = loadMessengerInternals();

    expect(shouldSendMessageOnEnter({ key: 'Enter', shiftKey: false }, false)).toBe(true);
    expect(shouldSendMessageOnEnter({ key: 'Enter', shiftKey: true }, false)).toBe(false);
    expect(shouldSendMessageOnEnter({ key: 'Enter', isComposing: true }, false)).toBe(false);
  });

  it('focuses the textarea synchronously from an iOS user gesture', () => {
    const { focusMessageInputFromGesture } = loadMessengerInternals();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const focus = vi.spyOn(textarea, 'focus');

    expect(focusMessageInputFromGesture({ currentTarget: textarea }, true)).toBe(true);
    expect(focus).toHaveBeenCalledWith();
    expect(focusMessageInputFromGesture({ currentTarget: textarea }, false)).toBe(false);
  });

  it('reports a rejected focus instead of treating the focus call as success', () => {
    const { focusMessageInputFromGesture } = loadMessengerInternals();
    const textarea = document.createElement('textarea');
    const focus = vi.spyOn(textarea, 'focus');

    expect(focusMessageInputFromGesture({ currentTarget: textarea }, true)).toBe(false);
    expect(focus).toHaveBeenCalledWith();
  });

  it('does not refocus an already active textarea', () => {
    const { focusMessageInputFromGesture } = loadMessengerInternals();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    const focus = vi.spyOn(textarea, 'focus');

    expect(focusMessageInputFromGesture({ currentTarget: textarea }, true)).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    textarea.remove();
  });

  it('can force the proven blur-focus recovery while preserving the caret', () => {
    const { focusMessageInputFromGesture } = loadMessengerInternals();
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.setSelectionRange(2, 4);
    const blur = vi.spyOn(textarea, 'blur');
    const focus = vi.spyOn(textarea, 'focus');

    expect(focusMessageInputFromGesture({ currentTarget: textarea }, true, true)).toBe(true);
    expect(blur).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([2, 4]);
  });

  it('keeps the gesture start passive and performs focus recovery on click', () => {
    expect(messengerSource).toContain('onPointerDown: handleKeyboardGestureStart');
    expect(messengerSource).toContain('onTouchStart: handleKeyboardGestureStart');
    expect(messengerSource).toContain('onClick: handleKeyboardClick');
    expect(messengerSource).not.toContain('onTouchStart: focusMessageInputFromGesture');
    expect(messengerSource).toContain("attempt.trigger === 'gesture' && attempt.startedActive === false");
    expect(messengerSource).toContain('focusMessageInputFromGesture(event, true, forceRefocus)');
  });

  it('detects keyboard viewport shrink without mistaking a small viewport change for a keyboard', () => {
    const { hasKeyboardViewportEvidence } = loadMessengerInternals();
    const baseline = { supported: true, viewportHeight: 844, layoutHeight: 844, offsetTop: 0 };

    expect(hasKeyboardViewportEvidence(baseline, {
      supported: true,
      viewportHeight: 520,
      layoutHeight: 844,
      offsetTop: 0,
    })).toBe(true);
    expect(hasKeyboardViewportEvidence(baseline, {
      supported: true,
      viewportHeight: 790,
      layoutHeight: 844,
      offsetTop: 0,
    })).toBe(false);
    expect(hasKeyboardViewportEvidence(baseline, {
      supported: false,
      viewportHeight: 0,
      layoutHeight: 844,
      offsetTop: 0,
    })).toBe(false);
  });

  it('classifies focus and keyboard evidence without inventing a system cause', () => {
    const { classifyKeyboardAttempt } = loadMessengerInternals();

    expect(classifyKeyboardAttempt({ inputObserved: true })).toBeNull();
    expect(classifyKeyboardAttempt({ viewportVisible: true })).toBeNull();
    expect(classifyKeyboardAttempt({ disabled: true })).toBe('composer_disabled');
    expect(classifyKeyboardAttempt({ active: false })).toBe('focus_rejected');
    expect(classifyKeyboardAttempt({ active: true, viewportSupported: true, surface: 'ios-pwa' }))
      .toBe('viewport_unchanged');
    expect(classifyKeyboardAttempt({ active: true, viewportSupported: false, surface: 'ios-browser' }))
      .toBe('keyboard_unconfirmed');
  });

  it('distinguishes iOS PWA, browser, and non-iOS surfaces', () => {
    const { getKeyboardSurface } = loadMessengerInternals();

    expect(getKeyboardSurface({ iosDevice: true, standalone: true }))
      .toBe('ios-pwa');
    expect(getKeyboardSurface({ iosDevice: true, standalone: false }))
      .toBe('ios-browser');
    expect(getKeyboardSurface({ iosDevice: false, standalone: true }))
      .toBe('other');
  });

  it('does not treat Chrome DevTools mobile emulation as a real iOS device', () => {
    const { isIOSDevice } = loadMessengerInternals();

    expect(isIOSDevice({ platform: 'MacIntel', maxTouchPoints: 1, vendor: 'Google Inc.' }))
      .toBe(false);
    expect(isIOSDevice({ platform: 'iPhone', maxTouchPoints: 5, vendor: 'Apple Computer, Inc.' }))
      .toBe(true);
    expect(isIOSDevice({ platform: 'MacIntel', maxTouchPoints: 5, vendor: 'Apple Computer, Inc.' }))
      .toBe(true);
  });

  it('returns support-safe diagnostics without message or device identifiers', () => {
    const { getKeyboardDiagnostic } = loadMessengerInternals();
    const diagnostic = getKeyboardDiagnostic('viewport_unchanged');

    expect(diagnostic).toEqual({
      code: 'viewport_unchanged',
      detail: 'Поле активно, но показ клавиатуры не удалось подтвердить.',
      supportCode: 'KB-IOS-VIEWPORT',
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/client|message|user-agent|token/i);
  });

  it('binds and cleans up the visual viewport keyboard listener', () => {
    expect(messengerSource).not.toContain("addEventListener('heys:native-keyboard-state'");
    expect(messengerSource).toContain("viewport.addEventListener('resize', handleViewportResize)");
    expect(messengerSource).toContain("viewport.removeEventListener('resize', handleViewportResize)");
    expect(messengerSource).toContain('clearKeyboardAttemptTimer();');
  });
});

describe('messenger ack reconciliation', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('treats a lost mutation response as ambiguous', () => {
    const { isAmbiguousMutationFailure } = loadMessengerInternals();

    expect(isAmbiguousMutationFailure({ error: 'network_error' })).toBe(true);
    expect(isAmbiguousMutationFailure({ statusCode: 503 })).toBe(true);
    expect(isAmbiguousMutationFailure({ statusCode: 400 })).toBe(false);
  });

  it('allows only one in-flight acknowledgement mutation per message id', () => {
    const { acquireMessageMutation } = loadMessengerInternals();
    const pending = new Set();

    expect(acquireMessageMutation(pending, 'm1')).toBe(true);
    expect(acquireMessageMutation(pending, 'm1')).toBe(false);
    expect(acquireMessageMutation(pending, 'm2')).toBe(true);
    pending.delete('m1');
    expect(acquireMessageMutation(pending, 'm1')).toBe(true);
  });

  it('confirms both setting and clearing an acknowledgement from server truth', () => {
    const { getMessageStateConfirmation } = loadMessengerInternals();
    const done = [{ id: 'm1', done_at: '2026-07-23T01:11:00.000Z' }];
    const cleared = [{ id: 'm1', done_at: null }];

    expect(getMessageStateConfirmation(done, 'm1', 'done_at', true)).toMatchObject({
      found: true,
      confirmed: true,
      value: '2026-07-23T01:11:00.000Z',
    });
    expect(getMessageStateConfirmation(cleared, 'm1', 'done_at', false)).toMatchObject({
      found: true,
      confirmed: true,
      value: null,
    });
    expect(getMessageStateConfirmation(done, 'missing', 'done_at', true).found).toBe(false);
  });

  it('builds a verification cursor that includes the target message', () => {
    const { getVerificationBeforeTs } = loadMessengerInternals();

    expect(getVerificationBeforeTs({ created_at: '2026-07-23T01:11:00.000Z' })).toBe(
      '2026-07-23T01:11:00.001Z',
    );
  });

  it('reads server truth after an ambiguous acknowledgement response', async () => {
    const { verifyMessageMutation } = loadMessengerInternals();
    const getThread = vi.fn().mockResolvedValue({
      success: true,
      messages: [{ id: 'm1', done_at: '2026-07-23T01:11:00.000Z' }],
    });

    await expect(verifyMessageMutation({ getThread }, {
      message: { id: 'm1', created_at: '2026-07-23T01:11:00.000Z' },
      field: 'done_at',
      desiredState: true,
      threadOptions: { client_id: 'client-1' },
    })).resolves.toMatchObject({ verified: true, confirmed: true });
    expect(getThread).toHaveBeenCalledWith({
      client_id: 'client-1',
      before_ts: '2026-07-23T01:11:00.001Z',
      limit: 10,
    });
  });
});

describe('messenger cursor page merge', () => {
  beforeEach(() => {
    window.HEYS = {};
  });

  afterEach(() => {
    globalThis.React = originalReact;
    globalThis.ReactDOM = originalReactDOM;
    window.HEYS = originalHEYS;
  });

  it('loads 120 messages without gaps or duplicates across three pages', () => {
    const api = loadMessengerInternals();
    const all = Array.from({ length: 120 }, (_, index) => message(index));
    let loaded = api.mergeLatestMessagePage([], all.slice(70));
    loaded = api.mergeMessagePage(loaded, all.slice(20, 70));
    loaded = api.mergeMessagePage(loaded, all.slice(0, 20));

    expect(loaded).toHaveLength(120);
    expect(new Set(loaded.map((item) => item.id)).size).toBe(120);
    expect(loaded.map((item) => item.id)).toEqual(all.map((item) => item.id));
  });

  it('updates same-ID rows, preserves loaded history and removes deleted latest rows', () => {
    const api = loadMessengerInternals();
    const all = Array.from({ length: 80 }, (_, index) => message(index));
    const updatedLatest = all.slice(30).filter((item) => item.id !== 'message-060');
    updatedLatest[updatedLatest.length - 1] = { ...updatedLatest.at(-1), body: 'fresh' };

    const merged = api.mergeLatestMessagePage(all, updatedLatest);

    expect(merged.find((item) => item.id === 'message-079').body).toBe('fresh');
    expect(merged.some((item) => item.id === 'message-060')).toBe(false);
    expect(merged.some((item) => item.id === 'message-010')).toBe(true);
  });

  it('preserves the viewport offset after prepending old messages', () => {
    const api = loadMessengerInternals();
    expect(api.getPrependScrollTop(900, 120, 1450)).toBe(670);
  });

  it('marks a newly displayed foreign message read during a silent page refresh', () => {
    const api = loadMessengerInternals();
    const rows = [
      { ...message(1), sender_role: 'client' },
      { ...message(2), sender_role: 'curator' },
    ];
    expect(api.getLatestForeignReadTs(rows, 'client')).toBe(rows[1].created_at);
    expect(api.getLatestForeignReadTs(rows.slice(0, 1), 'client')).toBeNull();
  });
});
