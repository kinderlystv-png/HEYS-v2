// HEYS Service Worker v1.1
// Стратегия: Cache-First для статики, Network-First для API
// Версия обновляется автоматически при билде

const CACHE_VERSION = 'heys-1764528254379'; // Заменяется при билде
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Ресурсы для предварительного кэширования (App Shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/styles/critical.css',
  '/styles/main.css',
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
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching App Shell');
        // Добавляем с ignoreSearch для версионных параметров (?v=1)
        return Promise.all(
          PRECACHE_URLS.map(url => 
            cache.add(url).catch(err => {
              console.warn('[SW] Failed to cache:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        // Сразу активируем новый SW
        return self.skipWaiting();
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
        // Берём контроль над всеми клиентами
        return self.clients.claim();
      })
  );
});

// === FETCH: Стратегии кэширования ===
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Пропускаем не-GET запросы
  if (request.method !== 'GET') return;
  
  // Пропускаем chrome-extension и другие нестандартные протоколы
  if (!url.protocol.startsWith('http')) return;
  
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
  
  // === Локальные статические файлы — Stale While Revalidate ===
  if (url.origin === self.location.origin) {
    // HTML — Network First (чтобы обновления были видны)
    if (request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(networkFirst(request));
      return;
    }
    
    // JS/CSS/Images — Stale While Revalidate
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
  
  // Возвращаем кэш сразу, если есть
  if (cached) {
    return cached;
  }
  
  // Иначе ждём сеть
  const response = await fetchPromise;
  if (response) {
    return response;
  }
  
  return new Response('Offline', { status: 503 });
}

// === Сообщения от клиента ===
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  
  if (event.data === 'getVersion') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});

console.log('[SW] Service Worker loaded, version:', CACHE_VERSION);
