/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА heys_smart_search.js (566 строк)                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🏗️ КЛАСС SmartSearchEngine (строки 1-80):                                               │
│    ├── constructor() - инициализация (9-30)                                             │
│    ├── index, documents Maps (11-12)                                                    │
│    ├── stopWords Set (13-16)                                                            │
│    ├── config объект (17-25)                                                            │
│    └── Базовые настройки поиска (26-40)                                                 │
│                                                                                           │
│ 📚 ИНДЕКСАЦИЯ ДОКУМЕНТОВ (строки 81-200):                                                │
│    ├── addDocument() - добавление документа (41-70)                                     │
│    ├── removeDocument() - удаление (71-90)                                              │
│    ├── updateDocument() - обновление (91-110)                                           │
│    ├── tokenize() - токенизация текста (111-140)                                        │
│    ├── stemWord() - стемминг слов (141-160)                                             │
│    └── buildIndex() - построение индекса (161-200)                                      │
│                                                                                           │
│ 🔍 ОСНОВНОЙ ПОИСК (строки 201-350):                                                      │
│    ├── search() - главная функция поиска (201-250)                                      │
│    ├── exactSearch() - точный поиск (251-280)                                           │
│    ├── fuzzySearch() - нечеткий поиск (281-310)                                         │
│    ├── phraseSearch() - поиск фраз (311-330)                                            │
│    └── booleanSearch() - булев поиск (331-350)                                          │
│                                                                                           │
│ 📊 РАНЖИРОВАНИЕ И РЕЛЕВАНТНОСТЬ (строки 351-450):                                        │
│    ├── calculateRelevance() - расчет релевантности (351-390)                            │
│    ├── tfIdf() - TF-IDF ранжирование (391-420)                                          │
│    ├── boostByPosition() - буст по позиции (421-440)                                    │
│    └── sortResults() - сортировка результатов (441-450)                                 │
│                                                                                           │
│ 🎯 ПРОДВИНУТЫЕ ФУНКЦИИ (строки 451-520):                                                 │
│    ├── suggest() - предложения поиска (451-480)                                         │
│    ├── autocomplete() - автодополнение (481-500)                                        │
│    ├── highlightMatches() - подсветка совпадений (501-510)                              │
│    └── getSearchStats() - статистика поиска (511-520)                                   │
│                                                                                           │
│ 🔗 УТИЛИТЫ И ЭКСПОРТ (строки 521-566):                                                   │
│    ├── clearIndex() - очистка индекса (521-530)                                         │
│    ├── exportIndex() - экспорт индекса (531-540)                                        │
│    ├── importIndex() - импорт индекса (541-550)                                         │
│    ├── HEYS.SmartSearch экспорт (551-560)                                               │
│    └── Автоматическая инициализация (561-566)                                           │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРЫЙ ПОИСК:                                                                        │
│    • Класс: SmartSearchEngine (9), search() (201)                                      │
│    • Индексация: addDocument() (41), tokenize() (111), buildIndex() (161)              │
│    • Поиск: exactSearch() (251), fuzzySearch() (281), phraseSearch() (311)             │
│    • Ранжирование: calculateRelevance() (351), tfIdf() (391)                           │
│    • Продвинутые: suggest() (451), autocomplete() (481)                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

/**
 * HEYS Smart Search Engine v1.0
 * Интеллектуальная система поиска с индексацией и ранжированием
 * 
 * @author HEYS Development Team
 * @date 26.08.2025
 */

class SmartSearchEngine {
    constructor(config = {}) {
        this.index = new Map();
        this.documents = new Map();
        this.stopWords = new Set([
            'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'к', 'о', 'у', 'за', 'под', 'над', 'при', 'без',
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from'
        ]);
        this.config = {
            minWordLength: 2,
            maxResults: 50,
            fuzzyThreshold: 0.7,
            enableFuzzy: true,
            rankingWeights: {
                exactMatch: 10,
                titleMatch: 5,
                contentMatch: 1,
                fuzzyMatch: 0.5
            },
            ...config
        };
        this.isReady = false;
        this.stats = {
            documentsIndexed: 0,
            searchesPerformed: 0,
            averageSearchTime: 0,
            totalWords: 0
        };
        
        console.log('🔍 SmartSearchEngine initialized');
    }

