// heys_day_utils.js — Day utilities: date/time, storage, calculations

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  
  // Создаём namespace для утилит дня
  HEYS.dayUtils = {};

  // === Haptic Feedback ===
  // Track if user has interacted (required for vibrate API)
  let userHasInteracted = false;
  if (typeof window !== 'undefined') {
    const markInteracted = () => { userHasInteracted = true; };
    window.addEventListener('click', markInteracted, { once: true, passive: true });
    window.addEventListener('touchstart', markInteracted, { once: true, passive: true });
    window.addEventListener('keydown', markInteracted, { once: true, passive: true });
  }
  
  function haptic(type = 'light') {
    if (!navigator.vibrate || !userHasInteracted) return;
    try {
      switch(type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(20); break;
        case 'heavy': navigator.vibrate(30); break;
        case 'success': navigator.vibrate([10, 50, 20]); break;
        case 'warning': navigator.vibrate([30, 30, 30]); break;
        case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
        default: navigator.vibrate(10);
      }
    } catch(e) { /* ignore vibrate errors */ }
  }
  
  // Экспортируем для использования в других модулях (legacy)
  HEYS.haptic = haptic;

  // === Date/Time Utilities ===
  function pad2(n){ return String(n).padStart(2,'0'); }
  
  // Ночной порог: до 03:00 считается "вчера" (день ещё не закончился)
  const NIGHT_HOUR_THRESHOLD = 3; // 00:00 - 02:59 → ещё предыдущий день
  
  // "Эффективная" сегодняшняя дата — до 3:00 возвращает вчера
  function todayISO(){ 
    const d = new Date(); 
    const hour = d.getHours();
    // До 3:00 — это ещё "вчера" (день не закончился)
    if (hour < NIGHT_HOUR_THRESHOLD) {
      d.setDate(d.getDate() - 1);
    }
    return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()); 
  }
  
  function fmtDate(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
  function parseISO(s){ const [y,m,d]=String(s||'').split('-').map(x=>parseInt(x,10)); if(!y||!m||!d) return new Date(); const dt=new Date(y,m-1,d); dt.setHours(12); return dt; }
  function uid(p){ return (p||'id')+Math.random().toString(36).slice(2,8); }

  // Проверка: время относится к "ночным" часам (00:00-02:59)
  function isNightTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return false;
    const [hh] = timeStr.split(':').map(x => parseInt(x, 10));
    if (isNaN(hh)) return false;
    return hh >= 0 && hh < NIGHT_HOUR_THRESHOLD;
  }

  // Возвращает "эффективную" дату для приёма пищи
  // Если время 00:00-02:59, возвращает предыдущий день
  function getEffectiveDate(timeStr, calendarDateISO) {
    if (!calendarDateISO) return calendarDateISO;
    if (!isNightTime(timeStr)) return calendarDateISO;
    // Вычитаем 1 день
    const d = parseISO(calendarDateISO);
    d.setDate(d.getDate() - 1);
    return fmtDate(d);
  }

  // Возвращает "следующий" календарный день
  function getNextDay(dateISO) {
    const d = parseISO(dateISO);
    d.setDate(d.getDate() + 1);
    return fmtDate(d);
  }

  // === Storage Utilities ===
  // ВАЖНО: Используем HEYS.utils.lsGet/lsSet которые работают с clientId namespace
  function lsGet(k,d){
    try{
      // Приоритет: HEYS.utils (с namespace) → HEYS.store → localStorage fallback
      if(HEYS.utils && typeof HEYS.utils.lsGet==='function') {
        return HEYS.utils.lsGet(k, d);
      }
      if(HEYS.store && typeof HEYS.store.get==='function') {
        return HEYS.store.get(k,d);
      }
      const v=JSON.parse(localStorage.getItem(k)); 
      return v==null?d:v;
    }catch(e){ return d; }
  }
  
  function lsSet(k,v){
    try{
      // Приоритет: HEYS.utils (с namespace) → HEYS.store → localStorage fallback
      if(HEYS.utils && typeof HEYS.utils.lsSet==='function') {
        return HEYS.utils.lsSet(k, v);
      }
      if(HEYS.store && typeof HEYS.store.set==='function') {
        return HEYS.store.set(k,v);
      }
      localStorage.setItem(k, JSON.stringify(v));
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
  
  // Базовая загрузка приёмов из localStorage (без ночной логики)
  function loadMealsRaw(ds){ 
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

  // Загрузка приёмов для даты с учётом ночной логики:
  // - Берём приёмы текущего дня (кроме ночных 00:00-02:59)
  // - Добавляем ночные приёмы из следующего календарного дня (они принадлежат этому дню)
  function loadMealsForDate(ds){ 
    // 1. Загружаем приёмы текущего календарного дня (фильтруем ночные — они ушли в предыдущий день)
    const currentDayMeals = (loadMealsRaw(ds) || []).filter(m => !isNightTime(m.time));
    
    // 2. Загружаем ночные приёмы из следующего календарного дня
    const nextDayISO = getNextDay(ds);
    const nextDayMeals = (loadMealsRaw(nextDayISO) || []).filter(m => isNightTime(m.time));
    
    // 3. Объединяем и сортируем по времени
    const allMeals = [...currentDayMeals, ...nextDayMeals];
    
    // Сортировка: ночные (00:00-02:59) в конец, остальные по времени
    allMeals.sort((a, b) => {
      const aIsNight = isNightTime(a.time);
      const bIsNight = isNightTime(b.time);
      if (aIsNight && !bIsNight) return 1; // ночные в конец
      if (!aIsNight && bIsNight) return -1;
      // Одинаковый тип — сортируем по времени
      return (a.time || '').localeCompare(b.time || '');
    });
    
    return allMeals;
  }

  // Lightweight signature for products (ids/names only)
  function productsSignature(ps){ return (ps||[]).map(p=>p&& (p.id||p.product_id||p.name)||'').join('|'); }

  // Cached popular products (per month + signature + TTL)
  const POPULAR_CACHE = {}; // key => {ts, list}
  
  function computePopularProducts(ps, iso){
    const sig = productsSignature(ps);
    const monthKey = (iso||todayISO()).slice(0,7); // YYYY-MM
    // Добавляем favorites в ключ кэша чтобы обновлять при изменении избранных
    const favorites = (window.HEYS && window.HEYS.store && window.HEYS.store.getFavorites) 
      ? window.HEYS.store.getFavorites() 
      : new Set();
    const favSig = Array.from(favorites).sort().join(',');
    const key = monthKey+'::'+sig+'::'+favSig;
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
    // Сортировка: избранные первые, затем по частоте
    arr.sort((a,b)=>{
      const aFav = favorites.has(String(a.p.id ?? a.p.product_id ?? a.p.name));
      const bFav = favorites.has(String(b.p.id ?? b.p.product_id ?? b.p.name));
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return b.c - a.c;
    });
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

  // === Meal Type Classification ===
  // Типы приёмов пищи с иконками и названиями
  const MEAL_TYPES = {
    breakfast: { name: 'Завтрак', icon: '🍳', order: 1 },
    snack1:    { name: 'Перекус', icon: '🍎', order: 2 },
    lunch:     { name: 'Обед', icon: '🍲', order: 3 },
    snack2:    { name: 'Перекус', icon: '🥜', order: 4 },
    dinner:    { name: 'Ужин', icon: '🍽️', order: 5 },
    snack3:    { name: 'Перекус', icon: '🧀', order: 6 },
    night:     { name: 'Ночной приём', icon: '🌙', order: 7 }
  };

  // Пороги для определения "основного приёма" vs "перекуса"
  const MAIN_MEAL_THRESHOLDS = {
    minProducts: 3,      // минимум продуктов для основного приёма
    minGrams: 200,       // минимум граммов для основного приёма
    minKcal: 300         // минимум калорий для основного приёма
  };

  /**
   * Вычисляет тотал по приёму (граммы, продукты, калории)
   */
  function getMealStats(meal, pIndex) {
    if (!meal || !meal.items || !meal.items.length) {
      return { totalGrams: 0, productCount: 0, totalKcal: 0 };
    }
    
    let totalGrams = 0;
    let totalKcal = 0;
    const productCount = meal.items.length;
    
    meal.items.forEach(item => {
      const g = +item.grams || 0;
      totalGrams += g;
      
      // Пытаемся получить калории
      const p = pIndex ? getProductFromItem(item, pIndex) : null;
      if (p) {
        const per = per100(p);
        totalKcal += (per.kcal100 || 0) * g / 100;
      }
    });
    
    return { totalGrams, productCount, totalKcal: Math.round(totalKcal) };
  }

  /**
   * Проверяет, является ли приём "основным" (завтрак/обед/ужин) по размеру
   */
  function isMainMeal(mealStats) {
    const { totalGrams, productCount, totalKcal } = mealStats;
    
    // Основной приём если: много продуктов ИЛИ (много граммов И больше 1 продукта)
    if (productCount >= MAIN_MEAL_THRESHOLDS.minProducts) return true;
    if (totalGrams >= MAIN_MEAL_THRESHOLDS.minGrams && productCount >= 2) return true;
    if (totalKcal >= MAIN_MEAL_THRESHOLDS.minKcal) return true;
    
    return false;
  }

  /**
   * Преобразует время в минуты от полуночи (с учётом ночных часов)
   * Ночные часы (00:00-02:59) считаются как 24:00-26:59
   */
  function timeToMinutes(timeStr) {
    const parsed = parseTime(timeStr);
    if (!parsed) return null;
    
    let { hh, mm } = parsed;
    // Ночные часы (00-02) — это "после полуночи" предыдущего дня
    if (hh < NIGHT_HOUR_THRESHOLD) {
      hh += 24;
    }
    return hh * 60 + mm;
  }

  /**
   * Определяет тип приёма пищи на основе:
   * - Порядкового номера (первый = завтрак)
   * - Времени (деление дня на слоты)
   * - Размера приёма (основной vs перекус)
   * 
   * @param {number} mealIndex - Индекс приёма в отсортированном списке
   * @param {Object} meal - Объект приёма {id, time, items, ...}
   * @param {Array} allMeals - Все приёмы дня (отсортированы по времени)
   * @param {Object} pIndex - Индекс продуктов для расчёта калорий
   * @returns {Object} { type: string, name: string, icon: string }
   */
  function getMealType(mealIndex, meal, allMeals, pIndex) {
    // Первый приём дня всегда Завтрак
    if (mealIndex === 0) {
      return { type: 'breakfast', ...MEAL_TYPES.breakfast };
    }
    
    // Получаем время первого приёма (завтрака)
    const firstMeal = allMeals[0];
    const breakfastMinutes = timeToMinutes(firstMeal?.time);
    const currentMinutes = timeToMinutes(meal?.time);
    
    // Если время не указано, определяем по порядку и размеру
    if (breakfastMinutes === null || currentMinutes === null) {
      return fallbackMealType(mealIndex, meal, pIndex);
    }
    
    // Конец дня = 03:00 следующего дня = 27:00 в нашей системе
    const endOfDayMinutes = 27 * 60; // 03:00 + 24 = 27:00
    
    // Оставшееся время от завтрака до конца дня
    const remainingMinutes = endOfDayMinutes - breakfastMinutes;
    
    // Делим на 6 слотов (7 типов минус завтрак = 6)
    const slotDuration = remainingMinutes / 6;
    
    // Определяем в какой слот попадает текущий приём
    const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
    const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);
    
    // Типы слотов: 0=перекус1, 1=обед, 2=перекус2, 3=ужин, 4=перекус3, 5=ночной
    const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
    
    // Получаем статистику приёма
    const mealStats = getMealStats(meal, pIndex);
    const isMain = isMainMeal(mealStats);
    
    // Определяем базовый тип по слоту
    let baseType = slotTypes[clamp(slotIndex, 0, 5)];
    
    // Корректируем: если попали в "перекус" слот, но это большой приём — 
    // проверяем соседние "основные" слоты
    if (baseType.startsWith('snack') && isMain) {
      // Ищем ближайший основной слот
      if (slotIndex <= 1) {
        baseType = 'lunch';
      } else if (slotIndex >= 2 && slotIndex <= 3) {
        baseType = 'dinner';
      }
      // Если после ужина большой приём — оставляем как есть (поздний ужин → snack3)
    }
    
    // Обратная корректировка: если попали в "основной" слот, но это маленький приём — 
    // оставляем как основной (обед может быть лёгким)
    
    // Проверяем не дублируется ли уже этот тип (избегаем 2 обеда)
    const usedTypes = new Set();
    for (let i = 0; i < mealIndex; i++) {
      const prevType = getMealTypeSimple(i, allMeals[i], allMeals, pIndex);
      usedTypes.add(prevType);
    }
    
    // Если обед уже был, а мы пытаемся назвать это обедом — делаем перекусом
    if (baseType === 'lunch' && usedTypes.has('lunch')) {
      baseType = 'snack2';
    }
    if (baseType === 'dinner' && usedTypes.has('dinner')) {
      baseType = 'snack3';
    }
    
    return { type: baseType, ...MEAL_TYPES[baseType] };
  }

  /**
   * Упрощённая версия для проверки дубликатов (без рекурсии)
   */
  function getMealTypeSimple(mealIndex, meal, allMeals, pIndex) {
    if (mealIndex === 0) return 'breakfast';
    
    const firstMeal = allMeals[0];
    const breakfastMinutes = timeToMinutes(firstMeal?.time);
    const currentMinutes = timeToMinutes(meal?.time);
    
    if (breakfastMinutes === null || currentMinutes === null) {
      return 'snack1';
    }
    
    const endOfDayMinutes = 27 * 60;
    const remainingMinutes = endOfDayMinutes - breakfastMinutes;
    const slotDuration = remainingMinutes / 6;
    const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
    const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);
    
    const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
    let baseType = slotTypes[clamp(slotIndex, 0, 5)];
    
    const mealStats = getMealStats(meal, pIndex);
    const isMain = isMainMeal(mealStats);
    
    if (baseType.startsWith('snack') && isMain) {
      if (slotIndex <= 1) baseType = 'lunch';
      else if (slotIndex >= 2 && slotIndex <= 3) baseType = 'dinner';
    }
    
    return baseType;
  }

  /**
   * Fallback определение типа (когда нет времени)
   */
  function fallbackMealType(mealIndex, meal, pIndex) {
    const mealStats = getMealStats(meal, pIndex);
    const isMain = isMainMeal(mealStats);
    
    // По порядку: 0=завтрак, 1=перекус/обед, 2=перекус/ужин, ...
    const fallbackTypes = [
      'breakfast',
      isMain ? 'lunch' : 'snack1',
      isMain ? 'dinner' : 'snack2',
      'snack3',
      'night'
    ];
    
    const type = fallbackTypes[clamp(mealIndex, 0, fallbackTypes.length - 1)];
    return { type, ...MEAL_TYPES[type] };
  }

  // Форматирование даты для отображения
  // Использует "эффективную" дату (до 3:00 — ещё вчера)
  function formatDateDisplay(isoDate) {
    const d = parseISO(isoDate);
    const effectiveToday = parseISO(todayISO()); // todayISO учитывает ночной порог
    const effectiveYesterday = new Date(effectiveToday);
    effectiveYesterday.setDate(effectiveYesterday.getDate() - 1);
    
    const isToday = d.toDateString() === effectiveToday.toDateString();
    const isYesterday = d.toDateString() === effectiveYesterday.toDateString();
    
    const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    const dayNum = d.getDate();
    const month = d.toLocaleDateString('ru-RU', { month: 'short' });
    
    if (isToday) return { label: 'Сегодня', sub: `${dayNum} ${month}` };
    if (isYesterday) return { label: 'Вчера', sub: `${dayNum} ${month}` };
    return { label: `${dayNum} ${month}`, sub: dayName };
  }

  /**
   * Предпросмотр типа приёма для модалки создания.
   * Определяет тип по времени и существующим приёмам (без данных о продуктах).
   * @param {string} timeStr - время в формате "HH:MM"
   * @param {Array} existingMeals - массив существующих приёмов дня
   * @returns {string} - ключ типа (breakfast, lunch, dinner, snack1, snack2, snack3, night)
   */
  function getMealTypeForPreview(timeStr, existingMeals) {
    const meals = existingMeals || [];
    
    // Если нет приёмов — это будет первый, значит завтрак
    if (meals.length === 0) {
      return 'breakfast';
    }
    
    // Находим первый приём (завтрак)
    const sortedMeals = [...meals].sort((a, b) => {
      const aMin = timeToMinutes(a.time) || 0;
      const bMin = timeToMinutes(b.time) || 0;
      return aMin - bMin;
    });
    
    const breakfastMinutes = timeToMinutes(sortedMeals[0]?.time);
    const currentMinutes = timeToMinutes(timeStr);
    
    if (breakfastMinutes === null || currentMinutes === null) {
      return 'snack1'; // fallback
    }
    
    // Если новый приём раньше первого — он станет завтраком
    if (currentMinutes < breakfastMinutes) {
      return 'breakfast';
    }
    
    // Конец дня = 03:00 следующего дня = 27:00
    const endOfDayMinutes = 27 * 60;
    const remainingMinutes = endOfDayMinutes - breakfastMinutes;
    const slotDuration = remainingMinutes / 6;
    
    const minutesSinceBreakfast = currentMinutes - breakfastMinutes;
    const slotIndex = Math.floor(minutesSinceBreakfast / slotDuration);
    
    const slotTypes = ['snack1', 'lunch', 'snack2', 'dinner', 'snack3', 'night'];
    return slotTypes[clamp(slotIndex, 0, 5)];
  }

  // === Calendar Day Indicators ===
  
  /**
   * Получает данные дня: калории и активность для расчёта реального target
   * @param {string} dateStr - Дата в формате YYYY-MM-DD
   * @param {Map} productsMap - Map продуктов (id => product)
   * @param {Object} profile - Профиль пользователя
   * @returns {{kcal: number, steps: number, householdMin: number, trainings: Array}} Данные дня
   */
  function getDayData(dateStr, productsMap, profile) {
    try {
      // Пробуем несколько источников clientId (через утилиту для корректного JSON.parse)
      const U = window.HEYS && window.HEYS.utils;
      const clientId = U && U.getCurrentClientId ? U.getCurrentClientId() : '';
      
      const scopedKey = clientId 
        ? 'heys_' + clientId + '_dayv2_' + dateStr 
        : 'heys_dayv2_' + dateStr;
      
      const raw = localStorage.getItem(scopedKey);
      if (!raw) return null;
      
      let dayData = null;
      if (raw.startsWith('¤Z¤')) {
        let str = raw.substring(3);
        const patterns = { 
          '¤n¤': '"name":"', '¤k¤': '"kcal100"', '¤p¤': '"protein100"', 
          '¤c¤': '"carbs100"', '¤f¤': '"fat100"' 
        };
        for (const [code, pattern] of Object.entries(patterns)) {
          str = str.split(code).join(pattern);
        }
        dayData = JSON.parse(str);
      } else {
        dayData = JSON.parse(raw);
      }
      
      if (!dayData) return null;
      
      // Считаем калории и макросы из meals
      let totalKcal = 0, totalProt = 0, totalFat = 0, totalCarbs = 0;
      (dayData.meals || []).forEach(meal => {
        (meal.items || []).forEach(item => {
          const grams = +item.grams || 0;
          const product = productsMap.get(item.product_id);
          if (product && grams > 0) {
            const mult = grams / 100;
            totalKcal += (+product.kcal100 || 0) * mult;
            totalProt += (+product.protein100 || 0) * mult;
            totalFat += (+product.fat100 || 0) * mult;
            totalCarbs += (+product.carbs100 || (+product.simple100 || 0) + (+product.complex100 || 0)) * mult;
          }
        });
      });
      
      // Вычисляем sleepHours из sleepStart/sleepEnd
      let sleepHours = 0;
      if (dayData.sleepStart && dayData.sleepEnd) {
        const [sh, sm] = dayData.sleepStart.split(':').map(Number);
        const [eh, em] = dayData.sleepEnd.split(':').map(Number);
        let startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin < startMin) endMin += 24 * 60; // через полночь
        sleepHours = (endMin - startMin) / 60;
      }
      
      // Считаем общие минуты тренировок
      let trainingMinutes = 0;
      (dayData.trainings || []).forEach(t => {
        if (t && t.z && Array.isArray(t.z)) {
          trainingMinutes += t.z.reduce((sum, m) => sum + (+m || 0), 0);
        }
      });
      
      return {
        kcal: Math.round(totalKcal),
        prot: Math.round(totalProt),
        fat: Math.round(totalFat),
        carbs: Math.round(totalCarbs),
        steps: +dayData.steps || 0,
        householdMin: +dayData.householdMin || 0,
        trainings: dayData.trainings || [],
        trainingMinutes,
        weightMorning: +dayData.weightMorning || 0,
        deficitPct: dayData.deficitPct, // может быть undefined — тогда из профиля
        sleepHours,
        moodAvg: +dayData.moodAvg || 0,
        dayScore: +dayData.dayScore || 0
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Вычисляет калории за день напрямую из localStorage (legacy wrapper)
   */
  function getDayCalories(dateStr, productsMap) {
    const data = getDayData(dateStr, productsMap, {});
    return data ? data.kcal : 0;
  }

  /**
   * Получает Map продуктов для вычисления калорий
   * @returns {Map} productsMap (id => product)
   */
  function getProductsMap() {
    const productsMap = new Map();
    try {
      // Используем HEYS.store.get который знает правильный ключ с clientId
      let products = [];
      if (window.HEYS && window.HEYS.store && typeof window.HEYS.store.get === 'function') {
        products = window.HEYS.store.get('heys_products', []);
      } else {
        // Fallback: пробуем напрямую из localStorage
        const clientId = (window.HEYS && window.HEYS.currentClientId) || '';
        const productsKey = clientId 
          ? 'heys_' + clientId + '_products' 
          : 'heys_products';
        const productsRaw = localStorage.getItem(productsKey);
        
        if (productsRaw) {
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
        }
      }
      // Если products — объект с полем products, извлекаем массив
      if (products && !Array.isArray(products) && Array.isArray(products.products)) {
        products = products.products;
      }
      // Финальная проверка что это массив
      if (!Array.isArray(products)) {
        products = [];
      }
      products.forEach(p => { if(p && p.id) productsMap.set(p.id, p); });
    } catch (e) {
      // Тихий fallback — productsMap не критичен
    }
    return productsMap;
  }

  /**
   * Вычисляет Set активных дней для месяца
   * Активный день = съедено ≥ 1/3 BMR (реальное ведение дневника)
   * 
   * @param {number} year - Год
   * @param {number} month - Месяц (0-11)
   * @param {Object} profile - Профиль пользователя {weight, height, age, sex, deficitPctTarget}
   * @param {Array} products - Массив продуктов (передаётся из App state)
   * @returns {Map<string, {kcal: number, target: number, ratio: number}>} Map дат с данными
   */
  function getActiveDaysForMonth(year, month, profile, products) {
    const daysData = new Map();
    
    try {
      // Получаем базовые данные из профиля
      const profileWeight = +(profile && profile.weight) || 70;
      const deficitPct = +(profile && profile.deficitPctTarget) || 0;
      const sex = (profile && profile.sex) || 'male';
      const baseBmr = calcBMR(profileWeight, profile || {});
      const threshold = Math.round(baseBmr / 3); // 1/3 BMR — минимум для "активного" дня
      
      // Строим Map продуктов из переданного массива
      const productsMap = new Map();
      const productsArr = Array.isArray(products) ? products : [];
      productsArr.forEach(p => { if(p && p.id) productsMap.set(p.id, p); });
      
      // Проходим по всем дням месяца
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = fmtDate(new Date(year, month, d));
        const dayInfo = getDayData(dateStr, productsMap, profile);
        
        if (!dayInfo || dayInfo.kcal < threshold) continue;
        
        // Используем вес дня если есть, иначе из профиля
        const weight = dayInfo.weightMorning || profileWeight;
        const bmr = calcBMR(weight, profile || {});
        
        // Шаги: формула stepsKcal(steps, weight, sex, 0.7)
        const steps = dayInfo.steps || 0;
        const stepsK = stepsKcal(steps, weight, sex, 0.7);
        
        // Быт: householdMin × kcalPerMin(2.5, weight)
        const householdMin = dayInfo.householdMin || 0;
        const householdK = Math.round(householdMin * kcalPerMin(2.5, weight));
        
        // Тренировки: суммируем ккал из зон z (как на экране дня — только первые 3)
        // Читаем кастомные MET из heys_hr_zones (как на экране дня)
        const hrZones = lsGet('heys_hr_zones', []);
        const customMets = hrZones.map(x => +x.MET || 0);
        const mets = [2.5, 6, 8, 10].map((def, i) => customMets[i] || def);
        const kcalMin = mets.map(m => kcalPerMin(m, weight));
        
        let trainingsK = 0;
        const trainings = (dayInfo.trainings || []).slice(0, 3); // максимум 3 тренировки
        
        // Собираем типы тренировок с реальными минутами
        const trainingTypes = trainings
          .filter(t => t && t.z && Array.isArray(t.z) && t.z.some(z => z > 0))
          .map(t => t.type || 'cardio');
        const hasTraining = trainingTypes.length > 0;
        
        trainings.forEach((t, tIdx) => {
          if (t.z && Array.isArray(t.z)) {
            let tKcal = 0;
            t.z.forEach((min, i) => {
              tKcal += Math.round((+min || 0) * (kcalMin[i] || 0));
            });
            trainingsK += tKcal;
          }
        });
        
        const tdee = bmr + stepsK + householdK + trainingsK;
        // Используем дефицит дня если есть, иначе из профиля
        const dayDeficit = dayInfo.deficitPct != null ? dayInfo.deficitPct : deficitPct;
        const target = Math.round(tdee * (1 + dayDeficit / 100));
        
        // ratio: 1.0 = идеально в цель, <1 недоел, >1 переел
        const ratio = target > 0 ? dayInfo.kcal / target : 0;
        
        // moodAvg для mood-полосы на графике
        const moodAvg = dayInfo.moodAvg ? +dayInfo.moodAvg : null;
        
        // Дополнительные данные для sparkline
        const sleepHours = dayInfo.sleepHours || 0;
        const trainingMinutes = dayInfo.trainingMinutes || 0;
        const prot = dayInfo.prot || 0;
        const fat = dayInfo.fat || 0;
        const carbs = dayInfo.carbs || 0;
        const dayScore = dayInfo.dayScore || 0;
        
        daysData.set(dateStr, { 
          kcal: dayInfo.kcal, target, ratio, 
          hasTraining, trainingTypes, trainingMinutes,
          moodAvg, sleepHours, dayScore,
          prot, fat, carbs
        });
      }
    } catch (e) {
      // Тихий fallback — activeDays для календаря не критичны
    }
    
    return daysData;
  }

  // === Exports ===
  // Всё экспортируется через HEYS.dayUtils
  // POPULAR_CACHE — приватный, не экспортируется (инкапсуляция)
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
    // Night time logic (приёмы 00:00-02:59 относятся к предыдущему дню)
    NIGHT_HOUR_THRESHOLD,
    isNightTime,
    getEffectiveDate,
    getNextDay,
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
    loadMealsRaw,
    productsSignature,
    computePopularProducts,
    // Profile/Calculations
    getProfile,
    calcBMR,
    kcalPerMin,
    stepsKcal,
    // Time/Sleep
    parseTime,
    sleepHours,
    // Meal Type Classification
    MEAL_TYPES,
    MAIN_MEAL_THRESHOLDS,
    getMealStats,
    isMainMeal,
    timeToMinutes,
    getMealType,
    getMealTypeSimple,
    getMealTypeForPreview,
    fallbackMealType,
    // Calendar indicators
    getDayCalories,
    getProductsMap,
    getActiveDaysForMonth
  };

})(window);
