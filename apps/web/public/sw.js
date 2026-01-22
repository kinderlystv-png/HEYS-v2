/* eslint-disable no-console, no-restricted-globals, no-restricted-syntax */
// HEYS Service Worker v1.1
// Стратегия: Cache-First для статики, Network-First для API
// Версия обновляется автоматически при билде
// NOTE: Service Worker runs in isolated context - no access to @heys/logger

const CACHE_VERSION = 'heys-1769087035495';
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
  '/styles/modules/730-widgets-dashboard.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/react-bundle.js',
  // Core JS модули
  '/heys_core_v12.js',
  '/heys_models_v1.js',
  '/heys_storage_layer_v1.js',
  '/heys_day_v12.js',
  '/heys_day_utils.js',
  '/heys_day_hooks.js',
  '/heys_day_pickers.js',
  '/heys_day_trainings_v1.js',
  '/heys_day_training_popups_v1.js',
  '/heys_day_sleep_score_popups_v1.js',
  '/heys_day_edit_grams_modal_v1.js',
  '/heys_day_time_mood_picker_v1.js',
  '/heys_day_bundle_v1.js',
  '/heys_day_sparklines_v1.js',
  '/heys_day_sparkline_data_v1.js',
  '/heys_day_caloric_balance_v1.js',
  '/heys_day_insights_data_v1.js',
  '/heys_day_insulin_wave_data_v1.js',
  '/heys_day_goal_progress_v1.js',
  '/heys_day_daily_summary_v1.js',
  '/heys_day_pull_refresh_v1.js',
  '/heys_day_offline_sync_v1.js',
  '/heys_day_insulin_wave_ui_v1.js',
  '/heys_day_advice_list_ui_v1.js',
  '/heys_day_advice_toast_ui_v1.js',
  '/heys_day_advice_state_v1.js',
  '/heys_day_measurements_v1.js',
  '/heys_day_popups_state_v1.js',
  '/heys_day_meals_chart_ui_v1.js',
  '/heys_day_main_block_v1.js',
  '/heys_day_side_block_v1.js',
  '/heys_day_cycle_card_v1.js',
  '/heys_day_weight_trends_v1.js',
  '/heys_advice_rules_v1.js',
  '/heys_advice_bundle_v1.js',
  '/heys_advice_v1.js',
  '/heys_user_v12.js',
  '/heys_reports_v12.js',
  '/heys_app_v12.js',
  '/heys_simple_analytics.js',
  '/heys_cloud_merge_v1.js',
  '/heys_cloud_storage_utils_v1.js',
  '/heys_cloud_shared_v1.js',
  '/heys_cloud_queue_v1.js',
  '/heys_cloud_sync_v1.js',
  '/heys_storage_supabase_v1.js',
  '/heys_wheel_picker.js',
  '/heys_swipeable.js',
  '/heys_pull_refresh.js',
  '/heys_ratio_zones_v1.js',
  '/heys_gamification_v1.js',
  '/heys_data_overview_v1.js',
  '/heys_dev_utils.js',
  // Widgets Dashboard модули
  '/heys_widgets_events_v1.js',
  '/heys_widgets_registry_v1.js',
  '/heys_widgets_core_v1.js',
  '/heys_widgets_ui_v1.js',
  '/widgets/widget_data.js'
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

// === ACTIVATE: Очистка старых кэшей + захват контроля ===
self.addEventListener('activate', (event) => {
  console.log('[SW] 🚀 Activating...', CACHE_VERSION);

  event.waitUntil(
    Promise.all([
      // 1️⃣ Включаем Navigation Preload для ускорения загрузки
      (async () => {
        if (self.registration.navigationPreload) {
          try {
            await self.registration.navigationPreload.enable();
            console.log('[SW] 🚀 Navigation Preload enabled');
          } catch (e) {
            console.warn('[SW] Navigation Preload not supported');
          }
        }
      })(),

      // 2️⃣ Очистка старых кэшей
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
        }),
    ])
      .then(() => {
        // clients.claim() — немедленно берём контроль над всеми открытыми страницами
        // Без этого новый SW не контролирует страницу до следующего refresh
        console.log('[SW] 📡 Claiming all clients...');
        return self.clients.claim();
      })
      .then(() => {
        // Очистка юридических документов (.md) из ВСЕХ кэшей
        // Чтобы пользователь видел актуальную версию после обновления
        console.log('[SW] Purging cached .md files (legal docs)...');
        return caches.keys().then(names => {
          return Promise.all(names.map(cacheName => {
            return caches.open(cacheName).then(cache => {
              return cache.keys().then(requests => {
                return Promise.all(
                  requests
                    .filter(req => req.url.endsWith('.md') || req.url.includes('/docs/'))
                    .map(req => {
                      console.log('[SW] Purging cached doc:', req.url);
                      return cache.delete(req);
                    })
                );
              });
            });
          }));
        });
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
  // Поддерживаем оба формата: строку 'skipWaiting' и объект { type: 'SKIP_WAITING' }
  const isSkipWaiting = event.data === 'skipWaiting' ||
    (event.data && event.data.type === 'SKIP_WAITING');

  if (isSkipWaiting) {
    console.log('[SW] skipWaiting requested');
    self.skipWaiting();
  }

  // 🔄 Очистка ВСЕХ кэшей (для принудительного обновления)
  if (event.data === 'clearAllCaches') {
    console.log('[SW] 🗑️ Clearing ALL caches...');
    event.waitUntil(
      caches.keys().then(names => {
        return Promise.all(
          names.map(name => {
            console.log('[SW] Deleting cache:', name);
            return caches.delete(name);
          })
        );
      }).then(() => {
        console.log('[SW] ✅ All caches cleared');
        // Уведомляем клиента
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'CACHES_CLEARED' });
          });
        });
      })
    );
  }
});

