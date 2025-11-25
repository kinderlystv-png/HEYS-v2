// heys_storage_supabase_v1_backup.js — Supabase bridge backup (v8, reports-ready)
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
          // clear only client-specific keys
          if (lower.indexOf(('heys_' + clientId + '_').toLowerCase()) === 0) { ls.removeItem(k); continue; }
          if (lower.indexOf(('day_' + clientId + '_').toLowerCase()) === 0) { ls.removeItem(k); continue; }
        } else {
          // clear all
          if (isOurKey(k)) ls.removeItem(k);
        }
      }
      log('local heys_*/day* cleared', clientId ? ('for client '+clientId) : 'all');
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
          
          if (needsClientStorage && window.HEYS && window.HEYS.currentClientId) {
            console.log('[DEBUG] localStorage перенаправляем в client_kv_store:', k);
            cloud.saveClientKey(k, tryParse(v));
          } else {
            cloud.saveKey(k, tryParse(v));
          }
        }
      };
      log('localStorage.setItem intercepted');
    }catch(e){ err('intercept setItem failed', e); }
  }

  cloud.init = function({ url, anonKey }){
    if (!global.supabase || !global.supabase.createClient){
      err('supabase-js не загружен');
      return;
    }
    try{
      client = global.supabase.createClient(url, anonKey);
      cloud.client = client;
      status = 'offline';
      interceptSetItem();
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
      log('bootstrap synced keys:', (data||[]).length);
    }catch(e){ err('bootstrap exception', e); muteMirror=false; }
  };

  cloud.bootstrapClientSync = async function(client_id){
    if (!client || !user || !client_id) return;
    const now = Date.now();
    if (cloud._lastClientSync && cloud._lastClientSync.clientId === client_id && (now - cloud._lastClientSync.ts) < 4000){
      log('client bootstrap skipped (throttled)', client_id);
      return;
    }
    try{
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
          
          // DEBUG: логируем загрузку тренировок из облака
          if (key && key.includes('dayv2_') && row.v && row.v.trainings) {
            console.log('[DEBUG] bootstrapClientSync: загрузили тренировки из облака для ключа:', key);
            console.log('[DEBUG] bootstrapClientSync: тренировки:', JSON.stringify(row.v.trainings));
          }
        } catch(e){}
      });
      muteMirror = false;
      log('client bootstrap synced keys:', (data||[]).length);
      cloud._lastClientSync = { clientId: client_id, ts: now };
    }catch(e){ err('client bootstrap exception', e); muteMirror=false; }
  };

  cloud.shouldSyncClient = function(client_id, maxAgeMs){
    if (!client_id) return false;
    const rec = cloud._lastClientSync;
    if (!rec || rec.clientId !== client_id) return true;
    return (Date.now() - rec.ts) > (maxAgeMs||4000);
  };

  // Сохранение ключа для выбранного клиента (client_kv_store).
  // Поддерживает старую сигнатуру saveClientKey(k, v) — в этом случае client_id берётся из HEYS.currentClientId.
      cloud.saveClientKey = function(...args) {
        console.log('[DEBUG] cloud.saveClientKey ВЫЗВАН с аргументами:', args.length, args);
        
        let client_id, k, value;

        if (args.length === 3) {
            client_id = args[0];
            k = args[1];
            value = args[2];
        } else if (args.length === 2) {
            console.log('[DEBUG] cloud.saveClientKey: 2 аргумента, получаем client_id из HEYS.getCurrentClientId()');
            k = args[0];
            value = args[1];
            
            // Если ключ содержит client_id в формате heys_clientId_dayv2_... - извлекаем его
            if (k && k.startsWith('heys_') && k.includes('_dayv2_')) {
                const parts = k.split('_');
                if (parts.length >= 3) {
                    client_id = parts[1]; // берем client_id из ключа
                    console.log('[DEBUG] cloud.saveClientKey: извлекли client_id из ключа:', client_id);
                }
            }
            
            // Для обычных ключей (heys_profile, heys_products и т.д.) используем текущего клиента
            if (!client_id && window.HEYS && window.HEYS.currentClientId) {
                client_id = window.HEYS.currentClientId;
                console.log('[DEBUG] cloud.saveClientKey: используем currentClientId:', client_id);
            }
            
            console.log('[DEBUG] cloud.saveClientKey: client_id =', client_id, 'typeof HEYS.getCurrentClientId =', typeof HEYS.getCurrentClientId);
        } else {
            console.log('[DEBUG] cloud.saveClientKey: неправильное количество аргументов, завершаем');
            return;
        }

        if (!client_id) {
            console.log('[DEBUG] cloud.saveClientKey: НЕТ client_id, завершаем');
            return;
        }
        
        console.log('[DEBUG] cloud.saveClientKey: прошли проверки, client_id =', client_id, 'k =', k, 'value type =', typeof value);
        
        // DEBUG: что реально уходит в облако
        console.log('[DEBUG] cloud.saveClientKey: проверяем тип value =', typeof value, 'value =', value);

        // Для дней проверяем что это объект, для остальных ключей пропускаем любые типы
        if (k && k.includes('dayv2_')) {
            if (typeof value !== 'object' || value === null) {
                console.log('[DEBUG] cloud.saveClientKey: ОТКЛОНЕНО - день должен быть объектом');
                return;
            }
        } else {
            // Для профилей, настроек и т.д. разрешаем любые типы
            console.log('[DEBUG] cloud.saveClientKey: ключ не dayv2_, пропускаем проверку типа');
        }

        // DEBUG: логируем отправку данных в облако
        if (k && k.includes('dayv2_')) {
            console.log('[DEBUG] cloud.saveClientKey: отправляем день в облако для ключа:', k);
            console.log('[DEBUG] cloud.saveClientKey: полный объект дня:', JSON.stringify(value));
            if (value && value.trainings) {
                console.log('[DEBUG] cloud.saveClientKey: тренировки найдены:', JSON.stringify(value.trainings));
            } else {
                console.log('[DEBUG] cloud.saveClientKey: тренировки НЕ найдены в объекте, поля объекта:', Object.keys(value || {}));
            }
        } else {
            console.log('[DEBUG] cloud.saveClientKey: отправляем в облако ключ:', k, 'тип value:', typeof value);
        }

        const upsertObj = {
            client_id: client_id,
            k: k,
            v: value,
            updated_at: (new Date()).toISOString(),
        };

        cloud.upsert('client_kv_store', upsertObj, 'client_id,k')
            .then(() => {
                console.log('[DEBUG] cloud.saveClientKey: УСПЕШНО отправлено в client_kv_store:', k);
                log('[HEYS.cloud] client upsert ok: ' + k);
            })
            .catch(err => {
                console.log('[DEBUG] cloud.saveClientKey: ОШИБКА при отправке в client_kv_store:', err);
                err('client upsert error', err);
            });
    };

    // Функция для отправки данных в client_kv_store
    cloud.upsert = async function(tableName, obj, conflictKey) {
        if (!client || !user) {
            console.log('[DEBUG] cloud.upsert: НЕТ client или user');
            throw new Error('Client or user not available');
        }
        
        console.log('[DEBUG] cloud.upsert: отправляем в таблицу', tableName, 'объект:', obj);
        
        try {
            const { error } = await client
                .from(tableName)
                .upsert(obj, { onConflict: 'client_id,k' });
            
            if (error) {
                console.log('[DEBUG] cloud.upsert: ОШИБКА при отправке в', tableName, error);
                throw error;
            } else {
                console.log('[DEBUG] cloud.upsert: УСПЕШНО отправлено в', tableName);
                return { success: true };
            }
        } catch (e) {
            console.log('[DEBUG] cloud.upsert: ИСКЛЮЧЕНИЕ при отправке в', tableName, e);
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
      try{
        const { error } = await client.from('kv_store').upsert(batch, { onConflict: 'k' });
        if (error) { err('bulk upsert', error); return; }
        batch.forEach(item => log('upsert ok: ' + item.k));
      }catch(e){ err('bulk upsert exception', e); }
    }, 300);
  }

  cloud.saveKey = function(k, v){
    if (!user || !k) return;
    const upsertObj = {
      k: k,
      v: v,
      updated_at: (new Date()).toISOString(),
    };
    console.log('[DEBUG][cloud.saveKey] отправляем ключ:', k, 'тип value:', typeof v);
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

  log('utils lsSet wrapped');

})(window);
