// HEYS Service Worker v1.1
// Стратегия: Cache-First для статики, Network-First для API
// Версия обновляется автоматически при билде

const CACHE_VERSION = 'heys-1734167100000';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Ресурсы для предварительного кэширования (App Shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles/critical.css',
  '/styles/main.css',
  '/styles/modules/000-base-and-gamification.css',
  '/styles/modules/100-metrics-and-graphs.css',
  '/styles/modules/200-dark-and-effects.css',
  '/styles/modules/300-modals-and-day.css',
  '/styles/modules/400-water-and-hydration.css',
  '/styles/modules/500-pwa-and-offline.css',
  '/styles/modules/600-steps-and-aps.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Core JS модули
  '/heys_core_v12.js',
  '/heys_models_v1.js',
  '/heys_storage_layer_v1.js',
  '/heys_day_v12.js',
  '/heys_day_utils.js',
  '/heys_day_hooks.js',
  '/heys_day_pickers.js',
  '/heys_advice_v1.js',
  '/heys_user_v12.js',
  '/heys_reports_v12.js',
  '/heys_app_v12.js',
  '/heys_simple_analytics.js',
  '/heys_storage_supabase_v1.js',
  '/heys_wheel_picker.js',
  '/heys_swipeable.js',
  '/heys_pull_refresh.js',
  '/heys_ratio_zones_v1.js',
  '/heys_gamification_v1.js',
  '/heys_data_overview_v1.js',
  '/heys_dev_utils.js'
];

// CDN ресурсы (React, Supabase) — кэшируем при первом запросе
const CDN_URLS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js'
];

// === INSTALL: Предзагрузка App Shell ===
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...', CACHE_VERSION);
  
  // Не блокируем установку долгим precache — иначе чёрный экран при первом запуске
  // Сначала активируемся, потом кэшируем в фоне
  event.waitUntil(
    self.skipWaiting().then(() => {
      console.log('[SW] skipWaiting done, now precaching in background...');
      // Кэшируем в фоне — НЕ блокирует activate
      caches.open(STATIC_CACHE)
        .then((cache) => {
          console.log('[SW] Background precaching App Shell');
          return Promise.all(
            PRECACHE_URLS.map(url => 
              cache.add(url).catch(err => {
                console.warn('[SW] Failed to cache:', url, err.message);
              })
            )
          );
        })
        .then(() => console.log('[SW] Background precache complete'));
    })
  );
});

// === ACTIVATE: Очистка старых кэшей ===
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('heys-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Принудительно берём контроль над всеми клиентами
        // Это критично для обновления PWA!
        console.log('[SW] Claiming clients...');
        return self.clients.claim();
      })
  );
});

// === MESSAGE: Обработка сообщений от клиента ===
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    console.log('[SW] skipWaiting requested');
    self.skipWaiting();
  }
});

// === FETCH: Стратегии кэширования ===
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Пропускаем не-GET запросы
  if (request.method !== 'GET') return;
  
  // Пропускаем chrome-extension и другие нестандартные протоколы
  if (!url.protocol.startsWith('http')) return;
  
  // === version.json — ВСЕГДА с сервера (для проверки обновлений) ===
  if (url.pathname === '/version.json') {
    event.respondWith(fetch(request));
    return;
  }
  
  // === API запросы (Supabase) — Network First ===
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // === CDN ресурсы — Cache First (долгий срок жизни) ===
  if (CDN_URLS.some(cdn => request.url.startsWith(cdn.split('?')[0]))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  
  // === Локальные статические файлы ===
  if (url.origin === self.location.origin) {
    // HTML — Network First (чтобы обновления были видны)
    if (request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(networkFirst(request));
      return;
    }
    
    // JS — Network First с no-store (чтобы не отдавать старый бандл)
    if (url.pathname.endsWith('.js')) {
      if (url.pathname.startsWith('/heys_') || url.pathname === '/heys_app_v12.js') {
        event.respondWith(networkFirstNoStore(request));
        return;
      }
    }
    
    // Остальное (CSS/Images) — Stale While Revalidate
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  
  // === Остальное — Network First ===
  event.respondWith(networkFirst(request));
});

// === Стратегия: Cache First ===
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.warn('[SW] Cache First failed:', request.url);
    return new Response('Offline', { status: 503 });
  }
}

// === Стратегия: Network First ===
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    // Для HTML — возвращаем закэшированную главную страницу (SPA fallback)
    if (request.headers.get('accept')?.includes('text/html')) {
      const fallback = await caches.match('/index.html');
      if (fallback) return fallback;
    }
    
    return new Response('Offline', { status: 503 });
  }
}

// === Стратегия: Network First без повторного использования кэша браузера ===
async function networkFirstNoStore(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    // игнорируем и пытаемся взять из кеша
  }
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  return new Response('Offline', { status: 503 });
}

// === Проверка соответствия MIME type файлу ===
function isValidMimeType(request, response) {
  const url = new URL(request.url);
  const contentType = response.headers.get('content-type') || '';
  
  // CSS файлы должны иметь text/css
  if (url.pathname.endsWith('.css')) {
    return contentType.includes('text/css');
  }
  // JS файлы должны иметь javascript
  if (url.pathname.endsWith('.js')) {
    return contentType.includes('javascript');
  }
  // Остальные — ОК
  return true;
}

// === Стратегия: Stale While Revalidate ===
async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  
  // Фоновое обновление
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  
  // Проверяем MIME type в кеше — если неправильный, ждём сеть
  if (cached && isValidMimeType(request, cached)) {
    return cached;
  }
  
  // Кеш пустой или испорченный — ждём сеть
  const response = await fetchPromise;
  if (response) {
    return response;
  }
  
  // Последний шанс — вернуть даже испорченный кеш (лучше чем ничего)
  if (cached) {
    console.warn('[SW] Returning cached response with mismatched MIME type:', request.url);
    return cached;
  }
  
  return new Response('Offline', { status: 503 });
}

// === Background Sync ===
const SYNC_TAG = 'heys-sync';
const SYNC_QUEUE_KEY = 'heys-sync-queue';

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Background sync triggered');
    event.waitUntil(processSyncQueue());
  }
});

async function processSyncQueue() {
  // Получаем очередь из IndexedDB (через postMessage к клиенту)
  const clients = await self.clients.matchAll();
  
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_START' });
  }
  
  // Даём клиенту время на синхронизацию
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_COMPLETE' });
  }
}

// === Сообщения от клиента ===
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'getVersion') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
  
  // Регистрация Background Sync
  if (event.data === 'registerSync') {
    self.registration.sync?.register(SYNC_TAG)
      .then(() => console.log('[SW] Background sync registered'))
      .catch(err => console.warn('[SW] Background sync not supported:', err));
  }
  
  // Запрос на немедленную синхронизацию (для тестирования)
  if (event.data === 'forceSync') {
    processSyncQueue();
  }
  
  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    const port = event.ports && event.ports[0];
    const payload = {
      version: CACHE_VERSION,
      caches: {},
      timestamp: Date.now(),
    };
    if (port) {
      port.postMessage(payload);
    }
  }
});

console.log('[SW] Service Worker loaded, version:', CACHE_VERSION);