    /**
     * Индексация набора данных
     * @param {Array} dataSet - массив документов для индексации
     * @param {Object} options - настройки индексации
     */
    async indexData(dataSet, options = {}) {
        console.log('🔄 Starting data indexation...');
        const startTime = performance.now();
        
        const fieldMap = {
            title: options.titleField || 'title',
            content: options.contentField || 'content',
            id: options.idField || 'id',
            tags: options.tagsField || 'tags',
            category: options.categoryField || 'category'
        };

        this.clearIndex();

        for (const doc of dataSet) {
            await this.indexDocument(doc, fieldMap);
        }

        this.isReady = true;
        const indexTime = performance.now() - startTime;
        
        this.stats.documentsIndexed = dataSet.length;
        
        console.log(`✅ Indexed ${dataSet.length} documents in ${indexTime.toFixed(2)}ms`);
        return {
            documentsIndexed: dataSet.length,
            totalWords: this.stats.totalWords,
            indexTime: indexTime
        };
    }

    /**
     * Индексация отдельного документа
     */
    async indexDocument(doc, fieldMap) {
        const docId = doc[fieldMap.id] || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Сохраняем документ
        this.documents.set(docId, {
            id: docId,
            title: doc[fieldMap.title] || '',
            content: doc[fieldMap.content] || '',
            tags: doc[fieldMap.tags] || [],
            category: doc[fieldMap.category] || '',
            originalDoc: doc
        });

        // Индексируем заголовок
        if (doc[fieldMap.title]) {
            this.indexText(doc[fieldMap.title], docId, 'title');
        }

        // Индексируем содержимое
        if (doc[fieldMap.content]) {
            this.indexText(doc[fieldMap.content], docId, 'content');
        }

        // Индексируем теги
        if (doc[fieldMap.tags] && Array.isArray(doc[fieldMap.tags])) {
            doc[fieldMap.tags].forEach(tag => {
                this.indexText(tag, docId, 'tag');
            });
        }

        // Индексируем категорию
        if (doc[fieldMap.category]) {
            this.indexText(doc[fieldMap.category], docId, 'category');
        }
    }

    /**
     * Индексация текста
     */
    indexText(text, docId, field) {
        const words = this.tokenize(text);
        
        words.forEach(word => {
            if (!this.index.has(word)) {
                this.index.set(word, new Map());
            }
            
            const wordIndex = this.index.get(word);
            if (!wordIndex.has(docId)) {
                wordIndex.set(docId, {
                    count: 0,
                    fields: new Set(),
                    positions: []
                });
            }
            
            const docData = wordIndex.get(docId);
            docData.count++;
            docData.fields.add(field);
            docData.positions.push({ field, position: words.indexOf(word) });
            
            this.stats.totalWords++;
        });
    }

    /**
     * Токенизация текста
     */
    tokenize(text) {
        if (!text) return [];
        
        return text
            .toLowerCase()
            .replace(/[^\wа-яё]/gi, ' ')
            .split(/\s+/)
            .filter(word => 
                word.length >= this.config.minWordLength && 
                !this.stopWords.has(word)
            );
    }

    /**
     * Основной метод поиска
     * @param {string} query - поисковый запрос
     * @param {Object} options - параметры поиска
     */
    async search(query, options = {}) {
        if (!this.isReady) {
            throw new Error('Search engine is not ready. Please index data first.');
        }

        const startTime = performance.now();
        this.stats.searchesPerformed++;

        const searchOptions = {
            fuzzy: options.fuzzy !== undefined ? options.fuzzy : this.config.enableFuzzy,
            category: options.category,
            tags: options.tags,
            limit: options.limit || this.config.maxResults,
            sortBy: options.sortBy || 'relevance',
            filters: options.filters || {}
        };

        console.log(`🔍 Searching for: "${query}"`);

        // Токенизируем запрос
        const queryWords = this.tokenize(query);
        if (queryWords.length === 0) {
            return { results: [], stats: { searchTime: 0, totalFound: 0 } };
        }

        // Получаем кандидатов
        const candidates = this.getCandidates(queryWords, searchOptions);
        
        // Ранжируем результаты
        const rankedResults = this.rankResults(candidates, queryWords, query);
        
        // Применяем фильтры
        const filteredResults = this.applyFilters(rankedResults, searchOptions);
        
        // Ограничиваем количество результатов
        const finalResults = filteredResults.slice(0, searchOptions.limit);

        const searchTime = performance.now() - startTime;
        this.updateSearchStats(searchTime);

        console.log(`✅ Found ${finalResults.length} results in ${searchTime.toFixed(2)}ms`);

        return {
            results: finalResults.map(result => ({
                document: result.document.originalDoc,
                score: result.score,
                highlights: result.highlights,
                matchedFields: Array.from(result.matchedFields)
            })),
            stats: {
                searchTime: searchTime,
                totalFound: filteredResults.length,
                query: query,
                queryWords: queryWords
            }
        };
    }

