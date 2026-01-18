// heys_harm_v1.js — Harm Score v2.0: Scientific Food Harm Assessment System
// ===========================================================================
// Научно обоснованная система оценки вредности продуктов
// 
// Факторы оценки:
// - Макронутриенты: транс-жиры, насыщенные жиры, простые сахара
// - Защитные факторы: клетчатка, белок, полезные жиры
// - Гликемический индекс (GI) и нагрузка (GL)
// - NOVA classification: степень переработки
// - Натрий (соль): риски гипертензии
// - Микронутриентная плотность (опционально)
//
// Научные источники:
// - Mozaffarian 2006 (PMID: 16611951) — транс-жиры
// - Ludwig 2002 (PMID: 12081821) — простые сахара
// - Sacks 2017 (PMID: 28620111) — насыщенные жиры
// - Brand-Miller 2003 (PMID: 12828192) — гликемический индекс
// - Weickert 2008 (PMID: 18287346) — клетчатка
// - Monteiro 2019 (PMID: 29444892) — NOVA classification
// - He & MacGregor 2011 (PMID: 21731062) — натрий и гипертензия
// ===========================================================================

; (function (global) {
    const HEYS = global.HEYS = global.HEYS || {};
    const Harm = HEYS.Harm = HEYS.Harm || {};

    // ===========================================================================
    // 🔬 SCIENTIFIC CONSTANTS
    // ===========================================================================

    /**
     * Веса факторов для расчёта Harm Score
     * Основаны на мета-анализах и рекомендациях WHO/AHA
     */
    const HARM_WEIGHTS = {
        // ❌ PENALTIES (увеличивают вред)
        trans100: 3.0,        // Транс-жиры — ГЛАВНЫЙ враг (Mozaffarian 2006)
        simple100: 0.08,      // Простые сахара (Ludwig 2002)
        badFat100: 0.10,      // Насыщенные жиры (Sacks 2017) — снижено с 0.12
        sodium100: 0.002,     // Натрий мг→harm: 2000мг = +4 балла (He 2011)

        // ✅ BONUSES (снижают вред)
        fiber100: -0.30,      // Клетчатка — мощный протектор (Weickert 2008) — усилено
        protein100: -0.06,    // Белок снижает ГИ и насыщает (Nuttall 1984)
        goodFat100: -0.04,    // MUFA/PUFA улучшают липидный профиль (Schwingshackl 2012)

        // 📊 NOVA classification penalty
        nova1: 0,             // Необработанные — без штрафа
        nova2: 0.3,           // Кулинарные ингредиенты
        nova3: 0.8,           // Переработанные
        nova4: 2.5,           // Ультрапереработанные — серьёзный штраф (Monteiro 2019)
    };

    /**
     * GI penalty thresholds (Brand-Miller 2003)
     */
    const GI_PENALTY = {
        low: { max: 35, penalty: 0 },
        medium: { max: 55, penalty: 0.5 },
        high: { max: 70, penalty: 1.0 },
        veryHigh: { max: Infinity, penalty: 1.5, progressive: 0.02 } // +0.02 за каждый пункт выше 70
    };

    /**
     * Категории Harm Score (7 уровней)
     */
    const HARM_CATEGORIES = [
        { max: 1.0, id: 'superHealthy', name: '🟢 Суперполезный', color: '#16a34a', emoji: '🟢' },
        { max: 2.5, id: 'healthy', name: '🟢 Полезный', color: '#22c55e', emoji: '🟢' },
        { max: 4.0, id: 'neutral', name: '🟡 Нейтральный', color: '#eab308', emoji: '🟡' },
        { max: 5.5, id: 'mildlyHarmful', name: '🟠 Умеренно вредный', color: '#f97316', emoji: '🟠' },
        { max: 7.0, id: 'harmful', name: '🔴 Вредный', color: '#ef4444', emoji: '🔴' },
        { max: 8.5, id: 'veryHarmful', name: '🔴 Очень вредный', color: '#dc2626', emoji: '🔴' },
        { max: 10, id: 'superHarmful', name: '⚫ Супервредный', color: '#7f1d1d', emoji: '⚫' }
    ];

    // ===========================================================================
    // 🏭 NOVA CLASSIFICATION — Эвристика по названию продукта
    // ===========================================================================
    // NOVA 1: Необработанные или минимально обработанные продукты
    // NOVA 2: Кулинарные ингредиенты (масла, сахар, соль)
    // NOVA 3: Переработанные продукты (консервы, сыры)
    // NOVA 4: Ультрапереработанные продукты (чипсы, газировка, колбаса)
    // ===========================================================================

    const NOVA_PATTERNS = {
        // NOVA 4 — Ультрапереработанные (самый строгий список)
        nova4: [
            // Снеки и фастфуд
            'чипс', 'крекер', 'сухарик', 'попкорн',
            'бургер', 'гамбургер', 'хот-дог', 'наггетс', 'нагетс',
            'пицц', 'шаурм', 'шаверм', 'фастфуд',

            // Сладости промышленные
            'конфет', 'шоколадн', 'батончик', 'сникерс', 'марс', 'твикс', 'кит-кат', 'киткат',
            'печенье', 'вафл', 'пирожн', 'торт', 'кекс', 'маффин', 'круассан', 'пончик', 'донат',
            'мороженое', 'пломбир', 'эскимо',
            'зефир', 'мармелад', 'пастил', 'халва', 'нуга',

            // Напитки сладкие
            'кола', 'cola', 'пепси', 'pepsi', 'фанта', 'fanta', 'спрайт', 'sprite',
            'газировк', 'лимонад', 'тоник', 'энергетик', 'energy', 'red bull', 'monster',
            'нектар', 'сокосодержащ',

            // Мясные изделия промышленные
            'колбас', 'сосис', 'сардельк', 'ветчин', 'бекон', 'грудинк', 'буженин',
            'пельмен', 'вареник', 'манты', 'хинкал', 'позы', 'равиол',
            'котлет', 'тефтел', 'фрикадельк', // промышленные полуфабрикаты

            // Соусы и заправки
            'майонез', 'кетчуп', 'соус готов', 'заправк',

            // Молочные ультрапереработанные
            'йогурт питьев', 'йогурт с наполнител', 'глазирован', 'сырок глазирован',
            'молочн коктейл', 'милкшейк',

            // Завтраки и снеки
            'мюсл', 'гранол', 'хлопья', 'подушечк', 'кукурузн палочк',
            'сухой завтрак', 'cereal',

            // Хлебобулочные промышленные
            'хлебц', 'тост', 'слойк', 'булк',

            // Готовые блюда
            'лапша быстр', 'доширак', 'роллтон', 'instant', 'готов блюд',
            'замороженн', 'полуфабрикат',

            // Другое
            'маргарин', 'спред', 'чизкейк',
        ],

        // NOVA 3 — Переработанные
        nova3: [
            // Консервы
            'консерв', 'консервирован', 'маринован', 'солён', 'квашен', 'копчён',
            'тушёнк', 'паштет', 'шпрот',

            // Сыры
            'сыр', 'брынз', 'фета', 'моцарелл', 'пармезан', 'чеддер',

            // Мясо/рыба обработанные
            'буженина', 'рулет', 'карбонад', 'шейка', 'балык',
            'сельдь', 'скумбри', 'форель копч', 'лосось копч',

            // Молочные
            'сметан', 'сливк', 'масло сливоч',

            // Хлеб (не ультрапереработанный)
            'хлеб', 'батон', 'лаваш', 'пита', 'лепёшк',

            // Соки
            'сок',

            // Другое
            'пюре', 'варень', 'джем', 'повидл', 'мёд',
        ],

        // NOVA 2 — Кулинарные ингредиенты
        nova2: [
            'масло растител', 'масло подсолнеч', 'масло оливк', 'масло кукуруз', 'масло рапсов',
            'масло кокос', 'масло пальм', 'масло льнян', 'масло кунжут',
            'сахар', 'соль', 'мука', 'крахмал', 'дрожж',
            'уксус', 'желатин', 'агар',
        ],

        // NOVA 1 определяется по умолчанию, если не подошли другие категории
        // + явные паттерны для надёжности
        nova1: [
            // Свежие овощи
            'огурец', 'помидор', 'томат', 'морков', 'картоф', 'капуст', 'брокколи',
            'перец', 'лук ', 'чеснок', 'свёкл', 'редис', 'кабачок', 'баклажан',
            'тыкв', 'салат', 'шпинат', 'руккол', 'укроп', 'петрушк', 'базилик',
            'сельдер', 'фенхел', 'спарж', 'горох свеж', 'фасоль свеж',

            // Свежие фрукты и ягоды
            'яблок', 'груш', 'банан', 'апельсин', 'мандарин', 'лимон', 'грейпфрут',
            'виноград', 'персик', 'абрикос', 'слив', 'вишн', 'черешн', 'клубник',
            'малин', 'ежевик', 'голубик', 'черник', 'смородин', 'крыжовник',
            'арбуз', 'дын', 'манго', 'ананас', 'киви', 'гранат', 'хурм', 'инжир',
            'авокадо', 'кокос',

            // Мясо свежее
            'говядин', 'свинин', 'баранин', 'телятин', 'кролик', 'оленин',
            'курин', 'куриц', 'индейк', 'утк', 'гус',
            'филе', 'грудк', 'бедр', 'голен', 'крыл',

            // Рыба и морепродукты свежие
            'лосось', 'сёмг', 'форель', 'тунец', 'треск', 'камбал', 'палтус',
            'скумбри свеж', 'сельдь свеж', 'дорадо', 'сибас', 'окунь', 'судак', 'щук',
            'креветк', 'мидии', 'устриц', 'кальмар', 'осьминог', 'краб',

            // Молочные базовые
            'молоко', 'кефир', 'ряженк', 'простокваш', 'йогурт натур', 'творог',
            'яйц',

            // Крупы и бобовые
            'рис ', 'гречк', 'овёс', 'овсянк', 'пшен', 'перловк', 'ячнев', 'кукуруз',
            'булгур', 'кус-кус', 'киноа', 'полба',
            'чечевиц', 'нут', 'фасоль сух', 'горох сух', 'соя',

            // Орехи и семена
            'грецк', 'миндал', 'фундук', 'кешью', 'фисташк', 'арахис', 'пекан', 'макадам',
            'семечк', 'кунжут', 'лён', 'чиа', 'тыквен семен',

            // Сухофрукты
            'изюм', 'курага', 'чернослив', 'финик', 'инжир сушён',
        ]
    };

    // Отрицательные паттерны — понижают NOVA если встречаются
    const NOVA_NEGATIVE_PATTERNS = {
        // Слова, указывающие на свежесть/натуральность
        fresh: ['свеж', 'сыр', 'натурал', 'домашн', 'фермер', 'органик', 'био'],
        // Слова, указывающие на переработку
        processed: ['готов', 'быстр', 'instant', 'полуфабрикат', 'заморож', 'порошк']
    };

    /**
     * Определить NOVA группу продукта по названию (эвристика)
     * @param {string} productName - Название продукта
     * @returns {number} - NOVA группа (1-4)
     */
    function detectNovaGroup(productName) {
        if (!productName) return 2; // Default: кулинарный ингредиент

        const name = productName.toLowerCase().trim();

        // Проверяем NOVA 4 (ультрапереработанные) — самый строгий
        for (const pattern of NOVA_PATTERNS.nova4) {
            if (name.includes(pattern)) return 4;
        }

        // Проверяем NOVA 1 (необработанные) — высший приоритет над 2,3
        for (const pattern of NOVA_PATTERNS.nova1) {
            if (name.includes(pattern)) {
                // Но проверяем negative patterns (готовые блюда из свежего)
                const hasProcessed = NOVA_NEGATIVE_PATTERNS.processed.some(p => name.includes(p));
                if (hasProcessed) return 3; // Переработанные
                return 1; // Необработанные
            }
        }

        // Проверяем NOVA 3 (переработанные)
        for (const pattern of NOVA_PATTERNS.nova3) {
            if (name.includes(pattern)) return 3;
        }

        // Проверяем NOVA 2 (кулинарные ингредиенты)
        for (const pattern of NOVA_PATTERNS.nova2) {
            if (name.includes(pattern)) return 2;
        }

        // По умолчанию — NOVA 2 (неизвестный продукт)
        return 2;
    }

    // ===========================================================================
    // 📊 HARM SCORE CALCULATION
    // ===========================================================================

    /**
     * Рассчитать GI penalty
     * @param {number} gi - Гликемический индекс (0-100+)
     * @returns {number} - Штраф за GI
     */
    function calculateGIPenalty(gi) {
        if (!gi || gi <= 0) return 0;

        if (gi <= GI_PENALTY.low.max) return GI_PENALTY.low.penalty;
        if (gi <= GI_PENALTY.medium.max) return GI_PENALTY.medium.penalty;
        if (gi <= GI_PENALTY.high.max) return GI_PENALTY.high.penalty;

        // veryHigh: базовый штраф + прогрессивный
        return GI_PENALTY.veryHigh.penalty + (gi - 70) * GI_PENALTY.veryHigh.progressive;
    }

    /**
     * Рассчитать Harm Score для продукта
     * 
     * @param {Object} product - Объект продукта с нутриентами на 100г
     * @param {Object} [options] - Опции расчёта
     * @param {number} [options.activityMultiplier=1.0] - Множитель активности (0.5-1.0)
     * @param {boolean} [options.includeNova=true] - Учитывать NOVA classification
     * @param {boolean} [options.debug=false] - Вернуть детализацию расчёта
     * @returns {number|Object} - Harm Score (0-10) или объект с деталями
     */
    function calculateHarmScore(product, options = {}) {
        if (!product) return options.debug ? { score: 5, error: 'No product' } : 5;

        const {
            activityMultiplier = 1.0,
            includeNova = true,
            debug = false
        } = options;

        // Извлекаем нутриенты с fallback'ами
        const trans = Number(product.trans100) || 0;
        const simple = Number(product.simple100) || 0;
        const badFat = Number(product.badFat100) || Number(product.badfat100) || 0;
        const sodium = Number(product.sodium100) || 0;
        const fiber = Number(product.fiber100) || 0;
        const protein = Number(product.protein100) || 0;
        const goodFat = Number(product.goodFat100) || Number(product.goodfat100) || 0;
        const gi = Number(product.gi) || Number(product.gi100) || Number(product.GI) || 0;

        // NOVA группа (детект по названию если не задана явно)
        const novaGroup = product.novaGroup || (includeNova ? detectNovaGroup(product.name) : 1);

        // === РАСЧЁТ PENALTIES ===
        const penalties = {
            trans: trans * HARM_WEIGHTS.trans100,
            simple: simple * HARM_WEIGHTS.simple100,
            badFat: badFat * HARM_WEIGHTS.badFat100,
            sodium: sodium * HARM_WEIGHTS.sodium100,
            gi: calculateGIPenalty(gi),
            nova: includeNova ? HARM_WEIGHTS[`nova${novaGroup}`] || 0 : 0
        };
        const totalPenalties = Object.values(penalties).reduce((s, v) => s + v, 0);

        // === РАСЧЁТ BONUSES ===
        const bonuses = {
            fiber: Math.abs(fiber * HARM_WEIGHTS.fiber100),
            protein: Math.abs(protein * HARM_WEIGHTS.protein100),
            goodFat: Math.abs(goodFat * HARM_WEIGHTS.goodFat100)
        };
        const totalBonuses = Object.values(bonuses).reduce((s, v) => s + v, 0);

        // === ИТОГОВЫЙ SCORE ===
        let rawScore = totalPenalties - totalBonuses;

        // Применяем множитель активности (снижает вред при тренировках)
        rawScore *= activityMultiplier;

        // Clamp to 0-10
        const score = Math.max(0, Math.min(10, rawScore));
        const roundedScore = Math.round(score * 10) / 10;

        if (debug) {
            return {
                score: roundedScore,
                rawScore,
                penalties,
                bonuses,
                totalPenalties,
                totalBonuses,
                novaGroup,
                activityMultiplier,
                inputs: { trans, simple, badFat, sodium, fiber, protein, goodFat, gi }
            };
        }

        return roundedScore;
    }

    /**
     * Получить категорию Harm Score
     * @param {number} harm - Harm Score (0-10)
     * @returns {Object} - { id, name, color, emoji }
     */
    function getHarmCategory(harm) {
        if (harm == null || isNaN(harm)) {
            return { id: 'unknown', name: '❓ Неизвестно', color: '#6b7280', emoji: '❓' };
        }

        for (const cat of HARM_CATEGORIES) {
            if (harm <= cat.max) {
                return { id: cat.id, name: cat.name, color: cat.color, emoji: cat.emoji };
            }
        }

        // Fallback: супервредный
        return HARM_CATEGORIES[HARM_CATEGORIES.length - 1];
    }

    /**
     * Получить цвет для Harm Score (gradient)
     * @param {number} harm - Harm Score (0-10)
     * @returns {string} - Hex color
     */
    function getHarmColor(harm) {
        return getHarmCategory(harm).color;
    }

    // ===========================================================================
    // 🍽️ MEAL-LEVEL HARM CALCULATION
    // ===========================================================================

    /**
     * Рассчитать средневзвешенный Harm Score для приёма пищи
     * @param {Object} meal - Объект приёма пищи с items
     * @param {Object} productIndex - Индекс продуктов {byId, byName}
     * @param {Function} getProductFromItem - Функция получения продукта из item
     * @param {Object} [activityContext] - Контекст тренировки {harmMultiplier}
     * @returns {Object} - { harm, category, breakdown }
     */
    function calculateMealHarm(meal, productIndex, getProductFromItem, activityContext = null) {
        if (!meal || !Array.isArray(meal.items) || meal.items.length === 0) {
            return { harm: 0, category: getHarmCategory(0), breakdown: [] };
        }

        const harmMultiplier = activityContext?.harmMultiplier || 1.0;
        let harmSum = 0;
        let gramSum = 0;
        const breakdown = [];

        for (const item of meal.items) {
            const product = getProductFromItem(item, productIndex);
            if (!product) continue;

            const grams = Number(item.grams) || 0;
            if (grams <= 0) continue;

            // Рассчитываем harm для продукта (или берём существующий)
            let productHarm = product.harm ?? product.harmScore ?? product.harmscore ?? product.harm100;
            if (productHarm == null) {
                productHarm = calculateHarmScore(product);
            }

            // Применяем множитель активности
            const adjustedHarm = productHarm * harmMultiplier;

            harmSum += adjustedHarm * grams;
            gramSum += grams;

            breakdown.push({
                name: product.name || item.name,
                grams,
                harm: productHarm,
                adjustedHarm,
                contribution: adjustedHarm * grams
            });
        }

        const avgHarm = gramSum > 0 ? harmSum / gramSum : 0;
        const roundedHarm = Math.round(avgHarm * 10) / 10;

        return {
            harm: roundedHarm,
            category: getHarmCategory(roundedHarm),
            breakdown,
            gramSum,
            harmMultiplier
        };
    }

    // ===========================================================================
    // 📋 EXTENDED PRODUCT MODEL — Дополнительные нутриенты
    // ===========================================================================
    // Эти поля можно добавлять к продуктам для более точной оценки.
    // AI-агент может заполнить их из USDA/FatSecret/OpenFoodFacts.
    // ===========================================================================

    /**
     * @typedef {Object} ExtendedNutrients
     * @property {number} [sodium100] - Натрий (мг на 100г) — критично для гипертензии
     * @property {number} [cholesterol100] - Холестерин (мг на 100г)
     * @property {number} [sugar100] - Добавленный сахар (г на 100г) — отличие от natural sugars
     * @property {number} [saturatedFat100] - Alias для badFat100
     * @property {number} [omega3_100] - Омега-3 (г на 100г)
     * @property {number} [omega6_100] - Омега-6 (г на 100г)
     * 
     * // Витамины (% от суточной нормы на 100г)
     * @property {number} [vitaminA] - Витамин A (%)
     * @property {number} [vitaminC] - Витамин C (%)
     * @property {number} [vitaminD] - Витамин D (%)
     * @property {number} [vitaminE] - Витамин E (%)
     * @property {number} [vitaminK] - Витамин K (%)
     * @property {number} [vitaminB1] - Тиамин (%)
     * @property {number} [vitaminB2] - Рибофлавин (%)
     * @property {number} [vitaminB3] - Ниацин (%)
     * @property {number} [vitaminB6] - Пиридоксин (%)
     * @property {number} [vitaminB9] - Фолат (%)
     * @property {number} [vitaminB12] - Кобаламин (%)
     * 
     * // Минералы (% от суточной нормы на 100г)
     * @property {number} [calcium] - Кальций (%)
     * @property {number} [iron] - Железо (%)
     * @property {number} [magnesium] - Магний (%)
     * @property {number} [phosphorus] - Фосфор (%)
     * @property {number} [potassium] - Калий (%)
     * @property {number} [zinc] - Цинк (%)
     * @property {number} [selenium] - Селен (%)
     * @property {number} [iodine] - Йод (%)
     * 
     * // NOVA и переработка
     * @property {number} [novaGroup] - NOVA классификация (1-4)
     * @property {boolean} [isUltraProcessed] - Флаг ультрапереработки
     * @property {string[]} [additives] - E-добавки
     * 
     * // Дополнительные флаги
     * @property {boolean} [isOrganic] - Органический продукт
     * @property {boolean} [isWholeGrain] - Цельнозерновой
     * @property {boolean} [isFermented] - Ферментированный
     * @property {boolean} [isRaw] - Сырой/не обработанный термически
     */

    /**
     * Рассчитать Nutrient Density Score (микронутриентная плотность)
     * Чем выше — тем больше полезных веществ на калорию
     * 
     * @param {Object} product - Продукт с витаминами/минералами
     * @returns {number} - Score 0-100
     */
    function calculateNutrientDensity(product) {
        if (!product) return 0;

        const kcal = Number(product.kcal100) || 100;
        const kcalFactor = 100 / Math.max(kcal, 1); // Нормализация на 100 ккал

        // Список ключевых микронутриентов и их веса
        const micronutrients = [
            { field: 'vitaminA', weight: 1 },
            { field: 'vitaminC', weight: 1.2 },
            { field: 'vitaminD', weight: 1.5 },
            { field: 'vitaminB12', weight: 1.3 },
            { field: 'vitaminB9', weight: 1.1 }, // Folate
            { field: 'iron', weight: 1.2 },
            { field: 'calcium', weight: 1 },
            { field: 'magnesium', weight: 1.1 },
            { field: 'potassium', weight: 0.8 },
            { field: 'zinc', weight: 1 },
            { field: 'fiber100', weight: 2, isDirect: true } // Клетчатка в граммах, не %
        ];

        let totalScore = 0;
        let totalWeight = 0;

        for (const { field, weight, isDirect } of micronutrients) {
            const value = Number(product[field]) || 0;
            if (value > 0) {
                // Для % DV — просто берём значение
                // Для прямых значений (fiber) — конвертируем в условные %
                const normalizedValue = isDirect ? value * 3 : value; // 10г клетчатки ≈ 30%
                totalScore += Math.min(normalizedValue, 100) * weight; // Cap at 100%
                totalWeight += weight;
            }
        }

        if (totalWeight === 0) return 0;

        // Нормализуем на калорийность и приводим к 0-100
        const density = (totalScore / totalWeight) * kcalFactor;
        return Math.round(Math.min(density, 100) * 10) / 10;
    }

    // ===========================================================================
    // 🔧 UTILITY FUNCTIONS
    // ===========================================================================

    /**
     * Нормализовать продукт и добавить вычисляемые поля
     * @param {Object} product - Исходный продукт
     * @returns {Object} - Продукт с harm, novaGroup и др.
     */
    function enrichProduct(product) {
        if (!product) return product;

        const enriched = { ...product };

        // Вычисляем NOVA если не задана
        if (enriched.novaGroup == null) {
            enriched.novaGroup = detectNovaGroup(enriched.name);
        }

        // Вычисляем Harm Score если не задан
        if (enriched.harm == null && enriched.harmScore == null) {
            enriched.harm = calculateHarmScore(enriched);
        }

        // Вычисляем Nutrient Density если есть микронутриенты
        if (enriched.nutrientDensity == null) {
            const density = calculateNutrientDensity(enriched);
            if (density > 0) {
                enriched.nutrientDensity = density;
            }
        }

        return enriched;
    }

    /**
     * Валидировать и исправить Harm Score для массива продуктов
     * @param {Object[]} products - Массив продуктов
     * @param {Object} [options] - Опции
     * @param {boolean} [options.recalculate=false] - Пересчитать даже если есть
     * @returns {Object} - { updated, products, stats }
     */
    function validateAndFixHarmScores(products, options = {}) {
        if (!Array.isArray(products)) return { updated: 0, products: [], stats: {} };

        const { recalculate = false } = options;
        let updated = 0;
        const stats = { total: products.length, withHarm: 0, calculated: 0, novaStats: {} };

        const fixedProducts = products.map(p => {
            if (!p) return p;

            const hasHarm = p.harm != null || p.harmScore != null;
            if (hasHarm) stats.withHarm++;

            if (recalculate || !hasHarm) {
                const enriched = enrichProduct(p);
                if (enriched.harm !== p.harm) {
                    updated++;
                    stats.calculated++;
                }

                // Считаем NOVA статистику
                const nova = enriched.novaGroup || 2;
                stats.novaStats[`nova${nova}`] = (stats.novaStats[`nova${nova}`] || 0) + 1;

                return enriched;
            }

            return p;
        });

        return { updated, products: fixedProducts, stats };
    }

    // ===========================================================================
    // 📤 EXPORTS
    // ===========================================================================

    Harm.HARM_WEIGHTS = HARM_WEIGHTS;
    Harm.GI_PENALTY = GI_PENALTY;
    Harm.HARM_CATEGORIES = HARM_CATEGORIES;
    Harm.NOVA_PATTERNS = NOVA_PATTERNS;

    Harm.detectNovaGroup = detectNovaGroup;
    Harm.calculateGIPenalty = calculateGIPenalty;
    Harm.calculateHarmScore = calculateHarmScore;
    Harm.getHarmCategory = getHarmCategory;
    Harm.getHarmColor = getHarmColor;
    Harm.calculateMealHarm = calculateMealHarm;
    Harm.calculateNutrientDensity = calculateNutrientDensity;
    Harm.enrichProduct = enrichProduct;
    Harm.validateAndFixHarmScores = validateAndFixHarmScores;

    // Для обратной совместимости — экспортируем в HEYS.products если нужно
    if (HEYS.products) {
        HEYS.products.calculateHarmScore = calculateHarmScore;
        HEYS.products.getHarmCategory = getHarmCategory;
    }

    // Verbose log disabled
    // console.log('[HEYS] Harm Score v2.0 module loaded');

})(typeof window !== 'undefined' ? window : this);
