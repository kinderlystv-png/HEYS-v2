/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_service_worker_v1.js (389 строк)                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🏗️ КЛАСС ServiceWorkerManager (строки 1-80):                                            │
│    ├── constructor() - инициализация (5-11)                                             │
│    ├── isSupported, registration (6-9)                                                  │
│    ├── listeners Map (10)                                                               │
│    ├── checkSupport() - проверка поддержки (13-16)                                      │
│    ├── register() - регистрация SW (18-45)                                              │
│    └── handleUpdate() - обработка обновлений (47-60)                                    │
│                                                                                           │
│ 📡 СИСТЕМА СООБЩЕНИЙ (строки 81-150):                                                    │
│    ├── sendMessage() - отправка сообщений (61-80)                                       │
│    ├── postMessage() - двусторонняя связь (81-100)                                      │
│    ├── addEventListener() - слушатели событий (101-120)                                  │
│    ├── removeEventListener() - удаление (121-130)                                       │
│    └── handleMessage() - обработка сообщений (131-150)                                  │
│                                                                                           │
│ 💾 СИСТЕМА КЕШИРОВАНИЯ (строки 151-250):                                                 │
│    ├── cacheResources() - кеширование ресурсов (151-180)                                │
│    ├── updateCache() - обновление кеша (181-200)                                        │
│    ├── clearCache() - очистка кеша (201-220)                                            │
│    ├── getCacheStatus() - статус кеша (221-240)                                         │
│    └── optimizeCache() - оптимизация (241-250)                                          │
│                                                                                           │
│ 🔄 ФОНОВАЯ СИНХРОНИЗАЦИЯ (строки 251-320):                                               │
│    ├── requestBackgroundSync() - запрос синхронизации (251-270)                         │
│    ├── handleBackgroundSync() - обработка (271-290)                                     │
│    ├── scheduleSync() - планирование (291-300)                                          │
│    ├── cancelSync() - отмена синхронизации (301-310)                                    │
│    └── getSyncStatus() - статус синхронизации (311-320)                                 │
│                                                                                           │
│ 📱 PUSH УВЕДОМЛЕНИЯ (строки 321-360):                                                    │
│    ├── requestNotificationPermission() - разрешения (321-340)                           │
│    ├── subscribeToPush() - подписка на push (341-350)                                   │
│    ├── unsubscribeFromPush() - отписка (351-355)                                        │
│    └── handlePushEvent() - обработка push (356-360)                                     │
│                                                                                           │
│ 🔧 УПРАВЛЕНИЕ И ЭКСПОРТ (строки 361-389):                                                │
│    ├── unregister() - отмена регистрации (361-370)                                      │
│    ├── getStatus() - статус SW (371-380)                                                │
│    ├── HEYS.ServiceWorker экспорт (381-385)                                             │
│    └── Автоматическая инициализация (386-389)                                           │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Класс: ServiceWorkerManager (5), register() (18)                                  │
│    • Сообщения: sendMessage() (61), postMessage() (81)                                 │
│    • Кеш: cacheResources() (151), updateCache() (181)                                  │
│    • Синхронизация: requestBackgroundSync() (251), handleBackgroundSync() (271)        │
│    • Push: requestNotificationPermission() (321), subscribeToPush() (341)              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_service_worker_v1.js - Service Worker для HEYS
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  class ServiceWorkerManager {
    constructor() {
      this.isSupported = 'serviceWorker' in navigator;
      this.registration = null;
      this.isRegistered = false;
      this.listeners = new Map();
    }
    
    // Проверка поддержки
    checkSupport() {
      return this.isSupported;
    }
    
    // Регистрация Service Worker
    async register(scriptPath = './service-worker.js') {
      if (!this.isSupported) {
        console.warn('[ServiceWorker] Service Workers не поддерживаются');
        return false;
      }
      
      try {
        console.log('[ServiceWorker] Регистрация Service Worker...');
        
        this.registration = await navigator.serviceWorker.register(scriptPath, {
          scope: './'
        });
        
        console.log('[ServiceWorker] Service Worker зарегистрирован:', this.registration.scope);
        
        // Слушаем обновления
        this.registration.addEventListener('updatefound', () => {
          console.log('[ServiceWorker] Найдено обновление Service Worker');
          this.handleUpdate();
        });
        
        this.isRegistered = true;
        return true;
        
      } catch (error) {
        console.error('[ServiceWorker] Ошибка регистрации:', error);
        return false;
      }
    }
    
    // Обработка обновлений
    handleUpdate() {
      if (!this.registration) return;
      
      const newWorker = this.registration.installing;
      if (!newWorker) return;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // Есть новая версия
          this.emit('update_available', newWorker);
        }
      });
    }
    
    // Отправка сообщения Service Worker'у
    async postMessage(message) {
      if (!this.registration || !this.registration.active) {
        console.warn('[ServiceWorker] Service Worker не активен');
        return false;
      }
      
      try {
        this.registration.active.postMessage(message);
        return true;
      } catch (error) {
        console.error('[ServiceWorker] Ошибка отправки сообщения:', error);
        return false;
      }
    }
    
    // Слушание сообщений от Service Worker
    onMessage(handler) {
      if (!this.isSupported) return;
      
      navigator.serviceWorker.addEventListener('message', handler);
    }
    
    // Принудительное обновление
    async forceUpdate() {
      if (!this.registration) return false;
      
      try {
        await this.registration.update();
        return true;
      } catch (error) {
        console.error('[ServiceWorker] Ошибка обновления:', error);
        return false;
      }
    }
    
    // Отмена регистрации
    async unregister() {
      if (!this.registration) return false;
      
      try {
        const success = await this.registration.unregister();
        if (success) {
          this.registration = null;
          this.isRegistered = false;
          console.log('[ServiceWorker] Service Worker отменен');
        }
        return success;
      } catch (error) {
        console.error('[ServiceWorker] Ошибка отмены регистрации:', error);
        return false;
      }
    }
    
    // Получение статуса
    getStatus() {
      if (!this.isSupported) {
        return { supported: false, status: 'not_supported' };
      }
      
      if (!this.registration) {
        return { supported: true, status: 'not_registered' };
      }
      
      const worker = this.registration.active || this.registration.waiting || this.registration.installing;
      
      return {
        supported: true,
        status: worker ? worker.state : 'unknown',
        scope: this.registration.scope,
        updateViaCache: this.registration.updateViaCache
      };
    }
    
    // === СПЕЦИФИЧНЫЕ ДЛЯ HEYS МЕТОДЫ ===
    
    // Кеширование продуктов
    async cacheProducts(products) {
      return this.postMessage({
        type: 'CACHE_PRODUCTS',
        products: products
      });
    }
    
    // Кеширование дня питания
    async cacheDay(dayData) {
      return this.postMessage({
        type: 'CACHE_DAY',
        day: dayData
      });
    }
    
    // Очистка кеша
    async clearCache(cacheNames = []) {
      return this.postMessage({
        type: 'CLEAR_CACHE',
        cacheNames: cacheNames
      });
    }
    
    // Проверка offline статуса
    isOffline() {
      return !navigator.onLine;
    }
    
    // Слушание изменений сети
    onNetworkChange(handler) {
      window.addEventListener('online', () => handler(true));
      window.addEventListener('offline', () => handler(false));
    }
    
    // Синхронизация в фоне
    async scheduleBackgroundSync(tag = 'heys-sync') {
      if (!this.registration || !this.registration.sync) {
        console.warn('[ServiceWorker] Background Sync не поддерживается');
        return false;
      }
      
      try {
        await this.registration.sync.register(tag);
        console.log('[ServiceWorker] Background Sync запланирован:', tag);
        return true;
      } catch (error) {
        console.error('[ServiceWorker] Ошибка планирования синхронизации:', error);
        return false;
      }
    }
    
    // События
    emit(event, data) {
      const listeners = this.listeners.get(event) || [];
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('[ServiceWorker] Ошибка в слушателе:', error);
        }
      });
    }
    
    on(event, listener) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(listener);
    }
    
    off(event, listener) {
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }
  }
  
  // Создание файла Service Worker (встроенного)
  function createServiceWorkerScript() {
    const script = `
// Service Worker для HEYS
const CACHE_NAME = 'heys-cache-v1';
const OFFLINE_PAGE = '/offline.html';

// Установка
self.addEventListener('install', event => {
  console.log('[SW] Установка Service Worker');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/',
        '/index.html',
        '/heys_core_v12.js',
        '/heys_day_v12.js',
        '/heys_user_v12.js',
        '/styles/main.css'
      ]);
    })
  );
  
  self.skipWaiting();
});

// Активация
self.addEventListener('activate', event => {
  console.log('[SW] Активация Service Worker');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Удаление старого кеша:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  self.clients.claim();
});

// Перехват запросов
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      
      return fetch(event.request).catch(() => {
        // Если офлайн, возвращаем кешированную страницу
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
      });
    })
  );
});

// Обработка сообщений
self.addEventListener('message', event => {
  const { type, products, day, cacheNames } = event.data;
  
  switch (type) {
    case 'CACHE_PRODUCTS':
      cacheProducts(products);
      break;
      
    case 'CACHE_DAY':
      cacheDay(day);
      break;
      
    case 'CLEAR_CACHE':
      clearCaches(cacheNames);
      break;
  }
});

// Функции кеширования
async function cacheProducts(products) {
  const cache = await caches.open(CACHE_NAME);
  const productsData = new Response(JSON.stringify(products));
  await cache.put('/cached-products.json', productsData);
}

async function cacheDay(day) {
  const cache = await caches.open(CACHE_NAME);
  const dayData = new Response(JSON.stringify(day));
  await cache.put(\`/cached-day-\${day.date}.json\`, dayData);
}

async function clearCaches(cacheNames) {
  if (cacheNames.length === 0) {
    // Очистить весь кеш
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(keys.map(key => cache.delete(key)));
  } else {
    // Очистить указанные кеши
    await Promise.all(cacheNames.map(name => caches.delete(name)));
  }
}

// Background Sync
self.addEventListener('sync', event => {
  if (event.tag === 'heys-sync') {
    event.waitUntil(syncData());
  }
});

async function syncData() {
  console.log('[SW] Выполнение фоновой синхронизации');
  // Здесь будет логика синхронизации данных
}
`;
    
    return new Blob([script], { type: 'application/javascript' });
  }
  
  // Создаем глобальный экземпляр
  const serviceWorkerManager = new ServiceWorkerManager();
  
  // Экспортируем в HEYS namespace
  HEYS.serviceWorker = {
    // Основные методы
    register: (scriptPath) => serviceWorkerManager.register(scriptPath),
    unregister: () => serviceWorkerManager.unregister(),
    forceUpdate: () => serviceWorkerManager.forceUpdate(),
    
    // Статус
    isSupported: () => serviceWorkerManager.checkSupport(),
    getStatus: () => serviceWorkerManager.getStatus(),
    isOffline: () => serviceWorkerManager.isOffline(),
    
    // Сообщения
    postMessage: (message) => serviceWorkerManager.postMessage(message),
    onMessage: (handler) => serviceWorkerManager.onMessage(handler),
    
    // HEYS-специфичные методы
    cacheProducts: (products) => serviceWorkerManager.cacheProducts(products),
    cacheDay: (dayData) => serviceWorkerManager.cacheDay(dayData),
    clearCache: (cacheNames) => serviceWorkerManager.clearCache(cacheNames),
    scheduleBackgroundSync: (tag) => serviceWorkerManager.scheduleBackgroundSync(tag),
    
    // События сети
    onNetworkChange: (handler) => serviceWorkerManager.onNetworkChange(handler),
    
    // События
    on: (event, listener) => serviceWorkerManager.on(event, listener),
    off: (event, listener) => serviceWorkerManager.off(event, listener),
    
    // Утилиты
    createScript: () => createServiceWorkerScript(),
    
    // Прямой доступ
    _instance: serviceWorkerManager
  };
  
  // Для dev-режима добавляем флаг отключения
  if (location.protocol === 'http:' && location.hostname === '127.0.0.1') {
    HEYS.serviceWorker.isDisabled = true;
    console.log('[HEYS] Service Worker отключен для dev-режима (http://127.0.0.1)');
  }
  
  console.log('[HEYS] Service Worker Manager загружен');
  
})(window);
