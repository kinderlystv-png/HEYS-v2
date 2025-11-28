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
   */

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
})(window);
