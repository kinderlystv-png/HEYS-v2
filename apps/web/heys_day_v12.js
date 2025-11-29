// heys_day_v12.js — DayTab component, daily tracking, meals, statistics
// Refactored: imports from heys_day_utils.js, heys_day_hooks.js, heys_day_pickers.js

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // === Import utilities from dayUtils module ===
  const U = HEYS.dayUtils || {};
  
  // Minimal fallback helper: log error and return safe default
  const warnMissing = (name) => { 
    console.error('[HEYS] dayUtils.' + name + ' not loaded'); 
  };
  
  // Fallbacks with error logging (not full duplicates)
  const haptic = U.haptic || (() => { warnMissing('haptic'); });
  const pad2 = U.pad2 || ((n) => { warnMissing('pad2'); return String(n).padStart(2,'0'); });
  const todayISO = U.todayISO || (() => { warnMissing('todayISO'); return new Date().toISOString().slice(0,10); });
  const fmtDate = U.fmtDate || ((d) => { warnMissing('fmtDate'); return d.toISOString().slice(0,10); });
  const parseISO = U.parseISO || ((s) => { warnMissing('parseISO'); return new Date(); });
  const uid = U.uid || ((p) => { warnMissing('uid'); return (p||'id')+Math.random().toString(36).slice(2,8); });
  const formatDateDisplay = U.formatDateDisplay || (() => { warnMissing('formatDateDisplay'); return { label: 'День', sub: '' }; });
  const lsGet = U.lsGet || ((k,d) => { warnMissing('lsGet'); try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; }catch(e){ return d; } });
  const lsSet = U.lsSet || ((k,v) => { warnMissing('lsSet'); try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} });
  const clamp = U.clamp || ((n,a,b) => { warnMissing('clamp'); n=+n||0; if(n<a)return a; if(n>b)return b; return n; });
  const r0 = U.r0 || ((v) => { warnMissing('r0'); return Math.round(+v||0); });
  const r1 = U.r1 || ((v) => { warnMissing('r1'); return Math.round((+v||0)*10)/10; });
  const scale = U.scale || ((v,g) => { warnMissing('scale'); return Math.round(((+v||0)*(+g||0)/100)*10)/10; });
  const ensureDay = U.ensureDay || ((d,prof) => { warnMissing('ensureDay'); return d||{}; });
  const buildProductIndex = U.buildProductIndex || (() => { warnMissing('buildProductIndex'); return {byId:new Map(),byName:new Map()}; });
  const getProductFromItem = U.getProductFromItem || (() => { warnMissing('getProductFromItem'); return null; });
  const per100 = U.per100 || (() => { warnMissing('per100'); return {kcal100:0,carbs100:0,prot100:0,fat100:0,simple100:0,complex100:0,bad100:0,good100:0,trans100:0,fiber100:0}; });
  const loadMealsForDate = U.loadMealsForDate || (() => { warnMissing('loadMealsForDate'); return []; });
  const productsSignature = U.productsSignature || (() => { warnMissing('productsSignature'); return ''; });
  const computePopularProducts = U.computePopularProducts || (() => { warnMissing('computePopularProducts'); return []; });
  const getProfile = U.getProfile || (() => { warnMissing('getProfile'); return {sex:'male',height:175,age:30,sleepHours:8,weight:70,deficitPctTarget:0,stepsGoal:7000}; });
  const calcBMR = U.calcBMR || ((w,prof) => { warnMissing('calcBMR'); return Math.round(10*(+w||0)+6.25*(prof.height||175)-5*(prof.age||30)+(prof.sex==='female'?-161:5)); });
  const kcalPerMin = U.kcalPerMin || ((met,w) => { warnMissing('kcalPerMin'); return Math.round((((+met||0)*(+w||0)*0.0175)-1)*10)/10; });
  const stepsKcal = U.stepsKcal || ((steps,w,sex,len) => { warnMissing('stepsKcal'); const coef=(sex==='female'?0.5:0.57); const km=(+steps||0)*(len||0.7)/1000; return Math.round(coef*(+w||0)*km*10)/10; });
  const parseTime = U.parseTime || ((t) => { warnMissing('parseTime'); if(!t||typeof t!=='string'||!t.includes(':')) return null; const [hh,mm]=t.split(':').map(x=>parseInt(x,10)); if(isNaN(hh)||isNaN(mm)) return null; return {hh:Math.max(0,Math.min(23,hh)),mm:Math.max(0,Math.min(59,mm))}; });
  const sleepHours = U.sleepHours || ((a,b) => { warnMissing('sleepHours'); const pt=(t)=>{ if(!t||!t.includes(':'))return null; const [h,m]=t.split(':').map(x=>+x); return isNaN(h)||isNaN(m)?null:{hh:h,mm:m}; }; const s=pt(a),e=pt(b); if(!s||!e)return 0; let d=(e.hh+e.mm/60)-(s.hh+s.mm/60); if(d<0)d+=24; return Math.round(d*10)/10; });
  // Meal type classification
  const getMealType = U.getMealType || ((mi, meal, allMeals, pIndex) => { 
    warnMissing('getMealType'); 
    return { type: 'snack', name: 'Приём ' + (mi+1), icon: '🍽️' }; 
  });
  
  // === Import hooks from dayHooks module ===
  const H = HEYS.dayHooks || {};
  const useDayAutosave = H.useDayAutosave;
  const useMobileDetection = H.useMobileDetection;
  
  // Calendar загружается динамически в DayTab (строка ~1337), 
  // НЕ кэшируем здесь чтобы HMR работал

  // === Import models module ===
  const M = HEYS.models || {};

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
  
  // === МОБИЛЬНЫЕ ПОД-ВКЛАДКИ ===
  // 'stats' — статистика дня (шапка, статистика, активность, сон)
  // 'diary' — дневник питания (суточные итоги, приёмы пищи)
  // Теперь subTab приходит из props (из нижнего меню App)
  const mobileSubTab = props.subTab || 'stats';
  
  // === СВАЙП ДЛЯ ПОД-ВКЛАДОК УБРАН ===
  // Теперь свайп между stats/diary обрабатывается глобально в App
  // (нижнее меню с 5 вкладками)
  const onSubTabTouchStart = React.useCallback(() => {}, []);
  const onSubTabTouchEnd = React.useCallback(() => {}, []);
  
  // Проверка: развёрнут ли приём (последний по умолчанию развёрнут)
  const isMealExpanded = (mealIndex, totalMeals) => {
    // Если есть явное состояние — используем его
    if (expandedMeals.hasOwnProperty(mealIndex)) {
      return expandedMeals[mealIndex];
    }
    // Иначе последний развёрнут по умолчанию
    return mealIndex === totalMeals - 1;
  };
  
  // Флаг: данные загружены (из localStorage или Supabase)
  const [isHydrated, setIsHydrated] = useState(false);
  
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

    // ЗАЩИТА: не сохранять до завершения гидратации (чтобы не затереть данные из Supabase)
    const { flush } = useDayAutosave({ day, date, lsSet, lsGetFn: lsGet, disabled: !isHydrated });

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
      setIsHydrated(false); // Сброс: данные ещё не загружены для новой даты
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
        
        // ВАЖНО: данные загружены, теперь можно сохранять
        setIsHydrated(true);
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
    const trainK= t=>(t.z||[0,0,0,0]).reduce((s,min,i)=> s+r0((+min||0)*(kcalMin[i]||0)),0);
    const TR=(day.trainings&&Array.isArray(day.trainings)&&day.trainings.length>=1)?day.trainings:[{z:[0,0,0,0]},{z:[0,0,0,0]},{z:[0,0,0,0]}];
  const train1k=trainK(TR[0]||{z:[0,0,0,0]}), train2k=trainK(TR[1]||{z:[0,0,0,0]}), train3k=trainK(TR[2]||{z:[0,0,0,0]});
  const stepsK=r0(stepsKcal(day.steps||0,weight,prof.sex,0.7));
  const householdK=r0((+day.householdMin||0)*kcalPerMin(2.5,weight));
  const actTotal=r0(train1k+train2k+train3k+stepsK+householdK);
  const bmr=calcBMR(weight,prof), tdee=r0(bmr+actTotal);
  const profileTargetDef=(lsGet('heys_profile',{}).deficitPctTarget||0); // отрицательное число для дефицита
  const dayTargetDef = (day.deficitPct != null ? day.deficitPct : profileTargetDef); // используем дефицит дня, если есть
  const optimum=r0(tdee*(1+dayTargetDef/100));

  const eatenKcal=(day.meals||[]).reduce((a,m)=>{ const t=(M.mealTotals? M.mealTotals(m,pIndex): {kcal:0}); return a+(t.kcal||0); },0);
  const factDefPct = tdee? r0(((eatenKcal - tdee)/tdee)*100) : 0; // <0 значит дефицит

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
    console.log('HEYS_TDEE_DEBUG [DAY]   eatenKcal (съедено):', r0(eatenKcal));
    console.log('HEYS_TDEE_DEBUG [DAY]   optimum (нужно съесть):', optimum);
    console.log('HEYS_TDEE_DEBUG [DAY]   factDefPct:', factDefPct + '%');
    console.groupEnd();
  }

    function updateTraining(i, zi, mins) {
      const arr = (day.trainings || [{z:[0,0,0,0]}, {z:[0,0,0,0]}]).map((t, idx) => {
        if (idx !== i) return t;
        return {
          ...t,  // сохраняем time, type и другие поля
          z: t.z.map((v, j) => j === zi ? (+mins || 0) : v)
        };
      });
      setDay({ ...day, trainings: arr });
    }

    // Компонент для поиска и добавления продукта в конкретный приём
    function MealAddProduct({mi}){
      const [search, setSearch] = React.useState('');
      const [open, setOpen] = React.useState(false);
      const [selectedIndex, setSelectedIndex] = React.useState(-1);
      const [dropdownPos, setDropdownPos] = React.useState({top:0, left:0, width:0});
      const inputRef = React.useRef(null);
      
      // ⭐ Состояние избранных продуктов
      const [favorites, setFavorites] = React.useState(() => 
        (window.HEYS && window.HEYS.store && window.HEYS.store.getFavorites) 
          ? window.HEYS.store.getFavorites() 
          : new Set()
      );
      
      // Функция toggle избранного
      const toggleFavorite = React.useCallback((e, productId) => {
        e.stopPropagation();
        e.preventDefault();
        if (window.HEYS && window.HEYS.store && window.HEYS.store.toggleFavorite) {
          const newState = window.HEYS.store.toggleFavorite(productId);
          setFavorites(window.HEYS.store.getFavorites());
        }
      }, []);
      
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
      
      const top20 = React.useMemo(()=>computePopularProducts(products,date),[prodSig,date.slice(0,7),favorites.size]);
      const lc = String(search||'').trim().toLowerCase();
      
      // Используем умный поиск с исправлением опечаток если доступен
      const candidates = React.useMemo(() => {
        let results;
        if (!lc) {
          results = top20 && top20.length ? top20 : products.slice(0,20);
        } else if (window.HEYS && window.HEYS.SmartSearchWithTypos) {
          // Если доступен умный поиск, используем его
          try {
            const smartResult = window.HEYS.SmartSearchWithTypos.search(lc, products, {
              enablePhonetic: true,
              enableSynonyms: true,
              maxSuggestions: 20
            });
            
            if (smartResult && smartResult.results && smartResult.results.length > 0) {
              results = smartResult.results;
            } else {
              results = products.filter(p=>String(p.name||'').toLowerCase().includes(lc)).slice(0,20);
            }
          } catch (error) {
            DEV.warn('[HEYS] Ошибка умного поиска, используем обычный:', error);
            results = products.filter(p=>String(p.name||'').toLowerCase().includes(lc)).slice(0,20);
          }
        } else {
          // Fallback к обычному поиску
          results = products.filter(p=>String(p.name||'').toLowerCase().includes(lc)).slice(0,20);
        }
        
        // Сортируем: избранные первыми (для результатов поиска)
        if (lc && results.length > 0) {
          results = [...results].sort((a, b) => {
            const aId = String(a.id ?? a.product_id ?? a.name);
            const bId = String(b.id ?? b.product_id ?? b.name);
            const aFav = favorites.has(aId);
            const bFav = favorites.has(bId);
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;
            return 0;
          });
        }
        
        return results;
      }, [lc, products, top20, favorites]);
      
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
        (candidates||[]).map((p, index) => {
          const productId = String(p.id ?? p.product_id ?? p.name);
          const isFav = favorites.has(productId);
          return React.createElement('div', {
            key:(p.id||p.name),
            className: `suggest-item ${index === selectedIndex ? 'selected' : ''}`,
            onMouseDown:()=>{ addProductAndFocusGrams(p); },
            onMouseEnter:()=>{ setSelectedIndex(index); },
            ref: index === selectedIndex ? (el) => {
              if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } : null
          }, 
            // Кнопка избранного
            React.createElement('button', {
              className: 'favorite-btn',
              onMouseDown: (e) => toggleFavorite(e, productId),
              title: isFav ? 'Убрать из избранного' : 'Добавить в избранное',
              style: {
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px 2px 0',
                fontSize: '14px',
                opacity: isFav ? 1 : 0.3,
                transition: 'opacity 0.15s'
              }
            }, isFav ? '⭐' : '☆'),
            React.createElement('span', {style:{flex:1}}, p.name),
            React.createElement('small', {style:{color:'var(--muted)', fontSize:'11px', marginLeft:'8px', fontWeight:'normal'}}, 
              `${Math.round((p.kcal100 || 0))} ккал/100г`
            )
          );
        })
      ) : null;
      
      return React.createElement('div', {className:'row suggest-wrap', style:{flex:1, position:'relative'}},
        React.createElement('div', {style:{width:'100%', position:'relative'}},
          React.createElement('input', {
            ref: inputRef,
            placeholder:'🔍 Поиск продукта... (↑↓ навигация, Enter выбор, Esc закрыть)',
            value:search,
            style:{width:'100%', fontSize:'13px'},
            onFocus:()=>{
              setOpen(true);
              // Скроллим карточку приёма к верху экрана при фокусе на поиске
              // На мобильных учитываем виртуальную клавиатуру через visualViewport
              const scrollToMeal = () => {
                const mealCard = document.querySelector(`[data-meal-index="${mi}"]`);
                if (mealCard) {
                  const headerOffset = 56; // Высота шапки
                  const elementPosition = mealCard.getBoundingClientRect().top;
                  const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                  window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
                }
              };
              
              // Первый скролл сразу
              setTimeout(scrollToMeal, 100);
              
              // На мобильных — дополнительный скролл после открытия клавиатуры
              if (isMobile && window.visualViewport) {
                const handleResize = () => {
                  // Клавиатура изменила viewport — скроллим ещё раз
                  setTimeout(scrollToMeal, 50);
                  window.visualViewport.removeEventListener('resize', handleResize);
                };
                window.visualViewport.addEventListener('resize', handleResize, { once: true });
              }
            },
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
    
    // === Training Picker Modal ===
    const [showTrainingPicker, setShowTrainingPicker] = useState(false);
    const [trainingPickerStep, setTrainingPickerStep] = useState(1); // 1 = тип+время, 2 = зоны
    const [editingTrainingIndex, setEditingTrainingIndex] = useState(null);
    const [pendingTrainingTime, setPendingTrainingTime] = useState({hours: 10, minutes: 0});
    const [pendingTrainingType, setPendingTrainingType] = useState('cardio');
    const [pendingTrainingZones, setPendingTrainingZones] = useState([0, 0, 0, 0]); // индексы для zoneMinutesValues
    
    // === Тренировки: количество видимых блоков ===
    const [visibleTrainings, setVisibleTrainings] = useState(() => {
      // Автоопределяем сколько тренировок показывать на основе данных
      const tr = day.trainings || [];
      const hasData = (t) => t && t.z && t.z.some(v => +v > 0);
      if (tr[2] && hasData(tr[2])) return 3;
      if (tr[1] && hasData(tr[1])) return 2;
      return 1;
    });
    
    // === Toast для подсказок БЖУ ===
    const [toastVisible, setToastVisible] = useState(false);
    const [toastDismissed, setToastDismissed] = useState(false);
    const toastTimeoutRef = React.useRef(null);
    const [toastSwipeX, setToastSwipeX] = useState(0);
    const toastTouchStart = React.useRef(0);
    
    // Touch handlers для swipe-to-dismiss
    const handleToastTouchStart = (e) => {
      toastTouchStart.current = e.touches[0].clientX;
    };
    const handleToastTouchMove = (e) => {
      const diff = e.touches[0].clientX - toastTouchStart.current;
      setToastSwipeX(diff);
    };
    const handleToastTouchEnd = () => {
      if (Math.abs(toastSwipeX) > 80) {
        dismissToast();
      }
      setToastSwipeX(0);
    };
    
    // === Advice Module State ===
    const [adviceTrigger, setAdviceTrigger] = useState(null);
    const [adviceExpanded, setAdviceExpanded] = useState(false);
    
    // === Pull-to-refresh (Enhanced) ===
    const [pullProgress, setPullProgress] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState('idle'); // idle | pulling | ready | syncing | success | error
    const pullStartY = React.useRef(0);
    const isPulling = React.useRef(false);
    const lastHapticRef = React.useRef(0);
    
    // === Dark Theme (3 modes: light / dark / auto) ===
    const [theme, setTheme] = useState(() => {
      const saved = localStorage.getItem('heys_theme');
      // Валидация: только light/dark/auto, иначе light
      return ['light', 'dark', 'auto'].includes(saved) ? saved : 'light';
    });
    
    // Вычисляем реальную тему (для auto режима)
    const resolvedTheme = useMemo(() => {
      if (theme === 'auto') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return theme;
    }, [theme]);
    
    // Применяем тему + слушаем системные изменения
    React.useEffect(() => {
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      localStorage.setItem('heys_theme', theme);
      
      if (theme !== 'auto') return;
      
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }, [theme, resolvedTheme]);
    
    // Cycle: light → dark → auto → light
    const cycleTheme = () => {
      setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'auto' : 'light');
    };
    
    // === Confetti при достижении цели ===
    const [showConfetti, setShowConfetti] = useState(false);
    const confettiShownRef = React.useRef(false);
    const prevKcalRef = React.useRef(0);
    
    // === Progress animation ===
    const [animatedProgress, setAnimatedProgress] = useState(0);
    
    // === Grams Picker Modal (mobile only) ===
    const [showGramsPicker, setShowGramsPicker] = useState(false);
    const [gramsPickerTarget, setGramsPickerTarget] = useState(null); // {mealIndex, itemId, currentGrams}
    const [pendingGrams, setPendingGrams] = useState(99); // индекс 99 = 100г
    const [gramsInputValue, setGramsInputValue] = useState(''); // для ручного ввода
    // Генерируем значения от 1 до 2000 с шагом 1
    const gramsValues = useMemo(() => Array.from({length: 2000}, (_, i) => String(i + 1)), []);
    
    // === Zone Minutes Picker Modal ===
    const [showZonePicker, setShowZonePicker] = useState(false);
    const [zonePickerTarget, setZonePickerTarget] = useState(null); // {trainingIndex, zoneIndex}
    const [pendingZoneMinutes, setPendingZoneMinutes] = useState(0);
    // Значения минут: 0-120
    const zoneMinutesValues = useMemo(() => Array.from({length: 121}, (_, i) => String(i)), []);
    
    // === Sleep Quality Picker Modal ===
    const [showSleepQualityPicker, setShowSleepQualityPicker] = useState(false);
    const [pendingSleepQuality, setPendingSleepQuality] = useState(0);
    const sleepQualityValues = useMemo(() => ['—', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'], []);
    
    // === Day Score Picker Modal ===
    const [showDayScorePicker, setShowDayScorePicker] = useState(false);
    const [pendingDayScore, setPendingDayScore] = useState(0);
    const dayScoreValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);
    
    // === Weight Picker Modal ===
    const [showWeightPicker, setShowWeightPicker] = useState(false);
    const [weightPickerStep, setWeightPickerStep] = useState(1); // 1=вес, 2=цель шагов
    const [pendingWeightKg, setPendingWeightKg] = useState(70); // целые кг (40-150)
    const [pendingWeightG, setPendingWeightG] = useState(0); // десятые (0-9)
    const [pendingStepsGoalIdx, setPendingStepsGoalIdx] = useState(6); // индекс для колеса (6 = 7000)
    const weightKgValues = useMemo(() => Array.from({length: 111}, (_, i) => String(40 + i)), []); // 40-150 кг
    const weightGValues = useMemo(() => Array.from({length: 10}, (_, i) => String(i)), []); // 0-9
    const stepsGoalValues = useMemo(() => Array.from({length: 30}, (_, i) => String((i + 1) * 1000)), []); // 1000-30000
    
    // Цель шагов: state для реактивного обновления слайдера
    const [savedStepsGoal, setSavedStepsGoal] = useState(() => prof.stepsGoal || 7000);
    
    // Слушаем завершение синхронизации cloud для обновления stepsGoal
    useEffect(() => {
      const handleSyncCompleted = () => {
        const profileFromStorage = getProfile();
        if (profileFromStorage.stepsGoal && profileFromStorage.stepsGoal !== savedStepsGoal) {
          setSavedStepsGoal(profileFromStorage.stepsGoal);
        }
      };
      
      // Слушаем кастомный event от cloud синхронизации
      window.addEventListener('heysSyncCompleted', handleSyncCompleted);
      
      return () => {
        window.removeEventListener('heysSyncCompleted', handleSyncCompleted);
      };
    }, [savedStepsGoal]); // Обновляем при изменении savedStepsGoal
    
    function openWeightPicker() {
      setWeightPickerStep(1); // начинаем с первого шага
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
      // Конвертируем savedStepsGoal в индекс колеса (1000=0, 2000=1, ..., 7000=6)
      setPendingStepsGoalIdx(Math.max(0, Math.min(29, Math.round(savedStepsGoal / 1000) - 1)));
      setShowWeightPicker(true);
    }
    
    function nextWeightPickerStep() {
      if (weightPickerStep === 1) {
        setWeightPickerStep(2);
      } else {
        confirmWeightPicker();
      }
    }
    
    function prevWeightPickerStep() {
      if (weightPickerStep === 2) {
        setWeightPickerStep(1);
      } else {
        cancelWeightPicker();
      }
    }
    
    function confirmWeightPicker() {
      const newWeight = (40 + pendingWeightKg) + pendingWeightG / 10;
      const pendingStepsGoal = (pendingStepsGoalIdx + 1) * 1000; // конвертируем индекс в значение
      const prof = getProfile();
      const shouldSetDeficit = (!day.weightMorning || day.weightMorning === '') && newWeight && (!day.deficitPct && day.deficitPct !== 0);
      // Сохраняем цель шагов в профиль и обновляем state
      if (pendingStepsGoal !== savedStepsGoal) {
        // Важно: читаем RAW данные профиля, чтобы не потерять другие поля (gender и т.д.)
        const rawProfile = lsGet('heys_profile', {}) || {};
        const updatedProf = { ...rawProfile, stepsGoal: pendingStepsGoal };
        // Логи сохранения stepsGoal отключены для чистой консоли
        lsSet('heys_profile', updatedProf);
        setSavedStepsGoal(pendingStepsGoal); // обновляем state для слайдера
      }
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
    
    // === Deficit Picker Modal ===
    const [showDeficitPicker, setShowDeficitPicker] = useState(false);
    const [pendingDeficitIdx, setPendingDeficitIdx] = useState(20); // индекс (20 = 0%)
    // Значения от -20% до +20% с шагом 1
    const deficitValues = useMemo(() => Array.from({length: 41}, (_, i) => {
      const val = i - 20; // -20 до +20
      return (val > 0 ? '+' : '') + val + '%';
    }), []);
    
    // Дефицит из профиля или дефолт 0
    const profileDeficit = prof.deficitPctTarget || 0;
    const currentDeficit = day.deficitPct != null ? day.deficitPct : profileDeficit;
    
    function openDeficitPicker() {
      // Конвертируем текущий дефицит в индекс (-20 = 0, 0 = 20, +20 = 40)
      const deficitVal = currentDeficit || 0;
      setPendingDeficitIdx(Math.max(0, Math.min(40, deficitVal + 20)));
      setShowDeficitPicker(true);
    }
    
    function confirmDeficitPicker() {
      const newDeficit = pendingDeficitIdx - 20; // индекс обратно в значение
      setDay({ ...day, deficitPct: newDeficit });
      setShowDeficitPicker(false);
    }
    
    function cancelDeficitPicker() {
      setShowDeficitPicker(false);
    }

    // === Water Tracking ===
    const [waterAddedAnim, setWaterAddedAnim] = useState(null); // для анимации "+200"
    const [showWaterTooltip, setShowWaterTooltip] = useState(false); // тултип с формулой
    const waterLongPressRef = React.useRef(null); // для long press

    // Быстрые пресеты воды
    const waterPresets = [
      { ml: 100, label: '100 мл', icon: '💧' },
      { ml: 200, label: 'Стакан', icon: '🥛' },
      { ml: 330, label: 'Бутылка', icon: '🧴' },
      { ml: 500, label: '0.5л', icon: '🍶' }
    ];

    // Динамический расчёт нормы воды с детализацией
    const waterGoalBreakdown = useMemo(() => {
      const w = +day.weightMorning || +prof.weight || 70;
      const age = +prof.age || 30;
      const isFemale = prof.sex === 'female';
      const coef = isFemale ? 28 : 30;
      
      // Базовая норма: вес × коэффициент
      const baseRaw = w * coef;
      
      // Корректировка по возрасту
      let ageFactor = 1;
      let ageNote = '';
      if (age >= 60) { ageFactor = 0.9; ageNote = '−10% (60+)'; }
      else if (age >= 40) { ageFactor = 0.95; ageNote = '−5% (40+)'; }
      const base = baseRaw * ageFactor;
      
      // +250мл за каждые 5000 шагов
      const stepsCount = Math.floor((day.steps || 0) / 5000);
      const stepsBonus = stepsCount * 250;
      
      // +500мл за тренировку
      const trainCount = [train1k, train2k, train3k].filter(k => k > 50).length;
      const trainBonus = trainCount * 500;
      
      // Сезонный бонус: +300мл летом (июнь-август)
      const month = new Date().getMonth(); // 0-11
      const isHotSeason = month >= 5 && month <= 7; // июнь(5), июль(6), август(7)
      const seasonBonus = isHotSeason ? 300 : 0;
      const seasonNote = isHotSeason ? '☀️ Лето' : '';
      
      // Итого
      const total = Math.round((base + stepsBonus + trainBonus + seasonBonus) / 100) * 100;
      const finalGoal = Math.max(1500, Math.min(5000, total));
      
      return {
        weight: w,
        coef,
        baseRaw: Math.round(baseRaw),
        ageFactor,
        ageNote,
        base: Math.round(base),
        stepsCount,
        stepsBonus,
        trainCount,
        trainBonus,
        seasonBonus,
        seasonNote,
        total: Math.round(total),
        finalGoal
      };
    }, [day.weightMorning, day.steps, train1k, train2k, train3k, prof.weight, prof.age, prof.sex]);

    const waterGoal = waterGoalBreakdown.finalGoal;

    // Мотивационное сообщение по прогрессу
    const waterMotivation = useMemo(() => {
      const pct = ((day.waterMl || 0) / waterGoal) * 100;
      if (pct >= 100) return { emoji: '🏆', text: 'Цель достигнута!' };
      if (pct >= 75) return { emoji: '🔥', text: 'Почти у цели!' };
      if (pct >= 50) return { emoji: '🎯', text: 'Половина пути!' };
      if (pct >= 25) return { emoji: '🌊', text: 'Хороший старт!' };
      return { emoji: '💧', text: 'Добавь воды' };
    }, [day.waterMl, waterGoal]);

    // Расчёт времени с последнего приёма воды
    const waterLastDrink = useMemo(() => {
      const lastTime = day.lastWaterTime;
      if (!lastTime) return null;
      
      const now = Date.now();
      const diffMs = now - lastTime;
      const diffMin = Math.floor(diffMs / 60000);
      
      if (diffMin < 60) {
        return { minutes: diffMin, text: diffMin + ' мин назад', isLong: false };
      }
      
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      const isLong = hours >= 2; // больше 2 часов = напоминание
      const text = hours + 'ч' + (mins > 0 ? ' ' + mins + 'мин' : '') + ' назад';
      
      return { hours, minutes: mins, text, isLong };
    }, [day.lastWaterTime]);

    // Long press для показа тултипа с формулой
    function handleWaterRingDown(e) {
      waterLongPressRef.current = setTimeout(() => {
        setShowWaterTooltip(true);
        haptic('light');
      }, 400);
    }
    function handleWaterRingUp() {
      if (waterLongPressRef.current) {
        clearTimeout(waterLongPressRef.current);
        waterLongPressRef.current = null;
      }
    }
    function handleWaterRingLeave() {
      handleWaterRingUp();
      // На десктопе скрываем при уходе мыши
      if (!('ontouchstart' in window)) {
        setShowWaterTooltip(false);
      }
    }

    // Быстрое добавление воды с анимацией
    function addWater(ml) {
      const newWater = (day.waterMl || 0) + ml;
      setDay({ ...day, waterMl: newWater, lastWaterTime: Date.now() });
      
      // Анимация feedback
      setWaterAddedAnim('+' + ml);
      haptic('light');
      
      // 🎉 Celebration при достижении цели (переиспользуем confetti от калорий)
      if (newWater >= waterGoal && (day.waterMl || 0) < waterGoal && !showConfetti) {
        setShowConfetti(true);
        haptic('success');
        setTimeout(() => setShowConfetti(false), 2000);
      }
      
      // Скрыть анимацию
      setTimeout(() => setWaterAddedAnim(null), 800);
    }

    // Убрать воду (для исправления ошибок)
    function removeWater(ml) {
      const newWater = Math.max(0, (day.waterMl || 0) - ml);
      setDay({ ...day, waterMl: newWater });
      haptic('light');
    }

    // === Household (Бытовая активность) Picker Modal ===
    const [showHouseholdPicker, setShowHouseholdPicker] = useState(false);
    const [pendingHouseholdIdx, setPendingHouseholdIdx] = useState(0); // индекс (0 = 0 минут)
    // Значения от 0 до 300 минут с шагом 10
    const householdValues = useMemo(() => Array.from({length: 31}, (_, i) => String(i * 10)), []); // 0, 10, 20, ..., 300
    
    function openHouseholdPicker() {
      const currentMin = day.householdMin || 0;
      // Конвертируем минуты в индекс (0=0, 10=1, 20=2, ...)
      setPendingHouseholdIdx(Math.max(0, Math.min(30, Math.round(currentMin / 10))));
      setShowHouseholdPicker(true);
    }
    
    function confirmHouseholdPicker() {
      const newMinutes = pendingHouseholdIdx * 10; // индекс обратно в минуты
      setDay({ ...day, householdMin: newMinutes });
      setShowHouseholdPicker(false);
    }
    
    function cancelHouseholdPicker() {
      setShowHouseholdPicker(false);
    }

    function openGramsPicker(mealIndex, itemId, currentGrams) {
      const gramsNum = parseInt(currentGrams) || 100;
      // Индекс = значение - 1 (т.к. начинаем с 1)
      const closestIdx = Math.max(0, Math.min(1999, gramsNum - 1));
      
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
      if (num >= 1 && num <= 2000) {
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
    
    // === Zone Minutes Picker functions ===
    function openZonePicker(trainingIndex, zoneIndex) {
      const T = TR[trainingIndex] || { z: [0, 0, 0, 0] };
      const currentMinutes = +T.z[zoneIndex] || 0;
      setZonePickerTarget({ trainingIndex, zoneIndex });
      setPendingZoneMinutes(currentMinutes);
      setShowZonePicker(true);
    }
    
    function confirmZonePicker() {
      if (zonePickerTarget) {
        updateTraining(zonePickerTarget.trainingIndex, zonePickerTarget.zoneIndex, pendingZoneMinutes);
      }
      setShowZonePicker(false);
      setZonePickerTarget(null);
    }
    
    function cancelZonePicker() {
      setShowZonePicker(false);
      setZonePickerTarget(null);
    }
    
    // === Training Picker functions ===
    function openTrainingPicker(trainingIndex) {
      const now = new Date();
      const T = TR[trainingIndex] || { z: [0,0,0,0], time: '', type: '' };
      
      // Если уже есть время — парсим, иначе текущее
      if (T.time) {
        const [h, m] = T.time.split(':').map(Number);
        setPendingTrainingTime({ hours: hourToWheelIndex(h || 10), minutes: m || 0 });
      } else {
        setPendingTrainingTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
      }
      
      setPendingTrainingType(T.type || 'cardio');
      
      // Загружаем зоны — находим индекс в zoneMinutesValues
      const zones = T.z || [0, 0, 0, 0];
      const zoneIndices = zones.map(minutes => {
        // zoneMinutesValues содержит строки '0', '1', ..., '120'
        const idx = zoneMinutesValues.indexOf(String(minutes));
        return idx >= 0 ? idx : 0;
      });
      setPendingTrainingZones(zoneIndices);
      
      setTrainingPickerStep(1); // начинаем с первого шага
      setEditingTrainingIndex(trainingIndex);
      setShowTrainingPicker(true);
    }

    function confirmTrainingPicker() {
      // Если на первом шаге — переходим на второй
      if (trainingPickerStep === 1) {
        setTrainingPickerStep(2);
        return;
      }
      
      // Валидация: хотя бы одна зона > 0
      const totalMinutes = pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0);
      if (totalMinutes === 0) {
        haptic('error');
        // Добавляем shake-анимацию к секции зон
        const zonesSection = document.querySelector('.training-zones-section');
        if (zonesSection) {
          zonesSection.classList.add('shake');
          setTimeout(() => zonesSection.classList.remove('shake'), 500);
        }
        return;
      }
      
      // На втором шаге — сохраняем всё
      const realHours = wheelIndexToHour(pendingTrainingTime.hours);
      const timeStr = pad2(realHours) + ':' + pad2(pendingTrainingTime.minutes);
      
      // Конвертируем индексы зон в минуты (zoneMinutesValues содержит строки)
      const zoneMinutes = pendingTrainingZones.map(idx => parseInt(zoneMinutesValues[idx], 10) || 0);
      
      // Обновляем тренировку с новыми полями
      // Заполняем массив до нужного индекса если он короткий
      const existingTrainings = day.trainings || [];
      const newTrainings = [...existingTrainings];
      const idx = editingTrainingIndex;
      
      // Заполняем пустые слоты если нужно (для idx=2 при length=2)
      while (newTrainings.length <= idx) {
        newTrainings.push({ z: [0, 0, 0, 0], time: '', type: '' });
      }
      
      // Теперь безопасно обновляем
      newTrainings[idx] = {
        ...newTrainings[idx],
        z: zoneMinutes,
        time: timeStr,
        type: pendingTrainingType
      };
      
      setDay({ ...day, trainings: newTrainings });
      setShowTrainingPicker(false);
      setTrainingPickerStep(1);
      setEditingTrainingIndex(null);
    }

    function cancelTrainingPicker() {
      // Если на втором шаге — возвращаемся на первый
      if (trainingPickerStep === 2) {
        setTrainingPickerStep(1);
        return;
      }
      // На первом шаге — закрываем
      setShowTrainingPicker(false);
      setTrainingPickerStep(1);
      setEditingTrainingIndex(null);
    }
    
    // === Sleep Quality Picker functions ===
    function openSleepQualityPicker() {
      const currentQuality = day.sleepQuality || 0;
      // Находим индекс: 0='—', 1='1', 2='1.5', 3='2', ...
      const idx = currentQuality === 0 ? 0 : sleepQualityValues.indexOf(String(currentQuality));
      setPendingSleepQuality(idx >= 0 ? idx : 0);
      setShowSleepQualityPicker(true);
    }
    
    function confirmSleepQualityPicker() {
      const value = pendingSleepQuality === 0 ? 0 : parseFloat(sleepQualityValues[pendingSleepQuality]);
      setDay({...day, sleepQuality: value});
      setShowSleepQualityPicker(false);
    }
    
    function cancelSleepQualityPicker() {
      setShowSleepQualityPicker(false);
    }
    
    // === Day Score Picker functions ===
    function openDayScorePicker() {
      const currentScore = day.dayScore || 0;
      const idx = currentScore === 0 ? 0 : dayScoreValues.indexOf(String(currentScore));
      setPendingDayScore(idx >= 0 ? idx : 0);
      setShowDayScorePicker(true);
    }
    
    function confirmDayScorePicker() {
      const value = pendingDayScore === 0 ? 0 : parseInt(dayScoreValues[pendingDayScore]);
      setDay({...day, dayScore: value});
      setShowDayScorePicker(false);
    }
    
    function cancelDayScorePicker() {
      setShowDayScorePicker(false);
    }
    
    // Используем глобальный WheelColumn
    const WheelColumn = HEYS.WheelColumn;
    
    // Типы тренировок для Training Picker Modal
    const trainingTypes = [
      { id: 'cardio', icon: '🏃', label: 'Кардио' },
      { id: 'strength', icon: '🏋️', label: 'Силовая' },
      { id: 'hobby', icon: '⚽', label: 'Активное хобби' }
    ];
    
    // Пресеты популярных тренировок (зоны в индексах zoneMinutesValues)
    const trainingPresets = [
      { id: 'run30', label: '🏃 Бег 30 мин', type: 'cardio', zones: [0, 25, 5, 0] },
      { id: 'hiit20', label: '⚡ HIIT 20 мин', type: 'cardio', zones: [0, 0, 10, 10] },
      { id: 'strength45', label: '🏋️ Силовая 45 мин', type: 'strength', zones: [10, 30, 5, 0] },
      { id: 'walk60', label: '🚶 Прогулка 60 мин', type: 'hobby', zones: [40, 20, 0, 0] }
    ];
    
    // === BottomSheet с поддержкой свайпа ===
    const bottomSheetRef = React.useRef(null);
    const sheetDragY = React.useRef(0);
    const sheetStartY = React.useRef(0);
    const isSheetDragging = React.useRef(false);
    
    const handleSheetTouchStart = (e) => {
      sheetStartY.current = e.touches[0].clientY;
      isSheetDragging.current = true;
      sheetDragY.current = 0;
    };
    
    const handleSheetTouchMove = (e) => {
      if (!isSheetDragging.current) return;
      const diff = e.touches[0].clientY - sheetStartY.current;
      if (diff > 0) {
        sheetDragY.current = diff;
        if (bottomSheetRef.current) {
          bottomSheetRef.current.style.transform = `translateY(${diff}px)`;
        }
      }
    };
    
    const handleSheetTouchEnd = (closeCallback) => {
      if (!isSheetDragging.current) return;
      isSheetDragging.current = false;
      
      if (sheetDragY.current > 100) {
        // Закрываем если свайпнули > 100px
        haptic('light');
        if (bottomSheetRef.current) {
          bottomSheetRef.current.classList.add('closing');
        }
        setTimeout(() => closeCallback(), 200);
      } else {
        // Возвращаем на место
        if (bottomSheetRef.current) {
          bottomSheetRef.current.style.transform = '';
        }
      }
      sheetDragY.current = 0;
    };
    
    // Генерация значений для часов, минут и оценок 1-10
    // Часы начинаются с 03:00 (порядок: 03, 04, ... 23, 00, 01, 02)
    // Ночные часы (00-02) визуально отмечены как относящиеся к следующему календарному дню
    const NIGHT_HOUR_THRESHOLD = U.NIGHT_HOUR_THRESHOLD || 3;
    const hoursOrder = useMemo(() => {
      // Порядок: 03, 04, 05, ..., 23, 00, 01, 02
      const order = [];
      for (let h = NIGHT_HOUR_THRESHOLD; h < 24; h++) order.push(h);
      for (let h = 0; h < NIGHT_HOUR_THRESHOLD; h++) order.push(h);
      return order;
    }, []);
    
    // Значения для колеса (с подписями для ночных часов)
    const hoursValues = useMemo(() => {
      return hoursOrder.map(h => pad2(h));
    }, [hoursOrder]);
    
    // Конвертация: индекс колеса → реальные часы
    const wheelIndexToHour = (idx) => hoursOrder[idx] ?? idx;
    // Конвертация: реальные часы → индекс колеса
    const hourToWheelIndex = (hour) => {
      const idx = hoursOrder.indexOf(hour);
      return idx >= 0 ? idx : 0;
    };
    
    // Проверка: выбранный час относится к ночным (00-02)
    const isNightHourSelected = useMemo(() => {
      const realHour = wheelIndexToHour(pendingMealTime.hours);
      return realHour >= 0 && realHour < NIGHT_HOUR_THRESHOLD;
    }, [pendingMealTime.hours, hoursOrder]);
    
    // Форматированная дата для отображения
    const currentDateLabel = useMemo(() => {
      const d = parseISO(date);
      const dayNum = d.getDate();
      const month = d.toLocaleDateString('ru-RU', { month: 'short' });
      return `${dayNum} ${month}`;
    }, [date]);
    
    const minutesValues = WheelColumn.presets.minutes;
    const ratingValues = WheelColumn.presets.rating;
    
    // Состояние для второго слайда (самочувствие)
    const [pickerStep, setPickerStep] = useState(1); // 1 = время, 2 = самочувствие
    const [pendingMealMood, setPendingMealMood] = useState({mood: 5, wellbeing: 5, stress: 5});
    // Состояние для типа приёма в модалке создания
    const [pendingMealType, setPendingMealType] = useState(null); // null = авто
    
    // Открыть модалку для нового приёма
    function openTimePickerForNewMeal() {
      const now = new Date();
      // Конвертируем реальные часы в индекс колеса
      setPendingMealTime({ hours: hourToWheelIndex(now.getHours()), minutes: now.getMinutes() });
      setPendingMealMood({ mood: 5, wellbeing: 5, stress: 5 });
      setPendingMealType(null); // Сбрасываем на авто
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
      
      // Конвертируем реальные часы в индекс колеса
      setPendingMealTime({ hours: hourToWheelIndex(hours), minutes });
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
      // Конвертируем индекс колеса в реальные часы
      const realHours = wheelIndexToHour(pendingMealTime.hours);
      const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
      // Используем функцию с автосортировкой
      updateMealTime(editingMealIndex, timeStr);
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
      // Конвертируем индекс колеса в реальные часы
      const realHours = wheelIndexToHour(pendingMealTime.hours);
      const timeStr = pad2(realHours) + ':' + pad2(pendingMealTime.minutes);
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
        // Сортируем после обновления
        const sortedMeals = sortMealsByTime(updatedMeals);
        setDay({ ...day, meals: sortedMeals });
      } else {
        // Создание нового
        const newMeal = {
          id: uid('m_'), 
          name: 'Приём', 
          time: timeStr, 
          mood: moodVal, 
          wellbeing: wellbeingVal, 
          stress: stressVal, 
          items: []
        };
        // Добавляем и сортируем
        const newMeals = sortMealsByTime([...day.meals, newMeal]);
        setDay({...day, meals: newMeals});
        // Находим индекс нового приёма после сортировки
        const newIndex = newMeals.findIndex(m => m.id === newMeal.id);
        expandOnlyMeal(newIndex >= 0 ? newIndex : newMeals.length - 1);
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
    
    // Сортировка приёмов по времени (ночные 00:00-02:59 в конец)
    function sortMealsByTime(meals) {
      if (!meals || meals.length <= 1) return meals;
      
      return [...meals].sort((a, b) => {
        const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
        const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;
        
        // Если оба без времени — сохраняем порядок
        if (timeA === null && timeB === null) return 0;
        // Без времени — в конец
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        
        return timeA - timeB;
      });
    }
    
    // Обновление времени приёма с автосортировкой
    function updateMealTime(mealIndex, newTime) {
      const updatedMeals = day.meals.map((m, i) => 
        i === mealIndex ? { ...m, time: newTime } : m
      );
      // Сортируем после обновления
      const sortedMeals = sortMealsByTime(updatedMeals);
      setDay({ ...day, meals: sortedMeals });
    }
    
    function removeMeal(i){ 
      const meals = day.meals.filter((_, idx) => idx !== i); 
      setDay({...day, meals}); 
    }
    function addProductToMeal(mi,p){ 
      haptic('light'); // Вибрация при добавлении
      const item={id:uid('it_'), product_id:p.id??p.product_id, name:p.name, grams:100}; 
      const meals=day.meals.map((m,i)=> i===mi? {...m, items:[...(m.items||[]), item]}:m); 
      setDay({...day, meals}); 
      
      // Dispatch event для advice системы
      window.dispatchEvent(new CustomEvent('heysProductAdded'));
      
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
    function removeItem(mi, itId){ haptic('medium'); const meals=day.meals.map((m,i)=> i===mi? {...m, items:(m.items||[]).filter(it=>it.id!==itId)}:m); setDay({...day, meals}); }

    const sleepH = sleepHours(day.sleepStart, day.sleepEnd);

    // Автоматически обновляем sleepHours в объекте дня при изменении времени сна
    useEffect(() => {
      const calculatedSleepH = sleepHours(day.sleepStart, day.sleepEnd);
      if (calculatedSleepH !== day.sleepHours) {
        setDay(prevDay => ({...prevDay, sleepHours: calculatedSleepH}));
      }
    }, [day.sleepStart, day.sleepEnd]);

    // Вычисляем данные о днях для текущего месяца (с цветовой индикацией близости к цели)
    // Зависит от products чтобы пересчитать после загрузки данных клиента
    const activeDays = useMemo(() => {
      const getActiveDaysForMonth = (HEYS.dayUtils && HEYS.dayUtils.getActiveDaysForMonth) || (() => new Map());
      const d = new Date(date);
      return getActiveDaysForMonth(d.getFullYear(), d.getMonth(), prof);
    }, [date, prof.weight, prof.height, prof.age, prof.sex, prof.deficitPctTarget, products.length]);

    // Вычисляем текущий streak (дней подряд в норме 75-115%)
    const currentStreak = React.useMemo(() => {
      try {
        let count = 0;
        let checkDate = new Date();
        checkDate.setHours(12);
        
        for (let i = 0; i < 30; i++) {
          const dateStr = fmtDate(checkDate);
          const dayData = lsGet('heys_dayv2_' + dateStr, null);
          
          if (dayData && dayData.meals && dayData.meals.length > 0) {
            // Вычисляем калории за день
            let totalKcal = 0;
            (dayData.meals || []).forEach(meal => {
              (meal.items || []).forEach(item => {
                const grams = +item.grams || 0;
                const product = pIndex.get(item.product_id);
                if (product && grams > 0) {
                  totalKcal += ((+product.kcal100 || 0) * grams / 100);
                }
              });
            });
            
            // Хороший день = 75-115% от optimum
            const ratio = totalKcal / (optimum || 1);
            if (ratio >= 0.75 && ratio <= 1.15) {
              count++;
            } else if (i > 0) break; // Первый день может быть незавершён
          } else if (i > 0) break;
          
          checkDate.setDate(checkDate.getDate() - 1);
        }
        return count;
      } catch (e) {
        return 0;
      }
    }, [optimum, pIndex, fmtDate, lsGet]);

    // === Advice Module Integration ===
    // Собираем uiState для проверки занятости пользователя
    const uiState = React.useMemo(() => ({
      modalOpen: false, // TODO: отслеживать состояние модалок
      searchOpen: searchOpen,
      showTimePicker,
      showGramsPicker,
      showWeightPicker,
      showDeficitPicker,
      showZonePicker,
      showSleepQualityPicker,
      showDayScorePicker,
      showHouseholdPicker,
      showTrainingPicker
    }), [searchOpen, showTimePicker, showGramsPicker, showWeightPicker, showDeficitPicker, 
        showZonePicker, showSleepQualityPicker, showDayScorePicker, showHouseholdPicker, showTrainingPicker]);
    
    // Вызов advice engine
    const adviceEngine = React.useMemo(() => {
      if (!window.HEYS?.advice?.useAdviceEngine) return null;
      return window.HEYS.advice.useAdviceEngine;
    }, []);
    
    const adviceResult = adviceEngine ? adviceEngine({
      dayTot,
      normAbs,
      optimum,
      day,
      pIndex,
      currentStreak,
      trigger: adviceTrigger,
      uiState
    }) : { primary: null, relevant: [], adviceCount: 0 };
    
    const { primary: advicePrimary, relevant: adviceRelevant, adviceCount, markShown } = adviceResult;
    
    // Listener для heysProductAdded event
    React.useEffect(() => {
      const handleProductAdded = () => {
        // Задержка перед показом совета
        setTimeout(() => {
          setAdviceTrigger('product_added');
        }, 500);
      };
      
      window.addEventListener('heysProductAdded', handleProductAdded);
      return () => window.removeEventListener('heysProductAdded', handleProductAdded);
    }, []);
    
    // Trigger на открытие вкладки
    React.useEffect(() => {
      // Показываем совет при открытии вкладки с задержкой
      const timer = setTimeout(() => {
        setAdviceTrigger('tab_open');
      }, 1500);
      
      return () => clearTimeout(timer);
    }, [date]); // При смене даты - новый триггер
    
    // Показ toast при получении совета
    React.useEffect(() => {
      if (!advicePrimary) return;
      
      // Сбрасываем expanded
      setAdviceExpanded(false);
      
      // Показываем toast
      setToastVisible(true);
      setToastDismissed(false);
      
      // Haptic feedback для важных советов
      if ((advicePrimary.type === 'achievement' || advicePrimary.type === 'warning') && typeof haptic === 'function') {
        haptic('light');
      }
      
      // Вызываем onShow
      if (advicePrimary.onShow) advicePrimary.onShow();
      
      // Confetti для достижений
      if (advicePrimary.showConfetti) {
        setShowConfetti(true);
        if (typeof haptic === 'function') haptic('success');
        setTimeout(() => setShowConfetti(false), 2000);
      }
      
      // Отмечаем как показанный
      if (markShown) markShown(advicePrimary.id);
      
      // Запускаем таймер скрытия
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setToastVisible(false);
        setAdviceExpanded(false);
        setAdviceTrigger(null);
      }, advicePrimary.ttl || 5000);
      
      return () => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      };
    }, [advicePrimary?.id, adviceTrigger]);
    
    // Сброс advice при смене даты
    React.useEffect(() => {
      setAdviceTrigger(null);
      setAdviceExpanded(false);
      setToastVisible(false);
      if (window.HEYS?.advice?.resetSessionAdvices) {
        window.HEYS.advice.resetSessionAdvices();
      }
    }, [date]);
    
    // Сброс при открытии модалки/поиска
    React.useEffect(() => {
      if (uiState.showTimePicker || uiState.showGramsPicker || uiState.showWeightPicker ||
          uiState.showDeficitPicker || uiState.showZonePicker || uiState.searchOpen) {
        setAdviceExpanded(false);
      }
    }, [uiState.showTimePicker, uiState.showGramsPicker, uiState.showWeightPicker,
        uiState.showDeficitPicker, uiState.showZonePicker, uiState.searchOpen]);

    // --- blocks
    // Получаем Calendar динамически, чтобы HMR работал
    const CalendarComponent = (HEYS.dayPickers && HEYS.dayPickers.Calendar) || HEYS.Calendar;
    const calendarBlock = React.createElement('div',{className:'area-cal'},
      React.createElement(CalendarComponent,{
        key: 'cal-' + activeDays.size + '-' + products.length,
        valueISO:date,
        activeDays:activeDays,
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
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:stepsK,disabled:true,title:'ккал от шагов'})),
        React.createElement('td',null, React.createElement('input',{type:'number',value:day.steps||0,onChange:e=>setDay({...day,steps:+e.target.value||0})})),
        React.createElement('td',null,'шагов')
      ),
      // Row 4 — Тренировки
      React.createElement('tr',null,
        React.createElement('td',{className:'label muted small'},'Тренировки :'),
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r0(train1k+train2k),disabled:true})),
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
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:actTotal,disabled:true})),
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
        React.createElement('td',null, React.createElement('input',{className:'readOnly',value:r0(eatenKcal),disabled:true})),
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

    // Иконки для тренировок
    const trainIcons = ['🏃', '🚴', '🏊'];
    
    // Удаление тренировки (сдвигаем остальные вверх)
    const removeTraining = (ti) => {
      const emptyTraining = {z:[0,0,0,0], time:'', type:''};
      const oldTrainings = day.trainings || [emptyTraining, emptyTraining, emptyTraining];
      // Удаляем тренировку по индексу и добавляем пустую в конец
      const newTrainings = [
        ...oldTrainings.slice(0, ti),
        ...oldTrainings.slice(ti + 1),
        emptyTraining
      ].slice(0, 3); // гарантируем ровно 3 элемента
      setDay({...day, trainings: newTrainings});
      setVisibleTrainings(Math.max(0, visibleTrainings - 1));
    };

    // Компактные тренировки в SaaS стиле
    const trainingsBlock = React.createElement('div', { className: 'compact-trainings' },
      // Пустое состояние когда нет видимых тренировок
      visibleTrainings === 0 && React.createElement('div', { className: 'empty-trainings' },
        React.createElement('span', { className: 'empty-trainings-icon' }, '🏃‍♂️'),
        React.createElement('span', { className: 'empty-trainings-text' }, 'Нет тренировок')
      ),
      // Показываем только видимые тренировки
      Array.from({length: visibleTrainings}, (_, ti) => {
        const T = TR[ti] || { z: [0, 0, 0, 0], time: '', type: '' };
        const kcalZ = i => r0((+T.z[i] || 0) * (kcalMin[i] || 0));
        const total = r0(kcalZ(0) + kcalZ(1) + kcalZ(2) + kcalZ(3));
        const trainingType = trainingTypes.find(t => t.id === T.type);
        return React.createElement('div', { 
          key: 'tr' + ti, 
          className: 'compact-card compact-train'
        },
          React.createElement('div', { 
            className: 'compact-train-header',
            onClick: () => openTrainingPicker(ti)
          },
            React.createElement('span', { className: 'compact-train-icon' }, trainingType ? trainingType.icon : (trainIcons[ti] || '💪')),
            React.createElement('span', null, trainingType ? trainingType.label : ('Тренировка ' + (ti + 1))),
            T.time && React.createElement('span', { className: 'compact-train-time' }, T.time),
            React.createElement('span', { className: 'compact-badge train' }, total + ' ккал'),
            // Кнопка удаления (всегда показываем)
            React.createElement('button', {
              className: 'compact-train-remove',
              onClick: (e) => { e.stopPropagation(); removeTraining(ti); },
              title: 'Убрать тренировку'
            }, '×')
          ),
          React.createElement('div', { className: 'compact-train-zones' },
            [0, 1, 2, 3].map((zi) => React.createElement('div', { 
              key: 'z' + zi, 
              className: 'compact-zone zone-clickable',
              onClick: () => openZonePicker(ti, zi)
            },
              React.createElement('span', { className: 'compact-zone-label' }, 'Z' + (zi + 1)),
              React.createElement('span', { className: 'compact-zone-value' }, +T.z[zi] || '—'),
              // Показываем ккал если есть значение
              +T.z[zi] > 0 && React.createElement('span', { className: 'compact-zone-kcal' }, kcalZ(zi) + ' ккал'),
            )),
          ),
        );
      })
    );

  // Компактный блок сна и оценки дня в SaaS стиле (две плашки в розовом контейнере)
  const sideBlock = React.createElement('div',{className:'area-side right-col'},
      React.createElement('div', { className: 'compact-sleep compact-card' },
        React.createElement('div', { className: 'compact-card-header' }, '😴 Сон и самочувствие'),
        
        // Ряд с двумя плашками
        React.createElement('div', { className: 'sleep-cards-row' },
          // Плашка СОН
          React.createElement('div', { className: 'sleep-card' },
            React.createElement('div', { className: 'sleep-card-header' },
              React.createElement('span', { className: 'sleep-card-icon' }, '🌙'),
              React.createElement('span', { className: 'sleep-card-title' }, 'Сон')
            ),
            React.createElement('div', { className: 'sleep-card-times' },
              React.createElement('input', { className: 'sleep-time-input', type: 'time', value: day.sleepStart || '', onChange: e => setDay({...day, sleepStart: e.target.value}) }),
              React.createElement('span', { className: 'sleep-arrow' }, '→'),
              React.createElement('input', { className: 'sleep-time-input', type: 'time', value: day.sleepEnd || '', onChange: e => setDay({...day, sleepEnd: e.target.value}) })
            ),
            React.createElement('div', { className: 'sleep-card-stats' },
              React.createElement('span', { className: 'sleep-duration' }, sleepH ? 'Спал ' + sleepH + ' ч' : '—'),
              React.createElement('div', { 
                className: 'sleep-quality-btn',
                onClick: openSleepQualityPicker
              },
                React.createElement('span', { className: 'sleep-quality-label' }, 'Качество сна'),
                React.createElement('span', { className: 'sleep-quality-value' }, day.sleepQuality ? '★ ' + day.sleepQuality : '—')
              )
            ),
            React.createElement('input', { className: 'sleep-note', type: 'text', placeholder: 'Заметка...', value: day.sleepNote || '', onChange: e => setDay({...day, sleepNote: e.target.value}) })
          ),
          
          // Плашка ОЦЕНКА ДНЯ
          React.createElement('div', { className: 'sleep-card' },
            React.createElement('div', { className: 'sleep-card-header' },
              React.createElement('span', { className: 'sleep-card-icon' }, '📊'),
              React.createElement('span', { className: 'sleep-card-title' }, 'Оценка дня')
            ),
            React.createElement('div', { 
              className: 'day-score-btn',
              onClick: openDayScorePicker
            },
              React.createElement('span', { className: 'day-score-label' }, 'Оценка'),
              React.createElement('span', { className: 'day-score-value' }, day.dayScore ? day.dayScore + ' / 10' : '—')
            ),
            React.createElement('div', { className: 'day-mood-row' },
              React.createElement('div', { className: 'mood-card' },
                React.createElement('span', { className: 'mood-card-icon' }, '😊'),
                React.createElement('span', { className: 'mood-card-label' }, 'Настроение'),
                React.createElement('span', { className: 'mood-card-value' }, day.moodAvg || '—')
              ),
              React.createElement('div', { className: 'mood-card' },
                React.createElement('span', { className: 'mood-card-icon' }, '💪'),
                React.createElement('span', { className: 'mood-card-label' }, 'Самочувствие'),
                React.createElement('span', { className: 'mood-card-value' }, day.wellbeingAvg || '—')
              ),
              React.createElement('div', { className: 'mood-card' },
                React.createElement('span', { className: 'mood-card-icon' }, '😰'),
                React.createElement('span', { className: 'mood-card-label' }, 'Стресс'),
                React.createElement('span', { className: 'mood-card-value' }, day.stressAvg || '—')
              )
            ),
            React.createElement('input', { className: 'sleep-note', type: 'text', placeholder: 'Заметка...', value: day.dayComment || '', onChange: e => setDay({...day, dayComment: e.target.value}) })
          )
        )
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
      // Определяем тип приёма пищи (ручной или автоматический)
      const manualType = meal.mealType; // если пользователь выбрал вручную
      const autoTypeInfo = getMealType(mi, meal, day.meals, pIndex);
      const mealTypeInfo = manualType && U.MEAL_TYPES && U.MEAL_TYPES[manualType] 
        ? { type: manualType, ...U.MEAL_TYPES[manualType] }
        : autoTypeInfo;
      
      // Функция смены типа приёма
      const changeMealType = (newType) => {
        const updatedMeals = day.meals.map((m, i) => 
          i === mi ? { ...m, mealType: newType } : m
        );
        setDay({ ...day, meals: updatedMeals });
        haptic('light');
      };
      
      // Dropdown для выбора типа (на мобильных нативный select, на десктопе custom)
      const MEAL_TYPE_OPTIONS = [
        { value: '', label: '🔄 Авто' },
        { value: 'breakfast', label: '🍳 Завтрак' },
        { value: 'snack1', label: '🍎 Перекус' },
        { value: 'lunch', label: '🍲 Обед' },
        { value: 'snack2', label: '🥜 Перекус' },
        { value: 'dinner', label: '🍽️ Ужин' },
        { value: 'snack3', label: '🧀 Перекус' },
        { value: 'night', label: '🌙 Ночной' }
      ];
      
      // Форматируем время для отображения
      const timeDisplay = meal.time || '';
      
      // Калории приёма
      const mealKcal = Math.round(totals.kcal || 0);
      
      return React.createElement(React.Fragment,{key:meal.id},
        // Заголовок приёма: тип (dropdown) · время · калории
        React.createElement('div',{className:'meal-sep meal-type-' + mealTypeInfo.type},
          // Обёртка для dropdown
          React.createElement('div', { className: 'meal-type-wrapper' },
            // Текущий тип (иконка + название) — кликабельный
            React.createElement('span', { className: 'meal-type-label' }, 
              mealTypeInfo.icon + ' ' + mealTypeInfo.name,
              // Индикатор dropdown
              React.createElement('span', { className: 'meal-type-arrow' }, ' ▾')
            ),
            // Подсказка "изменить"
            React.createElement('span', { className: 'meal-type-hint' }, 'изменить'),
            // Скрытый select поверх
            React.createElement('select', {
              className: 'meal-type-select',
              value: manualType || '',
              onChange: (e) => changeMealType(e.target.value || null),
              title: 'Изменить тип приёма'
            }, MEAL_TYPE_OPTIONS.map(opt => 
              React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
            ))
          ),
          // Время (если есть)
          timeDisplay && React.createElement('span', { className: 'meal-time-badge' }, 
            '· ' + timeDisplay
          ),
          // Калории (если есть продукты)
          mealKcal > 0 && React.createElement('span', { className: 'meal-kcal-badge' }, 
            mealKcal + ' ккал'
          )
        ),
        React.createElement('div',{className:'card tone-blue meal-card', 'data-meal-index': mi, style:{marginTop:'4px', width: '100%'}},
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
            // Определяем цвет граммов
            const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';
            
            const cardContent = React.createElement('div', { className: 'mpc' },
              // Row 1: name + grams (без кнопки delete — удаление свайпом)
              React.createElement('div', { className: 'mpc-row1' },
                React.createElement('span', { className: 'mpc-name' }, p.name),
                // На мобильных — кнопка открывает wheel picker
                React.createElement('button', {
                  className: 'mpc-grams-btn ' + gramsClass,
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
      Object.keys(t).forEach(k=>t[k]=r0(t[k]));
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
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-pvL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Факт'},'Ф'):React.createElement('td',{key:'ds-pv'+i},'')),
            factKeys.map(k=>factCell(k)),
            React.createElement('td',null,'')
          ),
          // Норма
          React.createElement('tr',null,
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-npL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Норма'},'Н'):React.createElement('td',{key:'ds-np'+i},'')),
            factKeys.map(k=>React.createElement('td',{key:'ds-nv'+k},normVal(k))),
            React.createElement('td',null,'')
          ),
          // Откл
          React.createElement('tr',{className:'daily-dev-row'},
            React.createElement('td',null,''),
            React.createElement('td',null,''),
            per100Head.map((_,i)=> i===per100Head.length-1? React.createElement('td',{key:'ds-dpL'+i,style:{fontWeight:600,textAlign:'right',paddingRight:'6px'},title:'Отклонение'},'Δ'):React.createElement('td',{key:'ds-dp'+i},'')),
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
          React.createElement('span', { className: 'mds-label', title: 'Факт' }, 'Ф'),
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
          React.createElement('span', { className: 'mds-label', title: 'Норма' }, 'Н'),
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
          React.createElement('span', { className: 'mds-label', title: 'Отклонение' }, 'Δ'),
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
    const remainingKcal = r0(optimum - eatenKcal); // сколько ещё можно съесть
    
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
    
    // Данные для sparkline калорий за 7 дней
    const sparklineData = React.useMemo(() => {
      try {
        const today = new Date(date);
        const days = [];
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        
        // Получаем продукты для вычисления калорий
        let productsMap = new Map();
        try {
          const productsKey = clientId 
            ? 'heys_' + clientId + '_products' 
            : 'heys_products';
          const productsRaw = localStorage.getItem(productsKey);
          if (productsRaw) {
            let products = [];
            if (productsRaw.startsWith('¤Z¤')) {
              let str = productsRaw.substring(3);
              const patterns = {
                '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"',
                '¤c¤': '"carbs100"', '¤f¤': '"fat100"', '¤s¤': '"simple100"',
                '¤x¤': '"complex100"', '¤b¤': '"badFat100"', '¤g¤': '"goodFat100"',
                '¤t¤': '"trans100"', '¤i¤': '"fiber100"', '¤G¤': '"gi"', '¤h¤': '"harmScore"'
              };
              for (const [code, pattern] of Object.entries(patterns)) {
                str = str.split(code).join(pattern);
              }
              products = JSON.parse(str);
            } else {
              products = JSON.parse(productsRaw);
            }
            (products || []).forEach(p => { if(p.id) productsMap.set(p.id, p); });
          }
        } catch(e) {}
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const isToday = i === 0;
          
          // Для сегодня используем eatenKcal напрямую
          if (isToday) {
            days.push({ date: dateStr, kcal: Math.round(eatenKcal || 0), isToday: true });
            continue;
          }
          
          // Для прошлых дней читаем напрямую из localStorage
          let dayData = null;
          try {
            const scopedKey = clientId 
              ? 'heys_' + clientId + '_dayv2_' + dateStr 
              : 'heys_dayv2_' + dateStr;
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              if (raw.startsWith('¤Z¤')) {
                let str = raw.substring(3);
                const patterns = { '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"', '¤c¤': '"carbs100"', '¤f¤': '"fat100"' };
                for (const [code, pattern] of Object.entries(patterns)) str = str.split(code).join(pattern);
                dayData = JSON.parse(str);
              } else {
                dayData = JSON.parse(raw);
              }
            }
          } catch(e) {}
          
          if (dayData && dayData.meals) {
            // Вычисляем калории через продукты
            let totalKcal = 0;
            (dayData.meals || []).forEach(meal => {
              (meal.items || []).forEach(item => {
                const grams = +item.grams || 0;
                const product = productsMap.get(item.product_id);
                if (product && grams > 0) {
                  const kcal100 = +product.kcal100 || 0;
                  totalKcal += (kcal100 * grams / 100);
                }
              });
            });
            days.push({ date: dateStr, kcal: Math.round(totalKcal), isToday: false });
          } else {
            days.push({ date: dateStr, kcal: 0, isToday: false });
          }
        }
        
        return days;
      } catch (e) {
        return [];
      }
    }, [date, eatenKcal]);
    
    // Умные подсказки по БЖУ (с приоритетом предупреждений)
    const macroTip = React.useMemo(() => {
      const proteinPct = (dayTot.prot || 0) / (normAbs.prot || 1);
      const fatPct = (dayTot.fat || 0) / (normAbs.fat || 1);
      const carbsPct = (dayTot.carbs || 0) / (normAbs.carbs || 1);
      const kcalPct = (dayTot.kcal || 0) / (optimum || 1);
      const fiberPct = (dayTot.fiber || 0) / (normAbs.fiber || 25);
      
      // Вычисляем простые/сложные углеводы
      const simpleCarbs = dayTot.simple || 0;
      const complexCarbs = dayTot.complex || 0;
      const totalCarbs = simpleCarbs + complexCarbs;
      const simplePct = totalCarbs > 0 ? (simpleCarbs / totalCarbs) : 0;
      
      // Вычисляем вредные жиры
      const badFat = dayTot.bad || 0;
      const totalFat = dayTot.fat || 0;
      const badFatPct = totalFat > 0 ? (badFat / totalFat) : 0;
      
      // Средний ГИ
      const avgGI = dayTot.gi || 0;
      
      // Контекст времени
      const hour = new Date().getHours();
      
      // Количество приёмов пищи
      const mealCount = (day.meals || []).filter(m => m.items?.length > 0).length;
      
      // Была ли тренировка
      const hasTraining = (day.trainings || []).some(t => t.z && t.z.some(m => m > 0));
      
      // 🏆 ДОСТИЖЕНИЯ (высший приоритет, раз за сессию)
      try {
        if (currentStreak >= 7 && !sessionStorage.getItem('heys_streak7')) {
          sessionStorage.setItem('heys_streak7', '1');
          return { icon: '🏆', text: `Невероятно! ${currentStreak} дней в норме!`, type: 'achievement' };
        }
        if (currentStreak >= 3 && !sessionStorage.getItem('heys_streak3')) {
          sessionStorage.setItem('heys_streak3', '1');
          return { icon: '🔥', text: `${currentStreak} дня подряд в норме! Так держать!`, type: 'achievement' };
        }
      } catch(e) {}
      
      // 👋 Первый день в приложении
      if (mealCount === 1 && !localStorage.getItem('heys_first_meal_tip')) {
        localStorage.setItem('heys_first_meal_tip', '1');
        return { icon: '👋', text: 'Отличное начало! Записывай всё — это ключ к успеху', type: 'achievement' };
      }
      
      // 🚨 ПРЕДУПРЕЖДЕНИЯ (высший приоритет)
      // Сильный перебор калорий
      if (kcalPct >= 1.25) {
        return { icon: '⚠️', text: 'Перебор калорий! Завтра сделай разгрузочный день', type: 'warning' };
      }
      // Мало калорий вечером (возможное голодание)
      if (hour >= 18 && dayTot.kcal < 500 && dayTot.kcal > 0) {
        return { icon: '⚠️', text: 'Слишком мало калорий — это вредит метаболизму', type: 'warning' };
      }
      // Много простых углеводов (>50% от общих углеводов)
      if (simplePct > 0.5 && simpleCarbs > 30) {
        return { icon: '⚠️', text: 'Много простых углеводов! Замени сладкое на кашу/овощи', type: 'warning' };
      }
      // Много вредных жиров (>40% от общих жиров)
      if (badFatPct > 0.4 && badFat > 20) {
        return { icon: '⚠️', text: 'Много вредных жиров! Замени на рыбу/орехи/авокадо', type: 'warning' };
      }
      // Высокий средний ГИ
      if (avgGI > 70 && dayTot.kcal > 500) {
        return { icon: '📈', text: 'Высокий ГИ — замени быстрые углеводы на сложные', type: 'warning' };
      }
      
      // 🥬 КЛЕТЧАТКА
      if (fiberPct < 0.5 && dayTot.kcal > 500) {
        return { icon: '🥬', text: 'Добавь клетчатки: овощи, фрукты, каша', type: 'fiber' };
      }
      
      // 🥗 Нет овощей/фруктов
      const allItems = (day.meals || []).flatMap(m => m.items || []);
      const hasVeggies = allItems.some(it => {
        const product = M.getProductFromItem ? M.getProductFromItem(it, pIndex) : pIndex.get(it.product_id);
        const name = product?.name || it.name || '';
        return /овощ|салат|помидор|огурец|капуста|морковь|яблок|банан|апельсин|груша|свёкла|брокколи|шпинат|лук|перец|кабачок|тыква|зелень|петрушка|укроп|сельдерей/i.test(name);
      });
      if (!hasVeggies && dayTot.kcal > 800) {
        return { icon: '🥗', text: 'Добавь овощи или фрукты — витамины и клетчатка', type: 'tip' };
      }
      
      // 🍽️ Баланс макросов
      if (carbsPct > 0.7 && proteinPct < 0.4) {
        return { icon: '🍽️', text: 'Углеводы без белка = быстрый голод. Добавь белок!', type: 'tip' };
      }
      if (fatPct > 0.7 && carbsPct < 0.4) {
        return { icon: '⚡', text: 'Для энергии нужны углеводы — попробуй кашу', type: 'tip' };
      }
      
      // 🥚 Мало белка на завтрак
      const breakfastMeal = (day.meals || [])[0];
      if (breakfastMeal && breakfastMeal.items?.length > 0) {
        const breakfastTotals = M.mealTotals ? M.mealTotals(breakfastMeal, pIndex) : {};
        if ((breakfastTotals.prot || 0) < 10 && (breakfastTotals.kcal || 0) > 200) {
          return { icon: '🥚', text: 'Белок на завтрак = сытость до обеда. Добавь яйца/творог', type: 'tip' };
        }
      }
      
      // ⏰ Контекст времени
      // Вечерние простые углеводы
      if (hour >= 18 && simplePct > 0.4 && simpleCarbs > 50) {
        return { icon: '🌙', text: 'Сладкое вечером → плохой сон. Лучше белок!', type: 'tip' };
      }
      // Пропущенный завтрак
      if (hour >= 12 && mealCount === 0) {
        return { icon: '🌅', text: 'Завтрак запускает метаболизм — не пропускай!', type: 'tip' };
      }
      // Большой перерыв между приёмами
      if (hour >= 14 && mealCount === 1 && dayTot.kcal > 300) {
        return { icon: '⏰', text: 'Большие перерывы замедляют метаболизм — перекуси!', type: 'tip' };
      }
      // Один большой приём
      if (mealCount === 1 && dayTot.kcal > 800) {
        return { icon: '🍽️', text: 'Лучше 3-4 небольших приёма чем 1 большой', type: 'tip' };
      }
      
      // 💪 После тренировки важен белок
      if (hasTraining && proteinPct < 0.6) {
        return { icon: '💪', text: 'После тренировки важен белок для восстановления', type: 'tip' };
      }
      
      // 💧 Контекст воды
      const waterMl = day.waterMl || 0;
      const waterGoal = 2000;
      if (waterMl < waterGoal * 0.5 && hour >= 15) {
        return { icon: '💧', text: 'Выпей воды — ты за полдня ниже 50% нормы', type: 'tip' };
      }
      
      // 📊 РЕКОМЕНДАЦИИ по дефицитам макросов
      if (proteinPct < 0.5 && fatPct >= 0.5 && carbsPct >= 0.5) {
        return { icon: '🥩', text: 'Добавь белка: творог, яйца, курица', type: 'protein' };
      }
      if (fatPct < 0.5 && proteinPct >= 0.5 && carbsPct >= 0.5) {
        return { icon: '🥑', text: 'Мало жиров: орехи, авокадо, масло', type: 'fat' };
      }
      if (carbsPct < 0.5 && proteinPct >= 0.5 && fatPct >= 0.5) {
        return { icon: '🍞', text: 'Добавь углеводов: каша, хлеб, фрукты', type: 'carbs' };
      }
      
      // 🎯 Подсказка калорий (осталось немного)
      if (kcalPct >= 0.8 && kcalPct < 0.95) {
        const remaining = Math.round(optimum - dayTot.kcal);
        return { icon: '🎯', text: `Осталось ${remaining} ккал — идеально для перекуса`, type: 'tip' };
      }
      // Небольшой перебор
      if (kcalPct >= 1.1 && kcalPct < 1.25) {
        return { icon: '📊', text: 'Немного перебор — завтра чуть меньше, и всё ок 😊', type: 'tip' };
      }
      
      // ⭐ Идеальный день
      if (kcalPct >= 0.95 && kcalPct <= 1.05 && proteinPct >= 0.9 && fatPct >= 0.9 && carbsPct >= 0.9) {
        return { icon: '⭐', text: 'Идеальный баланс! Отличная работа 🎉', type: 'achievement' };
      }
      
      // ✅ УСПЕХ
      if (proteinPct >= 0.8 && fatPct >= 0.8 && carbsPct >= 0.8) {
        return { icon: '✅', text: 'Отлично! Все макросы в балансе', type: 'success' };
      }
      
      // Не показываем подсказку если день пустой или всё слишком мало
      return null;
    }, [dayTot.prot, dayTot.fat, dayTot.carbs, dayTot.simple, dayTot.complex, dayTot.bad, dayTot.kcal, dayTot.fiber, dayTot.gi, normAbs.prot, normAbs.fat, normAbs.carbs, normAbs.fiber, optimum, currentStreak, day.meals, day.trainings, day.waterMl, pIndex]);
    
    // Показ toast при изменении подсказки
    useEffect(() => {
      // Сбрасываем dismissed при смене дня
      setToastDismissed(false);
    }, [date]);
    
    useEffect(() => {
      if (macroTip && !toastDismissed) {
        // Показываем toast с задержкой (чтобы не мелькал при загрузке)
        const showTimeout = setTimeout(() => {
          setToastVisible(true);
        }, 1500);
        
        // Автоскрытие через 6 секунд
        toastTimeoutRef.current = setTimeout(() => {
          setToastVisible(false);
        }, 7500);
        
        return () => {
          clearTimeout(showTimeout);
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
      } else {
        setToastVisible(false);
      }
    }, [macroTip, toastDismissed]);
    
    // Закрытие toast
    const dismissToast = () => {
      setToastVisible(false);
      setToastDismissed(true);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
    
    // === Мини-график калорий по приёмам ===
    const mealsChartData = React.useMemo(() => {
      const meals = day.meals || [];
      if (meals.length === 0) return null;
      
      const data = meals.map((meal, mi) => {
        const totals = M.mealTotals ? M.mealTotals(meal, pIndex) : { kcal: 0 };
        const mealTypeInfo = getMealType(mi, meal, meals, pIndex);
        return {
          name: mealTypeInfo.name,
          icon: mealTypeInfo.icon,
          kcal: Math.round(totals.kcal || 0),
          time: meal.time || ''
        };
      });
      
      const totalKcal = data.reduce((sum, m) => sum + m.kcal, 0);
      const maxKcal = Math.max(...data.map(m => m.kcal), 1);
      
      return { meals: data, totalKcal, maxKcal, targetKcal: optimum };
    }, [day.meals, pIndex, optimum]);

    // === Pull-to-refresh логика (Enhanced) ===
    const PULL_THRESHOLD = 80;
    
    // Haptic feedback helper
    const triggerHaptic = (intensity = 10) => {
      const now = Date.now();
      if (now - lastHapticRef.current > 50 && navigator.vibrate) {
        navigator.vibrate(intensity);
        lastHapticRef.current = now;
      }
    };
    
    const handleRefresh = async () => {
      setIsRefreshing(true);
      setRefreshStatus('syncing');
      triggerHaptic(15);
      
      const cloud = window.HEYS && window.HEYS.cloud;
      const clientId = localStorage.getItem('heys_client_current');
      
      try {
        // Реальная синхронизация с Supabase
        if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
          await cloud.bootstrapClientSync(clientId);
        }
        
        // Минимальная задержка для плавного UX
        await new Promise(r => setTimeout(r, 400));
        
        setRefreshStatus('success');
        triggerHaptic(20);
        
        // Показываем успех 800ms, затем сброс
        await new Promise(r => setTimeout(r, 800));
        
        // Перезагрузка данных без полного reload
        window.dispatchEvent(new CustomEvent('heys:refresh'));
        
      } catch (err) {
        setRefreshStatus('error');
        // Тихий fallback — pull-refresh некритичен
        await new Promise(r => setTimeout(r, 1000));
      } finally {
        setIsRefreshing(false);
        setRefreshStatus('idle');
        setPullProgress(0);
      }
    };
    
    React.useEffect(() => {
      const container = document.querySelector('.day-view-container');
      if (!container) return;
      
      const onTouchStart = (e) => {
        // Начинаем pull только если скролл вверху
        if (container.scrollTop <= 0) {
          pullStartY.current = e.touches[0].clientY;
          isPulling.current = true;
          setRefreshStatus('pulling');
        }
      };
      
      const onTouchMove = (e) => {
        if (!isPulling.current || isRefreshing) return;
        
        const y = e.touches[0].clientY;
        const diff = y - pullStartY.current;
        
        if (diff > 0 && container.scrollTop <= 0) {
          // Resistance effect с elastic curve
          const resistance = 0.45;
          const progress = Math.min(diff * resistance, PULL_THRESHOLD * 1.2);
          setPullProgress(progress);
          
          // Haptic при достижении threshold
          if (progress >= PULL_THRESHOLD && refreshStatus !== 'ready') {
            setRefreshStatus('ready');
            triggerHaptic(12);
          } else if (progress < PULL_THRESHOLD && refreshStatus === 'ready') {
            setRefreshStatus('pulling');
          }
          
          if (diff > 10) {
            e.preventDefault(); // Предотвращаем обычный скролл
          }
        }
      };
      
      const onTouchEnd = () => {
        if (!isPulling.current) return;
        
        if (pullProgress >= PULL_THRESHOLD) {
          handleRefresh();
        } else {
          // Elastic bounce back
          setPullProgress(0);
          setRefreshStatus('idle');
        }
        isPulling.current = false;
      };
      
      container.addEventListener('touchstart', onTouchStart, { passive: true });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, { passive: true });
      
      return () => {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
      };
    }, [pullProgress, isRefreshing, refreshStatus]);
    
    // === Анимация прогресса калорий при загрузке ===
    React.useEffect(() => {
      const target = (eatenKcal / optimum) * 100;
      // Анимируем от 0 до target
      let start = animatedProgress;
      const duration = 800;
      const startTime = performance.now();
      
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + (target - start) * eased;
        setAnimatedProgress(current);
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    }, [eatenKcal, optimum]);
    
    // === Confetti при достижении 100% цели ===
    React.useEffect(() => {
      const progress = (eatenKcal / optimum) * 100;
      const prevProgress = (prevKcalRef.current / optimum) * 100;
      
      // Показываем confetti когда впервые достигаем 95-105% (зона успеха)
      if (progress >= 95 && progress <= 105 && prevProgress < 95 && !confettiShownRef.current) {
        confettiShownRef.current = true;
        setShowConfetti(true);
        haptic('success');
        
        // Скрываем через 3 секунды
        setTimeout(() => setShowConfetti(false), 3000);
      }
      
      // Сбрасываем флаг если уходим ниже 90%
      if (progress < 90) {
        confettiShownRef.current = false;
      }
      
      prevKcalRef.current = eatenKcal;
    }, [eatenKcal, optimum]);
    
    // SVG Sparkline компонент
    const renderSparkline = (data, goal) => {
      // Skeleton loader пока данные загружаются
      if (!data) {
        return React.createElement('div', { className: 'sparkline-skeleton' },
          React.createElement('div', { className: 'sparkline-skeleton-line' }),
          React.createElement('div', { className: 'sparkline-skeleton-dots' },
            Array.from({length: 7}).map((_, i) => 
              React.createElement('div', { key: i, className: 'sparkline-skeleton-dot' })
            )
          )
        );
      }
      
      if (data.length === 0) return null;
      
      const width = 300; // широкий viewBox, SVG растянется на 100%
      const height = 44;
      const paddingTop = 4;
      const paddingBottom = 14; // место для меток дней
      const paddingX = 12;
      const chartHeight = height - paddingTop - paddingBottom;
      const maxKcal = Math.max(goal * 1.2, ...data.map(d => d.kcal));
      
      const points = data.map((d, i) => {
        const x = paddingX + (i / (data.length - 1)) * (width - paddingX * 2);
        const y = paddingTop + chartHeight - (d.kcal / maxKcal) * chartHeight;
        // Извлекаем день из даты (последние 2 символа)
        const dayNum = d.date ? d.date.slice(-2).replace(/^0/, '') : '';
        return { x, y, kcal: d.kcal, isToday: d.isToday, dayNum };
      });
      
      const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
      const goalY = paddingTop + chartHeight - (goal / maxKcal) * chartHeight;
      
      return React.createElement('svg', { 
        className: 'sparkline-svg',
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'xMidYMid meet'
      },
        // Линия цели (пунктир)
        React.createElement('line', {
          x1: 0, y1: goalY, x2: width, y2: goalY,
          className: 'sparkline-goal'
        }),
        // Градиент заливка
        React.createElement('defs', null,
          React.createElement('linearGradient', { id: 'sparklineGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
            React.createElement('stop', { offset: '0%', stopColor: '#22c55e', stopOpacity: '0.3' }),
            React.createElement('stop', { offset: '100%', stopColor: '#22c55e', stopOpacity: '0.05' })
          )
        ),
        // Заливка под графиком
        React.createElement('path', {
          d: pathD + ' L' + points[points.length-1].x + ',' + (paddingTop + chartHeight) + ' L' + points[0].x + ',' + (paddingTop + chartHeight) + ' Z',
          fill: 'url(#sparklineGrad)'
        }),
        // Линия графика
        React.createElement('path', {
          d: pathD,
          className: 'sparkline-line'
        }),
        // Метки дней внизу
        points.map((p, i) => 
          React.createElement('text', {
            key: 'day-' + i,
            x: p.x,
            y: height - 2,
            className: 'sparkline-day-label' + (p.isToday ? ' sparkline-day-today' : ''),
            textAnchor: 'middle'
          }, p.dayNum)
        ),
        // Точки на все дни с hover и цветом по статусу
        points.map((p, i) => {
          // Определяем цвет: зелёный если в норме, жёлтый если чуть превышен, красный если сильно
          const ratio = p.kcal / goal;
          let dotClass = 'sparkline-dot';
          if (ratio <= 1.0) {
            dotClass += ' sparkline-dot-ok'; // зелёный
          } else if (ratio <= 1.15) {
            dotClass += ' sparkline-dot-warn'; // жёлтый (до +15%)
          } else {
            dotClass += ' sparkline-dot-over'; // красный (>15%)
          }
          if (p.isToday) dotClass += ' sparkline-dot-today';
          
          return React.createElement('circle', {
            key: 'dot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isToday ? 4 : 2.5,
            className: dotClass,
            style: { cursor: 'pointer' }
          },
            React.createElement('title', null, p.dayNum + ': ' + p.kcal + ' ккал')
          );
        })
      );
    };
    
    // === БЛОК СТАТИСТИКА ===
    const statsBlock = React.createElement('div', { className: 'compact-stats compact-card' },
      React.createElement('div', { className: 'compact-card-header' }, '📊 СТАТИСТИКА'),
      // 4 карточки метрик внутри статистики
      React.createElement('div', { className: 'metrics-cards' },
        // Затраты (TDEE)
        React.createElement('div', { 
          className: 'metrics-card',
          style: { background: '#f8fafc', borderColor: '#e2e8f0' },
          title: 'Затраты: ' + tdee + ' ккал'
        },
          React.createElement('div', { className: 'metrics-icon' }, '⚡'),
          React.createElement('div', { className: 'metrics-value', style: { color: '#64748b' } }, tdee),
          React.createElement('div', { className: 'metrics-label' }, 'Затраты')
        ),
        // Цель
        React.createElement('div', { 
          className: 'metrics-card',
          style: { background: '#f0f9ff', borderColor: '#bae6fd' }
        },
          React.createElement('div', { className: 'metrics-icon' }, '🎯'),
          React.createElement('div', { className: 'metrics-value', style: { color: '#0369a1' } }, optimum),
          React.createElement('div', { className: 'metrics-label' }, 'Цель (' + dayTargetDef + '%)')
        ),
        // Съедено
        React.createElement('div', { 
          className: 'metrics-card',
          style: { background: eatenCol.bg, borderColor: eatenCol.border }
        },
          React.createElement('div', { className: 'metrics-icon' }, '🍽️'),
          React.createElement('div', { className: 'metrics-value', style: { color: eatenCol.text } }, r0(eatenKcal)),
          React.createElement('div', { className: 'metrics-label' }, 'Съедено')
        ),
        // Осталось / Перебор
        React.createElement('div', { 
          className: 'metrics-card',
          style: { background: remainCol.bg, borderColor: remainCol.border }
        },
          React.createElement('div', { className: 'metrics-icon' }, remainingKcal >= 0 ? '🎯' : '🚫'),
          React.createElement('div', { className: 'metrics-value', style: { color: remainCol.text } }, 
            remainingKcal >= 0 ? remainingKcal : Math.abs(remainingKcal)
          ),
          React.createElement('div', { className: 'metrics-label' }, 
            remainingKcal >= 0 ? 'Осталось' : 'Перебор'
          )
        )
      ),
      // Спарклайн — график калорий за 7 дней
      React.createElement('div', { className: 'sparkline-container' },
        renderSparkline(sparklineData, optimum)
      ),
      // Статус-бар прогресса к цели
      React.createElement('div', { className: 'goal-progress-bar' },
        React.createElement('div', { className: 'goal-progress-header' },
          React.createElement('span', { className: 'goal-progress-title' }, 
            eatenKcal <= optimum ? '🎯 До цели' : '⚠️ Перебор'
          ),
          React.createElement('span', { className: 'goal-progress-stats' },
            React.createElement('span', { className: 'goal-eaten' }, r0(eatenKcal)),
            React.createElement('span', { className: 'goal-divider' }, '/'),
            React.createElement('span', { className: 'goal-target' }, optimum),
            React.createElement('span', { className: 'goal-unit' }, 'ккал')
          )
        ),
        React.createElement('div', { className: 'goal-progress-track' + (eatenKcal > optimum ? ' has-over' : '') },
            // Зелёная часть — до цели
            React.createElement('div', { 
              className: 'goal-progress-fill',
              style: { width: Math.min(eatenKcal > optimum ? (optimum / eatenKcal * 100) : animatedProgress, 100) + '%' }
            }),
            // Красная часть — перебор (справа от маркера)
            eatenKcal > optimum && React.createElement('div', { 
              className: 'goal-progress-over',
              style: { 
                left: (optimum / eatenKcal * 100) + '%',
                width: ((eatenKcal - optimum) / eatenKcal * 100) + '%'
              }
            }),
            // Маркер цели — сдвигается влево при переборе
            React.createElement('div', { 
              className: 'goal-marker' + (eatenKcal > optimum ? ' over' : ''),
              style: eatenKcal > optimum ? { left: (optimum / eatenKcal * 100) + '%' } : {}
            })
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
        // Confetti overlay
        showConfetti && React.createElement('div', { className: 'confetti-container' },
          Array.from({length: 50}).map((_, i) => 
            React.createElement('div', { 
              key: i, 
              className: 'confetti',
              style: {
                left: Math.random() * 100 + '%',
                animationDelay: Math.random() * 0.5 + 's',
                backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]
              }
            })
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
          React.createElement('span', { className: 'weight-card-label' }, 'ВЕС НА УТРО'),
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
        ),
        // Плашка дефицита - кликабельная
        React.createElement('div', { 
          className: 'deficit-card-modern',
          onClick: openDeficitPicker
        },
          React.createElement('span', { className: 'weight-card-label' }, 'ЦЕЛЬ ДЕФИЦИТ'),
          React.createElement('div', { className: 'weight-card-row' },
            React.createElement('span', { 
              className: 'deficit-value-number' + (currentDeficit < 0 ? ' deficit-negative' : currentDeficit > 0 ? ' deficit-positive' : '')
            }, 
              (currentDeficit > 0 ? '+' : '') + currentDeficit
            ),
            React.createElement('span', { className: 'weight-value-unit' }, '%')
          ),
          // Разница от профиля
          currentDeficit !== profileDeficit && React.createElement('div', { 
            className: 'deficit-card-trend ' + (currentDeficit < profileDeficit ? 'trend-down' : 'trend-up')
          }, 
            React.createElement('span', { className: 'trend-arrow' }, currentDeficit < profileDeficit ? '↓' : '↑'),
            (currentDeficit > profileDeficit ? '+' : '') + (currentDeficit - profileDeficit) + '%'
          )
        )
      )
    );

    // === COMPACT ACTIVITY INPUT ===
    const stepsGoal = savedStepsGoal;
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
      // Не вызываем preventDefault на React synthetic event (passive listener)
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
        // preventDefault только для touch, чтобы не скроллить страницу
        if (ev.cancelable) ev.preventDefault();
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

    // === Water Card (Карточка воды) ===
    const waterCard = React.createElement('div', { className: 'compact-water compact-card' },
      React.createElement('div', { className: 'compact-card-header' }, '💧 ВОДА'),
      
      // Основной контент: кольцо + инфо + пресеты
      React.createElement('div', { className: 'water-card-content' },
        // Левая часть: кольцо прогресса + breakdown
        React.createElement('div', { className: 'water-ring-container' },
          React.createElement('div', { 
            className: 'water-ring-large',
            onMouseDown: handleWaterRingDown,
            onMouseUp: handleWaterRingUp,
            onMouseLeave: handleWaterRingLeave,
            onTouchStart: handleWaterRingDown,
            onTouchEnd: handleWaterRingUp
          },
            React.createElement('svg', { viewBox: '0 0 36 36', className: 'water-ring-svg' },
              React.createElement('circle', { className: 'water-ring-bg', cx: 18, cy: 18, r: 15.9 }),
              React.createElement('circle', { 
                className: 'water-ring-fill', 
                cx: 18, cy: 18, r: 15.9,
                style: { strokeDasharray: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + ' 100' }
              })
            ),
            React.createElement('div', { className: 'water-ring-center' },
              React.createElement('span', { className: 'water-ring-value' }, 
                (day.waterMl || 0) >= 1000 
                  ? ((day.waterMl || 0) / 1000).toFixed(1).replace('.0', '') 
                  : (day.waterMl || 0)
              ),
              React.createElement('span', { className: 'water-ring-unit' }, 
                (day.waterMl || 0) >= 1000 ? 'л' : 'мл'
              )
            )
          ),
          // Анимация добавления (над кольцом)
          waterAddedAnim && React.createElement('span', { 
            className: 'water-card-anim water-card-anim-above',
            key: 'water-anim-' + Date.now()
          }, waterAddedAnim),
          // Краткий breakdown под кольцом
          React.createElement('div', { className: 'water-goal-breakdown' },
            React.createElement('span', { className: 'water-breakdown-item' }, 
              '⚖️ ' + waterGoalBreakdown.base + 'мл'
            ),
            waterGoalBreakdown.stepsBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' }, 
              '👟 +' + waterGoalBreakdown.stepsBonus
            ),
            waterGoalBreakdown.trainBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' }, 
              '🏃 +' + waterGoalBreakdown.trainBonus
            ),
            waterGoalBreakdown.seasonBonus > 0 && React.createElement('span', { className: 'water-breakdown-item water-breakdown-bonus' }, 
              '☀️ +' + waterGoalBreakdown.seasonBonus
            )
          ),
          // Напоминание "Давно не пил" (если >2ч)
          waterLastDrink && waterLastDrink.isLong && (day.waterMl || 0) < waterGoal && React.createElement('div', { 
            className: 'water-reminder'
          }, '⏰ ' + waterLastDrink.text)
        ),
        
        // Тултип с полной формулой (при долгом нажатии)
        showWaterTooltip && React.createElement('div', { 
          className: 'water-formula-tooltip',
          onClick: () => setShowWaterTooltip(false)
        },
          React.createElement('div', { className: 'water-formula-title' }, '📊 Расчёт нормы воды'),
          React.createElement('div', { className: 'water-formula-row' }, 
            'Базовая: ' + waterGoalBreakdown.weight + ' кг × ' + waterGoalBreakdown.coef + ' мл = ' + waterGoalBreakdown.baseRaw + ' мл'
          ),
          waterGoalBreakdown.ageNote && React.createElement('div', { className: 'water-formula-row water-formula-sub' }, 
            'Возраст: ' + waterGoalBreakdown.ageNote
          ),
          waterGoalBreakdown.stepsBonus > 0 && React.createElement('div', { className: 'water-formula-row' }, 
            'Шаги: ' + (day.steps || 0).toLocaleString() + ' (' + waterGoalBreakdown.stepsCount + '×5000) → +' + waterGoalBreakdown.stepsBonus + ' мл'
          ),
          waterGoalBreakdown.trainBonus > 0 && React.createElement('div', { className: 'water-formula-row' }, 
            'Тренировки: ' + waterGoalBreakdown.trainCount + ' шт → +' + waterGoalBreakdown.trainBonus + ' мл'
          ),
          waterGoalBreakdown.seasonBonus > 0 && React.createElement('div', { className: 'water-formula-row' }, 
            'Сезон: ☀️ Лето → +' + waterGoalBreakdown.seasonBonus + ' мл'
          ),
          React.createElement('div', { className: 'water-formula-total' }, 
            'Итого: ' + (waterGoal / 1000).toFixed(1) + ' л'
          ),
          React.createElement('div', { className: 'water-formula-hint' }, 'Нажми, чтобы закрыть')
        ),
        
        // Правая часть: пресеты + прогресс
        React.createElement('div', { className: 'water-card-right' },
          // Верхняя строка: мотивация + кнопка удаления
          React.createElement('div', { className: 'water-top-row' },
            React.createElement('div', { className: 'water-motivation-inline' },
              React.createElement('span', { className: 'water-motivation-emoji' }, waterMotivation.emoji),
              React.createElement('span', { className: 'water-motivation-text' }, waterMotivation.text)
            ),
            // Кнопка уменьшения (справа)
            (day.waterMl || 0) > 0 && React.createElement('button', {
              className: 'water-minus-compact',
              onClick: () => removeWater(100)
            }, '−100')
          ),
          
          // Прогресс-бар
          React.createElement('div', { className: 'water-progress-inline' },
            React.createElement('div', { 
              className: 'water-progress-fill',
              style: { width: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
            })
          ),
          
          // Пресеты в ряд
          React.createElement('div', { className: 'water-presets-row' },
            waterPresets.map(preset => 
              React.createElement('button', {
                key: preset.ml,
                className: 'water-preset-compact',
                onClick: () => addWater(preset.ml)
              },
                React.createElement('span', { className: 'water-preset-icon' }, preset.icon),
                React.createElement('span', { className: 'water-preset-ml' }, '+' + preset.ml)
              )
            )
          )
        )
      )
    );

    const compactActivity = React.createElement('div', { className: 'compact-activity compact-card' },
      React.createElement('div', { className: 'compact-card-header' }, '📏 АКТИВНОСТЬ'),
      
      // Слайдер шагов
      React.createElement('div', { className: 'steps-slider-container' },
        React.createElement('div', { className: 'steps-slider-header' },
          React.createElement('span', { className: 'steps-label' }, '👟 Шаги'),
          React.createElement('span', { className: 'steps-value' }, 
            React.createElement('b', null, stepsValue.toLocaleString()),
            ' / ',
            React.createElement('b', { className: 'steps-goal' }, stepsGoal.toLocaleString()),
            React.createElement('span', { className: 'steps-kcal-hint' }, ' / ' + stepsK + ' ккал')
          )
        ),
        React.createElement('div', { 
          className: 'steps-slider',
          onMouseDown: handleStepsDrag,
          onTouchStart: handleStepsDrag
        },
          React.createElement('div', { className: 'steps-slider-track' }),
          React.createElement('div', { className: 'steps-slider-goal-mark', style: { left: '80%' } },
            React.createElement('span', { className: 'steps-goal-label' }, String(stepsGoal))
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
      
      // Ряд: Формула расчёта + Бытовая активность
      React.createElement('div', { className: 'activity-cards-row' },
        // Плашка с формулой расчёта
        React.createElement('div', { className: 'formula-card' },
          React.createElement('div', { className: 'formula-card-header' },
            React.createElement('span', { className: 'formula-card-icon' }, '📊'),
            React.createElement('span', { className: 'formula-card-title' }, 'Расчёт калорий')
          ),
          React.createElement('div', { className: 'formula-card-rows' },
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, 'BMR'),
              React.createElement('span', { className: 'formula-value' }, bmr)
            ),
            React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Шаги'),
              React.createElement('span', { className: 'formula-value' }, stepsK)
            ),
            householdK > 0 && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Быт'),
              React.createElement('span', { className: 'formula-value' }, householdK)
            ),
            (train1k + train2k > 0) && React.createElement('div', { className: 'formula-row' },
              React.createElement('span', { className: 'formula-label' }, '+ Тренировки'),
              React.createElement('span', { className: 'formula-value' }, r0(train1k + train2k))
            ),
            React.createElement('div', { className: 'formula-row formula-subtotal' },
              React.createElement('span', { className: 'formula-label' }, '= Затраты'),
              React.createElement('span', { className: 'formula-value' }, tdee)
            ),
            dayTargetDef !== 0 && React.createElement('div', { className: 'formula-row' + (dayTargetDef < 0 ? ' deficit' : ' surplus') },
              React.createElement('span', { className: 'formula-label' }, dayTargetDef < 0 ? 'Дефицит' : 'Профицит'),
              React.createElement('span', { className: 'formula-value' }, (dayTargetDef > 0 ? '+' : '') + dayTargetDef + '%')
            ),
            React.createElement('div', { className: 'formula-row formula-total' },
              React.createElement('span', { className: 'formula-label' }, 'Цель'),
              React.createElement('span', { className: 'formula-value' }, optimum)
            )
          )
        ),
        // Правая колонка: бытовая активность + кнопка добавить тренировку
        React.createElement('div', { className: 'activity-right-col' },
          // Бытовая активность - кликабельная карточка
          React.createElement('div', { 
            className: 'household-activity-card',
            onClick: openHouseholdPicker
          },
            React.createElement('div', { className: 'household-activity-header' },
              React.createElement('span', { className: 'household-activity-icon' }, '🏠'),
              React.createElement('span', { className: 'household-activity-title' }, 'Бытовая активность')
            ),
            React.createElement('div', { className: 'household-activity-value' },
              React.createElement('span', { className: 'household-value-number' }, day.householdMin || 0),
              React.createElement('span', { className: 'household-value-unit' }, 'мин')
            ),
            householdK > 0 && React.createElement('div', { className: 'household-value-kcal' }, '→ ' + householdK + ' ккал'),
            React.createElement('div', { className: 'household-activity-hint' }, 
              'Время на ногах помимо тренировок'
            )
          ),
          // Кнопка добавления тренировки
          visibleTrainings < 3 && React.createElement('button', {
            className: 'add-training-btn',
            onClick: () => {
              const newIndex = visibleTrainings;
              setVisibleTrainings(visibleTrainings + 1);
              // Сразу открываем picker для новой тренировки
              setTimeout(() => openTrainingPicker(newIndex), 50);
            }
          }, '+ Тренировка')
        )
      ),
      
      // Тренировки — компактные
      trainingsBlock
    );
    
    // === SKELETON LOADER ===
    const skeletonLoader = React.createElement('div', { className: 'skeleton-page' },
      // Skeleton для СТАТИСТИКА
      React.createElement('div', { className: 'skeleton-card skeleton-stats' },
        React.createElement('div', { className: 'skeleton-header' }),
        React.createElement('div', { className: 'skeleton-metrics' },
          React.createElement('div', { className: 'skeleton-metric' }),
          React.createElement('div', { className: 'skeleton-metric' }),
          React.createElement('div', { className: 'skeleton-metric' }),
          React.createElement('div', { className: 'skeleton-metric' })
        ),
        React.createElement('div', { className: 'skeleton-sparkline' }),
        React.createElement('div', { className: 'skeleton-progress' }),
        React.createElement('div', { className: 'skeleton-macros' },
          React.createElement('div', { className: 'skeleton-ring' }),
          React.createElement('div', { className: 'skeleton-ring' }),
          React.createElement('div', { className: 'skeleton-ring' })
        )
      ),
      // Skeleton для АКТИВНОСТЬ
      React.createElement('div', { className: 'skeleton-card skeleton-activity' },
        React.createElement('div', { className: 'skeleton-header' }),
        React.createElement('div', { className: 'skeleton-slider' }),
        React.createElement('div', { className: 'skeleton-row' },
          React.createElement('div', { className: 'skeleton-block' }),
          React.createElement('div', { className: 'skeleton-block' })
        )
      ),
      // Skeleton для приёмов пищи
      React.createElement('div', { className: 'skeleton-card skeleton-meal' },
        React.createElement('div', { className: 'skeleton-meal-header' }),
        React.createElement('div', { className: 'skeleton-search' }),
        React.createElement('div', { className: 'skeleton-item' }),
        React.createElement('div', { className: 'skeleton-item' })
      )
    );
    
    // Показываем skeleton пока данные не загружены
    if (!isHydrated) {
      return React.createElement('div', { className: 'page page-day' }, skeletonLoader);
    }
  
    return React.createElement('div',{
      className: 'page page-day'
    },
      // === МОБИЛЬНЫЕ ПОД-ВКЛАДКИ УБРАНЫ ===
      // Теперь переключение stats/diary через нижнее меню (5 вкладок в App)
      
      // Pull-to-refresh индикатор (Enhanced)
      (pullProgress > 0 || isRefreshing) && React.createElement('div', {
        className: 'pull-indicator' 
          + (isRefreshing ? ' refreshing' : '') 
          + (refreshStatus === 'ready' ? ' ready' : '')
          + (refreshStatus === 'success' ? ' success' : ''),
        style: { 
          height: isRefreshing ? 56 : Math.max(pullProgress, 0),
          opacity: isRefreshing ? 1 : Math.min(pullProgress / 35, 1)
        }
      },
        React.createElement('div', { className: 'pull-spinner' },
          // Иконка в зависимости от состояния
          refreshStatus === 'success'
            ? React.createElement('span', { className: 'pull-spinner-icon success' }, '✓')
            : refreshStatus === 'error'
              ? React.createElement('span', { className: 'pull-spinner-icon' }, '✗')
              : refreshStatus === 'syncing'
                ? React.createElement('span', { className: 'pull-spinner-icon spinning' }, '↻')
                : React.createElement('span', { 
                    className: 'pull-spinner-icon' + (refreshStatus === 'ready' ? ' ready' : ''),
                    style: { 
                      transform: `rotate(${Math.min(pullProgress / PULL_THRESHOLD, 1) * 180}deg)`,
                      transition: 'transform 0.1s ease-out'
                    }
                  }, refreshStatus === 'ready' ? '↓' : '↻')
        ),
        React.createElement('span', { 
          className: 'pull-text' 
            + (refreshStatus === 'ready' ? ' ready' : '') 
            + (refreshStatus === 'syncing' ? ' syncing' : '')
        }, 
          refreshStatus === 'success' ? 'Готово!' 
            : refreshStatus === 'error' ? 'Ошибка синхронизации'
            : refreshStatus === 'syncing' ? 'Синхронизация...' 
            : refreshStatus === 'ready' ? 'Отпустите для обновления' 
            : 'Потяните для обновления'
        )
      ),
      
      // === ПОД-ВКЛАДКА 1: Статистика дня (или всё на десктопе) ===
      (!isMobile || mobileSubTab === 'stats') && statsBlock,
      (!isMobile || mobileSubTab === 'stats') && waterCard,
      (!isMobile || mobileSubTab === 'stats') && compactActivity,
      (!isMobile || mobileSubTab === 'stats') && sideBlock,
      
      // === FAB для быстрого добавления воды (+200мл) ===
      (!isMobile || mobileSubTab === 'stats') && React.createElement('button', {
        className: 'water-fab',
        onClick: () => addWater(200),
        'aria-label': 'Добавить стакан воды'
      }, 
        React.createElement('span', { className: 'water-fab-icon' }, '💧'),
        React.createElement('span', { className: 'water-fab-label' }, '+200')
      ),
      
      // === ПОД-ВКЛАДКА 2: Дневник питания (или всё на десктопе) ===
      (!isMobile || mobileSubTab === 'diary') && daySummary,
      
      // === Мини-график распределения калорий по приёмам ===
      (!isMobile || mobileSubTab === 'diary') && mealsChartData && mealsChartData.meals.length > 0 && React.createElement('div', { 
        className: 'meals-chart-container',
        style: { 
          margin: '12px 0', 
          padding: '12px 16px', 
          background: 'var(--surface, #fff)', 
          borderRadius: '12px',
          border: '1px solid var(--border, #e5e7eb)'
        }
      },
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '12px'
          }
        },
          React.createElement('span', { 
            style: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary, #6b7280)' }
          }, '📊 Распределение калорий'),
          React.createElement('span', { 
            style: { 
              fontSize: '12px', 
              color: mealsChartData.totalKcal > mealsChartData.targetKcal ? '#dc2626' : '#059669'
            }
          }, mealsChartData.totalKcal + ' / ' + Math.round(mealsChartData.targetKcal) + ' ккал')
        ),
        // Горизонтальные полоски для каждого приёма
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
          mealsChartData.meals.map((meal, i) => {
            const widthPct = mealsChartData.targetKcal > 0 
              ? Math.min(100, (meal.kcal / mealsChartData.targetKcal) * 100)
              : 0;
            const isOverTarget = mealsChartData.totalKcal > mealsChartData.targetKcal;
            return React.createElement('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              React.createElement('span', { 
                style: { width: '24px', fontSize: '14px', textAlign: 'center' }
              }, meal.icon),
              React.createElement('div', { 
                style: { 
                  flex: 1, 
                  height: '20px', 
                  background: 'var(--bg-secondary, #f3f4f6)', 
                  borderRadius: '4px',
                  overflow: 'hidden',
                  position: 'relative'
                }
              },
                React.createElement('div', { 
                  style: { 
                    width: widthPct + '%', 
                    height: '100%', 
                    background: isOverTarget ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #34d399 0%, #10b981 100%)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }
                }),
                meal.kcal > 0 && React.createElement('span', {
                  style: {
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '11px',
                    fontWeight: '500',
                    color: widthPct > 60 ? '#fff' : 'var(--text-primary, #1f2937)'
                  }
                }, meal.kcal + ' ккал')
              ),
              meal.time && React.createElement('span', { 
                style: { width: '40px', fontSize: '11px', color: 'var(--text-secondary, #9ca3af)', textAlign: 'right' }
              }, meal.time)
            );
          })
        )
      ),
      
      // Empty state когда нет приёмов пищи
      (!isMobile || mobileSubTab === 'diary') && (!day.meals || day.meals.length === 0) && React.createElement('div', { className: 'empty-state' },
        React.createElement('div', { className: 'empty-state-icon' }, '🍽️'),
        React.createElement('div', { className: 'empty-state-title' }, 'Пока нет приёмов пищи'),
        React.createElement('div', { className: 'empty-state-text' }, 'Добавьте первый приём, чтобы начать отслеживание'),
        React.createElement('button', { 
          className: 'btn btn-primary empty-state-btn',
          onClick: addMeal
        }, '+ Добавить приём')
      ),
      (!isMobile || mobileSubTab === 'diary') && mealsUI,
      React.createElement('div',{className:'row desktop-only',style:{justifyContent:'flex-start',marginTop:'8px'}}, React.createElement('button',{className:'btn',onClick:addMeal},'+ Приём')),
      
      // FAB - Floating Action Button (только mobile + только на вкладке diary)
      isMobile && mobileSubTab === 'diary' && React.createElement('button', {
        className: 'fab-add-meal',
        onClick: addMeal,
        title: 'Добавить приём пищи'
      }, '+'),
      
      // Toast подсказка (Advice Module или fallback на macroTip)
      (advicePrimary || macroTip) && toastVisible && React.createElement('div', {
        className: 'macro-toast macro-toast-' + (advicePrimary?.type || macroTip?.type) + 
                   (adviceExpanded ? ' expanded' : '') + (toastVisible ? ' visible' : ''),
        role: 'alert',
        'aria-live': 'polite',
        onClick: () => adviceCount > 1 ? setAdviceExpanded(!adviceExpanded) : dismissToast(),
        onTouchStart: handleToastTouchStart,
        onTouchMove: handleToastTouchMove,
        onTouchEnd: handleToastTouchEnd,
        style: { 
          transform: `translateX(calc(-50% + ${toastSwipeX}px))`, 
          opacity: 1 - Math.abs(toastSwipeX) / 150 
        }
      },
        // Основной контент
        React.createElement('div', { className: 'macro-toast-main' },
          React.createElement('span', { className: 'macro-toast-icon' }, advicePrimary?.icon || macroTip?.icon),
          React.createElement('span', { className: 'macro-toast-text' }, advicePrimary?.text || macroTip?.text),
          adviceCount > 1 && React.createElement('span', { className: 'macro-toast-badge' }, `+${adviceCount - 1}`),
          React.createElement('button', { 
            className: 'macro-toast-close', 
            onClick: (e) => { e.stopPropagation(); dismissToast(); } 
          }, '×')
        ),
        // Progress bar
        React.createElement('div', { className: 'macro-toast-progress' }),
        // Дополнительные советы (при раскрытии)
        adviceExpanded && adviceRelevant && React.createElement('div', { className: 'macro-toast-extras' },
          adviceRelevant.slice(1, 4).map(advice => 
            React.createElement('div', { 
              key: advice.id,
              className: `macro-toast-extra macro-toast-extra-${advice.type}`
            },
              React.createElement('span', null, advice.icon),
              React.createElement('span', null, advice.text)
            )
          )
        )
      ),
      
      // Meal Creation/Edit Modal (mobile only)
      showTimePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTimePicker },
          React.createElement('div', { 
            ref: bottomSheetRef,
            className: 'time-picker-modal', 
            onClick: e => e.stopPropagation()
          },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelTimePicker)
            }),
            
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
              ),
              // Подсказка для ночных часов (00:00-02:59)
              isNightHourSelected && React.createElement('div', { className: 'night-time-hint' },
                React.createElement('span', { className: 'night-time-icon' }, '🌙'),
                React.createElement('span', { className: 'night-time-text' }, 
                  'Ночной приём — запишется в ',
                  React.createElement('b', null, currentDateLabel)
                )
              ),
              // Предпросмотр типа приёма
              (() => {
                const timeStr = `${String(pendingMealTime.hours).padStart(2, '0')}:${String(pendingMealTime.minutes).padStart(2, '0')}`;
                const previewType = pendingMealType || HEYS.dayUtils.getMealTypeForPreview(timeStr, day.meals || []);
                const typeInfo = HEYS.dayUtils.MEAL_TYPES[previewType];
                return React.createElement('div', { className: 'meal-type-preview' },
                  React.createElement('span', { className: 'meal-type-preview-label' }, 'Тип приёма:'),
                  React.createElement('div', { className: 'meal-type-preview-value meal-type-' + previewType },
                    React.createElement('span', { className: 'meal-type-preview-icon' }, typeInfo.icon),
                    React.createElement('span', { className: 'meal-type-preview-name' }, typeInfo.name),
                    React.createElement('select', {
                      className: 'meal-type-preview-select',
                      value: previewType,
                      onChange: (e) => setPendingMealType(e.target.value)
                    },
                      Object.entries(HEYS.dayUtils.MEAL_TYPES).map(([key, val]) =>
                        React.createElement('option', { key, value: key }, val.icon + ' ' + val.name)
                      )
                    ),
                    React.createElement('span', { className: 'meal-type-hint' }, 'изменить')
                  )
                );
              })()
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
      
      // Weight Picker Modal (2 steps)
      showWeightPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelWeightPicker },
          React.createElement('div', { className: 'time-picker-modal weight-picker-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelWeightPicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: prevWeightPickerStep }, 
                weightPickerStep === 1 ? 'Отмена' : '← Назад'
              ),
              React.createElement('span', { className: 'time-picker-title' }, 
                weightPickerStep === 1 ? '⚖️ Вес на утро' : '👟 Цель шагов'
              ),
              React.createElement('button', { className: 'time-picker-confirm', onClick: nextWeightPickerStep }, 
                weightPickerStep === 1 ? 'Далее →' : 'Готово'
              )
            ),
            // Step indicator
            React.createElement('div', { className: 'picker-steps-indicator' },
              React.createElement('div', { className: 'picker-step-dot' + (weightPickerStep >= 1 ? ' active' : '') }),
              React.createElement('div', { className: 'picker-step-dot' + (weightPickerStep >= 2 ? ' active' : '') })
            ),
            // Step 1: Вес
            weightPickerStep === 1 && React.createElement('div', { className: 'weight-picker-section' },
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
            ),
            // Step 2: Цель шагов (колесо с шагом 1000)
            weightPickerStep === 2 && React.createElement('div', { className: 'weight-picker-section steps-goal-section' },
              React.createElement('div', { className: 'time-picker-wheels steps-goal-wheels' },
                React.createElement(WheelColumn, {
                  values: stepsGoalValues,
                  selected: pendingStepsGoalIdx,
                  onChange: (i) => setPendingStepsGoalIdx(i)
                }),
                React.createElement('span', { className: 'steps-goal-wheel-unit' }, 'шагов')
              )
            )
          )
        ),
        document.body
      ),
      
      // Deficit Picker Modal
      showDeficitPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelDeficitPicker },
          React.createElement('div', { className: 'time-picker-modal deficit-picker-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelDeficitPicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelDeficitPicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, '📊 Цель дефицита'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmDeficitPicker }, 'Готово')
            ),
            React.createElement('div', { className: 'deficit-picker-hint' }, 
              'Отрицательный = дефицит (похудение)',
              React.createElement('br'),
              'Положительный = профицит (набор)'
            ),
            React.createElement('div', { className: 'time-picker-wheels deficit-wheels' },
              React.createElement(WheelColumn, {
                values: deficitValues,
                selected: pendingDeficitIdx,
                onChange: (i) => setPendingDeficitIdx(i)
              })
            )
          )
        ),
        document.body
      ),
      
      // Household (Бытовая активность) Picker Modal
      showHouseholdPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelHouseholdPicker },
          React.createElement('div', { className: 'time-picker-modal household-picker-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelHouseholdPicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelHouseholdPicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, '🏠 Бытовая активность'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmHouseholdPicker }, 'Готово')
            ),
            React.createElement('div', { className: 'household-picker-hint' }, 
              'Добавьте примерное время бытовой активности,',
              React.createElement('br'),
              'если были на ногах помимо тренировок'
            ),
            React.createElement('div', { className: 'time-picker-wheels household-wheels' },
              React.createElement(WheelColumn, {
                values: householdValues,
                selected: pendingHouseholdIdx,
                onChange: (i) => setPendingHouseholdIdx(i)
              }),
              React.createElement('span', { className: 'household-wheel-unit' }, 'мин')
            )
          )
        ),
        document.body
      ),
      
      // Grams Picker Modal (mobile only)
      showGramsPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelGramsPicker },
          React.createElement('div', { className: 'time-picker-modal grams-picker-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelGramsPicker)
            }),
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
      ),
      
      // Zone Minutes Picker Modal (for training zones)
      showZonePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelZonePicker },
          React.createElement('div', { className: 'time-picker-modal zone-picker-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelZonePicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelZonePicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, 
                'Зона ' + (zonePickerTarget ? zonePickerTarget.zoneIndex + 1 : '')
              ),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmZonePicker }, 'Готово')
            ),
            // Подсказка с калориями
            React.createElement('div', { className: 'zone-picker-kcal-hint' },
              '🔥 ',
              r0(zoneMinutesValues[pendingZoneMinutes] * (kcalMin[zonePickerTarget?.zoneIndex] || 0)),
              ' ккал'
            ),
            React.createElement('div', { className: 'time-picker-wheels zone-wheels' },
              React.createElement(WheelColumn, {
                values: zoneMinutesValues.map(v => v + ' мин'),
                selected: pendingZoneMinutes,
                onChange: (i) => setPendingZoneMinutes(i)
              })
            )
          )
        ),
        document.body
      ),
      
      // Training Picker Modal
      showTrainingPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelTrainingPicker },
          React.createElement('div', { 
            className: 'time-picker-modal training-picker-modal', 
            onClick: e => e.stopPropagation()
          },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelTrainingPicker)
            }),
            
            // Заголовок
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelTrainingPicker }, 
                trainingPickerStep === 2 ? '← Назад' : 'Отмена'
              ),
              React.createElement('span', { className: 'time-picker-title' }, 
                trainingPickerStep === 1 ? '🏋️ Тренировка' : '⏱️ Зоны'
              ),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmTrainingPicker }, 
                trainingPickerStep === 1 ? 'Далее →' : 'Готово'
              )
            ),
            
            // ШАГ 1: Тип тренировки + Время + Пресеты
            trainingPickerStep === 1 && React.createElement(React.Fragment, null,
              // Секция: Тип тренировки
              React.createElement('div', { className: 'training-type-section' },
                React.createElement('div', { className: 'training-type-label' }, 'Тип тренировки'),
                React.createElement('div', { className: 'training-type-buttons' },
                  trainingTypes.map(t => 
                    React.createElement('button', {
                      key: t.id,
                      className: 'training-type-btn' + (pendingTrainingType === t.id ? ' active' : ''),
                      onClick: () => { haptic('light'); setPendingTrainingType(t.id); }
                    },
                      React.createElement('span', { className: 'training-type-icon' }, t.icon),
                      React.createElement('span', { className: 'training-type-text' }, t.label)
                    )
                  )
                )
              ),
              
              // Секция: Быстрые пресеты
              React.createElement('div', { className: 'training-presets-section' },
                React.createElement('div', { className: 'training-presets-label' }, 'Быстрый выбор'),
                React.createElement('div', { className: 'training-presets-grid' },
                  trainingPresets.map(p => 
                    React.createElement('button', {
                      key: p.id,
                      className: 'training-preset-btn',
                      onClick: () => {
                        haptic('medium');
                        setPendingTrainingType(p.type);
                        setPendingTrainingZones(p.zones);
                        setTrainingPickerStep(2); // Сразу на второй шаг
                      }
                    }, p.label)
                  )
                )
              ),
              
              // Секция: Время начала
              React.createElement('div', { className: 'training-time-section' },
                React.createElement('div', { className: 'training-time-label' }, 'Время начала'),
                React.createElement('div', { className: 'time-picker-wheels' },
                  // Часы
                  React.createElement(WheelColumn, {
                    values: hoursValues,
                    selected: pendingTrainingTime.hours,
                    onChange: (i) => setPendingTrainingTime(prev => ({...prev, hours: i})),
                    label: 'Часы'
                  }),
                  React.createElement('div', { className: 'time-picker-separator' }, ':'),
                  // Минуты
                  React.createElement(WheelColumn, {
                    values: minutesValues,
                    selected: pendingTrainingTime.minutes,
                    onChange: (i) => setPendingTrainingTime(prev => ({...prev, minutes: i})),
                    label: 'Минуты'
                  })
                )
              )
            ),
            
            // ШАГ 2: Зоны
            trainingPickerStep === 2 && React.createElement(React.Fragment, null,
              React.createElement('div', { className: 'training-zones-section' },
                React.createElement('div', { className: 'training-zones-label' }, 'Минуты в каждой зоне'),
                React.createElement('div', { className: 'training-zones-wheels' },
                  [0, 1, 2, 3].map(zi => 
                    React.createElement('div', { key: 'zone' + zi, className: 'training-zone-column' },
                      React.createElement('div', { className: 'training-zone-header zone-color-' + (zi + 1) }, 'Z' + (zi + 1)),
                      React.createElement(WheelColumn, {
                        values: zoneMinutesValues.map(v => String(v)),
                        selected: pendingTrainingZones[zi],
                        onChange: (i) => {
                          haptic('light');
                          setPendingTrainingZones(prev => {
                            const next = [...prev];
                            next[zi] = i;
                            return next;
                          });
                        }
                      })
                    )
                  )
                ),
                // Подсказка с временем и калориями
                React.createElement('div', { className: 'training-zones-stats' },
                  React.createElement('span', { className: 'training-zones-time' },
                    '⏱️ ',
                    pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0),
                    ' мин'
                  ),
                  React.createElement('span', { className: 'training-zones-kcal' },
                    '🔥 ',
                    r0(pendingTrainingZones.reduce((sum, idx, zi) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0) * (kcalMin[zi] || 0), 0)),
                    ' ккал'
                  )
                )
              )
            )
          )
        ),
        document.body
      ),
      
      // Sleep Quality Picker Modal
      showSleepQualityPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelSleepQualityPicker },
          React.createElement('div', { className: 'time-picker-modal quality-picker-modal', onClick: e => e.stopPropagation() },
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelSleepQualityPicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelSleepQualityPicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, '😴 Качество сна'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmSleepQualityPicker }, 'Готово')
            ),
            React.createElement('div', { className: 'time-picker-wheels quality-wheels' },
              React.createElement(WheelColumn, {
                values: sleepQualityValues.map(v => v === '—' ? '—' : '★ ' + v),
                selected: pendingSleepQuality,
                onChange: (i) => setPendingSleepQuality(i)
              })
            )
          )
        ),
        document.body
      ),
      
      // Day Score Picker Modal
      showDayScorePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelDayScorePicker },
          React.createElement('div', { className: 'time-picker-modal score-picker-modal', onClick: e => e.stopPropagation() },
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelDayScorePicker)
            }),
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelDayScorePicker }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title' }, '📊 Оценка дня'),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmDayScorePicker }, 'Готово')
            ),
            React.createElement('div', { className: 'time-picker-wheels score-wheels' },
              React.createElement(WheelColumn, {
                values: dayScoreValues.map(v => v === '—' ? '—' : v + ' / 10'),
                selected: pendingDayScore,
                onChange: (i) => setPendingDayScore(i)
              })
            )
          )
        ),
        document.body
      )
    );
  };

})(window);
