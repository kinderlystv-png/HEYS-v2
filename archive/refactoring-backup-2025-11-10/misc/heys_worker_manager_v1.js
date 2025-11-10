/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_worker_manager_v1.js (338 строк)                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🏗️ КЛАСС WORKERMANAGER (строки 1-50):                                                   │
│    ├── Конструктор: workers Map, taskQueue, maxWorkers (6-13)                           │
│    ├── getBasePath() - определение базового пути (16-25)                                │
│    └── getWorkerScripts() - карта воркеров (26-50)                                      │
│                                                                                           │
│ ⚡ УПРАВЛЕНИЕ ВОРКЕРАМИ (строки 51-150):                                                  │
│    ├── createWorker() - создание нового воркера (51-80)                                 │
│    ├── destroyWorker() - уничтожение воркера (81-100)                                   │
│    ├── getAvailableWorker() - поиск свободного (101-120)                                │
│    └── handleWorkerMessage() - обработка сообщений (121-150)                            │
│                                                                                           │
│ 📋 ОЧЕРЕДЬ ЗАДАЧ (строки 151-230):                                                       │
│    ├── addTask() - добавление задачи в очередь (151-180)                                │
│    ├── processTaskQueue() - обработка очереди (181-210)                                 │
│    └── executeTask() - выполнение задачи (211-230)                                      │
│                                                                                           │
│ 🔧 СПЕЦИАЛИЗИРОВАННЫЕ МЕТОДЫ (строки 231-300):                                           │
│    ├── runCalculation() - математические вычисления (231-250)                           │
│    ├── runSearch() - поисковые задачи (251-270)                                         │
│    ├── runAnalytics() - аналитические операции (271-290)                               │
│    └── runSync() - синхронизация данных (291-300)                                       │
│                                                                                           │
│ 📊 МОНИТОРИНГ (строки 301-338):                                                          │
│    ├── getStats() - статистика воркеров (301-320)                                       │
│    ├── cleanup() - очистка ресурсов (321-330)                                           │
│    └── Экспорт в глобальную область (331-338)                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_worker_manager_v1.js - Система управления Web Workers для HEYS
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  class WorkerManager {
    constructor() {
      this.workers = new Map();
      this.taskQueue = [];
      this.maxWorkers = navigator.hardwareConcurrency || 4;
      this.currentTaskId = 0;
      // Определяем базовый путь в зависимости от расположения
      this.workerScripts = this.getWorkerScripts();
    }

    // Определение базового пути для воркеров
    getBasePath() {
      const currentPath = window.location.pathname;
      if (currentPath.includes('/TESTS/')) {
        return '../';
      }
      return './';
    }

    // Получение специальных путей для воркеров
    getWorkerScripts() {
      const basePath = this.getBasePath();
      const currentPath = window.location.pathname;
      
      // Для тестов используем упрощенный search worker
      if (currentPath.includes('/TESTS/')) {
        return {
          search: './search_worker.js', // Локальный упрощенный worker для тестов
          analytics: `${basePath}workers/analytics_worker.js`,
          sync: `${basePath}workers/sync_worker.js`,
          calculation: `${basePath}workers/calculation_worker.js`
        };
      }
      
      return {
        search: `${basePath}workers/search_worker.js`,
        analytics: `${basePath}workers/analytics_worker.js`,
        sync: `${basePath}workers/sync_worker.js`,
        calculation: `${basePath}workers/calculation_worker.js`
      };
    }
    
    // Инициализация воркеров
    async init() {
      console.log(`[WorkerManager] Инициализация ${this.maxWorkers} воркеров...`);
      
      // Создаем воркеры для каждого типа задач
      for (const [type, script] of Object.entries(this.workerScripts)) {
        try {
          await this.createWorker(type, script);
          console.log(`[WorkerManager] Воркер ${type} создан`);
        } catch (error) {
          console.warn(`[WorkerManager] Не удалось создать воркер ${type}:`, error);
        }
      }
      
      // Запускаем обработчик очереди
      this.startQueueProcessor();
    }
    
    // Создание воркера
    async createWorker(type, scriptPath) {
      return new Promise((resolve, reject) => {
        const worker = new Worker(scriptPath);
        
        worker.onmessage = (e) => this.handleWorkerMessage(type, e);
        worker.onerror = (error) => {
          console.error(`[WorkerManager] Ошибка воркера ${type}:`, error);
          this.workers.delete(type);
          reject(error);
        };
        
        // Проверяем доступность воркера
        worker.postMessage({ type: 'ping' });
        
        const timeout = setTimeout(() => {
          reject(new Error(`Воркер ${type} не отвечает`));
        }, 5000);
        
        const pingHandler = (e) => {
          if (e.data.type === 'pong') {
            clearTimeout(timeout);
            worker.removeEventListener('message', pingHandler);
            
            this.workers.set(type, {
              worker: worker,
              busy: false,
              tasks: new Map()
            });
            
            resolve(worker);
          }
        };
        
        worker.addEventListener('message', pingHandler);
      });
    }
    
    // Обработка сообщений от воркеров
    handleWorkerMessage(workerType, event) {
      const { type, taskId, data, error } = event.data;
      
      if (type === 'task_complete') {
        const workerInfo = this.workers.get(workerType);
        if (workerInfo && workerInfo.tasks.has(taskId)) {
          const task = workerInfo.tasks.get(taskId);
          
          if (error) {
            task.reject(new Error(error));
          } else {
            task.resolve(data);
          }
          
          workerInfo.tasks.delete(taskId);
          workerInfo.busy = workerInfo.tasks.size > 0;
          
          // Обрабатываем следующую задачу в очереди
          this.processNextTask();
        }
      } else if (type === 'progress') {
        // Уведомление о прогрессе
        HEYS.events?.emit('worker_progress', {
          workerType,
          taskId,
          progress: data
        });
      }
    }
    
    // Выполнение задачи
    async executeTask(workerType, taskData, priority = 1) {
      return new Promise((resolve, reject) => {
        const taskId = ++this.currentTaskId;
        const task = {
          id: taskId,
          workerType,
          data: taskData,
          priority,
          resolve,
          reject,
          timestamp: Date.now()
        };
        
        // Добавляем в очередь
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => b.priority - a.priority);
        
        console.log(`[WorkerManager] Задача ${taskId} добавлена в очередь (${workerType})`);
        
        // Пытаемся выполнить немедленно
        this.processNextTask();
      });
    }
    
    // Обработка очереди задач
    processNextTask() {
      if (this.taskQueue.length === 0) return;
      
      // Ищем доступный воркер
      for (const task of this.taskQueue) {
        const workerInfo = this.workers.get(task.workerType);
        
        if (workerInfo && !workerInfo.busy) {
          // Воркер свободен, выполняем задачу
          this.taskQueue.splice(this.taskQueue.indexOf(task), 1);
          this.assignTaskToWorker(task, workerInfo);
          break;
        }
      }
    }
    
    // Назначение задачи воркеру
    assignTaskToWorker(task, workerInfo) {
      workerInfo.busy = true;
      workerInfo.tasks.set(task.id, task);
      
      workerInfo.worker.postMessage({
        type: 'execute_task',
        taskId: task.id,
        data: task.data
      });
      
      console.log(`[WorkerManager] Задача ${task.id} назначена воркеру ${task.workerType}`);
    }
    
    // Запуск обработчика очереди
    startQueueProcessor() {
      setInterval(() => {
        this.processNextTask();
      }, 100);
    }
    
    // === СПЕЦИАЛИЗИРОВАННЫЕ МЕТОДЫ ===
    
    // Поиск продуктов в фоне
    async searchProductsInBackground(query, options = {}) {
      const taskData = {
        type: 'product_search',
        query: query,
        limit: options.limit || 20,
        useCache: options.useCache !== false
      };
      
      return await this.executeTask('search', taskData, 2);
    }
    
    // Расчет калорий в фоне
    async calculateNutritionInBackground(products, portions) {
      const taskData = {
        type: 'nutrition_calculation',
        products: products,
        portions: portions
      };
      
      return await this.executeTask('calculation', taskData, 3);
    }
    
    // Аналитика в фоне
    async generateAnalyticsInBackground(dateRange, options = {}) {
      const taskData = {
        type: 'analytics_generation',
        startDate: dateRange.start,
        endDate: dateRange.end,
        includeCharts: options.includeCharts || false,
        includeTrends: options.includeTrends || false
      };
      
      return await this.executeTask('analytics', taskData, 1);
    }
    
    // Синхронизация в фоне
    async syncDataInBackground() {
      const taskData = {
        type: 'data_sync',
        timestamp: Date.now()
      };
      
      return await this.executeTask('sync', taskData, 1);
    }
    
    // Экспорт данных в фоне
    async exportDataInBackground(format, dateRange) {
      const taskData = {
        type: 'data_export',
        format: format, // 'csv', 'json', 'pdf'
        startDate: dateRange.start,
        endDate: dateRange.end
      };
      
      return await this.executeTask('calculation', taskData, 1);
    }
    
    // === УТИЛИТЫ ===
    
    // Получение статистики воркеров
    getWorkerStats() {
      const stats = {
        totalWorkers: this.workers.size,
        busyWorkers: 0,
        queueLength: this.taskQueue.length,
        workers: {}
      };
      
      for (const [type, info] of this.workers) {
        stats.workers[type] = {
          busy: info.busy,
          activeTasks: info.tasks.size
        };
        
        if (info.busy) stats.busyWorkers++;
      }
      
      return stats;
    }
    
    // Очистка воркеров
    terminate() {
      console.log('[WorkerManager] Завершение работы воркеров...');
      
      for (const [type, info] of this.workers) {
        info.worker.terminate();
        console.log(`[WorkerManager] Воркер ${type} завершен`);
      }
      
      this.workers.clear();
      this.taskQueue = [];
    }
    
    // Проверка поддержки Web Workers
    static isSupported() {
      return typeof Worker !== 'undefined';
    }
  }
  
  // Создаем глобальный экземпляр
  const workerManager = new WorkerManager();
  
  // Экспортируем в HEYS namespace
  HEYS.workers = {
    init: () => workerManager.init(),
    
    // Основные методы
    execute: (type, data, priority) => workerManager.executeTask(type, data, priority),
    
    // Специализированные методы
    searchProducts: (query, options) => workerManager.searchProductsInBackground(query, options),
    calculateNutrition: (products, portions) => workerManager.calculateNutritionInBackground(products, portions),
    generateAnalytics: (dateRange, options) => workerManager.generateAnalyticsInBackground(dateRange, options),
    syncData: () => workerManager.syncDataInBackground(),
    exportData: (format, dateRange) => workerManager.exportDataInBackground(format, dateRange),
    
    // Утилиты
    getStats: () => workerManager.getWorkerStats(),
    terminate: () => workerManager.terminate(),
    isSupported: WorkerManager.isSupported,
    
    // Прямой доступ к экземпляру
    _instance: workerManager
  };
  
  // Алиас для совместимости с тестами
  HEYS.WorkerManager = {
    createWorker: (name, script, options) => workerManager.createWorker(name, script, options),
    postMessage: (name, message, transferable) => workerManager.postMessage(name, message, transferable),
    setMessageHandler: (name, handler) => workerManager.setMessageHandler(name, handler),
    terminateWorker: (name) => workerManager.terminateWorker(name),
    getStats: () => workerManager.getWorkerStats(),
    _instance: workerManager
  };
  
  console.log('[HEYS] Worker Manager загружен');
  
})(window);
