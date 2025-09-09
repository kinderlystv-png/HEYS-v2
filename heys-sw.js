/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys-sw.js (384 строки) - v2.1.0-timeout-fix             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🔧 КОНФИГУРАЦИЯ (строки 1-30):                                                           │
│    ├── Константы кеширования: CACHE_NAME, STATIC_CACHE, DYNAMIC_CACHE (2-4)             │
│    ├── Массив статических ресурсов: STATIC_ASSETS (7-24)                                │
│    └── Настройки Service Worker (1-30)                                                   │
│                                                                                           │
│ 📦 СОБЫТИЯ SERVICE WORKER (строки 31-150):                                               │
│    ├── install - инсталляция и кеширование (31-50)                                      │
│    ├── activate - активация и очистка старых кешей (51-80)                              │
│    └── fetch - перехват запросов и стратегии кеширования (81-150)                       │
│                                                                                           │
│ 🚀 КЕШИРОВАНИЕ (строки 151-250):                                                         │
│    ├── Стратегия Cache First для статических файлов (151-180)                          │
│    ├── Стратегия Network First для API запросов (181-210)                              │
│    └── Обработка офлайн режима (211-250)                                                │
│                                                                                           │
│ 🔄 СИНХРОНИЗАЦИЯ (строки 251-350):                                                       │
│    ├── Background Sync для отложенных операций (251-280)                                │
│    ├── Периодическая синхронизация данных (281-310)                                     │
│    └── Уведомления и Push сообщения (311-350)                                           │
│                                                                                           │
│ ⚡ ОПТИМИЗАЦИЯ (строки 351-384):                                                          │
│    ├── Предзагрузка критических ресурсов (351-370)                                      │
│    └── Очистка неиспользуемых кешей (371-384)                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys-sw.js - Service Worker для HEYS - v2.1.0-timeout-fix
const CACHE_NAME = 'heys-cache-v2.1.0';
const STATIC_CACHE = 'heys-static-v2.1.0';
const DYNAMIC_CACHE = 'heys-dynamic-v2.1.0';

// Файлы для кеширования
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/styles/common.css',
  '/styles/dark_tokens.css',
  '/heys_core_v12.js',
  '/heys_day_v12.js',
  '/heys_user_v12.js',
  '/heys_models_v1.js',
  '/heys_storage_layer_v1.js',
  '/heys_storage_indexeddb_v1.js',
  '/heys_worker_manager_v1.js',
  '/heys_integration_layer_v1.js',
  '/heys_analytics_ui.js',
  '/heys_performance_monitor.js',
  '/parse_worker.js',
];

// События Service Worker

// Установка
self.addEventListener('install', (event) => {
  console.log('[SW] Установка Service Worker');

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Кеширование статических файлов');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[SW] Статические файлы закешированы');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Ошибка кеширования:', error);
      }),
  );
});

// Активация
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация Service Worker');

  event.waitUntil(
    Promise.all([
      // Очистка старых кешей
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Удаление старого кеша:', cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      }),
      // Принятие управления всеми клиентами
      self.clients.claim(),
    ]),
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Игнорируем non-GET запросы и chrome-extension
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }

  // Стратегия кеширования для API запросов
  if (url.pathname.includes('/api/') || url.pathname.includes('supabase')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Стратегия для статических ресурсов
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Стратегия для HTML страниц
  if (request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Остальные запросы
  event.respondWith(networkFirst(request));
});

// Стратегии кеширования

