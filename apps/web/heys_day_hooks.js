// heys_day_hooks.js — React hooks for Day component

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Импортируем утилиты из dayUtils
  const getDayUtils = () => HEYS.dayUtils || {};

  // Хук для централизованного автосохранения дня с учётом гонок и межвкладочной синхронизации
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

    const getKey = React.useCallback((payload)=> keyPrefix + ((payload && payload.date) ? payload.date : date),[keyPrefix,date]);

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

    const save = React.useCallback((payload)=>{
      if(!payload || !payload.date) return;
      const key = getKey(payload);
      const current = readExisting(key);
      const incomingUpdatedAt = payload.updatedAt!=null? payload.updatedAt: now();

      if(current && current.updatedAt > incomingUpdatedAt) return;
      if(current && current.updatedAt===incomingUpdatedAt && current._sourceId && current._sourceId > sourceIdRef.current) return;

      const toStore = {
        ...payload,
        schemaVersion: payload.schemaVersion!=null? payload.schemaVersion:3,
        updatedAt: incomingUpdatedAt,
        _sourceId: sourceIdRef.current,
      };

      try{
        lsSetFn(key,toStore);
        if(channelRef.current && !isUnmountedRef.current){ 
          try{
            channelRef.current.postMessage({type:'day:update',date:toStore.date,payload:toStore});
          }catch(e){}
        }
        prevStoredSnapRef.current = JSON.stringify(toStore);
        prevDaySnapRef.current = JSON.stringify(stripMeta(toStore));
      }catch(error){
        console.error('[AUTOSAVE] localStorage write failed:', error);
      }
    },[getKey,lsSetFn,now,readExisting,stripMeta]);

    const flush = React.useCallback(()=>{
      if(disabled) return; // ЗАЩИТА: не сохранять до гидратации
      if(isUnmountedRef.current || !day || !day.date) return;
      const payload = {...day, updatedAt: day.updatedAt!=null? day.updatedAt: now()};
      const daySnap = JSON.stringify(stripMeta(payload));
      if(prevDaySnapRef.current === daySnap) return;
      save(payload);
    },[day,now,save,stripMeta,disabled]);

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

  // === Exports ===
  HEYS.dayHooks = {
    useDayAutosave,
    useMobileDetection
  };

})(window);
