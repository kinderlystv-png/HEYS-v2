// heys_storage_layer_v1.js — Centralized storage layer, cache, watchers
;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const Store = HEYS.store = HEYS.store || {};

  const memory = new Map();
  const watchers = new Map(); // key -> Set<fn>

  // ---------- Сжатие данных ----------
  function compress(obj) {
    try {
      const json = JSON.stringify(obj);
      
      // Простое сжатие: убираем лишние пробелы и повторяющиеся паттерны
      let compressed = json
        .replace(/":"/g, '":"')
        .replace(/","/g, '","')
        .replace(/{""/g, '{"')
        .replace(/"}/g, '"}');
      
      // Замена часто встречающихся паттернов на короткие коды
      const patterns = {
        '"name":"': '¤n¤',
        '"kcal100"': '¤k¤',
        '"protein100"': '¤p¤',
        '"carbs100"': '¤c¤',
        '"fat100"': '¤f¤',
        '"simple100"': '¤s¤',
        '"complex100"': '¤x¤',
        '"badFat100"': '¤b¤',
        '"goodFat100"': '¤g¤',
        '"trans100"': '¤t¤',
        '"fiber100"': '¤i¤',
        '"gi"': '¤G¤',
        '"harmScore"': '¤h¤'
      };
      
      for (const [pattern, code] of Object.entries(patterns)) {
        compressed = compressed.split(pattern).join(code);
      }
      
      // Если сжатие дает результат, возвращаем с префиксом
      if (compressed.length < json.length * 0.9) {
        return '¤Z¤' + compressed;
      }
      
      return json;
    } catch (e) {
      return JSON.stringify(obj);
    }
  }
  
  function decompress(str) {
    try {
      if (!str.startsWith('¤Z¤')) {
        return JSON.parse(str);
      }
      
      let compressed = str.substring(3);
      
      // Восстановление паттернов
      const patterns = {
        '¤n¤': '"name":"',
        '¤k¤': '"kcal100"',
        '¤p¤': '"protein100"',
        '¤c¤': '"carbs100"',
        '¤f¤': '"fat100"',
        '¤s¤': '"simple100"',
        '¤x¤': '"complex100"',
        '¤b¤': '"badFat100"',
        '¤g¤': '"goodFat100"',
        '¤t¤': '"trans100"',
        '¤i¤': '"fiber100"',
        '¤G¤': '"gi"',
        '¤h¤': '"harmScore"'
      };
      
      for (const [code, pattern] of Object.entries(patterns)) {
        compressed = compressed.split(code).join(pattern);
      }
      
      return JSON.parse(compressed);
    } catch (e) {
      return JSON.parse(str);
    }
  }

  function rawGet(k, d){ 
    try{ 
      const v = localStorage.getItem(k); 
      return v ? decompress(v) : d; 
    } catch(e) { 
      return d; 
    } 
  }
  
  function rawSet(k, v){ 
    try{ 
      localStorage.setItem(k, compress(v)); 
    } catch(e) {} 
  }

  function ns(){ return (global.HEYS && global.HEYS.currentClientId) || ''; }
  function scoped(k){ const cid=ns(); if(!cid) return k; if(/^heys_(clients|client_current)$/i.test(k)) return k;
    // Ключ `k` может быть 'dayv2_2025-01-01' или 'heys_dayv2_date'.
    // Мы должны добавить client_id после 'heys_'.
    if (k.startsWith('heys_')) {
        return 'heys_' + cid + '_' + k.substring('heys_'.length);
    }
    // Для ключей, не начинающихся с 'heys_', просто добавляем префикс.
    return `heys_${cid}_${k}`;
  }

  Store.get = function(k, def){ const sk=scoped(k); if(memory.has(sk)) return memory.get(sk); const v=rawGet(sk, def); memory.set(sk,v); return v; };
  // If scoped key not present, try unscoped legacy key and migrate it into scoped namespace
  Store.get = (function(orig){
    return function(k, def){
      const sk = scoped(k);
      if (memory.has(sk)) return memory.get(sk);
      let v = rawGet(sk, undefined);
      if (v === undefined || v === null) {
        // try legacy unscoped key
        try{
          const legacy = rawGet(k, undefined);
          if (legacy !== undefined && legacy !== null){
            // migrate to scoped key for future reads/writes
            memory.set(sk, legacy);
            rawSet(sk, legacy);
            return legacy;
          }
        }catch(e){}
        // return default
        v = def;
      }
      memory.set(sk, v);
      return v;
    };
  })(Store.get);
  Store.set = function(k, v){
    const sk=scoped(k);
    memory.set(sk,v);
    rawSet(sk,v);
    // DEBUG: логируем сохранение профиля
    if (k.includes('profile')) {
      console.log('[Store.set] 🔵 PROFILE SAVE | key: ' + k + ' | scoped: ' + sk + ' | stepsGoal: ' + (v?.stepsGoal || 'NONE') + ' | full: ' + JSON.stringify(v));
    }
    if(watchers.has(sk)) watchers.get(sk).forEach(fn=>{ try{ fn(v); }catch(e){} });
    try{
      if(global.HEYS && typeof global.HEYS.saveClientKey==='function'){
        const cid=ns();
        if(cid) {
          // Передаём scoped key в облако (с clientId), чтобы ключ совпадал при загрузке
          // sk уже содержит heys_<clientId>_<key>
          // Не отправлять в облако если v не объект (например, строка совпадает с ключом)
          if (typeof v !== 'object' || v === null) {
            if (k.includes('profile')) console.log('[Store.set] ⚠️ PROFILE skipped (not object)');
            return;
          }
          console.log('[Store.set] 🚀 Calling saveClientKey | cid: ' + cid + ' | sk: ' + sk);
          global.HEYS.saveClientKey(cid, sk, v);
        } else {
          if (k.includes('profile')) console.log('[Store.set] ⚠️ PROFILE no cid');
        }
      } else {
        if (k.includes('profile')) console.log('[Store.set] ⚠️ PROFILE no saveClientKey function');
      }
    }catch(e){ console.log('[Store.set] ❌ ERROR: ' + e.message); }
  };

  Store.watch = function(k, fn){ const sk=scoped(k); if(!watchers.has(sk)) watchers.set(sk,new Set()); watchers.get(sk).add(fn); return ()=>{ const set=watchers.get(sk); if(set){ set.delete(fn); if(!set.size) watchers.delete(sk); } }; };

  Store.flushMemory = function(){ memory.clear(); };

})(window);
