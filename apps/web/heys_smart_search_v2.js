// heys_smart_search_v2.js — Умный поиск с исправлением опечаток, транслитерацией и нормализацией
// Версия 2.7.0 | 2025-12-17
// ✅ Nutrient Search (high protein, keto, etc.)
// ✅ Context Search (breakfast, gym)
// ✅ Improved Fuzzy Search (translit + typos)
// ✅ 🆕 Visual Feedback — показываем что исправили/транслитерировали
// ✅ 🆕 Brand Matching — fuzzy поиск по брендам (Danone, Простоквашино)
// ✅ 🆕 ML-lite Similarity — семантическая близость без ML
// ✅ 🆕 Smart Suggestions — умные подсказки при пустом результате
// ✅ Нормализация ё → е
// ✅ Исправление опечаток (Левенштейн)
// ✅ Синонимы продуктов (100+ групп)
// ✅ Фонетический поиск
// ✅ Кеширование результатов
// ✅ Ранжирование по релевантности
// ✅ Подсветка совпадений (highlightMatches)
// ✅ "Возможно вы искали" (getDidYouMean)
// ✅ Транслитерация (ru ↔ en): protein → протеин, топпинг → topping
// ✅ Fuzzy-транслитерация: fines → fitness/фитнес, финтес → фитнес
// ✅ 🆕 QWERTY↔ЙЦУКЕН: vfkjrj → молоко (неправильная раскладка)
// ✅ 🆕 Сокращения: б/ж, 0%, ккал → без жира, обезжиренный, калории
// ✅ 🆕 Перестановки слов: "творог обезжиренный" = "обезжиренный творог"
// ✅ 🆕 Персонализация: часто используемые продукты выше
// ✅ 🆕 N-gram поиск: поиск по любой части слова
// ✅ 🆕 Категории: поиск по типу продукта
// ✅ 🆕 Token-aware scoring: умное ранжирование по всем словам запроса
// ✅ 🆕 Numeric-aware поиск: 2.5% / 0% / 250г / 1л — точнее по цифрам
// ✅ 🆕 Индексация продуктов: быстрее и стабильнее для больших списков

