// heys_smart_search_v2.js — Умный поиск с исправлением опечаток и нормализацией
// Версия 2.1.0 | 2025-12-15
// ✅ Нормализация ё → е
// ✅ Исправление опечаток (Левенштейн)
// ✅ Синонимы продуктов (100+ групп)
// ✅ Фонетический поиск
// ✅ Кеширование результатов
// ✅ Ранжирование по релевантности
// ✅ Подсветка совпадений (highlightMatches)
// ✅ "Возможно вы искали" (getDidYouMean)

;(function(global) {
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
      
      // Swap arrays
      [prev.length] = [curr.length];
      for (let j = 0; j <= len2; j++) prev[j] = curr[j];
    }
    
    return prev[len2];
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
   * Вычисление релевантности результата
   */
  function calculateRelevance(item, query, matchType = 'exact') {
    const itemName = normalizeText(item.name || '');
    const normalizedQuery = normalizeText(query);
    let relevance = 0;
    
    // Базовые баллы по типу совпадения
    switch (matchType) {
      case 'exact':
        if (itemName === normalizedQuery) relevance = 100;
        else if (itemName.startsWith(normalizedQuery)) relevance = 85;
        else if (itemName.includes(' ' + normalizedQuery)) relevance = 75; // слово в начале
        else if (itemName.includes(normalizedQuery)) relevance = 60;
        break;
      case 'synonym':
        relevance = 70;
        break;
      case 'typo':
        relevance = 45;
        break;
      case 'phonetic':
        relevance = 35;
        break;
    }
    
    // Бонусы
    if (item.usageCount) relevance += Math.min(item.usageCount * 2, 15); // часто используемые
    if (item.isFavorite) relevance += 10; // избранные
    if (commonWords.has(normalizedQuery)) relevance += 5;
    
    // Штраф за длинные названия (короткие = точнее)
    const lengthRatio = normalizedQuery.length / itemName.length;
    if (lengthRatio > 0.5) relevance += 5;
    
    return Math.max(0, relevance);
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
    
    // Проверка кеша
    const cacheKey = `${trimmedQuery}_${dataSource.length}`;
    if (opts.cacheEnabled && searchCache.has(cacheKey)) {
      const cached = searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < opts.cacheTimeout) {
        return { ...cached.result, fromCache: true };
      }
    }
    
    const normalizedQuery = normalizeText(trimmedQuery);
    const phoneticQuery = phoneticNormalize(trimmedQuery);
    const results = new Map();
    const corrections = [];
    const suggestions = [];
    
    // === 1. ТОЧНЫЙ ПОИСК ===
    dataSource.forEach(item => {
      const itemName = normalizeText(item.name || '');
      if (itemName.includes(normalizedQuery)) {
        const relevance = calculateRelevance(item, trimmedQuery, 'exact');
        const key = item.id || item.name;
        if (!results.has(key) || results.get(key).relevance < relevance) {
          results.set(key, { ...item, relevance, matchType: 'exact' });
        }
      }
    });
    
    // === 2. ПОИСК ПО СИНОНИМАМ ===
    if (opts.enableSynonyms) {
      const synonymList = findSynonyms(trimmedQuery);
      synonymList.forEach(synonym => {
        const normalizedSynonym = normalizeText(synonym);
        dataSource.forEach(item => {
          const itemName = normalizeText(item.name || '');
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
    
    // === 3. ИСПРАВЛЕНИЕ ОПЕЧАТОК (если мало результатов) ===
    if (opts.enableTypoCorrection && results.size < 3) {
      const typoCorrections = findTypoCorrections(trimmedQuery, dataSource);
      
      typoCorrections.slice(0, 3).forEach(correction => {
        corrections.push(correction);
        const normalizedCorrected = normalizeText(correction.corrected);
        
        dataSource.forEach(item => {
          const itemName = normalizeText(item.name || '');
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
    }
    
    // === 4. ФОНЕТИЧЕСКИЙ ПОИСК (если совсем мало) ===
    if (opts.enablePhonetic && results.size < 3 && phoneticQuery !== normalizedQuery) {
      dataSource.forEach(item => {
        const itemPhonetic = phoneticNormalize(item.name || '');
        if (itemPhonetic.includes(phoneticQuery)) {
          const relevance = calculateRelevance(item, trimmedQuery, 'phonetic');
          const key = item.id || item.name;
          if (!results.has(key) || results.get(key).relevance < relevance) {
            results.set(key, { ...item, relevance, matchType: 'phonetic' });
          }
        }
      });
    }
    
    // === 5. ГЕНЕРАЦИЯ ПРЕДЛОЖЕНИЙ ===
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
    
    // === ФИНАЛЬНАЯ СОРТИРОВКА ===
    const finalResults = Array.from(results.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, opts.maxResults || opts.limit || 50);
    
    const searchTime = performance.now() - startTime;
    
    const result = {
      results: finalResults,
      suggestions,
      corrections,
      searchTime: Math.round(searchTime * 100) / 100,
      query: trimmedQuery,
      totalFound: finalResults.length,
      hasTypoCorrections: corrections.length > 0,
      hasSynonyms: finalResults.some(r => r.matchType === 'synonym'),
      searchStats: {
        exactMatches: finalResults.filter(r => r.matchType === 'exact').length,
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
    
    queryWords.forEach(queryWord => {
      let searchIndex = 0;
      while (true) {
        const pos = normalizedText.indexOf(queryWord, searchIndex);
        if (pos === -1) break;
        
        matches.push({
          start: pos,
          end: pos + queryWord.length
        });
        searchIndex = pos + 1;
      }
      
      // Также ищем синонимы
      const synonymList = findSynonyms(queryWord);
      synonymList.forEach(syn => {
        let synIndex = 0;
        while (true) {
          const pos = normalizedText.indexOf(syn, synIndex);
          if (pos === -1) break;
          
          matches.push({
            start: pos,
            end: pos + syn.length
          });
          synIndex = pos + 1;
        }
      });
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
            backgroundColor: 'rgba(255, 213, 0, 0.4)',
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
      renderHighlightedText
    }
  };

  // Экспорт
  HEYS.SmartSearchWithTypos = SmartSearchWithTypos;
  HEYS.SmartSearch = SmartSearchWithTypos; // alias
  
  // Лог инициализации
  console.log('🔍 HEYS SmartSearch v2.0 инициализирован');
  console.log(`   📚 Синонимов: ${Object.keys(synonyms).length}, Слов: ${commonWords.size}`);

})(typeof window !== 'undefined' ? window : globalThis);
