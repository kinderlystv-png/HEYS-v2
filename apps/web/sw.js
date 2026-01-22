/**
 * HEYS Service Worker — PWA Recovery Edition
 * 
 * Стратегии:
 * - Cache-First: статика (.js, .css, images)
 * - Network-First: API запросы
 * - Boot failure counter → auto-recovery
 * 
 * @version 2.0.0
 * @created 2026-01-21
 */

const CACHE_VERSION = 'heys-v2.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const log = () => {};
const warn = () => {};

// Критические ресурсы для precache
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles/tailwind.css',
    '/styles/critical.css',
    '/styles/main.css'
];

// API паттерны (Network-First)
const API_PATTERNS = [
    /^https:\/\/api\.heyslab\.ru/,
    /\/api\//,
    /\/rpc/,
    /\/rest/
];

// Статика (Cache-First)
const STATIC_PATTERNS = [
    /\.js(\?.*)?$/,
    /\.css(\?.*)?$/,
    /\.woff2?$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.svg$/,
    /\.webp$/,
    /\.ico$/
];

// ============================================================================
// BOOT FAILURE TRACKING (IndexedDB)
// ============================================================================

const DB_NAME = 'heys-sw-recovery';
const DB_STORE = 'boot-failures';

async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(DB_STORE)) {
                db.createObjectStore(DB_STORE);
            }
        };
    });
}

async function getBootFailures() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(DB_STORE, 'readonly');
            const store = tx.objectStore(DB_STORE);
            const request = store.get('failures');
            request.onsuccess = () => resolve(request.result || { count: 0, timestamps: [] });
            request.onerror = () => resolve({ count: 0, timestamps: [] });
        });
    } catch {
        return { count: 0, timestamps: [] };
    }
}

async function recordBootFailure() {
    try {
        const db = await openDB();
        const data = await getBootFailures();
        const now = Date.now();

        // Храним только последние 5 минут
        const fiveMinAgo = now - 5 * 60 * 1000;
        const recentTimestamps = (data.timestamps || []).filter(t => t > fiveMinAgo);
        recentTimestamps.push(now);

        const newData = {
            count: recentTimestamps.length,
            timestamps: recentTimestamps,
            lastFailure: now
        };

        return new Promise((resolve) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            const store = tx.objectStore(DB_STORE);
            store.put(newData, 'failures');
            tx.oncomplete = () => resolve(newData);
            tx.onerror = () => resolve(newData);
        });
    } catch {
        return { count: 1, timestamps: [Date.now()] };
    }
}

async function clearBootFailures() {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(DB_STORE, 'readwrite');
            const store = tx.objectStore(DB_STORE);
            store.delete('failures');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // Ignore
    }
}

// ============================================================================
// AUTO-RECOVERY: очистка кэша при множественных падениях
// ============================================================================

async function checkAndRecoverIfNeeded() {
    const failures = await getBootFailures();

    // Если >2 падений за 5 минут → полная очистка
    if (failures.count > 2) {
        log('[SW] 🚨 >2 boot failures detected, clearing all caches...');

        // Удаляем все кэши
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));

        // Сбрасываем счётчик
        await clearBootFailures();

        // Принудительно активируем новый SW
        self.skipWaiting();

        // Уведомляем клиентов
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'CACHES_CLEARED',
                reason: 'boot_failures',
                message: 'Кэш очищен автоматически из-за ошибок загрузки'
            });
        });

        return true;
    }

    return false;
}

// ============================================================================
// INSTALL: precache критических ресурсов
// ============================================================================

self.addEventListener('install', (event) => {
    log('[SW] 📦 Installing...');

    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC_CACHE);

            // Precache критические ресурсы (без ошибок при 404)
            await Promise.allSettled(
                PRECACHE_URLS.map(url =>
                    cache.add(url).catch(err => {
                        warn(`[SW] Precache failed for ${url}:`, err.message);
                    })
                )
            );

            log('[SW] ✅ Installed');

            // Сразу активируемся (не ждём закрытия вкладок)
            self.skipWaiting();
        })()
    );
});

// ============================================================================
// ACTIVATE: очистка старых кэшей + recovery check
// ============================================================================

self.addEventListener('activate', (event) => {
    log('[SW] 🚀 Activating...');

    event.waitUntil(
        (async () => {
            // Проверяем нужно ли восстановление
            const recovered = await checkAndRecoverIfNeeded();
            if (recovered) {
                log('[SW] ✅ Recovery completed');
                return;
            }

            // Удаляем старые версии кэшей
            const cacheNames = await caches.keys();
            const validCaches = [STATIC_CACHE, API_CACHE];

            await Promise.all(
                cacheNames
                    .filter(name => !validCaches.includes(name))
                    .map(name => {
                        log(`[SW] 🗑️ Deleting old cache: ${name}`);
                        return caches.delete(name);
                    })
            );

            // Сбрасываем счётчик падений при успешной активации
            await clearBootFailures();

            // Берём контроль над всеми вкладками
            await self.clients.claim();

            log('[SW] ✅ Activated');
        })()
    );
});

