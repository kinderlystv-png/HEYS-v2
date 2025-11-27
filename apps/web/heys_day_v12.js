// heys_day_v12.js — DayTab component, daily tracking, meals, statistics

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  // Убрано избыточное логирование DayTab build

  function pad2(n){ return String(n).padStart(2,'0'); }
  function todayISO(){ const d=new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function fmtDate(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function parseISO(s){ const [y,m,d]=String(s||'').split('-').map(x=>parseInt(x,10)); if(!y||!m||!d) return new Date(); const dt=new Date(y,m-1,d); dt.setHours(12); return dt; }
  function uid(p){ return (p||'id')+Math.random().toString(36).slice(2,8); }
  function lsGet(k,d){
    try{
      if(HEYS.store && typeof HEYS.store.get==='function') {
        const result = HEYS.store.get(k,d);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('storage-op');
        }
        return result;
      }
      const v=JSON.parse(localStorage.getItem(k)); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('storage-op');
      }
      return v==null?d:v;
    }catch(e){ return d; }
  }
  function lsSet(k,v){
    try{
      if(HEYS.store && typeof HEYS.store.set==='function') {
        const result = HEYS.store.set(k,v);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('storage-op');
        }
        return result;
      }
      // Сначала пишем в localStorage для мгновенной доступности другим вкладкам
      try{ 
        localStorage.setItem(k, JSON.stringify(v)); 
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('storage-op');
        }
      }catch(e){}
      // Потом отправляем в облако (асинхронно)
      try{ window.HEYS.saveClientKey(k, v); }catch(e){}
    }catch(e){}
  }
  function clamp(n,a,b){ n=+n||0; if(n<a)return a; if(n>b)return b; return n; }
  const r1=v=>Math.round((+v||0)*10)/10;

  // Используем общие модели вместо локальных дубликатов
  const M = HEYS.models || {};
  function ensureDay(d,prof){ return (M.ensureDay? M.ensureDay(d,prof): (d||{})); }
  function buildProductIndex(ps){ return M.buildProductIndex? M.buildProductIndex(ps): {byId:new Map(),byName:new Map()}; }
  function getProductFromItem(it,idx){ return M.getProductFromItem? M.getProductFromItem(it,idx): null; }
  function per100(p){
    if(!p) return {kcal100:0,carbs100:0,prot100:0,fat100:0,simple100:0,complex100:0,bad100:0,good100:0,trans100:0,fiber100:0};
    if(M.computeDerivedProduct){
      const d=M.computeDerivedProduct(p);
      return {kcal100:d.kcal100,carbs100:d.carbs100,prot100:+p.protein100||0,fat100:d.fat100,simple100:+p.simple100||0,complex100:+p.complex100||0,bad100:+p.badFat100||0,good100:+p.goodFat100||0,trans100:+p.trans100||0,fiber100:+p.fiber100||0};
    }
    const s=+p.simple100||0,c=+p.complex100||0,pr=+p.protein100||0,b=+p.badFat100||0,g=+p.goodFat100||0,t=+p.trans100||0,fib=+p.fiber100||0; const carbs=+p.carbs100||(s+c); const fat=+p.fat100||(b+g+t); const kcal=+p.kcal100||(4*(pr+carbs)+8*fat); return {kcal100:kcal,carbs100:carbs,prot100:pr,fat100:fat,simple100:s,complex100:c,bad100:b,good100:g,trans100:t,fiber100:fib};
  }
  const scale=(v,g)=>Math.round(((+v||0)*(+g||0)/100)*10)/10;

  function loadMealsForDate(ds){ const keys=['heys_dayv2_'+ds,'heys_day_'+ds,'day_'+ds+'_meals','meals_'+ds,'food_'+ds]; for(const k of keys){ try{ const raw=localStorage.getItem(k); if(!raw)continue; const v=JSON.parse(raw); if(v&&Array.isArray(v.meals)) return v.meals; if(Array.isArray(v)) return v; }catch(e){} } return []; }

  // Хук для централизованного автосохранения дня с учётом гонок и межвкладочной синхронизации
  function useDayAutosave({
    day,
    date,
    lsSet,
    lsGetFn = lsGet,
    keyPrefix = 'heys_dayv2_',
    debounceMs = 500,
    now = () => Date.now(),
  }){
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
        const stored = lsGetFn? lsGetFn(key,null):null;
        if(stored && typeof stored==='object') return stored;
      }catch(e){}
      try{
        const raw = global.localStorage.getItem(key);
        return raw? JSON.parse(raw):null;
      }catch(e){ return null; }
    },[lsGetFn]);

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
        lsSet(key,toStore);
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
    },[getKey,lsSet,now,readExisting,stripMeta]);

    const flush = React.useCallback(()=>{
      if(isUnmountedRef.current || !day || !day.date) return;
      const payload = {...day, updatedAt: day.updatedAt!=null? day.updatedAt: now()};
      const daySnap = JSON.stringify(stripMeta(payload));
      if(prevDaySnapRef.current === daySnap) return;
      save(payload);
    },[day,now,save,stripMeta]);

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
      if(!day || !day.date) return;
      const daySnap = JSON.stringify(stripMeta(day));
      if(prevDaySnapRef.current === daySnap) return;
      global.clearTimeout(timerRef.current);
      timerRef.current = global.setTimeout(flush,debounceMs);
      return ()=>{ global.clearTimeout(timerRef.current); };
    },[day,debounceMs,flush,stripMeta]);

    React.useEffect(()=>{
      return ()=>{
        global.clearTimeout(timerRef.current);
        flush();
      };
    },[flush]);

    React.useEffect(()=>{
      const onVisChange=()=>{
        if(global.document.visibilityState!=='visible') flush();
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

  // Lightweight signature for products (ids/names only)
  function productsSignature(ps){ return (ps||[]).map(p=>p&& (p.id||p.product_id||p.name)||'').join('|'); }
  // Cached popular products (per month + signature + TTL)
  const POPULAR_CACHE = {}; // key => {ts, list}
  function computePopularProducts(ps, iso){
    const sig = productsSignature(ps);
    const monthKey = (iso||todayISO()).slice(0,7); // YYYY-MM
    const key = monthKey+'::'+sig;
    const now = Date.now();
    const ttl = 1000*60*10; // 10 минут
    const cached = POPULAR_CACHE[key];
    if (cached && (now - cached.ts) < ttl) return cached.list;
    const idx=buildProductIndex(ps), base=iso?new Date(iso):new Date(), cnt=new Map();
    for(let i=0;i<30;i++){
      const d=new Date(base); d.setDate(d.getDate()-i);
      (loadMealsForDate(fmtDate(d))||[]).forEach(m=>{ ((m&&m.items)||[]).forEach(it=>{ const p=getProductFromItem(it,idx); if(!p)return; const k=String(p.id??p.product_id??p.name); cnt.set(k,(cnt.get(k)||0)+1); }); });
    }
    const arr=[]; cnt.forEach((c,k)=>{ let p=idx.byId.get(String(k))||idx.byName.get(String(k).trim().toLowerCase()); if(p) arr.push({p,c}); });
    arr.sort((a,b)=>b.c-a.c);
    const list = arr.slice(0,20).map(x=>x.p);
    POPULAR_CACHE[key] = { ts: now, list };
    return list;
  }

  function getProfile(){ const p=lsGet('heys_profile',{})||{}; const g=(p.gender||p.sex||'Мужской'); const sex=(String(g).toLowerCase().startsWith('ж')?'female':'male'); return {sex,height:+p.height||175,age:+p.age||30, sleepHours:+p.sleepHours||8, weight:+p.weight||70, deficitPctTarget:+p.deficitPctTarget||0}; }
  function calcBMR(w,prof){ const h=+prof.height||175,a=+prof.age||30,sex=(prof.sex||'male'); return Math.round(10*(+w||0)+6.25*h-5*a+(sex==='female'?-161:5)); }
  function kcalPerMin(met,w){ return Math.round((((+met||0)*(+w||0)*0.0175)-1)*10)/10; }
  function stepsKcal(steps,w,sex,len){ const coef=(sex==='female'?0.5:0.57); const km=(+steps||0)*(len||0.7)/1000; return Math.round(coef*(+w||0)*km*10)/10; }
  function parseTime(t){ if(!t||typeof t!=='string'||!t.includes(':')) return null; const [hh,mm]=t.split(':').map(x=>parseInt(x,10)); if(isNaN(hh)||isNaN(mm)) return null; return {hh:clamp(hh,0,23),mm:clamp(mm,0,59)}; }
  function sleepHours(a,b){ const s=parseTime(a),e=parseTime(b); if(!s||!e) return 0; let sh=s.hh+s.mm/60,eh=e.hh+e.mm/60; let d=eh-sh; if(d<0) d+=24; return r1(d); }

  // Форматирование даты для отображения
  function formatDateDisplay(isoDate) {
    const d = parseISO(isoDate);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const isToday = d.toDateString() === today.toDateString();
    const isYesterday = d.toDateString() === yesterday.toDateString();
    
    const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    const dayNum = d.getDate();
    const month = d.toLocaleDateString('ru-RU', { month: 'short' });
    
    if (isToday) return { label: 'Сегодня', sub: `${dayNum} ${month}` };
    if (isYesterday) return { label: 'Вчера', sub: `${dayNum} ${month}` };
    return { label: `${dayNum} ${month}`, sub: dayName };
  }

  // Компактный DatePicker с dropdown
  function DatePicker({valueISO, onSelect, onRemove}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [cur, setCur] = React.useState(parseISO(valueISO || todayISO()));
    const wrapperRef = React.useRef(null);
    
    React.useEffect(() => { setCur(parseISO(valueISO || todayISO())); }, [valueISO]);
    
    // Закрытие при клике вне
    React.useEffect(() => {
      function handleClickOutside(e) {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      }
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [isOpen]);
    
    const y = cur.getFullYear(), m = cur.getMonth();
    const first = new Date(y, m, 1), start = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));
    
    function same(a, b) {
      return a && b && a.getFullYear() === b.getFullYear() && 
             a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    
    const sel = parseISO(valueISO || todayISO());
    const today = new Date(); today.setHours(12);
    const dateInfo = formatDateDisplay(valueISO || todayISO());
    const isToday = sel.toDateString() === today.toDateString();
    
    return React.createElement('div', { className: 'date-picker', ref: wrapperRef },
      // Кнопка-триггер
      React.createElement('button', {
        className: 'date-picker-trigger' + (isOpen ? ' open' : ''),
        onClick: () => setIsOpen(!isOpen)
      },
        React.createElement('span', { className: 'date-picker-icon' }, '📅'),
        React.createElement('span', { className: 'date-picker-text' },
          React.createElement('span', { className: 'date-picker-main' }, dateInfo.label),
          React.createElement('span', { className: 'date-picker-sub' }, dateInfo.sub)
        ),
        React.createElement('span', { className: 'date-picker-arrow' }, isOpen ? '▲' : '▼')
      ),
      // Dropdown с календарём
      isOpen && React.createElement('div', { className: 'date-picker-dropdown' },
        React.createElement('div', { className: 'date-picker-header' },
          React.createElement('button', { 
            className: 'date-picker-nav', 
            onClick: () => setCur(new Date(y, m - 1, 1)) 
          }, '‹'),
          React.createElement('span', { className: 'date-picker-title' },
            cur.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
          ),
          React.createElement('button', { 
            className: 'date-picker-nav', 
            onClick: () => setCur(new Date(y, m + 1, 1)) 
          }, '›')
        ),
        React.createElement('div', { className: 'date-picker-weekdays' },
          ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => 
            React.createElement('div', { key: d, className: 'date-picker-weekday' }, d)
          )
        ),
        React.createElement('div', { className: 'date-picker-days' },
          cells.map((dt, i) => dt == null
            ? React.createElement('div', { key: 'e' + i, className: 'date-picker-day empty' })
            : React.createElement('div', {
                key: dt.toISOString(),
                className: [
                  'date-picker-day',
                  same(dt, sel) ? 'selected' : '',
                  same(dt, today) ? 'today' : ''
                ].join(' ').trim(),
                onClick: () => { onSelect(fmtDate(dt)); setIsOpen(false); }
              }, dt.getDate())
          )
        ),
        React.createElement('div', { className: 'date-picker-footer' },
          React.createElement('button', {
            className: 'date-picker-btn today-btn',
            onClick: () => { onSelect(todayISO()); setIsOpen(false); }
          }, '📍 Сегодня'),
          React.createElement('button', {
            className: 'date-picker-btn delete-btn',
            onClick: () => { onRemove(); setIsOpen(false); }
          }, '🗑️ Очистить')
        )
      )
    );
  }

  // Экспортируем DatePicker для использования в шапке
  HEYS.DatePicker = DatePicker;

  function Calendar({valueISO,onSelect,onRemove}){
    const [cur,setCur]=React.useState(parseISO(valueISO||todayISO()));
    React.useEffect(()=>{ setCur(parseISO(valueISO||todayISO())); },[valueISO]);
    const y=cur.getFullYear(),m=cur.getMonth(),first=new Date(y,m,1),start=(first.getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
    const cells=[]; for(let i=0;i<start;i++) cells.push(null); for(let d=1;d<=dim;d++) cells.push(new Date(y,m,d));
    function same(a,b){ return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
    const sel=parseISO(valueISO||todayISO()); const today=new Date(); today.setHours(12);
    return React.createElement('div',{className:'calendar card'},
      React.createElement('div',{className:'cal-head'},
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m-1,1))},'‹'),
        React.createElement('div',{className:'cal-title'},cur.toLocaleString('ru-RU',{month:'long',year:'numeric'})),
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m+1,1))},'›')
      ),
      React.createElement('div',{className:'cal-grid cal-dow'},['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>React.createElement('div',{key:d},d))),
      React.createElement('div',{className:'cal-grid'}, cells.map((dt,i)=> dt==null?React.createElement('div',{key:'e'+i}):React.createElement('div',{key:dt.toISOString(),className:['cal-cell',same(dt,sel)?'sel':'',same(dt,today)?'today':''].join(' ').trim(),onClick:()=>onSelect(fmtDate(dt))},dt.getDate()))),
      React.createElement('div',{className:'cal-foot'},
        React.createElement('button',{className:'btn',onClick:()=>onSelect(todayISO())},'Сегодня'),
        React.createElement('button',{className:'btn',onClick:onRemove},'Удалить')
      )
    );
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

  HEYS.DayTab=function DayTab(props){
  const {useState,useMemo,useEffect}=React;
  
  // Дата приходит из шапки App (DatePicker в header)
  const { selectedDate, setSelectedDate } = props;
  
  // Трекинг просмотра дня
  useEffect(() => {
    if (window.HEYS && window.HEYS.analytics) {
      window.HEYS.analytics.trackDataOperation('day-viewed');
    }
  }, []);
  
  const [products, setProducts] = useState(() => {
    // Используем HEYS.store.get для получения продуктов с учетом client_id
    if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.get === 'function') {
      const stored = window.HEYS.store.get('heys_products', []);
      if (window.HEYS && window.HEYS.analytics && Array.isArray(stored)) {
        window.HEYS.analytics.trackDataOperation('products-loaded', stored.length);
      }
      return Array.isArray(stored) ? stored : [];
    } else if (window.HEYS && window.HEYS.products && typeof window.HEYS.products.getAll === 'function') {
      // Fallback к products API
      const stored = window.HEYS.products.getAll();
      if (window.HEYS && window.HEYS.analytics && Array.isArray(stored)) {
        window.HEYS.analytics.trackDataOperation('products-loaded', stored.length);
      }
      return stored;
    } else {
      // Последний fallback к localStorage (может не работать с client_id)
      const stored = window.HEYS.utils.lsGet('heys_products', []);
      if (window.HEYS && window.HEYS.analytics && Array.isArray(stored)) {
        window.HEYS.analytics.trackDataOperation('products-loaded', stored.length);
      }
      return Array.isArray(stored) ? stored : [];
    }
  });
  const prodSig = useMemo(()=>productsSignature(products), [products]);
  const pIndex = useMemo(()=>buildProductIndex(products),[prodSig]);

  // Debug info (minimal)
  window.HEYS.debug = window.HEYS.debug || {};
  window.HEYS.debug.dayProducts = products;
  window.HEYS.debug.dayProductIndex = pIndex;

  // Подписка на события обновления продуктов
  useEffect(() => {
    const handleProductsUpdate = (event) => {
      if (event.detail?.products) {
        setProducts(event.detail.products);
      }
    };

    window.addEventListener('heysProductsUpdated', handleProductsUpdate);
    return () => window.removeEventListener('heysProductsUpdated', handleProductsUpdate);
  }, []);

  // Подгружать продукты из облака при смене клиента
  useEffect(() => {
    const clientId = window.HEYS && window.HEYS.currentClientId;
    const cloud = window.HEYS && window.HEYS.cloud;
    if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
      const need = (typeof cloud.shouldSyncClient === 'function') ? cloud.shouldSyncClient(clientId, 4000) : true;
      if (need) {
        cloud.bootstrapClientSync(clientId).then(() => {
          const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || 
                        (window.HEYS.products && window.HEYS.products.getAll && window.HEYS.products.getAll()) || [];
          setProducts(Array.isArray(latest) ? latest : []);
        });
      } else {
        const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || 
                      (window.HEYS.products && window.HEYS.products.getAll && window.HEYS.products.getAll()) || [];
        setProducts(Array.isArray(latest) ? latest : []);
      }
    } else {
      const latest = (window.HEYS.store && window.HEYS.store.get && window.HEYS.store.get('heys_products', null)) || 
                    (window.HEYS.products && window.HEYS.products.getAll && window.HEYS.products.getAll()) || [];
      setProducts(Array.isArray(latest) ? latest : []);
    }
  }, [window.HEYS && window.HEYS.currentClientId]);
  const prof=getProfile();
  // date приходит из props (selectedDate из App header)
  const date = selectedDate || todayISO();
  const setDate = setSelectedDate;
  // State for collapsed/expanded meals (mobile) - с кэшированием в sessionStorage
  const expandedMealsKey = 'heys_expandedMeals_' + date;
  const [expandedMeals, setExpandedMeals] = useState(() => {
    try {
      const cached = sessionStorage.getItem(expandedMealsKey);
      return cached ? JSON.parse(cached) : {};
    } catch (e) {
      return {};
    }
  });
  
  // Сохраняем состояние при изменении
  useEffect(() => {
    try {
      sessionStorage.setItem(expandedMealsKey, JSON.stringify(expandedMeals));
    } catch (e) {}
  }, [expandedMeals, expandedMealsKey]);
  
  const toggleMealExpand = (mealIndex) => {
    setExpandedMeals(prev => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
  };
  
  // Функция для разворачивания нового приёма и сворачивания остальных
  const expandOnlyMeal = (mealIndex) => {
    const newState = {};
    newState[mealIndex] = true;
    setExpandedMeals(newState);
  };
  
  // Централизованная детекция мобильного устройства (с поддержкой ротации)
  const isMobile = useMobileDetection(768);
  
  // Проверка: развёрнут ли приём (последний по умолчанию развёрнут)
  const isMealExpanded = (mealIndex, totalMeals) => {
    // Если есть явное состояние — используем его
    if (expandedMeals.hasOwnProperty(mealIndex)) {
      return expandedMeals[mealIndex];
    }
    // Иначе последний развёрнут по умолчанию
    return mealIndex === totalMeals - 1;
  };
  const [day,setDay]=useState(()=>{ 
    const key = 'heys_dayv2_'+date;
    const v=lsGet(key,null); 
    if (v && v.date) {
      return ensureDay(v, prof);
    } else {
      // Для нового дня устанавливаем пустые значения
      return ensureDay({
        date: date,
        meals: [],
        trainings: [{ z: [0,0,0,0] }, { z: [0,0,0,0] }],
        sleepStart: '',
        sleepEnd: '',
        sleepQuality: '',
        sleepNote: '',
        dayScore: '',
        moodAvg: '',
        wellbeingAvg: '',
        stressAvg: '',
        dayComment: ''
      }, prof);
    }
  });

  // Обновлять day при смене даты (из DatePicker в шапке)
  useEffect(() => {
    const key = 'heys_dayv2_' + date;
    const v = lsGet(key, null);
    const profNow = getProfile();
    if (v && v.date) {
      setDay(ensureDay(v, profNow));
    } else {
      setDay(ensureDay({ 
        date: date, 
        meals: (loadMealsForDate(date) || []), 
        trainings: [{ z:[0,0,0,0] }, { z:[0,0,0,0] }],
        weightMorning: '',
        deficitPct: '',
        sleepStart: '',
        sleepEnd: '',
        sleepQuality: '',
        sleepNote: '',
        dayScore: '',
        moodAvg: '',
        wellbeingAvg: '',
        stressAvg: '',
        dayComment: ''
      }, profNow));
    }
  }, [date]);

    const { flush } = useDayAutosave({ day, date, lsSet, lsGetFn: lsGet });

    useEffect(() => {
      HEYS.Day = HEYS.Day || {};
      HEYS.Day.requestFlush = flush;
      return () => {
        if (HEYS.Day && HEYS.Day.requestFlush === flush) {
          delete HEYS.Day.requestFlush;
        }
      };
    }, [flush]);

    // Логирование для диагностики рассинхрона продуктов и приёмов пищи
    useEffect(() => {
  // ...existing code...
    }, [products, day]);

  // ...existing code...

  // ...existing code...

  // ...existing code...

  // ...удалены дублирующиеся объявления useState...
  useEffect(()=>{ lsSet('heys_dayv2_date',date); },[date]);

    // Подгружать данные дня из облака при смене даты
    useEffect(() => {
      let cancelled = false;
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      const doLocal = () => {
        if (cancelled) return;
        const profNow = getProfile();
        const key = 'heys_dayv2_' + date;
        const v = lsGet(key, null);
        if (v && v.date) {
          setDay(ensureDay(v, profNow));
        } else {
          // create a clean default day for the selected date (don't inherit previous trainings)
          const defaultDay = ensureDay({ 
            date: date, 
            meals: (loadMealsForDate(date) || []), 
            trainings: [{ z: [0,0,0,0] }, { z: [0,0,0,0] }],
            // Явно устанавливаем пустые значения для полей сна и оценки
            sleepStart: '',
            sleepEnd: '',
            sleepQuality: '',
            sleepNote: '',
            dayScore: '',
            moodAvg: '',
            wellbeingAvg: '',
            stressAvg: '',
            dayComment: ''
          }, profNow);
          setDay(defaultDay);
        }
        
        // Обновляем продукты после смены даты
        const currentProducts = lsGet('heys_products', null);
        if (currentProducts && Array.isArray(currentProducts)) {
          setProducts(currentProducts);
        }
      };
      if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
        if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true){
          cloud.bootstrapClientSync(clientId).then(() => {
            // Даем время на то, чтобы событие heysProductsUpdated отправилось
            setTimeout(doLocal, 150);
          });
        } else {
          doLocal();
        }
      } else {
        doLocal();
      }
      return () => { cancelled = true; };
    }, [date]);

    const z= (lsGet('heys_hr_zones',[]).map(x=>+x.MET||0)); const mets=[2.5,6,8,10].map((_,i)=>z[i]||[2.5,6,8,10][i]);
    const weight=+day.weightMorning||+prof.weight||70; const kcalMin=mets.map(m=>kcalPerMin(m,weight));
    const trainK= t=>(t.z||[0,0,0,0]).reduce((s,min,i)=> s+r1((+min||0)*(kcalMin[i]||0)),0);
    const TR=(day.trainings&&Array.isArray(day.trainings)&&day.trainings.length>=2)?day.trainings:[{z:[0,0,0,0]},{z:[0,0,0,0]}];
  const train1k=trainK(TR[0]), train2k=trainK(TR[1]);
  const stepsK=stepsKcal(day.steps||0,weight,prof.sex,0.7);
  const householdK=r1((+day.householdMin||0)*kcalPerMin(2.5,weight));
  const actTotal=r1(train1k+train2k+stepsK+householdK);
  const bmr=calcBMR(weight,prof), tdee=r1(bmr+actTotal);
  const profileTargetDef=(lsGet('heys_profile',{}).deficitPctTarget||0); // отрицательное число для дефицита
  const dayTargetDef = (day.deficitPct != null ? day.deficitPct : profileTargetDef); // используем дефицит дня, если есть
  const optimum=r1(tdee*(1+dayTargetDef/100));

  const eatenKcal=(day.meals||[]).reduce((a,m)=>{ const t=(M.mealTotals? M.mealTotals(m,pIndex): {kcal:0}); return a+(t.kcal||0); },0);
  const factDefPct = tdee? r1(((eatenKcal - tdee)/tdee)*100) : 0; // <0 значит дефицит

  // Диагностический лог для отладки расхождений между Днём и Отчётностью
  if (window._HEYS_DEBUG_TDEE) {
    console.group('HEYS_TDEE_DEBUG [DAY] Расчёт для', day.date);
    console.log('HEYS_TDEE_DEBUG [DAY] Входные данные:');
    console.log('HEYS_TDEE_DEBUG [DAY]   weightMorning:', day.weightMorning, '| профиль weight:', prof.weight, '| итог weight:', weight);
    console.log('HEYS_TDEE_DEBUG [DAY]   steps:', day.steps, '| householdMin:', day.householdMin);
    console.log('HEYS_TDEE_DEBUG [DAY]   trainings:', JSON.stringify(TR));
    console.log('HEYS_TDEE_DEBUG [DAY]   HR zones (MET):', JSON.stringify(z));
    console.log('HEYS_TDEE_DEBUG [DAY] Промежуточные расчёты:');
    console.log('HEYS_TDEE_DEBUG [DAY]   BMR:', bmr);
    console.log('HEYS_TDEE_DEBUG [DAY]   train1k:', train1k, '| train2k:', train2k);
    console.log('HEYS_TDEE_DEBUG [DAY]   stepsK:', stepsK, '| householdK:', householdK);
    console.log('HEYS_TDEE_DEBUG [DAY]   actTotal:', actTotal);
    console.log('HEYS_TDEE_DEBUG [DAY] Итоговые значения:');
    console.log('HEYS_TDEE_DEBUG [DAY]   tdee (Общие затраты):', tdee);
    console.log('HEYS_TDEE_DEBUG [DAY]   eatenKcal (съедено):', r1(eatenKcal));
    console.log('HEYS_TDEE_DEBUG [DAY]   optimum (нужно съесть):', optimum);
    console.log('HEYS_TDEE_DEBUG [DAY]   factDefPct:', factDefPct + '%');
    console.groupEnd();
  }

    function updateTraining(i,zi,mins){
      const arr=(day.trainings||[{z:[0,0,0,0]},{z:[0,0,0,0]}]).map((t,idx)=> idx===i? {z:t.z.map((v,j)=> j===zi?(+mins||0):v)}:t);
      const newDay = {...day, trainings:arr};
      setDay(newDay);
    }

    // Компонент для поиска и добавления продукта в конкретный приём
    function MealAddProduct({mi}){
      const [search, setSearch] = React.useState('');
      const [open, setOpen] = React.useState(false);
      const [selectedIndex, setSelectedIndex] = React.useState(-1);
      const [dropdownPos, setDropdownPos] = React.useState({top:0, left:0, width:0});
      const inputRef = React.useRef(null);
      
      // Обновление позиции выпадашки
      const updateDropdownPos = React.useCallback(() => {
        if (inputRef.current) {
          const rect = inputRef.current.getBoundingClientRect();
          setDropdownPos({top: rect.bottom + 4, left: rect.left, width: rect.width});
        }
      }, []);
      
      // Слушаем скролл и ресайз когда открыто
      React.useEffect(() => {
        if (!open) return;
        updateDropdownPos();
        const handleScroll = () => updateDropdownPos();
        window.addEventListener('scroll', handleScroll, true); // capture для вложенных скроллов
        window.addEventListener('resize', handleScroll);
        return () => {
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('resize', handleScroll);
        };
      }, [open, updateDropdownPos]);
      
      const top20 = React.useMemo(()=>computePopularProducts(products,date),[prodSig,date.slice(0,7)]);
      const lc = String(search||'').trim().toLowerCase();
      
      // Используем умный поиск с исправлением опечаток если доступен
      const candidates = React.useMemo(() => {
        if (!lc) {
          return top20 && top20.length ? top20 : products.slice(0,20);
        }
        
        // Если доступен умный поиск, используем его
        if (window.HEYS && window.HEYS.SmartSearchWithTypos) {
          try {
            const smartResult = window.HEYS.SmartSearchWithTypos.search(lc, products, {
              enablePhonetic: true,
              enableSynonyms: true,
              maxSuggestions: 20
            });
            
            if (smartResult && smartResult.results && smartResult.results.length > 0) {
              return smartResult.results;
            }
          } catch (error) {
            DEV.warn('[HEYS] Ошибка умного поиска, используем обычный:', error);
          }
        }
        
        // Fallback к обычному поиску
        return products.filter(p=>String(p.name||'').toLowerCase().includes(lc)).slice(0,20);
      }, [lc, products, top20]);
      
      // Сброс выбранного индекса при изменении кандидатов
      React.useEffect(() => {
        setSelectedIndex(-1);
      }, [candidates.length, search]);
      
      // Функция добавления продукта с фокусом на поле граммов
      const addProductAndFocusGrams = React.useCallback((product) => {
        const newItem = {id:uid('it_'), product_id:product.id??product.product_id, name:product.name, grams:100};
        const meals = day.meals.map((m,i)=> i===mi? {...m, items:[...(m.items||[]), newItem]}:m);
        setDay({...day, meals});
        setSearch(''); 
        setOpen(false);
        
        // Фокус на поле граммов нового продукта через itemId
        setTimeout(() => {
          // Ищем input с конкретными data-атрибутами для нашего приема пищи
          const targetInput = document.querySelector(`input[data-grams-input="true"][data-meal-index="${mi}"][data-item-id="${newItem.id}"]`);
          if (targetInput) {
            targetInput.focus();
            targetInput.select();
          } else {
            // Fallback: ищем последний input в конкретной таблице приема пищи
            const mealTables = document.querySelectorAll('.meals-table');
            if (mealTables[mi]) {
              const gramsInputs = mealTables[mi].querySelectorAll('input[data-grams-input="true"]');
              const lastGramsInput = gramsInputs[gramsInputs.length - 1];
              if (lastGramsInput) {
                lastGramsInput.focus();
                lastGramsInput.select();
              }
            }
          }
        }, 200);
      }, [mi, day.meals, setDay]);
      
      // Обработка клавиш для навигации
      const handleKeyDown = React.useCallback((e) => {
        if (!open || candidates.length === 0) return;
        
        switch(e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setSelectedIndex(prev => prev < candidates.length - 1 ? prev + 1 : 0);
            break;
          case 'ArrowUp':
            e.preventDefault();
            setSelectedIndex(prev => prev > 0 ? prev - 1 : candidates.length - 1);
            break;
          case 'Enter':
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < candidates.length) {
              addProductAndFocusGrams(candidates[selectedIndex]);
            } else if (candidates.length > 0) {
              addProductAndFocusGrams(candidates[0]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            setOpen(false);
            setSelectedIndex(-1);
            break;
        }
      }, [open, candidates, selectedIndex, addProductAndFocusGrams]);
      
      // Проверка мобильного viewport
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      
      // Флаг: показываем частые продукты (когда поле пустое)
      const showingFrequent = !lc;
      
      // Выпадающий список — рендерится через Portal только на мобильных
      const dropdownContent = open && candidates.length > 0 ? React.createElement('div', {
        className: 'suggest-list' + (isMobile ? ' suggest-list-portal' : ''),
        style: isMobile && dropdownPos.width > 0 ? {
          position: 'fixed',
          top: dropdownPos.top,
          left: dropdownPos.left,
          width: dropdownPos.width,
          zIndex: 9999
        } : undefined
      },
        // Заголовок "Частые продукты" когда поле пустое
        showingFrequent && React.createElement('div', { className: 'suggest-header' }, 
          '⭐ Частые продукты'
        ),
        (candidates||[]).map((p, index) => React.createElement('div', {
          key:(p.id||p.name),
          className: `suggest-item ${index === selectedIndex ? 'selected' : ''}`,
          onMouseDown:()=>{ addProductAndFocusGrams(p); },
          onMouseEnter:()=>{ setSelectedIndex(index); },
          ref: index === selectedIndex ? (el) => {
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } : null
        }, 
        React.createElement('span', null, p.name),
        React.createElement('small', {style:{color:'var(--muted)', fontSize:'11px', marginLeft:'8px', fontWeight:'normal'}}, 
          `${Math.round((p.kcal100 || 0))} ккал/100г`
        )
        ))
      ) : null;
      
      return React.createElement('div', {className:'row suggest-wrap', style:{flex:1, position:'relative'}},
        React.createElement('div', {style:{width:'100%', position:'relative'}},
          React.createElement('input', {
            ref: inputRef,
            placeholder:'🔍 Поиск продукта... (↑↓ навигация, Enter выбор, Esc закрыть)',
            value:search,
            style:{width:'100%', fontSize:'13px'},
            onFocus:()=>{setOpen(true);},
            onBlur:()=>setTimeout(()=>setOpen(false),200),
            onChange:e=>{setSearch(e.target.value); setOpen(true);},
            onKeyDown: handleKeyDown
          }),
          search && React.createElement('div', {
            style:{
              position:'absolute', 
              right:'8px', 
              top:'50%', 
              transform:'translateY(-50%)', 
              fontSize:'11px', 
              color:'var(--muted)',
              pointerEvents:'none'
            }
          }, `${candidates.length} найдено`),
          // На мобильных — Portal в body, на десктопе — обычный dropdown
          isMobile && dropdownContent ? ReactDOM.createPortal(dropdownContent, document.body) : dropdownContent
        )
      );
    }

    // Функция для вычисления средних оценок из приёмов пищи
    function calculateMealAverages(meals) {
      if (!meals || !meals.length) return { moodAvg: '', wellbeingAvg: '', stressAvg: '' };
      
      const validMoods = meals.filter(m => m.mood && !isNaN(+m.mood)).map(m => +m.mood);
      const validWellbeing = meals.filter(m => m.wellbeing && !isNaN(+m.wellbeing)).map(m => +m.wellbeing);
      const validStress = meals.filter(m => m.stress && !isNaN(+m.stress)).map(m => +m.stress);
      
      const moodAvg = validMoods.length ? r1(validMoods.reduce((sum, val) => sum + val, 0) / validMoods.length) : '';
      const wellbeingAvg = validWellbeing.length ? r1(validWellbeing.reduce((sum, val) => sum + val, 0) / validWellbeing.length) : '';
      const stressAvg = validStress.length ? r1(validStress.reduce((sum, val) => sum + val, 0) / validStress.length) : '';
      
      return { moodAvg, wellbeingAvg, stressAvg };
    }

    // Автоматическое обновление средних оценок при изменении приёмов пищи
    useEffect(() => {
      const averages = calculateMealAverages(day.meals);
      if (averages.moodAvg !== day.moodAvg || averages.wellbeingAvg !== day.wellbeingAvg || averages.stressAvg !== day.stressAvg) {
        setDay(prevDay => ({
          ...prevDay,
          moodAvg: averages.moodAvg,
          wellbeingAvg: averages.wellbeingAvg,
          stressAvg: averages.stressAvg
        }));
      }
    }, [day.meals?.map(m => `${m.mood}-${m.wellbeing}-${m.stress}`).join('|')]);

    // === iOS-style Time Picker Modal (mobile only) ===
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [pendingMealTime, setPendingMealTime] = useState({hours: 12, minutes: 0});
    const [editingMealIndex, setEditingMealIndex] = useState(null); // null = новый, число = редактирование
    const [editMode, setEditMode] = useState('new'); // 'new' | 'time' | 'mood'
    
    // === Grams Picker Modal (mobile only) ===
    const [showGramsPicker, setShowGramsPicker] = useState(false);
    const [gramsPickerTarget, setGramsPickerTarget] = useState(null); // {mealIndex, itemId, currentGrams}
    const [pendingGrams, setPendingGrams] = useState(99); // индекс 99 = 100г
    const [gramsInputValue, setGramsInputValue] = useState(''); // для ручного ввода
    // Генерируем значения от 1 до 500 с шагом 1
    const gramsValues = useMemo(() => Array.from({length: 500}, (_, i) => String(i + 1)), []);
    
    // === Weight Picker Modal ===
    const [showWeightPicker, setShowWeightPicker] = useState(false);
    const [pendingWeightKg, setPendingWeightKg] = useState(70); // целые кг (40-150)
    const [pendingWeightG, setPendingWeightG] = useState(0); // десятые (0-9)
    const weightKgValues = useMemo(() => Array.from({length: 111}, (_, i) => String(40 + i)), []); // 40-150 кг
    const weightGValues = useMemo(() => Array.from({length: 10}, (_, i) => String(i)), []); // 0-9
    
    function openWeightPicker() {
      // Находим последний введённый вес (сегодня или за прошлые дни)
      let lastWeight = day.weightMorning;
      if (!lastWeight) {
        // Ищем в прошлых днях (до 60 дней назад)
        const today = new Date(date);
        for (let i = 1; i <= 60; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const dayKey = 'heys_dayv2_' + dateStr;
          const dayData = lsGet(dayKey, null);
          if (dayData && dayData.weightMorning && dayData.weightMorning > 0) {
            lastWeight = dayData.weightMorning;
            break;
          }
        }
      }
      const currentWeight = lastWeight || 70;
      const kg = Math.floor(currentWeight);
      const g = Math.round((currentWeight - kg) * 10);
      setPendingWeightKg(Math.max(0, Math.min(110, kg - 40))); // индекс от 0 (40кг) до 110 (150кг)
      setPendingWeightG(g);
      setShowWeightPicker(true);
    }
    
    function confirmWeightPicker() {
      const newWeight = (40 + pendingWeightKg) + pendingWeightG / 10;
      const prof = getProfile();
      const shouldSetDeficit = (!day.weightMorning || day.weightMorning === '') && newWeight && (!day.deficitPct && day.deficitPct !== 0);
      setDay({
        ...day,
        weightMorning: newWeight,
        deficitPct: shouldSetDeficit ? (prof.deficitPctTarget || 0) : day.deficitPct
      });
      setShowWeightPicker(false);
    }
    
    function cancelWeightPicker() {
      setShowWeightPicker(false);
    }
    
    function openGramsPicker(mealIndex, itemId, currentGrams) {
      const gramsNum = parseInt(currentGrams) || 100;
      // Индекс = значение - 1 (т.к. начинаем с 1)
      const closestIdx = Math.max(0, Math.min(499, gramsNum - 1));
      
      setGramsPickerTarget({ mealIndex, itemId, currentGrams: gramsNum });
      setPendingGrams(closestIdx);
      setGramsInputValue(String(gramsNum)); // синхронизируем input
      setShowGramsPicker(true);
    }
    
    // Обработка ручного ввода граммов
    function handleGramsInput(e) {
      const val = e.target.value.replace(/[^0-9]/g, ''); // только цифры
      setGramsInputValue(val);
      const num = parseInt(val) || 0;
      if (num >= 1 && num <= 500) {
        setPendingGrams(num - 1); // синхронизируем wheel
      }
    }
    
    // Синхронизация input при изменении wheel
    function handleGramsWheelChange(idx) {
      setPendingGrams(idx);
      setGramsInputValue(gramsValues[idx]);
    }
    
    function confirmGramsPicker() {
      if (gramsPickerTarget) {
        const newGrams = parseInt(gramsValues[pendingGrams]) || 100;
        setGrams(gramsPickerTarget.mealIndex, gramsPickerTarget.itemId, newGrams);
      }
      setShowGramsPicker(false);
      setGramsPickerTarget(null);
    }
    
    function cancelGramsPicker() {
      setShowGramsPicker(false);
      setGramsPickerTarget(null);
    }
    
    // Используем глобальный WheelColumn
    const WheelColumn = HEYS.WheelColumn;
    
    // Генерация значений для часов, минут и оценок 1-10
    const hoursValues = WheelColumn.presets.hours;
    const minutesValues = WheelColumn.presets.minutes;
    const ratingValues = WheelColumn.presets.rating;
    
    // Состояние для второго слайда (самочувствие)
    const [pickerStep, setPickerStep] = useState(1); // 1 = время, 2 = самочувствие
    const [pendingMealMood, setPendingMealMood] = useState({mood: 5, wellbeing: 5, stress: 5});
    
    // Открыть модалку для нового приёма
    function openTimePickerForNewMeal() {
      const now = new Date();
      setPendingMealTime({ hours: now.getHours(), minutes: now.getMinutes() });
      setPendingMealMood({ mood: 5, wellbeing: 5, stress: 5 });
      setEditingMealIndex(null);
      setEditMode('new');
      setPickerStep(1);
      setShowTimePicker(true);
    }
    
    // Открыть модалку для редактирования только времени
    function openTimeEditor(mealIndex) {
      const meal = day.meals[mealIndex];
      if (!meal) return;
      
      const timeParts = (meal.time || '').split(':');
      const hours = parseInt(timeParts[0]) || new Date().getHours();
      const minutes = parseInt(timeParts[1]) || 0;
      
      setPendingMealTime({ hours, minutes });
      setEditingMealIndex(mealIndex);
      setEditMode('time');
      setPickerStep(1);
      setShowTimePicker(true);
    }
    
    // Открыть модалку для редактирования только оценок
    function openMoodEditor(mealIndex) {
      const meal = day.meals[mealIndex];
      if (!meal) return;
      
      setPendingMealMood({
        mood: meal.mood ? ratingValues.indexOf(String(meal.mood)) : 5,
        wellbeing: meal.wellbeing ? ratingValues.indexOf(String(meal.wellbeing)) : 5,
        stress: meal.stress ? ratingValues.indexOf(String(meal.stress)) : 5
      });
      setEditingMealIndex(mealIndex);
      setEditMode('mood');
      setPickerStep(2);
      setShowTimePicker(true);
    }
    
    // Направление анимации: 'forward' или 'back'
    const [animDirection, setAnimDirection] = useState('forward');
    
    function goToMoodStep() {
      setAnimDirection('forward');
      setPickerStep(2);
    }
    
    function goBackToTimeStep() {
      setAnimDirection('back');
      setPickerStep(1);
    }
    
    // Подтверждение только времени (для редактирования)
    function confirmTimeEdit() {
      const timeStr = pad2(pendingMealTime.hours) + ':' + pad2(pendingMealTime.minutes);
      const updatedMeals = day.meals.map((m, i) => 
        i === editingMealIndex ? { ...m, time: timeStr } : m
      );
      setDay({ ...day, meals: updatedMeals });
      setShowTimePicker(false);
      setEditingMealIndex(null);
    }
    
    // Подтверждение только оценок (для редактирования)
    function confirmMoodEdit() {
      const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
      const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
      const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;
      const updatedMeals = day.meals.map((m, i) => 
        i === editingMealIndex ? { ...m, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal } : m
      );
      setDay({ ...day, meals: updatedMeals });
      setShowTimePicker(false);
      setEditingMealIndex(null);
    }
    
    function confirmMealCreation() {
      const timeStr = pad2(pendingMealTime.hours) + ':' + pad2(pendingMealTime.minutes);
      const moodVal = pendingMealMood.mood === 0 ? '' : pendingMealMood.mood;
      const wellbeingVal = pendingMealMood.wellbeing === 0 ? '' : pendingMealMood.wellbeing;
      const stressVal = pendingMealMood.stress === 0 ? '' : pendingMealMood.stress;
      
      if (editingMealIndex !== null) {
        // Этот кейс теперь только для нового приёма после 2х шагов
        const updatedMeals = day.meals.map((m, i) => 
          i === editingMealIndex 
            ? { ...m, time: timeStr, mood: moodVal, wellbeing: wellbeingVal, stress: stressVal }
            : m
        );
        setDay({ ...day, meals: updatedMeals });
      } else {
        // Создание нового
        const newMealIndex = day.meals.length;
        setDay({...day, meals:[...day.meals, {
          id: uid('m_'), 
          name: 'Приём', 
          time: timeStr, 
          mood: moodVal, 
          wellbeing: wellbeingVal, 
          stress: stressVal, 
          items: []
        }]});
        // Разворачиваем только новый приём
        expandOnlyMeal(newMealIndex);
      }
      
      setShowTimePicker(false);
      setPickerStep(1);
      setEditingMealIndex(null);
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation(editingMealIndex !== null ? 'meal-updated' : 'meal-created');
      }
    }
    
    function cancelTimePicker() {
      setShowTimePicker(false);
      setPickerStep(1);
      setEditingMealIndex(null);
      setEditMode('new');
    }

    // addMeal теперь открывает модалку на мобильных
    function addMeal(){ 
      if (isMobile) {
        openTimePickerForNewMeal();
      } else {
        // Десктоп — старое поведение
        const newMealIndex = day.meals.length;
        setDay({...day, meals:[...day.meals,{id:uid('m_'),name:'Приём',time:'',mood:'',wellbeing:'',stress:'',items:[]}]}); 
        expandOnlyMeal(newMealIndex);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('meal-created');
        }
      }
    }
    function removeMeal(i){ 
      const meals = day.meals.filter((_, idx) => idx !== i); 
      setDay({...day, meals}); 
    }
    function addProductToMeal(mi,p){ 
      const item={id:uid('it_'), product_id:p.id??p.product_id, name:p.name, grams:100}; 
      const meals=day.meals.map((m,i)=> i===mi? {...m, items:[...(m.items||[]), item]}:m); 
      setDay({...day, meals}); 
      
      // Автофокус на поле граммов нового продукта в конкретном приеме пищи
      setTimeout(() => {
        // Ищем input с конкретными data-атрибутами
        const targetInput = document.querySelector(`input[data-grams-input="true"][data-meal-index="${mi}"][data-item-id="${item.id}"]`);
        if (targetInput) {
          targetInput.focus();
          targetInput.select();
        } else {
          // Fallback
          const mealTables = document.querySelectorAll('.meals-table');
          if (mealTables[mi]) {
            const gramsInputs = mealTables[mi].querySelectorAll('input[data-grams-input="true"]');
            const lastGramsInput = gramsInputs[gramsInputs.length - 1];
            if (lastGramsInput) {
              lastGramsInput.focus();
              lastGramsInput.select();
            }
          }
        }
      }, 200);
    }
    function setGrams(mi, itId, g){ g=+g||0; const meals=day.meals.map((m,i)=> i===mi? {...m, items:(m.items||[]).map(it=> it.id===itId?{...it, grams:g}:it)}:m); setDay({...day, meals}); }
    function removeItem(mi, itId){ const meals=day.meals.map((m,i)=> i===mi? {...m, items:(m.items||[]).filter(it=>it.id!==itId)}:m); setDay({...day, meals}); }

    const sleepH = sleepHours(day.sleepStart, day.sleepEnd);

    // Автоматически обновляем sleepHours в объекте дня при изменении времени сна
    useEffect(() => {
      const calculatedSleepH = sleepHours(day.sleepStart, day.sleepEnd);
      if (calculatedSleepH !== day.sleepHours) {
        setDay(prevDay => ({...prevDay, sleepHours: calculatedSleepH}));
      }
    }, [day.sleepStart, day.sleepEnd]);

    // --- blocks
    const calendarBlock = React.createElement('div',{className:'area-cal'},
      React.createElement(Calendar,{
        valueISO:date,
        onSelect:(d)=>{
          // persist current day explicitly before switching date
          try{ flush(); }catch(e){}
          setDate(d);
          const v = lsGet('heys_dayv2_'+d,null);
          const profNow = getProfile();
          if (v && v.date) {
            setDay(ensureDay(v, profNow));
          } else {
            setDay(ensureDay({ 
              date: d, 
              meals: (loadMealsForDate(d) || []), 
              trainings: [{ z:[0,0,0,0] }, { z:[0,0,0,0] }],
              // Явно устанавливаем пустые значения для всех полей
              weightMorning: '',
              deficitPct: '',
              sleepStart: '',
              sleepEnd: '',
              sleepQuality: '',
              sleepNote: '',
              dayScore: '',
              moodAvg: '',
              wellbeingAvg: '',
              stressAvg: '',
              dayComment: ''
            }, profNow));
          }
        },
        onRemove:()=>{ 
          localStorage.removeItem('heys_dayv2_'+date); 
          const profNow = getProfile();
          setDay(ensureDay({
            date: date,
            meals:[], 
            steps:0, 
            trainings:[{z:[0,0,0,0]},{z:[0,0,0,0]}],
            // Очищаем поля сна и оценки дня
            sleepStart:'',
            sleepEnd:'',
            sleepQuality:'',
            sleepNote:'',
            dayScore:'',
            moodAvg:'',
            wellbeingAvg:'',
            stressAvg:'',
            dayComment:''
          }, profNow)); 
        }
      })
    );

    

