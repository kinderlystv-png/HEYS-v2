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
  function kcalPerMin(met,w){ return Math.round(((+met||0)*(+w||0)*0.0175)*10)/10; }
  function stepsKcal(steps,w,sex,len){ const coef=(sex==='female'?0.5:0.57); const km=(+steps||0)*(len||0.7)/1000; return Math.round(coef*(+w||0)*km*10)/10; }
  function parseTime(t){ if(!t||typeof t!=='string'||!t.includes(':')) return null; const [hh,mm]=t.split(':').map(x=>parseInt(x,10)); if(isNaN(hh)||isNaN(mm)) return null; return {hh:clamp(hh,0,23),mm:clamp(mm,0,59)}; }
  function sleepHours(a,b){ const s=parseTime(a),e=parseTime(b); if(!s||!e) return 0; let sh=s.hh+s.mm/60,eh=e.hh+e.mm/60; let d=eh-sh; if(d<0) d+=24; return r1(d); }

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

  HEYS.DayTab=function DayTab(props){
  const {useState,useMemo,useEffect}=React;
  
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
  const [date,setDate]=useState(lsGet('heys_dayv2_date',todayISO()));
  const [day,setDay]=useState(()=>{ 
    const key = 'heys_dayv2_'+(lsGet('heys_dayv2_date',todayISO()));
    const v=lsGet(key,null); 
    if (v && v.date) {
      return ensureDay(v, prof);
    } else {
      // Для нового дня устанавливаем пустые значения
      return ensureDay({
        date: lsGet('heys_dayv2_date', todayISO()),
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

    // Логирование для диагностики рассинхрона продуктов и приёмов пищи
    useEffect(() => {
  // ...existing code...
    }, [products, day]);

  // ...existing code...

  // ...existing code...

  // ...existing code...

  // ...удалены дублирующиеся объявления useState...
  useEffect(()=>{ lsSet('heys_dayv2_date',date); },[date]);
  useEffect(()=>{ lsSet('heys_dayv2_'+day.date,day); },[JSON.stringify(day)]);

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

    const z= (lsGet('heys_profile',{}).zones||[]).map(x=>+x.met||0); const mets=[2.5,6,8,10].map((_,i)=>z[i]||[2.5,6,8,10][i]);
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

    function updateTraining(i,zi,mins){
      const arr=(day.trainings||[{z:[0,0,0,0]},{z:[0,0,0,0]}]).map((t,idx)=> idx===i? {z:t.z.map((v,j)=> j===zi?(+mins||0):v)}:t);
      const newDay = {...day, trainings:arr};
      setDay(newDay);
      lsSet('heys_dayv2_'+newDay.date, newDay); // Сохраняем сразу после изменения
    }

    // Компонент для поиска и добавления продукта в конкретный приём
    function MealAddProduct({mi}){
      const [search, setSearch] = React.useState('');
      const [open, setOpen] = React.useState(false);
      const [selectedIndex, setSelectedIndex] = React.useState(-1);
      const inputRef = React.useRef(null);
      
      const top20 = React.useMemo(()=>computePopularProducts(products,date),[prodSig,date.slice(0,7)]);
      const lc = String(search||'').trim().toLowerCase();
      const candidates = lc ? products.filter(p=>String(p.name||'').toLowerCase().includes(lc)).slice(0,20) : (top20&&top20.length?top20:products.slice(0,20));
      
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
          open ? React.createElement('div', {className:'suggest-list'},
            (candidates||[]).map((p, index) => React.createElement('div', {
              key:(p.id||p.name),
              className: `suggest-item ${index === selectedIndex ? 'selected' : ''}`,
              onMouseDown:()=>{ addProductAndFocusGrams(p); },
              onMouseEnter:()=>{ setSelectedIndex(index); }, // Синхронизация с мышью
              ref: index === selectedIndex ? (el) => {
                // Автоскролл к выбранному элементу
                if (el) {
                  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }
              } : null
            }, 
            React.createElement('span', null, p.name),
            React.createElement('small', {style:{color:'var(--muted)', fontSize:'11px', marginLeft:'8px', fontWeight:'normal'}}, 
              `${Math.round((p.kcal100 || 0))} ккал/100г`
            )
            ))
          ) : null
        )
      );
    }

    const [search,setSearch]=useState(''); const [open,setOpen]=useState(false);
  const top20=useMemo(()=>computePopularProducts(products,date),[prodSig,date.slice(0,7)]);
    const lc=String(search||'').trim().toLowerCase();
    const candidates = lc ? products.filter(p=>String(p.name||'').toLowerCase().includes(lc)).slice(0,20) : (top20&&top20.length?top20:products.slice(0,20));

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

    function addMeal(){ 
      setDay({...day, meals:[...day.meals,{id:uid('m_'),name:'Приём',time:'',mood:'',wellbeing:'',stress:'',items:[]}]}); 
      if (window.HEYS && window.HEYS.analytics) {
        window.HEYS.analytics.trackDataOperation('meal-created');
      }
    }
    function removeMeal(i){ const meals=day.meals.filter((_,idx)=>idx!==i); setDay({...day, meals:meals.length?meals:[{id:uid('m_'), name:'Приём пищи', time:'', mood:'', wellbeing:'', stress:'', items:[]} ]}); }
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
          try{ lsSet('heys_dayv2_'+day.date, day); }catch(e){}
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


    const trainingsBlock = React.createElement('div',{className:'trainings-wrap under-calendar'},
      [0,1].map((ti)=>{ const T=TR[ti]||{z:[0,0,0,0]}; const kcalZ=i=>r1((+T.z[i]||0)*(kcalMin[i]||0)); const total=r1(kcalZ(0)+kcalZ(1)+kcalZ(2)+kcalZ(3));
        return React.createElement('div',{key:'tr'+ti,className:'card tone-amber'},
          React.createElement('div',{className:'section-title'},'Тренировка '+(ti+1)),
          React.createElement('div',{className:'train-grid'},
            [0,1,2,3].map((zi)=> React.createElement('div',{key:'z'+zi,className:'train-row'},
              React.createElement('div',{className:'muted'},'Зона '+(zi+1)),
              React.createElement('input',{className:'readOnly',value:kcalZ(zi),disabled:true,title:'ккал'}),
              React.createElement('input',{type:'number',value:+T.z[zi]||0,onChange:e=>updateTraining(ti,zi,e.target.value),title:'мин'})
            )),
            React.createElement('div',{className:'train-total'},'Итого: '+total+' ккал')
          )
        );
      })
    );

  const sideBlock = React.createElement('div',{className:'area-side right-col'},
      React.createElement('div', { className: 'side-row' },
        React.createElement('div', { className: 'side-col' },
          React.createElement('div',{className:'card tone-green'},
            React.createElement('div',{className:'grid grid-2'},
              React.createElement('div',null,React.createElement('label',null,'Лёг спать'),React.createElement('input',{type:'time',value:day.sleepStart||'',onChange:e=>setDay({...day,sleepStart:e.target.value})})),
              React.createElement('div',null,React.createElement('label',null,'Проснулся'),React.createElement('input',{type:'time',value:day.sleepEnd||'',onChange:e=>setDay({...day,sleepEnd:e.target.value})})),
              React.createElement('div',null,React.createElement('label',null,'Спал (часов)'),React.createElement('input',{value:sleepH||'',disabled:true})),
              React.createElement('div',null,React.createElement('label',null,'Качество'),React.createElement('input',{type:'number',step:'0.5',value:day.sleepQuality||'',onChange:e=>setDay({...day,sleepQuality:+e.target.value||0})})),
              React.createElement('div',{style:{gridColumn:'1 / -1'}},React.createElement('label',null,'Комментарий'),React.createElement('textarea',{value:day.sleepNote||'',onChange:e=>setDay({...day,sleepNote:e.target.value})}))
            )
          )
        ),
        React.createElement('div', { className: 'side-col' },
          React.createElement('div',{className:'card tone-green'},
            React.createElement('div',{className:'grid grid-2'},
              React.createElement('div',null,React.createElement('label',null,'Оценка дня'),React.createElement('input',{type:'number',value:day.dayScore||'',onChange:e=>setDay({...day,dayScore:+e.target.value||0})})),
              React.createElement('div',null,React.createElement('label',null,'Ср. настроение'),React.createElement('input',{type:'number',value:day.moodAvg||'',disabled:true,style:{backgroundColor:'#f5f5f5'}})),
              React.createElement('div',null,React.createElement('label',null,'Ср. самочувствие'),React.createElement('input',{type:'number',value:day.wellbeingAvg||'',disabled:true,style:{backgroundColor:'#f5f5f5'}})),
              React.createElement('div',null,React.createElement('label',null,'Ср. стресс'),React.createElement('input',{type:'number',value:day.stressAvg||'',disabled:true,style:{backgroundColor:'#f5f5f5'}})),
              React.createElement('div',{style:{gridColumn:'1 / -1'}},React.createElement('label',null,'Комментарий дня'),React.createElement('textarea',{value:day.dayComment||'',onChange:e=>setDay({...day,dayComment:e.target.value})}))
            )
          )
        )
      ),
      React.createElement('div', { className: 'side-compare' },
        trainingsBlock
      )
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
      React.createElement('td',null,p.name),
      React.createElement('td',null,React.createElement('input',{
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
      React.createElement('td',null, fmtVal('kcal100', per.kcal100)),
      React.createElement('td',null, fmtVal('carbs100', per.carbs100)),
      React.createElement('td',null, fmtVal('simple100', per.simple100)),
      React.createElement('td',null, fmtVal('complex100', per.complex100)),
      React.createElement('td',null, fmtVal('prot100', per.prot100)),
      React.createElement('td',null, fmtVal('fat100', per.fat100)),
      React.createElement('td',null, fmtVal('bad', per.bad100)),
      React.createElement('td',null, fmtVal('good100', per.good100)),
      React.createElement('td',null, fmtVal('trans100', per.trans100)),
      React.createElement('td',null, fmtVal('fiber100', per.fiber100)),
      React.createElement('td',null, fmtVal('kcal', row.kcal)),
      React.createElement('td',null, fmtVal('carbs', row.carbs)),
      React.createElement('td',null, fmtVal('simple', row.simple)),
      React.createElement('td',null, fmtVal('complex', row.complex)),
      React.createElement('td',null, fmtVal('prot', row.prot)),
      React.createElement('td',null, fmtVal('fat', row.fat)),
      React.createElement('td',null, fmtVal('bad', row.bad)),
      React.createElement('td',null, fmtVal('good', row.good)),
      React.createElement('td',null, fmtVal('trans', row.trans)),
      React.createElement('td',null, fmtVal('fiber', row.fiber)),
      React.createElement('td',null, fmtVal('gi', giVal)),
      React.createElement('td',null, fmtVal('harm', harmVal)),
      React.createElement('td',null,React.createElement('button',{className:'btn secondary',onClick:()=>removeItem(mi,it.id)},'×'))
    );
  }
  function mTotals(m){
    const t=(M.mealTotals? M.mealTotals(m,pIndex): {kcal:0,carbs:0,simple:0,complex:0,prot:0,fat:0,bad:0,good:0,trans:0,fiber:0});
  let gSum=0, giSum=0, harmSum=0; (m.items||[]).forEach(it=>{ const p=getProductFromItem(it,pIndex); if(!p)return; const g=+it.grams||0; if(!g)return; const gi=p.gi??p.gi100??p.GI??p.giIndex; const harm=p.harm??p.harmScore??p.harm100??p.harmPct; gSum+=g; if(gi!=null) giSum+=gi*g; if(harm!=null) harmSum+=harm*g; }); t.gi=gSum?giSum/gSum:0; t.harm=gSum?harmSum/gSum:0; return t; }
      const totals=mTotals(meal);
      return React.createElement(React.Fragment,{key:meal.id},
        React.createElement('div',{className:'meal-sep'},'ПРИЕМ '+(mi+1)),
        React.createElement('div',{className:'card tone-blue meal-card',style:{marginTop:'4px', width: '100%'}},
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
              React.createElement('td',{style:{fontWeight:600}},''),
              React.createElement('td',null,''),
              React.createElement('td',{colSpan:10},React.createElement('div',{style:{height:'4px',background:'#d1d5db',borderRadius:'6px',width:'100%'}})),
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
        React.createElement('div',{className:'row',style:{justifyContent:'space-between',alignItems:'center',marginTop:'8px'}},
          React.createElement('div',{className:'row',style:{gap:'12px',alignItems:'center'}},
            React.createElement('div',{className:'row',style:{gap:'4px',alignItems:'center'}},
              React.createElement('div',null,'Время:'),
              React.createElement('input',{type:'time',style:{width:'100px'},value:meal.time||'',onChange:e=>{ const meals=day.meals.map((m,i)=> i===mi? {...m,time:e.target.value}:m); setDay({...day,meals}); }})
            ),
            React.createElement('div',{className:'row',style:{gap:'4px',alignItems:'center'}},
              React.createElement('div',null,'Настроение:'),
              React.createElement('input',{type:'number',min:'1',max:'10',step:'1',style:{width:'60px'},value:meal.mood||'',placeholder:'1-10',onChange:e=>{ const meals=day.meals.map((m,i)=> i===mi? {...m,mood:+e.target.value||''}:m); setDay({...day,meals}); }})
            ),
            React.createElement('div',{className:'row',style:{gap:'4px',alignItems:'center'}},
              React.createElement('div',null,'Самочувствие:'),
              React.createElement('input',{type:'number',min:'1',max:'10',step:'1',style:{width:'60px'},value:meal.wellbeing||'',placeholder:'1-10',onChange:e=>{ const meals=day.meals.map((m,i)=> i===mi? {...m,wellbeing:+e.target.value||''}:m); setDay({...day,meals}); }})
            ),
            React.createElement('div',{className:'row',style:{gap:'4px',alignItems:'center'}},
              React.createElement('div',null,'Стресс:'),
              React.createElement('input',{type:'number',min:'1',max:'10',step:'1',style:{width:'60px'},value:meal.stress||'',placeholder:'1-10',onChange:e=>{ const meals=day.meals.map((m,i)=> i===mi? {...m,stress:+e.target.value||''}:m); setDay({...day,meals}); }})
            )
          ),
          React.createElement('button',{className:'btn secondary',onClick:()=>removeMeal(mi)},'Удалить приём')
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
      )
    );

    // Выравнивание высоты фиолетового блока с блоком тренировок справа
  // (авто-высота убрана; таблица сама уменьшена по строкам / высоте инпутов)
    return React.createElement('div',{className:'page page-day'},
      React.createElement('div',{className:'day-layout compact-4col'},
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
          calendarBlock
        ),
        mainBlock,
        sideBlock
      ),
      daySummary,
      mealsUI,
      React.createElement('div',{className:'row',style:{justifyContent:'flex-start',marginTop:'8px'}}, React.createElement('button',{className:'btn',onClick:addMeal},'+ Приём'))
    );
  };

})(window);