// Cache First - сначала кеш, потом сеть
async function cacheFirst(request) {
  try {
    const cacheResponse = await caches.match(request);
    if (cacheResponse) {
      console.log('📦 SW: Static resource from cache:', request.url);
      return cacheResponse;
    }

    console.log('🌐 SW: Fetch from network:', request.url);
    
    // Добавляем таймаут для локальной разработки
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const networkResponse = await fetch(request, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('🔴 SW: Fetch error:', error, request.url);
    
    // Попытка найти fallback в кеше
    const fallbackResponse = await caches.match(request);
    if (fallbackResponse) {
      console.log('🔄 SW: Fallback from cache:', request.url);
      return fallbackResponse;
    }
    
    // Для favicon возвращаем пустой ответ вместо ошибки
    if (request.url.includes('favicon.ico')) {
      return new Response('', {
        status: 204,
        statusText: 'No Content'
      });
    }
    
    return new Response(
      JSON.stringify({
        error: 'Ресурс недоступен офлайн',
        url: request.url,
        timestamp: Date.now()
      }), 
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Network First - сначала сеть, потом кеш
async function networkFirst(request) {
  try {
    console.log('[SW] Network First запрос:', request.url);
    
    // Добавляем таймаут для локальной разработки
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const networkResponse = await fetch(request, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Сеть недоступна или таймаут, ищем в кеше:', request.url);

    const cacheResponse = await caches.match(request);
    if (cacheResponse) {
      console.log('[SW] Найдено в кеше:', request.url);
      return cacheResponse;
    }

    // Если это HTML страница, возвращаем офлайн страницу
    if (request.destination === 'document') {
      const offlineResponse = await caches.match('/index.html');
      if (offlineResponse) {
        console.log('[SW] Возвращаем index.html как fallback');
        return offlineResponse;
      }
    }

    console.error('[SW] Network First ошибка:', error);
    
    // Для localhost возвращаем более дружелюбный ответ
    if (request.url.includes('localhost')) {
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>Локальный сервер недоступен</title></head>
        <body>
          <h1>Локальный сервер недоступен</h1>
          <p>Убедитесь что сервер запущен на порту 3001</p>
          <button onclick="location.reload()">Перезагрузить</button>
        </body>
        </html>`,
        {
          status: 503,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        error: 'Нет подключения к интернету',
        offline: true,
        timestamp: Date.now(),
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

// Утилиты

function isStaticAsset(pathname) {
  const staticExtensions = [
    '.js',
    '.css',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.ico',
    '.woff',
    '.woff2',
  ];
  return staticExtensions.some((ext) => pathname.endsWith(ext));
}

// Обработка сообщений от клиентов
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'GET_CACHE_STATS':
      getCacheStats().then((stats) => {
        event.ports[0].postMessage({ type: 'CACHE_STATS', data: stats });
      });
      break;

    case 'CLEAR_CACHE':
      clearCaches(data?.cacheNames).then((result) => {
        event.ports[0].postMessage({ type: 'CACHE_CLEARED', data: result });
      });
      break;

    case 'PREFETCH_RESOURCES':
      prefetchResources(data?.urls).then((result) => {
        event.ports[0].postMessage({ type: 'PREFETCH_COMPLETE', data: result });
      });
      break;

    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    default:
      console.warn('[SW] Неизвестный тип сообщения:', type);
  }
});

// Получение статистики кеша
async function getCacheStats() {
  const cacheNames = await caches.keys();
  const stats = {
    totalCaches: cacheNames.length,
    caches: {},
  };

  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    stats.caches[cacheName] = {
      entries: keys.length,
      urls: keys.map((req) => req.url),
    };
  }

  return stats;
}

// Очистка кешей
async function clearCaches(cacheNames = null) {
  const allCacheNames = await caches.keys();
  const namesToClear = cacheNames || allCacheNames;

  const results = await Promise.allSettled(namesToClear.map((name) => caches.delete(name)));

  return {
    cleared: results.filter((r) => r.status === 'fulfilled' && r.value).length,
    failed: results.filter((r) => r.status === 'rejected').length,
    total: namesToClear.length,
  };
}

// Предзагрузка ресурсов
async function prefetchResources(urls = []) {
  if (!urls.length) return { prefetched: 0 };

  const cache = await caches.open(DYNAMIC_CACHE);
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
          return url;
        }
      } catch (error) {
        console.warn('[SW] Ошибка предзагрузки:', url, error);
      }
    }),
  );

  return {
    prefetched: results.filter((r) => r.status === 'fulfilled' && r.value).length,
    failed: results.filter((r) => r.status === 'rejected').length,
    total: urls.length,
  };
}

// Фоновая синхронизация
self.addEventListener('sync', (event) => {
  console.log('[SW] Фоновая синхронизация:', event.tag);

  switch (event.tag) {
    case 'heys-data-sync':
      event.waitUntil(performDataSync());
      break;

    case 'heys-analytics-sync':
      event.waitUntil(performAnalyticsSync());
      break;

    default:
      console.warn('[SW] Неизвестный тег синхронизации:', event.tag);
  }
});

// Выполнение синхронизации данных
async function performDataSync() {
  try {
    console.log('[SW] Начало синхронизации данных');

    // Здесь можно добавить логику синхронизации с сервером
    // Например, отправка pending операций из IndexedDB

    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        data: { success: true, timestamp: Date.now() },
      });
    });

    console.log('[SW] Синхронизация данных завершена');
  } catch (error) {
    console.error('[SW] Ошибка синхронизации данных:', error);
  }
}

// Выполнение синхронизации аналитики
async function performAnalyticsSync() {
  try {
    console.log('[SW] Начало синхронизации аналитики');

    // Логика синхронизации аналитических данных

    console.log('[SW] Синхронизация аналитики завершена');
  } catch (error) {
    console.error('[SW] Ошибка синхронизации аналитики:', error);
  }
}

// Push уведомления
self.addEventListener('push', (event) => {
  console.log('[SW] Push уведомление получено');

  let notificationData = {
    title: 'HEYS',
    body: 'У вас есть новые данные',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    tag: 'heys-notification',
    data: {},
  };

  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = { ...notificationData, ...pushData };
    } catch (error) {
      console.warn('[SW] Ошибка парсинга push данных:', error);
    }
  }

  event.waitUntil(self.registration.showNotification(notificationData.title, notificationData));
});

// Клик по уведомлению
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Клик по уведомлению:', event.notification.tag);

  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Если есть открытое окно, фокусируемся на нем
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }

      // Иначе открываем новое окно
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    }),
  );
});

// Обработка ошибок
self.addEventListener('error', (event) => {
  console.error('[SW] Глобальная ошибка:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Необработанное отклонение промиса:', event.reason);
});

console.log('[SW] Service Worker загружен');
