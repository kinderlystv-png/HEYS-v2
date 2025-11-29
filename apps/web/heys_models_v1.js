// heys_models_v1.js — Domain models, Product/Day/User typedefs, computations
;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const M = HEYS.models = HEYS.models || {};

  /** @typedef {Object} Product
   * @property {string|number} id
   * @property {string} name
   * @property {number} simple100
   * @property {number} complex100
   * @property {number} protein100
   * @property {number} badFat100
   * @property {number} goodFat100
   * @property {number} trans100
   * @property {number} fiber100
   * @property {number} [carbs100]
   * @property {number} [fat100]
   * @property {number} [kcal100]
   * @property {{name: string, grams: number}[]} [portions] - Порции продукта (опционально)
   */

  /** @typedef {Object} Portion
   * @property {string} name - Название порции ("1 шт", "1 ч.л.")
   * @property {number} grams - Граммы в порции
   */

  // Авто-порции по паттернам названия продукта
  // Паттерны с пробелом в конце — для точного совпадения (чтобы 'рис' не матчило 'рисовая каша')
  const AUTO_PORTIONS = {
    // Яйца
    'яйц': [{ name: '🥚 1 шт', grams: 60 }, { name: '🥚 2 шт', grams: 120 }, { name: '🥚 3 шт', grams: 180 }],
    // Молочные напитки
    'молок': [{ name: '🥛 ½ стакана', grams: 125 }, { name: '🥛 1 стакан', grams: 250 }],
    'кефир': [{ name: '🥛 ½ стакана', grams: 125 }, { name: '🥛 1 стакан', grams: 250 }],
    'ряженк': [{ name: '🥛 ½ стакана', grams: 125 }, { name: '🥛 1 стакан', grams: 250 }],
    'йогурт': [{ name: '🥛 1 баночка', grams: 125 }],
    'творог': [{ name: '🥛 1 пачка', grams: 180 }, { name: '🥛 ½ пачки', grams: 90 }],
    // Хлебобулочные
    'хлеб': [{ name: '🍞 1 ломтик', grams: 30 }, { name: '🍞 2 ломтика', grams: 60 }],
    'батон': [{ name: '🍞 1 ломтик', grams: 25 }],
    'булк': [{ name: '🍞 1 шт', grams: 50 }],
    // Ложечные продукты
    'масл': [{ name: '🥄 1 ч.л.', grams: 5 }, { name: '🥄 1 ст.л.', grams: 15 }],
    'мёд': [{ name: '🍯 1 ч.л.', grams: 8 }, { name: '🍯 1 ст.л.', grams: 21 }],
    'мед ': [{ name: '🍯 1 ч.л.', grams: 8 }, { name: '🍯 1 ст.л.', grams: 21 }],
    'сахар': [{ name: '🥄 1 ч.л.', grams: 5 }, { name: '🥄 1 ст.л.', grams: 15 }],
    'сметан': [{ name: '🥄 1 ст.л.', grams: 20 }, { name: '🥄 2 ст.л.', grams: 40 }],
    // Фрукты
    'банан': [{ name: '🍌 1 шт', grams: 120 }],
    'яблок': [{ name: '🍎 1 шт', grams: 180 }],
    'апельсин': [{ name: '🍊 1 шт', grams: 200 }],
    'мандарин': [{ name: '🍊 1 шт', grams: 80 }],
    'груш': [{ name: '🍐 1 шт', grams: 150 }],
    'киви': [{ name: '🥝 1 шт', grams: 80 }],
    'авокадо': [{ name: '🥑 ½ шт', grams: 75 }, { name: '🥑 1 шт', grams: 150 }],
    'персик': [{ name: '🍑 1 шт', grams: 150 }],
    'нектарин': [{ name: '🍑 1 шт', grams: 140 }],
    'слив': [{ name: '🍑 1 шт', grams: 35 }, { name: '🍑 3 шт', grams: 105 }],
    'лимон': [{ name: '🍋 1 долька', grams: 8 }, { name: '🍋 ½ шт', grams: 30 }],
    'виноград': [{ name: '🍇 1 горсть', grams: 50 }, { name: '🍇 100г', grams: 100 }],
    // Овощи
    'огурец': [{ name: '🥒 1 шт', grams: 100 }],
    'помидор': [{ name: '🍅 1 шт', grams: 120 }],
    'томат': [{ name: '🍅 1 шт', grams: 120 }],
    'картоф': [{ name: '🥔 1 шт', grams: 100 }],
    'морков': [{ name: '🥕 1 шт', grams: 80 }],
    'лук ': [{ name: '🧅 1 шт', grams: 75 }],
    'луков': [{ name: '🧅 1 шт', grams: 75 }],
    'чеснок': [{ name: '🧄 1 зубчик', grams: 5 }, { name: '🧄 3 зубчика', grams: 15 }],
    'перец болг': [{ name: '🫑 1 шт', grams: 150 }],
    'капуст': [{ name: '🥬 100г', grams: 100 }, { name: '🥬 лист', grams: 30 }],
    'брокколи': [{ name: '🥦 соцветие', grams: 25 }, { name: '🥦 100г', grams: 100 }],
    // Мясо и птица
    'курин': [{ name: '🍗 1 филе', grams: 200 }, { name: '🍗 ½ филе', grams: 100 }],
    'куриц': [{ name: '🍗 1 филе', grams: 200 }, { name: '🍗 ½ филе', grams: 100 }],
    'котлет': [{ name: '🍔 1 шт', grams: 80 }, { name: '🍔 2 шт', grams: 160 }],
    'тефтел': [{ name: '🍔 1 шт', grams: 50 }, { name: '🍔 3 шт', grams: 150 }],
    // Сыры и колбасы
    'сыр': [{ name: '🧀 1 ломтик', grams: 20 }],
    'колбас': [{ name: '🥓 1 ломтик', grams: 20 }],
    'сосис': [{ name: '🌭 1 шт', grams: 50 }],
    'сардельк': [{ name: '🌭 1 шт', grams: 100 }],
    // Сладости
    'конфет': [{ name: '🍬 1 шт', grams: 12 }],
    'печенье': [{ name: '🍪 1 шт', grams: 10 }, { name: '🍪 3 шт', grams: 30 }],
    'шоколад': [{ name: '🍫 1 долька', grams: 5 }, { name: '🍫 1 ряд', grams: 20 }],
    // Выпечка и блины
    'блин': [{ name: '🥞 1 шт', grams: 50 }, { name: '🥞 3 шт', grams: 150 }],
    'оладь': [{ name: '🥞 1 шт', grams: 30 }, { name: '🥞 3 шт', grams: 90 }],
    'сырник': [{ name: '🥞 1 шт', grams: 60 }, { name: '🥞 3 шт', grams: 180 }],
    'круассан': [{ name: '🥐 1 шт', grams: 60 }],
    'вафл': [{ name: '🧇 1 шт', grams: 35 }, { name: '🧇 2 шт', grams: 70 }],
    'бублик': [{ name: '🥯 1 шт', grams: 80 }],
    'бейгл': [{ name: '🥯 1 шт', grams: 90 }],
    'пончик': [{ name: '🍩 1 шт', grams: 50 }],
    'донат': [{ name: '🍩 1 шт', grams: 60 }],
    'багет': [{ name: '🥖 1 кусок', grams: 40 }, { name: '🥖 ½ багета', grams: 125 }],
    'кекс': [{ name: '🧁 1 шт', grams: 40 }],
    'маффин': [{ name: '🧁 1 шт', grams: 60 }],
    'эклер': [{ name: '🍰 1 шт', grams: 60 }],
    'пирожн': [{ name: '🍰 1 шт', grams: 80 }],
    'торт': [{ name: '🎂 1 кусок', grams: 100 }],
    // Орехи
    'орех': [{ name: '🥜 1 горсть', grams: 30 }],
    'миндал': [{ name: '🥜 1 горсть', grams: 30 }],
    'фундук': [{ name: '🥜 1 горсть', grams: 30 }],
    'кешью': [{ name: '🥜 1 горсть', grams: 30 }],
    'арахис': [{ name: '🥜 1 горсть', grams: 30 }],
    'семечк': [{ name: '🥜 1 горсть', grams: 30 }],
    // Напитки/приправы (сухие)
    'кофе': [{ name: '☕ 1 ч.л.', grams: 2 }],
    'чай ': [{ name: '🍵 1 ч.л.', grams: 2 }],
    // Готовые напитки
    'вода': [{ name: '💧 1 стакан', grams: 250 }, { name: '💧 ½ стакана', grams: 125 }],
    'компот': [{ name: '🥤 1 стакан', grams: 250 }],
    'кисель': [{ name: '🥤 1 стакан', grams: 250 }],
    'какао': [{ name: '☕ 1 чашка', grams: 200 }],
    'латте': [{ name: '☕ 1 чашка', grams: 300 }],
    'капучино': [{ name: '☕ 1 чашка', grams: 200 }],
    // Газировки
    'cola': [{ name: '🥤 1 банка', grams: 330 }, { name: '🥤 1 стакан', grams: 250 }],
    'кола': [{ name: '🥤 1 банка', grams: 330 }, { name: '🥤 1 стакан', grams: 250 }],
    'fanta': [{ name: '🥤 1 банка', grams: 330 }],
    'фанта': [{ name: '🥤 1 банка', grams: 330 }],
    'sprite': [{ name: '🥤 1 банка', grams: 330 }],
    'спрайт': [{ name: '🥤 1 банка', grams: 330 }],
    'лимонад': [{ name: '🥤 1 стакан', grams: 250 }],
    // Крупы и макароны
    'рис ': [{ name: '🍚 ½ стакана', grams: 100 }],
    'гречк': [{ name: '🍚 ½ стакана', grams: 100 }],
    'овсянк': [{ name: '🥣 ½ стакана', grams: 50 }],
    'каша': [{ name: '🥣 1 порция', grams: 200 }],
    'макарон': [{ name: '🍜 1 порция', grams: 80 }, { name: '🍜 2 порции', grams: 160 }],
    'спагетти': [{ name: '🍜 1 порция', grams: 80 }],
    'лапш': [{ name: '🍜 1 порция', grams: 80 }],
    'паста': [{ name: '🍜 1 порция', grams: 80 }],
    // Замороженные полуфабрикаты
    'пельмен': [{ name: '🥟 5 шт', grams: 75 }, { name: '🥟 10 шт', grams: 150 }, { name: '🥟 15 шт', grams: 225 }],
    'вареник': [{ name: '🥟 5 шт', grams: 100 }, { name: '🥟 10 шт', grams: 200 }],
    'манты': [{ name: '🥟 1 шт', grams: 50 }, { name: '🥟 3 шт', grams: 150 }],
    'хинкал': [{ name: '🥟 1 шт', grams: 60 }, { name: '🥟 3 шт', grams: 180 }],
    // Десерты и снеки
    'мороженое': [{ name: '🍦 1 шарик', grams: 50 }, { name: '🍦 2 шарика', grams: 100 }],
    'пломбир': [{ name: '🍦 1 шарик', grams: 50 }],
    'попкорн': [{ name: '🍿 1 горсть', grams: 10 }, { name: '🍿 1 порция', grams: 50 }],
    'чипс': [{ name: '🍿 1 горсть', grams: 25 }, { name: '🍿 1 пачка', grams: 90 }],
    // Масло сливочное (отдельно от растительного)
    'масло сливоч': [{ name: '🧈 1 кусочек', grams: 10 }, { name: '🧈 2 кусочка', grams: 20 }],
    // Мясо и стейки
    'стейк': [{ name: '🥩 1 шт', grams: 150 }, { name: '🥩 1 большой', grams: 250 }],
    'отбивн': [{ name: '🥩 1 шт', grams: 150 }],
    'шницел': [{ name: '🥩 1 шт', grams: 150 }],
    // Фастфуд
    'пицц': [{ name: '🍕 1 кусок', grams: 100 }, { name: '🍕 2 куска', grams: 200 }],
    'шаурм': [{ name: '🌯 1 шт', grams: 300 }],
    'шаверм': [{ name: '🌯 1 шт', grams: 300 }],
    'бурито': [{ name: '🌯 1 шт', grams: 300 }],
    'тако': [{ name: '🌮 1 шт', grams: 80 }, { name: '🌮 2 шт', grams: 160 }],
    'гамбургер': [{ name: '🍔 1 шт', grams: 200 }],
    'бургер': [{ name: '🍔 1 шт', grams: 200 }],
    'хот-дог': [{ name: '🌭 1 шт', grams: 150 }],
    // Суши и роллы
    'суш': [{ name: '🍣 1 шт', grams: 30 }, { name: '🍣 6 шт', grams: 180 }],
    'ролл': [{ name: '🍣 1 шт', grams: 30 }, { name: '🍣 6 шт', grams: 180 }, { name: '🍣 8 шт', grams: 240 }],
    // Салаты и супы
    'салат': [{ name: '🥗 1 порция', grams: 150 }, { name: '🥗 большая', grams: 250 }],
    'суп': [{ name: '🍲 1 тарелка', grams: 300 }, { name: '🍲 ½ тарелки', grams: 150 }],
    'борщ': [{ name: '🍲 1 тарелка', grams: 300 }],
    'щи': [{ name: '🍲 1 тарелка', grams: 300 }],
    'солянк': [{ name: '🍲 1 тарелка', grams: 300 }],
    'бульон': [{ name: '🍲 1 чашка', grams: 250 }],
  };

  // Negative patterns — если название содержит эти слова, НЕ применяем авто-порции
  const NEGATIVE_PATTERNS = ['сок', 'напиток', 'коктейль', 'смузи', 'пюре', 'варенье', 'джем', 'соус'];

  /**
   * Получить авто-порции по названию продукта
   * @param {string} productName - Название продукта
   * @returns {{name: string, grams: number}[]} - Массив порций или пустой массив
   */
  function getAutoPortions(productName) {
    const name = (productName || '').toLowerCase();
    
    // Проверяем negative patterns — если есть, возвращаем пустой массив
    for (const neg of NEGATIVE_PATTERNS) {
      if (name.includes(neg)) return [];
    }
    
    // Ищем совпадение с авто-порциями
    for (const [pattern, portions] of Object.entries(AUTO_PORTIONS)) {
      if (name.includes(pattern)) return portions;
    }
    return [];
  }

  // --- Portion History (память последней выбранной порции) ---
  const PORTION_HISTORY_KEY = 'heys_portion_history';
  
  /**
   * Получить последнюю выбранную порцию для продукта
   * @param {string|number} productId - ID продукта
   * @returns {number|null} - Граммы последней порции или null
   */
  function getLastPortion(productId) {
    try {
      const history = JSON.parse(localStorage.getItem(PORTION_HISTORY_KEY) || '{}');
      return history[String(productId)] || null;
    } catch { return null; }
  }

  /**
   * Сохранить выбранную порцию для продукта
   * @param {string|number} productId - ID продукта
   * @param {number} grams - Граммы порции
   */
  function saveLastPortion(productId, grams) {
    try {
      const history = JSON.parse(localStorage.getItem(PORTION_HISTORY_KEY) || '{}');
      history[String(productId)] = grams;
      // Ограничиваем историю до 100 продуктов (FIFO)
      const keys = Object.keys(history);
      if (keys.length > 100) {
        delete history[keys[0]];
      }
      localStorage.setItem(PORTION_HISTORY_KEY, JSON.stringify(history));
    } catch { /* ignore */ }
  }

  /** @typedef {Object} MealItem
   * @property {string} id
   * @property {string|number} product_id
   * @property {string} [name]
   * @property {number} grams
   */

  /** @typedef {Object} Meal
   * @property {string} id
   * @property {string} name
   * @property {string} [time]
   * @property {MealItem[]} items
   */

  /** @typedef {Object} DayRecord
   * @property {string} date
   * @property {string} sleepStart
   * @property {string} sleepEnd
   * @property {string} sleepNote
   * @property {number} sleepQuality
   * @property {number} weightMorning
   * @property {number} deficitPct
   * @property {number} steps
   * @property {number} householdMin
   * @property {{z:number[]}[]} trainings
   * @property {number} dayScore
   * @property {number} moodAvg
   * @property {number} wellbeingAvg
   * @property {number} stressAvg
   * @property {string} dayComment
   * @property {number} waterMl - Выпито воды в мл
   * @property {Meal[]} meals
   */

  function round1(v){ return Math.round(v*10)/10; }
  function uuid(){ return Math.random().toString(36).slice(2,10); }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function todayISO(){ const d=new Date(); return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }

  function ensureDay(d, prof){
    d=d||{}; 
    
    // Определяем, задан ли вес явно (не равен null/undefined и не пустая строка)
    const hasExplicitWeight = d.weightMorning != null && d.weightMorning !== '' && d.weightMorning !== 0;
    
    const base={
      date:d.date||todayISO(),
      sleepStart:d.sleepStart||'',
      sleepEnd:d.sleepEnd||'',
      sleepNote:d.sleepNote||'',
      // Если явно передана пустая строка, оставляем пустую строку
      sleepQuality:(d.sleepQuality==='')? '' : (d.sleepQuality!=null?d.sleepQuality:''),
      // Вес: если явно задан, берём его; иначе пустое значение (не из профиля)
      weightMorning: hasExplicitWeight ? d.weightMorning : (d.weightMorning || ''),
      // Целевой дефицит: если есть явный вес, берём из профиля или сохранённое значение
      deficitPct: hasExplicitWeight ? 
        (d.deficitPct != null ? d.deficitPct : (prof && prof.deficitPctTarget) || 0) : 
        (d.deficitPct || ''),
      steps:+d.steps||0,
      householdMin:+d.householdMin||0,
      trainings:Array.isArray(d.trainings)?d.trainings:[{z:[0,0,0,0]},{z:[0,0,0,0]}],
      // Если явно передана пустая строка, оставляем пустую строку
      dayScore:(d.dayScore==='')? '' : (d.dayScore!=null?d.dayScore:''),
      moodAvg:(d.moodAvg==='')? '' : (d.moodAvg!=null?d.moodAvg:''),
      wellbeingAvg:(d.wellbeingAvg==='')? '' : (d.wellbeingAvg!=null?d.wellbeingAvg:''),
      stressAvg:(d.stressAvg==='')? '' : (d.stressAvg!=null?d.stressAvg:''),
      dayComment:d.dayComment||'',
      waterMl: +d.waterMl || 0,
      meals:Array.isArray(d.meals)?d.meals:[{id:uuid(),name:'Приём пищи',time:'',mood:'',wellbeing:'',stress:'',items:[]}]
    };
    if(!Array.isArray(base.trainings)) base.trainings=[{z:[0,0,0,0],time:'',type:''},{z:[0,0,0,0],time:'',type:''}];
    if(base.trainings.length<2) while(base.trainings.length<2) base.trainings.push({z:[0,0,0,0],time:'',type:''});
    base.trainings = base.trainings.map(t => ({
      z: (t && Array.isArray(t.z)) ? [+t.z[0]||0, +t.z[1]||0, +t.z[2]||0, +t.z[3]||0] : [0,0,0,0],
      time: (t && t.time) || '',
      type: (t && t.type) || ''
    }));
    return base;
  }

  function computeDerivedProduct(p){
    const carbs= (+p.carbs100)|| ( (+p.simple100||0)+(+p.complex100||0) );
    const fat= (+p.fat100) || ( (+p.badFat100||0)+(+p.goodFat100||0)+(+p.trans100||0) );
    const kcal = (+p.kcal100) || (4*((+p.protein100||0)+carbs) + 8*fat);
    return {carbs100:round1(carbs), fat100:round1(fat), kcal100:round1(kcal)};
  }

  function buildProductIndex(ps){
    const byId=new Map(), byName=new Map();
    (ps||[]).forEach(p=>{ if(!p) return; const id=(p.id!=null?p.id:p.product_id); if(id!=null) byId.set(String(id).toLowerCase(), p); const nm=String(p.name||p.title||'').trim().toLowerCase(); if(nm) byName.set(nm,p); });
    return {byId, byName};
  }

  function getProductFromItem(it, idx){ if(!it) return null; if(it.product_id!=null) return idx.byId.get(String(it.product_id).toLowerCase())||null; if(it.productId!=null) return idx.byId.get(String(it.productId).toLowerCase())||null; const nm=String(it.name||it.title||'').trim().toLowerCase(); return nm? (idx.byName.get(nm)||null):null; }

  function per100(p){ const d=computeDerivedProduct(p); return {kcal100:d.kcal100,carbs100:d.carbs100,prot100:+p.protein100||0,fat100:d.fat100,simple100:+p.simple100||0,complex100:+p.complex100||0,bad100:+p.badFat100||0,good100:+p.goodFat100||0,trans100:+p.trans100||0,fiber100:+p.fiber100||0}; }

  function scale(v,g){ return Math.round(((+v||0)*(+g||0)/100)*10)/10; }

  // mealTotals с кэшированием по meal.id/hash и сигнатуре продуктов
  const _mealTotalsCache = new Map();
  function mealSignature(meal) {
    if (!meal || !Array.isArray(meal.items)) return '';
    return meal.items.map(it => `${it.product_id||it.productId||it.name||''}:${it.grams||0}`).join('|');
  }
  function idxSignature(idx) {
    if (!idx || !idx.byId) return '';
    return Array.from(idx.byId.keys()).join(',');
  }
  function mealTotals(meal, idx){
    const key = (meal.id||'') + '::' + mealSignature(meal) + '::' + idxSignature(idx);
    if (_mealTotalsCache.has(key)) return _mealTotalsCache.get(key);
    const T={kcal:0,carbs:0,simple:0,complex:0,prot:0,fat:0,bad:0,good:0,trans:0,fiber:0};
    (meal.items||[]).forEach(it=>{ const p=getProductFromItem(it,idx)||{}; const per=per100(p); const G=+it.grams||0; T.kcal+=scale(per.kcal100,G); T.carbs+=scale(per.carbs100,G); T.simple+=scale(per.simple100,G); T.complex+=scale(per.complex100,G); T.prot+=scale(per.prot100,G); T.fat+=scale(per.fat100,G); T.bad+=scale(per.bad100,G); T.good+=scale(per.good100,G); T.trans+=scale(per.trans100,G); T.fiber+=scale(per.fiber100,G); });
    Object.keys(T).forEach(k=> T[k]=round1(T[k]));
    _mealTotalsCache.set(key, T);
    return T;
  }

  // === Валидация ===
  function validateProduct(product) {
    if (!product || typeof product !== 'object') return false;
    if (!product.name || typeof product.name !== 'string') return false;
    if (typeof product.kcal100 !== 'number' || product.kcal100 < 0) return false;
    return true;
  }

  function validateMeal(meal) {
    if (!meal || typeof meal !== 'object') return false;
    if (!meal.name || typeof meal.name !== 'string') return false;
    if (!Array.isArray(meal.items)) return false;
    return true;
  }

  function validateDay(day) {
    if (!day || typeof day !== 'object') return false;
    if (!day.date || typeof day.date !== 'string') return false;
    if (!Array.isArray(day.meals)) return false;
    return true;
  }

  M.ensureDay = ensureDay;
  M.buildProductIndex = buildProductIndex;
  M.getProductFromItem = getProductFromItem;
  M.mealTotals = mealTotals;
  M.computeDerivedProduct = computeDerivedProduct;
  M.uuid = uuid;
  M.round1 = round1;
  M.todayISO = todayISO;
  M.validateProduct = validateProduct;
  M.validateMeal = validateMeal;
  M.validateDay = validateDay;
  M.getAutoPortions = getAutoPortions;
  M.AUTO_PORTIONS = AUTO_PORTIONS;
  M.getLastPortion = getLastPortion;
  M.saveLastPortion = saveLastPortion;
  
  console.log('HEYS: Loaded', Object.keys(AUTO_PORTIONS).length, 'portion patterns');
})(window);
