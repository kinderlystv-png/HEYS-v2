// heys_storage_supabase_v1.js — Supabase bridge (v8, reports-ready)
// Дополнительно:
//  • перехватываем localStorage.setItem и зеркалим не только 'heys_*', но и ключи дней: 'day*' (без учёта регистра);
//  • при входе/выходе чистим и 'heys_*', и 'day*' — отчётность не увидит чужие дни;
//  • во время sync/clear отключаем зеркалирование (muteMirror), чтобы не гонять «эхо».
;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const cloud = HEYS.cloud = HEYS.cloud || {};

  let client = null;
  cloud.client = null;
  let status = 'offline'; // offline | signin | sync | online
  let user = null;
  let muteMirror = false;

  function log(){ try{ console.log.apply(console, ['[HEYS.cloud]'].concat([].slice.call(arguments))); }catch(e){} }
  function err(){ try{ console.error.apply(console, ['[HEYS.cloud:ERR]'].concat([].slice.call(arguments))); }catch(e){} }

  function tryParse(v){ try{return JSON.parse(v);}catch(e){ return v; } }

  // какие ключи мы зеркалим / чистим
  function isOurKey(k){
    if (typeof k !== 'string') return false;
    if (k.indexOf('heys_') === 0) return true;
    // также разрешаем ключи дней
    const lower = k.toLowerCase();
    if (lower.indexOf('day') >= 0) return true;
    return false;
  }

  function clearNamespace(clientId){
    try{
      const ls = global.localStorage;
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (!k) continue;
        const lower = k.toLowerCase();
        if (clientId) {
          // clear only client-specific keys AND general heys_ keys
          if (lower.indexOf(('heys_' + clientId + '_').toLowerCase()) === 0) { ls.removeItem(k); continue; }
          if (lower.indexOf(('day_' + clientId + '_').toLowerCase()) === 0) { ls.removeItem(k); continue; }
          
          // Also clear general keys that should be client-specific
          if (k === 'heys_products' || k === 'heys_profile' || k === 'heys_hr_zones' || k === 'heys_norms') {
            ls.removeItem(k);
            continue;
          }
        } else {
          // clear all
          if (isOurKey(k)) ls.removeItem(k);
        }
      }
      // Убрано избыточное логирование local heys_*/day* cleared
    }catch(e){ err('clearNamespace', e); }
  }

  // intercept localStorage.setItem (зеркалим наши ключи)
  let originalSetItem = null;
  function interceptSetItem(){
    try{
      if (originalSetItem) return;
      originalSetItem = global.localStorage.setItem.bind(global.localStorage);
      global.localStorage.setItem = function(k, v){
        originalSetItem(k, v);
        if (!muteMirror && isOurKey(k)){
          // Проверяем, нужно ли направить в client_kv_store
          const needsClientStorage = (
            (k && k.includes('dayv2_')) ||  // дни пользователя
            (k === 'heys_profile') ||       // профиль
            (k === 'heys_hr_zones') ||      // зоны пульса  
            (k === 'heys_norms') ||         // нормы
            (k === 'heys_products')         // продукты
          );
          
          if (needsClientStorage) {
            cloud.saveClientKey(k, tryParse(v));
          } else {
            cloud.saveKey(k, tryParse(v));
          }
        }
      };
      // Убрано избыточное логирование localStorage.setItem intercepted
    }catch(e){ err('intercept setItem failed', e); }
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
    const now = Date.now();
    
    // Увеличиваем throttling с 4 до 30 секунд для снижения нагрузки
    if (cloud._lastClientSync && cloud._lastClientSync.clientId === client_id && (now - cloud._lastClientSync.ts) < 30000){
      log('client bootstrap skipped (throttled)', client_id);
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
      const { data, error } = await client.from('client_kv_store').select('k,v,updated_at').eq('client_id', client_id);
      if (error) { err('client bootstrap select', error); return; }
      
      const ls = global.localStorage;
      muteMirror = true;
      // clear only keys that belong to the requested client to avoid wiping other clients' data
      clearNamespace(client_id);
      
      (data||[]).forEach(row => {
        try {
          // row.k is stored in DB as the original key; when using client-scoped storage,
          // DB should contain keys already scoped for the client (heys_<cid>_... or day_<cid>_...)
          const key = row.k;
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
      // Убрано избыточное логирование client bootstrap synced keys
    }catch(e){ 
      err('client bootstrap exception', e); 
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
