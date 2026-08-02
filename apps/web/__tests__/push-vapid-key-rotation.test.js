// SEC-036 (2026-08-02): подписка, выданная под прежний VAPID-ключ, должна
// пересоздаваться после ротации ключа.
//
// Регрессия, которую ловит этот тест: клиент брал существующую подписку по
// `if (!sub)` и не сверял её `applicationServerKey` с текущим серверным ключом,
// а публичный ключ читался из localStorage-кеша и наружу вообще не запрашивался.
// Из-за этого смену VAPID-ключа заметить было нельзя в принципе: push-сервис
// начинал отклонять доставку, браузер продолжал отдавать подписку как валидную,
// и уведомления умирали молча и навсегда — до ручной очистки данных сайта.
//
// Практическое следствие было хуже самой поломки: ключ, который нельзя
// ротировать, при компрометации не оставляет выбора.

import fs from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushSource = fs.readFileSync(path.resolve(__dirname, '../heys_push_v1.js'), 'utf8');

function base64UrlToBuffer(value) {
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Ключи строятся из байтов, а не пишутся строкой: 65 байт — реальная длина
 * VAPID-ключа, и такая форма канонична, то есть переживает round-trip
 * base64url → байты → base64url. Строковый литерал произвольной длины его не
 * переживает, и тест падал бы на собственной арифметике, а не на коде.
 */
function makeKey(seed) {
  const bytes = new Uint8Array(65);
  bytes[0] = 0x04; // несжатая точка P-256, как у настоящего ключа
  for (let i = 1; i < bytes.length; i++) bytes[i] = (seed * 31 + i * 7) % 256;
  return bufferToBase64Url(bytes.buffer);
}

const OLD_KEY = makeKey(1);
const NEW_KEY = makeKey(2);

/** Подписка, какой её отдаёт браузер: ключ лежит в options. */
function fakeSubscription(appServerKey) {
  return {
    options: appServerKey === null ? undefined : { applicationServerKey: base64UrlToBuffer(appServerKey) },
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint: 'https://push.example/sub', keys: { p256dh: 'p', auth: 'a' } }),
  };
}

/**
 * Поднимает модуль в окружении, где всё внешнее подставное:
 * разрешение на уведомления выдано, service worker готов, сеть отвечает.
 */
function loadPush({ existing, serverKey = NEW_KEY, networkFails = false }) {
  const subscribeSpy = vi.fn(async () => fakeSubscription(serverKey));
  const pushManager = {
    getSubscription: vi.fn(async () => existing),
    subscribe: subscribeSpy,
  };

  window.HEYS = {};
  global.Notification = { permission: 'granted', requestPermission: async () => 'granted' };
  window.Notification = global.Notification;
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager }),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  // isCapable() смотрит на наличие PushManager в window.
  global.PushManager = function PushManager() {};
  window.PushManager = global.PushManager;
  global.ServiceWorkerRegistration = { prototype: { showNotification: () => {} } };

  const fetchSpy = vi.fn(async (url) => {
    if (networkFails) throw new Error('offline');
    if (String(url).includes('/push/vapid-key')) {
      return { ok: true, status: 200, json: async () => ({ publicKey: serverKey }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
  global.fetch = fetchSpy;
  window.fetch = fetchSpy;

  // eslint-disable-next-line no-eval
  eval(pushSource);
  return { push: window.HEYS.push, pushManager, subscribeSpy, fetchSpy };
}

function keyPassedToSubscribe(spy) {
  const arg = spy.mock.calls[0][0].applicationServerKey;
  const bytes = new Uint8Array(arg);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('SEC-036: сверка VAPID-ключа существующей подписки', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('подписка под прежним ключом пересоздаётся под новый', async () => {
    const existing = fakeSubscription(OLD_KEY);
    const { push, subscribeSpy } = loadPush({ existing, serverKey: NEW_KEY });

    const res = await push.subscribe();

    expect(res.ok).toBe(true);
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(keyPassedToSubscribe(subscribeSpy)).toBe(NEW_KEY);
  });

  it('подписка под тем же ключом не трогается', async () => {
    const existing = fakeSubscription(NEW_KEY);
    const { push, subscribeSpy } = loadPush({ existing, serverKey: NEW_KEY });

    const res = await push.subscribe();

    expect(res.ok).toBe(true);
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('браузер без options не теряет рабочую подписку', async () => {
    const existing = fakeSubscription(null);
    const { push, subscribeSpy } = loadPush({ existing, serverKey: NEW_KEY });

    const res = await push.subscribe();

    expect(res.ok).toBe(true);
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('устаревший кеш ключа не перекрывает серверный', async () => {
    localStorage.setItem('heys_push_vapid_pk', JSON.stringify(OLD_KEY));
    const { push } = loadPush({ existing: null, serverKey: NEW_KEY });

    const key = await push.fetchVapidPublicKey();

    expect(key).toBe(NEW_KEY);
    expect(JSON.parse(localStorage.getItem('heys_push_vapid_pk'))).toBe(NEW_KEY);
  });

  it('без сети существующая подписка сохраняется, а не рвётся', async () => {
    const existing = fakeSubscription(OLD_KEY);
    const { push, subscribeSpy } = loadPush({ existing, serverKey: NEW_KEY, networkFails: true });

    await push.subscribe().catch(() => {});

    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });
});
