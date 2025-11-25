// heys_storage_indexeddb_v1.js — Modern IndexedDB storage for HEYS

(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Версия схемы базы данных
  const DB_VERSION = 1;
  const DB_NAME = 'heys-storage';
  
  class IndexedDBStorage {
    constructor() {
      this.db = null;
      this.isReady = false;
      this.initPromise = null;
    }
    
    // Инициализация базы данных
    async init() {
      if (this.initPromise) return this.initPromise;
      
      this.initPromise = new Promise((resolve, reject) => {
        console.log('[IndexedDB] Инициализация базы данных...');
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => {
          console.error('[IndexedDB] Ошибка открытия базы:', request.error);
          reject(request.error);
        };
        
        request.onsuccess = () => {
          this.db = request.result;
          this.isReady = true;
          console.log('[IndexedDB] База данных готова');
          resolve(this.db);
        };
        
        request.onupgradeneeded = (event) => {
          console.log('[IndexedDB] Создание схемы базы данных...');
          const db = event.target.result;
          this.createSchema(db);
        };
      });
      
      return this.initPromise;
    }
    
    // Создание схемы базы данных
    createSchema(db) {
      // Таблица продуктов
      if (!db.objectStoreNames.contains('products')) {
        const productsStore = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
        productsStore.createIndex('name', 'name', { unique: false });
        productsStore.createIndex('nameSearch', 'nameSearch', { unique: false });
        productsStore.createIndex('barcode', 'barcode', { unique: true });
        productsStore.createIndex('category', 'category', { unique: false });
        productsStore.createIndex('kcal100', 'kcal100', { unique: false });
        console.log('[IndexedDB] Создана таблица products');
      }
      
      // Таблица дней питания
      if (!db.objectStoreNames.contains('days')) {
        const daysStore = db.createObjectStore('days', { keyPath: 'date' });
        daysStore.createIndex('userId', 'userId', { unique: false });
        daysStore.createIndex('totalKcal', 'totalKcal', { unique: false });
        daysStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[IndexedDB] Создана таблица days');
      }
      
      // Кеш поиска
      if (!db.objectStoreNames.contains('searchCache')) {
        const cacheStore = db.createObjectStore('searchCache', { keyPath: 'query' });
        cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
        cacheStore.createIndex('hits', 'hits', { unique: false });
        console.log('[IndexedDB] Создана таблица searchCache');
      }
      
      // Очередь синхронизации (для offline)
      if (!db.objectStoreNames.contains('pendingSync')) {
        const syncStore = db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('type', 'type', { unique: false });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncStore.createIndex('priority', 'priority', { unique: false });
        console.log('[IndexedDB] Создана таблица pendingSync');
      }
      
      // Статистический кеш
      if (!db.objectStoreNames.contains('statsCache')) {
        const statsStore = db.createObjectStore('statsCache', { keyPath: 'key' });
        statsStore.createIndex('timestamp', 'timestamp', { unique: false });
        statsStore.createIndex('type', 'type', { unique: false });
        console.log('[IndexedDB] Создана таблица statsCache');
      }
    }
    
    // === ПРОДУКТЫ ===
    
    // Сохранение продуктов (массовое)
    async saveProducts(products) {
      await this.ensureReady();
      
      const tx = this.db.transaction(['products'], 'readwrite');
      const store = tx.objectStore('products');
      
      for (const product of products) {
        // Добавляем поле для поиска (нижний регистр)
        product.nameSearch = product.name.toLowerCase();
        await store.put(product);
      }
      
      await tx.complete;
      console.log(`[IndexedDB] Сохранено ${products.length} продуктов`);
    }
    
    // Быстрый поиск продуктов
    async searchProducts(query, limit = 20) {
      await this.ensureReady();
      
      // Проверяем кеш поиска
      const cached = await this.getSearchCache(query);
      if (cached) {
        console.log('[IndexedDB] Поиск из кеша:', query);
        return cached.results;
      }
      
      const searchQuery = query.toLowerCase();
      const tx = this.db.transaction(['products'], 'readonly');
      const index = tx.objectStore('products').index('nameSearch');
      
      const results = [];
      const range = IDBKeyRange.bound(searchQuery, searchQuery + '\uffff');
      
      for await (const cursor of this.iterateIndex(index, range)) {
        if (cursor.value.nameSearch.includes(searchQuery)) {
          results.push(cursor.value);
          if (results.length >= limit) break;
        }
      }
      
      // Сохраняем в кеш
      await this.saveSearchCache(query, results);
      
      console.log(`[IndexedDB] Найдено ${results.length} продуктов для "${query}"`);
      return results;
    }
    
    // Получение продукта по штрих-коду
    async getProductByBarcode(barcode) {
      await this.ensureReady();
      
      const tx = this.db.transaction(['products'], 'readonly');
      const index = tx.objectStore('products').index('barcode');
      const product = await index.get(barcode);
      
      return product;
    }
    
    // === ДНИ ПИТАНИЯ ===
    
    // Сохранение дня
    async saveDay(dayData) {
      await this.ensureReady();
      
      // Добавляем timestamp
      dayData.timestamp = Date.now();
      dayData.syncStatus = 'pending';
      
      const tx = this.db.transaction(['days', 'pendingSync'], 'readwrite');
      
      // Сохраняем день
      await tx.objectStore('days').put(dayData);
      
      // Добавляем в очередь синхронизации
      await tx.objectStore('pendingSync').add({
        type: 'day_update',
        data: dayData,
        timestamp: Date.now(),
        priority: 1
      });
      
      await tx.complete;
      console.log('[IndexedDB] День сохранен:', dayData.date);
    }
    
    // Получение дня
    async getDay(date) {
      await this.ensureReady();
      
      const tx = this.db.transaction(['days'], 'readonly');
      const day = await tx.objectStore('days').get(date);
      
      return day;
    }
    
    // Получение диапазона дней
    async getDaysRange(startDate, endDate) {
      await this.ensureReady();
      
      const tx = this.db.transaction(['days'], 'readonly');
      const store = tx.objectStore('days');
      const range = IDBKeyRange.bound(startDate, endDate);
      
      const days = [];
      for await (const cursor of this.iterateStore(store, range)) {
        days.push(cursor.value);
      }
      
      console.log(`[IndexedDB] Загружено ${days.length} дней с ${startDate} по ${endDate}`);
      return days;
    }
    
    // === КЕШИРОВАНИЕ ===
    
    // Сохранение кеша поиска
    async saveSearchCache(query, results) {
      await this.ensureReady();
      
      const cacheEntry = {
        query: query,
        results: results,
        timestamp: Date.now(),
        hits: 1
      };
      
      const tx = this.db.transaction(['searchCache'], 'readwrite');
      await tx.objectStore('searchCache').put(cacheEntry);
      await tx.complete;
    }
    
    // Получение кеша поиска
    async getSearchCache(query) {
      await this.ensureReady();
      
      const tx = this.db.transaction(['searchCache'], 'readonly');
      const cached = await tx.objectStore('searchCache').get(query);
      
      // Проверяем актуальность (24 часа)
      if (cached && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
        // Увеличиваем счетчик хитов
        cached.hits++;
        const updateTx = this.db.transaction(['searchCache'], 'readwrite');
        await updateTx.objectStore('searchCache').put(cached);
        await updateTx.complete;
        
        return cached;
      }
      
      return null;
    }
    
    // Сохранение статистического кеша
    async saveStatsCache(key, data, type = 'general') {
      await this.ensureReady();
      
      const cacheEntry = {
        key: key,
        data: data,
        type: type,
        timestamp: Date.now()
      };
      
      const tx = this.db.transaction(['statsCache'], 'readwrite');
      await tx.objectStore('statsCache').put(cacheEntry);
      await tx.complete;
      
      console.log('[IndexedDB] Статистика кеширована:', key);
    }
    
    // Получение статистического кеша
    async getStatsCache(key, maxAge = 60 * 60 * 1000) { // 1 час по умолчанию
      await this.ensureReady();
      
      const tx = this.db.transaction(['statsCache'], 'readonly');
      const cached = await tx.objectStore('statsCache').get(key);
      
      if (cached && (Date.now() - cached.timestamp < maxAge)) {
        console.log('[IndexedDB] Статистика из кеша:', key);
        return cached.data;
      }
      
      return null;
    }
    
    // === OFFLINE СИНХРОНИЗАЦИЯ ===
    
    // Получение ожидающих синхронизации записей
    async getPendingSync() {
      await this.ensureReady();
      
      const tx = this.db.transaction(['pendingSync'], 'readonly');
      const store = tx.objectStore('pendingSync');
      
      const pending = [];
      for await (const cursor of this.iterateStore(store)) {
        pending.push(cursor.value);
      }
      
      return pending.sort((a, b) => b.priority - a.priority);
    }
    
    // Удаление синхронизированной записи
    async removeSynced(id) {
      await this.ensureReady();
      
      const tx = this.db.transaction(['pendingSync'], 'readwrite');
      await tx.objectStore('pendingSync').delete(id);
      await tx.complete;
    }
    
    // === УТИЛИТЫ ===
    
    // Проверка готовности
    async ensureReady() {
      if (!this.isReady) {
        await this.init();
      }
    }
    
    // Итератор для store
    async* iterateStore(store, range = null) {
      const request = range ? store.openCursor(range) : store.openCursor();
      
      while (true) {
        const cursor = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        
        if (!cursor) break;
        yield cursor;
        cursor.continue();
      }
    }
    
    // Итератор для index
    async* iterateIndex(index, range = null) {
      const request = range ? index.openCursor(range) : index.openCursor();
      
      while (true) {
        const cursor = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        
        if (!cursor) break;
        yield cursor;
        cursor.continue();
      }
    }
    
    // Получение статистики базы данных
    async getDBStats() {
      await this.ensureReady();
      
      const stats = {};
      const storeNames = ['products', 'days', 'searchCache', 'pendingSync', 'statsCache'];
      
      for (const storeName of storeNames) {
        const tx = this.db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const count = await store.count();
        stats[storeName] = count;
      }
      
      console.log('[IndexedDB] Статистика базы:', stats);
      return stats;
    }
    
    // Очистка устаревших кешей
    async cleanupCaches() {
      await this.ensureReady();
      
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;
      
      // Очистка кеша поиска (старше 7 дней)
      const searchTx = this.db.transaction(['searchCache'], 'readwrite');
      const searchStore = searchTx.objectStore('searchCache');
      const searchIndex = searchStore.index('timestamp');
      const searchRange = IDBKeyRange.upperBound(now - 7 * dayInMs);
      
      let deletedSearches = 0;
      for await (const cursor of this.iterateIndex(searchIndex, searchRange)) {
        await cursor.delete();
        deletedSearches++;
      }
      
      await searchTx.complete;
      
      // Очистка статистического кеша (старше 30 дней)
      const statsTx = this.db.transaction(['statsCache'], 'readwrite');
      const statsStore = statsTx.objectStore('statsCache');
      const statsIndex = statsStore.index('timestamp');
      const statsRange = IDBKeyRange.upperBound(now - 30 * dayInMs);
      
      let deletedStats = 0;
      for await (const cursor of this.iterateIndex(statsIndex, statsRange)) {
        await cursor.delete();
        deletedStats++;
      }
      
      await statsTx.complete;
      
      console.log(`[IndexedDB] Очистка кешей: ${deletedSearches} поисков, ${deletedStats} статистик`);
    }
  }
  
  // Создаем глобальный экземпляр
  const indexedDBStorage = new IndexedDBStorage();
  
  // Экспортируем в HEYS namespace
  HEYS.indexedDB = {
    init: () => indexedDBStorage.init(),
    
    // Продукты
    saveProducts: (products) => indexedDBStorage.saveProducts(products),
    searchProducts: (query, limit) => indexedDBStorage.searchProducts(query, limit),
    getProductByBarcode: (barcode) => indexedDBStorage.getProductByBarcode(barcode),
    
    // Дни
    saveDay: (dayData) => indexedDBStorage.saveDay(dayData),
    getDay: (date) => indexedDBStorage.getDay(date),
    getDaysRange: (start, end) => indexedDBStorage.getDaysRange(start, end),
    
    // Кеширование
    saveStatsCache: (key, data, type) => indexedDBStorage.saveStatsCache(key, data, type),
    getStatsCache: (key, maxAge) => indexedDBStorage.getStatsCache(key, maxAge),
    
    // Синхронизация
    getPendingSync: () => indexedDBStorage.getPendingSync(),
    removeSynced: (id) => indexedDBStorage.removeSynced(id),
    
    // Утилиты
    getStats: () => indexedDBStorage.getDBStats(),
    cleanup: () => indexedDBStorage.cleanupCaches(),
    
    // Прямой доступ к экземпляру
    _instance: indexedDBStorage
  };
  
  console.log('[HEYS] IndexedDB storage загружен');
  
})(window);
