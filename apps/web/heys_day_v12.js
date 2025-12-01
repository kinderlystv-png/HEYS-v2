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
  // ВАЖНО: lsGet/lsSet должны вызывать HEYS.utils.lsGet/lsSet динамически, 
  // т.к. при загрузке файла U.__clientScoped может быть ещё не инициализирован
  // ИСПРАВЛЕНО: используем HEYS.utils напрямую, а не локальный U (который = dayUtils)
  const lsGet = (k,d) => { 
    const utils = HEYS.utils || {};
    if (utils.lsGet) { 
      return utils.lsGet(k, d); 
    } else { 
      warnMissing('lsGet'); 
      try { const v=JSON.parse(localStorage.getItem(k)); return v==null?d:v; } catch(e) { return d; } 
    } 
  };
  const lsSet = (k,v) => { 
    const utils = HEYS.utils || {};
    if (utils.lsSet) { 
      utils.lsSet(k, v); 
    } else { 
      warnMissing('lsSet'); 
      try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} 
    } 
  };
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
  const useSmartPrefetch = H.useSmartPrefetch;
  
  // Calendar загружается динамически в DayTab (строка ~1337), 
  // НЕ кэшируем здесь чтобы HMR работал

  // === Import models module ===
  const M = HEYS.models || {};

  HEYS.DayTab=function DayTab(props){
  
  const {useState,useMemo,useEffect,useRef}=React;
  
  // Дата приходит из шапки App (DatePicker в header)
  const { selectedDate, setSelectedDate } = props;
  
  // Products приходят из App → DayTabWithCloudSync → DayTab
  // Используем props.products напрямую (уже синхронизированы wrapper'ом)
  const products = props.products || [];
  
  // Twemoji: reparse emoji after render
  useEffect(() => {
    if (window.scheduleTwemojiParse) window.scheduleTwemojiParse();
  });
  
  // Трекинг просмотра дня (только один раз)
  useEffect(() => {
    if (window.HEYS && window.HEYS.analytics) {
      window.HEYS.analytics.trackDataOperation('day-viewed');
    }
  }, []);
  
  const prodSig = useMemo(()=>productsSignature(products), [products]);
  const pIndex = useMemo(()=>buildProductIndex(products),[prodSig]);

  // Debug info (minimal)
  window.HEYS.debug = window.HEYS.debug || {};
  window.HEYS.debug.dayProducts = products;
  window.HEYS.debug.dayProductIndex = pIndex;
  const prof=getProfile();
  // date приходит из props (selectedDate из App header)
  const date = selectedDate || todayISO();
  const setDate = setSelectedDate;
  // State for collapsed/expanded meals (mobile) - с кэшированием в sessionStorage
  const expandedMealsKey = 'heys_expandedMeals_' + date;
  // Отдельный state для ручного разворачивания устаревших приёмов (не кешируется)
  const [manualExpandedStale, setManualExpandedStale] = useState({});
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
  
  // Проверка: устарел ли приём (прошло больше 1 часа с времени приёма)
  const isMealStale = (meal) => {
    if (!meal || !meal.time) return false;
    const [hours, minutes] = meal.time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return false;
    const now = new Date();
    const mealDate = new Date();
    mealDate.setHours(hours, minutes, 0, 0);
    const diffMinutes = (now - mealDate) / (1000 * 60);
    return diffMinutes > 60;
  };
  
  const toggleMealExpand = (mealIndex, meals) => {
    const meal = meals && meals[mealIndex];
    const isStale = meal && isMealStale(meal);
    
    if (isStale) {
      // Для устаревших — отдельный state (не кешируется)
      setManualExpandedStale(prev => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
    } else {
      // Для актуальных — обычный state (кешируется)
      setExpandedMeals(prev => ({ ...prev, [mealIndex]: !prev[mealIndex] }));
    }
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

  // Проверка: развёрнут ли приём
  // - Устаревшие приёмы (>1 часа) автоматически свёрнуты
  // - Пользователь может вручную развернуть их кликом (не кешируется)
  // - Первый в отсортированном списке (последний по времени) развёрнут по умолчанию
  const isMealExpanded = (mealIndex, totalMeals, meals, displayIndex = null) => {
    const meal = meals && meals[mealIndex];
    const isStale = meal && isMealStale(meal);
    
    // Устаревшие приёмы (>1 часа) свёрнуты по умолчанию
    // Можно развернуть вручную (состояние не кешируется)
    if (isStale) {
      return manualExpandedStale[mealIndex] === true;
    }
    
    // Для актуальных приёмов — стандартная логика
    if (expandedMeals.hasOwnProperty(mealIndex)) {
      return expandedMeals[mealIndex];
    }
    
    // Первый в отсортированном списке (последний по времени) развёрнут по умолчанию
    // Если displayIndex передан — используем его, иначе fallback на старую логику
    if (displayIndex !== null) {
      return displayIndex === 0;
    }
    return mealIndex === totalMeals - 1;
  };
  
  // Флаг: данные загружены (из localStorage или Supabase)
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Ref для отслеживания предыдущей даты (нужен для flush перед сменой)
  const prevDateRef = React.useRef(date);
  
  const [dayRaw,setDayRaw]=useState(()=>{ 
    const key = 'heys_dayv2_'+date;
    const v=lsGet(key,null); 
    
    // Функция очистки пустых тренировок
    const cleanEmptyTrainings = (trainings) => {
      if (!Array.isArray(trainings)) return [];
      return trainings.filter(t => t && t.z && t.z.some(z => z > 0));
    };
    
    if (v && v.date) {
      // Очищаем пустые тренировки при загрузке
      return ensureDay({
        ...v,
        trainings: cleanEmptyTrainings(v.trainings)
      }, prof);
    } else {
      // Для нового дня — пустой массив тренировок
      return ensureDay({
        date: date,
        meals: [],
        trainings: [],
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
  
  const setDay = setDayRaw;
  const day = dayRaw;

  // Функция очистки пустых тренировок (используется при загрузке дня)
  const cleanEmptyTrainings = (trainings) => {
    if (!Array.isArray(trainings)) return [];
    return trainings.filter(t => {
      if (!t) return false;
      // Тренировка непустая если есть хотя бы одна зона > 0
      const hasZones = t.z && t.z.some(z => z > 0);
      return hasZones;
    });
  };

    // ЗАЩИТА: не сохранять до завершения гидратации (чтобы не затереть данные из Supabase)
    const { flush } = useDayAutosave({ day, date, lsSet, lsGetFn: lsGet, disabled: !isHydrated });
    
    // Smart Prefetch: предзагрузка ±7 дней при наличии интернета
    useSmartPrefetch && useSmartPrefetch({ currentDate: date, daysRange: 7, enabled: isHydrated });

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
      
      // 🔴 КРИТИЧНО: Сохранить текущие данные ПЕРЕД сменой даты!
      // Иначе несохранённые изменения потеряются при переходе на другую дату
      const dateActuallyChanged = prevDateRef.current !== date;
      if (dateActuallyChanged && HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
        console.info(`[HEYS] 📅 Смена даты: ${prevDateRef.current} → ${date}, сохраняем предыдущий день...`);
        // Flush данные предыдущего дня синхронно
        HEYS.Day.requestFlush();
      }
      prevDateRef.current = date;
      
      setIsHydrated(false); // Сброс: данные ещё не загружены для новой даты
      const clientId = window.HEYS && window.HEYS.currentClientId;
      const cloud = window.HEYS && window.HEYS.cloud;
      const doLocal = () => {
        if (cancelled) return;
        const profNow = getProfile();
        const key = 'heys_dayv2_' + date;
        const v = lsGet(key, null);
        console.log('[HEYS] 📅 doLocal() loading day | key:', key, '| found:', !!v, '| meals in storage:', v?.meals?.length);
        if (v && v.date) {
          // Очищаем пустые тренировки при загрузке
          const cleanedDay = {
            ...v,
            trainings: cleanEmptyTrainings(v.trainings)
          };
          setDay(ensureDay(cleanedDay, profNow));
          console.log('[HEYS] 📅 doLocal() loaded existing day | meals:', cleanedDay.meals?.length);
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
          console.log('[HEYS] 📅 doLocal() created NEW day | date:', date);
        }
        
        // ВАЖНО: данные загружены, теперь можно сохранять
        // Продукты приходят через props.products, не нужно обновлять локально
        setIsHydrated(true);
      };
      if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
        if (typeof cloud.shouldSyncClient === 'function' ? cloud.shouldSyncClient(clientId, 4000) : true){
          cloud.bootstrapClientSync(clientId)
            .then(() => {
              // Даем время на то, чтобы событие heysProductsUpdated отправилось
              setTimeout(doLocal, 150);
            })
            .catch((err) => {
              // Нет сети или ошибка — загружаем из локального кэша
              console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
              doLocal();
            });
        } else {
          doLocal();
        }
      } else {
        doLocal();
      }
      return () => { cancelled = true; };
    }, [date]);

    // Слушаем событие обновления данных дня (от Morning Check-in)
    React.useEffect(() => {
      const handleDayUpdated = (e) => {
        const updatedDate = e.detail?.date;
        if (updatedDate === date) {
          const profNow = getProfile();
          const key = 'heys_dayv2_' + date;
          const v = lsGet(key, null);
          if (v && v.date) {
            setDay(ensureDay({ ...v, trainings: cleanEmptyTrainings(v.trainings) }, profNow));
          }
        }
      };
      window.addEventListener('heys:day-updated', handleDayUpdated);
      return () => window.removeEventListener('heys:day-updated', handleDayUpdated);
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

    // Компонент для добавления продукта в конкретный приём
    // v2: Использует StepModal для fullscreen UX
    function MealAddProduct({mi}){
      const handleOpenModal = React.useCallback(() => {
        // Haptic feedback
        try { navigator.vibrate?.(10); } catch(e) {}
        
        if (window.HEYS?.AddProductStep?.show) {
          window.HEYS.AddProductStep.show({
            mealIndex: mi,
            products: products,
            dateKey: date,
            onAdd: ({ product, grams, mealIndex }) => {
              // Добавляем продукт в приём
              const newItem = {
                id: uid('it_'),
                product_id: product.id ?? product.product_id,
                name: product.name,
                grams: grams || 100
              };
              const meals = day.meals.map((m, i) => 
                i === mealIndex 
                  ? { ...m, items: [...(m.items || []), newItem] } 
                  : m
              );
              setDay({ ...day, meals });
              
              // Haptic feedback
              try { navigator.vibrate?.(10); } catch(e) {}
              
              // 🎮 XP: Dispatch для gamification + advice
              window.dispatchEvent(new CustomEvent('heysProductAdded', { 
                detail: { product, grams } 
              }));
              
              // Сохраняем последние граммы для этого продукта
              try {
                const productId = product.id ?? product.product_id ?? product.name;
                U.lsSet(`heys_last_grams_${productId}`, grams);
                // История для умных пресетов
                const history = U.lsGet('heys_grams_history', {});
                if (!history[productId]) history[productId] = [];
                history[productId].push(grams);
                if (history[productId].length > 20) history[productId].shift();
                U.lsSet('heys_grams_history', history);
              } catch(e) {}
            },
            onNewProduct: () => {
              // Открываем форму создания нового продукта если есть
              if (window.HEYS?.products?.showAddModal) {
                window.HEYS.products.showAddModal();
              }
            }
          });
        } else {
          console.error('[HEYS] AddProductStep not loaded');
        }
      }, [mi, products, date, day.meals, setDay]);
      
      return React.createElement('button', {
        className: 'aps-open-btn',
        onClick: handleOpenModal,
        'aria-label': 'Добавить продукт'
      },
        React.createElement('span', { className: 'aps-open-icon' }, '🔍'),
        React.createElement('span', { className: 'aps-open-text' }, 'Добавить')
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
      
      // Автоматический расчёт dayScore на основе трёх оценок
      // Формула: (mood + wellbeing + (10 - stress)) / 3, округлено до целого
      let dayScore = '';
      if (moodAvg !== '' || wellbeingAvg !== '' || stressAvg !== '') {
        const m = moodAvg !== '' ? +moodAvg : 5;
        const w = wellbeingAvg !== '' ? +wellbeingAvg : 5;
        const s = stressAvg !== '' ? +stressAvg : 5;
        // stress инвертируем: низкий стресс = хорошо
        dayScore = Math.round((m + w + (10 - s)) / 3);
      }
      
      return { moodAvg, wellbeingAvg, stressAvg, dayScore };
    }

    // Автоматическое обновление средних оценок и dayScore при изменении приёмов пищи
    useEffect(() => {
      const averages = calculateMealAverages(day.meals);
      // Не перезаписываем dayScore если есть ручной override (dayScoreManual)
      const shouldUpdateDayScore = !day.dayScoreManual && averages.dayScore !== day.dayScore;
      
      if (averages.moodAvg !== day.moodAvg || averages.wellbeingAvg !== day.wellbeingAvg || 
          averages.stressAvg !== day.stressAvg || shouldUpdateDayScore) {
        setDay(prevDay => ({
          ...prevDay,
          moodAvg: averages.moodAvg,
          wellbeingAvg: averages.wellbeingAvg,
          stressAvg: averages.stressAvg,
          // Обновляем dayScore только если нет ручного override
          ...(shouldUpdateDayScore ? { dayScore: averages.dayScore } : {})
        }));
      }
    }, [day.meals?.map(m => `${m.mood}-${m.wellbeing}-${m.stress}`).join('|'), day.dayScoreManual]);

    // === iOS-style Time Picker Modal (mobile only) ===
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [pendingMealTime, setPendingMealTime] = useState({hours: 12, minutes: 0});
    const [editingMealIndex, setEditingMealIndex] = useState(null); // null = новый, число = редактирование
    const [editMode, setEditMode] = useState('new'); // 'new' | 'time' | 'mood'
    
    // === Training Picker Modal ===
    const [showTrainingPicker, setShowTrainingPicker] = useState(false);
    const [trainingPickerStep, setTrainingPickerStep] = useState(1); // 1 = тип+время, 2 = зоны, 3 = оценки
    const [editingTrainingIndex, setEditingTrainingIndex] = useState(null);
    const [pendingTrainingTime, setPendingTrainingTime] = useState({hours: 10, minutes: 0});
    const [pendingTrainingType, setPendingTrainingType] = useState('cardio');
    const [pendingTrainingZones, setPendingTrainingZones] = useState([0, 0, 0, 0]); // индексы для zoneMinutesValues
    const [pendingTrainingQuality, setPendingTrainingQuality] = useState(0); // 0-10
    const [pendingTrainingFeelAfter, setPendingTrainingFeelAfter] = useState(0); // 0-10
    const [pendingTrainingComment, setPendingTrainingComment] = useState('');
    
    // === Тренировки: количество видимых блоков ===
    const [visibleTrainings, setVisibleTrainings] = useState(() => {
      // Автоопределяем сколько тренировок показывать на основе данных
      const tr = day.trainings || [];
      const hasData = (t) => t && t.z && t.z.some(v => +v > 0);
      if (tr[2] && hasData(tr[2])) return 3;
      if (tr[1] && hasData(tr[1])) return 2;
      if (tr[0] && hasData(tr[0])) return 1;
      return 0; // Если нет тренировок — не показываем пустые блоки
    });
    
    // === Период графиков (7, 14, 30 дней) ===
    const [chartPeriod, setChartPeriod] = useState(7);
    const [chartTransitioning, setChartTransitioning] = useState(false);
    
    // Плавная смена периода с transition
    const handlePeriodChange = (period) => {
      if (chartPeriod !== period) {
        setChartTransitioning(true);
        haptic('light');
        setTimeout(() => {
          setChartPeriod(period);
          setChartTransitioning(false);
        }, 150);
      }
    };
    
    // === Popup для точки на графике ===
    const [sparklinePopup, setSparklinePopup] = useState(null); // { type: 'kcal'|'weight', point, x, y }
    
    // === Popup для бейджей БЖУ ===
    const [macroBadgePopup, setMacroBadgePopup] = useState(null); // { macro, emoji, desc, x, y }
    
    // === Popup для метрик (вода, шаги, калории) ===
    const [metricPopup, setMetricPopup] = useState(null); // { type: 'water'|'steps'|'kcal', x, y, data }
    
    // === Slider для интерактивного просмотра графика ===
    const [sliderPoint, setSliderPoint] = useState(null);
    const sliderPrevPointRef = React.useRef(null);
    
    // === Zoom & Pan для графика ===
    const [sparklineZoom, setSparklineZoom] = useState(1); // 1 = 100%, 2 = 200%
    const [sparklinePan, setSparklinePan] = useState(0); // смещение по X в %
    const sparklineZoomRef = React.useRef({ initialDistance: 0, initialZoom: 1 });
    
    // === Brush selection — выбор диапазона ===
    const [brushRange, setBrushRange] = useState(null); // { start: idx, end: idx }
    const [brushing, setBrushing] = useState(false);
    const brushStartRef = React.useRef(null);
    
    // Закрытие popup при клике вне
    React.useEffect(() => {
      if (!sparklinePopup && !macroBadgePopup && !metricPopup) return;
      const handleClickOutside = (e) => {
        if (sparklinePopup && !e.target.closest('.sparkline-popup')) {
          setSparklinePopup(null);
        }
        if (macroBadgePopup && !e.target.closest('.macro-badge-popup')) {
          setMacroBadgePopup(null);
        }
        if (metricPopup && !e.target.closest('.metric-popup')) {
          setMetricPopup(null);
        }
      };
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }, [sparklinePopup, macroBadgePopup, metricPopup]);
    
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
    const [dismissedAdvices, setDismissedAdvices] = useState(new Set());
    const [hiddenUntilTomorrow, setHiddenUntilTomorrow] = useState(() => {
      try {
        const saved = localStorage.getItem('heys_advice_hidden_today');
        if (saved) {
          const { date, ids } = JSON.parse(saved);
          if (date === new Date().toISOString().slice(0, 10)) {
            return new Set(ids);
          }
        }
      } catch(e) {}
      return new Set();
    });
    const [adviceSwipeState, setAdviceSwipeState] = useState({}); // { adviceId: { x, direction } }
    const [expandedAdviceId, setExpandedAdviceId] = useState(null);
    const [dismissAllAnimation, setDismissAllAnimation] = useState(false);
    const adviceSwipeStart = React.useRef({});
    
    // Группировка и сортировка советов
    const ADVICE_PRIORITY = { warning: 0, insight: 1, tip: 2, achievement: 3, info: 4 };
    const ADVICE_CATEGORY_NAMES = {
      nutrition: '🍎 Питание',
      training: '💪 Тренировки', 
      lifestyle: '🌙 Режим',
      hydration: '💧 Вода',
      emotional: '🧠 Психология',
      achievement: '🏆 Достижения',
      motivation: '✨ Мотивация',
      personalized: '👤 Персональное',
      correlation: '🔗 Корреляции',
      timing: '⏰ Тайминг',
      sleep: '😴 Сон',
      activity: '🚶 Активность'
    };
    
    const getSortedGroupedAdvices = React.useCallback((advices) => {
      if (!advices?.length) return { sorted: [], groups: {} };
      
      // Фильтруем скрытые до завтра
      const filtered = advices.filter(a => !hiddenUntilTomorrow.has(a.id));
      
      // Сортируем по приоритету (warning сверху, achievement снизу)
      const sorted = [...filtered].sort((a, b) => 
        (ADVICE_PRIORITY[a.type] ?? 99) - (ADVICE_PRIORITY[b.type] ?? 99)
      );
      
      // Группируем по категории
      const groups = {};
      sorted.forEach(advice => {
        const cat = advice.category || 'other';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(advice);
      });
      
      return { sorted, groups };
    }, [hiddenUntilTomorrow]);
    
    // Handlers для swipe советов (влево = прочитано, вправо = скрыть до завтра)
    const handleAdviceSwipeStart = (adviceId, e) => {
      adviceSwipeStart.current[adviceId] = e.touches[0].clientX;
    };
    const handleAdviceSwipeMove = (adviceId, e) => {
      const startX = adviceSwipeStart.current[adviceId];
      if (startX === undefined) return;
      const diff = e.touches[0].clientX - startX;
      const direction = diff < 0 ? 'left' : 'right';
      setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: diff, direction } }));
    };
    const handleAdviceSwipeEnd = (adviceId) => {
      const state = adviceSwipeState[adviceId];
      const swipeX = state?.x || 0;
      
      if (swipeX < -100) {
        // Свайп влево = прочитано (dismiss)
        setDismissedAdvices(prev => new Set([...prev, adviceId]));
        haptic('light');
      } else if (swipeX > 100) {
        // Свайп вправо = скрыть до завтра
        setHiddenUntilTomorrow(prev => {
          const newSet = new Set([...prev, adviceId]);
          try {
            localStorage.setItem('heys_advice_hidden_today', JSON.stringify({
              date: new Date().toISOString().slice(0, 10),
              ids: [...newSet]
            }));
          } catch(e) {}
          return newSet;
        });
        setDismissedAdvices(prev => new Set([...prev, adviceId]));
        haptic('medium');
      }
      
      setAdviceSwipeState(prev => ({ ...prev, [adviceId]: { x: 0, direction: null } }));
      delete adviceSwipeStart.current[adviceId];
    };
    
    // Долгий тап для раскрытия деталей
    const adviceLongPressTimer = React.useRef(null);
    const handleAdviceLongPressStart = (adviceId) => {
      adviceLongPressTimer.current = setTimeout(() => {
        setExpandedAdviceId(prev => prev === adviceId ? null : adviceId);
        haptic('light');
      }, 500);
    };
    const handleAdviceLongPressEnd = () => {
      if (adviceLongPressTimer.current) {
        clearTimeout(adviceLongPressTimer.current);
        adviceLongPressTimer.current = null;
      }
    };
    
    // "Прочитать все" с эффектом домино
    const handleDismissAll = () => {
      setDismissAllAnimation(true);
      haptic('medium');
      
      // Домино-эффект с задержкой
      const advices = adviceRelevant?.filter(a => !dismissedAdvices.has(a.id)) || [];
      advices.forEach((advice, index) => {
        setTimeout(() => {
          setDismissedAdvices(prev => new Set([...prev, advice.id]));
          if (index < 3) haptic('light'); // Haptic только для первых 3
        }, index * 80);
      });
      
      // Закрыть модалку после анимации
      setTimeout(() => {
        setDismissAllAnimation(false);
        dismissToast();
      }, advices.length * 80 + 300);
    };
    
    // Сброс dismissed при закрытии списка
    React.useEffect(() => {
      if (adviceTrigger !== 'manual') {
        setDismissedAdvices(new Set());
        setAdviceSwipeState({});
        setExpandedAdviceId(null);
        setDismissAllAnimation(false);
      }
    }, [adviceTrigger]);
    
    // Записываем дату последнего визита (для returning emotional state)
    // Задержка 3 сек, чтобы advice успел прочитать старое значение
    React.useEffect(() => {
      const timer = setTimeout(() => {
        try {
          localStorage.setItem('heys_last_visit', new Date().toISOString().slice(0, 10));
        } catch(e) {}
      }, 3000);
      return () => clearTimeout(timer);
    }, []);
    
    // === Pull-to-refresh (Enhanced) ===
    const [pullProgress, setPullProgress] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshStatus, setRefreshStatus] = useState('idle'); // idle | pulling | ready | syncing | success | error
    const pullStartY = React.useRef(0);
    const isPulling = React.useRef(false);
    const lastHapticRef = React.useRef(0);
    
    // === Offline indicator ===
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [pendingChanges, setPendingChanges] = useState(false);
    const [syncMessage, setSyncMessage] = useState(''); // '' | 'offline' | 'pending' | 'syncing' | 'synced'
    const [pendingQueue, setPendingQueue] = useState([]); // Очередь изменений для Optimistic UI
    
    // Слушаем online/offline события
    React.useEffect(() => {
      const handleOnline = async () => {
        setIsOnline(true);
        // Автоматическая синхронизация при восстановлении сети
        if (pendingChanges) {
          setSyncMessage('syncing');
          const cloud = window.HEYS && window.HEYS.cloud;
          const clientId = localStorage.getItem('heys_client_current');
          try {
            if (clientId && cloud && typeof cloud.bootstrapClientSync === 'function') {
              await cloud.bootstrapClientSync(clientId);
            }
            setSyncMessage('synced');
            setPendingChanges(false);
            // Скрываем через 2 сек
            setTimeout(() => setSyncMessage(''), 2000);
          } catch (e) {
            setSyncMessage('pending');
          }
        }
      };
      
      const handleOffline = () => {
        setIsOnline(false);
        setSyncMessage('offline');
      };
      
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      
      // Начальная проверка
      if (!navigator.onLine) {
        setSyncMessage('offline');
      }
      
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, [pendingChanges]);
    
    // Отслеживаем изменения данных (для pendingChanges)
    React.useEffect(() => {
      const handleDataChange = (e) => {
        if (!navigator.onLine) {
          setPendingChanges(true);
          setSyncMessage('pending');
          
          // Добавляем в очередь (если есть детали)
          if (e.detail && e.detail.type) {
            setPendingQueue(prev => {
              const newItem = {
                id: Date.now(),
                type: e.detail.type,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              };
              // Максимум 5 последних изменений
              return [...prev, newItem].slice(-5);
            });
          }
        }
      };
      
      // Слушаем события сохранения
      window.addEventListener('heys:data-saved', handleDataChange);
      return () => window.removeEventListener('heys:data-saved', handleDataChange);
    }, []);
    
    // Очистка очереди при успешной синхронизации
    React.useEffect(() => {
      if (syncMessage === 'synced') {
        setPendingQueue([]);
      }
    }, [syncMessage]);

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
      try {
        localStorage.setItem('heys_theme', theme);
      } catch (e) {
        // QuotaExceeded — игнорируем, тема применится через data-theme
      }
      
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
    
    // === Emoji анимация в рейтинг модалке ===
    const [emojiAnimating, setEmojiAnimating] = useState({ mood: '', wellbeing: '', stress: '' });
    
    // === Анимации карточек при превышении/успехе ===
    const [shakeEaten, setShakeEaten] = useState(false);   // карточка "Съедено" — shake при превышении
    const [shakeOver, setShakeOver] = useState(false);     // карточка "Перебор" — shake при превышении
    const [pulseSuccess, setPulseSuccess] = useState(false); // карточка "Съедено" — pulse при успехе
    
    // === Progress animation ===
    const [animatedProgress, setAnimatedProgress] = useState(0);
    
    // === Edit Grams Modal (slider-based, like MealAddProduct) ===
    const [editGramsTarget, setEditGramsTarget] = useState(null); // {mealIndex, itemId, product}
    const [editGramsValue, setEditGramsValue] = useState(100);
    const editGramsInputRef = React.useRef(null);
    
    // 🍽️ Авто-порции для редактирования граммов
    const editPortions = useMemo(() => {
      if (!editGramsTarget?.product) return [];
      const product = editGramsTarget.product;
      if (product.portions?.length) return product.portions;
      // Используем функцию из моделей
      const M = window.HEYS?.models;
      if (M?.getAutoPortions) {
        return M.getAutoPortions(product.name);
      }
      return [];
    }, [editGramsTarget?.product]);
    
    // Последняя выбранная порция для edit modal
    const editLastPortionGrams = useMemo(() => {
      if (!editGramsTarget?.product?.id) return null;
      const M = window.HEYS?.models;
      return M?.getLastPortion ? M.getLastPortion(editGramsTarget.product.id) : null;
    }, [editGramsTarget?.product?.id]);
    
    // === Zone Minutes Picker Modal ===
    const [showZonePicker, setShowZonePicker] = useState(false);
    const [zonePickerTarget, setZonePickerTarget] = useState(null); // {trainingIndex, zoneIndex}
    const [pendingZoneMinutes, setPendingZoneMinutes] = useState(0);
    // Значения минут: 0-120
    const zoneMinutesValues = useMemo(() => Array.from({length: 121}, (_, i) => String(i)), []);
    
    // === Sleep Quality Picker Modal ===
    const [showSleepQualityPicker, setShowSleepQualityPicker] = useState(false);
    const [pendingSleepQuality, setPendingSleepQuality] = useState(0);
    const [pendingSleepNote, setPendingSleepNote] = useState(''); // временный комментарий
    const sleepQualityValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);
    
    // === Day Score Picker Modal ===
    const [showDayScorePicker, setShowDayScorePicker] = useState(false);
    const [pendingDayScore, setPendingDayScore] = useState(0);
    const [pendingDayComment, setPendingDayComment] = useState(''); // временный комментарий
    const dayScoreValues = useMemo(() => ['—', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], []);
    
    // === Weight Picker Modal (теперь использует StepModal) ===
    const [showWeightPicker, setShowWeightPicker] = useState(false); // для совместимости с uiState
    
    // Пульсация блока корреляции при изменении веса
    const [correlationPulse, setCorrelationPulse] = useState(false);
    const prevWeightRef = useRef(day.weightMorning);
    
    useEffect(() => {
      // Пульсация при изменении веса
      if (prevWeightRef.current !== day.weightMorning && day.weightMorning) {
        setCorrelationPulse(true);
        const timer = setTimeout(() => setCorrelationPulse(false), 600);
        prevWeightRef.current = day.weightMorning;
        return () => clearTimeout(timer);
      }
      prevWeightRef.current = day.weightMorning;
    }, [day.weightMorning]);
    
    // Цель шагов: state для реактивного обновления слайдера
    const [savedStepsGoal, setSavedStepsGoal] = useState(() => prof.stepsGoal || 7000);
    
    // Слушаем завершение синхронизации cloud и изменения профиля для обновления stepsGoal
    useEffect(() => {
      const handleProfileUpdate = (e) => {
        // Используем значение из события напрямую (если есть), иначе из storage
        const stepsFromEvent = e?.detail?.stepsGoal;
        if (stepsFromEvent != null) {
          setSavedStepsGoal(stepsFromEvent);
          return;
        }
        // Fallback для cloud sync (heysSyncCompleted)
        const profileFromStorage = getProfile();
        if (profileFromStorage.stepsGoal) {
          setSavedStepsGoal(profileFromStorage.stepsGoal);
        }
      };
      
      // Слушаем кастомный event от cloud синхронизации
      window.addEventListener('heysSyncCompleted', handleProfileUpdate);
      // Слушаем изменения профиля из StepModal
      window.addEventListener('heys:profile-updated', handleProfileUpdate);
      
      return () => {
        window.removeEventListener('heysSyncCompleted', handleProfileUpdate);
        window.removeEventListener('heys:profile-updated', handleProfileUpdate);
      };
    }, []); // Пустой массив — слушатели регистрируются один раз
    
    // === Открытие StepModal для веса и шагов ===
    function openWeightPicker() {
      if (HEYS.showCheckin && HEYS.showCheckin.weight) {
        HEYS.showCheckin.weight();
      }
    }
    
    function openStepsGoalPicker() {
      if (HEYS.showCheckin && HEYS.showCheckin.steps) {
        HEYS.showCheckin.steps();
      }
    }

    // === Deficit Picker (теперь использует StepModal) ===
    const [showDeficitPicker, setShowDeficitPicker] = useState(false); // для совместимости с uiState
    
    // Дефицит из профиля или дефолт 0
    const profileDeficit = prof.deficitPctTarget || 0;
    const currentDeficit = day.deficitPct != null ? day.deficitPct : profileDeficit;
    
    function openDeficitPicker() {
      // Используем StepModal вместо старого пикера
      if (HEYS.showCheckin && HEYS.showCheckin.deficit) {
        HEYS.showCheckin.deficit(date);
      }
    }

    // === Water Tracking ===
    const [waterAddedAnim, setWaterAddedAnim] = useState(null); // для анимации "+200"
    const [showWaterDrop, setShowWaterDrop] = useState(false); // анимация падающей капли
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
    function addWater(ml, skipScroll = false) {
      // Сначала прокручиваем к карточке воды (если вызвано из FAB)
      const waterCardEl = document.getElementById('water-card');
      if (!skipScroll && waterCardEl) {
        waterCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Задержка для завершения скролла перед анимацией
        setTimeout(() => runWaterAnimation(ml), 400);
        return;
      }
      runWaterAnimation(ml);
    }
    
    // Внутренняя функция анимации воды
    function runWaterAnimation(ml) {
      const newWater = (day.waterMl || 0) + ml;
      setDay({ ...day, waterMl: newWater, lastWaterTime: Date.now() });
      
      // 💧 Анимация падающей капли (длиннее для плавности)
      setShowWaterDrop(true);
      setTimeout(() => setShowWaterDrop(false), 1200);
      
      // Анимация feedback
      setWaterAddedAnim('+' + ml);
      haptic('light');
      
      // 🎮 XP: Dispatch для gamification
      window.dispatchEvent(new CustomEvent('heysWaterAdded', { detail: { ml, total: newWater } }));
      
      // 🎉 Celebration при достижении цели (переиспользуем confetti от калорий)
      const prevWater = day.waterMl || 0;
      if (newWater >= waterGoal && prevWater < waterGoal && !showConfetti) {
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

    // === Edit Grams Modal functions (slider-based) ===
    function openEditGramsModal(mealIndex, itemId, currentGrams, product) {
      setEditGramsTarget({ mealIndex, itemId, product });
      setEditGramsValue(currentGrams || 100);
      // Автофокус на input через задержку
      setTimeout(() => {
        if (editGramsInputRef.current) {
          editGramsInputRef.current.focus();
          editGramsInputRef.current.select();
        }
      }, 100);
    }
    
    function confirmEditGramsModal() {
      if (editGramsTarget && editGramsValue > 0) {
        setGrams(editGramsTarget.mealIndex, editGramsTarget.itemId, editGramsValue);
      }
      setEditGramsTarget(null);
      setEditGramsValue(100);
    }
    
    function cancelEditGramsModal() {
      setEditGramsTarget(null);
      setEditGramsValue(100);
    }
    
    // Drag handler для слайдера граммов (edit mode)
    function handleEditGramsDrag(e) {
      e.preventDefault();
      const slider = e.currentTarget;
      const rect = slider.getBoundingClientRect();
      const minGrams = 10;
      const maxGrams = 500;
      
      const updateFromPosition = (clientX) => {
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = x / rect.width;
        const grams = Math.round((minGrams + percent * (maxGrams - minGrams)) / 10) * 10;
        setEditGramsValue(Math.max(minGrams, Math.min(maxGrams, grams)));
        try { navigator.vibrate?.(3); } catch(e) {}
      };
      
      updateFromPosition(e.touches ? e.touches[0].clientX : e.clientX);
      
      const handleMove = (moveEvent) => {
        moveEvent.preventDefault();
        updateFromPosition(moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX);
      };
      
      const handleEnd = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
      };
      
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
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
      const T = TR[trainingIndex] || { z: [0,0,0,0], time: '', type: '', quality: 0, feelAfter: 0, comment: '' };
      
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
      
      // Загружаем оценки
      setPendingTrainingQuality(T.quality || 0);
      setPendingTrainingFeelAfter(T.feelAfter || 0);
      setPendingTrainingComment(T.comment || '');
      
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
      
      // Если на втором шаге — переходим на третий (оценки)
      if (trainingPickerStep === 2) {
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
        setTrainingPickerStep(3);
        return;
      }
      
      // На третьем шаге — сохраняем всё
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
        newTrainings.push({ z: [0, 0, 0, 0], time: '', type: '', quality: 0, feelAfter: 0, comment: '' });
      }
      
      // Теперь безопасно обновляем
      newTrainings[idx] = {
        ...newTrainings[idx],
        z: zoneMinutes,
        time: timeStr,
        type: pendingTrainingType,
        quality: pendingTrainingQuality,
        feelAfter: pendingTrainingFeelAfter,
        comment: pendingTrainingComment
      };
      
      setDay({ ...day, trainings: newTrainings });
      setShowTrainingPicker(false);
      setTrainingPickerStep(1);
      setEditingTrainingIndex(null);
    }

    function cancelTrainingPicker() {
      // Если на втором или третьем шаге — возвращаемся на предыдущий
      if (trainingPickerStep === 3) {
        setTrainingPickerStep(2);
        return;
      }
      if (trainingPickerStep === 2) {
        setTrainingPickerStep(1);
        return;
      }
      
      // На первом шаге — закрываем и проверяем пустую тренировку
      const idx = editingTrainingIndex;
      const trainings = day.trainings || [];
      const training = trainings[idx];
      
      // Если тренировка пустая (не существует или все зоны = 0) — уменьшаем visibleTrainings
      const isEmpty = !training || (
        (!training.z || training.z.every(z => z === 0)) &&
        !training.time &&
        !training.type
      );
      
      if (isEmpty && idx !== null && idx === visibleTrainings - 1) {
        setVisibleTrainings(prev => Math.max(0, prev - 1));
      }
      
      setShowTrainingPicker(false);
      setTrainingPickerStep(1);
      setEditingTrainingIndex(null);
    }
    
    // Helper: получить градиент цвета по оценке 1-10
    function getScoreGradient(score) {
      if (!score || score === 0) return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'; // серый
      if (score <= 2) return 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)'; // красный
      if (score <= 4) return 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)'; // оранжевый
      if (score <= 5) return 'linear-gradient(135deg, #fef08a 0%, #fde047 100%)'; // жёлтый
      if (score <= 7) return 'linear-gradient(135deg, #d9f99d 0%, #bef264 100%)'; // лайм
      if (score <= 9) return 'linear-gradient(135deg, #bbf7d0 0%, #86efac 100%)'; // зелёный
      return 'linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%)'; // изумрудный (10)
    }
    
    function getScoreTextColor(score) {
      if (!score || score === 0) return '#9ca3af'; // серый
      if (score <= 2) return '#dc2626'; // красный
      if (score <= 4) return '#ea580c'; // оранжевый
      if (score <= 5) return '#ca8a04'; // жёлтый
      if (score <= 7) return '#65a30d'; // лайм
      if (score <= 9) return '#16a34a'; // зелёный
      return '#059669'; // изумрудный
    }
    
    // Helper: emoji по оценке 1-10
    function getScoreEmoji(score) {
      if (!score || score === 0) return '';
      if (score <= 2) return '😫';
      if (score <= 4) return '😕';
      if (score <= 5) return '😐';
      if (score <= 6) return '🙂';
      if (score <= 7) return '😊';
      if (score <= 8) return '😄';
      if (score <= 9) return '🤩';
      return '🌟'; // 10 = идеально
    }
    
    // Helper: получить данные вчера
    function getYesterdayData() {
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      return lsGet('heys_dayv2_' + yStr, null);
    }
    
    // Helper: сравнение с вчера (↑ / ↓ / =)
    function getCompareArrow(todayVal, yesterdayVal) {
      if (!todayVal || !yesterdayVal) return null;
      const diff = todayVal - yesterdayVal;
      if (diff > 0) return { icon: '↑', diff: '+' + diff, color: '#16a34a' };
      if (diff < 0) return { icon: '↓', diff: String(diff), color: '#dc2626' };
      return { icon: '=', diff: '0', color: '#6b7280' };
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
      const value = pendingSleepQuality === 0 ? 0 : parseInt(sleepQualityValues[pendingSleepQuality]);
      // Добавляем timestamp если есть новый комментарий
      let newSleepNote = day.sleepNote || '';
      if (pendingSleepNote.trim()) {
        const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const entry = `[${time}] ${pendingSleepNote.trim()}`;
        newSleepNote = newSleepNote ? newSleepNote + '\n' + entry : entry;
      }
      setDay({...day, sleepQuality: value, sleepNote: newSleepNote});
      setPendingSleepNote('');
      setShowSleepQualityPicker(false);
    }
    
    function cancelSleepQualityPicker() {
      setPendingSleepNote('');
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
      // Вычисляем авто-значение для сравнения
      const autoScore = calculateMealAverages(day.meals).dayScore;
      // Если значение отличается от авто — это ручной override
      const isManual = value !== 0 && value !== autoScore;
      // Добавляем timestamp если есть новый комментарий
      let newDayComment = day.dayComment || '';
      if (pendingDayComment.trim()) {
        const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const entry = `[${time}] ${pendingDayComment.trim()}`;
        newDayComment = newDayComment ? newDayComment + '\n' + entry : entry;
      }
      setDay({...day, dayScore: value, dayScoreManual: isManual, dayComment: newDayComment});
      setPendingDayComment('');
      setShowDayScorePicker(false);
    }
    
    function cancelDayScorePicker() {
      setPendingDayComment('');
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
      
      // Оценки: если есть предыдущие приёмы — берём от последнего, иначе 5
      const meals = day.meals || [];
      if (meals.length > 0) {
        // Берём последний приём по времени (они отсортированы)
        const lastMeal = meals[meals.length - 1];
        setPendingMealMood({
          mood: lastMeal.mood || 5,
          wellbeing: lastMeal.wellbeing || 5,
          stress: lastMeal.stress || 5
        });
      } else {
        // Первый приём в день — дефолт 5
        setPendingMealMood({ mood: 5, wellbeing: 5, stress: 5 });
      }
      
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
      console.log('[HEYS] 🍽 addMeal() called | date:', day.date, '| meals before:', day.meals.length, '| isHydrated:', isHydrated);
      if (isMobile) {
        openTimePickerForNewMeal();
      } else {
        // Десктоп — старое поведение
        const newMealId = uid('m_');
        const newMealIndex = day.meals.length;
        const newMeals = [...day.meals, {id:newMealId,name:'Приём',time:'',mood:'',wellbeing:'',stress:'',items:[]}];
        console.log('[HEYS] 🍽 addMeal() creating meal | id:', newMealId, '| new meals count:', newMeals.length);
        setDay({...day, meals: newMeals}); 
        expandOnlyMeal(newMealIndex);
        if (window.HEYS && window.HEYS.analytics) {
          window.HEYS.analytics.trackDataOperation('meal-created');
        }
      }
    }
    
    // Сортировка приёмов по времени (последние наверху для удобства)
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
        
        // Обратный порядок: последние наверху
        return timeB - timeA;
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
    // Track newly added items for fly-in animation
    const [newItemIds, setNewItemIds] = useState(new Set());
    
    function addProductToMeal(mi,p){ 
      haptic('light'); // Вибрация при добавлении
      const item={id:uid('it_'), product_id:p.id??p.product_id, name:p.name, grams:100}; 
      const meals=day.meals.map((m,i)=> i===mi? {...m, items:[...(m.items||[]), item]}:m); 
      setDay({...day, meals}); 
      
      // Track new item for animation
      setNewItemIds(prev => new Set([...prev, item.id]));
      // Remove from new items after animation completes
      setTimeout(() => {
        setNewItemIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 500);
      
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
                const product = pIndex?.byId?.get(item.product_id);
                if (product && grams > 0) {
                  totalKcal += ((+product.kcal100 || 0) * grams / 100);
                }
              });
            });
            
            // Хороший день: используем централизованный ratioZones
            const ratio = totalKcal / (optimum || 1);
            const rz = HEYS.ratioZones;
            if (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10)) {
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

    // Экспорт getStreak для использования в gamification модуле
    React.useEffect(() => {
      HEYS.Day = HEYS.Day || {};
      HEYS.Day.getStreak = () => currentStreak;
      
      // Dispatch событие чтобы GamificationBar мог обновить streak
      window.dispatchEvent(new CustomEvent('heysDayStreakUpdated', { 
        detail: { streak: currentStreak } 
      }));
      
      // Confetti при streak 7, 14, 30, 100
      if ([7, 14, 30, 100].includes(currentStreak) && HEYS.game && HEYS.game.celebrate) {
        HEYS.game.celebrate();
      }
      
      return () => {
        if (HEYS.Day && HEYS.Day.getStreak) {
          delete HEYS.Day.getStreak;
        }
      };
    }, [currentStreak]);

    // Экспорт addMeal для PWA shortcuts и внешних вызовов
    React.useEffect(() => {
      HEYS.Day = HEYS.Day || {};
      HEYS.Day.addMeal = addMeal;
      return () => {
        if (HEYS.Day && HEYS.Day.addMeal === addMeal) {
          delete HEYS.Day.addMeal;
        }
      };
    }, [addMeal]);

    // === Advice Module Integration ===
    // Собираем uiState для проверки занятости пользователя
    const uiState = React.useMemo(() => ({
      modalOpen: false, // TODO: отслеживать состояние модалок
      searchOpen: false, // В DayTab нет глобального поиска, он внутри MealAddProduct
      showTimePicker,
      showWeightPicker,
      showDeficitPicker,
      showZonePicker,
      showSleepQualityPicker,
      showDayScorePicker,
      showHouseholdPicker,
      showTrainingPicker
    }), [showTimePicker, showWeightPicker, showDeficitPicker, 
        showZonePicker, showSleepQualityPicker, showDayScorePicker, showHouseholdPicker, showTrainingPicker]);

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
        const T = TR[ti] || { z: [0, 0, 0, 0], time: '', type: '', quality: 0, feelAfter: 0, comment: '' };
        const kcalZ = i => r0((+T.z[i] || 0) * (kcalMin[i] || 0));
        const total = r0(kcalZ(0) + kcalZ(1) + kcalZ(2) + kcalZ(3));
        const trainingType = trainingTypes.find(t => t.id === T.type);
        
        // Эмодзи для оценок
        const getQualityEmoji = (v) => 
          v === 0 ? null : v <= 2 ? '😫' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🔥';
        const getFeelEmoji = (v) => 
          v === 0 ? null : v <= 2 ? '🥵' : v <= 4 ? '😓' : v <= 6 ? '😌' : v <= 8 ? '😊' : '✨';
        
        const qualityEmoji = getQualityEmoji(T.quality);
        const feelEmoji = getFeelEmoji(T.feelAfter);
        const hasRatings = T.quality > 0 || T.feelAfter > 0;
        
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
          // Оценки тренировки (если есть)
          hasRatings && React.createElement('div', { className: 'training-card-ratings' },
            qualityEmoji && React.createElement('div', { className: 'training-card-rating' },
              React.createElement('span', { className: 'training-card-rating-emoji' }, qualityEmoji),
              React.createElement('span', { className: 'training-card-rating-label' }, 'Качество'),
              React.createElement('span', { className: 'training-card-rating-value' }, T.quality + '/10')
            ),
            feelEmoji && React.createElement('div', { className: 'training-card-rating' },
              React.createElement('span', { className: 'training-card-rating-emoji' }, feelEmoji),
              React.createElement('span', { className: 'training-card-rating-label' }, 'После'),
              React.createElement('span', { className: 'training-card-rating-value' }, T.feelAfter + '/10')
            )
          ),
          // Комментарий (если есть)
          T.comment && React.createElement('div', { className: 'training-card-comment' },
            '💬 ', T.comment
          )
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
          (() => {
            const yData = getYesterdayData();
            const sleepCompare = getCompareArrow(day.sleepQuality, yData?.sleepQuality);
            const sleepEmoji = getScoreEmoji(day.sleepQuality);
            const isPulse = (day.sleepQuality || 0) >= 9;
            
            // Умная подсказка при низкой оценке сна
            const sleepTip = (day.sleepQuality > 0 && day.sleepQuality <= 4) 
              ? '💡 Попробуй: без экранов за час, прохладная комната'
              : null;
            
            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '🌙'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Сон')
              ),
              React.createElement('div', { className: 'sleep-card-times' },
                React.createElement('input', { className: 'sleep-time-input', type: 'time', value: day.sleepStart || '', onChange: e => setDay({...day, sleepStart: e.target.value}) }),
                React.createElement('span', { className: 'sleep-arrow' }, '→'),
                React.createElement('input', { className: 'sleep-time-input', type: 'time', value: day.sleepEnd || '', onChange: e => setDay({...day, sleepEnd: e.target.value}) })
              ),
              // Качество сна — большой блок как у оценки дня
              React.createElement('div', { 
                className: 'sleep-quality-display clickable' + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.sleepQuality) },
                onClick: openSleepQualityPicker
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  sleepEmoji && React.createElement('span', { className: 'score-emoji' }, sleepEmoji),
                  React.createElement('span', { 
                    className: 'sleep-quality-value-big',
                    style: { color: getScoreTextColor(day.sleepQuality) }
                  }, day.sleepQuality || '—'),
                  React.createElement('span', { className: 'sleep-quality-max' }, '/ 10')
                ),
                // Compare with yesterday
                sleepCompare && React.createElement('span', { 
                  className: 'score-compare',
                  style: { color: sleepCompare.color }
                }, sleepCompare.icon + ' vs вчера'),
                sleepH > 0 && React.createElement('span', { className: 'sleep-duration-hint' }, sleepH + ' ч сна')
              ),
              // Умная подсказка
              sleepTip && React.createElement('div', { className: 'smart-tip' }, sleepTip),
              React.createElement('textarea', { 
                className: 'sleep-note', 
                placeholder: 'Заметка...', 
                value: day.sleepNote || '', 
                rows: day.sleepNote && day.sleepNote.includes('\n') ? Math.min(day.sleepNote.split('\n').length, 4) : 1,
                onChange: e => setDay({...day, sleepNote: e.target.value}) 
              })
            );
          })(),
          
          // Плашка ОЦЕНКА ДНЯ
          (() => {
            const yData = getYesterdayData();
            const scoreCompare = getCompareArrow(day.dayScore, yData?.dayScore);
            const scoreEmoji = getScoreEmoji(day.dayScore);
            const isPulse = (day.dayScore || 0) >= 9;
            
            // Время последнего приёма
            const meals = day.meals || [];
            const lastMeal = meals.length > 0 ? meals[meals.length - 1] : null;
            const lastMealTime = lastMeal?.time || null;
            
            // Корреляция сон→самочувствие (без dayTot, который ещё не объявлен)
            const sleepH = day.sleepHours || 0;
            const sleepCorrelation = sleepH > 0 && sleepH < 6 
              ? '😴 Мало сна — будь внимателен к аппетиту'
              : sleepH >= 8
                ? '😴✓ Отличный сон!'
                : null;
            
            // Умная подсказка при низкой оценке дня
            const dayTip = (day.dayScore > 0 && day.dayScore <= 4)
              ? '💡 Маленькие шаги: прогулка 10 мин, стакан воды'
              : (day.stressAvg >= 4)
                ? '💡 Высокий стресс. Попробуй 5 мин дыхания'
                : null;
            
            return React.createElement('div', { className: 'sleep-card' },
              React.createElement('div', { className: 'sleep-card-header' },
                React.createElement('span', { className: 'sleep-card-icon' }, '📊'),
                React.createElement('span', { className: 'sleep-card-title' }, 'Оценка дня')
              ),
              // dayScore: авто из mood/wellbeing/stress, но можно поправить вручную
              React.createElement('div', { 
                className: 'day-score-display' + (day.dayScore ? ' clickable' : '') + (isPulse ? ' score-pulse' : ''),
                style: { background: getScoreGradient(day.dayScore) },
                onClick: () => {
                  const currentScore = day.dayScore || 0;
                  const idx = currentScore === 0 ? 0 : dayScoreValues.indexOf(String(currentScore));
                  setPendingDayScore(idx >= 0 ? idx : 0);
                  setShowDayScorePicker(true);
                }
              },
                // Emoji + Value
                React.createElement('div', { className: 'score-main-row' },
                  scoreEmoji && React.createElement('span', { className: 'score-emoji' }, scoreEmoji),
                  React.createElement('span', { 
                    className: 'day-score-value-big',
                    style: { color: getScoreTextColor(day.dayScore) }
                  }, day.dayScore || '—'),
                  React.createElement('span', { className: 'day-score-max' }, '/ 10')
                ),
                // Compare with yesterday
                scoreCompare && React.createElement('span', { 
                  className: 'score-compare',
                  style: { color: scoreCompare.color }
                }, scoreCompare.icon + ' vs вчера'),
                // Показываем "✨ авто" или "✏️ ручная" в зависимости от источника
                day.dayScoreManual 
                  ? React.createElement('span', { 
                      className: 'day-score-manual-hint',
                      onClick: (e) => {
                        e.stopPropagation();
                        // Сброс на авто
                        const averages = calculateMealAverages(day.meals);
                        setDay({...day, dayScore: averages.dayScore, dayScoreManual: false});
                      }
                    }, '✏️ сбросить')
                  : (day.moodAvg || day.wellbeingAvg || day.stressAvg) && 
                    React.createElement('span', { className: 'day-score-auto-hint' }, '✨ авто')
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
              // Время последнего приёма и корреляция
              (lastMealTime || sleepCorrelation) && React.createElement('div', { className: 'day-insights-row' },
                lastMealTime && React.createElement('span', { className: 'day-insight' }, '🍽️ ' + lastMealTime),
                sleepCorrelation && React.createElement('span', { className: 'day-insight correlation' }, sleepCorrelation)
              ),
              // Умная подсказка
              dayTip && React.createElement('div', { className: 'smart-tip' }, dayTip),
              React.createElement('textarea', { 
                className: 'sleep-note', 
                placeholder: 'Заметка...', 
                value: day.dayComment || '', 
                rows: day.dayComment && day.dayComment.includes('\n') ? Math.min(day.dayComment.split('\n').length, 4) : 1,
                onChange: e => setDay({...day, dayComment: e.target.value}) 
              })
            );
          })()
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

    // Сортируем приёмы для отображения (последние наверху)
    const sortedMealsForDisplay = React.useMemo(() => {
      const meals = day.meals || [];
      if (meals.length <= 1) return meals;
      
      return [...meals].sort((a, b) => {
        const timeA = U.timeToMinutes ? U.timeToMinutes(a.time) : null;
        const timeB = U.timeToMinutes ? U.timeToMinutes(b.time) : null;
        
        if (timeA === null && timeB === null) return 0;
        if (timeA === null) return 1;
        if (timeB === null) return -1;
        
        // Обратный порядок: последние (позже) наверху
        return timeB - timeA;
      });
    }, [day.meals]);

    const mealsUI = sortedMealsForDisplay.map((meal, displayIndex) => {
      // Находим реальный индекс в day.meals для правильного обновления
      const mi = (day.meals || []).findIndex(m => m.id === meal.id);
      const headerMeta = MEAL_HEADER_META;
      const header = headerMeta.map(h=>h.label.replace(/<br>/g,'/'));
  function pRow(it){
    const p=getProductFromItem(it,pIndex)||{name:it.name||'?'}, G=+it.grams||0, per=per100(p);
    // Debug убран для чистоты консоли
    const row={kcal:scale(per.kcal100,G),carbs:scale(per.carbs100,G),simple:scale(per.simple100,G),complex:scale(per.complex100,G),prot:scale(per.prot100,G),fat:scale(per.fat100,G),bad:scale(per.bad100,G),good:scale(per.good100,G),trans:scale(per.trans100,G),fiber:scale(per.fiber100,G)};
    const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
  const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
    const isNew = newItemIds.has(it.id);
    return React.createElement('tr',{key:it.id, 'data-new': isNew ? 'true' : 'false'},
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
      
      // Определяем, является ли этот приём "текущим" (голубой) или "прошедшим" (серый)
      // Текущий = первый в отсортированном списке (последний по времени) И прошло < 1 часа
      const isFirstInDisplay = displayIndex === 0;
      const isStale = isMealStale(meal);
      const isCurrentMeal = isFirstInDisplay && !isStale;
      
      const mealCardClass = isCurrentMeal ? 'card tone-blue meal-card' : 'card tone-slate meal-card';
      
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
        React.createElement('div',{className: mealCardClass, 'data-meal-index': mi, style:{marginTop:'4px', width: '100%'}},
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
            className: 'mpc-products-toggle' + (isMealExpanded(mi, (day.meals||[]).length, day.meals, displayIndex) ? ' expanded' : ''),
            onClick: () => toggleMealExpand(mi, day.meals)
          },
            React.createElement('span', { className: 'toggle-arrow' }, '›'),
            React.createElement('span', null, (meal.items || []).length + ' продукт' + ((meal.items || []).length === 1 ? '' : (meal.items || []).length < 5 ? 'а' : 'ов'))
          ),
          // Products list (shown when expanded)
          isMealExpanded(mi, (day.meals||[]).length, day.meals, displayIndex) && (meal.items || []).map(it => {
            const p = getProductFromItem(it, pIndex) || { name: it.name || '?' };
            const G = +it.grams || 0;
            const per = per100(p);
            const giVal = p.gi ?? p.gi100 ?? p.GI ?? p.giIndex;
            const harmVal = p.harm ?? p.harmScore ?? p.harm100 ?? p.harmPct;
            
            // Контент карточки
            // Определяем цвет граммов
            const gramsClass = G > 500 ? 'grams-danger' : G > 300 ? 'grams-warn' : '';
            
            // Фон карточки по вредности: плавный градиент от зелёного к красному
            const getHarmBg = (h) => {
              if (h == null) return '#fff';
              if (h <= -2) return '#d1fae5'; // суперполезный — насыщенный мятный
              if (h <= -1) return '#ecfdf5'; // очень полезный
              if (h <= 0) return '#f0fdf4';  // полезный — светло-зелёный
              if (h <= 1) return '#fafafa';  // почти нейтральный
              if (h <= 2) return '#fff';     // нормальный — белый
              if (h <= 3) return '#fffef5';  // чуть тёплый
              if (h <= 4) return '#fffbeb';  // кремовый
              if (h <= 5) return '#fef9e7';  // светло-жёлтый
              if (h <= 6) return '#fef3c7';  // жёлтый
              if (h <= 7) return '#fde68a';  // янтарный
              if (h <= 8) return '#fecaca';  // светло-розовый
              if (h <= 9) return '#fee2e2';  // розовый
              return '#fecdd3';              // красноватый
            };
            const harmBg = getHarmBg(harmVal);
            
            // Бейдж полезности/вредности
            const getHarmBadge = (h) => {
              if (h == null) return null;
              if (h <= -1) return { emoji: '🌿', text: 'полезный', color: '#059669' };
              if (h >= 8) return { emoji: '⚠️', text: 'вредный', color: '#dc2626' };
              return null;
            };
            const harmBadge = getHarmBadge(harmVal);
            
            // Иконка категории продукта
            const getCategoryIcon = (cat) => {
              if (!cat) return null;
              const c = cat.toLowerCase();
              if (c.includes('молоч') || c.includes('сыр') || c.includes('творог')) return '🥛';
              if (c.includes('мяс') || c.includes('птиц') || c.includes('курин') || c.includes('говя') || c.includes('свин')) return '🍖';
              if (c.includes('рыб') || c.includes('морепр')) return '🐟';
              if (c.includes('овощ') || c.includes('салат') || c.includes('зелен')) return '🥬';
              if (c.includes('фрукт') || c.includes('ягод')) return '🍎';
              if (c.includes('круп') || c.includes('каш') || c.includes('злак') || c.includes('хлеб') || c.includes('выпеч')) return '🌾';
              if (c.includes('яйц')) return '🥚';
              if (c.includes('орех') || c.includes('семеч')) return '🥜';
              if (c.includes('масл')) return '🫒';
              if (c.includes('напит') || c.includes('сок') || c.includes('кофе') || c.includes('чай')) return '🥤';
              if (c.includes('сладк') || c.includes('десерт') || c.includes('конфет') || c.includes('шокол')) return '🍬';
              if (c.includes('соус') || c.includes('специ') || c.includes('припра')) return '🧂';
              return '🍽️';
            };
            const categoryIcon = getCategoryIcon(p.category);
            
            // Поиск альтернативы с меньшей калорийностью в той же категории
            const findAlternative = (prod, allProducts) => {
              if (!prod.category || !allProducts || allProducts.length < 2) return null;
              const currentKcal = per.kcal100 || 0;
              if (currentKcal < 50) return null; // уже низкокалорийный
              
              const sameCategory = allProducts.filter(alt => 
                alt.category === prod.category && 
                alt.id !== prod.id &&
                (alt.kcal100 || computeDerivedProduct(alt).kcal100) < currentKcal * 0.7 // на 30%+ меньше
              );
              if (sameCategory.length === 0) return null;
              
              // Берём самый низкокалорийный
              const best = sameCategory.reduce((a, b) => {
                const aKcal = a.kcal100 || computeDerivedProduct(a).kcal100;
                const bKcal = b.kcal100 || computeDerivedProduct(b).kcal100;
                return aKcal < bKcal ? a : b;
              });
              const bestKcal = best.kcal100 || computeDerivedProduct(best).kcal100;
              const saving = Math.round((1 - bestKcal / currentKcal) * 100);
              return { name: best.name, saving };
            };
            const alternative = findAlternative(p, products);
            
            const cardContent = React.createElement('div', { className: 'mpc', style: { background: harmBg } },
              // Row 1: category icon + name + badge + grams
              React.createElement('div', { className: 'mpc-row1' },
                categoryIcon && React.createElement('span', { className: 'mpc-category-icon' }, categoryIcon),
                React.createElement('span', { className: 'mpc-name' }, p.name),
                harmBadge && React.createElement('span', { 
                  className: 'mpc-badge',
                  style: { color: harmBadge.color }
                }, harmBadge.emoji),
                // На мобильных — кнопка открывает модалку со слайдером
                React.createElement('button', {
                  className: 'mpc-grams-btn ' + gramsClass,
                  onClick: (e) => { e.stopPropagation(); openEditGramsModal(mi, it.id, G, p); }
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
              ),
              // Row 4: альтернатива (если есть)
              alternative && React.createElement('div', { className: 'mpc-alternative' },
                React.createElement('span', null, '💡 Замени на '),
                React.createElement('strong', null, alternative.name),
                React.createElement('span', null, ' — на ' + alternative.saving + '% меньше ккал')
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
            return React.createElement('div', { key: it.id, className: 'mpc', style: { marginBottom: '6px', background: harmBg } },
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
    
    // === Advice Module Integration (после dayTot и normAbs) ===
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
      uiState,
      prof,        // Профиль пользователя для персонализации
      waterGoal    // Динамическая норма воды из waterGoalBreakdown
    }) : { primary: null, relevant: [], adviceCount: 0, allAdvices: [] };
    
    const { primary: advicePrimary, relevant: adviceRelevant, adviceCount, allAdvices, markShown } = adviceResult;
    
    // Количество всех актуальных советов (для badge на FAB кнопке)
    const totalAdviceCount = allAdvices?.length || 0;
    
    // Listener для heysProductAdded event
    React.useEffect(() => {
      const handleProductAdded = () => {
        setTimeout(() => setAdviceTrigger('product_added'), 500);
      };
      window.addEventListener('heysProductAdded', handleProductAdded);
      return () => window.removeEventListener('heysProductAdded', handleProductAdded);
    }, []);
    
    // Listener для heysCelebrate event (централизованный confetti от gamification)
    React.useEffect(() => {
      const handleCelebrate = () => {
        setShowConfetti(true);
        if (typeof haptic === 'function') haptic('success');
        setTimeout(() => setShowConfetti(false), 2500);
      };
      window.addEventListener('heysCelebrate', handleCelebrate);
      return () => window.removeEventListener('heysCelebrate', handleCelebrate);
    }, []);
    
    // Trigger на открытие вкладки
    React.useEffect(() => {
      const timer = setTimeout(() => setAdviceTrigger('tab_open'), 1500);
      return () => clearTimeout(timer);
    }, [date]);
    
    // Показ toast при получении совета
    React.useEffect(() => {
      if (!advicePrimary) return;
      setAdviceExpanded(false);
      setToastVisible(true);
      setToastDismissed(false);
      if ((advicePrimary.type === 'achievement' || advicePrimary.type === 'warning') && typeof haptic === 'function') {
        haptic('light');
      }
      if (advicePrimary.onShow) advicePrimary.onShow();
      if (advicePrimary.showConfetti) {
        setShowConfetti(true);
        if (typeof haptic === 'function') haptic('success');
        setTimeout(() => setShowConfetti(false), 2000);
      }
      if (markShown) markShown(advicePrimary.id);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setToastVisible(false);
        setAdviceExpanded(false);
        setAdviceTrigger(null);
      }, advicePrimary.ttl || 5000);
      return () => { if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current); };
    }, [advicePrimary?.id, adviceTrigger]);
    
    // Сброс advice при смене даты
    React.useEffect(() => {
      setAdviceTrigger(null);
      setAdviceExpanded(false);
      setToastVisible(false);
      if (window.HEYS?.advice?.resetSessionAdvices) window.HEYS.advice.resetSessionAdvices();
    }, [date]);
    
    // Сброс при открытии picker
    React.useEffect(() => {
      if (uiState.showTimePicker || uiState.showWeightPicker ||
          uiState.showDeficitPicker || uiState.showZonePicker) {
        setAdviceExpanded(false);
      }
    }, [uiState.showTimePicker, uiState.showWeightPicker,
        uiState.showDeficitPicker, uiState.showZonePicker]);

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
    const daySummary = React.createElement('div',{className:'card tone-slate',style:{marginTop:'8px',overflowX:'auto'}},
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
    const currentRatio = eatenKcal / (optimum || 1);
    
    // Цвета для карточек — используем ratioZones
    function getEatenColor() {
      const rz = window.HEYS && window.HEYS.ratioZones;
      if (rz) {
        const zone = rz.getZone(currentRatio);
        const baseColor = zone.color;
        return { 
          bg: baseColor + '20',
          text: zone.textColor === '#fff' ? baseColor : zone.textColor, 
          border: baseColor + '60'
        };
      }
      // Fallback
      if (currentRatio < 0.5) return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
      if (currentRatio < 0.75) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
      if (currentRatio < 1.1) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
      if (currentRatio < 1.3) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
      return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
    }
    function getRemainingColor() {
      const rz = window.HEYS && window.HEYS.ratioZones;
      if (rz) {
        const zone = rz.getZone(currentRatio);
        const baseColor = zone.color;
        return { 
          bg: baseColor + '20',
          text: zone.textColor === '#fff' ? baseColor : zone.textColor, 
          border: baseColor + '60'
        };
      }
      if (remainingKcal > 100) return { bg: '#22c55e20', text: '#22c55e', border: '#22c55e60' };
      if (remainingKcal >= 0) return { bg: '#eab30820', text: '#eab308', border: '#eab30860' };
      return { bg: '#ef444420', text: '#ef4444', border: '#ef444460' };
    }
    
    // Статус ratio для badge
    function getRatioStatus() {
      // Если ещё ничего не съедено — приветствие, а не ошибка
      if (eatenKcal === 0) {
        return { emoji: '👋', text: 'Хорошего дня!', color: '#64748b' };
      }
      
      const rz = window.HEYS && window.HEYS.ratioZones;
      const zoneId = rz ? rz.getStatus(currentRatio) : 
        (currentRatio < 0.5 ? 'crash' : currentRatio < 0.75 ? 'low' : currentRatio < 0.9 ? 'good' : currentRatio < 1.1 ? 'perfect' : currentRatio < 1.3 ? 'over' : 'binge');
      
      switch (zoneId) {
        case 'crash': return { emoji: '💀', text: 'Критически мало!', color: '#ef4444' };
        case 'low': return { emoji: '🍽️', text: 'Маловато', color: '#eab308' };
        case 'good': return { emoji: '👍', text: 'Хорошо!', color: '#22c55e' };
        case 'perfect': return { emoji: '🔥', text: 'Идеально!', color: '#10b981' };
        case 'over': return { emoji: '😅', text: 'Чуть больше', color: '#eab308' };
        case 'binge': return { emoji: '🚨', text: 'Перебор!', color: '#ef4444' };
        default: return { emoji: '📊', text: '', color: '#64748b' };
      }
    }
    const ratioStatus = getRatioStatus();
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
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        
        // Собираем вес за последние 7 дней (включая сегодня)
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const scopedKey = clientId 
            ? 'heys_' + clientId + '_dayv2_' + dateStr 
            : 'heys_dayv2_' + dateStr;
          
          let dayData = null;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            }
          } catch(e) {}
          
          if (dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0) {
            weights.push({ date: dateStr, weight: +dayData.weightMorning, dayIndex: 6 - i });
          }
        }
        
        // Нужно минимум 2 точки для тренда
        if (weights.length < 2) return null;
        
        // Сортируем по дате (от старой к новой)
        weights.sort((a, b) => a.date.localeCompare(b.date));
        
        // Линейная регрессия для более точного тренда
        const n = weights.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          const x = weights[i].dayIndex;
          const y = weights[i].weight;
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumX2 += x * x;
        }
        
        const denominator = n * sumX2 - sumX * sumX;
        // slope = изменение веса за 1 день по тренду
        const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        
        // Ограничиваем slope: максимум ±0.3 кг/день (реалистичный предел)
        const clampedSlope = Math.max(-0.3, Math.min(0.3, slope));
        
        // Вычисляем изменение за период
        const firstWeight = weights[0].weight;
        const lastWeight = weights[weights.length - 1].weight;
        const diff = lastWeight - firstWeight;
        
        // Определяем направление
        let arrow = '→';
        let direction = 'same';
        if (clampedSlope > 0.03) { arrow = '⬆️'; direction = 'up'; }
        else if (clampedSlope < -0.03) { arrow = '⬇️'; direction = 'down'; }
        
        // Форматируем текст
        const sign = diff > 0 ? '+' : '';
        const text = arrow + ' ' + sign + r1(diff) + ' кг';
        
        return { text, diff, direction, slope: clampedSlope, dataPoints: n };
      } catch (e) {
        return null;
      }
    }, [date, day.weightMorning]);
    
    // Прогноз веса на месяц (~Xкг/мес)
    const monthForecast = React.useMemo(() => {
      if (!weightTrend || weightTrend.slope === undefined) return null;
      
      // Используем slope из линейной регрессии (уже ограничен ±0.3 кг/день)
      const monthChange = weightTrend.slope * 30;
      
      // Показываем только если изменение значительное (>0.3кг/мес)
      // и есть минимум 3 точки данных для надёжности
      if (Math.abs(monthChange) < 0.3 || weightTrend.dataPoints < 3) return null;
      
      const sign = monthChange > 0 ? '+' : '';
      return {
        text: '~' + sign + r1(monthChange) + ' кг/мес',
        direction: monthChange < 0 ? 'down' : monthChange > 0 ? 'up' : 'same'
      };
    }, [weightTrend]);
    
    // Данные для sparkline веса за N дней
    const weightSparklineData = React.useMemo(() => {
      try {
        const viewDate = new Date(date); // Просматриваемый день
        const realTodayStr = fmtDate(new Date()); // Реальный сегодняшний день
        const days = [];
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        
        for (let i = chartPeriod - 1; i >= 0; i--) {
          const d = new Date(viewDate);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr; // Это реальный сегодняшний день?
          
          // Для реального сегодняшнего дня берём вес из state (реактивный)
          if (isRealToday) {
            const todayWeight = +day.weightMorning || 0;
            if (todayWeight > 0) {
              days.push({ 
                date: dateStr, 
                weight: todayWeight,
                isToday: true,
                dayNum: dateStr.slice(-2).replace(/^0/, '')
              });
            }
            continue;
          }
          
          // Для остальных дней — из localStorage
          const scopedKey = clientId 
            ? 'heys_' + clientId + '_dayv2_' + dateStr 
            : 'heys_dayv2_' + dateStr;
          
          let dayData = null;
          try {
            const raw = localStorage.getItem(scopedKey);
            if (raw) {
              dayData = raw.startsWith('¤Z¤') ? JSON.parse(raw.substring(3)) : JSON.parse(raw);
            }
          } catch(e) {}
          
          if (dayData?.weightMorning > 0) {
            days.push({ 
              date: dateStr, 
              weight: +dayData.weightMorning,
              isToday: false,
              dayNum: dateStr.slice(-2).replace(/^0/, '')
            });
          }
        }
        return days;
      } catch (e) {
        return [];
      }
    }, [date, day.weightMorning, chartPeriod]);
    
    // Данные для sparkline калорий за chartPeriod дней
    // Используем products из state (реактивные данные после sync)
    const sparklineData = React.useMemo(() => {
      try {
        const viewDate = new Date(date); // Просматриваемый день
        const realTodayStr = fmtDate(new Date()); // Реальный сегодняшний день
        const days = [];
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        
        // Строим Map продуктов из state (а не из localStorage!)
        const productsMap = new Map();
        (products || []).forEach(p => { if(p && p.id) productsMap.set(p.id, p); });
        
        // Получаем данные activeDays для нескольких месяцев (chartPeriod может охватывать 2 месяца)
        const getActiveDaysForMonth = (HEYS.dayUtils && HEYS.dayUtils.getActiveDaysForMonth) || (() => new Map());
        const allActiveDays = new Map();
        
        // Собираем данные за текущий и предыдущий месяц
        // Важно: передаём products из state как 4-й аргумент!
        for (let monthOffset = 0; monthOffset >= -1; monthOffset--) {
          const checkDate = new Date(viewDate);
          checkDate.setMonth(checkDate.getMonth() + monthOffset);
          const monthData = getActiveDaysForMonth(checkDate.getFullYear(), checkDate.getMonth(), prof, products);
          monthData.forEach((v, k) => allActiveDays.set(k, v));
        }
        
        for (let i = chartPeriod - 1; i >= 0; i--) {
          const d = new Date(viewDate);
          d.setDate(d.getDate() - i);
          const dateStr = fmtDate(d);
          const isRealToday = dateStr === realTodayStr; // Это реальный сегодняшний день?
          
          // Берём данные из activeDays (там уже вычислены kcal и target)
          const dayInfo = allActiveDays.get(dateStr);
          
          // Для реального сегодняшнего дня используем eatenKcal и текущий optimum
          if (isRealToday) {
            // Тренировки сегодня берём из day state
            const todayTrainings = (day.trainings || []).filter(t => t && t.z && t.z.some(z => z > 0));
            const hasTraining = todayTrainings.length > 0;
            const trainingTypes = todayTrainings.map(t => t.type || 'cardio');
            // Считаем минуты тренировок сегодня
            let trainingMinutes = 0;
            todayTrainings.forEach(t => {
              if (t.z && Array.isArray(t.z)) trainingMinutes += t.z.reduce((s, m) => s + (+m || 0), 0);
            });
            // Сон сегодня
            let sleepHours = 0;
            if (day.sleepStart && day.sleepEnd) {
              const [sh, sm] = day.sleepStart.split(':').map(Number);
              const [eh, em] = day.sleepEnd.split(':').map(Number);
              let startMin = sh * 60 + sm, endMin = eh * 60 + em;
              if (endMin < startMin) endMin += 24 * 60;
              sleepHours = (endMin - startMin) / 60;
            }
            days.push({ 
              date: dateStr, 
              kcal: Math.round(eatenKcal || 0), 
              target: optimum,
              isToday: true,
              hasTraining,
              trainingTypes,
              trainingMinutes,
              sleepHours,
              moodAvg: +day.moodAvg || 0,
              dayScore: +day.dayScore || 0,
              prot: Math.round(dayTot.prot || 0),
              fat: Math.round(dayTot.fat || 0),
              carbs: Math.round(dayTot.carbs || 0)
            });
            continue;
          }
          
          // Для прошлых дней используем данные из activeDays
          if (dayInfo && dayInfo.kcal > 0) {
            // Проверяем тренировки
            const hasTraining = dayInfo.hasTraining || false;
            const trainingTypes = dayInfo.trainingTypes || [];
            days.push({ 
              date: dateStr, 
              kcal: dayInfo.kcal, 
              target: dayInfo.target,
              isToday: false,
              hasTraining,
              trainingTypes,
              trainingMinutes: dayInfo.trainingMinutes || 0,
              sleepHours: dayInfo.sleepHours || 0,
              sleepQuality: dayInfo.sleepQuality || 0,
              dayScore: dayInfo.dayScore || 0,
              steps: dayInfo.steps || 0,
              prot: dayInfo.prot || 0,
              fat: dayInfo.fat || 0,
              carbs: dayInfo.carbs || 0
            });
          } else {
            // Fallback: читаем напрямую из localStorage
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
              // Проверяем тренировки и их типы
              const dayTrainings = (dayData.trainings || []).filter(t => t && t.z && t.z.some(z => z > 0));
              const hasTraining = dayTrainings.length > 0;
              const trainingTypes = dayTrainings.map(t => t.type || 'cardio');
              // Вычисляем sleepHours из sleepStart/sleepEnd
              let fallbackSleepHours = 0;
              if (dayData.sleepStart && dayData.sleepEnd) {
                const [sh, sm] = dayData.sleepStart.split(':').map(Number);
                const [eh, em] = dayData.sleepEnd.split(':').map(Number);
                let startMin = sh * 60 + sm, endMin = eh * 60 + em;
                if (endMin < startMin) endMin += 24 * 60;
                fallbackSleepHours = (endMin - startMin) / 60;
              }
              // Без target если нет в activeDays, используем текущий optimum
              days.push({ 
                date: dateStr, 
                kcal: Math.round(totalKcal), 
                target: optimum, 
                isToday: false, 
                hasTraining, 
                trainingTypes,
                sleepHours: fallbackSleepHours,
                sleepQuality: +dayData.sleepQuality || 0,
                dayScore: +dayData.dayScore || 0,
                steps: +dayData.steps || 0
              });
            } else {
              days.push({ date: dateStr, kcal: 0, target: optimum, isToday: false, hasTraining: false, trainingTypes: [], sleepHours: 0, sleepQuality: 0, dayScore: 0, steps: 0 });
            }
          }
        }
        
        return days;
      } catch (e) {
        return [];
      }
    }, [date, eatenKcal, chartPeriod, optimum, prof, products, day.trainings, day.sleepStart, day.sleepEnd, day.moodAvg, day.dayScore]);
    
    // Тренд калорий за последние N дней (среднее превышение/дефицит)
    const kcalTrend = React.useMemo(() => {
      if (!sparklineData || sparklineData.length < 3 || !optimum || optimum <= 0) return null;
      
      try {
        // Считаем среднее отклонение от нормы (исключая сегодня и неполные дни <50%)
        const pastDays = sparklineData.filter(d => {
          if (d.isToday) return false;
          if (d.kcal <= 0) return false;
          // Исключаем дни с <50% заполненности — вероятно незаполненные
          const ratio = d.target > 0 ? d.kcal / d.target : 0;
          return ratio >= 0.5;
        });
        if (pastDays.length < 2) return null;
        
        const avgKcal = pastDays.reduce((sum, d) => sum + d.kcal, 0) / pastDays.length;
        const diff = avgKcal - optimum;
        const diffPct = Math.round((diff / optimum) * 100);
        
        let direction = 'same';
        let text = '';
        
        if (diffPct <= -5) {
          direction = 'deficit';
          text = 'Дефицит ' + Math.abs(diffPct) + '%';
        } else if (diffPct >= 5) {
          direction = 'excess';
          text = 'Избыток ' + diffPct + '%';
        } else {
          direction = 'same';
          text = 'В норме';
        }
        
        return { text, diff, direction, avgKcal: Math.round(avgKcal) };
      } catch (e) {
        return null;
      }
    }, [sparklineData, optimum]);
    
    // Данные для heatmap текущей недели (пн-вс)
    const weekHeatmapData = React.useMemo(() => {
      // Парсим текущую дату правильно (без timezone issues)
      const [year, month, dayNum] = date.split('-').map(Number);
      const today = new Date(year, month - 1, dayNum);
      const now = new Date();
      const nowDateStr = fmtDate(now);
      
      // Находим понедельник текущей недели
      const dayOfWeek = today.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      
      // Используем те же данные что и sparklineData (activeDays)
      const getActiveDaysForMonth = (HEYS.dayUtils && HEYS.dayUtils.getActiveDaysForMonth) || (() => new Map());
      const allActiveDays = new Map();
      
      // Собираем данные за текущий и предыдущий месяц (неделя может охватывать 2 месяца)
      for (let monthOffset = 0; monthOffset >= -1; monthOffset--) {
        const checkDate = new Date(today);
        checkDate.setMonth(checkDate.getMonth() + monthOffset);
        const monthData = getActiveDaysForMonth(checkDate.getFullYear(), checkDate.getMonth(), prof, products);
        monthData.forEach((v, k) => allActiveDays.set(k, v));
      }
      
      const days = [];
      const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      let streak = 0;
      let weekendExcess = 0;
      let weekdayAvg = 0;
      let weekendCount = 0;
      let weekdayCount = 0;
      
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = fmtDate(d);
        const isFuture = dateStr > nowDateStr;
        const isToday = dateStr === date;
        const isWeekend = i >= 5;
        
        // Загружаем данные дня из activeDays
        let ratio = null;
        let kcal = 0;
        let status = 'empty'; // empty | low | green | yellow | red | perfect
        
        // Используем централизованный ratioZones
        const rz = HEYS.ratioZones;
        
        if (!isFuture) {
          const dayInfo = allActiveDays.get(dateStr);
          if (dayInfo && dayInfo.kcal > 0) {
            kcal = dayInfo.kcal;
            const target = dayInfo.target || optimum;
            if (kcal > 0 && target > 0) {
              ratio = kcal / target;
              // Используем ratioZones для определения статуса
              status = rz ? rz.getHeatmapStatus(ratio) : 'empty';
              
              // Считаем streak (последовательные успешные дни — green)
              const isSuccess = rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.1);
              if (isSuccess && (days.length === 0 || days[days.length - 1].status === 'green')) {
                streak++;
              } else if (!isSuccess) {
                streak = 0;
              }
              
              // Статистика для паттерна выходных
              if (isWeekend) {
                weekendExcess += ratio;
                weekendCount++;
              } else {
                weekdayAvg += ratio;
                weekdayCount++;
              }
            }
          }
        }
        
        days.push({
          date: dateStr,
          name: dayNames[i],
          status,
          ratio,
          kcal: Math.round(kcal),
          isToday,
          isFuture,
          isWeekend,
          // Градиентный цвет из ratioZones
          bgColor: ratio && rz ? rz.getGradientColor(ratio, 0.6) : null
        });
      }
      
      const inNorm = days.filter(d => d.status === 'green' || d.status === 'perfect').length;
      const withData = days.filter(d => d.status !== 'empty' && !d.isFuture).length;
      
      // Паттерн выходных
      let weekendPattern = null;
      if (weekendCount > 0 && weekdayCount > 0) {
        const avgWeekend = weekendExcess / weekendCount;
        const avgWeekday = weekdayAvg / weekdayCount;
        const diff = Math.round((avgWeekend - avgWeekday) * 100);
        if (Math.abs(diff) >= 10) {
          weekendPattern = diff > 0 
            ? 'По выходным +' + diff + '% калорий'
            : 'По выходным ' + diff + '% калорий';
        }
      }
      
      return { days, inNorm, withData, streak, weekendPattern };
    }, [date, optimum, pIndex, products, prof]);
    
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
      // Используем window, так как scroll на уровне страницы, не на контейнере
      const onTouchStart = (e) => {
        // Начинаем pull только если скролл вверху страницы
        if (window.scrollY <= 0) {
          pullStartY.current = e.touches[0].clientY;
          isPulling.current = true;
          setRefreshStatus('pulling');
        }
      };
      
      const onTouchMove = (e) => {
        if (!isPulling.current || isRefreshing) return;
        
        const y = e.touches[0].clientY;
        const diff = y - pullStartY.current;
        
        if (diff > 0 && window.scrollY <= 0) {
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
      
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd, { passive: true });
      
      return () => {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
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
    
    // 🔔 Shake после завершения анимации sparkline (последовательно: Съедено → Перебор)
    const shakeTimerRef = React.useRef(null);
    React.useEffect(() => {
      // Очищаем предыдущий таймер
      if (shakeTimerRef.current) {
        clearTimeout(shakeTimerRef.current);
      }
      
      const ratio = eatenKcal / (optimum || 1);
      const isSuccess = ratio >= 0.75 && ratio <= 1.1;
      const isExcess = ratio > 1.1;
      
      if (isExcess) {
        // ❌ Превышение — shake последовательно
        shakeTimerRef.current = setTimeout(() => {
          setShakeEaten(true);
          setTimeout(() => setShakeEaten(false), 500);
          
          setTimeout(() => {
            setShakeOver(true);
            setTimeout(() => setShakeOver(false), 500);
          }, 300);
        }, 5000);
      } else if (isSuccess) {
        // ✅ Успех — пульсация при загрузке
        shakeTimerRef.current = setTimeout(() => {
          console.log('✨ SUCCESS: Пульсация карточки');
          setPulseSuccess(true);
          // Пульсация длится 1.5с (3 цикла по 0.5с)
          setTimeout(() => setPulseSuccess(false), 1500);
        }, 5000);
      }
      
      return () => {
        if (shakeTimerRef.current) {
          clearTimeout(shakeTimerRef.current);
        }
      };
    }, [date, eatenKcal, optimum]);
    
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
      
      // === Empty state: проверяем есть ли реальные данные (хотя бы 2 дня с kcal > 0) ===
      const daysWithData = data.filter(d => d.kcal > 0).length;
      if (daysWithData < 2) {
        const daysNeeded = 2 - daysWithData;
        return React.createElement('div', { className: 'sparkline-empty-state' },
          React.createElement('div', { className: 'sparkline-empty-icon' }, '📊'),
          React.createElement('div', { className: 'sparkline-empty-text' },
            daysWithData === 0 
              ? 'Начните вести дневник питания'
              : 'Добавьте еду ещё за ' + daysNeeded + ' день'
          ),
          React.createElement('div', { className: 'sparkline-empty-hint' },
            'График появится после 2+ дней с данными'
          ),
          React.createElement('div', { className: 'sparkline-empty-progress' },
            React.createElement('div', { 
              className: 'sparkline-empty-progress-bar',
              style: { width: (daysWithData / 2 * 100) + '%' }
            }),
            React.createElement('span', { className: 'sparkline-empty-progress-text' },
              daysWithData + ' / 2 дней'
            )
          ),
          React.createElement('button', { 
            className: 'sparkline-empty-btn',
            onClick: () => {
              // Открываем модалку добавления приёма
              if (window.HEYS && window.HEYS.Day && window.HEYS.Day.addMeal) {
                window.HEYS.Day.addMeal();
              }
              haptic('light');
            }
          }, '+ Добавить еду')
        );
      }
      
      // === Helpers для выходных и праздников ===
      const RU_HOLIDAYS = [
        '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
        '02-23', '03-08', '05-01', '05-09', '06-12', '11-04'
      ];
      const isWeekend = (dateStr) => {
        if (!dateStr) return false;
        const day = new Date(dateStr).getDay();
        return day === 0 || day === 6;
      };
      const isHoliday = (dateStr) => dateStr ? RU_HOLIDAYS.includes(dateStr.slice(5)) : false;
      const addDays = (dateStr, days) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
      };
      
      // === Проверка: сегодня съедено < 50% нормы? ===
      // Если да, показываем сегодня как прогноз (пунктиром), а не как реальные данные
      const todayData = data.find(d => d.isToday);
      const todayRatio = todayData && todayData.target > 0 ? todayData.kcal / todayData.target : 0;
      const isTodayIncomplete = todayData && todayRatio < 0.5;
      
      // Обрабатываем данные:
      // 1. Помечаем пустые/неполные дни как "unknown" (будут показаны как "?")
      // 2. Интерполируем их kcal между соседними известными днями
      const processedData = data.map((d, idx) => {
        // Сегодня неполный — отдельная логика (показываем как прогноз)
        if (d.isToday && isTodayIncomplete) {
          return { ...d, isUnknown: false, excludeFromChart: true };
        }
        
        // Пустой день или <50% нормы = неизвестный
        const ratio = d.target > 0 ? d.kcal / d.target : 0;
        const isUnknown = d.kcal === 0 || (!d.isToday && ratio < 0.5);
        
        return { ...d, isUnknown, excludeFromChart: false };
      });
      
      // Интерполируем kcal для unknown дней
      const chartData = processedData.filter(d => !d.excludeFromChart).map((d, idx, arr) => {
        if (!d.isUnknown) return d;
        
        // Ищем ближайший известный день слева
        let leftKcal = null, leftIdx = idx - 1;
        while (leftIdx >= 0) {
          if (!arr[leftIdx].isUnknown) { leftKcal = arr[leftIdx].kcal; break; }
          leftIdx--;
        }
        
        // Ищем ближайший известный день справа
        let rightKcal = null, rightIdx = idx + 1;
        while (rightIdx < arr.length) {
          if (!arr[rightIdx].isUnknown) { rightKcal = arr[rightIdx].kcal; break; }
          rightIdx++;
        }
        
        // Интерполируем
        let interpolatedKcal;
        if (leftKcal !== null && rightKcal !== null) {
          // Линейная интерполяция между соседями
          const leftDist = idx - leftIdx;
          const rightDist = rightIdx - idx;
          const totalDist = leftDist + rightDist;
          interpolatedKcal = Math.round((leftKcal * rightDist + rightKcal * leftDist) / totalDist);
        } else if (leftKcal !== null) {
          interpolatedKcal = leftKcal; // Только слева — берём его
        } else if (rightKcal !== null) {
          interpolatedKcal = rightKcal; // Только справа — берём его
        } else {
          interpolatedKcal = d.target || goal; // Нет соседей — берём норму
        }
        
        return { ...d, kcal: interpolatedKcal, originalKcal: d.kcal };
      });
      
      // Прогноз на +1 день по тренду (завтра), или сегодня+завтра если сегодня неполный
      const forecastDays = 1;
      const hasEnoughData = chartData.length >= 3;
      let forecastPoints = [];
      const lastChartDate = chartData[chartData.length - 1]?.date || '';
      
      if (hasEnoughData && lastChartDate) {
        // Используем линейную регрессию по всем данным для более стабильного тренда
        // Это предотвращает "взлёты" из-за одного-двух дней переедания
        const n = chartData.length;
        const kcalValues = chartData.map(d => d.kcal);
        
        // Вычисляем линейную регрессию: y = a + b*x
        // b = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
          sumX += i;
          sumY += kcalValues[i];
          sumXY += i * kcalValues[i];
          sumX2 += i * i;
        }
        
        const denominator = n * sumX2 - sumX * sumX;
        // slope = изменение ккал за 1 день по тренду
        const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
        const intercept = (sumY - slope * sumX) / n;
        
        // Ограничиваем slope чтобы не было безумных прогнозов
        // Максимум ±150 ккал/день изменения тренда
        const clampedSlope = Math.max(-150, Math.min(150, slope));
        
        // Последнее значение и прогноз следующего
        const lastKcal = kcalValues[n - 1];
        const lastTarget = chartData[n - 1].target || goal;
        
        // Для прогноза: используем регрессию, но ближе к последнему значению
        // Смешиваем: 60% регрессия + 40% продолжение от последнего значения
        const regressionNext = intercept + clampedSlope * n;
        const simpleNext = lastKcal + clampedSlope;
        const blendedNext = regressionNext * 0.6 + simpleNext * 0.4;
        
        // Вычисляем тренд НОРМЫ за последние 7 дней (учитывает изменения веса, активности)
        const last7Days = chartData.slice(-7);
        let targetTrend = 0;
        if (last7Days.length >= 2) {
          const firstTarget = last7Days[0].target || goal;
          const lastTargetVal = last7Days[last7Days.length - 1].target || goal;
          targetTrend = (lastTargetVal - firstTarget) / (last7Days.length - 1);
        }
        
        // Если сегодня неполный — добавляем прогноз на сегодня и завтра
        const daysToForecast = isTodayIncomplete ? 2 : forecastDays;
        
        for (let i = 1; i <= daysToForecast; i++) {
          const forecastDate = addDays(lastChartDate, i);
          const forecastDayNum = forecastDate ? new Date(forecastDate).getDate() : '';
          const isTodayForecast = isTodayIncomplete && i === 1;
          // Прогноз нормы по тренду
          const forecastTarget = Math.round(lastTarget + targetTrend * i);
          // Прогноз ккал: blendedNext для первого дня, далее +clampedSlope
          const forecastKcal = i === 1 
            ? Math.round(blendedNext) 
            : Math.round(blendedNext + clampedSlope * (i - 1));
          forecastPoints.push({
            kcal: Math.max(0, forecastKcal),
            target: forecastTarget,
            isForecast: true,
            isTodayForecast, // маркер что это прогноз на сегодня
            date: forecastDate,
            dayNum: forecastDayNum,
            isWeekend: isWeekend(forecastDate) || isHoliday(forecastDate)
          });
        }
      }
      
      const totalPoints = chartData.length + forecastPoints.length;
      const width = 360;
      const height = 130; // увеличено для дельты под датами
      const paddingTop = 16; // для меток над точками
      const paddingBottom = 26; // место для дат + дельты
      const paddingX = 8; // минимальные отступы — точки почти у края
      const chartHeight = height - paddingTop - paddingBottom;
      
      // Адаптивная шкала Y: от минимума до максимума с отступами
      // Это делает разницу между точками более заметной
      const allKcalValues = [...chartData, ...forecastPoints].map(d => d.kcal).filter(v => v > 0);
      const allTargetValues = [...chartData, ...forecastPoints].map(d => d.target || goal);
      const allValues = [...allKcalValues, ...allTargetValues];
      
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);
      const range = dataMax - dataMin;
      
      // Отступы: 15% снизу и сверху от диапазона данных
      const padding = Math.max(range * 0.15, 100); // минимум 100 ккал отступ
      const scaleMin = Math.max(0, dataMin - padding);
      const scaleMax = dataMax + padding;
      const scaleRange = scaleMax - scaleMin;
      
      // Основные точки данных (без неполного сегодня)
      const points = chartData.map((d, i) => {
        const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
        // Нормализуем к scaleMin-scaleMax
        const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
        const y = paddingTop + chartHeight - yNorm * chartHeight;
        const targetNorm = scaleRange > 0 ? ((d.target || goal) - scaleMin) / scaleRange : 0.5;
        const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
        // Извлекаем день из даты (последние 2 символа)
        const dayNum = d.date ? d.date.slice(-2).replace(/^0/, '') : '';
        const ratio = (d.target || goal) > 0 ? d.kcal / (d.target || goal) : 0;
        // Хороший день: используем централизованный ratioZones
        const rz = HEYS.ratioZones;
        const isPerfect = d.isUnknown ? false : (rz ? rz.isSuccess(ratio) : (ratio >= 0.75 && ratio <= 1.10));
        // Выходные/праздники
        const isWeekendDay = isWeekend(d.date) || isHoliday(d.date);
        // День недели (0=Вс, 1=Пн, ...)
        const dayOfWeek = d.date ? new Date(d.date).getDay() : 0;
        return { 
          x, y, kcal: d.kcal, target: d.target || goal, targetY, ratio,
          isToday: d.isToday, dayNum, date: d.date, isPerfect,
          isUnknown: d.isUnknown || false, // флаг неизвестного дня
          hasTraining: d.hasTraining, trainingTypes: d.trainingTypes || [],
          trainingMinutes: d.trainingMinutes || 0,
          isWeekend: isWeekendDay, sleepQuality: d.sleepQuality || 0,
          sleepHours: d.sleepHours || 0, dayScore: d.dayScore || 0,
          steps: d.steps || 0,
          prot: d.prot || 0, fat: d.fat || 0, carbs: d.carbs || 0,
          dayOfWeek
        };
      });
      
      // Точки прогноза (включая сегодня если неполный)
      const forecastPts = forecastPoints.map((d, i) => {
        const idx = chartData.length + i;
        const x = paddingX + (idx / (totalPoints - 1)) * (width - paddingX * 2);
        const yNorm = scaleRange > 0 ? (d.kcal - scaleMin) / scaleRange : 0.5;
        const y = paddingTop + chartHeight - yNorm * chartHeight;
        const targetNorm = scaleRange > 0 ? ((d.target || goal) - scaleMin) / scaleRange : 0.5;
        const targetY = paddingTop + chartHeight - targetNorm * chartHeight;
        return { 
          x, y, kcal: d.kcal, target: d.target, targetY, isForecast: true, 
          isTodayForecast: d.isTodayForecast || false,
          dayNum: d.dayNum || '', date: d.date, isWeekend: d.isWeekend 
        };
      });
      
      // Min/Max для меток
      const kcalValues = points.filter(p => p.kcal > 0).map(p => p.kcal);
      const minKcal = Math.min(...kcalValues);
      const maxKcalVal = Math.max(...kcalValues);
      const minPoint = points.find(p => p.kcal === minKcal);
      const maxPoint = points.find(p => p.kcal === maxKcalVal);
      
      // Плавная кривая через cubic bezier (catmull-rom → bezier)
      // С ограничением overshooting для монотонности
      const smoothPath = (pts, yKey = 'y') => {
        if (pts.length < 2) return '';
        if (pts.length === 2) return `M${pts[0].x},${pts[0][yKey]} L${pts[1].x},${pts[1][yKey]}`;
        
        let d = `M${pts[0].x},${pts[0][yKey]}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          // Catmull-Rom → Cubic Bezier control points
          const tension = 0.25; // Уменьшено для меньшего overshooting
          
          // Базовые контрольные точки
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;
          
          // === Monotonic constraint: ограничиваем overshooting ===
          // Контрольные точки не должны выходить за пределы Y между p1 и p2
          const minY = Math.min(p1[yKey], p2[yKey]);
          const maxY = Math.max(p1[yKey], p2[yKey]);
          const margin = (maxY - minY) * 0.15; // 15% допуск
          
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
        }
        return d;
      };
      
      // Расчёт длины cubic bezier сегмента (приближение через разбиение на отрезки)
      const bezierLength = (p1, cp1, cp2, p2, steps = 10) => {
        let length = 0;
        let prevX = p1.x, prevY = p1.y;
        for (let t = 1; t <= steps; t++) {
          const s = t / steps;
          const u = 1 - s;
          // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
          const x = u*u*u*p1.x + 3*u*u*s*cp1.x + 3*u*s*s*cp2.x + s*s*s*p2.x;
          const y = u*u*u*p1.y + 3*u*u*s*cp1.y + 3*u*s*s*cp2.y + s*s*s*p2.y;
          length += Math.sqrt((x - prevX) ** 2 + (y - prevY) ** 2);
          prevX = x;
          prevY = y;
        }
        return length;
      };
      
      // Кумулятивные длины пути до каждой точки (для синхронизации анимации)
      const calcCumulativeLengths = (pts, yKey = 'y') => {
        const lengths = [0]; // первая точка = 0
        if (pts.length < 2) return lengths;
        
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1[yKey] + (p2[yKey] - p0[yKey]) * tension };
          const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2[yKey] - (p3[yKey] - p1[yKey]) * tension };
          
          const segmentLen = bezierLength(
            { x: p1.x, y: p1[yKey] }, cp1, cp2, { x: p2.x, y: p2[yKey] }
          );
          lengths.push(lengths[lengths.length - 1] + segmentLen);
        }
        return lengths;
      };
      
      const cumulativeLengths = calcCumulativeLengths(points, 'y');
      const totalPathLength = cumulativeLengths[cumulativeLengths.length - 1] || 1;
      
      // === Известные точки для построения path ===
      const knownPoints = points.filter(p => !p.isUnknown);
      
      // Path строится ТОЛЬКО по известным точкам — плавная кривая
      const pathD = smoothPath(knownPoints, 'y');
      
      // === Вычисляем Y для unknown точек на кривой Безье ===
      // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
      const cubicBezier = (t, p0, cp1, cp2, p3) => {
        const u = 1 - t;
        return u*u*u*p0 + 3*u*u*t*cp1 + 3*u*t*t*cp2 + t*t*t*p3;
      };
      
      points.forEach((p) => {
        if (!p.isUnknown) return;
        
        // Находим между какими известными точками (по X) лежит unknown
        let leftIdx = -1, rightIdx = -1;
        for (let i = 0; i < knownPoints.length; i++) {
          if (knownPoints[i].x <= p.x) leftIdx = i;
          if (knownPoints[i].x > p.x && rightIdx < 0) { rightIdx = i; break; }
        }
        
        if (leftIdx < 0 || rightIdx < 0) {
          // Крайний случай — используем ближайшую точку
          if (leftIdx >= 0) p.y = knownPoints[leftIdx].y;
          else if (rightIdx >= 0) p.y = knownPoints[rightIdx].y;
          return;
        }
        
        // Catmull-Rom → Bezier control points (те же что в smoothPath)
        const tension = 0.25;
        const i = leftIdx;
        const p0 = knownPoints[Math.max(0, i - 1)];
        const p1 = knownPoints[i];
        const p2 = knownPoints[i + 1];
        const p3 = knownPoints[Math.min(knownPoints.length - 1, i + 2)];
        
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        
        // Находим t по X (приближённо, для Bezier X тоже кривая)
        // Используем итеративный поиск
        const targetX = p.x;
        let t = (targetX - p1.x) / (p2.x - p1.x); // начальное приближение
        
        // Несколько итераций Newton-Raphson для уточнения t
        for (let iter = 0; iter < 5; iter++) {
          const currentX = cubicBezier(t, p1.x, cp1x, cp2x, p2.x);
          const error = currentX - targetX;
          if (Math.abs(error) < 0.1) break;
          
          // Производная Bezier по t
          const u = 1 - t;
          const dx = 3*u*u*(cp1x - p1.x) + 6*u*t*(cp2x - cp1x) + 3*t*t*(p2.x - cp2x);
          if (Math.abs(dx) > 0.001) t -= error / dx;
          t = Math.max(0, Math.min(1, t));
        }
        
        // Вычисляем Y по найденному t
        p.y = cubicBezier(t, p1.y, cp1y, cp2y, p2.y);
      });
      
      // Линия цели — плавная пунктирная
      const goalPathD = smoothPath(points, 'targetY');
      
      // Прогнозная линия (если есть данные)
      let forecastPathD = '';
      let forecastColor = '#94a3b8'; // серый по умолчанию
      let forecastPathLength = 0; // длина для анимации
      if (forecastPts.length > 0 && points.length >= 2) {
        // Берём 2 последние точки для плавного продолжения Bezier
        const prev2Point = points[points.length - 2];
        const lastPoint = points[points.length - 1];
        const forecastPoint = forecastPts[forecastPts.length - 1];
        
        // Полный массив для расчёта касательных
        const allForBezier = [prev2Point, lastPoint, ...forecastPts];
        
        // Строим путь только для прогнозной части (от lastPoint)
        // Используем smoothPath но начинаем с индекса 1
        let d = `M${lastPoint.x},${lastPoint.y}`;
        for (let i = 1; i < allForBezier.length - 1; i++) {
          const p0 = allForBezier[i - 1];
          const p1 = allForBezier[i];
          const p2 = allForBezier[i + 1];
          const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
          const tension = 0.25;
          const cp1x = p1.x + (p2.x - p0.x) * tension;
          const cp1y = p1.y + (p2.y - p0.y) * tension;
          const cp2x = p2.x - (p3.x - p1.x) * tension;
          const cp2y = p2.y - (p3.y - p1.y) * tension;
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
          
          // Длина сегмента
          forecastPathLength += bezierLength(
            { x: p1.x, y: p1.y },
            { x: cp1x, y: cp1y },
            { x: cp2x, y: cp2y },
            { x: p2.x, y: p2.y }
          );
        }
        forecastPathD = d;
        
        // Цвет по направлению тренда относительно цели
        const lastRatio = lastPoint.target > 0 ? lastPoint.kcal / lastPoint.target : 1;
        const forecastRatio = forecastPoint.target > 0 ? forecastPoint.kcal / forecastPoint.target : 1;
        // Зелёный если идём к дефициту, красный если к избытку
        if (forecastRatio < lastRatio && forecastRatio <= 1.1) {
          forecastColor = '#22c55e'; // зелёный — улучшение
        } else if (forecastRatio > lastRatio && forecastRatio > 1.0) {
          forecastColor = '#ef4444'; // красный — ухудшение
        } else {
          forecastColor = '#8b5cf6'; // фиолетовый — стабильно
        }
      }
      
      // Прогнозная линия НОРМЫ (goal) — продолжение тренда за 7 дней
      let forecastGoalPathD = '';
      if (forecastPts.length > 0 && points.length >= 2) {
        // Берём 2 последние точки для плавного продолжения Bezier
        const prev2Point = points[points.length - 2];
        const lastPoint = points[points.length - 1];
        
        // Полный массив для расчёта касательных (используем targetY)
        const allForBezier = [prev2Point, lastPoint, ...forecastPts];
        
        // Строим путь только для прогнозной части (от lastPoint)
        let d = `M${lastPoint.x},${lastPoint.targetY}`;
        for (let i = 1; i < allForBezier.length - 1; i++) {
          const p0 = allForBezier[i - 1];
          const p1 = allForBezier[i];
          const p2 = allForBezier[i + 1];
          const p3 = allForBezier[Math.min(allForBezier.length - 1, i + 2)];
          const tension = 0.25;
          const cp1x = p1.x + (p2.x - p0.x) * tension;
          const cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
          const cp2x = p2.x - (p3.x - p1.x) * tension;
          const cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
        }
        forecastGoalPathD = d;
      }
      
      // === Streak detection: золотая линия между последовательными 🔥 днями ===
      // Находит индексы начала и конца последовательных идеальных дней
      const findStreakRanges = (pts) => {
        const ranges = [];
        let startIdx = -1;
        pts.forEach((p, i) => {
          if (p.isPerfect && p.kcal > 0) {
            if (startIdx === -1) startIdx = i;
          } else {
            if (startIdx !== -1 && i - startIdx >= 2) {
              ranges.push({ start: startIdx, end: i - 1 });
            }
            startIdx = -1;
          }
        });
        // Последний streak
        if (startIdx !== -1 && pts.length - startIdx >= 2) {
          ranges.push({ start: startIdx, end: pts.length - 1 });
        }
        return ranges;
      };
      
      // Извлекает сегмент пути между индексами, используя ТЕ ЖЕ контрольные точки
      // С monotonic constraint для предотвращения overshooting
      const extractPathSegment = (allPts, startIdx, endIdx, yKey = 'y') => {
        if (startIdx >= endIdx) return '';
        
        let d = `M${allPts[startIdx].x},${allPts[startIdx][yKey]}`;
        for (let i = startIdx; i < endIdx; i++) {
          // Используем ВСЕ точки для расчёта контрольных точек (как в основном пути)
          const p0 = allPts[Math.max(0, i - 1)];
          const p1 = allPts[i];
          const p2 = allPts[i + 1];
          const p3 = allPts[Math.min(allPts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1[yKey] + (p2[yKey] - p0[yKey]) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2[yKey] - (p3[yKey] - p1[yKey]) * tension;
          
          // Monotonic constraint
          const minY = Math.min(p1[yKey], p2[yKey]);
          const maxY = Math.max(p1[yKey], p2[yKey]);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2[yKey]}`;
        }
        return d;
      };
      
      const streakRanges = findStreakRanges(points);
      
      // Вычисляем длину каждого streak-сегмента и задержку анимации
      const lineDrawDuration = 3; // секунд — должно совпадать с анимацией основной линии
      const streakData = streakRanges.map(range => {
        const path = extractPathSegment(points, range.start, range.end, 'y');
        
        // Длина streak-сегмента
        let segmentLength = 0;
        for (let i = range.start; i < range.end; i++) {
          const p0 = points[Math.max(0, i - 1)];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[Math.min(points.length - 1, i + 2)];
          const tension = 0.25;
          const cp1 = { x: p1.x + (p2.x - p0.x) * tension, y: p1.y + (p2.y - p0.y) * tension };
          const cp2 = { x: p2.x - (p3.x - p1.x) * tension, y: p2.y - (p3.y - p1.y) * tension };
          segmentLength += bezierLength({ x: p1.x, y: p1.y }, cp1, cp2, { x: p2.x, y: p2.y });
        }
        
        // Задержка = когда основная линия достигает начала streak
        const startProgress = cumulativeLengths[range.start] / totalPathLength;
        const animDelay = startProgress * lineDrawDuration;
        
        // Длительность = пропорционально длине сегмента относительно общей длины
        const segmentDuration = (segmentLength / totalPathLength) * lineDrawDuration;
        
        return { path, segmentLength, animDelay, segmentDuration };
      });
      
      // Для совместимости оставляем streakPaths
      const streakPaths = streakData.map(d => d.path);
      
      // Определяем цвет точки по ratio — используем централизованный ratioZones
      const rz = HEYS.ratioZones;
      const getDotColor = (ratio) => {
        return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
      };
      
      // Полный плавный путь области между двумя кривыми
      // С monotonic constraint для предотвращения overshooting
      const buildFullAreaPath = (pts) => {
        if (pts.length < 2) return '';
        
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.y + (p2.y - p0.y) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.y - (p3.y - p1.y) * tension;
          
          // Monotonic constraint
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }
        
        d += ` L${pts[pts.length - 1].x},${pts[pts.length - 1].targetY}`;
        
        for (let i = pts.length - 1; i > 0; i--) {
          const p0 = pts[Math.min(pts.length - 1, i + 1)];
          const p1 = pts[i];
          const p2 = pts[i - 1];
          const p3 = pts[Math.max(0, i - 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.targetY + (p2.targetY - p0.targetY) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.targetY - (p3.targetY - p1.targetY) * tension;
          
          // Monotonic constraint for targetY
          const minTY = Math.min(p1.targetY, p2.targetY);
          const maxTY = Math.max(p1.targetY, p2.targetY);
          const marginT = (maxTY - minTY) * 0.15;
          cp1y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp1y));
          cp2y = Math.max(minTY - marginT, Math.min(maxTY + marginT, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.targetY}`;
        }
        
        d += ' Z';
        return d;
      };
      
      const fullAreaPath = buildFullAreaPath(points);
      
      // === 1. Goal Achievement % — процент дней в норме ===
      const successDays = points.filter(p => p.kcal > 0 && p.isPerfect).length;
      const totalDaysWithData = points.filter(p => p.kcal > 0).length;
      const goalAchievementPct = totalDaysWithData > 0 
        ? Math.round((successDays / totalDaysWithData) * 100) 
        : 0;
      
      // === 2. Confidence interval для прогноза ===
      // Стандартное отклонение калорий за период
      const avgKcal = points.length > 0 
        ? points.reduce((s, p) => s + p.kcal, 0) / points.length 
        : 0;
      const variance = points.length > 1 
        ? points.reduce((s, p) => s + Math.pow(p.kcal - avgKcal, 2), 0) / (points.length - 1) 
        : 0;
      const stdDev = Math.sqrt(variance);
      // Коридор: ±1 стандартное отклонение (≈68% уверенность)
      const confidenceMargin = Math.min(stdDev * 0.7, 300); // макс ±300 ккал
      
      // === 3. Weekend ranges для shading ===
      const weekendRanges = [];
      let weekendStart = null;
      points.forEach((p, i) => {
        if (p.isWeekend) {
          if (weekendStart === null) weekendStart = i;
        } else {
          if (weekendStart !== null) {
            weekendRanges.push({ start: weekendStart, end: i - 1 });
            weekendStart = null;
          }
        }
      });
      // Последний weekend
      if (weekendStart !== null) {
        weekendRanges.push({ start: weekendStart, end: points.length - 1 });
      }
      
      // Определяем цвет для каждой точки — используем градиент из ratioZones
      const getPointColor = (ratio) => {
        return rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
      };
      
      // Создаём горизонтальный градиент с цветами по точкам
      const gradientStops = points.map((p, i) => {
        const ratio = p.target > 0 ? p.kcal / p.target : 0;
        const color = getPointColor(ratio);
        const offset = points.length > 1 ? (i / (points.length - 1)) * 100 : 50;
        return { offset, color };
      });
      
      // === Pointer events для slider ===
      const handlePointerMove = (e) => {
        // Если идёт brush — обновляем диапазон
        if (brushing && brushStartRef.current !== null) {
          const svg = e.currentTarget;
          const rect = svg.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (width / rect.width);
          const nearestIdx = points.reduce((prevIdx, curr, idx) => 
            Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);
          
          const startIdx = brushStartRef.current;
          setBrushRange({
            start: Math.min(startIdx, nearestIdx),
            end: Math.max(startIdx, nearestIdx)
          });
          return;
        }
        
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        
        // Найти ближайшую точку (только основные, не прогноз)
        const nearest = points.reduce((prev, curr) => 
          Math.abs(curr.x - x) < Math.abs(prev.x - x) ? curr : prev
        );
        
        // Haptic при смене точки
        if (sliderPrevPointRef.current !== nearest) {
          sliderPrevPointRef.current = nearest;
          haptic('selection');
        }
        
        setSliderPoint(nearest);
      };
      
      const handlePointerLeave = () => {
        setSliderPoint(null);
        sliderPrevPointRef.current = null;
      };
      
      // === Brush selection handlers ===
      const handleBrushStart = (e) => {
        // Только при долгом нажатии или с Shift
        if (!e.shiftKey && e.pointerType !== 'touch') return;
        
        e.preventDefault();
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const nearestIdx = points.reduce((prevIdx, curr, idx) => 
          Math.abs(curr.x - x) < Math.abs(points[prevIdx].x - x) ? idx : prevIdx, 0);
        
        brushStartRef.current = nearestIdx;
        setBrushing(true);
        setBrushRange({ start: nearestIdx, end: nearestIdx });
        haptic('light');
      };
      
      const handleBrushEnd = () => {
        if (brushing && brushRange && brushRange.start !== brushRange.end) {
          haptic('medium');
          // Brush завершён — можно показать статистику по диапазону
        }
        setBrushing(false);
        brushStartRef.current = null;
      };
      
      const clearBrush = () => {
        setBrushRange(null);
        setBrushing(false);
        brushStartRef.current = null;
      };
      
      // === Pinch zoom handlers ===
      const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          sparklineZoomRef.current.initialDistance = Math.hypot(dx, dy);
          sparklineZoomRef.current.initialZoom = sparklineZoom;
        }
      };
      
      const handleTouchMove = (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const distance = Math.hypot(dx, dy);
          const initialDist = sparklineZoomRef.current.initialDistance;
          
          if (initialDist > 0) {
            const scale = distance / initialDist;
            const newZoom = Math.max(1, Math.min(3, sparklineZoomRef.current.initialZoom * scale));
            setSparklineZoom(newZoom);
          }
        }
      };
      
      const handleTouchEnd = () => {
        sparklineZoomRef.current.initialDistance = 0;
      };
      
      // Сброс zoom по двойному тапу
      const handleDoubleClick = () => {
        if (sparklineZoom > 1) {
          setSparklineZoom(1);
          setSparklinePan(0);
          haptic('light');
        }
      };
      
      // === Точка "сегодня" ===
      const todayPoint = points.find(p => p.isToday);
      
      // === Статистика выбранного диапазона (brush) ===
      const brushStats = brushRange && brushRange.start !== brushRange.end ? (() => {
        const rangePoints = points.slice(brushRange.start, brushRange.end + 1);
        const totalKcal = rangePoints.reduce((s, p) => s + p.kcal, 0);
        const avgKcal = Math.round(totalKcal / rangePoints.length);
        const avgRatio = rangePoints.reduce((s, p) => s + p.ratio, 0) / rangePoints.length;
        const daysInRange = rangePoints.length;
        return { totalKcal, avgKcal, avgRatio, daysInRange };
      })() : null;
      
      // Класс для Goal Achievement badge
      const goalBadgeClass = 'sparkline-goal-badge' + 
        (goalAchievementPct >= 70 ? '' : goalAchievementPct >= 40 ? ' goal-low' : ' goal-critical');
      
      return React.createElement('div', { 
        className: 'sparkline-container' + (sparklineZoom > 1 ? ' sparkline-zoomed' : ''),
        style: { position: 'relative', overflow: 'hidden' },
        ref: (el) => {
          // Вызываем Twemoji после рендера для foreignObject
          if (el && window.applyTwemoji) {
            setTimeout(() => window.applyTwemoji(el), 50);
          }
        }
      },
      // Goal Achievement Badge перенесён в header (kcal-sparkline-header)
      // === Brush Stats Badge (при выборе диапазона) ===
      brushStats && React.createElement('div', {
        className: 'sparkline-brush-stats',
        onClick: clearBrush
      },
        React.createElement('span', { className: 'brush-days' }, brushStats.daysInRange + ' дн'),
        React.createElement('span', { className: 'brush-avg' }, 'Ø ' + brushStats.avgKcal + ' ккал'),
        React.createElement('span', { 
          className: 'brush-ratio',
          style: { backgroundColor: rz ? rz.getGradientColor(brushStats.avgRatio, 0.9) : '#22c55e' }
        }, Math.round(brushStats.avgRatio * 100) + '%'),
        React.createElement('span', { className: 'brush-close' }, '✕')
      ),
      // === Zoom indicator ===
      sparklineZoom > 1 && React.createElement('div', {
        className: 'sparkline-zoom-indicator',
        onClick: handleDoubleClick
      }, Math.round(sparklineZoom * 100) + '%'),
      React.createElement('svg', { 
        className: 'sparkline-svg animate-always',
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'none',
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
        onPointerDown: handleBrushStart,
        onPointerUp: handleBrushEnd,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onDoubleClick: handleDoubleClick,
        style: { 
          touchAction: sparklineZoom > 1 ? 'pan-x' : 'none', 
          height: height + 'px',
          transform: sparklineZoom > 1 ? `scale(${sparklineZoom}) translateX(${sparklinePan}%)` : 'none',
          transformOrigin: 'center center'
        }
      },
        // Градиенты с цветами по точкам (для области и линии)
        React.createElement('defs', null,
          // Градиент для заливки области (с прозрачностью)
          React.createElement('linearGradient', { id: 'kcalAreaGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 0.25 
              })
            )
          ),
          // Градиент для линии (полная яркость) — цвета по ratio zones
          React.createElement('linearGradient', { id: 'kcalLineGradient', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            gradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 1 
              })
            )
          )
        ),
        // Заливка области с градиентом (анимированная)
        React.createElement('path', {
          d: fullAreaPath,
          fill: 'url(#kcalAreaGradient)',
          className: 'sparkline-area-animated'
        }),
        // Линия цели (плавная пунктирная)
        React.createElement('path', {
          d: goalPathD,
          className: 'sparkline-goal',
          fill: 'none'
        }),
        // Линия графика с градиентом по ratio zones
        React.createElement('path', {
          d: pathD,
          className: 'sparkline-line',
          style: { 
            stroke: 'url(#kcalLineGradient)',
            strokeDasharray: totalPathLength, 
            strokeDashoffset: totalPathLength 
          }
        }),
        // Золотые streak-линии между 🔥 днями (анимируются синхронно с основной линией)
        streakData.map((data, i) => 
          React.createElement('path', {
            key: 'streak-' + i,
            d: data.path,
            className: 'sparkline-streak-line sparkline-streak-animated',
            style: {
              strokeDasharray: data.segmentLength,
              strokeDashoffset: data.segmentLength,
              animationDelay: data.animDelay + 's',
              animationDuration: data.segmentDuration + 's'
            }
          })
        ),
        // Прогнозная линия калорий — маска для анимации + пунктир
        forecastPathD && React.createElement('g', { key: 'forecast-group' },
          // Маска: сплошная линия которая рисуется
          React.createElement('defs', null,
            React.createElement('mask', { id: 'forecastMask' },
              React.createElement('path', {
                d: forecastPathD,
                fill: 'none',
                stroke: 'white',
                strokeWidth: 4,
                strokeLinecap: 'round',
                strokeDasharray: forecastPathLength,
                strokeDashoffset: forecastPathLength,
                className: 'sparkline-forecast-mask'
              })
            )
          ),
          // Видимая пунктирная линия под маской
          React.createElement('path', {
            d: forecastPathD,
            fill: 'none',
            stroke: forecastColor,
            strokeWidth: 2,
            strokeDasharray: '6 4',
            strokeOpacity: 0.7,
            strokeLinecap: 'round',
            mask: 'url(#forecastMask)'
          })
        ),
        // Прогнозная линия нормы (цели)
        forecastGoalPathD && React.createElement('path', {
          key: 'forecast-goal-line',
          d: forecastGoalPathD,
          fill: 'none',
          stroke: 'rgba(148, 163, 184, 0.7)', // серый slate-400
          strokeWidth: 1.5,
          strokeDasharray: '4 3',
          strokeLinecap: 'round'
        }),
        // === Confidence interval для прогноза (коридор ±σ) — заливка области ===
        forecastPts.length > 0 && confidenceMargin > 50 && (() => {
          // Строим path для области: верхняя граница → нижняя граница (обратно)
          const marginPx = (confidenceMargin / scaleRange) * chartHeight;
          
          // Верхняя линия (слева направо)
          const upperPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.max(paddingTop, p.y - marginPx)
          }));
          
          // Нижняя линия (справа налево)
          const lowerPoints = forecastPts.map(p => ({
            x: p.x,
            y: Math.min(paddingTop + chartHeight, p.y + marginPx)
          })).reverse();
          
          // Добавляем начальную точку от последней реальной точки
          const lastRealPoint = points[points.length - 1];
          const startX = lastRealPoint ? lastRealPoint.x : forecastPts[0].x;
          
          // Строим path
          let areaPath = 'M ' + startX + ' ' + upperPoints[0].y;
          upperPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          lowerPoints.forEach(p => { areaPath += ' L ' + p.x + ' ' + p.y; });
          areaPath += ' Z';
          
          return React.createElement('path', {
            key: 'confidence-area',
            d: areaPath,
            fill: forecastColor,
            fillOpacity: 0.08,
            stroke: 'none'
          });
        })(),
        // Точки прогноза (с цветом по тренду) — появляются после прогнозной линии
        forecastPts.map((p, i) => {
          // Задержка = 3с (основная линия) + время до этой точки в прогнозе
          const forecastDelay = 3 + (i + 1) / forecastPts.length * Math.max(0.5, (forecastPathLength / totalPathLength) * 3);
          return React.createElement('circle', {
            key: 'forecast-dot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isTodayForecast ? 4 : 3, // сегодня крупнее
            className: 'sparkline-dot sparkline-forecast-dot',
            style: {
              fill: forecastColor,
              opacity: 0, // начинаем скрытым
              '--delay': forecastDelay + 's',
              strokeDasharray: '2 2',
              stroke: forecastColor,
              strokeWidth: p.isTodayForecast ? 2 : 1
            }
          });
        }),
        // Метки прогнозных ккал над точками (бледные)
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          return React.createElement('text', {
            key: 'forecast-kcal-' + i,
            x: p.x,
            y: p.y - 8,
            className: 'sparkline-day-label' + (p.isTodayForecast ? ' sparkline-day-today' : ' sparkline-day-forecast'),
            textAnchor: isLast ? 'end' : 'middle',
            style: { opacity: p.isTodayForecast ? 0.7 : 0.5, fill: forecastColor }
          }, p.kcal);
        }),
        // Метки прогнозных дней (дата + "прогноз" выше в 2 строки)
        forecastPts.map((p, i) => {
          const isLast = i === forecastPts.length - 1;
          const isTomorrow = !p.isTodayForecast && i === 0;
          const isLabelMultiline = p.isTodayForecast || isTomorrow;
          const line1 = 'прогноз';
          const line2 = p.isTodayForecast ? 'на сегодня' : 'на завтра';
          
          return React.createElement('g', { key: 'forecast-day-' + i },
            // "прогноз" + "на сегодня/завтра" выше даты
            isLabelMultiline && React.createElement('text', {
              x: p.x,
              y: height - 18,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.8, fontSize: '7px' }
            }, line1),
            isLabelMultiline && React.createElement('text', {
              x: p.x,
              y: height - 11,
              className: 'sparkline-day-label sparkline-day-forecast',
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.8, fontSize: '7px' }
            }, line2),
            // Дата внизу
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: 'sparkline-day-label sparkline-day-forecast' + 
                (p.isWeekend ? ' sparkline-day-weekend' : ''),
              textAnchor: isLast ? 'end' : 'middle',
              style: { opacity: 0.8 }
            }, p.dayNum)
          );
        }),
        // Метки дней внизу + дельта для всех дней (дельта появляется синхронно с точкой)
        points.map((p, i) => {
          // Классы для выходных и сегодня
          let dayClass = 'sparkline-day-label';
          if (p.isToday) dayClass += ' sparkline-day-today';
          if (p.isWeekend) dayClass += ' sparkline-day-weekend';
          if (p.isUnknown) dayClass += ' sparkline-day-unknown';
          // Динамический anchor для крайних точек
          const isFirst = i === 0;
          const isLast = i === points.length - 1 && forecastPts.length === 0;
          const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
          
          // Дельта: разница между съеденным и нормой
          const delta = p.kcal - p.target;
          const deltaText = delta >= 0 ? '+' + Math.round(delta) : Math.round(delta);
          const ratio = p.target > 0 ? p.kcal / p.target : 0;
          const deltaColor = rz ? rz.getGradientColor(ratio, 1) : '#64748b';
          
          // Delay: все дельты и эмодзи появляются одновременно — взрыв от оси X
          const deltaDelay = 2.6; // все сразу
          
          return React.createElement('g', { key: 'day-group-' + i },
            // Дата
            React.createElement('text', {
              x: p.x,
              y: height - 2,
              className: dayClass,
              textAnchor: anchor,
              style: p.isUnknown ? { opacity: 0.5 } : {}
            }, p.dayNum),
            // Дельта под датой (для всех дней с данными, кроме unknown)
            p.kcal > 0 && !p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height + 10,
              className: 'sparkline-delta-label',
              textAnchor: anchor,
              style: { fill: deltaColor, '--delay': deltaDelay + 's' }
            }, deltaText),
            // Для unknown дней — показываем "?" вместо дельты
            p.isUnknown && React.createElement('text', {
              x: p.x,
              y: height + 10,
              className: 'sparkline-delta-label sparkline-delta-unknown',
              textAnchor: anchor,
              style: { fill: 'rgba(156, 163, 175, 0.6)', '--delay': deltaDelay + 's' }
            }, '—')
          );
        }),
        // Точки на все дни с hover и цветом по статусу (анимация с задержкой)
        // Weekly Rhythm — вертикальные сепараторы перед понедельниками (но не первым)
        points.filter((p, i) => i > 0 && p.dayOfWeek === 1).map((p, i) =>
          React.createElement('line', {
            key: 'week-sep-' + i,
            x1: p.x - 4,
            y1: paddingTop + 4,
            x2: p.x - 4,
            y2: height - paddingBottom - 4,
            className: 'sparkline-week-separator'
          })
        ),
        // Золотые пульсирующие точки для идеальных дней, иначе обычные точки
        // Точки появляются синхронно с рисованием линии (по реальной длине кривой Безье)
        (() => {
          const lineDrawDuration = 3; // секунд — должно совпадать с CSS animation
          const leadTime = 0.15; // точки появляются чуть раньше линии
          
          return points.map((p, i) => {
            const ratio = p.target > 0 ? p.kcal / p.target : 0;
            // Задержка пропорциональна реальной длине пути до точки
            const pathProgress = cumulativeLengths[i] / totalPathLength;
            const animDelay = Math.max(0, pathProgress * lineDrawDuration - leadTime);
          
            // Неизвестный день — серый кружок с "?"
            if (p.isUnknown) {
              return React.createElement('g', { key: 'unknown-' + i },
                React.createElement('circle', {
                  cx: p.x,
                  cy: p.y,
                  r: 6,
                  className: 'sparkline-dot sparkline-dot-unknown',
                  style: { 
                    cursor: 'pointer', 
                    '--delay': animDelay + 's',
                    fill: 'rgba(156, 163, 175, 0.3)',
                    stroke: 'rgba(156, 163, 175, 0.6)',
                    strokeWidth: 1.5,
                    strokeDasharray: '2 2'
                  },
                  onClick: (e) => {
                    e.stopPropagation();
                    haptic('light');
                    setSparklinePopup({ type: 'unknown', point: p, x: e.clientX, y: e.clientY });
                  }
                }),
                React.createElement('text', {
                  x: p.x,
                  y: p.y + 3,
                  textAnchor: 'middle',
                  className: 'sparkline-unknown-label',
                  style: { 
                    fill: 'rgba(156, 163, 175, 0.9)',
                    fontSize: '9px',
                    fontWeight: '600',
                    pointerEvents: 'none'
                  }
                }, '?')
              );
            }
          
            // Идеальный день — золотая пульсирующая точка
            if (p.isPerfect && p.kcal > 0) {
              return React.createElement('circle', {
                key: 'gold-' + i,
                cx: p.x,
                cy: p.y,
                r: p.isToday ? 5 : 4,
                className: 'sparkline-dot-gold' + (p.isToday ? ' sparkline-dot-gold-today' : ''),
                style: { cursor: 'pointer', '--delay': animDelay + 's' },
                onClick: (e) => {
                  e.stopPropagation();
                  haptic('medium');
                  setSparklinePopup({ type: 'perfect', point: p, x: e.clientX, y: e.clientY });
                }
              });
            }
          
            // Обычная точка — цвет через inline style из ratioZones
            const dotColor = rz ? rz.getGradientColor(ratio, 1) : '#22c55e';
          let dotClass = 'sparkline-dot';
          if (p.isToday) dotClass += ' sparkline-dot-today';
          
          return React.createElement('circle', {
            key: 'dot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isToday ? 4 : 2.5,
            className: dotClass,
            style: { cursor: 'pointer', '--delay': animDelay + 's', fill: dotColor },
            onClick: (e) => {
              e.stopPropagation();
              haptic('light');
              setSparklinePopup({ type: 'kcal', point: p, x: e.clientX, y: e.clientY });
            }
          },
            React.createElement('title', null, p.dayNum + ': ' + p.kcal + ' / ' + p.target + ' ккал')
          );
        });
        })(),
        // Пунктирные линии от точек к меткам дней (появляются синхронно с точкой)
        points.map((p, i) => {
          if (p.kcal <= 0) return null;
          const pathProgress = cumulativeLengths[i] / totalPathLength;
          const lineDelay = Math.max(0, pathProgress * 3 - 0.15);
          return React.createElement('line', {
            key: 'point-line-' + i,
            x1: p.x,
            y1: p.y + 6, // от точки
            x2: p.x,
            y2: height - paddingBottom + 6, // до меток дней
            className: 'sparkline-point-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — пунктирные линии вниз к точкам (появляются синхронно с точкой)
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          const lineDelay = 2.6; // все сразу
          return React.createElement('line', {
            key: 'train-line-' + i,
            x1: p.x,
            y1: 6, // от верхней линии
            x2: p.x,
            y2: p.y - 6, // до точки
            className: 'sparkline-training-line',
            style: { '--delay': lineDelay + 's' }
          });
        }).filter(Boolean),
        // Аннотации тренировок — иконки в одну линию сверху
        // Используем SVG <image> с Twemoji CDN напрямую
        points.map((p, i) => {
          if (!p.hasTraining || !p.trainingTypes.length) return null;
          // Маппинг типов на Twemoji codepoints
          const typeCodepoint = { 
            cardio: '1f3c3',      // 🏃
            strength: '1f3cb',    // 🏋️ (без -fe0f!)
            hobby: '26bd'         // ⚽
          };
          const emojiDelay = 2.6;
          const emojiSize = 16;
          const emojiCount = p.trainingTypes.length;
          const totalWidth = emojiCount * emojiSize;
          const startX = p.x - totalWidth / 2;
          
          return React.createElement('g', {
            key: 'train-' + i,
            className: 'sparkline-annotation sparkline-annotation-training',
            style: { '--delay': emojiDelay + 's' }
          },
            p.trainingTypes.map((t, j) => {
              const code = typeCodepoint[t] || '1f3c3';
              const url = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/' + code + '.svg';
              return React.createElement('image', {
                key: j,
                href: url,
                x: startX + j * emojiSize,
                y: 1,
                width: emojiSize,
                height: emojiSize
              });
            })
          );
        }).filter(Boolean),
        // Слайдер — вертикальная линия
        sliderPoint && React.createElement('line', {
          key: 'slider-line',
          x1: sliderPoint.x,
          y1: paddingTop,
          x2: sliderPoint.x,
          y2: height - paddingBottom + 2,
          className: 'sparkline-slider-line'
        }),
        // Слайдер — увеличенная точка
        sliderPoint && React.createElement('circle', {
          key: 'slider-point',
          cx: sliderPoint.x,
          cy: sliderPoint.y,
          r: 6,
          className: 'sparkline-slider-point'
        }),
        // === TODAY LINE — вертикальная линия на сегодня ===
        todayPoint && React.createElement('g', { key: 'today-line-group' },
          // Полупрозрачная полоса
          React.createElement('rect', {
            x: todayPoint.x - 1.5,
            y: paddingTop,
            width: 3,
            height: chartHeight,
            className: 'sparkline-today-line',
            fill: 'rgba(59, 130, 246, 0.2)'
          }),
          // Процент отклонения от нормы (ближе к точке, под графиком)
          todayPoint.target > 0 && React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 18,
            textAnchor: 'middle',
            className: 'sparkline-today-pct',
            style: { 
              fill: rz ? rz.getGradientColor(todayPoint.kcal / todayPoint.target, 1) : '#22c55e', 
              fontSize: '9px', 
              fontWeight: '700'
            }
          }, (() => {
            const deviation = Math.round((todayPoint.kcal / todayPoint.target - 1) * 100);
            return deviation >= 0 ? '+' + deviation + '%' : deviation + '%';
          })()),
          // Метка "сегодня" — стрелка (над точкой)
          React.createElement('text', {
            x: todayPoint.x,
            y: todayPoint.y - 8,
            textAnchor: 'middle',
            className: 'sparkline-today-label',
            style: { fill: 'rgba(59, 130, 246, 0.9)', fontSize: '8px', fontWeight: '600' }
          }, '▼')
        ),
        // === BRUSH SELECTION — полоса выбора диапазона ===
        brushRange && points[brushRange.start] && points[brushRange.end] && React.createElement('rect', {
          key: 'brush-overlay',
          x: Math.min(points[brushRange.start].x, points[brushRange.end].x),
          y: paddingTop,
          width: Math.abs(points[brushRange.end].x - points[brushRange.start].x),
          height: chartHeight,
          className: 'sparkline-brush-overlay',
          fill: 'rgba(59, 130, 246, 0.12)',
          stroke: 'rgba(59, 130, 246, 0.4)',
          strokeWidth: 1,
          rx: 2
        })
      ),
      // Glassmorphism тултип для слайдера (компактный)
      sliderPoint && React.createElement('div', {
        className: 'sparkline-slider-tooltip',
        style: {
          left: Math.min(Math.max(sliderPoint.x, 60), width - 60) + 'px',
          transform: 'translateX(-50%)'
        }
      },
        // Header: дата + badge процент
        React.createElement('div', { className: 'sparkline-slider-tooltip-header' }, 
          React.createElement('span', { className: 'sparkline-slider-tooltip-date' }, 
            (() => {
              if (sliderPoint.isForecast) return sliderPoint.dayNum + ' П';
              const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
              const wd = weekDays[sliderPoint.dayOfWeek] || '';
              return sliderPoint.dayNum + ' ' + wd;
            })()
          ),
          sliderPoint.ratio && React.createElement('span', { 
            className: 'sparkline-slider-tooltip-ratio',
            style: { backgroundColor: rz ? rz.getGradientColor(sliderPoint.ratio, 0.9) : '#22c55e' }
          }, Math.round(sliderPoint.ratio * 100) + '%')
        ),
        // Калории
        React.createElement('div', { className: 'sparkline-slider-tooltip-kcal' }, 
          sliderPoint.kcal + ' ',
          React.createElement('small', null, '/ ' + sliderPoint.target)
        ),
        // Теги: сон, оценка сна, тренировка, шаги, оценка дня
        (sliderPoint.sleepHours > 0 || sliderPoint.sleepQuality > 0 || sliderPoint.dayScore > 0 || sliderPoint.trainingMinutes > 0 || sliderPoint.steps > 0) &&
          React.createElement('div', { className: 'sparkline-slider-tooltip-tags' },
            // Сон
            sliderPoint.sleepHours > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag' + (sliderPoint.sleepHours < 6 ? ' bad' : '')
              }, 'Сон: ' + sliderPoint.sleepHours.toFixed(1) + 'ч'),
            // Оценка сна (1-10) — динамический цвет
            sliderPoint.sleepQuality > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag',
                style: { 
                  backgroundColor: sliderPoint.sleepQuality <= 3 ? '#ef4444' : 
                                   sliderPoint.sleepQuality <= 5 ? '#f97316' : 
                                   sliderPoint.sleepQuality <= 7 ? '#eab308' : '#22c55e',
                  color: sliderPoint.sleepQuality <= 5 ? '#fff' : '#000'
                }
              }, 'Оценка сна: ' + sliderPoint.sleepQuality),
            // Тренировка
            sliderPoint.trainingMinutes > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag good'
              }, 'Тренировка: ' + sliderPoint.trainingMinutes + 'м'),
            // Шаги
            sliderPoint.steps > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag' + (sliderPoint.steps >= 10000 ? ' good' : '')
              }, 'Шаги: ' + sliderPoint.steps.toLocaleString()),
            // Оценка дня (1-10) — динамический цвет
            sliderPoint.dayScore > 0 && 
              React.createElement('span', { 
                className: 'sparkline-slider-tooltip-tag',
                style: { 
                  backgroundColor: sliderPoint.dayScore <= 3 ? '#ef4444' : 
                                   sliderPoint.dayScore <= 5 ? '#f97316' : 
                                   sliderPoint.dayScore <= 7 ? '#eab308' : '#22c55e',
                  color: sliderPoint.dayScore <= 5 ? '#fff' : '#000'
                }
              }, 'Оценка дня: ' + sliderPoint.dayScore)
          )
      ),
      // Полоса оценки дня (dayScore) под графиком
      (() => {
        // Используем исходные data (до фильтрации excludeFromChart), чтобы включить сегодня
        const allDaysWithScore = data.filter(d => d.dayScore > 0);
        const hasDayScoreData = allDaysWithScore.length > 0;
        
        if (hasDayScoreData) {
          // Полоса с градиентом по dayScore (1-10)
          const getDayScoreColor = (score) => {
            if (!score || score <= 0) return 'transparent'; // нет данных — прозрачный пропуск
            if (score <= 3) return '#ef4444'; // 😢 плохо — красный
            if (score <= 5) return '#f97316'; // 😐 средне — оранжевый
            if (score <= 7) return '#eab308'; // 🙂 нормально — жёлтый
            return '#22c55e'; // 😊 хорошо — зелёный
          };
          
          // Используем все дни из data для градиента (включая сегодня)
          const moodStops = data.map((d, i) => ({
            offset: data.length > 1 ? (i / (data.length - 1)) * 100 : 50,
            color: getDayScoreColor(d.dayScore)
          }));
          
          // Бар заканчивается на сегодня, справа место для надписи
          // Вычисляем ширину бара: data.length дней из totalPoints (включая прогноз)
          const barWidthPct = totalPoints > 1 ? ((data.length) / totalPoints) * 100 : 85;
          
          return React.createElement('div', { className: 'sparkline-mood-container' },
            React.createElement('div', { 
              className: 'sparkline-mood-bar-modern',
              style: { 
                width: barWidthPct + '%',
                background: 'linear-gradient(to right, ' + 
                  moodStops.map(s => s.color + ' ' + s.offset + '%').join(', ') + ')'
              }
            }),
            React.createElement('span', { 
              className: 'sparkline-mood-label',
              style: { textAlign: 'right', lineHeight: '1.1', fontSize: '8px' }
            }, 
              React.createElement('span', null, 'Оценка'),
              React.createElement('br'),
              React.createElement('span', null, 'дня')
            )
          );
        }
        
        // Fallback: Mini heatmap калорий
        return React.createElement('div', { className: 'sparkline-heatmap' },
          points.map((p, i) => {
            const ratio = p.target > 0 ? p.kcal / p.target : 0;
            let level;
            if (ratio === 0) level = 0;
            else if (ratio < 0.5) level = 1;
            else if (ratio < 0.8) level = 2;
            else if (ratio < 0.95) level = 3;
            else if (ratio <= 1.05) level = 4;
            else if (ratio <= 1.15) level = 5;
            else level = 6;
            
            return React.createElement('div', {
              key: 'hm-' + i,
              className: 'sparkline-heatmap-cell level-' + level,
              title: p.dayNum + ': ' + Math.round(ratio * 100) + '%'
            });
          })
        );
      })()
      // Ряд индикаторов сна убран — информация дублируется с баром "Оценка дня"
    );
    };
    
    // SVG Sparkline для веса
    const renderWeightSparkline = (data, trend) => {
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
      
      // Если только 1 точка — показываем её с подсказкой
      if (data.length === 1) {
        const point = data[0];
        return React.createElement('div', { className: 'weight-single-point' },
          React.createElement('div', { className: 'weight-single-value' },
            React.createElement('span', { className: 'weight-single-number' }, point.weight),
            React.createElement('span', { className: 'weight-single-unit' }, ' кг')
          ),
          React.createElement('div', { className: 'weight-single-hint' },
            'Добавьте вес завтра для отслеживания тренда'
          )
        );
      }
      
      // Прогноз на +1 день (завтра) по тренду последних 3 точек
      const forecastDays = 1;
      let forecastPoint = null;
      if (data.length >= 3) {
        const lastDays = data.slice(-3);
        const avgChange = (lastDays[2].weight - lastDays[0].weight) / 2;
        const lastWeight = data[data.length - 1].weight;
        const lastDate = data[data.length - 1].date;
        if (lastDate) {
          const forecastDate = new Date(lastDate);
          forecastDate.setDate(forecastDate.getDate() + 1);
          forecastPoint = {
            weight: +(lastWeight + avgChange).toFixed(1),
            date: forecastDate.toISOString().slice(0, 10),
            dayNum: forecastDate.getDate(),
            isForecast: true
          };
        }
      }
      
      const width = 360;
      const height = 120; // оптимальный размер графика
      const paddingTop = 16; // для меток веса над точками
      const paddingBottom = 16;
      const paddingX = 8; // минимальные отступы — точки почти у края
      const chartHeight = height - paddingTop - paddingBottom;
      
      // Масштаб с минимумом 1 кг range (включая прогноз)
      const allWeights = [...data.map(d => d.weight), ...(forecastPoint ? [forecastPoint.weight] : [])];
      const minWeight = Math.min(...allWeights);
      const maxWeight = Math.max(...allWeights);
      const rawRange = maxWeight - minWeight;
      const range = Math.max(1, rawRange + 0.5);
      const adjustedMin = minWeight - 0.25;
      
      const totalPoints = data.length + (forecastPoint ? 1 : 0);
      
      const points = data.map((d, i) => {
        const x = paddingX + (i / (totalPoints - 1)) * (width - paddingX * 2);
        const y = paddingTop + chartHeight - ((d.weight - adjustedMin) / range) * chartHeight;
        return { x, y, weight: d.weight, isToday: d.isToday, dayNum: d.dayNum, date: d.date };
      });
      
      // Точка прогноза
      let forecastPt = null;
      if (forecastPoint) {
        const idx = data.length;
        const x = paddingX + (idx / (totalPoints - 1)) * (width - paddingX * 2);
        const y = paddingTop + chartHeight - ((forecastPoint.weight - adjustedMin) / range) * chartHeight;
        forecastPt = { x, y, ...forecastPoint };
      }
      
      // Плавная кривая (как у калорий) с monotonic constraint
      const smoothPath = (pts) => {
        if (pts.length < 2) return '';
        if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
        
        let d = `M${pts[0].x},${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[Math.min(pts.length - 1, i + 2)];
          
          const tension = 0.25;
          let cp1x = p1.x + (p2.x - p0.x) * tension;
          let cp1y = p1.y + (p2.y - p0.y) * tension;
          let cp2x = p2.x - (p3.x - p1.x) * tension;
          let cp2y = p2.y - (p3.y - p1.y) * tension;
          
          // Monotonic constraint — ограничиваем overshooting
          const minY = Math.min(p1.y, p2.y);
          const maxY = Math.max(p1.y, p2.y);
          const margin = (maxY - minY) * 0.15;
          cp1y = Math.max(minY - margin, Math.min(maxY + margin, cp1y));
          cp2y = Math.max(minY - margin, Math.min(maxY + margin, cp2y));
          
          d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
        }
        return d;
      };
      
      const pathD = smoothPath(points);
      
      // Определяем тренд: сравниваем первую и последнюю половину
      const firstHalf = points.slice(0, Math.ceil(points.length / 2));
      const secondHalf = points.slice(Math.floor(points.length / 2));
      const avgFirst = firstHalf.reduce((s, p) => s + p.weight, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, p) => s + p.weight, 0) / secondHalf.length;
      const weightTrend = avgSecond - avgFirst; // положительный = вес растёт
      
      // Цвет градиента по тренду
      const trendColor = weightTrend <= -0.1 ? '#22c55e' : (weightTrend >= 0.1 ? '#ef4444' : '#8b5cf6');
      
      // Цвет прогноза (по направлению тренда)
      const forecastColor = forecastPt 
        ? (forecastPt.weight < points[points.length - 1].weight ? '#22c55e' : 
           forecastPt.weight > points[points.length - 1].weight ? '#ef4444' : '#8b5cf6')
        : trendColor;
      
      // Область под графиком (с плавными границами)
      const areaPath = pathD + ` L${points[points.length-1].x},${paddingTop + chartHeight} L${points[0].x},${paddingTop + chartHeight} Z`;
      
      // Gradient stops для линии веса — по локальному тренду каждой точки
      // Зелёный = вес снижается, красный = вес растёт, фиолетовый = стабильно
      const weightLineGradientStops = points.map((p, i) => {
        const prevWeight = i > 0 ? points[i-1].weight : p.weight;
        const localTrend = p.weight - prevWeight;
        const dotColor = localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#8b5cf6');
        const offset = points.length > 1 ? (i / (points.length - 1)) * 100 : 50;
        return { offset, color: dotColor };
      });
      
      // Прогнозная линия (от последней точки к прогнозу) — плавная Bezier
      let forecastLineD = '';
      if (forecastPt && points.length >= 2) {
        // Берём 2 последние точки для плавного продолжения
        const prev2Point = points[points.length - 2];
        const lastPoint = points[points.length - 1];
        
        // Массив для расчёта касательных
        const allForBezier = [prev2Point, lastPoint, forecastPt];
        
        // Строим Bezier от lastPoint к forecastPt
        const p0 = allForBezier[0];
        const p1 = allForBezier[1];
        const p2 = allForBezier[2];
        const tension = 0.25;
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p2.x - p1.x) * tension;
        const cp2y = p2.y - (p2.y - p1.y) * tension;
        forecastLineD = `M${p1.x},${p1.y} C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }
      
      return React.createElement('svg', { 
        className: 'weight-sparkline-svg animate-always',
        viewBox: '0 0 ' + width + ' ' + height,
        preserveAspectRatio: 'none', // растягиваем по всей ширине
        style: { height: height + 'px' } // явная высота
      },
        // Градиенты для веса
        React.createElement('defs', null,
          // Вертикальный градиент для заливки области
          React.createElement('linearGradient', { id: 'weightAreaGrad', x1: '0', y1: '0', x2: '0', y2: '1' },
            React.createElement('stop', { offset: '0%', stopColor: trendColor, stopOpacity: '0.25' }),
            React.createElement('stop', { offset: '100%', stopColor: trendColor, stopOpacity: '0.05' })
          ),
          // Горизонтальный градиент для линии — цвета по локальному тренду
          React.createElement('linearGradient', { id: 'weightLineGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
            weightLineGradientStops.map((stop, i) => 
              React.createElement('stop', { 
                key: i, 
                offset: stop.offset + '%', 
                stopColor: stop.color, 
                stopOpacity: 1 
              })
            )
          )
        ),
        // Заливка под графиком (анимированная)
        React.createElement('path', {
          d: areaPath,
          fill: 'url(#weightAreaGrad)',
          className: 'weight-sparkline-area sparkline-area-animated'
        }),
        // Линия графика с градиентом по тренду
        React.createElement('path', {
          d: pathD,
          className: 'weight-sparkline-line weight-sparkline-line-animated',
          style: { stroke: 'url(#weightLineGrad)' }
        }),
        // Прогнозная линия (пунктирная) — с маской для анимации
        forecastPt && forecastLineD && React.createElement('g', { key: 'weight-forecast-group' },
          // Маска: сплошная линия которая рисуется после основной
          React.createElement('defs', null,
            React.createElement('mask', { id: 'weightForecastMask' },
              React.createElement('path', {
                d: forecastLineD,
                fill: 'none',
                stroke: 'white',
                strokeWidth: 4,
                strokeLinecap: 'round',
                strokeDasharray: 200,
                strokeDashoffset: 200,
                className: 'weight-sparkline-forecast-mask'
              })
            )
          ),
          // Видимая пунктирная линия под маской
          React.createElement('path', {
            d: forecastLineD,
            fill: 'none',
            stroke: forecastColor,
            strokeWidth: 2,
            strokeDasharray: '4 3',
            strokeOpacity: 0.6,
            strokeLinecap: 'round',
            mask: 'url(#weightForecastMask)'
          })
        ),
        // === Confidence interval для прогноза веса (±0.3 кг) ===
        forecastPt && (() => {
          const confidenceKg = 0.3; // ±300г погрешность
          const marginPx = (confidenceKg / range) * chartHeight;
          const lastPt = points[points.length - 1];
          if (!lastPt) return null;
          
          const upperY = Math.max(paddingTop, forecastPt.y - marginPx);
          const lowerY = Math.min(paddingTop + chartHeight, forecastPt.y + marginPx);
          
          // Треугольная область от последней точки к прогнозу
          const areaPath = `M ${lastPt.x} ${lastPt.y} L ${forecastPt.x} ${upperY} L ${forecastPt.x} ${lowerY} Z`;
          
          return React.createElement('path', {
            key: 'weight-confidence-area',
            d: areaPath,
            fill: forecastColor,
            fillOpacity: 0.1,
            stroke: 'none'
          });
        })(),
        // === TODAY LINE для веса ===
        (() => {
          const todayPt = points.find(p => p.isToday);
          if (!todayPt) return null;
          
          // Изменение веса с первой точки периода
          const firstWeight = points[0]?.weight || todayPt.weight;
          const weightChange = todayPt.weight - firstWeight;
          const changeText = weightChange >= 0 ? '+' + weightChange.toFixed(1) : weightChange.toFixed(1);
          const changeColor = weightChange < -0.05 ? '#22c55e' : (weightChange > 0.05 ? '#ef4444' : '#8b5cf6');
          
          return React.createElement('g', { key: 'weight-today-line-group' },
            // Изменение веса над точкой (выше)
            React.createElement('text', {
              x: todayPt.x,
              y: todayPt.y - 26,
              textAnchor: 'middle',
              style: { 
                fill: changeColor, 
                fontSize: '9px', 
                fontWeight: '700'
              }
            }, changeText + ' кг'),
            // Стрелка (выше)
            React.createElement('text', {
              x: todayPt.x,
              y: todayPt.y - 16,
              textAnchor: 'middle',
              style: { fill: 'rgba(139, 92, 246, 0.9)', fontSize: '8px', fontWeight: '600' }
            }, '▼')
          );
        })(),
        // Пунктирные линии от точек к меткам дней
        points.map((p, i) => {
          const animDelay = 3 + i * 0.15;
          return React.createElement('line', {
            key: 'wpoint-line-' + i,
            x1: p.x,
            y1: p.y + 6, // от точки
            x2: p.x,
            y2: height - paddingBottom + 4, // до меток дней
            className: 'sparkline-point-line weight-sparkline-point-line',
            style: { '--delay': animDelay + 's' }
          });
        }),
        // Метки дней внизу
        points.map((p, i) => {
          const isFirst = i === 0;
          const isLast = i === points.length - 1 && !forecastPt;
          const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
          return React.createElement('text', {
            key: 'wday-' + i,
            x: p.x,
            y: height - 2,
            className: 'weight-sparkline-day-label' + (p.isToday ? ' weight-sparkline-day-today' : ''),
            textAnchor: anchor
          }, p.dayNum);
        }),
        // Метки веса над точками
        points.map((p, i) => {
          const isFirst = i === 0;
          const isLast = i === points.length - 1 && !forecastPt;
          const anchor = isFirst ? 'start' : (isLast ? 'end' : 'middle');
          return React.createElement('text', {
            key: 'wlabel-' + i,
            x: p.x,
            y: p.y - 8,
            className: 'weight-sparkline-weight-label' + (p.isToday ? ' weight-sparkline-day-today' : ''),
            textAnchor: anchor
          }, p.weight.toFixed(1));
        }),
        // Метка веса прогноза (бледная)
        forecastPt && React.createElement('text', {
          key: 'wlabel-forecast',
          x: forecastPt.x,
          y: forecastPt.y - 8,
          className: 'weight-sparkline-weight-label weight-sparkline-day-forecast',
          textAnchor: 'end',
          style: { opacity: 0.5 }
        }, forecastPt.weight.toFixed(1)),
        // Метка прогнозного дня (бледная)
        forecastPt && React.createElement('text', {
          key: 'wday-forecast',
          x: forecastPt.x,
          y: height - 2,
          className: 'weight-sparkline-day-label weight-sparkline-day-forecast',
          textAnchor: 'end',
          style: { opacity: 0.5 }
        }, forecastPt.dayNum),
        // Точки с цветом по локальному тренду (анимация с задержкой)
        points.map((p, i) => {
          // Локальный тренд: сравниваем с предыдущей точкой
          const prevWeight = i > 0 ? points[i-1].weight : p.weight;
          const localTrend = p.weight - prevWeight;
          const dotColor = localTrend < -0.05 ? '#22c55e' : (localTrend > 0.05 ? '#ef4444' : '#8b5cf6');
          
          let dotClass = 'weight-sparkline-dot sparkline-dot';
          if (p.isToday) dotClass += ' weight-sparkline-dot-today sparkline-dot-pulse';
          
          // Задержка анимации через CSS переменную
          const animDelay = 3 + i * 0.15;
          
          return React.createElement('circle', {
            key: 'wdot-' + i,
            cx: p.x, 
            cy: p.y, 
            r: p.isToday ? 4 : 2.5,
            className: dotClass,
            style: { cursor: 'pointer', fill: dotColor, '--delay': animDelay + 's' },
            onClick: (e) => {
              e.stopPropagation();
              haptic('light');
              setSparklinePopup({ 
                type: 'weight', 
                point: { ...p, localTrend },
                x: e.clientX, 
                y: e.clientY 
              });
            }
          },
            React.createElement('title', null, p.dayNum + ': ' + p.weight + ' кг' + (localTrend !== 0 ? ' (' + (localTrend > 0 ? '+' : '') + localTrend.toFixed(1) + ')' : ''))
          );
        }),
        // Точка прогноза (полупрозрачная, пунктирная обводка)
        forecastPt && React.createElement('circle', {
          key: 'wdot-forecast',
          cx: forecastPt.x,
          cy: forecastPt.y,
          r: 3.5,
          className: 'weight-sparkline-dot weight-sparkline-dot-forecast',
          style: { 
            fill: forecastColor, 
            opacity: 0.6,
            strokeDasharray: '2 2',
            stroke: forecastColor,
            strokeWidth: 1.5,
            cursor: 'pointer'
          },
          onClick: (e) => {
            e.stopPropagation();
            haptic('light');
            const lastWeight = points[points.length - 1]?.weight || forecastPt.weight;
            const forecastChange = forecastPt.weight - lastWeight;
            setSparklinePopup({ 
              type: 'weight-forecast', 
              point: { 
                ...forecastPt, 
                forecastChange,
                lastWeight
              },
              x: e.clientX, 
              y: e.clientY 
            });
          }
        },
          React.createElement('title', null, forecastPt.dayNum + ' (прогноз): ~' + forecastPt.weight + ' кг')
        )
      );
    };
    
    // === БЛОК СТАТИСТИКА ===
    const statsBlock = React.createElement('div', { className: 'compact-stats compact-card' },
      React.createElement('div', { className: 'compact-card-header stats-header-with-badge' },
        React.createElement('span', null, '📊 СТАТИСТИКА'),
        React.createElement('span', { 
          className: 'ratio-status-badge' + (ratioStatus.emoji === '🔥' ? ' perfect' : ''),
          style: { color: ratioStatus.color }
        }, ratioStatus.emoji + ' ' + ratioStatus.text)
      ),
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
          className: 'metrics-card' + (shakeEaten ? ' shake-excess' : ''),
          style: { background: eatenCol.bg, borderColor: eatenCol.border, cursor: 'pointer' },
          onClick: (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMetricPopup({
              type: 'kcal',
              x: rect.left + rect.width / 2,
              y: rect.top,
              data: {
                eaten: eatenKcal,
                goal: optimum,
                remaining: remainingKcal,
                ratio: currentRatio,
                deficitPct: dayTargetDef
              }
            });
            haptic('light');
          }
        },
          React.createElement('div', { className: 'metrics-icon' }, '🍽️'),
          React.createElement('div', { className: 'metrics-value', style: { color: eatenCol.text } }, r0(eatenKcal)),
          React.createElement('div', { className: 'metrics-label' }, 'Съедено')
        ),
        // Осталось / Перебор
        React.createElement('div', { 
          className: 'metrics-card' + (shakeOver && remainingKcal < 0 ? ' shake-excess' : ''),
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
      // Спарклайн калорий — карточка в стиле веса
      // Вычисляем статистику для badge здесь (до рендера)
      (() => {
        const rz = HEYS.ratioZones;
        const totalDaysWithData = sparklineData.filter(p => p.kcal > 0).length;
        const successDays = sparklineData.filter(p => p.kcal > 0 && rz && rz.isSuccess(p.kcal / p.target)).length;
        const goalAchievementPct = totalDaysWithData > 0 ? Math.round((successDays / totalDaysWithData) * 100) : 0;
        const goalBadgeClass = 'sparkline-goal-badge' + 
          (goalAchievementPct >= 70 ? '' : goalAchievementPct >= 40 ? ' goal-low' : ' goal-critical');
        
        return React.createElement('div', { className: 'kcal-sparkline-container' },
          React.createElement('div', { className: 'kcal-sparkline-header' },
            React.createElement('span', { className: 'kcal-sparkline-title' }, '📊 Калории'),
            // Goal Achievement Badge + Period Pills
            React.createElement('div', { className: 'kcal-header-right' },
              // Badge "% в норме" (слева от кнопок)
              totalDaysWithData >= 3 && React.createElement('div', {
                className: goalBadgeClass + ' kcal-goal-badge-inline',
                title: successDays + ' из ' + totalDaysWithData + ' дней в норме'
              }, 
                React.createElement('span', null, goalAchievementPct >= 70 ? '✓' : goalAchievementPct >= 40 ? '~' : '!'),
                goalAchievementPct + '% дней в норме'
              ),
              // Кнопки выбора периода
            React.createElement('div', { className: 'kcal-period-pills' },
              [7, 14, 30].map(period => 
                React.createElement('button', {
                  key: period,
                  className: 'kcal-period-pill' + (chartPeriod === period ? ' active' : ''),
                  onClick: () => handlePeriodChange(period)
                }, period + 'д')
              )
            )
          )
        ),
        React.createElement('div', { 
          className: chartTransitioning ? 'sparkline-transitioning' : '',
          style: { transition: 'opacity 0.15s ease' }
        },
          renderSparkline(sparklineData, optimum)
        )
      );
      })(),
      // Popup с деталями при клике на точку — НОВЫЙ КОНСИСТЕНТНЫЙ ДИЗАЙН
      sparklinePopup && sparklinePopup.type === 'kcal' && (() => {
        const point = sparklinePopup.point;
        const ratio = point.kcal / point.target;
        const pct = Math.round(ratio * 100);
        
        // Цвет по ratio
        const getColor = (r) => {
          if (r <= 0.5) return '#ef4444';
          if (r < 0.75) return '#eab308';
          if (r < 0.9) return '#22c55e';
          if (r < 1.1) return '#10b981';
          if (r < 1.3) return '#eab308';
          return '#ef4444';
        };
        const color = getColor(ratio);
        
        // Позиционирование
        const popupW = 260;
        let left = sparklinePopup.x - popupW / 2;
        let arrowPos = 'center';
        if (left < 10) { left = 10; arrowPos = 'left'; }
        if (left + popupW > window.innerWidth - 10) { left = window.innerWidth - popupW - 10; arrowPos = 'right'; }
        
        // Вчера
        const prevPoint = sparklineData[sparklineData.findIndex(p => p.date === point.date) - 1];
        const diff = prevPoint ? point.kcal - prevPoint.kcal : null;
        
        // Gradient для progress
        const getGradient = (r) => {
          if (r < 0.5) return 'linear-gradient(90deg, #ef4444 0%, #ef4444 100%)';
          if (r < 0.75) return 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)';
          if (r < 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
          if (r < 1.15) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
          return 'linear-gradient(90deg, #eab308 0%, #ef4444 100%)';
        };
        
        // Swipe
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const deltaY = e.changedTouches[0].clientY - startY;
          if (deltaY > 50) { 
            setSparklinePopup(null); 
            haptic('light'); 
          }
        };
        
        return React.createElement('div', {
          className: 'sparkline-popup sparkline-popup-v2',
          role: 'dialog',
          'aria-label': (point.isToday ? 'Сегодня' : point.dayNum) + ' — ' + pct + '% от нормы',
          'aria-modal': 'true',
          style: { 
            position: 'fixed',
            left: left + 'px', 
            top: (sparklinePopup.y + 15) + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: color }
          }),
          // Контент
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Header: дата + процент
            React.createElement('div', { className: 'sparkline-popup-header-v2' },
              React.createElement('span', { className: 'sparkline-popup-date' },
                (() => {
                  if (point.isToday) return '📅 Сегодня';
                  const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                  const wd = weekDays[point.dayOfWeek] || '';
                  return '📅 ' + point.dayNum + ' ' + wd;
                })()
              ),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: color }
              }, pct + '%')
            ),
            // Progress bar
            React.createElement('div', { className: 'sparkline-popup-progress' },
              React.createElement('div', { 
                className: 'sparkline-popup-progress-fill',
                style: { 
                  width: Math.min(100, pct) + '%',
                  background: getGradient(ratio)
                }
              })
            ),
            // Value
            React.createElement('div', { className: 'sparkline-popup-value-row' },
              React.createElement('span', { style: { color: color, fontWeight: 700, fontSize: '15px' } }, 
                Math.round(point.kcal) + ' ккал'
              ),
              React.createElement('span', { className: 'sparkline-popup-target' }, 
                ' / ' + point.target + ' ккал'
              ),
              // Сравнение со вчера
              diff !== null && React.createElement('span', { 
                className: 'sparkline-popup-compare' + (diff > 0 ? ' up' : diff < 0 ? ' down' : ''),
              }, diff > 0 ? '↑' : diff < 0 ? '↓' : '=', ' ', Math.abs(Math.round(diff)))
            ),
            // Теги: сон, тренировка, шаги, оценка
            (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2' },
                point.sleepHours > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2' + (point.sleepHours < 6 ? ' bad' : point.sleepHours >= 7 ? ' good' : '')
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 good'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2' + (point.steps >= 10000 ? ' good' : '')
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2',
                  style: { 
                    backgroundColor: point.dayScore <= 3 ? '#fee2e2' : 
                                     point.dayScore <= 5 ? '#fef3c7' : 
                                     point.dayScore <= 7 ? '#fef3c7' : '#dcfce7',
                    color: point.dayScore <= 3 ? '#dc2626' : 
                           point.dayScore <= 5 ? '#d97706' : 
                           point.dayScore <= 7 ? '#d97706' : '#16a34a'
                  }
                }, '⭐ ' + point.dayScore)
              ),
            // Кнопка перехода
            !point.isToday && React.createElement('button', {
              className: 'sparkline-popup-btn-v2',
              onClick: () => {
                setSparklinePopup(null);
                setDate(point.date);
                haptic('light');
              }
            }, '→ Перейти к дню'),
            // Close
            React.createElement('button', {
              className: 'sparkline-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setSparklinePopup(null)
            }, '✕')
          ),
          // Стрелка
          React.createElement('div', { 
            className: 'sparkline-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Popup для идеального дня 🔥 — ЗОЛОТОЙ СТИЛЬ
      sparklinePopup && sparklinePopup.type === 'perfect' && (() => {
        const point = sparklinePopup.point;
        const pct = Math.round((point.kcal / point.target) * 100);
        
        // Позиционирование
        const popupW = 260;
        let left = sparklinePopup.x - popupW / 2;
        let arrowPos = 'center';
        if (left < 10) { left = 10; arrowPos = 'left'; }
        if (left + popupW > window.innerWidth - 10) { left = window.innerWidth - popupW - 10; arrowPos = 'right'; }
        
        // Swipe
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const deltaY = e.changedTouches[0].clientY - startY;
          if (deltaY > 50) { setSparklinePopup(null); haptic('light'); }
        };
        
        return React.createElement('div', {
          className: 'sparkline-popup sparkline-popup-v2 sparkline-popup-perfect-v2',
          role: 'dialog',
          'aria-label': 'Идеальный день — ' + pct + '% от нормы',
          'aria-modal': 'true',
          style: { 
            position: 'fixed',
            left: left + 'px', 
            top: (sparklinePopup.y + 15) + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Золотая полоса
          React.createElement('div', { 
            className: 'sparkline-popup-stripe',
            style: { background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }
          }),
          // Контент
          React.createElement('div', { className: 'sparkline-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'sparkline-popup-swipe' }),
            // Header: emoji + дата
            React.createElement('div', { className: 'sparkline-popup-header-v2 perfect' },
              React.createElement('span', { className: 'sparkline-popup-perfect-title' }, '🔥 Идеальный день!'),
              React.createElement('span', { 
                className: 'sparkline-popup-pct',
                style: { color: '#f59e0b' }
              }, pct + '%')
            ),
            // Progress bar (золотой)
            React.createElement('div', { className: 'sparkline-popup-progress' },
              React.createElement('div', { 
                className: 'sparkline-popup-progress-fill',
                style: { 
                  width: Math.min(100, pct) + '%',
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                }
              })
            ),
            // Value
            React.createElement('div', { className: 'sparkline-popup-value-row' },
              React.createElement('span', { style: { color: '#f59e0b', fontWeight: 700, fontSize: '15px' } }, 
                Math.round(point.kcal) + ' ккал'
              ),
              React.createElement('span', { className: 'sparkline-popup-target' }, 
                ' / ' + point.target + ' ккал'
              )
            ),
            // Motivation
            React.createElement('div', { className: 'sparkline-popup-motivation-v2' },
              '✨ Попал точно в цель! Так держать!'
            ),
            // Теги (золотой стиль)
            (point.sleepHours > 0 || point.trainingMinutes > 0 || point.steps > 0 || point.dayScore > 0) &&
              React.createElement('div', { className: 'sparkline-popup-tags-v2 perfect' },
                point.sleepHours > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '😴 ' + point.sleepHours.toFixed(1) + 'ч'),
                point.trainingMinutes > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '🏃 ' + point.trainingMinutes + 'м'),
                point.steps > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '👟 ' + point.steps.toLocaleString()),
                point.dayScore > 0 && React.createElement('span', { 
                  className: 'sparkline-popup-tag-v2 perfect'
                }, '⭐ ' + point.dayScore)
              ),
            // Кнопка перехода
            !point.isToday && React.createElement('button', {
              className: 'sparkline-popup-btn-v2 perfect',
              onClick: () => {
                setSparklinePopup(null);
                setDate(point.date);
                haptic('light');
              }
            }, '→ Перейти к дню'),
            // Close
            React.createElement('button', {
              className: 'sparkline-popup-close perfect',
              'aria-label': 'Закрыть',
              onClick: () => setSparklinePopup(null)
            }, '✕')
          ),
          // Стрелка (золотая)
          React.createElement('div', { 
            className: 'sparkline-popup-arrow perfect' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Popup для бейджей БЖУ
      macroBadgePopup && (() => {
        const popupWidth = 220;
        const x = macroBadgePopup.x;
        const screenW = window.innerWidth;
        const margin = 12;
        
        // Умная позиция: вычисляем left напрямую без transform
        let left, arrowPos = 'center';
        if (x < popupWidth / 2 + margin) {
          left = margin;
          arrowPos = 'left';
        } else if (x > screenW - popupWidth / 2 - margin) {
          left = screenW - popupWidth - margin;
          arrowPos = 'right';
        } else {
          left = x - popupWidth / 2;
        }
        
        // 📊 Сравнение со вчера
        const getYesterdayCompare = () => {
          try {
            const macroKey = macroBadgePopup.macro === 'Белки' ? 'prot' : 
                             macroBadgePopup.macro === 'Жиры' ? 'fat' : 'carbs';
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().slice(0, 10);
            const dayData = U.lsGet('heys_dayv2_' + dateStr);
            if (!dayData || !dayData.meals) return null;
            
            let macroSum = 0;
            dayData.meals.forEach(meal => {
              (meal.items || []).forEach(item => {
                const prod = pIndex.byId.get(item.product_id);
                if (prod) {
                  const g = item.grams || 100;
                  if (macroKey === 'prot') macroSum += (prod.protein100 || 0) * g / 100;
                  else if (macroKey === 'fat') macroSum += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
                  else macroSum += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
                }
              });
            });
            
            const diff = macroBadgePopup.value - macroSum;
            if (Math.abs(diff) < 5) return { icon: '↔️', text: 'как вчера', diff: 0 };
            if (diff > 0) return { icon: '📈', text: '+' + Math.round(diff) + 'г', diff: diff };
            return { icon: '📉', text: Math.round(diff) + 'г', diff: diff };
          } catch (e) { return null; }
        };
        const yesterdayCompare = getYesterdayCompare();
        
        // Рекомендация продукта если недобор
        const getRec = () => {
          if (macroBadgePopup.ratio >= 0.9) return null;
          const deficit = macroBadgePopup.norm - macroBadgePopup.value;
          const macro = macroBadgePopup.macro;
          if (macro === 'Белки' && deficit > 20) {
            return { icon: '🍗', text: 'Добавь курицу 100г', amount: '+25г' };
          } else if (macro === 'Белки' && deficit > 10) {
            return { icon: '🥚', text: 'Добавь яйцо', amount: '+12г' };
          } else if (macro === 'Жиры' && deficit > 10) {
            return { icon: '🥑', text: 'Добавь авокадо', amount: '+15г' };
          } else if (macro === 'Углеводы' && deficit > 20) {
            return { icon: '🍌', text: 'Добавь банан', amount: '+25г' };
          }
          return null;
        };
        const rec = getRec();
        
        // ⏰ Динамическое сообщение по времени
        const getTimeMsg = () => {
          const hour = new Date().getHours();
          const ratio = macroBadgePopup.ratio;
          if (ratio >= 0.9 && ratio <= 1.1) return { icon: '✅', text: 'В норме!' };
          if (ratio > 1.1) return { icon: '😅', text: 'Немного перебор' };
          // Недобор
          if (hour < 12) return { icon: '🌅', text: 'Ещё целый день впереди!' };
          if (hour < 17) return { icon: '☀️', text: 'Время ещё есть' };
          if (hour < 20) return { icon: '🌆', text: 'Осталось немного времени' };
          return { icon: '🌙', text: 'День почти закончен' };
        };
        const timeMsg = getTimeMsg();
        
        // 🏆 Streak макроса (последние 7 дней)
        const getMacroStreak = () => {
          try {
            const macroKey = macroBadgePopup.macro === 'Белки' ? 'prot' : 
                             macroBadgePopup.macro === 'Жиры' ? 'fat' : 'carbs';
            let streak = 0;
            const today = new Date();
            for (let i = 1; i <= 7; i++) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().slice(0, 10);
              const dayData = U.lsGet('heys_dayv2_' + dateStr);
              if (!dayData || !dayData.meals) break;
              
              // Вычислим сумму макроса за день
              let macroSum = 0;
              dayData.meals.forEach(meal => {
                (meal.items || []).forEach(item => {
                  const prod = pIndex.byId.get(item.product_id);
                  if (prod) {
                    const g = item.grams || 100;
                    if (macroKey === 'prot') macroSum += (prod.protein100 || 0) * g / 100;
                    else if (macroKey === 'fat') macroSum += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
                    else macroSum += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
                  }
                });
              });
              
              // Норма макроса
              const normKey = macroKey === 'prot' ? 'prot' : macroKey;
              const norm = normAbs[normKey] || 100;
              const dayRatio = macroSum / norm;
              
              if (dayRatio >= 0.8 && dayRatio <= 1.2) streak++;
              else break;
            }
            return streak;
          } catch (e) { return 0; }
        };
        const macroStreak = getMacroStreak();
        
        // 📊 Мини-sparkline за 7 дней
        const getMiniSparkline = () => {
          try {
            const macroKey = macroBadgePopup.macro === 'Белки' ? 'prot' : 
                             macroBadgePopup.macro === 'Жиры' ? 'fat' : 'carbs';
            const data = [];
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              const dateStr = d.toISOString().slice(0, 10);
              const dayData = U.lsGet('heys_dayv2_' + dateStr);
              if (!dayData || !dayData.meals) { data.push(0); continue; }
              
              let macroSum = 0;
              dayData.meals.forEach(meal => {
                (meal.items || []).forEach(item => {
                  const prod = pIndex.byId.get(item.product_id);
                  if (prod) {
                    const g = item.grams || 100;
                    if (macroKey === 'prot') macroSum += (prod.protein100 || 0) * g / 100;
                    else if (macroKey === 'fat') macroSum += ((prod.badFat100 || 0) + (prod.goodFat100 || 0) + (prod.trans100 || 0)) * g / 100;
                    else macroSum += ((prod.simple100 || 0) + (prod.complex100 || 0)) * g / 100;
                  }
                });
              });
              data.push(macroSum);
            }
            // Сегодня
            data[6] = macroBadgePopup.value;
            return data;
          } catch (e) { return [0,0,0,0,0,0,0]; }
        };
        const sparkData = getMiniSparkline();
        const sparkMax = Math.max(...sparkData, macroBadgePopup.norm) || 100;
        
        // Градиент для прогресс-бара
        const getProgressGradient = (ratio) => {
          if (ratio <= 0.5) return 'linear-gradient(90deg, #ef4444 0%, #f97316 100%)';
          if (ratio <= 0.8) return 'linear-gradient(90deg, #f97316 0%, #eab308 100%)';
          if (ratio <= 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
          if (ratio <= 1.2) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
          return 'linear-gradient(90deg, #f97316 0%, #ef4444 100%)';
        };
        
        // Swipe handler
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const diff = e.changedTouches[0].clientY - startY;
          if (diff > 50) setMacroBadgePopup(null); // swipe down
        };
        
        return React.createElement('div', {
          className: 'macro-badge-popup',
          role: 'dialog',
          'aria-label': macroBadgePopup.macro + ' — ' + Math.round(macroBadgePopup.ratio * 100) + '% от нормы',
          'aria-modal': 'true',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: (macroBadgePopup.y + 15) + 'px',
            width: popupWidth + 'px'
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса сверху
          React.createElement('div', { 
            className: 'macro-badge-popup-stripe',
            style: { background: macroBadgePopup.color }
          }),
          // Контент
          React.createElement('div', { className: 'macro-badge-popup-content' },
            // Swipe indicator (mobile)
            React.createElement('div', { className: 'macro-badge-popup-swipe' }),
            // Header: макрос + процент
            React.createElement('div', { className: 'macro-badge-popup-header' },
              React.createElement('span', { className: 'macro-badge-popup-title' }, macroBadgePopup.macro),
              React.createElement('span', { 
                className: 'macro-badge-popup-pct macro-badge-popup-animated',
                style: { color: macroBadgePopup.color }
              }, Math.round(macroBadgePopup.ratio * 100) + '%')
            ),
            // 📊 Мини-sparkline
            React.createElement('div', { className: 'macro-badge-popup-sparkline' },
              React.createElement('svg', { viewBox: '0 0 70 20', className: 'macro-badge-popup-spark-svg' },
                // Линия нормы
                React.createElement('line', {
                  x1: 0, y1: 20 - (macroBadgePopup.norm / sparkMax * 18),
                  x2: 70, y2: 20 - (macroBadgePopup.norm / sparkMax * 18),
                  stroke: '#e2e8f0',
                  strokeWidth: 1,
                  strokeDasharray: '2,2'
                }),
                // Точки и линии
                sparkData.map((val, i) => {
                  const x = i * 10 + 5;
                  const y = 20 - (val / sparkMax * 18);
                  const nextVal = sparkData[i + 1];
                  const isToday = i === 6;
                  return React.createElement('g', { key: i },
                    // Линия к следующей точке
                    nextVal !== undefined && React.createElement('line', {
                      x1: x, y1: y,
                      x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                      stroke: macroBadgePopup.color,
                      strokeWidth: 1.5,
                      strokeOpacity: 0.6
                    }),
                    // Точка
                    React.createElement('circle', {
                      cx: x, cy: y,
                      r: isToday ? 3 : 2,
                      fill: isToday ? macroBadgePopup.color : '#94a3b8',
                      className: isToday ? 'macro-badge-popup-spark-today' : ''
                    })
                  );
                })
              ),
              React.createElement('span', { className: 'macro-badge-popup-spark-label' }, '7 дней')
            ),
            // 🎨 Прогресс-бар с градиентом
            React.createElement('div', { className: 'macro-badge-popup-progress' },
              React.createElement('div', { 
                className: 'macro-badge-popup-progress-fill macro-badge-popup-animated-bar',
                style: { 
                  width: Math.min(100, macroBadgePopup.ratio * 100) + '%',
                  background: getProgressGradient(macroBadgePopup.ratio)
                }
              })
            ),
            // 💫 Значение с анимацией + сравнение со вчера
            React.createElement('div', { className: 'macro-badge-popup-value' },
              React.createElement('span', { 
                className: 'macro-badge-popup-animated',
                style: { color: macroBadgePopup.color, fontWeight: 700 } 
              }, macroBadgePopup.value + 'г'),
              React.createElement('span', { className: 'macro-badge-popup-norm' }, 
                ' / ' + macroBadgePopup.norm + 'г'
              ),
              // 📊 Сравнение со вчера
              yesterdayCompare && React.createElement('span', { 
                className: 'macro-badge-popup-compare' + (yesterdayCompare.diff > 0 ? ' up' : yesterdayCompare.diff < 0 ? ' down' : ''),
                'aria-label': 'Сравнение со вчера'
              }, yesterdayCompare.icon + ' ' + yesterdayCompare.text)
            ),
            // ⏰ Динамическое сообщение по времени
            React.createElement('div', { className: 'macro-badge-popup-time-msg' },
              React.createElement('span', null, timeMsg.icon),
              React.createElement('span', null, ' ' + timeMsg.text)
            ),
            // 🏆 Streak макроса
            macroStreak > 0 && React.createElement('div', { className: 'macro-badge-popup-streak' },
              React.createElement('span', { className: 'macro-badge-popup-streak-icon' }, '🏆'),
              React.createElement('span', null, macroStreak + ' ' + (macroStreak === 1 ? 'день' : macroStreak < 5 ? 'дня' : 'дней') + ' подряд в норме!')
            ),
            // Описание (все бейджи)
            macroBadgePopup.allBadges.length > 0 && React.createElement('div', { className: 'macro-badge-popup-desc' },
              macroBadgePopup.allBadges.map((b, i) => 
                React.createElement('div', { key: i, className: 'macro-badge-popup-item' },
                  React.createElement('span', { className: 'macro-badge-popup-emoji' }, b.emoji),
                  React.createElement('span', null, b.desc)
                )
              )
            ),
            // Рекомендация продукта
            rec && React.createElement('div', { className: 'macro-badge-popup-rec' },
              React.createElement('span', { className: 'macro-badge-popup-rec-icon' }, rec.icon),
              React.createElement('span', { className: 'macro-badge-popup-rec-text' },
                rec.text + ' ',
                React.createElement('b', null, rec.amount)
              )
            ),
            // Закрыть
            React.createElement('button', {
              className: 'macro-badge-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setMacroBadgePopup(null)
            }, '✕')
          ),
          // Стрелка-указатель
          React.createElement('div', { 
            className: 'macro-badge-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // === METRIC POPUP (вода, шаги, калории) ===
      metricPopup && (() => {
        // Позиционирование
        const popupW = 280;
        let left = metricPopup.x - popupW / 2;
        let arrowPos = 'center';
        if (left < 10) { left = 10; arrowPos = 'left'; }
        if (left + popupW > window.innerWidth - 10) { left = window.innerWidth - popupW - 10; arrowPos = 'right'; }
        
        // Получаем историю для sparkline (7 дней)
        const getMetricHistory = () => {
          const days = [];
          const currentD = new Date(date);
          for (let i = 6; i >= 0; i--) {
            const d = new Date(currentD);
            d.setDate(d.getDate() - i);
            const key = 'heys_dayv2_' + d.toISOString().slice(0,10);
            const stored = U.lsGet(key, null);
            if (stored) {
              if (metricPopup.type === 'water') {
                days.push(stored.waterMl || 0);
              } else if (metricPopup.type === 'steps') {
                days.push(stored.steps || 0);
              } else {
                // kcal — нужно суммировать meals
                const dayTotKcal = (stored.meals || []).reduce((a, m) => {
                  const t = M.mealTotals ? M.mealTotals(m, pIndex) : { kcal: 0 };
                  return a + (t.kcal || 0);
                }, 0);
                days.push(dayTotKcal);
              }
            } else {
              days.push(0);
            }
          }
          return days;
        };
        
        const history = getMetricHistory();
        const sparkMax = Math.max(...history, metricPopup.data.goal || 1) * 1.1;
        
        // Streak расчёт
        const getMetricStreak = () => {
          let streak = 0;
          const goal = metricPopup.data.goal;
          for (let i = history.length - 1; i >= 0; i--) {
            const val = history[i];
            if (metricPopup.type === 'steps') {
              if (val >= goal * 0.8) streak++; else break;
            } else if (metricPopup.type === 'water') {
              if (val >= goal * 0.8) streak++; else break;
            } else {
              const ratio = goal > 0 ? val / goal : 0;
              if (ratio >= 0.75 && ratio <= 1.15) streak++; else break;
            }
          }
          return streak;
        };
        const streak = getMetricStreak();
        
        // Вчера
        const yesterdayVal = history.length >= 2 ? history[history.length - 2] : null;
        const todayVal = history[history.length - 1] || 0;
        const diff = yesterdayVal !== null ? todayVal - yesterdayVal : null;
        
        // Цвет и конфиг по типу
        const config = {
          water: { icon: '💧', name: 'Вода', unit: 'мл', color: '#3b82f6', goal: metricPopup.data.goal },
          steps: { icon: '👟', name: 'Шаги', unit: '', color: metricPopup.data.color || '#22c55e', goal: metricPopup.data.goal },
          kcal: { icon: '🔥', name: 'Калории', unit: 'ккал', color: '#f59e0b', goal: metricPopup.data.goal }
        }[metricPopup.type];
        
        const ratio = metricPopup.data.ratio || 0;
        const pct = Math.round(ratio * 100);
        
        // Gradient
        const getGradient = (r) => {
          if (r < 0.5) return 'linear-gradient(90deg, #ef4444 0%, #ef4444 100%)';
          if (r < 0.75) return 'linear-gradient(90deg, #ef4444 0%, #eab308 100%)';
          if (r < 1.0) return 'linear-gradient(90deg, #eab308 0%, #22c55e 100%)';
          if (r < 1.15) return 'linear-gradient(90deg, #22c55e 0%, #10b981 100%)';
          return 'linear-gradient(90deg, #eab308 0%, #ef4444 100%)';
        };
        
        // Swipe handler
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
          const diffY = e.changedTouches[0].clientY - startY;
          if (diffY > 50) setMetricPopup(null);
        };
        
        return React.createElement('div', {
          className: 'metric-popup',
          role: 'dialog',
          'aria-label': config.name + ' — ' + pct + '% от нормы',
          'aria-modal': 'true',
          style: {
            position: 'fixed',
            left: left + 'px',
            top: (metricPopup.y + 15) + 'px',
            width: popupW + 'px',
            zIndex: 9999
          },
          onClick: (e) => e.stopPropagation(),
          onTouchStart: onTouchStart,
          onTouchEnd: onTouchEnd
        },
          // Цветная полоса
          React.createElement('div', { 
            className: 'metric-popup-stripe',
            style: { background: config.color }
          }),
          // Контент
          React.createElement('div', { className: 'metric-popup-content' },
            // Swipe indicator
            React.createElement('div', { className: 'metric-popup-swipe' }),
            // Header
            React.createElement('div', { className: 'metric-popup-header' },
              React.createElement('span', { className: 'metric-popup-title' }, config.icon + ' ' + config.name),
              React.createElement('span', { 
                className: 'metric-popup-pct',
                style: { color: config.color }
              }, pct + '%')
            ),
            // Sparkline
            React.createElement('div', { className: 'metric-popup-sparkline' },
              React.createElement('svg', { viewBox: '0 0 70 20', className: 'metric-popup-spark-svg' },
                // Goal line
                React.createElement('line', {
                  x1: 0, y1: 20 - (config.goal / sparkMax * 18),
                  x2: 70, y2: 20 - (config.goal / sparkMax * 18),
                  stroke: '#e2e8f0',
                  strokeWidth: 1,
                  strokeDasharray: '2,2'
                }),
                // Points and lines
                history.map((val, i) => {
                  const x = i * 10 + 5;
                  const y = 20 - (val / sparkMax * 18);
                  const nextVal = history[i + 1];
                  const isToday = i === 6;
                  return React.createElement('g', { key: i },
                    nextVal !== undefined && React.createElement('line', {
                      x1: x, y1: y,
                      x2: (i + 1) * 10 + 5, y2: 20 - (nextVal / sparkMax * 18),
                      stroke: config.color,
                      strokeWidth: 1.5,
                      strokeOpacity: 0.6
                    }),
                    React.createElement('circle', {
                      cx: x, cy: y,
                      r: isToday ? 3 : 2,
                      fill: isToday ? config.color : '#94a3b8'
                    })
                  );
                })
              ),
              React.createElement('span', { className: 'metric-popup-spark-label' }, '7 дней')
            ),
            // Progress bar
            React.createElement('div', { className: 'metric-popup-progress' },
              React.createElement('div', { 
                className: 'metric-popup-progress-fill',
                style: { 
                  width: Math.min(100, pct) + '%',
                  background: getGradient(ratio)
                }
              })
            ),
            // Value
            React.createElement('div', { className: 'metric-popup-value' },
              React.createElement('span', { style: { color: config.color, fontWeight: 700 } }, 
                metricPopup.type === 'water' 
                  ? (metricPopup.data.value >= 1000 ? (metricPopup.data.value / 1000).toFixed(1) + 'л' : metricPopup.data.value + 'мл')
                  : metricPopup.type === 'steps'
                    ? metricPopup.data.value.toLocaleString()
                    : Math.round(metricPopup.data.eaten) + ' ккал'
              ),
              React.createElement('span', { className: 'metric-popup-goal' }, 
                ' / ' + (metricPopup.type === 'water' 
                  ? (config.goal >= 1000 ? (config.goal / 1000).toFixed(1) + 'л' : config.goal + 'мл')
                  : metricPopup.type === 'steps'
                    ? config.goal.toLocaleString()
                    : Math.round(config.goal) + ' ккал'
                )
              ),
              // Yesterday compare
              diff !== null && React.createElement('span', { 
                className: 'metric-popup-compare' + (diff > 0 ? ' up' : diff < 0 ? ' down' : ''),
              }, diff > 0 ? '↑' : diff < 0 ? '↓' : '=', ' ', 
                metricPopup.type === 'steps' ? Math.abs(diff).toLocaleString() : Math.abs(Math.round(diff)),
                ' vs вчера'
              )
            ),
            // Extra info per type
            metricPopup.type === 'water' && metricPopup.data.breakdown && React.createElement('div', { className: 'metric-popup-extra' },
              React.createElement('span', null, '⚖️ База: ' + metricPopup.data.breakdown.base + 'мл'),
              metricPopup.data.breakdown.stepsBonus > 0 && React.createElement('span', null, ' 👟+' + metricPopup.data.breakdown.stepsBonus),
              metricPopup.data.breakdown.trainBonus > 0 && React.createElement('span', null, ' 🏃+' + metricPopup.data.breakdown.trainBonus)
            ),
            metricPopup.type === 'steps' && React.createElement('div', { className: 'metric-popup-extra' },
              React.createElement('span', null, '🔥 Сожжено: '),
              React.createElement('b', null, metricPopup.data.kcal + ' ккал')
            ),
            metricPopup.type === 'kcal' && React.createElement('div', { className: 'metric-popup-extra' },
              React.createElement('span', null, metricPopup.data.remaining >= 0 ? '✅ Осталось: ' : '⚠️ Перебор: '),
              React.createElement('b', null, Math.abs(metricPopup.data.remaining) + ' ккал')
            ),
            // Streak
            streak > 0 && React.createElement('div', { className: 'metric-popup-streak' },
              React.createElement('span', null, '🏆'),
              React.createElement('span', null, streak + ' ' + (streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней') + ' подряд!')
            ),
            // Water reminder
            metricPopup.type === 'water' && metricPopup.data.lastDrink && metricPopup.data.lastDrink.isLong && React.createElement('div', { className: 'metric-popup-reminder' },
              React.createElement('span', null, '⏰ ' + metricPopup.data.lastDrink.text)
            ),
            // Close button
            React.createElement('button', {
              className: 'metric-popup-close',
              'aria-label': 'Закрыть',
              onClick: () => setMetricPopup(null)
            }, '✕')
          ),
          // Arrow
          React.createElement('div', { 
            className: 'metric-popup-arrow' + (arrowPos !== 'center' ? ' ' + arrowPos : '')
          })
        );
      })(),
      // Fallback: нет данных о весе, но есть калории
      (!weightTrend && kcalTrend) && React.createElement('div', { 
        className: 'correlation-block correlation-clickable',
        onClick: () => {
          haptic('light');
          setToastVisible(true);
          setAdviceTrigger('manual');
        }
      },
        React.createElement('span', { className: 'correlation-icon' }, '📉'),
        React.createElement('span', { className: 'correlation-text' },
          'Добавь вес для анализа связи калорий и веса'
        )
      ),
      // Блок корреляции калорий и веса (диагноз + совет)
      (kcalTrend && weightTrend) && React.createElement('div', { 
        className: 'correlation-block correlation-clickable' + 
          (correlationPulse ? ' pulse' : '') +
          (kcalTrend.direction === 'deficit' && weightTrend.direction === 'down' ? ' positive' :
           kcalTrend.direction === 'excess' && weightTrend.direction === 'up' ? ' warning' :
           kcalTrend.direction === 'deficit' && weightTrend.direction === 'up' ? ' mixed' : ''),
        onClick: () => {
          haptic('light');
          setToastVisible(true);
          setAdviceTrigger('manual');
        }
      },
        React.createElement('span', { className: 'correlation-icon' },
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'down' ? '🎯' :
          kcalTrend.direction === 'excess' && weightTrend.direction === 'up' ? '⚠️' :
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'up' ? '🤔' :
          kcalTrend.direction === 'excess' && weightTrend.direction === 'down' ? '💪' : '📊'
        ),
        React.createElement('span', { className: 'correlation-text' },
          // 🎯 Дефицит работает
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'down' 
            ? 'Дефицит работает! ' + r1(weightTrend.diff) + 'кг — продолжай!' :
          // ⚠️ Избыток + рост веса
          kcalTrend.direction === 'excess' && weightTrend.direction === 'up' 
            ? 'Избыток → +' + r1(Math.abs(weightTrend.diff)) + 'кг. Сократи порции' :
          // 🤔 Парадокс: дефицит, но вес растёт
          kcalTrend.direction === 'deficit' && weightTrend.direction === 'up' 
            ? '+' + r1(weightTrend.diff) + 'кг при дефиците — вероятно вода' :
          // 💪 Парадокс: избыток, но вес падает
          kcalTrend.direction === 'excess' && weightTrend.direction === 'down' 
            ? r1(weightTrend.diff) + 'кг! Активность компенсирует' :
          // 📊 Plateau: оба в норме
          kcalTrend.direction === 'same' && weightTrend.direction === 'same'
            ? 'Баланс: вес стабилен' :
          // Калории в норме, вес меняется
          kcalTrend.direction === 'same' 
            ? 'Калории в норме, вес ' + (weightTrend.direction === 'down' ? 'снижается' : 'растёт') :
          'Анализируем данные...'
        )
      ),
      // === Mini-heatmap недели (скрываем если нет данных — появится как сюрприз) ===
      weekHeatmapData && weekHeatmapData.withData > 0 && React.createElement('div', {
        className: 'week-heatmap'
      },
        React.createElement('div', { className: 'week-heatmap-header' },
          React.createElement('span', { className: 'week-heatmap-title' }, '📅 Неделя'),
          weekHeatmapData.streak >= 2 && React.createElement('span', { 
            className: 'week-heatmap-streak' 
          }, '🔥 ' + weekHeatmapData.streak),
          weekHeatmapData.withData > 0 && React.createElement('span', { className: 'week-heatmap-stat' },
            weekHeatmapData.inNorm + '/' + weekHeatmapData.withData + ' в норме'
          )
        ),
        React.createElement('div', { className: 'week-heatmap-grid' },
          weekHeatmapData.days.map((d, i) => 
            React.createElement('div', {
              key: i,
              className: 'week-heatmap-day ' + d.status + 
                (d.isToday ? ' today' : '') +
                (d.isWeekend ? ' weekend' : ''),
              title: d.isFuture ? d.name : (d.kcal > 0 ? d.kcal + ' ккал (' + Math.round(d.ratio * 100) + '%)' : 'Нет данных'),
              style: { 
                '--stagger-delay': (i * 50) + 'ms',
                '--day-bg-color': d.bgColor || 'transparent'
              },
              onClick: () => {
                if (!d.isFuture && d.status !== 'empty') {
                  setDate(d.date);
                  haptic('light');
                }
              }
                },
                  React.createElement('span', { className: 'week-heatmap-name' }, d.name),
                  React.createElement('div', { 
                    className: 'week-heatmap-cell',
                    style: d.bgColor ? { background: d.bgColor } : undefined
                  })
                )
              )
            ),
        weekHeatmapData.weekendPattern && React.createElement('div', { 
          className: 'week-heatmap-pattern' 
        }, weekHeatmapData.weekendPattern)
      ),
      // Спарклайн веса — показываем если есть хотя бы 1 точка (вес из профиля)
      weightSparklineData.length >= 1 && React.createElement('div', { 
        className: 'weight-sparkline-container' + 
          (weightTrend?.direction === 'down' ? ' trend-down' : 
           weightTrend?.direction === 'up' ? ' trend-up' : ' trend-same')
      },
        React.createElement('div', { className: 'weight-sparkline-header' },
          React.createElement('span', { className: 'weight-sparkline-title' }, '⚖️ Вес'),
          // Badges показываем только когда есть тренд (2+ точки)
          weightSparklineData.length >= 2 && weightTrend && React.createElement('div', { className: 'weight-sparkline-badges' },
            React.createElement('span', { 
              className: 'weight-trend-badge' + 
                (weightTrend.direction === 'down' ? ' down' : 
                 weightTrend.direction === 'up' ? ' up' : ' same')
            },
              weightTrend.direction === 'down' ? '↓' : 
              weightTrend.direction === 'up' ? '↑' : '→',
              ' ', weightTrend.text
            ),
            monthForecast && React.createElement('span', { 
              className: 'weight-forecast-badge' + 
                (monthForecast.direction === 'down' ? ' down' : 
                 monthForecast.direction === 'up' ? ' up' : '')
            }, monthForecast.text)
          ) // закрываем badges div
        ), // закрываем условие weightSparklineData.length >= 2
        renderWeightSparkline(weightSparklineData, weightTrend)
      ),
      // Popup с деталями веса при клике на точку
      sparklinePopup && sparklinePopup.type === 'weight' && React.createElement('div', {
        className: 'sparkline-popup',
        style: { 
          position: 'fixed',
          left: Math.min(Math.max(sparklinePopup.x, 100), window.innerWidth - 100) + 'px', 
          top: (sparklinePopup.y - 100) + 'px'
        },
        onClick: (e) => e.stopPropagation(),
        onTouchStart: (e) => { e.currentTarget._touchStartY = e.touches[0].clientY; },
        onTouchMove: (e) => {
          const deltaY = e.touches[0].clientY - (e.currentTarget._touchStartY || 0);
          if (deltaY > 30) e.currentTarget.style.opacity = Math.max(0, 1 - deltaY / 100);
        },
        onTouchEnd: (e) => {
          const deltaY = e.changedTouches[0].clientY - (e.currentTarget._touchStartY || 0);
          if (deltaY > 50) { setSparklinePopup(null); haptic('light'); }
          else e.currentTarget.style.opacity = 1;
        }
      },
        React.createElement('div', { className: 'sparkline-popup-header' },
          sparklinePopup.point.isToday ? 'Сегодня' : sparklinePopup.point.dayNum + ' число'
        ),
        React.createElement('div', { className: 'sparkline-popup-row' },
          React.createElement('span', { className: 'sparkline-popup-label' }, 'Вес'),
          React.createElement('span', { className: 'sparkline-popup-value' }, sparklinePopup.point.weight + ' кг')
        ),
        React.createElement('div', { className: 'sparkline-popup-row' },
          React.createElement('span', { className: 'sparkline-popup-label' }, 'Изменение'),
          React.createElement('span', { 
            className: 'sparkline-popup-value ' + 
              (sparklinePopup.point.localTrend < -0.05 ? 'good' : 
               sparklinePopup.point.localTrend > 0.05 ? 'bad' : '')
          }, (sparklinePopup.point.localTrend > 0 ? '+' : '') + 
             sparklinePopup.point.localTrend.toFixed(1) + ' кг')
        ),
        !sparklinePopup.point.isToday && sparklinePopup.point.date && React.createElement('button', {
          className: 'sparkline-popup-btn',
          onClick: () => {
            setSparklinePopup(null);
            setDate(sparklinePopup.point.date);
            haptic('light');
          }
        }, '→ Перейти к дню')
      ),
      // Popup для прогноза веса (завтра)
      sparklinePopup && sparklinePopup.type === 'weight-forecast' && React.createElement('div', {
        className: 'sparkline-popup sparkline-popup-forecast',
        style: { 
          position: 'fixed',
          left: Math.min(sparklinePopup.x - 120, window.innerWidth - 200) + 'px', 
          top: (sparklinePopup.y - 100) + 'px'
        },
        onClick: (e) => e.stopPropagation()
      },
        React.createElement('div', { className: 'sparkline-popup-header' },
          '🔮 Прогноз на ' + sparklinePopup.point.dayNum + ' число'
        ),
        React.createElement('div', { className: 'sparkline-popup-row' },
          React.createElement('span', { className: 'sparkline-popup-label' }, 'Ожидаемый вес'),
          React.createElement('span', { className: 'sparkline-popup-value' }, '~' + sparklinePopup.point.weight + ' кг')
        ),
        React.createElement('div', { className: 'sparkline-popup-row' },
          React.createElement('span', { className: 'sparkline-popup-label' }, 'Изменение'),
          React.createElement('span', { 
            className: 'sparkline-popup-value ' + 
              (sparklinePopup.point.forecastChange < -0.05 ? 'good' : 
               sparklinePopup.point.forecastChange > 0.05 ? 'bad' : '')
          }, (sparklinePopup.point.forecastChange > 0 ? '+' : '') + 
             sparklinePopup.point.forecastChange.toFixed(1) + ' кг')
        ),
        React.createElement('div', { className: 'sparkline-popup-hint' },
          'На основе тренда последних дней'
        )
      ),
      // Статус-бар прогресса к цели (с анимацией pulse)
      React.createElement('div', { 
        className: 'goal-progress-bar' + 
          (eatenKcal / (optimum || 1) >= 0.9 && eatenKcal / (optimum || 1) <= 1.1 ? ' pulse-perfect' : '')
      },
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
        (() => {
          // === Умная логика цветов по правилам питания ===
          
          // БЕЛКИ: больше = лучше (насыщение, мышцы, термогенез)
          // < 60% — критически мало, мышцы страдают
          // 60-90% — недобор, но терпимо
          // 90%+ — отлично! Чем больше белка, тем лучше
          const getProteinColor = (actual, norm, hasTraining) => {
            if (!norm || norm === 0) return '#6b7280';
            const ratio = actual / norm;
            // После тренировки требования к белку выше
            const minGood = hasTraining ? 1.0 : 0.9;
            const minOk = hasTraining ? 0.7 : 0.6;
            if (ratio < minOk) return '#ef4444';    // красный — критически мало
            if (ratio < minGood) return '#f59e0b';  // оранжевый — недобор
            return '#22c55e';                        // зелёный — норма и выше
          };
          
          // ЖИРЫ: баланс важен, но не критичен
          // < 50% — мало (гормоны, усвоение витаминов)
          // 50-80% — немного мало
          // 80-120% — отлично
          // 120-150% — многовато (но не критично)
          // > 150% — перебор
          const getFatColor = (actual, norm) => {
            if (!norm || norm === 0) return '#6b7280';
            const ratio = actual / norm;
            if (ratio < 0.5) return '#ef4444';      // красный — критически мало
            if (ratio < 0.8) return '#f59e0b';      // оранжевый — маловато
            if (ratio <= 1.2) return '#22c55e';     // зелёный — в норме
            if (ratio <= 1.5) return '#f59e0b';     // оранжевый — многовато
            return '#ef4444';                        // красный — сильный перебор
          };
          
          // УГЛЕВОДЫ: зависит от дефицита калорий
          // При дефиците: меньше углеводов = лучше (кетоз, жиросжигание)
          // Без дефицита: норма важна для энергии
          const getCarbsColor = (actual, norm, hasDeficit) => {
            if (!norm || norm === 0) return '#6b7280';
            const ratio = actual / norm;
            
            if (hasDeficit) {
              // При дефиците: меньше углеводов — хорошо!
              if (ratio < 0.3) return '#f59e0b';    // слишком мало даже для дефицита
              if (ratio <= 0.8) return '#22c55e';   // отлично для похудения
              if (ratio <= 1.0) return '#22c55e';   // норма — ОК
              if (ratio <= 1.2) return '#f59e0b';   // немного много для дефицита
              return '#ef4444';                      // перебор — плохо для дефицита
            } else {
              // Без дефицита: стандартная логика
              if (ratio < 0.5) return '#ef4444';    // мало энергии
              if (ratio < 0.8) return '#f59e0b';    // недобор
              if (ratio <= 1.1) return '#22c55e';   // норма
              if (ratio <= 1.3) return '#f59e0b';   // немного много
              return '#ef4444';                      // перебор
            }
          };
          
          // Собираем массив бейджей с описаниями (до 2 штук)
          // { emoji, desc } — emoji и описание при тапе
          const getBadges = (color, isProtein, ratio, contextEmoji, contextDesc) => {
            const badges = [];
            
            // Статус по цвету (приоритет 1)
            if (color === '#ef4444') {
              if (ratio < 0.6) {
                badges.push({ emoji: '⚠️', desc: 'Критически мало! Нужно добавить.' });
              } else {
                badges.push({ emoji: '⚠️', desc: 'Перебор! Слишком много.' });
              }
            } else if (color === '#22c55e') {
              if (isProtein && ratio >= 1.2) {
                badges.push({ emoji: '💪', desc: 'Отлично! Много белка для мышц.' });
              } else if (ratio >= 0.95 && ratio <= 1.05) {
                badges.push({ emoji: '✓', desc: 'Идеально! Точно в норме.' });
              }
            }
            
            // Контекст (приоритет 2) — добавляем если есть место
            if (contextEmoji && badges.length < 2) {
              badges.push({ emoji: contextEmoji, desc: contextDesc });
            }
            
            return badges;
          };
          
          const hasDeficit = dayTargetDef < 0; // дефицит если отрицательный %
          const hasTraining = (day.trainings && day.trainings.length > 0) || train1k + train2k > 0;
          
          const protRatio = (dayTot.prot || 0) / (normAbs.prot || 1);
          const fatRatio = (dayTot.fat || 0) / (normAbs.fat || 1);
          const carbsRatio = (dayTot.carbs || 0) / (normAbs.carbs || 1);
          
          const protColor = getProteinColor(dayTot.prot || 0, normAbs.prot, hasTraining);
          const fatColor = getFatColor(dayTot.fat || 0, normAbs.fat);
          const carbsColor = getCarbsColor(dayTot.carbs || 0, normAbs.carbs, hasDeficit);
          
          // Бейджи для каждого макроса (расширенные данные для popup)
          const protBadges = getBadges(protColor, true, protRatio, 
            hasTraining ? '🏋️' : null, 'Сегодня тренировка — белок важнее!');
          const fatBadges = getBadges(fatColor, false, fatRatio, null, null);
          const carbsBadges = getBadges(carbsColor, false, carbsRatio,
            hasDeficit ? '📉' : null, 'Режим дефицита — меньше углеводов = лучше');
          
          // Рендер бейджей с popup по тапу
          const renderBadges = (badges, macro, value, norm, ratio, color) => {
            if (!badges || badges.length === 0) return null;
            return React.createElement('div', { className: 'macro-ring-badges' },
              badges.map((b, i) => React.createElement('span', {
                key: i,
                className: 'macro-ring-badge',
                onClick: (e) => {
                  e.stopPropagation();
                  const rect = e.target.getBoundingClientRect();
                  setMacroBadgePopup({
                    macro,
                    emoji: b.emoji,
                    desc: b.desc,
                    value: Math.round(value),
                    norm: Math.round(norm),
                    ratio,
                    color,
                    allBadges: badges,
                    x: rect.left + rect.width / 2,
                    y: rect.top
                  });
                  haptic('light');
                }
              }, b.emoji))
            );
          };
          
          // Функция открытия popup для круга
          const openRingPopup = (e, macro, value, norm, ratio, color, badges) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            setMacroBadgePopup({
              macro,
              emoji: null,
              desc: null,
              value: Math.round(value || 0),
              norm: Math.round(norm || 0),
              ratio,
              color,
              allBadges: badges || [],
              x: rect.left + rect.width / 2,
              y: rect.bottom
            });
            haptic('light');
          };
          
          return React.createElement('div', { className: 'macro-rings' },
          // Белки
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { 
              className: 'macro-ring' + (protColor === '#ef4444' ? ' macro-ring-pulse' : ''),
              onClick: (e) => openRingPopup(e, 'Белки', dayTot.prot, normAbs.prot, protRatio, protColor, protBadges),
              style: { cursor: 'pointer' }
            },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { 
                    strokeDasharray: Math.min(100, protRatio * 100) + ' 100',
                    stroke: protColor
                  }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value', style: { color: protColor } }, 
                Math.round(dayTot.prot || 0)
              )
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Белки'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.prot || 0) + 'г'),
            renderBadges(protBadges, 'Белки', dayTot.prot, normAbs.prot, protRatio, protColor)
          ),
          // Жиры
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { 
              className: 'macro-ring' + (fatColor === '#ef4444' ? ' macro-ring-pulse' : ''),
              onClick: (e) => openRingPopup(e, 'Жиры', dayTot.fat, normAbs.fat, fatRatio, fatColor, fatBadges),
              style: { cursor: 'pointer' }
            },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { 
                    strokeDasharray: Math.min(100, fatRatio * 100) + ' 100',
                    stroke: fatColor
                  }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value', style: { color: fatColor } }, 
                Math.round(dayTot.fat || 0)
              )
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Жиры'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.fat || 0) + 'г'),
            renderBadges(fatBadges, 'Жиры', dayTot.fat, normAbs.fat, fatRatio, fatColor)
          ),
          // Углеводы
          React.createElement('div', { className: 'macro-ring-item' },
            React.createElement('div', { 
              className: 'macro-ring' + (carbsColor === '#ef4444' ? ' macro-ring-pulse' : ''),
              onClick: (e) => openRingPopup(e, 'Углеводы', dayTot.carbs, normAbs.carbs, carbsRatio, carbsColor, carbsBadges),
              style: { cursor: 'pointer' }
            },
              React.createElement('svg', { viewBox: '0 0 36 36', className: 'macro-ring-svg' },
                React.createElement('circle', { className: 'macro-ring-bg', cx: 18, cy: 18, r: 15.9 }),
                React.createElement('circle', { 
                  className: 'macro-ring-fill', 
                  cx: 18, cy: 18, r: 15.9,
                  style: { 
                    strokeDasharray: Math.min(100, carbsRatio * 100) + ' 100',
                    stroke: carbsColor
                  }
                })
              ),
              React.createElement('span', { className: 'macro-ring-value', style: { color: carbsColor } }, 
                Math.round(dayTot.carbs || 0)
              )
            ),
            React.createElement('span', { className: 'macro-ring-label' }, 'Углеводы'),
            React.createElement('span', { className: 'macro-ring-target' }, '/ ' + Math.round(normAbs.carbs || 0) + 'г'),
            renderBadges(carbsBadges, 'Углеводы', dayTot.carbs, normAbs.carbs, carbsRatio, carbsColor)
          )
        );
        })(),
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
          // Тренд под значением + DEV кнопка очистки
          day.weightMorning && React.createElement('div', { className: 'weight-trend-row' },
            weightTrend && React.createElement('div', { 
              className: 'weight-card-trend ' + (weightTrend.direction === 'down' ? 'trend-down' : weightTrend.direction === 'up' ? 'trend-up' : 'trend-same')
            }, 
              React.createElement('span', { className: 'trend-arrow' }, weightTrend.direction === 'down' ? '↓' : weightTrend.direction === 'up' ? '↑' : '→'),
              weightTrend.text.replace(/[^а-яА-Я0-9.,\-+\s]/g, '').trim()
            ),
            // DEV: Мини-кнопка очистки веса
            React.createElement('button', {
              className: 'dev-clear-weight-mini',
              onClick: (e) => {
                e.stopPropagation();
                if (!confirm('🗑️ Очистить вес за сегодня?\n\nЭто позволит увидеть Morning Check-in заново.')) return;
                setDay({
                  ...day,
                  weightMorning: null,
                  sleepStart: null,
                  sleepEnd: null,
                  sleepHours: null,
                  sleepQuality: null
                });
                setTimeout(() => window.location.reload(), 100);
              },
              title: 'DEV: Очистить вес для теста Morning Check-in'
            }, '×')
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
    const waterCard = React.createElement('div', { id: 'water-card', className: 'compact-water compact-card' },
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
            React.createElement('div', { 
              className: 'water-ring-center',
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMetricPopup({
                  type: 'water',
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  data: {
                    value: day.waterMl || 0,
                    goal: waterGoal,
                    ratio: (day.waterMl || 0) / waterGoal,
                    breakdown: waterGoalBreakdown,
                    lastDrink: waterLastDrink
                  }
                });
                haptic('light');
              },
              style: { cursor: 'pointer' }
            },
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
          
          // Прогресс-бар с волной
          React.createElement('div', { className: 'water-progress-inline' },
            // 💧 Падающая капля
            showWaterDrop && React.createElement('div', { className: 'water-drop-container' },
              React.createElement('div', { className: 'water-drop' }),
              React.createElement('div', { className: 'water-splash' })
            ),
            // Заливка
            React.createElement('div', { 
              className: 'water-progress-fill',
              style: { width: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
            }),
            // Пузырьки (на уровне контейнера, чтобы не обрезались)
            (day.waterMl || 0) > 0 && React.createElement('div', { className: 'water-bubbles' },
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' }),
              React.createElement('div', { className: 'water-bubble' })
            ),
            // Блик сверху
            React.createElement('div', { className: 'water-shine' }),
            // Волна на краю заливки
            (day.waterMl || 0) > 0 && ((day.waterMl || 0) / waterGoal) < 1 && React.createElement('div', {
              className: 'water-wave-edge',
              style: { left: Math.min(100, ((day.waterMl || 0) / waterGoal) * 100) + '%' }
            })
          ),
          
          // Пресеты в ряд
          React.createElement('div', { className: 'water-presets-row' },
            waterPresets.map(preset => 
              React.createElement('button', {
                key: preset.ml,
                className: 'water-preset-compact',
                onClick: () => addWater(preset.ml, true) // skipScroll: уже внутри карточки
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
      
      // Слайдер шагов с зоной защиты от свайпа
      React.createElement('div', { className: 'steps-slider-container no-swipe-zone' },
        React.createElement('div', { className: 'steps-slider-header' },
          React.createElement('span', { className: 'steps-label' }, '👟 Шаги'),
          React.createElement('span', { className: 'steps-value' }, 
            // Фактические шаги — кликабельные с подсказкой
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setMetricPopup({
                  type: 'steps',
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  data: {
                    value: stepsValue,
                    goal: stepsGoal,
                    ratio: stepsValue / stepsGoal,
                    kcal: stepsK,
                    color: stepsColor
                  }
                });
                haptic('light');
              },
              style: { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' },
              title: 'Нажмите для подробностей'
            },
              React.createElement('b', { style: { color: stepsColor } }, stepsValue.toLocaleString())
            ),
            ' / ',
            // Цель шагов — с кнопкой редактирования
            React.createElement('span', {
              onClick: (e) => {
                e.stopPropagation();
                openStepsGoalPicker();
                haptic('light');
              },
              style: { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' },
              title: 'Изменить цель'
            },
              React.createElement('b', { className: 'steps-goal' }, stepsGoal.toLocaleString()),
              React.createElement('span', { style: { fontSize: '12px', opacity: 0.7 } }, '✏️')
            ),
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
      
      // === FAB группа: вода + советы ===
      (!isMobile || mobileSubTab === 'stats') && React.createElement('div', {
        className: 'fab-group'
      },
        // FAB для показа советов (💡)
        React.createElement('button', {
          className: 'advice-fab' + (totalAdviceCount > 0 ? ' has-advice' : ''),
          onClick: () => {
            if (totalAdviceCount > 0) {
              setAdviceTrigger('manual');
              setAdviceExpanded(true);
              setToastVisible(true);
              setToastDismissed(false);
              haptic('light');
            } else {
              // Нет активных советов — показываем мини-сообщение
              setAdviceTrigger('manual_empty');
              setToastVisible(true);
              setToastDismissed(false);
              if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
              toastTimeoutRef.current = setTimeout(() => {
                setToastVisible(false);
                setAdviceTrigger(null);
              }, 2000);
            }
          },
          'aria-label': totalAdviceCount > 0 ? `Показать ${totalAdviceCount} советов` : 'Советов нет'
        },
          React.createElement('span', { className: 'advice-fab-icon' }, '💡'),
          totalAdviceCount > 0 && React.createElement('span', { className: 'advice-fab-badge' }, totalAdviceCount)
        ),
        // FAB для быстрого добавления воды (+200мл)
        React.createElement('button', {
          className: 'water-fab',
          onClick: () => addWater(200),
          'aria-label': 'Добавить стакан воды'
        }, '🥛')
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
      
      // === Manual Advice List (полноэкранный список советов) ===
      adviceTrigger === 'manual' && adviceRelevant?.length > 0 && toastVisible && (() => {
        const { sorted, groups } = getSortedGroupedAdvices(adviceRelevant);
        const activeCount = sorted.filter(a => !dismissedAdvices.has(a.id)).length;
        const groupKeys = Object.keys(groups);
        
        return React.createElement('div', {
          className: 'advice-list-overlay',
          onClick: dismissToast
        },
          React.createElement('div', { 
            className: `advice-list-container${dismissAllAnimation ? ' shake-warning' : ''}`,
            onClick: e => e.stopPropagation()
          },
            // Заголовок
            React.createElement('div', { className: 'advice-list-header' },
              React.createElement('span', null, `💡 Советы (${activeCount})`),
              React.createElement('div', { className: 'advice-list-header-actions' },
                activeCount > 1 && React.createElement('button', { 
                  className: 'advice-list-dismiss-all',
                  onClick: handleDismissAll,
                  disabled: dismissAllAnimation
                }, '✓ Все'),
                React.createElement('button', { 
                  className: 'advice-list-close',
                  onClick: dismissToast
                }, '×')
              )
            ),
            // Список советов с группировкой
            React.createElement('div', { className: 'advice-list-items' },
              groupKeys.length > 1 
                ? // С группировкой
                  groupKeys.map(category => {
                    const categoryAdvices = groups[category];
                    const activeCategoryAdvices = categoryAdvices.filter(a => !dismissedAdvices.has(a.id));
                    if (activeCategoryAdvices.length === 0) return null;
                    
                    return React.createElement('div', { 
                      key: category,
                      className: 'advice-group'
                    },
                      React.createElement('div', { className: 'advice-group-header' },
                        ADVICE_CATEGORY_NAMES[category] || category
                      ),
                      activeCategoryAdvices.map((advice, index) => 
                        renderAdviceCard(advice, index, sorted.indexOf(advice))
                      )
                    );
                  })
                : // Без группировки (одна категория)
                  sorted.filter(a => !dismissedAdvices.has(a.id))
                    .map((advice, index) => renderAdviceCard(advice, index, index))
            ),
            // Подсказки
            activeCount > 0 && React.createElement('div', { className: 'advice-list-hints' },
              React.createElement('span', { className: 'advice-list-hint-item' }, '← прочитано'),
              React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
              React.createElement('span', { className: 'advice-list-hint-item' }, 'скрыть →'),
              React.createElement('span', { className: 'advice-list-hint-divider' }, '•'),
              React.createElement('span', { className: 'advice-list-hint-item' }, 'удерживать = детали')
            )
          )
        );
        
        function renderAdviceCard(advice, localIndex, globalIndex) {
          const isDismissed = dismissedAdvices.has(advice.id);
          const swipeState = adviceSwipeState[advice.id] || { x: 0, direction: null };
          const swipeX = swipeState.x;
          const swipeDirection = swipeState.direction;
          const swipeProgress = Math.min(1, Math.abs(swipeX) / 100);
          const isExpanded = expandedAdviceId === advice.id;
          
          return React.createElement('div', { 
            key: advice.id,
            className: `advice-list-item-wrapper${isDismissed ? ' dismissed' : ''}`,
            style: { 
              animationDelay: `${globalIndex * 50}ms`,
              '--stagger-delay': `${globalIndex * 50}ms`
            }
          },
            // Фон слева "Прочитано" (зелёный)
            React.createElement('div', { 
              className: 'advice-list-item-bg advice-list-item-bg-left',
              style: { opacity: swipeDirection === 'left' ? swipeProgress : 0 }
            },
              React.createElement('span', null, '✓ Прочитано')
            ),
            // Фон справа "Скрыть" (оранжевый)
            React.createElement('div', { 
              className: 'advice-list-item-bg advice-list-item-bg-right',
              style: { opacity: swipeDirection === 'right' ? swipeProgress : 0 }
            },
              React.createElement('span', null, '🔕 До завтра')
            ),
            // Сам совет
            React.createElement('div', { 
              className: `advice-list-item advice-list-item-${advice.type}${isExpanded ? ' expanded' : ''}`,
              style: { 
                transform: `translateX(${swipeX}px)`,
                opacity: 1 - swipeProgress * 0.3
              },
              onTouchStart: (e) => {
                handleAdviceSwipeStart(advice.id, e);
                handleAdviceLongPressStart(advice.id);
              },
              onTouchMove: (e) => {
                handleAdviceSwipeMove(advice.id, e);
                handleAdviceLongPressEnd();
              },
              onTouchEnd: () => {
                handleAdviceSwipeEnd(advice.id);
                handleAdviceLongPressEnd();
              }
            },
              React.createElement('span', { className: 'advice-list-icon' }, advice.icon),
              React.createElement('div', { className: 'advice-list-content' },
                React.createElement('span', { className: 'advice-list-text' }, advice.text),
                isExpanded && advice.details && React.createElement('div', { 
                  className: 'advice-list-details'
                }, advice.details)
              )
            )
          );
        }
      })(),
      
      // === Empty advice toast ===
      adviceTrigger === 'manual_empty' && toastVisible && React.createElement('div', {
        className: 'macro-toast macro-toast-success visible',
        role: 'alert',
        onClick: dismissToast,
        style: { transform: 'translateX(-50%)' }
      },
        React.createElement('div', { className: 'macro-toast-main' },
          React.createElement('span', { className: 'macro-toast-icon' }, '✨'),
          React.createElement('span', { className: 'macro-toast-text' }, 'Всё отлично! Советов нет'),
          React.createElement('button', { 
            className: 'macro-toast-close', 
            onClick: (e) => { e.stopPropagation(); dismissToast(); } 
          }, '×')
        )
      ),
      
      // === Auto Toast (для автоматических советов — tab_open, product_added) ===
      adviceTrigger !== 'manual' && adviceTrigger !== 'manual_empty' && advicePrimary && toastVisible && React.createElement('div', {
        className: 'macro-toast macro-toast-' + advicePrimary.type + (adviceExpanded ? ' expanded' : '') + ' visible',
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
        React.createElement('div', { className: 'macro-toast-main' },
          React.createElement('span', { className: 'macro-toast-icon' }, advicePrimary.icon),
          React.createElement('span', { className: 'macro-toast-text' }, advicePrimary.text),
          adviceCount > 1 && React.createElement('span', { className: 'macro-toast-badge' }, `+${adviceCount - 1}`),
          React.createElement('button', { 
            className: 'macro-toast-close', 
            onClick: (e) => { e.stopPropagation(); dismissToast(); } 
          }, '×')
        ),
        // Progress bar (только для автоматических)
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
              // Подсказка для первого приёма в день
              (day.meals || []).length === 0 && editMode === 'new' && React.createElement('div', { className: 'mood-hint-first' },
                '💡 Ставьте первую оценку, которая пришла в голову — это самое верное интуитивное решение'
              ),
              // Helper функции для слайдеров
              // Dynamic emoji по значению
              ...(() => {
                const getMoodEmoji = (v) => ['😢','😢','😕','😕','😐','😐','🙂','🙂','😊','😊','😄'][v] || '😊';
                const getWellbeingEmoji = (v) => ['🤒','🤒','😓','😓','😐','😐','🙂','🙂','💪','💪','🏆'][v] || '💪';
                const getStressEmoji = (v) => ['😌','😌','🙂','🙂','😐','😐','😟','😟','😰','😰','😱'][v] || '😰';
                
                // Composite mood face на основе всех трёх оценок
                const getCompositeFace = () => {
                  const m = pendingMealMood.mood || 5;
                  const w = pendingMealMood.wellbeing || 5;
                  const s = pendingMealMood.stress || 5;
                  const avg = (m + w + (10 - s)) / 3; // stress инвертируем
                  if (avg >= 8) return { emoji: '🤩', text: 'Супер!' };
                  if (avg >= 6.5) return { emoji: '😊', text: 'Хорошо' };
                  if (avg >= 5) return { emoji: '😐', text: 'Норм' };
                  if (avg >= 3.5) return { emoji: '😕', text: 'Так себе' };
                  return { emoji: '😢', text: 'Плохо' };
                };
                const compositeFace = getCompositeFace();
                
                // ⏰ Таймер с последнего приёма пищи
                const getTimeSinceLastMeal = () => {
                  const meals = day.meals || [];
                  if (meals.length === 0) return null;
                  const lastMeal = meals[meals.length - 1];
                  if (!lastMeal.time) return null;
                  
                  const [h, m] = lastMeal.time.split(':').map(Number);
                  const lastMealDate = new Date();
                  lastMealDate.setHours(h, m, 0, 0);
                  
                  const now = new Date();
                  const diffMs = now - lastMealDate;
                  if (diffMs < 0) return null; // прошлый день
                  
                  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                  
                  // Инсулиновая волна из профиля (по умолчанию 4 часа)
                  const insulinWave = prof?.insulinWaveHours || 4;
                  const isInsulinOk = diffHours >= insulinWave;
                  
                  return {
                    hours: diffHours,
                    mins: diffMins,
                    isOk: isInsulinOk,
                    insulinWave
                  };
                };
                const timeSinceLastMeal = getTimeSinceLastMeal();
                
                // 🎉 Триггер confetti при идеальных оценках (используем состояние из родительского компонента)
                const triggerConfetti = () => {
                  if (!showConfetti) {
                    setShowConfetti(true);
                    // Haptic celebration
                    if (navigator.vibrate) navigator.vibrate([50, 50, 50, 50, 100]);
                    // Звук celebration
                    try {
                      const ctx = new (window.AudioContext || window.webkitAudioContext)();
                      const playNote = (freq, time, dur) => {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.type = 'sine';
                        osc.frequency.value = freq;
                        gain.gain.setValueAtTime(0.06, ctx.currentTime + time);
                        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + dur);
                        osc.start(ctx.currentTime + time);
                        osc.stop(ctx.currentTime + time + dur);
                      };
                      // Мажорный аккорд C-E-G-C
                      playNote(523.25, 0, 0.15);
                      playNote(659.25, 0.1, 0.15);
                      playNote(783.99, 0.2, 0.15);
                      playNote(1046.50, 0.3, 0.2);
                    } catch(e) {}
                    // Автоскрытие через 2 секунды
                    setTimeout(() => setShowConfetti(false), 2000);
                  }
                };
                
                // Цвет значения по позиции (positive: red→blue→green)
                const getPositiveColor = (v) => {
                  if (v <= 3) return '#ef4444';
                  if (v <= 5) return '#3b82f6';
                  if (v <= 7) return '#22c55e';
                  return '#10b981';
                };
                // Negative: green→blue→red (для стресса)
                const getNegativeColor = (v) => {
                  if (v <= 3) return '#10b981';
                  if (v <= 5) return '#3b82f6';
                  if (v <= 7) return '#eab308';
                  return '#ef4444';
                };
                
                // Haptic feedback с интенсивностью
                const triggerHaptic = (intensity = 10) => {
                  if (navigator.vibrate) navigator.vibrate(intensity);
                };
                
                // Звуковой tick (очень тихий) + success звук
                const playTick = (() => {
                  let lastValue = null;
                  return (value) => {
                    if (lastValue !== null && lastValue !== value) {
                      try {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain);
                        gain.connect(ctx.destination);
                        osc.frequency.value = 800 + value * 50;
                        gain.gain.value = 0.03;
                        osc.start();
                        osc.stop(ctx.currentTime + 0.02);
                      } catch (e) {}
                    }
                    lastValue = value;
                  };
                })();
                
                // Приятный звук при хорошей оценке (4-5)
                const playSuccessSound = () => {
                  try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
                    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); // E5
                    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16); // G5
                    gain.gain.setValueAtTime(0.05, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.25);
                  } catch (e) {}
                };
                
                // Корреляция с прошлыми данными
                const getCorrelationHint = () => {
                  try {
                    // Ищем похожие паттерны за последние 14 дней
                    const mood = pendingMealMood.mood;
                    const stress = pendingMealMood.stress;
                    if (mood === 0 && stress === 0) return null;
                    
                    for (let i = 1; i <= 14; i++) {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      const dData = lsGet('heys_dayv2_' + fmtDate(d), null);
                      if (!dData) continue;
                      
                      // Низкое настроение — ищем связь с недосыпом
                      if (mood > 0 && mood <= 3 && dData.sleepHours && dData.sleepHours < 6) {
                        const dMoods = (dData.meals || []).map(m => m.mood).filter(v => v > 0);
                        const avgMood = dMoods.length > 0 ? dMoods.reduce((a,b) => a+b, 0) / dMoods.length : 5;
                        if (avgMood <= 4) {
                          return { icon: '💡', text: `${i} дн. назад при ${dData.sleepHours}ч сна тоже было настроение ${Math.round(avgMood)}` };
                        }
                      }
                      
                      // Высокий стресс — ищем связь с переработкой
                      if (stress >= 7) {
                        const dStress = (dData.meals || []).map(m => m.stress).filter(v => v > 0);
                        const avgStress = dStress.length > 0 ? dStress.reduce((a,b) => a+b, 0) / dStress.length : 5;
                        if (avgStress >= 7) {
                          return { icon: '🔄', text: `${i} дн. назад тоже был высокий стресс — паттерн?` };
                        }
                      }
                    }
                  } catch (e) {}
                  return null;
                };
                
                const correlationHint = getCorrelationHint();
                
                // emojiAnimating теперь на уровне компонента (useState нельзя в IIFE)
                
                // Quick chips для комментария
                const getQuickChips = () => {
                  if (moodJournalState === 'negative') {
                    if (pendingMealMood.stress >= 7) return ['Работа', 'Дедлайн', 'Конфликт', 'Усталость'];
                    if (pendingMealMood.wellbeing <= 3) return ['Голова', 'Живот', 'Слабость', 'Недосып'];
                    if (pendingMealMood.mood <= 3) return ['Тревога', 'Грусть', 'Злость', 'Апатия'];
                    return ['Устал', 'Стресс', 'Плохо спал'];
                  }
                  if (moodJournalState === 'positive') {
                    if (pendingMealMood.mood >= 8) return ['Радость', 'Успех', 'Встреча', 'Природа'];
                    if (pendingMealMood.stress <= 2) return ['Отдых', 'Медитация', 'Прогулка', 'Спорт'];
                    return ['Хороший день', 'Энергия', 'Мотивация'];
                  }
                  return [];
                };
                
                // Подсчёт заполненности
                const filledCount = (pendingMealMood.mood > 0 ? 1 : 0) + (pendingMealMood.wellbeing > 0 ? 1 : 0) + (pendingMealMood.stress > 0 ? 1 : 0);
                
                // Разница с предыдущим приёмом
                const prevMeal = (day.meals || []).length > 0 ? day.meals[day.meals.length - 1] : null;
                const getDiff = (current, prev) => {
                  if (!prev || prev === 0 || current === 0) return null;
                  const diff = current - prev;
                  if (diff === 0) return { text: '=', className: 'diff-same' };
                  if (diff > 0) return { text: `+${diff}`, className: 'diff-up' };
                  return { text: `${diff}`, className: 'diff-down' };
                };
                
                // Сравнение с вчера (средние значения)
                const getYesterdayAvg = (field) => {
                  try {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yKey = 'heys_dayv2_' + fmtDate(yesterday);
                    const yData = lsGet(yKey, null);
                    if (!yData || !yData.meals || yData.meals.length === 0) return null;
                    const values = yData.meals.map(m => m[field]).filter(v => v > 0);
                    if (values.length === 0) return null;
                    return Math.round(values.reduce((a,b) => a+b, 0) / values.length);
                  } catch (e) { return null; }
                };
                const yesterdayMood = getYesterdayAvg('mood');
                const yesterdayWellbeing = getYesterdayAvg('wellbeing');
                const yesterdayStress = getYesterdayAvg('stress');
                
                // AI-подсказка корреляции (mood→eating pattern)
                const getAIInsight = () => {
                  try {
                    // Собираем историю за 14 дней
                    const history = [];
                    for (let i = 1; i <= 14; i++) {
                      const d = new Date();
                      d.setDate(d.getDate() - i);
                      const dData = lsGet('heys_dayv2_' + fmtDate(d), null);
                      if (dData && dData.meals && dData.meals.length > 0) {
                        // Средние оценки за день
                        const moods = dData.meals.map(m => m.mood).filter(v => v > 0);
                        const avgMood = moods.length > 0 ? moods.reduce((a,b) => a+b, 0) / moods.length : 5;
                        // Калории за день
                        let kcal = 0;
                        dData.meals.forEach(m => (m.items || []).forEach(item => {
                          const p = pIndex?.byId?.get(item.product_id);
                          if (p) kcal += ((+p.kcal100 || 0) * (+item.grams || 0) / 100);
                        }));
                        const ratio = kcal / (optimum || 2000);
                        history.push({ avgMood, ratio });
                      }
                    }
                    if (history.length < 5) return null;
                    
                    // Анализируем паттерны
                    const lowMoodDays = history.filter(h => h.avgMood < 5);
                    const highMoodDays = history.filter(h => h.avgMood >= 7);
                    
                    const currentMood = pendingMealMood.mood;
                    
                    if (currentMood < 5 && lowMoodDays.length >= 3) {
                      const avgOvereat = lowMoodDays.reduce((a, h) => a + h.ratio, 0) / lowMoodDays.length;
                      if (avgOvereat > 1.15) {
                        const overPct = Math.round((avgOvereat - 1) * 100);
                        return { icon: '🤖', text: `При плохом настроении ты обычно переедаешь на ${overPct}%` };
                      }
                    }
                    
                    if (currentMood >= 7 && highMoodDays.length >= 3) {
                      const avgRatio = highMoodDays.reduce((a, h) => a + h.ratio, 0) / highMoodDays.length;
                      if (avgRatio >= 0.85 && avgRatio <= 1.1) {
                        return { icon: '✨', text: 'Хорошее настроение = сбалансированное питание!' };
                      }
                    }
                    
                    return null;
                  } catch (e) { return null; }
                };
                const aiInsight = getAIInsight();
                
                // Контекстные подсказки по времени дня
                const getTimeHint = () => {
                  const hour = new Date().getHours();
                  if (hour >= 6 && hour < 10) return '☀️ Как проснулся?';
                  if (hour >= 12 && hour < 14) return '🍽️ Как после обеда?';
                  if (hour >= 14 && hour < 17) return '😴 Не клонит в сон?';
                  if (hour >= 17 && hour < 21) return '🌆 Как день прошёл?';
                  if (hour >= 21 || hour < 6) return '🌙 Устал за день?';
                  return null;
                };
                const timeHint = getTimeHint();
                
                // Mini sparkline для последних 5 приёмов
                const getSparkline = (field) => {
                  const meals = day.meals || [];
                  if (meals.length === 0) return null;
                  const values = meals.slice(-5).map(m => m[field] || 0).filter(v => v > 0);
                  if (values.length === 0) return null;
                  return values;
                };
                
                const renderSparkline = (values, isNegative = false) => {
                  if (!values || values.length === 0) return null;
                  const max = 10;
                  const width = 60;
                  const height = 16;
                  const step = width / Math.max(values.length - 1, 1);
                  const points = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ');
                  return React.createElement('svg', { 
                    className: 'mood-sparkline',
                    width: width, 
                    height: height,
                    viewBox: `0 0 ${width} ${height}`
                  },
                    React.createElement('polyline', {
                      points: points,
                      fill: 'none',
                      stroke: isNegative ? '#ef4444' : '#22c55e',
                      strokeWidth: 2,
                      strokeLinecap: 'round',
                      strokeLinejoin: 'round'
                    })
                  );
                };
                
                // Рендер метки "вчера"
                const renderYesterdayMark = (value, isNegative = false) => {
                  if (value === null) return null;
                  const pct = (value / 10) * 100;
                  return React.createElement('div', { 
                    className: 'yesterday-mark',
                    style: { left: `${pct}%` },
                    title: `Вчера в среднем: ${value}`
                  }, '▼');
                };
                
                const moodDiff = getDiff(pendingMealMood.mood, prevMeal?.mood);
                const wellbeingDiff = getDiff(pendingMealMood.wellbeing, prevMeal?.wellbeing);
                const stressDiff = getDiff(pendingMealMood.stress, prevMeal?.stress);
                
                // Вычисляем общее состояние на основе всех 3 оценок
                const { mood, wellbeing, stress } = pendingMealMood;
                const hasAnyRating = mood > 0 || wellbeing > 0 || stress > 0;
                
                // Позитивные сигналы: высокие mood/wellbeing (≥7), низкий stress (≤3)
                const positiveSignals = (mood >= 7 ? 1 : 0) + (wellbeing >= 7 ? 1 : 0) + (stress > 0 && stress <= 3 ? 1 : 0);
                // Негативные сигналы: низкие mood/wellbeing (≤3), высокий stress (≥7)
                const negativeSignals = (mood > 0 && mood <= 3 ? 1 : 0) + (wellbeing > 0 && wellbeing <= 3 ? 1 : 0) + (stress >= 7 ? 1 : 0);
                
                // Определяем состояние: positive, negative или neutral
                const moodJournalState = negativeSignals >= 2 ? 'negative' : // 2+ плохих = плохо
                                         negativeSignals === 1 && positiveSignals === 0 ? 'negative' : // 1 плохой и нет хороших = плохо  
                                         positiveSignals >= 2 ? 'positive' : // 2+ хороших = хорошо
                                         positiveSignals === 1 && negativeSignals === 0 ? 'positive' : // 1 хороший и нет плохих = хорошо
                                         'neutral'; // смешанные или нейтральные оценки
                
                // Детальный текст в зависимости от комбинации оценок
                const getJournalText = () => {
                  if (moodJournalState === 'negative') {
                    // Комбинации негативных состояний
                    if (stress >= 8 && mood <= 3 && wellbeing <= 3) return '😰 Тяжёлый момент — что происходит?';
                    if (stress >= 8 && mood <= 3) return 'Стресс + плохое настроение — расскажи';
                    if (stress >= 8 && wellbeing <= 3) return 'Стресс + плохое самочувствие — что случилось?';
                    if (mood <= 3 && wellbeing <= 3) return 'И настроение, и самочувствие... что не так?';
                    if (stress >= 7) return 'Что стрессует?';
                    if (wellbeing <= 3) return 'Плохое самочувствие — что беспокоит?';
                    if (mood <= 3) return 'Плохое настроение — что расстроило?';
                    return 'Что случилось?';
                  }
                  if (moodJournalState === 'positive') {
                    // Комбинации позитивных состояний
                    if (mood >= 9 && wellbeing >= 9 && stress <= 2) return '🌟 Идеальное состояние! В чём секрет?';
                    if (mood >= 8 && wellbeing >= 8) return '✨ Отлично себя чувствуешь! Что помогло?';
                    if (mood >= 8 && stress <= 2) return 'Отличное настроение и спокойствие!';
                    if (wellbeing >= 8 && stress <= 2) return 'Прекрасное самочувствие! Что способствует?';
                    if (mood >= 7) return 'Хорошее настроение! Что порадовало?';
                    if (wellbeing >= 7) return 'Хорошее самочувствие! Запиши причину';
                    if (stress <= 2) return 'Спокойствие — что помогает расслабиться?';
                    return 'Запиши что порадовало!';
                  }
                  // neutral — разные контексты
                  if (mood >= 5 && mood <= 6 && wellbeing >= 5 && wellbeing <= 6) return 'Стабильный день — любые мысли?';
                  if (stress >= 4 && stress <= 6) return 'Немного напряжения — хочешь записать?';
                  return 'Заметка о приёме пищи';
                };
                
                const getJournalPlaceholder = () => {
                  if (moodJournalState === 'negative') {
                    if (stress >= 7) return 'Работа, отношения, здоровье...';
                    if (wellbeing <= 3) return 'Симптомы, усталость, боль...';
                    if (mood <= 3) return 'Что расстроило или разозлило...';
                    return 'Расскажи что не так...';
                  }
                  if (moodJournalState === 'positive') {
                    if (mood >= 8 && wellbeing >= 8) return 'Что сделало день отличным?';
                    if (stress <= 2) return 'Медитация, прогулка, отдых...';
                    return 'Что сделало момент хорошим?';
                  }
                  return 'Любые мысли о еде или дне...';
                };

                const journalConfig = {
                  negative: { 
                    icon: '📝', 
                    text: getJournalText(),
                    placeholder: getJournalPlaceholder(),
                    btnText: 'Записать'
                  },
                  positive: {
                    icon: '✨',
                    text: getJournalText(),
                    placeholder: getJournalPlaceholder(),
                    btnText: 'Записать'
                  },
                  neutral: {
                    icon: '💭',
                    text: getJournalText(),
                    placeholder: getJournalPlaceholder(),
                    btnText: 'Записать'
                  }
                };
                
                // Slider handler с haptic, звуком и анимацией emoji
                const handleSliderChange = (field, value, prevValue) => {
                  triggerHaptic(value >= 8 || value <= 2 ? 15 : 10);
                  playTick(value);
                  
                  // Emoji анимация
                  if (value !== prevValue) {
                    const animType = (field === 'stress' && value >= 7) || 
                                     ((field === 'mood' || field === 'wellbeing') && value <= 3) 
                                     ? 'shake' : 'bounce';
                    setEmojiAnimating(prev => ({...prev, [field]: animType}));
                    setTimeout(() => setEmojiAnimating(prev => ({...prev, [field]: ''})), 400);
                  }
                  
                  // Success sound при хорошей оценке
                  if (value >= 8 && prevValue < 8) playSuccessSound();
                  
                  // Обновляем состояние
                  const newMood = {...pendingMealMood, [field]: value};
                  setPendingMealMood(newMood);
                  
                  // Проверяем идеальные оценки для confetti
                  const isPerfect = newMood.mood >= 8 && newMood.wellbeing >= 8 && 
                                    newMood.stress > 0 && newMood.stress <= 2;
                  if (isPerfect && !showConfetti) {
                    triggerConfetti();
                  }
                };
                
                // Добавить chip в комментарий
                const addChipToComment = (chip) => {
                  triggerHaptic(5);
                  const current = pendingMealMood.journalEntry || '';
                  const newEntry = current ? current + ', ' + chip : chip;
                  setPendingMealMood(prev => ({...prev, journalEntry: newEntry}));
                };
                
                return [
              // 🎉 Confetti animation
              showConfetti && React.createElement('div', { className: 'confetti-container', key: 'confetti' },
                ...Array(20).fill(0).map((_, i) => 
                  React.createElement('div', { 
                    key: 'confetti-' + i, 
                    className: 'confetti-piece',
                    style: {
                      left: (5 + Math.random() * 90) + '%',
                      animationDelay: (Math.random() * 0.5) + 's',
                      backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][i % 5]
                    }
                  })
                )
              ),
              
              // Progress dots
              React.createElement('div', { className: 'rating-progress-dots', key: 'progress-dots' },
                React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.mood > 0 ? ' filled' : '') }),
                React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.wellbeing > 0 ? ' filled' : '') }),
                React.createElement('div', { className: 'rating-progress-dot' + (pendingMealMood.stress > 0 ? ' filled' : '') })
              ),
              
              // ⏰ Таймер с последнего приёма
              timeSinceLastMeal && React.createElement('div', { 
                className: 'meal-timer-hint' + (timeSinceLastMeal.isOk ? ' ok' : ' warning'),
                key: 'meal-timer'
              },
                React.createElement('span', { className: 'meal-timer-icon' }, timeSinceLastMeal.isOk ? '✅' : '⏰'),
                React.createElement('span', { className: 'meal-timer-text' },
                  timeSinceLastMeal.hours > 0 
                    ? `${timeSinceLastMeal.hours}ч ${timeSinceLastMeal.mins}мин с прошлого приёма`
                    : `${timeSinceLastMeal.mins} мин с прошлого приёма`
                ),
                !timeSinceLastMeal.isOk && React.createElement('span', { className: 'meal-timer-wave' },
                  ` (инсулиновая волна ${timeSinceLastMeal.insulinWave}ч)`
                )
              ),
              
              // Mood Face Avatar (большое лицо вверху)
              React.createElement('div', { className: 'mood-face-avatar', key: 'mood-face' },
                React.createElement('span', { className: 'mood-face-emoji' + (showConfetti ? ' celebrate' : '') }, compositeFace.emoji),
                React.createElement('span', { className: 'mood-face-text' }, compositeFace.text)
              ),
              
              // Контекстная подсказка по времени
              timeHint && (day.meals || []).length === 0 && React.createElement('div', { className: 'mood-time-hint', key: 'time-hint' }, timeHint),
              
              // AI-инсайт
              aiInsight && React.createElement('div', { className: 'mood-ai-insight', key: 'ai-insight' },
                React.createElement('span', null, aiInsight.icon),
                React.createElement('span', null, aiInsight.text)
              ),
              
              // Корреляция с прошлыми данными
              correlationHint && React.createElement('div', { className: 'correlation-hint', key: 'correlation-hint' },
                React.createElement('span', { className: 'correlation-hint-icon' }, correlationHint.icon),
                React.createElement('span', { className: 'correlation-hint-text' }, correlationHint.text)
              ),
              
              // Слайдеры оценок
              React.createElement('div', { className: 'mood-sliders', key: 'mood-sliders' },
                // Настроение
                React.createElement('div', { className: 'mood-slider-row' },
                  React.createElement('div', { className: 'mood-slider-header' },
                    React.createElement('span', { 
                      className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.mood ? ' animate-' + emojiAnimating.mood : '')
                    }, getMoodEmoji(pendingMealMood.mood)),
                    React.createElement('span', { className: 'mood-slider-label' }, 'Настроение'),
                    React.createElement('span', { 
                      className: 'mood-slider-value' + (pendingMealMood.mood !== (prevMeal?.mood || 0) ? ' pulse' : ''), 
                      style: { color: pendingMealMood.mood === 0 ? '#999' : getPositiveColor(pendingMealMood.mood) }
                    }, pendingMealMood.mood === 0 ? '—' : pendingMealMood.mood),
                    moodDiff && React.createElement('span', { className: 'mood-diff ' + moodDiff.className }, moodDiff.text)
                  ),
                  // Quick presets
                  React.createElement('div', { className: 'mood-presets' },
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-bad' + (pendingMealMood.mood <= 3 && pendingMealMood.mood > 0 ? ' active' : ''),
                      onClick: () => { handleSliderChange('mood', 2, pendingMealMood.mood); }
                    }, '😢 Плохо'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-ok' + (pendingMealMood.mood >= 4 && pendingMealMood.mood <= 6 ? ' active' : ''),
                      onClick: () => { handleSliderChange('mood', 5, pendingMealMood.mood); }
                    }, '😐 Норм'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-good' + (pendingMealMood.mood >= 7 ? ' active' : ''),
                      onClick: () => { handleSliderChange('mood', 8, pendingMealMood.mood); }
                    }, '😊 Отлично')
                  ),
                  React.createElement('div', { className: 'mood-slider-track' },
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: pendingMealMood.mood,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => handleSliderChange('mood', parseInt(e.target.value))
                    }),
                    renderYesterdayMark(yesterdayMood)
                  ),
                  // Sparkline истории
                  (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                    renderSparkline(getSparkline('mood')),
                    React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                  )
                ),
                // Самочувствие
                React.createElement('div', { className: 'mood-slider-row' },
                  React.createElement('div', { className: 'mood-slider-header' },
                    React.createElement('span', { 
                      className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.wellbeing ? ' animate-' + emojiAnimating.wellbeing : '')
                    }, getWellbeingEmoji(pendingMealMood.wellbeing)),
                    React.createElement('span', { className: 'mood-slider-label' }, 'Самочувствие'),
                    React.createElement('span', { 
                      className: 'mood-slider-value' + (pendingMealMood.wellbeing !== (prevMeal?.wellbeing || 0) ? ' pulse' : ''), 
                      style: { color: pendingMealMood.wellbeing === 0 ? '#999' : getPositiveColor(pendingMealMood.wellbeing) }
                    }, pendingMealMood.wellbeing === 0 ? '—' : pendingMealMood.wellbeing),
                    wellbeingDiff && React.createElement('span', { className: 'mood-diff ' + wellbeingDiff.className }, wellbeingDiff.text)
                  ),
                  React.createElement('div', { className: 'mood-presets' },
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-bad' + (pendingMealMood.wellbeing <= 3 && pendingMealMood.wellbeing > 0 ? ' active' : ''),
                      onClick: () => { handleSliderChange('wellbeing', 2, pendingMealMood.wellbeing); }
                    }, '🤒 Плохо'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-ok' + (pendingMealMood.wellbeing >= 4 && pendingMealMood.wellbeing <= 6 ? ' active' : ''),
                      onClick: () => { handleSliderChange('wellbeing', 5, pendingMealMood.wellbeing); }
                    }, '😐 Норм'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-good' + (pendingMealMood.wellbeing >= 7 ? ' active' : ''),
                      onClick: () => { handleSliderChange('wellbeing', 8, pendingMealMood.wellbeing); }
                    }, '💪 Отлично')
                  ),
                  React.createElement('div', { className: 'mood-slider-track' },
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: pendingMealMood.wellbeing,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => handleSliderChange('wellbeing', parseInt(e.target.value))
                    }),
                    renderYesterdayMark(yesterdayWellbeing)
                  ),
                  (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                    renderSparkline(getSparkline('wellbeing')),
                    React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                  )
                ),
                // Стресс (инверсия)
                React.createElement('div', { className: 'mood-slider-row' },
                  React.createElement('div', { className: 'mood-slider-header' },
                    React.createElement('span', { 
                      className: 'mood-slider-emoji mood-emoji-dynamic' + (emojiAnimating.stress ? ' animate-' + emojiAnimating.stress : '')
                    }, getStressEmoji(pendingMealMood.stress)),
                    React.createElement('span', { className: 'mood-slider-label' }, 'Стресс'),
                    React.createElement('span', { 
                      className: 'mood-slider-value' + (pendingMealMood.stress !== (prevMeal?.stress || 0) ? ' pulse' : ''), 
                      style: { color: pendingMealMood.stress === 0 ? '#999' : getNegativeColor(pendingMealMood.stress) }
                    }, pendingMealMood.stress === 0 ? '—' : pendingMealMood.stress),
                    stressDiff && React.createElement('span', { className: 'mood-diff ' + (stressDiff.text.startsWith('+') ? 'diff-down' : stressDiff.text === '=' ? 'diff-same' : 'diff-up') }, stressDiff.text)
                  ),
                  React.createElement('div', { className: 'mood-presets' },
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-good' + (pendingMealMood.stress <= 3 && pendingMealMood.stress > 0 ? ' active' : ''),
                      onClick: () => { handleSliderChange('stress', 2, pendingMealMood.stress); }
                    }, '😌 Спокоен'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-ok' + (pendingMealMood.stress >= 4 && pendingMealMood.stress <= 6 ? ' active' : ''),
                      onClick: () => { handleSliderChange('stress', 5, pendingMealMood.stress); }
                    }, '😐 Норм'),
                    React.createElement('button', { 
                      className: 'mood-preset mood-preset-bad' + (pendingMealMood.stress >= 7 ? ' active' : ''),
                      onClick: () => { handleSliderChange('stress', 8, pendingMealMood.stress); }
                    }, '😰 Стресс')
                  ),
                  React.createElement('div', { className: 'mood-slider-track' },
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: pendingMealMood.stress,
                      className: 'mood-slider mood-slider-negative',
                      onChange: (e) => handleSliderChange('stress', parseInt(e.target.value))
                    }),
                    renderYesterdayMark(yesterdayStress, true)
                  ),
                  (day.meals || []).length > 0 && React.createElement('div', { className: 'mood-slider-footer' },
                    renderSparkline(getSparkline('stress'), true),
                    React.createElement('span', { className: 'mood-hint-change' }, 'за сегодня')
                  )
                )
              ),
              
              // Блок комментария — всегда виден, стиль меняется по всем 3 оценкам
              React.createElement('div', { 
                className: 'mood-journal-wrapper ' + moodJournalState, 
                key: 'journal-wrapper' 
              },
                React.createElement('div', { 
                  className: 'mood-journal-prompt ' + moodJournalState
                },
                  React.createElement('span', { className: 'mood-journal-icon' }, journalConfig[moodJournalState].icon),
                  React.createElement('span', { className: 'mood-journal-text' }, journalConfig[moodJournalState].text),
                  // Quick chips для быстрого ввода
                  getQuickChips().length > 0 && React.createElement('div', { 
                    className: 'quick-chips ' + moodJournalState 
                  },
                    getQuickChips().map(chip => 
                      React.createElement('button', { 
                        key: chip,
                        className: 'quick-chip' + ((pendingMealMood.journalEntry || '').includes(chip) ? ' selected' : ''),
                        onClick: () => addChipToComment(chip)
                      }, chip)
                    )
                  ),
                  // Поле ввода комментария
                  React.createElement('input', {
                    type: 'text',
                    className: 'mood-journal-input',
                    placeholder: journalConfig[moodJournalState].placeholder,
                    value: pendingMealMood.journalEntry || '',
                    onChange: (e) => setPendingMealMood(prev => ({...prev, journalEntry: e.target.value})),
                    onClick: (e) => e.stopPropagation()
                  })
                )
              )
                ];
              })()
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
      
      // Edit Grams Modal (slider-based, like MealAddProduct)
      editGramsTarget && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop grams-modal-backdrop', onClick: cancelEditGramsModal },
          React.createElement('div', { className: 'time-picker-modal grams-modal', onClick: e => e.stopPropagation() },
            // Ручка для свайпа
            React.createElement('div', { 
              className: 'bottom-sheet-handle',
              onTouchStart: handleSheetTouchStart,
              onTouchMove: handleSheetTouchMove,
              onTouchEnd: () => handleSheetTouchEnd(cancelEditGramsModal)
            }),
            // Header
            React.createElement('div', { className: 'time-picker-header' },
              React.createElement('button', { className: 'time-picker-cancel', onClick: cancelEditGramsModal }, 'Отмена'),
              React.createElement('span', { className: 'time-picker-title grams-modal-title' }, 
                editGramsTarget.product?.name || 'Граммы'
              ),
              React.createElement('button', { className: 'time-picker-confirm', onClick: confirmEditGramsModal }, 'Готово')
            ),
            // Preview: граммы = калории
            React.createElement('div', { className: 'grams-preview' },
              React.createElement('span', { className: 'grams-preview-value' }, editGramsValue + 'г'),
              React.createElement('span', { className: 'grams-preview-separator' }, '='),
              React.createElement('span', { className: 'grams-preview-kcal' }, 
                Math.round((editGramsTarget.product?.kcal100 || 0) * editGramsValue / 100) + ' ккал'
              )
            ),
            // 🍽️ Порции продукта (если есть)
            editPortions.length > 0 && React.createElement('div', { className: 'grams-portions' },
              editPortions.map((portion, idx) => {
                const isActive = editGramsValue === portion.grams;
                const isRecommended = editLastPortionGrams === portion.grams && !isActive;
                return React.createElement('button', {
                  key: idx,
                  className: 'grams-portion-btn' + (isActive ? ' active' : '') + (isRecommended ? ' recommended' : ''),
                  onClick: () => {
                    setEditGramsValue(portion.grams);
                    if (typeof haptic === 'function') haptic('light');
                  }
                }, 
                  React.createElement('span', { className: 'portion-name' }, portion.name),
                  React.createElement('span', { className: 'portion-grams' }, portion.grams + 'г')
                );
              })
            ),
            // Input field with stepper
            React.createElement('div', { className: 'grams-input-container' },
              React.createElement('button', {
                className: 'grams-stepper-btn',
                onClick: () => {
                  const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                  setEditGramsValue(Math.max(step, editGramsValue - step));
                  if (typeof haptic === 'function') haptic('light');
                }
              }, '−'),
              React.createElement('input', {
                ref: editGramsInputRef,
                type: 'number',
                inputMode: 'numeric',
                className: 'grams-input',
                value: editGramsValue,
                onChange: e => setEditGramsValue(Math.max(1, Math.min(2000, parseInt(e.target.value) || 0))),
                onFocus: e => e.target.select()
              }),
              React.createElement('span', { className: 'grams-input-suffix' }, 'г'),
              React.createElement('button', {
                className: 'grams-stepper-btn',
                onClick: () => {
                  const step = editPortions.length > 0 ? editPortions[0].grams : 10;
                  setEditGramsValue(Math.min(2000, editGramsValue + step));
                  if (typeof haptic === 'function') haptic('light');
                }
              }, '+')
            ),
            // Slider
            React.createElement('div', { className: 'grams-slider-container' },
              React.createElement('div', {
                className: 'grams-slider',
                onMouseDown: handleEditGramsDrag,
                onTouchStart: handleEditGramsDrag
              },
                React.createElement('div', { className: 'grams-slider-track' }),
                React.createElement('div', { 
                  className: 'grams-slider-fill',
                  style: { width: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
                }),
                React.createElement('div', { 
                  className: 'grams-slider-thumb',
                  style: { left: Math.min(100, Math.max(0, (editGramsValue - 10) / (500 - 10) * 100)) + '%' }
                }),
                // Метки
                [100, 200, 300, 400].map(mark => 
                  React.createElement('div', {
                    key: mark,
                    className: 'grams-slider-mark',
                    style: { left: ((mark - 10) / (500 - 10) * 100) + '%' }
                  })
                )
              ),
              React.createElement('div', { className: 'grams-slider-labels' },
                React.createElement('span', null, '10'),
                React.createElement('span', null, '500')
              )
            ),
            // Presets
            React.createElement('div', { className: 'grams-presets' },
              [50, 100, 150, 200, 250].map(preset =>
                React.createElement('button', {
                  key: preset,
                  className: 'grams-preset' + (editGramsValue === preset ? ' active' : ''),
                  onClick: () => {
                    setEditGramsValue(preset);
                    try { navigator.vibrate?.(5); } catch(e) {}
                  }
                }, preset + 'г')
              )
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
                trainingPickerStep >= 2 ? '← Назад' : 'Отмена'
              ),
              React.createElement('span', { className: 'time-picker-title' }, 
                trainingPickerStep === 1 ? '🏋️ Тренировка' : 
                trainingPickerStep === 2 ? '⏱️ Зоны' : '⭐ Оценка'
              ),
              // Кнопка "Готово" неактивна если на шаге 2 и все зоны = 0
              (() => {
                const totalMinutes = trainingPickerStep === 2 
                  ? pendingTrainingZones.reduce((sum, idx) => sum + (parseInt(zoneMinutesValues[idx], 10) || 0), 0)
                  : 1; // На первом и третьем шаге всегда активна
                const isDisabled = trainingPickerStep === 2 && totalMinutes === 0;
                return React.createElement('button', { 
                  className: 'time-picker-confirm' + (isDisabled ? ' disabled' : ''), 
                  onClick: isDisabled ? undefined : confirmTrainingPicker,
                  disabled: isDisabled
                }, 
                  trainingPickerStep === 3 ? 'Готово' : 'Далее →'
                );
              })()
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
            ),
            
            // ШАГ 3: Оценки тренировки
            trainingPickerStep === 3 && (() => {
              // Определяем состояние на основе обеих оценок
              const quality = pendingTrainingQuality;
              const feelAfter = pendingTrainingFeelAfter;
              
              const positiveSignals = (quality >= 7 ? 1 : 0) + (feelAfter >= 7 ? 1 : 0);
              const negativeSignals = (quality > 0 && quality <= 3 ? 1 : 0) + (feelAfter > 0 && feelAfter <= 3 ? 1 : 0);
              
              const ratingState = negativeSignals >= 1 && positiveSignals === 0 ? 'negative' :
                                  positiveSignals >= 1 && negativeSignals === 0 ? 'positive' : 'neutral';
              
              // Цвет для значения оценки
              const getPositiveColor = (v) => {
                if (v <= 3) return '#ef4444';
                if (v <= 5) return '#eab308';
                if (v <= 7) return '#84cc16';
                return '#10b981';
              };
              
              // Эмодзи для качества тренировки
              const getQualityEmoji = (v) => 
                v === 0 ? '🤷' : v <= 2 ? '😫' : v <= 4 ? '😕' : v <= 6 ? '😐' : v <= 8 ? '💪' : '🔥';
              
              // Эмодзи для самочувствия после
              const getFeelEmoji = (v) => 
                v === 0 ? '🤷' : v <= 2 ? '🥵' : v <= 4 ? '😓' : v <= 6 ? '😌' : v <= 8 ? '😊' : '✨';
              
              // Текст для блока комментария
              const getCommentText = () => {
                if (ratingState === 'negative') {
                  if (quality <= 3 && feelAfter <= 3) return 'Тяжёлая тренировка — что пошло не так?';
                  if (quality <= 3) return 'Тренировка не удалась — что помешало?';
                  if (feelAfter <= 3) return 'Плохое самочувствие после — что случилось?';
                  return 'Что пошло не так?';
                }
                if (ratingState === 'positive') {
                  if (quality >= 8 && feelAfter >= 8) return '🎉 Отличная тренировка! Что помогло?';
                  if (quality >= 7) return 'Хорошая тренировка! Запиши что понравилось';
                  if (feelAfter >= 7) return 'Отличное самочувствие! В чём секрет?';
                  return 'Что понравилось?';
                }
                return 'Заметка о тренировке';
              };
              
              return React.createElement(React.Fragment, null,
                // Оценка качества тренировки
                React.createElement('div', { className: 'training-rating-section' },
                  React.createElement('div', { className: 'training-rating-row' },
                    React.createElement('div', { className: 'training-rating-header' },
                      React.createElement('span', { className: 'training-rating-emoji' }, getQualityEmoji(quality)),
                      React.createElement('span', { className: 'training-rating-label' }, 'Качество тренировки'),
                      React.createElement('span', { 
                        className: 'training-rating-value',
                        style: { color: quality === 0 ? '#9ca3af' : getPositiveColor(quality) }
                      }, quality === 0 ? '—' : quality + '/10')
                    ),
                    React.createElement('div', { className: 'training-rating-presets' },
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-bad' + (quality > 0 && quality <= 3 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingQuality(2); }
                      }, '😫 Плохо'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-ok' + (quality >= 4 && quality <= 6 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingQuality(5); }
                      }, '😐 Норм'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-good' + (quality >= 7 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingQuality(8); }
                      }, '💪 Отлично')
                    ),
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: quality,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => { haptic('light'); setPendingTrainingQuality(parseInt(e.target.value)); }
                    })
                  ),
                  
                  // Оценка самочувствия после
                  React.createElement('div', { className: 'training-rating-row' },
                    React.createElement('div', { className: 'training-rating-header' },
                      React.createElement('span', { className: 'training-rating-emoji' }, getFeelEmoji(feelAfter)),
                      React.createElement('span', { className: 'training-rating-label' }, 'Самочувствие после'),
                      React.createElement('span', { 
                        className: 'training-rating-value',
                        style: { color: feelAfter === 0 ? '#9ca3af' : getPositiveColor(feelAfter) }
                      }, feelAfter === 0 ? '—' : feelAfter + '/10')
                    ),
                    React.createElement('div', { className: 'training-rating-presets' },
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-bad' + (feelAfter > 0 && feelAfter <= 3 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingFeelAfter(2); }
                      }, '🥵 Устал'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-ok' + (feelAfter >= 4 && feelAfter <= 6 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingFeelAfter(5); }
                      }, '😌 Норм'),
                      React.createElement('button', { 
                        className: 'mood-preset mood-preset-good' + (feelAfter >= 7 ? ' active' : ''),
                        onClick: () => { haptic('light'); setPendingTrainingFeelAfter(8); }
                      }, '✨ Энергия')
                    ),
                    React.createElement('input', {
                      type: 'range',
                      min: 0,
                      max: 10,
                      value: feelAfter,
                      className: 'mood-slider mood-slider-positive',
                      onChange: (e) => { haptic('light'); setPendingTrainingFeelAfter(parseInt(e.target.value)); }
                    })
                  )
                ),
                
                // Блок комментария с quick chips
                (() => {
                  // Quick chips для тренировки
                  const trainingChips = ratingState === 'negative' 
                    ? ['Мало сил', 'Травма', 'Не выспался', 'Жарко', 'Нет мотивации']
                    : ratingState === 'positive'
                    ? ['Новый рекорд', 'Много энергии', 'Хороший сон', 'Правильно ел', 'В потоке']
                    : [];
                  
                  const addTrainingChip = (chip) => {
                    haptic('light');
                    const current = pendingTrainingComment || '';
                    setPendingTrainingComment(current ? current + ', ' + chip : chip);
                  };
                  
                  return React.createElement('div', { 
                    className: 'training-comment-wrapper ' + ratingState
                  },
                    React.createElement('div', { 
                      className: 'training-comment-prompt ' + ratingState
                    },
                      React.createElement('span', { className: 'training-comment-icon' }, 
                        ratingState === 'negative' ? '📝' : ratingState === 'positive' ? '✨' : '💭'
                      ),
                      React.createElement('span', { className: 'training-comment-text' }, getCommentText()),
                      // Quick chips
                      trainingChips.length > 0 && React.createElement('div', { 
                        className: 'quick-chips ' + ratingState 
                      },
                        trainingChips.map(chip => 
                          React.createElement('button', { 
                            key: chip,
                            className: 'quick-chip' + ((pendingTrainingComment || '').includes(chip) ? ' selected' : ''),
                            onClick: () => addTrainingChip(chip)
                          }, chip)
                        )
                      ),
                      React.createElement('input', {
                        type: 'text',
                        className: 'training-comment-input',
                        placeholder: ratingState === 'negative' ? 'Что пошло не так...' : 
                                     ratingState === 'positive' ? 'Что помогло...' : 'Любые мысли...',
                        value: pendingTrainingComment,
                        onChange: (e) => setPendingTrainingComment(e.target.value),
                        onClick: (e) => e.stopPropagation()
                      })
                    )
                  );
                })()
              );
            })()
          )
        ),
        document.body
      ),
      
      // Sleep Quality Picker Modal (красивый слайдер как в оценке дня)
      showSleepQualityPicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelSleepQualityPicker },
          React.createElement('div', { className: 'time-picker-modal sleep-quality-picker-modal', onClick: e => e.stopPropagation() },
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
            // Большой emoji и текст
            React.createElement('div', { className: 'sleep-quality-face' },
              React.createElement('span', { className: 'sleep-quality-face-emoji' }, 
                pendingSleepQuality === 0 ? '🤷' :
                pendingSleepQuality <= 2 ? '😫' :
                pendingSleepQuality <= 4 ? '😩' :
                pendingSleepQuality <= 5 ? '😐' :
                pendingSleepQuality <= 7 ? '😌' :
                pendingSleepQuality <= 9 ? '😊' : '🌟'
              ),
              React.createElement('span', { className: 'sleep-quality-face-text' }, 
                pendingSleepQuality === 0 ? 'Не указано' :
                pendingSleepQuality <= 2 ? 'Ужасно спал' :
                pendingSleepQuality <= 4 ? 'Плохо спал' :
                pendingSleepQuality <= 5 ? 'Средне' :
                pendingSleepQuality <= 7 ? 'Нормально' :
                pendingSleepQuality <= 9 ? 'Хорошо выспался' : 'Отлично выспался!'
              )
            ),
            // Большое число
            React.createElement('div', { className: 'sleep-quality-big-value' },
              React.createElement('span', { 
                className: 'sleep-quality-number',
                style: { 
                  color: pendingSleepQuality === 0 ? '#9ca3af' :
                         pendingSleepQuality <= 2 ? '#ef4444' :
                         pendingSleepQuality <= 4 ? '#f97316' :
                         pendingSleepQuality <= 5 ? '#eab308' :
                         pendingSleepQuality <= 7 ? '#84cc16' :
                         pendingSleepQuality <= 9 ? '#22c55e' : '#10b981'
                }
              }, pendingSleepQuality === 0 ? '—' : sleepQualityValues[pendingSleepQuality]),
              React.createElement('span', { className: 'sleep-quality-of-ten' }, pendingSleepQuality > 0 ? '/10' : '')
            ),
            // Preset кнопки
            React.createElement('div', { className: 'sleep-quality-presets' },
              React.createElement('button', {
                className: 'sleep-quality-preset sleep-quality-preset-bad' + (pendingSleepQuality >= 1 && pendingSleepQuality <= 3 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingSleepQuality(2); }
              }, '😫 Плохо'),
              React.createElement('button', {
                className: 'sleep-quality-preset sleep-quality-preset-ok' + (pendingSleepQuality >= 4 && pendingSleepQuality <= 7 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingSleepQuality(5); }
              }, '😐 Средне'),
              React.createElement('button', {
                className: 'sleep-quality-preset sleep-quality-preset-good' + (pendingSleepQuality >= 8 && pendingSleepQuality <= 10 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingSleepQuality(9); }
              }, '😊 Отлично')
            ),
            // Слайдер (0-10, где 0=не указано, 1-10 = оценка)
            React.createElement('div', { className: 'sleep-quality-slider-container' },
              React.createElement('input', {
                type: 'range',
                min: 0,
                max: 10,
                value: pendingSleepQuality,
                className: 'mood-slider mood-slider-positive sleep-quality-slider',
                onChange: (e) => {
                  if (navigator.vibrate) navigator.vibrate(10);
                  setPendingSleepQuality(parseInt(e.target.value));
                }
              }),
              React.createElement('div', { className: 'sleep-quality-slider-labels' },
                React.createElement('span', null, '😫'),
                React.createElement('span', null, '😴'),
                React.createElement('span', null, '🌟')
              )
            ),
            // Комментарий всегда виден с динамическим стилем
            (() => {
              const sleepState = pendingSleepQuality >= 8 ? 'positive' : pendingSleepQuality >= 1 && pendingSleepQuality <= 4 ? 'negative' : 'neutral';
              
              // Quick chips для сна
              const sleepChips = sleepState === 'negative' 
                ? ['Шум', 'Кошмары', 'Душно', 'Поздно лёг', 'Тревога', 'Кофе']
                : sleepState === 'positive'
                ? ['Режим', 'Тишина', 'Прохлада', 'Без гаджетов', 'Прогулка']
                : [];
              
              const addSleepChip = (chip) => {
                if (navigator.vibrate) navigator.vibrate(5);
                const current = pendingSleepNote || '';
                setPendingSleepNote(current ? current + ', ' + chip : chip);
              };
              
              return React.createElement('div', { 
                className: 'sleep-quality-comment-wrapper ' + sleepState
              },
                React.createElement('div', { 
                  className: 'sleep-quality-comment-prompt ' + sleepState
                },
                  React.createElement('div', { className: 'comment-prompt-header' },
                    React.createElement('span', { className: 'sleep-quality-comment-icon' }, 
                      sleepState === 'positive' ? '✨' : sleepState === 'negative' ? '📝' : '💭'
                    ),
                    React.createElement('span', { className: 'sleep-quality-comment-text' }, 
                      sleepState === 'positive' ? 'Секрет хорошего сна?' : 
                      sleepState === 'negative' ? 'Что помешало?' : 'Заметка о сне'
                    )
                  ),
                  // Quick chips
                  sleepChips.length > 0 && React.createElement('div', { 
                    className: 'quick-chips ' + sleepState 
                  },
                    sleepChips.map(chip => 
                      React.createElement('button', { 
                        key: chip,
                        className: 'quick-chip' + ((pendingSleepNote || '').includes(chip) ? ' selected' : ''),
                        onClick: () => addSleepChip(chip)
                      }, chip)
                    )
                  ),
                  // История комментариев
                  day.sleepNote && React.createElement('div', { className: 'comment-history' }, day.sleepNote),
                  // Поле для нового комментария
                  React.createElement('input', {
                    type: 'text',
                    className: 'sleep-quality-comment-input',
                    placeholder: sleepState === 'positive' ? 'Режим, тишина, прохлада...' : 
                                 sleepState === 'negative' ? 'Шум, кошмары, душно...' : 'Любые заметки...',
                    value: pendingSleepNote,
                    onChange: (e) => setPendingSleepNote(e.target.value),
                    onClick: (e) => e.stopPropagation()
                  })
                )
              );
            })(),
            // Часы сна
            day.sleepHours > 0 && React.createElement('div', { className: 'sleep-quality-hours-info' },
              '🛏️ Сегодня: ',
              React.createElement('strong', null, day.sleepHours + ' ч'),
              day.sleepHours < 6 ? ' — маловато!' : day.sleepHours >= 8 ? ' — отлично!' : ''
            )
          )
        ),
        document.body
      ),
      
      // Day Score Picker Modal (со слайдером как в модалке оценок)
      showDayScorePicker && ReactDOM.createPortal(
        React.createElement('div', { className: 'time-picker-backdrop', onClick: cancelDayScorePicker },
          React.createElement('div', { className: 'time-picker-modal day-score-picker-modal', onClick: e => e.stopPropagation() },
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
            // Большой emoji и текст
            React.createElement('div', { className: 'day-score-face' },
              React.createElement('span', { className: 'day-score-face-emoji' }, 
                pendingDayScore === 0 ? '🤷' :
                pendingDayScore <= 3 ? '😢' :
                pendingDayScore <= 5 ? '😐' :
                pendingDayScore <= 7 ? '🙂' :
                pendingDayScore <= 9 ? '😊' : '🤩'
              ),
              React.createElement('span', { className: 'day-score-face-text' }, 
                pendingDayScore === 0 ? 'Не задано' :
                pendingDayScore <= 2 ? 'Плохой день' :
                pendingDayScore <= 4 ? 'Так себе' :
                pendingDayScore <= 6 ? 'Нормально' :
                pendingDayScore <= 8 ? 'Хороший день' : 'Отличный день!'
              )
            ),
            // Большое число
            React.createElement('div', { className: 'day-score-big-value' },
              React.createElement('span', { 
                className: 'day-score-number',
                style: { 
                  color: pendingDayScore === 0 ? '#9ca3af' :
                         pendingDayScore <= 3 ? '#ef4444' :
                         pendingDayScore <= 5 ? '#eab308' :
                         pendingDayScore <= 7 ? '#22c55e' : '#10b981'
                }
              }, pendingDayScore === 0 ? '—' : pendingDayScore),
              React.createElement('span', { className: 'day-score-of-ten' }, '/ 10')
            ),
            // Preset кнопки
            React.createElement('div', { className: 'day-score-presets' },
              React.createElement('button', {
                className: 'day-score-preset day-score-preset-bad' + (pendingDayScore >= 1 && pendingDayScore <= 3 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingDayScore(2); }
              }, '😢 Плохо'),
              React.createElement('button', {
                className: 'day-score-preset day-score-preset-ok' + (pendingDayScore >= 4 && pendingDayScore <= 6 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingDayScore(5); }
              }, '😐 Норм'),
              React.createElement('button', {
                className: 'day-score-preset day-score-preset-good' + (pendingDayScore >= 7 && pendingDayScore <= 10 ? ' active' : ''),
                onClick: () => { if (navigator.vibrate) navigator.vibrate(10); setPendingDayScore(8); }
              }, '😊 Отлично')
            ),
            // Слайдер
            React.createElement('div', { className: 'day-score-slider-container' },
              React.createElement('input', {
                type: 'range',
                min: 0,
                max: 10,
                value: pendingDayScore,
                className: 'mood-slider mood-slider-positive day-score-slider',
                onChange: (e) => {
                  if (navigator.vibrate) navigator.vibrate(10);
                  setPendingDayScore(parseInt(e.target.value));
                }
              }),
              React.createElement('div', { className: 'day-score-slider-labels' },
                React.createElement('span', null, '😢'),
                React.createElement('span', null, '😐'),
                React.createElement('span', null, '😊')
              )
            ),
            // Блок комментария — всегда виден, стиль меняется в зависимости от оценки
            React.createElement('div', { 
              className: 'day-score-comment-wrapper' + 
                (pendingDayScore >= 7 ? ' positive' : pendingDayScore >= 1 && pendingDayScore <= 4 ? ' negative' : ' neutral')
            },
              React.createElement('div', { 
                className: 'day-score-comment-prompt' + 
                  (pendingDayScore >= 7 ? ' positive' : pendingDayScore >= 1 && pendingDayScore <= 4 ? ' negative' : ' neutral')
              },
                React.createElement('div', { className: 'comment-prompt-header' },
                  React.createElement('span', { className: 'day-score-comment-icon' }, 
                    pendingDayScore >= 7 ? '✨' : pendingDayScore >= 1 && pendingDayScore <= 4 ? '📝' : '💭'
                  ),
                  React.createElement('span', { className: 'day-score-comment-text' }, 
                    pendingDayScore >= 7 ? 'Что сделало день отличным?' 
                    : pendingDayScore >= 1 && pendingDayScore <= 4 ? 'Что случилось?' 
                    : 'Заметка о дне'
                  )
                ),
                // История комментариев
                day.dayComment && React.createElement('div', { className: 'comment-history' }, day.dayComment),
                // Поле для нового комментария
                React.createElement('input', {
                  type: 'text',
                  className: 'day-score-comment-input',
                  placeholder: pendingDayScore >= 7 
                    ? 'Хорошо выспался, прогулка...' 
                    : pendingDayScore >= 1 && pendingDayScore <= 4 
                    ? 'Болела голова, плохо спал...' 
                    : 'Обычный день...',
                  value: pendingDayComment,
                  onChange: (e) => setPendingDayComment(e.target.value),
                  onClick: (e) => e.stopPropagation()
                })
              )
            ),
            // Подсказка про авто
            (day.moodAvg || day.wellbeingAvg || day.stressAvg) && React.createElement('div', { className: 'day-score-auto-info' },
              '✨ Автоматическая оценка: ',
              React.createElement('strong', null, calculateMealAverages(day.meals).dayScore || '—'),
              ' (на основе настроения, самочувствия и стресса)'
            )
          )
        ),
        document.body
      )
    );
  };

})(window);
