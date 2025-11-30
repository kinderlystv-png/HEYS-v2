// heys_storage_supabase_v1.js — Supabase bridge, auth, cloud sync, localStorage mirroring

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const cloud = HEYS.cloud = HEYS.cloud || {};

  // ═══════════════════════════════════════════════════════════════════
  // 🔧 КОНСТАНТЫ
  // ═══════════════════════════════════════════════════════════════════
  
  /** Префиксы ключей для зеркалирования в cloud */
  const KEY_PREFIXES = {
    HEYS: 'heys_',
    DAY: 'day'
  };
  
  /** Ключи, требующие client-specific storage */
  const CLIENT_SPECIFIC_KEYS = [
    'heys_products',
    'heys_profile',
    'heys_hr_zones',
    'heys_norms'
  ];
  
  /** Префиксы для client-specific данных */
  const CLIENT_KEY_PATTERNS = {
    DAY_V2: 'dayv2_',
    HEYS_CLIENT: 'heys_',
    DAY_CLIENT: 'day_'
  };
  
  /** Возможные статусы подключения */
  const CONNECTION_STATUS = {
    OFFLINE: 'offline',
    SIGNIN: 'signin',
    SYNC: 'sync',
    ONLINE: 'online'
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🌐 ГЛОБАЛЬНОЕ СОСТОЯНИЕ
  // ═══════════════════════════════════════════════════════════════════
  
  let client = null;
  cloud.client = null;
  let status = CONNECTION_STATUS.OFFLINE;
  let user = null;
  let muteMirror = false;
  
  // Оригинальный setItem (до перехвата) — для safeSetItem
  let originalSetItem = null;
  
  // 🚨 Флаг блокировки сохранения до завершения первого sync
  let initialSyncCompleted = false;
  cloud.isInitialSyncCompleted = function() { return initialSyncCompleted; };

  // ═══════════════════════════════════════════════════════════════════
  // 📦 ПЕРСИСТЕНТНАЯ ОЧЕРЕДЬ СИНХРОНИЗАЦИИ
  // ═══════════════════════════════════════════════════════════════════
  
  const PENDING_QUEUE_KEY = 'heys_pending_sync_queue';
  const PENDING_CLIENT_QUEUE_KEY = 'heys_pending_client_sync_queue';
  
  // ═══════════════════════════════════════════════════════════════════
  // 🧹 QUOTA MANAGEMENT — ЗАЩИТА ОТ ПЕРЕПОЛНЕНИЯ STORAGE
  // ═══════════════════════════════════════════════════════════════════
  
  const MAX_STORAGE_MB = 4.5; // Лимит ~5MB, оставляем запас
  const OLD_DATA_DAYS = 90; // Удаляем данные старше 90 дней
  
  /** Получить размер localStorage в MB */
  function getStorageSize() {
    try {
      let total = 0;
      for (let key in global.localStorage) {
        if (global.localStorage.hasOwnProperty(key)) {
          total += (global.localStorage.getItem(key) || '').length * 2; // UTF-16
        }
      }
      return total / 1024 / 1024;
    } catch (e) {
      return 0;
    }
  }
  
  /** Получить дату из ключа dayv2_YYYY-MM-DD */
  function getDateFromDayKey(key) {
    const match = key.match(/dayv2_(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return new Date(match[1]);
    }
    return null;
  }
  
  /** Очистить старые данные для освобождения места */
  function cleanupOldData(daysToKeep = OLD_DATA_DAYS) {
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() - daysToKeep * 24 * 60 * 60 * 1000);
      let cleaned = 0;
      
      // Собираем ключи для удаления
      const keysToRemove = [];
      for (let i = 0; i < global.localStorage.length; i++) {
        const key = global.localStorage.key(i);
        if (key && key.includes('dayv2_')) {
          const date = getDateFromDayKey(key);
          if (date && date < cutoff) {
            keysToRemove.push(key);
          }
        }
      }
      
      // Удаляем старые данные
      keysToRemove.forEach(key => {
        global.localStorage.removeItem(key);
        cleaned++;
      });
      
      if (cleaned > 0) {
        logCritical(`🧹 Очищено ${cleaned} старых записей (>${daysToKeep} дней)`);
      }
      
      return cleaned;
    } catch (e) {
      return 0;
    }
  }
  
  /** Агрессивная очистка при критическом переполнении */
  function aggressiveCleanup() {
    logCritical('🚨 Агрессивная очистка storage...');
    
    // 1. Удаляем данные старше 30 дней
    cleanupOldData(30);
    
    // 2. Удаляем debug/temp ключи
    const tempKeys = [];
    for (let i = 0; i < global.localStorage.length; i++) {
      const key = global.localStorage.key(i);
      if (key && (key.includes('_debug') || key.includes('_temp') || key.includes('_cache'))) {
        tempKeys.push(key);
      }
    }
    tempKeys.forEach(k => global.localStorage.removeItem(k));
    
    // 3. Показываем размер после очистки
    const sizeMB = getStorageSize();
    logCritical(`📊 Размер после очистки: ${sizeMB.toFixed(2)} MB`);
  }
  
  /** Безопасная запись в localStorage с обработкой QuotaExceeded */
  function safeSetItem(key, value) {
    // Используем оригинальный setItem если доступен (избегаем рекурсии через перехват)
    const setFn = originalSetItem || global.localStorage.setItem.bind(global.localStorage);
    
    try {
      setFn(key, value);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        // Пробуем очистить старые данные
        logCritical('⚠️ localStorage переполнен, очищаем старые данные...');
        cleanupOldData();
        
        // Пробуем ещё раз
        try {
          setFn(key, value);
          return true;
        } catch (e2) {
          // Всё ещё не помещается — удаляем pending queues и sync log
          global.localStorage.removeItem(PENDING_QUEUE_KEY);
          global.localStorage.removeItem(PENDING_CLIENT_QUEUE_KEY);
          global.localStorage.removeItem(SYNC_LOG_KEY);
          
          try {
            setFn(key, value);
            return true;
          } catch (e3) {
            // Агрессивная очистка — удаляем старые дни за 30 дней вместо 90
            aggressiveCleanup();
            try {
              setFn(key, value);
              return true;
            } catch (e4) {
              logCritical('❌ Не удалось сохранить данные: storage критически переполнен');
              return false;
            }
          }
        }
      }
      return false;
    }
  }
  
  /** Загрузить очередь из localStorage */
  function loadPendingQueue(key) {
    try {
      const data = global.localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }
  
  /** Сохранить очередь в localStorage */
  function savePendingQueue(key, queue) {
    try {
      if (queue.length > 0) {
        safeSetItem(key, JSON.stringify(queue));
      } else {
        global.localStorage.removeItem(key);
      }
    } catch (e) {}
  }
  
  /** Получить количество ожидающих изменений */
  cloud.getPendingCount = function() {
    return clientUpsertQueue.length + upsertQueue.length;
  };
  
  /** Получить детализацию pending (для UI) */
  cloud.getPendingDetails = function() {
    const details = { days: 0, products: 0, profile: 0, other: 0 };
    
    const allItems = [...clientUpsertQueue, ...upsertQueue];
    allItems.forEach(item => {
      const k = item.k || '';
      if (k.includes('dayv2_')) details.days++;
      else if (k.includes('products')) details.products++;
      else if (k.includes('profile')) details.profile++;
      else details.other++;
    });
    
    return details;
  };
  
  /** Получить информацию о storage */
  cloud.getStorageInfo = function() {
    const sizeMB = getStorageSize();
    const usedPercent = Math.round((sizeMB / MAX_STORAGE_MB) * 100);
    return {
      sizeMB: sizeMB.toFixed(2),
      maxMB: MAX_STORAGE_MB,
      usedPercent,
      isNearLimit: usedPercent > 80
    };
  };
  
  /** Принудительная очистка старых данных */
  cloud.cleanupStorage = cleanupOldData;
  
  // ═══════════════════════════════════════════════════════════════════
  // 📜 SYNC HISTORY LOG — ЖУРНАЛ СИНХРОНИЗАЦИЙ
  // ═══════════════════════════════════════════════════════════════════
  
  const SYNC_LOG_KEY = 'heys_sync_log';
  const MAX_SYNC_LOG_ENTRIES = 50;
  
  /** Добавить запись в журнал синхронизации */
  function addSyncLogEntry(type, details) {
    try {
      const log = JSON.parse(global.localStorage.getItem(SYNC_LOG_KEY) || '[]');
      log.unshift({
        ts: Date.now(),
        type, // 'sync_ok' | 'sync_error' | 'offline' | 'online' | 'quota_error'
        details
      });
      // Ограничиваем размер лога
      if (log.length > MAX_SYNC_LOG_ENTRIES) {
        log.length = MAX_SYNC_LOG_ENTRIES;
      }
      global.localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(log));
    } catch (e) {}
  }
  
  /** Получить журнал синхронизации */
  cloud.getSyncLog = function() {
    try {
      return JSON.parse(global.localStorage.getItem(SYNC_LOG_KEY) || '[]');
    } catch (e) {
      return [];
    }
  };
  
  /** Очистить журнал синхронизации */
  cloud.clearSyncLog = function() {
    global.localStorage.removeItem(SYNC_LOG_KEY);
  };
  
  /** Событие для UI об изменении pending count */
  function notifyPendingChange() {
    const count = cloud.getPendingCount();
    const details = cloud.getPendingDetails();
    try {
      global.dispatchEvent(new CustomEvent('heys:pending-change', { 
        detail: { count, details } 
      }));
    } catch (e) {}
  }
  
  /** Событие: синхронизация восстановлена */
  function notifySyncRestored(syncedCount) {
    try {
      addSyncLogEntry('sync_ok', { count: syncedCount });
      global.dispatchEvent(new CustomEvent('heys:sync-restored', { 
        detail: { count: syncedCount } 
      }));
    } catch (e) {}
  }
  
  /** Событие: ошибка синхронизации */
  function notifySyncError(error) {
    try {
      addSyncLogEntry('sync_error', { error: error?.message || String(error) });
      global.dispatchEvent(new CustomEvent('heys:sync-error', { 
        detail: { error } 
      }));
    } catch (e) {}
  }
  
  /** Принудительный retry синхронизации */
  cloud.retrySync = function() {
    resetRetry();
    if (clientUpsertQueue.length > 0) {
      scheduleClientPush();
    }
    if (upsertQueue.length > 0) {
      schedulePush();
    }
    return cloud.getPendingCount();
  };

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 EXPONENTIAL BACKOFF ДЛЯ RETRY
  // ═══════════════════════════════════════════════════════════════════
  
  let retryAttempt = 0;
  const MAX_RETRY_ATTEMPTS = 5;
  const BASE_RETRY_DELAY = 1000; // 1 сек
  
  /** Вычислить задержку с exponential backoff */
  function getRetryDelay() {
    // 1s, 2s, 4s, 8s, 16s (max)
    return Math.min(BASE_RETRY_DELAY * Math.pow(2, retryAttempt), 16000);
  }
  
  /** Сбросить счётчик retry при успешной синхронизации */
  function resetRetry() {
    retryAttempt = 0;
  }
  
  /** Увеличить счётчик retry */
  function incrementRetry() {
    if (retryAttempt < MAX_RETRY_ATTEMPTS) {
      retryAttempt++;
    }
  }

  // Умное логирование: только критические операции
  // Включается через localStorage: localStorage.setItem('heys_debug_sync', 'true')
  const isDebugSync = () => global.localStorage.getItem('heys_debug_sync') === 'true';
  
  function log(){
    // Тихий режим по умолчанию
    if (isDebugSync()) {
      try{ console.log.apply(console, ['[HEYS.cloud]'].concat([].slice.call(arguments))); }catch(e){}
    }
  }
  function err(){ try{ console.error.apply(console, ['[HEYS.cloud:ERR]'].concat([].slice.call(arguments))); }catch(e){} }
  
  // Критический лог — всегда выводится (для важных событий синхронизации)
  function logCritical(){ try{ console.info.apply(console, ['[HEYS]'].concat([].slice.call(arguments))); }catch(e){} }

  /**
   * Обёртка для запросов с таймаутом
   * @param {Promise} promise - Promise для выполнения
   * @param {number} ms - Таймаут в миллисекундах (по умолчанию 10000)
   * @param {string} label - Метка для логирования ошибки
   * @returns {Promise} Результат или {error} при таймауте
   */
  async function withTimeout(promise, ms = 10000, label = 'request') {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout: ${label} took too long`)), ms)
    );
    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (e) {
      // Для bootstrapSync таймаут — это нормально при медленной сети, не критическая ошибка
      if (label.includes('bootstrap')) {
        console.warn(`[HEYS.cloud] ⏳ ${label}: медленная сеть, синхронизация продолжается...`);
      } else {
        err(`${label} timeout`, e.message);
      }
      return { data: null, error: { message: e.message } };
    }
  }

  /**
   * Безопасный парсинг JSON
   * @param {string} v - Строка для парсинга
   * @returns {*} Распарсенное значение или исходная строка при ошибке
   */
  function tryParse(v){ 
    try{
      return JSON.parse(v);
    }catch(e){ 
      return v; 
    } 
  }

  /**
   * Проверка, является ли ключ нашим (для зеркалирования/очистки)
   * @param {string} k - Ключ для проверки
   * @returns {boolean} true если это наш ключ
   */
  function isOurKey(k){
    if (typeof k !== 'string') return false;
    if (k.indexOf(KEY_PREFIXES.HEYS) === 0) return true;
    // также разрешаем ключи дней
    const lower = k.toLowerCase();
    if (lower.indexOf(KEY_PREFIXES.DAY) >= 0) return true;
    return false;
  }

  /**
   * Очистка namespace в localStorage (наши ключи)
   * @param {string} clientId - ID клиента для очистки специфичных ключей, или null для полной очистки
   */
  function clearNamespace(clientId){
    try{
      const ls = global.localStorage;
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (!k) continue;
        const lower = k.toLowerCase();
        
        if (clientId) {
          // Очистка только client-specific ключей
          const heysClientPrefix = (KEY_PREFIXES.HEYS + clientId + '_').toLowerCase();
          const dayClientPrefix = (CLIENT_KEY_PATTERNS.DAY_CLIENT + clientId + '_').toLowerCase();
          
          if (lower.indexOf(heysClientPrefix) === 0) { 
            ls.removeItem(k); 
            continue; 
          }
          if (lower.indexOf(dayClientPrefix) === 0) { 
            ls.removeItem(k); 
            continue; 
          }
          
          // Также очищаем общие ключи, которые должны быть client-specific
          if (CLIENT_SPECIFIC_KEYS.includes(k)) {
            ls.removeItem(k);
            continue;
          }
        } else {
          // Полная очистка всех наших ключей
          if (isOurKey(k)) ls.removeItem(k);
        }
      }
    }catch(e){ 
      err('clearNamespace', e); 
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 🔄 ПЕРЕХВАТ LOCALSTORAGE
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Проверка, требует ли ключ client-specific хранилища
   * @param {string} k - Ключ для проверки
   * @returns {boolean} true если нужен client_kv_store
   */
  function needsClientStorage(k) {
    if (!k) return false;
    // Проверяем дни пользователя
    if (k.includes(CLIENT_KEY_PATTERNS.DAY_V2)) return true;
    // Проверяем общие client-specific ключи
    return CLIENT_SPECIFIC_KEYS.includes(k);
  }
  
  /**
   * Перехват localStorage.setItem для автоматического зеркалирования в cloud
   * Зеркалирует наши ключи (heys_*, day*) в Supabase
   * Обрабатывает QuotaExceededError автоматической очисткой
   */
  function interceptSetItem(){
    try{
      if (originalSetItem) return; // Защита от повторного перехвата
      
      // Сохраняем оригинальный метод в глобальную переменную
      originalSetItem = global.localStorage.setItem.bind(global.localStorage);
      global.localStorage.setItem = function(k, v){
        // Используем безопасную запись с обработкой QuotaExceeded
        if (!safeSetItem(k, v)) {
          // Если не удалось сохранить даже после очистки — логируем
          console.warn('[HEYS] Не удалось сохранить:', k);
          return;
        }
        
        if (!muteMirror && isOurKey(k)){
          if (needsClientStorage(k)) {
            cloud.saveClientKey(k, tryParse(v));
          } else {
            cloud.saveKey(k, tryParse(v));
          }
        }
      };
    }catch(e){ 
      err('intercept setItem failed', e); 
    }
  }

  cloud.init = function({ url, anonKey }){
    // Idempotent init: avoid double creation & duplicate intercept logs
    if (cloud._inited) { return; }
    if (!global.supabase || !global.supabase.createClient){
      err('supabase-js не загружен');
      return;
    }
    try{
      client = global.supabase.createClient(url, anonKey);
      cloud.client = client;
      status = 'offline';
      interceptSetItem();
      cloud._inited = true;
      log('cloud bridge loaded');
    }catch(e){ err('init failed', e); }
  };

  cloud.signIn = async function(email, password){
    if (!client) { err('client not initialized'); return; }
    // Проверяем сеть перед попыткой входа
    if (!navigator.onLine) {
      status = 'offline';
      return { error: { message: 'Нет подключения к интернету' } };
    }
    try{
      status = 'signin';
      
      // Увеличен таймаут до 15 секунд для мобильных сетей
      const { data, error } = await withTimeout(
        client.auth.signInWithPassword({ email, password }),
        15000,
        'signIn'
      );
      
      if (error) { 
        status = 'offline'; 
        logCritical('❌ Ошибка входа:', error.message || error);
        return { error }; 
      }
      user = data?.user;
      if (!user) { status = 'offline'; err('no user after signin'); return { error: 'no user' }; }
      status = 'sync';
      await cloud.bootstrapSync();
      status = 'online';
      logCritical('✅ Вход выполнен:', user.email);
      return { user };
    }catch(e){
      status = 'offline';
      logCritical('❌ Ошибка входа (exception):', e.message || e);
      return { error: e };
    }
  };

  cloud.signOut = function(){
    if (client) client.auth.signOut();
    user = null;
    status = 'offline';
    clearNamespace();
    logCritical('🚪 Выход из системы');
  };

  cloud.getUser = function(){ return user; };
  cloud.getStatus = function(){ return status; };

  cloud.bootstrapSync = async function(){
    try{
      muteMirror = true;
      if (!client || !user) { muteMirror = false; return; }
      
      // Таймаут 20 секунд для медленных мобильных сетей
      const { data, error } = await withTimeout(
        client.from('kv_store').select('k,v,updated_at'),
        20000,
        'bootstrapSync'
      );
      
      if (error) { err('bootstrap select', error); muteMirror = false; return; }
      const ls = global.localStorage;
      // clear only global keys for full bootstrap (no clientId)
      clearNamespace();
      (data||[]).forEach(row => {
        try {
          const key = row.k;
          ls.setItem(key, JSON.stringify(row.v));
        } catch(e){}
      });
      muteMirror = false;
      // Убрано избыточное логирование bootstrap synced keys
    }catch(e){ err('bootstrap exception', e); muteMirror=false; }
  };

  cloud.bootstrapClientSync = async function(client_id){
    if (!client || !user || !client_id) return;
    
    // КРИТИЧЕСКАЯ ПРОВЕРКА: синхронизировать только текущего клиента
    let currentClientId = global.localStorage.getItem('heys_client_current');
    // Распарсить JSON если это строка в кавычках
    if (currentClientId) {
      try {
        currentClientId = JSON.parse(currentClientId);
      } catch(e) {
        // Уже простая строка, не JSON
      }
    }
    if (currentClientId && client_id !== currentClientId) {
      log('client bootstrap skipped (not current client)', client_id, 'current:', currentClientId);
      return;
    }
    
    const now = Date.now();
    
    // Увеличиваем throttling с 4 до 30 секунд для снижения нагрузки
    if (cloud._lastClientSync && cloud._lastClientSync.clientId === client_id && (now - cloud._lastClientSync.ts) < 30000){
      // Тихий пропуск throttled запросов
      return;
    }
    
    try{
      // Проверяем что клиент существует (без автосоздания)
      const _exists = await cloud.ensureClient(client_id);
      if (!_exists){
        log('client bootstrap skipped (no such client)', client_id);
        return;
      }
      
      // Проверяем, действительно ли нужна синхронизация
      // Сначала пробуем загрузить только метаданные для проверки
      // Увеличен таймаут до 10 секунд для мобильных сетей
      const { data: metaData, error: metaError } = await withTimeout(
        client
          .from('client_kv_store')
          .select('k,updated_at')
          .eq('client_id', client_id)
          .order('updated_at', { ascending: false })
          .limit(5),
        10000,
        'clientSync meta check'
      );
        
      if (metaError) { 
        err('client bootstrap meta check', metaError); 
        return; 
      }
      
      // Проверяем, изменились ли данные с последней синхронизации
      const lastSyncTime = cloud._lastClientSync?.ts || 0;
      const hasUpdates = (metaData || []).some(row => 
        new Date(row.updated_at).getTime() > lastSyncTime
      );
      
      if (!hasUpdates && cloud._lastClientSync?.clientId === client_id) {
        log('client bootstrap skipped (no updates)', client_id);
        cloud._lastClientSync.ts = now; // Обновляем timestamp для throttling
        return;
      }
      
      // Теперь загружаем полные данные только если есть обновления
      log('🔄 [CLIENT_SYNC] Loading data for client:', client_id);
      // Увеличен таймаут до 20 секунд для мобильных сетей
      const { data, error } = await withTimeout(
        client.from('client_kv_store').select('k,v,updated_at').eq('client_id', client_id),
        20000,
        'clientSync full data'
      );
      if (error) { err('client bootstrap select', error); return; }
      
      // Компактная статистика вместо 81 строки логов
      const stats = { DAY: 0, PRODUCTS: 0, PROFILE: 0, NORMS: 0, OTHER: 0 };
      (data||[]).forEach(row => {
        if (row.k === 'heys_products') stats.PRODUCTS++;
        else if (row.k.includes('dayv2_')) stats.DAY++;
        else if (row.k.includes('_profile')) stats.PROFILE++;
        else if (row.k.includes('_norms')) stats.NORMS++;
        else stats.OTHER++;
      });
      const summary = Object.entries(stats).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ');
      log(`✅ [CLIENT_SYNC] Loaded ${data?.length || 0} keys (${summary})`);
      
      const ls = global.localStorage;
      muteMirror = true;
      // ❌ КРИТИЧНО: НЕ ОЧИЩАЕМ ВСЁ ПРОСТРАНСТВО КЛИЕНТА
      // clearNamespace стирал все локальные данные, включая продукты!
      // Теперь просто перезаписываем только те ключи, что пришли с сервера
      
      (data||[]).forEach(row => {
        try {
          // row.k is stored in DB as the original key
          // For client-scoped keys like 'heys_products', we need to store them with client_id prefix
          let key = row.k;
          
          // Если ключ 'heys_products' (без client_id), добавляем client_id
          if (key === 'heys_products' || (key.startsWith('heys_') && !key.includes(client_id))) {
            // Преобразуем в scoped key для localStorage
            if (key.startsWith('heys_')) {
              key = 'heys_' + client_id + '_' + key.substring('heys_'.length);
            } else {
              key = 'heys_' + client_id + '_' + key;
            }
            log(`  📝 [MIGRATION] Mapped '${row.k}' → '${key}'`);
          }
          
          // Конфликт: если в локальном есть ревизия, сравнить и взять более свежую
          let local = null;
          try { local = JSON.parse(ls.getItem(key)); } catch(e){}
          let remoteRev = row.v && row.v.revision ? row.v.revision : 0;
          let localRev = local && local.revision ? local.revision : 0;
          if (localRev > remoteRev) {
            // локальная версия новее — не затираем
            log('conflict: keep local', key);
            return;
          }
          
          // ЗАЩИТА: не затираем локальные продукты пустым массивом из Supabase
          if (key.includes('_products')) {
            // Читаем актуальное локальное значение по scoped ключу
            let currentLocal = null;
            try { 
              const rawLocal = ls.getItem(key);
              if (rawLocal) currentLocal = JSON.parse(rawLocal);
            } catch(e) {}
            
            // КРИТИЧЕСКАЯ ЗАЩИТА: НЕ ЗАТИРАЕМ непустые продукты пустым массивом
            if (Array.isArray(row.v) && row.v.length === 0) {
              if (Array.isArray(currentLocal) && currentLocal.length > 0) {
                log(`⚠️ [PRODUCTS] BLOCKED: Refusing to overwrite ${currentLocal.length} local products with empty cloud array`);
                return; // Пропускаем сохранение
              } else {
                // Оба пусты - пытаемся восстановить из backup
                const backupKey = key.replace('_products', '_products_backup');
                const backupRaw = ls.getItem(backupKey);
                if (backupRaw) {
                  try {
                    const backupData = JSON.parse(backupRaw);
                    if (Array.isArray(backupData) && backupData.length > 0) {
                      log(`✅ [RECOVERY] Restored ${backupData.length} products from backup`);
                      ls.setItem(key, JSON.stringify(backupData));
                      muteMirror = false;
                      setTimeout(() => cloud.saveClientKey(client_id, 'heys_products', backupData), 500);
                      muteMirror = true;
                      return;
                    }
                  } catch(e) {}
                }
              }
            }
          }
          
          ls.setItem(key, JSON.stringify(row.v));
          log(`  ✅ Saved to localStorage: ${key}`);
          
          // Уведомляем приложение об обновлении продуктов
          if (key === 'heys_products' && row.v) {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('heysProductsUpdated', { detail: { products: row.v } }));
              }, 100);
            }
          }
        } catch(e){}
      });
      
      muteMirror = false;
      cloud._lastClientSync = { clientId: client_id, ts: now };
      
      // 🚨 Критический лог: первая синхронизация завершена
      if (!initialSyncCompleted) {
        logCritical('✅ Синхронизация завершена | клиент:', client_id.substring(0,8) + '...', '| ключей:', data?.length || 0);
      }
      
      // 🚨 Разрешаем сохранение после первого sync
      initialSyncCompleted = true;
      
      // Уведомляем приложение о завершении синхронизации (для обновления stepsGoal и т.д.)
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('heysSyncCompleted', { detail: { clientId: client_id } }));
        }, 50);
      }
    }catch(e){ 
      // Критический лог ошибки синхронизации (всегда видим)
      logCritical('❌ Ошибка синхронизации:', e.message || e);
      err('❌ [CLIENT_SYNC] Exception:', e); 
      muteMirror=false; 
    }
  };

  cloud.shouldSyncClient = function(client_id, maxAgeMs){
    if (!client_id) return false;
    const rec = cloud._lastClientSync;
    if (!rec || rec.clientId !== client_id) return true;
    return (Date.now() - rec.ts) > (maxAgeMs||4000);
  };

  // Дебаунсинг для клиентских данных
  let clientUpsertQueue = loadPendingQueue(PENDING_CLIENT_QUEUE_KEY);
  let clientUpsertTimer = null;
  
  function scheduleClientPush(){
    if (clientUpsertTimer) return;
    
    // Сохраняем очередь в localStorage для персистентности
    savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
    notifyPendingChange();
    
    const delay = navigator.onLine ? 500 : getRetryDelay();
    
    clientUpsertTimer = setTimeout(async () => {
      const batch = clientUpsertQueue.splice(0, clientUpsertQueue.length);
      clientUpsertTimer = null;
      if (!client || !user || !batch.length) {
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        return;
      }
      // Не пытаемся отправить если нет сети — данные уже в localStorage
      if (!navigator.onLine) {
        // Вернуть в очередь для повторной отправки когда сеть появится
        clientUpsertQueue.push(...batch);
        incrementRetry();
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        // Запланировать повторную попытку с exponential backoff
        scheduleClientPush();
        return;
      }
      
      // Удаляем дубликаты по комбинации user_id+client_id+k, оставляя последние значения
      const uniqueBatch = [];
      const seenKeys = new Set();
      for (let i = batch.length - 1; i >= 0; i--) {
        const item = batch[i];
        const key = `${item.user_id}:${item.client_id}:${item.k}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueBatch.unshift(item);
        }
      }
      
      try{
        const promises = uniqueBatch.map(item => 
          cloud.upsert('client_kv_store', item, 'user_id,client_id,k')
            .catch(() => {}) // Тихо игнорируем ошибки
        );
        await Promise.allSettled(promises);
        
        // Успех — сбрасываем retry счётчик
        resetRetry();
        
        // Критический лог: данные отправлены в облако
        if (uniqueBatch.length > 0) {
          const types = {};
          uniqueBatch.forEach(item => {
            const t = item.k.includes('dayv2_') ? 'day' : 
                     item.k.includes('products') ? 'products' : 
                     item.k.includes('profile') ? 'profile' : 'other';
            types[t] = (types[t] || 0) + 1;
          });
          const summary = Object.entries(types).map(([k,v]) => `${k}:${v}`).join(' ');
          logCritical('☁️ Сохранено в облако:', summary);
          
          // Уведомляем о завершении синхронизации
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('heysSyncCompleted', { detail: { saved: uniqueBatch.length } }));
          }
        }
        
        // Обновляем персистентную очередь
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
      }catch(e){
        // При ошибке — вернуть в очередь и увеличить retry
        clientUpsertQueue.push(...uniqueBatch);
        incrementRetry();
        savePendingQueue(PENDING_CLIENT_QUEUE_KEY, clientUpsertQueue);
        notifyPendingChange();
        logCritical('❌ Ошибка сохранения в облако:', e.message || e);
        // Запланировать повторную попытку
        scheduleClientPush();
      }
    }, delay);
  }

  // Функция для проверки статуса синхронизации
  cloud.getSyncStatus = function(key) {
    if (clientUpsertQueue.some(item => item.k === key)) {
      return 'pending'; // В очереди на отправку
    }
    return 'synced'; // Синхронизировано
  };

  // Функция для ожидания завершения синхронизации
  cloud.waitForSync = function(key, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkSync = () => {
        if (cloud.getSyncStatus(key) === 'synced' || (Date.now() - startTime) > timeout) {
          resolve(cloud.getSyncStatus(key));
        } else {
          setTimeout(checkSync, 100);
        }
      };
      checkSync();
    });
  };
  // Поддерживает старую сигнатуру saveClientKey(k, v) — в этом случае client_id берётся из HEYS.currentClientId.
      cloud.saveClientKey = function(...args) {
        let client_id, k, value;

        // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: Блокируем ВСЕ сохранения до завершения первого sync
        // Это предотвращает затирание данных при загрузке страницы
        if (!initialSyncCompleted) {
            const keyInfo = args.find(a => typeof a === 'string' && a.includes('heys_')) || args[1] || 'unknown';
            log(`⏳ [SAVE BLOCKED] Waiting for initial sync | key: ${keyInfo}`);
            return;
        }

        if (args.length === 3) {
            client_id = args[0];
            k = args[1];
            value = args[2];
        } else if (args.length === 2) {
            k = args[0];
            value = args[1];
            
            // Если ключ содержит client_id в формате heys_clientId_dayv2_... - извлекаем его
            if (k && k.startsWith('heys_') && k.includes('_dayv2_')) {
                const parts = k.split('_');
                if (parts.length >= 3) {
                    const extractedId = parts[1]; // берем client_id из ключа
                    // Проверяем что это UUID, а не просто "dayv2"
                    if (extractedId && extractedId !== 'dayv2' && extractedId.length > 8) {
                        client_id = extractedId;
                    }
                }
            }
            
            // Для обычных ключей (heys_profile, heys_products и т.д.) используем текущего клиента
            if (!client_id && window.HEYS && window.HEYS.currentClientId) {
                client_id = window.HEYS.currentClientId;
            }
            
            // Если все еще нет client_id, но есть user - создаем дефолтный client_id для этого пользователя
            if (!client_id && user && user.id) {
                // Создаем предсказуемый но валидный UUID на основе user.id
                // Берем первые 8 символов user.id и добавляем фиксированный суффикс для получения валидного UUID
                const userIdShort = user.id.replace(/-/g, '').substring(0, 8);
                client_id = `00000000-0000-4000-8000-${userIdShort}0000`.substring(0, 36);
            }
        } else {
            return;
        }

        if (!client_id) {
            return;
        }

        // НЕ сохраняем в Supabase, если используется дефолтный client_id (пользователь еще не выбрал клиента)
        if (client_id && client_id.startsWith('00000000-')) {
            if (window.DEV) {
                log(`⚠️ [SAVE BLOCKED] Skipping save for key '${k}' - default client_id (user hasn't selected client yet)`);
            }
            return; // Тихий пропуск сохранения до выбора реального клиента
        }

        if (!user || !user.id) {
            return;
        }

        // Для дней проверяем что это объект, для остальных ключей пропускаем любые типы
        if (k && k.includes('dayv2_') && !k.includes('backup') && !k.includes('date')) {
            if (typeof value !== 'object' || value === null) {
                return;
            }
            // 🚨 ЗАЩИТА ОТ HMR: НЕ сохраняем день без updatedAt (признак что это HMR-сброс, а не реальное изменение)
            // Если есть updatedAt — это реальное изменение пользователем, разрешаем сохранение (даже пустого дня)
            if (!value.updatedAt && !value.schemaVersion) {
                log(`🚫 [SAVE BLOCKED] Refused to save day without updatedAt (HMR protection) - key: ${k}`);
                return;
            }
        }

        const upsertObj = {
            user_id: user.id,
            client_id: client_id,
            k: k,
            v: value,
            updated_at: (new Date()).toISOString(),
        };

        // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем пустые массивы продуктов в Supabase
        if (k === 'heys_products' && Array.isArray(value) && value.length === 0) {
            log(`🚫 [SAVE BLOCKED] Refused to save empty products array to Supabase (key: ${k})`);
            return; // Блокируем затирание реальных данных пустым массивом
        }

        // 🚨 КРИТИЧЕСКАЯ ЗАЩИТА: НЕ сохраняем "пустой" профиль (без ключевых полей)
        // Это защита от HMR-перезагрузок, когда компонент ремонтируется с дефолтными значениями
        if (k.includes('profile') && !k.includes('backup')) {
            const isValidProfile = value && typeof value === 'object' && 
                                   (value.age || value.weight || value.height || value.firstName);
            if (!isValidProfile) {
                log(`🚫 [SAVE BLOCKED] Refused to save empty/invalid profile to Supabase (key: ${k})`);
                return;
            }
        }

        // Логирование сохранения
        const dataType = k === 'heys_products' ? '📦 PRODUCTS' :
                        k.includes('dayv2_') ? '📅 DAY' :
                        k.includes('_profile') ? '👤 PROFILE' : '📝 OTHER';
        const itemsCount = Array.isArray(value) ? value.length : 'N/A';
        log(`💾 [SAVE] ${dataType} | key: ${k} | items: ${itemsCount} | client: ${client_id.substring(0, 8)}...`);

        // Добавляем в очередь вместо немедленной отправки
        clientUpsertQueue.push(upsertObj);
        scheduleClientPush();
    };

    // Функция только проверяет существование клиента (больше НЕ создаём автоматически)
    cloud.ensureClient = async function(clientId) {
        if (!client || !user || !clientId) return false;
        try {
            const { data, error } = await client
              .from('clients')
              .select('id')
              .eq('id', clientId)
              .eq('curator_id', user.id)
              .limit(1);
            if (error) return false;
            return (data && data.length > 0);
        } catch(e){
          return false;
        }
    };

    // Функция для отправки данных в client_kv_store
    cloud.upsert = async function(tableName, obj, conflictKey) {
        if (!client || !user) {
            throw new Error('Client or user not available');
        }
        
        try {
            // Если это client_kv_store, проверяем что клиент существует; иначе пропускаем
            if (tableName === 'client_kv_store' && obj.client_id) {
                const _exists = await cloud.ensureClient(obj.client_id);
                if (!_exists){
                  // Убрано избыточное логирование skip upsert (client not found)
                  return { skipped: true, reason: 'client_not_found' };
                }
            }
            
            const { error } = await client
                .from(tableName)
                .upsert(obj, { onConflict: conflictKey || 'user_id,client_id,k' });
            
            if (error) {
                throw error;
            } else {
                return { success: true };
            }
        } catch (e) {
            throw e;
        }
    };

  // очередь upsert'ов
  let upsertQueue = loadPendingQueue(PENDING_QUEUE_KEY);
  let upsertTimer = null;
  function schedulePush(){
    if (upsertTimer) return;
    
    // Сохраняем очередь в localStorage для персистентности
    savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
    notifyPendingChange();
    
    const delay = navigator.onLine ? 300 : getRetryDelay();
    
    upsertTimer = setTimeout(async () => {
      const batch = upsertQueue.splice(0, upsertQueue.length);
      upsertTimer = null;
      if (!client || !user || !batch.length) {
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
        return;
      }
      // Не пытаемся отправить если нет сети — данные уже в localStorage
      if (!navigator.onLine) {
        // Вернуть в очередь для повторной отправки когда сеть появится
        upsertQueue.push(...batch);
        incrementRetry();
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
        // Запланировать повторную попытку с exponential backoff
        schedulePush();
        return;
      }
      
      // Удаляем дубликаты по комбинации user_id+k, оставляя последние значения
      const uniqueBatch = [];
      const seenKeys = new Set();
      for (let i = batch.length - 1; i >= 0; i--) {
        const item = batch[i];
        const key = `${item.user_id}:${item.k}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueBatch.unshift(item);
        }
      }
      
      try{
        const { error } = await client.from('kv_store').upsert(uniqueBatch, { onConflict: 'user_id,k' });
        if (error) { 
          // При ошибке — вернуть в очередь
          upsertQueue.push(...uniqueBatch);
          incrementRetry();
          savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
          notifyPendingChange();
          err('bulk upsert', error); 
          schedulePush();
          return; 
        }
        // Успех — сбрасываем retry счётчик
        resetRetry();
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
      }catch(e){ 
        // При исключении — вернуть в очередь
        upsertQueue.push(...uniqueBatch);
        incrementRetry();
        savePendingQueue(PENDING_QUEUE_KEY, upsertQueue);
        notifyPendingChange();
        err('bulk upsert exception', e);
        schedulePush();
      }
    }, delay);
  }

  cloud.saveKey = function(k, v){
    if (!user || !k) return;
    const upsertObj = {
      user_id: user.id,
      k: k,
      v: v,
      updated_at: (new Date()).toISOString(),
    };
    upsertQueue.push(upsertObj);
    schedulePush();
  };

  cloud.deleteKey = function(k){
    // можно делать через .delete(), или ставить пометку
  };

  cloud.clearAll = function(){
    clearNamespace();
  };

  // утилиты для компонентов
  cloud.lsGet = typeof global.HEYS !== 'undefined' && global.HEYS.lsGet
    ? global.HEYS.lsGet
    : function(k, def){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }catch(e){ return def; } };

  cloud.lsSet = typeof global.HEYS !== 'undefined' && global.HEYS.lsSet
    ? global.HEYS.lsSet
    : function(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} };

  // Экспорт для совместимости с тестами
  HEYS.SupabaseConnection = {
    connect: cloud.signIn,
    disconnect: cloud.signOut,
    isConnected: function() { return status === 'online'; },
    getStatus: function() { return status; },
    getUser: function() { return user; },
    sync: cloud.pushAll,
    client: function() { return client; }
  };

  // Когда сеть возвращается — сбрасываем retry и пробуем отправить накопленные данные
  global.addEventListener('online', function() {
    addSyncLogEntry('online', { pending: cloud.getPendingCount() });
    resetRetry(); // Сбрасываем exponential backoff
    
    const pendingBefore = cloud.getPendingCount();
    
    if (clientUpsertQueue.length > 0) {
      scheduleClientPush();
    }
    if (upsertQueue.length > 0) {
      schedulePush();
    }
    notifyPendingChange();
    
    // Уведомляем UI что сеть вернулась и синхронизация начнётся
    if (pendingBefore > 0) {
      global.dispatchEvent(new CustomEvent('heys:network-restored', { 
        detail: { pendingCount: pendingBefore } 
      }));
    }
  });
  
  // Когда сеть пропадает — логируем
  global.addEventListener('offline', function() {
    addSyncLogEntry('offline', { pending: cloud.getPendingCount() });
  });

  // Убрано избыточное логирование utils lsSet wrapped

})(window);
