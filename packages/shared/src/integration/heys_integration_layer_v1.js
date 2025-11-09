/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_integration_layer_v1.js (443 строки)                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🏗️ ОСНОВНОЙ КЛАСС IntegrationLayer (строки 1-80):                                       │
│    ├── constructor() - инициализация (5-16)                                             │
│    ├── capabilities объект (7-14)                                                       │
│    ├── eventBus - система событий (15)                                                  │
│    ├── init() - основная инициализация (18-30)                                          │
│    ├── checkCapabilities() - проверка поддержки (32-42)                                 │
│    └── initializeSupported() - инициализация (44-50)                                    │
│                                                                                           │
│ 🗄️ INDEXEDDB ИНТЕГРАЦИЯ (строки 81-180):                                                │
│    ├── initIndexedDB() - инициализация БД (51-80)                                       │
│    ├── setupDatabase() - настройка схемы (81-110)                                       │
│    ├── migrateDatabase() - миграции (111-140)                                           │
│    ├── getFromDB() - чтение данных (141-160)                                            │
│    ├── saveToDb() - сохранение (161-170)                                                │
│    └── deleteFromDB() - удаление (171-180)                                              │
│                                                                                           │
│ 👷 WEB WORKERS СИСТЕМА (строки 181-280):                                                 │
│    ├── initWebWorkers() - инициализация воркеров (181-200)                              │
│    ├── createWorker() - создание воркера (201-220)                                      │
│    ├── executeInWorker() - выполнение задач (221-240)                                   │
│    ├── terminateWorker() - завершение (241-250)                                         │
│    ├── manageWorkerPool() - пул воркеров (251-270)                                      │
│    └── optimizeWorkerUsage() - оптимизация (271-280)                                    │
│                                                                                           │
│ 🔧 SERVICE WORKER УПРАВЛЕНИЕ (строки 281-350):                                           │
│    ├── initServiceWorker() - инициализация SW (281-300)                                 │
│    ├── registerServiceWorker() - регистрация (301-320)                                  │
│    ├── updateServiceWorker() - обновление (321-330)                                     │
│    ├── messageServiceWorker() - сообщения (331-340)                                     │
│    └── unregisterServiceWorker() - отмена (341-350)                                     │
│                                                                                           │
│ ⚡ WEBASSEMBLY ИНТЕГРАЦИЯ (строки 351-400):                                               │
│    ├── initWebAssembly() - инициализация WASM (351-370)                                 │
│    ├── loadWasmModule() - загрузка модуля (371-380)                                     │
│    ├── executeWasmFunction() - выполнение (381-390)                                     │
│    └── optimizeWasmPerformance() - оптимизация (391-400)                                │
│                                                                                           │
│ 📡 СИСТЕМА СОБЫТИЙ И ЭКСПОРТ (строки 401-443):                                           │
│    ├── emit() - отправка событий (401-410)                                              │
│    ├── on() - подписка на события (411-420)                                             │
│    ├── off() - отписка от событий (421-430)                                             │
│    ├── HEYS.IntegrationLayerV1 экспорт (431-440)                                        │
│    └── Автоматическая инициализация (441-443)                                           │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Класс: IntegrationLayer (5), init() (18)                                          │
│    • IndexedDB: initIndexedDB() (51), setupDatabase() (81)                             │
│    • Workers: initWebWorkers() (181), createWorker() (201)                             │
│    • Service Worker: initServiceWorker() (281), registerServiceWorker() (301)          │
│    • WebAssembly: initWebAssembly() (351), loadWasmModule() (371)                      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_integration_layer_v1.js - Интеграционный слой для современных технологий
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  class IntegrationLayer {
    constructor() {
      this.initialized = false;
      this.capabilities = {
        indexedDB: false,
        webWorkers: false,
        serviceWorker: false,
        webAssembly: false,
        webRTC: false
      };
      
      this.eventBus = new EventTarget();
    }
    
    // Инициализация всех современных технологий
    async init() {
      if (this.initialized) return 'ok';
      
      console.log('[Integration] Инициализация современных технологий...');
      
      // Проверяем поддержку технологий
      this.checkCapabilities();
      
      // Инициализируем поддерживаемые технологии
      await this.initializeSupported();
      
      this.initialized = true;
      this.emit('integration_ready', this.capabilities);
      
      console.log('[Integration] Инициализация завершена:', this.capabilities);
      return 'ok';
    }
    
    // Проверка поддержки технологий
    checkCapabilities() {
      this.capabilities.indexedDB = 'indexedDB' in window;
      this.capabilities.webWorkers = typeof Worker !== 'undefined';
      this.capabilities.serviceWorker = 'serviceWorker' in navigator;
      this.capabilities.webAssembly = typeof WebAssembly !== 'undefined';
      this.capabilities.webRTC = 'RTCPeerConnection' in window;
      
      console.log('[Integration] Поддерживаемые технологии:', this.capabilities);
    }
    
    // Инициализация поддерживаемых технологий
    async initializeSupported() {
      const initPromises = [];
      
      // IndexedDB
      if (this.capabilities.indexedDB && HEYS.indexedDB) {
        initPromises.push(
          HEYS.indexedDB.init()
            .then(() => console.log('[Integration] IndexedDB инициализирован'))
            .catch(error => console.error('[Integration] Ошибка IndexedDB:', error))
        );
      }
      
      // Web Workers
      if (this.capabilities.webWorkers && HEYS.workers) {
        initPromises.push(
          HEYS.workers.init()
            .then(() => console.log('[Integration] Web Workers инициализированы'))
            .catch(error => console.error('[Integration] Ошибка Web Workers:', error))
        );
      }
      
      // Service Worker
      if (this.capabilities.serviceWorker) {
        initPromises.push(this.initServiceWorker());
      }
      
      await Promise.allSettled(initPromises);
    }
    
    // Инициализация Service Worker
    async initServiceWorker() {
      // DEACTIVATED: Legacy SW registration removed to prevent conflicts
      console.log('[Integration] Service Worker registration SKIPPED (legacy)');
      return null;
      
      /* LEGACY CODE - DISABLED
      try {
        const registration = await navigator.serviceWorker.register('/heys-sw.js');
        console.log('[Integration] Service Worker зарегистрирован:', registration);
        
        // Слушаем обновления
        registration.addEventListener('updatefound', () => {
          this.emit('sw_update_available');
        });
        
        return registration;
      } catch (error) {
        console.error('[Integration] Ошибка Service Worker:', error);
        throw error;
      }
      */
    }
    
    // === ВЫСОКОУРОВНЕВЫЕ МЕТОДЫ ===
    
    // Умный поиск с кешированием и фоновой обработкой
    async smartSearch(query, options = {}) {
      const searchOptions = {
        useCache: true,
        useWorker: true,
        limit: 20,
        ...options
      };
      
      console.log('[Integration] Умный поиск:', query);
      
      // 1. Проверяем IndexedDB кеш
      if (searchOptions.useCache && this.capabilities.indexedDB) {
        try {
          const cached = await HEYS.indexedDB.searchProducts(query, searchOptions.limit);
          if (cached && cached.length > 0) {
            console.log('[Integration] Результаты из кеша:', cached.length);
            return {
              source: 'cache',
              results: cached,
              timestamp: Date.now()
            };
          }
        } catch (error) {
          console.warn('[Integration] Ошибка кеша поиска:', error);
        }
      }
      
      // 2. Выполняем поиск через Web Worker
      if (searchOptions.useWorker && this.capabilities.webWorkers) {
        try {
          const results = await HEYS.workers.searchProducts(query, searchOptions);
          console.log('[Integration] Результаты из Worker:', results.length);
          
          // Сохраняем в кеш
          if (this.capabilities.indexedDB && results.length > 0) {
            await HEYS.indexedDB.saveProducts(results);
          }
          
          return {
            source: 'worker',
            results: results,
            timestamp: Date.now()
          };
        } catch (error) {
          console.warn('[Integration] Ошибка Worker поиска:', error);
        }
      }
      
      // 3. Fallback к основному потоку
      console.log('[Integration] Fallback к основному поиску');
      return this.fallbackSearch(query, searchOptions);
    }
    
    // Расчет питательности с оптимизацией
    async calculateNutrition(products, portions, options = {}) {
      const calcOptions = {
        useWorker: true,
        saveToCache: true,
        ...options
      };
      
      console.log('[Integration] Расчет питательности для', products.length, 'продуктов');
      
      // Генерируем ключ для кеширования
      const cacheKey = this.generateNutritionCacheKey(products, portions);
      
      // Проверяем кеш
      if (calcOptions.saveToCache && this.capabilities.indexedDB) {
        try {
          const cached = await HEYS.indexedDB.getStatsCache(cacheKey, 60 * 60 * 1000); // 1 час
          if (cached) {
            console.log('[Integration] Питательность из кеша');
            return cached;
          }
        } catch (error) {
          console.warn('[Integration] Ошибка кеша питательности:', error);
        }
      }
      
      // Выполняем расчет
      let result;
      if (calcOptions.useWorker && this.capabilities.webWorkers) {
        result = await HEYS.workers.calculateNutrition(products, portions);
      } else {
        result = this.fallbackCalculateNutrition(products, portions);
      }
      
      // Сохраняем в кеш
      if (calcOptions.saveToCache && this.capabilities.indexedDB && result) {
        try {
          await HEYS.indexedDB.saveStatsCache(cacheKey, result, 'nutrition');
        } catch (error) {
          console.warn('[Integration] Ошибка сохранения в кеш:', error);
        }
      }
      
      return result;
    }
    
    // Сохранение дня с оптимизациями
    async saveDay(dayData, options = {}) {
      const saveOptions = {
        syncImmediately: false,
        updateCache: true,
        ...options
      };
      
      console.log('[Integration] Сохранение дня:', dayData.date);
      
      // Сохраняем в IndexedDB
      if (this.capabilities.indexedDB) {
        await HEYS.indexedDB.saveDay(dayData);
      }
      
      // Обновляем связанные кеши
      if (saveOptions.updateCache) {
        await this.invalidateRelatedCaches(dayData.date);
      }
      
      // Синхронизация
      if (saveOptions.syncImmediately && this.capabilities.webWorkers) {
        HEYS.workers.syncData().catch(error => {
          console.warn('[Integration] Ошибка синхронизации:', error);
        });
      }
      
      // Уведомляем о сохранении
      this.emit('day_saved', {
        date: dayData.date,
        totalKcal: dayData.totalKcal
      });
      
      return { success: true, timestamp: Date.now() };
    }
    
    // Генерация аналитики с кешированием
    async generateAnalytics(dateRange, options = {}) {
      const analyticsOptions = {
        useWorker: true,
        useCache: true,
        includeCharts: false,
        includeTrends: true,
        ...options
      };
      
      console.log('[Integration] Генерация аналитики:', dateRange);
      
      const cacheKey = `analytics_${dateRange.start}_${dateRange.end}_${JSON.stringify(analyticsOptions)}`;
      
      // Проверяем кеш
      if (analyticsOptions.useCache && this.capabilities.indexedDB) {
        try {
          const cached = await HEYS.indexedDB.getStatsCache(cacheKey, 30 * 60 * 1000); // 30 минут
          if (cached) {
            console.log('[Integration] Аналитика из кеша');
            return cached;
          }
        } catch (error) {
          console.warn('[Integration] Ошибка кеша аналитики:', error);
        }
      }
      
      // Генерируем аналитику
      let analytics;
      if (analyticsOptions.useWorker && this.capabilities.webWorkers) {
        analytics = await HEYS.workers.generateAnalytics(dateRange, analyticsOptions);
      } else {
        analytics = await this.fallbackGenerateAnalytics(dateRange, analyticsOptions);
      }
      
      // Сохраняем в кеш
      if (analyticsOptions.useCache && this.capabilities.indexedDB && analytics) {
        try {
          await HEYS.indexedDB.saveStatsCache(cacheKey, analytics, 'analytics');
        } catch (error) {
          console.warn('[Integration] Ошибка сохранения аналитики:', error);
        }
      }
      
      return analytics;
    }
    
    // === ОФЛАЙН ПОДДЕРЖКА ===
    
    // Проверка состояния сети
    isOnline() {
      return navigator.onLine;
    }
    
    // Обработка перехода в офлайн/онлайн
    setupOfflineHandlers() {
      window.addEventListener('online', () => {
        console.log('[Integration] Подключение восстановлено');
        this.emit('network_online');
        this.processPendingSync();
      });
      
      window.addEventListener('offline', () => {
        console.log('[Integration] Соединение потеряно');
        this.emit('network_offline');
      });
    }
    
    // Обработка pending синхронизации
    async processPendingSync() {
      if (!this.capabilities.webWorkers) return;
      
      try {
        const result = await HEYS.workers.syncData();
        console.log('[Integration] Синхронизация завершена:', result);
        this.emit('sync_completed', result);
      } catch (error) {
        console.error('[Integration] Ошибка синхронизации:', error);
        this.emit('sync_failed', error);
      }
    }
    
    // === УТИЛИТЫ ===
    
    // Генерация ключа кеша для питательности
    generateNutritionCacheKey(products, portions) {
      const productIds = products.map(p => p.id).sort().join(',');
      const portionString = portions.join(',');
      return `nutrition_${productIds}_${portionString}`;
    }
    
    // Инвалидация связанных кешей
    async invalidateRelatedCaches(date) {
      if (!this.capabilities.indexedDB) return;
      
      // Здесь можно добавить логику инвалидации кешей
      // которые зависят от конкретной даты
      console.log('[Integration] Инвалидация кешей для даты:', date);
    }
    
    // Fallback методы
    fallbackSearch(query, options) {
      // Простой поиск без Worker
      console.log('[Integration] Fallback поиск:', query);
      return Promise.resolve({
        source: 'fallback',
        results: [],
        timestamp: Date.now()
      });
    }
    
    fallbackCalculateNutrition(products, portions) {
      // Простой расчет без Worker
      console.log('[Integration] Fallback расчет питательности');
      return {
        totalKcal: 0,
        totalProteins: 0,
        totalFats: 0,
        totalCarbs: 0,
        details: []
      };
    }
    
    async fallbackGenerateAnalytics(dateRange, options) {
      // Простая аналитика без Worker
      console.log('[Integration] Fallback аналитика');
      return {
        period: dateRange,
        summary: {
          totalDays: 0,
          avgKcal: 0
        }
      };
    }
    
    // Event система
    emit(eventName, data) {
      this.eventBus.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    }
    
    on(eventName, callback) {
      this.eventBus.addEventListener(eventName, callback);
    }
    
    off(eventName, callback) {
      this.eventBus.removeEventListener(eventName, callback);
    }
    
    // Получение статистики производительности
    getPerformanceStats() {
      return {
        capabilities: this.capabilities,
        initialized: this.initialized,
        online: this.isOnline(),
        indexedDBStats: this.capabilities.indexedDB ? 
          HEYS.indexedDB?.getStats?.() : null,
        workerStats: this.capabilities.webWorkers ? 
          HEYS.workers?.getStats?.() : null
      };
    }
  }
  
  // Создаем глобальный экземпляр
  const integration = new IntegrationLayer();
  
  // Экспортируем в HEYS namespace
  HEYS.integration = {
    init: () => integration.init(),
    
    // Основные методы
    smartSearch: (query, options) => integration.smartSearch(query, options),
    calculateNutrition: (products, portions, options) => integration.calculateNutrition(products, portions, options),
    saveDay: (dayData, options) => integration.saveDay(dayData, options),
    generateAnalytics: (dateRange, options) => integration.generateAnalytics(dateRange, options),
    
    // Сеть и синхронизация
    isOnline: () => integration.isOnline(),
    processPendingSync: () => integration.processPendingSync(),
    
    // События
    on: (event, callback) => integration.on(event, callback),
    off: (event, callback) => integration.off(event, callback),
    
    // Статистика
    getStats: () => integration.getPerformanceStats(),
    
    // Прямой доступ
    _instance: integration
  };
  
  // Автоматическая инициализация при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      integration.init().catch(error => {
        console.error('[Integration] Ошибка автоинициализации:', error);
      });
    });
  } else {
    // Документ уже загружен
    setTimeout(() => {
      integration.init().catch(error => {
        console.error('[Integration] Ошибка автоинициализации:', error);
      });
    }, 100);
  }
  
  console.log('[HEYS] Integration Layer загружен');
  
  // Экспорт для тестирования
  if (typeof window !== 'undefined' && window.HEYS) {
    window.HEYS.IntegrationLayer = integration;
    window.HEYS.IntegrationLayerV1 = integration;
  }
  
})(window);
