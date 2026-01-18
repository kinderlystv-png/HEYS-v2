// heys_harm_v1.js — Harm Score v3.0: Advanced Scientific Food Harm Assessment System
// ===========================================================================
// Научно обоснованная система оценки вредности продуктов
// 
// Факторы оценки v3.0:
// - Макронутриенты: транс-жиры, насыщенные жиры, простые сахара
// - Защитные факторы: клетчатка, белок, полезные жиры
// - Гликемический индекс (GI) И нагрузка (GL) — более точная оценка
// - NOVA classification: степень переработки
// - Натрий (соль): риски гипертензии
// - Микронутриентная плотность — теперь интегрирована в формулу!
// - Omega-3/6 ratio — баланс ПНЖК для воспаления
// - Quality flags: organic, whole grain, fermented, raw
// - E-добавки (additives) — штраф за вредные E-коды
// - Goal-based personalization — адаптация под цель пользователя
//
// Научные источники:
// - Mozaffarian 2006 (PMID: 16611951) — транс-жиры
// - Ludwig 2002 (PMID: 12081821) — простые сахара
// - Sacks 2017 (PMID: 28620111) — насыщенные жиры
// - Brand-Miller 2003 (PMID: 12828192) — гликемический индекс
// - Weickert 2008 (PMID: 18287346) — клетчатка
// - Monteiro 2019 (PMID: 29444892) — NOVA classification
// - He & MacGregor 2011 (PMID: 21731062) — натрий и гипертензия
// - Simopoulos 2002 (PMID: 12442909) — omega-3/6 ratio
// - Chassaing 2015 (PMID: 25731162) — пищевые добавки и воспаление
// - Drewnowski 2005 (PMID: 16002828) — nutrient density
// - Smith-Spangler 2012 (PMID: 22944875) — органические продукты
// - Aune 2016 (PMID: 27301975) — цельнозерновые и здоровье
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
     * 🆕 v3.0: Glycemic Load (GL) thresholds — более точная оценка чем GI
     * GL = (GI × carbs per serving) / 100
     * Simopoulos 2002, Brand-Miller 2003
     */
    const GL_PENALTY = {
        low: { max: 10, penalty: 0 },        // Низкая GL
        medium: { max: 20, penalty: 0.3 },   // Средняя GL
        high: { max: 30, penalty: 0.6 },     // Высокая GL
        veryHigh: { max: Infinity, penalty: 1.0, progressive: 0.02 } // Очень высокая
    };

    /**
     * 🆕 v3.0: Omega-3/6 ratio penalty (Simopoulos 2002)
     * Оптимальное соотношение omega-6:omega-3 = 1:1 до 4:1
     * Типичная западная диета = 15-20:1 (провоспалительная)
     */
    const OMEGA_RATIO_PENALTY = {
        optimal: { maxRatio: 4, penalty: 0 },     // Оптимум ≤4:1
        acceptable: { maxRatio: 10, penalty: 0.3 }, // Приемлемо 4-10:1
        harmful: { maxRatio: 20, penalty: 0.8 },   // Вредно 10-20:1
        veryHarmful: { maxRatio: Infinity, penalty: 1.5 } // Очень вредно >20:1
    };

    /**
     * 🆕 v3.0: Quality flags bonuses (Smith-Spangler 2012, Aune 2016)
     * Флаги качества продукта снижают harm
     */
    const QUALITY_BONUSES = {
        isOrganic: -0.3,       // Органический — меньше пестицидов
        isWholeGrain: -0.5,    // Цельнозерновой — больше клетчатки и нутриентов
        isFermented: -0.5,     // Ферментированный — пробиотики, улучшенная биодоступность
        isRaw: -0.3,           // Сырой — сохранены ферменты и витамины
        isGrassFed: -0.2,      // Животные на выпасе — лучший omega-3 профиль
        isWildCaught: -0.2,    // Дикая рыба — лучше чем фермерская
    };

    /**
     * 🆕 v3.0: Harmful additives blacklist (Chassaing 2015, PMID: 25731162)
     * E-добавки которые увеличивают harm score
     */
    const HARMFUL_ADDITIVES = {
        // Критически вредные (+0.5 каждый)
        critical: [
            'E621', 'E627', 'E631', // Усилители вкуса (MSG family) — нейротоксичность
            'E951', 'E950', 'E952', // Искусственные подсластители — микробиом
            'E320', 'E321',         // BHA/BHT — возможные канцерогены
            'E249', 'E250', 'E251', 'E252', // Нитраты/нитриты — канцерогены в переработанном мясе
        ],
        // Умеренно вредные (+0.3 каждый)
        moderate: [
            'E102', 'E110', 'E122', 'E124', 'E129', // Азокрасители — гиперактивность у детей
            'E211', 'E212', 'E213', // Бензоаты — аллергии
            'E338', 'E339', 'E340', 'E341', // Фосфаты — риски для почек
            'E407',                  // Каррагинан — воспаление ЖКТ
        ],
        // Слабо вредные (+0.1 каждый)
        mild: [
            'E471', 'E472', // Эмульгаторы — могут нарушать микробиом
            'E300', 'E301', 'E302', // Аскорбаты — в целом безопасны, но синтетические
        ]
    };

    /**
     * 🆕 v3.0: Nutrient Density integration weights
     * Drewnowski 2005 — пустые калории увеличивают harm
     */
    const NUTRIENT_DENSITY_WEIGHT = -0.015; // Высокая плотность снижает harm

    /**
     * 🆕 v3.0: Goal-based weight modifiers
     * Персонализация под цель пользователя
     */
    const GOAL_MODIFIERS = {
        weightLoss: {
            simple100: 1.3,    // Штраф за сахар выше
            badFat100: 1.2,    // Штраф за жиры выше
            fiber100: 1.2,     // Бонус за клетчатку выше (сытость)
            gl: 1.3,           // Штраф за GL выше
        },
        muscleGain: {
            protein100: 1.5,   // Бонус за белок выше
            simple100: 0.7,    // Штраф за сахар ниже (энергия для тренировок)
            badFat100: 0.8,    // Штраф за жиры ниже
        },
        health: {
            nova: 1.5,         // Штраф за переработку выше
            omega: 1.3,        // Штраф за плохой omega ratio выше
            additives: 1.5,    // Штраф за добавки выше
            nutrientDensity: 1.3, // Бонус за плотность выше
        },
        default: {}            // Без модификаций
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
     * 🆕 v3.0: Рассчитать GL penalty
     * GL (Glycemic Load) = GI × carbs / 100
     * Более точный показатель реального гликемического воздействия
     */
    function calculateGLPenalty(gi, carbs100) {
        if (!gi || !carbs100 || gi <= 0 || carbs100 <= 0) return 0;

        const gl = (gi * carbs100) / 100;

        if (gl <= GL_PENALTY.low.max) return GL_PENALTY.low.penalty;
        if (gl <= GL_PENALTY.medium.max) return GL_PENALTY.medium.penalty;
        if (gl <= GL_PENALTY.high.max) return GL_PENALTY.high.penalty;

        // veryHigh: базовый штраф + прогрессивный
        return GL_PENALTY.veryHigh.penalty + (gl - 30) * GL_PENALTY.veryHigh.progressive;
    }

    /**
     * 🆕 v3.0: Рассчитать Omega-3/6 ratio penalty
     * Оптимум: omega-6:omega-3 ≤ 4:1 (Simopoulos 2002)
     */
    function calculateOmegaRatioPenalty(omega3, omega6) {
        if (!omega3 || omega3 <= 0) return 0; // Нет данных — без штрафа
        if (!omega6 || omega6 <= 0) return 0;

        const ratio = omega6 / omega3;

        if (ratio <= OMEGA_RATIO_PENALTY.optimal.maxRatio) return OMEGA_RATIO_PENALTY.optimal.penalty;
        if (ratio <= OMEGA_RATIO_PENALTY.acceptable.maxRatio) return OMEGA_RATIO_PENALTY.acceptable.penalty;
        if (ratio <= OMEGA_RATIO_PENALTY.harmful.maxRatio) return OMEGA_RATIO_PENALTY.harmful.penalty;

        return OMEGA_RATIO_PENALTY.veryHarmful.penalty;
    }

    /**
     * 🆕 v3.0: Рассчитать штраф за вредные E-добавки
     * Chassaing 2015 — добавки нарушают микробиом
     */
    function calculateAdditivesPenalty(additives) {
        if (!additives || !Array.isArray(additives) || additives.length === 0) return 0;

        let penalty = 0;
        const normalizedAdditives = additives.map(a => a.toString().toUpperCase().trim());

        for (const additive of normalizedAdditives) {
            if (HARMFUL_ADDITIVES.critical.includes(additive)) {
                penalty += 0.5;
            } else if (HARMFUL_ADDITIVES.moderate.includes(additive)) {
                penalty += 0.3;
            } else if (HARMFUL_ADDITIVES.mild.includes(additive)) {
                penalty += 0.1;
            }
        }

        return Math.min(penalty, 3.0); // Cap at 3.0
    }

    /**
     * 🆕 v3.0: Рассчитать бонусы за флаги качества
     * Smith-Spangler 2012, Aune 2016
     */
    function calculateQualityBonus(product) {
        let bonus = 0;

        for (const [flag, value] of Object.entries(QUALITY_BONUSES)) {
            if (product[flag] === true) {
                bonus += value; // value уже отрицательный
            }
        }

        return bonus; // Отрицательное число (снижает harm)
    }

    /**
     * Рассчитать Harm Score для продукта v3.0
     * 
     * @param {Object} product - Объект продукта с нутриентами на 100г
     * @param {Object} [options] - Опции расчёта
     * @param {number} [options.activityMultiplier=1.0] - Множитель активности (0.5-1.0)
     * @param {boolean} [options.includeNova=true] - Учитывать NOVA classification
     * @param {boolean} [options.includeGL=true] - 🆕 Учитывать Glycemic Load
     * @param {boolean} [options.includeOmega=true] - 🆕 Учитывать Omega ratio
     * @param {boolean} [options.includeAdditives=true] - 🆕 Учитывать E-добавки
     * @param {boolean} [options.includeQuality=true] - 🆕 Учитывать флаги качества
     * @param {boolean} [options.includeNutrientDensity=true] - 🆕 Учитывать микронутриентную плотность
     * @param {string} [options.goal='default'] - 🆕 Цель: weightLoss, muscleGain, health, default
     * @param {boolean} [options.debug=false] - Вернуть детализацию расчёта
     * @returns {number|Object} - Harm Score (0-10) или объект с деталями
     */
    function calculateHarmScore(product, options = {}) {
        if (!product) return options.debug ? { score: 5, error: 'No product' } : 5;

        const {
            activityMultiplier = 1.0,
            includeNova = true,
            includeGL = true,
            includeOmega = true,
            includeAdditives = true,
            includeQuality = true,
            includeNutrientDensity = true,
            goal = 'default',
            debug = false
        } = options;

        // Получаем модификаторы для цели
        const goalMod = GOAL_MODIFIERS[goal] || GOAL_MODIFIERS.default;

        // Извлекаем нутриенты с fallback'ами
        const trans = Number(product.trans100) || 0;
        const simple = Number(product.simple100) || 0;
        const badFat = Number(product.badFat100) || Number(product.badfat100) || 0;
        const sodium = Number(product.sodium100) || 0;
        const fiber = Number(product.fiber100) || 0;
        const protein = Number(product.protein100) || 0;
        const goodFat = Number(product.goodFat100) || Number(product.goodfat100) || 0;
        const gi = Number(product.gi) || Number(product.gi100) || Number(product.GI) || 0;
        const carbs = Number(product.carbs100) || (Number(product.simple100) || 0) + (Number(product.complex100) || 0);

        // 🆕 v3.0: Новые нутриенты
        const omega3 = Number(product.omega3_100) || 0;
        const omega6 = Number(product.omega6_100) || 0;
        const additives = product.additives || [];

        // NOVA группа (детект по названию если не задана явно)
        const novaGroup = product.novaGroup || (includeNova ? detectNovaGroup(product.name) : 1);

        // === РАСЧЁТ PENALTIES ===
        const penalties = {
            trans: trans * HARM_WEIGHTS.trans100,
            simple: simple * HARM_WEIGHTS.simple100 * (goalMod.simple100 || 1),
            badFat: badFat * HARM_WEIGHTS.badFat100 * (goalMod.badFat100 || 1),
            sodium: sodium * HARM_WEIGHTS.sodium100,
            gi: calculateGIPenalty(gi),
            nova: includeNova ? (HARM_WEIGHTS[`nova${novaGroup}`] || 0) * (goalMod.nova || 1) : 0,
            // 🆕 v3.0: Новые штрафы
            gl: includeGL ? calculateGLPenalty(gi, carbs) * (goalMod.gl || 1) : 0,
            omega: includeOmega ? calculateOmegaRatioPenalty(omega3, omega6) * (goalMod.omega || 1) : 0,
            additives: includeAdditives ? calculateAdditivesPenalty(additives) * (goalMod.additives || 1) : 0
        };
        const totalPenalties = Object.values(penalties).reduce((s, v) => s + v, 0);

        // === РАСЧЁТ BONUSES ===
        const bonuses = {
            fiber: Math.abs(fiber * HARM_WEIGHTS.fiber100 * (goalMod.fiber100 || 1)),
            protein: Math.abs(protein * HARM_WEIGHTS.protein100 * (goalMod.protein100 || 1)),
            goodFat: Math.abs(goodFat * HARM_WEIGHTS.goodFat100),
            // 🆕 v3.0: Новые бонусы
            quality: includeQuality ? Math.abs(calculateQualityBonus(product)) : 0,
            nutrientDensity: 0 // Рассчитаем ниже
        };

        // 🆕 v3.0: Nutrient Density bonus (Drewnowski 2005)
        if (includeNutrientDensity) {
            const density = calculateNutrientDensity(product);
            if (density > 0) {
                // Высокая плотность (>50) даёт бонус до -0.75
                bonuses.nutrientDensity = Math.abs(density * NUTRIENT_DENSITY_WEIGHT * (goalMod.nutrientDensity || 1));
            }
        }

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
                version: '3.0',
                rawScore,
                penalties,
                bonuses,
                totalPenalties,
                totalBonuses,
                novaGroup,
                activityMultiplier,
                goal,
                goalModifiers: goalMod,
                inputs: {
                    trans, simple, badFat, sodium, fiber, protein, goodFat, gi, carbs,
                    omega3, omega6, additives: additives.length,
                    qualityFlags: Object.keys(QUALITY_BONUSES).filter(k => product[k])
                }
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

    /**
     * Получить детальную расшифровку расчёта Harm Score v3.0
     * Используется для UI с объяснением формулы пользователю
     * СИНХРОНИЗИРОВАНО с calculateHarmScore v3.0!
     * 
     * @param {Object} product - Объект продукта
     * @param {Object} [options] - Опции (те же что у calculateHarmScore)
     * @returns {Object} - Структурированная расшифровка
     */
    function getHarmBreakdown(product, options = {}) {
        if (!product) return null;

        const {
            includeNova = true,
            includeGL = true,
            includeOmega = true,
            includeAdditives = true,
            includeQuality = true,
            includeNutrientDensity = true,
            goal = 'default'
        } = options;

        // Получаем модификаторы для цели
        const goalMod = GOAL_MODIFIERS[goal] || GOAL_MODIFIERS.default;

        // Извлекаем нутриенты (те же что в calculateHarmScore)
        const trans = Number(product.trans100) || 0;
        const simple = Number(product.simple100) || 0;
        const badFat = Number(product.badFat100) || Number(product.badfat100) || 0;
        const sodium = Number(product.sodium100) || 0;
        const fiber = Number(product.fiber100) || 0;
        const protein = Number(product.protein100) || 0;
        const goodFat = Number(product.goodFat100) || Number(product.goodfat100) || 0;
        const gi = Number(product.gi) || Number(product.gi100) || Number(product.GI) || 0;
        const carbs = Number(product.carbs100) || (Number(product.simple100) || 0) + (Number(product.complex100) || 0);

        // 🆕 v3.0: Новые нутриенты
        const omega3 = Number(product.omega3_100) || 0;
        const omega6 = Number(product.omega6_100) || 0;
        const additives = product.additives || [];

        const novaGroup = product.novaGroup || (includeNova ? detectNovaGroup(product.name) : 1);

        // Рассчитываем каждый компонент (синхронизировано с calculateHarmScore)
        const giPenalty = calculateGIPenalty(gi);
        const novaPenalty = includeNova ? (HARM_WEIGHTS[`nova${novaGroup}`] || 0) * (goalMod.nova || 1) : 0;
        const glPenalty = includeGL ? calculateGLPenalty(gi, carbs) * (goalMod.gl || 1) : 0;
        const omegaPenalty = includeOmega ? calculateOmegaRatioPenalty(omega3, omega6) * (goalMod.omega || 1) : 0;
        const additivesPenalty = includeAdditives ? calculateAdditivesPenalty(additives) * (goalMod.additives || 1) : 0;
        const qualityBonus = includeQuality ? Math.abs(calculateQualityBonus(product)) : 0;

        // Nutrient Density bonus
        let nutrientDensityBonus = 0;
        if (includeNutrientDensity) {
            const density = calculateNutrientDensity(product);
            if (density > 0) {
                nutrientDensityBonus = Math.abs(density * NUTRIENT_DENSITY_WEIGHT * (goalMod.nutrientDensity || 1));
            }
        }

        // === PENALTIES ===
        const penalties = [
            { id: 'trans', label: 'Транс-жиры', value: trans, weight: HARM_WEIGHTS.trans100, contribution: trans * HARM_WEIGHTS.trans100, unit: 'г', icon: '⚠️', desc: '×3.0 — самые вредные жиры' },
            { id: 'simple', label: 'Простые сахара', value: simple, weight: HARM_WEIGHTS.simple100, contribution: simple * HARM_WEIGHTS.simple100 * (goalMod.simple100 || 1), unit: 'г', icon: '🍬', desc: '×0.08 — быстрые углеводы' },
            { id: 'badFat', label: 'Насыщенные жиры', value: badFat, weight: HARM_WEIGHTS.badFat100, contribution: badFat * HARM_WEIGHTS.badFat100 * (goalMod.badFat100 || 1), unit: 'г', icon: '🧈', desc: '×0.10 — повышают LDL' },
            { id: 'sodium', label: 'Натрий', value: sodium, weight: HARM_WEIGHTS.sodium100, contribution: sodium * HARM_WEIGHTS.sodium100, unit: 'мг', icon: '🧂', desc: '×0.002 — риск гипертензии' },
            { id: 'gi', label: 'Гликемический индекс', value: gi, weight: null, contribution: giPenalty, unit: '', icon: '📈', desc: gi > 70 ? 'Высокий ГИ — прогрессивный штраф' : gi > 55 ? 'Средний ГИ' : 'Низкий ГИ — без штрафа' },
            { id: 'nova', label: `NOVA ${novaGroup}`, value: novaGroup, weight: null, contribution: novaPenalty, unit: '', icon: '🏭', desc: novaGroup === 4 ? 'Ультрапереработанный' : novaGroup === 3 ? 'Переработанный' : novaGroup === 2 ? 'Ингредиент' : 'Необработанный' },
            // 🆕 v3.0: Новые штрафы
            { id: 'gl', label: 'Гликемическая нагрузка', value: carbs > 0 ? Math.round((gi * carbs) / 100 * 10) / 10 : 0, weight: null, contribution: glPenalty, unit: '', icon: '📊', desc: 'GL = GI × углеводы / 100' },
            { id: 'omega', label: 'Соотношение Omega-6/3', value: omega3 > 0 ? Math.round(omega6 / omega3 * 10) / 10 : 0, weight: null, contribution: omegaPenalty, unit: ':1', icon: '🐟', desc: 'Оптимум ≤4:1' },
            { id: 'additives', label: 'E-добавки', value: additives.length, weight: null, contribution: additivesPenalty, unit: 'шт', icon: '🧪', desc: 'Вредные пищевые добавки' }
        ].filter(p => p.contribution > 0.01); // Показываем только значимые

        // === BONUSES ===
        const bonuses = [
            { id: 'fiber', label: 'Клетчатка', value: fiber, weight: Math.abs(HARM_WEIGHTS.fiber100), contribution: Math.abs(fiber * HARM_WEIGHTS.fiber100 * (goalMod.fiber100 || 1)), unit: 'г', icon: '🥬', desc: '×0.30 — замедляет всасывание' },
            { id: 'protein', label: 'Белок', value: protein, weight: Math.abs(HARM_WEIGHTS.protein100), contribution: Math.abs(protein * HARM_WEIGHTS.protein100 * (goalMod.protein100 || 1)), unit: 'г', icon: '🥩', desc: '×0.06 — снижает ГИ' },
            { id: 'goodFat', label: 'Полезные жиры', value: goodFat, weight: Math.abs(HARM_WEIGHTS.goodFat100), contribution: Math.abs(goodFat * HARM_WEIGHTS.goodFat100), unit: 'г', icon: '🥑', desc: '×0.04 — MUFA/PUFA' },
            // 🆕 v3.0: Новые бонусы
            { id: 'quality', label: 'Качество', value: null, weight: null, contribution: qualityBonus, unit: '', icon: '🌿', desc: 'Органик/цельнозерн./ферментир.' },
            { id: 'nutrientDensity', label: 'Плотность нутриентов', value: null, weight: null, contribution: nutrientDensityBonus, unit: '', icon: '💎', desc: 'Drewnowski 2005' }
        ].filter(b => b.contribution > 0.01); // Показываем только значимые

        const totalPenalties = penalties.reduce((s, p) => s + p.contribution, 0);
        const totalBonuses = bonuses.reduce((s, b) => s + b.contribution, 0);
        const rawScore = totalPenalties - totalBonuses;
        const score = Math.max(0, Math.min(10, rawScore));
        const roundedScore = Math.round(score * 10) / 10;
        const category = getHarmCategory(roundedScore);

        return {
            score: roundedScore,
            version: '3.0',
            category,
            formula: `${totalPenalties.toFixed(1)} штрафов − ${totalBonuses.toFixed(1)} бонусов = ${roundedScore}`,
            penalties,
            bonuses,
            totalPenalties: Math.round(totalPenalties * 10) / 10,
            totalBonuses: Math.round(totalBonuses * 10) / 10,
            novaGroup,
            goal,
            inputs: { trans, simple, badFat, sodium, fiber, protein, goodFat, gi, carbs, omega3, omega6, additives: additives.length }
        };
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

    // Constants
    Harm.HARM_WEIGHTS = HARM_WEIGHTS;
    Harm.GI_PENALTY = GI_PENALTY;
    Harm.HARM_CATEGORIES = HARM_CATEGORIES;
    Harm.NOVA_PATTERNS = NOVA_PATTERNS;
    // 🆕 v3.0 constants
    Harm.GL_PENALTY = GL_PENALTY;
    Harm.OMEGA_RATIO_PENALTY = OMEGA_RATIO_PENALTY;
    Harm.QUALITY_BONUSES = QUALITY_BONUSES;
    Harm.HARMFUL_ADDITIVES = HARMFUL_ADDITIVES;
    Harm.GOAL_MODIFIERS = GOAL_MODIFIERS;

    // Functions
    Harm.detectNovaGroup = detectNovaGroup;
    Harm.calculateGIPenalty = calculateGIPenalty;
    Harm.calculateHarmScore = calculateHarmScore;
    Harm.getHarmCategory = getHarmCategory;
    Harm.getHarmColor = getHarmColor;
    Harm.getHarmBreakdown = getHarmBreakdown;
    Harm.calculateMealHarm = calculateMealHarm;
    Harm.calculateNutrientDensity = calculateNutrientDensity;
    Harm.enrichProduct = enrichProduct;
    Harm.validateAndFixHarmScores = validateAndFixHarmScores;
    // 🆕 v3.0 functions
    Harm.calculateGLPenalty = calculateGLPenalty;
    Harm.calculateOmegaRatioPenalty = calculateOmegaRatioPenalty;
    Harm.calculateAdditivesPenalty = calculateAdditivesPenalty;
    Harm.calculateQualityBonus = calculateQualityBonus;

    // Для обратной совместимости — экспортируем в HEYS.products если нужно
    if (HEYS.products) {
        HEYS.products.calculateHarmScore = calculateHarmScore;
        HEYS.products.getHarmCategory = getHarmCategory;
    }

    // Verbose log disabled
    // console.log('[HEYS] Harm Score v3.0 module loaded');

})(typeof window !== 'undefined' ? window : this);