; (function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // === КОНФИГУРАЦИЯ ===
  const CONFIG = {
    minQueryLength: 2,        // Минимальная длина запроса
    maxResults: 50,           // Максимум результатов
    maxSuggestions: 5,        // Максимум предложений автодополнения
    cacheEnabled: true,       // Включить кеширование
    cacheTimeout: 300000,     // 5 минут кеша
    enablePhonetic: true,     // Фонетический поиск
    enableSynonyms: true,     // Поиск синонимов
    enableTypoCorrection: true, // Исправление опечаток
    enableTranslit: true,     // Транслитерация ru ↔ en
    enableKeyboardFix: true,  // 🆕 Исправление раскладки QWERTY↔ЙЦУКЕН
    enableAbbreviations: true, // 🆕 Сокращения (б/ж, 0%, ккал)
    enableWordPermutations: true, // 🆕 Перестановки слов
    enableNgram: true,        // 🆕 N-gram поиск по частям слова
    enablePersonalization: true, // 🆕 Персонализация по частоте использования
    debugMode: false,         // Режим отладки

    // Адаптивное расстояние опечаток
    getMaxTypoDistance(queryLength) {
      if (queryLength <= 3) return 1;
      if (queryLength <= 5) return 2;
      return 3;
    }
  };

  // === КЕШИ И ИНДЕКСЫ ===
  let searchCache = new Map();
  let productIndex = null;      // Индекс продуктов для быстрого поиска
  let lastProductsHash = null;  // Хеш для инвалидации индекса

  // === СЛОВАРИ ===

  // Популярные слова продуктов (для приоритезации)
  const commonWords = new Set([
    'хлеб', 'молоко', 'мясо', 'рыба', 'овощи', 'фрукты', 'крупа', 'макароны',
    'сыр', 'масло', 'яйца', 'курица', 'говядина', 'свинина', 'картофель',
    'морковь', 'лук', 'помидор', 'огурец', 'яблоко', 'банан', 'апельсин',
    'творог', 'кефир', 'йогурт', 'рис', 'гречка', 'овсянка', 'каша',
    'салат', 'капуста', 'перец', 'чеснок', 'зелень', 'укроп', 'петрушка',
    'мед', 'сахар', 'соль', 'кофе', 'чай', 'сок', 'вода', 'компот',
    'колбаса', 'сосиски', 'ветчина', 'бекон', 'фарш', 'котлета', 'стейк',
    'рыба', 'семга', 'лосось', 'треска', 'тунец', 'креветки', 'кальмар',
    'шоколад', 'конфеты', 'печенье', 'торт', 'пирог', 'булочка', 'круассан',
    'орехи', 'миндаль', 'фундук', 'кешью', 'арахис', 'семечки',
    'авокадо', 'манго', 'киви', 'ананас', 'виноград', 'клубника', 'малина'
  ]);

  // Синонимы продуктов (расширенный словарь)
  const synonyms = {
    // Молочные
    'молоко': ['молочко', 'молочный', 'молочка'],
    'творог': ['творожок', 'творожный', 'творожная'],
    'сыр': ['сырок', 'сырный'],
    'кефир': ['кефирный', 'кефирчик'],
    'йогурт': ['йогуртовый', 'йогуртик'],
    'сметана': ['сметанка', 'сметанный'],
    'сливки': ['сливочный', 'сливочки'],

    // Мясо
    'курица': ['куриный', 'куриная', 'курятина', 'цыпленок', 'птица', 'кура'],
    'говядина': ['говяжий', 'говяжья', 'телятина', 'теленок'],
    'свинина': ['свиной', 'свиная', 'поросенок'],
    'индейка': ['индюшка', 'индюшатина', 'индюшиный'],
    'баранина': ['бараний', 'баранья', 'ягненок'],
    'мясо': ['мясной', 'мясная', 'мясные'],
    'фарш': ['фаршевый'],

    // Рыба
    'рыба': ['рыбный', 'рыбная', 'рыбка'],
    'семга': ['семужка', 'лосось', 'красная рыба'],
    'лосось': ['семга', 'красная рыба'],
    'треска': ['тресковый'],
    'тунец': ['тунцовый'],

    // Овощи
    'картофель': ['картошка', 'картофельный', 'картошечка', 'картоха'],
    'помидор': ['томат', 'томатный', 'помидорка', 'помидорчик'],
    'огурец': ['огурчик', 'огуречный', 'корнишон'],
    'капуста': ['капустный', 'капустка'],
    'морковь': ['морковка', 'морковный', 'морковочка'],
    'лук': ['луковый', 'лучок', 'репчатый'],
    'чеснок': ['чесночный', 'чесночок'],
    'перец': ['перчик', 'перцовый', 'болгарский'],
    'баклажан': ['баклажанный', 'синенький'],
    'кабачок': ['кабачковый', 'цуккини'],
    'свекла': ['свекольный', 'буряк'],
    'редис': ['редиска', 'редисочка'],

    // Фрукты и ягоды
    'яблоко': ['яблочко', 'яблочный'],
    'банан': ['бананчик', 'банановый'],
    'апельсин': ['апельсинчик', 'апельсиновый', 'цитрус'],
    'лимон': ['лимончик', 'лимонный'],
    'груша': ['грушка', 'грушевый'],
    'виноград': ['виноградный', 'виноградик'],
    'клубника': ['клубничка', 'клубничный', 'земляника'],
    'малина': ['малинка', 'малиновый'],
    'черника': ['черничка', 'черничный'],
    'арбуз': ['арбузик', 'арбузный'],
    'дыня': ['дынька', 'дынный'],

    // Крупы и гарниры
    'рис': ['рисовый', 'рисовая'],
    'гречка': ['гречневый', 'гречневая', 'греча'],
    'овсянка': ['овсяный', 'овсяная', 'овес', 'геркулес'],
    'макароны': ['макаронный', 'паста', 'спагетти', 'лапша'],
    'каша': ['кашка', 'кашный'],
    'пшено': ['пшенный', 'пшенная', 'пшенка'],
    'перловка': ['перловый', 'перловая'],
    'булгур': ['булгуровый'],
    'кускус': ['кускусовый'],
    'киноа': ['киноа'],

    // Хлеб и выпечка
    'хлеб': ['хлебушек', 'хлебный', 'батон', 'буханка', 'булка', 'багет'],
    'булочка': ['булка', 'сдоба', 'плюшка'],
    'круассан': ['рогалик'],
    'печенье': ['печенька', 'печеньки'],
    'торт': ['тортик', 'торты'],
    'пирог': ['пирожок', 'пирожки'],

    // Сладкое
    'сахар': ['сахарный', 'сахарок'],
    'мед': ['медок', 'медовый'],
    'шоколад': ['шоколадка', 'шоколадный'],
    'конфеты': ['конфета', 'конфетка'],
    'варенье': ['джем', 'повидло'],

    // Напитки
    'кофе': ['кофеек', 'кофейный', 'эспрессо', 'американо', 'капучино', 'латте'],
    'чай': ['чаек', 'чайный'],
    'сок': ['сочок', 'соковый', 'фреш'],
    'вода': ['водичка', 'минералка'],
    'компот': ['компотик'],
    'морс': ['морсик'],

    // Орехи
    'орехи': ['орешки', 'ореховый'],
    'миндаль': ['миндальный'],
    'фундук': ['лесной орех'],
    'грецкий': ['грецкие орехи'],
    'кешью': ['кешьювый'],
    'арахис': ['арахисовый', 'земляной орех'],

    // Другое
    'яйцо': ['яйца', 'яичко', 'яичный', 'омлет', 'яичница'],
    'масло': ['маслице', 'масляный'],
    'соус': ['соусик', 'соусный', 'заправка'],
    'майонез': ['майонезик', 'майонезный'],
    'кетчуп': ['кетчупик'],
    'горчица': ['горчичный']
  };

  // Фонетические правила для русского языка
  const phoneticRules = [
    { from: /[ёе]/g, to: 'е' },       // ё = е (главное правило!)
    { from: /[ьъ]/g, to: '' },        // мягкий/твердый знак
    { from: /тс|тц/g, to: 'ц' },      // тс → ц
    { from: /сч|щ/g, to: 'щ' },       // сч = щ
    { from: /жш|шж/g, to: 'ш' },      // оглушение
    // Оглушение согласных (опционально, более агрессивно)
    // { from: /[бп]/g, to: 'п' },
    // { from: /[дт]/g, to: 'т' },
    // { from: /[гк]/g, to: 'к' },
    // { from: /[вф]/g, to: 'ф' },
    // { from: /[зс]/g, to: 'с' }
  ];

  // === 🆕 ТРАНСЛИТЕРАЦИЯ (ru ↔ en) ===

  // Таблица транслитерации: русский → латиница (ГОСТ + популярные варианты)
  const TRANSLIT_RU_TO_EN = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
    'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
    'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
    'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
    'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  // Таблица транслитерации: латиница → русский (обратная + альтернативы)
  // Порядок важен! Длинные сочетания первыми
  const TRANSLIT_EN_TO_RU = [
    // Сложные сочетания (порядок важен!)
    ['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'],
    ['ts', 'ц'], ['yu', 'ю'], ['ya', 'я'], ['yo', 'ё'],
    ['ye', 'е'], ['yi', 'и'], ['ph', 'ф'], ['th', 'т'],
    ['ck', 'к'], ['qu', 'кв'], ['x', 'кс'], ['w', 'в'],
    // Простые буквы
    ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'],
    ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'дж'],
    ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'],
    ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'],
    ['v', 'в'], ['y', 'й'], ['z', 'з']
  ];

  // Частые пары транслитерации (точные соответствия для продуктов)
  // Это для 100% точных случаев, где автоматическая транслитерация может ошибиться
  const TRANSLIT_PAIRS = {
    // Спортивное питание
    'protein': 'протеин',
    'протеин': 'protein',
    'whey': 'вей',
    'вей': 'whey',
    'casein': 'казеин',
    'казеин': 'casein',
    'bcaa': 'бцаа',
    'бцаа': 'bcaa',
    'creatine': 'креатин',
    'креатин': 'creatine',
    'gainer': 'гейнер',
    'гейнер': 'gainer',
    'isolate': 'изолят',
    'изолят': 'isolate',
    'fitness': 'фитнес',
    'фитнес': 'fitness',
    'sport': 'спорт',
    'спорт': 'sport',

    // Еда и напитки
    'topping': 'топпинг',
    'топпинг': 'topping',
    'smoothie': 'смузи',
    'смузи': 'smoothie',
    'granola': 'гранола',
    'гранола': 'granola',
    'muesli': 'мюсли',
    'мюсли': 'muesli',
    'yogurt': 'йогурт',
    'йогурт': 'yogurt',
    'milk': 'милк',
    'милк': 'milk',
    'shake': 'шейк',
    'шейк': 'shake',
    'bar': 'бар',
    'бар': 'bar',
    'snack': 'снэк',
    'снэк': 'snack',
    'chips': 'чипсы',
    'чипсы': 'chips',
    'cookie': 'куки',
    'куки': 'cookie',
    'cookies': 'кукис',
    'кукис': 'cookies',
    'oatmeal': 'овсянка',
    'oat': 'овсяный',
    'овсяный': 'oat',
    'quinoa': 'киноа',
    'киноа': 'quinoa',
    'hummus': 'хумус',
    'хумус': 'hummus',
    'falafel': 'фалафель',
    'фалафель': 'falafel',
    'avocado': 'авокадо',
    'авокадо': 'avocado',
    'salmon': 'сэлмон',
    'tuna': 'тунец',
    'тунец': 'tuna',
    'chicken': 'чикен',
    'чикен': 'chicken',
    'beef': 'биф',
    'биф': 'beef',
    'turkey': 'индейка',
    'индейка': 'turkey',
    'steak': 'стейк',
    'стейк': 'steak',

    // Добавки
    'omega': 'омега',
    'омега': 'omega',
    'vitamin': 'витамин',
    'витамин': 'vitamin',
    'fiber': 'файбер',
    'файбер': 'fiber',
    'collagen': 'коллаген',
    'коллаген': 'collagen',
    'magnesium': 'магний',
    'магний': 'magnesium',
    'zinc': 'цинк',
    'цинк': 'zinc',
    'iron': 'железо',
    'calcium': 'кальций',
    'кальций': 'calcium',

    // Диетические термины
    'low': 'лоу',
    'лоу': 'low',
    'high': 'хай',
    'хай': 'high',
    'sugar': 'шугар',
    'шугар': 'sugar',
    'free': 'фри',
    'фри': 'free',
    'zero': 'зеро',
    'зеро': 'zero',
    'light': 'лайт',
    'лайт': 'light',
    'diet': 'диет',
    'диет': 'diet',
    'organic': 'органик',
    'органик': 'organic',
    'bio': 'био',
    'био': 'bio',
    'eco': 'эко',
    'эко': 'eco',
    'vegan': 'веган',
    'веган': 'vegan',
    'keto': 'кето',
    'кето': 'keto',
    'detox': 'детокс',
    'детокс': 'detox',
    'slim': 'слим',
    'слим': 'slim',
    'energy': 'энерджи',
    'энерджи': 'energy',
    'power': 'пауэр',
    'пауэр': 'power',
    'super': 'супер',
    'супер': 'super',

    // Бренды и типичные слова
    'pro': 'про',
    'про': 'pro',
    'plus': 'плюс',
    'плюс': 'plus',
    'max': 'макс',
    'макс': 'max',
    'ultra': 'ультра',
    'ультра': 'ultra',
    'premium': 'премиум',
    'премиум': 'premium',
    'gold': 'голд',
    'голд': 'gold',
    'classic': 'классик',
    'классик': 'classic',
    'original': 'ориджинал',
    'ориджинал': 'original',
    'natural': 'натурал',
    'натурал': 'natural',
    'fresh': 'фреш',
    'фреш': 'fresh'
  };

  // Варианты произношения/написания (для нечёткого поиска)
  // Ключ - нормализованная форма, значения - альтернативные написания
  const SPELLING_VARIANTS = {
    'фитнес': ['финтес', 'фитнесс', 'фитнесc', 'fitness', 'fintess', 'fitnes'],
    'протеин': ['протэин', 'protein', 'protien', 'proteen', 'прутеин'],
    'топпинг': ['топинг', 'topping', 'toping', 'топпинк'],
    'гранола': ['гронола', 'granola', 'granolla', 'граннола'],
    'смузи': ['смуззи', 'smoothie', 'smoothi', 'смуси'],
    'йогурт': ['йогурт', 'йогут', 'yogurt', 'yoghurt', 'йогрут'],
    'мюсли': ['мюсли', 'мусли', 'muesli', 'musli', 'myusli'],
    'креатин': ['креотин', 'creatine', 'creatin', 'kreatine'],
    'коллаген': ['колаген', 'collagen', 'colagen', 'калаген'],
    'казеин': ['козеин', 'casein', 'casien', 'казиен'],
    'кальций': ['калций', 'calcium', 'kalsiy', 'кальцый'],
    'магний': ['магни', 'magnesium', 'magniy', 'магнезий'],
    'омега': ['омего', 'omega', 'оmega', 'амега'],
    'витамин': ['витомин', 'vitamin', 'vitamen', 'витомен'],
    'энергия': ['энерджи', 'energy', 'energi', 'энергия'],
    'шоколад': ['чоколад', 'chocolate', 'chocolat', 'шаколад'],
    'карамель': ['карамел', 'caramel', 'karamel', 'каромель'],
    'ваниль': ['ванил', 'vanilla', 'vanila', 'ванила'],
    'клубника': ['клубнка', 'strawberry', 'клюбника'],
    'банан': ['banan', 'banana', 'банна'],
    'кокос': ['кокас', 'coconut', 'cocnut', 'кокосс'],
    'арахис': ['арохис', 'peanut', 'arachis', 'арахиз'],
    'миндаль': ['миндал', 'almond', 'mindal', 'минталь']
  };

  // === 🆕 QWERTY ↔ ЙЦУКЕН (неправильная раскладка клавиатуры) ===
  const QWERTY_TO_CYRILLIC = {
    'q': 'й', 'w': 'ц', 'e': 'у', 'r': 'к', 't': 'е', 'y': 'н', 'u': 'г',
    'i': 'ш', 'o': 'щ', 'p': 'з', '[': 'х', ']': 'ъ', 'a': 'ф', 's': 'ы',
    'd': 'в', 'f': 'а', 'g': 'п', 'h': 'р', 'j': 'о', 'k': 'л', 'l': 'д',
    ';': 'ж', "'": 'э', 'z': 'я', 'x': 'ч', 'c': 'с', 'v': 'м', 'b': 'и',
    'n': 'т', 'm': 'ь', ',': 'б', '.': 'ю', '/': '.'
  };

  const CYRILLIC_TO_QWERTY = Object.fromEntries(
    Object.entries(QWERTY_TO_CYRILLIC).map(([k, v]) => [v, k])
  );

  // === 🆕 СОКРАЩЕНИЯ И АББРЕВИАТУРЫ ===
  const ABBREVIATIONS = {
    // Жирность
    'б/ж': ['без жира', 'обезжиренный', 'нежирный', '0% жирности'],
    'б ж': ['без жира', 'обезжиренный'],
    'бж': ['без жира', 'обезжиренный'],
    '0%': ['обезжиренный', 'нулевой жирности', 'без жира'],
    '0.5%': ['полупроцентный', 'маложирный'],
    '1%': ['однопроцентный', 'маложирный'],
    '2%': ['двухпроцентный'],
    '5%': ['пятипроцентный'],
    '9%': ['девятипроцентный'],

    // Питательность
    'ккал': ['калории', 'калорийность', 'энергетическая ценность'],
    'кк': ['калории', 'ккал'],
    'бжу': ['белки жиры углеводы', 'нутриенты', 'макросы'],
    'пп': ['правильное питание', 'здоровое питание', 'полезный'],
    'зож': ['здоровый образ жизни', 'здоровое питание'],

    // Размеры
    'мл': ['миллилитров', 'миллилитр'],
    'гр': ['грамм', 'граммов'],
    'кг': ['килограмм', 'килограммов'],
    'л': ['литр', 'литров'],
    'шт': ['штук', 'штука'],

    // Типы продуктов
    'об': ['обезжиренный'],
    'нж': ['нежирный', 'маложирный'],
    'дом': ['домашний', 'домашнего приготовления'],
    'св': ['свежий'],
    'зам': ['замороженный', 'заморозка'],
    'конс': ['консервированный', 'консервы'],
    'коп': ['копченый', 'копчёный'],
    'вар': ['вареный', 'варёный', 'отварной'],
    'жар': ['жареный', 'жаренный'],
    'зап': ['запеченный', 'запечённый'],
    'сыр': ['сырой'],
    'суш': ['сушеный', 'сушёный'],
    'мар': ['маринованный'],
    'сол': ['соленый', 'солёный', 'малосольный'],

    // Спортпит
    'изо': ['изолят', 'изолят протеина'],
    'конц': ['концентрат'],
    'гидро': ['гидролизат'],

    // Марки/типы
    'б/л': ['без лактозы', 'безлактозный'],
    'б/г': ['без глютена', 'безглютеновый'],
    'б/с': ['без сахара', 'несладкий'],
    'низкокал': ['низкокалорийный', 'диетический'],
    'выскокобел': ['высокобелковый', 'протеиновый']
  };

  // === 🆕 ЕДИНИЦЫ ИЗМЕРЕНИЯ (v2.5.0) ===
  const UNIT_CONVERSION = {
    'кг': { base: 'г', factor: 1000 },
    'kg': { base: 'г', factor: 1000 },
    'г': { base: 'г', factor: 1 },
    'гр': { base: 'г', factor: 1 },
    'g': { base: 'г', factor: 1 },
    'л': { base: 'мл', factor: 1000 },
    'l': { base: 'мл', factor: 1000 },
    'мл': { base: 'мл', factor: 1 },
    'ml': { base: 'мл', factor: 1 },
    'шт': { base: 'шт', factor: 1 },
    'pcs': { base: 'шт', factor: 1 }
  };

  // === 🆕 КАТЕГОРИИ ПРОДУКТОВ (для поиска по типу) ===
  const CATEGORY_KEYWORDS = {
    'молочные': ['молоко', 'творог', 'сыр', 'йогурт', 'кефир', 'сметана', 'сливки', 'ряженка', 'простокваша', 'масло сливочное'],
    'мясо': ['говядина', 'свинина', 'курица', 'индейка', 'баранина', 'телятина', 'кролик', 'утка', 'гусь', 'фарш', 'котлета', 'стейк', 'филе', 'грудка', 'бедро', 'окорок', 'ветчина', 'бекон', 'колбаса', 'сосиски'],
    'рыба': ['рыба', 'лосось', 'семга', 'форель', 'тунец', 'треска', 'минтай', 'скумбрия', 'сельдь', 'горбуша', 'кета', 'судак', 'окунь', 'карп', 'щука'],
    'морепродукты': ['креветки', 'кальмар', 'мидии', 'устрицы', 'крабы', 'икра', 'морской коктейль', 'осьминог'],
    'овощи': ['картофель', 'морковь', 'лук', 'чеснок', 'капуста', 'брокколи', 'цветная капуста', 'помидор', 'огурец', 'перец', 'баклажан', 'кабачок', 'тыква', 'свекла', 'редис', 'сельдерей', 'шпинат', 'салат'],
    'фрукты': ['яблоко', 'банан', 'апельсин', 'мандарин', 'груша', 'персик', 'абрикос', 'слива', 'виноград', 'киви', 'манго', 'ананас', 'арбуз', 'дыня', 'гранат', 'хурма'],
    'ягоды': ['клубника', 'малина', 'черника', 'голубика', 'ежевика', 'смородина', 'крыжовник', 'вишня', 'черешня', 'клюква', 'брусника'],
    'крупы': ['рис', 'гречка', 'овсянка', 'пшено', 'перловка', 'булгур', 'кускус', 'киноа', 'манка', 'кукурузная крупа', 'ячневая'],
    'макароны': ['макароны', 'спагетти', 'паста', 'лапша', 'вермишель', 'пенне', 'фузилли', 'фарфалле'],
    'хлеб': ['хлеб', 'батон', 'булка', 'лаваш', 'пита', 'багет', 'чиабатта', 'хлебцы', 'тост', 'сухари'],
    'выпечка': ['печенье', 'пирог', 'торт', 'пирожное', 'круассан', 'булочка', 'кекс', 'маффин', 'рулет', 'эклер'],
    'сладости': ['шоколад', 'конфеты', 'мармелад', 'зефир', 'пастила', 'халва', 'мед', 'варенье', 'джем'],
    'орехи': ['миндаль', 'грецкий орех', 'фундук', 'кешью', 'арахис', 'фисташки', 'кедровые орехи', 'макадамия', 'пекан'],
    'напитки': ['вода', 'сок', 'чай', 'кофе', 'компот', 'морс', 'молоко', 'кефир', 'смузи', 'коктейль'],
    'спортпит': ['протеин', 'гейнер', 'bcaa', 'креатин', 'изолят', 'казеин', 'аминокислоты', 'l-карнитин', 'предтреник', 'коллаген']
  };

  // 🆕 v2.6.0 Правила поиска по нутриентам
  const NUTRIENT_RULES = {
    'high_protein': {
      keywords: ['высокобелковый', 'много белка', 'протеиновый', 'high protein'],
      check: (p) => (p.protein100 || 0) >= 15
    },
    'low_carb': {
      keywords: ['низкоуглеводный', 'мало углей', 'low carb', 'без углей'],
      check: (p) => (p.carbs100 || 0) <= 10
    },
    'sugar_free': {
      keywords: ['без сахара', 'sugar free', '0 сахара', 'zero sugar'],
      check: (p) => (p.simple100 || 0) <= 2
    },
    'keto': {
      keywords: ['кето', 'keto', 'lchf'],
      check: (p) => (p.carbs100 || 0) <= 10 && (p.fat100 || 0) >= 10
    },
    'low_fat': {
      keywords: ['обезжиренный', 'без жира', 'low fat', '0%'],
      check: (p) => (p.fat100 || 0) <= 2
    }
  };

  // 🆕 v2.6.0 Контекстные правила (время дня, ситуация)
  const CONTEXT_RULES = {
    'breakfast': {
      keywords: ['завтрак', 'breakfast', 'утро'],
      boostCategories: ['крупы', 'молочные', 'фрукты', 'хлеб', 'выпечка'],
      boostProducts: ['овсянка', 'яйцо', 'творог', 'кофе', 'омлет']
    },
    'gym': {
      keywords: ['зал', 'gym', 'тренировка', 'после трени'],
      boostCategories: ['спортпит', 'мясо'],
      check: (p) => (p.protein100 || 0) >= 20
    }
  };

  // === 🆕 v2.7.0 СЛОВАРЬ БРЕНДОВ ===
  const BRAND_DICTIONARY = {
    // Молочные бренды
    'danone': ['данон', 'danone', 'дэнон', 'денон'],
    'простоквашино': ['простоквашино', 'prostokvashino', 'простокваш'],
    'активиа': ['активиа', 'activia', 'актива'],
    'чудо': ['чудо', 'chudo'],
    'домик в деревне': ['домик в деревне', 'домик', 'деревенский'],
    'parmalat': ['пармалат', 'parmalat'],
    'president': ['президент', 'president', 'prezident'],
    'valio': ['валио', 'valio'],
    'viola': ['виола', 'viola'],
    'hochland': ['хохланд', 'hochland', 'hohland'],
    'svalia': ['свалия', 'svalia'],
    'агуша': ['агуша', 'agusha'],
    'epica': ['эпика', 'epica', 'epika'],

    // Спортивное питание
    'optimum nutrition': ['оптимум', 'optimum', 'on'],
    'myprotein': ['майпротеин', 'myprotein', 'my protein'],
    'bsn': ['бсн', 'bsn'],
    'dymatize': ['диматайз', 'dymatize', 'dimatize'],
    'muscletech': ['маслтек', 'muscletech', 'muscle tech'],

    // Напитки
    'coca-cola': ['кока-кола', 'кола', 'coca cola', 'cocacola'],
    'pepsi': ['пепси', 'pepsi'],
    'sprite': ['спрайт', 'sprite'],
    'fanta': ['фанта', 'fanta'],
    'lipton': ['липтон', 'lipton'],
    'nescafe': ['нескафе', 'nescafe', 'нескафэ'],

    // Кондитерские
    'nestle': ['нестле', 'nestle', 'nestlé'],
    'milka': ['милка', 'milka'],
    'oreo': ['орео', 'oreo'],
    'snickers': ['сникерс', 'snickers'],
    'mars': ['марс', 'mars'],
    'twix': ['твикс', 'twix'],
    'bounty': ['баунти', 'bounty'],
    'kinder': ['киндер', 'kinder'],
    'raffaello': ['раффаэлло', 'raffaello', 'рафаэлло'],
    'ferrero': ['ферреро', 'ferrero', 'ferrero rocher'],

    // Крупы/Каши
    'makfa': ['макфа', 'makfa'],
    'мистраль': ['мистраль', 'mistral'],
    'увелка': ['увелка', 'uvelka'],
    'heinz': ['хайнц', 'heinz'],
    'nesquik': ['несквик', 'nesquik']
  };

  // === 🆕 v2.7.0 СЕМАНТИЧЕСКИЕ КЛАСТЕРЫ (ML-lite) ===
  const SEMANTIC_CLUSTERS = {
    // Похожие по смыслу продукты
    'каша': ['овсянка', 'гречка', 'рис', 'пшено', 'манка', 'булгур', 'киноа', 'перловка'],
    'утренняя еда': ['овсянка', 'творог', 'яйца', 'омлет', 'йогурт', 'мюсли', 'гранола', 'каша'],
    'белковая еда': ['курица', 'говядина', 'рыба', 'яйца', 'творог', 'протеин', 'индейка'],
    'легкий перекус': ['яблоко', 'банан', 'йогурт', 'орехи', 'хлебцы', 'творожок'],
    'диетическое': ['творог обезжиренный', 'куриная грудка', 'овощи', 'рыба', 'гречка'],
    'сладкое': ['шоколад', 'конфеты', 'печенье', 'торт', 'пирожное', 'мороженое', 'зефир'],
    'напитки': ['вода', 'чай', 'кофе', 'сок', 'молоко', 'кефир', 'компот', 'смузи', 'кола'],
    'что попить': ['молоко', 'кефир', 'чай', 'кофе', 'сок', 'вода', 'кола', 'компот', 'какао'],
    'что выпить': ['молоко', 'кефир', 'чай', 'кофе', 'сок', 'вода', 'кола', 'компот'],
    'здоровая еда': ['авокадо', 'брокколи', 'шпинат', 'лосось', 'киноа', 'орехи', 'ягоды'],
    'быстрая еда': ['яйца', 'хлеб', 'сыр', 'колбаса', 'йогурт', 'банан', 'орехи'],
    'ужин': ['рыба', 'овощи', 'салат', 'курица', 'омлет', 'творог'],
    'гарнир': ['рис', 'гречка', 'макароны', 'картофель', 'булгур', 'кускус'],
    'молочка': ['молоко', 'кефир', 'творог', 'йогурт', 'сметана', 'сыр', 'ряженка']
  };

  // === 🆕 v2.7.0 УМНЫЕ ПОДСКАЗКИ ===
  const SMART_SUGGESTIONS_CONFIG = {
    emptyResultTips: [
      { condition: 'keyboard_layout', message: '💡 Проверьте раскладку клавиатуры (рус/eng)' },
      { condition: 'too_specific', message: '💡 Попробуйте короче: «творог» вместо «творог обезжиренный 0% домик»' },
      { condition: 'typo', message: '💡 Возможно, в слове опечатка' },
      { condition: 'category', message: '💡 Поищите по категории: молочные, мясо, крупы' }
    ],
    popularSearches: ['творог', 'курица', 'яйца', 'молоко', 'овсянка', 'гречка', 'рис', 'банан', 'яблоко', 'сыр']
  };

  // === 🆕 Персонализация — хранилище частоты использования ===
  let userProductStats = new Map(); // product_id → { count, lastUsed }
  let _statsSaveTimer = null;
  const USER_STATS_KEY = 'heys_product_usage_stats';
  const USER_STATS_MIGRATED_KEY = 'heys_product_usage_stats_migrated';
  const USER_STATS_SYNC_KEY = 'heys_product_usage_stats_last_sync';
  const USER_STATS_MAX_AGE_DAYS = 60;

  /**
   * Обновить статистику использования продукта
   */
  function trackProductUsage(productId) {
    if (!CONFIG.enablePersonalization || !productId) {
      return;
    }
    const idKey = String(productId);
    // ⚡ Skip разовые продукты: их ID уникален и никогда не повторится →
    // запись в usage_stats — мусор и для LS, и для cloud-sync.
    if (idKey.indexOf('oneoff_') === 0) {
      return;
    }
    const stats = userProductStats.get(idKey) || { count: 0, lastUsed: 0 };
    stats.count++;
    stats.lastUsed = Date.now();
    userProductStats.set(idKey, stats);

    try {
      if (HEYS.store?.isHiddenProduct?.(idKey)) {
        HEYS.store.unhideProduct?.(idKey);
      }
    } catch (e) { /* ignore */ }

    // Не пишем в storage на каждый клик — дебаунс
    if (_statsSaveTimer) clearTimeout(_statsSaveTimer);
    _statsSaveTimer = setTimeout(() => {
      saveUserStats();
      _statsSaveTimer = null;
    }, 500);
  }

  /**
   * Получить персональный буст для продукта (0-20 баллов)
   */
  function getPersonalBoost(productId) {
    if (!CONFIG.enablePersonalization || !productId) return 0;
    const stats = userProductStats.get(String(productId));
    if (!stats) return 0;

    // Формула: частота × свежесть
    const frequencyBoost = Math.min(stats.count * 2, 10); // max 10
    const daysSinceUse = (Date.now() - stats.lastUsed) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 10 - daysSinceUse); // max 10, убывает с каждым днём

    return Math.round(frequencyBoost + recencyBoost * 0.5);
  }

  /**
   * Загрузить статистику использования из localStorage
   */
  function loadUserStats() {
    try {
      // Prefer HEYS.store (cloud sync), then HEYS.utils.lsGet, fallback to localStorage
      const storeAvailable = !!(HEYS.store && HEYS.store.get);
      const storedObj = storeAvailable
        ? HEYS.store.get(USER_STATS_KEY, null)
        : (HEYS.utils && HEYS.utils.lsGet)
          ? HEYS.utils.lsGet(USER_STATS_KEY, null)
          : (localStorage.getItem(USER_STATS_KEY) ? JSON.parse(localStorage.getItem(USER_STATS_KEY)) : null);

      if (storedObj && typeof storedObj === 'object') {
        // Ключи храним строками для совместимости (productId может быть number/string)
        userProductStats = new Map(Object.entries(storedObj));
      }
    } catch (e) {
      console.warn('[HEYS.search] loadUserStats error:', e);
    }
  }

  function normalizeClientId(raw) {
    if (!raw) return '';
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '';
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'string') return parsed;
        if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') return parsed.id;
      } catch (e) {
        return trimmed.replace(/^"|"$/g, '');
      }
      return trimmed.replace(/^"|"$/g, '');
    }
    if (typeof raw === 'object' && typeof raw.id === 'string') return raw.id;
    return '';
  }

  function inferClientIdFromDayKeys() {
    try {
      const keys = Object.keys(localStorage);
      let best = { cid: '', ts: 0 };
      keys.forEach((key) => {
        const match = key.match(/^heys_(.+?)_dayv2_(\d{4}-\d{2}-\d{2})$/i);
        if (!match) return;
        const cid = match[1];
        if (!cid || cid === 'dayv2') return;
        const dateStr = match[2];
        const ts = Date.parse(dateStr);
        if (!Number.isFinite(ts)) return;
        if (ts >= best.ts) best = { cid, ts };
      });
      return best.cid || '';
    } catch (e) {
      return '';
    }
  }

  function getClientIdSafe() {
    let cid = HEYS?.currentClientId || '';
    if (!cid) cid = HEYS?.cloud?._pinAuthClientId || '';
    if (!cid) {
      cid = normalizeClientId(localStorage.getItem('heys_pin_auth_client'));
    }
    if (!cid) {
      cid = normalizeClientId(localStorage.getItem('heys_client_current'));
    }
    if (!cid) {
      cid = inferClientIdFromDayKeys();
    }
    return typeof cid === 'string' ? cid : '';
  }

  function hasDayHistory(clientId = getClientIdSafe()) {
    try {
      const keys = Object.keys(localStorage);
      const scopedPrefix = clientId ? `heys_${clientId}_dayv2_` : '';
      return keys.some((key) =>
        key.startsWith('heys_dayv2_')
        || (scopedPrefix && key.startsWith(scopedPrefix))
        || /^heys_(.+?)_dayv2_\d{4}-\d{2}-\d{2}$/i.test(key)
      );
    } catch (e) {
      return false;
    }
  }

  function pruneOldUsageStats(maxAgeDays = USER_STATS_MAX_AGE_DAYS) {
    if (!userProductStats || userProductStats.size === 0) return false;
    const now = Date.now();
    const maxAgeMs = Math.max(1, Number(maxAgeDays) || USER_STATS_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000;
    let changed = false;

    userProductStats.forEach((stats, key) => {
      const lastUsed = Number(stats?.lastUsed || 0) || 0;
      if (!lastUsed || now - lastUsed > maxAgeMs) {
        userProductStats.delete(key);
        changed = true;
      }
    });

    if (changed) saveUserStats();
    return changed;
  }

  function markUsageStatsMigrated() {
    try {
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(USER_STATS_MIGRATED_KEY, true);
      } else if (HEYS.utils && HEYS.utils.lsSet) {
        HEYS.utils.lsSet(USER_STATS_MIGRATED_KEY, true);
      } else {
        localStorage.setItem(USER_STATS_MIGRATED_KEY, JSON.stringify(true));
      }
    } catch (e) { /* ignore */ }
  }

  function isUsageStatsMigrated() {
    try {
      if (HEYS.store && HEYS.store.get) {
        return !!HEYS.store.get(USER_STATS_MIGRATED_KEY, false);
      }
      if (HEYS.utils && HEYS.utils.lsGet) {
        return !!HEYS.utils.lsGet(USER_STATS_MIGRATED_KEY, false);
      }
      const raw = localStorage.getItem(USER_STATS_MIGRATED_KEY);
      return raw ? JSON.parse(raw) === true : false;
    } catch (e) {
      return false;
    }
  }

  function ensureUsageStatsMigrated() {
    if (isUsageStatsMigrated()) return true;

    if (userProductStats && userProductStats.size > 0) {
      markUsageStatsMigrated();
      return true;
    }

    if (!hasDayHistory()) {
      markUsageStatsMigrated();
      return true;
    }

    if (typeof syncUsageStatsFromDays === 'function') {
      syncUsageStatsFromDays({
        daysWindow: 21,
        dateKey: new Date().toISOString().slice(0, 10),
        lsGet: (HEYS.utils && HEYS.utils.lsGet) ? HEYS.utils.lsGet : undefined
      });
    }

    markUsageStatsMigrated();
    return true;
  }

  function scheduleUsageStatsMigration() {
    const migrated = ensureUsageStatsMigrated();
    if (migrated) return;

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('heysClientReady', () => {
        ensureUsageStatsMigrated();
      }, { once: true });
    }

    setTimeout(() => {
      ensureUsageStatsMigrated();
    }, 2000);
  }

  /**
   * Сохранить статистику использования
   */
  function saveUserStats() {
    try {
      const data = Object.fromEntries(userProductStats);
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(USER_STATS_KEY, data);
      } else if (HEYS.utils && HEYS.utils.lsSet) {
        HEYS.utils.lsSet(USER_STATS_KEY, data);
      } else {
        localStorage.setItem(USER_STATS_KEY, JSON.stringify(data));
      }
    } catch (e) { /* ignore */ }
  }

  function getUsageStatsLastSync() {
    try {
      if (HEYS.store && HEYS.store.get) {
        return Number(HEYS.store.get(USER_STATS_SYNC_KEY, 0)) || 0;
      }
      if (HEYS.utils && HEYS.utils.lsGet) {
        return Number(HEYS.utils.lsGet(USER_STATS_SYNC_KEY, 0)) || 0;
      }
      const raw = localStorage.getItem(USER_STATS_SYNC_KEY);
      return raw ? Number(JSON.parse(raw)) || 0 : 0;
    } catch (e) {
      return 0;
    }
  }

  function setUsageStatsLastSync(ts) {
    try {
      if (HEYS.store && HEYS.store.set) {
        HEYS.store.set(USER_STATS_SYNC_KEY, ts);
      } else if (HEYS.utils && HEYS.utils.lsSet) {
        HEYS.utils.lsSet(USER_STATS_SYNC_KEY, ts);
      } else {
        localStorage.setItem(USER_STATS_SYNC_KEY, JSON.stringify(ts));
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Получить snapshot статистики использования
   * @returns {Map<string, {count:number, lastUsed:number}>}
   */
  function getUsageStats() {
    return new Map(userProductStats);
  }

  /**
   * Синхронизировать usage stats из истории дней (для миграции)
   * @param {Object} options
   * @param {number} options.daysWindow
   * @param {Function} options.lsGet
   * @param {string} options.dateKey
   * @returns {Map<string, {count:number, lastUsed:number}>}
   */
  function syncUsageStatsFromDays(options = {}) {
    const daysWindow = Math.max(1, Math.min(60, Number(options.daysWindow) || 21));
    const bumpStat = (statsMap, key, ts) => {
      const k = String(key || '').trim();
      if (!k) return;
      const s = statsMap.get(k) || { count: 0, lastUsed: 0 };
      s.count += 1;
      if (!s.lastUsed || ts > s.lastUsed) s.lastUsed = ts;
      statsMap.set(k, s);
    };
    const resolveScopedKey = (rawKey) => {
      const cid = getClientIdSafe();
      if (!cid) return rawKey;
      if (/^heys_(clients|client_current)$/i.test(rawKey)) return rawKey;
      if (rawKey.includes(cid)) return rawKey;
      if (rawKey.startsWith('heys_')) {
        return `heys_${cid}_${rawKey.substring('heys_'.length)}`;
      }
      return `heys_${cid}_${rawKey}`;
    };
    const lsGetFn = options.lsGet
      || (HEYS.store && HEYS.store.get)
      || (HEYS.utils && HEYS.utils.lsGet)
      || ((k, d) => {
        try {
          const scopedKey = resolveScopedKey(k);
          const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(k);
          if (!raw) return d;
          if (HEYS.store?.decompress) return HEYS.store.decompress(raw);
          return JSON.parse(raw);
        } catch (_) { return d; }
      });
    const readDayRaw = (rawKey) => {
      try {
        const scopedKey = resolveScopedKey(rawKey);
        const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(rawKey);
        if (!raw) return null;
        if (HEYS.store?.decompress) return HEYS.store.decompress(raw);
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    };
    const today = new Date(options.dateKey || new Date().toISOString().slice(0, 10));
    const nextStats = new Map();

    const scanFromDayKeys = () => {
      try {
        const keys = Object.keys(localStorage);
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - (daysWindow - 1));
        const stats = new Map();

        keys.forEach((key) => {
          if (!key.includes('_dayv2_')) return;
          const m = key.match(/_dayv2_(\d{4}-\d{2}-\d{2})/);
          if (!m) return;
          const dateStr = m[1];
          const ts = Date.parse(dateStr);
          if (!Number.isFinite(ts)) return;
          if (ts < cutoff.getTime()) return;

          const raw = localStorage.getItem(key);
          if (!raw) return;
          let dayData = null;
          try {
            if (HEYS.store?.decompress) {
              dayData = HEYS.store.decompress(raw);
            } else if (raw.startsWith('¤Z¤')) {
              dayData = JSON.parse(raw.substring(3));
            } else {
              dayData = JSON.parse(raw);
            }
          } catch (e) {
            dayData = null;
          }
          if (!dayData?.meals) return;

          dayData.meals.forEach((meal) => {
            if (!meal?.items) return;
            meal.items.forEach((item) => {
              const pid = String(item.product_id || item.productId || '');
              const rawName = String(item.name || '').trim();
              const normName = normalizeText(rawName);
              if (pid) bumpStat(stats, pid, ts);
              if (rawName) bumpStat(stats, rawName, ts);
              if (normName) bumpStat(stats, normName, ts);
            });
          });
        });

        return stats;
      } catch (e) {
        return new Map();
      }
    };

    let scannedDays = 0;
    let foundMeals = 0;
    let foundItems = 0;
    for (let i = 0; i < daysWindow; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayKey = `heys_dayv2_${key}`;
      if (HEYS.store?.invalidate) {
        HEYS.store.invalidate(dayKey);
      }
      const dayData = lsGetFn(dayKey, null) || readDayRaw(dayKey);
      const dayTs = d.getTime();

      if (dayData && dayData.meals) {
        scannedDays++;
        dayData.meals.forEach(meal => {
          if (!meal.items) return;
          foundMeals++;
          meal.items.forEach(item => {
            const pid = String(item.product_id || item.productId || '');
            const rawName = String(item.name || '').trim();
            const normName = normalizeText(rawName);
            if (!pid && !rawName && !normName) return;
            foundItems++;
            if (pid) bumpStat(nextStats, pid, dayTs);
            if (rawName) bumpStat(nextStats, rawName, dayTs);
            if (normName) bumpStat(nextStats, normName, dayTs);
          });
        });
      }
    }

    let finalStats = nextStats;
    if (finalStats.size === 0) {
      finalStats = scanFromDayKeys();
    }

    if (finalStats.size === 0) {
      console.warn('[HEYS.search] syncUsageStatsFromDays: no stats found in', scannedDays, 'days');
    }

    if (finalStats.size > 0) {
      userProductStats = new Map(finalStats);
      saveUserStats();
      setUsageStatsLastSync(Date.now());
      console.info('[HEYS.search] ✅ Usage stats synced:', {
        statsKeys: finalStats.size,
        scannedDays,
        foundItems,
        sample: Array.from(finalStats.entries()).slice(0, 3).map(([k, v]) => `${k}: ${v.count}×`)
      });
    }

    try {
      HEYS._usageStatsDebug = {
        ...(HEYS._usageStatsDebug || {}),
        sync: {
          daysWindow,
          scannedDays,
          foundMeals,
          foundItems,
          statsSize: nextStats.size,
          clientId: getClientIdSafe(),
          sample: Array.from(nextStats.entries()).slice(0, 5)
        }
      };
    } catch (e) { }

    if (HEYS.DEBUG_MODE) {
      const payload = HEYS._usageStatsDebug?.sync || {
        daysWindow,
        scannedDays,
        foundMeals,
        foundItems,
        statsSize: finalStats.size,
        clientId: getClientIdSafe()
      };
      console.log('🔎 [UsageStats] syncUsageStatsFromDays', payload);
      if (finalStats.size === 0) {
        console.log('⚠️ [UsageStats] no stats found from day keys');
      }
      if (global.DEV?.log) {
        global.DEV.log('🔎 [UsageStats] syncUsageStatsFromDays', payload);
      }
    }

    return new Map(userProductStats);
  }

  function ensureUsageStatsFresh(options = {}) {
    const maxHours = Math.max(1, Number(options.maxHours) || 12);
    const lastSync = getUsageStatsLastSync();
    const maxAgeMs = maxHours * 60 * 60 * 1000;
    const shouldSync = !lastSync || (Date.now() - lastSync) > maxAgeMs;
    if (!shouldSync) return false;

    syncUsageStatsFromDays({
      daysWindow: Math.max(1, Math.min(60, Number(options.daysWindow) || 21)),
      dateKey: options.dateKey,
      lsGet: options.lsGet
    });
    return true;
  }

  // Загружаем статистику при инициализации
  loadUserStats();
  scheduleUsageStatsMigration();
  pruneOldUsageStats();

  /**
   * Определяет язык текста (ru/en/mixed)
   */
  function detectLanguage(text) {
    if (!text) return 'unknown';
    const hasRu = /[а-яё]/i.test(text);
    const hasEn = /[a-z]/i.test(text);
    if (hasRu && hasEn) return 'mixed';
    if (hasRu) return 'ru';
    if (hasEn) return 'en';
    return 'unknown';
  }

  /**
   * 🆕 Конвертировать раскладку клавиатуры
   * vfkjrj → молоко, молоко → vjkjrj
   */
  function convertKeyboardLayout(text) {
    if (!CONFIG.enableKeyboardFix || !text) return null;

    const lang = detectLanguage(text);
    const lower = text.toLowerCase();
    let converted = '';

    if (lang === 'en') {
      // QWERTY → ЙЦУКЕН
      for (const char of lower) {
        converted += QWERTY_TO_CYRILLIC[char] || char;
      }
    } else if (lang === 'ru') {
      // ЙЦУКЕН → QWERTY
      for (const char of lower) {
        converted += CYRILLIC_TO_QWERTY[char] || char;
      }
    } else {
      return null;
    }

    // Проверяем, что конвертация дала другой результат
    return converted !== lower ? converted : null;
  }

  /**
   * 🆕 Раскрыть сокращения
   */
  function expandAbbreviations(query) {
    if (!CONFIG.enableAbbreviations || !query) return [];

    const normalized = normalizeText(query);
    const expansions = new Set();

    // Проверяем каждое сокращение
    for (const [abbr, meanings] of Object.entries(ABBREVIATIONS)) {
      if (normalized.includes(abbr) || normalized === abbr) {
        meanings.forEach(m => {
          // Заменяем сокращение на полную форму
          expansions.add(normalized.replace(abbr, m));
          expansions.add(m);
        });
      }
    }

    return [...expansions];
  }

  /**
   * 🆕 Генерировать перестановки слов
   * "творог обезжиренный" → ["обезжиренный творог"]
   */
  function generateWordPermutations(query) {
    if (!CONFIG.enableWordPermutations || !query) return [];

    const words = normalizeText(query).split(/\s+/).filter(w => w.length >= 2);
    if (words.length < 2 || words.length > 4) return []; // Только 2-4 слова

    const permutations = new Set();

    // Для 2 слов — просто переставляем
    if (words.length === 2) {
      permutations.add(`${words[1]} ${words[0]}`);
    }

    // Для 3-4 слов — основные перестановки
    if (words.length >= 3) {
      // Последнее слово в начало
      permutations.add([words[words.length - 1], ...words.slice(0, -1)].join(' '));
      // Первое слово в конец
      permutations.add([...words.slice(1), words[0]].join(' '));
    }

    return [...permutations];
  }

  /**
   * 🆕 Поиск по категории продуктов
   * "молочные" → все молочные продукты
   */
  function findCategoryProducts(query, dataSource) {
    const normalized = normalizeText(query);

    // Проверяем, это запрос категории?
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (normalized === category || normalized === category.slice(0, -2)) { // молочные/молочн
        // Возвращаем продукты этой категории
        return dataSource.filter(item => {
          const itemName = normalizeText(item.name || '');
          return keywords.some(kw => itemName.includes(kw));
        }).map(item => ({
          ...item,
          matchType: 'category',
          matchedCategory: category
        }));
      }
    }

    return [];
  }

  /**
   * 🆕 N-gram поиск (поиск по любой части слова)
   */
  function ngramSearch(query, dataSource, minGramSize = 3) {
    if (!CONFIG.enableNgram || !query || query.length < minGramSize) return [];

    const normalized = normalizeText(query);
    const results = [];

    dataSource.forEach(item => {
      const itemName = normalizeText(item.name || '');

      // Генерируем n-граммы из названия продукта
      for (let i = 0; i <= itemName.length - normalized.length; i++) {
        const gram = itemName.substring(i, i + normalized.length);

        // Fuzzy сравнение n-граммы с запросом
        const distance = levenshteinDistance(normalized, gram, 1);
        if (distance <= 1) {
          results.push({
            ...item,
            matchType: 'ngram',
            matchPosition: i,
            ngramDistance: distance
          });
          break; // Один продукт один раз
        }
      }
    });

    return results;
  }

  /**
   * Транслитерация текста
   * @param {string} text - исходный текст
   * @param {string} direction - 'ru-to-en' | 'en-to-ru' | 'auto' (определит автоматически)
   * @returns {string} транслитерированный текст
   */
  function transliterate(text, direction = 'auto') {
    if (!text) return '';
    const lower = text.toLowerCase();

    // Проверяем точные пары
    if (TRANSLIT_PAIRS[lower]) {
      return TRANSLIT_PAIRS[lower];
    }

    // Определяем направление автоматически
    if (direction === 'auto') {
      const lang = detectLanguage(lower);
      direction = lang === 'ru' ? 'ru-to-en' : 'en-to-ru';
    }

    if (direction === 'ru-to-en') {
      // Русский → Латиница
      let result = '';
      for (const char of lower) {
        result += TRANSLIT_RU_TO_EN[char] || char;
      }
      return result;
    } else {
      // Латиница → Русский (порядок важен!)
      let result = lower;
      for (const [from, to] of TRANSLIT_EN_TO_RU) {
        result = result.split(from).join(to);
      }
      return result;
    }
  }

  /**
   * Получить все варианты транслитерации для запроса
   * @param {string} query - поисковый запрос
   * @returns {string[]} массив вариантов (включая исходный)
   */
  function getTranslitVariants(query) {
    if (!CONFIG.enableTranslit || !query) return [query];

    const normalized = normalizeText(query);
    const variants = new Set([normalized]);

    // Точная пара из словаря
    if (TRANSLIT_PAIRS[normalized]) {
      variants.add(normalizeText(TRANSLIT_PAIRS[normalized]));
    }

    // Автоматическая транслитерация
    const lang = detectLanguage(normalized);
    if (lang === 'ru') {
      // Русский → латиница
      variants.add(transliterate(normalized, 'ru-to-en'));
    } else if (lang === 'en') {
      // Латиница → русский
      variants.add(transliterate(normalized, 'en-to-ru'));
    }

    // Проверяем варианты написания
    for (const [canonical, spellings] of Object.entries(SPELLING_VARIANTS)) {
      if (spellings.some(s => normalizeText(s) === normalized)) {
        // Нашли в вариантах - добавляем каноническую форму
        variants.add(normalizeText(canonical));
      }
      if (normalizeText(canonical) === normalized) {
        // Это каноническая форма - добавляем все варианты
        spellings.forEach(s => variants.add(normalizeText(s)));
      }
    }

    return [...variants].filter(v => v && v.length >= 2);
  }

  /**
   * Найти каноническую форму слова (если есть)
   */
  function getCanonicalForm(query) {
    const normalized = normalizeText(query);

    // Проверяем в SPELLING_VARIANTS
    for (const [canonical, spellings] of Object.entries(SPELLING_VARIANTS)) {
      if (normalizeText(canonical) === normalized) {
        return canonical;
      }
      if (spellings.some(s => normalizeText(s) === normalized)) {
        return canonical;
      }
    }

    // Проверяем в TRANSLIT_PAIRS (берём русский вариант как канонический)
    if (TRANSLIT_PAIRS[normalized]) {
      const pair = TRANSLIT_PAIRS[normalized];
      // Если пара на русском - это каноническая форма
      if (detectLanguage(pair) === 'ru') {
        return pair;
      }
    }

    return null;
  }

  // === УТИЛИТЫ ===

  /**
   * Нормализация текста для поиска
   * КЛЮЧЕВАЯ ФУНКЦИЯ: ё → е, lowercase, убираем лишнее
   */
  function normalizeText(text) {
    if (!text) return '';
    return String(text)
      .toLowerCase()
      .replace(/ё/g, 'е')              // ё → е (критично!)
      .replace(/[^\wа-яё\s-]/gi, ' ')  // оставляем только буквы, цифры, пробелы, дефис
      .replace(/\s+/g, ' ')            // множественные пробелы → один
      .trim();
  }

  // Частые служебные слова — не учитываем как смысловые токены
  const STOPWORDS = new Set([
    'и', 'а', 'но', 'или', 'в', 'во', 'на', 'по', 'к', 'ко', 'с', 'со', 'у', 'из', 'от',
    'за', 'для', 'при', 'без', 'над', 'под', 'про', 'до', 'после', 'это', 'тот', 'та',
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'without'
  ]);

  /**
   * 🆕 Нормализация окончаний (stemming-lite)
   * Убирает окончания прилагательных и множественного числа
   */
  function normalizeRussianWord(word) {
    if (!word || word.length < 4) return word;

    // Прилагательные: -ая, -яя, -ое, -ее, -ый, -ий, -ые, -ие
    if (/(ая|яя|ое|ее|ый|ий|ые|ие)$/.test(word)) {
      return word.replace(/(ая|яя|ое|ее|ый|ий|ые|ие)$/, '');
    }

    // Множественное число: -ы, -и (если не короткое слово)
    if (word.length > 4 && /(ы|и)$/.test(word)) {
      return word.slice(0, -1);
    }

    return word;
  }

  /**
   * 🆕 v2.5.0 Парсинг числовых ограничений с единицами
   * "молоко 1.5%" -> [{ value: 1.5, unit: '%', raw: '1.5%' }]
   * "творог 5%" -> [{ value: 5, unit: '%', raw: '5%' }]
   * "кефир 1л" -> [{ value: 1000, unit: 'ml', raw: '1л' }]
   */
  function parseNumericConstraints(text) {
    if (!text) return [];

    // Паттерн: число (с точкой/запятой) + опционально пробел + единица
    // Группы: 1=число, 3=единица
    const regex = /(\d+(?:[.,]\d+)?)\s*([%a-zA-Zа-яА-ЯёЁ]+)?/g;
    const constraints = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      const valStr = match[1].replace(',', '.');
      const unitStr = (match[2] || '').toLowerCase();

      // Пропускаем просто числа без контекста, если они похожи на год или артикул (4 цифры)
      // Но берем маленькие числа (жирность, вес)
      const value = parseFloat(valStr);

      // Нормализация единицы
      let normalizedUnit = null;
      let normalizedValue = value;

      if (unitStr) {
        // Пробуем найти в таблице конвертации
        if (UNIT_CONVERSION[unitStr]) {
          const conv = UNIT_CONVERSION[unitStr];
          normalizedUnit = conv.base;
          normalizedValue = value * conv.factor;
        } else {
          // Неизвестная единица - оставляем как есть
          normalizedUnit = unitStr;
        }
      } else {
        // Число без единицы.
        // Если это 0-100, может быть процентом (жирность)
        // Если >100, может быть граммами
        // Пока считаем 'generic'
        normalizedUnit = 'generic';
      }

      constraints.push({
        value: normalizedValue,
        unit: normalizedUnit,
        rawUnit: unitStr,
        rawValue: value,
        original: match[0]
      });
    }

    return constraints;
  }

  /**
   * 🆕 v2.5.0 Проверка числового совпадения
   * Сравнивает числа из запроса с числами в продукте
   */
  function checkNumericMatch(queryConstraints, productConstraintsOrText) {
    if (!queryConstraints || queryConstraints.length === 0) return 1.0;

    // Парсим числа из продукта, если передана строка
    const productNumbers = Array.isArray(productConstraintsOrText)
      ? productConstraintsOrText
      : parseNumericConstraints(productConstraintsOrText);

    if (productNumbers.length === 0) return 0.9; // Нет чисел в продукте - нейтрально

    let matchScore = 0;
    let matchedCount = 0;

    for (const qNum of queryConstraints) {
      // Ищем подходящее число в продукте
      const bestMatch = productNumbers.find(pNum => {
        // 1. Совпадение единиц (или одна из них generic)
        const unitMatch = (qNum.unit === pNum.unit) ||
          (qNum.unit === 'generic' && pNum.unit !== '%') || // generic не матчит %
          (pNum.unit === 'generic' && qNum.unit !== '%');

        if (!unitMatch) return false;

        // 2. Совпадение значений (с допуском)
        // Для процентов допуск маленький (0.1), для граммов большой (10%)
        const tolerance = qNum.unit === '%' ? 0.1 : Math.max(0.1, qNum.value * 0.1);
        return Math.abs(qNum.value - pNum.value) <= tolerance;
      });

      if (bestMatch) {
        matchedCount++;
        matchScore += 1.0;
      } else {
        // Если в запросе было число (например 5%), а в продукте его нет или другое - штраф
        // Но только если это специфичная единица (%, кг, л)
        if (qNum.unit !== 'generic') {
          matchScore -= 0.5;
        }
      }
    }

    if (matchedCount === 0 && queryConstraints.length > 0) return 0.8; // Ничего не нашли

    return Math.max(0.5, Math.min(1.5, 1.0 + (matchScore * 0.2)));
  }

  /**
   * 🆕 Токенизация запроса/названия (слова)
   */
  function tokenize(text) {
    const norm = normalizeText(text);
    if (!norm) return [];
    return norm
      .split(/\s+/)
      .map(t => t.trim())
      .filter(t => t.length >= 2)
      .filter(t => !STOPWORDS.has(t))
      .map(t => normalizeRussianWord(t)); // 🆕 v2.5.0 Stemming
  }

  /**
   * 🆕 Извлекаем числовые токены из сырого текста.
   * Примеры:
   *  - "2.5%" → ["2.5%", "2.5"]
   *  - "0%"   → ["0%", "0"]
   *  - "250г" → ["250"]
   */
  function extractNumericTokens(rawText) {
    if (!rawText) return [];
    const s = String(rawText).toLowerCase();
    const out = new Set();

    // 1) Десятичные/целые с опциональным %
    const re = /\b(\d+(?:[\.,]\d+)?)(\s*%?)\b/g;
    let m;
    while ((m = re.exec(s))) {
      const num = (m[1] || '').replace(',', '.');
      const hasPct = (m[2] || '').includes('%');
      if (!num) continue;
      out.add(num);
      if (hasPct) out.add(num + '%');
    }

    // 2) Число + единицы (г/гр/ml/мл/л/кг) — добавляем только число (единицы не нормализуем в токен)
    const reUnits = /\b(\d+(?:[\.,]\d+)?)(?:\s*)(г|гр|kg|кг|ml|мл|л|шт)\b/g;
    while ((m = reUnits.exec(s))) {
      const num = (m[1] || '').replace(',', '.');
      if (num) out.add(num);
    }

    return [...out];
  }

  /**
   * 🆕 Проверка: все числовые токены запроса присутствуют в продукте.
   * Если запрос "2.5" — принимаем и "2.5%".
   */
  function numbersMatchAll(queryNums, itemNums) {
    if (!queryNums || queryNums.length === 0) return true;
    if (!itemNums || itemNums.length === 0) return false;
    const set = new Set(itemNums);
    return queryNums.every(q => {
      if (set.has(q)) return true;
      // 2.5 может матчиться с 2.5%
      if (!q.endsWith('%') && set.has(q + '%')) return true;
      // 0% может матчиться с 0
      if (q.endsWith('%') && set.has(q.replace('%', ''))) return true;
      return false;
    });
  }

  /**
   * 🆕 Оценка совпадения по токенам запроса.
   * Возвращает { coverage, bonus }
   */
  function computeTokenMatchScore(queryTokens, itemNameNorm, itemTokens) {
    if (!queryTokens || queryTokens.length === 0) return { coverage: 0, bonus: 0 };
    const name = itemNameNorm || '';
    const tokens = itemTokens || [];
    const isMultiTokenQuery = queryTokens.length >= 2;
    let hit = 0;

    for (const qt of queryTokens) {
      if (!qt) continue;

      // 1) точное совпадение токена
      if (tokens.includes(qt)) {
        hit++;
        continue;
      }
      // 2) префикс ("твор" → "творог"). Для multi-token запроса разрешаем и короткие префиксы ("гр" → "греческий").
      if (tokens.some(t => t.startsWith(qt) && (qt.length >= 3 || (isMultiTokenQuery && qt.length >= 2)))) {
        hit++;
        continue;
      }
      // 3) fallback: подстрока
      if (name.includes(qt) && (qt.length >= 3 || (isMultiTokenQuery && qt.length >= 2))) {
        hit++;
        continue;
      }
    }

    const coverage = hit / Math.max(1, queryTokens.length);

    // Бонус: чем выше coverage, тем сильнее. Полное совпадение по всем словам — жирный буст.
    let bonus = 0;
    if (coverage >= 1) bonus = 18;
    else if (coverage >= 0.75) bonus = 10;
    else if (coverage >= 0.5) bonus = 5;

    return { coverage, bonus };
  }

  /**
   * Фонетическая нормализация (для fuzzy-поиска)
   */
  function phoneticNormalize(text) {
    if (!CONFIG.enablePhonetic) return normalizeText(text);

    let result = normalizeText(text);
    phoneticRules.forEach(rule => {
      result = result.replace(rule.from, rule.to);
    });
    return result;
  }

  /**
   * Расчёт расстояния Левенштейна (для опечаток)
   * Оптимизированная версия с ранним выходом
   */
  function levenshteinDistance(str1, str2, maxDistance = Infinity) {
    const len1 = str1.length;
    const len2 = str2.length;

    // Быстрые проверки
    if (len1 === 0) return len2;
    if (len2 === 0) return len1;
    if (Math.abs(len1 - len2) > maxDistance) return maxDistance + 1;

    // Используем одномерный массив для экономии памяти
    const prev = new Array(len2 + 1);
    const curr = new Array(len2 + 1);

    for (let j = 0; j <= len2; j++) prev[j] = j;

    for (let i = 1; i <= len1; i++) {
      curr[0] = i;
      let minInRow = i;

      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,      // удаление
          curr[j - 1] + 1,  // вставка
          prev[j - 1] + cost // замена
        );
        minInRow = Math.min(minInRow, curr[j]);
      }

      // Ранний выход если минимум в строке превышает maxDistance
      if (minInRow > maxDistance) return maxDistance + 1;

      // Копируем текущую строку в prev (swap тут не нужен)
      for (let j = 0; j <= len2; j++) prev[j] = curr[j];
    }

    return prev[len2];
  }

  /**
   * 🆕 Быстрый индекс по продуктам (нормализованные поля) — чтобы не пересчитывать на каждый этап поиска.
   */
  function computeDataSourceHash(dataSource) {
    try {
      const len = dataSource.length;
      const first = dataSource[0];
      const last = dataSource[len - 1];
      const fKey = (first && (first.id || first.name)) ? String(first.id || first.name) : '';
      const lKey = (last && (last.id || last.name)) ? String(last.id || last.name) : '';
      return `${len}|${fKey}|${lKey}`;
    } catch (e) {
      return String(dataSource.length || 0);
    }
  }

  function getIndexedProducts(dataSource, opts) {
    if (!dataSource || !Array.isArray(dataSource)) return [];
    const hash = computeDataSourceHash(dataSource);
    if (productIndex && lastProductsHash === hash) {
      return productIndex;
    }

    const indexed = dataSource.map(item => {
      const nameRaw = item?.name || '';
      const nameNorm = normalizeText(nameRaw);
      const namePhon = (opts && opts.enablePhonetic) ? phoneticNormalize(nameRaw) : nameNorm;
      const tokens = tokenize(nameRaw);
      const numbers = parseNumericConstraints(nameRaw); // 🆕 v2.5.0
      const key = item?.id || item?.name;
      return { key, item, nameRaw, nameNorm, namePhon, tokens, numbers };
    });

    productIndex = indexed;
    lastProductsHash = hash;
    return indexed;
  }

  /**
   * Поиск синонимов для слова
   */
  function findSynonyms(query) {
    if (!CONFIG.enableSynonyms) return [];

    const normalized = normalizeText(query);
    const result = new Set();

    // Прямой поиск
    if (synonyms[normalized]) {
      synonyms[normalized].forEach(s => result.add(s));
    }

    // Обратный поиск (слово может быть синонимом)
    for (const [key, values] of Object.entries(synonyms)) {
      if (values.some(v => normalizeText(v) === normalized)) {
        result.add(key);
        values.forEach(v => {
          if (normalizeText(v) !== normalized) result.add(v);
        });
      }
    }

    return [...result];
  }

  /**
   * Поиск исправлений опечаток
   */
  function findTypoCorrections(query, wordList) {
    if (!CONFIG.enableTypoCorrection) return [];

    const normalized = normalizeText(query);
    if (normalized.length < CONFIG.minQueryLength) return [];

    const maxDistance = CONFIG.getMaxTypoDistance(normalized.length);
    const corrections = [];
    const seen = new Set();

    // Собираем уникальные слова из названий продуктов
    const uniqueWords = new Set();
    wordList.forEach(item => {
      const name = normalizeText(item.name || item);
      uniqueWords.add(name);
      // Также добавляем отдельные слова
      name.split(/\s+/).forEach(w => {
        if (w.length >= 3) uniqueWords.add(w);
      });
    });

    // Ищем похожие слова
    for (const word of uniqueWords) {
      if (seen.has(word)) continue;

      const distance = levenshteinDistance(normalized, word, maxDistance);
      if (distance > 0 && distance <= maxDistance) {
        seen.add(word);
        corrections.push({
          original: query,
          corrected: word,
          distance,
          confidence: 1 - (distance / Math.max(normalized.length, word.length))
        });
      }
    }

    // Сортируем по уверенности
    return corrections.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  /**
   * 🆕 v2.7.0 Поиск по брендам (fuzzy matching)
   * Находит все варианты написания бренда
   */
  function findBrandVariants(query) {
    const normalized = normalizeText(query);
    const variants = new Set();

    for (const [canonical, spellings] of Object.entries(BRAND_DICTIONARY)) {
      // Проверяем точное совпадение с любым вариантом
      if (spellings.some(s => normalizeText(s) === normalized)) {
        // Нашли бренд - добавляем все его варианты
        variants.add(normalizeText(canonical));
        spellings.forEach(s => variants.add(normalizeText(s)));
      }

      // Fuzzy match для опечаток в названии бренда
      for (const spelling of spellings) {
        const normSpelling = normalizeText(spelling);
        const distance = levenshteinDistance(normalized, normSpelling, 2);
        if (distance > 0 && distance <= 2 && normalized.length >= 4) {
          variants.add(normSpelling);
          variants.add(normalizeText(canonical));
          spellings.forEach(s => variants.add(normalizeText(s)));
        }
      }
    }

    return [...variants];
  }

  /**
   * 🆕 v2.7.0 Семантический поиск (ML-lite)
   * Ищет продукты по смысловой близости
   */
  function findSemanticMatches(query, dataSource, limit = 10) {
    const normalized = normalizeText(query);
    const matches = [];

    // Ищем в семантических кластерах
    for (const [cluster, products] of Object.entries(SEMANTIC_CLUSTERS)) {
      const clusterNorm = normalizeText(cluster);

      // Запрос совпадает с названием кластера?
      if (clusterNorm.includes(normalized) || normalized.includes(clusterNorm)) {
        // Ищем продукты из этого кластера в dataSource
        dataSource.forEach(item => {
          const itemName = normalizeText(item.name || '');
          for (const clusterProduct of products) {
            if (itemName.includes(normalizeText(clusterProduct))) {
              matches.push({
                ...item,
                matchType: 'semantic',
                semanticCluster: cluster,
                relevance: 55
              });
              break;
            }
          }
        });
      }

      // Запрос — один из продуктов кластера?
      if (products.some(p => normalizeText(p) === normalized)) {
        // Находим другие продукты из этого же кластера (похожие)
        dataSource.forEach(item => {
          const itemName = normalizeText(item.name || '');
          for (const clusterProduct of products) {
            const cpNorm = normalizeText(clusterProduct);
            if (cpNorm !== normalized && itemName.includes(cpNorm)) {
              matches.push({
                ...item,
                matchType: 'semantic',
                semanticCluster: cluster,
                relatedTo: query,
                relevance: 45
              });
              break;
            }
          }
        });
      }
    }

    // Убираем дубликаты и лимитируем
    const seen = new Set();
    return matches.filter(m => {
      const key = m.id || m.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
  }

  /**
   * 🆕 v2.7.0 Генерация умных подсказок при пустом результате
   */
  function generateSmartSuggestions(query, dataSource) {
    const normalized = normalizeText(query);
    const suggestions = {
      tips: [],
      alternatives: [],
      popular: [],
      didYouMean: []
    };

    // 1. Проверяем раскладку — только если текст на латинице
    const lang = detectLanguage(query);
    if (lang === 'en') {
      const keyboardFixed = convertKeyboardLayout(query);
      if (keyboardFixed && keyboardFixed !== normalized && keyboardFixed !== query.toLowerCase()) {
        suggestions.tips.push({
          type: 'keyboard_layout',
          message: `💡 Возможно, вы имели в виду: "${keyboardFixed}"`,
          action: keyboardFixed
        });
      }
    }

    // 2. Слишком длинный/специфичный запрос
    const words = normalized.split(/\s+/).filter(w => w.length > 1);
    if (words.length >= 3) {
      suggestions.tips.push({
        type: 'too_specific',
        message: `💡 Попробуйте короче: "${words[0]}"`,
        action: words[0]
      });
    }

    // 3. Ищем похожие слова (typo correction)
    if (dataSource && dataSource.length > 0) {
      const typoCorrections = findTypoCorrections(query, dataSource);
      if (typoCorrections.length > 0) {
        suggestions.didYouMean = typoCorrections.slice(0, 3).map(c => ({
          type: 'typo',
          message: `🔧 Возможно: "${c.corrected}"`,
          action: c.corrected,
          confidence: c.confidence
        }));
      }
    }

    // 4. Транслитерация
    const translitVariants = getTranslitVariants(query);
    translitVariants.forEach(v => {
      if (v !== normalized) {
        suggestions.alternatives.push({
          type: 'translit',
          message: `🌐 На другом языке: "${v}"`,
          action: v
        });
      }
    });

    // 5. Предлагаем категории если ничего не нашли
    const matchingCategories = [];
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some(kw => normalizeText(kw).includes(normalized) || normalized.includes(normalizeText(kw)))) {
        matchingCategories.push(category);
      }
    }
    if (matchingCategories.length > 0) {
      suggestions.tips.push({
        type: 'category',
        message: `📂 Попробуйте категорию: ${matchingCategories.slice(0, 2).join(', ')}`,
        action: matchingCategories[0]
      });
    }

    // 6. Популярные запросы
    suggestions.popular = SMART_SUGGESTIONS_CONFIG.popularSearches.slice(0, 5);

    return suggestions;
  }

  /**
   * Вычисление релевантности результата
   * 🆕 v2.8.1: Улучшенное ранжирование — полное слово > startsWith для другого слова
   */
  function calculateRelevance(item, query, matchType = 'exact') {
    const itemName = normalizeText(item.name || '');
    const normalizedQuery = normalizeText(query);
    let relevance = 0;

    // Базовые баллы по типу совпадения
    switch (matchType) {
      case 'exact':
        // Разбиваем название на слова для анализа
        const words = itemName.split(/\s+/);
        const isExactWord = words.includes(normalizedQuery); // "сыр" как полное слово
        const firstWordMatch = words[0] === normalizedQuery; // "сыр" = первое слово
        const startsWithQuery = itemName.startsWith(normalizedQuery); // "сырники" начинается с "сыр"
        const startsWithQueryIsOwnWord = startsWithQuery && words[0] === normalizedQuery; // первое слово = запрос

        if (itemName === normalizedQuery) {
          relevance = 100; // Точное совпадение названия
        } else if (firstWordMatch) {
          relevance = 95; // 🆕 Запрос = первое слово: "сыр твёрдый" для "сыр"
        } else if (isExactWord) {
          relevance = 92; // 🆕 Запрос = полное слово в названии: "сыр плавленый обезжиренный"
        } else if (startsWithQuery) {
          // startsWith но НЕ полное слово — "сырники" для "сыр"
          relevance = 82; // 🆕 Понижено с 90 до 82
        } else if (itemName.includes(' ' + normalizedQuery)) {
          relevance = 85; // слово целиком после пробела
        } else if (itemName.includes(normalizedQuery + ' ')) {
          relevance = 85; // слово в начале названия части  
        } else {
          // Проверяем, является ли query началом какого-либо слова (не первого)
          const startsWord = words.slice(1).some(w => w.startsWith(normalizedQuery));
          if (startsWord) {
            relevance = 78; // черк → Черкизово (начало слова, не первого)
          } else {
            relevance = 60; // Просто contains внутри слова
          }
        }
        break;
      case 'keyboard':   // 🆕 Исправление раскладки (высокий приоритет!)
        relevance = 82;
        break;
      case 'translit':  // 🆕 Транслитерация
        relevance = 78; // Между exact и synonym
        break;
      case 'abbreviation': // 🆕 Раскрытие сокращений
        relevance = 75;
        break;
      case 'permutation':  // 🆕 Перестановка слов
        relevance = 72;
        break;
      case 'category':     // 🆕 Поиск по категории
        relevance = 70;
        break;
      case 'synonym':
        relevance = 68;
        break;
      case 'typo':
        relevance = 45;
        break;
      case 'ngram':        // 🆕 N-gram поиск
        relevance = 40;
        break;
      case 'phonetic':
        relevance = 35;
        break;
    }

    // 🆕 v2.8.1: Бонусы — избранные получают существенный приоритет
    // Цель: избранный "Сыр твёрдый" (95+15=110) выше чем "Сырники" (82)
    if (item.isFavorite) relevance += 15; // 🆕 Избранные в ТОП (было +5, теперь +15)
    if (item.usageCount) relevance += Math.min(item.usageCount, 8); // часто используемые (max +8)

    // Бонус за короткое название (точнее совпадение)
    const lengthRatio = normalizedQuery.length / itemName.length;
    if (lengthRatio > 0.7) relevance += 4;      // Очень короткое название
    else if (lengthRatio > 0.5) relevance += 2; // Среднее

    return Math.max(0, relevance);
  }

  /**
   * 🆕 v2.6.0 Определение интента запроса (нутриенты, контекст)
   */
  function detectSearchIntent(query) {
    const normalized = normalizeText(query);
    const activeRules = {
      nutrient: [],
      context: []
    };

    // Check nutrient rules
    Object.entries(NUTRIENT_RULES).forEach(([key, rule]) => {
      if (rule.keywords.some(kw => normalized.includes(normalizeText(kw)))) {
        activeRules.nutrient.push(rule);
      }
    });

    // Check context rules
    Object.entries(CONTEXT_RULES).forEach(([key, rule]) => {
      if (rule.keywords.some(kw => normalized.includes(normalizeText(kw)))) {
        activeRules.context.push(rule);
      }
    });

    return activeRules;
  }

  // === ОСНОВНОЙ ПОИСК ===

  /**
   * Главная функция умного поиска
   * @param {string} query - поисковый запрос
   * @param {Array} dataSource - массив продуктов
   * @param {Object} options - опции поиска
   * @returns {Object} результаты поиска
   */
  function smartSearch(query, dataSource, options = {}) {
    const startTime = performance.now();
    const opts = { ...CONFIG, ...options };

    // Валидация
    if (!query || !dataSource || !Array.isArray(dataSource)) {
      return { results: [], suggestions: [], corrections: [], searchTime: 0, query };
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < opts.minQueryLength) {
      return { results: [], suggestions: [], corrections: [], searchTime: 0, query: trimmedQuery };
    }

    // 🆕 v2.6.0 Detect Intent
    const intent = detectSearchIntent(trimmedQuery);
    const hasIntent = intent.nutrient.length > 0 || intent.context.length > 0;

    // Calculate core query (remove intent keywords)
    let coreQuery = normalizeText(trimmedQuery);
    if (hasIntent) {
      [...intent.nutrient, ...intent.context].forEach(rule => {
        rule.keywords.forEach(kw => {
          const normKw = normalizeText(kw);
          coreQuery = coreQuery.replace(normKw, '').trim();
        });
      });
    }

    // If core query is empty (e.g. just "high protein"), we search ALL products but filter by intent
    const isPureIntentSearch = hasIntent && coreQuery.length < 2;

    // Проверка кеша
    const cacheKey = `${trimmedQuery}_${dataSource.length}`;
    if (opts.cacheEnabled && searchCache.has(cacheKey)) {
      const cached = searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < opts.cacheTimeout) {
        return { ...cached.result, fromCache: true };
      }
    }

    const normalizedQuery = isPureIntentSearch ? '' : coreQuery;
    const phoneticQuery = isPureIntentSearch ? '' : phoneticNormalize(coreQuery);
    const queryConstraints = parseNumericConstraints(trimmedQuery); // 🆕 v2.5.0
    const results = new Map();
    const corrections = [];
    const suggestions = [];

    // Индексируем продукты один раз
    const indexedProducts = getIndexedProducts(dataSource, opts);

    // 🆕 Получаем все варианты транслитерации
    const translitVariants = opts.enableTranslit ? getTranslitVariants(trimmedQuery) : [normalizedQuery];

    // 🆕 Конвертируем раскладку клавиатуры (vjkjrj → молоко)
    const keyboardFixedQuery = opts.enableKeyboardFix ? convertKeyboardLayout(trimmedQuery) : null;
    // 🆕 v2.7.0 Массив для visual feedback
    const keyboardVariants = keyboardFixedQuery && keyboardFixedQuery !== trimmedQuery
      ? [keyboardFixedQuery] : [];
    if (keyboardFixedQuery) {
      translitVariants.push(keyboardFixedQuery);
    }

    // 🆕 Раскрываем сокращения (б/ж → обезжиренный)
    const abbreviationExpansions = opts.enableAbbreviations ? expandAbbreviations(trimmedQuery) : [];

    // 🆕 Выбираем «лучшие» токены запроса: учитываем фикс раскладки и раскрытые сокращения
    const tokenCandidates = [trimmedQuery];
    if (keyboardFixedQuery) tokenCandidates.push(keyboardFixedQuery);
    if (abbreviationExpansions && abbreviationExpansions.length) {
      abbreviationExpansions.forEach(x => tokenCandidates.push(x));
    }
    let queryTokens = [];
    let bestTokenScore = -1;
    for (const candidate of tokenCandidates) {
      const t = tokenize(candidate);
      const score = t.length * 10 + t.reduce((sum, w) => sum + Math.min(w.length, 10), 0);
      if (score > bestTokenScore) {
        bestTokenScore = score;
        queryTokens = t;
      }
    }

    // 🆕 Генерируем перестановки слов
    const wordPermutations = opts.enableWordPermutations ? generateWordPermutations(trimmedQuery) : [];

    // === 🆕 v2.6.0 PURE INTENT SEARCH ===
    if (isPureIntentSearch) {
      indexedProducts.forEach(entry => {
        const item = entry.item;
        let matchesIntent = true;
        let intentScore = 0;

        // Check nutrient rules
        for (const rule of intent.nutrient) {
          if (rule.check && !rule.check(item)) {
            matchesIntent = false;
            break;
          }
          intentScore += 20;
        }

        if (matchesIntent) {
          // Check context rules
          for (const rule of intent.context) {
            if (rule.check && !rule.check(item)) {
              matchesIntent = false;
              break;
            }

            let isBoosted = false;
            const nameNorm = entry.nameNorm;

            // Check boosted products
            if (rule.boostProducts && rule.boostProducts.some(bp => nameNorm.includes(normalizeText(bp)))) {
              isBoosted = true;
            }

            // Check boosted categories
            if (!isBoosted && rule.boostCategories) {
              rule.boostCategories.forEach(cat => {
                const catKeywords = CATEGORY_KEYWORDS[cat.toLowerCase()];
                if (catKeywords && catKeywords.some(kw => nameNorm.includes(normalizeText(kw)))) {
                  isBoosted = true;
                }
              });
            }

            if (isBoosted) {
              intentScore += 30;
            } else if (rule.boostCategories || rule.boostProducts) {
              // If rule has boost lists and item doesn't match, it's not a context match
              matchesIntent = false;
            }
          }
        }

        if (matchesIntent) {
          const key = item.id || item.name;
          results.set(key, { ...item, relevance: 50 + intentScore, matchType: 'intent' });
        }
      });

      const sorted = Array.from(results.values())
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, opts.maxResults);

      return {
        results: sorted,
        suggestions: [],
        corrections: [],
        searchTime: performance.now() - startTime,
        query: trimmedQuery
      };
    }

    // === 0. 🆕 ПОИСК ПО КАТЕГОРИИ ===
    const categoryResults = findCategoryProducts(trimmedQuery, dataSource);
    categoryResults.forEach(item => {
      const relevance = 80;
      const key = item.id || item.name;
      results.set(key, { ...item, relevance, matchType: 'category' });
    });

    // === 1. ТОЧНЫЙ ПОИСК (+ транслитерация + keyboard fix) ===
    indexedProducts.forEach(entry => {
      const item = entry.item;
      const itemName = entry.nameNorm;

      // 🆕 v2.5.0 Numeric-aware фильтрация с единицами
      const numericScore = checkNumericMatch(queryConstraints, entry.numbers);
      if (numericScore < 0.6) return; // Слишком сильное несовпадение

      // 🆕 v2.6.0 Intent Check (Mixed Search)
      let intentBoost = 0;
      if (hasIntent) {
        let matchesIntent = true;
        for (const rule of intent.nutrient) {
          if (rule.check && !rule.check(item)) {
            matchesIntent = false;
            break;
          }
        }
        if (!matchesIntent) return; // Skip

        for (const rule of intent.context) {
          if (rule.check && !rule.check(item)) return;

          let isBoosted = false;
          if (rule.boostProducts && rule.boostProducts.some(bp => itemName.includes(normalizeText(bp)))) isBoosted = true;
          if (!isBoosted && rule.boostCategories) {
            rule.boostCategories.forEach(cat => {
              const catKeywords = CATEGORY_KEYWORDS[cat.toLowerCase()];
              if (catKeywords && catKeywords.some(kw => itemName.includes(normalizeText(kw)))) isBoosted = true;
            });
          }
          if (isBoosted) intentBoost += 20;
        }
      }

      // Проверяем по всем вариантам транслитерации
      for (const variant of translitVariants) {
        if (itemName.includes(variant)) {
          const matchType = variant === normalizedQuery ? 'exact' :
            variant === keyboardFixedQuery ? 'keyboard' : 'translit';
          let relevance = calculateRelevance(item, trimmedQuery, matchType);

          // 🆕 v2.5.0 Numeric adjustment
          relevance *= numericScore;

          // 🆕 v2.6.0 Intent Boost
          relevance += intentBoost;

          // Token-aware бонус
          const tokenScore = computeTokenMatchScore(queryTokens, itemName, entry.tokens);
          relevance += tokenScore.bonus;

          // 🆕 Добавляем персональный буст
          if (opts.enablePersonalization) {
            relevance += getPersonalBoost(item.id);
          }

          const key = item.id || item.name;
          if (!results.has(key) || results.get(key).relevance < relevance) {
            results.set(key, {
              ...item,
              relevance,
              matchType,
              matchedVariant: variant !== normalizedQuery ? variant : undefined
            });
          }
          break; // Нашли совпадение — выходим
        }
      }
    });

    // === 1.5. 🆕 ПОИСК ПО РАСКРЫТЫМ СОКРАЩЕНИЯМ ===
    if (abbreviationExpansions.length > 0) {
      abbreviationExpansions.forEach(expanded => {
        const normalizedExpanded = normalizeText(expanded);
        indexedProducts.forEach(entry => {
          const item = entry.item;
          const itemName = entry.nameNorm;

          const numericScore = checkNumericMatch(queryConstraints, entry.numbers);
          if (numericScore < 0.6) return;
          if (itemName.includes(normalizedExpanded)) {
            let relevance = calculateRelevance(item, expanded, 'exact') - 5;
            relevance *= numericScore; // 🆕 v2.5.0

            const tokenScore = computeTokenMatchScore(queryTokens, itemName, entry.tokens);
            relevance += tokenScore.bonus;
            if (opts.enablePersonalization) {
              relevance += getPersonalBoost(item.id);
            }
            const key = item.id || item.name;
            if (!results.has(key) || results.get(key).relevance < relevance) {
              results.set(key, {
                ...item,
                relevance,
                matchType: 'abbreviation',
                expandedFrom: trimmedQuery,
                expandedTo: expanded
              });
            }
          }
        });
      });
    }

    // === 1.6. 🆕 ПОИСК ПО ПЕРЕСТАНОВКАМ СЛОВ ===
    if (wordPermutations.length > 0) {
      wordPermutations.forEach(permuted => {
        const normalizedPermuted = normalizeText(permuted);
        indexedProducts.forEach(entry => {
          const item = entry.item;
          const itemName = entry.nameNorm;

          const numericScore = checkNumericMatch(queryConstraints, entry.numbers);
          if (numericScore < 0.6) return;
          if (itemName.includes(normalizedPermuted)) {
            let relevance = calculateRelevance(item, permuted, 'exact') - 3;
            relevance *= numericScore; // 🆕 v2.5.0

            const tokenScore = computeTokenMatchScore(queryTokens, itemName, entry.tokens);
            relevance += tokenScore.bonus;
            if (opts.enablePersonalization) {
              relevance += getPersonalBoost(item.id);
            }
            const key = item.id || item.name;
            if (!results.has(key) || results.get(key).relevance < relevance) {
              results.set(key, {
                ...item,
                relevance,
                matchType: 'permutation',
                permutedQuery: permuted
              });
            }
          }
        });
      });
    }

    // === 1.7. 🆕 TOKEN-AWARE AND-SEARCH (слова в любом порядке, не обязательно подряд) ===
    // Пример: "гречка 800" матчится с "гречка ядрица 800г"
    if (queryTokens.length > 0 && results.size < 5) {
      indexedProducts.forEach(entry => {
        const item = entry.item;

        if (checkNumericMatch(queryConstraints, entry.numbers) < 0.6) return;

        const tokenScore = computeTokenMatchScore(queryTokens, entry.nameNorm, entry.tokens);
        // Для 1 токена требуем высокий сигнал; для 2+ допускаем полпокрытия.
        const threshold = queryTokens.length >= 2 ? 0.5 : 1;
        if (tokenScore.coverage < threshold) return;

        let relevance = 55 + Math.round(tokenScore.coverage * 25) + tokenScore.bonus;
        if (opts.enablePersonalization) {
          relevance += getPersonalBoost(item.id);
        }

        const key = item.id || item.name;
        if (!results.has(key) || results.get(key).relevance < relevance) {
          results.set(key, {
            ...item,
            relevance,
            matchType: 'tokens'
          });
        }
      });
    }

    // === 2. ПОИСК ПО СИНОНИМАМ ===
    if (opts.enableSynonyms) {
      const synonymList = findSynonyms(trimmedQuery);
      synonymList.forEach(synonym => {
        const normalizedSynonym = normalizeText(synonym);
        indexedProducts.forEach(entry => {
          const item = entry.item;
          const itemName = entry.nameNorm;

          if (checkNumericMatch(queryConstraints, entry.numbers) < 0.6) return;
          if (itemName.includes(normalizedSynonym)) {
            const relevance = calculateRelevance(item, synonym, 'synonym');
            const key = item.id || item.name;
            if (!results.has(key) || results.get(key).relevance < relevance) {
              results.set(key, { ...item, relevance, matchType: 'synonym', matchedSynonym: synonym });
            }
          }
        });
      });
    }

    // === 2.5. 🆕 v2.7.0 ПОИСК ПО БРЕНДАМ ===
    // Ищем все варианты написания бренда (Danone = Данон = Дэнон)
    let matchedBrand = null;
    if (opts.enableBrands !== false) {
      const brandVariants = findBrandVariants(trimmedQuery);
      if (brandVariants.length > 0) {
        matchedBrand = brandVariants[0]; // Каноническое название
        brandVariants.forEach(variant => {
          const normalizedVariant = normalizeText(variant);
          indexedProducts.forEach(entry => {
            const item = entry.item;
            const itemName = entry.nameNorm;

            if (itemName.includes(normalizedVariant)) {
              let relevance = calculateRelevance(item, variant, 'exact') + 5; // Бренд-бонус
              if (opts.enablePersonalization) {
                relevance += getPersonalBoost(item.id);
              }
              const key = item.id || item.name;
              if (!results.has(key) || results.get(key).relevance < relevance) {
                results.set(key, {
                  ...item,
                  relevance,
                  matchType: 'brand',
                  matchedBrand: matchedBrand
                });
              }
            }
          });
        });
      }
    }

    // === 3. ИСПРАВЛЕНИЕ ОПЕЧАТОК (если мало результатов) ===
    if (opts.enableTypoCorrection && results.size < 3) {
      // 🆕 v2.6.0: Check translit variants for typos too (e.g. "mloko" -> "млоко" -> "молоко")
      const candidates = new Set([trimmedQuery]);
      if (opts.enableTranslit) {
        translitVariants.forEach(v => candidates.add(v));
      }

      candidates.forEach(candidate => {
        const typoCorrections = findTypoCorrections(candidate, dataSource);

        typoCorrections.slice(0, 3).forEach(correction => {
          // Avoid duplicates in corrections list
          if (!corrections.some(c => c.corrected === correction.corrected)) {
            corrections.push(correction);
          }

          const normalizedCorrected = normalizeText(correction.corrected);

          indexedProducts.forEach(entry => {
            const item = entry.item;
            const itemName = entry.nameNorm;

            if (checkNumericMatch(queryConstraints, entry.numbers) < 0.6) return;
            if (itemName.includes(normalizedCorrected)) {
              const baseRelevance = calculateRelevance(item, correction.corrected, 'typo');
              const relevance = baseRelevance * correction.confidence;
              const key = item.id || item.name;
              if (!results.has(key) || results.get(key).relevance < relevance) {
                results.set(key, {
                  ...item,
                  relevance,
                  matchType: 'typo',
                  originalQuery: trimmedQuery,
                  correctedQuery: correction.corrected,
                  confidence: correction.confidence
                });
              }
            }
          });
        });
      });
    }

    // === 4. ФОНЕТИЧЕСКИЙ ПОИСК (если совсем мало) ===
    if (opts.enablePhonetic && results.size < 3 && phoneticQuery !== normalizedQuery) {
      indexedProducts.forEach(entry => {
        const item = entry.item;
        const itemPhonetic = entry.namePhon;

        if (!numbersMatchAll(queryConstraints, entry.numbers)) return;
        if (itemPhonetic.includes(phoneticQuery)) {
          let relevance = calculateRelevance(item, trimmedQuery, 'phonetic');

          const tokenScore = computeTokenMatchScore(queryTokens, entry.nameNorm, entry.tokens);
          relevance += tokenScore.bonus;
          if (opts.enablePersonalization) {
            relevance += getPersonalBoost(item.id);
          }
          const key = item.id || item.name;
          if (!results.has(key) || results.get(key).relevance < relevance) {
            results.set(key, { ...item, relevance, matchType: 'phonetic' });
          }
        }
      });
    }

    // === 5. 🆕 N-GRAM ПОИСК (глубокий поиск по частям слов) ===
    if (opts.enableNgram && results.size < 5 && normalizedQuery.length >= 4) {
      const ngramResults = ngramSearch(trimmedQuery, dataSource);
      ngramResults.forEach(item => {
        let relevance = 30 + (5 - (item.ngramDistance || 0)) * 5;
        if (opts.enablePersonalization) {
          relevance += getPersonalBoost(item.id);
        }
        const key = item.id || item.name;
        if (!results.has(key)) {
          results.set(key, { ...item, relevance, matchType: 'ngram' });
        }
      });
    }

    // === 6. 🆕 v2.7.0 СЕМАНТИЧЕСКИЙ ПОИСК (ML-lite кластеры) ===
    // Если мало результатов, ищем по смысловым кластерам
    if (opts.enableSemantic !== false && results.size < 3) {
      const semanticResults = findSemanticMatches(trimmedQuery, dataSource, 10);
      semanticResults.forEach(item => {
        let relevance = 25; // Низкий приоритет — это "похожие" результаты
        if (opts.enablePersonalization) {
          relevance += getPersonalBoost(item.id);
        }
        const key = item.id || item.name;
        if (!results.has(key)) {
          results.set(key, {
            ...item,
            relevance,
            matchType: 'semantic',
            semanticCluster: item.semanticCluster
          });
        }
      });
    }

    // === 7. ГЕНЕРАЦИЯ ПРЕДЛОЖЕНИЙ ===
    if (normalizedQuery.length >= 2) {
      const suggestionSet = new Set();

      // Из популярных слов
      commonWords.forEach(word => {
        if (word.startsWith(normalizedQuery) && word !== normalizedQuery) {
          suggestionSet.add(word);
        }
      });

      // Из найденных результатов
      Array.from(results.values()).slice(0, 10).forEach(result => {
        const words = normalizeText(result.name).split(/\s+/);
        words.forEach(word => {
          if (word.length > 2 && word.startsWith(normalizedQuery) && word !== normalizedQuery) {
            suggestionSet.add(word);
          }
        });
      });

      suggestions.push(...Array.from(suggestionSet).slice(0, opts.maxSuggestions));
    }

    // === 🆕 v2.8.2 USAGE STATS BOOST (персональная история из opts.usageStats) ===
    if (opts.usageStats instanceof Map && opts.usageStats.size > 0) {
      const windowDays = Number(opts.usageWindowDays) || 21;
      const nowMs = Date.now();
      results.forEach((entry) => {
        const pid = String(entry.id || entry.product_id || '');
        const nameRaw = String(entry.name || '');
        const nameNorm = normalizeText(nameRaw);
        const stats = (pid && opts.usageStats.get(pid))
          || opts.usageStats.get(nameNorm)
          || opts.usageStats.get(nameRaw);
        if (stats && stats.count > 0 && stats.lastUsed) {
          const daysAgo = Math.floor((nowMs - stats.lastUsed) / (1000 * 60 * 60 * 24));
          if (daysAgo <= windowDays) {
            entry.relevance = (entry.relevance || 0) + Math.min(stats.count, 8);
          }
        }
      });
    }

    // === 🆕 v2.8.2 FAVORITES BOOST (из opts.favorites — Set product ids) ===
    if (opts.favorites instanceof Set && opts.favorites.size > 0) {
      results.forEach((entry) => {
        const pid = String(entry.id || entry.product_id || '');
        if (pid && opts.favorites.has(pid)) {
          entry.relevance = (entry.relevance || 0) + 15; // идентично calculateRelevance isFavorite bonus
        }
      });
    }

    // === ФИНАЛЬНАЯ СОРТИРОВКА ===
    const finalResults = Array.from(results.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, opts.maxResults || opts.limit || 50);

    const searchTime = performance.now() - startTime;

    // === 🆕 v2.7.0 VISUAL FEEDBACK — что было исправлено/распознано ===
    const visualFeedback = {
      // Показываем если была коррекция опечатки
      correctedFrom: corrections.length > 0 ? trimmedQuery : null,
      correctedTo: corrections.length > 0 ? corrections[0].corrected : null,
      // Показываем если был транслит (латиница → кириллица)
      transliteratedFrom: finalResults.some(r => r.matchType === 'translit') ? trimmedQuery : null,
      transliteratedTo: finalResults.some(r => r.matchType === 'translit') && translitVariants.length > 0
        ? translitVariants[0] : null,
      // Показываем если была исправлена раскладка
      keyboardFixed: finalResults.some(r => r.matchType === 'keyboard'),
      keyboardFrom: finalResults.some(r => r.matchType === 'keyboard') ? trimmedQuery : null,
      keyboardTo: finalResults.some(r => r.matchType === 'keyboard') && keyboardVariants.length > 0
        ? keyboardVariants[0] : null,
      // Показываем найденный бренд
      matchedBrand: matchedBrand,
      // Показываем категорию если искали по ней
      matchedCategory: finalResults.some(r => r.matchType === 'category')
        ? finalResults.find(r => r.matchType === 'category')?.matchedCategory : null,
      // Semantic cluster
      semanticCluster: finalResults.some(r => r.matchType === 'semantic')
        ? finalResults.find(r => r.matchType === 'semantic')?.semanticCluster : null
    };

    // === 🆕 v2.7.0 SMART SUGGESTIONS — если результатов нет ===
    let smartSuggestions = null;
    if (finalResults.length === 0) {
      smartSuggestions = generateSmartSuggestions(trimmedQuery, dataSource);
    }

    const result = {
      results: finalResults,
      suggestions,
      corrections,
      searchTime: Math.round(searchTime * 100) / 100,
      query: trimmedQuery,
      totalFound: finalResults.length,
      hasTypoCorrections: corrections.length > 0,
      hasSynonyms: finalResults.some(r => r.matchType === 'synonym'),
      hasTranslit: finalResults.some(r => r.matchType === 'translit'), // 🆕
      hasKeyboardFix: finalResults.some(r => r.matchType === 'keyboard'), // 🆕
      hasAbbreviation: finalResults.some(r => r.matchType === 'abbreviation'), // 🆕
      hasPermutation: finalResults.some(r => r.matchType === 'permutation'), // 🆕
      hasCategory: finalResults.some(r => r.matchType === 'category'), // 🆕
      hasBrand: finalResults.some(r => r.matchType === 'brand'), // 🆕 v2.7.0
      hasSemantic: finalResults.some(r => r.matchType === 'semantic'), // 🆕 v2.7.0
      // 🆕 v2.7.0 Visual Feedback
      visualFeedback,
      // 🆕 v2.7.0 Smart Suggestions (только если нет результатов)
      smartSuggestions,
      searchStats: {
        exactMatches: finalResults.filter(r => r.matchType === 'exact').length,
        translitMatches: finalResults.filter(r => r.matchType === 'translit').length, // 🆕
        keyboardMatches: finalResults.filter(r => r.matchType === 'keyboard').length, // 🆕
        abbreviationMatches: finalResults.filter(r => r.matchType === 'abbreviation').length, // 🆕
        permutationMatches: finalResults.filter(r => r.matchType === 'permutation').length, // 🆕
        categoryMatches: finalResults.filter(r => r.matchType === 'category').length, // 🆕
        ngramMatches: finalResults.filter(r => r.matchType === 'ngram').length, // 🆕
        brandMatches: finalResults.filter(r => r.matchType === 'brand').length, // 🆕 v2.7.0
        semanticMatches: finalResults.filter(r => r.matchType === 'semantic').length, // 🆕 v2.7.0
        typoMatches: finalResults.filter(r => r.matchType === 'typo').length,
        synonymMatches: finalResults.filter(r => r.matchType === 'synonym').length,
        phoneticMatches: finalResults.filter(r => r.matchType === 'phonetic').length
      }
    };

    // Сохраняем в кеш
    if (opts.cacheEnabled) {
      searchCache.set(cacheKey, { result, timestamp: Date.now() });

      // Очистка старых записей
      if (searchCache.size > 200) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
      }
    }

    // Отладка
    if (opts.debugMode) {
      console.group(`🔍 SmartSearch: "${trimmedQuery}"`);
      console.log('⏱️ Время:', searchTime.toFixed(2), 'мс');
      console.log('📊 Найдено:', finalResults.length);
      console.log('💡 Предложения:', suggestions);
      console.log('🔧 Исправления:', corrections);
      console.log('📈 Статистика:', result.searchStats);
      console.groupEnd();
    }

    return result;
  }

  /**
   * Автодополнение при вводе
   */
  function suggest(partialQuery, dataSource, maxSuggestions = 5) {
    if (!partialQuery || partialQuery.length < 2) return [];

    const normalized = normalizeText(partialQuery);
    const suggestions = new Set();

    // Из популярных слов
    commonWords.forEach(word => {
      if (word.startsWith(normalized)) {
        suggestions.add(word);
      }
    });

    // Из реальных данных
    if (dataSource && Array.isArray(dataSource)) {
      dataSource.forEach(item => {
        const name = normalizeText(item.name || '');
        if (name.startsWith(normalized)) {
          suggestions.add(item.name);
        }
        // Слова внутри названия
        name.split(/\s+/).forEach(word => {
          if (word.length > 2 && word.startsWith(normalized)) {
            suggestions.add(word);
          }
        });
      });
    }

    return Array.from(suggestions).slice(0, maxSuggestions);
  }

  /**
   * "Возможно вы искали" — альтернативные запросы
   * Возвращает массив объектов с оригинальным написанием и причиной
   */
  function getDidYouMean(query, dataSource, maxSuggestions = 3) {
    if (!query || query.length < 2) return [];

    const normalized = normalizeText(query);
    const suggestions = [];
    const seen = new Set();

    // 🆕 0. Транслитерация — предложить вариант на другом языке
    if (CONFIG.enableTranslit) {
      const canonical = getCanonicalForm(query);
      if (canonical && !seen.has(canonical)) {
        suggestions.push({
          text: canonical,
          reason: 'translit',
          label: '🌐 транслит'
        });
        seen.add(canonical);
      }

      // Также предложить транслитерированный вариант
      const transliterated = transliterate(query);
      if (transliterated !== normalized && !seen.has(transliterated)) {
        suggestions.push({
          text: transliterated,
          reason: 'translit',
          label: '🌐 транслит'
        });
        seen.add(transliterated);
      }
    }

    // 1. Поиск синонимов (если запрос = синоним, предложить основное слово)
    for (const [mainWord, syns] of Object.entries(synonyms)) {
      if (syns.some(s => normalizeText(s) === normalized || s.includes(normalized))) {
        if (!seen.has(mainWord)) {
          suggestions.push({
            text: mainWord,
            reason: 'synonym',
            label: '≈ синоним'
          });
          seen.add(mainWord);
        }
      }
    }

    // 2. Исправление опечаток — ищем похожие слова из dataSource
    if (dataSource && Array.isArray(dataSource)) {
      const maxDist = CONFIG.getMaxTypoDistance(normalized.length);
      const candidates = [];

      dataSource.forEach(item => {
        const name = normalizeText(item.name || '');
        const words = name.split(/\s+/);

        words.forEach(word => {
          if (word.length < 2 || seen.has(word)) return;

          const dist = levenshteinDistance(normalized, word, maxDist + 1);
          if (dist > 0 && dist <= maxDist) {
            candidates.push({
              text: word,
              distance: dist,
              reason: 'typo',
              label: '🔧 исправление'
            });
            seen.add(word);
          }
        });
      });

      // Сортируем по расстоянию и берём лучшие
      candidates.sort((a, b) => a.distance - b.distance);
      suggestions.push(...candidates.slice(0, maxSuggestions - suggestions.length));
    }

    // 3. Похожие по началу слова (автодополнение)
    if (suggestions.length < maxSuggestions && dataSource) {
      const completions = [];

      dataSource.forEach(item => {
        const name = item.name || '';
        const normalizedName = normalizeText(name);

        if (normalizedName.startsWith(normalized) && !seen.has(normalizedName)) {
          completions.push({
            text: name,
            reason: 'completion',
            label: '→ продолжение'
          });
          seen.add(normalizedName);
        }
      });

      suggestions.push(...completions.slice(0, maxSuggestions - suggestions.length));
    }

    return suggestions.slice(0, maxSuggestions);
  }

  /**
   * Подсветка совпадений в тексте
   * Возвращает массив частей текста с флагом isMatch
   * @param {string} text - исходный текст
   * @param {string} query - поисковый запрос
   * @returns {Array<{text: string, isMatch: boolean}>}
   */
  function highlightMatches(text, query) {
    if (!text || !query) {
      return [{ text: text || '', isMatch: false }];
    }

    const normalizedText = normalizeText(text);
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length >= 2);

    if (queryWords.length === 0) {
      return [{ text, isMatch: false }];
    }

    // Находим все позиции совпадений в нормализованном тексте
    const matches = [];

    // 🆕 Собираем все варианты для поиска (включая транслитерацию)
    const allVariants = new Set();
    queryWords.forEach(queryWord => {
      allVariants.add(queryWord);

      // Добавляем синонимы
      const synonymList = findSynonyms(queryWord);
      synonymList.forEach(syn => allVariants.add(syn));

      // 🆕 Добавляем транслитерированные варианты
      if (CONFIG.enableTranslit) {
        const translitVariants = getTranslitVariants(queryWord);
        translitVariants.forEach(v => allVariants.add(v));
      }
    });

    // Ищем все варианты в тексте
    allVariants.forEach(variant => {
      let searchIndex = 0;
      while (true) {
        const pos = normalizedText.indexOf(variant, searchIndex);
        if (pos === -1) break;

        matches.push({
          start: pos,
          end: pos + variant.length
        });
        searchIndex = pos + 1;
      }
    });

    if (matches.length === 0) {
      return [{ text, isMatch: false }];
    }

    // Сортируем и объединяем пересекающиеся интервалы
    matches.sort((a, b) => a.start - b.start);
    const merged = [matches[0]];

    for (let i = 1; i < matches.length; i++) {
      const last = merged[merged.length - 1];
      const current = matches[i];

      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }

    // Создаём массив частей
    // Важно: позиции в normalizedText могут не совпадать с text из-за разной длины символов
    // Поэтому работаем с оригинальным текстом напрямую через lowercase
    const lowerText = text.toLowerCase().replace(/ё/g, 'е');
    const parts = [];
    let lastEnd = 0;

    merged.forEach(match => {
      // Добавляем текст до совпадения
      if (match.start > lastEnd) {
        parts.push({
          text: text.substring(lastEnd, match.start),
          isMatch: false
        });
      }

      // Добавляем совпадение (используем оригинальный регистр из text)
      parts.push({
        text: text.substring(match.start, match.end),
        isMatch: true
      });

      lastEnd = match.end;
    });

    // Добавляем остаток текста
    if (lastEnd < text.length) {
      parts.push({
        text: text.substring(lastEnd),
        isMatch: false
      });
    }

    return parts;
  }

  /**
   * Рендер подсвеченного текста (React элементы)
   * @param {string} text - исходный текст
   * @param {string} query - поисковый запрос  
   * @param {Object} React - React объект
   * @returns {Array} массив React элементов
   */
  function renderHighlightedText(text, query, React) {
    if (!React) {
      console.warn('renderHighlightedText: React не передан');
      return text;
    }

    const parts = highlightMatches(text, query);

    return parts.map((part, i) => {
      if (part.isMatch) {
        return React.createElement('mark', {
          key: i,
          className: 'search-highlight',
          style: {
            backgroundColor: 'rgba(255, 213, 0, 0.35)', // Приглушённый жёлтый
            borderRadius: '2px',
            padding: '0 1px'
          }
        }, part.text);
      }
      return part.text;
    });
  }

  /**
   * Очистка кеша
   */
  function clearCache() {
    searchCache.clear();
    productIndex = null;
    lastProductsHash = null;
    if (CONFIG.debugMode) console.log('🧹 SmartSearch: кеш очищен');
  }

  /**
   * Статистика поиска
   */
  function getStats() {
    return {
      cacheSize: searchCache.size,
      commonWordsCount: commonWords.size,
      synonymsCount: Object.keys(synonyms).length,
      phoneticRulesCount: phoneticRules.length,
      translitPairsCount: Object.keys(TRANSLIT_PAIRS).length,
      spellingVariantsCount: Object.keys(SPELLING_VARIANTS).length,
      abbreviationsCount: Object.keys(ABBREVIATIONS).length,
      categoriesCount: Object.keys(CATEGORY_KEYWORDS).length,
      userStatsCount: userProductStats.size,
      config: { ...CONFIG }
    };
  }

  // === API ===
  const SmartSearchWithTypos = {
    // Основной поиск
    search: smartSearch,

    // Автодополнение
    suggest,

    // "Возможно вы искали" — альтернативные запросы
    getDidYouMean,

    // Подсветка совпадений
    highlightMatches,

    // Рендер подсвеченного текста (React)
    renderHighlightedText,

    // Исправление опечаток
    correctTypos: findTypoCorrections,

    // Поиск синонимов
    findSynonyms,

    // 🆕 Транслитерация
    transliterate,

    // 🆕 Получить все варианты запроса (вкл. транслит)
    getTranslitVariants,

    // 🆕 Определить язык текста
    detectLanguage,

    // 🆕 Каноническая форма слова
    getCanonicalForm,

    // 🆕 Конвертация раскладки клавиатуры
    convertKeyboardLayout,

    // 🆕 Раскрытие сокращений  
    expandAbbreviations,

    // 🆕 Перестановки слов
    generateWordPermutations,

    // 🆕 N-gram поиск
    ngramSearch,

    // 🆕 Поиск по категории
    findCategoryProducts,

    // 🆕 v2.7.0 Поиск вариантов бренда
    findBrandVariants,

    // 🆕 v2.7.0 Семантический поиск (ML-lite)
    findSemanticMatches,

    // 🆕 v2.7.0 Умные подсказки при пустом результате
    generateSmartSuggestions,

    // 🆕 Персонализация: трекинг использования продукта
    trackProductUsage,

    // 🆕 Доступ к usage stats
    getUsageStats,
    syncUsageStatsFromDays,
    ensureUsageStatsFresh,

    // 🆕 Сохранение персональной статистики
    saveUserStats,

    // Настройка
    configure(newConfig) {
      Object.assign(CONFIG, newConfig);
    },

    // Добавление синонимов
    addSynonyms(word, synonymList) {
      const key = normalizeText(word);
      if (!synonyms[key]) synonyms[key] = [];
      synonymList.forEach(s => {
        const normalized = normalizeText(s);
        if (!synonyms[key].includes(normalized)) {
          synonyms[key].push(normalized);
        }
      });
    },

    // 🆕 Добавление пар транслитерации
    addTranslitPairs(pairs) {
      Object.entries(pairs).forEach(([key, value]) => {
        const normalizedKey = normalizeText(key);
        const normalizedValue = normalizeText(value);
        TRANSLIT_PAIRS[normalizedKey] = normalizedValue;
        TRANSLIT_PAIRS[normalizedValue] = normalizedKey;
      });
    },

    // 🆕 Добавление вариантов написания
    addSpellingVariants(canonical, variants) {
      const normalizedCanonical = normalizeText(canonical);
      if (!SPELLING_VARIANTS[normalizedCanonical]) {
        SPELLING_VARIANTS[normalizedCanonical] = [];
      }
      variants.forEach(v => {
        const normalized = normalizeText(v);
        if (!SPELLING_VARIANTS[normalizedCanonical].includes(normalized)) {
          SPELLING_VARIANTS[normalizedCanonical].push(normalized);
        }
      });
    },

    // 🆕 Добавление сокращений
    addAbbreviations(abbr, meanings) {
      const key = normalizeText(abbr);
      ABBREVIATIONS[key] = meanings.map(m => normalizeText(m));
    },

    // 🆕 Добавление категории продуктов
    addCategoryKeywords(category, keywords) {
      CATEGORY_KEYWORDS[category] = keywords;
    },

    // Добавление популярных слов
    addCommonWords(words) {
      words.forEach(word => commonWords.add(normalizeText(word)));
    },

    // Очистка кеша
    clearCache,

    // Статистика
    getStats,

    // Утилиты (для внешнего использования)
    utils: {
      normalizeText,
      phoneticNormalize,
      levenshteinDistance,
      calculateRelevance,
      highlightMatches,
      renderHighlightedText,
      transliterate,
      getTranslitVariants,
      detectLanguage,
      getCanonicalForm,
      convertKeyboardLayout,
      expandAbbreviations,
      generateWordPermutations,
      getPersonalBoost,
      // 🆕 v2.7.0
      findBrandVariants,
      findSemanticMatches,
      generateSmartSuggestions
    },

    // 🆕 v2.7.0 Константы для UI
    BRAND_DICTIONARY,
    SEMANTIC_CLUSTERS,
    SMART_SUGGESTIONS_CONFIG
  };

  // Экспорт
  HEYS.SmartSearchWithTypos = SmartSearchWithTypos;
  HEYS.SmartSearch = SmartSearchWithTypos; // alias

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : globalThis);
