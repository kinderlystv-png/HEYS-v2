// heys_supplements_v1.js — Трекинг витаминов и добавок
// Версия: 2.0.0 | Дата: 2025-12-14
// Каталог витаминов, timing, взаимодействия, интеграция с инсулиновой волной
(function(global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // === ВРЕМЯ ПРИЁМА ===
  const TIMING = {
    morning:    { name: 'Утром',           icon: '🌅', hours: [6, 11] },
    withFood:   { name: 'С едой',          icon: '🍽️', hours: null },
    withFat:    { name: 'С жирной едой',   icon: '🥑', hours: null },
    evening:    { name: 'Вечером',         icon: '🌙', hours: [18, 23] },
    beforeBed:  { name: 'Перед сном',      icon: '😴', hours: [21, 24] },
    empty:      { name: 'Натощак',         icon: '⏰', hours: null },
    beforeMeal: { name: 'До еды',          icon: '⏳', hours: null },
    afterTrain: { name: 'После трени',     icon: '💪', hours: null },
    anytime:    { name: 'Любое время',     icon: '✨', hours: null },
  };

  // === КАТАЛОГ ВИТАМИНОВ ===
  const SUPPLEMENTS_CATALOG = {
    // === 🛡️ Иммунитет ===
    vitD:     { name: 'D3',       icon: '☀️', category: 'immune', timing: 'withFat', tip: 'Лучше с жирной едой' },
    vitC:     { name: 'C',        icon: '🍊', category: 'immune', timing: 'anytime', tip: 'Улучшает усвоение железа' },
    zinc:     { name: 'Цинк',     icon: '🛡️', category: 'immune', timing: 'withFood', tip: 'Не сочетать с кальцием' },
    selenium: { name: 'Селен',    icon: '🔬', category: 'immune', timing: 'withFood' },
    
    // === 🧠 Мозг и нервы ===
    omega3:    { name: 'Омега-3',  icon: '🐟', category: 'brain', timing: 'withFood', tip: 'Усиливает D3' },
    magnesium: { name: 'Магний',   icon: '💤', category: 'brain', timing: 'evening', tip: 'Расслабляет мышцы' },
    b12:       { name: 'B12',      icon: '⚡', category: 'brain', timing: 'morning', tip: 'Даёт энергию' },
    b6:        { name: 'B6',       icon: '🧬', category: 'brain', timing: 'morning' },
    lecithin:  { name: 'Лецитин',  icon: '🥚', category: 'brain', timing: 'withFood' },
    
    // === 🦴 Кости и суставы ===
    calcium:     { name: 'Кальций',    icon: '🦴', category: 'bones', timing: 'withFood', tip: 'Не с железом!' },
    k2:          { name: 'K2',         icon: '🥬', category: 'bones', timing: 'withFat', tip: 'Синергия с D3' },
    collagen:    { name: 'Коллаген',   icon: '✨', category: 'bones', timing: 'empty', tip: 'Натощак + витамин C' },
    glucosamine: { name: 'Глюкозамин', icon: '🦵', category: 'bones', timing: 'withFood' },
    
    // === 💪 Спорт ===
    creatine: { name: 'Креатин', icon: '💪', category: 'sport', timing: 'afterTrain', tip: '5г в день' },
    bcaa:     { name: 'BCAA',    icon: '🏋️', category: 'sport', timing: 'afterTrain' },
    protein:  { name: 'Протеин', icon: '🥛', category: 'sport', timing: 'afterTrain', tip: '30мин после трени' },
    
    // === 💇 Красота ===
    biotin:     { name: 'Биотин',       icon: '💇', category: 'beauty', timing: 'withFood', tip: 'Волосы и ногти' },
    vitE:       { name: 'E',            icon: '🌻', category: 'beauty', timing: 'withFat' },
    hyaluronic: { name: 'Гиалуроновая', icon: '💧', category: 'beauty', timing: 'empty' },
    
    // === 🌸 Женское здоровье ===
    iron:  { name: 'Железо',   icon: '🩸', category: 'female', timing: 'empty', tip: 'С витамином C, без кальция' },
    folic: { name: 'Фолиевая', icon: '🌸', category: 'female', timing: 'morning' },
    
    // === 💤 Сон ===
    melatonin: { name: 'Мелатонин', icon: '🌙', category: 'sleep', timing: 'beforeBed', tip: 'За 30-60мин до сна' },
    glycine:   { name: 'Глицин',    icon: '😴', category: 'sleep', timing: 'beforeBed' },
    ltheanine: { name: 'L-теанин',  icon: '🍵', category: 'sleep', timing: 'evening', tip: 'Расслабляет без сонливости' },
    
    // === ⚡ Энергия ===
    coq10: { name: 'CoQ10', icon: '❤️', category: 'energy', timing: 'withFat', tip: 'Энергия для сердца' },
    
    // === 🧪 Метаболизм (влияют на инсулиновую волну!) ===
    berberine: { name: 'Берберин', icon: '🌿', category: 'metabolism', timing: 'beforeMeal', insulinBonus: -0.15, tip: '💡 -15% инсулиновая волна' },
    cinnamon:  { name: 'Корица',   icon: '🍂', category: 'metabolism', timing: 'withFood', insulinBonus: -0.10, tip: '💡 -10% инсулиновая волна' },
    chromium:  { name: 'Хром',     icon: '⚙️', category: 'metabolism', timing: 'withFood', tip: 'Стабилизирует сахар' },
    vinegar:   { name: 'Уксус',    icon: '🍎', category: 'metabolism', timing: 'beforeMeal', insulinBonus: -0.20, tip: '💡 -20% инсулиновая волна' },
  };

  // === КАТЕГОРИИ ===
  const SUPPLEMENT_CATEGORIES = {
    immune:     { name: 'Иммунитет',   icon: '🛡️', order: 1 },
    brain:      { name: 'Мозг',        icon: '🧠', order: 2 },
    bones:      { name: 'Кости',       icon: '🦴', order: 3 },
    sport:      { name: 'Спорт',       icon: '💪', order: 4 },
    beauty:     { name: 'Красота',     icon: '💇', order: 5 },
    female:     { name: 'Женское',     icon: '🌸', order: 6 },
    sleep:      { name: 'Сон',         icon: '💤', order: 7 },
    energy:     { name: 'Энергия',     icon: '⚡', order: 8 },
    metabolism: { name: 'Метаболизм',  icon: '🧪', order: 9 },
  };

  // === ВЗАИМОДЕЙСТВИЯ v2.0 ===
  const INTERACTIONS = {
    synergies: [
      { pair: ['vitD', 'vitK2'], desc: '✨ D3 + K2 — кальций идёт в кости, а не в сосуды' },
      { pair: ['iron', 'vitC'], desc: '✨ Железо + C — усвоение ×3' },
      { pair: ['calcium', 'vitD'], desc: '✨ Кальций + D3 — максимальное усвоение' },
      { pair: ['magnesium', 'b6'], desc: '✨ Магний + B6 — классическая связка' },
      { pair: ['omega3', 'vitD'], desc: '✨ Omega-3 + D3 — жиры помогают усвоению' },
      { pair: ['omega3', 'vitE'], desc: '✨ Omega-3 + E — защита от окисления' },
      { pair: ['zinc', 'vitC'], desc: '✨ Цинк + C — усиление иммунитета' },
      { pair: ['curcumin', 'omega3'], desc: '✨ Куркумин + Omega-3 — противовоспалительная синергия' },
    ],
    conflicts: [
      { pair: ['iron', 'calcium'], desc: '⚠️ Железо vs Кальций — принимать с интервалом 2-3 часа' },
      { pair: ['zinc', 'calcium'], desc: '⚠️ Цинк vs Кальций — конкурируют за усвоение' },
      { pair: ['zinc', 'iron'], desc: '⚠️ Цинк vs Железо — принимать раздельно' },
      { pair: ['magnesium', 'calcium'], desc: '⚠️ Магний vs Кальций — в больших дозах мешают друг другу' },
      { pair: ['vitE', 'iron'], desc: '⚠️ Витамин E vs Железо — E снижает усвоение железа' },
    ],
  };

  // === КУРСЫ (PRESETS) v3.0 ===
  const COURSES = {
    winter: {
      id: 'winter',
      name: '🧊 Зима',
      desc: 'Иммунитет на холодный сезон',
      supplements: ['vitD', 'vitC', 'zinc'],
      duration: '3 месяца',
      tags: ['иммунитет', 'сезон']
    },
    active: {
      id: 'active',
      name: '🏃 Активный образ',
      desc: 'Для спортсменов и активных людей',
      supplements: ['omega3', 'magnesium', 'coq10'],
      duration: 'постоянно',
      tags: ['спорт', 'энергия']
    },
    women30: {
      id: 'women30',
      name: '👩 30+ Женщина',
      desc: 'Базовый набор для женщин',
      supplements: ['vitD', 'calcium', 'iron', 'b12'],
      duration: 'постоянно',
      tags: ['женское', 'базовый']
    },
    beauty: {
      id: 'beauty',
      name: '✨ Красота',
      desc: 'Кожа, волосы, ногти',
      supplements: ['biotin', 'collagen', 'vitE', 'hyaluronic'],
      duration: '2-3 месяца',
      tags: ['красота']
    },
    sleep: {
      id: 'sleep',
      name: '😴 Здоровый сон',
      desc: 'Улучшение качества сна',
      supplements: ['magnesium', 'melatonin', 'glycine'],
      duration: '1-2 месяца',
      tags: ['сон', 'стресс']
    },
    brain: {
      id: 'brain',
      name: '🧠 Мозг',
      desc: 'Концентрация и память',
      supplements: ['omega3', 'lecithin', 'b12', 'b6'],
      duration: 'постоянно',
      tags: ['мозг', 'работа']
    },
    metabolism: {
      id: 'metabolism',
      name: '🔥 Метаболизм',
      desc: 'Улучшение обмена веществ, снижение инсулина',
      supplements: ['berberine', 'chromium', 'cinnamon'],
      duration: '1-3 месяца',
      tags: ['похудение', 'инсулин']
    },
  };

  // === CSS АНИМАЦИИ ===
  const ANIMATIONS_CSS = `
    @keyframes chip-bounce {
      0% { transform: scale(1); }
      50% { transform: scale(0.92); }
      100% { transform: scale(1); }
    }
    .supp-chip-animate {
      animation: chip-bounce 0.15s ease-out;
    }
  `;

  // Инжектим CSS анимации
  if (typeof document !== 'undefined' && !document.getElementById('heys-supplements-css')) {
    const style = document.createElement('style');
    style.id = 'heys-supplements-css';
    style.textContent = ANIMATIONS_CSS;
    document.head.appendChild(style);
  }

  // === УТИЛИТЫ ===

  /**
   * Получить витамины сгруппированные по категориям
   */
  function getSupplementsByCategory() {
    const result = {};
    for (const [id, supp] of Object.entries(SUPPLEMENTS_CATALOG)) {
      const cat = supp.category;
      if (!result[cat]) result[cat] = [];
      result[cat].push({ id, ...supp });
    }
    // Сортируем категории по order
    const sorted = {};
    Object.entries(SUPPLEMENT_CATEGORIES)
      .sort((a, b) => a[1].order - b[1].order)
      .forEach(([catId]) => {
        if (result[catId]) sorted[catId] = result[catId];
      });
    return sorted;
  }

  // === КАСТОМНЫЕ ДОБАВКИ ===
  
  /**
   * Получить кастомные добавки пользователя
   */
  function getCustomSupplements() {
    const U = HEYS.utils || {};
    const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
    return profile.customSupplements || [];
  }

  /**
   * Добавить кастомную добавку
   * @param {Object} supp - { name, icon, timing }
   */
  function addCustomSupplement(supp) {
    const U = HEYS.utils || {};
    const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
    const customs = profile.customSupplements || [];
    
    const newSupp = {
      id: 'custom_' + Date.now(),
      name: supp.name || 'Моя добавка',
      icon: supp.icon || '💊',
      timing: supp.timing || 'anytime',
      category: 'custom',
      isCustom: true,
    };
    
    customs.push(newSupp);
    profile.customSupplements = customs;
    if (U.lsSet) U.lsSet('heys_profile', profile);
    
    // Добавляем в рантайм каталог
    SUPPLEMENTS_CATALOG[newSupp.id] = newSupp;
    
    window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
    return newSupp;
  }

  /**
   * Удалить кастомную добавку
   */
  function removeCustomSupplement(suppId) {
    if (!suppId.startsWith('custom_')) return false;
    
    const U = HEYS.utils || {};
    const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
    const customs = profile.customSupplements || [];
    
    profile.customSupplements = customs.filter(s => s.id !== suppId);
    if (U.lsSet) U.lsSet('heys_profile', profile);
    
    // Удаляем из рантайм каталога
    delete SUPPLEMENTS_CATALOG[suppId];
    
    window.dispatchEvent(new CustomEvent('heys:supplements-updated'));
    return true;
  }

  /**
   * Загрузить кастомные добавки в каталог при инициализации
   */
  function loadCustomSupplements() {
    const customs = getCustomSupplements();
    for (const supp of customs) {
      SUPPLEMENTS_CATALOG[supp.id] = supp;
    }
  }
  
  // Загружаем кастомные при старте
  if (typeof window !== 'undefined') {
    setTimeout(loadCustomSupplements, 100);
  }

  // === НАПОМИНАНИЯ ПО ВРЕМЕНИ ===

  /**
   * Получить напоминание по текущему времени
   * @param {string[]} planned - запланированные добавки
   * @param {string[]} taken - уже принятые
   * @returns {Object|null} { message, urgency, suppIds }
   */
  function getTimeReminder(planned, taken) {
    const hour = new Date().getHours();
    const notTaken = planned.filter(id => !taken.includes(id));
    if (notTaken.length === 0) return null;
    
    // Определяем какие добавки нужны сейчас
    const morningSupps = notTaken.filter(id => {
      const s = SUPPLEMENTS_CATALOG[id];
      return s && (s.timing === 'morning' || s.timing === 'empty');
    });
    
    const eveningSupps = notTaken.filter(id => {
      const s = SUPPLEMENTS_CATALOG[id];
      return s && (s.timing === 'evening' || s.timing === 'beforeBed');
    });
    
    // Утро (7-10) — напоминание об утренних
    if (hour >= 7 && hour <= 10 && morningSupps.length > 0) {
      return {
        message: '🌅 Утренние витамины ждут!',
        urgency: 'high',
        suppIds: morningSupps,
      };
    }
    
    // Поздний вечер (21-23) — напоминание о вечерних
    if (hour >= 21 && hour <= 23 && eveningSupps.length > 0) {
      return {
        message: '🌙 Не забудь вечерние!',
        urgency: 'high', 
        suppIds: eveningSupps,
      };
    }
    
    // День — мягкое напоминание если много не принято
    if (hour >= 12 && hour <= 18 && notTaken.length >= 3) {
      return {
        message: `📋 Ещё ${notTaken.length} добавок не принято`,
        urgency: 'low',
        suppIds: notTaken,
      };
    }
    
    return null;
  }

  // === УМНЫЕ РЕКОМЕНДАЦИИ ПО ПРОФИЛЮ ===
  
  /**
   * Получить персональные рекомендации по добавкам
   * @param {Object} profile - профиль пользователя
   * @param {Object} dayData - данные дня
   * @returns {Array} массив { id, reason }
   */
  function getSmartRecommendations(profile, dayData) {
    const recs = [];
    const U = HEYS.utils || {};
    const planned = getPlannedSupplements();
    
    if (!profile) return recs;
    
    // По полу
    if (profile.gender === 'Женский') {
      if (!planned.includes('iron') && SUPPLEMENTS_CATALOG['iron'])
        recs.push({ id: 'iron', reason: '🌸 Железо важно для женщин (менструация)' });
      if (!planned.includes('folic') && SUPPLEMENTS_CATALOG['folic'])
        recs.push({ id: 'folic', reason: '🌸 Фолиевая кислота — женский базис' });
      if (!planned.includes('calcium') && SUPPLEMENTS_CATALOG['calcium'])
        recs.push({ id: 'calcium', reason: '🦴 Кальций — профилактика остеопороза' });
    }
    
    // По возрасту
    const age = profile.age || 30;
    if (age >= 40) {
      if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
        recs.push({ id: 'vitD', reason: '☀️ После 40 D3 критичен для костей и иммунитета' });
      if (!planned.includes('coq10') && SUPPLEMENTS_CATALOG['coq10'])
        recs.push({ id: 'coq10', reason: '❤️ CoQ10 поддерживает сердце после 40' });
      if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG['omega3'])
        recs.push({ id: 'omega3', reason: '🐟 Омега-3 для мозга и сердца 40+' });
    }
    if (age >= 50) {
      if (!planned.includes('b12') && SUPPLEMENTS_CATALOG['b12'])
        recs.push({ id: 'b12', reason: '⚡ После 50 B12 усваивается хуже — нужна добавка' });
    }
    
    // По сезону
    const month = new Date().getMonth();
    if (month >= 10 || month <= 2) { // Ноябрь-Февраль
      if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
        recs.push({ id: 'vitD', reason: '🧊 Зимой D3 обязателен (мало солнца)' });
      if (!planned.includes('vitC') && SUPPLEMENTS_CATALOG['vitC'])
        recs.push({ id: 'vitC', reason: '🍊 Витамин C для иммунитета зимой' });
      if (!planned.includes('zinc') && SUPPLEMENTS_CATALOG['zinc'])
        recs.push({ id: 'zinc', reason: '🛡️ Цинк — защита от простуд' });
    }
    
    // По данным дня
    if (dayData) {
      // Плохой сон → магний
      if (dayData.sleepQuality && dayData.sleepQuality <= 3) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '😴 Плохой сон → попробуй магний' });
        if (!planned.includes('melatonin') && SUPPLEMENTS_CATALOG['melatonin'])
          recs.push({ id: 'melatonin', reason: '💤 Мелатонин поможет засыпать' });
      }
      
      // Высокий стресс
      if (dayData.stressAvg && dayData.stressAvg >= 6) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '😰 Высокий стресс → магний успокаивает' });
        if (!planned.includes('b6') && SUPPLEMENTS_CATALOG['b6'])
          recs.push({ id: 'b6', reason: '🧠 B6 снижает тревожность' });
      }
      
      // Тренировки
      if (dayData.trainings && dayData.trainings.length > 0) {
        if (!planned.includes('magnesium') && SUPPLEMENTS_CATALOG['magnesium'])
          recs.push({ id: 'magnesium', reason: '💪 После трени магний от судорог' });
        if (!planned.includes('omega3') && SUPPLEMENTS_CATALOG['omega3'])
          recs.push({ id: 'omega3', reason: '💪 Омега-3 для восстановления' });
        if (!planned.includes('vitD') && SUPPLEMENTS_CATALOG['vitD'])
          recs.push({ id: 'vitD', reason: '💪 D3 помогает мышцам восстанавливаться' });
      }
    }
    
    // Удаляем дубликаты (по id)
    const seen = new Set();
    return recs.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }
  
  // === СВЯЗЬ С ЕДОЙ ===
  
  /**
   * Получить советы по витаминам на основе еды
   * @param {Array} meals - приёмы пищи
   * @param {string[]} planned - запланированные добавки
   * @param {string[]} taken - принятые добавки
   * @param {Object} pIndex - индекс продуктов
   * @returns {Array} массив советов
   */
  function getMealBasedAdvice(meals, planned, taken, pIndex) {
    const advices = [];
    const notTaken = planned.filter(id => !taken.includes(id));
    if (notTaken.length === 0 || !meals || meals.length === 0) return advices;
    
    // Анализируем последний приём пищи
    const lastMeal = meals[meals.length - 1];
    if (!lastMeal || !lastMeal.items?.length) return advices;
    
    // Helper для получения продукта
    const getProduct = (item) => {
      if (!pIndex) return null;
      const nameKey = (item.name || '').trim().toLowerCase();
      if (nameKey && pIndex.byName) {
        const found = pIndex.byName.get(nameKey);
        if (found) return found;
      }
      if (item.product_id != null && pIndex.byId) {
        return pIndex.byId.get(String(item.product_id).toLowerCase());
      }
      return item.fat100 !== undefined ? item : null;
    };
    
    // 1. Считаем жиры в последнем приёме
    let mealFat = 0;
    for (const item of lastMeal.items) {
      const p = getProduct(item);
      if (p) mealFat += (p.fat100 || 0) * (item.grams || 100) / 100;
    }
    
    // Жирная еда → жирорастворимые витамины
    if (mealFat >= 10) {
      const fatSoluble = notTaken.filter(id => 
        SUPPLEMENTS_CATALOG[id]?.timing === 'withFat'
      );
      if (fatSoluble.length > 0) {
        const names = fatSoluble.map(id => SUPPLEMENTS_CATALOG[id].name).join(', ');
        advices.push({
          type: 'synergy',
          icon: '🥑',
          message: `Жирный приём! Идеально для: ${names}`,
          details: 'Жирорастворимые витамины (D, E, K, A) усваиваются в 3-4 раза лучше с жирами.',
          suppIds: fatSoluble,
          priority: 'high'
        });
      }
    }
    
    // 2. Еда с железом + витамин C
    const ironRichFoods = ['печень', 'говядина', 'гречка', 'чечевица', 'шпинат', 'фасоль'];
    const hasIronFood = lastMeal.items.some(item =>
      ironRichFoods.some(f => (item.name || '').toLowerCase().includes(f))
    );
    if (hasIronFood && notTaken.includes('vitC')) {
      advices.push({
        type: 'synergy',
        icon: '🍊',
        message: 'Еда с железом! Добавь витамин C для усвоения ×3',
        details: 'Витамин C превращает негемовое железо в легкоусваиваемую форму.',
        suppIds: ['vitC'],
        priority: 'high'
      });
    }
    
    // 3. Молочка + НЕ принимать железо
    const dairyFoods = ['творог', 'молоко', 'сыр', 'йогурт', 'кефир', 'сметана'];
    const hasDairy = lastMeal.items.some(item =>
      dairyFoods.some(f => (item.name || '').toLowerCase().includes(f))
    );
    if (hasDairy && notTaken.includes('iron')) {
      advices.push({
        type: 'warning',
        icon: '⚠️',
        message: 'Молочка снижает усвоение железа. Раздели на 2 часа',
        details: 'Кальций конкурирует с железом за усвоение в кишечнике.',
        suppIds: ['iron'],
        priority: 'medium'
      });
    }
    
    // 4. Кофе + добавки
    const hasCoffee = lastMeal.items.some(item =>
      (item.name || '').toLowerCase().includes('кофе')
    );
    if (hasCoffee) {
      const blockedSupps = notTaken.filter(id => 
        ['iron', 'calcium', 'zinc', 'magnesium'].includes(id)
      );
      if (blockedSupps.length > 0) {
        const names = blockedSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push({
          type: 'warning',
          icon: '☕',
          message: `Кофе мешает: ${names}. Подожди 1-2 часа`,
          details: 'Танины и кофеин снижают усвоение минералов на 40-60%.',
          suppIds: blockedSupps,
          priority: 'medium'
        });
      }
    }
    
    // 5. Белковая еда + креатин/BCAA
    let mealProtein = 0;
    for (const item of lastMeal.items) {
      const p = getProduct(item);
      if (p) mealProtein += (p.protein100 || 0) * (item.grams || 100) / 100;
    }
    if (mealProtein >= 25) {
      const sportSupps = notTaken.filter(id => 
        ['creatine', 'bcaa', 'protein'].includes(id)
      );
      if (sportSupps.length > 0) {
        const names = sportSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push({
          type: 'synergy',
          icon: '💪',
          message: `Белковый приём! Отлично для: ${names}`,
          details: 'Спортивные добавки лучше усваиваются с белковой едой.',
          suppIds: sportSupps,
          priority: 'low'
        });
      }
    }
    
    return advices;
  }

  /**
   * Применить курс — добавить его добавки в planned
   */
  function applyCourse(courseId) {
    const course = COURSES[courseId];
    if (!course) return false;
    
    const current = getPlannedSupplements();
    const newSupps = [...new Set([...current, ...course.supplements])];
    savePlannedSupplements(newSupps);
    
    return true;
  }

  /**
   * Получить запланированные на сегодня (из профиля — запоминается)
   */
  function getPlannedSupplements() {
    const U = HEYS.utils || {};
    const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
    return profile.plannedSupplements || [];
  }

  /**
   * Сохранить запланированные (в профиль — запоминается на след. день)
   */
  function savePlannedSupplements(supplements) {
    const U = HEYS.utils || {};
    const profile = U.lsGet ? U.lsGet('heys_profile', {}) : {};
    profile.plannedSupplements = supplements;
    if (U.lsSet) U.lsSet('heys_profile', profile);
    
    // Событие для синхронизации
    window.dispatchEvent(new CustomEvent('heys:profile-updated', { 
      detail: { field: 'plannedSupplements' }
    }));
  }

  /**
   * Получить принятые сегодня
   */
  function getTakenSupplements(dateKey) {
    const U = HEYS.utils || {};
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateKey}`, {}) : {};
    return dayData.supplementsTaken || [];
  }

  /**
   * Отметить витамин как принятый
   */
  function markSupplementTaken(dateKey, suppId, taken = true) {
    const U = HEYS.utils || {};
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) : { date: dateKey };
    
    let takenList = dayData.supplementsTaken || [];
    if (taken && !takenList.includes(suppId)) {
      takenList = [...takenList, suppId];
    } else if (!taken) {
      takenList = takenList.filter(id => id !== suppId);
    }
    
    dayData.supplementsTaken = takenList;
    dayData.supplementsTakenAt = new Date().toISOString();
    dayData.updatedAt = Date.now();
    
    if (U.lsSet) U.lsSet(`heys_dayv2_${dateKey}`, dayData);
    
    // Событие для обновления UI
    window.dispatchEvent(new CustomEvent('heys:day-updated', { 
      detail: { date: dateKey, field: 'supplementsTaken' }
    }));
  }

  /**
   * Отметить все запланированные как принятые
   */
  function markAllSupplementsTaken(dateKey) {
    const U = HEYS.utils || {};
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateKey}`, { date: dateKey }) : { date: dateKey };
    const planned = dayData.supplementsPlanned || getPlannedSupplements();
    
    dayData.supplementsTaken = [...planned];
    dayData.supplementsTakenAt = new Date().toISOString();
    dayData.updatedAt = Date.now();
    
    if (U.lsSet) U.lsSet(`heys_dayv2_${dateKey}`, dayData);
    
    window.dispatchEvent(new CustomEvent('heys:day-updated', { 
      detail: { date: dateKey, field: 'supplementsTaken' }
    }));
  }

  /**
   * Получить статистику соблюдения курса за N дней
   */
  function getComplianceStats(daysBack = 7) {
    const U = HEYS.utils || {};
    const today = new Date();
    let totalPlanned = 0;
    let totalTaken = 0;
    let daysWithData = 0;
    
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${key}`, {}) : {};
      
      const planned = dayData.supplementsPlanned || [];
      const taken = dayData.supplementsTaken || [];
      
      if (planned.length > 0) {
        daysWithData++;
        totalPlanned += planned.length;
        totalTaken += taken.filter(id => planned.includes(id)).length;
      }
    }
    
    return {
      daysWithData,
      totalPlanned,
      totalTaken,
      compliancePct: totalPlanned > 0 ? Math.round((totalTaken / totalPlanned) * 100) : 0
    };
  }

  // === v2.0 ФУНКЦИИ ===

  /**
   * Проверить взаимодействия между выбранными добавками
   * @param {string[]} suppIds - массив ID выбранных добавок
   * @returns {{ synergies: string[], conflicts: string[] }}
   */
  function checkInteractions(suppIds) {
    const synergies = [];
    const conflicts = [];
    
    if (!suppIds || suppIds.length < 2) return { synergies, conflicts };
    
    for (const interaction of INTERACTIONS.synergies) {
      const [a, b] = interaction.pair;
      if (suppIds.includes(a) && suppIds.includes(b)) {
        synergies.push(interaction.desc);
      }
    }
    
    for (const interaction of INTERACTIONS.conflicts) {
      const [a, b] = interaction.pair;
      if (suppIds.includes(a) && suppIds.includes(b)) {
        conflicts.push(interaction.desc);
      }
    }
    
    return { synergies, conflicts };
  }

  /**
   * Рассчитать суммарный бонус к инсулиновой волне от принятых добавок
   * @param {string} dateKey - дата YYYY-MM-DD
   * @returns {number} бонус (отрицательный = волна короче)
   */
  function getInsulinWaveBonus(dateKey) {
    const taken = getTakenSupplements(dateKey);
    if (!taken.length) return 0;
    
    let totalBonus = 0;
    for (const id of taken) {
      const supp = SUPPLEMENTS_CATALOG[id];
      if (supp && supp.insulinBonus) {
        totalBonus += supp.insulinBonus;
      }
    }
    
    // Кепаем максимумом -30%
    return Math.max(-0.30, totalBonus);
  }

  /**
   * Получить умные советы по добавкам на основе времени и состояния
   * @param {string} dateKey - дата
   * @returns {string[]} массив советов
   */
  function getSupplementAdvices(dateKey) {
    const advices = [];
    const now = new Date();
    const hour = now.getHours();
    
    const U = HEYS.utils || {};
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateKey}`, {}) : {};
    const planned = dayData.supplementsPlanned || getPlannedSupplements();
    const taken = dayData.supplementsTaken || [];
    const notTaken = planned.filter(id => !taken.includes(id));
    
    if (notTaken.length === 0) return advices;
    
    // Утренние добавки
    if (hour >= 6 && hour < 12) {
      const morningSupps = notTaken.filter(id => {
        const s = SUPPLEMENTS_CATALOG[id];
        return s && (s.timing === 'morning' || s.timing === 'empty');
      });
      if (morningSupps.length > 0) {
        const names = morningSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push(`🌅 Утро — время для: ${names}`);
      }
    }
    
    // Вечерние добавки
    if (hour >= 18 && hour < 23) {
      const eveningSupps = notTaken.filter(id => {
        const s = SUPPLEMENTS_CATALOG[id];
        return s && (s.timing === 'evening' || s.timing === 'beforeBed');
      });
      if (eveningSupps.length > 0) {
        const names = eveningSupps.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
        advices.push(`🌙 Вечер — время для: ${names}`);
      }
    }
    
    // Напоминание про жирорастворимые с едой
    const fatSoluble = notTaken.filter(id => SUPPLEMENTS_CATALOG[id]?.timing === 'withFat');
    if (fatSoluble.length > 0 && hour >= 12 && hour < 15) {
      const names = fatSoluble.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
      advices.push(`🥑 С обедом (нужны жиры): ${names}`);
    }
    
    // Метаболизм перед едой
    const beforeMeal = notTaken.filter(id => SUPPLEMENTS_CATALOG[id]?.timing === 'beforeMeal');
    if (beforeMeal.length > 0) {
      const names = beforeMeal.map(id => SUPPLEMENTS_CATALOG[id]?.name).join(', ');
      advices.push(`⏰ За 15-30 мин до еды: ${names}`);
    }
    
    return advices;
  }

  /**
   * Получить подсказку по времени приёма
   * @param {string} timing - код времени
   * @returns {string} человекочитаемая подсказка
   */
  function getTimingHint(timing) {
    const hints = {
      morning: '🌅 утром',
      withFood: '🍽️ с едой',
      withFat: '🥑 с жирной едой',
      evening: '🌆 вечером',
      beforeBed: '🌙 перед сном',
      empty: '💨 натощак',
      beforeMeal: '⏰ до еды',
      afterTrain: '💪 после трени',
      anytime: '🕐 в любое время',
    };
    return hints[timing] || '';
  }

  // === ГРУППИРОВКА ПО ВРЕМЕНИ ПРИЁМА ===
  const TIME_GROUPS = {
    morning: { label: '🌅 Утро', timings: ['morning', 'empty'], order: 1 },
    withMeal: { label: '🍽️ С едой', timings: ['withFood', 'withFat', 'beforeMeal'], order: 2 },
    evening: { label: '🌙 Вечер', timings: ['evening', 'beforeBed'], order: 3 },
    anytime: { label: '🕐 Любое время', timings: ['anytime', 'afterTrain'], order: 4 },
  };

  /**
   * Сгруппировать добавки по времени приёма
   * @param {string[]} suppIds - массив ID добавок
   * @returns {Object} { morning: [...], withMeal: [...], evening: [...], anytime: [...] }
   */
  function groupByTimeOfDay(suppIds) {
    const groups = { morning: [], withMeal: [], evening: [], anytime: [] };
    
    for (const id of suppIds) {
      const supp = SUPPLEMENTS_CATALOG[id];
      if (!supp) continue;
      
      let placed = false;
      for (const [groupId, group] of Object.entries(TIME_GROUPS)) {
        if (group.timings.includes(supp.timing)) {
          groups[groupId].push(id);
          placed = true;
          break;
        }
      }
      // Если timing не найден — в anytime
      if (!placed) groups.anytime.push(id);
    }
    
    return groups;
  }

  // === КОМПОНЕНТ КАРТОЧКИ В СТАТИСТИКЕ v3.0 ===
  
  /**
   * Рендер карточки витаминов для вкладки статистики
   * @param {Object} props - { dateKey, onForceUpdate }
   * @returns {React.Element|null}
   */
  function renderSupplementsCard(props) {
    const { dateKey, onForceUpdate } = props || {};
    if (!dateKey) return null;
    
    const U = HEYS.utils || {};
    const dayData = U.lsGet ? U.lsGet(`heys_dayv2_${dateKey}`, {}) : {};
    
    // v3.3: Используем planned из дня ИЛИ из профиля (если чек-ин не был)
    const planned = dayData.supplementsPlanned || getPlannedSupplements();
    const taken = dayData.supplementsTaken || [];
    
    // v3.4: Если ничего не запланировано — показываем карточку с сообщением
    if (planned.length === 0) {
      return React.createElement('div', { 
        className: 'compact-card supplements-card',
        style: {
          background: '#fff',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }
      },
        React.createElement('div', { 
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '8px'
          }
        },
          React.createElement('span', { 
            style: { fontWeight: '600', fontSize: '15px' }
          }, '💊 Витамины')
        ),
        React.createElement('div', {
          style: {
            textAlign: 'center',
            padding: '12px',
            color: '#94a3b8',
            fontSize: '13px'
          }
        },
          React.createElement('div', { style: { marginBottom: '8px' } }, 'Витамины не выбраны'),
          React.createElement('div', { style: { fontSize: '11px' } }, 
            'Выберите в утреннем чек-ине или ',
            React.createElement('button', {
              onClick: () => {
                // Открыть выбор витаминов
                if (HEYS.showCheckin?.supplements) {
                  HEYS.showCheckin.supplements(dateKey, () => {
                    // После выбора — обновить карточку
                    if (onForceUpdate) onForceUpdate();
                  });
                }
              },
              style: {
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                fontSize: '11px'
              }
            }, 'настройте сейчас')
          )
        )
      );
    }
    
    const allTaken = planned.length > 0 && planned.every(id => taken.includes(id));
    const takenCount = planned.filter(id => taken.includes(id)).length;
    
    // v3.0: Группируем по времени приёма
    const timeGroups = groupByTimeOfDay(planned);
    
    // v2.0: Проверяем взаимодействия
    const { synergies, conflicts } = checkInteractions(planned);
    
    // v2.0: Проверяем бонус к инсулиновой волне
    const insulinBonus = getInsulinWaveBonus(dateKey);
    
    // v3.3: Проверяем наличие научных данных
    const hasScience = HEYS.Supplements.SCIENCE?.BIOAVAILABILITY;
    
    const toggleTaken = (id) => {
      const isTaken = taken.includes(id);
      markSupplementTaken(dateKey, id, !isTaken);
      if (onForceUpdate) onForceUpdate();
    };
    
    const markAll = () => {
      markAllSupplementsTaken(dateKey);
      if (onForceUpdate) onForceUpdate();
    };
    
    // v3.3: Открыть научный popup
    const openSciencePopup = (suppId) => {
      if (!hasScience) return;
      // Создаём контейнер для popup если его нет
      let container = document.getElementById('supp-science-popup');
      if (!container) {
        container = document.createElement('div');
        container.id = 'supp-science-popup';
        document.body.appendChild(container);
      }
      // Рендерим popup
      const closePopup = () => {
        ReactDOM.unmountComponentAtNode(container);
      };
      ReactDOM.render(renderSciencePopup(suppId, closePopup), container);
    };

    // Рендер группы витаминов с анимацией
    const renderGroup = (groupId, suppIds) => {
      if (suppIds.length === 0) return null;
      const group = TIME_GROUPS[groupId];
      const groupTakenCount = suppIds.filter(id => taken.includes(id)).length;
      const allGroupTaken = groupTakenCount === suppIds.length;
      
      return React.createElement('div', { 
        key: groupId,
        style: { marginBottom: '12px' }
      },
        // Заголовок группы
        React.createElement('div', {
          style: {
            fontSize: '12px',
            fontWeight: '600',
            color: allGroupTaken ? '#16a34a' : '#64748b',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }
        }, 
          group.label,
          allGroupTaken && React.createElement('span', null, ' ✓')
        ),
        // Чипы витаминов
        React.createElement('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: '6px' }
        },
          suppIds.map(id => {
            const supp = SUPPLEMENTS_CATALOG[id];
            if (!supp) return null;
            const isTaken = taken.includes(id);
            const hasScienceData = hasScience && HEYS.Supplements.SCIENCE.BIOAVAILABILITY[id];
            
            // v3.3: Таймер для долгого нажатия
            let longPressTimer = null;
            let isLongPress = false;
            
            const handleTouchStart = (e) => {
              isLongPress = false;
              longPressTimer = setTimeout(() => {
                isLongPress = true;
                // Вибрация для тактильной обратной связи
                if (navigator.vibrate) navigator.vibrate(50);
                openSciencePopup(id);
              }, 500); // 500ms для долгого нажатия
            };
            
            const handleTouchEnd = (e) => {
              clearTimeout(longPressTimer);
              if (!isLongPress) {
                // Короткое нажатие — toggle
                const btn = e.currentTarget;
                btn.style.transform = 'scale(1.15)';
                setTimeout(() => { btn.style.transform = 'scale(1)'; }, 150);
                toggleTaken(id);
              }
            };
            
            const handleTouchMove = () => {
              clearTimeout(longPressTimer);
            };
            
            return React.createElement('button', {
              key: id,
              className: 'supp-chip',
              onTouchStart: hasScienceData ? handleTouchStart : null,
              onTouchEnd: hasScienceData ? handleTouchEnd : null,
              onTouchMove: hasScienceData ? handleTouchMove : null,
              onClick: !hasScienceData ? (e) => {
                const btn = e.currentTarget;
                btn.style.transform = 'scale(1.15)';
                setTimeout(() => { btn.style.transform = 'scale(1)'; }, 150);
                toggleTaken(id);
              } : null,
              title: supp.tip + (hasScienceData ? ' (долгое нажатие = 🔬 наука)' : ''),
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '5px 10px',
                borderRadius: '14px',
                border: 'none',
                background: isTaken ? '#dcfce7' : '#f1f5f9',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                color: isTaken ? '#16a34a' : '#64748b',
                transition: 'all 0.15s ease',
                transform: 'scale(1)',
                position: 'relative'
              }
            },
              React.createElement('span', null, isTaken ? '✅' : supp.icon),
              React.createElement('span', null, supp.name),
              // v3.3: Индикатор научных данных
              hasScienceData && React.createElement('span', {
                style: {
                  fontSize: '8px',
                  marginLeft: '2px',
                  opacity: 0.6
                }
              }, '🔬')
            );
          })
        )
      );
    };
    
    return React.createElement('div', { 
      className: 'compact-card supplements-card',
      style: {
        background: '#fff',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }
    },
      // Заголовок
      React.createElement('div', { 
        style: { 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px'
        }
      },
        React.createElement('span', { 
          style: { fontWeight: '600', fontSize: '15px' }
        }, '💊 Витамины'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          // v2.0: Бонус к инсулиновой волне
          insulinBonus < 0 && React.createElement('span', {
            style: {
              fontSize: '11px',
              background: '#dcfce7',
              color: '#16a34a',
              padding: '2px 6px',
              borderRadius: '8px',
              fontWeight: '600'
            },
            title: 'Бонус к инсулиновой волне от добавок'
          }, `🌊 ${Math.round(insulinBonus * 100)}%`),
          React.createElement('span', { 
            style: { 
              fontSize: '13px', 
              color: allTaken ? '#16a34a' : '#64748b',
              fontWeight: '600'
            }
          }, `${takenCount}/${planned.length} ✓`)
        )
      ),
      // v3.1: Напоминание по времени
      (() => {
        const reminder = getTimeReminder(planned, taken);
        if (!reminder) return null;
        return React.createElement('div', {
          style: {
            fontSize: '12px',
            color: reminder.urgency === 'high' ? '#dc2626' : '#d97706',
            background: reminder.urgency === 'high' ? '#fef2f2' : '#fffbeb',
            padding: '8px 10px',
            borderRadius: '8px',
            marginBottom: '10px',
            fontWeight: '500'
          }
        }, reminder.message);
      })(),
      // v3.0: Группы по времени
      ['morning', 'withMeal', 'evening', 'anytime'].map(gid => renderGroup(gid, timeGroups[gid])),
      // v2.0: Синергии
      synergies.length > 0 && React.createElement('div', {
        style: {
          fontSize: '12px',
          color: '#16a34a',
          background: '#f0fdf4',
          padding: '8px 10px',
          borderRadius: '8px',
          marginBottom: '8px'
        }
      }, synergies.map((s, i) => React.createElement('div', { key: i }, s))),
      // v2.0: Конфликты
      conflicts.length > 0 && React.createElement('div', {
        style: {
          fontSize: '12px',
          color: '#d97706',
          background: '#fffbeb',
          padding: '8px 10px',
          borderRadius: '8px',
          marginBottom: '8px'
        }
      }, conflicts.map((c, i) => React.createElement('div', { key: i }, c))),
      // Кнопка "Всё принял"
      !allTaken && React.createElement('button', {
        onClick: markAll,
        style: {
          width: '100%',
          padding: '10px',
          borderRadius: '12px',
          border: '2px solid #16a34a',
          background: 'rgba(22, 163, 74, 0.1)',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          color: '#16a34a',
          marginTop: '4px'
        }
      }, '✓ Всё принял')
    );
  }

  // === v3.3: НАУЧНЫЕ UI КОМПОНЕНТЫ ===

  /**
   * Рендер научной информации о добавке (popup)
   */
  function renderSciencePopup(suppId, onClose) {
    // Проверяем наличие научного модуля
    const science = HEYS.Supplements.SCIENCE;
    if (!science || !science.BIOAVAILABILITY) {
      return React.createElement('div', { 
        style: { padding: '16px', textAlign: 'center', color: '#64748b' }
      }, 'Научный модуль не загружен');
    }
    
    const supp = SUPPLEMENTS_CATALOG[suppId];
    const bio = science.BIOAVAILABILITY[suppId];
    
    if (!supp) return null;
    
    // Получаем расширенные данные
    const synergies = HEYS.Supplements.getSynergies?.(suppId) || [];
    const antagonisms = HEYS.Supplements.getAntagonisms?.(suppId) || [];
    const foodTips = HEYS.Supplements.getFoodTips?.(suppId) || [];
    const optimalTime = HEYS.Supplements.getOptimalTime?.(suppId);
    
    const sectionStyle = {
      marginBottom: '12px',
      padding: '10px',
      background: '#f8fafc',
      borderRadius: '10px'
    };
    
    const labelStyle = {
      fontSize: '11px',
      fontWeight: '600',
      color: '#64748b',
      marginBottom: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    };
    
    const valueStyle = {
      fontSize: '14px',
      color: '#1e293b'
    };
    
    return React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px'
      },
      onClick: (e) => { if (e.target === e.currentTarget) onClose(); }
    },
      React.createElement('div', {
        style: {
          background: '#fff',
          borderRadius: '20px',
          maxWidth: '400px',
          width: '100%',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: '20px'
        }
      },
        // Заголовок
        React.createElement('div', {
          style: { 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px'
          }
        },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            React.createElement('span', { style: { fontSize: '28px' } }, supp.icon),
            React.createElement('div', null,
              React.createElement('div', { style: { fontWeight: '700', fontSize: '18px' } }, supp.name),
              React.createElement('div', { style: { fontSize: '12px', color: '#64748b' } }, 
                SUPPLEMENT_CATEGORIES[supp.category]?.name || supp.category
              )
            )
          ),
          React.createElement('button', {
            onClick: onClose,
            style: {
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              color: '#94a3b8'
            }
          }, '×')
        ),
        
        // Подсказка
        supp.tip && React.createElement('div', {
          style: {
            background: '#f0fdf4',
            color: '#16a34a',
            padding: '10px 12px',
            borderRadius: '10px',
            fontSize: '13px',
            marginBottom: '16px'
          }
        }, '💡 ', supp.tip),
        
        // Биодоступность (если есть научные данные)
        bio && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🔬 Биодоступность'),
          React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' } },
            React.createElement('div', {
              style: {
                background: '#fef3c7',
                color: '#92400e',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '500'
              }
            }, `Базовая: ${Math.round(bio.baseAbsorption * 100)}%`),
            bio.withFat && React.createElement('div', {
              style: {
                background: '#dcfce7',
                color: '#166534',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: '500'
              }
            }, `С жирами: ${Math.round(bio.withFat * 100)}%`)
          ),
          bio.mechanism && React.createElement('div', {
            style: { fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: '1.5' }
          }, bio.mechanism),
          bio.optimalDose && React.createElement('div', {
            style: { fontSize: '13px', marginTop: '8px', fontWeight: '500' }
          }, '💊 Оптимальная доза: ', bio.optimalDose)
        ),
        
        // Формы (если есть)
        bio?.forms && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🧬 Формы'),
          Object.entries(bio.forms).map(([formId, form]) => 
            React.createElement('div', {
              key: formId,
              style: { 
                display: 'flex', 
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '13px'
              }
            },
              React.createElement('span', { style: { fontWeight: '500' } }, formId),
              React.createElement('span', { style: { color: '#64748b' } }, 
                `${Math.round(form.absorption * 100)}% — ${form.use || form.conversion || ''}`
              )
            )
          )
        ),
        
        // Оптимальное время
        optimalTime && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '⏰ Оптимальное время'),
          React.createElement('div', { style: valueStyle },
            optimalTime.period === 'any' 
              ? optimalTime.reason
              : `${TIMING[optimalTime.period]?.icon || ''} ${TIMING[optimalTime.period]?.name || optimalTime.period} — ${optimalTime.reason}`
          )
        ),
        
        // Синергии
        synergies.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '✨ Синергии'),
          synergies.map((s, i) => 
            React.createElement('div', {
              key: i,
              style: { 
                padding: '8px 0',
                borderBottom: i < synergies.length - 1 ? '1px solid #e2e8f0' : 'none'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#16a34a' } },
                `+ ${SUPPLEMENTS_CATALOG[s.partner]?.name || s.partner}`
              ),
              s.mechanism && React.createElement('div', { 
                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
              }, s.mechanism),
              s.ratio && React.createElement('div', { 
                style: { fontSize: '12px', color: '#0ea5e9', marginTop: '2px' }
              }, '📐 ', s.ratio)
            )
          )
        ),
        
        // Антагонизмы
        antagonisms.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '⚠️ Не сочетать'),
          antagonisms.map((a, i) => 
            React.createElement('div', {
              key: i,
              style: { 
                padding: '8px 0',
                borderBottom: i < antagonisms.length - 1 ? '1px solid #e2e8f0' : 'none'
              }
            },
              React.createElement('div', { style: { fontWeight: '600', fontSize: '14px', color: '#d97706' } },
                `✗ ${SUPPLEMENTS_CATALOG[a.conflict]?.name || a.conflict}`
              ),
              a.mechanism && React.createElement('div', { 
                style: { fontSize: '12px', color: '#64748b', marginTop: '2px' }
              }, a.mechanism),
              a.solution && React.createElement('div', { 
                style: { fontSize: '12px', color: '#0ea5e9', marginTop: '2px' }
              }, '💡 ', a.solution)
            )
          )
        ),
        
        // Советы по еде
        foodTips.length > 0 && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🍽️ С едой'),
          foodTips.map((tip, i) =>
            React.createElement('div', {
              key: i,
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 0',
                fontSize: '13px'
              }
            },
              React.createElement('span', {
                style: {
                  background: tip.type === 'enhancer' ? '#dcfce7' : '#fef3c7',
                  color: tip.type === 'enhancer' ? '#166534' : '#92400e',
                  padding: '2px 8px',
                  borderRadius: '8px',
                  fontSize: '11px'
                }
              }, tip.type === 'enhancer' ? '✓' : '✗'),
              React.createElement('span', null, tip.food),
              React.createElement('span', { style: { color: '#64748b' } }, tip.effect)
            )
          )
        ),
        
        // Тестирование
        bio?.testMarker && React.createElement('div', { style: sectionStyle },
          React.createElement('div', { style: labelStyle }, '🧪 Анализы'),
          React.createElement('div', { style: valueStyle }, bio.testMarker),
          bio.optimalLevel && React.createElement('div', { 
            style: { fontSize: '12px', color: '#16a34a', marginTop: '4px' }
          }, '✓ Оптимум: ', bio.optimalLevel)
        ),
        
        // Кнопка закрыть
        React.createElement('button', {
          onClick: onClose,
          style: {
            width: '100%',
            padding: '12px',
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            marginTop: '8px'
          }
        }, 'Закрыть')
      )
    );
  }

  /**
   * Рендер умных рекомендаций с научным обоснованием
   */
  function renderScientificRecommendations(profile, dayData, meals) {
    const recs = HEYS.Supplements.getScientificRecommendations?.(profile, dayData, meals);
    if (!recs || recs.length === 0) return null;
    
    const priorityColors = {
      critical: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
      high: { bg: '#fff7ed', border: '#fdba74', text: '#ea580c' },
      medium: { bg: '#fefce8', border: '#fde047', text: '#ca8a04' },
      timing: { bg: '#ecfdf5', border: '#6ee7b7', text: '#059669' },
      low: { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b' }
    };
    
    return React.createElement('div', {
      style: {
        background: '#fff',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
      }
    },
      React.createElement('div', { 
        style: { fontWeight: '600', fontSize: '15px', marginBottom: '12px' }
      }, '🔬 Научные рекомендации'),
      recs.slice(0, 5).map((rec, i) => {
        const colors = priorityColors[rec.priority] || priorityColors.low;
        const supp = SUPPLEMENTS_CATALOG[rec.id];
        
        return React.createElement('div', {
          key: i,
          style: {
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            padding: '10px 12px',
            marginBottom: '8px'
          }
        },
          React.createElement('div', { 
            style: { 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              marginBottom: '4px'
            }
          },
            React.createElement('span', { style: { fontSize: '18px' } }, supp?.icon || '💊'),
            React.createElement('span', { 
              style: { fontWeight: '600', color: colors.text }
            }, supp?.name || rec.id),
            rec.priority === 'critical' && React.createElement('span', {
              style: { 
                fontSize: '10px', 
                background: colors.text, 
                color: '#fff',
                padding: '2px 6px',
                borderRadius: '6px',
                fontWeight: '600'
              }
            }, 'ВАЖНО')
          ),
          React.createElement('div', { 
            style: { fontSize: '12px', color: '#64748b', lineHeight: '1.4' }
          }, rec.reason)
        );
      })
    );
  }

  // === ЭКСПОРТ v3.3 ===
  HEYS.Supplements = {
    // Каталоги
    CATALOG: SUPPLEMENTS_CATALOG,
    CATEGORIES: SUPPLEMENT_CATEGORIES,
    TIMING,
    INTERACTIONS,
    TIME_GROUPS,
    COURSES,
    // Утилиты
    getByCategory: getSupplementsByCategory,
    getPlanned: getPlannedSupplements,
    savePlanned: savePlannedSupplements,
    getTaken: getTakenSupplements,
    markTaken: markSupplementTaken,
    markAllTaken: markAllSupplementsTaken,
    getComplianceStats: getComplianceStats,
    // v2.0 функции
    checkInteractions,
    getInsulinWaveBonus,
    getSupplementAdvices,
    getTimingHint,
    // v3.0 функции
    groupByTimeOfDay,
    // v3.1 функции — курсы и кастомные добавки
    getCustomSupplements,
    addCustomSupplement,
    removeCustomSupplement,
    loadCustomSupplements,
    getTimeReminder,
    applyCourse,
    // v3.2 функции — интеграция с едой и рекомендации
    getSmartRecommendations,
    getMealBasedAdvice,
    // v3.3 функции — научный UI
    renderSciencePopup,
    renderScientificRecommendations,
    // Рендер
    renderCard: renderSupplementsCard,
  };

  // Загружаем кастомные добавки при инициализации
  loadCustomSupplements();

  console.log('[HEYS] Supplements module v3.4 loaded: science UI, 29+ supplements, courses');

})(typeof window !== 'undefined' ? window : global);
