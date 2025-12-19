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
   * @property {string} [shared_origin_id] - ID продукта в shared_products, если склонирован из общей базы
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
  
  // Ночной порог: до 03:00 считается "вчера" (день ещё не закончился)
  const NIGHT_HOUR_THRESHOLD = 3;
  function todayISO(){ 
    const d = new Date(); 
    const hour = d.getHours();
    // До 3:00 — это ещё "вчера" (день не закончился)
    if (hour < NIGHT_HOUR_THRESHOLD) {
      d.setDate(d.getDate() - 1);
    }
    return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()); 
  }

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
      // Массив бытовых активностей (новый формат)
      householdActivities: Array.isArray(d.householdActivities) ? d.householdActivities : undefined,
      trainings:Array.isArray(d.trainings)?d.trainings:[],
      // Если явно передана пустая строка, оставляем пустую строку
      dayScore:(d.dayScore==='')? '' : (d.dayScore!=null?d.dayScore:''),
      moodAvg:(d.moodAvg==='')? '' : (d.moodAvg!=null?d.moodAvg:''),
      wellbeingAvg:(d.wellbeingAvg==='')? '' : (d.wellbeingAvg!=null?d.wellbeingAvg:''),
      stressAvg:(d.stressAvg==='')? '' : (d.stressAvg!=null?d.stressAvg:''),
      dayComment:d.dayComment||'',
      waterMl: +d.waterMl || 0,
      lastWaterTime: d.lastWaterTime || undefined,
      meals:Array.isArray(d.meals)?d.meals:[],
      // Замеры тела (сохраняем как есть если есть)
      measurements: d.measurements || undefined,
      // Холодовое воздействие (cold_exposure шаг)
      coldExposure: d.coldExposure || undefined,
      // Расчётные часы сна
      sleepHours: d.sleepHours != null ? +d.sleepHours : undefined,
      // Время бытовой активности (legacy)
      householdTime: d.householdTime || undefined,
      // День менструального цикла (null = не указан, 1-7 = день цикла)
      cycleDay: d.cycleDay != null ? d.cycleDay : null,
      // Загрузочный день (Refeed Day)
      isRefeedDay: d.isRefeedDay != null ? d.isRefeedDay : null,
      refeedReason: d.refeedReason || null, // 'deficit' | 'training' | 'holiday' | 'rest'
      // Утренние рейтинги из morning_mood шага
      moodMorning: d.moodMorning != null ? +d.moodMorning : undefined,
      wellbeingMorning: d.wellbeingMorning != null ? +d.wellbeingMorning : undefined,
      stressMorning: d.stressMorning != null ? +d.stressMorning : undefined,
      // Витамины/добавки
      supplementsPlanned: Array.isArray(d.supplementsPlanned) ? d.supplementsPlanned : undefined,
      supplementsTaken: Array.isArray(d.supplementsTaken) ? d.supplementsTaken : undefined,
      supplementsTakenAt: d.supplementsTakenAt || undefined,
      // Per-supp metadata (форма/доза/время приёма). Храним как объект.
      supplementsTakenMeta: (d.supplementsTakenMeta && typeof d.supplementsTakenMeta === 'object') ? d.supplementsTakenMeta : undefined,
      // Сохраняем metadata для стабильности
      updatedAt: d.updatedAt || undefined,
      schemaVersion: d.schemaVersion || undefined,
      _sourceId: d._sourceId || undefined
    };
    // 🆕 v3.7.3: Не создаём пустые тренировки, только очищаем невалидные
    if(!Array.isArray(base.trainings)) base.trainings=[];
    // Фильтруем пустые/невалидные тренировки (без времени И без зон)
    const isValidTraining = (t) => {
      if (!t) return false;
      // Есть время — валидна
      if (t.time && t.time !== '') return true;
      // Есть хоть одна зона > 0 — валидна  
      const zones = t.z || [];
      return zones.some(z => +z > 0);
    };
    // Нормализуем существующие тренировки (миграция полей)
    base.trainings = base.trainings.filter(isValidTraining).map(t => {
      // Миграция: quality → mood, feelAfter → wellbeing
      const mood = (t && t.mood !== undefined) ? +t.mood : (t && t.quality !== undefined) ? +t.quality : 5;
      const wellbeing = (t && t.wellbeing !== undefined) ? +t.wellbeing : (t && t.feelAfter !== undefined) ? +t.feelAfter : 5;
      const stress = (t && t.stress !== undefined) ? +t.stress : 5;
      return {
        z: (t && Array.isArray(t.z)) ? [+t.z[0]||0, +t.z[1]||0, +t.z[2]||0, +t.z[3]||0] : [0,0,0,0],
        time: (t && t.time) || '',
        type: (t && t.type) || '',
        mood: mood,
        wellbeing: wellbeing,
        stress: stress,
        comment: (t && t.comment) || ''
      };
    });
    return base;
  }

  function computeDerivedProduct(p){
    const carbs= (+p.carbs100)|| ( (+p.simple100||0)+(+p.complex100||0) );
    const fat= (+p.fat100) || ( (+p.badFat100||0)+(+p.goodFat100||0)+(+p.trans100||0) );
    // TEF-aware formula: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g (Atwater)
    // ALWAYS recalculate - ignore pasted kcal100 for consistency
    const kcal = 3*(+p.protein100||0) + 4*carbs + 9*fat;
    return {carbs100:round1(carbs), fat100:round1(fat), kcal100:round1(kcal)};
  }

  function buildProductIndex(ps){
    const byId=new Map(), byName=new Map();
    (ps||[]).forEach(p=>{ if(!p) return; const id=(p.id!=null?p.id:p.product_id); if(id!=null) byId.set(String(id).toLowerCase(), p); const nm=String(p.name||p.title||'').trim().toLowerCase(); if(nm) byName.set(nm,p); });
    return {byId, byName};
  }

  function getProductFromItem(it, idx){ 
    if(!it) return null; 
    // Сначала ищем по названию (приоритет)
    const nm=String(it.name||it.title||'').trim().toLowerCase(); 
    if(nm && idx.byName) { 
      const found = idx.byName.get(nm); 
      if(found) return found; 
    }
    // Fallback: ищем в индексе по product_id для обратной совместимости
    if(it.product_id!=null && idx.byId) { 
      const found = idx.byId.get(String(it.product_id).toLowerCase()); 
      if(found) return found; 
    } 
    if(it.productId!=null && idx.byId) { 
      const found = idx.byId.get(String(it.productId).toLowerCase()); 
      if(found) return found; 
    } 
    // FALLBACK: если продукт не найден в индексе, но в item есть нутриенты — возвращаем сам item как продукт
    // v3.8.2: Расширен для snapshot данных (simple100, complex100, carbs100)
    if(it.kcal100 !== undefined || it.protein100 !== undefined || it.simple100 !== undefined || it.complex100 !== undefined || it.carbs100 !== undefined) {
      return it;
    }
    return null; 
  }

  function per100(p){ const d=computeDerivedProduct(p); return {kcal100:d.kcal100,carbs100:d.carbs100,prot100:+p.protein100||0,fat100:d.fat100,simple100:+p.simple100||0,complex100:+p.complex100||0,bad100:+p.badFat100||0,good100:+p.goodFat100||0,trans100:+p.trans100||0,fiber100:+p.fiber100||0}; }

  function scale(v,g){ return Math.round(((+v||0)*(+g||0)/100)*10)/10; }

  // mealTotals с кэшированием по meal.id/hash и сигнатуре продуктов
  const _mealTotalsCache = new Map();
  
  // Функция очистки кэша — вызывать при обновлении продуктов
  function clearMealTotalsCache() {
    _mealTotalsCache.clear();
    // DEBUG (отключено): console.log('[HEYS] mealTotals cache cleared');
  }
  
  // Автоочистка при обновлении продуктов (fix: нули при синхронизации)
  if (typeof window !== 'undefined') {
    window.addEventListener('heysProductsUpdated', () => {
      clearMealTotalsCache();
    });
  }
  
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
  M.clearMealTotalsCache = clearMealTotalsCache;
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
  
  // === Training Helpers (v3.3.0) ===
  // Хелперы для работы с тренировками в контексте инсулиновой волны
  
  // Дефолтная длительность тренировки по типу (если z = [0,0,0,0])
  const DEFAULT_DURATION_BY_TYPE = {
    'cardio': 45,
    'strength': 60,
    'hobby': 30
  };
  
  // Лимиты для валидации тренировок
  const TRAINING_LIMITS = {
    maxDurationMin: 300,      // >5 часов — нереально
    maxTrainingsPerDay: 5,    // >5 тренировок — подозрительно
    maxKcalPerTraining: 2500, // >2500 ккал — скорее всего ошибка
    minDurationMin: 5         // <5 мин — не считаем
  };
  
  /**
   * Получить длительность тренировки в минутах
   * @param {Object} training - Объект тренировки {z: [0,0,0,0], time, type}
   * @returns {number} - Минуты
   */
  function getTrainingDuration(training) {
    if (!training) return 0;
    const fromZones = (training.z || []).reduce((sum, v) => sum + (+v || 0), 0);
    if (fromZones > 0) return fromZones;
    // Fallback по типу
    return DEFAULT_DURATION_BY_TYPE[training.type] || 45;
  }
  
  /**
   * Получить интервал тренировки (начало/конец в минутах от 00:00)
   * @param {Object} training - Объект тренировки
   * @returns {Object|null} - {startMin, endMin, durationMin, startTime, endTime} или null
   */
  function getTrainingInterval(training) {
    const duration = getTrainingDuration(training);
    if (!training?.time || duration === 0) return null;
    
    const [h, m] = training.time.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    
    const startMin = h * 60 + m;
    const endMin = startMin + duration;
    
    return {
      startMin,
      endMin,
      durationMin: duration,
      startTime: training.time,
      endTime: `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
    };
  }
  
  /**
   * Определить тип интенсивности тренировки (HIIT/MODERATE/LISS)
   * @param {Object} training - Объект тренировки
   * @returns {string} - 'HIIT' | 'MODERATE' | 'LISS' | 'unknown'
   */
  function getTrainingIntensityType(training) {
    const zones = training?.z || [0, 0, 0, 0];
    const totalMin = zones.reduce((s, v) => s + (+v || 0), 0);
    if (totalMin === 0) return 'unknown';
    
    const highIntensityMin = (+zones[2] || 0) + (+zones[3] || 0); // Zone 3 + Zone 4
    const ratio = highIntensityMin / totalMin;
    
    if (ratio > 0.5) return 'HIIT';      // >50% в высоких зонах
    if (ratio > 0.3) return 'MODERATE';  // 30-50%
    return 'LISS';                        // <30% — низкоинтенсивное кардио
  }
  
  /**
   * Проверить валидность тренировки
   * @param {Object} training - Объект тренировки
   * @param {number} kcal - Калории тренировки (trainK)
   * @returns {boolean}
   */
  function isValidTraining(training, kcal) {
    const duration = getTrainingDuration(training);
    if (duration < TRAINING_LIMITS.minDurationMin) return false;
    if (duration > TRAINING_LIMITS.maxDurationMin) return false;
    if (kcal > TRAINING_LIMITS.maxKcalPerTraining) return false;
    if (!training.time) return false; // Нет времени — не можем определить контекст
    return true;
  }
  
  /**
   * Объединить близкие тренировки в одну сессию
   * @param {Object[]} trainings - Массив тренировок
   * @param {number} maxGapMin - Максимальный промежуток для объединения (по умолчанию 30 мин)
   * @returns {Object[]} - Объединённые тренировки
   */
  function mergeCloseTrainingSessions(trainings, maxGapMin = 30) {
    if (!Array.isArray(trainings) || trainings.length < 2) return trainings || [];
    
    // Фильтруем тренировки с временем
    const withTime = trainings.filter(t => t && t.time);
    if (withTime.length < 2) return trainings;
    
    // Сортируем по времени
    const sorted = [...withTime].sort((a, b) => {
      const [ah, am] = a.time.split(':').map(Number);
      const [bh, bm] = b.time.split(':').map(Number);
      return (ah * 60 + am) - (bh * 60 + bm);
    });
    
    const TYPE_PRIORITY = { strength: 3, cardio: 2, hobby: 1 };
    const merged = [];
    let current = sorted[0];
    
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      const currentInterval = getTrainingInterval(current);
      const [nh, nm] = next.time.split(':').map(Number);
      const nextStart = nh * 60 + nm;
      
      // Gap < maxGapMin → merge
      if (currentInterval && nextStart - currentInterval.endMin < maxGapMin) {
        current = {
          time: current.time, // Время начала первой
          type: (TYPE_PRIORITY[next.type] || 0) > (TYPE_PRIORITY[current.type] || 0) ? next.type : current.type,
          z: (current.z || [0,0,0,0]).map((v, i) => (+v || 0) + (+(next.z?.[i]) || 0)), // Суммируем зоны
          _merged: true
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
    
    return merged;
  }
  
  // Экспорт Training Helpers
  M.getTrainingDuration = getTrainingDuration;
  M.getTrainingInterval = getTrainingInterval;
  M.getTrainingIntensityType = getTrainingIntensityType;
  M.isValidTraining = isValidTraining;
  M.mergeCloseTrainingSessions = mergeCloseTrainingSessions;
  M.TRAINING_LIMITS = TRAINING_LIMITS;
  M.DEFAULT_DURATION_BY_TYPE = DEFAULT_DURATION_BY_TYPE;
  
  // === Shared Products Helpers (v3.18.0) ===
  
  /**
   * Вычисление fingerprint продукта для дедупликации
   * Fingerprint строится из нормализованного имени + округлённых нутриентов
   * @param {Product} product - Объект продукта
   * @returns {Promise<string>} - SHA-256 fingerprint (hex)
   */
  async function computeProductFingerprint(product) {
    if (!product) return '';
    
    // Нормализация имени: lowercase, trim, collapse whitespace
    const namePart = (product.name || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
    
    // Округление нутриентов до 1 знака для стабильности
    const nutrientsPart = [
      round1(product.simple100 || 0),
      round1(product.complex100 || 0),
      round1(product.protein100 || 0),
      round1(product.badFat100 || 0),
      round1(product.goodFat100 || 0),
      round1(product.trans100 || 0),
      round1(product.fiber100 || 0),
      round1(product.gi || 0),
      round1(product.harm || 0)
    ].join('|');
    
    const combined = `${namePart}::${nutrientsPart}`;
    
    // SHA-256 через Web Crypto API
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (e) {
      // Fallback: простой детерминированный хеш
      let hash = 0;
      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash).toString(16).padStart(8, '0');
    }
  }
  
  /**
   * Нормализация имени продукта для поиска и дедупликации
   * @param {string} name - Имя продукта
   * @returns {string} - Нормализованное имя
   */
  function normalizeProductName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/ё/g, 'е'); // Русская нормализация
  }
  
  M.computeProductFingerprint = computeProductFingerprint;
  M.normalizeProductName = normalizeProductName;
  
  console.log('HEYS: Loaded', Object.keys(AUTO_PORTIONS).length, 'portion patterns');
})(window);
