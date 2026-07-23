import fs from 'fs';
import path from 'path';

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
