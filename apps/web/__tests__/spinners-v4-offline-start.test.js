// spinners.v4.dc.html, строка контракта «офлайн»:
// «не отказ: при повторном открытии без сети приложение запускается нормально».
//
// Строку нельзя закрыть чтением исходника: «запускается нормально» — это исход
// трёх независимых механизмов, и каждый из них может тихо перестать работать.
//   1. Service worker обязан отдать оболочку из кэша, а не «Offline 503».
//   2. Политика восстановления обязана считать сетевую ошибку поправимой —
//      иначе первый же отвалившийся запрос покажет экран отказа, то есть
//      ровно то, что строка запрещает.
//   3. Знак ожидания у офлайн-старта общий; отдельного «офлайн-спиннера» нет,
//      а ступени 15 с / 60 с не должны срабатывать на кэше.
//
// Поэтому здесь не грепается текст, а исполняется настоящий обработчик fetch
// из apps/web/public/sw.js в подставном scope, где сеть всегда падает, а кэш
// наполнен прошлым (онлайновым) визитом. Файл лежит в каталоге собранных
// артефактов, но правится руками — сборка бьёт в нём только CACHE_VERSION.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const SW_SRC = fs.readFileSync(path.join(WEB_DIR, 'public/sw.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');
const PROGRESS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_loading_progress_v1.js'), 'utf8');
const AUTH_INIT_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_app_auth_init_v1.js'), 'utf8');
const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/spinners.v4.dc.html',
);

const ORIGIN = 'https://app.heyslab.ru';
// Имена кэшей sw.js собирает из CACHE_VERSION, а её правит сборка. Берём
// текущее значение из файла, чтобы фикстура не разъезжалась с продуктом.
const CACHE_VERSION = /const CACHE_VERSION = '([^']+)'/.exec(SW_SRC)[1];
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_KV_CACHE = `${CACHE_VERSION}-api-kv`;

/** Строка блока [data-contract] канваса по её ключу. */
function contractLine(file, key) {
  const html = fs.readFileSync(file, 'utf8');
  const re = new RegExp(`<b>${key}</b><span data-v="([^"]*)"`);
  const hit = re.exec(html);
  if (!hit) throw new Error(`строки «${key}» нет в контракте ${path.basename(file)}`);
  return hit[1];
}

/** Мини-CacheStorage: одна Map на имя кэша, ключ — абсолютный URL. */
function makeCaches(seed = {}) {
  const stores = new Map();
  // caches.match('/index.html') в SW разрешается относительно scope — стенд
  // обязан вести себя так же, иначе SPA-фолбэк «пройдёт» мимо кэша.
  const abs = (request) =>
    new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  };
  const wrap = (name) => ({
    async match(request, opts) {
      const store = cacheFor(name);
      const url = abs(request);
      if (store.has(url)) return store.get(url).clone();
      if (opts && opts.ignoreSearch) {
        const bare = url.split('?')[0];
        for (const [key, value] of store) {
          if (key.split('?')[0] === bare) return value.clone();
        }
      }
      return undefined;
    },
    async put(request, response) {
      cacheFor(name).set(abs(request), response);
    },
    async add() {
      throw new Error('offline');
    },
    async keys() {
      return [...cacheFor(name).keys()].map((url) => new Request(url));
    },
    async delete(request) {
      return cacheFor(name).delete(abs(request));
    },
  });
  for (const [name, entries] of Object.entries(seed)) {
    for (const [url, response] of Object.entries(entries)) cacheFor(name).set(abs(url), response);
  }
  return {
    stores,
    api: {
      open: async (name) => wrap(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
      async match(request, opts) {
        for (const name of stores.keys()) {
          const hit = await wrap(name).match(request, opts);
          if (hit) return hit;
        }
        return undefined;
      },
    },
  };
}

/** Исполняет sw.js в подставном ServiceWorkerGlobalScope, отдаёт его слушатели. */
function loadServiceWorker({ cachesApi, fetchImpl }) {
  const listeners = new Map();
  const self = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    location: { origin: ORIGIN },
    registration: { navigationPreload: null, scope: `${ORIGIN}/` },
    clients: { claim: async () => {}, matchAll: async () => [] },
    skipWaiting: async () => {},
  };
  const quietConsole = { log() {}, info() {}, warn() {}, error() {} };
  // eslint-disable-next-line no-new-func
  new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    'Request',
    'Headers',
    'URL',
    'console',
    'setTimeout',
    'setInterval',
    'clearTimeout',
    'clearInterval',
    'indexedDB',
    'navigator',
    'Blob',
    SW_SRC,
  )(
    self,
    cachesApi,
    fetchImpl,
    Response,
    Request,
    Headers,
    URL,
    quietConsole,
    () => 0,
    () => 0,
    () => {},
    () => {},
    undefined,
    { onLine: false },
    Blob,
  );
  return { self, listeners };
}

