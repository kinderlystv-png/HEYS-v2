// heys_day_utils.js — Day utilities: date/time, storage, calculations

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Создаём namespace для утилит дня
  HEYS.dayUtils = {};

  // === Haptic Feedback ===
  function haptic(type = 'light') {
    if (!navigator.vibrate) return;
    switch(type) {
      case 'light': navigator.vibrate(10); break;
      case 'medium': navigator.vibrate(20); break;
      case 'heavy': navigator.vibrate(30); break;
      case 'success': navigator.vibrate([10, 50, 20]); break;
      case 'warning': navigator.vibrate([30, 30, 30]); break;
      case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
      default: navigator.vibrate(10);
    }
  }
  
  // Экспортируем для использования в других модулях (legacy)
  HEYS.haptic = haptic;

  // === Date/Time Utilities ===
  function pad2(n){ return String(n).padStart(2,'0'); }
  function todayISO(){ const d=new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function fmtDate(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function parseISO(s){ const [y,m,d]=String(s||'').split('-').map(x=>parseInt(x,10)); if(!y||!m||!d) return new Date(); const dt=new Date(y,m-1,d); dt.setHours(12); return dt; }
  function uid(p){ return (p||'id')+Math.random().toString(36).slice(2,8); }

  // === Storage Utilities ===
  function lsGet(k,d){
    try{
      if(HEYS.store && typeof HEYS.store.get==='function') {
        const result = HEYS.store.get(k,d);
        if (global.HEYS && global.HEYS.analytics) {
          global.HEYS.analytics.trackDataOperation('storage-op');
        }
        return result;
      }
      const v=JSON.parse(localStorage.getItem(k)); 
      if (global.HEYS && global.HEYS.analytics) {
        global.HEYS.analytics.trackDataOperation('storage-op');
      }
      return v==null?d:v;
    }catch(e){ return d; }
  }
  
  function lsSet(k,v){
    try{
      if(HEYS.store && typeof HEYS.store.set==='function') {
        const result = HEYS.store.set(k,v);
        if (global.HEYS && global.HEYS.analytics) {
          global.HEYS.analytics.trackDataOperation('storage-op');
        }
        return result;
      }
      // Сначала пишем в localStorage для мгновенной доступности другим вкладкам
      try{ 
        localStorage.setItem(k, JSON.stringify(v)); 
        if (global.HEYS && global.HEYS.analytics) {
          global.HEYS.analytics.trackDataOperation('storage-op');
        }
      }catch(e){}
      // Потом отправляем в облако (асинхронно)
      try{ global.HEYS.saveClientKey(k, v); }catch(e){}
    }catch(e){}
  }

  // === Math Utilities ===
  function clamp(n,a,b){ n=+n||0; if(n<a)return a; if(n>b)return b; return n; }
  const r1=v=>Math.round((+v||0)*10)/10; // округление до 1 десятой (для веса)
  const r0=v=>Math.round(+v||0); // округление до целого (для калорий)
  const scale=(v,g)=>Math.round(((+v||0)*(+g||0)/100)*10)/10;

  // === Model Helpers (delegates to HEYS.models) ===
  function ensureDay(d,prof){ 
    const M = HEYS.models || {};
    return (M.ensureDay? M.ensureDay(d,prof): (d||{})); 
  }
  
  function buildProductIndex(ps){ 
    const M = HEYS.models || {};
    return M.buildProductIndex? M.buildProductIndex(ps): {byId:new Map(),byName:new Map()}; 
  }
  
  function getProductFromItem(it,idx){ 
    const M = HEYS.models || {};
    return M.getProductFromItem? M.getProductFromItem(it,idx): null; 
  }
  
  function per100(p){
    const M = HEYS.models || {};
    if(!p) return {kcal100:0,carbs100:0,prot100:0,fat100:0,simple100:0,complex100:0,bad100:0,good100:0,trans100:0,fiber100:0};
    if(M.computeDerivedProduct){
      const d=M.computeDerivedProduct(p);
      return {kcal100:d.kcal100,carbs100:d.carbs100,prot100:+p.protein100||0,fat100:d.fat100,simple100:+p.simple100||0,complex100:+p.complex100||0,bad100:+p.badFat100||0,good100:+p.goodFat100||0,trans100:+p.trans100||0,fiber100:+p.fiber100||0};
    }
    const s=+p.simple100||0,c=+p.complex100||0,pr=+p.protein100||0,b=+p.badFat100||0,g=+p.goodFat100||0,t=+p.trans100||0,fib=+p.fiber100||0; 
    const carbs=+p.carbs100||(s+c); 
    const fat=+p.fat100||(b+g+t); 
    const kcal=+p.kcal100||(4*(pr+carbs)+8*fat); 
    return {kcal100:kcal,carbs100:carbs,prot100:pr,fat100:fat,simple100:s,complex100:c,bad100:b,good100:g,trans100:t,fiber100:fib};
  }

  // === Data Loading ===
  function loadMealsForDate(ds){ 
    const keys=['heys_dayv2_'+ds,'heys_day_'+ds,'day_'+ds+'_meals','meals_'+ds,'food_'+ds]; 
    for(const k of keys){ 
      try{ 
        const raw=localStorage.getItem(k); 
        if(!raw)continue; 
        const v=JSON.parse(raw); 
        if(v&&Array.isArray(v.meals)) return v.meals; 
        if(Array.isArray(v)) return v; 
      }catch(e){} 
    } 
    return []; 
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
      (loadMealsForDate(fmtDate(d))||[]).forEach(m=>{ 
        ((m&&m.items)||[]).forEach(it=>{ 
          const p=getProductFromItem(it,idx); 
          if(!p)return; 
          const k=String(p.id??p.product_id??p.name); 
          cnt.set(k,(cnt.get(k)||0)+1); 
        }); 
      });
    }
    const arr=[]; 
    cnt.forEach((c,k)=>{ 
      let p=idx.byId.get(String(k))||idx.byName.get(String(k).trim().toLowerCase()); 
      if(p) arr.push({p,c}); 
    });
    arr.sort((a,b)=>b.c-a.c);
    const list = arr.slice(0,20).map(x=>x.p);
    POPULAR_CACHE[key] = { ts: now, list };
    return list;
  }

  // === Profile & Calculations ===
  function getProfile(){ 
    const p=lsGet('heys_profile',{})||{}; 
    const g=(p.gender||p.sex||'Мужской'); 
    const sex=(String(g).toLowerCase().startsWith('ж')?'female':'male'); 
    return {
      sex,
      height:+p.height||175,
      age:+p.age||30, 
      sleepHours:+p.sleepHours||8, 
      weight:+p.weight||70, 
      deficitPctTarget:+p.deficitPctTarget||0, 
      stepsGoal:+p.stepsGoal||7000
    }; 
  }
  
  function calcBMR(w,prof){ 
    const h=+prof.height||175,a=+prof.age||30,sex=(prof.sex||'male'); 
    return Math.round(10*(+w||0)+6.25*h-5*a+(sex==='female'?-161:5)); 
  }
  
  function kcalPerMin(met,w){ 
    return Math.round((((+met||0)*(+w||0)*0.0175)-1)*10)/10; 
  }
  
  function stepsKcal(steps,w,sex,len){ 
    const coef=(sex==='female'?0.5:0.57); 
    const km=(+steps||0)*(len||0.7)/1000; 
    return Math.round(coef*(+w||0)*km*10)/10; 
  }

  // === Time/Sleep Utilities ===
  function parseTime(t){ 
    if(!t||typeof t!=='string'||!t.includes(':')) return null; 
    const [hh,mm]=t.split(':').map(x=>parseInt(x,10)); 
    if(isNaN(hh)||isNaN(mm)) return null; 
    return {hh:clamp(hh,0,23),mm:clamp(mm,0,59)}; 
  }
  
  function sleepHours(a,b){ 
    const s=parseTime(a),e=parseTime(b); 
    if(!s||!e) return 0; 
    let sh=s.hh+s.mm/60,eh=e.hh+e.mm/60; 
    let d=eh-sh; 
    if(d<0) d+=24; 
    return r1(d); 
  }

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

  // === Exports ===
  // Всё экспортируется через HEYS.dayUtils
  HEYS.dayUtils = {
    // Haptic
    haptic,
    // Date/Time
    pad2,
    todayISO,
    fmtDate,
    parseISO,
    uid,
    formatDateDisplay,
    // Storage
    lsGet,
    lsSet,
    // Math
    clamp,
    r0,
    r1,
    scale,
    // Models
    ensureDay,
    buildProductIndex,
    getProductFromItem,
    per100,
    // Data
    loadMealsForDate,
    productsSignature,
    computePopularProducts,
    POPULAR_CACHE,
    // Profile/Calculations
    getProfile,
    calcBMR,
    kcalPerMin,
    stepsKcal,
    // Time/Sleep
    parseTime,
    sleepHours
  };

})(window);
