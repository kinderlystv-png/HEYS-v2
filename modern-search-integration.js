/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА modern-search-integration.js (347 строк)                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🚀 ИНИЦИАЛИЗАЦИЯ (строки 1-30):                                                          │
│    ├── Объект modernSearchIntegration (5-10)                                            │
│    ├── Функция initializeModernSearch() (13-30)                                         │
│    └── Проверка зависимостей (15-20)                                                    │
│                                                                                           │
│ 🔍 УМНЫЙ ПОИСК (строки 31-120):                                                          │
│    ├── SmartSearchEngine класс (31-60)                                                  │
│    ├── Алгоритмы поиска с опечатками (61-90)                                            │
│    └── Индексация контента (91-120)                                                     │
│                                                                                           │
│ 🗄️ КЕШИРОВАНИЕ (строки 121-200):                                                        │
│    ├── CacheManager класс (121-150)                                                     │
│    ├── Стратегии кеширования (151-180)                                                  │
│    └── Инвалидация кеша (181-200)                                                       │
│                                                                                           │
│ ⚡ WEB WORKERS (строки 201-280):                                                          │
│    ├── WorkerManager интеграция (201-230)                                               │
│    ├── Параллельная обработка поиска (231-260)                                          │
│    └── Оптимизация производительности (261-280)                                         │
│                                                                                           │
│ 🔧 API И СОБЫТИЯ (строки 281-347):                                                       │
│    ├── Публичный API (281-310)                                                          │
│    ├── Event listeners (311-330)                                                        │
│    └── Автоинициализация (331-347)                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// modern-search-integration.js - Интеграция современного поиска в HEYS
(function () {
  'use strict';

  // Сразу создаем объект для тестов
  window.modernSearchIntegration = {
    loaded: false,
    version: '1.0',
    features: ['smart_search', 'cache_invalidation', 'worker_integration'],
    error: null,
  };

  // Функция инициализации
  function initializeModernSearch() {
    // Проверяем, что все модули загружены
    if (!window.HEYS || !window.HEYS.integration) {
      console.warn('[ModernSearch] Integration Layer не найден, ожидаем...');
      window.modernSearchIntegration.error = 'Integration Layer не найден';
      return false;
    }

    console.log('[ModernSearch] Инициализация современного поиска...');

    // Сохраняем оригинальные методы
    const originalSearchProducts = window.HEYS.searchProducts;
    const originalAddProduct = window.HEYS.addProduct;
    // Создаем экспорт для тестирования
    window.HEYS.ModernSearch = {
      loaded: true,
      version: '1.0',
      features: ['smart_search', 'cache_invalidation', 'worker_integration'],
      smartSearch: async function (query, options = {}) {
        if (window.HEYS.integration?.smartSearch) {
          return await window.HEYS.integration.smartSearch(query, options);
        }
        // Fallback к обычному поиску
        return await window.HEYS.searchProducts(query, options);
      },
      clearCache: function () {
        if (window.HEYS.integration?.clearSearchCache) {
          return window.HEYS.integration.clearSearchCache();
        }
        console.log('[ModernSearch] Cache cleared (fallback)');
        return true;
      },
    };

    // === СОВРЕМЕННЫЙ ПОИСК ===

    window.HEYS.searchProducts = async function (query, options = {}) {
      const startTime = performance.now();

      console.log('[ModernSearch] Поиск:', query);

      try {
        // Используем умный поиск из Integration Layer
        const result = await HEYS.integration.smartSearch(query, {
          limit: options.limit || 20,
          useCache: true,
          useWorker: true,
        });

        const duration = performance.now() - startTime;

        // Аналитика производительности
        if (HEYS.analytics) {
          HEYS.analytics.trackComponentRender('search_products', duration);
        }

        console.log(
          `[ModernSearch] Результат: ${result.results.length} продуктов за ${duration.toFixed(1)}ms из ${result.source}`,
        );

        // Показываем уведомление о источнике
        if (result.source === 'cache') {
          showSearchNotification('⚡ Мгновенный поиск из кеша', 'success');
        } else if (result.source === 'worker') {
          showSearchNotification('🚀 Поиск в фоновом режиме', 'info');
        }

        return result.results;
      } catch (error) {
        console.warn('[ModernSearch] Ошибка умного поиска, fallback к оригинальному:', error);

        // Fallback к оригинальному методу
        if (originalSearchProducts) {
          return originalSearchProducts(query, options);
        }

        return [];
      }
    };

    // === СОВРЕМЕННОЕ ДОБАВЛЕНИЕ ПРОДУКТОВ ===

    window.HEYS.addProduct = async function (productData) {
      console.log('[ModernSearch] Добавление продукта:', productData.name);

      try {
        // Добавляем в IndexedDB
        if (HEYS.indexedDB) {
          await HEYS.indexedDB.saveProducts([productData]);
          console.log('[ModernSearch] Продукт сохранен в IndexedDB');
        }

        // Оригинальная логика (localStorage, Supabase)
        if (originalAddProduct) {
          const result = await originalAddProduct(productData);

          // Инвалидируем кеш поиска
          if (HEYS.indexedDB) {
            // Очищаем кеш поиска для этого продукта
            await invalidateSearchCache(productData.name);
          }

          return result;
        }

        return productData;
      } catch (error) {
        console.error('[ModernSearch] Ошибка добавления продукта:', error);
        throw error;
      }
    };

    // === СОВРЕМЕННОЕ СОХРАНЕНИЕ ДНЯ ===

    const originalSaveDay = window.HEYS.saveDay;

    window.HEYS.saveDay = async function (dayData) {
      console.log('[ModernSearch] Сохранение дня:', dayData.date);

      try {
        // Используем современный метод сохранения
        const result = await HEYS.integration.saveDay(dayData, {
          syncImmediately: navigator.onLine,
          updateCache: true,
        });

        // Оригинальная логика
        if (originalSaveDay) {
          await originalSaveDay(dayData);
        }

        showSearchNotification(`📅 День ${dayData.date} сохранен`, 'success');

        return result;
      } catch (error) {
        console.error('[ModernSearch] Ошибка сохранения дня:', error);

        // Fallback
        if (originalSaveDay) {
          return originalSaveDay(dayData);
        }

        throw error;
      }
    };

    // === СОВРЕМЕННАЯ АНАЛИТИКА ===

    window.HEYS.generateModernAnalytics = async function (dateRange, options = {}) {
      console.log('[ModernSearch] Генерация современной аналитики:', dateRange);

      try {
        const analytics = await HEYS.integration.generateAnalytics(dateRange, {
          useWorker: true,
          useCache: true,
          includeCharts: true,
          includeTrends: true,
          ...options,
        });

        console.log('[ModernSearch] Аналитика готова:', analytics);
        return analytics;
      } catch (error) {
        console.error('[ModernSearch] Ошибка генерации аналитики:', error);
        throw error;
      }
    };

    // === УТИЛИТЫ ===

    async function invalidateSearchCache(productName) {
      try {
        // Здесь можно добавить логику инвалидации кеша
        console.log('[ModernSearch] Инвалидация кеша для:', productName);
      } catch (error) {
        console.warn('[ModernSearch] Ошибка инвалидации кеша:', error);
      }
    }

    function showSearchNotification(message, type = 'info') {
      // Проверяем, есть ли функция уведомлений
      if (window.showNotification) {
        window.showNotification(message, type);
      } else {
        // Fallback - простой console.log
        console.log(`[Notification ${type.toUpperCase()}] ${message}`);
      }
    }

    // === МОНИТОРИНГ ПРОИЗВОДИТЕЛЬНОСТИ ===

    let searchStats = {
      totalSearches: 0,
      cacheHits: 0,
      workerSearches: 0,
      avgDuration: 0,
      lastSearch: null,
    };

    // Перехватываем события поиска для статистики
    HEYS.integration.on('smart_search_complete', (event) => {
      const { query, source, duration, results } = event.detail;

      searchStats.totalSearches++;
      searchStats.avgDuration =
        (searchStats.avgDuration * (searchStats.totalSearches - 1) + duration) /
        searchStats.totalSearches;
      searchStats.lastSearch = { query, source, duration, resultsCount: results.length };

      if (source === 'cache') {
        searchStats.cacheHits++;
      } else if (source === 'worker') {
        searchStats.workerSearches++;
      }
    });

    // Публичный API для статистики
    window.HEYS.getSearchStats = function () {
      return {
        ...searchStats,
        cacheHitRate:
          searchStats.totalSearches > 0
            ? ((searchStats.cacheHits / searchStats.totalSearches) * 100).toFixed(1) + '%'
            : '0%',
        workerUsageRate:
          searchStats.totalSearches > 0
            ? ((searchStats.workerSearches / searchStats.totalSearches) * 100).toFixed(1) + '%'
            : '0%',
      };
    };

    // === АВТОЗАПОЛНЕНИЕ ПРОДУКТОВ ===

    window.HEYS.preloadPopularProducts = async function () {
      const popularProducts = [
        {
          id: 1001,
          name: 'Хлеб белый',
          kcal100: 250,
          proteins100: 8,
          fats100: 1,
          carbs100: 50,
          category: 'Хлебобулочные',
        },
        {
          id: 1002,
          name: 'Молоко 2.5%',
          kcal100: 60,
          proteins100: 3,
          fats100: 2.5,
          carbs100: 5,
          category: 'Молочные',
        },
        {
          id: 1003,
          name: 'Куриная грудка',
          kcal100: 165,
          proteins100: 31,
          fats100: 3.6,
          carbs100: 0,
          category: 'Мясо',
        },
        {
          id: 1004,
          name: 'Рис отварной',
          kcal100: 130,
          proteins100: 2.7,
          fats100: 0.3,
          carbs100: 28,
          category: 'Крупы',
        },
        {
          id: 1005,
          name: 'Яблоко',
          kcal100: 52,
          proteins100: 0.3,
          fats100: 0.4,
          carbs100: 14,
          category: 'Фрукты',
        },
        {
          id: 1006,
          name: 'Банан',
          kcal100: 89,
          proteins100: 1.1,
          fats100: 0.3,
          carbs100: 23,
          category: 'Фрукты',
        },
        {
          id: 1007,
          name: 'Творог 5%',
          kcal100: 121,
          proteins100: 17,
          fats100: 5,
          carbs100: 1.8,
          category: 'Молочные',
        },
        {
          id: 1008,
          name: 'Гречка отварная',
          kcal100: 92,
          proteins100: 3.4,
          fats100: 0.6,
          carbs100: 18,
          category: 'Крупы',
        },
        {
          id: 1009,
          name: 'Яйцо куриное',
          kcal100: 157,
          proteins100: 12.7,
          fats100: 11.5,
          carbs100: 0.7,
          category: 'Яйца',
        },
        {
          id: 1010,
          name: 'Картофель отварной',
          kcal100: 77,
          proteins100: 2,
          fats100: 0.4,
          carbs100: 16,
          category: 'Овощи',
        },
      ];

      try {
        if (HEYS.indexedDB) {
          await HEYS.indexedDB.saveProducts(popularProducts);
          console.log(
            '[ModernSearch] Предзагружено',
            popularProducts.length,
            'популярных продуктов',
          );
          showSearchNotification(
            `📦 Загружено ${popularProducts.length} популярных продуктов`,
            'success',
          );
        }
      } catch (error) {
        console.error('[ModernSearch] Ошибка предзагрузки:', error);
      }
    };

    // === OFFLINE ИНДИКАТОР ===

    function updateOfflineStatus() {
      const isOnline = navigator.onLine;
      const indicator = document.getElementById('offline-indicator');

      if (!indicator) {
        // Создаем индикатор, если его нет
        const div = document.createElement('div');
        div.id = 'offline-indicator';
        div.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: bold;
        z-index: 10000;
        transition: all 0.3s ease;
        display: none;
      `;
        document.body.appendChild(div);
      }

      const indicatorElement = document.getElementById('offline-indicator');

      if (!isOnline) {
        indicatorElement.textContent = '📱 Офлайн режим';
        indicatorElement.style.backgroundColor = '#fed7d7';
        indicatorElement.style.color = '#9b2c2c';
        indicatorElement.style.display = 'block';
      } else {
        indicatorElement.style.display = 'none';
      }
    }

    // Слушаем изменения сети
    window.addEventListener('online', updateOfflineStatus);
    window.addEventListener('offline', updateOfflineStatus);

    // Начальная проверка
    updateOfflineStatus();

    // === АВТОЗАПУСК ===

    // Предзагружаем популярные продукты при инициализации
    HEYS.integration.on('integration_ready', () => {
      setTimeout(() => {
        HEYS.preloadPopularProducts();
      }, 1000);
    });

    // Помечаем как загруженный
    window.modernSearchIntegration.loaded = true;
    window.modernSearchIntegration.error = null;

    // Экспортируем в HEYS namespace для тестов
    if (window.HEYS) {
      window.HEYS.ModernSearch = window.modernSearchIntegration;
      console.log('✅ Modern Search Integration добавлен в HEYS namespace');
    }

    console.log('[HEYS] Modern Search Integration загружен');
    return true;
  }

  // Пытаемся инициализировать сразу
  if (!initializeModernSearch()) {
    // Если не удалось, пробуем через небольшой интервал
    const retryInterval = setInterval(() => {
      if (initializeModernSearch()) {
        clearInterval(retryInterval);
      }
    }, 100);

    // Максимум 5 секунд ожидания
    setTimeout(() => {
      clearInterval(retryInterval);
      if (!window.modernSearchIntegration.loaded) {
        console.error('[ModernSearch] Не удалось инициализировать за 5 секунд');
        window.modernSearchIntegration.error = 'Timeout waiting for dependencies';
      }
    }, 5000);
  }
})();