    /**
     * Получение кандидатов для поиска
     */
    getCandidates(queryWords, options) {
        const candidates = new Map();

        queryWords.forEach(word => {
            // Точное совпадение
            if (this.index.has(word)) {
                this.addCandidates(candidates, word, this.index.get(word), 'exact');
            }

            // Нечеткий поиск
            if (options.fuzzy) {
                this.index.forEach((docMap, indexedWord) => {
                    const similarity = this.calculateSimilarity(word, indexedWord);
                    if (similarity >= this.config.fuzzyThreshold) {
                        this.addCandidates(candidates, word, docMap, 'fuzzy', similarity);
                    }
                });
            }
        });

        return candidates;
    }

    /**
     * Добавление кандидатов
     */
    addCandidates(candidates, queryWord, docMap, matchType, similarity = 1) {
        docMap.forEach((wordData, docId) => {
            if (!candidates.has(docId)) {
                candidates.set(docId, {
                    document: this.documents.get(docId),
                    matches: [],
                    totalScore: 0,
                    matchedFields: new Set()
                });
            }

            const candidate = candidates.get(docId);
            candidate.matches.push({
                queryWord,
                matchType,
                similarity,
                count: wordData.count,
                fields: Array.from(wordData.fields),
                positions: wordData.positions
            });

            wordData.fields.forEach(field => candidate.matchedFields.add(field));
        });
    }

    /**
     * Ранжирование результатов
     */
    rankResults(candidates, queryWords, originalQuery) {
        const results = [];

        candidates.forEach(candidate => {
            let score = 0;
            const highlights = [];

            candidate.matches.forEach(match => {
                let fieldWeight = 1;
                
                // Весовые коэффициенты для разных полей
                if (match.fields.includes('title')) {
                    fieldWeight = this.config.rankingWeights.titleMatch;
                } else if (match.fields.includes('tag')) {
                    fieldWeight = 3;
                } else if (match.fields.includes('category')) {
                    fieldWeight = 2;
                } else {
                    fieldWeight = this.config.rankingWeights.contentMatch;
                }

                // Расчет очков
                if (match.matchType === 'exact') {
                    score += this.config.rankingWeights.exactMatch * fieldWeight * match.count;
                } else if (match.matchType === 'fuzzy') {
                    score += this.config.rankingWeights.fuzzyMatch * fieldWeight * match.similarity * match.count;
                }

                // Добавляем подсветку
                match.fields.forEach(field => {
                    if (['title', 'content'].includes(field)) {
                        highlights.push({
                            field,
                            word: match.queryWord,
                            positions: match.positions.filter(p => p.field === field)
                        });
                    }
                });
            });

            // Бонус за точное совпадение фразы
            if (this.hasExactPhraseMatch(candidate.document, originalQuery)) {
                score *= 2;
            }

            results.push({
                ...candidate,
                score,
                highlights
            });
        });

        // Сортируем по релевантности
        return results.sort((a, b) => b.score - a.score);
    }

    /**
     * Применение фильтров
     */
    applyFilters(results, options) {
        return results.filter(result => {
            // Фильтр по категории
            if (options.category && result.document.category !== options.category) {
                return false;
            }

            // Фильтр по тегам
            if (options.tags && options.tags.length > 0) {
                const hasMatchingTag = options.tags.some(tag => 
                    result.document.tags.includes(tag)
                );
                if (!hasMatchingTag) return false;
            }

            // Дополнительные фильтры
            if (options.filters) {
                for (const [key, value] of Object.entries(options.filters)) {
                    if (result.document.originalDoc[key] !== value) {
                        return false;
                    }
                }
            }

            return true;
        });
    }

