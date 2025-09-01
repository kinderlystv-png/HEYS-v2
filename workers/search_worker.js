// workers/search_worker.js - Специализированный Worker для поиска
(function () {
  'use strict';

  console.log('[Worker] Search Worker инициализирован');

  // Данные для поиска (будут переданы из основного потока)
  let searchData = [];
  let searchIndex = new Map();

  // Функция нормализации текста для поиска
  function normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^а-яё\w\s]/gi, '')
      .trim();
  }

  // Создание поискового индекса
  function buildSearchIndex(data) {
    console.log('[Search Worker] Создание поискового индекса для', data.length, 'записей');
    searchIndex.clear();

    data.forEach((item, index) => {
      const normalizedName = normalizeText(item.name || '');
      const words = normalizedName.split(/\s+/).filter((word) => word.length > 0);

      words.forEach((word) => {
        if (!searchIndex.has(word)) {
          searchIndex.set(word, []);
        }
        searchIndex.get(word).push(index);
      });

      // Также индексируем полное название
      if (normalizedName) {
        if (!searchIndex.has(normalizedName)) {
          searchIndex.set(normalizedName, []);
        }
        searchIndex.get(normalizedName).push(index);
      }
    });

    console.log('[Search Worker] Индекс создан, уникальных слов:', searchIndex.size);
  }

  // Быстрый поиск с использованием индекса
  function fastSearch(query, limit = 20) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return [];

    const results = new Set();
    const queryWords = normalizedQuery.split(/\s+/).filter((word) => word.length > 0);

    // Поиск по каждому слову запроса
    queryWords.forEach((word) => {
      // Точное совпадение
      if (searchIndex.has(word)) {
        searchIndex.get(word).forEach((index) => results.add(index));
      }

      // Поиск по началу слова
      for (const [indexedWord, indices] of searchIndex.entries()) {
        if (indexedWord.startsWith(word)) {
          indices.forEach((index) => results.add(index));
        }
      }
    });

    // Преобразуем индексы в объекты и сортируем по релевантности
    const resultItems = Array.from(results)
      .map((index) => ({
        ...searchData[index],
        relevance: calculateRelevance(searchData[index], normalizedQuery),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    return resultItems;
  }

  // Расчет релевантности результата
  function calculateRelevance(item, query) {
    const itemName = normalizeText(item.name || '');
    let relevance = 0;

    // Точное совпадение = максимальная релевантность
    if (itemName === query) {
      relevance += 100;
    }
    // Начинается с запроса
    else if (itemName.startsWith(query)) {
      relevance += 80;
    }
    // Содержит запрос
    else if (itemName.includes(query)) {
      relevance += 50;
    }

    // Бонус за популярность (если есть поле)
    if (item.popularity) {
      relevance += Math.min(item.popularity, 20);
    }

    // Бонус за краткость названия (более релевантны короткие названия)
    relevance += Math.max(0, 30 - itemName.length);

    return relevance;
  }

  // Фолбэк поиск (если индекс не работает)
  function fallbackSearch(query, limit = 20) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return [];

    return searchData
      .filter((item) => {
        const itemName = normalizeText(item.name || '');
        return itemName.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aName = normalizeText(a.name || '');
        const bName = normalizeText(b.name || '');
        const aRelevance = calculateRelevance(a, normalizedQuery);
        const bRelevance = calculateRelevance(b, normalizedQuery);
        return bRelevance - aRelevance;
      })
      .slice(0, limit);
  }

  // Обработчик сообщений от основного потока
  self.onmessage = function (e) {
    const { type, data, id } = e.data;

    try {
      let result;

      switch (type) {
        case 'init':
        case 'updateData':
          searchData = data.products || data || [];
          buildSearchIndex(searchData);
          result = { success: true, count: searchData.length };
          break;

        case 'search':
          const { query, limit = 20, useIndex = true } = data;
          const startTime = performance.now();

          if (useIndex && searchIndex.size > 0) {
            result = fastSearch(query, limit);
          } else {
            result = fallbackSearch(query, limit);
          }

          const duration = performance.now() - startTime;
          console.log(
            `[Search Worker] Поиск "${query}" завершен за ${duration.toFixed(1)}ms, найдено ${result.length} результатов`,
          );
          break;

        case 'clearCache':
          searchData = [];
          searchIndex.clear();
          result = { success: true };
          break;

        case 'getStats':
          result = {
            dataCount: searchData.length,
            indexSize: searchIndex.size,
            memoryUsage: JSON.stringify(searchData).length,
          };
          break;

        default:
          throw new Error(`Неизвестный тип задачи: ${type}`);
      }

      // Отправляем результат обратно
      self.postMessage({
        id: id,
        success: true,
        result: result,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('[Search Worker] Ошибка:', error);
      self.postMessage({
        id: id,
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  };

  // Уведомляем о готовности
  self.postMessage({
    type: 'ready',
    message: 'Search Worker готов к работе',
  });
})();