// ============================================================================
// FETCH: стратегии кэширования
// ============================================================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Пропускаем не-GET и не-HTTP(S)
    if (request.method !== 'GET') return;
    if (!url.protocol.startsWith('http')) return;

    // Пропускаем Chrome extensions, DevTools и т.д.
    if (url.hostname === 'localhost' && url.port !== '3001') return;
    if (url.pathname.startsWith('/sockjs-node')) return;
    if (url.pathname.includes('hot-update')) return;

    // API запросы → Network-First
    if (API_PATTERNS.some(pattern => pattern.test(request.url))) {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    // Статика → Cache-First
    if (STATIC_PATTERNS.some(pattern => pattern.test(url.pathname))) {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
        return;
    }

    // HTML страницы → Network-First с offline fallback
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirstWithOfflineFallback(request));
        return;
    }

    // Всё остальное → Network-First
    event.respondWith(networkFirst(request, STATIC_CACHE));
});

// ============================================================================
// СТРАТЕГИИ
// ============================================================================

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) {
        // Фоновое обновление (stale-while-revalidate)
        fetch(request)
            .then(response => {
                if (response.ok) {
                    cache.put(request, response.clone());
                }
            })
            .catch(() => { });

        return cached;
    }

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        warn('[SW] Cache-First fetch failed:', request.url);
        throw error;
    }
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) {
            log('[SW] Serving from cache (offline):', request.url);
            return cached;
        }
        throw error;
    }
}

async function networkFirstWithOfflineFallback(request) {
    try {
        const response = await fetch(request);

        // Кэшируем успешный ответ
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        // Пробуем кэш
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;

        // Fallback на index.html (SPA)
        const indexCached = await cache.match('/index.html');
        if (indexCached) return indexCached;

        // Последний fallback — offline страница
        const offlineCached = await cache.match('/offline.html');
        if (offlineCached) return offlineCached;

        // Генерируем минимальный offline ответ
        return new Response(
            `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HEYS — Офлайн</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f3f4f6; }
    .card { background: white; padding: 2rem; border-radius: 1rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 90%; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    p { color: #6b7280; margin: 0 0 1.5rem; }
    button { background: #10b981; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; }
    button:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <h1>📴 Нет подключения</h1>
    <p>Проверьте интернет и попробуйте снова</p>
    <button onclick="location.reload()">🔄 Обновить</button>
  </div>
</body>
</html>`,
            {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
                status: 503
            }
        );
    }
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

self.addEventListener('message', async (event) => {
    const { type } = event.data || {};

    switch (type) {
        case 'SKIP_WAITING': {
            log('[SW] Received SKIP_WAITING');
            self.skipWaiting();
            break;
        }

        case 'CLEAR_CACHE': {
            log('[SW] Clearing all caches...');
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            event.source?.postMessage({ type: 'CACHES_CLEARED', success: true });
            break;
        }

        case 'BOOT_FAILURE': {
            log('[SW] Recording boot failure');
            const failures = await recordBootFailure();
            log('[SW] Boot failures in last 5min:', failures.count);

            // Проверяем нужно ли восстановление
            if (failures.count > 2) {
                await checkAndRecoverIfNeeded();
            }
            break;
        }

        case 'BOOT_SUCCESS': {
            log('[SW] Boot success, clearing failure counter');
            await clearBootFailures();
            break;
        }

        case 'GET_STATUS': {
            const status = await getBootFailures();
            event.source?.postMessage({
                type: 'STATUS',
                cacheVersion: CACHE_VERSION,
                bootFailures: status.count,
                lastFailure: status.lastFailure
            });
            break;
        }

        default: {
            log('[SW] Unknown message type:', type);
        }
    }
});

// ============================================================================
// BACKGROUND SYNC (для офлайн-операций)
// ============================================================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'heys-sync') {
        log('[SW] Background sync triggered');
        event.waitUntil(
            // Здесь можно добавить синхронизацию офлайн-данных
            Promise.resolve()
        );
    }
});

// ============================================================================
// PERIODIC BACKGROUND SYNC (проверка обновлений)
// ============================================================================

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'heys-periodic-update') {
        log('[SW] Periodic sync: checking for updates');
        event.waitUntil(
            // Можно проверить версию и уведомить пользователя
            Promise.resolve()
        );
    }
});

log('[SW] 🚀 Service Worker loaded:', CACHE_VERSION);
