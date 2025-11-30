// heys_day_hooks.js — React hooks for Day component

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Импортируем утилиты из dayUtils
  const getDayUtils = () => HEYS.dayUtils || {};

  // Хук для централизованного автосохранения дня с учётом гонок и межвкладочной синхронизации
  // Поддерживает ночную логику: приёмы 00:00-02:59 сохраняются под следующий календарный день
  function useDayAutosave({
    day,
    date,
    lsSet,
    lsGetFn,
    keyPrefix = 'heys_dayv2_',
    debounceMs = 500,
    now = () => Date.now(),
    disabled = false, // ЗАЩИТА: не сохранять пока данные не загружены
  }){
    const utils = getDayUtils();
    const lsSetFn = lsSet || utils.lsSet;
    const lsGetFunc = lsGetFn || utils.lsGet;
    const isNightTime = utils.isNightTime || (() => false);
    const getNextDay = utils.getNextDay || ((d) => d);
    
    const timerRef = React.useRef(null);
    const prevStoredSnapRef = React.useRef(null);
    const prevDaySnapRef = React.useRef(null);
    const sourceIdRef = React.useRef((global.crypto && typeof global.crypto.randomUUID === 'function')? global.crypto.randomUUID(): String(Math.random()));
    const channelRef = React.useRef(null);
    const isUnmountedRef = React.useRef(false);

    React.useEffect(()=>{
      isUnmountedRef.current = false;
      if('BroadcastChannel' in global){
        const channel = new BroadcastChannel('heys_day_updates');
        channelRef.current = channel;
        return ()=>{
          isUnmountedRef.current = true;
          channel.close();
          channelRef.current = null;
        };
      }
      channelRef.current = null;
    },[]);

    const getKey = React.useCallback((dateStr)=> keyPrefix + dateStr,[keyPrefix]);

    const stripMeta = React.useCallback((payload)=>{
      if(!payload) return payload;
      const {updatedAt,_sourceId,...rest} = payload;
      return rest;
    },[]);

    const readExisting = React.useCallback((key)=>{
      if(!key) return null;
      try{
        const stored = lsGetFunc? lsGetFunc(key,null):null;
        if(stored && typeof stored==='object') return stored;
      }catch(e){}
      try{
        const raw = global.localStorage.getItem(key);
        return raw? JSON.parse(raw):null;
      }catch(e){ return null; }
    },[lsGetFunc]);

    // Сохранение данных дня под конкретную дату
    const saveToDate = React.useCallback((dateStr, payload)=>{
      if(!dateStr || !payload) return;
      const key = getKey(dateStr);
      const current = readExisting(key);
      const incomingUpdatedAt = payload.updatedAt!=null? payload.updatedAt: now();

      if(current && current.updatedAt > incomingUpdatedAt) return;
      if(current && current.updatedAt===incomingUpdatedAt && current._sourceId && current._sourceId > sourceIdRef.current) return;

      const toStore = {
        ...payload,
        date: dateStr,
        schemaVersion: payload.schemaVersion!=null? payload.schemaVersion:3,
        updatedAt: incomingUpdatedAt,
        _sourceId: sourceIdRef.current,
      };

      try{
        lsSetFn(key,toStore);
        if(channelRef.current && !isUnmountedRef.current){ 
          try{
            channelRef.current.postMessage({type:'day:update',date:dateStr,payload:toStore});
          }catch(e){}
        }
      }catch(error){
        console.error('[AUTOSAVE] localStorage write failed:', error);
      }
    },[getKey,lsSetFn,now,readExisting]);

    const flush = React.useCallback(()=>{
      if(disabled) return; // ЗАЩИТА: не сохранять до гидратации
      if(isUnmountedRef.current || !day || !day.date) return;
      
      const daySnap = JSON.stringify(stripMeta(day));
      if(prevDaySnapRef.current === daySnap) return;
      
      const updatedAt = day.updatedAt!=null? day.updatedAt: now();
      const meals = day.meals || [];
      
      // Разделяем приёмы на дневные и ночные
      const dayMeals = meals.filter(m => !isNightTime(m.time));
      const nightMeals = meals.filter(m => isNightTime(m.time));
      
      // Сохраняем дневные приёмы под текущую дату
      const currentDayPayload = {
        ...day,
        meals: dayMeals,
        updatedAt,
      };
      saveToDate(day.date, currentDayPayload);
      
      // Если есть ночные приёмы — сохраняем их под следующий календарный день
      if (nightMeals.length > 0) {
        const nextDayISO = getNextDay(day.date);
        const nextDayKey = getKey(nextDayISO);
        const existingNextDay = readExisting(nextDayKey);
        
        // Мержим ночные приёмы с существующими данными следующего дня
        // Фильтруем старые ночные приёмы (по id) и добавляем новые
        const nightMealIds = new Set(nightMeals.map(m => m.id));
        const existingNonNightMeals = (existingNextDay?.meals || []).filter(m => !isNightTime(m.time));
        const existingOtherNightMeals = (existingNextDay?.meals || []).filter(m => isNightTime(m.time) && !nightMealIds.has(m.id));
        
        const nextDayPayload = {
          ...(existingNextDay || {}),
          date: nextDayISO,
          meals: [...existingNonNightMeals, ...existingOtherNightMeals, ...nightMeals],
          updatedAt,
        };
        saveToDate(nextDayISO, nextDayPayload);
      }
      
      prevStoredSnapRef.current = JSON.stringify(currentDayPayload);
      prevDaySnapRef.current = daySnap;
    },[day,now,saveToDate,stripMeta,disabled,isNightTime,getNextDay,getKey,readExisting]);

    React.useEffect(()=>{
      if(!day || !day.date) return;
      const key = getKey(day);
      const current = readExisting(key);
      if(current){
        prevStoredSnapRef.current = JSON.stringify(current);
        prevDaySnapRef.current = JSON.stringify(stripMeta(current));
      }else{
        prevDaySnapRef.current = JSON.stringify(stripMeta(day));
      }
    },[day && day.date,getKey,readExisting,stripMeta]);

    React.useEffect(()=>{
      if(disabled) return; // ЗАЩИТА: не запускать таймер до гидратации
      if(!day || !day.date) return;
      const daySnap = JSON.stringify(stripMeta(day));
      if(prevDaySnapRef.current === daySnap) return;
      global.clearTimeout(timerRef.current);
      timerRef.current = global.setTimeout(flush,debounceMs);
      return ()=>{ global.clearTimeout(timerRef.current); };
    },[day,debounceMs,flush,stripMeta,disabled]);

    React.useEffect(()=>{
      return ()=>{
        global.clearTimeout(timerRef.current);
        if(!disabled) flush(); // ЗАЩИТА: не сохранять при unmount если не гидратировано
      };
    },[flush,disabled]);

    React.useEffect(()=>{
      const onVisChange=()=>{
        if(!disabled && global.document.visibilityState!=='visible') flush();
      };
      global.document.addEventListener('visibilitychange',onVisChange);
      global.addEventListener('pagehide',flush);
      return ()=>{
        global.document.removeEventListener('visibilitychange',onVisChange);
        global.removeEventListener('pagehide',flush);
      };
    },[flush]);

    return {flush};
  }

  // Хук для централизованной детекции мобильных устройств с поддержкой ротации
  function useMobileDetection(breakpoint = 768) {
    const [isMobile, setIsMobile] = React.useState(() => {
      if (typeof window === 'undefined') return false;
      return window.innerWidth <= breakpoint;
    });

    React.useEffect(() => {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      
      const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
      
      const handleChange = (e) => {
        setIsMobile(e.matches);
      };
      
      // Начальное значение
      setIsMobile(mediaQuery.matches);
      
      // Подписка на изменения (поддержка ротации экрана)
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback для старых браузеров
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }, [breakpoint]);

    return isMobile;
  }

  // Хук для Smart Prefetch — предзагрузка данных ±N дней при наличии интернета
  function useSmartPrefetch({
    currentDate,
    daysRange = 7,  // ±7 дней
    enabled = true
  }) {
    const prefetchedRef = React.useRef(new Set());
    const utils = getDayUtils();
    const lsGet = utils.lsGet || HEYS.utils?.lsGet;
    
    // Генерация списка дат для prefetch
    const getDatesToPrefetch = React.useCallback((centerDate) => {
      const dates = [];
      const center = new Date(centerDate);
      
      for (let i = -daysRange; i <= daysRange; i++) {
        const d = new Date(center);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().slice(0, 10));
      }
      
      return dates;
    }, [daysRange]);
    
    // Prefetch данных через Supabase (если доступно)
    const prefetchFromCloud = React.useCallback(async (dates) => {
      if (!navigator.onLine) return;
      if (!HEYS.cloud?.isAuthenticated?.()) return;
      
      const toFetch = dates.filter(d => !prefetchedRef.current.has(d));
      if (toFetch.length === 0) return;
      
      try {
        // Пометим как "в процессе" чтобы избежать дублирования
        toFetch.forEach(d => prefetchedRef.current.add(d));
        
        // Загружаем данные через cloud sync
        if (HEYS.cloud?.fetchDays) {
          await HEYS.cloud.fetchDays(toFetch);
        }
      } catch (error) {
        // Откатываем пометки при ошибке
        toFetch.forEach(d => prefetchedRef.current.delete(d));
      }
    }, []);
    
    // Prefetch при смене даты или восстановлении соединения
    React.useEffect(() => {
      if (!enabled || !currentDate) return;
      
      const dates = getDatesToPrefetch(currentDate);
      prefetchFromCloud(dates);
      
      // Подписка на восстановление соединения
      const handleOnline = () => {
        // Сбрасываем prefetch cache при восстановлении
        prefetchedRef.current.clear();
        prefetchFromCloud(getDatesToPrefetch(currentDate));
      };
      
      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    }, [currentDate, enabled, getDatesToPrefetch, prefetchFromCloud]);
    
    // Ручной триггер prefetch
    const triggerPrefetch = React.useCallback(() => {
      if (!currentDate) return;
      prefetchedRef.current.clear();
      prefetchFromCloud(getDatesToPrefetch(currentDate));
    }, [currentDate, getDatesToPrefetch, prefetchFromCloud]);
    
    return { triggerPrefetch };
  }

  // === Exports ===
  HEYS.dayHooks = {
    useDayAutosave,
    useMobileDetection,
    useSmartPrefetch
  };

})(window);