/** Гоняет один запрос через обработчик fetch и возвращает Response. */
async function swRespond(listeners, request) {
  let answered = null;
  const event = {
    request,
    respondWith: (value) => {
      answered = value;
    },
    waitUntil: () => {},
  };
  await listeners.get('fetch')(event);
  return answered ? await answered : null;
}

const navRequest = (url) => new Request(url, { headers: { accept: 'text/html,*/*' } });

describe('spinners v4 · строка «офлайн» — повторный старт без сети', () => {
  let listeners;
  let seededCaches;
  let networkCalls;

  beforeEach(() => {
    // Слепок прошлого онлайнового визита: install уже положил оболочку,
    // а cache-first — хешированные boot-бандлы.
    seededCaches = makeCaches({
      [STATIC_CACHE]: {
        [`${ORIGIN}/index.html`]: new Response('<!doctype html>оболочка', {
          headers: { 'content-type': 'text/html' },
        }),
        [`${ORIGIN}/`]: new Response('<!doctype html>оболочка', {
          headers: { 'content-type': 'text/html' },
        }),
        [`${ORIGIN}/boot-core.bundle.aaaaaaaaaaaa.js`]: new Response('/*boot*/', {
          headers: { 'content-type': 'application/javascript' },
        }),
        [`${ORIGIN}/react-bundle.js`]: new Response('/*react*/', {
          headers: { 'content-type': 'application/javascript' },
        }),
        [`${ORIGIN}/styles/main.css`]: new Response('.a{}', {
          headers: { 'content-type': 'text/css' },
        }),
      },
      [API_KV_CACHE]: {
        'https://api.heyslab.ru/rest/client_kv_store?client_id=c1': new Response(
          JSON.stringify([{ k: 'heys_profile' }]),
          { headers: { 'content-type': 'application/json' } },
        ),
      },
    });
    networkCalls = [];
    listeners = loadServiceWorker({
      cachesApi: seededCaches.api,
      fetchImpl: (request) => {
        networkCalls.push(typeof request === 'string' ? request : request.url);
        return Promise.reject(new TypeError('Failed to fetch'));
      },
    }).listeners;
  });

  it('контракт канваса всё ещё говорит «не отказ»', () => {
    const line = contractLine(CANVAS, 'офлайн');
    expect(line).toContain('не отказ');
    expect(line).toContain('запускается нормально');
  });

  it('оболочка приходит из кэша, а не «Offline 503»', async () => {
    const res = await swRespond(listeners, navRequest(`${ORIGIN}/`));
    expect(res).not.toBeNull();
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('оболочка');
    // Сеть попробовали — и только потом ушли в кэш: свежая оболочка важнее.
    expect(networkCalls.some((url) => url.startsWith(`${ORIGIN}/`))).toBe(true);
  });

  it('глубокая ссылка без своей записи в кэше падает на /index.html, не на 503', async () => {
    const res = await swRespond(listeners, navRequest(`${ORIGIN}/some/deep/route`));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('оболочка');
  });

  it('хешированный boot-бандл и прочая статика отдаются из кэша', async () => {
    const bundle = await swRespond(
      listeners,
      new Request(`${ORIGIN}/boot-core.bundle.aaaaaaaaaaaa.js`),
    );
    expect(bundle.status).toBe(200);
    expect(await bundle.text()).toContain('boot');

    const react = await swRespond(listeners, new Request(`${ORIGIN}/react-bundle.js`));
    expect(react.status).toBe(200);

    const css = await swRespond(listeners, new Request(`${ORIGIN}/styles/main.css`));
    expect(css.status).toBe(200);
  });

  it('данные открытого дня приходят stale из KV-кэша', async () => {
    const res = await swRespond(
      listeners,
      new Request('https://api.heyslab.ru/rest/client_kv_store?client_id=c1'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-HEYS-Cache-Origin')).toBe('sw-stale');
  });

  it('KV без кэша отвечает 503 offline_no_kv_cache — экран показывает старое, не отказ', async () => {
    const res = await swRespond(
      listeners,
      new Request('https://api.heyslab.ru/rest/client_kv_store?client_id=unseen'),
    );
    expect(res.status).toBe(503);
    expect(JSON.parse(await res.text()).error).toBe('offline_no_kv_cache');
  });

  it('install заранее кладёт оболочку в кэш — иначе повторного старта не бывает', () => {
    // PRECACHE_URLS + проактивный прогон bundle-manifest.json: именно они
    // делают «повторное открытие» офлайн возможным.
    expect(SW_SRC).toContain("'/index.html'");
    expect(SW_SRC).toMatch(/bundle-manifest\.json/);
    expect(SW_SRC).toMatch(/startsWith\('boot-'\)\s*\|\|\s*\w+\.startsWith\('postboot-'\)/);
  });
});

describe('spinners v4 · офлайн не превращается в отказ', () => {
  function loadRecoveryPolicy() {
    const marker = '<!-- 🆕 PWA Recovery: Global pre-React error handler -->';
    const at = INDEX_HTML.indexOf(marker);
    const start = INDEX_HTML.indexOf('<script>', at);
    const end = INDEX_HTML.indexOf('</script>', start);
    const src = INDEX_HTML.slice(start + '<script>'.length, end);
    const scope = { window: {}, navigator: { onLine: false }, sessionStorage: undefined };
    // eslint-disable-next-line no-new-func
    new Function('window', 'navigator', 'document', 'sessionStorage', 'console', src)(
      scope.window,
      scope.navigator,
      document,
      undefined,
      { log() {}, info() {}, warn() {}, error() {} },
    );
    return scope.window.__heysRecoveryPolicy;
  }

  it('сетевые ошибки офлайна классифицируются как поправимые — экран отказа не показывается', () => {
    const policy = loadRecoveryPolicy();
    for (const message of [
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource',
      'net::ERR_NETWORK_CHANGED',
    ]) {
      expect(policy.isRuntimeRecoverableError(message, '')).toBe(true);
      // appReady = false — то есть ровно холодный старт.
      expect(policy.shouldShowRecoveryForError(message, '', false, 3, 0)).toBe(false);
    }
  });

  it('названное исключение: несохранённый chunk остаётся отказом', () => {
    // Единственная дыра в строке «офлайн»: если модуль не попал в кэш при
    // прошлом визите, офлайн-старт всё-таки покажет «Не удалось загрузить».
    // Держим это осознанным, а не случайным — если правило поменяют, тест
    // покраснеет и решение придётся принять заново.
    const policy = loadRecoveryPolicy();
    const message = 'Failed to fetch dynamically imported module';
    expect(policy.isRuntimeRecoverableError(message, '')).toBe(false);
    expect(policy.isBootCriticalError(message, '')).toBe(true);
    expect(INDEX_HTML).toContain('CRITICAL_SCRIPT_LOAD: boot-init.bundle');
  });
});

describe('spinners v4 · знак ожидания у офлайн-старта общий', () => {
  it('отдельного офлайн-знака нет: ступени и пороги одни на любой старт', () => {
    expect(PROGRESS_SRC).toContain('const SLOW_MS = 15000');
    expect(PROGRESS_SRC).toContain('const STALL_MS = 60000');
    // Ни одной ветки по состоянию сети — знак не знает, есть ли она.
    expect(PROGRESS_SRC).not.toMatch(/navigator\s*\.\s*onLine/);
    // Знак один: .heys-boot-mark. Отдельного офлайн-класса ступеней нет.
    expect(PROGRESS_SRC).toContain(".querySelectorAll('.heys-boot-mark')");
    expect(PROGRESS_SRC).not.toMatch(/is-offline/);
  });

  it('прогресс считается байтами boot-файлов — из кэша они приходят сразу, ступени молчат', () => {
    expect(PROGRESS_SRC).toMatch(/transferSize \|\| r\.encodedBodySize \|\| 0/);
    expect(PROGRESS_SRC).toMatch(/size > 0 \? size : 1/);
  });

  it('офлайн-ветка входа не ждёт сеть, а поднимает локальные данные', () => {
    const at = AUTH_INIT_SRC.indexOf('if (!navigator.onLine)');
    expect(at).toBeGreaterThan(-1);
    const branch = AUTH_INIT_SRC.slice(at, at + 700);
    expect(branch).toContain('initLocalData()');
    expect(branch).toContain('setIsInitializing(false)');
    expect(branch).toContain("setStatus('offline')");
  });
});