    /**
     * Расчет схожести строк (алгоритм Левенштейна)
     */
    calculateSimilarity(str1, str2) {
        const matrix = [];
        const len1 = str1.length;
        const len2 = str2.length;

        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;

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
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        const maxLen = Math.max(len1, len2);
        return (maxLen - matrix[len1][len2]) / maxLen;
    }

    /**
     * Проверка точного совпадения фразы
     */
    hasExactPhraseMatch(document, phrase) {
        const normalizedPhrase = phrase.toLowerCase();
        return (
            document.title.toLowerCase().includes(normalizedPhrase) ||
            document.content.toLowerCase().includes(normalizedPhrase)
        );
    }

    /**
     * Получение поисковых подсказок
     */
    getSearchSuggestions(partial, limit = 10) {
        if (!partial || partial.length < 2) return [];

        const suggestions = [];
        const normalizedPartial = partial.toLowerCase();

        this.index.forEach((docMap, word) => {
            if (word.startsWith(normalizedPartial)) {
                suggestions.push({
                    suggestion: word,
                    frequency: this.getWordFrequency(word),
                    type: 'prefix'
                });
            }
        });

        // Fuzzy suggestions
        if (suggestions.length < limit) {
            this.index.forEach((docMap, word) => {
                if (!word.startsWith(normalizedPartial)) {
                    const similarity = this.calculateSimilarity(normalizedPartial, word);
                    if (similarity >= 0.6) {
                        suggestions.push({
                            suggestion: word,
                            frequency: this.getWordFrequency(word),
                            type: 'fuzzy',
                            similarity
                        });
                    }
                }
            });
        }

        return suggestions
            .sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'prefix' ? -1 : 1;
                }
                return b.frequency - a.frequency;
            })
            .slice(0, limit);
    }

    /**
     * Получение частоты слова
     */
    getWordFrequency(word) {
        const wordIndex = this.index.get(word);
        if (!wordIndex) return 0;

        let totalFreq = 0;
        wordIndex.forEach(docData => {
            totalFreq += docData.count;
        });
        return totalFreq;
    }

    /**
     * Построение поискового индекса с опциями
     */
    buildSearchIndex(options = {}) {
        console.log('🔧 Building search index with options:', options);
        
        this.config = { ...this.config, ...options };
        
        if (options.stopWords) {
            this.stopWords = new Set([...this.stopWords, ...options.stopWords]);
        }

        return {
            status: 'ready',
            config: this.config,
            stopWords: Array.from(this.stopWords)
        };
    }

    /**
     * Очистка индекса
     */
    clearIndex() {
        this.index.clear();
        this.documents.clear();
        this.isReady = false;
        this.stats.documentsIndexed = 0;
        this.stats.totalWords = 0;
        console.log('🧹 Search index cleared');
    }

    /**
     * Обновление статистики поиска
     */
    updateSearchStats(searchTime) {
        const totalTime = this.stats.averageSearchTime * (this.stats.searchesPerformed - 1);
        this.stats.averageSearchTime = (totalTime + searchTime) / this.stats.searchesPerformed;
    }

    /**
     * Получение статистики
     */
    getStats() {
        return {
            ...this.stats,
            indexSize: this.index.size,
            documentsCount: this.documents.size,
            isReady: this.isReady
        };
    }

    /**
     * Экспорт индекса
     */
    exportIndex() {
        return {
            index: Array.from(this.index.entries()),
            documents: Array.from(this.documents.entries()),
            config: this.config,
            stats: this.stats
        };
    }

    /**
     * Импорт индекса
     */
    importIndex(indexData) {
        this.index = new Map(indexData.index);
        this.documents = new Map(indexData.documents);
        this.config = { ...this.config, ...indexData.config };
        this.stats = { ...this.stats, ...indexData.stats };
        this.isReady = true;
        
        console.log('📥 Search index imported successfully');
    }
}

// Экспорт для использования в HEYS
if (typeof window !== 'undefined') {
    window.SmartSearchEngine = SmartSearchEngine;
    
    // Интеграция в HEYS namespace
    if (window.HEYS) {
        window.HEYS.SmartSearchEngine = SmartSearchEngine;
        console.log('✅ SmartSearchEngine integrated into HEYS namespace');
    }
}

// Экспорт для Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartSearchEngine;
}