// === FETCH: Стратегии кэширования ===
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // === 📤 Share Target API — обработка POST от других приложений ===
  if (request.method === 'POST' && url.searchParams.has('share-target')) {
    console.log('[SW] 📤 Share Target POST received');
    event.respondWith(handleShareTarget(request));
    return;
  }

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

    // Markdown документы (юридика) — ВСЕГДА с сервера
    if (url.pathname.endsWith('.md')) {
      event.respondWith(fetch(request));
      return;
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
  // 🔧 НЕ игнорируем query params (версия в URL важна для cache-busting)
  const cached = await caches.match(request);
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
const PERIODIC_SYNC_TAG = 'heys-periodic-update';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reserved for future sync queue implementation
const SYNC_QUEUE_KEY = 'heys-sync-queue';

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Background sync triggered');
    event.waitUntil(processSyncQueue());
  }
});

// === Periodic Background Sync (автопроверка обновлений в фоне) ===
self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    console.log('[SW] ⏰ Periodic sync: checking for updates...');
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  try {
    const response = await fetch('/version.json?_=' + Date.now(), { cache: 'no-store' });
    const data = await response.json();
    const serverVersion = data.version;

    // Сравниваем с текущей версией кэша
    const currentVersion = CACHE_VERSION.replace('heys-', '');

    if (serverVersion !== currentVersion) {
      console.log('[SW] 🆕 Update available in background!', serverVersion);
      // Уведомляем все открытые страницы
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({ type: 'UPDATE_AVAILABLE', version: serverVersion });
      }
    }
  } catch (e) {
    console.warn('[SW] Background update check failed:', e);
  }
}

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
    console.log('[SW] 🔄 skipWaiting requested');
    self.skipWaiting();
  }

  if (event.data === 'getVersion') {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }

  // === ОЧИСТКА ВСЕХ КЭШЕЙ (для принудительного обновления) ===
  if (event.data === 'clearAllCaches') {
    console.log('[SW] 🗑️ clearAllCaches requested — purging ALL caches...');
    event.waitUntil(
      caches.keys().then(cacheNames => {
        console.log('[SW] Found caches to delete:', cacheNames);
        return Promise.all(
          cacheNames.map(cacheName => {
            console.log('[SW] Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        console.log('[SW] ✅ All caches cleared!');
        // Уведомляем клиента что кэши очищены
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'CACHES_CLEARED' });
          });
        });
      }).catch(err => {
        console.error('[SW] ❌ Error clearing caches:', err);
      })
    );
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

// === 📤 Share Target API Handler ===
// Обрабатывает POST запросы когда пользователь делится фото из галереи/камеры
async function handleShareTarget(request) {
  console.log('[SW] 📤 Processing Share Target...');

  try {
    const formData = await request.formData();
    const images = formData.getAll('images');
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';

    console.log('[SW] Share received:', {
      imagesCount: images.length,
      title,
      text: text.substring(0, 50),
      url
    });

    // Сохраняем изображения в IndexedDB для последующего использования
    if (images.length > 0 && 'indexedDB' in self) {
      const db = await openShareDB();
      const tx = db.transaction('shared-images', 'readwrite');
      const store = tx.objectStore('shared-images');

      for (const image of images) {
        if (image instanceof File) {
          const arrayBuffer = await image.arrayBuffer();
          await store.add({
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            name: image.name,
            type: image.type,
            size: image.size,
            data: arrayBuffer,
            sharedAt: new Date().toISOString(),
            title,
            text
          });
        }
      }

      await tx.done;
      console.log('[SW] 📤 Saved', images.length, 'images to IndexedDB');
    }

    // Редирект на главную страницу с параметром для обработки шаринга
    return Response.redirect('/?share-received=true', 303);

  } catch (error) {
    console.error('[SW] ❌ Share Target error:', error);
    // В случае ошибки всё равно редиректим на главную
    return Response.redirect('/', 303);
  }
}

// Открытие IndexedDB для Share Target
function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('heys-share-db', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('shared-images')) {
        db.createObjectStore('shared-images', { keyPath: 'id' });
      }
    };
  });
}

console.log('[SW] Service Worker loaded, version:', CACHE_VERSION);
