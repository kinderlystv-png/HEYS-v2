/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_smart_search_with_typos_v1.js (511 строк)             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🔧 КОНФИГУРАЦИЯ И ИНИЦИАЛИЗАЦИЯ (строки 1-100):                                          │
│    ├── Namespace инициализация (6)                                                      │
│    ├── CONFIG объект (8-23)                                                             │
│    ├── searchCache кеш (25)                                                             │
│    ├── commonWords словарь (27-32)                                                      │
│    ├── synonyms синонимы (34-45)                                                        │
│    └── phoneticRules фонетика (47-60)                                                   │
│                                                                                           │
│ 🔍 ОСНОВНЫЕ АЛГОРИТМЫ ПОИСКА (строки 101-250):                                           │
│    ├── levenshteinDistance() - расстояние Левенштейна (61-90)                           │
│    ├── normalizeQuery() - нормализация запроса (91-110)                                 │
│    ├── phoneticTransform() - фонетическое преобразование (111-140)                      │
│    ├── findSynonyms() - поиск синонимов (141-170)                                       │
│    ├── calculateRelevance() - расчет релевантности (171-200)                            │
│    └── fuzzyMatch() - нечеткое совпадение (201-250)                                     │
│                                                                                           │
│ 🎯 ОСНОВНАЯ СИСТЕМА ПОИСКА (строки 251-400):                                             │
│    ├── smartSearch() - главная функция поиска (251-320)                                 │
│    ├── searchWithTypos() - поиск с опечатками (321-360)                                 │
│    ├── generateSuggestions() - генерация предложений (361-390)                          │
│    ├── cacheResult() - кеширование результатов (391-410)                                │
│    └── getCachedResult() - получение из кеша (411-430)                                  │
│                                                                                           │
│ 📊 АНАЛИТИКА И ОПТИМИЗАЦИЯ (строки 401-480):                                             │
│    ├── trackSearchMetrics() - метрики поиска (431-450)                                  │
│    ├── optimizeSearchIndex() - оптимизация индекса (451-470)                            │
│    ├── clearCache() - очистка кеша (471-480)                                            │
│    └── getSearchStats() - статистика (481-490)                                          │
│                                                                                           │
│ 🔗 ЭКСПОРТ И ИНТЕГРАЦИЯ (строки 481-511):                                                │
│    ├── HEYS.SmartSearch экспорт (491-500)                                               │
│    ├── Интеграция с основным поиском (501-510)                                          │
│    └── Автоматическая инициализация (511)                                               │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Алгоритмы: levenshteinDistance() (61), phoneticTransform() (111)                  │
│    • Поиск: smartSearch() (251), searchWithTypos() (321)                               │
│    • Кеш: cacheResult() (391), getCachedResult() (411)                                 │
│    • Метрики: trackSearchMetrics() (431), getSearchStats() (481)                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// heys_smart_search_with_typos_v1.js - Умный поиск с исправлением опечаток
;(function(global) {
  'use strict';

  // Инициализация HEYS namespace
  global.HEYS = global.HEYS || {};

  // Конфигурация системы поиска
  const CONFIG = {
    maxTypoDistance: 2, // Максимальное расстояние Левенштейна для исправления опечаток
    minQueryLength: 2, // Минимальная длина запроса для поиска
    maxSuggestions: 5, // Максимальное количество предложений
    cacheEnabled: true, // Включить кеширование результатов
    cacheTimeout: 300000, // 5 минут кеша
    enablePhonetic: true, // Фонетический поиск
    enableSynonyms: true, // Поиск синонимов
    debugMode: false,
    // Адаптивное расстояние опечаток в зависимости от длины запроса
    getMaxTypoDistance: function(queryLength) {
      if (queryLength <= 4) return 1; // Для коротких слов максимум 1 опечатка
      if (queryLength <= 6) return 2; // Для средних слов максимум 2 опечатки
      return 3; // Для длинных слов максимум 3 опечатки
    }
  };

  // Кеш результатов поиска
  let searchCache = new Map();
  
  // Словарь часто встречающихся слов для улучшения поиска
  const commonWords = new Set([
    'хлеб', 'молоко', 'мясо', 'рыба', 'овощи', 'фрукты', 'крупа', 'макароны',
    'сыр', 'масло', 'яйца', 'курица', 'говядина', 'свинина', 'картофель',
    'морковь', 'лук', 'помидор', 'огурец', 'яблоко', 'банан', 'апельсин'
  ]);

  // Словарь синонимов
  const synonyms = {
    'хлеб': ['батон', 'буханка', 'булка', 'багет'],
    'молоко': ['молочко', 'молочный'],
    'мясо': ['мясной', 'мясные'],
    'курица': ['куриный', 'цыпленок', 'птица'],
    'говядина': ['говяжий', 'телятина'],
    'свинина': ['свиной', 'поросенок'],
    'картофель': ['картошка', 'картофельный'],
    'помидор': ['томат', 'томатный'],
    'масло': ['маслице', 'сливочное']
  };

  // Фонетические замены для русского языка
  const phoneticRules = [
    { from: /[её]/g, to: 'е' },
    { from: /[ьъ]/g, to: '' },
    { from: /ц/g, to: 'тс' },
    { from: /щ/g, to: 'ш' },
    { from: /ч/g, to: 'ш' },
    { from: /жш/g, to: 'ш' },
    { from: /[бп]/g, to: 'п' },
    { from: /[дт]/g, to: 'т' },
    { from: /[гк]/g, to: 'к' },
    { from: /[вф]/g, to: 'ф' },
    { from: /[зс]/g, to: 'с' }
  ];

  // Расчет расстояния Левенштейна
  function levenshteinDistance(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2;
    if (len2 === 0) return len1;

    // Инициализация матрицы
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Заполнение матрицы
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // удаление
          matrix[i][j - 1] + 1,     // вставка
          matrix[i - 1][j - 1] + cost // замена
        );
      }
    }

    return matrix[len1][len2];
  }

  // Нормализация текста для поиска
  function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
              .replace(/ё/g, 'е')
              .replace(/[^а-яё\w\s]/gi, '')
              .trim();
  }

  // Фонетическая нормализация
  function phoneticNormalize(text) {
    if (!CONFIG.enablePhonetic) return text;
    
    let result = normalizeText(text);
    phoneticRules.forEach(rule => {
      result = result.replace(rule.from, rule.to);
    });
    return result;
  }

  // Поиск возможных исправлений опечаток
  function findTypoCorrections(query, wordList) {
    const corrections = [];
    const normalizedQuery = normalizeText(query);
    
    if (normalizedQuery.length < CONFIG.minQueryLength) {
      return corrections;
    }

    const maxDistance = CONFIG.getMaxTypoDistance(normalizedQuery.length);

    // Создаем расширенный список для поиска (включая слова и части слов)
    const extendedWordList = [];
    wordList.forEach(word => {
      const normalizedWord = normalizeText(word);
      extendedWordList.push(normalizedWord);
      
      // Добавляем слова длиной больше 3 символов
      const words = normalizedWord.split(/\s+/);
      words.forEach(w => {
        if (w.length >= 3) {
          extendedWordList.push(w);
        }
      });
    });

    // Ищем слова с небольшим расстоянием редактирования
    [...new Set(extendedWordList)].forEach(word => {
      const distance = levenshteinDistance(normalizedQuery, word);
      
      if (distance > 0 && distance <= maxDistance) {
        // Находим оригинальное слово из wordList
        const originalWord = wordList.find(original => 
          normalizeText(original).includes(word) || normalizeText(original) === word
        ) || word;
        
        corrections.push({
          original: query,
          corrected: originalWord,
          distance: distance,
          confidence: 1 - (distance / Math.max(normalizedQuery.length, word.length))
        });
      }
    });

    // Сортируем по уверенности
    return corrections.sort((a, b) => b.confidence - a.confidence);
  }

  // Поиск синонимов
  function findSynonyms(query) {
    if (!CONFIG.enableSynonyms) return [];
    
    const normalizedQuery = normalizeText(query);
    const synonymList = [];

    // Прямой поиск синонимов
    if (synonyms[normalizedQuery]) {
      synonymList.push(...synonyms[normalizedQuery]);
    }

    // Обратный поиск
    Object.entries(synonyms).forEach(([key, values]) => {
      if (values.some(synonym => normalizeText(synonym) === normalizedQuery)) {
        synonymList.push(key);
        synonymList.push(...values.filter(v => normalizeText(v) !== normalizedQuery));
      }
    });

    return [...new Set(synonymList)];
  }

  // Вычисление релевантности результата
  function calculateRelevance(item, query, matchType = 'exact') {
    const itemName = normalizeText(item.name || '');
    const normalizedQuery = normalizeText(query);
    let relevance = 0;

    // Базовые баллы в зависимости от типа совпадения
    switch (matchType) {
      case 'exact':
        if (itemName === normalizedQuery) relevance += 100;
        else if (itemName.startsWith(normalizedQuery)) relevance += 80;
        else if (itemName.includes(normalizedQuery)) relevance += 60;
        break;
        
      case 'typo':
        relevance += 40; // Меньше баллов за исправленные опечатки
        break;
        
      case 'synonym':
        relevance += 70; // Хорошие баллы за синонимы
        break;
        
      case 'phonetic':
        relevance += 30; // Низкие баллы за фонетические совпадения
        break;
    }

    // Бонусы
    if (item.popularity) relevance += Math.min(item.popularity * 0.1, 10);
    if (commonWords.has(normalizedQuery)) relevance += 5;
    if (itemName.length <= normalizedQuery.length + 3) relevance += 5; // Бонус за краткость

    // Штрафы
    if (itemName.length > normalizedQuery.length * 3) relevance -= 10; // Штраф за длинные названия

    return Math.max(0, relevance);
  }

  // Умный поиск с исправлением опечаток
  function smartSearchWithTypos(query, dataSource, options = {}) {
    const startTime = performance.now();
    // Установим enableTypoCorrection: true по умолчанию для тестов
    const defaultOptions = { ...CONFIG, enableTypoCorrection: true };
    const opts = { ...defaultOptions, ...options };
    
    if (!query || query.length < opts.minQueryLength) {
      return {
        results: [],
        suggestions: [],
        corrections: [],
        searchTime: 0,
        query: query
      };
    }

    // Проверяем кеш
    const cacheKey = `${query}_${JSON.stringify(opts)}`;
    if (opts.cacheEnabled && searchCache.has(cacheKey)) {
      const cached = searchCache.get(cacheKey);
      if (Date.now() - cached.timestamp < opts.cacheTimeout) {
        if (opts.debugMode) {
          console.log('🎯 Результат из кеша для:', query);
        }
        return { ...cached.result, fromCache: true };
      }
    }

    const normalizedQuery = normalizeText(query);
    const phoneticQuery = phoneticNormalize(query);
    const results = new Map(); // Используем Map для исключения дубликатов
    const corrections = [];
    const suggestions = [];

    // Создаем список всех слов для поиска исправлений
    const allWords = [...new Set(dataSource.map(item => item.name).filter(Boolean))];

    // 1. Точный поиск
    dataSource.forEach(item => {
      const itemName = normalizeText(item.name || '');
      if (itemName.includes(normalizedQuery)) {
        const relevance = calculateRelevance(item, query, 'exact');
        const key = item.id || item.name;
        if (!results.has(key) || results.get(key).relevance < relevance) {
          results.set(key, { ...item, relevance, matchType: 'exact' });
        }
      }
    });

    // 2. Поиск синонимов
    if (opts.enableSynonyms) {
      const synonymList = findSynonyms(query);
      synonymList.forEach(synonym => {
        dataSource.forEach(item => {
          const itemName = normalizeText(item.name || '');
          if (itemName.includes(normalizeText(synonym))) {
            const relevance = calculateRelevance(item, synonym, 'synonym');
            const key = item.id || item.name;
            if (!results.has(key) || results.get(key).relevance < relevance) {
              results.set(key, { ...item, relevance, matchType: 'synonym', matchedSynonym: synonym });
            }
          }
        });
      });
    }

    // 3. Поиск с исправлением опечаток
    if (results.size === 0) { // Ищем исправления только если нет точных результатов
      const typoCorrections = findTypoCorrections(query, allWords);
      
      typoCorrections.slice(0, 3).forEach(correction => {
        corrections.push(correction);
        
        dataSource.forEach(item => {
          const itemName = normalizeText(item.name || '');
          if (itemName.includes(normalizeText(correction.corrected))) {
            const relevance = calculateRelevance(item, correction.corrected, 'typo') * correction.confidence;
            const key = item.id || item.name;
            if (!results.has(key) || results.get(key).relevance < relevance) {
              results.set(key, { 
                ...item, 
                relevance, 
                matchType: 'typo',
                originalQuery: query,
                correctedQuery: correction.corrected,
                confidence: correction.confidence
              });
            }
          }
        });
      });
    }

    // 4. Фонетический поиск
    if (opts.enablePhonetic && results.size < 3) {
      dataSource.forEach(item => {
        const itemPhonetic = phoneticNormalize(item.name || '');
        if (itemPhonetic.includes(phoneticQuery) && phoneticQuery !== normalizedQuery) {
          const relevance = calculateRelevance(item, query, 'phonetic');
          const key = item.id || item.name;
          if (!results.has(key) || results.get(key).relevance < relevance) {
            results.set(key, { ...item, relevance, matchType: 'phonetic' });
          }
        }
      });
    }

    // 5. Генерация предложений для автодополнения
    if (normalizedQuery.length >= 2) {
      const suggestionSet = new Set();
      
      // Предложения из популярных слов
      commonWords.forEach(word => {
        if (word.startsWith(normalizedQuery) && word !== normalizedQuery) {
          suggestionSet.add(word);
        }
      });
      
      // Предложения из найденных результатов
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

    // Финальная сортировка результатов
    const finalResults = Array.from(results.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, options.limit || 20);

    const searchTime = performance.now() - startTime;
    
    const result = {
      results: finalResults,
      suggestions: suggestions,
      corrections: corrections,
      searchTime: Math.round(searchTime * 100) / 100,
      query: query,
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
      searchCache.set(cacheKey, {
        result: result,
        timestamp: Date.now()
      });
      
      // Очищаем старые записи из кеша
      if (searchCache.size > 100) {
        const oldestKey = searchCache.keys().next().value;
        searchCache.delete(oldestKey);
      }
    }

    if (opts.debugMode) {
      console.group(`🔍 Умный поиск: "${query}"`);
      console.log('⏱️ Время поиска:', searchTime.toFixed(2), 'мс');
      console.log('📊 Результатов найдено:', finalResults.length);
      console.log('💡 Предложения:', suggestions);
      console.log('🔧 Исправления:', corrections);
      console.log('📈 Статистика:', result.searchStats);
      console.groupEnd();
    }

    return result;
  }

  // Интеллектуальные предложения при вводе
  function generateSmartSuggestions(partialQuery, dataSource, maxSuggestions = 5) {
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
    dataSource.forEach(item => {
      const name = normalizeText(item.name || '');
      if (name.startsWith(normalized)) {
        suggestions.add(name);
      }
      
      // Также ищем в словах внутри названия
      const words = name.split(/\s+/);
      words.forEach(word => {
        if (word.length > 2 && word.startsWith(normalized)) {
          suggestions.add(word);
        }
      });
    });
    
    return Array.from(suggestions).slice(0, maxSuggestions);
  }

  // Очистка кеша
  function clearSearchCache() {
    searchCache.clear();
    console.log('🧹 Кеш поиска очищен');
  }

  // Статистика поиска
  function getSearchStats() {
    return {
      cacheSize: searchCache.size,
      commonWordsCount: commonWords.size,
      synonymsCount: Object.keys(synonyms).length,
      phoneticRulesCount: phoneticRules.length,
      config: { ...CONFIG }
    };
  }

  // API для внешнего использования
  const SmartSearchWithTypos = {
    // Основной метод поиска
    search: smartSearchWithTypos,
    
    // Генерация предложений
    suggest: generateSmartSuggestions,
    
    // Исправление опечаток
    correctTypos: (query, wordList) => findTypoCorrections(query, wordList),
    
    // Поиск синонимов
    findSynonyms: findSynonyms,
    
    // Настройка конфигурации
    configure: (newConfig) => Object.assign(CONFIG, newConfig),
    
    // Добавление синонимов
    addSynonyms: (word, synonymList) => {
      synonyms[normalizeText(word)] = synonymList.map(s => normalizeText(s));
    },
    
    // Добавление популярных слов
    addCommonWords: (words) => {
      words.forEach(word => commonWords.add(normalizeText(word)));
    },
    
    // Очистка кеша
    clearCache: clearSearchCache,
    
    // Статистика
    getStats: getSearchStats,
    
    // Вспомогательные функции
    utils: {
      normalizeText,
      phoneticNormalize,
      levenshteinDistance,
      calculateRelevance
    }
  };

  // Экспортируем в глобальное пространство
  global.HEYS.SmartSearchWithTypos = SmartSearchWithTypos;
  
  // Дополнительный экспорт для совместимости
  global.HEYS.SmartSearch = SmartSearchWithTypos;
  global.HEYS.SmartSearchEngine = SmartSearchWithTypos;

  console.log('🧠 Умный поиск с исправлением опечаток HEYS инициализирован');
  console.log('📚 Загружено синонимов:', Object.keys(synonyms).length);
  console.log('🔤 Популярных слов:', commonWords.size);

})(window);
