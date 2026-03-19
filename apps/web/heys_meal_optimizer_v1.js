// heys_meal_optimizer_v1.js — Умные рекомендации при добавлении продуктов
// v1.0.0 | 2025-12-10
// Контекстные рекомендации с 50+ научными правилами

(function (global) {
  'use strict';
  const HEYS = global.HEYS = global.HEYS || {};
  const U = HEYS.utils || {};

  // ═══════════════════════════════════════════════════════════════════════════
  // NUTRIENT_KEYWORDS — Детекция микронутриентов по названию продукта
  // ═══════════════════════════════════════════════════════════════════════════

  const NUTRIENT_KEYWORDS = {
    iron: {
      keywords: ['печень', 'печёнка', 'говядина', 'телятина', 'гречка', 'чечевица', 'шпинат', 'фасоль', 'горох', 'тофу', 'кунжут', 'какао', 'кровянка'],
      icon: '🩸',
      name: 'Железо'
    },
    vitaminC: {
      keywords: ['лимон', 'апельсин', 'грейпфрут', 'киви', 'перец болгарский', 'перец сладкий', 'шиповник', 'смородина', 'клубника', 'брокколи', 'капуста', 'петрушка', 'укроп'],
      icon: '🍋',
      name: 'Витамин C'
    },
    omega3: {
      keywords: ['лосось', 'сёмга', 'скумбрия', 'сельдь', 'форель', 'сардина', 'анчоус', 'тунец', 'льняное', 'чиа', 'грецк', 'рыбий жир'],
      icon: '🐟',
      name: 'Омега-3'
    },
    calcium: {
      keywords: ['молоко', 'творог', 'сыр', 'йогурт', 'кефир', 'брынза', 'пармезан', 'сметана', 'сливки', 'кунжут', 'миндаль', 'сардина'],
      icon: '🦴',
      name: 'Кальций'
    },
    vitaminD: {
      keywords: ['лосось', 'сёмга', 'скумбрия', 'сельдь', 'яйцо', 'яичный желток', 'печень трески', 'рыбий жир', 'грибы'],
      icon: '☀️',
      name: 'Витамин D'
    },
    magnesium: {
      keywords: ['миндаль', 'кешью', 'арахис', 'шпинат', 'авокадо', 'банан', 'гречка', 'овсянка', 'тёмный шоколад', 'какао', 'тыквенн', 'семечк'],
      icon: '💪',
      name: 'Магний'
    },
    zinc: {
      keywords: ['говядина', 'баранина', 'свинина', 'устриц', 'краб', 'курица', 'индейка', 'тыквенн', 'кунжут', 'чечевица', 'нут'],
      icon: '🛡️',
      name: 'Цинк'
    },
    potassium: {
      keywords: ['банан', 'картофель', 'батат', 'авокадо', 'шпинат', 'фасоль', 'чечевица', 'курага', 'изюм', 'апельсин'],
      icon: '⚡',
      name: 'Калий'
    },
    fiber: {
      keywords: ['отруби', 'чечевица', 'фасоль', 'горох', 'нут', 'овсянка', 'брокколи', 'малина', 'груша', 'яблоко', 'авокадо', 'артишок'],
      icon: '🌾',
      name: 'Клетчатка'
    },
    vitaminB12: {
      keywords: ['печень', 'говядина', 'баранина', 'лосось', 'форель', 'тунец', 'сардина', 'яйцо', 'молоко', 'сыр'],
      icon: '🔴',
      name: 'Витамин B12'
    },
    vitaminA: {
      keywords: ['печень', 'морковь', 'батат', 'тыква', 'шпинат', 'капуста', 'манго', 'абрикос', 'дыня', 'яйцо'],
      icon: '🥕',
      name: 'Витамин A'
    },
    folate: {
      keywords: ['шпинат', 'спаржа', 'брокколи', 'авокадо', 'чечевица', 'фасоль', 'нут', 'свёкла', 'апельсин', 'печень'],
      icon: '🌿',
      name: 'Фолат'
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDED_PORTIONS — Оптимальные порции для контекста
  // ═══════════════════════════════════════════════════════════════════════════

  const RECOMMENDED_PORTIONS = {
    // Белковые — полноценная порция
    protein: { grams: 150, label: '150г — порция' },
    // Молочные — стандартная порция
    dairy: { grams: 200, label: '200г — стакан' },
    // Овощи — щедрая порция
    vegetables: { grams: 150, label: '150г — гарнир' },
    // Фрукты — 1 средний
    fruits: { grams: 150, label: '150г — 1 шт' },
    // Зерновые — порция гарнира
    grains: { grams: 100, label: '100г — порция' },
    // Орехи — горсть
    nuts: { grams: 30, label: '30г — горсть' },
    // Масло — столовая ложка
    oil: { grams: 15, label: '15г — 1 ст.л.' },
    // Зелень — пучок
    greens: { grams: 30, label: '30г — пучок' },
    // Яйца — 2 штуки
    eggs: { grams: 120, label: '2 яйца' },
    // Сыр — ломтик
    cheese: { grams: 30, label: '30г — ломтик' },
    // Соус — порция
    sauce: { grams: 30, label: '30г — порция' },
    // По умолчанию
    default: { grams: 100, label: '100г' }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SYNERGY_RULES — 50+ научных правил синергий
  // ═══════════════════════════════════════════════════════════════════════════

  const SYNERGY_RULES = [
    // === IRON + VITAMIN C (усвоение железа) ===
    {
      id: 'iron_vitc',
      trigger: { has: 'iron', missing: 'vitaminC' },
      priority: 95,
      icon: '🍋',
      title: 'Добавь витамин C к железу',
      reason: 'Усваивается в 6 раз лучше',
      science: 'Аскорбиновая кислота восстанавливает Fe³⁺ → Fe²⁺',
      recommend: { categories: ['vitaminC'], keywords: ['лимон', 'перец', 'апельсин'] }
    },

    // === CALCIUM + VITAMIN D (усвоение кальция) ===
    {
      id: 'calcium_vitd',
      trigger: { has: 'calcium', missing: 'vitaminD' },
      priority: 90,
      icon: '☀️',
      title: 'Витамин D для кальция',
      reason: 'Кальций лучше усваивается с витамином D',
      science: 'Витамин D регулирует транспорт Ca²⁺ в кишечнике',
      recommend: { categories: ['vitaminD'], keywords: ['яйцо', 'лосось', 'грибы'] }
    },

    // === FAT + FAT-SOLUBLE VITAMINS (A, D, E, K) ===
    {
      id: 'fat_vitamins',
      trigger: { hasCategory: 'vegetables', missingMacro: 'fat', minGrams: 100 },
      priority: 85,
      icon: '🫒',
      title: 'Добавь масло к овощам',
      reason: 'Каротины усваиваются только с жирами',
      science: 'Витамины A, D, E, K — жирорастворимые',
      recommend: { keywords: ['масло оливковое', 'масло', 'авокадо', 'орех'] }
    },

    // === PROTEIN COMPLETENESS (растительный белок) ===
    {
      id: 'plant_protein',
      trigger: { hasCategory: 'grains', missingCategory: 'legumes', mealProtLow: true },
      priority: 80,
      icon: '🫘',
      title: 'Добавь бобовые к крупе',
      reason: 'Полный аминокислотный профиль',
      science: 'Злаки + бобовые = все незаменимые аминокислоты',
      recommend: { keywords: ['фасоль', 'чечевица', 'нут', 'горох'] }
    },

    // === TURMERIC + BLACK PEPPER (куркумин) ===
    {
      id: 'turmeric_pepper',
      trigger: { hasKeyword: ['куркум'], missingKeyword: ['перец чёрн'] },
      priority: 75,
      icon: '🌶️',
      title: 'Чёрный перец к куркуме',
      reason: 'Усвоение куркумина +2000%',
      science: 'Пиперин блокирует метаболизм куркумина в печени',
      recommend: { keywords: ['перец чёрный'] }
    },

    // === TOMATO + FAT (ликопин) ===
    {
      id: 'tomato_fat',
      trigger: { hasKeyword: ['помидор', 'томат'], missingMacro: 'fat' },
      priority: 70,
      icon: '🍅',
      title: 'Масло к томатам',
      reason: 'Ликопин усваивается в 4 раза лучше',
      science: 'Ликопин — жирорастворимый каротиноид',
      recommend: { keywords: ['масло оливковое', 'масло', 'авокадо'] }
    },

    // === TEA + MILK BLOCKS ANTIOXIDANTS ===
    {
      id: 'tea_no_milk',
      trigger: { hasKeyword: ['чай зелёный', 'чай чёрный'], hasKeyword2: ['молоко'] },
      priority: 65,
      icon: '⚠️',
      title: 'Молоко блокирует антиоксиданты чая',
      reason: 'Казеин связывает катехины',
      science: 'Исследование European Heart Journal 2007',
      isWarning: true
    },

    // === COFFEE BLOCKS IRON ===
    {
      id: 'coffee_iron',
      trigger: { hasKeyword: ['кофе'], has: 'iron' },
      priority: 85,
      icon: '⚠️',
      title: 'Кофе снижает усвоение железа на 80%',
      reason: 'Пей кофе через 1-2 часа после еды',
      science: 'Танины связывают железо в нерастворимые соединения',
      isWarning: true
    },

    // === FIBER + MINERALS ===
    {
      id: 'fiber_minerals',
      trigger: { highFiber: true, has: 'zinc' },
      priority: 60,
      icon: '💡',
      title: 'Много клетчатки снижает усвоение цинка',
      reason: 'Фитаты связывают минералы',
      science: 'Актуально при >35г клетчатки/день',
      isWarning: true,
      mild: true
    },

    // === PROTEIN + LEUCINE TRIGGER ===
    {
      id: 'protein_leucine',
      trigger: { mealProtein: { min: 20, max: 25 } },
      priority: 70,
      icon: '💪',
      title: 'Добавь ещё белка до 30г',
      reason: 'Лейциновый порог для синтеза мышц',
      science: '~3г лейцина = максимальный анаболический ответ',
      recommend: { categories: ['protein'], keywords: ['яйцо', 'творог', 'курица'] }
    },

    // === LOW GI + HIGH GI BALANCING ===
    {
      id: 'gi_balance',
      trigger: { mealGI: { min: 70 } },
      priority: 75,
      icon: '📉',
      title: 'Добавь клетчатку для снижения ГИ',
      reason: 'Сгладит скачок сахара',
      science: 'Клетчатка замедляет всасывание глюкозы',
      recommend: { categories: ['fiber'], keywords: ['овощи', 'салат', 'огурец'] }
    },

    // === EVENING PROTEIN ===
    {
      id: 'evening_protein',
      trigger: { time: { after: '20:00' }, mealProtLow: true },
      priority: 80,
      icon: '🌙',
      title: 'Добавь казеин на ночь',
      reason: 'Медленный белок = восстановление во сне',
      science: 'Казеин переваривается 6-8 часов',
      recommend: { keywords: ['творог', 'казеин', 'сыр'] }
    },

    // === PRE-WORKOUT CARBS ===
    {
      id: 'preworkout_carbs',
      trigger: { hasTrainingAfterMeal: true, mealCarbsLow: true },
      priority: 75,
      icon: '⚡',
      title: 'Углеводы перед тренировкой',
      reason: 'Энергия для интенсивной работы',
      science: 'Гликоген = топливо для мышц',
      recommend: { categories: ['grains'], keywords: ['банан', 'овсянка', 'рис'] }
    },

    // === POST-WORKOUT PROTEIN ===
    {
      id: 'postworkout_protein',
      trigger: { hadTrainingRecently: true, mealProtLow: true },
      priority: 90,
      icon: '🏋️',
      title: 'Белок после тренировки',
      reason: 'Окно анаболизма — 2 часа',
      science: 'Синтез мышечного белка максимален после нагрузки',
      recommend: { categories: ['protein'], keywords: ['курица', 'яйцо', 'творог', 'протеин'] }
    },

    // === CARBS + PROTEIN COMBO ===
    {
      id: 'carbs_protein_combo',
      trigger: { hasOnlyCarbs: true, mealKcal: { min: 300 } },
      priority: 70,
      icon: '🥗',
      title: 'Добавь белок к углеводам',
      reason: 'Дольше насыщает + стабильный сахар',
      science: 'Белок замедляет опорожнение желудка',
      recommend: { categories: ['protein'], keywords: ['яйцо', 'творог', 'курица', 'рыба'] }
    },

    // === SIMPLE CARBS WARNING ===
    {
      id: 'simple_carbs_high',
      trigger: { mealSimpleCarbs: { min: 30 } },
      priority: 65,
      icon: '🍬',
      title: 'Много простых углеводов',
      reason: 'Добавь белок или клетчатку',
      science: 'Замедлит скачок инсулина',
      recommend: { categories: ['protein', 'fiber'], keywords: ['орех', 'творог', 'овощи'] }
    },

    // === BREAKFAST PROTEIN ===
    {
      id: 'breakfast_protein',
      trigger: { time: { before: '10:00' }, mealProtLow: true, mealKcal: { min: 200 } },
      priority: 80,
      icon: '🍳',
      title: 'Белок на завтрак',
      reason: 'Стабильная энергия до обеда',
      science: 'Белок повышает PYY и снижает грелин',
      recommend: { keywords: ['яйцо', 'творог', 'йогурт греческий', 'сыр'] }
    },

    // === OMEGA-3 + WORKOUT ===
    {
      id: 'omega3_recovery',
      trigger: { hasTrainingToday: true, missing: 'omega3' },
      priority: 65,
      icon: '🐟',
      title: 'Омега-3 для восстановления',
      reason: 'Снижает воспаление после тренировки',
      science: 'EPA/DHA — противовоспалительные медиаторы',
      recommend: { categories: ['omega3'], keywords: ['лосось', 'скумбрия', 'льняное масло'] }
    },

    // === MAGNESIUM + STRESS ===
    {
      id: 'magnesium_stress',
      trigger: { dayStressHigh: true, missing: 'magnesium' },
      priority: 70,
      icon: '😌',
      title: 'Магний при стрессе',
      reason: 'Снижает кортизол, расслабляет',
      science: 'Mg²⁺ регулирует HPA ось',
      recommend: { categories: ['magnesium'], keywords: ['миндаль', 'авокадо', 'шоколад тёмный', 'банан'] }
    },

    // === VITAMIN K + FAT ===
    {
      id: 'leafy_greens_fat',
      trigger: { hasKeyword: ['шпинат', 'капуста', 'брокколи', 'салат'], missingMacro: 'fat' },
      priority: 70,
      icon: '🥬',
      title: 'Добавь жиры к зелени',
      reason: 'Витамин K — жирорастворимый',
      science: 'Для свёртывания крови и костей',
      recommend: { keywords: ['масло', 'орех', 'авокадо', 'сыр'] }
    },

    // === ALCOHOL WARNING ===
    {
      id: 'alcohol_nutrients',
      trigger: { hasKeyword: ['вино', 'пиво', 'водка', 'виски', 'коньяк', 'алкоголь'] },
      priority: 90,
      icon: '⚠️',
      title: 'Алкоголь снижает усвоение B-витаминов',
      reason: 'B1, B6, B12, фолат — под ударом',
      science: 'Этанол нарушает всасывание и метаболизм',
      isWarning: true
    },

    // === CITRUS + MEDICATION (general awareness) ===
    {
      id: 'grapefruit_caution',
      trigger: { hasKeyword: ['грейпфрут', 'помело'] },
      priority: 50,
      icon: '💊',
      title: 'Осторожно с лекарствами',
      reason: 'Грейпфрут влияет на метаболизм препаратов',
      science: 'Ингибирует CYP3A4 в кишечнике',
      isWarning: true,
      mild: true
    },

    // === PROTEIN VARIETY ===
    {
      id: 'protein_variety',
      trigger: { sameProteinSource3Days: true },
      priority: 60,
      icon: '🔄',
      title: 'Разнообразь источники белка',
      reason: 'Разные аминокислотные профили',
      science: 'Курица, рыба, яйца, молочка — чередуй',
      recommend: { categories: ['protein'] }
    },

    // === HYDRATION WITH FIBER ===
    {
      id: 'fiber_water',
      trigger: { highFiber: true, dayWaterLow: true },
      priority: 75,
      icon: '💧',
      title: 'Пей воду с клетчаткой!',
      reason: 'Без воды клетчатка = запоры',
      science: 'Клетчатка впитывает воду для продвижения',
      isWarning: true
    },

    // === RESISTANT STARCH ===
    {
      id: 'resistant_starch',
      trigger: { hasKeyword: ['картофель', 'рис', 'макарон'], isCookedCold: true },
      priority: 60,
      icon: '❄️',
      title: 'Охлаждённый крахмал — резистентный',
      reason: 'ГИ ниже, питает микробиоту',
      science: 'Ретроградация крахмала при охлаждении',
      isInfo: true
    },

    // === PROBIOTICS + PREBIOTICS ===
    {
      id: 'probiotics_prebiotics',
      trigger: { hasKeyword: ['йогурт', 'кефир', 'квашен', 'кимчи'], missingKeyword: ['лук', 'чеснок', 'банан', 'овёс'] },
      priority: 65,
      icon: '🦠',
      title: 'Добавь пребиотики к пробиотикам',
      reason: 'Питание для полезных бактерий',
      science: 'Инулин, FOS — субстрат для микробиоты',
      recommend: { keywords: ['лук', 'чеснок', 'банан', 'овсянка'] }
    },

    // === COLLAGEN + VITAMIN C ===
    {
      id: 'collagen_vitc',
      trigger: { hasKeyword: ['коллаген', 'желатин', 'холодец', 'заливное'], missing: 'vitaminC' },
      priority: 80,
      icon: '✨',
      title: 'Витамин C для синтеза коллагена',
      reason: 'Без него коллаген не усваивается',
      science: 'Аскорбат — кофактор пролил-гидроксилазы',
      recommend: { categories: ['vitaminC'], keywords: ['лимон', 'киви', 'перец'] }
    },

    // === BETA-CAROTENE + FAT ===
    {
      id: 'beta_carotene',
      trigger: { hasKeyword: ['морковь', 'тыква', 'батат', 'манго', 'абрикос'], missingMacro: 'fat' },
      priority: 70,
      icon: '🥕',
      title: 'Добавь жиры к моркови/тыкве',
      reason: 'Бета-каротин — жирорастворимый',
      science: 'Конвертируется в витамин A',
      recommend: { keywords: ['масло', 'сметана', 'орех'] }
    },

    // === QUERCETIN + FAT ===
    {
      id: 'quercetin_fat',
      trigger: { hasKeyword: ['лук', 'яблоко', 'брокколи', 'чай'], missingMacro: 'fat' },
      priority: 55,
      icon: '🧅',
      title: 'Кверцетин лучше с жирами',
      reason: 'Антиоксидант для сосудов',
      science: 'Биодоступность ×5 с липидами',
      recommend: { keywords: ['масло', 'орех'] }
    },

    // === CRUCIFEROUS + IODINE ===
    {
      id: 'cruciferous_iodine',
      trigger: { hasKeyword: ['капуста', 'брокколи', 'цветная', 'брюссельская', 'редис', 'редька'] },
      priority: 45,
      icon: '🧂',
      title: 'Крестоцветные + йод',
      reason: 'Гойтрогены могут влиять на щитовидку',
      science: 'При готовке гойтрогены разрушаются',
      isInfo: true,
      mild: true
    },

    // === PHYTATES IN LEGUMES ===
    {
      id: 'legumes_soaking',
      trigger: { hasKeyword: ['фасоль', 'чечевица', 'нут', 'горох'] },
      priority: 40,
      icon: '💡',
      title: 'Замачивание снижает фитаты',
      reason: 'Лучше усвоятся минералы',
      science: '8-12ч замачивания — оптимум',
      isInfo: true,
      mild: true
    },

    // === SULFORAPHANE ACTIVATION ===
    {
      id: 'sulforaphane',
      trigger: { hasKeyword: ['брокколи'] },
      priority: 50,
      icon: '🥦',
      title: 'Нарежь брокколи и подожди 40мин',
      reason: 'Активируется сульфорафан',
      science: 'Мирозиназа конвертирует глюкорафанин',
      isInfo: true
    },

    // === LYCOPENE COOKING ===
    {
      id: 'lycopene_cooking',
      trigger: { hasKeyword: ['помидор', 'томат'], isCookedOrProcessed: false },
      priority: 45,
      icon: '🍅',
      title: 'Готовь томаты — больше ликопина',
      reason: 'Термообработка повышает биодоступность',
      science: '+2.5x после 30мин при 100°C',
      isInfo: true
    },

    // === PROTEIN TIMING (распределение) ===
    {
      id: 'protein_distribution',
      trigger: { dayProteinUneven: true },
      priority: 65,
      icon: '⏰',
      title: 'Распредели белок равномерно',
      reason: '20-40г за приём — оптимум',
      science: 'Muscle full effect при избытке за раз',
      isInfo: true
    },

    // === ANTI-NUTRIENTS GENERAL ===
    {
      id: 'antinutrients_cooking',
      trigger: { hasCategory: 'legumes' },
      priority: 35,
      icon: '🔥',
      title: 'Готовка снижает антинутриенты',
      reason: 'Лектины, оксалаты разрушаются',
      science: 'Варка 15+ мин нейтрализует лектины',
      isInfo: true,
      mild: true
    },

    // ═══════════════════════════════════════════════════════════════════════
    // НОВЫЕ НАУЧНЫЕ ПРАВИЛА (2025-12-10)
    // ═══════════════════════════════════════════════════════════════════════

    // === VITAMIN D + FAT (жирная еда = время D3) ===
    {
      id: 'fat_meal_vitd',
      trigger: { mealFat: { min: 15 } },
      priority: 78,
      icon: '☀️',
      title: 'Выпей витамин D с этим приёмом',
      reason: 'Жиры повышают усвоение D3 на 32%',
      science: 'Dawson-Hughes 2015: D3 с жирной едой усваивается на 32% лучше',
      isSupplement: true,
      supplementType: 'vitaminD'
    },

    // === EVENING MAGNESIUM ===
    {
      id: 'evening_magnesium',
      trigger: { time: { after: '19:00' } },
      priority: 75,
      icon: '💊',
      title: 'Хорошее время для магния',
      reason: 'Расслабляет мышцы, улучшает сон',
      science: 'Mg²⁺ активирует ГАМК-рецепторы, снижает кортизол',
      isSupplement: true,
      supplementType: 'magnesium'
    },

    // === CALCIUM vs IRON CONFLICT ===
    {
      id: 'calcium_iron_conflict',
      trigger: { has: 'calcium', has2: 'iron' },
      priority: 88,
      icon: '⚠️',
      title: 'Кальций и железо — не вместе!',
      reason: 'Кальций снижает усвоение железа на 50%',
      science: 'Hallberg 1991: Ca²⁺ конкурирует с Fe²⁺ за DMT1 транспортёр',
      isWarning: true
    },

    // === COFFEE vs CALCIUM ===
    {
      id: 'coffee_calcium_timing',
      trigger: { hasKeyword: ['кофе', 'эспрессо'], has: 'calcium' },
      priority: 82,
      icon: '☕',
      title: 'Кофе + молочка — подожди 2 часа',
      reason: 'Кофеин вымывает кальций',
      science: 'Massey 1993: 6мг Ca теряется на каждые 100мг кофеина',
      isWarning: true
    },

    // === MAGNESIUM + B6 SYNERGY ===
    {
      id: 'magnesium_b6',
      trigger: { has: 'magnesium' },
      priority: 65,
      icon: '🔗',
      title: 'Магний лучше с B6',
      reason: 'B6 повышает усвоение Mg на 20%',
      science: 'Pouteau 2018: пиридоксин увеличивает клеточный захват Mg²⁺',
      recommend: { keywords: ['курица', 'рыба', 'банан', 'картофель'] }
    },

    // === ZINC + EMPTY STOMACH ===
    {
      id: 'zinc_empty_stomach',
      trigger: { has: 'zinc', mealKcal: { max: 150 } },
      priority: 70,
      icon: '💡',
      title: 'Цинк натощак может вызвать тошноту',
      reason: 'Лучше с небольшой порцией еды',
      science: 'Zn²⁺ раздражает слизистую желудка',
      isWarning: true,
      mild: true
    },

    // === FISH OIL + FATTY MEAL ===
    {
      id: 'omega3_with_fat',
      trigger: { mealFat: { min: 10 }, missing: 'omega3' },
      priority: 72,
      icon: '🐟',
      title: 'Отличное время для Омега-3',
      reason: 'С жирной едой усваивается в 3 раза лучше',
      science: 'Lawson 1988: EPA/DHA абсорбция ×3 с жирами',
      isSupplement: true,
      supplementType: 'omega3'
    },

    // === IRON + MORNING ===
    {
      id: 'iron_morning_best',
      trigger: { has: 'iron', time: { before: '11:00' } },
      priority: 60,
      icon: '🌅',
      title: 'Утро — лучшее время для железа',
      reason: 'Усвоение максимально натощак/с лёгкой едой',
      science: 'Гепсидин (блокатор Fe) минимален утром',
      isInfo: true
    },

    // === LATE NIGHT PROTEIN vs FAT ===
    {
      id: 'late_night_fat',
      trigger: { time: { after: '22:00' }, mealFat: { min: 20 } },
      priority: 68,
      icon: '🌙',
      title: 'Много жира перед сном',
      reason: 'Замедлит пищеварение, ухудшит сон',
      science: 'Жиры замедляют опорожнение желудка на 2-4ч',
      isWarning: true
    },

    // === VITAMIN C + TIMING ===
    {
      id: 'vitc_with_meal',
      trigger: { has: 'vitaminC', mealKcal: { max: 100 } },
      priority: 55,
      icon: '🍋',
      title: 'Витамин C лучше с едой',
      reason: 'Снижает раздражение желудка',
      science: 'Аскорбиновая кислота = кислота → лучше с буфером',
      isInfo: true,
      mild: true
    },

    // === PROTEIN + CREATINE ===
    {
      id: 'protein_creatine_timing',
      trigger: { mealProtein: { min: 25 }, hasTrainingToday: true },
      priority: 65,
      icon: '💪',
      title: 'Белок + инсулин = лучше для креатина',
      reason: 'Если принимаешь креатин — сейчас!',
      science: 'Green 1996: инсулин усиливает захват креатина мышцами на 60%',
      isSupplement: true,
      supplementType: 'creatine'
    },

    // === TRYPTOPHAN + CARBS (для сна) ===
    {
      id: 'tryptophan_carbs',
      trigger: { hasKeyword: ['индейка', 'курица', 'молоко', 'творог', 'сыр'], time: { after: '19:00' }, mealCarbs: { min: 30 } },
      priority: 62,
      icon: '😴',
      title: 'Триптофан + углеводы = мелатонин',
      reason: 'Хорошая комбинация для сна',
      science: 'Углеводы → инсулин → LNAA из крови → триптофан проходит ГЭБ',
      isInfo: true
    },

    // === COLLAGEN + GLYCINE TIMING ===
    {
      id: 'collagen_sleep',
      trigger: { hasKeyword: ['коллаген', 'желатин'], time: { after: '20:00' } },
      priority: 58,
      icon: '✨',
      title: 'Коллаген вечером — отлично!',
      reason: 'Глицин улучшает качество сна',
      science: 'Bannai 2012: 3г глицина перед сном улучшает сон',
      isInfo: true
    },

    // === PROBIOTICS + PREBIOTICS ===
    {
      id: 'probiotic_empty',
      trigger: { hasKeyword: ['пробиотик', 'бифидо', 'лакто'], mealKcal: { min: 200 } },
      priority: 60,
      icon: '🦠',
      title: 'Пробиотики лучше натощак',
      reason: 'Или через 2ч после еды',
      science: 'Желудочный сок убивает бактерии, натощак pH выше',
      isInfo: true,
      mild: true
    },

    // === GREEN TEA + IRON BLOCK ===
    {
      id: 'green_tea_iron',
      trigger: { hasKeyword: ['чай зелёный', 'зелёный чай', 'матча'], has: 'iron' },
      priority: 80,
      icon: '🍵',
      title: 'Зелёный чай блокирует железо',
      reason: 'Танины связывают Fe — пей через 1ч',
      science: 'Hurrell 1999: танины снижают абсорбцию Fe на 70%',
      isWarning: true
    },

    // === EGGS + CHOLINE FOR BRAIN ===
    {
      id: 'eggs_morning_brain',
      trigger: { hasKeyword: ['яйцо', 'яичн', 'омлет'], time: { before: '12:00' } },
      priority: 55,
      icon: '🧠',
      title: 'Холин на завтрак — для мозга',
      reason: 'Яйца = лучший источник холина',
      science: 'Холин → ацетилхолин → память и фокус',
      isInfo: true
    },

    // === SPINACH + LEMON ===
    {
      id: 'spinach_lemon',
      trigger: { hasKeyword: ['шпинат'], missingKeyword: ['лимон', 'апельсин', 'перец'] },
      priority: 75,
      icon: '🥬',
      title: 'Добавь лимон к шпинату',
      reason: 'Оксалаты связывают железо — вит C поможет',
      science: 'Витамин C конвертирует Fe³⁺ → Fe²⁺ для усвоения',
      recommend: { keywords: ['лимон', 'перец болгарский'] }
    },

    // === BERRIES + CREAM ===
    {
      id: 'berries_fat',
      trigger: { hasKeyword: ['ягод', 'малин', 'черник', 'клубник', 'голубик', 'смородин'], missingMacro: 'fat' },
      priority: 65,
      icon: '🫐',
      title: 'Ягоды лучше с жирами',
      reason: 'Антоцианы = жирорастворимые',
      science: 'Lipophilic polyphenols лучше с липидами',
      recommend: { keywords: ['сливки', 'сметана', 'йогурт', 'орех'] }
    },

    // === LIVER + AVOID EXCESS ===
    {
      id: 'liver_vita_excess',
      trigger: { hasKeyword: ['печень', 'печёнка'] },
      priority: 70,
      icon: '⚠️',
      title: 'Печень 1-2 раза в неделю',
      reason: 'Избыток витамина A токсичен',
      science: 'Гипервитаминоз A при >10000 IU/день длительно',
      isWarning: true,
      mild: true
    },

    // === AVOCADO + SALAD ===
    {
      id: 'avocado_salad',
      trigger: { hasKeyword: ['авокадо'], hasCategory: 'vegetables' },
      priority: 68,
      icon: '🥑',
      title: 'Идеальная комбинация!',
      reason: 'Авокадо ×4 усвоение каротиноидов из салата',
      science: 'Unlu 2005: жиры авокадо увеличивают абсорбцию каротиноидов',
      isInfo: true
    },

    // === BREAKFAST CORTISOL SPIKE ===
    {
      id: 'morning_cortisol',
      trigger: { time: { before: '09:00' }, mealSimpleCarbs: { min: 25 } },
      priority: 72,
      icon: '⚡',
      title: 'Утром кортизол высокий — меньше сахара',
      reason: 'Простые углеводы усилят стресс-ответ',
      science: 'Cortisol awakening response + сахар = инсулиновые качели',
      isWarning: true
    },

    // === NUTS + PHYTATES ===
    {
      id: 'nuts_soaking',
      trigger: { hasKeyword: ['миндаль', 'грецк', 'фундук', 'кешью', 'орех'] },
      priority: 40,
      icon: '💡',
      title: 'Замачивание орехов = лучше усвоение',
      reason: 'Активирует ферменты, снижает фитаты',
      science: '8-12ч в воде — оптимально',
      isInfo: true,
      mild: true
    }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // BALANCE_RULES — Правила балансировки макронутриентов
  // ═══════════════════════════════════════════════════════════════════════════

  const BALANCE_RULES = [
    {
      id: 'need_protein',
      trigger: { mealProtPct: { max: 15 }, mealKcal: { min: 300 } },
      priority: 85,
      icon: '🥩',
      title: 'Добавь белок',
      reason: 'Только ' + '{protPct}%' + ' калорий из белка',
      recommend: { categories: ['protein'], keywords: ['курица', 'рыба', 'яйцо', 'творог'] }
    },
    {
      id: 'need_fiber',
      trigger: { mealFiber: { max: 3 }, mealKcal: { min: 300 } },
      priority: 75,
      icon: '🥗',
      title: 'Добавь клетчатку',
      reason: 'Всего {fiber}г клетчатки в приёме',
      recommend: { categories: ['vegetables', 'fiber'], keywords: ['салат', 'огурец', 'капуста', 'брокколи'] }
    },
    {
      id: 'need_healthy_fat',
      trigger: { mealGoodFatPct: { max: 30 }, mealFat: { min: 10 } },
      priority: 65,
      icon: '🥑',
      title: 'Улучши качество жиров',
      reason: 'Мало полезных жиров',
      recommend: { keywords: ['авокадо', 'оливковое', 'орех', 'лосось'] }
    },
    {
      id: 'too_much_simple',
      trigger: { mealSimplePct: { min: 50 }, mealCarbs: { min: 30 } },
      priority: 80,
      icon: '⚠️',
      title: 'Много простых углеводов',
      reason: '{simplePct}% углеводов — простые',
      recommend: { categories: ['protein', 'fiber'], keywords: ['орех', 'белок', 'овощи'] },
      isWarning: true
    }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMING_RULES — Правила по времени суток
  // ═══════════════════════════════════════════════════════════════════════════

  const TIMING_RULES = [
    {
      id: 'late_carbs',
      trigger: { time: { after: '21:00' }, mealCarbsPct: { min: 50 } },
      priority: 70,
      icon: '🌙',
      title: 'Поздние углеводы',
      reason: 'Вечером лучше белок + жиры',
      science: 'Инсулиновая чувствительность снижена',
      isWarning: true
    },
    {
      id: 'morning_fat',
      trigger: { time: { before: '09:00' }, mealFatPct: { max: 15 }, mealKcal: { min: 200 } },
      priority: 60,
      icon: '🌅',
      title: 'Добавь жиры на завтрак',
      reason: 'Сытость + стабильная энергия',
      recommend: { keywords: ['авокадо', 'орех', 'масло', 'сыр'] }
    },
    {
      id: 'afternoon_slump',
      trigger: { time: { after: '14:00', before: '16:00' }, mealGI: { min: 70 } },
      priority: 65,
      icon: '😴',
      title: 'Высокий ГИ после обеда',
      reason: 'Риск сонливости',
      recommend: { keywords: ['орех', 'белок', 'салат'] }
    }
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS — Утилиты
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Детектировать нутриенты по названию продукта
   */
  function detectNutrients(productName) {
    if (!productName) return [];
    const name = productName.toLowerCase();
    const found = [];

    for (const [nutrientId, config] of Object.entries(NUTRIENT_KEYWORDS)) {
      for (const keyword of config.keywords) {
        if (name.includes(keyword.toLowerCase())) {
          found.push(nutrientId);
          break;
        }
      }
    }

    return found;
  }

  /**
   * Детектировать категории по названию и нутриентам продукта
   */
  function detectCategories(product, existingCategories) {
    // Используем категории из heys_advice если доступны
    const adviceCategories = HEYS.advice?.PRODUCT_CATEGORIES || existingCategories || {};

    if (!product?.name) return [];
    const name = product.name.toLowerCase();
    const found = [];

    for (const [catId, config] of Object.entries(adviceCategories)) {
      if (!config.keywords) continue;
      for (const keyword of config.keywords) {
        if (name.includes(keyword.toLowerCase())) {
          found.push(catId);
          break;
        }
      }
    }

    return found;
  }

  /**
   * Проверить условие триггера
   */
  function normalizeTextForKeywordMatch(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      // Буквы/цифры (латиница + кириллица). Всё остальное → пробел.
      .replace(/[^a-z0-9а-яе]+/gi, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function tokenizeNormalizedText(sNorm) {
    return sNorm ? sNorm.split(' ') : [];
  }

  /**
   * Надёжный матч ключевых слов по тексту приёма.
   *
   * Важно: многие keywords заданы как "корень" (напр. "куркум"), поэтому
   * используем startsWith по токенам. Это также предотвращает ложные совпадения
   * типа "вино" внутри "свино".
   */
  function textHasKeyword(mealTokens, mealNorm, keyword) {
    const kwNorm = normalizeTextForKeywordMatch(keyword);
    if (!kwNorm) return false;
    const kwTokens = kwNorm.split(' ');
    if (kwTokens.length === 1) {
      const needle = kwTokens[0];
      return mealTokens.some((t) => t.startsWith(needle));
    }

    // Multi-word: ищем последовательность токенов (каждый токен startsWith корня)
    for (let i = 0; i <= mealTokens.length - kwTokens.length; i++) {
      let ok = true;
      for (let j = 0; j < kwTokens.length; j++) {
        if (!mealTokens[i + j].startsWith(kwTokens[j])) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }

    // Fallback: на случай нестандартной токенизации
    return mealNorm.includes(kwNorm);
  }

  function roundTo1(v) {
    return Math.round((+v || 0) * 10) / 10;
  }

  function getMealProteinAmount(meal, pIndex) {
    if (!meal?.items?.length) return 0;

    const models = HEYS.models || {};
    if (models.mealTotals && pIndex) {
      const totals = models.mealTotals(meal, pIndex) || {};
      if (Number.isFinite(+totals.prot)) {
        return roundTo1(totals.prot);
      }
    }

    let totalProtein = 0;
    for (const item of meal.items) {
      const grams = +item?.grams || 0;
      if (grams <= 0) continue;

      const product = (models.getProductFromItem && pIndex)
        ? models.getProductFromItem(item, pIndex)
        : null;
      const source = product || item || {};
      const protein100 = +(source.protein100 ?? source.prot100 ?? item?.protein100 ?? item?.prot100) || 0;
      totalProtein += protein100 * grams / 100;
    }

    return roundTo1(totalProtein);
  }

  function analyzeProteinDistributionForMeal(context) {
    const meals = Array.isArray(context?.dayData?.meals)
      ? context.dayData.meals.filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0)
      : [];
    const currentProtein = roundTo1(context?.mealTotals?.prot || 0);

    if (meals.length < 2 || currentProtein <= 40) {
      return {
        isUneven: false,
        currentProtein,
        minProtein: currentProtein,
        maxProtein: currentProtein,
        spread: 0,
      };
    }

    const proteins = meals.map((meal) => {
      if (meal === context.meal) return currentProtein;
      return getMealProteinAmount(meal, context?.pIndex);
    });

    const otherProteins = proteins.filter((protein, index) => meals[index] !== context.meal);
    if (otherProteins.length === 0) {
      return {
        isUneven: false,
        currentProtein,
        minProtein: currentProtein,
        maxProtein: currentProtein,
        spread: 0,
      };
    }

    const minProtein = Math.min(...proteins);
    const maxProtein = Math.max(...proteins);
    const spread = roundTo1(maxProtein - minProtein);
    const hasLowOtherMeal = otherProteins.some((protein) => protein < 15);

    return {
      isUneven: hasLowOtherMeal || spread >= 25,
      currentProtein,
      minProtein: roundTo1(minProtein),
      maxProtein: roundTo1(maxProtein),
      spread,
    };
  }

  function checkTrigger(trigger, context) {
    const { meal, mealTotals, dayData, profile, products, time } = context;

    // Текст текущего приёма — используется в нескольких триггерах
    const mealTextRaw = (meal?.items || []).map((it) => (it.name || '')).join(' ');
    const mealTextNorm = normalizeTextForKeywordMatch(mealTextRaw);
    const mealTokens = tokenizeNormalizedText(mealTextNorm);

    // has: nutrient
    if (trigger.has) {
      const allNutrients = (context.mealNutrients || []);
      if (!allNutrients.includes(trigger.has)) return false;
    }

    // has2: second nutrient (для конфликтов)
    if (trigger.has2) {
      const allNutrients = (context.mealNutrients || []);
      if (!allNutrients.includes(trigger.has2)) return false;
    }

    // missing: nutrient
    if (trigger.missing) {
      const allNutrients = (context.mealNutrients || []);
      if (allNutrients.includes(trigger.missing)) return false;
    }

    // hasCategory
    if (trigger.hasCategory) {
      const cats = context.mealCategories || [];
      if (!cats.includes(trigger.hasCategory)) return false;
    }

    // missingCategory
    if (trigger.missingCategory) {
      const cats = context.mealCategories || [];
      if (cats.includes(trigger.missingCategory)) return false;
    }

    // hasKeyword
    if (trigger.hasKeyword) {
      const keywords = Array.isArray(trigger.hasKeyword) ? trigger.hasKeyword : [trigger.hasKeyword];
      const hasAny = keywords.some((kw) => textHasKeyword(mealTokens, mealTextNorm, kw));
      if (!hasAny) return false;
    }

    // missingKeyword
    if (trigger.missingKeyword) {
      const keywords = Array.isArray(trigger.missingKeyword) ? trigger.missingKeyword : [trigger.missingKeyword];
      const hasAny = keywords.some((kw) => textHasKeyword(mealTokens, mealTextNorm, kw));
      if (hasAny) return false;
    }

    // hasKeyword2 — второй набор ключевых слов (для проверки конфликтов)
    if (trigger.hasKeyword2) {
      const keywords = Array.isArray(trigger.hasKeyword2) ? trigger.hasKeyword2 : [trigger.hasKeyword2];
      const hasAny = keywords.some((kw) => textHasKeyword(mealTokens, mealTextNorm, kw));
      if (!hasAny) return false;
    }

    // missingMacro: 'fat' | 'protein' | 'carbs'
    if (trigger.missingMacro) {
      const t = mealTotals || {};
      if (trigger.missingMacro === 'fat' && t.fat > 5) return false;
      if (trigger.missingMacro === 'protein' && t.prot > 10) return false;
      if (trigger.missingMacro === 'carbs' && t.carbs > 10) return false;
    }

    // minGrams
    if (trigger.minGrams && (mealTotals?.grams || 0) < trigger.minGrams) return false;

    // mealProtLow
    if (trigger.mealProtLow && (mealTotals?.prot || 0) >= 15) return false;

    // mealCarbsLow
    if (trigger.mealCarbsLow && (mealTotals?.carbs || 0) >= 30) return false;

    // mealProtein: { min, max }
    if (trigger.mealProtein) {
      const prot = mealTotals?.prot || 0;
      if (trigger.mealProtein.min !== undefined && prot < trigger.mealProtein.min) return false;
      if (trigger.mealProtein.max !== undefined && prot > trigger.mealProtein.max) return false;
    }

    // mealKcal: { min, max }
    if (trigger.mealKcal) {
      const kcal = mealTotals?.kcal || 0;
      if (trigger.mealKcal.min !== undefined && kcal < trigger.mealKcal.min) return false;
      if (trigger.mealKcal.max !== undefined && kcal > trigger.mealKcal.max) return false;
    }

    // mealGI: { min, max }
    if (trigger.mealGI) {
      const gi = context.avgGI || 50;
      if (trigger.mealGI.min !== undefined && gi < trigger.mealGI.min) return false;
      if (trigger.mealGI.max !== undefined && gi > trigger.mealGI.max) return false;
    }

    // mealSimpleCarbs: { min }
    if (trigger.mealSimpleCarbs) {
      const simple = mealTotals?.simple || 0;
      if (trigger.mealSimpleCarbs.min !== undefined && simple < trigger.mealSimpleCarbs.min) return false;
    }

    // mealProtPct: { max }
    if (trigger.mealProtPct) {
      const kcal = mealTotals?.kcal || 0;
      const prot = mealTotals?.prot || 0;
      const protPct = kcal > 0 ? (prot * 3 / kcal * 100) : 0;
      if (trigger.mealProtPct.max !== undefined && protPct > trigger.mealProtPct.max) return false;
    }

    // mealFiber: { max }
    if (trigger.mealFiber) {
      const fiber = mealTotals?.fiber || 0;
      if (trigger.mealFiber.max !== undefined && fiber > trigger.mealFiber.max) return false;
    }

    // mealGoodFatPct: { max }
    if (trigger.mealGoodFatPct) {
      const fat = mealTotals?.fat || 0;
      const good = mealTotals?.good || 0;
      const goodPct = fat > 0 ? (good / fat * 100) : 0;
      if (trigger.mealGoodFatPct.max !== undefined && goodPct > trigger.mealGoodFatPct.max) return false;
    }

    // mealSimplePct: { min }
    if (trigger.mealSimplePct) {
      const carbs = mealTotals?.carbs || 0;
      const simple = mealTotals?.simple || 0;
      const simplePct = carbs > 0 ? (simple / carbs * 100) : 0;
      if (trigger.mealSimplePct.min !== undefined && simplePct < trigger.mealSimplePct.min) return false;
    }

    // mealCarbs: { min }
    if (trigger.mealCarbs) {
      const carbs = mealTotals?.carbs || 0;
      if (trigger.mealCarbs.min !== undefined && carbs < trigger.mealCarbs.min) return false;
    }

    // mealFat: { min }
    if (trigger.mealFat) {
      const fat = mealTotals?.fat || 0;
      if (trigger.mealFat.min !== undefined && fat < trigger.mealFat.min) return false;
    }

    // mealCarbsPct: { min }
    if (trigger.mealCarbsPct) {
      const kcal = mealTotals?.kcal || 0;
      const carbs = mealTotals?.carbs || 0;
      const carbsPct = kcal > 0 ? (carbs * 4 / kcal * 100) : 0;
      if (trigger.mealCarbsPct.min !== undefined && carbsPct < trigger.mealCarbsPct.min) return false;
    }

    // mealFatPct: { max }
    if (trigger.mealFatPct) {
      const kcal = mealTotals?.kcal || 0;
      const fat = mealTotals?.fat || 0;
      const fatPct = kcal > 0 ? (fat * 9 / kcal * 100) : 0;
      if (trigger.mealFatPct.max !== undefined && fatPct > trigger.mealFatPct.max) return false;
    }

    // time: { before, after }
    if (trigger.time) {
      const mealTime = time || meal?.time || '12:00';
      const [h, m] = mealTime.split(':').map(Number);
      const mealMinutes = h * 60 + m;

      if (trigger.time.before) {
        const [bh, bm] = trigger.time.before.split(':').map(Number);
        if (mealMinutes >= bh * 60 + bm) return false;
      }
      if (trigger.time.after) {
        const [ah, am] = trigger.time.after.split(':').map(Number);
        if (mealMinutes < ah * 60 + am) return false;
      }
    }

    // hasTrainingToday — есть ли запланированная/выполненная тренировка сегодня
    if (trigger.hasTrainingToday) {
      const trainings = dayData?.trainings || [];
      if (trainings.length === 0) return false;
    }

    // hadTrainingRecently — была ли тренировка в последние 2 часа
    if (trigger.hadTrainingRecently) {
      const trainings = dayData?.trainings || [];
      if (trainings.length === 0) return false;

      // Проверяем время тренировки — должна быть в последние 2 часа
      const mealTime = time || meal?.time || '12:00';
      const [mealH, mealM] = mealTime.split(':').map(Number);
      const mealMinutes = mealH * 60 + mealM;

      let hasRecentTraining = false;
      for (const tr of trainings) {
        if (!tr.time) continue;
        const [trH, trM] = tr.time.split(':').map(Number);
        const trMinutes = trH * 60 + trM;
        // Тренировка должна быть ДО приёма пищи и не более 2 часов назад
        const diffMinutes = mealMinutes - trMinutes;
        if (diffMinutes >= 0 && diffMinutes <= 120) {
          hasRecentTraining = true;
          break;
        }
      }
      if (!hasRecentTraining) return false;
    }

    // hasTrainingAfterMeal — тренировка запланирована ПОСЛЕ текущего приёма (1-4 часа)
    if (trigger.hasTrainingAfterMeal) {
      const trainings = dayData?.trainings || [];
      if (trainings.length === 0) return false;

      const mealTime = time || meal?.time || '12:00';
      const [mealH, mealM] = mealTime.split(':').map(Number);
      const mealMinutes = mealH * 60 + mealM;

      let hasUpcomingTraining = false;
      for (const tr of trainings) {
        if (!tr.time) continue;
        const [trH, trM] = tr.time.split(':').map(Number);
        const trMinutes = trH * 60 + trM;
        // Тренировка должна быть ПОСЛЕ приёма пищи (через 1-4 часа)
        const diffMinutes = trMinutes - mealMinutes;
        if (diffMinutes >= 60 && diffMinutes <= 240) {
          hasUpcomingTraining = true;
          break;
        }
      }
      if (!hasUpcomingTraining) return false;
    }

    // highFiber (дневной показатель)
    if (trigger.highFiber) {
      const dayFiber = dayData?.dayTot?.fiber || 0;
      if (dayFiber < 25) return false;
    }

    // dayWaterLow
    if (trigger.dayWaterLow) {
      const waterMl = dayData?.waterMl || 0;
      const waterGoal = dayData?.waterGoal || 2000;
      if (waterMl >= waterGoal * 0.5) return false;
    }

    // dayStressHigh
    if (trigger.dayStressHigh) {
      const stress = dayData?.stressAvg || 0;
      if (stress < 6) return false;
    }

    // dayProteinUneven
    if (trigger.dayProteinUneven) {
      const proteinDistribution = analyzeProteinDistributionForMeal(context);
      if (!proteinDistribution.isUneven) return false;
      context.proteinDistribution = proteinDistribution;
    }

    // hasOnlyCarbs
    if (trigger.hasOnlyCarbs) {
      const t = mealTotals || {};
      if (t.prot > 5 || t.fat > 5) return false;
      if (t.carbs < 20) return false;
    }

    return true;
  }

  /**
   * Найти продукты для рекомендации
   */
  function findRecommendedProducts(recommend, products, currentItems, limit = 3) {
    if (!recommend || !products || products.length === 0) return [];

    const currentIds = new Set((currentItems || []).map(it => it.product_id || it.id));
    const candidates = [];

    // По ключевым словам
    if (recommend.keywords) {
      for (const product of products) {
        if (currentIds.has(product.id)) continue;
        const name = (product.name || '').toLowerCase();
        for (const keyword of recommend.keywords) {
          if (name.includes(keyword.toLowerCase())) {
            candidates.push({ product, score: 10 });
            break;
          }
        }
      }
    }

    // По категориям (используем PRODUCT_CATEGORIES)
    if (recommend.categories) {
      const adviceCategories = HEYS.advice?.PRODUCT_CATEGORIES || {};
      for (const product of products) {
        if (currentIds.has(product.id)) continue;
        const name = (product.name || '').toLowerCase();

        for (const catId of recommend.categories) {
          const cat = adviceCategories[catId] || NUTRIENT_KEYWORDS[catId];
          if (!cat?.keywords) continue;

          for (const keyword of cat.keywords) {
            if (name.includes(keyword.toLowerCase())) {
              candidates.push({ product, score: 5 });
              break;
            }
          }
        }
      }
    }

    // Убираем дубликаты и сортируем по score
    const seen = new Set();
    const unique = candidates.filter(c => {
      if (seen.has(c.product.id)) return false;
      seen.add(c.product.id);
      return true;
    });

    unique.sort((a, b) => b.score - a.score);
    return unique.slice(0, limit).map(c => c.product);
  }

  /**
   * Получить оптимальную порцию для продукта
   */
  function getSmartPortion(product) {
    if (!product) return RECOMMENDED_PORTIONS.default;

    const name = (product.name || '').toLowerCase();

    // Проверяем по ключевым словам
    if (/яйц|омлет|яичн/.test(name)) return RECOMMENDED_PORTIONS.eggs;
    if (/сыр|пармезан|моцарелла|брынза/.test(name)) return RECOMMENDED_PORTIONS.cheese;
    if (/масло/.test(name)) return RECOMMENDED_PORTIONS.oil;
    if (/молоко|кефир|йогурт|ряженка/.test(name)) return RECOMMENDED_PORTIONS.dairy;
    if (/курица|говядина|свинина|индейка|рыба|лосось|тунец|минтай/.test(name)) return RECOMMENDED_PORTIONS.protein;
    if (/орех|миндаль|кешью|фундук|грецк/.test(name)) return RECOMMENDED_PORTIONS.nuts;
    if (/гречка|рис|овсянка|макарон|паста/.test(name)) return RECOMMENDED_PORTIONS.grains;
    if (/банан|яблоко|апельсин|груша|персик/.test(name)) return RECOMMENDED_PORTIONS.fruits;
    if (/салат|огурец|помидор|капуста|брокколи|шпинат/.test(name)) return RECOMMENDED_PORTIONS.vegetables;
    if (/укроп|петрушка|базилик|кинза|зелень/.test(name)) return RECOMMENDED_PORTIONS.greens;
    if (/соус|кетчуп|майонез/.test(name)) return RECOMMENDED_PORTIONS.sauce;

    return RECOMMENDED_PORTIONS.default;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTEXTUAL RECOMMENDATIONS — Контекстные формулировки
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Сделать рекомендацию контекстной — с упоминанием конкретных продуктов
   */
  function makeContextualRecommendation(rule, context, recommendedProducts) {
    const { meal, mealTotals, mealNutrients } = context;
    const items = meal?.items || [];

    // Получаем названия продуктов в приёме (первые 2 для краткости)
    const productNames = items.slice(0, 2).map(it => {
      const name = it.name || '';
      // Сокращаем длинные названия
      return name.length > 20 ? name.substring(0, 18) + '...' : name;
    });
    const mainProduct = productNames[0] || 'приём';
    const hasMultiple = items.length > 1;

    // Название рекомендуемого продукта
    const recProduct = recommendedProducts[0]?.name || '';
    const recShort = recProduct.length > 15 ? recProduct.substring(0, 13) + '...' : recProduct;

    // Контекстные шаблоны для каждого правила
    const contextTemplates = {
      // SYNERGY
      'iron_vitc': {
        title: `К ${mainProduct} добавь витамин C`,
        reason: `${recShort || 'Лимон/перец'} — железо усвоится в 6 раз лучше`
      },
      'calcium_vitd': {
        title: `Витамин D к ${mainProduct}`,
        reason: `${recShort || 'Яйцо/рыба'} усилит усвоение кальция`
      },
      'fat_vitamins': {
        title: `Масло к ${mainProduct}`,
        reason: `Каротины из овощей усваиваются только с жирами`
      },
      'plant_protein': {
        title: `Бобовые к ${mainProduct}`,
        reason: `${recShort || 'Фасоль/чечевица'} — полный белок вместе с крупой`
      },
      'turmeric_pepper': {
        title: `Чёрный перец к куркуме`,
        reason: `Усвоение куркумина вырастет в 20 раз`
      },
      'tomato_fat': {
        title: `Масло к томатам`,
        reason: `Ликопин усвоится в 4 раза лучше с жирами`
      },
      'tea_no_milk': {
        title: `Молоко блокирует чай`,
        reason: `Казеин связывает антиоксиданты — пей отдельно`
      },
      'coffee_iron': {
        title: `Кофе снижает усвоение железа`,
        reason: `Подожди 1-2 часа после ${mainProduct}`
      },
      'fiber_minerals': {
        title: `Много клетчатки = меньше цинка`,
        reason: `Фитаты связывают минералы`
      },

      // BALANCE
      'need_protein': {
        title: `Мало белка в ${mainProduct}`,
        reason: `Только ${Math.round((mealTotals?.prot || 0) * 4 / (mealTotals?.kcal || 1) * 100)}% калорий из белка — добавь ${recShort || 'яйцо/творог'}`
      },
      'need_fiber': {
        title: `Добавь клетчатку к ${mainProduct}`,
        reason: `Всего ${Math.round(mealTotals?.fiber || 0)}г — нужно ${recShort || 'овощи/салат'}`
      },
      'need_healthy_fat': {
        title: `Улучши жиры в ${mainProduct}`,
        reason: `Замени на ${recShort || 'авокадо/орехи/оливковое'}`
      },
      'too_much_simple': {
        title: `${Math.round((mealTotals?.simple || 0) / (mealTotals?.carbs || 1) * 100)}% — простые углеводы`,
        reason: `Добавь ${recShort || 'белок/клетчатку'} — сгладит скачок сахара`
      },

      // TIMING
      'protein_leucine': {
        title: `Ещё ${30 - Math.round(mealTotals?.prot || 0)}г белка до оптимума`,
        reason: `${recShort || 'Яйцо/творог'} — достигнешь лейцинового порога`
      },
      'gi_balance': {
        title: `Высокий ГИ (${Math.round(context.avgGI || 0)}) в ${mainProduct}`,
        reason: `${recShort || 'Овощи/салат'} снизят скачок сахара`
      },
      'evening_protein': {
        title: `Добавь казеин на ночь`,
        reason: `${recShort || 'Творог'} — медленный белок для восстановления`
      },
      'preworkout_carbs': {
        title: `Углеводы перед тренировкой`,
        reason: `${recShort || 'Банан/овсянка'} — топливо для мышц`
      },
      'postworkout_protein': {
        title: `Белок после тренировки важен`,
        reason: `${recShort || 'Курица/яйцо'} — окно анаболизма 2 часа`
      },
      'carbs_protein_combo': {
        title: `К ${mainProduct} добавь белок`,
        reason: `${recShort || 'Яйцо/творог'} — дольше насытит`
      },
      'simple_carbs_high': {
        title: `Много сахара (${Math.round(mealTotals?.simple || 0)}г)`,
        reason: `${recShort || 'Орехи/белок'} замедлят всасывание`
      },
      'breakfast_protein': {
        title: `Белок на завтрак`,
        reason: `${recShort || 'Яйцо/творог'} — стабильная энергия до обеда`
      },
      'omega3_recovery': {
        title: `Омега-3 для восстановления`,
        reason: `${recShort || 'Лосось/льняное'} — снизит воспаление после тренировки`
      },
      'magnesium_stress': {
        title: `Магний при стрессе`,
        reason: `${recShort || 'Миндаль/авокадо'} — снизит кортизол`
      },
      'late_carbs': {
        title: `Поздние углеводы (${Math.round(mealTotals?.carbs || 0)}г)`,
        reason: `Вечером лучше белок + жиры — инсулин снижен`
      },
      'morning_fat': {
        title: `Добавь жиры на завтрак`,
        reason: `${recShort || 'Авокадо/орехи'} — сытость до обеда`
      },
      'afternoon_slump': {
        title: `Высокий ГИ после обеда`,
        reason: `${recShort || 'Орехи/белок'} — избежишь сонливости`
      },

      // РАСПРЕДЕЛЕНИЕ БЕЛКА
      'protein_distribution': {
        title: `Распредели белок равномерно`,
        reason: `${Math.round(context?.proteinDistribution?.currentProtein || mealTotals?.prot || 0)}г в этом приёме, разброс по дню ${Math.round(context?.proteinDistribution?.spread || 0)}г — лучше держать 20-40г на приём`
      },
      'protein_variety': {
        title: `Разнообразь источники белка`,
        reason: `${recShort || 'Рыба/яйца/молочка'} — разные аминокислоты`
      },

      // ═══════════════════════════════════════════════════════════════════
      // НОВЫЕ НАУЧНЫЕ ПРАВИЛА (2025-12-10)
      // ═══════════════════════════════════════════════════════════════════

      // ДОБАВКИ И ВИТАМИНЫ
      'fat_meal_vitd': {
        title: `Выпей витамин D с этим приёмом`,
        reason: `${Math.round(mealTotals?.fat || 0)}г жиров — D3 усвоится на 32% лучше`
      },
      'evening_magnesium': {
        title: `Хорошее время для магния`,
        reason: `Вечер — Mg расслабит мышцы и улучшит сон`
      },
      'omega3_with_fat': {
        title: `Отличное время для Омега-3`,
        reason: `С ${Math.round(mealTotals?.fat || 0)}г жиров усвоится в 3× лучше`
      },
      'protein_creatine_timing': {
        title: `Идеальное время для креатина`,
        reason: `${Math.round(mealTotals?.prot || 0)}г белка + тренировка — усвоение +60%`
      },

      // КОНФЛИКТЫ
      'calcium_iron_conflict': {
        title: `⚠️ Кальций + железо — конфликт!`,
        reason: `В ${mainProduct} оба минерала — кальций снизит усвоение Fe на 50%`
      },
      'coffee_calcium_timing': {
        title: `Кофе + молочка — подожди 2 часа`,
        reason: `Кофеин вымывает кальций — 6мг Ca на 100мг кофеина`
      },
      'green_tea_iron': {
        title: `Зелёный чай блокирует железо`,
        reason: `Танины снижают Fe на 70% — пей через 1ч после ${mainProduct}`
      },

      // ВРЕМЯ СУТОК
      'iron_morning_best': {
        title: `Утро — лучшее время для железа`,
        reason: `Гепсидин минимален — Fe из ${mainProduct} усвоится максимально`
      },
      'late_night_fat': {
        title: `Много жиров перед сном`,
        reason: `${Math.round(mealTotals?.fat || 0)}г — замедлит пищеварение на 2-4ч`
      },
      'morning_cortisol': {
        title: `Утром меньше сахара`,
        reason: `${Math.round(mealTotals?.simple || 0)}г простых + кортизол = инсулиновые качели`
      },

      // СИНЕРГИИ МИКРОНУТРИЕНТОВ
      'magnesium_b6': {
        title: `Магний + B6 — синергия`,
        reason: `${recShort || 'Курица/банан'} — B6 усилит усвоение Mg на 20%`
      },
      'spinach_lemon': {
        title: `Добавь лимон к шпинату`,
        reason: `Витамин C нейтрализует оксалаты — железо усвоится`
      },
      'berries_fat': {
        title: `К ягодам — жиры`,
        reason: `${recShort || 'Сливки/сметана'} — антоцианы усвоятся лучше`
      },

      // СПЕЦИФИЧНЫЕ ПРОДУКТЫ
      'tryptophan_carbs': {
        title: `Триптофан + углеводы = мелатонин`,
        reason: `${mainProduct} + ${Math.round(mealTotals?.carbs || 0)}г углеводов — отлично для сна`
      },
      'collagen_sleep': {
        title: `Коллаген вечером — отлично!`,
        reason: `Глицин в коллагене улучшает качество сна`
      },
      'eggs_morning_brain': {
        title: `Холин на завтрак — для мозга`,
        reason: `Яйца → ацетилхолин → память и фокус весь день`
      },
      'avocado_salad': {
        title: `Идеальная комбинация!`,
        reason: `Жиры авокадо ×4 усвоение каротиноидов из овощей`
      },

      // ПРЕДУПРЕЖДЕНИЯ
      'zinc_empty_stomach': {
        title: `Цинк с едой, не натощак`,
        reason: `${Math.round(mealTotals?.kcal || 0)} ккал — маловато, Zn может вызвать тошноту`
      },
      'liver_vita_excess': {
        title: `Печень 1-2 раза в неделю`,
        reason: `Избыток витамина A токсичен при постоянном употреблении`
      },

      // INFO
      'nuts_soaking': {
        title: `Замачивание орехов улучшает усвоение`,
        reason: `8-12ч в воде — фитаты снижаются, минералы доступнее`
      },
      'probiotic_empty': {
        title: `Пробиотики лучше натощак`,
        reason: `Или через 2ч после еды — желудочный сок убивает бактерии`
      },
      'vitc_with_meal': {
        title: `Витамин C лучше с едой`,
        reason: `Аскорбиновая кислота — снизится раздражение желудка`
      }
    };

    // Получаем контекстный шаблон или используем оригинал
    const template = contextTemplates[rule.id];

    if (template) {
      return {
        title: template.title,
        reason: template.reason
      };
    }

    // Fallback — оригинальные тексты с подстановкой переменных
    let title = rule.title || '';
    let reason = rule.reason || '';

    // Подстановка переменных
    reason = reason.replace('{protPct}', Math.round((mealTotals?.prot || 0) * 4 / (mealTotals?.kcal || 1) * 100));
    reason = reason.replace('{fiber}', Math.round(mealTotals?.fiber || 0));
    reason = reason.replace('{simplePct}', Math.round((mealTotals?.simple || 0) / (mealTotals?.carbs || 1) * 100));

    return { title, reason };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN API — getMealOptimization
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Получить рекомендации для приёма пищи
   * @param {Object} params
   * @param {Object} params.meal - Приём пищи { items: [...], time: 'HH:MM' }
   * @param {Object} params.mealTotals - Суммы нутриентов { kcal, prot, carbs, ... }
   * @param {Object} params.dayData - Данные дня { dayTot, trainings, waterMl, ... }
   * @param {Object} params.profile - Профиль { age, gender, ... }
   * @param {Array} params.products - Массив продуктов из базы
   * @param {Object} params.pIndex - Индекс продуктов
   * @returns {Array} Массив рекомендаций
   */
  function getMealOptimization(params) {
    const { meal, mealTotals, dayData, profile, products, pIndex, avgGI } = params;

    if (!meal?.items || meal.items.length === 0) return [];

    // Собираем нутриенты и категории из всех продуктов в приёме
    const mealNutrients = new Set();
    const mealCategories = new Set();

    for (const item of meal.items) {
      const name = item.name || '';

      // Нутриенты
      const nutrients = detectNutrients(name);
      nutrients.forEach(n => mealNutrients.add(n));

      // Категории
      const cats = detectCategories({ name });
      cats.forEach(c => mealCategories.add(c));
    }

    const context = {
      meal,
      mealTotals: mealTotals || {},
      mealNutrients: Array.from(mealNutrients),
      mealCategories: Array.from(mealCategories),
      dayData: dayData || {},
      profile: profile || {},
      products: products || [],
      pIndex,
      avgGI: avgGI || 50,
      time: meal.time
    };

    const recommendations = [];

    // Проверяем все правила
    const allRules = [...SYNERGY_RULES, ...BALANCE_RULES, ...TIMING_RULES];

    for (const rule of allRules) {
      if (checkTrigger(rule.trigger, context)) {
        // Сначала находим продукты для рекомендации
        let recProducts = [];
        if (rule.recommend && products && products.length > 0) {
          recProducts = findRecommendedProducts(
            rule.recommend,
            products,
            meal.items,
            3
          );

          // Добавляем smart portion к каждому продукту
          recProducts = recProducts.map(p => ({
            ...p,
            smartPortion: getSmartPortion(p)
          }));
        }

        // Получаем контекстные тексты
        const contextual = makeContextualRecommendation(rule, context, recProducts);

        const rec = {
          id: rule.id,
          priority: rule.priority || 50,
          icon: rule.icon,
          title: contextual.title,
          reason: contextual.reason,
          science: rule.science,
          isWarning: rule.isWarning || false,
          isInfo: rule.isInfo || false,
          mild: rule.mild || false,
          products: recProducts
        };

        recommendations.push(rec);
      }
    }

    // Сортируем по приоритету (выше = важнее)
    recommendations.sort((a, b) => b.priority - a.priority);

    // Ограничиваем количество (max 5 активных рекомендаций)
    return recommendations.slice(0, 5);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER ACTIONS TRACKING — Персонализация
  // ═══════════════════════════════════════════════════════════════════════════

  const ACTIONS_KEY = 'heys_meal_optimizer_actions';
  const MAX_ACTIONS = 1000; // Лимит записей
  const MAX_AGE_DAYS = 30; // Удаляем записи старше 30 дней

  /**
   * Записать действие пользователя
   */
  function trackUserAction(action) {
    try {
      let actions = U.lsGet ? U.lsGet(ACTIONS_KEY, []) : JSON.parse(localStorage.getItem(ACTIONS_KEY) || '[]');

      // Очистка старых записей (старше 30 дней)
      const cutoff = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
      actions = actions.filter(a => (a.timestamp || 0) > cutoff);

      actions.push({
        ...action,
        timestamp: Date.now()
      });

      // Храним последние MAX_ACTIONS действий
      const trimmed = actions.slice(-MAX_ACTIONS);

      if (U.lsSet) {
        U.lsSet(ACTIONS_KEY, trimmed);
      } else {
        localStorage.setItem(ACTIONS_KEY, JSON.stringify(trimmed));
      }
    } catch (e) {
      console.warn('[MealOptimizer] Failed to track action:', e);
    }
  }

  /**
   * Получить статистику действий для персонализации
   */
  function getActionStats() {
    try {
      const actions = U.lsGet ? U.lsGet(ACTIONS_KEY, []) : JSON.parse(localStorage.getItem(ACTIONS_KEY) || '[]');

      const stats = {
        acceptedRules: {},
        dismissedRules: {},
        addedProducts: {},
        totalAccepted: 0,
        totalDismissed: 0
      };

      for (const action of actions) {
        if (action.type === 'accept') {
          stats.acceptedRules[action.ruleId] = (stats.acceptedRules[action.ruleId] || 0) + 1;
          stats.totalAccepted++;
          if (action.productId) {
            stats.addedProducts[action.productId] = (stats.addedProducts[action.productId] || 0) + 1;
          }
        } else if (action.type === 'dismiss') {
          stats.dismissedRules[action.ruleId] = (stats.dismissedRules[action.ruleId] || 0) + 1;
          stats.totalDismissed++;
        }
      }

      return stats;
    } catch (e) {
      return { acceptedRules: {}, dismissedRules: {}, addedProducts: {}, totalAccepted: 0, totalDismissed: 0 };
    }
  }

  /**
   * Проверить, нужно ли скрыть рекомендацию (слишком часто отклоняется)
   */
  function shouldHideRecommendation(ruleId) {
    const stats = getActionStats();
    const dismissed = stats.dismissedRules[ruleId] || 0;
    const accepted = stats.acceptedRules[ruleId] || 0;

    // Если отклонено 5+ раз и принято меньше 20% — скрываем
    if (dismissed >= 5 && accepted / (dismissed + accepted) < 0.2) {
      return true;
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  HEYS.MealOptimizer = {
    // Main API
    getMealOptimization,

    // Helpers
    detectNutrients,
    detectCategories,
    getSmartPortion,
    findRecommendedProducts,

    // Tracking
    trackUserAction,
    getActionStats,
    shouldHideRecommendation,

    // Constants (for debugging/extension)
    NUTRIENT_KEYWORDS,
    RECOMMENDED_PORTIONS,
    SYNERGY_RULES,
    BALANCE_RULES,
    TIMING_RULES,

    // Version
    VERSION: '1.0.0'
  };

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
