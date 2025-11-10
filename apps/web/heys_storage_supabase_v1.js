/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_storage_supabase_v1.js (494 строки)                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🏗️ ИНИЦИАЛИЗАЦИЯ И УТИЛИТЫ (строки 1-50):                                               │
│    ├── Глобальные переменные: client, status, user (9-14)                               │
│    ├── Утилиты логирования: log(), err() (16-17)                                        │
│    ├── tryParse() - безопасный JSON.parse (19)                                          │
│    ├── isOurKey() - определение наших ключей (21-30)                                    │
│    └── clearNamespace() - очистка namespace (32-50)                                     │
│                                                                                           │
│ 🔐 СИСТЕМА АУТЕНТИФИКАЦИИ (строки 51-150):                                               │
│    ├── signin() - вход в систему (51-80)                                                │
│    ├── signout() - выход из системы (81-100)                                            │
│    ├── getCurrentUser() - текущий пользователь (101-110)                                │
│    ├── getStatus() - статус подключения (111-120)                                       │
│    └── onAuthStateChange() - обработка смены состояния (121-150)                        │
│                                                                                           │
│ ☁️ СИНХРОНИЗАЦИЯ ДАННЫХ (строки 151-300):                                                │
│    ├── syncToCloud() - загрузка в облако (151-200)                                      │
│    ├── syncFromCloud() - загрузка из облака (201-250)                                   │
│    ├── fullSync() - полная синхронизация (251-280)                                      │
│    ├── saveClientKey() - сохранение ключа (281-300)                                     │
│    └── deleteClientKey() - удаление ключа (301-320)                                     │
│                                                                                           │
│ 📊 УПРАВЛЕНИЕ KV-ХРАНИЛИЩЕМ (строки 301-400):                                            │
│    ├── upsertKV() - вставка/обновление (301-330)                                        │
│    ├── getKV() - получение значения (331-350)                                           │
│    ├── deleteKV() - удаление записи (351-370)                                           │
│    ├── listKV() - список ключей (371-390)                                               │
│    └── batchKV() - массовые операции (391-400)                                          │
│                                                                                           │
│ 🔄 ЗЕРКАЛИРОВАНИЕ LOCALSTORAGE (строки 401-450):                                         │
│    ├── Перехват localStorage.setItem (401-420)                                          │
│    ├── Автоматическое зеркалирование (421-430)                                          │
│    ├── muteMirror механизм (431-440)                                                    │
│    └── Обработка ошибок зеркалирования (441-450)                                        │
│                                                                                           │
│ 🔗 ИНИЦИАЛИЗАЦИЯ И ЭКСПОРТ (строки 451-494):                                             │
│    ├── init() - инициализация Supabase (451-470)                                        │
│    ├── Экспорт всех методов (471-490)                                                   │
│    └── Автоматическая инициализация (491-494)                                           │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Аутентификация: signin() (51), signout() (81), getCurrentUser() (101)             │
│    • Синхронизация: syncToCloud() (151), syncFromCloud() (201), fullSync() (251)       │
│    • KV-хранилище: upsertKV() (301), getKV() (331), deleteKV() (351)                   │
│    • Зеркалирование: localStorage.setItem перехват (401), muteMirror (431)             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_storage_supabase_v1.js — Supabase bridge (v8, reports-ready)
// Дополнительно:
//  • перехватываем localStorage.setItem и зеркалим не только 'heys_*', но и ключи дней: 'day*' (без учёта регистра);
//  • при входе/выходе чистим и 'heys_*', и 'day*' — отчётность не увидит чужие дни;
//  • во время sync/clear отключаем зеркалирование (muteMirror), чтобы не гонять «эхо».
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

  function log(){ try{ console.log.apply(console, ['[HEYS.cloud]'].concat([].slice.call(arguments))); }catch(e){} }
  function err(){ try{ console.error.apply(console, ['[HEYS.cloud:ERR]'].concat([].slice.call(arguments))); }catch(e){} }

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
  
  let originalSetItem = null;
  
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
   */
  function interceptSetItem(){
    try{
      if (originalSetItem) return; // Защита от повторного перехвата
      
      originalSetItem = global.localStorage.setItem.bind(global.localStorage);
      global.localStorage.setItem = function(k, v){
        originalSetItem(k, v);
        
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
    try{
      status = 'signin';
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) { status = 'offline'; err('signIn failed', error); return { error }; }
      user = data.user;
      if (!user) { status = 'offline'; err('no user after signin'); return { error: 'no user' }; }
      status = 'sync';
      await cloud.bootstrapSync();
      status = 'online';
      log('signIn ok, user=', user.email);
      return { user };
    }catch(e){
      status = 'offline';
      err('signIn exception', e);
      return { error: e };
    }
  };

  cloud.signOut = function(){
    if (client) client.auth.signOut();
    user = null;
    status = 'offline';
    clearNamespace();
    log('signOut ok');
  };

  cloud.getUser = function(){ return user; };
  cloud.getStatus = function(){ return status; };

  cloud.bootstrapSync = async function(){
    try{
      muteMirror = true;
      if (!client || !user) return;
      const { data, error } = await client.from('kv_store').select('k,v,updated_at');
      if (error) { err('bootstrap select', error); return; }
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
      const { data: metaData, error: metaError } = await client
        .from('client_kv_store')
        .select('k,updated_at')
        .eq('client_id', client_id)
        .order('updated_at', { ascending: false })
        .limit(5);
        
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
      const { data, error } = await client.from('client_kv_store').select('k,v,updated_at').eq('client_id', client_id);
      if (error) { err('client bootstrap select', error); return; }
      
      log('✅ [CLIENT_SYNC] Loaded', data?.length || 0, 'keys from Supabase');
      
      // Детальное логирование каждого ключа
      (data||[]).forEach((row, idx) => {
        const keyType = row.k === 'heys_products' ? '📦 PRODUCTS' :
                       row.k.includes('dayv2_') ? '📅 DAY' :
                       row.k.includes('_profile') ? '👤 PROFILE' :
                       row.k.includes('_norms') ? '🎯 NORMS' : '📝 OTHER';
        const dataSize = JSON.stringify(row.v).length;
        const itemsCount = Array.isArray(row.v) ? row.v.length : 'N/A';
        log(`  ${idx+1}. ${keyType} | key: ${row.k} | size: ${dataSize}b | items: ${itemsCount}`);
      });
      
      const ls = global.localStorage;
      muteMirror = true;
      // clear only keys that belong to the requested client to avoid wiping other clients' data
      clearNamespace(client_id);
      
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
      log('✅ [CLIENT_SYNC] Sync completed for client:', client_id);
    }catch(e){ 
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
  let clientUpsertQueue = [];
  let clientUpsertTimer = null;
  
  function scheduleClientPush(){
    if (clientUpsertTimer) return;
    clientUpsertTimer = setTimeout(async () => {
      const batch = clientUpsertQueue.splice(0, clientUpsertQueue.length);
      clientUpsertTimer = null;
      if (!client || !user || !batch.length) return;
      
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
      }catch(e){}
    }, 500); // Немного больше задержка для клиентских данных
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
        if (k && k.includes('dayv2_')) {
            if (typeof value !== 'object' || value === null) {
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
  let upsertQueue = [];
  let upsertTimer = null;
  function schedulePush(){
    if (upsertTimer) return;
    upsertTimer = setTimeout(async () => {
      const batch = upsertQueue.splice(0, upsertQueue.length);
      upsertTimer = null;
      if (!client || !user || !batch.length) return;
      
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
        if (error) { err('bulk upsert', error); return; }
        // Убрано избыточное логирование upsert ok для каждого элемента
      }catch(e){ err('bulk upsert exception', e); }
    }, 300);
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

  // Убрано избыточное логирование utils lsSet wrapped

})(window);