const mainBlock = React.createElement('div', { className: 'area-main card tone-violet main-violet', id:'main-violet-block', style:{overflow:'hidden'} },
  React.createElement('table', { className: 'violet-table' },
    React.createElement('colgroup',null,[
      React.createElement('col',{key:'main-col-0',style:{width:'40%'}}),
      React.createElement('col',{key:'main-col-1',style:{width:'20%'}}),
      React.createElement('col',{key:'main-col-2',style:{width:'20%'}}),
      React.createElement('col',{key:'main-col-3',style:{width:'20%'}})
    ]),
    React.createElement('thead', null,
      React.createElement('tr', null,
        React.createElement('th', null, ''),
        React.createElement('th', null, 'ккал.'),
        React.createElement('th', null, ''),
        React.createElement('th', null, '')
      )
    ),
    React.createElement('tbody', null,
      // Row 1 — Общие затраты
      React.createElement('tr', {className:'vio-row total-kcal'},
        React.createElement('td', { className: 'label small' }, React.createElement('strong',null,'Общие затраты :')),
        React.createElement('td', null, React.createElement('input', { className: 'readOnly', value: tdee, disabled: true })),
        React.createElement('td', null, ''),
        React.createElement('td', null, '')
      ),
      // Row 2 — BMR + вес
      React.createElement('tr',null,
        React.createElement('td',{className:'label small'},'BMR :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:bmr,disabled:true})),
        React.createElement('td',null, React.createElement('input',{type:'number',step:'0.1',value:day.weightMorning ? Math.round(day.weightMorning*10)/10 : '',onChange:e=>{
          const newWeight = +e.target.value || '';
          const prof = getProfile();
          // Если раньше вес был пустой и сейчас вводится первый раз, подставляем целевой дефицит из профиля
          const shouldSetDeficit = (!day.weightMorning || day.weightMorning === '') && newWeight && (!day.deficitPct && day.deficitPct !== 0);
          setDay({
            ...day,
            weightMorning: newWeight,
            deficitPct: shouldSetDeficit ? (prof.deficitPctTarget || 0) : day.deficitPct
          });
        }})),
        React.createElement('td',null,'вес на утро')
      ),
      // Row 3 — Шаги (ккал считаем из stepsK)
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'},'Шаги :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r1(stepsK),disabled:true,title:'ккал от шагов'})),
        React.createElement('td',null, React.createElement('input',{type:'number',value:day.steps||0,onChange:e=>setDay({...day,steps:+e.target.value||0})})),
        React.createElement('td',null,'шагов')
      ),
      // Row 4 — Тренировки
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'},'Тренировки :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r1(train1k+train2k),disabled:true})),
        React.createElement('td',null,''),
        React.createElement('td',null,'')
      ),
      // Row 5 — Бытовая активность
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'},'Бытовая активность :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:householdK,disabled:true})),
        React.createElement('td',null, React.createElement('input',{type:'number',value:day.householdMin||0,onChange:e=>setDay({...day,householdMin:+e.target.value||0})})),
        React.createElement('td',null,'мин')
      ),
      // Row 6 — Общая активность
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'}, React.createElement('strong',null,'Общая активность :')),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r1(train1k+train2k+stepsK+householdK),disabled:true})),
        React.createElement('td',null,''),
        React.createElement('td',null,'')
      ),
      // Row 6 — Нужно съесть ккал + Целевой дефицит (редактируемый по дням)
      React.createElement('tr',{className:'vio-row need-kcal'},
        React.createElement('td',{className:'label small'},React.createElement('strong',null,'Нужно съесть ккал :')),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:optimum,disabled:true})),
        React.createElement('td',null, React.createElement('input',{type:'number',value:day.deficitPct||0,onChange:e=>setDay({...day,deficitPct:Number(e.target.value)||0}),style:{width:'60px',textAlign:'center',fontWeight:600}})),
        React.createElement('td',null,'Целевой дефицит')
      ),
      // Row 7 — Съедено за день
      React.createElement('tr',{className:'vio-row eaten-kcal'},
        React.createElement('td',{className:'label small'},React.createElement('strong',null,'Съедено за день :')),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r1(eatenKcal),disabled:true})),
        React.createElement('td',null,''),
        React.createElement('td',null,'')
      ),
      // Row 8 — Дефицит ФАКТ (фактический % от Общих затрат)
      React.createElement('tr',{className:'dev-row'}, 
        (function(){
          const target = dayTargetDef; // используем целевой дефицит дня
          const fact = factDefPct; // отрицательно — хорошо если <= target
          const labelText = fact < target ? 'Дефицит ФАКТ :' : 'Профицит ФАКТ :';
          return React.createElement('td',{className:'label small'}, labelText);
        })(),
        (function(){
          const target = dayTargetDef; // используем целевой дефицит дня
          const fact = factDefPct; // отрицательно — хорошо если <= target
          const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
          const bg = good? '#dcfce7':'#fee2e2';
          const col = good? '#065f46':'#b91c1c';
          return React.createElement('td',null, React.createElement('input',{className:'readOnly',disabled:true,value:(fact>0?'+':'')+fact+'%',style:{background:bg,color:col,fontWeight:700,border:'1px solid '+(good?'#86efac':'#fecaca')}}));
        })(),
        (function(){
          const target = dayTargetDef; // используем целевой дефицит дня
          const fact = factDefPct; // отрицательно — хорошо если <= target
          const good = fact <= target; // более глубокий дефицит (более отрицательно) чем целевой => зелёный
          const deficitKcal = eatenKcal - tdee; // отрицательно = дефицит, положительно = профицит
          const bg = good? '#dcfce7':'#fee2e2';
          const col = good? '#065f46':'#b91c1c';
          return React.createElement('td',null, React.createElement('input',{className:'readOnly',disabled:true,value:(deficitKcal>0?'+':'')+Math.round(deficitKcal),style:{background:bg,color:col,fontWeight:700,border:'1px solid '+(good?'#86efac':'#fecaca')}}));
        })(),
        React.createElement('td',null,'')
      )
    )
  )
);


    // Компактные тренировки в SaaS стиле
    const trainingsBlock = React.createElement('div', { className: 'compact-trainings' },
      [0, 1].map((ti) => {
        const T = TR[ti] || { z: [0, 0, 0, 0] };
        const kcalZ = i => r1((+T.z[i] || 0) * (kcalMin[i] || 0));
        const total = r1(kcalZ(0) + kcalZ(1) + kcalZ(2) + kcalZ(3));
        return React.createElement('div', { key: 'tr' + ti, className: 'compact-card compact-train' },
          React.createElement('div', { className: 'compact-train-header' },
            React.createElement('span', { className: 'compact-train-icon' }, ti === 0 ? '🏃' : '🚴'),
            React.createElement('span', null, 'Тренировка ' + (ti + 1)),
            React.createElement('span', { className: 'compact-badge train' }, total + ' ккал'),
          ),
          React.createElement('div', { className: 'compact-train-zones' },
            [0, 1, 2, 3].map((zi) => React.createElement('div', { key: 'z' + zi, className: 'compact-zone' },
              React.createElement('span', { className: 'compact-zone-label' }, 'Z' + (zi + 1)),
              React.createElement('input', { 
                className: 'compact-input tiny', 
                type: 'number', 
                value: +T.z[zi] || '', 
                placeholder: '0',
                onChange: e => updateTraining(ti, zi, e.target.value), 
                title: 'Минут в зоне ' + (zi + 1) 
              }),
            )),
          ),
        );
      })
    );

  // Компактные блоки сна и оценки дня в SaaS стиле
  const sideBlock = React.createElement('div',{className:'area-side right-col'},
      // Блок СОН — компактный
      React.createElement('div', { className: 'compact-card' },
        React.createElement('div', { className: 'compact-card-header' }, '😴 Сон'),
        React.createElement('div', { className: 'compact-row' },
          React.createElement('label', { className: 'compact-label' }, 'Лёг'),
          React.createElement('input', { className: 'compact-input time', type: 'time', value: day.sleepStart || '', onChange: e => setDay({...day, sleepStart: e.target.value}) }),
          React.createElement('label', { className: 'compact-label' }, '→'),
          React.createElement('input', { className: 'compact-input time', type: 'time', value: day.sleepEnd || '', onChange: e => setDay({...day, sleepEnd: e.target.value}) }),
          React.createElement('span', { className: 'compact-badge' }, sleepH ? sleepH + 'ч' : '—'),
          React.createElement('input', { className: 'compact-input tiny', type: 'number', step: '0.5', placeholder: '★', title: 'Качество сна', value: day.sleepQuality || '', onChange: e => setDay({...day, sleepQuality: +e.target.value || 0}) }),
        ),
        React.createElement('input', { className: 'compact-note', type: 'text', placeholder: 'Заметка о сне...', value: day.sleepNote || '', onChange: e => setDay({...day, sleepNote: e.target.value}) }),
      ),
      // Блок ОЦЕНКА ДНЯ — компактный  
      React.createElement('div', { className: 'compact-card' },
        React.createElement('div', { className: 'compact-card-header' }, '📊 День'),
        React.createElement('div', { className: 'compact-row' },
          React.createElement('input', { className: 'compact-input tiny', type: 'number', placeholder: '★', title: 'Оценка дня', value: day.dayScore || '', onChange: e => setDay({...day, dayScore: +e.target.value || 0}) }),
          React.createElement('span', { className: 'compact-stat', title: 'Настроение' }, '😊', React.createElement('span', null, day.moodAvg || '—')),
          React.createElement('span', { className: 'compact-stat', title: 'Самочувствие' }, '💪', React.createElement('span', null, day.wellbeingAvg || '—')),
          React.createElement('span', { className: 'compact-stat', title: 'Стресс' }, '😰', React.createElement('span', null, day.stressAvg || '—')),
        ),
        React.createElement('input', { className: 'compact-note', type: 'text', placeholder: 'Заметка о дне...', value: day.dayComment || '', onChange: e => setDay({...day, dayComment: e.target.value}) }),
      ),
      // Тренировки — компактные
      trainingsBlock
    );

  // compareBlock удалён по требованию

    // Общие метаданные колонок для всех таблиц приёмов
    const MEAL_HEADER_META = [
      {label:''},
      {label:'г'},
      {label:'ккал<br>/100', per100:true},
      {label:'У<br>/100', per100:true},
      {label:'Прост<br>/100', per100:true},
      {label:'Сл<br>/100', per100:true},
      {label:'Б<br>/100', per100:true},
      {label:'Ж<br>/100', per100:true},
      {label:'ВрЖ<br>/100', per100:true},
      {label:'ПолЖ<br>/100', per100:true},
      {label:'СупЖ<br>/100', per100:true},
      {label:'Клет<br>/100', per100:true},
      {label:'ккал'},
      {label:'У'},
      {label:'Прост'},
      {label:'Сл'},
      {label:'Б'},
      {label:'Ж'},
      {label:'ВрЖ'},
      {label:'ПолЖ'},
      {label:'СупЖ'},
      {label:'Клет'},
  {label:'ГИ'},
  {label:'Вред'},
      {label:''}
    ];

    // Форматирование значений для отображения: '-' если 0, целые числа, кроме показателя 'ВрЖ' (bad) — оставляем одну десятичную.
    function fmtVal(key, v){
      const num=+v||0;
      if(!num) return '-';
      if(key==='harm') return Math.round(num*10)/10; // вредность с одной десятичной
      return Math.round(num); // всё остальное до целых
    }

    const mealsUI = (day.meals||[]).map((meal,mi)=>{
      const headerMeta = MEAL_HEADER_META;
      const header = headerMeta.map(h=>h.label.replace(/<br>/g,'/'));
  function pRow(it){
    const p=getProductFromItem(it,pIndex)||{name:it.name||'?'}, G=+it.grams||0, per=per100(p);
    // Debug убран для чистоты консоли
    const row={kcal:scale(per.kcal100,G),carbs:scale(per.carbs100,G),simple:scale(per.simple100,G),complex:scale(per.complex100,G),prot:scale(per.prot100,G),fat:scale(per.fat100,G),bad:scale(per.bad100,G),good:scale(per.good100,G),trans:scale(per.trans100,G),fiber:scale(per.fiber100,G)};
    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
  const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
    return React.createElement('tr',{key:it.id},
      React.createElement('td',{'data-cell':'name'},p.name),
      React.createElement('td',{'data-cell':'grams'},React.createElement('input',{
        type:'number',
        value:G,
        'data-grams-input': true,
        'data-meal-index': mi,
        'data-item-id': it.id,
        onChange:e=>setGrams(mi,it.id,e.target.value),
        onKeyDown:e=>{
          if(e.key==='Enter') {
            e.target.blur(); // Убрать фокус после подтверждения
          }
        },
        onFocus:e=>e.target.select(), // Выделить текст при фокусе
        placeholder:'грамм',
        style:{textAlign:'center'}
      })),
      React.createElement('td',{'data-cell':'per100'},fmtVal('kcal100', per.kcal100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('carbs100', per.carbs100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('simple100', per.simple100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('complex100', per.complex100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('prot100', per.prot100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('fat100', per.fat100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('bad', per.bad100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('good100', per.good100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('trans100', per.trans100)),
      React.createElement('td',{'data-cell':'per100'},fmtVal('fiber100', per.fiber100)),
      React.createElement('td',{'data-cell':'kcal'},fmtVal('kcal', row.kcal)),
      React.createElement('td',{'data-cell':'carbs'},fmtVal('carbs', row.carbs)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('simple', row.simple)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('complex', row.complex)),
      React.createElement('td',{'data-cell':'prot'},fmtVal('prot', row.prot)),
      React.createElement('td',{'data-cell':'fat'},fmtVal('fat', row.fat)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('bad', row.bad)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('good', row.good)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('trans', row.trans)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('fiber', row.fiber)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('gi', giVal)),
      React.createElement('td',{'data-cell':'hidden'},fmtVal('harm', harmVal)),
      React.createElement('td',{'data-cell':'delete'},React.createElement('button',{className:'btn secondary',onClick:()=>removeItem(mi,it.id)},'×'))
    );
  }
  function mTotals(m){
    const t=(M.mealTotals? M.mealTotals(m,pIndex): {kcal:0,carbs:0,simple:0,complex:0,prot:0,fat:0,bad:0,good:0,trans:0,fiber:0});
  let gSum=0, giSum=0, harmSum=0; (m.items||[]).forEach(it=>{ const p=getProductFromItem(it,pIndex); if(!p)return; const g=+it.grams||0; if(!g)return; const gi=p.gi??p.gi100??p.GI??p.giIndex; const harm=p.harm??p.harmScore??p.harm100??p.harmPct; gSum+=g; if(gi!=null) giSum+=gi*g; if(harm!=null) harmSum+=harm*g; }); t.gi=gSum?giSum/gSum:0; t.harm=gSum?harmSum/gSum:0; return t; }
      const totals=mTotals(meal);
      return React.createElement(React.Fragment,{key:meal.id},
        React.createElement('div',{className:'meal-sep'},'ПРИЕМ '+(mi+1)),
        React.createElement('div',{className:'card tone-blue meal-card',style:{marginTop:'4px', width: '100%'}},
        // MOBILE: Meal totals at top (before search)
        (meal.items || []).length > 0 && React.createElement('div', { className: 'mpc-totals-wrap mobile-only' },
          React.createElement('div', { className: 'mpc-grid mpc-header' },
            React.createElement('span', null, 'ккал'),
            React.createElement('span', null, 'У'),
            React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
            React.createElement('span', null, 'Б'),
            React.createElement('span', null, 'Ж'),
            React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
            React.createElement('span', null, 'Кл'),
            React.createElement('span', null, 'ГИ'),
            React.createElement('span', null, 'Вр')
          ),
          React.createElement('div', { className: 'mpc-grid mpc-totals-values' },
            React.createElement('span', null, Math.round(totals.kcal)),
            React.createElement('span', null, Math.round(totals.carbs)),
            React.createElement('span', { className: 'mpc-dim' }, Math.round(totals.simple || 0) + '/' + Math.round(totals.complex || 0)),
            React.createElement('span', null, Math.round(totals.prot)),
            React.createElement('span', null, Math.round(totals.fat)),
            React.createElement('span', { className: 'mpc-dim' }, Math.round(totals.bad || 0) + '/' + Math.round(totals.good || 0) + '/' + Math.round(totals.trans || 0)),
            React.createElement('span', null, Math.round(totals.fiber || 0)),
            React.createElement('span', null, Math.round(totals.gi || 0)),
            React.createElement('span', null, fmtVal('harm', totals.harm || 0))
          )
        ),
        React.createElement('div',{className:'row',style:{justifyContent:'space-between',alignItems:'center'}},
          React.createElement('div',{className:'section-title'},'Добавить продукт'),
          React.createElement(MealAddProduct, {mi})
        ),
        React.createElement('div',{style:{overflowX:'auto',marginTop:'8px'}}, React.createElement('table',{className:'tbl meals-table'},
          React.createElement('thead',null,React.createElement('tr',null, headerMeta.map((h,i)=>React.createElement('th',{
              key:'h'+i,
              className: h.per100? 'per100-col': undefined,
              dangerouslySetInnerHTML:{__html:h.label}
            }))
          )),
          React.createElement('tbody',null,
            (meal.items||[]).map(pRow),
            React.createElement('tr',{className:'tr-sum'},
              React.createElement('td',{className:'fw-600'},''),
              React.createElement('td',null,''),
              React.createElement('td',{colSpan:10},React.createElement('div',{className:'table-divider'})),
              React.createElement('td',null,fmtVal('kcal', totals.kcal)),
              React.createElement('td',null,fmtVal('carbs', totals.carbs)),
              React.createElement('td',null,fmtVal('simple', totals.simple)),
              React.createElement('td',null,fmtVal('complex', totals.complex)),
              React.createElement('td',null,fmtVal('prot', totals.prot)),
              React.createElement('td',null,fmtVal('fat', totals.fat)),
              React.createElement('td',null,fmtVal('bad', totals.bad)),
              React.createElement('td',null,fmtVal('good', totals.good)),
              React.createElement('td',null,fmtVal('trans', totals.trans)),
              React.createElement('td',null,fmtVal('fiber', totals.fiber)),
              React.createElement('td',null,fmtVal('gi', totals.gi)),
              React.createElement('td',null,fmtVal('harm', totals.harm)),
              React.createElement('td',null,'')
            )
          )
        )),
        // MOBILE CARDS — компактный вид с grid-сеткой (collapsible)
        React.createElement('div', { className: 'mobile-products-list' },
          // Expandable products section
          (meal.items || []).length > 0 && React.createElement('div', { 
            className: 'mpc-products-toggle' + (isMealExpanded(mi, (day.meals||[]).length) ? ' expanded' : ''),
            onClick: () => toggleMealExpand(mi)
          },
            React.createElement('span', null, isMealExpanded(mi, (day.meals||[]).length) ? '▼' : '▶'),
            React.createElement('span', null, (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов'))
          ),
          // Products list (shown when expanded)
          isMealExpanded(mi, (day.meals||[]).length) && (meal.items || []).map(it => {
            const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
            const G = +it.grams || 0;
            const per = per100(p);
            const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
            const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
            
            // Контент карточки
            const cardContent = React.createElement('div', { className: 'mpc' },
              // Row 1: name + grams (без кнопки delete — удаление свайпом)
              React.createElement('div', { className: 'mpc-row1' },
                React.createElement('span', { className: 'mpc-name' }, p.name),
                // На мобильных — кнопка открывает wheel picker
                React.createElement('button', {
                  className: 'mpc-grams-btn',
                  onClick: (e) => { e.stopPropagation(); openGramsPicker(mi, it.id, G); }
                }, G + 'г')
              ),
              // Row 2: header labels (grid)
              React.createElement('div', { className: 'mpc-grid mpc-header' },
                React.createElement('span', null, 'ккал'),
                React.createElement('span', null, 'У'),
                React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                React.createElement('span', null, 'Б'),
                React.createElement('span', null, 'Ж'),
                React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                React.createElement('span', null, 'Кл'),
                React.createElement('span', null, 'ГИ'),
                React.createElement('span', null, 'Вр')
              ),
              // Row 3: values (grid) - абсолютные значения в граммах
              React.createElement('div', { className: 'mpc-grid mpc-values' },
                React.createElement('span', null, Math.round(scale(per.kcal100, G))),
                React.createElement('span', null, Math.round(scale(per.carbs100, G))),
                React.createElement('span', { className: 'mpc-dim' }, Math.round(scale(per.simple100, G)) + '/' + Math.round(scale(per.complex100, G))),
                React.createElement('span', null, Math.round(scale(per.prot100, G))),
                React.createElement('span', null, Math.round(scale(per.fat100, G))),
                React.createElement('span', { className: 'mpc-dim' }, Math.round(scale(per.bad100, G)) + '/' + Math.round(scale(per.good100, G)) + '/' + Math.round(scale(per.trans100 || 0, G))),
                React.createElement('span', null, Math.round(scale(per.fiber100, G))),
                React.createElement('span', null, giVal != null ? Math.round(giVal) : '-'),
                React.createElement('span', null, harmVal != null ? fmtVal('harm', harmVal) : '-')
              )
            );
            
            // На мобильных — оборачиваем в SwipeableRow
            if (isMobile && HEYS.SwipeableRow) {
              return React.createElement(HEYS.SwipeableRow, {
                key: it.id,
                onDelete: () => removeItem(mi, it.id)
              }, cardContent);
            }
            
            // На десктопе — обычная карточка с кнопкой удаления
            return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px' } },
              React.createElement('div', { className: 'mpc-row1' },
                React.createElement('span', { className: 'mpc-name' }, p.name),
                React.createElement('input', {
                  type: 'number',
                  className: 'mpc-grams',
                  value: G,
                  onChange: e => setGrams(mi, it.id, e.target.value),
                  onFocus: e => e.target.select(),
                  onKeyDown: e => { if (e.key === 'Enter') e.target.blur(); },
                  'data-grams-input': true,
                  'data-meal-index': mi,
                  'data-item-id': it.id,
                  inputMode: 'decimal'
                }),
                React.createElement('button', {
                  className: 'mpc-delete',
                  onClick: () => removeItem(mi, it.id)
                }, '×')
              ),
              React.createElement('div', { className: 'mpc-grid mpc-header' },
                React.createElement('span', null, 'ккал'),
                React.createElement('span', null, 'У'),
                React.createElement('span', { className: 'mpc-dim' }, 'пр/сл'),
                React.createElement('span', null, 'Б'),
                React.createElement('span', null, 'Ж'),
                React.createElement('span', { className: 'mpc-dim' }, 'вр/пол/суп'),
                React.createElement('span', null, 'Кл'),
                React.createElement('span', null, 'ГИ'),
                React.createElement('span', null, 'Вр')
              ),
              React.createElement('div', { className: 'mpc-grid mpc-values' },
                React.createElement('span', null, Math.round(scale(per.kcal100, G))),
                React.createElement('span', null, Math.round(scale(per.carbs100, G))),
                React.createElement('span', { className: 'mpc-dim' }, Math.round(scale(per.simple100, G)) + '/' + Math.round(scale(per.complex100, G))),
                React.createElement('span', null, Math.round(scale(per.prot100, G))),
                React.createElement('span', null, Math.round(scale(per.fat100, G))),
                React.createElement('span', { className: 'mpc-dim' }, Math.round(scale(per.bad100, G)) + '/' + Math.round(scale(per.good100, G)) + '/' + Math.round(scale(per.trans100 || 0, G))),
                React.createElement('span', null, Math.round(scale(per.fiber100, G))),
                React.createElement('span', null, giVal != null ? Math.round(giVal) : '-'),
                React.createElement('span', null, harmVal != null ? fmtVal('harm', harmVal) : '-')
              )
            );
          }),
          // Компактный блок: время + настроение + самочувствие + стресс (SaaS стиль)
          React.createElement('div', { className: 'meal-meta-row' },
            // На мобильных — кнопка редактирования времени, на десктопе — input
            isMobile
              ? React.createElement('button', { 
                  className: 'compact-input time mobile-time-btn', 
                  onClick: () => openTimeEditor(mi),
                  title: 'Изменить время'
                }, meal.time || '—:—')
              : React.createElement('input', { className: 'compact-input time', type: 'time', title: 'Время приёма', value: meal.time || '', onChange: e => { const meals = day.meals.map((m, i) => i === mi ? {...m, time: e.target.value} : m); setDay({...day, meals}); } }),
            // На мобильных — кнопка редактирования оценок, на десктопе — inputs
            isMobile
              ? React.createElement('button', {
                  className: 'mobile-mood-btn',
                  onClick: () => openMoodEditor(mi),
                  title: 'Изменить оценки'
                },
                  React.createElement('span', { className: 'meal-meta-display' }, '😊', React.createElement('span', { className: 'meta-value' }, meal.mood || '—')),
                  React.createElement('span', { className: 'meal-meta-display' }, '💪', React.createElement('span', { className: 'meta-value' }, meal.wellbeing || '—')),
                  React.createElement('span', { className: 'meal-meta-display' }, '😰', React.createElement('span', { className: 'meta-value' }, meal.stress || '—'))
                )
              : React.createElement(React.Fragment, null,
                  React.createElement('span', { className: 'meal-meta-field' }, '😊', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Настроение', value: meal.mood || '', onChange: e => { const meals = day.meals.map((m, i) => i === mi ? {...m, mood: +e.target.value || ''} : m); setDay({...day, meals}); } })),
                  React.createElement('span', { className: 'meal-meta-field' }, '💪', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Самочувствие', value: meal.wellbeing || '', onChange: e => { const meals = day.meals.map((m, i) => i === mi ? {...m, wellbeing: +e.target.value || ''} : m); setDay({...day, meals}); } })),
                  React.createElement('span', { className: 'meal-meta-field' }, '😰', React.createElement('input', { className: 'compact-input tiny', type: 'number', min: 1, max: 10, placeholder: '—', title: 'Стресс', value: meal.stress || '', onChange: e => { const meals = day.meals.map((m, i) => i === mi ? {...m, stress: +e.target.value || ''} : m); setDay({...day, meals}); } }))
                ),
            React.createElement('button', { className: 'meal-delete-btn', onClick: () => removeMeal(mi), title: 'Удалить приём' }, '🗑')
          )
        )
        )
      );
    });

    // Суточные итоги по всем приёмам (используем totals из compareBlock логики)
    function dayTotals(){
      const t={kcal:0,carbs:0,simple:0,complex:0,prot:0,fat:0,bad:0,good:0,trans:0,fiber:0};
      (day.meals||[]).forEach(m=>{ const mt=M.mealTotals? M.mealTotals(m,pIndex): {}; Object.keys(t).forEach(k=>{ t[k]+=mt[k]||0; }); });
      Object.keys(t).forEach(k=>t[k]=r1(t[k]));
      return t;
    }
    const dayTot = dayTotals();
    // Weighted averages для ГИ и вредности по граммам
  (function(){ let gSum=0, giSum=0, harmSum=0; (day.meals||[]).forEach(m=> (m.items||[]).forEach(it=>{ const p=getProductFromItem(it,pIndex); if(!p)return; const g=+it.grams||0; if(!g)return; const gi=p.gi??p.gi100??p.GI??p.giIndex; const harm=p.harm??p.harmScore??p.harm100??p.harmPct; gSum+=g; if(gi!=null) giSum+=gi*g; if(harm!=null) harmSum+=harm*g; })); dayTot.gi=gSum?giSum/gSum:0; dayTot.harm=gSum?harmSum/gSum:0; })();
    // Нормативы суточные рассчитываем из процентов heys_norms и целевой калорийности (optimum)
    const normPerc = (HEYS.utils&&HEYS.utils.lsGet?HEYS.utils.lsGet('heys_norms',{}):{}) || {};
    function computeDailyNorms(){
      const K = +optimum || 0; // целевая ккал (нужно съесть)
      const carbPct = +normPerc.carbsPct||0;
      const protPct = +normPerc.proteinPct||0;
      const fatPct = Math.max(0,100 - carbPct - protPct);
      const carbs = K? (K * carbPct/100)/4 : 0;
      const prot  = K? (K * protPct/100)/4 : 0;
      const fat   = K? (K * fatPct/100)/8 : 0;
      const simplePct = +normPerc.simpleCarbPct||0;
      const simple = carbs * simplePct/100;
      const complex = Math.max(0, carbs - simple);
      const badPct = +normPerc.badFatPct||0;
      const transPct = +normPerc.superbadFatPct||0; // супер вредные => trans
      const bad = fat * badPct/100;
      const trans = fat * transPct/100;
      const good = Math.max(0, fat - bad - trans);
      const fiberPct = +normPerc.fiberPct||0; // интерпретируем как % от углеводов по массе
      const fiber = carbs * fiberPct/100;
      const gi = +normPerc.giPct||0; // целевой средний ГИ
      const harm = +normPerc.harmPct||0; // целевая вредность
      return {kcal:K, carbs, simple, complex, prot, fat, bad, good, trans, fiber, gi, harm};
    }
    const normAbs = computeDailyNorms();
    const factKeys = ['kcal','carbs','simple','complex','prot','fat','bad','good','trans','fiber','gi','harm'];
  function devVal(k){ const n=+normAbs[k]||0; const f=+dayTot[k]||0; if(!n) return '-'; const d=((f-n)/n)*100; return (d>0?'+':'')+Math.round(d)+'%'; }
  function devCell(k){ const n=+normAbs[k]||0; if(!n) return React.createElement('td',{key:'ds-dv'+k},'-'); const f=+dayTot[k]||0; const d=((f-n)/n)*100; const diff=Math.round(d); const color= diff>0?'#dc2626':(diff<0?'#059669':'#111827'); const fw=diff!==0?600:400; return React.createElement('td',{key:'ds-dv'+k,style:{color,fontWeight:fw}},(diff>0?'+':'')+diff+'%'); }
    function factCell(k){
      const f=+dayTot[k]||0; const n=+normAbs[k]||0; if(!n) return React.createElement('td',{key:'ds-fv'+k},fmtVal(k,f));
      const over=f>n, under=f<n; let color=null; let fw=600;
      if(['bad','trans'].includes(k)){ if(under) color='#059669'; else if(over) color='#dc2626'; else fw=400; }
      else if(k==='simple'){ if(under) color='#059669'; else if(over) color='#dc2626'; else fw=400; }
      else if(k==='complex'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='fiber'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='kcal'){ if(over) color='#dc2626'; else fw=400; }
      else if(k==='prot'){ if(over) color='#059669'; else fw=400; }
      else if(k==='carbs' || k==='fat'){ if(over) color='#dc2626'; else fw=400; }
      else if(k==='good'){ if(over) color='#059669'; else if(under) color='#dc2626'; else fw=400; }
      else if(k==='gi' || k==='harm'){ if(over) color='#dc2626'; else if(under) color='#059669'; else fw=400; }
      else { fw=400; }
      const style=color?{color,fontWeight:fw}:{fontWeight:fw};
      return React.createElement('td',{key:'ds-fv'+k,style},fmtVal(k,f));
    }
    function normVal(k){ const n=+normAbs[k]||0; return n?fmtVal(k,n):'-'; }
  const per100Head = ['','','','','','','','','','']; // 10 per100 columns blank (соответствует таблице приёма)
  const factHead = ['ккал','У','Прост','Сл','Б','Ж','ВрЖ','ПолЖ','СупЖ','Клет','ГИ','Вред','']; // последний пустой (кнопка)
  // Helper: calc percent of part from total (for mobile summary)
  const pct = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;
    const daySummary = React.createElement('div',{className:'card tone-slate',style:{marginTop:'16px',overflowX:'auto'}},
      React.createElement('div',{className:'section-title',style:{marginBottom:'4px'}},'СУТОЧНЫЕ ИТОГИ'),
      React.createElement('table',{className:'tbl meals-table daily-summary'},
        React.createElement('thead',null,React.createElement('tr',null,
          React.createElement('th',null,''),
          React.createElement('th',null,''),
          per100Head.map((h,i)=>React.createElement('th',{key:'ds-ph'+i,className:'per100-col'},h)),
          factHead.map((h,i)=>React.createElement('th',{key:'ds-fh'+i},h))
        )),
        React.createElement('tbody',null,
          // Факт
          React.createElement('tr',null,
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-pvL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'}},'Факт'):React.createElement('td',{key:'ds-pv'+i},'')),
            factKeys.map(k=>factCell(k)),
            React.createElement('td',null,'')
          ),
          // Норма
          React.createElement('tr',null,
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-npL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'}},'Норма'):React.createElement('td',{key:'ds-np'+i},'')),
            factKeys.map(k=>React.createElement('td',{key:'ds-nv'+k},normVal(k))),
            React.createElement('td',null,'')
          ),
          // Откл
          React.createElement('tr',{className:'daily-dev-row'},
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-dpL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'}},'Откл'):React.createElement('td',{key:'ds-dp'+i},'')),
            factKeys.map(k=>devCell(k)),
            React.createElement('td',null,'')
          )
        )
      ),
      // MOBILE: compact daily summary with column headers
      React.createElement('div', { className: 'mobile-daily-summary' },
        // Header row
        React.createElement('div', { className: 'mds-header' },
          React.createElement('span', { className: 'mds-label' }, ''),
          React.createElement('span', null, 'ккал'),
          React.createElement('span', null, 'У'),
          React.createElement('span', { className: 'mds-dim' }, 'пр/сл'),
          React.createElement('span', null, 'Б'),
          React.createElement('span', null, 'Ж'),
          React.createElement('span', { className: 'mds-dim' }, 'вр/пол/суп'),
          React.createElement('span', null, 'Кл'),
          React.createElement('span', null, 'ГИ'),
          React.createElement('span', null, 'Вр')
        ),
        // Fact row
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label' }, 'Факт'),
          React.createElement('span', null, Math.round(dayTot.kcal)),
          React.createElement('span', null, Math.round(dayTot.carbs)),
          React.createElement('span', { className: 'mds-dim' }, pct(dayTot.simple, dayTot.carbs) + '/' + pct(dayTot.complex, dayTot.carbs)),
          React.createElement('span', null, Math.round(dayTot.prot)),
          React.createElement('span', null, Math.round(dayTot.fat)),
          React.createElement('span', { className: 'mds-dim' }, pct(dayTot.bad, dayTot.fat) + '/' + pct(dayTot.good, dayTot.fat) + '/' + pct(dayTot.trans || 0, dayTot.fat)),
          React.createElement('span', null, Math.round(dayTot.fiber)),
          React.createElement('span', null, Math.round(dayTot.gi || 0)),
          React.createElement('span', null, fmtVal('harm', dayTot.harm || 0))
        ),
        // Norm row
        React.createElement('div', { className: 'mds-row' },
          React.createElement('span', { className: 'mds-label' }, 'Норма'),
          React.createElement('span', null, Math.round(normAbs.kcal || 0)),
          React.createElement('span', null, Math.round(normAbs.carbs || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.simple || 0, normAbs.carbs || 1) + '/' + pct(normAbs.complex || 0, normAbs.carbs || 1)),
          React.createElement('span', null, Math.round(normAbs.prot || 0)),
          React.createElement('span', null, Math.round(normAbs.fat || 0)),
          React.createElement('span', { className: 'mds-dim' }, pct(normAbs.bad || 0, normAbs.fat || 1) + '/' + pct(normAbs.good || 0, normAbs.fat || 1) + '/' + pct(normAbs.trans || 0, normAbs.fat || 1)),
          React.createElement('span', null, Math.round(normAbs.fiber || 0)),
          React.createElement('span', null, Math.round(normAbs.gi || 0)),
          React.createElement('span', null, fmtVal('harm', normAbs.harm || 0))
        ),
        // Deviation row - custom layout matching header columns
        React.createElement('div', { className: 'mds-row mds-dev' },
          React.createElement('span', { className: 'mds-label' }, 'Откл'),
          // kcal
          (() => { const n = normAbs.kcal || 0, f = dayTot.kcal || 0; if (!n) return React.createElement('span', { key: 'dev-kcal' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-kcal', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // carbs
          (() => { const n = normAbs.carbs || 0, f = dayTot.carbs || 0; if (!n) return React.createElement('span', { key: 'dev-carbs' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-carbs', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // simple/complex (combined)
          (() => {
            const ns = normAbs.simple || 0, fs = dayTot.simple || 0;
            const nc = normAbs.complex || 0, fc = dayTot.complex || 0;
            const ds = ns ? Math.round(((fs - ns) / ns) * 100) : 0;
            const dc = nc ? Math.round(((fc - nc) / nc) * 100) : 0;
            const cs = ds > 0 ? '#dc2626' : ds < 0 ? '#059669' : '#6b7280';
            const cc = dc > 0 ? '#dc2626' : dc < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-sc', className: 'mds-dim' },
              React.createElement('span', { style: { color: cs } }, (ds > 0 ? '+' : '') + ds),
              '/',
              React.createElement('span', { style: { color: cc } }, (dc > 0 ? '+' : '') + dc)
            );
          })(),
          // prot
          (() => { const n = normAbs.prot || 0, f = dayTot.prot || 0; if (!n) return React.createElement('span', { key: 'dev-prot' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-prot', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // fat
          (() => { const n = normAbs.fat || 0, f = dayTot.fat || 0; if (!n) return React.createElement('span', { key: 'dev-fat' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fat', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // bad/good/trans (combined)
          (() => {
            const nb = normAbs.bad || 0, fb = dayTot.bad || 0;
            const ng = normAbs.good || 0, fg = dayTot.good || 0;
            const nt = normAbs.trans || 0, ft = dayTot.trans || 0;
            const db = nb ? Math.round(((fb - nb) / nb) * 100) : 0;
            const dg = ng ? Math.round(((fg - ng) / ng) * 100) : 0;
            const dt = nt ? Math.round(((ft - nt) / nt) * 100) : 0;
            const cb = db > 0 ? '#dc2626' : db < 0 ? '#059669' : '#6b7280';
            const cg = dg > 0 ? '#dc2626' : dg < 0 ? '#059669' : '#6b7280';
            const ct = dt > 0 ? '#dc2626' : dt < 0 ? '#059669' : '#6b7280';
            return React.createElement('span', { key: 'dev-bgt', className: 'mds-dim' },
              React.createElement('span', { style: { color: cb } }, (db > 0 ? '+' : '') + db),
              '/',
              React.createElement('span', { style: { color: cg } }, (dg > 0 ? '+' : '') + dg),
              '/',
              React.createElement('span', { style: { color: ct } }, (dt > 0 ? '+' : '') + dt)
            );
          })(),
          // fiber
          (() => { const n = normAbs.fiber || 0, f = dayTot.fiber || 0; if (!n) return React.createElement('span', { key: 'dev-fiber' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-fiber', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // gi
          (() => { const n = normAbs.gi || 0, f = dayTot.gi || 0; if (!n) return React.createElement('span', { key: 'dev-gi' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-gi', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })(),
          // harm
          (() => { const n = normAbs.harm || 0, f = dayTot.harm || 0; if (!n) return React.createElement('span', { key: 'dev-harm' }, '-'); const d = Math.round(((f - n) / n) * 100); return React.createElement('span', { key: 'dev-harm', style: { color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#6b7280' } }, (d > 0 ? '+' : '') + d + '%'); })()
        )
      )
    );

    // Выравнивание высоты фиолетового блока с блоком тренировок справа
  // (авто-высота убрана; таблица сама уменьшена по строкам / высоте инпутов)
  
    // DatePicker теперь в шапке App (heys_app_v12.js)
    // Тренировки выводятся в sideBlock (side-compare)

    // === HERO METRICS CARDS ===
    const remainingKcal = r1(optimum - eatenKcal); // сколько ещё можно съесть
    
    // Цвета для карточек
    function getEatenColor() {
      const ratio = eatenKcal / (optimum || 1);
      if (ratio < 0.7) return { bg: '#dcfce7', text: '#065f46', border: '#86efac' }; // зелёный
      if (ratio <= 1.0) return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' }; // жёлтый
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' }; // красный
    }
    function getRemainingColor() {
      if (remainingKcal > 100) return { bg: '#dcfce7', text: '#065f46', border: '#86efac' };
      if (remainingKcal >= 0) return { bg: '#fef9c3', text: '#854d0e', border: '#fde047' };
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' };
    }
    function getDeficitColor() {
      // factDefPct отрицательный = дефицит (хорошо), положительный = профицит (плохо)
      const target = dayTargetDef; // отрицательное значение
      if (factDefPct <= target) return { bg: '#dcfce7', text: '#065f46', border: '#86efac' };
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' };
    }
    
    const eatenCol = getEatenColor();
    const remainCol = getRemainingColor();
    const defCol = getDeficitColor();
    
    // Progress bar для дефицита (ширина = |factDefPct| / 50 * 100%, макс 100%)
    const deficitProgress = Math.min(100, Math.abs(factDefPct) / 50 * 100);
    
    // Вычисление тренда веса за последние 7 дней
    const weightTrend = React.useMemo(() => {
      try {
        const today = new Date(date);
        const weights = [];
        
        // Собираем вес за последние 7 дней (включая сегодня)
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const dayKey = 'heys_dayv2_' + dateStr;
          const dayData = lsGet(dayKey, null);
          
          if (dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0) {
            weights.push({ date: dateStr, weight: +dayData.weightMorning });
          }
        }
        
        // Нужно минимум 2 точки для тренда
        if (weights.length < 2) return null;
        
        // Сортируем по дате (от старой к новой)
        weights.sort((a, b) => a.date.localeCompare(b.date));
        
        // Вычисляем изменение: последний - первый
        const firstWeight = weights[0].weight;
        const lastWeight = weights[weights.length - 1].weight;
        const diff = lastWeight - firstWeight;
        const diffAbs = Math.abs(diff);
        
        // Определяем направление
        let arrow = '→';
        let direction = 'same';
        if (diff > 0.2) { arrow = '⬆️'; direction = 'up'; }
        else if (diff < -0.2) { arrow = '⬇️'; direction = 'down'; }
        
        // Форматируем текст
        const sign = diff > 0 ? '+' : '';
        const text = arrow + ' ' + sign + r1(diff) + ' кг';
        
        return { text, diff, direction };
      } catch (e) {
        return null;
      }
    }, [date, day.weightMorning]);
    
    const metricsCards = React.createElement('div', { className: 'metrics-cards' },
      // Затраты (TDEE) с трендом веса
      React.createElement('div', { 
        className: 'metrics-card',
        style: { background: '#f8fafc', borderColor: '#e2e8f0' },
        title: 'Затраты: ' + tdee + ' ккал (BMR ' + bmr + ' + активность ' + r1(actTotal) + ')' + 
               (weightTrend ? '\nТренд веса за 7 дней: ' + weightTrend.text : '')
      },
        React.createElement('div', { className: 'metrics-icon' }, '⚡'),
        React.createElement('div', { className: 'metrics-value', style: { color: '#64748b' } }, tdee),
        React.createElement('div', { className: 'metrics-label' }, 'Затраты'),
        // Тренд веса под основным значением
        weightTrend && React.createElement('div', { 
          className: 'metrics-trend',
          style: { 
            fontSize: '11px', 
            color: '#94a3b8', 
            marginTop: '2px',
            fontWeight: 500
          } 
        }, weightTrend.text)
      ),
      // Цель (optimum с указанием целевого дефицита) - кликабельна для редактирования
      React.createElement('div', { 
        className: 'metrics-card metrics-card-clickable',
        style: { background: '#f0f9ff', borderColor: '#bae6fd', cursor: 'pointer' },
        title: 'Цель: ' + optimum + ' ккал (затраты ' + tdee + ' − ' + Math.abs(dayTargetDef) + '% дефицит)\nКликни для изменения целевого дефицита',
        onClick: () => {
          const newDef = prompt('Целевой дефицит (отрицательное число для дефицита, положительное для профицита):', dayTargetDef);
          if (newDef !== null && !isNaN(+newDef)) {
            setDay({...day, deficitPct: +newDef});
          }
        }
      },
        React.createElement('div', { className: 'metrics-icon' }, '🎯'),
        React.createElement('div', { className: 'metrics-value', style: { color: '#0369a1' } }, optimum),
        React.createElement('div', { className: 'metrics-label' }, 'Цель (' + dayTargetDef + '%)')
      ),
      // Съедено
      React.createElement('div', { 
        className: 'metrics-card',
        style: { background: eatenCol.bg, borderColor: eatenCol.border },
        title: 'Съедено: ' + r1(eatenKcal) + ' ккал (' + (remainingKcal >= 0 ? 'осталось ' + remainingKcal : 'перебор ' + Math.abs(remainingKcal)) + ')'
      },
        React.createElement('div', { className: 'metrics-icon' }, '🍽️'),
        React.createElement('div', { className: 'metrics-value', style: { color: eatenCol.text } }, r1(eatenKcal)),
        React.createElement('div', { className: 'metrics-label' }, 'Съедено')
      ),
      // Осталось / Перебор - кликабельно для фокуса в поиск
      React.createElement('div', { 
        className: 'metrics-card metrics-card-clickable',
        style: { background: remainCol.bg, borderColor: remainCol.border, cursor: 'pointer' },
        title: remainingKcal >= 0 
          ? 'Сколько ещё можно съесть до нормы\nКликни для добавления продукта'
          : 'Перебор от целевой калорийности: ' + Math.abs(remainingKcal) + ' ккал\n' + 
            (Math.abs(remainingKcal) > 200 
              ? 'Совет: добавь ' + Math.round(Math.abs(remainingKcal) / 7) + ' мин ходьбы или вычти из следующего приёма'
              : 'Небольшой перебор, не критично'),
        onClick: () => {
          // Фокус на первый input поиска продукта
          const firstSearchInput = document.querySelector('.suggest-wrap input[placeholder*="Поиск"]');
          if (firstSearchInput) {
            firstSearchInput.focus();
            firstSearchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      },
        React.createElement('div', { className: 'metrics-icon' }, remainingKcal >= 0 ? '🎯' : '🚫'),
        React.createElement('div', { className: 'metrics-value', style: { color: remainCol.text } }, 
          remainingKcal >= 0 ? remainingKcal : Math.abs(remainingKcal)
        ),
        React.createElement('div', { className: 'metrics-label' }, 
          remainingKcal >= 0 ? 'Осталось' : 'Перебор'
        ),
        // Умная подсказка при переборе
        (remainingKcal < -200) && React.createElement('div', { className: 'metrics-hint' }, 
          '+' + Math.round(Math.abs(remainingKcal) / 7) + ' мин 🚶'
        )
      ),
      // Статус-бар прогресса к цели
      React.createElement('div', { className: 'goal-progress-bar' },
        React.createElement('div', { className: 'goal-progress-header' },
          React.createElement('span', { className: 'goal-progress-title' }, 
            eatenKcal <= optimum ? '🎯 До цели' : '⚠️ Перебор'
          ),
          React.createElement('span', { className: 'goal-progress-stats' },
            React.createElement('span', { className: 'goal-eaten' }, r1(eatenKcal)),
            React.createElement('span', { className: 'goal-divider' }, '/'),
            React.createElement('span', { className: 'goal-target' }, optimum),
            React.createElement('span', { className: 'goal-unit' }, 'ккал')
          )
        ),
        React.createElement('div', { className: 'goal-progress-track' },
          React.createElement('div', { 
            className: 'goal-progress-fill' + (eatenKcal > optimum ? ' over' : ''),
            style: { width: Math.min(100, (eatenKcal / optimum) * 100) + '%' }
          }),
          // Маркер цели на 100%
          React.createElement('div', { className: 'goal-marker' })
        ),
        React.createElement('div', { className: 'goal-progress-footer' },
          eatenKcal <= optimum 
            ? React.createElement('span', { className: 'goal-remaining' }, 
                'Осталось ', React.createElement('b', null, remainingKcal), ' ккал'
              )
            : React.createElement('span', { className: 'goal-over' }, 
                'Превышение на ', React.createElement('b', null, Math.abs(remainingKcal)), ' ккал'
              )
        )
      ),
      // Контейнер: Макро-кольца + Плашка веса
      React.createElement('div', { className: 'macro-weight-row' },
        // Макро-бар БЖУ (в стиле Apple Watch колец)
        React.createElement('div', { className: 'macro-rings' },
          // Белки
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { className: 'macro-ring protein' },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { strokeDasharray: Math.min(100, ((dayTot.prot || 0) / (normAbs.prot || 1)) * 100) + ' 100' }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value' }, Math.round(dayTot.prot || 0))
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Белки'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.prot || 0) + 'г')
          ),
          // Жиры
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { className: 'macro-ring fat' },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { strokeDasharray: Math.min(100, ((dayTot.fat || 0) / (normAbs.fat || 1)) * 100) + ' 100' }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value' }, Math.round(dayTot.fat || 0))
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Жиры'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.fat || 0) + 'г')
          ),
          // Углеводы
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { className: 'macro-ring carbs' },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { strokeDasharray: Math.min(100, ((dayTot.carbs || 0) / (normAbs.carbs || 1)) * 100) + ' 100' }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value' }, Math.round(dayTot.carbs || 0))
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Углеводы'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.carbs || 0) + 'г')
          )
        ),
        // Плашка веса - кликабельная целиком
        React.createElement('div', { 
          className: 'weight-card-modern' + (day.weightMorning ? '' : ' weight-card-empty'),
          onClick: openWeightPicker
        },
          // Лейбл "Вес" сверху
          React.createElement('span', { className: 'weight-card-label' }, 'ВЕС'),
          // Значение веса
          React.createElement('div', { className: 'weight-card-row' },
            React.createElement('span', { className: 'weight-value-number' }, 
              day.weightMorning ? r1(day.weightMorning) : '—'
            ),
            React.createElement('span', { className: 'weight-value-unit' }, 'кг')
          ),
          // Тренд под значением
          weightTrend && day.weightMorning && React.createElement('div', { 
            className: 'weight-card-trend ' + (weightTrend.direction === 'down' ? 'trend-down' : weightTrend.direction === 'up' ? 'trend-up' : 'trend-same')
          }, 
            React.createElement('span', { className: 'trend-arrow' }, weightTrend.direction === 'down' ? '↓' : weightTrend.direction === 'up' ? '↑' : '→'),
            weightTrend.text.replace(/[^а-яА-Я0-9.,\-+\s]/g, '').trim()
          )
        )
      )
    );

    // === COMPACT ACTIVITY INPUT ===
    const stepsGoal = 10000;
    const stepsMax = 20000; // расширенный диапазон
    const stepsValue = day.steps || 0;
    // Позиция: 0-10000 занимает 80% слайдера, 10000-20000 — 20%
    const stepsPercent = stepsValue <= stepsGoal 
      ? (stepsValue / stepsGoal) * 80 
      : 80 + ((stepsValue - stepsGoal) / (stepsMax - stepsGoal)) * 20;
    // Цвет по прогрессу к цели (100% = 10000)
    const stepsColorPercent = Math.min(100, (stepsValue / stepsGoal) * 100);
    
    // Цвет: красный → жёлтый → зелёный (жёлтый на 30% для позитива)
    const getStepsColor = (pct) => {
      if (pct < 30) {
        // 0-30%: красный → жёлтый
        const t = pct / 30;
        const r = Math.round(239 - t * (239 - 234)); // 239 → 234
        const g = Math.round(68 + t * (179 - 68)); // 68 → 179
        const b = Math.round(68 - t * (68 - 8)); // 68 → 8
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        // 30-100%: жёлтый → зелёный  
        const t = (pct - 30) / 70;
        const r = Math.round(234 - t * (234 - 34)); // 234 → 34
        const g = Math.round(179 + t * (197 - 179)); // 179 → 197
        const b = Math.round(8 + t * (94 - 8)); // 8 → 94
        return `rgb(${r}, ${g}, ${b})`;
      }
    };
    const stepsColor = getStepsColor(stepsColorPercent);
    
    // Drag handler для слайдера шагов
    const handleStepsDrag = (e) => {
      e.preventDefault();
      const slider = e.currentTarget.closest('.steps-slider');
      if (!slider) return;
      
      const rect = slider.getBoundingClientRect();
      const updateSteps = (clientX) => {
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = (x / rect.width) * 100;
        let newSteps;
        if (percent <= 80) {
          // 0-80% слайдера = 0-10000 шагов, шаг 10
          newSteps = Math.round(((percent / 80) * stepsGoal) / 10) * 10;
        } else {
          // 80-100% слайдера = 10000-20000 шагов, шаг 100
          const extraPercent = (percent - 80) / 20;
          newSteps = stepsGoal + Math.round((extraPercent * (stepsMax - stepsGoal)) / 100) * 100;
        }
        setDay(prev => ({...prev, steps: Math.min(stepsMax, Math.max(0, newSteps))}));
      };
      
      const onMove = (ev) => {
        const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
        updateSteps(clientX);
      };
      
      const onEnd = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
      };
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      
      // Первый клик тоже обновляет
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      updateSteps(clientX);
    };

    const compactActivity = React.createElement('div', { className: 'compact-activity compact-card' },
      React.createElement('div', { className: 'compact-card-header' }, '📏 АКТИВНОСТЬ'),
      
      // Слайдер шагов
      React.createElement('div', { className: 'steps-slider-container' },
        React.createElement('div', { className: 'steps-slider-header' },
          React.createElement('span', { className: 'steps-label' }, '👟 Шаги'),
          React.createElement('span', { className: 'steps-value' }, 
            React.createElement('b', null, stepsValue.toLocaleString()),
            ' / ',
            React.createElement('b', { className: 'steps-goal' }, stepsGoal.toLocaleString())
          )
        ),
        React.createElement('div', { 
          className: 'steps-slider',
          onMouseDown: handleStepsDrag,
          onTouchStart: handleStepsDrag
        },
          React.createElement('div', { className: 'steps-slider-track' }),
          React.createElement('div', { className: 'steps-slider-goal-mark', style: { left: '80%' } },
            React.createElement('span', { className: 'steps-goal-label' }, '10000')
          ),
          React.createElement('div', { 
            className: 'steps-slider-fill',
            style: { width: stepsPercent + '%', background: stepsColor }
          }),
          React.createElement('div', { 
            className: 'steps-slider-thumb',
            style: { left: stepsPercent + '%', borderColor: stepsColor }
          })
        )
      ),
      
      // Остальные инпуты в ряд
      React.createElement('div', { className: 'compact-activity-inputs' },
        // Быт
        React.createElement('div', { className: 'compact-activity-field' },
          React.createElement('span', { className: 'compact-activity-label' }, 'Быт'),
          React.createElement('input', { 
            className: 'compact-input', 
            type: 'number',
            value: day.householdMin || '',
            placeholder: '0',
            onChange: e => setDay({...day, householdMin: +e.target.value || 0})
          }),
          React.createElement('span', { className: 'compact-activity-unit' }, 'мин')
        ),
        // Цель дефицита %
        React.createElement('div', { className: 'compact-activity-field' },
          React.createElement('span', { className: 'compact-activity-label' }, 'Цель деф.'),
          React.createElement('input', { 
            className: 'compact-input', 
            type: 'number',
            value: day.deficitPct || 0,
            onChange: e => setDay({...day, deficitPct: Number(e.target.value) || 0})
          }),
          React.createElement('span', { className: 'compact-activity-unit' }, '%')
        )
      ),
      // Вторая строка: расчётные значения
      React.createElement('div', { className: 'compact-activity-stats' },
        React.createElement('span', { title: 'Базовый метаболизм' }, 'BMR: ', React.createElement('b', null, bmr)),
        React.createElement('span', { title: 'Калории от шагов' }, '→ ', React.createElement('b', null, r1(stepsK)), ' ккал'),
        React.createElement('span', { title: 'Калории от бытовой активности' }, '→ ', React.createElement('b', null, householdK), ' ккал'),
        React.createElement('span', { title: 'Целевая калорийность' }, 'Цель: ', React.createElement('b', null, optimum))
      ),
      // Третья строка: тренировки (если есть)
      (train1k + train2k > 0) && React.createElement('div', { className: 'compact-activity-stats secondary' },
        React.createElement('span', null, 'Тренировки: ', React.createElement('b', null, r1(train1k + train2k)), ' ккал'),
        React.createElement('span', null, '• Всего активность: ', React.createElement('b', null, r1(actTotal)), ' ккал')
      )
    );
  
    return React.createElement('div',{className:'page page-day'},
      metricsCards,
      compactActivity,
      sideBlock,
      daySummary,
      mealsUI,
      React.createElement('div',{className:'row desktop-only',style:{justifyContent:'flex-start',marginTop:'8px'}}, React.createElement('button',{className:'btn',onClick:addMeal},'+ Приём')),
      
      // FAB - Floating Action Button (только mobile)
      React.createElement('button', {
        className: 'fab-add-meal mobile-only',
        onClick: addMeal,
        title: 'Добавить приём пищи'
      }, '+'),
      
      // Meal Creation/Edit Modal (mobile only)
      showTimePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTimePicker },
          React.createElement('div', { className: 'time-picker-modal', onClick: e => e.stopPropagation() },
            
            // Step 1: Время (показывается при editMode='new' или 'time')
            pickerStep === 1 && React.createElement('div', { 
              className: 'time-picker-step' + (animDirection === 'back' ? ' back' : ''),
              key: 'step1'
            },
              React.createElement('div', { className: 'time-picker-header' },
                React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTimePicker }, 'Отмена'),
                React.createElement('span', { className: 'time-picker-title' }, editMode === 'time' ? 'Изменить время' : 'Время приёма'),
                // Если редактируем только время — "Готово", если новый — "Далее"
                editMode === 'time'
                  ? React.createElement('button', { className: 'time-picker-confirm', onClick: confirmTimeEdit }, 'Готово')
                  : React.createElement('button', { className: 'time-picker-confirm', onClick: goToMoodStep }, 'Далее')
              ),
              React.createElement('div', { className: 'time-picker-wheels' },
                React.createElement(WheelColumn, {
                  values: hoursValues,
                  selected: pendingMealTime.hours,
                  onChange: (i) => setPendingMealTime(prev => ({...prev, hours: i})),
                  label: 'Часы'
                }),
                React.createElement('div', { className: 'time-picker-separator' }, ':'),
                React.createElement(WheelColumn, {
                  values: minutesValues,
                  selected: pendingMealTime.minutes,
                  onChange: (i) => setPendingMealTime(prev => ({...prev, minutes: i})),
                  label: 'Минуты'
                })
              )
            ),
            
            // Step 2: Самочувствие (показывается при editMode='new' или 'mood')
            pickerStep === 2 && React.createElement('div', { 
              className: 'time-picker-step' + (animDirection === 'forward' ? '' : ' back'),
              key: 'step2'
            },
              React.createElement('div', { className: 'time-picker-header' },
                // Если редактируем только оценки — "Отмена", если новый — "← Назад"
                editMode === 'mood'
                  ? React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTimePicker }, 'Отмена')
                  : React.createElement('button', { className: 'time-picker-cancel', onClick: goBackToTimeStep }, '← Назад'),
                React.createElement('span', { className: 'time-picker-title' }, editMode === 'mood' ? 'Оценки' : 'Самочувствие'),
                // Если редактируем только оценки — confirmMoodEdit, если новый — confirmMealCreation
                editMode === 'mood'
                  ? React.createElement('button', { className: 'time-picker-confirm', onClick: confirmMoodEdit }, 'Готово')
                  : React.createElement('button', { className: 'time-picker-confirm', onClick: confirmMealCreation }, 'Готово')
              ),
              React.createElement('div', { className: 'time-picker-wheels mood-wheels' },
                React.createElement('div', { className: 'mood-column' },
                  React.createElement('div', { className: 'mood-emoji' }, '😊'),
                  React.createElement(WheelColumn, {
                    values: ratingValues,
                    selected: pendingMealMood.mood,
                    onChange: (i) => setPendingMealMood(prev => ({...prev, mood: i}))
                  }),
                  React.createElement('div', { className: 'mood-label' }, 'Настроение')
                ),
                React.createElement('div', { className: 'mood-column' },
                  React.createElement('div', { className: 'mood-emoji' }, '💪'),
                  React.createElement(WheelColumn, {
                    values: ratingValues,
                    selected: pendingMealMood.wellbeing,
                    onChange: (i) => setPendingMealMood(prev => ({...prev, wellbeing: i}))
                  }),
                  React.createElement('div', { className: 'mood-label' }, 'Самочувствие')
                ),
                React.createElement('div', { className: 'mood-column' },
                  React.createElement('div', { className: 'mood-emoji' }, '😰'),
                  React.createElement(WheelColumn, {
                    values: ratingValues,
                    selected: pendingMealMood.stress,
                    onChange: (i) => setPendingMealMood(prev => ({...prev, stress: i}))
                  }),
                  React.createElement('div', { className: 'mood-label' }, 'Стресс')
                )
              )
            )
          )
        ),
        document.body
      ),
      
      // Weight Picker Modal
      showWeightPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelWeightPicker },
          React.createElement('div', { className: 'time-picker-modal weight-picker-modal', onClick: e => e.stopPropagation() },
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelWeightPicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, '⚖️ Вес'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmWeightPicker }, 'Готово')
            ),
            React.createElement('div', { className: 'time-picker-wheels weight-wheels' },
              React.createElement(WheelColumn, {
                values: weightKgValues,
                selected: pendingWeightKg,
                onChange: (i) => setPendingWeightKg(i)
              }),
              React.createElement('div', { className: 'weight-picker-dot' }, '.'),
              React.createElement(WheelColumn, {
                values: weightGValues,
                selected: pendingWeightG,
                onChange: (i) => setPendingWeightG(i)
              }),
              React.createElement('span', { className: 'weight-picker-unit' }, 'кг')
            )
          )
        ),
        document.body
      ),
      
      // Grams Picker Modal (mobile only)
      showGramsPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelGramsPicker },
          React.createElement('div', { className: 'time-picker-modal grams-picker-modal', onClick: e => e.stopPropagation() },
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelGramsPicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, 'Граммы'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmGramsPicker }, 'Готово')
            ),
            // Input для быстрого ввода
            React.createElement('div', { className: 'grams-input-row' },
              React.createElement('input', {
                type: 'text',
                inputMode: 'numeric',
                pattern: '[0-9]*',
                className: 'grams-manual-input',
                value: gramsInputValue,
                onChange: handleGramsInput,
                onFocus: e => e.target.select(),
                placeholder: '100'
              }),
              React.createElement('span', { className: 'grams-input-suffix' }, 'г')
            ),
            React.createElement('div', { className: 'time-picker-wheels grams-wheels' },
              React.createElement(WheelColumn, {
                values: gramsValues.map(v => v + 'г'),
                selected: pendingGrams,
                onChange: handleGramsWheelChange
              })
            )
          )
        ),
        document.body
      )
    );
  };

})(window);
