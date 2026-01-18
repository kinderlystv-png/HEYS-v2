// heys_models_v1.js — Domain models, Product/Day/User typedefs, computations
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const M = HEYS.models = HEYS.models || {};

  /** @typedef {Object} Product
   * @property {string|number} id
   * @property {string} name
   * 
   * === REQUIRED MACROS (на 100г) ===
   * @property {number} simple100 - Простые углеводы г
   * @property {number} complex100 - Сложные углеводы г
   * @property {number} protein100 - Белок г
   * @property {number} badFat100 - Насыщенные жиры г
   * @property {number} goodFat100 - Полезные жиры (MUFA/PUFA) г
   * @property {number} trans100 - Транс-жиры г
   * @property {number} fiber100 - Клетчатка г
   * 
   * === COMPUTED (вычисляемые) ===
   * @property {number} [carbs100] - Всего углеводов (simple+complex)
   * @property {number} [fat100] - Всего жиров (bad+good+trans)
   * @property {number} [kcal100] - Калории (Atwater)
   * 
   * === BASIC OPTIONAL ===
   * @property {number} [gi] - Гликемический индекс 0-100
   * @property {number} [harm] - AI оценка вредности 0-10
   * @property {number} [harmScore] - Alias для harm (DB)
   * @property {number} [sodium100] - Натрий мг/100г
   * @property {number} [omega3_100] - Омега-3 г/100г
   * @property {number} [omega6_100] - Омега-6 г/100г
   * @property {number} [nova_group] - NOVA классификация 1-4
   * @property {string[]} [additives] - E-добавки массив
   * @property {number} [nutrient_density] - Нутриентная плотность 0-100
   * 
   * === QUALITY FLAGS ===
   * @property {boolean} [is_organic] - Органический продукт
   * @property {boolean} [is_whole_grain] - Цельнозерновой
   * @property {boolean} [is_fermented] - Ферментированный
   * @property {boolean} [is_raw] - Сырой/необработанный
   * 
   * === VITAMINS (% от DV на 100г) ===
   * @property {number} [vitamin_a] - Витамин A % DV
   * @property {number} [vitamin_c] - Витамин C % DV
   * @property {number} [vitamin_d] - Витамин D % DV
   * @property {number} [vitamin_e] - Витамин E % DV
   * @property {number} [vitamin_k] - Витамин K % DV
   * @property {number} [vitamin_b1] - Витамин B1 % DV
   * @property {number} [vitamin_b2] - Витамин B2 % DV
   * @property {number} [vitamin_b3] - Витамин B3 % DV
   * @property {number} [vitamin_b6] - Витамин B6 % DV
   * @property {number} [vitamin_b9] - Витамин B9/Folate % DV
   * @property {number} [vitamin_b12] - Витамин B12 % DV
   * 
   * === MINERALS (% от DV на 100г) ===
   * @property {number} [calcium] - Кальций % DV
   * @property {number} [iron] - Железо % DV
   * @property {number} [magnesium] - Магний % DV
   * @property {number} [phosphorus] - Фосфор % DV
   * @property {number} [potassium] - Калий % DV
   * @property {number} [zinc] - Цинк % DV
   * @property {number} [selenium] - Селен % DV
   * @property {number} [iodine] - Йод % DV
   * 
   * === METADATA ===
   * @property {{name: string, grams: number}[]} [portions] - Порции продукта
   * @property {string} [category] - Категория продукта
   * @property {string} [shared_origin_id] - ID в shared_products
   */

  // ====================================================================
  // 🔧 HARM FIELD NORMALIZATION
  // ====================================================================
  // Canonical field: `harm` (used in UI and meal items)
  // DB field: `harmScore` (used in PostgreSQL shared_products)
  // Deprecated: `harmscore` (lowercase), `harm100` (legacy)
  // 
  // Flow: DB(harmScore) → normalizeHarm() → harm (working field)
  // ====================================================================

  /**
   * Normalize harm value from any field variant
   * @param {Object} obj - Product, MealItem, or any object with harm fields
   * @returns {number|undefined} - Normalized harm value (0-10) or undefined
   */
  function normalizeHarm(obj) {
    if (!obj) return undefined;

    // Priority: harm > harmScore > harmscore > harm100
    const val = obj.harm ?? obj.harmScore ?? obj.harmscore ?? obj.harm100;

    // Deprecation warnings in dev mode
    if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
      if (obj.harmscore !== undefined && obj.harm === undefined && obj.harmScore === undefined) {
        console.warn('[HEYS] ⚠️ Deprecated field "harmscore" used. Migrate to "harm" or "harmScore":', obj.name || obj.id);
      }
      if (obj.harm100 !== undefined && obj.harm === undefined && obj.harmScore === undefined) {
        console.warn('[HEYS] ⚠️ Deprecated field "harm100" used. Migrate to "harm" or "harmScore":', obj.name || obj.id);
      }
    }

    return val !== undefined ? Number(val) : undefined;
  }

  /**
   * Normalize product/item to have both harm and harmScore fields
   * @param {Object} obj - Product or MealItem
   * @returns {Object} - Object with normalized harm fields
   */
  function normalizeHarmFields(obj) {
    if (!obj) return obj;

    const harmVal = normalizeHarm(obj);
    if (harmVal === undefined) return obj;

    return {
      ...obj,
      harm: harmVal,
      harmScore: harmVal
    };
  }

  // ====================================================================
  // 🔄 PRODUCT PRIORITY BY ORIGIN (Variant C+)
  // ====================================================================
  // Логика приоритета: local vs shared продукты при конфликте данных
  // 1. Если пользователь редактировал локальный продукт → local wins
  // 2. Если shared обновился после клонирования → shared wins
  // 3. По умолчанию → local wins
  // ====================================================================

  /**
   * Определить приоритетный источник данных для продукта
   * @param {Object} localProduct - Локальный продукт (из личной базы)
   * @param {Object} sharedProduct - Shared продукт (из общей базы, может быть null)
   * @returns {'local'|'shared'} - Какой источник использовать
   */
  function getProductPrioritySource(localProduct, sharedProduct) {
    if (!localProduct) return 'shared';
    if (!sharedProduct) return 'local';

    // 1. Если пользователь вручную редактировал — его данные всегда приоритетнее
    if (localProduct.user_modified === true) {
      return 'local';
    }

    // 2. Если это клон из shared — проверяем обновился ли shared
    if (localProduct.shared_origin_id) {
      const sharedUpdatedAt = sharedProduct.updated_at
        ? new Date(sharedProduct.updated_at).getTime()
        : 0;
      const clonedAt = localProduct.cloned_at
        || localProduct.createdAt
        || 0;

      // Shared обновился после клонирования → shared wins
      if (sharedUpdatedAt > clonedAt) {
        return 'shared';
      }
    }

    // 3. По умолчанию — локальный продукт
    return 'local';
  }

  /**
   * Получить данные продукта с учётом приоритета источника
   * @param {Object} localProduct - Локальный продукт
   * @param {Object} sharedProduct - Shared продукт (может быть null)
   * @returns {Object} - Продукт с оптимальными данными
   */
  function getProductWithPriority(localProduct, sharedProduct) {
    const source = getProductPrioritySource(localProduct, sharedProduct);

    if (source === 'local' || !sharedProduct) {
      return localProduct;
    }

    // Merge: берём данные из shared, но сохраняем локальные метаданные
    return {
      ...sharedProduct,
      // Сохраняем локальные идентификаторы и метаданные
      id: localProduct.id,
      shared_origin_id: localProduct.shared_origin_id,
      cloned_at: localProduct.cloned_at,
      createdAt: localProduct.createdAt,
      user_modified: false,
      // Маркер для отладки
      _priority_source: 'shared'
    };
  }

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

  function round1(v) { return Math.round(v * 10) / 10; }
  function uuid() { return Math.random().toString(36).slice(2, 10); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  // Ночной порог: до 03:00 считается "вчера" (день ещё не закончился)
  const NIGHT_HOUR_THRESHOLD = 3;
  function todayISO() {
    const d = new Date();
    const hour = d.getHours();
    // До 3:00 — это ещё "вчера" (день не закончился)
    if (hour < NIGHT_HOUR_THRESHOLD) {
      d.setDate(d.getDate() - 1);
    }
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function ensureDay(d, prof) {
    d = d || {};

    // Определяем, задан ли вес явно (не равен null/undefined и не пустая строка)
    const hasExplicitWeight = d.weightMorning != null && d.weightMorning !== '' && d.weightMorning !== 0;

    const base = {
      date: d.date || todayISO(),
      sleepStart: d.sleepStart || '',
      sleepEnd: d.sleepEnd || '',
      sleepNote: d.sleepNote || '',
      // Если явно передана пустая строка, оставляем пустую строку
      sleepQuality: (d.sleepQuality === '') ? '' : (d.sleepQuality != null ? d.sleepQuality : ''),
      // Вес: если явно задан, берём его; иначе пустое значение (не из профиля)
      weightMorning: hasExplicitWeight ? d.weightMorning : (d.weightMorning || ''),
      // Целевой дефицит: если есть явный вес, берём из профиля или сохранённое значение
      deficitPct: hasExplicitWeight ?
        (d.deficitPct != null ? d.deficitPct : (prof && prof.deficitPctTarget) || 0) :
        (d.deficitPct || ''),
      steps: +d.steps || 0,
      householdMin: +d.householdMin || 0,
      // Массив бытовых активностей (новый формат)
      householdActivities: Array.isArray(d.householdActivities) ? d.householdActivities : undefined,
      trainings: Array.isArray(d.trainings) ? d.trainings : [],
      // Если явно передана пустая строка, оставляем пустую строку
      dayScore: (d.dayScore === '') ? '' : (d.dayScore != null ? d.dayScore : ''),
      moodAvg: (d.moodAvg === '') ? '' : (d.moodAvg != null ? d.moodAvg : ''),
      wellbeingAvg: (d.wellbeingAvg === '') ? '' : (d.wellbeingAvg != null ? d.wellbeingAvg : ''),
      stressAvg: (d.stressAvg === '') ? '' : (d.stressAvg != null ? d.stressAvg : ''),
      dayComment: d.dayComment || '',
      waterMl: +d.waterMl || 0,
      lastWaterTime: d.lastWaterTime || undefined,
      meals: Array.isArray(d.meals) ? d.meals : [],
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
    if (!Array.isArray(base.trainings)) base.trainings = [];
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
        z: (t && Array.isArray(t.z)) ? [+t.z[0] || 0, +t.z[1] || 0, +t.z[2] || 0, +t.z[3] || 0] : [0, 0, 0, 0],
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

  function computeDerivedProduct(p) {
    const carbs = (+p.carbs100) || ((+p.simple100 || 0) + (+p.complex100 || 0));
    const fat = (+p.fat100) || ((+p.badFat100 || 0) + (+p.goodFat100 || 0) + (+p.trans100 || 0));
    // TEF-aware formula: protein 3 kcal/g (25% TEF), carbs 4 kcal/g, fat 9 kcal/g (Atwater)
    // ALWAYS recalculate - ignore pasted kcal100 for consistency
    const kcal = 3 * (+p.protein100 || 0) + 4 * carbs + 9 * fat;

    const derived = { carbs100: round1(carbs), fat100: round1(fat), kcal100: round1(kcal) };

    // Auto-calculate harm if not provided (v2.0.0)
    // HEYS.Harm.calculateHarmScore uses scientific formula based on trans/simple/badFat/sodium vs fiber/protein/goodFat
    if (p.harm == null && p.harmScore == null && HEYS.Harm?.calculateHarmScore) {
      derived.harm = HEYS.Harm.calculateHarmScore(p);
    }

    return derived;
  }

  function buildProductIndex(ps) {
    const byId = new Map(), byName = new Map();
    (ps || []).forEach(p => {
      if (!p) return;
      const id = (p.id != null ? p.id : p.product_id);
      if (id != null) byId.set(String(id).toLowerCase(), p);
      const nm = normalizeProductName(p.name || p.title || '');
      if (nm) byName.set(nm, p);
    });
    return { byId, byName };
  }

  function normalizeProductFields(p) {
    if (!p || typeof p !== 'object') return p;

    // Use centralized harm normalization
    const harmVal = normalizeHarm(p);
    if (harmVal != null) {
      p.harm = harmVal;      // Canonical field
    }

    // Case normalization for DB fields
    if (p.badFat100 == null && p.badfat100 != null) p.badFat100 = p.badfat100;
    if (p.goodFat100 == null && p.goodfat100 != null) p.goodFat100 = p.goodfat100;
    return p;
  }

  function getProductFromItem(it, idx, options = {}) {
    if (!it) return null;

    const { mode = 'hybrid', enrichMissing = true, sharedCache = null } = options || {};
    const allowIndex = !!idx && mode !== 'snapshot-only';
    const allowSnapshot = mode !== 'database-only';

    // Получаем shared products cache (если не передан в options)
    const getSharedCache = () => {
      if (sharedCache) return sharedCache;
      // Fallback: пытаемся получить из глобального кэша
      return HEYS.CloudShared?.getCachedSharedProducts?.() || [];
    };

    const maybeEnrich = (product) => {
      if (!product || !enrichMissing || !HEYS.Harm?.enrichProduct) return product;
      try {
        return HEYS.Harm.enrichProduct(product) || product;
      } catch {
        return product;
      }
    };

    // 🆕 Применить логику приоритета источника (local vs shared)
    const applyProductPriority = (localProduct) => {
      if (!localProduct || !localProduct.shared_origin_id) {
        return localProduct;
      }

      const cache = getSharedCache();
      if (!cache || cache.length === 0) {
        return localProduct;
      }

      // Находим shared-оригинал
      const sharedProduct = cache.find(s => s.id === localProduct.shared_origin_id);
      if (!sharedProduct) {
        return localProduct;
      }

      // Применяем логику приоритета
      return getProductWithPriority(localProduct, sharedProduct);
    };

    const applyItemFallback = (product) => {
      if (!product || !it) return product;

      const numericFields = [
        'kcal100', 'protein100', 'carbs100', 'fat100',
        'simple100', 'complex100', 'badFat100', 'goodFat100', 'trans100',
        'fiber100', 'sodium100',
        'omega3_100', 'omega6_100', 'nutrient_density',
        'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
        'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
        'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
      ];

      numericFields.forEach((field) => {
        if (product[field] == null && it[field] != null) {
          product[field] = it[field];
        }
      });

      const itemNova = it.nova_group ?? it.novaGroup;
      if (product.nova_group == null && itemNova != null) {
        product.nova_group = itemNova;
      }
      if (product.novaGroup == null && product.nova_group != null) {
        product.novaGroup = product.nova_group;
      }

      if (product.additives == null && Array.isArray(it.additives) && it.additives.length) {
        product.additives = it.additives;
      }

      const boolFields = ['is_organic', 'is_whole_grain', 'is_fermented', 'is_raw'];
      boolFields.forEach((field) => {
        if (product[field] == null && it[field] != null) {
          product[field] = it[field];
        }
      });

      // Use centralized harm normalization for item fallback
      if (product.harm == null) {
        const itemHarm = normalizeHarm(it);
        if (itemHarm != null) {
          product.harm = itemHarm;
          if (product.harmScore == null) product.harmScore = itemHarm;
        }
      }

      if (product.gi == null) {
        const itemGi = it.gi ?? it.gi100 ?? it.GI ?? it.giIndex;
        if (itemGi != null) product.gi = itemGi;
      }
      return product;
    };

    const getSnapshot = () => {
      // Если в item есть snapshot нутриентов — вернём сам item
      const hasMacroSnapshot = it.kcal100 !== undefined || it.protein100 !== undefined || it.simple100 !== undefined || it.complex100 !== undefined || it.carbs100 !== undefined;
      const hasGiOrHarm = it.gi !== undefined || it.gi100 !== undefined || it.GI !== undefined || it.giIndex !== undefined || normalizeHarm(it) != null;
      if (hasMacroSnapshot || hasGiOrHarm) {
        return maybeEnrich(normalizeProductFields(it));
      }
      return null;
    };

    if (!allowIndex) {
      return allowSnapshot ? getSnapshot() : null;
    }

    // Сначала ищем по названию (приоритет)
    const nm = normalizeProductName(it.name || it.title || '');
    if (nm && idx.byName) {
      const found = idx.byName.get(nm);
      if (found) {
        // 🆕 Применяем логику приоритета local vs shared
        const prioritized = applyProductPriority(found);
        return maybeEnrich(applyItemFallback(normalizeProductFields(prioritized)));
      }
    }
    // Fallback: ищем в индексе по product_id для обратной совместимости
    if (it.product_id != null && idx.byId) {
      const found = idx.byId.get(String(it.product_id).toLowerCase());
      if (found) {
        const prioritized = applyProductPriority(found);
        return maybeEnrich(applyItemFallback(normalizeProductFields(prioritized)));
      }
    }
    if (it.productId != null && idx.byId) {
      const found = idx.byId.get(String(it.productId).toLowerCase());
      if (found) {
        const prioritized = applyProductPriority(found);
        return maybeEnrich(applyItemFallback(normalizeProductFields(prioritized)));
      }
    }

    if (allowSnapshot) return getSnapshot();
    return null;
  }

  function per100(p) { const d = computeDerivedProduct(p); return { kcal100: d.kcal100, carbs100: d.carbs100, prot100: +p.protein100 || 0, fat100: d.fat100, simple100: +p.simple100 || 0, complex100: +p.complex100 || 0, bad100: +p.badFat100 || 0, good100: +p.goodFat100 || 0, trans100: +p.trans100 || 0, fiber100: +p.fiber100 || 0, sodium100: +p.sodium100 || 0 }; }

  function scale(v, g) { return Math.round(((+v || 0) * (+g || 0) / 100) * 10) / 10; }

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
    return meal.items.map(it => `${it.product_id || it.productId || it.name || ''}:${it.grams || 0}`).join('|');
  }
  function idxSignature(idx) {
    if (!idx || !idx.byId) return '';
    return Array.from(idx.byId.keys()).join(',');
  }
  function mealTotals(meal, idx) {
    const key = (meal.id || '') + '::' + mealSignature(meal) + '::' + idxSignature(idx);
    if (_mealTotalsCache.has(key)) return _mealTotalsCache.get(key);
    const T = { kcal: 0, carbs: 0, simple: 0, complex: 0, prot: 0, fat: 0, bad: 0, good: 0, trans: 0, fiber: 0, sodium: 0 };
    (meal.items || []).forEach(it => { const p = getProductFromItem(it, idx) || {}; const per = per100(p); const G = +it.grams || 0; T.kcal += scale(per.kcal100, G); T.carbs += scale(per.carbs100, G); T.simple += scale(per.simple100, G); T.complex += scale(per.complex100, G); T.prot += scale(per.prot100, G); T.fat += scale(per.fat100, G); T.bad += scale(per.bad100, G); T.good += scale(per.good100, G); T.trans += scale(per.trans100, G); T.fiber += scale(per.fiber100, G); T.sodium += scale(per.sodium100, G); });
    Object.keys(T).forEach(k => T[k] = round1(T[k]));
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
          z: (current.z || [0, 0, 0, 0]).map((v, i) => (+v || 0) + (+(next.z?.[i]) || 0)), // Суммируем зоны
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

  // Harm field normalization (v4.3.0)
  M.normalizeHarm = normalizeHarm;
  M.normalizeHarmFields = normalizeHarmFields;

  // 🆕 Product Priority by Origin (v4.5.0)
  M.getProductPrioritySource = getProductPrioritySource;
  M.getProductWithPriority = getProductWithPriority;

  // ====================================================================
  // 🧪 EXTENDED NUTRIENTS PARSER (v4.4.0)
  // ====================================================================
  // Парсер для AI-генерированных строк с расширенными нутриентами
  // Формат: "NOVA:4|Na:1200|O3:0.5|O6:2|Org:1|WG:0|Fer:0|Raw:0|vA:15|..."
  // ====================================================================

  /**
   * Список расширенных полей с их ключами для парсинга
   */
  const EXTENDED_NUTRIENT_KEYS = {
    // Basic
    'NOVA': 'nova_group',      // 1-4
    'Na': 'sodium100',         // mg/100g
    'O3': 'omega3_100',        // g/100g
    'O6': 'omega6_100',        // g/100g
    'ND': 'nutrient_density',  // 0-100

    // Quality flags (0/1)
    'Org': 'is_organic',
    'WG': 'is_whole_grain',
    'Fer': 'is_fermented',
    'Raw': 'is_raw',

    // Vitamins (% DV)
    'vA': 'vitamin_a',
    'vC': 'vitamin_c',
    'vD': 'vitamin_d',
    'vE': 'vitamin_e',
    'vK': 'vitamin_k',
    'vB1': 'vitamin_b1',
    'vB2': 'vitamin_b2',
    'vB3': 'vitamin_b3',
    'vB6': 'vitamin_b6',
    'vB9': 'vitamin_b9',
    'vB12': 'vitamin_b12',

    // Minerals (% DV)
    'Ca': 'calcium',
    'Fe': 'iron',
    'Mg': 'magnesium',
    'P': 'phosphorus',
    'K': 'potassium',
    'Zn': 'zinc',
    'Se': 'selenium',
    'I': 'iodine'
  };

  // ====================================================================
  // 🧠 AI PRODUCT STRING PARSER (Russian keys, full format)
  // ====================================================================

  function normalizeAIKey(rawKey) {
    return String(rawKey || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^a-z0-9а-я]/gi, '');
  }

  const AI_PRODUCT_FIELD_MAP = (() => {
    const map = new Map();
    const add = (field, keys) => {
      keys.forEach((k) => map.set(normalizeAIKey(k), field));
    };

    add('name', ['название', 'продукт', 'product', 'name']);

    add('kcal100', ['ккал', 'калории', 'энергия']);
    add('carbs100', ['углеводы', 'углеводывсего', 'углеводыобщие', 'carbs']);
    add('simple100', ['простые', 'простыеуглеводы', 'сахара', 'simple']);
    add('complex100', ['сложные', 'сложныеуглеводы', 'complex']);
    add('protein100', ['белок', 'протеин', 'protein']);
    add('fat100', ['жиры', 'жирывсего', 'fat']);
    add('badFat100', ['вредныежиры', 'насыщенные', 'badfat']);
    add('goodFat100', ['полезныежиры', 'ненасыщенные', 'goodfat']);
    add('trans100', ['трансжиры', 'транс-жиры', 'trans']);
    add('fiber100', ['клетчатка', 'fiber']);
    add('gi', ['ги', 'гликемическийиндекс', 'гликемический индекс', 'gi']);
    add('harm', ['вред', 'вредность', 'harm']);

    add('sodium100', ['натрий', 'na', 'соль']);
    add('omega3_100', ['омега3', 'омега-3', 'omega3', 'о3']);
    add('omega6_100', ['омега6', 'омега-6', 'omega6', 'о6']);
    add('nova_group', ['nova', 'нова']);
    add('additives', ['добавки', 'e-добавки', 'edобавки', 'additives']);
    add('nutrient_density', ['нутриентнаяплотность', 'плотностьпитательныхвеществ', 'nutrientdensity', 'nd']);

    add('is_organic', ['органик', 'органический', 'organic']);
    add('is_whole_grain', ['цельнозерновой', 'цельнозерн', 'wholegrain', 'цельныезерна']);
    add('is_fermented', ['ферментированный', 'ферментирован', 'fermented']);
    add('is_raw', ['сырой', 'raw']);

    add('vitamin_a', ['витамина', 'витаминa', 'vitamina']);
    add('vitamin_c', ['витаминc', 'vitaminc']);
    add('vitamin_d', ['витаминd', 'vitamind']);
    add('vitamin_e', ['витамине', 'vitamine']);
    add('vitamin_k', ['витаминk', 'vitamink']);
    add('vitamin_b1', ['витаминb1', 'vitaminb1']);
    add('vitamin_b2', ['витаминb2', 'vitaminb2']);
    add('vitamin_b3', ['витаминb3', 'vitaminb3']);
    add('vitamin_b6', ['витаминb6', 'vitaminb6']);
    add('vitamin_b9', ['витаминb9', 'vitaminb9', 'фолат', 'фолиевая']);
    add('vitamin_b12', ['витаминb12', 'vitaminb12']);

    add('calcium', ['кальций', 'calcium']);
    add('iron', ['железо', 'iron']);
    add('magnesium', ['магний', 'magnesium']);
    add('phosphorus', ['фосфор', 'phosphorus']);
    add('potassium', ['калий', 'potassium']);
    add('zinc', ['цинк', 'zinc']);
    add('selenium', ['селен', 'selenium']);
    add('iodine', ['йод', 'iodine']);

    return map;
  })();

  const AI_REQUIRED_FIELDS = [
    'kcal100',
    'carbs100',
    'simple100',
    'complex100',
    'protein100',
    'fat100',
    'badFat100',
    'goodFat100',
    'trans100',
    'fiber100',
    'gi',
    'harm'
  ];

  function parseAIValueNumber(rawValue) {
    if (rawValue == null) return undefined;
    const cleaned = String(rawValue)
      .replace(/,/g, '.')
      .replace(/[^0-9+\-.]/g, ' ');
    const match = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
    if (!match) return undefined;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : undefined;
  }

  function parseAIValueBool(rawValue) {
    if (rawValue == null) return undefined;
    const v = String(rawValue).toLowerCase().trim();
    if (['1', 'true', 'да', 'yes', 'y', 'есть', '✓'].includes(v)) return true;
    if (['0', 'false', 'нет', 'no', 'n', 'none', '—', '-'].includes(v)) return false;
    return undefined;
  }

  function parseAIValueList(rawValue) {
    if (rawValue == null) return undefined;
    const v = String(rawValue).trim();
    if (!v || ['нет', 'no', '0', '-', '—'].includes(v.toLowerCase())) return [];
    const cleaned = v.replace(/[\[\]{}()]/g, '');
    return cleaned
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.toUpperCase());
  }

  /**
   * Парсит AI-строку продукта с русскими ключами.
   * Формат: "Ключ: значение" по строкам (или через |/;), имя обязательно.
   * @param {string} text
   * @param {{ defaultName?: string }} [options]
   * @returns {{ product: Object, missingFields: string[] } | null}
   */
  function parseAIProductString(text, options = {}) {
    if (!text || typeof text !== 'string') return null;

    const raw = text.replace(/\r/g, '\n');
    const chunks = raw
      .split(/\n|\||;/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    if (!chunks.length) return null;

    const result = {};
    let fallbackName = '';

    chunks.forEach((line) => {
      // Regex: ключ может содержать буквы, цифры, пробелы и дефис, но заканчивается перед ": " или "= "
      // Используем ленивый квантификатор и lookbehind для корректного разбора "Транс-жиры: 0.0"
      const match = line.match(/^(.+?)[\s]*[:=][\s]+(.+)$/);
      if (!match) {
        if (!result.name && !/\d/.test(line)) {
          fallbackName = line.trim();
        }
        return;
      }

      const rawKey = match[1].trim();
      const rawValue = match[2].trim();
      const normalizedKey = normalizeAIKey(rawKey);
      const field = AI_PRODUCT_FIELD_MAP.get(normalizedKey);
      if (!field) return;

      if (field === 'name') {
        result.name = rawValue.trim();
        return;
      }

      if (field === 'additives') {
        const list = parseAIValueList(rawValue);
        if (list !== undefined) result.additives = list;
        return;
      }

      if (['is_organic', 'is_whole_grain', 'is_fermented', 'is_raw'].includes(field)) {
        const boolVal = parseAIValueBool(rawValue);
        if (boolVal !== undefined) result[field] = boolVal;
        return;
      }

      const numVal = parseAIValueNumber(rawValue);
      if (numVal === undefined) return;

      if (field === 'nova_group') {
        const nova = Math.round(numVal);
        if (nova >= 1 && nova <= 4) result[field] = nova;
        return;
      }

      result[field] = numVal;
    });

    if (!result.name) {
      result.name = fallbackName || options.defaultName || 'Без названия';
    }

    const missingFields = AI_REQUIRED_FIELDS.filter((field) => {
      const value = result[field];
      return value === undefined || value === null || Number.isNaN(value);
    });

    if (missingFields.length) {
      return { product: result, missingFields };
    }

    const derivedCarbs = (Number.isFinite(result.carbs100) && result.carbs100 > 0)
      ? result.carbs100
      : ((result.simple100 || 0) + (result.complex100 || 0));
    const derivedFat = (Number.isFinite(result.fat100) && result.fat100 > 0)
      ? result.fat100
      : ((result.badFat100 || 0) + (result.goodFat100 || 0) + (result.trans100 || 0));

    result.carbs100 = round1(derivedCarbs);
    result.fat100 = round1(derivedFat);
    result.kcal100 = round1(3 * (result.protein100 || 0) + 4 * derivedCarbs + 9 * derivedFat);
    result.createdAt = result.createdAt || Date.now();

    return { product: result, missingFields: [] };
  }

  /**
   * Парсит AI-строку расширенных нутриентов
   * @param {string} extString - Строка формата "NOVA:4|Na:1200|O3:0.5|..."
   * @returns {Object} - Объект с расширенными полями
   * @example
   * parseExtendedNutrients("NOVA:4|Na:1200|vC:15|Fe:30")
   * // → { nova_group: 4, sodium100: 1200, vitamin_c: 15, iron: 30 }
   */
  function parseExtendedNutrients(extString) {
    if (!extString || typeof extString !== 'string') return {};

    const result = {};
    const pairs = extString.split('|');

    for (const pair of pairs) {
      const [key, value] = pair.split(':');
      if (!key || value === undefined) continue;

      const fieldName = EXTENDED_NUTRIENT_KEYS[key.trim()];
      if (!fieldName) continue;

      const trimmedValue = value.trim();

      // Boolean fields (0/1)
      if (['is_organic', 'is_whole_grain', 'is_fermented', 'is_raw'].includes(fieldName)) {
        result[fieldName] = trimmedValue === '1' || trimmedValue.toLowerCase() === 'true';
      }
      // Integer fields
      else if (fieldName === 'nova_group') {
        const n = parseInt(trimmedValue, 10);
        if (n >= 1 && n <= 4) result[fieldName] = n;
      }
      // Numeric fields
      else {
        const n = parseFloat(trimmedValue);
        if (Number.isFinite(n) && n >= 0) result[fieldName] = n;
      }
    }

    return result;
  }

  /**
   * Сериализует расширенные нутриенты в строку для AI
   * @param {Object} product - Продукт с расширенными полями
   * @returns {string} - Строка формата "NOVA:4|Na:1200|..."
   */
  function serializeExtendedNutrients(product) {
    if (!product) return '';

    const parts = [];

    for (const [shortKey, fieldName] of Object.entries(EXTENDED_NUTRIENT_KEYS)) {
      const value = product[fieldName];
      if (value === undefined || value === null) continue;

      // Boolean fields → 0/1
      if (typeof value === 'boolean') {
        parts.push(`${shortKey}:${value ? '1' : '0'}`);
      }
      // Numeric fields → number
      else if (typeof value === 'number' && Number.isFinite(value)) {
        // Round to 1 decimal for readability
        parts.push(`${shortKey}:${round1(value)}`);
      }
    }

    return parts.join('|');
  }

  /**
   * Генерирует AI промпт для получения расширенных нутриентов
   * @param {string} productName - Название продукта
   * @returns {string} - Промпт для AI
   */
  function generateExtendedNutrientPrompt(productName) {
    return `Для продукта "${productName}" дай расширенную информацию в формате:
NOVA:X|Na:X|O3:X|O6:X|Org:0/1|WG:0/1|Fer:0/1|Raw:0/1|vA:X|vC:X|vD:X|vE:X|vK:X|vB1:X|vB2:X|vB3:X|vB6:X|vB9:X|vB12:X|Ca:X|Fe:X|Mg:X|P:X|K:X|Zn:X|Se:X|I:X

Расшифровка: NOVA (1-4), Na=натрий мг/100г, O3/O6=омега г/100г, витамины и минералы в % от суточной нормы на 100г.
Пропусти неизвестные значения. Только строка, без объяснений.`;
  }

  /**
   * Генерирует AI промпт для полного продукта (русские ключи)
   * @param {string} productName - Название продукта
   * @returns {string}
   */
  function generateAIProductStringPrompt(productName) {
    return `Сделай одну текстовую строку в формате "Ключ: значение" (каждое поле с новой строки). Никакого JSON/кода. Все значения на 100г.

ОБЯЗАТЕЛЬНО:
Название: ${productName}
Ккал: X
Углеводы: X
Простые: X
Сложные: X
Белок: X
Жиры: X
Вредные жиры: X
Полезные жиры: X
Транс-жиры: X
Клетчатка: X
ГИ: X
Вред: X

ОПЦИОНАЛЬНО (если знаешь — добавь):
Натрий: X
Омега-3: X
Омега-6: X
NOVA: 1-4
Добавки: E621, E330 (если нет — "нет")
Нутриентная плотность: X
Органик: 0/1
Цельнозерновой: 0/1
Ферментированный: 0/1
Сырой: 0/1
Витамин A: X
Витамин C: X
Витамин D: X
Витамин E: X
Витамин K: X
Витамин B1: X
Витамин B2: X
Витамин B3: X
Витамин B6: X
Витамин B9: X
Витамин B12: X
Кальций: X
Железо: X
Магний: X
Фосфор: X
Калий: X
Цинк: X
Селен: X
Йод: X`;
  }

  /**
   * Нормализует все поля продукта из DB формата в JS формат
   * @param {Object} dbProduct - Продукт из PostgreSQL (snake_case поля)
   * @returns {Object} - Нормализованный продукт
   */
  function normalizeExtendedProduct(dbProduct) {
    if (!dbProduct) return dbProduct;

    const result = { ...dbProduct };

    // harm normalization (существующая логика)
    const harmVal = normalizeHarm(result);
    if (harmVal !== undefined) {
      result.harm = harmVal;
      result.harmScore = harmVal;
    }

    // gi normalization
    if (result.gi != null) {
      result.gi = Number(result.gi);
    }

    // Extended fields - ensure numbers are numbers
    const numericFields = [
      'sodium100', 'omega3_100', 'omega6_100', 'nutrient_density',
      'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k',
      'vitamin_b1', 'vitamin_b2', 'vitamin_b3', 'vitamin_b6', 'vitamin_b9', 'vitamin_b12',
      'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium', 'iodine'
    ];

    for (const field of numericFields) {
      if (result[field] != null) {
        result[field] = Number(result[field]);
      }
    }

    // NOVA group — normalize snake_case → camelCase
    if (result.nova_group != null) {
      result.nova_group = parseInt(result.nova_group, 10);
      result.novaGroup = result.nova_group; // camelCase alias for heys_harm_v1.js
    }

    // Boolean flags
    const boolFields = ['is_organic', 'is_whole_grain', 'is_fermented', 'is_raw'];
    for (const field of boolFields) {
      if (result[field] != null) {
        result[field] = Boolean(result[field]);
      }
    }

    return result;
  }

  // Export extended nutrients functions
  M.EXTENDED_NUTRIENT_KEYS = EXTENDED_NUTRIENT_KEYS;
  M.parseExtendedNutrients = parseExtendedNutrients;
  M.serializeExtendedNutrients = serializeExtendedNutrients;
  M.generateExtendedNutrientPrompt = generateExtendedNutrientPrompt;
  M.generateAIProductStringPrompt = generateAIProductStringPrompt;
  M.parseAIProductString = parseAIProductString;
  M.normalizeExtendedProduct = normalizeExtendedProduct;

  // Verbose init log removed
})(window);
