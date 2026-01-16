/**
 * HEYS Advice Rules v1
 * Конфигурация и правила для модуля советов
 * 
 * @file heys_advice_rules_v1.js
 * @version 1.0.0
 */

(function() {
  'use strict';

  window.HEYS = window.HEYS || {};

  const MAX_ADVICES_PER_SESSION = 10;
  const ADVICE_COOLDOWN_MS = 45000; // 45 секунд между советами
  const SESSION_KEY = 'heys_advice_session';
  const TRACKING_KEY = 'heys_advice_stats';

  // ═══════════════════════════════════════════════════════════
  // 🎯 PRIORITY CONSTANTS — Стандартизованные приоритеты
  // ═══════════════════════════════════════════════════════════
  // Чем НИЖЕ число — тем ВЫШЕ приоритет показа!

  const PRIORITY = {
    // 1-9: Критические (срывы, здоровье)
    CRITICAL: 1,        // Срыв, критический недобор/перебор
    HEALTH_ALERT: 5,    // Здоровье под угрозой (транс-жиры, недосып+переедание)

    // 10-29: Важные (нутриенты, тренировки)
    IMPORTANT: 10,      // Важные напоминания
    NUTRITION: 15,      // Нутриент-советы (белок, клетчатка)
    TRAINING: 18,       // Советы по тренировкам
    TIMING: 20,         // Тайминг (инсулиновая волна, сон)

    // 30-49: Нормальные (мотивация, достижения)
    NORMAL: 30,         // Обычные советы
    ACHIEVEMENT: 35,    // Достижения (streak, perfect day)
    MOTIVATION: 40,     // Мотивационные советы

    // 50-79: Низкие (советы дня, сезонные)
    LOW: 50,            // Низкий приоритет
    SEASONAL: 60,       // Сезонные советы
    LIFESTYLE: 65,      // Стиль жизни

    // 80-100: Фоновые (tips, gamification)
    BACKGROUND: 80,     // Фоновые советы
    GAMIFICATION: 90    // Игровые элементы
  };

  // ═══════════════════════════════════════════════════════════
  // 🚀 ADVICE CACHE — Кэширование результатов generateAdvices
  // ═══════════════════════════════════════════════════════════

  const ADVICE_CACHE_TTL = 5 * 60 * 1000; // 5 минут

  const MAX_ADVICES_PER_CATEGORY = 2; // Анти-спам: max советов одной категории

  // ═══════════════════════════════════════════════════════════
  // THRESHOLDS — Конфигурируемые пороги (вместо магических чисел)
  // ═══════════════════════════════════════════════════════════

  const THRESHOLDS = {
    // Белок
    protein: {
      low: 0.5,        // < 50% — критически мало
      adequate: 0.8,   // < 80% — маловато
      good: 0.9,       // 90%+ — хорошо
      high: 1.2,       // 120%+ — много (achievement)
      champion: 1.2    // Белковый чемпион
    },
    // Клетчатка
    fiber: {
      low: 0.3,        // < 30% — мало
      adequate: 0.5,   // < 50% — маловато
      good: 1.0        // 100%+ — хорошо
    },
    // Жиры
    fat: {
      goodRatioLow: 0.4,  // < 40% хороших = плохо
      goodRatioGood: 0.6  // 60%+ хороших = хорошо
    },
    // Углеводы
    carbs: {
      simpleExcess: 1.3,  // > 130% простых
      simpleRatioMax: 0.5, // > 50% простых от всех
      simpleRatioGood: 0.3 // < 30% — отлично
    },
    // Калории
    kcal: {
      undereating: 0.6,   // < 60% к обеду — мало
      evening: 0.7        // < 70% к вечеру — недоел
    },
    // Транс-жиры и вред
    trans: { excess: 1.0 },
    harm: { excess: 1.0 },
    // Гликемический индекс
    gi: {
      high: 70,
      low: 55
    },
    // Вода
    water: {
      eveningLow: 0.5,
      hoursSinceMax: 2
    },
    // Сон
    sleep: {
      low: 6,
      deficit: 1.5,
      deficitHigh: 2
    },
    // Стресс
    stress: {
      high: 4,
      low: 2
    },
    // Приёмы пищи
    meal: {
      tooLarge: 800,     // ккал
      tooSmall: 150,     // ккал
      proteinMin: 20,    // г белка на приём
      eveningCarbsMax: 50, // г углеводов вечером
      fiberGood: 8       // г клетчатки — хорошо
    },
    // Тренировки
    training: {
      highIntensityMin: 20, // минут для hard_workout
      fatBurnMin: 30,       // минут жиросжигания
      greatWorkout: 45      // минут для great_workout
    },
    // Макросы баланс
    macros: {
      balanceMin: 0.9,
      balanceMax: 1.2
    }
  };

  // ═══════════════════════════════════════════════════════════
  // PRODUCT CATEGORIES CONFIG — Категории продуктов
  // ═══════════════════════════════════════════════════════════

  const PRODUCT_CATEGORIES = {
    vegetables: {
      keywords: ['огурец', 'помидор', 'томат', 'морковь', 'капуста', 'брокколи', 'шпинат', 'салат', 'перец', 'лук', 'чеснок', 'кабачок', 'баклажан', 'свёкла', 'редис', 'сельдерей', 'петрушка', 'укроп', 'руккола', 'цветная', 'тыква', 'горох', 'фасоль зелёная'],
      icon: '🥗',
      advice: 'Сегодня мало овощей — добавь салат или гарнир',
      goodAdvice: 'Отлично с овощами сегодня!'
    },
    fruits: {
      keywords: ['яблоко', 'банан', 'апельсин', 'мандарин', 'груша', 'виноград', 'персик', 'абрикос', 'слива', 'киви', 'манго', 'ананас', 'арбуз', 'дыня', 'клубника', 'малина', 'черника', 'ягод', 'ягоды', 'гранат', 'грейпфрут', 'лимон'],
      icon: '🍎',
      advice: 'Фрукты — природные витамины. Добавь один сегодня',
      goodAdvice: 'Фруктовый день!'
    },
    dairy: {
      keywords: ['молоко', 'кефир', 'йогурт', 'творог', 'сыр', 'сметана', 'ряженка', 'простокваша', 'масло сливочное', 'сливки', 'мацони', 'брынза', 'пармезан', 'моцарелла', 'рикотта'],
      icon: '🥛',
      advice: 'Молочка = кальций для костей. Творог или йогурт?',
      goodAdvice: 'Кальций в норме!'
    },
    fish: {
      keywords: ['рыба', 'лосось', 'сёмга', 'форель', 'скумбрия', 'треска', 'тунец', 'сельдь', 'карп', 'окунь', 'судак', 'минтай', 'дорадо', 'сибас', 'креветк', 'мидии', 'кальмар', 'морепродукт'],
      icon: '🐟',
      advice: 'Рыба 2-3 раза в неделю — Омега-3 для мозга',
      goodAdvice: 'Омега-3 получил!'
    },
    meat: {
      keywords: ['мясо', 'говядина', 'свинина', 'курица', 'куриц', 'индейка', 'баранина', 'кролик', 'утка', 'гусь', 'телятина', 'фарш', 'стейк', 'филе', 'грудка', 'бедро', 'котлет', 'шашлык'],
      icon: '🥩',
      advice: 'Мясо — главный источник белка и железа',
      goodAdvice: 'Белок получил!'
    },
    grains: {
      keywords: ['гречка', 'рис', 'овсянка', 'овёс', 'пшено', 'перловка', 'булгур', 'кускус', 'киноа', 'макарон', 'паста', 'спагетти', 'хлеб', 'батон', 'лаваш', 'каша'],
      icon: '🌾',
      advice: 'Сложные углеводы — энергия на весь день',
      goodAdvice: 'Энергия получена!'
    },
    nuts: {
      keywords: ['орех', 'миндаль', 'грецк', 'фундук', 'кешью', 'фисташк', 'арахис', 'кедров', 'макадамия', 'пекан', 'семечк', 'семена', 'тыквенн', 'подсолн', 'чиа', 'лён'],
      icon: '🥜',
      advice: 'Орехи — полезные жиры и белок. Горсть в день',
      goodAdvice: 'Полезные жиры ✓'
    },
    eggs: {
      keywords: ['яйцо', 'яйца', 'омлет', 'яичница', 'глазунья', 'скрамбл'],
      icon: '🥚',
      advice: 'Яйца — идеальный белок. 2-3 в день норма',
      goodAdvice: 'Идеальный белок!'
    }
  };

  // ═══════════════════════════════════════════════════════════
  // DEDUPLICATION_RULES — Группы похожих советов (показываем 1 из группы)
  // ═══════════════════════════════════════════════════════════

  const DEDUPLICATION_RULES = {
    // Группа "белок" — не показывать несколько советов про белок подряд
    protein: ['protein_low', 'protein_sources', 'post_training_protein', 'age_protein', 'bedtime_protein', 'protein_champion', 'protein_per_meal_low'],
    // Группа "вода"
    water: ['water_reminder', 'water_evening_low', 'water_goal_reached', 'water_benefits', 'super_hydration'],
    // Группа "углеводы"
    carbs: ['simple_carbs_warning', 'complex_carbs_tip', 'carbs_balance_perfect', 'simple_complex_ratio', 'evening_carbs_high'],
    // Группа "клетчатка"
    fiber: ['fiber_low', 'fiber_good', 'fiber_sources', 'fiber_per_meal_good'],
    // Группа "жиры"
    fat: ['fat_quality_low', 'fat_quality_great', 'good_fat_low', 'trans_fat_warning'],
    // Группа "калории"
    kcal: ['kcal_excess_critical', 'kcal_excess_mild', 'kcal_under_critical', 'evening_undereating', 'evening_perfect'],
    // Группа "сон"
    sleep: ['sleep_low', 'bad_sleep_advice', 'great_sleep', 'sleep_hunger_correlation', 'sleep_debt_accumulating'],
    // Группа "тренировки"
    training: ['post_training_protein', 'hard_workout_recovery', 'cardio_carbs_balance', 'great_workout', 'training_recovery_window'],
    // Группа "настроение"
    mood: ['stress_support', 'crash_support', 'mood_improving', 'sugar_mood_crash', 'wellbeing_low_food']
  };

  // ═══════════════════════════════════════════════════════════
  // TIME_RESTRICTIONS — Когда НЕ показывать определённые советы
  // ═══════════════════════════════════════════════════════════

  const TIME_RESTRICTIONS = {
    // Не показывать совет про завтрак после 12:00
    'morning_breakfast': { notAfterHour: 12 },
    // Совет про обед — только с 11 до 15
    'lunch_time': { onlyBetweenHours: [11, 15] },
    // Полдник — с 15 до 18
    'snack_window': { onlyBetweenHours: [15, 18] },
    // Вечерние советы — после 18
    'evening_undereating': { notBeforeHour: 18 },
    'evening_perfect': { notBeforeHour: 20 },
    'evening_carbs_high': { notBeforeHour: 19 },
    'late_dinner_warning': { notBeforeHour: 21 },
    'bedtime_protein': { onlyBetweenHours: [20, 23] },
    // Ночные советы
    'night_owl_warning': { onlyBetweenHours: [1, 5] },
    // Советы про сон утром
    'bad_sleep_advice': { notAfterHour: 12 },
    'sleep_hunger_warning': { notAfterHour: 14 }
  };

  // ═══════════════════════════════════════════════════════════
  // ADVICE CHAINS — Связанные советы
  // ═══════════════════════════════════════════════════════════

  const ADVICE_CHAINS = {
    // После совета A, через время можно показать совет B
    'protein_low': { next: 'protein_sources', delayMinutes: 30 },
    'fiber_low': { next: 'fiber_sources', delayMinutes: 30 },
    'water_reminder': { next: 'water_benefits', delayMinutes: 60 },
    'simple_carbs_warning': { next: 'complex_carbs_tip', delayMinutes: 20 },
    'fat_quality_low': { next: 'good_fat_sources', delayMinutes: 45 },
    'sleep_low': { next: 'sleep_tips', delayMinutes: 120 }
  };

  // ═══════════════════════════════════════════════════════════
  // STREAK MILESTONES — Гейммификация
  // ═══════════════════════════════════════════════════════════

  const STREAK_MILESTONES = [
    { days: 3, icon: '🔥', text: 'Ещё ${remain} дней до streak 3!' },
    { days: 7, icon: '⭐', text: 'Ещё ${remain} дней до недельного streak!' },
    { days: 14, icon: '💎', text: 'Ещё ${remain} дней до двухнедельного streak!' },
    { days: 30, icon: '🏆', text: 'Ещё ${remain} дней до месячного streak!' }
  ];

  // ═══════════════════════════════════════════════════════════
  // DISMISS TRACKING — Умное скрытие
  // ═══════════════════════════════════════════════════════════

  const QUICK_DISMISS_THRESHOLD_MS = 1500; // Если закрыли за 1.5 сек — быстро
  const DISMISS_PENALTY_FACTOR = 0.5;      // Снижаем приоритет на 50%

  // ═══════════════════════════════════════════════════════════
  // DYNAMIC TTL CONFIG
  // ═══════════════════════════════════════════════════════════

  const TTL_CONFIG = {
    minTTL: 4000,      // Минимум 4 сек
    maxTTL: 12000,     // Максимум 12 сек
    msPerChar: 50,     // 50мс на символ (~20 символов/сек = норм. скорость чтения)
    criticalBonus: 2000 // +2 сек для критичных
  };

  // ═══════════════════════════════════════════════════════════
  // ADVICE RATING — Feedback система
  // ═══════════════════════════════════════════════════════════

  const RATING_KEY = 'heys_advice_ratings';

  // ═══════════════════════════════════════════════════════════
  // TIME-BASED ADVICE VARIANTS — Разные тексты по времени суток
  // ═══════════════════════════════════════════════════════════

  const TIME_BASED_TEXTS = {
    protein_low: {
      morning: ['Утром белок особенно важен — омлет или творог?', 'Начни день с белка — энергии хватит до обеда'],
      afternoon: ['Обед без белка — к вечеру будет голод', 'Добавь белка в обед — курица, рыба, творог'],
      evening: ['Вечерний белок = восстановление мышц ночью', 'На ужин белок — творог, рыба, яйца']
    },
    water_reminder: {
      morning: ['Стакан воды с утра запускает метаболизм ☀️', 'Начни день с воды — организм скажет спасибо'],
      afternoon: ['Середина дня — время пополнить водный баланс 💧', 'Не забывай пить — до вечера ещё далеко'],
      evening: ['Вечером пей умеренно, но не забывай о воде', 'Стакан воды перед сном — но не позже чем за час']
    },
    fiber_low: {
      morning: ['Утренняя овсянка = клетчатка на весь день', 'Завтрак с клетчаткой — сытость до обеда'],
      afternoon: ['Добавь салат к обеду — клетчатка нужна', 'Обед без овощей? Добавь гарнир'],
      evening: ['Овощи на ужин — лёгкость и клетчатка', 'Вечер — время для лёгкого салата']
    },
    simple_carbs_warning: {
      morning: ['Сахар утром = качели энергии весь день', 'Замени сладкое на сложные углеводы'],
      afternoon: ['Сладкое после обеда? Скоро будет спад энергии', 'Лучше фрукты вместо десерта'],
      evening: ['Сахар вечером = плохой сон', 'Вечером сладкое особенно вредно']
    }
  };

  // ═══════════════════════════════════════════════════════════
  // COMBO ACHIEVEMENTS — Комбо достижения
  // ═══════════════════════════════════════════════════════════

  const COMBO_ACHIEVEMENTS = [
    {
      id: 'protein_fiber_combo',
      name: 'Белок + Клетчатка',
      conditions: { proteinPct: 0.9, fiberPct: 0.8 },
      daysRequired: 3,
      icon: '💪🥗',
      text: '3 дня подряд отличный белок И клетчатка! Комбо!'
    },
    {
      id: 'balanced_macros_combo',
      name: 'Баланс макросов',
      conditions: { proteinPct: 0.9, carbsPct: 0.9, fatPct: 0.9, allUnder: 1.15 },
      daysRequired: 3,
      icon: '⚖️',
      text: '3 дня идеального баланса БЖУ! Мастер!'
    },
    {
      id: 'hydration_master',
      name: 'Мастер гидратации',
      conditions: { waterPct: 1.0 },
      daysRequired: 5,
      icon: '💧',
      text: '5 дней с нормой воды! Гидратация на уровне!'
    },
    {
      id: 'clean_eating',
      name: 'Чистое питание',
      conditions: { harmPct: 0.5, transPct: 0.3 },
      daysRequired: 3,
      icon: '🌿',
      text: '3 дня минимум вредного! Чистое питание!'
    },
    {
      id: 'early_bird',
      name: 'Ранняя пташка',
      conditions: { breakfastBefore: 9 },
      daysRequired: 5,
      icon: '🌅',
      text: '5 дней с ранним завтраком! Режим!'
    }
  ];

  // ═══════════════════════════════════════════════════════════
  // SMART RECOMMENDATIONS — Умные рекомендации на основе истории
  // ═══════════════════════════════════════════════════════════

  const RECOMMENDATION_PATTERNS_KEY = 'heys_user_patterns';

  // ═══════════════════════════════════════════════════════════
  // MOOD-ADAPTIVE MESSAGES — Адаптация под настроение
  // ═══════════════════════════════════════════════════════════

  const MOOD_TONES = {
    low: {  // mood 1-2
      prefix: ['Ничего страшного, ', 'Всё нормально, ', 'Не переживай, '],
      suffix: [' 💙', ' Ты справишься!', ''],
      avoid: ['warning', 'critical'] // Не показывать жёсткие советы
    },
    neutral: { // mood 3
      prefix: ['', '', ''],
      suffix: ['', '', ''],
      avoid: []
    },
    high: { // mood 4-5
      prefix: ['Отлично! ', 'Супер! ', 'Так держать! '],
      suffix: [' 🎉', ' 💪', ''],
      avoid: []
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ADVICE CATEGORIES SETTINGS — Настройки категорий
  // ═══════════════════════════════════════════════════════════

  const ADVICE_SETTINGS_KEY = 'heys_advice_settings';

  const DEFAULT_ADVICE_SETTINGS = {
    // Категории советов (включены по умолчанию)
    categories: {
      nutrition: true,      // Питание (БЖУ, калории)
      hydration: true,      // Вода
      lifestyle: true,      // Образ жизни
      training: true,       // Тренировки
      sleep: true,          // Сон
      emotional: true,      // Эмоции и настроение
      achievement: true,    // Достижения
      timing: true,         // Тайминг приёмов
      correlation: true,    // Корреляции
      health: true          // 💊 Здоровье (витамины, напоминания) — НЕЛЬЗЯ отключить
    },
    // Общие настройки
    toastsEnabled: true,    // Автопоказ тостов (FAB всегда работает)
    soundEnabled: true,     // Звук при советах
    hapticEnabled: true,    // Вибрация
    showDetails: true,      // Показывать детали
    maxPerDay: 20,          // Макс советов в день
    quietHoursStart: 23,    // Тихие часы начало
    quietHoursEnd: 7        // Тихие часы конец
  };

  const CATEGORY_LABELS = {
    nutrition: { name: 'Питание', icon: '🥗', desc: 'БЖУ, калории, макросы' },
    hydration: { name: 'Вода', icon: '💧', desc: 'Гидратация и напоминания' },
    lifestyle: { name: 'Образ жизни', icon: '🌅', desc: 'Режим, привычки' },
    training: { name: 'Тренировки', icon: '💪', desc: 'Активность и спорт' },
    health: { name: 'Здоровье', icon: '💊', desc: 'Витамины, напоминания', isReminder: true },
    sleep: { name: 'Сон', icon: '😴', desc: 'Качество и количество сна' },
    emotional: { name: 'Эмоции', icon: '💙', desc: 'Настроение и стресс' },
    achievement: { name: 'Достижения', icon: '🏆', desc: 'Streak, рекорды' },
    timing: { name: 'Тайминг', icon: '⏰', desc: 'Время приёмов пищи' },
    correlation: { name: 'Корреляции', icon: '🔗', desc: 'Связи между показателями' }
  };

  // ═══════════════════════════════════════════════════════════
  // PERSONAL BEST TRACKING — Лучшие результаты
  // ═══════════════════════════════════════════════════════════

  const PERSONAL_BESTS_KEY = 'heys_personal_bests';

  const TRACKABLE_METRICS = {
    proteinPct: { name: 'Белок', icon: '🥩', unit: '%', higher: true },
    fiberPct: { name: 'Клетчатка', icon: '🥬', unit: '%', higher: true },
    waterPct: { name: 'Вода', icon: '💧', unit: '%', higher: true },
    goodFatRatio: { name: 'Полезные жиры', icon: '🥑', unit: '%', higher: true },
    streak: { name: 'Серия дней', icon: '🔥', unit: 'дн', higher: true },
    lowGIday: { name: 'Низкий ГИ', icon: '📊', unit: 'ГИ', higher: false },
    lowHarmDay: { name: 'Чистый день', icon: '🌿', unit: '%', higher: false }
  };

  // ═══════════════════════════════════════════════════════════
  // GOAL-SPECIFIC ADVICE — Советы по целям
  // ═══════════════════════════════════════════════════════════

  const GOAL_MODES = {
    deficit: {
      name: 'Похудение',
      icon: '📉',
      priorities: ['protein', 'fiber', 'water', 'satiety'],
      avoidCategories: [],
      bonusAdvices: [
        { id: 'deficit_protein_priority', text: 'При дефиците белок — приоритет №1', priority: 25 },
        { id: 'deficit_water_hunger', text: 'Часто жажду путают с голодом — выпей воды', priority: 27 }
      ]
    },
    bulk: {
      name: 'Набор массы',
      icon: '📈',
      priorities: ['protein', 'carbs', 'calories', 'training'],
      avoidCategories: [],
      bonusAdvices: [
        { id: 'bulk_protein_timing', text: 'Белок после тренировки — окно возможностей', priority: 25 },
        { id: 'bulk_carbs_energy', text: 'Сложные углеводы = топливо для роста', priority: 26 },
        { id: 'bulk_sleep_growth', text: 'Мышцы растут во сне — минимум 7-8 часов', priority: 27 }
      ]
    },
    maintenance: {
      name: 'Поддержание',
      icon: '⚖️',
      priorities: ['balance', 'variety', 'consistency'],
      avoidCategories: [],
      bonusAdvices: [
        { id: 'maintenance_balance', text: 'Баланс важнее идеала — держи среднюю', priority: 25 },
        { id: 'maintenance_variety', text: 'Разнообразие — ключ к устойчивости', priority: 26 }
      ]
    }
  };

  // ═══════════════════════════════════════════════════════════
  // ADVICE SCHEDULING — Отложенные советы
  // ═══════════════════════════════════════════════════════════

  const SCHEDULED_KEY = 'heys_scheduled_advices';
  const SNOOZE_OPTIONS = [
    { label: '30 мин', minutes: 30 },
    { label: '1 час', minutes: 60 },
    { label: '2 часа', minutes: 120 }
  ];

  // ═══════════════════════════════════════════════════════════
  // MICRO-ANIMATIONS CONFIG
  // ═══════════════════════════════════════════════════════════

  const ADVICE_ANIMATIONS = {
    achievement: 'bounce',
    warning: 'shake',
    tip: 'fadeSlide',
    success: 'pulse',
    streak: 'glow'
  };

  // ═══════════════════════════════════════════════════════════
  // SMART PRIORITIZATION — ML-like scoring
  // ═══════════════════════════════════════════════════════════

  const CTR_WEIGHT = 0.4;        // Вес CTR в scoring
  const RECENCY_WEIGHT = 0.3;   // Вес давности показа
  const RELEVANCE_WEIGHT = 0.3; // Вес релевантности контексту

  // ═══════════════════════════════════════════════════════════
  // SEASONAL CONFIG — Сезонные советы
  // ═══════════════════════════════════════════════════════════

  const SEASONAL_TIPS = [
    {
      id: 'winter_vitamin_d',
      months: [10, 11, 0, 1, 2], // ноябрь-март
      icon: '❄️',
      texts: [
        'Зимой важен витамин D — рыба, яйца, грибы',
        'Мало солнца? Добавь жирную рыбу и яйца',
        'Витамин D зимой — через еду: сёмга, скумбрия, желток'
      ],
      category: 'lifestyle',
      priority: 60
    },
    {
      id: 'spring_detox',
      months: [2, 3, 4], // март-май
      icon: '🌱',
      texts: [
        'Весна — время зелени! Добавь шпинат, рукколу',
        'Весенний детокс — больше овощей и воды',
        'Пора просыпаться — зелёные смузи в помощь'
      ],
      category: 'lifestyle',
      priority: 60
    },
    {
      id: 'summer_hydration',
      months: [5, 6, 7], // июнь-август
      icon: '☀️',
      texts: [
        'Жара — пей больше воды, +500мл к норме',
        'Летом важна гидратация — арбуз, огурцы, вода',
        'В жару теряешь воду — восполняй регулярно'
      ],
      category: 'hydration',
      priority: 55
    },
    {
      id: 'autumn_immunity',
      months: [8, 9, 10], // сентябрь-ноябрь
      icon: '🍂',
      texts: [
        'Осень — укрепляй иммунитет: имбирь, лимон, мёд',
        'Сезон простуд — витамин C из цитрусов и киви',
        'Поддержи иммунитет — чеснок, имбирь, куркума'
      ],
      category: 'lifestyle',
      priority: 60
    }
  ];

  // ═══════════════════════════════════════════════════════════
  // ADVICE CHAINS — Связанные советы (storage)
  // ═══════════════════════════════════════════════════════════

  const CHAIN_STORAGE_KEY = 'heys_advice_chains';

  // ═══════════════════════════════════════════════════════════
  // PHASE 0: MEAL & MILESTONE HELPERS
  // ═══════════════════════════════════════════════════════════

  const MEAL_ADVICE_THROTTLE_MS = 3000;

  window.HEYS.adviceRules = {
    MAX_ADVICES_PER_SESSION,
    ADVICE_COOLDOWN_MS,
    SESSION_KEY,
    TRACKING_KEY,
    PRIORITY,
    ADVICE_CACHE_TTL,
    MAX_ADVICES_PER_CATEGORY,
    THRESHOLDS,
    PRODUCT_CATEGORIES,
    DEDUPLICATION_RULES,
    TIME_RESTRICTIONS,
    ADVICE_CHAINS,
    STREAK_MILESTONES,
    QUICK_DISMISS_THRESHOLD_MS,
    DISMISS_PENALTY_FACTOR,
    TTL_CONFIG,
    RATING_KEY,
    TIME_BASED_TEXTS,
    COMBO_ACHIEVEMENTS,
    RECOMMENDATION_PATTERNS_KEY,
    MOOD_TONES,
    ADVICE_SETTINGS_KEY,
    DEFAULT_ADVICE_SETTINGS,
    CATEGORY_LABELS,
    PERSONAL_BESTS_KEY,
    TRACKABLE_METRICS,
    GOAL_MODES,
    SCHEDULED_KEY,
    SNOOZE_OPTIONS,
    ADVICE_ANIMATIONS,
    CTR_WEIGHT,
    RECENCY_WEIGHT,
    RELEVANCE_WEIGHT,
    SEASONAL_TIPS,
    CHAIN_STORAGE_KEY,
    MEAL_ADVICE_THROTTLE_MS
  };
})();
